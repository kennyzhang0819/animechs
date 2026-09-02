"use client";

import { useEffect, useRef } from "react";

/**
 * THE MENU'S GROUND — a small world that exists to be looked at.
 *
 * Mindustry's title screen is not a picture; it is a map (MenuRenderer):
 * a 100×50 world rolled fresh every launch from a floor/wall pair and a
 * couple of ores, drawn under a black wash at 30%, with a squadron of
 * flyers drifting across it at 45°. This is that, in a 2d canvas, from
 * the same sprites the game already ships.
 *
 * HOW IT IS BUILT. The world is generated once and rasterized once into
 * an offscreen canvas — floors, ore overlays, a blurred shadow under the
 * rock, the rock itself (2×2 clusters take the large wall sprite, as the
 * game's own renderer does), then the props. Every frame after that is
 * one drawImage of that canvas at a slow-drifting offset, the flyers on
 * top, and the wash. That is what keeps it cheaper than a WebGL run
 * would be — the field is a texture, and the only geometry per frame is
 * a dozen sprites.
 *
 * WHAT IT MUST NEVER DO is compete with the menu on top of it. The wash
 * (`dim`) is the whole contract: the title screen sits at Mindustry's
 * 0.3 and the deeper menus, which are lists of cards to read, pull it
 * darker. It also stops animating under prefers-reduced-motion (one
 * frame, then still), when the tab is hidden, and it draws at 30fps
 * because nothing in it moves fast enough to want 60.
 */

const ENV = "/mindustry/sprites/blocks/environment/";
/** boulders are props, and the props live in a folder of their own */
const PROPS = "/mindustry/sprites/blocks/props/";
const UNITS = "/mindustry/sprites/units/";
/** Mindustry's raw sprites are 4× — one 8-unit tile is a 32px image */
const SPRITE_TILE = 32;
/** the ground cells drawn around the viewport so the camera can drift */
const MARGIN_TILES = 3;
const FPS = 30;
/** flyer heading: up and to the right, the fixed 45° of the original */
const HEADING = -Math.PI / 4;
/** Pal.engine, the glow a flyer trails */
const ENGINE = "#ffbb64";
/** the crux team's red — the swarm's own colour, on the flyers' cells */
const CELL_TINT = "#e55454";

interface Biome {
  floor: readonly string[];
  wall: readonly string[];
  large: string;
  /** a tree that grows on this ground, planted at the foot of the rock */
  prop?: string;
  /** the boulders scattered on it */
  boulder?: readonly string[];
}

/** the pairs the original rolls between, plus the two this game also has */
const BIOMES: readonly Biome[] = [
  {
    floor: ["sand-floor1", "sand-floor2", "sand-floor3"],
    wall: ["sand-wall1", "sand-wall2"],
    large: "sand-wall-large",
    boulder: ["sand-boulder1", "sand-boulder2"],
  },
  {
    floor: ["shale1", "shale2", "shale3"],
    wall: ["shale-wall1", "shale-wall2"],
    large: "shale-wall-large",
    boulder: ["shale-boulder1", "shale-boulder2"],
  },
  {
    floor: ["ice1", "ice2", "ice3"],
    wall: ["ice-wall1", "ice-wall2"],
    large: "ice-wall-large",
    boulder: ["snow-boulder1", "snow-boulder2"],
  },
  {
    floor: ["moss1", "moss2", "moss3"],
    wall: ["spore-wall1", "spore-wall2"],
    large: "spore-wall-large",
    prop: "spore-pine",
  },
  {
    floor: ["dirt1", "dirt2", "dirt3"],
    wall: ["dirt-wall1", "dirt-wall2"],
    large: "dirt-wall-large",
    boulder: ["boulder1", "boulder2"],
  },
  {
    floor: ["darksand1", "darksand2", "darksand3"],
    wall: ["dune-wall1", "dune-wall2"],
    large: "dune-wall-large",
    boulder: ["basalt-boulder1", "basalt-boulder2"],
  },
  {
    floor: ["snow1", "snow2", "snow3"],
    wall: ["snow-wall1", "snow-wall2"],
    large: "snow-wall-large",
    prop: "snow-pine",
    boulder: ["snow-boulder1", "snow-boulder2"],
  },
  {
    floor: ["grass1", "grass2", "grass3"],
    wall: ["dirt-wall1", "dirt-wall2"],
    large: "dirt-wall-large",
    prop: "pine",
    boulder: ["boulder1", "boulder2"],
  },
];

