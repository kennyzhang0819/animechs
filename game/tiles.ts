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
  // NOTHING HERE IS ONE PIXEL WIDE. A hairline on a 16-pixel tile reads
  // as a scratch, and a ground full of scratches reads as worn rather
  // than drawn; Mindustry's marks are chunky for the same reason. Every
  // line below is two logical pixels thick — four in the tile, eight in
  // the atlas cell — which is what makes a crack a crack and a dash a
  // dash from a normal zoom
  const THICK = 2;
  /** a crack: a line two wide that walks 4-6 steps with one bend in it */
  const crack = (c: string): void => {
    const len = 4 + Math.floor(rng() * 3);
    let [x, y] = spot(len + 1, len + 1);
    const dx = rng() < 0.5 ? 1 : 0, dy = 1 - dx;
    const bend = 1 + Math.floor(rng() * (len - 2));
    // thickened across the direction of travel
    const stroke = (px: number, py: number): void => {
      for (let t = 0; t < THICK; t++) put(px + dy * t, py + dx * t, c);
    };
    for (let k = 0; k < len; k++) {
      stroke(x, y);
      if (k === bend) {
        // turn once, toward the side of the tile with more room
        x += dy * (x < N / 2 ? 1 : -1);
        y += dx * (y < N / 2 ? 1 : -1);
        stroke(x, y);
      }
      x += dx;
      y += dy;
    }
  };
  /** a ripple: a light dash, four or five wide, two high */
  const dash = (c: string): void => {
    const w = 4 + Math.floor(rng() * 2);
    const [x, y] = spot(w, THICK);
    for (let j = 0; j < THICK; j++) for (let i = 0; i < w; i++) put(x + i, y + j, c);
  };

  switch (st.mark) {
    case "patch":
      blob(st.light, 4 + Math.floor(rng() * 2), 3 + Math.floor(rng() * 2));
      if (rng() < 0.6) blob(st.dark, 3 + Math.floor(rng() * 2), 3);
      break;
    case "tuft": {
      blob(st.light, 4, 3 + Math.floor(rng() * 2));
      if (rng() < 0.5) blob(st.dark, 3, 4);
      // two blades side by side, each two wide, one taller than the other
      const [x, y] = spot(4, 4);
      for (let j = 1; j < 4; j++) for (let i = 0; i < 2; i++) put(x + i, y + j, st.dark);
      for (let j = 0; j < 4; j++) for (let i = 2; i < 4; i++) put(x + i, y + j, st.dark);
      break;
    }
    case "crack":
      crack(st.dark);
      blob(st.light, 4, 3);
      break;
    case "ripple":
      dash(st.light);
      if (rng() < 0.7) dash(st.light);
      if (rng() < 0.4) dash(st.dark);
      break;
    case "pebble": {
      blob(st.light, 4 + Math.floor(rng() * 2), 3);
      if (rng() < 0.5) blob(st.dark, 3, 3);
      // one stone: a dark lump with the light catching its top
      const [x, y] = spot(3, 4);
      for (let j = 2; j < 4; j++) for (let i = 0; i < 3; i++) put(x + i, y + j, st.dark);
      put(x, y + 1, st.light);
      put(x + 1, y + 1, st.light);
      break;
    }
    case "vein":
      crack(st.accent ?? st.light);
      if (kind === "magmarock") crack(st.accent ?? st.light);
      blob(st.dark, 4, 3);
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
 * shadowed along its bottom-right, with chunky notched corners, so an
 * outcrop is a stack of bricks. The rock here is a SURFACE instead: no
 * outline, no bevel, nothing at the cell's edge at all, so neighbouring
 * cells run together and an outcrop reads as one mass — the field's own
 * blurred shadow under the rock (WALL_SHADOW_A in the renderer, and the
 * same pass on the menu) is what lifts it off the floor. The detail is on
 * the face: angular light facets, each with a line of shade under its
 * lower edge, and diagonal crevices — the way a low-poly rock catches
 * light, and nothing like the floor's level cracks and ripples.
 *
 * A 2×2 cluster of rock takes ONE block twice the size (the field's
 * large-draw rule, UV_WALL_LARGE), with facets to match; `span` paints
 * that one.
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
  /** the rock's face */
  face: string;
  /** the facets that catch the light */
  light: string;
  /** the crevices, and the shade under a facet */
  dark: string;
  /**
   * the grain of the rock:
   * rough  — two facets and a crevice, the bare stones
   * soft   — one rounded facet and a short crevice, the earths and snow
   * glassy — one facet and two long thin crevices, ice and salt
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
  // a mark keeps one pixel off the rim, so nothing is cut at a seam and
  // the seam itself is always plain face
  const RIM = 1;
  const spot = (w: number, h: number): [number, number] => [
    RIM + Math.floor(rng() * Math.max(1, N - RIM * 2 - w)),
    RIM + Math.floor(rng() * Math.max(1, N - RIM * 2 - h)),
  ];
  /**
   * A FACET: a lit plate — a few rows of light, each row shifted a step
   * from the last so the plate leans, with the end rows a pixel shorter
   * and a line of shade along its lower edge. A plane the light lands on,
   * not a spot, and not a triangle: a right-angled patch at this size
   * reads as an arrowhead, and a field of arrowheads is a pattern
   */
  const facet = (size: number, rounded: boolean): void => {
    const w = size + 2, h = Math.max(3, Math.round(size * 0.7));
    const lean = rng() < 0.5 ? 1 : -1;
    const [x, y] = spot(w + h, h + 2);
    const x0 = lean > 0 ? x : x + h;
    for (let j = 0; j < h; j++) {
      const sx = x0 + lean * Math.floor(j / (rounded ? 2 : 1));
      const trim = j === 0 || j === h - 1 ? 1 : 0;
      for (let i = trim; i < w - trim; i++) put(sx + i, y + j, st.light);
    }
    // the shade under it, two deep, along the plate's lower edge
    const bx = x0 + lean * Math.floor((h - 1) / (rounded ? 2 : 1));
    for (let j = 0; j < 2; j++) for (let i = 1; i < w - 1; i++) put(bx + i, y + h + j, st.dark);
  };
  /** A CREVICE: a diagonal line two wide, stepping one across for one
   *  down, with a kink partway — the floor's cracks are level, so this is
   *  the one place a diagonal appears on the ground. Two wide for the
   *  same reason every floor mark is: a hairline is a scratch */
  const crevice = (len: number): void => {
    let [x, y] = spot(len + 2, len + 1);
    const sx = rng() < 0.5 ? 1 : -1;
    if (sx < 0) x += len + 1;
    const kink = 1 + Math.floor(rng() * Math.max(1, len - 2));
    const stroke = (px: number, py: number): void => {
      put(px, py, st.dark);
      put(px + 1, py, st.dark);
    };
    for (let k = 0; k < len; k++) {
      stroke(x, y);
      if (k === kink) {
        x += sx;
        stroke(x, y);
      }
      x += sx;
      y += 1;
    }
  };

  const reps = span * span;
  for (let r = 0; r < reps; r++) {
    switch (st.grain) {
      case "rough":
        facet(4 + Math.floor(rng() * 2) + span, false);
        facet(3 + Math.floor(rng() * 2), false);
        crevice(4 + Math.floor(rng() * 3));
        break;
      case "soft":
        facet(4 + Math.floor(rng() * 2) + span, true);
        if (rng() < 0.6) crevice(3 + Math.floor(rng() * 2));
        break;
      case "glassy":
        facet(3 + Math.floor(rng() * 2) + span, false);
        crevice(5 + Math.floor(rng() * 3));
        crevice(4 + Math.floor(rng() * 3));
        break;
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
