import { TOWER_TIER, type TowerTier } from "./economy";
import {
  ALL_UPGRADES,
  AMMO_TIER,
  isUpgradeNode,
  ULTIMATE_TIER,
  NO_UPGRADES,
  TURRET_UPGRADES,
  upgradedTower,
  upgradeParent,
  UPGRADE_KINDS,
  type UpgradeContext,
  type UpgradeKind,
  type UpgradePoints,
} from "./upgrades";
import { TOWER_KINDS, type TowerKind } from "./types";

/**
 * THE TECH TREE, PAID IN SKILL POINTS.
 *
 * A player level is one skill point (economy.ts), and every node on this
 * board is bought once for a handful of them: a turret is ONE point, so is
 * each of the first two upgrade rungs under it, an ammunition swap is
 * AMMO_POINTS and an ultimate ULTIMATE_POINTS. Nothing here has a count,
 * a currency or a price curve any more. What the tree sells is
 * PERMISSION and PERMANENT STATS — which turrets a run may field and how
 * good they are — and the run's own economy (scrap, economy.ts) decides
 * how many of them stand on any given board.
 *
 * THE COUNT MODEL IS GONE. A point used to be a placement: a save that had
 * put three hundred points into duo could stand three hundred duos on
 * wave 1, for nothing, on every rung. The tree carried five currencies,
 * a geometric price curve per node, a footprint cap, a bundle-shape rule
 * against the wave script's drop ratio, and a hundred-click dial on every
 * upgrade rung. All of it priced the same thing — how big a free army the
 * save owned — and the run had nothing left to decide. So the tree is a
 * skill tree now, in the sense Bloons' knowledge tree or PvZ's seed
 * packets are: unlocks and permanent perks, paid in a resource that only
 * playing produces, and every run is bought from scratch in scrap.
 *
 * A NODE GATES TWO WAYS. Its parent must be owned (`requires`, the tree's
 * shape), and the save must have reached its level (`requiresLevel`,
 * where set). The level gate is what keeps a tier-3 turret from being the
 * second point a fresh save spends: the tier gates below are modest, and
 * the scrap price in-run is the real pacing, but a foreshadow on the board
 * at level 3 would be a node the player cannot use for twenty levels.
 *
 * `home` is the trunk everything hangs off — it is granted to every save,
 * because a root that could be missed would leave the whole tree hidden
 * behind it. Duo is granted too: a save has to be able to field
 * something. The utilities off to the side are pace and bar width; the
 * plating node and the 8x pace are gone (lives are a hundred, flat, on
 * every save — see LIVES_START in economy.ts — and the pace strip stops
 * at 4x).
 */
export const UTILITY_KINDS = ["home", "speed-2", "speed-4", "slot-7", "slot-8"] as const;
export type UtilityKind = (typeof UTILITY_KINDS)[number];

export { UPGRADE_KINDS, isUpgradeNode, type UpgradeKind };

/** anything the tree can hold a point in */
export type TechKind = TowerKind | UtilityKind | UpgradeKind;

export const TECH_KINDS: readonly TechKind[] = [
  ...TOWER_KINDS,
  ...UTILITY_KINDS,
  ...UPGRADE_KINDS,
];

const UTILITY_SET: ReadonlySet<string> = new Set<string>(UTILITY_KINDS);

/** is this node a turret? — the guard every turret-only reader needs */
export const isTowerNode = (id: TechKind): id is TowerKind =>
  !UTILITY_SET.has(id) && !isUpgradeNode(id);

/**
 * The fast-forward multiplier each utility node hands over. 1x is not in
 * here: it is the pace the game runs at with nothing bought, so it is never
 * something to own. 8x is not in here either, any more: the strip stops
 * at 4x (sandbox still offers every pace — see SPEEDS in game.ts).
 */
export const NODE_SPEED: Readonly<Partial<Record<UtilityKind, number>>> = {
  "speed-2": 2,
  "speed-4": 4,
};

/**
 * How many loadout slots the build bar starts with. The bar is a PvZ-style
 * loadout rather than a shelf of everything owned: every save picks which
 * turrets ride in it (Progress.loadout), and the two slot nodes raise this
 * by one each.
 */
export const BASE_BAR_SLOTS = 6;

