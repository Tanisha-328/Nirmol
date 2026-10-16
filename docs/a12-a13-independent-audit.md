# A12/A13 independent audit — 2026-10-17

## Scope and state

Reviewed the uncommitted implementation on `fix/air-forecast-reliability`, HEAD
`63ec575`. Initial status contained exactly six modified and six new files,
matching the request. Inspected all twelve, the real model JSONs, preprocessing,
publisher safety tests, dependency consumers and workflow commands. The earlier
`a12-a13-hardening.md` is implementation history; the independent results below
supersede its native-Linux limitation and its original workflow-test count.

No model, scientific formula, feature UI, health/privacy module, migration or
teammate feature was changed. No production provider, publication endpoint,
database or remote setting was accessed. Installation and metadata verification
used official package registries. Forecast tests used controlled provider inputs
and mocked publication with blocked sockets; acknowledgement messages in the
publisher tests are mock results, not database publications.

An unrelated untracked `web/public/images/background.png` appeared after the
initial inventory. It was left untouched and is outside this audit/commit scope.
No new credentials, environment files or model outputs were found in the scoped
diff or untracked inventory. This is not an assertion about ignored local secrets.

## Prioritized findings

### P0

None confirmed.

### P1 — corrected: case-insensitive Actions opt-in reached the secret-bearing step

