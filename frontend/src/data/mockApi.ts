import { 
  Station, 
  StationForecast, 
  StationForecastHour, 
  DynamicGraphEdge, 
  Alert, 
  DataSourceStatus, 
  FIRMSFireHotspot, 
  FirePlumeTrajectory 
} from '../types';
import { DELHI_NCR_STATIONS } from './stations';
import { MOCK_FIRMS_HOTSPOTS, MOCK_FIRE_PLUMES } from './mockFirmsFires';
import { getAQICategory, pm25ToEstimatedAQI } from '../utils/aqi';

// Generate dynamic 72h forecast for all stations
export function generateStationForecasts(baseDate: Date = new Date()): Map<string, StationForecast> {
  const forecastMap = new Map<string, StationForecast>();

  DELHI_NCR_STATIONS.forEach((station) => {
    const hours: StationForecastHour[] = [];

    // Station specific baseline variation
    let basePm25 = 175;
    if (station.zone === 'East') basePm25 = 210; // Anand Vihar is notoriously higher
    if (station.zone === 'North') basePm25 = 195; // Wazirpur/Bawana industrial
    if (station.zone === 'West') basePm25 = 180;
    if (station.zone === 'South') basePm25 = 145; // Siri Fort/Aurobindo is cleaner
    if (station.isBoundaryNode) basePm25 = 260; // Fire boundary injection node

    for (let h = 0; h <= 72; h++) {
      const forecastTime = new Date(baseDate.getTime() + h * 3600 * 1000);
      const hourOfDay = forecastTime.getHours();

      // Diurnal meteorological cycle
      // Nighttime/early morning (02:00 - 08:00): low boundary layer, cold surface inversion
      const isNight = hourOfDay >= 21 || hourOfDay <= 8;
      const diurnalPBLH = isNight 
        ? 220 + Math.sin((hourOfDay / 24) * Math.PI) * 80 
        : 780 + Math.sin(((hourOfDay - 8) / 12) * Math.PI) * 320;

      // Stagnation progression: wind speed decreases progressively over 3 days
      const stagnationDecay = Math.max(0.4, 1.0 - (h / 72) * 0.45);
      const windSpeed = Number((Math.max(0.8, (2.6 * stagnationDecay) + (Math.sin(h / 6) * 0.5))).toFixed(1));
      
      // Wind direction: prevailing North-Westerly (300° - 325°) shifting slowly to Westerly
      const windDirection = Math.round(315 + Math.sin(h / 12) * 15);

      // Temperature cycle (°C)
      const temperature = Math.round(isNight ? 18 - (h * 0.05) : 29 - (h * 0.04) + Math.sin(hourOfDay) * 3);
      const humidity = Math.min(88, Math.max(35, Math.round(isNight ? 76 + (h * 0.1) : 46)));

      // Inversion Strength Index (0 to 100)
      // High index when PBLH is low and wind is calm
      const rawInversion = 100 - (diurnalPBLH / 1100) * 65 - (windSpeed / 4.0) * 35;
      const inversionIndex = Math.min(96, Math.max(12, Math.round(rawInversion + (h > 24 ? 12 : 0))));

      // Ventilation Coefficient = wind_speed * PBLH
      const ventilationCoefficient = Math.round(windSpeed * diurnalPBLH);

      // Fire plume influence score: peaks between +18h and +54h as plume reaches Delhi
      let fireInfluence = 35;
      if (h >= 14 && h <= 58) {
        fireInfluence = Math.min(95, Math.round(45 + Math.sin(((h - 14) / 44) * Math.PI) * 45));
      } else if (h > 58) {
        fireInfluence = 55;
      }
      if (station.isBoundaryNode) fireInfluence = 95;

      // CAMS Physics Baseline simulation:
      // Traditional CAMS physics underestimates severe stagnation entrapment on Day 2 & 3
      // and fails to resolve localized dynamic wind reweighting
      const camsBiasDecay = 1.0 - (h / 72) * 0.52; // CAMS drops off in day 2-3
      const camsPm25 = Math.round((basePm25 * 0.75 + (fireInfluence * 0.4)) * camsBiasDecay + (isNight ? 30 : -10));

      // GNN Residual Error Correction:
      // The GNN learns the non-linear coupling between shallow PBLH, calm wind, and upwind fire flux
      const gnnResidual = Math.round(
        (inversionIndex * 1.3) + 
        (fireInfluence * 0.95) + 
        (h >= 24 ? (h - 24) * 1.8 : 0) + 
        (isNight ? 45 : 10)
      );

      // Total GNN forecast = CAMS Physics + GNN Learned Residual
      const gnnPm25Expected = Math.max(45, camsPm25 + gnnResidual);

      // Confidence Interval grows wider with lead time (avoids false precision)
      const uncertaintyBand = Math.round(12 + (h / 72) * 38);
      const pm25CI = {
        lower: Math.max(25, gnnPm25Expected - uncertaintyBand),
        mean: gnnPm25Expected,
        upper: gnnPm25Expected + uncertaintyBand,
      };

      const calculatedAQI = pm25ToEstimatedAQI(pm25CI.mean);
      const aqiCI = {
        lower: pm25ToEstimatedAQI(pm25CI.lower),
        mean: calculatedAQI,
        upper: pm25ToEstimatedAQI(pm25CI.upper),
      };

      // PM10 (coarse particles)
      const pm10Mean = Math.round(gnnPm25Expected * 1.65);
      const pm10CI = {
        lower: Math.round(pm25CI.lower * 1.6),
        mean: pm10Mean,
        upper: Math.round(pm25CI.upper * 1.7),
      };

      // NO2 (combustion/traffic)
      const no2Mean = Math.round(isNight ? 68 + (h * 0.2) : 48 + Math.sin(hourOfDay) * 15);
      const no2CI = { lower: no2Mean - 12, mean: no2Mean, upper: no2Mean + 15 };

      // O3 (photochemical - peaks in bright daylight)
      const o3Mean = Math.round(!isNight ? 55 + Math.sin(((hourOfDay - 8) / 12) * Math.PI) * 35 : 18);
      const o3CI = { lower: Math.max(8, o3Mean - 10), mean: o3Mean, upper: o3Mean + 12 };

      hours.push({
        hour_offset: h,
        timestamp: forecastTime.toISOString(),
        pm25: pm25CI,
        pm10: pm10CI,
        no2: no2CI,
        o3: o3CI,
        aqi: aqiCI,
        category: getAQICategory(aqiCI.mean),
        cams_baseline_pm25: camsPm25,
        cams_baseline_aqi: pm25ToEstimatedAQI(camsPm25),
        gnn_residual_pm25: gnnResidual,
        weather: {
          temperature,
          relative_humidity: humidity,
          wind_speed: windSpeed,
          wind_direction: windDirection,
          boundary_layer_height: Math.round(diurnalPBLH),
        },
        physics: {
          ventilation_coefficient: ventilationCoefficient,
          inversion_index: inversionIndex,
          fire_influence_score: fireInfluence,
          stagnation_risk: inversionIndex > 75 ? 'Extreme' : inversionIndex > 55 ? 'High' : 'Moderate',
        },
      });
    }

    forecastMap.set(station.id, {
      station,
      hours,
    });
  });

  return forecastMap;
}

