import {
  NO_UPGRADES,
  upgradedTower,
  type UpgradeContext,
  type UpgradePoints,
} from "./upgrades";
import type { ModId } from "./mods";
import type { RelicId } from "./relics";
import { FIELDED_KINDS, type TowerKind } from "./types";

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
  /** the MODS the M button may roll (mods.ts), dealt by the track exactly
   *  as the turrets are */
  mods: ReadonlySet<ModId>;
  /** ...and the RELICS the G button may (relics.ts). Two sets because they
   *  are two categories: a save below RELICS_FROM has an empty one here and
   *  a full one above, which is what makes the G button say "locked" and
   *  the M button not */
  relics: ReadonlySet<RelicId>;
  /** each turret's upgrade rungs, as the sim folds them (upgradedTower) */
  upgrades: Record<TowerKind, UpgradePoints>;
}

export { upgradedTower, NO_UPGRADES, type UpgradeContext, type UpgradePoints };

/**
 * THE COMMAND CARD — a fixed grid in the bottom-right corner, one turret a
 * slot, a key on every slot.
 *
 * IT IS THE FREE BOARD'S DOOR ONLY. A charged run does not pick turrets
 * off a shelf any more: it buys them as cards off the deal (rarity.ts) and
 * the corner holds two buttons instead (components/Animechs.tsx). The
 * grid stays for the sandbox and the editors, where the whole roster is
 * open, nothing is charged and a specific turret has to be reachable on
 * purpose — which is the one thing a random deal cannot do, and exactly
 * what a board being used to reproduce a bug needs.
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
 * so the cheap guns fill the top rows and the 4x4s the bottom.
 */
export const MINDUSTRY_VALUE: Record<TowerKind, number> = {
  tacker: 17.5,
  torch: 34.5,
  lobber: 37,
  coil: 60,
  airburst: 74,
  douser: 132.5,
  // lead 30 + silicon 20, and lead 100 + titanium 25 + silicon 40
  fixer: 37,
  restorer: 145.75,
  hive: 152.5,
  piercer: 157,
  autocannon: 180,
  barrage: 270,
  tether: 288,
  whirl: 329,
  cleaver: 447.5,
  deluge: 790,
  repeater: 1552.5,
  furnace: 1795,
  railhead: 2500,
};

/** the roster, cheapest first — the one order every list of turrets uses.
 *  RETIRED kinds are not in it: nothing lists a turret the game does not
 *  field, the sandbox's own grid included */
export const BY_MINDUSTRY_VALUE: readonly TowerKind[] = [...FIELDED_KINDS].sort(
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
  if (GRID_KEYS.length < BY_MINDUSTRY_VALUE.length)
    throw new Error(
      `the command card has ${GRID_KEYS.length} slots for ${BY_MINDUSTRY_VALUE.length} turrets — add a row of keys`,
    );
})();