GitHub Actions compares strings without regard to case. Thus `TRUE` passes the
existing job-level `== 'true'` condition. The Python guard still refused any write,
but the publishing process would already receive the step's Supabase secrets.
That violated the requested credential boundary for disabled values.
[GitHub expression semantics](https://docs.github.com/en/actions/reference/workflows-and-actions/expressions#operators).

Added a credential-free Python exact-string check after Python setup and before
installation, tests and the credential-bearing step. Its default failure stops
subsequent steps. The variable is passed through an environment mapping, never
interpolated into shell code. No default or enabling value is introduced.

The new regression failed before this correction (first command was installation,
with no exact-value preflight). It now executes the actual gate for absent, empty,
`false`, `0`, `TRUE`, `True`, leading/trailing whitespace, unexpected and exact
`true` values. Only exact `true` exits successfully. The enabled case runs only
the gate, not the publisher. YAML parsing separately verifies its command/env.

### P1 — unresolved: development-tool dependency advisory

Full npm audit still reports five HIGH affected package entries, from one root
advisory: `GHSA-vfj7-8cjw-p6xm` / `CVE-2026-93687`.
The chain is `eslint-config-next@15.5.27 -> @next/eslint-plugin-next@15.5.27 ->
fast-glob@3.3.1 -> micromatch@4.0.8 -> braces@3.0.3`.
[Upstream advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm).

A bounded child process reproduced `RangeError` in `braces.compile()` using a
9,803-character nested pattern. Tooling imports this chain during lint/build;
Next's ESLint root-directory glob setting can supply patterns to fast-glob.
The current repository does not set that option or pass user air/health input
as a glob. No exploit through the current application or default ESLint settings
was established. The package-level failure is real and remains a CI/developer
availability concern if attacker-controlled patterns enter tooling.

Official npm metadata still lists braces 3.0.3 as latest; micromatch 4.0.8 and
fast-glob 3.3.3 retain the affected dependency. Inspected Next tooling 15.5.28 and
16.4.2 also retain fast-glob 3.3.1. No safe published compatible patch was found.
No forced audit fix, suppression, node_modules patch or framework migration was
performed. Retain explicit tracking and isolate untrusted builds/configuration
from credentials until an upstream remedy is reviewed.

### P2

No additional implementation defect confirmed. npm emits existing deprecation
notices for ESLint 9.39.5 and Recharts 2.15.4. Those maintenance notices and
non-pinned OS/interpreter/pip patches remain limitations, not new changes here.

## A12 evidence

| Check | Independently observed result |
|---|---|
| HEAD production audit, copied original manifests | Exit 1: two affected entries, one HIGH PostCSS and one MODERATE Next |
| Current `npm audit --omit=dev --json` | Exit 0: zero vulnerabilities |
| Current `npm audit --json` | Exit 1: five HIGH development entries described above |
| Next PostCSS | 8.4.31 at HEAD -> 8.5.29 through `next@^15.5.27` scoped override |
| Tailwind PostCSS | 8.5.29 at HEAD -> 8.5.30; independent resolution retained |
| Framework/UI versions | Next 15.5.27, React/DOM 19.1.9 and Tailwind 4.3.3 retained |
| Clean `npm ci --no-audit --no-fund` | Exit 0; 358 packages in an isolated temp copy |
| Manifest/lock after clean install | SHA-256 byte-identical to repository files; `npm ls` exit 0 |
| Dependency/CSS/YAML suite in clean installation | 7 passed, including final corrected workflow |

The copied HEAD audit independently reported the four PostCSS advisories listed
in the implementation report. Security checks exercise serialization, external
source-map disclosure with/without `from`, and real Tailwind utility generation.
The override changes only Next's PostCSS resolution; the lock also updates the
separate Tailwind PostCSS entry. CSS/build/browser compatibility passed.

Node 24.18.0/npm 11.16.0 were used. npm's local lifecycle approval policy skipped
the unapproved `unrs-resolver` postinstall. Inspected that hook: it delegates to
`napi-postinstall`, not braces. Installed optional native resolution worked in
the clean dependency tests. No approval policy was changed. Other deployment
Node/npm versions and lifecycle policies require their own clean-install check.

## A13 evidence

Independently fetched official PyPI release JSON for every pin. All 25 SHA-256
hashes match non-yanked wheel files for their exact releases. Evaluated dependency
markers/specifiers and wheel tags for CPython 3.14 on Windows x86-64 and Linux
x86-64 glibc >=2.28: 17 applicable Windows pins and 18 Linux pins form complete
dependency closures. Source builds and unhashed artifacts are refused by pip.

Exact pins: xgboost 3.4.1; numpy 2.5.4; pandas 3.0.6; scikit-learn 1.9.1;
scipy 1.18.1; requests 2.34.2; python-dateutil 2.9.0.post0; tzdata 2026.5;
joblib 1.6.0; narwhals 2.27.1; threadpoolctl 3.7.0;
charset-normalizer 3.5.2; idna 3.20; urllib3 2.8.0; certifi 2026.7.22;
cloudpickle 3.1.2; six 1.17.0; Linux-only nvidia-nccl-cu13 2.32.3.

Clean Windows venv: CPython 3.14.0, pip 25.2; hashed wheel installation succeeded,
`pip check` succeeded, all final 51 Python tests passed, native smoke succeeded.

Clean local Linux: WSL Ubuntu-24.04 x86-64. System Python was only 3.12, so a
temporary isolated CPython 3.14.8 environment was provisioned with a hash-verified
official PyPI uv 0.13.1 wheel. Its venv used pip 26.2.1. All 18 pinned wheels,
including NCCL, installed with hashes; `pip check`, all final 51 Python tests and
real native smoke passed. System Python and project dependencies were unchanged.
This is actual local Linux inference, not just wheel resolution, and is **not a
GitHub-hosted CI result**.

All three real saved models have writer version `[3,4,1]`, 24 identically ordered
features, one target, and the expected p10/p50/p90 quantile objectives. The actual
preprocessing frame, native booster schema and saved metadata agree. Existing
`expm1` conversion, calibrated intervals and per-hour top-factor association are
unchanged. TreeSHAP remains on `log1p_pm25`, including a bias column; it is not
direct concentration change, causal source attribution or prediction uncertainty.

| Fixture quantity | Windows and Linux native result |
|---|---|
| Feature matrix | 25 x 24 |
| Quantile predictions | Three finite vectors of length 25 |
| Median PM2.5 range | 72.38420104980469–77.43429565429688 |
| Median log1p range | 4.295708656311035–4.3622612953186035 |
| SHAP matrix including bias | 25 x 25, finite |
| Maximum additivity residual | 3.814697265625e-06 |

These recorded summaries exactly match the implementation report on both
platforms. This historical reference is a summary fixture, not a stored complete
prediction vector or evidence of real-world forecast accuracy. Code checks SHAP
with `rtol=1e-5, atol=1e-5` and inverse/calibration calculations with `1e-6` tolerances,
appropriate to the observed float32 residual. No fixtures were changed to accept
new outputs.

Negative regressions cover missing/corrupt artifacts, incorrect names/order,
unsupported Python/XGBoost/dependencies, nonfinite inputs/predictions, prediction
and SHAP shapes, nonadditive SHAP and inverse-transform overflow. An additional
offline probe injected native loading failure into the real `build_forecast()`
path: it raised the explicit publication-blocking error before either provider
access or `save()`. No network/publication was used in that probe.

## A06 and workflow boundaries

AST comparison establishes that the entire `main()` and `save()` functions remain
identical to HEAD. The exact Python opt-in helper remains unchanged. Disabled
main/save paths and enabled mock-only paths pass all 24 original publisher tests.
There is still no alternate publisher or split-write fallback.

The new validation workflow has read-only permission, non-persisting checkout,
path-filtered push/PR/manual triggers and no secrets, flag, publication command,
SQL or writing-workflow dispatch. Package installation necessarily uses a registry;
forecast verification afterward uses controlled fixtures and blocked network.
The writing workflow retains schedule/manual triggers, concurrency/timeout,
job-level gate and final original credential references, with the new exact-value
check before any credential-bearing step. Neither workflow was dispatched here.

Actual GitHub, Vercel and Supabase settings, deployed schema and migration state
are **NOT VERIFIED**. Keep the flag absent or false at every applicable scope and
leave the migration unapplied. No SQL/database authorization, transaction, RLS,
concurrency or production endpoint verification was attempted.

## Regression results and intermediate failures

| Suite | Unit passed | Browser passed |
|---|---:|---:|
| Air | 75 | Through dashboard fixtures |
| Dashboard | 14 | 63 |
| F03 | 6 | 14 |
| F04 | 17 | 13 |
| F09 | 59 | 37 |
| F10 engine/preferences | 68 | 54 |
| F14 | 18 | 22 |
| Dependency/CSS/YAML | 7 | Through application suites |
| Web totals | 264 | 203 |
| Python native/contract | 18 per OS | — |
| Existing A06 publisher | 24 per OS | — |
| Workflow safety | 9 per OS | — |
| Python totals | 51 Windows + 51 local Linux | — |

Commands: `node --test tests/*.test.mjs`; all six `node tests/*.browser.mjs`
scripts individually with the existing Playwright module and Edge; `npx tsc
--noEmit`; `npm run lint -- --max-warnings=0`; `npm run build`; Python
`-B -m unittest discover -s jobs/tests -v`; `-B jobs/forecast_runtime.py`;
`pip check`; production/full npm audits; clean npm ci; `git diff --check`.
Browser suites use controlled `/api/air` fixtures against a fresh local production
build, not deployed/provider integration. Runtime/hydration, bilingual 320px
layouts, contrast, keyboard behavior, source races and privacy regressions passed.
TypeScript, zero-warning lint and production build passed before and after the
workflow correction. Git whitespace checks passed.

The deliberate new regression initially failed once and then passed. The full
npm audit remains exit 1 as disclosed; the copied vulnerable HEAD production
audit also exits 1 by design. Initial sandbox network attempts failed and were
retried with approved network access. Two manual JavaScript diagnostics had
PowerShell quoting errors; stdin-based probes corrected them. The first Linux
venv could not be reused after WSL shutdown; a fresh isolated install reran the
final 51 tests and smoke successfully. No product regression was hidden or
disabled; no final test failure or skip remains apart from the unresolved audit.

## Files changed by this audit and release assessment

- `.github/workflows/forecast.yml`: exact-value gate before publication credentials.
- `jobs/tests/test_runtime_workflows.py`: failing-then-passing case/credential gate
  regression and updated command/env assertions.
- `web/tests/dependencies.test.mjs`: actual YAML verification of the new gate.
- `docs/a12-a13-independent-audit.md`: independent evidence and remaining blockers.

The remaining files from the original twelve-file implementation were preserved. No automatic
commit/push/merge/deploy, publication, model training or migration was performed.

A12 production remediation: **locally verified; ready for a separate commit**
with the disclosed unresolved development advisory. The full supply-chain audit
is not clean. A13: **locally verified on Windows and native WSL Linux; ready for a
separate inactive commit**. **Verified in Linux CI: NO**. Hosted workflow execution
and actual deployment toolchains remain unverified. **Production A06 activation:
BLOCKED** pending disposable PostgreSQL/authorization tests and separately
authorized schema, environment and rollout verification. Live provider/operational
accuracy checks and deployed integration remain outstanding.
