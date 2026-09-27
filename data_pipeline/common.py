"""Shared helpers for ingestion jobs: HTTP with retry, append-only raw writes, station registry."""

from __future__ import annotations

import re
import time
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd
import requests

import config

RAW_COLUMNS = ["station_id", "timestamp", "variable", "value", "units", "source"]


def get_with_retry(url: str, params: dict | None = None, headers: dict | None = None,
                   retries: int = 5, backoff: float = 2.0, timeout: int = 60) -> requests.Response:
    """GET with exponential backoff on 5xx, 408 and connection errors.

    429 (rate limited) waits for the server's reset window (Retry-After or
    X-Ratelimit-Reset) and does not count against `retries`, so long pulls survive
    hitting an hourly quota.
    """
    attempt = 0
    while attempt < retries:
        try:
            resp = requests.get(url, params=params, headers=headers, timeout=timeout)
        except requests.RequestException:
            if attempt == retries - 1:
                raise
        else:
            if resp.status_code == 429:
                wait = next((resp.headers[h] for h in ("Retry-After", "X-Ratelimit-Reset")
                             if resp.headers.get(h, "").isdigit()), "60")
                print(f"[http] rate limited, sleeping {int(wait) + 1}s", flush=True)
                time.sleep(int(wait) + 1)
                continue
            if resp.status_code >= 500 or resp.status_code == 408:  # 408: server-side timeout
                if attempt == retries - 1:
                    resp.raise_for_status()
                time.sleep(backoff ** attempt)
                attempt += 1
                continue
            resp.raise_for_status()
            return resp
        time.sleep(backoff ** attempt)
        attempt += 1
    raise RuntimeError(f"unreachable: {url}")


def write_raw(df: pd.DataFrame, folder: Path, name: str) -> Path | None:
    """Write a raw chunk. Raw data is never overwritten: an existing file is left untouched."""
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / f"{name}.parquet"
    if path.exists():
        print(f"[raw] exists, skipping: {path.name}")
        return None
    if df.empty:
        print(f"[raw] nothing to write for {name}")
        return None
    tmp = path.with_suffix(".parquet.tmp")  # atomic: a killed run never leaves a partial chunk
    df.to_parquet(tmp, index=False)
    tmp.replace(path)
    print(f"[raw] wrote {len(df):,} rows -> {path}")
    return path


def pull_stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


OPERATORS = r"(dpcc|cpcb|imd|iitm|uppcb|hspcb)"


def slugify(name: str) -> str:
    """Canonical station_id from a station name, shared by every source so they join.

    The operator is kept: "Pusa IMD" and "Pusa DPCC" (or Lodhi Road IMD / IITM) are
    different monitors. Both naming styles map to the same id:
        "ITO, New Delhi - CPCB" (OpenAQ, CPCB feeds)  -> "ito_cpcb"
        "ITO CPCB"              (opencity file names) -> "ito_cpcb"
    """
    s = name.lower().strip()
    m = re.search(rf"\s*-\s*{OPERATORS}\b.*$", s)          # "<site>, <city> - <OP>"
    op = m.group(1) if m else None
    if m:
        s = s[:m.start()]
        s = re.sub(r",\s*[^,]*$", "", s) if "," in s else s  # drop ", <city>"
    else:
        m = re.search(rf"[\s,]+{OPERATORS}\s*$", s)         # "<site> <OP>"
        if m:
            op, s = m.group(1), s[:m.start()]
    s = re.sub(r",?\s*(new\s+)?delhi\b", "", s)
    s = re.sub(r"[^a-z0-9]+", "_", s).strip("_")
    return f"{s}_{op}" if op else s


def load_stations() -> pd.DataFrame:
    """Canonical station registry: station_id, name, lat, lon (+ optional source ids)."""
    if not config.STATIONS_FILE.exists():
        raise FileNotFoundError(
            f"{config.STATIONS_FILE} not found. Run data_pipeline.ingest_openaq.fetch_locations() "
            "first, or create it by hand with columns station_id,name,lat,lon.")
    df = pd.read_csv(config.STATIONS_FILE)
    return df.dropna(subset=["lat", "lon"]).reset_index(drop=True)


def to_utc(ts, local_tz: str | None = None) -> pd.Series:
    ts = pd.to_datetime(ts)
    if getattr(ts.dt, "tz", None) is None:
        ts = ts.dt.tz_localize(local_tz or "UTC", ambiguous="NaT", nonexistent="NaT")
    return ts.dt.tz_convert("UTC")
