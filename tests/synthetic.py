"""Tiny synthetic raw data in each source's real on-disk format, for CPU tests.

Physics baked in so the model has something learnable:
* BLH follows a diurnal cycle; PM2.5 rises when BLH is low (trapping)
* a fire cluster NW of Delhi raises PM2.5 when the wind blows from the NW
* CAMS under-predicts PM2.5 increasingly with lead time (the day-2/day-3 drift)
"""

from __future__ import annotations

import zipfile

import numpy as np
import pandas as pd
import xarray as xr

import config

STATIONS = pd.DataFrame({
    "station_id": ["anand_vihar", "ito", "rk_puram", "dwarka", "rohini"],
    "name": ["Anand Vihar", "ITO", "R K Puram", "Dwarka", "Rohini"],
    "lat": [28.647, 28.629, 28.563, 28.581, 28.733],
    "lon": [77.316, 77.241, 77.187, 77.050, 77.120],
})


def _truth(times: pd.DatetimeIndex, rng) -> dict:
    h = np.arange(len(times))
    hour = times.hour.to_numpy()
    blh = 150 + 900 * np.clip(np.sin((hour - 1) / 24 * 2 * np.pi), 0, None) + rng.normal(0, 30, len(h))
    wd = (300 + 60 * np.sin(h / 50)) % 360                    # mostly from the NW
    ws = 2 + 1.5 * np.sin(h / 17) ** 2
    fire_on = (np.sin(h / 60) > 0.3).astype(float)
    pm25 = 60 + 120 * (400 / (blh + 250)) + 60 * fire_on + rng.normal(0, 8, len(h))
    return {"blh": blh, "wd": wd, "ws": ws, "fire_on": fire_on, "pm25": np.clip(pm25, 5, None),
            "t2m": 15 + 8 * np.sin((hour - 3) / 24 * 2 * np.pi)}


def make_raw(start: str = "2023-01-01", days: int = 40, seed: int = 0) -> dict:
    """Write stations.csv + raw OpenAQ, Open-Meteo archive, FIRMS and CAMS files."""
    config.ensure_dirs()
    rng = np.random.default_rng(seed)
    times = pd.date_range(start, periods=days * 24, freq="h", tz="UTC")
    tr = _truth(times, rng)
    STATIONS.to_csv(config.STATIONS_FILE, index=False)

    aq, met = [], []
    for k, st in enumerate(STATIONS.itertuples()):
        scale = 1 + 0.1 * k
        vals = {"pm25": tr["pm25"] * scale + rng.normal(0, 5, len(times)),
                "pm10": tr["pm25"] * 1.8 * scale, "no2": 40 + 20 * (400 / (tr["blh"] + 250)),
                "o3": 20 + 40 * np.clip(np.sin((times.hour - 6) / 24 * 2 * np.pi), 0, None)}
        for var, v in vals.items():
            v = v.copy()
            if var == "pm25":
                v[100:102] = np.nan          # short gap -> interpolated
                v[300 + 40 * k:340 + 40 * k] = np.nan  # long gap -> correlated-station fill
            aq.append(pd.DataFrame({"station_id": st.station_id, "timestamp": times,
                                    "variable": var, "value": v, "units": "µg/m³",
                                    "source": "openaq"}))
        mvals = {"temperature_2m": tr["t2m"], "relative_humidity_2m": np.full(len(times), 60.0),
                 "wind_speed_10m": tr["ws"], "wind_direction_10m": tr["wd"],
                 "boundary_layer_height": tr["blh"], "shortwave_radiation": np.zeros(len(times)),
                 "surface_pressure": np.full(len(times), 990.0)}
        for var, v in mvals.items():
            met.append(pd.DataFrame({"station_id": st.station_id, "timestamp": times,
                                     "variable": var, "value": v, "units": "",
                                     "source": "openmeteo_archive"}))
    aq = pd.concat(aq).dropna(subset=["value"])
    aq.to_parquet(config.RAW_OPENAQ / "openaq_synthetic.parquet", index=False)
    pd.concat(met).to_parquet(config.RAW_OPENMETEO / "archive_synthetic.parquet", index=False)

    # FIRMS: a Punjab cluster, active when fire_on
    fire_rows = []
    for i in np.where(tr["fire_on"] > 0)[0][::3]:
        for _ in range(3):
            fire_rows.append({"lat": 30.4 + rng.normal(0, 0.2), "lon": 75.6 + rng.normal(0, 0.2),
                              "timestamp": times[i], "frp": 20 + rng.random() * 30,
                              "brightness": 330.0, "confidence": "n", "source": "VIIRS_SNPP_SP"})
    pd.DataFrame(fire_rows).to_parquet(config.RAW_FIRMS / "firms_synthetic.parquet", index=False)

    write_cams(times, tr)
    return tr


def write_cams(times: pd.DatetimeIndex, tr: dict) -> None:
    """CAMS forecast NetCDF (new-ADS layout) with lead-dependent low bias, zipped."""
    issues = times[(times.hour % 12) == 0]
    leads = np.arange(0, config.CAMS_MAX_LEAD + 1)
    lat = np.array([29.2, 28.8, 28.4, 28.0])  # descending, like CAMS
    lon = np.array([76.4, 76.8, 77.2, 77.6, 78.0])
    t_index = {t: i for i, t in enumerate(times)}
    shape = (len(issues), len(leads), len(lat), len(lon))
    fields = {k: np.zeros(shape, dtype=np.float32) for k in ("pm2p5", "pm10", "t2m", "u10", "v10",
                                                            "blh", "sp", "no2", "go3")}
    for a, issue in enumerate(issues):
        for b, L in enumerate(leads):
            i = t_index.get(issue + pd.Timedelta(hours=int(L)), len(times) - 1)
            drift = 1 - 0.004 * L                    # bias grows with lead time
            pm = tr["pm25"][i] * drift
            fields["pm2p5"][a, b] = pm * 1e-9
            fields["pm10"][a, b] = pm * 1.7 * 1e-9
            wd = np.deg2rad(tr["wd"][i])
            fields["u10"][a, b] = -tr["ws"][i] * np.sin(wd)
            fields["v10"][a, b] = -tr["ws"][i] * np.cos(wd)
            fields["blh"][a, b] = tr["blh"][i] * (1 + 0.002 * L)
            fields["t2m"][a, b] = tr["t2m"][i] + 273.15 + 0.01 * L
            fields["sp"][a, b] = 99000.0
            rho = 99000.0 / (287.05 * (tr["t2m"][i] + 273.15))
            fields["no2"][a, b] = 35 / (rho * 1e9)
            fields["go3"][a, b] = 30 / (rho * 1e9)
    coords = {"forecast_reference_time": issues.tz_localize(None).to_numpy(),
              "forecast_period": (leads * np.timedelta64(1, "h")).astype("timedelta64[ns]"),
              "latitude": lat, "longitude": lon}
    dims = list(coords)
    single = xr.Dataset({k: (dims, fields[k]) for k in ("pm2p5", "pm10", "t2m", "u10", "v10", "blh", "sp")},
                        coords=coords)
    multi = xr.Dataset({k: (dims[:2] + ["model_level"] + dims[2:], fields[k][:, :, None])
                        for k in ("no2", "go3")}, coords={**coords, "model_level": [137]})
    for kind, ds in (("single", single), ("multi", multi)):
        nc = config.RAW_CAMS / f"data_{kind}.nc"
        ds.to_netcdf(nc)
        with zipfile.ZipFile(config.RAW_CAMS / f"cams_fc_{kind}_synthetic.zip", "w") as z:
            z.write(nc, nc.name)
        nc.unlink()
