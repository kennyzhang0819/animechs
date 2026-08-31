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
  BASE_ITEM,
  costEntries,
  ITEM_INFO,
  ITEM_KINDS,
  type Cost,
} from "./items";

/**
 * THE LADDER — ONE CLIMB PER WORLD, TEN RUNGS, NO NAMES.
 *
 * A world ships ONE authored script. A rung is a CUT of that script plus an
 * enemy level and a few dials (see RUNGS):
 *
 *   rung   1   2   3   4   5   6   7   8   9  10
 *   waves 20  23  26  30  33  36  40  43  46  50
 *   level  0   4   8  12  16  20  24  28  32  36
 *
 * THERE ARE NO NAMED DIFFICULTIES ANY MORE and no jumps between them.
 * Incursion / Onslaught / Nemesis / Eradication were four rows with big
 * gaps, three of which a save crossed once and then never thought about
 * again; every one of those gaps was a wall a player had to farm at for an
 * evening before the next row would open. The same span — 20 to 50 waves,
 * enemy level 0 to 36, shield x1 to x5, swarm armour +0 to +10 — is now
 * split into TEN even rungs, and a rung is a number the player reads off a
 * counter. Rung 1 is exactly the old Incursion and rung 10 is exactly the
 * old Eradication; the eight steps in between are the ones that used to be
 * three.
 *
 * THE CLIMB IS THE GAME. Nothing is finite about it in shape — the ladder
 * stops at ten because ten is what is authored today (RUNG_COUNT), not
 * because clearing it is meant to end anything. `clearedByMap` is an
 * unbounded int per world, so raising RUNG_COUNT is the only edit a
 * longer ladder needs.
 *
 * WHAT REPLACED THE OLD ANTI-FARM GUARD. A rung used to carry a fixed
 * roster ceiling — an Incursion was a first-three-currencies fight forever,
 * whatever the save owned (`bandForTier`, deleted). That is the right rule
 * for three rows with big gaps and the wrong one for a continuous ladder:
 * steamrolling the rung that used to kill you IS the ascension fantasy, and
 * a permission gate takes it away. The guard is now an INCOME GRADIENT
 * instead — see LOOT_PER_RUNG. Nobody farms rung 4 when rung 10 pays 28x.
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
 * rather than merely long. A rung is a level offset on this same curve, so
 * a level-20 dagger outlives a level-0 mace and still has a dagger's
 * armour, while the level-20 fortress is still the thing chip damage cannot
 * scratch.
 */
export const HP_PER_LEVEL = 1.06;

/**
 * Enemy levels added per rung — 4 levels is x1.26 health per body.
 *
 * This is the half of a rung that makes the SAME waves harder. The other
 * half is the wave cut below, which makes the run longer. Both move
 * together on purpose: the levels are what keep the shared opening waves
 * from playing identically at every rung. (New kinds keep debuting deep
 * into the script — scepter at 21, the T5 lines from the mid-30s, the boss
 * at 50 — see the note over WORLDS in levels.ts.)
 *
 * It was 10 when the ladder had four rows spanning the same 0-36 levels.
 * Ten rungs over the same span is 4.
 */
export const LEVELS_PER_RUNG = 4;

