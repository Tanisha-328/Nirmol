# Phase 04 — F08 bilingual environmental advisor

Prepared **18 October 2026 (Asia/Dhaka)**. Application implementation and local
verification, not a production-readiness certificate. No migration, deployment,
hosted credential/configuration change, publication, staging, commit or push.

## Verified starting point

Original repository `C:\Users\tanis\Nirmol`, branch `fix/location-reliability`.
Starting HEAD **`1ac5bd2e840e91d4708016f380acf021ec31824f`** commits Phase 03
(`Implement F06-backed Community Map and moderator dashboard`). Phase 2 is its
parent `60c09e4`; Phase 1 is `5f4e303`. The working tree/index were clean. Older
handoffs' “unstaged” statements are historical receipts, not current Git state.
All Phase 04 changes remain unstaged and HEAD is unchanged.

Preflight covered README, plan, handoff, the location/F06/Community reviews, current
Auth/account/environmental/provider code, dependencies and tests. The historical
plan's automatic anonymous Auth, automatic user-profile context, fake demo reports,
clinical implications and 24h blanket claims are superseded by the actual safer
contracts and this phase's explicit instructions. No duplicate environmental
pipeline, raw report access or persistent chat store was introduced.

## Architecture and data flow

`/advisor` is public: no account/registration is required for general advice when
the reviewed server services are configured. Dashboard and My Nirmol link to it.
The bilingual UI accepts Bangla, English and Banglish, offers suggested questions,
explicit context selection, quota feedback, retry/cancel/clear, source/freshness
metadata and links to F03/F04/F10/F06/Community. It uses existing Nirmol styling,
brand, visible focus and responsive layouts. Existing Auth design/image is intact.

`AIAdvisor.tsx` keeps a bounded conversation in this page's memory, at most twenty
exchanges. It does not read/write chat localStorage/sessionStorage or create a
database transcript. Reload clears it. Each API call sends only its latest question
and current explicitly confirmed context, never previous messages. Follow-ups must
be self-contained. This is deliberately stricter than persisting a browser session.

`/api/advisor` authenticates the actual Supabase session or establishes a signed
guest cookie. It validates the exact request, Origin and expected viewer; reserves
an atomic quota/lease; calls the existing `getAirReport()` adapter; revalidates via
`readAirReport()` and source/issuance rules; builds a minimal context; calls Gemini;
validates the plan; rechecks selected facts and the authenticated user; then returns
an allowlisted answer. Lease release runs in `finally`, using the bounded worker.
No model tool, URL fetching instruction, code execution or raw DB access exists.

`gemini-json.ts` is now shared by F06 and F08. F06 preserves its original enum-only
photo classification contract, prompt, token bound, error codes and optional flag.
The shared transport adds redirect refusal and caller cancellation; tests retain
all existing F06 assertions. No photo/report classification data enters F08.

## Deliberately constrained AI output

This is a real server-side Gemini integration, not a fake response generator.
Gemini interprets the question and supplied evidence and selects a structured plan:
topic, up to three reviewed guidance codes, up to three supplied fact references.
Nirmol renders those references and bilingual guidance. Arbitrary model prose,
numbers, medical instructions, HTML, links, internal prompts and unknown fields
cannot be displayed. The UI explicitly explains this design and labels answers
“Gemini-guided Nirmol answer”. No valid provider plan means an error, not a canned
successful AI reply. There is no fake production backend or sample AI conversation.

The supported guidance catalog covers exposure reduction, activity, timing,
commuting, indoor uncertainty, sensitive-group general precautions, medical/urgent
redirects, source/SHAP limits, reports and forecasts. Responses usually use one to
three short paragraphs, generally around 150 words before source metadata. This
constrained catalog cannot answer every nuanced environmental question or produce
unrestricted essays. Live semantic selection quality, Banglish comprehension and
editorial accuracy require actual model/user evaluation; fixture passes do not
certify those qualities.

