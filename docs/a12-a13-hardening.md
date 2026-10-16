# A12/A13 dependency and ML runtime hardening

## Baseline and verification scope

Work started on `fix/air-forecast-reliability`, HEAD `63ec575`, with a clean working
tree. Local tooling: Node.js 24.18.0, npm 11.16.0, CPython 3.14.0, bundled pip
25.2 in isolated virtual environments. Python 3.11 is also installed, but is not
the supported native forecast runtime. The prior workflow selected Python 3.12.

Baseline: 257 JavaScript unit tests, 24 offline publisher tests, TypeScript,
zero-warning ESLint and production build passed. No external deployment settings,
environment secrets, production providers or database were accessed for these
checks. Existing model artifacts and historical scientific evaluation are retained.

Installed direct JavaScript versions were Next/eslint-config-next 15.5.27,
React/React DOM 19.1.9, Recharts 2.15.4, Tailwind/@tailwindcss/postcss 4.3.3,
TypeScript 5.9.3 and ESLint 9.39.5. The npm v3 lockfile was already present;
there was no Python lock. The selected native ML stack was not installed in the
default Python environment, so no baseline native success is claimed.
Node 24.18.0 satisfies the installed Next/PostCSS engine declarations. Node 24
with npm 11.16 is the locally verified JavaScript toolchain; another deployment
toolchain still needs its own clean install/build verification.

## A12: production dependency advisories

The baseline production audit reported two affected packages: high-severity
`postcss` and moderate-severity `next` via its PostCSS dependency. The affected
path was `next@15.5.27 -> postcss@8.4.31`. Tailwind already resolved PostCSS
8.5.29. The relevant upstream advisories were:

