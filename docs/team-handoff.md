# Nirmol team handoff

**Phase 05C local product validation, 18 October 2026 (Asia/Dhaka):** started
clean at owner-committed `7d345ccc4d6b9e8c3fb7c53e9e787420d9a1bf74` on
`fix/location-reliability`; branch/HEAD remain unchanged. The earlier 05A/05B
uncommitted-state statements below are historical. Their existing work is
preserved. Five reproduced P2 corrections: F06 receipt/restart keyboard focus,
bilingual map zoom controls, reserved map/advisor loading space and stable
dashboard navigation rows. No scientific formula, model, backend/migration,
package/lock, Auth design/background or A06 safety guard changed.

Final full regression: **449 web + 327 browser + 55 Python = 831 passed, zero
failed**. All twelve browser suites pass against the fresh production build.
Real Supabase SDK suites: **0 passed, 0 failed, 3 skipped**, with opt-ins forced
false; no hosted/local DB or live Gemini request occurred. TypeScript, strict
zero-warning ESLint, build, native SHAP, dependency-tree and whitespace pass.
Fresh registry audit still reports **5 HIGH development findings, 0 critical**.
The 132 new axe/keyboard states plus 44 retained states have zero automated
violations/overflow; **62 incomplete manual groups** remain. Early font/language
layout shifts persist (maximum observed cumulative value 0.16062), not claimed
as production Core Web Vitals. No real volunteers, physical devices or AT tested.

Isolated warm HTTP load: 10/25/50/100 paced VUs, 15 seconds each, **2,775/2,775
successful requests**, zero errors/timeouts; p95 **39.05/32.54/40.61/39.21 ms**.
Peak actual in-flight 27, peak server RSS 212.98 MiB; all upstreams synthetic.
This establishes no deployed concurrency/cost capacity. Full measured CPU,
throughput, latency and resource receipts are in the report.

See [05C feature/scenario evidence, exact receipts and 14-file manifest](phase05c-product-validation.md)
and [planned consented volunteer/device/AT protocol](phase05c-real-user-test-script.md).
**Ready for controlled disposable integration by teammates; not verified for an
unrestricted real-user pilot or production launch.** Real RLS/Storage/Auth,
concurrent moderation/withdrawal, quotas, approved capped live AI, licensed data,
prospective scientific evaluation, moderation/cleanup/monitoring and participant
testing remain gates. Fourteen unstaged files (9 modified, 5 new), empty index;
no stage, commit, push, merge, deploy, migration or A06 activation.

**Phase 05B partial real-service verification, 18 October 2026 (Asia/Dhaka):**
HEAD remains `a85a824b15af8ee4de49d04749f504560e358bf3`, branch
`fix/location-reliability`. Phase 05A was **not committed**; its 18 files were
preserved. The owner prohibited access to the existing Supabase project and
declined live Gemini. No disposable target or Docker/Podman/psql/Supabase CLI was
available. Real SDK result: **0 passed, 0 failed, 3 skipped**; no SQL/migration,
Auth identity or Storage operation ran. RLS/concurrency remain unverified.

One actual public production HTTP/browser read passed without air-response mocks:
Dhaka city reference, 17 Oct 21:08 UTC, CAMS 78.7 µg/m³ valid 21:00, 25 forecast
hours, weather and forecast explanation navigation. This is regional modeled
information; ordinary production cache can apply. No live AI request occurred.
Fresh deterministic regression: **449 web + 321 browser + 55 Python = 825 passed,
zero failed**; 44 axe states, zero automated violations/overflow, 12 manual groups.
TypeScript, strict ESLint, production build, native SHAP and whitespace pass.
Five HIGH dev dependency findings remain. No new application P0/P1 was reproduced.

See [05B evidence, exact receipts and release gates](phase05b-real-service-verification.md)
and [Windows local disposable setup, not executed](phase05b-local-supabase-setup.md).
WSL/resources make local setup plausible after prerequisites; Docker execution
and virtualization remain unproven. The guide excludes 0002 and preserves honest
separate local migration history. Combined tree: **21 unstaged files (11 modified,
10 new)**, empty index. No commit, push, deploy, hosted change or A06 activation.
Next is synthetic real-DB/staging validation; full real-user/funded operational
pilot readiness remains unestablished.

**Phase 05A independent audit, 18 October 2026 (Asia/Dhaka):** started clean on
`fix/location-reliability` at `a85a824b15af8ee4de49d04749f504560e358bf3` (Phase 04
committed). Independent tests reproduced provider-coordinate, public-key selection,
slow-body, calendar, rolling-history and accessibility defects; local fixes preserve
existing features. One actual public CAMS/weather read at Baridhara succeeded;
hosted Auth, real database/RLS/Storage/quota and live Gemini remain unverified.
**The complete product is not ready for an unrestricted real-user pilot.** See
[the independent audit](independent-product-audit.md),
[graded feature evidence](feature-evidence-matrix.md) and
[real-world validation gates](real-world-validation-plan.md). Final receipts and
the complete inventory are in the audit. No migration, workflow, model artifact,
approved Auth background, index, commit, push, deployment or A06 activation occurred.
The five HIGH development dependency advisories remain open.

Final Phase 05A regression: **449 web + 321 browser + 55 Python = 825 passed,
zero failed**; three real Supabase SDK suites skipped. All eleven browser suites
pass. Forty-four axe states have zero automated violations/overflow, with 12
manual-review groups retained. TypeScript, strict zero-warning ESLint, native
XGBoost/SHAP smoke, fresh production build and whitespace checks pass. The resumed
review narrowed the history guard to its required 49 hours and proved irrelevant
old/future gaps preserve identical results. The apparent redirect-language failure
was the new test blocking the owned server's localhost alias, not an i18n defect.
Eighteen files remain unstaged (11 modified, 7 new). Controlled staging validation
is the next phase; a full real-user pilot/production-readiness claim is not ready.

