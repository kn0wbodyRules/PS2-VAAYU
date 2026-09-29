export type AQICategory = 
  | 'Good' 
  | 'Satisfactory' 
  | 'Moderate' 
  | 'Poor' 
  | 'Very Poor' 
  | 'Severe';

export interface Station {
  id: string;
  name: string;
  city: string;
  state: 'Delhi' | 'Haryana' | 'Uttar Pradesh' | 'Punjab';
  lat: number;
  lon: number;
  isBoundaryNode: boolean;
  zone: 'North' | 'South' | 'East' | 'West' | 'Central' | 'NCR North' | 'NCR South' | 'NCR East' | 'Boundary Fire Node';
  elevation_m?: number;
}

export interface WeatherValues {
  temperature: number; // °C
  relative_humidity: number; // %
  wind_speed: number; // m/s
  wind_direction: number; // degrees 0-360
  boundary_layer_height: number; // meters (PBLH)
  surface_pressure?: number; // hPa
}

export interface DerivedPhysics {
  ventilation_coefficient: number; // m^2/s = wind_speed * PBLH
  inversion_index: number; // 0 - 100 (high = severe thermal inversion trapping pollutants)
  fire_influence_score: number; // 0 - 100 (upwind FIRMS fire plume flux)
  stagnation_risk: 'Low' | 'Moderate' | 'High' | 'Extreme';
}

export interface ConfidenceInterval {
  lower: number; // 10th percentile
  mean: number;  // Expected value
  upper: number; // 90th percentile
}

export interface StationForecastHour {
  hour_offset: number; // 0 to 72
  timestamp: string;
  pm25: ConfidenceInterval;
  pm10: ConfidenceInterval;
  no2: ConfidenceInterval;
  o3: ConfidenceInterval;
  aqi: ConfidenceInterval;
  category: AQICategory;
  
  // Physics vs GNN residual components
  cams_baseline_pm25: number;
  cams_baseline_aqi: number;
  gnn_residual_pm25: number; // Residual correction added to CAMS: GNN = CAMS + Residual
  persistence_pm25?: number; // naive baseline: mean of the last 24 h of observations
  
  weather: WeatherValues;
  physics: DerivedPhysics;
}

export interface StationForecast {
  station: Station;
  hours: StationForecastHour[];
}

export interface DynamicGraphEdge {
  id: string;
  source_id: string;
  target_id: string;
  source_coords: [number, number];
  target_coords: [number, number];
  weight: number; // Dynamic edge weight 0 - 1
  wind_alignment: number; // Cosine similarity with wind vector
  distance_km: number;
}

export interface CausalDriverDetail {
  pblh_drop: number; // meters dropped
  wind_speed: number; // m/s
  inversion_index: number; // 0-100
  fire_influence: number; // 0-100
  accumulation_stations: string[];
  narrative: string;
  chemical_factor: string;
  meteorological_factor: string;
}

export interface Alert {
  id: string;
  severity: 'warning' | 'critical' | 'severe';
  title: string;
  subtitle: string;
  region: string;
  start_time: string;
  lead_time_hours: number;
  peak_aqi: number;
  grap_stage: 'Stage I (Poor)' | 'Stage II (Very Poor)' | 'Stage III (Severe)' | 'Stage IV (Severe+)';
  causal_drivers: CausalDriverDetail;
  action_recommendations: string[];
}

export interface FIRMSFireHotspot {
  id: string;
  lat: number;
  lon: number;
  brightness: number; // Kelvin
  frp: number; // Fire Radiative Power in MW
  confidence: number | string; // VIIRS: 'nominal' | 'high' (MODIS would be a %)
  acq_time: string;
  district: string;
  state: 'Punjab' | 'Haryana';
}

export interface FirePlumeTrajectory {
  source_id: string;
  source_name: string;
  points: [number, number][]; // Line coordinates [lat, lon]
  current_wind_speed_kmh: number;
  eta_delhi_hours: number;
  plume_intensity: 'Light' | 'Moderate' | 'Heavy' | 'Extreme';
  corridor_bearing_deg: number;
}

export interface DataSourceStatus {
  id: string;
  name: string;
  source_org: string;
  type: 'Ground Sensors' | 'Numerical Weather' | 'Satellite Fire' | 'Global Chemistry' | 'Aerosol Optical Depth';
  frequency: string;
  last_updated: string;
  latency_note: string;
  status: 'operational' | 'syncing' | 'delayed';
  records_processed: string;
}

export interface TrackRecordEntry {
  lead_time: '24h' | '48h' | '72h';
  timestamp: string;
  actual_pm25: number;
  actual_aqi: number;
  gnn_pm25: number;
  gnn_aqi: number;
  cams_pm25: number;
  cams_aqi: number;
  persist_pm25: number | null; // persistence baseline (no public WRF-Chem forecasts to compare)
  persist_aqi: number | null;
  station_name: string;
}

export interface ModelAccuracyStats {
  lead_time: '24h' | '48h' | '72h';
  gnn_mae: number;
  gnn_rmse: number;
  gnn_r2: number;
  cams_mae: number;
  cams_rmse: number;
  cams_r2: number;
  persist_mae: number; // persistence baseline (mean of last 24 h)
  persist_rmse: number;
  persist_r2: number;
  extreme_event_recall: number; // % (Very Poor or worse hours flagged)
  category_accuracy: number; // %
  // extended held-out test statistics (served by the real backend; absent in mock data)
  gnn_vp_recall?: number; cams_vp_recall?: number; persist_vp_recall?: number;
  gnn_vp_false_alarm?: number | null; cams_category_accuracy?: number; persist_category_accuracy?: number;
  gnn_within_one_band?: number; gnn_severe_binary_accuracy?: number;
  gnn_pearson_r?: number; cams_pearson_r?: number; persist_pearson_r?: number;
  gnn_within_25?: number; n_station_hours?: number;
}

export type ViewMode = 'authority' | 'public';
export type AuthorityTab = 'home' | 'map' | 'inversion-fire' | 'comparison' | 'track-record';
