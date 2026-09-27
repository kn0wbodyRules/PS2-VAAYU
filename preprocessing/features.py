"""Derived physics + time features, per station per hour.

The physics helpers (ventilation, stagnation, bearings) are written with plain
arithmetic so they work on both numpy arrays and torch tensors: the model reuses
them during rollout on its *own predicted* wind and BLH, which is part of what keeps
meteorology and chemistry coupled across the 72 h horizon.

Output: config.FEATURES_FILE (un-normalised; normalisation statistics are fitted on
the training split only, inside model/dataset.py).

Usage:
    python -m preprocessing.features
"""

from __future__ import annotations

import numpy as np
import pandas as pd

import config
from data_pipeline.common import load_stations

EARTH_R_KM = 6371.0


# --------------------------------------------------------------------------
# Physics helpers (numpy or torch)
# --------------------------------------------------------------------------
def wind_speed(u, v):
    return (u * u + v * v + 1e-12) ** 0.5


def ventilation_coefficient(ws, blh):
    """VC = wind speed (m/s) x boundary-layer height (m), in m2/s."""
    return ws * blh


def stagnation_index(vc, vc_ref: float = config.VC_REF):
    """Inversion/stagnation score in (0, 1]: 1 = no ventilation, 0.5 at VC = VC_REF."""
    return 1.0 / (1.0 + vc / vc_ref)


def haversine_km(lat1, lon1, lat2, lon2):
    p1, p2 = np.deg2rad(lat1), np.deg2rad(lat2)
    dp, dl = p2 - p1, np.deg2rad(lon2 - lon1)
    a = np.sin(dp / 2) ** 2 + np.cos(p1) * np.cos(p2) * np.sin(dl / 2) ** 2
    return 2 * EARTH_R_KM * np.arcsin(np.sqrt(a))


def bearing_deg(lat1, lon1, lat2, lon2):
    """Initial bearing from point 1 to point 2, degrees clockwise from north."""
    p1, p2 = np.deg2rad(lat1), np.deg2rad(lat2)
    dl = np.deg2rad(lon2 - lon1)
    x = np.sin(dl) * np.cos(p2)
    y = np.cos(p1) * np.sin(p2) - np.sin(p1) * np.cos(p2) * np.cos(dl)
    return (np.rad2deg(np.arctan2(x, y)) + 360) % 360


def wind_from_deg(u, v):
    """Direction the wind blows FROM (meteorological), degrees."""
    return (np.rad2deg(np.arctan2(-u, -v)) + 360) % 360


# --------------------------------------------------------------------------
# Fire influence
# --------------------------------------------------------------------------
def fire_cells(fires: pd.DataFrame, cell_deg: float = 0.25) -> pd.DataFrame:
    """Aggregate detections to (cell, hour) FRP sums to keep the upwind sum tractable."""
    f = fires.copy()
    f["clat"] = (np.floor(f["lat"] / cell_deg) + 0.5) * cell_deg
    f["clon"] = (np.floor(f["lon"] / cell_deg) + 0.5) * cell_deg
    f["time"] = f["timestamp"].dt.floor("h")
    return f.groupby(["clat", "clon", "time"], as_index=False)["frp"].sum()


def fire_influence_score(obs: pd.DataFrame, stations: pd.DataFrame, fires: pd.DataFrame,
                         lookback_h: int = config.FIRE_LOOKBACK_HOURS,
                         half_angle: float = config.FIRE_CONE_HALF_ANGLE,
                         decay_km: float = config.FIRE_DECAY_KM, chunk: int = 512) -> pd.Series:
    """log1p( sum of FRP in the upwind cone over the last `lookback_h` hours, distance-decayed ).

    For station s at hour t: a fire cell c counts if the bearing s->c lies within
    `half_angle` of the direction the wind at s is coming from; its FRP is weighted by
    a cosine taper across the cone and exp(-distance / decay_km).
    """
    out = pd.Series(0.0, index=obs.index)
    if fires is None or fires.empty:
        return out
    cells = fire_cells(fires)
    cell_ids = cells[["clat", "clon"]].drop_duplicates().reset_index(drop=True)
    cells = cells.merge(cell_ids.reset_index().rename(columns={"index": "cid"}))
    times = pd.DatetimeIndex(sorted(obs["time"].unique()))
    frp = (cells.pivot_table(index="time", columns="cid", values="frp", aggfunc="sum")
           .reindex(times, fill_value=0.0).fillna(0.0)
           .rolling(lookback_h, min_periods=1).sum().to_numpy())           # (T, C)

    st = stations.set_index("station_id").loc[obs["station_id"].unique()]
    slat, slon = st["lat"].to_numpy()[:, None], st["lon"].to_numpy()[:, None]
    clat, clon = cell_ids["clat"].to_numpy()[None, :], cell_ids["clon"].to_numpy()[None, :]
    decay = np.exp(-haversine_km(slat, slon, clat, clon) / decay_km)       # (N, C)
    bear = bearing_deg(slat, slon, clat, clon)                              # (N, C)

    wide_u = obs.pivot(index="time", columns="station_id", values="u10").reindex(times)[st.index]
    wide_v = obs.pivot(index="time", columns="station_id", values="v10").reindex(times)[st.index]
    wfrom = wind_from_deg(wide_u.to_numpy(), wide_v.to_numpy())             # (T, N), NaN if no wind

    score = np.zeros((len(times), len(st)))
    for i in range(0, len(times), chunk):
        wf = wfrom[i:i + chunk, :, None]                                     # (t, N, 1)
        diff = np.abs((bear[None] - wf + 180) % 360 - 180)                   # (t, N, C)
        taper = np.where(diff <= half_angle, np.cos(np.deg2rad(diff) * 90 / half_angle), 0.0)
        taper = np.nan_to_num(taper)
        score[i:i + chunk] = np.einsum("tnc,nc,tc->tn", taper, decay, frp[i:i + chunk])

    long = pd.DataFrame(np.log1p(score), index=times, columns=st.index).stack()
    key = pd.MultiIndex.from_arrays([obs["time"], obs["station_id"]])
    return pd.Series(long.reindex(key).to_numpy(), index=obs.index).fillna(0.0)


