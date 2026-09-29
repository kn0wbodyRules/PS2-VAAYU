import { ConfidenceInterval } from '../types';

export function formatConfidenceRange(ci: ConfidenceInterval, unit: string = ''): string {
  const low = Math.round(ci.lower);
  const high = Math.round(ci.upper);
  return `${low}–${high}${unit ? ` ${unit}` : ''}`;
}

export function formatHourLeadTime(hourOffset: number): string {
  if (hourOffset === 0) return 'Now (Live)';
  return `+${hourOffset}h`;
}

export function degreesToCompass(deg: number): string {
  const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const index = Math.round((deg % 360) / 22.5) % 16;
  return directions[index];
}

export function formatVentilation(vc: number): { label: string; badgeColor: string; description: string } {
  // Ventilation Coefficient = wind_speed (m/s) * PBLH (m)
  // Standard IMD / CPCB thresholds:
  // > 6000 m^2/s: Good dispersion
  // 4000 - 6000: Moderate dispersion
  // 2000 - 4000: Poor dispersion
  // < 2000: Very poor / Severe stagnation trapping
  if (vc >= 6000) {
    return {
      label: 'Good Dispersion',
      badgeColor: 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30',
      description: 'Atmospheric boundary layer is active with sufficient vertical & horizontal flushing.',
    };
  }
  if (vc >= 4000) {
    return {
      label: 'Moderate Dispersion',
      badgeColor: 'bg-amber-500/20 text-amber-400 border border-amber-500/30',
      description: 'Moderate flushing; gradual accumulation under evening boundary layer depression.',
    };
  }
  if (vc >= 2000) {
    return {
      label: 'Poor Dispersion',
      badgeColor: 'bg-orange-500/20 text-orange-400 border border-orange-500/30',
      description: 'Weak winds and restricted mixing depth; severe particulate entrapment.',
    };
  }
  return {
    label: 'Low Boundary Flushing',
    badgeColor: 'bg-amber-950/60 text-amber-300 border border-amber-600/40',
    description: 'Calm surface winds with shallow boundary layer; low horizontal dispersion.',
  };
}

export function formatInversionLevel(index: number): { label: string; color: string } {
  if (index < 30) return { label: 'Weak Inversion', color: 'text-emerald-400' };
  if (index < 60) return { label: 'Moderate Cap', color: 'text-amber-400' };
  if (index < 80) return { label: 'Strong Inversion Lid', color: 'text-orange-400' };
  return { label: 'Severe Inversion Cap', color: 'text-orange-400' };
}
