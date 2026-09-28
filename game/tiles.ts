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
  | "magmarock"
  // the game's own families (docs/terrain-directions.md): earths, greys
  // and a marsh in olive, none of them a Mindustry floor
  | "loam"
  | "dust"
  | "flint"
  | "clay"
  | "peat"
  | "bog"
  | "cinder"
  | "chalk"
  // the fourth batch: the ten biomes' own ground (docs/random-maps.md)
  | "scoria"
  | "obsidian"
  | "shoal"
  | "coralsand"
  | "silt"
  | "jungle"
  | "litter"
  | "redearth"
  | "sporefield"
  | "mycelium"
  | "blight"
  | "quartz"
  | "slate"
  | "flagstone"
  | "sandstone"
  | "plate";

const STOCK_FLOOR_STYLE: Readonly<Record<FloorKind, FloorStyle>> = {
  grass: { base: "#78995a", light: "#88a866", dark: "#68884c", mark: "tussock" },
  // stone sits a step lighter and warmer than the turrets' gunmetal, so a
  // formation on it keeps its plates (docs/terrain-directions.md)
  stone: { base: "#a19c94", light: "#aea99f", dark: "#8f8a82", mark: "spotted" },
  dirt: { base: "#8f6b4a", light: "#9b7654", dark: "#7d5c3f", mark: "pebbled" },
  sand: { base: "#d3b98c", light: "#dcc59a", dark: "#c4aa7c", mark: "dune" },
  darksand: { base: "#5a524a", light: "#665d54", dark: "#4a433c", mark: "dune" },
  // THE MARSH, in olive and tea: bog moss, the same ground further gone,
  // and the black wet earth between. Violet stays the eels'
  moss: { base: "#6b7a3a", light: "#788844", dark: "#5c6a30", mark: "soft" },
  sporeMoss: { base: "#5c6630", light: "#69743a", dark: "#4e5728", mark: "pebbled" },
  mud: { base: "#3e3126", light: "#4a3c2f", dark: "#30251c", mark: "dune" },
  // the bare rocks
  shale: { base: "#5f6678", light: "#6b7286", dark: "#525968", mark: "spotted" },
  basalt: { base: "#413e3e", light: "#4b4848", dark: "#363333", mark: "soft" },
  // the frozen set, toned to the snow and ice walls beside them
  snow: { base: "#e6ecf2", light: "#f1f4f8", dark: "#d8e0e9", mark: "soft" },
  salt: { base: "#f0f1f5", light: "#f9f9fb", dark: "#e2e4ea", mark: "spotted" },
  ice: { base: "#cfcff6", light: "#dcdcfb", dark: "#bcbcea", mark: "spotted" },
  hotrock: { base: "#4e3b35", light: "#5a4640", dark: "#402f2b", accent: "#d86a3a", mark: "ember" },
  magmarock: { base: "#5a3a30", light: "#66443a", dark: "#4a2e26", accent: "#f08a4a", mark: "ember" },
  loam: { base: "#7a5a3c", light: "#886746", dark: "#6a4c32", mark: "pebbled" },
  dust: { base: "#b8ab93", light: "#c4b8a1", dark: "#a69a83", mark: "dune" },
  flint: { base: "#6f7c86", light: "#7c8994", dark: "#606c76", mark: "spotted" },
  clay: { base: "#a8613f", light: "#b66d49", dark: "#955436", mark: "soft" },
  peat: { base: "#4f5a2e", light: "#5b6737", dark: "#434d26", mark: "soft" },
  bog: { base: "#5c5638", light: "#686241", dark: "#4f4a30", mark: "dune" },
  cinder: { base: "#3a3230", light: "#463d3a", dark: "#2e2826", accent: "#c95a2a", mark: "ember" },
  chalk: { base: "#e4ddcc", light: "#eee9db", dark: "#d5cdbb", mark: "spotted" },
  scoria: { base: "#4e3029", light: "#5c3b32", dark: "#3e2520", mark: "soft" },
  obsidian: { base: "#2c2830", light: "#38333c", dark: "#201d24", mark: "spotted" },
  shoal: { base: "#d6cba8", light: "#e2d8b8", dark: "#c4b894", mark: "spotted" },
  coralsand: { base: "#e4cfc0", light: "#eedcd0", dark: "#d2bcac", mark: "dune" },
  silt: { base: "#9a9478", light: "#a8a286", dark: "#888268", mark: "soft" },
  jungle: { base: "#4e7a3a", light: "#5c8a46", dark: "#406a30", mark: "tussock" },
  litter: { base: "#6b5a3a", light: "#786646", dark: "#5c4c30", mark: "pebbled" },
  redearth: { base: "#8a4a35", light: "#98553f", dark: "#763e2c", mark: "soft" },
  sporefield: { base: "#7a6a80", light: "#88778e", dark: "#6a5a70", mark: "soft" },
  mycelium: { base: "#b4a6b4", light: "#c2b6c2", dark: "#a296a2", mark: "spotted" },
  blight: { base: "#4a3a52", light: "#56455e", dark: "#3e3046", mark: "dune" },
  quartz: { base: "#b4b0c8", light: "#c2bed4", dark: "#a29eb6", mark: "spotted" },
  slate: { base: "#4e5262", light: "#5a5e6e", dark: "#424656", mark: "soft" },
  // the sites' built ground (docs/sites.md): paving, cut sandstone, steel deck
  flagstone: { base: "#8c8f96", light: "#9a9da4", dark: "#7a7d84", mark: "spotted" },
  sandstone: { base: "#cdb388", light: "#d9c298", dark: "#b89e74", mark: "soft" },
  plate: { base: "#4a5560", light: "#56616c", dark: "#3e4852", mark: "spotted" },
};