/** the second pair: patches of a different rock laid over the first */
const SECOND: readonly Biome[] = [
  {
    floor: ["basalt1", "basalt2", "basalt3"],
    wall: ["dune-wall1", "dune-wall2"],
    large: "dune-wall-large",
  },
  {
    floor: ["stone1", "stone2", "stone3"],
    wall: ["stone-wall1", "stone-wall2"],
    large: "stone-wall-large",
  },
];

/** the heat gradient, coolest first — rolled in a quarter of worlds */
const HEAT = ["basalt1", "hotrock1", "hotrock2", "magmarock1", "magmarock2"] as const;
/** a buried installation — rolled in a quarter of worlds */
const TECH_FLOOR = ["metal-floor", "metal-floor-2", "metal-floor-3", "metal-floor-5"] as const;
const TECH_WALL = ["dark-panel-1", "dark-panel-2", "dark-panel-3"] as const;
const ORES = ["copper", "lead", "scrap", "coal", "titanium", "thorium"] as const;

interface Flyer {
  name: string;
  /** how many of them cross the field */
  count: readonly [number, number];
  /** tiles per second */
  speed: number;
  /** where the engine sits, as a fraction of the sprite behind its centre */
  engine: number;
  /** has a `-cell` sprite to paint in the team colour (the flare has none) */
  cell?: boolean;
}

const FLYERS: readonly Flyer[] = [
  { name: "flare", count: [16, 34], speed: 1.1, engine: 0.3 },
  { name: "horizon", count: [8, 18], speed: 0.8, engine: 0.32, cell: true },
  { name: "zenith", count: [5, 10], speed: 0.55, engine: 0.34, cell: true },
  { name: "mono", count: [12, 24], speed: 0.9, engine: 0.28, cell: true },
  { name: "poly", count: [8, 16], speed: 0.75, engine: 0.3, cell: true },
  { name: "mega", count: [4, 8], speed: 0.5, engine: 0.33, cell: true },
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

const pick = <T,>(rng: () => number, list: readonly T[]): T =>
  list[Math.min(list.length - 1, Math.floor(rng() * list.length))];

/** an image, or null if it is missing — a missing tile is a gap, never a crash */
const loadImage = (src: string): Promise<HTMLImageElement | null> =>
  new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });

/** a sprite with its cell painted in a team colour, the way units are drawn */
function tintCell(
  base: HTMLImageElement,
  cell: HTMLImageElement | null,
  colour: string,
): HTMLCanvasElement {
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
    tg.fillStyle = colour;
    tg.fillRect(0, 0, t.width, t.height);
    g.drawImage(t, 0, 0);
  }
  return c;
}

/** a silhouette of a sprite, for its shadow */
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

interface Unit {
  x: number;
  y: number;
  /** a phase for its own bob and engine flicker */
  phase: number;
}

interface World {
  /** the rasterized ground, in device px */
  ground: HTMLCanvasElement;
  /** tile size in css px, and the ground's size in css px */
  tile: number;
  w: number;
  h: number;
  flyer: Flyer;
  sprite: HTMLCanvasElement;
  shadow: HTMLCanvasElement;
  /** how big the flyer draws, in css px */
  size: number;
  units: Unit[];
  speed: number;
}

/**
 * Roll and rasterize one world for a viewport of `vw`×`vh` css px.
 * Everything random is drawn from one seeded generator so a world is
 * reproducible from its seed, which is only useful for debugging and
 * costs nothing.
 */
