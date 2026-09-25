import {
  dropsForKills,
  isObjectiveKind,
  UNIT_KINDS,
  UNIT_STATS,
  unitDrop,
  waveGroups,
  WORLD,
  type LevelSpec,
  type LevelStep,
  type RegionWave,
  type UnitKind,
  type WaveUnits,
  WAVE_GAP_OPENING,
  WAVE_RELEASE_SECONDS,
} from "./levels";
import { TOWERS } from "./constants";
import {
  addDrop,
  coreIncomeBy,
  emptyDrop,
  MISSION_XP,
  SCRAP_START,
  scrapPriceOf,
  STAGES,
  towersOfTier,
  waveXp,
  type Drop,
  type TowerTier,
} from "./economy";
import { MUT_COUNT_MAX, MUT_FIRST_TIER, mutationBudget, mutationPicks } from "./mutation";

/**
 * THE LADDER — one climb per world, nine tiers, four names, one script.
 * docs/difficulty.md is the system: what a tier is, why the health curve
 * belongs to the tide and not to a tier, what a tier pays, and the dials.
 *
 * A TIER IS SIZE, THEN RULES — NEVER HEALTH. Every tier plays the whole
 * authored script with every body at the same health; what moves is how
 * many come (COUNT_SCALE) and what rules they come under (mutation.ts).
 * An OBJECTIVE body does not pay the share at all: one boss, one Borer,
 * one emplacement, at the same health on every rung (tierObjectiveHpScale).
 */

/** Mindustry's own per-level health curve, and the only thing a level
 *  moves: armour, speed, hitbox and drop never scale. Every tier is
 *  authored at level 0 — this is what the TIDE turns (Sim.loadStep) */
export const HP_PER_LEVEL = 1.06;

/** how many enemy levels are one doubling — derived, so a change to
 *  HP_PER_LEVEL carries. This is the step of the tide's infinite climb */
export const LEVELS_PER_DOUBLING = Math.round(Math.log(2) / Math.log(HP_PER_LEVEL));

/** how much more XP each tier pays than the one below, LINEAR: tier n
 *  weighs 1 + step*n, normalised so XP_BASE_TIER is x1. Compounding would
 *  make the top tier the only one worth playing (docs/difficulty.md) */
export const XP_STEP_PER_RUNG = 0.5;

/** how many rungs the ladder has today — moving it is the whole edit a
 *  rung on either end needs, because every dial below is arithmetic on the
 *  index. It was ten, and the tenth (Nemesis +6) came off: the top of the
 *  ladder is Nemesis +5 */
export const RUNG_COUNT = 9;

/** the named difficulties, one per tier of the size ramp; above the last
 *  name a tier is that name with a "+n" (rungLabel) */
export const DIFFICULTY_NAMES: readonly string[] = [
  "Incursion",
  "Onslaught",
  "Scourge",
  "Nemesis",
];

/** the tier the mission pot is priced for: the last named difficulty,
 *  where the script is sent whole. A clear there pays exactly MISSION_XP */
export const XP_BASE_TIER = DIFFICULTY_NAMES.length - 1;

/** the share of every wave's count a tier sends. A count that scales to
 *  nothing still sends one body — a boss wave is always a boss wave */
export const COUNT_SCALE: readonly number[] = [0.25, 0.5, 0.75, 1];

/**
 * THE TIERS, and the only place their shape is written down. Every dial is
 * arithmetic on the index, which is what makes the ladder extend rather
 * than need re-authoring. How far up a save has got is per-world
 * (clearedByMap in progress.ts), not a property of this table.
 */
