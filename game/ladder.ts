import {
  UNIT_KINDS,
  UNIT_STATS,
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
  BASE_ITEM,
  costEntries,
  ITEM_INFO,
  ITEM_KINDS,
  itemForTier,
  type Cost,
} from "./items";

/**
 * THE LADDER — three difficulties, and then the campaign is over.
 *
 * A world ships ONE authored script. A difficulty is a CUT of that script
 * plus an enemy level, and nothing else:
 *
 *   Incursion   waves 1-20   enemy level  0
 *   Onslaught   waves 1-35   enemy level 10
 *   Nemesis     waves 1-50   enemy level 20
 *
 * Nemesis plays the whole authored script, so the ladder ends where the
 * writing does. A hidden ERADICATION difficulty above it is planned and is
 * NOT modelled here — nothing below should assume it exists.
 *
 * Nothing is generated. Wave 1 of Nemesis is wave 1 of the same authored
 * list Incursion plays, with 20 levels on it — which is what lets the level
 * editor be the whole authoring surface.
 *
 * THE LADDER IS FINITE AND THAT IS THE POINT. There is no endless level
 * counter above the top: clearing Nemesis finishes the campaign. A player
 * who stalls farms a lower difficulty until the bank covers the next one,
 * and there are only ever TWO of those gaps to cross, so each one has to be
 * worth crossing — see the step numbers in audit().
 */

/**
 * Mindustry's own per-level health curve. 1.06^12 = 2.01, so twelve levels
 * is exactly double health, and NOTHING else scales: armour, speed, hitbox
 * and drop all stay at their base values forever.
 *
 * Flat armour against level-scaled health is what keeps the difficulties
 * distinct rather than merely long. A difficulty is a level offset on this
 * same curve, so a level-20 dagger outlives a level-0 mace and still has a
 * dagger's armour, while the level-20 fortress is still the thing chip
 * damage cannot scratch.
 */
export const HP_PER_LEVEL = 1.06;

/**
 * Enemy levels added per difficulty — 10 levels is x1.79 health per body.
 *
 * This is the half of a difficulty that makes the SAME waves harder. The
 * other half is the wave cut below, which makes the run longer. Both move
 * together on purpose: without the levels, the top difficulty would be a
 * longer opening against identical enemies, because the authored script has
 * already fielded every kind it uses by wave 20. (It does not use every
 * kind that EXISTS — see the note over WORLDS in levels.ts.)
 */
export const LEVELS_PER_TIER = 10;

/**
 * THE DIFFICULTIES, and the only place their shape is written down.
 *
 * `waves` is how much of the authored script it plays, `level` the enemy
 * level it plays at, and `name` and `color` the only things the player is
 * ever shown — everything else on this page is arithmetic over this table.
 *
 * THEY ARE NAMED, NOT NUMBERED, and the names are this game's own:
 *
 *   Incursion  <  Onslaught  <  NEMESIS  <  eradication
 *
 * The campaign runs the three tiers ending at Nemesis. ERADICATION is
 * reserved for the hidden ultimate difficulty and is deliberately not in
 * the table yet — a name in hand for what sits past the visible top.
 *
 * The names escalate from a probe to a personified doom on purpose: the
 * bottom tier never calls itself easy (it is an attack, just a small one),
 * and the visible top is a noun — a thing that comes for you — rather than
 * an adjective on a dial. A player who clears Nemesis can still see there
 * is something above it.
 *
 * `color` is the difficulty's identity everywhere one is shown: Incursion
 * green, Onslaught yellow, Nemesis red — and Eradication, when it lands,
 * dark purple (#A05AE5). The values are the UI palette's existing green /
 * gold / red so difficulty labels read as siblings of Cleared badges and
 * damage numbers rather than a scheme of their own.
 *
 * The wave counts are 20/35/50 rather than something evener because
 * Incursion has to be a whole arc on its own — a fresh save's entire
 * experience of the game until it clears it.
 *
 * `shieldScale` multiplies every shield ability's pool, cap and regen (see
 * Sim.updateAbilities), and it is a hand-tuned constant per difficulty
 * rather than a curve, because shields answer a different question than
 * health. A body's health is priced against the enemy budget, so it rides
 * the level curve; a shield is measured in SECONDS OF ABSORBED TOWER FIRE,
 * so it has to track the player's firepower — and that moves by the ~6x
 * difficulty steps documented over TARGET_DROP_RATIO, not by x1.79. Left
 * flat, a quasar's 500-point bubble that buys real cover at Incursion pops to
 * incidental fire at Onslaught. Only the enemy's own shields scale; nothing on
 * the player's side reads this.
 *
 * `groundArmorBonus` / `airArmorBonus` are added FLAT to every walker's /
 * flyer's armour at spawn (Sim reads them once, into uarmor). Armour is a
 * flat shave floored at a tenth of the raw hit (Sim.applyArmor), so these
 * knobs are regressive by calibre on purpose: +3 barely dents a salvo's 28
 * or a lancer's 140, but takes a third off a duo's 9 — they make the swarm
 * outlast CHIP without inflating it against the big guns. The two sides
 * are split because their counters live on different scales: the ground
 * roster is answered by real calibre, while the anti-air line is built on
 * small pellets — a scatter shot is 3 damage, so even +1 of air armour
 * halves the game's first AA and +3 floors it outright. Raise the air knob
 * in ones, not threes. Two more cautions, both sides: the lancer counts
 * armour QUADRUPLE (armorMultiplier 4), so every +1 is -4 to the turret
 * that is supposed to answer T3/T4; and burning pierces armour entirely,
 * so it buys nothing against scorch's afterburn. checkDebuts prices the
 * bonus into its debut-tax lint.
 */
