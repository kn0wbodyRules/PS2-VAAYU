import React, { useState } from 'react';
import { 
  Area, 
  AreaChart, 
  CartesianGrid, 
  Line, 
  LineChart, 
  XAxis, 
  YAxis 
} from 'recharts';
import { FIRMSFireHotspot, FirePlumeTrajectory } from '../types';
import { formatVentilation, formatInversionLevel } from '../utils/formatters';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface InversionFirePanelProps {
  hotspots: FIRMSFireHotspot[];
  plumes: FirePlumeTrajectory[];
  trendData: { hour: number; score: number; fire_flux?: number; pblh: number; ventilation: number }[];
  selectedHour: number;
}

const inversionChartConfig = {
  score: {
    label: "Inversion Index",
    color: "#a855f7",
  },
  fire_flux: {
    label: "Fire Flux Impact",
    color: "#f97316",
  },
} satisfies ChartConfig;

const boundaryChartConfig = {
  pblh: {
    label: "Boundary Layer (PBLH m)",
    color: "#38bdf8",
  },
  ventilation: {
    label: "Ventilation (Vc m²/s)",
    color: "#34d399",
  },
} satisfies ChartConfig;

export const InversionFirePanel: React.FC<InversionFirePanelProps> = ({
  hotspots,
  plumes,
  trendData,
  selectedHour,
}) => {
  const [inversionTimeRange, setInversionTimeRange] = useState<string>("72h");
  const [boundaryMetric, setBoundaryMetric] = useState<"both" | "pblh" | "ventilation">("both");

  const currentTrend = trendData[selectedHour] || trendData[0];
  const inversionStatus = formatInversionLevel(currentTrend?.score ?? 0);
  const ventStatus = formatVentilation(currentTrend?.ventilation ?? 0);

  // Calculate FIRMS statistics
  const totalFRP = hotspots.reduce((acc, f) => acc + f.frp, 0);
  const punjabHotspots = hotspots.filter(f => f.state === 'Punjab').length;
  const haryanaHotspots = hotspots.filter(f => f.state === 'Haryana').length;

  // Filter trend data based on selected horizon
  const maxHour = inversionTimeRange === "24h" ? 24 : inversionTimeRange === "48h" ? 48 : 72;
  const filteredTrendData = trendData.filter(d => d.hour <= maxHour).map(d => ({
    ...d,
    fire_flux: d.fire_flux ?? 0, // real upwind fire influence from the backend (0-100)
  }));

  const [hoveredGaugeIndex, setHoveredGaugeIndex] = useState<number | null>(null);

  const telemetryGauges = [
    {
      id: 'inversion-index',
      label: 'Inversion Index',
      headerColor: 'text-[#a7d0bf]',
      badge: inversionStatus.label,
      badgeColor: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
      value: `${currentTrend?.score ?? 0}`,
      valueColor: 'text-purple-400',
      unit: '/ 100',
      deltaBadge: 'Thermal Cap Active',
      statusText: inversionStatus.label,
      statusColor: inversionStatus.color,
      description: 'Thermal cap suppressing vertical buoyant dilution',
      expanded: (
        <div className="space-y-2 text-xs">
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div>
              <span className="text-[#a7d0bf] block text-[10px] uppercase font-bold">Mixing Height</span>
              <span className="font-mono font-bold text-white">{currentTrend?.pblh ?? '—'} m</span>
            </div>
            <div>
              <span className="text-[#a7d0bf] block text-[10px] uppercase font-bold">Upwind Fire Influence</span>
              <span className="font-mono font-bold text-purple-300">{currentTrend?.fire_flux ?? '—'}/100</span>
            </div>
          </div>
          <div className="space-y-1">
            <div className="flex justify-between text-[10px] text-[#a7d0bf] font-mono">
              <span>Trap Potential: {currentTrend?.score ?? 0}%</span>
              <span>Stability: Extreme</span>
            </div>
            <div className="w-full bg-emerald-950/80 rounded-full h-1.5 overflow-hidden flex">
              <div 
                className="bg-purple-400 h-full rounded-full transition-all duration-500" 
                style={{ width: `${currentTrend?.score ?? 0}%` }} 
              />
            </div>
          </div>
        </div>
      ),
    },
    {
      id: 'ventilation-vc',
      label: 'Ventilation (Vc)',
      headerColor: 'text-[#a7d0bf]',
      badge: ventStatus.label,
      badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
      value: (currentTrend?.ventilation ?? 0).toLocaleString(),
      valueColor: 'text-white',
      unit: 'm²/s',
      deltaBadge: '+800 over Critical',
      statusText: ventStatus.label,
      statusColor: ventStatus.badgeColor,
      description: 'Poor dispersion below 6,000 m²/s (ventilation = wind × mixing height)',
      expanded: (
        <div className="space-y-2 text-xs">
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div>
              <span className="text-[#a7d0bf] block text-[10px] uppercase font-bold">Transport Wind</span>
              <span className="font-mono font-bold text-white">{currentTrend && currentTrend.pblh ? (currentTrend.ventilation / currentTrend.pblh).toFixed(1) : '—'} m/s</span>
            </div>
            <div>
              <span className="text-[#a7d0bf] block text-[10px] uppercase font-bold">Clearance</span>
              <span className="font-mono font-bold text-emerald-300">{(currentTrend?.ventilation ?? 0) >= 6000 ? 'Adequate' : 'Poor'}</span>
            </div>
          </div>
          <div className="space-y-1">
            <div className="flex justify-between text-[10px] text-[#a7d0bf] font-mono">
              <span>Current Vc: {currentTrend?.ventilation ?? 0}</span>
              <span>Floor: 2,000</span>
            </div>
            <div className="w-full bg-emerald-950/80 rounded-full h-1.5 overflow-hidden flex">
              <div 
                className="bg-emerald-400 h-full rounded-full transition-all duration-500" 
                style={{ width: `${Math.min(100, Math.round(((currentTrend?.ventilation ?? 0) / 6000) * 100))}%` }} 
              />
            </div>
          </div>
        </div>
      ),
    },
    {
      id: 'mixing-pblh',
      label: 'Mixing Height (PBLH)',
      headerColor: 'text-[#a7d0bf]',
      badge: 'Diurnal Ceiling',
      badgeColor: 'bg-teal-500/20 text-teal-300 border-teal-500/30',
      value: `${currentTrend?.pblh ?? '—'}`,
      valueColor: 'text-emerald-400',
      unit: 'meters',
      deltaBadge: 'Night Trap',
      statusText: 'Diurnal Surface Ceiling',
      statusColor: 'text-slate-300',
      description: 'Night compression forms shallow 200m particulate trap',
      expanded: (
        <div className="space-y-2 text-xs">
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div>
              <span className="text-[#a7d0bf] block text-[10px] uppercase font-bold">Night Minimum</span>
              <span className="font-mono font-bold text-teal-300">120 meters</span>
            </div>
            <div>
              <span className="text-[#a7d0bf] block text-[10px] uppercase font-bold">Day Peak</span>
              <span className="font-mono font-bold text-white">1,150 meters</span>
            </div>
          </div>
          <div className="space-y-1">
            <div className="flex justify-between text-[10px] text-[#a7d0bf] font-mono">
              <span>PBL Height: {currentTrend?.pblh ?? '—'}m</span>
              <span>Scale: 0–1,500 m</span>
            </div>
            <div className="w-full bg-emerald-950/80 rounded-full h-1.5 overflow-hidden flex">
              <div 
                className="bg-teal-400 h-full rounded-full transition-all duration-500" 
                style={{ width: `${Math.min(100, Math.round(((currentTrend?.pblh ?? '—') / 1200) * 100))}%` }} 
              />
            </div>
          </div>
        </div>
      ),
    },
    {
      id: 'firms-power',
      label: 'FIRMS Fire Power',
      headerColor: 'text-[#a7d0bf]',
      badge: 'Biomass Influx',
      badgeColor: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
      value: `${Math.round(totalFRP)}`,
      valueColor: 'text-orange-400',
      unit: `MW (${hotspots.length} fires)`,
      deltaBadge: 'NW Wind Corridor',
      statusText: `${punjabHotspots} in Punjab • ${haryanaHotspots} in Haryana`,
      statusColor: 'text-amber-300',
      description: plumes.length ? `Forecast wind carries ${plumes.length} fire cluster(s) to Delhi (first +${Math.min(...plumes.map((p) => p.eta_delhi_hours))}h)` : 'Forecast wind does not carry these fires to Delhi within 72 h',
      expanded: (
        <div className="space-y-2 text-xs">
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div>
              <span className="text-[#a7d0bf] block text-[10px] uppercase font-bold">Punjab Clusters</span>
              <span className="font-mono font-bold text-orange-300">{punjabHotspots} active</span>
            </div>
            <div>
              <span className="text-[#a7d0bf] block text-[10px] uppercase font-bold">Haryana Clusters</span>
              <span className="font-mono font-bold text-amber-300">{haryanaHotspots} active</span>
            </div>
          </div>
          <div className="space-y-1">
            <div className="flex justify-between text-[10px] text-[#a7d0bf] font-mono">
              <span>Fire Intensity: {Math.round(totalFRP)} MW</span>
              <span>Corridor: {plumes.length ? `${plumes[0].corridor_bearing_deg}° to Delhi` : 'no plume reaching Delhi'}</span>
            </div>
            <div className="w-full bg-emerald-950/80 rounded-full h-1.5 overflow-hidden flex">
              <div 
                className="bg-orange-400 h-full rounded-full transition-all duration-500" 
                style={{ width: `${Math.min(100, Math.round((totalFRP / 3500) * 100))}%` }} 
              />
            </div>
          </div>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6 font-sans">
      {/* Title & Physics Context Header (Unboxed) */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 pb-4 border-b border-emerald-800/40">
        <div>
          <h2 className="font-heading text-2xl text-white">
            Atmospheric Inversion Strength & Fire Plume Influx
          </h2>
          <p className="text-xs text-[#a7d0bf] mt-1">
            Physical boundary layers tracked as primary metrics rather than hidden black-box inputs
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="px-3 py-1 rounded-xl bg-amber-500/10 text-amber-300 border border-amber-500/30 font-bold">
            Active Stubble Window: Punjab & Haryana Influx
          </span>
        </div>
      </div>

      {/* Top Telemetry Gauges (Unified Expanding Row on Hover) */}
      <div 
        onMouseLeave={() => setHoveredGaugeIndex(null)}
        className="flex flex-col lg:flex-row divide-y lg:divide-y-0 lg:divide-x divide-emerald-800/50 bg-[#0a2e21] rounded-2xl border border-emerald-600/40 shadow-lg text-white overflow-hidden transition-all duration-300"
      >
        {telemetryGauges.map((gauge, idx) => {
          const isHovered = hoveredGaugeIndex === idx;
          const isAnyHovered = hoveredGaugeIndex !== null;

          return (
            <div
              key={gauge.id}
              onMouseEnter={() => setHoveredGaugeIndex(idx)}
              className={`p-5 flex flex-col justify-between min-w-0 cursor-pointer select-none transition-colors duration-200 relative ${
                isHovered ? 'bg-[#0f4432]' : 'hover:bg-[#0c3626]'
              }`}
              style={{
                flex: !isAnyHovered ? '1 1 0%' : isHovered ? '1.85 1 0%' : '0.716 1 0%',
                transition: 'flex 0.38s cubic-bezier(0.16, 1, 0.3, 1), background-color 0.2s ease',
              }}
            >
              {/* Header Label + Status Pill on Hover */}
              <div>
                <div className="flex items-center justify-between text-xs mb-2 min-w-0 gap-1.5">
                  <span className={`font-bold uppercase tracking-wider text-[10px] truncate ${gauge.headerColor}`}>
                    {gauge.label}
                  </span>
                  {isHovered && (
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold shrink-0 border animate-in fade-in zoom-in-95 duration-200 ${gauge.badgeColor}`}>
                      {gauge.badge}
                    </span>
                  )}
                </div>

                {/* Main Stat Value + Delta Badge on Hover */}
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className={`text-3xl font-numbers font-bold ${gauge.valueColor}`}>
                    {gauge.value}
                  </span>
                  {gauge.unit && (
                    <span className="text-xs text-[#a7d0bf] font-bold">{gauge.unit}</span>
                  )}
                  {isHovered && (
                    <span className="text-[11px] font-mono font-bold text-emerald-300 bg-emerald-950/70 px-1.5 py-0.5 rounded border border-emerald-700/60 animate-in fade-in duration-200">
                      {gauge.deltaBadge}
                    </span>
                  )}
                </div>

                {/* Base Status / Description */}
                <div className="mt-3 pt-2 border-t border-emerald-800/40 text-xs">
                  <div className={`font-bold ${gauge.statusColor}`}>
                    {gauge.statusText}
                  </div>
                  <p className="text-[11px] text-[#a7d0bf] mt-0.5 line-clamp-2">
                    {gauge.description}
                  </p>
                </div>
              </div>

              {/* Extra Information: Expands Smoothly on Hover */}
              <div 
                className={`transition-all duration-300 ease-out overflow-hidden ${
                  isHovered 
                    ? 'max-h-40 opacity-100 mt-2.5 pt-2.5 border-t border-emerald-600/40' 
                    : 'max-h-0 opacity-0 pointer-events-none'
                }`}
              >
                {gauge.expanded}
              </div>
            </div>
          );
        })}
      </div>

      {/* Chart Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Interactive Area Chart: Inversion Strength & Fire Flux Score */}
        <Card className="flex flex-col">
          <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-border pb-4">
            <div>
              <CardTitle className="font-heading text-xl text-white">
                Inversion Strength & Fire Flux Score
              </CardTitle>
              <CardDescription>
                Atmospheric trapping potential and upwind stubble influx
              </CardDescription>
            </div>
            {/* Interactive Time Range Select */}
            <div className="w-[150px]">
              <Select value={inversionTimeRange} onValueChange={setInversionTimeRange}>
                <SelectTrigger aria-label="Forecast Horizon">
                  <SelectValue placeholder="Full 72 Hours" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="72h">Full 72 Hours</SelectItem>
                  <SelectItem value="48h">Next 48 Hours</SelectItem>
                  <SelectItem value="24h">Next 24 Hours</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>

          <CardContent className="pt-6">
            <ChartContainer config={inversionChartConfig} className="aspect-auto h-[260px] w-full">
              <AreaChart data={filteredTrendData} margin={{ top: 10, right: 10, bottom: 0, left: -20 }}>
                <defs>
                  <linearGradient id="fillInversion" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-score)" stopOpacity={0.6} />
                    <stop offset="95%" stopColor="var(--color-score)" stopOpacity={0.05} />
                  </linearGradient>
                  <linearGradient id="fillFireFlux" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-fire_flux)" stopOpacity={0.5} />
                    <stop offset="95%" stopColor="var(--color-fire_flux)" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis 
                  dataKey="hour" 
                  tickLine={false} 
                  axisLine={false} 
                  tickMargin={8} 
                  tickFormatter={(val) => `+${val}h`}
                  interval={inversionTimeRange === "24h" ? 2 : inversionTimeRange === "48h" ? 5 : 8}
                />
                <YAxis domain={[0, 100]} tickLine={false} axisLine={false} />
                <ChartTooltip 
                  cursor={false} 
                  content={<ChartTooltipContent indicator="dot" />} 
                />
                <Area 
                  dataKey="score" 
                  type="monotone" 
                  fill="url(#fillInversion)" 
                  stroke="var(--color-score)" 
                  strokeWidth={2}
                  name="Inversion Index"
                />
                <Area 
                  dataKey="fire_flux" 
                  type="monotone" 
                  fill="url(#fillFireFlux)" 
                  stroke="var(--color-fire_flux)" 
                  strokeWidth={2}
                  name="Fire Flux Impact"
                />
                <ChartLegend content={<ChartLegendContent />} />
              </AreaChart>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Boundary Layer Height (PBLH) & Ventilation Coefficient */}
        <Card className="flex flex-col">
          <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-border pb-4">
            <div>
              <CardTitle className="font-heading text-xl text-white">
                Boundary Layer & Ventilation
              </CardTitle>
              <CardDescription>
                Vertical mixing ceiling (PBLH) and horizontal dispersion capacity (Vc)
              </CardDescription>
            </div>
            {/* Interactive series toggle */}
            <div className="flex items-center bg-[#18181b] border border-border rounded-xl p-1 text-xs">
              <button
                type="button"
                onClick={() => setBoundaryMetric("both")}
                className={`px-2.5 py-1 rounded-lg transition-colors font-bold ${
                  boundaryMetric === "both" ? "bg-[#27272a] text-white" : "text-neutral-400 hover:text-white"
                }`}
              >
                Both
              </button>
              <button
                type="button"
                onClick={() => setBoundaryMetric("pblh")}
                className={`px-2.5 py-1 rounded-lg transition-colors font-bold ${
                  boundaryMetric === "pblh" ? "bg-[#27272a] text-white" : "text-neutral-400 hover:text-white"
                }`}
              >
                PBLH
              </button>
              <button
                type="button"
                onClick={() => setBoundaryMetric("ventilation")}
                className={`px-2.5 py-1 rounded-lg transition-colors font-bold ${
                  boundaryMetric === "ventilation" ? "bg-[#27272a] text-white" : "text-neutral-400 hover:text-white"
                }`}
              >
                Vc
              </button>
            </div>
          </CardHeader>

          <CardContent className="pt-6">
            <ChartContainer config={boundaryChartConfig} className="aspect-auto h-[260px] w-full">
              <LineChart data={trendData} margin={{ top: 10, right: 15, bottom: 0, left: -10 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis 
                  dataKey="hour" 
                  tickLine={false} 
                  axisLine={false} 
                  tickMargin={8} 
                  tickFormatter={(val) => `+${val}h`} 
                  interval={8}
                />
                {(boundaryMetric === "both" || boundaryMetric === "pblh") && (
                  <YAxis yAxisId="pblh" domain={[100, 1200]} tickLine={false} axisLine={false} />
                )}
                {(boundaryMetric === "both" || boundaryMetric === "ventilation") && (
                  <YAxis yAxisId="vc" orientation={boundaryMetric === "both" ? "right" : "left"} domain={[500, 8000]} tickLine={false} axisLine={false} />
                )}
                <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
                {(boundaryMetric === "both" || boundaryMetric === "pblh") && (
                  <Line 
                    yAxisId="pblh"
                    type="monotone" 
                    dataKey="pblh" 
                    stroke="var(--color-pblh)" 
                    strokeWidth={2}
                    dot={false}
                    name="Boundary Layer (m)"
                  />
                )}
                {(boundaryMetric === "both" || boundaryMetric === "ventilation") && (
                  <Line 
                    yAxisId="vc"
                    type="monotone" 
                    dataKey="ventilation" 
                    stroke="var(--color-ventilation)" 
                    strokeWidth={2}
                    dot={false}
                    name="Ventilation (m²/s)"
                  />
                )}
                <ChartLegend content={<ChartLegendContent />} />
              </LineChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>

      {/* Active Stubble Plume Conduits */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="font-heading text-xl text-white">
            Detected Fire Plume Conduits
          </CardTitle>
          <CardDescription>
            Trajectory vectors modeled from satellite fire detections and boundary-layer wind fields
          </CardDescription>
        </CardHeader>

        <CardContent className="p-0">
          <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-emerald-800/40">
            {plumes.map((plume) => (
              <div 
                key={plume.source_id}
                className="p-5 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white text-sm">{plume.source_name}</span>
                  <span className="text-[10px] px-2.5 py-0.5 rounded-full font-bold bg-orange-950/80 text-orange-300 border border-orange-700/60 uppercase">
                    {plume.plume_intensity} Plume
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-3 text-xs pt-1">
                  <div>
                    <span className="text-[#a7d0bf] block text-[10px] uppercase font-bold tracking-wider">ETA</span>
                    <span className="text-amber-400 font-numbers text-base font-bold">+{plume.eta_delhi_hours}h</span>
                  </div>
                  <div>
                    <span className="text-[#a7d0bf] block text-[10px] uppercase font-bold tracking-wider">Wind Speed</span>
                    <span className="text-white font-numbers text-base font-bold">{plume.current_wind_speed_kmh} km/h</span>
                  </div>
                  <div>
                    <span className="text-[#a7d0bf] block text-[10px] uppercase font-bold tracking-wider">Bearing</span>
                    <span className="text-sky-300 font-numbers text-base font-bold">{plume.corridor_bearing_deg}° NW</span>
                  </div>
                </div>
                <p className="text-xs text-[#a7d0bf] leading-relaxed pt-1 border-t border-emerald-800/30">
                  Direct atmospheric trajectory entering North-West Delhi before pooling in the basin.
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
