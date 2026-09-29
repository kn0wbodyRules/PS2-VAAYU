"""Adapter serving the AERIS dashboard's `/api/*` contract (frontend/src/types) from real
VAAYU data: the promoted model's forecast, the raw CAMS baseline, FIRMS fires, the
station graph and the held-out test-set evaluation.

Rules followed here so the dashboard never shows invented numbers:
* confidence bands are the empirical 10th-90th percentile of real forecast errors on the
  Oct-Dec 2025 test set (backend/calibration.json), not a synthetic spread;
* there is no WRF-Chem forecast to compare with, so the third reference is persistence
  (mean of the last 24 h of observations) - the standard naive baseline;
* narratives, drivers and plume paths are computed from the forecast and fire data, and
  plumes are only returned when the forecast wind actually carries them to Delhi.

Set AERIS_AS_OF (e.g. 2025-11-05) to replay a past date by default; `?as_of=` overrides.
"""

from __future__ import annotations

import json
import math
import os
from pathlib import Path

import numpy as np
import pandas as pd
from fastapi import APIRouter, HTTPException, Query

import config
from graph.build_graph import FIRE_EDGE, edge_weights
from model import aqi
from preprocessing.features import bearing_deg, fire_cells, haversine_km, wind_from_deg

router = APIRouter(prefix="/api", tags=["dashboard"])
DEFAULT_AS_OF = os.environ.get("AERIS_AS_OF") or None
_CAL_FILE = Path(__file__).with_name("calibration.json")
CAL = json.loads(_CAL_FILE.read_text()) if _CAL_FILE.exists() else None
DELHI = (28.6139, 77.2090)
CATEGORY = {"good": "Good", "satisfactory": "Satisfactory", "moderate": "Moderate", "poor": "Poor",
            "very_poor": "Very Poor", "severe": "Severe"}
CHEM = ["pm25", "pm10", "no2", "o3"]
_cache: dict = {}


# --------------------------------------------------------------------------------- helpers
def _num(x, nd: int = 1, default: float = 0.0) -> float:
    return round(float(x), nd) if x is not None and np.isfinite(x) else default


def _ist(t: pd.Timestamp) -> str:
    return t.tz_convert(config.LOCAL_TZ).strftime("%d %b %H:%M IST")


def _registry() -> pd.DataFrame:
    return pd.read_csv(config.STATIONS_FILE).set_index("station_id")


def _station_meta(sid: str, lat: float, lon: float, reg: pd.DataFrame) -> dict:
    raw = str(reg["name"].get(sid, sid)) if sid in reg.index else sid
    base = raw.strip().rsplit(" - ", 1)[0]  # drop only the trailing operator ("- DPCC")
    name = base.split(",")[0].strip()
    city = base.split(",")[1].strip() if "," in base else "Delhi"
    state = "Haryana" if sid.endswith("_hspcb") else "Uttar Pradesh" if sid.endswith("_uppcb") else "Delhi"
    if state == "Delhi":
        dy = (lat - DELHI[0]) * 111
        dx = (lon - DELHI[1]) * 111 * math.cos(math.radians(DELHI[0]))
        zone = "Central" if math.hypot(dx, dy) < 6 else ("North" if dy > 0 else "South") if abs(dy) > abs(dx) \
            else ("East" if dx > 0 else "West")
    else:
        zone = "NCR North" if lat > 28.8 else "NCR South" if state == "Haryana" else "NCR East"
    return {"id": sid, "name": name, "city": city, "state": state, "lat": lat, "lon": lon,
            "isBoundaryNode": False, "zone": zone}


def _fire_state(lat: float, lon: float) -> str:
    return "Punjab" if lat >= 29.9 and lon <= 76.8 else "Haryana"  # approximate state line


def _fire_node_meta(fid: str, lat: float, lon: float) -> dict:
    return {"id": fid, "name": f"Fire cell {lat:.1f}°N {lon:.1f}°E", "city": "", "state": _fire_state(lat, lon),
            "lat": lat, "lon": lon, "isBoundaryNode": True, "zone": "Boundary Fire Node"}


def _stagnation_risk(s: float) -> str:
    return "Low" if s < 0.5 else "Moderate" if s < 0.75 else "High" if s < 0.9 else "Extreme"


