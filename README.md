# Cellar Pulse

Account health analysis for wine distribution businesses. Upload order history, visit patterns, and optional account master data — the app scores each account, classifies risk, and highlights where your sales team should focus.

## What it does

- **Web dashboard** built with Next.js, TypeScript, Tailwind CSS, and shadcn/ui
- **File upload** for CSV and Excel reports:
  - **Order history** — account, date, product info, volume, lead team member (sales rep)
  - **Visit patterns** — account, visit date, sales rep, outcome
  - **Account master** (optional) — account name, tier, region, type, sales rep
- **Health scoring** per account (0–100) using signals such as:
  - Order frequency decline
  - Revenue trend (last 90 days vs prior 90)
  - Days since last order
  - Visit cadence vs expected cycle
  - Order value trends and visit-to-order conversion
- **Risk classification**: Healthy, At Risk, Critical, Dormant
- **Focus recommendations** — priority accounts sorted by risk with reasons and suggested actions
- **Summary stats** — counts by risk tier and revenue at risk

All data stays in the browser (`localStorage`). No database or login required for v1.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:43123](http://localhost:43123).

## Report formats

### Order history

| Column | Required |
| --- | --- |
| Restaurant / Account Name | Yes |
| Date | Yes |
| Product | Recommended |
| Volume (cases, units, or quantity) | Recommended |
| Lead Team Member | Recommended |
| Order Value | Optional |

Use **Order analytics** (`/orders`) for order frequency, individual product tracking, and volume breakdowns after uploading order files.

### Visit patterns

| Column | Required |
| --- | --- |
| Account Name | Yes |
| Visit Date | Yes |
| Sales Rep | Optional |
| Outcome | Optional |

### Account master

| Column | Required |
| --- | --- |
| Account Name | Yes |
| Tier | Optional |
| Region | Optional |
| Type | Optional |
| Sales Rep | Optional |

Column names are detected automatically; you can remap them in the upload dialog.

## Health scoring

When full order history is loaded, each account is scored from four weighted factors:

| Factor | Weight | What it measures |
| --- | --- | --- |
| Order recency | 35% | Days since last order vs the account’s typical buying cycle |
| Volume trend | 25% | Revenue change (last 90 days vs prior 90) |
| Visit coverage | 20% | Time since last rep visit; visits that didn’t convert to orders |
| Order cadence | 20% | Order frequency decline vs expected interval |

**Risk tiers** (based on days since last order):

- **Healthy** — ordered within the last **6 weeks** (42 days)
- **At risk** — last order **6 to 12 weeks** ago (43–84 days)
- **Critical** — no order in **over 12 weeks** (85+ days), or no order on file

When full order history is loaded, a composite health score also weighs volume trend, visit coverage, and order cadence — but the risk tier always follows the recency rules above.

The dashboard surfaces a **focus queue** with specific next steps (e.g. follow up on unconverted visits, protect declining volume).

## Scripts

- `npm run dev` — development server on port **43123**
- `npm run build` — production build
- `npm run start` — serve production build
- `npm run lint` — ESLint

## Deploy to Google Cloud

The app runs on **Cloud Run** via the included `Dockerfile` and `cloudbuild.yaml`. Portfolio data still lives in each user's browser; deployment only hosts the Next.js app and file-parsing API.

Project ID is set in **`gcp.deploy.env`** (`david-hall-dev` by default). Edit that file if your GCP project ID differs.

```bash
source gcp.deploy.env
gcloud auth login
gcloud config set project "$GCP_PROJECT_ID"
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com
bash scripts/deploy-cloud-run.sh
```

See **[docs/DEPLOY-GCP.md](docs/DEPLOY-GCP.md)** for the full path: first-time setup, Cloud Build CI/CD, and optional custom domain / auth.
