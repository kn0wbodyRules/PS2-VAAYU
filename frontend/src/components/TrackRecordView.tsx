import React, { useState } from 'react';
import { 
  Bar, 
  BarChart, 
  CartesianGrid, 
  XAxis, 
  YAxis 
} from 'recharts';
import { TrackRecordEntry, ModelAccuracyStats } from '../types';
import { getAQIColor } from '../utils/aqi';
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

interface TrackRecordViewProps {
  records: TrackRecordEntry[];
  stats: ModelAccuracyStats[];
}

const trackRecordChartConfig = {
  gnn_mae: {
    label: "AERIS GNN Residual",
    color: "#34d399",
  },
  cams_mae: {
    label: "CAMS Physics Baseline",
    color: "#ca8a04",
  },
  persist_mae: {
    label: "Persistence (24 h mean)",
    color: "#dc2626",
  },
} satisfies ChartConfig;

export const TrackRecordView: React.FC<TrackRecordViewProps> = ({ records, stats }) => {
  const [selectedLeadTime, setSelectedLeadTime] = useState<'24h' | '48h' | '72h'>('48h');
  const [activeMetricTab, setActiveMetricTab] = useState<"all" | "gnn_mae" | "cams_mae" | "persist_mae">("all");

  const filteredRecords = records.filter(r => r.lead_time === selectedLeadTime);
  const activeStat = stats.find(s => s.lead_time === selectedLeadTime) || stats[0];

  // Prepare Lead-time MAE Comparison Chart Data
  const leadTimeComparisonData = stats.map(s => ({
    lead_time: `+${s.lead_time}`,
    gnn_mae: s.gnn_mae,
    cams_mae: s.cams_mae,
    persist_mae: s.persist_mae,
  }));

  const [hoveredCardIndex, setHoveredCardIndex] = useState<number | null>(null);
  // every figure below comes from the held-out test statistics served by the backend
  const fmt = (v: number | null | undefined, suffix = '') => (v === null || v === undefined ? 'n/a' : `${v}${suffix}`);
  const pts = (a?: number, b?: number, unit = ' pts') => (a === undefined || b === undefined ? 'n/a' : `${a - b >= 0 ? '+' : ''}${(a - b).toFixed(1)}${unit} vs CAMS`);
  const leadWindow = { '24h': '1–24 h', '48h': '25–48 h', '72h': '49–72 h' }[selectedLeadTime];

  const benchmarkCards = [
    {
      id: 'severe-recall',
      label: 'Very Poor+ Event Recall',
      headerColor: 'text-emerald-300',
      badge: `Lead ${leadWindow}`,
      badgeColor: 'bg-emerald-500/20 text-[#34d399] border-emerald-500/30',
      value: `${activeStat.extreme_event_recall}%`,
      valueColor: 'text-[#34d399]',
      unit: '',
      deltaBadge: pts(activeStat.extreme_event_recall, activeStat.cams_vp_recall),
      description: 'Share of true "Very Poor or worse" hours (CPCB AQI > 300) the forecast flagged at this lead',
      expanded: (
        <div className="space-y-2 text-xs">
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div>
              <span className="text-[#a7d0bf] block text-[10px] uppercase font-bold">False Alarm Rate</span>
              <span className="font-mono font-bold text-white">{fmt(activeStat.gnn_vp_false_alarm, '%')}</span>
            </div>
            <div>
              <span className="text-[#a7d0bf] block text-[10px] uppercase font-bold">Lead Window</span>
              <span className="font-mono font-bold text-emerald-300">{leadWindow}</span>
            </div>
          </div>
          <div className="space-y-1">
            <div className="flex justify-between text-[10px] text-[#a7d0bf] font-mono">
              <span>AERIS Recall: {activeStat.extreme_event_recall}%</span>
              <span>CAMS: {fmt(activeStat.cams_vp_recall, '%')} · Persistence: {fmt(activeStat.persist_vp_recall, '%')}</span>
            </div>
            <div className="w-full bg-emerald-950/80 rounded-full h-1.5 overflow-hidden flex">
              <div 
                className="bg-[#34d399] h-full rounded-full transition-all duration-500" 
                style={{ width: `${activeStat.extreme_event_recall}%` }} 
              />
            </div>
          </div>
        </div>
      ),
    },
    {
      id: 'pm25-mae',
      label: `PM2.5 MAE (+${selectedLeadTime})`,
      headerColor: 'text-neutral-300',
      badge: 'Residual Error',
      badgeColor: 'bg-sky-500/20 text-sky-300 border-sky-500/30',
      value: `${activeStat.gnn_mae}`,
      valueColor: 'text-sky-300',
      unit: 'µg/m³',
      deltaBadge: `-${Math.round(((activeStat.cams_mae - activeStat.gnn_mae) / activeStat.cams_mae) * 100)}% Error`,
      description: (
        <>
          vs CAMS: <strong className="text-rose-400 font-numbers">{activeStat.cams_mae}</strong> | Persistence: <strong className="text-rose-400 font-numbers">{activeStat.persist_mae}</strong>
        </>
      ),
      expanded: (
        <div className="space-y-2 text-xs">
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div>
              <span className="text-[#a7d0bf] block text-[10px] uppercase font-bold">RMSE Dispersion</span>
              <span className="font-mono font-bold text-sky-300">{activeStat.gnn_rmse} µg/m³</span>
            </div>
            <div>
              <span className="text-[#a7d0bf] block text-[10px] uppercase font-bold">Station-Hour Hit Rate</span>
              <span className="font-mono font-bold text-white">{fmt(activeStat.gnn_within_25, '%')} within ±25 µg</span>
            </div>
          </div>
          <div className="space-y-1">
            <div className="flex justify-between text-[10px] text-[#a7d0bf] font-mono">
              <span>GNN Error: ±{activeStat.gnn_mae}</span>
              <span>CAMS Error: ±{activeStat.cams_mae}</span>
            </div>
            <div className="w-full bg-emerald-950/80 rounded-full h-1.5 overflow-hidden flex">
              <div 
                className="bg-sky-400 h-full rounded-full transition-all duration-500" 
                style={{ width: `${Math.min(100, Math.round((activeStat.gnn_mae / activeStat.cams_mae) * 100))}%` }} 
              />
            </div>
          </div>
        </div>
      ),
    },
    {
      id: 'category-accuracy',
      label: 'AQI Band Accuracy',
      headerColor: 'text-neutral-300',
      badge: 'CPCB 6-Tier',
      badgeColor: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
      value: `${activeStat.category_accuracy}%`,
      valueColor: 'text-purple-300',
      unit: '',
      deltaBadge: pts(activeStat.category_accuracy, activeStat.cams_category_accuracy),
      description: 'Hits correct regulatory band (Good/Mod/Poor/Severe)',
      expanded: (
        <div className="space-y-2 text-xs">
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div>
              <span className="text-[#a7d0bf] block text-[10px] uppercase font-bold">Within ±1 Band</span>
              <span className="font-mono font-bold text-purple-300">{fmt(activeStat.gnn_within_one_band, '%')}</span>
            </div>
            <div>
              <span className="text-[#a7d0bf] block text-[10px] uppercase font-bold">Severe Yes/No</span>
              <span className="font-mono font-bold text-white">{fmt(activeStat.gnn_severe_binary_accuracy, '%')} Accuracy</span>
            </div>
          </div>
          <div className="space-y-1">
            <div className="flex justify-between text-[10px] text-[#a7d0bf] font-mono">
              <span>Exact Match: {activeStat.category_accuracy}%</span>
              <span>CAMS: {fmt(activeStat.cams_category_accuracy, '%')}</span>
            </div>
            <div className="w-full bg-emerald-950/80 rounded-full h-1.5 overflow-hidden flex">
              <div 
                className="bg-purple-400 h-full rounded-full transition-all duration-500" 
                style={{ width: `${activeStat.category_accuracy}%` }} 
              />
            </div>
          </div>
        </div>
      ),
    },
    {
      id: 'correlation-r2',
      label: 'Correlation (R²)',
      headerColor: 'text-neutral-300',
      badge: 'Spatial Fit',
      badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
      value: `${activeStat.gnn_r2}`,
      valueColor: 'text-amber-300',
      unit: '/ 1.0',
      deltaBadge: pts(activeStat.gnn_r2, activeStat.cams_r2, ''),
      description: (
        <>
          CAMS R² <strong className="font-numbers text-rose-300">{activeStat.cams_r2}</strong> · Persistence R² <strong className="font-numbers text-rose-300">{activeStat.persist_r2}</strong>
        </>
      ),
      expanded: (
        <div className="space-y-2 text-xs">
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div>
              <span className="text-[#a7d0bf] block text-[10px] uppercase font-bold">Pearson Coeff (r)</span>
              <span className="font-mono font-bold text-amber-300">{fmt(activeStat.gnn_pearson_r)} (CAMS {fmt(activeStat.cams_pearson_r)})</span>
            </div>
            <div>
              <span className="text-[#a7d0bf] block text-[10px] uppercase font-bold">Persistence R²</span>
              <span className="font-mono font-bold text-rose-400">{activeStat.persist_r2}</span>
            </div>
          </div>
          <div className="space-y-1">
            <div className="flex justify-between text-[10px] text-[#a7d0bf] font-mono">
              <span>GNN R²: {activeStat.gnn_r2}</span>
              <span>CAMS R²: {activeStat.cams_r2}</span>
            </div>
            <div className="w-full bg-emerald-950/80 rounded-full h-1.5 overflow-hidden flex">
              <div 
                className="bg-amber-400 h-full rounded-full transition-all duration-500" 
                style={{ width: `${Math.round(activeStat.gnn_r2 * 100)}%` }} 
              />
            </div>
          </div>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6 font-sans">
      {/* Title & Trust Statement (Unboxed) */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-4 border-b border-emerald-800/40 text-white">
        <div>
          <h2 className="font-heading text-2xl text-white">
            System Track Record & Historical Verification
          </h2>
          <p className="text-xs text-[#a7d0bf] mt-1">
            Logged predicted-vs-actual outcomes from the automated inference & evaluation loop. Real evidence against ground truth.
          </p>
        </div>

        {/* Lead Time Selector */}
        <div className="flex items-center gap-1.5 bg-[#061d15] p-1 rounded-xl border border-emerald-700/60 text-xs">
          <button
            type="button"
            onClick={() => setSelectedLeadTime('24h')}
            className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
              selectedLeadTime === '24h' ? 'bg-emerald-600 text-white shadow-sm' : 'text-emerald-200 hover:text-white'
            }`}
          >
            24h Horizon
          </button>
          <button
            type="button"
            onClick={() => setSelectedLeadTime('48h')}
            className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
              selectedLeadTime === '48h' ? 'bg-emerald-600 text-white shadow-sm' : 'text-emerald-200 hover:text-white'
            }`}
          >
            48h Horizon
          </button>
          <button
            type="button"
            onClick={() => setSelectedLeadTime('72h')}
            className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
              selectedLeadTime === '72h' ? 'bg-emerald-600 text-white shadow-sm' : 'text-emerald-200 hover:text-white'
            }`}
          >
            72h Horizon
          </button>
        </div>
      </div>

      {/* Top Benchmark Metric Bar (Unified Expanding Row on Hover) */}
      <div 
        onMouseLeave={() => setHoveredCardIndex(null)}
        className="flex flex-col lg:flex-row divide-y lg:divide-y-0 lg:divide-x divide-emerald-800/50 bg-[#0a2e21] rounded-2xl border border-emerald-600/40 shadow-lg text-white overflow-hidden transition-all duration-300"
      >
        {benchmarkCards.map((card, idx) => {
          const isHovered = hoveredCardIndex === idx;
          const isAnyHovered = hoveredCardIndex !== null;

          return (
            <div
              key={card.id}
              onMouseEnter={() => setHoveredCardIndex(idx)}
              className={`p-5 flex flex-col justify-between min-w-0 cursor-pointer select-none transition-colors duration-200 relative ${
                isHovered ? 'bg-[#0f4432]' : 'hover:bg-[#0c3626]'
              }`}
              style={{
                flex: !isAnyHovered ? '1 1 0%' : isHovered ? '1.85 1 0%' : '0.716 1 0%',
                transition: 'flex 0.38s cubic-bezier(0.16, 1, 0.3, 1), background-color 0.2s ease',
              }}
            >
              {/* Header Label + Floating Pill on Hover */}
              <div>
                <div className="flex items-center justify-between text-xs mb-2 min-w-0 gap-1.5">
                  <span className={`font-bold uppercase tracking-wider text-xs truncate ${card.headerColor}`}>
                    {card.label}
                  </span>
                  {isHovered && (
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold shrink-0 border animate-in fade-in zoom-in-95 duration-200 ${card.badgeColor}`}>
                      {card.badge}
                    </span>
                  )}
                </div>

                {/* Main Stat Value + Delta Badge on Hover */}
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className={`text-3xl font-numbers font-bold ${card.valueColor}`}>
                    {card.value}
                  </span>
                  {card.unit && (
                    <span className="text-xs text-neutral-300 font-bold">{card.unit}</span>
                  )}
                  {isHovered && (
                    <span className="text-[11px] font-mono font-bold text-emerald-300 bg-emerald-950/70 px-1.5 py-0.5 rounded border border-emerald-700/60 animate-in fade-in duration-200">
                      {card.deltaBadge}
                    </span>
                  )}
                </div>

                {/* Base Description */}
                <p className="text-[11px] text-[#a7d0bf] mt-2 pt-2 border-t border-emerald-800/40 line-clamp-2">
                  {card.description}
                </p>
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

      {/* ChartBarInteractive: MAE Error Degradation Comparison */}
      <Card className="bg-[#0a2e21] border border-emerald-600/40 text-white shadow-lg">
        <CardHeader className="flex flex-col items-stretch space-y-0 border-b border-emerald-800/40 p-0 sm:flex-row">
          <div className="flex flex-1 flex-col justify-center gap-1 px-6 py-5">
            <CardTitle className="font-heading text-xl text-white">
              Lead Time Error Degradation (MAE in µg/m³)
            </CardTitle>
            <CardDescription className="text-xs text-[#a7d0bf]">
              Held-out test (Oct–Dec 2025): AERIS GNN vs raw CAMS vs persistence across forecast days 1–3 (+24h, +48h, +72h)
            </CardDescription>
          </div>

          {/* Interactive filter buttons in CardHeader */}
          <div className="flex border-t sm:border-t-0 sm:border-l border-emerald-800/40 divide-x divide-emerald-800/40">
            <button
              type="button"
              data-active={activeMetricTab === "all"}
              onClick={() => setActiveMetricTab("all")}
              className="flex flex-1 flex-col justify-center gap-0.5 px-4 py-3 text-left data-[active=true]:bg-[#14533c] hover:bg-[#0e3d2c] transition-colors min-w-[95px]"
            >
              <span className="text-[10px] text-neutral-400 font-bold uppercase">Comparison</span>
              <span className="text-xs font-bold text-white">All Models</span>
            </button>
            <button
              type="button"
              data-active={activeMetricTab === "gnn_mae"}
              onClick={() => setActiveMetricTab("gnn_mae")}
              className="flex flex-1 flex-col justify-center gap-0.5 px-4 py-3 text-left data-[active=true]:bg-[#14533c] hover:bg-[#0e3d2c] transition-colors min-w-[100px]"
            >
              <span className="text-[10px] text-emerald-300 font-bold flex items-center gap-1"><span className="font-aeris font-vaayu text-xs font-normal">AERIS</span><span>GNN</span></span>
              <span className="text-xs font-numbers text-sky-300">{stats.length ? (stats.reduce((a, x) => a + (x.gnn_mae ?? 0), 0) / stats.length).toFixed(1) : '—'} avg</span>
            </button>
            <button
              type="button"
              data-active={activeMetricTab === "cams_mae"}
              onClick={() => setActiveMetricTab("cams_mae")}
              className="flex flex-1 flex-col justify-center gap-0.5 px-4 py-3 text-left data-[active=true]:bg-[#14533c] hover:bg-[#0e3d2c] transition-colors min-w-[100px]"
            >
              <span className="text-[10px] text-purple-400 font-bold">CAMS Physics</span>
              <span className="text-xs font-numbers text-purple-300">{stats.length ? (stats.reduce((a, x) => a + (x.cams_mae ?? 0), 0) / stats.length).toFixed(1) : '—'} avg</span>
            </button>
            <button
              type="button"
              data-active={activeMetricTab === "persist_mae"}
              onClick={() => setActiveMetricTab("persist_mae")}
              className="flex flex-1 flex-col justify-center gap-0.5 px-4 py-3 text-left data-[active=true]:bg-[#14533c] hover:bg-[#0e3d2c] transition-colors min-w-[100px]"
            >
              <span className="text-[10px] text-rose-400 font-bold">Persistence</span>
              <span className="text-xs font-numbers text-rose-300">{stats.length ? (stats.reduce((a, x) => a + (x.persist_mae ?? 0), 0) / stats.length).toFixed(1) : '—'} avg</span>
            </button>
          </div>
        </CardHeader>

        <CardContent className="pt-6">
          <ChartContainer config={trackRecordChartConfig} className="aspect-auto h-[260px] w-full">
            <BarChart data={leadTimeComparisonData} margin={{ top: 10, right: 15, bottom: 0, left: -10 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#134e38" />
              <XAxis dataKey="lead_time" tickLine={false} axisLine={false} tickMargin={8} stroke="#a7d0bf" />
              <YAxis tickLine={false} axisLine={false} stroke="#a7d0bf" />
              <ChartTooltip 
                content={
                  <ChartTooltipContent 
                    className="w-[180px] bg-[#0a2e21] border border-emerald-600/50 text-white" 
                    labelFormatter={(val) => `Forecast Horizon: ${val}`}
                  />
                } 
              />
              {(activeMetricTab === "all" || activeMetricTab === "gnn_mae") && (
                <Bar 
                  dataKey="gnn_mae" 
                  fill="var(--color-gnn_mae)" 
                  name="AERIS GNN" 
                  radius={[4, 4, 0, 0]} 
                />
              )}
              {(activeMetricTab === "all" || activeMetricTab === "cams_mae") && (
                <Bar 
                  dataKey="cams_mae" 
                  fill="var(--color-cams_mae)" 
                  name="CAMS Baseline" 
                  radius={[4, 4, 0, 0]} 
                />
              )}
              {(activeMetricTab === "all" || activeMetricTab === "persist_mae") && (
                <Bar 
                  dataKey="persist_mae" 
                  fill="var(--color-persist_mae)" 
                  name="Persistence (24 h mean)" 
                  radius={[4, 4, 0, 0]} 
                />
              )}
              <ChartLegend content={<ChartLegendContent />} />
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>

      {/* Logged Past Forecasts Verification - Clean Subheading & Actual Table (Unboxed) */}
      <div className="space-y-4 pt-2">
        {/* Subheading Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 pb-3 border-b border-emerald-800/40">
          <div>
            <h3 className="font-heading text-xl sm:text-2xl text-white">
              Audit Log: Verified Historical Forecasts (+{selectedLeadTime})
            </h3>
            <p className="text-xs text-[#a7d0bf] mt-0.5">
              Ground Truth directly from CPCB CAAQMS Stations
            </p>
          </div>
          <span className="text-xs text-emerald-400 font-mono font-bold">
            56 CAAQMS Ground Stations Synced
          </span>
        </div>

        {/* The Actual Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse font-sans">
            <thead>
              <tr className="border-b border-emerald-800/60 text-[#a7d0bf]">
                <th className="py-3 px-3 font-bold uppercase tracking-wider">Station</th>
                <th className="py-3 px-3 font-bold uppercase tracking-wider">Timestamp (IST)</th>
                <th className="py-3 px-3 font-bold uppercase tracking-wider text-right">Actual Ground</th>
                <th className="py-3 px-3 font-bold uppercase tracking-wider text-right">Actual AQI</th>
                <th className="py-3 px-3 text-emerald-300 font-bold uppercase tracking-wider text-right">GNN Forecast</th>
                <th className="py-3 px-3 text-purple-300 font-bold uppercase tracking-wider text-right">CAMS Physics</th>
                <th className="py-3 px-3 text-rose-300 font-bold uppercase tracking-wider text-right">Persistence</th>
                <th className="py-3 px-3 font-bold uppercase tracking-wider text-right">GNN Error</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-emerald-800/25 text-white">
              {filteredRecords.map((r, i) => {
                const error = Math.abs(r.gnn_pm25 - r.actual_pm25);
                return (
                  <tr key={i} className="hover:bg-emerald-950/25 transition-colors">
                    <td className="py-3.5 px-3 font-bold text-white">
                      {r.station_name}
                    </td>
                    <td className="py-3.5 px-3 text-[#a7d0bf] font-mono">
                      {r.timestamp}
                    </td>
                    <td className="py-3.5 px-3 font-numbers text-white font-bold text-right">
                      {r.actual_pm25} µg/m³
                    </td>
                    <td className="py-3.5 px-3 font-numbers font-bold text-right" style={{ color: getAQIColor(r.actual_aqi) }}>
                      {r.actual_aqi}
                    </td>
                    <td className="py-3.5 px-3 font-numbers text-emerald-300 font-bold text-right">
                      {r.gnn_pm25} µg/m³ <span className="text-emerald-400 font-sans font-normal text-[11px]">({r.gnn_aqi} AQI)</span>
                    </td>
                    <td className="py-3.5 px-3 font-numbers text-purple-200 text-right">
                      {r.cams_pm25} µg/m³
                    </td>
                    <td className="py-3.5 px-3 font-numbers text-rose-200 text-right">
                      {r.persist_pm25 ?? "—"} µg/m³
                    </td>
                    <td className="py-3.5 px-3 font-mono font-bold text-right">
                      <span className={error <= 15 ? 'text-emerald-400' : 'text-amber-400'}>
                        ±{error} µg/m³
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
