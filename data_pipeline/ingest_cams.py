"""CAMS global atmospheric composition *forecasts* (Copernicus ADS).

This pulls the forecast archive, not EAC4 reanalysis: reanalysis has no forecast
drift, so training on it would never expose the day-2/day-3 bias VAAYU corrects.
Every value is keyed by (issue_time, lead_hour).

* PM2.5, PM10, 2m temperature, 10m winds, BLH, surface pressure are single-level.
* NO2 and O3 are multi-level mass mixing ratios: we take the lowest model level
  (137 from 2019-07-07, 60 before) and convert kg/kg -> ug/m3 with air density
  from surface pressure and 2m temperature.

Request sizing (verified against the ADS costing endpoint, 2026-09-27): ADS rejects
requests whose cost - the number of fields, days x runs x leads x variables - exceeds
10,000 ("cost limits exceeded"). Only the leads the model reads are pulled (12..84), and
ranges are cut into chunks that fit: ~9 days per single-level request, a month per
model-level request. Every request is cost-checked before submission.

Credentials: ADS_URL / ADS_KEY in .env, and the dataset licence must be accepted once
on the ADS website. Dates older than ~30 days are tape-resident and slow.

Usage:
    python -m data_pipeline.ingest_cams 2019-10-01 2019-10-31
"""

from __future__ import annotations

import argparse
import zipfile
from pathlib import Path

import numpy as np
import pandas as pd
import xarray as xr

import config

R_DRY = 287.05  # J/(kg K)
# NetCDF short names -> our names
SHORT_NAMES = {"pm2p5": "pm25", "pm10": "pm10", "t2m": "t2m", "u10": "u10", "v10": "v10",
               "blh": "blh", "sp": "sp", "no2": "no2", "go3": "o3"}
ADS_COST_LIMIT = 10_000
KEYS = ["station_id", "issue_time", "lead_hour", "valid_time"]


def _area() -> list[float]:
    """ADS area is [north, west, south, east]; pad one grid cell (0.4 deg) around Delhi-NCR."""
    w, s, e, n = config.DELHI_NCR_BBOX
    return [n + 0.4, w - 0.4, s - 0.4, e + 0.4]


def _client():
    import cdsapi
    if not config.ADS_KEY:
        raise RuntimeError("ADS_KEY missing - add it to .env")
    return cdsapi.Client(url=config.ADS_URL, key=config.ADS_KEY)


# --------------------------------------------------------------------------
# Requests
# --------------------------------------------------------------------------
def cams_leads() -> list[int]:
    """Only the leads the model reads: latency .. latency + horizon (12..84 by default).
    13..84 feed the 72 h forecast; 12..23 give the freshest run for history hours."""
    return list(range(config.CAMS_LATENCY_HOURS, config.CAMS_LATENCY_HOURS + config.HORIZON_HOURS + 1))


def _variables(kind: str) -> list[str]:
    if kind == "single":
        return list(config.CAMS_SINGLE_LEVEL_VARS) + ["surface_pressure"]
    return list(config.CAMS_MULTI_LEVEL_VARS)


def cost_per_day(kind: str) -> int:
    return len(config.CAMS_ISSUE_HOURS) * len(cams_leads()) * len(_variables(kind))


def build_request(kind: str, start: str, end: str) -> dict:
    req = {
        "date": [f"{start}/{end}"],
        "time": config.CAMS_ISSUE_HOURS,
        "leadtime_hour": [str(h) for h in cams_leads()],
        "type": ["forecast"],
        "area": _area(),
        "data_format": "netcdf_zip",
        "variable": _variables(kind),
    }
    if kind == "multi":
        level = "137" if pd.Timestamp(start) >= pd.Timestamp(config.CAMS_L137_START) else "60"
        req["model_level"] = [level]
    return req


def build_requests(start: str, end: str) -> list[dict]:
    """Single-level + model-level request for [start, end]. Not size-checked: use
    plan_chunks to cut a long range into requests that fit the ADS limit."""
    return [build_request("single", start, end), build_request("multi", start, end)]


