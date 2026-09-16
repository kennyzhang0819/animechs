import { targetingLine, TOWER_DESC, TOWERS } from "./constants";
import { VISIBLE_WORLDS, worldHidden, WORLDS } from "./levels";
import { MODS, modBlurb, modDef, modName, type ModId } from "./mods";
import { RELICS, relicDef, type RelicId } from "./relics";
import { MUTATIONS, mutationById, mutationCostOf, type MutationId } from "./mutation";
import { RARITIES, rarityDef } from "./rarity";
import { BY_MINDUSTRY_VALUE, type TechState } from "./tech";
import {
  FIELDED_KINDS,
  isRetired,
  TOWER_KINDS as TOWER_KINDS_ALL,
  type TowerKind,
} from "./types";
import {
  ALL_UPGRADES,
  NO_UPGRADES,
  TURRET_UPGRADES,
  upgradeDef,
  type UpgradeKind,
  type UpgradePoints,
} from "./upgrades";

/**
 * THE LEVEL TRACK — the co-op model of progression, and the whole of it.
 *
 * A save has one number, its lifetime XP (progress.ts), and the level read
 * off it (economy.ts) is a tier on this track. Every tier hands out fixed
 * rewards: a map opens, a turret joins the roster, a module joins the bag.
 * Nothing is chosen and nothing is bought — the player levels, the game
 * hands them things, exactly as a commander levels in co-op.
 *
 * THE TRACK HAS TWO PHASES, THEY DO NOT OVERLAP, AND THE SEAM IS THE TOP
 * OF THE BUILD PHASE.
 *
 *   THE BUILD PHASE, levels 1 to ROSTER_TOP. Everything a player builds
 *   WITH is dealt here, and all of it is dealt by the top: the turrets —
 *   and therefore the cards in the DRAW POOL, since the deal (rarity.ts)
 *   rolls over exactly what the track has handed out — the mods that ride
 *   them, and the maps to take the lot to. A fresh save opens with
 *   STARTING_ROSTER and STARTING_MODS; a save that reaches ROSTER_TOP owns
 *   the game's whole toolkit and will never be handed another piece of it.
 *
 *   THE MUTATOR PHASE, MUTATORS_FROM to MAX_LEVEL. What a level hands out
 *   here is a RULE and never anything else, added to the deck the deploy
 *   roll draws from (MUTATOR_UNLOCKS). Nothing new to build with: the
 *   reward for climbing past the seam is that the game is ALLOWED TO BE
 *   HARDER, which is the reward a tower defence player is actually
 *   climbing for.
 *
 * THE TWO PHASES USED TO OVERLAP, AND ON PURPOSE. The roster ran to 20 and
 * the modules to 30, threaded between the rules so that every level of a
 * 30-level track carried something. What that bought was two different
 * promises on one row — this level makes the game harder, and also here is
 * a purple to answer it with — and a ceiling spent over thirty clears. The
 * seam is the fix, and it is the whole shape of the campaign now: BUILD,
 * then FIGHT.
 *
 * EVERY LEVEL STILL CARRIES SOMETHING, and it is CHECKED at import rather
 * than trusted (see the last invariant in this file). A row of the
 * progress screen that hands out nothing is a row with no reason to be
 * looked at; two dense phases back to back is how the track keeps that
 * true without a 30-level stretch to fill.
 *
 * THE RELICS ARE OFF THE TRACK ENTIRELY — see the relic note below. They
 * used to fill the back half, which is the mutator phase's half; nothing
 * deals one now and no run can roll one, and the catalog is intact for
 * when they come back.
 *
 * THE UPGRADE BRANCHES ARE OFF IT TOO (UPGRADES_ON_TRACK): upgrades.ts is
 * intact and waiting to be put back somewhere. They are not a third
 * category — nothing deals one, nothing sells one, and no screen groups
 * them under a word of their own (see mods.ts: there are two categories,
 * and "upgrade" is not one of them).
 */

/**
 * THE LAST LEVEL OF THE BUILD PHASE. Every turret, every mod and every map
 * is dealt at or below this, and nothing but rules is dealt above it.
 *
 * IT IS THE PHASE'S TOP, NOT THE ROSTER'S, though it is still named for the
 * roster. Every row from 2 up hands over one gun and one module, so the
 * tables empty at the rate the CATALOGS run out rather than on a level
 * chosen for them: the bag is spent at 12, the roster at 14, and 15 is the
 * ninth map on its own. What fixes this number is the seam below it — move
 * it and MUTATORS_FROM moves, which is the one gate on the ladder.
 */
export const ROSTER_TOP = 15;

/**
 * THE LEVEL THE MUTATOR PHASE OPENS — one past the build phase's top, and
 * the one gate on the ladder: the difficulties that roll rules (Nemesis +1
 * and up) are shut until a save has rules to roll. THIS NUMBER IS
 * LOAD-BEARING — Animechs.tsx prints it at a player looking at a locked
 * difficulty — and every table in this file is authored to the seam it
 * names.
 */
export const MUTATORS_FROM = ROSTER_TOP + 1;

