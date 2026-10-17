# Phase 05D: independent release-candidate review

Prepared 18 October 2026, Asia/Dhaka. Original repository
`C:\Users\tanis\Nirmol`, branch `fix/location-reliability`, starting HEAD
`db617c5598e2ac64e209d2ddc2f60e999c1a7fab`, clean tree and empty index. The owner
committed Phase 05C before this review; older handoff statements about local
uncommitted work are historical.

## Scope and evidence

This review inspected actual components, calculations, source/time/location
readers, private/public HTTP dispatchers, Auth and worker adapters, model/runtime
guards, all six migration sources and existing test fixtures. It did not assume
that the previous 831 passing tests established release readiness. The new source
boundary tests found behavior that earlier positive fixtures explicitly accepted.

Actual app paths inspected include:

- `web/src/components/`: Dashboard, ForecastChart, ExposureCalculator,
  TravelPlanner, WhatIfSimulator, ExposureDiary, PollutionAlerts, AuthPanel,
  MyNirmol, PollutionReporting, CommunityMap/Canvas, ModeratorDashboard, AIAdvisor.
- `web/src/lib/`: air/air-validation, aqi, exposure, travel, simulator,
  forecast-explanation, exposure-diary/storage, alerts/preferences,
  places/location/dashboard-location, i18n, auth/actions/server, account,
  reports/backend/runtime/api/images/Gemini, community/moderation, advisor
  backend/runtime/context/validation/session/guidance/Gemini and gemini-json.
- App route entrypoints, middleware, layout/styles, public Auth background;
  `supabase/migrations/0001`–`0006`, SQL tests, cleanup tools, job/workflow guards,
  native saved-model tests, README and prior feature/integration evidence.

Browser checks use the actual fresh production app and controlled transports.
Native Python/sharp checks execute actual installed libraries/artifacts with
synthetic inputs. These are **deterministic application evidence**, not real
PostgreSQL/RLS/Storage, live Gemini, measured environmental accuracy, physical
devices, assistive technology or volunteer research. No real reports, users,
sensors, traffic or success metrics were invented.

No hosted/local database, live environmental/tile/AI provider, migration,
deployment or hosted setting was accessed or changed. Only the requested npm
registry audit used external network access. Production credentials were not read.
All modifications remain local; A06 remains disabled.

## Reproduced defects and targeted corrections

| ID | Severity / reproduction | Correction and evidence |
| --- | --- | --- |
| D01 | P2 keyboard accessibility: moderator opens a report; `open()` calls focus while the panel is still hidden. Closing/saving also removes the focused control. New production-browser assertion fails before the fix. | `ModeratorDashboard.tsx` focuses details after React reveals them; explicit close/save returns focus to a named queue region. New test uses Enter/Tab/text input through open → close → reopen → approve and confirms true fixture reviewer/audit state. Authorization/session/revision contracts unchanged. |
| D02 | P2 scientific source consistency, defense in depth: F03/F04/F14 readers accept custom Nirmol JSON at non-reference coordinates, unlike Dashboard/F08/F10 and the real air adapter. New unit tests fail with "Missing expected exception"; new F03 browser check fails because an invalid-source result is displayed. | Reuse the unchanged `inDhakaModelArea` eligibility check in F03 current, F04 forecast and F14 current readers; F09 inherits those readers. F04 also checks supported country input. CAMS elsewhere and custom data at the evaluated reference still work. No formula, AQI breakpoint, integration, band, ranking, model or publication algorithm changed. |
| D03 | P2 visual accessibility: production dark-theme screenshots show black browser calendar icons on dark Travel/Community fields. The diary already supplies a native color-scheme hint, but other date fields do not. | A scoped shared CSS rule supplies light/dark color schemes only to date/datetime-local inputs, including reporting and simulator. New actual-browser checks verify native scheme availability, enabled inputs and keyboard focus across four tools in both themes. Native date formats remain browser-locale dependent. |

D02 is not evidence that the production air endpoint was serving unsupported
custom values: that endpoint already constrained eligibility. It closes a
cross-feature validation discrepancy and makes malformed/mislabelled responses
fail consistently. The comparison tolerance remains 1e-6 degrees around
`23.796374, 90.424614`; it is not an evaluated coverage radius.