async function buildWorld(vw: number, vh: number, dpr: number, seed: number): Promise<World> {
  const rng = mulberry32(seed);
  // the tile in css px: about sixty across a desktop, held to a whole
  // multiple of the sprite's own pixels so the ground stays crisp
  const tile = 8 * Math.max(2, Math.min(4, Math.round(vw / 60 / 8)));
  const cols = Math.ceil(vw / tile) + MARGIN_TILES * 2;
  const rows = Math.ceil(vh / tile) + MARGIN_TILES * 2;

  const biome = pick(rng, BIOMES);
  const second = pick(rng, SECOND);
  const heat = rng() < 0.25;
  const tech = rng() < 0.25;
  const ore1 = pick(rng, ORES);
  let ore2 = pick(rng, ORES);
  if (ore2 === ore1) ore2 = ORES[(ORES.indexOf(ore1) + 1) % ORES.length];
  const flyer = pick(rng, FLYERS);

  const wallNoise = makeNoise(rng);
  const secondNoise = makeNoise(rng);
  const heatNoise = makeNoise(rng);
  const techNoise = makeNoise(rng);
  const oreNoise1 = makeNoise(rng);
  const oreNoise2 = makeNoise(rng);

  // every sprite this world needs, fetched once and together
  const names = new Set<string>([
    ...biome.floor,
    ...biome.wall,
    biome.large,
    ...second.floor,
    ...second.wall,
    second.large,
    ...(biome.prop ? [biome.prop] : []),
    ...(biome.boulder ?? []),
    ...(heat ? HEAT : []),
    ...(tech ? [...TECH_FLOOR, ...TECH_WALL] : []),
    "shrubs1",
    "shrubs2",
    ...[1, 2, 3].flatMap((i) => [`ore-${ore1}${i}`, `ore-${ore2}${i}`]),
  ]);
  const list = [...names];
  const [imgs, unitBase, unitCell] = await Promise.all([
    Promise.all(list.map((n) => loadImage(`${n.includes("boulder") ? PROPS : ENV}${n}.png`))),
    loadImage(`${UNITS}${flyer.name}.png`),
    flyer.cell ? loadImage(`${UNITS}${flyer.name}-cell.png`) : Promise.resolve(null),
  ]);
  const sprites = new Map<string, HTMLImageElement>();
  list.forEach((n, i) => {
    const img = imgs[i];
    if (img) sprites.set(n, img);
  });
  const sprite = (n: string): HTMLImageElement | null => sprites.get(n) ?? null;

  // ---- the ground: floor, wall, and what is on each cell ----
  const isWall = new Uint8Array(cols * rows);
  const floorOf = new Array<string>(cols * rows);
  const wallOf = new Array<string>(cols * rows);
  const largeOf = new Array<string>(cols * rows);
  const oreOf = new Array<string | null>(cols * rows).fill(null);
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x;
      let b = biome;
      if (secondNoise(x / 25, y / 25) > 0.62) b = second;
      floorOf[i] = pick(rng, b.floor);
      wallOf[i] = pick(rng, b.wall);
      largeOf[i] = b.large;
      const wallHere = wallNoise(x / 18, y / 18) > 0.585;
      if (tech && techNoise(x / 34, y / 34) > 0.64) {
        floorOf[i] = pick(rng, TECH_FLOOR);
        wallOf[i] = pick(rng, TECH_WALL);
        largeOf[i] = "";
      } else if (heat) {
        const h = heatNoise(x / 45, y / 45);
        if (h > 0.6) {
          const k = Math.min(HEAT.length - 1, Math.floor(((h - 0.6) / 0.22) * HEAT.length));
          floorOf[i] = HEAT[k];
        }
      }
      isWall[i] = wallHere ? 1 : 0;
      if (!wallHere) {
        // veins, not carpets: the thresholds sit high enough that an ore
        // is a patch you can point at rather than the colour of the floor
        if (oreNoise1(x / 28, y / 28) > 0.67) oreOf[i] = `ore-${ore1}${1 + Math.floor(rng() * 3)}`;
        else if (oreNoise2(x / 14, y / 14) > 0.7) oreOf[i] = `ore-${ore2}${1 + Math.floor(rng() * 3)}`;
      }
    }
  const wallAt = (x: number, y: number): boolean =>
    x >= 0 && y >= 0 && x < cols && y < rows && isWall[y * cols + x] === 1;

  // ---- rasterize ----
  const ground = document.createElement("canvas");
  ground.width = Math.round(cols * tile * dpr);
  ground.height = Math.round(rows * tile * dpr);
  const g = ground.getContext("2d")!;
  g.imageSmoothingEnabled = false;
  g.scale(dpr, dpr);
  const cell = (n: string | null, x: number, y: number, span = 1): void => {
    const img = n && sprite(n);
    if (img) g.drawImage(img, x * tile, y * tile, tile * span, tile * span);
  };

  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x;
      cell(floorOf[i], x, y);
      if (oreOf[i]) cell(oreOf[i], x, y);
    }

  // THE SHADOW: the original fills a black rect under every solid block
  // and blurs the buffer, which is where the soft dark rim around every
  // outcrop comes from. One path, one blurred fill.
  g.save();
  g.beginPath();
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++)
      if (isWall[y * cols + x]) g.rect(x * tile, y * tile, tile, tile);
  g.fillStyle = "rgba(0,0,0,0.6)";
  g.filter = `blur(${Math.max(2, tile / 5)}px)`;
  g.translate(tile * 0.1, tile * 0.15);
  g.fill();
  g.restore();

  // THE ROCK. A 2×2 cluster of wall aligned to the even grid takes the
  // large sprite — the same rule the field's renderer uses (UV_WALL_LARGE)
  const covered = new Uint8Array(cols * rows);
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x;
      if (!isWall[i] || covered[i]) continue;
      const big =
        largeOf[i] !== "" &&
        x % 2 === 0 &&
        y % 2 === 0 &&
        wallAt(x + 1, y) &&
        wallAt(x, y + 1) &&
        wallAt(x + 1, y + 1) &&
        largeOf[i + 1] === largeOf[i] &&
        largeOf[i + cols] === largeOf[i] &&
        largeOf[i + cols + 1] === largeOf[i] &&
        sprite(largeOf[i]) !== null;
      if (big) {
        cell(largeOf[i], x, y, 2);
        covered[i] = covered[i + 1] = covered[i + cols] = covered[i + cols + 1] = 1;
      } else {
        cell(wallOf[i], x, y);
        covered[i] = 1;
      }
    }

  // THE PROPS: trees at the foot of the rock, shrubs and boulders on open
  // ground. Trees are 48px sprites — a tile and a half — drawn centred on
  // their cell so they overhang, which is what makes them read as standing
  // on the ground rather than tiled into it
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x;
      if (isWall[i]) continue;
      const nearRock = wallAt(x - 1, y) || wallAt(x + 1, y) || wallAt(x, y - 1) || wallAt(x, y + 1);
      const r = rng();
      let n: string | null = null;
      // shrubs only where something already grows: one green blob on a
      // bare rock world reads as a glitch, not as a plant
      if (biome.prop && nearRock && r < 0.16) n = biome.prop;
      else if (biome.boulder && r < 0.02) n = pick(rng, biome.boulder);
      else if (biome.prop && r < 0.03) n = pick(rng, ["shrubs1", "shrubs2"]);
      const img = n && sprite(n);
      if (!img) continue;
      const s = (img.width / SPRITE_TILE) * tile;
      const cx = (x + 0.5) * tile, cy = (y + 0.5) * tile;
      g.save();
      g.translate(cx, cy);
      g.rotate((Math.floor(rng() * 4) * Math.PI) / 2);
      g.drawImage(img, -s / 2, -s / 2, s, s);
      g.restore();
    }

  // ---- the squadron ----
  const base = unitBase ?? sprite("shrubs1")!;
  const sprited = tintCell(base, unitCell, CELL_TINT);
  const size = (base.width / SPRITE_TILE) * tile;
  const w = cols * tile, h = rows * tile;
  const n = flyer.count[0] + Math.floor(rng() * (flyer.count[1] - flyer.count[0]));
  const units: Unit[] = [];
  for (let i = 0; i < n; i++)
    units.push({ x: rng() * w, y: rng() * h, phase: rng() * Math.PI * 2 });

  return {
    ground,
    tile,
    w,
    h,
    flyer,
    sprite: sprited,
    shadow: silhouette(sprited, sprited.width, sprited.height),
    size,
    units,
    speed: flyer.speed * tile,
  };
}

