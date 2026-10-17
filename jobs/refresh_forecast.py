"""Hourly job: produce the Nirmol 24h PM2.5 forecast for Dhaka and save it to Supabase.

Fetches the live CAMS + weather forecast from Open-Meteo, runs the trained
CAMS-correction model (median + calibrated 80% range), attaches the top factors
behind each hour (SHAP), and writes one forecast_runs row + 25 forecast_points.

Usage:
    py jobs/refresh_forecast.py --dry-run      # print only, no database
    py jobs/refresh_forecast.py                # disabled unless explicitly opted in after database verification
"""

from __future__ import annotations

import argparse
import json
import math
import os
import re
import sys
from datetime import datetime, timedelta, timezone
from numbers import Real
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "ml"))

ARTIFACTS = ROOT / "ml" / "artifacts"
MODEL = "nirmol-xgb-v1"
LAT, LON = 23.796374, 90.424614  # US Embassy site the model was trained on
HOURS = 25
KEEP_DAYS = 3
ATOMIC_PUBLISHER_FLAG = "NIRMOL_ATOMIC_PUBLISHER_ENABLED"

CAMS_VARS = ["pm2_5", "pm10", "carbon_monoxide", "dust"]
WEATHER_VARS = [
    "temperature_2m", "relative_humidity_2m", "dew_point_2m", "precipitation",
    "surface_pressure", "cloud_cover", "wind_speed_10m", "wind_direction_10m",
    "shortwave_radiation",
]


def open_meteo(url: str, variables: list[str], prefix: str) -> pd.DataFrame:
    import pandas as pd
    import requests
    # past_days=2 so the 24h rolling features have history behind the first forecast hour.
    resp = requests.get(
        url,
        params={"latitude": LAT, "longitude": LON, "hourly": ",".join(variables),
                "past_days": 2, "forecast_days": 3, "timezone": "GMT"},
        timeout=60,
    )
    resp.raise_for_status()
    df = pd.DataFrame(resp.json()["hourly"]).rename(columns={v: f"{prefix}{v}" for v in variables})
    df["time"] = pd.to_datetime(df["time"])
    return df.set_index("time")


def load_models() -> tuple[dict[str, xgb.XGBRegressor], dict]:
    from forecast_runtime import load_models as load_checked_models
    return load_checked_models(ARTIFACTS)


def build_forecast() -> tuple[pd.DataFrame, dict, str]:
    import numpy as np
    import pandas as pd
    from forecast_runtime import FEATURES, predict_checked
    from train_forecast import add_features  # Same preprocessing as training.
    models, meta = load_models()
    raw = open_meteo("https://air-quality-api.open-meteo.com/v1/air-quality", CAMS_VARS, "cams_").join(
        open_meteo("https://api.open-meteo.com/v1/forecast", WEATHER_VARS, ""), how="inner"
    )
    issued_at = datetime.now(timezone.utc).isoformat()
    start = pd.Timestamp(issued_at).tz_convert(None).floor("h")
    # Only the 24 prior hours and intended 25 target hours affect these models.
    # Reject gaps/order/duplicates within that window without sorting or filling;
    # unrelated older or later provider gaps must not block a valid forecast.
    if not isinstance(raw.index, pd.DatetimeIndex) or raw.index.hasnans:
        raise ValueError("Provider history must be an ordered, continuous hourly grid; not publishing.")
    required = pd.date_range(start - pd.Timedelta(hours=24), periods=24 + HOURS, freq="h")
    raw = raw.loc[(raw.index >= required[0]) & (raw.index <= required[-1])]
    if not raw.index.equals(required):
        raise ValueError("Provider history must be an ordered, continuous hourly grid; not publishing.")
    X = add_features(raw)
    if list(X.columns) != list(FEATURES):
        raise RuntimeError("Preprocessing feature order differs from the saved-model contract.")

    if not X.index.is_unique:
        raise ValueError("Duplicate forecast input hours; not publishing.")
    # Missing target hours must fail, rather than shifting later hours into them.
    X = X.reindex(pd.date_range(start, periods=HOURS, freq="h"))
    if not np.isfinite(X.to_numpy(dtype=float)).all():
        raise ValueError("Incomplete intended forecast window; not publishing.")

    adjust = meta.get("interval_log_adjust", 0.0)
    predictions, all_contribs = predict_checked(models, X)
    p50 = predictions["p50"]
    out = pd.DataFrame(index=X.index)
    out["pm25"] = np.expm1(p50)
    out["low"] = np.expm1(np.minimum(predictions["p10"] - adjust, p50))
    out["high"] = np.expm1(np.maximum(predictions["p90"] + adjust, p50))
    if not np.isfinite(out.to_numpy()).all():
        raise RuntimeError("Nonfinite transformed PM2.5 prediction; not publishing.")
    out["cams"] = raw.loc[X.index, "cams_pm2_5"]

    # Per-hour explanation: the 3 features that pushed this hour's prediction most.
    contribs = all_contribs[:, :-1]
    factors = []
    for row_c, (_, row_x) in zip(contribs, X.iterrows()):
        top = np.argsort(-np.abs(row_c))[:3]
        factors.append([
            {"feature": meta["features"][i], "value": round(float(row_x.iloc[i]), 2), "effect": round(float(row_c[i]), 3)}
            for i in top
        ])
    out["factors"] = factors
    return out, meta, issued_at


