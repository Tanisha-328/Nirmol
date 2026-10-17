# Phase 05C: product validation and local performance

Prepared 18 October 2026, Asia/Dhaka. Original repository, branch
`fix/location-reliability`, starting HEAD
`7d345ccc4d6b9e8c3fb7c53e9e787420d9a1bf74`; initial tree/index clean. The owner
committed Phase 05A/05B before this phase. Earlier documents' uncommitted-state
statements are historical receipts, not the current checkpoint.

## Scope and evidence boundaries

Reviewed README/plan, handoff, independent audit, feature matrix, real-world
validation plan, Phase 05B, location, F06, Community/moderation and F08 reports;
current route/handler, source/time/location, UI, calculation, privacy and test
contracts. The historical plan's automatic profiles/anonymous Auth, unrestricted
chat, street routes, fabricated participation and unconditional custom-model
claims do not supersede the implemented safer contracts.

This phase uses the actual production Next application, real browser DOM and
native saved-model/image libraries, with **explicit synthetic transport/protocol
fixtures**. No hosted/local Supabase connection, SQL migration, live Gemini,
Open-Meteo/OpenAQ/tile-provider request, deployment, remote setting, publication,
Git staging/commit/push/merge/reset/rebase or branch switch occurred. The npm
registry advisory query is the only external check; it is not an app provider test.
No participants or physical devices were tested. A06 remains disabled.

Evidence labels here: **C** deterministic application integration; **D** source,
independent arithmetic or actual native artifacts with synthetic inputs;
**E** required real-service/field evidence missing. Narrow actual provider reads
in 05A/05B remain historical evidence at their recorded times, not new 05C data.

## Confirmed defects and corrections

Each correction has a reproducing browser assertion. Existing assertions were
preserved; no database authorization boundary or scientific formula changed.

| ID / priority | Reproduction | Final behavior / paths |
| --- | --- | --- |
| C01 / P2 keyboard continuity | Complete a synthetic F06 report using Tab/Space/Enter. Replacing the form loses focus instead of announcing the receipt. | `PollutionReporting.tsx` focuses the labelled receipt once per report; starting another report focuses its category. Active-user guards prevent focusing hidden/private state. New reporting browser test covers the complete keyboard path and ownership receipt. |
| C02 / P2 bilingual map controls | Switch Community Map to Bangla; Leaflet zoom names remain English. | `CommunityMapCanvas.tsx` creates/removes localized zoom controls on language change, retaining keyboard and bounds behavior. English/Bangla transition test verifies accessible names. |
| C03 / P2 loading stability | Delay the actual map JS chunk; its placeholder is one text line, followed by a 380px map on load. | `CommunityMap.tsx` reserves the existing map viewport (380px phone / 480px larger widths). Test withholds the compiled map chunk before measuring, then resumes normal code. |
| C04 / P2 loading stability | Delay initial advisor status; unconfigured status completion moves the visible footer about **146.8px** at 320px. | `AIAdvisor.tsx` reserves the same initial status-card area for checking/error; existing-session privacy/revalidation behavior is retained. Controlled status response test verifies <=2px footer movement. |
| C05 / P2 navigation stability | At 768px, switching language changes dashboard navigation height by **44px**; font/language wrapping also appears in layout-shift sources. | `Dashboard.tsx` uses stable responsive navigation rows with the same links/order. New test verifies language switch preserves height and button focus; expanded scans check small-screen overflow. |

Red receipts are under `%TEMP%/nirmol-05c-red*`,
`nirmol-05c-reporting-red.log`, `nirmol-05c-focused*` and
`nirmol-05c-nav-red`. Initial test-harness iterations also had a delayed-asset
cleanup race: the failed assertion closed a response before route completion.
The test now identifies the actual compiled chunk, acknowledges the delay and
releases/drains routes before closing. That is not labelled an application defect.

## Feature acceptance matrix

Paths in the test column are under `web/tests` unless stated otherwise. Listed
tests execute actual app components/handlers where appropriate, not just snapshots.

