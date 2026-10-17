# Phase 05C product validation

The full runner now has twelve suites, ending with `product-validation.browser.mjs`.
Existing assertions are preserved. New checks cover bilingual map zoom names,
stable navigation and delayed map/advisor states, independent parent/worker
arithmetic and 132 responsive axe/keyboard states (320/768/1280, both languages
and themes). Reporting adds a complete Tab/Space/Enter submission and receipt/
restart focus check. These are browser simulations, not participant/physical
device, screen-reader or genuine database/provider results.

`--product-validation-only` is an explicit third-argument development selector,
not a full-regression receipt. Use a fresh TEMP/TMP directory for each full run
to preserve earlier phase logs; the unchanged receipt filenames use `nirmol-05a-*`.
Do not rebuild `.next` or run load traffic while browser verification is active.

Optional controlled load, from `web`, after a fresh production build and with
the other browser servers stopped:

```powershell
$env:NIRMOL_05C_LOAD = 'isolated-local-only'
node scripts/phase05c-load.mjs
```

This uses only owned loopback port 3008, actual Next HTTP and a test-only
`product-load-hook.cjs` preload. No alternate production backend or live provider
is enabled. Four 15-second stages use 10/25/50/100 paced HTTP virtual users, not
concurrent real browsers or authenticated users. Source/coordinate/body checks,
errors/timeouts, actual in-flight count and server CPU/RSS are recorded; memory/
error thresholds stop unsafe stages. Results are under `%TEMP%/nirmol-05c-load-*`.
These are short local measurements, not deployed capacity or cost estimates.

See `docs/phase05c-product-validation.md` for actual results and
`docs/phase05c-real-user-test-script.md` for the unexecuted volunteer/device/AT
protocol. Phase 05C forbids DB access: explicitly set both
`NIRMOL_F06_DISPOSABLE` and `NIRMOL_F08_DISPOSABLE` to `false` before running the
three real SDK suites solely to record their skips. Do not enable a target merely
because credentials exist. A06 and live Gemini remain off.

# Phase 05A independent audit (historical runner count)

The full runner now includes eleven suites, ending in
`independent-audit.browser.mjs`; receipts use `%TEMP%/nirmol-05a-regression-*.log`.
For development only, its third argument `--independent-audit-only` explicitly runs
just the three new browser tests; this is not a complete regression receipt.

`independent-audit.test.mjs` adds separate arithmetic/location oracles, actual
Auth/account slow-stream handlers, provider-location/key tests and real sharp
metadata stripping. `jobs/tests/test_independent_science_audit.py` adds scalar
feature checks, actual saved-model SHAP additivity, required-history failures and
identical predictions when only unused old/future provider hours have gaps.
These synthetic inputs establish no forecast accuracy.

The new browser suite uses actual production DOM/navigation, deterministic client
air, real unconfigured private HTTP failures and axe-core on 44 page/language/theme
states. It retains incomplete/manual review results in JSON. It does not establish
real PostgreSQL/RLS, live Gemini, phone or screen-reader behavior. No new dependency
was installed; axe-core is already present.

The audit browser permits only the owned port 3001 at `127.0.0.1`/`localhost`;
Next's middleware can redirect between these loopback aliases. Remote requests
remain blocked. Run TypeScript after a completed build, never concurrently with
the build replacing `.next/types`.

The separate `web/scripts/audit-public-air.mjs` makes two real public Open-Meteo
reads only with `NIRMOL_05A_PUBLIC_AIR=allow-public-reference-read`. It clears
Supabase/Gemini configuration in its process and cannot publish. It is not part of
offline regressions. Read the three Phase 05A audit/evidence/validation documents
for exact scope; skipped real SDK suites are not security passes.

# Phase 04 F08 advisor

