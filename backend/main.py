"""VAAYU FastAPI backend.

    uvicorn backend.main:app --reload

Endpoints
    GET  /health              liveness + where the model/data are expected
    GET  /model               production model metadata (run id, epoch, ...)
    GET  /stations            station registry used by the model graph
    GET  /forecast            latest 72 h forecast; ?station_id=...&hours=...
    POST /forecast/refresh    recompute the forecast from the latest processed data
"""

from __future__ import annotations

import math

import pandas as pd
from fastapi import FastAPI, HTTPException, Query

import config
from backend import inference
from backend.model_loader import ModelNotAvailable, get_model, model_info

app = FastAPI(title="VAAYU - Delhi-NCR 72h coupled AQI forecast", version="0.1.0")
MAX_FORECAST_AGE = pd.Timedelta(hours=1)


def _clean(records: list[dict]) -> list[dict]:
    """JSON-safe: NaN -> None, timestamps -> ISO strings."""
    out = []
    for r in records:
        out.append({k: (None if isinstance(v, float) and math.isnan(v) else
                        v.isoformat() if isinstance(v, pd.Timestamp) else v) for k, v in r.items()})
    return out


def _current_forecast(force: bool = False) -> pd.DataFrame:
    try:
        model, ckpt = get_model()
    except ModelNotAvailable as e:
        raise HTTPException(503, str(e))
    path = config.FORECAST_CURRENT_FILE
    if not force and path.exists():
        cached = pd.read_parquet(path)
        age = pd.Timestamp.now(tz="UTC") - pd.Timestamp(path.stat().st_mtime, unit="s", tz="UTC")
        if not cached.empty and cached["run_id"].iloc[0] == ckpt["run_id"] and age < MAX_FORECAST_AGE:
            return cached
    try:
        return inference.forecast_from_drive(model, ckpt)
    except FileNotFoundError as e:
        raise HTTPException(503, f"processed data missing: {e}")
    except ValueError as e:
        raise HTTPException(503, f"cannot build forecast input: {e}")


@app.get("/health")
def health():
    return {"status": "ok", "environment": config.ENVIRONMENT,
            "model_present": config.PRODUCTION_MODEL_FILE.exists(),
            "features_present": config.FEATURES_FILE.exists()}


@app.get("/model")
def model():
    try:
        return model_info()
    except ModelNotAvailable as e:
        raise HTTPException(503, str(e))


@app.get("/stations")
def stations():
    try:
        _, ckpt = get_model()
    except ModelNotAvailable as e:
        raise HTTPException(503, str(e))
    g = ckpt["graph"]
    return [{"station_id": s, "lat": la, "lon": lo}
            for s, la, lo in zip(g["station_ids"], g["station_lat"], g["station_lon"])]


@app.get("/forecast")
def forecast(station_id: str | None = None,
             hours: int = Query(config.HORIZON_HOURS, ge=1, le=config.HORIZON_HOURS)):
    df = _current_forecast()
    if station_id is not None:
        df = df[df["station_id"] == station_id]
        if df.empty:
            raise HTTPException(404, f"unknown station_id {station_id!r}")
    df = df[df["lead_hour"] <= hours]
    return {"run_id": df["run_id"].iloc[0] if len(df) else None,
            "issued_from": df["issued_from"].iloc[0].isoformat() if len(df) else None,
            "forecast": _clean(df.drop(columns=["run_id", "issued_from"]).to_dict("records"))}


@app.post("/forecast/refresh")
def refresh():
    df = _current_forecast(force=True)
    return {"rows": len(df), "run_id": df["run_id"].iloc[0] if len(df) else None}
