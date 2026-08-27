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
 * hail, scorch and scatter; clearing Medium opens salvo and clearing High
 * opens fuse — each on sale before the enemy it answers is the
 * one that matters.
 *
 * The four ungated nodes are ungated on purpose: every enemy difficulty 1
 * fields, air included, has to have an answer buyable DURING Medium,
 * because a fresh save has no lower difficulty to farm.
 */

/**
 * A node's PRICE CURVE: the nth point costs `base * growth^n` of each item
 * it wants, tidied to a readable number.
 *
 * GROWTH IS NOT A PRICE, IT IS A CEILING. Because the curve is geometric,
 * the count a bank can reach is LOGARITHMIC in that bank: at growth 1.05,
 * going from a million copper to a billion buys 142 more turrets. So the
 * exponent does not really decide what a turret costs — it decides how many
 * of it a player ends up with, forever, however long they play. Every value
 * below was chosen by picking that number first and solving backwards.
 *
 * THE CEILING IS SET BY BOARD SPACE, IN TWO STEPS.
 *
 * FIRST BY FOOTPRINT, because that is what actually competes for tiles:
 *
 *   1x1  ->  500      2x2  ->  200      3x3  ->  100
 *
 * THEN BY RANGE, as `clamp(range / 200, 0.4, 1)`. A short-ranged turret has
 * to sit on the front line and there are only so many front-line tiles, so
 * it cannot usefully occupy the board the way a long-ranged one can — 200
 * units earns the full band, and range can never cut it below 40%. Scorch
 * is the case that forces this: it is 1x1 and would take the top band on
 * footprint alone, but at 60 units it is the shortest-ranged turret in the
 * game and very strong, so it lands at 200 rather than 500.
 *
 *   turret   size  range   band  xrange   ceiling   growth
 *   duo      1x1     160    500    0.80       400   1.0217
 *   hail     1x1     235    500    1.00       500   1.0131
 *   scorch   1x1      60    500    0.40       200   1.0360
 *   scatter  2x2     220    200    1.00       200   1.0318
 *   salvo    2x2     190    200    0.95       200   1.0273
 *   fuse     3x3      90    100    0.45        50   1.1264
 *
 * Ceilings are quoted at a hundred Extreme runs, which is the bank the
 * curves were solved against. They total 3,150 of grass-s's 4,015 buildable
 * tiles, so a player cannot max everything and composition stays a real
 * choice — which is the entire job of this file.
 *
 * DUO IS NOT EXEMPT, though it used to be. A flat price was defensible while
 * the ladder was endless, because enemy LEVEL rose forever and no fixed
 * turret price could outrun it. Four difficulties ended that: level stops at
 * 30, and flat at 8 copper put every tile on the map within fifteen
 * Medium runs. At 400 duos x 27 DPS the fleet still falls short of
 * Extreme's 7,728 health a second, so the specialists are mandatory
 * rather than optional.
 *
 * `from` delays an ITEM rather than the node: `from: { titanium: 30 }` means
 * the first 30 points cost no titanium at all. The exponent is NOT restarted
 * at that point — titanium joins at `base * growth^30`, its honest share of
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
 * ONE: a node's growth is solved from the CEILING its footprint and range
 * earn it, not chosen by feel. See PriceCurve.
 *
 * TWO: A COST BUNDLE MUST CARRY THE DROP RATIO OF THE TIER THAT UNLOCKS IT.
 * The baseline supplies copper : titanium : thorium at roughly 100 : 21 : 4.6
 * and the ratio only widens as the ladder fields more heavies, so every
 * bundle below is written at about that shape. Get it wrong — demand
 * 100 : 10 : 0.4 against a supply of 100 : 21 : 4.6 — and the mismatched
 * currency is the ONLY real constraint while the others pile up unspent,
 * which reads to a player as a broken economy rather than a tuned one.
 *
 * Keep the FIRST point of any newly-gated node payable out of the tiers
 * already cleared when its gate opens, or the node unlocks into a wall.
 */
