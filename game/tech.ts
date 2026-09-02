import {
  addScaled,
  canAfford,
  costEntries,
  ITEM_KINDS,
  pay,
  type Bank,
  type Cost,
  type ItemKind,
} from "./items";
import { TOWERS } from "./constants";
import {
  ALL_UPGRADES,
  isUpgradeNode,
  ULTIMATE_TIER,
  NO_UPGRADES,
  TURRET_UPGRADES,
  upgradedTower,
  upgradeParent,
  UPGRADE_KINDS,
  type TurretUpgradeDef,
  type UpgradeContext,
  type UpgradeKind,
  type UpgradePoints,
} from "./upgrades";
import { TOWER_KINDS, type TowerKind } from "./types";

/**
 * The nodes that are neither turrets nor turret upgrades.
 *
 * `home` is the trunk everything hangs off — it is bought for nothing and
 * granted to every save, because a root that could be missed would leave
 * the whole tree hidden behind it. It exists to give the tree TWO paths out
 * of one place: turrets down the middle, and the utilities off to the side.
 *
 * The three speed nodes are the utilities path, and they are a different
 * KIND of purchase from a turret. A turret node's points are
 * capacity, so it takes points forever; a utility is a SWITCH, so it takes
 * exactly one (see `cap`) and then reads as owned.
 *
 * NOTHING DECIDES WHAT A RUN MAY BRING ANY MORE. What this tree sells is
 * OWNERSHIP, and ownership is campaign-wide: a turret bought is a turret
 * placeable, on rung 1 and on rung 10 alike.
 *
 * A RUNG USED TO HAVE A ROSTER CEILING OF ITS OWN — `bandForTier`, a fixed
 * per-difficulty limit on how far up the currency list a turret's price
 * could reach, so the opening rung stayed a first-three-currencies fight
 * forever however much tech the save owned. It is deleted. It was the
 * anti-farm guard for a four-row ladder with big gaps, and it is exactly
 * wrong for the ten-rung climb that replaced it: steamrolling the rung that
 * used to kill you IS the ascension fantasy. The guard is an income
 * gradient now — see LOOT_PER_RUNG in ladder.ts.
 *
 * THE DUO BRANCH USED TO LIVE IN THIS LIST, as four utilities that happened
 * to improve duo. It is gone from here and into upgrades.ts, along with a
 * branch of its own for every other turret in the game — see UPGRADE_KINDS,
 * the tree's THIRD kind of node, whose points buy neither a placement nor a
 * toggle but STATS.
 *
 * `slot-7` and `slot-8` are the utilities that are not about pace: the
 * build bar is a six-slot loadout (BASE_BAR_SLOTS), and each of these
 * widens it by one. They hang off 4x because that is roughly when a save
 * owns more turrets than the bar holds.
 *
 * THE EXPANSION BRANCH that hung off home on the LEFT is gone. It held
 * `overdrive-projector`, a paid-for promise whose block never shipped —
 * a node that took a point and did nothing is a worse deal than no node,
 * so it is out until the block exists. (`world-2` and `final-threat` used
 * to sit there too, one opening the second world and one revealing the
 * hidden top difficulty; both went when maps stopped being bought and the
 * ladder stopped having a hidden top.)
 */
export const UTILITY_KINDS = [
  "home",
  "lives",
  "speed-2",
  "speed-4",
  "speed-8",
  "slot-7",
  "slot-8",
] as const;
export type UtilityKind = (typeof UTILITY_KINDS)[number];

export { UPGRADE_KINDS, isUpgradeNode, type UpgradeKind };

/** anything the tree can hold points in */
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
 * something to own.
 */
export const NODE_SPEED: Readonly<Partial<Record<UtilityKind, number>>> = {
  "speed-2": 2,
  "speed-4": 4,
  "speed-8": 8,
};

/**
 * How many loadout slots the build bar starts with. The bar is a PvZ-style
 * loadout rather than a shelf of everything owned: every save picks which
 * turrets ride in it (Progress.loadout), and the two slot nodes off 4x
 * speed raise this by one each.
 */
export const BASE_BAR_SLOTS = 6;

/**
 * THE BASE'S HEALTH: what it starts with, and how much plating can be
 * bolted onto it.
 *
 * ONE POINT IS THE STOCK BASE, and that is the game as it has always
 * played: a single leak ends the run. The plating node (lives) is what
 * turns that into a resource — every point is one more body the board may
 * let through and still hold — and the two numbers add up to a round
 * hundred at the top so the HUD reads as a percentage without ever having
 * been one.
 */
export const LIVES_BASE = 1;
export const LIVES_CAP = 99;
export const LIVES_MAX = LIVES_BASE + LIVES_CAP;

/** what each utility node is called, and what owning it does */
export const UTILITY_INFO: Readonly<Record<UtilityKind, { name: string; blurb: string }>> = {
  home: {
    name: "Home",
    blurb: "The root of the tree. Turrets run down the middle, utilities off to the side.",
  },
  "lives": {
    name: "Extra Lives",
    blurb:
      "+1 life per point. A boss that reaches the base still ends the run, whatever lives are in hand.",
  },
  "speed-2": { name: "2x Speed", blurb: "Allows running the game at 2x speed." },
  "speed-4": { name: "4x Speed", blurb: "Allows running the game at 4x speed." },
  "speed-8": { name: "8x Speed", blurb: "Allows running the game at 8x speed." },
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
 * THE TURRET UPGRADE BRANCHES, as the sim wants them: resolved stats, not
 * point counts. What each rung DOES lives in upgrades.ts; what follows is
 * how a save's point spread turns into one.
 *
 * A node in `off` reads as though it held no points at all. The points are
 * still there in the save and the node still draws as owned — this is the
 * one place that decides whether they DO anything, so a switch cannot get
 * out of step with the sim.
 */
export const upgradePointsOf = (
  turret: TowerKind,
  levels: TechLevels,
  off?: ReadonlySet<TechKind>,
): UpgradePoints =>
  TURRET_UPGRADES[turret].map((u) =>
    off?.has(u.id) ? 0 : Math.max(0, Math.floor(levels[u.id] ?? 0)),
  );

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
 * The tech tree: one square node per turret, laid out as a small graph.
 * A node's point count IS the turret's placement capacity — the first
 * point unlocks the turret (capacity 1) and every further point on the
 * same node is +1 capacity.
 *
 * A node gates ONE way: the parent must hold at least one point, so a node
 * stays hidden until its parent is bought. That edge is the tree's shape and
 * costs a single cheap point to satisfy. There is no second gate.
 *
 * THE LADDER GATES ARE GONE, AND THE CURRENCY IS THE GATE INSTEAD. Every
 * node used to be able to demand a RUNG be cleared before it would take
 * points; salvo waited on the opening rung, fuse on the middle of the
 * ladder, and the specialists on whichever rung came before the enemy they
 * answered. That was a second gate doing a job the first one already did,
 * because A BUNDLE CANNOT BE PAID IN A CURRENCY ITS RUN DOES NOT DROP. Rung
 * 1 pays copper, titanium and thorium and no plastanium at all
 * (TARGET_DROP_RATIO in ladder.ts), so fuse's fifteen plastanium locks it
 * out of a fresh save on its own, exactly and automatically, with no gate
 * written anywhere.
 *
 * Where the two gates disagreed, the rung gate was WRONG. Thorium starts
 * dropping at wave 7 and a full rung-1 run banks 450 of it — but every node
 * that charged thorium waited on rung 1 being CLEARED, so a save that had
 * not yet cleared it accumulated a currency with nowhere to spend it. A
 * player who dies at wave 17 is exactly the player who needs the next
 * turret, and the gate was denying it to them for the crime of not already
 * being past it.
 *
 * SO EVERY NODE IS OPEN AND THE BANK DECIDES. The four this actually frees
 * on rung 1 are salvo, lancer, ripple and parallax — the thorium sinks.
 * Everything above them still costs plastanium or phase fabric, which the
 * bottom of the ladder does not pay, so they stay shut without being told
 * to.
 *
 * WHERE THE PROSE BELOW STILL NAMES A CUT, it names it by the wave count or
 * the rung. The four named difficulties this ladder was split out of map
 * onto it exactly — Incursion is rung 1 (20 waves), Onslaught is rung 6 (36),
 * and Nemesis and Eradication are rung 10 (50) — so a price rationale
 * written against one of them still reads true against the rung that
 * replaced it.
 *
 * `requiresTier` is kept on the interface and honoured by progress.ts, and
 * nothing uses it. It is the hook for content whose gate genuinely is NOT a
 * currency: a rung high up the ladder ships no new item, so a node meant
 * to wait for one would have nothing else to wait on.
 */

/**
 * A node's PRICE CURVE: the nth point costs `base * growth^n` of each item
 * it wants, tidied to a readable number.
 *
 * GROWTH IS NOT A PRICE, IT IS A CEILING. Because the curve is geometric,
 * the count a bank can reach is LOGARITHMIC in that bank: at growth 1.05,
 * going from a million copper to a billion buys 142 more turrets. So the
 * exponent does not really decide what a turret costs — it decides how many
 * of it a player ends up with, forever, however long they play.
 *
 * NOTHING IS SOLVED ANY MORE. Growth used to be derived per node from its
 * DPS against a footprint-sized span; that whole scheme is gone (see the
 * Knobs doc below). Today every turret is authored at SHARED_GROWTH (1.01,
 * near-flat), utilities sit at 1, and the hard ceiling is techCap
 * (CAP_TILES / footprint area) — so the BASE BUNDLE is where a turret's
 * price lives, and it is play-tested rather than computed.
 *
 * THE ONE DPS CONVENTION, written down once: a splashing or piercing shot
 * is counted as catching FIVE bodies — the crowd case those turrets exist
 * for. It does not have to be true; it has to be the SAME for every
 * turret, because the `dps` annotations only mean anything relative to one
 * another. No price depends on them at runtime.
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
  /**
   * The per-point multiplier, AUTHORED. Every turret carries SHARED_GROWTH
   * (1.01); a utility is a one-point switch and sits at 1. Nothing derives
   * this from dps any more.
   */
  growth?: number;
  /** point index at which an item starts being charged at all (default 0) */
  from?: Partial<Record<ItemKind, number>>;
}

