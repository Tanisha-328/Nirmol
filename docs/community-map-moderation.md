# Phase 03: Community Map and Moderator Dashboard

Prepared **18 October 2026 (Asia/Dhaka)**. Local implementation for owner review;
not a deployment or production-readiness certificate. All project changes are
unstaged. No migration, Git metadata mutation, publication or live service operation was run.

## Verified starting point and preserved work

Repository: `C:\Users\tanis\Nirmol`. Branch: `fix/location-reliability`. Starting
and ending HEAD: `60c09e4` (`Implement F06 reporting backend and private submission
flow`), directly after `5f4e303`. The initial working tree and index were clean;
Phase 2 was already committed. Local/cached remote branches and ancestry were
inspected without fetching, switching or modifying refs. Older handoff statements
that F06 was uncommitted, or that its unsafe original public projection remained,
describe prior checkpoints. The actual Phase 2 files/contracts were authoritative.

Read both implementation reviews before editing. Reused F06 submission, ownership,
private images, classification snapshots, public projection, review revision and
transactional audit operations. No parallel backend, production fixtures, duplicate
storage, synthetic participation statistics or mock-data fallback was added.
The tests contain explicitly synthetic, isolated fixtures only.

Forecast/SHAP/model calculations, model artifacts, location/GPS helpers, private
diary, existing Auth pages, approved background image and A06 workflow/guards are
preserved. F08 is not implemented. Reporting AI remains off by default.

## Public experience and integration

`/community` is bilingual, public and independent of Auth, saved places and GPS.
It reads only `/api/reports/public`; it never reads resident history or moderator
details. Category and inclusive observation-day filters use the F06 Dhaka-day
contract. Each page has at most 50 summaries; users can load up to 200 before
narrowing filters. Loaded counts describe the displayed subset, never a total or
a pollution prevalence estimate. Reports sharing a cell share a numbered marker.
Each marker and list entry opens the coarse-area summary, with category, dates
and publication state. The complete list is available without using the map.