/** what each utility node is called, and what owning it does */
export const UTILITY_INFO: Readonly<Record<UtilityKind, { name: string; blurb: string }>> = {
  home: {
    name: "Home",
    blurb: "The root of the tree. Turrets run down the middle, utilities off to the side.",
  },
  "speed-2": { name: "2x Speed", blurb: "Allows running the game at 2x speed." },
  "speed-4": { name: "4x Speed", blurb: "Allows running the game at 4x speed." },
  "slot-7": {
    name: "7th Slot",
    blurb: "+1 loadout slot. The build bar holds 7 turrets instead of 6.",
  },
  "slot-8": {
    name: "8th Slot",
    blurb: "+1 loadout slot. The build bar holds 8 turrets instead of 7.",
  },
};

/**
 * THE TURRET UPGRADE BRANCHES, as the sim wants them: which rungs are
 * owned, not point counts. What each rung DOES lives in upgrades.ts; what
 * follows is how a save's nodes turn into one.
 *
 * A node in `off` reads as though it were not owned at all. The node is
 * still there in the save and still draws as owned — this is the one place
 * that decides whether it DOES anything, so a switch cannot get out of
 * step with the sim.
 */
export const upgradePointsOf = (
  turret: TowerKind,
  levels: TechLevels,
  off?: ReadonlySet<TechKind>,
): UpgradePoints =>
  TURRET_UPGRADES[turret].map((u) => (off?.has(u.id) ? 0 : (levels[u.id] ?? 0) > 0 ? 1 : 0));

/** every turret's branch at once — TechState.upgrades */
export const allUpgradePointsOf = (
  levels: TechLevels,
  off?: ReadonlySet<TechKind>,
): Record<TowerKind, UpgradePoints> =>
  Object.fromEntries(TOWER_KINDS.map((k) => [k, upgradePointsOf(k, levels, off)])) as Record<
    TowerKind,
    UpgradePoints
  >;

export { upgradedTower, NO_UPGRADES, type UpgradeContext, type UpgradePoints };

/**
 * WHAT A NODE COSTS, in skill points.
 *
 * One is the unit: a turret, a utility, either of the two stat rungs. The
 * ammunition rung is two because it changes what the turret IS rather than
 * how much of it there is, and an ultimate is three because it replaces
 * the turret outright. Points are the scarcest thing in the game — one a
 * level, and a level is a run or several — so a three-point node is a
 * real decision and a one-point node is a cheap experiment.
 */
export const TURRET_POINTS = 1;
export const UTILITY_POINTS = 1;
export const STAT_POINTS = 1;
export const AMMO_POINTS = 2;
export const ULTIMATE_POINTS = 3;

/**
 * THE LEVEL GATES, by turret tier (economy.ts). Tier 1 is open from the
 * first point; tier 2 waits for a save that has cleared a few runs; tier 3
 * for one that has climbed. Modest on purpose — the scrap price is the
 * real pacing in-run, and these only stop a fresh save from parking its
 * second point on a turret it cannot afford to place for twenty levels.
 */
export const TIER_LEVEL_GATE: Readonly<Record<TowerTier, number>> = { 1: 1, 2: 4, 3: 10 };
/** the level an ultimate waits for, whatever its turret's tier */
export const ULTIMATE_LEVEL_GATE = 15;

