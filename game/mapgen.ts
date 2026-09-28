// The map generator, in the game: scripts/maps/mapgen.mjs ported so a run
// can build its own board at start. The pipeline is that file's
// (docs/authoring-maps.md) less its rim, plus randomSpec, which rolls the
// forty-odd numbers an author would write. See docs/random-maps.md.
import { COLS, ROWS } from "./constants";
import { RANDOM_MAP_ID, type MapData } from "./maps";
import { forestOf, SPAWN_CORE_CLEAR, type Prop } from "./terrain";
import { WALL_GROUP, WALL_GROUP_KINDS } from "./atlas";
import { PROP_KINDS, propKind, rockTone, rollRot, BIOME_PROPS, TONE } from "./propArt";
import type { MapMark } from "./missionMarks";
import { MAX_SITES, rollSiteCounts, SITE_KINDS, SITE_MARK, SITE_SIZES, siteTier, type SiteSize } from "./sites";

export const SIZE = 512;
export const SCALE = 2;
export const WIDEN = 1.5;
export const ROOM_WIDEN = 1.25;
const W = SIZE, H = SIZE, N = W * H;

type Bias = (x: number, y: number) => number;
export type ZoneKind = "ground" | "water" | "air" | "boss";
export interface SpecRoom { x: number; y: number; r: number; wobble?: number; water?: boolean; dry?: boolean }
export interface SpecZone { x: number; y: number; r: number; zone: ZoneKind }
export type RoutePoint = number | "core" | `spawn:${number}`;
export interface SpecRoute { spawn: number; via?: RoutePoint[]; to?: RoutePoint; width: [number, number]; layer?: "ground" | "water" }
export interface SpecLink { rooms: [RoutePoint, RoutePoint]; width: [number, number]; layer?: "ground" | "water" }
export interface SpecChoke { x: number; y: number; w: number; reach: number }
/** a biome's props: which kinds, in which tones, how thick */
export interface PropSpec {
  /** leaf tones for the growing things; the first is the common one */
  canopy: number[];
  /** the tone of dead wood */
  wood: number;
  /** the weathering every made prop wears */
  weather: number;
  /** the growing kinds by name, weighted by repetition */
  flora: string[];
  /** the stone kinds by name */
  stones: string[];
  /** the water's-edge kinds by name, on the shallows and the ground a cell off them */
  shore?: string[];
  /** the small made kinds scattered round a site */
  litter: string[];
  /** the sites' own kinds: the 4x4s and the 6x6s */
  sites: string[];
  /** how thick the growth lies, and how many stones */
  growth: number;
  stone: number;
  /** how many junk sites a board gets */
  siteCount: [number, number];
}

/** the ground a cell reads: the spec's own or the blend's */
type Ground = Pick<MapSpec, "beach" | "flats" | "forest">;
export interface Blend extends Ground {
  families: { floor: number; wall: number; weight: number }[];
  props: PropSpec;
  /** the share of the board this biome takes, 0..1 */
  amount: number;
}

export interface MapSpec {
  id: string;
  name: string;
  seed: number;
  rock: { threshold: number; scale: number; warp: number; bias?: Bias };
  water?: { scale: number; level: number; shore: number; warp?: number; bias?: Bias; shallow?: number; deep?: number };
  floors: { scale?: number; warp?: number; families: { floor: number; wall: number; weight: number }[] };
  beach?: { floor: number; wall?: number; depth: number };
  flats?: { floor: number; clear: number };
  rooms: SpecRoom[];
  core: { x: number; y: number; r?: number };
  spawns: SpecZone[];
  routes: SpecRoute[];
  links?: SpecLink[];
  chokes?: SpecChoke[];
  funnel?: { x: number; y: number; r: number };
  holes?: number;
  lumps?: number;
  ruins?: number;
  /** rock beside these floors grows the biome's flora instead of standing bare */
  forest?: { on: number[]; threshold: number; depth: number };
  /** what stands on the open ground — see docs/props.md */
  props?: PropSpec;
  /** the second and third biomes, each over part of the board, interfingered with the first (docs/random-maps.md) */
  blends?: Blend[];
  distort?: number;
  bays?: number;
  clutter?: number;
  /** the narrowest route a zone may have, as the widest way through; the checks' floor */
  routeMin?: { ground: number; water: number };
  /** how far apart the ground walks to the core may be, as a fraction of the shortest */
  spreadMax?: number;
  scaled?: boolean;
}

export function scaleSpec(spec: MapSpec): MapSpec {
  if (spec.scaled) return spec;
  const k = SCALE;
  const pt = <T extends { x: number; y: number; r?: number }>(o: T): T =>
    ({ ...o, x: o.x * k, y: o.y * k, ...(o.r != null ? { r: o.r * k } : {}) });
  const fn = (f?: Bias): Bias | undefined => (f ? (x, y) => f(x / k, y / k) : f);
  const width = (w: [number, number], layer?: string): [number, number] => {
    const f = (layer ?? "ground") === "ground" ? k * WIDEN : k;
    return [w[0] * f, w[1] * f];
  };
  return {
    ...spec,
    scaled: true,
    rock: { ...spec.rock, scale: spec.rock.scale * k, warp: spec.rock.warp * k, bias: fn(spec.rock.bias) },
    water: spec.water && {
      ...spec.water,
      scale: spec.water.scale * k,
      ...(spec.water.warp != null ? { warp: spec.water.warp * k } : {}),
      bias: fn(spec.water.bias),
    },
    floors: { ...spec.floors, scale: (spec.floors.scale ?? 48) * k, warp: (spec.floors.warp ?? 12) * k },
    beach: spec.beach && { ...spec.beach, depth: spec.beach.depth * k },
    flats: spec.flats && { ...spec.flats, clear: spec.flats.clear * k },
    forest: spec.forest && { ...spec.forest, depth: spec.forest.depth * k },
    blends: spec.blends?.map((b) => ({
      ...b,
      beach: b.beach && { ...b.beach, depth: b.beach.depth * k },
      flats: b.flats && { ...b.flats, clear: b.flats.clear * k },
      forest: b.forest && { ...b.forest, depth: b.forest.depth * k },
    })),
    rooms: spec.rooms.map((r) => ({ ...pt(r), r: r.r * k * ROOM_WIDEN })),
    core: { ...pt(spec.core), r: (spec.core.r ?? 11) * k },
    spawns: spec.spawns.map(pt),
    routes: spec.routes.map((r) => ({ ...r, width: width(r.width, r.layer) })),
    links: (spec.links ?? []).map((l) => ({ ...l, width: width(l.width, l.layer) })),
    chokes: (spec.chokes ?? []).map((c) => ({ ...pt(c), w: c.w * k * WIDEN, reach: c.reach * k })),
    funnel: spec.funnel && { ...pt(spec.funnel), r: spec.funnel.r * k * WIDEN },
    holes: spec.holes == null ? spec.holes : Math.round(spec.holes * k),
    lumps: spec.lumps == null ? spec.lumps : Math.round(spec.lumps * k * k * 0.75),
    ruins: spec.ruins == null ? spec.ruins : Math.round(spec.ruins * k),
  };
}

// atlas indices, copied as scripts/maps/mapgen.mjs copies them (game/atlas.ts)
export const FLOOR_GRASS = 0;
export const FLOOR_STONE = 3;
export const FLOOR_DIRT = 6;
export const FLOOR_SAND = 9;
export const FLOOR_DARKSAND = 12;
export const FLOOR_SHALLOW_WATER = 15;
export const FLOOR_DEEP_WATER = 18;
export const FLOOR_MOSS = 21;
export const FLOOR_SPORE_MOSS = 24;
export const FLOOR_MUD = 27;
export const FLOOR_SHALE = 30;
export const FLOOR_SNOW = 33;
export const FLOOR_SALT = 36;
export const FLOOR_ICE = 39;
export const FLOOR_BASALT = 42;
export const FLOOR_TAINTED_WATER = 45;
export const FLOOR_DEEP_TAINTED_WATER = 48;
export const FLOOR_LOAM = 51;
export const FLOOR_DUST = 54;
export const FLOOR_FLINT = 57;
export const FLOOR_CLAY = 60;
export const FLOOR_PEAT = 63;
export const FLOOR_BOG = 66;
export const FLOOR_CINDER = 69;
export const FLOOR_CHALK = 72;
export const FLOOR_SCORIA = 75;
export const FLOOR_OBSIDIAN = 78;
export const FLOOR_SHOAL = 81;
export const FLOOR_CORALSAND = 84;
export const FLOOR_SILT = 87;
export const FLOOR_JUNGLE = 90;
export const FLOOR_LITTER = 93;
export const FLOOR_REDEARTH = 96;
export const FLOOR_SPOREFIELD = 99;
export const FLOOR_MYCELIUM = 102;
export const FLOOR_BLIGHT = 105;
export const FLOOR_QUARTZ = 108;
export const FLOOR_SLATE = 111;
export const FLOOR_FLAGSTONE = 114;
export const FLOOR_SANDSTONE = 117;
export const FLOOR_PLATE = 120;
export const WALL_STONE = 0;
export const WALL_DIRT = 2;
export const WALL_PROP = 4;
export const WALL_DARK = 5;
export const WALL_DEEP = 7;
export const WALL_SPORE = 8;
export const WALL_SHALE = 10;
export const WALL_SNOW = 12;
export const WALL_ICE = 14;
export const WALL_SALT = 16;
export const WALL_SAND = 18;
export const WALL_DUNE = 20;
export const WALL_DACITE = 22;
export const WALL_FLINT = 24;
export const WALL_CLAY = 26;
export const WALL_PEAT = 28;
export const WALL_CINDER = 30;
export const WALL_CHALK = 32;
export const WALL_LOAM = 34;
export const WALL_SCORIA = 36;
export const WALL_OBSIDIAN = 38;
export const WALL_REEF = 40;
export const WALL_LIMESTONE = 42;
export const WALL_JUNGLE = 44;
export const WALL_LATERITE = 46;
export const WALL_SPORE_ROCK = 48;
export const WALL_FUNGAL = 50;
export const WALL_CRYSTAL_ROCK = 52;
export const WALL_SLATE = 54;
export const WALL_MASONRY = 56;
export const WALL_PLATING = 58;
const WATER_FLOORS = [FLOOR_SHALLOW_WATER, FLOOR_DEEP_WATER, FLOOR_TAINTED_WATER, FLOOR_DEEP_TAINTED_WATER];
const CORE = 10;
/** the core's cells round its centre: CORE_LO..CORE_HI on either axis */
const CORE_LO = -(CORE >> 1), CORE_HI = CORE - (CORE >> 1) - 1;
export const GAP_GROUND = 5;
export const GAP_WATER = 11;
/** a spawn tile must sit on ground that reaches the core through corridors
 *  wide enough for the widest body: the walk mask opened at this radius */
const SPAWN_CLEAR = 6;
/** the spawn layer is the nearest such ground inward from every edge cell,
 *  however deep, and this many cells of it */
const SPAWN_DEPTH = 10;
const ROUTE_MIN_GROUND = 12;
const ROUTE_MIN_WATER = 16;
/** rock this far over the threshold keeps its head above the water */
const SEA_ROCK = 0.06;
/** the most of the land (every cell that is not deep water) that may be
 *  rock: the noise is cut back to ROCK_CAP_RAW of the board before the
 *  water, and a board over ROCK_CAP after the seal is rerolled. See
 *  docs/random-maps.md */
export const ROCK_CAP = 0.35;
const ROCK_CAP_RAW = 0.36;

// ---------- raster helpers (scripts/maps/geom.mjs) ----------

type Put = (i: number, x: number, y: number) => void;
type Pass = (i: number) => boolean;

const disc = (cx: number, cy: number, r: number, put: Put): void => {
  const x0 = Math.max(0, Math.ceil(cx - r)), x1 = Math.min(W - 1, Math.floor(cx + r));
  const y0 = Math.max(0, Math.ceil(cy - r)), y1 = Math.min(H - 1, Math.floor(cy + r));
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      if (dx * dx + dy * dy <= r * r) put(y * W + x, x, y);
    }
};

const discOffsets = (r: number): [number, number][] => {
  const out: [number, number][] = [];
  for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy++)
    for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx++)
      if (dx * dx + dy * dy <= r * r) out.push([dx, dy]);
  return out;
};

const clearance = (pass: Pass): Float32Array => {
  const INF = 1e9;
  const d = new Float32Array(N);
  for (let i = 0; i < N; i++) d[i] = pass(i) ? INF : 0;
  const relax = (i: number, j: number, w: number): void => { if (d[j] + w < d[i]) d[i] = d[j] + w; };
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (d[i] === 0) continue;
      if (x > 0) relax(i, i - 1, 5);
      if (y > 0) relax(i, i - W, 5);
      if (x > 0 && y > 0) relax(i, i - W - 1, 7);
      if (x < W - 1 && y > 0) relax(i, i - W + 1, 7);
      if (x > 1 && y > 0) relax(i, i - W - 2, 11);
      if (x < W - 2 && y > 0) relax(i, i - W + 2, 11);
      if (x > 0 && y > 1) relax(i, i - 2 * W - 1, 11);
      if (x < W - 1 && y > 1) relax(i, i - 2 * W + 1, 11);
    }
  for (let y = H - 1; y >= 0; y--)
    for (let x = W - 1; x >= 0; x--) {
      const i = y * W + x;
      if (d[i] === 0) continue;
      if (x < W - 1) relax(i, i + 1, 5);
      if (y < H - 1) relax(i, i + W, 5);
      if (x < W - 1 && y < H - 1) relax(i, i + W + 1, 7);
      if (x > 0 && y < H - 1) relax(i, i + W - 1, 7);
      if (x < W - 2 && y < H - 1) relax(i, i + W + 2, 11);
      if (x > 1 && y < H - 1) relax(i, i + W - 2, 11);
      if (x < W - 1 && y < H - 2) relax(i, i + 2 * W + 1, 11);
      if (x > 0 && y < H - 2) relax(i, i + 2 * W - 1, 11);
    }
  for (let i = 0; i < N; i++) d[i] = d[i] >= INF ? 1e6 : d[i] / 5;
  return d;
};

const flood = (seeds: readonly number[], pass: Pass): Uint8Array => {
  const seen = new Uint8Array(N);
  const q: number[] = [];
  for (const i of seeds) if (!seen[i] && pass(i)) { seen[i] = 1; q.push(i); }
  for (let h = 0; h < q.length; h++) {
    const i = q[h], x = i % W, y = (i / W) | 0;
    if (x > 0) { const j = i - 1; if (!seen[j] && pass(j)) { seen[j] = 1; q.push(j); } }
    if (x < W - 1) { const j = i + 1; if (!seen[j] && pass(j)) { seen[j] = 1; q.push(j); } }
    if (y > 0) { const j = i - W; if (!seen[j] && pass(j)) { seen[j] = 1; q.push(j); } }
    if (y < H - 1) { const j = i + W; if (!seen[j] && pass(j)) { seen[j] = 1; q.push(j); } }
  }
  return seen;
};

const widestRoute = (dist: Float32Array, seeds: readonly number[], isExit: Pass): number => {
  let lo = 0, hi = 40;
  for (let k = 0; k < 24; k++) {
    const r = (lo + hi) / 2;
    const pass: Pass = (i) => dist[i] >= r;
    const seen = flood(seeds.filter(pass), pass);
    let ok = false;
    for (let i = 0; i < N && !ok; i++) if (seen[i] && isExit(i)) ok = true;
    if (ok) lo = r; else hi = r;
  }
  return lo * 2;
};

