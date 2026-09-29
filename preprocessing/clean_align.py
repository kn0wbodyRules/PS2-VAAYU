"""Raw -> processed: one hourly clock per station, units unified, gaps handled.

Outputs (all in config.DATA_PROCESSED):
    obs_hourly.parquet       station_id, time, pm25, pm10, o3, no2 (ug/m3), t2m, u10, v10, blh,
                             rh, ws, wd, plus <var>_flag (0 observed, 1 interpolated,
                             2 filled from correlated station, NaN still missing)
    cams_station.parquet     CAMS forecast at each station, keyed by (issue_time, lead_hour)
    openmeteo_forecast_station.parquet  optional Open-Meteo lead-time baseline
    fire_detections.parquet  cleaned FIRMS detections

Gap policy: <=3 h interior gaps are linearly interpolated; longer gaps are filled from
the most correlated station (linear fit, corr >= MIN_CORR, fitted on the training range
only); anything else stays NaN and is masked downstream. Never zero-filled.

Usage:
    python -m preprocessing.clean_align
"""

from __future__ import annotations

import duckdb
import numpy as np
import pandas as pd

import config
from data_pipeline import ingest_cams
from data_pipeline.common import load_stations

# overlapping sources for the same station-hour: official CPCB exports first
SOURCE_PRIORITY = {"opencity": 0, "kaggle": 1, "openaq": 2, "datagovin": 3}
SHORT_GAP_HOURS = 3
MIN_CORR = 0.7
MIN_OVERLAP_HOURS = 24 * 30  # overlapping hours needed to trust a station correlation
MAX_NEIGHBOUR_GAP_HOURS = 24 * 7  # longer outages = station not operating; left missing
# Physically plausible hourly ranges (ug/m3); outside -> treated as instrument error
VALID_RANGE = {"pm25": (0, 1500), "pm10": (0, 2000), "o3": (0, 1000), "no2": (0, 1000)}
# ppb -> ug/m3 at 25 C, 1 atm
PPB_TO_UGM3 = {"o3": 1.96, "no2": 1.88}


def _read_raw(folder, pattern: str = "*.parquet") -> pd.DataFrame:
    files = sorted(folder.glob(pattern))
    if not files:
        return pd.DataFrame()
    globs = [str(f).replace("\\", "/") for f in files]
    return duckdb.sql(f"SELECT * FROM read_parquet({globs}, union_by_name=true)").df()


