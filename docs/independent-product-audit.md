# Phase 05A independent product, scientific and security audit

Prepared 18 October 2026, Asia/Dhaka. Scope: the actual original repository at
`C:\Users\tanis\Nirmol`, not a deployed application. Starting branch
`fix/location-reliability`, HEAD `a85a824b15af8ee4de49d04749f504560e358bf3`;
working tree and index were clean. Phase 04 was committed at that HEAD. No branch,
index, commit, remote secret, deployment, database or publishing setting changed.

## Verdict

**Not ready for an unrestricted real-user pilot or a production/investor claim of
end-to-end readiness.** There is substantial functioning application code, not just
screenshots: calculations, source validation, browser storage, report workflows,
moderation and advisor orchestration execute locally. One real public CAMS/weather
read also succeeded. However, hosted Auth/email, PostgreSQL/RLS/Storage enforcement,
quota races and live Gemini relevance/language quality remain unverified. The
custom model has no reproducible holdout data in this checkout and publication
must remain off. These gaps cannot be repaired by increasing fixture counts.

A supervised internal review of public modeled air information and comparative
calculators is feasible. A campus pilot involving accounts, incident photos or AI
needs the release gates in [the validation plan](real-world-validation-plan.md).
The code is ready to enter **controlled staging validation** with synthetic actors
once an owner approves/provisions the target; that is not staging certification or
authorization to deploy/apply migrations. An investor engineering demonstration is
reasonable only with explicit simulated-service and model limitations; it is not
ready for a demonstration claiming a validated, production-complete product.
No customers, participant feedback, paid contracts or measured operating costs
were established by this audit.

The [feature acceptance matrix](feature-evidence-matrix.md) assigns explicit A–E
evidence levels, implementation/test paths, requirements and residual gaps. A
narrow real-provider read does not upgrade all scenarios or other modules to A.

## Method and test challenge

Inspected all 13 API route files plus the Auth callback, their shared handlers and
runtime adapters, six migrations and access grants, configuration/workflows,
environment-variable names, Gemini transport, location/source validators,
calculators, browser persistence and feature UI. Reviewed training, ingestion,
native prediction/SHAP, saved metadata and the three saved JSON artifacts. Private
environment files were not read to discover credentials or live targets.

Existing evidence has materially different strengths:

- Most environmental browser suites intercept `/api/air` and supply complete
  reports. They verify real React interactions, stale-result handling and visible
  calculations, but could pass with a broken production air endpoint. Pure
  arithmetic tests that reuse the same helper are not independent science checks.
- Auth/F06/Community/F08 protocol fixtures exercise actual Next HTTP handlers and
  real SDK/transport adapters. Their JavaScript permission/state simulations can
  be correct while PostgreSQL grants, RLS, locking or Storage are broken. These
  are C evidence, not real database enforcement. Gemini fixtures cannot establish
  language comprehension or relevant semantic selection.
- SQL substring/source tests, workflow parsing, translation AST checks and
  manifest/lock assertions are useful consistency guards. They do not execute
  SQL, prove a deployable environment, or certify fluent Bangla.
- Actual sharp image decoding/re-encoding and actual XGBoost/TreeSHAP execution
  are stronger than mocks for their specific properties. Synthetic inputs still
  provide no predictive-performance evidence.

Added **20 grouped meaningful tests**: 13 web unit/actual-handler tests, four
Python tests and three browser tests. Input loops are not counted as additional
tests. Oracles include 180 exposure cases; minute-by-minute integration across
1,328 departure scenarios; scalar rolling/calendar/vector calculations; 400
seeded country points using a separate winding-number algorithm; actual metadata
stripping and full native SHAP reconstruction. The new browser suite follows
navigation and runs axe-core 4.14.0 on eleven routes × two languages × two themes
(44 mobile page states). Existing tests/assertions were not removed or weakened.

## Reproduced defects and fixes

Severity means potential product impact, not a claim of an exploited production
incident. No P0 was identified within the permitted scope.

