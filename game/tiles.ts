/**
 * THE GROUND TILES — the game's own floor art, painted rather than loaded.
 *
 * The floors used to be Mindustry's: a 32px tile of two colours with a
 * fifth of its pixels flipped to the second one at random, three numbered
 * variants a floor. That speckle is the most recognisable thing about
 * Mindustry's ground, and the first thing to change if the game is to
 * look like itself.
 *
 * A tile here is 16 logical pixels across, drawn 2× into the same 32px
 * cell the atlas and the menu already expect, so everything downstream —
 * the antialias pass, the edge fades, the 64px atlas cells — is untouched.
 * The coarser grid is the point: a chunkier pixel reads as a different
 * hand. On it a floor is a flat base colour and a FEW things — one or two
 * soft patches a shade off the base, a ripple, a crack, at most one
 * pebble — never a field of dots. Two variants a floor, not three; the
 * third slot every table still has draws the first again.
 *
 * Everything is deterministic: a (kind, variant) pair paints the same
 * pixels every time, in the browser and in the script that writes the
 * editor's palette icons (scripts/gen-tiles.mjs). Nothing here touches the
 * DOM until `floorCanvas` is called, so the map module can import the
 * tones for its thumbnails on the server.
 */

/** logical pixels across a tile, and the scale to the 32px cell */
export const TILE_LOGICAL = 16;
export const TILE_SCALE = 2;
export const TILE_PX = TILE_LOGICAL * TILE_SCALE;
/** how many distinct paintings a floor has */
export const FLOOR_VARIANTS = 2;

/** what a floor is made of, and how it is detailed */
export interface FloorStyle {
  /** the ground itself */
  base: string;
  /** a shade up and a shade down, for the patches */
  light: string;
  dark: string;
  /** a contrasting colour, for the cracks that glow (hot rock) */
  accent?: string;
  /**
   * the one kind of mark this ground wears:
   * patch — a soft blob or two a shade off the base
   * tuft  — patches, plus a short pair of blades
   * crack — a thin dark line with a bend in it
   * ripple — a light dash or two, wind-blown
   * pebble — a patch and one small stone
   * vein  — an accent-coloured crack
   */
  mark: "patch" | "tuft" | "crack" | "ripple" | "pebble" | "vein";
}

export type FloorKind =
  | "grass"
  | "stone"
  | "dirt"
  | "sand"
  | "darksand"
  | "moss"
  | "sporeMoss"
  | "mud"
  | "shale"
  | "snow"
  | "salt"
  | "ice"
  | "basalt"
  | "hotrock"
  | "magmarock";

export const FLOOR_STYLE: Readonly<Record<FloorKind, FloorStyle>> = {
  grass: { base: "#6a9b52", light: "#78a95c", dark: "#5c8a46", mark: "tuft" },
  stone: { base: "#7c7c84", light: "#878790", dark: "#6b6b73", mark: "crack" },
  dirt: { base: "#8f6b4a", light: "#9b7654", dark: "#7d5c3f", mark: "pebble" },
  sand: { base: "#cfb488", light: "#d9c095", dark: "#c2a77b", mark: "ripple" },
  darksand: { base: "#4a4644", light: "#54504d", dark: "#3e3a38", mark: "ripple" },
  // THE MARSH. Moss here is the purple spore growth, not a green one — the
  // spore walls, pines and waters it sits among are all violet, and a
  // green floor under a violet forest reads as two maps. Spore moss is the
  // same ground further gone, and mud is the black wet earth between
  moss: { base: "#6c4774", light: "#785282", dark: "#5e3d66", mark: "patch" },
  sporeMoss: { base: "#714a88", light: "#7f5697", dark: "#623f78", mark: "pebble" },
  mud: { base: "#372220", light: "#432b28", dark: "#2b1a18", mark: "ripple" },
  // the bare rocks
  shale: { base: "#5f5a80", light: "#6a658c", dark: "#524d72", mark: "crack" },
  basalt: { base: "#413e3e", light: "#4b4848", dark: "#363333", mark: "patch" },
  // the frozen set, toned to the snow and ice walls beside them
  snow: { base: "#e6ecf2", light: "#f1f4f8", dark: "#d8e0e9", mark: "patch" },
  salt: { base: "#f0f1f5", light: "#f9f9fb", dark: "#e2e4ea", mark: "crack" },
  ice: { base: "#cfcff6", light: "#dcdcfb", dark: "#bcbcea", mark: "crack" },
  hotrock: { base: "#4e3b35", light: "#5a4640", dark: "#402f2b", accent: "#d86a3a", mark: "vein" },
  magmarock: { base: "#5a3a30", light: "#66443a", dark: "#4a2e26", accent: "#f08a4a", mark: "vein" },
};

