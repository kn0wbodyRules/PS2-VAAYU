import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Alert } from '../types';
import { 
  Flame, 
  Car, 
  Factory, 
  Wind, 
  ChevronUp, 
  ChevronDown,
  Sparkles 
} from 'lucide-react';

interface AlertBannerProps {
  alerts: Alert[];
  onSelectAlert: (alert: Alert) => void;
}

// Stage roman numeral and color mapping
// Stage I = White, Stage II = Yellow, Stage III = Orange, Stage IV = Red
function getStageDetails(grapStage: string) {
  const match = grapStage.match(/(IV|III|II|I)/i);
  const roman = match ? match[1].toUpperCase() : 'IV';

  const subMatch = grapStage.match(/\(([^)]+)\)/);
  const sub = subMatch ? subMatch[1] : (
    roman === 'IV' ? 'Severe+' : 
    roman === 'III' ? 'Severe' : 
    roman === 'II' ? 'Very Poor' : 'Poor'
  );

  let color = 'text-[#ef4444]'; // IV = Red
  let explanation = 'Emergency statutory enforcement. Triggered when forecasted AQI crosses 450+ severe emergency thresholds across the capital.';

  if (roman === 'I') {
    color = 'text-white';
    explanation = 'Stage I Poor Advisory (AQI 201–300). Enforces mechanized road sweeping, heavy water sprinkling along high-density corridors, and dust mitigation.';
  } else if (roman === 'II') {
    color = 'text-[#facc15]'; // II = Yellow
    explanation = 'Stage II Very Poor Advisory (AQI 301–400). Mandates ban on diesel generator sets, enhanced parking tariffs to discourage private vehicle use, and supplementary transit.';
  } else if (roman === 'III') {
    color = 'text-[#f97316]'; // III = Orange
    explanation = 'Stage III Severe Advisory (AQI 401–450). Immediate ban on non-essential construction and demolition, with strict curbs on BS-III petrol & BS-IV diesel vehicles.';
  }

  return { roman, sub, color, explanation };
}

// Minimalist Event Icon & explanation
function getEventDetails(alert: Alert) {
  const text = `${alert.title} ${alert.subtitle} ${alert.causal_drivers?.narrative || ''}`.toLowerCase();
  // classify from the forecast's own drivers when available (the narrative always mentions
  // FIRMS, so keyword matching alone would label every alert as a fire event)
  const d = alert.causal_drivers;
  const fireDriven = d ? d.fire_influence >= 50 : (text.includes('plume') || text.includes('stubble') || text.includes('biomass'));

  if (fireDriven) {
    return {
      type: 'Biomass Burning & Fire Plume',
      Icon: Flame,
      iconColor: 'text-amber-400',
      explanation: 'Upwind agricultural stubble burning plumes coupled with thermal inversion ceilings, causing rapid particulate entrapment downwind.',
    };
  }
  if (text.includes('traffic') || text.includes('vehicular') || text.includes('diesel') || text.includes('transport')) {
    return {
      type: 'Vehicular Emissions',
      Icon: Car,
      iconColor: 'text-blue-400',
      explanation: 'Intense localized transport congestion and high NOx emissions entrapped beneath descending planetary boundary layers.',
    };
  }
  if (text.includes('industrial') || text.includes('factory') || text.includes('chemical') || text.includes('smokestack')) {
    return {
      type: 'Industrial Trapping',
      Icon: Factory,
      iconColor: 'text-purple-400',
      explanation: 'Low-dispersion industrial pocket emissions combining with shallow boundary layer heights, triggering secondary aerosol formation.',
    };
  }
  return {
    type: 'Atmospheric Stagnation',
    Icon: Wind,
    iconColor: 'text-cyan-400',
    explanation: d ? `Surface wind ${d.wind_speed} m/s with inversion index ${d.inversion_index}/100: weak vertical and horizontal dispersion traps local emissions.` : 'Weak wind and a low mixing height preventing vertical and horizontal dispersion.',
  };
}

