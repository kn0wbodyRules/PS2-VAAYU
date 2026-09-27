"""NASA FIRMS active-fire detections over Punjab + Haryana.

History uses the science-quality (SP) archive, live pulls use near-real-time (NRT).
The area API returns at most 5 days per request, so ranges are chunked; chunks are
named deterministically so an interrupted pull resumes.

Usage:
    python -m data_pipeline.ingest_firms history 2015-01-01 2025-12-31
    python -m data_pipeline.ingest_firms latest
"""

from __future__ import annotations

import argparse
import io

import pandas as pd

import config
from data_pipeline.common import get_with_retry, pull_stamp, write_raw

BASE = "https://firms.modaps.eosdis.nasa.gov/api/area/csv"
HISTORY_SOURCE = "VIIRS_SNPP_SP"
LIVE_SOURCE = "VIIRS_SNPP_NRT"
MAX_DAYS = 5


def _url(source: str, day_range: int, date: str | None = None) -> str:
    if not config.FIRMS_MAP_KEY:
        raise RuntimeError("FIRMS_MAP_KEY missing - add it to .env")
    w, s, e, n = config.FIRE_BBOX
    url = f"{BASE}/{config.FIRMS_MAP_KEY}/{source}/{w},{s},{e},{n}/{day_range}"
    return f"{url}/{date}" if date else url


def parse_csv(text: str, source: str) -> pd.DataFrame:
    """Normalise VIIRS/MODIS columns to lat, lon, timestamp, frp, brightness, confidence."""
    if not text.strip() or text.lstrip().lower().startswith(("invalid", "error")):
        return pd.DataFrame()
    df = pd.read_csv(io.StringIO(text))
    if df.empty:
        return df
    t = df["acq_time"].astype(int).astype(str).str.zfill(4)
    out = pd.DataFrame({
        "lat": df["latitude"], "lon": df["longitude"],
        "timestamp": pd.to_datetime(df["acq_date"] + " " + t, format="%Y-%m-%d %H%M", utc=True),
        "frp": pd.to_numeric(df.get("frp"), errors="coerce"),
        "brightness": df["bright_ti4"] if "bright_ti4" in df else df.get("brightness"),
        "confidence": df["confidence"].astype(str),
        "source": source,
    })
    # VIIRS confidence is l/n/h, MODIS is 0-100: drop low-confidence detections
    conf = out["confidence"].str.lower()
    low = conf.eq("l") | (pd.to_numeric(conf, errors="coerce") < 30)
    return out[~low].reset_index(drop=True)


def fetch_history(start: str, end: str, source: str = HISTORY_SOURCE) -> None:
    config.ensure_dirs()
    day = pd.Timestamp(start)
    last = pd.Timestamp(end)
    while day <= last:
        n = min(MAX_DAYS, (last - day).days + 1)
        tag = f"firms_{source}_{day:%Y-%m-%d}_{n}d"
        if not (config.RAW_FIRMS / f"{tag}.parquet").exists():
            resp = get_with_retry(_url(source, n, f"{day:%Y-%m-%d}"))
            df = parse_csv(resp.text, source)
            if df.empty:  # still mark the window as done so resumes skip it
                df = pd.DataFrame(columns=["lat", "lon", "timestamp", "frp", "brightness",
                                           "confidence", "source"])
                (config.RAW_FIRMS / f"{tag}.parquet").parent.mkdir(parents=True, exist_ok=True)
                df.to_parquet(config.RAW_FIRMS / f"{tag}.parquet", index=False)
            else:
                write_raw(df, config.RAW_FIRMS, tag)
        day += pd.Timedelta(days=n)


def fetch_latest(days: int = 1) -> pd.DataFrame:
    config.ensure_dirs()
    df = parse_csv(get_with_retry(_url(LIVE_SOURCE, days)).text, LIVE_SOURCE)
    write_raw(df, config.RAW_FIRMS, f"firms_{LIVE_SOURCE}_{pull_stamp()}")
    return df


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("mode", choices=["history", "latest"])
    ap.add_argument("start", nargs="?")
    ap.add_argument("end", nargs="?")
    a = ap.parse_args()
    fetch_history(a.start, a.end) if a.mode == "history" else fetch_latest()
