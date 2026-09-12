import { targetingLine, TOWER_DESC, TOWERS } from "./constants";
import { WORLDS } from "./levels";
import { MODS, modDef, modName, modsOfScope, oddsLine, type ModId } from "./mods";
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
 *   THE MODULES RUN THE WHOLE LENGTH OF IT (MOD_UNLOCKS). A mod or a
 *   relic is dealt on nearly every level from 2 up, because the deal's
 *   two other buttons are what a run actually spends its scrap on and a
 *   catalog that is whole from wave one has nothing left to give. A fresh
 *   save opens on four ticks and no relics at all.
 *
 * THE UPGRADE RUNGS ARE OFF THE TRACK (UPGRADES_ON_TRACK): the branches in
 * upgrades.ts are intact and waiting to be put back somewhere.
 */

/** the level at which the last turret opens and the roster is complete */
export const ROSTER_TOP = 20;

/**
 * THE LEVEL THE MUTATOR PHASE OPENS, and the one gate on the ladder: the
 * difficulties that roll rules (Nemesis +1 and up) are shut until a save
 * has rules to roll. THIS NUMBER IS LOAD-BEARING — MechSwarm.tsx prints it
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
  15: ["armored", "mitosis", "volatile"],
  17: ["shieldTowers"],
  19: ["overshields"],
  21: ["speedy"],
  23: ["hungry"],
  25: ["hydrophobic"],
  27: ["amphibious"],
  // THE LAST TWO RUN BACK TO BACK, and that is the every-other-level
  // rhythm ending rather than being broken: the gaps above are where the
  // maps, modules and turrets sit, and by level 28 the track has dealt all
  // of those. A level that opens nothing at all is a level with no reason
  // to be looked at, so the two dearest rules take the last two rows
  // rather than leaving an empty one between them.
  28: ["reconstruction"],
  29: ["conquest"],
};

/** the last level that hands anything out — the bottom of the progress screen */
export const MAX_LEVEL = 29;

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

export type Reward =
  | { kind: "world"; worldId: string }
  | { kind: "speed"; mult: number }
  | { kind: "turret"; id: TowerKind }
  | { kind: "module"; id: ModId }
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
 * the crowd, and the SALVO — the first gun that answers a single hard body
 * rather than a crowd, without which the first ten waves are answered by
 * putting down more duos. Everything else is dealt one a level.
 *
 * THE SPECTRE USED TO BE HERE and has been moved to the top of the track
 * (UNLOCKS, level 12). It was in the opening hand to show a new save what
 * its scrap was FOR, back when scrap bought a named turret off a shelf —
 * and the deal (rarity.ts) answers that question by itself now. Worse, an
 * ultra-rare turret in the roster from wave one is an ultra-rare turret in
 * the DRAW POOL from wave one, and the one-in-a-hundred border means
 * nothing if the board it can come out of is four commons deep.
 */
export const STARTING_ROSTER: readonly TowerKind[] = [
  "duo", "hail", "scatter", "salvo",
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
  // filled in. The two menders that used to lead this list are retired
  // (types.ts RETIRED_KINDS) and no level hands one out
  2: ["scorch"],
  3: ["arc"],
  // ...but the bands are INTERLEAVED rather than dealt in blocks. A blue
  // among the commons is the first level that changes what a board can do
  // instead of how much of it there is, and the last common lands after it
  // so the floor is still being filled in while the ceiling rises
  4: ["lancer"],
  5: ["wave"],
  6: ["ripple"],
  // the first amber comes early for the same reason, and the blue that
  // follows it keeps the middle of the track from settling into a pattern
  7: ["swarmer"],
  8: ["parallax"],
  9: ["cyclone"],
  10: ["fuse"],
  11: ["tsunami"],
  // THE PURPLES ARE SPREAD, four levels apart, and the last of them is the
  // top of the roster. A 4x4 is the thing a run is hoping the deal turns
  // over, and handing all three out on consecutive levels spent the whole
  // ceiling of the game in three clears. The gaps are the point: a save
  // plays a good while WITH the spectre before the meltdown turns up
  12: ["spectre"],
  16: ["meltdown"],
  20: ["foreshadow"],
};

