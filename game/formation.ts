/**
 * FORMATION — the SHAPE half of a card, and the ROLL on every press.
 *
 * A card carries two answers. The player picks the TIER with 1/2/3/4
 * (economy.ts TOWER_TIER), which is the gun's footprint and the price;
 * the deal rolls WHICH gun of that tier comes up and HOW BIG A PATCH of
 * it lands. So the money is known before the press and the size is the
 * luck — the same press sometimes buys nine turrets and sometimes
 * thirty-six, for the same scrap.
 *
 * THE CELLS ARE TURRETS, NOT TILES. Every offset below is counted in
 * WHOLE TURRETS, so a formation's footprint on the board is its grid
 * times the turret's own size — and since the tier IS the turret's size,
 * a block is 3x3 tiles at tier 1 and 12x12 at tier 4.
 *
 * FOUR SHAPES, 3x3 to 6x6, and nothing is carved: a hole in a formation
 * is a hole in a wall and the swarm walks it. A square has one thing to
 * say and says it in its own diagram — THIS MUCH GROUND.
 *
 * SHAPES HAVE RARITIES TOO, and they are the turrets' own four
 * (rarity.ts), worn on the same frames — so one palette answers "how good
 * is this card" twice over, once for the gun and once for the shape.
 *
 * NOTHING HERE IS EARNED. Every shape is a save's from wave one — the
 * track deals guns and maps and rules (track.ts) and deals no shapes, so
 * the 6x6 is rare because it is RARE and not because it is locked.
 */
import { RARITIES, weightDial, type Rarity, type RarityWeights, type WeightDial } from "./rarity";

export const FORMATION_IDS = ["block", "grid", "bastion", "citadel"] as const;
export type FormationId = (typeof FORMATION_IDS)[number];

export interface FormationDef {
  id: FormationId;
  /** what the card's hover says */
  name: string;
  /** the grid it is laid out on, in turrets */
  w: number;
  h: number;
  /** which of that grid's cells carry a turret, as [col, row] pairs */
  cells: readonly (readonly [number, number])[];
}

/** every cell of a w x h grid — the solid blocks */
const solid = (w: number, h: number): (readonly [number, number])[] => {
  const out: (readonly [number, number])[] = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out.push([x, y]);
  return out;
};

/** the four, smallest first — the name is the size */
export const FORMATIONS: Readonly<Record<FormationId, FormationDef>> = {
  /* 9 — the floor of the deal, and nothing is ever smaller */
  block: { id: "block", name: "Block", w: 3, h: 3, cells: solid(3, 3) },
  /* 16 */
  grid: { id: "grid", name: "Grid", w: 4, h: 4, cells: solid(4, 4) },
  /* 25 */
  bastion: { id: "bastion", name: "Bastion", w: 5, h: 5, cells: solid(5, 5) },
  /* 36 — the largest thing the deal will ever hand over: thirty-six
     repeaters is a 24x24 tile citadel, and finding the ground for one is
     most of the reward */
  citadel: { id: "citadel", name: "Citadel", w: 6, h: 6, cells: solid(6, 6) },
};

/**
 * THE BAND A SHAPE IS IN, read off its side and nothing else. A rule
 * rather than a table because the size IS the worth, so a square added or
 * taken away lands in its band by itself.
 */
export const formationRarity = (id: FormationId): Rarity =>
  RARITIES[Math.min(RARITIES.length - 1, FORMATIONS[id].w - 3)];

/** every shape of one band, smallest first — for the codex and the tests */
export const formationsOfRarity = (r: Rarity): FormationId[] =>
  FORMATION_IDS.filter((id) => formationRarity(id) === r);

/**
 * THE SHAPE ODDS, AND THEY ARE DELIBERATELY SOFT. The turret roll is
 * where a run's tension lives — one draw in a hundred is purple there —
 * and this one is the generous half of the same press: the 6x6 comes up
 * about one draw in ten. What a player should feel is "which gun" first
 * and "how much of it" second, and odds as steep as the turrets' would
 * invert that.
 *
 * Weights are relative and renormalised over whatever bands the pool
 * handed in actually covers (rollFormation), so a caller that narrows the
 * pool still draws.
 */
export const FORMATION_WEIGHTS: RarityWeights = {
  common: 40,
  uncommon: 30,
  rare: 20,
  ultra: 10,
};

