# Phase 05B: Windows disposable Supabase setup

Prepared 18 October 2026, Asia/Dhaka. **Instructions only; not executed.** The
owner prohibited access to the existing Nirmol Supabase project and has not
authorized live Gemini. This procedure creates an unrelated local test stack.
Do not login, link, pull, push, restore a hosted backup, or use hosted credentials.

## Feasibility on the inspected machine

Observed: x64, Windows build `26200.9711`, DisplayVersion `25H2`, 15.6 GiB RAM,
WSL `2.7.10.0`, kernel `6.18.33.2-2`. The registry ProductName still says
"Windows 10 Home Single Language"; confirm the actual edition/build with `winver`
rather than treating that legacy registry label as an OS compatibility result.
Docker/Podman/psql/Supabase were absent from PATH and the checked system/per-user
installation locations. No local Supabase config exists in the repository.
Only about 3.3 GiB RAM was free during browser tests (4.3 GiB afterward); about
287 GiB disk was free on C:. CPU virtualization/SLAT could not be read because
CIM returned Access denied; a working Docker engine remains unverified.
**A local stack is plausible, not demonstrated.**

Docker's WSL backend requires supported Windows, WSL >=2.1.5, virtualization/SLAT
and at least 8 GB RAM. Home supports Linux containers, which are sufficient here.
Use Task Manager > Performance > CPU to check Virtualization, Settings > System >
About / `winver` for Windows, and Settings > Storage for disk headroom. Close
unneeded apps before running the stack alongside Next and Edge.
[Docker Windows requirements](https://docs.docker.com/desktop/setup/install/windows-install/)

## 1. Install prerequisites manually

Run these checks in PowerShell:

```powershell
winver
wsl.exe --version
node.exe --version
npm.cmd --version
```

WSL is already installed on this machine. If setup reports missing/outdated WSL,
the owner can run `wsl.exe --update`; on a machine without WSL, an Administrator
can run `wsl.exe --install --no-distribution`, then reboot if requested. These
changes were not performed by the audit.
[Microsoft WSL commands](https://learn.microsoft.com/windows/wsl/reference)

Download/install Docker Desktop from the official Windows page, choose the WSL 2
backend and Linux containers, then launch it. Accept its licensing terms only
after checking applicability to your use. Verify in a fresh PowerShell:

```powershell
docker.exe version
docker.exe context show
docker.exe context inspect --format '{{.Endpoints.docker.Host}}'
```

The server must be this machine's Docker Desktop engine (normally an `npipe://`
endpoint). **Stop if the context points to SSH/TCP/a remote engine.** A context
name alone is not proof of isolation. Do not prune/delete other containers or
volumes to make room. Supabase's Windows local runtime requires Docker-compatible
containers; its experimental native runtime is not a Windows substitute.
[Supabase installation](https://supabase.com/docs/guides/local-development/cli/getting-started)

## 2. Create a new, unlinked audit workspace

Run in a new PowerShell, without command transcription or screen sharing when
local credentials are obtained. This installs the CLI into a separate directory,
not Nirmol's package manifest. The exact resolved CLI version is pinned there.

```powershell
$auditRoot = Join-Path $env:LOCALAPPDATA 'NirmolAudit\phase05b-local'
if (Test-Path -LiteralPath $auditRoot) { throw 'Choose a NEW audit directory; do not reuse/reset an unknown instance.' }
New-Item -ItemType Directory -Path $auditRoot | Out-Null
Set-Location -LiteralPath $auditRoot
npm.cmd init -y
$auditCliVersion = (npm.cmd view supabase version).Trim()
if ($LASTEXITCODE -ne 0 -or $auditCliVersion -notmatch '^\d+\.\d+\.\d+$') { throw 'CLI version resolution failed' }
npm.cmd install --save-dev --save-exact "supabase@$auditCliVersion"
if ($LASTEXITCODE -ne 0) { throw 'CLI install failed' }
npx.cmd supabase --version
npx.cmd supabase init
```

Inspect `supabase/config.toml` before starting anything:

- Set `project_id = "nirmol05baudit"`; ensure no container/volume already uses it.
- Keep this workspace unlinked: no `supabase/.temp/project-ref` and no platform
  login/link command. Keep only the synthetic local migration files below.
- Keep API schemas at the normal public schemas; never expose `nirmol_reporting`
  or `nirmol_advisor` through PostgREST.
- In the existing `[db.seed]` section set `enabled = false`.
- In `[auth]` set `site_url = "http://localhost:3000"`,
  `additional_redirect_urls = ["http://localhost:3000/auth/callback"]`, and
  `enable_anonymous_sign_ins = false`.
- In `[auth.email]` set `enable_signup = true`, `enable_confirmations = true`.
  Keep the generated local mail-capture service; configure no external SMTP.
- Keep normal local ports, and ensure 54321–54324 and app port 3000 are unused.
  If occupied, choose/configure an independent port set; do not stop unknown apps.

These settings must be edited in their existing TOML sections, not appended as
duplicate sections. Local email capture can test confirmation/recovery flows but
cannot prove hosted email deliverability.
[Auth/seed settings](https://supabase.com/docs/guides/local-development/cli/config)

## 3. Prepare only the selected migrations

From this new audit directory, run the following Python block via PowerShell.
It copies source SQL, splits 0004 at its existing enum/transaction boundary,
records hashes/mapping and refuses a nonempty migration directory. **It does not
connect to any database.** The source repository and original migration filenames
are unchanged. No 0002 SQL, forecast publisher RPC or seed is copied.

```powershell
@'
from pathlib import Path
import hashlib, json, shutil
repo = Path(r"C:\Users\tanis\Nirmol")
audit = Path.cwd().resolve()
assert audit.name == "phase05b-local" and audit != repo.resolve()
assert (audit / "supabase/config.toml").is_file()
assert not (audit / "supabase/.temp/project-ref").exists(), "Never use a linked project"
dest = audit / "supabase/migrations"
dest.mkdir(exist_ok=True)
assert not list(dest.glob("*.sql")), "New empty migrations directory required"
manifest = []
def emit(source, version, data):
    target = dest / version
    target.write_bytes(data)
    manifest.append({"source": source.name,
                     "source_sha256": hashlib.sha256(source.read_bytes()).hexdigest(),
                     "local_migration": version,
                     "local_sha256": hashlib.sha256(data).hexdigest()})
for name, version in [
    ("0001_init.sql", "20261018000100_init.sql"),
    ("0003_account_settings.sql", "20261018000300_account_settings.sql")]:
    source = repo / "supabase/migrations" / name
    emit(source, version, source.read_bytes())
source = repo / "supabase/migrations/0004_reporting.sql"
parts = source.read_bytes().splitlines(keepends=True)
assert parts[2].strip() == b"alter type public.report_category add value if not exists 'uncertain';"
assert parts[3].strip() == b"begin;", "Boundary changed; STOP for review"
emit(source, "20261018000400_reporting_enum.sql", b"".join(parts[:3]))
emit(source, "20261018000401_reporting.sql", b"".join(parts[3:]))
for name, version in [
    ("0005_community_moderation.sql", "20261018000500_community_moderation.sql"),
    ("0006_advisor_quotas.sql", "20261018000600_advisor_quotas.sql")]:
    source = repo / "supabase/migrations" / name
    emit(source, version, source.read_bytes())
assert len(list(dest.glob("*.sql"))) == 6
(audit / "source-migration-manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
print("Prepared six local files from five source migrations; 0002 excluded. NO database operation executed.")
'@ | python.exe -
if ($LASTEXITCODE -ne 0) { throw 'Migration preparation stopped; review before continuing' }
```

Why split: the new enum value gets its own committed migration before the 0004
body. The local CLI records the six **actually applied local versions**, mapped
to five original files by hashes. This is a disposable validation history, not
the existing project's migration history. Never mark original `0002` applied,
repair the hosted history, or push these copies. A future release needs a separate
reviewed plan to preserve the original deployed history; no such plan is verified
by a local copy. Inspect resulting SQL/manifest before proceeding.
[Supabase transaction/history behavior](https://supabase.com/docs/guides/local-development/cli-workflows)

## 4. Start only the owned local stack

Confirm the selected directory, new project ID, local Docker context, unused
ports, six SQL files and absence of a remote link. These establish intended
ownership; the fresh stack contains only platform bootstrap data initially.

```powershell
$auditExistingResources = @(
    docker.exe ps -a --filter 'name=nirmol05baudit' --format '{{.Names}}'
    docker.exe volume ls --filter 'name=nirmol05baudit' --format '{{.Name}}'
    docker.exe network ls --filter 'name=nirmol05baudit' --format '{{.Name}}'
)
if ($auditExistingResources | Where-Object { $_.Trim() }) { throw 'Existing audit-named resources: do not reuse or delete them automatically' }
docker.exe network create -o 'com.docker.network.bridge.host_binding_ipv4=127.0.0.1' nirmol05baudit-local
if ($LASTEXITCODE -ne 0) { throw 'Network creation failed; inspect ownership before proceeding' }
$auditStartOutput = & npx.cmd supabase start --network-id nirmol05baudit-local 2>&1
if ($LASTEXITCODE -ne 0) { throw 'Local stack failed; inspect output privately, redact credentials before sharing' }
# Do not echo $auditStartOutput: CLI startup may include local private keys.
docker.exe port supabase_db_nirmol05baudit
docker.exe port supabase_kong_nirmol05baudit
```

Require loopback-only bindings, including IPv6; stop the owned instance if a
public binding appears. Inspect platform health and extension schema/search-path
compatibility. Migration failures are failures, not permission-denial passes.
If 0001 cannot resolve PostGIS `geography`, inspect extension/search_path in this
disposable instance; do not blindly modify the original migration. Capture the
exact error with keys removed and repair through review. No compatibility claim
is made until the stack really starts and the positive RPC tests pass.
[Loopback network guidance](https://supabase.com/docs/guides/local-development)

For a later repeat, only after re-verifying this same disposable ownership,
`npx.cmd supabase db reset --local` will replay just this audit workspace's
selected copies. **Never run reset in the original repository, use `--linked`,
or use `db push`.** No reset/start/migration command in this guide was executed.

## 5. Run real tests and the application

Capture local status in memory; never print it or save its keys in repository
files, terminal transcripts, screenshots or audit receipts:

```powershell
$auditStatusText = & npx.cmd supabase status -o json 2>$null
if ($LASTEXITCODE -ne 0) { throw 'Local status unavailable' }
$auditStatus = ($auditStatusText -join "`n") | ConvertFrom-Json
$auditApi = [uri]$auditStatus.API_URL
if ($auditApi.Scheme -ne 'http' -or $auditApi.Host -notin @('127.0.0.1','localhost') -or $auditApi.Port -ne 54321) { throw 'Unexpected API target' }
$auditPublicKey = $auditStatus.PUBLISHABLE_KEY
if (-not $auditPublicKey) { $auditPublicKey = $auditStatus.ANON_KEY }
$auditWorkerKey = $auditStatus.SECRET_KEY
if (-not $auditWorkerKey) { $auditWorkerKey = $auditStatus.SERVICE_ROLE_KEY }
if (-not $auditPublicKey -or -not $auditWorkerKey) { throw 'Expected local key fields absent; inspect CLI version privately' }
$env:NIRMOL_F06_DISPOSABLE = 'true'
$env:NIRMOL_F08_DISPOSABLE = 'true'
$env:NIRMOL_F06_DISPOSABLE_URL = $auditApi.AbsoluteUri.TrimEnd('/')
$env:NIRMOL_F08_DISPOSABLE_URL = $env:NIRMOL_F06_DISPOSABLE_URL
$env:NIRMOL_F06_DISPOSABLE_PUBLIC_KEY = $auditPublicKey
$env:NIRMOL_F08_DISPOSABLE_PUBLIC_KEY = $auditPublicKey
$env:NIRMOL_F06_DISPOSABLE_SERVICE_KEY = $auditWorkerKey
$env:NIRMOL_F08_DISPOSABLE_SERVICE_KEY = $auditWorkerKey
Set-Location -LiteralPath 'C:\Users\tanis\Nirmol\web'
node --test tests/reporting.storage.integration.mjs tests/community.storage.integration.mjs tests/advisor.quota.integration.mjs
```

For transactional SQL checks, use the verified local DB container's bundled psql
(no host PostgreSQL installation required). Execute one at a time and stop at
the first error:

```powershell
$auditDbContainer = 'supabase_db_nirmol05baudit'
foreach ($auditSqlTest in @('account_settings.sql','reporting.sql','community_moderation.sql','advisor_quotas.sql')) {
    docker.exe cp "C:\Users\tanis\Nirmol\supabase\tests\$auditSqlTest" "${auditDbContainer}:/tmp/$auditSqlTest"
    if ($LASTEXITCODE -ne 0) { throw 'Test copy failed' }
    docker.exe exec $auditDbContainer psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 -v NIRMOL_F06_DISPOSABLE=1 -v NIRMOL_F08_DISPOSABLE=1 -f "/tmp/$auditSqlTest"
    if ($LASTEXITCODE -ne 0) { throw 'Real SQL check failed; do not report a pass' }
}
```

Do not run `forecast_publication.sql`: it applies the excluded A06 migration.
The four suites above roll back synthetic SQL records but are not comprehensive:
see the Phase 05B report for missing Auth mail, midnight, sequential twenty-attempt,
retention, grants and hosted/perimeter checks. SDK tests create/delete only their
new synthetic actors; some guest quota metadata remains until expiry/pruning.

For the application, keep the same shell's local credentials:

```powershell
$env:NEXT_PUBLIC_SUPABASE_URL = $env:NIRMOL_F06_DISPOSABLE_URL
$env:NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = $auditPublicKey
$env:SUPABASE_SERVICE_ROLE_KEY = $auditWorkerKey
$env:NIRMOL_SITE_URL = 'http://localhost:3000'
$env:NIRMOL_ATOMIC_PUBLISHER_ENABLED = 'false'
$env:NIRMOL_REPORT_AI_ENABLED = 'false'
$env:NIRMOL_ADVISOR_ENABLED = 'false'
foreach ($auditGeminiVariable in @('GEMINI_API_KEY','GEMINI_REPORT_MODEL','GEMINI_ADVISOR_MODEL','NIRMOL_ADVISOR_COOKIE_SECRET')) {
    [Environment]::SetEnvironmentVariable($auditGeminiVariable, $null, 'Process')
}
Set-Location -LiteralPath 'C:\Users\tanis\Nirmol\web'
npm.cmd run build
if ($LASTEXITCODE -ne 0) { throw 'Production build failed' }
npm.cmd run start -- --hostname localhost --port 3000
```

The nonempty local URL/key/worker and false flags override any repository env
file. Never paste or echo the worker key. Use only localhost:3000,
confirm signup/recovery through the local mail-capture UI, and run the eleven-step
synthetic user/moderator journey in the verification report. Provision moderator
roles only through this local admin. This still cannot test live Gemini while AI
is disabled. Local mail is not internet delivery; local RLS is not hosted RLS.

When finished, return to `$auditRoot` and run `npx.cmd supabase stop` to stop only
this selected project while retaining its data for inspection. No automatic
volume deletion, Docker prune, hosted reset or existing-project cleanup is needed.

## What was checked locally in 05B

All eight PowerShell blocks were parsed without execution. The Python SQL-copy
block was executed only against a fresh temporary **filesystem fixture**, with a
stub config (no CLI, Docker or database): it generated six files, excluded 0002,
verified their hashes, and reassembled the two 0004 pieces byte-for-byte to the
original. Receipt directory: `%TEMP%/nirmol-05b-setup-dryrun-xe_64iym`.
This validates preparation mechanics, not the TOML/CLI runtime, migration SQL,
extension compatibility, history recording, Auth, RLS or Storage.