Leaflet **1.9.4** is pinned, bundled locally and loaded only on the client. Its
[official stable download](https://leafletjs.com/download.html) and
[API reference](https://leafletjs.com/reference.html) were reviewed. The existing
unsimplified geoBoundaries Bangladesh polygon supplies an attributed, offline
outline. Zoom/pan, cell rectangles, markers and report list work with zero reports
or without any tile provider. Map keys: arrows and +/−; markers support Enter/Space.
The list provides an equivalent accessible path. Layouts support 320–1280 px.

Optional OpenStreetMap raster tiles load only on explicit action, with HTTPS,
visible attribution, a site-origin referrer, browser HTTP caching, idle updates,
country bounds and zoom 6–11. No tile proxy, speculative buffer, bulk/offline
download, retina doubling or third-party script is used. First tile error removes
the background layer; a ten-second initial deadline and explicit retry prevent
indefinite loading. Tile failure leaves boundary/cells/list available. The UI
discloses IP/origin/viewed-area sharing. The
[OSMF tile policy](https://operations.osmfoundation.org/policies/tiles/) must be
reviewed for actual hosting traffic. This public service has operational limits,
no availability guarantee and is not a promise of unlimited free production tiles.

Dashboard, reporting and My Nirmol link to Community Map; Community links to report
submission/history and the moderator entry. Auth return destinations now allow
`/community` and `/moderation` using the existing exact allowlist. The monitoring
selection and report incident location remain separate; no GPS runs on either
new page and no diary/account context is copied into reports.

## Public privacy and freshness

The database's existing 0.05° cell centres remain the only public positions.
No private point is fetched and rounded in JavaScript. Public summary fields:
`id, category, observedDate, submittedDate, status, suspected:true, location`.
Location contains only `lat, lon, cellDegrees:0.05`. Server and browser validators
reject extra fields, private geometry, pending/rejected states, malformed dates,
unexpected category/filter results, duplicate/order errors and invalid cursors.
Photos, description, identities/emails, accuracy/evidence, object paths, exact
timestamps, review reasons, prompts and credentials never enter map state.
Public photos are not published, signed, optimized or fetched. Neutral cell markers
are used. Approval means eligible for publication, not verified PM2.5 or causation.

Coarse cells and day-only dates reduce inference, especially combined with omitted
prose/photos/identities, but cannot guarantee anonymity for sparse observations.
There is no precise nearest-address labeling, geocoder, public image or exact-time
timeline. Cell centres can cross the approximate country boundary. This is not a
scientifically verified hotspot map or a claim about all incidents in Bangladesh.

The public RPC/API remains `no-store` and uses a separate non-session public client.
The browser explicitly omits credentials, keeps data in page memory, resets old
results on refresh/filter change/failure, ignores obsolete requests and revalidates
every minute while visible and on focus/BFCache restoration. Hiding the page clears
public state. Approved-to-rejected, withdrawn, expired and otherwise unpublished
reports disappear on the next successful refresh, ordinarily within one minute;
a failed refresh clears existing markers. Refresh restarts pagination rather than
retaining potentially withdrawn rows from earlier pages. There is no shared cache
invalidation window, localStorage report cache or service worker.

## Authorized review and API changes

`/moderation` shows a public shell, then verifies `/api/auth`. Guests see sign-in;
ordinary users see denial. Private content is fetched only through guarded APIs,
never server-rendered into public HTML. DB role checks are authoritative on every
read/decision, including empty queues. The UI has no role assignment or credentials.
The private page has noindex, no-referrer and private/no-store response headers.

The dashboard provides status/category filters, oldest-first pages, empty/loading/
outage recovery, exact incident details with separate GPS evidence, reporter category,
optional fixed-code AI suggestion, private photo preview, reasoned approval/rejection,
revision conflict feedback and recorded reviewer UUID/transition/review time.
Reviewer-deleted accounts show an honest unavailable identity. Reasons are visible
to reporters through the inherited OwnReport contract; the UI warns reviewers not
to put personal details into them. No separate moderator-private notes are published.

| Contract | Change |
| --- | --- |
| `GET /api/reports/moderation` | No-query Phase 2 queue retained unchanged. Filtered requests accept only `status=submitted\|approved\|rejected\|all`, optional `category`, optional UUID `after`; return `{userId,reports,next}` with at most 50 `OwnReport` rows. |
| `GET /api/reports/moderation/[id]` | New verified-session/moderator detail: `{userId,detail:{report,incident,suggestion,reviews,canReview}}`. No reporter identity or object path. |
| `POST /api/reports/moderation` | Existing exact `{id,decision,reason,revision}` and guarded `f06_review` preserved. No client reviewer/status/permission accepted. |
| All reporting URLs | Search strings over 2,048 characters rejected; existing strict keys, date, UUID, bounds and body limits retained. |
| Private reporting GETs | If `x-expected-user` is supplied, reject a mismatch before RPC/Storage access; writes continue to require it. New moderator reads and photos always supply it. |
| Public F06 API | Endpoint semantics, DB coarsening and storage unchanged. No new public fields. |

The new `ModerationDetail` incident contains private `lat,lon,source,confirmedAt,
capturedAt,accuracyM`. Audit entries contain decimal-string bigint `id`, nullable
`reviewerId`, `from,to,reason,reviewedAt`. Suggestion contains only validated
category/evidence/uncertainty codes reconstructed from the retained submission
snapshot, independent of later classification retention. Images remain optional.

Photo preview uses an explicit button and the existing authenticated, digest-checked
JPEG proxy with expected-user header. It creates a bounded page-memory blob URL;
switching/closing/unmounting revokes it. No signed/public Storage URL, raw EXIF or
shared Next image optimization is used. Visible identifying pixels are not claimed
to be redacted. The preview and all private details disappear during session checks,
outages, sign-out, account changes, hidden-tab transitions and periodic verification.
Late responses cannot restore a previous account's data. Session rechecks refresh
the review pane; unsaved review text is intentionally discarded when it unmounts.

## Additive SQL and state transitions

`0005_community_moderation.sql` is authored locally and **NOT APPLIED**. Requires
the reviewed existing `0001` and `0004`, never `0002`. It adds a partial queue-order
index, `nirmol_reporting.f06_moderation_reports(text,text,uuid)`,
`nirmol_reporting.f06_moderation_detail(uuid)`, and an ungranted
`f06_incident_json(pollution_reports)` geometry helper. Two public SECURITY INVOKER
wrappers expose only the moderator reads to authenticated callers. Each private
SECURITY DEFINER reader independently requires a real nonanonymous `auth.uid()`
and protected `profiles.is_moderator`. Empty search paths and qualified relations
are used; geometry resolves the actual PostGIS extension schema. PUBLIC/anon/
service-role execution is explicitly revoked. The photo worker is never used for
moderator authorization. No report/review schema, raw grant or existing RLS policy
is broadened. Withdrawn, deleted-account and legacy rows are excluded.

Existing F06 role-protection trigger prevents user self-promotion. Real moderator
decisions remain in `f06_review`: submitted → approved/rejected; approved → rejected.
Self-review is forbidden. Row lock plus expected revision compares and writes state
and appends the true authenticated reviewer/transition/time in one DB transaction.
A conflict or duplicate decision cannot silently overwrite a prior decision. No
new forwarded/resolved transition is introduced, although existing safe public
states remain readable. Withdrawal locks the same report and immediately removes
public eligibility. The fixture tests exercise these contracts; actual database
locking/RLS guarantees remain unverified until the real suites pass.

F06's atomic submission/upload/classification quotas and capacity checks remain.
Read pagination, parameter/body bounds, deadlines and 429 handling are covered.
Distributed anonymous-read abuse controls, hosting quotas and real concurrent
capacity still need an operator-reviewed perimeter policy; this change does not
claim a distributed read-rate limiter. Tile-provider budgets are separate.
The inherited development dependency advisory in the `eslint-config-next` →
`fast-glob` → `micromatch` → `braces` chain remains unresolved and unsuppressed;
dependency installation still reports five high findings. No automatic audit fix
or unrelated package upgrade was performed.

## Disposable verification and reviewer provisioning

No disposable Supabase endpoint/credentials were supplied. PostgreSQL client,
Supabase CLI and Docker were unavailable in PATH. No private environment file was
read to discover a live target. Real RLS/Storage and database transaction semantics
are explicitly **UNVERIFIED**. Migration/test syntax parsing is not SQL execution.

For a future, separately authorized disposable setup, an operator must inspect
catalogs, migration history, role grants, PostGIS/Storage configuration and keep
`nirmol_reporting` outside PostgREST's exposed schemas. Apply only independently
reviewed `0001`, `0004`, `0005` on that disposable target; `0003` is optional for
account regressions. Do not use `supabase db push`, bulk migration setup or A06.
Reload the PostgREST schema cache and verify both new RPCs before UI checks.

Create synthetic email-confirmed users through trusted Auth administration. Verify
their actual Auth UUIDs, then provision a reviewer through the trusted SQL console
or a server-only admin connection, never a resident/browser key:

```sql
-- Placeholder UUID only: replace after independently verifying the synthetic user.
insert into public.profiles(user_id,is_moderator)
values ('00000000-0000-4000-8000-000000000003',true)
on conflict(user_id) do update set is_moderator=true;
-- Revoke with an equally trusted operation; existing sessions must then fail RPCs.
```

Do not grant this role from signup fields/JWT user metadata or a public route.
The role-protection trigger rejects resident promotion. Keep service credentials
server-only. Record who provisioned/revoked the test reviewer outside public reports.

Existing `supabase/tests/reporting.sql` remains unchanged. New
`supabase/tests/community_moderation.sql` adds transactional/rollback assertions for
guarded detail/queue/audit, forged metadata, role revocation and public eligibility.
Execute only with `psql <private-disposable-connection> -v ON_ERROR_STOP=1
-v NIRMOL_F06_DISPOSABLE=1 -f supabase/tests/community_moderation.sql`.

The existing F06 SDK suite tests real private Storage. New
`web/tests/community.storage.integration.mjs` adds real Auth/RPC competing reviewers,
duplicate decision/audit, forged roles, cross-account detail, withdrawal and revocation.
Use the same explicit disposable environment gates described in the Phase 2 review:
`NIRMOL_F06_DISPOSABLE=true`, private disposable URL/public/service keys, plus
`NIRMOL_F06_STAGING_APPROVAL=isolated-disposable-target` for a remote target.
Run both with `node --test tests/reporting.storage.integration.mjs
tests/community.storage.integration.mjs`. They create/delete synthetic accounts and
leave report/audit tombstones under the existing retention rules. They apply no
migrations. Missing configuration produces skips, never enforcement passes.

Before release also verify live Auth cookie refresh/account switching, direct RLS
and Storage/signing denial, concurrent withdrawal/review/role revocation, quota
races, audit rollback fault injection, maintenance scheduling/retention, real tile
provider errors/referrer/cache/attribution/traffic limits and operator observability.
Real phones, screen readers and Bangla editorial review remain separate checks.
Gemini remains disabled unless independently reviewed/enabled; no live call is claimed.

## Teammate demonstration

After the separately authorized disposable schema/service verification above:

1. Open `/community` as a guest; show the honest empty state, list and country
   outline without tiles. Enable tiles only to demonstrate the provider separately.
2. Sign in as synthetic resident A, open `/reports`, explicitly select/confirm a
   Bangladesh incident point and category/consents, and submit. Show pending receipt
   and own history. Verify a guest public query/map still excludes it.
3. Try `/moderation` as resident B to demonstrate denial, then sign in with the
   separately provisioned reviewer. Open the pending report, inspect private point,
   optional photo and AI snapshot, enter a nonpersonal reason and approve. Reload
   the saved report to show the recorded reviewer, revision, transition and time.
4. Refresh the public map in a guest session. Show the approved coarse cell/day
   summary and list; verify private description, photo and incident point are absent.
   Disable/fail tiles and repeat through the list and keyboard.
5. Withdraw as resident A or reject the approved report as reviewer. Refresh the
   public map/query and demonstrate removal; repeat a stale review to show conflict.
   Test role revocation and a second reviewer concurrently in the real SDK suite.

The local browser suite automates this with synthetic protocol fixtures, including
session switching and competing reviewers, without requiring a live account.

## Verification evidence

Final results: **735 passed, zero failed**, with **two separately gated live SDK
tests skipped**. All 691 previous Phase 2 cases remain: 20 new unit/API cases and
24 new browser cases bring the total to 735. Receipts are under
`%TEMP%/nirmol-p03-*`; no private credentials or real incident records are included.
Controlled browser fixtures block external traffic. Python publication messages
are mock-test assertions, not actual writes.

| Check | Command (from `web` unless stated) | Passed | Failed / skipped |
| --- | --- | ---: | --- |
| Full web unit/API/maintenance | `node --test tests/*.test.mjs` | 392 | 0 / 0 |
| Dashboard/location browser | `node tests/dashboard.browser.mjs <Playwright-path>` | 76 | 0 / 0 |
| F03 exposure browser | `node tests/exposure.browser.mjs <Playwright-path>` | 14 | 0 / 0 |
| F04 travel browser | `node tests/travel.browser.mjs <Playwright-path>` | 13 | 0 / 0 |
| F14 simulator browser | `node tests/simulator.browser.mjs <Playwright-path>` | 22 | 0 / 0 |
| F09 diary browser | `node tests/exposure-diary.browser.mjs <Playwright-path>` | 37 | 0 / 0 |
| F10 alerts browser | `node tests/alerts.browser.mjs <Playwright-path>` | 54 | 0 / 0 |
| Auth/My Nirmol browser | `node tests/auth.browser.mjs <Playwright-path>` | 34 | 0 / 0 |
| F06 browser | `node tests/reporting.browser.mjs <Playwright-path>` | 18 | 0 / 0 |
| Community/moderation browser | `node tests/community.browser.mjs <Playwright-path>` | 24 | 0 / 0 |
| **Browser subtotal** | All nine scripts, final fresh build | **292** | **0 / 0** |
| Python regression | Repo root, isolated Python 3.14: `python -B -m unittest discover -s jobs/tests -v` | 51 | 0 / 0 |
| **Total executed cases** | **392 + 292 + 51** | **735** | **0 failed** |
| Real disposable SDK | Both `*.storage.integration.mjs` files | 0 | 0 / **2 skipped** |
| Real PostgreSQL/RLS SQL | Both reporting/community scripts | Not executed | Environment unavailable |

`npx tsc --noEmit`, `npm run lint -- --max-warnings=0`, fresh `npm run build`
and `git diff --check` all exit **0**. Strict ESLint has **zero warnings**. Build:
Next.js 15.5.27, 13 static pages plus dynamic private/API routes. The final full
browser runner exits **0** after the last UI changes; no tests are counted twice.
Its individual suite logs are `%TEMP%/nirmol-p03-regression-<suite>.log`; the runner
receipt is `%TEMP%/nirmol-p03-browser-regressions-final.log`. Build, unit, Python
and skipped-live receipts are `nirmol-p03-build-final.log`,
`nirmol-p03-unit-final.log`, `nirmol-p03-python.log`, `nirmol-p03-supabase.log`.

Both new SQL files parse using the existing pglast 8.6 environment: **11 outer
migration statements, 49 outer test statements**, with psql directives removed
for parsing only. This does not verify function-body semantics, catalog/grant
behavior, extensions, actual locking, RLS or Storage. No SQL was applied/executed.

Final fixture screenshots are under `%TEMP%/nirmol-p03-browser-Da6QB3`. Automated
checks cover English/Bangla at 320/768/1280 px in light/dark themes, visible focus,
labels, Enter/Space marker support and overflow. Visual inspection includes desktop
map, narrow Bangla moderator queue and recorded audit/rejection controls. No actual
screen-reader, real phone or live tile response is claimed. Independent TCP probes
confirm ports **3001, 3002, 3003 and 3004 closed** after owned-server shutdown.

The approved Auth background SHA-256 remains
`619bd508c8f6128ec00e7c4029864f7e0c9c6250b94ee4a4aa471edaabccd8cd`.
Git confirms no changes in the scientific/model/location/Auth image/A06 files or
the first four migrations, and the index remains empty. A redacted credential-pattern
scan of all 28 changed/new text files found no provider/private-key/token findings;
this is a scoped heuristic check, not a certification of external secrets/deployment.

Early failures were retained as diagnostics: an existing exact Auth middleware
boundary assertion led to preserving that boundary and using Next page headers;
the first new browser run was 16/20 because implicit select labels included option
text and Leaflet markers lacked explicit Enter/Space handlers. Explicit accessible
labels and key handlers repaired these; the next run passed 20/20. Screenshot
review also corrected Leaflet CSS precedence for centred marker counts. No old
test or assertion was removed/weakened.

## Phase 04 F08 prerequisites and review handoff

Use a protected server route with real verified Auth, exact bounded request shapes,
server-only provider credentials, atomic user/project quotas and cost limits,
timeouts and provider-failure recovery. Ask for explicit location/context consent;
refresh validated exact-coordinate environmental snapshots and preserve source,
freshness, issuance, missing values and evaluated-model coverage. Reuse existing
exposure/travel computations without causal or medical-risk claims. Handle
Bangla/English/Banglish and prevent obsolete replies across account/location changes.
Do not read/send diary symptoms/notes or saved account context without separate
explicit opt-in. Gemini suggestions cannot approve reports or establish causation.
Do not enable A06 or publish forecasts as part of advisor work.

Recommended owner commit message: `Implement F06-backed Community Map and moderator dashboard`.

## Complete changed-file manifest

28 files relative to the repository root: 13 modified tracked files and 15 new
files. No existing test file was changed, removed or weakened.

```text
README.md
docs/community-map-moderation.md
docs/f06-reporting-implementation.md
docs/team-handoff.md
supabase/migrations/0005_community_moderation.sql
supabase/tests/community_moderation.sql
web/next.config.ts
web/package-lock.json
web/package.json
web/scripts/run-browser-regressions.mjs
web/src/app/api/reports/moderation/[id]/route.ts
web/src/app/community/page.tsx
web/src/app/globals.css
web/src/app/moderation/page.tsx
web/src/components/CommunityMap.tsx
web/src/components/CommunityMapCanvas.tsx
web/src/components/Dashboard.tsx
web/src/components/ModeratorDashboard.tsx
web/src/components/MyNirmol.tsx
web/src/components/PollutionReporting.tsx
web/src/lib/auth.ts
web/src/lib/community.ts
web/src/lib/moderation.ts
web/src/lib/reports-backend.ts
web/tests/README.md
web/tests/community-moderation.test.mjs
web/tests/community.browser.mjs
web/tests/community.storage.integration.mjs
```
