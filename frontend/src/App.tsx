import React, { useState, useEffect } from 'react';
import { 
  AuthorityTab, 
  StationForecast, 
  DynamicGraphEdge, 
  Alert, 
  DataSourceStatus, 
  FIRMSFireHotspot, 
  FirePlumeTrajectory,
  TrackRecordEntry,
  ModelAccuracyStats
} from './types';
import { 
  getStationForecasts, 
  getDynamicEdges, 
  getAlerts, 
  getInversionAndFireData, 
  getTrackRecord, 
  getSystemStatus, 
  triggerFastRefresh,
  getMockFallbacks
} from './services/api';
import { LoginPage, AuthUser } from './components/LoginPage';
import { Sidebar } from './components/Sidebar';
import { HomeWidgetDashboard } from './components/HomeWidgetDashboard';
import { AlertBanner } from './components/AlertBanner';
import { AlertDetailModal } from './components/AlertDetailModal';
import { TimeSlider } from './components/TimeSlider';
import { MapView } from './components/MapView';
import { StationDetailModal } from './components/StationDetailModal';
import { InversionFirePanel } from './components/InversionFirePanel';
import { ModelComparisonView } from './components/ModelComparisonView';
import { TrackRecordView } from './components/TrackRecordView';
import { SystemStatusPanel } from './components/SystemStatusPanel';
import { PublicView } from './components/PublicView';
import Demo from '@/components/ui/demo';
import { Wind, Sparkles } from 'lucide-react';

