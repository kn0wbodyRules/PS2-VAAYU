"use client";

import React, { useRef, useState } from "react";
import { Slider } from "@/components/ui/slider-06-utils/slider";
import NumberFlow from "@number-flow/react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/slider-06-utils/button";

const MIN = 0;
const MAX = 1000;
const STEP = 10;
const STEPS = 5;

const LABELS: number[] = [];
for (let i = 0; i < STEPS; i++) {
  const rawVal = MIN + (i * (MAX - MIN)) / (STEPS - 1);
  const roundedVal = Math.round((rawVal - MIN) / STEP) * STEP + MIN;
  if (!LABELS.includes(roundedVal)) LABELS.push(roundedVal);
}

export default function Slider06() {
  const defaultLow = Math.max(MIN, Math.min(MAX, Math.round((MIN + (MAX - MIN) * 0.15) / STEP) * STEP));
  const defaultHigh = Math.max(MIN, Math.min(MAX, Math.round((MIN + (MAX - MIN) * 0.65) / STEP) * STEP));
  const [range, setRange] = useState<number[]>([defaultLow, defaultHigh]);
  const [preview, setPreview] = useState<number | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const [low, high] = range;
  const isDefault = low === MIN && high === MAX;

  const toPct = (v: number) => ((v - MIN) / (MAX - MIN)) * 100;

  const handleMouseMove = (e: React.MouseEvent) => {
    const rect = rootRef.current?.getBoundingClientRect();
    if (!rect) return;
    const raw = ((e.clientX - rect.left) / rect.width) * (MAX - MIN) + MIN;
    setPreview(Math.max(MIN, Math.min(MAX, Math.round((raw - MIN) / STEP) * STEP + MIN)));
  };

  const lowPct = toPct(low);
  const highPct = toPct(high);
  const previewPct = preview !== null ? toPct(preview) : null;

  let ghostLeft = 0;
  let ghostWidth = 0;
  if (previewPct !== null) {
    if (previewPct < lowPct) {
      ghostLeft = previewPct;
      ghostWidth = lowPct - previewPct;
    } else if (previewPct > highPct) {
      ghostLeft = highPct;
      ghostWidth = previewPct - highPct;
    }
  }

  return (
    <div className="w-full max-w-sm mx-auto space-y-5">
      {/* Header — label + price + clear */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-neutral-400 uppercase tracking-wider mb-1">
            AQI Range
          </p>
          <div className="flex items-baseline gap-1.5">
            <span className="text-xl font-bold tabular-nums text-white font-mono">
              <NumberFlow value={low} />
            </span>
            <span className="text-neutral-500">–</span>
            <span className="text-xl font-bold tabular-nums text-white font-mono">
              <NumberFlow value={high} />
            </span>
            <span className="text-xs text-neutral-500 ml-1">AQI</span>
          </div>
        </div>

        <Button
          variant="outline"
          size="xs"
          onClick={() => setRange([MIN, MAX])}
          disabled={isDefault}
          className="cursor-pointer mt-1"
        >
          <X className="size-3" />
          Clear
        </Button>
      </div>

      <div className="space-y-2">
        <div
          ref={rootRef}
          className="relative w-full"
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setPreview(null)}
        >
          <Slider
            value={range}
            onValueChange={(val) => setRange(Array.isArray(val) ? val : [val])}
            min={MIN}
            max={MAX}
            step={STEP}
            className="**:[[role=slider]]:transition-transform **:[[role=slider]]:hover:scale-125 **:data-[slot='slider-track']:h-2! **:data-[slot='slider-thumb']:size-5! **:data-[slot='slider-thumb']:border-2! **:data-[slot='slider-thumb']:border-emerald-400! **:data-[slot='slider-thumb']:bg-[#0a2e21]! **:data-[slot='slider-thumb']:shadow-none **:data-[slot='slider-thumb']:z-2"
          />

          {previewPct !== null && ghostWidth > 0 && (
            <div
              className="pointer-events-none absolute top-1/2 h-2 -translate-y-1/2 rounded-full bg-emerald-500/25 transition-[left,width] duration-75 z-1"
              style={{ left: `${ghostLeft}%`, width: `${ghostWidth}%` }}
            />
          )}
        </div>

        {/* Labels */}
        <div className="flex justify-between text-[11px] font-medium text-neutral-600 select-none font-mono">
          {LABELS.map((val) => (
            <span key={val}>{val.toLocaleString()}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
