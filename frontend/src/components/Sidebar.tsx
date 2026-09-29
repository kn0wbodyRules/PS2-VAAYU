import React, { useState } from 'react';
import { AuthorityTab, Alert } from '../types';
import { 
  LayoutDashboard,
  Map,
  Flame,
  Layers,
  History,
  ChevronLeft,
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
  X, 
  Menu,
  HelpCircle,
  RotateCw,
  LogOut,
  AlertTriangle,
  Activity
} from 'lucide-react';

interface SidebarProps {
  user: {
    role: string;
    identifier: string;
  };
  onLogout: () => void;
  activeTab: AuthorityTab;
  onTabChange: (tab: AuthorityTab) => void;
  onOpenSystemStatus: () => void;
  onTriggerRefresh: () => Promise<void>;
  isRefreshing: boolean;
  lastRefreshTime: string;
  alerts: Alert[];
  onSelectAlert?: (alert: Alert) => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export const DiscoBall: React.FC<{ className?: string }> = ({ className = 'w-7 h-7' }) => (
  <svg 
    viewBox="0 0 32 32" 
    className={`${className} animate-disco-ball shrink-0 transition-transform`}
    style={{ overflow: 'visible' }}
  >
    <defs>
      <radialGradient id="disco-gradient-base" cx="30%" cy="30%" r="70%">
        <stop offset="0%" stopColor="#d9f99d" />
        <stop offset="25%" stopColor="#4ade80" />
        <stop offset="55%" stopColor="#10b981" />
        <stop offset="85%" stopColor="#047857" />
        <stop offset="100%" stopColor="#022c1e" />
      </radialGradient>
    </defs>

    {/* Suspension Cap & Ring */}
    <rect x="14" y="1" width="4" height="2" rx="0.5" fill="#a7d0bf" opacity="0.75" />
    <circle cx="16" cy="1" r="1" fill="none" stroke="#6ee7b7" strokeWidth="0.8" />

    {/* Faceted Mirror Sphere Base */}
    <circle cx="16" cy="17" r="13" fill="url(#disco-gradient-base)" />

    {/* Latitudinal Rings */}
    <ellipse cx="16" cy="17" rx="13" ry="3.5" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="0.65" />
    <ellipse cx="16" cy="17" rx="13" ry="7.5" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="0.65" />
    <ellipse cx="16" cy="17" rx="13" ry="11" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="0.65" />

    {/* Longitudinal Meridians */}
    <ellipse cx="16" cy="17" rx="3.5" ry="13" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="0.65" />
    <ellipse cx="16" cy="17" rx="7.5" ry="13" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="0.65" />
    <ellipse cx="16" cy="17" rx="11" ry="13" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="0.65" />

    {/* Shimmering Mirror Facet Tiles */}
    <rect x="14.5" y="11" width="3" height="2.5" rx="0.5" fill="#ffffff" opacity="0.95" className="animate-disco-facet" />
    <rect x="18" y="14.5" width="2.5" height="2.5" rx="0.5" fill="#bef264" opacity="0.9" className="animate-disco-facet" style={{ animationDelay: '0.4s' }} />
    <rect x="11" y="15" width="2.5" height="2.5" rx="0.5" fill="#86efac" opacity="0.85" className="animate-disco-facet" style={{ animationDelay: '0.8s' }} />
    <rect x="14" y="18.5" width="3" height="2.5" rx="0.5" fill="#ffffff" opacity="0.9" className="animate-disco-facet" style={{ animationDelay: '1.2s' }} />
    <rect x="9.5" y="11.5" width="2.5" height="2.5" rx="0.5" fill="#6ee7b7" opacity="0.8" className="animate-disco-facet" style={{ animationDelay: '0.6s' }} />
    <rect x="19.5" y="11" width="2.5" height="2.5" rx="0.5" fill="#ffffff" opacity="0.85" className="animate-disco-facet" style={{ animationDelay: '1.0s' }} />
    <rect x="17.5" y="19" width="2.5" height="2" rx="0.5" fill="#a3e635" opacity="0.8" className="animate-disco-facet" style={{ animationDelay: '0.2s' }} />

    {/* 3D Specular Sheen */}
    <ellipse cx="12" cy="11.5" rx="4.5" ry="3" fill="#ffffff" opacity="0.5" transform="rotate(-30 12 11.5)" />
  </svg>
);

export const Sidebar: React.FC<SidebarProps> = ({
  user,
  onLogout,
  activeTab,
  onTabChange,
  onOpenSystemStatus,
  onTriggerRefresh,
  isRefreshing,
  lastRefreshTime,
  alerts,
  onSelectAlert,
  isCollapsed = false,
  onToggleCollapse,
}) => {
  const [justRefreshed, setJustRefreshed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [expandedCard, setExpandedCard] = useState<'advisory' | 'telemetry' | null>(null);

  const activeAlert = alerts[0];

  const handleRefreshClick = async () => {
    await onTriggerRefresh();
    setJustRefreshed(true);
    setTimeout(() => setJustRefreshed(false), 2500);
  };

  const authorityNavItems: { 
    id: AuthorityTab; 
    label: string; 
    subtitle: string; 
    icon: React.ComponentType<{ className?: string }>;
    badge?: string; 
  }[] = [
    {
      id: 'home',
      label: 'Home Overview',
      subtitle: 'Live Telemetry Grid',
      icon: LayoutDashboard,
    },
    {
      id: 'map',
      label: 'Spatial Map & Graph',
      subtitle: 'Stations & Wind Vectors',
      icon: Map,
    },
    {
      id: 'inversion-fire',
      label: 'Inversion & Fire',
      subtitle: 'Inversion & Satellite Fires',
      icon: Flame,
      badge: 'Active Stubble',
    },
    {
      id: 'comparison',
      label: 'CAMS vs GNN',
      subtitle: 'Model Calibration',
      icon: Layers,
    },
    {
      id: 'track-record',
      label: 'Track Record',
      subtitle: 'Historical Audit',
      icon: History,
    },
  ];

  // Citizens get their own menu. Previously they saw the authority tabs, but App always renders
  // the citizen advisory for them, so clicking any tab appeared to do nothing.
  const navItems: typeof authorityNavItems = user.role === 'civilian'
    ? [
        { id: 'home' as AuthorityTab, label: 'Citizen Advisory', subtitle: 'Your local air quality', icon: LayoutDashboard },
        { id: 'map' as AuthorityTab, label: 'Air Quality Map', subtitle: 'Stations across Delhi-NCR', icon: Map },
      ]
    : authorityNavItems;

  return (
    <>
      {/* Mobile Top Bar with Hamburger (only visible on mobile screens) */}
      <div className="lg:hidden flex items-center justify-between p-3.5 bg-[#072118] border-b border-[#134e38] text-white sticky top-0 z-40">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-black/80 border border-white/20 flex items-center justify-center shadow-md p-1">
            <img
              src="/aeris-icon-transparent.png"
              alt="AERIS"
              className="w-full h-full object-contain"
            />
          </div>
          <div>
            <img
              src="/aeris-logo-transparent.png"
              alt="AERIS"
              className="h-5 w-auto object-contain"
            />
            <span className="text-[10px] text-[#a7d0bf] block font-sans">Air Quality Portal</span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsMobileOpen(!isMobileOpen)}
          className="p-2 rounded-xl bg-[#0e3d2c] border border-emerald-700/60 text-white hover:bg-[#14533c] cursor-pointer"
          aria-label="Toggle navigation menu"
        >
          {isMobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Backdrop for Mobile */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      {/* Main Sidebar (Desktop fixed left, Mobile drawer) */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 bg-[#072118] border-r border-[#134e38] text-white flex flex-col justify-between transition-all duration-300 ease-in-out ${
          isMobileOpen 
            ? 'translate-x-0 shadow-2xl w-72' 
            : `-translate-x-full lg:translate-x-0 ${isCollapsed ? 'lg:w-20' : 'lg:w-72'}`
        }`}
      >
        {/* ======================================================== */}
        {/* TOP SECTION: BRANDING & RETRACT TOGGLE                   */}
        {/* ======================================================== */}
        {isCollapsed ? (
          /* CONTRACTED TOP: Styled AERIS 'A' Ribbon Glyph */
          <div className="pt-6 sm:pt-7 pb-3.5 px-3.5 border-b border-[#134e38] bg-[#072118] flex flex-col items-center justify-center shrink-0">
            <button
              type="button"
              onClick={onToggleCollapse}
              className="w-12 h-12 rounded-2xl bg-black/80 hover:bg-black border border-white/20 hover:border-emerald-500/60 flex items-center justify-center shadow-lg transition-all group relative cursor-pointer active:scale-95 p-2"
              title="AERIS (Click to expand sidebar)"
              aria-label="Expand AERIS Sidebar"
            >
              <img
                src="/aeris-icon-transparent.png"
                alt="AERIS"
                className="w-full h-full object-contain group-hover:scale-110 transition-transform"
              />
              {/* Subtle hover expand indicator */}
              <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-emerald-600 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm">
                <ChevronRight className="w-2.5 h-2.5" />
              </span>
            </button>
          </div>
        ) : (
          /* EXPANDED TOP: Full AERIS Brand Logo + Retract Toggle Button */
          <div className="pt-6 sm:pt-7 pb-4 px-4 border-b border-[#134e38] bg-[#072118] flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <button
                type="button"
                onClick={onToggleCollapse}
                className="w-9 h-9 rounded-xl bg-black/80 border border-white/20 flex items-center justify-center shadow-md shrink-0 hover:border-emerald-500/60 transition-colors group cursor-pointer p-1.5"
                title="Contract sidebar"
              >
                <img
                  src="/aeris-icon-transparent.png"
                  alt="AERIS"
                  className="w-full h-full object-contain group-hover:scale-110 transition-transform"
                />
              </button>
              <div className="min-w-0 flex flex-col justify-center">
                <img
                  src="/aeris-logo-transparent.png"
                  alt="AERIS"
                  className="h-6 w-auto max-w-[130px] object-contain object-left"
                />
                <p className="text-[10px] text-[#a7d0bf] font-sans mt-0.5 font-medium leading-none truncate tracking-wider uppercase">
                  Air Quality Portal
                </p>
              </div>
            </div>

            {onToggleCollapse && (
              <button
                type="button"
                onClick={onToggleCollapse}
                className="p-1.5 rounded-lg text-[#a7d0bf] hover:text-white hover:bg-[#0e3d2c] transition-colors cursor-pointer shrink-0"
                title="Collapse Sidebar"
                aria-label="Collapse Sidebar"
              >
                <PanelLeftClose className="w-4 h-4" />
              </button>
            )}
          </div>
        )}

        {/* ======================================================== */}
        {/* MIDDLE SECTION: NAVIGATION & ACTIONS                     */}
        {/* ======================================================== */}
        <div className={`flex-1 overflow-y-auto ${isCollapsed ? 'p-2 space-y-3' : 'p-3.5 space-y-4'} font-sans`}>
          {/* Navigation Items */}
          <nav className="space-y-1.5">
            {navItems.map((item) => {
              const isActive = activeTab === item.id;
              const Icon = item.icon;

              if (isCollapsed) {
                /* Contracted Rail Navigation Button */
                return (
                  <div key={item.id} className="relative flex justify-center group">
                    <button
                      type="button"
                      onClick={() => {
                        onTabChange(item.id);
                        setIsMobileOpen(false);
                      }}
                      className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all cursor-pointer relative ${
                        isActive
                          ? 'bg-[#0e3d2c] text-white border border-emerald-500/50 shadow-sm'
                          : 'text-white/75 hover:text-white hover:bg-[#0a2e21] border border-transparent'
                      }`}
                      aria-label={item.label}
                    >
                      <Icon className={`w-5 h-5 transition-transform group-hover:scale-110 ${isActive ? 'text-emerald-300' : 'text-white/80'}`} />
                      
                      {/* Active indicator bar */}
                      {isActive && (
                        <span className="absolute left-0 top-3 bottom-3 w-1 bg-emerald-400 rounded-r-full" />
                      )}

                      {/* Micro badge dot for active features */}
                      {item.badge && (
                        <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-amber-400 ring-2 ring-[#072118]" />
                      )}
                    </button>

                    {/* Floating Tooltip on Hover */}
                    <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 px-3 py-1.5 rounded-xl bg-[#0a2e21] border border-emerald-600/50 text-white text-xs font-semibold whitespace-nowrap shadow-2xl opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50 flex items-center gap-2">
                      <span>{item.label}</span>
                      {item.badge && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-400 text-neutral-950 font-bold">
                          {item.badge}
                        </span>
                      )}
                    </div>
                  </div>
                );
              }

              /* Expanded Navigation Button */
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    onTabChange(item.id);
                    setIsMobileOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all cursor-pointer ${
                    isActive
                      ? 'bg-[#0e3d2c] text-white shadow-sm border border-emerald-500/50'
                      : 'text-white/85 hover:text-white hover:bg-[#0a2e21] border border-transparent'
                  }`}
                >
                  <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-emerald-300' : 'text-[#a7d0bf]'}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <span className={`text-sm font-bold truncate ${isActive ? 'text-white' : 'text-white/95'}`}>
                        {item.label}
                      </span>
                      {item.badge && (
                        <span className="text-[10px] text-amber-400 font-mono font-bold flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                          {item.badge}
                        </span>
                      )}
                    </div>
                    <span className={`text-xs block truncate mt-0.5 ${isActive ? 'text-[#86efac]' : 'text-[#a7d0bf]'}`}>
                      {item.subtitle}
                    </span>
                  </div>
                </button>
              );
            })}
          </nav>

          {/* Quick Actions (Advisory, Telemetry & Health) */}
          {isCollapsed ? (
            /* Contracted Quick Action Icons */
            <div className="pt-4 border-t border-[#134e38]/70 flex flex-col items-center gap-2">
              {/* Green Disco Ball (No Box, No Shadow, No Extra Words, Just the Glowing Dynamic Disco Ball) */}
              <button
                type="button"
                onClick={() => activeAlert && onSelectAlert ? onSelectAlert(activeAlert) : onOpenSystemStatus()}
                className="cursor-pointer transition-transform hover:scale-115 active:scale-95 flex items-center justify-center p-2 focus:outline-none"
                aria-label="Active Advisory"
              >
                <DiscoBall className="w-8 h-8" />
              </button>

              {/* Refresh / Telemetry Micro Button */}
              <div className="relative group">
                <button
                  type="button"
                  onClick={handleRefreshClick}
                  disabled={isRefreshing}
                  className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all cursor-pointer ${
                    justRefreshed
                      ? 'bg-emerald-800 text-white border border-emerald-400'
                      : 'bg-[#0e3d2c] hover:bg-[#14533c] text-white border border-emerald-500/50'
                  }`}
                  aria-label="Refresh Telemetry"
                >
                  <RotateCw className={`w-5 h-5 text-[#86efac] ${isRefreshing ? 'animate-spin' : ''}`} />
                </button>
                <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 px-3 py-1.5 rounded-xl bg-[#0a2e21] border border-emerald-600/50 text-white text-xs font-semibold whitespace-nowrap shadow-2xl opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50">
                  {isRefreshing ? 'Syncing...' : `Refresh Telemetry (${lastRefreshTime})`}
                </div>
              </div>

              {/* System Health Micro Button */}
              <div className="relative group">
                <button
                  type="button"
                  onClick={onOpenSystemStatus}
                  className="w-12 h-12 rounded-xl bg-[#061d15] hover:bg-[#0e3d2c] border border-[#134e38] text-white/75 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
                  aria-label="System Health"
                >
                  <Activity className="w-5 h-5 text-emerald-400" />
                </button>
                <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 px-3 py-1.5 rounded-xl bg-[#0a2e21] border border-emerald-600/50 text-white text-xs font-semibold whitespace-nowrap shadow-2xl opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50">
                  System Health & Ingestion Pipeline
                </div>
              </div>
            </div>
          ) : (
            /* Expanded Dual Action Cards */
            <div className="mt-auto pt-2">
              {/* Default State: Both 'Advisory' and 'Telemetry' buttons visible */}
              {expandedCard === null && (
                <div className="pt-2 border-t border-[#134e38]/50 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setExpandedCard('advisory')}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-[#0e3d2c]/60 hover:bg-[#0e3d2c] border border-emerald-600/40 text-emerald-200 transition-all group cursor-pointer"
                    title="Open Active Advisory & Causal Drivers"
                  >
                    <DiscoBall className="w-4 h-4 group-hover:scale-110 transition-transform" />
                    <span className="text-xs font-bold font-sans">Advisory</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setExpandedCard('telemetry')}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-[#0e3d2c] hover:bg-[#14533c] border border-emerald-500/50 text-white transition-all group cursor-pointer"
                    title="Open Live Telemetry & Pipeline Sync"
                  >
                    <RotateCw className={`w-4 h-4 text-[#86efac] group-hover:scale-110 transition-transform ${isRefreshing ? 'animate-spin' : ''}`} />
                    <span className="text-xs font-bold font-sans">Telemetry</span>
                  </button>
                </div>
              )}

              {/* Expanded Advisory Card */}
              {expandedCard === 'advisory' && (
                <div className="relative p-3 rounded-xl bg-rose-950/60 border border-rose-800/80 space-y-2 animate-in fade-in zoom-in-95 duration-200">
                  <button
                    type="button"
                    onClick={() => setExpandedCard(null)}
                    className="absolute top-2 right-2 p-1 rounded-md text-rose-300 hover:text-white hover:bg-rose-900/60 transition-colors cursor-pointer"
                    title="Close Advisory"
                    aria-label="Close Advisory"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>

                  <div className="flex items-center justify-between pr-6">
                    <span className="text-[10px] font-bold text-rose-300 uppercase tracking-wider">
                      Active Advisory
                    </span>
                    {activeAlert && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-900 text-rose-200 font-bold border border-rose-700">
                        {activeAlert.grap_stage}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-white font-semibold line-clamp-2 leading-tight">
                    {activeAlert ? activeAlert.subtitle : 'No active critical alerts.'}
                  </p>
                  {activeAlert && onSelectAlert && (
                    <button
                      type="button"
                      onClick={() => {
                        onSelectAlert(activeAlert);
                        setIsMobileOpen(false);
                      }}
                      className="w-full text-left text-xs text-[#86efac] hover:text-white font-bold flex items-center justify-between pt-1 border-t border-rose-800/80 cursor-pointer"
                    >
                      <span>Investigate "The Why"</span>
                      <span>&rarr;</span>
                    </button>
                  )}
                </div>
              )}

              {/* Expanded Telemetry Card */}
              {expandedCard === 'telemetry' && (
                <div className="relative p-3 rounded-xl bg-[#0a2e21] border border-[#134e38] space-y-2.5 animate-in fade-in zoom-in-95 duration-200">
                  <button
                    type="button"
                    onClick={() => setExpandedCard(null)}
                    className="absolute top-2 right-2 p-1 rounded-md text-[#a7d0bf] hover:text-white hover:bg-[#0e3d2c] transition-colors cursor-pointer"
                    title="Close Telemetry"
                    aria-label="Close Telemetry"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>

                  <div className="flex items-center justify-between text-xs pr-6">
                    <span className="text-[10px] uppercase text-[#a7d0bf] font-bold">Live Telemetry</span>
                    <span className="text-xs text-[#86efac] font-bold font-numbers">
                      56 / 56 CPCB
                    </span>
                  </div>

                  <div className="space-y-1 text-xs text-[#a7d0bf]">
                    <div className="flex justify-between">
                      <span>Sync:</span>
                      <span className="text-white font-semibold font-numbers">{lastRefreshTime}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Met Baseline:</span>
                      <span className="text-white font-semibold">CAMS 00 UTC</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-1.5 pt-1 border-t border-[#134e38]">
                    <button
                      type="button"
                      onClick={handleRefreshClick}
                      disabled={isRefreshing}
                      className={`w-full py-1.5 px-2 rounded-lg text-xs font-bold flex items-center justify-center transition-all border cursor-pointer ${
                        isRefreshing
                          ? 'bg-[#061d15] border-[#134e38] text-white/40 cursor-wait'
                          : justRefreshed
                          ? 'bg-[#0e3d2c] border-emerald-500 text-white'
                          : 'bg-[#0e3d2c] hover:bg-[#14533c] border-emerald-500/50 text-white'
                      }`}
                      title="Pull ground sensors & NASA FIRMS"
                    >
                      <span>{isRefreshing ? 'Syncing...' : justRefreshed ? 'Updated' : 'Refresh'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        onOpenSystemStatus();
                        setIsMobileOpen(false);
                      }}
                      className="w-full py-1.5 px-2 rounded-lg text-xs font-bold bg-[#061d15] hover:bg-[#0e3d2c] border border-[#134e38] text-white flex items-center justify-center transition-colors cursor-pointer"
                    >
                      <span>Health</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ======================================================== */}
        {/* BOTTOM SECTION: USER PROFILE & SIGN OUT                  */}
        {/* ======================================================== */}
        {isCollapsed ? (
          /* Contracted Bottom Rail */
          <div className="p-3 border-t border-[#134e38] bg-[#061d15] flex flex-col items-center gap-2 shrink-0">
            {/* User Profile Micro Icon */}
            <div className="relative group">
              <div 
                className="w-10 h-10 rounded-xl bg-[#0e3d2c] border border-emerald-600/40 text-white flex items-center justify-center font-bold text-xs cursor-pointer shadow-xs"
                title={user.identifier}
              >
                <span>{user.role === 'authority' ? 'AU' : 'CZ'}</span>
              </div>
              <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 px-3 py-1.5 rounded-xl bg-[#0a2e21] border border-emerald-600/50 text-white text-xs font-semibold whitespace-nowrap shadow-2xl opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50">
                <div className="font-bold">
                  {user.identifier.includes('@')
                    ? user.identifier.split('@')[0].toUpperCase()
                    : user.identifier}
                </div>
                <div className="text-[10px] text-[#a7d0bf]">
                  {user.role === 'authority' ? 'Authority CAQM' : 'Civilian Citizen'}
                </div>
              </div>
            </div>

            {/* Logout Micro Button */}
            <div className="relative group">
              <button
                type="button"
                onClick={onLogout}
                className="w-10 h-10 rounded-xl bg-transparent hover:bg-rose-950/60 border border-transparent hover:border-rose-700/60 text-white/70 hover:text-rose-300 flex items-center justify-center transition-colors cursor-pointer"
                title="Log out"
                aria-label="Log out"
              >
                <LogOut className="w-4 h-4" />
              </button>
              <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 px-3 py-1.5 rounded-xl bg-neutral-900 border border-white/20 text-white text-xs font-semibold whitespace-nowrap shadow-2xl opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50">
                Log Out
              </div>
            </div>

            {/* Expand Rail Button */}
            {onToggleCollapse && (
              <button
                type="button"
                onClick={onToggleCollapse}
                className="w-10 h-10 rounded-xl hover:bg-[#0e3d2c] text-[#a7d0bf] hover:text-white flex items-center justify-center transition-colors cursor-pointer"
                title="Expand Sidebar"
                aria-label="Expand Sidebar"
              >
                <PanelLeftOpen className="w-4 h-4" />
              </button>
            )}
          </div>
        ) : (
          /* Expanded Bottom User Card */
          <div className="p-3.5 border-t border-[#134e38] bg-[#061d15] shrink-0">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-xs font-bold text-white truncate leading-tight font-numbers">
                  {user.identifier.includes('@')
                    ? user.identifier.split('@')[0].toUpperCase()
                    : user.identifier}
                </div>
                <div className="text-xs text-[#a7d0bf] truncate mt-0.5">
                  {user.role === 'authority' ? 'Authority CAQM' : 'Civilian Citizen'}
                </div>
              </div>

              <button
                type="button"
                onClick={onLogout}
                className="px-2.5 py-1.5 rounded-lg bg-[#0e3d2c] hover:bg-rose-950/60 border border-emerald-700/60 hover:border-rose-700 text-white hover:text-rose-300 text-xs font-bold transition-colors shrink-0 flex items-center gap-1 cursor-pointer"
                title="Sign Out"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Log out</span>
              </button>
            </div>
          </div>
        )}
      </aside>
    </>
  );
};

export default Sidebar;