export const App: React.FC = () => {
  // Authentication State
  const [user, setUser] = useState<AuthUser | null>(() => {
    const saved = localStorage.getItem('aeris_auth_user') || localStorage.getItem('vaayu_auth_user');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        return null;
      }
    }
    return null;
  });

  // Active Authority Tab (defaults to 'home' central widget organizer)
  const [activeTab, setActiveTab] = useState<AuthorityTab>('home');
  const [showIntroPortal, setShowIntroPortal] = useState<boolean>(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() => {
    return localStorage.getItem('aeris_sidebar_collapsed') === 'true';
  });

  const handleToggleSidebarCollapse = () => {
    setIsSidebarCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem('aeris_sidebar_collapsed', String(next));
      return next;
    });
  };

  // Forecast & Telemetry State
  const [forecasts, setForecasts] = useState<Map<string, StationForecast>>(new Map());
  const [selectedHour, setSelectedHour] = useState<number>(0);
  const [edges, setEdges] = useState<DynamicGraphEdge[]>([]);
  const [selectedStationId, setSelectedStationId] = useState<string | null>(null);

  // Alerts & Modals
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [activeAlertForWhy, setActiveAlertForWhy] = useState<Alert | null>(null);
  const [isSystemStatusOpen, setIsSystemStatusOpen] = useState<boolean>(false);

  // Inversion & Fire Data
  const [fireHotspots, setFireHotspots] = useState<FIRMSFireHotspot[]>([]);
  const [firePlumes, setFirePlumes] = useState<FirePlumeTrajectory[]>([]);
  const [inversionTrend, setInversionTrend] = useState<any[]>([]);

  // Track Record Data
  const [trackRecords, setTrackRecords] = useState<TrackRecordEntry[]>([]);
  const [modelStats, setModelStats] = useState<ModelAccuracyStats[]>([]);

  // System Status & Refresh
  const [dataSources, setDataSources] = useState<DataSourceStatus[]>([]);
  const [lastRefreshTime, setLastRefreshTime] = useState<string>('not yet refreshed');
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [isLoadingInitial, setIsLoadingInitial] = useState<boolean>(true);
  // which API calls fell back to bundled mock data (shown as a warning banner, never silently)
  const [mockSources, setMockSources] = useState<string[]>([]);

  // Initial Load
  useEffect(() => {
    async function loadInitialData() {
      try {
        const [
          forecastData,
          edgeData,
          alertData,
          invFireData,
          trackData,
          statusData
        ] = await Promise.all([
          getStationForecasts(),
          getDynamicEdges(315),
          getAlerts(),
          getInversionAndFireData(),
          getTrackRecord(),
          getSystemStatus(),
        ]);

        setForecasts(forecastData);
        setEdges(edgeData);
        setAlerts(alertData);
        setFireHotspots(invFireData.hotspots);
        setFirePlumes(invFireData.plumes);
        setInversionTrend(invFireData.fireInfluenceTrend);
        setTrackRecords(trackData.records);
        setModelStats(trackData.stats);
        setDataSources(statusData.sources);
        setLastRefreshTime(statusData.lastFastRefresh);
      } catch (err) {
        console.error('Failed to load initial data:', err);
      } finally {
        setIsLoadingInitial(false);
        setMockSources(getMockFallbacks());
      }
    }

    loadInitialData();
  }, []);

  // Update dynamic graph edges when selected hour changes
  useEffect(() => {
    const sampleForecast = forecasts.values().next().value;
    const windDir = sampleForecast?.hours[selectedHour]?.weather.wind_direction ?? 315;
    getDynamicEdges(windDir).then(setEdges);
  }, [selectedHour, forecasts]);

  // mean half-width of the empirical 10-90% PM2.5 band across stations at the selected hour
  const pm25Spread = React.useMemo(() => {
    if (selectedHour === 0) return null;
    const w = Array.from(forecasts.values()).map((f) => f.hours[selectedHour]).filter(Boolean)
      .map((h) => (h.pm25.upper - h.pm25.lower) / 2);
    return w.length ? w.reduce((a, b) => a + b, 0) / w.length : null;
  }, [forecasts, selectedHour]);

  // when the forecast shown was issued (the dashboard replays processed historical data)
  const forecastStart = React.useMemo(() => {
    const t = forecasts.values().next().value?.hours[0]?.timestamp;
    return t ? new Date(t).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' }) + ' IST' : null;
  }, [forecasts]);

  const handleLogin = (newUser: AuthUser) => {
    setUser(newUser);
    setShowIntroPortal(true);
    setActiveTab('home'); // don't carry the previous user's tab into a new session
    localStorage.setItem('aeris_auth_user', JSON.stringify(newUser));
  };

  // Demo convenience: flip between the two roles without going back through the login page.
  // Uses the same demo identities as the login page's Google / 1-click buttons (no real auth).
  const handleSwitchRole = () => {
    if (!user) return;
    const next: AuthUser = user.role === 'authority'
      ? { role: 'civilian', identifier: 'citizen.delhi@gmail.com', name: 'Priya Sharma', badge: 'Google Verified Citizen' }
      : { role: 'authority', identifier: 'AERIS-CAQM-0809', name: 'Dr. P. Nair (Joint Director)',
          organization: 'Commission for Air Quality Management (CAQM)', badge: 'Level-3 GRAP Enforcement Clearance' };
    setUser(next);
    setActiveTab('home');
    localStorage.setItem('aeris_auth_user', JSON.stringify(next));
    window.scrollTo({ top: 0 });
  };

  const handleLogout = () => {
    setUser(null);
    setShowIntroPortal(false);
    setActiveTab('home'); // don't carry the previous user's tab into a new session
    localStorage.removeItem('aeris_auth_user');
    localStorage.removeItem('vaayu_auth_user');
  };

  // Handle "Refresh Now" action
  const handleTriggerRefresh = async () => {
    setIsRefreshing(true);
    try {
      const res = await triggerFastRefresh();
      setDataSources(res.updatedSources);
      setLastRefreshTime(res.refreshedAt);
      const freshForecasts = await getStationForecasts(true);
      setForecasts(freshForecasts);
      setMockSources(getMockFallbacks());
    } catch (err) {
      console.error('Refresh error:', err);
    } finally {
      setIsRefreshing(false);
    }
  };

  const selectedForecast = selectedStationId ? forecasts.get(selectedStationId) || null : null;

  // 1. If not logged in, display the Login Portal
  if (!user) {
    return <LoginPage onLogin={handleLogin} />;
  }

  // 2. Right after sign in: Show the interactive Glyph portal scroll experience
  if (showIntroPortal) {
    return (
      <div className="min-h-screen bg-[#061d15] text-white flex flex-col font-sans">
        <Demo
          word="AERIS"
          onEnterDashboard={() => {
            setShowIntroPortal(false);
            setActiveTab('home');
            window.scrollTo({ top: 0 }); // don't carry the intro's scroll offset into the dashboard
          }}
        />
      </div>
    );
  }

  const getPageTitle = (tab: AuthorityTab, role?: string): string => {
    if (role === 'civilian') {
      return tab === 'map' ? 'AIR QUALITY MAP' : 'CITIZEN ADVISORY';
    }
    switch (tab) {
      case 'home':
        return 'HOME OVERVIEW';
      case 'map':
        return 'SPATIAL MAP & GRAPH';
      case 'inversion-fire':
        return 'INVERSION & FIRE';
      case 'comparison':
        return 'CAMS VS GNN';
      case 'track-record':
        return 'TRACK RECORD';
      default:
        return 'HOME OVERVIEW';
    }
  };

  return (
    <div className="min-h-screen bg-[#061d15] text-[#f0fdf4] flex flex-col lg:flex-row font-sans selection:bg-emerald-600 selection:text-white">
      {/* Sleek Retractable Vertical Sidebar */}
      <Sidebar
        user={user}
        onLogout={handleLogout}
        onSwitchRole={handleSwitchRole}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onOpenSystemStatus={() => setIsSystemStatusOpen(true)}
        onTriggerRefresh={handleTriggerRefresh}
        isRefreshing={isRefreshing}
        lastRefreshTime={lastRefreshTime}
        alerts={alerts}
        onSelectAlert={(a) => setActiveAlertForWhy(a)}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={handleToggleSidebarCollapse}
      />

      {/* Main Workspace Area with smooth margin transition matching sidebar width */}
      <div className={`flex-1 flex flex-col min-w-0 transition-all duration-300 ease-in-out ${isSidebarCollapsed ? 'lg:ml-20' : 'lg:ml-72'} min-h-screen`}>
        {mockSources.length > 0 && (
          <div role="alert" className="mx-4 mt-3 rounded-lg border border-rose-500 bg-rose-950/90 px-4 py-2 text-sm text-rose-100">
            <strong className="font-bold">MOCK DATA — not a real forecast.</strong>{' '}
            The AERIS backend did not answer for: {mockSources.join(', ')}. Start it with{' '}
            <code className="font-mono">uvicorn backend.main:app --port 8010</code> and reload.
          </div>
        )}
        {/* Dynamic Island Proactive Alert Banner */}
        {alerts.length > 0 && (
          <AlertBanner
            alerts={alerts}
            onSelectAlert={(a) => setActiveAlertForWhy(a)}
          />
        )}

        {/* Dynamic Page Title in Limelight (Beneath Dynamic Island) */}
        <div className="w-full text-center mt-5 sm:mt-8 md:mt-10 mb-3 sm:mb-5 px-4 select-none">
          <h1
            className="font-limelight text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-normal tracking-wider text-white uppercase drop-shadow-md"
            style={{ fontFamily: "'Limelight', cursive, serif" }}
          >
            {getPageTitle(activeTab, user.role)}
          </h1>
          {forecastStart && (
            <p className="mt-2 text-xs text-[#a7d0bf] font-mono">
              Forecast issued {forecastStart} · historical replay of processed data (not a live feed)
            </p>
          )}
        </div>

        {/* Dynamic Operational Content */}
        <main className="flex-1 p-3 sm:p-5 max-w-[1600px] w-full mx-auto flex flex-col">
          {isLoadingInitial ? (
            <div className="flex-1 min-h-[500px] bg-[#0a2e21] rounded-2xl border-2 border-emerald-600/40 p-6 shadow-xl flex flex-col items-center justify-center space-y-4 text-white">
              <div className="w-12 h-12 rounded-full border-4 border-emerald-800 border-t-white animate-spin" />
              <div className="text-center space-y-1">
                <p className="text-sm font-bold text-white font-sans">
                  Synchronizing AERIS Atmosphere Network...
                </p>
                <p className="text-xs text-[#a7d0bf]">
                  Coupling 56 ground CAAQMS stations with NASA FIRMS active fire telemetry
                </p>
              </div>
            </div>
          ) : user.role === 'civilian' && activeTab !== 'map' ? (
            /* Simplified Public Citizen Experience */
            <div className="space-y-4">
              <div className="flex items-center justify-between bg-[#0a2e21] px-4 py-2.5 rounded-xl border border-emerald-600/40 shadow-sm text-white">
                <div className="flex items-center gap-2 text-xs text-white font-bold">
                  <span className="flex items-center gap-2.5">
                    <img
                      src="/aeris-logo-transparent.png"
                      alt="AERIS"
                      className="h-6 w-auto object-contain"
                    />
                    <span className="text-xs font-bold text-emerald-300 pl-2 border-l border-emerald-700/60 uppercase tracking-wider">Live Citizen Portal</span>
                  </span>
                </div>
              </div>
              <PublicView forecasts={forecasts} />
            </div>
          ) : (
            /* Authority / Decision-Maker Experience */
            <div className="flex-1 flex flex-col">
              {/* 1. CENTRAL HOME TAB (Draggable Widget Organizer) */}
              {activeTab === 'home' && (
                <HomeWidgetDashboard
                  forecasts={forecasts}
                  selectedHour={selectedHour}
                  alerts={alerts}
                  fireHotspots={fireHotspots}
                  firePlumes={firePlumes}
                  inversionTrend={inversionTrend}
                  trackRecords={trackRecords}
                  modelStats={modelStats}
                  dataSources={dataSources}
                  onNavigateTab={(tab) => setActiveTab(tab)}
                  onOpenAlert={(alert) => setActiveAlertForWhy(alert)}
                  onSelectStation={(stId) => setSelectedStationId(stId)}
                />
              )}

              {/* 2. SPATIAL MAP TAB */}
              {activeTab === 'map' && (
                <div className="flex-1 flex flex-col gap-4">
                  <TimeSlider
                    currentHour={selectedHour}
                    onHourChange={setSelectedHour}
                    maxHours={72}
                    spread={pm25Spread}
                  />
                  <div className="flex-1 h-[68vh] min-h-[500px]">
                    <MapView
                      forecasts={forecasts}
                      selectedHour={selectedHour}
                      selectedStationId={selectedStationId}
                      onSelectStation={setSelectedStationId}
                      edges={edges}
                      fireHotspots={fireHotspots}
                      firePlumes={firePlumes}
                    />
                  </div>
                </div>
              )}

              {/* 3. INVERSION & FIRE TAB */}
              {activeTab === 'inversion-fire' && (
                <InversionFirePanel
                  hotspots={fireHotspots}
                  plumes={firePlumes}
                  trendData={inversionTrend}
                  selectedHour={selectedHour}
                />
              )}

              {/* 4. MODEL COMPARISON TAB */}
              {activeTab === 'comparison' && (
                <ModelComparisonView forecasts={forecasts} />
              )}

              {/* 5. TRACK RECORD TAB */}
              {activeTab === 'track-record' && (
                <TrackRecordView
                  records={trackRecords}
                  stats={modelStats}
                />
              )}
            </div>
          )}
        </main>
      </div>

      {/* Station Forecast Deep-Dive Drawer Modal */}
      <StationDetailModal
        forecast={selectedForecast}
        selectedHour={selectedHour}
        onClose={() => setSelectedStationId(null)}
      />

      {/* The "Why" Causal Explanation Modal */}
      <AlertDetailModal
        alert={activeAlertForWhy}
        onClose={() => setActiveAlertForWhy(null)}
      />

      {/* System Status Ingestion Modal */}
      <SystemStatusPanel
        isOpen={isSystemStatusOpen}
        onClose={() => setIsSystemStatusOpen(false)}
        sources={dataSources}
        onTriggerRefresh={handleTriggerRefresh}
        isRefreshing={isRefreshing}
        lastFastRefresh={lastRefreshTime}
      />
    </div>
  );
};

export default App;