/**
 * THE SHAPES ARE NOT ON THE TRACK AT ALL (formation.ts). Every save owns
 * every one of the five squares from wave one, so nothing here deals one
 * and the Unlocks board has no Shapes tab. They were dealt once — three
 * to open with and nine earned — back when a shape was an OUTLINE and
 * learning what a saltire was for was a reward in itself. A table of
 * plain squares has nothing to teach that way: gating the 6x6 behind
 * level 26 only meant a low save's purple shape roll silently came back
 * as a smaller square, which reads as the deal being stingy rather than
 * as progress. The size is the rarity now and the roll is the whole of
 * it (SHAPE_ODDS).
 */

/**
 * THE MODULES (mods.ts) — the third thing the track deals, and the one a
 * player calls "upgrades".
 *
 * A FRESH SAVE OPENS THE M BUTTON ON FOUR TICKS AND THE G BUTTON ON
 * NOTHING. The whole catalog used to be on offer from level one: twenty-
 * seven modules in the bag, so a first run's M press was as likely to turn
 * over an ALL ROUND as a save that had earned its way to the top of the
 * track, and the shelf of relics a player is climbing towards was already
 * theirs on the first wave. The modules are dealt now, exactly as the
 * turrets and the maps are, and the opening four are the four commons —
 * one per stat, so the first mod a run buys teaches what a mod IS (a
 * chance riding every turret placed) without also asking what a sabot is.
 *
 * RELICS OPEN AT RELICS_FROM, and they are the one half of a corner
 * button that starts SHUT. That is deliberate and it is said out loud: a
 * relic changes the game and costs a hundred and fifty thousand
 * (economy.ts), and a
 * save that has not yet seen its second map has no business being offered
 * one. The G button prints "locked" until the level lands.
 *
 * THE ORDER IS CHEAPEST BAND FIRST, the two halves interleaved, so a save
 * climbing the middle of the track is alternately widening what its
 * turrets can be born with and what the whole board plays under. The
 * ultras are last and spread, for the reason the purples are (UNLOCKS):
 * the thing a run hopes to turn over must not be in the bag from the
 * beginning.
 */
export const STARTING_MODS: readonly ModId[] = ["dmg1", "rate1", "hp1", "range1"];

/** the level the relic half of the catalog opens — the first `global`
 *  module on the track, and what the G button prints until then */
export const RELICS_FROM = 3;

const MOD_UNLOCKS: Readonly<Record<number, readonly ModId[]>> = {
  2: ["dmg2"],
  3: ["overclock"],
  4: ["rate2"],
  5: ["scavenger"],
  6: ["hp2"],
  7: ["coolant"],
  8: ["range2"],
  9: ["insurance"],
  // 10 deals no module: the pierce tick that used to open here is retired
  // (mods.ts — Sabot Rounds is the same idea, one band up), and the level
  // is left as a gap rather than backfilled. A module's unlock level is
  // the pacing a player has already learned; shuffling eight of them up
  // one rung to close a hole moves eight things to hide one.
  11: ["phosphor"],
  12: ["regen1"],
  13: ["prototype"],
  14: ["lastVolley"],
  // 15 is the mutator phase opening three rules at once — it deals no
  // module, because a level that hands over four things hands over none
  16: ["bulwark"],
  17: ["phoenix"],
  18: ["sabot"],
  19: ["twinfire"],
  21: ["splitter"],
  23: ["giant"],
  24: ["undying"],
  25: ["sniper"],
  26: ["ascendancy"],
  27: ["allround"],
};