export const mulberry32 = (seed: number) => (): number => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

export const hex = (c: string): [number, number, number] => [
  parseInt(c.slice(1, 3), 16),
  parseInt(c.slice(3, 5), 16),
  parseInt(c.slice(5, 7), 16),
];

/** a colour part way from `a` to `b` */
export const mix = (a: string, b: string, t: number): string => {
  const [ar, ag, ab] = hex(a), [br, bg, bb] = hex(b);
  const ch = (x: number, y: number): string =>
    Math.round(x + (y - x) * t)
      .toString(16)
      .padStart(2, "0");
  return `#${ch(ar, br)}${ch(ag, bg)}${ch(ab, bb)}`;
};

export const lit = (c: string, t: number): string => mix(c, "#ffffff", t);
export const shd = (c: string, t: number): string => mix(c, "#000000", t);

/* ======================================================================
 * THE LINOCUT INK — ochre. One carved hand for the whole board: floors
 * warmed toward ochre and flat, rock as burnt umber with a pale band on
 * its lit edges and a dark one on its shaded, water two teals. The
 * numbers are the concept's (scripts/terrain-concepts.mjs,
 * LINOCUT_PALETTES.ochre); a floor or wall family keeps its own hue
 * underneath, so a desert is still a desert and a tundra a tundra.
 * ====================================================================== */