def _grap(aqi_val: float) -> str:
    return ("Stage IV (Severe+)" if aqi_val > 450 else "Stage III (Severe)" if aqi_val > 400
            else "Stage II (Very Poor)" if aqi_val > 300 else "Stage I (Poor)")


GRAP_ACTIONS = {
    "Stage I (Poor)": [
        "GRAP Stage I (AQI 201-300): enforce dust-control norms at construction and demolition sites.",
        "Mechanised road sweeping and water sprinkling on high-dust corridors; strict PUC checks.",
        "Enforce the ban on open burning of waste and biomass.",
    ],
    "Stage II (Very Poor)": [
        "GRAP Stage II (AQI 301-400): all Stage I measures, intensified.",
        "Restrict diesel generator use; raise parking fees and augment public transport to cut private vehicle use.",
        "Health advisory: sensitive groups (children, elderly, respiratory/cardiac patients) avoid outdoor exertion.",
    ],
    "Stage III (Severe)": [
        "GRAP Stage III (AQI 401-450): halt non-essential construction and demolition.",
        "Restrict older (BS-III petrol / BS-IV diesel) four-wheelers; intensify road cleaning.",
        "Health advisory: everyone reduce outdoor activity; consider hybrid classes for primary schools.",
    ],
    "Stage IV (Severe+)": [
        "GRAP Stage IV (AQI > 450): stop entry of non-essential trucks into Delhi; all Stage III measures.",
        "Consider work-from-home for offices and closure/online classes for schools.",
        "Health emergency advisory for all residents.",
    ],
}


def _fire_scale(features_path: Path) -> float:
    """fire_influence_score (log1p units) mapped to 0-100: its 99th percentile = 100."""
    if "fire_scale" not in _cache:
        s = pd.read_parquet(features_path, columns=["fire_influence_score"])["fire_influence_score"]
        _cache["fire_scale"] = float(np.nanquantile(s[s > 0], 0.99)) if (s > 0).any() else 1.0
    return _cache["fire_scale"]