export const rng = (seed: number): (() => number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

// ---------- noise ----------

type Noise2 = (x: number, y: number) => number;

const makeNoise = (rnd: () => number, octaves = 3): Noise2 => {
  const seed = (rnd() * 0x7fffffff) | 0;
  const ox = rnd() * 512, oy = rnd() * 512;
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
  const amps = [0.55, 0.28, 0.17, 0.1, 0.06].slice(0, octaves);
  const total = amps.reduce((a, b) => a + b, 0);
  return (x, y) => {
    let v = 0, f = 1;
    for (const a of amps) { v += val((x + ox) * f, (y + oy) * f) * a; f *= 2.13; }
    return v / total;
  };
};

const makeWarped = (rnd: () => number, scale: number, warp: number, octaves = 3): Noise2 => {
  const n = makeNoise(rnd, octaves), wx = makeNoise(rnd, 2), wy = makeNoise(rnd, 2);
  const ws = scale * 1.7;
  return (x, y) => {
    const dx = (wx(x / ws, y / ws) - 0.5) * 2 * warp;
    const dy = (wy(x / ws, y / ws) - 0.5) * 2 * warp;
    return n((x + dx) / scale, (y + dy) / scale);
  };
};

// ---------- the pieces ----------

const astar = (sx: number, sy: number, tx: number, ty: number, cost: (i: number) => number): [number, number][] | null => {
  const g = new Float32Array(N).fill(Infinity);
  const from = new Int32Array(N).fill(-1);
  const closed = new Uint8Array(N);
  const hk = new Float64Array(N * 2), hv = new Int32Array(N * 2);
  let hn = 0;
  const push = (k: number, v: number): void => {
    let i = hn++;
    while (i > 0) { const p = (i - 1) >> 1; if (hk[p] <= k) break; hk[i] = hk[p]; hv[i] = hv[p]; i = p; }
    hk[i] = k; hv[i] = v;
  };
  const pop = (): number => {
    const v = hv[0]; const k = hk[--hn], val = hv[hn];
    let i = 0;
    for (;;) {
      let c = i * 2 + 1;
      if (c >= hn) break;
      if (c + 1 < hn && hk[c + 1] < hk[c]) c++;
      if (hk[c] >= k) break;
      hk[i] = hk[c]; hv[i] = hv[c]; i = c;
    }
    hk[i] = k; hv[i] = val;
    return v;
  };
  const hx = (x: number, y: number): number => { const dx = Math.abs(x - tx), dy = Math.abs(y - ty); return Math.max(dx, dy) + 0.414 * Math.min(dx, dy); };
  const s = sy * W + sx, t = ty * W + tx;
  g[s] = 0;
  push(hx(sx, sy), s);
  while (hn) {
    const i = pop();
    if (closed[i]) continue;
    closed[i] = 1;
    if (i === t) break;
    const x = i % W, y = (i / W) | 0;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx, ny = y + dy;
        if (nx < 1 || ny < 1 || nx >= W - 1 || ny >= H - 1) continue;
        const j = ny * W + nx;
        if (closed[j]) continue;
        const step = (dx && dy ? 1.414 : 1) * cost(j);
        const ng = g[i] + step;
        if (ng < g[j]) { g[j] = ng; from[j] = i; push(ng + hx(nx, ny), j); }
      }
  }
  if (from[t] < 0 && t !== s) return null;
  const out: [number, number][] = [];
  for (let i = t; i >= 0; i = from[i]) { out.push([i % W, (i / W) | 0]); if (i === s) break; }
  return out.reverse();
};

const distances = (seeds: readonly number[], pass: Pass): Float32Array => {
  const d = new Float32Array(N).fill(Infinity);
  const q: number[] = [];
  for (const i of seeds) if (pass(i) && d[i] === Infinity) { d[i] = 0; q.push(i); }
  for (let h = 0; h < q.length; h++) {
    const i = q[h], x = i % W, y = (i / W) | 0;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const j = ny * W + nx;
        if (!pass(j)) continue;
        const nd = d[i] + (dx && dy ? 1.414 : 1);
        if (nd < d[j]) { if (d[j] === Infinity) q.push(j); d[j] = nd; }
      }
  }
  return d;
};

const OPEN = 0, WALL = 1, SHALLOW = 2, DEEP = 3;
const walkMaskOf = (kind: Uint8Array): Uint8Array => { const m = new Uint8Array(N); for (let i = 0; i < N; i++) m[i] = kind[i] === OPEN || kind[i] === SHALLOW ? 1 : 0; return m; };

const erode = (mask: Uint8Array, r: number, offBoardIs = 0): Uint8Array => {
  const off = discOffsets(r);
  const out = new Uint8Array(N);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let all = 1;
      for (const [dx, dy] of off) {
        const nx = x + dx, ny = y + dy;
        const v = nx < 0 || ny < 0 || nx >= W || ny >= H ? offBoardIs : mask[ny * W + nx];
        if (!v) { all = 0; break; }
      }
      out[y * W + x] = all;
    }
  return out;
};
const dilate = (mask: Uint8Array, r: number): Uint8Array => {
  const off = discOffsets(r);
  const out = new Uint8Array(N);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!mask[y * W + x]) continue;
      for (const [dx, dy] of off) {
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < W && ny < H) out[ny * W + nx] = 1;
      }
    }
  return out;
};

const label = (mask: Uint8Array): { lab: Int32Array; count: number } => {
  const lab = new Int32Array(N);
  let next = 0;
  for (let s = 0; s < N; s++) {
    if (!mask[s] || lab[s]) continue;
    next++;
    const q = [s];
    lab[s] = next;
    for (let h = 0; h < q.length; h++) {
      const i = q[h], x = i % W, y = (i / W) | 0;
      const step = (j: number): void => { if (mask[j] && !lab[j]) { lab[j] = next; q.push(j); } };
      if (x > 0) step(i - 1);
      if (x < W - 1) step(i + 1);
      if (y > 0) step(i - W);
      if (y < H - 1) step(i + W);
    }
  }
  return { lab, count: next };
};

const openKeepingNotches = (mask: Uint8Array, gap: number): { mask: Uint8Array; restored: number } => {
  const r = gap / 2;
  // off the board counts as OPEN, so ground that touches the edge is not
  // read as a gap and silted into a rim
  const opened = dilate(erode(mask, r, 1), r);
  const { lab } = label(opened);
  const out = Uint8Array.from(opened);
  const lb = Int32Array.from(lab);
  let restored = 0;
  for (let ring = 0; ring < 3; ring++) {
    const adds: [number, number][] = [];
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (out[i] || !mask[i]) continue;
        let l = 0, ok = true;
        const look = (j: number): void => { if (!out[j]) return; if (!l) l = lb[j]; else if (lb[j] !== l) ok = false; };
        if (x > 0) look(i - 1);
        if (x < W - 1) look(i + 1);
        if (y > 0) look(i - W);
        if (y < H - 1) look(i + W);
        if (x > 0 && y > 0) look(i - W - 1);
        if (x < W - 1 && y > 0) look(i - W + 1);
        if (x > 0 && y < H - 1) look(i + W - 1);
        if (x < W - 1 && y < H - 1) look(i + W + 1);
        if (l && ok) adds.push([i, l]);
      }
    for (const [i, l] of adds) {
      const x = i % W, y = (i / W) | 0;
      let clash = false;
      for (let dy = -1; dy <= 1 && !clash; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const j = ny * W + nx;
          if (out[j] && lb[j] !== l) { clash = true; break; }
        }
      if (clash) continue;
      out[i] = 1; lb[i] = l; restored++;
    }
  }
  return { mask: out, restored };
};

// ---------- the build ----------

export interface Built {
  floor: Uint8Array;
  wall: Uint8Array;
  blocked: Uint8Array;
  props: Prop[];
  spawns: SpecZone[];
  /** the spawn layer, as cell indices: the ring and the doors, on ground
   *  the core is reachable from with room to spare */
  spawnTiles: number[];
  base: { x: number; y: number };
  core: { x: number; y: number };
  /** the side sites (docs/sites.md), as the marks the document carries */
  marks: MapMark[];
  ruins: number;
  holes: number;
  lumps: number;
  log: string[];
}

