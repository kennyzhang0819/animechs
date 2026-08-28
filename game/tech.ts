import { addScaled, canAfford, costEntries, pay, type Bank, type Cost, type ItemKind } from "./items";
import { TOWER_KINDS, type TowerKind } from "./types";

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
 * node used to be able to demand a DIFFICULTY be cleared before it would
 * take points; salvo waited on Medium, fuse on High, and the specialists on
 * whichever tier came before the enemy they answered. That was a second gate
 * doing a job the first one already did, because A BUNDLE CANNOT BE PAID IN
 * A CURRENCY ITS DIFFICULTY DOES NOT DROP. Medium pays copper, titanium and
 * thorium and no plastanium at all (TARGET_DROP_RATIO in ladder.ts), so
 * fuse's fifteen plastanium locks it out of a fresh save on its own, exactly
 * and automatically, with no gate written anywhere.
 *
 * Where the two gates disagreed, the tier gate was WRONG. Thorium starts
 * dropping in Medium at wave 7 and a full Medium run banks 450 of it — but
 * every node that charged thorium waited on Medium being CLEARED, so a save
 * that had not yet cleared it accumulated a currency with nowhere to spend
 * it. A player who dies at wave 17 is exactly the player who needs the next
 * turret, and the gate was denying it to them for the crime of not already
 * being past it.
 *
 * SO EVERY NODE IS OPEN AND THE BANK DECIDES. The four this actually frees
 * during Medium are salvo, lancer, ripple and parallax — the thorium sinks.
 * Everything above them still costs plastanium or phase fabric, which Medium
 * and High do not pay, so they stay shut without being told to.
 *
 * `requiresTier` is kept on the interface and honoured by progress.ts, and
 * nothing uses it. It is the hook for content whose gate genuinely is NOT a
 * currency — the planned Eradication difficulty ships no new item, so a node
 * meant for it would have nothing else to wait on.
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
 * THE CEILING IS FOOTPRINT, AND ONLY FOOTPRINT:
 *
 *   1x1  ->  500   2x2  ->  200   3x3  ->  100   4x4  ->  60
 *
 * The 4x4 row was added with spectre, meltdown and foreshadow, the first
 * size-4 blocks in the game. It is an extension of the series rather than
 * a formula: the tiles a full ceiling commits run 500, 800, 900, 960, a
 * curve that flattens as footprints grow because the ceiling is about how
 * much of the BOARD one turret type may own, and 960 of 29,109 buildable
 * cells is 3.3% — the same order as the three rows above it.
 *
 * THE RANGE MULTIPLIER IS GONE, and it is worth saying why it ever existed.
 * On the old 128x96 board these ceilings committed 76% of the 4,015
 * buildable tiles, so a short-ranged turret genuinely could not occupy the
 * board the way a long-ranged one could, and its ceiling was cut to say so.
 * The board is now 256x192 with 29,109 buildable cells: the same ceilings
 * commit 11% of it. TILE SCARCITY STOPPED BINDING, so the rule it justified
 * went with it.
 *
 * The map charges for short range on its own now, in units rather than in
 * price — a 60-unit scorch covers 7.5 tiles of a 35-tile gate, so holding
 * one gate takes about five of them abreast. Charging again in the ceiling
 * was double-counting, and it is why scorch and fuse read as overtuned on
 * the cramped map and balanced on this one.
 *
 * GROWTH IS SOLVED SO EVERY NODE COSTS THE SAME PER POINT OF DPS —
 * 7.85 copper for each point of damage-per-second its full ceiling fields.
 * The tree's whole lifetime bill is unchanged, so the campaign is the same
 * length; only the DISTRIBUTION moved. A strong turret is now expensive
 * because it is strong, and a weak one cheap because it is weak, which is
 * the entire rule and the only one to hold in your head.
 *
 * THE ONE ASSUMPTION, written down once: a splashing or piercing shot is
 * counted as catching FIVE bodies — the crowd case those turrets exist for.
 * It does not have to be true. It has to be the SAME for every turret,
 * because pricing is relative; a wrong number moves every node together and
 * cancels out. Change it here and re-solve rather than arguing per turret.
 *
 *   turret     size  DPS    ceiling   lifetime DPS   growth
 *   duo        1x1     27     500          13,500    1.0098
 *   hail       1x1    165     500          82,500    1.0103
 *   scorch     1x1    850     500         425,000    1.0133
 *   scatter    2x2  1,450     200         290,000    1.0327
 *   salvo      2x2    217     200          43,355    1.0156
 *   fuse       3x3  4,109     100         410,870    1.0594
 *   arc        1x1    411     500         205,714    1.0120
 *   lancer     2x2    420     200          84,000    1.0216
 *   ripple     3x3    700     100          70,000    1.0453
 *   parallax   2x2     30     200           6,000    1.0007
 *   swarmer    2x2  1,925     200         385,000    1.0278
 *   cyclone    3x3  1,797     100         179,700    1.0524
 *   spectre    4x4  1,371      60          82,286    1.0671
 *   meltdown   4x4  3,364      60         201,825    1.0854
 *   foreshadow 4x4    405      60          24,300    1.0317
 *
 * THE LAST FIVE WERE SOLVED WHEN THEY STOPPED BEING STUBS, and each one
 * needed the DPS convention read rather than applied blind:
 *
 *   swarmer      4 missiles x (10 direct + 45 splash) at 60/34.3 volleys
 *   cyclone      the shell's 45.5 splashes, so x5; its SIX fragments do
 *                not splash, so their 72 is counted once
 *   spectre      pierceCap 2, so x2 — lancer's rule, not the flat x5
 *   meltdown     936 while the beam is lit, over a 230/320 duty cycle
 *   foreshadow   405, and NO crowd multiplier at all: 1350 is a BUDGET
 *                spent across everything the rail passes through, so the
 *                five bodies are already inside the number
 *
 * Only the growths moved. Every base bundle is the one the stubs shipped
 * with, because the base is settled by rule TWO (the drop ratio) and the
 * stubs already carried the right currencies — it was only the DPS the
 * placeholder bullet made unknowable.
 *
 * Arc, lancer, ripple and parallax were solved the same way. Their DPS is
 * `shots x per-shot x 60 / reload ticks`, which is what the top four rows
 * reproduce exactly; salvo's 217 and fuse's 4,109 do not fall out of it
 * (they imply reloads of 31 and 23 against the 29 and 35 the turrets
 * actually carry), so those two rows are taken as given rather than
 * recomputed. Every growth above, theirs included, IS consistent with the
 * DPS beside it under the 7.85 rule.
 *
 * PARALLAX IS WHERE THE RULE RUNS OUT. It is priced on 30 damage a second
 * because that is all the rule can see, and its actual job is dragging air
 * out of formation — see the node.
 *
 * DUO COMES OUT VERY CHEAP and that is the rule working, not a bug: at 27
 * DPS it is the weakest thing in the game, so equal cost-per-DPS prices it
 * near nothing and a single top-difficulty run roughly maxes it. Five
 * hundred duos are still only 13,500 DPS, which is a rounding error against
 * what the top difficulty sends — it stays the bootstrap, never the answer.
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
   * points can go in.
   *
   * NOTHING SETS THIS, deliberately — see the note at the top of the file.
   * A turret that costs a currency only a later difficulty drops is already
   * gated by its price, and saying it twice locked thorium nodes away from
   * the Medium run that was banking the thorium. Reach for this only when a
   * node's gate is genuinely not a currency.
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
 * ratio against a Medium that pays 6.67:1, so titanium ran dry first and put
 * a hard cap on how many a player could own however much copper they had.
 * The turret felt overpriced; the PRICE was fine and the SHAPE was wrong.
 *
 * The currency also picks the difficulty. Plastanium appears first on the
 * nodes meant for Extreme and phase fabric only on the ones meant for
 * Eradication, because that is where tier-4 and tier-5 enemies are — and a
 * currency nothing drops yet is an absolute lock, which is exactly why no
 * node needs a tier gate on top of it. The converse is the trap: charging a
 * currency EARLIER than intended unlocks a node into a wall, and charging it
 * LATER than intended opens content a difficulty early.
 *
 * DUO IS THE ONE EXEMPTION: copper-only, forever. A run that dies before the
 * first mace banks no titanium at all, and duo capacity has to stay buyable
 * out of that run or a bad save has no way back.
 *
 * Keep the FIRST point of every node payable out of the difficulty whose
 * currency it debuts on, or that node is decoration.
 */