export interface TechNodeDef {
  /** which node this is — a turret, a utility, or an upgrade rung */
  id: TechKind;
  /** what owning it costs, in skill points */
  points: number;
  /**
   * The turret damage per second at its full ceiling, measured when the
   * turret was built. AN ANNOTATION: the sim computes real damage from the
   * bullet, never from here, and nothing prices off it. A splashing or
   * piercing shot counts as catching FIVE bodies — not because that is
   * true, but because it is the SAME for every turret.
   */
  dps?: number;
  /** parent node: must be owned before this node appears in the tree */
  requires?: TechKind;
  /** player level the save must have reached before this node takes a point */
  requiresLevel?: number;
  /**
   * MAY THIS NODE'S EFFECT BE SWITCHED OFF WITHOUT SELLING IT? — see
   * Progress.techOff.
   *
   * A refund hands the points back and the node stops being owned. A
   * toggle keeps the node exactly where it is and only stops APPLYING it,
   * which is the difference between a shop and a settings switch. A save
   * that bought graphite rounds and then found it did not want to play
   * with them can put them down without being punished for having tried.
   *
   * IT IS FOR THE ONE-SHOT NODES that change what a turret IS — an
   * upgrade branch's third and fourth rungs. "Not right now" is a sentence
   * that means something on them. Turret unlocks cannot carry it: a
   * switched-off turret would strand towers already on the board.
   */
  toggle?: boolean;
  /**
   * Grid position in the tree view, in cell units.
   *
   * THE BOARD HAS ONE HARD RULE: NO TWO EDGES MAY CROSS. A tech tree is
   * read by following a line from a node you own to a node you want, and
   * the moment two lines meet at a point that is not a node, that reading
   * stops working — an X in the middle of open board is indistinguishable
   * from a junction, so a player traces the wrong branch and concludes the
   * cheap turret they are standing on unlocks the expensive one it merely
   * passes under.
   *
   * SO THE BOARD IS LAID OUT IN WINGS. Home is the junction. The
   * utilities run NORTH out of it. The turrets run south, and duo's
   * children own strips that never interleave: the scatter wing takes
   * columns 0-2, the duo branch takes column 3 alone, the arc wing takes
   * 4-6. A subtree stays inside its strip, so no edge of one ever has
   * business in another.
   *
   * y is the depth — a child sits BELOW its parent (or, in the north,
   * above it) — and x spreads siblings sideways. An upgrade node carries
   * its turret's cell and is laid out on the finer grid in layout.ts.
   */
  x: number;
  y: number;
}

/**
 * WHERE THE TREE'S ORDER COMES FROM: MINDUSTRY'S OWN BUILD COSTS.
 *
 * Mindustry has shipped and been played for years with build costs for
 * every one of these turrets, so it is the one independent opinion
 * available on what a turret is worth. A turret's value is the sum of
 * amount x item cost from Blocks.java and Items.java. Ranked, the
 * seventeen we ship run:
 *
 *   duo 17.5 · scorch 34.5 · hail 37 · arc 60 · scatter 74 · wave 132.5
 *   swarmer 152.5 · lancer 157 · salvo 180 · ripple 270 · parallax 288
 *   cyclone 329 · fuse 447.5 · tsunami 790 · spectre 1552.5 · meltdown 1795
 *   foreshadow 2500
 *
 * Nothing prices off this any more — the scrap prices are authored per
 * turret in economy.ts, against the stage income — but the ORDER is the
 * roster's one canonical order: the balance panel, the build bar and the
 * loadout picker all read in it, and the three turret tiers (TOWER_TIER)
 * are cut along it.
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

/**
 * Every turret cheapest-first by that valuation — THE display order. The
 * balance panel, the build bar and its loadout picker all read in it, so a
 * turret keeps its place wherever it appears: foreshadow is always last.
 */
export const BY_MINDUSTRY_VALUE: readonly TowerKind[] = [...TOWER_KINDS].sort(
  (a, b) => MINDUSTRY_VALUE[a] - MINDUSTRY_VALUE[b],
);

/** a turret node: one point, gated by its tier's level, on the authored cell */
const turret = (
  id: TowerKind,
  dps: number,
  requires: TechKind,
  x: number,
  y: number,
): TechNodeDef => ({
  id,
  points: TURRET_POINTS,
  dps,
  requires,
  requiresLevel: TIER_LEVEL_GATE[TOWER_TIER[id]],
  x,
  y,
});

/**
 * The board. Lineage is Mindustry's own (content/SerpuloTechTree.java)
 * where it has one: duo → scatter → hail → salvo, duo → arc → scorch →
 * lancer, wave under scorch with parallax and tsunami off it.
 */
