"""Unit tests: ingestion parsers, CPCB AQI, physics features, graph weights, gap filling."""

from pathlib import Path

import numpy as np
import pandas as pd
import pytest

import config
from data_pipeline import ingest_cams, ingest_datagovin, ingest_firms, ingest_kaggle, ingest_openaq, ingest_opencity
from data_pipeline import ingest_openmeteo
from data_pipeline.common import slugify
from graph.build_graph import build_static_graph, edge_weights, fire_node_grid
from model import aqi
from preprocessing import clean_align, features


# ---------------------------------------------------------------- config
def test_config_paths_resolve_under_override_root():
    assert config.ENVIRONMENT == "override"
    for p in (config.DATA_RAW, config.DATA_PROCESSED, config.MODEL_CHECKPOINTS,
              config.MODEL_PRODUCTION, config.LOGS):
        assert str(p).startswith(str(config.DRIVE_ROOT))
    assert config.CAMS_DATASET == "cams-global-atmospheric-composition-forecasts"
    assert "no2" in config.CHEM_VARS and "nox" not in config.CHEM_VARS


# ---------------------------------------------------------------- parsers
def test_slugify_joins_sources():
    assert slugify("Anand Vihar, New Delhi - DPCC") == slugify("Anand Vihar DPCC") == "anand_vihar_dpcc"
    assert slugify("ITO, Delhi - CPCB") == slugify("ITO CPCB") == "ito_cpcb"
    assert slugify("IGI Airport (T3) IMD") == slugify("IGI Airport (T3), Delhi - IMD")
    assert slugify("Dwarka-Sector 8, Delhi - DPCC") == slugify("Dwarka-Sector 8 DPCC")
    # same site name, different monitors must NOT merge
    assert slugify("Pusa, Delhi - IMD") != slugify("Pusa, Delhi - DPCC")
    assert slugify("Lodhi Road, New Delhi - IMD") != slugify("Lodhi Road, Delhi - IITM")
    assert slugify("NISE Gwal Pahari, Gurugram - IMD") == "nise_gwal_pahari_imd"


def test_openaq_parsers():
    locs = [{"id": 8118, "name": "Anand Vihar, New Delhi - DPCC",
             "coordinates": {"latitude": 28.64, "longitude": 77.31}, "provider": {"name": "CPCB"},
             "sensors": [{"id": 1, "parameter": {"name": "pm25", "units": "µg/m³"}},
                         {"id": 2, "parameter": {"name": "nox", "units": "ppb"}}]}]
    df = ingest_openaq.parse_locations(locs)
    assert list(df.variable) == ["pm25"]  # NOx dropped - target is NO2
    hours = [{"value": 88.0, "parameter": {"name": "pm25", "units": "µg/m³"},
              "period": {"datetimeFrom": {"utc": "2024-01-01T00:00:00Z"}}},
             {"value": None, "period": {"datetimeFrom": {"utc": "2024-01-01T01:00:00Z"}}}]
    h = ingest_openaq.parse_hours(hours, "anand_vihar", "pm25")
    assert len(h) == 1 and h.timestamp.iloc[0] == pd.Timestamp("2024-01-01", tz="UTC")


def test_openmeteo_parser_keeps_blh():
    payload = {"hourly_units": {"boundary_layer_height": "m"},
               "hourly": {"time": ["2019-11-01T00:00", "2019-11-01T01:00"],
                          "boundary_layer_height": [20.0, 30.0], "temperature_2m": [15.0, None]}}
    df = ingest_openmeteo.parse_hourly(payload, "ito", "openmeteo_archive")
    assert set(df.variable) == {"boundary_layer_height", "temperature_2m"}
    assert len(df) == 3 and "boundary_layer_height" in ingest_openmeteo.HOURLY


def test_firms_parser_drops_low_confidence():
    csv = ("latitude,longitude,bright_ti4,acq_date,acq_time,confidence,frp\n"
           "30.1,75.2,340,2019-11-01,0830,n,12.5\n30.2,75.3,300,2019-11-01,0830,l,3.0\n")
    df = ingest_firms.parse_csv(csv, "VIIRS_SNPP_SP")
    assert len(df) == 1 and df.timestamp.iloc[0] == pd.Timestamp("2019-11-01 08:30", tz="UTC")


