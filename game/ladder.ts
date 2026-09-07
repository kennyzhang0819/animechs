import {
  dropsForKills,
  UNIT_KINDS,
  UNIT_STATS,
  unitDrop,
  waveGroups,
  WORLD,
  type LevelSpec,
  type LevelStep,
  type UnitKind,
  WAVE_RELEASE_SECONDS,
} from "./levels";
import { TOWERS } from "./constants";
import {
  addDrop,
  emptyDrop,
  SCRAP_START,
  scrapPriceOf,
  STAGES,
  towersOfTier,
  waveBonusScrap,
  type Drop,
  type TowerTier,
} from "./economy";
import { MUT_COUNT_MAX, mutationBudget, mutationPicks } from "./mutation";

/**
 * THE LADDER — ONE CLIMB PER WORLD, TEN RUNGS, NO NAMES, ONE SCRIPT.
 *
 * EVERY RUNG PLAYS THE WHOLE AUTHORED SCRIPT — all fifty waves, wave 1 to
 * wave 50, the same fifty every time, and EVERY BODY AT THE SAME HEALTH.
 * A rung is two numbers: what its mutator roll may spend and how many
 * rules it returns (mutation.ts), and one more: how much the XP it pays is
 * multiplied by (tierXpBonus). That is the whole difference between Level
 * 1 and Level 10 — the rules the run is played under, and what it is
 * worth.
 *
 * THE HEALTH CURVE IS STILL HERE AND NOT USED. A rung used to be an enemy
 * LEVEL as well — every body's health times HP_PER_LEVEL ^ level, up to
 * x8 at the top — and that column is authored to zero on every rung now.
 * The mechanism stays (unitHpAtLevel, LevelSpec.enemyLevel, the balance
 * dashboard's dial), because a map or a mutator may want it one day; the
 * ladder simply does not turn it. Difficulty is rules, not hit points,
 * which is what makes Level 10 a different fight rather than the same
 * fight eight times over.
 *
 * WHAT A RUNG PAYS. Scrap is fixed per kill and never scales (economy.ts):
 * a rung's run banks the same scrap as any other, because scrap is what
 * the turret prices are authored against and a rung that paid more scrap
 * would be an easier fight, not a harder one. XP scales — see
 * XP_STEP_PER_RUNG — and that gradient is the whole reason to climb. A
 * clear pays the same the first time and the fifth: there is no
 * first-clear bonus, so a rung is worth exactly what its kills are.
 *
 * THE LADDER SCALES BY ONE CONSTANT. RUNG_COUNT is ten today because ten is
 * where the tuning has been checked, not because anything is finite: every
 * rung's dials are arithmetic on its index (see RUNGS), and `clearedByMap`
 * is an unbounded int per world, so raising RUNG_COUNT is the whole edit an
 * eleventh rung needs.
 */

/**
 * Mindustry's own per-level health curve. 1.06^12 = 2.01, so twelve levels
 * is exactly double health, and NOTHING else scales: armour, speed, hitbox
 * and drop all stay at their base values forever. Every rung is authored
 * at level 0 (see the note at the top of the file); the curve is kept for
 * the dial and for anything that wants it later.
 */
export const HP_PER_LEVEL = 1.06;

/**
 * HOW MUCH MORE XP EACH RUNG PAYS THAN THE ONE BELOW, linear: rung n pays
 * x (1 + XP_STEP_PER_RUNG x n). Level 10 pays x5.5 what Level 1 does.
 *
 * LINEAR, NOT COMPOUNDING, because the fight does not compound any more.
 * The old loot bonus compounded at 1.34 a rung to keep pace with health
 * that compounded at the same rate; with health flat, a compounding payout
 * would make the top rung the only one worth playing by a factor of
 * fourteen, and the mutator roll — the thing that actually makes a high
 * rung harder — is not fourteen times harder. Half again a rung is a
 * gradient a player feels and a farm they still choose: it was a third,
 * and playtests said the rules a high rung rolls make it a good deal more
 * than a third harder.
 */
export const XP_STEP_PER_RUNG = 0.5;

/** how many rungs the ladder has today — raising it is the whole edit an
 *  eleventh rung needs, because every dial below is arithmetic on the index */
export const RUNG_COUNT = 10;

