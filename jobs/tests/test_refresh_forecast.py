"""Offline publication contract tests. No models, providers or database are run."""
import importlib.util
import json
import re
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

spec = importlib.util.spec_from_file_location("refresh_forecast", Path(__file__).parents[1] / "refresh_forecast.py")
job = importlib.util.module_from_spec(spec)
# The original job imports native ML dependencies at module scope. Stub them
# only while importing: publisher tests must not require or execute a model.
with patch.dict("sys.modules", {name: MagicMock() for name in ("numpy", "pandas", "xgboost", "train_forecast", "requests")}):
    spec.loader.exec_module(job)

NOW = datetime(2026, 10, 17, 6, 30, tzinfo=timezone.utc)
FLAG = "NIRMOL_ATOMIC_PUBLISHER_ENABLED"
DISABLED_FLAGS = (None, "false", "0", "", "unexpected", "TRUE", "True", " true", "true ", "1", "yes")

# Even an accidentally unstubbed transport must never open a socket in this suite.
NETWORK_BLOCKERS = [patch(target, side_effect=AssertionError("Offline publisher tests forbid network access"))
                    for target in ("socket.create_connection", "socket.socket.connect", "socket.socket.connect_ex")]

def setUpModule():
    for blocker in NETWORK_BLOCKERS: blocker.start()

def tearDownModule():
    for blocker in reversed(NETWORK_BLOCKERS): blocker.stop()

def iso(value):
    return value.isoformat().replace("+00:00", "Z")

def payload():
    start = NOW.replace(minute=0)
    return {"model": "nirmol-xgb-v1", "area": "dhaka", "issued_at": iso(NOW), "forecast_start": iso(start),
            "metrics": {"test_mae": 1, "cams_test_mae": 2, "interval_coverage": .8, "trained_at": "2026-10-13T00:00:00Z"},
            "points": [{"valid_at": iso(start + timedelta(hours=i)), "pm25_ugm3": 40.0, "pm25_low": 30.0, "pm25_high": 50.0,
                        "top_factors": {"cams_pm25": 25.0, "factors": [
                            {"feature": "hour", "value": i, "effect": .1},
                            {"feature": "cams_pm2_5", "value": 25, "effect": -.2},
                            {"feature": "temperature_2m", "value": 28, "effect": .3}]}}
                       for i in range(25)]}

class Timeout(Exception): pass
class ConnectionError(Exception): pass
class Response:
    def __init__(self, status=200, data=None):
        self.status_code, self.data = status, data
    def json(self):
        if isinstance(self.data, Exception): raise self.data
        return self.data
    def raise_for_status(self):
        if self.status_code >= 400: raise RuntimeError("controlled HTTP failure")

def ack(**changes):
    return Response(data={"run_id": 7, "issued_at": iso(NOW), "forecast_start": payload()["forecast_start"],
                          "published_at": iso(NOW), "replayed": False, **changes})

class Transport:
    exceptions = SimpleNamespace(Timeout=Timeout, ConnectionError=ConnectionError)
    def __init__(self, responses=None, cleanup_error=False):
        self.responses = list(responses or [ack()])
        self.posts, self.deletes, self.cleanup_error = [], [], cleanup_error
    def post(self, url, **kwargs):
        self.posts.append((url, kwargs))
        result = self.responses.pop(0)
        if isinstance(result, Exception): raise result
        return result
    def delete(self, url, **kwargs):
        self.deletes.append((url, kwargs))
        if self.cleanup_error: raise Timeout("controlled cleanup timeout")
        return Response(status=204)

