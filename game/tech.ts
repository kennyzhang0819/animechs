import type { TowerKind } from "./types";

/**
 * The tech tree, modeled on incremental tower defense: every run banks
 * scrap (see progress.ts), and scrap buys nodes here between runs. Nodes
 * unlock new towers, raise a tower's placement cap ("usages"), or boost
 * end-of-battle income. Levels only gate MAPS — all power comes from the
 * tree, so a lost run still moves the campaign forward.
 */
export type TechEffect =
  | { kind: "unlock"; tower: TowerKind; cap: number } // buildable, starting cap
  | { kind: "cap"; tower: TowerKind; add: number } // more usages of an unlocked tower
  | { kind: "income"; add: number }; // +fraction of every run's scrap payout

export interface TechNode {
  id: string;
  name: string;
  desc: string;
  cost: number;
  /** node that must be owned first — the tree edge; absent marks a root */
  requires?: string;
  effect: TechEffect;
}

/** how many of each tower a fresh save may place — duo is the free starter */
export const BASE_CAPS: Record<TowerKind, number> = {
  duo: 6,
  hail: 0,
  salvo: 0,
  scatter: 0,
  fuse: 0,
};

export const TECH_NODES: readonly TechNode[] = [
  // duo: the starter line — cheap caps to carry the early worlds
  { id: "duo-cap-1", name: "Duo Logistics", desc: "+3 Duo placements", cost: 40,
    effect: { kind: "cap", tower: "duo", add: 3 } },
  { id: "duo-cap-2", name: "Duo Assembly", desc: "+4 Duo placements", cost: 120, requires: "duo-cap-1",
    effect: { kind: "cap", tower: "duo", add: 4 } },
  { id: "duo-cap-3", name: "Duo Foundry", desc: "+6 Duo placements", cost: 350, requires: "duo-cap-2",
    effect: { kind: "cap", tower: "duo", add: 6 } },

  // artillery line: hail, then salvo, then fuse at the deep end
  { id: "hail", name: "Hail", desc: "Unlock Hail artillery (2 placements)", cost: 150,
    effect: { kind: "unlock", tower: "hail", cap: 2 } },
  { id: "hail-cap-1", name: "Shell Stockpile", desc: "+2 Hail placements", cost: 180, requires: "hail",
    effect: { kind: "cap", tower: "hail", add: 2 } },
  { id: "hail-cap-2", name: "Bombardment Doctrine", desc: "+3 Hail placements", cost: 400, requires: "hail-cap-1",
    effect: { kind: "cap", tower: "hail", add: 3 } },
  { id: "salvo", name: "Salvo", desc: "Unlock Salvo burst turrets (2 placements)", cost: 400, requires: "hail",
    effect: { kind: "unlock", tower: "salvo", cap: 2 } },
  { id: "salvo-cap-1", name: "Ammo Feeds", desc: "+2 Salvo placements", cost: 500, requires: "salvo",
    effect: { kind: "cap", tower: "salvo", add: 2 } },
  { id: "salvo-cap-2", name: "Thorium Rounds Depot", desc: "+3 Salvo placements", cost: 900, requires: "salvo-cap-1",
    effect: { kind: "cap", tower: "salvo", add: 3 } },
  { id: "fuse", name: "Fuse", desc: "Unlock Fuse shotgun turrets (1 placement)", cost: 900, requires: "salvo",
    effect: { kind: "unlock", tower: "fuse", cap: 1 } },
  { id: "fuse-cap-1", name: "Twin Fuse", desc: "+1 Fuse placement", cost: 700, requires: "fuse",
    effect: { kind: "cap", tower: "fuse", add: 1 } },
  { id: "fuse-cap-2", name: "Fuse Battery", desc: "+2 Fuse placements", cost: 1200, requires: "fuse-cap-1",
    effect: { kind: "cap", tower: "fuse", add: 2 } },

  // anti-air line: flares arrive in world 2 — scatter is the answer
  { id: "scatter", name: "Scatter", desc: "Unlock Scatter flak (2 placements, anti-air)", cost: 250,
    effect: { kind: "unlock", tower: "scatter", cap: 2 } },
  { id: "scatter-cap-1", name: "Flak Crews", desc: "+2 Scatter placements", cost: 300, requires: "scatter",
    effect: { kind: "cap", tower: "scatter", add: 2 } },
  { id: "scatter-cap-2", name: "Skywall", desc: "+4 Scatter placements", cost: 600, requires: "scatter-cap-1",
    effect: { kind: "cap", tower: "scatter", add: 4 } },

  // economy: compounds every future run's payout — the farming accelerator
  { id: "eco-1", name: "Salvage Teams", desc: "+10% scrap from every run", cost: 120,
    effect: { kind: "income", add: 0.1 } },
  { id: "eco-2", name: "Smelting Yard", desc: "+15% scrap from every run", cost: 350, requires: "eco-1",
    effect: { kind: "income", add: 0.15 } },
  { id: "eco-3", name: "Reclamation Guild", desc: "+25% scrap from every run", cost: 800, requires: "eco-2",
    effect: { kind: "income", add: 0.25 } },
];

export function nodeById(id: string): TechNode | null {
  return TECH_NODES.find((n) => n.id === id) ?? null;
}

/** everything the sim and UI need to know, derived from the owned node set */
export interface TechState {
  unlocked: ReadonlySet<TowerKind>;
  caps: Record<TowerKind, number>;
  /** multiplier on every run's scrap payout (1 = no economy nodes) */
  incomeMult: number;
}

export function techState(owned: Iterable<string>): TechState {
  const ownedSet = new Set(owned);
  const unlocked = new Set<TowerKind>(["duo"]);
  const caps = { ...BASE_CAPS };
  let incomeMult = 1;
  for (const node of TECH_NODES) {
    if (!ownedSet.has(node.id)) continue;
    const e = node.effect;
    if (e.kind === "unlock") {
      unlocked.add(e.tower);
      caps[e.tower] += e.cap;
    } else if (e.kind === "cap") caps[e.tower] += e.add;
    else incomeMult += e.add;
  }
  return { unlocked, caps, incomeMult };
}

/** why a node can or cannot be bought right now, for the tree UI */
export type BuyState = "owned" | "locked" | "poor" | "ok";

export function buyState(node: TechNode, owned: ReadonlySet<string>, scrap: number): BuyState {
  if (owned.has(node.id)) return "owned";
  if (node.requires && !owned.has(node.requires)) return "locked";
  return scrap >= node.cost ? "ok" : "poor";
}

/** the tree's display order groups by branch root, roots in TECH_NODES order */
export const TECH_BRANCHES: ReadonlyArray<{ root: TechNode; nodes: TechNode[] }> = (() => {
  const rootOf = new Map<string, string>();
  for (const n of TECH_NODES) rootOf.set(n.id, n.requires ? rootOf.get(n.requires)! : n.id);
  const branches: { root: TechNode; nodes: TechNode[] }[] = [];
  for (const n of TECH_NODES) {
    if (!n.requires) branches.push({ root: n, nodes: [n] });
    else branches.find((b) => b.root.id === rootOf.get(n.id))!.nodes.push(n);
  }
  return branches;
})();
