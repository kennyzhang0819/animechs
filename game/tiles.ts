/**
 * THE GROUND TILES — the game's own floor art, painted rather than loaded.
 *
 * The floors used to be Mindustry's: a 32px tile of two colours with a
 * fifth of its pixels flipped to the second one at random, three numbered
 * variants a floor. That speckle is the most recognisable thing about
 * Mindustry's ground, and the first thing to change if the game is to
 * look like itself.
 *
 * A tile is 32 pixels across, the same grid the turrets are drawn on
 * (docs/turret-factions.md: a 1x1 head is 32 px), so the ground, the
 * heads on it and the animals walking it are one pixel. It was 16
 * logical pixels drawn 2x once; that hand's marks came out two pixels
 * wide, and the turrets' rule is NOTHING UNDER FOUR: no line, tick,
 * crest or gouge narrower than four, no dither. A floor is a flat base
 * colour and one mark in its pair's light, on a third of its cells;
 * two paintings a floor, one marked and one plain.
 *
 * Everything is deterministic: a (kind, variant) pair paints the same
 * pixels every time, in the browser and in the script that writes the
 * editor's palette icons (scripts/gen-tiles.mjs). Nothing here touches the
 * DOM until `floorCanvas` is called, so the map module can import the
 * tones for its thumbnails on the server.
 */

import { LINOCUT_TERRAIN } from "./terrainFlag";

/** pixels across a tile: the turrets' 32, drawn 1:1 into the cell */
export const TILE_LOGICAL = 32;
export const TILE_SCALE = 1;
/** the smallest thing drawn on a tile, px: the turrets' rule */
export const MIN_MARK = 4;
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
   * the one kind of mark this ground wears — every one of them round,
   * and one to a tile:
   * soft    — a light blob, a shade up from the ground
   * tussock — a light blob, or a small dark clump
   * spotted — a light blob, or a dark one
   * dune    — a wide, low light ellipse, wind-blown
   * pebbled — a light blob, or a shaded stone
   * ember   — a glowing accent spot
   */
  mark: "soft" | "tussock" | "spotted" | "dune" | "pebbled" | "ember";
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

const STOCK_FLOOR_STYLE: Readonly<Record<FloorKind, FloorStyle>> = {
  grass: { base: "#6a9b52", light: "#78a95c", dark: "#5c8a46", mark: "tussock" },
  stone: { base: "#7c7c84", light: "#878790", dark: "#6b6b73", mark: "spotted" },
  dirt: { base: "#8f6b4a", light: "#9b7654", dark: "#7d5c3f", mark: "pebbled" },
  sand: { base: "#cfb488", light: "#d9c095", dark: "#c2a77b", mark: "dune" },
  darksand: { base: "#4a4644", light: "#54504d", dark: "#3e3a38", mark: "dune" },
  // THE MARSH. Moss here is the purple spore growth, not a green one — the
  // spore walls, pines and waters it sits among are all violet, and a
  // green floor under a violet forest reads as two maps. Spore moss is the
  // same ground further gone, and mud is the black wet earth between
  moss: { base: "#6c4774", light: "#785282", dark: "#5e3d66", mark: "soft" },
  sporeMoss: { base: "#714a88", light: "#7f5697", dark: "#623f78", mark: "pebbled" },
  mud: { base: "#372220", light: "#432b28", dark: "#2b1a18", mark: "dune" },
  // the bare rocks
  shale: { base: "#5f5a80", light: "#6a658c", dark: "#524d72", mark: "spotted" },
  basalt: { base: "#413e3e", light: "#4b4848", dark: "#363333", mark: "soft" },
  // the frozen set, toned to the snow and ice walls beside them
  snow: { base: "#e6ecf2", light: "#f1f4f8", dark: "#d8e0e9", mark: "soft" },
  salt: { base: "#f0f1f5", light: "#f9f9fb", dark: "#e2e4ea", mark: "spotted" },
  ice: { base: "#cfcff6", light: "#dcdcfb", dark: "#bcbcea", mark: "spotted" },
  hotrock: { base: "#4e3b35", light: "#5a4640", dark: "#402f2b", accent: "#d86a3a", mark: "ember" },
  magmarock: { base: "#5a3a30", light: "#66443a", dark: "#4a2e26", accent: "#f08a4a", mark: "ember" },
};


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

