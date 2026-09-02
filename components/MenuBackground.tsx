"use client";

import { useEffect, useRef } from "react";

/**
 * THE MENU'S GROUND — the game, seen from above, before anyone has built
 * anything on it.
 *
 * MechSwarm is a horde walking a valley toward a core, steered by a flow
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
 * WHAT IT MUST NEVER DO is compete with the menu on top of it. The wash
 * (`dim`) is the contract: the title card sits under a light one, and the
 * deeper menus, which are lists of cards to read, pull it darker. It also
 * holds still under prefers-reduced-motion (one frame), stops when the
 * tab is hidden, and draws at 30fps because a walking mech does not need
 * 60.
 */

const ENV = "/mindustry/sprites/blocks/environment/";
const PROPS = "/mindustry/sprites/blocks/props/";
const UNITS = "/mindustry/sprites/units/";
/** the raw sprites are 4× — one 8-unit tile is a 32px image */
const SPRITE_TILE = 32;
/** the ground cells drawn around the viewport so the camera can drift */
const MARGIN_TILES = 3;
const FPS = 30;
/** Pal.engine, the glow a flyer trails */
const ENGINE = "#ffbb64";
/** the swarm's own red, painted onto every mech's cell */
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

/** a second rock, laid over the first in patches */
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

/** the heat gradient, coolest first — some worlds run hot */
const HEAT = ["basalt1", "hotrock1", "hotrock2", "magmarock1", "magmarock2"] as const;

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
  /** the leg cycle, in px walked */
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
async function buildWorld(vw: number, vh: number, dpr: number, seed: number): Promise<World> {
  const rng = mulberry32(seed);
  // the tile in css px: about sixty across a desktop, held to a whole
  // multiple of the sprite's own pixels so the ground stays crisp
  const tile = 8 * Math.max(2, Math.min(4, Math.round(vw / 60 / 8)));
  const cols = Math.ceil(vw / tile) + MARGIN_TILES * 2;
  const rows = Math.ceil(vh / tile) + MARGIN_TILES * 2;

  const biome = pick(rng, BIOMES);
  const second = pick(rng, SECOND);
  const heat = rng() < 0.3;
  const dir: 1 | -1 = rng() < 0.5 ? 1 : -1;

  const rockNoise = makeNoise(rng);
  const secondNoise = makeNoise(rng);
  const heatNoise = makeNoise(rng);
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
  ]);
  const list = [...names];
  const unitNames = MECHS.flatMap((m) => [
    m.name,
    `${m.name}-base`,
    `${m.name}-leg`,
    ...(m.cell ? [`${m.name}-cell`] : []),
    ...(m.gun ? [`weapons/${m.gun.name}`] : []),
  ]);
  const [imgs, unitImgs, flareImg] = await Promise.all([
    Promise.all(list.map((n) => loadImage(`${n.includes("boulder") ? PROPS : ENV}${n}.png`))),
    Promise.all(unitNames.map((n) => loadImage(`${UNITS}${n}.png`))),
    loadImage(`${UNITS}flare.png`),
  ]);
  const sprites = new Map<string, HTMLImageElement>();
  list.forEach((n, i) => {
    const img = imgs[i];
    if (img) sprites.set(n, img);
  });
  const units = new Map<string, HTMLImageElement>();
  unitNames.forEach((n, i) => {
    const img = unitImgs[i];
    if (img) units.set(n, img);
  });
  const sprite = (n: string): HTMLImageElement | null => sprites.get(n) ?? null;

  // ---- the ground ----
  const isWall = new Uint8Array(cols * rows);
  const floorOf = new Array<string>(cols * rows);
  const wallOf = new Array<string>(cols * rows);
  const largeOf = new Array<string>(cols * rows);
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x;
      let b = biome;
      if (secondNoise(x / 25, y / 25) > 0.62) b = second;
      floorOf[i] = pick(rng, b.floor);
      wallOf[i] = pick(rng, b.wall);
      largeOf[i] = b.large;
      if (heat) {
        const h = heatNoise(x / 45, y / 45);
        if (h > 0.6) {
          const k = Math.min(HEAT.length - 1, Math.floor(((h - 0.6) / 0.22) * HEAT.length));
          floorOf[i] = HEAT[k];
        }
      }
      // the lane is open; the rest is rock with pockets of floor in it —
      // the branch lanes and dead ends the flow field would route around.
      // The lane's edge is roughened by noise so it is a valley and not a
      // stripe
      const off = Math.abs(y + 0.5 - laneRow(x + 0.5));
      const half = laneHalfTiles(x + 0.5) + (rockNoise(x / 6, y / 6) - 0.5) * 3;
      const inLane = off < half;
      const pocket = pocketNoise(x / 11, y / 11) > 0.6;
      isWall[i] = inLane || pocket ? 0 : 1;
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
    for (let x = 0; x < cols; x++) cell(floorOf[y * cols + x], x, y);

  // THE SHADOW under the rock: one path of every wall cell, filled once
  // through a blur, which is where the soft dark rim along the lane's
  // edge comes from
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

  // THE ROCK. A 2×2 cluster aligned to the even grid takes the large
  // sprite — the same rule the field's renderer uses (UV_WALL_LARGE)
  const covered = new Uint8Array(cols * rows);
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x;
      if (!isWall[i] || covered[i]) continue;
      const big =
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

  // THE PROPS: trees at the foot of the rock and boulders on open ground —
  // but never on the lane itself, which the column has to be able to walk
  // down
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x;
      if (isWall[i]) continue;
      const onLane = Math.abs(y + 0.5 - laneRow(x + 0.5)) < laneHalfTiles(x + 0.5) - 1;
      const nearRock = wallAt(x - 1, y) || wallAt(x + 1, y) || wallAt(x, y - 1) || wallAt(x, y + 1);
      const r = rng();
      let n: string | null = null;
      if (biome.prop && nearRock && r < 0.16) n = biome.prop;
      else if (!onLane && biome.boulder && r < 0.03) n = pick(rng, biome.boulder);
      const img = n && sprite(n);
      if (!img) continue;
      const s = (img.width / SPRITE_TILE) * tile;
      g.save();
      g.translate((x + 0.5) * tile, (y + 0.5) * tile);
      g.rotate((Math.floor(rng() * 4) * Math.PI) / 2);
      g.drawImage(img, -s / 2, -s / 2, s, s);
      g.restore();
    }

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
    let world: World | null = null;
    let raf = 0;
    let last = 0;
    let t0 = performance.now();
    let resizeTimer: ReturnType<typeof setTimeout> | null = null;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)");
    // a fresh world every launch
    const seed = (Math.random() * 0x7fffffff) | 0;

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
     * slung under it, and the body riding a little sway.
     */
    const drawMech = (
      m: Mech,
      x: number,
      y: number,
      rot: number,
      k: number,
      mu: number,
      shadow: boolean,
    ): void => {
      const a = m.art, kind = a.kind;
      const stride = kind.stride * mu;
      const raw = m.walk % (stride * 4);
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
      const k = wd.tile / SPRITE_TILE; // css px per raw sprite px
      const mu = wd.tile / 8; // css px per Mindustry world unit
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
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
        const speed = mc.art.kind.speed * wd.tile;
        const swing = Math.sin(t * 0.9 + mc.phase) * wd.tile * 0.25;
        const p = place(mc.s + speed * t, mc.lane, swing);
        return { mc, p, walk: mc.walk + speed * t };
      });
      walkers.sort((a, b) => a.p.y - b.p.y);
      ctx.globalAlpha = 0.5;
      for (const wk of walkers) {
        const mc = wk.mc;
        mc.walk = wk.walk;
        drawMech(mc, wk.p.x + wd.tile * 0.15, wk.p.y + wd.tile * 0.2, wk.p.rot, k, mu, true);
      }
      ctx.globalAlpha = 1;
      for (const wk of walkers) drawMech(wk.mc, wk.p.x, wk.p.y, wk.p.rot, k, mu, false);

      // the escort: flares over the column, higher and faster, weaving
      // across the lane rather than holding a line
      if (wd.flare) {
        const lift = wd.tile * 0.7;
        const fl = wd.flare;
        for (const f of wd.flyers) {
          const weave = Math.sin(t * 0.5 + f.phase) * wd.tile * 1.5;
          const p = place(f.s + f.speed * t, f.lane * 0.6, weave);
          const bank = Math.cos(t * 0.5 + f.phase) * 0.35 * wd.dir;
          ctx.globalAlpha = 0.4;
          drawPart(fl, true, p.x + lift * 0.5, p.y + lift, p.rot + bank, k);
          ctx.globalAlpha = 1;
          // the engine: a glow behind the body, breathing with the frame
          const flick = 0.75 + 0.25 * Math.sin(t * 17 + f.phase * 7);
          const r = fl.w * k * 0.11 * flick;
          const back = fl.h * k * 0.32;
          const ex = p.x - Math.cos(p.rot + bank) * back, ey = p.y - Math.sin(p.rot + bank) * back;
          ctx.save();
          ctx.globalCompositeOperation = "lighter";
          ctx.fillStyle = ENGINE;
          ctx.globalAlpha = 0.85;
          ctx.beginPath();
          ctx.arc(ex, ey, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "#ffffff";
          ctx.beginPath();
          ctx.arc(ex, ey, r * 0.45, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
          drawPart(fl, false, p.x, p.y, p.rot + bank, k);
        }
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
