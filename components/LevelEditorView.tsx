"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  UNIT_KINDS,
  UNIT_STATS,
  UNIT_TREES,
  applyWaveTransforms,
  blueprintDoc,
  BLUEPRINT_ID,
  saveLevel,
  transformLabel,
  transformsError,
  waveGroups,
  WAVE_RELEASE_SECONDS,
  WORLDS,
  type FamilyKey,
  type LevelSpec,
  type LevelStep,
  type UnitKind,
  type WaveTransform,
  type WaveUnits,
} from "@/game/levels";
import { dropsForKills } from "@/game/progress";
import {
  audit,
  GRIND_STEP,
  RATIO_TOLERANCE,
  rungColor,
  rungLabel,
  SLIDE_STEP,
  targetShare,
  tierDropBonus,
  TOP_TIER,
  waveGuide,
  type WaveRow,
} from "@/game/ladder";
import { ITEM_INFO, ITEM_KINDS } from "@/game/items";
import {
  drawThumb,
  loadMap,
  OFFICIAL_MAP_IDS,
  zoneKindsOf,
  zoneStyle,
  ZONE_LABELS,
} from "@/game/maps";
import type { ZoneKind } from "@/game/constants";
import { CostRow } from "./Items";

/* eslint-disable @next/next/no-img-element -- raw pixel sprites, no optimization wanted */

const unitIcon = (k: UnitKind): string => `/mindustry/sprites/units/${k}.png`;

/** health runs to nine figures at the top rung; a table cell wants
 * three characters and a suffix, not 20,276,477 */
const compactHp = (hp: number): string =>
  hp >= 1e9
    ? `${(hp / 1e9).toFixed(1)}B`
    : hp >= 1e6
      ? `${(hp / 1e6).toFixed(1)}M`
      : hp >= 1e3
        ? `${(hp / 1e3).toFixed(0)}k`
        : `${Math.round(hp)}`;

// ---------- the editing model ----------

/**
 * The script is edited in a normalized form and serialized back on save.
 *
 * A WAVE IS ONE GROUP OF COUNTS. It used to be a LIST of groups, each aimed
 * at a numbered spawn region, because that was the only way to say "the
 * flyers come in over there and the walkers up this lane". A drop zone
 * carries its movement layer now (MOVE_LAYERS in constants.ts) and every
 * unit finds its own door, so the region dropdown was answering a question
 * nobody has to ask any more — and the split into groups existed only to
 * hold it. A wave is what it always read as on disk: kinds and counts.
 *
 * Documents written with region groups still LOAD: waveGroups flattens
 * them, and the counts are summed into the single group here. Saving writes
 * the plain form back, so a level converts the first time it is edited.
 *
 * `uid` exists only so React keys survive reordering: splicing a step out of
 * the middle shifts every index below it, and index keys would make the row
 * that moved keep the input state of the row that replaced it.
 */
interface EditStep {
  uid: number;
  counts: Partial<Record<UnitKind, number>>;
}

let nextUid = 1;
const uid = (): number => nextUid++;

function toEditSteps(script: readonly LevelStep[]): EditStep[] {
  return script.map((step) => {
    // several region groups collapse into one wave — the counts are what
    // survived the region system, and summing is what "both groups sent
    // these" has always meant on the field
    const counts: Partial<Record<UnitKind, number>> = {};
    for (const g of waveGroups(step.wave))
      g.counts.forEach((n, i) => {
        if (n > 0) counts[UNIT_KINDS[i]] = (counts[UNIT_KINDS[i]] ?? 0) + n;
      });
    return { uid: uid(), counts };
  });
}