export function build(spec: MapSpec): Built {
  const rnd = rng(spec.seed);
  const kind = new Uint8Array(N);
  const log: string[] = [];
  const say = (s: string): void => { log.push(s); };
  const inb = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < W && y < H;
  const edgeDist = (x: number, y: number): number => Math.min(x, y, W - 1 - x, H - 1 - y);
  const routeMinGround = spec.routeMin?.ground ?? ROUTE_MIN_GROUND;

  const rockN = makeWarped(rnd, spec.rock.scale, spec.rock.warp);
  const rockBias: Bias = spec.rock.bias ?? (() => 0);
  // no rim bias: the edge is whatever the noise makes it, so a side can
  // be open ground running off the board as easily as a mountain
  const rockV = new Float32Array(N);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) rockV[y * W + x] = rockN(x, y) + rockBias(x, y);
  let rockT = spec.rock.threshold;
  const capT = rockV.slice().sort()[Math.floor(N * (1 - ROCK_CAP_RAW))];
  if (capT > rockT) { say(`rock capped at ${(ROCK_CAP_RAW * 100).toFixed(0)}%: threshold ${rockT.toFixed(3)} raised to ${capT.toFixed(3)}`); rockT = capT; }
  for (let i = 0; i < N; i++) kind[i] = rockV[i] > rockT ? WALL : OPEN;

  if (spec.water) {
    const wN = makeWarped(rnd, spec.water.scale, spec.water.warp ?? spec.water.scale * 0.4, 3);
    const bias: Bias = spec.water.bias ?? (() => 0);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const h = wN(x, y) + bias(x, y);
        if (kind[y * W + x] === WALL && rockV[y * W + x] > rockT + SEA_ROCK) continue;
        if (h < spec.water.level - spec.water.shore) kind[y * W + x] = DEEP;
        else if (h < spec.water.level) kind[y * W + x] = SHALLOW;
      }
  }

  const roomN = makeNoise(rnd, 2);
  const clearRoom = (cx: number, cy: number, r: number, wobble: number, water: boolean, dry = false): void => {
    disc(cx, cy, r * (1 + wobble), (i, x, y) => {
      const a = Math.atan2(y + 0.5 - cy, x + 0.5 - cx);
      const rr = r * (1 + (roomN(Math.cos(a) * 3 + cx / 50, Math.sin(a) * 3 + cy / 50) - 0.5) * 2 * wobble);
      if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) > rr) return;
      if (water) { if (kind[i] !== DEEP) kind[i] = kind[i] === SHALLOW ? SHALLOW : DEEP; }
      else if (dry) kind[i] = OPEN;
      else if (kind[i] === WALL || kind[i] === DEEP) kind[i] = kind[i] === DEEP ? SHALLOW : OPEN;
    });
  };
  const rooms = spec.rooms.map((r) => ({ ...r }));
  for (const r of rooms) clearRoom(r.x, r.y, r.r, r.wobble ?? 0.32, r.water ?? false, r.dry ?? false);
  const core = { x: spec.core.x, y: spec.core.y };
  const coreR = spec.core.r ?? 11;
  clearRoom(core.x, core.y, coreR, 0.2, false, true);
  for (const z of spec.spawns) {
    if (z.zone === "ground") clearRoom(z.x, z.y, z.r + 3, 0.2, false);
    if (z.zone === "water") clearRoom(z.x, z.y, z.r + 3, 0.15, true);
  }

  const wanderN = makeNoise(rnd, 2);
  const point = (ref: RoutePoint): { x: number; y: number } => {
    if (ref === "core") return core;
    if (typeof ref === "number") return rooms[ref];
    if (ref.startsWith("spawn:")) return spec.spawns[+ref.slice(6)];
    throw new Error(`unknown route point ${ref}`);
  };
  const centres: [number, number][] = [];
  const brushN = makeNoise(rnd, 2);
  const carve = (a: { x: number; y: number }, b: { x: number; y: number }, width: [number, number], layer: "ground" | "water" = "ground"): number => {
    const cost = layer === "ground"
      ? (i: number) => (kind[i] === OPEN ? 1 : kind[i] === SHALLOW ? 1.5 : kind[i] === WALL ? 9 : 40)
          + (edgeDist(i % W, (i / W) | 0) < 12 * SCALE ? 30 : 0) + wanderN((i % W) / (9 * SCALE), ((i / W) | 0) / (9 * SCALE)) * 4
      : (i: number) => (kind[i] === DEEP ? 1 : kind[i] === SHALLOW ? 1.2 : 25)
          + (edgeDist(i % W, (i / W) | 0) < 10 * SCALE ? 30 : 0) + wanderN((i % W) / (14 * SCALE), ((i / W) | 0) / (14 * SCALE)) * 70;
    const path = astar(Math.round(a.x), Math.round(a.y), Math.round(b.x), Math.round(b.y), cost);
    if (!path) throw new Error(`no route from (${a.x},${a.y}) to (${b.x},${b.y})`);
    const [w0, w1] = width;
    path.forEach(([x, y], k) => {
      const t = brushN(k / (22 * SCALE), layer === "ground" ? 0.5 : 7.5);
      const r = (w0 + (w1 - w0) * Math.min(1, Math.max(0, (t - 0.3) / 0.4))) / 2;
      centres.push([x, y]);
      disc(x + 0.5, y + 0.5, r, (i) => {
        if (layer === "ground") { if (kind[i] === WALL) kind[i] = OPEN; else if (kind[i] === DEEP) kind[i] = SHALLOW; }
        else { if (kind[i] !== DEEP) kind[i] = kind[i] === SHALLOW ? SHALLOW : DEEP; }
      });
    });
    return path.length;
  };
  const routes: { spawn: number; len: number }[] = [];
  for (const layer of ["water", "ground"] as const) {
    for (const r of spec.routes) {
      if ((r.layer ?? "ground") !== layer) continue;
      const pts = [point(`spawn:${r.spawn}`), ...(r.via ?? []).map(point), point(r.to ?? "core")];
      let len = 0;
      for (let k = 1; k < pts.length; k++) len += carve(pts[k - 1], pts[k], r.width, layer);
      routes.push({ spawn: r.spawn, len });
    }
    for (const l of spec.links ?? [])
      if ((l.layer ?? "ground") === layer) carve(point(l.rooms[0]), point(l.rooms[1]), l.width, layer);
  }
  say(`routes: ${routes.map((r) => `spawn ${r.spawn} ${r.len} cells`).join(", ")}`);

  const f = spec.funnel;
  const gateAng = f ? Math.atan2(f.y - core.y, f.x - core.x) : 0;
  const offLine = (x: number, y: number): number => Math.abs(-(x + 0.5 - core.x) * Math.sin(gateAng) + (y + 0.5 - core.y) * Math.cos(gateAng));
  for (const c of spec.chokes ?? []) {
    const straight = !!f && Math.hypot(c.x - f.x, c.y - f.y) < 4 * SCALE;
    const near = centres.filter(([x, y]) => Math.hypot(x - c.x, y - c.y) <= c.reach + 4);
    disc(c.x, c.y, c.reach, (i, x, y) => {
      if (straight && kind[i] === WALL && offLine(x, y) <= c.w / 2) { kind[i] = OPEN; return; }
      if (kind[i] !== OPEN && kind[i] !== SHALLOW) return;
      let d = Infinity;
      if (straight) d = offLine(x, y);
      else for (const [px, py] of near) d = Math.min(d, Math.hypot(px - x, py - y));
      if (d > c.w / 2) kind[i] = WALL;
    });
  }

  const dN1 = makeNoise(rnd, 2), dN2 = makeNoise(rnd, 2);
  const amp = spec.distort ?? 3;
  const warped = new Uint8Array(N);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const sx = Math.round(x + (dN1(x / 11, y / 11) - 0.5) * 2 * amp);
      const sy = Math.round(y + (dN2(x / 11, y / 11) - 0.5) * 2 * amp);
      warped[y * W + x] = kind[Math.max(0, Math.min(H - 1, sy)) * W + Math.max(0, Math.min(W - 1, sx))];
    }
  kind.set(warped);
  const bayN = makeNoise(rnd, 2);
  const bayT = spec.bays ?? 0.56;
  {
    const near = dilate(walkMaskOf(kind), 3.5 * SCALE);
    for (let y = 2; y < H - 2; y++)
      for (let x = 2; x < W - 2; x++) {
        const i = y * W + x;
        if (kind[i] !== WALL || !near[i] || edgeDist(x, y) < 6) continue;
        if (bayN(x / (6.5 * SCALE), y / (6.5 * SCALE)) > bayT) kind[i] = OPEN;
      }
  }
  for (let pass = 0; pass < 2; pass++) {
    const next = Uint8Array.from(kind);
    for (let y = 1; y < H - 1; y++)
      for (let x = 1; x < W - 1; x++) {
        const i = y * W + x;
        if (kind[i] === DEEP || kind[i] === SHALLOW) continue;
        let n = 0;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) if (kind[i + dy * W + dx] === WALL) n++;
        next[i] = n >= 5 ? WALL : OPEN;
      }
    kind.set(next);
  }

  const isWalk: Pass = (i) => kind[i] === OPEN || kind[i] === SHALLOW;
  const isRock: Pass = (i) => kind[i] === WALL;
  const isWater: Pass = (i) => kind[i] === DEEP || kind[i] === SHALLOW;
  let lumps = 0;
  if (spec.lumps) {
    const clear = clearance(isWalk);
    for (let tries = 0; lumps < spec.lumps && tries < spec.lumps * 60; tries++) {
      const x = (rnd() * W) | 0, y = (rnd() * H) | 0, i = y * W + x;
      const lumpGap = routeMinGround + 2;
      if (!isWalk(i) || clear[i] < lumpGap + 1.5) continue;
      if (Math.hypot(x - core.x, y - core.y) < 20 * SCALE) continue;
      if (spec.spawns.some((z) => Math.hypot(x - z.x, y - z.y) < z.r + 8)) continue;
      const r = Math.min(4 * SCALE, clear[i] - lumpGap), rx = r * (0.7 + rnd() * 0.6), ry = r * (0.7 + rnd() * 0.6);
      disc(x + 0.5, y + 0.5, Math.max(rx, ry) + 1, (j, px, py) => {
        const u = (px - x) / rx, v = (py - y) / ry;
        if (u * u + v * v <= 1 + (rnd() - 0.5) * 0.5 && kind[j] === OPEN) kind[j] = WALL;
      });
      lumps++;
    }
  }

  const walk0 = new Uint8Array(N);
  for (let i = 0; i < N; i++) walk0[i] = isWalk(i) ? 1 : 0;
  const og = openKeepingNotches(walk0, GAP_GROUND);
  let silted = 0;
  for (let i = 0; i < N; i++) if (walk0[i] && !og.mask[i]) { kind[i] = kind[i] === SHALLOW ? DEEP : WALL; silted++; }
  let siltedSea = 0;
  if (spec.water) {
    const wet0 = new Uint8Array(N);
    for (let i = 0; i < N; i++) wet0[i] = kind[i] === DEEP || kind[i] === SHALLOW ? 1 : 0;
    const ow = openKeepingNotches(wet0, GAP_WATER);
    for (let i = 0; i < N; i++) if (kind[i] === DEEP && !ow.mask[i]) { kind[i] = WALL; siltedSea++; }
  }
  say(`gap ${GAP_GROUND}/${GAP_WATER}: silted ${silted} ground cells (${og.restored} notches kept), ${siltedSea} sea cells`);

  for (let y = core.y + CORE_LO; y <= core.y + CORE_HI; y++)
    for (let x = core.x + CORE_LO; x <= core.x + CORE_HI; x++) kind[y * W + x] = OPEN;
  disc(core.x, core.y, CORE * 0.9, (i) => { if (kind[i] === WALL) kind[i] = OPEN; if (kind[i] === DEEP) kind[i] = SHALLOW; });

  const seenG = flood([core.y * W + core.x], isWalk);
  let filled = 0;
  for (let i = 0; i < N; i++) if (isWalk(i) && !seenG[i]) { kind[i] = kind[i] === SHALLOW ? DEEP : WALL; filled++; }
  say(`filled ${filled} unreachable cells, dropped ${lumps} lumps`);

  const waterZones = spec.spawns.filter((z) => z.zone === "water");
  // EVERY WATER THAT IS NOT THE SEA IS DRAINED — a lake the hulls cannot
  // reach is a pocket a hull could be dropped in with nowhere to sail
  const drainPonds = (): number => {
    if (!waterZones.length) return 0;
    const wetM = new Uint8Array(N);
    for (let i = 0; i < N; i++) wetM[i] = isWater(i) ? 1 : 0;
    const { lab } = label(wetM);
    const seaLabels = new Set<number>();
    for (const z of waterZones) disc(z.x, z.y, z.r, (i) => { if (lab[i]) seaLabels.add(lab[i]); });
    if (seaLabels.size !== 1)
      throw new Error(`the water zones sit in ${seaLabels.size} separate waters — they must share one sea`);
    const sea = [...seaLabels][0];
    const dCore = (i: number): number => Math.hypot((i % W) + 0.5 - core.x, ((i / W) | 0) + 0.5 - core.y);
    let seaD = Infinity;
    for (let i = 0; i < N; i++) if (lab[i] === sea) seaD = Math.min(seaD, dCore(i));
    const size = new Map<number, number>(), nearest = new Map<number, number>();
    for (let i = 0; i < N; i++) if (lab[i] && lab[i] !== sea) {
      size.set(lab[i], (size.get(lab[i]) ?? 0) + 1);
      nearest.set(lab[i], Math.min(nearest.get(lab[i]) ?? Infinity, dCore(i)));
    }
    for (const [l, n] of size) if (n > 500 && (nearest.get(l) ?? Infinity) < seaD) throw new Error(`a lake of ${n} cells lies nearer the core than the sea (${seaD.toFixed(0)} cells)`);
    let drained = 0;
    for (let i = 0; i < N; i++) if (lab[i] && lab[i] !== sea) { kind[i] = kind[i] === SHALLOW ? OPEN : WALL; drained++; }
    return drained;
  };
  const drained = drainPonds();
  if (drained) say(`drained ${drained} cells of water off the sea`);

  const walkMask = (): Uint8Array => { const m = new Uint8Array(N); for (let i = 0; i < N; i++) m[i] = isWalk(i) ? 1 : 0; return m; };
  const groundPads = (z: SpecZone): number[] => { const out: number[] = []; disc(z.x, z.y, z.r, (i) => { if (isWalk(i)) out.push(i); }); return out; };
  const groundZones = spec.spawns.filter((z) => z.zone === "ground");
  const coreCells = (): number[] => { const out: number[] = []; for (let y = core.y + CORE_LO; y <= core.y + CORE_HI; y++) for (let x = core.x + CORE_LO; x <= core.x + CORE_HI; x++) out.push(y * W + x); return out; };
  const walkFrom = (): number[] => {
    const d = distances(coreCells(), isWalk);
    return groundZones.map((z) => Math.min(...groundPads(z).map((i) => d[i])));
  };
  let holes = 0;
  if (spec.holes) {
    const before = walkFrom();
    const cand: [number, number][] = [];
    const m = walkMask();
    for (let y = 8; y < H - 8; y++)
      for (let x = 8; x < W - 8; x++) {
        const i = y * W + x;
        if (kind[i] !== WALL) continue;
        for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
          let a = 0, b = 0;
          for (let k = 1; k <= 4; k++) { if (m[(y + dy * k) * W + x + dx * k]) { a = k; break; } }
          for (let k = 1; k <= 4; k++) { if (m[(y - dy * k) * W + x - dx * k]) { b = k; break; } }
          if (a && b && a + b <= 6) { cand.push([x, y]); break; }
        }
      }
    for (let k = cand.length - 1; k > 0; k--) { const j = (rnd() * (k + 1)) | 0; [cand[k], cand[j]] = [cand[j], cand[k]]; }
    const done: [number, number][] = [];
    for (const [x, y] of cand) {
      if (holes >= spec.holes) break;
      if (done.some(([px, py]) => Math.hypot(px - x, py - y) < 24 * SCALE)) continue;
      if (Math.hypot(x - core.x, y - core.y) < 24 * SCALE) continue;
      const saved = Uint8Array.from(kind);
      disc(x + 0.5, y + 0.5, GAP_GROUND / 2 + 0.6, (i) => { if (kind[i] === WALL) kind[i] = OPEN; });
      const after = walkFrom();
      const ok = after.every((v, k) => v >= before[k] * 0.85);
      if (!ok) { kind.set(saved); continue; }
      done.push([x, y]);
      holes++;
    }
  }
  say(`punched ${holes} holes`);
  for (const z of spec.spawns) {
    if (z.zone === "ground") disc(z.x, z.y, z.r + 1, (i) => { if (kind[i] === WALL) kind[i] = OPEN; else if (kind[i] === DEEP) kind[i] = SHALLOW; });
    if (z.zone === "water") disc(z.x, z.y, z.r + 1, (i) => { if (kind[i] !== DEEP && kind[i] !== SHALLOW) kind[i] = DEEP; });
  }
  // THE SEAL: every pond off the sea drained, and every walkable cell the
  // core cannot reach turned to rock — nothing may be dropped where it
  // cannot leave
  const sealWalk = (): number[] => {
    const seen = flood([core.y * W + core.x], isWalk);
    const out: number[] = [];
    for (let i = 0; i < N; i++) if (isWalk(i) && !seen[i]) { kind[i] = kind[i] === SHALLOW ? DEEP : WALL; out.push(i); }
    return out;
  };
  {
    const d2 = drainPonds();
    const sealed = sealWalk();
    say(`sealed ${sealed.length} pocket cells, drained ${d2} more`);
  }

  // ---------- paint ----------
  const floor = new Uint8Array(N), wall = new Uint8Array(N), blocked = new Uint8Array(N);
  const dRock = clearance((i) => !isRock(i));
  const dWater = clearance((i) => !isWater(i));
  const variant = (first: number, n = 3): number => first + ((rnd() * n) | 0);

  const famN = makeWarped(rnd, spec.floors.scale ?? 48, spec.floors.warp ?? 12, 3);
  const famV = new Float32Array(N);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) famV[y * W + x] = famN(x, y);
  const sorted = Float32Array.from(famV).sort();
  const cutInto = (list: readonly { weight: number }[]): Uint8Array => {
    const total = list.reduce((a, f) => a + f.weight, 0), cuts: number[] = [];
    let acc = 0;
    for (let k = 0; k < list.length - 1; k++) { acc += list[k].weight / total; cuts.push(sorted[Math.min(N - 1, Math.floor(acc * N))]); }
    const out = new Uint8Array(N);
    for (let i = 0; i < N; i++) { let k = 0; while (k < cuts.length && famV[i] >= cuts[k]) k++; out[i] = k; }
    return out;
  };
  const fams = spec.floors.families;
  const fam = cutInto(fams);
  // THE BLENDS: each further biome takes `amount` of the board where a
  // slow noise of its own runs high, a later one over an earlier, and
  // across the band round each cut the two interfinger on a fine noise
  // instead of meeting at a line. `sec` is a cell's biome: 0 the first
  const bls = spec.blends ?? [];
  const sec = new Uint8Array(N);
  const famB = bls.map((b) => cutInto(b.families));
  bls.forEach((b, n) => {
    const bN = makeWarped(rnd, 110, 24, 2), hN = makeNoise(rnd, 2);
    const bv = new Float32Array(N);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) bv[y * W + x] = bN(x, y);
    const cut = Float32Array.from(bv).sort()[Math.min(N - 1, Math.floor((1 - b.amount) * N))];
    const band = 0.07;
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const i = y * W + x, u = Math.max(0, Math.min(1, (bv[i] - (cut - band)) / (2 * band)));
        if (hN(x / 5, y / 5) < u * u * (3 - 2 * u)) sec[i] = n + 1;
      }
  });
  const famAt = (i: number): { floor: number; wall: number } => (sec[i] ? bls[sec[i] - 1].families[famB[sec[i] - 1][i]] : fams[fam[i]]);
  const groundAt = (i: number): Ground => (sec[i] ? bls[sec[i] - 1] : spec);
  const shallowF = spec.water?.shallow ?? FLOOR_SHALLOW_WATER, deepF = spec.water?.deep ?? FLOOR_DEEP_WATER;
  const flatN = makeNoise(rnd, 2);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x, fm = famAt(i), g = groundAt(i);
      if (kind[i] === DEEP) { floor[i] = deepF; wall[i] = WALL_DEEP; blocked[i] = 1; continue; }
      if (kind[i] === SHALLOW) { floor[i] = shallowF; continue; }
      let fl = fm.floor;
      if (g.beach && dWater[i] <= g.beach.depth + (flatN(x / 6, y / 6) - 0.5) * 2) fl = g.beach.floor;
      else if (g.flats && !isRock(i) && dRock[i] >= g.flats.clear + (flatN(x / 14, y / 14) - 0.5) * 6) fl = g.flats.floor;
      floor[i] = variant(fl);
      if (isRock(i)) {
        blocked[i] = 1;
        const wf = g.beach && dWater[i] <= g.beach.depth + 1 && g.beach.wall != null ? g.beach.wall : fm.wall;
        wall[i] = variant(wf, 2);
      }
    }

  const ruins: { cx: number; cy: number }[] = [];
  if (spec.ruins) {
    const clear = clearance((i) => !isRock(i) && !isWater(i));
    for (let tries = 0; ruins.length < spec.ruins && tries < 400; tries++) {
      const rw = 5 * SCALE + ((rnd() * 6 * SCALE) | 0), rh = 5 * SCALE + ((rnd() * 6 * SCALE) | 0);
      const x0 = 12 + ((rnd() * (W - 24 - rw)) | 0), y0 = 12 + ((rnd() * (H - 24 - rh)) | 0);
      const cx = x0 + rw / 2, cy = y0 + rh / 2;
      if (clear[Math.round(cy) * W + Math.round(cx)] < Math.hypot(rw, rh) / 2 + routeMinGround) continue;
      if (Math.hypot(cx - core.x, cy - core.y) < 24 * SCALE) continue;
      if (spec.spawns.some((z) => Math.hypot(cx - z.x, cy - z.y) < z.r + 14)) continue;
      if (ruins.some((r) => Math.abs(r.cx - cx) < 30 * SCALE && Math.abs(r.cy - cy) < 30 * SCALE)) continue;
      for (let y = y0; y < y0 + rh; y++)
        for (let x = x0; x < x0 + rw; x++) {
          const i = y * W + x;
          if (isRock(i) || isWater(i)) continue;
          floor[i] = variant(FLOOR_BASALT);
          const edge = x === x0 || y === y0 || x === x0 + rw - 1 || y === y0 + rh - 1;
          if (edge && rnd() < 0.62) { blocked[i] = 1; wall[i] = variant(WALL_DARK, 2); kind[i] = WALL; }
        }
      ruins.push({ cx, cy });
    }
    // a ruin's wall can close a pocket the seal already passed
    for (const i of sealWalk()) { blocked[i] = 1; wall[i] = variant(famAt(i).wall, 2); }
  }

  // ---------- props (docs/props.md) ----------
  const props: Prop[] = [];
  const marks: MapMark[] = [];
  const pp = spec.props;
  const claim = new Uint8Array(N);
  // the ground a body GAP_GROUND wide could cross before the props, and
  // how far it is from the core over that ground: the way a room was
  // reached, kept so a prop that shuts it can be found and lifted
  const wideBefore = dilate(erode(walkMask(), GAP_GROUND / 2, 1), GAP_GROUND / 2);
  const dWideBefore = distances(coreCells(), (i) => wideBefore[i] === 1);
  const stand = (x0: number, y0: number, k: number, tone: number, rot = rollRot(k, rnd())): void => {
    const t = PROP_KINDS[k].tiles;
    for (let y = y0; y < y0 + t; y++)
      for (let x = x0; x < x0 + t; x++) {
        const i = y * W + x;
        blocked[i] = 1; wall[i] = WALL_PROP; kind[i] = WALL; claim[i] = 1;
      }
    props.push({ x: x0, y: y0, kind: k, tone, rot });
  };
  const fits = (x0: number, y0: number, t: number, ok: Pass): boolean => {
    if (x0 < 1 || y0 < 1 || x0 + t > W - 1 || y0 + t > H - 1) return false;
    for (let y = y0; y < y0 + t; y++)
      for (let x = x0; x < x0 + t; x++) { const i = y * W + x; if (claim[i] || !ok(i)) return false; }
    return true;
  };
  const pick = <T>(a: readonly T[]): T => a[(rnd() * a.length) | 0];
  const bySize = (names: readonly string[]): Map<number, number[]> => {
    const out = new Map<number, number[]>();
    for (const n of names) { const k = propKind(n); const t = PROP_KINDS[k].tiles; out.set(t, [...(out.get(t) ?? []), k]); }
    return out;
  };
  if (pp) {
    const rockToneAt = (i: number): number => {
      const g = groundAt(i);
      const wf = g.beach && dWater[i] <= g.beach.depth + 1 && g.beach.wall != null ? g.beach.wall : famAt(i).wall;
      return rockTone(WALL_GROUP_KINDS[WALL_GROUP[wf]]);
    };
    // the tables a biome's props are drawn from, one a biome; each cell reads its own
    const tablesOf = (p: PropSpec) => {
      const canopyTone = (): number => (rnd() < 0.75 ? p.canopy[0] : pick(p.canopy));
      const toneFor = (k: number, i: number): number => {
        const def = PROP_KINDS[k];
        if (!def.tinted) return p.weather;
        return def.tones.includes(p.canopy[0]) ? canopyTone() : def.tones.includes(p.wood) && def.tones.length <= 2 ? p.wood : rockToneAt(i);
      };
      return { pp: p, flora: bySize(p.flora), stones: bySize(p.stones), canopyTone, toneFor };
    };
    const Ts = [tablesOf(pp), ...bls.map((b) => tablesOf(b.props))];
    const tab = (i: number) => Ts[sec[i]];
    const { flora, canopyTone } = Ts[0];

    // THE FRINGE FOREST: rock beside the forest floors, the noise's own
    // shape and the biome's depth in, grown over — oaks where three cells
    // square of it are free, trees where two, shrubs on the rest. It was
    // rock, so no lane is the narrower for it
    if (spec.forest || bls.some((b) => b.forest)) {
      const fN = makeWarped(rnd, 26 * SCALE, 8 * SCALE, 2);
      const on = [spec, ...bls].map((g) => new Set(g.forest?.on ?? []));
      const fringe = on.map(() => new Uint8Array(N));
      for (let y = 1; y < H - 1; y++)
        for (let x = 1; x < W - 1; x++) {
          const i = y * W + x, s = sec[i], fo = groundAt(i).forest;
          if (!fo || !isRock(i) || wall[i] === WALL_PROP || !on[s].has(famAt(i).floor) || dWater[i] < 2) continue;
          if (fN(x, y) < fo.threshold || dRock[i] > 0) continue;
          let dOpen = 99;
          for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) { const nx = x + dx, ny = y + dy; if (inb(nx, ny) && !isRock(ny * W + nx)) dOpen = Math.min(dOpen, Math.hypot(dx, dy)); }
          if (dOpen > fo.depth) continue;
          fringe[s][i] = 1;
        }
      for (let s = 0; s < fringe.length; s++) {
        const tb = Ts[s];
        const kinds = [3, 2, 1].flatMap((t) => (tb.flora.get(t) ?? []).map((k) => ({ tiles: t, kind: k })));
        if (kinds.length)
          for (const f of forestOf(fringe[s], () => tb.canopyTone(), spec.seed ^ (0x5f0d + s), kinds)) stand(f.x, f.y, f.kind, f.tone, f.rot);
      }
    }
    // the fringe stood on rock; everything after it stands on open ground
    const fringeEnd = props.length;

    // WHAT A PROP MAY NOT STAND ON: the core's yard, every door's apron,
    // each ground door's shortest walk, and along the widest way from each
    // door a lane as wide as the checks want — so the board the checks
    // passed is the board they pass again with the props on it
    const keep = new Uint8Array(N);
    disc(core.x, core.y, 11 * SCALE, (i) => { keep[i] = 1; });
    for (const z of spec.spawns) disc(z.x, z.y, z.r + 6, (i) => { keep[i] = 1; });
    const descend = (start: number, d: Float32Array, pass: Pass): number[] => {
      const out: number[] = [];
      let i = start;
      for (let n = 0; n < N && d[i] > 0; n++) {
        out.push(i);
        const x = i % W, y = (i / W) | 0;
        let best = i, bd = d[i];
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx, ny = y + dy;
            if (!inb(nx, ny)) continue;
            const j = ny * W + nx;
            if (pass(j) && d[j] < bd) { bd = d[j]; best = j; }
          }
        if (best === i) break;
        i = best;
      }
      out.push(i);
      return out;
    };
    const lane = (cells: readonly number[], r: number): void => {
      for (const i of cells) disc((i % W) + 0.5, ((i / W) | 0) + 0.5, r, (j) => { keep[j] = 1; });
    };
    const cc = coreCells();
    const dWalk = distances(cc, isWalk);
    const half = (routeMinGround - 1) / 2;
    const dG = clearance(isWalk);
    const wide: Pass = (i) => dG[i] >= half;
    const dWide = distances(cc.filter(wide), wide);
    for (const z of groundZones) {
      const pads = groundPads(z);
      let best = -1, bd = Infinity;
      for (const i of pads) if (dWalk[i] < bd) { bd = dWalk[i]; best = i; }
      if (best >= 0) lane(descend(best, dWalk, isWalk), 3);
      best = -1; bd = Infinity;
      for (const i of pads) if (wide(i) && dWide[i] < bd) { bd = dWide[i]; best = i; }
      if (best >= 0) lane(descend(best, dWide, wide), half + 1.5);
    }
    const open: Pass = (i) => kind[i] === OPEN && !keep[i];
    const reach = (): number => { const seen = flood(cc, isWalk); let n = 0; for (let i = 0; i < N; i++) n += seen[i]; return n; };

    // THE SITES: a wreck, a dead walker, a bunker, with its litter round it.
    // One that would wall off a room — the ground the core reaches
    // shrinking by more than what was stood on it — is taken up again
    const sites: [number, number][] = [];
    const want = pp.siteCount[0] + ((rnd() * (pp.siteCount[1] - pp.siteCount[0] + 1)) | 0);
    for (let tries = 0; sites.length < want && tries < 400; tries++) {
      const k = propKind(pick(pp.sites)), t = PROP_KINDS[k].tiles;
      const x0 = 6 + ((rnd() * (W - 12 - t)) | 0), y0 = 6 + ((rnd() * (H - 12 - t)) | 0);
      if (!fits(x0, y0, t, open)) continue;
      if (sites.some(([sx, sy]) => Math.hypot(sx - x0, sy - y0) < 24 * SCALE)) continue;
      const before = reach(), from = props.length;
      let placed = t * t;
      stand(x0, y0, k, pp.weather);
      const n = 3 + ((rnd() * 5) | 0);
      for (let m = 0, tr = 0; m < n && tr < 40; tr++) {
        const lk = propKind(pick(pp.litter)), lt = PROP_KINDS[lk].tiles;
        const a = rnd() * 6.28, d = t / 2 + 2 + rnd() * 9;
        const lx = Math.round(x0 + t / 2 + Math.cos(a) * d - lt / 2), ly = Math.round(y0 + t / 2 + Math.sin(a) * d - lt / 2);
        if (!fits(lx, ly, lt, open)) continue;
        stand(lx, ly, lk, pp.weather);
        placed += lt * lt;
        m++;
      }
      if (before - reach() > placed + 6) {
        for (const q of props.splice(from)) {
          const qt = PROP_KINDS[q.kind].tiles;
          for (let y = q.y; y < q.y + qt; y++)
            for (let x = q.x; x < q.x + qt; x++) { const i = y * W + x; blocked[i] = 0; wall[i] = 0; kind[i] = OPEN; claim[i] = 0; }
        }
        continue;
      }
      sites.push([x0, y0]);
    }

    // THE GROWTH AND THE STONES: over every open cell in a random order,
    // thick where the growth noise is high and along the rock, the big
    // kinds in the thick of it and the small ones at its edge
    const gN = makeNoise(rnd, 2);
    const gs = 9 * SCALE;
    const dOpen = clearance((i) => kind[i] === OPEN);
    const order = new Int32Array(N);
    let no = 0;
    for (let i = 0; i < N; i++) if (open(i) && !claim[i]) order[no++] = i;
    for (let k = no - 1; k > 0; k--) { const j = (rnd() * (k + 1)) | 0; const t = order[k]; order[k] = order[j]; order[j] = t; }
    const tryStand = (i: number, table: Map<number, number[]>, wantT: number, tone: (k: number) => number, ok: Pass = open): boolean => {
      const x = i % W, y = (i / W) | 0;
      for (let t = wantT; t >= 1; t--) {
        const kinds = table.get(t);
        if (!kinds) continue;
        const k = pick(kinds), off = (t - 1) >> 1;
        if (fits(x - off, y - off, t, ok)) { stand(x - off, y - off, k, tone(k)); return true; }
        // a big one may lie to any side of the cell instead: centred on a
        // cell hugging the rock it never fits, and that is where stones go
        if (t >= 6)
          for (const [ax, ay] of [[x, y], [x - t + 1, y], [x, y - t + 1], [x - t + 1, y - t + 1]] as const)
            if (fits(ax, ay, t, ok)) { stand(ax, ay, k, tone(k)); return true; }
      }
      return false;
    };
    for (let n = 0; n < no; n++) {
      const i = order[n];
      if (claim[i]) continue;
      const x = i % W, y = (i / W) | 0;
      const g = gN(x / gs, y / gs);
      const hug = dOpen[i] <= 2.5, tb = tab(i);
      const thick = g > 0.6, some = g > 0.5;
      const pg = tb.pp.growth * (thick ? 0.28 : some ? 0.07 : 0.003) * (hug ? 1.8 : 1);
      if (rnd() < pg) {
        // the big ones are rare, the ten-tile one rarest, and each falls
        // back to the next size down where it does not fit (tryStand)
        const r = rnd();
        const wantT = thick ? (r < 0.015 ? 10 : r < 0.04 ? 6 : r < 0.15 ? 4 : r < 0.45 ? 3 : 2) : some ? (r < 0.45 ? 2 : 1) : 1;
        tryStand(i, tb.flora, wantT, (k) => tb.toneFor(k, i));
        continue;
      }
      const ps = tb.pp.stone * (hug ? 0.05 : 0.001);
      if (rnd() < ps) {
        const r = rnd();
        const wantT = hug ? (r < 0.005 ? 10 : r < 0.025 ? 6 : r < 0.27 ? 3 : r < 0.5 ? 2 : 1) : 1;
        tryStand(i, tb.stones, wantT, () => rockToneAt(i));
      }
    }

    // THE SHORE: the water within two cells of land — dry ground or a
    // cliff foot — and the dry ground a cell off the water take the
    // water's-edge kinds (spec shore), off the routes. The growing kinds
    // stand on deep water too (pads and reeds off a bank); the wood and
    // the stones only on the shallows and the ground. A bed on the water
    // blocks like any other prop, and deep water was blocked already
    if ([pp, ...bls.map((b) => b.props)].some((p) => p.shore?.length)) {
      const grows = (n: string): boolean => PROP_KINDS[propKind(n)].tones.includes(TONE.pine);
      const shoreOf = (p: PropSpec) => { const sh = p.shore ?? []; return { all: bySize(sh), wet: bySize(sh.filter(grows)), dry: bySize(sh.filter((n) => !grows(n))) }; };
      const Ss = [shoreOf(pp), ...bls.map((b) => shoreOf(b.props))];
      const dLand = clearance((i) => isWater(i));
      const dWet = clearance((i) => !isWater(i));
      const shoreCell = (i: number): boolean =>
        (isWater(i) && dLand[i] <= 2) || (kind[i] === OPEN && dWet[i] <= 1.5);
      const shoreOk: Pass = (i) => (isWater(i) || kind[i] === OPEN) && !keep[i];
      const band: number[] = [];
      for (let i = 0; i < N; i++) if (shoreCell(i) && !keep[i] && !claim[i]) band.push(i);
      for (let k = band.length - 1; k > 0; k--) { const j = (rnd() * (k + 1)) | 0; const t = band[k]; band[k] = band[j]; band[j] = t; }
      let shore = 0;
      for (const i of band) {
        if (claim[i] || rnd() > (isWater(i) ? 0.1 : 0.06)) continue;
        const sh = Ss[sec[i]];
        const table = kind[i] === DEEP ? sh.wet : kind[i] === OPEN && sh.dry.size ? sh.dry : sh.all;
        if (!table.size) continue;
        const wantT = isWater(i) && rnd() < 0.35 ? 2 : 1;
        if (tryStand(i, table, wantT, (k) => tab(i).toneFor(k, i), shoreOk)) shore++;
      }
      say(`shore props: ${shore} of ${band.length} shore cells`);
    }

    /** the kind a cell had under a lifted prop: its floor remembers the water */
    const wasWater = (f: number): number => {
      const base = f - (f % 3);
      return base === FLOOR_DEEP_WATER || base === FLOOR_DEEP_TAINTED_WATER ? DEEP : WATER_FLOORS.includes(base) ? SHALLOW : OPEN;
    };

    // NO ROOM IS LEFT TO THE SMALL BODIES ONLY. Every room was reachable by
    // a body GAP_GROUND wide before the props; one that is not any more
    // was shut by them, so the way it was reached is walked back and the
    // props standing on it, or within a gap's width of it (the reach of
    // the opening), are lifted. A pocket too small to be a room is left
    // as the thicket it is
    {
      const ROOM = 60;
      let lifted = 0;
      for (let round = 0; round < 4; round++) {
        const m = walkMask();
        const wide = dilate(erode(m, GAP_GROUND / 2, 1), GAP_GROUND / 2);
        const { lab } = label(wide);
        const coreL = lab[core.y * W + core.x];
        const size = new Map<number, number>(), start = new Map<number, number>();
        for (let i = 0; i < N; i++) {
          const l = lab[i];
          if (!l || l === coreL) continue;
          size.set(l, (size.get(l) ?? 0) + 1);
          const s0 = start.get(l);
          if (dWideBefore[i] < (s0 === undefined ? Infinity : dWideBefore[s0])) start.set(l, i);
        }
        const near = new Uint8Array(N);
        let rooms = 0;
        for (const [l, n] of size) {
          const s0 = start.get(l);
          if (n < ROOM || s0 === undefined || dWideBefore[s0] === Infinity) continue;
          rooms++;
          // the pinch is where the way stops being wide, or where two wide
          // pieces meet only at a corner (the way is 8-connected, a body is not)
          const path = descend(s0, dWideBefore, (j) => wideBefore[j] === 1);
          const mark = (i: number): void => disc((i % W) + 0.5, ((i / W) | 0) + 0.5, GAP_GROUND, (j) => { near[j] = 1; });
          for (let k = 0; k < path.length; k++) {
            const i = path[k];
            if (!m[i] || !wide[i]) mark(i);
            else if (k > 0 && lab[path[k - 1]] !== lab[i]) { mark(i); mark(path[k - 1]); }
          }
        }
        if (!rooms) break;
        let took = 0;
        for (let k = props.length - 1; k >= fringeEnd; k--) {
          const q = props[k], qt = PROP_KINDS[q.kind].tiles;
          let hit = false;
          for (let y = q.y; y < q.y + qt && !hit; y++) for (let x = q.x; x < q.x + qt; x++) if (near[y * W + x]) { hit = true; break; }
          if (!hit) continue;
          for (let y = q.y; y < q.y + qt; y++)
            for (let x = q.x; x < q.x + qt; x++) { const i = y * W + x; blocked[i] = 0; wall[i] = 0; kind[i] = wasWater(floor[i]); claim[i] = 0; }
          props.splice(k, 1);
          took++;
        }
        lifted += took;
        if (!took) break;
      }
      say(`rooms reopened: ${lifted} props lifted`);
    }

    // a pocket the props closed is grown over rather than turned to rock:
    // a shrub between two trees is a thicket, a rock cell between them a hole
    {
      const seen = flood(cc, isWalk);
      const pocket = new Uint8Array(N);
      let any = false;
      for (let i = 0; i < N; i++) if (isWalk(i) && !seen[i]) { pocket[i] = 1; any = true; }
      const kinds = [2, 1].flatMap((t) => (flora.get(t) ?? []).map((k) => ({ tiles: t, kind: k })));
      if (any && kinds.length)
        for (const f of forestOf(pocket, () => canopyTone(), spec.seed ^ 0x77, kinds)) {
          if (kind[f.y * W + f.x] === SHALLOW) continue;
          stand(f.x, f.y, f.kind, f.tone, f.rot);
        }
      // ...and a wet pocket, or one the flora could not take, is sealed as before
      for (const i of sealWalk()) { blocked[i] = 1; wall[i] = variant(famAt(i).wall, 2); }
    }
    // ...AND THE HILLS: over every rock cell in a random order, the same
    // flora and stones at a fraction of the ground's density. The rock
    // stays rock under them — only the claim and the prop are written —
    // so nothing here opens a hill, and it comes after the room pass so
    // nothing lifts one
    {
      const rock: Pass = (i) => kind[i] === WALL && wall[i] !== WALL_PROP && blocked[i] === 1;
      const standOnRock = (x0: number, y0: number, k: number, tone: number): void => {
        const t = PROP_KINDS[k].tiles;
        for (let y = y0; y < y0 + t; y++) for (let x = x0; x < x0 + t; x++) claim[y * W + x] = 1;
        props.push({ x: x0, y: y0, kind: k, tone, rot: rollRot(k, rnd()) });
      };
      const rim = 6; // the map's edge goes to black (renderer DARK_RIM)
      const order: number[] = [];
      for (let i = 0; i < N; i++) {
        const x = i % W, y = (i / W) | 0;
        if (rock(i) && !claim[i] && x >= rim && y >= rim && x < W - rim && y < H - rim) order.push(i);
      }
      for (let k = order.length - 1; k > 0; k--) { const j = (rnd() * (k + 1)) | 0; const t = order[k]; order[k] = order[j]; order[j] = t; }
      let hillProps = 0;
      for (const i of order) {
        if (claim[i]) continue;
        const x = i % W, y = (i / W) | 0;
        const g = gN(x / gs, y / gs);
        const tb = tab(i);
        const pg = tb.pp.growth * (g > 0.6 ? 0.06 : g > 0.5 ? 0.02 : 0.001);
        const ps = tb.pp.stone * (g > 0.5 ? 0.012 : 0.004);
        const r = rnd();
        const table = r < pg ? tb.flora : r < pg + ps ? tb.stones : null;
        if (!table) continue;
        const wantT = table === flora ? (g > 0.6 ? (rnd() < 0.3 ? 3 : 2) : 1) : rnd() < 0.3 ? 2 : 1;
        for (let t = wantT; t >= 1; t--) {
          const kinds = table.get(t);
          if (!kinds) continue;
          const k = pick(kinds), off = (t - 1) >> 1;
          if (fits(x - off, y - off, t, rock)) {
            standOnRock(x - off, y - off, k, table === tb.flora ? tb.toneFor(k, i) : rockToneAt(i));
            hillProps++;
            break;
          }
        }
      }
      say(`hill props: ${hillProps}`);
    }

    // ---------- the side sites (docs/sites.md) ----------
    // Rolled off their own stream so the rest of the board is the board
    // it was before they existed. How many of each size is a chance roll
    // (sites.ts rollSiteCounts), the biggest placed first; each is a kind
    // drawn at random. The cache stands in an open yard clear of the core,
    // the doors, the lanes and each other, with most of its ring on ground
    // a guard can stand on and a turret can be built on
    {
      const srnd = rng(spec.seed ^ 0x51735);
      const counts = rollSiteCounts(srnd);
      const plan: SiteSize[] = [];
      for (const size of [...SITE_SIZES].reverse()) for (let n = 0; n < counts[size]; n++) plan.push(size);
      plan.length = Math.min(plan.length, MAX_SITES);
      const chestK = propKind("chest");
      const stood: { x: number; y: number; r: number }[] = [];
      const sitePocket = new Uint8Array(N);
      const sN = makeNoise(srnd, 2);
      let hills = 0;
      for (const size of plan) {
        const sk = SITE_KINDS[(srnd() * SITE_KINDS.length) | 0];
        const tier = siteTier(sk, size);
        const r = tier.radius;
        for (let tries = 0; tries < 400; tries++) {
          const x0 = 8 + ((srnd() * (W - 18)) | 0), y0 = 8 + ((srnd() * (H - 18)) | 0);
          const cx = x0 + 1, cy = y0 + 1;
          if (edgeDist(cx, cy) < r + 26) continue;
          if (Math.hypot(cx - core.x, cy - core.y) < r + 60) continue;
          if (spec.spawns.some((z) => Math.hypot(z.x - cx, z.y - cy) < z.r + r + 10)) continue;
          if (stood.some((p) => Math.hypot(p.x - cx, p.y - cy) < p.r + r + 12)) continue;
          // A SITE MAY SIT IN A HILL: a yard that is all rock is carved into a
          // pocket the core never reaches. Its guards never needed to; they
          // are there to keep the cache, and a turret stands on the rock
          // round it (docs/sites.md)
          const inRock = (i: number): boolean => kind[i] === WALL && !claim[i] && !keep[i];
          const hill = !fits(x0 - 2, y0 - 2, 6, open) && fits(x0 - 2, y0 - 2, 6, inRock);
          if (!hill && !fits(x0 - 2, y0 - 2, 6, open)) continue;
          // THE RING IS CARVED TO THE PRECINCT: rock inside it, hill or
          // open ground, is cut down to floor, all but a few knobs near the
          // rim the noise leaves buried, so the build keeps its shape
          const level = SITE_SIZES.indexOf(size);
          const pocket: number[] = [];
          const rim = r * 0.92;
          disc(cx, cy, rim, (i, x, y) => {
            if (kind[i] !== WALL || claim[i] || keep[i] || wall[i] === WALL_PROP) return;
            const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / rim;
            if (d > 0.72 && sN(x / 4, y / 4) > 0.62) return;
            kind[i] = OPEN; blocked[i] = 0; wall[i] = 0; floor[i] = variant(famAt(i).floor);
            pocket.push(i);
          });
          const unlevel = (): void => { for (const i of pocket) { kind[i] = WALL; blocked[i] = 1; wall[i] = variant(famAt(i).wall, 2); sitePocket[i] = 0; } };
          // a hill site's pocket is ground the core never reaches; the pocket
          // pass and the orphan check leave it alone
          if (hill) for (const i of pocket) sitePocket[i] = 1;
          let all = 0, ok = 0;
          disc(cx, cy, r, (i) => { all++; if (kind[i] === OPEN && !claim[i]) ok++; });
          if (ok < all * 0.5) { unlevel(); continue; }
          let padX = x0, padY = y0;
          if (tier.flight) {
            const a0 = srnd() * Math.PI * 2;
            let found = false;
            for (let k = 0; k < 24 && !found; k++) {
              const a = a0 + (k / 24) * Math.PI * 2;
              const px = Math.round(cx + Math.cos(a) * tier.flight), py = Math.round(cy + Math.sin(a) * tier.flight);
              if (inb(px, py) && edgeDist(px, py) >= 8 && Math.hypot(px - core.x, py - core.y) > 40 && fits(px - 3, py - 3, 7, open)) { padX = px; padY = py; found = true; }
            }
            if (!found) { unlevel(); continue; }
          }
          const before = reach(), from = props.length;
          let placed = 4;
          stand(x0, y0, chestK, pp.weather, 0);
          // WHAT IT IS BUILT OUT OF (docs/sites.md): each kind dresses its
          // ring as a small place of its own — its ground, its walls, its
          // furniture — and a bigger site is more of the same, not a building
          const put = (id: string, ax: number, ay: number, rot?: number, tone?: number): boolean => {
            const k = propKind(id), t = PROP_KINDS[k].tiles;
            const lx = Math.round(ax - t / 2), ly = Math.round(ay - t / 2);
            if (!fits(lx, ly, t, open)) return false;
            stand(lx, ly, k, tone ?? pp.weather, rot ?? rollRot(k, srnd()));
            placed += t * t;
            return true;
          };
          const floored: [number, number][] = [];
          // a floor laid to a shape: solid where `d` (the distance past the
          // edge) is under zero, thinning over `fade` cells on the fine noise
          const lay = (ax: number, ay: number, ext: number, fl: number, fade: number, d: (x: number, y: number) => number): void => {
            for (let y = Math.max(0, Math.floor(ay - ext)); y <= Math.min(H - 1, Math.ceil(ay + ext)); y++)
              for (let x = Math.max(0, Math.floor(ax - ext)); x <= Math.min(W - 1, Math.ceil(ax + ext)); x++) {
                const i = y * W + x;
                if (kind[i] !== OPEN) continue;
                const v = d(x + 0.5, y + 0.5);
                if (v > 0 && (v >= fade || sN(x / 2.5, y / 2.5) < v / fade)) continue;
                floored.push([i, floor[i]]);
                floor[i] = fl + ((srnd() * 3) | 0);
              }
          };
          const discF = (ax: number, ay: number, rad: number, fl: number, fade: number): void =>
            lay(ax, ay, rad + fade, fl, fade, (x, y) => Math.hypot(x - ax, y - ay) - rad);
          const boxF = (ax: number, ay: number, hw: number, hh: number, fl: number, fade: number): void =>
            lay(ax, ay, Math.max(hw, hh) + fade, fl, fade, (x, y) => Math.max(Math.abs(x - ax) - hw, Math.abs(y - ay) - hh));
          const strip = (x0: number, y0: number, x1: number, y1: number, w: number, fl: number, fade = 0.5): void => {
            const mx = (x0 + x1) / 2, my = (y0 + y1) / 2, ext = Math.hypot(x1 - x0, y1 - y0) / 2 + w + fade;
            lay(mx, my, ext, fl, fade, (x, y) => {
              const dx = x1 - x0, dy = y1 - y0, l2 = dx * dx + dy * dy || 1;
              const t = Math.max(0, Math.min(1, ((x - x0) * dx + (y - y0) * dy) / l2));
              return Math.hypot(x - x0 - t * dx, y - y0 - t * dy) - w / 2;
            });
          };
          // A WALL IS A ROW OF ROCK CELLS on a family of its own — cut stone,
          // steel hull, or the ground's own rock — drawn on a contour like every hill
          const rocked: number[] = [];
          const wallCell = (i: number, fam: number): void => {
            if (kind[i] !== OPEN || claim[i] || keep[i]) return;
            kind[i] = WALL; blocked[i] = 1; wall[i] = fam + ((srnd() * 2) | 0); claim[i] = 1;
            rocked.push(i); placed++;
          };
          const own = (i: number): number => famAt(i).wall;
          /** a ring `thick` deep with `gaps` openings, the first at angle `g0` */
          const ringW = (ax: number, ay: number, dist: number, thick: number, gaps: number, fam: number | ((i: number) => number), g0: number, arc?: [number, number]): void => {
            const per = (Math.PI * 2) / gaps;
            disc(ax, ay, dist + thick / 2, (i, x, y) => {
              const dx = x + 0.5 - ax, dy = y + 0.5 - ay;
              if (Math.hypot(dx, dy) < dist - thick / 2) return;
              const a = Math.atan2(dy, dx);
              if (arc) { const t = ((a - arc[0]) % 6.2832 + 6.2832) % 6.2832; if (t > arc[1] - arc[0]) return; }
              const t = (((a - g0) % per) + per) % per;
              if (gaps > 0 && t < 0.5) return;
              wallCell(i, typeof fam === "number" ? fam : fam(i));
            });
          };
          /** an axis-aligned box one cell thick, with a `gate`-wide gap on each side listed */
          const boxW = (ax: number, ay: number, hw: number, hh: number, gates: readonly number[], fam: number, gate: number): void => {
            for (let y = Math.floor(ay - hh); y <= Math.ceil(ay + hh); y++)
              for (let x = Math.floor(ax - hw); x <= Math.ceil(ax + hw); x++) {
                if (!inb(x, y)) continue;
                const dx = x + 0.5 - ax, dy = y + 0.5 - ay;
                const onX = Math.abs(dx) >= hw - 1 && Math.abs(dx) <= hw, onY = Math.abs(dy) >= hh - 1 && Math.abs(dy) <= hh;
                if ((!onX && !onY) || Math.abs(dx) > hw || Math.abs(dy) > hh) continue;
                const side = onX && !onY ? (dx > 0 ? 0 : 2) : onY && !onX ? (dy > 0 ? 1 : 3) : -1;
                const along = side === 0 || side === 2 ? dy : dx;
                if (side >= 0 && gates.includes(side) && Math.abs(along) < gate / 2) continue;
                wallCell(y * W + x, fam);
              }
          };
          const post = (ax: number, ay: number, fam: number): void => { const x = Math.floor(ax), y = Math.floor(ay); if (inb(x, y)) wallCell(y * W + x, fam); };
          const around = (id: string, n: number, dist: number, tone?: (i: number) => number, a0 = srnd() * Math.PI * 2, jitter = 0.4): void => {
            for (let m = 0; m < n; m++) {
              const a = a0 + (m / n) * Math.PI * 2 + (srnd() - 0.5) * jitter;
              // a slot on rock or water steps inward a little before it is given up
              for (let tr = 0; tr < 3; tr++) {
                const d = dist * (0.92 + srnd() * 0.16) * (1 - tr * 0.12);
                const ax = cx + Math.cos(a) * d, ay = cy + Math.sin(a) * d;
                if (put(id, ax, ay, undefined, tone?.(Math.round(ay) * W + Math.round(ax)))) break;
              }
            }
          };
          const DIR = [[1, 0], [0, 1], [-1, 0], [0, -1]] as const;
          const g0 = srnd() * Math.PI * 2, side = (srnd() * 4) | 0;
          const n = (k: number, least = 1): number => Math.max(least, Math.round(r * k));
          if (sk === "cairn") {
            // THE HENGE: a paved disc under the cache, a paved ring path with spokes
            // out to it, standing stones on the rim, a cut-stone ring from medium
            // up and a second ring of stones and stone inside a large one
            const spokes = 3 + level, ring = r * 0.8;
            discF(cx, cy, Math.max(3.5, r * 0.18), FLOOR_FLAGSTONE, 2);
            lay(cx, cy, ring + 3, FLOOR_FLAGSTONE, 0.5, (x, y) => Math.abs(Math.hypot(x - cx, y - cy) - ring) - 1);
            for (let k = 0; k < spokes; k++) {
              const a = g0 + (k / spokes) * Math.PI * 2 + 0.25;
              strip(cx + Math.cos(a) * 3, cy + Math.sin(a) * 3, cx + Math.cos(a) * ring, cy + Math.sin(a) * ring, 1.6, FLOOR_FLAGSTONE);
            }
            if (level > 0) ringW(cx, cy, r * 0.55, level > 1 ? 2 : 1, spokes, WALL_MASONRY, g0);
            if (level > 1) {
              ringW(cx, cy, r * 0.3, 1, spokes, WALL_MASONRY, g0);
              around("menhir", n(0.25), r * 0.42, rockToneAt, g0 + 0.1, 0.2);
              around("brazier", spokes, r * 0.36, undefined, g0 + 0.25 + 0.16, 0);
            }
            around("menhir", n(0.5), r * 0.9, rockToneAt, g0 + 0.1, 0.2);
            around("boulder", n(0.2), level > 1 ? r * 0.68 : r * 0.42, rockToneAt);
            if (level > 0) around("brazier", spokes, r * 0.66, undefined, g0 + 0.25 + 0.16, 0);
            if (level > 1) put("altar", cx - 3.5, cy + 0.5, 0);
          } else if (sk === "mirror") {
            // THE MIRROR GARDEN: a quartz disc, four slate paths, mirror plates round
            // the cache, pillars from medium up, a crystal ring round a large one
            discF(cx, cy, r * 0.75, FLOOR_QUARTZ, 2);
            for (let k = 0; k < 4; k++) { const a = g0 + (k / 4) * Math.PI * 2; strip(cx, cy, cx + Math.cos(a) * r, cy + Math.sin(a) * r, 1.2, FLOOR_SLATE); }
            around("lens", n(0.4, 2), r * 0.55, undefined, g0 + 0.785, 0.2);
            if (level > 0) around("pillar", 4 + level * 4, r * 0.8, undefined, g0 + 0.785, 0);
            if (level > 1) ringW(cx, cy, r * 0.92, 1, 4, WALL_CRYSTAL_ROCK, g0);
          } else if (sk === "sleeper") {
            // THE FOUNDRY: a cinder yard, a steel-decked hall walled in hull
            // plating with a gate or two, chimneys and pipes inside, scrap outside;
            // a large one is a compound, the yard walled in plating too
            const hw = Math.round(r * 0.5), hh = Math.round(r * 0.4);
            discF(cx, cy, r * 0.85, FLOOR_CINDER, 4);
            boxF(cx, cy, hw - 1, hh - 1, FLOOR_PLATE, 0);
            const gates = level > 0 ? [side, (side + 2) % 4] : [side];
            for (const g of gates) strip(cx + DIR[g][0] * hw, cy + DIR[g][1] * hw, cx + DIR[g][0] * r * 0.95, cy + DIR[g][1] * r * 0.95, 2.4, FLOOR_PLATE);
            boxW(cx, cy, hw, hh, gates, WALL_PLATING, 4);
            if (level > 1) ringW(cx, cy, r * 0.88, 1, 4, WALL_PLATING, side * 1.5708 - 0.25);
            const stacks = level > 1 ? 4 : 1 + level;
            for (let k = 0; k < stacks; k++) { const sx = k % 2 ? -1 : 1, sy = k < 2 ? -1 : 1; put("stack", cx + sx * (hw - 2.5), cy + sy * (hh - 2.5), 0); }
            around("pipe", n(0.12), Math.min(hw, hh) * 0.55);
            around(level > 0 ? "barrels" : "crate", n(0.15, 2), Math.min(hw, hh) * 0.6);
            around("scrap", n(0.1), r * 0.72);
            if (level > 0) around("silo", level, r * 0.72);
          } else if (sk === "shrine") {
            // THE TEMPLE PRECINCT: a sandstone court walled in cut stone, a
            // paved avenue lined with pillars in through the gate, braziers at
            // the corners, obelisks at the gate; a large one holds a second court
            // and a colonnade along the outer walls
            const hw = Math.round(r * 0.55), gates = level > 0 ? [side, (side + 2) % 4] : [side];
            const [dx, dy] = DIR[side], [px, py] = [-dy, dx];
            boxF(cx, cy, hw + 1, hw + 1, FLOOR_SANDSTONE, 3);
            boxW(cx, cy, hw, hw, gates, WALL_MASONRY, 3);
            strip(cx + dx * 2, cy + dy * 2, cx + dx * r * 0.95, cy + dy * r * 0.95, 3, FLOOR_FLAGSTONE);
            for (let d = hw + 2; d < r * 0.95; d += 3) for (const q of [2.5, -2.5]) put("pillar", cx + dx * d + px * q, cy + dy * d + py * q, 0);
            for (const [sx, sy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) put("brazier", cx + sx * (hw - 2), cy + sy * (hw - 2), 0);
            if (level > 1) {
              const iw = Math.round(r * 0.3);
              boxW(cx, cy, iw, iw, [side], WALL_MASONRY, 3);
              strip(cx + dx * 2, cy + dy * 2, cx + dx * hw, cy + dy * hw, 3, FLOOR_FLAGSTONE);
              for (const [sx, sy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) put("brazier", cx + sx * (iw - 2), cy + sy * (iw - 2), 0);
              for (let t = -(hw - 4); t <= hw - 4; t += 3) for (const q of [hw - 2.5, -(hw - 2.5)]) put("pillar", cx + px * q + dx * t, cy + py * q + dy * t, 0);
              for (const q of [3, -3]) put("obelisk", cx + dx * (iw + 1) + px * q, cy + dy * (iw + 1) + py * q, 0);
            }
            if (level > 0) for (const q of [3, -3]) put("obelisk", cx + dx * (hw + 1) + px * q, cy + dy * (hw + 1) + py * q, 0);
            if (level > 0) put("altar", cx - dx * 3.5, cy - dy * 3.5, 0);
          } else if (sk === "beacon") {
            // THE SCORCHED WATCH: burnt ground out to a rock rampart, a pyre by
            // the cache, fire pits inside a ring of cut-stone stakes, braziers at
            // the openings; a large one is a fortress, its rampart four deep
            const gaps = 3 + level;
            discF(cx, cy, r * 0.75, FLOOR_CINDER, 4);
            discF(cx, cy, r * 0.4, FLOOR_OBSIDIAN, 3);
            ringW(cx, cy, r * 0.85, 2 + level, gaps, own, g0);
            if (level > 0) {
              const posts = n(0.45);
              for (let k = 0; k < posts; k++) { const a = g0 + (k / posts) * Math.PI * 2; post(cx + Math.cos(a) * r * 0.55, cy + Math.sin(a) * r * 0.55, WALL_MASONRY); }
            }
            put("pyre", cx + 3.5, cy - 0.5, 0);
            if (level > 1) around("pyre", 3, r * 0.25, undefined, g0 + 1);
            around("firepit", n(0.2, 2), r * 0.42, undefined, g0 + 0.3);
            around("brazier", gaps, r * 0.72, undefined, g0 + 0.25, 0);
            around("bunker", level > 1 ? 4 : level, r * 0.65);
          } else if (sk === "bomber") {
            // THE AIRFIELD: a plated depot round the cache; at the pad a plated
            // runway pointed at the cache, lit down both edges, the fuel dump
            // beside it and a hull-plate wall behind
            discF(cx, cy, r * 0.55, FLOOR_PLATE, 2);
            around("crate", 3 + level * 2, r * 0.6);
            if (level > 0) around("barrels", level, r * 0.35);
            const a = Math.atan2(cy - padY, cx - padX), ux = Math.cos(a), uy = Math.sin(a), vx = -uy, vy = ux;
            const len = 10 + level * 5, half = 2.5 + level * 0.5, ox = padX + 0.5, oy = padY + 0.5;
            lay(ox + ux * len * 0.3, oy + uy * len * 0.3, len, FLOOR_PLATE, 1, (x, y) => {
              const dx = x - ox, dy = y - oy, u = dx * ux + dy * uy, v = dx * vx + dy * vy;
              return Math.max(-u - 3, u - (len - 3), Math.abs(v) - half);
            });
            discF(ox, oy, 4 + level, FLOOR_PLATE, 1);
            for (let d = -1; d < len - 3; d += 3) for (const q of [half + 1, -(half + 1)]) put("strobe", ox + ux * d + vx * q, oy + uy * d + vy * q, 0);
            ringW(ox, oy, 6 + level * 2, 1, 0, WALL_PLATING, 0, [a + Math.PI - 1.1, a + Math.PI + 1.1]);
            const off = 7 + level * 2;
            for (const q of [off, -off]) {
              put(q > 0 ? "silo" : "barrels", ox + vx * q - ux * 2, oy + vy * q - uy * 2);
              if (level > 0) put(q > 0 ? "pipe" : "crate", ox + vx * q + ux * 3, oy + vy * q + uy * 3);
              if (level > 1) put(q > 0 ? "barrels" : "silo", ox + vx * q - ux * 7, oy + vy * q - uy * 7);
            }
          }
          if (before - reach() > placed + 6) {
            for (const q of props.splice(from)) {
              const qt = PROP_KINDS[q.kind].tiles;
              for (let y = q.y; y < q.y + qt; y++)
                for (let x = q.x; x < q.x + qt; x++) { const i = y * W + x; blocked[i] = 0; wall[i] = 0; kind[i] = OPEN; claim[i] = 0; }
            }
            for (const i of rocked) { blocked[i] = 0; wall[i] = 0; kind[i] = OPEN; claim[i] = 0; }
            for (const [i, f] of floored) floor[i] = f;
            unlevel();
            continue;
          }
          marks.push({ kind: SITE_MARK, x: x0, y: y0, opts: { site: sk, size, radius: r, padX, padY } });
          stood.push({ x: cx, y: cy, r });
          if (hill) hills++;
          break;
        }
      }
      // a pocket a site's walls closed is grown over, and sealed if it
      // cannot be — the same rule the props above are held to
      {
        const seen = flood(cc, isWalk);
        const pocket = new Uint8Array(N);
        let any = false;
        for (let i = 0; i < N; i++) if (isWalk(i) && !seen[i] && !sitePocket[i]) { pocket[i] = 1; any = true; }
        const kinds = [2, 1].flatMap((t) => (flora.get(t) ?? []).map((k) => ({ tiles: t, kind: k })));
        if (any && kinds.length)
          for (const f of forestOf(pocket, () => canopyTone(), spec.seed ^ 0x5173, kinds)) {
            if (kind[f.y * W + f.x] === SHALLOW) continue;
            stand(f.x, f.y, f.kind, f.tone, f.rot);
          }
        for (const i of sealWalk()) { if (sitePocket[i]) { kind[i] = OPEN; continue; } blocked[i] = 1; wall[i] = variant(famAt(i).wall, 2); }
      }
      say(`sites: ${marks.length} of ${plan.length} rolled (${counts.small} small, ${counts.medium} medium, ${counts.large} large), ${hills} in hills: ${marks.map((m) => `${m.opts?.site} ${m.opts?.size}`).join(", ") || "none"}`);
    }
    say(`props: ${props.length} (${sites.length} sites)`);
  }

  // THE SPAWN LAYER: the nearest ground inward from every edge cell — the
  // first cell, however deep, whose ground reaches the core through
  // corridors at least 2 x SPAWN_CLEAR wide (the walk mask opened at that
  // radius, in the core's piece of it), and SPAWN_DEPTH cells of it. The
  // door circles are not in it: they only carve. The terrain is left as
  // the noise drew it: on an open side the door is the edge itself, behind
  // a mountain it is the mountain's inner foot. Water tiles the same way
  // over the water mask
  const spawnTiles: number[] = [];
  {
    const mark = new Uint8Array(N);
    const wide = (mask: Uint8Array, seed: number): Uint8Array => {
      const o = dilate(erode(mask, SPAWN_CLEAR, 1), SPAWN_CLEAR);
      const { lab } = label(o);
      const keep = lab[seed];
      const out = new Uint8Array(N);
      if (keep) for (let i = 0; i < N; i++) if (lab[i] === keep) out[i] = 1;
      return out;
    };
    const gm = new Uint8Array(N), wm = new Uint8Array(N);
    // a prop is an obstacle, not a wall: it does not narrow a room for
    // the width test, and the sim's own pad filter drops what a body
    // cannot leave. The prop's cell itself is never a door
    for (let i = 0; i < N; i++) { gm[i] = (isWalk(i) && !blocked[i]) || wall[i] === WALL_PROP ? 1 : 0; wm[i] = isWater(i) ? 1 : 0; }
    const ok = wide(gm, core.y * W + core.x);
    for (let i = 0; i < N; i++) if (wall[i] === WALL_PROP) ok[i] = 0;
    if (waterZones.length) {
      const z = waterZones[0];
      const ww = wide(wm, Math.round(z.y) * W + Math.round(z.x));
      for (let i = 0; i < N; i++) if (ww[i] && kind[i] === DEEP) ok[i] = 1;
    }
    const march = (x0: number, y0: number, dx: number, dy: number): void => {
      for (let d = 0; d < Math.max(W, H); d++) {
        const x = x0 + dx * d, y = y0 + dy * d;
        if (!inb(x, y)) return;
        if (!ok[y * W + x]) continue;
        for (let k = 0; k < SPAWN_DEPTH; k++) {
          const px = x + dx * k, py = y + dy * k;
          if (inb(px, py) && ok[py * W + px]) mark[py * W + px] = 1;
        }
        return;
      }
    };
    for (let t = 0; t < W; t++) { march(t, 0, 0, 1); march(t, H - 1, 0, -1); }
    for (let t = 0; t < H; t++) { march(0, t, 1, 0); march(W - 1, t, -1, 0); }
    // ...and none within SPAWN_CORE_CLEAR of the core, the loader's own rule (maps.ts clampSpawn)
    for (let i = 0; i < N; i++) if (mark[i] && ok[i] && Math.hypot((i % W) + 0.5 - core.x, ((i / W) | 0) + 0.5 - core.y) >= SPAWN_CORE_CLEAR) spawnTiles.push(i);
    say(`spawn tiles: ${spawnTiles.length}`);
  }

  const base = { x: core.x + CORE_LO, y: core.y + CORE_LO };
  return { floor, wall, blocked, props, marks, spawns: spec.spawns.map((z) => ({ x: z.x, y: z.y, r: z.r, zone: z.zone })), spawnTiles, base, core, ruins: ruins.length, holes, lumps, log };
}