export const DIFFICULTIES: readonly {
  name: string;
  color: string;
  waves: number;
  level: number;
  shieldScale: number;
  groundArmorBonus: number;
  airArmorBonus: number;
}[] = [
  // prettier-ignore
  { name: "Incursion", color: "#7BE58A", waves: 20, level: 0, shieldScale: 1, groundArmorBonus: 0, airArmorBonus: 0 },
  // prettier-ignore
  { name: "Onslaught", color: "#FFD37F", waves: 35, level: 10, shieldScale: 5, groundArmorBonus: 0, airArmorBonus: 0 },
  // prettier-ignore
  { name: "Nemesis", color: "#FF5A5A", waves: 50, level: 20, shieldScale: 20, groundArmorBonus: 0, airArmorBonus: 0 },
  // ERADICATION (dark purple, #A05AE5) is deliberately not here yet — the
  // hidden ultimate difficulty, named and colored before it exists
];

/**
 * THE ENEMY MIX EACH DIFFICULTY SHOULD SEND, as the payout it produces:
 * one item per kill, so a wave script's unit tiers ARE the economy. Indexed
 * like DIFFICULTIES then like ITEM_KINDS, normalised to copper = 100.
 *
 *   difficulty   copper  titanium  thorium  plastanium  phase
 *   Incursion      100      15       3.6        0         0
 *   Onslaught      100      24.5    12.2        0.8       0
 *   Nemesis        100      30      24          4.2       0.85
 *
 * THIS IS THE DESIGN INPUT, NOT A CONSEQUENCE. The wave script is authored
 * to this and the tech tree's prices are balanced to whatever it pays —
 * never the other way round. An earlier version of this table was derived
 * backwards from Mindustry's turret BUILD COSTS, which was wrong twice
 * over: plastanium and phase are specialty materials there rather than
 * rungs of a tier ladder, and their quantities carry no information about
 * how many tier-4 enemies a wave should hold.
 *
 * READ THESE ROWS AS WEIGHT, NOT COUNT. Every difficulty above Incursion still
 * sends tier-1 bodies by the tens of thousands — T1 stays the most numerous
 * thing on the field, and the swarm is meant to look like a swarm. What
 * moves is what the swarm is CARRYING:
 *
 *   difficulty     T1    T2    T3    T4    T5
 *   Incursion      55%   32%   14%    -     -
 *   Onslaught      30%   28%   25%   17%    -
 *   Nemesis        12%   14%   20%   35%   19%
 *
 * A TIER-1 BODY IS NEARLY FREE IN THIS BUDGET and that is the key to reading
 * the table: 118 health against a tier-4's 8,100, so ONE T4 weighs as much
 * as sixty-nine daggers. Twelve thousand extra daggers at Onslaught cost less
 * health than two hundred scepters. So "send more T1" and "shift the weight
 * upward" are not in tension at all — the thing that actually sets the size
 * of the step between difficulties is the T3, T4 and T5 counts, and nothing
 * else is close.
 *
 * A run's TOTAL bodies are not its bodies on the field. Units stream in over
 * WAVE_RELEASE_SECONDS and die continuously, so a difficulty that sends
 * 52,000 of them never holds anything like that at once. Do not size a
 * difficulty against the map's area; size it against these rows and let the
 * drop zones throttle what they cannot pass.
 *
 * TIER 5 DOES NOT EXIST BEFORE NEMESIS, deliberately, and it breaks the old
 * rule that every currency debuts one difficulty before anything charges for
 * it. Phase fabric now debuts and is spent at the same difficulty. That is
 * the point: spectre, meltdown and foreshadow are priced in phase, so a
 * player cannot own the last three turrets until they have actually played
 * Nemesis. Nothing walls them in — difficulties unlock by clearing the one
 * below, never by tech — so Nemesis opens on schedule and those three are
 * the reward for engaging with it rather than a prerequisite.
 *
 * The steps these rows produce are 6.4x Incursion -> Onslaught and 6.0x Onslaught ->
 * Nemesis, against a WALL_STEP guideline of 4.5. That is a deliberate, known
 * overshoot: holding 4.5 forces Onslaught back onto almost exactly Incursion's own
 * ratio, and the campaign stops going anywhere. See audit().
 */
