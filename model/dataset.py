"""Processed tables -> dense arrays -> training windows.

One sample = one forecast made at time T0:
    history  hours T0-H+1 .. T0   observed state, baseline, exogenous features, fire nodes
    future   hours T0+1  .. T0+K  baseline (CAMS run issued at I = T0 - latency, leads
                                  latency+1 .. latency+K), known exogenous features, targets

State channels (config.STATE_VARS): pm25, pm10, o3, no2, t2m, u10, v10, blh.
Missing observed state is imputed with the baseline and flagged via the mask channel -
never zero-filled. Targets keep NaN where there is no real observation (gap-filled
values are *inputs* only, never targets), and the loss masks them out.

Normalisation statistics are fitted on the training split only.
"""

from __future__ import annotations

import math

import numpy as np
import pandas as pd
import torch
from torch.utils.data import Dataset

import config
from graph.build_graph import fire_node_features
from preprocessing.features import TIME_FEATURES, latest_available_cams

RES_FEATURES = [f"cams_res_{v}" for v in config.CHEM_VARS] + [f"met_res_{v}" for v in config.MET_VARS]
NORM_EXOG = ["fire_influence_score"] + RES_FEATURES
EXOG_FEATURES = NORM_EXOG + TIME_FEATURES
PERSISTED_EXOG = NORM_EXOG  # unknown in the future -> held at their T0 value
IDX = {v: i for i, v in enumerate(config.STATE_VARS)}


def _ts(t) -> pd.Timestamp:
    t = pd.Timestamp(t)
    return t.tz_localize("UTC") if t.tzinfo is None else t.tz_convert("UTC")


