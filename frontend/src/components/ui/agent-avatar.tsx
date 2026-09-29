"use client";

import React, { useMemo } from "react";
import { cn } from "@/lib/utils";

// Exact 6x6 pixel color matrix extracted directly from the "researcher" agent avatar
export const RESEARCHER_MATRIX_6X6: string[][] = [
  ["#12e848", "#12e848", "#05821f", "#046551", "#6af7f9", "#6af7f9"],
  ["#13ab3b", "#059c7f", "#06c3c7", "#45f967", "#04861e", "#20edf0"],
  ["#046364", "#059b9e", "#059074", "#2bf5f9", "#06bd99", "#06bcbf"],
  ["#16f741", "#059c7e", "#32f7d0", "#bbfdc7", "#cdfcd7", "#047476"],
  ["#10987e", "#037679", "#036315", "#07d32d", "#3bf6f9", "#47f6fa"],
  ["#0fa538", "#0fa538", "#79fbe0", "#07bc2a", "#33f5f9", "#33f5f9"],
];

const PALETTES: Record<string, string[]> = {
  researcher: [
    "#12e848", "#05821f", "#046551", "#6af7f9", "#13ab3b", "#059c7f",
    "#06c3c7", "#45f967", "#04861e", "#20edf0", "#046364", "#059b9e",
    "#059074", "#2bf5f9", "#06bd99", "#06bcbf", "#16f741", "#32f7d0",
    "#bbfdc7", "#cdfcd7", "#047476", "#10987e", "#07d32d", "#3bf6f9",
    "#47f6fa", "#0fa538", "#79fbe0", "#07bc2a", "#33f5f9"
  ],
  "code-reviewer": [
    "#d946ef", "#c026d3", "#a21caf", "#701a75", "#f43f5e", "#be123c",
    "#e879f9", "#86198f", "#f0abfc", "#db2777", "#9d174d", "#f472b6"
  ],
  planner: [
    "#eab308", "#ca8a04", "#a16207", "#713f12", "#facc15", "#fde047",
    "#84cc16", "#65a30d", "#4d7c0f", "#fef08a", "#d97706", "#b45309"
  ],
  "test-runner": [
    "#a855f7", "#9333ea", "#7e22ce", "#581c87", "#c084fc", "#d8b4fe",
    "#e9d5ff", "#6b21a8", "#3b0764", "#c026d3", "#e879f9"
  ],
  "deploy-bot": [
    "#f97316", "#ea580c", "#c2410c", "#7c2d12", "#fb923c", "#fdba74",
    "#fed7aa", "#b45309", "#9a3412", "#d97706", "#f59e0b"
  ],
};

function hashString(str: string): number {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export interface AgentAvatarProps {
  name?: string;
  size?: number | string;
  className?: string;
  pulse?: boolean;
  showBadge?: boolean;
}

export const AgentAvatar: React.FC<AgentAvatarProps> = ({
  name = "researcher",
  size = 40,
  className,
  pulse = false,
  showBadge = false,
}) => {
  const normalized = name.toLowerCase().trim();

  const grid = useMemo(() => {
    // If the name is "aeris" or "researcher", return the exact 6x6 pixel disco matrix
    if (
      normalized === "researcher" ||
      normalized.includes("researcher") ||
      normalized === "aeris" ||
      normalized.includes("aeris")
    ) {
      return RESEARCHER_MATRIX_6X6;
    }

    // Otherwise generate deterministically from the name seed
    let seed = hashString(normalized);
    const rng = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };

    const paletteKey = Object.keys(PALETTES).find((key) => normalized.includes(key)) || "researcher";
    const palette = PALETTES[paletteKey] || PALETTES.researcher;

    const matrix: string[][] = [];
    for (let r = 0; r < 6; r++) {
      const row: string[] = [];
      for (let c = 0; c < 6; c++) {
        const colorIdx = Math.floor(rng() * palette.length);
        row.push(palette[colorIdx]);
      }
      matrix.push(row);
    }
    return matrix;
  }, [normalized]);

  const dimension = typeof size === "number" ? `${size}px` : size;

  return (
    <div
      className={cn("relative inline-block shrink-0 select-none", className)}
      style={{ width: dimension, height: dimension }}
      title={name}
      aria-label={`${name} avatar`}
    >
      {/* Outer ambient glow if pulse is enabled */}
      {pulse && (
        <span
          className="absolute inset-0 rounded-full bg-[#12e848] opacity-40 blur-md animate-pulse pointer-events-none"
          aria-hidden="true"
        />
      )}

      {/* Circular masked 6x6 pixel grid */}
      <div
        className="w-full h-full rounded-full overflow-hidden shadow-md ring-1 ring-black/10 border border-white/20 relative"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(6, 1fr)",
          gridTemplateRows: "repeat(6, 1fr)",
          backgroundColor: "#05821f",
        }}
      >
        {grid.flatMap((row, rIdx) =>
          row.map((color, cIdx) => (
            <div
              key={`${rIdx}-${cIdx}`}
              style={{
                backgroundColor: color,
                width: "100%",
                height: "100%",
              }}
            />
          ))
        )}
      </div>

      {showBadge && (
        <span
          className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-[#12e848] border-2 border-white ring-1 ring-[#0b3b2a]/20"
          title="Active Agent"
        />
      )}
    </div>
  );
};

export default AgentAvatar;
