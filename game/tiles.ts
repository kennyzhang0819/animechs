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
   * the one kind of mark this ground wears — every one of them round:
   * soft    — one or two light blobs, a shade up from the ground
   * tussock — light blobs and one small dark clump
   * spotted — a light blob and a dark one
   * dune    — wide, low light ellipses, wind-blown
   * pebbled — a light blob and a shaded stone
   * ember   — glowing accent spots and a dark blob
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

export const FLOOR_STYLE: Readonly<Record<FloorKind, FloorStyle>> = {
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

/** a colour part way from `a` to `b` */
const mix = (a: string, b: string, t: number): string => {
  const [ar, ag, ab] = hex(a), [br, bg, bb] = hex(b);
  const ch = (x: number, y: number): string =>
    Math.round(x + (y - x) * t)
      .toString(16)
      .padStart(2, "0");
  return `#${ch(ar, br)}${ch(ag, bg)}${ch(ab, bb)}`;
};

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
  /** a blob: a rounded patch of one colour, a little wider than tall */
  const blob = (c: string, r: number, squash = 0.8): void => {
    const rx = r, ry = Math.max(1.5, r * squash);
    const cx = RIM + rx + rng() * (N - RIM * 2 - rx * 2);
    const cy = RIM + ry + rng() * (N - RIM * 2 - ry * 2);
    ellipse(cx, cy, rx, ry, (x, y) => put(x, y, c));
  };
  /** a stone: a dark lump with the light on its top */
  const stone = (r: number): void => {
    const rx = r, ry = r * 0.85;
    const cx = RIM + rx + rng() * (N - RIM * 2 - rx * 2);
    const cy = RIM + ry + rng() * (N - RIM * 2 - ry * 2);
    ellipse(cx, cy, rx, ry, (x, y, u, v) => put(x, y, v < -0.25 && Math.abs(u) < 0.75 ? st.light : st.dark));
  };

  switch (st.mark) {
    case "soft":
      blob(st.light, 3 + rng() * 1.5);
      if (rng() < 0.7) blob(st.light, 2.2 + rng());
      break;
    case "tussock":
      blob(st.light, 3 + rng() * 1.5);
      blob(st.light, 2 + rng());
      blob(st.dark, 1.6 + rng() * 0.6, 1);
      break;
    case "spotted":
      blob(st.light, 3 + rng() * 1.5);
      blob(st.dark, 2 + rng() * 0.8);
      break;
    case "dune":
      blob(st.light, 3.5 + rng() * 1.5, 0.4);
      blob(st.light, 3 + rng(), 0.4);
      if (rng() < 0.5) blob(st.dark, 2.5 + rng(), 0.4);
      break;
    case "pebbled":
      blob(st.light, 3 + rng() * 1.5);
      stone(1.8 + rng() * 0.5);
      break;
    case "ember":
      blob(st.dark, 3 + rng() * 1.5);
      blob(st.accent ?? st.light, 1.6 + rng() * 0.6);
      if (kind === "magmarock") blob(st.accent ?? st.light, 1.4 + rng() * 0.6);
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
 * The lesson from Mindustry's walls is not the bevel, it is the SHADING:
 * three flat tones in a few big smooth regions. Each tile is one boulder
 * — a rounded shape filling most of the cell, in the mid tone — lit from
 * a corner: the boulder's cap on the lit side is the light tone, its
 * underside on the far side the dark tone, and the sliver of tile beyond
 * the boulder's outline is light on the lit side and dark on the other,
 * so the cell's edges meet the next cell's as the joins between stones.
 * Nothing else. No lumps, no highlights, no marks on the face: the tones
 * are regions, not lighting on detail, which is what keeps a top-down
 * map flat. Light comes from the top-left here, where Mindustry lights
 * from the top-right, and the boulders are rounder than its chipped
 * ones.
 *
 * A 2×2 cluster of rock takes ONE boulder twice the size (the field's
 * large-draw rule, UV_WALL_LARGE), which is what makes an outcrop read
 * as a few big stones with small ones at its edges; `span` paints it.
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
  /** the boulder's mid tone */
  face: string;
  /** its lit cap, and its shaded underside */
  light: string;
  dark: string;
  /**
   * the grain of the rock — how far the light reaches round the stone:
   * rough  — a narrow cap and a deep underside, the bare rocks
   * soft   — a wide cap and a shallow underside, the earths and snow
   * glassy — a wide cap and a deep underside, ice and salt
   */
  grain: "rough" | "soft" | "glassy";
}

export const WALL_STYLE: Readonly<Record<WallKind, WallStyle>> = {
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
  // the light: from the top-left. `cap` is how big the lit crescent is
  // and `shade` how deep the shadowed one, as fractions of the stone
  const LX = -0.55, LY = -0.83;
  const [cap, shade] =
    st.grain === "rough" ? [0.5, 0.82] : st.grain === "soft" ? [0.62, 0.9] : [0.6, 0.8];
  // the boulder: one round stone nearly the size of the cell, pushed a
  // little toward the light so the shadow wedge beyond it in the far
  // corner is the bigger one, its outline swelling and dipping a little
  // round the circumference so no two tiles hold the same stone
  const R = N / 2 - 0.4;
  const cx = N / 2 + LX * N * 0.06 + (rng() - 0.5) * N * 0.06;
  const cy = N / 2 + LY * N * 0.06 + (rng() - 0.5) * N * 0.06;
  const a2 = rng() * Math.PI * 2, a3 = rng() * Math.PI * 2;
  const k2 = 0.06 + rng() * 0.05, k3 = 0.03 + rng() * 0.04;
  const radiusAt = (th: number): number => R * (1 + k2 * Math.sin(2 * th + a2) + k3 * Math.sin(3 * th + a3));
  const inside = (x: number, y: number): boolean => {
    const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
    return Math.hypot(dx, dy) <= radiusAt(Math.atan2(dy, dx));
  };
  // THE CRESCENTS. The lit cap is a smaller disc pushed toward the light;
  // the underside is what lies outside a larger disc pushed the same way.
  // Both boundaries curve with the stone, which is the difference between
  // a ball and a chamfered block
  const capX = cx + LX * R * 0.42, capY = cy + LY * R * 0.42, capR = R * cap;
  const shX = cx + LX * R * 0.22, shY = cy + LY * R * 0.22, shR = R * shade;
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const px = x + 0.5, py = y + 0.5;
      if (inside(x, y)) {
        const inCap = Math.hypot(px - capX, py - capY) <= capR;
        const inBody = Math.hypot(px - shX, py - shY) <= shR;
        put(x, y, inCap ? st.light : inBody ? st.face : st.dark);
      } else {
        // off the stone: the ground between boulders, lit or in shadow
        const t = -((px - N / 2) * LX + (py - N / 2) * LY);
        put(x, y, t > 0 ? st.light : st.dark);
      }
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