/**
 * THE RUNGS, and the only place their shape is written down.
 *
 * `waves` is how much of the authored script this rung plays, `level` the
 * enemy level it plays at — everything else on this page is arithmetic over
 * this table. A rung has NO NAME and NO IDENTITY beyond its number: it is
 * shown as "Level n" (rungLabel) in a colour read off its position
 * (rungColor), and that is the whole of what a player is told about it.
 *
 * EVERY COLUMN IS AN EVEN SPLIT OF WHAT THE FOUR OLD DIFFICULTIES SPANNED,
 * which is what makes this a re-cut rather than a re-balance:
 *
 *   waves        20 -> 50   in steps of 3 and 4
 *   level         0 -> 36   in steps of LEVELS_PER_RUNG
 *   shieldScale   1 -> 5    geometrically (see below)
 *   armour       +0 -> +10  over the back half only (see below)
 *
 * THIS LADDER IS CLIMBED ONCE PER WORLD. This table says what a rung IS;
 * how far up it a save has got is a per-world number (clearedByMap in
 * progress.ts), so standing on rung 8 somewhere says nothing about
 * anywhere else.
 *
 * The wave cuts start at 20 rather than something evener because rung 1 has
 * to be a whole arc on its own — a fresh save's entire experience of the
 * game until it clears it — and end at 50 because that is what is authored.
 *
 * `shieldScale` multiplies every shield ability's pool, cap and regen (see
 * Sim.updateAbilities). It climbs GEOMETRICALLY rather than in equal steps
 * because shields answer a different question than health. A body's health
 * is priced against the enemy budget, so it rides the level curve; a shield
 * is measured in SECONDS OF ABSORBED TOWER FIRE, so it has to track the
 * player's firepower — and firepower tracks income, which is geometric
 * (LOOT_PER_RUNG). Left flat, a quasar's 500-point bubble that buys real
 * cover at rung 1 pops to incidental fire by rung 5. Only the enemy's own
 * shields scale; nothing on the player's side reads this.
 *
 * `lowTierArmorBonus` is added FLAT to the armour of every TIER 1-3 unit
 * at spawn (Sim reads it once, into uarmor); T4 and T5 never take it.
 * Armour is a flat shave floored at a tenth of the raw hit
 * (Sim.applyArmor), so the knob is regressive by calibre on purpose: +3
 * barely dents a salvo's 28 or a lancer's 140, but takes a third off a
 * duo's 9 — it makes the SWARM outlast chip without inflating the heavies,
 * which already carry the armour that matters.
 *
 * IT STAYS AT ZERO FOR THE FIRST FIVE RUNGS and then ramps in twos. That
 * is not an even split and it is deliberate: the anti-air line is built on
 * small pellets — a scatter shot is 3 damage — so even +1 halves the game's
 * first AA against the T1-T2 flyers. A ladder that started plating the
 * swarm at rung 2 would break the opening roster before the player had any
 * other one. By rung 6 the tree has answered that, and by rung 10 the +10
 * floors everything below midgame calibre against tiers 1-3 (a duo's 9, an
 * arc bolt's 20 halved, cyclone's 8/12 flak all land at or near the 10%
 * floor), which is the top rung's thesis: the fight above the top. The knob
 * still cannot touch T4/T5, whose debut tax stays priced by their own
 * plating. checkDebuts prices the bonus into its debut-tax lint.
 */
export const RUNGS: readonly {
  waves: number;
  level: number;
  shieldScale: number;
  lowTierArmorBonus: number;
}[] = [
  // prettier-ignore
  { waves: 20, level:  0, shieldScale: 1,    lowTierArmorBonus:  0 },
  // prettier-ignore
  { waves: 23, level:  4, shieldScale: 1.2,  lowTierArmorBonus:  0 },
  // prettier-ignore
  { waves: 26, level:  8, shieldScale: 1.43, lowTierArmorBonus:  0 },
  // prettier-ignore
  { waves: 30, level: 12, shieldScale: 1.71, lowTierArmorBonus:  0 },
  // prettier-ignore
  { waves: 33, level: 16, shieldScale: 2.05, lowTierArmorBonus:  0 },
  // prettier-ignore
  { waves: 36, level: 20, shieldScale: 2.46, lowTierArmorBonus:  2 },
  // prettier-ignore
  { waves: 40, level: 24, shieldScale: 2.95, lowTierArmorBonus:  4 },
  // prettier-ignore
  { waves: 43, level: 28, shieldScale: 3.54, lowTierArmorBonus:  6 },
  // prettier-ignore
  { waves: 46, level: 32, shieldScale: 4.24, lowTierArmorBonus:  8 },
  // prettier-ignore
  { waves: 50, level: 36, shieldScale: 5,    lowTierArmorBonus: 10 },
];

/** how many rungs the ladder has today — ten, and raising it is the only
 *  edit a longer ladder needs */