Run the same full unit/type/lint/build and browser commands below. The browser
runner now includes `advisor.browser.mjs`, owns/checks port 3005 as well as
3001–3004, clears real advisor/provider configuration for child processes and
writes `%TEMP%/nirmol-f08-regression-<suite>.log` receipts.

F08 can run alone with `node tests/advisor.browser.mjs <Playwright-path>` after
a fresh build. It starts its own Next server on 3005. A test-only child-process
preload redirects only the fixed Gemini/Open-Meteo server fetch origins to the
owned loopback protocol fixture. Production code has no alternative provider URL
or mock fallback. The suite uses actual server air validation, the shared Gemini
transport, authenticated/user or signed-guest quota RPC adapters and real HTTP
handlers. External browser requests are blocked. These fixtures do not prove
PostgreSQL locking, grants, RLS or live model quality/availability.

`advisor.test.mjs` and `advisor-api.test.mjs` cover exact schemas, environmental
freshness/coverage, input/time/location boundaries, HMAC cookies, safe enum plans,
prompt injection, provider errors/timeouts, retry accounting, session changes,
concurrency orchestration and no fabricated numeric evidence.

Real, separately gated tests are `supabase/tests/advisor_quotas.sql` and
`node --test tests/advisor.quota.integration.mjs`. Missing disposable configuration
skips the SDK suite, never passes real enforcement. Follow `docs/f08-ai-advisor.md`.
The opt-in live smoke script is not run by builds or regression commands.

# Phase 03 Community Map and moderation

From `web`, run `node --test tests/*.test.mjs`, `npx tsc --noEmit`,
`npm run lint -- --max-warnings=0`, then a fresh `npm run build`. Run all browser
suites with `node scripts/run-browser-regressions.mjs <Playwright-path>`.
The runner owns loopback port 3001 and stops its server; Auth, F06 and Community
own ports 3002/3003/3004 respectively. It refuses an occupied shared-server port,
clears real-service keys for its children, disables AI/A06, and writes individual
receipts under `%TEMP%/nirmol-p03-regression-*.log`. Do not rebuild `.next` while
these browser servers are running.

`node tests/community.browser.mjs <Playwright-path>` runs the Phase 03 browser
suite alone. It starts/stops the real production Next app and synthetic
Auth/PostgREST/Storage protocol fixture on port 3004. There is one fixture report
store shared by F06, public and moderation RPC simulations. The production code
always uses real F06 adapters. External browser traffic is blocked; the tile-outage
test explicitly intercepts only the OSM tile origin. No real report is fabricated.
Private preview uses real normalized JPEG bytes and the real authorized proxy.

`community-moderation.test.mjs` covers strict public/private contracts, filters,
pagination, authorization orchestration, account guards and SQL source boundaries.
Browser checks cover submission → pending → moderator approval → public cell →
withdrawal, rejection, reviewer conflicts, forged roles, self-review, account races,
private previews, AI labels, zero reports, outages, expiry, keyboard and translations.
All these results are deterministic; they do **not** prove PostgreSQL row locking,
RLS or hosted Storage enforcement.

Separately gated real checks: `supabase/tests/community_moderation.sql` and
`node --test tests/community.storage.integration.mjs tests/reporting.storage.integration.mjs`.
Missing explicit disposable configuration skips both SDK tests. See
`docs/community-map-moderation.md` for operator setup; do not apply migrations
or run these suites on a shared/live service as part of local verification.

# F06 Phase 2 reporting

Run the full `node --test tests/*.test.mjs`, strict lint, TypeScript and fresh
production build, then `node tests/reporting.browser.mjs <Playwright-path>`.
F06 owns loopback port 3003 and its controlled Auth/RPC/Storage protocol fixture;
do not run another server on that port. It uses runtime-generated synthetic
credentials, real Next handlers, real sharp decode/re-encode, and blocked external
browser traffic. AI transport failures/schema checks are unit fixtures; UI-only
suggestions use explicit route interception. No live Google call is made.