Existing positive fixtures in travel/simulator units and exposure/travel/
simulator/dashboard browser tests supplied Nirmol values at city centre. They
now use the existing `dhaka-reference` point. Assertions for both sources,
zero, midnight, retries, expiry and invalid inputs were retained, not removed or
relaxed. The first full browser attempt exposed two more such expiry fixtures;
they were corrected at the reference while retaining the expiry assertions.
Saved diary validation still preserves rejected raw data and blocks overwriting;
unsupported snapshots are not silently relabelled or migrated.

Red receipts: `%TEMP%/nirmol-05d-moderation-red.log` (24 pass / 1 fail),
`nirmol-05d-source-red.log` (0 pass / 2 fail), and
`nirmol-05d-product-red/nirmol-05a-regression-product-validation.log`
(5 pass / 1 fail). These expected failures establish reproduction, not final
acceptance failures.

D03's old-build red receipt is the product suite under
`%TEMP%/nirmol-05d-acceptance-7c3d48c4ab894fd281830f0686c985d9/`:
six passed, one failed with `/travel: ... dark native date controls; got
normal,normal`. The other eleven suites passed after correcting the fixtures/
orchestration. That run is deliberately not reported as final acceptance: it
establishes the missing native theme hint. A fresh build follows the CSS fix.

The first full attempt also hit a pointer-action timeout in the existing
two-tab Web Locks diary test, before releasing its deliberately held lock. It
does not establish a storage overwrite. The harness now foregrounds each tab,
submits with the keyboard and explicitly waits for both real pending lock
requests before release. All winner/losing-draft/disabled-write assertions are
retained. This is test orchestration, separate from the three application defects.

## Feature-by-feature local acceptance

| Feature | Actual reviewed contract / meaningful local acceptance | External limits |
| --- | --- | --- |
| F01 monitoring | Source/kind allowlist, exact requested coordinate echo, missing versus zero, units/calendar/grid consistency, stale/future values, retry and cancellation-ignoring A→B→A responses. | CAMS regional model, not a new station measurement or street sensor. No new live read. |
| F02 forecasting | Validated original 25-hour publication, issuance/retrieval/valid-time separation, partial gaps, source fallback, reference-only custom eligibility and expiry. | A06 off; no real DB run/publication or prospective forecasting skill verified. |
| F03 exposure | Independent 80×1.5×1.5=180; sensitive category changes interpretation, not arithmetic; source/expiry/invalid values. D02 adds reference guard. | Concentration-time-activity comparison, not dose, clinical risk or safe-outdoors guarantee. |
| F04 departure planner | Left-hour integration only with valid bracketing hourly points, missing-hour exclusion, minute candidate ranking/ties, Dhaka dates/midnight, duration and freshness. D02 adds country/reference guards. | Single place, no traffic or physical routing; minute choices do not improve forecast resolution. |
| F07 SHAP | Saved median-model full SHAP/base/log1p additivity; UI selected hour/run/issuance association; positive/negative/zero and absent explanation. | Attribution is not causation or direct µg/m³ effect; rounded top three cannot reconstruct full prediction. |
| F09 diary | Explicit browser session/persistence, consent, JSON export/delete, snapshot chronology, corruption/version/read-only handling, Web Locks and conflicting tabs, no notes/symptoms upload. | Browser-scoped and unencrypted; not account isolation. Logout does not erase it; UI warns. |
| F10 alerts | Inclusive threshold, zero, individual future points/gaps/expiry, dismissal identity, session preferences, visible-page recovery and labelled context. | In-app only; no background push/delivery or medical threshold guarantee. |
| F14 simulator | Shared F03/F04 numerical authority, hypothetical/current/forecast distinctions, independent relative comparison, zero denominator, no incomplete pair. D02 applies to current/forecast. | Hypothetical change is not disease-risk reduction. |
| Auth/account | Exact trusted origin, bounded body/deadline, PKCE/recovery, real-user verification, owner/revision/saved-place validation and stale-session hiding. | SDK protocol fixtures, not real signup/mail/recovery/session enforcement or account SQL grants. |
| F06 reporting | Authenticated confirmed incident/consents, secure optional photo decode/EXIF removal, idempotent digest retry, private history, withdrawal and keyboard receipt. | Genuine Storage/RLS, cleanup/deletion and service quotas unverified. |
| Community Map | Existing F06 public projection only, approved-safe category/day/coarse cell, pagination/filter/list/marker agreement, empty versus failure, tiles optional and failure independent. | Coarsening is not guaranteed anonymity; real public DB projection unverified. |
| Moderation | Server actor/role/self-review/revision/reason contract, forged permission and account denial, concurrent fixture decision, audit, access revocation. D01 repairs keyboard continuity. | Fixture synchronization is not PostgreSQL row locking; trusted provisioning/revocation needs real tests. |
| F08 advisor | Shared validated air/location, explicit provider/place/activity consent, minimal facts without coordinates/history, reviewed enum guidance, temporal coverage, safe text rendering, timeouts and explicit charged retries. | Synthetic semantic plans, not live Bangla/Banglish/model compatibility, provider privacy or atomic SQL quotas. |
| Shared location/language | Pinned country polygon, exact registry/custom identity, action-only GPS with timestamp/accuracy, explicit incident/advisor confirmation; language switching and restored selection. | Polygon not legal boundary, GPS accuracy not pollution resolution. Font/language first-render shifts remain. |

