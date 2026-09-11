import { RARITIES, weightDial, type Rarity, type RarityWeights, type WeightDial } from "./rarity";

/**
 * FORMATION — the SECOND roll on every card, and what makes a draw a
 * decision about ground rather than about a gun.
 *
 * A card carries two answers, rolled independently: WHICH turret
 * (rarity.ts) and HOW MANY OF IT, IN WHAT SHAPE — here. There is no
 * single-turret formation and there never will be: the floor of the deal
 * is the 2x2 quad, four turrets, and nothing smaller than it exists. So a
 * card is never "a duo", it is "nine duos in a block", and the question
 * it asks is where nine of anything can possibly go.
 *
 * THE CELLS ARE TURRETS, NOT TILES. Every offset below is counted in
 * WHOLE TURRETS, so a formation's footprint on the board is its grid
 * times the turret's own size: a quad of duos is 2x2 tiles and a quad of
 * spectres is 8x8. That is the whole reason the two rolls are separate —
 * a purple in a citadel is a fortress and a common in one is a suburb,
 * and both come out of the same button.
 *
 * SHAPES HAVE RARITIES TOO, and they are the turrets' own four
 * (rarity.ts), worn on the same frames — so one palette answers "how good
 * is this card" twice over, once for the gun and once for the shape. The
 * band is read straight off the CELL COUNT, which is the only honest
 * measure of what a shape is worth: nine turrets or fewer is common, up
 * to sixteen uncommon, up to twenty-five rare, and anything past that is
 * the jackpot.
 *
 * The track deals them out like everything else (track.ts): a save opens
 * with three and earns the other nine.
 */

export const FORMATION_IDS = [
  "quad",
  "cross",
  "saltire",
  "block",
  "wedge",
  "ring",
  "snowflake",
  "grid",
  "octagon",
  "bastion",
  "rampart",
  "citadel",
] as const;
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

/** every cell of a w x h grid the test keeps — the shaped ones */
const carve = (
  w: number,
  h: number,
  keep: (x: number, y: number) => boolean,
): (readonly [number, number])[] => solid(w, h).filter(([x, y]) => keep(x, y));

/**
 * THE TWELVE, smallest first. Solids, rings and stars, and deliberately
 * no shape that is a line: a row of turrets is what a player builds by
 * hand anyway, and a card should hand over something they would not have
 * thought to draw.
 */
export const FORMATIONS: Readonly<Record<FormationId, FormationDef>> = {
  /* 4 — the floor of the deal, and nothing is ever smaller
     X X
     X X */
  quad: { id: "quad", name: "Quad", w: 2, h: 2, cells: solid(2, 2) },
  /* 5 — an intersection covered on all four approaches
     . X .
     X X X
     . X . */
  cross: {
    id: "cross",
    name: "Cross",
    w: 3,
    h: 3,
    cells: [[1, 0], [0, 1], [1, 1], [2, 1], [1, 2]],
  },
  /* 5 — the cross's diagonal twin: same count, opposite coverage, and the
     one small shape that leaves its own orthogonals open to walk through
     X . X
     . X .
     X . X */
  saltire: {
    id: "saltire",
    name: "Saltire",
    w: 3,
    h: 3,
    cells: [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]],
  },
  /* 9 — the solid 3x3 */
  block: { id: "block", name: "Block", w: 3, h: 3, cells: solid(3, 3) },
  /* 10 — a stair, and the one shape with a long diagonal face: it fits
     into a corner nothing square will take
     X . . .
     X X . .
     X X X .
     X X X X */
  wedge: { id: "wedge", name: "Wedge", w: 4, h: 4, cells: carve(4, 4, (x, y) => x <= y) },
  /* 12 — a hollow 4x4: a courtyard with a hole in the middle, which is
     a hole the swarm walks into and is shot at from four sides
     X X X X
     X . . X
     X . . X
     X X X X */
  ring: {
    id: "ring",
    name: "Ring",
    w: 4,
    h: 4,
    cells: carve(4, 4, (x, y) => x === 0 || y === 0 || x === 3 || y === 3),
  },
  /* 13 — a cross two deep with its inner diagonals filled
     . . X . .
     . X X X .
     X X X X X
     . X X X .
     . . X . . */
  snowflake: {
    id: "snowflake",
    name: "Snowflake",
    w: 5,
    h: 5,
    cells: carve(5, 5, (x, y) => Math.abs(x - 2) + Math.abs(y - 2) <= 2),
  },
  /* 16 — the solid 4x4 */
  grid: { id: "grid", name: "Grid", w: 4, h: 4, cells: solid(4, 4) },
  /* 21 — a 5x5 with its corners knocked off, which is the biggest shape
     that still reads as round
     . X X X .
     X X X X X
     X X X X X
     X X X X X
     . X X X . */
  octagon: {
    id: "octagon",
    name: "Octagon",
    w: 5,
    h: 5,
    cells: carve(5, 5, (x, y) => !((x === 0 || x === 4) && (y === 0 || y === 4))),
  },
  /* 25 — the solid 5x5 */
  bastion: { id: "bastion", name: "Bastion", w: 5, h: 5, cells: solid(5, 5) },
  /* 33 — a plus three turrets thick on a 7x7: the shape that takes a
     crossroads whole, and the cheaper of the two jackpots because it
     leaves its corners for the map to keep */
  rampart: {
    id: "rampart",
    name: "Rampart",
    w: 7,
    h: 7,
    cells: carve(7, 7, (x, y) => (x >= 2 && x <= 4) || (y >= 2 && y <= 4)),
  },
  /* 36 — the solid 6x6, and the largest thing the deal will ever hand
     over: thirty-six spectres is a 24x24 tile fortress, and finding the
     ground for one is most of the reward */
  citadel: { id: "citadel", name: "Citadel", w: 6, h: 6, cells: solid(6, 6) },
};

