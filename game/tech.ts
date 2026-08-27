import { addScaled, canAfford, costEntries, pay, type Bank, type Cost, type ItemKind } from "./items";
import { TOWER_KINDS, type TowerKind } from "./types";

/**
 * The tech tree: one square node per turret, laid out as a small graph.
 * A node's point count IS the turret's placement capacity — the first
 * point unlocks the turret (capacity 1) and every further point on the
 * same node is +1 capacity.
 *
 * Nodes gate two ways: the parent node must hold at least one point (the
 * graph edge — a node stays hidden until its parent is bought), and some
 * nodes wait on a TIER of the ladder being cleared. A fresh save sees duo,
 * hail and scorch; clearing tier 1 opens scatter, tier 3 salvo, tier 6
 * fuse — each of them a tier or more before the enemy it answers first
 * walks onto the field.
 */

/**
 * A node's PRICE CURVE: the nth point costs `base * growth^n` of each item
 * it wants, tidied to a readable number.
 *
 * GROWTH 1 — A FLAT PRICE — IS THE DEFAULT HERE, NOT AN ESCAPE HATCH.
 * Geometric prices are the genre reflex (Cookie Clicker's buildings are
 * 1.15 a copy) and they are wrong for the turret a stalled player leans on.
 * The count you can afford grows with the LOGARITHM of income, so it caps
 * near 60-90 forever whatever you earn: at growth 1.08 the 150th duo costs
 * 515k scrap on its own and 6.4M cumulative, against a campaign that pays
 * about 14k a run. A screen full of turrets stops being expensive and
 * becomes arithmetically impossible.
 *
 * Flat is safe here because the treadmill lives somewhere else entirely -
 * on enemy LEVEL (ladder.ts), which raises what a kill costs without ever
 * raising what a turret costs. The units you kill pay for the damage needed
 * to kill them, and the ladder walks on its own.
 *
 * So: the spam turret is flat, and growth stays on the SPECIALISTS, where
 * a hard cap is the point — it is what stops "buy more fuse" from being the
 * answer to everything and keeps composition a real decision.
 *
 *   growth 1.00  flat — the volume turret; thousands are reachable
 *   growth 1.03  gentle — a few hundred
 *   growth 1.06  a stack in the low hundreds
 *   growth 1.09  steep — a battery of a few dozen, meant to stay rare
 *
 * `from` delays an ITEM rather than the node: `from: { copper: 30 }` means
 * the first 30 points cost no copper at all. The exponent is NOT restarted
 * at that point — copper joins at `base * growth^30`, its honest share of
 * the tier. Restarting it would pin that currency at a fraction of its
 * share forever and quietly make one currency the only real constraint.
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
  /**
   * Ladder gate: this tier of the campaign must have been CLEARED before
   * points can go in. Gates sit one or more tiers BEFORE the enemy they
   * answer debuts (see EXTENSION in ladder.ts), so the turret is on sale by
   * the time it is needed rather than the run it is needed.
   */
  requiresTier?: number;
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
 * The tree. Nothing else reads prices, so this is where the economy is
 * tuned; PRICE_GROWTH_SCALE moves every specialist at once.
 *
 * Two rules hold the whole thing up.
 *
 * ONE: the volume turret is flat and everything else grows. See PriceCurve.
 *
 * TWO: A COST BUNDLE MUST CARRY THE DROP RATIO OF THE TIER THAT UNLOCKS IT.
 * The baseline supplies scrap : copper : titanium at roughly 100 : 15 : 2.2
 * and the ratio only widens as the ladder fields more heavies, so every
 * bundle below is written at about that shape. Get it wrong — demand
 * 100 : 10 : 0.4 against a supply of 100 : 15 : 2.2 — and the mismatched
 * currency is the ONLY real constraint while the others pile up unspent,
 * which reads to a player as a broken economy rather than a tuned one.
 *
 * Keep the FIRST point of any newly-gated node payable out of the tiers
 * already cleared when its gate opens, or the node unlocks into a wall.
 */
