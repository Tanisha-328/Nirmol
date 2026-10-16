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
node --test tests/air.test.mjs tests/exposure.test.mjs tests/travel.test.mjs tests/simulator.test.mjs tests/exposure-diary.test.mjs
npx.cmd tsc --noEmit
npm.cmd run lint
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
