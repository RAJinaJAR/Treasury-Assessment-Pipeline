// ─────────────────────────────────────────────────────────────
// Vercel Serverless Function
// File path in your repo MUST be:  api/submit.js   (at the REPO ROOT)
//   → serves POST /api/submit  (frontend fetch('/api/submit') unchanged)
//
// NOTE: This replaces the old Cloudflare Pages Function. On Vercel the handler
// signature is (req, res) and the file lives at /api/submit.js — NOT
// functions/api/submit.js. Deploying the Cloudflare version to Vercel is what
// produced the 500 Internal Server Error.
//
// Handles THREE request types, all keyed by `sessionId`:
//   requestType = 'completion' → automatic, fires when the report renders.
//                                Power Automate ADDS the pipeline row.
//   requestType = 'meeting'    → "Speak with an ION Treasury Specialist".
//                                Mails the assessment + flips OptedToSpecialist=Yes.
//   requestType = 'pdf'        → "Download Report as PDF". Flips DownloadedPDF=Yes.
//
// Env var: Vercel → Project → Settings → Environment Variables
//          → add TEAMS_WEBHOOK_URL  (then redeploy)
// ─────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  // ---- CORS (harmless for same-origin; helps if you ever call cross-origin) ----
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
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
    // Vercel auto-parses JSON bodies, but guard against string bodies just in case.
    const d = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});

    // Default to 'completion' so any edge payload still lands as a taker.
    const requestType = d.requestType || 'completion';
    const isMeeting = requestType === 'meeting';
    const isPdf = requestType === 'pdf';

    const ragEmoji = d.rag === 'Red' ? '🔴' : d.rag === 'Amber' ? '🟡' : '🟢';

    const titleText = isMeeting
      ? `📅 Specialist Requested: ${d.company || 'Unknown'}`
      : isPdf
        ? `📄 PDF Downloaded: ${d.company || 'Unknown'}`
        : `✅ Assessment Completed: ${d.company || 'Unknown'}`;

    const typeColor = isMeeting ? 'Accent' : isPdf ? 'Warning' : 'Good';

    const card = {
      type: 'message',
      text: JSON.stringify(d),
      attachments: [
        {
          contentType: 'application/vnd.microsoft.card.adaptive',
          content: {
            $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
            type: 'AdaptiveCard',
            version: '1.4',
            body: [
              {
                type: 'TextBlock',
                text: titleText,
                weight: 'Bolder',
                size: 'Medium',
                wrap: true,
              },
              {
                type: 'TextBlock',
                text: `Request type: ${requestType.toUpperCase()}  ·  Session: ${d.sessionId || 'n/a'}`,
                weight: 'Bolder',
                color: typeColor,
                spacing: 'None',
                wrap: true,
              },
              {
                type: 'TextBlock',
                text: `${d.name || 'Anonymous'} · ${d.contact || 'no email'} · ${d.phone || 'no phone'} · ${d.role || 'N/A'} · ${d.model || 'N/A'}${d.entities ? ' · ' + d.entities + ' entities' : ''}`,
                isSubtle: true,
                wrap: true,
              },
              {
                type: 'TextBlock',
                text: `Consent to contact: ${d.consentedToContact || 'No'}  ·  Terms accepted: ${d.acceptedTerms || 'Yes'}`,
                isSubtle: true,
                size: 'Small',
                wrap: true,
              },
              {
                type: 'TextBlock',
                text: `${ragEmoji} Overall Score: ${d.overall}% (${d.rag})${d.overallUnweighted != null ? ` · Unweighted ${d.overallUnweighted}%` : ''}`,
                weight: 'Bolder',
                color: d.rag === 'Red' ? 'Attention' : d.rag === 'Amber' ? 'Warning' : 'Good',
              },
              {
                type: 'FactSet',
                facts: [
                  { title: 'Regime 01 - Daily Operations', value: `${d.reg01}%` },
                  { title: 'Regime 02 - Market Volatility', value: `${d.reg02}%` },
                  { title: 'Regime 03 - Crisis Resilience', value: `${d.reg03}%` },
                  { title: 'Regime 04 - Strategic Capital', value: `${d.reg04}%` },
                  { title: 'Regime 05 - Group Scale', value: `${d.reg05}%` },
                ],
              },
              {
                type: 'TextBlock',
                text: `Submitted: ${d.timestamp || new Date().toISOString()}`,
                isSubtle: true,
                size: 'Small',
              },
              {
                type: 'TextBlock',
                text: JSON.stringify(d),
                isVisible: false,
                id: 'rawPayload',
              },
            ],
          },
        },
      ],
      summary: JSON.stringify(d),
    };

    const webhookRes = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(card),
    });

    if (!webhookRes.ok) {
      const errText = await webhookRes.text();
      console.error('Webhook error:', webhookRes.status, errText);
      return res.status(502).json({ error: 'Webhook delivery failed', status: webhookRes.status });
    }

    return res.status(200).json({ ok: true, message: 'Submitted successfully', requestType });
  } catch (err) {
    console.error('Submit error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
