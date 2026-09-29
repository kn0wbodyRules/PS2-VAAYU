import React from 'react';
import { DataSourceStatus } from '../types';

interface SystemStatusPanelProps {
  isOpen: boolean;
  onClose: () => void;
  sources: DataSourceStatus[];
  onTriggerRefresh: () => Promise<void>;
  isRefreshing: boolean;
  lastFastRefresh: string;
}

export const SystemStatusPanel: React.FC<SystemStatusPanelProps> = ({
  isOpen,
  onClose,
  sources,
  onTriggerRefresh,
  isRefreshing,
  lastFastRefresh,
}) => {
  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/75 backdrop-blur-md animate-in fade-in duration-200 font-sans"
      onClick={onClose}
    >
      <div 
        className="bg-[#071f17] border border-emerald-600/40 rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden text-white"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Report Header (Unboxed, Clean) */}
        <div className="px-6 py-4 border-b border-emerald-800/40 flex items-center justify-between bg-[#061812] text-white">
          <div className="flex items-center gap-3">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
            <div>
              <div className="flex items-center gap-2.5">
                <img
                  src="/aeris-logo-transparent.png"
                  alt="AERIS"
                  className="h-5 w-auto object-contain"
                />
                <h2 className="font-heading font-normal text-lg sm:text-xl text-white tracking-wide">
                  Ingestion Pipeline & Data Freshness
                </h2>
              </div>
              <p className="text-xs text-[#a7d0bf] mt-0.5">
                Physical latency, assimilation cadences & live throughput audit across all streams
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#a7d0bf] hover:text-white hover:bg-[#0e3d2c] transition-colors cursor-pointer"
            aria-label="Close dialog"
          >
            <span className="material-symbols-outlined text-xl">close</span>
          </button>
        </div>

        {/* Multi-Cadence Architecture Audit Bar (Clean Divider, No Inner Box) */}
        <div className="px-6 py-3 border-b border-emerald-800/40 bg-[#061d15]/60 text-xs text-[#d1fae5] flex items-center gap-2.5">
          <span className="text-emerald-400 font-bold shrink-0">ℹ</span>
          <p className="leading-relaxed">
            <strong className="text-emerald-300 font-bold uppercase tracking-wider text-[11px] mr-1.5">Architecture:</strong>
            AERIS uses the daily 00:00 UTC CAMS run, treated as available 12 h later; ground stations are hourly and NASA FIRMS has several satellite passes a day. This prototype replays processed historical data (no live ingestion running).
          </p>
        </div>

        {/* Data Stream Report Ledger (Completely Unboxed, Divided List) */}
        <div className="overflow-y-auto divide-y divide-emerald-800/30 flex-1 bg-[#071f17] text-white">
          {sources.map((src) => (
            <div 
              key={src.id}
              className="px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-3 hover:bg-emerald-950/25 transition-colors"
            >
              {/* Left Column: Stream Identity & Physical Latency Context */}
              <div className="space-y-1 min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold text-sm sm:text-base text-white tracking-tight">{src.name}</span>
                  <span className="text-[10px] font-mono font-bold tracking-wider text-emerald-400 uppercase">
                    • {src.type}
                  </span>
                </div>
                <div className="text-xs text-[#a7d0bf] flex flex-wrap items-center gap-1.5">
                  <span>{src.source_org}</span>
                  <span className="text-emerald-700">•</span>
                  <span className="text-emerald-200 font-semibold">{src.frequency}</span>
                </div>
                <p className="text-xs text-neutral-300 mt-1 leading-relaxed">
                  {src.latency_note}
                </p>
              </div>

              {/* Right Column: Freshness Audit & Throughput Telemetry */}
              <div className="flex md:flex-col items-center md:items-end justify-between md:justify-center shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-emerald-900/40 gap-1 md:min-w-[210px]">
                <div className="flex items-center gap-1.5 text-xs font-mono font-bold text-emerald-400">
                  <span className="material-symbols-outlined text-sm text-emerald-400">check_circle</span>
                  <span>{src.last_updated}</span>
                </div>
                <div className="text-[11px] text-[#a7d0bf] font-mono md:text-right">
                  {src.records_processed}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Report Footer */}
        <div className="px-6 py-3.5 border-t border-emerald-800/40 bg-[#061812] flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-xs text-[#a7d0bf] flex items-center gap-2 font-mono">
            <span className="material-symbols-outlined text-sm text-emerald-400">schedule</span>
            <span>Last Live Ingestion Trigger: <strong className="text-white font-bold">{lastFastRefresh}</strong></span>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-[#a7d0bf] hover:text-white hover:bg-[#0e3d2c] transition-colors cursor-pointer"
            >
              Close
            </button>
            <button
              type="button"
              onClick={onTriggerRefresh}
              disabled={isRefreshing}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-[#061d15] font-black text-xs transition-all disabled:opacity-60 cursor-pointer shadow-md"
            >
              <span className={`material-symbols-outlined text-sm ${isRefreshing ? 'animate-spin' : ''}`}>sync</span>
              <span>{isRefreshing ? 'Recomputing...' : 'Recompute Forecast'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SystemStatusPanel;