export const RUNGS: readonly {
  level: number;
  countScale: number;
  mutationPoints: number;
  mutationCount: number;
  xpBonus: number;
}[] = Array.from({ length: RUNG_COUNT }, (_, i) => ({
  // authored flat: the level curve is a mechanism the ladder does not use
  level: 0,
  // the size ramp, then the whole script
  countScale: COUNT_SCALE[Math.min(i, COUNT_SCALE.length - 1)],
  // the two mutation columns are arithmetic on the index like the rest,
  // and both are zero on every named difficulty: the bottom of the ladder
  // is the campaign as authored, at a size (see mutation.ts)
  mutationPoints: mutationBudget(i),
  mutationCount: mutationPicks(i),
  xpBonus: (1 + XP_STEP_PER_RUNG * i) / (1 + XP_STEP_PER_RUNG * XP_BASE_TIER),
}));

/** four anchors, evenly spaced across the ladder and interpolated */
const RUNG_COLORS: readonly [number, number, number][] = [
  [0x7b, 0xe5, 0x8a], // green
  [0xff, 0xd3, 0x7f], // gold
  [0xff, 0x5a, 0x5a], // red
  [0xa0, 0x5a, 0xe5], // purple
];

/** the last rung there is — index 9, the tenth */
export const TOP_TIER = RUNG_COUNT - 1;

/** every rung index is clamped into the table; there is nothing above it */
const clampTier = (tier: number): number =>
  Math.min(TOP_TIER, Math.max(0, Math.floor(tier)));

/**
 * WHAT THE PLAYER IS SHOWN — "Incursion", "Nemesis", "Nemesis +1".
 *
 * `tier` is 0-based everywhere in the code and in window.__ladder, and
 * nothing player-facing may print that index: every label goes through
 * here, so the internal index and the shown name meet in one place.
 * "Level" is never the word — a level is the player's.
 */
export function rungLabel(tier: number): string {
  const t = clampTier(tier);
  const last = DIFFICULTY_NAMES.length - 1;
  return t <= last ? DIFFICULTY_NAMES[t] : `${DIFFICULTY_NAMES[last]} +${t - last}`;
}

/** the count share a rung sends, 0.25 at the bottom, 1 from Nemesis up */
export const tierCountScale = (tier: number): number => RUNGS[clampTier(tier)].countScale;

/** ...and what an OBJECTIVE pays: nothing. A mission's body has the same
 *  pool on every rung — the swarm's count is the only thing a difficulty
 *  moves (docs/difficulty.md). Kept as a dial so the seam stays in place */
export const tierObjectiveHpScale = (_tier: number): number => 1;

/** the rung a save must have cleared on SOME map to open this one, -1 for
 *  none. NO TIER ASKS FOR A CLEAR: Incursion through Nemesis are open from
 *  the first run, and the rungs above want only the mutator deck's level
 *  (docs/difficulty.md). The dial stays so the seam does */
export const tierClearNeeded = (_tier: number): number => -1;

/** does a save whose best clear anywhere is `bestCleared` (0-based, -1 for
 *  none) stand high enough on the climb to deploy this rung? */
export const tierClimbOpen = (bestCleared: number, tier: number): boolean =>
  bestCleared >= tierClearNeeded(tier);

/** how many mutator steps above Nemesis a rung stands — 0 on every named one */
export const tierMutationStep = (tier: number): number =>
  Math.max(0, clampTier(tier) - MUT_FIRST_TIER + 1);

/** the tier's colour — same clamping as the label, so the two can never
 *  disagree */
export function rungColor(tier: number): string {
  const t = TOP_TIER > 0 ? clampTier(tier) / TOP_TIER : 0;
  const span = RUNG_COLORS.length - 1;
  const i = Math.min(span - 1, Math.floor(t * span));
  const f = t * span - i;
  const hex = RUNG_COLORS[i]
    .map((c, k) => Math.round(c + (RUNG_COLORS[i + 1][k] - c) * f))
    .map((c) => c.toString(16).padStart(2, "0"))
    .join("");
  return `#${hex.toUpperCase()}`;
}

/** the 1-based ordinal, for the places that want the number without the
 *  word: a badge, an axis label, a sort key, the balance document's keys */
export const rungOf = (tier: number): number => clampTier(tier) + 1;

