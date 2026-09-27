"""ERA5 boundary-layer height straight from the Copernicus Climate Data Store (CDS).

Fallback for hours where Open-Meteo's archive has no BLH. Verified 2026-09-27: Jan-Jun
2024 is missing there for every model option (default, era5, era5_seamless, ecmwf_ifs).
Open-Meteo's archive BLH is itself ERA5, so this fills the gap from the same source.

Uses the same ECMWF account/key as ADS (ADS_KEY); the ERA5 licence must be accepted once
on the CDS website. ERA5 is disk-resident, so requests are fast.

Usage:
    python -m data_pipeline.ingest_era5 2024-01-01 2024-07-31
"""

from __future__ import annotations

import argparse
from pathlib import Path

import pandas as pd
import xarray as xr

import config
from data_pipeline.common import load_stations, write_raw

CDS_URL = "https://cds.climate.copernicus.eu/api"
DATASET = "reanalysis-era5-single-levels"


def _area() -> list[float]:
    w, s, e, n = config.DELHI_NCR_BBOX
    return [n + 0.5, w - 0.5, s - 0.5, e + 0.5]  # [N, W, S, E], one 0.25 deg cell of padding+


def build_request(start: str, end: str) -> dict:
    days = pd.date_range(start, end, freq="D")
    return {
        "product_type": ["reanalysis"],
        "variable": ["boundary_layer_height"],
        "year": sorted({f"{d:%Y}" for d in days}),
        "month": sorted({f"{d:%m}" for d in days}),
        "day": sorted({f"{d:%d}" for d in days}),
        "time": [f"{h:02d}:00" for h in range(24)],
        "area": _area(),
        "data_format": "netcdf",
        "download_format": "unarchived",
    }


def fetch_blh(start: str, end: str) -> Path:
    """Download raw ERA5 BLH NetCDF for [start, end] (never overwritten, atomic)."""
    import cdsapi
    config.ensure_dirs()
    path = config.RAW_ERA5 / f"era5_blh_{start}_{end}.nc"
    if path.exists():
        return path
    part = path.with_suffix(".nc.part")
    cdsapi.Client(url=CDS_URL, key=config.ADS_KEY).retrieve(DATASET, build_request(start, end)).download(str(part))
    part.replace(path)
    print(f"[era5] wrote {path.name}")
    return path


def to_station_rows(path: Path, stations: pd.DataFrame, start: str, end: str) -> pd.DataFrame:
    """Bilinear interpolation to each station -> raw long rows (hour-start UTC)."""
    ds = xr.load_dataset(path)
    tdim = "valid_time" if "valid_time" in ds.dims else "time"
    ds = ds.rename({tdim: "time"}).sortby(["latitude", "longitude"])
    lat = xr.DataArray(stations["lat"].values, dims="station")
    lon = xr.DataArray(stations["lon"].values, dims="station")
    pts = ds["blh"].interp(latitude=lat, longitude=lon, method="linear")
    pts = pts.assign_coords(station=stations["station_id"].values)
    df = pts.to_dataframe(name="value").reset_index()
    df["timestamp"] = pd.to_datetime(df["time"], utc=True)
    lo, hi = pd.Timestamp(start, tz="UTC"), pd.Timestamp(end, tz="UTC") + pd.Timedelta(days=1)
    df = df[(df["timestamp"] >= lo) & (df["timestamp"] < hi)].dropna(subset=["value"])
    return pd.DataFrame({"station_id": df["station"], "timestamp": df["timestamp"],
                         "variable": "boundary_layer_height", "value": df["value"],
                         "units": "m", "source": "era5_cds"})


def run(start: str, end: str, station_ids: list[str] | None = None) -> pd.DataFrame:
    stations = load_stations()
    if station_ids is not None:
        stations = stations[stations["station_id"].isin(station_ids)]
    rows = to_station_rows(fetch_blh(start, end), stations, start, end)
    write_raw(rows, config.RAW_ERA5, f"era5_blh_{start}_{end}")
    return rows


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("start")
    ap.add_argument("end")
    a = ap.parse_args()
    run(a.start, a.end)