def absolute_time(value: object) -> datetime:
    pattern = r"\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)"
    if not isinstance(value, str) or not re.fullmatch(pattern, value):
        raise ValueError("Invalid absolute publication timestamp")
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc)
    except (ValueError, OverflowError):
        raise ValueError("Invalid absolute publication timestamp") from None


def finite(value: object) -> bool:
    try:
        return type(value) in (int, float) and math.isfinite(value)
    except OverflowError:
        return False


def concentration(value: object) -> bool:
    return finite(value) and 0 <= value <= 2000


def validate_publication(payload: dict, now: datetime | None = None) -> None:
    """Pure publication validation. This does not establish database atomicity."""
    now = now or datetime.now(timezone.utc)
    keys = {"model", "area", "issued_at", "forecast_start", "metrics", "points"}
    if not isinstance(payload, dict) or set(payload) != keys or payload["model"] != MODEL or payload["area"] != "dhaka":
        raise ValueError("Invalid publication identity")
    issued, start = absolute_time(payload["issued_at"]), absolute_time(payload["forecast_start"])
    if issued > now + timedelta(minutes=1) or now - issued > timedelta(hours=3) or start.minute or start.second or start.microsecond:
        raise ValueError("Invalid publication issuance or start")
    metrics = payload["metrics"]
    if not isinstance(metrics, dict) or set(metrics) != {"test_mae", "cams_test_mae", "interval_coverage", "trained_at"}:
        raise ValueError("Missing publication metrics")
    if any(not finite(metrics[k]) or metrics[k] < 0 for k in ("test_mae", "cams_test_mae", "interval_coverage")) or metrics["interval_coverage"] > 1:
        raise ValueError("Invalid publication metrics")
    if absolute_time(metrics["trained_at"]) > issued + timedelta(minutes=1):
        raise ValueError("Invalid model training timestamp")
    points = payload["points"]
    if not isinstance(points, list) or len(points) != HOURS:
        raise ValueError("Exactly 25 publication hours are required")
    for i, point in enumerate(points):
        if not isinstance(point, dict) or set(point) != {"valid_at", "pm25_ugm3", "pm25_low", "pm25_high", "top_factors"}:
            raise ValueError("Missing or unexpected publication point fields")
        if absolute_time(point["valid_at"]) != start + timedelta(hours=i):
            raise ValueError("Publication hours must match the original window")
        if any(not concentration(point[k]) for k in ("pm25_ugm3", "pm25_low", "pm25_high")) or not point["pm25_low"] <= point["pm25_ugm3"] <= point["pm25_high"]:
            raise ValueError("Invalid publication concentration or range")
        if any(round(point[k], 2) != point[k] for k in ("pm25_ugm3", "pm25_low", "pm25_high")):
            raise ValueError("Publication concentration exceeds storage precision")
        shap = point["top_factors"]
        if not isinstance(shap, dict) or set(shap) != {"factors", "cams_pm25"} or not concentration(shap["cams_pm25"]):
            raise ValueError("Invalid SHAP source metadata")
        factors = shap["factors"]
        if not isinstance(factors, list) or len(factors) != 3:
            raise ValueError("Three SHAP factors are required")
        names = set()
        for factor in factors:
            if not isinstance(factor, dict) or set(factor) != {"feature", "value", "effect"} or not isinstance(factor["feature"], str) or not re.fullmatch(r"[a-z][a-z0-9_]{0,79}", factor["feature"]) or not finite(factor["value"]) or not finite(factor["effect"]):
                raise ValueError("Invalid SHAP factor")
            names.add(factor["feature"])
        if len(names) != 3:
            raise ValueError("Duplicate SHAP factors")


