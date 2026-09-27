"""Promote a trained checkpoint to production only if it is genuinely better.

Rules (both must hold):
  1. score (mean PM2.5 RMSE, days 2-3; lower is better) beats production by at least
     PROMOTE_MIN_IMPROVEMENT (relative), and
  2. Very-Poor-or-worse recall on day 3 does not drop by more than PROMOTE_MAX_RECALL_DROP
     (so a model can't "win" by smoothing away the episodes that matter).
The first model with a valid score is always promoted.

On promotion the checkpoint is copied to config.PRODUCTION_MODEL_FILE (write to a temp
file, then atomic rename) and config.REGISTRY_FILE is updated with full history.

Usage:
    python -m model.promote <checkpoint.pt> <metrics.json>
"""

from __future__ import annotations

import json
import os
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

import config


def read_registry() -> dict:
    if config.REGISTRY_FILE.exists():
        return json.loads(config.REGISTRY_FILE.read_text())
    return {"production": None, "history": []}


def is_better(new: dict, current: dict | None) -> tuple[bool, str]:
    if new.get("score") is None:
        return False, "new model has no score (no test/val samples?)"
    if current is None or current.get("score") is None:
        return True, "no production model yet"
    need = current["score"] * (1 - config.PROMOTE_MIN_IMPROVEMENT)
    if new["score"] > need:
        return False, f"score {new['score']:.3f} does not beat production {current['score']:.3f} by " \
                      f"{config.PROMOTE_MIN_IMPROVEMENT:.0%}"
    old_r, new_r = current.get("severe_recall_day3"), new.get("severe_recall_day3")
    if old_r is not None and new_r is not None and new_r < old_r - config.PROMOTE_MAX_RECALL_DROP:
        return False, f"day-3 severe recall fell {old_r:.3f} -> {new_r:.3f}"
    return True, f"score {current['score']:.3f} -> {new['score']:.3f}"


def run(checkpoint: str | Path, metrics_file: str | Path) -> bool:
    metrics = json.loads(Path(metrics_file).read_text())
    reg = read_registry()
    entry = {"run_id": metrics.get("run_id"), "checkpoint": str(checkpoint),
             "metrics_file": str(metrics_file), "score": metrics.get("score"),
             "severe_recall_day3": metrics.get("severe_recall_day3"),
             "evaluated_at": metrics.get("evaluated_at")}
    ok, reason = is_better(entry, reg["production"])
    entry.update({"decision": "promoted" if ok else "rejected", "reason": reason,
                  "decided_at": datetime.now(timezone.utc).isoformat()})

    if ok:
        config.MODEL_PRODUCTION.mkdir(parents=True, exist_ok=True)
        tmp = config.PRODUCTION_MODEL_FILE.with_suffix(".tmp")
        shutil.copyfile(checkpoint, tmp)
        os.replace(tmp, config.PRODUCTION_MODEL_FILE)
        reg["production"] = entry
    reg["history"].append(entry)
    config.REGISTRY_FILE.parent.mkdir(parents=True, exist_ok=True)
    config.REGISTRY_FILE.write_text(json.dumps(reg, indent=2))
    print(f"[promote] {entry['decision']}: {reason}")
    return ok


if __name__ == "__main__":
    run(sys.argv[1], sys.argv[2])
