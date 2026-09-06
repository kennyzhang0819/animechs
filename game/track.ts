import { TOWER_TIER } from "./economy";
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
 * off it (economy.ts) is a rung on this track. Every rung hands out fixed
 * rewards: a map opens, a fast-forward pace switches on, a turret gains a
 * rung of its upgrade branch. Nothing is chosen and nothing is bought —
 * the player levels, the game hands them things, exactly as a commander
 * levels in co-op. A list the player can read top to bottom is the whole
 * progression, which is what a tree of purchases never managed to be.
 *
 * WHAT IS NOT ON THE TRACK: the turrets. Every turret is available on
 * every attempt from the first run; what keeps a fresh save off the
 * spectre is the stage gate inside the run (STAGES in economy.ts), not
 * the save. The track makes the turrets BETTER, never merely present.
 *
 * THE TRACK IS BUILT, NOT WRITTEN. The maps and paces are placed by hand
 * below (PLACED); the fifty-odd upgrade rungs are dealt across the levels
 * by rule (dealUpgrades), cheapest tier first and the roster's order
 * within a tier, so every level past the first hands out about two of
 * them and no ultimate lands before TIER_FROM says. Rewriting a rung's
 * blurb in upgrades.ts, or adding a turret to the roster, re-deals the
 * track with no edit here.
 */

/** the top of the track — the level at which every reward is out */
export const MAX_LEVEL = 30;

export type Reward =
  | { kind: "world"; worldId: string }
  | { kind: "speed"; mult: number }
  | { kind: "upgrade"; id: UpgradeKind };

/** the rewards placed by hand — the structure of the campaign */
const PLACED: readonly { level: number; reward: Reward }[] = [
  { level: 2, reward: { kind: "speed", mult: 2 } },
  { level: 3, reward: { kind: "world", worldId: "2" } },
  { level: 5, reward: { kind: "speed", mult: 4 } },
  { level: 7, reward: { kind: "world", worldId: "3" } },
];

/**
 * The first level an upgrade of each rung tier may land on: the rate-of-
 * fire style rungs from the second level, the reworks from the eighth,
 * the ammo swaps from the fourteenth and the ultimates from the twentieth
 * — so the track's back half is where the big changes live.
 */
const TIER_FROM: Readonly<Record<number, number>> = { 1: 2, 2: 8, 3: 14, 4: 20 };

/**
 * Deal the upgrade rungs across levels 2..MAX_LEVEL. Sorted by rung tier,
 * then the turret's tier, then roster order, and dealt round-robin so
 * each level takes its share, with a rung never landing before its
 * tier's TIER_FROM.
 */
function dealUpgrades(): Map<number, UpgradeKind[]> {
  const order = new Map<TowerKind, number>(BY_MINDUSTRY_VALUE.map((k, i) => [k, i]));
  const rungs = [...ALL_UPGRADES].sort(
    (a, b) =>
      a.tier - b.tier ||
      TOWER_TIER[a.turret] - TOWER_TIER[b.turret] ||
      (order.get(a.turret) ?? 0) - (order.get(b.turret) ?? 0),
  );
  const levels = MAX_LEVEL - 1;
  const perLevel = Math.ceil(rungs.length / levels);
  const out = new Map<number, UpgradeKind[]>();
  let level = 2;
  for (const r of rungs) {
    level = Math.max(level, TIER_FROM[r.tier] ?? 2);
    while ((out.get(level)?.length ?? 0) >= perLevel && level < MAX_LEVEL) level++;
    const list = out.get(level) ?? [];
    list.push(r.id);
    out.set(level, list);
  }
  return out;
}

const DEALT = dealUpgrades();

/** every reward a level hands out, maps and paces first */
export function rewardsAt(level: number): Reward[] {
  const out: Reward[] = PLACED.filter((p) => p.level === level).map((p) => p.reward);
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
  const u = upgradeDef(r.id);
  return `${TOWER_NAME[u.turret]}: ${u.name}`;
}

/** the turret's display name, as the bar prints it */
export const TOWER_NAME: Readonly<Record<TowerKind, string>> = Object.fromEntries(
  TOWER_KINDS.map((k) => [k, k.charAt(0).toUpperCase() + k.slice(1)]),
) as Record<TowerKind, string>;

/**
 * WHAT A SAVE AT THIS LEVEL MAY DO, as the sim and the bar read it: the
 * whole roster, the paces the track has switched on, and every upgrade
 * rung dealt so far. The one place a level becomes a TechState.
 */
export function techStateFor(level: number): TechState {
  return {
    unlocked: new Set<TowerKind>(TOWER_KINDS),
    speeds: speedsAt(level),
    barSlots: TOWER_KINDS.length,
    upgrades: upgradesAt(level),
  };
}
