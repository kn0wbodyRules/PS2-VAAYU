"""Evaluation -> config.LOGS / metrics_<timestamp>.json

For the test split (2024-25, two stubble seasons) and, separately, the
Oct 2019 - Feb 2020 benchmark slice:

* RMSE / MAE / bias per variable at lead 24 h, 48 h, 72 h and per forecast day,
  for VAAYU and for the raw baseline it corrects (CAMS chem, CAMS/Open-Meteo met),
  plus % improvement over the baseline
* AQI-category accuracy using the CPCB formula (24 h PM2.5/PM10/NO2, 8 h O3 running
  averages, worst sub-index); the 23 h before T0 are taken from observations so early
  leads have full averaging windows
* extreme-event recall (and precision) for Severe and Very Poor-or-worse hours
* coupling perturbation test: raise input PM2.5, check predicted BLH drops
* benchmark slice: PM2.5 mean bias per day vs Jena et al. (2021) WRF-Chem figures

`score` (lower is better) = mean PM2.5 RMSE over forecast days 2 and 3 on the test
split - the day-2/day-3 gap this project targets. promote.py compares on it.

Usage:
    python -m model.evaluate <checkpoint.pt>
"""

from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import torch
from torch.utils.data import DataLoader

import config
from model import aqi
from model.dataset import VaayuData, VaayuWindows
from model.gnn_model import load_checkpoint

LEADS = (24, 48, 72)
DAYS = {"day1": (1, 24), "day2": (25, 48), "day3": (49, 72)}
IDX = {v: i for i, v in enumerate(config.STATE_VARS)}


@torch.no_grad()
def predict(model, data: VaayuData, samples: np.ndarray, norm: dict, device="cpu",
            batch_size: int = 16) -> dict:
    """Free-running forecasts in physical units. Arrays are (S, K, N, 8)."""
    ds = VaayuWindows(data, samples, norm)
    mean, std = np.asarray(norm["state_mean"]), np.asarray(norm["state_std"])
    preds, bases, truths = [], [], []
    for batch in DataLoader(ds, batch_size=batch_size):
        batch = {k: v.to(device) for k, v in batch.items()}
        p = model(batch, tf_prob=0.0).cpu().numpy()
        preds.append(p * std + mean)
        bases.append(batch["fut_base"].cpu().numpy() * std + mean)
        t = batch["target"].cpu().numpy() * std + mean
        truths.append(np.where(batch["target_mask"].cpu().numpy() > 0, t, np.nan))
    cat = lambda xs: np.concatenate(xs) if xs else np.zeros((0, data.horizon, data.n_stations, 8))
    return {"pred": cat(preds), "base": cat(bases), "truth": cat(truths), "samples": samples}


# --------------------------------------------------------------------------
def _err_stats(pred, truth) -> dict:
    e = pred - truth
    ok = ~np.isnan(e)
    if not ok.any():
        return {"rmse": None, "mae": None, "bias": None, "n": 0}
    e = e[ok]
    return {"rmse": float(np.sqrt(np.mean(e ** 2))), "mae": float(np.mean(np.abs(e))),
            "bias": float(np.mean(e)), "n": int(ok.sum())}


def _improvement(model_rmse, base_rmse):
    if model_rmse is None or not base_rmse:
        return None
    return float(100 * (base_rmse - model_rmse) / base_rmse)


def error_metrics(out: dict) -> dict:
    res = {}
    for v, j in IDX.items():
        entry = {}
        windows = {f"lead_{L}h": slice(L - 1, L) for L in LEADS}
        windows.update({d: slice(a - 1, b) for d, (a, b) in DAYS.items()})
        for name, sl in windows.items():
            m = _err_stats(out["pred"][:, sl, :, j], out["truth"][:, sl, :, j])
            b = _err_stats(out["base"][:, sl, :, j], out["truth"][:, sl, :, j])
            entry[name] = {"model": m, "baseline": b,
                           "rmse_improvement_pct": _improvement(m["rmse"], b["rmse"])}
        res[v] = entry
    return res


# --------------------------------------------------------------------------
def _aqi_series(data: VaayuData, out: dict, key: str) -> np.ndarray:
    """(S, K, N) AQI for pred/base/truth, prepending 23 h of observations before T0."""
    S, K, N = out["pred"].shape[:3]
    result = np.full((S, K, N), np.nan)
    for s, (i0, _) in enumerate(out["samples"]):
        prior = data.state[i0 - 22:i0 + 1]                   # 23 h ending at T0
        hourly = {}
        for v in aqi.AVERAGING:
            j = IDX[v]
            fut = out[key][s, :, :, j]
            hourly[v] = np.concatenate([prior[:, :, j], fut], 0)
        result[s] = aqi.aqi_from_hourly(hourly)[-K:]
    return result


def category_metrics(data: VaayuData, out: dict) -> dict:
    if len(out["samples"]) == 0:
        return {}
    cats = {k: aqi.category(_aqi_series(data, out, k)) for k in ("pred", "base", "truth")}
    t = cats["truth"]
    res = {}
    for d, (a, b) in DAYS.items():
        sl = slice(a - 1, b)
        entry = {}
        for who, key in (("model", "pred"), ("baseline", "base")):
            p, tt = cats[key][:, sl], t[:, sl]
            valid = (p >= 0) & (tt >= 0)
            acc = float((p[valid] == tt[valid]).mean()) if valid.any() else None
            ext = {}
            for name, thr in (("severe", aqi.SEVERE), ("very_poor_or_worse", aqi.VERY_POOR)):
                true_pos = valid & (tt >= thr)
                flagged = valid & (p >= thr)
                ext[name] = {
                    "recall": float((p[true_pos] >= thr).mean()) if true_pos.any() else None,
                    "precision": float((tt[flagged] >= thr).mean()) if flagged.any() else None,
                    "n_true": int(true_pos.sum())}
            entry[who] = {"category_accuracy": acc, "extreme": ext}
        res[d] = entry
    return res