export const FLOOR_KINDS = Object.keys(FLOOR_STYLE) as FloorKind[];

const mulberry32 = (seed: number) => (): number => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const hex = (c: string): [number, number, number] => [
  parseInt(c.slice(1, 3), 16),
  parseInt(c.slice(3, 5), 16),
  parseInt(c.slice(5, 7), 16),
];

/**
 * Paint one tile: `TILE_PX`×`TILE_PX` RGBA, row-major, fully opaque.
 * Works on the 16×16 logical grid and scales up at the end, so every
 * mark is a whole logical pixel wide.
 */
export function paintFloor(kind: FloorKind, variant: number): Uint8ClampedArray<ArrayBuffer> {
  const st = FLOOR_STYLE[kind];
  const N = TILE_LOGICAL;
  // every kind and variant gets its own, fixed roll
  const rng = mulberry32(FLOOR_KINDS.indexOf(kind) * 131 + (variant % FLOOR_VARIANTS) * 17 + 7);
  const grid = new Array<string>(N * N).fill(st.base);
  const put = (x: number, y: number, c: string): void => {
    if (x >= 0 && y >= 0 && x < N && y < N) grid[y * N + x] = c;
  };
  // a place for a mark, kept two logical pixels off the tile's rim: the
  // atlas crops that ring away (FLOOR_INSET in atlas.ts), and a mark that
  // reached it would be cut at the seam
  const RIM = 2;
  const spot = (w: number, h: number): [number, number] => [
    RIM + Math.floor(rng() * (N - RIM * 2 - w)),
    RIM + Math.floor(rng() * (N - RIM * 2 - h)),
  ];
  /** a soft blob: a rectangle with its corners knocked off */
  const blob = (c: string, w: number, h: number): void => {
    const [x, y] = spot(w, h);
    for (let j = 0; j < h; j++)
      for (let i = 0; i < w; i++) {
        const corner = (i === 0 || i === w - 1) && (j === 0 || j === h - 1);
        if (corner && (w > 2 || h > 2)) continue;
        put(x + i, y + j, c);
      }
  };
  /** a crack: a line that walks 4-6 steps with one bend in it */
  const crack = (c: string): void => {
    const len = 4 + Math.floor(rng() * 3);
    let [x, y] = spot(len, len);
    const dx = rng() < 0.5 ? 1 : 0, dy = 1 - dx;
    const bend = 1 + Math.floor(rng() * (len - 2));
    for (let k = 0; k < len; k++) {
      put(x, y, c);
      if (k === bend) {
        // turn once, toward the side of the tile with more room
        x += dy * (x < N / 2 ? 1 : -1);
        y += dx * (y < N / 2 ? 1 : -1);
        put(x, y, c);
      }
      x += dx;
      y += dy;
    }
  };
  /** a ripple: a light dash, three or four wide, one high */
  const dash = (c: string): void => {
    const w = 3 + Math.floor(rng() * 2);
    const [x, y] = spot(w, 1);
    for (let i = 0; i < w; i++) put(x + i, y, c);
  };

  switch (st.mark) {
    case "patch":
      blob(st.light, 3 + Math.floor(rng() * 2), 2 + Math.floor(rng() * 2));
      if (rng() < 0.6) blob(st.dark, 2 + Math.floor(rng() * 2), 2);
      break;
    case "tuft": {
      blob(st.light, 3, 2 + Math.floor(rng() * 2));
      if (rng() < 0.5) blob(st.dark, 2, 3);
      // two blades, side by side, one taller than the other
      const [x, y] = spot(2, 3);
      put(x, y + 1, st.dark);
      put(x, y + 2, st.dark);
      put(x + 1, y, st.dark);
      put(x + 1, y + 1, st.dark);
      put(x + 1, y + 2, st.dark);
      break;
    }
    case "crack":
      crack(st.dark);
      blob(st.light, 3, 2);
      break;
    case "ripple":
      dash(st.light);
      if (rng() < 0.7) dash(st.light);
      if (rng() < 0.4) dash(st.dark);
      break;
    case "pebble": {
      blob(st.light, 3 + Math.floor(rng() * 2), 2);
      if (rng() < 0.5) blob(st.dark, 2, 2);
      // one stone: a dark pixel with the light catching its top
      const [x, y] = spot(2, 2);
      put(x, y + 1, st.dark);
      put(x + 1, y + 1, st.dark);
      put(x, y, st.light);
      break;
    }
    case "vein":
      crack(st.accent ?? st.light);
      if (kind === "magmarock") crack(st.accent ?? st.light);
      blob(st.dark, 3, 2);
      break;
  }

  const out = new Uint8ClampedArray(new ArrayBuffer(TILE_PX * TILE_PX * 4));
  for (let y = 0; y < TILE_PX; y++)
    for (let x = 0; x < TILE_PX; x++) {
      const [r, g, b] = hex(grid[Math.floor(y / TILE_SCALE) * N + Math.floor(x / TILE_SCALE)]);
      const o = (y * TILE_PX + x) * 4;
      out[o] = r;
      out[o + 1] = g;
      out[o + 2] = b;
      out[o + 3] = 255;
    }
  return out;
}

