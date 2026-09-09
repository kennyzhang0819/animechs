import {
  NO_UPGRADES,
  upgradedTower,
  type UpgradeContext,
  type UpgradePoints,
} from "./upgrades";
import { BUILDABLE_KINDS, kindsFor } from "./factions";
import type { FamilyKey } from "./levels";
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
  /**
   * THE FACTIONS THE SAVE OWNS (track.ts factionsAt) — what the deploy
   * screen offers — and THE ONE THIS RUN PLAYS (`faction`), picked there.
   * Null is every owned faction at once: the sandbox, the editors, and
   * the progress screen's census of what the save may build.
   */
  factions: ReadonlySet<FamilyKey>;
  faction: FamilyKey | null;
  /** the kinds a run may PUT DOWN (factions.ts BUILDABLE_KINDS) — the
   *  drill and the five factories. The same set whichever
   *  faction is playing, since a faction is bodies and nothing else */
  unlocked: ReadonlySet<TowerKind>;
  /**
   * The fast-forward multipliers this save may use, ascending. 1x is
   * always in it — it is the pace the game runs at; the rest are the
   * track's paces (speedsAt).
   */
  speeds: readonly number[];
  /** each turret's upgrade rungs, as the sim folds them (upgradedTower) */
  upgrades: Record<TowerKind, UpgradePoints>;
}

export { upgradedTower, NO_UPGRADES, type UpgradeContext, type UpgradePoints };

/**
 * THE SAME SAVE, PLAYING ONE FACTION: which line the factories build.
 * A faction the save does not own is refused — the deploy screen never
 * offers one, so this is the belt to its braces — and null is every
 * owned faction at once (the sandbox, the editors). The buildable roster
 * does not move with the pick any more; a faction owns no buildings.
 */
export function withFaction(tech: TechState, faction: FamilyKey | null): TechState {
  const f = faction && tech.factions.has(faction) ? faction : null;
  return { ...tech, faction: f, unlocked: kindsFor(f ? [f] : tech.factions) };
}

/**
 * THE BUILD MENU IS A 4x4 GRID in the field's bottom-right corner, the
 * minimap's twin at the other end of the screen — StarCraft's command
 * card, and read the same way: a fixed square of slots, each one thing
 * you can put down, each with a key printed on it, and the SAME thing in
 * the SAME slot every run, so the hand learns the grid rather than
 * reading it.
 *
 * It replaces three tabs that each opened a floating menu. A tab was a
 * door in front of a door — two presses and a panel over the field to
 * get to a building — and it cost the player the one thing a fixed grid
 * gives them for nothing: knowing where a thing is without looking.
 *
 * WHAT IS IN IT, in order: the drill that pays for everything and the
 * five factories that turn the scrap into an army (factions.ts
 * BUILDABLE_KINDS). NO TURRETS — the player builds none at all now; the
 * guns are the swarm's, and a run is won with the bodies the factories
 * make. NO WALLS EITHER, since there are none left in the game (types.ts)
 * — what they held is in the buildings' own pools now (TOWER_HP_SCALE).
 * Six of the sixteen slots are filled and the rest stand empty, which is
 * the grid saying honestly that there is more to come rather than
 * reflowing under the hand every time there is.
 *
 * THE KEYS ARE THE GRID'S OWN SHAPE, and they dodge two rows on purpose:
 * the digits are the CONTROL GROUPS (1 to 0, one a band) and WASD pans
 * the camera, so neither may be spent on a building. What is left is
 * read row by row — Q E R T across the top (Q, then W skipped), F G H J
 * along the home row (A, S and D skipped), Z X C V across the bottom,
 * and Y U I O for the fourth row, which the keyboard's three letter rows
 * cannot otherwise pay for. The eight LIVE slots today are therefore the
 * top two rows: Q E R T, then F G H J.
 */
export interface BuildSlot {
  kind: TowerKind;
  /** the printed key, worn on the slot; `code` is the physical one */
  key: string;
  code: string;
}

/** how wide the grid is — the rows are this long and there are this many */
export const BUILD_COLS = 4;

/** the sixteen keys, in the grid's reading order (see the note above) */
const GRID_KEYS: readonly string[] = [
  "Q", "E", "R", "T",
  "F", "G", "H", "J",
  "Z", "X", "C", "V",
  "Y", "U", "I", "O",
];

/** the grid: one slot per buildable kind, in the roster's own order,
 *  padded out to the full sixteen with empties */
export const BUILD_SLOTS: readonly (BuildSlot | null)[] = GRID_KEYS.map((key, i) => {
  const kind = BUILDABLE_KINDS[i];
  return kind ? { kind, key, code: `Key${key}` } : null;
});

/** the slot a physical key opens, or null — what the keyboard handler reads */
export function slotForCode(code: string): BuildSlot | null {
  return BUILD_SLOTS.find((s) => s !== null && s.code === code) ?? null;
}

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
  // six of an item each (Blocks.java) at the item values the turrets use
  // twenty-four of an item each, so each large wall sorts after its small
  // the drill and the factories, at their Mindustry build costs' item
  // values — the drill sorts with the walls, the factories climb the bar
  // with their tier
  drill: 27,
  "factory-t1": 110,
  "factory-t2": 320,
  "factory-t3": 640,
  "factory-t4": 1300,
  "factory-t5": 2700,
};

/** the roster, cheapest first — the one order every list of turrets uses */
export const BY_MINDUSTRY_VALUE: readonly TowerKind[] = [...TOWER_KINDS].sort(
  (a, b) => (MINDUSTRY_VALUE[a] ?? 0) - (MINDUSTRY_VALUE[b] ?? 0),
);