def publication_payload(forecast: pd.DataFrame, meta: dict, issued_at: str, *, now: datetime | None = None) -> dict:
    if meta.get("model") != MODEL:
        raise ValueError("Unsupported model metadata")
    points = []
    start = absolute_time(issued_at).replace(minute=0, second=0, microsecond=0)
    for i, (t, row) in enumerate(forecast.iterrows()):
        target = t.replace(tzinfo=timezone.utc) if t.tzinfo is None else t.astimezone(timezone.utc)
        if target != start + timedelta(hours=i):
            raise ValueError("Unexpected raw forecast timestamp")
        values = (row.pm25, row.low, row.high, row.cams)
        if any(isinstance(v, bool) or not isinstance(v, Real) for v in values):
            raise ValueError("Nonnumeric raw forecast prediction")
        pm, low, high, cams = (float(v) for v in values)
        # Validate raw predictions before rounding can disguise small negatives.
        if not all(concentration(v) for v in (pm, low, high, cams)) or not low <= pm <= high:
            raise ValueError("Invalid unrounded forecast prediction")
        points.append({"valid_at": target.strftime("%Y-%m-%dT%H:%M:%SZ"), "pm25_ugm3": round(pm, 1),
                       "pm25_low": round(low, 1), "pm25_high": round(high, 1),
                       "top_factors": {"factors": row.factors, "cams_pm25": round(cams, 1)}})
    payload = {"model": MODEL, "area": "dhaka", "issued_at": issued_at, "forecast_start": start.isoformat(),
               "metrics": {"test_mae": meta["metrics_test"]["nirmol_model"]["mae"],
                           "cams_test_mae": meta["metrics_test"]["raw_cams"]["mae"],
                           "interval_coverage": meta["interval_p10_p90_coverage"], "trained_at": meta["trained_at"]}, "points": points}
    validate_publication(payload, now)
    # Detach factor lists from the model frame and prohibit non-standard JSON.
    return json.loads(json.dumps(payload, allow_nan=False))


def require_atomic_publisher_enabled() -> None:
    # Deliberately exact: absent, false, 0, case variants and whitespace fail closed.
    if os.environ.get(ATOMIC_PUBLISHER_FLAG) != "true":
        raise RuntimeError("Experimental atomic forecast publication is disabled; database verification and explicit opt-in are required.")


def save(payload: dict, *, transport=None, now: datetime | None = None) -> int:
    require_atomic_publisher_enabled()
    validate_publication(payload, now)
    frozen = json.dumps({"payload": payload}, allow_nan=False, separators=(",", ":"))
    payload = json.loads(frozen)["payload"]
    if transport is None:
        import requests
        transport = requests
    url = os.environ["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/")
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    headers = {"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"}
    # Only this immutable, idempotent RPC may be replayed. A missing RPC never
    # falls back to the old two-request publisher. No response body is logged.
    run_id = None
    for attempt in range(2):
        try:
            response = transport.post(f"{url}/rest/v1/rpc/publish_nirmol_forecast", headers=headers, data=frozen, timeout=30, allow_redirects=False)
            if 300 <= response.status_code < 500:
                raise RuntimeError(f"Forecast publication rejected (HTTP {response.status_code}).")
            if response.status_code >= 500:
                continue
            result = response.json()
            clock = now or datetime.now(timezone.utc)
            if not isinstance(result, dict) or type(result.get("run_id")) is not int or not 0 < result["run_id"] <= 2**53 - 1 or type(result.get("replayed")) is not bool:
                continue
            published = absolute_time(result.get("published_at"))
            if absolute_time(result.get("issued_at")) != absolute_time(payload["issued_at"]) or absolute_time(result.get("forecast_start")) != absolute_time(payload["forecast_start"]) or published > clock + timedelta(minutes=1) or published < absolute_time(payload["issued_at"]) - timedelta(minutes=1):
                continue
            run_id = result["run_id"]
            break
        except (transport.exceptions.Timeout, transport.exceptions.ConnectionError, ValueError, TypeError):
            if attempt == 1:
                break
    if run_id is None:
        raise RuntimeError("Forecast publication outcome unconfirmed after bounded idempotent replay.") from None
    # Cleanup cannot change the confirmed publication outcome. Never delete
    # another model/area's history; do not retry publication if cleanup fails.
    cutoff = ((now or datetime.now(timezone.utc)) - timedelta(days=KEEP_DAYS)).isoformat()
    try:
        cleanup = transport.delete(f"{url}/rest/v1/forecast_runs", headers=headers,
                                   params={"model": f"eq.{MODEL}", "area": "eq.dhaka", "issued_at": f"lt.{cutoff}"},
                                   timeout=30, allow_redirects=False)
        if not 200 <= cleanup.status_code < 300:
            raise RuntimeError("Scoped forecast cleanup did not succeed.")
    except Exception:
        print("Forecast publication confirmed; scoped cleanup failed.", file=sys.stderr)
    print(f"Confirmed forecast publication {run_id} with {HOURS} hours.")
    return run_id


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="print the forecast without saving")
    args = parser.parse_args()

    if not args.dry_run:
        require_atomic_publisher_enabled()
    import pandas as pd

    forecast, meta, issued_at = build_forecast()
    payload = publication_payload(forecast, meta, issued_at)
    dhaka = forecast.index + pd.Timedelta(hours=6)
    print(f"{'Dhaka time':<17} {'Nirmol':>7} {'range':>11} {'CAMS':>6}  top factor")
    for t, r in zip(dhaka, forecast.itertuples()):
        f = r.factors[0]
        print(f"{t:%a %H:%M}{'':<7} {r.pm25:7.0f} {r.low:5.0f}-{r.high:<5.0f} {r.cams:6.0f}  {f['feature']} ({f['effect']:+.2f})")
    if not args.dry_run:
        save(payload)


if __name__ == "__main__":
    main()