def test_datagovin_parser_converts_ist():
    recs = [{"station": "ITO, Delhi - CPCB", "last_update": "01-11-2024 10:00:00",
             "pollutant_id": "PM2.5", "pollutant_avg": "250", "latitude": "28.6", "longitude": "77.2"},
            {"station": "ITO, Delhi - CPCB", "last_update": "01-11-2024 10:00:00",
             "pollutant_id": "SO2", "pollutant_avg": "10"}]
    df = ingest_datagovin.parse_records(recs)
    assert len(df) == 1 and df.station_id.iloc[0] == "ito_cpcb"
    assert df.timestamp.iloc[0] == pd.Timestamp("2024-11-01 04:30", tz="UTC")


def test_opencity_2024_format_iso_labelled_utc_is_really_ist():
    """Real 2024-25 layout: ISO timestamps labelled +0000 that are IST wall-clock times."""
    raw = pd.DataFrame({
        "Station ID": ["site_117"] * 3 + [None],
        "Station Name": ["ITO, Delhi - CPCB"] * 3 + [None],
        "Timestamp": ["2024-01-01T00:00:00.000000+0000", "2024-01-13T00:15:00.000000+0000",
                      "2025-12-31T23:30:00.000000+0000", None],
        "PM2.5 (µg/m³)": [145.0, 143.0, None, 1.0], "NO (µg/m³)": [15.5, 14.7, 1.0, 1.0],
        "NO2 (µg/m³)": [21.0, 17.8, 5.0, 1.0], "NOx (ppb)": [23.8, 21.4, 1.0, 1.0],
        "Ozone (µg/m³)": [8.9, 8.9, 9.0, 1.0]})
    df = ingest_opencity.normalise(raw)
    assert set(df.variable) == {"pm25", "no2", "o3"}          # NO and NOx ignored
    assert set(df.station_id) == {"ito_cpcb"} and len(df) == 8      # station-less row dropped
    ts = sorted(df.timestamp.unique())
    assert ts[0] == pd.Timestamp("2023-12-31 18:30", tz="UTC")      # 00:00 IST
    assert pd.Timestamp("2024-01-12 18:45", tz="UTC") in ts          # day > 12 not swapped
    assert ts[-1] == pd.Timestamp("2025-12-31 18:00", tz="UTC")


def test_opencity_2017_aqi_grid_format():
    hours = ",".join(f"{h:02d}:00:00" for h in range(24))
    lines = ["Year,2017", "January-2017," + hours,
             "1," + ",".join(["500.0"] * 23) + ",500",
             "2,410.0," + ",".join([""] * 22) + ",99",
             '"', '"', "February-2017," + hours,
             "4.0," + ",".join(["120.0"] * 24)]
    text = "\n".join(lines) + "\n"
    assert ingest_opencity.is_aqi_grid(text)
    df = ingest_opencity.parse_aqi_grid(text, ingest_opencity.station_from_filename("ITO CPCB 2017-2023"))
    assert set(df.variable) == {"aqi_reported"} and set(df.station_id) == {"ito_cpcb"}
    assert len(df) == 24 + 2 + 24                                  # blanks skipped
    assert df.timestamp.min() == pd.Timestamp("2016-12-31 18:30", tz="UTC")
    feb4 = df[df.timestamp.dt.tz_convert("Asia/Kolkata").dt.month == 2]
    assert (feb4.timestamp.dt.tz_convert("Asia/Kolkata").dt.day == 4).all()


def test_opencity_legacy_dayfirst_still_parses():
    raw = pd.DataFrame({"From Date": ["01-11-2019 00:00", "13-11-2019 01:00"],
                        "PM2.5 (ug/m3)": [300, 310], "Ozone (ug/m3)": [10, 12]})
    df = ingest_opencity.normalise(raw, station_name="Anand Vihar")
    assert sorted(df.timestamp.unique())[-1] == pd.Timestamp("2019-11-12 19:30", tz="UTC")