/** back to the on-disk shape — always the plain, readable form now */
function toScript(steps: readonly EditStep[]): LevelStep[] {
  return steps.map((step) => ({ wave: trimCounts(step.counts) as WaveUnits }));
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
 * A transform rule as the rail edits it: the same shape the document saves
 * (WaveTransform), just mutably typed. No uid — rules are never reordered,
 * and every input below is controlled, so index keys hold their values.
 */
interface EditRule {
  from: FamilyKey[];
  to: { family: FamilyKey; weight?: number }[];
  multiply?: number;
}

/** a world's rules as a fresh, mutable buffer for the rail editor */
function toEditRules(transforms: readonly WaveTransform[] | undefined): EditRule[] {
  return (transforms ?? []).map((t) => ({
    from: [...t.from],
    to: t.to.map((x) => ({ ...x })),
    ...(t.multiply !== undefined && { multiply: t.multiply }),
  }));
}

/** the families a rule may name — every tree but the boss row */
const RULE_FAMILIES = UNIT_TREES.filter((t) => t.key !== "boss");

const stepTotal = (step: EditStep): number =>
  UNIT_KINDS.reduce((s, k) => s + (step.counts[k] ?? 0), 0);

/** kill counts indexed like UNIT_KINDS, for the payout preview */
function killVector(steps: readonly EditStep[]): number[] {
  const counts = UNIT_KINDS.map(() => 0);
  for (const s of steps)
    UNIT_KINDS.forEach((k, i) => {
      counts[i] += s.counts[k] ?? 0;
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
  disabled,
  label,
}: {
  value: number;
  onChange: (n: number) => void;
  width?: string;
  min?: number;
  /** show 0 as an empty field — a grid of every unit kind is mostly zeros,
   * and a wall of them reads as data rather than as blank slots */
  blankZero?: boolean;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <input
      type="number"
      min={min}
      disabled={disabled}
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
  // THE BUFFER IS THE BLUEPRINT — the one script every world plays, raw
  // counts. Whichever world opened the editor, the counts being edited are
  // the shared ones; the world contributes its map, its transforms, and the
  // lens the audit below prices through.
  const [steps, setSteps] = useState<EditStep[]>(() => toEditSteps(blueprintDoc().script));
  const [waveGap, setWaveGap] = useState(blueprintDoc().waveGap);
  // this world's re-casting rules, editable in the rail and saved into the
  // blueprint document's transforms map alongside the counts
  const [rules, setRules] = useState<EditRule[]>(() => toEditRules(level.transforms));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  // why the last save was refused — null when the last attempt succeeded
  const [saveError, setSaveError] = useState<string | null>(null);

  // reloading a different level through the same mounted component has to
  // reset the buffer — the blueprint is shared, but an unsaved edit must
  // not ride silently into another world's view
  useEffect(() => {
    setSteps(toEditSteps(blueprintDoc().script));
    setWaveGap(blueprintDoc().waveGap);
    setRules(toEditRules(level.transforms));
    setDirty(false);
  }, [level]);

  // why the rules cannot mean one thing yet — shown in the rail, and the
  // one thing that blocks a save (the API refuses the same finding)
  const rulesError = useMemo(() => transformsError(rules), [rules]);

  // what THIS WORLD actually sends: the live buffer run through the live
  // rules. Identical to the buffer while the world has no rules.
  const playedScript = useMemo(() => applyWaveTransforms(toScript(steps), rules), [steps, rules]);
  const playedSteps = useMemo(() => toEditSteps(playedScript), [playedScript]);

  // the wave cards show the derived script by default — the fight this
  // world actually sends — and flip to the raw blueprint to edit counts;
  // derived counts are not a thing anyone can edit, so the view is read-only
  const [asPlayed, setAsPlayed] = useState(true);
  const preview = asPlayed && rules.length > 0;

  const mapId = level.map ?? OFFICIAL_MAP_IDS[0];

  /**
   * WHICH MOVEMENT LAYERS THIS LEVEL'S MAP HAS DOORS FOR.
   *
   * A wave sending units of a layer the map never opens is the one
   * map/script mismatch left — nothing else about a wave refers to the map
   * at all now that regions are gone — so the editor reports which doors
   * exist and the sim warns on the console when a script outruns them.
   */
  const mapZones = useMemo<ZoneKind[]>(() => {
    const doc = loadMap(mapId);
    if (!doc) return [];
    return [...zoneKindsOf(doc, Uint8Array.from(doc.blocked))].sort();
  }, [mapId]);

  const edit = (fn: (draft: EditStep[]) => EditStep[]): void => {
    setSteps((prev) => fn(prev));
    setDirty(true);
  };

  const editRules = (fn: (draft: EditRule[]) => EditRule[]): void => {
    setRules((prev) => fn(prev));
    setDirty(true);
  };

  const save = async (): Promise<void> => {
    if (rulesError) {
      setSaveError(`fix the transform rules first: ${rulesError}`);
      return;
    }
    setSaving(true);
    setSaveError(null);
    const res = await saveLevel({
      id: BLUEPRINT_ID,
      waveGap,
      script: toScript(steps),
      // the document carries EVERY world's rules (see LevelDoc.transforms),
      // so the untouched worlds' current rules ride along with this one's
      transforms: Object.fromEntries(
        WORLDS.map((w) => [w.id, w.id === level.id ? rules : [...(w.transforms ?? [])]]),
      ),
    });
    setSaving(false);
    if (res.ok) setDirty(false);
    else setSaveError(res.error);
  };

  /**
   * THE NUMBER GUIDE, RECOMPUTED ON EVERY EDIT.
   *
   * Computed from the LIVE buffer rather than the saved document — the whole
   * point is to weigh an edit before committing it, so a report of the file
   * on disk would answer the wrong question.
   *
   * The whole walk — every rung, every wave, and the findings —
   * measures ~1.3 ms on a 50-wave script, so there is nothing to debounce and
   * no reason to make the author ask for it. Typing a count re-costs the wave
   * under the cursor and re-steps the rung it belongs to, live.
   *
   * This replaced a button that computed on demand and blanked itself on
   * every edit, which meant the numbers were only ever visible next to waves
   * that had not been touched since.
   */
  const report = useMemo(() => {
    // the audit prices what THIS WORLD PLAYS — the transformed script, not
    // the raw blueprint — so a world whose rules double a family, or move
    // it to a layer its map cannot open, reads its real numbers here
    const spec = { ...level, waveGap, script: playedScript };
    // per-wave numbers are priced at the top tier — the run every wave is in
    return { rows: audit(spec), waves: waveGuide(spec) };
  }, [level, waveGap, playedScript]);

  const back = (): void => {
    if (dirty && !window.confirm("Discard unsaved changes?")) return;
    onClose();
  };

  // whole-level rollup, recomputed from the live buffer so the header tracks
  // edits rather than the level as it was opened — priced on the played
  // script, so a multiplying transform shows in the totals it changes
  const summary = useMemo(() => {
    const waves = playedSteps.filter((s) => stepTotal(s) > 0).length;
    const kills = killVector(playedSteps);
    return {
      waves,
      enemies: kills.reduce((a, b) => a + b, 0),
      payout: dropsForKills(kills),
    };
  }, [playedSteps]);

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
              World {level.id} · map <span className="text-[#A6A6AF]">{mapId}</span> · edits the
              shared blueprint (public/levels/{BLUEPRINT_ID}.json) — the one script every world
              plays{rules.length > 0 && ", re-cast here by the rules in the rail"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* worlds with rules can flip the wave cards between the derived
                script they actually send (the default) and the editable
                blueprint; the label names the view a click switches TO */}
            {rules.length > 0 && (
              <button
                onClick={() => setAsPlayed((v) => !v)}
                aria-pressed={asPlayed}
                className={`rounded border px-4 py-1.5 text-[14px] uppercase tracking-widest ${
                  asPlayed
                    ? "border-[#7FC4FF] bg-[#16222A] text-[#7FC4FF]"
                    : "border-[#2E2E36] text-[#A6A6AF] hover:border-[#4A4A55]"
                }`}
              >
                {asPlayed ? "Show blueprint" : "Show as played"}
              </button>
            )}
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
              onClick={back}
              className="rounded border border-[#2E2E36] px-4 py-1.5 text-[14px] uppercase tracking-widest text-[#A6A6AF] hover:border-[#4A4A55]"
            >
              Back
            </button>
          </div>
        </header>

        <div className="grid min-h-0 flex-1 gap-5 lg:grid-cols-[260px_1fr]">
          {/* ---- left rail: level settings, map doors, rollup ---- */}
          <aside className="space-y-4 overflow-y-auto pr-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <RampChart waves={report.waves} />
            <ZoneKey mapId={mapId} zones={mapZones} />

            {/* THE WORLD'S RE-CASTING RULES, editable and saved into the
                blueprint document's transforms map. The audit, ramp and
                totals all price the re-cast script; only the wave cards can
                show the raw blueprint. */}
            <section className="rounded-lg border border-[#2E4A5B] bg-[#16222A]/70 p-3">
              <div className="mb-2 flex items-baseline justify-between">
                <h2 className="text-[12px] font-bold uppercase tracking-widest text-[#7FC4FF]">
                  Wave transforms
                </h2>
                <button
                  onClick={() => editRules((rs) => [...rs, { from: [], to: [] }])}
                  className="rounded border border-[#2E4A5B] px-1.5 py-0.5 text-[11px] uppercase tracking-widest text-[#7FC4FF] hover:border-[#7FC4FF]"
                >
                  + Rule
                </button>
              </div>
              {rules.length === 0 ? (
                <p className="text-[13px] leading-snug text-[#71717C]">
                  None — this world plays the blueprint verbatim.
                </p>
              ) : (
                <div className="space-y-2">
                  {rules.map((rule, ri) => (
                    <RuleEditor
                      key={ri}
                      rule={rule}
                      onChange={(next) =>
                        editRules((rs) => rs.map((r, i) => (i === ri ? next : r)))
                      }
                      onDelete={() => editRules((rs) => rs.filter((_, i) => i !== ri))}
                    />
                  ))}
                </div>
              )}
              {rulesError && (
                <p role="alert" className="mt-2 text-[12px] leading-snug text-[#F08A8A]">
                  {rulesError} — the save will be refused until this is fixed
                </p>
              )}
              <p className="mt-2 border-t border-[#2E4A5B] pt-2 text-[12px] leading-snug text-[#71717C]">
                This world re-casts the shared blueprint through these rules,
                tier for tier: a rule pools its FROM families per tier,
                multiplies the pool, and deals it to the TO families by
                weight. Rules save with the blueprint.
              </p>
            </section>

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

            {/* ECONOMY. One row a RUNG: what a full clear banks, drop bonus
                included. Every rung sends the same fifty waves, so the rows
                differ ONLY by that bonus — the shape below them is the
                world's and is printed once. The ratio is the number to
                author against (the tech tree is priced to it); see
                TARGET_DROP_RATIO in ladder.ts, which has a row PER WORLD
                now. The bonus cannot move it — only THIS WORLD'S family mix
                can, which means its re-casting rules and the blueprint's
                own counts. */}
            <section className="rounded-lg border border-[#2E2E36] bg-[#151518]/70 p-3">
              <h2 className="mb-2 text-[12px] font-bold uppercase tracking-widest text-[#71717C]">
                Payout per rung
              </h2>
              <div className="space-y-2">
                {report.rows.map((r) => (
                  <div key={r.tier}>
                    <div className="flex items-baseline justify-between">
                      <span
                        className="text-[13px] font-bold"
                        style={{ color: rungColor(r.tier) }}
                      >
                        {r.label}
                      </span>
                      <span className="text-[12px] text-[#71717C]">
                        x{tierDropBonus(r.tier).toFixed(2)} loot
                      </span>
                    </div>
                    {/* the run's whole weight at this rung — what the
                        ladder table used to lead with, kept here now that
                        the table is gone */}
                    <div className="text-[12px] text-[#A6A6AF]">
                      {r.units.toLocaleString()} enemies · {compactHp(r.hp)} hp ·{" "}
                      {r.hpPerSecond.toLocaleString()} hp/s
                    </div>
                    <CostRow cost={r.drops} />
                    {/* THE LADDER'S SHAPE, one line: what this rung asks for
                        against what it pays. `grind` is climb / farm — how
                        many more minutes this rung costs than the one below
                        — and it is the number the ladder is tuned against
                        (see AuditRow.grindStep). The first rung has nothing
                        below it, so it has no step to show */}
                    {r.tier > 0 && (
                      <div className="text-[12px] text-[#71717C]">
                        climb x{r.climbStep.toFixed(2)} · farm x{r.farmStep.toFixed(2)} ·{" "}
                        <span
                          className="font-bold"
                          style={{
                            color:
                              r.grindStep > GRIND_STEP || r.grindStep < SLIDE_STEP
                                ? "#FF8A8A"
                                : "#A6A6AF",
                          }}
                        >
                          grind x{r.grindStep.toFixed(2)}
                        </span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {/* THE MIX, ONCE, AGAINST THIS WORLD'S OWN ROW. Every rung
                  sends the same fifty waves, so the ratio is a fact about
                  the WORLD and printing it ten times printed the same ten
                  numbers ten times. Only the currencies one side or the
                  other actually mentions are listed — five columns of which
                  three are zero is a table about the other maps. */}
              <div className="mt-2 border-t border-[#2E2E36] pt-2">
                <div className="space-y-0.5">
                  {ITEM_KINDS.map((k, i) => {
                    const got = report.rows[0]?.dropRatio[i] ?? 0;
                    const want = targetShare(level.id, k);
                    if (got <= 0 && want <= 0) return null;
                    // both sides are normalised to their own biggest
                    // column, so the top currency reads 100 either way and
                    // an authored row whose top is not 100 shows up here
                    const off =
                      want > 0
                        ? Math.abs(got / want - 1) > RATIO_TOLERANCE
                        : got > 0;
                    return (
                      <div key={k} className="flex items-baseline justify-between gap-3">
                        <span className="text-[12px]" style={{ color: ITEM_INFO[k].color }}>
                          {ITEM_INFO[k].name}
                        </span>
                        <span
                          className={`text-[12px] tabular-nums ${off ? "text-[#FF8A8A]" : "text-[#A6A6AF]"}`}
                        >
                          {got.toFixed(got < 10 ? 1 : 0)}
                          <span className="text-[#71717C]">
                            {" / "}
                            {want.toFixed(want < 10 ? 1 : 0)}
                          </span>
                        </span>
                      </div>
                    );
                  })}
                </div>
                <p className="mt-1 text-[12px] leading-snug text-[#71717C]">
                  What this world pays / what it is authored to, both
                  normalised so its biggest currency reads 100 — the target
                  is its row of TARGET_DROP_RATIO in ladder.ts, and what
                  moves it is which FAMILIES the world&apos;s rules send.
                  Climb is health per second against the rung below, farm is
                  items banked per minute against it, and grind is the two
                  divided: hold it just above 1 and every rung costs a little
                  more of an evening than the last.
                </p>
              </div>
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
            {!preview && <InsertBar onInsert={() => edit((s) => [makeStep(), ...s])} />}
            {(preview ? playedSteps : steps).map((step, i, all) => {
              return (
                <div key={step.uid}>
                  <StepCard
                    step={step}
                    waveNo={i + 1}
                    guide={report.waves[i]}
                    index={i}
                    last={i === all.length - 1}
                    readOnly={preview}
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
                  {!preview && (
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
                  )}
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
  return { uid: uid(), counts: { dagger: 10 } };
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-[#71717C]">{label}</dt>
      <dd className="font-bold text-[#EDEDEF]">{value}</dd>
    </div>
  );
}

/**
 * One re-casting rule as a small form: FROM as family toggle chips, TO as
 * family/weight rows, and the pool multiplier. The header echoes the rule
 * back as a phrase the moment it means something, so the form reads as the
 * sentence it will become in the document.
 */
function RuleEditor({
  rule,
  onChange,
  onDelete,
}: {
  rule: EditRule;
  onChange: (next: EditRule) => void;
  onDelete: () => void;
}) {
  const summary =
    rule.from.length && rule.to.length ? transformLabel(rule) : "new rule — pick from and to";
  const setMultiply = (n: number): void => {
    const next = { ...rule };
    if (n === 1) delete next.multiply;
    else next.multiply = n;
    onChange(next);
  };
  return (
    <div className="rounded border border-[#2E4A5B] bg-[#0F171D] p-2">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-[12px] text-[#7FC4FF]" title={summary}>
          {summary}
        </span>
        <IconButton label="Delete rule" onClick={onDelete} danger>
          ✕
        </IconButton>
      </div>

      <div className="text-[11px] font-bold uppercase tracking-widest text-[#71717C]">From</div>
      <div className="mt-1 flex flex-wrap gap-1">
        {RULE_FAMILIES.map((f) => {
          const on = rule.from.includes(f.key);
          return (
            <button
              key={f.key}
              aria-pressed={on}
              onClick={() =>
                onChange({
                  ...rule,
                  from: on ? rule.from.filter((k) => k !== f.key) : [...rule.from, f.key],
                })
              }
              className={`rounded border px-1.5 py-0.5 text-[11px] uppercase tracking-wider ${
                on
                  ? "border-[#7FC4FF] bg-[#16222A] text-[#7FC4FF]"
                  : "border-[#2E2E36] text-[#71717C] hover:border-[#4A4A55]"
              }`}
            >
              {f.name}
            </button>
          );
        })}
      </div>

      <div className="mt-2 flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-widest text-[#71717C]">To</span>
        <button
          onClick={() => onChange({ ...rule, to: [...rule.to, { family: "ground" }] })}
          className="rounded border border-[#2E2E36] px-1.5 py-0.5 text-[11px] uppercase tracking-widest text-[#71717C] hover:border-[#4A4A55] hover:text-[#A6A6AF]"
        >
          + Target
        </button>
      </div>
      {rule.to.map((tgt, ti) => (
        <div key={ti} className="mt-1 flex items-center gap-1">
          <select
            value={tgt.family}
            aria-label="Target family"
            onChange={(e) =>
              onChange({
                ...rule,
                to: rule.to.map((t, i) =>
                  i === ti ? { ...t, family: e.target.value as FamilyKey } : t,
                ),
              })
            }
            className="min-w-0 flex-1 rounded border border-[#2E2E36] bg-[#0B0B0D] px-1 py-0.5 text-[13px] text-[#EDEDEF] focus:border-[#FFD37F] focus:outline-none"
          >
            {RULE_FAMILIES.map((f) => (
              <option key={f.key} value={f.key}>
                {f.name}
              </option>
            ))}
          </select>
          <NumberInput
            value={tgt.weight ?? 1}
            min={1}
            width="w-12"
            label="Target weight"
            onChange={(n) =>
              onChange({
                ...rule,
                to: rule.to.map((t, i) => (i === ti ? { ...t, weight: n } : t)),
              })
            }
          />
          <IconButton
            label="Remove target"
            onClick={() => onChange({ ...rule, to: rule.to.filter((_, i) => i !== ti) })}
            danger
          >
            ✕
          </IconButton>
        </div>
      ))}

      <label className="mt-2 flex items-center justify-between gap-2 text-[13px] text-[#A6A6AF]">
        Multiply pool ×
        <FloatInput value={rule.multiply ?? 1} onChange={setMultiply} label="Pool multiplier" />
      </label>
    </div>
  );
}

/**
 * A number input that keeps its decimals. NumberInput floors on purpose —
 * a wave count is a body count — but a pool multiplier of 1.5 is a real
 * thing to ask for, so this one holds the raw text and only pushes values
 * that parse, letting "0." sit un-clobbered on the way to "0.5".
 */
function FloatInput({
  value,
  onChange,
  label,
}: {
  value: number;
  onChange: (n: number) => void;
  label: string;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => {
    // sync an outside change without stamping on in-progress typing
    setText((cur) => (Number(cur) === value ? cur : String(value)));
  }, [value]);
  return (
    <input
      type="number"
      step="any"
      min={0}
      aria-label={label}
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        const n = Number(e.target.value);
        if (e.target.value !== "" && Number.isFinite(n)) onChange(n);
      }}
      className="w-14 rounded border border-[#2E2E36] bg-[#0B0B0D] px-1.5 py-0.5 text-right text-[13px] font-bold text-[#EDEDEF] focus:border-[#FFD37F] focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
    />
  );
}

/** the map's spawn pads, coloured exactly as the map editor paints them, so
 * "region 2" in a wave group is visibly the same place on the map */

/**
 * THE RAMP — the live shape of the run, one point per authored wave.
 *
 * The number that matters here is not any wave's size but whether the curve
 * keeps CLIMBING ACROSS THE CUTS. One script feeds every rung, so a
 * ramp solved for the first cut alone spikes at it and collapses into the
 * waves after — which is invisible in a list of counts and obvious in a
 * line. The vertical rules are those cuts.
 *
 * Deliberately short. It is pinned above a rail that scrolls, so every pixel
 * it takes is a pixel of settings pushed off the screen.
 */
function RampChart({ waves }: { waves: readonly WaveRow[] }): React.ReactElement | null {
  // health leads: the ramp is authored in health, bodies are the flavour
  const [metric, setMetric] = useState<"units" | "hp">("hp");
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
  /*
   * NO CUT LINES. They marked where one named difficulty stopped sending
   * waves and the next took over; every rung sends all of them now, so
   * there is nothing to divide the ramp at.
   */
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
          {(["hp", "units"] as const).map((m) => (
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
            <span className="text-[#4A4A55]">{n} waves, every rung</span>
            <span className="text-[#4A4A55]">peak {fmt(max)}</span>
          </>
        ) : (
          <>
            <span className="text-[#EDEDEF]">Wave {at + 1}</span>
            <span className="text-[#71717C]">
              {(waves[at].share * 100).toFixed(1)}% of the run
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


function ZoneKey({ mapId, zones }: { mapId: string; zones: readonly ZoneKind[] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const doc = loadMap(mapId);
    if (doc && ref.current) drawThumb(doc, ref.current);
  }, [mapId]);
  return (
    <section className="rounded-lg border border-[#2E2E36] bg-[#151518]/70 p-3">
      <h2 className="mb-2 text-[12px] font-bold uppercase tracking-widest text-[#71717C]">
        Drop zones
      </h2>
      <canvas ref={ref} className="w-full rounded border border-[#2E2E36] [image-rendering:pixelated]" />
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[13px]">
        {zones.length === 0 ? (
          <span className="text-[#FF8A8A]">no drop zones — paint some in the map editor</span>
        ) : (
          zones.map((z) => (
            <span key={z} className="flex items-center gap-1.5">
              <span
                className="inline-block h-2.5 w-2.5 rounded-sm"
                style={{ background: zoneStyle(z).css }}
              />
              <span className="text-[#A6A6AF]">{ZONE_LABELS[z]}</span>
            </span>
          ))
        )}
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
  index,
  last,
  readOnly,
  onChange,
  onDelete,
  onMove,
}: {
  step: EditStep;
  waveNo: number;
  /** this wave's row of the number guide */
  guide?: WaveRow;
  index: number;
  last: boolean;
  /** the "as played" preview: derived counts, so nothing here can be edited */
  readOnly?: boolean;
  onChange: (next: EditStep) => void;
  onDelete: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const controls = readOnly ? null : (
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
  const payout = dropsForKills(killVector([step]));


  return (
    <div className="rounded-lg border border-[#2E2E36] bg-[#151518]/70 p-3">
      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-[14px] font-bold uppercase tracking-widest text-[#EDEDEF]">
          Wave {waveNo}
        </span>
        {/* NO RUNG BADGE. A wave used to carry the difficulty it first
            appeared at, because a difficulty was a prefix cut and moving a
            row past wave 20 changed who ever saw it. Every rung sends every
            wave now, so a wave's position says nothing about which rungs
            play it — only about how deep into the run it lands, which is
            the wave number already printed beside this */}
        <span className="text-[13px] text-[#71717C]">{total} enemies</span>
        {/* the number guide, per wave: what this wave weighs. The ramp
            chart is where its slice of the run is read now */}
        {guide && (
          <span className="text-[13px] font-bold text-[#A6A6AF]">{compactHp(guide.hp)} hp</span>
        )}
        <CostRow cost={payout} />
        <div className="ml-auto">{controls}</div>
      </div>

      {/* THE WAVE'S UNITS, one row per unit tree in tier order. There is no
          group header any more: a wave used to be a list of region groups,
          each with a dropdown naming the spawn region its share entered
          from, and that dropdown is exactly what the movement layers
          replaced. Every unit now walks to the doors its own layer opens,
          so a wave is just counts.

          The slots stay in the same place whatever the wave holds, so its
          ground/air/crawler mix is readable at a glance instead of being a
          bag of chips. */}
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
                value={step.counts[kind] ?? 0}
                disabled={readOnly}
                onChange={(n) => onChange({ ...step, counts: { ...step.counts, [kind]: n } })}
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
  disabled,
  onChange,
}: {
  kind: UnitKind;
  value: number;
  disabled?: boolean;
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
        disabled={disabled}
        title={`${kind} — T${UNIT_STATS[kind].tier}${on && !disabled ? " — click to clear" : ""}`}
        aria-label={on ? `Clear ${kind}` : `Add ${kind}`}
        className="shrink-0 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#FFD37F] disabled:cursor-default"
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
        disabled={disabled}
        label={`${kind} count`}
      />
    </span>
  );
}