| Feature / acceptance | Meaningful executed checks | Result / limitations |
| --- | --- | --- |
| F01 monitoring: source/units/valid time, regional model versus station, zero/missing/stale/contradictory values, retry | `air.test`, `dashboard.test`, `dashboard.browser`, independent audit oracles/journey | C/D: provenance, wrong grid, invalid units/dates, stale/future reads and recovery are checked. No new live data or station-accuracy evidence. |
| F02 forecast: single-reference custom eligibility, CAMS fallback, intended window/issuance/gaps | Air tests, dashboard browser, location tests; Python refresh tests + independent science tests | C/D: complete/partial windows and hour-owned runs; job requires 24 prior + 25 target hours, ignores irrelevant provider gaps. Real publication E; A06 off. |
| F03 exposure: independent arithmetic, units, validation and provisional categories | Exposure unit/browser, independent 180-case oracle; new parent/worker scenario | C/D: 80×1.5×1.5=180, 80×0.75×2.5=150, resting alternative=60. Child category changes interpretation, not arithmetic. No clinical dose/risk validation. |
| F04 travel: independent step-hour integration, ranking, gaps and Dhaka dates | Travel unit/browser; independent minute-sum oracle across 1,328 departure scenarios | C/D: valid ranked departure comparisons, no gap filling/final extrapolation. One point, not physical routes or minute-resolution pollution predictions. |
| F07 SHAP: saved-artifact full sum/log inversion and run/hour/source association | Native smoke + Python independent artifact test; forecast-explanation/dashboard browser | D/C: full 25×25 SHAP matrix with base value, log1p/expm1, top-three limitations and hour selection. No causal inference or live stored-run verification. |
| F09 diary: session/persistent choice, corruption/export/concurrency, no unintended upload | Diary unit/browser tests; privacy assertions in alerts/report/advisor suites | C: no server diary upload, opt-in persistence, export/delete and corrupt-record recovery. Browser scope is deliberately separate from accounts; logout does not erase a shared browser diary. |
| F10 alerts: in-app threshold/expiry/gaps/dismissal/session behavior | Alerts and preference units; alerts browser including midnight, hidden page and keyboard cases | C: inclusive threshold equality, real zero, expiry/source ownership and session storage. No background push, clinical threshold or delivery guarantee. |
| F14 simulator: independent relative comparisons and hypothetical labelling | Simulator unit/browser and independent 180→37.5 / −79.1667% oracle | C/D: valid comparison/zero denominator, current/forecast validity and assumptions. Indicator change is not health-risk reduction. |
| Auth/My Nirmol: validation, callbacks, CSRF, owner/revision/session races | Auth/account unit/API and 34-case protocol browser suite | C only: actual app and SDK with synthetic Auth/PostgREST, no real mail/login/RLS. Original Auth design/image preserved. |
| F06 report/photos: separate incident point/consent, EXIF removal, retries/private history/withdrawal | Reports/API/cleanup tests, real sharp independent test, reporting browser including new keyboard test | C/D: opaque images, confirmed location, digest-bound retry, delayed/changed-account rejection. Actual Storage policies/deletion/retention E. |
| Community Map: approved-safe contracts, filters/pagination, list/cell agreement and tiles | Community units/browser, independent outage journey, new localization/loading tests | C: empty versus failure, coarse cells, loaded cap, no public photos/text/identity, tile fallback and keyboard list. Real approved-only RLS E. |
| Moderation: actual-user/role contract, self-review/forged roles/revision decisions | Reporting API and Community protocol browser; SQL source review | C/D: synthetic A/B/M/N approval/rejection/conflict and audit behavior. PostgreSQL row locks/grants and provisioning E. |
| F08: minimal validated place/time facts, temporal gaps, bilingual reviewed plans, medical/privacy/failure boundaries | Advisor units/API + 26-case protocol browser; new initial-status layout test | C: Bangla/Banglish fixtures select reviewed Bangla plans; no arbitrary model prose/number/HTML. No live semantic quality, model compatibility or actual atomic quotas. |
| Geography/GPS throughout | Country polygon/winding oracle, location tests and dashboard/report/advisor race/denial browser cases | C/D: registered/manual/GPS evidence, freshness/uncertainty/action-only permission; slow A→B→A cannot relabel old data. Border truth/device GPS performance E. |