# --------------------------------------------------------------------------------- context
def _ctx(as_of: str | None) -> dict:
    """Everything the dashboard needs for one forecast, computed once and cached."""
    from backend.main import MAX_FORECAST_AGE, _current_forecast  # lazy: avoids import cycle
    from backend.model_loader import ModelNotAvailable, get_model
    try:
        _, ckpt = get_model()
    except ModelNotAvailable as e:
        raise HTTPException(503, str(e))
    as_of = as_of or DEFAULT_AS_OF
    key = (ckpt["run_id"], as_of)
    now = pd.Timestamp.now(tz="UTC")
    hit = _cache.get(("ctx",) + key)
    if hit and now - hit["computed_at"] < MAX_FORECAST_AGE:
        return hit

    fc = _current_forecast(as_of=as_of)
    t0 = pd.Timestamp(fc["issued_from"].iloc[0])
    g = ckpt["graph"]
    sids = list(g["station_ids"])
    n_st, K = len(sids), int(fc["lead_hour"].max())
    reg = _registry()

    feats = pd.read_parquet(config.FEATURES_FILE,
                            columns=["station_id", "time", *CHEM, "t2m", "rh", "u10", "v10", "blh", "ws",
                                     "ventilation_coef", "stagnation_index"],
                            filters=[("time", ">=", t0 - pd.Timedelta(hours=23)), ("time", "<=", t0)])
    times = pd.date_range(t0 - pd.Timedelta(hours=23), t0, freq="h", tz="UTC")
    prior = {v: feats.pivot(index="time", columns="station_id", values=v).reindex(index=times, columns=sids)
             for v in [*CHEM, "t2m", "rh", "u10", "v10", "blh", "ws", "ventilation_coef", "stagnation_index"]}

    fcw = {v: fc.pivot(index="lead_hour", columns="station_id", values=v).reindex(columns=sids)
           for v in [*CHEM, "t2m", "u10", "v10", "blh", "wind_speed", "ventilation_coef", "stagnation_index",
                     "aqi", "cams_pm25", "cams_pm10", "cams_no2", "cams_o3"]}

    # CAMS AQI on the same CPCB footing: 23 h of observations + the CAMS forecast
    cams_aqi = aqi.aqi_from_hourly({v: np.concatenate([prior[v].to_numpy()[1:], fcw[f"cams_{v}"].to_numpy()])
                                    for v in CHEM})[-K:]
    obs_aqi = aqi.aqi_from_hourly({v: prior[v].to_numpy() for v in CHEM})[-1]
    persistence = {v: np.nanmean(prior[v].to_numpy(), axis=0) for v in CHEM}

    fires_path = config.DATA_PROCESSED / "fire_detections.parquet"
    fires = (pd.read_parquet(fires_path, filters=[("timestamp", ">", t0 - pd.Timedelta(hours=24)),
                                                  ("timestamp", "<=", t0)])
             if fires_path.exists() else pd.DataFrame(columns=["lat", "lon", "timestamp", "frp"]))

    # upwind fire influence per station per lead, using the forecast wind and the last 24 h of fires
    lat = np.array(g["station_lat"])[:, None]
    lon = np.array(g["station_lon"])[:, None]
    fire_pct = np.zeros((K + 1, n_st))
    if len(fires):
        cells = fire_cells(fires).groupby(["clat", "clon"], as_index=False)["frp"].sum()
        clat, clon = cells["clat"].to_numpy()[None], cells["clon"].to_numpy()[None]
        decay = np.exp(-haversine_km(lat, lon, clat, clon) / config.FIRE_DECAY_KM)
        bear = bearing_deg(lat, lon, clat, clon)
        frp = cells["frp"].to_numpy()
        scale = _fire_scale(config.FEATURES_FILE)
        uv = [(prior["u10"].to_numpy()[-1], prior["v10"].to_numpy()[-1])] + \
             [(fcw["u10"].to_numpy()[k], fcw["v10"].to_numpy()[k]) for k in range(K)]
        for k, (u, v) in enumerate(uv):
            wf = wind_from_deg(np.nan_to_num(u), np.nan_to_num(v))[:, None]
            diff = np.abs((bear - wf + 180) % 360 - 180)
            taper = np.where(diff <= config.FIRE_CONE_HALF_ANGLE,
                             np.cos(np.deg2rad(diff) * 90 / config.FIRE_CONE_HALF_ANGLE), 0.0)
            fire_pct[k] = np.clip(100 * np.log1p((taper * decay * frp).sum(1)) / scale, 0, 100)

    ctx = {"computed_at": now, "as_of": as_of, "t0": t0, "fc": fc, "fcw": fcw, "prior": prior, "sids": sids,
           "K": K, "graph": g, "reg": reg, "cams_aqi": cams_aqi, "obs_aqi": obs_aqi, "persistence": persistence,
           "fires": fires, "fire_pct": fire_pct, "run_id": ckpt["run_id"]}
    _cache[("ctx",) + key] = ctx
    return ctx


def _band(v: str, k: int, mean: float) -> tuple[float, float]:
    if CAL is None or k == 0 or v not in CAL["vars"]:
        return mean, mean
    q10, q90 = CAL["vars"][v]["q10"][k - 1], CAL["vars"][v]["q90"][k - 1]
    return max(0.0, mean + q10), max(0.0, mean + q90)


# --------------------------------------------------------------------------------- endpoints
@router.get("/stations")
def stations(as_of: str | None = None):
    c = _ctx(as_of)
    g = c["graph"]
    out = [_station_meta(s, la, lo, c["reg"]) for s, la, lo in zip(g["station_ids"], g["station_lat"], g["station_lon"])]
    out += [_fire_node_meta(f, la, lo) for f, la, lo in zip(g["fire_node_ids"], g["fire_lat"], g["fire_lon"])]
    return out