// ---------- checks ----------

/** every rule a map is held to; the failures, and every line for a log */
export function check(spec: MapSpec, m: Built): { fails: string[]; lines: string[] } {
  const { floor, wall, blocked, spawns, base } = m;
  const fails: string[] = [], lines: string[] = [];
  const say = (ok: boolean, msg: string): void => { lines.push(`${ok ? "ok " : "FAIL "}${msg}`); if (!ok) fails.push(msg); };
  const wet: Pass = (i) => WATER_FLOORS.includes(floor[i] - (floor[i] % 3));
  const walk: Pass = (i) => blocked[i] === 0;
  const coreCells: number[] = [];
  for (let y = base.y; y < base.y + CORE; y++) for (let x = base.x; x < base.x + CORE; x++) coreCells.push(y * W + x);
  const pads = (z: SpecZone, pass: Pass): number[] => { const out: number[] = []; disc(z.x, z.y, z.r, (i) => { if (pass(i)) out.push(i); }); return out; };
  const minGround = spec.routeMin?.ground ?? ROUTE_MIN_GROUND;
  const minWater = spec.routeMin?.water ?? ROUTE_MIN_WATER;

  say(coreCells.every((i) => walk(i) && !wet(i)), `core ${CORE}x${CORE} at ${base.x},${base.y} is open dry ground`);
  say(spawns.every((z) => Math.hypot(z.x - m.core.x, z.y - m.core.y) > z.r + CORE), "no drop zone touches the core");

  let bestD = Infinity;
  const goal: number[] = [];
  for (let i = 0; i < N; i++) if (wet(i)) bestD = Math.min(bestD, Math.hypot((i % W) + 0.5 - m.core.x, ((i / W) | 0) + 0.5 - m.core.y));
  for (let i = 0; i < N; i++) if (wet(i) && Math.hypot((i % W) + 0.5 - m.core.x, ((i / W) | 0) + 0.5 - m.core.y) <= bestD + 1.5) goal.push(i);

  const dG = clearance(walk), dW = clearance(wet);
  const lens: { z: SpecZone; len: number }[] = [];
  const dCore = distances(coreCells, walk);
  const coreSet = new Set(coreCells);
  for (const z of spawns) {
    if (z.zone === "boss" || z.zone === "air") continue;
    const water = z.zone === "water";
    const p = pads(z, water ? wet : walk);
    const seen = flood(p, water ? wet : walk);
    const target = water ? goal : coreCells;
    const reach = target.some((i) => seen[i]);
    say(p.length > 0 && reach, `${z.zone} zone (${z.x},${z.y}): ${p.length} pads, ${reach ? "reaches" : "DOES NOT reach"} its goal`);
    const near = new Uint8Array(N);
    // a hull's goal is a shore, narrow by definition: the sea is measured
    // to within a route's width of it, which reaches the channel's middle
    if (water) for (const g of target) disc((g % W) + 0.5, ((g / W) | 0) + 0.5, minWater, (i) => { near[i] = 1; });
    const wide = widestRoute(water ? dW : dG, p, water ? (i) => near[i] === 1 : (i) => coreSet.has(i));
    const need = water ? minWater : minGround;
    let pinch = "";
    if (wide < need - 1) {
      const dist = water ? dW : dG, r = wide / 2 + 0.6;
      const pass: Pass = (i) => dist[i] >= r;
      const exits = water ? [...near.keys()].filter((i) => near[i]) : target;
      const seenA = flood(p.filter(pass), pass);
      const seenB = flood(exits.filter(pass), pass);
      const wideEnough: Pass = (i) => dist[i] >= wide / 2 - 0.3;
      const between: Pass = (i) => !seenA[i] && !seenB[i] && wideEnough(i);
      const seeds: number[] = [];
      for (let i = 0; i < N; i++) if (between(i) && [i - 1, i + 1, i - W, i + W].some((j) => j >= 0 && j < N && seenA[j])) seeds.push(i);
      const mid = flood(seeds, between);
      const at: [number, number][] = [];
      for (let i = 0; i < N && at.length < 4; i++) {
        if (!mid[i]) continue;
        const x = i % W, y = (i / W) | 0;
        if ([i - 1, i + 1, i - W, i + W].some((j) => j >= 0 && j < N && seenB[j]) && !at.some(([ax, ay]) => Math.hypot(ax - x, ay - y) < 6)) at.push([x, y]);
      }
      pinch = ` — pinched at ${at.map(([x, y]) => `(${x},${y})`).join(" ")}`;
    }
    say(wide >= need - 1, `  widest way through ${wide.toFixed(1)} cells (want ${need})${pinch}`);
    if (!water) lens.push({ z, len: Math.min(...p.map((i) => dCore[i])) });
  }
  if (lens.length > 1) {
    const ls = lens.map((l) => l.len);
    const spread = (Math.max(...ls) - Math.min(...ls)) / Math.min(...ls);
    say(spread <= (spec.spreadMax ?? 0.5), `walks to the core: ${lens.map((l) => `(${l.z.x},${l.z.y}) ${l.len.toFixed(0)}`).join(", ")} — spread ${(spread * 100).toFixed(0)}%`);
  }

  const seen = flood(coreCells, walk);
  // a site cut into a hill is a pocket the core never reaches, on purpose (docs/sites.md)
  const pocketed = new Uint8Array(N);
  for (const mk of m.marks) if (mk.kind === SITE_MARK) disc(mk.x + 1, mk.y + 1, Number(mk.opts?.radius ?? 0) + 2, (i) => { pocketed[i] = 1; });
  let orphan = 0;
  for (let i = 0; i < N; i++) if (walk(i) && !seen[i] && !pocketed[i]) orphan++;
  say(orphan === 0, `orphan open cells: ${orphan}`);

  let rock = 0, pine = 0, open = 0, shallow = 0, deep = 0;
  for (let i = 0; i < N; i++) {
    if (!blocked[i]) { open++; if (wet(i)) shallow++; }
    else if (wall[i] === WALL_DEEP) deep++;
    else if (wall[i] === WALL_PROP) pine++;
    else rock++;
  }
  const pct = (v: number): string => `${((100 * v) / N).toFixed(0)}%`;
  lines.push(`${W}x${H}: open ${pct(open)} (${pct(shallow)} of it ford)  rock ${pct(rock)}  under props ${pct(pine)}  deep ${pct(deep)}  ruins ${m.ruins}  holes ${m.holes}  lumps ${m.lumps}  props ${m.props.length}`);
  say(rock > 8000 * SCALE * SCALE, `rock for towers: ${rock}`);
  say(rock <= ROCK_CAP * (N - deep), `rock ${((100 * rock) / (N - deep)).toFixed(0)}% of the land (cap ${ROCK_CAP * 100}%)`);
  let big = 0;
  for (let y = 0; y < H - 3; y++)
    for (let x = 0; x < W - 3; x++) {
      let ok = true;
      for (let dy = 0; dy < 4 && ok; dy++)
        for (let dx = 0; dx < 4; dx++) { const i = (y + dy) * W + x + dx; if (!blocked[i] || wall[i] === WALL_DEEP || wall[i] === WALL_PROP) { ok = false; break; } }
      if (ok) big++;
    }
  say(big > 200 * SCALE * SCALE, `4x4 turret footprints: ${big}`);
  return { fails, lines };
}