`reports.test.mjs` covers pure contracts, privacy cells, image normalization and
Gemini validation. `reporting-api.test.mjs` exercises HTTP orchestration through
injected transports. These **do not verify real PostgreSQL/RLS/Storage enforcement**.
The real disposable suites are `supabase/tests/reporting.sql` and
`node --test tests/reporting.storage.integration.mjs` (skips without explicit
disposable configuration). Follow the isolated setup and approval gates in
`docs/f06-reporting-implementation.md`; do not bulk-run A06 migration `0002`.
No live migrations or cleanup are part of the deterministic tests.

# Phase 1 location reliability

Run `node --test tests/location.test.mjs tests/air.test.mjs` and the full existing
unit/browser suites below. The new coverage uses the pinned country polygon,
controlled GPS positions and controlled environmental responses. No live-provider
availability, legal border accuracy or device GPS precision is certified.

Manual search deliberately filters the existing city/reference registry in English
or Bangla, without network geocoding. Tests cover offline/empty search, permission
denial, unavailable GPS, poor accuracy, age, timeout, repeated and obsolete callbacks,
exact coordinates, source grid metadata and cross-tool restoration. Custom-model
fixtures now select `dhaka-reference` (23.796374, 90.424614); city-wide or nationwide
validation is not implied. Explicit null place IDs remain custom coordinates;
unknown or mismatched registered IDs are invalid in every restoring tool.

The manually substituted unit loaders resolve the new polygon dependency recursively.
Browser checks use Edge with a temporary Playwright installation, without adding it
to the app manifest/lockfile. On Windows a sandbox renderer crash can prevent page
creation; record that failed attempt and rerun with the required browser permission.
Always stop/restart the owned server after rebuilding so it serves the matching build.

# Auth and My Nirmol

Use Node 22+ and the committed npm lockfile. From `web`, run all unit suites with
`node --test tests/*.test.mjs`, TypeScript, zero-warning lint and a fresh build.
Then run `node tests/auth.browser.mjs C:/path/to/node_modules/playwright`.
The Auth suite starts its own production Next server on loopback port 3002 and a
controlled GoTrue/PostgREST protocol fixture. Do not start another server on 3002.
It uses test-only keys/tokens in child-process memory; no live Supabase, email,
database migration or environmental provider is used. Fake protocol responses do
not verify SQL/RLS, provider settings, email delivery or deployed authentication.
Screenshots are written to the operating system's temporary directory.

The other six browser suites use the separately served fresh build on port 3001
and controlled air fixtures. Run them all as well. Do not substitute production
services for fixtures. Real PostgreSQL tests in `supabase/tests/account_settings.sql`
require an explicitly provisioned disposable Supabase-compatible database;
they have not been executed on this machine. See `docs/team-handoff.md` for the
account-only migration review and the A06 prohibition on bulk migration setup.

# F10 in-app pollution alerts

From `web`, run `node --test tests/alerts.test.mjs tests/alert-preferences.test.mjs`.
For browser verification, build and serve a fresh production build, then run
`node tests/alerts.browser.mjs C:/path/to/node_modules/playwright`. The suite uses
controlled `/api/air` fixtures, not live providers, database publications or native
model inference. Run the existing air/dashboard/F03/F04/F09/F14 suites as well.

`evaluateAlerts(rawReport, location, preferences, nowMs, receivedAtMs)` reuses the
shared AirReport validator. Keep receipt time fixed when advancing the page clock:
future readings rejected on receipt must not age into current alerts. CAMS current
data has the existing three-hour budget. Nirmol current additionally requires fresh
issuance and its target hour to cover now; Nirmol forecasts require known fresh
issuance. Retrieval is not model generation. No legacy issuance is invented.

