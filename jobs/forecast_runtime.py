"""Fail-fast saved-model contract and offline native compatibility verification.

Run ``python -B jobs/forecast_runtime.py`` after installing jobs/requirements.txt.
The smoke check uses real saved artifacts and synthetic provider inputs; it never
fetches providers, reads publication credentials, calls save(), or executes SQL.
"""
from __future__ import annotations

import importlib.metadata
import json
import math
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ARTIFACTS = ROOT / "ml" / "artifacts"
SUPPORTED_PYTHON = (3, 14)
ARTIFACT_VERSION = [3, 4, 1]
FEATURES = (
    "hour", "month_sin", "month_cos", "weekend", "is_winter", "cams_pm2_5",
    "cams_pm10", "cams_carbon_monoxide", "cams_dust", "cams_pm2_5_log",
    "cams_pm2_5_mean24", "temperature_2m", "relative_humidity_2m", "dew_point_2m",
    "precipitation", "surface_pressure", "cloud_cover", "wind_speed_10m",
    "shortwave_radiation", "wind_u", "wind_v", "rain_24h", "pressure_change_24h",
    "wind_mean_12h",
)
# Keep synchronized with the fully pinned installation file. There is no
# standalone SHAP dependency: the saved model's native TreeSHAP is used.
RUNTIME_VERSIONS = {
    "xgboost": "3.4.1", "numpy": "2.5.4", "pandas": "3.0.6",
    "scikit-learn": "1.9.1", "scipy": "1.18.1", "requests": "2.34.2",
    "python-dateutil": "2.9.0.post0", "tzdata": "2026.5", "joblib": "1.6.0",
    "narwhals": "2.27.1", "threadpoolctl": "3.7.0", "charset-normalizer": "3.5.2",
    "idna": "3.20", "urllib3": "2.8.0", "certifi": "2026.7.22",
    "cloudpickle": "3.1.2", "six": "1.17.0",
}
LINUX_RUNTIME_VERSIONS = {"nvidia-nccl-cu13": "2.32.3"}


def validate_runtime(*, python_version=None, versions=None, platform_name=None) -> None:
    actual_python = tuple((python_version or sys.version_info)[:2])
    if actual_python != SUPPORTED_PYTHON:
        raise RuntimeError("Forecast runtime requires Python 3.14; use the documented pinned environment.")
    platform_name = platform_name or sys.platform
    required_versions = RUNTIME_VERSIONS | (LINUX_RUNTIME_VERSIONS if platform_name == "linux" else {})
    for package, required in required_versions.items():
        try:
            actual = versions.get(package) if versions is not None else importlib.metadata.version(package)
        except importlib.metadata.PackageNotFoundError:
            actual = None
        if actual != required:
            raise RuntimeError(f"Forecast runtime requires {package}=={required}; reinstall jobs/requirements.txt.")


def read_contract(artifacts: Path = ARTIFACTS) -> tuple[dict, dict]:
    def read(name):
        path = artifacts / f"nirmol_xgb_v1_{name}.json"
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except FileNotFoundError:
            raise RuntimeError(f"Missing model artifact: {path.name}") from None
        except (OSError, ValueError, UnicodeError):
            raise RuntimeError(f"Invalid model artifact: {path.name}") from None

    meta = read("meta")
    if not isinstance(meta, dict) or meta.get("model") != "nirmol-xgb-v1" or meta.get("features") != list(FEATURES) or meta.get("target") != "US Embassy Dhaka hourly PM2.5 (ug/m3), log1p-transformed":
        raise RuntimeError("Invalid model metadata identity, feature order or target transformation.")
    adjust = meta.get("interval_log_adjust")
    try:
        valid_adjust = type(adjust) in (int, float) and math.isfinite(adjust)
    except OverflowError:
        valid_adjust = False
    if not valid_adjust:
        raise RuntimeError("Invalid model metadata interval adjustment.")
    models = {}
    for name, quantile in (("p10", .1), ("p50", .5), ("p90", .9)):
        document = read(name)
        try:
            learner = document["learner"]
            valid = (
                document["version"] == ARTIFACT_VERSION
                and learner["feature_names"] == list(FEATURES)
                and learner["learner_model_param"]["num_feature"] == "24"
                and learner["learner_model_param"]["num_target"] == "1"
                and learner["objective"]["name"] == "reg:quantileerror"
                and json.loads(learner["objective"]["quantile_loss_param"]["quantile_alpha"]) == [quantile]
            )
        except (KeyError, TypeError, ValueError):
            valid = False
        if not valid:
            raise RuntimeError(f"Invalid {name} model version, feature contract or quantile objective.")
        models[name] = document
    return meta, models


def load_models(artifacts: Path = ARTIFACTS):
    validate_runtime()
    meta, _ = read_contract(artifacts)
    import xgboost as xgb
    models = {}
    for name in ("p10", "p50", "p90"):
        model = xgb.XGBRegressor()
        try:
            model.load_model(artifacts / f"nirmol_xgb_v1_{name}.json")
        except (xgb.core.XGBoostError, ValueError, TypeError):
            raise RuntimeError(f"Native model loading failed for {name}; publication cannot proceed.") from None
        if model.get_booster().num_features() != len(FEATURES) or model.get_booster().feature_names != list(FEATURES):
            raise RuntimeError(f"Native {name} model feature contract mismatch.")
        models[name] = model
    return models, meta