/** enemy level of a rung — through the dials, so an override applies */
export const tierLevel = (tier: number): number => rungKnobsOf(tier).level;

/** health multiplier of a rung */
export const tierHpScale = (tier: number): number => HP_PER_LEVEL ** tierLevel(tier);

/** the XP multiplier of a rung — through the dials, so an override applies */
export const tierXpBonus = (tier: number): number => rungKnobsOf(tier).xpBonus;

/**
 * THE TIER DIALS, tunable without a rebuild — the dashboard bends these in
 * module state, the balance document persists them, and everything reads
 * through rungKnobsOf. The authored values in RUNGS stay the source of
 * truth; once a number is settled it belongs there.
 */
export interface RungKnobs {
  /** enemy level — every unit's hp is x HP_PER_LEVEL^level, nothing else
   *  moves. Authored 0 on every rung; the dial is here for experiments */
  level: number;
  /** what this tier's roll may spend, and how many rules it returns
   *  (mutation.ts). Dials here rather than constants there because they
   *  ARE the tier's difficulty; both zero on every named difficulty */
  mutationPoints: number;
  /** how many rules the roll returns, 0 to MUT_COUNT_MAX */
  mutationCount: number;
  /** what the run's XP is multiplied by — the reason to climb */
  xpBonus: number;
}

const RUNG_KNOB_KEYS = ["level", "mutationPoints", "mutationCount", "xpBonus"] as const;

/** the ceiling a dial may be set to, where it has one. Only the mutator
 *  count does, and it is a design statement rather than a UI convenience,
 *  so it is enforced on write and on load and not only in the stepper */
const RUNG_KNOB_MAX: Partial<Record<keyof RungKnobs, number>> = {
  mutationCount: MUT_COUNT_MAX,
};

/** keyed by the tier's ORDINAL as a string — a tier has no name, and a
 *  document naming one the table no longer has is dropped on load */
const rungOverrides = new Map<string, Partial<RungKnobs>>();

/** the balance document's key for a rung — its 1-based ordinal */
export const rungKey = (tier: number): string => String(rungOf(tier));

/** every dial in force for a rung — authored unless overridden */
export function rungKnobsOf(tier: number): RungKnobs {
  const d = RUNGS[clampTier(tier)];
  const o = rungOverrides.get(rungKey(tier)) ?? {};
  return {
    level: o.level ?? d.level,
    mutationPoints: o.mutationPoints ?? d.mutationPoints,
    mutationCount: o.mutationCount ?? d.mutationCount,
    xpBonus: o.xpBonus ?? d.xpBonus,
  };
}

/** the dials as authored — where a Reset returns to */
export function authoredRungKnobs(tier: number): RungKnobs {
  const d = RUNGS[clampTier(tier)];
  return { ...d };
}

/** point one dial somewhere else; undefined restores the authored value */
export function setRungKnob(
  tier: number,
  knob: keyof RungKnobs,
  value: number | undefined,
): void {
  const key = rungKey(tier);
  const o: Partial<RungKnobs> = { ...(rungOverrides.get(key) ?? {}) };
  const ceiling = RUNG_KNOB_MAX[knob];
  if (value === undefined || !Number.isFinite(value) || value < 0) delete o[knob];
  else o[knob] = ceiling === undefined ? value : Math.min(ceiling, value);
  if (Object.keys(o).length === 0) rungOverrides.delete(key);
  else rungOverrides.set(key, o);
}

/** only what has actually been bent, for the balance document */
export function allRungOverrides(): Record<string, Partial<RungKnobs>> {
  return Object.fromEntries([...rungOverrides].map(([k, v]) => [k, { ...v }]));
}