def test_kaggle_hour_end_ist_to_hour_start_utc():
    stations = pd.DataFrame({"StationId": ["DL002", "HR014", "MH001"],
                             "StationName": ["Anand Vihar, Delhi - DPCC", "Vikas Sadan, Gurugram - HSPCB",
                                             "Bandra, Mumbai - MPCB"],
                             "City": ["Delhi", "Gurugram", "Mumbai"],
                             "State": ["Delhi", "Haryana", "Maharashtra"]})
    hourly = pd.DataFrame({"StationId": ["DL002", "DL002", "HR014", "MH001"],
                           "Datetime": ["2015-01-01 01:00:00", "2019-11-13 15:00:00",
                                        "2020-07-01 00:00:00", "2019-11-13 15:00:00"],
                           "PM2.5": [300.0, 150.0, 40.0, 50.0], "PM10": [None, 250.0, 90.0, 80.0],
                           "NO2": [60.0, 50.0, 20.0, 10.0], "NOx": [99.0, 99.0, 99.0, 99.0],
                           "O3": [5.0, 80.0, 30.0, 20.0]})
    df = ingest_kaggle.normalise(hourly, stations)
    assert set(df.station_id) == {"anand_vihar_dpcc", "vikas_sadan_hspcb"}   # Mumbai dropped
    assert set(df.variable) == {"pm25", "pm10", "no2", "o3"}                  # NOx ignored
    assert len(df) == 4 + 3 + 4                                              # missing PM10 dropped
    ts = sorted(df.timestamp.unique())
    # "2015-01-01 01:00" IST hour-END -> hour starting 00:00 IST = 2014-12-31 18:30 UTC
    assert ts[0] == pd.Timestamp("2014-12-31 18:30", tz="UTC")
    # 15:00 IST end -> 14:00 IST start = 08:30 UTC (afternoon ozone stays in the afternoon)
    assert pd.Timestamp("2019-11-13 08:30", tz="UTC") in ts
    assert ts[-1] == pd.Timestamp("2020-06-30 17:30", tz="UTC")


def test_cams_requests_use_forecast_archive_and_lowest_level():
    single, multi = ingest_cams.build_requests("2019-11-01", "2019-11-30")
    assert single["type"] == ["forecast"] and "boundary_layer_height" in single["variable"]
    assert multi["model_level"] == ["137"] and set(multi["variable"]) == {"nitrogen_dioxide", "ozone"}
    _, old = ingest_cams.build_requests("2019-01-01", "2019-01-31")
    assert old["model_level"] == ["60"]
    assert single["leadtime_hour"] == [str(h) for h in range(12, 85)]  # only leads the model reads


def test_cams_chunks_fit_ads_cost_limit_and_split_at_level_change():
    chunks = ingest_cams.plan_chunks("2019-06-25", "2019-08-10")
    for kind, a, b in chunks:
        days = (pd.Timestamp(b) - pd.Timestamp(a)).days + 1
        assert days * ingest_cams.cost_per_day(kind) <= ingest_cams.ADS_COST_LIMIT
        cut = pd.Timestamp(config.CAMS_L137_START)
        assert not (pd.Timestamp(a) < cut <= pd.Timestamp(b))           # never straddles 60->137
    for kind in ("single", "multi"):                                    # contiguous, no gaps/overlaps
        spans = [(pd.Timestamp(a), pd.Timestamp(b)) for k, a, b in chunks if k == kind]
        assert spans[0][0] == pd.Timestamp("2019-06-25") and spans[-1][1] == pd.Timestamp("2019-08-10")
        assert all(n[0] - p[1] == pd.Timedelta(days=1) for p, n in zip(spans, spans[1:]))
    # ADS cost = runs x leads (12..84 = 73) x variables per day (verified against /costing)
    runs = len(config.CAMS_ISSUE_HOURS)
    assert ingest_cams.cost_per_day("single") == runs * 73 * 7
    assert ingest_cams.cost_per_day("multi") == runs * 73 * 2


def test_cams_plan_missing_skips_downloaded_dates(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "RAW_CAMS", tmp_path)
    for name in ("cams_fc_single_2025-01-01_2025-01-09.zip", "cams_fc_single_2025-01-19_2025-01-27.zip",
                 "cams_fc_multi_2025-01-01_2025-01-31.zip", "cams_fc_single_synthetic.zip"):
        (tmp_path / name).touch()
    plan = ingest_cams.plan_missing("2025-01-01", "2025-01-31")
    assert [c for c in plan if c[0] == "multi"] == []
    single_days = {d for _, a, b in plan for d in pd.date_range(a, b)}
    assert single_days == set(pd.date_range("2025-01-10", "2025-01-18")) | set(pd.date_range("2025-01-28", "2025-01-31"))