export const TECH_TREE: readonly TechNodeDef[] = [
  {
    // THE VOLUME TURRET, and the only lever a stalled player has — so it is
    // copper-only and the second-gentlest curve in the tree. A run that dies
    // before the baseline's first mace wave banks no titanium at all, and duo
    // capacity has to stay buyable out of that run or the save is stuck.
    // 8 copper is a shade under ten dagger kills and the first fifty points
    // barely move off it; the curve only bites near its 400 ceiling, where
    // the question stops being "can I afford one more" and becomes "is one
    // more duo worth a salvo"
    tower: "duo",
    price: { base: { copper: 8 }, growth: 1.0212 },
    x: 2,
    y: 0,
  },
  {
    // the first AoE, and the moment tier 1 and tier 2 stop being difficulty:
    // splash scales with bodies per blast and collapses with health per
    // body, so one hail shell kills five daggers and chips a spiroct
    tower: "hail",
    price: { base: { copper: 40, titanium: 6 }, growth: 1.0127 },
    requires: "scatter",
    x: 1,
    y: 2,
  },
  {
    // ungated like hail and strong out of proportion to its price: a
    // piercing flame rakes a whole file of units and sets each alight, and
    // burning ignores armour outright. 60 units of range is the whole cost
    tower: "scorch",
    price: { base: { copper: 60, titanium: 9 }, growth: 1.035 },
    requires: "arc",
    x: 3,
    y: 2,
  },
  {
    // anti-air only, and UNGATED for the same reason hail and scorch are:
    // flares debut at wave 8, inside difficulty 1, so a gate of any kind
    // would lock the answer to air behind the run that first asks for it.
    // The price gates it on its own — 120 copper / 20 titanium / 3 thorium
    // is first affordable after wave 7, one wave before the flares
    tower: "scatter",
    price: { base: { copper: 120, titanium: 20, thorium: 3 }, growth: 1.0308 },
    requires: "duo",
    x: 1,
    y: 1,
  },
  {
    // 28 damage a shell — the first turret that puts a fortress (armour 9)
    // back at its printed health instead of ten times it. The reward for
    // clearing Medium
    tower: "salvo",
    price: { base: { copper: 250, titanium: 36, thorium: 6 }, growth: 1.0262 },
    requires: "hail",
    requiresTier: 0,
    x: 1,
    y: 3,
  },
  {
    // the steepest curve in the tree: a fuse battery is meant to be a
    // handful. Three instant piercing rays at 105 damage each, at nine
    // tiles of range — priced so it can never become the whole answer.
    // The reward for clearing High, so it is on sale for exactly one
    // difficulty: Extreme. A gate on the LAST difficulty would mean the
    // turret only ever unlocks after the campaign is already finished
    tower: "fuse",
    price: { base: { copper: 600, titanium: 105, thorium: 34 }, growth: 1.1216 },
    requires: "salvo",
    requiresTier: 1,
    x: 2,
    y: 5,
  },
  // ---------- STUBS: tree shape only, no turret behind them yet --------
  //
  // Lineage is Mindustry's own (content/SerpuloTechTree.java) and the
  // difficulty gates fall out of BUILD MATERIAL: a turret whose Mindustry
  // cost tops out at copper/lead/graphite is Medium, at titanium is High,
  // at thorium or plastanium is Extreme, and at surge alloy belongs to the
  // hidden ERADICATION difficulty that does not exist yet. Every edge below
  // runs to an equal-or-later difficulty, so no child can ever open before
  // its parent.
  {
    // MEDIUM. Chain lightning down a file of ground units, and the root of
    // the short-range branch — scorch and lancer both hang off it
    tower: "arc",
    price: { base: { copper: 50, titanium: 8 }, growth: 1.0277 },
    requires: "duo",
    x: 3,
    y: 1,
  },
  {
    // HIGH. A piercing laser; the ground answer that is not artillery
    tower: "lancer",
    price: { base: { copper: 200, titanium: 30, thorium: 4 }, growth: 1.0394 },
    requires: "scorch",
    requiresTier: 0,
    x: 4,
    y: 3,
  },
  {
    // HIGH. 290 range — the longest reach in the game, and the wave-clear
    // that answers the crawler floods
    tower: "ripple",
    price: { base: { copper: 300, titanium: 45, thorium: 8 }, growth: 1.0595 },
    requires: "salvo",
    requiresTier: 0,
    x: 2,
    y: 4,
  },
  {
    // HIGH. Not a damage turret at all: it drags air units out of formation.
    // In Mindustry it hangs off wave, which we do not have, so it takes its
    // grandparent scorch instead
    tower: "parallax",
    price: { base: { copper: 220, titanium: 34, thorium: 6 }, growth: 1.027 },
    requires: "scorch",
    requiresTier: 0,
    x: 3,
    y: 3,
  },
  {
    // EXTREME. Homing missiles — they chase what they lock, so overkill
    // costs less than it does on a straight-firing line
    tower: "swarmer",
    price: { base: { copper: 350, titanium: 55, thorium: 12 }, growth: 1.0241 },
    requires: "salvo",
    requiresTier: 1,
    x: 0,
    y: 4,
  },
  {
    // EXTREME. A flak wall. The reason to own it is volume of splash, which
    // is why its ceiling is the full 3x3 band
    tower: "cyclone",
    price: { base: { copper: 450, titanium: 75, thorium: 18 }, growth: 1.0543 },
    requires: "swarmer",
    requiresTier: 1,
    x: 0,
    y: 5,
  },
  {
    // ERADICATION. Twin heavy cannon — the highest sustained damage in the
    // game. Gated on clearing Extreme, which today means "after the
    // campaign", and that is deliberate: these three ARE the hidden
    // difficulty's reward, and they light up the moment it ships
    tower: "spectre",
    price: { base: { copper: 900, titanium: 160, thorium: 45 }, growth: 1.1109 },
    requires: "cyclone",
    requiresTier: 2,
    x: 0,
    y: 6,
  },
  {
    // ERADICATION. A continuous beam that melts whatever it rests on
    tower: "meltdown",
    price: { base: { copper: 1000, titanium: 175, thorium: 50 }, growth: 1.1081 },
    requires: "lancer",
    requiresTier: 2,
    x: 4,
    y: 4,
  },
  {
    // ERADICATION. 500 range and one enormous shot — a sniper rather than a
    // defence, and the only turret that can hit a spawn pad from the core
    tower: "foreshadow",
    price: { base: { copper: 1100, titanium: 190, thorium: 55 }, growth: 1.1054 },
    requires: "meltdown",
    requiresTier: 2,
    x: 4,
    y: 5,
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
 * Every node is walked a point at a time, which is cheap because a
 * geometric count is logarithmic in the bank — a few hundred iterations at
 * any bank size, sub-millisecond.
 *
 * The flat branch below is now only reachable through PRICE_GROWTH_SCALE = 0,
 * since no node ships with growth 1. It has to stay: a flat price walked
 * point by point is LINEAR in the bank, and back when duo was flat at 8
 * copper a late save made that loop run into the tens of thousands and took
 * the tech screen over a second to repaint. A division answers it instead.
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
