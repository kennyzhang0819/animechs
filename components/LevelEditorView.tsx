"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  UNIT_KINDS,
  UNIT_STATS,
  UNIT_TREES,
  levelDoc,
  saveLevel,
  waveGroups,
  WAVE_RELEASE_SECONDS,
  type LevelSpec,
  type LevelStep,
  type RegionWave,
  type UnitKind,
  type WaveUnits,
} from "@/game/levels";
import { dropsForKills } from "@/game/progress";
import {
  audit,
  check,
  difficultyName,
  difficultyOf,
  DIFFICULTIES,
  tierDropBonus,
  tierOfWave,
  TOP_TIER,
  waveGuide,
  WALL_STEP,
  type AuditRow,
  type LadderIssue,
  type WaveRow,
} from "@/game/ladder";
import {
  drawThumb,
  loadMap,
  OFFICIAL_MAP_IDS,
  spawnRegionIds,
  spawnRegionStyle,
} from "@/game/maps";
import { CostRow } from "./Items";

/* eslint-disable @next/next/no-img-element -- raw pixel sprites, no optimization wanted */

const unitIcon = (k: UnitKind): string => `/mindustry/sprites/units/${k}.png`;

/** health runs to nine figures at the top difficulty; a table cell wants
 * three characters and a suffix, not 20,276,477 */
const compactHp = (hp: number): string =>
  hp >= 1e9
    ? `${(hp / 1e9).toFixed(1)}B`
    : hp >= 1e6
      ? `${(hp / 1e6).toFixed(1)}M`
      : hp >= 1e3
        ? `${(hp / 1e3).toFixed(0)}k`
        : `${Math.round(hp)}`;

/** region 0 is "any pad"; 1+ are the map's painted spawn regions */
const regionCss = (region: number): string =>
  region <= 0 ? "#A6A6AF" : spawnRegionStyle(region).css;

const regionLabel = (region: number): string => (region <= 0 ? "Any pad" : `Region ${region}`);

// ---------- the editing model ----------

/**
 * The script is edited in a normalized form and serialized back on save.
 * Every wave is a list of REGION GROUPS here, even the ones written in the
 * plain `{ wave: { dagger: 10 } }` shorthand — that shorthand is just a
 * single group aimed at region 0, and collapsing the two cases means the
 * region controls work identically on every wave.
 *
 * `uid` exists only so React keys survive reordering: splicing a step out of
 * the middle shifts every index below it, and index keys would make the row
 * that moved keep the input state of the row that replaced it.
 */
interface EditGroup {
  uid: number;
  region: number;
  counts: Partial<Record<UnitKind, number>>;
}

/** a step is always a wave — pacing is one waveGap for the whole level */
interface EditStep {
  uid: number;
  groups: EditGroup[];
}

let nextUid = 1;
const uid = (): number => nextUid++;

function toEditSteps(script: readonly LevelStep[]): EditStep[] {
  return script.map((step) => {
    const groups = waveGroups(step.wave).map(({ region, counts }) => {
      const byKind: Partial<Record<UnitKind, number>> = {};
      counts.forEach((n, i) => {
        if (n > 0) byKind[UNIT_KINDS[i]] = n;
      });
      return { uid: uid(), region, counts: byKind };
    });
    // a wave that lost every unit still has to stay editable, or deleting
    // the last count would silently delete the wave itself
    return {
      uid: uid(),
      groups: groups.length ? groups : [{ uid: uid(), region: 0, counts: {} }],
    };
  });
}

/**
 * Back to the on-disk shape. A single region-0 group round-trips to the
 * plain `{ wave: { dagger: 10 } }` form so hand-written levels stay readable
 * after an edit; anything else becomes the region-group array.
 */
function toScript(steps: readonly EditStep[]): LevelStep[] {
  return steps.map((step) => {
    const live = step.groups
      .map((g) => ({ region: g.region, counts: trimCounts(g.counts) }))
      .filter((g) => Object.keys(g.counts).length > 0);
    if (live.length === 1 && live[0].region === 0) return { wave: live[0].counts as WaveUnits };
    return { wave: live.map((g) => ({ region: g.region, ...g.counts }) as RegionWave) };
  });
}

/** drop zeros and blanks — a count of 0 is noise in the saved document */
function trimCounts(counts: Partial<Record<UnitKind, number>>): Partial<Record<UnitKind, number>> {
  const out: Partial<Record<UnitKind, number>> = {};
  for (const k of UNIT_KINDS) {
    const n = counts[k];
    if (typeof n === "number" && n > 0) out[k] = Math.floor(n);
  }
  return out;
}

/**
 * The ladder report: one row per tier, flagged where the climb is uneven.
 *
 * What it is NOT is a feasibility test. Turret prices are flat and every run
 * banks something, so a player can always farm the tier below until they can
 * afford the next — no tier here is unwinnable. `step` measures GRIND: a
 * tier costing twice what the last one did is twice the farming before it
 * opens, and a few of those stacked turn a climb into a chore. That is the
 * failure mode an idle game actually has.
 */
