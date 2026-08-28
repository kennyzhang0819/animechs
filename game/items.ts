/**
 * The campaign currencies. Every enemy drops exactly ONE item — the one its
 * tier maps to below — so the resource a run banks is decided entirely by
 * what it was asked to kill. Daggers pay copper, maces pay titanium,
 * fortresses pay thorium, and the ladder keeps going for tiers the campaign
 * has not fielded yet.
 *
 * The point of the split: tech nodes cost SEVERAL items at once (see
 * tech.ts), so a deep upgrade can't be bought by farming the easiest wave
 * forever — the higher tiers want titanium and thorium, and the only place
 * those come from is heavier enemies.
 *
 * SCRAP IS DELIBERATELY NOT HERE. Mindustry's own progression runs copper →
 * titanium → thorium → plastanium → phase fabric, and scrap sits off to the
 * side of it as salvage rather than as a rung. Starting the campaign on
 * copper means the cheapest currency a player ever holds is the one
 * Mindustry also starts you on.
 */

/** every currency the game knows, cheapest tier first */
export const ITEM_KINDS = [
  "copper",
  "titanium",
  "thorium",
  "plastanium",
  "phase-fabric",
] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];

/**
 * Unit tier → the item that tier drops. T1 pays copper and nothing else, T2
 * titanium, T3 thorium, T4 plastanium, T5 phase fabric. Add a tier-6 unit
 * and this table (plus ITEM_KINDS) is the only place that needs a new row.
 *
 * Every row now has units behind it. Both of the last two lines landed as
 * pure stats edits with this file untouched — scepter, arkyid, vela and
 * antumbra started paying plastanium, then reign, toxopid, corvus and
 * eclipse started paying phase fabric — which is what the split is for.
 */
export const TIER_ITEM: readonly ItemKind[] = [
  "copper",
  "titanium",
  "thorium",
  "plastanium",
  "phase-fabric",
];

/** the cheapest currency — what a fresh save earns first, and what the
 * volume turret is priced in. Every "normalised to X = 100" ratio uses it */
export const BASE_ITEM: ItemKind = ITEM_KINDS[0];

/** the item a tier-N unit drops; tiers past the table fall back to the top */
export function itemForTier(tier: number): ItemKind {
  const i = Math.max(1, Math.floor(tier)) - 1;
  return TIER_ITEM[Math.min(i, TIER_ITEM.length - 1)];
}

/** a sparse bundle of items: a drop, a price, or a run's takings */
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
