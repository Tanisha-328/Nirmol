# Phase 1: location reliability review

Reviewed **17 October 2026 (Asia/Dhaka)**. This is local engineering/fixture verification, not a production-readiness certificate. No commit, push, merge, deployment, database migration, workflow dispatch or remote-setting change is part of this work. A06 remains disabled by the existing code/workflow guards; external settings are not verified.

## 1. Repository and feature evidence

Initial working tree was clean. Starting branch `fix/air-forecast-reliability` and HEAD `1abf56068e7d7465127107208806220af2721f51` matched the reported checkpoint. Read-only `git ls-remote --heads origin` verified both remote owner feature branches at that hash, and `main` / `feature/pollution-reporting` at `94c402e147be8de5d09416da6384c55565ab93c7`. Local cached remote refs matched those advertised tips, so no fetch/merge was necessary. HEAD descends from remote main, **12 ahead / 0 behind**. A new local branch, `fix/location-reliability`, preserves that exact HEAD and all history. Changes remain unstaged/uncommitted for owner review.

Read `docs/plan.md`, `docs/team-handoff.md`, `README.md`, `docs/model_evaluation.md`, the relevant web modules/tests, all three SQL migrations, their SQL tests and both workflows. No applicable `AGENTS.md` was found. Inspected the actual tree of `origin/feature/pollution-reporting`, not just its name: it is the original main tree. F06 reporting and Community Map have schema skeletons (`pollution_reports`, `report_reviews`, `public_reports`); F08 has an `advisor_usage` skeleton. There are **no implemented submission, moderation, map, advisor UI or advisor API routes** in these inspected tips. Member 02 completion is not assumed. Future unadvertised/unpushed teammate work cannot be assessed.

## 2. Current location architecture

| Surface | Selection, restoration and requests |
| --- | --- |
| Dashboard `/` | Static bilingual `PLACES` selector; new offline registry search; GPS only after the My location button. `nirmol.loc` stays in browser localStorage. Default Dhaka is a city reference, not a GPS fix. |
| F03 `/exposure` | Restores via `dashboard-location.ts`, then fetches `/api/air`. Local changes stay on this page. Only current-data mode uses the response; hypothetical input is separate. |
| F04 `/travel` | Same restoration, independent cancellable forecast request. `travel.ts` remains the sole departure-window/integration authority. This is one-place departure-time comparison, not routing. |
| F14 `/simulator` | Same restoration; hypothetical mode makes no environmental request. Current/forecast modes delegate to existing F03/F04 calculations. |
| F10 `/alerts` | Already used shared restoration and a restoration gate. Continues using receipt time, source/issue/valid time, location identity and request revision. Preferences remain tab-session-only; no background service. |
| F09 `/diary` | User chooses a registered activity place. Historical snapshots, browser storage and calculations are unchanged; no diary content is attached to environmental requests or future contexts. |
| My Nirmol | Explicitly saved, owner-scoped places from `/api/account`, not device GPS or automatic dashboard synchronization. `AccountAir` already remounts under a coordinate key and aborts old requests. No confirmed ownership defect required changing it. |
| `/api/air` | Public GET. Validates one nonempty finite lat/lon pair against the country polygon, then forwards exact selected coordinates to server-only environmental adapters. Responses are `no-store`. |
| `/api/account` | Uses `parseAccountSettings`, now benefiting from the shared polygon country check; saved places remain opt-in and account-authenticated. |

Registered names/coordinates come from the existing repository registry, plus the explicitly named evaluation reference from `jobs/build_training_data.py` / `jobs/refresh_forecast.py`. Custom coordinates receive the closest registry label as orientation only; there is **no reverse geocoding, address verification or neighborhood-coverage claim**. Legacy selections without evidence remain distinguishable from a fresh GPS reading by the new saved-coordinate notice. Registry points are reference points, not inferred user positions.