export const TARGET_DROP_RATIO: readonly (readonly number[])[] = [
  [100, 15, 3.6, 0, 0],
  [100, 24.5, 12.2, 0.8, 0],
  [100, 30, 24, 4.2, 0.85],
];

/** how far off target a currency may drift before check() says so */
export const RATIO_TOLERANCE = 0.4;

/** the last difficulty there is — clearing it finishes the campaign */
export const TOP_TIER = DIFFICULTIES.length - 1;

/** every tier index is clamped into the table; there is nothing above it */
const clampTier = (tier: number): number =>
  Math.min(TOP_TIER, Math.max(0, Math.floor(tier)));

/**
 * Drop bonus per difficulty, applied LINEARLY: difficulty n pays x(1 + 0.3n).
 *
 * Steeper than it was under the old endless ladder, because there are only
 * two steps left to sell. Turret prices are flat (see tech.ts), so the
 * units you kill already pay for the damage needed to kill them and the
 * ladder walks with no bonus at all; the bonus exists only so a HIGHER
 * difficulty is the better farm. Without it every difficulty pays the same
 * per minute and the correct play is to grind difficulty 1 forever.
 */
export const DROP_BONUS_PER_TIER = 0.3;

/**
 * WHAT THE PLAYER IS SHOWN. Tier 0 is Incursion.
 *
 * `tier` is 0-based everywhere in the code and in window.__ladder, because
 * tier 0 indexes DIFFICULTIES and an offset there would put a +1 in the
 * middle of the arithmetic. Nothing player-facing should ever print that
 * index — use the name. Every label goes through here, so the internal
 * index and the shown word meet in exactly one place.
 */
export const difficultyName = (tier: number): string => DIFFICULTIES[clampTier(tier)].name;

/**
 * The difficulty's color, wherever its name is shown — green, yellow, red
 * up the ladder (see the note over DIFFICULTIES). Same clamping as the
 * name, so a name and its color can never disagree.
 */
export const difficultyColor = (tier: number): string => DIFFICULTIES[clampTier(tier)].color;

/**
 * The 1-based ordinal, for the places a NUMBER is genuinely wanted — the
 * editor's per-wave badge, an axis label, a sort key. Prefer the name
 * anywhere a player reads prose.
 */
export const difficultyOf = (tier: number): number => clampTier(tier) + 1;

/** enemy level of a difficulty */
export const tierLevel = (tier: number): number => DIFFICULTIES[clampTier(tier)].level;

/** health multiplier of a difficulty */
export const tierHpScale = (tier: number): number => HP_PER_LEVEL ** tierLevel(tier);