## Realistic scenario matrix

These are executed engineering simulations, not genuine participants. Compound
scenarios are covered by their named interacting tests; none is presented as a
single witnessed live service journey.

| # | Scenario | Executed behavior / evidence |
| --- | --- | --- |
| 1 | Student before leaving home | Dashboard modeled source/time → forecast explanation → exposure/travel navigation and outage retry (`independent-audit.browser`); C. |
| 2 | Parent considering outdoor play | New child/adult calculation scenario, stricter provisional copy, no safe-play claim; 180 stays 180; C/D. |
| 3 | Outdoor worker compares activity times | Independent travel integration/ranking + browser allowed range/duration/Dhaka-date cases; heavy/resting arithmetic 150/60; C/D. |
| 4 | Unsupported area | Foreign/out-of-polygon requests and saved points rejected; manual fallback remains, no invented local facts; location/air/advisor/report tests, C. |
| 5 | GPS permission denied | Dashboard/report/advisor denial and manual controls tested; no automatic GPS or incident confirmation; C. |
| 6 | Change location during loading | Cancellation-ignoring late A and A→B→A responses rejected across dashboard/tools/advisor; C. |
| 7 | Missing/stale forecast | Null gaps, stale/future issuance, no best-window extrapolation or borrowed current-to-tomorrow conditions; C. |
| 8 | Bangla-speaking advisor visitor | Synthetic provider plan, Bangla/Banglish prompts, explicit context/provider consent and fixed medical/urgent response; C, not language-model comprehension. |
| 9 | Resident reports suspected waste burning | New keyboard-only photoless submission plus existing safe-photo/private-preview/digest retry cases; pending owner receipt; protocol fixture C. |
| 10 | Moderator reviews report | Separate synthetic reviewer, reasoned approval/rejection, self-review/forged role denial, stale revision conflicts; C, not real DB. |
| 11 | Visitor filters approved map | Category/date/page/list/cell agreement, empty/error distinction, optional tile failure, language/keyboard zoom; C. |
| 12 | Logout and switch accounts | Existing Auth/F06/Community/F08 delayed-response and saved-place cases remove/deny previous private state; diary remains separate browser storage with warning; C. |

## Responsive, accessibility and visual review

The new suite covers eleven public/private-entry routes × 320/768/1280px ×
English/Bangla × light/dark = **132 states**, with reduced motion, real DOM,
keyboard focus, overflow, chart alternative and axe A/AA/2.1/2.2 tags (including
target-size). Existing 360px audit contributes 44 more states using its retained
A/AA/2.1 tags; existing authenticated fixture suites also exercise form widths,
themes, focus and safe image previews. Do not call these physical-device tests.

Final result: **176 states, zero automated axe violations, zero horizontal
overflow**. The new 132-state suite retains **48** incomplete color-contrast
groups; the retained 44-state suite retains **14**, for **62** manual-review
groups (groups can contain multiple nodes and repeat across states). These are
not passed manual checks. First Tab reached a visibly outlined link/button in
all 132 new states; reduced-motion matched in all. JSON retains all violations
and incomplete/manual groups; no rule exclusions or thresholds were relaxed.
Small element rectangles
are observations, not automatic failures: inline links, labelled checkboxes and
spacing/user-agent exceptions need contextual review. Map markers/zoom are at
least 24px; primary form actions are generally 44px. Real touch ease is pending.
The scan records 364 rectangles under 24px across 118 states, predominantly
20px labelled checkboxes and inline attribution/source links; this is not 364
distinct defects. Native date placeholders remain browser-locale dependent.