export const RUNG_COUNT = RUNGS.length;

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
 * THE ENEMY MIX EACH RUNG SHOULD SEND, as the payout it produces: one item
 * per kill, so a wave script's unit tiers ARE the economy. Indexed like
 * RUNGS then like ITEM_KINDS, normalised to copper = 100.
 *
 * THREE OF THESE ROWS ARE THE DESIGN INPUT AND THE OTHER SEVEN ARE WHERE
 * THE SAME SCRIPT STANDS AT ITS OWN CUT. Rungs 1, 6 and 10 are the mixes
 * the wave script was authored to — they are the old Incursion, Onslaught
 * and Nemesis rows, unchanged, and their cuts (20, 36 and 50 waves) are
 * where the ten-rung split happens to put them. The seven in between are
 * the cumulative mix the script actually pays at those cuts, read off it
 * and written down, because a cut of an authored script cannot have a
 * target of its own that the script is not free to miss.
 *
 * So an author still aims at rows 1, 6 and 10; check() measures every rung
 * against its row, and a rung in between drifting means bodies were moved
 * across its cut, which is a thing worth being told about.
 *
 * READ THESE ROWS AS WEIGHT, NOT COUNT. Every rung above the first still
 * sends tier-1 bodies by the tens of thousands — T1 stays the most numerous
 * thing on the field, and the swarm is meant to look like a swarm. What
 * moves is what the swarm is CARRYING.
 *
 * A TIER-1 BODY IS NEARLY FREE IN THIS BUDGET and that is the key to reading
 * the table: 150 health against a tier-4's 9,000, so ONE T4 weighs as much
 * as sixty daggers. So "send more T1" and "shift the weight upward" are not
 * in tension at all — the thing that actually sets the size of the step
 * between rungs is the T3, T4 and T5 counts, and nothing else is close.
 *
 * A run's TOTAL bodies are not its bodies on the field. Units stream in over
 * WAVE_RELEASE_SECONDS and die continuously, so a rung that sends 50,000 of
 * them never holds anything like that at once. Do not size a rung against
 * the map's area; size it against these rows and let the drop zones throttle
 * what they cannot pass.
 *
 * NOTHING GATES A CURRENCY ANY MORE. Under the old ladder a rung had a
 * fixed roster ceiling, so a currency dropping before anything charged for
 * it was a real complaint; today every node in the tree is open and the
 * bank decides (see the note at the top of tech.ts), so an early trickle of
 * plastanium is simply the first plastanium. The rows carry those trickles
 * rather than rounding them to zero.
 *
 * (Surge alloy has no column anywhere here: it never drops from waves, only
 * from a boss's first kill — see grantRunReward in progress.ts.)
 */
export const TARGET_DROP_RATIO: readonly (readonly number[])[] = [
  [100, 15, 3.6, 0, 0], // rung 1 — authored (the old Incursion row)
  [100, 16, 4.1, 0, 0],
  [100, 17.9, 5.3, 0.1, 0],
  [100, 20, 7.4, 0.2, 0],
  [100, 22, 9.7, 0.4, 0],
  [100, 24.5, 12.2, 0.8, 0], // rung 6 — authored (the old Onslaught row)
  [100, 25.5, 13.8, 1, 0],
  [100, 26.5, 15.9, 1.4, 0.1],
  [100, 27.8, 18.9, 2.2, 0.3],
  [100, 30, 24, 4.2, 0.85], // rung 10 — authored (the old Nemesis row)
];

/**
 * THE DEEPEST CURRENCY A RUNG PAYS, as an index into ITEM_KINDS — read off
 * TARGET_DROP_RATIO, so it follows the authored mix rather than a second
 * table that could disagree with it.
 *
 * The menu uses it to say what a rung newly drops, and it only has anything
 * to say on the rungs where the answer CHANGES: under the ten-rung split
 * plastanium arrives at rung 3 and phase fabric at rung 8, and the seven
 * other rungs pay a deeper share of what the rung below already paid rather
 * than anything new.
 */
export const deepestDrop = (tier: number): number => {
  const row = TARGET_DROP_RATIO[clampTier(tier)] ?? [];
  let deepest = 0;
  row.forEach((share, i) => {
    if (share > 0) deepest = i;
  });
  return deepest;
};

/** does this rung pay a currency the rung below it does not? */
export const paysNewCurrency = (tier: number): boolean =>
  clampTier(tier) > 0 && deepestDrop(tier) > deepestDrop(clampTier(tier) - 1);

/** how far off target a currency may drift before check() says so */
export const RATIO_TOLERANCE = 0.4;

/** the last rung there is — index 9, the tenth */
export const TOP_TIER = RUNG_COUNT - 1;

/** every rung index is clamped into the table; there is nothing above it */
const clampTier = (tier: number): number =>
  Math.min(TOP_TIER, Math.max(0, Math.floor(tier)));

/**
 * LOOT PER RUNG, COMPOUNDING: rung n pays x LOOT_PER_RUNG^n on every drop.
 * Rung 10 pays x28.3 what rung 1 does, and it is the whole anti-farm guard.
 *
 * IT HAD TO STOP BEING LINEAR. The old bonus was 1 + 0.3n against health
 * that compounds at 1.06 a level, which is a SHAPE problem rather than a
 * tuning one: a linear payout against a geometric fight hard-stops any
 * ladder somewhere in its twenties, whatever the constants. So the payout
 * compounds too.
 *
 * WHERE 1.45 COMES FROM. The number to beat is not the health step, it is
 * the HEALTH PER SECOND step — what the fleet actually has to keep up with
 * — and over these ten rungs that is x1.46 a rung (8,107 hp/s at rung 1 to
 * 244,586 at rung 10, see audit()). A rung also runs longer than the one
 * below it and kills a little faster per minute, worth about x1.03 a rung
 * on its own. 1.45 x 1.03 = x1.50 of income per MINUTE per rung, against a
 * fight that gets x1.46 harder per minute: modestly above, on purpose.
 *
 * THE SURPLUS IS SUPPOSED TO BE SMALL, because the tech tree's own price
 * curve is geometric in points owned (g ** owned, tech.ts) and that is what
 * turns the surplus into TIME. Set this much higher and the ladder walks
 * itself; set it below the health-per-second step and every rung is a
 * worse farm than the one under it, which is the failure the linear bonus
 * had. audit() reports both steps and their ratio per rung (`grindStep`),
 * and check() complains when a rung drifts too far either way — those are
 * the numbers to tune against, never the feel of one run.
 *
 * THE TOP RUNG PAYS ITS FULL SHARE. Eradication used to be capped to the
 * bonus of the rung below it — the fight above the top, deliberately not
 * the farm above it. That was a rule for a finite campaign with a hidden
 * ultimate difficulty; on a continuous ladder it just meant the last rung
 * was strictly worse to play than the one before, which is the one thing
 * an ascension ladder must never be.
 */
export const LOOT_PER_RUNG = 1.45;

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
  shieldScale: number;
  /** flat armour added to tier 1-3 units only — see the RUNGS doc */
  lowTierArmorBonus: number;
}

