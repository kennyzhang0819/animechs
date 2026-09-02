import {
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
import { isTowerNode, TECH_TREE, type TechNodeDef } from "./tech";
import {
  MUT_COUNT_MAX,
  mutationBudget,
  mutationPicks,
} from "./mutation";
import {
  BASE_ITEM,
  costEntries,
  ITEM_INFO,
  ITEM_KINDS,
  type Cost,
} from "./items";

/**
 * THE LADDER — ONE CLIMB PER WORLD, TEN RUNGS, NO NAMES, ONE SCRIPT.
 *
 * EVERY RUNG PLAYS THE WHOLE AUTHORED SCRIPT — all fifty waves, wave 1 to
 * wave 50, the same fifty every time. A rung is not a cut of the campaign
 * and never has more or less of it than the rung below. A rung is ONE
 * NUMBER: the enemy level the whole script is played at.
 *
 *   rung   1   2   3   4   5   6   7   8   9  10
 *   level  0   4   8  12  16  20  24  28  32  36
 *
 * So the waves are the CONTENT and the rung is the DIFFICULTY, and the two
 * are completely separate. Rung 1 is the campaign as authored; rung 2 is
 * that same campaign with four enemy levels on it, x1.26 health a body;
 * rung 10 is it at level 36, x8.1 health a body. Nothing about wave 37
 * changes between them except how much health walks in.
 *
 * THIS REPLACED TWO THINGS AT ONCE. There were four NAMED difficulties —
 * Incursion / Onslaught / Nemesis / Eradication — and each was a PREFIX CUT
 * of the script (20, 35, 50, 50 waves) as well as a level. Both are gone.
 * The names are gone because a rung is a number the player reads off a
 * counter, and the cuts are gone because content a difficulty withholds is
 * content most saves never see: the last fifteen waves were the best-written
 * in the game and two thirds of the ladder never sent them.
 *
 * THE LADDER SCALES BY ONE CONSTANT. RUNG_COUNT is ten today because ten is
 * where the tuning has been checked, not because anything is finite: every
 * rung's dials are arithmetic on its index (see RUNGS), and `clearedByMap`
 * is an unbounded int per world, so raising RUNG_COUNT is the whole edit an
 * eleventh rung needs.
 *
 * WHAT REPLACED THE OLD ANTI-FARM GUARD. A rung used to carry a fixed
 * roster ceiling — an Incursion was a first-three-currencies fight forever,
 * whatever the save owned (`bandForTier`, deleted). That is the right rule
 * for four rows with big gaps and the wrong one for a continuous ladder:
 * steamrolling the rung that used to kill you IS the ascension fantasy, and
 * a permission gate takes it away. The guard is now an INCOME GRADIENT —
 * see LOOT_PER_RUNG. Nobody farms rung 4 when rung 10 pays 10x.
 *
 * Nothing is generated. Wave 1 of rung 10 is wave 1 of the same authored
 * list rung 1 plays, with 36 levels on it — which is what lets the level
 * editor be the whole authoring surface.
 */

/**
 * Mindustry's own per-level health curve. 1.06^12 = 2.01, so twelve levels
 * is exactly double health, and NOTHING else scales: armour, speed, hitbox
 * and drop all stay at their base values forever.
 *
 * Flat armour against level-scaled health is what keeps the rungs distinct
 * rather than merely harder. A rung is a level offset on this same curve,
 * so a level-20 dagger outlives a level-0 mace and still has a dagger's
 * armour, while the level-20 fortress is still the thing chip damage cannot
 * scratch.
 */
export const HP_PER_LEVEL = 1.06;

/**
 * ENEMY LEVELS ADDED PER RUNG, and the only thing that makes one rung
 * different from the next: 4 levels is x1.2625 health on every body.
 *
 * It is the WHOLE step now. Under the named difficulties a step was two
 * things multiplied — ten levels AND fifteen new waves — and the wave half
 * is gone, so this number alone is what "one rung harder" means. That is
 * why it is small: 1.26 is a step a fleet can answer by growing a quarter,
 * which is roughly one evening of farming, and ten of them compound to
 * x8.1.
 */
export const LEVELS_PER_RUNG = 4;

/**
 * A RUNG SCALES HEALTH AND THE ROLL, AND NOTHING ELSE. Two columns of this
 * table have left it, and both left the same way — as named rules a deploy
 * can be played under rather than curves nobody could see:
 *
 *   SWARM ARMOUR — flat armour on every tier 1-3 body, +2 a rung from the
 *   sixth up, landing +10 at the top. It is the Armored Swarms mutator now
 *   (ARMORED_ARMOR in mutation.ts).
 *
 *   SHIELD SCALE — every shield ability's pool, cap and regen, compounding
 *   from x1.00 to x5.00 across the ladder. It is the Overshields mutator
 *   now (OVERSHIELD_SCALE in mutation.ts).
 *
 * Both were sound as ARITHMETIC and wrong as LADDER. A rung's job is to
 * say how much fight there is, and health times the level curve says that
 * exactly; a rule that only bites against small calibre, or only against
 * the one kind that carries a force field, is a rule about HOW the fight
 * goes — which is a mutator, printed on the card before Deploy and either
 * in force or not. So what is left on a rung is the enemy level, what its
 * roll may spend, and how many rules that roll returns.
 *
 * ONE CONSEQUENCE IS DELIBERATE AND WORTH KNOWING: shield tower pools no longer
 * climb with the tier (they rode shieldScale). A shield tower grows with the
 * WAVE it rises on instead (shieldTowerWaveScale, ten per cent a wave), and
 * with Overshields if the roll pairs them, which is the same thing the rest
 * of the catalog does.
 */

/** how many rungs the ladder has today — raising it is the whole edit an
 *  eleventh rung needs, because every dial below is arithmetic on the index */
export const RUNG_COUNT = 10;

/**
 * THE RUNGS, and the only place their shape is written down.
 *
 * THERE IS NO `waves` COLUMN. Every rung plays the whole authored script;
 * see the note at the top of this file for why the prefix cuts went.
 *
 * Every dial is arithmetic on the rung's index, which is what makes the
 * ladder extend rather than need re-authoring:
 *
 *   level        index x LEVELS_PER_RUNG        0, 4, 8, ... 36
 *
 * A rung has NO NAME and NO IDENTITY beyond its number: it is shown as
 * "Level n" (rungLabel) in a colour read off its position (rungColor), and
 * that is the whole of what a player is told about it.
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
}[] = Array.from({ length: RUNG_COUNT }, (_, i) => ({
  level: i * LEVELS_PER_RUNG,
  // the two mutation columns are arithmetic on the index like the rest,
  // and both are zero at rung 1: the bottom of the ladder is the campaign
  // as authored (see mutation.ts)
  mutationPoints: mutationBudget(i),
  mutationCount: mutationPicks(i),
}));

/**
 * THE COLOUR OF A RUNG, and the only identity one has beyond its number.
 *
 * Four anchors, evenly spaced across the ladder and interpolated between:
 * the UI palette's green, gold and red — the three the named difficulties
 * used to own outright — and the purple the hidden top tier wore. So a rung
 * label still reads as a sibling of Cleared badges and damage numbers, and
 * the ladder still goes somewhere to look at, without any rung having to be
 * a named thing.
 */
const RUNG_COLORS: readonly [number, number, number][] = [
  [0x7b, 0xe5, 0x8a], // green
  [0xff, 0xd3, 0x7f], // gold
  [0xff, 0x5a, 0x5a], // red
  [0xa0, 0x5a, 0xe5], // purple
];

/**
 * THE ENEMY MIX THE CAMPAIGN SHOULD SEND, as the payout it produces: one
 * item per kill, so the wave script's unit tiers ARE the economy.
 * Normalised to copper = 100, indexed like ITEM_KINDS.
 *
 *   copper  titanium  thorium  plastanium  phase
 *      100        30       24         4.2   0.85
 *
 * ONE ROW, BECAUSE THERE IS ONE RUN. Every rung sends the same fifty waves,
 * so every rung banks the same SHAPE and only the size moves (the drop
 * bonus scales every currency together, and a uniform multiplier cannot
 * change a ratio). This used to be a row per difficulty, back when a
 * difficulty was a prefix cut and a shorter run genuinely had a different
 * mix in it.
 *
 * THIS IS THE DESIGN INPUT, NOT A CONSEQUENCE. The wave script is authored
 * to this and the tech tree's prices are balanced to whatever it pays —
 * never the other way round. An earlier version of this table was derived
 * backwards from Mindustry's turret BUILD COSTS, which was wrong twice
 * over: plastanium and phase are specialty materials there rather than
 * rungs of a tier ladder, and their quantities carry no information about
 * how many tier-4 enemies a wave should hold.
 *
 * READ IT AS WEIGHT, NOT COUNT. The script sends tier-1 bodies by the tens
 * of thousands — T1 is the most numerous thing on the field and the swarm
 * is meant to look like a swarm. A TIER-1 BODY IS NEARLY FREE IN THIS
 * BUDGET: 150 health against a tier-4's 9,000, so ONE T4 weighs as much as
 * sixty daggers. "Send more T1" and "shift the weight upward" are not in
 * tension at all — what actually sets the run's weight is the T3, T4 and T5
 * counts, and nothing else is close.
 *
 * EVERY CURRENCY DROPS FROM RUNG 1 NOW, and that is a real change. Under
 * the prefix cuts phase fabric only appeared in the last dozen waves, so a
 * low difficulty could not pay for a phase-priced turret at all and the
 * price was a hard gate. A full script pays 202 phase at rung 1, so the top
 * of the tech tree is reachable from the bottom of the ladder — slowly. The
 * gate is now the RATE rather than the permission, which is the same trade
 * the roster ceiling made when it was deleted.
 *
 * A run's TOTAL bodies are not its bodies on the field. Units stream in over
 * WAVE_RELEASE_SECONDS and die continuously, so a run that sends 50,000 of
 * them never holds anything like that at once. Do not size the script
 * against the map's area; size it against this row and let the drop zones
 * throttle what they cannot pass.
 *
 * (Surge alloy has no column: it never drops from waves, only from a boss's
 * first kill — see grantRunReward in progress.ts.)
 */
export const TARGET_DROP_RATIO: readonly number[] = [100, 30, 24, 4.2, 0.85];

/** how far off target a currency may drift before check() says so */
export const RATIO_TOLERANCE = 0.4;

/** the last rung there is — index 9, the tenth */
export const TOP_TIER = RUNG_COUNT - 1;

/** every rung index is clamped into the table; there is nothing above it */
const clampTier = (tier: number): number =>
  Math.min(TOP_TIER, Math.max(0, Math.floor(tier)));

/**
 * LOOT PER RUNG, COMPOUNDING: rung n pays x LOOT_PER_RUNG^n on every drop.
 * Rung 10 pays x10.6 what rung 1 does, and it is the whole anti-farm guard.
 *
 * IT HAD TO STOP BEING LINEAR. The old bonus was 1 + 0.3n against health
 * that compounds at 1.06 a level, which is a SHAPE problem rather than a
 * tuning one: a linear payout against a geometric fight hard-stops any
 * ladder somewhere in its twenties, whatever the constants. So the payout
 * compounds too.
 *
 * WHERE 1.30 COMES FROM, and it is now exact arithmetic rather than a
 * measurement. Every rung plays the same fifty waves for the same number of
 * minutes and kills the same bodies, so the only thing that moves between
 * two rungs is the level: the fight gets HP_PER_LEVEL ^ LEVELS_PER_RUNG =
 * x1.2625 harder, both in total health and per second, and the payout gets
 * x1.30 bigger. 1.30 against 1.2625 is a 3% surplus a rung — modestly
 * above, on purpose.
 *
 * THE SURPLUS IS SUPPOSED TO BE SMALL, because the tech tree's own price
 * curve is geometric in points owned (g ** owned, tech.ts) and that is what
 * turns the surplus into TIME. Set this much higher and the ladder walks
 * itself; set it below x1.2625 and every rung is a worse farm than the one
 * under it, which is the failure the linear bonus had. audit() reports the
 * fight's step and the payout's step per rung and check() complains when
 * their ratio drifts — those are the numbers to tune against, never the
 * feel of one run.
 *
 * IT WAS 1.45 WHILE THE RUNGS WERE PREFIX CUTS, because a higher rung was
 * then a LONGER run as well as a harder one and had to out-pay the extra
 * minutes. Same fifty waves at every rung means no extra minutes to pay
 * for, so the number came down to the level step it is measured against.
 *
 * THE TOP RUNG PAYS ITS FULL SHARE. Eradication used to be capped to the
 * bonus of the rung below it — the fight above the top, deliberately not
 * the farm above it. That was a rule for a finite campaign with a hidden
 * ultimate difficulty; on a continuous ladder it just meant the last rung
 * was strictly worse to play than the one before, which is the one thing
 * an ascension ladder must never be.
 */
export const LOOT_PER_RUNG = 1.3;

/** how much harder one rung is than the one below — the level step, and
 *  now the ONLY thing that changes between two rungs */
export const RUNG_HP_STEP = HP_PER_LEVEL ** LEVELS_PER_RUNG;

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

/**
 * THE RUNG DIALS, tunable without a rebuild — the same override pattern as
 * tech.ts knobs: the admin dashboard bends these in module state, the
 * balance document persists what is bent, and everything in the sim and the
 * lints reads through rungKnobsOf so an edit takes effect on the next
 * spawn. The authored values in RUNGS stay the source of truth; once a
 * number is settled it belongs there.
 */
export interface RungKnobs {
  /** enemy level — every unit's hp is x HP_PER_LEVEL^level, nothing else moves */
  level: number;
  /**
   * THE MUTATION PAIR — what this tier's roll may spend, and how many
   * rules it comes back with (see mutation.ts). They are dials here rather
   * than constants there because they are the tier's difficulty, in the
   * same sense enemy level is, and they want tuning by the same afternoon
   * of small edits and re-runs.
   *
   * BOTH ARE ZERO ON THE BOTTOM TIER as authored, which is the whole of
   * what "Level 1 is the campaign as authored" means now. There is no
   * per-world mutation switch any more; a run mutates because the tier it
   * is played at says how much.
   */
  mutationPoints: number;
  /** how many rules the roll returns, 0 to MUT_COUNT_MAX */
  mutationCount: number;
}

const RUNG_KNOB_KEYS = [
  "level",
  "mutationPoints",
  "mutationCount",
] as const;

/**
 * The ceiling a dial may be set to, where it has one. Only the mutator
 * count does: it indexes nothing, but a hand-edited document asking for
 * forty simultaneous rules would deploy a run nobody wrote, and the cap is
 * a design statement (MUT_COUNT_MAX) rather than a UI convenience — so it
 * is enforced on write and on load, not only in the stepper.
 */
const RUNG_KNOB_MAX: Partial<Record<keyof RungKnobs, number>> = {
  mutationCount: MUT_COUNT_MAX,
};

/**
 * Keyed by the rung's ORDINAL as a string — "1" through "10".
 *
 * It used to be the difficulty's NAME, which was the stable identity a
 * saved document had. A rung has no name, and its ordinal is the next most
 * stable thing there is: reordering the table would be a redesign, and a
 * document naming a rung the table no longer has is simply dropped on load
 * (see applyRungOverrides).
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
  };
}

/** the dials as authored — where a Reset returns to */
export function authoredRungKnobs(tier: number): RungKnobs {
  const d = RUNGS[clampTier(tier)];
  return {
    level: d.level,
    mutationPoints: d.mutationPoints,
    mutationCount: d.mutationCount,
  };
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
 *
 * Every reader goes through these rather than through mutationBudget and
 * mutationPicks directly, because those are the AUTHORED curves and these
 * are what the balance document may have bent. The deploy panel, the codex
 * and the run itself must all be reading the same pair, or the panel would
 * promise a roll the run does not play.
 */
export const tierMutationPoints = (tier: number): number =>
  rungKnobsOf(tier).mutationPoints;
export const tierMutationCount = (tier: number): number =>
  rungKnobsOf(tier).mutationCount;

/** drop multiplier of a rung — compounding all the way to the top, the top
 *  rung included (see LOOT_PER_RUNG) */
export const tierDropBonus = (tier: number): number => LOOT_PER_RUNG ** clampTier(tier);

/*
 * THERE IS NO WAVE-CUT ARITHMETIC HERE ANY MORE. tierWaveCount, tierOfWave
 * and topContentTier all answered one question — "how much of the script
 * does this difficulty send, and which difficulty is the first to send
 * wave i" — and every rung now sends all of it, so the answer is `all` and
 * `the first rung` and neither is worth a function. Every wave is playable
 * from rung 1, so no wave can be unreachable and no unit can debut late.
 */

/** one unit's health at an enemy level (armour, speed and drop never move) */
export const unitHpAtLevel = (kind: UnitKind, level: number): number =>
  UNIT_STATS[kind].hp * HP_PER_LEVEL ** Math.max(0, level);

// ---------- expansion ----------

/**
 * The playable spec for one rung: the WHOLE authored script, carrying the
 * enemy level the sim scales health by.
 *
 * The script is passed through untouched — this used to slice it to the
 * difficulty's cut, and that slice is the thing the ten-rung ladder
 * removed. All a rung does now is name a level.
 */
export function specForTier(spec: LevelSpec, tier: number): LevelSpec {
  const n = clampTier(tier);
  return { ...spec, tier: n, enemyLevel: tierLevel(n) };
}

// ---------- strength ----------

/**
 * STRENGTH IS PRINTED HEALTH. That is the whole measure, and it is
 * weapon-agnostic on purpose.
 *
 * The tempting alternative is to price a unit against one turret — armour
 * is flat, so a fortress (armour 9) soaks 9 / max(9 - 9, 0.9) = ten times
 * its printed health from a duo line. But the player never fields one
 * turret. Splash, pierce and burning all route around armour, a duo line
 * with enough waves of runway stalls anything, and the mix changes at every
 * rung — so any single-turret denominator says more about the
 * denominator than about the wave.
 *
 * Mindustry settles this the same way. `RtsAI` sums raw `unit.health` to
 * weigh a squad, `WaveGraph` plots counts/totals/health, and `Waves.generate`
 * controls heavy units by COUNT (`unitAmount = 6 / tier`, `max = 13`) rather
 * than by pricing their armour. Armour never enters a strength number
 * anywhere in that codebase; it lives only in the damage path.
 *
 * So armour rides along here as COMPOSITION — a share, reported next to the
 * health, never multiplied into it. An armour-heavy wave is a different
 * fight at the same strength, and that is a thing an author wants to see
 * rather than have folded into one number.
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
  /** share of health carried by units with a shield ability — ehp the hp
   *  column cannot see, and Overshields multiplies it on top */
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

/**
 * THE FREE OPENING LOADOUT — a hand-tuned constant, and deliberately not a
 * number derived from the opening waves.
 *
 * It exists to solve a bootstrap, not to clear a run. Kills are the only
 * income and zero turrets kill nothing, so a fresh save needs enough to
 * hold WAVE ONE; from there rung 1 pays for itself several times over
 * while it is still being played. Duo starts at 8 copper on a near-flat
 * 1.01 curve, so the fleet grows with the bank almost in a straight line —
 * rung 1's own kills bank some 12,500 copper, roughly 240 more duos
 * through that curve, and cross the granted fleet early in the run.
 *
 * That is why there is no arithmetic here and no check on this number. A
 * static-fleet model would be measuring a fleet that stops existing thirty
 * seconds into the run. Tune it by feel: too low and wave 1 wipes a fresh
 * save with no way to earn out, too high and the opening asks nothing.
 */
export const OPENING_DUOS = 100;

/**
 * HOW MUCH OF THE RUN A FRESH SAVE HAS TO HOLD ON ITS OWN — the stretch the
 * opening loadout is measured against, and the only place debutViolations
 * looks.
 *
 * IT IS NOT A CUT. Every rung sends all fifty waves and always will; this
 * is a number about the PLAYER, not about the script. A save banks nothing
 * until a run ends, so its first run is fought entirely on the free duos —
 * and twenty waves is how far those were tuned to carry it, which is what
 * this used to be the wave count of (the old Incursion). Past here a fresh
 * save is expected to be overrun, bank what it killed, and come back with a
 * fleet: that is the loop, not a failure of the script.
 */
export const OPENING_WAVES = 20;

/**
 * WHICH MAP OPENS WHICH — the campaign's one piece of structure above the
 * ladders, and the only thing a map's own progress cannot buy.
 *
 * Each map is climbed separately and keeps its own ladder, so nothing else
 * crosses between them. This does: a map named here stays shut until the
 * named TIER has fallen on the named map. Confluence teaches the game, so
 * Maelstrom asks that the game has been picked up at all before it opens —
 * one clear of Confluence's first level, and no more.
 *
 * IT IS A HANDSHAKE, NOT A CLIMB. This asked for the middle of the ladder
 * once, on the argument that Maelstrom assumes Confluence has been taught.
 * The cost of being right about that is a second map nobody sees: every
 * tier sends all fifty waves, so a player who wants a different map is
 * being asked to finish most of this one first. Level 1 is the smallest
 * gate that still means the player has actually played — it proves the
 * opening waves can be held (see OPENING_WAVES) — and the difficulty
 * stepper is where the rest of the challenge lives anyway.
 *
 * A map absent from this table is open from the first run, which is every
 * map but the ones written here.
 */
export const WORLD_REQUIRES: Readonly<Record<string, { world: string; tier: number }>> = {
  // Maelstrom opens once Confluence's level 1 has fallen
  "2": { world: "1", tier: 0 },
};

/*
 * THE OPENING IS DUOS AND NOTHING ELSE. Five free arcs used to sit beside
 * them as a taste of area fire before the tech tree had been paid for.
 * They are gone: the opening bar should hold exactly what the campaign's
 * first purchase is measured against, and a second turret in it makes the
 * first buy a comparison rather than a discovery. Arc is now bought like
 * everything else.
 */

// ---------- the debut rule ----------

/**
 * Is every currency in this node's price actually dropped by the campaign?
 * That is the whole unlock rule now — the tech tree carries no ladder
 * gates, so a node is reachable exactly when the waves pay for it (see the
 * note at the top of tech.ts).
 *
 * IT NO LONGER TAKES A RUNG. Every rung sends the whole script and so pays
 * every currency; what a low rung lacks is the RATE, not the permission
 * (see TARGET_DROP_RATIO). So this is a question about the tree and the
 * script, and the answer is the same everywhere on the ladder.
 */
function payable(node: TechNodeDef): boolean {
  return costEntries(node.price.base).every(
    ({ item }) => (TARGET_DROP_RATIO[ITEM_KINDS.indexOf(item)] ?? 0) > 0,
  );
}

/**
 * THE BEST PER-SHOT DAMAGE A FRESH SAVE CAN BRING TO A DEBUT — and it is
 * the duo's, full stop.
 *
 * Every unit in the script now debuts on RUNG 1 (there are no prefix cuts
 * left to hold one back), and rung 1 is the run a save with nothing banked
 * plays: kills are the only income, so it owns the free duos and literally
 * nothing else however many turrets are technically ungated. So the debut
 * lint measures against the duo and the walk over TECH_TREE that used to
 * find a richer rung's best bullet has nothing left to find.
 *
 * `payable` above is what the walk used, and it is kept because it is still
 * the honest statement of the unlock rule (see the note at the top of
 * tech.ts) — it is asserted once, here, so a node priced in a currency the
 * script never drops is caught rather than silently unbuyable.
 */
function openingShot(): number {
  return TOWERS.duo.bullet.damage;
}

/** every turret the campaign's own drops can pay for — the whole roster,
 *  and a lint on that being true rather than a filter that does work */
export function unpayableNodes(): string[] {
  return TECH_TREE.filter((n) => isTowerNode(n.id) && !payable(n)).map((n) => String(n.id));
}

/**
 * Units whose armour meets nothing that can efficiently hurt it, WHERE THAT
 * ACTUALLY DECIDES ANYTHING — inside the opening stretch (OPENING_WAVES).
 *
 * This is a NOTE, not a gate. Nothing is ever unkillable — the 10% floor
 * means a duo always lands 0.9 — so a heavily armoured debut costs more
 * farming, which is a legitimate thing for a script to ask for. What it
 * reports is the size of that ask, so an author choosing it is choosing it.
 *
 * IT USED TO ASK WHICH DIFFICULTY A UNIT DEBUTED ON and price it against
 * the best turret that difficulty's drops could buy. Both halves of that
 * are gone: every kind debuts on rung 1 now (no cuts), and rung 1 is the
 * run a save with nothing banked plays, so the answer would be "the duo"
 * for all thirteen armoured kinds in the script and the report would be
 * thirteen restatements of one fact. WHAT STILL VARIES IS DEPTH. A fortress
 * on wave 10 is an ask; the disrupt on wave 50 is the finale doing its job,
 * and a fresh save is expected to die to it and bank the run. So the lint
 * looks only where the free duos really are the whole answer.
 */
export function debutViolations(spec: LevelSpec = WORLD): LadderIssue[] {
  // WHICH WAVE a kind first appears on, not which rung — every rung sends
  // every wave, so the rung is always the first one and the number an
  // author actually wants is how deep into the run the debut sits
  const debut = new Map<UnitKind, number>();
  spec.script.forEach((step, i) => {
    for (const g of waveGroups(step.wave))
      g.counts.forEach((count, k) => {
        if (count <= 0) return;
        const kind = UNIT_KINDS[k];
        debut.set(kind, Math.min(debut.get(kind) ?? Infinity, i));
      });
  });

  const shot = openingShot();
  const bad: LadderIssue[] = [];
  for (const [kind, wave] of debut) {
    if (wave >= OPENING_WAVES) continue;
    // the armour a tower actually meets — the PRINTED value, which is what
    // an unmutated run spawns with. Armored Swarms plates the light bodies
    // on top of this, and is deliberately not priced in here: the lint is
    // about the script an author wrote, and a rolled rule is not the
    // script's doing (see mutation.ts)
    const armor = UNIT_STATS[kind].armor;
    const tax = shot / Math.max(shot - armor, 0.1 * shot);
    if (tax >= 2)
      bad.push({
        tier: 0,
        kind: "debut",
        message: `${kind} (armour ${armor}) debuts on wave ${wave + 1} against an opening shot of ${shot} — it costs a fresh save's fleet ${tax.toFixed(1)}x its printed health, so budget the farming for it`,
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
  kind: "debut" | "grind" | "economy";
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
  /** one item per kill, by unit tier: what the wave pays */
  drops: Cost;
}

export function waveCost(step: LevelStep, level = 0): WaveCost {
  const out: WaveCost = {
    units: 0,
    hp: 0,
    t3Share: 0,
    armourShare: 0,
    airShare: 0,
    drops: {},
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
      // local triple is what lets a tier-4 unit be a stats edit instead of
      // an economy edit, and it is also where a boss pays nothing: the
      // audit must count the same drops the run actually banks
      for (const { item, amount } of costEntries(unitDrop(kind)))
        out.drops[item] = (out.drops[item] ?? 0) + amount * count;
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
 * `share` is the wave's slice of the rung it belongs to, which is the
 * number to author against: a wave carrying 5% of its rung is filler,
 * one carrying 25% is a spike, and a rung's LAST wave should be its
 * heaviest or the run tails off into its finale.
 */
export interface WaveRow {
  /** 1-based wave number, as the editor shows it */
  wave: number;
  units: number;
  /** printed health at enemy level 0 — the authored weight */
  hp: number;
  /**
   * This wave's share of the whole run's health.
   *
   * It used to depend on which difficulty you were looking at, because the
   * same wave was a different fraction of a 20-wave run and a 50-wave one.
   * Every rung plays all fifty now, and the enemy level is a uniform
   * multiplier that cancels out of a share, so there is one answer.
   */
  share: number;
  /**
   * Health relative to the wave before it. Not rendered — consecutive waves
   * alternate archetype, so this swings from 0.35x to 4x on a script that is
   * pacing itself perfectly well, and it read as noise next to `share`.
   * Kept for `window.__ladder.waves()`.
   */
  step: number;
  armourShare: number;
  airShare: number;
  t3Share: number;
}

/**
 * The per-wave guide, at the authored baseline level — one row a wave, and
 * the same rows whichever rung is being played.
 *
 * It used to take the rung to measure shares against. It does not need one:
 * every rung sends every wave, and the enemy level is a uniform multiplier
 * that cancels out of a share.
 */
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
    };
    prev = c.hp;
    return row;
  });
}

/** one rung, weighed — the row the editor's ladder check renders */
export interface AuditRow {
  tier: number;
  /** the 1-based ordinal — the rung's whole identity */
  rung: number;
  /** what the player is shown, "Level n" */
  label: string;
  units: number;
  /** enemy level the rung plays at */
  level: number;
  /** printed health of the whole run — THE strength number */
  hp: number;
  /** how much harder than the rung below */
  step: number;
  /** health per second the fleet has to keep up with */
  hpPerSecond: number;
  /** seconds the run lasts */
  duration: number;
  t3Share: number;
  armourShare: number;
  /** share of health carried by shield-ability units, whose pools are
   *  multiplied again if the run is played under Overshields */
  shieldShare: number;
  /** the multiplier this rung puts on every drop — LOOT_PER_RUNG^tier */
  lootBonus: number;
  /**
   * What a full clear actually banks, per currency, INCLUDING this rung's
   * drop bonus. One item per kill, so this is just the enemy mix priced out
   * — which is why the wave script is the only thing that sets the economy.
   */
  drops: Cost;
  /**
   * The same thing as a shape: normalised to the base item (copper) = 100,
   * indexed like ITEM_KINDS. The drop BONUS cannot move this — it scales
   * every currency together — so the ratio is decided purely by how many
   * T1/T2/T3 bodies the waves send.
   *
   * WHAT TO AIM AT: TARGET_DROP_RATIO, above — the enemy mix this rung is
   * supposed to send. check() reports any currency that has drifted more
   * than RATIO_TOLERANCE off it.
   */
  dropRatio: number[];
  /**
   * ITEMS BANKED PER MINUTE at this rung, bonus included — every currency
   * counted the same, because what this measures is the RATE the ladder
   * pays at and not what the bundle is worth.
   */
  incomePerMinute: number;
  /**
   * How much better this rung pays per minute than the one below. 1 means
   * the two are the same farm.
   */
  farmStep: number;
  /**
   * How much harder this rung hits per second than the one below —
   * hpPerSecond over the rung below's. This is what the fleet has to answer
   * and what the payout has to keep up with.
   *
   * It equals `step` exactly, because every rung runs for the same number
   * of minutes. They were different numbers when a rung was also a longer
   * run; both are kept because they answer different questions and one of
   * them will stop being the other again the moment a rung changes anything
   * but the level.
   */
  climbStep: number;
  /**
   * THE ONE NUMBER TO TUNE THE LADDER AGAINST: climbStep / farmStep.
   *
   * How many more minutes of farming this rung costs than the last one did,
   * before the tech tree's own price curve is counted. 1.0 is a ladder whose
   * rungs each take the same wall-clock to reach; above 1.0 each rung takes
   * longer than the last, which is the idle-game shape and is where this is
   * meant to sit — just above 1, with the geometric price curve (g ** owned
   * in tech.ts) supplying the rest of the climb. Below 1 the rung is CHEAPER
   * to reach than the one under it, which reads as the ladder collapsing.
   *
   * 1 for the first rung, which has nothing below it to be a step from.
   */
  grindStep: number;
}

/**
 * WALK THE LADDER AND REPORT WHAT EACH RUNG ASKS FOR.
 *
 * THREE COMPOUNDING CURVES MEET HERE and none of them can be tuned by feel:
 * enemy health (HP_PER_LEVEL ^ level), the payout (LOOT_PER_RUNG ^ rung),
 * and the tech tree's price ladder (growth ^ owned, tech.ts). This function
 * is where the first two are put side by side.
 *
 * EVERY ROW SENDS THE SAME FIFTY WAVES, so the only column that moves
 * between two rows is the enemy level: `step` and `climbStep` are both
 * RUNG_HP_STEP exactly, `farmStep` is LOOT_PER_RUNG exactly, and the units,
 * duration and drop ratio are identical all the way down. That is not a bug
 * in the report — it is the ladder saying what it is, and it makes the one
 * interesting column `grindStep`, the ratio between the two.
 *
 * What the fleet has to answer is `climbStep` — health per SECOND against
 * the rung below — and what pays for answering it is `farmStep`, income per
 * minute against the rung below. Their ratio is `grindStep`, and that is
 * the ladder's real shape.
 *
 * Two things that do NOT come out in the wash:
 *
 * HEALTH PER BODY is difficulty that pays nothing back. A kill drops one
 * item whatever it killed, so 100 spirocts cost fifteen times what 100
 * daggers cost and pay the same hundred items in a different currency.
 * Padding a wave with tier-1 bodies is close to free.
 *
 * THE CURRENCY MIX has to stay near what the tree charges, or one currency
 * becomes the only real constraint while the others pile up unspent.
 */
export function audit(spec: LevelSpec = WORLD): AuditRow[] {
  const rows: AuditRow[] = [];
  let prev: AuditRow | null = null;
  for (let tier = 0; tier <= TOP_TIER; tier++) {
    const run = specForTier(spec, tier);
    const level = run.enemyLevel ?? 0;
    const b = budget(spec, tier);
    const drops: Cost = {};
    for (const step of run.script)
      for (const { item, amount } of costEntries(waveCost(step, level).drops))
        drops[item] = (drops[item] ?? 0) + amount;
    // the bonus is what the player actually receives, so the payout column
    // shows it; the ratio below is computed before it, though both give the
    // same answer — a uniform multiplier cannot change a ratio
    const bonus = tierDropBonus(tier);
    const paid: Cost = {};
    let items = 0;
    for (const { item, amount } of costEntries(drops)) {
      paid[item] = Math.round(amount * bonus);
      items += amount * bonus;
    }
    const s = Math.max(1, drops[BASE_ITEM] ?? 0);
    const perMinute = items / Math.max(1e-6, b.duration / 60);
    const farmStep = prev ? perMinute / Math.max(1e-6, prev.incomePerMinute) : 1;
    const climbStep = prev ? b.hpPerSecond / Math.max(1e-6, prev.hpPerSecond) : 1;
    const row: AuditRow = {
      tier,
      rung: rungOf(tier),
      label: rungLabel(tier),
      units: b.units,
      level,
      hp: Math.round(b.hp),
      step: prev ? +(b.hp / prev.hp).toFixed(2) : 1,
      hpPerSecond: Math.round(b.hpPerSecond),
      duration: Math.round(b.duration),
      t3Share: +b.t3Share.toFixed(2),
      armourShare: +b.armourShare.toFixed(2),
      shieldShare: +b.shieldShare.toFixed(2),
      lootBonus: +bonus.toFixed(2),
      drops: paid,
      dropRatio: ITEM_KINDS.map((k) =>
        k === BASE_ITEM ? 100 : Math.round((1000 * (drops[k] ?? 0)) / s) / 10,
      ),
      incomePerMinute: Math.round(perMinute),
      farmStep: +farmStep.toFixed(2),
      climbStep: +climbStep.toFixed(2),
      grindStep: +(climbStep / Math.max(1e-6, farmStep)).toFixed(2),
    };
    rows.push(row);
    prev = row;
  }
  return rows;
}

/**
 * The authoring smell test, as a list of complaints. Empty means the script
 * is in line. Run it after editing waves — `window.__ladder.check()`.
 */
export function check(spec: LevelSpec = WORLD): LadderIssue[] {
  const out = debutViolations(spec);
  const rows = audit(spec);

  // A NODE THE CAMPAIGN CANNOT PAY FOR AT ALL is the one remaining way the
  // tree and the script can disagree, now that no rung withholds a currency
  // (see TARGET_DROP_RATIO). It is a price authored in something the waves
  // never drop, which reads to a player as a node that is simply broken.
  for (const id of unpayableNodes())
    out.push({
      tier: null,
      kind: "economy",
      message: `${id} is priced in a currency the waves never drop, so nothing can ever buy it`,
    });

  // THE CURRENCY MIX, ONCE. Every rung sends the same fifty waves, so the
  // ratio is a fact about the SCRIPT rather than about any rung — reading
  // it off rung 1 and reporting it without a rung is the honest shape.
  // Named off ITEM_KINDS rather than written out, so adding a tier-6 unit
  // extends this check for free instead of leaving a currency unwatched.
  const name = (i: number): string => ITEM_INFO[ITEM_KINDS[i]].name.toLowerCase();
  TARGET_DROP_RATIO.forEach((target, i) => {
    // copper is the denominator
    if (i === 0 || target <= 0) return;
    const got = rows[0]?.dropRatio[i] ?? 0;
    const drift = got / target;
    if (drift < 1 - RATIO_TOLERANCE || drift > 1 + RATIO_TOLERANCE)
      out.push({
        tier: null,
        kind: "economy",
        message: `the script pays ${name(i)} at 100:${got}, ${drift < 1 ? "under" : "over"} the 100:${target} it is authored to — ${drift.toFixed(2)}x target`,
      });
  });

  // NOTE: there is deliberately no check on the opening loadout. See
  // OPENING_DUOS — that number is tuned by feel, not by arithmetic.
  //
  // NOR IS THERE A WALL OR FILLER LINT ANY MORE. Both measured the health
  // STEP between two difficulties, which was worth watching when a step was
  // "ten levels times whatever fifteen new waves weigh" and an author could
  // move it by editing a wave. A step is now exactly RUNG_HP_STEP, the same
  // between every pair of rungs, and no edit to the script can change it —
  // there is nothing left for those lints to catch.

  rows.forEach((r, i) => {
    const prev = rows[i - 1];
    // THE LADDER'S OWN SHAPE, and the reason this lint exists at all: a
    // rung has to pay for itself. grindStep is health-per-second growth
    // over income-per-minute growth, so above GRIND_STEP the rung costs
    // materially more farming than the last one did, and below SLIDE_STEP
    // it costs materially less — a ladder that gets easier as it climbs,
    // which collapses into "always jump to the top".
    //
    // It is NOT a feasibility test. Every run banks something and every
    // turret is buyable at every rung, so a player can always farm the rung
    // below until they can afford the next one; what this measures is
    // GRIND, which is the failure mode an idle game actually has.
    if (prev && r.grindStep > GRIND_STEP)
      out.push({
        tier: r.tier,
        kind: "grind",
        message: `hits ${r.climbStep}x harder per second but only pays ${r.farmStep}x more per minute — ${r.grindStep}x the farming of the rung below, past the ${GRIND_STEP}x this ladder is tuned to`,
      });
    if (prev && r.grindStep < SLIDE_STEP)
      out.push({
        tier: r.tier,
        kind: "grind",
        message: `pays ${r.farmStep}x more per minute against only ${r.climbStep}x the fight — at ${r.grindStep}x the farming of the rung below it is cheaper to reach than the rung under it`,
      });
  });
  return out;
}

/**
 * THE LADDER AS ONE TABLE OF TEXT — `window.__ladder.grind()`.
 *
 * The three curves side by side, one line a rung, because the interaction
 * between them is the thing that cannot be seen from any single constant.
 * Read the last column: it is how many more minutes each rung costs than
 * the one below it, and a healthy ladder holds it just above 1.
 */
export function grindTable(spec: LevelSpec = WORLD): string {
  const head = "rung  lvl         hp      hp/s    loot   items/min   climb   farm   grind";
  const rows = audit(spec).map(
    (r) =>
      `${String(r.rung).padStart(4)}  ${String(r.level).padStart(3)}  ${(r.hp / 1e6).toFixed(2)}M`.padEnd(
        22,
      ) +
      `${String(r.hpPerSecond).padStart(9)}  ${("x" + r.lootBonus.toFixed(2)).padStart(6)}  ${String(
        r.incomePerMinute,
      ).padStart(10)}  ${r.climbStep.toFixed(2).padStart(6)}  ${r.farmStep
        .toFixed(2)
        .padStart(5)}  ${r.grindStep.toFixed(2).padStart(6)}`,
  );
  return [head, ...rows].join("\n");
}

/**
 * The most extra farming one rung may cost over the last before check()
 * calls it a grind — see AuditRow.grindStep. The authored ladder sits flat
 * at RUNG_HP_STEP / LOOT_PER_RUNG = 0.97 on every rung, so this is real
 * headroom rather than a number the table only just clears.
 *
 * WALL_STEP and FILLER_STEP used to live here, both measuring the health
 * step between two difficulties. That step is now RUNG_HP_STEP and nothing
 * an author can type will move it, so both are gone.
 */
export const GRIND_STEP = 1.3;
/** ...and the least, before a rung is cheaper to reach than the one below */
export const SLIDE_STEP = 0.75;