**Phase 04 local follow-up, 18 October 2026 (Asia/Dhaka):** verified Phase 03
committed at `1ac5bd2e840e91d4708016f380acf021ec31824f` on
`fix/location-reliability`, with a clean starting tree/index. F08 now has the public
`/advisor`, real server Gemini integration, validated existing air-data grounding,
explicit place/activity consent, session-only conversation and additive, unapplied
`0006_advisor_quotas.sql`. The model selects reviewed guidance and valid fact IDs;
unrestricted model prose/numbers are not displayed. See
[the F08 architecture, privacy/quotas, executable checks and final results](f08-ai-advisor.md).
No commit, stage, push, deployment, hosted configuration, migration or A06 change
was performed. Live Gemini and real quota/RLS/grant enforcement remain unverified.
Older “F08 absent” and “Phase 03 uncommitted” statements below are historical.

Final Phase 04 local verification: **436 web unit/API/maintenance + 318 browser +
51 Python = 805 passed, zero failed**. All ten browser suites passed against the
final fresh production build. Three real disposable Supabase SDK suites skipped;
actual quota/RLS/Storage enforcement and live Gemini remain unverified. TypeScript,
strict zero-warning ESLint, dependency verification and whitespace checks pass.
The F08 review records all 32 changed files, receipts, guest identity limitations,
provider/retention costs and Phase 05 release prerequisites. No existing regression
tests were weakened; all changes remain local and unstaged, A06 remains disabled,
and the inherited development `braces` advisory remains unresolved.

**Phase 03 local follow-up, 18 October 2026 (Asia/Dhaka):** verified clean
`fix/location-reliability` at `60c09e4`; Phase 2 is committed there. The historical
“uncommitted” and “map/moderator absent” statements below describe the earlier
checkpoint. Phase 03 now adds the real F06-backed Community Map, authorized review
dashboard and additive, unapplied `0005_community_moderation.sql`. See
[the Phase 03 implementation, exact checks and remaining service verification](community-map-moderation.md).
No branches, commits, index entries, migrations, deployment or publication were
changed. Real Supabase enforcement remains unverified and A06 remains disabled.
Final Phase 03 verification: **392 web unit/API/maintenance + 292 browser + 51
Python = 735 passed, zero failed**; two real disposable SDK suites skipped.
TypeScript, strict zero-warning ESLint, fresh production build and whitespace
checks pass. All nine browser suites passed against the final build. The index
is empty, HEAD remains `60c09e4`, and all owned test servers are stopped. The
Phase 03 review contains the full 28-file manifest, test receipts and live blockers.

Status prepared on 2026-10-17. This document describes the actual local implementation and separates local fixture verification from deployed services. The owner explicitly accepted the inherited dependency P1 for feature-branch commits and pushes only. The advisory remains unresolved; no live Auth, database authorization or deployment verification is claimed. The owner prohibits merging or pushing `main` during this handoff.

**Phase 2 local follow-up, 17 October 2026:** the owner committed Phase 1 at `5f4e3034460d1bbc38f91870c847b3b42bc20cb5` on `fix/location-reliability`; Phase 2 started from that clean tree. F06 now has actual authenticated reporting, private normalized uploads, optional server Gemini classification, ownership/moderation/public-safe backend contracts and bilingual submission/history/withdrawal UI. Phase 2 changes remain unstaged and uncommitted for owner review. See [F06 implementation and exact evidence](f06-reporting-implementation.md). Its migration is **unapplied**, real DB/RLS/Storage and live Gemini are **unverified**, and maintenance is **not scheduled**. Community Map/moderator UI remain Phase 3; F08 is absent. No migrations, workflows, publisher activation, deployment, commit or push was performed. The inherited dependency advisory is unresolved.

The [Phase 1 review](location-reliability-review.md) remains its historical receipt; its “uncommitted” statements describe the earlier review checkpoint. Country coverage uses the pinned polygon, custom forecasts remain restricted to the evaluated Baridhara reference, and CAMS covers other supported points. Manual search remains the listed reference registry. All commits/pushes remain reserved to the owner; historical receipts below confer no new authorization.

Phase 2 local verification: **372 web unit/API/maintenance + 268 browser + 51 Python = 691 passed, zero final failures**; TypeScript, strict zero-warning lint and fresh production build pass. The real disposable Supabase SDK suite is **skipped (1)**; SQL/RLS and Storage enforcement remain **unexecuted/unverified**. The new SQL files parse but have not been applied. The F06 report contains the 37-file manifest, exact commands, failure repairs, privacy/retention rules, quotas and Phase 3 prerequisites. All changes remain unstaged; A06 stays disabled and the approved Auth image is unchanged.

## Architecture and ownership

Nirmol is a public-first Bangladesh environmental decision-support application: **Sense → Explain → Act → Report**. Its brand message is **“Cleaner air, brighter lives.”** Completed environmental tools work without registration. Authentication adds a separate **My Nirmol** experience; it does not place the public dashboard or private browser diary behind a login wall.

- `web/`: Next.js App Router, React, TypeScript, Tailwind and Recharts. The dependency manifest requires Node **22 or newer**; local verification uses Node **24.18.0**. Use the committed lockfile with `npm ci`.
- `web/src/lib/air.ts` and `/api/air`: server-side environmental adapters, bounded provider requests, source validation, Nirmol publication selection and CAMS fallback. Browser clients receive validated source/timestamp metadata, not provider credentials.
- `jobs/` and `ml/`: Python forecast construction and saved XGBoost artifacts. Native verification uses the existing artifacts and controlled inputs; no training is part of this handoff.
- Supabase Auth: genuine server-side email/password authentication using `@supabase/ssr` **0.12.7** and `@supabase/supabase-js` **2.118.0**. Account settings use a separate additive, unapplied table.
- F06 Phase 2 is implemented locally on the owner's instruction, reusing Member 02's schema skeleton. Coordinate integration with teammate work before merging. Community Map/moderator UI and F08 remain absent; historical remote snapshots below have not been refreshed during Phase 2.