/** ...and the same table as a dial the dashboard can turn (rarity.ts
 *  weightDial). Read this, not the const, anywhere the live answer matters */
export const SHAPE_ODDS: WeightDial = weightDial(FORMATION_WEIGHTS);

/**
 * ONE DRAW OFF THE SHAPE TABLE: a band against the weights, then a shape
 * uniformly inside it. The same two-step the turret roll uses and for the
 * same reason — adding a fifth square should change WHICH shape of its
 * band comes up, never how often that band does.
 */
export function rollFormation(
  pool: readonly FormationId[] = FORMATION_IDS,
  weights: RarityWeights = SHAPE_ODDS.live(),
  rng: () => number = Math.random,
): FormationId | null {
  const byRarity = new Map<Rarity, FormationId[]>();
  for (const id of pool) {
    const r = formationRarity(id);
    const list = byRarity.get(r);
    if (list) list.push(id);
    else byRarity.set(r, [id]);
  }
  const live = RARITIES.filter((r) => (byRarity.get(r)?.length ?? 0) > 0);
  if (live.length === 0) return null;
  const pick = (r: Rarity): FormationId => {
    const list = byRarity.get(r)!;
    return list[Math.floor(rng() * list.length) % list.length];
  };
  const total = live.reduce((n, r) => n + Math.max(0, weights[r]), 0);
  if (total <= 0) return pick(live[live.length - 1]);
  let n = rng() * total;
  for (const r of live) {
    n -= Math.max(0, weights[r]);
    if (n <= 0) return pick(r);
  }
  return pick(live[live.length - 1]);
}

export const formationDef = (id: FormationId): FormationDef => FORMATIONS[id];

/** how many turrets this formation carries — times the fleet, if it is one */
export const formationCount = (id: FormationId, n = 1): number =>
  FORMATIONS[id].cells.length * Math.max(1, n);

/**
 * THE FLEET — one card's shape TILED n times, which is what the corner's
 * AMOUNT button buys (economy.ts BUY_AMOUNTS). A x4 press does NOT roll
 * four cards: it rolls one gun and one shape, exactly as a single press
 * does, and tiles that shape four times. Every amount is a SQUARE so the
 * copies butt with no gap.
 */

export function fleetLayout(n: number): readonly (readonly [number, number])[] {
  if (n <= 1) return [[0, 0]];
  const w = Math.ceil(Math.sqrt(n));
  return Array.from({ length: n }, (_, i) => [i % w, Math.floor(i / w)] as const);
}

/** the macro-grid a fleet of n copies spans, in copies, as [cols, rows] */
function fleetGrid(n: number): [number, number] {
  let w = 0, h = 0;
  for (const [x, y] of fleetLayout(n)) {
    if (x + 1 > w) w = x + 1;
    if (y + 1 > h) h = y + 1;
  }
  return [w, h];
}

/**
 * WHICH WAY THE CARD IS FACING — quarter turns clockwise, and R turns it
 * one more (Game.rotateHeld).
 *
 * IT TURNS THE WHOLE FOOTPRINT AND NOT THE SHAPE INSIDE IT. A fleet is
 * two grids nested — the copies, and the cells inside each copy — and
 * rotating only one of them would be a lie about what lands. So the two
 * are flattened into one grid of turret cells first (fleetCells) and the
 * turn is applied to that, once.
 *
 * NOTHING VISIBLY TURNS ANY MORE, and that is what a table of squares
 * costs. Every formation is a solid square (see the header) and every
 * amount is square too (economy.ts), so a fleet's footprint is a square
 * of squares and a quarter turn maps it onto itself. The arithmetic is
 * kept whole rather than torn out: it is what every caller centres and
 * places through, it costs one branch on facing 0, and the day a
 * formation that is not square goes back on the table it works.
 */
export type Facing = 0 | 1 | 2 | 3;

export const FACINGS: readonly Facing[] = [0, 1, 2, 3];

/** the quarter turn after this one — what one press of R does */
export const nextFacing = (f: Facing): Facing => (((f + 1) & 3) as Facing);

/**
 * THE WHOLE FLEET AS ONE GRID OF TURRET CELLS, before any turn: the n
 * copies and the gutters between them flattened into a single [col, row]
 * list, with the grid's own size. Everything else here is this list moved
 * about, so the diagram on the card, the ghost on the ground and the
 * structures that land are one arithmetic with one place to be wrong.
 */
