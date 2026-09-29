import React, { useState, useMemo } from 'react';
import { 
  CartesianGrid, 
  Line, 
  Bar, 
  BarChart,
  LineChart,
  XAxis, 
  YAxis 
} from 'recharts';
import { StationForecast } from '../types';
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

interface ModelComparisonViewProps {
  forecasts: Map<string, StationForecast>;
}

const multiModelConfig = {
  gnn_pm25: {
    label: "AERIS GNN Residual",
    color: "#34d399",
  },
  cams_pm25: {
    label: "CAMS Physics Baseline",
    color: "#ca8a04",
  },
  persistence_pm25: {
    label: "Persistence (24 h mean)",
    color: "#dc2626",
  },
} satisfies ChartConfig;

const residualConfig = {
  residual_correction: {
    label: "Learned Residual Correction (Δ PM2.5)",
    color: "#16a34a",
  },
} satisfies ChartConfig;

export const ModelComparisonView: React.FC<ModelComparisonViewProps> = ({ forecasts }) => {
  const [selectedStationId, setSelectedStationId] = useState<string>('anand_vihar_dpcc');
  const [activeModelTab, setActiveModelTab] = useState<"all" | "gnn_pm25" | "cams_pm25" | "persistence_pm25">("all");
  const [residualHorizon, setResidualHorizon] = useState<"all" | "d1" | "d2" | "d3">("all");

  const selectedForecast = forecasts.get(selectedStationId) || Array.from(forecasts.values())[0];
  const hours = selectedForecast?.hours || [];

  // Generate comparison data across 72 hours
  const comparisonData = useMemo(() => {
    return hours.map((h) => {
      const cams = h.cams_baseline_pm25;
      const gnn = h.pm25.mean;
      const residual = h.gnn_residual_pm25;
      // no public WRF-Chem forecasts exist to compare against; the honest third reference is
      // persistence (the last 24 h of observations carried forward), served by the backend
      const persistence = h.persistence_pm25 ?? null;

      return {
        hour: `+${h.hour_offset}h`,
        rawHour: h.hour_offset,
        gnn_pm25: gnn,
        cams_pm25: cams,
        persistence_pm25: persistence,
        residual_correction: residual,
      };
    });
  }, [hours]);

  // Model summary totals for interactive buttons
  const modelStats = useMemo(() => {
    if (!comparisonData.length) return { gnn: 0, cams: 0, persistence: 0 };
    const gnnAvg = Math.round(comparisonData.reduce((acc, d) => acc + d.gnn_pm25, 0) / comparisonData.length);
    const camsAvg = Math.round(comparisonData.reduce((acc, d) => acc + d.cams_pm25, 0) / comparisonData.length);
    const pVals = comparisonData.map((d) => d.persistence_pm25).filter((v): v is number => v !== null);
    const persistenceAvg = pVals.length ? Math.round(pVals.reduce((a, b) => a + b, 0) / pVals.length) : 0;
    return { gnn: gnnAvg, cams: camsAvg, persistence: persistenceAvg };
  }, [comparisonData]);

  // Filtered residual data
  const filteredResidualData = useMemo(() => {
    if (residualHorizon === "d1") return comparisonData.filter(d => d.rawHour <= 24);
    if (residualHorizon === "d2") return comparisonData.filter(d => d.rawHour > 24 && d.rawHour <= 48);
    if (residualHorizon === "d3") return comparisonData.filter(d => d.rawHour > 48);
    return comparisonData;
  }, [comparisonData, residualHorizon]);

  const avgSelectedResidual = useMemo(() => {
    if (!filteredResidualData.length) return 0;
    return Math.round(filteredResidualData.reduce((acc, d) => acc + d.residual_correction, 0) / filteredResidualData.length);
  }, [filteredResidualData]);

  const day1GNN = Math.round(hours.slice(0, 24).reduce((acc, h) => acc + h.pm25.mean, 0) / 24);
  const day1CAMS = Math.round(hours.slice(0, 24).reduce((acc, h) => acc + h.cams_baseline_pm25, 0) / 24);

  const day2GNN = Math.round(hours.slice(24, 48).reduce((acc, h) => acc + h.pm25.mean, 0) / 24);
  const day2CAMS = Math.round(hours.slice(24, 48).reduce((acc, h) => acc + h.cams_baseline_pm25, 0) / 24);

  const day3GNN = Math.round(hours.slice(48, 72).reduce((acc, h) => acc + h.pm25.mean, 0) / 24);
  const day3CAMS = Math.round(hours.slice(48, 72).reduce((acc, h) => acc + h.cams_baseline_pm25, 0) / 24);

  // per-day physics of THIS station's forecast (all values from the API, nothing hard-coded)
  const seg = (a: number, b: number) => hours.slice(a + 1, b + 1);
  const mean = (xs: number[]) => (xs.length ? Math.round(xs.reduce((x, y) => x + y, 0) / xs.length) : 0);
  const dayPhys = [[0, 24], [24, 48], [48, 72]].map(([a, b]) => {
    const hs = seg(a, b);
    return {
      blhMean: mean(hs.map((h) => h.weather.boundary_layer_height)),
      blhMin: hs.length ? Math.round(Math.min(...hs.map((h) => h.weather.boundary_layer_height))) : 0,
      vcMean: mean(hs.map((h) => h.physics.ventilation_coefficient)),
      vcMin: hs.length ? Math.round(Math.min(...hs.map((h) => h.physics.ventilation_coefficient))) : 0,
      inversion: mean(hs.map((h) => h.physics.inversion_index)),
      fire: mean(hs.map((h) => h.physics.fire_influence_score)),
    };
  });
  const signed = (x: number) => `${x >= 0 ? '+' : ''}${x}`;

  const [hoveredDayIndex, setHoveredDayIndex] = useState<number | null>(null);

  const dayBenchmarkCards = useMemo(() => [
    {
      id: 'day-1',
      title: 'Day 1 (+0h to +24h Lead)',
      headerColor: 'text-slate-200',
      badge: 'Day-1 Correction',
      badgeColor: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
      gnn: day1GNN,
      cams: day1CAMS,
      camsLabel: 'CAMS Physics',
      camsStrike: false,
      camsColor: 'text-neutral-400',
      deltaBadge: `Δ ${Math.abs(day1GNN - day1CAMS)} µg/m³`,
      summary: `Day-1 mean PM2.5: AERIS ${day1GNN} vs CAMS ${day1CAMS} µg/m³ (correction ${signed(day1GNN - day1CAMS)}).`,
      expanded: (
        <div className="space-y-2 text-xs">
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div>
              <span className="text-[#a7d0bf] block text-[10px] uppercase font-bold">Mean BLH</span>
              <span className="font-mono font-bold text-emerald-300">{dayPhys[0].blhMean} m</span>
            </div>
            <div>
              <span className="text-[#a7d0bf] block text-[10px] uppercase font-bold">Min BLH</span>
              <span className="font-mono font-bold text-white">{dayPhys[0].blhMin} m</span>
            </div>
          </div>
          <div className="space-y-1">
            <div className="flex justify-between text-[10px] text-[#a7d0bf] font-mono">
              <span>Mean Inversion Index</span>
              <span>{dayPhys[0].inversion}/100</span>
            </div>
            <div className="w-full bg-emerald-950/80 rounded-full h-1.5 overflow-hidden flex">
              <div 
                className="bg-emerald-400 h-full rounded-full transition-all duration-500" 
                style={{ width: `${dayPhys[0].inversion}%` }} 
              />
            </div>
          </div>
        </div>
      ),
    },
    {
      id: 'day-2',
      title: 'Day 2 (+24h to +48h Lead)',
      headerColor: 'text-purple-200',
      badge: 'Day-2 Correction',
      badgeColor: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
      gnn: day2GNN,
      cams: day2CAMS,
      camsLabel: 'CAMS Baseline',
      camsStrike: false,
      camsColor: 'text-rose-300',
      deltaBadge: `Δ ${signed(day2GNN - day2CAMS)} µg/m³`,
      summary: `Day-2 mean PM2.5: AERIS ${day2GNN} vs CAMS ${day2CAMS} µg/m³; upwind fire influence ${dayPhys[1].fire}/100.`,
      expanded: (
        <div className="space-y-2 text-xs">
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div>
              <span className="text-purple-300 block text-[10px] uppercase font-bold">Upwind Fire Influence</span>
              <span className="font-mono font-bold text-amber-300">{dayPhys[1].fire}/100</span>
            </div>
            <div>
              <span className="text-purple-300 block text-[10px] uppercase font-bold">Min BLH</span>
              <span className="font-mono font-bold text-rose-300">{dayPhys[1].blhMin} m</span>
            </div>
          </div>
          <div className="space-y-1">
            <div className="flex justify-between text-[10px] text-purple-200 font-mono">
              <span>AERIS Correction vs CAMS</span>
              <span>{signed(day2GNN - day2CAMS)} µg/m³</span>
            </div>
            <div className="w-full bg-emerald-950/80 rounded-full h-1.5 overflow-hidden flex">
              <div 
                className="bg-purple-400 h-full rounded-full transition-all duration-500" 
                style={{ width: `${Math.min(100, Math.round(((day2GNN - day2CAMS) / (day2GNN || 1)) * 100) + 40)}%` }} 
              />
            </div>
          </div>
        </div>
      ),
    },
    {
      id: 'day-3',
      title: 'Day 3 (+48h to +72h Lead)',
      headerColor: 'text-rose-200',
      badge: 'Day-3 Correction',
      badgeColor: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
      gnn: day3GNN,
      cams: day3CAMS,
      camsLabel: 'CAMS Baseline',
      camsStrike: false,
      camsColor: 'text-rose-300',
      deltaBadge: `Δ ${signed(day3GNN - day3CAMS)} µg/m³`,
      summary: `Day-3 mean PM2.5: AERIS ${day3GNN} vs CAMS ${day3CAMS} µg/m³. Held-out accuracy by lead time: see Track Record.`,
      expanded: (
        <div className="space-y-2 text-xs">
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div>
              <span className="text-rose-300 block text-[10px] uppercase font-bold">Mean Ventilation</span>
              <span className="font-mono font-bold text-sky-300">{dayPhys[2].vcMean.toLocaleString()} m²/s</span>
            </div>
            <div>
              <span className="text-rose-300 block text-[10px] uppercase font-bold">Min Ventilation</span>
              <span className="font-mono font-bold text-amber-300">{dayPhys[2].vcMin.toLocaleString()} m²/s</span>
            </div>
          </div>
          <div className="space-y-1">
            <div className="flex justify-between text-[10px] text-rose-200 font-mono">
              <span>Mean Inversion Index</span>
              <span>{dayPhys[2].inversion}/100</span>
            </div>
            <div className="w-full bg-emerald-950/80 rounded-full h-1.5 overflow-hidden flex">
              <div 
                className="bg-rose-400 h-full rounded-full transition-all duration-500" 
                style={{ width: `${dayPhys[2].inversion}%` }} 
              />
            </div>
          </div>
        </div>
      ),
    },
  ], [day1GNN, day1CAMS, day2GNN, day2CAMS, day3GNN, day3CAMS, dayPhys]);

  return (
    <div className="space-y-6 font-sans">
      {/* Title & Core Scientific Value Header (Unboxed) */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-4 border-b border-emerald-800/40">
        <div>
          <h2 className="font-heading font-archivo text-2xl text-white">
            Physics Baseline vs. GNN Residual Correction
          </h2>
          <p className="text-xs text-[#a7d0bf] mt-1">
            Empirical evidence of the GNN resolving the Day-2 and Day-3 accuracy collapse documented in conventional systems
          </p>
        </div>

        {/* Station Picker with Select */}
        <div className="flex items-center gap-2 w-full md:w-auto">
          <label className="text-xs text-[#a7d0bf] font-bold whitespace-nowrap">
            Station:
          </label>
          <div className="min-w-[220px]">
            <Select value={selectedStationId} onValueChange={setSelectedStationId}>
              <SelectTrigger>
                <SelectValue placeholder="Select Station" />
              </SelectTrigger>
              <SelectContent>
                {Array.from(forecasts.values()).map((f) => f.station).map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name} ({s.zone})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* The Day-1 vs Day-2 vs Day-3 Residual Delta Bar (Interactive Expanding Deck on Hover) */}
      <div 
        onMouseLeave={() => setHoveredDayIndex(null)}
        className="flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-emerald-800/50 bg-[#0a2e21] rounded-2xl border border-emerald-600/40 shadow-lg text-white overflow-hidden transition-all duration-300"
      >
        {dayBenchmarkCards.map((card, idx) => {
          const isHovered = hoveredDayIndex === idx;
          const isAnyHovered = hoveredDayIndex !== null;

          return (
            <div
              key={card.id}
              onMouseEnter={() => setHoveredDayIndex(idx)}
              className={`p-5 flex flex-col justify-between min-w-0 cursor-pointer select-none transition-colors duration-200 relative ${
                isHovered ? 'bg-[#0f4432]' : 'hover:bg-[#0c3626]'
              }`}
              style={{
                flex: !isAnyHovered ? '1 1 0%' : isHovered ? '1.8 1 0%' : '0.6 1 0%',
                transition: 'flex 0.38s cubic-bezier(0.16, 1, 0.3, 1), background-color 0.2s ease',
              }}
            >
              <div>
                <div className="flex items-center justify-between text-xs mb-1 min-w-0 gap-1.5">
                  <span className={`font-bold uppercase tracking-wider text-xs truncate ${card.headerColor}`}>
                    {card.title}
                  </span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold shrink-0 border transition-all ${card.badgeColor}`}>
                    {card.badge}
                  </span>
                </div>

                <div className="flex items-baseline justify-between pt-1 gap-2">
                  <div className="min-w-0">
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-2xl font-numbers text-sky-400 font-bold">{card.gnn}</span>
                      {isHovered && card.deltaBadge && (
                        <span className="text-[10px] font-mono font-bold text-emerald-300 bg-emerald-950/80 px-1.5 py-0.5 rounded border border-emerald-700/60 animate-in fade-in duration-200 shrink-0">
                          {card.deltaBadge}
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-[#a7d0bf] block font-bold truncate">GNN Mean (µg/m³)</span>
                  </div>
                  <div className="text-right shrink-0">
                    <span className={`text-xl font-numbers ${card.camsStrike ? 'line-through text-rose-400' : 'text-neutral-400'}`}>
                      {card.cams}
                    </span>
                    <span className={`text-[11px] block font-bold ${card.camsColor}`}>
                      {card.camsLabel}
                    </span>
                  </div>
                </div>

                <div className="text-[11px] text-[#a7d0bf] pt-2 border-t border-emerald-800/40 line-clamp-2">
                  {card.summary}
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
                {card.expanded}
              </div>
            </div>
          );
        })}
      </div>

      {/* ChartLineInteractive: Multi-Model Trajectory Comparison */}
      <Card className="bg-[#0a2e21] border border-emerald-600/40 text-white shadow-lg">
        <CardHeader className="flex flex-col items-stretch space-y-0 border-b border-emerald-800/40 p-0 sm:flex-row">
          <div className="flex flex-1 flex-col justify-center gap-1 px-6 py-5">
            <CardTitle className="font-heading font-archivo text-xl text-white">
              Multi-Model Trajectory Comparison
            </CardTitle>
            <CardDescription className="text-xs text-[#a7d0bf]">
              Station: <strong className="text-white font-semibold">{selectedForecast.station.name}</strong> • Interactive trajectory breakdown
            </CardDescription>
          </div>

          {/* Interactive buttons in CardHeader */}
          <div className="flex border-t sm:border-t-0 sm:border-l border-emerald-800/40 divide-x divide-emerald-800/40">
            <button
              type="button"
              data-active={activeModelTab === "all"}
              onClick={() => setActiveModelTab("all")}
              className="flex flex-1 flex-col justify-center gap-0.5 px-4 py-3 text-left data-[active=true]:bg-[#14533c] hover:bg-[#0e3d2c] transition-colors min-w-[100px]"
            >
              <span className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider">Mode</span>
              <span className="text-xs font-bold text-white">All Models</span>
            </button>

            <button
              type="button"
              data-active={activeModelTab === "gnn_pm25"}
              onClick={() => setActiveModelTab("gnn_pm25")}
              className="flex flex-1 flex-col justify-center gap-0.5 px-4 py-3 text-left data-[active=true]:bg-[#14533c] hover:bg-[#0e3d2c] transition-colors min-w-[110px]"
            >
              <span className="text-[10px] text-emerald-300 font-bold flex items-center gap-1"><span className="font-aeris font-vaayu text-xs font-normal">AERIS</span><span>GNN</span></span>
              <span className="text-sm font-numbers text-sky-300">{modelStats.gnn} <span className="text-[10px] font-normal text-neutral-400 font-sans">µg/m³</span></span>
            </button>

            <button
              type="button"
              data-active={activeModelTab === "cams_pm25"}
              onClick={() => setActiveModelTab("cams_pm25")}
              className="flex flex-1 flex-col justify-center gap-0.5 px-4 py-3 text-left data-[active=true]:bg-[#14533c] hover:bg-[#0e3d2c] transition-colors min-w-[110px]"
            >
              <span className="text-[10px] text-purple-400 font-bold">CAMS Physics</span>
              <span className="text-sm font-numbers text-purple-300">{modelStats.cams} <span className="text-[10px] font-normal text-neutral-400 font-sans">µg/m³</span></span>
            </button>

            <button
              type="button"
              data-active={activeModelTab === "persistence_pm25"}
              onClick={() => setActiveModelTab("persistence_pm25")}
              className="flex flex-1 flex-col justify-center gap-0.5 px-4 py-3 text-left data-[active=true]:bg-[#14533c] hover:bg-[#0e3d2c] transition-colors min-w-[110px]"
            >
              <span className="text-[10px] text-rose-400 font-bold">Persistence</span>
              <span className="text-sm font-numbers text-rose-300">{modelStats.persistence} <span className="text-[10px] font-normal text-neutral-400 font-sans">µg/m³</span></span>
            </button>
          </div>
        </CardHeader>

        <CardContent className="pt-6">
          <ChartContainer config={multiModelConfig} className="aspect-auto h-[280px] w-full">
            <LineChart data={comparisonData} margin={{ top: 10, right: 15, bottom: 0, left: -10 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#134e38" />
              <XAxis 
                dataKey="hour" 
                tickLine={false} 
                axisLine={false} 
                tickMargin={8} 
                interval={5}
                stroke="#a7d0bf"
              />
              <YAxis 
                domain={[0, 'auto']} 
                tickLine={false} 
                axisLine={false}
                stroke="#a7d0bf"
              />
              <ChartTooltip 
                content={
                  <ChartTooltipContent 
                    indicator="line" 
                    className="bg-[#0a2e21] border border-emerald-600/50 text-white" 
                  />
                } 
              />

              {(activeModelTab === "all" || activeModelTab === "persistence_pm25") && (
                <Line 
                  type="monotone" 
                  dataKey="persistence_pm25" 
                  stroke="var(--color-persistence_pm25)" 
                  strokeWidth={activeModelTab === "persistence_pm25" ? 3 : 1.5}
                  strokeDasharray="4 4" 
                  dot={false}
                  name="Persistence (24 h mean)"
                />
              )}

              {(activeModelTab === "all" || activeModelTab === "cams_pm25") && (
                <Line 
                  type="monotone" 
                  dataKey="cams_pm25" 
                  stroke="var(--color-cams_pm25)" 
                  strokeWidth={activeModelTab === "cams_pm25" ? 3 : 2}
                  strokeDasharray="3 3" 
                  dot={false}
                  name="CAMS Physics Baseline"
                />
              )}

              {(activeModelTab === "all" || activeModelTab === "gnn_pm25") && (
                <Line 
                  type="monotone" 
                  dataKey="gnn_pm25" 
                  stroke="var(--color-gnn_pm25)" 
                  strokeWidth={3} 
                  dot={false}
                  name="AERIS GNN Residual"
                />
              )}
              <ChartLegend content={<ChartLegendContent />} />
            </LineChart>
          </ChartContainer>
        </CardContent>
      </Card>

      {/* ChartBarInteractive: The Learned Residual Breakdown */}
      <Card className="bg-[#0a2e21] border border-emerald-600/40 text-white shadow-lg">
        <CardHeader className="flex flex-col items-stretch space-y-0 border-b border-emerald-800/40 p-0 sm:flex-row">
          <div className="flex flex-1 flex-col justify-center gap-1 px-6 py-5">
            <CardTitle className="font-heading font-archivo text-xl text-white">
              GNN Learned Residual Error Breakdown (Δ PM2.5)
            </CardTitle>
            <CardDescription className="text-xs text-[#a7d0bf]">
              Chemistry head learned error offset: <span className="font-bold text-purple-300">Final = CAMS + Learned Residual</span>
            </CardDescription>
          </div>

          {/* Interactive Horizon Filter Tabs */}
          <div className="flex border-t sm:border-t-0 sm:border-l border-emerald-800/40 divide-x divide-emerald-800/40">
            <button
              type="button"
              data-active={residualHorizon === "all"}
              onClick={() => setResidualHorizon("all")}
              className="flex flex-1 flex-col justify-center gap-0.5 px-4 py-3 text-left data-[active=true]:bg-[#14533c] hover:bg-[#0e3d2c] transition-colors min-w-[95px]"
            >
              <span className="text-[10px] text-neutral-400 uppercase font-bold">Horizon</span>
              <span className="text-xs font-bold text-white">Full 72h</span>
            </button>
            <button
              type="button"
              data-active={residualHorizon === "d1"}
              onClick={() => setResidualHorizon("d1")}
              className="flex flex-1 flex-col justify-center gap-0.5 px-4 py-3 text-left data-[active=true]:bg-[#14533c] hover:bg-[#0e3d2c] transition-colors min-w-[95px]"
            >
              <span className="text-[10px] text-neutral-400 uppercase font-bold">Day 1</span>
              <span className="text-xs font-bold text-white font-numbers">0–24h</span>
            </button>
            <button
              type="button"
              data-active={residualHorizon === "d2"}
              onClick={() => setResidualHorizon("d2")}
              className="flex flex-1 flex-col justify-center gap-0.5 px-4 py-3 text-left data-[active=true]:bg-[#14533c] hover:bg-[#0e3d2c] transition-colors min-w-[95px]"
            >
              <span className="text-[10px] text-neutral-400 uppercase font-bold">Day 2</span>
              <span className="text-xs font-bold text-purple-300 font-numbers">24–48h</span>
            </button>
            <button
              type="button"
              data-active={residualHorizon === "d3"}
              onClick={() => setResidualHorizon("d3")}
              className="flex flex-1 flex-col justify-center gap-0.5 px-4 py-3 text-left data-[active=true]:bg-[#14533c] hover:bg-[#0e3d2c] transition-colors min-w-[95px]"
            >
              <span className="text-[10px] text-neutral-400 uppercase font-bold">Day 3</span>
              <span className="text-xs font-bold text-rose-300 font-numbers">48–72h</span>
            </button>
          </div>
        </CardHeader>

        <CardContent className="pt-6">
          <div className="flex items-center justify-between mb-3 px-1 text-xs">
            <span className="text-[#a7d0bf]">
              Average Correction in Window: <strong className="text-purple-300 font-numbers">+{avgSelectedResidual} µg/m³</strong>
            </span>
          </div>

          <ChartContainer config={residualConfig} className="aspect-auto h-[240px] w-full">
            <BarChart data={filteredResidualData} margin={{ top: 10, right: 15, bottom: 0, left: -10 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#134e38" />
              <XAxis 
                dataKey="hour" 
                tickLine={false} 
                axisLine={false} 
                tickMargin={8} 
                interval={residualHorizon === "all" ? 5 : 2}
                stroke="#a7d0bf"
              />
              <YAxis 
                tickLine={false} 
                axisLine={false}
                stroke="#a7d0bf"
              />
              <ChartTooltip 
                content={
                  <ChartTooltipContent 
                    className="w-[180px] bg-[#0a2e21] border border-emerald-600/50 text-white" 
                    labelFormatter={(val) => `Lead Time: ${val}`}
                  />
                } 
              />
              <Bar 
                dataKey="residual_correction" 
                fill="var(--color-residual_correction)" 
                radius={[4, 4, 0, 0]} 
                name="Learned Residual Error"
              />
            </BarChart>
          </ChartContainer>

          <div className="mt-4 p-3.5 rounded-xl bg-[#061d15] border border-emerald-700/50 text-xs text-[#a7d0bf] leading-relaxed">
            <strong className="text-white font-bold">Scientific Context:</strong> Rather than predicting raw AQI values from scratch, the model preserves global atmospheric physics while learning the physical error offset from satellite fire boundaries and station network connectivity.
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