// Extract time bounds (lower bound - upper bound)
function extractTimeBounds(startTime: string, leadHours?: number): string {
  const matchRange = startTime.match(/(\+\d+h)\s*(?:to|-)\s*(\+\d+h)/i);
  if (matchRange) {
    return `${matchRange[1]} – ${matchRange[2]}`;
  }
  const singleMatch = startTime.match(/(\+\d+h|\d+h)/i);
  if (singleMatch) {
    const val = parseInt(singleMatch[1].replace(/[^\d]/g, ''), 10);
    return `+${val}h – +${val + 4}h`;
  }
  if (leadHours) {
    return `+${Math.max(0, leadHours - 4)}h – +${leadHours}h`;
  }
  return '+32h – +36h';
}

export const AlertBanner: React.FC<AlertBannerProps> = ({ alerts, onSelectAlert }) => {
  if (!alerts || alerts.length === 0) return null;

  const primaryAlert = alerts[0];
  const stageInfo = getStageDetails(primaryAlert.grap_stage);
  const eventInfo = getEventDetails(primaryAlert);
  const timeBounds = extractTimeBounds(primaryAlert.start_time, primaryAlert.lead_time_hours);

  // Dynamic Island States:
  // 'normal' = compact undisturbed capsule pill
  // 'hovered' = expanded hover card cycling 3 sub-views (0: Severity, 1: Event, 2: Onset)
  // 'expanded' = island expands largely in-place (not a pop up!) showing all details + glowing text
  const [islandState, setIslandState] = useState<'normal' | 'hovered' | 'expanded'>('normal');
  const [hoverPart, setHoverPart] = useState<0 | 1 | 2>(0);

  const hoverLeaveTimer = useRef<NodeJS.Timeout | null>(null);
  const lastWheelTime = useRef<number>(0);

  // Clear timers on unmount
  useEffect(() => {
    return () => {
      if (hoverLeaveTimer.current) clearTimeout(hoverLeaveTimer.current);
    };
  }, []);

  const handleMouseEnter = () => {
    if (islandState === 'expanded') return;
    if (hoverLeaveTimer.current) {
      clearTimeout(hoverLeaveTimer.current);
      hoverLeaveTimer.current = null;
    }
    setIslandState('hovered');
  };

  const handleMouseLeave = () => {
    if (islandState === 'expanded') return;
    hoverLeaveTimer.current = setTimeout(() => {
      setIslandState('normal');
    }, 150);
  };

  // Wheel interaction while hovering:
  // Scrolling up or down cycles between:
  // 0: Severity -> 1: Event -> 2: Expected Onset
  const handleWheel = (e: React.WheelEvent) => {
    if (islandState !== 'hovered') return;
    e.stopPropagation();

    const now = Date.now();
    if (now - lastWheelTime.current < 180) return;

    const delta = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;

    if (delta < -8) {
      // Scroll up / swipe: advance to next part (Severity -> Event -> Onset)
      setHoverPart((prev) => ((prev + 1) % 3) as 0 | 1 | 2);
      lastWheelTime.current = now;
    } else if (delta > 8) {
      // Scroll down / swipe: navigate back
      setHoverPart((prev) => (prev === 0 ? 2 : prev - 1) as 0 | 1 | 2);
      lastWheelTime.current = now;
    }
  };

  const handleIslandClick = () => {
    if (islandState !== 'expanded') {
      setIslandState('expanded');
    }
  };

  const handleCloseExpanded = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIslandState('normal');
  };

  const handleOpenAiAgent = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelectAlert(primaryAlert);
  };

  const EventIcon = eventInfo.Icon;

  return (
    <div className="w-full flex justify-center pt-3 pb-2 px-3 sm:px-5 relative z-20 font-sans">
      <motion.div
        layout
        transition={{
          type: 'spring',
          stiffness: 400,
          damping: 32,
          mass: 0.8,
        }}
        animate={{
          backgroundColor: '#000000',
        }}
        style={{ 
          backgroundColor: '#000000',
          color: '#ffffff'
        }}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onWheel={handleWheel}
        onClick={handleIslandClick}
        className={`dynamic-island-black !bg-black bg-black select-none overflow-hidden text-white border border-neutral-800 transition-shadow ${
          islandState === 'normal'
            ? 'rounded-full px-4 py-2 cursor-pointer hover:border-neutral-700'
            : islandState === 'hovered'
            ? 'rounded-2xl p-4 w-[380px] sm:w-[420px] cursor-pointer'
            : 'rounded-3xl p-6 sm:p-8 w-full max-w-5xl cursor-default'
        }`}
      >
        {/* ========================================================= */}
        {/* STAGE 1: Normal Undisturbed Dynamic Island (Pure Black)   */}
        {/* ========================================================= */}
        {islandState === 'normal' && (
          <motion.div
            key="stage-1-normal"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.18 }}
            className="flex items-center gap-3.5 text-white"
          >
            {/* a) Just the Roman numeral in its color */}
            <span className={`font-mono text-base font-black tracking-wider leading-none ${stageInfo.color}`}>
              {stageInfo.roman}
            </span>

            {/* Minimalist dot separator */}
            <span className="w-1 h-1 rounded-full bg-white/40" />

            {/* b) Minimalist icon showing type of event */}
            <EventIcon className={`w-4 h-4 ${eventInfo.iconColor}`} />

            {/* Minimalist dot separator */}
            <span className="w-1 h-1 rounded-full bg-white/40" />

            {/* c) Expected onset lower bound - upper bound */}
            <span className="font-mono text-xs text-white font-semibold tracking-tight">
              {timeBounds}
            </span>
          </motion.div>
        )}

        {/* ========================================================= */}
        {/* STAGE 2: OnHover Expanded Card with Scroll Navigation     */}
        {/* ========================================================= */}
        {islandState === 'hovered' && (
          <motion.div
            key="stage-2-hovered"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.2 }}
            className="flex flex-col text-white"
          >
            {/* Top Bar with Micro Indicator */}
            <div className="flex items-center justify-between pb-2 border-b border-neutral-800 mb-2.5 text-white">
              <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-300">
                {hoverPart === 0 ? '1/3 • Severity Level' : hoverPart === 1 ? '2/3 • Event Type' : '3/3 • Expected Onset'}
              </span>

              {/* Subtle Scroll / Step controls */}
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setHoverPart((prev) => (prev === 0 ? 2 : prev - 1) as 0 | 1 | 2);
                  }}
                  className="p-1 rounded hover:bg-neutral-800 text-neutral-400 hover:text-white transition-colors"
                  title="Previous section"
                >
                  <ChevronUp className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setHoverPart((prev) => ((prev + 1) % 3) as 0 | 1 | 2);
                  }}
                  className="p-1 rounded hover:bg-neutral-800 text-neutral-400 hover:text-white transition-colors"
                  title="Next section"
                >
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Dynamic Sub-Views Carousel with Fluid Spring */}
            <div className="min-h-[100px] flex flex-col justify-center text-white">
              <AnimatePresence mode="wait">
                {hoverPart === 0 && (
                  <motion.div
                    key="hover-part-severity"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.18 }}
                    className="flex flex-col text-white"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className={`font-mono text-3xl font-black leading-none ${stageInfo.color}`}>
                        {stageInfo.roman}
                      </span>
                      <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-white leading-tight">
                            Stage {stageInfo.roman}
                          </span>
                          <span className="text-xs text-neutral-400 font-medium">
                            {stageInfo.sub}
                          </span>
                        </div>
                        <span className="text-[10px] text-neutral-400 font-medium mt-0.5">
                          Peak AQI: {primaryAlert.peak_aqi} • {primaryAlert.region}
                        </span>
                      </div>
                    </div>
                    <p className="text-xs text-neutral-200 mt-2.5 leading-relaxed">
                      {stageInfo.explanation}
                    </p>
                  </motion.div>
                )}

                {hoverPart === 1 && (
                  <motion.div
                    key="hover-part-event"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.18 }}
                    className="flex flex-col text-white"
                  >
                    <div className="flex items-center gap-2.5">
                      <EventIcon className={`w-6 h-6 shrink-0 ${eventInfo.iconColor}`} />
                      <div className="flex flex-col min-w-0">
                        <span className="text-sm font-bold text-white leading-snug line-clamp-1">
                          {primaryAlert.title}
                        </span>
                        <span className="text-[10px] text-neutral-300 font-medium">
                          {eventInfo.type}
                        </span>
                      </div>
                    </div>
                    <p className="text-xs text-neutral-200 mt-2.5 leading-relaxed line-clamp-2">
                      {eventInfo.explanation}
                    </p>
                  </motion.div>
                )}

                {hoverPart === 2 && (
                  <motion.div
                    key="hover-part-onset"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.18 }}
                    className="flex flex-col text-white"
                  >
                    <div className="flex items-baseline gap-2">
                      <span className="font-mono text-sm font-bold text-white">
                        {timeBounds}
                      </span>
                      <span className="text-xs text-neutral-300 font-medium">
                        +{primaryAlert.lead_time_hours}h Lead Time
                      </span>
                    </div>
                    <p className="text-xs text-neutral-200 mt-2.5 leading-relaxed line-clamp-2">
                      {primaryAlert.subtitle}
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Bottom Pagination Dots & Click-to-Expand Cue */}
            <div className="flex items-center justify-between pt-2.5 mt-2 border-t border-neutral-800 text-[10px] text-neutral-400">
              <span className="italic text-neutral-400">Scroll up/down or click dots</span>
              <div className="flex items-center gap-1.5">
                {[0, 1, 2].map((idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setHoverPart(idx as 0 | 1 | 2);
                    }}
                    className={`h-1.5 rounded-full transition-all duration-200 ${
                      hoverPart === idx ? 'w-5 bg-white shadow-[0_0_8px_#ffffff]' : 'w-1.5 bg-neutral-700 hover:bg-neutral-500'
                    }`}
                    aria-label={`Jump to stage ${idx + 1}`}
                  />
                ))}
              </div>
            </div>
          </motion.div>
        )}

        {/* ========================================================= */}
        {/* STAGE 3: OnClick In-Place Expanded Island (NOT A POP UP)  */}
        {/* ========================================================= */}
        {islandState === 'expanded' && (
          <motion.div
            key="stage-3-expanded"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.22 }}
            className="flex flex-col text-white"
          >
            {/* Header Bar with Title and Collapse Button */}
            <div className="flex items-center justify-between pb-4 border-b border-neutral-900 mb-6">
              <div className="flex items-center gap-3">
                <img
                  src="/aeris-logo-transparent.png"
                  alt="AERIS"
                  className="h-6 w-auto object-contain"
                />
                <span className="text-xs font-semibold text-neutral-400 uppercase tracking-widest pl-2 border-l border-neutral-800">
                  Atmospheric Alert Island
                </span>
              </div>

              <button
                type="button"
                onClick={handleCloseExpanded}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-neutral-900/60 border border-white/10 hover:bg-neutral-800 text-neutral-300 hover:text-white transition-colors cursor-pointer text-xs font-medium"
                title="Collapse Island"
              >
                <span>Collapse</span>
                <ChevronUp className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* 3 Coordinated Columns (Pure Layout, Zero Inner Boxes) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8 md:divide-x md:divide-neutral-900 text-white">
              {/* Column 1: Severity Details */}
              <div className="flex flex-col justify-between space-y-4">
                <div>
                  <span className="text-[11px] font-bold tracking-widest uppercase text-neutral-500 block">
                    PART 1 • SEVERITY LEVEL
                  </span>
                  <div className="flex items-center gap-3.5 mt-2">
                    <span className={`font-mono text-5xl font-black leading-none ${stageInfo.color}`}>
                      {stageInfo.roman}
                    </span>
                    <div className="flex flex-col">
                      <span className="text-lg font-bold text-white leading-tight">
                        Stage {stageInfo.roman}
                      </span>
                      <span className="text-xs text-neutral-400 font-medium">
                        {stageInfo.sub}
                      </span>
                    </div>
                  </div>

                  <div className="mt-4 flex items-baseline gap-2">
                    <span className="text-xs text-neutral-400">Forecast Peak AQI:</span>
                    <span className="font-numbers text-2xl font-black text-rose-400">
                      {primaryAlert.peak_aqi}
                    </span>
                    <span className="text-[11px] text-rose-300/80 font-medium">(Hazardous)</span>
                  </div>

                  <p className="text-xs text-neutral-300 mt-2.5 leading-relaxed">
                    {stageInfo.explanation}
                  </p>
                </div>

                <div className="text-[11px] text-neutral-400 pt-3 border-t border-neutral-900">
                  Target Region: <span className="text-white font-medium">{primaryAlert.region}</span>
                </div>
              </div>

              {/* Column 2: Event Details */}
              <div className="flex flex-col justify-between space-y-4 md:pl-6 sm:md:pl-8">
                <div>
                  <span className="text-[11px] font-bold tracking-widest uppercase text-neutral-500 block">
                    PART 2 • EVENT TYPE
                  </span>
                  <div className="flex items-center gap-3 mt-2">
                    {/* Fire / Event icon alone with NO box */}
                    <EventIcon className={`w-7 h-7 shrink-0 ${eventInfo.iconColor}`} />
                    <div className="flex flex-col min-w-0">
                      <h4 className="text-base font-bold text-white leading-snug">
                        {primaryAlert.title}
                      </h4>
                      <span className="text-xs text-neutral-400 font-medium">
                        {eventInfo.type}
                      </span>
                    </div>
                  </div>

                  {/* Causal Physics Micro-Metrics without inner boxes */}
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 mt-4 text-xs">
                    <div>
                      <span className="text-[10px] text-neutral-500 uppercase tracking-wider block">PBLH Collapse</span>
                      <span className="font-mono text-sm font-bold text-white">
                        -{primaryAlert.causal_drivers.pblh_drop}m
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-neutral-500 uppercase tracking-wider block">Surface Wind</span>
                      <span className="font-mono text-sm font-bold text-white">
                        {primaryAlert.causal_drivers.wind_speed} m/s
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-neutral-500 uppercase tracking-wider block">Inversion Index</span>
                      <span className="font-mono text-sm font-bold text-amber-300">
                        {primaryAlert.causal_drivers.inversion_index}/100
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-neutral-500 uppercase tracking-wider block">Fire Influence</span>
                      <span className="font-mono text-sm font-bold text-orange-400">
                        {primaryAlert.causal_drivers.fire_influence}%
                      </span>
                    </div>
                  </div>

                  <p className="text-xs text-neutral-300 mt-3 leading-relaxed line-clamp-3">
                    {primaryAlert.causal_drivers.narrative}
                  </p>
                </div>

                <div className="text-[11px] text-neutral-400 pt-3 border-t border-neutral-900 truncate">
                  Hotspots: <span className="text-white font-medium">{primaryAlert.causal_drivers.accumulation_stations.join(', ')}</span>
                </div>
              </div>

              {/* Column 3: Expected Onset & Impact */}
              <div className="flex flex-col justify-between space-y-4 md:pl-6 sm:md:pl-8">
                <div>
                  <span className="text-[11px] font-bold tracking-widest uppercase text-neutral-500 block">
                    PART 3 • EXPECTED ONSET & IMPACT
                  </span>
                  <div className="mt-2 flex items-baseline justify-between">
                    <span className="text-xs text-neutral-400 uppercase tracking-wider">Onset Window:</span>
                    <span className="font-mono text-sm font-bold text-white">
                      {timeBounds}
                    </span>
                  </div>

                  <div className="mt-1 text-xs text-neutral-400">
                    Lead Time: <span className="font-bold text-white">+{primaryAlert.lead_time_hours} Hours Ahead</span>
                  </div>

                  <p className="text-xs text-neutral-300 mt-2.5 leading-relaxed">
                    {primaryAlert.subtitle}
                  </p>

                  <div className="mt-3 space-y-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 block">
                      Recommended Directives
                    </span>
                    {primaryAlert.action_recommendations.slice(0, 2).map((rec, i) => (
                      <div key={i} className="text-xs text-neutral-300 flex items-start gap-1.5 leading-snug">
                        <span className="text-emerald-400 font-bold shrink-0">•</span>
                        <span>{rec}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="text-[11px] text-neutral-400 pt-3 border-t border-neutral-900">
                  Status: <span className="text-neutral-200">Enforced 24h Prior</span>
                </div>
              </div>
            </div>

            {/* ========================================================= */}
            {/* Bottom: Dedicated AI Icon + VT323 Font, completely unboxed */}
            {/* ========================================================= */}
            <div className="mt-6 pt-4 border-t border-neutral-900 flex items-center justify-center">
              <button
                type="button"
                onClick={handleOpenAiAgent}
                className="cursor-pointer py-1"
                title="Ask AERIS AI Agent"
              >
                <span className="font-vt323 text-lg sm:text-xl tracking-wider animate-disco-green">
                  Wanna know more? Ask Me!
                </span>
              </button>
            </div>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
};

export default AlertBanner;