// Compute dynamic edges reweighted by wind direction & distance
export function computeDynamicGraphEdges(
  stations: Station[], 
  windDirectionDeg: number = 315
): DynamicGraphEdge[] {
  const edges: DynamicGraphEdge[] = [];
  const windRad = (windDirectionDeg * Math.PI) / 180;
  // Wind vector components (direction it is blowing TO = windDirection + 180)
  const toWindRad = ((windDirectionDeg + 180) % 360) * (Math.PI / 180);
  const wx = Math.sin(toWindRad);
  const wy = Math.cos(toWindRad);

  for (let i = 0; i < stations.length; i++) {
    for (let j = i + 1; j < stations.length; j++) {
      const s1 = stations[i];
      const s2 = stations[j];

      // Approximate distance (km)
      const dLat = (s2.lat - s1.lat) * 111;
      const dLon = (s2.lon - s1.lon) * 111 * Math.cos((s1.lat * Math.PI) / 180);
      const dist = Math.sqrt(dLat * dLat + dLon * dLon);

      // Only connect neighboring stations (< 22 km) or boundary fire nodes (< 180km)
      const maxDist = (s1.isBoundaryNode || s2.isBoundaryNode) ? 140 : 18;
      if (dist <= maxDist && dist > 0.5) {
        // Edge vector normalized
        const ex = dLon / dist;
        const ey = dLat / dist;

        // Alignment with wind vector
        const windAlignment = Math.max(0, ex * wx + ey * wy);

        // Distance decay
        const distDecay = Math.exp(-dist / (s1.isBoundaryNode || s2.isBoundaryNode ? 60 : 12));

        // Combined dynamic weight
        const weight = Number((0.35 * distDecay + 0.65 * windAlignment * distDecay).toFixed(3));

        if (weight > 0.08) {
          edges.push({
            id: `edge-${s1.id}-${s2.id}`,
            source_id: s1.id,
            target_id: s2.id,
            source_coords: [s1.lat, s1.lon],
            target_coords: [s2.lat, s2.lon],
            weight,
            wind_alignment: windAlignment,
            distance_km: Math.round(dist),
          });
        }
      }
    }
  }

  return edges;
}

