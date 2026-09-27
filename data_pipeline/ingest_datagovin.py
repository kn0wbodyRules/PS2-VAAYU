"""data.gov.in real-time AQI feed: backup live bridge when OpenAQ is down or lagging.

The feed is a snapshot (no history), so this must run on the hourly cron to build
up a record. Values are CPCB's reported station values, timestamped IST.

Usage:
    python -m data_pipeline.ingest_datagovin
"""

from __future__ import annotations

import pandas as pd

import config
from data_pipeline.common import get_with_retry, pull_stamp, slugify, to_utc, write_raw

RESOURCE = "https://api.data.gov.in/resource/3b01bcb8-0b14-4abf-b6f2-c1bfd384ba69"
POLLUTANTS = {"PM2.5": "pm25", "PM10": "pm10", "OZONE": "o3", "NO2": "no2"}


def parse_records(records: list[dict]) -> pd.DataFrame:
    rows = []
    for r in records:
        var = POLLUTANTS.get(str(r.get("pollutant_id", "")).upper().replace("O3", "OZONE"))
        val = r.get("pollutant_avg") if r.get("pollutant_avg") not in (None, "", "NA") else None
        if var is None or val is None:
            continue
        rows.append({"station_id": slugify(r.get("station", "")), "name": r.get("station"),
                     "lat": pd.to_numeric(r.get("latitude"), errors="coerce"),
                     "lon": pd.to_numeric(r.get("longitude"), errors="coerce"),
                     "timestamp": r.get("last_update"), "variable": var, "value": float(val),
                     "units": "ug/m3", "source": "datagovin"})
    df = pd.DataFrame(rows)
    if not df.empty:
        df["timestamp"] = to_utc(pd.to_datetime(df["timestamp"], format="%d-%m-%Y %H:%M:%S",
                                                errors="coerce"), config.LOCAL_TZ)
    return df


def fetch_latest() -> pd.DataFrame:
    if not config.DATAGOVIN_API_KEY:
        raise RuntimeError("DATAGOVIN_API_KEY missing - add it to .env")
    config.ensure_dirs()
    records, offset = [], 0
    while True:
        resp = get_with_retry(RESOURCE, params={
            "api-key": config.DATAGOVIN_API_KEY, "format": "json", "limit": 1000,
            "offset": offset, "filters[state]": "Delhi"})
        batch = resp.json().get("records", [])
        records.extend(batch)
        if len(batch) < 1000:
            break
        offset += 1000
    df = parse_records(records)
    write_raw(df, config.RAW_DATAGOVIN, f"datagovin_{pull_stamp()}")
    return df


if __name__ == "__main__":
    fetch_latest()