/**
 * THE RUNGS, and the only place their shape is written down.
 *
 * Every dial is arithmetic on the rung's index, which is what makes the
 * ladder extend rather than need re-authoring. A rung has NO NAME and NO
 * IDENTITY beyond its number: it is shown as "Level n" (rungLabel) in a
 * colour read off its position (rungColor), and that is the whole of what
 * a player is told about it.
 *
 * THIS LADDER IS CLIMBED ONCE PER WORLD. This table says what a rung IS;
 * how far up it a save has got is a per-world number (clearedByMap in
 * progress.ts), so standing on rung 8 somewhere says nothing about
 * anywhere else.
 */
export const RUNGS: readonly {
  level: number;
  mutationPoints: number;
  mutationCount: number;
  xpBonus: number;
}[] = Array.from({ length: RUNG_COUNT }, (_, i) => ({
  // authored flat: the level curve is a mechanism the ladder does not use
  level: 0,
  // the two mutation columns are arithmetic on the index like the rest,
  // and both are zero at rung 1: the bottom of the ladder is the campaign
  // as authored (see mutation.ts)
  mutationPoints: mutationBudget(i),
  mutationCount: mutationPicks(i),
  xpBonus: 1 + XP_STEP_PER_RUNG * i,
}));

/**
 * THE COLOUR OF A RUNG, and the only identity one has beyond its number.
 *
 * Four anchors, evenly spaced across the ladder and interpolated between:
 * the UI palette's green, gold and red — the three the named difficulties
 * used to own outright — and the purple the hidden top tier wore.
 */
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
 * WHAT THE PLAYER IS SHOWN. Rung index 0 reads "Level 1".
 *
 * `tier` is 0-based everywhere in the code and in window.__ladder, because
 * tier 0 indexes RUNGS and an offset there would put a +1 in the middle of
 * the arithmetic. Nothing player-facing should ever print that index — use
 * this. Every label goes through here, so the internal index and the shown
 * number meet in exactly one place.
 */
export const rungLabel = (tier: number): string => `Level ${clampTier(tier) + 1}`;

/**
 * The rung's colour, wherever its label is shown — green through gold and
 * red to purple as the ladder climbs (see RUNG_COLORS). Same clamping as
 * the label, so a label and its colour can never disagree.
 */
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

/**
 * The 1-based ordinal — the number the label is built from, for the places
 * that want the number without the word: the editor's per-wave badge, an
 * axis label, a sort key, the balance document's own keys.
 */
export const rungOf = (tier: number): number => clampTier(tier) + 1;

/** enemy level of a rung — through the dials, so an override applies */
export const tierLevel = (tier: number): number => rungKnobsOf(tier).level;

/** health multiplier of a rung */
export const tierHpScale = (tier: number): number => HP_PER_LEVEL ** tierLevel(tier);

/** the XP multiplier of a rung — through the dials, so an override applies */
export const tierXpBonus = (tier: number): number => rungKnobsOf(tier).xpBonus;

/**
 * THE RUNG DIALS, tunable without a rebuild — the admin dashboard bends
 * these in module state, the balance document persists what is bent, and
 * everything in the sim and the lints reads through rungKnobsOf so an edit
 * takes effect on the next spawn. The authored values in RUNGS stay the
 * source of truth; once a number is settled it belongs there.
 */
export interface RungKnobs {
  /** enemy level — every unit's hp is x HP_PER_LEVEL^level, nothing else
   *  moves. Authored 0 on every rung; the dial is here for experiments */
  level: number;
  /**
   * THE MUTATION PAIR — what this tier's roll may spend, and how many
   * rules it comes back with (see mutation.ts). They are dials here rather
   * than constants there because they ARE the tier's difficulty now.
   *
   * BOTH ARE ZERO ON THE BOTTOM TIER as authored, which is the whole of
   * what "Level 1 is the campaign as authored" means.
   */
  mutationPoints: number;
  /** how many rules the roll returns, 0 to MUT_COUNT_MAX */
  mutationCount: number;
  /** what the run's XP is multiplied by — the reason to climb */
  xpBonus: number;
}

const RUNG_KNOB_KEYS = ["level", "mutationPoints", "mutationCount", "xpBonus"] as const;