// Proactive alerts with deep GNN causal reasoning
export const PROACTIVE_ALERTS: Alert[] = [
  {
    id: 'alert-stagnation-east-delhi',
    severity: 'severe',
    title: 'Severe Stagnation & Fire Plume Influx',
    subtitle: 'AQI forecast to breach 440 (Severe) across East & North Delhi within 36 hours',
    region: 'East & North-East Delhi (Anand Vihar, Patparganj, Sonia Vihar)',
    start_time: 'Expected onset: +32h to +36h',
    lead_time_hours: 36,
    peak_aqi: 458,
    grap_stage: 'Stage IV (Severe+)',
    causal_drivers: {
      pblh_drop: 540,
      wind_speed: 1.1,
      inversion_index: 88,
      fire_influence: 89,
      accumulation_stations: ['Anand Vihar', 'Vivek Vihar', 'Patparganj', 'Wazirpur'],
      narrative: 
        'Coupled GNN features indicate a high-risk multi-day entrapment event. ' +
        'Planetary Boundary Layer Height collapses from 820m to 210m during late night hours, ' +
        'coinciding with calm surface winds (< 1.2 m/s from NW). NASA FIRMS detects 14 major fire ' +
        'clusters in Sangrur and Patiala; the wind corridor transports biomass particulates directly ' +
        'into Delhi’s downwind eastern basin, creating a toxic thermal inversion ceiling.',
      chemical_factor: 'PM2.5/PM10 ratio exceeds 0.74, confirming dominant combustion origin (stubble + local diesel).',
      meteorological_factor: 'Ventilation coefficient drops to 1,430 m²/s (critical stagnation threshold < 2,000 m²/s).',
    },
    action_recommendations: [
      'Trigger GRAP Stage III/IV 24 hours prior to onset to suppress local building dust and heavy vehicular influx.',
      'Deploy localized mist anti-smog guns and mechanical vacuum sweepers along Anand Vihar & GT Road corridor.',
      'Issue targeted public health advisory: complete cessation of morning/evening outdoor athletic activities.',
      'Mandate hybrid/remote work for educational institutions in East Delhi zones.',
    ],
  },
  {
    id: 'alert-north-industrial-trap',
    severity: 'critical',
    title: 'Industrial Corridor Trapping Alert',
    subtitle: 'Wazirpur & Bawana industrial zones forecast to enter Very Poor / Severe band (+24h)',
    region: 'North & North-West Delhi (Wazirpur, Bawana, Jahangirpuri)',
    start_time: 'Expected onset: +22h',
    lead_time_hours: 24,
    peak_aqi: 412,
    grap_stage: 'Stage III (Severe)',
    causal_drivers: {
      pblh_drop: 420,
      wind_speed: 1.4,
      inversion_index: 76,
      fire_influence: 68,
      accumulation_stations: ['Wazirpur', 'Bawana', 'Jahangirpuri'],
      narrative: 
        'GNN spatial convolution detects high edge-weight influx from upwind Haryana corridors ' +
        'into low-dispersion industrial pockets. Combined localized industrial NOx with low surface ' +
        'wind creates intense secondary particulate formation.',
      chemical_factor: 'Secondary aerosol formation with high NO2 accumulation (94 µg/m³).',
      meteorological_factor: 'Near-surface temperature inversion of +3.4°C between 10m and 100m layers.',
    },
    action_recommendations: [
      'Enforce zero-tolerance compliance on non-PNG industrial fuels in Bawana & Wazirpur.',
      'Targeted traffic diversion at Mukarba Chowk and outer ring road.',
    ],
  },
];