/**
 * THE RULES, LIGHTEST FIRST, by the level that opens them.
 *
 * THE FIRST ROW IS A POOL AND NOT A RULE. A deploy above Nemesis rolls
 * several mutators to fit a points budget (mutation.ts), and a deck with
 * ONE card in it does not roll — it deals the same rule every run, which
 * is the opposite of what the mutator phase is for. MUTATORS_FROM
 * therefore opens the whole LIGHT band at once, three rules the first
 * mutator-bearing difficulty can actually afford, and a run above Nemesis
 * is a different run from its first outing.
 *
 * AFTER THAT IT IS ONE A LEVEL, CHEAPEST FIRST, TO THE TOP. The phase used
 * to deal every other level, because the maps, modules and relics sat in
 * the gaps; nothing sits in them now, so a gap would be an empty row. Ten
 * rules on ten consecutive levels after the opening three is what sets
 * MAX_LEVEL.
 */
const MUTATOR_UNLOCKS: Readonly<Record<number, readonly MutationId[]>> = {
  // CHEAPEST FIRST, and the order is the CATALOG's (mutation.ts), which is
  // re-authored whenever the costs are — a rule that got dearer moves down
  // this table with it, or the phase would be handing out its hardest
  // rules first and calling them an opening hand
  16: ["amphibious", "shieldTowers", "volatile"],
  17: ["armored"],
  18: ["hydrophobic"],
  19: ["leadership"],
  20: ["mitosis"],
  21: ["conquest"],
  22: ["mechVirus"],
  23: ["overshields"],
  24: ["reconstruction"],
  25: ["speedy"],
  26: ["hungry"],
};

/**
 * THE LAST LEVEL THAT HANDS ANYTHING OUT — the bottom of the progress
 * screen, and the dearest rule's row.
 *
 * IT IS NOT THE LEVEL CAP. The curve runs to LEVEL_CAP (economy.ts) and a
 * save is free to climb past the track's top; there is simply nothing
 * above here left to hand over. It came down from 30 with the relics: the
 * back half was fourteen relics threaded through thirteen rules, and
 * without them the rules close the track on their own.
 */
export const MAX_LEVEL = 26;

/** THE CATALOG IS DEALT WHOLE, ONCE EACH, INSIDE THE PHASE — checked at import */
(() => {
  const seen = new Set<MutationId>();
  for (const [level, row] of Object.entries(MUTATOR_UNLOCKS)) {
    if (+level < MUTATORS_FROM || +level > MAX_LEVEL)
      throw new Error(`the track opens a rule on level ${level}, outside the mutator phase`);
    if (row.length === 0) throw new Error(`level ${level} opens no rule`);
    for (const id of row) {
      if (!mutationById(id)) throw new Error(`the track opens "${id}", which is not a mutator`);
      if (seen.has(id)) throw new Error(`the track opens the mutator "${id}" twice`);
      seen.add(id);
    }
  }
  for (const m of MUTATIONS)
    if (!seen.has(m.id)) throw new Error(`the track never opens the mutator "${m.id}"`);
  if ((MUTATOR_UNLOCKS[MUTATORS_FROM]?.length ?? 0) < 2)
    throw new Error("the mutator phase opens with one rule — a deck of one does not roll");
})();

/**
 * ONE THING A LEVEL HANDS OVER. A MOD AND A RELIC ARE TWO KINDS AND NOT
 * ONE: they used to be a single `module` reward carrying a ModId, which
 * meant every screen that drew a row had to ask the def which half it was
 * in to say the right word. There are two categories in this game
 * (mods.ts, relics.ts), so there are two reward kinds, and a row says
 * "Mod" or "Relic" off the kind it IS.
 */
export type Reward =
  | { kind: "world"; worldId: string }
  | { kind: "turret"; id: TowerKind }
  | { kind: "mod"; id: ModId }
  | { kind: "relic"; id: RelicId }
  | { kind: "mutator"; id: MutationId }
  | { kind: "upgrade"; id: UpgradeKind };

/**
 * THE MAPS, and the spine of the build phase: ONE EVERY OTHER LEVEL from 2
 * to 14, then the ninth on ROSTER_TOP beside the last purple. Every second
 * row of the opening is somewhere new to take what the row before handed
 * over, and the phase closes on a map and the gun to christen it with.
 *
 * ONE MAP A LEVEL AND NEVER TWO. A map is the biggest thing a row can
 * carry and the eye reads it last (REWARD_ORDER), so a row carries one or
 * it carries none; the odd levels are where the gun and the module stand on
 * their own. The last of the nine is the whole of level 15 — the roster and
 * the bag both run out under it, so the phase closes on somewhere new to
 * take everything it just finished handing over.
 *
 * They used to run to level 22 — stretched out across the old 30-level
 * track so the back half had something to hand over besides rules. Two of
 * the nine therefore landed past the point where a player had stopped
 * being promised anything to build with, which is the wrong half of a
 * campaign to be opening new ground in.
 */
