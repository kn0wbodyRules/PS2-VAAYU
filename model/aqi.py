"""CPCB National AQI (India) - sub-index formula, averaging periods, categories.

* PM2.5, PM10, NO2: 24 h running average (needs >= 16 valid hours)
* O3: 8 h running average (needs >= 6 valid hours)
* Sub-index = piecewise-linear interpolation between CPCB breakpoints
* AQI = worst (max) sub-index, reported only if >= 3 pollutants are available and at
  least one of them is PM2.5 or PM10 (CPCB rule)

CPCB publishes the "Severe" band open-ended (e.g. PM2.5 250+). The upper concentration
used to reach AQI 500 follows the common CPCB-calculator convention and is capped at 500.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

AQI_BREAKS = [0, 50, 100, 200, 300, 400, 500]
BREAKPOINTS = {  # concentration (ug/m3) at each AQI_BREAKS value
    "pm25": [0, 30, 60, 90, 120, 250, 380],
    "pm10": [0, 50, 100, 250, 350, 430, 510],
    "no2": [0, 40, 80, 180, 280, 400, 520],
    "o3": [0, 50, 100, 168, 208, 748, 1000],
}
AVERAGING = {"pm25": (24, 16), "pm10": (24, 16), "no2": (24, 16), "o3": (8, 6)}
CATEGORIES = ["good", "satisfactory", "moderate", "poor", "very_poor", "severe"]
SEVERE, VERY_POOR, POOR = 5, 4, 3


def sub_index(conc, pollutant: str):
    conc = np.asarray(conc, dtype=float)
    idx = np.interp(conc, BREAKPOINTS[pollutant], AQI_BREAKS, right=500.0)
    return np.where(np.isnan(conc), np.nan, idx)


def rolling_average(x: np.ndarray, window: int, min_periods: int) -> np.ndarray:
    """Trailing mean along axis 0 of a (T, ...) array."""
    shape = x.shape
    flat = pd.DataFrame(x.reshape(shape[0], -1))
    return flat.rolling(window, min_periods=min_periods).mean().to_numpy().reshape(shape)


def aqi_from_hourly(hourly: dict[str, np.ndarray]) -> np.ndarray:
    """hourly: pollutant -> (T, ...) hourly concentrations. Returns (T, ...) AQI (NaN if invalid)."""
    subs = []
    for p, (win, minp) in AVERAGING.items():
        if p in hourly:
            subs.append((p, sub_index(rolling_average(hourly[p], win, minp), p)))
    stack = np.stack([s for _, s in subs])
    valid = ~np.isnan(stack)
    has_pm = np.zeros(stack.shape[1:], dtype=bool)
    for i, (p, _) in enumerate(subs):
        if p in ("pm25", "pm10"):
            has_pm |= valid[i]
    ok = (valid.sum(0) >= 3) & has_pm
    with np.errstate(all="ignore"):
        aqi = np.nanmax(np.where(valid, stack, -np.inf), axis=0)
    return np.where(ok, aqi, np.nan)


def category(aqi) -> np.ndarray:
    """AQI -> category index 0..5 (good..severe); -1 where AQI is NaN."""
    aqi = np.asarray(aqi, dtype=float)
    cat = np.digitize(aqi, [50, 100, 200, 300, 400], right=True)
    return np.where(np.isnan(aqi), -1, cat)


def hourly_pm25_category(pm25):
    """Category of the raw hourly PM2.5 value (used only for loss weighting, not for evaluation)."""
    return category(sub_index(pm25, "pm25"))