| Feature | Local implementation | Owner/integration boundary |
| --- | --- | --- |
| F01 monitoring | Public PM2.5, weather, indicative AQI, source and freshness | Owner-side implementation |
| F02 forecasts | Nirmol run reader and CAMS fallback | Owner-side; A06 publisher remains disabled |
| F03 exposure | Activity-adjusted concentration–time indicator with provisional bands | Shared calculation authority in `exposure.ts` |
| F04 travel | Departure-time comparison within valid forecast coverage | Shared integration authority in `travel.ts`; no street routing |
| F06 reporting/map | Local Phase 2 submission/backend/history; map UI pending | Unapplied `0004`, real enforcement/provider checks outstanding; Phase 3 map/moderator UI |
| F07 explainability | Genuine stored, hour-owned model factors where eligible | Log1p attribution scale; absent explanations stay absent |
| F08 advisor | **Not integrated** | Member 02; no fabricated AI response or medical context |
| F09 diary | Public browser-private activity/symptom diary | Existing browser storage only; no account synchronization |
| F10 alerts | Public in-app current/forecast threshold checks | Session-only preferences; no push/background delivery |
| F14 simulator | Hypothetical/current/forecast comparisons | Reuses F03/F04; no medical-risk reduction calculation |
| Authentication | Sign-in, registration, confirmation callback, recovery/update, sign-out | Real Supabase APIs; **LIVE AUTH UNVERIFIED** |
| My Nirmol | Protected identity, saved places, preferences and decision-tool links | Persistence requires reviewed account migration; **NOT PRODUCTION VERIFIED** |

## Routes and access

| Route | Access | Actual behavior |
| --- | --- | --- |
| `/` | Public | Monitoring, forecasts, available SHAP explanations and public tool links |
| `/exposure` | Public | F03 exposure calculator |
| `/travel` | Public | F04 departure-time planner |
| `/simulator` | Public | F14 what-if exposure comparisons |
| `/diary` | Public, browser-private data | F09 diary; authentication does not change its storage |
| `/alerts` | Public | F10 in-app alerts |
| `/reports` | Public introduction; authenticated submission/history | F06 suspected-source reports, optional private photo/AI and withdrawal; no map UI |
| `/api/reports` and descendants | Verified owner/moderator or explicit public-safe GET | Eight route contracts documented in the F06 implementation report |
| `/login` | Public | Bilingual sign-in/sign-up/recovery controls and guest exit |
| `/my-nirmol` | Authenticated, server verified | Distinct personal dashboard; unauthenticated requests redirect to login |
| `/api/air` | Public GET | Validated Bangladesh coordinates only; environmental response is not an account API |
| `/api/auth` | GET/POST with server authentication as appropriate | Session identity and genuine supported authentication actions |
| `/auth/callback` | Public callback endpoint | Validates and exchanges browser-bound PKCE codes; safe redirects only |
| `/api/account` | Authenticated GET/PUT | Owner-scoped account settings; same-origin writes and optimistic revision checks |

F06 navigation points to the implemented `/reports` route. Public report APIs expose only approved coarse-cell summaries. No Community Map, moderator dashboard or F08 route is promised.

## Selected image and login UI

The approved, unchanged image is **`web/public/images/background.png`**: **1672 × 941 pixels, 2,340,553 bytes**, SHA-256 **`619bd508c8f6128ec00e7c4029864f7e0c9c6250b94ee4a4aa471edaabccd8cd`**. It contains the left green information panel, branding, headline and benefit text. `AuthPanel.tsx` uses this exact source through Next Image; served optimized derivatives do not modify the approved file. `AuthPanel.module.css` places the real frosted-glass React form in the right region on desktop. Embedded branding is not visibly duplicated. Narrow layouts crop the background deliberately, retain readable controls and provide a screen-reader HTML description.

The image belongs in the authentication implementation commit. Do not replace, regenerate, redraw or silently optimize the approved source image. Important viewport checks are 320, 375, 768, 1024 and 1280 pixels, including both languages, keyboard focus and light/dark system preferences.

## Authentication contract

The implementation is server-first. `auth-server.ts` creates a request-scoped Supabase client; it never reuses a user session between requests. Session cookies are HttpOnly, SameSite=Lax and Secure for HTTPS, with no broad cookie domain. No password or token is manually stored in localStorage/sessionStorage. Middleware refreshes and verifies sessions for account/login surfaces; account APIs and the server page independently verify the user as well. Public environmental routes are outside the authentication gate.

`auth-actions.ts` delegates sign-in, sign-up, reset, recovery update and local-session sign-out to supported Supabase APIs. New passwords require 12–128 characters; existing sign-in passwords are not forced through the new-account minimum. Recovery updates require verified, matching, recent recovery claims, not a URL flag or an unverified decoded cookie. The response returns minimal identity/status information rather than access or refresh tokens.

Writes require an exact trusted Origin. Redirects use an explicit list of existing local routes; arbitrary, encoded, protocol-relative and external destinations are rejected. Private responses use no-store/private cache headers and no-referrer handling. Authentication/configuration errors remain actionable without disabling guest browsing. Session-change notifications contain only a page-memory event string, never identity, credentials or diary fields.

### Environment names and deployment configuration

Names only; never add values to this document or Git:

