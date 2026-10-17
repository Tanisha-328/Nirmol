# Phase 05A real-world validation and pilot release plan

18 October 2026, Asia/Dhaka. This is a plan, **not completed live evidence or
authorization to apply migrations, deploy, enable A06 or spend money**. See the
[independent audit](independent-product-audit.md) and
[graded feature matrix](feature-evidence-matrix.md). All audit work stays local on
`fix/location-reliability`, starting HEAD `a85a824`.

## Current decision

The complete product is not ready for an unrestricted real-user pilot. A supervised
internal review of public modeled air and comparative calculators is feasible.
Accounts, private incident photos and live AI need the gates below. Do not collect
real health/incident data to compensate for missing test infrastructure. Do not
claim that fixture counts establish database security or forecasting skill.

The code is ready to enter controlled staging validation with synthetic actors
after separate target approval/provisioning. No staging deployment is certified
by this statement. An investor engineering review may show the implemented UI and
honestly labelled fixtures; a production-readiness demonstration must meet the
gates below.

## Gate 1: actual database authorization and retention

Owners: backend/security engineer and independent database operator. Prerequisite:
an explicitly named, approved disposable Supabase target without production data.
No target was supplied or used during this audit; do not discover one from private
env files. Applying anything requires separate approval.

1. Inspect actual catalogs, migrations, roles, grants, sequences, RLS, function
   owners/search paths, exposed schemas, Auth and Storage settings. Keep helper
   schemas private. Capture versions and redacted target identifiers.
2. Review dependencies: 0001/0003/0004/0005/0006 support accounts/report/map/advisor
   without 0002. Never expose the skeleton's old report view as finished F06.
   Verify 0004's enum addition commits before later use with the chosen runner.
   Do not bulk-run `supabase db push`; A06 remains disabled.
3. Resolve the open DB bounding-box versus TypeScript country-polygon constraint
   mismatch in an additive reviewed change. Exercise direct owner REST writes of
   out-of-polygon points and Unicode whitespace/name boundaries. Invalid input
   must not poison the owner's whole settings response.
4. Run actual transactional SQL and gated SDK suites with synthetic A/B users and
   M/N moderators. Attempt raw table/view/RPC access, private Storage GET/list/
   metadata/signed URLs, forged roles, self-approval and cross-account deletion.
   A pending report, private coordinates/text/image paths and reporter identity
   must never be publicly accessible. Test actual grants, not only page entry.
5. Race two real moderation transactions at the same revision: exactly one commits
   and one conflicts; audit/public visibility agree. Race withdrawal/approval and
   account deletion. Verify upload replay/digest conflicts and recovery using
   synthetic images, including forged signatures and EXIF/GPS stripping.
6. Test real F08 duplicate UUID/digest replay, own-account separation, helper denial,
   worker-only finish, actor/project limits, active leases, expiry and concurrency.
   Confirm accepted failures remain charged and explicit retries charge once.
7. Address captured-time-before-lock and transaction-`now()` risks in 0004/0006.
   Block a reservation across a real minute boundary; verify Dhaka midnight on a
   controlled/scheduled target. Check counters, reset metadata and lease expiry.
   Any test clock must be impossible to activate in production through a client
   request or configuration setting. Do not infer these semantics from SQL parsing.
8. Assign and verify scheduled cleanup, failed-job retry, withdrawn object erasure,
   precise-evidence scrubbing, 90-day report expiry, classification/quota retention,
   account deletion and backup retention. A manually run cleanup is not a schedule.

Pass: actual allowed operations work, unauthorized operations fail, real concurrent
outcomes and deletion agree with the contract, and an independent operator signs
off. Only then can relevant C/D rows progress to B. None were promoted here.

## Gate 2: real Auth and the complete hosted journey

Owners: application engineer and independent QA. Use an approved staging domain,
synthetic accounts and the real mail service. Verify canonical HTTPS origin,
cookies/cache headers, PKCE/redirect allowlists, expiry and provider rate limits.

Complete sign-up → actual confirmation email → sign-in → saved place → refresh/
session expiry → recovery email → password update → sign-out. Attack expired/replayed
callbacks, open redirects, cross-site writes and session replacement. Switch A/B in
shared and separate tabs; no old private response or photograph may appear under B.

Complete SENSE → EXPLAIN → ACT → REPORT → COMMUNITY MAP → MY NIRMOL against actual
services: read source/time, compare activity/departure, submit a synthetic report
at a confirmed point, verify pending privacy, approve with M, inspect only the
coarse public allowlist, withdraw as owner and verify removal and eventual image
erasure. Attempt ordinary-user/self-moderation in the same run. CAMS-only operation
must honestly show custom SHAP as unavailable. Keep A06 off.

Pass: a separately witnessed hosted journey with commit, target, time, service
versions and safe receipts. No tokens, keys, real user data or precise private
coordinates belong in public evidence. A fixture session is not a hosted account.

## Gate 3: reproducible science and claims

Owners: environmental scientist/data engineer and independent reviewer.

- Recover original training/holdout observations, source licences, station identity,
  coordinates, units, period semantics, QA flags and checksums. This checkout has
  no holdout CSV/prediction/residual table. Do not invent replacements and call
  them the original evaluation.
- Recompute saved-artifact MAE/RMSE/bias/coverage and residual tails on actual held-out
  rows. Compare model/CAMS/persistence on identical eligible hours and comparable
  lead times; report missingness, extremes, season and sample counts.
- Evaluate as-of-issuance forecast vintages, not analysis-like CAMS history. Verify
  weather and rolling-feature availability at issue time. Use temporal evaluation;
  an asserted split-conformal calibration set must be excluded from final fitting.
  Nominal quantiles and reported empirical coverage do not guarantee future coverage.
