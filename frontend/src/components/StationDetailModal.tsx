import React, { useState } from 'react';
import { 
  ResponsiveContainer, 
  ComposedChart, 
  Line, 
  Area, 
  XAxis, 
  YAxis, 
  Tooltip, 
  CartesianGrid
} from 'recharts';
import { StationForecast } from '../types';
import { getAQIBadgeClass, getGRAPStage } from '../utils/aqi';
import { 
  formatConfidenceRange, 
  formatHourLeadTime, 
  formatVentilation, 
  degreesToCompass 
} from '../utils/formatters';

interface StationDetailModalProps {
  forecast: StationForecast | null;
  selectedHour: number;
  onClose: () => void;
}

export const StationDetailModal: React.FC<StationDetailModalProps> = ({
  forecast,
  selectedHour,
  onClose,
}) => {
  const [activeMetric, setActiveMetric] = useState<'aqi' | 'pm25' | 'pm10' | 'no2' | 'o3'>('pm25');

  if (!forecast) return null;

  const { station, hours } = forecast;
  const currentHourData = hours[selectedHour] || hours[0];
  const currentAQI = currentHourData.aqi.mean;
  const currentCategory = currentHourData.category;
  const grap = getGRAPStage(currentAQI);
  const ventStatus = formatVentilation(currentHourData.physics.ventilation_coefficient);

  const chartData = hours.map((h) => ({
    hour: `+${h.hour_offset}h`,
    rawHour: h.hour_offset,
    pm25: h.pm25.mean,
    pm25_lower: h.pm25.lower,
    pm25_upper: h.pm25.upper,
    cams_pm25: h.cams_baseline_pm25,
    aqi: h.aqi.mean,
    aqi_lower: h.aqi.lower,
    aqi_upper: h.aqi.upper,
    cams_aqi: h.cams_baseline_aqi,
    pm10: h.pm10.mean,
    no2: h.no2.mean,
    o3: h.o3.mean,
    pblh: h.weather.boundary_layer_height,
    inversion: h.physics.inversion_index,
    wind: h.weather.wind_speed,
  }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200 font-sans">
      <div 
        className="bg-[#0a2e21] border-2 border-emerald-600/40 rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden text-white"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 sm:px-6 border-b border-[#134e38] bg-[#072118] flex items-center justify-between text-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#0e3d2c] border border-emerald-600/50 flex items-center justify-center text-white shadow-sm">
              <span className="material-symbols-outlined text-xl text-[#86efac]">sensors</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-heading font-normal text-lg text-white">{station.name}</h3>
                <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${getAQIBadgeClass(currentCategory)}`}>
                  {currentCategory}
                </span>
                {station.isBoundaryNode && (
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-950/80 text-amber-300 border border-amber-600/50 font-bold">
                    Synthetic Fire Boundary Node
                  </span>
                )}
              </div>
              <p className="text-xs text-[#a7d0bf] flex items-center gap-1.5 mt-0.5">
                <span className="material-symbols-outlined text-sm text-emerald-400">location_on</span>
                <span>{station.city}, {station.state} ({station.zone} Zone)</span>
                <span>•</span>
                <span className="font-mono text-emerald-200">Lat: {station.lat.toFixed(4)}, Lon: {station.lon.toFixed(4)}</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-emerald-200 hover:text-white hover:bg-[#0e3d2c] transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-xl">close</span>
          </button>
        </div>

        {/* Telemetry Summary - Clean, Unboxed Stats */}
        <div className="p-4 sm:px-6 bg-[#072118] border-b border-[#134e38] grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs text-white">
          <div>
            <div className="text-[#a7d0bf] mb-1 flex items-center justify-between">
              <span className="uppercase tracking-wider font-bold text-[10px]">AQI ({formatHourLeadTime(selectedHour)})</span>
              <span className="text-[10px] text-emerald-400 font-mono font-bold">P10-P90</span>
            </div>
            <div className="text-2xl font-bold font-mono text-white">
              {Math.round(currentAQI)}
            </div>
            <div className="text-[11px] text-[#a7d0bf] font-mono mt-0.5">
              Confidence: <strong className="text-emerald-300">{formatConfidenceRange(currentHourData.aqi)}</strong>
            </div>
          </div>

          <div>
            <div className="text-[#a7d0bf] mb-1 flex items-center justify-between">
              <span className="uppercase tracking-wider font-bold text-[10px]">PM2.5 / CAMS Delta</span>
              <span className="text-[10px] text-emerald-400 font-mono font-bold">Residual</span>
            </div>
            <div className="text-2xl font-bold font-mono text-white flex items-baseline gap-1.5">
              <span>{Math.round(currentHourData.pm25.mean)}</span>
              <span className="text-xs text-[#a7d0bf] font-normal">µg/m³</span>
            </div>
            <div className="text-[11px] text-[#a7d0bf] font-mono mt-0.5">
              CAMS: <span className="text-white font-bold">{currentHourData.cams_baseline_pm25}</span> | Δ: <span className="text-emerald-400 font-bold">+{currentHourData.gnn_residual_pm25}</span>
            </div>
          </div>

          <div>
            <div className="text-[#a7d0bf] mb-1 flex items-center justify-between">
              <span className="uppercase tracking-wider font-bold text-[10px]">Ventilation (Vc)</span>
              <span className="material-symbols-outlined text-sm text-emerald-400">air</span>
            </div>
            <div className="text-2xl font-bold font-mono text-white">
              {currentHourData.physics.ventilation_coefficient.toLocaleString()}{' '}
              <span className="text-xs text-[#a7d0bf] font-normal">m²/s</span>
            </div>
            <div className="text-[11px] mt-0.5 truncate">
              <span className={`font-bold ${ventStatus.badgeColor}`}>
                {ventStatus.label}
              </span>
            </div>
          </div>

          <div>
            <div className="text-[#a7d0bf] mb-1 flex items-center justify-between">
              <span className="uppercase tracking-wider font-bold text-[10px]">Atmospheric Lid</span>
              <span className="material-symbols-outlined text-sm text-amber-500">layers</span>
            </div>
            <div className="text-2xl font-bold font-mono text-white">
              {currentHourData.weather.boundary_layer_height}m{' '}
              <span className="text-xs text-[#a7d0bf] font-normal">PBLH</span>
            </div>
            <div className="text-[11px] text-[#a7d0bf] font-mono mt-0.5">
              Wind: {currentHourData.weather.wind_speed} m/s ({degreesToCompass(currentHourData.weather.wind_direction)})
            </div>
          </div>
        </div>

        {/* Scrollable Chart & Deep-Dive Section */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1 bg-[#0a2e21] text-white">
          {/* Metric Selector Tabs */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 bg-[#061d15] p-1 rounded-xl border border-emerald-700/60 text-xs">
              <button
                type="button"
                onClick={() => setActiveMetric('pm25')}
                className={`px-3 py-1 rounded-lg font-medium transition-all cursor-pointer ${
                  activeMetric === 'pm25' ? 'bg-emerald-600 text-white font-bold' : 'text-emerald-100 hover:text-white'
                }`}
              >
                PM2.5 (Fine Particulates)
              </button>
              <button
                type="button"
                onClick={() => setActiveMetric('aqi')}
                className={`px-3 py-1 rounded-lg font-medium transition-all cursor-pointer ${
                  activeMetric === 'aqi' ? 'bg-emerald-600 text-white font-bold' : 'text-emerald-100 hover:text-white'
                }`}
              >
                Composite AQI
              </button>
              <button
                type="button"
                onClick={() => setActiveMetric('pm10')}
                className={`px-3 py-1 rounded-lg font-medium transition-all cursor-pointer ${
                  activeMetric === 'pm10' ? 'bg-emerald-600 text-white font-bold' : 'text-emerald-100 hover:text-white'
                }`}
              >
                PM10
              </button>
              <button
                type="button"
                onClick={() => setActiveMetric('no2')}
                className={`px-3 py-1 rounded-lg font-medium transition-all cursor-pointer ${
                  activeMetric === 'no2' ? 'bg-emerald-600 text-white font-bold' : 'text-emerald-100 hover:text-white'
                }`}
              >
                NO2
              </button>
              <button
                type="button"
                onClick={() => setActiveMetric('o3')}
                className={`px-3 py-1 rounded-lg font-medium transition-all cursor-pointer ${
                  activeMetric === 'o3' ? 'bg-emerald-600 text-white font-bold' : 'text-emerald-100 hover:text-white'
                }`}
              >
                Ozone (O3)
              </button>
            </div>

            <div className="text-xs text-[#a7d0bf] font-mono flex items-center gap-3">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-0.5 bg-[#34d399] inline-block"></span>
                GNN Corrected (Mean)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2 bg-[#86efac]/40 border border-[#16a34a] inline-block rounded-xs"></span>
                Confidence Range (P10-P90)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-0.5 bg-neutral-400 inline-block border-dashed"></span>
                CAMS Raw Physics
              </span>
            </div>
          </div>

          {/* 72-Hour Forecast Time-Series Chart */}
          <div className="h-64 sm:h-72 w-full bg-[#061d15] p-3 rounded-2xl border border-emerald-700/50">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 10, right: 20, bottom: 0, left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#134e38" vertical={false} />
                <XAxis 
                  dataKey="hour" 
                  stroke="#a7d0bf" 
                  fontSize={11} 
                  tickLine={false}
                  interval={5}
                />
                <YAxis 
                  stroke="#a7d0bf" 
                  fontSize={11} 
                  tickLine={false}
                  domain={['auto', 'auto']}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0a2e21',
                    borderColor: '#134e38',
                    borderRadius: '0.75rem',
                    color: '#ffffff',
                    fontSize: '12px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
                  }}
                />

                {activeMetric === 'pm25' && (
                  <>
                    <Area
                      type="monotone"
                      dataKey="pm25_upper"
                      stroke="none"
                      fill="#86efac"
                      fillOpacity={0.25}
                      name="Confidence Upper"
                    />
                    <Area
                      type="monotone"
                      dataKey="pm25_lower"
                      stroke="none"
                      fill="#061d15"
                      fillOpacity={1.0}
                      name="Confidence Lower"
                    />
                    <Line
                      type="monotone"
                      dataKey="cams_pm25"
                      stroke="#94a39b"
                      strokeWidth={1.5}
                      strokeDasharray="4 4"
                      dot={false}
                      name="CAMS Baseline (µg/m³)"
                    />
                    <Line
                      type="monotone"
                      dataKey="pm25"
                      stroke="#34d399"
                      strokeWidth={2.5}
                      dot={false}
                      name="AERIS GNN Residual Corrected (µg/m³)"
                    />
                  </>
                )}

                {activeMetric === 'aqi' && (
                  <>
                    <Area
                      type="monotone"
                      dataKey="aqi_upper"
                      stroke="none"
                      fill="#ea580c"
                      fillOpacity={0.18}
                      name="AQI Upper"
                    />
                    <Area
                      type="monotone"
                      dataKey="aqi_lower"
                      stroke="none"
                      fill="#061d15"
                      fillOpacity={1.0}
                      name="AQI Lower"
                    />
                    <Line
                      type="monotone"
                      dataKey="cams_aqi"
                      stroke="#94a39b"
                      strokeWidth={1.5}
                      strokeDasharray="4 4"
                      dot={false}
                      name="CAMS Baseline AQI"
                    />
                    <Line
                      type="monotone"
                      dataKey="aqi"
                      stroke="#34d399"
                      strokeWidth={2.5}
                      dot={false}
                      name="AERIS GNN Corrected AQI"
                    />
                  </>
                )}

                {activeMetric === 'pm10' && (
                  <Line
                    type="monotone"
                    dataKey="pm10"
                    stroke="#ca8a04"
                    strokeWidth={2}
                    dot={false}
                    name="PM10 (µg/m³)"
                  />
                )}

                {activeMetric === 'no2' && (
                  <Line
                    type="monotone"
                    dataKey="no2"
                    stroke="#db2777"
                    strokeWidth={2}
                    dot={false}
                    name="NO2 (µg/m³)"
                  />
                )}

                {activeMetric === 'o3' && (
                  <Line
                    type="monotone"
                    dataKey="o3"
                    stroke="#16a34a"
                    strokeWidth={2}
                    dot={false}
                    name="O3 (µg/m³)"
                  />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* CPCB Regulatory GRAP Action Plan - Unboxed */}
          <div className="pt-3 border-t border-emerald-800/40 text-xs space-y-1.5 text-white">
            <div className="flex items-center justify-between">
              <span className="font-bold text-white flex items-center gap-1.5">
                <span className="material-symbols-outlined text-sm text-amber-500">warning</span>
                <span>Statutory GRAP Protocol Required:</span>
              </span>
              <span className={`font-mono font-bold ${grap.badgeColor}`}>
                {grap.stage}
              </span>
            </div>
            <p className="text-slate-300 leading-relaxed">
              {grap.action}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
export default StationDetailModal;