const MAIN_TREE: readonly TechNodeDef[] = [
  {
    // THE ROOT, AND FREE. Every save is granted it (progress.ts): it is a
    // junction, not a purchase, and it exists because the tree forks at
    // the top — turrets one way, utilities the other
    id: "home",
    points: 0,
    x: 3,
    y: 0,
  },
  {
    // THE VOLUME TURRET, granted with home: a save has to be able to
    // field something. 27 DPS is the least any turret does; it stays the
    // thing you open with and never the answer
    ...turret("duo", 27, "home", 3, 1),
    points: 0,
  },
  // the first AoE, and the moment tier 1 and tier 2 stop being difficulty:
  // splash scales with bodies per blast and collapses with health per body
  turret("hail", 165, "scatter", 2, 3),
  // a piercing flame that rakes a whole file and sets each alight; burning
  // ignores armour outright. 60 units of range is the whole cost
  turret("scorch", 850, "arc", 4, 3),
  // anti-air only; flares debut inside the opening stage, so it is tier 1
  turret("scatter", 1450, "duo", 2, 2),
  // 28 damage a shell — the first turret that puts a fortress (armour 9)
  // back at its printed health. It also shoots AIR
  turret("salvo", 217, "hail", 2, 4),
  // three instant piercing rays at 105 damage each — among the highest
  // DPS on the roster, and the price says so
  turret("fuse", 4109, "salvo", 2, 6),
  // chain lightning down a file, and the root of the short-range branch
  turret("arc", 411, "duo", 4, 2),
  // a piercing laser; the ground answer that is not artillery
  turret("lancer", 420, "scorch", 6, 4),
  // 290 range and four shells a volley — the wave-clear against crawler floods
  turret("ripple", 700, "salvo", 1, 5),
  // 4 DPS and beside the point: everything it hoses drives at 65% speed,
  // so it multiplies every turret covering the same lane
  turret("wave", 4, "scorch", 4, 4),
  // not a damage turret: it drags air units out of formation
  turret("parallax", 30, "wave", 5, 5),
  // wave's heavy sibling — a 190-unit umbrella at 45% speed for four seconds
  turret("tsunami", 8, "wave", 4, 5),
  // homing missiles — they chase what they lock
  turret("swarmer", 1925, "salvo", 0, 5),
  // a flak wall; the reason to own it is volume of splash
  turret("cyclone", 1797, "swarmer", 0, 6),
  // twin heavy cannon — the highest sustained damage in the game
  turret("spectre", 1783, "cyclone", 0, 7),
  // a continuous beam that melts whatever it rests on
  turret("meltdown", 4356, "lancer", 6, 5),
  // 500 range and one enormous shot — a sniper rather than a defence
  turret("foreshadow", 527, "meltdown", 6, 6),
  // ---------- THE UTILITIES PATH ---------------------------------------
  //
  // Two pace switches off home, in their own column, and the slot ladder
  // branching off them. They are PRICED AS CONVENIENCE: pace changes
  // nothing about whether a board holds, and a wider bar is a wider
  // choice, not a stronger one. A chain, not a fan: 4x requires 2x, so
  // the column reads in order.
  {
    id: "speed-2",
    points: UTILITY_POINTS,
    requires: "home",
    requiresLevel: 2,
    x: 4,
    y: -1,
  },
  {
    id: "speed-4",
    points: UTILITY_POINTS,
    requires: "speed-2",
    requiresLevel: 6,
    x: 4,
    y: -2,
  },
  {
    id: "slot-7",
    points: UTILITY_POINTS,
    requires: "speed-2",
    requiresLevel: 5,
    x: 5,
    y: -2,
  },
  {
    id: "slot-8",
    points: UTILITY_POINTS,
    requires: "slot-7",
    requiresLevel: 12,
    x: 5,
    y: -3,
  },
];

/**
 * The upgrade nodes, derived from the table in upgrades.ts.
 *
 * They are a CHAIN per turret — rung one requires the turret, rung two
 * requires rung one, and so on — which is the same edge every other node
 * in the tree has and does the same job: the two cheap stat rungs stand
 * between a fresh save and the expensive one-shots above them, so an
 * ultimate can never be one click from the turret's own unlock.
 *
 * They carry the turret's own cell because they are drawn attached to it
 * rather than laid out beside it (layout.ts spreads them).
 */
const UPGRADE_NODES: readonly TechNodeDef[] = ALL_UPGRADES.map((u) => {
  const parent = MAIN_TREE.find((n) => n.id === u.turret);
  if (!parent) throw new Error(`upgrade "${u.id}" hangs off an unknown turret`);
  const ultimate = u.tier >= ULTIMATE_TIER;
  return {
    id: u.id,
    points: ultimate ? ULTIMATE_POINTS : u.tier >= AMMO_TIER ? AMMO_POINTS : STAT_POINTS,
    ...(ultimate ? { requiresLevel: ULTIMATE_LEVEL_GATE } : null),
    // rung 3 changes what the turret IS and rung 4 replaces it, so both
    // are things a save can put down without selling; a stat rung is not
    toggle: u.tier >= AMMO_TIER,
    requires: upgradeParent(u.id) ?? u.turret,
    x: parent.x,
    y: parent.y,
  };
});