const PLACED: readonly { level: number; reward: Reward }[] = [
  { level: 2, reward: { kind: "world", worldId: "4" } },
  { level: 4, reward: { kind: "world", worldId: "2" } },
  { level: 6, reward: { kind: "world", worldId: "5" } },
  { level: 8, reward: { kind: "world", worldId: "6" } },
  { level: 10, reward: { kind: "world", worldId: "7" } },
  { level: 12, reward: { kind: "world", worldId: "3" } },
  { level: 14, reward: { kind: "world", worldId: "8" } },
  { level: 15, reward: { kind: "world", worldId: "9" } },
];

/**
 * THE FIRST BOARD: a gun for the ground, a gun for the air, artillery for
 * the crowd, and the AUTOCANNON — the first gun that answers a single hard body
 * rather than a crowd, without which the first ten waves are answered by
 * putting down more tackers. Everything else is dealt one a level.
 *
 * THE REPEATER USED TO BE HERE and has been moved to the top of the track
 * (UNLOCKS, level 12). It was in the opening hand to show a new save what
 * its scrap was FOR, back when scrap bought a named turret off a shelf —
 * and the deal (rarity.ts) answers that question by itself now. Worse, an
 * ultra-rare turret in the roster from wave one is an ultra-rare turret in
 * the DRAW POOL from wave one, and the one-in-a-hundred border means
 * nothing if the board it can come out of is four commons deep.
 */
export const STARTING_ROSTER: readonly TowerKind[] = [
  "tacker", "lobber", "airburst", "autocannon",
];

/**
 * THE ROSTER IS WRITTEN, THE REST IS PLACED. A hand-authored order because
 * the shape of the opening — which gun answers which wave — is a design
 * decision and not an arithmetic on build cost. Index 0 is level 2.
 */
const UNLOCKS: Readonly<Record<number, readonly TowerKind[]>> = {
  // THE COMMONS LEAD, because every one of them widens the floor of the
  // draw rather than its ceiling: the opening levels are where a save
  // learns what the deal FEELS like, and it should feel like a board being
  // filled in. The two fixers that used to lead this list are retired
  // (types.ts RETIRED_KINDS) and no level hands one out
  2: ["torch"],
  3: ["coil"],
  // ...but the bands are INTERLEAVED rather than dealt in blocks. A blue
  // among the commons is the first level that changes what a board can do
  // instead of how much of it there is, and the last common lands after it
  // so the floor is still being filled in while the ceiling rises
  4: ["piercer"],
  5: ["douser"],
  6: ["barrage"],
  // the first amber comes early for the same reason, and the blue that
  // follows it keeps the middle of the phase from settling into a pattern
  7: ["hive"],
  8: ["tether"],
  // THE PURPLES ARE SPREAD, and the last of them closes the roster. A 4x4
  // is the thing a run is hoping the deal turns over, and handing all three
  // out on consecutive levels spent the whole ceiling of the game in three
  // clears. The gaps are the point — a save plays a good while WITH the
  // repeater before the furnace turns up — and the blues and ambers below
  // are what stands in them. Three levels apart, then two: the roster runs
  // out one level before the phase does now that every row from 2 carries a
  // gun, and the railhead would rather land a row early than leave a hole
  9: ["repeater"],
  10: ["whirl"],
  11: ["cleaver"],
  12: ["furnace"],
  13: ["deluge"],
  14: ["railhead"],
};

/**
 * THE SHAPES ARE NOT ON THE TRACK AT ALL (formation.ts). Every save owns
 * every one of the five squares from wave one, so nothing here deals one
 * and the codex has no Shapes tab. They were dealt once — three
 * to open with and nine earned — back when a shape was an OUTLINE and
 * learning what a saltire was for was a reward in itself. A table of
 * plain squares has nothing to teach that way: gating the 6x6 behind
 * level 26 only meant a low save's purple shape roll silently came back
 * as a smaller square, which reads as the deal being stingy rather than
 * as progress. The size is the rarity now and the roll is the whole of
 * it (SHAPE_ODDS).
 */

/**
 * THE MODS (mods.ts) — the whole of the module catalog the track deals,
 * and the third thing the build phase hands over.
 *
 * A FRESH SAVE OPENS THE M BUTTON ON FOUR TICKS. The whole catalog used to
 * be on offer from level one: every module in the bag, so a first run's M
 * press was as likely to turn over an ALL ROUND as a save that had earned
 * its way to the top of the track. They are dealt now, exactly as the
 * turrets and the maps are, and the opening four are the four commons —
 * one per stat, so the first mod a run buys teaches what a mod IS (a
 * chance riding every turret placed) without also asking what a sabot is.
 *
 * THE ORDER IS CHEAPEST BAND FIRST and ONE A LEVEL FROM 2, so the catalog
 * is spent by level 12 and a save arrives at the mutator phase with nothing
 * left to be handed. The three ultras close it, back to back: the bag
 * finishes strongest right where the track stops filling it. Eleven mods
 * against thirteen guns means the bag runs dry two rows before the roster
 * does, which is the right way round — a module with no gun to ride is
 * worth less than a gun with no module on it.
 *
 * THERE IS NO SECOND HALF ANY MORE. The mods used to be the FRONT half of
 * a module catalog whose back half was the relics, dealt from 16 up; the
 * relics are off the track (see the relic note below), so the mods are the
 * whole of what a level can put in a bag.
 */