# --------------------------------------------------------------------------
@torch.no_grad()
def perturbation_test(model, data: VaayuData, samples: np.ndarray, norm: dict, device="cpu",
                      delta_ugm3: float = 100.0, max_samples: int = 64,
                      min_effect_m: float = 5.0) -> dict:
    """Raise PM2.5 across the 24 h input window; genuine aerosol->met coupling should
    lower the predicted boundary-layer height (less surface heating, shallower mixing).

    Passes only if day-1 BLH drops by more than `min_effect_m` metres on average, so a
    noise-level response is not reported as evidence of coupling."""
    if len(samples) == 0:
        return {"passed": None, "reason": "no samples"}
    ds = VaayuWindows(data, samples[:max_samples], norm)
    std = np.asarray(norm["state_std"])
    mean = np.asarray(norm["state_mean"])
    jp, jb = IDX["pm25"], IDX["blh"]
    deltas = []
    for batch in DataLoader(ds, batch_size=16):
        batch = {k: v.to(device) for k, v in batch.items()}
        base = model(batch, tf_prob=0.0)[..., jb]
        pert = dict(batch)
        hs = batch["hist_state"].clone()
        hs[..., jp] += delta_ugm3 / std[jp]
        pert["hist_state"] = hs
        up = model(pert, tf_prob=0.0)[..., jb]
        deltas.append(((up - base) * std[jb]).cpu().numpy())   # metres
    d = np.concatenate(deltas)                                 # (S, K, N)
    day1 = d[:, :24]
    return {
        "delta_pm25_ugm3": delta_ugm3,
        "mean_delta_blh_m_day1": float(day1.mean()),
        "mean_delta_blh_m_all": float(d.mean()),
        "frac_station_hours_blh_lower_day1": float((day1 < 0).mean()),
        "blh_mean_m": float(mean[jb]),
        "min_effect_m": min_effect_m,
        "passed": bool(day1.mean() < -min_effect_m),
    }


def jena_comparison(err: dict) -> dict:
    pm = err["pm25"]
    bias = lambda who, d: pm[d][who]["bias"]
    return {
        "jena_2021_wrfchem_pm25_bias": config.JENA_2021_PM25_BIAS,
        "vaayu_pm25_bias": {d: bias("model", d) for d in DAYS},
        "cams_pm25_bias": {d: bias("baseline", d) for d in DAYS},
        "note": "Jena et al. evaluated Oct 2019-Feb 2020, Delhi mean; VAAYU numbers are the "
                "station-hour mean over the same window.",
    }


def evaluate_split(model, data, samples, norm, device) -> dict:
    out = predict(model, data, samples, norm, device)
    err = error_metrics(out)
    return {"n_samples": int(len(samples)), "errors": err,
            "categories": category_metrics(data, out)}, err


def primary_score(err: dict) -> float | None:
    r = [err["pm25"][d]["model"]["rmse"] for d in ("day2", "day3")]
    return float(np.mean(r)) if all(x is not None for x in r) else None


def run(checkpoint: str | Path, data: VaayuData | None = None, device=None) -> tuple[dict, Path]:
    from model.train import load_data
    device = device or ("cuda" if torch.cuda.is_available() else "cpu")
    model, ckpt = load_checkpoint(checkpoint, device)
    norm = ckpt["norm"]
    data = data or load_data(ckpt.get("met_baseline", config.MET_BASELINE_SOURCE))

    metrics = {"run_id": ckpt["run_id"], "checkpoint": str(checkpoint),
               "evaluated_at": datetime.now(timezone.utc).isoformat(),
               "met_baseline": ckpt.get("met_baseline"), "splits": {}}
    score = None
    for split in ("test", "benchmark", "val"):
        samples = data.split(split)
        if len(samples) == 0:
            metrics["splits"][split] = {"n_samples": 0}
            continue
        res, err = evaluate_split(model, data, samples, norm, device)
        if split == "benchmark":
            res["jena_comparison"] = jena_comparison(err)
        if split == "test":
            res["perturbation_test"] = perturbation_test(model, data, samples, norm, device)
        metrics["splits"][split] = res
        if score is None and split in ("test", "val"):
            score = primary_score(err)
            metrics["score_split"] = split
    metrics["score"] = score
    metrics["score_definition"] = "mean PM2.5 RMSE (ug/m3) over forecast days 2-3; lower is better"
    sev = (metrics["splits"].get(metrics.get("score_split", "test"), {})
           .get("categories", {}).get("day3", {}).get("model", {}).get("extreme", {})
           .get("very_poor_or_worse", {}).get("recall"))
    metrics["severe_recall_day3"] = sev

    config.LOGS.mkdir(parents=True, exist_ok=True)
    path = config.LOGS / f"metrics_{datetime.now(timezone.utc):%Y%m%dT%H%M%SZ}.json"
    path.write_text(json.dumps(metrics, indent=2))
    print(f"[evaluate] score={score} -> {path}")
    return metrics, path


if __name__ == "__main__":
    run(sys.argv[1])
