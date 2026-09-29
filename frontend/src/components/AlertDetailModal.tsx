import React, { useState } from 'react';
import { Alert } from '../types';
import TabsDemo from '@/components/ui/tabs-10';
import { AgentAvatar } from '@/components/ui/agent-avatar';
import { Bot, FileText, X } from 'lucide-react';

interface AlertDetailModalProps {
  alert: Alert | null;
  onClose: () => void;
  initialTab?: 'why' | 'chat';
}

export const AlertDetailModal: React.FC<AlertDetailModalProps> = ({ 
  alert, 
  onClose,
  initialTab = 'chat'
}) => {
  if (!alert) return null;

  const { causal_drivers } = alert;
  const [activeTab, setActiveTab] = useState<'why' | 'chat'>(initialTab);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200 font-sans">
      <div 
        className="bg-[#0a2e21] border-2 border-emerald-600/40 rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden text-white"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with Title and Mode Tabs */}
        <div className="px-5 py-3.5 border-b border-[#134e38] bg-[#072118] flex items-center justify-between gap-3 shrink-0 text-white">
          {/* Left: Just Aeris with Disco Avatar in the AI Font (VT323) */}
          <div className="flex items-center gap-3">
            <AgentAvatar name="aeris" size={40} pulse showBadge={false} />
            <span className="font-vt323 text-3xl sm:text-4xl text-white tracking-wider leading-none select-none">
              Aeris
            </span>
          </div>

          {/* Right: Mode Switcher (AI Chatbot & Expanding Notepad Evidence Report) + Close Button */}
          <div className="flex items-center gap-2">
            <div className="flex items-center bg-[#061d15] border border-emerald-700/60 rounded-xl p-1 text-xs">
              <button
                type="button"
                onClick={() => setActiveTab('chat')}
                className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  activeTab === 'chat'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-emerald-200 hover:text-white hover:bg-[#0e3d2c]'
                }`}
              >
                <Bot className="w-3.5 h-3.5 text-emerald-300" />
                <span className="text-xs font-sans">AI Chatbot</span>
              </button>

              {/* Notepad Icon Button: Expands on hover to reveal name (strictly in font-sans, NOT AI font) */}
              <button
                type="button"
                onClick={() => setActiveTab('why')}
                title="Evidence-Based Report"
                className={`group flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition-all duration-300 cursor-pointer overflow-hidden ${
                  activeTab === 'why'
                    ? 'bg-emerald-600 text-white shadow-sm ring-1 ring-emerald-400/50'
                    : 'text-emerald-200 hover:text-white hover:bg-[#0e3d2c]'
                }`}
              >
                <FileText className="w-3.5 h-3.5 shrink-0 text-emerald-300 group-hover:text-white transition-colors" />
                <span className="max-w-0 opacity-0 group-hover:max-w-xs group-hover:opacity-100 transition-all duration-300 ease-out whitespace-nowrap text-xs font-bold font-sans overflow-hidden">
                  Evidence Report
                </span>
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl bg-[#0e3d2c] text-emerald-100 hover:text-white hover:bg-[#14533c] border border-emerald-600/50 transition-colors cursor-pointer flex items-center justify-center"
              title="Close Dialog"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto flex flex-col p-4 sm:p-6 bg-[#0a2e21] text-white">
          {/* TAB 1: AI CHATBOT INTERFACE */}
          {activeTab === 'chat' && (
            <div className="w-full flex justify-center py-1">
              <TabsDemo alert={alert} className="w-full" />
            </div>
          )}

          {/* TAB 2: ALL THE INFORMATION WITHIN "THE WHY" */}
          {activeTab === 'why' && (
            <div className="flex-1 overflow-y-auto space-y-4 text-xs font-sans">
              {/* Executive Diagnostic Summary */}
              <div className="space-y-1 pb-3 border-b border-emerald-800/40 text-white">
                <h3 className="font-bold text-emerald-400 uppercase tracking-wider text-xs">
                  Executive Physical & GNN Residual Explanation
                </h3>
                <p className="text-slate-200 leading-relaxed text-xs">
                  {causal_drivers.narrative}
                </p>
              </div>

              {/* Coupled Physics Feature Diagnostics */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 py-2 border-b border-emerald-800/40">
                <div>
                  <span className="text-[#a7d0bf] block text-[10px] font-bold uppercase tracking-wider">PBL Height Drop</span>
                  <div className="text-2xl font-numbers text-rose-400 font-bold mt-0.5">
                    -{causal_drivers.pblh_drop}m
                  </div>
                  <p className="text-[10px] text-[#a7d0bf] mt-0.5">
                    Trapping below 220m ceiling
                  </p>
                </div>

                <div>
                  <span className="text-[#a7d0bf] block text-[10px] font-bold uppercase tracking-wider">Surface Wind</span>
                  <div className="text-2xl font-numbers text-amber-400 font-bold mt-0.5">
                    {causal_drivers.wind_speed} m/s
                  </div>
                  <p className="text-[10px] text-[#a7d0bf] mt-0.5">
                    Calm stagnation collapse
                  </p>
                </div>

                <div>
                  <span className="text-[#a7d0bf] block text-[10px] font-bold uppercase tracking-wider">Inversion Index</span>
                  <div className="text-2xl font-numbers text-emerald-400 font-bold mt-0.5">
                    {causal_drivers.inversion_index}/100
                  </div>
                  <p className="text-[10px] text-[#a7d0bf] mt-0.5">
                    Thermal ceiling cap
                  </p>
                </div>

                <div>
                  <span className="text-[#a7d0bf] block text-[10px] font-bold uppercase tracking-wider">Upwind Fire Flux</span>
                  <div className="text-2xl font-numbers text-orange-400 font-bold mt-0.5">
                    {causal_drivers.fire_influence}/100
                  </div>
                  <p className="text-[10px] text-[#a7d0bf] mt-0.5">
                    NASA FIRMS stubble flux
                  </p>
                </div>
              </div>

              {/* Chemical & Meteorological Mechanism Breakdown */}
              <div className="space-y-2 py-2 border-b border-emerald-800/40">
                <h4 className="font-bold text-white text-xs uppercase tracking-wider">Coupled Model Inferences</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <span className="font-bold text-emerald-300 block text-xs mb-1">Chemical Head:</span>
                    <p className="text-slate-200 leading-normal">
                      {causal_drivers.chemical_factor}
                    </p>
                  </div>
                  <div>
                    <span className="font-bold text-amber-300 block text-xs mb-1">Meteorology Head:</span>
                    <p className="text-slate-200 leading-normal">
                      {causal_drivers.meteorological_factor}
                    </p>
                  </div>
                </div>
              </div>

              {/* Highest Accumulation Stations */}
              <div className="py-2 border-b border-emerald-800/40">
                <span className="font-bold text-[#a7d0bf] block text-[10px] uppercase tracking-wider mb-2">
                  Focal Entrapment Monitoring Stations (Highest GNN Node Weight):
                </span>
                <div className="flex flex-wrap gap-2">
                  {causal_drivers.accumulation_stations.map((st) => (
                    <span 
                      key={st}
                      className="px-2.5 py-1 rounded-lg bg-[#0e3d2c] text-emerald-200 text-xs font-mono font-bold"
                    >
                      {st}
                    </span>
                  ))}
                </div>
              </div>

              {/* Actionable Regulatory Mandate */}
              <div className="pt-2 space-y-1.5 text-rose-200">
                <h4 className="font-bold text-rose-300 text-xs uppercase tracking-wider">
                  Required Pre-emptive Regulatory Interventions:
                </h4>
                <ul className="space-y-1 text-slate-200 list-disc list-inside">
                  {alert.action_recommendations.map((rec, i) => (
                    <li key={i} className="leading-relaxed">
                      {rec}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
export default AlertDetailModal;
