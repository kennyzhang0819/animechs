import { targetingLine, TOWER_DESC, TOWERS } from "./constants";
import { WORLDS } from "./levels";
import { MODS, modDef, modName, oddsLine, type ModId } from "./mods";
import { RELICS, relicDef, RELIC_NOTE, type RelicId } from "./relics";
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
 * rewards: a map opens, a fast-forward pace switches on, a turret joins
 * the roster. Nothing is chosen and nothing is bought — the player levels,
 * the game hands them things, exactly as a commander levels in co-op.
 *
 * THE TRACK HAS TWO PHASES, AND THEY PULL OPPOSITE WAYS.
 *
 *   THE ROSTER PHASE, levels 1 to ROSTER_TOP. What opens here is a
 *   turret — and therefore a card in the DRAW POOL, since the deal
 *   (rarity.ts) rolls over exactly what the track has handed out. A fresh
 *   save opens with STARTING_ROSTER, the four that make a first board; the
 *   other thirteen come by UNLOCKS below. There is no gate inside a run.
 *
 *   THE MUTATOR PHASE, MUTATORS_FROM to MAX_LEVEL. What a level hands out
 *   here is a RULE, added to the deck the deploy roll draws from
 *   (MUTATOR_UNLOCKS). The reward for climbing is that the game is allowed
 *   to be harder — which is the reward a tower defence player is actually
 *   climbing for.
 *
 *   THE TWO PHASES OVERLAP ON PURPOSE. They used to be back to back, the
 *   roster finished at 14 and the rules starting at 15, so the whole track
 *   was 21 levels and every one of them carried something. It is spread
 *   out now: the three purples are levels 12, 16 and 20, the maps run to
 *   22, and the rules land on the levels between them. Every level still
 *   carries something — the modules are placed last, into whatever the
 *   guns and the maps left empty.
 *
 * AND THE MODULES ARE DEALT IN TWO HALVES, IN THAT ORDER. The mods
 * (MOD_UNLOCKS) fill the FRONT of the track, levels 2 to 14, and the
 * relics (RELIC_UNLOCKS) fill the BACK, RELICS_FROM to MAX_LEVEL. That is
 * not housekeeping, it is the two categories being two answers to two
 * halves of a campaign: a mod makes a gun better, which is the answer for
 * as long as a better gun is enough, and a relic changes a rule, which is
 * the answer once the T5 hulls arrive. The relics therefore open in the
 * same half of the track as the mutator phase and the purple turrets —
 * where the game starts being hard — and not one of them is in the bag
 * before then. A fresh save opens on four mods and no relics at all.
 *
 * THE TWO HALVES USED TO BE INTERLEAVED, a relic dealt on level 3 and the
 * pair of them alternating to the top. That put the board's biggest rules
 * in a player's hands before they had seen a second map, and it left the
 * back of the track handing out "+4% damage" against twenty thousand
 * health. The order below is the fix and it is the whole pacing of the
 * catalog: mods, then relics.
 *
 * THE UPGRADE RUNGS ARE OFF THE TRACK (UPGRADES_ON_TRACK): the branches in
 * upgrades.ts are intact and waiting to be put back somewhere. They are
 * not a third category — nothing deals one, nothing sells one, and no
 * screen groups them under a word of their own (see mods.ts: there are
 * two categories, and "upgrade" is not one of them).
 */

/** the level at which the last turret opens and the roster is complete */
export const ROSTER_TOP = 20;

/**
 * THE LEVEL THE MUTATOR PHASE OPENS, and the one gate on the ladder: the
 * difficulties that roll rules (Nemesis +1 and up) are shut until a save
 * has rules to roll. THIS NUMBER IS LOAD-BEARING — Animechs.tsx prints it
 * at a player looking at a locked difficulty — and it is the one thing on
 * the track that is not free to move.
 */
export const MUTATORS_FROM = 15;

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
 * After that it is cheapest first, every other level, threaded between the
 * two purples and the last maps rather than crowded onto consecutive ones.
 */