def plan_chunks(start: str, end: str) -> list[tuple[str, str, str]]:
    """(kind, start, end) chunks that each fit ADS_COST_LIMIT, never crossing the 60 -> 137
    model-level change.

    Chunks run continuously across month boundaries: measured ADS time is ~1.5-3 h per
    request almost regardless of size (a 1-day request took 1.5 h, 9-day ones ~2 h), so
    month-aligned leftovers (e.g. an 11-day tail) cost a whole request's overhead."""
    out = []
    a, b = pd.Timestamp(start), pd.Timestamp(end)
    cut = pd.Timestamp(config.CAMS_L137_START)
    spans = [(a, cut - pd.Timedelta(days=1)), (cut, b)] if a < cut <= b else [(a, b)]
    for kind in ("single", "multi"):
        days = max(1, ADS_COST_LIMIT // cost_per_day(kind))
        for x, y in spans:
            while x <= y:
                z = min(x + pd.Timedelta(days=days - 1), y)
                out.append((kind, f"{x:%Y-%m-%d}", f"{z:%Y-%m-%d}"))
                x = z + pd.Timedelta(days=1)
    return out


def covered_dates(kind: str) -> set[pd.Timestamp]:
    """Dates already present on Drive for one kind, from the chunk file names."""
    out = set()
    for p in config.RAW_CAMS.glob(f"cams_fc_{kind}_*.zip"):
        try:
            a, b = (pd.Timestamp(x) for x in p.stem.split("_")[-2:])
        except ValueError:
            continue  # not a dated chunk
        out.update(pd.date_range(a, b, freq="D"))
    return out


def plan_missing(start: str, end: str) -> list[tuple[str, str, str]]:
    """plan_chunks, minus dates already downloaded (any chunk size): lets the pull resume
    after chunk sizing changes without re-requesting anything."""
    done = {k: covered_dates(k) for k in ("single", "multi")}
    out = []
    for kind, a, b in plan_chunks(start, end):
        run = []
        for d in pd.date_range(a, b, freq="D"):
            if d in done[kind]:
                if run:
                    out.append((kind, f"{run[0]:%Y-%m-%d}", f"{run[-1]:%Y-%m-%d}"))
                run = []
            else:
                run.append(d)
        if run:
            out.append((kind, f"{run[0]:%Y-%m-%d}", f"{run[-1]:%Y-%m-%d}"))
    return out


def request_cost(req: dict) -> float:
    import requests
    r = requests.post(f"{config.ADS_URL}/retrieve/v1/processes/{config.CAMS_DATASET}/costing",
                      json={"inputs": req}, headers={"PRIVATE-TOKEN": config.ADS_KEY}, timeout=60)
    r.raise_for_status()
    return float(r.json()["cost"])


def fetch_one(kind: str, start: str, end: str, client=None) -> Path:
    """Download one chunk. Existing files are never overwritten; downloads are atomic."""
    config.ensure_dirs()
    path = config.RAW_CAMS / f"cams_fc_{kind}_{start}_{end}.zip"
    if path.exists():
        return path
    req = build_request(kind, start, end)
    cost = request_cost(req)
    if cost > ADS_COST_LIMIT:
        raise ValueError(f"{path.name}: ADS cost {cost:.0f} > limit {ADS_COST_LIMIT}; shrink the chunk")
    client = client or _client()
    part = path.with_suffix(".zip.part")  # atomic: an interrupted download is never "done"
    client.retrieve(config.CAMS_DATASET, req).download(str(part))
    part.replace(path)
    print(f"[cams] wrote {path.name}", flush=True)
    return path


# --------------------------------------------------------------------------
# Fire-and-forget: submit now, collect later (e.g. from Colab while the laptop sleeps).
# ADS runs jobs server-side, so they progress without any client attached.
# --------------------------------------------------------------------------
def _api() -> str:
    return f"{config.ADS_URL}/retrieve/v1"


def _headers() -> dict:
    return {"PRIVATE-TOKEN": config.ADS_KEY}


MANIFEST = "jobs_manifest.json"


def _manifest_path() -> Path:
    return config.RAW_CAMS / MANIFEST


def read_manifest() -> dict:
    import json
    p = _manifest_path()
    return json.loads(p.read_text()) if p.exists() else {}


def _write_manifest(m: dict) -> None:
    import json
    config.RAW_CAMS.mkdir(parents=True, exist_ok=True)
    tmp = _manifest_path().with_suffix(".json.tmp")
    tmp.write_text(json.dumps(m, indent=1))
    tmp.replace(_manifest_path())


def _job_chunk(job_id: str) -> tuple[str, str, str] | None:
    import requests
    d = requests.get(f"{_api()}/jobs/{job_id}", params={"request": "true"}, headers=_headers(), timeout=60).json()
    req = ((d.get("metadata") or {}).get("request") or {}).get("ids") or {}
    if not req.get("date"):
        return None
    a, b = req["date"][0].split("/")
    return ("multi" if "model_level" in req else "single", a, b)


def register_active_jobs() -> dict:
    """Add jobs already queued/running on ADS to the manifest (so nothing is re-submitted)."""
    import requests
    m = read_manifest()
    jobs = requests.get(f"{_api()}/jobs", params={"limit": 100}, headers=_headers(), timeout=60).json()["jobs"]
    for j in jobs:
        if j["status"] in ("accepted", "running") and j["jobID"] not in m:
            c = _job_chunk(j["jobID"])
            if c:
                m[j["jobID"]] = list(c)
    _write_manifest(m)
    return m


def submit(chunks: list[tuple[str, str, str]]) -> dict:
    """Submit chunks without waiting; job IDs are recorded in the Drive manifest."""
    import requests
    m = register_active_jobs()
    pending = {tuple(v) for v in m.values()}
    for kind, a, b in chunks:
        if (kind, a, b) in pending or (config.RAW_CAMS / f"cams_fc_{kind}_{a}_{b}.zip").exists():
            continue
        req = build_request(kind, a, b)
        r = requests.post(f"{_api()}/processes/{config.CAMS_DATASET}/execution",
                          json={"inputs": req}, headers=_headers(), timeout=120)
        if r.status_code >= 400:
            print(f"[cams] submit stopped at {kind} {a}..{b}: HTTP {r.status_code} {r.text[:200]}", flush=True)
            break
        m[r.json()["jobID"]] = [kind, a, b]
        _write_manifest(m)
        print(f"[cams] submitted {kind} {a}..{b} -> {r.json()['jobID'][:8]}", flush=True)
    return m


def plan_outstanding(kind: str, start: str, end: str, manifest: dict | None = None) -> list[tuple[str, str, str]]:
    """Chunks of `kind` in [start, end] not on Drive and not already queued on ADS."""
    m = read_manifest() if manifest is None else manifest
    taken = {(k, d) for k, a, b in m.values() for d in pd.date_range(a, b)}
    out = []
    for k, a, b in plan_missing(start, end):
        if k != kind:
            continue
        run = []
        for d in pd.date_range(a, b):
            if (k, d) in taken:
                if run:
                    out.append((k, f"{run[0]:%Y-%m-%d}", f"{run[-1]:%Y-%m-%d}"))
                run = []
            else:
                run.append(d)
        if run:
            out.append((k, f"{run[0]:%Y-%m-%d}", f"{run[-1]:%Y-%m-%d}"))
    return out


MAX_ACTIVE_JOBS = 8  # ADS rejects new requests beyond ~8 queued+running per user per dataset
QUEUE_STAGES = [("single", "2025-01-01", "2025-12-31"), ("multi", "2025-01-01", "2025-12-31"),
                ("single", "2024-01-01", "2024-12-31"), ("multi", "2024-01-01", "2024-12-31"),
                ("single", "2019-10-01", "2020-02-29"), ("multi", "2019-10-01", "2020-02-29"),
                ("single", "2018-01-01", "2020-06-30"), ("multi", "2018-01-01", "2020-06-30"),
                ("single", "2015-01-01", "2017-12-31"), ("multi", "2015-01-01", "2017-12-31"),
                ("single", "2020-07-01", "2022-12-31"), ("multi", "2020-07-01", "2022-12-31")]


def ads_jobs() -> list[dict]:
    """Every job on this ADS account (all pages), each with its chunk (kind, start, end)."""
    import requests
    out, url, params = [], f"{_api()}/jobs", {"limit": 100}
    while url:
        r = requests.get(url, params=params, headers=_headers(), timeout=60).json()
        out += r.get("jobs", [])
        nxt = [l for l in r.get("links", []) if l.get("rel") == "next"]
        url, params = (nxt[0]["href"], None) if nxt else (None, None)
    for j in out:
        j["chunk"] = _job_chunk(j["jobID"]) if j.get("status") in ("accepted", "running", "successful") else None
    return out


def keep_queue_full(stages=QUEUE_STAGES, max_active: int = MAX_ACTIVE_JOBS) -> int:
    """Top the ADS queue up to `max_active`, highest-priority missing chunks first.

    Needs only the ADS key: coverage comes from ADS's own job history (successful, running,
    queued), so it can run anywhere - e.g. a scheduled GitHub Action while the laptop sleeps.
    Returns the number of new submissions."""
    import requests
    jobs = ads_jobs()
    active = sum(j["status"] in ("accepted", "running") for j in jobs)
    covered = {(k, d) for j in jobs if j["chunk"] for k, a, b in [j["chunk"]] for d in pd.date_range(a, b)}
    covered |= {(k, d) for k in ("single", "multi") for d in covered_dates(k)}  # local files, if any
    free = max(0, max_active - active)
    print(f"[cams] ADS active {active}/{max_active}, submitting up to {free}", flush=True)
    sent = 0
    for kind, start, end in stages:
        if sent >= free:
            break
        for k, a, b in plan_chunks(start, end):
            if k != kind or sent >= free:
                continue
            days = [d for d in pd.date_range(a, b) if (k, d) not in covered]
            if not days:
                continue
            a, b = f"{days[0]:%Y-%m-%d}", f"{days[-1]:%Y-%m-%d}"  # uncovered tail/head of a chunk
            r = requests.post(f"{_api()}/processes/{config.CAMS_DATASET}/execution",
                              json={"inputs": build_request(k, a, b)}, headers=_headers(), timeout=120)
            if r.status_code >= 400:
                print(f"[cams] ADS refused {k} {a}..{b}: HTTP {r.status_code} {r.text[:150]}", flush=True)
                return sent
            covered |= {(k, d) for d in pd.date_range(a, b)}
            sent += 1
            print(f"[cams] submitted {k} {a}..{b} -> {r.json()['jobID'][:8]}", flush=True)
    return sent


def collect() -> dict:
    """Download every finished job (manifest + ADS job history) whose file is missing."""
    import requests
    from collections import Counter
    m, status = read_manifest(), Counter()
    for j in ads_jobs():  # pick up jobs submitted elsewhere (GitHub Action, earlier runners)
        if j["chunk"] and j["jobID"] not in m:
            m[j["jobID"]] = list(j["chunk"])
    _write_manifest(m)
    for job_id, (kind, a, b) in list(m.items()):
        path = config.RAW_CAMS / f"cams_fc_{kind}_{a}_{b}.zip"
        if path.exists():
            status["downloaded"] += 1
            continue
        st = requests.get(f"{_api()}/jobs/{job_id}", headers=_headers(), timeout=60)
        st = st.json().get("status", "unknown") if st.ok else "unknown"
        if st == "successful":
            href = requests.get(f"{_api()}/jobs/{job_id}/results", headers=_headers(),
                                timeout=60).json()["asset"]["value"]["href"]
            part = path.with_suffix(".zip.part")
            with requests.get(href, stream=True, timeout=600) as r:
                if r.status_code in (401, 403):
                    r = requests.get(href, headers=_headers(), stream=True, timeout=600)
                r.raise_for_status()
                with open(part, "wb") as f:
                    for c in r.iter_content(1 << 20):
                        f.write(c)
            part.replace(path)
            print(f"[cams] downloaded {path.name}", flush=True)
            status["downloaded"] += 1
        else:
            status[st] += 1
    print(f"[cams] manifest status: {dict(status)}", flush=True)
    return dict(status)


def fetch(start: str, end: str) -> list[Path]:
    """All chunks (single + model level) covering [start, end]."""
    return [fetch_one(k, a, b) for k, a, b in plan_chunks(start, end)]


fetch_monthly = fetch  # backwards-compatible name


# --------------------------------------------------------------------------
# Reading raw files -> station table (used by preprocessing)
# --------------------------------------------------------------------------
def _normalise(ds: xr.Dataset) -> xr.Dataset:
    ren = {}
    for cand in ("forecast_reference_time", "time"):
        if cand in ds.dims or cand in ds.coords:
            ren[cand] = "issue_time"
            break
    for cand in ("forecast_period", "step", "leadtime_hour"):
        if cand in ds.dims or cand in ds.coords:
            ren[cand] = "lead"
            break
    ds = ds.rename(ren)
    for lvl in ("model_level", "level", "hybrid"):
        if lvl in ds.dims:
            ds = ds.isel({lvl: -1}, drop=True)  # lowest model level = largest index
    for extra in ("valid_time",):
        if extra in ds.coords and extra not in ds.dims:
            ds = ds.drop_vars(extra)
    lead = ds["lead"].values
    if np.issubdtype(lead.dtype, np.timedelta64):
        ds = ds.assign_coords(lead=(lead / np.timedelta64(1, "h")).astype(int))
    ds = ds.sortby(["latitude", "longitude"])  # CAMS latitude is descending; interp needs ascending
    return ds.rename({k: v for k, v in SHORT_NAMES.items() if k in ds.data_vars})


def open_file(path: Path) -> list[xr.Dataset]:
    """Normalised datasets (native units) from one zipped or plain NetCDF."""
    if zipfile.is_zipfile(path):
        out_dir = path.with_suffix("")
        with zipfile.ZipFile(path) as z:
            z.extractall(out_dir)
        return [_normalise(xr.load_dataset(f)) for f in sorted(out_dir.glob("*.nc"))]
    return [_normalise(xr.load_dataset(path))]


def interpolate_to_stations(ds: xr.Dataset, stations: pd.DataFrame) -> pd.DataFrame:
    """Bilinear interpolation of every field to each station's exact lat/lon (native units)."""
    lat = xr.DataArray(stations["lat"].values, dims="station")
    lon = xr.DataArray(stations["lon"].values, dims="station")
    pts = ds.interp(latitude=lat, longitude=lon, method="linear")
    pts = pts.assign_coords(station=stations["station_id"].values)
    df = pts.to_dataframe().reset_index()
    df = df.rename(columns={"station": "station_id", "lead": "lead_hour"})
    df["issue_time"] = pd.to_datetime(df["issue_time"], utc=True)
    df["valid_time"] = df["issue_time"] + pd.to_timedelta(df["lead_hour"], unit="h")
    return df[KEYS + [v for v in config.STATE_VARS + ["sp"] if v in df.columns]]


def to_physical_units(df: pd.DataFrame) -> pd.DataFrame:
    """PM kg/m3 -> ug/m3; NO2/O3 kg/kg -> ug/m3 via air density from sp and t2m; K -> degC."""
    df = df.copy()
    for v in ("pm25", "pm10"):
        if v in df:
            df[v] = df[v] * 1e9
    if "t2m" in df and "sp" in df:
        rho = df["sp"] / (R_DRY * df["t2m"])  # kg/m3, t2m still in K here
        for v in ("no2", "o3"):
            if v in df:
                df[v] = df[v] * rho * 1e9
    if "t2m" in df:
        df["t2m"] = df["t2m"] - 273.15
    return df.drop(columns=[c for c in ("sp",) if c in df])


def station_table(paths: list[Path], stations: pd.DataFrame) -> pd.DataFrame:
    """All raw chunks -> one (station, issue_time, lead_hour) table in physical units.

    Single-level and model-level chunks cover different date spans, so each is
    interpolated on its own and the two are joined on the keys before unit conversion
    (NO2/O3 need surface pressure and temperature from the single-level fields)."""
    parts = {"single": [], "multi": []}
    for p in paths:
        kind = "multi" if "_multi_" in p.name else "single"
        parts[kind] += [interpolate_to_stations(ds, stations) for ds in open_file(p)]
    frames = [pd.concat(v, ignore_index=True).drop_duplicates(KEYS) for v in parts.values() if v]
    if not frames:
        return pd.DataFrame(columns=KEYS)
    df = frames[0] if len(frames) == 1 else frames[0].merge(frames[1], on=KEYS, how="outer")
    # chunks pulled under an earlier setting may hold extra runs (e.g. 12 UTC): keep only
    # the configured ones so every period has the same forecast cadence
    hours = {int(h[:2]) for h in config.CAMS_ISSUE_HOURS}
    df = df[df["issue_time"].dt.hour.isin(hours)]
    df = to_physical_units(df).sort_values(KEYS).reset_index(drop=True)
    # stable schema: a variable whose chunks haven't been downloaded yet (e.g. model-level
    # NO2/O3 while the pull is still running) is present as NaN, never missing
    return df.reindex(columns=KEYS + config.STATE_VARS)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("start", help="YYYY-MM-DD, or 'queue' to top up the ADS queue, 'collect' to download")
    ap.add_argument("end", nargs="?")
    a = ap.parse_args()
    if a.start == "queue":
        keep_queue_full()
    elif a.start == "collect":
        collect()
    else:
        fetch(a.start, a.end)