export const STARTING_MODS: readonly ModId[] = ["dmg1", "rate1", "hp1", "range1"];

const MOD_UNLOCKS: Readonly<Record<number, readonly ModId[]>> = {
  // the uncommons: the four dials again, twice the step, and the repair
  2: ["dmg2"],
  3: ["rate2"],
  4: ["hp2"],
  5: ["range2"],
  6: ["regen1"],
  // the rares: a shape rather than a dial — a frame, a wall and a spear
  7: ["prototype"],
  8: ["bulwark"],
  9: ["sabot"],
  // the ultras, back to back, closing the bag
  10: ["giant"],
  11: ["sniper"],
  12: ["allround"],
};

/**
 * THE RELICS (relics.ts) ARE RESERVED, AND NO LEVEL DEALS ONE.
 *
 * They used to be the BACK HALF of the module catalog: one a level from 16
 * to the top of a 30-level track, cheapest band first, closing the
 * campaign on Ascendancy Protocol. What a relic is FOR was the late game,
 * where a wall of T5 hulls walks up the lane and a better gun has stopped
 * being an answer.
 *
 * WHY THEY CAME OFF: a relic is a RULE OVER THE WHOLE BOARD, and so is a
 * mutator. Dealing both up the back half meant one half of the track was
 * making the game harder with one hand and handing over the answer with
 * the other, on alternating rows. The back half is the mutator phase now
 * and it is only that. The relics get a door of their own, and it is not
 * this one.
 *
 * NOTHING IS DELETED AND NOTHING IS ROLLABLE. The catalog, the prices,
 * what each one does to a board, the G button, the reveal card and the
 * codex's Relics tab are all intact; what is gone is the LEVEL TABLE. So
 * relicsAt hands back an empty bag at every level — which is the pool the
 * deal draws from (game.ts relicPool), so the G button sits dark on every
 * campaign run and says "reserved" under its label (Deal.tsx HALF_SUB) —
 * and relicUnlockLevel answers past the top of the track, so the codex
 * draws all fourteen tiles and lights none of them.
 *
 * The band order the table dealt in is not lost with it: it is the order
 * RELICS itself is written in (relics.ts), commons first, which is where
 * to start when they are placed again.
 */

/** every MOD exactly once, inside the build phase — checked at import */
(() => {
  const seen = new Set<ModId>(STARTING_MODS);
  if (seen.size !== STARTING_MODS.length) throw new Error("a starting mod is dealt twice");
  for (const [level, row] of Object.entries(MOD_UNLOCKS)) {
    if (row.length === 0) throw new Error(`level ${level} opens no mod`);
    if (+level < 2 || +level > ROSTER_TOP)
      throw new Error(`the track opens a mod on level ${level}, outside the build phase (2 to ${ROSTER_TOP})`);
    for (const id of row) {
      if (seen.has(id)) throw new Error(`the track opens the mod "${id}" twice`);
      seen.add(id);
    }
  }
  for (const m of MODS)
    if (!seen.has(m.id)) throw new Error(`the track never opens the mod "${m.id}"`);
  // one module a level from 2, unbroken — the same rule the roster is dealt
  // by, and the bag simply runs out first
  Object.keys(MOD_UNLOCKS)
    .map(Number)
    .sort((a, b) => a - b)
    .forEach((l, i) => {
      if (l !== i + 2) throw new Error(`the bag skips level ${i + 2} — one mod a level from 2`);
    });
})();

/** the mods a level has dealt: the opening four and every one since */
export function modsAt(level: number): Set<ModId> {
  const out = new Set<ModId>(STARTING_MODS);
  for (const [l, row] of Object.entries(MOD_UNLOCKS))
    if (+l <= level) for (const id of row) out.add(id);
  return out;
}

/**
 * ...AND THE RELICS, WHICH NO LEVEL EVER DEALS — an empty bag at every
 * level, the top of the track included (see the relic note above). This is
 * the pool the G button rolls over (game.ts relicPool), so the empty
 * answer here is the ONE PLACE the relics are taken out of play: relics.ts
 * is untouched, and putting them back is giving this function a table
 * again.
 */
export function relicsAt(_level: number): Set<RelicId> {
  return new Set();
}

/** the level a mod joins the deal — 1 for the opening four */
export function modUnlockLevel(id: ModId): number {
  if (STARTING_MODS.includes(id)) return 1;
  for (const [l, row] of Object.entries(MOD_UNLOCKS)) if (row.includes(id)) return +l;
  return MAX_LEVEL + 1;
}

/**
 * ...and the level a relic does, which is PAST THE TOP OF THE TRACK for
 * every one of them. The codex shelves and dims its Relics tab off this
 * (unlocksOf), and a level no save can reach is what keeps all fourteen
 * tiles DRAWN — the board's promise is that everything which exists is on
 * it — and every one of them dim.
 */
