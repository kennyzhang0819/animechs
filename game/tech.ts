import {
  NO_UPGRADES,
  upgradedTower,
  type UpgradeContext,
  type UpgradePoints,
} from "./upgrades";
import { COMMON_BUILD_KINDS, FACTORY_KINDS, kindsFor, RUN_FACTIONS } from "./factions";
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
   * screen offers — and THE TWO THIS RUN PLAYS (`picks`, factions.ts
   * RUN_FACTIONS), chosen there before the map is seen.
   *
   * An empty `picks` is every owned faction at once: the sandbox, the
   * editors, and the progress screen's census of what the save may build.
   */
  factions: ReadonlySet<FamilyKey>;
  picks: readonly FamilyKey[];
  /** the kinds a run may PUT DOWN (factions.ts BUILDABLE_KINDS) — the five
   *  factories. The same five whichever lines are playing: a faction is
   *  bodies, and which body a factory makes is the FACTORY's (Tower.faction) */
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
 * THE SAME SAVE, PLAYING THESE LINES: which bodies its factories can be
 * built to make. A faction the save does not own is dropped — the deploy
 * screen never offers one, so this is the belt to its braces — and an
 * empty list is every owned faction at once (the sandbox, the editors).
 * The buildable roster does not move with the picks; a faction owns no
 * buildings, only bodies.
 */
export function withFactions(tech: TechState, picks: readonly FamilyKey[]): TechState {
  const ok = picks.filter((f) => tech.factions.has(f)).slice(0, RUN_FACTIONS);
  return { ...tech, picks: ok, unlocked: kindsFor(ok.length > 0 ? ok : tech.factions) };
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
  /** which line this slot's factory builds (Tower.faction) */
  faction: FamilyKey | null;
  /** the printed key, worn on the slot; `code` is the physical one */
  key: string;
  code: string;
}

/** how wide the grid is: one column per unit TIER (factions.ts) */
export const BUILD_COLS = 5;

/**
 * THE TEN KEYS, in the grid's reading order — one row per faction.
 *
 * NONE OF THEM IS W, A, S OR D. Those four pan the camera (Game's
 * PAN_KEYS) and always have; a build shortcut sharing one would either
 * shove the view sideways every time a player reached for a factory or
 * silently stop the camera working. So the rows are the two that sit
 * clear of the pan cluster: the top row from Q rightwards, and the bottom
 * row from Z rightwards, which are also two straight lines under the same
 * hand.
 */
const GRID_KEYS: readonly string[] = [
  "Q", "E", "R", "T", "Y",
  "Z", "X", "C", "V", "B",
  "F", "G", "H", "J", "K",
];

/**
 * THE GRID FOR THESE PICKS: one ROW PER FACTION, one column per tier, and
 * then a LAST ROW that belongs to no line — the drill (factions.ts
 * COMMON_BUILD_KINDS). A run playing two lines therefore reads as ten
 * factories over the one building that pays for them, which is the shape
 * of the decision: the tiers run across, the lines run down, and the
 * economy sits underneath both.
 *
 * The empty cells in the last row stand empty rather than the filled ones
 * spreading out, for the same reason the whole grid is fixed: the same
 * thing is in the same place every run, so the hand learns it.
 *
 * With no picks at all (the sandbox, the editors) the first row is the
 * five factories with no line attached: they build the default family,
 * which is what a board with nobody deployed on it is for.
 */
export function buildSlotsFor(picks: readonly FamilyKey[]): readonly (BuildSlot | null)[] {
  const rows = picks.length > 0 ? picks : [null];
  return GRID_KEYS.map((key, i) => {
    const row = (i / BUILD_COLS) | 0, col = i % BUILD_COLS;
    const kind =
      row < rows.length ? FACTORY_KINDS[col]
      : row === rows.length ? COMMON_BUILD_KINDS[col]
      : undefined;
    return kind
      ? { kind, faction: row < rows.length ? rows[row] ?? null : null, key, code: `Key${key}` }
      : null;
  });
}

/** the slot a physical key opens for these picks, or null — what the
 *  keyboard handler reads */
export function slotForCode(code: string, picks: readonly FamilyKey[]): BuildSlot | null {
  return buildSlotsFor(picks).find((s) => s !== null && s.code === code) ?? null;
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
