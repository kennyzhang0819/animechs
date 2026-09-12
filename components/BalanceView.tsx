"use client";

import { useCallback, useState } from "react";
import { currentBalanceDoc, saveBalanceDoc } from "@/game/balance";
import { SCRAP_START } from "@/game/economy";
import {
  allRungOverrides,
  authoredRungKnobs,
  RUNGS,
  rungColor,
  rungKnobsOf,
  rungLabel,
  tierCountScale,
  setRungKnob,
  stageAudit,
  STAGE_BOARDS,
  type RungKnobs,
  HP_PER_LEVEL,
} from "@/game/ladder";
import { WORLD } from "@/game/levels";
import {
  allMutationCostOverrides,
  authoredMutationCost,
  MUTATIONS,
  mutationCostOf,
  MUT_COUNT_MAX,
  MUT_FIRST_TIER,
  MUT_COUNT_MIN,
  MUT_COST_MAX,
  MUT_COST_MIN,
  setMutationCost,
  type MutationId,
} from "@/game/mutation";
import { ScrapAmount, XpAmount } from "./Items";
import { Knob } from "./Knob";

const NUM = "font-mono tabular-nums";

const TIER_COLOR: Record<number, string> = { 1: "#7BE58A", 2: "#FFB65C", 3: "#FF6B6B" };

