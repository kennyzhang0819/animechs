"use client";

import { useCallback, useState } from "react";
import { saveBalanceDoc, type BalanceDoc } from "@/game/balance";
import { TOWERS } from "@/game/constants";
import {
  CAP_TILES,
  PRICE_PER_DPS,
  growthOf,
  setTune,
  techCeiling,
  techNode,
  techPrice,
  tuneOf,
} from "@/game/tech";
import { TOWER_KINDS, type TowerKind } from "@/game/types";

/** what tech.ts would charge with no override — the value a Reset returns to */
const authored = (t: TowerKind): number => techNode(t).tune ?? 1;

/** copper for the nth point, or a dash once the node has run out of ceiling */
function copperAt(tower: TowerKind, n: number): string {
  if (n > techCeiling(tower)) return "—";
  const c = techPrice(tower, n - 1).copper ?? 0;
  return Math.round(c).toLocaleString();
}

const NUM = "font-mono tabular-nums";

/**
 * The balance tab: one row per turret, one dial per row.
 *
 * Every number beside the dial is derived from it live, because the whole
 * point of the coefficient is that its effect is hard to predict by eye — it
 * moves an exponent, so a change that looks small at the tenth purchase is
 * enormous at the five-hundredth. Seeing both columns move together is what
 * makes it tunable.
 */
export default function BalanceView() {
  // tech.ts holds the coefficients in module state, so this counter is what
  // tells React the derived numbers are stale
  const [, bump] = useState(0);
  const [status, setStatus] = useState<string | null>(null);

  const set = useCallback((tower: TowerKind, value: number | undefined) => {
    setTune(tower, value);
    setStatus(null);
    bump((n) => n + 1);
  }, []);

  const save = useCallback(async () => {
    // only what has actually been bent — an untouched node keeps reading its
    // authored value from tech.ts rather than being frozen into the document
    const doc: BalanceDoc = {};
    for (const k of TOWER_KINDS) if (tuneOf(k) !== authored(k)) doc[k] = tuneOf(k);
    setStatus((await saveBalanceDoc(doc)) ? "Saved to public/balance.json" : "Save failed");
  }, []);

  const resetAll = useCallback(() => {
    for (const k of TOWER_KINDS) setTune(k, undefined);
    setStatus(null);
    bump((n) => n + 1);
  }, []);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
        <p className="max-w-3xl text-[13px] leading-relaxed text-[#71717C]">
          Growth is solved from each turret&apos;s base bundle and its damage, at{" "}
          <span className={NUM}>{PRICE_PER_DPS}</span> copper per point of lifetime DPS. The
          coefficient bends that result: <span className="text-[#A6A6AF]">below 1</span> smoothens
          the ladder so capacity piles up faster,{" "}
          <span className="text-[#A6A6AF]">above 1</span> steepens it. It multiplies an exponent, so
          watch the right-hand columns rather than the first price. Caps come from a{" "}
          <span className={NUM}>{CAP_TILES.toLocaleString()}</span>-tile budget per turret type and
          nothing about pricing reads them.
        </p>
        <div className="flex shrink-0 items-center gap-2">
          {status && <span className="text-[13px] text-[#71717C]">{status}</span>}
          <button
            onClick={resetAll}
            className="rounded border border-[#2E2E36] px-3 py-1.5 text-[13px] text-[#A6A6AF] hover:border-[#4A4A55]"
          >
            Reset all
          </button>
          <button
            onClick={save}
            className="rounded border border-[#4A4A55] bg-[#1C1C21] px-3 py-1.5 text-[13px] font-bold text-[#EDEDEF] hover:border-[#71717C]"
          >
            Save
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-[#2E2E36]">
        <table className="w-full min-w-[860px] border-collapse text-[13px]">
          <thead>
            <tr className="text-[11px] uppercase tracking-widest text-[#71717C]">
              <th className="p-3 text-left font-bold">Turret</th>
              <th className="p-3 text-right font-bold">DPS</th>
              <th className="p-3 text-left font-bold">Coefficient</th>
              <th className="p-3 text-right font-bold">Growth</th>
              <th className="p-3 text-right font-bold">1st</th>
              <th className="p-3 text-right font-bold">10th</th>
              <th className="p-3 text-right font-bold">100th</th>
              <th className="p-3 text-right font-bold">Cap</th>
            </tr>
          </thead>
          <tbody>
            {TOWER_KINDS.map((k) => {
              const node = techNode(k);
              const tune = tuneOf(k);
              const bent = tune !== authored(k);
              return (
                <tr key={k} className="border-t border-[#2E2E36] hover:bg-[#151518]/60">
                  <td className="p-3">
                    <span className="font-bold text-[#EDEDEF]">{TOWERS[k].name}</span>
                    <span className="ml-2 text-[12px] text-[#71717C]">
                      {TOWERS[k].size}×{TOWERS[k].size}
                    </span>
                  </td>
                  <td className={`p-3 text-right text-[#A6A6AF] ${NUM}`}>
                    {node.dps.toLocaleString()}
                  </td>
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        min={0.1}
                        max={3}
                        step={0.01}
                        value={Math.min(3, tune)}
                        onChange={(e) => set(k, Number(e.target.value))}
                        className="w-28 accent-[#EDEDEF]"
                        aria-label={`${TOWERS[k].name} coefficient`}
                      />
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step={0.01}
                        value={tune}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          if (Number.isFinite(v)) set(k, v);
                        }}
                        className={`w-20 rounded border border-[#2E2E36] bg-[#0B0B0D] px-2 py-1 text-right text-[#EDEDEF] ${NUM}`}
                      />
                      <button
                        onClick={() => set(k, undefined)}
                        disabled={!bent}
                        title={`Back to ${authored(k)}`}
                        className="rounded border border-[#2E2E36] px-2 py-1 text-[11px] text-[#71717C] hover:border-[#4A4A55] disabled:opacity-30"
                      >
                        Reset
                      </button>
                    </div>
                  </td>
                  <td className={`p-3 text-right ${NUM} ${bent ? "text-[#EDEDEF]" : "text-[#71717C]"}`}>
                    {growthOf(k).toFixed(4)}
                  </td>
                  <td className={`p-3 text-right text-[#A6A6AF] ${NUM}`}>{copperAt(k, 1)}</td>
                  <td className={`p-3 text-right text-[#A6A6AF] ${NUM}`}>{copperAt(k, 10)}</td>
                  <td className={`p-3 text-right text-[#A6A6AF] ${NUM}`}>{copperAt(k, 100)}</td>
                  <td className={`p-3 text-right text-[#71717C] ${NUM}`}>
                    {techCeiling(k).toLocaleString()}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-[12px] text-[#71717C]">
        Prices are copper only — the other currencies ride the same curve at the ratio each base
        bundle sets. Saving writes only the rows you have bent; the rest keep reading tech.ts. Once
        a number is settled, move it into the node so the reasoning lives next to it.
      </p>
    </div>
  );
}