function fleetCells(id: FormationId, n: number): {
  cells: (readonly [number, number])[];
  w: number;
  h: number;
} {
  const f = FORMATIONS[id];
  const [gw, gh] = fleetGrid(n);
  const cells: (readonly [number, number])[] = [];
  for (const [tx, ty] of fleetLayout(n)) {
    // the copy's own origin, in TURRET CELLS: its column times the shape's
    // grid, and nothing between — the copies butt (see the header)
    const ox = tx * f.w;
    const oy = ty * f.h;
    for (const [cx, cy] of f.cells) cells.push([ox + cx, oy + cy]);
  }
  return { cells, w: gw * f.w, h: gh * f.h };
}

/**
 * THE FLEET TURNED, and the size of what it turned into: the cells in
 * turret-cell units with `facing` quarter turns clockwise applied, and
 * the [w, h] of the result — which SWAPS on the odd turns, so an oblong
 * footprint would come back the other way round and the caller that
 * centres it recentres it on the new shape. Every footprint on the table
 * today is square, so the swap is a no-op and the turn is invisible.
 */
export function fleetFootprint(
  id: FormationId,
  n = 1,
  facing: Facing = 0,
): { cells: (readonly [number, number])[]; w: number; h: number } {
  const { cells, w, h } = fleetCells(id, n);
  if (facing === 0) return { cells, w, h };
  const turned = cells.map(([x, y]): readonly [number, number] => {
    // clockwise, each turn taking the grid's height to the new width
    if (facing === 1) return [h - 1 - y, x];
    if (facing === 2) return [w - 1 - x, h - 1 - y];
    return [y, w - 1 - x];
  });
  const odd = facing === 1 || facing === 3;
  return { cells: turned, w: odd ? h : w, h: odd ? w : h };
}

/**
 * THE FORMATION LAID DOWN: every turret's top-left cell, given the
 * formation's own top-left and the SIZE OF THE TURRET filling it. One
 * function, so the ghost the player is aiming and the structures that
 * actually land are the same arithmetic and cannot drift apart.
 *
 * `n` is the fleet — the shape tiled that many times, gutters folded in —
 * and `facing` is the quarter turns R has put on it. n=1 facing 0 is the
 * ordinary card and costs the same arithmetic, so there is no second code
 * path for the single buy to be wrong in.
 */
export function formationCells(
  gx: number,
  gy: number,
  size: number,
  id: FormationId,
  n = 1,
  facing: Facing = 0,
): { gx: number; gy: number }[] {
  return fleetFootprint(id, n, facing).cells.map(([cx, cy]) => ({
    gx: gx + cx * size,
    gy: gy + cy * size,
  }));
}

/** the footprint in TILES a fleet of n of this formation covers, as [w, h] */
export function formationSpan(
  size: number,
  id: FormationId,
  n = 1,
  facing: Facing = 0,
): [number, number] {
  const { w, h } = fleetFootprint(id, n, facing);
  return [w * size, h * size];
}

/** EVERY FORMATION IS A SOLID SQUARE — checked at import, because the
 *  fleet tiling leans on it */
(() => {
  for (const id of FORMATION_IDS) {
    const f = FORMATIONS[id];
    if (f.w < 3 || f.w !== f.h)
      throw new Error(`the formation "${id}" is ${f.w}x${f.h}; every formation is a square of 3 or more`);
    if (f.cells.length !== f.w * f.h)
      throw new Error(
        `the formation "${id}" carries ${f.cells.length} of its ${f.w * f.h} cells; every formation is solid`,
      );
    for (const [x, y] of f.cells)
      if (x < 0 || y < 0 || x >= f.w || y >= f.h)
        throw new Error(`the formation "${id}" has a cell outside its own ${f.w}x${f.h} grid`);
  }
  for (const n of [1, 2, 4, 9, 16]) {
    if (fleetLayout(n).length !== n)
      throw new Error(`a fleet of ${n} lays down ${fleetLayout(n).length} copies`);
    const seen = new Set(fleetLayout(n).map(([x, y]) => `${x},${y}`));
    if (seen.size !== n) throw new Error(`a fleet of ${n} stacks two copies on one cell`);
  }
})();