/** every module exactly once, and the relic gate where it says — checked at import */
(() => {
  const seen = new Set<ModId>(STARTING_MODS);
  if (seen.size !== STARTING_MODS.length) throw new Error("a starting module is dealt twice");
  for (const id of STARTING_MODS)
    if (modDef(id).scope !== "turret")
      throw new Error(`the save opens with the relic "${id}" — relics are earned (RELICS_FROM)`);
  let firstRelic = MAX_LEVEL + 1;
  for (const [level, row] of Object.entries(MOD_UNLOCKS)) {
    if (row.length === 0) throw new Error(`level ${level} opens no module`);
    if (+level < 2 || +level > MAX_LEVEL)
      throw new Error(`the track opens a module on level ${level}, off the track`);
    for (const id of row) {
      if (seen.has(id)) throw new Error(`the track opens the module "${id}" twice`);
      seen.add(id);
      if (modDef(id).scope === "global") firstRelic = Math.min(firstRelic, +level);
    }
  }
  for (const m of MODS)
    if (!seen.has(m.id)) throw new Error(`the track never opens the module "${m.id}"`);
  if (firstRelic !== RELICS_FROM)
    throw new Error(`the first relic opens on level ${firstRelic}, and RELICS_FROM says ${RELICS_FROM}`);
})();

/** the modules a level has dealt: the opening four and every one since */
export function modsAt(level: number): Set<ModId> {
  const out = new Set<ModId>(STARTING_MODS);
  for (const [l, row] of Object.entries(MOD_UNLOCKS))
    if (+l <= level) for (const id of row) out.add(id);
  return out;
}

/** the level a module joins the deal — 1 for the opening four */
export function modUnlockLevel(id: ModId): number {
  if (STARTING_MODS.includes(id)) return 1;
  for (const [l, row] of Object.entries(MOD_UNLOCKS)) if (row.includes(id)) return +l;
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
  "module",
  "upgrade",
  "mutator",
  "speed",
  "world",
];

const rewardRank = (r: Reward): number => REWARD_ORDER.indexOf(r.kind);