// Data freshness status per source (demonstrates honesty about latency)
export const INITIAL_DATA_SOURCES: DataSourceStatus[] = [
  {
    id: 'src-ground',
    name: 'CPCB / OpenAQ Ground Stations',
    source_org: 'Central Pollution Control Board & CAAQMS Network',
    type: 'Ground Sensors',
    frequency: 'Hourly Cron Pull',
    last_updated: '8 minutes ago',
    latency_note: 'Real-time telemetry from 56 Delhi-NCR stations',
    status: 'operational',
    records_processed: '1,344 hourly station readings',
  },
  {
    id: 'src-weather',
    name: 'Open-Meteo High-Res Weather',
    source_org: 'ECMWF / DWD High-Resolution Model Stream',
    type: 'Numerical Weather',
    frequency: 'Hourly forecast pull',
    last_updated: '14 minutes ago',
    latency_note: '1 km resolution wind vectors, temperature, and relative humidity',
    status: 'operational',
    records_processed: '72-hour gridded atmospheric fields',
  },
  {
    id: 'src-fire',
    name: 'NASA FIRMS Active Fire Plumes',
    source_org: 'NASA Earthdata (VIIRS N20 + MODIS Terra/Aqua)',
    type: 'Satellite Fire',
    frequency: 'Hourly satellite swath ingest',
    last_updated: '48 minutes ago',
    latency_note: 'Near Real-Time (NRT) 375m fire radiative power (FRP) over Punjab & Haryana',
    status: 'operational',
    records_processed: '28 active fire hotspots detected in bounding box',
  },
  {
    id: 'src-cams',
    name: 'Copernicus CAMS Physics Baseline',
    source_org: 'European Centre for Medium-Range Weather Forecasts (ECMWF)',
    type: 'Global Chemistry',
    frequency: 'Once Daily (00:00 UTC run)',
    last_updated: 'Today at 05:30 IST (00 UTC run)',
    latency_note: 'Global chemistry model baseline; CAMS inherently updates once daily with ~6h assimilation latency',
    status: 'operational',
    records_processed: '5-day 0.4° gridded chemical forecast slice',
  },
  {
    id: 'src-modis',
    name: 'MODIS Aerosol Optical Depth (AOD)',
    source_org: 'NASA Earthdata MCD19A2',
    type: 'Aerosol Optical Depth',
    frequency: 'Daily daylight overpass',
    last_updated: '5 hours ago',
    latency_note: '1 km gridded AOD for column aerosol verification',
    status: 'operational',
    records_processed: 'Overpass raster integrated into station coords',
  },
];
