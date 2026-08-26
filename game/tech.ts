import { TOWER_KINDS, type TowerKind } from "./types";

/**
 * The tech tree: one square node per turret, laid out as a small graph.
 * A node's point count IS the turret's placement capacity — the first
 * point unlocks the turret (capacity 1) and every further point on the
 * same node is +1 capacity. Every point costs the same flat price.
 *
 * Nodes gate two ways: the parent node must hold at least one point (the
 * graph edge — a node stays hidden until its parent is bought), and some
 * nodes wait for a world to be fully cleared. World-1 players see only
 * duo and hail; clearing world 1 opens salvo and scatter; fuse waits for
 * world 2.
 */
export const TECH_PRICE = 100;

export interface TechNodeDef {
  tower: TowerKind;
  /** parent node: needs >= 1 point before this node appears in the tree */
  requires?: TowerKind;
  /** world that must be fully cleared before points can go in */
  world?: number;
  /** grid position in the tree view, in cell units */
  x: number;
  y: number;
}

export const TECH_TREE: readonly TechNodeDef[] = [
  { tower: "duo", x: 0, y: 1 },
  { tower: "hail", requires: "duo", x: 1, y: 0 },
  { tower: "scatter", requires: "duo", world: 1, x: 1, y: 2 },
  { tower: "salvo", requires: "hail", world: 1, x: 2, y: 0 },
  { tower: "fuse", requires: "salvo", world: 2, x: 3, y: 0 },
];

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