/**
 * THE TREE AS EVERYTHING ELSE SEES IT: the authored board, plus a branch
 * hanging off every turret on it.
 */
export const TECH_TREE: readonly TechNodeDef[] = [...MAIN_TREE, ...UPGRADE_NODES];

const BY_NODE = new Map<TechKind, TechNodeDef>(TECH_TREE.map((n) => [n.id, n]));

export function techNode(id: TechKind): TechNodeDef {
  const def = BY_NODE.get(id);
  if (!def) throw new Error(`"${id}" is not in TECH_TREE`);
  return def;
}

/** what owning this node costs, in skill points */
export const techPoints = (node: TechKind): number => techNode(node).points;

/**
 * MAY THIS NODE BE HANDED BACK? Every node that cost anything can be,
 * and the points come straight back — the tree is respec-able, Bloons
 * style, so a point is never a mistake a player has to grind out of. The
 * two free nodes (home, duo) have nothing to hand back and never leave.
 *
 * The one rule is the tree's own shape: a node cannot go while anything
 * that REQUIRES it is still owned — a branch is taken back from its tip
 * (canRefund in progress.ts).
 */
export const isRefundable = (node: TechKind): boolean => techPoints(node) > 0;

/** the nodes that hang off this one — what has to go before it can */
export function childrenOf(node: TechKind): TechKind[] {
  return TECH_TREE.filter((n) => n.requires === node).map((n) => n.id);
}

/** may this node's effect be switched off while keeping it? — see
 *  TechNodeDef.toggle */
export const isToggleable = (node: TechKind): boolean => techNode(node).toggle === true;

/**
 * Owned-or-not per node — the save's tech field. Every value is 0 or 1
 * (a node is bought once); it stays a number rather than a boolean so a
 * save written under the count model reads without a migration in every
 * reader — the loader clamps it (progress.ts).
 */
export type TechLevels = Partial<Record<TechKind, number>>;

/** does the save own this node? */
export const owns = (levels: TechLevels, node: TechKind): boolean => (levels[node] ?? 0) > 0;

/** every point the save has ever spent — the sum of what it owns costs */
export function pointsSpent(levels: TechLevels): number {
  let total = 0;
  for (const k of TECH_KINDS) if (owns(levels, k)) total += techPoints(k);
  return total;
}

/** everything the sim and UI need to know, derived from what is owned */
export interface TechState {
  /** the turrets a run may field — owning one IS being allowed to place it */
  unlocked: ReadonlySet<TowerKind>;
  /**
   * The fast-forward multipliers this save may use, ascending. 1x is always
   * in it and is never bought — it is the pace the game runs at.
   */
  speeds: readonly number[];
  /** loadout slots in the build bar: BASE_BAR_SLOTS plus owned slot nodes */
  barSlots: number;
  /** every turret's upgrade branch as bought, one flag per rung */
  upgrades: Record<TowerKind, UpgradePoints>;
}

/**
 * EVERYTHING THE SIM AND UI NEED, DERIVED FROM WHAT IS OWNED — and the
 * SAVE'S OWN TECH IS THE ONLY LIMIT IN IT. A turret this save owns is a
 * turret this save can place, at every rung of every world; how MANY is
 * the run's scrap's business (Sim.canPlace).
 */
export function techState(levels: TechLevels, off?: ReadonlySet<TechKind>): TechState {
  const unlocked = new Set<TowerKind>(TOWER_KINDS.filter((k) => owns(levels, k)));
  const speeds = [
    1,
    ...UTILITY_KINDS.filter((k) => owns(levels, k))
      .map((k) => NODE_SPEED[k])
      .filter((m): m is number => m != null),
  ].sort((a, b) => a - b);
  const barSlots =
    BASE_BAR_SLOTS + (owns(levels, "slot-7") ? 1 : 0) + (owns(levels, "slot-8") ? 1 : 0);
  return {
    unlocked,
    speeds,
    barSlots,
    upgrades: allUpgradePointsOf(levels, off),
  };
}