export function relicUnlockLevel(_id: RelicId): number {
  return MAX_LEVEL + 1;
}

/** the roster by the level it opens on: the starting four on 1, UNLOCKS after */
function dealTurrets(): Map<number, TowerKind[]> {
  const out = new Map<number, TowerKind[]>();
  out.set(1, [...STARTING_ROSTER]);
  for (const [level, kinds] of Object.entries(UNLOCKS)) out.set(+level, [...kinds]);
  return out;
}

const TURRETS_DEALT = dealTurrets();

/** every kind exactly once, every level carrying something — checked at import */
(() => {
  const seen = new Map<TowerKind, number>();
  for (const [level, kinds] of TURRETS_DEALT)
    for (const k of kinds) {
      const had = seen.get(k);
      if (had !== undefined)
        throw new Error(`the track opens "${k}" twice, on levels ${had} and ${level}`);
      seen.set(k, level);
    }
  for (const k of seen.keys())
    if (isRetired(k))
      throw new Error(`the track opens "${k}", which is retired from the field (types.ts)`);
  for (const k of FIELDED_KINDS)
    if (!seen.has(k)) throw new Error(`the track never opens "${k}" — no level hands it out`);
  for (const [level, kinds] of Object.entries(UNLOCKS)) {
    if (kinds.length === 0) throw new Error(`level ${level} opens no turret`);
    if (+level < 2 || +level > ROSTER_TOP)
      throw new Error(`the track opens a turret on level ${level}, outside the roster phase`);
  }
  // ...AND THE ROWS ARE UNBROKEN FROM 2. One gun a level is the rule the
  // phase is dealt by, so a hole in the run is the failure to catch — the
  // roster is allowed to finish before the phase does (it does, at 14), but
  // it may not skip a row on the way there
  Object.keys(UNLOCKS)
    .map(Number)
    .sort((a, b) => a - b)
    .forEach((l, i) => {
      if (l !== i + 2) throw new Error(`the roster skips level ${i + 2} — one turret a level from 2`);
    });
})();

/** the level a turret joins the roster — 1 for the starting four */
export function turretUnlockLevel(kind: TowerKind): number {
  for (const [level, kinds] of TURRETS_DEALT) if (kinds.includes(kind)) return level;
  return 1;
}

/**
 * THE EARLIEST LEVEL AN UPGRADE TIER MAY BE DEALT ON, keyed by tier —
 * quarters of the BUILD PHASE, so a turret's fourth branch cannot land on
 * the level that hands the turret over. Shelved with dealUpgrades
 * (UPGRADES_ON_TRACK) and kept in step with ROSTER_TOP so that switching
 * it back on deals into the phase that exists rather than into the old
 * 20-level roster these numbers were written for.
 */
const TIER_FROM: Readonly<Record<number, number>> = { 1: 2, 2: 6, 3: 10, 4: 14 };

function dealUpgrades(): Map<number, UpgradeKind[]> {
  const order = new Map<TowerKind, number>(BY_MINDUSTRY_VALUE.map((k, i) => [k, i]));
  const rungs = [...ALL_UPGRADES].sort(
    (a, b) =>
      a.tier - b.tier ||
      turretUnlockLevel(a.turret) - turretUnlockLevel(b.turret) ||
      (order.get(a.turret) ?? 0) - (order.get(b.turret) ?? 0),
  );
  const levels = MAX_LEVEL - 1;
  const perLevel = Math.ceil(rungs.length / levels);
  const out = new Map<number, UpgradeKind[]>();
  for (const r of rungs) {
    let level = Math.max(2, TIER_FROM[r.tier] ?? 2, turretUnlockLevel(r.turret));
    while ((out.get(level)?.length ?? 0) >= perLevel && level < MAX_LEVEL) level++;
    const list = out.get(level) ?? [];
    list.push(r.id);
    out.set(level, list);
  }
  return out;
}

/** the upgrade rungs are switched off the track for now (see the header) */
const UPGRADES_ON_TRACK = false;

const DEALT: Map<number, UpgradeKind[]> = UPGRADES_ON_TRACK ? dealUpgrades() : new Map();

/**
 * THE ORDER A LEVEL'S REWARDS ARE READ IN, and it is the same on every
 * level of the track — REWARD_ORDER below, not the order the tables
 * happen to be written in. A row of the progress screen is scanned, not
 * read: if a map is the third chip on one level and the first on the next,
 * the eye has to re-find it every row. Fixed slots mean a player learns
 * where to look once.
 *
 * Smallest change to the board first: a turret is one more card in the
 * deal, a module is what rides it, a rule changes the fight, and a pace
 * or a MAP is a place to take all of it — so the maps come last, where a
 * row's biggest reward sits at its end.
 */
const REWARD_ORDER: readonly Reward["kind"][] = [
  "turret",
  "mod",
  "relic",
  "upgrade",
  "mutator",
  "world",
];

const rewardRank = (r: Reward): number => REWARD_ORDER.indexOf(r.kind);