const RUNG_KNOB_KEYS = ["level", "shieldScale", "lowTierArmorBonus"] as const;

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
    shieldScale: o.shieldScale ?? d.shieldScale,
    lowTierArmorBonus: o.lowTierArmorBonus ?? d.lowTierArmorBonus,
  };
}

/** the dials as authored — where a Reset returns to */
export function authoredRungKnobs(tier: number): RungKnobs {
  const d = RUNGS[clampTier(tier)];
  return {
    level: d.level,
    shieldScale: d.shieldScale,
    lowTierArmorBonus: d.lowTierArmorBonus,
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
  if (value === undefined || !Number.isFinite(value) || value < 0) delete o[knob];
  else o[knob] = value;
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
      if (typeof n === "number" && Number.isFinite(n) && n >= 0) clean[k] = n;
    }
    if (Object.keys(clean).length > 0) rungOverrides.set(key, clean);
  }
}

/** shield multiplier of a rung */
export const tierShieldScale = (tier: number): number => rungKnobsOf(tier).shieldScale;

/**
 * Shield multiplier at an enemy level: the scale of the highest rung whose
 * level the given one has reached. Piecewise-constant on purpose — a run
 * only ever plays the levels the rungs name (tierLevel), so a curve through
 * the levels in between would be tuning nothing.
 */
export const shieldScaleAtLevel = (level: number): number => {
  let s = 1;
  // the threshold is the KNOBBED level, so a rung whose level was dialled
  // still hands its shield scale to the runs playing at it
  for (let t = 0; t <= TOP_TIER; t++)
    if (level >= rungKnobsOf(t).level) s = rungKnobsOf(t).shieldScale;
  return s;
};