## Integrated workflow and comprehension

Production-build fixture journeys cover public Dashboard → explanation → exposure/
departure/simulator/diary/alerts, outage/retry, account entry, reporting and map.
Dashboard links reach every public tool; account functions are separate. F06 and
My Nirmol link to reporting/history and Community; Community links to reporting
and protected moderation. No parallel production database or mock fallback was
added. Environmental adapters and F08 retain the same air/location contracts.

The existing full F06 journey submits as A → verifies pending is private → signs
in as authorized M → approves with reason/revision → checks public category/day/
coarse cell with no precise coordinates/text/photo/identity → withdraws as A →
confirms disappearance. Rejection/unpublishing, A/B isolation, forged roles,
self-review, stale account replies and concurrent reviewer conflicts are tested
through actual handlers and synthetic SDK protocols. D01 separately exercises
keyboard moderation; D02 verifies unavailable custom data and recovery to CAMS/
hypothetical modes. These are engineering simulations, not witnessed real users.

Source, data valid time, regional coverage, provisional recommendation basis,
report uncertainty/moderation, login requirements and advisor's reviewed-plan
method remain explicit. No new promotional, investment, pricing or business
material was added to the application. Auth design/background is preserved.

The approved background raster itself includes an inherited "Join thousands"
line and English feature text. No participant/adoption evidence supports that
line in this audit. The explicit requirement to preserve that exact asset takes
precedence over editing its embedded text here; obtain a truthful replacement
asset/content review separately before public release. It is not endorsed as a
verified user count and was not added by this phase.

## Final design and accessibility findings

Final screenshot/axe receipts are aggregated below. Review spans eleven routes at
320/768/1280px, both languages/themes; private fixture suites additionally cover
Auth/account, reporting and moderator state/layouts. Screenshots now retain all
132 matrix states instead of only twelve selected images. The previous 360px
44-state audit remains in the full runner. No exclusions/thresholds weakened.

Charts have a labelled hour/value/explanation alternative; maps have an
independent keyboard list and coarse details. Errors/statuses use live regions;
public/private unavailable states remain honest. Reduced motion disables chart
animation/dashboard pulse; primary controls are generally 44px. Labelled 20px
checkboxes and inline links need touch-context review, not blanket size claims.
Selected visual review does not certify WCAG, physical touch, native pickers,
400% zoom, native Bangla editorial quality or actual screen-reader behavior.

Known first-render font/language restoration shifts remain a P2 polish limit.
They are separate from the repaired deterministic map/status/nav regressions.
Changing every page to cookie-dependent SSR or hiding content until hydration
would alter public rendering/performance; neither broad change is justified by
one synthetic cumulative CLS observation. No production Core Web Vitals claim.
Follow [the existing consented device/AT/volunteer protocol](phase05c-real-user-test-script.md).

## Security and scientific limits

Credential-bearing provider/worker modules remain server-side; browser code
receives only reviewed schemas. Auth uses public Supabase keys with no service-key
fallback; private routes verify current users/expected viewer, and moderator RPCs
derive role from trusted profile state. Fixed-bucket worker operations, image
digest/format/size/pixel limits, actual sharp re-encoding, private no-store headers,
bounded deadlines, generic diagnostics and enum-only AI rendering remain intact.
No arbitrary AI HTML, tool calls, production fixture backend or automatic retries.