/**
 * How many tiles one turret type may cover once it is maxed. The cap is this
 * divided by the footprint area, so a full stack of any node covers the same
 * 20,000 cells — 69% of the 29,109 buildable ones — and the late game has
 * room to answer a wave with a single turret type if it wants to.
 *
 * A CAP IS ONLY A CAP. Nothing about pricing reads it — a doubling here
 * moves the wall and not one price: what stops a stack in practice is
 * still the geometric curve (base x growth^n), which never looks at this.
 */
export const CAP_TILES = 20000;

/**
 * The most points this node will ever take.
 *
 * A utility names its own — it is a switch, so it stops at one. A turret
 * gets the tile budget divided by its footprint area, which used to be
 * Infinity: a turret point IS a placement, so the price curve was the only
 * thing that ever stopped you. It still does the stopping in practice; this
 * is the wall behind it.
 */
export const techCap = (node: TechKind): number =>
  techNode(node).cap ??
  (isTowerNode(node) ? Math.floor(CAP_TILES / TOWERS[node].size ** 2) : Infinity);

/** growths are authored to four places; solved ones are held to the same */
const round4 = (x: number): number => Math.round(x * 1e4) / 1e4;

/**
 * THE THREE KNOBS, and the whole pricing model.
 *
 *   price(n, item) = base[item] x (base / authoredBase) x growth^n
 *
 * base    what the first purchase costs, in the currency the bundle leads
 *         with. Editing it rescales the whole bundle, so the SHAPE stays the
 *         drop-ratio rule and only the size moves.
 * growth  the per-point climb — the shape of the ladder.
 *
 * TWO KNOBS, NOT THREE. There was a multiplier as well, and it was the same
 * arithmetic as the base: both scaled every item at every point, so base 150
 * with multiplier 1 was byte-identical to base 75 with multiplier 2. Two ways
 * to write one intent, and no way to read back which you meant. The base is
 * the one that survives because it is a number in a currency rather than a
 * bare ratio, so what is stored says what it costs.
 *
 * NOTHING IS SOLVED ANY MORE. A bisection used to derive growth from a damage
 * figure against a fixed lifetime budget, and that budget is exactly what made
 * it impossible to tune by hand: with the total pinned, every growth you tried
 * moved the base underneath you. These three are independent, so one knob does
 * one thing and a play-tested number stays where you put it.
 *
 * DPS survives only as annotation — recommendedBase can turn it into a seed
 * for a brand-new node, but nothing calls it any more and no price depends
 * on it at runtime, so a new bullet type cannot silently re-price the tree.
 */
export interface Knobs {
  /** what the first purchase costs, in the bundle's lead currency */
  base: number;
  /** per-point climb */
  growth: number;
}

/**
 * The lead currency of a node's bundle, and what it costs as authored.
 *
 * A bundle needs a single handle for a knob to move, and the lead item is it:
 * costEntries walks ITEM_KINDS in order, so a node that charges copper leads
 * with copper and one that does not leads with its cheapest tier. Rescaling
 * from that number moves every other currency in step, which is what keeps
 * the drop-ratio shape intact while the size changes.
 */
export function authoredBase(id: TechKind): number {
  return costEntries(techNode(id).price.base)[0]?.amount ?? 0;
}

const overrides = new Map<TechKind, Partial<Knobs>>();

/**
 * Copper per point of damage for a FIRST purchase — a rule of thumb for
 * seeding a node, not a rule the prices obey. It is the median of the ratios
 * the tree already carried, which is why duo lands back on its own 8.
 */
export const BASE_PER_DPS = 0.3;

/** what the rule of thumb would charge to start, from damage alone */
export function recommendedBase(id: TechKind): number | null {
  const dps = techNode(id).dps;
  return dps === undefined ? null : tidy(BASE_PER_DPS * dps);
}

/** every knob in force for this node — the authored value unless overridden */
export function knobsOf(id: TechKind): Knobs {
  const node = techNode(id);
  const o = overrides.get(id) ?? {};
  return {
    base: o.base ?? authoredBase(id),
    growth: o.growth ?? node.price.growth ?? 1,
  };
}

/** the knobs as authored — where a Reset returns to */
export function authoredKnobs(id: TechKind): Knobs {
  const node = techNode(id);
  return { base: authoredBase(id), growth: node.price.growth ?? 1 };
}

/** point one knob somewhere else; undefined restores the authored value */
export function setKnob(id: TechKind, knob: keyof Knobs, value: number | undefined): void {
  const o: Partial<Knobs> = { ...(overrides.get(id) ?? {}) };
  if (value === undefined || !Number.isFinite(value) || value < 0) delete o[knob];
  else o[knob] = value;
  if (Object.keys(o).length === 0) overrides.delete(id);
  else overrides.set(id, o);
}

/**
 * ONE CLIMB FOR THE WHOLE TREE. Every turret is authored at the same growth,
 * because the per-node numbers were never independently playtested — they
 * were solved against a lifetime budget that no longer exists, and fifteen
 * separate steepnesses only ever read as noise on top of the bases, which
 * are the deliberate part. So growth stops being a per-turret decision: the
 * balance page tunes ONE number and every ladder bends with it.
 *
 * Utilities are untouched at growth 1 — a one-point switch has no ladder.
 */
export const SHARED_GROWTH = 1.01;

/** the climb every turret is on — they move together, so any one of them answers */
export function globalGrowth(): number {
  return knobsOf("duo").growth;
}

/** bend every turret's ladder at once; undefined restores SHARED_GROWTH */
export function setGlobalGrowth(value: number | undefined): void {
  for (const t of TOWER_KINDS) setKnob(t, "growth", value);
}

/** only what has actually been bent, for the balance document */
export function allOverrides(): Record<string, Partial<Knobs>> {
  return Object.fromEntries([...overrides].map(([k, v]) => [k, { ...v }]));
}