@router.get("/forecast")
def forecast(as_of: str | None = None):
    c = _ctx(as_of)
    t0, K, fcw, prior = c["t0"], c["K"], c["fcw"], c["prior"]
    g = c["graph"]
    out = []
    for n, (sid, la, lo) in enumerate(zip(g["station_ids"], g["station_lat"], g["station_lon"])):
        rh_now = _num(prior["rh"].iloc[-1, n], 0, default=float("nan"))
        hours = []
        for k in range(K + 1):
            if k == 0:  # hour 0 = the observed state at the forecast start
                row = {v: prior[v].iloc[-1, n] for v in CHEM}
                u, v_, blh = prior["u10"].iloc[-1, n], prior["v10"].iloc[-1, n], prior["blh"].iloc[-1, n]
                t2m, ws = prior["t2m"].iloc[-1, n], prior["ws"].iloc[-1, n]
                vc, stag = prior["ventilation_coef"].iloc[-1, n], prior["stagnation_index"].iloc[-1, n]
                aqi_v, cams = c["obs_aqi"][n], {v: fcw[f"cams_{v}"].iloc[0, n] for v in CHEM}
                cams_aqi = c["cams_aqi"][0, n]
                row = {v: (row[v] if np.isfinite(row[v]) else fcw[v].iloc[0, n]) for v in CHEM}
            else:
                row = {v: fcw[v].loc[k].iloc[n] for v in CHEM}
                u, v_, blh = fcw["u10"].loc[k].iloc[n], fcw["v10"].loc[k].iloc[n], fcw["blh"].loc[k].iloc[n]
                t2m, ws = fcw["t2m"].loc[k].iloc[n], fcw["wind_speed"].loc[k].iloc[n]
                vc, stag = fcw["ventilation_coef"].loc[k].iloc[n], fcw["stagnation_index"].loc[k].iloc[n]
                aqi_v, cams_aqi = fcw["aqi"].loc[k].iloc[n], c["cams_aqi"][k - 1, n]
                cams = {v: fcw[f"cams_{v}"].loc[k].iloc[n] for v in CHEM}
            conc = {}
            for v in CHEM:
                lo_, hi_ = _band(v, k, float(row[v]) if np.isfinite(row[v]) else 0.0)
                conc[v] = {"lower": _num(lo_), "mean": _num(row[v]), "upper": _num(hi_)}
            aqi_mean = _num(aqi_v, 0, default=_num(aqi.sub_index(row["pm25"], "pm25"), 0))
            ratio = lambda b: b / row["pm25"] if row["pm25"] and np.isfinite(row["pm25"]) and row["pm25"] > 0 else 1.0
            aqi_ci = {"lower": _num(min(500, aqi_mean * ratio(conc["pm25"]["lower"])), 0), "mean": aqi_mean,
                      "upper": _num(min(500, aqi_mean * ratio(conc["pm25"]["upper"])), 0)}
            cat = aqi.CATEGORIES[int(aqi.category(aqi_mean))] if aqi_mean > 0 else "good"
            hours.append({
                "hour_offset": k, "timestamp": (t0 + pd.Timedelta(hours=k)).isoformat(),
                **conc, "aqi": aqi_ci, "category": CATEGORY[cat],
                "cams_baseline_pm25": _num(cams["pm25"]), "cams_baseline_aqi": _num(cams_aqi, 0),
                "gnn_residual_pm25": _num(row["pm25"] - cams["pm25"]) if np.isfinite(cams["pm25"]) else 0.0,
                "persistence_pm25": _num(c["persistence"]["pm25"][n]),
                "weather": {"temperature": _num(t2m), "relative_humidity": rh_now if np.isfinite(rh_now) else 0.0,
                            "wind_speed": _num(ws, 2), "wind_direction": _num(wind_from_deg(u, v_), 0),
                            "boundary_layer_height": _num(blh, 0)},
                "physics": {"ventilation_coefficient": _num(vc, 0),
                            "inversion_index": _num(100 * stag, 0) if np.isfinite(stag) else 0.0,
                            "fire_influence_score": _num(c["fire_pct"][k, n], 0),
                            "stagnation_risk": _stagnation_risk(float(stag) if np.isfinite(stag) else 0.0)},
            })
        out.append({"station": _station_meta(sid, la, lo, c["reg"]), "hours": hours})
    return out


@router.get("/graph/edges")
def graph_edges(wind_deg: float = Query(315, ge=0, le=360), wind_speed_ms: float = 3.0, as_of: str | None = None):
    """Model graph edges weighted for a uniform wind blowing FROM `wind_deg` (same formula the model uses)."""
    c = _ctx(as_of)
    g = c["graph"]
    src, dst = map(np.array, g["edge_index"])
    lat = np.array(g["station_lat"] + g["fire_lat"])
    lon = np.array(g["station_lon"] + g["fire_lon"])
    ids = list(g["station_ids"]) + list(g["fire_node_ids"])
    rad = math.radians(wind_deg)
    u = np.full(len(src), -wind_speed_ms * math.sin(rad))
    v = np.full(len(src), -wind_speed_ms * math.cos(rad))
    sin_b, cos_b = np.array(g["sin_b"]), np.array(g["cos_b"])
    is_fire = (np.array(g["edge_type"]) == FIRE_EDGE).astype(float)
    w = edge_weights(u, v, sin_b, cos_b, np.array(g["decay"]), is_fire)
    align = (u * sin_b + v * cos_b) / wind_speed_ms
    out = []
    for kind in (0.0, 1.0):  # normalise station and fire edges separately (different distance scales)
        m = is_fire == kind
        if not m.any():
            continue
        wn = w[m] / max(w[m].max(), 1e-9)
        for e, wt in zip(np.where(m)[0], wn):
            if wt >= 0.1:
                s, t = int(src[e]), int(dst[e])
                out.append({"id": f"edge-{ids[s]}-{ids[t]}", "source_id": ids[s], "target_id": ids[t],
                            "source_coords": [float(lat[s]), float(lon[s])], "target_coords": [float(lat[t]), float(lon[t])],
                            "weight": round(float(wt), 3), "wind_alignment": round(float(align[e]), 3),
                            "distance_km": round(float(g["dist_km"][e]), 1)})
    return out


