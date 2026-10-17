# F06 reporting — Phase 2 implementation and verification

Historical Phase 2 receipt. On 18 October 2026 the owner’s clean repository was
verified at `60c09e4`, which commits Phase 2. The Community Map/moderator work is
now described in [the separate Phase 03 review](community-map-moderation.md).
Its additive migration remains unapplied; this does not certify live enforcement.

Prepared 17 October 2026. Branch: `fix/location-reliability`. Starting HEAD:
`5f4e3034460d1bbc38f91870c847b3b42bc20cb5`; the owner committed Phase 1 there.
The starting working tree was clean. Phase 2 remains local and unstaged. No
migration, remote configuration, publication, deployment, commit or push was run.

## Implemented scope

`/reports` has a public introduction and a real authenticated bilingual submission
flow: optional private photo, editable suspected category, optional AI suggestion,
description, observation time, explicitly inspected incident point, separate
private-coordinate/public-cell consent, pending receipt, own history and withdrawal.
Dashboard and My Nirmol link to it. Guests retain all existing public tools. No
Community Map, fabricated reports, moderator dashboard or F08 advisor is included.
Reports, photographs and AI results never establish PM2.5 concentration or causation.

This is application implementation with deterministic verification, **not a claim
of production readiness**. Real PostgreSQL/RLS/Storage enforcement, deployed Auth,
cleanup scheduling and a live Gemini response have not been verified. The app fails
closed with useful errors if the reviewed schema/configuration is absent.

## Database, authorization and migration

`supabase/migrations/0004_reporting.sql` reuses the existing `pollution_reports`,
`report_reviews`, categories and trusted `profiles.is_moderator` foundation. It
adds `uncertain`, optional-photo support, incident evidence, explicit consent,
request UUID/digest, withdrawal and review revision. Legacy rows remain version 1;
they are excluded from the new public projection rather than silently consenting
their owners. No existing forecast or account table is changed.

The non-exposed `nirmol_reporting` schema holds image reservations, classifications
and atomic quota ledgers. Keep it out of PostgREST's exposed API schemas and review
the actual project configuration independently. Private implementations use `SECURITY DEFINER`, empty
`search_path`, qualified relations and explicit grants. Exposed public wrappers are
`SECURITY INVOKER`. Authenticated actor functions derive `auth.uid()` from verified
Auth, reject anonymous sessions, and check ownership inside the database. The worker
role cannot call the resident submission wrapper. No report owner, reviewer,
moderation timestamp or privileged role is accepted from report input.

Raw report/review writes are revoked and also denied by restrictive RLS policies;
restrictive read guards prevent inherited broad policies from exposing another
resident's rows. Precise location is excluded from resident column grants. Reports
are created/withdrawn through guarded RPCs. The HTTP handler independently calls
the existing request-scoped Supabase `getUser()`, validates exact input shapes and
requires trusted Origin and `x-expected-user` on writes. The latter only detects a
stale tab; it never establishes ownership. Responses are private/no-store, vary by
Cookie and never reflect provider/SQL messages. Public GETs use a separate public
client and the allowlisted projection.

Moderator status comes from the database profile, protected against resident
self-promotion by a trigger as well as the existing policy. Queue/review RPCs check
it on every call, forbid self-review, require a reason and optimistic revision,
record the true actor/transition/time, and permit only submitted → approved/rejected
or approved → rejected. Forwarded/resolved remain future authorized transitions.
Review rows remain private; deletion nulls a reviewer identity while retaining the
audit transition. Phase 3 still needs an authorized audit-reading contract and UI.

Migration reruns use additive columns/indexes, replace named functions/policies and
validate an existing bucket rather than silently changing its security settings.
The reviewer FK is replaced specifically for its reviewer column. Review existing
project grants, extensions, legacy data and any independent teammate migrations
before applying. Re-running source SQL is not a substitute for a migration ledger.
`supabase/scripts/build-reporting-sql.py` regenerates only marked geometry,
projection and wrapper sections; it has no database/network capability.

## Incident location and public privacy

The form starts with no incident coordinates and does not read saved account places,
dashboard selection or F09 diary. A city reference is only a starting point; numeric
coordinates permit correction. Device GPS runs only on explicit action, retains
native timestamp/accuracy (unknown stays null), and cannot overwrite a later manual
choice. Every edit invalidates confirmation. Phase 1 helpers validate the same
pinned Bangladesh polygon; PostGIS independently applies that polygon in SQL.
Border/island approximation is not a legal boundary or a device-accuracy guarantee.

