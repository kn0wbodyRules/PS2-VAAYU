"""VAAYU FastAPI backend.

    uvicorn backend.main:app --reload

Endpoints
    GET  /health              liveness + where the model/data are expected
    GET  /model               production model metadata (run id, epoch, ...)
    GET  /stations            station registry used by the model graph
    GET  /forecast            latest 72 h forecast; ?station_id=...&hours=...
    POST /forecast/refresh    recompute the forecast from the latest processed data
    GET  /fires               FIRMS fire detections (Punjab/Haryana) before the forecast start
    GET  /alerts              stations forecast to reach Poor-or-worse AQI within the horizon

Full request/response contract for the dashboard: docs/API.md
"""

from __future__ import annotations

import math
import os

import pandas as pd
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

import config
from backend import inference
from backend.model_loader import ModelNotAvailable, get_model, model_info
from model import aqi

app = FastAPI(title="VAAYU - Delhi-NCR 72h coupled AQI forecast", version="0.1.0")
# the dashboard is served separately (e.g. a dev server on another port) -> allow cross-origin
# reads; restrict with VAAYU_CORS_ORIGINS="https://a.example,https://b.example" in production
app.add_middleware(CORSMiddleware, allow_origins=os.environ.get("VAAYU_CORS_ORIGINS", "*").split(","),
                   allow_methods=["GET", "POST"], allow_headers=["*"])
MAX_FORECAST_AGE = pd.Timedelta(hours=1)


def _clean(records: list[dict]) -> list[dict]:
    """JSON-safe: NaN -> None, timestamps -> ISO strings."""
    out = []
    for r in records:
        out.append({k: (None if isinstance(v, float) and math.isnan(v) else
                        v.isoformat() if isinstance(v, pd.Timestamp) else v) for k, v in r.items()})
    return out


_cache: dict = {}  # (run_id, as_of) -> (computed_at, forecast df)


def _current_forecast(force: bool = False, as_of: str | None = None) -> pd.DataFrame:
    """Latest forecast, or the one the system would have issued at `as_of` (demo/replay).
    Cached in memory per model and date for MAX_FORECAST_AGE."""
    try:
        model, ckpt = get_model()
    except ModelNotAvailable as e:
        raise HTTPException(503, str(e))
    if as_of is not None:
        try:
            as_of = inference._utc(as_of).isoformat()
        except ValueError:
            raise HTTPException(422, f"as_of must be an ISO date/time, got {as_of!r}")
    key = (ckpt["run_id"], as_of)
    now = pd.Timestamp.now(tz="UTC")
    if not force and key in _cache and now - _cache[key][0] < MAX_FORECAST_AGE:
        return _cache[key][1]
    try:
        df = inference.forecast_as_of(model, ckpt, as_of)
    except FileNotFoundError as e:
        raise HTTPException(503, f"processed data missing: {e}")
    except ValueError as e:
        raise HTTPException(503, f"cannot build forecast input: {e}")
    except OSError as e:  # e.g. Google Drive still streaming a file that Colab just rewrote
        raise HTTPException(503, f"data file not readable yet (Drive still syncing?): {e}")
    _cache[key] = (now, df)
    if as_of is None:
        df.to_parquet(config.FORECAST_CURRENT_FILE, index=False)
    return df


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
             hours: int = Query(config.HORIZON_HOURS, ge=1, le=config.HORIZON_HOURS),
             as_of: str | None = None):
    df = _current_forecast(as_of=as_of)
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


@app.get("/fires")
def fires(hours: int = Query(24, ge=1, le=240), as_of: str | None = None):
    """Fire detections in the `hours` before the forecast start (plume-source overlay)."""
    path = config.DATA_PROCESSED / "fire_detections.parquet"
    if not path.exists():
        raise HTTPException(503, "no fire detections processed yet")
    df = _current_forecast(as_of=as_of)
    t0 = pd.Timestamp(df["issued_from"].iloc[0]) if len(df) else pd.Timestamp.now(tz="UTC")
    f = pd.read_parquet(path, filters=[("timestamp", ">", t0 - pd.Timedelta(hours=hours)),
                                       ("timestamp", "<=", t0)])
    return {"issued_from": t0.isoformat(), "hours": hours, "count": len(f),
            "fires": _clean(f[["lat", "lon", "timestamp", "frp"]].to_dict("records"))}


@app.get("/alerts")
def alerts(min_category: str = Query("poor", pattern="^(moderate|poor|very_poor|severe)$"),
           as_of: str | None = None):
    """One alert per station whose forecast AQI reaches `min_category` or worse:
    when it first crosses, the worst category, and the peak AQI within the horizon."""
    df = _current_forecast(as_of=as_of)
    thr = aqi.CATEGORIES.index(min_category)
    df = df.dropna(subset=["aqi"]).assign(cat_idx=lambda d: d["category"].map(aqi.CATEGORIES.index))
    out = []
    for sid, g in df[df["cat_idx"] >= thr].groupby("station_id"):
        g = g.sort_values("lead_hour")
        peak = g.loc[g["aqi"].idxmax()]
        out.append({"station_id": sid, "first_lead_hour": int(g["lead_hour"].iloc[0]),
                    "first_valid_time": g["valid_time"].iloc[0].isoformat(),
                    "worst_category": aqi.CATEGORIES[int(g["cat_idx"].max())],
                    "peak_aqi": float(peak["aqi"]), "peak_valid_time": peak["valid_time"].isoformat(),
                    "peak_stagnation_index": float(peak["stagnation_index"])})
    out.sort(key=lambda a: (-aqi.CATEGORIES.index(a["worst_category"]), a["first_lead_hour"]))
    return {"issued_from": df["issued_from"].iloc[0].isoformat() if len(df) else None,
            "min_category": min_category, "alerts": out}


# ---------------------------------------------------------------------------------------
# AERIS dashboard: its /api/* contract (backend/frontend_api.py) and the built frontend.
# `npm run build` in frontend/ -> frontend/dist is served at "/", so one process and one
# URL (http://localhost:8010) run the whole demo. API routes above take precedence.
# ---------------------------------------------------------------------------------------
from pathlib import Path as _Path

from fastapi.staticfiles import StaticFiles as _StaticFiles

from backend import frontend_api as _frontend_api

app.include_router(_frontend_api.router)
_DIST = _Path(__file__).resolve().parents[1] / "frontend" / "dist"


@app.middleware("http")
async def _no_cache_html(request, call_next):
    # index.html must never be cached: it names the hashed JS bundle, so a stale copy keeps
    # running the previous build (e.g. the old sidebar) until a hard reload.
    response = await call_next(request)
    if response.headers.get("content-type", "").startswith("text/html"):
        response.headers["Cache-Control"] = "no-cache"
    return response


if _DIST.is_dir():
    app.mount("/", _StaticFiles(directory=_DIST, html=True), name="dashboard")