export const formationDef = (id: FormationId): FormationDef => FORMATIONS[id];

/** how many turrets this formation carries — times the fleet, if it is one */
export const formationCount = (id: FormationId, n = 1): number =>
  FORMATIONS[id].cells.length * Math.max(1, n);

/**
 * THE BAND A SHAPE IS IN, read off its cell count and nothing else: nine
 * or fewer is common, ten to sixteen uncommon, seventeen to twenty-five
 * rare, and past that ultra. A rule rather than a table because the count
 * IS the worth — a shape edited to carry four more turrets should change
 * bands by itself rather than wait for somebody to notice.
 */
export function formationRarity(id: FormationId): Rarity {
  const n = formationCount(id);
  return n <= 9 ? "common" : n <= 16 ? "uncommon" : n <= 25 ? "rare" : "ultra";
}

/** every shape of one band, smallest first — for the codex and the track */
export const formationsOfRarity = (r: Rarity): FormationId[] =>
  FORMATION_IDS.filter((id) => formationRarity(id) === r);

/**
 * THE SHAPE ODDS, AND THEY ARE DELIBERATELY SOFT. The turret roll is
 * where a run's tension lives — one draw in a hundred is purple there —
 * and this one is the generous half of the same button: an ultra SHAPE
 * comes up about one draw in ten. What a player should feel at the button
 * is "which gun" first and "how much of it" second, and odds as steep as
 * the turrets' would invert that.
 *
 * Weights are relative and renormalised over the bands a save actually
 * owns (rollFormation), so a level-1 board drawing from three shapes
 * still draws.
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
 * same reason — adding a thirteenth shape should change WHICH shape of
 * its band comes up, never how often that band does.
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

/**
 * THE FLEET — one card bought N TIMES, and what the Amount button in the
 * corner actually buys (economy.ts BUY_AMOUNTS).
 *
 * A x5 press does NOT roll five cards. It rolls ONE turret and ONE shape,
 * exactly as a single press does, and then TILES that shape five times
 * into a bigger shape. So the two rolls stay the two rolls the deal has
 * always had — the amount is a third, independent axis, and what it
 * multiplies is the GROUND the card asks for rather than the variety it
 * hands over. Five citadels of spectres is one decision about one piece
 * of map, and it is a decision about a piece of map the size of a town.
 *
 * THE COPIES DO NOT TOUCH. A gutter of one turret-cell (FLEET_GUTTER)
 * runs between them, which is one turret's own SIZE in tiles — four tiles
 * for a spectre, two for a duo. Butted together, ten grids would read as
 * one undifferentiated wall and the player would have no way to see that
 * they bought ten of something; spaced, the fleet reads as its copies at
 * a glance. The lanes are not decoration either: the swarm walks into
 * them and is shot at from both sides, which is the ring's courtyard
 * repeated down the whole footprint.
 */