def predict_checked(models, frame):
    """Keep row/feature association explicit before target conversion or SHAP slicing."""
    import numpy as np
    import xgboost as xgb
    if list(frame.columns) != list(FEATURES):
        raise RuntimeError("Forecast input feature names/order differ from the saved-model contract.")
    if len(frame) != 25 or not np.isfinite(frame.to_numpy(dtype=float)).all():
        raise RuntimeError("Forecast input must contain 25 complete finite feature rows.")
    predictions = {}
    for name in ("p10", "p50", "p90"):
        values = np.asarray(models[name].predict(frame))
        if values.shape != (len(frame),) or not np.isfinite(values).all():
            raise RuntimeError(f"Invalid {name} native prediction shape or nonfinite values.")
        predictions[name] = values
    contribs = np.asarray(models["p50"].get_booster().predict(xgb.DMatrix(frame), pred_contribs=True))
    if contribs.shape != (len(frame), len(FEATURES) + 1) or not np.isfinite(contribs).all():
        raise RuntimeError("Invalid native SHAP shape or nonfinite values.")
    if not np.allclose(contribs.sum(axis=1), predictions["p50"], rtol=1e-5, atol=1e-5):
        raise RuntimeError("Native SHAP contributions do not sum to the associated log1p_pm25 prediction.")
    return predictions, contribs


def fixture_inputs():
    """73 controlled UTC hours: 48 history + the 25 target instants, no measurements."""
    import pandas as pd
    index = pd.date_range("2026-10-14", periods=73, freq="h")
    return pd.DataFrame({
        "cams_pm2_5": 60.0, "cams_pm10": 90.0, "cams_carbon_monoxide": 250.0,
        "cams_dust": 5.0, "temperature_2m": 27.0, "relative_humidity_2m": 70.0,
        "dew_point_2m": 21.0, "precipitation": 0.0, "surface_pressure": 1010.0,
        "cloud_cover": 30.0, "wind_speed_10m": 7.0, "wind_direction_10m": 135.0,
        "shortwave_radiation": 100.0,
    }, index=index)


def fixture_features():
    sys.path.insert(0, str(ROOT / "ml"))
    from train_forecast import add_features
    return add_features(fixture_inputs()).iloc[-25:]


def smoke_check() -> dict:
    validate_runtime()
    from unittest.mock import patch
    import numpy as np
    import refresh_forecast as job
    fixed_now = datetime(2026, 10, 16, 0, 30, tzinfo=timezone.utc)
    raw = fixture_inputs()
    class Clock(datetime):
        @classmethod
        def now(cls, tz=None):
            return fixed_now.astimezone(tz) if tz else fixed_now.replace(tzinfo=None)
    def provider(_url, _variables, prefix):
        return raw[[name for name in raw if name.startswith("cams_") == bool(prefix)]].copy()
    with patch("socket.create_connection", side_effect=AssertionError("Offline verification forbids network")), \
            patch("socket.socket.connect", side_effect=AssertionError("Offline verification forbids network")), \
            patch("socket.socket.connect_ex", side_effect=AssertionError("Offline verification forbids network")), \
            patch.object(job, "open_meteo", side_effect=provider), patch.object(job, "datetime", Clock), \
            patch.object(job, "save", side_effect=AssertionError("Offline verification forbids publication")):
        forecast, meta, issued_at = job.build_forecast()
        payload = job.publication_payload(forecast, meta, issued_at, now=fixed_now)
        models, _ = job.load_models()
        features = fixture_features()
        predictions, contribs = predict_checked(models, features)
        expected = np.expm1(predictions["p50"])
        np.testing.assert_allclose(forecast["pm25"], expected, rtol=1e-6, atol=1e-6)
        np.testing.assert_allclose(forecast["low"], np.expm1(np.minimum(predictions["p10"] - meta["interval_log_adjust"], predictions["p50"])), rtol=1e-6, atol=1e-6)
        np.testing.assert_allclose(forecast["high"], np.expm1(np.maximum(predictions["p90"] + meta["interval_log_adjust"], predictions["p50"])), rtol=1e-6, atol=1e-6)
        for i, factors in enumerate(forecast["factors"]):
            top = np.argsort(-np.abs(contribs[i, :-1]))[:3]
            for factor, column in zip(factors, top):
                if factor != {"feature": FEATURES[column], "value": round(float(features.iloc[i, column]), 2), "effect": round(float(contribs[i, column]), 3)}:
                    raise RuntimeError("SHAP factor is not associated with its forecast row and feature.")
    return {
        "python": ".".join(map(str, sys.version_info[:3])), "packages": RUNTIME_VERSIONS,
        "artifact_version": ARTIFACT_VERSION, "features": len(FEATURES), "forecast_rows": len(payload["points"]),
        "pm25_min": float(expected.min()), "pm25_max": float(expected.max()),
        "log1p_min": float(predictions["p50"].min()), "log1p_max": float(predictions["p50"].max()),
        "shap_shape": list(contribs.shape), "max_additivity_error": float(np.max(np.abs(contribs.sum(axis=1) - predictions["p50"]))),
        "attribution_scale": "log1p_pm25", "providers": "controlled fixture", "publication": "not called",
    }


if __name__ == "__main__":
    print(json.dumps(smoke_check(), indent=2, allow_nan=False))