/** a colour part way from `a` to `b` */
const mix = (a: string, b: string, t: number): string => {
  const [ar, ag, ab] = hex(a), [br, bg, bb] = hex(b);
  const ch = (x: number, y: number): string =>
    Math.round(x + (y - x) * t)
      .toString(16)
      .padStart(2, "0");
  return `#${ch(ar, br)}${ch(ag, bg)}${ch(ab, bb)}`;
};

const lit = (c: string, t: number): string => mix(c, "#ffffff", t);
const shd = (c: string, t: number): string => mix(c, "#000000", t);

/* ======================================================================
 * THE LINOCUT INK — ochre. One carved hand for the whole board: floors
 * warmed toward ochre and flat, rock as burnt umber with a pale band on
 * its lit edges and a dark one on its shaded, water two teals. The
 * numbers are the concept's (scripts/terrain-concepts.mjs,
 * LINOCUT_PALETTES.ochre); a floor or wall family keeps its own hue
 * underneath, so a desert is still a desert and a tundra a tundra.
 * ====================================================================== */
const INK = {
  warm: "#c9a45a",
  umber: "#8a5a34",
  umberDeep: "#5a3a20",
  umberLit: "#e2b876",
  canopy: "#6a7a30",
  deep: "#1f4a55",
  shallow: "#2f6b74",
  crest: "#cfe6d8",
  taintedDeep: "#173840",
  taintedShallow: "#245459",
} as const;
/**
 * HOW OFTEN A FLOOR CARRIES A MARK, under the ink. A land family paints
 * three variants (atlas.ts FLOOR_GROUPS) and only variant 0 gets a tick,
 * so two cells in three are plain ground — a mark on two of three read
 * as a texture over the whole board rather than something on the ground
 * here and there.
 */
const LINOCUT_MARK_EVERY = 3;
/** how far the shaded band goes toward black, and the lit band toward the ink's highlight */
const LINOCUT_SHADE = { dark: 0.55, light: 1 } as const;

/** a floor family under the ink: warmed, its two shades a step further apart */
const linocutFloor = (s: FloorStyle): FloorStyle => {
  const base = mix(s.base, INK.warm, 0.15);
  return { ...s, base, light: lit(base, 0.2), dark: shd(base, 0.22) };
};
const mapStyles = <K extends string, V>(t: Readonly<Record<K, V>>, f: (v: V) => V): Readonly<Record<K, V>> =>
  Object.fromEntries((Object.keys(t) as K[]).map((k) => [k, f(t[k])])) as Record<K, V>;

export const FLOOR_STYLE: Readonly<Record<FloorKind, FloorStyle>> = LINOCUT_TERRAIN
  ? mapStyles(STOCK_FLOOR_STYLE, linocutFloor)
  : STOCK_FLOOR_STYLE;
export const FLOOR_KINDS = Object.keys(FLOOR_STYLE) as FloorKind[];

/**
 * EVERY MARK IS ROUND. Visit each cell inside an ellipse, handing the
 * callback its position as (u, v) in [-1, 1] across the ellipse, so a
 * caller can shade the top of a lump differently from its underside. The
 * ellipse is tested at cell centres, which at this size gives the soft,
 * slightly lumpy outline pixel art wants rather than a hard geometric one.
 */
