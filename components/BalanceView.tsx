"use client";

import { useCallback, useMemo, useState } from "react";
import { saveBalanceDoc, type BalanceDoc } from "@/game/balance";
import { TOWERS } from "@/game/constants";
import { costEntries, ITEM_INFO, type ItemKind } from "@/game/items";
import {
  allOverrides,
  authoredKnobs,
  knobsOf,
  recommendedBase,
  setKnob,
  techCap,
  techNode,
  techPrice,
  type Knobs,
} from "@/game/tech";
import { TOWER_KINDS, type TowerKind } from "@/game/types";

const NUM = "font-mono tabular-nums";
const SERIES = "#3987e5";

/** the item a bundle leads with — what the graph and the knob are denominated in */
function leadItem(tower: TowerKind): ItemKind {
  const first = costEntries(techNode(tower).price.base)[0];
  return (first?.item ?? "copper") as ItemKind;
}

/** price of the nth purchase (1-indexed) in the bundle's lead currency */
function priceAt(tower: TowerKind, n: number): number {
  return techPrice(tower, n - 1)[leadItem(tower)] ?? 0;
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

  const set = useCallback((knob: keyof Knobs, v: number | undefined) => {
    setKnob(sel, knob, v);
    setStatus(null);
    bump((n) => n + 1);
  }, [sel]);

  const save = useCallback(async () => {
    setStatus((await saveBalanceDoc(allOverrides() as BalanceDoc)) ? "Saved" : "Save failed");
  }, []);

  // the curve, plus the running total, sampled across the window on screen
  const curve = useMemo(() => {
    const step = Math.max(1, Math.round(shown / 240));
    const pts: { n: number; p: number }[] = [];
    for (let n = 1; n <= shown; n += step) pts.push({ n, p: priceAt(sel, n) });
    if (pts[pts.length - 1]?.n !== shown) pts.push({ n: shown, p: priceAt(sel, shown) });
    return pts;
    // knobs live in module state, so the bump counter is the real dependency
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel, shown, k.baseScale, k.multiplier, k.growth]);

  const spendTo = useCallback(
    (n: number) => {
      let t = 0;
      for (let i = 1; i <= n; i++) t += priceAt(sel, i);
      return t;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sel, k.baseScale, k.multiplier, k.growth],
  );

  const W = 720, H = 300, PL = 62, PR = 16, PT = 14, PB = 30;
  const IW = W - PL - PR, IH = H - PT - PB;
  const top = Math.max(1, ...curve.map((c) => c.p)) * 1.05;
  const X = (n: number) => PL + ((n - 1) / Math.max(1, shown - 1)) * IW;
  const Y = (p: number) => PT + IH - (p / top) * IH;
  const path = curve.map((c, i) => (i ? "L" : "M") + X(c.n).toFixed(1) + " " + Y(c.p).toFixed(1)).join("");
  const area = path + "L" + X(shown).toFixed(1) + " " + (PT + IH) + "L" + PL + " " + (PT + IH) + "Z";
  const yTicks = [0, top / 2, top];
  const rec = recommendedBase(sel);
  const bentAny = k.baseScale !== 1 || k.multiplier !== authored.multiplier || k.growth !== authored.growth;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
        <p className="max-w-3xl text-[13px] leading-relaxed text-[#71717C]">
          Three independent knobs:{" "}
          <span className="text-[#A6A6AF]">base</span> is what the first purchase costs,{" "}
          <span className="text-[#A6A6AF]">multiplier</span> scales the whole node at once, and{" "}
          <span className="text-[#A6A6AF]">growth</span> is how steeply it climbs. Base and
          multiplier compose — both scale every price, so use base to set the start and multiplier
          to move a turret without touching its bundle. Caps come from footprint and nothing here
          changes them.
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

      <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
        {/* turret picker */}
        <div className="max-h-[560px] overflow-y-auto rounded-lg border border-[#2E2E36]">
          {TOWER_KINDS.map((t) => {
            const kk = knobsOf(t);
            const a = authoredKnobs(t);
            const dirty = kk.baseScale !== 1 || kk.multiplier !== a.multiplier || kk.growth !== a.growth;
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
                <span className={`text-[11px] text-[#71717C] ${NUM}`}>
                  {TOWERS[t].size}×{TOWERS[t].size} · {kk.growth.toFixed(4)}
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
              first purchase:{" "}
              {costEntries(techPrice(sel, 0))
                .map((e) => `${Math.round(e.amount).toLocaleString()} ${ITEM_INFO[e.item].name}`)
                .join(" · ")}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-[290px_1fr]">
            <div>
              <Knob
                label="Base"
                hint={
                  `${ITEM_INFO[lead].name} for the first one` +
                  (rec !== null ? ` · ${rec.toLocaleString()} is what its damage suggests` : "")
                }
                value={priceAt(sel, 1)}
                min={1}
                max={Math.max(50, Math.round((techNode(sel).price.base[lead] ?? 1) * 4))}
                step={1}
                decimals={0}
                bent={k.baseScale !== 1}
                onChange={(v) => {
                  const authoredLead = techNode(sel).price.base[lead] ?? 1;
                  set("baseScale", Math.max(0.001, v / (authoredLead * k.multiplier)));
                }}
                onReset={() => set("baseScale", undefined)}
              />
              <Knob
                label="Multiplier"
                hint="scales every price on this node at once"
                value={k.multiplier}
                min={0.05}
                max={4}
                step={0.01}
                decimals={2}
                bent={k.multiplier !== authored.multiplier}
                onChange={(v) => set("multiplier", v)}
                onReset={() => set("multiplier", undefined)}
              />
              <Knob
                label="Growth"
                hint="cost multiplier per purchase — small numbers compound hard"
                value={k.growth}
                min={1}
                max={1.2}
                step={0.0001}
                decimals={4}
                bent={k.growth !== authored.growth}
                onChange={(v) => set("growth", v)}
                onReset={() => set("growth", undefined)}
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
                    (["baseScale", "multiplier", "growth"] as const).forEach((x) => set(x, undefined));
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
                <path d={area} fill={SERIES} fillOpacity={0.12} />
                <path
                  d={path}
                  fill="none"
                  stroke={SERIES}
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
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
                    <circle
                      cx={X(hover)}
                      cy={Y(priceAt(sel, hover))}
                      r={4}
                      fill={SERIES}
                      stroke="#191b1c"
                      strokeWidth={2}
                    />
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
                {hover === null ? (
                  <p className="text-[12px] text-[#71717C]">
                    Hover the curve to read any purchase — price, and everything spent to reach it.
                  </p>
                ) : (
                  <div className={`flex flex-wrap gap-x-6 gap-y-1 text-[12.5px] ${NUM}`}>
                    <span className="text-[#71717C]">
                      purchase <span className="text-[#EDEDEF]">{hover.toLocaleString()}</span>
                    </span>
                    <span className="text-[#71717C]">
                      costs{" "}
                      <span className="text-[#EDEDEF]">
                        {Math.round(priceAt(sel, hover)).toLocaleString()} {ITEM_INFO[lead].name}
                      </span>
                    </span>
                    <span className="text-[#71717C]">
                      spent by then{" "}
                      <span className="text-[#EDEDEF]">{fmt(spendTo(hover))}</span>
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
