import { FIRMSFireHotspot, FirePlumeTrajectory } from '../types';

export const MOCK_FIRMS_HOTSPOTS: FIRMSFireHotspot[] = [
  // Sangrur cluster (dense stubble burning zone)
  { id: 'firms-01', lat: 30.284, lon: 75.812, brightness: 342.8, frp: 78.4, confidence: 95, acq_time: '1h ago (VIIRS N20)', district: 'Sangrur', state: 'Punjab' },
  { id: 'firms-02', lat: 30.210, lon: 75.890, brightness: 338.2, frp: 64.1, confidence: 91, acq_time: '1h ago (VIIRS N20)', district: 'Sangrur', state: 'Punjab' },
  { id: 'firms-03', lat: 30.330, lon: 75.760, brightness: 351.4, frp: 92.0, confidence: 98, acq_time: '1h ago (VIIRS N20)', district: 'Sangrur', state: 'Punjab' },
  { id: 'firms-04', lat: 30.170, lon: 75.950, brightness: 329.5, frp: 48.7, confidence: 88, acq_time: '2h ago (MODIS Aqua)', district: 'Sangrur', state: 'Punjab' },

  // Tarn Taran / Amritsar cluster
  { id: 'firms-05', lat: 31.450, lon: 74.920, brightness: 345.1, frp: 81.3, confidence: 94, acq_time: '1h ago (VIIRS N20)', district: 'Tarn Taran', state: 'Punjab' },
  { id: 'firms-06', lat: 31.520, lon: 75.010, brightness: 332.9, frp: 55.6, confidence: 89, acq_time: '2h ago (VIIRS N20)', district: 'Amritsar', state: 'Punjab' },
  { id: 'firms-07', lat: 31.390, lon: 74.880, brightness: 360.2, frp: 110.5, confidence: 99, acq_time: '1h ago (VIIRS N20)', district: 'Tarn Taran', state: 'Punjab' },

  // Firozpur / Moga cluster
  { id: 'firms-08', lat: 30.820, lon: 75.140, brightness: 334.6, frp: 58.2, confidence: 90, acq_time: '2h ago (MODIS Aqua)', district: 'Moga', state: 'Punjab' },
  { id: 'firms-09', lat: 30.910, lon: 75.050, brightness: 341.0, frp: 72.8, confidence: 93, acq_time: '1h ago (VIIRS N20)', district: 'Firozpur', state: 'Punjab' },

  // Patiala cluster
  { id: 'firms-10', lat: 30.340, lon: 76.380, brightness: 336.4, frp: 61.3, confidence: 91, acq_time: '1h ago (VIIRS N20)', district: 'Patiala', state: 'Punjab' },
  { id: 'firms-11', lat: 30.220, lon: 76.450, brightness: 348.0, frp: 86.4, confidence: 96, acq_time: '1h ago (VIIRS N20)', district: 'Patiala', state: 'Punjab' },

  // Kaithal & Karnal (Haryana transition belt)
  { id: 'firms-12', lat: 29.800, lon: 76.400, brightness: 326.1, frp: 41.5, confidence: 85, acq_time: '3h ago (MODIS Terra)', district: 'Kaithal', state: 'Haryana' },
  { id: 'firms-13', lat: 29.680, lon: 76.850, brightness: 330.5, frp: 49.0, confidence: 87, acq_time: '2h ago (VIIRS N20)', district: 'Karnal', state: 'Haryana' },
  { id: 'firms-14', lat: 29.950, lon: 76.620, brightness: 339.8, frp: 68.2, confidence: 92, acq_time: '1h ago (VIIRS N20)', district: 'Kurukshetra', state: 'Haryana' },
];

export const MOCK_FIRE_PLUMES: FirePlumeTrajectory[] = [
  {
    source_id: 'plume-sangrur-delhi',
    source_name: 'Sangrur-Patiala High-Density Fire Core',
    points: [
      [30.284, 75.812],
      [30.010, 76.220],
      [29.680, 76.650],
      [29.350, 76.920],
      [28.980, 77.100],
      [28.750, 77.150], // Entering North Delhi (Alipur/DTU)
      [28.646, 77.316], // Anand Vihar entrapment
    ],
    current_wind_speed_kmh: 14.5,
    eta_delhi_hours: 18,
    plume_intensity: 'Heavy',
    corridor_bearing_deg: 312, // North-Westerly (from 312° toward Delhi at ~132°)
  },
  {
    source_id: 'plume-amritsar-haryana',
    source_name: 'Majha Northern Plume Conduit',
    points: [
      [31.450, 74.920],
      [30.850, 75.600],
      [30.200, 76.350],
      [29.700, 76.900],
      [29.100, 77.120],
      [28.730, 77.120], // Rohini / Wazirpur
    ],
    current_wind_speed_kmh: 12.0,
    eta_delhi_hours: 26,
    plume_intensity: 'Moderate',
    corridor_bearing_deg: 325,
  },
];