class PublicationTests(unittest.TestCase):
    def setUp(self):
        self.env = patch.dict("os.environ", {"NEXT_PUBLIC_SUPABASE_URL": "https://controlled.invalid", "SUPABASE_SERVICE_ROLE_KEY": "private-controlled-key", FLAG: "true"})
        self.env.start()
        self.addCleanup(self.env.stop)

    def test_complete_payload_and_real_zero_preserve_hourly_shap(self):
        data = payload(); data["points"][0].update(pm25_ugm3=0, pm25_low=0)
        job.validate_publication(data, NOW)
        self.assertEqual(data["points"][12]["top_factors"]["factors"][0]["value"], 12)

    def test_exactly_25_original_hours_required(self):
        for count in (0, 12, 24, 26):
            data = payload(); data["points"] = (data["points"] * 2)[:count]
            with self.subTest(count=count), self.assertRaises(ValueError): job.validate_publication(data, NOW)

    def test_duplicate_gap_irregular_and_reordered_hours_rejected(self):
        for time in (payload()["points"][4]["valid_at"], iso(NOW.replace(minute=0) + timedelta(hours=26)), "2026-10-17T11:30:00Z"):
            data = payload(); data["points"][5]["valid_at"] = time
            with self.subTest(time=time), self.assertRaises(ValueError): job.validate_publication(data, NOW)

    def test_invalid_concentrations_bounds_and_coercions_rejected(self):
        for value in (-.01, 2000.01, float("nan"), float("inf"), None, True, "40"):
            data = payload(); data["points"][0]["pm25_ugm3"] = value
            with self.subTest(value=value), self.assertRaises(ValueError): job.validate_publication(data, NOW)
        for change in ({"pm25_low": 45}, {"pm25_high": None}, {"run_id": 99}):
            data = payload(); data["points"][0].update(change)
            with self.subTest(change=change), self.assertRaises(ValueError): job.validate_publication(data, NOW)

    def test_explicit_timezone_calendar_hour_and_freshness_validation(self):
        for value in ("2026-10-17T06:30:00", "2026-02-30T06:30:00Z", "2026-10-17T24:00:00Z", "bad", iso(NOW + timedelta(seconds=61)), iso(NOW - timedelta(hours=3, microseconds=1))):
            data = payload(); data["issued_at"] = value
            with self.subTest(value=value), self.assertRaises(ValueError): job.validate_publication(data, NOW)
        for offset in (timezone(timedelta(hours=6)), timezone(timedelta(hours=-4))):
            data = payload(); data["issued_at"] = NOW.astimezone(offset).isoformat()
            job.validate_publication(data, NOW)

    def test_issuance_boundaries_and_midnight_offsets(self):
        for offset in (timedelta(hours=-3), timedelta(minutes=1)):
            data = payload(); data["issued_at"] = iso(NOW + offset)
            job.validate_publication(data, NOW)
        data = payload(); data["forecast_start"] = "2026-10-17T12:00:00+06:00"
        for point in data["points"]:
            point["valid_at"] = datetime.fromisoformat(point["valid_at"]).astimezone(timezone(timedelta(hours=-4))).isoformat()
        job.validate_publication(data, NOW)

    def test_oversized_numbers_and_duplicate_shap_names_fail_validation(self):
        data = payload(); data["metrics"]["test_mae"] = 10 ** 1000
        with self.assertRaises(ValueError): job.validate_publication(data, NOW)
        data = payload(); data["points"][0]["top_factors"]["factors"][1]["feature"] = "hour"
        with self.assertRaises(ValueError): job.validate_publication(data, NOW)

    def test_source_metrics_missing_fields_and_shap_fail_closed(self):
        for field in ("model", "area", "issued_at", "forecast_start", "metrics", "points"):
            data = payload(); del data[field]
            with self.subTest(field=field), self.assertRaises(ValueError): job.validate_publication(data, NOW)
        for change in ({"model": "nirmol-unknown"}, {"area": "other"}, {"extra": 1}):
            data = payload(); data.update(change)
            with self.subTest(change=change), self.assertRaises(ValueError): job.validate_publication(data, NOW)
        data = payload(); data["points"][0]["top_factors"]["factors"][0]["effect"] = float("nan")
        with self.assertRaises(ValueError): job.validate_publication(data, NOW)

    def test_invalid_input_never_makes_a_database_request(self):
        transport = Transport(); data = payload(); data["points"].pop()
        with self.assertRaises(ValueError): job.save(data, transport=transport, now=NOW)
        self.assertEqual(transport.posts + transport.deletes, [])

    def test_only_rpc_is_used_and_cleanup_is_model_and_area_scoped(self):
        transport = Transport(); result = job.save(payload(), transport=transport, now=NOW)
        self.assertEqual(result, 7)
        self.assertEqual(len(transport.posts), 1)
        self.assertTrue(transport.posts[0][0].endswith("/rpc/publish_nirmol_forecast"))
        params = transport.deletes[0][1]["params"]
        self.assertEqual(params["model"], "eq.nirmol-xgb-v1"); self.assertEqual(params["area"], "eq.dhaka")
        self.assertTrue(params["issued_at"].startswith("lt."))

    def test_ambiguous_timeout_replays_identical_frozen_bytes_once(self):
        transport = Transport([Timeout("do not log this"), ack(replayed=True)])
        self.assertEqual(job.save(payload(), transport=transport, now=NOW), 7)
        self.assertEqual(transport.posts[0][1]["data"], transport.posts[1][1]["data"])
        self.assertEqual(json.loads(transport.posts[0][1]["data"])["payload"]["issued_at"], iso(NOW))

    def test_connection_5xx_and_malformed_success_have_bounded_replay(self):
        for response in (ConnectionError("private"), Response(status=503), Response(data=ValueError("bad JSON")), ack(run_id=True), ack(issued_at=iso(NOW + timedelta(hours=1)))):
            transport = Transport([response, ack(replayed=True)])
            with self.subTest(response=response): self.assertEqual(job.save(payload(), transport=transport, now=NOW), 7)
            self.assertEqual(len(transport.posts), 2)

    def test_rejection_and_unconfirmed_outcome_never_cleanup_or_fall_back_to_table_posts(self):
        for responses, count in (([Response(status=409)], 1), ([Timeout("private"), Timeout("private")], 2)):
            transport = Transport(responses)
            with self.assertRaisesRegex(RuntimeError, "publication") as error: job.save(payload(), transport=transport, now=NOW)
            self.assertNotIn("private", str(error.exception)); self.assertNotIn("controlled.invalid", str(error.exception))
            self.assertEqual(len(transport.posts), count); self.assertEqual(transport.deletes, [])

    def test_cleanup_failure_does_not_report_committed_publication_as_failed(self):
        transport = Transport(cleanup_error=True)
        with patch("sys.stderr") as stderr:
            self.assertEqual(job.save(payload(), transport=transport, now=NOW), 7)
        self.assertTrue(stderr.write.called); self.assertEqual(len(transport.posts), 1)

    def test_cleanup_redirect_cannot_remove_its_model_and_area_filters(self):
        # Use a real Requests redirect engine with an in-memory adapter. No
        # socket is opened and every key/response belongs to this test fixture.
        try:
            import requests
        except ImportError:
            try:
                from pip._vendor import requests
            except ImportError:
                self.skipTest("Requests unavailable; real redirect-engine check not executed")
        calls = []
        class Adapter(requests.adapters.BaseAdapter):
            def send(self, request, **kwargs):
                calls.append(request)
                response = requests.Response()
                response.request, response.url = request, request.url
                response._content_consumed = True
                if request.method == "POST":
                    response.status_code = 200
                    response._content = json.dumps(ack().data).encode()
                elif "model=" in request.url:
                    response.status_code = 307
                    response.headers["Location"] = "/rest/v1/forecast_runs"
                    response._content = b""
                else:
                    response.status_code = 204
                    response._content = b""
                return response
            def close(self): pass
        with requests.Session() as session:
            session.trust_env = False
            session.mount("https://", Adapter())
            transport = SimpleNamespace(post=session.post, delete=session.delete, exceptions=requests.exceptions)
            with patch("sys.stderr") as stderr:
                self.assertEqual(job.save(payload(), transport=transport, now=NOW), 7)
        deletes = [request for request in calls if request.method == "DELETE"]
        self.assertEqual(len(deletes), 1, "redirect followed to an unfiltered destructive endpoint: " + repr([r.url for r in deletes]))
        self.assertIn("model=eq.nirmol-xgb-v1", deletes[0].url)
        self.assertIn("area=eq.dhaka", deletes[0].url)
        self.assertTrue(stderr.write.called, "redirected cleanup must be reported as unsuccessful")

    def test_dataframe_conversion_validates_before_rounding_and_preserves_shap(self):
        rows = [(datetime.fromisoformat(p["valid_at"]), SimpleNamespace(pm25=p["pm25_ugm3"], low=p["pm25_low"], high=p["pm25_high"], cams=25, factors=p["top_factors"]["factors"])) for p in payload()["points"]]
        frame = SimpleNamespace(iterrows=lambda: iter(rows))
        meta = {"model": "nirmol-xgb-v1", "metrics_test": {"nirmol_model": {"mae": 1}, "raw_cams": {"mae": 2}}, "interval_p10_p90_coverage": .8, "trained_at": "2026-10-13T00:00:00Z"}
        data = job.publication_payload(frame, meta, iso(NOW), now=NOW)
        self.assertEqual(data["points"][5]["top_factors"], payload()["points"][5]["top_factors"])
        rows[0][1].pm25 = -.01
        with self.assertRaises(ValueError): job.publication_payload(frame, meta, iso(NOW), now=NOW)
        for invalid in (True, "40"):
            rows[0][1].pm25 = invalid
            with self.assertRaises(ValueError): job.publication_payload(frame, meta, iso(NOW), now=NOW)
        rows[0][1].pm25 = 40
        rows[0] = (rows[0][0] + timedelta(microseconds=1), rows[0][1])
        with self.assertRaises(ValueError): job.publication_payload(frame, meta, iso(NOW), now=NOW)

    def test_caller_mutation_cannot_change_the_frozen_replay_or_ack_validation(self):
        data = payload()
        transport = Transport([Timeout("controlled"), ack(replayed=True)])
        post = transport.post
        def mutate(url, **kwargs):
            data["issued_at"] = iso(NOW + timedelta(days=1))
            return post(url, **kwargs)
        transport.post = mutate
        self.assertEqual(job.save(data, transport=transport, now=NOW), 7)
        self.assertEqual(transport.posts[0][1]["data"], transport.posts[1][1]["data"])

