"""Central configuration for VAAYU.

Every Google Drive path used anywhere in the project is defined here and only
here. The same code runs unmodified on:

* the user's laptop, where Drive is mounted at ``G:/My Drive``
* Google Colab, where Drive is mounted at ``/content/drive/MyDrive``

Set ``VAAYU_DRIVE_ROOT`` to override the detected location (tests use this to
point everything at a temporary folder).
"""

from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

REPO_ROOT = Path(__file__).resolve().parent
load_dotenv(REPO_ROOT / ".env")

# --------------------------------------------------------------------------
# Environment detection + Drive paths
# --------------------------------------------------------------------------
LOCAL_DRIVE_ROOT = Path("G:/My Drive/PS2-VAAYU")
COLAB_DRIVE_ROOT = Path("/content/drive/MyDrive/PS2-VAAYU")


def _in_colab() -> bool:
    return "COLAB_RELEASE_TAG" in os.environ or Path("/content").is_dir()


if os.environ.get("VAAYU_DRIVE_ROOT"):
    ENVIRONMENT = "override"
    DRIVE_ROOT = Path(os.environ["VAAYU_DRIVE_ROOT"])
elif _in_colab():
    ENVIRONMENT = "colab"
    DRIVE_ROOT = COLAB_DRIVE_ROOT
else:
    ENVIRONMENT = "local"
    DRIVE_ROOT = LOCAL_DRIVE_ROOT

DATA_RAW = DRIVE_ROOT / "data" / "raw"
DATA_PROCESSED = DRIVE_ROOT / "data" / "processed"
MODEL_CHECKPOINTS = DRIVE_ROOT / "models" / "checkpoints"
MODEL_PRODUCTION = DRIVE_ROOT / "models" / "production"
LOGS = DRIVE_ROOT / "logs"

PRODUCTION_MODEL_FILE = MODEL_PRODUCTION / "model.pt"
REGISTRY_FILE = DRIVE_ROOT / "models" / "registry.json"

# Raw sub-folders, one per source (raw data is append-only, never overwritten)
RAW_OPENAQ = DATA_RAW / "openaq"
RAW_OPENCITY = DATA_RAW / "opencity"
RAW_KAGGLE = DATA_RAW / "kaggle"
RAW_DATAGOVIN = DATA_RAW / "datagovin"
RAW_OPENMETEO = DATA_RAW / "openmeteo"
RAW_FIRMS = DATA_RAW / "firms"
RAW_CAMS = DATA_RAW / "cams"
RAW_ERA5 = DATA_RAW / "era5"  # ERA5 BLH fallback straight from CDS
STATIONS_FILE = DATA_RAW / "stations.csv"  # canonical station registry

# Processed artefacts
OBS_FILE = DATA_PROCESSED / "obs_hourly.parquet"
CAMS_STATION_FILE = DATA_PROCESSED / "cams_station.parquet"
MET_FORECAST_FILE = DATA_PROCESSED / "openmeteo_forecast_station.parquet"
FIRE_NODES_FILE = DATA_PROCESSED / "fire_nodes_hourly.parquet"
FEATURES_FILE = DATA_PROCESSED / "features_hourly.parquet"
GRAPH_FILE = DATA_PROCESSED / "graph_static.json"
FORECAST_CURRENT_FILE = DATA_PROCESSED / "forecast_current.parquet"


def ensure_dirs() -> None:
    """Create the Drive folder tree if it does not exist yet."""
    for p in (DATA_RAW, DATA_PROCESSED, MODEL_CHECKPOINTS, MODEL_PRODUCTION, LOGS,
              RAW_OPENAQ, RAW_OPENCITY, RAW_KAGGLE, RAW_DATAGOVIN, RAW_OPENMETEO, RAW_FIRMS, RAW_CAMS, RAW_ERA5):
        p.mkdir(parents=True, exist_ok=True)


# --------------------------------------------------------------------------
# API keys (from .env, never hardcoded)
# --------------------------------------------------------------------------
OPENAQ_API_KEY = os.environ.get("OPENAQ_API_KEY", "")
FIRMS_MAP_KEY = os.environ.get("FIRMS_MAP_KEY", "")
DATAGOVIN_API_KEY = os.environ.get("DATAGOVIN_API_KEY", "")
ADS_URL = os.environ.get("ADS_URL", "https://ads.atmosphere.copernicus.eu/api")
ADS_KEY = os.environ.get("ADS_KEY", "")

# --------------------------------------------------------------------------
# Domain
# --------------------------------------------------------------------------
LOCAL_TZ = "Asia/Kolkata"  # CPCB / opencity timestamps are IST; everything internal is UTC

# (west, south, east, north)
DELHI_NCR_BBOX = (76.80, 28.30, 77.60, 28.95)
FIRE_BBOX = (73.80, 27.60, 77.60, 32.60)  # Punjab + Haryana
FIRE_NODE_CELL_DEG = 1.0                  # fire-source boundary nodes = 1 deg cells over FIRE_BBOX

# Chemistry target is NO2 (not NOx): matches CAMS output and the CPCB AQI parameter.
CHEM_VARS = ["pm25", "pm10", "o3", "no2"]          # ug/m3
MET_VARS = ["t2m", "u10", "v10", "blh"]            # degC, m/s, m/s, m
STATE_VARS = CHEM_VARS + MET_VARS