/** a built map as the document the game loads */
export function documentOf(spec: MapSpec, m: Built): MapData {
  return {
    id: spec.id,
    name: spec.name,
    w: W,
    base: m.base,
    floor: Array.from(m.floor),
    wall: Array.from(m.wall),
    blocked: Array.from(m.blocked),
    spawns: m.spawns,
    spawnTiles: m.spawnTiles,
    props: m.props,
    marks: m.marks,
  };
}

// ---------- the random spec ----------

const AUTHORED = SIZE / SCALE;
const RIM = 22;
/** a random map's lanes are held wider than an authored map's (docs/random-maps.md) */
const RANDOM_ROUTE_MIN = { ground: 16, water: 20 };

interface Biome {
  id: string;
  families: { floor: number; wall: number; weight: number }[];
  beach: { floor: number; wall?: number; depth: number };
  flats?: { floor: number; clear: number };
  forest?: { on: number[]; threshold: number; depth: number };
  water?: Partial<NonNullable<MapSpec["water"]>>;
  ruins: number;
  props: PropSpec;
  names: [string[], string[]];
  /** the biomes this one may share a board with (the blends) */
  kin: string[];
}

// the made kinds a biome's ground is littered with, by how the ground treats metal
const DRY_LITTER = ["crate", "barrels", "scrap", "hull", "silo", "mast"];
const WET_LITTER = ["barrels", "scrap", "hull", "crate"];
const COLD_LITTER = ["crate", "crate", "barrels", "mast", "silo"];
const ROCKS = ["boulder", "rock", "outcrop", "knoll", "crag", "tor"];