/**
 * every reward a level hands out, in REWARD_ORDER.
 *
 * LEVEL 1 IS THE OPENING HAND, AND IT PRINTS EVERYTHING A FRESH SAVE
 * ALREADY OWNS. Nothing HANDS those out — the starting roster, the four
 * starting mods and the maps that were never locked are simply there from
 * the first boot — and the row used to show only the turrets, so the mods
 * and the open maps appeared on the board (unlocksOf shelves them at
 * level 1) with no row of the track that accounted for them. A player
 * reading the track top to bottom would see four guns on row 1 and a mod
 * dealt on row 2 with no explanation of the four they already had.
 *
 * So the rule for row 1 is the same rule unlocksOf uses: anything whose
 * unlock level is 1 is on it, whether the track deals it or it was never
 * locked in the first place. It is not a reward for reaching level 1 — it
 * is the inventory a save starts with, written where a player looks for
 * an inventory.
 *
 * THE SHAPES ARE STILL NOT ON IT. Every save owns all five and no reward
 * kind exists for one (see the note above on the deal's second roll) —
 * they are a property of the deal, not a thing the campaign owns.
 */
/**
 * `shelved` is what separates the two readers of this function. The
 * PROGRESS SCREEN wants what a player can actually be handed, so it takes
 * the default and the boards that are not in the game today (levels.ts
 * PLAYABLE_WORLD_IDS) are filtered out of it — a row promising a map the
 * picker will not offer is a lie about what is in the game. The IMPORT
 * CHECK below wants what the TABLES say, shelf and all, because what it
 * is guarding against is a table drifting off the seam and a shelved
 * board is not that.
 */
export function rewardsAt(level: number, shelved = false): Reward[] {
  const showWorld = (id: string): boolean => shelved || !worldHidden(id);
  const out: Reward[] = [];
  for (const id of TURRETS_DEALT.get(level) ?? []) out.push({ kind: "turret", id });
  if (level === 1) {
    for (const id of STARTING_MODS) out.push({ kind: "mod", id });
    // the VISIBLE table: a map nobody may pick is not a reward, and a
    // progress screen that promises one is lying about what is in the game
    for (const w of shelved ? WORLDS : VISIBLE_WORLDS)
      if (worldUnlockLevel(w.id) === 1) out.push({ kind: "world", worldId: w.id });
  }
  for (const id of MOD_UNLOCKS[level] ?? []) out.push({ kind: "mod", id });
  for (const id of DEALT.get(level) ?? []) out.push({ kind: "upgrade", id });
  for (const id of MUTATOR_UNLOCKS[level] ?? []) out.push({ kind: "mutator", id });
  // ...and the hand-placed rewards. PLACED itself stays WHOLE — it is what
  // worldUnlockLevel reads, and a board taken off the shelf later should
  // land on the level it was always promised for — so the shelf is applied
  // here, at the read, and never to the table.
  for (const p of PLACED)
    if (p.level === level && (p.reward.kind !== "world" || showWorld(p.reward.worldId)))
      out.push(p.reward);
  // ...and the tables are only APPROXIMATELY in that order, so sort. A
  // stable sort keeps each kind in the order its table deals it
  return out.sort((a, b) => rewardRank(a) - rewardRank(b));
}

/** the whole track, level by level, for the progress screen */
export const TRACK: readonly { level: number; rewards: Reward[] }[] = Array.from(
  { length: MAX_LEVEL },
  (_, i) => ({ level: i + 1, rewards: rewardsAt(i + 1) }),
);

/**
 * EVERY LEVEL OF THE TRACK CARRIES SOMETHING — the header's claim, checked
 * at import rather than trusted. The two phases are dense and back to back
 * now, so a bare row means a table has drifted off the seam (a mod moved
 * out of the build phase, a rule dropped, MAX_LEVEL raised past the last
 * one) and not a deliberate breather.
 *
 * IT IS CHECKED AGAINST THE TABLES AND NOT AGAINST THE SHELF
 * (rewardsAt's `shelved`). With fifteen of the seventeen boards off the
 * menu, level 15 hands out nothing a player can see — its one reward was
 * Whitepeak — and that is the shelf doing exactly what it is for, not a
 * table that has drifted. Putting the boards back fills those rows again
 * without a line moving. What this still catches is the thing it was
 * written for: a level whose tables are empty on their own.
 */
(() => {
  const authored = Array.from({ length: MAX_LEVEL }, (_, i) => ({
    level: i + 1,
    rewards: rewardsAt(i + 1, true),
  }));
  const bare = authored.filter((r) => r.rewards.length === 0).map((r) => r.level);
  if (bare.length > 0)
    throw new Error(
      `the track hands nothing out on level${bare.length > 1 ? "s" : ""} ${bare.join(", ")}`,
    );
})();

/** the mutators a level has put in the deck — empty through the whole build phase */
export function mutatorsAt(level: number): Set<MutationId> {
  const out = new Set<MutationId>();
  for (const [l, row] of Object.entries(MUTATOR_UNLOCKS))
    if (+l <= level) for (const id of row) out.add(id);
  return out;
}

/** ...and the ones it has not: what the deploy roll must leave in the bag */
export function lockedMutators(level: number): MutationId[] {
  const open = mutatorsAt(level);
  return MUTATIONS.filter((m) => !open.has(m.id)).map((m) => m.id);
}