/** every reward a level hands out, in REWARD_ORDER */
export function rewardsAt(level: number): Reward[] {
  const out: Reward[] = [];
  for (const id of TURRETS_DEALT.get(level) ?? []) out.push({ kind: "turret", id });
  for (const id of MOD_UNLOCKS[level] ?? []) out.push({ kind: "module", id });
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

/** the fast-forward paces a level has switched on, ascending, 1x included */
export function speedsAt(level: number): number[] {
  const out = [1];
  for (const p of PLACED)
    if (p.reward.kind === "speed" && p.level <= level) out.push(p.reward.mult);
  return out.sort((a, b) => a - b);
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
  if (r.kind === "speed") return `${r.mult}x speed`;
  if (r.kind === "turret") return `Turret: ${TOWER_NAME[r.id]}`;
  if (r.kind === "module") {
    const d = modDef(r.id);
    return `${d.scope === "global" ? "Relic" : "Mod"}: ${modName(d)}`;
  }
  if (r.kind === "mutator") return `Mutator: ${mutationById(r.id)?.name ?? r.id}`;
  const u = upgradeDef(r.id);
  return `${TOWER_NAME[u.turret]}: ${u.name}`;
}

/** ...and what it does, for the hover card */
export function rewardBlurb(r: Reward): string {
  if (r.kind === "world") return "A map the campaign can be deployed on.";
  if (r.kind === "speed") return `Fast-forward: a run may be played at ${r.mult}x pace from the strip under the wave panel.`;
  if (r.kind === "turret") return TOWER_DESC[r.id];
  if (r.kind === "module") return modDef(r.id).blurb;
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
 * A MODULE'S IS ITS ODDS (mods.ts oddsLine) — a mod is a CHANCE on every
 * turret placed and a relic is in force the moment it is bought, and that
 * difference is the one thing about a module a player has to know before
 * paying for one. A named mod says what it does in numbers first, because
 * its name is a name and the stats are nowhere else on the card.
 */
export function rewardNote(r: Reward): string | null {
  if (r.kind === "turret") return targetingLine(TOWERS[r.id]);
  if (r.kind !== "module") return null;
  const d = modDef(r.id);
  // "a copy over" rather than "per copy owned": the odds are a constant
  // now and it is the EFFECT that every copy adds again (mods.ts)
  const odds = oddsLine(d) + (d.scope === "turret" ? ", and every copy adds its effect again" : "");
  return d.name && d.tweak ? `${d.tweak}. ${odds}` : odds;
}

/** the turret's display name, as the card prints it */
export const TOWER_NAME: Readonly<Record<TowerKind, string>> = Object.fromEntries(
  TOWER_KINDS_ALL.map((k) => [k, TOWERS[k].name]),
) as Record<TowerKind, string>;

/**
 * EVERY UNLOCK IN THE GAME, FLAT — what the Unlocks board reads.
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
export type UnlockKind = "world" | "turret" | "mutator" | "upgrade";

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
 * A turret and a module both wear one of the four borders
 * (rarity.ts), so both rank by it, commons first and the purples
 * last — the same direction RARITIES is written in, which is the
 * direction the border teaches. A RULE has no border but it has a
 * weight, and the weight is its rarity: the cost itself, so the light
 * ones lead and the brutal ones close, finer than the four bands the
 * hover card prints. Everything else — a map — has no ladder at all and
 * ranks flat, which leaves its category in the order it was authored in.
 *
 * The rankless sit at the END rather than the start, so the day the tech
 * tree's branches join the upgrade tab they fall in behind the twenty
 * modules instead of ahead of the commons.
 */
function rarityRank(reward: Reward): number {
  if (reward.kind === "turret") return RARITIES.indexOf(rarityDef(reward.id).id);
  if (reward.kind === "module") return RARITIES.indexOf(modDef(reward.id).rarity);
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
  // MODS BEFORE RELICS, the order the corner's two buttons read in — the
  // sort below is stable, so inside a level that order survives
  if (kind === "upgrade")
    for (const scope of ["turret", "global"] as const)
      for (const m of modsOfScope(scope))
        out.push({ reward: { kind: "module", id: m.id }, level: modUnlockLevel(m.id) });
  if (kind === "mutator")
    for (const m of MUTATIONS)
      out.push({ reward: { kind: "mutator", id: m.id }, level: mutatorUnlockLevel(m.id) });
  // THE TECH-TREE BRANCHES ARE OFF THE TRACK (UPGRADES_ON_TRACK): they
  // are written, folded and waiting, and nothing deals one — so they add
  // nothing to the category, which the modules above fill on their own.
  if (kind === "upgrade" && UPGRADES_ON_TRACK)
    for (const u of ALL_UPGRADES) {
      let level = MAX_LEVEL + 1;
      for (const [l, ids] of DEALT) if (ids.includes(u.id)) level = l;
      out.push({ reward: { kind: "upgrade", id: u.id }, level });
    }
  // RARITY FIRST, THEN SOONEST FIRST. The board is a shelf a player reads
  // to learn what exists, and what they are learning along the way is the
  // border: a tab that runs greyish white, then blue, then amber, then
  // purple teaches the ladder by walking it, where a tab sorted by level
  // scatters the four colours and teaches nothing. Level is the tiebreak
  // inside a band, so "what is next" is still legible one band at a time.
  //
  // And within a level the order the category itself is written in —
  // FIELDED_KINDS, WORLDS, mods before relics. Array.sort is stable, so
  // that order survives untouched rather than falling back to whatever
  // alphabetical would have done to it.
  return out.sort((a, b) => rarityRank(a.reward) - rarityRank(b.reward) || a.level - b.level);
}

/** what a save at this level may do — the sim's and the build menu's allowance */
export function techStateFor(level: number): TechState {
  return {
    unlocked: turretsAt(level),
    speeds: speedsAt(level),
    mods: modsAt(level),
    upgrades: upgradesAt(level),
  };
}