/** replace every rung override at once — what a saved document applies */
export function applyRungOverrides(doc: Record<string, Partial<RungKnobs>>): void {
  rungOverrides.clear();
  for (let tier = 0; tier <= TOP_TIER; tier++) {
    const key = rungKey(tier);
    const v = doc[key];
    if (!v || typeof v !== "object") continue;
    const clean: Partial<RungKnobs> = {};
    for (const k of RUNG_KNOB_KEYS) {
      const n = v[k];
      if (typeof n !== "number" || !Number.isFinite(n) || n < 0) continue;
      const ceiling = RUNG_KNOB_MAX[k];
      clean[k] = ceiling === undefined ? n : Math.min(ceiling, n);
    }
    if (Object.keys(clean).length > 0) rungOverrides.set(key, clean);
  }
}

/** the mutation pair in force at a tier — the only way anything outside
 *  this file should ask, because mutationBudget and mutationPicks are the
 *  AUTHORED curves and these are what the balance document may have bent */
export const tierMutationPoints = (tier: number): number =>
  rungKnobsOf(tier).mutationPoints;
export const tierMutationCount = (tier: number): number =>
  rungKnobsOf(tier).mutationCount;

/** one unit's health at an enemy level (armour, speed and drop never move) */
export const unitHpAtLevel = (kind: UnitKind, level: number): number =>
  UNIT_STATS[kind].hp * HP_PER_LEVEL ** Math.max(0, level);

/** ...and what one body is worth on a TIER: the level curve times the
 *  boss's share of the size ramp if this kind is the boss. Every price
 *  here and the health the sim hands a spawn go through this */
export const unitHpOnRung = (kind: UnitKind, level: number, objectiveHpScale = 1): number =>
  unitHpAtLevel(kind, level) * (isObjectiveKind(kind) ? objectiveHpScale : 1);

// ---------- expansion ----------

/**
 * The playable spec for one tier: the whole authored script at the tier's
 * count share. THE COUNT IS SCALED HERE AND NOWHERE ELSE, so the sim, the
 * audit and the picker's detail card all read the same swarm.
 */
export function specForTier(spec: LevelSpec, tier: number): LevelSpec {
  const n = clampTier(tier);
  const scale = tierCountScale(n);
  const script =
    scale === 1
      ? spec.script
      : spec.script.map((step) => ({
          ...step,
          wave: scaleWave(step.wave, scale),
        }));
  return { ...spec, script, tier: n, enemyLevel: tierLevel(n), objectiveHpScale: tierObjectiveHpScale(n) };
}

/** one wave at a share of its count — the group form keeps its region ids */
function scaleWave(
  wave: WaveUnits | readonly RegionWave[],
  scale: number,
): WaveUnits | readonly RegionWave[] {
  const scaleUnits = <T extends WaveUnits>(w: T): T => {
    const out = { ...w };
    for (const k of UNIT_KINDS) {
      const c = w[k] ?? 0;
      if (c > 0) out[k] = Math.max(1, Math.round(c * scale));
    }
    return out;
  };
  return Array.isArray(wave)
    ? (wave as readonly RegionWave[]).map(scaleUnits)
    : scaleUnits(wave as WaveUnits);
}

// ---------- strength ----------

/** STRENGTH IS PRINTED HEALTH — weapon-agnostic on purpose, and armour,
 *  shields and air ride along as composition, never multiplied in */
export const waveHp = (step: LevelStep, level = 0, objectiveHpScale = 1): number => {
  let hp = 0;
  for (const g of waveGroups(step.wave))
    g.counts.forEach((count, i) => {
      if (count > 0) hp += unitHpOnRung(UNIT_KINDS[i], level, objectiveHpScale) * count;
    });
  return hp;
};

export interface Budget {
  waves: number;
  units: number;
  /** printed health of everything the run sends — the strength measure */
  hp: number;
  /** share of health carried by units with armour 3 or more */
  armourShare: number;
  /** share of health carried by units with a shield ability */
  shieldShare: number;
  /** share of health that flies — lobber and torch cannot touch it at all */
  airShare: number;
  /** share of health carried by unit tier 3 and up */
  t3Share: number;
  /** seconds the run lasts if it is killed as fast as it arrives */
  duration: number;
  /** health per second the board has to keep up with */
  hpPerSecond: number;
}

