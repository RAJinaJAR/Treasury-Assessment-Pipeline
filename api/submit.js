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

    // Build RAG emoji
    const ragEmoji = d.rag === 'Red' ? '🔴' : d.rag === 'Amber' ? '🟡' : '🟢';

    // Build dimension breakdown string
    const dimBreakdown = [
      `00 Strategic Priorities: ${d.dim00}%`,
      `01 Daily Operations: ${d.dim01}%`,
      `02 Structural Volatility: ${d.dim02}%`,
      `03 Shock Events: ${d.dim03}%`,
      `04 Strategic Capital: ${d.dim04}%`,
      `05 Ecosystem Scale: ${d.dim05}%`
    ].join('\n');

    // Build answer details if available
    let answerDetails = '';
    if (d.answers && Array.isArray(d.answers)) {
      answerDetails = d.answers.map(a =>
        `[${a.dimension}] Q${a.questionIndex + 1}: ${a.selectedOption}`
      ).join('\n');
    }

    // Format as Adaptive Card for clean Teams channel rendering
    const card = {
      type: "message",
      text: JSON.stringify(d),
      attachments: [{
        contentType: "application/vnd.microsoft.card.adaptive",
        content: {
          "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
          type: "AdaptiveCard",
          version: "1.4",
          body: [
            {
              type: "TextBlock",
              text: `📊 New Assessment: ${d.company || 'Unknown'}`,
              weight: "Bolder",
              size: "Medium",
              wrap: true
            },
            {
              type: "TextBlock",
              text: `${d.name || 'Anonymous'} · ${d.role || 'N/A'} · ${d.model || 'N/A'} · ${d.persona || 'N/A'}`,
              isSubtle: true,
              wrap: true
            },
            {
              type: "TextBlock",
              text: `${ragEmoji} Overall Score: ${d.overall}% (${d.rag})`,
              weight: "Bolder",
              color: d.rag === 'Red' ? 'Attention' : d.rag === 'Amber' ? 'Warning' : 'Good'
            },
            {
              type: "FactSet",
              facts: [
                { title: "Dim 00 - Strategic Priorities", value: `${d.dim00}%` },
                { title: "Dim 01 - Daily Operations", value: `${d.dim01}%` },
                { title: "Dim 02 - Structural Volatility", value: `${d.dim02}%` },
                { title: "Dim 03 - Shock Events", value: `${d.dim03}%` },
                { title: "Dim 04 - Strategic Capital", value: `${d.dim04}%` },
                { title: "Dim 05 - Ecosystem Scale", value: `${d.dim05}%` }
              ]
            },
            {
              type: "TextBlock",
              text: `Submitted: ${d.timestamp || new Date().toISOString()}`,
              isSubtle: true,
              size: "Small"
            }
          ]
        }
      }],
      // Full payload as JSON string for Power Automate to parse
      summary: JSON.stringify(d)
    };

    const webhookRes = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(card)
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