/** the level a mutator joins the deck — MAX_LEVEL + 1 for one the track never opens */
export function mutatorUnlockLevel(id: MutationId): number {
  for (const [l, row] of Object.entries(MUTATOR_UNLOCKS)) if (row.includes(id)) return +l;
  return MAX_LEVEL + 1;
}

/**
 * IS THIS DIFFICULTY OPEN TO A SAVE AT THIS LEVEL? Only one thing is ever
 * shut: the difficulties that ROLL MUTATORS (ladder.ts — Nemesis +1 and
 * up, the ones with a rules budget), and only until the save has rules to
 * roll. A deploy that promised three mutators and drew from an empty deck
 * would be Nemesis with a longer name.
 *
 * The four named difficulties carry no rules and are open from level 1,
 * which means a fresh save can always play the whole script at full count
 * — the ladder gates the RULES, never the fight.
 */
export function difficultyOpen(level: number, rules: number): boolean {
  return rules <= 0 || level >= MUTATORS_FROM;
}

/** the level a map opens at — 1 for a map the track never names */
export function worldUnlockLevel(worldId: string): number {
  for (const p of PLACED)
    if (p.reward.kind === "world" && p.reward.worldId === worldId) return p.level;
  return 1;
}

/** the turrets a level has on the roster: the starting four and every one dealt so far */
export function turretsAt(level: number): Set<TowerKind> {
  const out = new Set<TowerKind>();
  for (let l = 1; l <= Math.min(level, MAX_LEVEL); l++)
    for (const k of TURRETS_DEALT.get(l) ?? []) out.add(k);
  return out;
}

/** every turret's upgrade points at a level — the rungs the track has dealt so far */
export function upgradesAt(level: number): Record<TowerKind, UpgradePoints> {
  const owned = new Set<UpgradeKind>();
  for (let l = 2; l <= Math.min(level, MAX_LEVEL); l++)
    for (const id of DEALT.get(l) ?? []) owned.add(id);
  return Object.fromEntries(
    TOWER_KINDS_ALL.map((k) => [
      k,
      owned.size === 0
        ? NO_UPGRADES
        : TURRET_UPGRADES[k].map((u) => (owned.has(u.id) ? 1 : 0)),
    ]),
  ) as Record<TowerKind, UpgradePoints>;
}

/** the next level that hands out anything, past `level`; null at the top */
export function nextRewardLevel(level: number): number | null {
  for (let l = level + 1; l <= MAX_LEVEL; l++) if (rewardsAt(l).length > 0) return l;
  return null;
}

/** a reward in the player's own words */
export function rewardText(r: Reward): string {
  if (r.kind === "world") return `Map: ${WORLDS.find((w) => w.id === r.worldId)?.name ?? "Unknown"}`;
  if (r.kind === "turret") return `Turret: ${TOWERS[r.id].name}`;
  if (r.kind === "mod") return `Mod: ${modName(modDef(r.id))}`;
  if (r.kind === "relic") return `Relic: ${relicDef(r.id).name}`;
  if (r.kind === "mutator") return `Mutator: ${mutationById(r.id)?.name ?? r.id}`;
  const u = upgradeDef(r.id);
  return `${TOWERS[u.turret].name}: ${u.name}`;
}

/** ...and what it does, for the hover card */
export function rewardBlurb(r: Reward): string {
  if (r.kind === "world") return "A map the campaign can be deployed on.";
  if (r.kind === "turret") return TOWER_DESC[r.id];
  if (r.kind === "mod") return modBlurb(modDef(r.id));
  if (r.kind === "relic") return relicDef(r.id).blurb;
  if (r.kind === "mutator")
    return mutationById(r.id)?.blurb ?? "";
  return upgradeDef(r.id).blurb;
}

/**
 * THE LINE UNDER A REWARD'S BLURB, and null for the rewards that have
 * nothing to add to their own sentence.
 *
 * A TURRET'S IS WHO IT SHOOTS AT, off the STOCK stats on purpose: this
 * screen is about earning the gun, and nothing on the track has been
 * upgraded yet. The in-run build card asks the sim instead (Hud.targeting),
 * which is what makes its line follow an upgrade.
 *
 * A MOD'S IS THAT COPIES STACK, which is the one thing its own sentence
 * (mods.ts modBlurb) does not already say: the blurb is the odds and the
 * stats, and this adds what a second copy buys. A relic has nothing to
 * add — it is bought once and it is on.
 */
export function rewardNote(r: Reward): string | null {
  if (r.kind === "turret") return targetingLine(TOWERS[r.id]);
  if (r.kind !== "mod") return null;
  return "Every copy adds its effect again.";
}

/** the turret's display name, as the card prints it */
export const TOWER_NAME: Readonly<Record<TowerKind, string>> = Object.fromEntries(
  TOWER_KINDS_ALL.map((k) => [k, TOWERS[k].name]),
) as Record<TowerKind, string>;