const ellipse = (
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  fn: (x: number, y: number, u: number, v: number) => void,
): void => {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const u = (x + 0.5 - cx) / rx, v = (y + 0.5 - cy) / ry;
      if (u * u + v * v <= 1) fn(x, y, u, v);
    }
};

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
  // the dark tone, eased toward the ground: a dark spot at full strength
  // reads as a hole, and a floor wants texture rather than holes
  const dark = mix(st.dark, st.base, 0.4);
  const put = (x: number, y: number, c: string): void => {
    if (x >= 0 && y >= 0 && x < N && y < N) grid[y * N + x] = c;
  };
  // a place for a mark, kept two logical pixels off the tile's rim: the
  // atlas crops that ring away (FLOOR_INSET in atlas.ts), and a mark that
  // reached it would be cut at the seam
  const RIM = 4;
  const spot = (w: number, h: number): [number, number] => [
    RIM + Math.floor(rng() * (N - RIM * 2 - w)),
    RIM + Math.floor(rng() * (N - RIM * 2 - h)),
  ];
  /** a blob: a rounded patch of one colour, a little wider than tall */
  const blob = (c: string, r: number, squash = 0.8): void => {
    const rx = r, ry = Math.max(MIN_MARK / 2, r * squash);
    const cx = RIM + rx + rng() * (N - RIM * 2 - rx * 2);
    const cy = RIM + ry + rng() * (N - RIM * 2 - ry * 2);
    ellipse(cx, cy, rx, ry, (x, y) => put(x, y, c));
  };
  /** a stone: a dark lump with the light on its top */
  const stone = (r: number): void => {
    const rx = r, ry = r * 0.85;
    const cx = RIM + rx + rng() * (N - RIM * 2 - rx * 2);
    const cy = RIM + ry + rng() * (N - RIM * 2 - ry * 2);
    ellipse(cx, cy, rx, ry, (x, y, u, v) => put(x, y, v < -0.25 && Math.abs(u) < 0.75 ? st.light : dark));
  };

  // THE SECOND PAINTING IS PLAIN GROUND, and the first carries ONE mark.
  // Two or three marks on every cell was a field of dots; with a third
  // of the cells bare and one mark on the rest, the ground is a colour
  // with something on it here and there, which is what ground looks like
  // from above
  if (LINOCUT_TERRAIN) {
    // under the ink the one mark is a carved tick: a short diagonal
    // stroke, either way, in the ground's light — the pair's other tone
    // and nothing else — and never narrower than the turrets' four px
    // (seven rows of the diagonal is five across it)
    if (variant % LINOCUT_MARK_EVERY === 0) {
      const len = 5 + Math.floor(rng() * 3), flip = rng() < 0.5 ? 1 : -1;
      const x0 = RIM + 2 + Math.floor(rng() * (N - RIM * 2 - 4 - len));
      const y0 = RIM + 2 + (flip < 0 ? len : 0) + Math.floor(rng() * (N - RIM * 2 - 4 - len));
      const c = mix(st.light, st.base, 0.35);
      for (let y = 0; y < N; y++)
        for (let x = 0; x < N; x++) {
          const u = x - x0 + flip * (y - y0), v = x - x0 - flip * (y - y0);
          if (u >= 0 && u < len * 2 && Math.abs(v) <= 3) put(x, y, c);
        }
    }
  } else if (variant % FLOOR_VARIANTS === 0)
    switch (st.mark) {
      case "soft":
        blob(st.light, 6 + rng() * 3);
        break;
      case "tussock":
        if (rng() < 0.5) blob(st.light, 6 + rng() * 3);
        else blob(dark, 3.6 + rng() * 1.2, 1);
        break;
      case "spotted":
        if (rng() < 0.6) blob(st.light, 6 + rng() * 3);
        else blob(dark, 4 + rng() * 1.6);
        break;
      case "dune":
        blob(st.light, 7 + rng() * 3, 0.4);
        break;
      case "pebbled":
        if (rng() < 0.5) blob(st.light, 6 + rng() * 3);
        else stone(3.6 + rng() * 1);
        break;
      case "ember":
        blob(st.accent ?? st.light, 3.2 + rng() * 1.2);
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
 * THE HILL BLOCKS — the rock a lane is cut through.
 *
 * The shading is Mindustry's wall rule, read off its sprites: the top-
 * right corner of a tile is the light tone, the bottom-left corner the
 * dark tone, and a wide band of the mid tone runs diagonally between
 * them, its two boundaries wandering a little so the bands are not
 * ruled lines. Every tile carries the same corners, so an outcrop reads
 * as stacked stones each lit from the same side — the boulder props use
 * the same rule on a rounded silhouette. On top of the bands the first
 * painting carries one pale patch and the second nothing, as before.
 * Nothing else: no lumps, no marks, and nothing that reads as a sphere.
 *
 * A 2×2 cluster of rock takes ONE block twice the size (the field's
 * large-draw rule, UV_WALL_LARGE), shaded corner to corner across the
 * whole block; `span` paints that one.
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
  /** the mid tone: the band across the middle of the tile */
  face: string;
  /** the lit corner, top-right */
  light: string;
  /** the shaded corner, bottom-left */
  dark: string;
  /**
   * the grain of the rock — how much of the tile the corners take:
   * rough  — a narrow lit corner and a deep shaded one, the bare rocks
   * soft   — both corners shallow, the earths and snow
   * glassy — a wide lit corner and a shallow shaded one, ice and salt
   */
  grain: "rough" | "soft" | "glassy";
}