Thresholds are product preferences, not medical boundaries: presets 35/75/150,
default 75 µg/m³; custom 0–2000 inclusive, with equality triggering an alert.
Look-ahead is 6 (default), 12 or 24 hours. Only exact hourly forecast instants
strictly after evaluation time and at/before its window end qualify. Consecutive
qualifying points form groups; nulls, malformed rows, below-threshold points and
source/time gaps split groups. Displayed group endpoints are first/last prediction
instants, inclusive, not continuous exceedance intervals. No final-hour extension,
interpolation, extrapolation, exposure formula or trend claim is introduced.

Only versioned `{version:1,threshold,lookAheadHours}` preferences use this tab's
`sessionStorage`, under `nirmol.alerts.v1`. No persistent mode exists. Corrupt/newer
content stays untouched until explicit reset; failed writes/deletions preserve
stored data and are disclosed. Blocked storage falls back to page memory. Browsers
may restore/copy sessions; storage is not encrypted or account-isolated. No health
or diary keys are accessed. Location restoration reads only the validated dashboard
selection; changing the alert location does not rewrite that selection.

Dismissals are bounded page-memory event IDs, never sent or saved. IDs exclude fetch
and evaluation times, so unchanged refreshes retain dismissal; changed source,
issuance, concentration, target points or preferences create a different event.
Applying/resetting preferences, changing location, showing dismissed alerts or
reloading clears dismissal. A CAMS republish with identical valid times and values
cannot be distinguished because its issuance is unavailable.

One air request runs after restoration; manual refresh/location changes start one
new cancellable request with a 15-second UI deadline. There is no automatic network
polling, push, service worker, delivery provider or closed-page monitoring. Open-page
clock checks and visibility/focus listeners expire cached data without HTTP calls.
F06 now has `/reports`; Community Map and moderator UI remain Phase 3. Alerts still
link through the dashboard and do not implicitly copy private incident coordinates.

# Exposure checks

From `web`, run `node --test tests/exposure.test.mjs`. These tests use Node's
built-in test runner and the project's installed TypeScript compiler.

The browser suite uses an existing Playwright installation and Microsoft Edge.
It does not add either to the application dependencies. Start the application
on port 3001, then run:

```powershell
npm.cmd run dev -- --hostname 127.0.0.1 --port 3001
# In another terminal:
node tests/exposure.browser.mjs C:/path/to/node_modules/playwright
```

You can omit the module path if Playwright is installed in your environment.
Set `NIRMOL_TEST_URL` to test a different local port or the production server.
The suite intercepts `/api/air` with controlled fixtures; it verifies rendering,
input behavior, source labels, invalid responses, freshness, request races,
timeouts, translations, focus, and mobile overflow without relying on upstream
availability. It checks for runtime and hydration errors and saves a mobile
screenshot to the operating system's temporary directory.

Live provider availability, Bangla wording review, and real phone/screen-reader
testing remain separate checks. Exposure bands remain provisional and have not
been medically validated.

# Air API and dashboard P0 regressions

Run the provider validation/current-selection tests with the existing regressions:

```powershell
node --test tests/air.test.mjs tests/dashboard.test.mjs tests/exposure.test.mjs tests/travel.test.mjs tests/simulator.test.mjs tests/exposure-diary.test.mjs
npx.cmd tsc --noEmit
npm.cmd run lint -- --max-warnings=0
npm.cmd run build
npm.cmd run start -- --hostname 127.0.0.1 --port 3001
# In another terminal, using the freshly built application:
node tests/dashboard.browser.mjs C:/path/to/node_modules/playwright
```

`air.test.mjs` compiles the actual modules in memory. It replaces provider and
Supabase requests with controlled fixtures matching the inspected response
schemas and units. It checks malformed inputs, zero versus unavailable data,
strict dates and offsets, hourly alignment, source/run identity, current-hour
coverage, fallback and downstream contracts. It never calls a live service.

`dashboard.browser.mjs` controls request completion, deliberately allowing
aborted requests to finish so both cancellation and obsolete-result guards are
exercised. It covers A → B → A, obsolete failures, loading/retry ownership,
invalid API values, independent current/forecast source labels and bilingual
mobile rendering. No environmental requests leave the controlled fixture.

