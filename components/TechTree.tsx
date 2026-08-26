"use client";

import { TOWERS } from "@/game/constants";
import { buyTech, nodeStatus, type NodeStatus, type Progress } from "@/game/progress";
import { TECH_TREE, techNode, techPrice, techTierLeft } from "@/game/tech";
import { SCRAP_ICON, TOWER_ICONS } from "./towerIcons";

// board geometry: nodes are squares centered in grid cells; the SVG edge
// layer underneath connects cell centers
const CELL_W = 160;
const CELL_H = 132;
const NODE = 88;
const BOARD_W = (Math.max(...TECH_TREE.map((n) => n.x)) + 1) * CELL_W;
const BOARD_H = (Math.max(...TECH_TREE.map((n) => n.y)) + 1) * CELL_H;

const centerX = (x: number): number => (x + 0.5) * CELL_W;
const centerY = (y: number): number => (y + 0.5) * CELL_H;

export default function TechTree({
  progress,
  onChanged,
  onBack,
}: {
  progress: Progress;
  /** a point was bought — the caller re-reads the save */
  onChanged: () => void;
  onBack: () => void;
}) {
  // a node is drawn only once its parent holds a point; edges follow the
  // same rule, so buying a node is what reveals the links out of it
  const visible = TECH_TREE.filter((n) => nodeStatus(progress, n.tower) !== "hidden");

  return (
    <div className="fixed inset-0 overflow-y-auto bg-[#101013]">
      <div className="mx-auto max-w-4xl px-6 py-10">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <button
            onClick={onBack}
            className="rounded border border-[#2E2E36] px-3 py-1.5 text-[11px] uppercase tracking-widest text-[#A6A6AF] hover:border-[#4A4A55] hover:text-[#EDEDEF] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#FFD37F]"
          >
            ◂ Levels
          </button>
          <h1 className="text-xl font-bold uppercase tracking-[0.25em] text-[#EDEDEF]">
            Turrets
          </h1>
          <span className="flex items-center gap-2 rounded border border-[#2E2E36] bg-[#151518] px-4 py-1.5 font-semibold text-[#FFD37F]">
            {/* eslint-disable-next-line @next/next/no-img-element -- raw pixel sprite */}
            <img src={SCRAP_ICON} alt="scrap" className="h-5 w-5 [image-rendering:pixelated]" />
            {progress.scrap}
          </span>
        </header>

        <div className="mt-10 flex justify-center overflow-x-auto">
          <div className="relative shrink-0" style={{ width: BOARD_W, height: BOARD_H }}>
            <svg
              className="absolute inset-0"
              width={BOARD_W}
              height={BOARD_H}
              aria-hidden="true"
            >
              {visible.map((n) => {
                if (!n.requires) return null;
                const parent = techNode(n.requires);
                const bought = (progress.tech[n.tower] ?? 0) > 0;
                return (
                  <line
                    key={`${n.requires}-${n.tower}`}
                    x1={centerX(parent.x)}
                    y1={centerY(parent.y)}
                    x2={centerX(n.x)}
                    y2={centerY(n.y)}
                    stroke={bought ? "#FFD37F" : "#4A4A55"}
                    strokeWidth={2}
                    strokeDasharray={bought ? undefined : "6 4"}
                  />
                );
              })}
            </svg>
            {visible.map((n) => {
              const status: NodeStatus = nodeStatus(progress, n.tower);
              const points = progress.tech[n.tower] ?? 0;
              const name = TOWERS[n.tower].name;
              const clickable = status === "buyable";
              return (
                <div
                  key={n.tower}
                  className="group absolute"
                  style={{
                    left: centerX(n.x) - NODE / 2,
                    top: centerY(n.y) - NODE / 2,
                    width: NODE,
                    height: NODE,
                  }}
                >
                  <button
                    aria-label={
                      points > 0 ? `${name}: +1 placement capacity` : `Unlock ${name}`
                    }
                    disabled={!clickable}
                    onClick={() => {
                      if (buyTech(n.tower)) onChanged();
                    }}
                    className={`relative flex h-full w-full items-center justify-center rounded-lg border-2 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#FFD37F] ${
                      points > 0
                        ? "border-[#FFD37F] bg-[#222227]"
                        : status === "locked-world"
                          ? "border-[#2E2E36] bg-[#151518] opacity-40"
                          : "border-[#4A4A55] bg-[#151518] hover:border-[#FFD37F]"
                    } ${clickable ? "cursor-pointer" : "cursor-not-allowed"}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- raw pixel sprite */}
                    <img
                      src={TOWER_ICONS[n.tower]}
                      alt=""
                      className={`h-14 w-14 [image-rendering:pixelated] ${
                        points > 0 ? "" : "grayscale"
                      }`}
                    />
                    {points > 0 && (
                      <span className="absolute -bottom-2 -right-2 rounded border border-[#FFD37F] bg-[#101013] px-1.5 text-[11px] font-bold text-[#FFD37F]">
                        ×{points}
                      </span>
                    )}
                    {status === "locked-world" && (
                      <svg
                        viewBox="0 0 12 12"
                        className="absolute -bottom-2 -right-2 h-5 w-5 rounded border border-[#2E2E36] bg-[#101013] fill-[#A6A6AF] p-0.5"
                        aria-hidden="true"
                      >
                        <path d="M3.5 5V3.8a2.5 2.5 0 0 1 5 0V5H9a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h.5zm1.2 0h2.6V3.8a1.3 1.3 0 0 0-2.6 0V5z" />
                      </svg>
                    )}
                  </button>
                  <div
                    className={`text-center text-[10px] font-semibold uppercase tracking-widest ${
                      points > 0 ? "text-[#EDEDEF]" : "text-[#71717C]"
                    }`}
                  >
                    {name}
                  </div>
                  {/* hover card: what this node does right now */}
                  <div
                    className={`pointer-events-none absolute left-1/2 z-10 hidden w-56 -translate-x-1/2 rounded border border-[#4A4A55] bg-[#151518] p-3 text-left shadow-lg group-hover:block ${
                      n.y === 0 ? "top-full mt-5" : "bottom-full mb-3"
                    }`}
                  >
                    <div className="flex items-baseline justify-between">
                      <span className="font-bold text-[#EDEDEF]">{name}</span>
                      <span className="text-[11px] text-[#A6A6AF]">
                        Capacity {points}
                      </span>
                    </div>
                    <div className="mt-1 text-[12px] text-[#A6A6AF]">
                      {points > 0
                        ? `+1 ${name} placement (${points} → ${points + 1})`
                        : `Unlocks the ${name} turret with 1 placement`}
                    </div>
                    {status === "locked-world" ? (
                      <div className="mt-2 text-[11px] font-semibold uppercase tracking-widest text-[#FF8A8A]">
                        Clear world {techNode(n.tower).world} first
                      </div>
                    ) : (
                      <div
                        className={`mt-2 flex items-center gap-1.5 text-[12px] font-semibold ${
                          status === "buyable" ? "text-[#FFD37F]" : "text-[#FF8A8A]"
                        }`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element -- raw pixel sprite */}
                        <img
                          src={SCRAP_ICON}
                          alt="scrap"
                          className="h-4 w-4 [image-rendering:pixelated]"
                        />
                        {techPrice(n.tower, points)}
                        {status === "poor" && <span className="font-normal">— not enough scrap</span>}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