`getAirReport` independently obtains CAMS PM2.5 from Open-Meteo air quality, current weather from Open-Meteo weather, and eligible stored Nirmol publications from Supabase. The current and forecast sources can differ. No live OpenAQ station or AirGradient sensor values are currently consumed by this API. The old `DataKind` union/schema does not establish measured coverage: current provenance validation accepts model estimates only. Future reference-grade measurements and low-cost sensors require distinct source types, real observation times and sensor metadata; neither can be relabeled CAMS.

## 3. Confirmed defects and changes

| Severity | Evidence / affected files | Implemented correction |
| --- | --- | --- |
| P1 geographic correctness | `places.ts`: rectangle admitted Agartala, Shillong and offshore corners. Also affected API, saved selections and account validation. | Pinned ADM0 multipolygon with islands/holes and finite WGS84 bounds, shared by server and clients. No country-expanding buffer. API rejects duplicate/missing/blank coordinate parameters before providers. `getAirReport` independently rejects unsupported coordinates. |
| P1 scientific scope | `places.ts`: arbitrary 20 km radius around a different Dhaka point applied a single-site model beyond its evaluation location. | Only the training/evaluation reference `(23.796374, 90.424614)` is eligible; `1e-6` degree comparison tolerance accommodates numeric representation, **not a validated area or accuracy radius**. Added an explicitly named registry option. Other Dhaka locations use CAMS. `readAirReport` rejects custom provenance outside the reference even if a response falsely asserts eligibility. |
| P1 location consistency | F03/F04/F14 each independently repaired mismatched IDs to registry coordinates, or treated unknown IDs as custom, unlike Dashboard/F10. Restored tools could start a default request before restoration. | One shared parser/restorer; unknown IDs and mismatched ID/coordinates fail closed, explicit null IDs retain exact custom coordinates. A restoration gate prevents default-location requests before resolving the selection. No stored content is silently deleted. |
| P2 coordinate ownership | `air-validation.ts`, F03 current reader, `travel.ts`, `simulator.ts` accepted a response within `0.0001` degrees of the selected location. | Exact response/request echo required; close places can share model values but cannot acquire each other's labels. Existing active/abort/revision guards retained. |
| P2 GPS reliability | Dashboard discarded accuracy/capture time, reused fixes up to ten minutes old and conflated errors. | Pure GPS validator; maximum capture age two minutes; at most one minute future clock skew; >1,000 m accuracy rejected as a **product threshold**. Missing accuracy remains null/unknown, never invented. Distinct bilingual denied/unavailable/timeout/invalid/outside/poor/expired messages. Requests ask `maximumAge:0`; 11-second UI deadline invalidates even nonresponding transports. Repeated attempts/manual selection/unmount invalidate old callbacks. |
| P2 source fidelity | `air.ts` rounded the provider request to four decimals and dropped returned grid coordinates. | Forward the exact selected point; retain validated provider-returned CAMS grid centre as optional `camsGrid`, without inferring cell size or a station. New UI explains regional/grid limits and absence of live stations. Missing metadata stays absent. |
| P2 scientific wording | `i18n.tsx` generalized one-site winter CAMS comparison to Bangladesh. | Historical bias text now refers to the evaluated Dhaka reference only and disclaims transfer to other locations. |
| P2 local secret-file protection | Root ignore rules covered `.env` / `.env.local` but not every root environment variant. | Ignore `.env*`, explicitly allow placeholder `.env.example`. No secret-file contents were read or modified. |

Offline bilingual search filters the existing eleven cities and one evaluation reference; the full selector remains available on empty search and without a connection/login. It intentionally adds no geocoder, provider quota, external search logging or fabricated neighborhood results. Existing UI styles and approved Auth image/design are preserved. The dashboard now uses the mandated tagline, **“Cleaner air, brighter lives.”**, with a Bangla translation. The only additional client cost is static geometry/validation and the controls; the production build reports dashboard first-load JavaScript **259 kB** versus the earlier handoff's 229 kB. This is not a measured network/performance benchmark.

