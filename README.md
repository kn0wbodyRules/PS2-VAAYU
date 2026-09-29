# VAAYU — coupled 72 h air-quality forecasting for Delhi-NCR

Smart India Hackathon **SIH26082** (MoES / NCMRWF, Clean & Green Technology).

VAAYU forecasts PM2.5, PM10, O3 and NO2 at Delhi-NCR monitoring stations 72 hours
ahead. A physics baseline, **CAMS** (Copernicus' global coupled weather-chemistry
forecast), is corrected by a **spatiotemporal graph neural network** that learns the
baseline's residual error. The target is the day-2/day-3 degradation of the operational
WRF-Chem system: PM2.5 bias drifts from about +2.5 µg/m³ on day 1 to about −17 µg/m³ on
day 3 (Jena et al., *Sci. Rep.* 2021, Oct 2019–Feb 2020).

---

## Architecture

```
 data.opencity.in ─┐                                   ┌─ CAMS forecast (issue_time, lead) ──────────┐
 OpenAQ / data.gov ┼─> raw (Drive, append-only) ─> clean_align ─> features ─> dataset windows          │
 Open-Meteo ERA5 ──┤                                   └─ FIRMS fires ─> fire-source nodes             │
 NASA FIRMS ───────┘                                                                                   │
                                                                                                       v
 per hour:  [state, obs-mask, baseline, physics(state), exog] ─> encoder ─> GATv2 over dynamic      baseline
            wind graph (stations + Punjab/Haryana fire nodes) ─> GRU per station ─> shared trunk ──┬──> + ─> forecast
                                                                      ├─> chemistry head: residual on CAMS  (pm25, pm10, o3, no2)
                                                                      └─> met head:       residual on met baseline (t2m, u10, v10, blh)
 72 h autoregressive rollout: each hour's combined chem+met forecast is fed back in. Ventilation,
 stagnation and graph edge weights are recomputed from the model's *own predicted* wind and BLH.
```

**How the two-way coupling works:**
- One shared trunk feeds both output heads.
- The rollout feeds chemistry and meteorology forecasts back in together, hour by hour, for all 72 hours.
- The physics features (ventilation coefficient = wind × BLH, stagnation index) and the wind-aligned graph edges are rebuilt at every step from the predicted met state.
- `evaluate.py`'s perturbation test checks the aerosol → met direction: raise the input PM2.5 and check the predicted BLH drops by more than a minimum effect.

**Where "high resolution" comes from:** the station network plus graph interpolation, **not** CAMS. CAMS is a global ~0.4° (~40 km) grid, so it covers Delhi in only 1–2 cells. VAAYU's spatial detail comes from the 30–39 ground stations and the wind-driven transport between them.

---

## Storage: three locations, never mixed