export const INK = {
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
 *
 * THIS IS THE PAINT, NOT THE BOARD. The renderer thins the marked cells
 * again on the way down (FLOOR_MARK_KEEP in renderer.ts), so what a map
 * actually carries is a twelfth rather than this third. Tuning happens
 * there, because it costs nothing: the atlas cells are already packed
 * either way, and dropping a mark is a different slot rather than a
 * different painting.
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
export const ellipse = (
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
 * as stacked stones each lit from the same side. On top of the bands the first
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
  | "dacite"
  | "flint"
  | "clay"
  | "peat"
  | "cinder"
  | "chalk"
  | "loam"
  // the fourth batch, one or two a biome (docs/random-maps.md)
  | "scoria"
  | "obsidian"
  | "reef"
  | "limestone"
  | "jungle"
  | "laterite"
  | "sporerock"
  | "fungal"
  | "crystalrock"
  | "slate"
  | "masonry"
  | "plating";

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
  stone: { face: "#9a958a", light: "#b1aca0", dark: "#7a766c", grain: "rough" },
  dirt: { face: "#9a7250", light: "#b08862", dark: "#7a583b", grain: "soft" },
  dark: { face: "#474c53", light: "#5b6169", dark: "#33373d", grain: "rough" },
  // the marsh's rock is a mangrove bank: olive-brown, not violet
  spore: { face: "#6e6a3c", light: "#88844e", dark: "#54512c", grain: "soft" },
  shale: { face: "#6d7288", light: "#868ba0", dark: "#555a6c", grain: "rough" },
  snow: { face: "#e9eef4", light: "#ffffff", dark: "#cbd5e0", grain: "soft" },
  ice: { face: "#d4d4fa", light: "#f0f0ff", dark: "#aeaee6", grain: "glassy" },
  salt: { face: "#f1f2f6", light: "#ffffff", dark: "#d3d7df", grain: "glassy" },
  sand: { face: "#dcc39e", light: "#eedbbb", dark: "#bfa47d", grain: "soft" },
  dune: { face: "#5f5854", light: "#736b66", dark: "#47413d", grain: "soft" },
  dacite: { face: "#a9a8a0", light: "#c1c0b8", dark: "#8a8982", grain: "rough" },
  flint: { face: "#5c6a75", light: "#75838e", dark: "#465158", grain: "rough" },
  clay: { face: "#8c4e33", light: "#a86444", dark: "#6b3a25", grain: "soft" },
  peat: { face: "#3f4a26", light: "#556232", dark: "#2c341a", grain: "soft" },
  cinder: { face: "#2e2826", light: "#413936", dark: "#1e1a18", grain: "rough" },
  chalk: { face: "#d9d2c2", light: "#f2ede0", dark: "#b8b0a0", grain: "glassy" },
  loam: { face: "#6a4b30", light: "#83603f", dark: "#4f3722", grain: "soft" },
  scoria: { face: "#5e3c30", light: "#7e5646", dark: "#3c2620", grain: "rough" },
  obsidian: { face: "#2e2a33", light: "#4c4754", dark: "#1a1720", grain: "glassy" },
  reef: { face: "#c48a7a", light: "#e0a898", dark: "#9a6656", grain: "rough" },
  limestone: { face: "#cfc5ad", light: "#e8e0c8", dark: "#a89e86", grain: "soft" },
  jungle: { face: "#55603a", light: "#74804e", dark: "#3a4226", grain: "soft" },
  laterite: { face: "#7a4a36", light: "#9a6448", dark: "#56321f", grain: "rough" },
  sporerock: { face: "#6a5a72", light: "#8a7a92", dark: "#4a3d52", grain: "soft" },
  fungal: { face: "#8a6a80", light: "#a88a9e", dark: "#5e4658", grain: "glassy" },
  crystalrock: { face: "#7a7fa0", light: "#a3a8cc", dark: "#555a78", grain: "glassy" },
  slate: { face: "#454a5a", light: "#5c6274", dark: "#2e3240", grain: "rough" },
  // the sites' built walls (docs/sites.md): cut stone and steel hull
  masonry: { face: "#b0aa9c", light: "#cfc9ba", dark: "#8a857a", grain: "soft" },
  plating: { face: "#5a6672", light: "#7c8894", dark: "#3c454e", grain: "glassy" },
};

/** a rock family under the ink: the face burnt umber over the family's
 *  own hue, its light and dark a step further apart than the stock rock's.
 *  The hill's edges carry no band of their own — the carved bands the
 *  concepts drew along every rock/ground border are gone; what shades a
 *  hill now is the game's own darkness and its shadow */
const linocutWall = (s: WallStyle, ink = 0.45): WallStyle => {
  const face = mix(shd(s.face, 0.18), INK.umber, ink);
  return {
    ...s,
    face,
    light: mix(face, mix(lit(s.face, 0.2), INK.umberLit, 0.35), LINOCUT_SHADE.light),
    dark: shd(mix(face, INK.umberDeep, 0.4), LINOCUT_SHADE.dark),
  };
};
/** the built walls take a tenth of the ink, so cut stone and hull plate stand apart from every hill */
const BUILT_WALLS: readonly WallKind[] = ["masonry", "plating"];
export const WALL_STYLE: Readonly<Record<WallKind, WallStyle>> = LINOCUT_TERRAIN
  ? Object.fromEntries((Object.keys(STOCK_WALL_STYLE) as WallKind[]).map((k) => [k, linocutWall(STOCK_WALL_STYLE[k], BUILT_WALLS.includes(k) ? 0.1 : 0.45)])) as Record<WallKind, WallStyle>
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
 * cell, in a different place on each kind — and thins the picks that land
 * on it again (WATER_WAVE_KEEP in renderer.ts), so a lake ends up with a
 * crest on a ninth of its cells rather than a third.
 * ====================================================================== */
export type WaterKind = "shallowWater" | "deepWater" | "taintedWater" | "deepTaintedWater";
/** how many painted cells a water kind has, and which of them has the wave */
export const WATER_VARIANTS = 3;
/** which of a water group's painted cells carries the crest. The renderer
 *  thins these out further per cell — see WATER_WAVE_KEEP in renderer.ts */
export const WATER_WAVE_VARIANT = 1;
export function paintWater(kind: WaterKind, variant = WATER_WAVE_VARIANT): Uint8ClampedArray<ArrayBuffer> {
  const N = TILE_LOGICAL;
  const deep = kind === "deepWater" || kind === "deepTaintedWater";
  const tainted = kind === "taintedWater" || kind === "deepTaintedWater";
  const base = tainted ? (deep ? INK.taintedDeep : INK.taintedShallow) : deep ? INK.deep : INK.shallow;
  // the wave is the water a shade up, not a white line: at full strength
  // every one of them read as surf, and at a few shades they still stood
  // out against the swell
  const crest = mix(INK.crest, base, tainted ? 0.9 : 0.86);
  const rng = mulberry32(9000 + (deep ? 17 : 0) + (tainted ? 131 : 0));
  const grid = new Array<string>(N * N).fill(base);
  if (variant % WATER_VARIANTS === WATER_WAVE_VARIANT) {
    // one wave a tile: a 16px line six px deep somewhere in the middle
    // band, with a six-px block lifting off its trailing end — thicker
    // than the turrets' four, so it reads as a swell and not a scratch
    const x0 = 4 + Math.floor(rng() * 8), y = 8 + Math.floor(rng() * 12);
    for (let yy = y; yy < y + 6; yy++) for (let x = x0; x < x0 + 16; x++) grid[yy * N + x] = crest;
    for (let yy = y - 6; yy < y; yy++) for (let x = x0 + 10; x < x0 + 16; x++) grid[yy * N + x] = crest;
  }
  return toRgba(grid, N, TILE_PX);
}
/** the flat colour a water kind reads as at a pixel a cell (the minimap,
 *  the map cards): the painted tile's own base, or the stock file's mean */
export function waterTone(kind: WaterKind): string {
  const deep = kind === "deepWater" || kind === "deepTaintedWater";
  const tainted = kind === "taintedWater" || kind === "deepTaintedWater";
  if (LINOCUT_TERRAIN)
    return tainted ? (deep ? INK.taintedDeep : INK.taintedShallow) : deep ? INK.deep : INK.shallow;
  return tainted ? (deep ? "#44356b" : "#604b94") : deep ? "#2f4d7a" : "#4c6b9c";
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

/* ======================================================================
 * THE DECKING UNDER A MISSION MARK — the plated ground a Pylon stands on
 * (renderer.ts forEachMarkPadCell, atlas.ts UV_MARK_PAD).
 *
 * One plate a CELL, so a mark's pad reads as a laid floor rather than one
 * slab: the seam runs round every tile and the grid of it is the whole
 * texture. Lit from the top-right like the rock is, so a plate sits proud
 * of the ground instead of sunk into it.
 * ====================================================================== */
const PAD_STYLE = {
  base: "#4a4450",
  dark: "#2a2630",
  light: "#6f6879",
  bolt: "#8d8498",
} as const;

export function paintMarkPad(): Uint8ClampedArray<ArrayBuffer> {
  const N = TILE_LOGICAL;
  const grid = new Array<string>(N * N).fill(PAD_STYLE.base);
  const rect = (x0: number, y0: number, w: number, h: number, c: string): void => {
    for (let y = y0; y < y0 + h; y++)
      for (let x = x0; x < x0 + w; x++)
        if (x >= 0 && y >= 0 && x < N && y < N) grid[y * N + x] = c;
  };
  const M = MIN_MARK;
  // the seam: the lit pair on the top and right rims, the shaded pair on
  // the bottom and left, each the turrets' four px so the plates read
  rect(0, 0, N, M, PAD_STYLE.light);
  rect(N - M, 0, M, N, PAD_STYLE.light);
  rect(0, N - M, N, M, PAD_STYLE.dark);
  rect(0, 0, M, N, PAD_STYLE.dark);
  // ...and the two bolts holding it down, on the plate's own diagonal
  rect(M * 2, M * 2, M, M, PAD_STYLE.bolt);
  rect(N - M * 3, N - M * 3, M, M, PAD_STYLE.bolt);

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

export function markPadCanvas(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = c.height = TILE_PX;
  const g = c.getContext("2d");
  if (!g) throw new Error("2d context unavailable for the mark pad");
  g.putImageData(new ImageData(paintMarkPad(), TILE_PX, TILE_PX), 0, 0);
  return c;
}