Exact implementation paths: `.gitignore`; `web/src/app/api/air/route.ts`; `web/src/components/{Dashboard,ExposureCalculator,TravelPlanner,WhatIfSimulator}.tsx`; `web/src/lib/{places,location,dashboard-location,air,air-validation,travel,simulator}.ts`; `web/src/lib/i18n.tsx`; `web/src/lib/data/{bangladesh.ts,bangladesh-source.md}`. Exact test/documentation inventory appears in section 10 and the supplied full diff. No Auth component, image, package manifest/lockfile, Python model/job, workflow or SQL file was changed.

## 4. Location accuracy, environmental resolution and forecast error

These are different quantities. A city point is a selected reference with no GPS accuracy claim. A browser GPS fix supplies a coordinate, native capture timestamp and (when available) an accuracy radius in metres; its displayed radius is retained exactly. Restoring that selection does not obtain or timestamp a new fix. Manual city selections record selection time and their source. Old selections remain historical coordinates until the user explicitly requests/chooses a location again.

CAMS is regional model output. The provider-returned latitude/longitude identifies its selected grid centre when supplied; it is not a monitoring-station position or evidence of street-scale pollution. No numeric resolution, nearest-station distance, traffic/sensor density or confidence score is synthesized. Nearby selected coordinates may legitimately receive the same grid centre and values. Full coordinate precision does not increase pollution resolution.

Nirmol's XGBoost model corrects CAMS using historical measurements at one Baridhara reference site. The evaluation reports held-out MAE 51.1 and RMSE 76.6 µg/m³ over 3,395 hours; these are historical aggregate errors, not GPS precision, site-wide confidence, live-provider verification or verified 24-hour-ahead skill. Historical CAMS inputs were near-analysis data. No new model is trained and no algorithm is changed. Reference-only eligibility is a conservative scope correction, not a new validation claim.

PM2.5 concentration remains separate from indicative PM2.5-based AQI; hourly indicative AQI is not official EPA NowCast. Exposure remains concentration × time × activity factor, with provisional comparison bands, not diagnosis. F04 compares departure hours at one selected place. Genuine stored SHAP remains hour/run/issuance-owned attribution on `log1p` output, not proof of pollution causes. All existing freshness, complete/partial hourly coverage, publication validation, fallback, missing-as-null and zero-valid rules are retained.

## 5. Sources, coverage and privacy limitations