New submissions require observation within seven days (+five-minute clock allowance),
point confirmation within five minutes (+one minute), and GPS captured within two
minutes before confirmation (+one minute) with supplied accuracy at most 1,000 m.
Manual incident selection carries no invented GPS evidence. Dates are canonical UTC
on the wire and displayed/entered in Asia/Dhaka.

The database creates fixed 0.05° cell centres, `(floor(coordinate*20)+0.5)/20`, for
public positions, also enforced by the active-report trigger. This is roughly
5 km locally; cells can cross the border. Coarsening reduces precision and does
not guarantee anonymity. The approved public API exposes only id, suspected
category, status, observation/submission **day**, `suspected:true`, and the coarse
cell. It excludes reporter, description, photo, exact timestamp and precise point.
Only consented version-2 reports in approved/forwarded/resolved state, with a live
reporter and no withdrawal, qualify. The inherited view loses public grants and
identifying fields. Public photos and prose require a separate Phase 3 privacy
review; clients must not round raw coordinates themselves.

## Images, privileged access and maintenance

Upload is an authenticated raw-file HTTP request, never a browser-to-bucket upload.
JPEG/PNG/WebP signature, MIME and filename extension must agree. SVG, HTML,
executables, malformed/animated/multipage files and unsafe names are rejected.
The raw cap is **4 MiB**, below the documented Vercel 4.5 MB function transport
limit ([Vercel limits](https://vercel.com/docs/functions/limitations)). JSON bodies
are capped at 8 KiB; body streams have an eight-second deadline.

Pinned `sharp` 0.35.5 decodes at most 20 million pixels, applies orientation,
flattens transparency to white, resizes within 1920×1920 and re-encodes JPEG quality
82 with a six-second processing timeout. Stored output is at most **2 MiB**.
Default re-encoding removes EXIF/GPS, ICC and source metadata; actual decoded-image
tests verify this ([sharp output](https://sharp.pixelplumbing.com/api-output/)).
Faces, number plates and addresses visible in pixels are **not** automatically
redacted. The bilingual UI tells residents to avoid them. Photos remain private.

The private `nirmol-report-images` bucket accepts only bounded JPEG. Restrictive
Storage policies deny resident/anonymous direct reads, inserts, updates, deletes
and signing, even with an inherited permissive policy. Opaque two-UUID `.jpg` paths
are generated in SQL and excluded from the application HTTP responses. Authenticated
backend RPCs return a path only after ownership/role checks; knowing it still grants
no raw Storage read or signing permission. The image proxy first checks
owner or trusted moderator authorization (moderators may inspect only attached,
live report photos), then verifies content digest and serves a no-store JPEG with
nosniff and sandbox CSP. No signed/public URL or raw EXIF preview is used.

The existing server-only service credential is needed for Storage and finalization,
because residents must not bypass normalization. Its SDK adapter is narrowed to
this fixed bucket, validated paths and named worker RPCs. It is never used for
report creation or reviewer authorization, never attached to a user session and
never sent to the browser. Service credentials inherently bypass Storage RLS; keep
them server-only and operationally restricted ([Supabase Storage security](https://supabase.com/docs/guides/storage/security/access-control)).

Uploads reserve an owner/digest-bound UUID and a two-minute processor lease. A ready
retry returns the existing image; active concurrent processors are refused. Lost
Storage acknowledgement is recovered only if the stored normalized digest matches.
Pre-finalization failure queues/removes the reservation; ambiguous finalization
retains it for safe retry and never deletes a possibly attached photo. Object store
and PostgreSQL cannot form one transaction. Leases, deletion tombstones and repeated
maintenance cover ordinary partial failures; pathological delayed Storage commits
and operational cleanup outages still require staging fault verification.

Hard database caps are three outstanding photos/user, 100 outstanding/project and
200 non-deleted photos/project (at most about 400 MiB of normalized payload, excluding
provider overhead). Failed/expired/deleting objects keep consuming capacity until
deletion is acknowledged. Caps fail closed during cleanup outages.

Reserved images expire after one hour; ready unattached photos after 24 hours.
Withdrawal/account deletion immediately removes public eligibility and queues
photos. A reviewed maintenance run expires active reports after 90 days, scrubs
private point/description/evidence seven days after withdrawal, removes classification
records after 30 days, and prunes eligible deleted-image tombstones after 30 days.
Moderation audit rows remain private. Automatic account deletion by Nirmol is not
introduced; the trigger handles existing trusted Auth deletion operations.

`web/scripts/cleanup-report-images.mjs` processes at most 50 queued objects, removes
each from the fixed bucket, then acknowledges deletion. It requires explicit
operator target selection and `NIRMOL_REPORTING_CLEANUP_APPROVED=reviewed-target`.
It is **not scheduled or run** by this change, build, install or workflow. The
retention periods require a separately authorized recurring maintenance job;
without it physical data is not guaranteed to expire on time. Before deployment,
test interruptions/retries and monitor queued counts, capacity and cleanup age.
Do not invoke this maintenance script as a test against a shared live project.

## Gemini contract and cost control

AI is optional and off by default. Enable only after reviewing a chosen supported
model and provider data handling: `NIRMOL_REPORT_AI_ENABLED=true` plus server-only
`GEMINI_API_KEY` and explicit `GEMINI_REPORT_MODEL`. No model, key or external call
is assumed by tests or build. No private value belongs in `NEXT_PUBLIC_*`.

After separate per-request consent, the authenticated server sends only normalized
JPEG plus incident description to the fixed Google generateContent endpoint. It
does not append coordinates, identity, account settings, diary, symptoms, tools or
conversation history. Residents must also avoid typing those details in free text.
System instructions treat image/description as untrusted evidence. The structured
schema allows only `{category,evidence,uncertainty}` enum fields; arbitrary provider
prose is not displayed. Valid codes select short, fixed bilingual explanations.
Ambiguous/unusable/no-source evidence requires `uncertain`. All suggestions need
human confirmation; accepting, correcting or dismissing is explicit. AI cannot
approve or establish measurements, ownership or responsibility.

The implementation follows Google's documented structured-output REST contract
([structured outputs](https://ai.google.dev/gemini-api/docs/generate-content/structured-output)).
One attempt, no automatic retries, a 12-second overall deadline, 256 output tokens,
16 KiB response bound, exact enum validation and STOP-only completion are enforced.
Invalid JSON, schema changes, truncated output, timeout, quota and provider outage
all leave manual reporting usable. Model availability, schema compatibility,
thinking-token behavior, latency, cost and data-retention terms must be checked
against the explicitly selected live model before enabling. No live call was made.

Atomic per-user and project budgets are enforced in SQL, with a project transaction
advisory lock. Day windows use Asia/Dhaka; minute/day keys are distinct. A completed
digest-bound replay does not spend another operation. Provider failures after
reservation are charged, and another call needs another budgeted request UUID.

| Operation | Per user/day | Per user/minute | Project/day | Project/minute |
| --- | ---: | ---: | ---: | ---: |
| Upload/reserved retry | 20 | 3 | 100 | 5 |
| New report | 10 | 3 | 500 | 10 |
| AI reservation | 5 | 2 | 100 | 5 |

These bound application/provider operations, not a currency guarantee. Hosting
read/egress limits, edge abuse controls, account creation abuse, alerts and provider
billing caps still need operational configuration. Privileged project operators
remain trusted. No in-memory-only quota is represented as distributed protection.

## Typed HTTP and component inventory

`reports.ts` owns request/read contracts and strict parsers. `report-images.ts`
normalizes images; `report-gemini.ts` bounds/validates the provider. The tested
`reports-backend.ts` dispatcher uses injected transports; `reports-runtime.ts`
always supplies real Auth/RPC/Storage/native-image/provider adapters in production.
`reports-api.ts` and eight App Router files expose these operations:

| Endpoint | Method | Role / response |
| --- | --- | --- |
| `/api/reports` | GET, POST | Verified resident: own paginated history / create idempotent pending report |
| `/api/reports/[id]` | GET, DELETE | Owner detail / withdraw before eventual cleanup |
| `/api/reports/images` | POST | Owner raw-file upload; `x-file-name` URI-encoded filename and `x-report-request-id` UUID |
| `/api/reports/images/[id]` | GET, DELETE | Owner or attached-photo moderator read; owner removes unattached photo |
| `/api/reports/classify` | POST | Owner image, explicit consent; category suggestion, never approval |
| `/api/reports/public` | GET | Public allowlist; category/from/to/after/limit≤50 filters |
| `/api/reports/public/[id]` | GET | Approved public-safe summary or 404 |
| `/api/reports/moderation` | GET, POST | Database moderator queue / approve or reject with reason and revision |

`CreateReport` contains requestId, category, description, observedAt, incident,
imageId/suggestionId nullable, categoryConfirmed and publicConsent. Incident contains
lat/lon, manual|gps source, confirmedAt, nullable capturedAt/accuracyM and consent.
Unknown fields, role/identity injection and unknown categories are rejected.
Classification input is requestId/imageId/description/language/consent. Moderation
input is id/decision/reason/revision. `OwnReport` excludes precise coordinates and
object paths; `PublicReport` is the smaller projection described above.

`PollutionReporting.tsx` uses the existing design/i18n/Auth contracts, mobile layouts,
explicit labels and keyboard controls. Private data stays in page memory. Session
verification hides it during outages and only restores a draft after verifying the
same user; sign-out/account switch clears it and supersedes late replies. Frozen
uncertain submissions retry identical UUID/payload and can recover via own history.
Native image preview is private and bypasses shared image optimization caching.

## Verification and executable real-environment tests

Automated Auth/RPC/Storage/Gemini fixtures are deterministic test transports, not
claims about real database policies or live provider output. Actual image decoding,
orientation, EXIF removal and the real Next HTTP handlers run locally. Browser
tests use Edge with external browser traffic blocked in the F06 fixture.

Final evidence is recorded below after completion. Initial failures found/fixed:
unstable edited-textarea label association; test receipt/history timing; fixture
route teardown; the old dashboard assertion that reporting must not exist; one
unused test import rejected by strict lint. SQL review also corrected ambiguous
image/suggestion identifiers, pagination ordering, distinct quota window keys,
cross-operation lock ordering and withdrawn-coordinate cleanup at border cells.
Classification request/image UUIDs are canonicalized so case-only retries reuse
the same receipt and quota rather than conflicting with PostgreSQL's UUID output.

No disposable Supabase instance, Docker, PostgreSQL client or Supabase CLI was
available. No credentials were read to discover a live target. Deliverables:

1. `supabase/tests/reporting.sql`: transactional real PostgreSQL/RLS/Storage-metadata
   assertions for A/B/anonymous/moderator ownership, self-promotion/approval denial,
   trusted audit, precision, private image leases, restrictive bucket policies and
   deleted accounts. It rolls back fixtures. SQL syntax parsing is not execution.
2. `web/tests/reporting.storage.integration.mjs`: real Auth/PostgREST/Storage SDK
   integration, creates explicitly synthetic temporary users and normalized photo,
   tests role/owner/direct-storage/signing/approval/withdrawal, then deletes its
   synthetic Auth users and photo. Withdrawn report/audit tombstones follow the
   documented retention policy on that disposable target. Missing explicit target
   configuration skips, never passes enforcement.

Provision a **dedicated disposable Supabase** by a separately authorized operator.
Review/apply only `0001_init.sql` then `0004_reporting.sql` on that empty target;
`0003` may separately be used for account regression. **Do not bulk apply `0002`,
enable A06, or use `supabase db push`.** Match existing PostGIS and Storage schemas.
With psql installed and a privately supplied disposable connection:

```powershell
psql "$env:NIRMOL_F06_DISPOSABLE_DATABASE_URL" -v ON_ERROR_STOP=1 -v NIRMOL_F06_DISPOSABLE=1 -f supabase/tests/reporting.sql
# From web, with dedicated values supplied privately (never copied into docs/Git):
# NIRMOL_F06_DISPOSABLE=true
# NIRMOL_F06_DISPOSABLE_URL, NIRMOL_F06_DISPOSABLE_PUBLIC_KEY,
# NIRMOL_F06_DISPOSABLE_SERVICE_KEY
# Remote-only additional gate: NIRMOL_F06_STAGING_APPROVAL=isolated-disposable-target
node --test tests/reporting.storage.integration.mjs
```

Real checks remain **UNEXECUTED**. A live environment run must also exercise
concurrent quota/lease races, lost acknowledgements, worker shutdown, account
deletion, expiry/maintenance and review revocation. Do not promote mock passes to
production-secure RLS claims.

## Phase 3 and release prerequisites

Build public map markers from the public RPC only, with category/day filters,
coarse-cell disclosure, honest empty/error states and no verified-source claims.
Build a verified moderator dashboard around queue/review/photo contracts, add
authorized audit reading and pagination, and define any forwarded/resolved workflow.
Photo or narrative publication needs an explicit redaction/consent policy first.
Complete real RLS/Storage and concurrency tests, live Auth/model verification,
review/schedule maintenance, provider/hosting budgets and operational monitoring.

F08 remains absent. Forecast calculations, trained artifacts, A06 disabled state,
Google OAuth, approved login background and F09 diary ownership are preserved.
The inherited development `braces` advisory is unresolved and not suppressed.

## Final evidence and exact changed-file manifest

Final local verification: **691 cases passed, zero failed** (372 web unit/API/
maintenance cases, 268 browser cases, 51 Python cases). The separately gated real
Supabase SDK suite reports **one skipped**, not an enforcement pass.

| Check | Passed | Failed / skipped |
| --- | ---: | --- |
| `node --test tests/*.test.mjs` | 372 (326 existing + 46 F06) | 0 / 0 |
| Dashboard/location browser | 76 | 0 / 0 |
| F03 exposure browser | 14 | 0 / 0 |
| F04 travel browser | 13 | 0 / 0 |
| F14 simulator browser | 22 | 0 / 0 |
| F09 diary browser | 37 | 0 / 0 |
| F10 alerts browser | 54 | 0 / 0 |
| Auth/My Nirmol browser | 34 | 0 / 0 |
| F06 reporting browser | 18 | 0 / 0 |
| Python `-B -m unittest discover -s jobs/tests -v` | 51 | 0 / 0 |
| Real disposable Auth/RPC/Storage SDK | 0 | 0 / **1 skipped** |
| Real PostgreSQL/RLS/Storage-metadata script | **Not executed** | Environment unavailable |

`npx tsc --noEmit`, `npx eslint . --max-warnings=0` and a fresh `npm run build`
pass. Final browser runs have no runtime/hydration errors or unfinished fixture
routes. Browser regressions were run against the fresh Phase 2 build; F06 and
dashboard were repeated after final submission-label/type/copy refinements.
The last classification UUID correction was rechecked by the full unit suite,
lint, TypeScript, build and F06 browser suite. The existing environmental tool
calculations and Python sources are unchanged. Python publication messages in
unit output are mock assertions, not actual publications.

The migration's **150** outer SQL statements and disposable test script's **87**
statements parse with pglast 8.6. This is syntax checking only, not SQL semantic,
role, extension, migration-application or RLS verification. The SQL generator was
rerun locally. All changed-file whitespace and complete-diff reverse checks pass;
the index remains empty. No test server is left running.

Final screenshot inspection covers English/Bangla at 320 px; automated layout
checks cover 320/375/768/1280 px in both system themes, with labels and keyboard
operation. Auth's existing 320–1280 px bilingual visual/contrast cases pass. The
approved background remains SHA-256
`619bd508c8f6128ec00e7c4029864f7e0c9c6250b94ee4a4aa471edaabccd8cd`.

Redacted credential review scanned 139 current tracked/non-ignored files and 195
historical Git blobs across local refs. The sole pattern finding is the existing
`auth.test.mjs:99` intentionally rejected synthetic userinfo URL; no real credential
exposure was identified. Ignored private environment files were not printed or
used. `.env.example` contains blank credential/model placeholders and the false
F06 flag. The only dependency addition explicitly declares the already installed
transitive `sharp` 0.35.5; no package version remediation/advisory suppression is
claimed. `braces` 3.0.3 remains in the development tree with its inherited advisory.

Receipts and screenshots are outside Git under the operating system temporary
directory (`nirmol-f06-unit-final.log`, `nirmol-f06-build-final.log`,
`nirmol-f06-regression-*.log`, `nirmol-f06-browser-*.log`,
`nirmol-f06-python.log`). The complete tracked-plus-new-file review patch is
`%TEMP%/nirmol-f06-review/phase2-complete.diff`. It is not staged or committed.
These local receipts are not deployment evidence.

Exact manifest: **37 files** relative to repository root:

```text
.env.example
README.md
docs/f06-reporting-implementation.md
docs/team-handoff.md
supabase/migrations/0004_reporting.sql
supabase/scripts/build-reporting-sql.py
supabase/tests/reporting.sql
web/package-lock.json
web/package.json
web/scripts/cleanup-report-images.mjs
web/src/app/api/reports/[id]/route.ts
web/src/app/api/reports/classify/route.ts
web/src/app/api/reports/images/[id]/route.ts
web/src/app/api/reports/images/route.ts
web/src/app/api/reports/moderation/route.ts
web/src/app/api/reports/public/[id]/route.ts
web/src/app/api/reports/public/route.ts
web/src/app/api/reports/route.ts
web/src/app/reports/page.tsx
web/src/components/Dashboard.tsx
web/src/components/MyNirmol.tsx
web/src/components/PollutionReporting.tsx
web/src/lib/auth.ts
web/src/lib/report-gemini.ts
web/src/lib/report-images.ts
web/src/lib/reports-api.ts
web/src/lib/reports-backend.ts
web/src/lib/reports-runtime.ts
web/src/lib/reports.ts
web/tests/README.md
web/tests/dashboard.browser.mjs
web/tests/helpers/load-ts.mjs
web/tests/reporting-api.test.mjs
web/tests/reporting-cleanup.test.mjs
web/tests/reporting.browser.mjs
web/tests/reporting.storage.integration.mjs
web/tests/reports.test.mjs
```

Recommended owner commit message: `Implement F06 reporting backend and private submission flow`.
