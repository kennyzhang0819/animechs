import { addScaled, canAfford, costEntries, type Bank, type Cost, type ItemKind } from "./items";
import { TOWER_KINDS, type TowerKind } from "./types";

/**
 * The tech tree: one square node per turret, laid out as a small graph.
 * A node's point count IS the turret's placement capacity — the first
 * point unlocks the turret (capacity 1) and every further point on the
 * same node is +1 capacity. Points get more expensive the more of them you
 * own: every node carries a PRICE LADDER of tiers (see TECH_TREE below),
 * so the first few slots are cheap and a deep stack costs real money.
 *
 * Nodes gate two ways: the parent node must hold at least one point (the
 * graph edge — a node stays hidden until its parent is bought), and some
 * nodes wait for a world to be fully cleared. World-1 players see only
 * duo and hail; clearing world 1 opens salvo and scatter; fuse waits for
 * world 2.
 */

/**
 * A node's PRICE CURVE. Prices are computed, not tabulated: the nth point on
 * a node costs `base * growth^n` of each item it wants, rounded to a tidy
 * number. Geometric growth is what idle and tower games almost always use
 * (Cookie Clicker's buildings are 1.15 per copy) and it is the whole answer
 * to "one clear buys a dozen turrets": the cost of N points grows like
 * growth^N, so the count a player can afford grows only with the LOGARITHM
 * of their income. Doubling income adds a fixed handful of turrets rather
 * than doubling the fleet.
 *
 *   growth 1.10  gentle — a stack of 30 is realistic
 *   growth 1.15  the genre default; every 5 points is roughly +2x
 *   growth 1.25  steep — a deep stack is a real sacrifice
 *   growth 1.40  near-vertical; use for a turret meant to stay rare
 *
 * `from` delays an ITEM rather than the node: `from: { copper: 30 }` means
 * the first 30 points cost no copper at all, and copper starts at its base
 * price on point 30. That is how a node stays payable out of the worlds
 * already open while still wanting the deeper currencies later.
 */
export interface PriceCurve {
  /** what the FIRST point costs, per item */
  base: Cost;
  /** per-point multiplier, applied to every item in the bundle */
  growth: number;
  /** point index at which an item starts being charged at all (default 0) */
  from?: Partial<Record<ItemKind, number>>;
}

/**
 * Global difficulty dial on every curve at once, as a fraction of each
 * node's own steepness: 1 is the tuned campaign, 1.5 makes every ladder half
 * again as steep, 0.5 flattens them all. Tune ONE node with its `growth` and
 * the whole economy with this.
 */
export const PRICE_GROWTH_SCALE = 1;

/** the growth actually applied, after the global dial */
const effectiveGrowth = (growth: number): number =>
  1 + (growth - 1) * PRICE_GROWTH_SCALE;

/**
 * Round a raw price to something a player can read and remember. Coarser as
 * it climbs — single units up to 10, then 5s, 25s, and two significant
 * figures beyond that. Monotonic, so a rounded ladder never dips.
 */
function tidy(x: number): number {
  if (x < 10) return Math.max(1, Math.round(x));
  if (x < 100) return Math.round(x / 5) * 5;
  if (x < 1000) return Math.round(x / 25) * 25;
  const mag = 10 ** (Math.floor(Math.log10(x)) - 1);
  return Math.round(x / mag) * mag;
}

export interface TechNodeDef {
  tower: TowerKind;
  /** what this node's points cost — two numbers, not a table */
  price: PriceCurve;
  /** parent node: needs >= 1 point before this node appears in the tree */
  requires?: TowerKind;
  /** world that must be fully cleared before points can go in */
  world?: number;
  /**
   * grid position in the tree view, in cell units. The tree grows DOWNWARD:
   * y is the depth (a child always sits on the row below its parent) and x
   * spreads siblings sideways, so duo's trunk runs straight down the middle
   * with scatter branching off it.
   */
  x: number;
  y: number;
}

/**
 * The tree. To retune the economy, edit the `tiers` ladders below — nothing
 * else reads prices. Each turret's ladder roughly doubles per rung, so
 * stacking one turret deep costs more than spreading across the tree; the
 * a node's `growth` says how fast that turret's own price climbs, so a
 * turret meant to be spammed (duo) climbs slowly and one meant to stay rare
 * (fuse) climbs hard. PRICE_GROWTH_SCALE moves them all at once.
 *
 * Curves also get WIDER in currency as they climb: the cheap end is scrap
 * the opening waves already pay for, the middle wants copper that only T2
 * kills drop, and the deep end needs titanium off T3s — that is what `from`
 * is for. A node therefore can't be climbed by farming one easy wave; the
 * mix of enemies a player is willing to fight limits how far up they get.
 * Keep the FIRST point of any newly-unlockable node payable from the worlds
 * already open at that point, or the node unlocks into a wall.
 */
