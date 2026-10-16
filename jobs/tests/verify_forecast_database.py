"""Explicit disposable-database tests, including two real concurrent sessions.

Requires psql and a NEW nirmol_a06_test database in a disposable local cluster.
Never reads application environment credentials or permits a remote connection.
"""
import argparse
import concurrent.futures
import copy
import json
import os
from pathlib import Path
import shutil
import subprocess
import threading
from urllib.parse import unquote, urlparse

ROOT = Path(__file__).resolve().parents[2]

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", help="Explicit loopback PostgreSQL URL for nirmol_a06_test")
    args = parser.parse_args()
    psql = shutil.which("psql")
    if not psql or not args.url:
        print("UNVERIFIED: psql and an explicit disposable database URL are required; no database connection attempted.")
        return 77
    url = urlparse(args.url)
    if url.scheme not in ("postgres", "postgresql") or url.hostname not in ("127.0.0.1", "localhost", "::1") or url.path != "/nirmol_a06_test" or url.query or url.fragment:
        parser.error("Only a loopback URL naming nirmol_a06_test without query/fragment is allowed")
    env = {k: v for k, v in os.environ.items() if not k.startswith("PG")}
    command = [psql, "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "--dbname", args.url]

    def sql(statement=None, file=None, check=True):
        try:
            result = subprocess.run(command + (["--file", str(file)] if file else []), input=statement,
                                    text=True, capture_output=True, env=env, timeout=60)
        except (subprocess.TimeoutExpired, OSError):
            # TimeoutExpired's normal traceback includes argv and the URL.
            raise RuntimeError("Disposable database command failed or timed out; connection details withheld.") from None
        if check and result.returncode:
            detail = result.stderr.replace(args.url, "[local test database]")
            if url.password:
                detail = detail.replace(url.password, "[redacted]").replace(unquote(url.password), "[redacted]")
            raise RuntimeError("Disposable A06 database assertion failed:\n" + detail[-4000:]) from None
        return result

    sql(file=ROOT / "supabase/tests/forecast_publication.sql")
    print("PASS: actual SQL validation, injected failures, rollback, replay, SHAP, history and access assertions")

    def publish(data, barrier):
        literal = json.dumps(data, allow_nan=False).replace("'", "''")
        barrier.wait(timeout=10)
        return sql("begin; set local role service_role; select public.publish_nirmol_forecast('" + literal + "'::jsonb); select pg_sleep(1); commit;", check=False)

    for conflict in (False, True):
        data = json.loads(sql("select public.a06_fixture(" + str(int(conflict)) + ");").stdout)
        other = copy.deepcopy(data)
        if conflict: other["points"][0]["pm25_ugm3"] = 41
        barrier = threading.Barrier(2)
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            futures = [pool.submit(publish, value, barrier) for value in (data, other)]
            results = [future.result(timeout=30) for future in futures]
        codes = sorted(result.returncode for result in results)
        if conflict:
            assert codes[0] == 0 and codes[1] != 0, "conflicting publications must have exactly one winner"
        else:
            assert codes == [0, 0], "identical concurrent publications must both acknowledge"
            acknowledgements = [json.loads(next(line for line in r.stdout.splitlines() if line.startswith("{"))) for r in results]
            assert acknowledgements[0]["run_id"] == acknowledgements[1]["run_id"], "concurrent replay duplicated the run"
        start = data["forecast_start"].replace("'", "''")
        counts = json.loads(sql("select jsonb_build_array(count(distinct r.id),count(p.run_id)) from public.forecast_runs r join public.forecast_points p on p.run_id=r.id where r.model='nirmol-xgb-v1' and r.area='dhaka' and r.forecast_start='" + start + "'::timestamptz;").stdout)
        assert counts == [1, 25], "concurrent publication left duplicate or partial data"
        print("PASS: real concurrent " + ("conflicting publications" if conflict else "identical replay"))
    print("Database tests completed. Retain or destroy this disposable cluster manually; no remote services were used.")
    return 0

if __name__ == "__main__": raise SystemExit(main())
