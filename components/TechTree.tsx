"use client";

import { useMemo } from "react";
import { TOWERS } from "@/game/constants";
import { buyNode, type Progress } from "@/game/progress";
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
  onChanged,
  onBack,
}: {
  progress: Progress;
  /** a node was bought — the caller re-reads the save */
  onChanged: () => void;
  onBack: () => void;
}) {
  const owned = useMemo(() => new Set(progress.nodes), [progress.nodes]);

  return (
    <div className="fixed inset-0 overflow-y-auto bg-[#101013]">
      <div className="mx-auto max-w-5xl px-6 py-10">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <button
            onClick={onBack}
            className="rounded border border-[#2E2E36] px-3 py-1.5 text-[11px] uppercase tracking-widest text-[#A6A6AF] hover:border-[#4A4A55] hover:text-[#EDEDEF] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#FFD37F]"
          >
            ◂ Levels
          </button>
          <h1 className="text-xl font-bold uppercase tracking-[0.25em] text-[#EDEDEF]">
            Tech tree
          </h1>
          <span className="flex items-center gap-2 rounded border border-[#2E2E36] bg-[#151518] px-4 py-1.5 font-semibold text-[#FFD37F]">
            {/* eslint-disable-next-line @next/next/no-img-element -- raw pixel sprite */}
            <img src={SCRAP_ICON} alt="scrap" className="h-5 w-5 [image-rendering:pixelated]" />
            {progress.scrap}
          </span>
        </header>
        <p className="mt-2 text-center text-[11px] uppercase tracking-widest text-[#71717C]">
          Scrap from every run — victory or defeat — buys towers, more placements, and income
        </p>

        <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {TECH_BRANCHES.map(({ root, nodes }) => {
            const { label, icon } = branchMeta(root);
            return (
              <section key={root.id} className="rounded border border-[#222227] bg-[#121215] p-4">
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
                  <h2 className="text-sm font-bold uppercase tracking-[0.2em] text-[#EDEDEF]">
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
                            ? "border-[#1F3A2E] bg-[#14271C]/60"
                            : state === "locked"
                              ? "border-[#222227] opacity-50"
                              : "border-[#2E2E36] bg-[#151518]"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-[#EDEDEF]">{node.name}</span>
                          {state === "owned" ? (
                            <span className="text-[10px] font-semibold uppercase tracking-widest text-[#7BE58A]">
                              Owned
                            </span>
                          ) : (
                            <button
                              disabled={state !== "ok"}
                              onClick={() => {
                                if (buyNode(node.id)) onChanged();
                              }}
                              className={`flex shrink-0 items-center gap-1 rounded border px-2 py-1 text-[11px] font-semibold focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#FFD37F] ${
                                state === "ok"
                                  ? "border-[#FFD37F] text-[#FFD37F] hover:bg-[#2B2B32]"
                                  : "cursor-not-allowed border-[#2E2E36] text-[#71717C]"
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
                        <div className="mt-1 text-[12px] text-[#A6A6AF]">{node.desc}</div>
                        {state === "locked" && node.requires && (
                          <div className="mt-1 text-[10px] uppercase tracking-widest text-[#71717C]">
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