/** weigh one rung */
export function budget(spec: LevelSpec, tier = 0): Budget {
  const run = specForTier(spec, tier);
  const level = run.enemyLevel ?? 0;
  const bossHp = run.objectiveHpScale ?? 1;
  let units = 0;
  let hp = 0;
  let armour = 0;
  let shielded = 0;
  let air = 0;
  let t3 = 0;
  for (const step of run.script) {
    for (const g of waveGroups(step.wave)) {
      g.counts.forEach((count, i) => {
        if (count <= 0) return;
        const kind = UNIT_KINDS[i];
        const stats = UNIT_STATS[kind];
        const h = unitHpOnRung(kind, level, bossHp) * count;
        units += count;
        hp += h;
        if (stats.armor >= 3) armour += h;
        if (stats.forceField || stats.shieldField) shielded += h;
        if (stats.flying) air += h;
        if (stats.tier >= 3) t3 += h;
      });
    }
  }
  // every wave costs its gap plus the same fixed release window, so the
  // run's length is its WAVE COUNT and no longer its unit count
  const duration = run.script.length * (run.waveGap + WAVE_RELEASE_SECONDS);
  const share = (x: number): number => (hp > 0 ? x / hp : 0);
  return {
    waves: run.script.length,
    units,
    hp,
    armourShare: share(armour),
    shieldShare: share(shielded),
    airShare: share(air),
    t3Share: share(t3),
    duration,
    hpPerSecond: hp / Math.max(1e-6, duration),
  };
}


// ---------- the debut rule ----------

/**
 * Units whose armour meets nothing that can efficiently hurt it, inside
 * the first stage where that decides anything. A NOTE, not a gate: the 10%
 * floor means nothing is ever unkillable, so a heavy debut just costs more
 * scrap, and this reports the size of the ask (docs/difficulty.md).
 */
export function debutViolations(spec: LevelSpec = WORLD): LadderIssue[] {
  const debut = new Map<UnitKind, number>();
  spec.script.forEach((step, i) => {
    for (const g of waveGroups(step.wave))
      g.counts.forEach((count, k) => {
        if (count <= 0) return;
        const kind = UNIT_KINDS[k];
        debut.set(kind, Math.min(debut.get(kind) ?? Infinity, i));
      });
  });

  const shot = TOWERS.tacker.bullet.damage;
  const opening = STAGES[0].to;
  const bad: LadderIssue[] = [];
  for (const [kind, wave] of debut) {
    if (wave >= opening) continue;
    // the armour a tower actually meets — the PRINTED value, which is what
    // an unmutated run spawns with. Armored Swarms plates the light bodies
    // on top of this and is deliberately not priced in: the lint is about
    // the script an author wrote, and a rolled rule is not the script's
    const armor = UNIT_STATS[kind].armor;
    const tax = shot / Math.max(shot - armor, 0.1 * shot);
    if (tax >= 2)
      bad.push({
        tier: 0,
        kind: "debut",
        message: `${kind} (armour ${armor}) debuts on wave ${wave + 1} against a tacker's ${shot} damage — it costs an opening board ${tax.toFixed(1)}x its printed health, so budget the scrap for it`,
      });
  }
  return bad;
}

/**
 * One complaint about a script. `tier` is the rung it belongs to, so the
 * level editor can label the wave rows that rung owns; null means the
 * finding is about the script as a whole.
 */
export interface LadderIssue {
  tier: number | null;
  kind: "debut" | "economy";
  message: string;
}

// ---------- authoring aid ----------

/** what one authored wave weighs and pays, at a given enemy level */
export interface WaveCost {
  units: number;
  /** printed health — the strength measure */
  hp: number;
  /** share of that health carried by unit tier 3 and up */
  t3Share: number;
  /** share carried by units with armour 3 or more */
  armourShare: number;
  /** how much of it flies — lobber and torch cannot touch these at all */
  airShare: number;
  /** what killing the whole wave drops — which is the wave's whole income
   *  now that staging one pays nothing. XP is not in here either: a wave's
   *  XP is its share of the mission pot (waveXp), not a property of its
   *  bodies */
  drops: Drop;
}

