"use client";

import React, { useEffect, useState, useRef } from "react";
import GlyphPortal from "@/components/ui/glyph-portal";
import { ArrowDown } from "lucide-react";

const settings = { word: "AERIS", scrollLength: 2.4, interactive: true, annotations: false };
const family = '"Newsreader", Georgia, serif';

export function Demo(props: Partial<typeof settings> & { onEnterDashboard?: () => void }) {
  const s = { ...settings, ...props };
  const [face, setFace] = useState<string | null>(null);
  const enteredRef = useRef(false);

  useEffect(() => {
    let settled = false;
    const finish = (value: string) => { if (!settled) { settled = true; setFace(value); } };
    // Load Newsreader from Google Fonts for AERIS glyph portal
    if (document.fonts && document.fonts.load) {
      document.fonts.load('1em Newsreader').then(() => finish(family)).catch(() => finish(family));
    }
    const timeout = window.setTimeout(() => finish(family), 600);
    return () => { settled = true; clearTimeout(timeout); };
  }, []);

  const handleProgress = (progress: number) => {
    // When the scroll animation zooms all the way through the letter into the portal, directly enter dashboard
    if (progress >= 0.85 && !enteredRef.current) {
      enteredRef.current = true;
      props.onEnterDashboard?.();
    } else if (progress < 0.2) {
      enteredRef.current = false;
    }
  };

  const handleEnter = () => {
    if (!enteredRef.current) {
      enteredRef.current = true;
      props.onEnterDashboard?.();
    }
  };

  return (
    <div data-demo-scroll data-slipstream-demo tabIndex={0} role="region" aria-label="AERIS. Scroll to step inside."
      style={{ width: "100%", height: "min(780px, 100svh)", overflowY: "auto", background: "#ffffff", containerType: "inline-size", fontFamily: face ?? "Arial, sans-serif" }}>
      <style>{`
        [data-slipstream-demo] [data-gp-caption]{inset:calc(var(--gp-word-bottom,50%) + 82px) 24px auto;justify-content:center;}
        [data-slipstream-demo] [data-gp-hint]{display:none;}
        [data-slipstream-demo] [data-gp-enter]{min-height:46px;padding:0 22px;gap:20px;background:#0b3b2a;border:1px solid #082d22;border-radius:10px;color:#ffffff;font-size:13px;font-weight:600;box-shadow:0 2px 4px rgba(11,59,42,0.18);transition:all .18s;}
        [data-slipstream-demo] [data-gp-enter]:hover{background:#14573f;box-shadow:0 4px 12px rgba(11,59,42,0.25);}
        [data-slipstream-demo] [data-gp-enter]:focus-visible{outline:2px solid #176247;outline-offset:4px;}
        [data-slipstream-demo] [data-gp-touch-picker]{top:auto;bottom:18px;left:50%;}
        [data-slipstream-demo] [data-gp-select]{border-color:transparent;border-radius:8px;font-size:12px;color:#14573f;}
        [data-sublime-header]{position:absolute;inset:clamp(20px,4.5cqw,42px) clamp(20px,5cqw,56px) auto;display:flex;align-items:center;justify-content:space-between;gap:20px;}
        [data-sublime-logo]{font-size:24px;font-family:'Newsreader', serif;letter-spacing:0.02em;color:#0b3b2a;display:flex;align-items:center;gap:8px;}
        [data-sublime-category]{font-size:12px;line-height:1.5;color:#2e7d5a;font-weight:500;}
        [data-sublime-eyebrow]{position:absolute;inset:auto 24px calc(100% - var(--gp-word-top,35%) + 28px);margin:0;text-align:center;font-size:13px;font-weight:500;line-height:1.5;letter-spacing:.02em;color:#2e7d5a;}
        [data-sublime-support]{position:absolute;inset:calc(var(--gp-word-bottom,50%) + 28px) 24px auto;margin:0;text-align:center;font-size:16px;font-weight:500;line-height:1.5;color:#0b3b2a;}
        [data-sublime-scroll]{position:absolute;inset:auto 24px 6%;text-align:center;color:#4a7260;font-size:12px;letter-spacing:.02em;display:flex;align-items:center;justify-content:center;gap:6px;}
        @media(any-pointer:coarse){[data-sublime-scroll]{bottom:12%;}}
        @container(max-width:450px){[data-sublime-category]{max-width:14ch;text-align:right;}[data-sublime-eyebrow]{font-size:12px;}[data-sublime-support]{font-size:14px;}[data-slipstream-demo] [data-gp-caption]{top:calc(var(--gp-word-bottom,50%) + 76px);}}
        @container(max-height:479px){[data-sublime-header]{top:18px;}[data-sublime-support]{top:calc(var(--gp-word-bottom,50%) + 16px);}[data-slipstream-demo] [data-gp-caption]{top:calc(var(--gp-word-bottom,50%) + 60px);}[data-sublime-scroll]{display:none;}}
        [data-slipstream-demo] [data-gp-content]{padding:0;min-height:0;}
      `}</style>
      {face ? (
        <GlyphPortal
          word={s.word}
          fontFamily={face}
          fontWeight={700}
          style={{ fontFamily: face }}
          scrollLength={s.scrollLength}
          interactive={s.interactive}
          annotations={s.annotations}
          enterLabel="Enter AERIS Dashboard"
          onProgress={handleProgress}
          onEnter={handleEnter}
          background={
            <div className="absolute inset-0 overflow-hidden">
              <img
                src="https://images.unsplash.com/photo-1511497584788-87676104235f?auto=format&fit=crop&w=1920&q=80"
                alt="AERIS atmospheric canopy"
                className="w-full h-full object-cover opacity-35 mix-blend-overlay"
              />
              <div 
                className="absolute inset-0"
                style={{
                  background: "radial-gradient(circle at 18% 8%, rgba(68,125,98,.82), transparent 38%), radial-gradient(circle at 82% 20%, rgba(251,251,250,.18), transparent 30%), radial-gradient(circle at 48% 78%, rgba(9,48,35,.75), transparent 46%), linear-gradient(135deg,#0b3b2a 0%,#14573f 48%,#082d22 100%)"
                }}
              />
            </div>
          }
          front={
            <>
              <div data-sublime-header>
                <span data-sublime-logo>
                  AERIS
                </span>
                <span data-sublime-category>Delhi-NCR Atmospheric Forecasting</span>
              </div>
              <p data-sublime-eyebrow>Next-Gen Atmospheric Quality Forecasting</p>
              <p data-sublime-support>Real-Time Air Quality Early Warning System</p>
              <span data-sublime-scroll>
                <ArrowDown className="w-3.5 h-3.5 animate-bounce" />
                Scroll down to step inside AERIS
              </span>
            </>
          }
        >
          {/* Subtle transition indicator while moving into the main dashboard */}
          <div className="flex flex-col items-center justify-center py-16 text-center text-white">
            <div className="w-7 h-7 rounded-full border-2 border-white/40 border-t-white animate-spin mb-2.5" />
            <span className="text-xs font-medium text-emerald-100">Entering AERIS Dashboard...</span>
          </div>
        </GlyphPortal>
      ) : (
        <div role="status" style={{ height: "100%", display: "grid", placeItems: "center", color: "#0b3b2a", fontSize: 13, fontWeight: 500 }}>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 border-2 border-[#0b3b2a] border-t-transparent rounded-full animate-spin" />
            Loading AERIS typography & engine…
          </div>
        </div>
      )}
    </div>
  );
}

export default Demo;