def test_cams_station_table_keeps_configured_runs_only(monkeypatch):
    import xarray as xr
    monkeypatch.setattr(config, "CAMS_ISSUE_HOURS", ["00:00"])
    issues = pd.to_datetime(["2025-01-01 00:00", "2025-01-01 12:00"]).to_numpy()
    ds = xr.Dataset({"pm25": (("issue_time", "lead", "latitude", "longitude"), np.ones((2, 2, 2, 2)))},
                    coords={"issue_time": issues, "lead": [12, 13], "latitude": [28.0, 29.0],
                            "longitude": [77.0, 78.0]})
    st = pd.DataFrame({"station_id": ["x"], "lat": [28.5], "lon": [77.5]})
    monkeypatch.setattr(ingest_cams, "open_file", lambda p: [ds])
    df = ingest_cams.station_table([Path("cams_fc_single_a_b.zip")], st)
    assert set(df.issue_time.dt.hour) == {0} and len(df) == 2
    # model-level chunks not downloaded yet: NO2/O3 still present, as NaN (stable schema)
    assert {"no2", "o3"} <= set(df.columns) and df[["no2", "o3"]].isna().all().all()


def test_residual_features_tolerate_missing_cams_vars():
    t = pd.date_range("2025-01-01", periods=3, freq="h", tz="UTC")
    obs = pd.DataFrame({"station_id": "x", "time": t, **{v: 1.0 for v in config.STATE_VARS}})
    cams = pd.DataFrame({"station_id": "x", "issue_time": t[0] - pd.Timedelta(hours=12),
                         "lead_hour": [12, 13, 14], "valid_time": t, "pm25": [0.5, 0.5, 0.5]})
    res = features.residual_features(obs, cams)
    assert (res["cams_res_pm25"] == 0.5).all() and res["cams_res_o3"].isna().all()


# ---------------------------------------------------------------- AQI
def test_cpcb_sub_index_and_categories():
    assert aqi.sub_index(45, "pm25") == pytest.approx(75)
    assert aqi.sub_index(250, "pm25") == pytest.approx(400)
    assert aqi.sub_index(2000, "pm25") == 500
    assert list(aqi.category([50, 51, 100, 101, 350, 401, np.nan])) == [0, 1, 1, 2, 4, 5, -1]


def test_aqi_uses_running_averages_and_three_pollutant_rule():
    T = 30
    hourly = {"pm25": np.full((T, 1), 100.0), "pm10": np.full((T, 1), 50.0),
              "no2": np.full((T, 1), 40.0), "o3": np.full((T, 1), 50.0)}
    hourly["pm25"][-1] = 1000.0  # one spike barely moves a 24 h mean
    a = aqi.aqi_from_hourly(hourly)
    assert np.isnan(a[:15]).all()               # < 16 h of data -> no 24 h average yet
    expected = aqi.sub_index((23 * 100 + 1000) / 24, "pm25")
    assert a[-1, 0] == pytest.approx(expected)
    only_two = aqi.aqi_from_hourly({"pm25": hourly["pm25"], "o3": hourly["o3"]})
    assert np.isnan(only_two).all()             # CPCB needs >= 3 pollutants


# ---------------------------------------------------------------- physics + graph
def test_ventilation_and_stagnation():
    vc = features.ventilation_coefficient(2.0, 3000.0)
    assert vc == 6000.0 and features.stagnation_index(vc) == pytest.approx(0.5)
    assert features.stagnation_index(0.0) == 1.0


def test_fire_influence_only_when_upwind():
    stations = pd.DataFrame({"station_id": ["a"], "lat": [28.6], "lon": [77.2]})
    times = pd.date_range("2019-11-01", periods=4, freq="h", tz="UTC")
    fires = pd.DataFrame({"lat": [30.5], "lon": [75.5], "frp": [100.0], "timestamp": [times[0]]})
    # NW fire: wind FROM the NW (blowing to SE) -> u>0, v<0
    obs_nw = pd.DataFrame({"station_id": "a", "time": times, "u10": 3.0, "v10": -3.0})
    obs_se = pd.DataFrame({"station_id": "a", "time": times, "u10": -3.0, "v10": 3.0})
    up = features.fire_influence_score(obs_nw, stations, fires)
    down = features.fire_influence_score(obs_se, stations, fires)
    assert (up > 0).all() and (down == 0).all()


