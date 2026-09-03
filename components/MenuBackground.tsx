"use client";

import { useEffect, useRef } from "react";
import {
  buildAtlas,
  FLOOR_BASALT,
  FLOOR_ICE,
  FLOOR_MOSS,
  FLOOR_MUD,
  FLOOR_SALT,
  FLOOR_SHALE,
  FLOOR_SNOW,
  FLOOR_SPORE_MOSS,
  WALL_DACITE,
  WALL_DUNE,
  WALL_ICE,
  WALL_SHALE,
  WALL_SNOW,
  WALL_SPORE,
} from "@/game/atlas";
import { CELL, COLS, NCELLS } from "@/game/constants";
import { dressGrid, type DressStyle } from "@/game/dress";
import { Renderer, WALL_SHADOW_A } from "@/game/renderer";
import type { Terrain } from "@/game/terrain";

/**
 * THE MENU'S GROUND — the game, seen from above, before anyone has built
 * anything on it.
 *
 * MechSwarm is a horde walking a valley toward a base, steered by a flow
 * field around whatever is in the way. So the title screen is that: a
 * lane carved through rock, rolled fresh every launch the way the game's
 * own worldgen carves one (terrain.ts), and a swarm of the game's own
 * mechs marching down it — daggers and crawlers in the crowd, maces and
 * the odd fortress lumbering among them — each one turning with the
 * lane's bends and walking on the same leg cycle the field draws
 * (Renderer.pushMech). A few flares fly escort over the column.
 *
 * HOW IT IS BUILT. The ground is generated once and rasterized once into
 * an offscreen canvas — floors, a blurred shadow under the rock, the
 * rock (2×2 clusters take the large wall sprite, as the field does), then
 * the props. Every frame after that is one drawImage of that canvas at a
 * slowly drifting offset, the swarm on top, and a black wash. The field
 * is a texture; the only geometry per frame is a few dozen mechs.
 *
 * THE SCENES CYCLE (SCENE_HOLD / SCENE_FADE): every biome the game has
 * gets its turn, each dissolving into the next, with the next one rolled
 * in the background while the current one is on screen.
 *
 * WHAT IT MUST NEVER DO is compete with the menu on top of it. The wash
 * (`dim`) is the contract: the title card sits under a light one, and the
 * deeper menus, which are lists of cards to read, pull it darker. It also
 * holds still under prefers-reduced-motion (one frame, one scene) and
 * stops when the tab is hidden.
 */

const UNITS = "/mindustry/sprites/units/";
/** the raw sprites are 4× — one 8-unit tile is a 32px image */
const SPRITE_TILE = 32;
/** the ground cells drawn around the viewport so the camera can drift */
const MARGIN_TILES = 3;
/**
 * THE SCENES CYCLE. One world is a picture; the whole environment set is
 * the game. Each scene holds for SCENE_HOLD seconds and then dissolves
 * into the next biome over SCENE_FADE, in a shuffled order that shows
 * every environment before repeating one. The next world is rolled and
 * rasterized in the background while the current one is on screen, so a
 * switch never stalls a frame.
 */
const SCENE_HOLD = 3;
const SCENE_FADE = 1;
/** Pal.engine, the glow a flyer trails */
const ENGINE = "#ffbb64";
/** the swarm's own red, painted onto every mech's cell */
const CELL_TINT = "#e55454";

// the first band's floors and walls, by the atlas's own numbering (the
// second band's are exported from game/atlas.ts by name)
const FLOOR_GRASS = 0, FLOOR_STONE = 3, FLOOR_DIRT = 6, FLOOR_SAND = 9, FLOOR_DARKSAND = 12;
const WALL_STONE = 0, WALL_DIRT = 2, WALL_DARK = 5;
// decor kinds (UV_DECOR): boulders, spore clusters, shale, snow and sand boulders
const BOULDERS = [0, 1], SPORES = [3, 4, 5], SHALE_BOULDERS = [7, 8], SNOW_BOULDERS = [9, 10], SAND_BOULDERS = [12, 13];

/**
 * THE BIOMES, each a dressing (game/dress.ts) — the same rules the
 * campaign maps are painted with, in the field's own indices: one rock
 * with a core of a second where it is thick, a base floor with a few
 * large patches of a second, and boulders along the road's edges. The
 * numbers are the campaign's scaled to a title screen sixty cells across.
 */
