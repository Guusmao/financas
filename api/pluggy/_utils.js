import { createClient } from '@supabase/supabase-js';

const CATEGORY_MAP = {
  'Alimentação': 'Mercado',
  'Supermercado': 'Mercado',
  'Restaurante': 'Lazer',
  'Cafeteria': 'Lazer',
  'Transporte': 'Transporte',
  'Táxi': 'Transporte',
  'Ônibus': 'Transporte',
  'Combustível': 'Abastecimento',
  'Gasolina': 'Abastecimento',
  'Moradia': 'Moradia',
  'Aluguel': 'Moradia',
  'Condomínio': 'Moradia',
  'Educação': 'Educação',
  'Faculdade': 'Faculdade',
  'Saúde': 'Saúde',
  'Farmácia': 'Saúde',
  'Hospital': 'Saúde',
  'Médico': 'Saúde',
  'Internet': 'Internet',
  'Telefone': 'TIM',
  'Streaming': 'Internet',
  'Assinatura': 'Internet',
  'Seguro': 'Seguro',
  'Salário': 'Salário',
  'Rendimentos': 'Salário',
  'Freelance': 'Salário',
  'Lazer': 'Lazer',
  'Cinema': 'Lazer',
  'Jogo': 'Lazer',
  'Esporte': 'Lazer',
  'Transferência': 'Outros',
  'Transferências': 'Outros',
  'TED': 'Outros',
  'DOC': 'Outros',
  'PIX': 'Outros',
};

let pluggyApiKeyCache = null;
let pluggyApiKeyExpiry = null;

export function supabaseAdmin() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }

  return createClient(supabaseUrl, serviceRoleKey);
}

export async function getUserFromRequest(req) {
  const authHeader = req.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '');

  if (!token) return null;

  try {
    const admin = supabaseAdmin();
    const { data: { user }, error } = await admin.auth.getUser(token);

    if (error || !user) return null;
    return user;
  } catch (err) {
    console.error('Error validating token:', err);
    return null;
  }
}

export async function getPluggyApiKey() {
  const now = Date.now();

  if (pluggyApiKeyCache && pluggyApiKeyExpiry && now < pluggyApiKeyExpiry) {
    return pluggyApiKeyCache;
  }

  const clientId = process.env.PLUGGY_CLIENT_ID;
  const clientSecret = process.env.PLUGGY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('Missing PLUGGY_CLIENT_ID or PLUGGY_CLIENT_SECRET');
  }

  const res = await fetch('https://api.pluggy.ai/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId, clientSecret }),
  });

  if (!res.ok) {
    throw new Error(`Pluggy auth failed: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  pluggyApiKeyCache = data.apiKey;
  pluggyApiKeyExpiry = now + (90 * 60 * 1000); // cache por 90 minutos

  return pluggyApiKeyCache;
}

export function mapCategory(pluggyCategory) {
  if (!pluggyCategory) return 'Outros';
  return CATEGORY_MAP[pluggyCategory] || 'Outros';
}

export function isInternalTransfer(transaction) {
  if (!transaction) return false;

  if (transaction.type === 'TRANSFER') return true;

  const desc = (transaction.description || '').toUpperCase();
  const cat = (transaction.category || '').toUpperCase();

  const isTransferKeyword =
    desc.includes('TRANSFERÊNCIA') ||
    desc.includes('TED') ||
    desc.includes('DOC') ||
    (desc.includes('PIX') && (cat.includes('TRANSFERÊNCIA') || cat.includes('TRANSFERÊNCIAS')));

  return isTransferKeyword;
}

export async function syncItem(itemId, { sinceDate } = {}) {
  const apiKey = await getPluggyApiKey();
  const admin = supabaseAdmin();

  // Busca o user_id vinculado ao item
  const { data: pluggyItem, error: itemError } = await admin
    .from('pluggy_items')
    .select('user_id')
    .eq('item_id', itemId)
    .single();

  if (itemError || !pluggyItem) {
    throw new Error(`Item ${itemId} not found in pluggy_items`);
  }

  const userId = pluggyItem.user_id;

  // Busca as contas do item
  const accountsRes = await fetch(
    `https://api.pluggy.ai/accounts?itemId=${itemId}`,
    { headers: { 'X-API-Key': apiKey } }
  );

  if (!accountsRes.ok) {
    throw new Error(`Failed to fetch accounts: ${accountsRes.statusText}`);
  }

  const { results: accounts } = await accountsRes.json();

  let totalInserted = 0;

  // Para cada conta, busca as transações
  for (const account of accounts) {
    let cursor = null;
    let hasMore = true;

    while (hasMore) {
      const queryParams = new URLSearchParams({
        accountId: account.id,
        pageSize: 500,
      });

      if (sinceDate) {
        queryParams.append('from', sinceDate);
      }

      if (cursor) {
        queryParams.append('cursor', cursor);
      }

      const txRes = await fetch(
        `https://api.pluggy.ai/transactions?${queryParams}`,
        { headers: { 'X-API-Key': apiKey } }
      );

      if (!txRes.ok) {
        console.error(`Failed to fetch transactions for account ${account.id}:`, txRes.statusText);
        hasMore = false;
        break;
      }

      const { results: transactions, nextCursor } = await txRes.json();

      // Processa cada transação
      for (const tx of transactions) {
        const entryData = {
          user_id: userId,
          date: tx.date.split('T')[0],
          type: tx.type === 'CREDIT' ? 'Entrada' : 'Saída',
          category: mapCategory(tx.category),
          description: tx.description,
          payment: account.type === 'CREDIT' ? 'Crédito' : 'Débito',
          amount: Math.abs(tx.amount),
          paid: true,
          note: `Pluggy: ${tx.category || 'sem categoria'} — ${account.name}`,
          is_internal_transfer: isInternalTransfer(tx),
          external_id: tx.id,
          pluggy_item_id: itemId,
          source: 'pluggy',
        };

        const { error: upsertError, data: upserted } = await admin
          .from('entries')
          .upsert(entryData, {
            onConflict: 'user_id,external_id',
            ignoreDuplicates: true,
          })
          .select();

        if (!upsertError && upserted && upserted.length > 0) {
          totalInserted += 1;
        }
      }

      cursor = nextCursor;
      hasMore = !!nextCursor;
    }
  }

  // Atualiza last_synced_at em pluggy_items
  await admin
    .from('pluggy_items')
    .update({
      last_synced_at: new Date().toISOString(),
      status: 'synced',
    })
    .eq('item_id', itemId);

  return totalInserted;
}