| Name | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project origin; also used by the public forecast reader |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Preferred public Auth/account key supported by the new implementation |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Existing public anon-key alternative; the forecast reader currently uses this name |
| `NIRMOL_SITE_URL` | Exact trusted application origin for production callback and Origin validation; configure an HTTPS origin without a path/query |
| `SUPABASE_SERVICE_ROLE_KEY` | Existing publisher/server-only credential; never an Auth/account-client fallback and never browser exposed |
| `NIRMOL_ATOMIC_PUBLISHER_ENABLED` | Experimental publisher switch; **leave absent**, or explicitly `false` |
| `NIRMOL_LEGACY_FORECAST_BEFORE` | Optional fixed, already-past legacy-reader cutoff; not permission to publish |
| `OPENAQ_API_KEY` | Optional existing measured-data/training tooling; not an authentication requirement |
| `GEMINI_API_KEY` | Optional server-only F06 classifier key; no F08 implementation is claimed |
| `GEMINI_REPORT_MODEL` | Explicit operator-selected structured-output model; live compatibility unverified |
| `NIRMOL_REPORT_AI_ENABLED` | F06 AI only; defaults false, requires model/key and per-request consent |
| `OPENROUTESERVICE_API_KEY` | Existing example only; F04 does not perform street-level routing |

The root `.env.example` includes the new publishable-key and site-origin names without values. The Auth configuration fails closed without a valid public key and, in production, an explicit canonical site origin. The existing forecast reader's anon-key requirement must be retained if deploying only a publishable Auth key.

On a disposable/staging Supabase project, verify email/password is enabled, confirmation requirements, SMTP delivery, rate limits, exact site URL and redirect allowlist before a demo. Do not change production secrets, provider settings or OAuth configuration as part of local development. Prefer exact callback URLs; avoid broad production wildcard redirect allowlists.

### Confirmation and recovery callbacks

The endpoint is `/auth/callback`, not a browser-only token handler. It accepts **PKCE authorization codes only**, exchanged through the SDK with the verifier stored in the initiating browser's HttpOnly cookie. Direct bearer-token/hash callback URLs are rejected before exchanging a session.

Keep Supabase's supported default email confirmation/recovery link based on **`{{ .ConfirmationURL }}`**. The actual sign-up/reset SDK calls supply their approved `emailRedirectTo`/`redirectTo` destination at `/auth/callback`; Supabase verifies the email link and redirects to the application with a PKCE `code`. Configure the exact callback allowlist and site origin on a disposable project before deployment. Do not replace the default provider verification link with a direct token-hash application template.

Complete confirmation/recovery in the **same browser and device where the request was initiated**. The local code verifier is required; opening a link in another browser, after cookie deletion, or after it expires cannot complete this flow. The callback fails closed with a generic invalid-link message. Start a new confirmation/recovery request in the intended browser and open its new link there. Provider email scanners, delivery, expiry, consumed links and actual redirect behavior still require live staging verification; no templates or provider settings have been applied remotely.

