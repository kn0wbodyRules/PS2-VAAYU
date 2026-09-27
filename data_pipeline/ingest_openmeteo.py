"""Open-Meteo ingestion (no API key needed).

Three pulls, all per station coordinate:

* ``archive``  - ERA5 reanalysis 2017+ (archive-api). This is the weather *ground truth*
                 the met head is trained against, including ``boundary_layer_height``
                 (verified non-null for Delhi in the archive API).
* ``forecast`` - live hourly forecast (api.open-meteo.com), used when serving.
* ``previous`` - Previous Runs API (lead-time-resolved forecast archive). Only usable as a
                 training baseline from ~2024, and it returns no boundary_layer_height, so
                 it is the optional ``MET_BASELINE_SOURCE="openmeteo"`` path, not the default.

Usage:
    python -m data_pipeline.ingest_openmeteo archive 2015-01-01 2025-12-31
    python -m data_pipeline.ingest_openmeteo forecast
    python -m data_pipeline.ingest_openmeteo previous 2024-01-01 2024-12-31
"""

from __future__ import annotations

import argparse
import time

import pandas as pd

import config
from data_pipeline.common import get_with_retry, load_stations, pull_stamp, write_raw

ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"
FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
PREVIOUS_URL = "https://previous-runs-api.open-meteo.com/v1/forecast"

HOURLY = ["temperature_2m", "relative_humidity_2m", "wind_speed_10m", "wind_direction_10m",
          "boundary_layer_height", "shortwave_radiation", "surface_pressure"]
PREVIOUS_DAYS = (1, 2, 3)  # forecasts made 24/48/72 h before valid time


def _base_params() -> dict:
    return {"wind_speed_unit": "ms", "timezone": "GMT"}


def parse_hourly(payload: dict, station_id: str, source: str) -> pd.DataFrame:
    hourly = payload.get("hourly") or {}
    if "time" not in hourly:
        return pd.DataFrame()
    df = pd.DataFrame(hourly)
    df["timestamp"] = pd.to_datetime(df.pop("time"), utc=True)
    long = df.melt(id_vars="timestamp", var_name="variable", value_name="value").dropna()
    units = payload.get("hourly_units", {})
    long["units"] = long["variable"].map(units)
    long["station_id"] = station_id
    long["source"] = source
    return long[["station_id", "timestamp", "variable", "value", "units", "source"]]


def _year_chunks(start: str, end: str):
    s, e = pd.Timestamp(start), pd.Timestamp(end)
    while s <= e:
        ce = min(pd.Timestamp(year=s.year, month=12, day=31), e)
        yield s.strftime("%Y-%m-%d"), ce.strftime("%Y-%m-%d")
        s = ce + pd.Timedelta(days=1)


GRID_MAP_FILE = "archive_grid_map.csv"
REQUEST_PAUSE_S = 0.5


def grid_map(stations: pd.DataFrame) -> pd.DataFrame:
    """station_id -> the reanalysis grid cell Open-Meteo actually serves for it.

    One tiny request per station, cached on Drive. The archive is gridded (ERA5 0.25 deg /
    ERA5-Land 0.1 deg), so many Delhi stations share a cell; pulling each cell once keeps
    the multi-year pull inside the free tier (a >2-week request counts as several calls).
    """
    path = config.RAW_OPENMETEO / GRID_MAP_FILE
    cached = pd.read_csv(path) if path.exists() else pd.DataFrame(columns=["station_id", "grid_lat", "grid_lon"])
    todo = stations[~stations["station_id"].isin(cached["station_id"])]
    rows = []
    for st in todo.itertuples():
        resp = get_with_retry(ARCHIVE_URL, params={
            **_base_params(), "latitude": st.lat, "longitude": st.lon,
            "start_date": "2020-01-01", "end_date": "2020-01-01", "hourly": "temperature_2m"})
        p = resp.json()
        rows.append({"station_id": st.station_id, "grid_lat": p["latitude"], "grid_lon": p["longitude"]})
        time.sleep(REQUEST_PAUSE_S)
    out = pd.concat([cached, pd.DataFrame(rows)], ignore_index=True)
    out.to_csv(path, index=False)
    return out[out["station_id"].isin(stations["station_id"])]


def fetch_archive(start: str, end: str, station_ids: list[str] | None = None) -> None:
    """ERA5 archive, pulled once per grid cell per year and copied to every station in it."""
    config.ensure_dirs()
    stations = load_stations()
    if station_ids is not None:
        stations = stations[stations["station_id"].isin(station_ids)]
    cells = grid_map(stations)
    groups = cells.groupby(["grid_lat", "grid_lon"])["station_id"].apply(list)
    print(f"[openmeteo] {len(cells)} stations -> {len(groups)} grid cells")
    for (glat, glon), members in groups.items():
        for cs, ce in _year_chunks(start, end):
            tag = f"archive_cell_{glat:.3f}_{glon:.3f}_{cs}_{ce}"
            if (config.RAW_OPENMETEO / f"{tag}.parquet").exists():
                continue
            resp = get_with_retry(ARCHIVE_URL, params={
                **_base_params(), "latitude": glat, "longitude": glon,
                "start_date": cs, "end_date": ce, "hourly": ",".join(HOURLY)})
            one = parse_hourly(resp.json(), members[0], "openmeteo_archive")
            write_raw(pd.concat([one.assign(station_id=m) for m in members], ignore_index=True),
                      config.RAW_OPENMETEO, tag)
            time.sleep(REQUEST_PAUSE_S)


def fetch_forecast(days: int = 4) -> pd.DataFrame:
    """Live forecast. issue_time is recorded as the pull hour (Open-Meteo does not expose it)."""
    config.ensure_dirs()
    issue = pd.Timestamp.now(tz="UTC").floor("h")
    frames = []
    for st in load_stations().itertuples():
        resp = get_with_retry(FORECAST_URL, params={
            **_base_params(), "latitude": st.lat, "longitude": st.lon,
            "forecast_days": days, "past_days": 1, "hourly": ",".join(HOURLY)})
        frames.append(parse_hourly(resp.json(), st.station_id, "openmeteo_forecast"))
    df = pd.concat(frames, ignore_index=True)
    df["issue_time"] = issue
    write_raw(df, config.RAW_OPENMETEO, f"forecast_{pull_stamp()}")
    return df


def fetch_previous(start: str, end: str) -> None:
    """Lead-time-resolved archive: variables come back as <var>_previous_dayN."""
    config.ensure_dirs()
    fields = [f"{v}_previous_day{d}" for v in ("temperature_2m", "wind_speed_10m",
                                                 "wind_direction_10m") for d in PREVIOUS_DAYS]
    for st in load_stations().itertuples():
        for cs, ce in _year_chunks(start, end):
            tag = f"previous_{st.station_id}_{cs}_{ce}"
            if (config.RAW_OPENMETEO / f"{tag}.parquet").exists():
                continue
            resp = get_with_retry(PREVIOUS_URL, params={
                **_base_params(), "latitude": st.lat, "longitude": st.lon,
                "start_date": cs, "end_date": ce, "hourly": ",".join(fields)})
            write_raw(parse_hourly(resp.json(), st.station_id, "openmeteo_previous"),
                      config.RAW_OPENMETEO, tag)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("mode", choices=["archive", "forecast", "previous"])
    ap.add_argument("start", nargs="?")
    ap.add_argument("end", nargs="?")
    a = ap.parse_args()
    if a.mode == "archive":
        fetch_archive(a.start, a.end)
    elif a.mode == "forecast":
        fetch_forecast()
    else:
        fetch_previous(a.start, a.end)