/** a biome's props: its family at every footprint, its two auxiliaries on the shore, the shared rock (propArt.ts BIOME_PROPS) */
const biomeProps = (id: string, weather: number, litter: string[], sites: string[], growth: number, stone: number, siteCount: [number, number]): PropSpec => {
  const tp = BIOME_PROPS[id];
  return {
    canopy: [...tp.tones], wood: tp.auxTone, weather,
    flora: [1, 2, 3, 4, 6, 10].map((n) => `${tp.family}${n}`),
    stones: ROCKS,
    shore: [tp.aux[0].id, tp.aux[1].id],
    litter, sites, growth, stone, siteCount,
  };
};

// the ten biomes (docs/random-maps.md), one family a biome
const BIOMES: Biome[] = [
  {
    id: "meadow",
    families: [
      { floor: FLOOR_GRASS, wall: WALL_LOAM, weight: 0.5 },
      { floor: FLOOR_LOAM, wall: WALL_LOAM, weight: 0.3 },
      { floor: FLOOR_DIRT, wall: WALL_DIRT, weight: 0.2 },
    ],
    beach: { floor: FLOOR_LOAM, depth: 2 },
    forest: { on: [FLOOR_GRASS, FLOOR_LOAM], threshold: 0.5, depth: 4 },
    ruins: 2,
    props: biomeProps("meadow", TONE.plain, DRY_LITTER, ["walker", "colossus", "bunker", "wreck"], 1, 0.6, [1, 2]),
    names: [["Green", "Thorn", "Old", "Low", "Wild"], ["Wood", "Way", "Meadow", "Ford", "Glen"]],
    kin: ["jungle", "badlands"],
  },
  {
    id: "saltpan",
    families: [
      { floor: FLOOR_SAND, wall: WALL_SAND, weight: 0.55 },
      { floor: FLOOR_DUST, wall: WALL_DUNE, weight: 0.3 },
      { floor: FLOOR_DARKSAND, wall: WALL_DUNE, weight: 0.15 },
    ],
    beach: { floor: FLOOR_DUST, wall: WALL_DUNE, depth: 2 },
    flats: { floor: FLOOR_SALT, clear: 10 },
    forest: { on: [FLOOR_SAND, FLOOR_DARKSAND], threshold: 0.64, depth: 2 },
    ruins: 3,
    props: biomeProps("saltpan", TONE.dust, DRY_LITTER, ["silo", "wreck", "bunker", "wreck"], 0.35, 2.4, [1, 3]),
    names: [["Salt", "Dune", "Ashen", "Sun", "Bleached"], ["Basin", "Reach", "Flats", "Verge", "Hollow"]],
    kin: ["badlands", "shallows"],
  },
  {
    id: "tundra",
    families: [
      { floor: FLOOR_SNOW, wall: WALL_SNOW, weight: 0.56 },
      { floor: FLOOR_ICE, wall: WALL_ICE, weight: 0.26 },
      { floor: FLOOR_FLINT, wall: WALL_DACITE, weight: 0.18 },
    ],
    beach: { floor: FLOOR_ICE, depth: 2 },
    flats: { floor: FLOOR_ICE, clear: 11 },
    forest: { on: [FLOOR_SNOW, FLOOR_ICE], threshold: 0.6, depth: 2 },
    ruins: 1,
    props: biomeProps("tundra", TONE.rime, COLD_LITTER, ["bunker", "wreck", "colossus", "wreck"], 0.5, 1, [1, 2]),
    names: [["White", "Cold", "Frost", "Still", "North"], ["Peak", "Line", "Field", "Pass", "Shelf"]],
    kin: ["crystal"],
  },
  {
    id: "badlands",
    families: [
      { floor: FLOOR_CLAY, wall: WALL_CLAY, weight: 0.55 },
      { floor: FLOOR_LOAM, wall: WALL_LOAM, weight: 0.25 },
      { floor: FLOOR_DUST, wall: WALL_CLAY, weight: 0.2 },
    ],
    beach: { floor: FLOOR_DUST, wall: WALL_LOAM, depth: 2 },
    flats: { floor: FLOOR_DUST, clear: 11 },
    forest: { on: [FLOOR_CLAY, FLOOR_LOAM], threshold: 0.66, depth: 2 },
    ruins: 3,
    props: biomeProps("badlands", TONE.ochre, DRY_LITTER, ["wreck", "bunker", "colossus", "silo"], 0.4, 2.2, [1, 3]),
    names: [["Red", "Rust", "Kiln", "Ochre", "Brick"], ["Badlands", "Mesa", "Gulch", "Bluff", "Terrace"]],
    kin: ["saltpan", "meadow", "caldera"],
  },
  {
    id: "ashfall",
    families: [
      { floor: FLOOR_CINDER, wall: WALL_CINDER, weight: 0.5 },
      { floor: FLOOR_BASALT, wall: WALL_DARK, weight: 0.3 },
      { floor: FLOOR_DARKSAND, wall: WALL_CINDER, weight: 0.2 },
    ],
    beach: { floor: FLOOR_DARKSAND, wall: WALL_DARK, depth: 2 },
    flats: { floor: FLOOR_BASALT, clear: 12 },
    forest: { on: [FLOOR_CINDER, FLOOR_DARKSAND], threshold: 0.62, depth: 2 },
    ruins: 2,
    props: biomeProps("ashfall", TONE.soot, ["scrap", "scrap", "hull", "hull", "barrels", "mast"], ["walker", "colossus", "wreck", "walker"], 0.45, 2.2, [2, 3]),
    names: [["Ash", "Black", "Soot", "Ember", "Burnt"], ["Fall", "Reach", "Waste", "Field", "Cinders"]],
    kin: ["caldera", "sporefield"],
  },
  {
    id: "caldera",
    families: [
      { floor: FLOOR_SCORIA, wall: WALL_SCORIA, weight: 0.5 },
      { floor: FLOOR_OBSIDIAN, wall: WALL_OBSIDIAN, weight: 0.2 },
      { floor: FLOOR_CINDER, wall: WALL_SCORIA, weight: 0.2 },
      { floor: FLOOR_BASALT, wall: WALL_DARK, weight: 0.1 },
    ],
    beach: { floor: FLOOR_OBSIDIAN, wall: WALL_OBSIDIAN, depth: 2 },
    flats: { floor: FLOOR_BASALT, clear: 12 },
    forest: { on: [FLOOR_SCORIA, FLOOR_CINDER], threshold: 0.6, depth: 2 },
    ruins: 2,
    props: biomeProps("caldera", TONE.soot, ["scrap", "hull", "hull", "barrels"], ["walker", "colossus", "wreck"], 0.45, 2, [1, 3]),
    names: [["Black", "Ember", "Fire", "Cinder", "Molten"], ["Caldera", "Rim", "Vent", "Crater", "Bowl"]],
    kin: ["ashfall", "badlands"],
  },
  {
    id: "shallows",
    families: [
      { floor: FLOOR_SHOAL, wall: WALL_REEF, weight: 0.5 },
      { floor: FLOOR_CORALSAND, wall: WALL_LIMESTONE, weight: 0.3 },
      { floor: FLOOR_SILT, wall: WALL_LIMESTONE, weight: 0.2 },
    ],
    beach: { floor: FLOOR_SHOAL, wall: WALL_REEF, depth: 3 },
    forest: { on: [FLOOR_SHOAL, FLOOR_CORALSAND], threshold: 0.5, depth: 3 },
    // the water high and nearly all of it shallow: a drowned flat the ground bodies wade
    water: { level: 0.55, shore: 0.3 },
    ruins: 1,
    props: biomeProps("shallows", TONE.film, WET_LITTER, ["wreck", "walker", "wreck"], 0.8, 0.6, [0, 2]),
    names: [["Coral", "Tide", "Salt", "Blue", "Low"], ["Shallows", "Shoal", "Lagoon", "Reef", "Sound"]],
    kin: ["saltpan", "meadow"],
  },
  {
    id: "jungle",
    families: [
      { floor: FLOOR_JUNGLE, wall: WALL_JUNGLE, weight: 0.5 },
      { floor: FLOOR_LITTER, wall: WALL_JUNGLE, weight: 0.25 },
      { floor: FLOOR_REDEARTH, wall: WALL_LATERITE, weight: 0.15 },
      { floor: FLOOR_MOSS, wall: WALL_JUNGLE, weight: 0.1 },
    ],
    beach: { floor: FLOOR_LITTER, depth: 2 },
    forest: { on: [FLOOR_JUNGLE, FLOOR_MOSS, FLOOR_LITTER], threshold: 0.45, depth: 5 },
    ruins: 2,
    props: biomeProps("jungle", TONE.film, DRY_LITTER, ["walker", "colossus", "wreck", "bunker"], 1.5, 0.4, [1, 2]),
    names: [["Green", "Deep", "Wet", "Tangled", "Old"], ["Jungle", "Canopy", "Tangle", "Basin", "Thicket"]],
    kin: ["meadow", "sporefield"],
  },
  {
    id: "sporefield",
    families: [
      { floor: FLOOR_SPOREFIELD, wall: WALL_SPORE_ROCK, weight: 0.5 },
      { floor: FLOOR_MYCELIUM, wall: WALL_FUNGAL, weight: 0.3 },
      { floor: FLOOR_BLIGHT, wall: WALL_SPORE_ROCK, weight: 0.2 },
    ],
    beach: { floor: FLOOR_BLIGHT, depth: 2 },
    flats: { floor: FLOOR_MYCELIUM, clear: 12 },
    forest: { on: [FLOOR_SPOREFIELD, FLOOR_BLIGHT], threshold: 0.55, depth: 3 },
    water: { shallow: FLOOR_TAINTED_WATER, deep: FLOOR_DEEP_TAINTED_WATER },
    ruins: 1,
    props: biomeProps("sporefield", TONE.film, WET_LITTER, ["wreck", "walker", "colossus"], 0.9, 0.5, [0, 2]),
    names: [["Spore", "Pale", "Rot", "Blighted", "Mold"], ["Field", "Waste", "Bloom", "Hollow", "Reach"]],
    kin: ["jungle", "ashfall", "crystal"],
  },
  {
    id: "crystal",
    families: [
      { floor: FLOOR_QUARTZ, wall: WALL_CRYSTAL_ROCK, weight: 0.5 },
      { floor: FLOOR_SLATE, wall: WALL_SLATE, weight: 0.3 },
      { floor: FLOOR_SALT, wall: WALL_CRYSTAL_ROCK, weight: 0.2 },
    ],
    beach: { floor: FLOOR_SLATE, wall: WALL_SLATE, depth: 2 },
    flats: { floor: FLOOR_SALT, clear: 12 },
    forest: { on: [FLOOR_QUARTZ], threshold: 0.6, depth: 2 },
    ruins: 1,
    props: biomeProps("crystal", TONE.rime, COLD_LITTER, ["bunker", "wreck", "colossus"], 0.5, 1.2, [1, 2]),
    names: [["Glass", "Quartz", "Bright", "Shard", "Cold"], ["Barrens", "Field", "Scar", "Waste", "Shelf"]],
    kin: ["tundra", "sporefield"],
  },
];
const biomeById = (id: string): Biome => BIOMES.find((t) => t.id === id)!;