def test_edge_weights_follow_wind():
    stations = pd.DataFrame({"station_id": ["w", "e"], "lat": [28.6, 28.6], "lon": [77.0, 77.2]})
    g = build_static_graph(stations, fire_nodes=fire_node_grid())
    sin_b, cos_b, decay = (np.array(g[k]) for k in ("sin_b", "cos_b", "decay"))
    is_fire = (np.array(g["edge_type"]) == 1).astype(float)
    u = np.full(len(decay), 5.0)  # wind blowing toward the east
    w = edge_weights(u, np.zeros_like(u), sin_b, cos_b, decay, is_fire)
    src, dst = g["edge_index"]
    w_to_e = w[[i for i in range(len(src)) if (src[i], dst[i]) == (0, 1)][0]]
    e_to_w = w[[i for i in range(len(src)) if (src[i], dst[i]) == (1, 0)][0]]
    assert w_to_e > e_to_w > 0  # downwind edge stronger; diffusion never fully zero


# ---------------------------------------------------------------- gaps
def test_read_met_wide_prefers_openmeteo_and_fills_blh_from_era5(tmp_path):
    t = pd.date_range("2024-06-30 22:00", periods=3, freq="h", tz="UTC")
    om = pd.concat([
        pd.DataFrame({"station_id": "ito_cpcb", "timestamp": t, "variable": "temperature_2m",
                      "value": [30.0, 31.0, 32.0], "units": "C", "source": "openmeteo_archive"}),
        pd.DataFrame({"station_id": "ito_cpcb", "timestamp": t[2:], "variable": "boundary_layer_height",
                      "value": [500.0], "units": "m", "source": "openmeteo_archive"})])
    era5 = pd.DataFrame({"station_id": "ito_cpcb", "timestamp": t, "variable": "boundary_layer_height",
                         "value": [100.0, 200.0, 999.0], "units": "m", "source": "era5_cds"})
    om.to_parquet(tmp_path / "archive_x.parquet"); era5.to_parquet(tmp_path / "era5_x.parquet")
    w = clean_align.read_met_wide([tmp_path / "archive_x.parquet", tmp_path / "era5_x.parquet"])
    w = w.sort_values("time")
    assert w["blh"].tolist() == [100.0, 200.0, 500.0]   # ERA5 only where Open-Meteo is missing
    assert w["t2m"].tolist() == [30.0, 31.0, 32.0]


def test_gap_fill_never_zero():
    t = pd.date_range("2017-01-01", periods=24 * 40, freq="h", tz="UTC")
    base = 100 + 50 * np.sin(np.arange(len(t)) / 10)
    a = base.copy(); a[10:12] = np.nan; a[200:230] = np.nan; a[500:] = np.nan
    df = pd.concat([pd.DataFrame({"station_id": "a", "time": t, "pm25": a}),
                    pd.DataFrame({"station_id": "b", "time": t, "pm25": base * 1.1})])
    df = clean_align.fill_short_gaps(df, ["pm25"])
    sa = df[df.station_id == "a"].set_index("time")
    assert (sa["pm25_flag"].iloc[10:12] == 1).all()
    assert sa["pm25"].iloc[200:230].isna().all()   # long gap not interpolated
    df = clean_align.fill_from_correlated(df, ["pm25"], fit_range=("2017-01-01", "2017-01-20"),
                                          min_overlap_hours=48)
    sa = df[df.station_id == "a"].set_index("time")
    assert (sa["pm25_flag"].iloc[200:230] == 2).all()
    np.testing.assert_allclose(sa["pm25"].iloc[200:230], base[200:230], rtol=1e-3)
    assert (df["pm25"].dropna() > 0).all()
    # a 460 h absence (> 7 days) is "station not operating": never neighbour-filled
    assert sa["pm25"].iloc[500:].isna().all() and sa["pm25_flag"].iloc[500:].isna().all()