Visually inspected final Bangla/dark screenshots of dashboard at 320/1280px and
Community/advisor/exposure at 320px: navigation, wrapped scientific/privacy copy,
form labels, empty map and fail-closed advisor remain readable without clipping.
The retained 360px Bangla/light dashboard/advisor and outage screenshots provide
the complementary theme; the automated matrix covers both languages/themes.
Twelve new screenshots are retained. These are selected visual checks, not a
manual review of every rendered state or authenticated state in axe.

Charts retain a labelled forecast-hour control and numeric explanation outside
the hidden graphic. Maps retain a real keyboard-selectable list independent of
tiles; selection focuses details. F06 focus now crosses submission/restart
correctly. Browser Tab/Space/Enter is actual keyboard-event automation, not NVDA,
TalkBack, VoiceOver or a participant comprehension result.

CLS observations use the Layout Instability API before axe runs, with fonts
ready and early-shift sources retained. The test's cumulative observation is not
the standard session-window field Core Web Vital, CrUX or Lighthouse score.
Language preference restoration and font/data timing can affect early shifts.
The targeted navigation/status/map regressions establish concrete improvements;
do not claim all layout shift is eliminated. Physical devices, text zoom/native
pickers, actual screen readers and native Bangla editorial review remain pending.
In this run, pre-axe cumulative observations had median **0.00771**, maximum
**0.16062** (320px Bangla advisor) and 127/132 nonzero states. Early font/language
restoration changes other headers/intro wrapping; diary at 320px reached
**0.14718**. These remain P2 polish work for a future first-render language/font
strategy. Dashboard language-toggle height, delayed advisor status and delayed
map loading pass their targeted regressions. Do not compare these cumulative,
single-run observations directly to a production p75 CLS threshold.
See the [practical volunteer/assistive-technology script](phase05c-real-user-test-script.md).

## Measured local performance

`phase05c-load.mjs` is a maintainable Node HTTP equivalent of a small VU load
runner. It can target only its owned loopback production server on port 3008,
refuses occupied ports, clears all real service configuration and forces A06/AI
off. A test-only preload supplies synthetic air/weather at the transport boundary
and rejects every other external server fetch. It is not imported by the app.

Each stage is a **15-second warm run**, closed-loop 10/25/50/100 HTTP virtual
users, at most one request/second/user, deterministic small stagger, equal mix
of `/`, `/exposure`, `/travel`, `/simulator`, `/api/air` at a public city-reference
fixture. Responses are consumed; every air body checks source/value/location/
25-point shape. Quantiles are nearest-rank over completed requests including
failures. A 4-second timeout, <1 GiB free host memory / >2 GiB server RSS and
error thresholds stop further stages. Untested stages are explicitly recorded.

The preload reports actual Next process CPU/RSS over IPC every second, without
Windows CIM privileges; CPU percentages are relative to one logical core and may
exceed 100%. Peak in-flight requests are reported separately from VU count.
No real DB/Auth/AI, photo processing, tile traffic, browser rendering or deployed
function cold starts are benchmarked. Same-machine client/server, warm static
pages, short duration and synthetic upstream latency limit generalization.
These figures do **not** establish deployed concurrent-user capacity, maximum
throughput, long-run stability or provider/DB quota feasibility.

Final quiet run completed **18 October 2026, 04:12:18 Asia/Dhaka**
(`2026-10-17T22:12:18.035Z`), after all browser suites stopped. Node 24.18.0,
Windows x64, 16 logical processors, 15.633 GiB RAM. No build or other test suite
ran during this repeat. An exploratory run overlapped later browser startup;
its results are excluded from the table.

| VUs | Completed / successful | Req/s | p50 ms | p95 ms | Error / timeout rate | Peak in flight | Peak server RSS MiB | Server CPU p50 / peak, % of one core |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 10 | 150 / 150 | 9.999 | 23.82 | 39.05 | 0% / 0% | 10 | 168.43 | 3.08 / 15.57 |
| 25 | 375 / 375 | 25.000 | 22.04 | 32.54 | 0% / 0% | 19 | 157.47 | 6.13 / 9.26 |
| 50 | 750 / 750 | 49.955 | 19.04 | 40.61 | 0% / 0% | 19 | 173.16 | 12.23 / 15.63 |
| 100 | 1,500 / 1,500 | 99.993 | 22.69 | 39.21 | 0% / 0% | 27 | 212.98 | 21.59 / 29.36 |

