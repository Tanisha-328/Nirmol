"""05A independent numerical oracles and actual saved-artifact checks.

Synthetic inputs are NOT held-out observations and establish no predictive accuracy.
No provider, database, publisher or credentials are used.
"""
import math
import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch

import numpy as np
import pandas as pd
import xgboost as xgb

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "jobs"))
sys.path.insert(0, str(ROOT / "ml"))
import refresh_forecast as job
from train_forecast import add_features


def varied_inputs():
    index = pd.date_range("2026-10-15T00:00:00", periods=73, freq="h")
    n = np.arange(len(index), dtype=float)
    return pd.DataFrame({
        "cams_pm2_5": 20 + n % 17 * 4, "cams_pm10": 40 + n % 19 * 5,
        "cams_carbon_monoxide": 250 + n, "cams_dust": n % 9,
        "temperature_2m": 20 + n % 12, "relative_humidity_2m": 50 + n % 35,
        "dew_point_2m": 15 + n % 5, "precipitation": n % 4 / 10,
        "surface_pressure": 1000 + n % 15, "cloud_cover": n % 100,
        "wind_speed_10m": 2 + n % 13, "wind_direction_10m": n % 36 * 10,
        "shortwave_radiation": 50 + n % 12 * 20,
    }, index=index)


class IndependentScienceAudit(unittest.TestCase):
    def test_rolling_calendar_and_vector_features_against_separate_scalar_oracle(self):
        raw = varied_inputs()
        actual = add_features(raw)
        for i in range(48, 73):
            row = actual.iloc[i]
            local = raw.index[i] + pd.Timedelta(hours=6)
            self.assertEqual(row["hour"], local.hour)
            self.assertEqual(row["weekend"], int(local.weekday() in (4, 5)))
            self.assertAlmostEqual(row["month_sin"], math.sin(2 * math.pi * local.month / 12), places=12)
            self.assertAlmostEqual(row["cams_pm2_5_log"], math.log1p(raw.iloc[i]["cams_pm2_5"]), places=12)
            self.assertAlmostEqual(row["cams_pm2_5_mean24"], sum(raw["cams_pm2_5"].iloc[i - 23:i + 1]) / 24, places=12)
            self.assertAlmostEqual(row["rain_24h"], sum(raw["precipitation"].iloc[i - 23:i + 1]), places=12)
            self.assertAlmostEqual(row["wind_mean_12h"], sum(raw["wind_speed_10m"].iloc[i - 11:i + 1]) / 12, places=12)
            self.assertEqual(row["pressure_change_24h"], raw.iloc[i]["surface_pressure"] - raw.iloc[i - 24]["surface_pressure"])
            angle = math.radians(raw.iloc[i]["wind_direction_10m"])
            self.assertAlmostEqual(row["wind_u"], -raw.iloc[i]["wind_speed_10m"] * math.sin(angle), places=12)
            self.assertAlmostEqual(row["wind_v"], -raw.iloc[i]["wind_speed_10m"] * math.cos(angle), places=12)

    def test_real_median_artifact_full_shap_additivity_and_inverse_log_transform(self):
        # Load the saved model directly, independent of forecast_runtime.predict_checked.
        model = xgb.XGBRegressor()
        model.load_model(ROOT / "ml/artifacts/nirmol_xgb_v1_p50.json")
        frame = add_features(varied_inputs()).iloc[-25:]
        matrix = xgb.DMatrix(frame)
        booster = model.get_booster()
        margin = booster.predict(matrix, output_margin=True)
        contributions = booster.predict(matrix, pred_contribs=True)
        reconstructed = np.array([math.fsum(float(x) for x in row) for row in contributions])
        max_error = float(np.max(np.abs(reconstructed - margin)))
        self.assertEqual(contributions.shape, (25, 25))
        np.testing.assert_allclose(reconstructed, margin, rtol=0, atol=2e-5)
        concentration = np.array([math.expm1(float(value)) for value in margin])
        np.testing.assert_allclose(concentration, np.expm1(model.predict(frame)), rtol=1e-6)
        self.assertTrue(np.isfinite(concentration).all())
        print(f"05A native artifact: 25 varied synthetic rows; max full SHAP additivity error={max_error:.10g}; NOT an accuracy evaluation")

    def test_provider_history_gaps_reordering_and_off_hour_rows_fail_before_rolling_features(self):
        raw = varied_inputs()
        fixed_now = datetime(2026, 10, 17, 0, 30, tzinfo=timezone.utc)

        class Clock(datetime):
            @classmethod
            def now(cls, tz=None):
                return fixed_now.astimezone(tz) if tz else fixed_now.replace(tzinfo=None)

        off_hour = raw.copy()
        off_hour.index = pd.DatetimeIndex([t + pd.Timedelta(minutes=15) if i == 26 else t for i, t in enumerate(raw.index)])
        for label, bad in (("history gap", raw.drop(raw.index[46])), ("reordered", raw.iloc[::-1]), ("off hour", off_hour)):
            def provider(_url, _variables, prefix):
                return bad[[column for column in bad if column.startswith("cams_") == bool(prefix)]].copy()
            with self.subTest(label=label), patch.object(job, "open_meteo", side_effect=provider), patch.object(job, "datetime", Clock), \
                    patch.object(job, "save", side_effect=AssertionError("No publication permitted")), \
                    self.assertRaisesRegex(ValueError, "hourly"):
                job.build_forecast()

    def test_unused_old_and_future_provider_gaps_do_not_reject_valid_model_window(self):
        raw = varied_inputs()
        fixed_now = datetime(2026, 10, 17, 0, 30, tzinfo=timezone.utc)

        class Clock(datetime):
            @classmethod
            def now(cls, tz=None):
                return fixed_now.astimezone(tz) if tz else fixed_now.replace(tzinfo=None)

        def build(frame):
            def provider(_url, _variables, prefix):
                return frame[[column for column in frame if column.startswith("cams_") == bool(prefix)]].copy()
            with patch.object(job, "open_meteo", side_effect=provider), patch.object(job, "datetime", Clock), \
                    patch.object(job, "save", side_effect=AssertionError("No publication permitted")):
                return job.build_forecast()[0]

        expected = build(raw)
        extra_future = raw.iloc[[-1]].copy()
        extra_future.index += pd.Timedelta(hours=3)
        for label, frame in (("unused old gap", raw.drop(raw.index[2])),
                             ("unused future gap", pd.concat([raw, extra_future]))):
            with self.subTest(label=label):
                pd.testing.assert_frame_equal(build(frame), expected)


if __name__ == "__main__":
    unittest.main()
