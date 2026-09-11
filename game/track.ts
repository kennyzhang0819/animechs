import { targetingLine, TOWER_DESC, TOWERS } from "./constants";
import {
  FORMATION_IDS,
  formationCount,
  formationDef,
  formationRarity,
  type FormationId,
} from "./formation";
import { WORLDS } from "./levels";
import { MUTATIONS, mutationById, type MutationId } from "./mutation";
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
 *   THE ROSTER PHASE, levels 1 to ROSTER_TOP. Every level opens a new
 *   turret, and at the top of it the save owns the whole roster — which
 *   is also the whole DRAW POOL, since the deal (rarity.ts) rolls over
 *   exactly what the track has handed out. A fresh save opens with
 *   STARTING_ROSTER, the four that make a first board; the other thirteen
 *   come one a level by UNLOCKS below. There is no gate inside a run.
 *
 *   THE MUTATOR PHASE, ROSTER_TOP + 1 to MAX_LEVEL. There is nothing left
 *   to build, so what a level hands out is a RULE: one mutator a level,
 *   lightest first, added to the deck the deploy roll draws from
 *   (MUTATOR_UNLOCKS). The reward for climbing is that the game is allowed
 *   to be harder — which is the reward a tower defence player is actually
 *   climbing for.
 *
 * THE UPGRADE RUNGS ARE OFF THE TRACK (UPGRADES_ON_TRACK): the branches in
 * upgrades.ts are intact and waiting to be put back somewhere.
 */

/** the level at which the last turret opens and the roster is complete */
export const ROSTER_TOP = 14;

/**
 * THE RULES, LIGHTEST FIRST, one level a row from ROSTER_TOP + 1.
 *
 * THE FIRST ROW IS A POOL AND NOT A RULE. A deploy above Nemesis rolls
 * several mutators to fit a points budget (mutation.ts), and a deck with
 * ONE card in it does not roll — it deals the same rule every run, which
 * is the opposite of what the mutator phase is for. The level that opens
 * the phase therefore opens the whole LIGHT band at once, three rules the
 * first mutator-bearing difficulty can actually afford, and a run above
 * Nemesis is a different run from its first outing.
 *
 * After that it is one a level, cheapest first, up to the one Brutal rule
 * in the catalog.
 */
const MUTATOR_UNLOCKS: readonly (readonly MutationId[])[] = [
  /* 15 */ ["armored", "mitosis", "volatile"],
  /* 16 */ ["shieldTowers"],
  /* 17 */ ["overshields"],
  /* 18 */ ["speedy"],
  /* 19 */ ["hungry"],
  /* 20 */ ["hydrophobic"],
  /* 21 */ ["amphibious"],
];

export const MAX_LEVEL = ROSTER_TOP + MUTATOR_UNLOCKS.length;

/**
 * THE LEVEL THE MUTATOR PHASE OPENS, and the one gate on the ladder: the
 * difficulties that roll rules (Nemesis +1 and up) are shut until a save
 * has rules to roll. Nothing prints this number at a player — a locked
 * difficulty is simply locked, and the level it opens at is the progress
 * screen's business.
 */
export const MUTATORS_FROM = ROSTER_TOP + 1;

/** THE CATALOG IS DEALT WHOLE, ONCE EACH — checked at import */
(() => {
  const seen = new Set<MutationId>();
  for (const row of MUTATOR_UNLOCKS)
    for (const id of row) {
      if (!mutationById(id)) throw new Error(`the track opens "${id}", which is not a mutator`);
      if (seen.has(id)) throw new Error(`the track opens the mutator "${id}" twice`);
      seen.add(id);
    }
  for (const m of MUTATIONS)
    if (!seen.has(m.id)) throw new Error(`the track never opens the mutator "${m.id}"`);
  if (MUTATOR_UNLOCKS[0].length < 2)
    throw new Error("the mutator phase opens with one rule — a deck of one does not roll");
  MUTATOR_UNLOCKS.forEach((row, i) => {
    if (row.length === 0) throw new Error(`level ${MUTATORS_FROM + i} opens no rule`);
  });
})();