The pinned [geoBoundaries metadata](https://www.geoboundaries.org/api/current/gbOpen/BGD/ADM0/) identifies `BGD-ADM0-71232402`, represented year **2015**, build **12 December 2023**, source geoBoundaries/Wikimedia Commons, **CC0 1.0** dataset license. Geometry comes from [revision 9469f09](https://github.com/wmgeolab/geoBoundaries/blob/9469f09/releaseData/gbOpen/BGD/ADM0/geoBoundaries-BGD-ADM0.geojson), downloaded through the GitHub LFS media host. Original GeoJSON: **66,748 bytes**, SHA-256 `7ea26da4885354041422911ee5dfc631b687792ade960b15c88b8c44f14f5470`, **17 polygons**. `bangladesh.ts` preserves original coordinates without simplification/rounding. Tests establish useful fixture cases, not comprehensive border truth. Historical generalized river/coastal boundaries and small islands still require current authoritative verification; false exclusions/inclusions near the line remain possible. This is not a legal boundary service.

No external geocoder is implemented. Arbitrary neighborhood/address search and manual incident-map picking remain future work. A future provider must be reviewed for attribution, access policy, country filtering, server validation, caching, throttling, bounded requests and costs. The [Open-Meteo geocoding documentation](https://open-meteo.com/en/docs/geocoding-api) was reviewed as an option; no live geocoding request or integration is claimed.

Environmental attribution and source provenance remain visible. [Open-Meteo air-quality documentation](https://open-meteo.com/en/docs/air-quality-api) distinguishes returned model coordinates and source models. [Its terms/privacy policy](https://open-meteo.com/en/terms) describes noncommercial limits and possible coordinate-containing provider logs retained up to 90 days. Existing GET environmental requests send coordinates to Nirmol, Open-Meteo and the browser/provider transport stack; deployment/access-log redaction still requires verification. Source code adds no coordinate logging. Bounded requests and 900-second upstream caching remain; distributed abuse protection and aggregate provider quotas have **not** been proven. Exact-coordinate cache keys may reduce reuse for varying GPS fixes. Commercial use requires a separately reviewed provider arrangement.

`nirmol.loc` is browser-local convenience storage, not account storage or confidential storage. It may persist across sessions and be visible on a shared device; there is no account/cross-device GPS synchronization. Saved account places remain explicit owner actions. New context helpers read no browser storage, device API, account, diary, symptoms or notes. Account SQL's existing rectangle constraint is unchanged: direct owner-authorized PostgREST writes can still differ from the application's polygon validation. Review an additive database validation change separately; do not apply migrations in this phase.

## 6. F06 reporting and Community Map integration contract

Use `confirmedLocationContext(selected, confirmedAt, nowMs)` only **after explicit confirmation** on the reporting flow. It returns an allowlist `{lat, lon, source:'confirmed-selection', confirmedAt, coverage:'BD-ADM0-71232402'}`. Confirmation must be within five minutes (one-minute future skew); the helper preserves exact coordinates and rejects unsupported points. It is validation, **not an authorization token or proof of device ownership**. Repeat validation server-side and derive reporter identity from real server Auth.

Keep `incidentLocation` separate from `currentLocation`. GPS/selected city may help position a map but must never silently establish the incident point. Display the incident pin/reference to the reporter for correction and confirmation, including GPS capture/accuracy if the reporter explicitly supplies it. Do not label a city centre as the exact incident location. A map pin picker/geocoder remains necessary for precise manual reporting beyond registry references. Revalidate a changed/expired selection and tie any air request to its exact owner/revision.

Store incident precision privately under owner/moderator RLS. Generate reduced public precision **on the server**, with a reviewed product policy appropriate to report sensitivity; never trust client `public_location` or expose the private coordinate/accuracy/reporter. Do not imply coarsening proves anonymity. Public reads include approved/forwarded/resolved reports only and minimize descriptions/photo metadata as well. Strip EXIF/GPS from verified image formats before storage; enforce authenticated ownership, MIME/signature, byte/dimension limits, bucket policies and bounded AI costs. Gemini's suggestion requires human category confirmation and moderation. Do not create synthetic reports as if genuine.

The schema currently allows the client to supply `public_location`; no reducer, storage policy, upload validation or application moderation workflow is implemented. The public view also contains free-text description and photo path. These are **P1 privacy/release blockers before public reporting**, not evidence of a safe finished map. No SQL changes or live RLS tests were performed here.

## 7. F08 advisor integration contract

The advisor must ask which location/context the user confirms; it must not request GPS implicitly or read saved account/diary state automatically. Use the same confirmed-location allowlist and independently refresh validated `/api/air` data for those exact coordinates. Attach an explicit environmental snapshot with current/forecast source/kind, valid times, known issuance, retrieval time and actual gaps/coverage. Omit unavailable values instead of zero. Recheck freshness at submission and prevent late replies for A being shown under B. GPS accuracy is location metadata, never forecast confidence.

Optional travel/exposure facts must come from existing validated F03/F04 functions and confirmed input. Account-place context is separate opt-in; private diary/symptoms/notes stay excluded. This phase adds no diary export or advisor upload path. The confirmation helper deliberately excludes arbitrary fields.

Build a real protected Next.js server route before connecting external AI: server-only credentials, real authorization/CSRF as applicable, bounded input/timeout/retries, atomic daily quota and distributed cost controls. `advisor_usage` alone does not enforce them. Keep chat session-only; add deterministic safety tests for invented numbers, unrelated requests, medical claims, quota/provider failure and cancellation. Quotes of environmental numbers must trace to supplied validated facts. No advisor route, fabricated response or external-AI model-training claim is introduced here.

## 8. Verification results

All environmental, Auth/PostgREST and publication responses used by automated suites are deterministic fixtures. Downloading a public boundary/reading provider documentation is source verification, not a live pollution, station, GPS or geocoding check. Browser tests use Edge and temporary Playwright outside application dependencies. Python uses the existing isolated Python 3.14 environment and real saved artifacts with controlled inputs; its publication messages are mock-test output, not database writes.

| Check | Command / conditions | Passed | Failed |
| --- | --- | ---: | ---: |
| Web units | From `web`: `node --test tests/*.test.mjs` | 326 | 0 |
| Dashboard/location browser | `node tests/dashboard.browser.mjs <Playwright-path>` | 76 | 0 |
| F03 browser | `node tests/exposure.browser.mjs <Playwright-path>` | 14 | 0 |
| F04 browser | `node tests/travel.browser.mjs <Playwright-path>` | 13 | 0 |
| F14 browser | `node tests/simulator.browser.mjs <Playwright-path>` | 22 | 0 |
| F09 browser | `node tests/exposure-diary.browser.mjs <Playwright-path>` | 37 | 0 |
| F10 browser | `node tests/alerts.browser.mjs <Playwright-path>` | 54 | 0 |
| Auth/My Nirmol browser | `node tests/auth.browser.mjs <Playwright-path>`; separate protocol fixture/server | 34 | 0 |
| Python unit regression | From repo root, isolated Python 3.14: `python -B -m unittest discover -s jobs/tests -v` | 51 | 0 |
| **Test totals** | **326 web units + 250 browser cases + 51 Python cases** | **627** | **0** |

`npx.cmd tsc --noEmit`, `npm.cmd run lint -- --max-warnings=0` and a fresh `npm.cmd run build` each exited **0**. Build: Next.js 15.5.27 / Node 24.18.0; 11 static pages generated, with dynamic account/Auth/API routes retained. `python -B jobs/forecast_runtime.py` exited **0** using 24 real model features, 25 controlled forecast rows and genuine log1p SHAP, with `publication: not called`. No model retraining or live-provider call was made.

The fixture browser server used `127.0.0.1:3001`; Auth starts/stops its own isolated server at 3002. Both owned servers were stopped after testing; independent TCP probes returned `ECONNREFUSED` for both ports. Temporary Playwright path: `%TEMP%/nirmol-location-browser/node_modules/playwright`. Logs: `%TEMP%/nirmol-location-*-final.log` and `%TEMP%/nirmol-location-python.log`. Bilingual desktop/narrow layouts, light/dark themes, accessible names, keyboard/focus, loading/error/expired states, GPS errors/races and offline/empty search were exercised. Four additional fixture screenshots at 320/1280 px in both languages were generated under `%TEMP%/nirmol-location-review`; mobile English and desktop Bangla were visually inspected. No real screen-reader session or phone GPS test is claimed.

The approved Auth background SHA-256 remains `619bd508c8f6128ec00e7c4029864f7e0c9c6250b94ee4a4aa471edaabccd8cd`. Source/history credential checks covered **141 unique historical text objects and 92 working-tree text files** before adding this report, with no credential findings under the checked provider/private-key/connection-string/service-role-JWT patterns. An initial broader assignment heuristic's two candidates were a UI password label and a controlled Auth test fixture, not private credentials. Tracked/history environment-file names showed `.env.example` only. This is a heuristic local audit, not proof that no secret exists anywhere in an external account or deployment; no secret values are reported.

Initial targeted geographic regressions: **1 passed / 3 failed** against the original helpers, establishing the foreign-territory and model-radius defects. After fixes, full web units passed **326/326**. Early full runs exposed stale custom-model fixtures and three test loaders that assumed `places.ts` had no imports; fixtures now select the actual reference and loaders resolve geometry recursively. No forecast/SHAP assertion was removed. A fixture previously using an unknown ID for a custom location now uses the documented explicit null ID. The new outside-reference regression rejects a forged custom-model response.

An initial dashboard browser run passed 2 cases before Edge crashed opening subsequent pages; the failed page-creation attempts are not passes. A subsequent run identified the restoration-gate regression and a duplicate accessible section/control name; both were fixed before the fresh build. PowerShell's initial Unicode pipe damaged newly added Bangla test literals; these were corrected with UTF-8-safe patches and verified by the bilingual browser test. All final browser runs use the stopped/rebuilt/restarted app. Production build and zero-warning ESLint success do not establish real screen-reader/device usability or deployed readiness.

## 9. Remaining verification and release blockers

- Validate current authoritative border/river/island geography and a representative real-device GPS matrix, including permission revocation and accuracy behavior. No phone field test or actual screen-reader session is claimed; accessible roles/labels, keyboard/focus and responsive DOM checks are automated.
- Verify live Open-Meteo units/times/grid metadata, outage behavior, attribution, aggregate quotas and hosting log retention/redaction. No live pollution/provider probe was executed this phase.
- Independently validate actual database/RLS/Storage policies and Auth on a disposable hosted environment. Do not bulk-run `supabase db push`, apply `0002`, or activate A06. External deployment settings remain unknown.
- F06 precision reduction, real incident-point confirmation, secure photo pipeline, moderated public access and ownership remain prerequisites. F08 protected routes, consent, atomic quota/cost enforcement and real safety evaluation remain prerequisites. The shared location contract is ready for local integration work; those backends are not implemented by this audit.
- The inherited development `braces` advisory **GHSA-vfj7-8cjw-p6xm** remains unresolved and unsuppressed. No dependency manifest/lockfile remediation is claimed. Native GitHub Linux CI, hosting performance/concurrent capacity and production Auth/database integration remain unverified.

Recommended next step: implement F06 backend in an isolated feature branch, beginning with an explicit incident-location request contract, server-derived public coarsening and disposable RLS/Storage tests. Keep schema work additive and unapplied until separately authorized. Connect the real submission/moderation/map UI only after those ownership/privacy rules pass; do not wait on or fabricate F08.

## 10. Review inventory and delivery

Additional changed tests: `web/tests/{location.test.mjs,air.test.mjs,dashboard.browser.mjs,alerts.test.mjs,alerts.browser.mjs,account.test.mjs,simulator.test.mjs,exposure-diary.test.mjs,exposure.browser.mjs}` plus `web/tests/README.md`. Documentation: this review, `docs/team-handoff.md` and the boundary-source record. `location.test.mjs`, `location.ts` and the geometry/source record are new files and must be included in the owner's review/commit.

Proposed commit message: **`Fix Bangladesh location provenance, coverage and cross-tool reliability`**. No commit is made. The supplied complete diff includes tracked and new files; generated browser screenshots, dependency installs, logs, build output, local environment files and private data are excluded from the repository changes.

### Complete changed-file manifest

28 paths; all changes remain local and unstaged.

- `.gitignore`
- `docs/location-reliability-review.md`
- `docs/team-handoff.md`
- `web/src/app/api/air/route.ts`
- `web/src/components/Dashboard.tsx`
- `web/src/components/ExposureCalculator.tsx`
- `web/src/components/TravelPlanner.tsx`
- `web/src/components/WhatIfSimulator.tsx`
- `web/src/lib/air-validation.ts`
- `web/src/lib/air.ts`
- `web/src/lib/dashboard-location.ts`
- `web/src/lib/data/bangladesh-source.md`
- `web/src/lib/data/bangladesh.ts`
- `web/src/lib/i18n.tsx`
- `web/src/lib/location.ts`
- `web/src/lib/places.ts`
- `web/src/lib/simulator.ts`
- `web/src/lib/travel.ts`
- `web/tests/README.md`
- `web/tests/account.test.mjs`
- `web/tests/air.test.mjs`
- `web/tests/alerts.browser.mjs`
- `web/tests/alerts.test.mjs`
- `web/tests/dashboard.browser.mjs`
- `web/tests/exposure-diary.test.mjs`
- `web/tests/exposure.browser.mjs`
- `web/tests/location.test.mjs`
- `web/tests/simulator.test.mjs`

The full patch is supplied separately as `%TEMP%/nirmol-location-review/phase1-complete.diff`; it includes the five new files as well as tracked-file changes. Final remote-tip comparison remained unchanged from section 1.