const STOCK_WALL_STYLE: Readonly<Record<WallKind, WallStyle>> = {
  stone: { face: "#84848f", light: "#9b9ba6", dark: "#65656f", grain: "rough" },
  dirt: { face: "#9a7250", light: "#b08862", dark: "#7a583b", grain: "soft" },
  dark: { face: "#474c53", light: "#5b6169", dark: "#33373d", grain: "rough" },
  spore: { face: "#84579a", light: "#9d6fb3", dark: "#67407a", grain: "soft" },
  shale: { face: "#75739a", light: "#8f8db1", dark: "#5a5878", grain: "rough" },
  snow: { face: "#e9eef4", light: "#ffffff", dark: "#cbd5e0", grain: "soft" },
  ice: { face: "#d4d4fa", light: "#f0f0ff", dark: "#aeaee6", grain: "glassy" },
  salt: { face: "#f1f2f6", light: "#ffffff", dark: "#d3d7df", grain: "glassy" },
  sand: { face: "#dcc39e", light: "#eedbbb", dark: "#bfa47d", grain: "soft" },
  dune: { face: "#575351", light: "#6a6663", dark: "#403c3a", grain: "soft" },
  dacite: { face: "#9f9fb4", light: "#b9b9cc", dark: "#82829a", grain: "rough" },
};

/** a rock family under the ink: the face burnt umber over the family's
 *  own hue, its light and dark a step further apart than the stock rock's.
 *  The hill's edges carry no band of their own — the carved bands the
 *  concepts drew along every rock/ground border are gone; what shades a
 *  hill now is the game's own darkness and its shadow */
const linocutWall = (s: WallStyle): WallStyle => {
  const face = mix(shd(s.face, 0.18), INK.umber, 0.45);
  return {
    ...s,
    face,
    light: mix(face, mix(lit(s.face, 0.2), INK.umberLit, 0.35), LINOCUT_SHADE.light),
    dark: shd(mix(face, INK.umberDeep, 0.4), LINOCUT_SHADE.dark),
  };
};
export const WALL_STYLE: Readonly<Record<WallKind, WallStyle>> = LINOCUT_TERRAIN
  ? mapStyles(STOCK_WALL_STYLE, linocutWall)
  : STOCK_WALL_STYLE;
export const WALL_KINDS = Object.keys(WALL_STYLE) as WallKind[];

export const WALL_VARIANTS = 2;

/**
 * Paint one block: `span` tiles on a side (1 or 2), as `TILE_PX * span`
 * square RGBA. Opaque throughout — a wall cell has no floor under it —
 * and plain at every edge, so any cell sits flush against any other.
 */