/**
 * The ceiling a dial may be set to, where it has one. Only the mutator
 * count does: a hand-edited document asking for forty simultaneous rules
 * would deploy a run nobody wrote, and the cap is a design statement
 * (MUT_COUNT_MAX) rather than a UI convenience — so it is enforced on
 * write and on load, not only in the stepper.
 */
const RUNG_KNOB_MAX: Partial<Record<keyof RungKnobs, number>> = {
  mutationCount: MUT_COUNT_MAX,
};

/**
 * Keyed by the rung's ORDINAL as a string — "1" through "10". A rung has
 * no name, and its ordinal is the most stable thing there is: reordering
 * the table would be a redesign, and a document naming a rung the table
 * no longer has is simply dropped on load (see applyRungOverrides).
 */
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

/**
 * THE MUTATION PAIR IN FORCE AT A TIER — the two numbers a deploy hands
 * rollMutations, and the only way anything outside this file should ask.
 * Every reader goes through these rather than through mutationBudget and
 * mutationPicks directly, because those are the AUTHORED curves and these
 * are what the balance document may have bent.
 */
export const tierMutationPoints = (tier: number): number =>
  rungKnobsOf(tier).mutationPoints;
export const tierMutationCount = (tier: number): number =>
  rungKnobsOf(tier).mutationCount;

/** one unit's health at an enemy level (armour, speed and drop never move) */
export const unitHpAtLevel = (kind: UnitKind, level: number): number =>
  UNIT_STATS[kind].hp * HP_PER_LEVEL ** Math.max(0, level);

// ---------- expansion ----------

/**
 * The playable spec for one rung: the WHOLE authored script, carrying the
 * enemy level the sim scales health by (zero, as authored) and the rung
 * it was expanded for.
 */
export function specForTier(spec: LevelSpec, tier: number): LevelSpec {
  const n = clampTier(tier);
  return { ...spec, tier: n, enemyLevel: tierLevel(n) };
}

// ---------- strength ----------

/**
 * STRENGTH IS PRINTED HEALTH. That is the whole measure, and it is
 * weapon-agnostic on purpose: the player never fields one turret, so any
 * single-turret denominator says more about the denominator than about
 * the wave. Armour, shields and air ride along as COMPOSITION — shares
 * reported next to the health, never multiplied into it.
 */
export const waveHp = (step: LevelStep, level = 0): number => {
  let hp = 0;
  for (const g of waveGroups(step.wave))
    g.counts.forEach((count, i) => {
      if (count > 0) hp += unitHpAtLevel(UNIT_KINDS[i], level) * count;
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
  /** share of health that flies — hail and scorch cannot touch it at all */
  airShare: number;
  /** share of health carried by unit tier 3 and up */
  t3Share: number;
  /** seconds the run lasts if it is killed as fast as it arrives */
  duration: number;
  /** health per second the fleet has to keep up with */
  hpPerSecond: number;
}

/** weigh one rung */
export function budget(spec: LevelSpec, tier = 0): Budget {
  const run = specForTier(spec, tier);
  const level = run.enemyLevel ?? 0;
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
        const h = unitHpAtLevel(kind, level) * count;
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
 * Units whose armour meets nothing that can efficiently hurt it, WHERE THAT
 * ACTUALLY DECIDES ANYTHING — inside the first stage, where a fresh save's
 * board is duos and whatever tier-1 turret it has managed to unlock.
 *
 * This is a NOTE, not a gate. Nothing is ever unkillable — the 10% floor
 * means a duo always lands 0.9 — so a heavily armoured debut costs more
 * scrap, which is a legitimate thing for a script to ask for. What it
 * reports is the size of that ask, so an author choosing it is choosing it.
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

  const shot = TOWERS.duo.bullet.damage;
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
        message: `${kind} (armour ${armor}) debuts on wave ${wave + 1} against a duo's ${shot} damage — it costs an opening board ${tax.toFixed(1)}x its printed health, so budget the scrap for it`,
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
  /** how much of it flies — hail and scorch cannot touch these at all */
  airShare: number;
  /** what the wave's KILLS pay — scrap into the run, XP before the rung
   *  bonus. The wave bonus is not in here; see waveBonusScrap */
  drops: Drop;
}

export function waveCost(step: LevelStep, level = 0): WaveCost {
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
      const h = unitHpAtLevel(kind, level) * count;
      out.units += count;
      out.hp += h;
      if (stats.tier >= 3) t3 += h;
      if (stats.armor >= 3) armour += h;
      if (stats.flying) air += h;
      // the drop table is unitDrop in levels.ts — reading it rather than a
      // local triple is what lets a unit be a stats edit instead of an
      // economy edit: the audit must count the same drops the run banks
      addDrop(out.drops, unitDrop(kind), count);
    });
  }
  const share = (x: number): number => (out.hp > 0 ? x / out.hp : 0);
  out.t3Share = share(t3);
  out.armourShare = share(armour);
  out.airShare = share(air);
  return out;
}

