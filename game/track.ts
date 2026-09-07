import { WORLDS } from "./levels";
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
 * the roster, a turret gains a rung of its upgrade branch. Nothing is
 * chosen and nothing is bought — the player levels, the game hands them
 * things, exactly as a commander levels in co-op. A list the player can
 * read top to bottom is the whole progression, which is what a tree of
 * purchases never managed to be.
 *
 * THE TURRETS ARE ON THE TRACK. A fresh save opens with the seven of
 * STARTING_ROSTER — a gun for every job, duo to spectre — and the other
 * ten are dealt up the track (dealTurrets), cheapest first by Mindustry's
 * own build cost, one every third level. There is no gate inside a run
 * any more: what the save owns it may place from wave 1, and what it does
 * not own is greyed on the bar with the level that opens it.
 *
 * THE TRACK IS BUILT, NOT WRITTEN. The maps and paces are placed by hand
 * below (PLACED); the turrets and the fifty-odd upgrade rungs are dealt
 * by rule, so every level past the first hands out about two things, no
 * upgrade lands before its turret does, and no ultimate before TIER_FROM
 * says. Rewriting a rung's blurb in upgrades.ts, or adding a turret to the
 * roster, re-deals the track with no edit here.
 */

/** the top of the track — the level at which every reward is out */
export const MAX_LEVEL = 30;

export type Reward =
  | { kind: "world"; worldId: string }
  | { kind: "speed"; mult: number }
  | { kind: "turret"; id: TowerKind }
  | { kind: "upgrade"; id: UpgradeKind };

/** the rewards placed by hand — the structure of the campaign */
const PLACED: readonly { level: number; reward: Reward }[] = [
  { level: 2, reward: { kind: "speed", mult: 2 } },
  { level: 3, reward: { kind: "world", worldId: "2" } },
  { level: 5, reward: { kind: "speed", mult: 4 } },
  { level: 7, reward: { kind: "world", worldId: "3" } },
];

/**
 * WHAT A FRESH SAVE FIELDS: the seven turrets every attempt opens with.
 * One of every job — the volume gun, the flak, the artillery, the beam,
 * the burst, the long artillery and the heavy — so a first run is a whole
 * defence rather than a duo wall waiting for the track.
 */
export const STARTING_ROSTER: readonly TowerKind[] = [
  "duo",
  "scatter",
  "hail",
  "lancer",
  "salvo",
  "ripple",
  "spectre",
];

/** the first level a turret past the starting seven lands on, and the gap
 *  between the rest — ten turrets over levels 2..29, so the whole track
 *  keeps opening guns rather than the first third of it */
const TURRET_FROM = 2;
const TURRET_EVERY = 3;

/**
 * Deal the turrets the save does not start with up the track, cheapest
 * first by Mindustry's build cost (BY_MINDUSTRY_VALUE), one every
 * TURRET_EVERY levels from TURRET_FROM. Level 1 carries the starting
 * roster, so the progress screen names every gun somewhere.
 */
function dealTurrets(): Map<number, TowerKind[]> {
  const out = new Map<number, TowerKind[]>();
  out.set(1, [...STARTING_ROSTER]);
  const start = new Set(STARTING_ROSTER);
  let level = TURRET_FROM;
  for (const k of BY_MINDUSTRY_VALUE) {
    if (start.has(k)) continue;
    const at = Math.min(level, MAX_LEVEL);
    const list = out.get(at) ?? [];
    list.push(k);
    out.set(at, list);
    level += TURRET_EVERY;
  }
  return out;
}

const TURRETS_DEALT = dealTurrets();

/** the level a turret joins the roster — 1 for the starting seven */
export function turretUnlockLevel(kind: TowerKind): number {
  for (const [level, kinds] of TURRETS_DEALT) if (kinds.includes(kind)) return level;
  return 1;
}

/**
 * The first level an upgrade of each rung tier may land on: the rate-of-
 * fire style rungs from the second level, the reworks from the eighth,
 * the ammo swaps from the fourteenth and the ultimates from the twentieth
 * — so the track's back half is where the big changes live.
 */
const TIER_FROM: Readonly<Record<number, number>> = { 1: 2, 2: 8, 3: 14, 4: 20 };

/**
 * Deal the upgrade rungs across levels 2..MAX_LEVEL. Sorted by rung tier,
 * then the turret's own unlock level, then roster order; each rung lands
 * on the first level with room that is no earlier than its tier's
 * TIER_FROM and no earlier than the level its turret joins on — an
 * upgrade for a gun the save cannot place yet would be a chip that says
 * nothing.
 */
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

const DEALT = dealUpgrades();

/** every reward a level hands out: maps and paces first, then the turrets, then the rungs */
export function rewardsAt(level: number): Reward[] {
  const out: Reward[] = PLACED.filter((p) => p.level === level).map((p) => p.reward);
  for (const id of TURRETS_DEALT.get(level) ?? []) out.push({ kind: "turret", id });
  for (const id of DEALT.get(level) ?? []) out.push({ kind: "upgrade", id });
  return out;
}

/** the whole track, level by level, for the progress screen */
export const TRACK: readonly { level: number; rewards: Reward[] }[] = Array.from(
  { length: MAX_LEVEL },
  (_, i) => ({ level: i + 1, rewards: rewardsAt(i + 1) }),
);

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

/** the turrets a level has on the roster: the starting seven and every one dealt so far */
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
  const u = upgradeDef(r.id);
  return `${TOWER_NAME[u.turret]}: ${u.name}`;
}

/** the turret's display name, as the bar prints it */
export const TOWER_NAME: Readonly<Record<TowerKind, string>> = Object.fromEntries(
  TOWER_KINDS.map((k) => [k, k.charAt(0).toUpperCase() + k.slice(1)]),
) as Record<TowerKind, string>;

/**
 * WHAT A SAVE AT THIS LEVEL MAY DO, as the sim and the bar read it: the
 * turrets the track has handed out, the paces it has switched on, and
 * every upgrade rung dealt so far. The one place a level becomes a
 * TechState.
 */
export function techStateFor(level: number): TechState {
  return {
    unlocked: turretsAt(level),
    speeds: speedsAt(level),
    barSlots: TOWER_KINDS.length,
    upgrades: upgradesAt(level),
  };
}