/** flat armour a unit of `unitTier` gains at a rung — zero above tier 3:
 *  the knob hardens the swarm, never the heavies */
export const tierArmorBonus = (tier: number, unitTier: number): number =>
  unitTier <= 3 ? rungKnobsOf(tier).lowTierArmorBonus : 0;

/** flat armour bonus at an enemy level — piecewise like shieldScaleAtLevel,
 *  and for the same reason: only the authored levels are ever played */
export const armorBonusAtLevel = (level: number, unitTier: number): number => {
  if (unitTier > 3) return 0;
  let a = 0;
  for (let t = 0; t <= TOP_TIER; t++) {
    const k = rungKnobsOf(t);
    if (level < k.level) continue;
    a = k.lowTierArmorBonus;
  }
  return a;
};

/** drop multiplier of a rung — compounding all the way to the top, the top
 *  rung included (see LOOT_PER_RUNG) */
export const tierDropBonus = (tier: number): number => LOOT_PER_RUNG ** clampTier(tier);

/**
 * How many of the authored waves a rung sends, clamped to what has actually
 * been written. A script shorter than the top rung's cut simply ends early
 * up there; a script LONGER than that cut has waves nothing ever plays,
 * which check() reports.
 */
export const tierWaveCount = (spec: LevelSpec, tier: number): number =>
  Math.min(spec.script.length, RUNGS[clampTier(tier)].waves);

/**
 * The rung a wave first appears at — the inverse of tierWaveCount, and the
 * number an author needs when deciding where in the script to put a new
 * wave.
 *
 * Returns -1 for a wave past the top rung's cut: it is written but
 * unreachable, which is a bug in the script rather than a rung.
 */
export const tierOfWave = (index: number): number => {
  const n = Math.max(0, Math.floor(index)) + 1;
  for (let d = 0; d <= TOP_TIER; d++) if (RUNGS[d].waves >= n) return d;
  return -1;
};

/** the last rung that still unlocks a wave — always the top one */
export const topContentTier = (spec: LevelSpec): number => {
  for (let d = TOP_TIER; d > 0; d--)
    if (tierWaveCount(spec, d) > tierWaveCount(spec, d - 1)) return d;
  return 0;
};

/** one unit's health at an enemy level (armour, speed and drop never move) */
export const unitHpAtLevel = (kind: UnitKind, level: number): number =>
  UNIT_STATS[kind].hp * HP_PER_LEVEL ** Math.max(0, level);

// ---------- expansion ----------

/** the playable spec for one rung: the script cut to its wave count,
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
 * WHICH MAP OPENS WHICH — the campaign's one piece of structure above the
 * ladders, and the only thing a map's own progress cannot buy.
 *
 * Each map is climbed separately and keeps its own ladder, so nothing else
 * crosses between them. This does: a map named here stays shut until the
 * named RUNG has fallen on the named map. Confluence teaches the game and
 * Maelstrom assumes it has been taught, so Maelstrom asks for a real climb
 * on Confluence rather than its first clear, which proves only that the
 * opening waves can be held.
 *
 * IT ASKS FOR THE MIDDLE OF THE LADDER, NOT THE TOP. Under the named
 * difficulties this was "clear Nemesis" — the third of four rows, the
 * visible top of the campaign. Held literally that would now be rung 10,
 * and gating the second world behind the whole ladder makes the second
 * world content nobody sees. Rung 5 plays 33 waves at enemy level 16 —
 * the level the old Nemesis itself ran at — which is the same statement
 * about what the player has been taught, a third of the way sooner.
 *
 * A map absent from this table is open from the first run, which is every
 * map but the ones written here.
 */
