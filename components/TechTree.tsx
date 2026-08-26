"use client";

import { useMemo } from "react";
import { TOWERS } from "@/game/constants";
import type { Progress } from "@/game/progress";
import { TECH_BRANCHES, buyState, nodeById, type TechNode } from "@/game/tech";
import { SCRAP_ICON, TOWER_ICONS } from "./towerIcons";

/** what a branch is about, read off its root node */
const branchMeta = (root: TechNode): { label: string; icon: string | null } => {
  const e = root.effect;
  if (e.kind === "income") return { label: "Economy", icon: SCRAP_ICON };
  return { label: TOWERS[e.tower].name, icon: TOWER_ICONS[e.tower] };
};

export default function TechTree({
  progress,
  onBuy,
  onBack,
}: {
  progress: Progress;
  onBuy: (nodeId: string) => void;
  onBack: () => void;
}) {
  const owned = useMemo(() => new Set(progress.nodes), [progress.nodes]);

  return (
    <div className="fixed inset-0 overflow-y-auto bg-[#070B14]">
      <div className="mx-auto max-w-5xl px-6 py-10">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <button
            onClick={onBack}
            className="rounded border border-[#223050] px-3 py-1.5 text-[11px] uppercase tracking-widest text-[#9AA7C7] hover:border-[#35486E] hover:text-[#E8EDF7] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#5BD9E8]"
          >
            ◂ Command
          </button>
          <h1 className="font-display text-xl uppercase tracking-widest text-[#E8EDF7]">
            Tech tree
          </h1>
          <span className="flex items-center gap-2 rounded border border-[#223050] bg-[#0D1424] px-4 py-1.5 font-semibold text-[#E8B45B]">
            {/* eslint-disable-next-line @next/next/no-img-element -- raw pixel sprite */}
            <img src={SCRAP_ICON} alt="scrap" className="h-5 w-5 [image-rendering:pixelated]" />
            {progress.scrap}
          </span>
        </header>
        <p className="mt-2 text-center text-[11px] uppercase tracking-widest text-[#5B6885]">
          Scrap from every run — victory or defeat — buys towers, more placements, and income
        </p>

        <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {TECH_BRANCHES.map(({ root, nodes }) => {
            const { label, icon } = branchMeta(root);
            return (
              <section key={root.id} className="rounded border border-[#16203A] bg-[#0A101F] p-4">
                <div className="flex items-center gap-2">
                  {icon && (
                    // eslint-disable-next-line @next/next/no-img-element -- raw pixel sprite
                    <img
                      src={icon}
                      alt=""
                      className="h-6 w-6 [image-rendering:pixelated]"
                      aria-hidden="true"
                    />
                  )}
                  <h2 className="font-display text-sm uppercase tracking-widest text-[#E8EDF7]">
                    {label}
                  </h2>
                </div>
                <div className="mt-3 space-y-2">
                  {nodes.map((node) => {
                    const state = buyState(node, owned, progress.scrap);
                    return (
                      <div
                        key={node.id}
                        className={`rounded border p-3 ${
                          state === "owned"
                            ? "border-[#2C5A45] bg-[#0D1A16]"
                            : state === "locked"
                              ? "border-[#16203A] opacity-50"
                              : "border-[#223050] bg-[#0D1424]"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-[#E8EDF7]">{node.name}</span>
                          {state === "owned" ? (
                            <span className="text-[10px] font-semibold uppercase tracking-widest text-[#7BD88F]">
                              Owned
                            </span>
                          ) : (
                            <button
                              disabled={state !== "ok"}
                              onClick={() => onBuy(node.id)}
                              className={`flex shrink-0 items-center gap-1 rounded border px-2 py-1 text-[11px] font-semibold focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#5BD9E8] ${
                                state === "ok"
                                  ? "border-[#E8B45B] text-[#E8B45B] hover:bg-[#2A2210]"
                                  : "cursor-not-allowed border-[#223050] text-[#5B6885]"
                              }`}
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element -- raw pixel sprite */}
                              <img
                                src={SCRAP_ICON}
                                alt="scrap"
                                className="h-3.5 w-3.5 [image-rendering:pixelated]"
                              />
                              {node.cost}
                            </button>
                          )}
                        </div>
                        <div className="mt-1 text-[12px] text-[#9AA7C7]">{node.desc}</div>
                        {state === "locked" && node.requires && (
                          <div className="mt-1 text-[10px] uppercase tracking-widest text-[#5B6885]">
                            Requires {nodeById(node.requires)?.name ?? node.requires}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
