import {
  NO_UPGRADES,
  upgradedTower,
  type UpgradeContext,
  type UpgradePoints,
} from "./upgrades";
import { TOWERS } from "./constants";
import { kindsFor } from "./factions";
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
  /** the kinds a run may field: the common roster and the turrets of the
   *  faction it plays — of every owned faction when `faction` is null */
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
 * THE SAME SAVE, PLAYING ONE FACTION: the tech state narrowed to the
 * common roster plus that faction's turrets. A faction the save does not
 * own is refused — the deploy screen never offers one, so this is the
 * belt to its braces — and null widens back to every owned faction.
 */
export function withFaction(tech: TechState, faction: FamilyKey | null): TechState {
  const f = faction && tech.factions.has(faction) ? faction : null;
  return { ...tech, faction: f, unlocked: kindsFor(f ? [f] : tech.factions) };
}

/**
 * THE BUILD BAR IS THREE TABS, one per JOB a building does, and it shows
 * the WHOLE of the tab it is on. This replaces the eight curated seed
 * slots: a bar that held eight of a roster of twenty-nine made the player
 * decide, before the run, which two thirds of the game they were not
 * going to play — and it decided it once, in a picker, for every map.
 *
 * The split is by what the thing is FOR, which is also the order a run
 * touches them in: the drills that pay for everything (SCRAP), the
 * factories that turn that into bodies (UNITS), and the guns and walls
 * that keep both standing (TOWER). Each is named in ONE SHORT WORD
 * because the name is worn on the slot itself, a button fourteen
 * characters wide — "scrap" says what the drill is for at least as well
 * as "economy" did, and it fits.
 *
 * Nothing is curated and nothing is
 * hidden — a tab is one keypress away, and what a save has not earned
 * simply is not on it.
 *
 * The keys are E, R and T: the three left-hand keys ABOVE the digit row,
 * because the digits are the control groups' (1 to 0, one per group) and
 * a build shortcut that costs the player a control group is not a
 * shortcut. Left to right on the keyboard is left to right on the bar.
 */
export type BuildTab = "scrap" | "units" | "tower";

export const BUILD_TABS: readonly {
  id: BuildTab;
  label: string;
  /** the printed key, worn on the tab; `code` is the physical one */
  key: string;
  code: string;
}[] = [
  { id: "scrap", label: "Scrap", key: "E", code: "KeyE" },
  { id: "units", label: "Units", key: "R", code: "KeyR" },
  { id: "tower", label: "Tower", key: "T", code: "KeyT" },
];

/**
 * WHICH TAB A KIND RIDES, read off what the building DOES (constants.ts
 * TowerStats) rather than a second table beside it: a drill pays scrap,
 * a factory `produces` a unit tier, and everything else — every gun and
 * every wall — is what holds the line. A new building lands on the right
 * tab by being what it is, with nothing here to keep in step.
 */
export function buildTabOf(kind: TowerKind): BuildTab {
  const t = TOWERS[kind];
  if (t.drill) return "scrap";
  if (t.produces) return "units";
  return "tower";
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
  "copper-wall": 3,
  "titanium-wall": 9,
  "thorium-wall": 15,
  // twenty-four of an item each, so each large wall sorts after its small
  "copper-wall-large": 12,
  "titanium-wall-large": 36,
  "thorium-wall-large": 60,
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
