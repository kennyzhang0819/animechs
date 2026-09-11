/**
 * FORMATION — the SECOND roll on every card, and what makes a draw a
 * decision about ground rather than about a gun.
 *
 * A card carries two answers, rolled independently: WHICH turret
 * (rarity.ts) and HOW MANY OF IT, IN WHAT SHAPE — here. There is no
 * single-turret formation: the smallest thing the deal hands over is a
 * 2x2 block of four, and the largest is a 5x5 of twenty-five. So a card
 * is never "a duo", it is "nine duos in a block", and the question it
 * asks is where nine of anything can possibly go.
 *
 * THE CELLS ARE TURRETS, NOT TILES. Every offset below is counted in
 * WHOLE TURRETS, so a formation's footprint on the board is its grid
 * times the turret's own size: a 2x2 of duos is 2x2 tiles and a 2x2 of
 * spectres is 8x8. That is the whole reason the two rolls are separate —
 * a purple in a snowflake is a fortress and a common in one is a wall,
 * and both are dealt by the same button.
 *
 * THE ODDS ARE FLAT for now (WEIGHT). The rarity roll is where the
 * tension is; this one is deliberately generous, so that what a player
 * feels at the button is "which gun" first and "how much of it" second.
 */

export const FORMATION_IDS = ["quad", "cross", "block", "snowflake", "grid", "bastion"] as const;
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
  /** how often it comes up, relative to the others */
  weight: number;
}

/** every cell of a w x h grid — the solid blocks */
const solid = (w: number, h: number): (readonly [number, number])[] => {
  const out: (readonly [number, number])[] = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out.push([x, y]);
  return out;
};

/**
 * THE SIX. A block, a cross, and the snowflake between them — which is
 * the cross with its inner diagonals filled in, the one shape here that
 * is neither a wall nor a star and covers a junction from every side.
 */
export const FORMATIONS: Readonly<Record<FormationId, FormationDef>> = {
  /* 2x2 — four, the floor of the deal
     X X
     X X */
  quad: { id: "quad", name: "Quad", w: 2, h: 2, cells: solid(2, 2), weight: 1 },
  /* the plus — five, an intersection covered on all four approaches
     . X .
     X X X
     . X . */
  cross: {
    id: "cross",
    name: "Cross",
    w: 3,
    h: 3,
    cells: [[1, 0], [0, 1], [1, 1], [2, 1], [1, 2]],
    weight: 1,
  },
  /* 3x3 — nine */
  block: { id: "block", name: "Block", w: 3, h: 3, cells: solid(3, 3), weight: 1 },
  /* the snowflake — thirteen: a cross two deep with the four cells
     beside its middle filled in
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
    cells: [
      [2, 0],
      [1, 1], [2, 1], [3, 1],
      [0, 2], [1, 2], [2, 2], [3, 2], [4, 2],
      [1, 3], [2, 3], [3, 3],
      [2, 4],
    ],
    weight: 1,
  },
  /* 4x4 — sixteen */
  grid: { id: "grid", name: "Grid", w: 4, h: 4, cells: solid(4, 4), weight: 1 },
  /* 5x5 — twenty-five, and the reason a card can be unplaceable */
  bastion: { id: "bastion", name: "Bastion", w: 5, h: 5, cells: solid(5, 5), weight: 1 },
};

export const formationDef = (id: FormationId): FormationDef => FORMATIONS[id];

/** how many turrets this formation carries */
export const formationCount = (id: FormationId): number => FORMATIONS[id].cells.length;

/** one draw off the formation table */
export function rollFormation(rng: () => number = Math.random): FormationId {
  const total = FORMATION_IDS.reduce((n, id) => n + Math.max(0, FORMATIONS[id].weight), 0);
  let n = rng() * total;
  for (const id of FORMATION_IDS) {
    n -= Math.max(0, FORMATIONS[id].weight);
    if (n <= 0) return id;
  }
  return FORMATION_IDS[FORMATION_IDS.length - 1];
}

/**
 * THE FORMATION LAID DOWN: every turret's top-left cell, given the
 * formation's own top-left and the SIZE OF THE TURRET filling it. One
 * function, so the ghost the player is aiming and the structures that
 * actually land are the same arithmetic and cannot drift apart.
 */
export function formationCells(
  gx: number,
  gy: number,
  size: number,
  id: FormationId,
): { gx: number; gy: number }[] {
  return FORMATIONS[id].cells.map(([cx, cy]) => ({ gx: gx + cx * size, gy: gy + cy * size }));
}

/** the footprint in TILES a formation of this turret covers, as [w, h] */
export function formationSpan(size: number, id: FormationId): [number, number] {
  const f = FORMATIONS[id];
  return [f.w * size, f.h * size];
}