# --------------------------------------------------------------------------
# Baseline residuals (past hours only)
# --------------------------------------------------------------------------
def latest_available_cams(cams: pd.DataFrame, latency_h: int | None = None) -> pd.DataFrame:
    """For each (station, valid hour) the CAMS value from the freshest run usable at that hour."""
    latency_h = config.CAMS_LATENCY_HOURS if latency_h is None else latency_h
    c = cams[cams["lead_hour"] >= latency_h]
    c = c.sort_values("lead_hour").drop_duplicates(["station_id", "valid_time"], keep="first")
    return c.rename(columns={"valid_time": "time"}).drop(columns=["issue_time", "lead_hour"])


def residual_features(obs: pd.DataFrame, cams: pd.DataFrame | None) -> pd.DataFrame:
    """obs - CAMS for chemistry (cams_res_*) and met (met_res_*): recent-bias signals."""
    out = pd.DataFrame(index=obs.index)
    if cams is None or cams.empty:
        for v in config.STATE_VARS:
            out[f"{'cams' if v in config.CHEM_VARS else 'met'}_res_{v}"] = np.nan
        return out
    lat = latest_available_cams(cams)
    m = obs[["station_id", "time"]].merge(lat, on=["station_id", "time"], how="left")
    m = m.reindex(columns=["station_id", "time"] + config.STATE_VARS)  # not-yet-pulled vars -> NaN
    for v in config.STATE_VARS:
        prefix = "cams" if v in config.CHEM_VARS else "met"
        out[f"{prefix}_res_{v}"] = obs[v].to_numpy() - m[v].to_numpy()
    return out


def time_features(t: pd.Series) -> pd.DataFrame:
    t_local = t.dt.tz_convert(config.LOCAL_TZ)
    hour, dow, month = t_local.dt.hour, t_local.dt.dayofweek, t_local.dt.month
    return pd.DataFrame({
        "hour_sin": np.sin(2 * np.pi * hour / 24), "hour_cos": np.cos(2 * np.pi * hour / 24),
        "dow_sin": np.sin(2 * np.pi * dow / 7), "dow_cos": np.cos(2 * np.pi * dow / 7),
        "month_sin": np.sin(2 * np.pi * (month - 1) / 12),
        "month_cos": np.cos(2 * np.pi * (month - 1) / 12),
        "stubble_season": month.isin(config.STUBBLE_MONTHS).astype(float),
    }, index=t.index)


TIME_FEATURES = ["hour_sin", "hour_cos", "dow_sin", "dow_cos", "month_sin", "month_cos",
                 "stubble_season"]


def build_features(obs: pd.DataFrame, stations: pd.DataFrame, fires: pd.DataFrame | None,
                   cams: pd.DataFrame | None) -> pd.DataFrame:
    df = obs.copy()
    if "ws" not in df or df["ws"].isna().all():
        df["ws"] = wind_speed(df["u10"], df["v10"])
    df["ventilation_coef"] = ventilation_coefficient(df["ws"], df["blh"])
    df["stagnation_index"] = stagnation_index(df["ventilation_coef"])
    df["fire_influence_score"] = fire_influence_score(df, stations, fires)
    df = pd.concat([df, residual_features(df, cams), time_features(df["time"])], axis=1)
    return df


def run() -> pd.DataFrame:
    obs = pd.read_parquet(config.OBS_FILE)
    fires_path = config.DATA_PROCESSED / "fire_detections.parquet"
    fires = pd.read_parquet(fires_path) if fires_path.exists() else None
    cams = pd.read_parquet(config.CAMS_STATION_FILE) if config.CAMS_STATION_FILE.exists() else None
    df = build_features(obs, load_stations(), fires, cams)
    df.to_parquet(config.FEATURES_FILE, index=False)
    print(f"[features] {df.shape} -> {config.FEATURES_FILE}")
    return df


if __name__ == "__main__":
    run()
