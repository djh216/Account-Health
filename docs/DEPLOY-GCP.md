# Deploy Cellar Pulse to Google Cloud

This guide walks through hosting the app on **Cloud Run**. The repo includes a `Dockerfile` and `cloudbuild.yaml` for that path.

## What moves to the cloud

| Component | Behavior |
| --- | --- |
| Next.js UI + `/api/parse-report` | Runs in Cloud Run |
| Portfolio data (orders, visits, accounts) | Stays in each user's browser (`localStorage`) |
| Database | Not used in v1 |

Deploying gives you a shared URL for your team. Users still upload CSV/Excel files in the browser; data is not stored on GCP unless you add backend storage later.

## Architecture

```text
User browser
    │
    ├─► Cloud Run (Next.js)
    │       └─► POST /api/parse-report  (CSV / Excel parsing)
    │
    └─► localStorage  (portfolio persists per browser / device)
```

Recommended GCP services:

1. **Artifact Registry** — Docker images
2. **Cloud Run** — serve the app (HTTPS, scale to zero)
3. **Cloud Build** — optional CI/CD from git push

## Project config

This repo stores your GCP project ID in **`gcp.deploy.env`**:

```bash
source gcp.deploy.env
echo $GCP_PROJECT_ID   # david-hall-dev
```

Edit that file if your Google Cloud project ID is different.

## Quick deploy

After Phase 1 setup (one time):

```bash
bash scripts/deploy-cloud-run.sh
```

## Phase 1 — Prerequisites

1. [Google Cloud account](https://cloud.google.com/) and a project.
2. [Google Cloud CLI](https://cloud.google.com/sdk/docs/install) installed.
3. Billing enabled on the project.
4. **`gcp.deploy.env`** updated with your project ID (default: `david-hall-dev`).

```bash
gcloud auth login
source gcp.deploy.env
gcloud config set project "$GCP_PROJECT_ID"
```

Enable APIs:

```bash
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com
```

Create a Docker repository (one time):

```bash
source gcp.deploy.env
gcloud artifacts repositories create "$GCP_REPOSITORY" \
  --repository-format=docker \
  --location="$GCP_REGION"
```

Grant Cloud Build permission to deploy to Cloud Run (one time per project):

```bash
source gcp.deploy.env
export PROJECT_NUMBER=$(gcloud projects describe "$GCP_PROJECT_ID" --format='value(projectNumber)')

gcloud projects add-iam-policy-binding "$GCP_PROJECT_ID" \
  --member="serviceAccount:${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com" \
  --role="roles/run.admin"

gcloud projects add-iam-policy-binding "$GCP_PROJECT_ID" \
  --member="serviceAccount:${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com" \
  --role="roles/iam.serviceAccountUser"
```

## Phase 2 — Test the container locally

From the repo root:

```bash
docker build -t cellar-pulse .
docker run --rm -p 8080:8080 cellar-pulse
```

Open [http://localhost:8080](http://localhost:8080). Upload a CSV or Excel file to confirm `/api/parse-report` works.

## Phase 3 — Deploy manually

```bash
source gcp.deploy.env
export IMAGE=${GCP_REGION}-docker.pkg.dev/${GCP_PROJECT_ID}/${GCP_REPOSITORY}/app:latest

gcloud builds submit --tag "$IMAGE"

gcloud run deploy "$GCP_SERVICE" \
  --image "$IMAGE" \
  --region "$GCP_REGION" \
  --platform managed \
  --allow-unauthenticated \
  --memory 512Mi \
  --cpu 1 \
  --min-instances 0 \
  --max-instances 10 \
  --port 8080
```

Or run `bash scripts/deploy-cloud-run.sh` to do the same using `gcp.deploy.env`.

Cloud Run prints a URL like `https://cellar-pulse-xxxxx-uc.a.run.app`.

### Internal-only access

Omit public access and use Identity-Aware Proxy or Google login later:

```bash
source gcp.deploy.env
gcloud run deploy "$GCP_SERVICE" \
  --image "$IMAGE" \
  --region "$GCP_REGION" \
  --no-allow-unauthenticated
```

## Phase 4 — Deploy with Cloud Build (CI/CD)

Use the included `cloudbuild.yaml`:

```bash
gcloud builds submit --config cloudbuild.yaml \
  --substitutions=_REGION=us-central1,_SERVICE=cellar-pulse,_REPOSITORY=cellar-pulse
```

To deploy on every push to `main`, connect your repository in **Cloud Build → Triggers** and point the trigger at `cloudbuild.yaml`.

## Phase 5 — Custom domain (optional)

In the Cloud Run console: **Manage custom domains**, or front the service with a load balancer and managed SSL certificate.

## Environment variables

v1 needs no secrets. Optional overrides:

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `8080` | Set by Cloud Run |
| `HOSTNAME` | `0.0.0.0` | Listen on all interfaces |

Set at deploy time:

```bash
gcloud run services update cellar-pulse --region $REGION \
  --set-env-vars KEY=value
```

## Cost (rough)

For a small internal team with low traffic:

- **Cloud Run** — often $0–5/month (free tier covers moderate use)
- **Artifact Registry** — cents for one image
- **Cloud Build** — free tier for occasional builds

No database cost in v1.

## Limitations and next steps

**Data does not migrate automatically.** Each browser keeps its own `localStorage`. On the new URL, users re-upload reports unless you add:

1. **Export/import** — JSON backup of portfolio state
2. **Firestore or Cloud SQL** — shared server-side storage
3. **Firebase Auth / IAP** — login and access control
4. **Secret Manager + Gemini API** — AI-generated account insights

Suggested order if you outgrow browser-only storage:

```text
Cloud Run (done) → Auth (IAP) → Firestore → optional Gemini insights
```

## Troubleshooting

| Issue | Fix |
| --- | --- |
| Container exits immediately | Check Cloud Run logs; ensure `output: "standalone"` is in `next.config.ts` |
| Excel upload fails | API route uses Node (`exceljs`); do not switch the route to Edge runtime |
| 403 on deploy | Confirm Cloud Build service account has `roles/run.admin` |
| App loads but upload hangs | Increase memory to `1Gi` if parsing very large workbooks |
