/**
 * FORMATION — the SHAPE half of a card, and what makes a draw a decision
 * about ground rather than about a gun.
 *
 * A card carries two answers and NEITHER OF THEM IS A ROLL ANY MORE: the
 * player picks the TIER with 1/2/3/4 (economy.ts TOWER_TIER) and the
 * SHAPE with X, and the only thing the deal rolls is which gun of that
 * tier comes up. So the price is known before the press, which is the
 * whole reason the shape stopped being a second roll.
 *
 * THE CELLS ARE TURRETS, NOT TILES. Every offset below is counted in
 * WHOLE TURRETS, so a formation's footprint on the board is its grid
 * times the turret's own size — and since the tier IS the turret's size,
 * a block is 3x3 tiles at tier 1 and 12x12 at tier 4. That is what the
 * two buttons buy between them: which gun, and how much map.
 *
 * THREE SHAPES, ODD SQUARES, 3x3 to 7x7. An odd square has a middle, so
 * the ghost sits centred on the cursor and the patch a player is aiming
 * is the patch they get. Nothing is carved: a hole in a formation is a
 * hole in a wall and the swarm walks it.
 *
 * NOTHING HERE IS EARNED. Every shape is a save's from wave one — the
 * track deals guns and maps and rules (track.ts) and deals no shapes.
 */

export const FORMATION_IDS = ["block", "bastion", "citadel"] as const;
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

/** the three, smallest first — the name is the size */
export const FORMATIONS: Readonly<Record<FormationId, FormationDef>> = {
  /* 9 — the floor of the deal, and nothing is ever smaller */
  block: { id: "block", name: "Block", w: 3, h: 3, cells: solid(3, 3) },
  /* 25 */
  bastion: { id: "bastion", name: "Bastion", w: 5, h: 5, cells: solid(5, 5) },
  /* 49 — forty-nine repeaters is a 28x28 tile ironhide3, and finding the
     ground for one is most of the reward */
  citadel: { id: "citadel", name: "Citadel", w: 7, h: 7, cells: solid(7, 7) },
};

export const formationDef = (id: FormationId): FormationDef => FORMATIONS[id];

/** how many turrets this formation carries — times the fleet, if it is one */
export const formationCount = (id: FormationId, n = 1): number =>
  FORMATIONS[id].cells.length * Math.max(1, n);

/** the shape after this one, wrapping — what the X button does */
export const nextFormation = (id: FormationId): FormationId =>
  FORMATION_IDS[(FORMATION_IDS.indexOf(id) + 1) % FORMATION_IDS.length];

/**
 * THE FLEET — one card's shape TILED n times. Nothing in the corner buys
 * a fleet any more (the amount ladder became the shape button), so every
 * live card is n = 1; the tiling is kept because the editors and the
 * headless playtest still lay patches down with it.
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

/** EVERY FORMATION IS A SOLID ODD SQUARE — checked at import, because the
 *  centred ghost and the fleet tiling both lean on it */
(() => {
  for (const id of FORMATION_IDS) {
    const f = FORMATIONS[id];
    if (f.w < 3 || f.w !== f.h || f.w % 2 === 0)
      throw new Error(`the formation "${id}" is ${f.w}x${f.h}; every formation is an odd square of 3 or more`);
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
