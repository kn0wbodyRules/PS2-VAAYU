"""OpenAQ v3 ingestion: station registry + hourly pollutant values (history and live).

This is the critical-path live bridge: opencity.in ground truth stops in 2023, so
everything after that depends on this feed (data.gov.in is the backup).

Usage:
    python -m data_pipeline.ingest_openaq locations
    python -m data_pipeline.ingest_openaq hours 2024-01-01 2024-02-01
"""

from __future__ import annotations

import argparse
import time

import pandas as pd

import config
from data_pipeline.common import get_with_retry, pull_stamp, slugify, write_raw

BASE = "https://api.openaq.org/v3"
# OpenAQ parameter name -> our variable name (NO2, not NOx)
PARAMS = {"pm25": "pm25", "pm10": "pm10", "o3": "o3", "no2": "no2"}
REQUEST_PAUSE_S = 1.85  # stay under both limits: 60 requests/min and 2000 requests/hour
WINDOW_DAYS = 90        # deep pagination over multi-year ranges times out (HTTP 408) - query in windows


def _headers() -> dict:
    if not config.OPENAQ_API_KEY:
        raise RuntimeError("OPENAQ_API_KEY missing - add it to .env")
    return {"X-API-Key": config.OPENAQ_API_KEY}


def _paged(path: str, params: dict) -> list[dict]:
    out, page = [], 1
    while True:
        resp = get_with_retry(f"{BASE}{path}", params={**params, "limit": 1000, "page": page},
                              headers=_headers())
        results = resp.json().get("results", [])
        out.extend(results)
        time.sleep(REQUEST_PAUSE_S)
        if len(results) < 1000:
            return out
        page += 1


def parse_locations(results: list[dict]) -> pd.DataFrame:
    """One row per (location, sensor) for the pollutants we use."""
    rows = []
    for loc in results:
        coords = loc.get("coordinates") or {}
        for sensor in loc.get("sensors", []):
            pname = (sensor.get("parameter") or {}).get("name")
            if pname not in PARAMS:
                continue
            rows.append({
                "station_id": slugify(loc.get("name", str(loc["id"]))),
                "name": loc.get("name"),
                "lat": coords.get("latitude"),
                "lon": coords.get("longitude"),
                "openaq_location_id": loc["id"],
                "provider": (loc.get("provider") or {}).get("name"),
                "sensor_id": sensor["id"],
                "variable": PARAMS[pname],
                "units": (sensor.get("parameter") or {}).get("units"),
            })
    return pd.DataFrame(rows)


def fetch_locations() -> pd.DataFrame:
    """Discover Delhi-NCR locations, write the sensor table and the canonical station registry."""
    config.ensure_dirs()
    w, s, e, n = config.DELHI_NCR_BBOX
    sensors = parse_locations(_paged("/locations", {"bbox": f"{w},{s},{e},{n}"}))
    sensors.to_parquet(config.RAW_OPENAQ / "sensors.parquet", index=False)

    stations = (sensors.groupby("station_id", as_index=False)
                .agg(name=("name", "first"), lat=("lat", "first"), lon=("lon", "first"),
                     openaq_location_id=("openaq_location_id", "first"),
                     variables=("variable", lambda v: ",".join(sorted(set(v))))))
    if config.STATIONS_FILE.exists():
        # keep hand edits / stations from other sources; only add new ones
        existing = pd.read_csv(config.STATIONS_FILE)
        stations = pd.concat([existing, stations[~stations.station_id.isin(existing.station_id)]])
    stations.to_csv(config.STATIONS_FILE, index=False)
    print(f"[openaq] {sensors.sensor_id.nunique()} sensors at {len(stations)} stations")
    return sensors


def parse_hours(results: list[dict], station_id: str, variable: str) -> pd.DataFrame:
    rows = []
    for r in results:
        period = r.get("period") or {}
        ts = ((period.get("datetimeFrom") or {}).get("utc"))
        if ts is None or r.get("value") is None:
            continue
        rows.append({"station_id": station_id, "timestamp": ts, "variable": variable,
                     "value": float(r["value"]), "units": (r.get("parameter") or {}).get("units"),
                     "source": "openaq"})
    df = pd.DataFrame(rows)
    if not df.empty:
        df["timestamp"] = pd.to_datetime(df["timestamp"], utc=True)
    return df