| ID | Severity | Reproduction before fix | Impact and fix | Evidence |
| --- | --- | --- | --- | --- |
| A01 | P1 | Return a valid provider grid at `40.7,-74` for a Bangladesh query | Foreign-city air/weather could be labelled as the selected local conditions. Reject valid but contradictory provider centres over 100 km away; bad weather is omitted independently. The generous bound is consistency checking, not a claimed accuracy radius. | `independent-audit.test.mjs`: foreign-grid and mismatched-weather tests |
| A02 | P2 | Set only `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Custom forecast lookup silently disappeared although Auth accepted that configuration. Air reads now use the same key precedence and send opaque publishable keys only in `apikey`, preserving legacy JWT behavior. | Publishable-only and preferred/legacy-key tests |
| A03 | P2 | Send an unterminated JSON stream to Auth POST or authenticated account PUT; advance the test clock beyond 8 s | Byte limits alone left request reads unbounded at application level. Both handlers now use a byte/deadline/cancellation reader, return safe HTTP 408 and do not authenticate/write an incomplete payload. Hosting/perimeter limits remain necessary. | Two actual-handler slow-stream tests; virtual clock, not a load test |
| A04 | P2 | Evaluate `2026-02-30T00:00:00Z` at its JavaScript-normalized March date | The F03 current-time predicate accepted impossible dates as fresh. Calendar and clock components now validate before age evaluation. | Impossible-date/leap-day test |
| A05 | P2 | Remove an hour from required provider history before the intact 25-hour target window, or insert an off-hour row | Rolling 24-row means could silently cover the wrong elapsed period while predictions stayed finite. The job now requires exactly the ordered 24 prior hours plus 25 target hours before feature engineering. No filling or sorting was introduced; unrelated older/later gaps are ignored. | Independent Python history rejection and unused-gap equivalence tests; red receipts retained |
| A06 | P2 | Run axe WCAG checks on exposure/travel/simulator/diary in light theme and exposure in dark theme | Links had 3.82:1 contrast; selected exposure button had 4.11:1 light / 2.56:1 dark. Darker light-theme teal and a shared readable selected-button style fix the reported failures. Auth background is preserved. | Saved axe receipts: ten failing language/theme combinations before fix, zero afterward |

The initial new web test run had **6 passes / 7 failures**, reproducing A01–A04.
The initial new Python run had two passing tests and a failing history test (three
subtest failures; not three additional tests). Reordered history already failed
later through missing features; gaps/off-hour history did not. A regression caught
that existing invalid-grid metadata is intentionally omitted rather than fatal:
that behavior remains; only valid contradictory coordinates reject provider data.
An intermediate account timeout fix returned 503 until its error mapping was
corrected to 408. Original regression assertions remained intact.

The resumed review reproduced an overly broad intermediate A05 guard: removing an
unused old hour or appending data after an irrelevant future gap rejected an
otherwise valid forecast (two failing subcases). Validation now covers only the
49 required hours. A separate test proves both irrelevant gaps give exactly the
same 25 predictions/factors as the complete provider frame; the required gap,
reordering and off-hour rejection tests still pass.

Early new journey attempts also exposed test assumptions, not application defects:
numeric values share elements with units and the travel duration must be selected
explicitly. The apparent persistent language failure rendered without CSS or JS:
Next's loopback middleware redirected `127.0.0.1:3001` to `localhost:3001`, and
the new test blocked that origin's assets. The harness now allows only these two
aliases of its owned server and asserts the redirect stays there. The language
assertion remains; no application i18n change was needed. Hosted canonical-origin
behavior remains a staging check. Initial axe failures were actual product
contrast problems and were fixed in source. Original tests were unchanged.

## Scientific assessment

The formulae compute the specified comparison proxies correctly. Independently:
`80 × 1.5 × 1.5 = 180 µg·h/m³`; `30 × 0.5 × 2.5 = 37.5`; relative change is
`−79.1666667%`. That is a change in the indicator, not clinical risk. F03's
activity factors and general/sensitive category cutoffs remain provisional product
assumptions, not validated ventilation, dose or medical thresholds. F04 holds a
left hourly value over a bracketed interval, rejects gaps/final extrapolation and
ranks minute departures. It compares one point, not traffic routes. F14 shares
those limitations. The independent minute-sum oracle agrees with the implemented
integral, including null gaps. No clinical validity follows from arithmetic.

The dashboard's AQI wording was challenged. Its UI already says indicative,
single-value PM2.5 estimate, not EPA regulatory AQI or NowCast. Numeric 2024
breakpoints passed the independent endpoint table; the implementation comment
alone should not be read as an official index claim. EPA real-time/daily reporting
requires its averaging methodology. [EPA/AirNow technical guidance](https://www.airnow.gov/publications/air-quality-index/technical-assistance-document-for-reporting-the-daily-aqi/)

`ml/train_forecast.py` uses a chronological split: training Aug 2022–Oct 2024,
test Nov 2024–Mar 2025, one Embassy/Baridhara site. Calendar and right-aligned
forecast/weather features contain no explicit future measured target. The serious
deployment-information mismatch is that historical CAMS is analysis-like, while
future operational inputs have forecast lead times. Forecast vintage/availability
at issue time is not recorded in the training table contract. A temporal split
alone does not eliminate this optimism or establish 24-hour lead-time skill.

The checkout has no `ml/data/dhaka_training.csv`, observation cache, saved held-out
predictions or residual table. **Actual MAE/RMSE/bias/coverage could not be
recomputed.** Metadata reports custom MAE 51.13, RMSE 76.57, bias −21.53 µg/m³ over
3,395 hours versus raw CAMS MAE 80.25. Those are reported historical scores, not
newly verified accuracy. Offline 1-hour persistence reports MAE 26.45 on 3,352
hours; different sample sets/lead times prevent a fair head-to-head conclusion.
The held-out season does not establish monsoon or nationwide generalization.

Interval calibration fits early models, calibrates on later training data, then
refits final quantile models including that period. It is not an untouched
split-conformal calibration set for those final models; nominal 80% coverage is
not guaranteed. Reported held-out coverage 0.81443 is descriptive and unrecomputed.
Residual tails, subgroup/season/lead-time errors, input-missingness sensitivity,
drift and sensor QA need original observations and genuine forecast vintages.

Real saved median-model execution on 25 varied synthetic rows gives maximum full
SHAP additivity error **`7.404189091e-06` in log1p space**. Reconstruction includes
the base value and every feature; inversion uses `expm1`, not `exp`. Only three
rounded contributions are published, so the UI correctly says they cannot
reconstruct a prediction and are not causes, concentration deltas or uncertainty.
Fixture run/hour linkage checks do not verify an actual stored publication.
Artifacts, training code and metadata were preserved. The separate full runtime
smoke also passes: 24 features, 25 forecast rows, 25×25 SHAP matrix, max float32
additivity error `3.814697265625e-06`, synthetic PM2.5 range 72.3842–77.4343.
Network and save/publication calls are explicitly forbidden in that smoke.
A06 remains disabled.

## Security/privacy and migration assessment

Source design is substantially defensive: actual Auth user checks, owner-filtered
queries, exact request/response allowlists, revision-based moderation decisions,
no self-review, private normalized images, fixed Gemini origin/no tools/redirects,
bounded generation, HMAC guest identity, no chat transcripts and private cache
headers. New real image tests verify EXIF and appended content removal. None of
this proves the deployed privilege graph. Real disposable SDK suites skip rather
than fabricate authorization success. No real user or hosted database was probed.

Migration dependency review:

| Migration | Dependency / release concern |
| --- | --- |
| 0001 | Skeleton includes an identifying public report view and old privileged helper. Never expose it alone as a finished F06 deployment. |
| 0002 | Forecast atomic publisher; separate unverified grant/schema assumptions. **Not required for accounts/reporting/advisor; keep unapplied and A06 off.** |
| 0003 | Account storage on Auth. Owner RLS and compare-and-swap revision; actual execution unverified. Its DB location check uses a bounding box, while TypeScript uses the country polygon (see residual risks). |
| 0004 | Requires 0001, Auth, Storage and PostGIS. Replaces old report visibility/writes, guards roles, supplies private worker RPCs. The enum addition precedes its transaction; the chosen migration runner's commit behavior needs disposable verification. |
| 0005 | Requires 0001 + 0004, adds guarded moderation reads; no dependency on 0002. |
| 0006 | Self-contained Auth quota ledger/private schema and public wrappers. Guest/finish RPCs service-only, user identity derived from Auth. Actual lock/snapshot behavior remains unverified. |

Additional source-review risks remain **open**, not silently marked fixed:

- **P2, saved-location DB/TS mismatch:** a direct owner REST write can satisfy
  0003's bounding box for an out-of-polygon point; subsequent application reads
  reject the row. This is own-account availability/integrity, not a demonstrated
  cross-account leak. SQL `btrim` and JS `trim` also have different whitespace
  rules. Align constraints in an
  additive reviewed migration and test real direct REST writes before release.
- **P2, quota clock/lock risk:** 0004/0006 capture reservation time before the
  shared advisory lock; 0006 status uses transaction `now()`. A wait spanning a
  minute/day boundary can associate processing with an earlier window. Execute a
  two-session blocked-lock boundary test and review clock/snapshot semantics.
  No SQL fix or enforcement claim was made without execution evidence.
- F08 guest-cookie clearing/new profiles can obtain new identities. Twenty is
  per account/cookie, not per anonymous human. Global caps bound AI attempts, not
  unlimited status/Auth/public read traffic or service invocation costs.
- Diary/alert storage is browser-scoped, not account-scoped. Logout intentionally
  does not erase another independently owned browser diary; the UI discloses
  this. People sharing a browser profile can access persisted entries. This is
  unsuitable as confidential clinical storage and needs a shared-device policy.
- Report withdrawal removes public visibility but object erasure may be queued;
  precise evidence scrubbing and retention depend on an unscheduled cleanup
  operator. A source retention interval is not proof that deletion happens.

F08 is a real provider planner over a limited reviewed catalog, not unrestricted
conversation. It sends only the latest question, explicit activity and validated
facts; no diary/private report context or exact coordinates. User text itself can
still contain sensitive details. Free-tier/paid-tier provider handling must be
agreed before enabling it. Bilingual fixtures return preselected plans; they
cannot demonstrate natural Banglish comprehension or clinically reviewed copy.
The 256-token budget and model-specific dynamic thinking require live model
compatibility testing. Current official REST examples match the structured-output
shape in source; reference/example differences are a live compatibility question,
not evidence of a proven malformed-request defect.
[Gemini structured output](https://ai.google.dev/gemini-api/docs/generate-content/structured-output),
[thinking controls](https://ai.google.dev/gemini-api/docs/generate-content/thinking),
[provider pricing/data handling](https://ai.google.dev/gemini-api/docs/pricing).

Registry `npm audit` independently reports **five HIGH, zero critical** findings:
`braces`, `micromatch`, `fast-glob`, `@next/eslint-plugin-next`, `eslint-config-next`.
They are the inherited development dependency chain, not five independent runtime
exploits. They remain unresolved and visible; no overrides/audit suppression or
dependency changes were introduced. `npm ls --depth=0` passes.

## Actual live scope

At **2026-10-17 20:21:25 UTC (18 October 02:21:25 Dhaka)**, the explicit
`audit-public-air.mjs` probe invoked the actual `/api/air` handler/data validators
with real network fetches for public reference `23.796374,90.424614`. It cleared
Supabase/Gemini configuration in its child process, used no personal location or
keys, made no write, and supplied no fallback fixture. This is a direct handler
invocation, **not a browser-to-hosted-app end-to-end check**.

Air and weather returned HTTP 200 in about 911/891 ms respectively. Current CAMS
PM2.5 was **84.5 µg/m³**, valid `2026-10-17T20:00:00Z`; 25 non-null forecast points
ran through `2026-10-18T20:00:00Z`. Returned grid was `23.800003,90.399994`.
This is a time-specific model result, not a current guarantee or observational
accuracy comparison. One successful probe is not an uptime/SLA/latency study.
The initial sandboxed attempt failed `EACCES`; the separately approved read-only
network retry succeeded. Hosted Auth, Gemini, PostgreSQL and Storage were not
called. No disposable CLI/target was available; migrations were not applied.

## Usability and product constraints

The expert journey exercises retry → source explanation → exposure calculation →
invalid-input recovery → travel comparison → report entry → map → My Nirmol/Auth
redirect on a 360px viewport with 4× CPU throttling. Air values are explicitly
fixture-controlled; unavailable report/account backends remain real failures,
not simulated successes. Existing multi-role protocol journeys cover private
submission → approval → public cell → withdrawal. The hosted version of that
journey has **not** been completed.

After the contrast fix, the final 44 public/entry-page axe states have no automated
WCAG A/AA violations or horizontal overflow. Axe also returns 12 incomplete/manual-review groups (for
example complex chart/visual backgrounds); they are retained in receipts, not
called passes. Authenticated form states, actual screen-reader comprehension,
touch target ease, physical phones, flaky mobile networks and participant tasks
remain to test. CPU throttling is not a measured low-end-phone benchmark.

First-time-user weaknesses remain: substantial caveat text; a small manual city
registry rather than address search; no street routing; language can initially
render Bangla before browser preference restoration; a map outage and a zero-report
state have different meanings; the 200-loaded-report cap is not a community total;
coarse 0.05° cells are larger than a campus and still do not guarantee anonymity.
F08 cannot handle arbitrary follow-up context because history is never sent.
Unavailable account/report/advisor services must be resolved before promising a
complete public journey. This is expert review, not fabricated participant feedback.

## Pilot economics and operations

No bill, customer load, conversion or operating margin was measured. The following
are architecture-based estimates/constraints, not a commercial forecast.

- Next serverless + Supabase is technically plausible for a small pilot, but
  function limits, sharp memory, Auth/email delivery, pool sizing, real DB query
  latency and cold starts need target-host tests. Optional map tiles have no SLA.
- The current air adapter uses free public Open-Meteo origins. The free service
  is non-commercial and capped at 10,000 calls/day; a paid agreement/customer
  endpoint integration is a **commercial release blocker**, not solved merely by
  CC BY data attribution. Distinct precise queries reduce cache reuse. As an
  illustrative no-cache budget, 100 users × 96 refreshes/day × two providers is
  19,200 provider calls/day before job/advisor traffic. Actual app refresh rates
  vary and identical cached queries may reduce that count.
  [Open-Meteo service plans](https://open-meteo.com/en/pricing)
- F08 currently caps the project at 200 accepted attempts/day, 20/minute and four
  active leases. That supports only ten users consuming their full 20/day, or
  roughly 100 users averaging two/day; bursts may still be refused. Status polls
  and public/API reads are outside the AI budget. For 100 visible advisor tabs
  open eight hours, minute status checks alone imply roughly 48,000/day, excluding
  focus events. These are estimates, not a load test.
- Price AI using the approved model's actual token usage, including thinking and
  F06 image tokens: `sum(input_tokens × input_rate + output_tokens × output_rate)
  / 1,000,000`, plus hosting/database/egress. No model is configured by default;
  a fixed currency-per-message quote would be fabricated. Use provider spend caps
  as well as application quotas. Free/paid data handling differs.
  [Gemini prices](https://ai.google.dev/gemini-api/docs/pricing)
- Published starting prices checked during this audit: Supabase Pro $25/month;
  Vercel Pro $20/month, with seat/usage/tax conditions. An illustrative $45/month
  platform starting subtotal excludes air licensing, AI, email, maps, overages,
  backups/monitoring and staff. It is not a complete cost quotation. Vercel Hobby
  is for non-commercial personal use.
  [Supabase pricing](https://supabase.com/pricing),
  [Vercel pricing](https://vercel.com/pricing),
  [Hobby terms](https://vercel.com/docs/plans/hobby)
- Standard OSM tiles require attribution, a valid browser referrer and ordinary
  caching; no bulk/offline prefetch. The source's opt-in tiles, default browser
  cache, bounded zoom and independent boundary/list fallback are sensible. Plan
  a contracted map service if availability becomes a product promise.
  [OSMF tile policy](https://operations.osmfoundation.org/policies/tiles/)
- Staff capacity must match review arrivals. For illustration, 100 reports/day ×
  three review minutes is five staff hours, excluding disputes/abuse. This is an
  assumption to measure, not a staffing result. Define response times, reviewer
  provisioning/revocation, safeguarding, appeal and retention owners.
- Schedule/verify cleanup, pseudonymous error/latency monitoring, backup/restore,
  alerts, abuse controls and dependency patching. Logs/proxies must redact exact
  query coordinates, cookies, image paths and free-text prompts. No production
  logging configuration or deletion schedule was verified here.

## Final verification receipts

Final full regression: **825 passed, zero failed, zero skipped in the main
suites**: 449 web unit/API/maintenance + 321 browser + 55 Python. This is 805
preserved tests plus 20 new grouped tests, not a sum of repeated runs/input loops.
The separate disposable Supabase SDK suites have **0 passed, 0 failed, 3 skipped**
because no approved disposable settings were supplied. No real SQL suite ran.

| Final check | Exact result |
| --- | --- |
| Web unit/API/maintenance | 449 passed, 0 failed, 0 skipped |
| Browser dashboard / exposure / travel / simulator | 76 / 14 / 13 / 22 passed |
| Browser diary / alerts / Auth | 37 / 54 / 34 passed |
| Browser F06 / Community / F08 / independent audit | 18 / 24 / 26 / 3 passed |
| Complete browser runner | 321 passed, 0 failed, 0 skipped; all 11 suites exit 0 |
| Python | 55 passed, 0 failed, 0 skipped |
| Native full runtime/artifact smoke | Exit 0; synthetic providers, no network or publication |
| Accessibility | 44 states, 0 automated violations, 0 overflow, 12 manual-review groups |
| TypeScript / strict ESLint | Both exit 0; zero lint warnings |
| Fresh Next 15.5.27 production build | Exit 0 |
| Installed dependency tree | Exit 0 |
| Registry dependency audit | Exit 1: 5 HIGH development-chain findings, 0 critical; unresolved |
| Whitespace / index / protected files | Clean whitespace; empty index; model/migration/workflow/Auth image unchanged |

Environment: Windows x64, Node 24.18.0; Playwright 1.64.1 with headless Microsoft
Edge 155.0.4283.62; axe-core 4.14.0. Isolated CPython 3.14.0 uses the pinned
`jobs/requirements.txt` environment (XGBoost 3.4.1, NumPy 2.5.4, pandas 3.0.6).
Browser production children clear real service configuration and force A06/AI
off. No device, participant or hosted deployment benchmark is implied.

An intermediate TypeScript run overlapped a build deleting `.next/types`, producing
missing-generated-file errors. The completed build and sequential type/lint run
pass; the diagnostic is not counted as a source repair. Final results above are
fresh Phase 05A receipts, not inherited Phase 04 claims. Python log messages about
confirmed publication come from existing mocked tests, not live writes.

Commands, from `web` unless specified:

```text
node --test tests/independent-audit.test.mjs
node --test tests/*.test.mjs
node node_modules/typescript/bin/tsc --noEmit
node node_modules/eslint/bin/eslint.js . --max-warnings=0
npm.cmd run build
node scripts/run-browser-regressions.mjs <Playwright-path>
node --test tests/reporting.storage.integration.mjs tests/community.storage.integration.mjs tests/advisor.quota.integration.mjs
npm.cmd ls --depth=0
npm.cmd audit --json
# Repository root, using the isolated pinned Python 3.14 environment:
python -B -m unittest discover -s jobs/tests -v
python -B jobs/forecast_runtime.py
git diff --check
```

`--independent-audit-only` as the runner's third argument is explicitly a limited
development run, not a full regression. `audit-public-air.mjs` requires
`NIRMOL_05A_PUBLIC_AIR=allow-public-reference-read` and makes two public provider
requests; it must not be confused with the all-offline/browser fixture suites.
No SQL source-string test or skipped real SDK test is included as a security pass.

Receipts: `%TEMP%/nirmol-05a-{red,science-red,unit,python,build,public-air,supabase}.log`,
`nirmol-05a-browser-final.log`, individual
`nirmol-05a-regression-<suite>.log`, npm audit JSON and `nirmol-05a-browser-*`
screenshot/axe JSON directories. The final axe/journey directory is
`%TEMP%/nirmol-05a-browser-ESGUlI`; native smoke, TypeScript, ESLint and dependency
tree logs use the same `nirmol-05a-` prefix. Early failing runs are retained
separately, including `nirmol-05a-history-red.log` for the unused-gap regression.

## Changed-file inventory

Final Git inventory: **18 unstaged files (11 modified, 7 new)**. Branch and full
HEAD remain the starting checkpoint; the index is empty. No package/lockfile,
model artifact, training script, migration, workflow or approved Auth image changed.

```text
docs/independent-product-audit.md
docs/feature-evidence-matrix.md
docs/real-world-validation-plan.md
docs/team-handoff.md
jobs/refresh_forecast.py
jobs/tests/test_independent_science_audit.py
web/scripts/audit-public-air.mjs
web/scripts/run-browser-regressions.mjs
web/src/app/api/account/route.ts
web/src/app/globals.css
web/src/components/ExposureCalculator.tsx
web/src/lib/air.ts
web/src/lib/auth-actions.ts
web/src/lib/auth.ts
web/src/lib/exposure.ts
web/tests/README.md
web/tests/independent-audit.browser.mjs
web/tests/independent-audit.test.mjs
```

Recommended owner-reviewed commit message (not executed):
`Fix independent audit defects and document pilot validation gates`.
Next phase: approved disposable Supabase/Auth/Storage verification and witnessed
staging journeys, followed by reproducible holdout science, live bilingual AI
evaluation and the operational/commercial gates in the validation plan.