export const TECH_TREE: readonly TechNodeDef[] = [
  {
    // THE VOLUME TURRET, and the only lever a stalled player has — so it is
    // FLAT, forever, and scrap-only. A run that dies before the baseline's
    // first mace wave banks no copper at all, and duo capacity has to stay
    // buyable out of that run or the save is stuck. 8 scrap is a shade under
    // ten dagger kills; the fleet grows with the bank, in a straight line,
    // for as long as there is rock to stand on
    tower: "duo",
    price: { base: { scrap: 8 }, growth: 1 },
    x: 1,
    y: 0,
  },
  {
    // the first AoE, and the moment tier 1 and tier 2 stop being difficulty:
    // splash scales with bodies per blast and collapses with health per
    // body, so one hail shell kills five daggers and chips a spiroct
    tower: "hail",
    price: { base: { scrap: 40, copper: 6 }, growth: 1.03 },
    requires: "duo",
    x: 1,
    y: 1,
  },
  {
    // ungated like hail and strong out of proportion to its price: a
    // piercing flame rakes a whole file of units and sets each alight, and
    // burning ignores armour outright. 60 units of range is the whole cost
    tower: "scorch",
    price: { base: { scrap: 60, copper: 9 }, growth: 1.05 },
    requires: "duo",
    x: 2,
    y: 1,
  },
  {
    // anti-air only. Gated on tier 1 so it is on sale a full tier before
    // flares first appear at tier 2
    tower: "scatter",
    price: { base: { scrap: 120, copper: 20, titanium: 3 }, growth: 1.04 },
    requires: "duo",
    requiresTier: 1,
    x: 0,
    y: 1,
  },
  {
    // 28 damage a shell — the first turret that puts a fortress (armour 9)
    // back at its printed health instead of ten times it. Gated on tier 3,
    // five tiers before the fortress debuts
    tower: "salvo",
    price: { base: { scrap: 250, copper: 36, titanium: 6 }, growth: 1.06 },
    requires: "hail",
    requiresTier: 3,
    x: 1,
    y: 2,
  },
  {
    // the steepest curve in the tree: a fuse battery is meant to be a
    // handful. Three instant piercing rays at 105 damage each, at nine
    // tiles of range — priced so it can never become the whole answer
    tower: "fuse",
    price: { base: { scrap: 600, copper: 105, titanium: 34 }, growth: 1.09 },
    requires: "salvo",
    requiresTier: 6,
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
    if (n < (from?.[item] ?? 0)) continue; // this item isn't charged for yet
    // NOT `g ** (n - starts)`: a delayed currency joins the ladder where it
    // actually stands, not at the bottom of a second one
    out[item] = tidy(amount * g ** n);
  }
  return out;
}

/** can this wallet pay for the next point on the node? */
export function canAffordTech(bank: Bank, tower: TowerKind, owned = 0): boolean {
  return canAfford(bank, techPrice(tower, owned));
}

/**
 * How many more points this wallet buys on one node, spending nothing else.
 *
 * A geometric node is walked a tier at a time, which is cheap because the
 * count it can reach is logarithmic in the bank — a few dozen iterations at
 * any bank size. A FLAT node is not: at 8 scrap a point a late bank buys
 * tens of thousands, and walking that on every render made the tech screen
 * take over a second to repaint. Its price never changes, so the answer is
 * a division instead.
 */
export function affordablePoints(
  bank: Bank,
  tower: TowerKind,
  owned = 0,
  limit = Infinity,
): number {
  const n = Math.max(0, Math.floor(owned));
  const price = techPrice(tower, n);
  const entries = costEntries(price);
  if (entries.length === 0) return 0;

  if (effectiveGrowth(techNode(tower).price.growth) === 1) {
    let most = Infinity;
    for (const { item, amount } of entries) most = Math.min(most, Math.floor(bank[item] / amount));
    return Math.max(0, Math.min(most, limit));
  }

  const left = { ...bank };
  let bought = 0;
  while (bought < limit) {
    const next = techPrice(tower, n + bought);
    if (!canAfford(left, next)) break;
    pay(left, next);
    bought++;
  }
  return bought;
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
