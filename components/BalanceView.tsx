"use client";

import { useCallback, useMemo, useState } from "react";
import { saveBalanceDoc, type BalanceDoc } from "@/game/balance";
import { TOWERS } from "@/game/constants";
import { costEntries, ITEM_INFO, type ItemKind } from "@/game/items";
import {
  allDifficultyOverrides,
  authoredDifficultyKnobs,
  DIFFICULTIES,
  difficultyKnobsOf,
  setDifficultyKnob,
  type DifficultyKnobs,
} from "@/game/ladder";
import {
  allOverrides,
  authoredKnobs,
  globalGrowth,
  knobsOf,
  MINDUSTRY_VALUE,
  recommendedBase,
  setGlobalGrowth,
  setKnob,
  SHARED_GROWTH,
  techCap,
  techNode,
  techPrice,
  type Knobs,
} from "@/game/tech";
import { TOWER_KINDS, type TowerKind } from "@/game/types";

const NUM = "font-mono tabular-nums";
const SERIES = "#3987e5";

/** the list reads cheapest-first the way Mindustry itself prices these turrets */
const BY_MINDUSTRY_VALUE = [...TOWER_KINDS].sort(
  (a, b) => MINDUSTRY_VALUE[a] - MINDUSTRY_VALUE[b],
);

/** the item a bundle leads with — what the graph and the knob are denominated in */
function leadItem(tower: TowerKind): ItemKind {
  const first = costEntries(techNode(tower).price.base)[0];
  return (first?.item ?? "copper") as ItemKind;
}

/** every currency in this node's bundle, in ITEM_KINDS order */
function itemsOf(tower: TowerKind): ItemKind[] {
  return costEntries(techNode(tower).price.base).map((e) => e.item as ItemKind);
}

/** the whole nth purchase (1-indexed), not just its lead currency */
function bundleAt(tower: TowerKind, n: number): Partial<Record<ItemKind, number>> {
  return techPrice(tower, n - 1);
}

/** one currency of the nth purchase */
function priceAt(tower: TowerKind, n: number, item: ItemKind): number {
  return techPrice(tower, n - 1)[item] ?? 0;
}

const fmt = (x: number): string =>
  x >= 1e9
    ? (x / 1e9).toFixed(1) + "B"
    : x >= 1e6
      ? (x / 1e6).toFixed(1) + "M"
      : x >= 1e4
        ? Math.round(x / 1e3) + "k"
        : Math.round(x).toLocaleString();

/**
 * One slider plus one number field, because neither alone is enough: the
 * slider is for sweeping until it looks right, the field for typing the value
 * back once you know it.
 */
function Knob({
  label,
  hint,
  value,
  min,
  max,
  step,
  decimals,
  onChange,
  onReset,
  bent,
}: {
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  step: number;
  decimals: number;
  onChange: (v: number) => void;
  onReset: () => void;
  bent: boolean;
}) {
  return (
    <div className="border-t border-[#2E2E36] py-3 first:border-t-0">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[13px] font-bold text-[#EDEDEF]">{label}</span>
        <div className="flex items-center gap-2">
          <input
            type="number"
            value={Number(value.toFixed(decimals))}
            min={min}
            step={step}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (Number.isFinite(v)) onChange(v);
            }}
            className={`w-24 rounded border border-[#2E2E36] bg-[#0B0B0D] px-2 py-1 text-right text-[13px] text-[#EDEDEF] ${NUM}`}
          />
          <button
            onClick={onReset}
            disabled={!bent}
            className="rounded border border-[#2E2E36] px-2 py-1 text-[11px] text-[#71717C] hover:border-[#4A4A55] disabled:opacity-30"
          >
            Reset
          </button>
        </div>
      </div>
      <input
        type="range"
        value={Math.min(max, Math.max(min, value))}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-2 w-full accent-[#3987e5]"
        aria-label={label}
      />
      <p className="mt-1 text-[11.5px] text-[#71717C]">{hint}</p>
    </div>
  );
}

