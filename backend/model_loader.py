"""Loads the production model from config.PRODUCTION_MODEL_FILE (Drive).

The model is cached and transparently reloaded when promote.py replaces model.pt
(detected by file modification time), so the API never needs a restart after a
promotion.
"""

from __future__ import annotations

import threading

import torch

import config
from model.gnn_model import load_checkpoint

_lock = threading.Lock()
_cache: dict = {"mtime": None, "model": None, "ckpt": None}


class ModelNotAvailable(RuntimeError):
    pass


def get_model(device: str | None = None):
    path = config.PRODUCTION_MODEL_FILE
    if not path.exists():
        raise ModelNotAvailable(f"no production model at {path} - train and promote one first")
    mtime = path.stat().st_mtime
    with _lock:
        if _cache["mtime"] != mtime:
            device = device or ("cuda" if torch.cuda.is_available() else "cpu")
            model, ckpt = load_checkpoint(path, device)
            _cache.update(mtime=mtime, model=model, ckpt=ckpt)
        return _cache["model"], _cache["ckpt"]


def model_info() -> dict:
    _, ckpt = get_model()
    return {k: ckpt.get(k) for k in ("run_id", "epoch", "val_loss", "saved_at", "met_baseline",
                                     "history", "horizon", "latency")} | {
        "n_stations": len(ckpt["graph"]["station_ids"]), "path": str(config.PRODUCTION_MODEL_FILE)}
