"""Kaggle "Air Quality Data in India (2015-2020)" (rohanrao, CC0; compiled from CPCB)
-> raw long format, Delhi-NCR stations only.

Inputs in config.RAW_KAGGLE (downloaded once; public, no Kaggle login needed):
    stations.csv            StationId, StationName, City, State, Status
    station_hour.csv.zip    StationId, Datetime, PM2.5, PM10, NO, NO2, NOx, ..., O3, ...

Verified against the real files (2026-09-27):
* Datetime is IST and labels the END of the hour: shifting it -1 h aligns it with
  OpenAQ's hour-start series (Anand Vihar Jun 2020: corr 0.974 at -1 h vs 0.858 at 0 h),
  and it runs 2015-01-01 01:00 -> 2020-07-01 00:00. Converted here to hour-start UTC,
  the convention used everywhere else in VAAYU.
* 42 of the 56 Delhi-NCR stations listed have hourly data; dense from 2018 onward.
* NO2 is used, NOx is ignored (the chemistry target is NO2).

Usage:
    python -m data_pipeline.ingest_kaggle
"""

from __future__ import annotations

from pathlib import Path

import pandas as pd

import config
from data_pipeline.common import slugify, write_raw

NCR_CITIES = {"Delhi", "Gurugram", "Faridabad", "Noida", "Ghaziabad", "Greater Noida"}
COLUMNS = {"PM2.5": "pm25", "PM10": "pm10", "NO2": "no2", "O3": "o3"}
HOUR_END_OFFSET = pd.Timedelta(hours=1)


def ncr_stations(stations: pd.DataFrame) -> pd.DataFrame:
    ncr = stations[(stations["State"] == "Delhi") | stations["City"].isin(NCR_CITIES)].copy()
    ncr["station_id"] = ncr["StationName"].map(slugify)
    return ncr


def normalise(hourly: pd.DataFrame, stations: pd.DataFrame) -> pd.DataFrame:
    """Wide Kaggle rows -> long (station_id, timestamp UTC hour-start, variable, value)."""
    ncr = ncr_stations(stations)
    df = hourly[hourly["StationId"].isin(ncr["StationId"])]
    ist_end = pd.to_datetime(df["Datetime"], errors="coerce")
    start_utc = ((ist_end - HOUR_END_OFFSET)
                 .dt.tz_localize(config.LOCAL_TZ, ambiguous="NaT", nonexistent="NaT")
                 .dt.tz_convert("UTC"))
    ids = df["StationId"].map(ncr.set_index("StationId")["station_id"])
    long = (pd.DataFrame({"station_id": ids, "timestamp": start_utc})
            .join(df[list(COLUMNS)].rename(columns=COLUMNS).apply(pd.to_numeric, errors="coerce"))
            .melt(id_vars=["station_id", "timestamp"], var_name="variable", value_name="value")
            .dropna(subset=["timestamp", "value"]))
    long["units"] = "ug/m3"
    long["source"] = "kaggle"
    return long[["station_id", "timestamp", "variable", "value", "units", "source"]]


def run(folder: Path | None = None) -> pd.DataFrame:
    """One raw chunk per station; stations already loaded are left untouched."""
    config.ensure_dirs()
    folder = folder or config.RAW_KAGGLE
    stations = pd.read_csv(folder / "stations.csv", encoding="utf-8-sig")
    hourly = pd.read_csv(folder / "station_hour.csv.zip",
                         usecols=["StationId", "Datetime", *COLUMNS], low_memory=False)
    long = normalise(hourly, stations)

    if config.STATIONS_FILE.exists():
        known = set(pd.read_csv(config.STATIONS_FILE).station_id)
        missing = sorted(set(long["station_id"]) - known)
        if missing:
            print(f"[kaggle] {len(missing)} stations with data not in stations.csv "
                  f"(add lat/lon for them): {missing}")
    for sid, g in long.groupby("station_id"):
        write_raw(g, config.RAW_KAGGLE, f"kaggle_{sid}")
    print(f"[kaggle] {len(long):,} rows, {long['station_id'].nunique()} stations, "
          f"{long['timestamp'].min()} -> {long['timestamp'].max()}")
    return long


if __name__ == "__main__":
    run()