/** the painted tile as a canvas, at the 32px the atlas and the menu expect */
export function floorCanvas(kind: FloorKind, variant: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = c.height = TILE_PX;
  const g = c.getContext("2d");
  if (!g) throw new Error("2d context unavailable for floor tile");
  g.putImageData(new ImageData(paintFloor(kind, variant), TILE_PX, TILE_PX), 0, 0);
  return c;
}

/** where the editor's palette icons are written (scripts/gen-tiles.mjs) */
export const tileIcon = (kind: FloorKind, variant: number): string =>
  `/tiles/${kind}${(variant % FLOOR_VARIANTS) + 1}.png`;

/* ======================================================================
 * THE HILL BLOCKS — the rock a lane is cut through, painted like the
 * floors.
 *
 * Mindustry's walls are what its floors are not: highly worked. Every
 * block carries a wide diagonal bevel, lit along its top-left edge and
 * shadowed along its bottom-right, with chunky notched corners, and that
 * bevel is the second most recognisable thing about its ground after the
 * speckle. A block here is a plateau instead: a flat face inside a thin
 * dark outline, corners knocked off to round it, a single light lip along
 * the top and a dark line above the bottom so it stands up off the floor
 * without pretending to a 45° light. The outline is only a step darker
 * than the face: at full contrast every outcrop turned into a grid from
 * map height, and the field's own blurred shadow already draws the rim. The face carries the family's mark —
 * strata on shale, a crack on stone and ice, clumps on dirt, ripples on
 * sand — so a rock is still a texture, only a quieter one.
 *
 * A 2×2 cluster of rock takes ONE block twice the size (the field's
 * large-draw rule, UV_WALL_LARGE), which is what makes an outcrop read as
 * a mass rather than as a stack of bricks; `span` paints that one.
 * ====================================================================== */