export const TECH_TREE: readonly TechNodeDef[] = [
  {
    // The spam turret, and the only lever a stalled player has — so it
    // climbs slowest, and stays SCRAP-ONLY until 30. A run that dies before
    // world 1's first mace wave banks no copper at all, and duo capacity has
    // to remain buyable out of that run or the save is stuck.
    tower: "duo",
    price: { base: { scrap: 5, copper: 1 }, growth: 1.08, from: { copper: 30 } },
    x: 1,
    y: 0,
  },
  {
    tower: "hail",
    price: { base: { scrap: 30, copper: 2 }, growth: 1.14, from: { copper: 3, titanium: 15 } },
    requires: "duo",
    x: 1,
    y: 1,
  },
  {
    tower: "scatter",
    price: {
      base: { scrap: 120, copper: 8, titanium: 2 },
      growth: 1.14,
      from: { titanium: 12 },
    },
    requires: "duo",
    world: 1,
    x: 0,
    y: 1,
  },
  {
    // no world gate: scorch is open from the start like hail, and undercuts
    // it — it is Mindustry's second-cheapest turret. however, its currently very strong in 
    // this game because of aoe against early game swarms and enemies cant fight back
    tower: "scorch",
    price: { base: { scrap: 100, copper: 20 }, growth: 1.2, from: { titanium: 3 } },
    requires: "duo",
    x: 2,
    y: 1,
  },
  {
    // opens on clearing world 1, which fields no fortresses — so titanium
    // waits until point 5, by which time world 2 is supplying it
    tower: "salvo",
    price: {
      base: { scrap: 250, copper: 25, titanium: 4 },
      growth: 1.25,
      from: { titanium: 5 },
    },
    requires: "hail",
    world: 1,
    x: 1,
    y: 2,
  },
  {
    // world-2 gated, so titanium is already flowing when it opens. The
    // steepest curve in the tree: a fuse battery is meant to be a handful
    tower: "fuse",
    price: { base: { scrap: 500, copper: 60, titanium: 12 }, growth: 1.35 },
    requires: "salvo",
    world: 2,
    x: 1,
    y: 3,
  },
];

/**
 * What the NEXT point on this node costs, given how many it already holds.
 * `base * growth^owned` per item, skipping items the curve hasn't started
 * charging yet, then tidied to a readable number.
 */
export function techPrice(tower: TowerKind, owned = 0): Cost {
  const { base, growth, from } = techNode(tower).price;
  const n = Math.max(0, Math.floor(owned));
  const g = effectiveGrowth(growth);
  const out: Cost = {};
  for (const { item, amount } of costEntries(base)) {
    const starts = from?.[item] ?? 0;
    if (n < starts) continue; // this item isn't charged for yet
    out[item] = tidy(amount * g ** (n - starts));
  }
  return out;
}

/** can this wallet pay for the next point on the node? */
export function canAffordTech(bank: Bank, tower: TowerKind, owned = 0): boolean {
  return canAfford(bank, techPrice(tower, owned));
}

/**
 * What owning `points` of this node has cost in total — the sum of every
 * price up to it. Curve tuning is really about this number, not about any
 * single price, so it lives here rather than in a scratch script.
 */
export function techSpend(tower: TowerKind, points: number): Cost {
  const total: Cost = {};
  for (let i = 0; i < Math.max(0, Math.floor(points)); i++)
    addScaled(total, techPrice(tower, i), 1);
  return total;
}

export function techNode(tower: TowerKind): TechNodeDef {
  const def = TECH_TREE.find((n) => n.tower === tower);
  if (!def) throw new Error(`tower "${tower}" is not in TECH_TREE`);
  return def;
}

/** points per turret node — the save's tech field; points == capacity */
export type TechLevels = Partial<Record<TowerKind, number>>;

/** everything the sim and UI need to know, derived from the point spread */
export interface TechState {
  unlocked: ReadonlySet<TowerKind>;
  caps: Record<TowerKind, number>;
}

export function techState(levels: TechLevels): TechState {
  const caps = Object.fromEntries(
    TOWER_KINDS.map((k) => [k, Math.max(0, Math.floor(levels[k] ?? 0))]),
  ) as Record<TowerKind, number>;
  const unlocked = new Set<TowerKind>(TOWER_KINDS.filter((k) => caps[k] > 0));
  return { unlocked, caps };
}
