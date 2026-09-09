// ─────────────────────────────────────────────────────────────
// Cloudflare Pages Function
// File path in your repo MUST be:  functions/api/submit.js
//   → serves POST /api/submit  (frontend fetch('/api/submit') unchanged)
//
// Handles THREE request types, all keyed by a shared `sessionId` so Power
// Automate can ADD one row per taker and UPDATE it on later actions:
//
//   requestType = 'completion' → AUTOMATIC, fires the moment the report renders
//                                (viewing the report IS the save). Power Automate
//                                ADDS the pipeline row. This is the number you
//                                count for "how many people actually took it".
//   requestType = 'meeting'    → user clicked "Speak with an ION Treasury
//                                Specialist". Power Automate mails the assessment
//                                AND updates the row: OptedToSpecialist = Yes.
//   requestType = 'pdf'        → user clicked "Download Report as PDF".
//                                Power Automate updates the row: DownloadedPDF = Yes.
//
// Payload fields now include: sessionId, phone, acceptedTerms, consentedToContact.
//
// Secret: Cloudflare → Pages project → Settings → Environment variables
//         → add TEAMS_WEBHOOK_URL
// ─────────────────────────────────────────────────────────────
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const jsonHeaders = { ...CORS, 'Content-Type': 'application/json' };
  const WEBHOOK_URL = env.TEAMS_WEBHOOK_URL;

  if (!WEBHOOK_URL) {
    console.error('TEAMS_WEBHOOK_URL not set');
    return new Response(
      JSON.stringify({ error: 'Webhook not configured' }),
      { status: 500, headers: jsonHeaders }
    );
  }

  try {
    const d = await request.json();

    // Default to 'completion' so any older/edge payload still lands as a taker.
    const requestType = d.requestType || 'completion';
    const isMeeting = requestType === 'meeting';
    const isPdf = requestType === 'pdf';
    const isCompletion = requestType === 'completion';

    const ragEmoji = d.rag === 'Red' ? '🔴' : d.rag === 'Amber' ? '🟡' : '🟢';

    // Title makes it obvious in the Teams channel which kind of event this is.
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
      // Full payload as JSON string for Power Automate to parse
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
      return new Response(
        JSON.stringify({ error: 'Webhook delivery failed', status: webhookRes.status }),
        { status: 502, headers: jsonHeaders }
      );
    }

    return new Response(
      JSON.stringify({ ok: true, message: 'Submitted successfully', requestType }),
      { status: 200, headers: jsonHeaders }
    );
  } catch (err) {
    console.error('Submit error:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: jsonHeaders }
    );
  }
}
