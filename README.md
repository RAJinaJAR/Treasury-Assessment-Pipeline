# ION Treasury Strategic Assessment — Vercel Deployment

## Project Structure

```
/
├── index.html          ← The assessment UI (modified with Submit button)
├── api/
│   └── submit.js       ← Serverless function → Teams Webhook
├── vercel.json         ← Routing config
├── package.json        ← Project metadata
├── .env.example        ← Environment variable template
└── README.md           ← This file
```

## Prerequisites

- A **Vercel** account (free tier works)
- A **Microsoft Teams** channel with an **Incoming Webhook** configured
- A **Power Automate** flow (free tier) to parse channel messages → append to Excel

---

## Step-by-Step Deployment

### STEP 1: Create Teams Incoming Webhook

1. Open **Microsoft Teams**
2. Go to (or create) a private channel, e.g., `Treasury Assessment Pipeline`
3. Click the `⋯` menu on the channel → **Manage channel**
4. Go to **Connectors** (or **Settings → Connectors**)
5. Find **Incoming Webhook** → click **Configure**
6. Name it `AssessmentSubmit`, optionally upload an icon
7. Click **Create** → **Copy the webhook URL**
8. Save this URL — you'll need it for Vercel

> **Note**: If the old Connectors UI is gone, use the new **Workflows** approach:
> - In Teams, click `⋯` on the channel → **Workflows**
> - Select **"Post to a channel when a webhook request is received"**
> - Follow the setup → copy the webhook URL

---

### STEP 2: Deploy to Vercel

#### Option A: Via Vercel CLI

```bash
# Install Vercel CLI (one-time)
npm install -g vercel

# Navigate to this project folder
cd vercel-treasury-assessment

# Login to Vercel
vercel login

# Deploy
vercel

# Follow the interactive prompts:
#   - Set up and deploy? Y
#   - Which scope? (select your account)
#   - Link to existing project? N
#   - Project name? ion-treasury-assessment
#   - Directory? ./
#   - Override settings? N
```

#### Option B: Via GitHub + Vercel Dashboard

1. Push this folder to a **GitHub repo**
2. Go to **vercel.com** → **New Project**
3. Import your GitHub repo
4. Vercel auto-detects the config — just click **Deploy**

---

### STEP 3: Set Environment Variable

1. Go to **Vercel Dashboard** → your project → **Settings** → **Environment Variables**
2. Add:
   - **Key**: `TEAMS_WEBHOOK_URL`
   - **Value**: (paste the webhook URL from Step 1)
   - **Environment**: Production (and optionally Preview/Development)
3. Click **Save**
4. **Redeploy** (Go to Deployments → click `⋯` on latest → Redeploy)

---

### STEP 4: Set Up Power Automate Flow (Free Tier)

This flow watches the Teams channel and appends each assessment to a shared Excel.

#### 4a. Create the Excel File

1. Go to **SharePoint** or **OneDrive**
2. Create a new Excel file: `Treasury_Assessment_Results.xlsx`
3. Create a **Table** (Insert → Table) with these column headers:

| Timestamp | Company | Name | Role | Model | Persona | Dim00 | Dim01 | Dim02 | Dim03 | Dim04 | Dim05 | Overall | RAG |
|-----------|---------|------|------|-------|---------|-------|-------|-------|-------|-------|-------|---------|-----|

4. Name the table `AssessmentData` (Table Design → Table Name)

#### 4b. Create the Power Automate Flow

1. Go to **https://make.powerautomate.com**
2. Click **+ Create** → **Automated cloud flow**
3. Name: `Treasury Assessment → Excel`
4. Trigger: **"When a new channel message is posted"**
   - Team: (your team)
   - Channel: `Treasury Assessment Pipeline`
5. Add action: **"Compose"**
   - Input: `json(triggerOutputs()?['body/body/content'])`
   - (This extracts the summary JSON from the message)
6. Add action: **"Add a row into a table"**
   - Location: (your SharePoint site or OneDrive)
   - Document Library / Folder
   - File: `Treasury_Assessment_Results.xlsx`
   - Table: `AssessmentData`
   - Map columns from the parsed JSON:
     - Timestamp → `outputs('Compose')?['timestamp']`
     - Company → `outputs('Compose')?['company']`
     - Name → `outputs('Compose')?['name']`
     - etc.
7. **Save** the flow

> **Alternative parsing approach**: If the adaptive card format makes parsing tricky,
> you can use "Initialize variable" → set it to the message body → use "Parse JSON"
> action with a schema matching the payload structure.

---

### STEP 5: Test End-to-End

1. Open your Vercel URL in a browser
2. Complete the assessment (pick any answers)
3. On the report screen, click **"Submit Assessment Results"**
4. Verify:
   - ✅ Button turns green with "Results Submitted Successfully"
   - ✅ Adaptive Card appears in your Teams channel
   - ✅ New row appears in your Excel file

---

## Data Flow Diagram

```
Browser (assessment)
    │
    ▼ POST /api/submit (JSON payload)
Vercel Serverless Function
    │
    ▼ POST to Teams Webhook URL
Microsoft Teams Channel
    │  (Adaptive Card with scores + summary JSON)
    ▼
Power Automate (free trigger)
    │  "When a new channel message is posted"
    ▼
SharePoint Excel
    (row appended to AssessmentData table)
```

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| 502 error on submit | Check `TEAMS_WEBHOOK_URL` env var is set correctly in Vercel |
| Nothing in Teams channel | Verify the webhook URL is active — test with a curl POST |
| Power Automate not triggering | Ensure the flow trigger points to the exact channel where messages appear |
| Excel row not added | Check the table name matches `AssessmentData` and column mappings are correct |

---

## Security Notes

- The Vercel function acts as a **relay only** — no client data is stored on Vercel
- All data flows into your **M365 tenant** (Teams → SharePoint)
- The webhook URL is stored as a **server-side environment variable** — never exposed to the browser
- Consider adding rate limiting or a simple API key check in `submit.js` if needed

---

## Future Enhancements

- Add individual question-level answer export (the payload already includes them)
- Add email notification via Power Automate when a high-priority (Red RAG) assessment comes in
- Build a Power BI dashboard on top of the Excel data
- Add authentication if the tool is exposed publicly