export default function BalanceView() {
  const [sel, setSel] = useState<TowerKind>("duo");
  const [, bump] = useState(0);
  const [status, setStatus] = useState<string | null>(null);
  const [span, setSpan] = useState(200);
  const [hover, setHover] = useState<number | null>(null);

  const k = knobsOf(sel);
  const authored = authoredKnobs(sel);
  const node = techNode(sel);
  const cap = techCap(sel);
  const lead = leadItem(sel);
  const shown = Math.min(cap, Math.max(10, span));

  const setGrowth = useCallback((v: number | undefined) => {
    setGlobalGrowth(v);
    setStatus(null);
    bump((n) => n + 1);
  }, []);

  const set = useCallback((knob: keyof Knobs, v: number | undefined) => {
    setKnob(sel, knob, v);
    setStatus(null);
    bump((n) => n + 1);
  }, [sel]);

  const setDifficulty = useCallback(
    (tier: number, knob: keyof DifficultyKnobs, v: number | undefined) => {
      setDifficultyKnob(tier, knob, v);
      setStatus(null);
      bump((n) => n + 1);
    },
    [],
  );

  const save = useCallback(async () => {
    const doc: BalanceDoc = { ...allOverrides() };
    const diffs = allDifficultyOverrides();
    if (Object.keys(diffs).length > 0) doc.difficulties = diffs;
    setStatus((await saveBalanceDoc(doc)) ? "Saved" : "Save failed");
  }, []);

  // the curve, plus the running total, sampled across the window on screen
  const curve = useMemo(() => {
    const step = Math.max(1, Math.round(shown / 240));
    const ns: number[] = [];
    for (let n = 1; n <= shown; n += step) ns.push(n);
    if (ns[ns.length - 1] !== shown) ns.push(shown);
    // every currency rides the same growth, so these come out parallel — which
    // is the point: the graph should show that the whole bundle moves together
    return itemsOf(sel).map((item) => ({
      item,
      pts: ns.map((n) => ({ n, p: priceAt(sel, n, item) })),
    }));
    // knobs live in module state, so the bump counter is the real dependency
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel, shown, k.base, k.growth]);

  const spendTo = useCallback(
    (n: number): Partial<Record<ItemKind, number>> => {
      const total: Partial<Record<ItemKind, number>> = {};
      for (let i = 1; i <= n; i++)
        for (const e of costEntries(bundleAt(sel, i)))
          total[e.item as ItemKind] = (total[e.item as ItemKind] ?? 0) + e.amount;
      return total;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sel, k.base, k.growth],
  );

  const W = 720, H = 300, PL = 62, PR = 16, PT = 14, PB = 30;
  const IW = W - PL - PR, IH = H - PT - PB;
  const top = Math.max(1, ...curve.flatMap((c) => c.pts.map((q) => q.p))) * 1.05;
  const X = (n: number) => PL + ((n - 1) / Math.max(1, shown - 1)) * IW;
  const Y = (p: number) => PT + IH - (p / top) * IH;
  const pathOf = (pts: { n: number; p: number }[]) =>
    pts.map((c, i) => (i ? "L" : "M") + X(c.n).toFixed(1) + " " + Y(c.p).toFixed(1)).join("");
  const yTicks = [0, top / 2, top];
  const rec = recommendedBase(sel);
  const firstBundle = costEntries(bundleAt(sel, 1));
  // growth is global now, so a turret is bent only by its own base
  const bentAny = k.base !== authored.base;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
        <p className="max-w-3xl text-[13px] leading-relaxed text-[#71717C]">
          One knob per turret: <span className="text-[#A6A6AF]">base</span>, what its first
          purchase costs. Editing it rescales the whole bundle, so the drop-ratio shape survives
          and only the size moves; the order of those bases comes from Mindustry&apos;s build
          costs, so moving one past its neighbours gives that up.{" "}
          <span className="text-[#A6A6AF]">Growth</span> is one number for the whole tree — every
          turret climbs at the same rate, so that knob bends all fifteen ladders together. Caps
          come from footprint and nothing here changes them.
        </p>
        <div className="flex shrink-0 items-center gap-2">
          {status && <span className="text-[13px] text-[#71717C]">{status}</span>}
          <button
            onClick={save}
            className="rounded border border-[#4A4A55] bg-[#1C1C21] px-3 py-1.5 text-[13px] font-bold text-[#EDEDEF] hover:border-[#71717C]"
          >
            Save
          </button>
        </div>
      </div>

      {/* enemy-side dials, saved into the same document under `difficulties` */}
      <div className="mb-4 rounded-lg border border-[#2E2E36] p-4">
        <div className="mb-1 text-[15px] font-bold text-[#EDEDEF]">Difficulty scaling</div>
        <p className="mb-3 max-w-3xl text-[12.5px] leading-relaxed text-[#71717C]">
          Enemy-side dials, applied at spawn. <span className="text-[#A6A6AF]">Shield ×</span>{" "}
          multiplies every shield ability&apos;s pool, cap and regen (quasar bubbles, pulsar and
          scepter fields). <span className="text-[#A6A6AF]">Armour +</span> is added flat to every
          body on that side; the shave is floored at 10% of the hit, so small-calibre turrets feel
          it hardest, the lancer counts armour ×4, and burning ignores it entirely. Scatter fires
          3-damage pellets — move air armour in ones.
        </p>
        <div className="grid gap-4 md:grid-cols-3">
          {DIFFICULTIES.map((d, tier) => {
            const dk = difficultyKnobsOf(tier);
            const da = authoredDifficultyKnobs(tier);
            return (
              <div key={d.name} className="rounded border border-[#2E2E36] px-3 py-1">
                <div className="flex items-baseline justify-between pt-2">
                  <span className="text-[14px] font-bold text-[#EDEDEF]">{d.name}</span>
                  <span className={`text-[11px] text-[#71717C] ${NUM}`}>
                    enemy level {d.level}
                  </span>
                </div>
                <Knob
                  label="Shield ×"
                  hint="multiplier on every shield pool, cap and regen"
                  value={dk.shieldScale}
                  min={0}
                  max={50}
                  step={0.5}
                  decimals={1}
                  bent={dk.shieldScale !== da.shieldScale}
                  onChange={(v) => setDifficulty(tier, "shieldScale", Math.max(0, v))}
                  onReset={() => setDifficulty(tier, "shieldScale", undefined)}
                />
                <Knob
                  label="Ground armour +"
                  hint="flat armour on every walker"
                  value={dk.groundArmorBonus}
                  min={0}
                  max={20}
                  step={1}
                  decimals={0}
                  bent={dk.groundArmorBonus !== da.groundArmorBonus}
                  onChange={(v) => setDifficulty(tier, "groundArmorBonus", Math.max(0, v))}
                  onReset={() => setDifficulty(tier, "groundArmorBonus", undefined)}
                />
                <Knob
                  label="Air armour +"
                  hint="flat armour on every flyer — scatter pays for every point"
                  value={dk.airArmorBonus}
                  min={0}
                  max={20}
                  step={1}
                  decimals={0}
                  bent={dk.airArmorBonus !== da.airArmorBonus}
                  onChange={(v) => setDifficulty(tier, "airArmorBonus", Math.max(0, v))}
                  onReset={() => setDifficulty(tier, "airArmorBonus", undefined)}
                />
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
        {/* turret picker */}
        <div className="max-h-[560px] overflow-y-auto rounded-lg border border-[#2E2E36]">
          {BY_MINDUSTRY_VALUE.map((t) => {
            const kk = knobsOf(t);
            const a = authoredKnobs(t);
            const dirty = kk.base !== a.base;
            return (
              <button
                key={t}
                onClick={() => setSel(t)}
                className={`flex w-full items-baseline justify-between border-b border-[#2E2E36] px-3 py-2 text-left last:border-b-0 ${
                  t === sel ? "bg-[#1C1C21]" : "hover:bg-[#151518]"
                }`}
              >
                <span className={t === sel ? "font-bold text-[#EDEDEF]" : "text-[#A6A6AF]"}>
                  {TOWERS[t].name}
                  {dirty && <span className="ml-1 text-[#3987e5]">•</span>}
                </span>
                <span className={`shrink-0 text-[11px] text-[#71717C] ${NUM}`}>
                  {TOWERS[t].size}×{TOWERS[t].size} · cap {techCap(t).toLocaleString()}
                </span>
              </button>
            );
          })}
        </div>

        {/* knobs and graph */}
        <div className="rounded-lg border border-[#2E2E36] p-4">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
            <div>
              <span className="text-[15px] font-bold text-[#EDEDEF]">{TOWERS[sel].name}</span>
              <span className={`ml-2 text-[12px] text-[#71717C] ${NUM}`}>
                {TOWERS[sel].size}×{TOWERS[sel].size} · cap {cap.toLocaleString()}
                {node.dps !== undefined && ` · ${node.dps.toLocaleString()} dps`}
              </span>
            </div>
            <div className={`text-[12px] text-[#71717C] ${NUM}`}>
              {firstBundle.length} {firstBundle.length === 1 ? "currency" : "currencies"}, all
              riding the same growth
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-[290px_1fr]">
            <div>
              <Knob
                label="Base"
                hint={
                  `${ITEM_INFO[lead].name} for the first one; the rest of the bundle follows` +
                  (rec !== null ? ` · ${rec.toLocaleString()} is what its damage suggests` : "")
                }
                value={k.base}
                min={1}
                max={Math.max(50, Math.round(authored.base * 4))}
                step={1}
                decimals={0}
                bent={k.base !== authored.base}
                onChange={(v) => set("base", Math.max(0.01, v))}
                onReset={() => set("base", undefined)}
              />

              <Knob
                label="Growth (every turret)"
                hint="cost multiplier per purchase, shared by the whole tree — small numbers compound hard"
                value={globalGrowth()}
                min={1}
                max={1.2}
                step={0.0001}
                decimals={4}
                bent={globalGrowth() !== SHARED_GROWTH}
                onChange={(v) => setGrowth(v)}
                onReset={() => setGrowth(undefined)}
              />
              <div className="border-t border-[#2E2E36] pt-3">
                <div className="flex items-baseline justify-between">
                  <span className="text-[12px] text-[#71717C]">Graph range</span>
                  <span className={`text-[12px] text-[#A6A6AF] ${NUM}`}>
                    1 – {shown.toLocaleString()}
                  </span>
                </div>
                <input
                  type="range"
                  min={10}
                  max={cap}
                  step={10}
                  value={shown}
                  onChange={(e) => setSpan(Number(e.target.value))}
                  className="mt-2 w-full accent-[#71717C]"
                  aria-label="Graph range"
                />
              </div>
              {bentAny && (
                <button
                  onClick={() => {
                    set("base", undefined);
                  }}
                  className="mt-3 w-full rounded border border-[#2E2E36] px-2 py-1.5 text-[12px] text-[#A6A6AF] hover:border-[#4A4A55]"
                >
                  Reset this turret
                </button>
              )}
            </div>

            <div>
              <svg
                viewBox={`0 0 ${W} ${H}`}
                className="w-full"
                role="img"
                aria-label={`${TOWERS[sel].name}: ${ITEM_INFO[lead].name} per purchase across the first ${shown}`}
                onPointerMove={(e) => {
                  const r = e.currentTarget.getBoundingClientRect();
                  const sx = ((e.clientX - r.left) / r.width) * W;
                  if (sx < PL - 6 || sx > W - PR + 6) return setHover(null);
                  setHover(
                    Math.max(1, Math.min(shown, Math.round(1 + ((sx - PL) / IW) * (shown - 1)))),
                  );
                }}
                onPointerLeave={() => setHover(null)}
              >
                {yTicks.map((v) => (
                  <g key={v}>
                    <line
                      x1={PL}
                      y1={Y(v)}
                      x2={W - PR}
                      y2={Y(v)}
                      stroke="#2b2e2f"
                      strokeWidth={1}
                    />
                    <text
                      x={PL - 8}
                      y={Y(v) + 4}
                      textAnchor="end"
                      className={NUM}
                      fontSize={11}
                      fill="#898781"
                    >
                      {fmt(v)}
                    </text>
                  </g>
                ))}
                {curve.map((c) => (
                  <path
                    key={c.item}
                    d={pathOf(c.pts)}
                    fill="none"
                    stroke={ITEM_INFO[c.item].color}
                    strokeWidth={2}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                ))}
                {hover !== null && (
                  <>
                    <line
                      x1={X(hover)}
                      y1={PT}
                      x2={X(hover)}
                      y2={PT + IH}
                      stroke="#898781"
                      strokeWidth={1}
                    />
                    {curve.map((c) => (
                      <circle
                        key={c.item}
                        cx={X(hover)}
                        cy={Y(priceAt(sel, hover, c.item))}
                        r={4}
                        fill={ITEM_INFO[c.item].color}
                        stroke="#0B0B0D"
                        strokeWidth={2}
                      />
                    ))}
                  </>
                )}
                <line x1={PL} y1={PT + IH} x2={W - PR} y2={PT + IH} stroke="#383835" strokeWidth={1} />
                <text x={PL} y={H - 8} fontSize={11} fill="#898781" className={NUM}>
                  1
                </text>
                <text
                  x={W - PR}
                  y={H - 8}
                  textAnchor="end"
                  fontSize={11}
                  fill="#898781"
                  className={NUM}
                >
                  {shown.toLocaleString()}
                </text>
              </svg>

              <div className="mt-1 rounded border border-[#2E2E36] bg-[#0B0B0D] p-3">
                <div className={`text-[12.5px] ${NUM}`}>
                  <div className="mb-1 text-[#71717C]">
                    {hover === null ? (
                      "first purchase — hover the graph to read any other"
                    ) : (
                      <>
                        purchase{" "}
                        <span className="text-[#EDEDEF]">{hover.toLocaleString()}</span>
                      </>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-x-5 gap-y-1">
                    {itemsOf(sel).map((it) => (
                      <span key={it} className="inline-flex items-center gap-1.5">
                        <span
                          className="inline-block h-2.5 w-2.5 rounded-sm"
                          style={{ background: ITEM_INFO[it].color }}
                        />
                        <span className="text-[#EDEDEF]">
                          {Math.round(priceAt(sel, hover ?? 1, it)).toLocaleString()}
                        </span>
                        <span className="text-[#71717C]">{ITEM_INFO[it].name}</span>
                        {hover !== null && (
                          <span className="text-[#5A5A63]">
                            ({fmt(spendTo(hover)[it] ?? 0)} spent)
                          </span>
                        )}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