/**
 * THE DIFFICULTY DIALS, tunable without a rebuild — the same override
 * pattern as tech.ts knobs: the admin dashboard bends these in module
 * state, the balance document persists what is bent, and everything in
 * the sim and the lints reads through difficultyKnobsOf so an edit takes
 * effect on the next spawn. The authored values in DIFFICULTIES stay the
 * source of truth; once a number is settled it belongs there.
 */
export interface DifficultyKnobs {
  shieldScale: number;
  groundArmorBonus: number;
  airArmorBonus: number;
}

const DIFFICULTY_KNOB_KEYS = ["shieldScale", "groundArmorBonus", "airArmorBonus"] as const;

/** keyed by difficulty NAME — the stable identity a saved document uses */
const difficultyOverrides = new Map<string, Partial<DifficultyKnobs>>();

/** every dial in force for a difficulty — authored unless overridden */
export function difficultyKnobsOf(tier: number): DifficultyKnobs {
  const d = DIFFICULTIES[clampTier(tier)];
  const o = difficultyOverrides.get(d.name) ?? {};
  return {
    shieldScale: o.shieldScale ?? d.shieldScale,
    groundArmorBonus: o.groundArmorBonus ?? d.groundArmorBonus,
    airArmorBonus: o.airArmorBonus ?? d.airArmorBonus,
  };
}

/** the dials as authored — where a Reset returns to */
export function authoredDifficultyKnobs(tier: number): DifficultyKnobs {
  const d = DIFFICULTIES[clampTier(tier)];
  return {
    shieldScale: d.shieldScale,
    groundArmorBonus: d.groundArmorBonus,
    airArmorBonus: d.airArmorBonus,
  };
}

/** point one dial somewhere else; undefined restores the authored value */
export function setDifficultyKnob(
  tier: number,
  knob: keyof DifficultyKnobs,
  value: number | undefined,
): void {
  const name = DIFFICULTIES[clampTier(tier)].name;
  const o: Partial<DifficultyKnobs> = { ...(difficultyOverrides.get(name) ?? {}) };
  if (value === undefined || !Number.isFinite(value) || value < 0) delete o[knob];
  else o[knob] = value;
  if (Object.keys(o).length === 0) difficultyOverrides.delete(name);
  else difficultyOverrides.set(name, o);
}

/** only what has actually been bent, for the balance document */
export function allDifficultyOverrides(): Record<string, Partial<DifficultyKnobs>> {
  return Object.fromEntries([...difficultyOverrides].map(([k, v]) => [k, { ...v }]));
}

/** replace every difficulty override at once — what a saved document applies */
export function applyDifficultyOverrides(
  doc: Record<string, Partial<DifficultyKnobs>>,
): void {
  difficultyOverrides.clear();
  for (const d of DIFFICULTIES) {
    const v = doc[d.name];
    if (!v || typeof v !== "object") continue;
    const clean: Partial<DifficultyKnobs> = {};
    for (const key of DIFFICULTY_KNOB_KEYS) {
      const n = v[key];
      if (typeof n === "number" && Number.isFinite(n) && n >= 0) clean[key] = n;
    }
    if (Object.keys(clean).length > 0) difficultyOverrides.set(d.name, clean);
  }
}

/** shield multiplier of a difficulty */
export const tierShieldScale = (tier: number): number =>
  difficultyKnobsOf(tier).shieldScale;

/**
 * Shield multiplier at an enemy level: the scale of the highest difficulty
 * whose level the given one has reached. Piecewise-constant on purpose —
 * the campaign only ever plays levels 0, 10 and 20 (tierLevel), so a curve
 * through the levels in between would be tuning nothing.
 */
export const shieldScaleAtLevel = (level: number): number => {
  let s = 1;
  for (let t = 0; t < DIFFICULTIES.length; t++)
    if (level >= DIFFICULTIES[t].level) s = difficultyKnobsOf(t).shieldScale;
  return s;
};

/** flat armour added to every unit at a difficulty; air and ground carry
 *  separate knobs because their counters shoot different calibres */