export const WORLD_REQUIRES: Readonly<Record<string, { world: string; tier: number }>> = {
  // Maelstrom opens once Confluence's rung 5 has fallen
  "2": { world: "1", tier: 4 },
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
 * Is every currency in this node's price actually dropped at this rung?
 * That is the whole unlock rule now — the tech tree carries no ladder
 * gates, so a node is reachable exactly when the waves pay for it (see the
 * note at the top of tech.ts).
 */
function payableAtTier(node: TechNodeDef, tier: number): boolean {
  const ratio = TARGET_DROP_RATIO[clampTier(tier)];
  return costEntries(node.price.base).every(
    ({ item }) => (ratio[ITEM_KINDS.indexOf(item)] ?? 0) > 0,
  );
}

/**
 * The best per-shot damage the player can own by the time a rung starts:
 * the strongest bullet among every turret this rung's drops can actually
 * pay for.
 *
 * This used to read `requiresTier`, back when a node could be told to wait
 * for a difficulty. Nothing is told to wait any more, so asking the price
 * is not a substitute for the old test — it IS the old test, written where
 * the truth lives.
 */
function bestShotByTier(tier: number): number {
  // RUNG 1 IS A SPECIAL CASE AND IT IS THE ONE THAT MATTERS. A fresh
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
 * Units whose armour meets nothing that can efficiently hurt it at the rung
 * they debut on.
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
    // the armour a tower actually meets: printed plus the rung's low-tier
    // bonus when the unit qualifies, which is what Sim spawns with
    const armor = UNIT_STATS[kind].armor + tierArmorBonus(tier, UNIT_STATS[kind].tier);
    const shot = bestShotByTier(tier);
    const tax = shot / Math.max(shot - armor, 0.1 * shot);
    if (tax >= 2)
      bad.push({
        tier,
        kind: "debut",
        message: `${kind} (armour ${armor} with the rung's bonus) debuts here against a best shot of ${shot} — it costs a fleet ${tax.toFixed(1)}x its printed health, so budget the farming for it`,
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
  kind: "debut" | "wall" | "filler" | "grind" | "economy" | "unreachable";
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
  /** the rung it first appears at; -1 if past the top cut */
  tier: number;
  units: number;
  /** printed health at enemy level 0 — the authored weight */
  hp: number;
  /**
   * This wave's share of the health of the rung being LOOKED AT — not of
   * the one the wave debuts on. The same wave is a different fraction of a
   * 20-wave run and a 50-wave one, and which of those matters depends on
   * the run you are authoring for, so the caller picks.
   *
   * 0 for a wave the chosen rung never sends.
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
 * `against` is the rung every share is measured in. Health is compared at
 * level 0 throughout — the enemy level is a uniform multiplier, so it
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
      // a wave past this rung's cut is not part of its run at all
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

/** one rung, weighed — the row the editor's ladder check renders */
export interface AuditRow {
  tier: number;
  /** the 1-based ordinal — the rung's whole identity */
  rung: number;
  /** what the player is shown, "Level n" */
  label: string;
  waves: number;
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
  /** share of health carried by shield-ability units, whose pools are also
   *  multiplied by this rung's shieldScale */
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
   * hpPerSecond over the rung below's. This is what the fleet has to answer,
   * and it is the number the payout has to keep up with (NOT `step`, which
   * counts a longer run as harder when it is only longer).
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
 * `step` is the run's whole health against the run below it, and it has two
 * sources multiplied together:
 *
 *   step = 1.26 (the +4 enemy levels) x (health of the new waves ratio)
 *
 * so 1.26x is the FLOOR — what a rung costs if it adds no waves at all —
 * and everything above it is bought by the three or four waves it unlocks.
 *
 * BUT `step` IS NOT WHAT THE FLEET FEELS. A longer run is not a harder one:
 * the same towers simply keep firing. What the fleet has to answer is
 * `climbStep` — health per SECOND against the rung below — and what pays
 * for answering it is `farmStep`, income per minute against the rung below.
 * Their ratio is `grindStep`, and that is the ladder's real shape.
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
      waves: b.waves,
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

  // a script longer than the top rung's cut has waves nothing ever plays —
  // silent content loss, and the easiest edit in the world to make by
  // accident
  const cut = RUNGS[TOP_TIER].waves;
  if (spec.script.length > cut)
    out.push({
      tier: null,
      kind: "unreachable",
      message: `the script has ${spec.script.length} waves but ${rungLabel(TOP_TIER)} — the top rung — only plays ${cut}, so waves ${cut + 1}-${spec.script.length} are never sent`,
    });

  // NOTE: there is deliberately no check on the opening loadout. See
  // OPENING_DUOS — rung 1 pays for hundreds of duos while it is still being
  // played, so any static-fleet prediction measures a fleet that never
  // exists. That number is tuned by feel, not by arithmetic.

  rows.forEach((r, i) => {
    const prev = rows[i - 1];
    // NOTE: none of these are feasibility tests. Every run banks something
    // and every turret is buyable at every rung, so a player can always farm
    // the rung below until they can afford the next one — nothing here is
    // unwinnable. What these measure is GRIND, which is the failure mode an
    // idle game actually has.
    if (prev && r.step > WALL_STEP)
      out.push({
        tier: r.tier,
        kind: "wall",
        message: `asks ${r.step}x the health of ${prev.label} — a rung of a ten-rung ladder should be a step, not a gate`,
      });
    if (prev && r.step < FILLER_STEP && r.waves > prev.waves)
      out.push({
        tier: r.tier,
        kind: "filler",
        message: `adds ${r.waves - prev.waves} waves but only ${r.step}x the health — the new waves are barely paying for themselves`,
      });
    // THE LADDER'S OWN SHAPE, and the reason this lint exists at all: a
    // rung has to pay for itself. grindStep is health-per-second growth
    // over income-per-minute growth, so above GRIND_STEP the rung costs
    // materially more farming than the last one did, and below SLIDE_STEP
    // it costs materially less — a ladder that gets easier as it climbs,
    // which collapses into "always jump to the top".
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
    // The currency mix against TARGET_DROP_RATIO, every currency, named off
    // ITEM_KINDS rather than written out — so adding a tier-6 unit extends
    // this check for free instead of leaving a currency unwatched.
    const name = (i: number): string => ITEM_INFO[ITEM_KINDS[i]].name.toLowerCase();
    const want = TARGET_DROP_RATIO[r.tier] ?? [];
    want.forEach((target, i) => {
      // copper is the denominator, and a currency this rung is not meant to
      // pay yet is not a finding — only paying one EARLY is
      if (i === 0) return;
      const got = r.dropRatio[i] ?? 0;
      if (target === 0) {
        if (got > 0)
          out.push({
            tier: r.tier,
            kind: "economy",
            message: `pays ${name(i)} at 100:${got}, earlier than the rung this ladder authors it to — check the wave that moved across the cut`,
          });
        return;
      }
      const drift = got / target;
      if (drift < 1 - RATIO_TOLERANCE || drift > 1 + RATIO_TOLERANCE)
        out.push({
          tier: r.tier,
          kind: "economy",
          message: `pays ${name(i)} at 100:${got}, ${drift < 1 ? "under" : "over"} the 100:${target} this rung is authored to — ${drift.toFixed(2)}x target`,
        });
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
  const head = "rung  waves  lvl        hp     hp/s   loot   items/min   climb   farm   grind";
  const rows = audit(spec).map(
    (r) =>
      `${String(r.rung).padStart(4)}  ${String(r.waves).padStart(5)}  ${String(r.level).padStart(3)}  ${
        (r.hp / 1e6).toFixed(2) + "M"
      }`.padEnd(30) +
      `${String(r.hpPerSecond).padStart(8)}  ${("x" + r.lootBonus.toFixed(2)).padStart(6)}  ${String(
        r.incomePerMinute,
      ).padStart(10)}  ${r.climbStep.toFixed(2).padStart(6)}  ${r.farmStep
        .toFixed(2)
        .padStart(5)}  ${r.grindStep.toFixed(2).padStart(6)}`,
  );
  return [head, ...rows].join("\n");
}

/**
 * A rung costing more than this much more health than the last reads as a
 * wall. It was 4.5 when the ladder had four rows and each gap was MEANT to
 * be an evening of farming; ten rungs over the same span step about 1.6x
 * each, so anything past 2 is one rung doing two rungs' work.
 */
export const WALL_STEP = 2;
/** ...and less than this, while still adding waves, reads as padding */
export const FILLER_STEP = 1.25;
/**
 * The most extra farming one rung may cost over the last before check()
 * calls it a grind — see AuditRow.grindStep. The authored ladder runs
 * 0.88 to 1.11, so this is real headroom rather than a number the table
 * only just clears.
 */
export const GRIND_STEP = 1.3;
/** ...and the least, before a rung is cheaper to reach than the one below */
export const SLIDE_STEP = 0.75;