/**
 * THE SHAPE OF A BOARD, rolled apart from its biome (docs/random-maps.md):
 * how thick the rock lies, how big its features are, how open the ground
 * is, how much water there is. Every dial below is a range the roll draws
 * from, and each archetype's ranges are far enough apart that two boards
 * of different shapes read as different places, not two rolls of one.
 * `rock` is the noise threshold a cell must EXCEED to be rock — lower
 * means more of it.
 */
interface Archetype {
  nouns: string[];
  rock: [number, number];
  scale: [number, number];
  warp: [number, number];
  patch: [number, number];
  coreR: [number, number];
  room: [number, number];
  rooms: [number, number];
  links: number;
  holes: [number, number];
  lumps: [number, number];
  distort: number;
  bays: number;
  sea?: boolean;
  seaLevel?: number;
  riverLevel?: number;
}
const ARCHETYPES: Archetype[] = [
  // the highlands: the board as it was — rooms and lanes through thick rock
  { nouns: ["Highlands", "Reach", "Hollow", "Fold"], rock: [0.50, 0.54], scale: [20, 28], warp: [10, 14], patch: [30, 42], coreR: [10, 11], room: [11, 16], rooms: [1, 2], links: 4, holes: [5, 9], lumps: [8, 16], distort: 3, bays: 0.56 },
  // the canyons: rock everywhere, fine and twisting, cut by narrow ways
  { nouns: ["Canyons", "Gorge", "Rifts", "Cut"], rock: [0.41, 0.45], scale: [15, 19], warp: [12, 16], patch: [24, 34], coreR: [10, 11], room: [9, 12], rooms: [1, 2], links: 4, holes: [9, 13], lumps: [3, 7], distort: 3, bays: 0.5 },
  // the plains: open ground with rock in lumps, big soft features
  { nouns: ["Plains", "Flats", "Expanse", "Steppe"], rock: [0.60, 0.64], scale: [34, 44], warp: [8, 12], patch: [40, 60], coreR: [12, 14], room: [14, 18], rooms: [2, 3], links: 2, holes: [2, 4], lumps: [20, 28], distort: 2, bays: 0.62 },
  // the isles: the sea everywhere, the land in islands with fords between
  { nouns: ["Isles", "Shoals", "Archipelago", "Sound"], rock: [0.51, 0.55], scale: [22, 30], warp: [10, 14], patch: [28, 40], coreR: [11, 13], room: [11, 15], rooms: [1, 3], links: 3, holes: [4, 7], lumps: [6, 12], distort: 3, bays: 0.56, sea: true, seaLevel: 0.56 },
  // the crater: one great open bowl round the core, its rim the fight
  { nouns: ["Crater", "Caldera", "Basin", "Bowl"], rock: [0.47, 0.51], scale: [22, 26], warp: [10, 14], patch: [30, 44], coreR: [30, 38], room: [10, 14], rooms: [1, 2], links: 3, holes: [5, 8], lumps: [10, 16], distort: 3, bays: 0.54 },
  // the warren: a fine maze of small rooms and many cuts between them
  { nouns: ["Warren", "Maze", "Burrows", "Tangle"], rock: [0.46, 0.50], scale: [11, 14], warp: [6, 9], patch: [22, 30], coreR: [10, 11], room: [8, 10], rooms: [3, 4], links: 4, holes: [12, 16], lumps: [4, 8], distort: 2, bays: 0.52 },
];

