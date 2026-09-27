# VAAYU backend API (for the dashboard)

Run locally:

```bash
uvicorn backend.main:app --host 0.0.0.0 --port 8000
```

Base URL `http://localhost:8000`. Interactive docs: `http://localhost:8000/docs`.
CORS is open (`*`) by default so a dev server on another port can call it; restrict with
`VAAYU_CORS_ORIGINS="http://localhost:5173,https://your.site"`.

All times are **UTC, ISO 8601**. Concentrations are **µg/m³**. Missing values are `null`.
Until a model is trained and promoted, data endpoints return **503** with a message.

---

## `GET /health`
```json
{"status": "ok", "environment": "local", "model_present": true, "features_present": true}
```

## `GET /model`
Production model metadata: `run_id`, `epoch`, `val_loss`, `saved_at`, `history` (24),
`horizon` (72), `latency` (12), `n_stations`, `path`.

## `GET /stations`  → map markers
```json
[{"station_id": "ito_cpcb", "lat": 28.6286, "lon": 77.2410}, ...]
```

## `GET /forecast?station_id=<id>&hours=<1..72>`  → map + time slider + charts
Both parameters optional (default: all stations, 72 h). One row per station per lead hour.
```json
{
  "run_id": "run_20260928T060000Z",
  "issued_from": "2025-11-01T12:00:00+00:00",      // forecast start T0
  "forecast": [
    {
      "station_id": "ito_cpcb", "lead_hour": 1, "valid_time": "2025-11-01T13:00:00+00:00",

      "pm25": 212.4, "pm10": 388.1, "o3": 41.2, "no2": 78.5,        // VAAYU forecast
      "t2m": 24.1, "u10": -1.2, "v10": 0.8, "blh": 420.0,            // VAAYU met (degC, m/s, m)

      "cams_pm25": 150.2, "cams_pm10": 260.9, "cams_o3": 55.0, "cams_no2": null,   // raw CAMS
      "cams_t2m": 23.8, "cams_u10": -1.0, "cams_v10": 0.9, "cams_blh": 390.0,       // baseline

      "wind_speed": 1.44, "ventilation_coef": 604.8,     // m/s, m2/s
      "stagnation_index": 0.91,                          // inversion strength 0..1 (1 = trapped)
      "aqi": 342.0, "category": "very_poor"              // CPCB AQI + category
    }
  ]
}
```
- **Map colour**: `category` ∈ `good | satisfactory | moderate | poor | very_poor | severe`
  (CPCB colours: green, light green, yellow, orange, red, maroon). `aqi` can be `null` in the first
  hours if the station has too little recent data (CPCB needs 16 h of the 24 h average).
- **Inversion gauge**: `stagnation_index` (1 = no ventilation / strong inversion, 0.5 at
  ventilation coefficient 6000 m²/s), plus `blh` and `ventilation_coef`.
- **Model vs CAMS**: plot `pm25` vs `cams_pm25` over `lead_hour` (the correction is the gap;
  day 2-3 is where it matters).
- **Wind arrows / plume direction**: `u10` (towards east), `v10` (towards north).

## `POST /forecast/refresh`
Recomputes the forecast from the latest processed data. `{"rows": 4032, "run_id": "..."}`

## `GET /fires?hours=<1..240>`  → stubble-burning overlay
Fire detections (NASA FIRMS VIIRS) in Punjab/Haryana in the `hours` before the forecast start.
```json
{"issued_from": "2025-11-01T12:00:00+00:00", "hours": 24, "count": 1532,
 "fires": [{"lat": 30.41, "lon": 75.62, "timestamp": "2025-11-01T08:12:00+00:00", "frp": 18.7}, ...]}
```
`frp` = fire radiative power (MW): use for marker size. Draw the plume path from the fire
cluster towards Delhi along the forecast wind (`u10`, `v10`).

## `GET /alerts?min_category=<moderate|poor|very_poor|severe>`  → alert feed
Default `poor`. One entry per station forecast to reach that category or worse, most severe first.
```json
{"issued_from": "2025-11-01T12:00:00+00:00", "min_category": "poor",
 "alerts": [{"station_id": "anand_vihar_dpcc", "first_lead_hour": 7,
             "first_valid_time": "2025-11-01T19:00:00+00:00", "worst_category": "severe",
             "peak_aqi": 437.0, "peak_valid_time": "2025-11-02T21:00:00+00:00",
             "peak_stagnation_index": 0.96}]}
```