class SafetyLockTests(unittest.TestCase):
    def test_direct_save_rejects_every_non_opt_in_before_validation_or_transport(self):
        for value in DISABLED_FLAGS:
            env = {"NEXT_PUBLIC_SUPABASE_URL": "https://controlled.invalid", "SUPABASE_SERVICE_ROLE_KEY": "private-controlled-key"}
            if value is not None: env[FLAG] = value
            transport = Transport()
            with self.subTest(flag=value), patch.dict("os.environ", env, clear=True), \
                    patch.object(job, "validate_publication") as validate, patch("builtins.print"):
                with self.assertRaisesRegex(RuntimeError, "disabled"):
                    job.save(payload(), transport=transport, now=NOW)
                validate.assert_not_called()
                self.assertEqual(transport.posts + transport.deletes, [])

    def test_main_rejects_every_non_opt_in_before_forecast_work(self):
        for value in DISABLED_FLAGS:
            env = {} if value is None else {FLAG: value}
            frame = SimpleNamespace(index=MagicMock(), itertuples=lambda: iter(()))
            with self.subTest(flag=value), patch.dict("os.environ", env, clear=True), \
                    patch.dict("sys.modules", {"pandas": MagicMock()}), patch("sys.argv", ["refresh_forecast.py"]), \
                    patch.object(job, "build_forecast", return_value=(frame, {}, iso(NOW))) as build, \
                    patch.object(job, "publication_payload", return_value=payload()), \
                    patch.object(job, "save") as save, patch("builtins.print"):
                with self.assertRaisesRegex(RuntimeError, "disabled"):
                    job.main()
                build.assert_not_called()
                save.assert_not_called()

    def test_enabled_main_keeps_the_existing_forecast_and_publication_path(self):
        frame, meta = SimpleNamespace(index=MagicMock(), itertuples=lambda: iter(())), {"controlled": True}
        data = payload()
        with patch.dict("os.environ", {FLAG: "true"}, clear=True), \
                patch.dict("sys.modules", {"pandas": MagicMock()}), patch("sys.argv", ["refresh_forecast.py"]), \
                patch.object(job, "build_forecast", return_value=(frame, meta, iso(NOW))) as build, \
                patch.object(job, "publication_payload", return_value=data) as convert, \
                patch.object(job, "save") as save, patch("builtins.print"):
            job.main()
            build.assert_called_once_with()
            convert.assert_called_once_with(frame, meta, iso(NOW))
            save.assert_called_once_with(data)

    def test_dry_run_still_builds_and_validates_without_opt_in_or_publication(self):
        frame = SimpleNamespace(index=MagicMock(), itertuples=lambda: iter(()))
        with patch.dict("os.environ", {}, clear=True), patch.dict("sys.modules", {"pandas": MagicMock()}), \
                patch("sys.argv", ["refresh_forecast.py", "--dry-run"]), \
                patch.object(job, "build_forecast", return_value=(frame, {}, iso(NOW))) as build, \
                patch.object(job, "publication_payload", return_value=payload()) as convert, \
                patch.object(job, "save") as save, patch("builtins.print"):
            job.main()
            build.assert_called_once_with()
            convert.assert_called_once_with(frame, {}, iso(NOW))
            save.assert_not_called()

    def test_enabled_publication_failure_propagates_without_an_alternate_path(self):
        frame = SimpleNamespace(index=MagicMock(), itertuples=lambda: iter(()))
        with patch.dict("os.environ", {FLAG: "true"}, clear=True), patch.dict("sys.modules", {"pandas": MagicMock()}), \
                patch("sys.argv", ["refresh_forecast.py"]), \
                patch.object(job, "build_forecast", return_value=(frame, {}, iso(NOW))), \
                patch.object(job, "publication_payload", return_value=payload()), \
                patch.object(job, "save", side_effect=RuntimeError("publication unconfirmed")) as save, patch("builtins.print"):
            with self.assertRaisesRegex(RuntimeError, "publication unconfirmed"):
                job.main()
            save.assert_called_once()

    def test_workflow_requires_opt_in_and_forwards_its_actual_value(self):
        workflow = (Path(__file__).parents[2] / ".github/workflows/forecast.yml").read_text(encoding="utf-8")
        self.assertIn("if: ${{ vars.NIRMOL_ATOMIC_PUBLISHER_ENABLED == 'true' }}", workflow)
        publish_step = workflow.split("- run: python jobs/refresh_forecast.py", 1)[1]
        self.assertRegex(publish_step, r"(?m)^\s+NIRMOL_ATOMIC_PUBLISHER_ENABLED: \$\{\{ vars\.NIRMOL_ATOMIC_PUBLISHER_ENABLED \}\}$")

class SqlSourceTests(unittest.TestCase):
    def test_jsonb_subtraction_cannot_bind_to_the_extraction_key(self):
        # PostgreSQL's '-' precedence exceeds '->'/'#>'. This source guard
        # catches the confirmed pitfall without pretending to execute SQL.
        migration = (Path(__file__).parents[2] / "supabase/migrations/0002_forecast_publication.sql").read_text(encoding="utf-8")
        unsafe = re.findall(r"(?:->|#>)\s*'(?:[^']|'')*'\s*-\s*(?:array\s*\[|'[^']*')", migration, re.IGNORECASE)
        self.assertEqual(unsafe, [], "Parenthesize JSON extraction before key subtraction: " + repr(unsafe))

if __name__ == "__main__": unittest.main()
