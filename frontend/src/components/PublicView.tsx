import React, { useState } from 'react';
import { StationForecast } from '../types';
import { getAQIColor, getAQIBadgeClass, getAQIDescription } from '../utils/aqi';
import { formatConfidenceRange } from '../utils/formatters';

interface PublicViewProps {
  forecasts: Map<string, StationForecast>;
}

export const PublicView: React.FC<PublicViewProps> = ({ forecasts }) => {
  const [selectedStationId, setSelectedStationId] = useState<string>('anand_vihar_dpcc');
  const [searchQuery, setSearchQuery] = useState('');
  const [notifyThreshold, setNotifyThreshold] = useState<number>(() => {
    const saved = Number(localStorage.getItem('aeris_citizen_threshold'));
    return saved >= 100 && saved <= 500 ? saved : 300;
  });
  // result of checking the real 72 h forecast against the threshold (no fake 'you will be alerted')
  const [thresholdCheck, setThresholdCheck] = useState<string | null>(null);
  const [showDetailedNumbers, setShowDetailedNumbers] = useState(false);

  // Filter stations by search
  // stations come from the live forecast (real station IDs), not the bundled mock list
  const filteredStations = Array.from(forecasts.values()).map((f) => f.station).filter(
    (s) =>
      !s.isBoundaryNode &&
      (s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.city.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.zone.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const currentForecast = forecasts.get(selectedStationId) || Array.from(forecasts.values())[0];
  const hours = currentForecast?.hours || [];

  const todayHour = hours[0] || hours[0];
  const tomorrowHour = hours[24] || hours[0];
  const day3Hour = hours[48] || hours[0];

  const days = [
    {
      label: 'Today',
      date: 'Live Telemetry',
      hourData: todayHour,
      headline: todayHour.aqi.mean > 350 
        ? 'Severe smog layer trapping particulates across the area.'
        : 'Poor to Very Poor air quality; morning haze persists.',
      advice: 'Avoid morning outdoor exercise; wear N95 mask outdoors.',
    },
    {
      label: 'Tomorrow (Day 2)',
      date: '+24h Forecast',
      hourData: tomorrowHour,
      headline: tomorrowHour.aqi.mean > todayHour.aqi.mean
        ? 'Air quality expected to worsen sharply Thursday — stagnant winds incoming.'
        : 'Marginal ventilation improvement expected by late afternoon.',
      advice: 'Keep windows firmly closed in early morning/evening; run indoor air purifier.',
    },
    {
      label: 'Day 3',
      date: '+48h Forecast',
      hourData: day3Hour,
      headline: day3Hour.aqi.mean >= 400
        ? 'Critical thermal inversion ceiling: hazardous particulate entrapment.'
        : 'High particulate index continues under calm surface conditions.',
      advice: 'Vulnerable individuals, seniors, and children should remain strictly indoors.',
    },
  ];

  const currentAQI = todayHour.aqi.mean;
  const currentCategory = todayHour.category;

  const handleNotifySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    localStorage.setItem('aeris_citizen_threshold', String(notifyThreshold));
    const hit = hours.find((h) => h.hour_offset > 0 && h.aqi.mean >= notifyThreshold);
    const name = currentForecast?.station.name ?? 'this station';
    setThresholdCheck(hit
      ? `Forecast: ${name} is expected to reach AQI ${Math.round(hit.aqi.mean)} (${hit.category}) at +${hit.hour_offset}h, ${new Date(hit.timestamp).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })} — above your threshold of ${notifyThreshold}.`
      : `Forecast: ${name} stays below AQI ${notifyThreshold} for the next ${Math.max(0, hours.length - 1)} hours.`);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 font-sans">
      {/* Header & Area Search */}
      <div className="bg-[#0a2e21] p-6 rounded-2xl border-2 border-emerald-600/40 shadow-xl space-y-4 text-white">
        <div>
          <h2 className="font-heading font-normal text-xl text-white flex items-center gap-2">
            <span>Air Quality for You & Your Family</span>
            <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-[#0e3d2c] text-emerald-300 font-bold border border-emerald-600/50">
              Citizen Advisory
            </span>
          </h2>
          <p className="text-xs text-[#a7d0bf] mt-0.5">
            72-hour plain language air quality forecast for Delhi-NCR
          </p>
        </div>

        {/* Search Bar & Quick Area Chips */}
        <div className="space-y-2.5">
          <div className="relative">
            <span className="material-symbols-outlined text-[#a7d0bf] text-lg absolute left-3.5 top-2.5">search</span>
            <input
              type="text"
              placeholder="Search your neighborhood (e.g. Anand Vihar, Rohini, Dwarka, Noida, Gurugram)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-[#061d15] border border-emerald-700/60 rounded-xl text-xs text-white placeholder-emerald-400/60 focus:outline-none focus:border-white focus:ring-1 focus:ring-white"
            />
          </div>

          {/* Quick Select Chips */}
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <span className="text-[11px] text-[#a7d0bf] mr-1">Popular:</span>
            {[
              { id: 'anand_vihar_dpcc', name: 'Anand Vihar' },
              { id: 'ito_cpcb', name: 'Central Delhi (ITO)' },
              { id: 'rohini_dpcc', name: 'Rohini' },
              { id: 'dwarka_sector_8_dpcc', name: 'Dwarka' },
              { id: 'sector_1_uppcb', name: 'Noida Sec 1' },
              { id: 'sector_51_hspcb', name: 'Gurugram' },
            ].map((chip) => (
              <button
                key={chip.id}
                type="button"
                onClick={() => {
                  setSelectedStationId(chip.id);
                  setSearchQuery('');
                }}
                className={`px-3 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                  selectedStationId === chip.id
                    ? 'bg-emerald-500 text-[#061d15] shadow-sm font-bold'
                    : 'bg-[#061d15] text-emerald-200 border border-emerald-700/50 hover:bg-[#0e3d2c]'
                }`}
              >
                {chip.name}
              </button>
            ))}
          </div>

          {/* Search Results Dropdown */}
          {searchQuery && (
            <div className="bg-[#061d15] border border-emerald-700/60 rounded-xl p-2 max-h-48 overflow-y-auto space-y-1 shadow-lg text-white">
              {filteredStations.length === 0 ? (
                <div className="text-xs text-[#a7d0bf] p-2">No monitoring station found.</div>
              ) : (
                filteredStations.map((st) => (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => {
                      setSelectedStationId(st.id);
                      setSearchQuery('');
                    }}
                    className="w-full text-left px-3 py-1.5 rounded-lg text-xs text-white hover:bg-[#0e3d2c] flex items-center justify-between cursor-pointer"
                  >
                    <span className="font-medium text-white">{st.name}</span>
                    <span className="text-[10px] text-[#a7d0bf] font-mono">{st.city} ({st.zone})</span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* Main Air Status Card */}
      <div className="p-6 sm:p-7 rounded-2xl border-2 border-emerald-600/40 shadow-xl relative overflow-hidden bg-[#0a2e21] text-white">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <span className="material-symbols-outlined text-base text-emerald-400">location_on</span>
              <h3 className="text-lg font-bold text-white">
                {currentForecast.station.name}
              </h3>
              <span className="text-xs text-[#a7d0bf] font-mono">
                ({currentForecast.station.city})
              </span>
            </div>

            <div className="flex items-center gap-3">
              <span 
                className="text-4xl sm:text-5xl font-extrabold font-mono"
                style={{ color: getAQIColor(currentAQI) }}
              >
                {Math.round(currentAQI)}
              </span>
              <div>
                <span className={`text-xs px-2.5 py-0.5 rounded-full font-bold ${getAQIBadgeClass(currentCategory)}`}>
                  {currentCategory} Air
                </span>
                <div className="text-xs text-[#a7d0bf] font-mono mt-0.5">
                  Confidence: {formatConfidenceRange(todayHour.aqi)} AQI
                </div>
              </div>
            </div>

            <p className="text-xs sm:text-sm text-slate-200 max-w-lg leading-relaxed pt-1">
              {getAQIDescription(currentCategory)}
            </p>
          </div>

          <div className="sm:self-center shrink-0">
            <button
              type="button"
              onClick={() => setShowDetailedNumbers(!showDetailedNumbers)}
              className="px-4 py-2 rounded-xl bg-[#061d15] hover:bg-[#0e3d2c] border border-emerald-700/50 text-xs text-white font-bold transition-colors cursor-pointer"
            >
              {showDetailedNumbers ? 'Hide Detailed Numbers' : 'Show Chemical Readings'}
            </button>
          </div>
        </div>

        {/* Expandable Exact Numbers (Unboxed) */}
        {showDetailedNumbers && (
          <div className="mt-5 pt-4 border-t border-emerald-800/60 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs animate-in fade-in">
            <div>
              <span className="text-[#a7d0bf] block text-[10px] uppercase font-bold tracking-wider">PM2.5 (Fine dust)</span>
              <span className="text-xl font-bold font-mono text-white">
                {Math.round(todayHour.pm25.mean)} <span className="text-xs text-[#a7d0bf] font-normal font-sans">µg/m³</span>
              </span>
            </div>
            <div>
              <span className="text-[#a7d0bf] block text-[10px] uppercase font-bold tracking-wider">PM10 (Coarse dust)</span>
              <span className="text-xl font-bold font-mono text-white">
                {Math.round(todayHour.pm10.mean)} <span className="text-xs text-[#a7d0bf] font-normal font-sans">µg/m³</span>
              </span>
            </div>
            <div>
              <span className="text-[#a7d0bf] block text-[10px] uppercase font-bold tracking-wider">NO2 (Traffic exhaust)</span>
              <span className="text-xl font-bold font-mono text-white">
                {Math.round(todayHour.no2.mean)} <span className="text-xs text-[#a7d0bf] font-normal font-sans">µg/m³</span>
              </span>
            </div>
            <div>
              <span className="text-[#a7d0bf] block text-[10px] uppercase font-bold tracking-wider">Ventilation Capacity</span>
              <span className="text-xl font-bold font-mono text-white">
                {todayHour.physics.ventilation_coefficient.toLocaleString()} <span className="text-xs text-[#a7d0bf] font-normal font-sans">m²/s</span>
              </span>
            </div>
          </div>
        )}
      </div>

      {/* 3-Day Outlook (Single Unified Container) */}
      <div className="space-y-3">
        <h3 className="font-heading font-normal text-base text-white flex items-center gap-1.5">
          <span className="material-symbols-outlined text-emerald-400 text-base">calendar_month</span>
          <span>Next 3 Days Outlook: What to Expect</span>
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-emerald-800/50 bg-[#0a2e21] rounded-2xl border border-emerald-600/40 shadow-lg text-white">
          {days.map((day, idx) => {
            const aqiVal = day.hourData.aqi.mean;
            const cat = day.hourData.category;
            return (
              <div 
                key={idx}
                className="p-5 flex flex-col justify-between space-y-3 text-white"
              >
                <div>
                  <div className="flex items-center justify-between border-b border-emerald-800/40 pb-2 mb-2.5">
                    <span className="font-bold text-white text-xs">{day.label}</span>
                    <span className="text-[11px] text-[#a7d0bf] font-mono">{day.date}</span>
                  </div>

                  <div className="flex items-baseline gap-2 mb-2">
                    <span 
                      className="text-2xl font-bold font-mono"
                      style={{ color: getAQIColor(aqiVal) }}
                    >
                      {Math.round(aqiVal)}
                    </span>
                    <span className={`text-[10px] px-2 py-0.5 rounded font-semibold ${getAQIBadgeClass(cat)}`}>
                      {cat}
                    </span>
                  </div>

                  <p className="text-xs text-white leading-snug font-medium mb-2">
                    "{day.headline}"
                  </p>
                </div>

                <div className="pt-2 border-t border-emerald-800/40 text-[11px] text-slate-200">
                  <strong className="text-amber-300 font-bold block mb-0.5">Recommendation:</strong>
                  {day.advice}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Health & Lifestyle Recommendations Layer (Unboxed Row) */}
      <div className="bg-[#0a2e21] p-6 rounded-2xl border-2 border-emerald-600/40 space-y-4 shadow-xl text-white">
        <h3 className="font-heading font-normal text-base text-white flex items-center gap-1.5">
          <span className="material-symbols-outlined text-rose-400 text-base">favorite</span>
          <span>Health & Daily Lifestyle Guidance</span>
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-emerald-800/40 gap-4 sm:gap-0 pt-1 text-xs">
          <div className="sm:px-4 first:sm:pl-0 last:sm:pr-0 space-y-1.5 text-white">
            <span className="font-bold text-white text-xs flex items-center gap-1">
              <span className="material-symbols-outlined text-sm text-emerald-400">masks</span>
              <span>Mask Mandatory?</span>
            </span>
            <p className="text-slate-200 leading-relaxed">
              <strong className="text-rose-300 font-bold">Yes, N95 / FFP2 mandatory</strong> for any transit exceeding 15 minutes outdoors.
            </p>
          </div>

          <div className="sm:px-4 first:sm:pl-0 last:sm:pr-0 pt-3 sm:pt-0 space-y-1.5 text-white">
            <span className="font-bold text-white text-xs flex items-center gap-1">
              <span className="material-symbols-outlined text-sm text-amber-400">directions_run</span>
              <span>Outdoor Exercise?</span>
            </span>
            <p className="text-slate-200 leading-relaxed">
              <strong className="text-rose-300 font-bold">Avoid morning jogs.</strong> Nocturnal inversion concentrates poison near ground until 11 AM.
            </p>
          </div>

          <div className="sm:px-4 first:sm:pl-0 last:sm:pr-0 pt-3 sm:pt-0 space-y-1.5 text-white">
            <span className="font-bold text-white text-xs flex items-center gap-1">
              <span className="material-symbols-outlined text-sm text-sky-400">window</span>
              <span>Windows Open?</span>
            </span>
            <p className="text-slate-200 leading-relaxed">
              <strong className="text-amber-300 font-bold">Keep windows sealed shut.</strong> Run HEPA air cleaners on medium-high in sleeping quarters.
            </p>
          </div>

          <div className="sm:px-4 first:sm:pl-0 last:sm:pr-0 pt-3 sm:pt-0 space-y-1.5 text-white">
            <span className="font-bold text-white text-xs flex items-center gap-1">
              <span className="material-symbols-outlined text-sm text-emerald-400">family_restroom</span>
              <span>Children & Seniors</span>
            </span>
            <p className="text-slate-200 leading-relaxed">
              Strict indoor stay recommended. Ensure inhalers and bronchodilators are stocked and accessible.
            </p>
          </div>
        </div>
      </div>

      {/* Threshold Alert Notification Simulator */}
      <div className="bg-[#0a2e21] p-6 rounded-2xl border-2 border-emerald-600/40 shadow-xl text-white">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <h4 className="font-heading font-normal text-base text-white flex items-center gap-1.5">
              <span className="material-symbols-outlined text-emerald-400 text-base">notifications</span>
              <span>Check My AQI Threshold</span>
            </h4>
            <p className="text-xs text-[#a7d0bf]">
              See whether air quality near <strong className="text-white font-bold">{currentForecast.station.name}</strong> is forecast to cross your threshold in the next 3 days. Your threshold is remembered on this device; push/SMS alerts are not part of this prototype.
            </p>
          </div>

          <form onSubmit={handleNotifySubmit} className="flex items-center gap-2 w-full sm:w-auto">
            <div className="flex items-center gap-1.5 bg-[#061d15] px-3 py-1.5 rounded-xl border border-emerald-700/60 text-xs">
              <span className="text-[#a7d0bf]">Threshold:</span>
              <input
                type="number"
                min={100}
                max={500}
                step={25}
                value={notifyThreshold}
                onChange={(e) => setNotifyThreshold(Number(e.target.value))}
                className="w-16 bg-[#072118] border border-emerald-600/60 rounded px-1.5 py-0.5 text-center font-mono font-bold text-white focus:outline-none focus:border-white"
              />
              <span className="text-[#a7d0bf]">AQI</span>
            </div>

            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-[#061d15] font-bold text-xs shadow-md transition-all shrink-0 cursor-pointer"
            >
              Check Forecast
            </button>
          </form>
        </div>

        {thresholdCheck && (
          <div className="mt-3 p-3 rounded-xl bg-[#061d15] border border-emerald-500/60 text-emerald-200 text-xs flex items-center gap-2 animate-in fade-in">
            <span className="material-symbols-outlined text-[#16a34a] text-base">check_circle</span>
            <span>{thresholdCheck}</span>
          </div>
        )}
      </div>
    </div>
  );
};
export default PublicView;
