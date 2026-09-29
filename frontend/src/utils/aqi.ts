import { AQICategory } from '../types';

export function getAQICategory(aqi: number): AQICategory {
  if (aqi <= 50) return 'Good';
  if (aqi <= 100) return 'Satisfactory';
  if (aqi <= 200) return 'Moderate';
  if (aqi <= 300) return 'Poor';
  if (aqi <= 400) return 'Very Poor';
  return 'Severe';
}

export function getAQIColor(aqi: number): string {
  if (aqi <= 50) return '#10b981'; // emerald-500
  if (aqi <= 100) return '#84cc16'; // lime-500
  if (aqi <= 200) return '#eab308'; // yellow-500
  if (aqi <= 300) return '#f97316'; // orange-500
  if (aqi <= 400) return '#ef4444'; // red-500
  return '#991b1b'; // red-800 / maroon
}

export function getAQIBadgeClass(category: AQICategory): string {
  switch (category) {
    case 'Good':
      return 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30';
    case 'Satisfactory':
      return 'bg-lime-500/20 text-lime-400 border border-lime-500/30';
    case 'Moderate':
      return 'bg-amber-500/20 text-amber-400 border border-amber-500/30';
    case 'Poor':
      return 'bg-orange-500/20 text-orange-400 border border-orange-500/30';
    case 'Very Poor':
      return 'bg-red-500/20 text-red-400 border border-red-500/30';
    case 'Severe':
      return 'bg-rose-950/80 text-rose-300 border border-rose-600/50 shadow-sm shadow-rose-900/40';
  }
}

export function getAQIDescription(category: AQICategory): string {
  switch (category) {
    case 'Good':
      return 'Minimal health impact. Air quality is satisfactory.';
    case 'Satisfactory':
      return 'Minor breathing discomfort to sensitive people.';
    case 'Moderate':
      return 'Breathing discomfort to people with lung disease such as asthma, and discomfort to children and older adults.';
    case 'Poor':
      return 'Breathing discomfort to most people on prolonged exposure.';
    case 'Very Poor':
      return 'Respiratory illness on prolonged exposure. Significant risk for heart/lung conditions.';
    case 'Severe':
      return 'Affects healthy people and seriously impacts those with existing diseases. Emergency measures enforced under GRAP.';
  }
}

export function getGRAPStage(aqi: number): { stage: string; action: string; badgeColor: string } {
  if (aqi > 450) {
    return {
      stage: 'GRAP Stage IV (Severe+)',
      action: 'Ban on non-essential diesel trucks, halt on C&D activities, hybrid schooling, emergency protocols.',
      badgeColor: 'bg-rose-950 text-rose-200 border-rose-500',
    };
  }
  if (aqi > 400) {
    return {
      stage: 'GRAP Stage III (Severe)',
      action: 'Ban on BS-III petrol & BS-IV diesel cars, strict dust suppressions, intensification of mechanized sweeping.',
      badgeColor: 'bg-red-950 text-red-200 border-red-500',
    };
  }
  if (aqi > 300) {
    return {
      stage: 'GRAP Stage II (Very Poor)',
      action: 'Enhanced parking fees, augment CNG/electric bus frequency, diesel generator restrictions.',
      badgeColor: 'bg-orange-950 text-orange-200 border-orange-500',
    };
  }
  if (aqi > 200) {
    return {
      stage: 'GRAP Stage I (Poor)',
      action: 'Enforce anti-dust guidelines, periodic sprinkling on roads, strict check on idling vehicles.',
      badgeColor: 'bg-amber-950 text-amber-200 border-amber-500',
    };
  }
  return {
    stage: 'Normal Advisory',
    action: 'Routine monitoring and public advisory compliance.',
    badgeColor: 'bg-emerald-950 text-emerald-200 border-emerald-500',
  };
}

export function pm25ToEstimatedAQI(pm25: number): number {
  // Linear interpolation based on Indian CPCB sub-index breakpoints for PM2.5 (24h)
  if (pm25 <= 30) return Math.round((50 / 30) * pm25);
  if (pm25 <= 60) return Math.round(50 + ((100 - 50) / (60 - 30)) * (pm25 - 30));
  if (pm25 <= 90) return Math.round(100 + ((200 - 100) / (90 - 60)) * (pm25 - 60));
  if (pm25 <= 120) return Math.round(200 + ((300 - 200) / (120 - 90)) * (pm25 - 90));
  if (pm25 <= 250) return Math.round(300 + ((400 - 300) / (250 - 120)) * (pm25 - 120));
  return Math.min(500, Math.round(400 + ((500 - 400) / (380 - 250)) * (pm25 - 250)));
}