/**
 * ONE WAVE, WEIGHED — the per-wave half of the number guide.
 *
 * `share` is the wave's slice of the whole run, which is the number to
 * author against: a wave carrying 5% of the run is filler, one carrying
 * 25% is a spike, and a stage's LAST wave should be its heaviest or the
 * stage tails off into the next.
 */
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
  /** what the wave pays: its kills plus its wave bonus */
  scrap: number;
  /** XP before the rung bonus */
  xp: number;
}

/** the per-wave guide, at the authored baseline — one row a wave */
export function waveGuide(spec: LevelSpec = WORLD): WaveRow[] {
  const total = budget(spec, 0).hp;
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
      scrap: c.drops.scrap + waveBonusScrap(i + 1),
      xp: c.drops.xp,
    };
    prev = c.hp;
    return row;
  });
}

/**
 * ONE STAGE OF THE RUN, PRICED: what the waves in it pay against what its
 * turret tier costs. THIS IS THE TABLE THE TURRET PRICES ARE AUTHORED
 * AGAINST (TOWER_PRICE in economy.ts), and the one to read after touching
 * either side.
 */
export interface StageRow {
  tier: TowerTier;
  /** 1-based inclusive wave range */
  from: number;
  to: number;
  units: number;
  /** scrap the stage's kills and wave bonuses pay */
  scrap: number;
  /** XP the stage's kills pay, before the rung bonus */
  xp: number;
  /** the tier's turret prices, cheapest to dearest */
  cheapest: number;
  dearest: number;
  mean: number;
  /**
   * HOW MANY OF THE TIER'S TURRETS THE STAGE BUYS, at the mean price —
   * the number that says whether the stage is the tier's stage. Tier 1
   * wants a board of them (dozens), tier 2 a line (tens), tier 3 a
   * handful. The opening scrap counts toward stage 1 only.
   */
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

/**
 * HOW MANY OF ITS TIER'S TURRETS A STAGE SHOULD BUY, at the mean price:
 * below the floor the tier is priced out of its own stage, above the
 * ceiling it is so cheap the stage before could have bought it. Tier 1
 * is a board, tier 2 a line, tier 3 a handful.
 */
export const STAGE_BOARDS: Readonly<Record<TowerTier, { min: number; max: number }>> = {
  1: { min: 800, max: 2500 },
  2: { min: 200, max: 800 },
  3: { min: 50, max: 250 },
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
  /** health per second the fleet has to keep up with */
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
  /** XP a full clear's kills pay at this rung, bonus included */
  xp: number;
}

/**
 * WALK THE LADDER AND REPORT WHAT EACH RUNG ASKS FOR AND PAYS. Every row
 * sends the same fifty waves at the same health, so the only columns that
 * move are the XP ones — which is the ladder saying what it is.
 */
export function audit(spec: LevelSpec = WORLD): AuditRow[] {
  const rows: AuditRow[] = [];
  const guide = waveGuide(spec);
  const scrap = guide.reduce((a, r) => a + r.scrap, 0);
  const xp = guide.reduce((a, r) => a + r.xp, 0);
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

/**
 * The authoring smell test, as a list of complaints. Empty means the script
 * is in line. Run it after editing waves or prices —
 * `window.__ladder.check()`.
 */
export function check(spec: LevelSpec = WORLD): LadderIssue[] {
  const out = debutViolations(spec);
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

/**
 * THE ECONOMY AS ONE TABLE OF TEXT — `window.__ladder.stages()`. The
 * three stages against their tiers, then the XP ladder, because the
 * interaction between income and price is the thing that cannot be seen
 * from any single constant.
 */
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

/** what one run's kills are worth, for the results overlay and the HUD */
export const runDrops = (killsByKind: ArrayLike<number>): Drop => dropsForKills(killsByKind);