Rate/quota code is bounded in design, not verified under PostgreSQL transactions.
F08 configured ceilings are 20 attempts/account or signed guest cookie/day,
3/minute/actor, 200/day/project, 20/minute/project, four shared live leases.
Clearing cookies can create a new guest; these are not per-human limits. Public
air/status calls are outside those AI budgets; many GPS cache keys and image CPU
need operational controls. Five HIGH development dependency advisories remain
visible; no lockfile override or unsupported upgrade was made for a green report.
The fresh registry result traces braces' nested-pattern stack-exhaustion advisory
through micromatch → fast-glob → @next/eslint-plugin-next → eslint-config-next.
These are five affected development packages, not five independently demonstrated
public endpoint exploits. The offered audit fix is a major downgrade to
eslint-config-next 14.2.35; it was not applied to the Next 15 application. Keep
the advisory open until an appropriate compatible fix is independently checked.

No scientific algorithm/model/artifact was altered. Actual native SHAP with
synthetic features verifies computation, not forecast accuracy. Original holdout
rows/predictions and as-of-issuance provider vintages are absent; historical
metadata cannot establish new forecast skill, nationwide applicability, clinical
thresholds or independently calibrated intervals. Required study: licensed QA
reference observations, transparent holdout/calibration separation, CAMS/
persistence/custom baselines at common leads and seasonal/geographic/prospective
evaluation. Community categories and optional AI labels remain suspicions.

## Migration chain and teammate release gates

No SQL was executed. Do **not** bulk-run the repository migration directory or
use an unreviewed `supabase db push`: `0002` is present but A06 is disabled.

| Source migration | Reviewed dependency / handoff action |
| --- | --- |
| 0001_init | Existing base schema, PostGIS, profiles/forecasts/reports/legacy advisor skeleton. Alone, its original reporting view/policies are insufficient for F06 privacy. Review actual extension schema, grants, ownership, legacy rows and migration history. |
| 0002_forecast_publication | Experimental immutable publication RPC/manifests/grant preflight. **Exclude; do not apply, repair its history as applied, or activate publisher.** Retain existing Python/workflow opt-in guards. |
| 0003_account_settings | Owner convenience settings, optimistic revisions, <=10 places. SQL rectangle/trim semantics differ from app polygon/trim validation; resolve and test before hosted integration. No diary migration/sync. |
| 0004_reporting | Depends on 0001, not 0002. Adds v2/consent/confirmed private evidence, source enum, quotas, row guards, restrictive policies, private bucket and coarse allowlist. Enum addition must commit before use; fresh CLI setup splits it with honest separate local history. Never publish legacy rows implicitly. |
| 0005_community_moderation | Depends on 0001+0004, not A06. Adds protected queue/detail/audit reads; real reviewer provisioning, self-review, revisions/withdrawal/concurrency and grants require SQL/SDK tests. |
| 0006_advisor_quotas | Independent of A06 and old advisor_usage skeleton. Dedicated counts/attempts, authenticated/worker RPC grants, atomic reserve/finish and pruning; no prompts/transcripts/coordinates stored. Real actor/guest/shared budgets, day/minute/lease contention require tests. |

Use [the existing separate disposable Windows setup](phase05b-local-supabase-setup.md)
after owner approval; its preparation mechanics were tested previously, Docker/
Supabase runtime and SQL execution were not. Do not point it at the current
hosted project. This review neither installs nor starts Docker/CLI.

Before deployment, groupmates must provide:

1. Fresh approved disposable catalog/grant/RLS/Storage tests; real Auth signup,
   email confirmation/recovery, session replacement, A/B isolation, owner saved
   places and moderator trusted provisioning/revocation. Exercise the full F06
   approve/reject/withdraw/photo deletion journey, not fixture role logic alone.
2. Real concurrent decision/withdrawal and quota races, stale expected-session,
   direct REST/Storage/RPC bypass attempts, cookie/guest resets and day/minute/
   lease boundaries. Captured pre-lock clock/status transaction-time risks in
   F06/F08 remain real-DB audit items, not marked fixed from source inspection.
3. Canonical HTTPS `NIRMOL_SITE_URL`, server-only service-role/Gemini/cookie
   secrets, reviewed public keys, Auth callback allowlist/mail/rate limits and
   private cache/referrer/log redaction. Test the actual deployed environment.