export function paintWall(
  kind: WallKind,
  variant: number,
  span = 1,
): Uint8ClampedArray<ArrayBuffer> {
  const st = WALL_STYLE[kind];
  const N = TILE_LOGICAL * span;
  const rng = mulberry32(
    2000 + WALL_KINDS.indexOf(kind) * 131 + (variant % WALL_VARIANTS) * 17 + span * 977,
  );
  const grid = new Array<string>(N * N).fill(st.face);
  const put = (x: number, y: number, c: string): void => {
    if (x >= 0 && y >= 0 && x < N && y < N) grid[y * N + x] = c;
  };
  if (LINOCUT_TERRAIN) {
    // under the ink a rock is flat, and the first painting carries one
    // gouge: a diagonal stroke in the rock's light, five px across (the
    // turrets' four at least), clear of the rim the atlas crops
    // (WALL_INSET, eight px)
    if (variant % WALL_VARIANTS === 0) {
      const RIM = 8, len = 7 + Math.floor(rng() * 4), flip = rng() < 0.5 ? 1 : -1;
      const x0 = RIM + Math.floor(rng() * (N - RIM * 2 - len));
      const y0 = RIM + (flip < 0 ? len : 0) + Math.floor(rng() * (N - RIM * 2 - len));
      const c = mix(st.face, st.light, 0.55);
      for (let y = 0; y < N; y++)
        for (let x = 0; x < N; x++) {
          const u = x - x0 + flip * (y - y0), v = x - x0 - flip * (y - y0);
          if (u >= 0 && u < len * 2 && Math.abs(v) <= 3) put(x, y, c);
        }
    }
    return toRgba(grid, N, TILE_PX * span);
  }
  // THE BANDS. `t` runs from -1 at the bottom-left corner to +1 at the
  // top-right; the two thresholds cut the tile into the shaded corner,
  // the mid band and the lit corner, and a slow wobble along each
  // boundary keeps them from being ruled lines
  const [litAt, darkAt] =
    st.grain === "rough" ? [0.3, -0.3] : st.grain === "soft" ? [0.4, -0.4] : [0.15, -0.4];
  // the shaded corner, eased toward the face: at full strength it read
  // as a hole in the rock rather than the far side of it
  const dark = mix(st.dark, st.face, 0.45);
  const w1 = rng() * Math.PI * 2, w2 = rng() * Math.PI * 2, w3 = rng() * Math.PI * 2;
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const t = (x + 0.5 - (y + 0.5)) / N;
      const along = (x + y) / N; // position along the boundary
      const wobble =
        0.09 * Math.sin(along * Math.PI * 2 + w1) +
        0.05 * Math.sin(along * Math.PI * 5 + w2) +
        0.04 * Math.sin(t * Math.PI * 3 + w3);
      const v = t + wobble;
      put(x, y, v > litAt ? st.light : v < darkAt ? dark : st.face);
    }

  // ONE ROCK. The first painting carries a single small pebble in the
  // light tone, sat on the mid band and clear of the rim so any cell
  // sits flush against any other; the second painting is the bands
  // alone. A 2×2 block gets one pebble too, not one a tile. Four logical
  // px off the rim: the atlas crops that ring away (WALL_INSET), and a
  // pebble that reached it would be cut at the seam
  if (variant % WALL_VARIANTS === 0) {
    const RIM = 8;
    const r = 3.6 + rng() * 1.2;
    let cx = N / 2, cy = N / 2;
    for (let tries = 0; tries < 12; tries++) {
      const x = RIM + r + rng() * (N - RIM * 2 - r * 2);
      const y = RIM + r + rng() * (N - RIM * 2 - r * 2);
      const t = (x - y) / N;
      if (t < litAt - 0.12 && t > darkAt + 0.12) {
        cx = x;
        cy = y;
        break;
      }
    }
    ellipse(cx, cy, r, r * 0.9, (x, y) => put(x, y, st.light));
  }

  return toRgba(grid, N, TILE_PX * span);
}

