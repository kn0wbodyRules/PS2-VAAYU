"""Normalise data.opencity.in "Delhi Hourly Air Quality Reports" CSVs into raw long format.

The dataset (public domain, one CSV per station per period) has two different formats,
confirmed against real downloads (ITO CPCB, 2026-09-27):

* "<Station> AQI Data 2017-2023"  - AQI *index* only, one value per hour, laid out as
  month blocks: a "January-2017,00:00:00,...,23:00:00" header, then one row per day with
  24 hourly values. No pollutant concentrations. Stored as variable ``aqi_reported``
  (useful for checking our CPCB AQI calculation and category metrics; it is NOT a
  training target, since AQI cannot be inverted back to concentrations).
* "<Station> 15 minute AQI Data for 2024-25" - long format with per-pollutant
  concentrations (PM2.5, PM10, NO2, Ozone, ...) every 15 min. These are real targets;
  clean_align averages them to hourly.

Timestamps: the 2024-25 files label times "+0000", but they are IST wall-clock times -
ozone peaks at labelled 14:00 and PM2.5 bottoms out at 16:00, the normal Delhi
afternoon pattern in local time (a true-UTC label would put the ozone peak at 19:30 IST).
So every opencity timestamp is treated as IST, ignoring any offset label, then converted
to UTC.

Put the CSVs in ``config.RAW_OPENCITY / "csv"``, named after the station when the file
has no station column (e.g. "ITO CPCB 2017-2023.csv"), and run:

    python -m data_pipeline.ingest_opencity

NOx columns are ignored on purpose - the chemistry target is NO2.
"""

from __future__ import annotations

import io
import re
from pathlib import Path

import pandas as pd

import config
from data_pipeline.common import slugify, write_raw

TIME_ALIASES = ["from date", "from_date", "datetime", "date time", "timestamp", "date"]
STATION_ALIASES = ["station name", "station_name", "station", "location"]
VAR_PATTERNS = {  # regex on lower-cased header -> variable
    "pm25": r"^pm\s*2\.?5",
    "pm10": r"^pm\s*10",
    "no2": r"^no2\b",
    "o3": r"^(ozone|o3)\b",
}
_MONTH_HEADER = re.compile(r"^([A-Za-z]+)-(\d{4})$")
_YEAR_SUFFIX = re.compile(r"\s*\d{4}(-\d{2,4})?$")


def _find(cols: list[str], aliases: list[str]) -> str | None:
    low = {c.lower().strip(): c for c in cols}
    return next((low[a] for a in aliases if a in low), None)


def parse_ist(values: pd.Series) -> pd.Series:
    """Opencity timestamps -> UTC, treating the wall-clock time as IST.

    ISO strings (with or without a misleading "+0000") are parsed as ISO; anything else
    is parsed day-first (CPCB "dd-mm-yyyy HH:MM").
    """
    s = values.astype(str).str.strip()
    iso = s.str.match(r"^\d{4}-\d{2}-\d{2}")
    wall = s.str.replace(r"(Z|[+-]\d{2}:?\d{2})$", "", regex=True)
    out = pd.Series(pd.NaT, index=s.index, dtype="datetime64[ns]")
    if iso.any():
        out[iso] = pd.to_datetime(wall[iso], format="ISO8601", errors="coerce")
    if (~iso).any():
        out[~iso] = pd.to_datetime(wall[~iso], dayfirst=True, errors="coerce")
    return (out.dt.tz_localize(config.LOCAL_TZ, ambiguous="NaT", nonexistent="NaT")
            .dt.tz_convert("UTC"))


def station_from_filename(stem: str) -> str:
    """'ITO CPCB 2017-2023' -> 'ITO CPCB' (slugify later drops the operator suffix)."""
    return _YEAR_SUFFIX.sub("", stem).strip()


