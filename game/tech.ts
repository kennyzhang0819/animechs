import { addScaled, canAfford, costEntries, pay, type Bank, type Cost, type ItemKind } from "./items";
import { TOWERS } from "./constants";
import { TOWER_KINDS, type TowerKind } from "./types";

/**
 * The nodes that are not turrets.
 *
 * `home` is the trunk everything hangs off — it is bought for nothing and
 * granted to every save, because a root that could be missed would leave
 * the whole tree hidden behind it. It exists to give the tree TWO paths out
 * of one place: turrets down the middle, and the utilities off to the side.
 *
 * The four speed nodes are the utilities path, and they are a different
 * KIND of purchase from a turret. A turret node's points are capacity, so
 * it takes points forever; a utility is a SWITCH, so it takes exactly one
 * (see `cap`) and then reads as owned.
 */
export const UTILITY_KINDS = ["home", "speed-2", "speed-4", "speed-8", "speed-16"] as const;
export type UtilityKind = (typeof UTILITY_KINDS)[number];

/** anything the tree can hold points in */
export type TechKind = TowerKind | UtilityKind;

export const TECH_KINDS: readonly TechKind[] = [...TOWER_KINDS, ...UTILITY_KINDS];

const UTILITY_SET: ReadonlySet<string> = new Set<string>(UTILITY_KINDS);

/** is this node a turret? — the guard every turret-only reader needs */
export const isTowerNode = (id: TechKind): id is TowerKind => !UTILITY_SET.has(id);

/**
 * The fast-forward multiplier each utility node hands over. 1x is not in
 * here: it is the pace the game runs at with nothing bought, so it is never
 * something to own.
 */
export const NODE_SPEED: Readonly<Partial<Record<UtilityKind, number>>> = {
  "speed-2": 2,
  "speed-4": 4,
  "speed-8": 8,
  "speed-16": 16,
};

/** what each utility node is called, and what owning it does */
export const UTILITY_INFO: Readonly<Record<UtilityKind, { name: string; blurb: string }>> = {
  home: {
    name: "Home",
    blurb: "The root of the tree. Turrets run down the middle, utilities off to the side.",
  },
  "speed-2": { name: "2x Speed", blurb: "Run the whole simulation at double pace." },
  "speed-4": { name: "4x Speed", blurb: "Quadruple pace — a wave gap stops being a wait." },
  "speed-8": { name: "8x Speed", blurb: "Eight times pace, for a board that is already holding." },
  "speed-16": { name: "16x Speed", blurb: "Sixteen times pace. A finished run, fast-forwarded." },
};

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
 * THE SPAN IS FOOTPRINT, AND ONLY FOOTPRINT:
 *
 *   1x1  ->  500   2x2  ->  200   3x3  ->  100   4x4  ->  60
 *
 * THIS IS THE SPAN, NOT THE CAP, and the two were one number until they
 * were not. The span is the count the ladder is SOLVED against; the cap is
 * CAP_TILES / footprint area, ten thousand tiles per turret type. Keeping
 * them separate is what lets the cap move: solve growth against the cap and
 * raising it also raises the budget, which cheapens every rung — a cap at
 * half the board measured as a 1.7-3.4x power buff at 2% of a node bill.
 * Against a fixed span, the cap costs nothing and only stops being in the
 * way. See PRICE_SPAN and CAP_TILES.
 *
 * The 4x4 row was added with spectre, meltdown and foreshadow, the first
 * size-4 blocks in the game. It is an extension of the series rather than
 * a formula: the tiles a full span commits run 500, 800, 900, 960, a
 * curve that flattens as footprints grow because the span is about how
 * much of the BOARD one turret type is priced to own, and 960 of 29,109
 * buildable cells is 3.3% — the same order as the three rows above it.
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
 * THE GROWTHS BELOW ARE DERIVED, NOT AUTHORED — solveGrowth reproduces
 * every one of them from the base bundle, the DPS and the span, and the
 * table is kept only so the shape of the tree can be read at a glance.
 * Salvo is the single rounding casualty: its raw solve lands on 1.015650,
 * exactly on the four-place boundary, so it now rounds to 1.0157 where the
 * hand-written value rounded to 1.0156. That is parity being restored
 * rather than lost — the old number sat a whisker under the rule.
 *
 *   turret     size  DPS      span    lifetime DPS   growth
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
  /**
   * The per-point multiplier, AUTHORED — for the nodes the DPS rule cannot
   * reach. Two kinds qualify: a utility, which has no damage at all, and a
   * turret whose bundle carries no copper for the solve to be denominated in.
   * A node that writes a dps instead has this derived and must not set it.
   */
  growth?: number;
  /** point index at which an item starts being charged at all (default 0) */
  from?: Partial<Record<ItemKind, number>>;
}

