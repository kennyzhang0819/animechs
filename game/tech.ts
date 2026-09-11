import {
  NO_UPGRADES,
  upgradedTower,
  type UpgradeContext,
  type UpgradePoints,
} from "./upgrades";
import { TOWER_KINDS, type TowerKind } from "./types";

/**
 * WHAT A SAVE MAY DO IN A RUN — the shape the sim and the build menu read
 * a save's allowances in. The level track (track.ts) hands one out for a
 * level (techStateFor); the sandbox lifts it altogether (Sim.setTech with
 * null).
 */
export interface TechState {
  /** the turrets the save owns — what the track has dealt so far */
  unlocked: ReadonlySet<TowerKind>;
  /** the fast-forward paces switched on, ascending, 1x included */
  speeds: readonly number[];
  /** each turret's upgrade rungs, as the sim folds them (upgradedTower) */
  upgrades: Record<TowerKind, UpgradePoints>;
}

export { upgradedTower, NO_UPGRADES, type UpgradeContext, type UpgradePoints };

/**
 * THE BUILD MENU is a command card: a fixed grid in the bottom-right
 * corner, one turret a slot, and a key on every slot.
 */
export interface BuildSlot {
  kind: TowerKind;
  /** the printed key, worn on the slot; `code` is the physical one */
  key: string;
  code: string;
}

/** how wide the grid is — the rows are this long */
export const BUILD_COLS = 4;

/**
 * THE KEYS, in the grid's reading order — row by row, dodging the digits
 * and WASD (the camera). Seventeen turrets need five rows of four.
 */
const GRID_KEYS: readonly string[] = [
  "Q", "E", "R", "T",
  "F", "G", "H", "J",
  "Z", "X", "C", "V",
  "Y", "U", "I", "O",
  "B", "N", "M", "P",
];

/**
 * THE CARD'S ORDER: cheapest first, by Mindustry's own build cost — the
 * one order every list of turrets in the game uses (BY_MINDUSTRY_VALUE),
 * so the tier-1 guns fill the top rows and the phase tier the bottom.
 */
export const MINDUSTRY_VALUE: Record<TowerKind, number> = {
  duo: 17.5,
  scorch: 34.5,
  hail: 37,
  arc: 60,
  scatter: 74,
  wave: 132.5,
  // lead 30 + silicon 20, and lead 100 + titanium 25 + silicon 40
  mender: 37,
  mendProjector: 145.75,
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

/** the grid: one slot per turret in roster order, the rest empty */
export const BUILD_SLOTS: readonly (BuildSlot | null)[] = GRID_KEYS.map((key, i) => {
  const kind = BY_MINDUSTRY_VALUE[i];
  return kind ? { kind, key, code: `Key${key}` } : null;
});

/** the slot a physical key opens, or null — what the keyboard handler reads */
export function slotForCode(code: string): BuildSlot | null {
  return BUILD_SLOTS.find((s) => s !== null && s.code === code) ?? null;
}

(() => {
  if (GRID_KEYS.length < TOWER_KINDS.length)
    throw new Error(
      `the build card has ${GRID_KEYS.length} slots for ${TOWER_KINDS.length} turrets — add a row of keys`,
    );
})();
