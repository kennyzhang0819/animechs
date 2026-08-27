"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  UNIT_KINDS,
  UNIT_STATS,
  UNIT_TREES,
  levelDoc,
  saveLevel,
  waveGroups,
  type LevelSpec,
  type LevelStep,
  type RegionWave,
  type UnitKind,
  type WaveUnits,
} from "@/game/levels";
import { dropsForKills } from "@/game/progress";
import { tierOfWave } from "@/game/ladder";
import {
  drawThumb,
  loadMap,
  OFFICIAL_MAP_IDS,
  spawnRegionIds,
  SPAWN_REGIONS,
} from "@/game/maps";
import { CostRow } from "./Items";

/* eslint-disable @next/next/no-img-element -- raw pixel sprites, no optimization wanted */

const unitIcon = (k: UnitKind): string => `/mindustry/sprites/units/${k}.png`;

/** region 0 is "any pad"; 1+ are the map's painted spawn regions */
const regionCss = (region: number): string =>
  region <= 0 ? "#A6A6AF" : SPAWN_REGIONS[(region - 1) % SPAWN_REGIONS.length].css;

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
  const [spawnRate, setSpawnRate] = useState(level.spawnRate);
  const [waveGap, setWaveGap] = useState(level.waveGap);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  // why the last save was refused — null when the last attempt succeeded
  const [saveError, setSaveError] = useState<string | null>(null);

  // reloading a different level through the same mounted component has to
  // reset the buffer, or the new level opens showing the old one's script
  useEffect(() => {
    setSteps(toEditSteps(level.script));
    setSpawnRate(level.spawnRate);
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
      spawnRate,
      waveGap,
      script: toScript(steps),
    });
    setSaving(false);
    if (res.ok) setDirty(false);
    else setSaveError(res.error);
  };

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
            <RegionKey mapId={mapId} regions={mapRegions} />

            <section className="rounded-lg border border-[#2E2E36] bg-[#151518]/70 p-3">
              <h2 className="mb-2 text-[12px] font-bold uppercase tracking-widest text-[#71717C]">
                Level
              </h2>
              <label className="flex items-center justify-between gap-2 text-[14px] text-[#A6A6AF]">
                Spawn rate
                <NumberInput
                  value={spawnRate}
                  min={1}
                  onChange={(n) => {
                    setSpawnRate(n);
                    setDirty(true);
                  }}
                />
              </label>
              <p className="mt-1 mb-3 text-[13px] leading-snug text-[#71717C]">
                Enemies entering per second. Every wave drains at this rate.
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

            <section className="rounded-lg border border-[#2E2E36] bg-[#151518]/70 p-3">
              <h2 className="mb-2 text-[12px] font-bold uppercase tracking-widest text-[#71717C]">
                Totals
              </h2>
              <dl className="space-y-1 text-[14px]">
                <Row label="Waves" value={String(summary.waves)} />
                <Row label="Enemies" value={String(summary.enemies)} />
                <Row label="Gap time" value={`${summary.waves * waveGap}s`} />
                <Row
                  label="Drain time"
                  value={`${Math.ceil(summary.enemies / Math.max(1, spawnRate))}s`}
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
            <InsertBar onInsert={() => edit((s) => [makeStep(), ...s])} />
            {steps.map((step, i) => {
              return (
                <div key={step.uid}>
                  <StepCard
                    step={step}
                    waveNo={i + 1}
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
  index,
  last,
  mapRegions,
  onChange,
  onDelete,
  onMove,
}: {
  step: EditStep;
  waveNo: number;
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
        {/* a wave's POSITION is its difficulty gate: the ladder sends the
            first BASE_WAVES + 3n of them at tier n, so this badge is the
            rung a wave first appears at. Moving a row up moves the fight it
            holds down the ladder, against a smaller fleet */}
        <span
          title={`First played at tier ${tierOfWave(index)}`}
          className="rounded border border-[#3A3320] bg-[#1C1810] px-1.5 text-[12px] font-bold uppercase tracking-widest text-[#FFD37F]"
        >
          T{tierOfWave(index)}
        </span>
        <span className="text-[13px] text-[#71717C]">{total} enemies</span>
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
