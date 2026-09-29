import React, { useState } from 'react';
import { AuthorityTab } from '../types';
import { AuthUser } from './LoginPage';

interface HeaderProps {
  user: AuthUser;
  onLogout: () => void;
  activeTab: AuthorityTab;
  onTabChange: (tab: AuthorityTab) => void;
  onOpenSystemStatus: () => void;
  onTriggerRefresh: () => Promise<void>;
  isRefreshing: boolean;
  lastRefreshTime: string;
}

export const Header: React.FC<HeaderProps> = ({
  user,
  onLogout,
  activeTab,
  onTabChange,
  onOpenSystemStatus,
  onTriggerRefresh,
  isRefreshing,
  lastRefreshTime,
}) => {
  const [justRefreshed, setJustRefreshed] = useState(false);

  const handleRefreshClick = async () => {
    await onTriggerRefresh();
    setJustRefreshed(true);
    setTimeout(() => setJustRefreshed(false), 2500);
  };

  return (
    <header className="bg-[#072118] border-b border-[#134e38] sticky top-0 z-40 px-4 lg:px-6 py-2.5 text-white">
      <div className="flex flex-col md:flex-row items-center justify-between gap-3">
        {/* Brand & Subtitle */}
        <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-start">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center gap-2">
              <img
                src="/aeris-logo-transparent.png"
                alt="AERIS"
                className="h-7 w-auto object-contain"
              />
            </div>
            <p className="text-[10px] text-[#a7d0bf] font-sans font-medium uppercase tracking-wider mt-0.5">
              Air Quality Intelligence
            </p>
          </div>
        </div>

        {/* Authority Navigation Tabs (Only in Authority Role) */}
        {user.role === 'authority' && (
          <nav className="flex items-center gap-1 bg-[#0a2e21] p-1 rounded-xl border border-emerald-600/40 text-xs w-full md:w-auto overflow-x-auto">
            <button
              type="button"
              onClick={() => onTabChange('home')}
              className={`px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition-all flex items-center gap-1.5 ${
                activeTab === 'home'
                   ? 'bg-emerald-600 text-white font-bold ring-1 ring-emerald-400/50'
                  : 'text-emerald-100 hover:text-white hover:bg-[#0e3d2c]'
              }`}
            >
              <span className="material-symbols-outlined text-sm">dashboard</span>
              <span>Home Overview</span>
            </button>
            <button
              type="button"
              onClick={() => onTabChange('map')}
              className={`px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition-all flex items-center gap-1.5 ${
                activeTab === 'map'
                   ? 'bg-emerald-600 text-white font-bold ring-1 ring-emerald-400/50'
                  : 'text-emerald-100 hover:text-white hover:bg-[#0e3d2c]'
              }`}
            >
              <span className="material-symbols-outlined text-sm">map</span>
              <span>Spatial Map</span>
            </button>
            <button
              type="button"
              onClick={() => onTabChange('inversion-fire')}
              className={`px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition-all flex items-center gap-1.5 ${
                activeTab === 'inversion-fire'
                   ? 'bg-emerald-600 text-white font-bold ring-1 ring-emerald-400/50'
                  : 'text-emerald-100 hover:text-white hover:bg-[#0e3d2c]'
              }`}
            >
              <span className="material-symbols-outlined text-sm text-amber-500">local_fire_department</span>
              <span>Inversion & Fire</span>
            </button>
            <button
              type="button"
              onClick={() => onTabChange('comparison')}
              className={`px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition-all flex items-center gap-1.5 ${
                activeTab === 'comparison'
                   ? 'bg-emerald-600 text-white font-bold ring-1 ring-emerald-400/50'
                  : 'text-emerald-100 hover:text-white hover:bg-[#0e3d2c]'
              }`}
            >
              <span className="material-symbols-outlined text-sm">compare_arrows</span>
              <span>CAMS vs GNN</span>
            </button>
            <button
              type="button"
              onClick={() => onTabChange('track-record')}
              className={`px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition-all flex items-center gap-1.5 ${
                activeTab === 'track-record'
                   ? 'bg-emerald-600 text-white font-bold ring-1 ring-emerald-400/50'
                  : 'text-emerald-100 hover:text-white hover:bg-[#0e3d2c]'
              }`}
            >
              <span className="material-symbols-outlined text-sm text-emerald-400">verified</span>
              <span>Track Record</span>
            </button>
          </nav>
        )}

        {/* Right Actions: System Status, Live Refresh, & User Logout */}
        <div className="flex items-center gap-2 w-full md:w-auto justify-end">
          {/* Data Freshness Status Button */}
          <button
            type="button"
            onClick={onOpenSystemStatus}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-[#0a2e21] border border-emerald-600/40 hover:border-emerald-500 text-xs text-white transition-colors"
            title="Inspect Data Sources & Ingestion Schedule"
          >
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span className="hidden xl:inline text-emerald-200">Telemetry:</span>
            <span className="font-mono text-[11px] text-white font-bold">CPCB Live · CAMS 00Z</span>
          </button>

          {/* Refresh Now Button */}
          <button
            type="button"
            onClick={handleRefreshClick}
            disabled={isRefreshing}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all border ${
              isRefreshing
                ? 'bg-neutral-800 border-neutral-700 text-neutral-400 cursor-wait'
                : justRefreshed
                ? 'bg-emerald-950 border-emerald-800 text-emerald-300'
                : 'bg-emerald-500 hover:bg-emerald-400 text-[#061d15] border-emerald-400 font-bold'
            }`}
            title="Trigger fast-cycle live pull of ground sensors and NASA FIRMS fire detections"
          >
            <span className={`material-symbols-outlined text-sm ${isRefreshing ? 'animate-spin' : ''}`}>sync</span>
            <span>{isRefreshing ? 'Pulling...' : justRefreshed ? 'Updated Live' : 'Refresh Now'}</span>
          </button>

          {/* Logged In User Pill & Logout Button */}
          <div className="flex items-center gap-2 pl-2 border-l border-emerald-800/60">
            <div className="hidden sm:block text-right">
              <div className="text-xs font-semibold text-white leading-none">
                {user.identifier.includes('@')
                    ? user.identifier.split('@')[0].toUpperCase()
                    : user.identifier}
              </div>
              <div className="text-[10px] text-emerald-300 font-mono mt-0.5">
                {user.role === 'authority' ? 'CAQM Officer' : 'Public Citizen'}
              </div>
            </div>

            <button
              type="button"
              onClick={onLogout}
              className="p-1.5 rounded-xl bg-[#0a2e21] hover:bg-[#0e3d2c] border border-emerald-600/40 text-emerald-200 hover:text-rose-400 transition-colors"
              title="Sign Out / Change User Role"
            >
              <span className="material-symbols-outlined text-sm">logout</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