| Advisory | CVE | Severity | Affected / patched | Behavior |
|---|---|---|---|---|
| [GHSA-qx2v-qp2m-jg93](https://github.com/advisories/GHSA-qx2v-qp2m-jg93) | CVE-2026-41305 | Moderate | `<8.5.10`; fixed 8.5.10 | CSS serialization can close an HTML style element |
| [GHSA-6g55-p6wh-862q](https://github.com/advisories/GHSA-6g55-p6wh-862q) | CVE-2026-45623 | High | `<=8.5.11`; fixed 8.5.12 | External source-map file disclosure |
| [GHSA-r28c-9q8g-f849](https://github.com/advisories/GHSA-r28c-9q8g-f849) | CVE-2026-73646 | High | `<=8.5.17`; fixed 8.5.18 | Source-map path traversal |
| [GHSA-fxqj-rqcc-2cmp](https://github.com/advisories/GHSA-fxqj-rqcc-2cmp) | CVE-2026-69153 | Moderate | `<=8.5.22`; fixed 8.5.23 | Remaining source-map disclosure without a `from` option |

These are real vulnerable library behaviors, reproduced with synthetic CSS and
temporary marker files. No application endpoint accepting arbitrary CSS was found.
PostCSS is in Next's production dependency graph but is principally used here for
build-time CSS processing. Advisory severity is not evidence of a proven public
request exploit in this application.

The compatible Next patch inspected still bundled PostCSS 8.4.31. A supported,
scoped npm override selects `postcss@8.5.29` under `next@^15.5.27`; framework,
React, React DOM and Tailwind versions are retained. The lockfile is updated rather
than deleted. Targeted npm resolution also moved Tailwind's PostCSS from 8.5.29 to
8.5.30; only those two PostCSS lock entries changed. The security tests inspect locked/resolved versions, lock/manifest
consistency, style serialization, source-map disclosure and real Tailwind CSS output.

The separate full-tree advisory is
[GHSA-vfj7-8cjw-p6xm / CVE-2026-93687](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm),
a high-severity braces stack-exhaustion issue affecting `<=3.0.3`, with no patched
release reported at verification time. Its development-only chain is
`eslint-config-next@15.5.27 -> @next/eslint-plugin-next@15.5.27 -> fast-glob@3.3.1
-> micromatch@4.0.8 -> braces@3.0.3`. Five affected development packages reflect
one root advisory. It must be tracked until a safe upstream patch is available;
no advisory suppression, forced upgrade or framework major migration is used.

## A13: supported runtime and reproducibility

The old requirements were `requests>=2.32.3`, `pandas>=2.2.3`, `numpy>=2.1`,
`xgboost>=2.1.3`. They did not fix the native version or complete dependency closure.

The supported runtime is **CPython 3.14, x86-64 Windows or Linux with glibc >=2.28**.
Local native execution uses Windows CPython 3.14.0. GitHub Actions selects the 3.14
maintenance line; its exact patch/OS image can advance and is not byte-identical to
the local interpreter. XGBoost 3.4.1's package metadata requires Python >=3.12.

`jobs/requirements.txt` pins the full Windows dependency closure plus the
conditional Linux NCCL dependency, allows only reviewed wheels, and includes
SHA-256 hashes from official PyPI release metadata. Source builds are disabled.
The file itself enforces `--require-hashes` and `--only-binary=:all:`. The supported
runtime versions are checked before model loading, and lock/runtime consistency
is tested. pip itself is supplied by the selected Python runtime, not upgraded
automatically. This is not a bit-for-bit lock of the OS, interpreter patch or pip.

Core pins: XGBoost 3.4.1, NumPy 2.5.4, pandas 3.0.6, scikit-learn 1.9.1,
SciPy 1.18.1 and requests 2.34.2. The remaining exact pins/hashes are in the
requirements file. Linux additionally needs `nvidia-nccl-cu13==2.32.3` as required
by XGBoost's distribution metadata. Its presence does not imply GPU execution in
the controlled CPU test. Joblib's required cloudpickle dependency is also locked.
There are 18 package pins and 25 approved wheel hashes; Windows installs 17 packages.
Package/runtime evidence includes the [XGBoost 3.4.1 release metadata](https://pypi.org/project/xgboost/3.4.1/).

The three real saved models are XGBoost JSON, not Python pickle/joblib snapshots.
Each JSON artifact records writer version `[3,4,1]`, quantile regression objective,
one target, and the same 24 ordered feature names. The separate metadata file
does **not** record original Python/NumPy/pandas versions. Those historical library
versions cannot be reconstructed from it and are not claimed here.
The distinction between portable model JSON and runtime snapshots is documented
in [XGBoost's model serialization guide](https://xgboost.readthedocs.io/en/stable/tutorials/saving_model.html).

The exact schema is checked against metadata, each JSON artifact, each native
booster and the preprocessing frame:

```text
hour, month_sin, month_cos, weekend, is_winter,
cams_pm2_5, cams_pm10, cams_carbon_monoxide, cams_dust,
cams_pm2_5_log, cams_pm2_5_mean24, temperature_2m,
relative_humidity_2m, dew_point_2m, precipitation, surface_pressure,
cloud_cover, wind_speed_10m, shortwave_radiation, wind_u, wind_v,
rain_24h, pressure_change_24h, wind_mean_12h
```

`jobs/forecast_runtime.py` provides artifact/runtime validation and a nonpublishing
native smoke command. Forecast loading calls its checked loader; inference checks
finite `(25,)` quantile outputs and `(25,25)` median-model contributions, including
the bias column, before slicing or associating factors with hours. Contribution
sums must match the median prediction on the **log1p_pm25** scale. Missing/corrupt
artifacts, runtime/version mismatch, reordered/missing features, nonfinite values,
incorrect shapes and nonadditive SHAP fail visibly.

The existing `expm1` target conversion and calibrated p10/p90 bounds are preserved.
There is no standalone `shap` dependency: XGBoost's native `pred_contribs=True`
is the existing TreeSHAP path. Effects are not direct µg/m³ contributions, causal
source identification or uncertainty. Artifacts, training preprocessing, feature
count/order and historical accuracy claims are not changed or retrained.
The contribution/bias shape and sum semantics follow the
[native Booster prediction API](https://xgboost.readthedocs.io/en/stable/python/python_api.html#xgboost.Booster.predict).

## Nonpublishing CI and A06 protection

Both workflows install the same hashed wheel lock, run `pip check`, the full
offline Python suite and the native fixture smoke command. The new
`forecast-runtime.yml` has path-filtered push/pull-request/manual triggers,
read-only permissions, no secrets, no environment/flag, no provider calls and no
publication command. Checkout does not persist credentials.

The original `forecast.yml` retains schedule/manual triggers and its existing
opt-in condition. Native preflight receives no publication credentials; only the
final publisher step has its original secret references and actual flag forwarding.
The exact-string A06 guards in `main()` and `save()` remain unchanged. Disabled
`main()` performs no forecast computation; disabled `save()` performs no validation,
credential lookup or HTTP transport. Enabled-path tests use mocks with sockets
blocked. No publication, SQL, migration, retraining or remote configuration change
is part of this work.

Actual GitHub/Vercel/Supabase environment settings and deployed migration state
remain **NOT VERIFIED**. Keep `NIRMOL_ATOMIC_PUBLISHER_ENABLED` absent or false
at all applicable scopes, and leave migration 0002 unapplied. Local code does not
prove remote settings are disabled. Database transaction/RLS/authorization checks
still require the separately approved disposable-database process.

## Local commands

Create a fresh Python 3.14 virtual environment, then use its interpreter:

```powershell
python -m pip install --require-hashes --only-binary=:all: -r jobs/requirements.txt
python -m pip check
python -B -m unittest discover -s jobs/tests
python -B jobs/forecast_runtime.py
```

The native smoke uses controlled provider-shaped inputs and real saved artifacts;
it blocks sockets and publication. Do not substitute `refresh_forecast.py --dry-run`:
that older command still fetches live providers.

From `web`, use the existing commands plus `tests/dependencies.test.mjs` in the
unit run, `npm ci`, production/full `npm audit`, TypeScript, zero-warning lint and
a fresh production build. Run all six existing browser files against that build
using the existing Playwright/Edge installation. Browser and air-provider fixtures
do not verify live provider availability, operational forecast accuracy, native
Linux execution, database behavior or deployment readiness.

## Final installation and execution evidence

An isolated clean `npm ci` installed 358 packages from copied manifest/lock files.
Both files retained identical SHA-256 hashes before/after installation. The six
dependency/CSS security tests also passed against that fresh installation; the
seventh workflow YAML parser regression passed against the complete repository.
`npm ls postcss` reports Next 15.5.27 -> PostCSS 8.5.29 overridden and Tailwind's
PostCSS 8.5.30, with no invalid dependency edges.

The app has no install/preinstall/postinstall/prepare lifecycle hooks. The flagged
third-party lifecycle hook was development-only `unrs-resolver@1.12.2`, using
`napi-postinstall` for native binding setup. npm 11.16's default allow-scripts
policy did not execute the unapproved hook; its native binding still loaded from
the clean install. No script approval/configuration change was made. Existing
Recharts 2.15.4 and ESLint 9.39.5 deprecation notices are separate from the audit
findings and were not addressed through unrelated major upgrades.

Final `npm audit --omit=dev --json`: **0 production vulnerabilities**, exit 0.
Final full `npm audit --json`: **5 high development-only affected packages**, exit 1,
all attributable to the unpatched braces advisory listed above. That nonzero exit
is an unresolved full-tree audit result, not a hidden passing check.

A second, clean Python 3.14 virtual environment successfully installed the complete
Windows closure with hashes and wheel-only enforcement. `pip check` found no broken
requirements. Linux CPython 3.14 x86-64 wheels resolved/downloaded for the base
stack; its Linux-only NCCL 2.32.3 wheel was checked separately. Cross-target pip on
Windows evaluates host environment markers, so this is wheel-availability evidence,
not a complete Linux installation or native execution test.

Real artifacts on the controlled 25-hour fixture produced:

| Native result | Observed value |
|---|---|
| Python / XGBoost | 3.14.0 / 3.4.1 |
| Feature frame | 25 rows × 24 ordered features |
| Each quantile prediction | finite `(25,)` |
| Median PM2.5 after `expm1` | 72.38420104980469–77.43429565429688 µg/m³ |
| Median model output | 4.295708656311035–4.3622612953186035 on log1p scale |
| Median native SHAP including bias | finite `(25,25)` |
| Maximum additivity residual | 3.814697265625e-06 |
| Attribution interpretation | log1p_pm25, same model/hour/feature association |

These numerical values are controlled-fixture model outputs, not observed or live
forecast air quality. No historical performance metrics were recalculated. GPU
execution was not verified. A Python 3.11 negative CLI check exited 1 with the
explicit supported-runtime error before trying to import unavailable native modules.

## Complete regression results

| Suite | Unit passed | Browser passed |
|---|---:|---:|
| Air | 75 | No separate browser file |
| Dashboard | 14 | 63 |
| F03 exposure | 6 | 14 |
| F04 travel | 17 | 13 |
| F09 diary | 59 | 37 |
| F10 engine/preferences | 68 | 54 |
| F14 simulator | 18 | 22 |
| Dependency/CSS/YAML security | 7 | Covered by the production browser regressions |
| **Web totals** | **264** | **203** |
| Python runtime/native | 18 | — |
| Existing A06 publisher | 24 | — |
| Workflow source guards | 8 | — |
| **Python total** | **50** | — |

Final tests: **517 passed, zero failures/errors/skips/cancellations**. All six
browser files ran against the freshly built local production server using controlled
fixtures. No flaky browser failure or retry was observed. TypeScript
`npx.cmd tsc --noEmit`, ESLint `npm.cmd run lint -- --max-warnings=0`, production
`npm.cmd run build` and Git whitespace checks passed. The A06 suite's printed
publication acknowledgements come exclusively from its mock transport.

The browser suites retain English/Bangla, light/dark, mobile, keyboard, source,
request-ownership and private diary regression coverage. F10's 12 layout snapshots
at 320/768/1280px checked 888 text samples and 192 focused controls, minimum tested
text contrast 5.08:1. These automated checks are not full assistive-technology or
real-phone certification.

Observed intermediate failures and corrections:

1. Registry access was initially blocked by the sandbox for npm/PyPI. Authorized
   network retries succeeded; those failures did not establish unavailable releases.
2. The first six dependency tests had two passes/four failures, reproducing the
   old locked/resolved PostCSS version, style serialization and two source-map
   disclosures. Adding the override followed by ordinary `npm install` reported
   up-to-date but retained the invalid old edge. Tree/tests caught it; targeted
   `npm update postcss` updated the lock and both installations now pass all checks.
3. Workflow source guards initially reported two failures/six missing-file errors
   before the new runtime workflow/configuration existed. They passed after it was
   implemented, but did not establish YAML syntax validity.
4. An actual YAML parser then rejected the newly added unquoted wheel-only pip
   option because its trailing colon formed YAML syntax. A failing parser regression
   reproduced it. Both commands are now quoted; the parser regression and the eight
   source guards pass. No workflow was executed remotely during these iterations.

## Files and preservation

| File | Reason |
|---|---|
| `web/package.json` | Scoped compatible PostCSS override |
| `web/package-lock.json` | Exact resolved PostCSS versions and integrity metadata |
| `web/tests/dependencies.test.mjs` | Seven dependency, CSS, source-map and actual YAML parser regressions |
| `jobs/requirements.txt` | Full pinned/hash-locked supported wheel closure |
| `jobs/forecast_runtime.py` | Runtime/artifact/schema checks and nonpublishing native smoke |
| `jobs/refresh_forecast.py` | Checked loading/inference and explicit nonfinite-output rejection |
| `jobs/tests/test_forecast_runtime.py` | Eighteen contract, runtime and real-native regressions |
| `jobs/tests/test_runtime_workflows.py` | Eight workflow isolation/runtime/source checks |
| `.github/workflows/forecast.yml` | Same publisher gate; locked runtime and native preflight |
| `.github/workflows/forecast-runtime.yml` | Separate credential-free validation path |
| `README.md` | Link to supported installation and verification scope |
| `docs/a12-a13-hardening.md` | This engineering report |

No files under `web/src`, model artifacts/training code, Supabase SQL, the existing
A06 unit suite/database verifier, Member 02 features or environment examples changed.
F03/F04/F09/F10/F14 calculations, privacy, storage and thresholds remain untouched.

Final branch/HEAD remain `fix/air-forecast-reliability` / `63ec575`. The working
tree contains **six modified and six new files**, all listed above. No commit,
push, merge, deployment, workflow execution, publication, SQL, migration, retraining,
artifact replacement or remote environment/secret change was performed.

## Readiness and exact remaining actions

| Status | Assessment |
|---|---|
| IMPLEMENTED | A12 compatible remediation; A13 supported hash-locked runtime, fail-fast checks and isolated validation CI |
| LOCALLY VERIFIED | Clean npm/Python installs, production audit, full web regressions, real Windows native inference/SHAP, A06 and workflow guards |
| VERIFIED IN CI | **Not verified**; workflows are local uncommitted configuration |
| REQUIRES DEPLOYED INTEGRATION TEST | Provider freshness/availability, real deployment runtime behavior, future operational accuracy |
| BLOCKED / UNVERIFIED | Native GitHub Linux run, remote settings/migration state, actual PostgreSQL transaction/RLS/authorization assertions; unpatched dev braces advisory |

**A12 is locally complete for safely remediable production advisories and ready for
independent review.** Track GHSA-vfj7-8cjw-p6xm until a compatible patched upstream
release is available; rerun the full audit then.

**A13 is implemented and locally verified on Windows, ready for independent review,
but partially verified across platforms.** After review and a separately authorized
commit, run only the new nonpublishing validation workflow on GitHub Linux and
retain its install/native-smoke evidence. Do not activate the publisher. Actual
database verification and explicit separate approval are still prerequisites for
any A06 publication. This work is suitable for a separate review/prototype commit,
not a claim of fully verified production deployment.