export const FLEET_GUTTER = 1;

/**
 * WHERE THE N COPIES SIT, in copies — the macro-grid the tiling is laid
 * out on, and the same kind of [col, row] list a formation's own cells
 * are. The authored ones are the amounts the corner offers:
 *
 *   5  — THE PLUS. A quincunx on a 3x3: four copies on the arms and one
 *        at the crossing. It holds a junction from every approach and it
 *        leaves its four corners for the map to keep, so a x5 fits ground
 *        a x5 block never would.
 *   10 — THE SLAB. Five wide and two deep, which is a WALL: the shape a
 *        player buys when they have found the choke and intend to end the
 *        argument there.
 *
 * Anything else falls back to a balanced block, widest row first, so a
 * fourth amount added to BUY_AMOUNTS lays out sensibly on the day it is
 * added rather than on the day somebody remembers this table exists.
 */
const FLEET_LAYOUTS: Readonly<Record<number, readonly (readonly [number, number])[]>> = {
  5: [[1, 0], [0, 1], [1, 1], [2, 1], [1, 2]],
  10: [
    [0, 0], [1, 0], [2, 0], [3, 0], [4, 0],
    [0, 1], [1, 1], [2, 1], [3, 1], [4, 1],
  ],
};

export function fleetLayout(n: number): readonly (readonly [number, number])[] {
  if (n <= 1) return [[0, 0]];
  const authored = FLEET_LAYOUTS[n];
  if (authored) return authored;
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
 * rotating only one of them would be a lie about what lands: the x10
 * slab is five copies wide and two deep, and what a player wants when
 * they press R at a choke is the WALL stood on its end. So the two grids
 * are flattened into one grid of turret cells first (fleetCells) and the
 * turn is applied to that, once.
 *
 * MOST SHAPES DO NOT MOVE and that is honest rather than broken. Ten of
 * the twelve formations are symmetric under a quarter turn — every solid
 * block, the cross, the saltire, the ring, the snowflake, the octagon,
 * the rampart — so at x1 only the WEDGE visibly turns. Rotation is a
 * FLEET tool, which is where it was asked for: at x10 every shape turns,
 * because the slab it is tiled into does.
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
    // the copy's own origin: its column times the shape's grid plus the
    // gutters that have accumulated to its left, in TURRET CELLS
    const ox = tx * (f.w + FLEET_GUTTER);
    const oy = ty * (f.h + FLEET_GUTTER);
    for (const [cx, cy] of f.cells) cells.push([ox + cx, oy + cy]);
  }
  return {
    cells,
    w: gw * f.w + (gw - 1) * FLEET_GUTTER,
    h: gh * f.h + (gh - 1) * FLEET_GUTTER,
  };
}

/**
 * THE FLEET TURNED, and the size of what it turned into: the cells in
 * turret-cell units with `facing` quarter turns clockwise applied, and
 * the [w, h] of the result — which SWAPS on the odd turns, so a 34x13
 * slab becomes a 13x34 tower and the caller that centres it recentres it
 * on the new shape.
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

/** NOTHING IS SMALLER THAN THE QUAD, and nothing is a line — checked at import */
(() => {
  const floor = FORMATIONS.quad.cells.length;
  for (const id of FORMATION_IDS) {
    const f = FORMATIONS[id];
    if (id !== "quad" && f.cells.length <= floor)
      throw new Error(
        `the formation "${id}" carries ${f.cells.length} turrets; nothing may be smaller than or equal to the quad's ${floor}`,
      );
    if (f.w < 2 || f.h < 2) throw new Error(`the formation "${id}" is a line, not a shape`);
    for (const [x, y] of f.cells)
      if (x < 0 || y < 0 || x >= f.w || y >= f.h)
        throw new Error(`the formation "${id}" has a cell outside its own ${f.w}x${f.h} grid`);
  }
  // ...and an authored fleet layout carries exactly the copies it is for:
  // a five-cell table under the key 10 would silently sell half a fleet
  for (const [key, cells] of Object.entries(FLEET_LAYOUTS))
    if (cells.length !== Number(key))
      throw new Error(`the fleet layout for x${key} places ${cells.length} copies`);
})();
