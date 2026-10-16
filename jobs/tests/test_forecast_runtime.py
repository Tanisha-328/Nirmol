"""Offline runtime/artifact checks; native cases use the real saved models."""
import json
import re
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

JOBS = Path(__file__).parents[1]
sys.path.insert(0, str(JOBS))
import forecast_runtime as runtime


class ContractTests(unittest.TestCase):
    def test_real_json_contract_matches_all_three_models(self):
        meta, artifacts = runtime.read_contract()
        self.assertEqual(tuple(meta["features"]), runtime.FEATURES)
        self.assertEqual(len(runtime.FEATURES), 24)
        self.assertEqual(set(artifacts), {"p10", "p50", "p90"})

    def test_unsupported_python_fails_explicitly(self):
        for version in ((3, 11), (3, 12), (3, 13), (3, 15)):
            with self.subTest(version=version), self.assertRaisesRegex(RuntimeError, "Python 3.14"):
                runtime.validate_runtime(python_version=version, versions=runtime.RUNTIME_VERSIONS, platform_name="win32")

    def test_missing_or_mismatched_dependency_fails_explicitly(self):
        for package in runtime.RUNTIME_VERSIONS:
            for version in (None, "0.0.0"):
                actual = dict(runtime.RUNTIME_VERSIONS)
                if version is None:
                    del actual[package]
                else:
                    actual[package] = version
                with self.subTest(package=package, version=version), self.assertRaisesRegex(RuntimeError, package):
                    runtime.validate_runtime(python_version=(3, 14), versions=actual, platform_name="win32")

    def test_supported_versions_pass(self):
        runtime.validate_runtime(python_version=(3, 14), versions=runtime.RUNTIME_VERSIONS, platform_name="win32")

    def test_smoke_checks_runtime_before_importing_native_dependencies(self):
        with patch.object(runtime, "validate_runtime", side_effect=RuntimeError("Unsupported runtime")), \
                patch("builtins.__import__", side_effect=AssertionError("Native import before runtime check")), \
                self.assertRaisesRegex(RuntimeError, "Unsupported runtime"):
            runtime.smoke_check()

    def test_linux_dependency_is_required_only_on_linux(self):
        with self.assertRaisesRegex(RuntimeError, "nvidia-nccl-cu13"):
            runtime.validate_runtime(python_version=(3, 14), versions=runtime.RUNTIME_VERSIONS, platform_name="linux")
        runtime.validate_runtime(python_version=(3, 14), versions=runtime.RUNTIME_VERSIONS | runtime.LINUX_RUNTIME_VERSIONS, platform_name="linux")

    def test_pinned_hash_installation_matches_runtime_contract(self):
        text = (JOBS / "requirements.txt").read_text()
        self.assertIn("--require-hashes", text)
        self.assertIn("--only-binary=:all:", text)
        pins = dict(re.findall(r"(?m)^([a-z][a-z0-9-]*)==([^\s;]+)", text))
        self.assertEqual(pins, runtime.RUNTIME_VERSIONS | runtime.LINUX_RUNTIME_VERSIONS)
        self.assertIn('nvidia-nccl-cu13==2.32.3; platform_system == "Linux"', text)
        for requirement in re.findall(r"(?ms)^[a-z][a-z0-9-]*==.*?(?=\n\n|\Z)", text):
            self.assertRegex(requirement, r"--hash=sha256:[0-9a-f]{64}")

    def altered_artifacts(self):
        temporary = tempfile.TemporaryDirectory(prefix="nirmol-artifact-check-")
        self.addCleanup(temporary.cleanup)
        folder = Path(temporary.name)
        for source in runtime.ARTIFACTS.glob("nirmol_xgb_v1_*.json"):
            (folder / source.name).write_bytes(source.read_bytes())
        return folder

    def test_missing_artifacts_fail_explicitly(self):
        for name in ("meta", "p10", "p50", "p90"):
            folder = self.altered_artifacts()
            (folder / f"nirmol_xgb_v1_{name}.json").unlink()
            with self.subTest(name=name), self.assertRaisesRegex(RuntimeError, "Missing model artifact"):
                runtime.read_contract(folder)

    def test_corrupt_artifacts_fail_explicitly(self):
        for name in ("meta", "p10", "p50", "p90"):
            folder = self.altered_artifacts()
            (folder / f"nirmol_xgb_v1_{name}.json").write_text("{corrupt", encoding="utf-8")
            with self.subTest(name=name), self.assertRaisesRegex(RuntimeError, "Invalid model artifact"):
                runtime.read_contract(folder)

    def test_metadata_feature_order_target_and_adjustment_are_checked(self):
        changes = ({"features": list(reversed(runtime.FEATURES))}, {"features": list(runtime.FEATURES[:-1])},
                   {"target": "pm25"}, {"interval_log_adjust": float("nan")}, {"interval_log_adjust": True}, {"interval_log_adjust": 10 ** 1000})
        for change in changes:
            folder = self.altered_artifacts()
            path = folder / "nirmol_xgb_v1_meta.json"
            value = json.loads(path.read_text()); value.update(change); path.write_text(json.dumps(value))
            with self.subTest(change=change), self.assertRaisesRegex(RuntimeError, "metadata"):
                runtime.read_contract(folder)

    def test_model_version_feature_order_and_objective_are_checked(self):
        for kind in ("version", "features", "count", "objective", "quantile"):
            folder = self.altered_artifacts()
            path = folder / "nirmol_xgb_v1_p50.json"
            value = json.loads(path.read_text())
            if kind == "version": value["version"] = [2, 1, 3]
            if kind == "features": value["learner"]["feature_names"].reverse()
            if kind == "count": value["learner"]["learner_model_param"]["num_feature"] = "23"
            if kind == "objective": value["learner"]["objective"]["name"] = "reg:squarederror"
            if kind == "quantile": value["learner"]["objective"]["quantile_loss_param"]["quantile_alpha"] = "[0.1]"
            path.write_text(json.dumps(value))
            with self.subTest(kind=kind), self.assertRaisesRegex(RuntimeError, "p50"):
                runtime.read_contract(folder)


class NativeRuntimeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        runtime.validate_runtime()
        import numpy as np
        import pandas as pd
        import refresh_forecast as job
        cls.np, cls.pd, cls.job = np, pd, job
        cls.models, cls.meta = job.load_models()
        cls.X = runtime.fixture_features()

    def test_native_load_preprocessing_and_exact_feature_order(self):
        self.assertEqual(list(self.X.columns), list(runtime.FEATURES))
        self.assertEqual(self.X.shape, (25, 24))
        self.assertTrue(self.np.isfinite(self.X.to_numpy()).all())
        for model in self.models.values():
            self.assertEqual(model.get_booster().feature_names, list(runtime.FEATURES))
            self.assertEqual(model.get_booster().num_features(), 24)

    def test_native_predictions_and_log1p_shap_additivity(self):
        outputs, contribs = runtime.predict_checked(self.models, self.X)
        for output in outputs.values():
            self.assertEqual(output.shape, (25,))
            self.assertTrue(self.np.isfinite(output).all())
        self.assertEqual(contribs.shape, (25, 25))
        self.assertTrue(self.np.isfinite(contribs).all())
        self.np.testing.assert_allclose(contribs.sum(axis=1), outputs["p50"], rtol=1e-5, atol=1e-5)

    def test_missing_reordered_or_nonfinite_features_fail_before_inference(self):
        for frame in (self.X.iloc[:, :-1], self.X.iloc[:, ::-1], self.X.rename(columns={"hour": "unexpected"})):
            with self.subTest(columns=list(frame)), self.assertRaisesRegex(RuntimeError, "feature"):
                runtime.predict_checked(self.models, frame)
        frame = self.X.copy(); frame.iloc[0, 0] = float("nan")
        with self.assertRaisesRegex(RuntimeError, "finite"):
            runtime.predict_checked(self.models, frame)

    def test_nonfinite_or_wrong_prediction_shapes_are_rejected(self):
        for value in (self.np.zeros((25, 1)), self.np.zeros(24), self.np.full(25, self.np.nan), self.np.full(25, self.np.inf)):
            with self.subTest(shape=value.shape), patch.object(self.models["p50"], "predict", return_value=value), self.assertRaisesRegex(RuntimeError, "prediction"):
                runtime.predict_checked(self.models, self.X)

    def test_wrong_nonfinite_or_nonadditive_shap_is_rejected(self):
        booster = self.models["p50"].get_booster()
        for value in (self.np.zeros((25, 24)), self.np.zeros((24, 25)), self.np.full((25, 25), self.np.nan), self.np.zeros((25, 25))):
            with self.subTest(shape=value.shape), patch.object(booster, "predict", return_value=value), self.assertRaisesRegex(RuntimeError, "SHAP"):
                runtime.predict_checked(self.models, self.X)

    def test_real_forecast_transformation_and_hourly_factor_association(self):
        result = runtime.smoke_check()
        self.assertEqual(result["forecast_rows"], 25)
        self.assertEqual(result["features"], 24)
        self.assertEqual(result["shap_shape"], [25, 25])
        self.assertEqual(result["attribution_scale"], "log1p_pm25")

    def test_finite_logs_that_overflow_target_conversion_fail_visibly(self):
        outputs = {name: self.np.full(25, 1000.0) for name in ("p10", "p50", "p90")}
        with patch.object(runtime, "predict_checked", return_value=(outputs, self.np.zeros((25, 25)))), \
                self.np.errstate(over="ignore", invalid="ignore"), \
                self.assertRaisesRegex(RuntimeError, "Nonfinite transformed PM2.5"):
            runtime.smoke_check()


BLOCKERS = [patch(target, side_effect=AssertionError("Runtime verification forbids network access"))
            for target in ("socket.create_connection", "socket.socket.connect", "socket.socket.connect_ex")]

def setUpModule():
    for blocker in BLOCKERS: blocker.start()

def tearDownModule():
    for blocker in reversed(BLOCKERS): blocker.stop()

if __name__ == "__main__": unittest.main()
