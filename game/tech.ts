import {
  NO_UPGRADES,
  upgradedTower,
  type UpgradeContext,
  type UpgradePoints,
} from "./upgrades";
import { TOWER_KINDS, type TowerKind } from "./types";

/**
 * WHAT A RUN IS ALLOWED TO DO, as the sim and the build bar read it.
 *
 * This used to be the shape of a purchased tech tree. There is no tree
 * any more: what a save has EARNED is read off its level through the
 * track (track.ts, techStateFor). The shape survives because the sim
 * never cared where it came from — a roster, a set of paces, and every
 * turret's upgrade points.
 */
export interface TechState {
  /** the turrets a run may field: the starting seven and every one the
   *  track has handed out (track.ts, turretsAt) */
  unlocked: ReadonlySet<TowerKind>;
  /**
   * The fast-forward multipliers this save may use, ascending. 1x is
   * always in it — it is the pace the game runs at; the rest are the
   * track's paces (speedsAt).
   */
  speeds: readonly number[];
  /** how many turrets the build bar holds — the whole roster now */
  barSlots: number;
  /** each turret's upgrade rungs, as the sim folds them (upgradedTower) */
  upgrades: Record<TowerKind, UpgradePoints>;
}

export { upgradedTower, NO_UPGRADES, type UpgradeContext, type UpgradePoints };

/**
 * MINDUSTRY'S OWN PRICE FOR EACH TURRET, in a single number: the build
 * cost's items summed at Mindustry's item values. It is the roster's ORDER
 * — cheapest first is how the bar, the progress track and the balance page
 * all lay the turrets out — and nothing else reads it.
 */
export const MINDUSTRY_VALUE: Record<TowerKind, number> = {
  duo: 17.5,
  scorch: 34.5,
  hail: 37,
  arc: 60,
  scatter: 74,
  wave: 132.5,
  swarmer: 152.5,
  lancer: 157,
  salvo: 180,
  ripple: 270,
  parallax: 288,
  cyclone: 329,
  fuse: 447.5,
  tsunami: 790,
  spectre: 1552.5,
  meltdown: 1795,
  foreshadow: 2500,
};

/** the roster, cheapest first — the one order every list of turrets uses */
export const BY_MINDUSTRY_VALUE: readonly TowerKind[] = [...TOWER_KINDS].sort(
  (a, b) => (MINDUSTRY_VALUE[a] ?? 0) - (MINDUSTRY_VALUE[b] ?? 0),
);