export const TECH_TREE: readonly TechNodeDef[] = [
  {
    // THE VOLUME TURRET, and the only lever a stalled player has — so it is
    // copper-only. A run that dies before the baseline's first mace wave
    // banks no titanium at all, and duo capacity has to stay buyable out of
    // that run or the save is stuck.
    // Also the cheapest node in the tree, because 27 DPS is the least any
    // turret does and the price rule pays exactly that much attention to it.
    // A top-difficulty run roughly maxes it; five hundred duos are still
    // only 13,500 DPS, so it stays the thing you open with, never the answer
    tower: "duo",
    price: { base: { copper: 8 }, growth: 1.0098 },
    x: 2,
    y: 0,
  },
  {
    // the first AoE, and the moment tier 1 and tier 2 stop being difficulty:
    // splash scales with bodies per blast and collapses with health per
    // body, so one hail shell kills five daggers and chips a spiroct
    tower: "hail",
    price: { base: { copper: 40, titanium: 9 }, growth: 1.0103 },
    requires: "scatter",
    x: 1,
    y: 2,
  },
  {
    // ungated like hail and strong out of proportion to its price: a
    // piercing flame rakes a whole file of units and sets each alight, and
    // burning ignores armour outright. 60 units of range is the whole cost
    tower: "scorch",
    price: { base: { copper: 60, titanium: 10 }, growth: 1.0133 },
    requires: "arc",
    x: 3,
    y: 2,
  },
  {
    // anti-air only, and UNGATED for the same reason hail and scorch are:
    // flares debut inside difficulty 1, so a gate of any kind would lock the
    // answer to air behind the run that first asks for it.
    //
    // THE ONE NODE PRICED BELOW DPS PARITY, at 0.2x what the rule asks.
    // Flak DPS is the highest on the cheap half of the tree, but it only ever
    // fires at AIR — and air is 12% of the health a run sends. Charging the
    // full rate bills a turret that idles through seven eighths of the game.
    //
    // It was 0.4x, sat just above the geometric mean of that 12% and the 100%
    // that says air is a CHECK you either answer or lose the run to. THE
    // SECOND HALF OF THAT ARGUMENT NO LONGER HOLDS: salvo and parallax both
    // shoot air and both are now buyable during Medium (see the top of the
    // file), so scatter is the CHEAP answer to air rather than the only one,
    // and the multiplier falls back toward the 12% reading it started from.
    //
    // THE CUT IS ALL IN THE BASE, NOT THE GROWTH, and that is the point.
    // Growth only decides what the two-hundredth scatter costs; a player who
    // is losing wave 12 to a flare cloud is buying their fifteenth. Halving
    // 50 to 25 halves the price of every point including the ones that
    // decide that fight, and lands the lifetime bill at 0.209x parity on its
    // own — growth is left exactly where the ceiling put it.
    //
    // TITANIUM DROPS 10 -> 4, further than copper does, because the old
    // bundle had the ratio wrong: 50:10 is 5:1 against a Medium that pays
    // 6.67:1, so titanium ran out first and CAPPED the count no matter how
    // much copper was banked. 25:4 is 6.25:1 and tracks the drop.
    //
    // COPPER AND TITANIUM ONLY. It used to want thorium, which comes from
    // tier-3 kills and so does not flow until well into a Medium run — and
    // since hail hangs off this node (Mindustry's own lineage: duo ->
    // scatter -> hail), a thorium price here locked the cheap ground AoE
    // behind the T3 waves too. Upstream builds scatter from copper and lead,
    // a tier-1 cost; this is that, in our currencies
    tower: "scatter",
    price: { base: { copper: 25, titanium: 4 }, growth: 1.0327 },
    requires: "duo",
    x: 1,
    y: 1,
  },
  {
    // 28 damage a shell — the first turret that puts a fortress (armour 9)
    // back at its printed health instead of ten times it. THE FIRST THORIUM
    // NODE, and so the first thing a Medium run's thorium is for: it opens
    // around wave 7, when the T3 kills that pay for it start arriving. It
    // also shoots AIR, which makes it the second answer to the flare waves
    // and half the reason scatter no longer has to be priced as the only one
    tower: "salvo",
    price: { base: { copper: 250, titanium: 85, thorium: 30 }, growth: 1.0156 },
    requires: "hail",
    x: 1,
    y: 3,
  },
  {
    // the steepest curve among the built turrets, and the most expensive
    // node in the tree — three instant piercing rays at 105 damage each is
    // the highest DPS on the roster, so equal cost-per-DPS charges for it.
    // Nine tiles of range is no longer a discount: the map already decides
    // how much of a gate one can hold (see PriceCurve).
    // PLASTANIUM IS THE GATE: fifteen of it, and only High and Extreme drop
    // any at all. A Medium save can see this node and can never pay for it,
    // which is the same lock the old tier gate spelled out by hand
    tower: "fuse",
    price: { base: { copper: 600, titanium: 275, thorium: 175, plastanium: 15 }, growth: 1.0594 },
    requires: "salvo",
    x: 2,
    y: 5,
  },
  {
    // Chain lightning down a file of ground units, and the root of
    // the short-range branch — scorch and lancer both hang off it.
    // 411 DPS is TWELVE node bullets a bolt rather than one shot catching
    // five: arc's shot walks, and every node it lands on is a separate
    // plain bullet taking one body. Measured on a file of ten daggers, one
    // bolt lands 217 of its theoretical 240
    tower: "arc",
    price: { base: { copper: 50, titanium: 9 }, growth: 1.012 },
    requires: "duo",
    x: 3,
    y: 1,
  },
  {
    // A piercing laser; the ground answer that is not artillery.
    // FOUR bodies, not the usual five — pierceCap 4 is a hard stop written
    // into the bullet, and the beam visibly ends at the fourth thing it
    // hits, so counting five would be pricing a shot it cannot fire
    tower: "lancer",
    price: { base: { copper: 200, titanium: 55, thorium: 20 }, growth: 1.0216 },
    requires: "scorch",
    x: 4,
    y: 3,
  },
  {
    // 290 range — the longest reach in the game, and the wave-clear
    // that answers the crawler floods. Four shells a volley at 70 splash,
    // and like every artillery piece only the splash counts: the shell
    // arcs over its target rather than hitting it
    tower: "ripple",
    price: { base: { copper: 300, titanium: 85, thorium: 25 }, growth: 1.0453 },
    requires: "salvo",
    x: 2,
    y: 4,
  },
  {
    // Not a damage turret at all: it drags air units out of formation.
    // In Mindustry it hangs off wave, which we do not have, so it takes its
    // grandparent scorch instead.
    //
    // THE ONE NODE THE DPS RULE CANNOT SEE, and the growth says so: 30
    // armour-piercing damage a second on ONE target is the least in the
    // game, so equal cost-per-DPS prices two hundred of them at 47k copper
    // — under half what five hundred duos cost — and a High-cleared bank
    // covers that several times over. What the rule is not counting is the
    // pull, which is the whole turret: it drags a flare at 85% of its own
    // top speed and a horizon at 123%, i.e. backwards. Priced on damage a
    // parallax wall is nearly free and answers air outright. Left literal
    // rather than fudged, because the rule is the rule and a second one
    // invented here would not be
    tower: "parallax",
    price: { base: { copper: 220, titanium: 60, thorium: 20 }, growth: 1.0007 },
    requires: "scorch",
    x: 3,
    y: 3,
  },
  // ---------- EXTREME AND ERADICATION ----------------------------------
  //
  // These five were stubs — a tech-tree shape with duo's bullet behind it —
  // and their growths were scaffolding, because a placeholder bullet makes
  // a node's DPS unknowable. They now carry their own ammo and their own
  // solved curves; see the table in PriceCurve for what each one reads.
  //
  // Lineage is Mindustry's own (content/SerpuloTechTree.java) and the
  // difficulty each one lands at falls out of BUILD MATERIAL, which is now
  // the ONLY thing holding them shut: a turret whose Mindustry cost tops out
  // at thorium or plastanium prices out to Extreme, and one that wants surge
  // alloy belongs to the hidden ERADICATION difficulty that does not exist
  // yet — so it is priced in phase fabric, which nothing below Extreme
  // drops. Each bundle below charges a currency its own difficulty is the
  // first to pay, and a child always costs at least what its parent does, so
  // no child can open before its parent even with every gate gone.
  {
    // PLASTANIUM. Homing missiles — they chase what they lock, so overkill
    // costs less than it does on a straight-firing line
    tower: "swarmer",
    price: { base: { copper: 350, titanium: 125, thorium: 55, plastanium: 3 }, growth: 1.0278 },
    requires: "salvo",
    x: 0,
    y: 4,
  },
  {
    // PLASTANIUM. A flak wall. The reason to own it is volume of splash, which
    // is why its ceiling is the full 3x3 band
    tower: "cyclone",
    price: { base: { copper: 450, titanium: 150, thorium: 70, plastanium: 4 }, growth: 1.0524 },
    requires: "swarmer",
    x: 0,
    y: 5,
  },
  {
    // PHASE FABRIC. Twin heavy cannon — the highest sustained damage in the
    // game. Phase drops only at Extreme and only from the T5 that arrives at
    // the very end of it, so these three ARE the hidden difficulty's reward
    // and they light up the moment it ships — priced there rather than told
    // to wait there
    tower: "spectre",
    price: { base: { copper: 900, titanium: 375, thorium: 225, plastanium: 23, "phase-fabric": 6 }, growth: 1.0671 },
    requires: "cyclone",
    x: 0,
    y: 6,
  },
  {
    // PHASE FABRIC. A continuous beam that melts whatever it rests on
    tower: "meltdown",
    price: { base: { copper: 1000, titanium: 425, thorium: 250, plastanium: 26, "phase-fabric": 7 }, growth: 1.0854 },
    requires: "lancer",
    x: 4,
    y: 4,
  },
  {
    // PHASE FABRIC. 500 range and one enormous shot — a sniper rather than a
    // defence, and the only turret that can hit a spawn pad from the core
    tower: "foreshadow",
    price: { base: { copper: 1100, titanium: 450, thorium: 275, plastanium: 29, "phase-fabric": 8 }, growth: 1.0317 },
    requires: "meltdown",
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