const biome = (
  road: DressStyle["road"],
  rock: DressStyle["rock"],
  kinds: readonly number[],
): DressStyle => ({ road, rock, props: { kinds, per: 30 } });
const PATCH = { count: 4, r: [10, 18] as const, squash: 0.55 };
const BIOMES: readonly DressStyle[] = [
  biome(
    { base: FLOOR_SAND, patches: { floor: FLOOR_DIRT, ...PATCH }, flat: { floor: FLOOR_SALT, clear: 5.5, grow: 2 } },
    { base: WALL_DUNE, core: { wall: WALL_DIRT, depth: 8 } },
    SAND_BOULDERS,
  ),
  biome(
    { base: FLOOR_SHALE, patches: { floor: FLOOR_STONE, ...PATCH } },
    { base: WALL_SHALE, core: { wall: WALL_DARK, depth: 8 } },
    SHALE_BOULDERS,
  ),
  biome(
    { base: FLOOR_ICE, patches: { floor: FLOOR_SNOW, ...PATCH } },
    { base: WALL_ICE, core: { wall: WALL_SNOW, depth: 8 } },
    SNOW_BOULDERS,
  ),
  biome(
    { base: FLOOR_MOSS, patches: { floor: FLOOR_SPORE_MOSS, ...PATCH }, flat: { floor: FLOOR_MUD, clear: 5.5, grow: 2 } },
    { base: WALL_DACITE, core: { wall: WALL_SPORE, depth: 8 } },
    SPORES,
  ),
  biome(
    { base: FLOOR_DIRT, patches: { floor: FLOOR_STONE, ...PATCH } },
    { base: WALL_DIRT, core: { wall: WALL_STONE, depth: 8 } },
    BOULDERS,
  ),
  biome(
    { base: FLOOR_DARKSAND, patches: { floor: FLOOR_BASALT, ...PATCH } },
    { base: WALL_DUNE, core: { wall: WALL_DARK, depth: 8 } },
    BOULDERS,
  ),
  biome(
    { base: FLOOR_SNOW, patches: { floor: FLOOR_ICE, ...PATCH } },
    { base: WALL_SNOW, core: { wall: WALL_ICE, depth: 8 } },
    SNOW_BOULDERS,
  ),
  biome(
    { base: FLOOR_GRASS, patches: { floor: FLOOR_DIRT, ...PATCH } },
    { base: WALL_DIRT, core: { wall: WALL_STONE, depth: 8 } },
    BOULDERS,
  ),
];

/**
 * A mech kind, with the numbers the field draws it by: gun mount offsets
 * in Mindustry world units (lateral, forward), the stride in world units,
 * and how fast it walks in tiles a second. Sizes come from the sprites.
 */
interface MechKind {
  name: string;
  gun?: { name: string; x: number; y: number };
  stride: number;
  speed: number;
  /** has a `-cell` sprite to paint in the swarm's colour */
  cell: boolean;
  /** the crowd share: how many of this kind walk the lane */
  count: readonly [number, number];
}

const MECHS: readonly MechKind[] = [
  { name: "dagger", gun: { name: "large-weapon", x: 4, y: 2 }, stride: 4, speed: 0.95, cell: false, count: [14, 24] },
  { name: "crawler", stride: 4, speed: 1.35, cell: true, count: [8, 16] },
  { name: "mace", gun: { name: "flamethrower", x: 5, y: 0 }, stride: 4 + (10 - 8) / 2.1, speed: 0.7, cell: true, count: [3, 6] },
  { name: "fortress", gun: { name: "artillery", x: 9, y: 1 }, stride: 4 + (13 - 8) / 2.1, speed: 0.5, cell: true, count: [0, 2] },
];

