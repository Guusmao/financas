import { supabaseAdmin, getPluggyApiKey, syncItem } from './_utils.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Valida header X-Setup-Secret
    const setupSecret = req.headers['x-setup-secret'] || '';
    const expectedSecret = process.env.SETUP_SECRET;

    if (!expectedSecret || setupSecret !== expectedSecret) {
      return res.status(401).json({ error: 'Unauthorized: invalid setup secret' });
    }

    const admin = supabaseAdmin();
    const apiKey = await getPluggyApiKey();
    const appOwnerUserId = process.env.APP_OWNER_USER_ID;
    const pluggySyncFromDate = process.env.PLUGGY_SYNC_FROM_DATE;

    if (!appOwnerUserId) {
      return res.status(400).json({ error: 'Missing APP_OWNER_USER_ID' });
    }

    console.log('[Bootstrap] Fetching all items from Pluggy...');

    // Busca todos os items
    const itemsRes = await fetch('https://api.pluggy.ai/items', {
      headers: { 'X-API-Key': apiKey },
    });

    if (!itemsRes.ok) {
      return res.status(itemsRes.status).json({
        error: `Failed to fetch items: ${itemsRes.statusText}`,
      });
    }

    const { results: items } = await itemsRes.json();
    console.log(`[Bootstrap] Found ${items.length} items`);

    const summary = {
      itemsFound: items.length,
      itemsRegistered: 0,
      transactionsSynced: 0,
      internalTransfers: 0,
    };

    // Para cada item, insere em pluggy_items e sincroniza
    for (const item of items) {
      const itemId = item.id;

      // Verifica se já existe
      const { data: existing } = await admin
        .from('pluggy_items')
        .select('id')
        .eq('item_id', itemId)
        .single();

      if (!existing) {
        const connectorName = item.connector?.name || 'Unknown';
        const { error: insertError } = await admin
          .from('pluggy_items')
          .insert({
            user_id: appOwnerUserId,
            item_id: itemId,
            connector_name: connectorName,
            status: 'syncing',
          });

        if (insertError) {
          console.error(`[Bootstrap] Error inserting item ${itemId}:`, insertError);
          continue;
        }

        summary.itemsRegistered += 1;
        console.log(`[Bootstrap] Registered item ${itemId} (${connectorName})`);
      }

      // Sincroniza o item
      try {
        const syncedCount = await syncItem(itemId, {
          sinceDate: pluggySyncFromDate,
        });

        summary.transactionsSynced += syncedCount;
        console.log(`[Bootstrap] Synced ${syncedCount} transactions for item ${itemId}`);

        // Conta transferências internas (aproximado — pega de entries recém-inseridas)
        const { data: recentEntries } = await admin
          .from('entries')
          .select('id')
          .eq('pluggy_item_id', itemId)
          .eq('is_internal_transfer', true);

        if (recentEntries) {
          summary.internalTransfers += recentEntries.length;
        }
      } catch (syncErr) {
        console.error(`[Bootstrap] Error syncing item ${itemId}:`, syncErr);
      }
    }

    console.log('[Bootstrap] Complete:', summary);

    return res.status(200).json({
      status: 'ok',
      summary,
    });
  } catch (err) {
    console.error('[Bootstrap] Error:', err);
    return res.status(500).json({ error: err.message });
  }
}