export function waveCost(step: LevelStep, level = 0, objectiveHpScale = 1): WaveCost {
  const out: WaveCost = {
    units: 0,
    hp: 0,
    t3Share: 0,
    armourShare: 0,
    airShare: 0,
    drops: emptyDrop(),
  };
  let t3 = 0;
  let armour = 0;
  let air = 0;
  for (const g of waveGroups(step.wave)) {
    g.counts.forEach((count, i) => {
      if (count <= 0) return;
      const kind = UNIT_KINDS[i];
      const stats = UNIT_STATS[kind];
      const h = unitHpOnRung(kind, level, objectiveHpScale) * count;
      out.units += count;
      out.hp += h;
      if (stats.tier >= 3) t3 += h;
      if (stats.armor >= 3) armour += h;
      if (stats.flying) air += h;
      // the drop table is unitDrop in levels.ts — reading it rather than a
      // copy is what keeps this audit honest through a balance edit: it
      // must count the same drops the run banks
      addDrop(out.drops, unitDrop(kind), count);
    });
  }
  const share = (x: number): number => (out.hp > 0 ? x / out.hp : 0);
  out.t3Share = share(t3);
  out.armourShare = share(armour);
  out.airShare = share(air);
  return out;
}

/** one wave, weighed. `share` is the number to author against: 5% is
 *  filler, 25% is a spike, and a stage's LAST wave should be its heaviest */
export interface WaveRow {
  /** 1-based wave number, as the editor shows it */
  wave: number;
  units: number;
  /** printed health at enemy level 0 — the authored weight */
  hp: number;
  /** this wave's share of the whole run's health */
  share: number;
  /** health relative to the wave before it — kept for window.__ladder.waves() */
  step: number;
  armourShare: number;
  airShare: number;
  t3Share: number;
  /** what the CORE pays across this wave's slot on the clock — the run's
   *  whole income (economy.ts coreIncomeBy). It reads the schedule and
   *  nothing about the wave; the drops the bodies WOULD have paid are
   *  waveCost().drops, which is a fact about the script and not a purse */
  scrap: number;
  /** what CLEARING the wave banks — its share of MISSION_XP, before the
   *  rung bonus. It reads off the wave's position and the script's
   *  length, never off what the wave holds */
  xp: number;
}

/** the second a wave's slot on the clock ends — wave 0 is the run's start
 *  (levels.ts: the cadence IS the schedule) */
const waveEndsAt = (spec: LevelSpec, wave: number): number =>
  WAVE_GAP_OPENING + wave * (spec.waveGap + WAVE_RELEASE_SECONDS);

/** the per-wave guide, at the authored baseline — one row a wave */
export function waveGuide(spec: LevelSpec = WORLD): WaveRow[] {
  const total = budget(spec, 0).hp;
  const waves = spec.script.length;
  let prev = 0;
  return spec.script.map((step, i) => {
    const c = waveCost(step, 0);
    const row: WaveRow = {
      wave: i + 1,
      units: c.units,
      hp: c.hp,
      share: c.hp / Math.max(1, total),
      step: prev ? c.hp / prev : 1,
      armourShare: c.armourShare,
      airShare: c.airShare,
      t3Share: c.t3Share,
      scrap: Math.round(coreIncomeBy(waveEndsAt(spec, i + 1)) - coreIncomeBy(waveEndsAt(spec, i))),
      xp: waveXp(i + 1, waves),
    };
    prev = c.hp;
    return row;
  });
}

/** one stage of the run, priced: what its waves pay against what its
 *  turret band costs. THE TABLE THE PRICES ARE AUTHORED AGAINST */
