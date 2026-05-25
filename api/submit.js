export default async function handler(req, res) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const WEBHOOK_URL = process.env.TEAMS_WEBHOOK_URL;
  if (!WEBHOOK_URL) {
    console.error('TEAMS_WEBHOOK_URL not set');
    return res.status(500).json({ error: 'Webhook not configured' });
  }

  try {
    const d = req.body;

    // Build a clean payload object (exclude verbose answers array for Teams message)
    const scoreData = {
      timestamp: d.timestamp,
      company: d.company,
      name: d.name,
      role: d.role,
      model: d.model,
      persona: d.persona,
      dim00: d.dim00,
      dim01: d.dim01,
      dim02: d.dim02,
      dim03: d.dim03,
      dim04: d.dim04,
      dim05: d.dim05,
      overall: d.overall,
      rag: d.rag
    };

    // Send as plain text — Teams trigger can read this from body/body/content
    const payload = {
      text: JSON.stringify(scoreData)
    };

    const webhookRes = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!webhookRes.ok) {
      const errText = await webhookRes.text();
      console.error('Webhook error:', webhookRes.status, errText);
      return res.status(502).json({ error: 'Webhook delivery failed', status: webhookRes.status });
    }

    return res.status(200).json({ ok: true, message: 'Assessment submitted successfully' });

  } catch (err) {
    console.error('Submit error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
