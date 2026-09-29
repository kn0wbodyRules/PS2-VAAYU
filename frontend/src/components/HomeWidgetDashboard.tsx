import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import DraggableWidgetGrid, { WidgetItem, WidgetSize } from './ui/draggable-widget-grid';
import { 
  StationForecast, 
  Alert, 
  FIRMSFireHotspot, 
  FirePlumeTrajectory,
  TrackRecordEntry,
  ModelAccuracyStats,
  DataSourceStatus
} from '../types';
import { formatVentilation, formatInversionLevel } from '../utils/formatters';
import { GripVertical, Pencil, SlidersHorizontal, Wind, Zap } from 'lucide-react';

interface HomeWidgetDashboardProps {
  forecasts: Map<string, StationForecast>;
  selectedHour: number;
  alerts: Alert[];
  fireHotspots: FIRMSFireHotspot[];
  firePlumes: FirePlumeTrajectory[];
  inversionTrend: any[];
  trackRecords: TrackRecordEntry[];
  modelStats: ModelAccuracyStats[];
  dataSources: DataSourceStatus[];
  onNavigateTab: (tab: 'map' | 'inversion-fire' | 'comparison' | 'track-record') => void;
  onOpenAlert: (alert: Alert) => void;
  onSelectStation: (stationId: string) => void;
}

interface CustomWidget extends WidgetItem {
  type: 
    | 'map-overview'
    | 'inversion-gauge'
    | 'ventilation-card'
    | 'firms-fires'
    | 'cams-vs-gnn'
    | 'track-record'
    | 'proactive-alert'
    | 'high-risk-stations'
    | 'system-freshness'
    | 'plume-trajectory'
    | 'delhi-aqi-gauge'
    | 'meteo-surface';
}

const MAX_WIDGETS = 14;

const DEFAULT_HOME_WIDGETS: CustomWidget[] = [
  { id: 'w-alert', type: 'proactive-alert', size: 'wide', label: 'Proactive Advisory' },
  { id: 'w-inversion', type: 'inversion-gauge', size: 'sm', label: 'Inversion Index' },
  { id: 'w-ventilation', type: 'ventilation-card', size: 'sm', label: 'Ventilation Capacity' },
  { id: 'w-aqi', type: 'delhi-aqi-gauge', size: 'sm', label: 'Delhi Mean AQI' },
  { id: 'w-meteo', type: 'meteo-surface', size: 'sm', label: 'Surface Boundary' },
  { id: 'w-firms', type: 'firms-fires', size: 'wide', label: 'NASA FIRMS Fires' },
  { id: 'w-plume', type: 'plume-trajectory', size: 'sm', label: 'Plume Trajectory' },
  { id: 'w-accuracy', type: 'track-record', size: 'sm', label: 'Very Poor+ Event Recall' },
  { id: 'w-cams', type: 'cams-vs-gnn', size: 'wide', label: 'CAMS vs GNN' },
  { id: 'w-stations', type: 'high-risk-stations', size: 'wide', label: 'Focal CAAQMS Stations' },
  { id: 'w-freshness', type: 'system-freshness', size: 'sm', label: 'Pipeline Health' },
  { id: 'w-map', type: 'map-overview', size: 'wide', label: 'Spatial Telemetry Grid' },
];

const AVAILABLE_WIDGET_CATALOG: { 
  type: CustomWidget['type']; 
  label: string; 
  description: string;
  defaultSize: WidgetSize; 
  tab: string;
}[] = [
  { 
    type: 'proactive-alert', 
    label: 'GRAP Proactive Advisory', 
    description: 'Advance warning banner before severe AQI threshold breach',
    defaultSize: 'wide', 
    tab: 'Alerts',
  },
  { 
    type: 'delhi-aqi-gauge', 
    label: 'Delhi-NCR Basin AQI & GRAP Level', 
    description: 'Real-time composite basin-wide average AQI and activated emergency stage',
    defaultSize: 'sm', 
    tab: 'Alerts',
  },
  { 
    type: 'map-overview', 
    label: 'Spatial Telemetry Summary Grid', 
    description: 'Live sensor network overview with wind direction and connectivity',
    defaultSize: 'wide', 
    tab: 'Spatial Map',
  },
  { 
    type: 'inversion-gauge', 
    label: 'Atmospheric Inversion Index (0-100)', 
    description: 'Diurnal thermal cap strength trapping particulates near ground',
    defaultSize: 'sm', 
    tab: 'Inversion & Fire',
  },
  { 
    type: 'ventilation-card', 
    label: 'Ventilation Dispersion Capacity (Vc)', 
    description: 'Mixing height × wind speed horizontal dispersion potential',
    defaultSize: 'sm', 
    tab: 'Inversion & Fire',
  },
  { 
    type: 'meteo-surface', 
    label: 'Surface Boundary & Dispersion Vector', 
    description: 'Planetary boundary layer height, ambient temperature, humidity & wind direction',
    defaultSize: 'sm', 
    tab: 'Inversion & Fire',
  },
  { 
    type: 'firms-fires', 
    label: 'NASA FIRMS Stubble Fires & MW Power', 
    description: 'Real-time satellite detections in Punjab and Haryana upwind corridor',
    defaultSize: 'wide', 
    tab: 'Inversion & Fire',
  },
  { 
    type: 'plume-trajectory', 
    label: 'Stubble Plume Wind Corridor & ETA', 
    description: 'Atmospheric transport vectors entering North-West Delhi',
    defaultSize: 'sm', 
    tab: 'Inversion & Fire',
  },
  { 
    type: 'cams-vs-gnn', 
    label: 'GNN Residual vs CAMS Baseline', 
    description: 'Day-2 & Day-3 correction delta resolving baseline underprediction',
    defaultSize: 'wide', 
    tab: 'Model Comparison',
  },
  { 
    type: 'track-record', 
    label: 'Verification & Very Poor+ Event Recall', 
    description: 'Empirical audit track record against CPCB ground truth',
    defaultSize: 'sm', 
    tab: 'Track Record',
  },
  { 
    type: 'high-risk-stations', 
    label: 'Top 3 Entrapment Stations (Anand Vihar)', 
    description: 'Critical hotspot stations facing immediate stagnation',
    defaultSize: 'wide', 
    tab: 'Spatial Map',
  },
  { 
    type: 'system-freshness', 
    label: 'Telemetry Ingestion & Pipeline Health', 
    description: 'CPCB CAAQMS, CAMS, Open-Meteo sync freshness',
    defaultSize: 'sm', 
    tab: 'System Status',
  },
];

/* ---- Size label map ---- */
const SIZE_DISPLAY: Record<WidgetSize, { label: string; cols: string; icon: string }> = {
  sm:   { label: 'Small (1×1)',  cols: '1×1', icon: '⊡' },
  wide: { label: 'Wide (2×1)',   cols: '2×1', icon: '⊟' },
  tall: { label: 'Tall (1×2)',   cols: '1×2', icon: '⊞' },
  lg:   { label: 'Large (2×2)',  cols: '2×2', icon: '⊠' },
};

/** Compute the target size from the drag delta and initial size with hysteresis */
function computeTargetSize(
  dx: number,
  dy: number,
  initialSize: WidgetSize,
  currentLiveSize: WidgetSize
): WidgetSize {
  // If pointer returned close to initial press location, snap back to initial size
  if (Math.abs(dx) <= 22 && Math.abs(dy) <= 22) {
    return initialSize;
  }

  const THRESHOLD = 36;

  if (initialSize === 'sm') {
    // sm (1x1): right -> wide (2x1), down -> tall (1x2), diagonal -> lg (2x2)
    if (dx > THRESHOLD && dy > THRESHOLD) return 'lg';
    if (dx > THRESHOLD) return 'wide';
    if (dy > THRESHOLD) return 'tall';
    return 'sm';
  }

  if (initialSize === 'wide') {
    // wide (2x1): left -> sm (1x1), down -> lg (2x2), left+down -> tall (1x2)
    if (dx < -THRESHOLD && dy > THRESHOLD) return 'tall';
    if (dx < -THRESHOLD) return 'sm';
    if (dy > THRESHOLD) return 'lg';
    return 'wide';
  }

  if (initialSize === 'tall') {
    // tall (1x2): up -> sm (1x1), right -> lg (2x2), up+right -> wide (2x1)
    if (dx > THRESHOLD && dy < -THRESHOLD) return 'wide';
    if (dy < -THRESHOLD) return 'sm';
    if (dx > THRESHOLD) return 'lg';
    return 'tall';
  }

  if (initialSize === 'lg') {
    // lg (2x2): left+up -> sm (1x1), left -> tall (1x2), up -> wide (2x1)
    if (dx < -THRESHOLD && dy < -THRESHOLD) return 'sm';
    if (dx < -THRESHOLD) return 'tall';
    if (dy < -THRESHOLD) return 'wide';
    return 'lg';
  }

  return currentLiveSize;
}

/**
 * Resize handle with live smooth morphing transformation.
 * As the user drags the corner grip, the widget transforms into each size option
 * in real-time with fluid Motion spring animations and an elegant floating pill indicator.
 */