class VaayuData:
    """Holds the full aligned arrays for all stations and hours."""

    def __init__(self, features: pd.DataFrame, cams: pd.DataFrame, graph: dict,
                 fires: pd.DataFrame | None = None, met_forecast: pd.DataFrame | None = None,
                 history: int | None = None, horizon: int | None = None,
                 latency: int | None = None, met_baseline: str | None = None):
        self.history = history or config.HISTORY_HOURS
        self.horizon = horizon or config.HORIZON_HOURS
        self.latency = config.CAMS_LATENCY_HOURS if latency is None else latency
        met_baseline = met_baseline or config.MET_BASELINE_SOURCE
        self.graph = graph
        self.station_ids = list(graph["station_ids"])
        self.n_stations = len(self.station_ids)
        self.n_fire = len(graph["fire_node_ids"])

        feats = features[features["station_id"].isin(self.station_ids)]
        self.times = pd.DatetimeIndex(sorted(feats["time"].unique()))
        if len(self.times) > 1 and not (np.diff(self.times.asi8) == np.diff(self.times.asi8)[0]).all():
            raise ValueError("features table is not on a regular hourly clock")
        T, N = len(self.times), self.n_stations

        def cube(cols: list[str]) -> np.ndarray:
            out = np.full((T, N, len(cols)), np.nan, dtype=np.float32)
            for j, c in enumerate(cols):
                if c not in feats:
                    continue
                w = feats.pivot(index="time", columns="station_id", values=c)
                out[:, :, j] = w.reindex(index=self.times, columns=self.station_ids).to_numpy()
            return out

        self.state = cube(config.STATE_VARS)
        flags = cube([f"{v}_flag" for v in config.STATE_VARS])
        # an hour is a valid *target* only if it was actually observed (flag 0); met truth
        # comes from reanalysis with no flag column -> observed wherever present
        has_flag = np.array([f"{v}_flag" in feats for v in config.STATE_VARS])
        self.observed = np.where(has_flag, flags == 0, ~np.isnan(self.state))
        self.exog = cube(EXOG_FEATURES)
        self.fire_score = cube(["fire_influence_score"])[..., 0]

        # fire-source node features (T, F, 2)
        fire_nodes = pd.DataFrame({"fire_node_id": graph["fire_node_ids"],
                                   "lat": graph["fire_lat"], "lon": graph["fire_lon"]})
        self.fire = fire_node_features(fires, fire_nodes, self.times)

        # baselines: history uses the freshest CAMS usable at each hour; future uses one run
        if cams is not None:  # variables not downloaded yet are NaN (-> climatological mean)
            cams = cams.reindex(columns=list(dict.fromkeys([*cams.columns, *config.STATE_VARS])))
        self.hist_base = self._hist_baseline(cams)
        self.issue_times, self.cams_cube = self._cams_cube(cams)
        if met_baseline == "openmeteo" and met_forecast is not None and not met_forecast.empty:
            self._apply_openmeteo_baseline(met_forecast)

    # ------------------------------------------------------------------
    def _hist_baseline(self, cams: pd.DataFrame) -> np.ndarray:
        T, N = len(self.times), self.n_stations
        out = np.full((T, N, len(config.STATE_VARS)), np.nan, dtype=np.float32)
        if cams is None or cams.empty:
            return out
        lat = latest_available_cams(cams, self.latency)
        for j, v in enumerate(config.STATE_VARS):
            w = lat.pivot(index="time", columns="station_id", values=v)
            out[:, :, j] = w.reindex(index=self.times, columns=self.station_ids).to_numpy()
        return out

    def _cams_cube(self, cams: pd.DataFrame):
        """(n_issues, horizon, N, 8) for leads latency+1 .. latency+horizon."""
        leads = np.arange(self.latency + 1, self.latency + self.horizon + 1)
        c = cams[cams["lead_hour"].isin(leads) & cams["station_id"].isin(self.station_ids)]
        issues = pd.DatetimeIndex(sorted(c["issue_time"].unique()))
        cube = np.full((len(issues), len(leads), self.n_stations, len(config.STATE_VARS)),
                       np.nan, dtype=np.float32)
        ii = issues.get_indexer(c["issue_time"])
        li = c["lead_hour"].to_numpy() - leads[0]
        si = pd.Index(self.station_ids).get_indexer(c["station_id"])
        for j, v in enumerate(config.STATE_VARS):
            cube[ii, li, si, j] = c[v].to_numpy()
        return issues, cube

    def _apply_openmeteo_baseline(self, met_fc: pd.DataFrame) -> None:
        """Replace t2m/u10/v10 baselines by Open-Meteo previous runs (BLH stays CAMS)."""
        for v in ("t2m", "u10", "v10"):
            j = IDX[v]
            for day in (1, 2, 3):
                w = (met_fc[met_fc["lead_day"] == day]
                     .pivot(index="valid_time", columns="station_id", values=v)
                     .reindex(columns=self.station_ids))
                if day == 1:
                    vals = w.reindex(self.times).to_numpy()
                    self.hist_base[:, :, j] = np.where(np.isnan(vals), self.hist_base[:, :, j], vals)
                for k in range(self.horizon):
                    lead = self.latency + k + 1
                    if min(3, math.ceil(lead / 24)) != day:
                        continue
                    valid = self.issue_times + pd.Timedelta(hours=lead)
                    vals = w.reindex(valid).to_numpy()
                    self.cams_cube[:, k, :, j] = np.where(np.isnan(vals), self.cams_cube[:, k, :, j], vals)

    # ------------------------------------------------------------------
    def sample_t0s(self, time_range, exclude=None, min_target_frac: float | None = None) -> np.ndarray:
        """Indices into self.times of valid forecast start times whose whole window
        [T0-H+1, T0+K] lies inside `time_range` and does not touch `exclude`.

        A window qualifies if >= min_target_frac of its PM2.5 targets (the primary target)
        are observed. Gated on PM2.5 alone so the sparse OpenAQ era, where only PM2.5 was
        pulled, still yields samples; other missing targets are masked in the loss."""
        min_target_frac = config.MIN_TARGET_FRAC if min_target_frac is None else min_target_frac
        lo, hi = _ts(time_range[0]), _ts(time_range[1])
        t_index = {t: i for i, t in enumerate(self.times)}
        out = []
        for ii, issue in enumerate(self.issue_times):
            t0 = issue + pd.Timedelta(hours=self.latency)
            i0 = t_index.get(t0)
            if i0 is None or i0 - self.history + 1 < 0 or i0 + self.horizon >= len(self.times):
                continue
            w0, w1 = self.times[i0 - self.history + 1], self.times[i0 + self.horizon]
            if w0 < lo or w1 > hi:
                continue
            if exclude is not None and not (w1 < _ts(exclude[0]) or w0 > _ts(exclude[1])):
                continue
            tgt = self.observed[i0 + 1:i0 + self.horizon + 1, :, IDX["pm25"]]
            if tgt.mean() < min_target_frac:
                continue
            if np.isnan(self.cams_cube[ii, :, :, IDX["pm25"]]).all():
                continue
            out.append((i0, ii))
        return np.array(out, dtype=np.int64).reshape(-1, 2)

    def split(self, name: str) -> np.ndarray:
        if name == "train":
            parts = [self.sample_t0s(r, exclude=config.BENCHMARK_RANGE) for r in config.TRAIN_RANGES]
            return np.concatenate(parts) if parts else np.zeros((0, 2), dtype=np.int64)
        ranges = {"val": config.VAL_RANGE, "test": config.TEST_RANGE,
                  "benchmark": config.BENCHMARK_RANGE}
        return self.sample_t0s(ranges[name])

    # ------------------------------------------------------------------
    def fit_normalizer(self, samples: np.ndarray) -> dict:
        """Mean/std from the hours covered by training samples only."""
        if len(samples) == 0:
            raise ValueError("no training samples to fit the normaliser on")
        rows = np.unique(np.concatenate([np.arange(i0 - self.history + 1, i0 + self.horizon + 1)
                                         for i0, _ in samples]))
        s = self.state[rows].reshape(-1, self.state.shape[-1])
        e = self.exog[rows][..., :len(NORM_EXOG)].reshape(-1, len(NORM_EXOG))
        std = lambda a: np.where(np.nanstd(a, 0) > 1e-6, np.nanstd(a, 0), 1.0)
        mean = lambda a: np.nan_to_num(np.nanmean(a, 0))
        return {"state_mean": mean(s).tolist(), "state_std": std(s).tolist(),
                "exog_mean": mean(e).tolist() + [0.0] * len(TIME_FEATURES),
                "exog_std": std(e).tolist() + [1.0] * len(TIME_FEATURES),
                "state_vars": config.STATE_VARS, "exog_features": EXOG_FEATURES}