An unavailable current value remains `now.pm25: null`. If no valid current
timestamp exists, `now.time` is an empty string; a fetch time is never substituted
for a reading time. Weather without a valid timestamp likewise has null values
and an empty `weather.time`. Existing field names/types and forecast valid times
are preserved. These fixtures are separate from live-provider, database and
deployed integration checks.

## F01/F07: saved locations, indicative AQI and genuine SHAP

`dashboard.test.mjs` validates the saved `nirmol.loc` selection without changing
any browser storage. Invalid or unreadable selections use the existing Dhaka
default. Registered IDs require their registry coordinates; explicit null IDs
retain custom Bangladesh coordinates. Browser checks cover blocked storage,
reloads, unrelated-key preservation and restored-location request ownership.

Forecast points can optionally include `explanation` with `runId`, `model`,
`validAt`, `issuedAt`, `scale: "log1p_pm25"` and three `{feature,value,effect}`
factors. Only validated manifest publications of `nirmol-xgb-v1` supply this
metadata. The 24 reviewed identifiers are checked against model metadata.
Unknown, nonfinite, duplicate, incomplete, wrong-hour/model/issuance or mixed-run
explanations are omitted. CAMS and legacy points remain explanation-unavailable.
PM2.5 values and source/issuance selection retain their existing behavior.

Dashboard browser checks select hours by absolute timestamp, including the next
Dhaka date, and exercise sign/order, expiry, source/location changes, keyboard
controls, six category badge contrasts and 320px/desktop English/Bangla layouts
in both themes. Native SHAP computation and deployed Supabase retrieval are not
executed: these are controlled stored-JSON/API fixtures, not live integration.

The AQI breakpoint calculation is unchanged and is labelled an indicative
PM2.5-based estimate, with a regulatory/NowCast averaging disclaimer. SHAP is
labelled as log-scale model attribution, not pollution causation or uncertainty.
Links open the existing personalization tools, which refresh their own data;
users confirm location/source there. The dashboard also links to the actual F06
submission route. Reporting requires a separate explicit incident location and
does not copy dashboard/diary/account context.

# Reliability batch: coverage, issuance and deadlines

The air and dashboard suites also cover A05/A07/A08 using controlled fixtures
and clocks. Run the complete browser suites against a fresh production build;
substitute the same Playwright path used above:

```powershell
node tests/exposure.browser.mjs C:/path/to/node_modules/playwright
node tests/travel.browser.mjs C:/path/to/node_modules/playwright
node tests/simulator.browser.mjs C:/path/to/node_modules/playwright
node tests/exposure-diary.browser.mjs C:/path/to/node_modules/playwright
```

Forecast eligibility is 25 finite, supported readings at unique consecutive UTC
hours, covering a stated 24-hour window starting at the current or next forecast
hour. This is not a promise of 24 remaining hours from an arbitrary minute.
Complete Nirmol coverage is preferred; otherwise usable CAMS intervals are
preferred. Only verified original publications qualify; elapsed hours may leave
partial custom coverage, retained only if CAMS has no usable interval.
Partial coverage is labelled, gaps break the chart line, and travel
integration continues to exclude incomplete intervals and final-point extrapolation.

Two optional additive fields preserve known issuance: `forecastIssuedAt` for a
Nirmol forecast and `now.issuedAt` for a Nirmol current estimate. They are actual
Supabase `issued_at` values, retained independently of forecast valid times and
the API's unchanged retrieval timestamp `fetchedAt`. They are absent for CAMS,
whose model generation time is not supplied. The age policy accepts at most
three hours old, including the boundary, with at most one minute future clock
skew. Consumers preserve and recheck these fields when present, so a new
retrieval cannot renew an old model. Legacy snapshots without them retain their
existing retrieval/reading-age checks; no missing model issue time is invented.
Diary restoration evaluates saved source snapshots at their original assessment
time, preserving historical entries after the live forecast expires.

