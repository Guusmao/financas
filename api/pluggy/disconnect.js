import { supabaseAdmin, getUserFromRequest, getPluggyApiKey } from './_utils.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Valida autenticação do usuário
    const user = await getUserFromRequest(req);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { itemId } = req.body || {};
    if (!itemId) {
      return res.status(400).json({ error: 'Missing itemId' });
    }

    const admin = supabaseAdmin();

    // Verifica se o item pertence ao usuário
    const { data: pluggyItem, error: queryError } = await admin
      .from('pluggy_items')
      .select('user_id')
      .eq('item_id', itemId)
      .single();

    if (queryError || !pluggyItem) {
      return res.status(404).json({ error: 'Item not found' });
    }

    if (pluggyItem.user_id !== user.id) {
      return res.status(403).json({ error: 'Forbidden: item does not belong to you' });
    }

    // Desconecta da Pluggy
    try {
      const apiKey = await getPluggyApiKey();
      const deleteRes = await fetch(`https://api.pluggy.ai/items/${itemId}`, {
        method: 'DELETE',
        headers: { 'X-API-Key': apiKey },
      });

      if (!deleteRes.ok) {
        console.error(`Failed to disconnect from Pluggy: ${deleteRes.statusText}`);
        // continua mesmo assim, pra remover do DB local
      }
    } catch (err) {
      console.error('Error disconnecting from Pluggy:', err);
    }

    // Remove de pluggy_items (RLS já garante que pertence ao usuário)
    const { error: deleteError } = await admin
      .from('pluggy_items')
      .delete()
      .eq('item_id', itemId);

    if (deleteError) {
      return res.status(500).json({ error: 'Failed to remove item' });
    }

    console.log(`[Disconnect] Removed item ${itemId} for user ${user.id}`);

    return res.status(200).json({
      status: 'ok',
      message: 'Disconnected successfully',
    });
  } catch (err) {
    console.error('[Disconnect] Error:', err);
    return res.status(500).json({ error: err.message });
  }
}