export default function BalanceView() {
  const [, bump] = useState(0);
  const [status, setStatus] = useState<string | null>(null);

  const setDifficulty = useCallback(
    (tier: number, knob: keyof RungKnobs, v: number | undefined) => {
      setRungKnob(tier, knob, v);
      setStatus(null);
      bump((n) => n + 1);
    },
    [],
  );

  const setMutCost = useCallback((id: MutationId, v: number | undefined) => {
    setMutationCost(id, v);
    setStatus(null);
    bump((n) => n + 1);
  }, []);

  // THE WHOLE DOCUMENT, not this screen's share of it: the save is
  // wholesale (balance.ts currentBalanceDoc), so a Save here that carried
  // only prices would delete whatever the rarities page had bent
  const save = useCallback(async () => {
    setStatus((await saveBalanceDoc(currentBalanceDoc())) ? "Saved" : "Save failed");
  }, []);

  // the stage table, recomputed on every bump so a price edit shows at
  // once in the column it changes
  const stages = stageAudit(WORLD);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
        <p className="max-w-3xl text-[15px] leading-relaxed text-[#71717C]">
          Two dials, one document. A rung&apos;s dials are the mutator roll and the XP
          bonus (enemy level is a mechanism the ladder no longer turns, left here at
          zero). A mutator&apos;s cost decides which rungs can afford it. The stage table
          below is read-only: what each stage&apos;s waves pay, held against the authored
          turret prices.
        </p>
        <div className="flex shrink-0 items-center gap-2">
          {status && <span className="text-[15px] text-[#71717C]">{status}</span>}
          <button
            onClick={save}
            className="rounded border border-[#4A4A55] bg-[#1C1C21] px-3 py-1.5 text-[15px] font-bold text-[#EDEDEF] hover:border-[#71717C]"
          >
            Save
          </button>
        </div>
      </div>

      {/* THE STAGE TABLE — what the authored turret prices (TOWER_PRICE in
          economy.ts) are held against: what each stage's waves pay, and how
          many of the tier's turrets that buys */}
      <div className="mb-4 rounded-lg border border-[#2E2E36] p-4">
        <div className="mb-1 text-[17px] font-bold text-[#EDEDEF]">Stages</div>
        <p className="mb-3 max-w-3xl text-[14.5px] text-[#71717C]">
          The run is three stages and the roster is three tiers, and a tier is priced so its
          stage is roughly what buys it. <span className="text-[#A6A6AF]">Boards</span> is
          how many of the tier&apos;s turrets the stage&apos;s scrap buys at the tier&apos;s mean
          price; the healthy band is printed beside it. The income is the swarm&apos;s: every
          kill drops its tier&apos;s scrap and every wave staged pays a bonus, and stage 1
          includes the opening {SCRAP_START}.
        </p>
        <div className="grid gap-4 md:grid-cols-3">
          {stages.map((s) => {
            const band = STAGE_BOARDS[s.tier];
            const ok = s.boards >= band.min && s.boards <= band.max;
            return (
              <div key={s.tier} className="rounded border border-[#2E2E36] px-3 py-2">
                <div className="flex items-baseline justify-between">
                  <span className="text-[16px] font-bold" style={{ color: TIER_COLOR[s.tier] }}>
                    Tier {s.tier}
                  </span>
                  <span className={`text-[13px] text-[#71717C] ${NUM}`}>
                    waves {s.from}–{s.to} · {s.units.toLocaleString()} enemies
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3">
                  <ScrapAmount amount={s.scrap} />
                  <XpAmount amount={s.xp} />
                </div>
                <div className={`mt-1 text-[14px] ${NUM}`}>
                  <span className="text-[#71717C]">prices </span>
                  <span className="text-[#A6A6AF]">
                    {s.cheapest}–{s.dearest}, mean {s.mean}
                  </span>
                </div>
                <div className={`text-[14px] ${NUM}`}>
                  <span className="text-[#71717C]">boards </span>
                  <span className="font-bold" style={{ color: ok ? "#A6A6AF" : "#FF8A8A" }}>
                    {s.boards}
                  </span>
                  <span className="text-[#5A5A63]">
                    {" "}
                    (want {band.min}–{band.max})
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* enemy-side dials, saved into the same document under `difficulties` */}
      <div className="mb-4 rounded-lg border border-[#2E2E36] p-4">
        <div className="mb-1 text-[17px] font-bold text-[#EDEDEF]">Ladder</div>
        <p className="mb-3 text-[14.5px] text-[#71717C]">
          One card a rung. The four named difficulties send the script at a quarter, a
          half, three quarters and the whole of its count with no mutators; every rung
          above them is the whole count under a mutator roll. Every body walks in at the
          same health on every rung. The enemy-level dial is still wired — health
          ×{HP_PER_LEVEL} a level — and authored to zero.
        </p>
        <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-5">
          {RUNGS.map((_, tier) => {
            const dk = rungKnobsOf(tier);
            const da = authoredRungKnobs(tier);
            return (
              <div key={tier} className="rounded border border-[#2E2E36] px-3 py-1">
                <div className="flex items-baseline justify-between pt-2">
                  <span className="text-[16px] font-bold" style={{ color: rungColor(tier) }}>
                    {rungLabel(tier)}
                  </span>
                  <span className={`text-[13px] text-[#71717C] ${NUM}`}>
                    ×{(HP_PER_LEVEL ** dk.level).toFixed(2)} hp
                  </span>
                </div>
                <Knob
                  label="XP bonus"
                  hint="what the run's XP is multiplied by"
                  value={dk.xpBonus}
                  min={1}
                  max={10}
                  step={0.05}
                  decimals={2}
                  bent={dk.xpBonus !== da.xpBonus}
                  onChange={(v) => setDifficulty(tier, "xpBonus", Math.max(0, v))}
                  onReset={() => setDifficulty(tier, "xpBonus", undefined)}
                />
                {/* THE MUTATOR PAIR STARTS ABOVE ERADICATION. A named
                    difficulty is the campaign as authored, at a size (see
                    mutation.ts) — that is a design rule rather than a
                    setting, so its card says so instead of offering two
                    dials whose only correct value is zero */}
                {tier < MUT_FIRST_TIER ? (
                  <div className="border-t border-[#2E2E36] py-3 text-[13.5px] text-[#71717C]">
                    <span className="text-[15px] font-bold text-[#EDEDEF]">Mutators</span>
                    <p className="mt-1">
                      Sends {Math.round(tierCountScale(tier) * 100)}% of every wave. No roll — it starts at{" "}
                      {rungLabel(MUT_FIRST_TIER)}.
                    </p>
                  </div>
                ) : (
                  <>
                    <Knob
                      label="Mutators"
                      hint={`rules rolled, ${MUT_COUNT_MIN}–${MUT_COUNT_MAX}`}
                      value={dk.mutationCount}
                      min={MUT_COUNT_MIN}
                      max={MUT_COUNT_MAX}
                      step={1}
                      decimals={0}
                      bent={dk.mutationCount !== da.mutationCount}
                      onChange={(v) =>
                        setDifficulty(
                          tier,
                          "mutationCount",
                          Math.min(MUT_COUNT_MAX, Math.max(0, Math.round(v))),
                        )
                      }
                      onReset={() => setDifficulty(tier, "mutationCount", undefined)}
                    />
                    <Knob
                      label="Mutator points"
                      hint={`what they may cost together; a rule is 1–${MUT_COST_MAX}`}
                      value={dk.mutationPoints}
                      min={0}
                      max={40}
                      step={1}
                      decimals={0}
                      bent={dk.mutationPoints !== da.mutationPoints}
                      onChange={(v) => setDifficulty(tier, "mutationPoints", Math.max(0, v))}
                      onReset={() => setDifficulty(tier, "mutationPoints", undefined)}
                    />
                  </>
                )}
                <Knob
                  label="Enemy level"
                  hint="hp ×1.06 per level — authored 0, kept for experiments"
                  value={dk.level}
                  min={0}
                  max={60}
                  step={1}
                  decimals={0}
                  bent={dk.level !== da.level}
                  onChange={(v) => setDifficulty(tier, "level", Math.max(0, v))}
                  onReset={() => setDifficulty(tier, "level", undefined)}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* WHAT EACH RULE IS WORTH, saved into the same document under
          `mutations`. It sits under the ladder card because the two are one
          arithmetic: a rung hands out points, these spend them, and a cost
          nudged by one changes which rungs can afford the rule at all */}
      <div className="mb-4 rounded-lg border border-[#2E2E36] p-4">
        <div className="mb-1 text-[17px] font-bold text-[#EDEDEF]">Mutator costs</div>
        <p className="mb-3 max-w-3xl text-[14.5px] text-[#71717C]">
          What a rule costs the roll, on the published {MUT_COST_MIN}–{MUT_COST_MAX} scale:{" "}
          <span className="text-[#7BE58A]">1–2 light</span>,{" "}
          <span className="text-[#FFB65C]">3–4 heavy</span>,{" "}
          <span className="text-[#FF6B6B]">5–6 brutal</span>. A cost is about how much of the
          player&apos;s game the rule takes away, not how much health it adds. Raising one
          prices it out of the lower rungs; the catalog keeps its authored order either way,
          so the codex does not reshuffle while you sweep. SPECIAL rules are not listed:
          they belong to one map, are never rolled and are never charged against a rung, so
          their cost buys nothing and there is nothing here to bend.
        </p>
        <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-5">
          {MUTATIONS.map((m) => {
            const cost = mutationCostOf(m.id);
            const authoredCost = authoredMutationCost(m.id);
            const col = cost <= 2 ? "#7BE58A" : cost <= 4 ? "#FFB65C" : "#FF6B6B";
            // which rungs can still afford it AT ALL — the number the cost
            // actually decides, and the reason to be turning this knob
            const afford = RUNGS.reduce(
              (n, _, tier) =>
                n + (tier >= MUT_FIRST_TIER && rungKnobsOf(tier).mutationPoints >= cost ? 1 : 0),
              0,
            );
            return (
              <div key={m.id} className="rounded border border-[#2E2E36] px-3 py-1">
                <div className="flex items-baseline justify-between pt-2">
                  <span className="text-[16px] font-bold" style={{ color: col }}>
                    {m.name}
                  </span>
                  <span className={`text-[13px] text-[#71717C] ${NUM}`}>
                    {afford}/{RUNGS.length - MUT_FIRST_TIER} rungs
                  </span>
                </div>
                <p className="pt-1 text-[13.5px] leading-snug text-[#71717C]">{m.blurb}</p>
                <Knob
                  label="Cost"
                  hint={`points against the roll's budget, ${MUT_COST_MIN}–${MUT_COST_MAX}`}
                  value={cost}
                  min={MUT_COST_MIN}
                  max={MUT_COST_MAX}
                  step={1}
                  decimals={0}
                  bent={cost !== authoredCost}
                  onChange={(v) => setMutCost(m.id, v)}
                  onReset={() => setMutCost(m.id, undefined)}
                />
              </div>
            );
          })}
        </div>
      </div>

    </div>
  );
}
