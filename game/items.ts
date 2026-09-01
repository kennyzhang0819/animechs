/**
 * The campaign currencies. Every enemy drops ONE currency — the one its
 * FAMILY maps to (ITEM_OF_FAMILY in levels.ts) — and how MUCH of it is
 * decided by the unit's tier (AMOUNT_PER_TIER, same file). So the resource
 * a run banks is decided by WHICH LINES it was asked to fight, and the
 * depth of those lines only sets the size of the pile.
 *
 * THIS USED TO BE A TIER LADDER: T1 paid copper, T2 titanium, and so on up
 * to the T5s paying phase. That made the currency mix a consequence of the
 * script's tier histogram, which every world shares — a world's transforms
 * re-cast whole FAMILIES and deliberately preserve tier, so no world could
 * ever pay a different mix from any other. Currency-by-family points the
 * same machinery at the axis transforms actually move: a world's currency
 * mix is now an authored property of its family mix, and the transforms are
 * the dial (see TARGET_DROP_RATIO in ladder.ts).
 *
 * The point of the split survives the move: tech nodes cost SEVERAL items
 * at once (see tech.ts) and no single map pays them all, so a deep upgrade
 * cannot be bought by farming one map forever — rotating maps is what pays
 * for the top of the tree.
 *
 * SCRAP IS DELIBERATELY NOT HERE. Mindustry's own progression runs copper →
 * titanium → thorium → plastanium → phase fabric, and scrap sits off to the
 * side of it as salvage rather than as a rung. The names are kept because
 * they are the ones the sprites carry; the ORDER no longer means anything
 * (see BASE_ITEM below).
 *
 * ---------------------------------------------------------------------
 * WHAT A NEW CURRENCY ACTUALLY COSTS — because the answer moved, and an
 * earlier version of this note had it wrong in the expensive direction.
 *
 * It is NOT a save migration. readBank (progress.ts) starts from
 * emptyBank() and copies only the names it recognises, so a save written
 * before an ItemKind existed simply has no key for it and reads zero. The
 * one migration in that file exists because currencies were once RENAMED,
 * which is a different thing entirely.
 *
 * It is NOT new art. Twenty-two item sprites are already vendored under
 * public/mindustry/sprites/items/, and eleven liquids beside them.
 *
 * What it does cost, every time:
 *
 *   - a FAMILY to pay it (ITEM_OF_FAMILY in levels.ts). A currency no line
 *     drops is a currency that cannot be earned, and check() says so.
 *   - a share in the TARGET_DROP_RATIO row of every world meant to pay it,
 *     and a decision, for every world, that it is NOT paid there. A map
 *     pays two or three currencies; that is what makes maps worth
 *     rotating between, and it does not loosen because the list got longer.
 *   - a name, an icon and an accent colour in ITEM_INFO below.
 *   - a pass over the price bundles in tech.ts. A currency no node charges
 *     is unspendable, and one every node charges is the only real gate.
 *     This is the cost that grows with the LIST rather than with the
 *     addition, and it is the one to watch: twenty currencies against
 *     twenty-four nodes means most currencies appear in about one bundle,
 *     which is not enough surface for a price to mean anything.
 *
 * So the shape of the advice stands even though the number moved: a family
 * mapped onto an EXISTING currency is two rows and cannot be got wrong,
 * where a new currency is a decision in every world and every price. Add
 * currencies deliberately and in service of a map that needs one; do not
 * add them to have more.
 *
 * SEASONAL AND EVENT CONTENT STILL NEVER BECOMES AN ItemKind, and that one
 * is not a budget question at all, so a longer list does not touch it:
 *
 *   1. it is a permanent column for a currency that drops one month a year,
 *   2. it is dead UI in the bank the other eleven,
 *   3. and if it buys anything on the tech tree, a player who missed the
 *      event is PERMANENTLY behind — FOMO on power, which is the bad kind.
 *
 * An event currency is a separate, EXPIRING system with its own field on
 * Progress, buying event-only rewards — a skin, a map, a loadout slot. The
 * tech tree never learns it exists.
 * ---------------------------------------------------------------------
 */