All **2,775** measured requests returned 200 and passed body checks, with zero
errors/timeouts. Each stage has 15 resource samples; lowest end-of-stage free
host memory was 4,268.20 MiB. The preload counted 1,114 synthetic provider
responses including warmup, zero unexpected external fetch attempts. Five routes
share each stage equally. Resource usage and p95 show no saturation under this
paced workload; this does not find a maximum. Real upstream calls, many distinct
coordinate cache keys, authenticated RPCs, image decoding and cold deployment
remain potential bottlenecks, not measured performance claims.

Receipts: `%TEMP%/nirmol-05c-load-aeiyml/results.json`, sibling `server.log` and
`%TEMP%/nirmol-05c-load-final.log`. The owned port was checked closed afterward.

## Science, location and privacy findings

No mathematical, scientific-model, source-boundary or location contract needed
changing in 05C. Independent oracles and real native artifact checks pass, but
the original held-out observations/prediction table are still unavailable, so
historical accuracy is not independently recomputed. Metadata is not new evidence.

To establish skill, teammates need licensed, QA-labelled hourly reference PM2.5,
station/instrument identity/calibration and timestamp/averaging semantics; the
original holdout or reproducible evaluation rows; as-of-issuance CAMS/weather
forecast vintages; common eligible-hour CAMS/persistence/model baselines by
1/3/6/12/24-hour lead; missingness/tails, seasonal/monsoon and geographic tests.
Final fitting must not reuse data claimed as untouched interval calibration.
A prospective one-site study alone cannot justify nationwide or multi-season
claims. Full SHAP includes the base/all features in log1p space; the rounded
top three cannot reconstruct a prediction or establish pollution causes.

The pinned country polygon is an approximation with islands/holes, not legal or
current cadastral boundary truth. GPS accuracy describes device positioning,
not CAMS pollution resolution. The custom model remains eligible only at the
Baridhara reference tolerance, not all Dhaka. No OpenAQ measurement is consumed
by the current public air endpoint. Registered city/manual incident coordinates,
current device location and advisor-confirmed place retain distinct consent and
time evidence. Public 0.05° report cells are coarse, not guaranteed anonymous.

No new private content upload or account linkage was added. Diaries remain
browser-scoped and optionally persistent; logout cannot promise to erase them.
Images undergo actual decoding/normalization, not header-only trust. Reporting
photos, descriptions and identities are excluded from public summaries. Advisor
requests exclude exact coordinates, saved names, diary/report history and previous
messages, but a user's question itself can contain sensitive text. Actual DB
authorization, provider handling, deletion schedules and hosting logs remain gates.

## Security, maintainability and groupmate integration

Unchanged application contracts: verified Auth user, CSRF/canonical origin,
expected-viewer/session guards, strict byte/schema/source checks, bounded
requests/retries, private cache headers, enum-only AI plans, fixed worker/bucket
allowlists and revision-based moderation. Existing forged-role, cross-account,
XSS, timeout and failure/retry tests remain intact. No mock database or provider
fallback was added to production. Benchmark fixtures require explicit opt-in and
exist only under scripts/tests.

Source/bundle/secret and final Git checks are recorded in final receipts. Five
HIGH development dependency findings remain visible: braces, micromatch,
fast-glob, @next/eslint-plugin-next and eslint-config-next; zero critical in the
fresh registry result. No dependency override, downgrade, lock or manifest change.