4. Separately approved Gemini model/configuration and capped evaluation.
   `GEMINI_REPORT_MODEL` / `GEMINI_ADVISOR_MODEL` have **no default**; exact live
   model/responseFormat/schema/thinking compatibility is not known from stubs.
   Keep `NIRMOL_REPORT_AI_ENABLED` / `NIRMOL_ADVISOR_ENABLED` off until approved.
5. Report image cleanup schedule and recoverable deletion; intended 90-day
   report expiry, seven-day post-deletion precise-evidence removal and ledger/
   classification pruning need actual verification. Advisor ledgers also need
   maintenance when traffic stops. Assign moderator coverage, redacted monitoring,
   retention ownership, backups/restore and incident response.
6. Provider licensing/quotas/cost limits and map usage policy, deployed latency/
   abuse protection, accessible device/AT/participant testing and reproducible
   scientific evaluation. Do not convert local load results into capacity/SLA
   claims or provisional comparison bands into health certification.

## Final checks, performance and inventory

The interrupted production-browser process completed and preserved all twelve
suite exit receipts. The resumed session verified these receipts rather than
restarting completed browser work. Build `wSeTxXAbZq13BmxXlSo7G` follows the final
date-control CSS correction; no application or executable test file is newer
than that build. Only documentation changed during the resumed session.

Reproduction from `web` (PowerShell):

```powershell
node --test tests/*.test.mjs
npm.cmd run build
node node_modules/typescript/bin/tsc --noEmit
node node_modules/eslint/bin/eslint.js . --max-warnings=0
npm.cmd ls --depth=0
node scripts/run-browser-regressions.mjs "$env:TEMP\nirmol-location-browser\node_modules\playwright"
# Do not rebuild .next or start load while browser suites are running.
$env:NIRMOL_05C_LOAD = 'isolated-local-only'
node scripts/phase05c-load.mjs
$env:NIRMOL_F06_DISPOSABLE = 'false'
$env:NIRMOL_F08_DISPOSABLE = 'false'
node --test tests/reporting.storage.integration.mjs tests/community.storage.integration.mjs tests/advisor.quota.integration.mjs
npm.cmd audit --json
```

The full runner owns/checks loopback 3001–3005, clears actual service credentials,
and uses controlled protocols. Fresh TEMP/TMP roots retain previous receipts;
`nirmol-05a-*` / `05C product` filename prefixes are intentionally retained.
The load runner's existing opt-in name is likewise retained, not live traffic.

From repository root, use the existing isolated, pinned audit Python at
`%TEMP%/nirmol-audit-python-2c0048d179b4405abfa3d7c7b8ce41a1/Scripts/python.exe`:

```powershell
python -B -m unittest discover -s jobs/tests -v
python -B jobs/forecast_runtime.py
git diff --check
```

Python unit output's "Confirmed forecast publication" messages are mock calls;
native smoke explicitly says controlled fixture/publication not called. Real
Supabase suites are run only with both explicit disposable flags false to record
their skips, not to discover/connect to an available project.

### Complete changed-file manifest

Verified final scope: **18 unstaged files, 16 modified and 2 new**, empty index.

| Path | Change |
| --- | --- |
| `docs/phase05d-final-polish.md` | New: independent evidence and release gates |
| `docs/team-handoff.md` | Modified: current verified checkpoint and handoff decision |
| `web/src/app/globals.css` | Modified: native date-control theme hints |
| `web/src/components/ExposureCalculator.tsx` | Modified: custom-source reference boundary |
| `web/src/components/ModeratorDashboard.tsx` | Modified: visible review/queue focus lifecycle |
| `web/src/lib/travel.ts` | Modified: country/custom-source boundary, no numerical change |
| `web/src/lib/simulator.ts` | Modified: current custom-source boundary |
| `web/tests/release-candidate.test.mjs` | New: independent source-eligibility negative/positive tests |
| `web/tests/community.browser.mjs` | Modified: complete keyboard moderation regression |
| `web/tests/product-validation.browser.mjs` | Modified: F03/source/native-theme regressions, all matrix screenshots |
| `web/tests/dashboard.browser.mjs` | Modified: valid reference fixtures for two existing expiry checks |
| `web/tests/exposure.browser.mjs` | Modified: valid custom-source reference fixture |
| `web/tests/travel.browser.mjs` | Modified: valid custom-source reference fixture |
| `web/tests/simulator.browser.mjs` | Modified: valid custom-source reference fixtures |
| `web/tests/travel.test.mjs` | Modified: runtime import resolution and valid reference fixture |
| `web/tests/simulator.test.mjs` | Modified: valid reference fixture, all source assertions retained |
| `web/tests/exposure-diary.browser.mjs` | Modified: deterministic foreground keyboard lock-contention orchestration |
| `web/tests/README.md` | Modified: actual new contracts and regression instructions |