const mulberry32 = (seed: number) => (): number => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/** 3-octave value noise in [0,1], a fresh lattice per call */
function makeNoise(rng: () => number): (x: number, y: number) => number {
  const seed = (rng() * 0x7fffffff) | 0;
  const ox = rng() * 512, oy = rng() * 512;
  const lattice = (ix: number, iy: number): number => {
    let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + seed) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
  const val = (x: number, y: number): number => {
    const ix = Math.floor(x), iy = Math.floor(y);
    const fx = x - ix, fy = y - iy;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = lattice(ix, iy), b = lattice(ix + 1, iy);
    const c = lattice(ix, iy + 1), d = lattice(ix + 1, iy + 1);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
  return (x, y) =>
    val(x + ox, y + oy) * 0.55 +
    val((x + ox) * 2.17, (y + oy) * 2.17) * 0.28 +
    val((x + ox) * 4.31, (y + oy) * 4.31) * 0.17;
}


/** an image, or null if it is missing — a missing tile is a gap, never a crash */
const loadImage = (src: string): Promise<HTMLImageElement | null> =>
  new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });

/** a sprite with its cell painted in the swarm's colour */
function tintCell(base: HTMLImageElement, cell: HTMLImageElement | null): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = base.width;
  c.height = base.height;
  const g = c.getContext("2d")!;
  g.drawImage(base, 0, 0);
  if (cell) {
    const t = document.createElement("canvas");
    t.width = cell.width;
    t.height = cell.height;
    const tg = t.getContext("2d")!;
    tg.drawImage(cell, 0, 0);
    tg.globalCompositeOperation = "source-in";
    tg.fillStyle = CELL_TINT;
    tg.fillRect(0, 0, t.width, t.height);
    g.drawImage(t, 0, 0);
  }
  return c;
}

/** a black silhouette of a sprite, for its shadow */
function silhouette(src: CanvasImageSource, w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  g.drawImage(src, 0, 0);
  g.globalCompositeOperation = "source-in";
  g.fillStyle = "#000";
  g.fillRect(0, 0, w, h);
  return c;
}

/** one sprite and its shadow, both at the raw sprite's size */
interface Part {
  art: CanvasImageSource;
  sil: CanvasImageSource;
  w: number;
  h: number;
}

const partOf = (art: CanvasImageSource, w: number, h: number): Part => ({
  art,
  sil: silhouette(art, w, h),
  w,
  h,
});

/** a mech's assembly: what the field layers, from the ground up */
interface MechArt {
  kind: MechKind;
  leg: Part;
  base: Part;
  body: Part;
  gun: Part | null;
}

interface Mech {
  art: MechArt;
  /** distance along the lane, in px */
  s: number;
  /** how far off the lane's centre this one walks, -1..1 */
  lane: number;
  /** where in the leg cycle this one started, in px — the cycle itself is
   *  this plus the distance walked since, never accumulated frame to frame */
  walk: number;
  /** a phase for the little swing every walker adds to its line */
  phase: number;
}

interface Flyer {
  s: number;
  lane: number;
  phase: number;
  speed: number;
}

/** the field's renderer on a canvas of its own, shared by every scene */
interface Gpu {
  renderer: Renderer;
  canvas: HTMLCanvasElement;
}

interface World {
  /** the rasterized ground, in device px */
  ground: HTMLCanvasElement;
  /** tile size in css px, and the ground's size in css px */
  tile: number;
  w: number;
  h: number;
  /** the lane's centreline (css px) and half-width (tiles) at any x */
  laneY: (x: number) => number;
  laneHalf: (x: number) => number;
  /** how lit the ground is at a point (css px), 0..1 — the hill's shadow */
  litAt: (x: number, y: number) => number;
  /** +1 walks left to right, -1 the other way */
  dir: 1 | -1;
  mechs: Mech[];
  flare: Part | null;
  flyers: Flyer[];
}

/**
 * Roll and rasterize one world for a viewport of `vw`×`vh` css px.
 * Everything random is drawn from one seeded generator so a world is
 * reproducible from its seed, which is only useful for debugging and
 * costs nothing.
 */
