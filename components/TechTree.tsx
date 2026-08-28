"use client";

import { useState } from "react";
import { TOWERS } from "@/game/constants";
import {
  affordablePoints,
  buyTech,
  nodeStatus,
  type NodeStatus,
  type Progress,
} from "@/game/progress";
import { TECH_TREE, techNode, techPrice } from "@/game/tech";
import { difficultyName } from "@/game/ladder";
import { CostRow, Wallet } from "./Items";
import { TOWER_ICONS } from "./towerIcons";

// board geometry: nodes are squares centered in grid cells; the SVG edge
// layer underneath connects cell centers
const CELL_W = 160;
const CELL_H = 132;
const NODE = 88;
const BOARD_W = (Math.max(...TECH_TREE.map((n) => n.x)) + 1) * CELL_W;
const BOARD_H = (Math.max(...TECH_TREE.map((n) => n.y)) + 1) * CELL_H;

const centerX = (x: number): number => (x + 0.5) * CELL_W;
const centerY = (y: number): number => (y + 0.5) * CELL_H;

/**
 * How many points one click buys. The volume turret is flat-priced, so a
 * mid-campaign bank buys duos by the thousand — a tree that could only be
 * clicked one point at a time would make the game's central action its most
 * tedious one. "Max" spends everything the wallet covers on that one node.
 */
const BUY_STEPS = [1, 10, 100, "max"] as const;
type BuyStep = (typeof BUY_STEPS)[number];

const stepLabel = (s: BuyStep): string => (s === "max" ? "Max" : `×${s}`);

/** how many points this step would actually land right now */
const stepCount = (p: Progress, tower: string, step: BuyStep): number =>
  affordablePoints(p, tower as never, step === "max" ? Infinity : step);

export default function TechTree({
  progress,
  onChanged,
  onBack,
  backLabel = "◂ Levels",
}: {
  progress: Progress;
  /** a point was bought — the caller re-reads the save */
  onChanged: () => void;
  onBack: () => void;
  /** where leaving goes, in words. The tree is reachable from the menu AND
   * from a lost run, and those are different exits — one returns to the
   * level list, the other starts the run again with what was just bought */
  backLabel?: string;
}) {
  const [step, setStep] = useState<BuyStep>(1);

  // a node is drawn only once its parent holds a point; edges follow the
  // same rule, so buying a node is what reveals the links out of it
  const visible = TECH_TREE.filter((n) => nodeStatus(progress, n.tower) !== "hidden");

  return (
    <div className="fixed inset-0 overflow-y-auto bg-[#101013]">
      <div className="mx-auto max-w-4xl pt-10 pb-[max(2.5rem,var(--safe-b))] pl-[max(1.5rem,var(--safe-l))] pr-[max(1.5rem,var(--safe-r))]">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <button
            onClick={onBack}
            className="rounded border border-[#2E2E36] px-3 py-1.5 text-[13px] uppercase tracking-widest text-[#A6A6AF] hover:border-[#4A4A55] hover:text-[#EDEDEF] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#FFD37F]"
          >
            {backLabel}
          </button>
          <h1 className="text-2xl font-bold uppercase tracking-[0.25em] text-[#EDEDEF]">
            Upgrades
          </h1>
          <span className="flex items-center rounded border border-[#2E2E36] bg-[#151518] px-4 py-1.5">
            <Wallet bank={progress.bank} />
          </span>
        </header>

        <div
          role="group"
          aria-label="points per click"
          className="mt-6 flex items-center justify-center gap-2"
        >
          <span className="mr-1 text-[12px] uppercase tracking-widest text-[#71717C]">
            Buy
          </span>
          {BUY_STEPS.map((s) => (
            <button
              key={String(s)}
              aria-pressed={step === s}
              onClick={() => setStep(s)}
              className={`rounded border px-3 py-1 text-[13px] font-bold uppercase tracking-widest focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#FFD37F] ${
                step === s
                  ? "border-[#FFD37F] bg-[#222227] text-[#FFD37F]"
                  : "border-[#2E2E36] bg-[#151518] text-[#A6A6AF] hover:border-[#4A4A55] hover:text-[#EDEDEF]"
              }`}
            >
              {stepLabel(s)}
            </button>
          ))}
        </div>

        <div className="mt-8 overflow-x-auto">
          <div className="relative mx-auto" style={{ width: BOARD_W, height: BOARD_H }}>
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
              // the step is a ceiling, not a promise: a "×100" the wallet
              // only half covers lands what it covers rather than refusing
              const willBuy = clickable ? stepCount(progress, n.tower, step) : 0;
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
                      points > 0
                        ? `${name}: +${Math.max(1, willBuy)} placement capacity`
                        : `Unlock ${name}`
                    }
                    // aria-disabled rather than disabled: a node priced out
                    // of reach still has to be able to say so, and a disabled
                    // button takes no focus — which on a touchscreen, where
                    // there is no hover either, left its price card with no
                    // way at all to be opened
                    aria-disabled={!clickable}
                    onClick={() => {
                      if (!clickable) return;
                      if (buyTech(n.tower, Math.max(1, willBuy))) onChanged();
                    }}
                    className={`relative flex h-full w-full items-center justify-center rounded-lg border-2 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#FFD37F] ${
                      points > 0
                        ? "border-[#FFD37F] bg-[#222227]"
                        : status === "locked-tier"
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
                      <span className="absolute -bottom-2 -right-2 rounded border border-[#FFD37F] bg-[#101013] px-1.5 text-[13px] font-bold text-[#FFD37F]">
                        ×{points}
                      </span>
                    )}
                    {status === "locked-tier" && (
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
                    className={`text-center text-[12px] font-bold uppercase tracking-widest ${
                      points > 0 ? "text-[#EDEDEF]" : "text-[#71717C]"
                    }`}
                  >
                    {name}
                  </div>
                  {/* hover card: what this node does right now */}
                  <div
                    // focus-within is the touch spelling of hover: a tap
                    // focuses the node and the card opens with it
                    className={`pointer-events-none absolute left-1/2 z-10 hidden w-56 -translate-x-1/2 rounded border border-[#4A4A55] bg-[#151518] p-3 text-left shadow-lg group-hover:block group-focus-within:block ${
                      n.y === 0 ? "top-full mt-5" : "bottom-full mb-3"
                    }`}
                  >
                    <div className="flex items-baseline justify-between">
                      <span className="font-bold text-[#EDEDEF]">{name}</span>
                      <span className="text-[13px] text-[#A6A6AF]">Capacity {points}</span>
                    </div>
                    <div className="mt-1 text-[14px] text-[#A6A6AF]">
                      {points > 0
                        ? `+${Math.max(1, willBuy)} ${name} placements (${points} → ${
                            points + Math.max(1, willBuy)
                          })`
                        : `Unlocks the ${name} turret with 1 placement`}
                    </div>
                    {status === "locked-tier" ? (
                      <div className="mt-2 text-[13px] font-bold uppercase tracking-widest text-[#FF8A8A]">
                        Clear {difficultyName(techNode(n.tower).requiresTier ?? 0)} first
                      </div>
                    ) : (
                      <div className="mt-2 border-t border-[#2E2E36] pt-2 text-[14px]">
                        {/* the full bundle: every currency this tier wants.
                            Passing the bank reddens exactly the stacks it
                            can't cover, which is the whole "why can't I buy
                            this" explanation — no prose needed. Only the NEXT
                            point's price is shown even on a ×100 click: it is
                            the number that decides whether the click lands */}
                        <CostRow cost={techPrice(n.tower, points)} bank={progress.bank} />
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