@router.get("/alerts")
def alerts(as_of: str | None = None):
    c = _ctx(as_of)
    fc, fcw, t0 = c["fc"], c["fcw"], c["t0"]
    meta = {s["id"]: s for s in stations(as_of) if not s["isBoundaryNode"]}
    df = fc.dropna(subset=["aqi"]).copy()
    df = df[df["aqi"] > 200]  # Poor or worse
    n_fires = len(c["fires"])
    out = []
    for zone, zdf in df.assign(zone=df["station_id"].map(lambda s: meta[s]["zone"])).groupby("zone"):
        peak = zdf.loc[zdf["aqi"].idxmax()]
        sid, k = peak["station_id"], int(peak["lead_hour"])
        n = c["sids"].index(sid)
        first = zdf.sort_values("lead_hour").iloc[0]
        # BLH from the observed value at the forecast start through the peak hour
        blh_series = pd.concat([pd.Series([c["prior"]["blh"].iloc[-1, n]]), fcw["blh"].iloc[:k, n]]).dropna()
        pm_ratio = peak["pm25"] / peak["pm10"] if peak["pm10"] else float("nan")
        grap = _grap(float(peak["aqi"]))
        worst = CATEGORY[str(peak["category"])]
        severity = "severe" if worst == "Severe" else "critical" if worst == "Very Poor" else "warning"
        names = [meta[s]["name"] for s in zdf.groupby("station_id")["aqi"].max().sort_values(ascending=False).index]
        out.append({
            "id": f"alert-{zone.lower().replace(' ', '-')}-{c['t0']:%Y%m%d%H}",
            "severity": severity,
            "title": f"{worst} AQI forecast — {zone} {'Delhi' if not zone.startswith('NCR') else ''}".strip(),
            "subtitle": f"AQI forecast to reach {peak['aqi']:.0f} ({worst}) at {meta[sid]['name']} by +{k}h",
            "region": f"{zone} ({', '.join(names[:4])})",
            "start_time": f"Expected: +{int(first['lead_hour'])}h to +{int(zdf['lead_hour'].max())}h "
                          f"(onset {_ist(pd.Timestamp(first['valid_time']))})",
            "lead_time_hours": int(first["lead_hour"]),
            "peak_aqi": int(round(float(peak["aqi"]))),
            "grap_stage": grap,
            "causal_drivers": {
                "pblh_drop": int(max(0.0, float(blh_series.max()) - float(peak["blh"]))) if len(blh_series) else 0,
                "wind_speed": round(float(peak["wind_speed"]), 2),
                "inversion_index": int(round(100 * float(peak["stagnation_index"]))),
                "fire_influence": int(round(float(c["fire_pct"][k, n]))),
                "accumulation_stations": names[:8],
                "narrative": (
                    f"Forecast issued {_ist(t0)} for {meta[sid]['name']}: boundary-layer height "
                    f"{float(blh_series.max()) if len(blh_series) else float(peak['blh']):.0f} m → {float(peak['blh']):.0f} m by +{k}h, "
                    f"surface wind {float(peak['wind_speed']):.1f} m/s, ventilation coefficient "
                    f"{float(peak['ventilation_coef']):,.0f} m²/s (below 6,000 m²/s = poor dispersion). "
                    f"{n_fires} FIRMS fire detections in Punjab/Haryana in the previous 24 h; upwind fire influence "
                    f"{c['fire_pct'][k, n]:.0f}/100. AERIS corrects the CAMS PM2.5 baseline of "
                    f"{float(peak['cams_pm25']):.0f} µg/m³ to {float(peak['pm25']):.0f} µg/m³."),
                "chemical_factor": f"PM2.5/PM10 ratio {pm_ratio:.2f} at the forecast peak; PM2.5 {float(peak['pm25']):.0f} µg/m³.",
                "meteorological_factor": f"Ventilation coefficient {float(peak['ventilation_coef']):,.0f} m²/s and stagnation index "
                                         f"{float(peak['stagnation_index']):.2f} at the peak hour.",
            },
            "action_recommendations": GRAP_ACTIONS[grap],
        })
    order = {"severe": 0, "critical": 1, "warning": 2}
    return sorted(out, key=lambda a: (order[a["severity"]], -a["peak_aqi"]))