/**
 * EVERY UNLOCK IN THE GAME, FLAT — what the codex reads.
 *
 * The track is authored the other way round (a level, and what it hands
 * out), and that is the right shape for "where am I and what is next". It
 * is the wrong shape for the other question a player has, which is "what
 * is there, and when do I get it": answering that off TRACK means walking
 * every row of the track looking for the turrets. So this inverts it once, at
 * import, and every category is derived from the same source the track
 * deals from — a new turret or module appears on the board by existing.
 *
 * A reward the track never hands out (a map nobody's level opens, the
 * starting roster) reads as LEVEL 1: it is not locked, it was simply
 * always there. The SHAPES are not on this board at all: nothing deals
 * one and every save owns all five (see the shapes note above).
 */
/**
 * THE BOARD'S CATEGORIES, and there are five because the game has five
 * kinds of thing to own. MOD AND RELIC ARE TWO OF THEM: they used to be
 * one tab called "Upgrades" that lumped the two halves of the module
 * catalog together with the tech tree's rungs, which is three unrelated
 * things under a word none of them is called. There is no "upgrade"
 * category any more — nothing is dealt under that name and no tab prints
 * it (see mods.ts and relics.ts).
 */
export type UnlockKind = "world" | "turret" | "mutator" | "mod" | "relic";

export interface UnlockEntry {
  reward: Reward;
  /** the level it opens at — 1 for everything a fresh save already owns */
  level: number;
}

/**
 * WHERE ONE REWARD SITS IN ITS CATEGORY'S LADDER — the number the board
 * shelves by, and it is only ever compared against another reward of the
 * same kind.
 *
 * A turret, a mod and a relic all wear one of the four borders
 * (rarity.ts), so all three rank by it, commons first and the purples
 * last — the same direction RARITIES is written in, which is the
 * direction the border teaches. A RULE has no border but it has a
 * weight, and the weight is its rarity: the cost itself, so the light
 * ones lead and the brutal ones close, finer than the four bands the
 * hover card prints. Everything else — a map — has no ladder at all and
 * ranks flat, which leaves its category in the order it was authored in.
 *
 * The rankless sit at the END rather than the start.
 */
function rarityRank(reward: Reward): number {
  if (reward.kind === "turret") return RARITIES.indexOf(rarityDef(reward.id).id);
  if (reward.kind === "mod") return RARITIES.indexOf(modDef(reward.id).rarity);
  if (reward.kind === "relic") return RARITIES.indexOf(relicDef(reward.id).rarity);
  if (reward.kind === "mutator") return mutationCostOf(reward.id);
  return RARITIES.length;
}

/** every unlock of one category, by rarity, then soonest first */
export function unlocksOf(kind: UnlockKind): UnlockEntry[] {
  const out: UnlockEntry[] = [];
  if (kind === "world")
    for (const w of VISIBLE_WORLDS)
      out.push({ reward: { kind: "world", worldId: w.id }, level: worldUnlockLevel(w.id) });
  if (kind === "turret")
    for (const k of FIELDED_KINDS)
      out.push({ reward: { kind: "turret", id: k }, level: turretUnlockLevel(k) });
  if (kind === "mod")
    for (const m of MODS) out.push({ reward: { kind: "mod", id: m.id }, level: modUnlockLevel(m.id) });
  if (kind === "relic")
    for (const d of RELICS)
      out.push({ reward: { kind: "relic", id: d.id }, level: relicUnlockLevel(d.id) });
  if (kind === "mutator")
    for (const m of MUTATIONS)
      out.push({ reward: { kind: "mutator", id: m.id }, level: mutatorUnlockLevel(m.id) });
  // THE TECH-TREE BRANCHES ARE ON NO CATEGORY AT ALL. They are off the
  // track (UPGRADES_ON_TRACK) and they are not a category either: this
  // board has five tabs and none of them is called "Upgrades", because a
  // tab named for a word nothing in the game is called was what lumped the
  // mods, the relics and these rungs into one shelf (see UnlockKind). If a
  // rung is ever dealt again it gets a tab of its own and a name a player
  // uses, not a third tenancy on someone else's.
  // RARITY FIRST, THEN SOONEST FIRST. The board is a shelf a player reads
  // to learn what exists, and what they are learning along the way is the
  // border: a tab that runs greyish white, then blue, then amber, then
  // purple teaches the ladder by walking it, where a tab sorted by level
  // scatters the four colours and teaches nothing. Level is the tiebreak
  // inside a band, so "what is next" is still legible one band at a time.
  //
  // And within a level the order the category itself is written in —
  // FIELDED_KINDS, WORLDS, the catalogs' own. Array.sort is stable, so
  // that order survives untouched rather than falling back to whatever
  // alphabetical would have done to it.
  return out.sort((a, b) => rarityRank(a.reward) - rarityRank(b.reward) || a.level - b.level);
}

/** what a save at this level may do — the sim's and the build menu's allowance */
export function techStateFor(level: number): TechState {
  return {
    unlocked: turretsAt(level),
    mods: modsAt(level),
    relics: relicsAt(level),
    upgrades: upgradesAt(level),
  };
}