async function buildWorld(
  vw: number,
  vh: number,
  dpr: number,
  seed: number,
  biomeIndex: number,
  gpu: Gpu,
): Promise<World> {
  const rng = mulberry32(seed);
  // the tile in css px: about sixty across a desktop, held to a whole
  // multiple of the sprite's own pixels so the ground stays crisp
  const tile = 8 * Math.max(2, Math.min(4, Math.round(vw / 60 / 8)));
  const cols = Math.ceil(vw / tile) + MARGIN_TILES * 2;
  const rows = Math.ceil(vh / tile) + MARGIN_TILES * 2;

  const style = BIOMES[((biomeIndex % BIOMES.length) + BIOMES.length) % BIOMES.length];
  const dir: 1 | -1 = rng() < 0.5 ? 1 : -1;

  const rockNoise = makeNoise(rng);
  const pocketNoise = makeNoise(rng);

  /**
   * THE LANE: a meander through the rock, two sine waves deep so it never
   * repeats on screen, its width breathing along its length. It sits in
   * the middle of the screen, where the column walks behind the buttons
   * rather than under the name.
   */
  const a1 = rows * (0.08 + rng() * 0.08), l1 = cols * (0.35 + rng() * 0.25), p1 = rng() * 7;
  const a2 = rows * (0.03 + rng() * 0.04), l2 = cols * (0.12 + rng() * 0.1), p2 = rng() * 7;
  const wBase = 4.5 + rng() * 1.5, wSwing = 1.5 + rng(), l3 = cols * (0.2 + rng() * 0.2), p3 = rng() * 7;
  const centreRow = rows * (0.42 + rng() * 0.16);
  const laneRow = (cx: number): number =>
    centreRow + a1 * Math.sin((cx / l1) * Math.PI * 2 + p1) + a2 * Math.sin((cx / l2) * Math.PI * 2 + p2);
  const laneHalfTiles = (cx: number): number => wBase + wSwing * Math.sin((cx / l3) * Math.PI * 2 + p3);

  // the units are sprites, fetched once and together
  const unitNames = MECHS.flatMap((m) => [
    m.name,
    `${m.name}-base`,
    `${m.name}-leg`,
    ...(m.cell ? [`${m.name}-cell`] : []),
    ...(m.gun ? [`weapons/${m.gun.name}`] : []),
  ]);
  const [unitImgs, flareImg] = await Promise.all([
    Promise.all(unitNames.map((n) => loadImage(`${UNITS}${n}.png`))),
    loadImage(`${UNITS}flare.png`),
  ]);
  const units = new Map<string, HTMLImageElement>();
  unitNames.forEach((n, i) => {
    const img = unitImgs[i];
    if (img) units.set(n, img);
  });

  // ---- the ground: a terrain, dressed and drawn by the field's renderer ----
  // The lane is open; the rest is rock with pockets of floor in it — the
  // branch lanes and dead ends the flow field would route around. The
  // lane's edge is roughened by noise so it is a valley and not a stripe
  const blocked = new Uint8Array(cols * rows);
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++) {
      const off = Math.abs(y + 0.5 - laneRow(x + 0.5));
      const half = laneHalfTiles(x + 0.5) + (rockNoise(x / 6, y / 6) - 0.5) * 3;
      const inLane = off < half;
      const pocket = pocketNoise(x / 11, y / 11) > 0.6;
      blocked[y * cols + x] = inLane || pocket ? 0 : 1;
    }
  // dressed by the campaign's rules (game/dress.ts), then lifted onto the
  // field's grid: the scene sits in its top-left corner, and the renderer
  // draws a map at its own size (Terrain.rows/cols), not the grid's
  const grid = { w: cols, h: rows, blocked, floor: new Uint8Array(cols * rows), wall: new Uint8Array(cols * rows) };
  const decor = dressGrid(grid, style, rng);
  const lift = (src: Uint8Array, pad: number): Uint8Array => {
    const out = new Uint8Array(NCELLS).fill(pad);
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) out[y * COLS + x] = src[y * cols + x];
    return out;
  };
  const terrain: Terrain = {
    blocked: lift(blocked, 1),
    floor: lift(grid.floor, 0),
    wall: lift(grid.wall, 0),
    spawns: [],
    spawn: new Uint8Array(NCELLS),
    goal: new Uint8Array(NCELLS),
    pines: [],
    decor,
    valleyY: new Float32Array(COLS),
    base: { x: 0, y: 0, size: 5 },
    rows,
    cols,
  };
  // THE FIELD'S OWN RENDERER draws it — floors with their edge fades, the
  // hill shadow with its reach, the rock in its 2x2 blocks, the boulders —
  // once, into the GL canvas, and the frame is copied out into the ground
  // image the scene scrolls. No drop zones, no exits, no base: it is a
  // place, not a level
  const gw = Math.round(cols * tile * dpr), gh = Math.round(rows * tile * dpr);
  gpu.canvas.width = gw;
  gpu.canvas.height = gh;
  gpu.renderer.rebuildTerrain({ terrain }, { wall: true, props: true, spawn: false, goal: false, base: false });
  gpu.renderer.renderTerrain(1, 0, 0, gw / (cols * CELL));
  const ground = document.createElement("canvas");
  ground.width = gw;
  ground.height = gh;
  ground.getContext("2d")!.drawImage(gpu.canvas, 0, 0);

  // ---- the swarm ----
  const w = cols * tile, h = rows * tile;
  const arts: MechArt[] = [];
  for (const kind of MECHS) {
    const body = units.get(kind.name), base = units.get(`${kind.name}-base`), leg = units.get(`${kind.name}-leg`);
    if (!body || !base || !leg) continue;
    const gunImg = kind.gun ? units.get(`weapons/${kind.gun.name}`) : null;
    const tinted = tintCell(body, kind.cell ? (units.get(`${kind.name}-cell`) ?? null) : null);
    arts.push({
      kind,
      leg: partOf(leg, leg.width, leg.height),
      base: partOf(base, base.width, base.height),
      body: partOf(tinted, body.width, body.height),
      gun: gunImg ? partOf(gunImg, gunImg.width, gunImg.height) : null,
    });
  }
  const mechs: Mech[] = [];
  for (const art of arts) {
    const [lo, hi] = art.kind.count;
    const n = lo + Math.floor(rng() * (hi - lo + 1));
    for (let i = 0; i < n; i++)
      mechs.push({
        art,
        s: rng() * (w + tile * 8),
        // the heavies keep to the middle of the lane, the small ones spill
        // to its edges — the sort a crowd falls into on its own
        lane: (rng() * 2 - 1) * (art.kind.name === "fortress" ? 0.4 : 0.85),
        walk: rng() * 1000,
        phase: rng() * Math.PI * 2,
      });
  }
  const flyers: Flyer[] = [];
  const nf = 3 + Math.floor(rng() * 4);
  for (let i = 0; i < nf; i++)
    flyers.push({
      s: rng() * (w + tile * 8),
      lane: rng() * 2 - 1,
      phase: rng() * Math.PI * 2,
      speed: (1.6 + rng() * 0.5) * tile,
    });

  return {
    ground,
    tile,
    w,
    h,
    laneY: (x) => laneRow(x / tile) * tile,
    laneHalf: (x) => laneHalfTiles(x / tile),
    // the renderer keeps the shade of the terrain it last built, and this
    // scene's is the one it last built until the next scene is rolled —
    // so read it now, into the scene, rather than through the renderer
    litAt: ((shade: Float32Array) => (x: number, y: number): number => {
      const fx = x / tile - 0.5, fy = y / tile - 0.5;
      const x0 = Math.max(0, Math.min(cols - 2, Math.floor(fx)));
      const y0 = Math.max(0, Math.min(rows - 2, Math.floor(fy)));
      const tx = Math.max(0, Math.min(1, fx - x0)), ty = Math.max(0, Math.min(1, fy - y0));
      const a = shade[y0 * COLS + x0], b = shade[y0 * COLS + x0 + 1];
      const c = shade[(y0 + 1) * COLS + x0], d = shade[(y0 + 1) * COLS + x0 + 1];
      return 1 - WALL_SHADOW_A * (a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty);
    })(gpu.renderer.shadeCopy()),
    dir,
    mechs,
    flare: flareImg ? partOf(flareImg, flareImg.width, flareImg.height) : null,
    flyers,
  };
}