No package/lock, model/training artifact, Python job, migration, workflow, Auth
component/background or hosted configuration is modified. Final Git/hash/secret
pattern/port/whitespace verification and release assessment are recorded below.

### Final verification receipt — resumed 18 October 2026

The final full-browser root is
`%TEMP%/nirmol-05d-release-e1e16ec742174d1580db9ec888a5011e/`.
Its `runner.log` records **exit 0 for all twelve suites**, and every corresponding
`nirmol-05a-regression-<suite>.log` contains a complete passing test summary:

| Browser suite | Passed | Failed / skipped / cancelled |
| --- | ---: | --- |
| Dashboard | 76 | 0 / 0 / 0 |
| Exposure | 14 | 0 / 0 / 0 |
| Travel | 13 | 0 / 0 / 0 |
| Simulator | 22 | 0 / 0 / 0 |
| Diary | 37 | 0 / 0 / 0 |
| Alerts | 54 | 0 / 0 / 0 |
| Auth/account | 34 | 0 / 0 / 0 |
| Reporting | 19 | 0 / 0 / 0 |
| Community/moderation | 25 | 0 / 0 / 0 |
| Advisor | 26 | 0 / 0 / 0 |
| Independent audit | 3 | 0 / 0 / 0 |
| Product validation | 7 | 0 / 0 / 0 |
| **Total** | **330** | **0 / 0 / 0** |

| Other check | Verified result and evidence reuse |
| --- | --- |
| Full web unit/API/maintenance suite | **451 passed, 0 failed/skipped/cancelled**, rerun during resume; `%TEMP%/nirmol-05d-resume-unit.log`, 7.692 seconds |
| Python suite | **55 passed, 0 failed**, rerun during resume; `%TEMP%/nirmol-05d-resume-python.log`, 14.684 seconds |
| TypeScript | Rerun `node node_modules/typescript/bin/tsc --noEmit`, exit 0 |
| Strict ESLint | Rerun `node node_modules/eslint/bin/eslint.js . --max-warnings=0`, exit 0, zero warnings |
| Fresh production build | Reused completed `%TEMP%/nirmol-05d-build.log` and existing build `wSeTxXAbZq13BmxXlSo7G`; Next 15.5.27. It includes all final application fixes and was exercised by the full browser run. No redundant rebuild during resume. |
| Native XGBoost/SHAP | Rerun actual pinned Python/runtime/artifacts: 25 rows, 24 features, SHAP 25 × 25, maximum log1p additivity error **3.814697265625e-06**; controlled inputs, no publication. `%TEMP%/nirmol-05d-resume-native-smoke.log` |
| Real Supabase SDK suites | Reused `%TEMP%/nirmol-05d-supabase.log`: **0 passed, 0 failed, 3 skipped**, explicit disposable flags false. No database connection or migration. |
| Dependency tree | Reused successful `%TEMP%/nirmol-05d-dependencies.log`; package manifest and lock unchanged |
| Full dependency audit | Fresh registry response during resume: **5 HIGH development entries, 0 critical**, expected exit 1; `%TEMP%/nirmol-05d-resume-audit.json` |
| Production dependency audit | Fresh `npm.cmd audit --omit=dev --json`: **0 findings**, exit 0; `%TEMP%/nirmol-05d-resume-audit-production.json` |
| Git whitespace/index | `git diff --check` exit 0; index empty; all work local |

The deterministic total is **836 passed = 451 web + 330 browser + 55 Python**,
with zero failures. The three real-service skips are separate, not counted as
passes. The initially sandbox-blocked npm registry call was rerun with approved
network access. No dependency changes or audit suppression were made.

### Accessibility and visual receipt aggregation

