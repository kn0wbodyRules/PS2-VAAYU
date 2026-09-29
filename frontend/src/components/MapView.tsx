import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { 
  Station, 
  StationForecast, 
  DynamicGraphEdge, 
  FIRMSFireHotspot, 
  FirePlumeTrajectory 
} from '../types';
import { getAQIColor, getAQICategory, getAQIBadgeClass } from '../utils/aqi';
import { formatConfidenceRange, formatHourLeadTime, degreesToCompass } from '../utils/formatters';

interface MapViewProps {
  forecasts: Map<string, StationForecast>;
  selectedHour: number;
  selectedStationId: string | null;
  onSelectStation: (stationId: string) => void;
  edges: DynamicGraphEdge[];
  fireHotspots: FIRMSFireHotspot[];
  firePlumes: FirePlumeTrajectory[];
}

export const MapView: React.FC<MapViewProps> = ({
  forecasts,
  selectedHour,
  selectedStationId,
  onSelectStation,
  edges,
  fireHotspots,
  firePlumes,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const stationsLayerRef = useRef<L.LayerGroup | null>(null);
  const edgesLayerRef = useRef<L.LayerGroup | null>(null);
  const firesLayerRef = useRef<L.LayerGroup | null>(null);
  const plumesLayerRef = useRef<L.LayerGroup | null>(null);

  // Layer visibility toggles
  const [showEdges, setShowEdges] = useState(true);
  const [showFires, setShowFires] = useState(true);
  const [showPlumes, setShowPlumes] = useState(true);

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    // Centered around Delhi-NCR
    const map = L.map(mapContainerRef.current, {
      center: [28.6139, 77.2090],
      zoom: 10,
      zoomControl: true,
      minZoom: 6,
      maxZoom: 16,
    });

    // Dark Tile Layer (Stadia Maps — Alidade Smooth Dark)
    L.tileLayer('https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png?api_key=cb1_2t44_1_e6a513ca214da31c552345b1', {
      attribution: '&copy; <a href="https://stadiamaps.com/">Stadia Maps</a> &copy; <a href="https://openmaptiles.org/">OpenMapTiles</a> &copy; OpenStreetMap',
      maxZoom: 20,
    }).addTo(map);

    // Layer groups
    const edgesLayer = L.layerGroup().addTo(map);
    const plumesLayer = L.layerGroup().addTo(map);
    const firesLayer = L.layerGroup().addTo(map);
    const stationsLayer = L.layerGroup().addTo(map);

    edgesLayerRef.current = edgesLayer;
    plumesLayerRef.current = plumesLayer;
    firesLayerRef.current = firesLayer;
    stationsLayerRef.current = stationsLayer;
    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Update Stations Layer when forecast or selectedHour changes
  useEffect(() => {
    if (!stationsLayerRef.current || !mapInstanceRef.current) return;
    const layer = stationsLayerRef.current;
    layer.clearLayers();

    forecasts.forEach((forecast) => {
      const { station, hours } = forecast;
      const hourData = hours[selectedHour] || hours[0];
      const aqiValue = hourData.aqi.mean;
      const color = getAQIColor(aqiValue);
      const category = hourData.category;
      const isSelected = selectedStationId === station.id;

      // Custom marker icon using DivIcon
      const radius = station.isBoundaryNode ? 14 : isSelected ? 16 : 12;
      const isSevere = aqiValue >= 400;

      const markerHtml = station.isBoundaryNode
        ? `
          <div class="relative flex items-center justify-center cursor-pointer transition-transform hover:scale-125">
            <div class="w-7 h-7 rounded-full bg-rose-950 border-2 border-amber-500 flex items-center justify-center shadow-lg shadow-amber-500/40">
              <span class="text-xs">🔥</span>
            </div>
            <div class="absolute -bottom-5 whitespace-nowrap bg-black/80 px-1.5 py-0.5 rounded text-[10px] text-amber-300 font-mono">
              ${station.name.split(' ')[0]}
            </div>
          </div>
        `
        : `
          <div class="relative flex items-center justify-center cursor-pointer transition-transform ${isSelected ? 'scale-125 z-30' : 'hover:scale-120'}">
            ${isSevere ? '<div class="absolute -inset-2 rounded-full animate-radar-pulse"></div>' : ''}
            <div class="rounded-full flex items-center justify-center font-mono font-bold text-[10px] text-white shadow-lg transition-all"
                 style="width: ${radius * 2}px; height: ${radius * 2}px; background-color: ${color}; border: ${isSelected ? '3px solid #38bdf8' : '2px solid rgba(255,255,255,0.85)'};">
              ${Math.round(aqiValue)}
            </div>
          </div>
        `;

      const customIcon = L.divIcon({
        html: markerHtml,
        className: 'custom-station-pin',
        iconSize: [radius * 2, radius * 2],
        iconAnchor: [radius, radius],
      });

      const marker = L.marker([station.lat, station.lon], { icon: customIcon });

      // Click to select
      marker.on('click', () => {
        onSelectStation(station.id);
      });

      // Tooltip popup
      const popupContent = `
        <div class="p-3 bg-surface text-slate-100 rounded-lg min-w-[210px]">
          <div class="flex items-center justify-between border-b border-border pb-1.5 mb-2">
            <h4 class="font-bold text-sm text-white">${station.name}</h4>
            <span class="text-[10px] px-1.5 py-0.5 rounded ${station.isBoundaryNode ? 'bg-amber-950 text-amber-300' : 'bg-slate-800 text-slate-300'} font-mono">
              ${station.zone}
            </span>
          </div>
          <div class="space-y-1.5 text-xs">
            <div class="flex items-center justify-between">
              <span class="text-slate-400">AQI (${formatHourLeadTime(selectedHour)}):</span>
              <span class="font-mono font-bold text-sm" style="color: ${color};">
                ${Math.round(aqiValue)}
              </span>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-slate-400">Confidence:</span>
              <span class="font-mono text-slate-300">${formatConfidenceRange(hourData.aqi)}</span>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-slate-400">PM2.5:</span>
              <span class="font-mono text-slate-200">${Math.round(hourData.pm25.mean)} µg/m³</span>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-slate-400">Ventilation (Vc):</span>
              <span class="font-mono text-slate-300">${hourData.physics.ventilation_coefficient} m²/s</span>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-slate-400">Wind:</span>
              <span class="font-mono text-slate-300">${hourData.weather.wind_speed} m/s (${degreesToCompass(hourData.weather.wind_direction)})</span>
            </div>
          </div>
          <div class="mt-2.5 pt-1.5 border-t border-border flex justify-end">
            <span class="text-[10px] text-sky-400 font-semibold hover:underline">Click station for 72h telemetry &rarr;</span>
          </div>
        </div>
      `;

      marker.bindPopup(popupContent, { closeButton: false, offset: [0, -radius] });
      layer.addLayer(marker);
    });
  }, [forecasts, selectedHour, selectedStationId, onSelectStation]);

  // Update Dynamic Graph Edges Layer
  useEffect(() => {
    if (!edgesLayerRef.current) return;
    const layer = edgesLayerRef.current;
    layer.clearLayers();

    if (!showEdges) return;

    edges.forEach((edge) => {
      // Line weight and opacity based on dynamic GNN weight
      const opacity = Math.min(0.65, Math.max(0.12, edge.weight * 0.8));
      const polyline = L.polyline([edge.source_coords, edge.target_coords], {
        color: '#38bdf8',
        weight: Math.max(1, edge.weight * 3.5),
        opacity,
        dashArray: edge.weight > 0.4 ? '4, 4' : undefined,
      });

      polyline.bindTooltip(
        `GNN Edge Weight: ${edge.weight} (Wind alignment: ${(edge.wind_alignment * 100).toFixed(0)}%)`,
        { sticky: true, className: 'gnn-edge-tooltip text-xs font-mono' }
      );

      layer.addLayer(polyline);
    });
  }, [edges, showEdges]);

  // Update FIRMS Active Fire Layer
  useEffect(() => {
    if (!firesLayerRef.current) return;
    const layer = firesLayerRef.current;
    layer.clearLayers();

    if (!showFires) return;

    fireHotspots.forEach((fire) => {
      const fireMarker = L.circleMarker([fire.lat, fire.lon], {
        radius: Math.min(10, Math.max(4, fire.frp / 14)),
        fillColor: '#f59e0b',
        color: '#b45309',
        weight: 1.5,
        opacity: 0.9,
        fillOpacity: 0.85,
      });

      fireMarker.bindPopup(`
        <div class="p-2.5 bg-surface text-slate-100 rounded text-xs min-w-[180px]">
          <div class="font-bold text-amber-400 flex items-center gap-1 mb-1">
            <span>🔥 NASA FIRMS Fire Hotspot</span>
          </div>
          <div>District: <strong class="text-white">${fire.district}, ${fire.state}</strong></div>
          <div>Radiative Power: <strong class="text-amber-300 font-mono">${fire.frp} MW</strong></div>
          <div>Brightness: <span class="font-mono">${fire.brightness} K</span></div>
          <div>Confidence: <span class="font-mono text-emerald-400">${typeof fire.confidence === 'number' ? fire.confidence + '%' : fire.confidence}</span></div>
          <div class="text-[10px] text-slate-400 mt-1">${fire.acq_time}</div>
        </div>
      `);

      layer.addLayer(fireMarker);
    });
  }, [fireHotspots, showFires]);

  // Update Stubble Plume Trajectories Layer
  useEffect(() => {
    if (!plumesLayerRef.current) return;
    const layer = plumesLayerRef.current;
    layer.clearLayers();

    if (!showPlumes) return;

    firePlumes.forEach((plume) => {
      // Draw smooth dispersion trajectory
      const polyline = L.polyline(plume.points, {
        color: '#ea580c',
        weight: 4,
        opacity: 0.8,
        dashArray: '8, 8',
      });

      polyline.bindTooltip(`
        <div class="text-xs p-1 font-sans">
          <strong>${plume.source_name}</strong><br/>
          Estimated arrival to Delhi: <strong>+${plume.eta_delhi_hours}h</strong><br/>
          Corridor speed: ${plume.current_wind_speed_kmh} km/h (NW bearing)
        </div>
      `, { sticky: true });

      layer.addLayer(polyline);
    });
  }, [firePlumes, showPlumes]);

  // Reset View to Delhi NCR Center
  const resetDelhiCenter = () => {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.setView([28.6139, 77.2090], 10, { animate: true });
    }
  };

  // Zoom to Punjab/Haryana Fire belt
  const viewPunjabFires = () => {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.setView([30.3, 75.9], 8, { animate: true });
    }
  };

  return (
    <div className="relative w-full h-full min-h-[520px] rounded-2xl overflow-hidden border border-border shadow-2xl flex flex-col">
      {/* Map DOM Element */}
      <div ref={mapContainerRef} className="w-full flex-1 z-0" />

      {/* Floating Map Controls & Overlays */}
      <div className="absolute top-3 left-3 z-10 flex flex-col gap-2">
        {/* Navigation Shortcut Chips */}
        <div className="flex items-center gap-1.5 bg-[#121316]/95 border border-[#27272a] p-1 rounded-xl shadow-lg text-xs">
          <button
            type="button"
            onClick={resetDelhiCenter}
            className="px-2.5 py-1 rounded-lg bg-[#061d15] text-white border border-emerald-700/50 hover:bg-[#0e3d2c] font-medium flex items-center gap-1.5 transition-colors"
          >
            <span className="material-symbols-outlined text-sm text-sky-400">near_me</span>
            Delhi-NCR Center
          </button>
          <button
            type="button"
            onClick={viewPunjabFires}
            className="px-2.5 py-1 rounded-lg bg-amber-950/60 border border-amber-800/40 text-amber-300 hover:bg-amber-900/60 font-medium flex items-center gap-1.5 transition-colors"
          >
            <span className="material-symbols-outlined text-sm text-amber-400">local_fire_department</span>
            Upwind Fire Source (NW)
          </button>
        </div>

        {/* Dynamic Layer Toggles */}
        <div className="bg-[#0a2e21]/95 border border-emerald-600/40 p-2 rounded-xl shadow-lg text-xs space-y-1.5 text-white">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 px-1 flex items-center gap-1">
            <span className="material-symbols-outlined text-xs text-neutral-400">layers</span>
            Spatiotemporal Layers
          </div>
          <button
            type="button"
            onClick={() => setShowEdges(!showEdges)}
            className={`w-full flex items-center justify-between px-2 py-1 rounded-lg transition-colors ${
              showEdges ? 'bg-[#14533c] text-white border border-emerald-500/40' : 'text-emerald-200/80 hover:bg-[#061d15]'
            }`}
          >
            <span className="flex items-center gap-1.5">
              <span className="material-symbols-outlined text-xs text-sky-400">air</span>
              Dynamic GNN Edges
            </span>
            <span className="material-symbols-outlined text-sm">
              {showEdges ? 'visibility' : 'visibility_off'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setShowFires(!showFires)}
            className={`w-full flex items-center justify-between px-2 py-1 rounded-lg transition-colors ${
              showFires ? 'bg-[#14533c] text-amber-300 border border-amber-500/40' : 'text-emerald-200/80 hover:bg-[#061d15]'
            }`}
          >
            <span className="flex items-center gap-1.5">
              <span className="material-symbols-outlined text-xs text-amber-400">local_fire_department</span>
              NASA FIRMS Hotspots
            </span>
            <span className="material-symbols-outlined text-sm">
              {showFires ? 'visibility' : 'visibility_off'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setShowPlumes(!showPlumes)}
            className={`w-full flex items-center justify-between px-2 py-1 rounded-lg transition-colors ${
              showPlumes ? 'bg-[#14533c] text-orange-300 border border-orange-500/40' : 'text-emerald-200/80 hover:bg-[#061d15]'
            }`}
          >
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-0.5 bg-orange-500 inline-block border-dashed"></span>
              Plume Trajectory
            </span>
            <span className="material-symbols-outlined text-sm">
              {showPlumes ? 'visibility' : 'visibility_off'}
            </span>
          </button>
        </div>
      </div>

      {/* Floating Bottom-Right AQI Severity Scale Legend */}
      <div className="absolute bottom-4 right-4 z-10 bg-[#0a2e21]/95 border border-emerald-600/40 p-3 rounded-2xl shadow-xl text-xs max-w-xs pointer-events-auto text-white">
        <div className="font-semibold text-white mb-2 flex items-center justify-between">
          <span>CPCB AQI Category Scale</span>
          <span className="text-[10px] text-neutral-400 font-mono">Lead: {formatHourLeadTime(selectedHour)}</span>
        </div>
        <div className="grid grid-cols-2 gap-1.5 text-[11px] font-mono">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-emerald-500 shrink-0"></span>
            <span className="text-slate-300">0-50 Good</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-lime-500 shrink-0"></span>
            <span className="text-slate-300">51-100 Satis.</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-yellow-500 shrink-0"></span>
            <span className="text-slate-300">101-200 Mod.</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-orange-500 shrink-0"></span>
            <span className="text-slate-300">201-300 Poor</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-red-500 shrink-0"></span>
            <span className="text-slate-300">301-400 V.Poor</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-rose-900 border border-rose-500 shrink-0"></span>
            <span className="text-rose-300 font-bold">401-500+ Severe</span>
          </div>
        </div>
      </div>
    </div>
  );
};