# --------------------------------------------------------------------------
# 2024-25 format: long, per-pollutant concentrations
# --------------------------------------------------------------------------
def normalise(df: pd.DataFrame, station_name: str | None = None) -> pd.DataFrame:
    tcol = _find(list(df.columns), TIME_ALIASES)
    if tcol is None:
        raise ValueError(f"no timestamp column among {list(df.columns)}")
    scol = _find(list(df.columns), STATION_ALIASES)
    var_cols = {}
    for c in df.columns:
        for var, pat in VAR_PATTERNS.items():
            if re.match(pat, c.lower().strip()) and var not in var_cols.values():
                var_cols[c] = var
                break
    if not var_cols:
        raise ValueError(f"no pollutant columns among {list(df.columns)}")

    names = df[scol] if scol else pd.Series(station_name, index=df.index)
    keep = names.notna() & (names.astype(str).str.strip() != "")
    df, names = df[keep], names[keep].astype(str)

    long = (pd.DataFrame({"timestamp": parse_ist(df[tcol]), "name": names})
            .join(df[list(var_cols)].rename(columns=var_cols).apply(pd.to_numeric, errors="coerce"))
            .melt(id_vars=["timestamp", "name"], var_name="variable", value_name="value")
            .dropna(subset=["timestamp", "value"]))
    long["station_id"] = long["name"].map(slugify)
    long["units"] = "ug/m3"
    long["source"] = "opencity"
    return long[["station_id", "timestamp", "variable", "value", "units", "source", "name"]]


# --------------------------------------------------------------------------
# 2017-2023 format: AQI index grid (month blocks x day rows x 24 hour columns)
# --------------------------------------------------------------------------
def is_aqi_grid(text: str) -> bool:
    return text.lstrip().lower().startswith("year,")


def parse_aqi_grid(text: str, station_name: str) -> pd.DataFrame:
    rows = []
    year = month = None
    for line in io.StringIO(text):
        parts = [p.strip().strip('"') for p in line.rstrip("\n").split(",")]
        if not parts or not parts[0]:
            continue
        head = parts[0]
        m = _MONTH_HEADER.match(head)
        if m:
            month = pd.Timestamp(f"1 {m.group(1)} {m.group(2)}").month
            year = int(m.group(2))
            continue
        if head.lower() == "year" or month is None:
            continue
        try:
            day = int(float(head))
        except ValueError:
            continue
        for hour, val in enumerate(parts[1:25]):
            if val:
                rows.append((year, month, day, hour, float(val)))
    if not rows:
        return pd.DataFrame(columns=["station_id", "timestamp", "variable", "value", "units",
                                     "source", "name"])
    g = pd.DataFrame(rows, columns=["year", "month", "day", "hour", "value"])
    local = pd.to_datetime(g[["year", "month", "day", "hour"]], errors="coerce")
    out = pd.DataFrame({
        "timestamp": local.dt.tz_localize(config.LOCAL_TZ).dt.tz_convert("UTC"),
        "variable": "aqi_reported", "value": g["value"], "units": "index",
        "source": "opencity", "name": station_name, "station_id": slugify(station_name)})
    out = out.dropna(subset=["timestamp"])
    return out[["station_id", "timestamp", "variable", "value", "units", "source", "name"]]


# --------------------------------------------------------------------------
def load_file(path: Path) -> pd.DataFrame:
    text = path.read_text(encoding="utf-8-sig", errors="replace")
    name = station_from_filename(path.stem)
    if is_aqi_grid(text):
        return parse_aqi_grid(text, name)
    return normalise(pd.read_csv(io.StringIO(text), low_memory=False), station_name=name)


def run(csv_dir: Path | None = None, write: bool = True) -> pd.DataFrame:
    """Normalise every CSV; one raw chunk per source file, so CSVs added later are
    picked up on the next run while already-loaded ones are left untouched."""
    config.ensure_dirs()
    csv_dir = csv_dir or (config.RAW_OPENCITY / "csv")
    files = sorted(csv_dir.glob("*.csv"))
    if not files:
        raise FileNotFoundError(f"no CSVs in {csv_dir}")
    frames = []
    for f in files:
        df = load_file(f)
        kinds = ",".join(sorted(df.variable.unique())) if len(df) else "nothing parsed"
        span = f"{df.timestamp.min()} -> {df.timestamp.max()}" if len(df) else ""
        print(f"[opencity] {f.name}: {len(df):,} rows [{kinds}] {span}")
        if write:
            write_raw(df.drop(columns="name"), config.RAW_OPENCITY, f"opencity_{slugify(f.stem)}")
        frames.append(df)
    df = pd.concat(frames, ignore_index=True)

    if config.STATIONS_FILE.exists():
        known = set(pd.read_csv(config.STATIONS_FILE).station_id)
        missing = sorted(set(df.station_id) - known)
        if missing:
            print(f"[opencity] {len(missing)} stations not in stations.csv (add lat/lon for them): "
                  f"{missing}")
    print(f"[opencity] total {len(df):,} rows, {df.station_id.nunique()} stations")
    return df


if __name__ == "__main__":
    run()