The final product JSON at `nirmol-05c-product-HAD5e0/responsive-receipts.json`
contains **132 states**, zero automated axe violations, zero horizontal overflow,
no body-only keyboard focus and reduced-motion assertions passing. The retained
`nirmol-05a-browser-tFtkkc/axe-receipts.json` contains another **44 states**, zero
automated violations/overflow. There are **61 incomplete manual-review groups**
in these actual receipts (48 product + 13 retained audit), not the historical
05C count of 62. They remain unresolved manual checks, not automatic passes.
F10 additionally records 12 snapshots, 888 text samples and 192 focus checks,
with minimum sampled text contrast 5.08:1.

All 132 product screenshots exist. During resume, selected 320px Bangla dark
Travel and 1280px English dark Community screenshots were visually inspected;
calendar controls are visible and content is readable without clipping. This is
selected visual QA, not a claim that every screenshot received manual inspection.
The maximum cumulative pre-axe layout-shift observation in this final run is
**0.327591** on 320px English Advisor, with recorded language/font restoration
changes; this exceeds the older 05C observation of 0.16062. This remains a
disclosed polish limitation. The raw accumulated observer value is not a field
Core Web Vitals measurement or proof of a new source regression. No broad
rendering refactor was added. Small inline links/checkboxes, chart text contrast,
real screen readers, zoom, physical touch and native pickers still need review.

### Outstanding Phase 05D performance smoke

The complete 05C matrix was **not repeated**. An ephemeral copy of the existing
`phase05c-load.mjs` reused its provider-denying preload, resource/error limits,
credential clearing and five-route assertions, restricted to **10 paced virtual
users for 5 seconds**. It ran against the same final production build. The copy
and receipts remain in TEMP; no tracked load script was changed.

Measured result: **50/50 successful requests**, 0 errors/timeouts, 9.97 requests/s,
p50 **20.69 ms**, p95 **51.04 ms**, peak in-flight 10, peak server RSS **169 MiB**;
five resource samples, one-core CPU median 3.10%, peak 10.84%. Each of Dashboard,
Exposure, Travel, Simulator and synthetic `/api/air` received ten requests. The
upstream adapter used synthetic transports and recorded zero unexpected external
fetch attempts. Owned port 3008 was stopped by the harness.

Receipts: `%TEMP%/nirmol-05d-resume-performance.log`,
`%TEMP%/nirmol-05c-load-tKi8Le/results.json` and `server.log`;
reproducible restricted harness `%TEMP%/nirmol-05d-performance-smoke.mjs`.
The first temporary-copy invocation failed before server startup because its
module resolver searched TEMP for Next; binding it to the original script's
module path fixed the harness. That failed attempt is not a performance result.
These numbers establish only a short warm local HTTP smoke, not production
capacity, real users, remote latency, browser performance or service cost.

### Final local release-candidate assessment

**Phase 05D complete. Ready for final GitHub handoff** of this local release
candidate to the developer and integration teammates. There is no remaining
blocking local regression in the authorized scope. This is not approval of an
unrestricted public launch: hosted Auth/RLS/Storage, real transaction races,
Gemini compatibility/quotas, deployment, maintenance, device/AT/volunteer tests
and scientific validation remain teammate responsibilities. The five HIGH
development findings remain unresolved with their existing documented priority;
historical feature-branch exceptions do not authorize a merge to `main`.

Branch remains `fix/location-reliability`, HEAD remains
`db617c5598e2ac64e209d2ddc2f60e999c1a7fab`. The exact 18-file manifest above is
the final local scope, including the now-updated team handoff. No stage, commit,
push, merge, branch change, deployment, migration, live Supabase/Gemini call or
A06 activation was performed. The protected image SHA-256 remains
`619bd508c8f6128ec00e7c4029864f7e0c9c6250b94ee4a4aa471edaabccd8cd`.

Final read-only reconciliation found no missing/extra manifest paths and no
common credential-pattern matches in added diff/untracked text (not a general
secret-audit guarantee). The protected image's Git blob also matches HEAD.
Loopback test/load ports **3001–3005 and 3008 are all closed**. Whitespace check
passes and the index remains empty; Git's LF/CRLF notices are not failures.

Recommended commit message: `Finalize Phase 05D source guards, accessibility fixes and handoff`.