export const tierArmorBonus = (tier: number, flying: boolean): number => {
  const k = difficultyKnobsOf(tier);
  return flying ? k.airArmorBonus : k.groundArmorBonus;
};

/** flat armour bonus at an enemy level — piecewise like shieldScaleAtLevel,
 *  and for the same reason: only levels 0, 10 and 20 are ever played */
export const armorBonusAtLevel = (level: number, flying: boolean): number => {
  let a = 0;
  for (let t = 0; t < DIFFICULTIES.length; t++) {
    if (level < DIFFICULTIES[t].level) continue;
    const k = difficultyKnobsOf(t);
    a = flying ? k.airArmorBonus : k.groundArmorBonus;
  }
  return a;
};

/** drop multiplier of a difficulty */
export const tierDropBonus = (tier: number): number =>
  1 + DROP_BONUS_PER_TIER * clampTier(tier);

/**
 * How many of the authored waves a difficulty sends, clamped to what has
 * actually been written. A script shorter than 50 waves simply ends early
 * at the top difficulties; a script LONGER than 50 has waves nothing ever
 * plays, which check() reports.
 */
export const tierWaveCount = (spec: LevelSpec, tier: number): number =>
  Math.min(spec.script.length, DIFFICULTIES[clampTier(tier)].waves);

/**
 * The difficulty a wave first appears at — the inverse of tierWaveCount,
 * and the number an author needs when deciding where in the script to put
 * a new wave.
 *
 * Returns -1 for a wave past the top difficulty's cut: it is written but
 * unreachable, which is a bug in the script rather than a difficulty.
 */
export const tierOfWave = (index: number): number => {
  const n = Math.max(0, Math.floor(index)) + 1;
  for (let d = 0; d < DIFFICULTIES.length; d++) if (DIFFICULTIES[d].waves >= n) return d;
  return -1;
};

/** the last difficulty that still unlocks a wave — always the top one */
export const topContentTier = (spec: LevelSpec): number => {
  for (let d = TOP_TIER; d > 0; d--)
    if (tierWaveCount(spec, d) > tierWaveCount(spec, d - 1)) return d;
  return 0;
};

/** one unit's health at an enemy level (armour, speed and drop never move) */
export const unitHpAtLevel = (kind: UnitKind, level: number): number =>
  UNIT_STATS[kind].hp * HP_PER_LEVEL ** Math.max(0, level);

// ---------- expansion ----------

/** the playable spec for one difficulty: the script cut to its wave count,
 * carrying the enemy level the sim scales health by */
