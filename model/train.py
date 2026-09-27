"""Training loop.

* Time-based split (config ranges); the Oct 2019 - Feb 2020 benchmark slice is purged
  from training so it can be scored cleanly against Jena et al. (2021).
* Loss = severity-weighted Huber on chemistry (extra weight on Poor..Severe hours)
       + lambda_met * Huber on meteorology
       + lambda_phys * physical-consistency penalty: wind speed rising while PM2.5 also
         rises is penalised ONLY when fire_influence_score is low. During genuine upwind
         stubble transport, stronger wind should bring more PM2.5, so it is not penalised.
* Rollout schedule: pure teacher forcing for `teacher_forcing_epochs`, then the
  teacher-forcing probability ramps 1 -> 0 over `sampling_ramp_epochs` (scheduled
  sampling). The rollout horizon grows from `horizon_start` to 72 h over the same period,
  which keeps early epochs cheap on the GPU.
* Checkpoints every `checkpoint_every` epochs + best-by-validation, under
  config.MODEL_CHECKPOINTS/<run_id>/.

Usage (Colab):
    from model import train
    run_dir = train.run()
"""

from __future__ import annotations

import json
import time
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd
import torch
from torch.nn import functional as F
from torch.utils.data import DataLoader

import config
from graph.build_graph import load_graph
from model import aqi
from model.dataset import EXOG_FEATURES, VaayuData, VaayuWindows
from model.gnn_model import I_U, I_V, N_CHEM, build_model

I_PM25 = config.STATE_VARS.index("pm25")


def load_data(met_baseline: str | None = None) -> VaayuData:
    feats = pd.read_parquet(config.FEATURES_FILE)
    cams = pd.read_parquet(config.CAMS_STATION_FILE)
    fires_path = config.DATA_PROCESSED / "fire_detections.parquet"
    fires = pd.read_parquet(fires_path) if fires_path.exists() else None
    met_fc = pd.read_parquet(config.MET_FORECAST_FILE) if config.MET_FORECAST_FILE.exists() else None
    return VaayuData(feats, cams, load_graph(), fires=fires, met_forecast=met_fc,
                     met_baseline=met_baseline)


# --------------------------------------------------------------------------
# Schedules
# --------------------------------------------------------------------------
def tf_probability(epoch: int, tf_epochs: int, ramp_epochs: int) -> float:
    if epoch < tf_epochs:
        return 1.0
    if ramp_epochs <= 0:
        return 0.0
    return max(0.0, 1.0 - (epoch - tf_epochs + 1) / ramp_epochs)


def rollout_horizon(epoch: int, start: int, full: int, grow_epochs: int) -> int:
    if grow_epochs <= 0:
        return full
    return int(min(full, round(start + (full - start) * epoch / grow_epochs)))


# --------------------------------------------------------------------------
# Loss
# --------------------------------------------------------------------------
def severity_weights(target_n, model, weights: dict):
    """Per (B, K, N) weight from the true hourly PM2.5 AQI category."""
    pm = model.denorm(target_n)[..., I_PM25].detach().cpu().numpy()
    cat = aqi.hourly_pm25_category(pm)
    table = np.array([weights[c] for c in aqi.CATEGORIES] + [1.0], dtype=np.float32)  # -1 -> 1.0
    return torch.as_tensor(table[cat], device=target_n.device)


def physics_penalty(pred_n, model, fire_score_true, fire_low: float):
    """relu(d wind speed) * relu(d PM2.5) between consecutive forecast hours, gated to
    hours with low fire influence (no upwind plume)."""
    phys = model.denorm(pred_n)
    ws = torch.sqrt(phys[..., I_U] ** 2 + phys[..., I_V] ** 2 + 1e-6)
    dws = ws[:, 1:] - ws[:, :-1]
    dpm = pred_n[:, 1:, :, I_PM25] - pred_n[:, :-1, :, I_PM25]
    gate = (fire_score_true[:, 1:] < fire_low).float()
    pen = F.relu(dws) * F.relu(dpm) * gate
    return pen.sum() / gate.sum().clamp(min=1.0)


def compute_loss(pred_n, batch, model, cfg: dict):
    k = pred_n.shape[1]
    tgt, msk = batch["target"][:, :k], batch["target_mask"][:, :k].float()
    huber = F.huber_loss(pred_n, tgt, reduction="none", delta=1.0) * msk

    w = severity_weights(tgt, model, cfg["severity_weights"]).unsqueeze(-1)
    chem = (huber[..., :N_CHEM] * w).sum() / (msk[..., :N_CHEM] * w).sum().clamp(min=1.0)
    met = huber[..., N_CHEM:].sum() / msk[..., N_CHEM:].sum().clamp(min=1.0)
    phys = physics_penalty(pred_n, model, batch["fire_score_true"][:, :k], cfg["fire_low_threshold"])
    total = chem + cfg["lambda_met"] * met + cfg["lambda_phys"] * phys
    return total, {"chem": chem.item(), "met": met.item(), "phys": phys.item()}