export type WallKind =
  | "stone"
  | "dirt"
  | "dark"
  | "spore"
  | "shale"
  | "snow"
  | "ice"
  | "salt"
  | "sand"
  | "dune"
  | "dacite";

export interface WallStyle {
  /** the plateau's face */
  face: string;
  /** the lip along the top, and the marks that catch light */
  light: string;
  /** the shade above the bottom edge, and the marks that sit in shadow */
  dark: string;
  /** the outline */
  edge: string;
  /** what the face wears: see the floor marks, plus `strata` — two or
   *  three level dark lines, the bedding of a sedimentary rock */
  mark: "patch" | "crack" | "ripple" | "strata" | "clump";
}

export const WALL_STYLE: Readonly<Record<WallKind, WallStyle>> = {
  stone: { face: "#8f8f99", light: "#a6a6b0", dark: "#71717b", edge: "#62626c", mark: "crack" },
  dirt: { face: "#a07753", light: "#b58a63", dark: "#846040", edge: "#6e5036", mark: "clump" },
  dark: { face: "#4c5158", light: "#5e646c", dark: "#3b4046", edge: "#30343a", mark: "crack" },
  spore: { face: "#8b5ba2", light: "#a271b8", dark: "#734a89", edge: "#593a68", mark: "patch" },
  shale: { face: "#7d7ba0", light: "#9391b3", dark: "#66648a", edge: "#53516e", mark: "strata" },
  snow: { face: "#eef2f7", light: "#ffffff", dark: "#d3dbe5", edge: "#b6bfcb", mark: "patch" },
  ice: { face: "#dadafc", light: "#f2f2ff", dark: "#bdbdef", edge: "#a1a1d2", mark: "crack" },
  salt: { face: "#f4f5f8", light: "#ffffff", dark: "#dcdfe6", edge: "#c3c7cf", mark: "crack" },
  sand: { face: "#e3caa5", light: "#f0ddc0", dark: "#c9ae88", edge: "#ad9268", mark: "ripple" },
  dune: { face: "#5b5755", light: "#6c6866", dark: "#4a4644", edge: "#3a3735", mark: "ripple" },
  dacite: { face: "#a6a6bb", light: "#bcbccf", dark: "#8c8ca1", edge: "#767689", mark: "strata" },
};

export const WALL_KINDS = Object.keys(WALL_STYLE) as WallKind[];
export const WALL_VARIANTS = 2;

/**
 * Paint one block: `span` tiles on a side (1 or 2), as `TILE_PX * span`
 * square RGBA. Opaque throughout — a wall cell has no floor under it.
 */