export function specForTier(spec: LevelSpec, tier: number): LevelSpec {
  const n = clampTier(tier);
  return {
    ...spec,
    script: spec.script.slice(0, tierWaveCount(spec, n)),
    tier: n,
    enemyLevel: tierLevel(n),
  };
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
 * difficulty — so any single-turret denominator says more about the
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
   *  column cannot see, and it grows by tierShieldScale on top */
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

/** weigh one difficulty */
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
 * hold WAVE ONE; from there difficulty 1 pays for itself several times over
 * while it is still being played. Duo is flat at 8 copper forever, so the
 * fleet grows with the bank in a straight line — difficulty 1's own kills
 * bank roughly 2,100 copper, some 260 more duos, and cross the granted fleet
 * about a third of the way in.
 *
 * That is why there is no arithmetic here and no check on this number. A
 * static-fleet model would be measuring a fleet that stops existing thirty
 * seconds into the run. Tune it by feel: too low and wave 1 wipes a fresh
 * save with no way to earn out, too high and the opening asks nothing.
 */
export const OPENING_DUOS = 50;

/**
 * ...and five arcs beside them, for a different reason than the duos.
 *
 * The duos exist so wave 1 is survivable. These exist so the first hour is
 * not spent re-earning a lesson the player has already had: a duo line kills
 * a crowd one body at a time, so the opening waves are a flat grind whose
 * only lever is buying more duos. Arc chains its bolt through a file of
 * ground units, so five of them are enough to feel the difference between
 * single-target and area fire — which is the thing the tech tree is FOR, and
 * it should be legible before a player has paid for it.
 *
 * FIVE, not fifty. It is a taste, not a fleet: air is untouched (arc is
 * ground-only), and five bolts do not hold a wave on their own. It buys back
 * a round or two of duo farming and no more.
 */
export const OPENING_ARCS = 5;

// ---------- the debut rule ----------

/**
 * Is every currency in this node's price actually dropped at this
 * difficulty? That is the whole unlock rule now — the tech tree carries no
 * ladder gates, so a node is reachable exactly when the waves pay for it
 * (see the note at the top of tech.ts).
 */
function payableAtTier(node: TechNodeDef, tier: number): boolean {
  const ratio = TARGET_DROP_RATIO[clampTier(tier)];
  return costEntries(node.price.base).every(
    ({ item }) => (ratio[ITEM_KINDS.indexOf(item)] ?? 0) > 0,
  );
}

/**
 * The best per-shot damage the player can own by the time a difficulty
 * starts: the strongest bullet among every turret this difficulty's drops
 * can actually pay for.
 *
 * This used to read `requiresTier`, back when a node could be told to wait
 * for a difficulty. Nothing is told to wait any more, so asking the price
 * is not a substitute for the old test — it IS the old test, written where
 * the truth lives.
 */
function bestShotByTier(tier: number): number {
  // DIFFICULTY 1 IS A SPECIAL CASE AND IT IS THE ONE THAT MATTERS. A fresh
  // save has banked nothing — kills are the only income — so it owns the
  // free duos and literally nothing else, however many turrets are
  // technically ungated.
  if (clampTier(tier) <= 0) return TOWERS.duo.bullet.damage;
  let best = 0;
  for (const node of TECH_TREE) {
    // the utilities path buys pace, not damage — it has no bullet to read
    if (!isTowerNode(node.id)) continue;
    if (!payableAtTier(node, tier)) continue;
    best = Math.max(best, TOWERS[node.id].bullet.damage);
  }
  return best;
}

/**
 * Units whose armour meets nothing that can efficiently hurt it at the
 * difficulty they debut on.
 *
 * This is a NOTE, not a gate. Nothing is ever unkillable — the 10% floor
 * means a duo always lands 0.9 — so a heavily armoured debut costs more
 * farming, which is a legitimate thing for a script to ask for. What it
 * reports is the size of that ask, so an author choosing it is choosing it.
 */
export function debutViolations(spec: LevelSpec = WORLD): LadderIssue[] {
  const debut = new Map<UnitKind, number>();
  spec.script.forEach((step, i) => {
    const at = tierOfWave(i);
    if (at < 0) return; // unreachable wave; check() reports it separately
    for (const g of waveGroups(step.wave))
      g.counts.forEach((count, k) => {
        if (count <= 0) return;
        const kind = UNIT_KINDS[k];
        debut.set(kind, Math.min(debut.get(kind) ?? Infinity, at));
      });
  });

  const bad: LadderIssue[] = [];
  for (const [kind, tier] of debut) {
    // the armour a tower actually meets: printed plus the difficulty's
    // flat bonus for the unit's side, which is what Sim spawns with
    const armor =
      UNIT_STATS[kind].armor + tierArmorBonus(tier, UNIT_STATS[kind].flying ?? false);
    const shot = bestShotByTier(tier);
    const tax = shot / Math.max(shot - armor, 0.1 * shot);
    if (tax >= 2)
      bad.push({
        tier,
        kind: "debut",
        message: `${kind} (armour ${armor} with the difficulty's bonus) debuts here against a best shot of ${shot} — it costs a fleet ${tax.toFixed(1)}x its printed health, so budget the farming for it`,
      });
  }
  return bad;
}

/**
 * One complaint about a script. `tier` is the difficulty it belongs to, so
 * the level editor can label the wave rows that difficulty owns; null means
 * the finding is about the script as a whole.
 */
export interface LadderIssue {
  tier: number | null;
  kind: "debut" | "wall" | "filler" | "economy" | "unreachable";
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
      // the drop table lives in items.ts and covers every tier there is —
      // reading it rather than a local triple is what lets a tier-4 unit be
      // a stats edit instead of an economy edit
      const drop = itemForTier(stats.tier);
      out.drops[drop] = (out.drops[drop] ?? 0) + count;
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
 * `share` is the wave's slice of the difficulty it belongs to, which is the
 * number to author against: a wave carrying 5% of its difficulty is filler,
 * one carrying 25% is a spike, and a difficulty's LAST wave should be its
 * heaviest or the run tails off into its finale.
 */
export interface WaveRow {
  /** 1-based wave number, as the editor shows it */
  wave: number;
  /** the difficulty it first appears at; -1 if past the top cut */
  tier: number;
  units: number;
  /** printed health at enemy level 0 — the authored weight */
  hp: number;
  /**
   * This wave's share of the health of the difficulty being LOOKED AT — not
   * of the one the wave debuts on. The same wave is a different fraction of
   * a 20-wave run and a 50-wave one, and which of those matters depends on
   * the run you are authoring for, so the caller picks.
   *
   * 0 for a wave the chosen difficulty never sends.
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
 * The per-wave guide, at the authored baseline level.
 *
 * `against` is the difficulty every share is measured in. Health is compared
 * at level 0 throughout — the enemy level is a uniform multiplier, so it
 * cancels out of a share and only the wave CUT actually moves the number.
 */
export function waveGuide(spec: LevelSpec = WORLD, against: number = TOP_TIER): WaveRow[] {
  const d = clampTier(against);
  const cut = tierWaveCount(spec, d);
  const total = budget(spec, d).hp / Math.max(1e-6, tierHpScale(d));
  let prev = 0;
  return spec.script.map((step, i) => {
    const c = waveCost(step, 0);
    const tier = tierOfWave(i);
    const row: WaveRow = {
      wave: i + 1,
      tier,
      units: c.units,
      hp: c.hp,
      // a wave past this difficulty's cut is not part of its run at all
      share: i >= cut ? 0 : c.hp / Math.max(1, total),
      step: prev ? c.hp / prev : 1,
      armourShare: c.armourShare,
      airShare: c.airShare,
      t3Share: c.t3Share,
    };
    prev = c.hp;
    return row;
  });
}

/** one difficulty, weighed — the row the editor's ladder check renders */
export interface AuditRow {
  tier: number;
  /** the name the player sees — Incursion, Onslaught, Nemesis */
  name: string;
  /** the 1-based ordinal, for compact labels */
  difficulty: number;
  waves: number;
  units: number;
  /** enemy level the difficulty plays at */
  level: number;
  /** printed health of the whole run — THE strength number */
  hp: number;
  /** how much harder than the difficulty below */
  step: number;
  /** health per second the fleet has to keep up with */
  hpPerSecond: number;
  /** seconds the run lasts */
  duration: number;
  t3Share: number;
  armourShare: number;
  /** share of health carried by shield-ability units, whose pools are also
   *  multiplied by this difficulty's shieldScale */
  shieldShare: number;
  /**
   * What a full clear actually banks, per currency, INCLUDING this
   * difficulty's drop bonus. One item per kill, so this is just the enemy
   * mix priced out — which is why the wave script is the only thing that
   * sets the economy.
   */
  drops: Cost;
  /**
   * The same thing as a shape: normalised to the base item (copper) = 100,
   * indexed like ITEM_KINDS. The drop BONUS cannot move this — it scales
   * every currency together — so the ratio is decided purely by how many
   * T1/T2/T3 bodies the waves send.
   *
   * WHAT TO AIM AT: TARGET_DROP_RATIO, above — the authored enemy mix this
   * difficulty is supposed to send. check() reports any currency that has
   * drifted more than RATIO_TOLERANCE off it.
   */
  dropRatio: number[];
}

/**
 * WALK THE LADDER AND REPORT WHAT EACH DIFFICULTY ASKS FOR.
 *
 * `step` is the number to author against. It has two sources multiplied
 * together:
 *
 *   step = 1.79 (the +10 enemy levels) x (health of the new waves ratio)
 *
 * so 1.79x is the FLOOR — what a difficulty costs if it adds no waves at
 * all — and everything above it is bought by the ten waves it unlocks. To
 * hit a target step M, the new block of ten must weigh (M / 1.79 - 1) times
 * everything below it.
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
  let prev = 0;
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
    for (const { item, amount } of costEntries(drops)) paid[item] = Math.round(amount * bonus);
    const s = Math.max(1, drops[BASE_ITEM] ?? 0);
    rows.push({
      tier,
      name: difficultyName(tier),
      difficulty: difficultyOf(tier),
      waves: b.waves,
      units: b.units,
      level,
      hp: Math.round(b.hp),
      step: prev ? +(b.hp / prev).toFixed(2) : 1,
      hpPerSecond: Math.round(b.hpPerSecond),
      duration: Math.round(b.duration),
      t3Share: +b.t3Share.toFixed(2),
      armourShare: +b.armourShare.toFixed(2),
      shieldShare: +b.shieldShare.toFixed(2),
      drops: paid,
      dropRatio: ITEM_KINDS.map((k) =>
        k === BASE_ITEM ? 100 : Math.round((1000 * (drops[k] ?? 0)) / s) / 10,
      ),
    });
    prev = b.hp;
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

  // a script longer than the top difficulty's cut has waves nothing ever
  // plays — silent content loss, and the easiest edit in the world to make
  // by accident
  const cut = DIFFICULTIES[TOP_TIER].waves;
  if (spec.script.length > cut)
    out.push({
      tier: null,
      kind: "unreachable",
      message: `the script has ${spec.script.length} waves but difficulty ${difficultyOf(TOP_TIER)} only plays ${cut} — waves ${cut + 1}-${spec.script.length} are never sent`,
    });

  // NOTE: there is deliberately no check on the opening loadout. See
  // OPENING_DUOS — difficulty 1 pays for hundreds of duos while it is still
  // being played, so any static-fleet prediction measures a fleet that never
  // exists. That number is tuned by feel, not by arithmetic.

  rows.forEach((r, i) => {
    const prev = rows[i - 1];
    // NOTE: none of these are feasibility tests. Turret prices are flat and
    // every run banks something, so a player can always farm the difficulty
    // below until they can afford the next one — nothing here is unwinnable.
    // What these measure is GRIND, which is the failure mode an idle game
    // actually has.
    if (prev && r.step > WALL_STEP)
      out.push({
        tier: r.tier,
        kind: "wall",
        message: `asks ${r.step}x the health of ${prev.name} — roughly ${r.step}x the farming before it opens`,
      });
    if (prev && r.step < FILLER_STEP && r.waves > prev.waves)
      out.push({
        tier: r.tier,
        kind: "filler",
        message: `adds ${r.waves - prev.waves} waves but only ${r.step}x the health — the ten new waves are barely paying for themselves`,
      });
    // The currency mix against TARGET_DROP_RATIO, every currency, named off
    // ITEM_KINDS rather than written out — so adding a tier-6 unit extends
    // this check for free instead of leaving a currency unwatched.
    const name = (i: number): string => ITEM_INFO[ITEM_KINDS[i]].name.toLowerCase();
    const want = TARGET_DROP_RATIO[r.tier] ?? [];
    want.forEach((target, i) => {
      // copper is the denominator, and a currency this difficulty is not
      // meant to pay yet is not a finding — only paying one EARLY is
      if (i === 0) return;
      const got = r.dropRatio[i] ?? 0;
      if (target === 0) {
        if (got > 0)
          out.push({
            tier: r.tier,
            kind: "economy",
            message: `pays ${name(i)} at 100:${got}, but nothing charges for it this early — it will sit unspent until the difficulty that does`,
          });
        return;
      }
      const drift = got / target;
      if (drift < 1 - RATIO_TOLERANCE || drift > 1 + RATIO_TOLERANCE)
        out.push({
          tier: r.tier,
          kind: "economy",
          message: `pays ${name(i)} at 100:${got}, ${drift < 1 ? "under" : "over"} the 100:${target} this difficulty is authored to — ${drift.toFixed(2)}x target`,
        });
    });
  });
  return out;
}

/**
 * A difficulty costing more than this much more than the last reads as a
 * wall. Generous, because with only three gaps in the whole campaign each
 * one is MEANT to be a real step — the +10 enemy levels alone are 1.79x
 * before a single new wave is counted.
 */
export const WALL_STEP = 4.5;
/** ...and less than this, with ten new waves, reads as padding */
export const FILLER_STEP = 2;