Teammates must perform the existing approved-disposable migration plan (exclude
0002), inspect grants/schema ownership/search paths/RLS/Storage, real signup/mail/
recovery/session replacement, A/B isolation, moderator provisioning/revocation,
real concurrent decisions/withdrawal, actual coarse public access and physical
image deletion. The account SQL/TS constraint difference and quota captured-time/
lock-boundary risks remain open. F08 needs real day/minute/lease/guest/grant tests;
twenty-account-cookie quota is not twenty per anonymous human. Never treat
fixture permission logic or a skipped SDK suite as genuine enforcement.

Before a pilot, assign report cleanup/precise-evidence retention and advisor-ledger
maintenance, private logging/redaction, monitoring/backups/restore, moderation
staff, abuse controls and licensed provider/hosting arrangements. Distinct GPS
queries fragment cache reuse; public/status calls are outside AI budgets. OSM
tiles stay opt-in with attribution/cache/referrer rules and no availability SLA.
Any live Gemini evaluation needs approved exact model, synthetic corpus, budget,
thinking/schema compatibility and native language/safety grading. Do not enable
it or A06 to make the demonstration appear complete.

## Final verification and reproduction

| Check | Final result |
| --- | --- |
| Web unit/API/maintenance | **449 passed, 0 failed, 0 skipped** |
| Browser, all 12 suites against final production build | **327 passed, 0 failed, 0 skipped** |
| Python, all four discovered test modules | **55 passed, 0 failed, 0 skipped** |
| Combined deterministic tests | **831 passed, 0 failed**; six additional grouped tests versus the prior committed checkpoint |
| Real Supabase SDK integration | **0 passed, 0 failed, 3 skipped**; both disposable opt-ins explicitly false, no connection attempted |
| TypeScript / strict ESLint / fresh production build / installed dependency tree | All exit 0; ESLint zero warnings, Next 15.5.27 |
| Native saved XGBoost/SHAP smoke | Exit 0; 24 features, 25 prediction rows, 25×25 SHAP, max log1p additivity error **3.814697265625e-6**; independent varied-input test max **7.404189091e-6** |
| Fresh npm registry audit | Exit 1: **5 HIGH, 0 critical**, retained development chain described above; not a green security audit |
| Whitespace / protected paths / index / branch / Auth image | Pass; detailed boundaries below |

Browser counts: dashboard 76, exposure 14, travel 13, simulator 22, diary 37,
alerts 54, Auth 34, reporting 19, Community 24, advisor 26, independent audit 3,
product validation 5 = 327. A grouped browser test may loop many states; axe
states and HTTP load requests are not added to the 831 test total.

Reproduction from `web` (PowerShell; use installed Playwright path explicitly):

```powershell
node --test tests/*.test.mjs
npm.cmd run build
node node_modules/typescript/bin/tsc --noEmit
node node_modules/eslint/bin/eslint.js . --max-warnings=0
npm.cmd ls --depth=0
node scripts/run-browser-regressions.mjs "$env:TEMP\nirmol-location-browser\node_modules\playwright"
# Wait for the entire runner to exit before load or rebuild.
$env:NIRMOL_05C_LOAD = 'isolated-local-only'
node scripts/phase05c-load.mjs
$env:NIRMOL_F06_DISPOSABLE = 'false'
$env:NIRMOL_F08_DISPOSABLE = 'false'
node --test tests/reporting.storage.integration.mjs tests/community.storage.integration.mjs tests/advisor.quota.integration.mjs
npm.cmd audit --json
```

Python from repository root, using the already-installed isolated audit Python
(`%TEMP%/nirmol-audit-python-2c0048d179b4405abfa3d7c7b8ce41a1/Scripts/python.exe`),
not replacing the owner's Python environment:

```powershell
python -B -m unittest discover -s jobs/tests -v
python -B jobs/forecast_runtime.py
git diff --check
```

Python 3.14.0; native pinned XGBoost 3.4.1, NumPy 2.5.4, pandas 3.0.6.
Playwright 1.64.1, headless Edge 155.0.4283.62, axe 4.14.0. Python unit output's
"Confirmed forecast publication" lines are mocked publisher calls, not A06 or
database activity; native smoke explicitly says publication not called.