Do not copy access tokens into query parameters, log callback URLs or treat a forged `mode=recovery` URL as recovery authorization. [Supabase's PKCE documentation](https://supabase.com/docs/guides/auth/sessions/pkce-flow) explains the verifier binding and same-browser limitation.

Official integration references: [server-side Auth](https://supabase.com/docs/guides/auth/server-side), [password-based Auth and email templates](https://supabase.com/docs/guides/auth/passwords), [redirect URL configuration](https://supabase.com/docs/guides/auth/redirect-urls), [verified JWT claim meanings](https://supabase.com/docs/guides/auth/jwt-fields).

### Local correction pass

A separate review pass within this automated task reproduced an uninitiated bearer-login problem in the initial implementation: a valid attacker-owned email hash passed to the GET callback could change a simulated victim-A browser session into attacker B. The actual callback handler was executed with controlled SDK/cookie effects; this was a local reproduction, not a live Supabase exploit or an external engineer's audit. The correction removes direct bearer-hash acceptance and retains browser-bound SDK PKCE. Negative regressions reject uninitiated callbacks without provider exchange or identity change; genuine controlled PKCE tests must verify the code challenge/verifier pair and one-time exchange rather than issue a session for any code.

A second controlled browser regression reproduced a session-change signal being dropped while an older identity check was pending. The correction invalidates the old account state immediately on a confirmed session-change signal so that a delayed account-A reply cannot restore private UI after a switch to B. No identity or token is included in the broadcast, and no private browser storage is uploaded.

A third browser regression reproduced an identity-provider outage clearing an unsaved account draft. Transport failures and rate limits now remain distinct from expired sessions: private content is hidden and the draft is retained in page memory for a verified, same-user retry. Confirmed expiry or another identity clears account state. Periodic verification retains mounted controls and air state so it does not itself discard keyboard focus or refetch environmental data. Separate failing API regressions also covered stale-account writes, malformed action values, nonfinite recovery claims and missing canonical production origins. All corrected regressions pass in the final unit/browser runs.

The final pre-staging review found a further P1 in timeout recovery: identity checks shared an `AbortController`, so a 15-second timeout permanently aborted later retries. A new controlled browser regression failed on the previous production build (**0/1**), then passed (**1/1**) after each verification attempt received a fresh controller and cleanup retained access to the active request. The test verifies private state stays hidden during failure, the unsaved draft returns only after a healthy same-user check, no extra environmental request occurs and persisted account data remains unchanged.

These were separate critical reviews within one automated task, including delegated reviews, not an externally independent engineer's approval. None of the reproductions used a live account or production service.

Prioritized findings from the new implementation and review:

- **P0:** no confirmed critical defect found in the inspected local implementation. This is not a proof about untested production services.
- **P1 fixed:** uninitiated bearer callback could replace a session; pending identity reply could revive the previous account after a cross-tab change; stale account draft could be written under a different identity; provider outages could erase unsaved drafts or be misclassified as expiry; timed-out verification could permanently disable retry; production configuration could derive its trusted origin instead of requiring the canonical origin. Regression tests cover each correction.
- **P1 unresolved, inherited:** the development-only `braces` advisory described below. The owner explicitly accepted this specific risk for feature-branch commits and pushes only; its severity and tests remain unchanged.
- **P2 fixed:** malformed action coercion, nonfinite recovery-claim validation, password-policy copy/translation parity, periodic verification remounts and outdated browser selectors. No scientific algorithm, private-diary storage or alert-delivery behavior was changed.

### Google OAuth handoff

Google OAuth remains **deferred and unconfigured**. No Google button is rendered. The future provider integration point is the existing request-scoped Auth client/action layer and `/auth/callback`, with the same safe destination validation and cookie handling. Teammates must configure the real provider credentials, consent screen and callback allowlists in an approved environment, implement the actual supported provider initiation flow, and add end-to-end tests before exposing a control. Do not add a decorative or fake provider button.

## My Nirmol data and safe database rollout

`account.ts` accepts only language, up to ten named Bangladesh locations, a saved default identifier and a bounded revision. Extra keys are rejected rather than silently persisting health or token fields. Location identifiers are unique; coordinates, names, defaults and responses are validated. The API derives ownership from verified Auth state and checks the UI's expected user identifier before a write, preventing a stale account-A draft from being saved under account B. Revision compare-and-swap detects another tab's edits.

`supabase/migrations/0003_account_settings.sql` is **additive and unapplied**. It provides one owner row, strict bounded JSON checks, foreign-key deletion with the Auth user, a revision/timestamp trigger, explicit table privileges and owner-only RLS for authenticated non-anonymous users. Functions use SECURITY INVOKER and an empty search path. The settings UI reports unavailable persistence instead of claiming an unsaved draft is stored.

**Do not run a bulk `supabase db push`, migration deploy or SQL glob.** Migration `0002_forecast_publication.sql` is the separate, unverified A06 implementation. Applying all pending migrations would also apply that migration. Account-storage approval does not approve A06.

Account-only review process:

1. Obtain a disposable Supabase-compatible PostgreSQL environment with Auth schema/roles. Confirm its host/project identity and disposable status independently; never use a production connection.
2. Review existing schema history and `0003_account_settings.sql` in isolation. The account migration depends on `auth.users`/Supabase roles, not the A06 RPC. Reproduce the necessary Auth schema/roles through a supported local Supabase environment rather than pretending a plain SQL parser proves authorization.
3. Apply **only the reviewed account migration** in that disposable environment using an explicit file path. Do not include `0002`, invoke the forecast RPC or run a migration-directory wildcard.
4. Run `supabase/tests/account_settings.sql` with stop-on-error. The fixture transaction rolls back. Verify owner/non-owner/anonymous access, malformed/oversized locations, defaults, uniqueness, revision transitions and concurrency behavior. Add direct PostgREST checks with separate user tokens as well.
5. Review real deployed schema compatibility and migration-history bookkeeping before requesting a separate account-only rollout. Do not edit production migration history to make tooling skip A06. Agree on an approved selective deployment procedure with the database owner.
6. Only after authorization and real verification may deployment configuration advertise persistent account settings as available. Keep A06 disabled through every step.

During this handoff, a read-only WSL Ubuntu 24.04 probe found no `psql`, `postgres`, `pg_ctl`, `postgrest`, Docker or Podman on PATH. No database was contacted and no SQL was executed. Consequently **RLS, trigger execution and migration compatibility are NOT PRODUCTION VERIFIED**; mocked JavaScript tests and successful builds do not establish database security.

## Privacy and scientific risk reports

### Scientific interpretation

F03 is the sole authority for `PM2.5 × outdoor duration × activity factor` and provisional category rules. The value is a concentration–time comparison proxy, not inhaled dose, clinical risk or official AQI. Its cutoffs are unvalidated prototype thresholds. Age/sensitivity selection changes category rules, not measured concentration or a quantified medical-risk reduction.

F04 is the sole authority for time integration. It uses actual absolute timestamps, left-held hourly concentrations and valid adjacent bracketing points, excludes missing coverage and never extrapolates past the final point. Minute departure choices do not create minute-resolution forecasts. Midnight and Bangladesh display time do not change the forecast's original valid instant. F14 reuses these authorities; percent changes are indicator changes, with a zero-baseline percentage unavailable.

CAMS is a gridded model estimate. The custom model is calibrated to one historical Dhaka reference station; it is not current measured monitoring or street-level traffic/source evidence. SHAP factors describe contributions on the trained **log1p(PM2.5)** scale, not direct µg/m³ effects, causal pollution sources or uncertainty. AQI labels are indicative concentration-derived comparisons, not official EPA AQI/NowCast. Forecast retrieval is distinct from issuance; a recommended departure is never completely safe. Provisional and regional limitations remain visible in the tools.

### Personal information and shared devices

Authentication does not read, upload, synchronize or delete diary notes/symptoms or F10 alert preferences. F09 remains browser-private with explicit persistence consent, bounded/versioned validation, conflict checks and protected storage-switching behavior. Browser storage is not encrypted or account-isolated; an existing diary can remain on a shared device after sign-out. Its own export/deletion controls and notices remain necessary. F10 preferences stay in sessionStorage, with no push subscription or background tracking added.

Saved places and their names are personal account data even though the account schema deliberately excludes health fields. Saving them is explicit. Do not place medical notes or credentials in location names. Account changes clear stale state and require fresh authorization; the server/API/RLS boundaries remain necessary even when UI controls are hidden. No account or provider integration is authorized to consume diary content implicitly. Review deployed access logs/analytics configuration independently: local source inspection cannot prove a hosting platform never records sensitive request bodies or token-bearing callback URLs.

## Member 02 integration contracts

F06 Phase 2 supplies authenticated submission/management and approved public-safe APIs, with consent, normalization, database ownership and human-confirmed categories. Real enforcement is unverified until the disposable SQL/Storage suites run. Phase 3 must build the public map and authorized moderator/audit UI from these contracts, preserving coarse cells and reporter privacy. My Nirmol links to genuine own-report history; no records are fabricated.

F08 integration must supply the real advisor route/API, provider/model configuration, error and rate-limit contract, and a reviewed personal-context payload. General guidance remains public. Any account-location context requires a separate opt-in; diary symptoms/notes require a distinct, explicit action and consent, with no automatic synchronization. No diagnosis, fabricated traffic density or pollution-source claim is acceptable. Reserved text on My Nirmol is a boundary notice, not a working advisor/report feature.

## A06, A12 and A13 status

- **A06 remains disabled.** Python `main()` and `save()` both require the exact string `true`. Absent, empty, `false`, `0`, case variants, whitespace and unexpected values fail closed. The workflow has both a job condition and a credential-free exact-case preflight; no enabling default is introduced. Keep the repository variable absent or `false`; do not apply `0002`, call `publish_nirmol_forecast`, trigger publication or supply publication credentials to validation jobs.
- A12/A13 are already committed at **`6539079`**, separate from authentication. The scoped PostCSS override fixes the production advisory path without a framework rewrite. A full development audit still reports the tracked braces root advisory; see below.
- A13 pins exact Python 3.14 wheels with hashes, including applicable Linux NCCL. Previous native clean Windows and WSL Linux runs used the real artifacts and controlled provider-shaped inputs. Wheel resolution alone is not proof of inference correctness.
- GitHub-hosted native Linux execution is **NOT VERIFIED**. Local WSL native success does not establish a completed GitHub Actions run. The validation workflow is offline/nonpublishing and has read-only permissions.

### Dependency release gate

The committed [independent A12/A13 audit](a12-a13-independent-audit.md) records **P1 unresolved**: `GHSA-vfj7-8cjw-p6xm` / `CVE-2026-93687`, through development-only `eslint-config-next → @next/eslint-plugin-next → fast-glob → micromatch → braces`. The package's stack overflow was reproduced; no current application/public-input exploit was established. The repository does not set the ESLint root-directory glob option that reaches this path. No safe compatible published patch was found in the prior audit.

Do not suppress the advisory, use a forced dependency rewrite or relabel its existing priority merely to satisfy delivery criteria. On 2026-10-17 the owner explicitly granted a narrow exception to the no-unresolved-P0/P1 commit gate for **this advisory and feature-branch commits/pushes only**. This is not remediation, severity reduction, approval of any new application defect or permission to merge `main`. A compatible fix and future full audit remain teammate responsibilities. [Upstream advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm).

## Verification record

The figures below distinguish executed local checks from unavailable services. Browser fixtures intercept environmental requests; the new account suite runs a real production Next server and Supabase SDK against a strict loopback Auth/PostgREST fixture, including actual PKCE challenge/verifier checks and single-use codes. This proves local application behavior, not deployed Supabase behavior.

| Verification | Current handoff status |
| --- | --- |
| Full web unit suite | **311/311 PASS**, 0 failures, cancelled or skipped; final post-correction `node --test tests/*.test.mjs`, 1.978 seconds |
| Dashboard browser | Final post-correction **63/63 PASS**, 0 failures/skips/cancelled, 71.790 seconds; four old exact-name language selectors corrected after the language button gained its visible label; targeted **4/4 PASS** before the full run |
| F03 browser | Final **14/14 PASS**, 0 failures/skips, 14.350 seconds |
| F04 browser | Final **13/13 PASS**, 0 failures/skips, 13.951 seconds |
| F09 browser | Final **37/37 PASS**, 0 failures/skips, 37.190 seconds |
| F10 browser | Final **54/54 PASS**, 0 failures/skips, 67.750 seconds; 12 accessibility snapshots, 888 text contrast samples, 192 focus checks, minimum sampled text contrast **5.08:1** |
| F14 browser | Final **22/22 PASS**, 0 failures/skips, 26.640 seconds |
| New Auth/My Nirmol browser suite | Final post-correction **34/34 PASS**, 0 failures/skips/cancelled, 46.467 seconds; controlled protocol fixtures, no live Supabase; new timeout regression RED then GREEN |
| TypeScript | **PASS**, `npx.cmd tsc --noEmit`, exit 0 |
| ESLint | **PASS**, `npm.cmd run lint -- --max-warnings 0`, exit 0, no warnings |
| Fresh production build | **PASS**, `npm run build`, exit 0; Next 15.5.27 production output, including Auth/account routes and middleware |
| Python publisher/runtime/workflow suite | Fresh isolated **Windows CPython 3.14: 51/51 PASS**, 0 failures/skips, 13.032 seconds; prior checkpoint WSL Linux 51/51 is historical evidence, not a new GitHub CI run |
| GitHub native Linux CI | **NOT EXECUTED / NOT VERIFIED**; post-push API inspection found no automatic workflow/check runs; no workflow was dispatched |
| Native artifact/SHAP check | Fresh Windows native smoke **PASS**: 25 × 24 features, three 25-point predictions, SHAP 25 × 25, maximum log-space additivity residual **0.000003814697265625**; no retraining/network publication |
| Clean dependency installation | Isolated `npm ci`: **368 packages, PASS**; manifest/lock hashes unchanged. Fresh hashed binary Python install: **17 applicable packages, PASS**; `pip check` PASS |
| Production/full npm audits | Production **0 advisories**, exit 0. Full audit **5 HIGH development entries**, exit 1, from the existing single `braces` root advisory; no new Supabase advisory |
| SQL/RLS and direct PostgREST authorization | **UNEXECUTED**; no disposable database tools found on the inspected WSL PATH |
| Live Auth/SMTP/OAuth/provider integration | **UNVERIFIED** |
| Git whitespace checks | **PASS**, `git diff --check`, exit 0; Git's LF/CRLF notice is not a whitespace failure |

The final seven browser suites total **237/237 PASS**: 203 existing public-feature cases and 34 Auth/account cases, all rerun after the timeout correction against fresh build **`Senbu2a3-eLHh-HyhFK6i`**. Commands use `node tests/<suite>.browser.mjs <existing-playwright-module-path>`, with public fixtures on port 3001 and the isolated Auth suite on port 3002. The test README contains invocation details. Both languages and light/dark themes were exercised at **320, 375, 768, 1024 and 1280px** for login and My Nirmol. Twenty screenshots were generated; desktop/mobile login and account screenshots were visually inspected. The approved image source hash remains unchanged. Both owned test servers were stopped and independently checked closed after testing. Build success alone does not establish accessibility, security, scientific validity or deployed service readiness.

Reproducible isolated dependency/runtime checks used a temporary directory containing only `web/package.json` and its lockfile for `npm.cmd ci --no-audit --no-fund --fetch-retries=0`, followed by `npm.cmd ls @supabase/ssr @supabase/supabase-js postcss next react react-dom tailwindcss --all`. No `.env` was copied. Python used a fresh `py -3.14 -m venv` environment, then its interpreter for `-m pip install --require-hashes --only-binary=:all: -r jobs/requirements.txt`, `-m pip check`, `-B -m unittest discover -s jobs/tests -v` and `-B jobs/forecast_runtime.py`. Linux-only wheel markers were correctly skipped on Windows. Existing npm 11 lifecycle policy continued blocking the unapproved `unrs-resolver` postinstall; no new lifecycle approval was granted. Successful native resolution/build checks did not require changing that policy.

Intermediate failures were investigated, not hidden: the browser P1 regressions above failed before their fixes; an initial account suite was **32/33** because an exact nested-label matcher included option text (corrected to a semantic combobox selector, with CRUD assertions retained); the dashboard first run was **59/63** because four tests still targeted the previous language accessible name. One diary invocation used a nonexistent filename and was rerun with the actual `exposure-diary.browser.mjs`. Two standalone npm/npx invocations with the PowerShell profile disabled were blocked by script policy; the standard `.cmd` executables then passed without changing policy. Earlier development type/lint failures were corrected before the fresh successful build. No failing attempt is represented as a pass.

Production first-load JavaScript reported by the build: dashboard **229 kB**, login **119 kB**, My Nirmol **121 kB**, public decision tools **118–127 kB**; shared JavaScript **102 kB**, middleware **95.3 kB**. These build sizes and source review are not measured network performance or concurrent-user capacity.

## Git and remote delivery record

### Local change inventory

There are **29 changed paths: 8 modified and 21 new**, including this handoff and the approved image. Existing F03/F04/F09/F10/F14 modules, `jobs/`, `ml/`, workflows and migrations `0001`/`0002` remain unchanged.

Modified paths:

- `.env.example`
- `README.md`
- `web/package.json`
- `web/package-lock.json`
- `web/src/app/globals.css`
- `web/src/components/Dashboard.tsx`
- `web/tests/README.md`
- `web/tests/dashboard.browser.mjs`

New paths:

- `docs/team-handoff.md`
- `supabase/migrations/0003_account_settings.sql`
- `supabase/tests/account_settings.sql`
- `web/public/images/background.png`
- `web/src/app/api/account/route.ts`
- `web/src/app/api/auth/route.ts`
- `web/src/app/auth/callback/route.ts`
- `web/src/app/login/page.tsx`
- `web/src/app/my-nirmol/page.tsx`
- `web/src/components/AuthPanel.module.css`
- `web/src/components/AuthPanel.tsx`
- `web/src/components/MyNirmol.tsx`
- `web/src/lib/account.ts`
- `web/src/lib/auth.ts`
- `web/src/lib/auth-actions.ts`
- `web/src/lib/auth-events.ts`
- `web/src/lib/auth-server.ts`
- `web/src/middleware.ts`
- `web/tests/account.test.mjs`
- `web/tests/auth.test.mjs`
- `web/tests/auth.browser.mjs`

### Remote preflight and delivery gate

Read-only preflight was refreshed on **2026-10-17 00:26:28–00:27:38 UTC**. These observations are a snapshot, not permission to skip a fresh fetch before delivery:

- Repository: `C:\Users\tanis\Nirmol`; remote **`https://github.com/Tanisha-328/Nirmol.git`**.
- Starting branch/checkpoint: **`fix/air-forecast-reliability`**, **`6539079`** — Harden A12 dependencies and A13 forecast runtime.
- Starting `feature/personalization-advisor`: **`f47e7b8`**; this was an ancestor of the reliability branch. A normal **`git merge --ff-only fix/air-forecast-reliability`** advanced it to the verified handoff, preserving every existing commit and avoiding an older, unhardened branch tree. No rebase, history rewrite, force push or merge into `main` occurred.
- Fetched `origin/main` and local `main`: **`94c402e`**. Initial reliability checkpoint was **9 ahead / 0 behind** remote main.
- Fetched `origin/feature/pollution-reporting`: **`94c402e`**, with no newer teammate implementation. Neither owner-side feature branch existed remotely at that snapshot.
- Authenticated GitHub repository metadata reported admin/write access, public/unarchived repository and default branch `main`. Main was unprotected, rulesets and required status checks were empty. This is an observed configuration, not an instruction to bypass future protection.
- GitHub Actions were enabled, default workflow token permissions read-only; no existing workflow runs/check runs, open PRs, repository deployments or configured repository environments were observed.
- Repository Actions variables were empty, so the repository-level A06 enabling variable was **absent at inspection**. External Supabase/Vercel settings and any future configuration are **NOT VERIFIED**.

The implementation and approved image are committed separately from A12/A13 at **`fe3e031c40047db99591b41c7199bc60487b3d38`** — **Add public-first authentication and My Nirmol**. This includes the final timeout fix and regression. Documentation is separate at **`24a6bb82b6721b612213e1203e946f3a435a9d00`** — **Document authentication verification and team deployment boundaries**. A staged-byte check verified all 26 implementation paths, valid UTF-8 text, blank environment examples, no credential-pattern matches and the exact approved image hash. No `.env` secret file, temporary screenshot, private user data or generated build output was staged.

### Verified delivery receipt

Destination: **`https://github.com/Tanisha-328/Nirmol.git`**. The actual command **`git push --atomic --set-upstream origin feature/personalization-advisor fix/air-forecast-reliability`** completed with **exit 0**, creating both approved remote branches and their upstream tracking. An independent subsequent `git ls-remote --heads origin` verified:

| Remote ref | Verified implementation/documentation handoff hash |
| --- | --- |
| `feature/personalization-advisor` | `24a6bb82b6721b612213e1203e946f3a435a9d00` |
| `fix/air-forecast-reliability` | `24a6bb82b6721b612213e1203e946f3a435a9d00` |
| `main` — unchanged | `94c402e147be8de5d09416da6384c55565ab93c7` |
| `feature/pollution-reporting` — unchanged | `94c402e147be8de5d09416da6384c55565ab93c7` |

An authenticated, read-only post-push GitHub API snapshot at **2026-10-17 03:50:44 UTC** independently confirmed both feature refs above and unchanged `main`. It reported zero listed workflows, Actions runs and commit check runs for the inspected handoff commits, so **GitHub native Linux CI was NOT EXECUTED / NOT VERIFIED**. Repository Actions variables remained empty, including absence of the A06 enabling flag. No workflow was dispatched and no repository or external environment setting was changed. Supabase/Vercel settings remain unverified.

This delivery receipt is a documentation-only follow-up to the verified handoff above. Its own Git object hash cannot be embedded in its own contents; obtain it with **`git log -1 --format=%H -- docs/team-handoff.md`**. Both feature branches receive the receipt through normal fast-forwards/pushes, with final exact remote tips reported after verification. No application or test file changes after `fe3e031` are part of this receipt.

For an independent final-tip comparison, run `git ls-remote --heads origin refs/heads/feature/personalization-advisor refs/heads/fix/air-forecast-reliability refs/heads/main`, then compare the two feature hashes with local `git rev-parse HEAD`. Main must remain at the unchanged hash above for this handoff. The working tree was clean after the implementation/documentation commits; the final receipt is checked again before delivery.

**Do not merge or push `main`: the owner reserved integration for teammates.** They must fetch current history, review these commits, test their actual integrated tree and independently verify deployment/migration safety and all applicable checks/reviews. Missing external deployment evidence remains a blocker even when GitHub reports no branch protection. No force push, shared-history rewrite or branch deletion is authorized.

## Deployment and demonstration checklist

1. Preserve the owner's narrow feature-branch exception for the inherited dependency P1 and its unresolved status. Complete any newly affected local regressions before committing; this exception never covers a new application P0/P1.
2. Verify a staging Supabase Auth project: exact origin/redirects, confirmation, SMTP, recovery expiry, session refresh/revocation and rate limits. Keep service keys server-only and test that logs omit credentials/callback tokens.
3. Execute account-only disposable database/RLS/PostgREST checks and obtain a separate selective rollout approval. **Do not bulk-apply migrations or enable A06.**
4. Verify deployed guest routes and narrow-screen login/My Nirmol; inspect screenshots, keyboard focus, language changes, contrast, errors/retries, cross-tab account changes and shared-device notices.
5. Review the local F06 Phase 2 contracts with Member 02, execute real disposable enforcement tests, then implement Phase 3 map/moderation. F08 remains pending. Keep unavailable boundaries honest in the demo. Add Google OAuth only after its real provider flow is configured and verified.
6. Execute the credential-free native Linux validation workflow and inspect the actual result. Live environmental provider behavior and hosting settings remain separate from fixture coverage.
7. Fresh-fetch and review proposed integration before any main merge. Confirm a push cannot trigger unexpected migration, publication or unsafe deployment behavior.

## Performance and staged load-test plan

Actual concurrent-user capacity is **NOT YET MEASURED**. Current source review finds bounded provider timeouts, bounded publication candidates, finite diary/location limits and environmental caching; these are design protections, not a simultaneous-user benchmark. Account authorization is independently checked in middleware and server handlers, so staging latency should measure the real request chain rather than assume a single backend round trip.

Use k6 or Artillery against an explicitly approved isolated staging deployment. Start with deterministic environmental and Auth/PostgREST fixtures, synthetic accounts and a dedicated database. Prevent egress to public Open-Meteo, production Supabase, Gemini and real notification providers. Never store real symptoms or private identities in load fixtures. Do not run this plan automatically against public services.

| Workload | Staging scenario and assertions |
| --- | --- |
| Guests | Load dashboard and public tools, vary a bounded set of Bangladesh places, inspect cache reuse, error budgets, timeouts and source/freshness correctness |
| Authenticated users | Synthetic sign-in/session restoration, My Nirmol reads, owner-scoped settings updates, stale-revision conflicts, default-place changes and sign-out/account switching |
| F06 Phase 2 | Deterministic submission/photo/AI/Auth fixtures with consent, ownership, session races and coarse public output; real DB/Storage/provider unverified, no public map UI |
| F08 after integration | Stub provider responses, explicit context opt-in, rate/quota limits, cancellation/error handling and proof that diary context is excluded unless separately consented |

Run smoke, gradually increasing arrival-rate, short burst and soak phases only after baseline correctness. Capture p50/p95/p99 latency, request/error/timeout rates, process memory, event-loop/CPU behavior, provider-call counts/cache hit rates, database connection/query latency, authorization failures and fixture cleanup results. Define acceptance thresholds with the team before running. Inspect browser bundles and image transfer costs separately; compare representative 320px/mobile and desktop route loading. Do not publish a capacity number until a documented measured run supports it.

## Proposed future work

**Nirmol Campus is PROPOSED, not implemented.** A campus-focused pilot/support or investment concept could reuse verified public environmental tools and later approved reporting/advisor integrations. There is no implemented campus tenant system, billing, institutional dashboard, measured market return or validated investment claim. Keep this separate from the implemented feature inventory and demonstration.

Remaining demo work is real Auth/staging verification, account RLS testing/selective deployment, Member 02 integration, deferred Google OAuth, reviewed branding/navigation across integrated pages, real Linux CI results and measured staging performance. Preserve the public-first architecture and explicit scientific/privacy boundaries throughout.