/** a logical grid of colours as opaque RGBA at `P` px a side, TILE_SCALE up */
function toRgba(grid: readonly string[], N: number, P: number): Uint8ClampedArray<ArrayBuffer> {
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

/* ======================================================================
 * THE WATER UNDER THE INK. Mindustry's water is a 32px tile the swell
 * shader displaces; under the ink the tile is one flat teal with, on one
 * variant in three, a single wave cut into it — a short line a few shades
 * up from the water with a tick at its end — and the shader moves that
 * the way it moved the ripples. Only drawn while LINOCUT_TERRAIN is on;
 * off, the stock files are the water.
 *
 * THE VARIANT IS WHY A SEA IS NOT A GRID. One tile is repeated over every
 * water cell, so a wave in it is a wave every 32px in both directions.
 * Variant 1 alone carries the wave and the renderer picks a variant per
 * cell, which puts a wave on a third of them, in a different place on
 * each kind.
 * ====================================================================== */
export type WaterKind = "shallowWater" | "deepWater" | "taintedWater" | "deepTaintedWater";
/** how many painted cells a water kind has, and which of them has the wave */
export const WATER_VARIANTS = 3;
const WATER_WAVE_VARIANT = 1;
export function paintWater(kind: WaterKind, variant = WATER_WAVE_VARIANT): Uint8ClampedArray<ArrayBuffer> {
  const N = TILE_LOGICAL;
  const deep = kind === "deepWater" || kind === "deepTaintedWater";
  const tainted = kind === "taintedWater" || kind === "deepTaintedWater";
  const base = tainted ? (deep ? INK.taintedDeep : INK.taintedShallow) : deep ? INK.deep : INK.shallow;
  // the wave is the water a few shades up, not a white line: at full
  // strength every one of them read as surf
  const crest = mix(INK.crest, base, tainted ? 0.82 : 0.72);
  const rng = mulberry32(9000 + (deep ? 17 : 0) + (tainted ? 131 : 0));
  const grid = new Array<string>(N * N).fill(base);
  if (variant % WATER_VARIANTS === WATER_WAVE_VARIANT) {
    // one wave a tile: a 14px line four px deep somewhere in the middle
    // band, with a four-px block lifting off its trailing end — the
    // turrets' four, nothing thinner
    const x0 = 4 + Math.floor(rng() * 10), y = 8 + Math.floor(rng() * 14);
    for (let yy = y; yy < y + 4; yy++) for (let x = x0; x < x0 + 14; x++) grid[yy * N + x] = crest;
    for (let yy = y - 4; yy < y; yy++) for (let x = x0 + 10; x < x0 + 14; x++) grid[yy * N + x] = crest;
  }
  return toRgba(grid, N, TILE_PX);
}
export function waterCanvas(kind: WaterKind, variant = WATER_WAVE_VARIANT): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = c.height = TILE_PX;
  const g = c.getContext("2d");
  if (!g) throw new Error("2d context unavailable for water tile");
  g.putImageData(new ImageData(paintWater(kind, variant), TILE_PX, TILE_PX), 0, 0);
  return c;
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

// ---------------------------------------------------------------------------
// THE PROPS: the things that stand on the ground — trees, boulders, shrubs,
// spore pods. Painted the way the turrets are: round shapes in ONE PAIR of
// tones, the dark on the left half of the square and the light on the
// right, and nothing that reads as a sphere. Each one is a square of
// `size` native pixels (a 48 boulder overhangs its tile to 1.5, a 32 shrub
// sits inside one, a 40 spore cluster to 1.25) with a transparent ground,
// on the tiles' own 32-a-tile grid.
// ---------------------------------------------------------------------------

/** three tones: the body, the lit side and the shaded side. The pair
 *  drawn is the lit and the shaded eased toward the body; the body itself
 *  is what a floor tone or a wall tone is keyed off */
interface PropTones {
  mid: string;
  light: string;
  dark: string;
}

/** what a prop is, and how big its square is in native pixels */
interface PropStyle {
  size: 32 | 40 | 48;
  /** thicket is the one square: a patch of ground, not a thing on it */
  shape: "tree" | "boulder" | "shrub" | "pods" | "thicket";
  tones: PropTones;
  /** the seed, so a family's second boulder is a different boulder */
  seed: number;
}

const rock = (w: WallKind, seed: number, size: 32 | 48 = 48): PropStyle => ({
  size,
  shape: "boulder",
  tones: { mid: WALL_STYLE[w].face, light: WALL_STYLE[w].light, dark: WALL_STYLE[w].dark },
  seed,
});

/** a growing thing's tone under the ink: pulled toward the canopy olive */
const leaf = (c: string): string => (LINOCUT_TERRAIN ? mix(c, INK.canopy, 0.3) : c);
export const PROP_STYLE = {
  pine: { size: 48, shape: "tree", seed: 1, tones: { mid: leaf("#5a9c4c"), light: leaf("#7dbd68"), dark: leaf("#3d7238") } },
  sporePine: { size: 48, shape: "tree", seed: 2, tones: { mid: leaf("#8f5aa8"), light: leaf("#ad7cc4"), dark: leaf("#6a3f82") } },
  snowPine: { size: 48, shape: "tree", seed: 3, tones: { mid: "#e4ebf2", light: "#ffffff", dark: "#b6c5d6" } },
  boulder0: rock("stone", 11),
  boulder1: rock("stone", 12),
  snowBoulder0: rock("snow", 21),
  snowBoulder1: rock("snow", 22),
  basaltBoulder0: rock("dark", 31),
  basaltBoulder1: rock("dark", 32),
  shaleBoulder0: rock("shale", 41, 32),
  shaleBoulder1: rock("shale", 42, 32),
  sandBoulder0: rock("sand", 51, 32),
  sandBoulder1: rock("sand", 52, 32),
  shrubs: { size: 32, shape: "thicket", seed: 61, tones: { mid: leaf("#5f9e45"), light: leaf("#7fbd5c"), dark: leaf("#4a833a") } },
  shrubs2: { size: 32, shape: "thicket", seed: 62, tones: { mid: leaf("#5f9e45"), light: leaf("#7fbd5c"), dark: leaf("#4a833a") } },
  purBush: { size: 32, shape: "shrub", seed: 71, tones: { mid: "#7561bd", light: "#9a89d9", dark: "#54459a" } },
  sporeCluster0: { size: 40, shape: "pods", seed: 81, tones: { mid: "#7b5bd1", light: "#a48ff0", dark: "#57409c" } },
  sporeCluster1: { size: 40, shape: "pods", seed: 82, tones: { mid: "#7b5bd1", light: "#a48ff0", dark: "#57409c" } },
  sporeCluster2: { size: 40, shape: "pods", seed: 83, tones: { mid: "#7b5bd1", light: "#a48ff0", dark: "#57409c" } },
} as const satisfies Record<string, PropStyle>;

export type PropKind = keyof typeof PROP_STYLE;
export const PROP_KINDS = Object.keys(PROP_STYLE) as PropKind[];

/**
 * Paint one prop: `size`×`size` RGBA, row-major, transparent where there is
 * nothing. The silhouette is a few discs overlapping, so the outline is
 * lumpy; the whole of it is then shaded the turrets' way — the pair's dark
 * on the left half, its light on the right, nothing between — so a canopy
 * is a flat shape and never a pile of spheres. There is no outline: the
 * silhouette is the shading's own edge, as on the tiles.
 */
export function paintProp(kind: PropKind): Uint8ClampedArray<ArrayBuffer> {
  const st: PropStyle = PROP_STYLE[kind];
  const N = st.size / TILE_SCALE;
  const rng = mulberry32(5000 + st.seed * 331);
  // which cells the shape covers (0 is nothing)
  const piece = new Uint8Array(N * N);
  const lump = (cx: number, cy: number, r: number, squash = 1): void =>
    ellipse(cx, cy, r, r * squash, (x, y) => {
      if (x >= 0 && y >= 0 && x < N && y < N) piece[y * N + x] = 1;
    });
  const c = N / 2;
  let trunk = false;

  switch (st.shape) {
    case "boulder": {
      // ONE ROUND STONE. It was two or three lumps once, for a lumpy
      // outline, and at the size a boulder is drawn the lumps read as a
      // ragged edge rather than as a rock. A single ellipse, a shade
      // wider than tall and set a little off centre, is round at every
      // zoom; the diagonal shading below is what makes it a stone
      const R = N * 0.36;
      const a = rng() * Math.PI * 2;
      lump(c + Math.cos(a) * N * 0.04, c + Math.sin(a) * N * 0.04, R, 0.86 + rng() * 0.1);
      break;
    }
    case "tree": {
      // a canopy seen from above: a ring of lobes round a crown, and the
      // trunk a dark dot at the heart. The corners take more of a tree
      // than of a rock: a canopy is all edge
      const R = N * 0.42;
      const lobes = 6 + Math.floor(rng() * 2);
      const a0 = rng() * Math.PI * 2;
      for (let i = 0; i < lobes; i++) {
        const b = a0 + (i / lobes) * Math.PI * 2;
        lump(c + Math.cos(b) * R * 0.58, c + Math.sin(b) * R * 0.58, R * 0.46);
      }
      lump(c, c, R * 0.62);
      trunk = true;
      break;
    }
    case "shrub": {
      // a low tuft: four or five small lumps in a loose cluster, sitting
      // inside the tile so ground shows round it
      const n = 4 + Math.floor(rng() * 2);
      const a0 = rng() * Math.PI * 2;
      for (let i = 0; i < n; i++) {
        const b = a0 + (i / n) * Math.PI * 2 + rng() * 0.5;
        const d = N * (0.12 + rng() * 0.12);
        lump(c + Math.cos(b) * d, c + Math.sin(b) * d, N * (0.16 + rng() * 0.06), 0.8 + rng() * 0.2);
      }
      break;
    }
    case "thicket": {
      // not a prop but a patch: the whole square is ground
      piece.fill(1);
      break;
    }
    case "pods": {
      // three pods of three sizes leaning together
      const a0 = rng() * Math.PI * 2;
      const rs = [0.26, 0.2, 0.16].map((r) => N * r);
      for (let i = 0; i < 3; i++) {
        const b = a0 + (i / 3) * Math.PI * 2;
        lump(c + Math.cos(b) * N * 0.17, c + Math.sin(b) * N * 0.17, rs[i]);
      }
      break;
    }
  }

  // THE SHADING: the turrets' split, the pair's dark on the left half and
  // its light on the right, both eased toward the body so a prop set down
  // at any quarter turn does not read as lit from a different side than
  // its neighbour
  const { mid, light: lightTone, dark } = st.tones;
  const light = mix(lightTone, mid, 0.4);
  const shade = mix(dark, mid, 0.45);
  const grid = new Array<string | null>(N * N).fill(null);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      if (!piece[y * N + x]) continue;
      grid[y * N + x] = x < c ? shade : light;
    }

  if (st.shape === "thicket") {
    // a few round tussocks in the light over the shade, like a floor
    // tile that grew thicker; none under four px across
    for (let i = 0; i < N * N; i++) grid[i] = shade;
    const n = 4 + Math.floor(rng() * 2);
    for (let i = 0; i < n; i++) {
      const r = 3 + rng() * 2;
      const x = 4 + r + rng() * (N - 8 - r * 2), y = 4 + r + rng() * (N - 8 - r * 2);
      ellipse(x, y, r, r * 0.85, (px, py) => {
        if (px >= 0 && py >= 0 && px < N && py < N) grid[py * N + px] = light;
      });
    }
  } else if (trunk) {
    // the trunk seen from above: a block in the shade, four px across
    for (let y = c - 2; y < c + 2; y++) for (let x = c - 2; x < c + 2; x++) grid[y * N + x] = shade;
  }

  const P = st.size;
  const out = new Uint8ClampedArray(new ArrayBuffer(P * P * 4));
  for (let y = 0; y < P; y++)
    for (let x = 0; x < P; x++) {
      const col = grid[Math.floor(y / TILE_SCALE) * N + Math.floor(x / TILE_SCALE)];
      if (col === null) continue;
      const [r, g, b] = hex(col);
      const o = (y * P + x) * 4;
      out[o] = r;
      out[o + 1] = g;
      out[o + 2] = b;
      out[o + 3] = 255;
    }
  return out;
}

/** the painted prop as a canvas at its native size, transparent round it */
export function propCanvas(kind: PropKind): HTMLCanvasElement {
  const st: PropStyle = PROP_STYLE[kind];
  const c = document.createElement("canvas");
  c.width = c.height = st.size;
  const g = c.getContext("2d");
  if (!g) throw new Error("2d context unavailable for prop");
  g.putImageData(new ImageData(paintProp(kind), st.size, st.size), 0, 0);
  return c;
}

/** where the editor's palette icons for props are written */
export const propIcon = (kind: PropKind): string => `/tiles/prop-${kind}.png`;