/**
 * How many tiles one turret type may cover once it is maxed. The cap is this
 * divided by the footprint area, so a full stack of any node covers the same
 * 10,000 cells — 34% of the 29,109 buildable ones — and the late game has
 * room to answer a wave with a single turret type if it wants to.
 *
 * A CAP IS ONLY A CAP. Nothing about pricing reads it.
 */
export const CAP_TILES = 10000;

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
 *   price(n, item) = base[item] x baseScale x multiplier x growth^n
 *
 * base        the bundle, authored. Its SHAPE is the drop-ratio rule and its
 *             size is what a first purchase costs.
 * multiplier  a flat scalar on the whole node, so one number moves a turret
 *             without re-editing five currency amounts.
 * growth      the per-point climb — the shape of the ladder.
 *
 * NOTHING IS SOLVED ANY MORE. A bisection used to derive growth from a damage
 * figure against a fixed lifetime budget, and that budget is exactly what made
 * it impossible to tune by hand: with the total pinned, every growth you tried
 * moved the base underneath you. These three are independent, so one knob does
 * one thing and a play-tested number stays where you put it.
 *
 * DPS still earns its keep as the STARTING GUESS — see recommendedBase — but
 * no price depends on it at runtime, so a new bullet type cannot silently
 * re-price the tree.
 */
export interface Knobs {
  /** scale on the authored bundle; 1 leaves the shipped base alone */
  baseScale: number;
  /** flat scalar on every item at every point */
  multiplier: number;
  /** per-point climb */
  growth: number;
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
    baseScale: o.baseScale ?? 1,
    multiplier: o.multiplier ?? node.multiplier ?? 1,
    growth: o.growth ?? node.price.growth ?? 1,
  };
}

