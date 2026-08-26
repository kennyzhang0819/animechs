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
 * One rung of a node's price ladder. `count` is how many capacity points
 * this rung covers, and `price` is the scrap each of those points costs.
 * Leave `count` off the LAST rung to make it open-ended — every point past
 * the rungs above it costs that price forever.
 *
 * Reading a ladder: `[{ count: 10, price: 20 }, { count: 20, price: 40 }]`
 * means "the first 10 capacity cost 20 scrap each, the next 20 cost 40".
 */
export interface PriceTier {
  count?: number;
  price: number;
}

export interface TechNodeDef {
  tower: TowerKind;
  /** what this node's points cost, cheapest rung first — edit freely */
  tiers: readonly PriceTier[];
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
 * else reads prices. Each turret's ladder doubles per rung, so stacking one
 * turret deep costs more than spreading across the tree; the rung widths
 * scale with how many of that turret a line actually wants (duo by the
 * dozen, fuse by the handful).
 */
export const TECH_TREE: readonly TechNodeDef[] = [
  {
    tower: "duo",
    tiers: [
      { count: 10, price: 1 }, // capacity 1-10  (the 1st is free, see DUO_START)
      { count: 20, price: 10 }, // capacity 11-30
      { count: 20, price: 50 }, // capacity 31-50
      { count: 20, price: 300 }, // capacity 31-50
      { price: 50000 }, // 61+
    ],
    x: 1,
    y: 0,
  },
  {
    tower: "hail",
    tiers: [
      { count: 10, price: 50 }, // capacity 1-5
      { count: 10, price: 200 }, // capacity 16-30
      { count: 10, price: 1000 }, // capacity 16-30
      { price: 50000 }, // 31+
    ],
    requires: "duo",
    x: 1,
    y: 1,
  },
  {
    tower: "scatter",
    tiers: [
      { count: 10, price: 100 },
      { count: 10, price: 400 },
      { count: 10, price: 2000 },
      { price: 50000 },
    ],
    requires: "duo",
    world: 1,
    x: 0,
    y: 1,
  },
  {
    tower: "salvo",
    tiers: [
      { count: 10, price: 100 },
      { count: 10, price: 400 },
      { count: 10, price: 2000 },
      { price: 50000 },
    ],
    requires: "hail",
    world: 1,
    x: 1,
    y: 2,
  },
  {
    tower: "fuse",
    tiers: [
      { count: 3, price: 140 },
      { count: 6, price: 280 },
      { count: 9, price: 560 },
      { price: 1120 },
    ],
    requires: "salvo",
    world: 2,
    x: 1,
    y: 3,
  },
];

/**
 * What the NEXT point on this node costs, given how many it already holds.
 * Walks the ladder rung by rung; past the last counted rung the open-ended
 * rung's price applies forever.
 */
export function techPrice(tower: TowerKind, owned = 0): number {
  const { tiers } = techNode(tower);
  let slot = Math.max(0, Math.floor(owned)) + 1; // the point being bought
  for (const tier of tiers) {
    if (tier.count === undefined || slot <= tier.count) return tier.price;
    slot -= tier.count;
  }
  return tiers[tiers.length - 1].price;
}

/** how many more points sit at the current price (Infinity on the last
 * rung) — the tech tree shows this so the next jump is never a surprise */
export function techTierLeft(tower: TowerKind, owned = 0): number {
  const { tiers } = techNode(tower);
  let slot = Math.max(0, Math.floor(owned)) + 1;
  for (const tier of tiers) {
    if (tier.count === undefined) return Infinity;
    if (slot <= tier.count) return tier.count - slot + 1;
    slot -= tier.count;
  }
  return Infinity;
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
