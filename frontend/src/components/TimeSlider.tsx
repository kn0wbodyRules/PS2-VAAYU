"use client";

import React, { useEffect, useRef, useState } from 'react';
import * as SliderPrimitive from '@radix-ui/react-slider';
import NumberFlow from '@number-flow/react';
import { Play, Pause, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TimeSliderProps {
  currentHour: number;
  onHourChange: (hour: number) => void;
  maxHours?: number;
  /** half-width of the empirical 10-90% PM2.5 error band at this hour (µg/m³), from the API */
  spread?: number | null;
}

const MILESTONES = [0, 12, 24, 36, 48, 60, 72];

export const TimeSlider: React.FC<TimeSliderProps> = ({
  currentHour,
  onHourChange,
  maxHours = 72,
  spread = null,
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [preview, setPreview] = useState<number | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    if (isPlaying) {
      interval = setInterval(() => {
        onHourChange(currentHour >= maxHours ? 0 : currentHour + 1);
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isPlaying, currentHour, maxHours, onHourChange]);

  const toPct = (v: number) => Math.max(0, Math.min(100, (v / maxHours) * 100));

  const handleMouseMove = (e: React.MouseEvent) => {
    const rect = rootRef.current?.getBoundingClientRect();
    if (!rect) return;
    const raw = ((e.clientX - rect.left) / rect.width) * maxHours;
    setPreview(Math.max(0, Math.min(maxHours, Math.round(raw))));
  };

  const currentPct = toPct(currentHour);
  const previewPct = preview !== null ? toPct(preview) : null;

  let ghostLeft = 0;
  let ghostWidth = 0;
  if (previewPct !== null) {
    if (previewPct < currentPct) {
      ghostLeft = previewPct;
      ghostWidth = currentPct - previewPct;
    } else if (previewPct > currentPct) {
      ghostLeft = currentPct;
      ghostWidth = previewPct - currentPct;
    }
  }

  const uncertaintyWidth = spread === null || spread === undefined ? null : Math.round(spread);

  return (
    <div className="bg-[#0a2e21] border border-emerald-600/40 rounded-2xl p-5 shadow-lg text-white font-sans space-y-4">
      {/* Header — label + animated hour + playback & live reset */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold text-[#a7d0bf] uppercase tracking-wider mb-1">
            Forecast Horizon
          </p>
          <div className="flex items-baseline gap-2.5 flex-wrap">
            <div className="text-2xl sm:text-3xl font-bold font-numbers tracking-tight text-white flex items-baseline">
              {currentHour === 0 ? (
                <span className="text-[#34d399]">Forecast start</span>
              ) : (
                <>
                  <span className="text-[#34d399]">+</span>
                  <NumberFlow value={currentHour} />
                  <span className="text-sm font-sans font-normal text-emerald-300 ml-0.5">h</span>
                </>
              )}
            </div>

            <span className="text-xs font-mono text-emerald-400/80">
              {uncertaintyWidth === null ? '(observed)' : `(±${uncertaintyWidth} µg/m³ spread, 10–90% test-set band)`}
            </span>
          </div>
        </div>

        {/* Action Buttons: Play/Pause & Replay */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsPlaying(!isPlaying)}
            className={`h-9 w-9 inline-flex items-center justify-center rounded-xl border transition-colors cursor-pointer ${
              isPlaying
                ? 'border-amber-500/70 text-amber-300 bg-amber-950/40 hover:bg-amber-900/40'
                : 'border-emerald-600/50 text-[#a7d0bf] bg-emerald-950/30 hover:text-white hover:border-emerald-400'
            }`}
            title={isPlaying ? 'Pause timelapse' : 'Play timelapse'}
            aria-label={isPlaying ? 'Pause timelapse' : 'Play timelapse'}
          >
            {isPlaying ? (
              <Pause className="w-4 h-4 text-amber-400 fill-amber-400/30" />
            ) : (
              <Play className="w-4 h-4 text-emerald-400 fill-emerald-400/30 ml-0.5" />
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              setIsPlaying(false);
              onHourChange(0);
            }}
            disabled={currentHour === 0}
            className="h-9 w-9 inline-flex items-center justify-center rounded-xl border border-emerald-800/50 text-[#a7d0bf] bg-transparent hover:text-white hover:border-emerald-600 transition-colors disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
            title="Replay (Reset to 0h)"
            aria-label="Replay (Reset to 0h)"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Slider Track with Interactive Ghost Preview */}
      <div className="space-y-2 pt-1">
        <div
          ref={rootRef}
          className="relative w-full py-1.5 cursor-pointer"
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setPreview(null)}
        >
          <SliderPrimitive.Root
            value={[currentHour]}
            onValueChange={(val) => onHourChange(val[0])}
            min={0}
            max={maxHours}
            step={1}
            className={cn(
              "relative flex w-full touch-none select-none items-center",
            )}
          >
            <SliderPrimitive.Track className="relative h-2 w-full grow overflow-hidden rounded-full bg-[#061d15] border border-emerald-800/40">
              <SliderPrimitive.Range className="absolute h-full bg-[#34d399]" />
            </SliderPrimitive.Track>

            <SliderPrimitive.Thumb
              className="block h-5 w-5 rounded-full border-2 border-[#34d399] bg-[#061d15] shadow-md ring-offset-background transition-transform hover:scale-125 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 cursor-grab active:cursor-grabbing z-10"
              aria-label="Forecast hour"
            />
          </SliderPrimitive.Root>

          {/* Interactive Ghost Bar on Hover */}
          {previewPct !== null && ghostWidth > 0 && (
            <div
              className="pointer-events-none absolute top-1/2 h-2 -translate-y-1/2 rounded-full bg-emerald-400/30 transition-[left,width] duration-75 z-0"
              style={{ left: `${ghostLeft}%`, width: `${ghostWidth}%` }}
            />
          )}

          {/* Hover Tooltip Pill */}
          {preview !== null && preview !== currentHour && (
            <div
              className="pointer-events-none absolute -top-5 -translate-x-1/2 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-[#061d15] text-[#34d399] border border-emerald-700/60 shadow-md transition-[left] duration-75 z-20"
              style={{ left: `${previewPct}%` }}
            >
              {preview === 0 ? 'Now' : `+${preview}h`}
            </div>
          )}
        </div>

        {/* Milestone Labels — Clean text without pill boxes */}
        <div className="flex justify-between text-[11px] font-medium text-[#a7d0bf]/70 select-none font-mono">
          {MILESTONES.map((val) => {
            const isSelected = currentHour === val;
            return (
              <button
                key={val}
                type="button"
                onClick={() => onHourChange(val)}
                className={`hover:text-white transition-colors cursor-pointer ${
                  isSelected ? 'text-[#34d399] font-bold' : ''
                }`}
              >
                {val === 0 ? 'Now' : `+${val}h`}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
