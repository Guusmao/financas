import { supabaseAdmin, getPluggyApiKey, syncItem } from './_utils.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Valida o secret via query string
    const secret = req.query.secret || '';
    const webhookSecret = process.env.PLUGGY_WEBHOOK_SECRET;

    if (!webhookSecret || secret !== webhookSecret) {
      return res.status(401).json({ error: 'Invalid secret' });
    }

    const { itemId, event } = req.body || {};

    if (!itemId) {
      return res.status(400).json({ error: 'Missing itemId' });
    }

    console.log(`[Pluggy Webhook] Received ${event} for item ${itemId}`);

    const admin = supabaseAdmin();

    // Verifica se o item já existe
    const { data: existingItem } = await admin
      .from('pluggy_items')
      .select('id')
      .eq('item_id', itemId)
      .single();

    if (!existingItem) {
      console.log(`[Pluggy Webhook] Item ${itemId} not found, registering...`);

      // Busca detalhes do item na Pluggy
      const apiKey = await getPluggyApiKey();
      const itemRes = await fetch(`https://api.pluggy.ai/items/${itemId}`, {
        headers: { 'X-API-Key': apiKey },
      });

      if (!itemRes.ok) {
        console.error(`[Pluggy Webhook] Failed to fetch item details: ${itemRes.statusText}`);
        return res.status(200).json({ status: 'logged' }); // responde 200 mesmo assim
      }

      const itemData = await itemRes.json();
      const connectorName = itemData.connector?.name || 'Unknown';

      // Insere em pluggy_items
      const appOwnerUserId = process.env.APP_OWNER_USER_ID;
      if (!appOwnerUserId) {
        console.error('[Pluggy Webhook] Missing APP_OWNER_USER_ID');
        return res.status(200).json({ status: 'logged' });
      }

      const { error: insertError } = await admin
        .from('pluggy_items')
        .insert({
          user_id: appOwnerUserId,
          item_id: itemId,
          connector_name: connectorName,
          status: 'syncing',
        });

      if (insertError) {
        console.error('[Pluggy Webhook] Error inserting item:', insertError);
        return res.status(200).json({ status: 'logged' });
      }
    }

    // Sincroniza as transações do item
    const syncedCount = await syncItem(itemId);
    console.log(`[Pluggy Webhook] Synced ${syncedCount} transactions for item ${itemId}`);

    return res.status(200).json({
      status: 'ok',
      itemId,
      synced: syncedCount,
    });
  } catch (err) {
    console.error('[Pluggy Webhook] Error:', err);
    // responde 200 mesmo com erro, pra não retentar indefinidamente
    return res.status(200).json({ status: 'error', error: err.message });
  }
}