Environmental precaution copy follows the [WHO personal interventions review](https://www.who.int/news-room/questions-and-answers/item/air-pollution-personal-interventions-and-risk-communication).
Severe-symptom redirection is consistent with [NHS emergency warning signs](https://www.nhs.uk/symptoms/shortness-of-breath/);
no foreign emergency number is transplanted into the Bangladesh interface. These
links support general safety boundaries, not a clinical service or individual advice.

## Source, place and time contracts

General mode sends no environmental location/facts. Local modes require the Phase 1
`confirmedLocationContext()` allowlist: exact `lat,lon`, source
`confirmed-selection`, canonical `confirmedAt`, pinned Bangladesh coverage. Point
confirmation expires after five minutes (+one minute future skew). Country validation
uses the same unsimplified polygon. Manual coordinates and city references work;
GPS runs only on explicit action and reuses freshness/accuracy validation. GPS
accuracy is displayed separately and never treated as pollution resolution.

Saved places are fetched only after an authenticated user explicitly clicks to
load them. Selecting one is only a draft reference; the point still needs confirmation.
Names, saved-place IDs, account language/preferences, identity and health traits
are not attached to provider input. Removing saved context clears the point and
conversation. There is no automatic dashboard-location or diary import.

The server, rather than the client or model, obtains and validates actual facts.
Current facts carry a model source/valid time and known issuance. Custom current
and forecast facts require known fresh issuance and the exact evaluated Baridhara
reference. CAMS is labelled a regional model grid, never a direct street sensor;
its unknown issuance stays unknown. Retrieval is not generation. Zero is valid;
missing/stale/unsupported data never becomes zero. Weather and private report data
are excluded from the advisor prompt. Open-Meteo/CAMS attribution is shown.

Periods are `general`, `now`, `next24h`, `tomorrow`. Forecast facts only use valid
hours in the requested window; no interpolation, gap filling or substitution from
current data. Tomorrow is the next Asia/Dhaka calendar day, with requested and
available hour counts and partial coverage stated. Recognized tomorrow phrases in
Bangla/English/Banglish override “now”; explicitly unsupported date/past/longer-range
phrases fall back to clearly labelled general information. This lexical aid is not
a complete temporal-language parser: users should inspect/select the displayed
time context. Unknown questions do not establish an additional forecast horizon.

Explicit optional activity is `rest|walking|heavy` and 1–1,440 minutes. For current
mode only, the existing F03 calculation supplies the indicative comparison using
the validated current concentration and selected activity/duration. No clinical
profile/band/probability is sent or inferred. The answer discloses the constant
concentration assumption and activity inputs. Timing guidance links to the existing
F04 integration; Gemini does not invent a best route or compute departure exposure.

Changing point, period or activity clears/version-invalidates the relevant chat
and pending request. A delayed answer cannot appear under another place. User
facts are revalidated after provider completion; selected facts that expire during
generation cause `context_expired`, with no stale answer displayed.

## API schemas and authorization

`GET /api/advisor` returns exactly `{userId,sessionId,available,quota}`. `sessionId`
is an opaque HMAC viewer tag, not Auth/DB authorization. Quota is null if unavailable;
otherwise `{remaining:0..20, resetAt:<UTC ISO>, busy:boolean}` for this actor only.
Unavailable/missing quota schema fails closed; no unverified localStorage allowance
is presented as a backend limit. No account or other-user usage lookup parameter exists.

`POST /api/advisor` requires trusted Origin, JSON ≤8 KiB, `x-expected-user` (verified
UUID or `guest`) and `x-advisor-session` from current status. Exact input:

```ts
{
  requestId: UUID,
  question: string, // trimmed, 2–600 Unicode characters; unsafe controls rejected
  language: "en" | "bn",
  period: "general" | "now" | "next24h" | "tomorrow",
  location: ConfirmedLocation | null,
  activity: {activity:"rest"|"walking"|"heavy",minutes:number} | null,
  providerConsent: true
}
```

No client readings, status/roles, userId, profile, diary, symptom, report-history or
conversation fields are accepted. The cookie/Auth session establishes the actor;
expected headers only detect a stale tab. Auth outages are never downgraded to guests.

Success is `{userId,sessionId,answer}`. Answer allowlist: requestId, userId,
language, origin (`gemini-guided|nirmol-safety`), echoed confirmed location or null,
generatedAt, context, plan and quota. Context contains period, fetchedAt, facts,
forecast coverage and fixed limitation codes. Each fact contains id, kind,
value, valid time, source and optional issuance. The selected plan references
only those facts. Browser validators check identity, request ID, place, freshness,
envelope/field shapes, allowed codes and numeric bounds before rendering text.

Errors expose safe codes/own quota only: invalid/oversized request, untrusted
Origin, session changed, quota exceeded, shared busy, request in progress/conflict,
spent attempt, provider quota/outage/timeout/invalid output and expired context.
No SQL/provider message, prompt, credential or stack trace is reflected. Responses
and the advisor page use private/no-store/no-referrer settings. Application code
does not write private history to shared caches, SSR HTML, URLs, logs or analytics;
hosting/proxy logging and redaction still need independent operational review.

## Gemini configuration and predictable failures

Feature is off unless `NIRMOL_ADVISOR_ENABLED=true` and server-only settings exist:
`GEMINI_API_KEY`, explicit supported `GEMINI_ADVISOR_MODEL`,
`NIRMOL_ADVISOR_COOKIE_SECRET` (at least 32 random characters), the existing public
Supabase config/canonical `NIRMOL_SITE_URL` and server-only service credential.
`.env.example` contains blank placeholders and a false flag. No default Gemini
model is assumed and no hosted key/configuration was changed.

The fixed Google generateContent endpoint uses `x-goog-api-key`, never a key in the
URL/browser. One attempt, zero automatic retries, redirect refusal, a twelve-second
body-inclusive deadline, 16 KiB response bound, 256 output tokens, bounded input,
STOP-only completion and exact structured schema are enforced. Caller abort also
ends the transport. Invalid/blocked/truncated output, quota, HTTP/stream errors and
timeout yield recoverable redacted errors without fabricated AI content. Provider
facts/selected context are JSON evidence separate from system instructions.

Wire contract follows [Google's structured-output REST documentation](https://ai.google.dev/gemini-api/docs/generate-content/structured-output).
Review model availability, schema/thinking-token behavior, pricing, supported
regions, allowed use and [Google's data terms](https://ai.google.dev/gemini-api/terms)
before enabling. Do not assume session-only Nirmol storage means zero provider
retention: unpaid services can use submitted content for improvement/human review;
paid services also have documented processing/abuse-monitoring retention. Avoid
sensitive input and choose a reviewed service arrangement. No training or zero-
retention claim is made.

## Quotas, concurrency and guest limitations

Additive **`0006_advisor_quotas.sql` is authored but unapplied**. It does not change
forecast, reporting, account policies or the inherited `advisor_usage` skeleton.
The new non-exposed `nirmol_advisor` schema contains only quota counters and attempt
metadata: actor, UUID, keyed digest, lease, state and times. No question, location,
prompt, answer or transcript is stored. Raw tables/helpers are revoked and RLS is
enabled/forced. Auth wrappers derive nonanonymous `auth.uid()`; guests and lease
completion use a narrowed worker accepting only named F08 RPCs. The general helper
that accepts an actor is ungranted, preventing user-selected quota ownership.

| Limit | Enforcement |
| --- | --- |
| Account / signed guest cookie | 20 accepted attempts per Asia/Dhaka day; 3 per minute |
| Whole configured project | 200 accepted attempts/day; 20/minute |
| Concurrent provider work | One active lease/actor, four/project |
| Crash recovery | Lease expires after 120 seconds; provider deadline is much shorter |
| Retention | Counters/attempt metadata pruned after two days during reservations; schedule separate idle cleanup before release |

One transaction advisory lock serializes all user/guest budgets and leases. Failed
reservations roll back all increments; accepted attempts consume quota even when
air/provider/response handling fails, a caller cancels, or acknowledgement is lost.
Provider attempts are not refunded. There is no automatic retry or replay of
persisted answers. Same actor/UUID has digest-bound conflict/in-progress/spent
behavior; explicit retry uses a new UUID and counts again. UI hides an uncertain
allowance and supports refreshing it. Lease-release outages fail safely until expiry.
If generation crosses Bangladesh midnight, the server refreshes this actor's new-day
status or returns an unknown allowance; yesterday's remaining count is not reused.

Guests use a random HMAC-signed, HttpOnly, SameSite=Strict cookie (Secure on HTTPS,
24h lifetime) scoped to the advisor API. Only an HMAC pseudonym goes into the ledger.
No IP address, device fingerprint or account is collected for guest quota identity.
Tabs/refresh share the cookie and atomic ledger, but clearing/expiring cookies or
using a new browser can obtain a new guest allowance. This is **not twenty per
anonymous human**. Project/minute/concurrency caps bound aggregate provider spend;
deployment-wide bot/perimeter protections and load testing remain release work.
GET status/cookie requests also need perimeter abuse controls. Never claim an
unbypassable guest identity or a distributed limiter from browser storage.

## Consent, safety and privacy

Only a deliberately typed latest question, validated environmental facts and
explicitly shared activity reach Gemini. Precise coordinates go to the existing
environmental adapters only, never into the model context. Free text itself can
contain sensitive details, so the UI warns users and requires provider consent.
The application cannot perfectly recognize every sensitive phrase. No diary,
saved names, private F06 data or unrelated account metadata is read into prompts.
Provider/activity consent is reset after a successful answer; explicit retry of
the same failed request retains its approved payload. Removing context/cancelling
affects future work; it cannot retract data already processed by a provider.

English/Bangla/Banglish severe-symptom detection returns fixed urgent-care guidance
before quota/provider use. Recognized medicine/diagnosis/symptom requests likewise
take a nonclinical safety path. These replies are distinctly labelled Nirmol safety
guidance, not simulated Gemini output. The static urgent notice remains visible
without a working AI service. Lexical detection is not comprehensive triage; the
model's medical/urgent plans are also reduced to fixed safe guidance. No model
output can add diagnosis, medication/dose, risk percentage or a safety guarantee.
Off-topic decisions give a short environmental-scope redirect without local facts.

Session changes immediately clear old private state and invalidate requests. Focus,
visibility/BFCache events and minute checks verify identity/allowance; private chat
is hidden during unverified states and restored only for the same viewer. New
account/guest tags remount an empty session. Private saved places are owner-checked.
React text rendering and enum-only responses prevent model/user HTML execution.

## Real-service boundaries and executable checks

Live Gemini, hosted Auth, database quota atomicity/RLS/grants and actual concurrent
capacity are **UNVERIFIED**. No disposable Supabase credentials/target were supplied;
PostgreSQL CLI, Supabase CLI and Docker are unavailable in PATH. No private env file
was read to discover a target. Local protocol fixtures are not database enforcement.

On a separately authorized disposable Supabase, independently inspect the schema,
grants, migration history and expose only public wrappers, keeping `nirmol_advisor`
private. Review/apply only the specifically authorized migrations there; do not bulk
run `supabase db push`, apply `0002`, or activate A06. New SQL is self-contained for
Auth quotas and does not require forecast publication. Reload the PostgREST cache.

`supabase/tests/advisor_quotas.sql` uses explicit
`NIRMOL_F08_DISPOSABLE=1` psql gating, transactional fixtures and rollback. It tests
anonymous denial, twenty ceiling, self-only status, worker-only completion, helper/
table denial, guest worker, duplicate/conflicting attempts and Dhaka reset.
Run only with a privately supplied disposable connection and `ON_ERROR_STOP=1`.

`node --test tests/advisor.quota.integration.mjs` requires
`NIRMOL_F08_DISPOSABLE=true`, `NIRMOL_F08_DISPOSABLE_URL`,
`NIRMOL_F08_DISPOSABLE_PUBLIC_KEY`, `NIRMOL_F08_DISPOSABLE_SERVICE_KEY`; remote
targets also require `NIRMOL_F08_STAGING_APPROVAL=isolated-disposable-target`.
It creates/deletes synthetic users, checks own/B isolation, actual simultaneous
reservations and worker/guest grants, then finishes its synthetic leases. Quota
tombstones remain under the documented retention policy. No migration or provider
call is part of this test. Missing settings produce a skip, never an enforcement pass.

## Safe opt-in live smoke and demonstration

After separately approving the real target, provider data/cost arrangement, model,
environment settings, quota migration and successful disposable enforcement tests:

1. Open `/advisor` as a guest. Read the disclosure, select a general question and
   explicitly consent. Confirm a real Gemini-guided answer and allowance decrement.
2. Select/confirm a supported point; inspect current source/time and ask about it.
   Ask about tomorrow and verify forecast-only facts/partial coverage, not today's
   current value. Switch location during a slow answer and show stale-result removal.
3. Demonstrate English, Bangla and Banglish, off-topic/medicine/urgent requests,
   clearing, quota/outage feedback and links to existing tools.
4. Sign in; explicitly load a synthetic saved place, inspect/confirm it, optionally
   share an activity and demonstrate removal/account switching. Never demo real diary,
   symptom, private report or personal-address data.

Optional CLI smoke (not run by tests/build or this implementation): from `web`, set
`NIRMOL_F08_LIVE_SMOKE=approved-target` and `NIRMOL_F08_SMOKE_URL=<approved app origin>`,
then `node scripts/advisor-live-smoke.mjs`. It makes one general guest AI request,
consumes one attempt, sends no coordinates/history/private key, refuses redirects
and prints only success/origin/remaining/reset metadata. It is not a quota/RLS
certification and may incur provider cost. No live smoke was executed here.

## Local verification and remaining release work

Final verification ran against the final application code and a fresh production
build. All ten browser suites exited zero. No original test file/assertion was
removed or weakened.

| Check | Passed | Failed | Skipped |
| --- | ---: | ---: | ---: |
| Web unit/API/maintenance | 436 | 0 | 0 |
| Dashboard browser | 76 | 0 | 0 |
| Exposure browser | 14 | 0 | 0 |
| Travel browser | 13 | 0 | 0 |
| Simulator browser | 22 | 0 | 0 |
| Exposure diary browser | 37 | 0 | 0 |
| Alerts browser | 54 | 0 | 0 |
| Auth/My Nirmol browser | 34 | 0 | 0 |
| F06 reporting browser | 18 | 0 | 0 |
| Community/moderation browser | 24 | 0 | 0 |
| F08 advisor browser | 26 | 0 | 0 |
| Python jobs/models | 51 | 0 | 0 |
| **Executed total** | **805** | **0** | **0** |
| Real disposable Supabase SDK suites (outside the executed total) | 0 | 0 | 3 |

Browser subtotal: **318**. F08 adds **44 unit/API and 26 browser cases** to the
unchanged baseline of 735 passing tests. Deterministic fixtures exercise the actual
Next route, Auth/quota/air adapters and Gemini HTTP transport; they do not establish
real PostgreSQL enforcement or live model quality.

TypeScript `tsc --noEmit`, strict ESLint with `--max-warnings 0`, `npm ls --depth=0`,
fresh `npm run build` (Next 15.5.27) and `git diff --check` all exited **0**. ESLint
reported zero warnings. No package or lockfile changed. The isolated Python suite
ran all 51 cases with no skips; its publication messages are mocked test operations.
The new migration and rollback SQL test parsed with pglast 8.6 (28 and 40 outer
statements respectively), but SQL/PLpgSQL execution, grants, RLS and transactional
concurrency remain **unexecuted/unverified**. The three skipped SDK suites cover
F06 Storage, Community/moderation enforcement and F08 quota enforcement.

Security regressions cover invalid/oversized input, malicious extra fields, prompt
injection, XSS, malformed/blocked/truncated model plans, provider deadline/quota,
guest access, lease races, charged retries, diary/account privacy, explicit consent,
account switching, obsolete locations, missing data and forecast mismatch. Fixes
include the shared Gemini redirect/body/deadline guard, revalidation after generation,
safe session isolation, synchronous GPS failures/manual-selection races and the
Bangladesh-midnight quota refresh. The response catalog prevents arbitrary model
medical instructions or fabricated facts from reaching the UI.

Early F08 browser runs exposed test locator/privacy-assertion mistakes and persistent
Next fetch caching across fixture runs. Those new tests were corrected, and the
test-only provider hook now preserves Next fetch markers and disables caching only
for its loopback fixtures. Production air caching is unchanged. The final full
regression runner and F08 standalone suite both pass. The additional midnight unit
test also passes in the final full unit run.

Local receipts under `%TEMP%`:

- `nirmol-f08-unit-final.log`, `nirmol-f08-python.log`, `nirmol-f08-supabase.log`.
- `nirmol-f08-build-final.log`, `nirmol-f08-browser-regressions-final.log` and
  `nirmol-f08-regression-<suite>.log` for each of the ten browser suites.
- Final F08 screenshots: `nirmol-f08-browser-hc1xbo` (English/Bangla at 1280/320px).
  Desktop English and narrow Bangla were visually inspected; automated layout,
  accessible-label, keyboard focus and overflow checks passed. This is not a manual
  screen-reader or physical-phone certification.

The 32-file manifest below matches Git's tracked diff plus untracked files exactly.
Secret-pattern scans of those 32 text files and 48 generated browser JS files found
zero matches; browser tests also check synthetic server secrets against requests,
responses, DOM and client chunks. The index is empty, branch/HEAD are unchanged,
and the original workflows, science/jobs/models, first five migrations and location
implementation have no diff. Approved Auth background SHA-256 is unchanged:
`619bd508c8f6128ec00e7c4029864f7e0c9c6250b94ee4a4aa471edaabccd8cd`.

The inherited development `braces` advisory remains unresolved and unsuppressed;
no dependency version, package manifest, lockfile, workflow, model, diary or approved
Auth image was changed. Real model relevance/language review, live service safety,
quota/RLS/concurrency, proxy logging/redaction, bot controls, provider cost/retention,
cookie/session settings, idle ledger cleanup, phone/screen-reader usability and
hosting performance must be verified before Phase 05 production integration.

Recommended owner commit: `Implement grounded bilingual F08 advisor with private atomic quotas`.

## Complete changed-file manifest

32 files: 11 modified tracked files and 21 new files. No existing regression test
file was changed or removed; the test runner and test documentation were extended.

```text
.env.example
README.md
docs/f08-ai-advisor.md
docs/team-handoff.md
supabase/migrations/0006_advisor_quotas.sql
supabase/tests/advisor_quotas.sql
web/next.config.ts
web/scripts/advisor-live-smoke.mjs
web/scripts/run-browser-regressions.mjs
web/src/app/advisor/page.tsx
web/src/app/api/advisor/route.ts
web/src/app/globals.css
web/src/components/AIAdvisor.tsx
web/src/components/Dashboard.tsx
web/src/components/MyNirmol.tsx
web/src/lib/advisor-backend.ts
web/src/lib/advisor-context.ts
web/src/lib/advisor-gemini.ts
web/src/lib/advisor-guidance.ts
web/src/lib/advisor-runtime.ts
web/src/lib/advisor-session.ts
web/src/lib/advisor-validation.ts
web/src/lib/advisor.ts
web/src/lib/auth.ts
web/src/lib/gemini-json.ts
web/src/lib/report-gemini.ts
web/tests/README.md
web/tests/advisor-api.test.mjs
web/tests/advisor.browser.mjs
web/tests/advisor.quota.integration.mjs
web/tests/advisor.test.mjs
web/tests/helpers/advisor-provider-hook.cjs
```