| Where | What | Path |
|---|---|---|
| This Git repo | code only, never data or models | `D:\Projects\PS2-VAAYU\` |
| Google Drive | all data + model artefacts | `G:\My Drive\PS2-VAAYU\` (laptop) / `/content/drive/MyDrive/PS2-VAAYU/` (Colab) |
| Google Colab | GPU runtime; clones the repo, mounts Drive | — |

`config.py` is the **only** file that defines paths. It detects Colab
(`COLAB_RELEASE_TAG` or `/content`) and picks the right Drive prefix.
`VAAYU_DRIVE_ROOT` overrides the detection (the tests use this).

```
PS2-VAAYU/ (Drive)
├── data/raw/{opencity,openaq,datagovin,openmeteo,firms,cams}/   append-only, never overwritten
├── data/raw/stations.csv                                       canonical station registry
├── data/processed/   obs_hourly, cams_station, features_hourly (.parquet), graph_static.json
├── models/checkpoints/<run_id>/   epoch_XXX.pt, best.pt
├── models/production/model.pt     the live model
├── models/registry.json           promotion history
└── logs/   train_<run_id>.json, metrics_<timestamp>.json
```

---

## Repo layout

| Path | Role |
|---|---|
| `config.py` | Drive paths (env-aware), API keys from `.env`, domain constants, splits, training defaults |
| `data_pipeline/ingest_openaq.py` | OpenAQ v3: station registry + hourly values; resumable per sensor. **Critical path**: the live bridge after 2023 |
| `data_pipeline/ingest_datagovin.py` | data.gov.in real-time snapshot, backup live feed (hourly cron) |
| `data_pipeline/ingest_opencity.py` | one-time normalisation of the opencity.in 2017–2023 CSVs (IST → UTC, header aliases) |
| `data_pipeline/ingest_openmeteo.py` | ERA5 archive (met truth incl. `boundary_layer_height`), live forecast, Previous Runs |
| `data_pipeline/ingest_firms.py` | VIIRS fire detections over Punjab + Haryana (SP history, NRT live) |
| `data_pipeline/ingest_cams.py` | CAMS **forecast archive** by issue time + lead; NetCDF reader, unit conversion, station interpolation |
| `preprocessing/clean_align.py` | hourly clock, unit unification, source priority, gap filling → `obs_hourly.parquet` |
| `preprocessing/features.py` | ventilation coefficient, stagnation index, upwind-cone fire influence, baseline residuals, time/season flags |
| `graph/build_graph.py` | station + fire-node graph, wind-aligned dynamic edge weights |
| `model/dataset.py` | dense arrays, leakage-safe splits, train-only normalisation, windows |
| `model/gnn_model.py` | the coupled GNN and its rollout |
| `model/train.py` | loss, teacher forcing → scheduled sampling, checkpointing |
| `model/evaluate.py` | metrics JSON (see below) |
| `model/aqi.py` | CPCB AQI sub-index formula |
| `model/promote.py` | registry-based promotion to `models/production/model.pt` |
| `backend/` | FastAPI app, model loader (hot reload on promotion), inference |
| `notebooks/train_colab.ipynb` | the Colab GPU run, end to end |
| `tests/` | CPU tests on synthetic data in every source's real format |

---

## Key design decisions

1. **CAMS forecast archive, not reanalysis.**
   - Dataset `cams-global-atmospheric-composition-forecasts`, `type: forecast`, keyed `(issue_time, lead_hour)`.
   - EAC4 reanalysis has no forecast drift, so a model trained on it would never see the bias it's meant to fix.
   - NO2 and O3 are multi-level fields, so we take the lowest model level: level 137 from 2019-07-07, level 60 before. Values are converted kg/kg → µg/m³ using air density (surface pressure, T2m).
   - PM is converted kg/m³ → µg/m³.
2. **The physical-consistency loss is gated by fire influence.** "Wind up but PM2.5 not down" is penalised only when `fire_influence_score` is low. During upwind stubble-burning transport, stronger wind *should* raise PM2.5.
3. **Both heads predict residuals.** Chemistry corrects CAMS, and meteorology corrects a met forecast baseline. Open-Meteo's ERA5 `boundary_layer_height` (checked against the live API) is the BLH input and target; BLH is not derived from CAMS.
   - **Deviation from the original plan:** Open-Meteo's lead-time forecast archive (Previous Runs API) mostly starts in **Jan 2024**, and it returns **no BLH** at all (checked for GFS, ECMWF and ICON). It therefore can't be the met baseline for 2017–2023 training.
   - The default met baseline is `MET_BASELINE_SOURCE="cams"`: CAMS forecast T2m, 10 m winds and BLH, lead-resolved back to 2015. Open-Meteo stays the met ground truth.
   - `VAAYU_MET_BASELINE=openmeteo` switches T2m and winds to Previous Runs for 2024+ data (BLH still comes from CAMS).
4. **Rollout training schedule.**
   - Pure teacher forcing for `teacher_forcing_epochs`.
   - Then scheduled sampling: the probability of feeding observed truth ramps 1 → 0 over `sampling_ramp_epochs`.
   - The rollout horizon grows 24 → 72 h over the same period, which keeps early GPU epochs cheap.
   - "Best" checkpoints are only selected once the model is free-running at the full 72 h.
5. **Coupling perturbation test.** `evaluate.py` adds +100 µg/m³ PM2.5 to the 24 h input window. The test passes only if the mean day-1 predicted BLH drops by more than 5 m.
6. **Benchmark slice.**
   - Oct 2019–Feb 2020 is purged from training: no training window touches it.
   - It is scored separately and its PM2.5 bias per forecast day is set against Jena et al.
   - This is in addition to the 2024–25 test split (opencity.in real concentrations), which covers two Oct–Nov stubble-burning seasons.
7. **NO2, not NOx,** everywhere: schema, heads, metrics. This matches both CAMS output and CPCB's AQI parameter.
8. **CPCB AQI formula.**
   - 24 h running averages for PM2.5, PM10 and NO2, with at least 16 valid hours.
   - 8 h running average for O3, with at least 6 valid hours.
   - Piecewise-linear sub-indices; the worst sub-index sets the AQI.
   - At least 3 pollutants are required, including PM2.5 or PM10.
   - The 23 h before the forecast start come from observations, so early leads have full averaging windows.
9. **High resolution comes from the stations plus the graph** (see above).
10. **Live data is critical path.** opencity.in ground truth stops in 2023, so OpenAQ (primary) and data.gov.in (backup) are what keep the system usable today.

**Gap policy.**
- Interior gaps of ≤ 3 h are linearly interpolated.
- Longer gaps are filled from the most-correlated station: a linear fit, correlation ≥ 0.7, fitted on the training range only.
- Anything else stays missing. Values are **never zero-filled.**
- Filled values are used as model *inputs* only. Targets are real observations; the loss masks everything else.

**Training loss** = severity-weighted Huber on chemistry (Poor ×2, Very Poor ×3, Severe ×4) + 0.5 × met Huber + 0.1 × the gated physics penalty.

**Forecast timing.** A CAMS run issued at time I is treated as usable from I + 12 h (`CAMS_LATENCY_HOURS`). A forecast starting at T0 therefore uses leads 13–84 h of the latest usable run. This matches operational reality.

---

## Metrics (`logs/metrics_<timestamp>.json`)

For each split (`test`, `benchmark`, `val`):
- RMSE, MAE and bias per variable at leads 24/48/72 h and per forecast day, for VAAYU and for the raw baseline, with % improvement.
- CPCB AQI category accuracy per day.
- Recall and precision for Severe and Very-Poor-or-worse hours.
- The perturbation test (`test` only) and the Jena comparison (`benchmark` only).

`score` = mean PM2.5 RMSE over days 2–3 on the test split (lower is better).

**Promotion** (`promote.py`) happens only if the new score beats production by ≥ 1% **and** day-3 Very-Poor-or-worse recall drops by no more than 0.05. The model is copied atomically to `models/production/model.pt`, and every decision is logged in `models/registry.json`.

---

## Setup

```bash
python -m venv .venv
.venv\Scripts\activate          # Windows
pip install -r requirements.txt
copy .env.example .env          # then fill in the keys
```

Keys:
- [OpenAQ](https://explore.openaq.org/register)
- [NASA FIRMS MAP_KEY](https://firms.modaps.eosdis.nasa.gov/api/map_key/)
- [Copernicus ADS](https://ads.atmosphere.copernicus.eu/profile) — accept the CAMS global forecast licence once on the website
- data.gov.in (optional backup)

Open-Meteo needs no key.

### Run order (what the Colab notebook does)

```bash
python -m data_pipeline.ingest_openaq locations          # builds data/raw/stations.csv
python -m data_pipeline.ingest_opencity                  # CSVs in data/raw/opencity/csv/
python -m data_pipeline.ingest_openmeteo archive 2015-01-01 2025-12-31
python -m data_pipeline.ingest_firms history 2015-01-01 2025-12-31
python -m data_pipeline.ingest_cams 2015-01-01 2025-12-31
python -m preprocessing.clean_align
python -m preprocessing.features
python -m graph.build_graph
python -m model.train
python -m model.evaluate <Drive>/models/checkpoints/<run_id>/best.pt
python -m model.promote <checkpoint> <metrics.json>
```

Hourly live cron:
- `ingest_openaq latest`
- `ingest_datagovin`
- `ingest_openmeteo forecast`
- `ingest_firms latest`
- daily `ingest_cams` for the new runs
- then `clean_align` → `features`

### Serve

```bash
uvicorn backend.main:app --host 0.0.0.0 --port 8010
```

Endpoints:
- `GET /health`
- `GET /model`
- `GET /stations`
- `GET /forecast?station_id=ito_cpcb&hours=72&as_of=2025-11-05` (`as_of` optional: replay a past date)
- `POST /forecast/refresh`
- `GET /fires?hours=24` (FIRMS stubble-burning overlay)
- `GET /alerts?min_category=poor` (alert feed)

The loader reloads automatically when `model.pt` is replaced. The full request/response
contract for the dashboard is in [docs/API.md](docs/API.md). CORS is open by default.

### Tests (CPU, synthetic data, nothing touches the real Drive)

```bash
pytest -q
```

---

## Data finding: what opencity.in actually contains

Checked against real downloads for ITO CPCB on 2026-09-27:

| File | Contents | Use |
|---|---|---|
| `<Station> AQI Data 2017-2023` | **AQI index only**, hourly (month × day × 24-hour grid, capped at 500). No concentrations. | Stored as `aqi_reported`, to validate our CPCB AQI calculation. **Not a training target.** |
| `<Station> 15 minute AQI Data for 2024-25` | PM2.5, PM10, NO2, O3 (+ others) every 15 min, 2024-01-01 → 2025-12-31 | Real ground truth, averaged to hourly |

The 2024-25 files label timestamps "+0000", but they are **IST**: ozone peaks at 14:00 on the label clock. `ingest_opencity` treats all opencity times as IST.

**Implication:** hourly *concentrations* for 2017–2023 have to come from somewhere else, either the OpenAQ history (`ingest_openaq hours`) or the Kaggle "Air Quality Data in India" `station_hour.csv` (2015–2020). Meanwhile, opencity 2024–25 gives two full years of recent ground truth, including two stubble-burning seasons.

## Dashboard (AERIS frontend)

`frontend/` is the AERIS React + Vite dashboard. It reads the `/api/*` contract served by
[backend/frontend_api.py](backend/frontend_api.py) from real data: the promoted model's
forecast, the raw CAMS baseline, FIRMS fires, the station graph and the held-out test metrics.

```bash
cd frontend && npm ci && npm run build      # once, or after frontend changes
cd .. && uvicorn backend.main:app --host 0.0.0.0 --port 8010
```

Open **http://127.0.0.1:8010**. FastAPI serves the built dashboard at `/`, so one process and
one URL run the whole demo. For hot-reload development, run `npm run dev` in `frontend/`
instead; it proxies `/api` to port 8010.

- **Demo date:** there is no live observation feed, so the default forecast is from the latest
  processed data (31 Dec 2025). Set `AERIS_AS_OF=2025-11-05` (backend) or `VITE_AS_OF=2025-11-05`
  (frontend `.env.local`) to replay a stubble-season forecast. Only data available at that time
  is used.
- **Honesty rules:**
  - Confidence bands are the empirical 10–90% test-set errors (`backend/calibration.json`).
  - The third comparison line is **persistence**; no WRF-Chem forecasts are publicly available.
  - Plume paths appear only when the forecast wind actually reaches Delhi.
  - If the backend is unreachable, the UI falls back to bundled mock data and shows a red
    **MOCK DATA** banner.

## References

Papers, datasets and methods behind every design choice, with verified links: [docs/REFERENCES.md](docs/REFERENCES.md).

## Status and open items

- [ ] Confirm OpenAQ's real Delhi coverage (pollutants per station, hourly density), then decide whether it's primary or live-only.
- [ ] Lock the final station list (`stations.csv`). Stations only in opencity need lat/lon added by hand; `ingest_opencity` lists them.
- [ ] Check `ingest_opencity` header aliases against a real downloaded CSV.
- [ ] First real CAMS pull: confirm the NetCDF dimension names match `ingest_cams._normalise`. The new ADS layout is handled; older `time`/`step` names are also mapped.
- [ ] Dashboard (separate frontend, built against [docs/API.md](docs/API.md)).
- [ ] Not built yet: MODIS AOD (stretch).