/** the knobs as authored — where a Reset returns to */
export function authoredKnobs(id: TechKind): Knobs {
  const node = techNode(id);
  return { baseScale: 1, multiplier: node.multiplier ?? 1, growth: node.price.growth ?? 1 };
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
    for (const key of ["baseScale", "multiplier", "growth"] as const) {
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
   * turret was built. THIS DRIVES THE PRICE and nothing else reads it — the
   * sim computes real damage from the bullet, never from here.
   *
   * A splashing or piercing shot counts as catching FIVE bodies. That does
   * not have to be true; it has to be the SAME for every turret, because
   * pricing is relative and a wrong number moves every node together.
   *
   * Absent on a utility, which has no damage, and on the six turrets whose
   * bundles carry no copper for the rule to price against — both of those
   * write an authored growth instead.
   */
  dps?: number;
  /**
   * A flat scalar on every item at every point — the cheap way to move one
   * turret without re-editing its whole bundle. 0.5 is "half price, all the
   * way up". Default 1.
   */
  multiplier?: number;
  /** parent node: needs >= 1 point before this node appears in the tree */
  requires?: TechKind;
  /**
   * Hard ceiling on points, if the node has one.
   *
   * TURRETS DO NOT: a turret's points ARE its placement capacity, so there
   * is always one more to buy and the price curve is the only ceiling.
   * A utility is a switch rather than a stack — 2x speed is on or it is
   * not — so those stop at one and go quiet.
   */
  cap?: number;
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
   * with scatter branching off it. Home sits above the trunk at the top,
   * and the utilities run down their own column on the right — the same
   * root, a visibly separate path.
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
 * ONE: a node growth is solved from its DPS against the SPAN its footprint
 * earns it, not chosen by feel, and one coefficient per node bends the
 * result where balance asks for it. See PriceCurve and TechNodeDef.tune.
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
 * DUO IS THE ONE EXEMPTION AT THE BOTTOM: copper-only, forever. A run that
 * dies before the first mace banks no titanium at all, and duo capacity has
 * to stay buyable out of that run or a bad save has no way back.
 *
 * THREE: THE SIX LATE NODES PAY NO COPPER AT ALL — fuse, swarmer, cyclone,
 * spectre, meltdown and foreshadow. It is duo's rule read from the other
 * end: copper is the bootstrap currency, and the endgame is where you have
 * outgrown it.
 *
 * This is a SUBSTITUTION, NOT A DISCOUNT, and not a price rise either. Those
 * six held 56% of the tree's entire copper bill — 10.1M of 17.9M — and the
 * value came back as titanium, thorium, plastanium and phase on the same six
 * nodes. What it buys is that the supply the waves pay and the demand the
 * tree charges finally have the same SHAPE: every currency now maxes the
 * whole tree in 385-391 Extreme runs, where before plastanium needed 8,736
 * and phase could not be spent at all.
 *
 * It also had to happen for the ratio to move. The waves cut low-tier bodies
 * for room on the map (TARGET_DROP_RATIO in ladder.ts), which cuts copper
 * income hardest; leaving the copper bill where it was would have made
 * copper the one gate on a tree whose top half no enemy pays for.
 *
 * The NINE early and mid nodes are untouched — copper and all. Everything a
 * Medium run can reach is priced exactly as it was playtested.
 *
 * Keep the FIRST point of every node payable out of the difficulty whose
 * currency it debuts on, or that node is decoration.
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
 * fifteen we ship run:
 *
 *   duo 17.5 · scorch 34.5 · hail 37 · arc 60 · scatter 74 · swarmer 152.5
 *   lancer 157 · salvo 180 · ripple 270 · parallax 288 · cyclone 329
 *   fuse 447.5 · spectre 1552.5 · meltdown 1795 · foreshadow 2500
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
 * unit of it swamps that gap and the rounding flipped them. Swarmer carries
 * one plastanium rather than two for that reason alone. If a future turret
 * lands this close to a neighbour, expect to hand-pick the bundle rather
 * than trust the split.
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
  swarmer: 152.5,
  lancer: 157,
  salvo: 180,
  ripple: 270,
  parallax: 288,
  cyclone: 329,
  fuse: 447.5,
  spectre: 1552.5,
  meltdown: 1795,
  foreshadow: 2500,
};

export const TECH_TREE: readonly TechNodeDef[] = [
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
    x: 2,
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
    x: 2,
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
    x: 1,
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
    x: 3,
    y: 3,
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
    // ITS COEFFICIENT IS 0.5, AND IT IS THE FIRST ONE CHOSEN RATHER THAN
    // INHERITED. The node arrived here at 0.7763, which was not a decision at
    // all: the growth had been solved when the base was 50, and halving the
    // base to 25 without re-solving left it at 0.209x parity. That accident
    // was invisible until the coefficient gave it a name.
    //
    // 0.5 is deliberate on top of it. Flak wants to be the answer a player
    // reaches for against a flare cloud, and reaching for it means owning
    // enough to cover more than one lane: at a mid-campaign bank this is
    // about 295 scatters where parity affords 205, and it cuts the
    // hundredth from 600 copper to 200.
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
    id: "scatter",
    price: { base: { copper: 75, titanium: 10 }, growth: 1.01 },
    dps: 1450,
    requires: "duo",
    x: 1,
    y: 2,
  },
  {
    // 28 damage a shell — the first turret that puts a fortress (armour 9)
    // back at its printed health instead of ten times it. THE FIRST THORIUM
    // NODE, and so the first thing a Medium run's thorium is for: it opens
    // around wave 7, when the T3 kills that pay for it start arriving. It
    // also shoots AIR, which makes it the second answer to the flare waves
    // and half the reason scatter no longer has to be priced as the only one
    id: "salvo",
    price: { base: { copper: 175, titanium: 60, thorium: 20 }, growth: 1.01 },
    dps: 217,
    requires: "hail",
    x: 1,
    y: 4,
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
    x: 3,
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
    x: 4,
    y: 4,
  },
  {
    // 290 range — the longest reach in the game, and the wave-clear
    // that answers the crawler floods. Four shells a volley at 70 splash,
    // and like every artillery piece only the splash counts: the shell
    // arcs over its target rather than hitting it
    id: "ripple",
    price: { base: { copper: 450, titanium: 125, thorium: 35 }, growth: 1.01 },
    dps: 700,
    requires: "salvo",
    x: 2,
    y: 5,
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
    id: "parallax",
    price: { base: { copper: 500, titanium: 125, thorium: 45 }, growth: 1.01 },
    dps: 30,
    requires: "scorch",
    x: 3,
    y: 4,
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
    id: "swarmer",
    price: { base: { titanium: 20, thorium: 20, plastanium: 1 }, growth: 1.01 },
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
    // game. Phase drops only at Extreme and only from the T5 that arrives at
    // the very end of it, so these three ARE the hidden difficulty's reward
    // and they light up the moment it ships — priced there rather than told
    // to wait there
    id: "spectre",
    price: { base: { titanium: 200, thorium: 225, plastanium: 55, "phase-fabric": 30 }, growth: 1.01 },
    dps: 1371,
    requires: "cyclone",
    x: 0,
    y: 7,
  },
  {
    // PHASE FABRIC. A continuous beam that melts whatever it rests on
    id: "meltdown",
    price: { base: { titanium: 275, thorium: 300, plastanium: 65, "phase-fabric": 40 }, growth: 1.01 },
    dps: 3364,
    requires: "lancer",
    x: 4,
    y: 5,
  },
  {
    // PHASE FABRIC. 500 range and one enormous shot — a sniper rather than a
    // defence, and the only turret that can hit a spawn pad from the core
    id: "foreshadow",
    price: { base: { titanium: 450, thorium: 525, plastanium: 125, "phase-fabric": 75 }, growth: 1.01 },
    dps: 405,
    requires: "meltdown",
    x: 4,
    y: 6,
  },
  // ---------- THE UTILITIES PATH ---------------------------------------
  //
  // Four one-point switches off home, in their own column: 2x, 4x, 8x and
  // 16x simulation pace. They used to be a constant — 2x and 4x free to
  // everyone, 8x and 16x a sandbox tool nobody could reach (the old PLAYER_SPEEDS
  // in game.ts). They are now the second thing a save can spend on.
  //
  // THEY ARE PRICED AS CONVENIENCE, NOT AS POWER, and that is deliberate:
  // pace changes nothing about whether a board holds. It only decides how
  // long the player sits watching one that already does. Charging turret
  // money for it would be charging for the game's own dead time. The whole
  // path costs less than a single mid-tree turret point.
  //
  // WHAT PACES THEM IS THE CURRENCY, NOT THE NUMBER. Each node asks for one
  // item and a different one, so the path unfolds at exactly the rate the
  // campaign hands out new currencies — copper from the first wave, titanium
  // from the first mace, thorium once the T3s arrive mid-Medium, plastanium
  // only from High. That is the same rule the turrets run on (see TWO at the
  // top of the file): the bundle is the gate, and nothing here needs a tier
  // written on it. 16x lands on High because High is where a run is long
  // enough to want it.
  //
  // A CHAIN, NOT A FAN. Each one requires the one below it, so the column
  // reads in order and a player cannot own 16x without having wanted 8x.
  {
    id: "speed-2",
    price: { base: { copper: 30 }, growth: 1 },
    requires: "home",
    cap: 1,
    x: 5,
    y: 1,
  },
  {
    id: "speed-4",
    price: { base: { titanium: 25 }, growth: 1 },
    requires: "speed-2",
    cap: 1,
    x: 5,
    y: 2,
  },
  {
    id: "speed-8",
    price: { base: { thorium: 20 }, growth: 1 },
    requires: "speed-4",
    cap: 1,
    x: 5,
    y: 3,
  },
  {
    id: "speed-16",
    price: { base: { plastanium: 15 }, growth: 1 },
    requires: "speed-8",
    cap: 1,
    x: 5,
    y: 4,
  },
];

/**
 * What the NEXT point on this node costs, given how many it already holds.
 * `base * growth^owned` per item, skipping items the curve hasn't started
 * charging yet, then tidied to a readable number.
 */
export function techPrice(node: TechKind, owned = 0): Cost {
  const { base, from } = techNode(node).price;
  const n = Math.max(0, Math.floor(owned));
  const k = knobsOf(node);
  const scale = k.baseScale * k.multiplier;
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
}

export function techState(levels: TechLevels): TechState {
  const caps = Object.fromEntries(
    TOWER_KINDS.map((k) => [k, Math.max(0, Math.floor(levels[k] ?? 0))]),
  ) as Record<TowerKind, number>;
  const unlocked = new Set<TowerKind>(TOWER_KINDS.filter((k) => caps[k] > 0));
  const speeds = [
    1,
    ...UTILITY_KINDS.filter((k) => (levels[k] ?? 0) > 0)
      .map((k) => NODE_SPEED[k])
      .filter((m): m is number => m != null),
  ].sort((a, b) => a - b);
  return { unlocked, caps, speeds };
}