export function paintWall(
  kind: WallKind,
  variant: number,
  span = 1,
): Uint8ClampedArray<ArrayBuffer> {
  const st = WALL_STYLE[kind];
  const N = TILE_LOGICAL * span;
  const rng = mulberry32(
    1000 + WALL_KINDS.indexOf(kind) * 131 + (variant % WALL_VARIANTS) * 17 + span * 977,
  );
  const grid = new Array<string>(N * N).fill(st.face);
  const put = (x: number, y: number, c: string): void => {
    if (x >= 0 && y >= 0 && x < N && y < N) grid[y * N + x] = c;
  };
  // the outline, the rounded corners, the lip and the shade
  for (let i = 0; i < N; i++) {
    put(i, 0, st.edge);
    put(i, N - 1, st.edge);
    put(0, i, st.edge);
    put(N - 1, i, st.edge);
    if (i > 1 && i < N - 2) {
      put(i, 1, st.light);
      put(i, N - 2, st.dark);
    }
  }
  for (const [cx, cy] of [[0, 0], [N - 1, 0], [0, N - 1], [N - 1, N - 1]] as const) {
    const sx = cx === 0 ? 1 : -1, sy = cy === 0 ? 1 : -1;
    put(cx + sx, cy, st.edge);
    put(cx, cy + sy, st.edge);
    put(cx + sx, cy + sy, st.edge);
  }
  // marks stay inside the lip and the shade
  const RIM = 3;
  const spot = (w: number, h: number): [number, number] => [
    RIM + Math.floor(rng() * Math.max(1, N - RIM * 2 - w)),
    RIM + Math.floor(rng() * Math.max(1, N - RIM * 2 - h)),
  ];
  const blob = (c: string, w: number, h: number): void => {
    const [x, y] = spot(w, h);
    for (let j = 0; j < h; j++)
      for (let i = 0; i < w; i++) {
        const corner = (i === 0 || i === w - 1) && (j === 0 || j === h - 1);
        if (corner && (w > 2 || h > 2)) continue;
        put(x + i, y + j, c);
      }
  };
  const crack = (c: string): void => {
    const len = 3 + Math.floor(rng() * 3) + span;
    let [x, y] = spot(len, len);
    const dx = rng() < 0.5 ? 1 : 0, dy = 1 - dx;
    const bend = 1 + Math.floor(rng() * (len - 2));
    for (let k = 0; k < len; k++) {
      put(x, y, c);
      if (k === bend) {
        x += dy * (x < N / 2 ? 1 : -1);
        y += dx * (y < N / 2 ? 1 : -1);
        put(x, y, c);
      }
      x += dx;
      y += dy;
    }
  };
  const dash = (c: string): void => {
    const w = 3 + Math.floor(rng() * 2);
    const [x, y] = spot(w, 1);
    for (let i = 0; i < w; i++) put(x + i, y, c);
  };
  const strata = (): void => {
    // level lines that run most of the face, broken once
    const w = N - RIM * 2 - 2 - Math.floor(rng() * 3);
    const [x, y] = spot(w, 1);
    const gap = 1 + Math.floor(rng() * (w - 2));
    for (let i = 0; i < w; i++) if (i !== gap) put(x + i, y, st.dark);
  };
  const reps = span * span;
  switch (st.mark) {
    case "patch":
      for (let r = 0; r < reps; r++) {
        blob(st.light, 3, 2);
        if (rng() < 0.6) blob(st.dark, 2, 2);
      }
      break;
    case "crack":
      for (let r = 0; r < reps; r++) {
        crack(st.dark);
        if (rng() < 0.5) blob(st.light, 3, 2);
      }
      break;
    case "ripple":
      for (let r = 0; r < reps; r++) {
        dash(st.light);
        dash(st.dark);
      }
      break;
    case "strata":
      for (let r = 0; r < reps + 1; r++) strata();
      break;
    case "clump":
      for (let r = 0; r < reps; r++) {
        blob(st.dark, 3, 2);
        blob(st.light, 2, 2);
      }
      break;
  }

  const P = TILE_PX * span;
  const out = new Uint8ClampedArray(new ArrayBuffer(P * P * 4));
  for (let y = 0; y < P; y++)
    for (let x = 0; x < P; x++) {
      const [r, g, b] = hex(grid[Math.floor(y / TILE_SCALE) * N + Math.floor(x / TILE_SCALE)]);
      const o = (y * P + x) * 4;
      out[o] = r;
      out[o + 1] = g;
      out[o + 2] = b;
      out[o + 3] = 255;
    }
  return out;
}

/** the painted block as a canvas: 32px for one tile, 64px for a 2×2 */
export function wallCanvas(kind: WallKind, variant: number, span = 1): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = c.height = TILE_PX * span;
  const g = c.getContext("2d");
  if (!g) throw new Error("2d context unavailable for wall tile");
  g.putImageData(new ImageData(paintWall(kind, variant, span), TILE_PX * span, TILE_PX * span), 0, 0);
  return c;
}

/** where the editor's palette icons for walls are written */
export const wallIcon = (kind: WallKind, variant: number): string =>
  `/tiles/wall-${kind}${(variant % WALL_VARIANTS) + 1}.png`;
