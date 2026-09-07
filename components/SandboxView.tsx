"use client";

import { useState } from "react";
import {
  MUTATIONS,
  MUT_COST_MAX,
  mutationCostOf,
  mutationById,
  mutationCost,
  type MutationId,
} from "@/game/mutation";
import { RUNG_COUNT, rungColor, rungLabel, tierMutationCount, tierMutationPoints } from "@/game/ladder";
import { WORLDS } from "@/game/levels";

/**
 * THE SANDBOX — the one door in the game that lets a rule be CHOSEN.
 *
 * Mutators are rolled and never picked (mutation.ts is emphatic about it,
 * and that is the right rule for the campaign: the surprise is the mode).
 * But a rule that can only arrive by dice is a rule that cannot be TESTED
 * — checking what Volatile does to a fuse wall meant re-rolling a Level 6
 * deploy until it turned up, which is not a workflow, it is a slot
 * machine. So the sandbox exists exactly here, on the debug page, behind
 * the same door the map and level editors are behind: pick a world, pick a
 * tier, tick whatever rules you want to see, and deploy under precisely
 * those.
 *
 * IT IS NOT A DIFFICULTY PICKER AND MUST NEVER BECOME ONE. The run it
 * starts is a SANDBOX run — the whole tech tree unlocked, every placement
 * cap lifted, every game speed offered (MechSwarm's `admin` mode; the
 * build bar's eight slots still hold, so a sandbox run picks a loadout
 * like any other) — so
 * nothing it banks is a claim about the campaign's balance, and the panel
 * says so rather than leaving it to be inferred.
 *
 * THE TIER'S OWN BUDGET IS SHOWN BESIDE THE TICKED TOTAL, greyed, and it
 * is advisory: the point of the sandbox is to be able to exceed it. What
 * the number is for is calibration — "this is four points past what Level
 * 6 would ever roll" is the difference between a fair test and a
 * misleading one.
 *
 * The handoff is a QUERY STRING onto the game page (see the sandbox effect
 * in MechSwarm.tsx). A shared route rather than shared state because the
 * admin page and the game are separate routes with separate React trees —
 * and because a URL is a thing you can bookmark, which turns "the exact
 * run that reproduced the bug" into something you can paste into a report.
 */
