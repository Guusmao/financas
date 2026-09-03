import { getPluggyApiKey } from './_utils.js';

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

    const appUrl = process.env.APP_URL;
    const webhookSecret = process.env.PLUGGY_WEBHOOK_SECRET;

    if (!appUrl || !webhookSecret) {
      return res.status(400).json({
        error: 'Missing APP_URL or PLUGGY_WEBHOOK_SECRET environment variables',
      });
    }

    const apiKey = await getPluggyApiKey();

    const webhookUrl = `${appUrl}/api/pluggy/webhook?secret=${webhookSecret}`;

    console.log('[Setup Webhook] Registering webhook:', webhookUrl);

    const webhookRes = await fetch('https://api.pluggy.ai/webhooks', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
      },
      body: JSON.stringify({
        event: 'item/updated',
        url: webhookUrl,
      }),
    });

    if (!webhookRes.ok) {
      const error = await webhookRes.text();
      console.error('[Setup Webhook] Failed to register webhook:', webhookRes.statusText, error);
      return res.status(webhookRes.status).json({
        error: `Failed to register webhook: ${webhookRes.statusText}`,
        details: error,
      });
    }

    const webhookData = await webhookRes.json();

    return res.status(200).json({
      status: 'ok',
      message: 'Webhook registered successfully',
      webhook: webhookData,
    });
  } catch (err) {
    console.error('[Setup Webhook] Error:', err);
    return res.status(500).json({ error: err.message });
  }
}
