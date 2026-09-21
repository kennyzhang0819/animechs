import {
  NO_UPGRADES,
  upgradedTower,
  type UpgradeContext,
  type UpgradePoints,
} from "./upgrades";
import type { ModId } from "./mods";
import { NO_SKILLS, skilledTower, type SkillPoints } from "./skills";
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
  /** the MODS the M button may roll (mods.ts), dealt by the track exactly
   *  as the turrets are */
  mods: ReadonlySet<ModId>;
  /** ...and the RELICS the G button may (relics.ts). Two sets because they
   *  are two categories — and this one is EMPTY AT EVERY LEVEL while the
   *  relics are reserved (track.ts relicsAt), which is what makes the G
   *  button say "locked" on every run and the M button not */
  relics: ReadonlySet<RelicId>;
  /** each turret's upgrade rungs, as the sim folds them (upgradedTower) */
  upgrades: Record<TowerKind, UpgradePoints>;
  /** the SKILL TREE's ranks (skills.ts) — bought with the points a level
   *  pays, and folded on top of the upgrades above */
  skills: SkillPoints;
}

export { upgradedTower, NO_UPGRADES, type UpgradeContext, type UpgradePoints };
export { NO_SKILLS, skilledTower, type SkillPoints };

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
 * and WASD (the camera). Twenty-one turrets need six rows of four, and
 * the letters ran out at twenty: the last row borrows the three keys to
 * the right of L, whose printed label is not their code.
 */
const GRID_KEYS: readonly (string | readonly [label: string, code: string])[] = [
  "Q", "E", "R", "T",
  "F", "G", "H", "J",
  "Z", "X", "C", "V",
  "Y", "U", "I", "O",
  "B", "N", "M", "P",
  "K", "L", [";", "Semicolon"], [",", "Comma"],
];

/**
 * THE CARD'S ORDER: cheapest first, by Mindustry's own build cost — the
 * one order every list of turrets in the game uses (BY_BUILD_VALUE),
 * so the cheap guns fill the top rows and the 4x4s the bottom.
 */
export const BUILD_VALUE: Record<TowerKind, number> = {
  tacker: 17.5,
  torch: 34.5,
  lobber: 37,
  duster: 52,
  coil: 60,
  airburst: 74,
  douser: 132.5,
  // lead 30 + silicon 20, and lead 100 + titanium 25 + silicon 40
  fixer: 37,
  restorer: 145.75,
  hive: 152.5,
  piercer: 157,
  autocannon: 180,
  blighter: 200,
  barrage: 270,
  tether: 288,
  whirl: 329,
  cleaver: 447.5,
  drifter: 600,
  deluge: 790,
  repeater: 1552.5,
  furnace: 1795,
  stinger: 2000,
  railhead: 2500,
};

/** the roster, cheapest first — the one order every list of turrets uses.
 *  RETIRED kinds are not in it: nothing lists a turret the game does not
 *  field, the sandbox's own grid included */
export const BY_BUILD_VALUE: readonly TowerKind[] = [...FIELDED_KINDS].sort(
  (a, b) => (BUILD_VALUE[a] ?? 0) - (BUILD_VALUE[b] ?? 0),
);

/** the grid: one slot per turret in roster order, the rest empty */
export const BUILD_SLOTS: readonly (BuildSlot | null)[] = GRID_KEYS.map((k, i) => {
  const kind = BY_BUILD_VALUE[i];
  const [key, code] = typeof k === "string" ? [k, `Key${k}`] : k;
  return kind ? { kind, key, code } : null;
});

/** the slot a physical key opens, or null — what the keyboard handler reads */
export function slotForCode(code: string): BuildSlot | null {
  return BUILD_SLOTS.find((s) => s !== null && s.code === code) ?? null;
}

(() => {
  if (GRID_KEYS.length < BY_BUILD_VALUE.length)
    throw new Error(
      `the command card has ${GRID_KEYS.length} slots for ${BY_BUILD_VALUE.length} turrets — add a row of keys`,
    );
})();
