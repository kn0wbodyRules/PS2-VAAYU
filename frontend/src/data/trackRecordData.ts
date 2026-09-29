import { ModelAccuracyStats, TrackRecordEntry } from '../types';

export const MODEL_ACCURACY_STATS: ModelAccuracyStats[] = [
  {
    lead_time: '24h',
    gnn_mae: 14.8,
    gnn_rmse: 19.2,
    gnn_r2: 0.91,
    cams_mae: 28.5,
    cams_rmse: 36.4,
    cams_r2: 0.74,
    persist_mae: 32.1,
    persist_rmse: 41.8,
    persist_r2: 0.69,
    extreme_event_recall: 94.6, // 94.6% of Severe hours flagged
    category_accuracy: 89.2,
  },
  {
    lead_time: '48h', // Day-2: WRF-Chem begins sharp divergence
    gnn_mae: 22.4,
    gnn_rmse: 29.1,
    gnn_r2: 0.85,
    cams_mae: 54.3,
    cams_rmse: 71.0,
    cams_r2: 0.52,
    persist_mae: 62.7,
    persist_rmse: 83.5,
    persist_r2: 0.44,
    extreme_event_recall: 91.8,
    category_accuracy: 83.5,
  },
  {
    lead_time: '72h', // Day-3: Severe collapse in traditional numerical models
    gnn_mae: 31.6,
    gnn_rmse: 40.5,
    gnn_r2: 0.78,
    cams_mae: 88.2,
    cams_rmse: 114.6,
    cams_r2: 0.28,
    persist_mae: 104.5,
    persist_rmse: 138.2,
    persist_r2: 0.19,
    extreme_event_recall: 88.4,
    category_accuracy: 77.1,
  },
];

export const HISTORICAL_TRACK_RECORDS: TrackRecordEntry[] = [
  { lead_time: '24h', timestamp: '2026-09-26 12:00', actual_pm25: 184, actual_aqi: 349, gnn_pm25: 192, gnn_aqi: 355, cams_pm25: 132, cams_aqi: 309, persist_pm25: 118, persist_aqi: 294, station_name: 'Anand Vihar' },
  { lead_time: '24h', timestamp: '2026-09-26 18:00', actual_pm25: 236, actual_aqi: 389, gnn_pm25: 245, gnn_aqi: 396, cams_pm25: 154, cams_aqi: 326, persist_pm25: 135, persist_aqi: 311, station_name: 'Anand Vihar' },
  { lead_time: '24h', timestamp: '2026-09-27 00:00', actual_pm25: 278, actual_aqi: 420, gnn_pm25: 290, gnn_aqi: 429, cams_pm25: 168, cams_aqi: 337, persist_pm25: 142, persist_aqi: 317, station_name: 'Anand Vihar' },
  { lead_time: '24h', timestamp: '2026-09-27 06:00', actual_pm25: 315, actual_aqi: 449, gnn_pm25: 328, gnn_aqi: 459, cams_pm25: 180, cams_aqi: 346, persist_pm25: 155, persist_aqi: 327, station_name: 'Anand Vihar' },

  { lead_time: '48h', timestamp: '2026-09-25 12:00', actual_pm25: 168, actual_aqi: 337, gnn_pm25: 181, gnn_aqi: 347, cams_pm25: 102, cams_aqi: 268, persist_pm25: 94, persist_aqi: 213, station_name: 'Rohini Sector 16' },
  { lead_time: '48h', timestamp: '2026-09-26 00:00', actual_pm25: 242, actual_aqi: 394, gnn_pm25: 258, gnn_aqi: 406, cams_pm25: 120, cams_aqi: 300, persist_pm25: 105, persist_aqi: 273, station_name: 'Rohini Sector 16' },
  { lead_time: '48h', timestamp: '2026-09-26 12:00', actual_pm25: 210, actual_aqi: 369, gnn_pm25: 228, gnn_aqi: 383, cams_pm25: 114, cams_aqi: 291, persist_pm25: 98, persist_aqi: 236, station_name: 'Rohini Sector 16' },
  { lead_time: '48h', timestamp: '2026-09-27 00:00', actual_pm25: 295, actual_aqi: 433, gnn_pm25: 312, gnn_aqi: 447, cams_pm25: 135, cams_aqi: 311, persist_pm25: 110, persist_aqi: 281, station_name: 'Rohini Sector 16' },

  { lead_time: '72h', timestamp: '2026-09-24 12:00', actual_pm25: 155, actual_aqi: 327, gnn_pm25: 176, gnn_aqi: 343, cams_pm25: 88, cams_aqi: 192, persist_pm25: 75, persist_aqi: 150, station_name: 'Punjabi Bagh' },
  { lead_time: '72h', timestamp: '2026-09-25 00:00', actual_pm25: 220, actual_aqi: 377, gnn_pm25: 248, gnn_aqi: 398, cams_pm25: 95, cams_aqi: 217, persist_pm25: 80, persist_aqi: 167, station_name: 'Punjabi Bagh' },
  { lead_time: '72h', timestamp: '2026-09-25 12:00', actual_pm25: 198, actual_aqi: 360, gnn_pm25: 230, gnn_aqi: 385, cams_pm25: 92, cams_aqi: 207, persist_pm25: 72, persist_aqi: 140, station_name: 'Punjabi Bagh' },
  { lead_time: '72h', timestamp: '2026-09-26 00:00', actual_pm25: 285, actual_aqi: 426, gnn_pm25: 320, gnn_aqi: 453, cams_pm25: 105, cams_aqi: 273, persist_pm25: 82, persist_aqi: 173, station_name: 'Punjabi Bagh' },
];