# Weather baseline the met head corrects. "cams" = CAMS forecast met fields
# (lead-time resolved back to 2015, so usable for 2017-2023 training).
# "openmeteo" = Open-Meteo Previous Runs API (lead-time archive mostly from 2024).
MET_BASELINE_SOURCE = os.environ.get("VAAYU_MET_BASELINE", "cams")

# --------------------------------------------------------------------------
# CAMS
# --------------------------------------------------------------------------
CAMS_DATASET = "cams-global-atmospheric-composition-forecasts"  # forecast archive, NOT EAC4
# 00 UTC runs only: the historical archive is tape-resident and ADS throughput was measured
# at ~2 requests/hour (2026-09-27), so pulling both runs would take ~2x as long. One forecast
# per day (T0 = 12 UTC = 17:30 IST); the live service refreshes daily off the 00 UTC run.
CAMS_ISSUE_HOURS = ["00:00"]
CAMS_MAX_LEAD = 120
CAMS_LATENCY_HOURS = 12  # a run issued at I is usable from I + latency
CAMS_SINGLE_LEVEL_VARS = {
    "particulate_matter_2.5um": "pm25",
    "particulate_matter_10um": "pm10",
    "2m_temperature": "t2m",
    "10m_u_component_of_wind": "u10",
    "10m_v_component_of_wind": "v10",
    "boundary_layer_height": "blh",
}
# NO2 and O3 are multi-level (mass mixing ratio) -> take the lowest model level.
CAMS_MULTI_LEVEL_VARS = {"nitrogen_dioxide": "no2", "ozone": "o3"}
CAMS_L137_START = "2019-07-07"  # model went 60 -> 137 levels on this date

# --------------------------------------------------------------------------
# Features / physics
# --------------------------------------------------------------------------
VC_REF = 6000.0            # m2/s; ventilation coefficient below this = poor dispersion
FIRE_LOOKBACK_HOURS = 24
FIRE_CONE_HALF_ANGLE = 45.0  # degrees either side of the upwind direction
FIRE_DECAY_KM = 300.0
STUBBLE_MONTHS = (10, 11)
EDGE_RADIUS_KM = 60.0       # station-station edges within this distance
EDGE_LENGTH_KM = 15.0       # distance decay scale for station edges
FIRE_EDGE_DECAY_KM = 1000.0

# --------------------------------------------------------------------------
# Splits (by time; benchmark slice is carved out of training)
# --------------------------------------------------------------------------
# Ground truth has a disclosed gap: OpenAQ (the only 2020-2023 source) peaks at 33% hourly
# PM2.5 completeness per station and stops entirely on 2022-10-31 (verified 2026-09-27),
# so Nov 2022 - Dec 2023 has no usable concentrations.
TRAIN_RANGES = [
    ("2015-01-01", "2020-06-30 23:00"),  # Kaggle "Air Quality Data in India" station_hour
    ("2020-07-01", "2022-10-31 23:00"),  # OpenAQ, sparse (<=33%); supplementary samples only -
                                         # windows need MIN_TARGET_FRAC observed targets
    ("2024-01-01", "2024-12-31 23:00"),  # opencity.in 15-min, incl. Oct-Nov 2024 stubble season
]
VAL_RANGE = ("2025-01-01", "2025-06-30 23:00")    # opencity.in
TEST_RANGE = ("2025-07-01", "2025-12-31 23:00")   # opencity.in, incl. Oct-Nov 2025 stubble season
BENCHMARK_RANGE = ("2019-10-01", "2020-02-29 23:00")  # Jena et al. 2021 window; purged from train
MIN_TARGET_FRAC = 0.3  # a window is a sample only if >= 30% of its chemistry targets are observed

# Jena et al. (2021) published WRF-Chem PM2.5 mean bias, ug/m3 (approximate, per day of lead)
JENA_2021_PM25_BIAS = {"day1": 2.5, "day3": -17.0}

# --------------------------------------------------------------------------
# Model / training defaults (override in the notebook)
# --------------------------------------------------------------------------
HISTORY_HOURS = 24
HORIZON_HOURS = 72
TRAIN_DEFAULTS = {
    "hidden": 64,
    "gat_heads": 2,
    "epochs": 30,
    "batch_size": 8,
    "lr": 1e-3,
    "checkpoint_every": 5,
    "teacher_forcing_epochs": 5,     # pure teacher forcing for this many epochs
    "sampling_ramp_epochs": 15,      # then ramp teacher-forcing prob 1 -> 0 over this many
    "horizon_start": 24,             # curriculum: rollout length grows to HORIZON_HOURS
    "lambda_met": 0.5,
    "lambda_phys": 0.1,
    "fire_low_threshold": 0.5,       # fire_influence_score (log1p units) below this = "no plume"
    "severity_weights": {"good": 1.0, "satisfactory": 1.0, "moderate": 1.0,
                         "poor": 2.0, "very_poor": 3.0, "severe": 4.0},
}
PROMOTE_MIN_IMPROVEMENT = 0.01    # new model must beat production score by >= 1%
PROMOTE_MAX_RECALL_DROP = 0.05    # and not lose more than this much severe-event recall
