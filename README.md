# Nirmol

Bangla-first air-quality forecasting, personal exposure guidance and citizen pollution reporting for Bangladesh.

The agreed scope, stack and schedule are in [docs/plan.md](docs/plan.md).

## Layout

```
web/                    Next.js app (UI + API routes: reports, advisor, trips)
jobs/                   Python scripts run by GitHub Actions (ingestion, hourly forecast)
ml/                     Data audit, notebooks, trained model artifacts
supabase/migrations/    Database schema
.github/workflows/      Scheduled forecast job
```

## Setup

1. Copy `.env.example` to `web/.env.local` and fill in the keys.
2. Run `supabase/migrations/0001_init.sql` in the Supabase SQL editor. Enable **Anonymous sign-ins** and the **Google** provider under Authentication. Create a private `report-photos` storage bucket.
3. `cd web && npm install && npm run dev`
4. Data audit: `pip install -r jobs/requirements.txt && python jobs/audit_openaq_stations.py`

## Experimental A06 publisher: keep disabled

The atomic publisher and `supabase/migrations/0002_forecast_publication.sql` have
not been verified against a disposable PostgreSQL database or the deployed schema.
Do not apply this migration or enable publication during integration/deployment.
Keep the resolved GitHub Actions variable `NIRMOL_ATOMIC_PUBLISHER_ENABLED`
absent or `false`; check organization, repository and environment scopes. Omit it
(or use `false`) in local, Vercel and other job environments. No flag value needs
to be added to `.env.example` or secrets.

Both the Python command and direct `save()` calls require the exact process
environment value `true`; every other value is disabled. The workflow also gates
the job on the repository variable and forwards its actual value to Python.
Credentials alone do not enable publication. `--dry-run` retains forecast generation
without database writes; it still fetches provider data. Publication failures never
fall back to the former split-write path. Normal application reads and CAMS fallback
do not require this flag. Any future opt-in requires separate approval after real
database verification; these local guards do not verify external environment settings.

## Data attribution

Weather and air-quality model data from [Open-Meteo](https://open-meteo.com/) (CC BY 4.0). Station data via [OpenAQ](https://openaq.org/). Routing by [openrouteservice](https://openrouteservice.org/). Map data © OpenStreetMap contributors.
