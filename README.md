# Nirmol

Bangla-first air-quality forecasting, personal exposure guidance and citizen pollution reporting for Bangladesh.

The historical plan is in [docs/plan.md](docs/plan.md). Current routes, ownership,
authentication, deployment limitations and verification are in
[docs/team-handoff.md](docs/team-handoff.md).

## Layout

```
web/                    Next.js public tools, Auth and protected My Nirmol
jobs/                   Python scripts run by GitHub Actions (ingestion, hourly forecast)
ml/                     Data audit, notebooks, trained model artifacts
supabase/migrations/    Database schema
.github/workflows/      Scheduled forecast job
```

## Setup

1. Use Node 22 or newer (locally verified: Node 24). From `web`, run `npm ci`
   and `npm run dev`. Public environmental tools do not require an account.
2. Optional Auth: copy `.env.example` to `web/.env.local` and configure only the
   real public Supabase URL/key and the canonical `NIRMOL_SITE_URL` app origin.
   Production Auth requires that explicit HTTPS origin. See the handoff for
   email confirmation/recovery allowlists and browser-bound PKCE callbacks.
   Google OAuth is deferred; no anonymous sign-in or Google setup is required.
3. Account storage migration `0003_account_settings.sql` is **unapplied and not
   production verified**. Review/test it in a disposable environment first.
   Do not bulk-run migrations: that would also apply unverified A06 migration
   `0002`. No live migration is part of local setup. F06/F08 integration remains
   with Member 02; no reporting bucket or advisor route is fabricated here.
4. Offline model verification: create a Python 3.14 virtual environment, install
   `jobs/requirements.txt` with `--require-hashes --only-binary=:all:`, then run
   `python -B jobs/forecast_runtime.py`. This uses real artifacts and fixtures,
   without provider or publication calls.

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

## Dependency and runtime verification

Dependency security findings, the supported Python 3.14 hash-locked environment,
offline native model checks and verification limits are documented in
[the A12/A13 engineering report](docs/a12-a13-hardening.md). These checks do not
enable the A06 publisher.

## Data attribution

Weather and air-quality model data from [Open-Meteo](https://open-meteo.com/)
(CC BY 4.0). Historical training measurements are documented in the model
evaluation and station audit, including [OpenAQ](https://openaq.org/). Street
routing and the teammate community map are not integrated in this checkout.