const MUTATOR_UNLOCKS: Readonly<Record<number, readonly MutationId[]>> = {
  // CHEAPEST FIRST, and the order is the CATALOG's (mutation.ts), which is
  // re-authored whenever the costs are — a rule that got dearer moves down
  // this table with it, or the phase would be handing out its hardest
  // rules first and calling them an opening hand
  15: ["amphibious", "shieldTowers", "volatile"],
  17: ["armored"],
  19: ["hydrophobic"],
  21: ["leadership"],
  23: ["mitosis"],
  25: ["conquest"],
  26: ["mechVirus"],
  27: ["overshields"],
  // THE TAIL RUNS BACK TO BACK, and that is the every-other-level rhythm
  // ending rather than being broken: the gaps above are where the maps,
  // modules and turrets sit, and by level 26 the track has dealt all of
  // those. A level that opens nothing at all is a level with no reason to
  // be looked at, so the dearest rules take the last rows one after
  // another rather than leaving empty ones between them.
  28: ["reconstruction"],
  29: ["speedy"],
  30: ["hungry"],
};

/** the last level that hands anything out — the bottom of the progress screen */
export const MAX_LEVEL = 30;

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
 * THE MAPS, and the spine of the campaign: one every other level through
 * the opening, then stretched out as the levels get dearer, so a save that
 * has seen everything the roster can do still has somewhere new to take
 * it. They used to be levels 2 through 9 back to back, which spent the
 * whole campaign in the first hour and left the rest of the track handing
 * out nothing a player could stand on.
 */
const PLACED: readonly { level: number; reward: Reward }[] = [
  { level: 2, reward: { kind: "world", worldId: "4" } },
  { level: 4, reward: { kind: "world", worldId: "2" } },
  { level: 6, reward: { kind: "world", worldId: "5" } },
  { level: 8, reward: { kind: "world", worldId: "6" } },
  { level: 11, reward: { kind: "world", worldId: "7" } },
  { level: 14, reward: { kind: "world", worldId: "3" } },
  { level: 18, reward: { kind: "world", worldId: "8" } },
  { level: 22, reward: { kind: "world", worldId: "9" } },
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
  // follows it keeps the middle of the track from settling into a pattern
  7: ["hive"],
  8: ["tether"],
  9: ["whirl"],
  10: ["cleaver"],
  11: ["deluge"],
  // THE PURPLES ARE SPREAD, four levels apart, and the last of them is the
  // top of the roster. A 4x4 is the thing a run is hoping the deal turns
  // over, and handing all three out on consecutive levels spent the whole
  // ceiling of the game in three clears. The gaps are the point: a save
  // plays a good while WITH the repeater before the furnace turns up
  12: ["repeater"],
  16: ["furnace"],
  20: ["railhead"],
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
 * THE MODS (mods.ts) — the front half of the module catalog, and the
 * third thing the track deals.
 *
 * A FRESH SAVE OPENS THE M BUTTON ON FOUR TICKS. The whole catalog used to
 * be on offer from level one: every module in the bag, so a first run's M
 * press was as likely to turn over an ALL ROUND as a save that had earned
 * its way to the top of the track. They are dealt now, exactly as the
 * turrets and the maps are, and the opening four are the four commons —
 * one per stat, so the first mod a run buys teaches what a mod IS (a
 * chance riding every turret placed) without also asking what a sabot is.
 *
 * THE ORDER IS CHEAPEST BAND FIRST and the whole half is dealt by level
 * 14, so a save arrives at the mutator phase with the mod catalog complete
 * and the relic catalog empty. The three ultras close it, back to back,
 * where the mod half finishes strongest right as the relic half opens.
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
  // 10 and 11 deal no mod: 11 opens the seventh map, and the gap between
  // the rares and the ultras is where the purples are spread rather than
  // stacked — the same reason UNLOCKS puts four levels between its own
  12: ["giant"],
  13: ["sniper"],
  14: ["allround"],
};

