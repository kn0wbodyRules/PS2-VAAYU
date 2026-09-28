"""Latest 72 h forecast from processed data + the production model.

The forecast start T0 is aligned to the newest usable CAMS run (issue + latency), the
same alignment the model was trained on. Output rows: one per station per lead hour,
with VAAYU values, the raw CAMS baseline, CPCB AQI/category, and the stagnation index.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
import torch

import config
from model import aqi
from model.dataset import VaayuData, VaayuWindows
from preprocessing.features import (TIME_FEATURES, stagnation_index, time_features,
                                    ventilation_coefficient, wind_speed)


def extend_future(features: pd.DataFrame, hours: int) -> pd.DataFrame:
    """Append `hours` empty future rows per station (only time features are known)."""
    last = features["time"].max()
    fut_times = pd.date_range(last + pd.Timedelta(hours=1), periods=hours, freq="h", tz="UTC")
    fut = pd.MultiIndex.from_product([features["station_id"].unique(), fut_times],
                                     names=["station_id", "time"]).to_frame(index=False)
    fut = pd.concat([fut, time_features(fut["time"])[TIME_FEATURES]], axis=1)
    return pd.concat([features, fut], ignore_index=True)


def latest_sample(data: VaayuData, last_obs_time) -> np.ndarray:
    t_index = {t: i for i, t in enumerate(data.times)}
    for ii in range(len(data.issue_times) - 1, -1, -1):
        t0 = data.issue_times[ii] + pd.Timedelta(hours=data.latency)
        i0 = t_index.get(t0)
        if i0 is not None and t0 <= last_obs_time and i0 - data.history + 1 >= 0 \
                and i0 + data.horizon < len(data.times):
            return np.array([[i0, ii]])
    raise ValueError("no CAMS run lines up with the available observation history")


@torch.no_grad()
def forecast(model, ckpt: dict, features: pd.DataFrame, cams: pd.DataFrame,
             fires: pd.DataFrame | None = None) -> pd.DataFrame:
    horizon, device = ckpt["horizon"], next(model.parameters()).device
    last_obs = features["time"].max()
    data = VaayuData(extend_future(features, horizon), cams, ckpt["graph"], fires=fires,
                     history=ckpt["history"], horizon=horizon, latency=ckpt["latency"])
    sample = latest_sample(data, last_obs)
    norm = ckpt["norm"]
    batch = {k: v.unsqueeze(0).to(device) for k, v in VaayuWindows(data, sample, norm)[0].items()}
    mean, std = np.asarray(norm["state_mean"]), np.asarray(norm["state_std"])
    pred = model(batch, tf_prob=0.0)[0].cpu().numpy() * std + mean      # (K, N, 8)
    base = batch["fut_base"][0].cpu().numpy() * std + mean

    i0 = int(sample[0, 0])
    prior = data.state[i0 - 22:i0 + 1]
    hourly = {v: np.concatenate([prior[:, :, config.STATE_VARS.index(v)],
                                 pred[:, :, config.STATE_VARS.index(v)]]) for v in aqi.AVERAGING}
    aqi_vals = aqi.aqi_from_hourly(hourly)[-horizon:]

    t0 = data.times[i0]
    rows = []
    for k in range(horizon):
        for n, sid in enumerate(data.station_ids):
            p = dict(zip(config.STATE_VARS, pred[k, n].tolist()))
            ws = float(wind_speed(p["u10"], p["v10"]))
            vc = float(ventilation_coefficient(ws, max(p["blh"], 10.0)))
            rows.append({"station_id": sid, "issued_from": t0, "lead_hour": k + 1,
                         "valid_time": t0 + pd.Timedelta(hours=k + 1), **p,
                         **{f"cams_{v}": float(base[k, n, j]) for j, v in enumerate(config.STATE_VARS)},
                         "wind_speed": ws, "ventilation_coef": vc,
                         "stagnation_index": float(stagnation_index(vc)),
                         "aqi": float(aqi_vals[k, n]) if not np.isnan(aqi_vals[k, n]) else None,
                         "category": (aqi.CATEGORIES[int(aqi.category(aqi_vals[k, n]))]
                                      if not np.isnan(aqi_vals[k, n]) else None),
                         "run_id": ckpt["run_id"]})
    return pd.DataFrame(rows)


def forecast_from_drive(model, ckpt: dict) -> pd.DataFrame:
    features = pd.read_parquet(config.FEATURES_FILE)
    cams = pd.read_parquet(config.CAMS_STATION_FILE)
    fires_path = config.DATA_PROCESSED / "fire_detections.parquet"
    fires = pd.read_parquet(fires_path) if fires_path.exists() else None
    # only the recent past is needed for one forecast
    recent = features[features["time"] >= features["time"].max() - pd.Timedelta(days=3)]
    cams = cams[cams["issue_time"] >= recent["time"].min() - pd.Timedelta(days=5)]
    df = forecast(model, ckpt, recent, cams, fires)
    config.FORECAST_CURRENT_FILE.parent.mkdir(parents=True, exist_ok=True)
    df.to_parquet(config.FORECAST_CURRENT_FILE, index=False)
    return df


def _utc(t) -> pd.Timestamp:
    t = pd.Timestamp(t)
    return t.tz_localize("UTC") if t.tzinfo is None else t.tz_convert("UTC")


def _max_time(path, column: str) -> pd.Timestamp:
    """Latest value of a timestamp column from parquet row-group statistics (no data read)."""
    import pyarrow.parquet as pq
    pf = pq.ParquetFile(path)
    j = pf.schema_arrow.get_field_index(column)
    return max(_utc(pf.metadata.row_group(i).column(j).statistics.max)
               for i in range(pf.metadata.num_row_groups))


def forecast_as_of(model, ckpt: dict, as_of=None) -> pd.DataFrame:
    """Forecast from the newest CAMS run usable at `as_of` (default: latest data).

    Reads only the needed window (~4 days of features, ~7 days of CAMS) instead of the full
    files, which matters on a streamed Google Drive. Observations after `as_of` are never
    read, so a past date gives the forecast the system would have issued then."""
    end = _utc(as_of) if as_of is not None else _max_time(config.FEATURES_FILE, "time")
    start = end - pd.Timedelta(days=3)
    features = pd.read_parquet(config.FEATURES_FILE, filters=[("time", ">=", start), ("time", "<=", end)])
    if features.empty:
        raise ValueError(f"no observations in {start} .. {end}")
    cams = pd.read_parquet(config.CAMS_STATION_FILE,
                           filters=[("issue_time", ">=", start - pd.Timedelta(days=5)), ("issue_time", "<=", end)])
    fires_path = config.DATA_PROCESSED / "fire_detections.parquet"
    fires = (pd.read_parquet(fires_path, filters=[("timestamp", ">=", start - pd.Timedelta(days=2)),
                                                  ("timestamp", "<=", end)])
             if fires_path.exists() else None)
    return forecast(model, ckpt, features, cams, fires)