const ResizeCornerHandle: React.FC<{
  currentSize: WidgetSize;
  onLiveResize: (newSize: WidgetSize) => void;
  onCommit: () => void;
}> = ({ currentSize, onLiveResize, onCommit }) => {
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{
    startX: number;
    startY: number;
    initialSize: WidgetSize;
    currentLiveSize: WidgetSize;
    hasMoved: boolean;
  } | null>(null);

  useEffect(() => {
    if (!isDragging) return;

    const onGlobalMove = (e: PointerEvent) => {
      if (!dragStartRef.current) return;
      const dx = e.clientX - dragStartRef.current.startX;
      const dy = e.clientY - dragStartRef.current.startY;
      if (Math.abs(dx) > 6 || Math.abs(dy) > 6) {
        dragStartRef.current.hasMoved = true;
      }
      const target = computeTargetSize(
        dx,
        dy,
        dragStartRef.current.initialSize,
        dragStartRef.current.currentLiveSize
      );
      if (target !== dragStartRef.current.currentLiveSize) {
        dragStartRef.current.currentLiveSize = target;
        onLiveResize(target);
      }
    };

    const onGlobalUp = (e: PointerEvent) => {
      if (!dragStartRef.current) return;
      const { hasMoved, initialSize } = dragStartRef.current;
      dragStartRef.current = null;
      setIsDragging(false);

      if (hasMoved) {
        onCommit();
      } else {
        // Clean click: cycle sizes smoothly
        const cycle: Record<WidgetSize, WidgetSize> = {
          sm: 'wide',
          wide: 'lg',
          lg: 'sm',
          tall: 'sm',
        };
        const next = cycle[initialSize];
        onLiveResize(next);
        onCommit();
      }
    };

    window.addEventListener('pointermove', onGlobalMove);
    window.addEventListener('pointerup', onGlobalUp);
    window.addEventListener('pointercancel', onGlobalUp);

    return () => {
      window.removeEventListener('pointermove', onGlobalMove);
      window.removeEventListener('pointerup', onGlobalUp);
      window.removeEventListener('pointercancel', onGlobalUp);
    };
  }, [isDragging, onCommit, onLiveResize]);

  const handlePointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    dragStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initialSize: currentSize,
      currentLiveSize: currentSize,
      hasMoved: false,
    };
    setIsDragging(true);
  };

  const previewInfo = SIZE_DISPLAY[currentSize];

  return (
    <>
      {/* Sleek Floating Live Size Pill while dragging */}
      <AnimatePresence>
        {isDragging && (
          <motion.div
            key="resize-pill"
            initial={{ opacity: 0, y: 10, scale: 0.88 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.88 }}
            transition={{ type: 'spring', stiffness: 450, damping: 28 }}
            className="absolute bottom-3 left-1/2 -translate-x-1/2 z-50 pointer-events-none flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-black/95 border border-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.4)] backdrop-blur-md"
          >
            <span className="text-emerald-400 font-mono text-sm leading-none animate-pulse">
              {previewInfo.icon}
            </span>
            <span className="font-mono text-xs font-black text-emerald-300 tracking-wider">
              {previewInfo.cols}
            </span>
            <span className="w-1 h-1 rounded-full bg-emerald-400/60" />
            <span className="font-sans text-xs font-bold uppercase tracking-wider text-white">
              {previewInfo.label}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Corner grip handle: curved and attached to the corner radius of the box */}
      <div
        data-no-drag
        draggable={false}
        onDragStart={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onMouseDown={(e) => e.stopPropagation()}
        onPointerDown={handlePointerDown}
        title="Drag to live resize · click to cycle"
        className={`absolute bottom-0 right-0 w-11 h-11 cursor-se-resize flex items-end justify-end p-1 z-30 group touch-none select-none transition-transform ${
          isDragging ? 'scale-115' : 'hover:scale-105'
        }`}
      >
        <svg
          viewBox="0 0 28 28"
          className="w-7 h-7 pointer-events-none transition-all duration-200"
          fill="none"
        >
          <path
            d="M 5 26.5 L 13.5 26.5 A 13 13 0 0 0 26.5 13.5 L 26.5 5"
            fill="none"
            stroke={isDragging ? '#6ee7b7' : '#10b981'}
            strokeWidth={isDragging ? '2.75' : '2'}
            strokeLinecap="round"
            className={`transition-all duration-200 ${
              isDragging
                ? 'stroke-emerald-300 drop-shadow-[0_0_10px_rgba(110,231,183,1)]'
                : 'stroke-emerald-500/70 group-hover:stroke-emerald-300 group-hover:drop-shadow-[0_0_6px_rgba(110,231,183,0.8)]'
            }`}
          />
        </svg>
      </div>
    </>
  );
};

export const HomeWidgetDashboard: React.FC<HomeWidgetDashboardProps> = ({
  forecasts,
  selectedHour,
  alerts,
  fireHotspots,
  firePlumes,
  inversionTrend,
  trackRecords,
  modelStats,
  dataSources,
  onNavigateTab,
  onOpenAlert,
  onSelectStation,
}) => {
  const [widgets, setWidgets] = useState<CustomWidget[]>(() => {
    const saved = localStorage.getItem('aeris_home_widgets_v3');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length >= 10) {
          return parsed.slice(0, MAX_WIDGETS);
        }
      } catch (e) {}
    }
    return DEFAULT_HOME_WIDGETS;
  });

  const [isOrganizerOpen, setIsOrganizerOpen] = useState(false);
  const [catalogFilter, setCatalogFilter] = useState<string>('all');

  const updateWidgets = (newWidgets: CustomWidget[]) => {
    const capped = newWidgets.slice(0, MAX_WIDGETS);
    setWidgets(capped);
    localStorage.setItem('aeris_home_widgets_v3', JSON.stringify(capped));
  };

  const activeAlert = alerts[0];
  const currentInv = inversionTrend[selectedHour] || inversionTrend[0];
  const invLevel = formatInversionLevel(currentInv?.score ?? 0);
  const vent = formatVentilation(currentInv?.ventilation ?? 0);
  const stat48 = modelStats.find(s => s.lead_time === '48h') || modelStats[0];

  const totalFRP = Math.round(fireHotspots.reduce((acc, f) => acc + f.frp, 0));

  // ---- live values for the widgets: computed from the API data, nothing hard-coded ----
  const live = React.useMemo(() => {
    const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
    const rows = Array.from(forecasts.values())
      .map((f) => ({ st: f.station, h: f.hours[Math.min(selectedHour, f.hours.length - 1)], h0: f.hours[0],
                     h48: f.hours[Math.min(48, f.hours.length - 1)] }))
      .filter((r) => r.h);
    const cat = (a: number) => (a > 400 ? 'Severe' : a > 300 ? 'Very Poor' : a > 200 ? 'Poor' : a > 100 ? 'Moderate' : a > 50 ? 'Satisfactory' : 'Good');
    const grap = (a: number) => (a > 450 ? 'GRAP Stage IV' : a > 400 ? 'GRAP Stage III' : a > 300 ? 'GRAP Stage II' : a > 200 ? 'GRAP Stage I' : 'No GRAP stage');
    const byAqi = [...rows].sort((a, b) => b.h.aqi.mean - a.h.aqi.mean);
    const aqiMean = Math.round(avg(rows.map((r) => r.h.aqi.mean)));
    // wind: vector mean of station winds (meteorological: direction the wind blows FROM)
    const rad = (d: number) => (d * Math.PI) / 180;
    const u = avg(rows.map((r) => -r.h.weather.wind_speed * Math.sin(rad(r.h.weather.wind_direction))));
    const v = avg(rows.map((r) => -r.h.weather.wind_speed * Math.cos(rad(r.h.weather.wind_direction))));
    const windFrom = Math.round(((Math.atan2(-u, -v) * 180) / Math.PI + 360) % 360);
    const windSpeed = avg(rows.map((r) => r.h.weather.wind_speed));
    const inv = avg(rows.map((r) => r.h.physics.inversion_index));
    const driver = (r: typeof rows[0]) =>
      r.h.physics.fire_influence_score >= 60 ? 'Upwind fire influence' : r.h.physics.inversion_index >= 85 ? 'Low dispersion' : 'Local emissions';
    const signed = (x: number) => `${x >= 0 ? '+' : ''}${Math.round(x)}`;
    const clusterMap = new Map<string, { name: string; frp: number; n: number }>();
    fireHotspots.forEach((f) => {
      const key = `${Math.floor(f.lat * 2) / 2}_${Math.floor(f.lon * 2) / 2}`;
      const c = clusterMap.get(key) || { name: `${(Math.floor(f.lat * 2) / 2 + 0.25).toFixed(2)}°N ${(Math.floor(f.lon * 2) / 2 + 0.25).toFixed(2)}°E (${f.state})`, frp: 0, n: 0 };
      c.frp += f.frp; c.n += 1; clusterMap.set(key, c);
    });
    return {
      n: rows.length,
      aqiMean, aqiCat: cat(aqiMean), grap: grap(aqiMean),
      peak: byAqi[0] ? { id: byAqi[0].st.id, name: byAqi[0].st.name, aqi: Math.round(byAqi[0].h.aqi.mean), cat: cat(byAqi[0].h.aqi.mean),
                         driver: driver(byAqi[0]) } : null,
      pm25Mean: Math.round(avg(rows.map((r) => r.h.pm25.mean))), pm10Mean: Math.round(avg(rows.map((r) => r.h.pm10.mean))),
      windSpeed: windSpeed.toFixed(1), windFrom, compass: ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(windFrom / 45) % 8],
      temp: avg(rows.map((r) => r.h.weather.temperature)).toFixed(1), rh: Math.round(avg(rows.map((r) => r.h.weather.relative_humidity))),
      pblh: Math.round(avg(rows.map((r) => r.h.weather.boundary_layer_height))),
      risk: inv >= 85 ? 'Entrapment' : inv >= 70 ? 'Stagnant' : 'Dispersive',
      boundary: inv >= 85 ? 'Trapped Surface Layer' : inv >= 70 ? 'Stagnant Boundary Layer' : 'Mixing Boundary Layer',
      transportKmh: Math.round(windSpeed * 3.6),
      hotspots: byAqi.slice(0, 5).map((r) => ({ id: r.st.id, name: r.st.name, zone: r.st.zone, aqi: Math.round(r.h.aqi.mean),
                                                driver: driver(r), change: signed(r.h.aqi.mean - r.h0.aqi.mean) })),
      residuals: [...rows].sort((a, b) => Math.abs(b.h48.gnn_residual_pm25) - Math.abs(a.h48.gnn_residual_pm25)).slice(0, 3)
        .map((r) => ({ id: r.st.id, name: r.st.name, cams: Math.round(r.h48.cams_baseline_pm25), gnn: Math.round(r.h48.pm25.mean),
                       delta: signed(r.h48.gnn_residual_pm25) })),
      clusters: Array.from(clusterMap.values()).sort((a, b) => b.frp - a.frp).slice(0, 3),
    };
  }, [forecasts, selectedHour, fireHotspots]);


  const addWidget = (cat: typeof AVAILABLE_WIDGET_CATALOG[0]) => {
    if (widgets.length >= MAX_WIDGETS) return;
    if (widgets.some(w => w.type === cat.type)) return;

    const newWidget: CustomWidget = {
      id: `w-${cat.type}-${Date.now()}`,
      type: cat.type,
      size: cat.defaultSize,
      label: cat.label,
    };
    updateWidgets([...widgets, newWidget]);
  };

  const removeWidget = (id: string) => {
    updateWidgets(widgets.filter(w => w.id !== id));
  };

  const setWidgetSizeLive = (id: string, newSize: WidgetSize) => {
    setWidgets(prev => prev.map(w => w.id === id ? { ...w, size: newSize } : w));
  };

  const commitWidgetSize = () => {
    setWidgets(current => {
      localStorage.setItem('aeris_home_widgets_v3', JSON.stringify(current));
      return current;
    });
  };

  const applyPreset = (preset: 'balanced' | 'meteo' | 'taskforce') => {
    if (preset === 'balanced') {
      updateWidgets(DEFAULT_HOME_WIDGETS);
    } else if (preset === 'meteo') {
      updateWidgets([
        { id: 'w-inversion', type: 'inversion-gauge', size: 'sm', label: 'Inversion Index' },
        { id: 'w-ventilation', type: 'ventilation-card', size: 'sm', label: 'Ventilation Capacity' },
        { id: 'w-meteo', type: 'meteo-surface', size: 'sm', label: 'Surface Boundary' },
        { id: 'w-firms', type: 'firms-fires', size: 'wide', label: 'NASA FIRMS Fires' },
        { id: 'w-plume', type: 'plume-trajectory', size: 'sm', label: 'Stubble Plume Wind Corridor' },
        { id: 'w-cams', type: 'cams-vs-gnn', size: 'wide', label: 'CAMS vs GNN Residual' },
      ]);
    } else if (preset === 'taskforce') {
      updateWidgets([
        { id: 'w-alert', type: 'proactive-alert', size: 'wide', label: 'Proactive Advisory' },
        { id: 'w-aqi', type: 'delhi-aqi-gauge', size: 'sm', label: 'Delhi Mean AQI' },
        { id: 'w-stations', type: 'high-risk-stations', size: 'wide', label: 'Focal CAAQMS Stations' },
        { id: 'w-map', type: 'map-overview', size: 'wide', label: 'Spatial Telemetry Grid' },
        { id: 'w-accuracy', type: 'track-record', size: 'sm', label: 'Very Poor+ Event Recall' },
        { id: 'w-freshness', type: 'system-freshness', size: 'sm', label: 'Pipeline Health' },
      ]);
    }
  };

  const renderWidgetContent = (item: CustomWidget, size: WidgetSize, isPreview: boolean = false) => {
    return (
      <div 
        data-widget-id={item.id}
        className="relative w-full h-full p-3 sm:p-3.5 flex flex-col justify-between bg-[#0a2e21] text-white rounded-2xl select-none font-sans border-2 border-emerald-600/40 hover:border-emerald-500/70 shadow-lg shadow-black/25 transition-colors duration-200"
      >
        {/* Widget Top Bar: Clean Minimalist Title + Grip + Size Indicator */}
        <div 
          className={`flex items-center justify-between gap-1.5 border-b border-[#134e38] pb-1.5 mb-1.5 ${
            !isPreview ? 'cursor-grab active:cursor-grabbing' : ''
          }`}
          title={!isPreview ? "Drag header to reorder widget" : undefined}
        >
          <div className="flex items-center gap-1.5 min-w-0">
            {!isPreview && (
              <div className="text-emerald-400 hover:text-white shrink-0">
                <GripVertical className="w-3.5 h-3.5" />
              </div>
            )}

            <span className="text-xs font-bold tracking-wide text-white uppercase truncate block">
              {item.label}
            </span>
          </div>

          <span className="text-[10px] text-emerald-400 font-mono font-bold uppercase tracking-wider shrink-0">
            {item.size === 'sm' ? '1×1' : item.size === 'wide' ? '2×1' : item.size === 'tall' ? '1×2' : '2×2'}
          </span>
        </div>

        {/* Widget Body Content (Optimized for 2x2, Wide, and Large sizes) */}
        <div className="flex-1 flex flex-col justify-between overflow-hidden">
          {/* ======================================================== */}
          {/* 1. Proactive Alert                                       */}
          {/* ======================================================== */}
          {item.type === 'proactive-alert' && activeAlert && (
            size === 'sm' ? (
              <div className="flex flex-col justify-between h-full space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-rose-400 font-mono uppercase tracking-wider">
                    {activeAlert.grap_stage}
                  </span>
                  <span className="text-[11px] font-mono text-amber-300 font-bold">{activeAlert.start_time}</span>
                </div>
                <p className="text-xs text-white font-medium line-clamp-2 leading-snug">
                  {activeAlert.subtitle}
                </p>
                <button
                  type="button"
                  data-no-drag
                  onClick={() => onOpenAlert(activeAlert)}
                  className="text-xs text-[#86efac] hover:text-white font-bold inline-flex items-center gap-1 pt-1"
                >
                  Open Advisory &rarr;
                </button>
              </div>
            ) : size === 'wide' ? (
              <div className="flex flex-col justify-between h-full space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-rose-400 font-mono uppercase tracking-wider">
                    {activeAlert.grap_stage}
                  </span>
                  <span className="text-xs font-mono font-bold text-amber-300">
                    {activeAlert.start_time}
                  </span>
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white line-clamp-1">{activeAlert.title}</h4>
                  <p className="text-xs text-[#d1fae5]/90 mt-0.5 line-clamp-2 leading-relaxed">
                    {activeAlert.subtitle}
                  </p>
                </div>
                <div className="flex items-center justify-between pt-1 border-t border-emerald-900/60 text-xs">
                  <span className="text-[#a7d0bf]">Lead Time: <strong>+{activeAlert.lead_time_hours}h</strong></span>
                  <button
                    type="button"
                    data-no-drag
                    onClick={() => onOpenAlert(activeAlert)}
                    className="text-[#86efac] hover:text-white font-bold hover:underline"
                  >
                    Causal Explanation ("The Why") &rarr;
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col justify-between h-full space-y-3">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-rose-400 font-mono uppercase tracking-wider">
                        {activeAlert.grap_stage}
                      </span>
                      <span className="text-xs text-neutral-300">Peak: <strong className="text-rose-400 font-numbers">{activeAlert.peak_aqi} AQI</strong></span>
                    </div>
                    <span className="text-xs font-mono font-bold text-amber-300">
                      {activeAlert.start_time}
                    </span>
                  </div>

                  <h4 className="text-sm sm:text-base font-bold text-white leading-snug">{activeAlert.title}</h4>
                  <p className="text-xs text-[#d1fae5]/90 mt-1 leading-relaxed line-clamp-2">{activeAlert.subtitle}</p>
                </div>

                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                  <div>
                    <span className="text-[10px] text-[#a7d0bf] block font-bold uppercase tracking-wider">PBLH Collapse</span>
                    <span className="font-mono font-bold text-emerald-300 text-sm">-{activeAlert.causal_drivers.pblh_drop}m</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-[#a7d0bf] block font-bold uppercase tracking-wider">Surface Wind</span>
                    <span className="font-mono font-bold text-emerald-300 text-sm">{activeAlert.causal_drivers.wind_speed} m/s</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-[#a7d0bf] block font-bold uppercase tracking-wider">Inversion Index</span>
                    <span className="font-mono font-bold text-amber-300 text-sm">{activeAlert.causal_drivers.inversion_index}/100</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-[#a7d0bf] block font-bold uppercase tracking-wider">Fire Influence</span>
                    <span className="font-mono font-bold text-orange-400 text-sm">{activeAlert.causal_drivers.fire_influence}%</span>
                  </div>
                </div>

                <div className="pt-2 border-t border-emerald-900/60 flex items-center justify-between">
                  <span className="text-[11px] text-[#a7d0bf] truncate max-w-[200px]">
                    Hotspots: {activeAlert.causal_drivers.accumulation_stations.slice(0, 2).join(', ')}
                  </span>
                  <button
                    type="button"
                    data-no-drag
                    onClick={() => onOpenAlert(activeAlert)}
                    className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-[#061d15] font-bold text-xs transition-colors shrink-0 shadow-sm"
                  >
                    Open "The Why" &rarr;
                  </button>
                </div>
              </div>
            )
          )}

          {/* ======================================================== */}
          {/* 2. Inversion Gauge                                       */}
          {/* ======================================================== */}
          {item.type === 'inversion-gauge' && (
            size === 'sm' ? (
              <div className="flex flex-col justify-between h-full space-y-1">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-3xl sm:text-4xl font-black font-numbers text-amber-400 tracking-tight">
                    {currentInv?.score ?? 0}
                  </span>
                  <span className="text-xs font-bold text-[#a7d0bf] font-mono">/ 100</span>
                </div>
                <div className="text-xs font-bold text-white leading-tight">
                  {invLevel.label}
                </div>
                <div className="text-[11px] text-[#a7d0bf]">
                  PBLH: <strong className="text-white font-mono">{currentInv?.pblh ?? '—'}m</strong>
                </div>
              </div>
            ) : size === 'wide' ? (
              <div className="flex flex-col justify-between h-full space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-4xl font-black font-numbers text-amber-400 tracking-tight">
                      {currentInv?.score ?? 0}
                    </span>
                    <span className="text-xs font-bold text-[#a7d0bf] font-mono">/ 100</span>
                  </div>
                  <span className="text-xs font-bold text-amber-300">
                    {invLevel.label}
                  </span>
                </div>
                <div className="w-full bg-[#0e3d2c]/60 rounded-full h-2 overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-emerald-400 via-amber-400 to-rose-500 rounded-full"
                    style={{ width: `${Math.min(100, currentInv?.score ?? 0)}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-xs text-[#a7d0bf]">
                  <span>PBLH Ceiling: <strong className="text-white">{currentInv?.pblh ?? '—'} m</strong></span>
                  <button
                    type="button"
                    data-no-drag
                    onClick={() => onNavigateTab('inversion-fire')}
                    className="text-[#86efac] hover:text-white font-bold"
                  >
                    Details &rarr;
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col justify-between h-full space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-4xl sm:text-5xl font-black font-numbers text-amber-400 tracking-tight">
                        {currentInv?.score ?? 0}
                      </span>
                      <span className="text-sm font-bold text-[#a7d0bf] font-mono">/ 100</span>
                    </div>
                    <span className="text-xs sm:text-sm font-bold text-white block mt-0.5">
                      {invLevel.label}
                    </span>
                  </div>
                  <div className="text-right text-xs">
                    <span className="text-[#a7d0bf] block text-[10px] uppercase font-bold tracking-wider">Lapse Rate Delta</span>
                    <span className="font-mono text-base font-bold text-amber-300">+3.4°C</span>
                  </div>
                </div>

                <div className="space-y-1.5 py-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-[#a7d0bf]">Entrapment Ceiling</span>
                    <span className="text-white font-mono font-bold">{currentInv?.pblh ?? '—'} meters</span>
                  </div>
                  <div className="w-full bg-[#0e3d2c]/60 rounded-full h-2 overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-emerald-400 via-amber-400 to-rose-500 rounded-full"
                      style={{ width: `${Math.min(100, currentInv?.score ?? 0)}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] text-neutral-400">
                    <span>Nominal (&lt;50)</span>
                    <span>Moderate (50-75)</span>
                    <span>Severe (&gt;75)</span>
                  </div>
                </div>

                <div className="pt-2 border-t border-emerald-900/60 flex items-center justify-between">
                  <p className="text-xs text-[#a7d0bf] line-clamp-1">
                    Thermal ceiling halts vertical particulate venting.
                  </p>
                  <button
                    type="button"
                    data-no-drag
                    onClick={() => onNavigateTab('inversion-fire')}
                    className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-[#061d15] font-bold text-xs transition-colors shrink-0"
                  >
                    Inspect Inversion &rarr;
                  </button>
                </div>
              </div>
            )
          )}

          {/* ======================================================== */}
          {/* 3. Ventilation Card                                      */}
          {/* ======================================================== */}
          {item.type === 'ventilation-card' && (
            size === 'sm' ? (
              <div className="flex flex-col justify-between h-full space-y-1">
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl sm:text-3xl font-black font-numbers text-white tracking-tight">
                    {(currentInv?.ventilation ?? 0).toLocaleString()}
                  </span>
                  <span className="text-xs text-[#a7d0bf] font-mono">m²/s</span>
                </div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md inline-block w-fit ${vent.badgeColor}`}>
                  {vent.label}
                </span>
                <p className="text-[11px] text-[#a7d0bf]">
                  PBLH: <strong className="text-white font-mono">{currentInv?.pblh ?? '—'}m</strong>
                </p>
              </div>
            ) : size === 'wide' ? (
              <div className="flex flex-col justify-between h-full space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-3xl sm:text-4xl font-black font-numbers text-white tracking-tight">
                      {(currentInv?.ventilation ?? 0).toLocaleString()}
                    </span>
                    <span className="text-xs text-[#a7d0bf] font-mono">m²/s</span>
                  </div>
                  <span className={`text-xs font-bold px-2.5 py-0.5 rounded-md inline-block w-fit ${vent.badgeColor}`}>
                    {vent.label}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div>
                    <span className="text-[10px] text-[#a7d0bf] block uppercase font-bold tracking-wider">Mixing Ceiling</span>
                    <span className="font-mono font-bold text-white text-sm">{currentInv?.pblh ?? '—'} m</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-[#a7d0bf] block uppercase font-bold tracking-wider">Threshold</span>
                    <span className="font-mono font-bold text-amber-300 text-sm">&lt; 6,000 m²/s</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col justify-between h-full space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-4xl font-black font-numbers text-white tracking-tight">
                        {(currentInv?.ventilation ?? 0).toLocaleString()}
                      </span>
                      <span className="text-sm text-[#a7d0bf] font-mono">m²/s</span>
                    </div>
                    <span className={`text-xs font-bold px-2.5 py-0.5 rounded-md inline-block mt-1 w-fit ${vent.badgeColor}`}>
                      {vent.label}
                    </span>
                  </div>
                  <div className="text-right text-xs">
                    <span className="text-[#a7d0bf] block text-[10px] uppercase font-bold tracking-wider">Critical Threshold</span>
                    <span className="font-mono text-base font-bold text-rose-400">&lt; 6,000 m²/s</span>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3 text-xs">
                  <div>
                    <span className="text-[10px] text-[#a7d0bf] block uppercase font-bold tracking-wider">Wind Factor</span>
                    <span className="font-mono font-bold text-white text-sm">{live.windSpeed} m/s</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-[#a7d0bf] block uppercase font-bold tracking-wider">PBLH Height</span>
                    <span className="font-mono font-bold text-white text-sm">{currentInv?.pblh ?? '—'} m</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-[#a7d0bf] block uppercase font-bold tracking-wider">Airflow Status</span>
                    <span className="font-mono font-bold text-amber-300 text-sm">Low Speed</span>
                  </div>
                </div>

                <div className="pt-2 border-t border-emerald-900/60 flex items-center justify-between text-xs">
                  <span className="text-[#a7d0bf]">Low horizontal dispersion halts flushing.</span>
                  <button
                    type="button"
                    data-no-drag
                    onClick={() => onNavigateTab('inversion-fire')}
                    className="text-[#86efac] hover:text-white font-bold"
                  >
                    View Meteorology &rarr;
                  </button>
                </div>
              </div>
            )
          )}

          {/* ======================================================== */}
          {/* 4. Spatial Map Overview                                  */}
          {/* ======================================================== */}
          {item.type === 'map-overview' && (
            size === 'sm' ? (
              <div className="flex flex-col justify-between h-full space-y-1">
                <div>
                  <span className="font-numbers text-2xl font-black text-white">56 / 56</span>
                  <span className="text-xs text-[#a7d0bf] block font-bold">Stations Synced</span>
                </div>
                <div className="text-xs text-white">
                  Wind: <strong className="text-[#86efac] font-mono font-bold">{live.windFrom}° {live.compass} @ {live.windSpeed}m/s</strong>
                </div>
                <button
                  type="button"
                  data-no-drag
                  onClick={() => onNavigateTab('map')}
                  className="text-xs text-[#86efac] hover:text-white font-bold inline-flex items-center gap-1"
                >
                  Open Map &rarr;
                </button>
              </div>
            ) : size === 'wide' ? (
              <div className="space-y-2.5">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div>
                    <span className="text-[#a7d0bf] block text-[10px] uppercase font-bold tracking-wider">Stations</span>
                    <span className="font-numbers font-black text-white text-sm">56 / 56</span>
                  </div>
                  <div>
                    <span className="text-[#a7d0bf] block text-[10px] uppercase font-bold tracking-wider">Fire Nodes</span>
                    <span className="font-numbers font-black text-amber-400 text-sm">5 Clusters</span>
                  </div>
                  <div>
                    <span className="text-[#a7d0bf] block text-[10px] uppercase font-bold tracking-wider">Vectors</span>
                    <span className="font-numbers font-black text-[#86efac] text-sm">315° NW</span>
                  </div>
                  <div>
                    <span className="text-[#a7d0bf] block text-[10px] uppercase font-bold tracking-wider">Horizon</span>
                    <span className="font-numbers font-black text-white text-sm">72h</span>
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs pt-1 border-t border-emerald-900/60">
                  <span className="text-[#a7d0bf]">Sensor grid & dynamic graph edges</span>
                  <button
                    type="button"
                    data-no-drag
                    onClick={() => onNavigateTab('map')}
                    className="text-[#86efac] hover:text-white font-bold"
                  >
                    Open Map &rarr;
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col justify-between h-full space-y-3">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div>
                    <span className="text-[#a7d0bf] block text-[10px] uppercase font-bold tracking-wider">Stations</span>
                    <span className="font-numbers font-black text-white text-sm">56 / 56 CPCB</span>
                  </div>
                  <div>
                    <span className="text-[#a7d0bf] block text-[10px] uppercase font-bold tracking-wider">Fire Nodes</span>
                    <span className="font-numbers font-black text-amber-400 text-sm">5 Clusters</span>
                  </div>
                  <div>
                    <span className="text-[#a7d0bf] block text-[10px] uppercase font-bold tracking-wider">Vectors</span>
                    <span className="font-numbers font-black text-[#86efac] text-sm">315° NW</span>
                  </div>
                  <div>
                    <span className="text-[#a7d0bf] block text-[10px] uppercase font-bold tracking-wider">Horizon</span>
                    <span className="font-numbers font-black text-white text-sm">0h - 72h</span>
                  </div>
                </div>

                {/* Regional Breakdown Grid without boxes */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs pt-2 border-t border-emerald-900/40">
                  <div>
                    <span className="text-[10px] text-[#a7d0bf] block uppercase font-bold tracking-wider">East Delhi</span>
                    <span className="font-numbers text-sm font-bold text-rose-400">442 AQI</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-[#a7d0bf] block uppercase font-bold tracking-wider">North Delhi</span>
                    <span className="font-numbers text-sm font-bold text-rose-400">418 AQI</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-[#a7d0bf] block uppercase font-bold tracking-wider">Central Delhi</span>
                    <span className="font-numbers text-sm font-bold text-amber-300">385 AQI</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-[#a7d0bf] block uppercase font-bold tracking-wider">South Delhi</span>
                    <span className="font-numbers text-sm font-bold text-amber-300">362 AQI</span>
                  </div>
                </div>

                <div className="pt-2 border-t border-emerald-900/60 flex items-center justify-between">
                  <p className="text-xs text-[#a7d0bf]">
                    Interactive GNN spatial convolution with wind transport vectors.
                  </p>
                  <button
                    type="button"
                    data-no-drag
                    onClick={() => onNavigateTab('map')}
                    className="px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-[#061d15] text-xs font-bold shrink-0 shadow-sm"
                  >
                    Open Spatial Map &rarr;
                  </button>
                </div>
              </div>
            )
          )}

          {/* ======================================================== */}
          {/* 5. FIRMS Stubble Fires                                   */}
          {/* ======================================================== */}
          {item.type === 'firms-fires' && (
            size === 'sm' ? (
              <div className="flex flex-col justify-between h-full space-y-1">
                <div>
                  <span className="text-2xl sm:text-3xl font-black font-numbers text-amber-400">{totalFRP}</span>
                  <span className="text-xs font-bold text-[#a7d0bf] ml-1">MW FRP</span>
                </div>
                <div className="text-xs text-white">
                  <strong>{fireHotspots.length}</strong> Satellite Detections
                </div>
                <div className="text-[11px] text-[#a7d0bf]">
                  Punjab: {fireHotspots.filter(f => f.state === 'Punjab').length} • Haryana: {fireHotspots.filter(f => f.state === 'Haryana').length}
                </div>
              </div>
            ) : size === 'wide' ? (
              <div className="flex flex-col justify-between h-full space-y-2">
                <div className="flex items-baseline justify-between">
                  <div>
                    <span className="text-3xl font-black font-numbers text-amber-400">{totalFRP}</span>
                    <span className="text-xs font-bold text-[#a7d0bf] ml-1">MW Fire Power</span>
                  </div>
                  <div className="text-right">
                    <span className="text-xl font-black font-numbers text-white">{fireHotspots.length}</span>
                    <span className="text-xs font-bold text-[#a7d0bf] ml-1">Hotspots</span>
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs py-1 border-t border-emerald-900/60 text-white">
                  <span>Punjab: <strong className="text-[#86efac]">{fireHotspots.filter(f => f.state === 'Punjab').length}</strong></span>
                  <span>Haryana: <strong className="text-[#86efac]">{fireHotspots.filter(f => f.state === 'Haryana').length}</strong></span>
                  <span>ETA: <strong className="text-amber-300">{firePlumes[0] ? `+${firePlumes[0].eta_delhi_hours}h` : 'no plume to Delhi'}</strong></span>
                </div>
              </div>
            ) : (
              <div className="flex flex-col justify-between h-full space-y-3">
                <div className="flex items-baseline justify-between">
                  <div>
                    <span className="text-4xl font-black font-numbers text-amber-400">{totalFRP}</span>
                    <span className="text-xs font-bold text-[#a7d0bf] ml-1">MW Total Radiative Power</span>
                  </div>
                  <div className="text-right">
                    <span className="text-2xl font-black font-numbers text-white">{fireHotspots.length}</span>
                    <span className="text-xs font-bold text-[#a7d0bf] ml-1">Active Clusters</span>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3 text-xs">
                  {live.clusters.length ? live.clusters.map((c) => (
                    <div key={c.name}>
                      <span className="text-[10px] text-[#a7d0bf] block uppercase font-bold tracking-wider">{c.name}</span>
                      <span className="font-mono font-bold text-amber-300 text-sm">{Math.round(c.frp)} MW · {c.n} fires</span>
                    </div>
                  )) : <span className="text-[#a7d0bf] col-span-3">No FIRMS detections in the 24 h before this forecast.</span>}
                </div>

                <div className="pt-2 border-t border-emerald-900/60 flex items-center justify-between text-xs">
                  <span className="text-[#a7d0bf]">NASA FIRMS VIIRS & MODIS Telemetry</span>
                  <button
                    type="button"
                    data-no-drag
                    onClick={() => onNavigateTab('inversion-fire')}
                    className="text-[#86efac] hover:text-white font-bold"
                  >
                    Track Plume Trajectories &rarr;
                  </button>
                </div>
              </div>
            )
          )}

          {/* ======================================================== */}
          {/* 6. Plume Trajectory                                      */}
          {/* ======================================================== */}
          {item.type === 'plume-trajectory' && (
            size === 'sm' ? (
              <div className="flex flex-col justify-between h-full space-y-1">
                <span className="text-xs font-bold text-white leading-tight">
                  {firePlumes[0]?.source_name || 'Upwind Fire Conduits'}
                </span>
                <div>
                  <span className="text-2xl font-black font-numbers text-amber-400">
                    {firePlumes[0] ? `+${firePlumes[0].eta_delhi_hours}h` : '—'}
                  </span>
                  <span className="text-xs text-[#a7d0bf] ml-1">Delhi Arrival</span>
                </div>
                <div className="text-[11px] text-[#a7d0bf]">
                  Speed: <strong className="text-white">{firePlumes[0]?.current_wind_speed_kmh ?? '—'} km/h</strong>
                </div>
              </div>
            ) : size === 'wide' ? (
              <div className="flex flex-col justify-between h-full space-y-2">
                <div className="flex items-center justify-between text-xs sm:text-sm">
                  <span className="text-white font-bold">{firePlumes[0]?.source_name || 'Punjab Corridor'}</span>
                  <span className="text-amber-400 font-numbers font-black">{firePlumes[0] ? `+${firePlumes[0].eta_delhi_hours}h` : '—'} ETA</span>
                </div>
                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div>
                    <span className="text-[10px] text-[#a7d0bf] block uppercase font-bold tracking-wider">Speed</span>
                    <span className="font-numbers font-black text-white text-sm">{firePlumes[0]?.current_wind_speed_kmh ?? '—'} km/h</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-[#a7d0bf] block uppercase font-bold tracking-wider">Bearing</span>
                    <span className="font-numbers font-black text-[#86efac] text-sm">{firePlumes[0] ? `${firePlumes[0].corridor_bearing_deg}°` : '—'}</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col justify-between h-full space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-base font-bold text-white block">{firePlumes[0]?.source_name || 'No plume reaching Delhi in this forecast'}</span>
                    <span className="text-xs text-[#a7d0bf]">Biomass plume advection corridor</span>
                  </div>
                  <span className="text-amber-400 font-numbers font-black text-lg">{firePlumes[0] ? `+${firePlumes[0].eta_delhi_hours}h` : '—'} ETA</span>
                </div>

                <div className="grid grid-cols-3 gap-3 text-xs">
                  <div>
                    <span className="text-[10px] text-[#a7d0bf] block uppercase font-bold tracking-wider">Wind Speed</span>
                    <span className="font-mono font-bold text-white text-sm">{firePlumes[0]?.current_wind_speed_kmh ?? '—'} km/h</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-[#a7d0bf] block uppercase font-bold tracking-wider">Corridor Vector</span>
                    <span className="font-mono font-bold text-[#86efac] text-sm">{firePlumes[0] ? `${firePlumes[0].corridor_bearing_deg}°` : '—'}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-[#a7d0bf] block uppercase font-bold tracking-wider">Plume Density</span>
                    <span className="font-mono font-bold text-rose-400 text-sm">Heavy</span>
                  </div>
                </div>

                <div className="pt-2 border-t border-emerald-900/60 flex items-center justify-between text-xs">
                  <span className="text-[#a7d0bf]">Receptor zone: Anand Vihar / North-East Delhi basin</span>
                  <button
                    type="button"
                    data-no-drag
                    onClick={() => onNavigateTab('inversion-fire')}
                    className="text-[#86efac] hover:text-white font-bold"
                  >
                    View Plume Map &rarr;
                  </button>
                </div>
              </div>
            )
          )}

          {/* ======================================================== */}
          {/* 7. CAMS vs GNN Residual                                  */}
          {/* ======================================================== */}
          {item.type === 'cams-vs-gnn' && (
            size === 'sm' ? (
              <div className="flex flex-col justify-between h-full space-y-1">
                <span className="text-xs font-bold text-white">{live.residuals[0]?.name ?? '—'} (+48h)</span>
                <div>
                  <span className="text-2xl font-black font-numbers text-[#86efac]">{live.residuals[0]?.delta ?? '—'} µg/m³</span>
                  <span className="text-xs text-[#a7d0bf] block">GNN Residual Delta</span>
                </div>
                <div className="text-[11px] text-[#a7d0bf]">
                  CAMS {live.residuals[0]?.cams ?? '—'} &rarr; <strong className="text-white">GNN {live.residuals[0]?.gnn ?? '—'}</strong>
                </div>
              </div>
            ) : size === 'wide' ? (
              <div className="flex flex-col justify-between h-full space-y-2">
                <div className="flex items-baseline justify-between text-xs sm:text-sm">
                  <span className="text-white font-bold">{live.residuals[0]?.name ?? '—'} (+48h)</span>
                  <span className="text-[#86efac] font-numbers font-black text-sm">{live.residuals[0]?.delta ?? '—'} µg/m³ Residual</span>
                </div>
                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div>
                    <span className="text-rose-300 block text-[10px] font-bold uppercase tracking-wider">CAMS Baseline</span>
                    <span className="text-base font-numbers font-black text-rose-400">{live.residuals[0]?.cams ?? '—'}</span>
                    <span className="text-[10px] text-rose-300 block">µg/m³ PM2.5</span>
                  </div>
                  <div>
                    <span className="text-[#a7d0bf] block text-[10px] font-bold uppercase tracking-wider">GNN Forecast</span>
                    <span className="text-base font-numbers font-black text-[#86efac]">{live.residuals[0]?.gnn ?? '—'}</span>
                    <span className="text-[10px] text-[#86efac] block font-bold">µg/m³ PM2.5</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col justify-between h-full space-y-3">
                <div className="flex items-baseline justify-between">
                  <div>
                    <span className="text-base font-bold text-white block">GNN Physics-Residual Calibration</span>
                    <span className="text-xs text-[#a7d0bf]">Largest +48 h corrections of the CAMS PM2.5 baseline</span>
                  </div>
                  <span className="text-[#86efac] font-numbers font-black text-lg">{live.residuals[0]?.delta ?? '—'} µg/m³</span>
                </div>

                <div className="grid grid-cols-3 gap-3 text-xs">
                  {live.residuals.map((r) => (
                    <div key={r.id}>
                      <span className="text-[10px] text-[#a7d0bf] block uppercase font-bold tracking-wider">{r.name}</span>
                      <span className="font-mono font-bold text-rose-400 text-xs">{r.cams}</span>
                      <span className="font-mono font-bold text-[#86efac] text-xs ml-1.5">&rarr; {r.gnn}</span>
                    </div>
                  ))}
                </div>

                <div className="pt-2 border-t border-emerald-900/60 flex items-center justify-between text-xs">
                  <span className="text-[#a7d0bf]">CAMS → AERIS PM2.5 (µg/m³) at +48 h.</span>
                  <button
                    type="button"
                    data-no-drag
                    onClick={() => onNavigateTab('comparison')}
                    className="text-[#86efac] hover:text-white font-bold"
                  >
                    Compare Curves &rarr;
                  </button>
                </div>
              </div>
            )
          )}

          {/* ======================================================== */}
          {/* 8. Track Record Accuracy                                 */}
          {/* ======================================================== */}
          {item.type === 'track-record' && (
            size === 'sm' ? (
              <div className="flex flex-col justify-between h-full space-y-1">
                <div>
                  <span className="text-3xl font-black font-numbers text-[#86efac]">
                    {stat48?.extreme_event_recall ?? '—'}%
                  </span>
                  <span className="text-xs font-bold text-white block">Very Poor+ Event Recall</span>
                </div>
                <div className="text-[11px] text-[#a7d0bf]">
                  MAE: <strong className="text-white font-mono">{stat48?.gnn_mae ?? '—'} µg/m³</strong>
                </div>
              </div>
            ) : size === 'wide' ? (
              <div className="flex flex-col justify-between h-full space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-3xl sm:text-4xl font-black font-numbers text-[#86efac]">
                      {stat48?.extreme_event_recall ?? '—'}%
                    </span>
                    <span className="text-xs font-bold text-white block">Very Poor+ Event Recall (+48h)</span>
                  </div>
                  <div className="text-right text-xs">
                    <span className="text-[#a7d0bf] block">GNN MAE</span>
                    <span className="font-numbers font-black text-white text-base">±{stat48?.gnn_mae ?? '—'}</span>
                  </div>
                </div>
                <div className="text-xs text-[#a7d0bf] pt-1 border-t border-emerald-900/60 flex justify-between">
                  <span>CAMS Baseline MAE: <strong>{stat48?.cams_mae ?? '—'}</strong></span>
                  <button
                    type="button"
                    data-no-drag
                    onClick={() => onNavigateTab('track-record')}
                    className="text-[#86efac] hover:text-white font-bold"
                  >
                    Audit Log &rarr;
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col justify-between h-full space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-4xl font-black font-numbers text-[#86efac]">
                      {stat48?.extreme_event_recall ?? '—'}%
                    </span>
                    <span className="text-sm font-bold text-white block">Empirical Very Poor+ Event Recall (+48h)</span>
                  </div>
                  <span className="px-2.5 py-1 rounded-lg bg-emerald-950 text-emerald-300 border border-emerald-700 text-xs font-bold font-mono">
                    CPCB Verified
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-3 text-xs">
                  <div>
                    <span className="text-[10px] text-[#a7d0bf] block uppercase font-bold tracking-wider">PM2.5 MAE</span>
                    <span className="font-mono font-bold text-[#86efac] text-sm">±{stat48?.gnn_mae ?? '—'} µg/m³</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-[#a7d0bf] block uppercase font-bold tracking-wider">AQI Band Acc.</span>
                    <span className="font-mono font-bold text-white text-sm">{stat48?.category_accuracy ?? '—'}%</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-[#a7d0bf] block uppercase font-bold tracking-wider">R² (+48h)</span>
                    <span className="font-mono font-bold text-white text-sm">{stat48?.gnn_r2 ?? '—'}</span>
                  </div>
                </div>

                <div className="pt-2 border-t border-emerald-900/60 flex items-center justify-between text-xs">
                  <span className="text-[#a7d0bf]">Held-out test: Oct–Dec 2025 forecasts, CPCB station measurements.</span>
                  <button
                    type="button"
                    data-no-drag
                    onClick={() => onNavigateTab('track-record')}
                    className="text-[#86efac] hover:text-white font-bold"
                  >
                    View Historical Verification &rarr;
                  </button>
                </div>
              </div>
            )
          )}

          {/* ======================================================== */}
          {/* 9. High-Risk Hotspot Stations                            */}
          {/* ======================================================== */}
          {item.type === 'high-risk-stations' && (
            size === 'sm' ? (
              <div className="flex flex-col justify-between h-full space-y-1">
                <div>
                  <span className="text-xs text-[#a7d0bf] block uppercase font-bold">Top Hotspot</span>
                  <span className="text-base font-bold text-white block">{live.peak?.name ?? '—'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-numbers text-2xl font-black text-rose-400">{live.peak?.aqi ?? '—'}</span>
                  <span className="text-xs text-rose-300 font-bold">{live.peak?.cat ?? ''} Band</span>
                </div>
                <div className="text-[11px] text-[#a7d0bf]">
                  Driver: {live.peak?.driver ?? '—'}
                </div>
              </div>
            ) : size === 'wide' ? (
              <div className="divide-y divide-emerald-800/30">
                {live.hotspots.slice(0, 3).map((st, i) => (
                  <div 
                    key={i} 
                    data-no-drag
                    onClick={() => onSelectStation((st as any)?.id ?? live.peak?.id ?? '')}
                    className="flex items-center justify-between py-1.5 px-1 hover:bg-[#0e3d2c]/40 cursor-pointer transition-colors rounded-lg"
                  >
                    <span className="text-xs font-bold text-white">{st.name}</span>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="font-numbers font-black text-rose-400 text-sm">{st.aqi} AQI</span>
                      <span className="font-numbers font-bold text-amber-400 text-xs">({st.change})</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col justify-between h-full space-y-2">
                <div className="divide-y divide-emerald-800/30">
                  {live.hotspots.slice(0, 4).map((st, i) => (
                    <div 
                      key={i} 
                      data-no-drag
                      onClick={() => onSelectStation((st as any)?.id ?? live.peak?.id ?? '')}
                      className="flex items-center justify-between py-1.5 px-1 hover:bg-[#0e3d2c]/40 cursor-pointer transition-colors rounded-lg"
                    >
                      <div>
                        <span className="text-xs font-bold text-white block">{st.name}</span>
                        <span className="text-[10px] text-[#a7d0bf]">{st.zone} • {st.driver}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <span className="font-numbers font-black text-rose-400 text-base">{st.aqi} AQI</span>
                        <span className="font-numbers font-bold text-amber-400 text-xs">({st.change})</span>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-[11px] text-[#a7d0bf] text-right pt-1 border-t border-emerald-900/60">
                  Click any hotspot to open station sensor telemetry drawer
                </p>
              </div>
            )
          )}

          {/* ======================================================== */}
          {/* 10. System Freshness                                     */}
          {/* ======================================================== */}
          {item.type === 'system-freshness' && (
            size === 'sm' ? (
              <div className="flex flex-col justify-between h-full space-y-1">
                <div>
                  <span className="text-xl font-black font-numbers text-[#86efac]">
                    {dataSources.filter((d) => d.status === 'operational').length} / {dataSources.length}
                  </span>
                  <span className="text-xs text-white block font-bold">Sources Operational</span>
                </div>
                <div className="text-[11px] text-[#a7d0bf] truncate">
                  {dataSources[0]?.last_updated ?? '—'}
                </div>
              </div>
            ) : (
              <div className="flex flex-col justify-between h-full space-y-2">
                <div className="divide-y divide-emerald-800/30 text-xs">
                  {(size === 'wide' ? dataSources.slice(0, 3) : dataSources).map((d) => (
                    <div key={d.id} className="flex justify-between items-center py-1.5 gap-2">
                      <span className="text-[#a7d0bf] font-medium truncate">{d.name}</span>
                      <span className={`font-mono font-bold text-right ${d.status === 'operational' ? 'text-[#86efac]' : 'text-amber-300'}`}>{d.records_processed}</span>
                    </div>
                  ))}
                </div>
                {size !== 'wide' && (
                  <p className="text-xs text-[#a7d0bf] pt-1 border-t border-emerald-900/60">
                    {dataSources[0]?.last_updated ?? ''}
                  </p>
                )}
              </div>
            )
          )}
          {/* ======================================================== */}
          {/* 11. Delhi Mean AQI Gauge                                 */}
          {/* ======================================================== */}
          {item.type === 'delhi-aqi-gauge' && (
            size === 'sm' ? (
              <div className="flex flex-col justify-between h-full space-y-1">
                <div>
                  <span className="text-3xl font-black font-numbers text-rose-400 leading-none">
                    {live.aqiMean}
                  </span>
                  <span className="text-xs text-[#a7d0bf] ml-1 font-bold">AQI Mean</span>
                </div>
                <div className="text-xs font-bold text-amber-300">
                  {live.aqiCat} • {live.grap}
                </div>
                <div className="text-[11px] text-[#a7d0bf]">
                  Peak: <strong className="text-rose-400">{live.peak?.aqi ?? '—'}</strong> ({live.peak?.name ?? '—'})
                </div>
              </div>
            ) : size === 'wide' ? (
              <div className="flex flex-col justify-between h-full space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl sm:text-4xl font-black font-numbers text-rose-400">{live.aqiMean}</span>
                    <span className="text-xs text-[#a7d0bf] font-bold">Basin Average AQI</span>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-rose-950/80 text-rose-300 border border-rose-700/50">
                    {live.grap.replace('GRAP Stage ', 'GRAP ')}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <span className="text-[10px] text-[#a7d0bf] block uppercase font-bold">PM2.5</span>
                    <span className="font-numbers font-black text-rose-300 text-sm">{live.pm25Mean} µg/m³</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-[#a7d0bf] block uppercase font-bold">PM10</span>
                    <span className="font-numbers font-black text-amber-300 text-sm">{live.pm10Mean} µg/m³</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-[#a7d0bf] block uppercase font-bold">Hotspot</span>
                    <span className="font-numbers font-black text-white text-sm">{live.peak?.name ?? '—'}</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col justify-between h-full space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-4xl font-black font-numbers text-rose-400">{live.aqiMean}</span>
                      <span className="text-xs text-[#a7d0bf] font-bold">Delhi-NCR Composite AQI</span>
                    </div>
                    <span className="text-xs font-bold text-amber-300">{live.aqiCat} Air Quality Category</span>
                  </div>
                  <span className="px-2.5 py-1 rounded-lg bg-rose-950 text-rose-300 border border-rose-700 text-xs font-bold font-mono">
                    {live.grap}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-3 text-xs">
                  <div>
                    <span className="text-[10px] text-[#a7d0bf] block uppercase font-bold tracking-wider">PM2.5 Mean</span>
                    <span className="font-mono font-bold text-rose-400 text-sm">{live.pm25Mean} µg/m³</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-[#a7d0bf] block uppercase font-bold tracking-wider">PM10 Mean</span>
                    <span className="font-mono font-bold text-amber-300 text-sm">{live.pm10Mean} µg/m³</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-[#a7d0bf] block uppercase font-bold tracking-wider">Max Station</span>
                    <span className="font-mono font-bold text-rose-500 text-sm">{live.peak?.aqi ?? '—'} ({live.peak?.cat ?? '—'})</span>
                  </div>
                </div>
                <div className="pt-2 border-t border-emerald-900/60 flex items-center justify-between text-xs">
                  <span className="text-[#a7d0bf]">{live.n} stations · CPCB AQI (24 h / 8 h averages)</span>
                  <button
                    type="button"
                    data-no-drag
                    onClick={() => onNavigateTab('map')}
                    className="text-[#86efac] hover:text-white font-bold"
                  >
                    View Station Readings &rarr;
                  </button>
                </div>
              </div>
            )
          )}

          {/* ======================================================== */}
          {/* 12. Surface Meteorology                                  */}
          {/* ======================================================== */}
          {item.type === 'meteo-surface' && (
            size === 'sm' ? (
              <div className="flex flex-col justify-between h-full space-y-1">
                <div>
                  <span className="text-2xl sm:text-3xl font-black font-numbers text-white leading-none">
                    {live.windSpeed}
                  </span>
                  <span className="text-xs text-[#a7d0bf] ml-1 font-mono">m/s</span>
                  <span className="text-xs text-[#86efac] ml-2 font-bold font-mono">{live.windFrom}° {live.compass}</span>
                </div>
                <div className="text-xs font-bold text-amber-300">
                  {live.boundary}
                </div>
                <div className="text-[11px] text-[#a7d0bf]">
                  Temp: <strong className="text-white font-mono">{live.temp}°C</strong> • RH: <strong className="text-white font-mono">{live.rh}%</strong>
                </div>
              </div>
            ) : size === 'wide' ? (
              <div className="flex flex-col justify-between h-full space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-black font-numbers text-white">{live.windSpeed} m/s</span>
                    <span className="text-xs text-[#86efac] font-mono font-bold">{live.windFrom}° {live.compass} Vector</span>
                  </div>
                  <span className="text-xs font-bold text-amber-300">{live.risk}</span>
                </div>
                <div className="grid grid-cols-4 gap-2 text-xs">
                  <div>
                    <span className="text-[10px] text-[#a7d0bf] block uppercase font-bold">PBLH</span>
                    <span className="font-numbers font-black text-white text-sm">{live.pblh} m</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-[#a7d0bf] block uppercase font-bold">Temp</span>
                    <span className="font-numbers font-black text-white text-sm">{live.temp}°C</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-[#a7d0bf] block uppercase font-bold">Humidity</span>
                    <span className="font-numbers font-black text-white text-sm">{live.rh}%</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-[#a7d0bf] block uppercase font-bold">Risk</span>
                    <span className="font-numbers font-black text-amber-400 text-sm">{live.risk}</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col justify-between h-full space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-base font-bold text-white block">Surface Micrometeorology</span>
                    <span className="text-xs text-[#a7d0bf]">Local boundary layer dynamics & dispersion vectors</span>
                  </div>
                  <span className="px-2.5 py-1 rounded-lg bg-[#061d15] text-[#86efac] border border-emerald-700 text-xs font-mono font-bold">
                    {live.windFrom}° {live.compass} Vector
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-3 text-xs">
                  <div>
                    <span className="text-[10px] text-[#a7d0bf] block uppercase font-bold tracking-wider">Surface Wind</span>
                    <span className="font-mono font-bold text-white text-sm">{live.windSpeed} m/s</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-[#a7d0bf] block uppercase font-bold tracking-wider">Boundary Height</span>
                    <span className="font-mono font-bold text-white text-sm">{live.pblh} m</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-[#a7d0bf] block uppercase font-bold tracking-wider">Temperature</span>
                    <span className="font-mono font-bold text-white text-sm">{live.temp}°C</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-[#a7d0bf] block uppercase font-bold tracking-wider">Relative Humidity</span>
                    <span className="font-mono font-bold text-amber-300 text-sm">{live.rh}%</span>
                  </div>
                </div>
                <div className="pt-2 border-t border-emerald-900/60 flex items-center justify-between text-xs">
                  <span className="text-[#a7d0bf]">Network-mean surface wind ≈ {live.transportKmh} km/h.</span>
                  <button
                    type="button"
                    data-no-drag
                    onClick={() => onNavigateTab('inversion-fire')}
                    className="text-[#86efac] hover:text-white font-bold"
                  >
                    View Wind Rose &rarr;
                  </button>
                </div>
              </div>
            )
          )}
        </div>

        {/* Corner Resize Handle */}
        {!isPreview && (
          <ResizeCornerHandle
            currentSize={item.size}
            onLiveResize={(newSize) => setWidgetSizeLive(item.id, newSize)}
            onCommit={commitWidgetSize}
          />
        )}
      </div>
    );
  };

  return (
    <div className="space-y-5 font-sans">
      {/* Top Toolbar: Clean, Unboxed Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-3 border-b border-emerald-800/40">
        <div>
          <h2 className="font-heading font-archivo text-2xl sm:text-3xl text-white">Central Telemetry Overview</h2>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs text-[#a7d0bf]">
            <span className="font-bold text-[11px] text-[#a7d0bf]/80 uppercase tracking-wider mr-1">Presets:</span>

            {/* Balanced Preset: Icon expands on hover to reveal name */}
            <button
              type="button"
              onClick={() => applyPreset('balanced')}
              title="Balanced Preset"
              className="group flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-[#0a2e21] hover:bg-[#124735] border border-emerald-700/50 hover:border-emerald-500 text-emerald-200 hover:text-white transition-all duration-300 cursor-pointer overflow-hidden shadow-sm"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 shrink-0 text-emerald-400 group-hover:text-emerald-300 transition-colors" />
              <span className="max-w-0 opacity-0 group-hover:max-w-xs group-hover:opacity-100 transition-all duration-300 ease-out whitespace-nowrap text-xs font-bold font-sans overflow-hidden">
                Balanced
              </span>
            </button>

            {/* Meteo Preset: Icon expands on hover to reveal name */}
            <button
              type="button"
              onClick={() => applyPreset('meteo')}
              title="Meteorology Preset"
              className="group flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-[#0a2e21] hover:bg-[#124735] border border-emerald-700/50 hover:border-emerald-500 text-emerald-200 hover:text-white transition-all duration-300 cursor-pointer overflow-hidden shadow-sm"
            >
              <Wind className="w-3.5 h-3.5 shrink-0 text-sky-400 group-hover:text-sky-300 transition-colors" />
              <span className="max-w-0 opacity-0 group-hover:max-w-xs group-hover:opacity-100 transition-all duration-300 ease-out whitespace-nowrap text-xs font-bold font-sans overflow-hidden">
                Meteo
              </span>
            </button>

            {/* Action Preset: Icon expands on hover to reveal name */}
            <button
              type="button"
              onClick={() => applyPreset('taskforce')}
              title="Action Preset"
              className="group flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-[#0a2e21] hover:bg-[#124735] border border-emerald-700/50 hover:border-emerald-500 text-emerald-200 hover:text-white transition-all duration-300 cursor-pointer overflow-hidden shadow-sm"
            >
              <Zap className="w-3.5 h-3.5 shrink-0 text-amber-400 group-hover:text-amber-300 transition-colors" />
              <span className="max-w-0 opacity-0 group-hover:max-w-xs group-hover:opacity-100 transition-all duration-300 ease-out whitespace-nowrap text-xs font-bold font-sans overflow-hidden">
                Action
              </span>
            </button>
          </div>

          {/* Widget Market Pencil Icon Button */}
          <button
            type="button"
            onClick={() => setIsOrganizerOpen(true)}
            title="Widget Market"
            className="p-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white transition-all cursor-pointer shadow-sm hover:scale-105 active:scale-95 flex items-center justify-center border border-emerald-400/40"
          >
            <Pencil className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Widget Catalog Modal / Drawer: Visual Live Widget Gallery */}
      {isOrganizerOpen && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-md z-50 flex items-center justify-center p-3 sm:p-5">
          <div className="bg-[#072118] border-2 border-emerald-600/50 rounded-3xl w-full max-w-6xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 font-sans text-white">
            {/* Catalog Header with Tabs & Capacity Gauge */}
            <div className="p-4 sm:p-5 border-b border-[#134e38] bg-[#051a13] flex flex-col gap-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="font-heading font-archivo text-xl sm:text-2xl text-white">
                    Widget Market
                  </h3>
                </div>

                <div className="flex items-center gap-3 shrink-0 self-end sm:self-center">
                  {/* Board Capacity Pill */}
                  <div className="flex items-center gap-2.5 bg-[#061d15] px-3.5 py-1.5 rounded-xl border border-emerald-600/50 text-xs">
                    <span className="text-[#a7d0bf] font-bold">Active:</span>
                    <span className="font-numbers font-black text-emerald-400">
                      {widgets.length} / {MAX_WIDGETS}
                    </span>
                    <div className="w-12 h-2 bg-emerald-950 rounded-full overflow-hidden flex border border-emerald-800">
                      <div 
                        className="h-full bg-emerald-400 transition-all duration-300"
                        style={{ width: `${Math.min(100, (widgets.length / MAX_WIDGETS) * 100)}%` }}
                      />
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsOrganizerOpen(false)}
                    className="px-4 py-2 rounded-xl bg-[#0e3d2c] hover:bg-[#124735] text-white font-bold text-xs transition-colors cursor-pointer"
                  >
                    Close
                  </button>
                </div>
              </div>

              {/* Category Filter Chips */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs scrollbar-none">
                {[
                  { id: 'all', label: `All Widgets (${AVAILABLE_WIDGET_CATALOG.length})` },
                  { id: 'Alerts', label: 'Alerts & Risk' },
                  { id: 'Inversion & Fire', label: 'Inversion & Fire' },
                  { id: 'Spatial Map', label: 'Spatial Map' },
                  { id: 'Model Comparison', label: 'Model AI' },
                  { id: 'Track Record', label: 'Audit Record' },
                  { id: 'System Status', label: 'Pipeline Health' },
                ].map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setCatalogFilter(f.id)}
                    className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition-colors cursor-pointer ${
                      catalogFilter === f.id
                        ? 'bg-emerald-600 text-white shadow-sm ring-1 ring-emerald-400/50'
                        : 'bg-[#0a2e21] text-[#a7d0bf] hover:text-white hover:bg-[#0e3d2c]'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Capacity Alert if full */}
            {widgets.length >= MAX_WIDGETS && (
              <div className="bg-amber-950/80 border-b border-amber-700/60 px-5 py-2.5 text-xs text-amber-200 font-bold flex items-center justify-between gap-2">
                <span>Maximum capacity reached ({MAX_WIDGETS} / {MAX_WIDGETS} widgets). Remove any active widget to make room for another.</span>
                <span className="font-mono text-amber-300 shrink-0">BOARD FULL</span>
              </div>
            )}

            {/* Scrollable Live Widget Gallery Grid */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-[#04160f] space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5 auto-flow-dense">
                {AVAILABLE_WIDGET_CATALOG
                  .filter(cat => catalogFilter === 'all' || cat.tab === catalogFilter)
                  .map((cat) => {
                    const activeInstance = widgets.find(w => w.type === cat.type);
                    const isAdded = Boolean(activeInstance);
                    const isFull = widgets.length >= MAX_WIDGETS;
                    const isWide = cat.defaultSize === 'wide';

                    const previewWidget: CustomWidget = activeInstance || {
                      id: `catalog-preview-${cat.type}`,
                      type: cat.type,
                      size: cat.defaultSize,
                      label: cat.label,
                    };

                    return (
                      <div
                        key={cat.type}
                        onClick={() => {
                          if (isAdded) {
                            removeWidget(activeInstance!.id);
                          } else if (!isFull) {
                            addWidget(cat);
                          }
                        }}
                        className={`group flex flex-col justify-between rounded-2xl p-3 sm:p-3.5 border transition-all duration-200 cursor-pointer select-none relative ${
                          isWide ? 'sm:col-span-2' : 'col-span-1'
                        } ${
                          isAdded
                            ? 'bg-[#093526]/85 border-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.18)] ring-1 ring-emerald-400/50'
                            : 'bg-[#07241a]/55 border-emerald-800/40 hover:border-emerald-600/70 hover:bg-[#093526]/40 shadow-md'
                        }`}
                      >
                        {/* Card Header Metadata */}
                        <div className="flex items-center justify-between text-xs mb-2 gap-2">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="text-[10px] text-emerald-400 font-mono font-bold uppercase tracking-wider truncate">
                              • {cat.tab}
                            </span>
                            <span className="text-[10px] text-[#a7d0bf] font-mono px-1.5 py-0.5 rounded bg-[#061d15] border border-emerald-800/60 shrink-0">
                              {isWide ? '2×1 Wide' : '1×1 Standard'}
                            </span>
                          </div>

                          {isAdded ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-300 bg-emerald-950 px-2.5 py-0.5 rounded-full border border-emerald-500/60 shrink-0">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                              Active on Board
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold text-neutral-400 bg-neutral-900/60 px-2 py-0.5 rounded-full border border-neutral-700/50 shrink-0">
                              + Available
                            </span>
                          )}
                        </div>

                        {/* Live Widget Form Preview */}
                        <div className="w-full h-[145px] pointer-events-none rounded-xl overflow-hidden shadow-inner my-1">
                          {renderWidgetContent(previewWidget, cat.defaultSize, true)}
                        </div>

                        {/* Card Footer: Summary & Action Button */}
                        <div className="mt-2.5 pt-2 border-t border-emerald-900/50 flex items-center justify-between gap-3">
                          <p className="text-xs text-[#a7d0bf] line-clamp-1 flex-1 leading-snug">
                            {cat.description}
                          </p>

                          <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
                            {isAdded ? (
                              <button
                                type="button"
                                onClick={() => removeWidget(activeInstance!.id)}
                                className="px-3.5 py-1.5 rounded-xl bg-rose-950/90 hover:bg-rose-900 border border-rose-700 text-rose-200 text-xs font-bold transition-all shadow-sm cursor-pointer flex items-center gap-1"
                              >
                                <span>Remove</span>
                              </button>
                            ) : (
                              <button
                                type="button"
                                disabled={isFull}
                                onClick={() => addWidget(cat)}
                                className={`px-4 py-1.5 rounded-xl text-xs font-black transition-all shadow-sm cursor-pointer flex items-center gap-1 ${
                                  isFull
                                    ? 'bg-neutral-800 text-neutral-500 border border-neutral-700 cursor-not-allowed'
                                    : 'bg-emerald-500 hover:bg-emerald-400 text-[#061d15] hover:scale-105 active:scale-95'
                                }`}
                              >
                                <span>{isFull ? 'Limit Reached' : '+ Add Widget'}</span>
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-[#134e38] bg-[#051a13] flex items-center justify-end">
              <button
                type="button"
                onClick={() => setIsOrganizerOpen(false)}
                className="px-6 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-[#061d15] font-black text-xs shadow-md cursor-pointer shrink-0"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* The Draggable Widget Grid */}
      <div className="min-h-[440px]">
        <DraggableWidgetGrid
          items={widgets}
          onChange={(newItems) => updateWidgets(newItems as CustomWidget[])}
          renderItem={(item, size) => renderWidgetContent(item as CustomWidget, size)}
          editable={true}
          maxColumns={4}
          cellSize={190}
          rowHeight={140}
          gap={12}
          radius={16}
        />
      </div>

      {/* Add Widget Slot Button (Clean, Non-Boxy) */}
      {widgets.length < MAX_WIDGETS && (
        <div className="pt-2 flex justify-center">
          <button
            type="button"
            onClick={() => setIsOrganizerOpen(true)}
            className="px-5 py-2.5 rounded-xl border border-emerald-600/40 hover:border-emerald-400 text-emerald-300 hover:text-white bg-[#0a2e21]/40 hover:bg-[#0a2e21] transition-all text-xs font-bold flex items-center gap-2 cursor-pointer shadow-sm"
          >
            <span>+ Add Widget ({MAX_WIDGETS - widgets.length} slots remaining)</span>
          </button>
        </div>
      )}
    </div>
  );
};

export default HomeWidgetDashboard;