/** replace every override at once — what a saved balance document applies */
export function applyOverrides(doc: Record<string, Partial<Knobs>>): void {
  overrides.clear();
  for (const k of TECH_KINDS) {
    const v = doc[k];
    if (!v || typeof v !== "object") continue;
    const clean: Partial<Knobs> = {};
    for (const key of ["base", "growth"] as const) {
      const n = v[key];
      if (typeof n === "number" && Number.isFinite(n) && n >= 0) clean[key] = n;
    }
    if (Object.keys(clean).length > 0) overrides.set(k, clean);
  }
}

/** the per-point climb this node charges */
export function growthOf(id: TechKind): number {
  return round4(knobsOf(id).growth);
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
  /** which node this is — a turret, or one of the utilities (UTILITY_KINDS) */
  id: TechKind;
  /** what this node's points cost — the base bundle, and how it climbs */
  price: PriceCurve;
  /**
   * The turret damage per second at its full ceiling, measured when the
   * turret was built. AN ANNOTATION, NOT A PRICE INPUT: no runtime price
   * reads it (recommendedBase can turn it into a seed for a brand-new
   * node), and the sim computes real damage from the bullet, never from
   * here.
   *
   * A splashing or piercing shot counts as catching FIVE bodies. That does
   * not have to be true; it has to be the SAME for every turret, because
   * the numbers only mean anything relative to one another.
   *
   * Absent on a utility, which has no damage.
   */
  dps?: number;

  /** parent node: needs >= 1 point before this node appears in the tree */
  requires?: TechKind;
  /**
   * Hard ceiling on points, if the node writes one.
   *
   * Turrets leave it unset and get techCap instead — CAP_TILES over the
   * footprint's area, the wall behind the near-flat price curve. A utility
   * is a switch rather than a stack — 2x speed is on or it is not — so
   * those stop at one and go quiet.
   */
  cap?: number;
  /**
   * Ladder gate: this RUNG must have been CLEARED before points can go in.
   *
   * NOTHING SETS THIS, deliberately — see the note at the top of the file.
   * A turret that costs a scarce currency is already paced by its price,
   * and saying it twice locked thorium nodes away from the run that was
   * banking the thorium. Reach for this only when a
   * node's gate is genuinely not a currency.
   */
  requiresTier?: number;
  /**
   * CAN THIS NODE BE SOLD BACK? Default no, and that is the tree's rule
   * rather than an oversight: a tech tree whose every point could be
   * refunded is not a tree, it is a loadout screen, and the whole weight
   * of a purchase is that it was a choice.
   *
   * THE ULTIMATES ARE THE EXEMPTION — an upgrade branch's fourth rung, and
   * nothing else. They earn it by being the only nodes priced in SURGE
   * ALLOY, a currency a boss pays once and no amount of farming produces
   * (grantRunReward): a save with three surge to its name is choosing
   * which three turrets get transformed, and it has to be able to change
   * its mind without felling another boss. A refund returns EXACTLY what
   * the point cost, so flipping one off and on again is free and never a
   * way to farm.
   */
  refundable?: boolean;
  /**
   * MAY THIS NODE'S EFFECT BE SWITCHED OFF WITHOUT SELLING IT? — see
   * Progress.techOff.
   *
   * A refund hands the points back for currency and the node stops being
   * owned. A toggle keeps every point exactly where it is and only stops
   * APPLYING them, which is the difference between a shop and a settings
   * switch. A save that bought graphite rounds and then found it did not
   * want to play with them can put them down without being punished for
   * having tried.
   *
   * IT IS FOR THE ONE-SHOT NODES, NOT THE STACKING ONES — an upgrade
   * branch's third and fourth rungs, and nothing else. Each of those is a
   * single yes-or-no that changes what the turret IS: a different round, a
   * different target list, a different weapon. "Not right now" is a
   * sentence that means something on them. The first two rungs are dials:
   * their answer is a NUMBER the player already chose by deciding how many
   * points to spend, and a switch on a dial is just a second, worse way to
   * set it to zero.
   *
   * Only nodes whose effect is a RULE the sim reads every frame can carry
   * this at all. Capacity cannot: switching off a turret's points would
   * strand towers already standing on the board.
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
   * passes under. It is not a matter of tidiness. It is the difference
   * between a graph and a picture of some lines.
   *
   * The rule is easy to break by accident, because a node moves for
   * reasons that have nothing to do with the edges that pass near it. It
   * was broken exactly that way once: the duo branch took the middle
   * column, and scorch's two children — wave to its left and, from wave,
   * parallax back out to its right — wove across that column twice.
   * Nothing about the duo nodes looked wrong, and nothing about scorch
   * had changed.
   *
   * SO THE BOARD IS LAID OUT IN WINGS, and that is the discipline that
   * keeps the rule. Home is the junction. The meta chains — mutations and
   * the pace/slot switches — run NORTH out of it, at negative y, one to
   * each side. The turrets run south, and duo's three children own three
   * strips that never interleave: the scatter wing takes columns 0-2, the
   * duo branch takes column 3 alone and goes straight down, and the arc
   * wing takes 4-6. A subtree stays inside its strip, so no edge of one
   * ever has business in another.
   *
   * The board is deliberately wider than it needs to be. There is no cost
   * to an empty column and a real cost to a crossing, so when a wing runs
   * out of room the answer is to push the wings outward, never to weave a
   * branch back through the middle.
   *
   * y is the depth — a child sits BELOW its parent (or, in the north,
   * above it) — and x spreads siblings sideways.
   *
   * AN UPGRADE NODE IS NOT ON THIS GRID, and still is not — but it IS a
   * box with an edge into it. The rungs under a turret carry their
   * turret's own cell here and are laid out INSIDE it, as a horizontal
   * chain under the turret's name (TechTree.tsx). So the grid stays a grid
   * of turrets, the wings keep their strips, and the crossing rule holds:
   * a chain never leaves its own cell, and a turret's outgoing edges leave
   * from BELOW its chain rather than through it.
   *
   * They were a row of unconnected chips until then, which was cheaper and
   * said less — a chip cannot show what comes before it, and every other
   * relationship on the board is a line.
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
 * ONE: the base bundle is the price. Growth is one shared, near-flat
 * constant for every turret (SHARED_GROWTH) and the hard wall is techCap,
 * so what a node charges is its authored base — play-tested, not solved.
 * See PriceCurve and Knobs.
 *
 * TWO: A COST BUNDLE MUST CARRY THE DROP RATIO OF THE DIFFICULTY THAT
 * UNLOCKS IT — and since the tier gates are gone, THE BUNDLE IS THE GATE, so
 * this rule now decides not just what a node costs but when it exists.
 * Supply is TARGET_DROP_RATIO in ladder.ts — the enemy mix the waves are
 * authored to send — and the bundles below are shaped to match it in
 * aggregate: about 100 : 27 : 10 : 0.7 : 0.13. Get it wrong and the
 * mismatched currency becomes the ONLY real constraint while the others pile
 * up unspent, which reads to a player as a broken economy rather than a
 * tuned one.
 *
 * SCATTER IS WHERE THAT WENT WRONG ONCE, and it is the worked example to
 * read before touching a bundle. It asked 50 copper : 10 titanium, a 5:1
 * ratio against a rung-1 run that pays 6.67:1, so titanium ran dry first and put
 * a hard cap on how many a player could own however much copper they had.
 * The turret felt overpriced; the PRICE was fine and the SHAPE was wrong.
 *
 * The currency also picks the RUNG. Plastanium appears first on the nodes
 * meant for the T4s of the middle rungs and phase fabric only on the ones
 * paid for by the top rungs' own T5 kills (see TARGET_DROP_RATIO in
 * ladder.ts) — and a currency nothing drops yet is an absolute lock, which
 * is exactly why no node needs a rung gate on top of it. The converse is
 * the trap: charging a currency EARLIER than intended unlocks a node into a
 * wall, and charging it LATER than intended opens content a rung early.
 *
 * DUO IS THE ONE EXEMPTION AT THE BOTTOM: copper-only, forever. A run that
 * dies before the first mace banks no titanium at all, and duo capacity has
 * to stay buyable out of that run or a bad save has no way back.
 *
 * THREE: THE LATE NODES PAY NO COPPER AT ALL — fuse, tsunami, swarmer,
 * cyclone, spectre, meltdown and foreshadow. It is duo's rule read from
 * the other end: copper is the bootstrap currency, and the endgame is
 * where you have outgrown it. (Tsunami arrived after the substitution
 * below and was simply born copper-free; the accounting that follows is
 * about the original six.)
 *
 * This is a SUBSTITUTION, NOT A DISCOUNT, and not a price rise either. Those
 * six held 56% of the tree's entire copper bill — 10.1M of 17.9M — and the
 * value came back as titanium, thorium, plastanium and phase on the same six
 * nodes. What it buys is that the supply the waves pay and the demand the
 * tree charges finally have the same SHAPE: under the curves of the day,
 * every currency maxed the whole tree in a comparable 385-391 full-script
 * runs, where before plastanium needed 8,736 and phase could not be spent
 * at all.
 *
 * It also had to happen for the ratio to move. The waves cut low-tier bodies
 * for room on the map (TARGET_DROP_RATIO in ladder.ts), which cuts copper
 * income hardest; leaving the copper bill where it was would have made
 * copper the one gate on a tree whose top half no enemy pays for.
 *
 * The early and mid nodes are untouched — copper and all. Everything a
 * rung-1 run can reach is priced exactly as it was playtested, and wave
 * joined that half of the tree on the same copper-and-titanium shape.
 *
 * Keep the FIRST point of every node payable out of the rung whose currency
 * it debuts on, or that node is decoration.
 */
/**
 * WHERE THESE BASE BUNDLES COME FROM: MINDUSTRY'S OWN BUILD COSTS.
 *
 * A first purchase used to be a first-pass number nobody had checked, and the
 * spread showed it — base against damage ran 425x across the tree, which is
 * not a rule, it is an accident. Mindustry has shipped and been played for
 * years with build costs for every one of these turrets, so it is the one
 * independent opinion available on what a turret is worth.
 *
 * THE SOURCE, both from the upstream repo:
 *   Blocks.java  requirements(Category.turret, with(...)) — the build cost
 *   Items.java   Item.cost — copper 0.5, lead 0.7, graphite 1.0, silicon 0.8,
 *                titanium 1.0, thorium 1.1, plastanium 1.3, surge 1.2,
 *                metaglass 1.5. Mindustry's own notion of item worth, which
 *                is what lets a bundle using lead and silicon be compared to
 *                one using ours.
 *
 * A turret's Mindustry value is the sum of amount x item cost. Ranked, the
 * seventeen we ship run:
 *
 *   duo 17.5 · scorch 34.5 · hail 37 · arc 60 · scatter 74 · wave 132.5
 *   swarmer 152.5 · lancer 157 · salvo 180 · ripple 270 · parallax 288
 *   cyclone 329 · fuse 447.5 · tsunami 790 · spectre 1552.5 · meltdown 1795
 *   foreshadow 2500
 *
 * ONLY THE ORDER IS BORROWED, NOT THE SPREAD. Their costs span 143x and ours
 * span 10,299x, because our drop ratio makes phase fabric worth 769 copper
 * while their dearest item is 3x copper. Importing their magnitudes would
 * flatten the tier progression into nothing. So the order is the constraint
 * and a power law supplies the size:
 *
 *   base value = 0.03876 x (mindustry value)^1.862   [copper-equivalent]
 *
 * A power law is monotone, so the ranking survives exactly. Its two constants
 * are fixed by two anchors: duo stays at 8 copper, because a save that dies
 * before the first mace has to be able to earn out of it, and foreshadow stays
 * where it was, because it is the most expensive turret in all of Mindustry
 * and belongs at the top of ours too.
 *
 * SWARMER AND LANCER ARE A PHOTO FINISH upstream — 152.5 against 157, three
 * per cent apart — and plastanium is worth 143 copper apiece here, so one
 * unit of it swamps that gap. Swarmer carried one plastanium for a while to
 * keep the fitted order intact; it carries TWO now, a deliberate override of
 * the fit rather than a correction to it. The photo finish is the reason
 * that decision is a judgement call at all: at this spacing the power law
 * cannot tell the two turrets apart, so the bundle is hand-picked. If a
 * future turret lands this close to a neighbour, expect the same.
 *
 * GROWTH IS ONE CONSTANT FOR EVERY TURRET, AND THAT IS DELIBERATE. It used
 * to vary from 1.0007 to 1.0854, but those were not decisions — they were
 * whatever the old solver produced from a damage figure before it was
 * deleted, and left alone they scrambled the very ordering these bundles
 * import. At a late bank they had parallax as the most-owned turret in the
 * game, ahead of duo, purely because its 1.0007 was nearly flat; ripple,
 * which costs less than parallax, came out at a tenth of it.
 *
 * With one growth for everyone the count follows the BASE, and the base
 * follows Mindustry, so what a player ends up owning agrees with the order
 * above instead of fighting it. At 1.01 that runs from about 855 duos down
 * to 39 foreshadows at a late-campaign bank.
 *
 * Balance lives in the turret's own stats now, not in its price curve, so
 * growth has no per-turret work left to do. THE FIELD STAYS PER NODE
 * REGARDLESS: count depends on base only logarithmically, so a 10,000x
 * spread in price compresses to about 14x in count, and growth is the only
 * tool that can make one turret genuinely rare. Constant is the baseline,
 * not a rule — break it for a node that earns it.
 *
 * TO PRICE A NEW TURRET: find its requirements in Blocks.java, sum amount x
 * Item.cost, put that through the formula, and split the result across the
 * currencies its tier charges using TARGET_DROP_RATIO — the bundle SHAPE is
 * still rule TWO below, this only decides how big it is. Move the top anchor
 * to lengthen or shorten the campaign; the order holds either way.
 *
 * WHAT THE FIT ALSO TOLD US, worth reading before trusting a DPS figure: the
 * turrets that moved most are the ones where our damage number disagrees with
 * Mindustry hardest. Swarmer fell to 0.12x because Mindustry prices it level
 * with lancer, while we credit it with 1,925 DPS against lancer's 420. And
 * foreshadow, which looked overpriced against its 405 DPS, is upstream's most
 * expensive turret of all twenty-eight. In both the price is the second
 * opinion and the DPS is the number to re-derive.
 */
/**
 * Sum of amount x Item.cost for each turret's Mindustry build cost, from the
 * ranking in the comment above. Nothing in pricing reads it — the bundles
 * already encode it — but the balance view sorts by it so the tree reads in
 * the order upstream priced it rather than in implementation order.
 */
export const MINDUSTRY_VALUE: Record<TowerKind, number> = {
  duo: 17.5,
  scorch: 34.5,
  hail: 37,
  arc: 60,
  scatter: 74,
  // wave: metaglass 45x1.5 + lead 75x0.7 + copper 25x0.5 — and tsunami:
  // metaglass 100x1.5 + lead 400x0.7 + titanium 250 + thorium 100x1.1.
  // The liquid turrets went through the same power law as everyone else
  // when they shipped; see their nodes for how a support turret's price
  // survives a 4-DPS bullet
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

const MAIN_TREE: readonly TechNodeDef[] = [
  {
    // THE ROOT, AND THE ONLY FREE NODE. It costs nothing, every save is
    // granted it (progress.ts), and its cap of one means it never asks for
    // a second point — it is a junction, not a purchase.
    //
    // It exists because the tree now forks at the top. Duo and the fourteen
    // turrets below it are one path; the utilities are the other, and they
    // buy PACE rather than firepower. Hanging both off a single visible
    // root is what makes that a fork rather than two unrelated trees.
    id: "home",
    price: { base: {}, growth: 1 },
    cap: 1,
    x: 3,
    y: 0,
  },
  {
    // THE VOLUME TURRET, and the only lever a stalled player has — so it is
    // copper-only. A run that dies before the baseline's first mace wave
    // banks no titanium at all, and duo capacity has to stay buyable out of
    // that run or the save is stuck.
    // Also the cheapest node in the tree, because 27 DPS is the least any
    // turret does and the price rule pays exactly that much attention to it.
    // A top-difficulty run roughly maxes it; five hundred duos are still
    // only 13,500 DPS, so it stays the thing you open with, never the answer
    id: "duo",
    price: { base: { copper: 8 }, growth: 1.01 },
    dps: 27,
    requires: "home",
    x: 3,
    y: 1,
  },
  {
    // the first AoE, and the moment tier 1 and tier 2 stop being difficulty:
    // splash scales with bodies per blast and collapses with health per
    // body, so one hail shell kills five daggers and chips a spiroct
    id: "hail",
    price: { base: { copper: 20, titanium: 4 }, growth: 1.01 },
    dps: 165,
    requires: "scatter",
    x: 2,
    y: 3,
  },
  {
    // ungated like hail and strong out of proportion to its price: a
    // piercing flame rakes a whole file of units and sets each alight, and
    // burning ignores armour outright. 60 units of range is the whole cost
    id: "scorch",
    price: { base: { copper: 20, titanium: 3 }, growth: 1.01 },
    dps: 850,
    requires: "arc",
    x: 4,
    y: 3,
  },
  {
    // anti-air only, and UNGATED for the same reason hail and scorch are:
    // flares debut inside rung 1, so a gate of any kind would lock the
    // answer to air behind the run that first asks for it.
    //
    // PRICED WELL BELOW ITS PAPER DPS, deliberately. Flak DPS is the
    // highest on the cheap half of the tree, but it only ever fires at AIR
    // — and air is a small slice of the health a run sends. Flak wants to
    // be the answer a player reaches for against a flare cloud, and
    // reaching for it means owning enough to cover more than one lane, so
    // the bundle charges for the slice it can shoot at, not the number on
    // the stat card.
    //
    // COPPER AND TITANIUM ONLY. It used to want thorium, which comes from
    // tier-3 kills and so does not flow until well into a rung-1 run — and
    // since hail hangs off this node (Mindustry's own lineage: duo ->
    // scatter -> hail), a thorium price here locked the cheap ground AoE
    // behind the T3 waves too. Upstream builds scatter from copper and lead,
    // a tier-1 cost; this is that, in our currencies
    id: "scatter",
    price: { base: { copper: 75, titanium: 10 }, growth: 1.01 },
    dps: 1450,
    requires: "duo",
    x: 2,
    y: 2,
  },
  {
    // 28 damage a shell — the first turret that puts a fortress (armour 9)
    // back at its printed health instead of ten times it. THE FIRST THORIUM
    // NODE, and so the first thing a rung-1 run's thorium is for: it opens
    // around wave 7, when the T3 kills that pay for it start arriving. It
    // also shoots AIR, which makes it the second answer to the flare waves
    // and half the reason scatter no longer has to be priced as the only one
    id: "salvo",
    price: { base: { copper: 175, titanium: 60, thorium: 20 }, growth: 1.01 },
    dps: 217,
    requires: "hail",
    x: 2,
    y: 4,
  },
  {
    // Three instant piercing rays at 105 damage each — among the highest
    // DPS on the roster, and the price says so.
    // Nine tiles of range is no longer a discount: the map already decides
    // how much of a gate one can hold (see PriceCurve).
    // PLASTANIUM IS THE PACING: fifteen of it, against the ~1,100 a full
    // clear banks. Every rung plays every wave, so a fresh save can reach
    // this — it just spends several runs doing it, which is the price
    // doing the job the old rung gate did by hand
    id: "fuse",
    price: { base: { titanium: 65, thorium: 80, plastanium: 15 }, growth: 1.01 },
    dps: 4109,
    requires: "salvo",
    x: 2,
    y: 6,
  },
  {
    // Chain lightning down a file of ground units, and the root of
    // the short-range branch — scorch and lancer both hang off it.
    // 411 DPS is TWELVE node bullets a bolt rather than one shot catching
    // five: arc's shot walks, and every node it lands on is a separate
    // plain bullet taking one body. Measured on a file of ten daggers, one
    // bolt lands 217 of its theoretical 240
    id: "arc",
    price: { base: { copper: 50, titanium: 9 }, growth: 1.01 },
    dps: 411,
    requires: "duo",
    x: 4,
    y: 2,
  },
  {
    // A piercing laser; the ground answer that is not artillery.
    // FOUR bodies, not the usual five — pierceCap 4 is a hard stop written
    // into the bullet, and the beam visibly ends at the fourth thing it
    // hits, so counting five would be pricing a shot it cannot fire
    id: "lancer",
    price: { base: { copper: 150, titanium: 40, thorium: 15 }, growth: 1.01 },
    dps: 420,
    requires: "scorch",
    x: 6,
    y: 4,
  },
  {
    // 290 range — outreached only by parallax's pull and foreshadow's
    // rail, and the wave-clear that answers the crawler floods.
    // Four shells a volley at 70 splash,
    // and like every artillery piece only the splash counts: the shell
    // arcs over its target rather than hitting it
    id: "ripple",
    price: { base: { copper: 450, titanium: 125, thorium: 35 }, growth: 1.01 },
    dps: 700,
    requires: "salvo",
    x: 1,
    y: 5,
  },
  {
    // THE FIRST LIQUID TURRET, and the second node after parallax whose
    // price the DPS rule cannot see: 4 damage a second is the least any
    // shooting turret does, and it is beside the point. Wave's water SLOWS
    // — everything it hoses drives at 65% speed (see BulletStats.wet), so
    // it multiplies every other turret covering the same lane instead of
    // killing anything itself. Which is exactly why it cannot be nearly
    // free: a force multiplier priced on its own damage would be the best
    // purchase in the game. So it takes parallax's road — the Mindustry
    // build-cost power law (see the ranking above), which lands it between
    // scatter and lancer at ~350 copper-equivalent, and the bundle carries
    // rung 1's copper:titanium drop ratio so neither currency gates
    // alone. Upstream it builds from metaglass and lead, a tier-1/2 cost:
    // buyable partway through a rung-1 run, like the fight that first wants it
    id: "wave",
    price: { base: { copper: 225, titanium: 35 }, growth: 1.01 },
    dps: 4,
    requires: "scorch",
    x: 4,
    y: 4,
  },
  {
    // Not a damage turret at all: it drags air units out of formation.
    // It hangs off wave, exactly where Mindustry's tech tree puts it —
    // it used to borrow its grandparent scorch while wave did not exist.
    //
    // A NODE THE DPS NUMBER CANNOT SEE (wave and tsunami share the
    // problem): 30 armour-piercing damage a second on ONE target is the
    // least in the game. What the number is not counting is the
    // pull, which is the whole turret: it drags a flare at 85% of its own
    // top speed and a horizon at 123%, i.e. backwards. Priced on damage a
    // parallax wall is nearly free and answers air outright. Left literal
    // rather than fudged, because the rule is the rule and a second one
    // invented here would not be
    id: "parallax",
    price: { base: { copper: 500, titanium: 125, thorium: 45 }, growth: 1.01 },
    dps: 30,
    requires: "wave",
    x: 5,
    y: 5,
  },
  {
    // Wave's heavy sibling, on wave's own lineage (Mindustry hangs both
    // tsunami and parallax off wave) and priced by wave's own argument,
    // scaled up: 8 DPS on paper, but everything crossing its 190-unit
    // umbrella drives at 45% speed for four seconds — better than doubling
    // what every turret around it gets done. The power law puts its 790
    // Mindustry value at ~9.6k copper-equivalent, three fuses, and the
    // bundle is cyclone's late-ladder shape scaled: no copper (rule THREE),
    // and PLASTANIUM IS THE GATE. Upstream its build cost tops out at
    // thorium, but a 9.6k support piece opening on rung 1 would trivialise
    // the run that banks it — the price says the middle of the ladder at the
    // earliest, so the bundle does too
    id: "tsunami",
    price: { base: { titanium: 360, thorium: 310, plastanium: 36 }, growth: 1.01 },
    dps: 8,
    requires: "wave",
    x: 4,
    y: 5,
  },
  // ---------- THE TOP OF THE LADDER ------------------------------------
  //
  // These five were stubs — a tech-tree shape with duo's bullet behind it —
  // and their growths were scaffolding, because a placeholder bullet makes
  // a node's DPS unknowable. They now carry their own ammo and their own
  // solved curves; see the table in PriceCurve for what each one reads.
  //
  // Lineage is Mindustry's own (content/SerpuloTechTree.java) and the RUNG
  // each one lands at falls out of BUILD MATERIAL, which is now the ONLY
  // thing pacing them: a turret whose Mindustry cost tops out at thorium or
  // plastanium is priced there, and one that wants surge alloy has nothing
  // to charge — surge never drops from a wave — so it is priced in phase
  // fabric, the scarcest thing the script pays (about 200 a full clear
  // against copper's 32,000). Every rung plays every wave, so these are
  // reachable from rung 1 and it is the QUANTITY that holds them back. A
  // child always costs at least what its parent does, so no child can open
  // before its parent even with every gate gone.
  {
    // PLASTANIUM. Homing missiles — they chase what they lock, so overkill
    // costs less than it does on a straight-firing line
    id: "swarmer",
    price: { base: { titanium: 20, thorium: 20, plastanium: 2 }, growth: 1.01 },
    dps: 1925,
    requires: "salvo",
    x: 0,
    y: 5,
  },
  {
    // PLASTANIUM. A flak wall. The reason to own it is volume of splash, which
    // is why its ceiling is the full 3x3 band
    id: "cyclone",
    price: { base: { titanium: 70, thorium: 60, plastanium: 7 }, growth: 1.01 },
    dps: 1797,
    requires: "swarmer",
    x: 0,
    y: 6,
  },
  {
    // PHASE FABRIC. Twin heavy cannon — the highest sustained damage in the
    // game. Phase drops only from the T5 bodies of the last dozen waves, so
    // these three ARE the top rungs' reward — priced there rather than told
    // to wait there
    //
    // THE PHASE SHARE ON THESE THREE IS DELIBERATELY BELOW THE DROP RATIO
    // (a quarter of the rule-TWO split, 30/40/75 -> 8/10/19). The split
    // prices a phase drop off its count in the waves, but a T5 kill costs
    // far more tower-fire than its printed health says — armour 13-18
    // floors most calibres and the escorts shield them — so per EFFORT a
    // phase is worth well over the 1.7 plastanium the old bundles implied.
    // Playtested on the full 50-wave script; do not "fix" these back to the
    // ratio.
    id: "spectre",
    price: { base: { titanium: 200, thorium: 225, plastanium: 55, "phase-fabric": 8 }, growth: 1.01 },
    // 104 x 60/7 x pierceCap 2 — the +30% phase-tier up-gun (constants.ts)
    dps: 1783,
    requires: "cyclone",
    x: 0,
    y: 7,
  },
  {
    // PHASE FABRIC. A continuous beam that melts whatever it rests on
    id: "meltdown",
    price: { base: { titanium: 275, thorium: 300, plastanium: 65, "phase-fabric": 10 }, growth: 1.01 },
    // 1,212/s lit x 230/320 duty x 5 crowd — the +30% up-gun (constants.ts)
    dps: 4356,
    requires: "lancer",
    x: 6,
    y: 5,
  },
  {
    // PHASE FABRIC. 500 range and one enormous shot — a sniper rather than a
    // defence, and the only turret that can hit a spawn pad from the base
    id: "foreshadow",
    price: { base: { titanium: 450, thorium: 525, plastanium: 125, "phase-fabric": 19 }, growth: 1.01 },
    // 1755 x 60/200, no crowd multiplier (the budget already holds the
    // crowd) — the +30% up-gun (constants.ts)
    dps: 527,
    requires: "meltdown",
    x: 6,
    y: 6,
  },
  // ---------- THE UTILITIES PATH ---------------------------------------
  //
  // Three one-point switches off home, in their own column: 2x, 4x and 8x
  // simulation pace. These used to be a constant — 2x and 4x free to
  // everyone, 8x a sandbox tool nobody could reach (the old PLAYER_SPEEDS in
  // game.ts). They are now the second thing a save can spend on. 16x is gone
  // from the tree entirely: sandbox still offers it (SPEEDS in game.ts), but
  // nothing sells it.
  //
  // A FOURTH NODE USED TO TOP THE COLUMN — time warp, which opened every run
  // on wave 10. It is gone: what it sold was the first nine waves of a run,
  // and a run that can skip its own opening is a run whose opening was not
  // worth playing. That is a pacing problem to fix in the script, not a
  // purchase.
  //
  // THEY ARE PRICED AS CONVENIENCE, NOT AS POWER, and that is deliberate:
  // pace changes nothing about whether a board holds. It only decides how
  // long the player sits watching one that already does. Charging turret
  // money for it would be charging for the game's own dead time. The whole
  // path costs less than a single mid-tree turret point.
  //
  // WHAT PACES THEM IS THE CURRENCY, NOT THE NUMBER. Each node asks for one
  // item and a different one, so the path unfolds at exactly the rate the
  // campaign hands out new currencies — titanium from the first mace, thorium
  // once the T3s arrive partway up rung 1, plastanium from the middle rungs,
  // phase fabric only off the T5s. That is the same rule the turrets run on
  // (see TWO at the top of the file): the bundle is the gate, and nothing
  // here needs a rung written on it.
  //
  // THE WHOLE PATH SITS ONE CURRENCY ABOVE WHERE IT STARTED. Copper used to
  // buy 2x, which meant the first wave of a fresh save already handed over
  // fast-forward — pace arrived before there was anything worth skipping.
  // Every node moved up a tier, so thorium now tops out at 4x and the last
  // two multipliers are late-campaign goods.
  //
  // A CHAIN, NOT A FAN. Each one requires the one below it, so the column
  // reads in order and a player cannot own 8x without having wanted 4x.
  {
    id: "speed-2",
    price: { base: { titanium: 25 }, growth: 1 },
    requires: "home",
    cap: 1,
    x: 4,
    y: -1,
  },
  {
    id: "speed-4",
    price: { base: { thorium: 20 }, growth: 1 },
    requires: "speed-2",
    cap: 1,
    x: 4,
    y: -2,
  },
  {
    id: "speed-8",
    price: { base: { plastanium: 15 }, growth: 1 },
    requires: "speed-4",
    cap: 1,
    x: 4,
    y: -3,
  },
  {
    // THE SLOT LADDER — the utilities that sell UI rather than pace. The
    // build bar is a six-slot loadout (BASE_BAR_SLOTS), PvZ-style: every
    // save picks which turrets ride in it, and these two switches widen it
    // to seven and then eight. They branch OFF the pace column rather than
    // continuing it, so 8x never waits on a cosmetic.
    //
    // Priced at a token slice of the currency each one's moment drops:
    // thorium is flowing when speed-4 is buyable — about when a save first
    // owns more turrets than slots — and plastanium paces the eighth slot
    // to the middle rungs, the same bundle-is-the-gate rule as everything else.
    id: "slot-7",
    price: { base: { thorium: 5 }, growth: 1 },
    requires: "speed-4",
    cap: 1,
    x: 5,
    y: -2,
  },
  {
    id: "slot-8",
    price: { base: { plastanium: 5 }, growth: 1 },
    requires: "slot-7",
    cap: 1,
    x: 5,
    y: -3,
  },
  // ---------- THE EXPANSION BRANCH --------------------------------------
  //
  // Home's LEFT fork, mirroring the utilities on the right. What used to
  // hang here were two gates on CONTENT: a node that opened world 2, and one
  // that revealed the hidden top difficulty everywhere. Both are gone, and
  // the reason is the same for each: a campaign whose maps each carry their
  // own ladder has nowhere to put a global unlock. Every map is on the menu
  // from the first run, and every rung of a map's ladder opens by clearing
  // the rung below it there. A purchase that opened either would be a
  // purchase that reached across maps, which is the one thing this model
  // does not do.
  //
  {
    /**
     * EXTRA LIVES — the one node that buys MISTAKES.
     *
     * A base starts on a single point of health (LIVES_BASE), so one
     * leaked body ends the run. Every point here is one more, to a hundred
     * (LIVES_CAP + the base), and the run is won for as long as any of
     * them are left.
     *
     * IT IS THE ONLY FORGIVENESS IN THE GAME and that is why it is priced
     * like a turret branch rather than like the one-point switches beside
     * it. The FIRST point is the one that matters most — it is the
     * difference between a perfect run and a run — so the curve climbs from
     * a bundle a mid-campaign save can already afford, and the hundredth
     * point is a whole campaign's banking.
     *
     * A BOSS IS NOT COVERED BY IT, deliberately (see Sim's leak handler). A
     * hundred points of plating that let a player shrug off the one enemy
     * the script builds towards would turn the boss into a formality; it is
     * armour against the swarm and against nothing else.
     */
    id: "lives",
    price: { base: { copper: 1200, titanium: 320, thorium: 120 }, growth: 1.05 },
    requires: "home",
    cap: LIVES_CAP,
    x: 2,
    y: -1,
  },
];

/**
 * WHAT AN UPGRADE RUNG COSTS, and the one rule the whole branch is priced
 * by: A RUNG IS ITS TURRET'S OWN BUNDLE, SCALED.
 *
 * That is not laziness, it is rule TWO of this file (a cost bundle must
 * carry the campaign's drop ratio) applied to a node that has no bundle of
 * its own. Scaling a bundle preserves its SHAPE exactly, so a
 * scatter upgrade asks for copper and titanium in rung 1's own ratio and a
 * spectre upgrade asks for phase fabric — and because the bundle is the
 * gate, every upgrade rung becomes affordable exactly where its turret does
 * and never one rung earlier. Nothing had to be written down for that to be
 * true.
 *
 * A STAT NODE IS PRICED AGAINST THE ARMY, NOT AGAINST ONE TURRET, which is
 * why the multipliers are so large. Duo capacity is 8 copper a point and a
 * mid-campaign save owns hundreds; +5% fire rate across five hundred duos
 * is worth twenty-five more of them, so a first point that cost what a duo
 * costs would be free money. The same argument holds at every scale, which
 * is what makes ONE multiplier per rung the right shape rather than a
 * table of seventeen.
 *
 * THE CLIMB IS STEEP ON THE DIALS AND FLAT ON THE ONE-SHOTS. A stacking
 * multiplier on a growing army is worth MORE every time the army grows —
 * the one shape the tree's near-flat SHARED_GROWTH cannot price — so the
 * dials climb hard and a one-shot has no ladder to climb at all.
 *
 * THE PRICE IS AUTHORED AGAINST A REFERENCE CAP AND RE-CUT FOR THE REAL
 * ONE. These numbers were written when every tier-1 rung took 15 points
 * and every tier-2 rung took 10, and they still mean exactly that; a rung
 * that now takes a hundred (CAP_DIAL) gets the same total spread over more
 * clicks, at a base and a climb derived below rather than typed twice.
 *
 * SO WIDENING A RUNG COSTS THE PLAYER NOTHING AND DISCOUNTS THEM NOTHING.
 * The same +5% attack speed costs what it always did; it is simply seven
 * purchases instead of one. And a COUNTING rung (CAP_COUNT, where a point
 * is a whole body pierced) keeps the authored curve untouched, because its
 * cap is the one the price was written for.
 */
const UPGRADE_SCALE: readonly number[] = [0, 20, 90, 900];
const UPGRADE_GROWTH: readonly number[] = [0, 1.25, 1.35, 1];
/** the point count each tier's numbers above were authored against */
const UPGRADE_REF_CAP: readonly number[] = [0, 15, 10, 1];

/**
 * WHAT AN ULTIMATE COSTS, IN SURGE ALLOY AND NOTHING ELSE, indexed by the
 * turret's BAND — how far up the currency list its own price reaches (see
 * bandOfCost below).
 *
 * Surge is not a tier and never drops from a wave: a boss's first kill on
 * a (world, rung) pays exactly one (grantRunReward), so the bank's surge
 * column counts boss fights won. That makes it the only honest price
 * for a node that should wait on PROGRESSION rather than on farming, and
 * it is the whole gate — no copper, no thorium, nothing a long enough
 * grind produces.
 *
 * IT CLIMBS WITH THE TURRET because the turrets do. A duo, a scatter or a
 * ripple is a turret the opening rungs field, and one boss buys its
 * ultimate. A plastanium turret costs three, a phase turret six — so
 * transforming a foreshadow would be six boss fights' worth of trophy, and
 * a save cannot have every ultimate in the game without having climbed most
 * of the ladder on most of its maps.
 *
 * THE WHOLE TABLE IS HERE THOUGH ONLY DUO AND ARC HAVE AN ULTIMATE WRITTEN
 * SO FAR (see the note at the top of upgrades.ts). It is indexed by band
 * rather than by turret precisely so that authoring the other fifteen is a
 * question about the turret and never about its price.
 */
export const ULTIMATE_SURGE: readonly number[] = [1, 1, 1, 3, 6];

/** how far up the currency list a bundle reaches — the band, off a Cost */
const bandOfCost = (base: Cost): number => {
  let band = 0;
  for (const { item } of costEntries(base)) band = Math.max(band, ITEM_KINDS.indexOf(item));
  return band;
};

/**
 * DUO'S THREE PLAYTESTED BUNDLES, kept verbatim.
 *
 * They predate the scaling rule and they were tuned by hand against a
 * board of five hundred duos, which is a board no other turret ever
 * reaches — the rule would have charged 160 / 720 / 7,200 copper and every
 * one of those is too cheap for a stat spread across an army that size.
 * The rule is the default; this is the override, and a turret that earns
 * one later belongs here beside them.
 */
const AUTHORED_UPGRADE_PRICE: Partial<Record<UpgradeKind, PriceCurve>> = {
  // duo-rof takes a hundred points, so its bundle is the twenty-point one
  // re-cut by hand the way reCut does it for everything else: a fifth of
  // the base at the fifth root of the climb. duo-pierce COUNTS bodies and
  // still takes ten, so its authored bundle stands as written.
  "duo-rof": { base: { copper: 46, titanium: 12, thorium: 5 }, growth: 1.0456 },
  "duo-pierce": { base: { copper: 1200, titanium: 325, thorium: 120 }, growth: 1.4 },
  "duo-graphite": {
    base: { copper: 60000, titanium: 16000, thorium: 6000, plastanium: 420 },
    growth: 1,
  },
};

/**
 * SPREAD A TIER'S AUTHORED PRICE OVER A DIFFERENT NUMBER OF POINTS, without
 * changing what the whole rung costs.
 *
 * The climb takes the r-th root, so `growth^cap` is exactly what
 * `authored^ref` was — the last point costs the same multiple of the first
 * that it always did. Then the base is scaled by the ratio of the two
 * climbs' step sizes, which is what makes the SUMS equal and not merely
 * similar: a geometric series is base x (g^n - 1)/(g - 1), the numerators
 * are now identical, so matching (g - 1) matches the totals exactly.
 *
 * A CAP SHORTER THAN THE REFERENCE IS LEFT ALONE (the clamp). Those are the
 * counting rungs, whose cap is the count and whose price was authored
 * against exactly that — a "re-cut" there would be inventing a change
 * nobody asked for.
 */
function reCut(scale: number, growth: number, cap: number, ref: number) {
  const r = Math.max(1, cap / ref);
  if (r === 1) return { scale, growth };
  if (growth === 1) return { scale: scale / r, growth };
  const g = growth ** (1 / r);
  return { scale: scale * ((g - 1) / (growth - 1)), growth: g };
}

/** the price curve one rung charges — the authored bundle, or the rule */
function upgradePrice(def: TurretUpgradeDef, turretBase: Cost): PriceCurve {
  const authored = AUTHORED_UPGRADE_PRICE[def.id];
  if (authored) return authored;
  if (def.tier >= ULTIMATE_TIER)
    return { base: { "surge-alloy": ULTIMATE_SURGE[bandOfCost(turretBase)] }, growth: 1 };
  const cut = reCut(
    UPGRADE_SCALE[def.tier],
    UPGRADE_GROWTH[def.tier],
    def.cap,
    UPGRADE_REF_CAP[def.tier],
  );
  const base: Cost = {};
  for (const { item, amount } of costEntries(turretBase))
    base[item] = tidy(amount * cut.scale);
  return { base, growth: round4(cut.growth) };
}

/**
 * The upgrade nodes, derived from the table in upgrades.ts.
 *
 * They are a CHAIN per turret — rung one requires the turret, rung two
 * requires rung one, and so on — which is the same edge every other node
 * in the tree has and does the same job: the two cheap dials stand between
 * a fresh save and the expensive one-shots above them, so an ultimate can
 * never be one click from the turret's own unlock.
 *
 * They carry the turret's own cell (see TechNodeDef.x) because they are
 * drawn attached to it rather than laid out beside it.
 */
const UPGRADE_NODES: readonly TechNodeDef[] = ALL_UPGRADES.map((u) => {
  const turret = MAIN_TREE.find((n) => n.id === u.turret);
  if (!turret) throw new Error(`upgrade "${u.id}" hangs off an unknown turret`);
  return {
    id: u.id,
    price: upgradePrice(u, turret.price.base),
    cap: u.cap,
    // rung 3 changes what the turret IS and rung 4 replaces it, so both
    // are things a save can put down without selling; a dial is not
    toggle: u.tier >= ULTIMATE_TIER - 1,
    // ...and only the ultimate, the one thing paid for in surge, comes back
    refundable: u.tier >= ULTIMATE_TIER,
    requires: upgradeParent(u.id) ?? u.turret,
    x: turret.x,
    y: turret.y,
  };
});

/**
 * THE TREE AS EVERYTHING ELSE SEES IT: the authored board, plus a branch
 * of four hanging off every turret on it.
 */
export const TECH_TREE: readonly TechNodeDef[] = [...MAIN_TREE, ...UPGRADE_NODES];

/**
 * What the NEXT point on this node costs, given how many it already holds.
 * `base * growth^owned` per item, skipping items the curve hasn't started
 * charging yet, then tidied to a readable number.
 */
export function techPrice(node: TechKind, owned = 0): Cost {
  const { base, from } = techNode(node).price;
  const n = Math.max(0, Math.floor(owned));
  const k = knobsOf(node);
  // the knob is an absolute price in the lead currency; the rest of the
  // bundle follows it so the drop-ratio shape survives the edit
  const authored = authoredBase(node);
  const scale = authored > 0 ? k.base / authored : 1;
  const g = effectiveGrowth(growthOf(node));
  const out: Cost = {};
  for (const { item, amount } of costEntries(base)) {
    if (n < (from?.[item] ?? 0)) continue; // this item isn't charged for yet
    // NOT `g ** (n - starts)`: a delayed currency joins the ladder where it
    // actually stands, not at the bottom of a second one
    out[item] = tidy(amount * scale * g ** n);
  }
  return out;
}

/** can this wallet pay for the next point on the node? */
export function canAffordTech(bank: Bank, node: TechKind, owned = 0): boolean {
  return canAfford(bank, techPrice(node, owned));
}

/** the most points this node will ever hold — Infinity for every turret */
/** has this node taken every point it is ever going to? */
export const isMaxed = (node: TechKind, owned = 0): boolean => owned >= techCap(node);

/** may this node's points be handed back? — see TechNodeDef.refundable */
export const isRefundable = (node: TechKind): boolean => techNode(node).refundable === true;

/** may this node's effect be switched off while keeping it? — see
 *  TechNodeDef.toggle */
export const isToggleable = (node: TechKind): boolean => techNode(node).toggle === true;

/**
 * How many more points this wallet buys on one node, spending nothing else.
 *
 * Every node is walked a point at a time, which is cheap because a
 * geometric count is logarithmic in the bank — a few hundred iterations at
 * any bank size, sub-millisecond.
 *
 * The flat branch below was once only reachable through
 * PRICE_GROWTH_SCALE = 0. THE UTILITY NODES SHIP FLAT — a switch has one
 * price and no curve — so it is live again, and it is also why the cap is
 * applied first: a flat price divided into a fat bank answers "four hundred
 * of them", and 2x speed is a thing you own once.
 */
export function affordablePoints(
  bank: Bank,
  node: TechKind,
  owned = 0,
  limit = Infinity,
): number {
  const n = Math.max(0, Math.floor(owned));
  // THE CAP BITES HERE AND NOWHERE ELSE. Every purchase path runs through
  // this function, so clamping the room left is the whole enforcement.
  const room = Math.min(limit, techCap(node) - n);
  if (room < 1) return 0;
  const price = techPrice(node, n);
  const entries = costEntries(price);
  if (entries.length === 0) return 0;

  if (effectiveGrowth(growthOf(node)) === 1) {
    let most = Infinity;
    for (const { item, amount } of entries) most = Math.min(most, Math.floor(bank[item] / amount));
    return Math.max(0, Math.min(most, room));
  }

  const left = { ...bank };
  let bought = 0;
  while (bought < room) {
    const next = techPrice(node, n + bought);
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
export function techSpend(node: TechKind, points: number): Cost {
  const total: Cost = {};
  for (let i = 0; i < Math.max(0, Math.floor(points)); i++)
    addScaled(total, techPrice(node, i), 1);
  return total;
}

export function techNode(id: TechKind): TechNodeDef {
  const def = TECH_TREE.find((n) => n.id === id);
  if (!def) throw new Error(`"${id}" is not in TECH_TREE`);
  return def;
}

/**
 * Points per node — the save's tech field. On a turret the points ARE the
 * placement capacity; on a utility there is only ever one, and it means the
 * switch is on.
 */
export type TechLevels = Partial<Record<TechKind, number>>;

/** everything the sim and UI need to know, derived from the point spread */
export interface TechState {
  unlocked: ReadonlySet<TowerKind>;
  caps: Record<TowerKind, number>;
  /**
   * The fast-forward multipliers this save may use, ascending. 1x is always
   * in it and is never bought — it is the pace the game runs at.
   */
  speeds: readonly number[];
  /** loadout slots in the build bar: BASE_BAR_SLOTS plus owned slot nodes */
  barSlots: number;
  /** every turret's upgrade branch as bought, points per rung */
  upgrades: Record<TowerKind, UpgradePoints>;
  /** how many bodies the base survives — LIVES_BASE plus the plating */
  lives: number;
}

/**
 * EVERYTHING THE SIM AND UI NEED, DERIVED FROM THE POINT SPREAD — and the
 * SAVE'S OWN TECH IS THE ONLY LIMIT IN IT.
 *
 * There used to be a second gate stacked on this one: a `band` argument
 * naming the deepest currency the RUNG being played would let a turret's
 * price reach (`bandForTier`, deleted — see the note at the top of this
 * file). It is gone, and with it the whole idea that where you play decides
 * what you may bring. A turret this save owns is a turret this save can
 * place, at every rung of every world.
 */
export function techState(levels: TechLevels, off?: ReadonlySet<TechKind>): TechState {
  const caps = Object.fromEntries(
    TOWER_KINDS.map((k) => [k, Math.max(0, Math.floor(levels[k] ?? 0))]),
  ) as Record<TowerKind, number>;
  // owning it IS being allowed to place it. Everything that asks whether a
  // turret may be placed — the build bar, the loadout picker, Sim.canPlace,
  // Game.setBuild — asks this one set
  const unlocked = new Set<TowerKind>(TOWER_KINDS.filter((k) => caps[k] > 0));
  const speeds = [
    1,
    ...UTILITY_KINDS.filter((k) => (levels[k] ?? 0) > 0)
      .map((k) => NODE_SPEED[k])
      .filter((m): m is number => m != null),
  ].sort((a, b) => a - b);
  const barSlots =
    BASE_BAR_SLOTS +
    ((levels["slot-7"] ?? 0) > 0 ? 1 : 0) +
    ((levels["slot-8"] ?? 0) > 0 ? 1 : 0);
  // The plating reads `off` for the same reason everything else does: the
  // switch is what decides whether points DO anything, and one node that
  // ignored it would be a node whose "switched off" card lied. It has no
  // toggle on the board today, so this is the guard rather than the path.
  const plating = off?.has("lives") ? 0 : Math.max(0, Math.floor(levels["lives"] ?? 0));
  return {
    unlocked,
    caps,
    speeds,
    barSlots,
    upgrades: allUpgradePointsOf(levels, off),
    lives: LIVES_BASE + Math.min(LIVES_CAP, plating),
  };
}