/**
 * THE RELICS (relics.ts) — the BACK half, and the one half of a corner
 * button that starts SHUT.
 *
 * RELICS_FROM IS THE WHOLE DESIGN STATEMENT. A relic changes the game and
 * costs a hundred and fifty thousand (economy.ts); what it is FOR is the
 * back half of a campaign, where a wall of T5 hulls walks up the lane and
 * a better gun has stopped being an answer. So the half opens the level
 * after the mutator phase does — where the game is first allowed to be
 * hard — and the G button prints "locked" until then. It used to open on
 * level 3, which handed a player Overclock Core before their second map.
 *
 * CHEAPEST BAND FIRST, one a level from RELICS_FROM to the TOP OF THE
 * TRACK, so the campaign's last row hands over Ascendancy Protocol — the
 * relic that changes what the deal itself deals — rather than finishing on
 * a rule with a purple stranded a row above it.
 *
 * ONE GAP, at 18, because fourteen relics do not quite fill fifteen rows.
 * It sits on a level that already opens a MAP, which is the same choice the
 * mod half makes with its own gap at 11: a row that is already carrying
 * something is the row that can afford to carry nothing else.
 */
export const RELICS_FROM = 16;

const RELIC_UNLOCKS: Readonly<Record<number, readonly RelicId[]>> = {
  // the commons: the board, turned up — and every one of them is still a
  // doubling, because a common relic is the one that comes up OFTEN and
  // not the one that does least (relics.ts)
  16: ["overclock"],
  17: ["coolant"],
  // 18 deals no relic: it opens the Riverlands (see the note above)
  19: ["scavenger"],
  // the uncommons: what a death is worth, whose ever it was
  20: ["insurance"],
  21: ["phosphor"],
  22: ["lastVolley"],
  23: ["cascade"],
  // the rares: the arithmetic of a heavy body
  24: ["phoenix"],
  25: ["twinfire"],
  26: ["monofil"],
  27: ["titan"],
  // the ultras, and the last row of the campaign is the biggest of them
  28: ["undying"],
  29: ["terminal"],
  30: ["ascendancy"],
};

/** every MOD exactly once, in the front half — checked at import */
(() => {
  const seen = new Set<ModId>(STARTING_MODS);
  if (seen.size !== STARTING_MODS.length) throw new Error("a starting mod is dealt twice");
  for (const [level, row] of Object.entries(MOD_UNLOCKS)) {
    if (row.length === 0) throw new Error(`level ${level} opens no mod`);
    if (+level < 2 || +level >= RELICS_FROM)
      throw new Error(`the track opens a mod on level ${level}, outside the mod half (2 to ${RELICS_FROM - 1})`);
    for (const id of row) {
      if (seen.has(id)) throw new Error(`the track opens the mod "${id}" twice`);
      seen.add(id);
    }
  }
  for (const m of MODS)
    if (!seen.has(m.id)) throw new Error(`the track never opens the mod "${m.id}"`);
})();

/** ...and every RELIC exactly once, in the back half, from RELICS_FROM up */
(() => {
  const seen = new Set<RelicId>();
  let first = MAX_LEVEL + 1;
  for (const [level, row] of Object.entries(RELIC_UNLOCKS)) {
    if (row.length === 0) throw new Error(`level ${level} opens no relic`);
    if (+level > MAX_LEVEL) throw new Error(`the track opens a relic on level ${level}, off the track`);
    for (const id of row) {
      if (seen.has(id)) throw new Error(`the track opens the relic "${id}" twice`);
      seen.add(id);
      first = Math.min(first, +level);
    }
  }
  for (const d of RELICS)
    if (!seen.has(d.id)) throw new Error(`the track never opens the relic "${d.id}"`);
  // A RELIC IS A LATE-GAME ANSWER AND THE TRACK HAS TO SAY SO. RELICS_FROM
  // is read by the G button, by the Deal's locked caption and by the
  // codex; a table that opened one earlier than it claims would
  // hand a relic over on a level the UI still calls shut
  if (first !== RELICS_FROM)
    throw new Error(`the first relic opens on level ${first}, and RELICS_FROM says ${RELICS_FROM}`);
})();

/** the mods a level has dealt: the opening four and every one since */
export function modsAt(level: number): Set<ModId> {
  const out = new Set<ModId>(STARTING_MODS);
  for (const [l, row] of Object.entries(MOD_UNLOCKS))
    if (+l <= level) for (const id of row) out.add(id);
  return out;
}