export default function MenuBackground({
  /** the black wash over the field, 0–1 */
  dim = 0.3,
}: {
  dim?: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  // read by the draw loop every frame: changing the wash never rebuilds
  // the world, it only repaints the next frame
  const dimRef = useRef(dim);
  dimRef.current = dim;
  const redraw = useRef<(() => void) | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let alive = true;
    /** the scene on screen, and when it arrived (ms) */
    let world: World | null = null;
    let shownAt = 0;
    /** the scene after it, rolled ahead of time; null while it is building */
    let next: World | null = null;
    let building = false;
    /** when the dissolve into `next` began, or 0 while holding */
    let fadeAt = 0;
    let raf = 0;
    let resizeTimer: ReturnType<typeof setTimeout> | null = null;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)");
    // the biomes in a fresh order every launch, walked in turn
    const order = BIOMES.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    let cursor = 0;
    const seedOf = (): number => (Math.random() * 0x7fffffff) | 0;

    /** roll the scene after the current one, off the frame loop */
    /** the renderer, made once the atlas is up; null where WebGL2 is not */
    let gpu: Gpu | null = null;
    let gpuFailed = false;
    const getGpu = async (): Promise<Gpu | null> => {
      if (gpu || gpuFailed) return gpu;
      try {
        const atlas = await buildAtlas();
        const c = document.createElement("canvas");
        gpu = { renderer: new Renderer(c, atlas), canvas: c };
      } catch {
        // no WebGL2: the menu keeps its plain ground, as the game would
        // refuse to start anyway
        gpuFailed = true;
      }
      return gpu;
    };
    const buildNext = async (): Promise<void> => {
      if (building) return;
      building = true;
      const vw = canvas.clientWidth, vh = canvas.clientHeight;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const g = await getGpu();
      if (!g) {
        building = false;
        return;
      }
      const built = await buildWorld(vw, vh, dpr, seedOf(), order[cursor % order.length], g);
      cursor++;
      building = false;
      if (alive) next = built;
    };

    /** draw one part of a mech: centred on (x, y), facing `rot`, at the
     *  sprite's own size times the world's scale, optionally mirrored
     *  across its facing and shortened along it */
    const drawPart = (
      p: Part,
      shadow: boolean,
      x: number,
      y: number,
      rot: number,
      k: number,
      mirror = false,
      along = 1,
    ): void => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot + Math.PI / 2); // the art faces up; rot 0 is +x
      if (mirror) ctx.scale(-1, 1);
      const pw = p.w * k, ph = p.h * k * along;
      ctx.drawImage(shadow ? p.sil : p.art, -pw / 2, -ph / 2, pw, ph);
      ctx.restore();
    };

    /**
     * A walking mech, layered the way the field layers one (pushMech):
     * legs stride along the facing on a four-stride cycle — the swinging
     * leg lifts and shortens by half — then the chassis, the gun pair
     * slung under it, and the body riding a little sway. `walk` is the
     * distance walked, in px, and the whole cycle is a function of it.
     */
    const drawMech = (
      m: Mech,
      walk: number,
      x: number,
      y: number,
      rot: number,
      k: number,
      mu: number,
      shadow: boolean,
    ): void => {
      const a = m.art, kind = a.kind;
      const stride = kind.stride * mu;
      const raw = walk % (stride * 4);
      const ext = raw > stride * 3 ? raw - stride * 4 : raw > stride ? stride * 2 - raw : raw;
      const lift = Math.sin(((raw / stride) * Math.PI) / 2);
      const cr = Math.cos(rot), sr = Math.sin(rot);
      const sway = lift * 0.54 * mu, fsway = Math.sin((raw / stride) * Math.PI) * 0.1 * mu;
      const ox = -sr * sway + cr * fsway, oy = cr * sway + sr * fsway;
      for (let side = -1; side <= 1; side += 2) {
        const shorten = 1 - Math.max(-lift * side, 0) * 0.5;
        drawPart(a.leg, shadow, x + cr * ext * side, y + sr * ext * side, rot, k, side < 0, shorten);
      }
      drawPart(a.base, shadow, x, y, rot, k);
      if (a.gun && kind.gun) {
        const gx = kind.gun.x * mu, gy = kind.gun.y * mu;
        for (let side = -1; side <= 1; side += 2)
          drawPart(a.gun, shadow, x + ox + cr * gy - sr * gx * side, y + oy + sr * gy + cr * gx * side, rot, k, side < 0);
      }
      drawPart(a.body, shadow, x + ox, y + oy, rot, k);
    };

    /**
     * One scene at one moment: the ground, the column, the escort. `t` is
     * seconds since the scene arrived, and EVERYTHING is a function of it —
     * where a mech stands, where its legs are, where the camera has
     * wandered — so nothing accumulates frame to frame and a dropped frame
     * costs nothing but the frame.
     */
    const drawScene = (wd: World, t: number): void => {
      const k = wd.tile / SPRITE_TILE; // css px per raw sprite px
      const mu = wd.tile / 8; // css px per Mindustry world unit
      ctx.imageSmoothingEnabled = false;
      // the camera: a slow wander inside the margin, so the field is never
      // still and never shows its edge
      const m = MARGIN_TILES * wd.tile;
      const ox = -m + Math.sin(t * 0.07) * m * 0.8;
      const oy = -m + Math.sin(t * 0.05 + 1.3) * m * 0.8;
      ctx.drawImage(wd.ground, ox, oy, wd.w, wd.h);
      ctx.imageSmoothingEnabled = true;

      // where a walker is: `s` along the lane, wrapped so the column never
      // ends, its own place across the lane, and a little swing of its own
      // so a crowd does not march in lockstep. It faces the way the lane
      // bends where it stands — the flow field's answer, read off the
      // centreline's slope one step ahead
      const span = wd.w + wd.tile * 8, pad = wd.tile * 4;
      const place = (
        s: number,
        lane: number,
        swing: number,
      ): { x: number; y: number; rot: number } => {
        const along = ((s % span) + span) % span - pad;
        const gx = wd.dir > 0 ? along : wd.w - along;
        const half = (wd.laneHalf(gx) - 1.2) * wd.tile;
        const gy = wd.laneY(gx) + lane * half + swing;
        const step = wd.tile * 2 * wd.dir;
        const y2 = wd.laneY(gx + step) + lane * (wd.laneHalf(gx + step) - 1.2) * wd.tile;
        return { x: gx + ox, y: gy + oy, rot: Math.atan2(y2 - gy, step) };
      };

      // the column: shadows first so no mech's shadow lands on another's
      // hull, then the mechs, back of the lane first
      const walkers = wd.mechs.map((mc) => {
        const walked = mc.art.kind.speed * wd.tile * t;
        const swing = Math.sin(t * 0.9 + mc.phase) * wd.tile * 0.25;
        return { mc, p: place(mc.s + walked, mc.lane, swing), walk: mc.walk + walked };
      });
      walkers.sort((a, b) => a.p.y - b.p.y);
      const alpha = ctx.globalAlpha;
      ctx.globalAlpha = alpha * 0.5;
      for (const wk of walkers)
        drawMech(wk.mc, wk.walk, wk.p.x + wd.tile * 0.15, wk.p.y + wd.tile * 0.2, wk.p.rot, k, mu, true);
      ctx.globalAlpha = alpha;
      for (const wk of walkers) drawMech(wk.mc, wk.walk, wk.p.x, wk.p.y, wk.p.rot, k, mu, false);
      // THE HILL'S SHADOW FALLS ON THE COLUMN as it does on the field: a
      // mech at a cliff foot is darkened by the shade at its feet — its
      // own black silhouette laid over it at one minus how lit the ground
      // is there, which is the multiply the field's tint does
      for (const wk of walkers) {
        const lit = wd.litAt(wk.p.x - ox, wk.p.y - oy);
        if (lit > 0.995) continue;
        ctx.globalAlpha = alpha * (1 - lit);
        drawMech(wk.mc, wk.walk, wk.p.x, wk.p.y, wk.p.rot, k, mu, true);
      }
      ctx.globalAlpha = alpha;

      // the escort: flares over the column, higher and faster, weaving
      // across the lane rather than holding a line
      if (wd.flare) {
        const lift = wd.tile * 0.7;
        const fl = wd.flare;
        for (const f of wd.flyers) {
          const weave = Math.sin(t * 0.5 + f.phase) * wd.tile * 1.5;
          const p = place(f.s + f.speed * t, f.lane * 0.6, weave);
          const bank = Math.cos(t * 0.5 + f.phase) * 0.35 * wd.dir;
          ctx.globalAlpha = alpha * 0.4;
          drawPart(fl, true, p.x + lift * 0.5, p.y + lift, p.rot + bank, k);
          ctx.globalAlpha = alpha;
          // the engine: a glow behind the body, breathing with the frame
          const flick = 0.75 + 0.25 * Math.sin(t * 17 + f.phase * 7);
          const r = fl.w * k * 0.11 * flick;
          const back = fl.h * k * 0.32;
          const ex = p.x - Math.cos(p.rot + bank) * back, ey = p.y - Math.sin(p.rot + bank) * back;
          ctx.save();
          ctx.globalCompositeOperation = "lighter";
          ctx.fillStyle = ENGINE;
          ctx.globalAlpha = alpha * 0.85;
          ctx.beginPath();
          ctx.arc(ex, ey, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "#ffffff";
          ctx.beginPath();
          ctx.arc(ex, ey, r * 0.45, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
          ctx.globalAlpha = alpha;
          drawPart(fl, false, p.x, p.y, p.rot + bank, k);
        }
      }
    };

    const frame = (now: number): void => {
      const wd = world;
      if (!wd) return;
      const vw = canvas.clientWidth, vh = canvas.clientHeight;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      if (canvas.width !== Math.round(vw * dpr) || canvas.height !== Math.round(vh * dpr)) {
        canvas.width = Math.round(vw * dpr);
        canvas.height = Math.round(vh * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.globalAlpha = 1;
      drawScene(wd, (now - shownAt) / 1000);

      // THE DISSOLVE: once the hold is up and the next scene is rolled, it
      // is drawn over this one at a rising alpha — ground, column and all,
      // so the whole picture crosses at once — and takes over at the end
      if (!still.matches) {
        if (fadeAt === 0 && next && now - shownAt >= SCENE_HOLD * 1000) fadeAt = now;
        if (fadeAt !== 0 && next) {
          const f = Math.min(1, (now - fadeAt) / (SCENE_FADE * 1000));
          ctx.globalAlpha = f * f * (3 - 2 * f);
          drawScene(next, (now - fadeAt) / 1000);
          ctx.globalAlpha = 1;
          if (f >= 1) {
            world = next;
            shownAt = fadeAt;
            next = null;
            fadeAt = 0;
            void buildNext();
          }
        }
      }

      // the wash
      ctx.fillStyle = `rgba(0,0,0,${Math.max(0, Math.min(1, dimRef.current))})`;
      ctx.fillRect(0, 0, vw, vh);
    };

    // every frame the display offers: a walking mech read at a throttled
    // 30 as a stutter, because the throttle landed on alternate 33ms and
    // 50ms gaps, and the draw is cheap enough that there is nothing to save
    const loop = (now: number): void => {
      if (!alive) return;
      raf = requestAnimationFrame(loop);
      frame(now);
    };

    const start = async (): Promise<void> => {
      const vw = canvas.clientWidth, vh = canvas.clientHeight;
      if (vw === 0 || vh === 0) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const g = await getGpu();
      if (!g) return;
      const built = await buildWorld(vw, vh, dpr, seedOf(), order[cursor % order.length], g);
      cursor++;
      if (!alive) return;
      world = built;
      next = null;
      fadeAt = 0;
      shownAt = performance.now();
      cancelAnimationFrame(raf);
      if (still.matches) frame(shownAt);
      else {
        if (!document.hidden) raf = requestAnimationFrame(loop);
        void buildNext();
      }
    };

    // a still page repaints only when the wash changes; a moving one is
    // repainting anyway
    redraw.current = () => {
      if (still.matches && world) frame(performance.now());
    };

    // the tab going away stops the clock; coming back restarts it in
    // place, so a menu left open all afternoon costs nothing while unseen
    const onVisibility = (): void => {
      cancelAnimationFrame(raf);
      if (!document.hidden && !still.matches && world) raf = requestAnimationFrame(loop);
    };
    // a resize is a different viewport, which is a different world size —
    // rolled again after the drag settles rather than on every pixel
    const onResize = (): void => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => void start(), 250);
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("resize", onResize);
    still.addEventListener("change", onVisibility);
    void start();

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      // hand the GL context back: a renderer holds the atlas on the GPU
      gpu?.canvas.getContext("webgl2")?.getExtension("WEBGL_lose_context")?.loseContext();
      if (resizeTimer) clearTimeout(resizeTimer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("resize", onResize);
      still.removeEventListener("change", onVisibility);
      redraw.current = null;
    };
  }, []);

  useEffect(() => {
    redraw.current?.();
  }, [dim]);

  return (
    <div className="pointer-events-none fixed inset-0" aria-hidden="true">
      <canvas ref={ref} className="block h-full w-full" />
      {/* the vignette: the corners fall away so the eye lands on the middle
          of the screen, where the title and the buttons are */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_35%,rgba(0,0,0,0.55)_100%)]" />
    </div>
  );
}