@router.get("/inversion-fire")
def inversion_fire(as_of: str | None = None, max_hotspots: int = Query(400, ge=1, le=5000)):
    c = _ctx(as_of)
    t0, K, fcw, prior, fires = c["t0"], c["K"], c["fcw"], c["prior"], c["fires"]
    hot = fires.sort_values("frp", ascending=False).head(max_hotspots)
    hotspots = [{"id": f"fire-{i}", "lat": round(float(r.lat), 4), "lon": round(float(r.lon), 4),
                 "brightness": _num(getattr(r, "brightness", float("nan"))),
                 "frp": _num(r.frp), "confidence": {"n": "nominal", "h": "high"}.get(str(getattr(r, "confidence", "")), "n/a"),
                 "acq_time": pd.Timestamp(r.timestamp).isoformat(),
                 "district": f"cell {r.lat:.1f}°N {r.lon:.1f}°E", "state": _fire_state(r.lat, r.lon)}
                for i, r in enumerate(hot.itertuples())]

    # plume paths: 1-degree fire cells, advected hourly with the station-mean forecast wind;
    # only returned when that wind actually brings them within 30 km of Delhi inside 72 h
    plumes = []
    if len(fires):
        f = fires.assign(clat=(np.floor(fires.lat) + 0.5), clon=(np.floor(fires.lon) + 0.5))
        cells = f.groupby(["clat", "clon"]).agg(frp=("frp", "sum"), n=("frp", "size")).reset_index()
        cells = cells[cells["n"] >= 20].sort_values("frp", ascending=False).head(6)
        um, vm = np.nanmean(fcw["u10"].to_numpy(), 1), np.nanmean(fcw["v10"].to_numpy(), 1)
        for r in cells.itertuples():
            la, lo, pts, eta = float(r.clat), float(r.clon), [[float(r.clat), float(r.clon)]], None
            for k in range(K):
                la += vm[k] * 3600 / 111_000
                lo += um[k] * 3600 / (111_000 * math.cos(math.radians(la)))
                if (k + 1) % 3 == 0:
                    pts.append([round(la, 3), round(lo, 3)])
                if haversine_km(la, lo, *DELHI) < 30:
                    eta = k + 1
                    pts.append([round(la, 3), round(lo, 3)])
                    break
            if eta is None:
                continue
            frp = float(r.frp)
            plumes.append({"source_id": f"plume-{r.clat:.1f}-{r.clon:.1f}",
                           "source_name": f"Fire cluster {r.clat:.1f}°N {r.clon:.1f}°E ({_fire_state(r.clat, r.clon)}, {int(r.n)} detections)",
                           "points": pts, "current_wind_speed_kmh": round(float(math.hypot(um[0], vm[0]) * 3.6), 1),
                           "eta_delhi_hours": int(eta),
                           "plume_intensity": "Light" if frp < 200 else "Moderate" if frp < 800 else "Heavy" if frp < 2000 else "Extreme",
                           "corridor_bearing_deg": round(float(bearing_deg(r.clat, r.clon, *DELHI)), 0)})

    # the dashboard plots `score` as the Inversion Index and `fire_flux` as upwind fire influence
    trend = [{"hour": 0, "score": _num(100 * np.nanmean(prior["stagnation_index"].to_numpy()[-1]), 0),
              "fire_flux": _num(np.nanmean(c["fire_pct"][0]), 0),
              "pblh": _num(np.nanmean(prior["blh"].to_numpy()[-1]), 0),
              "ventilation": _num(np.nanmean(prior["ventilation_coef"].to_numpy()[-1]), 0)}]
    trend += [{"hour": k, "score": _num(100 * np.nanmean(fcw["stagnation_index"].loc[k].to_numpy()), 0),
               "fire_flux": _num(np.nanmean(c["fire_pct"][k]), 0),
               "pblh": _num(np.nanmean(fcw["blh"].loc[k].to_numpy()), 0),
               "ventilation": _num(np.nanmean(fcw["ventilation_coef"].loc[k].to_numpy()), 0)} for k in range(1, K + 1)]
    return {"hotspots": hotspots, "plumes": plumes, "fireInfluenceTrend": trend}