class VaayuWindows(Dataset):
    """torch Dataset of normalised windows for a set of (T0 index, issue index) samples."""

    def __init__(self, data: VaayuData, samples: np.ndarray, norm: dict):
        self.d, self.samples = data, samples
        self.sm = np.asarray(norm["state_mean"], dtype=np.float32)
        self.ss = np.asarray(norm["state_std"], dtype=np.float32)
        self.em = np.asarray(norm["exog_mean"], dtype=np.float32)
        self.es = np.asarray(norm["exog_std"], dtype=np.float32)

    def __len__(self):
        return len(self.samples)

    def _n(self, x):
        return (x - self.sm) / self.ss

    def __getitem__(self, k):
        d = self.d
        i0, ii = self.samples[k]
        h = slice(i0 - d.history + 1, i0 + 1)
        f = slice(i0 + 1, i0 + d.horizon + 1)

        hist_base = self._n(d.hist_base[h])
        fut_base = self._n(d.cams_cube[ii])
        # baseline gaps fall back to the climatological mean (0 in normalised space)
        hist_base = np.nan_to_num(hist_base)
        fut_base = np.nan_to_num(fut_base)

        hist_state = self._n(d.state[h])
        hist_mask = ~np.isnan(hist_state)
        hist_state = np.where(hist_mask, hist_state, hist_base)

        hist_exog = np.nan_to_num((d.exog[h] - self.em) / self.es)
        fut_exog = np.nan_to_num((d.exog[f] - self.em) / self.es)
        n_p = len(PERSISTED_EXOG)
        fut_exog[..., :n_p] = hist_exog[-1, :, :n_p]

        target = self._n(d.state[f])
        target_mask = d.observed[f] & ~np.isnan(target)

        t = lambda a, dt=torch.float32: torch.as_tensor(np.ascontiguousarray(a), dtype=dt)
        return {
            "hist_state": t(hist_state), "hist_mask": t(hist_mask),
            "hist_base": t(hist_base), "hist_exog": t(hist_exog), "hist_fire": t(d.fire[h]),
            "fut_base": t(fut_base), "fut_exog": t(fut_exog),
            "fut_fire": t(np.repeat(d.fire[i0][None], d.horizon, 0)),
            "target": t(np.nan_to_num(target)), "target_mask": t(target_mask),
            "fire_score_true": t(np.nan_to_num(d.fire_score[f])),
            "t0": torch.tensor(i0), "issue": torch.tensor(ii),
        }