/** every currency the game knows.
 *
 * THE ORDER IS NOT A LADDER ANY MORE. It was, when a currency was a unit
 * tier: copper → titanium → thorium → plastanium → phase read as the
 * campaign's own progression, and code could ask "how far up the list does
 * this price reach" and get a meaningful answer. Under family-based drops
 * these are five UNORDERED resources — copper is the ground line's,
 * titanium the air line's, thorium the crawler line's, plastanium the
 * support line's, phase fabric the two water lines' — so the only thing
 * this order still fixes is the layout of the parallel rows that index it
 * (TARGET_DROP_RATIO) and the order stacks are drawn in.
 *
 * SURGE ALLOY IS STILL THE ODD ONE OUT, and now for one reason rather than
 * two: no FAMILY maps to it, so it never drops from a wave at all. The only
 * way one is ever paid is a boss's FIRST kill on a (world, rung) it has not
 * been beaten on before — see grantRunReward in progress.ts. Unspent, the
 * bank's surge column is therefore a counter of how many boss fights this
 * save has actually won, which is what makes it the honest gate for content
 * that should wait on progression rather than on farming. */
export const ITEM_KINDS = [
  "copper",
  "titanium",
  "thorium",
  "plastanium",
  "phase-fabric",
  "surge-alloy",
] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];

/**
 * THE REFERENCE CURRENCY — not "the first rung" any more.
 *
 * It used to be the cheapest tier's item and the first thing a fresh save
 * ever earned, which made it the natural denominator for a ratio and the
 * natural always-visible column in the bank. Under family-based drops the
 * list has no cheapest end (see ITEM_KINDS): copper is simply the ground
 * line's currency, and the ground line is what the starter world sends most
 * of. So this still names the column a fresh save fills first and the one
 * the wallet always shows — it just no longer claims to be the bottom of
 * anything. Ratios normalise to a world's OWN largest column now, because a
 * world that pays no copper cannot be measured against it (ladder.ts).
 */
export const BASE_ITEM: ItemKind = ITEM_KINDS[0];

/**
 * A sparse map from currency to number, naming only the currencies it has
 * something to say about: a drop, a price, a run's takings — and a world's
 * authored payout MIX (TARGET_DROP_RATIO in ladder.ts), where the numbers
 * are shares rather than quantities. Sparse is the point in every case: it
 * is what keeps a two-currency map's row two entries long however many
 * currencies the game grows to.
 */
export type Cost = Partial<Record<ItemKind, number>>;

/** a full wallet — every currency, zero included (the save's bank) */
export type Bank = Record<ItemKind, number>;

export const emptyBank = (): Bank =>
  Object.fromEntries(ITEM_KINDS.map((k) => [k, 0])) as Bank;

/** display metadata: the item sprite and the accent colour it draws in */
export const ITEM_INFO: Record<ItemKind, { name: string; icon: string; color: string }> = {
  // official Mindustry item colours (content/Items.java), so a stack reads
  // the same as in-game
  copper: { name: "Copper", icon: "/mindustry/sprites/items/item-copper.png", color: "#D99D73" },
  titanium: { name: "Titanium", icon: "/mindustry/sprites/items/item-titanium.png", color: "#8DA1E3" },
  thorium: { name: "Thorium", icon: "/mindustry/sprites/items/item-thorium.png", color: "#F9A3C7" },
  plastanium: {
    name: "Plastanium",
    icon: "/mindustry/sprites/items/item-plastanium.png",
    color: "#CBD97F",
  },
  "phase-fabric": {
    name: "Phase Fabric",
    icon: "/mindustry/sprites/items/item-phase-fabric.png",
    color: "#F4BA6E",
  },
  "surge-alloy": {
    name: "Surge Alloy",
    icon: "/mindustry/sprites/items/item-surge-alloy.png",
    color: "#F3E979",
  },
};

/** the items a bundle actually mentions, in ITEM_KINDS order */
export function costEntries(cost: Cost): { item: ItemKind; amount: number }[] {
  return ITEM_KINDS.filter((k) => (cost[k] ?? 0) > 0).map((k) => ({ item: k, amount: cost[k]! }));
}

/** does this wallet cover the whole bundle? */
export function canAfford(bank: Bank, cost: Cost): boolean {
  return ITEM_KINDS.every((k) => bank[k] >= (cost[k] ?? 0));
}

/** deduct a bundle in place — call only after canAfford */
export function pay(bank: Bank, cost: Cost): void {
  for (const k of ITEM_KINDS) bank[k] -= cost[k] ?? 0;
}

/** add a bundle in place */
export function credit(bank: Bank, cost: Cost): void {
  for (const k of ITEM_KINDS) bank[k] += cost[k] ?? 0;
}

/** n copies of a bundle folded into an accumulator */
export function addScaled(into: Cost, cost: Cost, n: number): void {
  if (n <= 0) return;
  for (const k of ITEM_KINDS) {
    const v = cost[k];
    if (v) into[k] = (into[k] ?? 0) + v * n;
  }
}

/** did a run bank anything at all? (the results overlay hides an empty row) */
export const isEmpty = (cost: Cost): boolean => ITEM_KINDS.every((k) => !(cost[k] ?? 0));