# --------------------------------------------------------------------------
def to_device(batch: dict, device) -> dict:
    return {k: v.to(device) for k, v in batch.items()}


def save_checkpoint(path: Path, model, norm, graph, cfg, epoch, val_loss, run_id):
    path.parent.mkdir(parents=True, exist_ok=True)
    torch.save({"model_state": model.state_dict(), "hparams": model.hparams, "norm": norm,
                "graph": graph, "train_cfg": cfg, "epoch": epoch, "val_loss": val_loss,
                "run_id": run_id, "exog_features": EXOG_FEATURES,
                "history": config.HISTORY_HOURS, "horizon": config.HORIZON_HOURS,
                "latency": config.CAMS_LATENCY_HOURS,
                "met_baseline": config.MET_BASELINE_SOURCE,
                "saved_at": datetime.now(timezone.utc).isoformat()}, path)


@torch.no_grad()
def validate(model, loader, cfg, device) -> float:
    model.eval()
    losses = []
    for batch in loader:
        batch = to_device(batch, device)
        loss, _ = compute_loss(model(batch, tf_prob=0.0), batch, model, cfg)
        losses.append(loss.item())
    return float(np.mean(losses)) if losses else float("nan")


def run(overrides: dict | None = None, data: VaayuData | None = None,
        run_id: str | None = None) -> Path:
    cfg = {**config.TRAIN_DEFAULTS, **(overrides or {})}
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    run_id = run_id or datetime.now(timezone.utc).strftime("run_%Y%m%dT%H%M%SZ")
    run_dir = config.MODEL_CHECKPOINTS / run_id
    torch.manual_seed(cfg.get("seed", 0))

    data = data or load_data()
    train_s, val_s = data.split("train"), data.split("val")
    print(f"[train] device={device} train={len(train_s)} val={len(val_s)} samples")
    norm = data.fit_normalizer(train_s)
    train_dl = DataLoader(VaayuWindows(data, train_s, norm), batch_size=cfg["batch_size"],
                          shuffle=True, drop_last=False, num_workers=cfg.get("num_workers", 0))
    val_dl = DataLoader(VaayuWindows(data, val_s, norm), batch_size=cfg["batch_size"])

    graph = data.graph
    model = build_model(graph, norm, {"n_exog": len(EXOG_FEATURES), "hidden": cfg["hidden"],
                                      "gat_heads": cfg["gat_heads"]}).to(device)
    opt = torch.optim.AdamW(model.parameters(), lr=cfg["lr"], weight_decay=1e-4)
    sched = torch.optim.lr_scheduler.CosineAnnealingLR(opt, T_max=max(1, cfg["epochs"]))

    grow = cfg["teacher_forcing_epochs"] + cfg["sampling_ramp_epochs"]
    history, best = [], float("inf")
    for epoch in range(cfg["epochs"]):
        model.train()
        p_tf = tf_probability(epoch, cfg["teacher_forcing_epochs"], cfg["sampling_ramp_epochs"])
        horizon = rollout_horizon(epoch, cfg["horizon_start"], config.HORIZON_HOURS, grow)
        t_start, parts = time.time(), []
        for batch in train_dl:
            batch = to_device(batch, device)
            pred = model(batch, horizon=horizon, tf_prob=p_tf)
            loss, comp = compute_loss(pred, batch, model, cfg)
            opt.zero_grad()
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            opt.step()
            parts.append({"loss": loss.item(), **comp})
        sched.step()
        val_loss = validate(model, val_dl, cfg, device)
        rec = {"epoch": epoch, "tf_prob": p_tf, "horizon": horizon, "val_loss": val_loss,
               "seconds": round(time.time() - t_start, 1),
               **({k: float(np.mean([p[k] for p in parts])) for k in parts[0]} if parts else {})}
        history.append(rec)
        print(f"[train] {json.dumps(rec)}")

        if (epoch + 1) % cfg["checkpoint_every"] == 0 or epoch == cfg["epochs"] - 1:
            save_checkpoint(run_dir / f"epoch_{epoch + 1:03d}.pt", model, norm, graph, cfg,
                            epoch, val_loss, run_id)
        # only count "best" once the model is free-running at full horizon
        full_rollout = p_tf == 0.0 and horizon == config.HORIZON_HOURS
        if (full_rollout or epoch == cfg["epochs"] - 1) and val_loss < best:
            best = val_loss
            save_checkpoint(run_dir / "best.pt", model, norm, graph, cfg, epoch, val_loss, run_id)

    if not (run_dir / "best.pt").exists():
        save_checkpoint(run_dir / "best.pt", model, norm, graph, cfg, epoch, val_loss, run_id)
    config.LOGS.mkdir(parents=True, exist_ok=True)
    (config.LOGS / f"train_{run_id}.json").write_text(json.dumps(
        {"run_id": run_id, "cfg": cfg,
         "history": history}, indent=2, default=float))
    print(f"[train] done -> {run_dir}")
    return run_dir


if __name__ == "__main__":
    run()