export interface StageRow {
  tier: TowerTier;
  /** 1-based inclusive wave range */
  from: number;
  to: number;
  units: number;
  /** scrap the stage's waves drop, plus the opening bank in stage 1 —
   *  what the stage buys its tier with */
  scrap: number;
  /** XP clearing the stage's waves banks, before the rung bonus */
  xp: number;
  /** the tier's turret prices, cheapest to dearest */
  cheapest: number;
  dearest: number;
  mean: number;
  /** how many of the band's turrets the stage buys at the mean price —
   *  the number that says whether the stage is the band's stage */
  boards: number;
}

/** the three stages, weighed against their tiers */
export function stageAudit(spec: LevelSpec = WORLD): StageRow[] {
  const rows = waveGuide(spec);
  return STAGES.map((s) => {
    let units = 0;
    let scrap = s.tier === 1 ? SCRAP_START : 0;
    let xp = 0;
    for (const r of rows) {
      if (r.wave < s.from || r.wave > s.to) continue;
      units += r.units;
      scrap += r.scrap;
      xp += r.xp;
    }
    const prices = towersOfTier(s.tier).map(scrapPriceOf);
    const mean = prices.reduce((a, b) => a + b, 0) / Math.max(1, prices.length);
    return {
      tier: s.tier,
      from: s.from,
      to: s.to,
      units,
      scrap: Math.round(scrap),
      xp: Math.round(xp),
      cheapest: Math.min(...prices),
      dearest: Math.max(...prices),
      mean: Math.round(mean),
      boards: +(scrap / Math.max(1, mean)).toFixed(1),
    };
  });
}

/** how many of its band's turrets a stage should buy: below the floor the
 *  band is priced out of its own stage, above the ceiling the stage before
 *  could have bought it */
export const STAGE_BOARDS: Readonly<Record<TowerTier, { min: number; max: number }>> = {
  1: { min: 560, max: 3890 },
  2: { min: 190, max: 1950 },
  3: { min: 40, max: 800 },
  4: { min: 10, max: 260 },
};

/** one rung, weighed — the row the editor's ladder check renders */
export interface AuditRow {
  tier: number;
  /** the 1-based ordinal — the rung's whole identity */
  rung: number;
  /** what the player is shown, "Level n" */
  label: string;
  units: number;
  /** enemy level the rung plays at (0, as authored) */
  level: number;
  /** printed health of the whole run — THE strength number */
  hp: number;
  /** health per second the board has to keep up with */
  hpPerSecond: number;
  /** seconds the run lasts */
  duration: number;
  t3Share: number;
  armourShare: number;
  shieldShare: number;
  /** the XP multiplier this rung carries */
  xpBonus: number;
  /** scrap a full clear pays — the same on every rung, by design */
  scrap: number;
  /** XP a full clear pays at this rung: the mission pot, bonus included */
  xp: number;
}

/** walk the ladder and report what each tier asks for and pays — every
 *  row sends the same waves at the same health, so the only columns that
 *  move are the XP ones, which is the ladder saying what it is */
export function audit(spec: LevelSpec = WORLD): AuditRow[] {
  const rows: AuditRow[] = [];
  const guide = waveGuide(spec);
  const scrap = guide.reduce((a, r) => a + r.scrap, 0);
  // the pot, not the sum of the guide's rounded shares: a full clear pays
  // exactly MISSION_XP (missionXp), whatever the rounding did per wave
  const xp = guide.length > 0 ? MISSION_XP : 0;
  for (let tier = 0; tier <= TOP_TIER; tier++) {
    const run = specForTier(spec, tier);
    const b = budget(spec, tier);
    const bonus = tierXpBonus(tier);
    rows.push({
      tier,
      rung: rungOf(tier),
      label: rungLabel(tier),
      units: b.units,
      level: run.enemyLevel ?? 0,
      hp: Math.round(b.hp),
      hpPerSecond: Math.round(b.hpPerSecond),
      duration: Math.round(b.duration),
      t3Share: +b.t3Share.toFixed(2),
      armourShare: +b.armourShare.toFixed(2),
      shieldShare: +b.shieldShare.toFixed(2),
      xpBonus: +bonus.toFixed(2),
      scrap: Math.round(scrap),
      xp: Math.round(xp * bonus),
    });
  }
  return rows;
}