@router.get("/track-record")
def track_record():
    p = config.DATA_PROCESSED / "track_record.json"
    if not p.exists():
        raise HTTPException(503, "track_record.json not built yet (run the evaluation export)")
    tr = json.loads(p.read_text())
    return {"records": tr["records"], "stats": tr["stats"], "test_period": tr["test_period"],
            "n_forecasts": tr["n_forecasts"], "run_id": tr["run_id"]}


def _sources(c: dict) -> list[dict]:
    import pyarrow.parquet as pq
    obs_rows = pq.ParquetFile(config.FEATURES_FILE).metadata.num_rows
    cams_chunks = len(list(config.RAW_CAMS.glob("cams_fc_*.zip")))
    fires_path = config.DATA_PROCESSED / "fire_detections.parquet"
    n_fire = pq.ParquetFile(fires_path).metadata.num_rows if fires_path.exists() else 0
    t0 = c["t0"]
    mode = "historical replay" if c["as_of"] else "latest processed data"
    return [
        {"id": "src-ground", "name": "CPCB station network", "source_org": "CPCB / DPCC / IMD via data.opencity.in, Kaggle, OpenAQ",
         "type": "Ground Sensors", "frequency": "Hourly (15-min averaged)", "last_updated": f"{_ist(t0)} ({mode})",
         "latency_note": "56 Delhi-NCR stations, 2015-2025 (2023 unavailable)", "status": "operational",
         "records_processed": f"{obs_rows:,} station-hours"},
        {"id": "src-weather", "name": "ERA5 reanalysis", "source_org": "ECMWF via Open-Meteo archive + Copernicus CDS",
         "type": "Numerical Weather", "frequency": "Hourly", "last_updated": f"{_ist(t0)} ({mode})",
         "latency_note": "Temperature, wind, humidity, boundary-layer height per station", "status": "operational",
         "records_processed": "27 grid cells x 2015-2025"},
        {"id": "src-fire", "name": "NASA FIRMS VIIRS 375 m", "source_org": "NASA LANCE / FIRMS",
         "type": "Satellite Fire", "frequency": "Several passes per day", "last_updated": f"{_ist(t0)} ({mode})",
         "latency_note": f"{len(c['fires'])} detections in the 24 h before the forecast", "status": "operational",
         "records_processed": f"{n_fire:,} detections over Punjab + Haryana"},
        {"id": "src-cams", "name": "CAMS global composition forecast", "source_org": "Copernicus Atmosphere Monitoring Service (ECMWF)",
         "type": "Global Chemistry", "frequency": "Daily 00 UTC run, 72 h used", "last_updated": f"run of {_ist(t0 - pd.Timedelta(hours=12))}",
         "latency_note": "Physics baseline AERIS corrects; archive still downloading for older years",
         "status": "operational", "records_processed": f"{cams_chunks} archive chunks on Drive"},
    ]


@router.get("/system-status")
def system_status(as_of: str | None = None):
    c = _ctx(as_of)
    return {"sources": _sources(c), "lastFastRefresh": c["computed_at"].tz_convert(config.LOCAL_TZ).strftime("%H:%M:%S")}


@router.post("/refresh")
def refresh(as_of: str | None = None):
    for k in [k for k in _cache if k and k[0] == "ctx"]:
        _cache.pop(k)
    from backend.main import _current_forecast
    _current_forecast(force=True, as_of=as_of or DEFAULT_AS_OF)
    c = _ctx(as_of)
    return {"success": True, "message": f"Forecast recomputed from processed data (issued {_ist(c['t0'])}).",
            "updatedSources": _sources(c), "refreshedAt": c["computed_at"].tz_convert(config.LOCAL_TZ).strftime("%H:%M:%S")}