# --------------------------------------------------------------------------
# Chemistry observations
# --------------------------------------------------------------------------
def to_ugm3(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    units = df["units"].fillna("ug/m3").str.lower().str.replace("µ", "u")
    for var, factor in PPB_TO_UGM3.items():
        is_var = df["variable"] == var
        df.loc[is_var & (units == "ppm"), "value"] *= 1000 * factor
        df.loc[is_var & (units == "ppb"), "value"] *= factor
    return df


def clean_chem(raw: pd.DataFrame) -> pd.DataFrame:
    """Long raw rows from all AQ sources -> wide hourly (station_id, time) x CHEM_VARS."""
    df = to_ugm3(raw[raw["variable"].isin(config.CHEM_VARS)])
    df["time"] = pd.to_datetime(df["timestamp"], utc=True).dt.floor("h")
    for var, (lo, hi) in VALID_RANGE.items():
        bad = (df["variable"] == var) & ~df["value"].between(lo, hi, inclusive="right")
        df.loc[bad, "value"] = np.nan
    df = df.dropna(subset=["value"])
    # overlapping sources: keep the highest-priority source for each station/hour/variable
    df["prio"] = df["source"].map(SOURCE_PRIORITY).fillna(9)
    best = df.groupby(["station_id", "time", "variable"])["prio"].transform("min")
    df = df[df["prio"] == best]
    return (df.groupby(["station_id", "time", "variable"])["value"].mean()
            .unstack("variable").reindex(columns=config.CHEM_VARS).reset_index())


# --------------------------------------------------------------------------
# Meteorology truth (Open-Meteo ERA5 archive)
# --------------------------------------------------------------------------
def wind_to_uv(ws, wd_deg):
    """Meteorological convention: wd is the direction wind comes FROM."""
    rad = np.deg2rad(wd_deg)
    return -ws * np.sin(rad), -ws * np.cos(rad)


MET_SOURCE_PRIORITY = {"openmeteo_archive": 0, "era5_cds": 1}  # ERA5-from-CDS only fills gaps


def clean_met(raw: pd.DataFrame) -> pd.DataFrame:
    df = raw[raw["source"].isin(MET_SOURCE_PRIORITY)].copy()
    df["time"] = pd.to_datetime(df["timestamp"], utc=True)
    df["prio"] = df["source"].map(MET_SOURCE_PRIORITY)
    best = df.groupby(["station_id", "time", "variable"])["prio"].transform("min")
    df = df[df["prio"] == best]
    wide = (df.pivot_table(index=["station_id", "time"], columns="variable", values="value")
            .reset_index())
    return _met_from_wide(wide)


MET_RAW_VARS = ["temperature_2m", "boundary_layer_height", "relative_humidity_2m", "wind_speed_10m",
                "wind_direction_10m", "shortwave_radiation"]


def read_met_wide(files: list) -> pd.DataFrame:
    """Met raw chunks -> wide hourly table inside DuckDB (source priority applied there).

    The long raw table is ~34M rows for 2015-2025; pivoting it in pandas peaked at
    13.6 GB, too much for a standard Colab runtime."""
    if not files:
        return pd.DataFrame(columns=["station_id", "time"])
    globs = [str(f).replace("\\", "/") for f in files]
    prio = " ".join(f"WHEN '{s}' THEN {p}" for s, p in MET_SOURCE_PRIORITY.items())
    srcs = ", ".join(f"'{s}'" for s in MET_SOURCE_PRIORITY)
    cols = ",\n               ".join(
        f"max(value) FILTER (WHERE variable = '{v}')::FLOAT AS {v}" for v in MET_RAW_VARS)
    wide = duckdb.sql(f"""
        WITH best AS (
            SELECT station_id, timestamp, variable,
                   arg_min(value, CASE source {prio} END) AS value
            FROM read_parquet({globs}, union_by_name=true)
            WHERE source IN ({srcs})
            GROUP BY station_id, timestamp, variable)
        SELECT station_id, timestamp AS time,
               {cols}
        FROM best GROUP BY station_id, timestamp
    """).df()
    wide["time"] = pd.to_datetime(wide["time"], utc=True)
    return _met_from_wide(wide)


def _met_from_wide(wide: pd.DataFrame) -> pd.DataFrame:
    out = pd.DataFrame({"station_id": wide["station_id"], "time": wide["time"],
                        "t2m": wide.get("temperature_2m"), "blh": wide.get("boundary_layer_height"),
                        "rh": wide.get("relative_humidity_2m"), "ws": wide.get("wind_speed_10m"),
                        "wd": wide.get("wind_direction_10m"),
                        "swr": wide.get("shortwave_radiation")})
    out["u10"], out["v10"] = wind_to_uv(out["ws"], out["wd"])
    return out


# --------------------------------------------------------------------------
# Alignment + gap filling
# --------------------------------------------------------------------------
def align(chem: pd.DataFrame, met: pd.DataFrame, stations: pd.DataFrame,
          start=None, end=None) -> pd.DataFrame:
    """Full (station x hour) grid so every station shares one hourly clock."""
    times = pd.concat([chem["time"], met["time"]])
    start = pd.Timestamp(start, tz="UTC") if start else times.min()
    end = pd.Timestamp(end, tz="UTC") if end else times.max()
    idx = pd.MultiIndex.from_product(
        [stations["station_id"], pd.date_range(start, end, freq="h", tz="UTC")],
        names=["station_id", "time"])
    grid = pd.DataFrame(index=idx).reset_index()
    out = grid.merge(chem, how="left").merge(met, how="left")
    num = out.select_dtypes("number").columns
    out[num] = out[num].astype("float32")  # ~5M rows x 20 cols: halves memory vs float64
    return out


def fill_short_gaps(df: pd.DataFrame, cols: list[str], limit: int = SHORT_GAP_HOURS) -> pd.DataFrame:
    """Linear interpolation for interior gaps of at most `limit` hours; flag = 1."""
    df = df.sort_values(["station_id", "time"]).copy()
    for c in cols:
        flag = np.where(df[c].notna(), 0.0, np.nan)
        s = df[c]
        run_id = s.notna().cumsum()
        gap_len = s.isna().groupby([df["station_id"], run_id]).transform("sum")
        interp = df.groupby("station_id")[c].transform(
            lambda x: x.interpolate(limit_area="inside"))
        ok = s.isna() & interp.notna() & (gap_len <= limit)
        df.loc[ok, c] = interp[ok]
        flag[ok.to_numpy()] = 1.0
        df[f"{c}_flag"] = flag
    return df


def fill_from_correlated(df: pd.DataFrame, cols: list[str], fit_range=None,
                         min_corr: float = MIN_CORR, min_overlap_hours: int | None = None,
                         max_gap_hours: int | None = None) -> pd.DataFrame:
    """Fill remaining gaps from the most correlated station via a linear fit (flag = 2).

    Only gaps up to `max_gap_hours` (default MAX_NEIGHBOUR_GAP_HOURS) are filled: a longer
    absence means the station wasn't operating (e.g. before it opened), and copying a
    neighbour's values there would fabricate years of "observations". Without this cap the
    real 2015-2025 data ended up with more neighbour-filled PM2.5 hours than observed ones.
    Correlations and fits use only the training range, so val/test never leak in.
    """
    df = df.copy()
    fit_ranges = [fit_range] if fit_range else config.TRAIN_RANGES
    max_gap = max_gap_hours or MAX_NEIGHBOUR_GAP_HOURS
    for c in cols:
        wide = df.pivot(index="time", columns="station_id", values=c)
        gap = wide.isna()
        run_len = gap.apply(lambda s: s.groupby((~s).cumsum()).transform("sum"))
        fillable = gap & (run_len <= max_gap)
        in_fit = np.zeros(len(wide), dtype=bool)
        for a, b in fit_ranges:
            in_fit |= (wide.index >= pd.Timestamp(a, tz="UTC")) & (wide.index <= pd.Timestamp(b, tz="UTC"))
        fit = wide.loc[in_fit]
        corr = fit.corr(min_periods=min_overlap_hours or MIN_OVERLAP_HOURS)
        filled = wide.copy()
        for st in wide.columns:
            if not wide[st].isna().any() or st not in corr:
                continue
            cands = corr[st].drop(st, errors="ignore").dropna().sort_values(ascending=False)
            for other, r in cands.items():
                if r < min_corr:
                    break
                pair = fit[[st, other]].dropna()
                b, a = np.polyfit(pair[other], pair[st], 1)
                need = filled[st].isna() & wide[other].notna() & fillable[st]
                filled.loc[need, st] = a + b * wide.loc[need, other]
                if not filled[st].isna().any():
                    break
        new = filled.stack().rename(f"{c}_nb").reset_index()
        df = df.merge(new, on=["time", "station_id"], how="left")
        use = df[c].isna() & df[f"{c}_nb"].notna()
        df.loc[use, c] = df.loc[use, f"{c}_nb"].clip(lower=0 if c in VALID_RANGE else None)
        df.loc[use, f"{c}_flag"] = 2.0
        df = df.drop(columns=f"{c}_nb")
    return df


# --------------------------------------------------------------------------
# Gridded / forecast sources
# --------------------------------------------------------------------------
def build_cams_station(stations: pd.DataFrame) -> pd.DataFrame:
    paths = sorted(config.RAW_CAMS.glob("cams_fc_*.zip"))
    return ingest_cams.station_table(paths, stations) if paths else pd.DataFrame()


def build_openmeteo_baseline(raw: pd.DataFrame) -> pd.DataFrame:
    """Previous Runs API -> (station, valid_time, lead_day) baseline; no BLH available there."""
    df = raw[raw["source"] == "openmeteo_previous"].copy()
    if df.empty:
        return df
    df["lead_day"] = df["variable"].str.extract(r"_previous_day(\d)$")[0].astype(int)
    df["base"] = df["variable"].str.replace(r"_previous_day\d$", "", regex=True)
    wide = df.pivot_table(index=["station_id", "timestamp", "lead_day"], columns="base",
                          values="value").reset_index()
    u, v = wind_to_uv(wide["wind_speed_10m"], wide["wind_direction_10m"])
    return pd.DataFrame({"station_id": wide["station_id"],
                         "valid_time": pd.to_datetime(wide["timestamp"], utc=True),
                         "lead_day": wide["lead_day"], "t2m": wide["temperature_2m"],
                         "u10": u, "v10": v})


def clean_fires(raw: pd.DataFrame) -> pd.DataFrame:
    if raw.empty:
        return raw
    df = raw.dropna(subset=["lat", "lon", "timestamp"]).copy()
    df["timestamp"] = pd.to_datetime(df["timestamp"], utc=True)
    df["frp"] = df["frp"].fillna(df["frp"].median()).clip(lower=0)
    cols = ["lat", "lon", "timestamp", "frp"] + [c for c in ("brightness", "confidence") if c in df]
    return df.drop_duplicates(["lat", "lon", "timestamp"])[cols]  # brightness/confidence for the map


def _read_raw_hourly(folder, pattern: str = "*.parquet") -> pd.DataFrame:
    """AQ raw chunks averaged to the hour inside DuckDB (15-min opencity rows alone are
    ~10M), keeping only plausible values so zeros/sentinels never enter an average."""
    files = sorted(folder.glob(pattern))
    if not files:
        return pd.DataFrame()
    globs = [str(f).replace("\\", "/") for f in files]
    valid = " OR ".join(f"(variable = '{v}' AND value > {lo} AND value <= {hi})"
                        for v, (lo, hi) in VALID_RANGE.items())
    return duckdb.sql(f"""
        SELECT station_id, date_trunc('hour', timestamp) AS timestamp, variable,
               avg(value) AS value, any_value(units) AS units, source
        FROM read_parquet({globs}, union_by_name=true)
        WHERE {valid}
        GROUP BY station_id, date_trunc('hour', timestamp), variable, source, units
    """).df()


# --------------------------------------------------------------------------
def run(start=None, end=None) -> pd.DataFrame:
    config.ensure_dirs()
    aq = pd.concat([_read_raw_hourly(config.RAW_OPENCITY, "opencity_*.parquet"),
                    _read_raw_hourly(config.RAW_KAGGLE, "kaggle_*.parquet"),
                    _read_raw_hourly(config.RAW_OPENAQ, "openaq_*.parquet"),
                    _read_raw_hourly(config.RAW_DATAGOVIN)], ignore_index=True)
    met_files = (sorted(config.RAW_OPENMETEO.glob("archive_*.parquet"))
                 + sorted(config.RAW_ERA5.glob("era5_*.parquet")))

    chem = clean_chem(aq)
    del aq
    met = read_met_wide(met_files)
    # the hourly grid covers only stations that actually have AQ observations (the registry
    # also lists low-cost sensors and new sites with nothing usable for training)
    stations = load_stations()
    stations = stations[stations["station_id"].isin(chem["station_id"].unique())].reset_index(drop=True)
    print(f"[clean] {len(stations)} stations with AQ data, {len(chem):,} station-hours of chemistry")
    obs = align(chem, met, stations, start, end)
    fill_cols = config.CHEM_VARS + ["t2m", "blh", "u10", "v10", "rh", "ws"]
    obs = fill_short_gaps(obs, fill_cols)
    obs = fill_from_correlated(obs, config.CHEM_VARS)
    obs.to_parquet(config.OBS_FILE, index=False)
    print(f"[clean] obs {obs.shape} -> {config.OBS_FILE}")

    cams = build_cams_station(stations)
    if not cams.empty:
        cams.to_parquet(config.CAMS_STATION_FILE, index=False)
        print(f"[clean] cams {cams.shape} -> {config.CAMS_STATION_FILE}")

    prev = _read_raw(config.RAW_OPENMETEO, "previous_*.parquet")  # optional Previous Runs baseline
    om = build_openmeteo_baseline(prev) if not prev.empty else pd.DataFrame()
    if not om.empty:
        om.to_parquet(config.MET_FORECAST_FILE, index=False)

    fires = clean_fires(_read_raw(config.RAW_FIRMS))
    if not fires.empty:
        fires.to_parquet(config.DATA_PROCESSED / "fire_detections.parquet", index=False)
        print(f"[clean] fires {len(fires):,} detections")
    return obs


if __name__ == "__main__":
    run()