/** the forty-odd numbers an author would write, rolled from a seed on the 256 board */
export function randomSpec(seed: number): MapSpec {
  const rnd = rng(seed);
  const between = (a: number, b: number): number => a + rnd() * (b - a);
  const pick = <T>(a: readonly T[]): T => a[(rnd() * a.length) | 0];
  const biome = pick(BIOMES);
  const arch = pick(ARCHETYPES);
  // every board carries a second biome, one of the first's kin, over a fifth to two fifths of the
  // ground; one in three carries a third, kin of either, over a tenth to a fifth
  const second = biomeById(pick(biome.kin));
  const thirds = [...new Set([...biome.kin, ...second.kin])].filter((id) => id !== biome.id && id !== second.id);
  const third = thirds.length > 0 && rnd() < 0.34 ? biomeById(pick(thirds)) : null;
  const blendOf = (b: Biome, amount: number): Blend => ({ families: b.families, beach: b.beach, flats: b.flats, forest: b.forest, props: b.props, amount });
  const blends = [blendOf(second, between(0.2, 0.42))];
  if (third) blends.push(blendOf(third, between(0.1, 0.2)));
  const clampIn = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, Math.round(v)));
  const roll = (r: [number, number]): number => r[0] + ((rnd() * (r[1] - r[0] + 1)) | 0);

  const core = { x: clampIn(between(64, AUTHORED - 64), 0, AUTHORED), y: clampIn(between(64, AUTHORED - 64), 0, AUTHORED), r: roll(arch.coreR) };
  const dist = (a: { x: number; y: number }, b: { x: number; y: number }): number => Math.hypot(a.x - b.x, a.y - b.y);

  // the sea, if there is one, lies along the edge the core is furthest from
  const edges = [
    { side: "left", d: core.x }, { side: "right", d: AUTHORED - core.x },
    { side: "top", d: core.y }, { side: "bottom", d: AUTHORED - core.y },
  ].sort((a, b) => b.d - a.d);
  const seaMode = arch.sea ?? rnd() < 0.6;
  const seaSides: string[] = seaMode ? [edges[0].side] : [];
  if (seaMode && edges[1].d >= 110 && rnd() < 0.4) seaSides.push(edges[1].side);
  const edgeIn = (side: string, x: number, y: number): number =>
    side === "left" ? x : side === "right" ? AUTHORED - 1 - x : side === "top" ? y : AUTHORED - 1 - y;
  const seaIn = (x: number, y: number): number => Math.min(...seaSides.map((s) => edgeIn(s, x, y)));

  // where a ray from the core meets the inset rim
  const rimPoint = (ang: number, inset: number): { x: number; y: number; d: number } => {
    const dx = Math.cos(ang), dy = Math.sin(ang);
    const tx = dx > 1e-6 ? (AUTHORED - inset - core.x) / dx : dx < -1e-6 ? (inset - core.x) / dx : Infinity;
    const ty = dy > 1e-6 ? (AUTHORED - inset - core.y) / dy : dy < -1e-6 ? (inset - core.y) / dy : Infinity;
    const t = Math.min(tx, ty);
    return { x: Math.round(core.x + dx * t), y: Math.round(core.y + dy * t), d: t };
  };
  const angDiff = (a: number, b: number): number => { let d = Math.abs(a - b) % (Math.PI * 2); if (d > Math.PI) d = Math.PI * 2 - d; return d; };

  const a0 = rnd() * Math.PI * 2;
  const cands: { ang: number; x: number; y: number; d: number }[] = [];
  for (let k = 0; k < 36; k++) {
    const ang = a0 + (k / 36) * Math.PI * 2;
    const p = rimPoint(ang, RIM);
    if (seaMode && seaIn(p.x, p.y) <= RIM + 4) continue;
    cands.push({ ang, ...p });
  }
  const dmax = Math.max(...cands.map((c) => c.d));
  const far = cands.filter((c) => c.d >= Math.max(95, 0.6 * dmax));
  const shuffle = <T>(a: T[]): T[] => { for (let k = a.length - 1; k > 0; k--) { const j = (rnd() * (k + 1)) | 0; [a[k], a[j]] = [a[j], a[k]]; } return a; };
  const wantGround = 3 + ((rnd() * 3) | 0);
  const ground: typeof cands = [];
  for (const sep of [Math.PI / 3.6, Math.PI / 5, Math.PI / 6.4]) {
    ground.length = 0;
    for (const c of shuffle([...far])) {
      if (ground.length >= wantGround) break;
      if (ground.every((g) => angDiff(g.ang, c.ang) >= sep)) ground.push(c);
    }
    if (ground.length >= 3) break;
  }
  if (ground.length < 3) throw new Error("no room for three ground doors");

  // the water doors: on the sea's edge, or two rivers in from the rim
  const water: { x: number; y: number }[] = [];
  const wantWater = 2 + (rnd() < 0.4 ? 1 : 0);
  if (seaMode) {
    const spots: { x: number; y: number }[] = [];
    for (const side of seaSides)
      for (let k = 0; k < 12; k++) {
        const t = RIM + 8 + ((AUTHORED - 2 * (RIM + 8)) * (k + rnd())) / 12;
        spots.push(side === "left" ? { x: 18, y: t } : side === "right" ? { x: AUTHORED - 18, y: t } : side === "top" ? { x: t, y: 18 } : { x: t, y: AUTHORED - 18 });
      }
    for (const s of shuffle(spots)) {
      if (water.length >= wantWater) break;
      if (dist(s, core) < 90) continue;
      if (ground.some((g) => dist(g, s) < 45) || water.some((w) => dist(w, s) < 60)) continue;
      water.push({ x: Math.round(s.x), y: Math.round(s.y) });
    }
  } else {
    for (const c of shuffle([...cands])) {
      if (water.length >= wantWater) break;
      if (c.d < 90 || ground.some((g) => angDiff(g.ang, c.ang) < Math.PI / 5)) continue;
      if (water.some((w) => dist(w, c) < 60)) continue;
      const p = rimPoint(c.ang, 18);
      water.push({ x: p.x, y: p.y });
    }
  }
  if (water.length < 1) throw new Error("no room for a water door");

  // the bay: the water the hulls sail for, a short way out from the core
  const mean = water.reduce((a, w) => ({ x: a.x + w.x / water.length, y: a.y + w.y / water.length }), { x: 0, y: 0 });
  const bayAng = Math.atan2(mean.y - core.y, mean.x - core.x) + between(-0.5, 0.5);
  const bayD = between(28, 36);
  const bay: SpecRoom = {
    x: clampIn(core.x + Math.cos(bayAng) * bayD, 30, AUTHORED - 30),
    y: clampIn(core.y + Math.sin(bayAng) * bayD, 30, AUTHORED - 30),
    r: Math.round(between(9, 12)),
    water: true,
  };

  const rooms: SpecRoom[] = [];
  const nearRoom = (p: { x: number; y: number }, d: number): number => rooms.findIndex((r) => dist(r, p) < d);
  const vias: number[] = [];
  for (const g of ground) {
    const t = between(0.4, 0.62);
    const lat = (rnd() - 0.5) * 0.28 * g.d;
    const nx = -(core.y - g.y) / g.d, ny = (core.x - g.x) / g.d;
    const p = { x: clampIn(g.x + (core.x - g.x) * t + nx * lat, 28, AUTHORED - 28), y: clampIn(g.y + (core.y - g.y) * t + ny * lat, 28, AUTHORED - 28) };
    const have = nearRoom(p, 30);
    if (have >= 0) { vias.push(have); continue; }
    rooms.push({ x: p.x, y: p.y, r: Math.round(between(arch.room[0], arch.room[1])) });
    vias.push(rooms.length - 1);
  }
  const extra = roll(arch.rooms);
  for (let tries = 0; tries < 40 && rooms.length < vias.length + extra; tries++) {
    const p = { x: clampIn(between(34, AUTHORED - 34), 0, AUTHORED), y: clampIn(between(34, AUTHORED - 34), 0, AUTHORED) };
    if (dist(p, core) < 42 || nearRoom(p, 42) >= 0) continue;
    if (ground.some((g) => dist(g, p) < 36) || water.some((w) => dist(w, p) < 36) || dist(bay, p) < 30) continue;
    if (seaMode && seaIn(p.x, p.y) < 40) continue;
    rooms.push({ x: p.x, y: p.y, r: Math.round(between(arch.room[0] - 1, arch.room[1] - 1)) });
  }
  const bayIdx = rooms.push(bay) - 1;

  const links: SpecLink[] = [];
  const pairs: [number, number, number][] = [];
  for (let a = 0; a < bayIdx; a++) for (let b = a + 1; b < bayIdx; b++) pairs.push([a, b, dist(rooms[a], rooms[b])]);
  pairs.sort((p, q) => p[2] - q[2]);
  for (const [a, b, d] of pairs) {
    if (links.length >= arch.links) break;
    if (d < 36 || d > 110) continue;
    links.push({ rooms: [a, b], width: [8, 12] });
  }

  const spawns: SpecZone[] = [
    ...ground.map((g) => ({ x: g.x, y: g.y, r: 12, zone: "ground" as const })),
    ...water.map((w) => ({ x: w.x, y: w.y, r: 10, zone: "water" as const })),
  ];
  const routes: SpecRoute[] = [
    ...water.map((_, k) => ({ spawn: ground.length + k, to: bayIdx, layer: "water" as const, width: [18, 26] as [number, number] })),
    ...ground.map((_, k) => ({ spawn: k, via: [vias[k]], width: [10, 17] as [number, number] })),
  ];

  const wells: Bias[] = [];
  if (!seaMode) {
    const nWells = 1 + ((rnd() * 2) | 0);
    for (let tries = 0; tries < 30 && wells.length < nWells; tries++) {
      const p = { x: between(30, AUTHORED - 30), y: between(30, AUTHORED - 30) };
      if (dist(p, core) < 100 || spawns.some((z) => dist(z, p) < 40)) continue;
      const r = between(11, 16), depth = between(0.4, 0.5);
      wells.push((x, y) => -depth * Math.exp(-((x - p.x) ** 2 + (y - p.y) ** 2) / (2 * r * r)));
    }
  }
  const waterSpec: MapSpec["water"] = seaMode
    ? { scale: 50, level: arch.seaLevel ?? 0.44, shore: 0.08, warp: 18, bias: (x, y) => (seaIn(x, y) / 130) * 0.7 - 0.24, ...biome.water }
    : { scale: 60, level: arch.riverLevel ?? 0.3, shore: 0.07, bias: (x, y) => 0.14 + wells.reduce((a, w) => a + w(x, y), 0), ...biome.water };

  // the biome names the ground, the archetype the shape
  const name = `${pick(biome.names[0])} ${rnd() < 0.5 ? pick(arch.nouns) : pick(biome.names[1])}`;
  return {
    id: RANDOM_MAP_ID,
    name,
    seed,
    rock: { threshold: between(arch.rock[0], arch.rock[1]), scale: between(arch.scale[0], arch.scale[1]), warp: between(arch.warp[0], arch.warp[1]) },
    water: waterSpec,
    floors: { scale: between(arch.patch[0], arch.patch[1]), warp: 12, families: biome.families },
    beach: biome.beach,
    flats: biome.flats,
    forest: biome.forest,
    props: biome.props,
    blends,
    rooms,
    core,
    spawns,
    routes,
    links,
    holes: roll(arch.holes),
    lumps: roll(arch.lumps),
    distort: arch.distort,
    bays: arch.bays,
    clutter: between(0.6, 1.8),
    ruins: (rnd() * (biome.ruins + 1)) | 0,
    routeMin: RANDOM_ROUTE_MIN,
    spreadMax: 0.8,
  };
}

export interface Generated {
  doc: MapData;
  seed: number;
  tries: number;
  lines: string[];
}

/**
 * A finished, checked map from a seed. A roll the checks refuse is rolled
 * again from the next seed, so the map handed back always passed; the
 * seed it passed on is reported, and a second call with that seed is the
 * same map.
 */
export function generateRandomMap(seed: number, maxTries = 12): Generated {
  let s = seed >>> 0;
  const failed: string[] = [];
  for (let t = 1; t <= maxTries; t++, s = (s + 1) >>> 0) {
    let spec: MapSpec;
    let built: Built;
    try {
      spec = scaleSpec(randomSpec(s));
      built = build(spec);
    } catch (err) {
      failed.push(`seed ${s.toString(16)}: ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }
    const { fails, lines } = check(spec, built);
    if (fails.length === 0) return { doc: documentOf(spec, built), seed: s, tries: t, lines: [...built.log, ...lines] };
    failed.push(`seed ${s.toString(16)}: ${fails.join("; ")}`);
  }
  throw new Error(`no random map passed its checks in ${maxTries} tries:\n${failed.join("\n")}`);
}

/** a fresh seed for a run — 31 bits, so it survives JSON and a URL alike */
export const rollMapSeed = (): number => (Math.random() * 0x7fffffff) >>> 0;

// the grid the game plays on must be the one this file draws
if (COLS !== SIZE || ROWS !== SIZE) throw new Error(`mapgen draws ${SIZE}x${SIZE}; the grid is ${COLS}x${ROWS}`);