def _utc(t) -> pd.Timestamp:
    t = pd.Timestamp(t)
    return t.tz_localize("UTC") if t.tzinfo is None else t.tz_convert("UTC")


def sensor_span(sensor_id: int) -> tuple[pd.Timestamp | None, pd.Timestamp | None]:
    """First/last hour a sensor has data (one request), so dead ranges are never paged."""
    resp = get_with_retry(f"{BASE}/sensors/{sensor_id}", headers=_headers())
    time.sleep(REQUEST_PAUSE_S)
    res = (resp.json().get("results") or [{}])[0]
    first = (res.get("datetimeFirst") or {}).get("utc")
    last = (res.get("datetimeLast") or {}).get("utc")
    return (pd.Timestamp(first) if first else None, pd.Timestamp(last) if last else None)


def _windows(start: str, end: str, days: int = WINDOW_DAYS):
    a, b = _utc(start), _utc(end)
    while a < b:
        nxt = min(a + pd.Timedelta(days=days), b)
        yield a.isoformat().replace("+00:00", "Z"), nxt.isoformat().replace("+00:00", "Z")
        a = nxt


def fetch_hours(start: str, end: str, live: bool = False,
                sensor_ids: list[int] | None = None) -> pd.DataFrame:
    """Hourly values for every known sensor (or just `sensor_ids`) in [start, end),
    one raw chunk per sensor.

    Historical chunks have deterministic names, so an interrupted multi-year pull
    resumes where it stopped. Live pulls carry a pull timestamp instead.
    """
    config.ensure_dirs()
    sensors_file = config.RAW_OPENAQ / "sensors.parquet"
    sensors = pd.read_parquet(sensors_file) if sensors_file.exists() else fetch_locations()
    if sensor_ids is not None:
        sensors = sensors[sensors["sensor_id"].isin(sensor_ids)]
    frames = []
    for s in sensors.itertuples():
        tag = f"openaq_{s.sensor_id}_{start[:10]}_{end[:10]}"
        if live:
            tag += f"_{pull_stamp()}"
        elif (config.RAW_OPENAQ / f"{tag}.parquet").exists():
            continue
        lo, hi = _utc(start), _utc(end)
        if not live:  # clip to the sensor's own data span; skip sensors dead in [start, end)
            first, last = sensor_span(s.sensor_id)
            if first is None or first > hi or last < lo:
                continue
            lo, hi = max(first.floor("h"), lo), min(last.ceil("h") + pd.Timedelta(hours=1), hi)
        results = []
        for w0, w1 in _windows(lo, hi):
            results += _paged(f"/sensors/{s.sensor_id}/hours",
                              {"datetime_from": w0, "datetime_to": w1})
        df = parse_hours(results, s.station_id, s.variable)
        if not df.empty:
            df = df.drop_duplicates(["timestamp"])  # windows share their boundary hour
        write_raw(df, config.RAW_OPENAQ, tag)
        frames.append(df)
    return pd.concat(frames, ignore_index=True) if frames else pd.DataFrame()


def fetch_latest(hours_back: int = 3) -> pd.DataFrame:
    """Hourly cron entry point: pull the last few hours for every sensor."""
    now = pd.Timestamp.now(tz="UTC").floor("h")
    return fetch_hours((now - pd.Timedelta(hours=hours_back)).isoformat(), now.isoformat(), live=True)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("mode", choices=["locations", "hours", "latest"])
    ap.add_argument("start", nargs="?")
    ap.add_argument("end", nargs="?")
    a = ap.parse_args()
    if a.mode == "locations":
        fetch_locations()
    elif a.mode == "hours":
        fetch_hours(a.start, a.end)
    else:
        fetch_latest()