- Obtain a defensible current observational comparison when available. A modeled
  CAMS value is not ground truth. Local sensors require calibration/colocation,
  humidity/maintenance QA and uncertainty before serving as a reference.
- Pre-register a prospective operational study, for example four weeks at one site.
  That would not establish multi-season/nationwide skill. Keep those broader claims
  as research until independently supported.
- Review activity factors/provisional exposure categories separately from arithmetic.
  Examine whether small modeled travel advantages are meaningful relative to source
  error. Never sell indicator percentages as medical benefit or minute choices as
  minute-resolution forecasts.
- Check full SHAP including base value on actual evaluated/issued rows, the
  `log1p`/`expm1` transform, run/hour association and rounded top-three limitations.
  Neither SHAP nor community categories establish pollution causation/responsibility.

Pass: reproducible reports and user-facing claims match actual measured evidence.
Retain Baridhara-only custom scope and model/unknown-issuance labels otherwise.
A06 publication remains a separate unverified system and stays disabled.

## Gate 4: live bilingual AI, privacy and cost

Owners: AI engineer, native Bangla/English reviewers and product owner. Prerequisites:
approved target/model/data terms and budget; synthetic prompts/images only. No live
Gemini operation was verified during this audit.

1. Verify model availability, actual server request/schema support, thinking behavior
   and the 256-token bound. Record real latency, termination, input/output/thinking/
   image token usage and cost. One smoke does not certify service or language quality.
2. Prewrite a held-out corpus, for example 60 synthetic questions balanced across
   Bangla/English/Banglish: negation, ambiguous dates, tomorrow with gaps, source/
   geography limits, off-topic, urgent/medical and injection. Those are proposed
   inputs, not completed tests or a comprehension percentage.
3. Independently grade relevance, language, fact/source/time selection and safety;
   retain failures/disagreements. Require zero fabricated measurements, diagnosis/
   prescription, privacy leakage or obsolete account/place replies in release tests.
   Retest with unseen prompts after repairs.
4. Validate whether the reviewed catalog meets actual needs. It cannot produce
   nuanced essays or remember prior messages. Any future conversational context
   needs a separately consented minimal contract, not silent history uploads.
5. Exercise real provider failures and permitted fault injection, labelled separately.
   Confirm no fake successful replies, no unbounded retry and predictable charged
   failures/replays. Reconcile actual billed attempts with the real quota ledger.
6. Protect anonymous/status/public/Auth reads at the perimeter without fingerprinting.
   Cookie clearing can create new guest identities; 20/day is not per anonymous
   person. Review the 200/day project/four-lease capacity before expanding a cohort.

Pass: independently reviewed actual model output, real quota enforcement, understood
privacy/retention terms and an approved cost ceiling. Fixtures are insufficient.

## Gate 5: usable and commercially operable campus pilot

Owners: product/QA, operations and campus sponsor.

- Review axe incomplete results and authenticated forms. Test real screen readers,
  keyboard/text zoom, physical 320/360px phones, slow networks, interrupted uploads,
  lost replies and language restoration. CPU throttling is not a phone benchmark;
  a 44-state automated scan is not WCAG certification.
- Conduct a small consenting participant task study; record actual completion,
  time and misunderstanding of source/time, model vs measurement, comparative
  outputs, empty map vs outage, report review/withdrawal and AI consent. Expert
  review is not participant evidence; do not invent testimonials.
- Agree provider/hosting licences and cost: free Open-Meteo origins do not implement
  a commercial subscription. Add approved customer endpoint/key support through the
  same validation pipeline, keeping keys server-only and attribution visible.
  Do not assume a data licence covers free service use. Confirm OSM tile policy;
  arrange another suitable service if map availability is promised.
- Measure target-host cold/warm latency, memory, caching, query load and large-data
  pagination. Predefine targets (for example warm p95 below two seconds on ordinary
  non-AI pages) and report actual results. Use controlled staging load, not
  uncontrolled paid-provider traffic or unauthorized production probing.
- Cost active users, status refreshes, unique GPS requests, AI tokens, image storage/
  egress, staff, email, logs and backups. Separate invoices from estimates. AI caps
  do not bound all public function/DB/data traffic. Set provider spend caps too.
- Assign moderation coverage, role provisioning/revocation, appeals, deletion,
  incident response and shared-device policy. Agree appropriate institutional
  safeguarding/participant consent before collecting sensitive entries. Unencrypted
  browser diaries are not account-isolated medical records.
- Verify redacted logs/alerts, backups/restore, cleanup retries and patch ownership.
  Keep prompts, exact coordinates, cookies and storage paths out of routine logs.
  Resolve the five HIGH development advisories or obtain a current scoped owner
  risk decision; they remain unresolved, not suppressed, in this audit.

Pass: named owners, observed tasks, measured capacity/budget, tested retention and
no unresolved high-impact security/scientific gap for the promised pilot scope.

## Investor demonstration and evidence promotion

Before a production-readiness demonstration, witness the real staging journey,
show candid modeled/measured/simulated labels, actual error/generalization limits,
tested outages and a credible licensed-provider/moderation budget for the proposed
cohort. Do not fabricate responses, incidents, customers, contracts or traction.
If a gate remains unmet, describe an engineering review with limitations, not a
production launch or validated health product.

Each evidence packet needs commit, redacted target, timestamp/timezone, versions,
configuration names (no secret values), synthetic actors, expected/actual outcomes,
scripts, failure repairs and cleanup. C/D → B needs an actual approved disposable
integration; B → A needs scoped real-service verification. E stays E while required
behavior is absent. None of these database/Gemini/deployment steps was executed in
Phase 05A. The actual public CAMS/weather read and npm registry check are recorded
separately in the independent audit.