Each provider request has a 5-second deadline covering fetch and JSON-body
parsing together; the single embedded Supabase read has a 3-second deadline.
Independent providers and the
Supabase lookup run in parallel. The dashboard has a 15-second client deadline,
and each request forwards cancellation and clears its timers/listeners. There
are no automatic retry loops. Optional weather failures yield null fields;
independently valid Nirmol air can survive a CAMS failure. All-air failure still
returns a generic 502. API responses and browser requests use `no-store`;
provider cache entries are revalidated against their original timestamps.
Dashboard clocks update locally, expire data and retain the original retrieval
time; they do not trigger repeated network requests.

These fixture checks do not verify live Supabase, job scheduling or database
atomicity. A06's separate database tests and rollout prerequisites follow.

# A06 atomic publication and reader recovery

No migration or new publisher has been deployed by this local repair.
Only `0001_init.sql` existed when `0002_forecast_publication.sql` was authored;
verify deployed migration history before choosing its deployment number.

The reader makes one uncached, cancellable query for at most ten fresh candidates,
ordered by issuance and ID. It embeds at most 26 points per run to detect an
oversized publication instead of hiding extra rows behind the consumer's 25-point
cap. Verify deployed PostgREST embedding and row limits (at least 26 per child
and all requested parents); a truncated response must never establish completeness.
Raw publications are validated before elapsed hours are removed. Runs are never
stitched together. Invalid runs cannot supply a current estimate either.

Manifest-backed runs require the original start and publication timestamp, all
25 exact hourly points, valid numeric concentrations/ranges, metrics and three
finite SHAP factors per hour. Publication completeness, three-hour issuance
freshness, and remaining operational coverage are independent decisions.
The supported model is exactly `nirmol-xgb-v1`, area `dhaka`. Adding another
model requires an explicit contract review. CAMS provider normalization and all
exposure/travel calculations retain their existing behavior.

Default behavior rejects legacy rows without publication metadata. A temporary
server-only `NIRMOL_LEGACY_FORECAST_BEFORE` may be an absolute ISO timestamp no
later than now. Only legacy runs issued strictly before this fixed cutoff and
containing a complete, valid issue-hour window qualify. They are classified
internally as `legacy`, never atomically published. One missing manifest field
cannot downgrade a corrupted publication into legacy compatibility. Do not use
a moving cutoff. Remove the setting after the atomic publisher becomes operational;
new rows issued at or after the cutoff never qualify as legacy. History is not
rewritten or automatically certified. `/api/air` fields remain unchanged.

The Python job now requires the entire intended input grid; it never substitutes
later hours for missing ones. Raw predictions are checked before rounding. Model
artifacts, preprocessing, prediction formulae and SHAP-to-hour association are
unchanged. Heavy imports are lazy so offline publisher tests need only Python's
standard library. Those tests stub transport/native imports, not a database.

```powershell
# From the repository root, no providers or database:
python -B -m unittest discover -s jobs/tests -p test_refresh_forecast.py
# Reports UNVERIFIED without psql/an explicit disposable database:
python -B jobs/tests/verify_forecast_database.py
```

To verify actual SQL, provision a **fresh `nirmol_a06_test` database in a disposable
local cluster**, then supply its loopback URL explicitly:

```powershell
python -B jobs/tests/verify_forecast_database.py --url postgresql://postgres@127.0.0.1:5432/nirmol_a06_test
```