Retained final receipts (local TEMP may later be cleaned):

- `%TEMP%/nirmol-05c-{unit,python,supabase,typescript,eslint,build,dependencies,native-smoke}.log`.
- `%TEMP%/nirmol-05c-npm-audit.json` is the actual successful registry query;
  a first sandboxed network attempt failed and is not substituted for the audit.
- Full browser root: `%TEMP%/nirmol-05c-final-24cce25f6b944d31ae1777dd894e09e5/`,
  `runner.log`, twelve `nirmol-05a-regression-*.log` files. Historical filename
  prefix retained, not historical results reused.
- Within that root: `nirmol-05c-product-wZ4TgO/responsive-receipts.json` plus 12
  screenshots; `nirmol-05a-browser-fNO9C7/axe-receipts.json` plus 3 screenshots.

Final read-only checks confirm HEAD/branch unchanged and index empty. All 14
files are unstaged. No package/lock, model/scientific artifact, job, migration,
workflow, Auth source or approved background changed. Background SHA256 remains
`619bd508c8f6128ec00e7c4029864f7e0c9c6250b94ee4a4aa471edaabccd8cd`.
Scoped source/browser-bundle literal-secret scans are supplementary pattern
checks, not proof that any deployed environment/logs are secure. No private
environment file was opened. All owned test/load ports were checked closed.

### Complete changed-file inventory

Nine modified, five new; prior Phase 05A/05B work was committed by the owner
before this phase and is preserved.

| Path | Status / purpose |
| --- | --- |
| `docs/team-handoff.md` | Modified: current checkpoint, outcomes and remaining gates |
| `docs/phase05c-product-validation.md` | New: this evidence report |
| `docs/phase05c-real-user-test-script.md` | New: unexecuted volunteer/device/AT protocol |
| `web/src/components/PollutionReporting.tsx` | Modified: receipt/restart keyboard focus |
| `web/src/components/CommunityMapCanvas.tsx` | Modified: bilingual Leaflet zoom controls |
| `web/src/components/CommunityMap.tsx` | Modified: map loading viewport reservation |
| `web/src/components/AIAdvisor.tsx` | Modified: initial access-status space reservation |
| `web/src/components/Dashboard.tsx` | Modified: stable responsive navigation rows |
| `web/scripts/run-browser-regressions.mjs` | Modified: full 12-suite runner, explicit product-only selector |
| `web/scripts/phase05c-load.mjs` | New: opt-in owned-loopback HTTP load measurement |
| `web/tests/helpers/product-load-hook.cjs` | New: external-fetch denial, synthetic transport, CPU/RSS IPC |
| `web/tests/product-validation.browser.mjs` | New: five grouped product/accessibility/layout tests |
| `web/tests/reporting.browser.mjs` | Modified: appended keyboard submission test |
| `web/tests/README.md` | Modified: accurate runner/load/skip instructions |

## Readiness and handoff decision

**Ready for controlled disposable database integration by teammates, with the
existing approval, migration-exclusion and synthetic-account safeguards. Not
verified for an unrestricted real-user pilot or production launch.** No new
application P0/P1 was reproduced in this scope; five P2 UI defects are corrected.
Residual first-render layout shifts, manual contrast/AT/Bangla review and known
development advisories remain visible. Test success does not close any E gate.

Before a real-user pilot, teammates must supply actual PostgreSQL/RLS/Storage/
concurrency/Auth/quota evidence, operational moderation/cleanup/logging/backups,
provider licensing and cost limits; approve separate capped live Gemini tests;
run the consented physical-device/AT/volunteer protocol; and validate scientific
forecast skill/intervals using defensible held-out/prospective data. A public
modeled-data demonstration can be reviewed locally with honest provenance;
account/report/AI production readiness must not be inferred from protocol stubs.

Recommended later commit message (not executed):
`Fix product accessibility and layout defects; validate Phase 05C workflows`.
No stage, commit, push, merge, deploy, migration or A06 activation was performed.
