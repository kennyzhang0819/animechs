import { targetingLine, TOWER_DESC, TOWERS } from "./constants";
import { WORLDS } from "./levels";
import { MUTATIONS, mutationById, type MutationId } from "./mutation";
import { BY_MINDUSTRY_VALUE, type TechState } from "./tech";
import { TOWER_KINDS, type TowerKind } from "./types";
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
 *   turret, and at the top of it the save owns the whole card. A fresh
 *   save opens with STARTING_ROSTER, the three that make a first board;
 *   the other fourteen are handed out one a level by UNLOCKS below. There
 *   is no gate inside a run: what the save owns it may place from wave 1.
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

/** the level at which the last turret opens and the card is complete */
export const ROSTER_TOP = 15;

/** one rule a level, LIGHTEST FIRST, from ROSTER_TOP + 1 */
const MUTATOR_UNLOCKS: readonly MutationId[] = [
  /* 16 */ "armored",
  /* 17 */ "mitosis",
  /* 18 */ "volatile",
  /* 19 */ "shieldTowers",
  /* 20 */ "overshields",
  /* 21 */ "speedy",
  /* 22 */ "hungry",
  /* 23 */ "hydrophobic",
  /* 24 */ "amphibious",
];

export const MAX_LEVEL = ROSTER_TOP + MUTATOR_UNLOCKS.length;

/** THE CATALOG IS DEALT WHOLE, ONCE EACH — checked at import */
(() => {
  const seen = new Set<MutationId>();
  for (const id of MUTATOR_UNLOCKS) {
    if (!mutationById(id)) throw new Error(`the track opens "${id}", which is not a mutator`);
    if (seen.has(id)) throw new Error(`the track opens the mutator "${id}" twice`);
    seen.add(id);
  }
  for (const m of MUTATIONS)
    if (!seen.has(m.id)) throw new Error(`the track never opens the mutator "${m.id}"`);
})();

export type Reward =
  | { kind: "world"; worldId: string }
  | { kind: "speed"; mult: number }
  | { kind: "turret"; id: TowerKind }
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
 * THE FIRST BOARD: a gun for the ground, a gun for the air, and artillery
 * for the crowd — plus the two that decide whether the opening is a board
 * or a shooting gallery. The SALVO is the first gun that answers a single
 * hard body rather than a crowd, and without one in hand the first ten
 * waves are answered by putting down more duos; the SPECTRE is the ceiling
 * the whole run is read against, and a save that has never seen one does
 * not know what its scrap is FOR. Everything else is dealt one a level.
 */
export const STARTING_ROSTER: readonly TowerKind[] = [
  "duo", "hail", "scatter", "salvo", "spectre",
];

/**
 * THE ROSTER IS WRITTEN, THE REST IS PLACED. A hand-authored order because
 * the shape of the opening — which gun answers which wave — is a design
 * decision and not an arithmetic on build cost. Index 0 is level 2.
 */
const UNLOCKS: readonly (readonly TowerKind[])[] = [
  // the mender first, and deliberately: the opening five are all guns, so
  // the first thing a level teaches is that a line can be KEPT rather than
  // rebuilt — and it is the one block whose worth a player can read off a
  // board they already know
  /*  2 */ ["mender"],
  /*  3 */ ["lancer"],
  /*  4 */ ["ripple"],
  /*  5 */ ["scorch"],
  /*  6 */ ["arc"],
  /*  7 */ ["wave"],
  /*  8 */ ["swarmer"],
  // ...and its big brother at the halfway mark, where the guns it is
  // nursing start costing more than the block that keeps them standing
  /*  9 */ ["mendProjector"],
  /* 10 */ ["parallax"],
  /* 11 */ ["cyclone"],
  /* 12 */ ["fuse"],
  /* 13 */ ["tsunami"],
  /* 14 */ ["meltdown"],
  /* 15 */ ["foreshadow"],
];

/** the roster by the level it opens on: the starting three on 1, UNLOCKS after */
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
  for (const k of TOWER_KINDS)
    if (!seen.has(k)) throw new Error(`the track never opens "${k}" — no level hands it out`);
  if (UNLOCKS.length !== ROSTER_TOP - 1)
    throw new Error(
      `UNLOCKS covers levels 2-${UNLOCKS.length + 1}; the roster phase runs to ${ROSTER_TOP}`,
    );
  UNLOCKS.forEach((kinds, i) => {
    if (kinds.length === 0) throw new Error(`level ${i + 2} opens nothing`);
  });
})();

/** the level a turret joins the roster — 1 for the starting three */
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
  const mut = MUTATOR_UNLOCKS[level - ROSTER_TOP - 1];
  if (mut) out.push({ kind: "mutator", id: mut });
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
  return new Set(MUTATOR_UNLOCKS.slice(0, Math.max(0, Math.min(level, MAX_LEVEL) - ROSTER_TOP)));
}

/** ...and the ones it has not: what the deploy roll must leave in the bag */
export function lockedMutators(level: number): MutationId[] {
  const open = mutatorsAt(level);
  return MUTATIONS.filter((m) => !open.has(m.id)).map((m) => m.id);
}

/** the level a mutator joins the deck — MAX_LEVEL + 1 for one the track never opens */
export function mutatorUnlockLevel(id: MutationId): number {
  const i = MUTATOR_UNLOCKS.indexOf(id);
  return i < 0 ? MAX_LEVEL + 1 : ROSTER_TOP + 1 + i;
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

/** the turrets a level has on the roster: the starting three and every one dealt so far */
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
    TOWER_KINDS.map((k) => [
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
  if (r.kind === "world") return `${WORLDS.find((w) => w.id === r.worldId)?.name ?? "A map"} opens`;
  if (r.kind === "speed") return `${r.mult}x speed`;
  if (r.kind === "turret") return `Turret: ${TOWER_NAME[r.id]}`;
  if (r.kind === "mutator") return `Mutator: ${mutationById(r.id)?.name ?? r.id}`;
  const u = upgradeDef(r.id);
  return `${TOWER_NAME[u.turret]}: ${u.name}`;
}

/** ...and what it does, for the hover card */
export function rewardBlurb(r: Reward): string {
  if (r.kind === "world") return "Unlocks a new map ";
  if (r.kind === "speed") return `Fast-forward: a run may be played at ${r.mult}x pace from the strip under the wave panel.`;
  if (r.kind === "turret") return TOWER_DESC[r.id];
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
  TOWER_KINDS.map((k) => [k, TOWERS[k].name]),
) as Record<TowerKind, string>;

/** what a save at this level may do — the sim's and the build menu's allowance */
export function techStateFor(level: number): TechState {
  return {
    unlocked: turretsAt(level),
    speeds: speedsAt(level),
    upgrades: upgradesAt(level),
  };
}