The runner rejects remote URLs, other database names, URL query/fragment options,
and existing forecast tables. It ignores ambient PostgreSQL connection settings.
It creates test roles/tables, applies the migration only there, injects failures
after run insertion and during point insertion, and checks full rollback, invalid
payload rejection, immutable replay, role access, historical preservation and
SHAP association. Two independent psql sessions verify identical and conflicting
concurrent publication. This runner must never target a shared/deployed cluster,
including a local tunnel to a remote cluster. No database is auto-discovered.
It leaves the disposable database for inspection; teardown is manual.
If this runner was not executed successfully, transaction and concurrency
guarantees remain unverified. Unit mocks and a successful web build do not prove them.

`publish_nirmol_forecast(jsonb)` is VOLATILE/SECURITY INVOKER with an empty
search path, qualified relations and a five-second lock timeout. Only
`service_role` receives execution privilege; PUBLIC/anon/authenticated are revoked.
The migration fails closed if the expected roles, forecast RLS, table SELECT/
INSERT privileges, run UPDATE privilege for replay row locks, or identity-sequence
USAGE are absent. It does not grant table access, bypass roles or rewrite policies.
Actual privileges/schema must be inspected by the database operator before deployment.

The RPC validates raw explicitly zoned strings before casting. The natural
publication identity is `(model, area, forecast_start)` for new rows. Identical
replay retains run ID, issuance, publication time and all data. Conflicting
payloads fail rather than replace history. The unique index arbitrates concurrent
writers. Legacy null metadata is excluded from this index. The RPC is the atomic
write path; the privileged service role still has its existing direct DML powers.
Readers therefore revalidate manifests and never trust a timestamp flag alone.

The publisher freezes serialized JSON before its first RPC request. It permits
at most one identical replay for a network timeout/failure, server error or
unconfirmed acknowledgement. Redirects/4xx are rejected; a missing RPC never
falls back to two table POSTs. Requests use 30-second connect/read timeouts;
these are not total wall-clock deadlines for a trickling response. The workflow's
ten-minute execution limit provides the process ceiling. Cleanup runs only after
a verified acknowledgement, keeps the existing three-day retention period, and
filters both this model and area. Cleanup failure is reported separately and
cannot trigger another publication. Cleanup redirects are disabled: a redirect
could discard the model/area filters. Every non-2xx cleanup response is reported
as unsuccessful without following it. No keys or provider response bodies are logged.

The offline Python suite includes a source guard for PostgreSQL's JSON extraction
and subtraction precedence; it is not a SQL parser or database execution test.
The disposable SQL suite runs a positive RPC smoke before rejection cases so
unrelated SQL errors cannot masquerade as successful invalid-input validation.
The cleanup redirect regression uses real Requests redirect handling with an
in-memory adapter; it opens no socket. It can use the existing Requests package
or pip's vendored copy, and explicitly skips that check if neither is available.

Deployment sequence, requiring separate approval:

1. Inspect actual catalogs, constraints, grants, RLS, migration history and
   PostgREST embedding/limits. Do not assume they match source. Coordinate shared
   forecast consumers and retention with Member 02.
2. Pass the disposable-database tests and all existing web regressions. Test an
   application rollback with additive metadata retained; do not delete history.
3. Release reader recovery first. If temporarily necessary, set a fixed legacy
   cutoff. Default strict mode safely uses CAMS before new manifests exist.
4. Apply the approved additive migration and reload/verify the RPC schema cache.
   Verify anonymous/authenticated denial and authorized job execution.
5. Pause the old publisher for cutover; verify one new manifest publication and
   its complete points/SHAP before enabling `NIRMOL_ATOMIC_PUBLISHER_ENABLED=true`
   as a GitHub repository variable. The updated workflow defaults to disabled,
   serializes this publisher without cancelling running jobs, and has a ten-minute limit.
6. Remove legacy compatibility, re-enable only the approved atomic job, and observe
   freshness, fallback, replay and scoped retention behavior.

Rollback pauses publication and retains the safer reader, committed rows, columns
and indexes. CAMS remains the fallback as models expire. Do not automatically
restore split publication, refresh issuance, drop provenance columns or remove
historical data. The migration itself contains no cleanup or historical backfill.