export default function MenuBackground({
  /** the black wash over the field, 0–1. Mindustry's title sits at 0.3 */
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
    let world: World | null = null;
    let raf = 0;
    let last = 0;
    let t0 = performance.now();
    let resizeTimer: ReturnType<typeof setTimeout> | null = null;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)");
    // a fresh world every launch, like the original
    const seed = (Math.random() * 0x7fffffff) | 0;

    const frame = (now: number): void => {
      const wd = world;
      if (!wd) return;
      const vw = canvas.clientWidth, vh = canvas.clientHeight;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      if (canvas.width !== Math.round(vw * dpr) || canvas.height !== Math.round(vh * dpr)) {
        canvas.width = Math.round(vw * dpr);
        canvas.height = Math.round(vh * dpr);
      }
      const t = (now - t0) / 1000;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = false;
      // the camera: a slow figure-of-eight inside the margin, so the field
      // is never still and never shows its edge
      const m = MARGIN_TILES * wd.tile;
      const ox = -m + Math.sin(t * 0.07) * m * 0.8;
      const oy = -m + Math.sin(t * 0.05 + 1.3) * m * 0.8;
      ctx.drawImage(wd.ground, ox, oy, wd.w, wd.h);

      // the squadron, on a heading of 45° and wrapping off one edge onto
      // the other, each with a shadow on the ground beneath it and an
      // engine flickering behind it — drawn as the field draws them
      const ux = Math.cos(HEADING) * wd.speed, uy = Math.sin(HEADING) * wd.speed;
      const half = wd.size / 2;
      const pad = wd.size;
      const lift = wd.tile * 0.55;
      ctx.imageSmoothingEnabled = true;
      for (const u of wd.units) {
        const bob = Math.sin(t * 0.63 + u.phase) * wd.tile * 0.35;
        // world position, wrapped inside the ground plus a sprite of slack
        const px = (((u.x + ux * t + pad) % (wd.w + pad * 2)) + wd.w + pad * 2) % (wd.w + pad * 2) - pad;
        const py = (((u.y + uy * t + pad) % (wd.h + pad * 2)) + wd.h + pad * 2) % (wd.h + pad * 2) - pad;
        const sx = px + ox, sy = py + oy + bob;
        // shadow: the silhouette, offset by the flyer's height off the ground
        ctx.save();
        ctx.globalAlpha = 0.45;
        ctx.translate(sx + lift * 0.4, sy + lift);
        ctx.rotate(HEADING + Math.PI / 2);
        ctx.drawImage(wd.shadow, -half, -half, wd.size, wd.size);
        ctx.restore();
      }
      for (const u of wd.units) {
        const bob = Math.sin(t * 0.63 + u.phase) * wd.tile * 0.35;
        const px = (((u.x + ux * t + pad) % (wd.w + pad * 2)) + wd.w + pad * 2) % (wd.w + pad * 2) - pad;
        const py = (((u.y + uy * t + pad) % (wd.h + pad * 2)) + wd.h + pad * 2) % (wd.h + pad * 2) - pad;
        const sx = px + ox, sy = py + oy + bob;
        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(HEADING + Math.PI / 2);
        // the engine: a glow behind the body, breathing with the frame
        const flick = 0.75 + 0.25 * Math.sin(t * 17 + u.phase * 7);
        const r = wd.size * 0.11 * flick;
        ctx.globalCompositeOperation = "lighter";
        ctx.fillStyle = ENGINE;
        ctx.globalAlpha = 0.85;
        ctx.beginPath();
        ctx.arc(0, half * wd.flyer.engine * 2, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#ffffff";
        ctx.globalAlpha = 0.9;
        ctx.beginPath();
        ctx.arc(0, half * wd.flyer.engine * 2, r * 0.45, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = 1;
        ctx.drawImage(wd.sprite, -half, -half, wd.size, wd.size);
        ctx.restore();
      }

      // the wash
      ctx.fillStyle = `rgba(0,0,0,${Math.max(0, Math.min(1, dimRef.current))})`;
      ctx.fillRect(0, 0, vw, vh);
    };

    const loop = (now: number): void => {
      if (!alive) return;
      raf = requestAnimationFrame(loop);
      if (now - last < 1000 / FPS) return;
      last = now;
      frame(now);
    };

    const start = async (): Promise<void> => {
      const vw = canvas.clientWidth, vh = canvas.clientHeight;
      if (vw === 0 || vh === 0) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const built = await buildWorld(vw, vh, dpr, seed);
      if (!alive) return;
      world = built;
      t0 = performance.now();
      cancelAnimationFrame(raf);
      if (still.matches) frame(t0);
      else if (!document.hidden) raf = requestAnimationFrame(loop);
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