export type Reward =
  | { kind: "world"; worldId: string }
  | { kind: "speed"; mult: number }
  | { kind: "turret"; id: TowerKind }
  | { kind: "shape"; id: FormationId }
  | { kind: "mutator"; id: MutationId }
  | { kind: "upgrade"; id: UpgradeKind };

/** the rewards placed by hand — the structure of the campaign */
const PLACED: readonly { level: number; reward: Reward }[] = [
  { level: 2, reward: { kind: "world", worldId: "4" } },
  { level: 3, reward: { kind: "world", worldId: "2" } },
  { level: 4, reward: { kind: "world", worldId: "5" } },
  { level: 5, reward: { kind: "world", worldId: "6" } },
  { level: 6, reward: { kind: "world", worldId: "7" } },
  { level: 7, reward: { kind: "world", worldId: "3" } },
  { level: 8, reward: { kind: "world", worldId: "8" } },
  { level: 9, reward: { kind: "world", worldId: "9" } },
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
const UNLOCKS: readonly (readonly TowerKind[])[] = [
  // THE COMMONS FIRST, because every one of them widens the floor of the
  // draw rather than its ceiling: the opening levels are where a save
  // learns what the deal FEELS like, and it should feel like a board being
  // filled in. The two menders that used to lead this list are retired
  // (types.ts RETIRED_KINDS) and no level hands one out
  /*  2 */ ["scorch"],
  /*  3 */ ["arc"],
  /*  4 */ ["wave"],
  // the blues, one a level: each is an answer the commons cannot give
  /*  5 */ ["lancer"],
  /*  6 */ ["ripple"],
  /*  7 */ ["parallax"],
  // ...and the ambers threaded through them, so the middle of the track is
  // where a draw stops being predictable
  /*  8 */ ["swarmer"],
  /*  9 */ ["cyclone"],
  /* 10 */ ["fuse"],
  /* 11 */ ["tsunami"],
  // THE PURPLES LAST, one a level, and the track ends on them. A 4x4 is
  // the thing a run is hoping the deal turns over, and a save has to have
  // earned the right to be hoping for it
  /* 12 */ ["spectre"],
  /* 13 */ ["meltdown"],
  /* 14 */ ["foreshadow"],
];

/**
 * THE OPENING SHAPES (formation.ts): a small solid, a bigger solid, and
 * the one that is bigger again. Three blocks and nothing clever — the
 * first thing a save has to learn is what a formation IS, which is "the
 * card puts down a patch of turrets, not a turret", and three squares of
 * four, nine and sixteen teach that without also asking what a saltire is
 * for. Every shape with a hole in it is earned.
 */
export const STARTING_SHAPES: readonly FormationId[] = ["quad", "block", "grid"];

/**
 * ...and the other nine, one a level, smallest first — which is also
 * rarest-last, since a shape's band is read off its cell count
 * (formationRarity). They are threaded through the turret levels rather
 * than given a phase of their own: a level that opens a gun AND a shape
 * is a level that changes what the corner can do twice, and the roster
 * phase is short enough to carry both.
 */
const SHAPE_UNLOCKS: Readonly<Record<number, FormationId>> = {
  2: "cross",
  3: "saltire",
  4: "wedge",
  5: "ring",
  6: "snowflake",
  8: "octagon",
  10: "bastion",
  12: "rampart",
  14: "citadel",
};

/** every shape exactly once, none dealt before the save can use it — checked at import */
(() => {
  const seen = new Set<FormationId>(STARTING_SHAPES);
  if (seen.size !== STARTING_SHAPES.length) throw new Error("a starting shape is dealt twice");
  for (const [level, id] of Object.entries(SHAPE_UNLOCKS)) {
    if (seen.has(id)) throw new Error(`the track opens the shape "${id}" twice`);
    if (+level < 2 || +level > ROSTER_TOP)
      throw new Error(`the track opens "${id}" on level ${level}, outside the roster phase`);
    seen.add(id);
  }
  for (const id of FORMATION_IDS)
    if (!seen.has(id)) throw new Error(`the track never opens the shape "${id}"`);
})();

/** the shapes a level has dealt: the starting three and every one since */
export function shapesAt(level: number): Set<FormationId> {
  const out = new Set<FormationId>(STARTING_SHAPES);
  for (const [l, id] of Object.entries(SHAPE_UNLOCKS)) if (+l <= level) out.add(id);
  return out;
}

/** the level a shape joins the deal — 1 for the starting three */
export function shapeUnlockLevel(id: FormationId): number {
  if (STARTING_SHAPES.includes(id)) return 1;
  for (const [l, s] of Object.entries(SHAPE_UNLOCKS)) if (s === id) return +l;
  return MAX_LEVEL + 1;
}

/** the roster by the level it opens on: the starting four on 1, UNLOCKS after */
function dealTurrets(): Map<number, TowerKind[]> {
  const out = new Map<number, TowerKind[]>();
  out.set(1, [...STARTING_ROSTER]);
  UNLOCKS.forEach((kinds, i) => out.set(i + 2, [...kinds]));
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
  if (UNLOCKS.length !== ROSTER_TOP - 1)
    throw new Error(
      `UNLOCKS covers levels 2-${UNLOCKS.length + 1}; the roster phase runs to ${ROSTER_TOP}`,
    );
  UNLOCKS.forEach((kinds, i) => {
    if (kinds.length === 0) throw new Error(`level ${i + 2} opens nothing`);
  });
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

/** every reward a level hands out: maps and paces first, then the turrets, then the rungs */
export function rewardsAt(level: number): Reward[] {
  const out: Reward[] = PLACED.filter((p) => p.level === level).map((p) => p.reward);
  for (const id of TURRETS_DEALT.get(level) ?? []) out.push({ kind: "turret", id });
  const shape = SHAPE_UNLOCKS[level];
  if (shape) out.push({ kind: "shape", id: shape });
  for (const id of MUTATOR_UNLOCKS[level - MUTATORS_FROM] ?? [])
    out.push({ kind: "mutator", id });
  for (const id of DEALT.get(level) ?? []) out.push({ kind: "upgrade", id });
  return out;
}

/** the whole track, level by level, for the progress screen */
export const TRACK: readonly { level: number; rewards: Reward[] }[] = Array.from(
  { length: MAX_LEVEL },
  (_, i) => ({ level: i + 1, rewards: rewardsAt(i + 1) }),
);

/** the mutators a level has put in the deck — empty through the whole roster phase */
export function mutatorsAt(level: number): Set<MutationId> {
  const rows = Math.max(0, Math.min(level, MAX_LEVEL) - ROSTER_TOP);
  return new Set(MUTATOR_UNLOCKS.slice(0, rows).flat());
}

/** ...and the ones it has not: what the deploy roll must leave in the bag */
export function lockedMutators(level: number): MutationId[] {
  const open = mutatorsAt(level);
  return MUTATIONS.filter((m) => !open.has(m.id)).map((m) => m.id);
}

/** the level a mutator joins the deck — MAX_LEVEL + 1 for one the track never opens */
export function mutatorUnlockLevel(id: MutationId): number {
  const i = MUTATOR_UNLOCKS.findIndex((row) => row.includes(id));
  return i < 0 ? MAX_LEVEL + 1 : MUTATORS_FROM + i;
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
  if (r.kind === "shape") return `Shape: ${formationDef(r.id).name}`;
  if (r.kind === "mutator") return `Mutator: ${mutationById(r.id)?.name ?? r.id}`;
  const u = upgradeDef(r.id);
  return `${TOWER_NAME[u.turret]}: ${u.name}`;
}

/** ...and what it does, for the hover card */
export function rewardBlurb(r: Reward): string {
  if (r.kind === "world") return "A map the campaign can be deployed on.";
  if (r.kind === "speed") return `Fast-forward: a run may be played at ${r.mult}x pace from the strip under the wave panel.`;
  if (r.kind === "turret") return TOWER_DESC[r.id];
  if (r.kind === "shape") {
    const f = formationDef(r.id);
    return `A formation of ${formationCount(r.id)} turrets on a ${f.w}x${f.h} grid.`;
  }
  if (r.kind === "mutator")
    return `${mutationById(r.id)?.blurb ?? ""} From here on a run may roll it.`;
  return upgradeDef(r.id).blurb;
}

/**
 * WHO A TURRET REWARD SHOOTS AT — the line the progress card prints under
 * the blurb, and null for every reward that is not a turret. It reads the
 * STOCK stats on purpose: this screen is about earning the gun, and nothing
 * on the track has been upgraded yet. The in-run build card asks the sim
 * instead (Hud.targeting), which is what makes its line follow an upgrade.
 */
export function rewardTargeting(r: Reward): string | null {
  return r.kind === "turret" ? targetingLine(TOWERS[r.id]) : null;
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
 * deals from — a new turret or shape appears on the board by existing.
 *
 * A reward the track never hands out (a map nobody's level opens, the
 * starting roster, the starting shapes) reads as LEVEL 1: it is not
 * locked, it was simply always there.
 */
export type UnlockKind = "world" | "turret" | "shape" | "mutator" | "upgrade";

export interface UnlockEntry {
  reward: Reward;
  /** the level it opens at — 1 for everything a fresh save already owns */
  level: number;
}

/** every unlock of one category, soonest first, then by name */
export function unlocksOf(kind: UnlockKind): UnlockEntry[] {
  const out: UnlockEntry[] = [];
  if (kind === "world")
    for (const w of WORLDS)
      out.push({ reward: { kind: "world", worldId: w.id }, level: worldUnlockLevel(w.id) });
  if (kind === "turret")
    for (const k of FIELDED_KINDS)
      out.push({ reward: { kind: "turret", id: k }, level: turretUnlockLevel(k) });
  if (kind === "shape")
    for (const f of FORMATION_IDS)
      out.push({ reward: { kind: "shape", id: f }, level: shapeUnlockLevel(f) });
  if (kind === "mutator")
    for (const m of MUTATIONS)
      out.push({ reward: { kind: "mutator", id: m.id }, level: mutatorUnlockLevel(m.id) });
  // THE UPGRADE BRANCHES ARE OFF THE TRACK (UPGRADES_ON_TRACK): they are
  // written, folded and waiting, and nothing deals one — so the category
  // is deliberately EMPTY rather than a shelf of rungs a player can never
  // reach. The board says so in words where the tiles would be.
  if (kind === "upgrade" && UPGRADES_ON_TRACK)
    for (const u of ALL_UPGRADES) {
      let level = MAX_LEVEL + 1;
      for (const [l, ids] of DEALT) if (ids.includes(u.id)) level = l;
      out.push({ reward: { kind: "upgrade", id: u.id }, level });
    }
  // SOONEST FIRST, and within a level the order the category itself is
  // written in — FIELDED_KINDS, FORMATION_IDS, WORLDS. Array.sort is
  // stable, so that order survives untouched, which is what puts the
  // shapes smallest-first instead of alphabetical (a level-1 shelf
  // reading Block, Grid, Quad tells a player nothing; 4, 9, 16 does)
  return out.sort((a, b) => a.level - b.level);
}

/** what a save at this level may do — the sim's and the build menu's allowance */
export function techStateFor(level: number): TechState {
  return {
    unlocked: turretsAt(level),
    shapes: shapesAt(level),
    speeds: speedsAt(level),
    upgrades: upgradesAt(level),
  };
}

/** a shape reward's band, for the chip that wears it */
export const rewardShapeRarity = formationRarity;