function LadderReport({
  rows,
  issues,
}: {
  rows: readonly AuditRow[];
  issues: readonly LadderIssue[];
}) {
  const byTier = new Map<number, LadderIssue[]>();
  for (const i of issues) {
    if (i.tier == null) continue;
    const list = byTier.get(i.tier) ?? [];
    list.push(i);
    byTier.set(i.tier, list);
  }
  const KIND_CSS: Record<LadderIssue["kind"], string> = {
    debut: "border-[#3A3A46] bg-[#1C1C22] text-[#A6A6AF]",
    unreachable: "border-[#5B2E2E] bg-[#2A1616] text-[#FF8A8A]",
    wall: "border-[#5B4A2E] bg-[#2A2116] text-[#F0B457]",
    filler: "border-[#2E4A5B] bg-[#16222A] text-[#8DA1E3]",
    economy: "border-[#3A3A46] bg-[#1C1C22] text-[#A6A6AF]",
  };
  const loose = issues.filter((i) => i.tier == null);

  return (
    <section className="mb-3 rounded-lg border border-[#2E2E36] bg-[#151518] p-3">
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="text-[12px] font-bold uppercase tracking-widest text-[#71717C]">
          Ladder check
        </h2>
        <span
          className={`text-[12px] font-bold uppercase tracking-widest ${
            issues.length ? "text-[#F0B457]" : "text-[#7BE58A]"
          }`}
        >
          {issues.length
            ? `${issues.length} finding${issues.length > 1 ? "s" : ""}`
            : "Clean"}
        </span>
      </div>

      {/* findings about the script as a whole, with no difficulty to sit on */}
      {loose.length > 0 && (
        <div className="mb-2 space-y-1">
          {loose.map((f, n) => (
            <div
              key={n}
              className={`rounded border px-1.5 py-0.5 text-[12px] leading-snug ${KIND_CSS[f.kind]}`}
            >
              <span className="font-bold uppercase tracking-widest">{f.kind}</span> {f.message}
            </div>
          ))}
        </div>
      )}

      {/* one row a difficulty. `step` is the number to author against:
          1.79x is the floor the +10 enemy levels give for free, and
          everything above it was bought by the fifteen new waves */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-[13px]">
          <thead className="text-[12px] uppercase tracking-widest text-[#71717C]">
            <tr>
              <th className="py-1 pr-3 font-normal">Difficulty</th>
              <th className="py-1 pr-3 font-normal">Waves</th>
              <th className="py-1 pr-3 text-right font-normal">Lv</th>
              <th className="py-1 pr-3 text-right font-normal">Enemies</th>
              <th className="py-1 pr-3 text-right font-normal">Health</th>
              <th className="py-1 pr-3 text-right font-normal">Step</th>
              <th className="py-1 pr-3 text-right font-normal">Armour</th>
              <th className="py-1 pr-3 text-right font-normal">T3</th>
              <th className="py-1 font-normal">Findings</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const found = byTier.get(r.tier) ?? [];
              const steep = r.tier > 0 && r.step > WALL_STEP;
              return (
                <tr
                  key={r.tier}
                  className={`border-t border-[#222227] ${
                    found.length ? "bg-[#1A1A1F]" : ""
                  }`}
                >
                  <td className="py-1 pr-3 font-bold text-[#EDEDEF]">{r.name}</td>
                  <td className="py-1 pr-3 text-[#A6A6AF]">{r.waves}</td>
                  <td className="py-1 pr-3 text-right text-[#71717C]">{r.level}</td>
                  <td className="py-1 pr-3 text-right text-[#A6A6AF]">
                    {r.units.toLocaleString()}
                  </td>
                  <td className="py-1 pr-3 text-right text-[#A6A6AF]">
                    {compactHp(r.hp)}
                  </td>
                  <td
                    className={`py-1 pr-3 text-right font-bold ${
                      r.tier === 0
                        ? "text-[#4A4A55]"
                        : steep
                          ? "text-[#F0B457]"
                          : "text-[#7BE58A]"
                    }`}
                  >
                    {r.tier === 0 ? "—" : `${r.step.toFixed(2)}x`}
                  </td>
                  <td className="py-1 pr-3 text-right text-[#71717C]">
                    {Math.round(r.armourShare * 100)}%
                  </td>
                  <td className="py-1 pr-3 text-right text-[#71717C]">
                    {Math.round(r.t3Share * 100)}%
                  </td>
                  <td className="py-1">
                    {found.length === 0 ? (
                      <span className="text-[#4A4A55]">—</span>
                    ) : (
                      <div className="space-y-1">
                        {found.map((f, n) => (
                          <div
                            key={n}
                            className={`rounded border px-1.5 py-0.5 text-[12px] leading-snug ${KIND_CSS[f.kind]}`}
                          >
                            <span className="font-bold uppercase tracking-widest">
                              {f.kind}
                            </span>{" "}
                            {f.message}
                          </div>
                        ))}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-2 border-t border-[#2E2E36] pt-2 text-[12px] leading-snug text-[#71717C]">
        Health is printed health — the strength measure, weapon-agnostic.
        Armour is shown beside it as composition, never folded into it: an
        armour-heavy difficulty is a different fight at the same strength.
        Step floors at 1.79x (the +10 enemy levels alone); anything above that
        was bought by the ten new waves. Nothing here is unwinnable — prices
        are flat, so a steep step means more farming, not a dead end.
      </p>
    </section>
  );
}

const stepTotal = (step: EditStep): number =>
  step.groups.reduce((sum, g) => sum + UNIT_KINDS.reduce((s, k) => s + (g.counts[k] ?? 0), 0), 0);

/** kill counts indexed like UNIT_KINDS, for the payout preview */
function killVector(groups: readonly EditGroup[]): number[] {
  const counts = UNIT_KINDS.map(() => 0);
  for (const g of groups)
    UNIT_KINDS.forEach((k, i) => {
      counts[i] += g.counts[k] ?? 0;
    });
  return counts;
}

// ---------- small controls ----------

function IconButton({
  label,
  onClick,
  disabled,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded border text-[13px] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#FFD37F] ${
        disabled
          ? "cursor-not-allowed border-[#222227] text-[#4A4A55]"
          : danger
            ? "border-[#3A2430] text-[#FF8A8A] hover:border-[#FF5A5A] hover:bg-[#2A1620]/80"
            : "border-[#2E2E36] text-[#A6A6AF] hover:border-[#4A4A55] hover:bg-[#222227]"
      }`}
    >
      {children}
    </button>
  );
}

function NumberInput({
  value,
  onChange,
  width = "w-20",
  min = 0,
  blankZero,
  label,
}: {
  value: number;
  onChange: (n: number) => void;
  width?: string;
  min?: number;
  /** show 0 as an empty field — a grid of every unit kind is mostly zeros,
   * and a wall of them reads as data rather than as blank slots */
  blankZero?: boolean;
  label?: string;
}) {
  return (
    <input
      type="number"
      min={min}
      aria-label={label}
      placeholder={blankZero ? "0" : undefined}
      value={blankZero && value === 0 ? "" : value}
      onChange={(e) => {
        const n = Number(e.target.value);
        onChange(Number.isFinite(n) ? Math.max(min, Math.floor(n)) : min);
      }}
      className={`${width} rounded border border-[#2E2E36] bg-[#0B0B0D] px-1.5 py-0.5 text-right text-[14px] font-bold text-[#EDEDEF] focus:border-[#FFD37F] focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none`}
    />
  );
}

// ---------- the editor ----------

export default function LevelEditorView({
  level,
  onClose,
}: {
  level: LevelSpec;
  onClose: () => void;
}) {
  const [steps, setSteps] = useState<EditStep[]>(() => toEditSteps(level.script));
  const [waveGap, setWaveGap] = useState(level.waveGap);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  // why the last save was refused — null when the last attempt succeeded
  const [saveError, setSaveError] = useState<string | null>(null);

  // reloading a different level through the same mounted component has to
  // reset the buffer, or the new level opens showing the old one's script
  useEffect(() => {
    setSteps(toEditSteps(level.script));
    setWaveGap(level.waveGap);
    setDirty(false);
  }, [level]);

  const mapId = level.map ?? OFFICIAL_MAP_IDS[0];

  /** the spawn regions this level's map actually paints. A group aimed at a
   * region that isn't here still runs — the sim falls back to any pad and
   * warns on the console — but that is invisible to whoever is authoring the
   * level, so the editor flags it instead */
  const mapRegions = useMemo<number[]>(() => {
    const doc = loadMap(mapId);
    return doc ? spawnRegionIds(doc) : [1];
  }, [mapId]);

  const edit = (fn: (draft: EditStep[]) => EditStep[]): void => {
    setSteps((prev) => fn(prev));
    setDirty(true);
  };

  const save = async (): Promise<void> => {
    setSaving(true);
    setSaveError(null);
    const res = await saveLevel({
      ...levelDoc(level),
      waveGap,
      script: toScript(steps),
    });
    setSaving(false);
    if (res.ok) setDirty(false);
    else setSaveError(res.error);
  };

  /**
   * The summary table folds away; the per-wave numbers never do.
   */
  const [showReport, setShowReport] = useState(true);

  /**
   * THE NUMBER GUIDE, RECOMPUTED ON EVERY EDIT.
   *
   * Computed from the LIVE buffer rather than the saved document — the whole
   * point is to weigh an edit before committing it, so a report of the file
   * on disk would answer the wrong question.
   *
   * The whole walk — every difficulty, every wave, and the findings —
   * measures ~1.3 ms on a 50-wave script, so there is nothing to debounce and
   * no reason to make the author ask for it. Typing a count re-costs the wave
   * under the cursor and re-steps the difficulty it belongs to, live.
   *
   * This replaced a button that computed on demand and blanked itself on
   * every edit, which meant the numbers were only ever visible next to waves
   * that had not been touched since.
   */
  /**
   * The difficulty every per-wave SHARE is measured against. The same wave
   * is a different slice of a 20-wave run and a 50-wave one, and the run you
   * are authoring for is the one whose numbers you want — so it is a choice,
   * not the wave's own debut difficulty.
   */
  const [against, setAgainst] = useState(TOP_TIER);

  const report = useMemo(() => {
    const spec = { ...level, waveGap, script: toScript(steps) };
    return { rows: audit(spec), issues: check(spec), waves: waveGuide(spec, against) };
  }, [level, waveGap, steps, against]);

  const back = (): void => {
    if (dirty && !window.confirm("Discard unsaved changes?")) return;
    onClose();
  };

  // whole-level rollup, recomputed from the live buffer so the header tracks
  // edits rather than the level as it was opened
  const summary = useMemo(() => {
    const waves = steps.filter((s) => stepTotal(s) > 0).length;
    const kills = killVector(steps.flatMap((s) => s.groups));
    return {
      waves,
      enemies: kills.reduce((a, b) => a + b, 0),
      payout: dropsForKills(kills),
    };
  }, [steps]);

  return (
    <div className="h-screen overflow-hidden bg-[#0B0B0D] text-[#EDEDEF]">
      <div className="mx-auto flex h-full max-w-6xl flex-col p-6">
        <header className="mb-5 shrink-0 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold">
              {level.name} — level editor
              {dirty && <span className="ml-1 text-[#F0B457]">●</span>}
            </h1>
            <p className="text-[14px] text-[#71717C]">
              World {level.id} · map <span className="text-[#A6A6AF]">{mapId}</span> · saves to
              public/levels/{level.id}.json and overrides the shipped script
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={save}
              disabled={saving}
              className="rounded border border-[#FFD37F] bg-[#222227] px-4 py-1.5 text-[14px] font-bold uppercase tracking-widest text-[#FFD37F] hover:bg-[#2B2B32] disabled:opacity-50"
            >
              {saving ? "Saving…" : saveError ? "Save failed — retry" : "Save"}
            </button>
            {/* the route explains every refusal; show it rather than
                leaving the author guessing at a rejected script */}
            {saveError && (
              <p role="alert" className="max-w-xs text-[13px] leading-snug text-[#F08A8A]">
                {saveError}
              </p>
            )}
            <button
              onClick={() => setShowReport((v) => !v)}
              aria-pressed={showReport}
              className={`rounded border px-4 py-1.5 text-[14px] uppercase tracking-widest ${
                showReport
                  ? "border-[#7BE58A] bg-[#14271C] text-[#7BE58A]"
                  : report.issues.length
                    ? "border-[#5B4A2E] text-[#F0B457] hover:border-[#7A6440]"
                    : "border-[#2E2E36] text-[#A6A6AF] hover:border-[#4A4A55]"
              }`}
            >
              Ladder{report.issues.length ? ` · ${report.issues.length}` : ""}
            </button>
            <button
              onClick={back}
              className="rounded border border-[#2E2E36] px-4 py-1.5 text-[14px] uppercase tracking-widest text-[#A6A6AF] hover:border-[#4A4A55]"
            >
              Back
            </button>
          </div>
        </header>

        <div className="grid min-h-0 flex-1 gap-5 lg:grid-cols-[260px_1fr]">
          {/* ---- left rail: level settings, map regions, rollup ---- */}
          <aside className="space-y-4 overflow-y-auto pr-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <RampChart waves={report.waves} />
            <RegionKey mapId={mapId} regions={mapRegions} />

            <section className="rounded-lg border border-[#2E2E36] bg-[#151518]/70 p-3">
              <h2 className="mb-2 text-[12px] font-bold uppercase tracking-widest text-[#71717C]">
                Level
              </h2>
              <p className="mb-3 text-[13px] leading-snug text-[#71717C]">
                Every wave walks on over {WAVE_RELEASE_SECONDS}s whatever its
                size, so a bigger wave arrives harder rather than later. Waves
                the drop zones cannot pass that fast simply queue.
              </p>
              <label className="flex items-center justify-between gap-2 text-[14px] text-[#A6A6AF]">
                Time between waves
                <NumberInput
                  value={waveGap}
                  onChange={(n) => {
                    setWaveGap(n);
                    setDirty(true);
                  }}
                />
              </label>
              <p className="mt-1 text-[13px] leading-snug text-[#71717C]">
                Seconds held before each wave. The clock starts when the previous wave has
                finished entering, not when it dies.
              </p>
            </section>

            {/* ECONOMY. One row a difficulty: what a full clear banks (drop
                bonus included) and the shape of it, normalised to copper =
                100. The ratio is the number to author against — the tech tree
                is authored to — see TARGET_DROP_RATIO in ladder.ts, which
                the check below measures every currency against. The BONUS
                cannot move the ratio; only the mix of unit tiers the waves
                send can. */}
            <section className="rounded-lg border border-[#2E2E36] bg-[#151518]/70 p-3">
              <h2 className="mb-2 text-[12px] font-bold uppercase tracking-widest text-[#71717C]">
                Payout per difficulty
              </h2>
              <div className="space-y-2">
                {report.rows.map((r) => (
                  <div key={r.tier}>
                    <div className="flex items-baseline justify-between">
                      <span className="text-[13px] font-bold text-[#EDEDEF]">{r.name}</span>
                      <span className="text-[12px] text-[#71717C]">
                        x{tierDropBonus(r.tier).toFixed(1)}
                      </span>
                    </div>
                    <CostRow cost={r.drops} />
                    <div className="text-[12px] text-[#71717C]">
                      {r.dropRatio
                        .map((v, i) => (i === 0 ? "100" : v.toFixed(v < 10 ? 1 : 0)))
                        .join(" : ")}
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-2 border-t border-[#2E2E36] pt-2 text-[12px] leading-snug text-[#71717C]">
                Copper : titanium : thorium : plastanium : phase — targets are
                TARGET_DROP_RATIO in ladder.ts, one row a difficulty.
              </p>
            </section>

            {/* which run the per-wave SHARE percentages are measured in */}
            <section className="rounded-lg border border-[#2E2E36] bg-[#151518]/70 p-3">
              <h2 className="mb-2 text-[12px] font-bold uppercase tracking-widest text-[#71717C]">
                Share shown for
              </h2>
              <div className="flex gap-1">
                {DIFFICULTIES.map((d, i) => (
                  <button
                    key={d.name}
                    onClick={() => setAgainst(i)}
                    className={`flex-1 rounded border px-2 py-1 text-[13px] font-bold uppercase tracking-widest ${
                      against === i
                        ? "border-[#FFD37F] bg-[#1C1810] text-[#FFD37F]"
                        : "border-[#2E2E36] text-[#71717C] hover:border-[#4A4A55]"
                    }`}
                  >
                    {d.name}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-[12px] leading-snug text-[#71717C]">
                Each wave's % is its share of this run's total health. A wave
                this difficulty never sends shows no share at all.
              </p>
            </section>

            <section className="rounded-lg border border-[#2E2E36] bg-[#151518]/70 p-3">
              <h2 className="mb-2 text-[12px] font-bold uppercase tracking-widest text-[#71717C]">
                Totals
              </h2>
              <dl className="space-y-1 text-[14px]">
                <Row label="Waves" value={String(summary.waves)} />
                <Row label="Enemies" value={String(summary.enemies)} />
                <Row label="Gap time" value={`${summary.waves * waveGap}s`} />
                <Row
                  label="Release time"
                  value={`${Math.ceil(summary.waves * WAVE_RELEASE_SECONDS)}s`}
                />
              </dl>
              <div className="mt-2 border-t border-[#2E2E36] pt-2">
                <div className="mb-1 text-[12px] uppercase tracking-widest text-[#71717C]">
                  Full-clear payout
                </div>
                <CostRow cost={summary.payout} />
              </div>
            </section>
          </aside>

          {/* ---- the script ---- */}
          <main className="min-h-0 overflow-y-auto pr-1">
            {showReport && <LadderReport rows={report.rows} issues={report.issues} />}
            <InsertBar onInsert={() => edit((s) => [makeStep(), ...s])} />
            {steps.map((step, i) => {
              return (
                <div key={step.uid}>
                  <StepCard
                    step={step}
                    waveNo={i + 1}
                    guide={report.waves[i]}
                    against={against}
                    index={i}
                    last={i === steps.length - 1}
                    mapRegions={mapRegions}
                    onChange={(next) =>
                      edit((s) => s.map((cur) => (cur.uid === step.uid ? next : cur)))
                    }
                    onDelete={() => edit((s) => s.filter((cur) => cur.uid !== step.uid))}
                    onMove={(dir) =>
                      edit((s) => {
                        const at = s.findIndex((cur) => cur.uid === step.uid);
                        const to = at + dir;
                        if (to < 0 || to >= s.length) return s;
                        const next = [...s];
                        [next[at], next[to]] = [next[to], next[at]];
                        return next;
                      })
                    }
                  />
                  <InsertBar
                    onInsert={() =>
                      edit((s) => {
                        const at = s.findIndex((cur) => cur.uid === step.uid);
                        const next = [...s];
                        next.splice(at + 1, 0, makeStep());
                        return next;
                      })
                    }
                  />
                </div>
              );
            })}
            {steps.length === 0 && (
              <p className="py-8 text-center text-[14px] text-[#71717C]">
                Empty script — add a wave to begin.
              </p>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}

function makeStep(): EditStep {
  return { uid: uid(), groups: [{ uid: uid(), region: 0, counts: { dagger: 10 } }] };
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-[#71717C]">{label}</dt>
      <dd className="font-bold text-[#EDEDEF]">{value}</dd>
    </div>
  );
}

/** the map's spawn pads, coloured exactly as the map editor paints them, so
 * "region 2" in a wave group is visibly the same place on the map */

/**
 * THE RAMP — the live shape of the run, one point per authored wave.
 *
 * The number that matters here is not any wave's size but whether the curve
 * keeps CLIMBING ACROSS THE CUTS. One script feeds every difficulty, so a
 * ramp solved for the first cut alone spikes at it and collapses into the
 * waves after — which is invisible in a list of counts and obvious in a
 * line. The vertical rules are those cuts.
 *
 * Deliberately short. It is pinned above a rail that scrolls, so every pixel
 * it takes is a pixel of settings pushed off the screen.
 */
function RampChart({ waves }: { waves: readonly WaveRow[] }): React.ReactElement | null {
  const [metric, setMetric] = useState<"units" | "hp">("units");
  const [at, setAt] = useState<number | null>(null);
  const n = waves.length;
  if (n < 2) return null;

  const v = waves.map((w) => (metric === "units" ? w.units : w.hp));
  const max = Math.max(1, ...v);
  // a 240x64 box stretched to the rail's width: preserveAspectRatio="none"
  // would smear the stroke with it, so the stroke opts out of the scaling
  const X = (i: number): number => (i / (n - 1)) * 240;
  const Y = (k: number): number => 62 - (k / max) * 58;
  const pts = v.map((k, i) => `${X(i).toFixed(1)},${Y(k).toFixed(1)}`);
  const line = `M${pts.join("L")}`;
  const area = `M${X(0).toFixed(1)},64L${pts.join("L")}L${X(n - 1).toFixed(1)},64Z`;
  const cuts = DIFFICULTIES.slice(0, -1)
    .map((d) => d.waves)
    .filter((w) => w < n);
  const fmt = (k: number): string =>
    k >= 1000 ? `${(k / 1000).toFixed(k >= 10000 ? 0 : 1)}k` : `${Math.round(k)}`;

  // the pointer names the wave under it. Rounding rather than flooring means
  // the nearest POINT wins, so a spike is picked by aiming at the spike
  // rather than at the column of pixels starting under it
  const track = (e: React.MouseEvent<SVGSVGElement>): void => {
    const r = e.currentTarget.getBoundingClientRect();
    if (r.width <= 0) return;
    const i = Math.round(((e.clientX - r.left) / r.width) * (n - 1));
    setAt(Math.min(n - 1, Math.max(0, i)));
  };

  return (
    <div className="sticky top-0 z-10 rounded-lg border border-[#2E2E36] bg-[#151518] p-2.5">
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <h2 className="text-[12px] font-bold uppercase tracking-widest text-[#71717C]">Ramp</h2>
        <span className="flex gap-1">
          {(["units", "hp"] as const).map((m) => (
            <button
              key={m}
              aria-pressed={metric === m}
              onClick={() => setMetric(m)}
              className={`rounded px-1.5 text-[11px] uppercase tracking-wider ${
                metric === m ? "text-[#FFD37F]" : "text-[#4A4A55] hover:text-[#71717C]"
              }`}
            >
              {m === "units" ? "units" : "health"}
            </button>
          ))}
        </span>
      </div>
      <div className="relative">
        <svg
          viewBox="0 0 240 64"
          preserveAspectRatio="none"
          className="block h-[62px] w-full"
          onMouseMove={track}
          onMouseLeave={() => setAt(null)}
        >
          <path d={area} fill="#FFD37F" fillOpacity={0.1} />
          {cuts.map((w) => (
            <line
              key={w}
              x1={X(w - 1)}
              x2={X(w - 1)}
              y1={0}
              y2={64}
              stroke="#4A4A55"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          ))}
          <path
            d={line}
            fill="none"
            stroke="#FFD37F"
            strokeWidth={1.5}
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
          {at !== null && (
            <line
              x1={X(at)}
              x2={X(at)}
              y1={0}
              y2={64}
              stroke="#EDEDEF"
              strokeWidth={1}
              strokeOpacity={0.5}
              vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>
        {/* the marker dot is HTML, not SVG: the box is stretched to the rail's
            width, and a circle inside it would come out an ellipse */}
        {at !== null && (
          <span
            className="pointer-events-none absolute -ml-[3px] -mt-[3px] block h-1.5 w-1.5 rounded-full bg-[#EDEDEF]"
            style={{ left: `${(at / (n - 1)) * 100}%`, top: `${(Y(v[at]) / 64) * 100}%` }}
          />
        )}
      </div>
      <div className="mt-1 flex justify-between gap-2 text-[11px]">
        {at === null ? (
          <>
            <span className="text-[#4A4A55]">wave 1</span>
            {cuts.map((w) => (
              <span key={w} className="text-[#71717C]">
                {difficultyName(tierOfWave(w - 1))} ends
              </span>
            ))}
            <span className="text-[#4A4A55]">peak {fmt(max)}</span>
          </>
        ) : (
          <>
            <span className="text-[#EDEDEF]">Wave {at + 1}</span>
            <span className="text-[#71717C]">
              {tierOfWave(at) >= 0 ? difficultyName(tierOfWave(at)) : "unreachable"}
            </span>
            <span className="text-[#FFD37F]">
              {metric === "units"
                ? `${v[at].toLocaleString()} enemies`
                : `${Math.round(v[at]).toLocaleString()} hp`}
            </span>
          </>
        )}
      </div>
    </div>
  );
}


function RegionKey({ mapId, regions }: { mapId: string; regions: readonly number[] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const doc = loadMap(mapId);
    if (doc && ref.current) drawThumb(doc, ref.current);
  }, [mapId]);
  return (
    <section className="rounded-lg border border-[#2E2E36] bg-[#151518]/70 p-3">
      <h2 className="mb-2 text-[12px] font-bold uppercase tracking-widest text-[#71717C]">
        Spawn regions
      </h2>
      <canvas ref={ref} className="w-full rounded border border-[#2E2E36] [image-rendering:pixelated]" />
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[13px]">
        {regions.map((r) => (
          <span key={r} className="flex items-center gap-1.5">
            <span
              className="inline-block h-2.5 w-2.5 rounded-sm"
              style={{ background: regionCss(r) }}
            />
            <span className="text-[#A6A6AF]">{regionLabel(r)}</span>
          </span>
        ))}
      </div>
    </section>
  );
}

/** the thin "+ wave" strip that sits between two waves */
function InsertBar({ onInsert }: { onInsert: () => void }) {
  return (
    <div className="group flex items-center gap-2 py-1">
      <div className="h-px flex-1 bg-[#1E1E24]" />
      <button
        onClick={onInsert}
        className="rounded border border-[#2E2E36] px-2 py-0.5 text-[12px] uppercase tracking-widest text-[#71717C] opacity-0 transition-opacity hover:border-[#FFD37F] hover:text-[#FFD37F] focus-visible:opacity-100 group-hover:opacity-100"
      >
        + Wave
      </button>
      <div className="h-px flex-1 bg-[#1E1E24]" />
    </div>
  );
}

function StepCard({
  step,
  waveNo,
  guide,
  against,
  index,
  last,
  mapRegions,
  onChange,
  onDelete,
  onMove,
}: {
  step: EditStep;
  waveNo: number;
  /** this wave's row of the number guide */
  guide?: WaveRow;
  /** the difficulty its share is measured in, for the tooltips */
  against: number;
  index: number;
  last: boolean;
  mapRegions: readonly number[];
  onChange: (next: EditStep) => void;
  onDelete: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const controls = (
    <div className="flex items-center gap-1">
      <IconButton label="Move up" onClick={() => onMove(-1)} disabled={index === 0}>
        ↑
      </IconButton>
      <IconButton label="Move down" onClick={() => onMove(1)} disabled={last}>
        ↓
      </IconButton>
      <IconButton label="Delete step" onClick={onDelete} danger>
        ✕
      </IconButton>
    </div>
  );

  const total = stepTotal(step);
  const payout = dropsForKills(killVector(step.groups));

  const setGroups = (groups: EditGroup[]): void => onChange({ ...step, groups });

  return (
    <div className="rounded-lg border border-[#2E2E36] bg-[#151518]/70 p-3">
      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-[14px] font-bold uppercase tracking-widest text-[#EDEDEF]">
          Wave {waveNo}
        </span>
        {/* a wave's POSITION is its difficulty gate: difficulty n plays the
            first 20/35/50 waves, so this badge is the difficulty a wave
            first appears at. Moving a row up moves the fight it holds down
            the ladder, against a smaller fleet. A wave past the 50th is
            written but never sent — that badge is a warning, not a gate */}
        {tierOfWave(index) < 0 ? (
          <span
            title="Past Extreme's 50-wave cut — this wave is never sent"
            className="rounded border border-[#5B2E2E] bg-[#2A1616] px-1.5 text-[12px] font-bold uppercase tracking-widest text-[#FF8A8A]"
          >
            unplayed
          </span>
        ) : (
          <span
            title={`First played on ${difficultyName(tierOfWave(index))}`}
            className="rounded border border-[#3A3320] bg-[#1C1810] px-1.5 text-[12px] font-bold uppercase tracking-widest text-[#FFD37F]"
          >
            D{difficultyOf(tierOfWave(index))}
          </span>
        )}
        <span className="text-[13px] text-[#71717C]">{total} enemies</span>
        {/* the number guide, per wave: what this wave weighs and what slice
            of the selected run that is. `share` is the one to author against
            — 5% is filler, 25% is a spike, and a difficulty's last wave
            should be its heaviest */}
        {guide && (
          <span className="flex items-center gap-2 text-[13px] text-[#71717C]">
            <span className="font-bold text-[#A6A6AF]">{compactHp(guide.hp)} hp</span>
            {guide.share > 0 ? (
              <span
                title={`share of a ${difficultyName(against)} run's total health`}
                className={guide.share >= 0.2 ? "font-bold text-[#F0B457]" : ""}
              >
                {(guide.share * 100).toFixed(1)}%
              </span>
            ) : (
              <span title={`${difficultyName(against)} never sends this wave`}>—</span>
            )}
          </span>
        )}
        <CostRow cost={payout} />
        <div className="ml-auto">{controls}</div>
      </div>

      <div className="space-y-2">
        {step.groups.map((group) => (
          <GroupRow
            key={group.uid}
            group={group}
            mapRegions={mapRegions}
            soleGroup={step.groups.length === 1}
            onChange={(next) =>
              setGroups(step.groups.map((g) => (g.uid === group.uid ? next : g)))
            }
            onDelete={() => setGroups(step.groups.filter((g) => g.uid !== group.uid))}
          />
        ))}
      </div>

      <button
        onClick={() =>
          setGroups([
            ...step.groups,
            // a new group defaults to the first region the current groups
            // don't already cover, which is nearly always what a split wave
            // wants and saves a trip to the dropdown
            {
              uid: uid(),
              region:
                mapRegions.find((r) => !step.groups.some((g) => g.region === r)) ??
                mapRegions[0] ??
                0,
              counts: {},
            },
          ])
        }
        className="mt-2 rounded border border-[#2E2E36] px-2 py-0.5 text-[12px] uppercase tracking-widest text-[#71717C] hover:border-[#FFD37F] hover:text-[#FFD37F]"
      >
        + Region group
      </button>
    </div>
  );
}

function GroupRow({
  group,
  mapRegions,
  soleGroup,
  onChange,
  onDelete,
}: {
  group: EditGroup;
  mapRegions: readonly number[];
  /** the only group in its wave — deleting it would leave nothing to edit */
  soleGroup: boolean;
  onChange: (next: EditGroup) => void;
  onDelete: () => void;
}) {
  // region 0 always works (any pad); a positive region the map never paints
  // silently falls back to any pad at run time, so say so here
  const orphan = group.region > 0 && !mapRegions.includes(group.region);

  // a count of 0 is the same as absent (trimCounts drops it on save), so the
  // grid can hold every kind and let the zeros stand for the empty slots
  const setCount = (kind: UnitKind, n: number): void =>
    onChange({ ...group, counts: { ...group.counts, [kind]: n } });

  return (
    <div
      className="rounded border-l-2 bg-[#101013]/60 py-1.5 pl-2 pr-1.5"
      style={{ borderLeftColor: regionCss(group.region) }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={group.region}
          onChange={(e) => onChange({ ...group, region: Number(e.target.value) })}
          aria-label="Spawn region"
          className="rounded border border-[#2E2E36] bg-[#0B0B0D] px-1.5 py-1 text-[13px] font-bold focus:border-[#FFD37F] focus:outline-none"
          style={{ color: regionCss(group.region) }}
        >
          <option value={0}>Any pad</option>
          {mapRegions.map((r) => (
            <option key={r} value={r}>
              Region {r}
            </option>
          ))}
          {orphan && <option value={group.region}>Region {group.region} (not on map)</option>}
        </select>

        {orphan && (
          <span
            title="This map paints no pads for that region — the sim will fall back to any pad"
            className="text-[12px] font-bold uppercase tracking-widest text-[#F0B457]"
          >
            ⚠ not on map
          </span>
        )}

        <span className="text-[13px] text-[#71717C]">
          {UNIT_KINDS.reduce((n, k) => n + (group.counts[k] ?? 0), 0)} enemies
        </span>

        <div className="ml-auto">
          <IconButton label="Remove region group" onClick={onDelete} disabled={soleGroup} danger>
            ✕
          </IconButton>
        </div>
      </div>

      {/* one row per unit tree, tier order left to right: the slots stay in
          the same place whatever the wave holds, so a wave's ground/air/
          crawler mix is readable at a glance instead of being a bag of chips */}
      <div className="mt-1.5 space-y-1">
        {UNIT_TREES.map((tree) => (
          <div key={tree.name} className="flex items-center gap-1.5">
            <span className="w-16 shrink-0 text-[12px] font-bold uppercase tracking-widest text-[#71717C]">
              {tree.name}
            </span>
            {tree.kinds.map((kind) => (
              <UnitSlot
                key={kind}
                kind={kind}
                value={group.counts[kind] ?? 0}
                onChange={(n) => setCount(kind, n)}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** one unit's slot in a tree row: sprite plus count, dimmed when the wave
 * sends none. Clicking the sprite is the quick way in — it seeds 10, the
 * count the old "+ unit" picker used to add with. */
function UnitSlot({
  kind,
  value,
  onChange,
}: {
  kind: UnitKind;
  value: number;
  onChange: (n: number) => void;
}) {
  const on = value > 0;
  return (
    <span
      className={`flex w-[108px] shrink-0 items-center gap-1 rounded border py-0.5 pl-1 pr-1 ${
        on ? "border-[#2E2E36] bg-[#151518]" : "border-transparent"
      }`}
    >
      <button
        onClick={() => onChange(on ? 0 : 10)}
        title={`${kind} — T${UNIT_STATS[kind].tier}${on ? " — click to clear" : ""}`}
        aria-label={on ? `Clear ${kind}` : `Add ${kind}`}
        className="shrink-0 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#FFD37F]"
      >
        <img
          src={unitIcon(kind)}
          alt={kind}
          className={`h-5 w-5 object-contain [image-rendering:pixelated] ${on ? "" : "opacity-25"}`}
        />
      </button>
      <NumberInput
        value={value}
        onChange={onChange}
        width="w-full min-w-0"
        blankZero
        label={`${kind} count`}
      />
    </span>
  );
}
