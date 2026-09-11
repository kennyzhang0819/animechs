import { RARITIES, type Rarity, type RarityWeights } from "./rarity";

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

/** how many turrets this formation carries */
export const formationCount = (id: FormationId): number => FORMATIONS[id].cells.length;

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

/**
 * ONE DRAW OFF THE SHAPE TABLE: a band against the weights, then a shape
 * uniformly inside it. The same two-step the turret roll uses and for the
 * same reason — adding a thirteenth shape should change WHICH shape of
 * its band comes up, never how often that band does.
 */
export function rollFormation(
  pool: readonly FormationId[] = FORMATION_IDS,
  weights: RarityWeights = FORMATION_WEIGHTS,
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
})();