/** ...and the relics, which a fresh save has none of (RELICS_FROM) */
export function relicsAt(level: number): Set<RelicId> {
  const out = new Set<RelicId>();
  for (const [l, row] of Object.entries(RELIC_UNLOCKS))
    if (+l <= level) for (const id of row) out.add(id);
  return out;
}

/** the level a mod joins the deal — 1 for the opening four */
export function modUnlockLevel(id: ModId): number {
  if (STARTING_MODS.includes(id)) return 1;
  for (const [l, row] of Object.entries(MOD_UNLOCKS)) if (row.includes(id)) return +l;
  return MAX_LEVEL + 1;
}

/** ...and the level a relic does */
export function relicUnlockLevel(id: RelicId): number {
  for (const [l, row] of Object.entries(RELIC_UNLOCKS)) if (row.includes(id)) return +l;
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
  const top = Math.max(...Object.keys(UNLOCKS).map(Number));
  if (top !== ROSTER_TOP)
    throw new Error(`the last turret opens on level ${top}, and ROSTER_TOP says ${ROSTER_TOP}`);
})();

/** the level a turret joins the roster — 1 for the starting four */
export function turretUnlockLevel(kind: TowerKind): number {
  for (const [level, kinds] of TURRETS_DEALT) if (kinds.includes(kind)) return level;
  return 1;
}

const TIER_FROM: Readonly<Record<number, number>> = { 1: 2, 2: 8, 3: 14, 4: 20 };

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
export function rewardsAt(level: number): Reward[] {
  const out: Reward[] = [];
  for (const id of TURRETS_DEALT.get(level) ?? []) out.push({ kind: "turret", id });
  if (level === 1) {
    for (const id of STARTING_MODS) out.push({ kind: "mod", id });
    for (const w of WORLDS)
      if (worldUnlockLevel(w.id) === 1) out.push({ kind: "world", worldId: w.id });
  }
  for (const id of MOD_UNLOCKS[level] ?? []) out.push({ kind: "mod", id });
  for (const id of RELIC_UNLOCKS[level] ?? []) out.push({ kind: "relic", id });
  for (const id of DEALT.get(level) ?? []) out.push({ kind: "upgrade", id });
  for (const id of MUTATOR_UNLOCKS[level] ?? []) out.push({ kind: "mutator", id });
  for (const p of PLACED) if (p.level === level) out.push(p.reward);
  // ...and the tables are only APPROXIMATELY in that order, so sort. A
  // stable sort keeps each kind in the order its table deals it
  return out.sort((a, b) => rewardRank(a) - rewardRank(b));
}

/** the whole track, level by level, for the progress screen */
export const TRACK: readonly { level: number; rewards: Reward[] }[] = Array.from(
  { length: MAX_LEVEL },
  (_, i) => ({ level: i + 1, rewards: rewardsAt(i + 1) }),
);

/** the mutators a level has put in the deck — empty through the whole roster phase */
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
  if (r.kind === "mod") return modDef(r.id).blurb;
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
 * A MOD'S IS ITS ODDS (mods.ts oddsLine) and A RELIC'S IS THAT IT HAS NONE
 * (relics.ts RELIC_NOTE) — a mod is a CHANCE on every turret placed and a
 * relic is simply in force, and that difference is the one thing about a
 * module a player has to know before paying for one. A named mod says what
 * it does in numbers first, because its name is a name and the stats are
 * nowhere else on the card.
 */
export function rewardNote(r: Reward): string | null {
  if (r.kind === "turret") return targetingLine(TOWERS[r.id]);
  if (r.kind === "relic") return RELIC_NOTE;
  if (r.kind !== "mod") return null;
  const d = modDef(r.id);
  // "a copy over" rather than "per copy owned": the odds are a constant
  // now and it is the EFFECT that every copy adds again (mods.ts)
  const odds = `${oddsLine(d)}, and every copy adds its effect again`;
  return d.name && d.tweak ? `${d.tweak}. ${odds}` : odds;
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
 * twenty-three rows looking for the turrets. So this inverts it once, at
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
    for (const w of WORLDS)
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