export default function SandboxView() {
  const [worldId, setWorldId] = useState(WORLDS[0].id);
  const [tier, setTier] = useState(0);
  const [picked, setPicked] = useState<readonly MutationId[]>([]);

  const toggle = (id: MutationId): void =>
    setPicked((cur) => (cur.includes(id) ? cur.filter((m) => m !== id) : [...cur, id]));

  const world = WORLDS.find((w) => w.id === worldId) ?? WORLDS[0];
  const spent = mutationCost(picked);
  const budget = tierMutationPoints(tier);
  const rolls = tierMutationCount(tier);
  const over = spent > budget;

  const start = (): void => {
    const q = new URLSearchParams({ sandbox: "1", world: worldId, tier: String(tier) });
    if (picked.length > 0) q.set("mut", picked.join(","));
    // a full navigation, not a router.push: the game screen builds a WebGL
    // context and a Sim from scratch, and handing it a clean document is
    // both simpler and closer to what a player's first load does
    window.location.href = `/?${q.toString()}`;
  };

  return (
    <div className="space-y-6">
      <p className="max-w-3xl text-[15px] text-[#71717C]">
        Deploy a run under <span className="text-[#A6A6AF]">exactly</span> the rules ticked
        below — the only place in the game where a mutator is chosen rather than rolled. The
        run starts in <span className="text-[#A6A6AF]">sandbox mode</span>: the whole tech
        tree unlocked, placement caps lifted and every game speed available (the build bar
        still holds eight slots, so pick a loadout), so nothing it banks says anything about
        campaign balance.
      </p>

      {/* WORLD */}
      <section>
        <h2 className="mb-2 text-[14px] font-bold uppercase tracking-widest text-[#71717C]">
          World
        </h2>
        <div className="flex flex-wrap gap-2">
          {WORLDS.map((w) => (
            <button
              key={w.id}
              onClick={() => setWorldId(w.id)}
              className={`rounded border px-3 py-2 text-[15px] font-bold transition-colors ${
                worldId === w.id
                  ? "border-[#EDEDEF] bg-[#EDEDEF]/10 text-[#EDEDEF]"
                  : "border-[#2E2E36] text-[#A6A6AF] hover:border-[#4A4A55] hover:text-[#EDEDEF]"
              }`}
            >
              {w.name}
              <span className="ml-2 text-[13px] font-normal uppercase tracking-widest text-[#71717C]">
                {w.map ?? "default map"}
              </span>
            </button>
          ))}
        </div>
      </section>

      {/* TIER */}
      <section>
        <h2 className="mb-2 text-[14px] font-bold uppercase tracking-widest text-[#71717C]">
          Difficulty — enemy level, the roll it would make, and payout
        </h2>
        <div className="flex flex-wrap gap-1.5">
          {Array.from({ length: RUNG_COUNT }, (_, i) => (
            <button
              key={i}
              onClick={() => setTier(i)}
              className={`w-[4.5rem] rounded border px-2 py-1.5 text-[14px] font-bold transition-colors ${
                tier === i
                  ? "border-current bg-white/10"
                  : "border-[#2E2E36] hover:border-[#4A4A55]"
              }`}
              style={{ color: tier === i ? rungColor(i) : undefined }}
            >
              {rungLabel(i)}
            </button>
          ))}
        </div>
        <p className="mt-2 text-[14px] text-[#71717C]">
          {rungLabel(tier)} would roll{" "}
          <span className="text-[#A6A6AF]">
            {rolls} rule{rolls === 1 ? "" : "s"}
          </span>{" "}
          for <span className="text-[#A6A6AF]">{budget} points</span> in the campaign.
        </p>
      </section>

      {/* MUTATORS */}
      <section>
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <h2 className="text-[14px] font-bold uppercase tracking-widest text-[#71717C]">
            Mutators — tick any, in any combination
          </h2>
          <span className="text-[14px] tracking-widest">
            <span className={over ? "text-[#FFB65C]" : "text-[#A6A6AF]"}>{spent} pts</span>
            <span className="text-[#71717C]">
              {" "}
              / {budget} at {rungLabel(tier)}
              {over ? " — over budget, which is allowed here" : ""}
            </span>
          </span>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {MUTATIONS.map((m) => {
            const on = picked.includes(m.id);
            // mutationCostOf, not m.cost: the dashboard may have repriced it
            const cost = mutationCostOf(m.id);
            // the codex's own three weights, by cost — light / heavy / brutal
            const band =
              cost <= 2 ? "#7BE58A" : cost <= 4 ? "#FFB65C" : "#FF6B6B";
            return (
              <button
                key={m.id}
                onClick={() => toggle(m.id)}
                className={`rounded-lg border p-3 text-left transition-colors ${
                  on ? "bg-white/5" : "border-[#2E2E36] hover:border-[#4A4A55]"
                }`}
                style={on ? { borderColor: band } : undefined}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span
                    className="text-[15px] font-bold"
                    style={{ color: on ? band : "#A6A6AF" }}
                  >
                    {m.name}
                  </span>
                  <span className="shrink-0 text-[13px] uppercase tracking-widest text-[#71717C]">
                    {cost}/{MUT_COST_MAX} pts
                  </span>
                </div>
                <p className="mt-1 text-[14px] leading-snug text-[#71717C]">{m.blurb}</p>
              </button>
            );
          })}
        </div>
        <div className="mt-2 flex gap-2">
          <button
            onClick={() => setPicked(MUTATIONS.map((m) => m.id))}
            className="rounded border border-[#2E2E36] px-3 py-1 text-[14px] text-[#A6A6AF] hover:border-[#4A4A55] hover:text-[#EDEDEF]"
          >
            All
          </button>
          <button
            onClick={() => setPicked([])}
            className="rounded border border-[#2E2E36] px-3 py-1 text-[14px] text-[#A6A6AF] hover:border-[#4A4A55] hover:text-[#EDEDEF]"
          >
            None
          </button>
        </div>
      </section>

      <button
        onClick={start}
        className="w-full rounded-lg border-2 border-[#FFD37F] bg-[#FFD37F]/10 px-4 py-3 text-[16px] font-bold uppercase tracking-widest text-[#FFD37F] transition-colors hover:bg-[#FFD37F]/20"
      >
        Deploy sandbox run
      </button>
    </div>
  );
}