/** how many bodies one run sends, exactly — a RULE and not an
 *  observation, which is why check() enforces it: a wave edit that quietly
 *  moves it has changed the run's income as well as its fight */
export const SCRIPT_BODIES = 50_000;

/**
 * The authoring smell test, as a list of complaints. Empty means the script
 * is in line. Run it after editing waves or prices —
 * `window.__ladder.check()`.
 */
export function check(spec: LevelSpec = WORLD): LadderIssue[] {
  const out = debutViolations(spec);
  // THE BODY COUNT IS AN AUTHORED NUMBER, not a number the script happens
  // to add up to: a run sends exactly SCRIPT_BODIES bodies, so "how far did
  // the swarm get" is the same question on every map and the drop table
  // (economy.ts) prices a known quantity of salvage. Pad or trim the
  // cheapest kind in the waves that already field it — an ironhide1 either way
  const bodies = waveGuide(spec).reduce((a, r) => a + r.units, 0);
  if (bodies !== SCRIPT_BODIES)
    out.push({
      tier: null,
      kind: "economy",
      message: `the script sends ${bodies.toLocaleString()} bodies, not the ${SCRIPT_BODIES.toLocaleString()} it is authored to — ${bodies > SCRIPT_BODIES ? "trim" : "pad"} ${Math.abs(bodies - SCRIPT_BODIES).toLocaleString()}`,
    });
  // THE STAGE RULE, and the one thing the script and the prices can
  // disagree on: each stage has to be able to buy its own tier. A tier its
  // stage cannot afford is content the run never fields; a tier its stage
  // buys by the hundred was the previous stage's turret with a bigger
  // number on it
  for (const s of stageAudit(spec)) {
    const { min, max } = STAGE_BOARDS[s.tier];
    if (s.boards < min)
      out.push({
        tier: null,
        kind: "economy",
        message: `waves ${s.from}-${s.to} pay ${s.scrap.toLocaleString()} scrap, which buys ${s.boards} tier-${s.tier} turrets at the mean price of ${s.mean} — under the ${min} the stage is meant to field`,
      });
    if (s.boards > max)
      out.push({
        tier: null,
        kind: "economy",
        message: `waves ${s.from}-${s.to} pay ${s.scrap.toLocaleString()} scrap, which buys ${s.boards} tier-${s.tier} turrets at the mean price of ${s.mean} — over the ${max} that keeps the tier a stage-${s.tier} purchase`,
      });
  }
  return out;
}

/** the economy as one table of text — window.__ladder.stages() */
export function stageTable(spec: LevelSpec = WORLD): string {
  const head = "stage  waves     units     scrap        xp   cheapest  dearest   mean  boards";
  const rows = stageAudit(spec).map(
    (s) =>
      `${String(s.tier).padStart(5)}  ${`${s.from}-${s.to}`.padEnd(7)} ${String(s.units).padStart(7)}  ${String(
        s.scrap,
      ).padStart(8)}  ${String(s.xp).padStart(8)}  ${String(s.cheapest).padStart(9)}  ${String(
        s.dearest,
      ).padStart(7)}  ${String(s.mean).padStart(5)}  ${String(s.boards).padStart(6)}`,
  );
  const xpHead = "rung   xp bonus   xp a clear";
  const xpRows = audit(spec).map(
    (r) =>
      `${String(r.rung).padStart(4)}  ${("x" + r.xpBonus.toFixed(2)).padStart(9)}  ${String(
        r.xp,
      ).padStart(11)}`,
  );
  return [head, ...rows, "", xpHead, ...xpRows].join("\n");
}

/** what a run's kills dropped, by the per-kind ledger (Sim.killsByKind) */
export const runDrops = (killsByKind: ArrayLike<number>): Drop => dropsForKills(killsByKind);
