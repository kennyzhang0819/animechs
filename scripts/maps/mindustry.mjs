/**
 * THE MAP GENERATOR, MINDUSTRY'S WAY.
 *
 * Every campaign map is a spec file (confluence.mjs, maelstrom.mjs,
 * quagmire.mjs) of a few dozen numbers handed to `run()` here. The
 * pipeline is Mindustry's own SerpuloPlanetGenerator, step for step, on
 * this game's document shape:
 *
 *   1. NOISE, NOT GEOMETRY. Rock is a warped fBm value-noise contour, so
 *      every edge is ragged the way a Mindustry wall is, and no arc, disc
 *      or ellipse is ever stamped as a finished shape.
 *   2. WATER from a second, slower noise plus a per-map bias (a sea along
 *      one edge, lakes in the middle): deep in the heart, shallow at the
 *      shore, and shallow is ground a walker crosses.
 *   3. ROOMS: the drop zones, the core and a handful of clearings, each a
 *      disc with a noise-wobbled radius.
 *   4. ROUTES: an A* from room to room over a cost that prefers ground
 *      that is already open (Mindustry's `solid ? 70 : 0`), then a brush
 *      down the path whose radius wanders between a choke and a lane
 *      width — so a corridor narrows and widens as it goes and the map's
 *      chokepoints are where the brush was thin, not where a wall was
 *      drawn. Links between rooms make loops, so there is more than one
 *      way through. Named chokes pinch a corridor to an exact width.
 *   5. DISTORT, CELLS, MEDIAN: a light domain warp roughens the brush's
 *      tube edges, two passes of the 4-5 cellular rule and a speck filter
 *      take the single-cell noise out. Wall lumps are dropped into the
 *      wide rooms; holes are punched through thin walls where they do not
 *      shorten anyone's walk.
 *   6. THE MINIMUM GAP. The biggest walker is four cells across and the
 *      biggest hull seven, so every THROUGH gap is at least GAP_GROUND on
 *      land and GAP_WATER at sea: an opening by that disc silts every
 *      thinner gap shut, and the notches it would also have filled are put
 *      back as long as they join nothing. Open ground the core cannot be
 *      walked to from is filled (Mindustry's inverseFloodFill).
 *   7. PAINT. Floors come from a slow noise cut by the spec's family
 *      weights, and THE WALL IS THE FLOOR'S WALL: dune over darksand, sand
 *      wall over sand, snow wall over snow. A beach floor rings the water,
 *      a flats floor fills the middle of the big rooms. Forests replace
 *      rock beside the right floors with pines; boulders, shrubs and
 *      spore clusters scatter by family; ruins are rectangles of basalt
 *      with broken dark walls.
 *   8. CHECKS, then the document — never written while a check fails.
 *
 * Usage, from a spec:   node scripts/maps/<id>.mjs [out.json] [preview.png]
 */
import { writeFileSync } from "node:fs";
import { clearance, disc, discOffsets, flood, png, rng, widestRoute } from "./geom.mjs";

/**
 * TWICE MINDUSTRY'S SIZE. Mindustry's editor opens a new map at 200x200
 * and its Serpulo campaign runs from 110x400 to 512x512; the references
 * imported here whole, Ground Zero and Cratered Battleground, are 256x256,
 * and that is the board every spec in this folder was AUTHORED on. The
 * game is an RTS now, played by expanding outward over twenty-odd
 * minutes, and a board that size ran out of ground to expand into — so
 * every map is drawn at twice the width and twice the height (SIZE, which
 * is also COLS and ROWS in constants.ts), and every spec is scaled onto
 * it on the way in (scaleSpec): coordinates and radii doubled, and the
 * routes, links, chokes and rooms opened wider again on top of that
 * (WIDEN, ROOM_WIDEN), because a corridor a reign can thread is not yet a
 * corridor two armies can fight in.
 */
export const SIZE = 512;
/** how many grid cells one authored cell is — the specs stay at 256 */
export const SCALE = 2;
/** the routes, links and chokes, wider again than the doubling gives */
export const WIDEN = 1.5;
/** the clearings' radii, a quarter wider again */
export const ROOM_WIDEN = 1.25;
const W = SIZE, H = SIZE, N = W * H;

/**
 * A SPEC ON THE BIG BOARD. Every number that is a place or a length on
 * the authored 256 board becomes one on the 512 board: positions and
 * radii by SCALE, brush widths and chokes by SCALE x WIDEN, room radii by
 * SCALE x ROOM_WIDEN, the noise scales by SCALE so a rock lump is as many
 * cells across as it was in proportion, and the bias closures — a lake's
 * well, a sea along an edge — are called at the authored coordinates.
 * Counts (holes, lumps, ruins) grow with the area they are dropped into.
 * Idempotent on a spec that carries `scaled`, so run() may hand a scaled
 * spec to build(), check() and preview() alike.
 */
export function scaleSpec(spec) {
  if (spec.scaled) return spec;
  const k = SCALE;
  const pt = (o) => ({ ...o, x: o.x * k, y: o.y * k, ...(o.r != null ? { r: o.r * k } : {}) });
  const fn = (f) => (f ? (x, y) => f(x / k, y / k) : f);
  // a ground brush is widened; a WATER brush only doubles — a river is a
  // road to the hulls and a wall to everyone else, and one half as wide
  // again sends the A* for the ford the long way round it
  const width = (w, layer) => {
    const f = (layer ?? "ground") === "ground" ? k * WIDEN : k;
    return Array.isArray(w) ? w.map((v) => v * f) : w * f;
  };
  const out = {
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
    rooms: spec.rooms.map((r) => ({ ...pt(r), r: r.r * k * ROOM_WIDEN })),
    core: { ...pt(spec.core), r: (spec.core.r ?? 11) * k },
    spawns: spec.spawns.map(pt),
    routes: spec.routes.map((r) => ({ ...r, width: width(r.width, r.layer) })),
    links: (spec.links ?? []).map((l) => ({ ...l, width: width(l.width, l.layer) })),
    chokes: (spec.chokes ?? []).map((c) => ({ ...pt(c), w: c.w * k * WIDEN, reach: c.reach * k })),
    // the funnel disc has to wall a gate that is WIDEN wider, so its
    // radius grows by the same factor as the choke it sits on
    funnel: spec.funnel && { ...pt(spec.funnel), r: spec.funnel.r * k * WIDEN },
    holes: spec.holes == null ? spec.holes : Math.round(spec.holes * k),
    lumps: spec.lumps == null ? spec.lumps : Math.round(spec.lumps * k * k * 0.75),
    ruins: spec.ruins == null ? spec.ruins : Math.round(spec.ruins * k),
    coreWaterReach: spec.coreWaterReach == null ? spec.coreWaterReach : spec.coreWaterReach * k,
  };
  return out;
}

// The atlas indices this paints with — COPIED from game/atlas.ts, as every
// generator does: the generator is plain node and the atlas reaches for a
// canvas at load. Keep the names identical and grep both when one moves.
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
export const WALL_STONE = 0;
export const WALL_DIRT = 2;
export const WALL_PINE = 4;
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
/** the water floors, and which deep floor each shallow one sinks to */
const WATER_FLOORS = [FLOOR_SHALLOW_WATER, FLOOR_DEEP_WATER, FLOOR_TAINTED_WATER, FLOOR_DEEP_TAINTED_WATER];
/** decor kinds (UV_DECOR) and their width in tiles (DECOR_TILES) */
export const DECOR = {
  boulder: { kinds: [0, 1], tiles: 1.5 },
  shrub: { kinds: [2, 11], tiles: 1 },
  sporeCluster: { kinds: [3, 4, 5], tiles: 1.25 },
  purBush: { kinds: [6], tiles: 1 },
  shaleBoulder: { kinds: [7, 8], tiles: 1 },
  snowBoulder: { kinds: [9, 10], tiles: 1.5 },
  sandBoulder: { kinds: [12, 13], tiles: 1 },
};
/** pine kinds (UV_PINES) */
export const PINE = { pine: 0, sporePine: 1, snowPine: 2 };
/**
 * WHAT CLUTTER A FLOOR FAMILY GROWS — Mindustry's floor.decoration, by
 * family: the boulder that is the floor's own stone, and the bush that
 * grows on it. A family absent here grows nothing.
 */
const CLUTTER = {
  [FLOOR_GRASS]: [DECOR.boulder, DECOR.shrub, DECOR.shrub],
  [FLOOR_STONE]: [DECOR.boulder],
  [FLOOR_DIRT]: [DECOR.boulder, DECOR.shrub],
  [FLOOR_SAND]: [DECOR.sandBoulder],
  [FLOOR_DARKSAND]: [DECOR.sandBoulder, DECOR.boulder],
  [FLOOR_MOSS]: [DECOR.sporeCluster, DECOR.purBush, DECOR.boulder],
  [FLOOR_SPORE_MOSS]: [DECOR.sporeCluster, DECOR.sporeCluster, DECOR.purBush],
  [FLOOR_MUD]: [DECOR.boulder],
  [FLOOR_SHALE]: [DECOR.shaleBoulder],
  [FLOOR_SNOW]: [DECOR.snowBoulder],
  [FLOOR_ICE]: [DECOR.snowBoulder],
  [FLOOR_BASALT]: [DECOR.shaleBoulder, DECOR.boulder],
};
const CELL = 20; // world px per cell (game/constants.ts)
const CORE = 5; // the core's edge, in cells (BASE.size)

/**
 * THE MINIMUM THROUGH GAP, on land and at sea. A reign is UR*3.75 across
 * its radius — just under two cells — so a four-cell gap fits it and a
 * five is the floor; an omura is UR*7.25, a shade over seven cells, so
 * eleven at sea. Both are the disc the opening in step 6 is done with.
 */
export const GAP_GROUND = 5;
export const GAP_WATER = 11;
/**
 * The narrowest a route from a drop zone may be, checked as the widest
 * way through. On the 256 board a ground brush of 8 became 7 after the
 * smoothing shaved one; the brushes are three times that now (SCALE x
 * WIDEN), so the floor is a real opening — a lane a formation fights in
 * — and a water route wide enough for two hulls abreast.
 */
const ROUTE_MIN_GROUND = 12;
const ROUTE_MIN_WATER = 16;

// ---------- noise ----------

/** 3-octave value noise in [0,1] on a lattice seeded from `rnd` */
export const makeNoise = (rnd, octaves = 3) => {
  const seed = (rnd() * 0x7fffffff) | 0;
  const ox = rnd() * 512, oy = rnd() * 512;
  const lattice = (ix, iy) => {
    let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + seed) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
  const val = (x, y) => {
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

/**
 * A WARPED noise: the coordinates are pushed around by two more noises
 * before the lookup (Mindustry's `distort`), which is what turns a
 * blobby contour into one with headlands, inlets and stray lumps.
 */
const makeWarped = (rnd, scale, warp, octaves = 3) => {
  const n = makeNoise(rnd, octaves), wx = makeNoise(rnd, 2), wy = makeNoise(rnd, 2);
  const ws = scale * 1.7;
  return (x, y) => {
    const dx = (wx(x / ws, y / ws) - 0.5) * 2 * warp;
    const dy = (wy(x / ws, y / ws) - 0.5) * 2 * warp;
    return n((x + dx) / scale, (y + dy) / scale);
  };
};

// ---------- the pieces ----------

/** an A* over the grid, 8-way, cost(i) per cell entered; null if cut off */
const astar = (sx, sy, tx, ty, cost) => {
  const g = new Float32Array(N).fill(Infinity);
  const from = new Int32Array(N).fill(-1);
  const closed = new Uint8Array(N);
  // binary heap of [f, i]
  const hk = new Float64Array(N * 2), hv = new Int32Array(N * 2);
  let hn = 0;
  const push = (k, v) => {
    let i = hn++;
    while (i > 0) { const p = (i - 1) >> 1; if (hk[p] <= k) break; hk[i] = hk[p]; hv[i] = hv[p]; i = p; }
    hk[i] = k; hv[i] = v;
  };
  const pop = () => {
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
  const hx = (x, y) => { const dx = Math.abs(x - tx), dy = Math.abs(y - ty); return Math.max(dx, dy) + 0.414 * Math.min(dx, dy); };
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
  const out = [];
  for (let i = t; i >= 0; i = from[i]) { out.push([i % W, (i / W) | 0]); if (i === s) break; }
  return out.reverse();
};

/** BFS steps from `seeds` over pass(i), 8-way with diagonal 1.414; Infinity where unreached */
const distances = (seeds, pass) => {
  const d = new Float32Array(N).fill(Infinity);
  // Dijkstra with a bucketed queue would be exact; a plain BFS on 8
  // neighbours with the diagonal counted 1.414 is within a few percent,
  // which is all a "no gate is a short cut" ratio needs
  const q = [];
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

// cell kinds, one byte a cell, until the paint goes on
const OPEN = 0, WALL = 1, SHALLOW = 2, DEEP = 3;
const walkMaskOf = (kind) => { const m = new Uint8Array(N); for (let i = 0; i < N; i++) m[i] = kind[i] === OPEN || kind[i] === SHALLOW ? 1 : 0; return m; };

/** morphological erosion/dilation of a mask by a disc */
const erode = (mask, r, offBoardIs = 0) => {
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
const dilate = (mask, r) => {
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

/** label the 4-connected components of a mask; 0 where the mask is off */
const label = (mask) => {
  const lab = new Int32Array(N);
  let next = 0;
  for (let s = 0; s < N; s++) {
    if (!mask[s] || lab[s]) continue;
    next++;
    const q = [s];
    lab[s] = next;
    for (let h = 0; h < q.length; h++) {
      const i = q[h], x = i % W, y = (i / W) | 0;
      const step = (j) => { if (mask[j] && !lab[j]) { lab[j] = next; q.push(j); } };
      if (x > 0) step(i - 1);
      if (x < W - 1) step(i + 1);
      if (y > 0) step(i - W);
      if (y < H - 1) step(i + W);
    }
  }
  return { lab, count: next };
};

/**
 * OPEN A MASK TO A MINIMUM GAP, KEEPING THE NOTCHES. An opening by a disc
 * of radius r/2 removes everything the disc cannot fit inside: every gap
 * narrower than r, and every notch in a wall — which is most of what
 * makes a Mindustry edge look like one. So the notch cells are put back
 * afterwards, one ring at a time, each ring labelled by the component it
 * grew from, and a cell whose neighbours carry two different labels is
 * refused: a notch may deepen a wall's edge as far as it likes, but it
 * may never become the bridge the opening just removed.
 */
const openKeepingNotches = (mask, gap) => {
  const r = gap / 2;
  const opened = dilate(erode(mask, r), r);
  const { lab } = label(opened);
  const out = Uint8Array.from(opened);
  const lb = Int32Array.from(lab);
  let restored = 0;
  for (let ring = 0; ring < 3; ring++) {
    const adds = [];
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (out[i] || !mask[i]) continue;
        let l = 0, ok = true;
        const look = (j) => { if (!out[j]) return; if (!l) l = lb[j]; else if (lb[j] !== l) ok = false; };
        if (x > 0) look(i - 1);
        if (x < W - 1) look(i + 1);
        if (y > 0) look(i - W);
        if (y < H - 1) look(i + W);
        // the diagonals too: two components a diagonal apart are one
        // component to a unit that walks diagonals
        if (x > 0 && y > 0) look(i - W - 1);
        if (x < W - 1 && y > 0) look(i - W + 1);
        if (x > 0 && y < H - 1) look(i + W - 1);
        if (x < W - 1 && y < H - 1) look(i + W + 1);
        if (l && ok) adds.push([i, l]);
      }
    // apply in a second pass, and re-check: two cells added in the same
    // ring may each have been fine alone and be a bridge together
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

export function build(spec) {
  const rnd = rng(spec.seed);
  const kind = new Uint8Array(N); // OPEN / WALL / SHALLOW / DEEP
  const log = [];
  const say = (s) => { log.push(s); console.log(`  -- ${s}`); };
  const inb = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
  const edgeDist = (x, y) => Math.min(x, y, W - 1 - x, H - 1 - y);

  // 1. rock from noise. The rim is pushed up so the border is always rock
  //    and the map's own edge reads as a canyon wall, not a cut
  const rockN = makeWarped(rnd, spec.rock.scale, spec.rock.warp);
  const rockBias = spec.rock.bias ?? (() => 0);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const e = edgeDist(x, y);
      const rimW = 14 * SCALE;
      const rim = e < rimW ? ((rimW - e) / rimW) ** 2 * 0.6 : 0;
      kind[y * W + x] = rockN(x, y) + rim + rockBias(x, y) > spec.rock.threshold ? WALL : OPEN;
    }

  // 2. water. Below `level` is water; below `level - shore` it is deep.
  //    The rim never floods: a hull cannot leave the board either
  if (spec.water) {
    const wN = makeWarped(rnd, spec.water.scale, spec.water.warp ?? spec.water.scale * 0.4, 3);
    const bias = spec.water.bias ?? (() => 0);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        if (edgeDist(x, y) < 3) continue;
        const h = wN(x, y) + bias(x, y);
        if (h < spec.water.level - spec.water.shore) kind[y * W + x] = DEEP;
        else if (h < spec.water.level) kind[y * W + x] = SHALLOW;
      }
  }

  // 3. rooms: the clearings, the drop zones and the core. A room's radius
  //    wobbles round its outline by noise so it is a clearing, not a coin
  const roomN = makeNoise(rnd, 2);
  const clearRoom = (cx, cy, r, wobble, water, dry = false) => {
    disc(W, H, cx, cy, r * (1 + wobble), (i, x, y) => {
      const a = Math.atan2(y + 0.5 - cy, x + 0.5 - cx);
      const rr = r * (1 + (roomN(Math.cos(a) * 3 + cx / 50, Math.sin(a) * 3 + cy / 50) - 0.5) * 2 * wobble);
      if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) > rr) return;
      if (water) { if (kind[i] !== DEEP) kind[i] = kind[i] === SHALLOW ? SHALLOW : DEEP; }
      else if (dry) kind[i] = OPEN;
      else if (kind[i] === WALL || kind[i] === DEEP) kind[i] = kind[i] === DEEP ? SHALLOW : OPEN;
    });
  };
  const rooms = spec.rooms.map((r) => ({ ...r }));
  // a `dry` room is an island: its water is turned to ground, where a
  // plain room only turns its deep water shallow
  for (const r of rooms) clearRoom(r.x, r.y, r.r, r.wobble ?? 0.32, r.water ?? false, r.dry ?? false);
  const core = { x: spec.core.x, y: spec.core.y };
  const coreR = spec.core.r ?? 11;
  // the core's clearing is DRY: the water nearest the core is the hulls'
  // goal, and a puddle in the clearing would make it a puddle
  clearRoom(core.x, core.y, coreR, 0.2, false, true);
  for (const z of spec.spawns) {
    if (z.zone === "ground") clearRoom(z.x, z.y, z.r + 3, 0.2, false);
    if (z.zone === "water") clearRoom(z.x, z.y, z.r + 3, 0.15, true);
  }

  // 4. routes. The cost prefers ground already open; rock is dear, deep
  //    water dearer, and a little noise makes the path wander the way a
  //    walker's would rather than run a ruled line
  const wanderN = makeNoise(rnd, 2);
  const point = (ref) => {
    if (ref === "core") return core;
    if (typeof ref === "number") return rooms[ref];
    if (ref.startsWith("spawn:")) return spec.spawns[+ref.slice(6)];
    throw new Error(`unknown route point ${ref}`);
  };
  const centres = []; // every brushed centreline cell, for the chokes
  const brushN = makeNoise(rnd, 2);
  const carve = (a, b, width, layer = "ground") => {
    const cost = layer === "ground"
      ? (i) => (kind[i] === OPEN ? 1 : kind[i] === SHALLOW ? 1.5 : kind[i] === WALL ? 9 : 40)
          + (edgeDist(i % W, (i / W) | 0) < 12 * SCALE ? 30 : 0) + wanderN((i % W) / (9 * SCALE), ((i / W) | 0) / (9 * SCALE)) * 4
      // A RIVER MEANDERS. Land costs the same everywhere to a channel, so
      // a small wander term gave a ruled canal; a heavy one makes the
      // channel hunt the noise's low ground the way water does
      : (i) => (kind[i] === DEEP ? 1 : kind[i] === SHALLOW ? 1.2 : 25)
          + (edgeDist(i % W, (i / W) | 0) < 10 * SCALE ? 30 : 0) + wanderN((i % W) / (14 * SCALE), ((i / W) | 0) / (14 * SCALE)) * 70;
    const path = astar(Math.round(a.x), Math.round(a.y), Math.round(b.x), Math.round(b.y), cost);
    if (!path) throw new Error(`no route from (${a.x},${a.y}) to (${b.x},${b.y})`);
    const [w0, w1] = width;
    path.forEach(([x, y], k) => {
      const t = brushN(k / (22 * SCALE), layer === "ground" ? 0.5 : 7.5);
      const r = (w0 + (w1 - w0) * Math.min(1, Math.max(0, (t - 0.3) / 0.4))) / 2;
      centres.push([x, y]);
      disc(W, H, x + 0.5, y + 0.5, r, (i) => {
        if (layer === "ground") { if (kind[i] === WALL) kind[i] = OPEN; else if (kind[i] === DEEP) kind[i] = SHALLOW; }
        else { if (kind[i] !== DEEP) kind[i] = kind[i] === SHALLOW ? SHALLOW : DEEP; }
      });
    });
    return path.length;
  };
  // WATER FIRST. A sea channel brushed over a road would sink it; a road
  // brushed over a channel turns that stretch to shallow, which is a ford
  // both the walkers and the hulls can use
  const routes = [];
  for (const layer of ["water", "ground"]) {
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

  // 4b. the named chokes: within `reach` of the point, only the cells
  //     within w/2 of a brushed centreline stay open
  //     THE FUNNEL'S CHOKE IS STRAIGHT: it pinches to the ruled line from
  //     the core through the funnel point, which is the strip the citadel
  //     gate (5c) keeps open, so the two agree. A choke laid along the
  //     wandering centreline under a straight gate left only their overlap
  const f = spec.funnel;
  const gateAng = f ? Math.atan2(f.y - core.y, f.x - core.x) : 0;
  const offLine = (x, y) => Math.abs(-(x + 0.5 - core.x) * Math.sin(gateAng) + (y + 0.5 - core.y) * Math.cos(gateAng));
  for (const c of spec.chokes ?? []) {
    const straight = f && Math.hypot(c.x - f.x, c.y - f.y) < 4 * SCALE;
    const near = centres.filter(([x, y]) => Math.hypot(x - c.x, y - c.y) <= c.reach + 4);
    disc(W, H, c.x, c.y, c.reach, (i, x, y) => {
      // the straight strip is CARVED as well as kept: the road under it
      // wandered, and a strip only kept where the road already was is a
      // strip as wide as their overlap
      if (straight && kind[i] === WALL && offLine(x, y) <= c.w / 2) { kind[i] = OPEN; return; }
      if (kind[i] !== OPEN && kind[i] !== SHALLOW) return;
      let d = Infinity;
      if (straight) d = offLine(x, y);
      else for (const [px, py] of near) d = Math.min(d, Math.hypot(px - x, py - y));
      if (d > c.w / 2) kind[i] = WALL;
    });
  }

  // 5. distort, cells, median. The warp is what takes the tube out of a
  //    brushed corridor; the cellular passes take the specks out of the
  //    noise. Water is frozen through both: a lake keeps its shape
  const dN1 = makeNoise(rnd, 2), dN2 = makeNoise(rnd, 2);
  const amp = spec.distort ?? 3;
  const warped = new Uint8Array(N);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const sx = Math.round(x + (dN1(x / 11, y / 11) - 0.5) * 2 * amp);
      const sy = Math.round(y + (dN2(x / 11, y / 11) - 0.5) * 2 * amp);
      warped[y * W + x] = inb(sx, sy) ? kind[sy * W + sx] : WALL;
    }
  kind.set(warped);
  // BAYS. A brushed corridor is a tube and a wobbled disc is still a disc;
  // what makes a Mindustry room a room is the rock BITTEN INTO round its
  // edge — alcoves, pockets, a lump left standing. Rock within a few cells
  // of open ground is opened where a fine noise says so, and the cellular
  // passes below tidy what is left
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

  // 5b. lumps: small rocks dropped into the wide rooms — cover in the
  //     open, and somewhere to stand a turret in the middle of a plaza
  const isWalk = (i) => kind[i] === OPEN || kind[i] === SHALLOW;
  const isRock = (i) => kind[i] === WALL;
  const isWater = (i) => kind[i] === DEEP || kind[i] === SHALLOW;
  let lumps = 0;
  if (spec.lumps) {
    const clear = clearance(W, H, isWalk);
    for (let tries = 0; lumps < spec.lumps && tries < spec.lumps * 60; tries++) {
      const x = (rnd() * W) | 0, y = (rnd() * H) | 0, i = y * W + x;
      // a lump leaves a route's width (ROUTE_MIN_GROUND) and a little on
      // every side of itself, so a lump in a lane never pinches the lane
      // under the width the checks ask for: the clearance is the distance
      // to the nearest rock, so the lump's radius is what is left of it
      // after that gap
      const lumpGap = ROUTE_MIN_GROUND + 2;
      if (!isWalk(i) || clear[i] < lumpGap + 1.5) continue;
      if (Math.hypot(x - core.x, y - core.y) < 20 * SCALE) continue;
      if (spec.spawns.some((z) => Math.hypot(x - z.x, y - z.y) < z.r + 8)) continue;
      const r = Math.min(4 * SCALE, clear[i] - lumpGap), rx = r * (0.7 + rnd() * 0.6), ry = r * (0.7 + rnd() * 0.6);
      disc(W, H, x + 0.5, y + 0.5, Math.max(rx, ry) + 1, (j, px, py) => {
        const u = (px + 0.5 - x - 0.5) / rx, v = (py + 0.5 - y - 0.5) / ry;
        if (u * u + v * v <= 1 + (rnd() - 0.5) * 0.5 && kind[j] === OPEN) kind[j] = WALL;
      });
      lumps++;
    }
  }

  // 5c. THE CITADEL. Where a funnel is named, the core's clearing is
  //     ringed with rock and the ring has one gate, a corridor of the
  //     funnel's width toward the funnel point. A noise map is open in
  //     too many places for "wall the mouth and nothing reaches the core"
  //     to come true by luck; the ring makes it true by construction, and
  //     it is how Mindustry's own cores sit — in a pocket with a mouth.
  //     Water in the ring deepens rather than walls, so a bay may lap it
  if (f) {
    const gateW = (spec.chokes?.find((c) => Math.hypot(c.x - f.x, c.y - f.y) < 4 * SCALE)?.w ?? 8 * SCALE * WIDEN) / 2;
    const R = coreR + 7 * SCALE;
    disc(W, H, core.x, core.y, R, (i, x, y) => {
      const dx = x + 0.5 - core.x, dy = y + 0.5 - core.y;
      const d = Math.hypot(dx, dy);
      if (d <= coreR - 1) return;
      // the gate: the strip along the ruled line from the core through the
      // funnel point, the funnel choke's own width
      const along = dx * Math.cos(gateAng) + dy * Math.sin(gateAng);
      if (along > 0 && offLine(x, y) <= gateW) { if (kind[i] === WALL) kind[i] = OPEN; return; }
      if (kind[i] === OPEN) kind[i] = WALL;
      else if (kind[i] === SHALLOW) kind[i] = DEEP;
    });
  }

  // 6. the minimum gap, then nothing unreachable. The opening is done on
  //    the walkable mask for the walkers and on the wet mask for the hulls
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
    // only DEEP is taken: a shallow cell is also ground, and the ground
    // opening has already had its say about it
    for (let i = 0; i < N; i++) if (kind[i] === DEEP && !ow.mask[i]) { kind[i] = WALL; siltedSea++; }
  }
  say(`gap ${GAP_GROUND}/${GAP_WATER}: silted ${silted} ground cells (${og.restored} notches kept), ${siltedSea} sea cells`);

  // the core's own ground, whatever the noise did to it
  for (let y = core.y - 2; y <= core.y + 2; y++)
    for (let x = core.x - 2; x <= core.x + 2; x++) kind[y * W + x] = OPEN;
  disc(W, H, core.x, core.y, 5, (i) => { if (kind[i] === WALL) kind[i] = OPEN; if (kind[i] === DEEP) kind[i] = SHALLOW; });

  // inverse flood fill from the core
  const seenG = flood(W, H, [core.y * W + core.x], isWalk);
  let filled = 0;
  for (let i = 0; i < N; i++) if (isWalk(i) && !seenG[i]) { kind[i] = kind[i] === SHALLOW ? DEEP : WALL; filled++; }
  // and the rim
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) if (edgeDist(x, y) === 0) kind[y * W + x] = WALL;
  say(`filled ${filled} unreachable cells, dropped ${lumps} lumps`);

  // 6a. THE HULLS' GOAL IS THE SEA. The sim sends every hull to the water
  //     nearest the core, whichever puddle that is, so on a map with water
  //     zones no other water may lie nearer the core than the sea the
  //     zones are in: a pond that does is drained, a lake that does is a
  //     spec error
  const waterZones = spec.spawns.filter((z) => z.zone === "water");
  let drained = 0;
  if (waterZones.length) {
    const wetM = new Uint8Array(N);
    for (let i = 0; i < N; i++) wetM[i] = isWater(i) ? 1 : 0;
    const { lab } = label(wetM);
    const seaLabels = new Set();
    for (const z of waterZones) disc(W, H, z.x, z.y, z.r, (i) => { if (lab[i]) seaLabels.add(lab[i]); });
    if (seaLabels.size !== 1) {
      const per = waterZones.map((z) => { const ls = new Set(); disc(W, H, z.x, z.y, z.r, (i) => { if (lab[i]) ls.add(lab[i]); }); return `(${z.x},${z.y}) in water ${[...ls].join("+") || "none"}`; });
      throw new Error(`the water zones sit in ${seaLabels.size} separate waters — they must share one sea: ${per.join(", ")}`);
    }
    const sea = [...seaLabels][0];
    const dCore = (i) => Math.hypot((i % W) + 0.5 - core.x, ((i / W) | 0) + 0.5 - core.y);
    let seaD = Infinity;
    for (let i = 0; i < N; i++) if (lab[i] === sea) seaD = Math.min(seaD, dCore(i));
    const size = new Map();
    for (let i = 0; i < N; i++) if (lab[i]) size.set(lab[i], (size.get(lab[i]) ?? 0) + 1);
    const drain = new Set();
    for (let i = 0; i < N; i++) if (lab[i] && lab[i] !== sea && dCore(i) < seaD) drain.add(lab[i]);
    for (const l of drain) if (size.get(l) > 500) throw new Error(`a lake of ${size.get(l)} cells lies nearer the core than the sea (${seaD.toFixed(0)} cells) — the hulls would sail for it`);
    for (let i = 0; i < N; i++) if (drain.has(lab[i])) { kind[i] = kind[i] === SHALLOW ? OPEN : WALL; drained++; }
    if (drained) say(`drained ${drained} cells of pond nearer the core than the sea`);
  }

  // 6b. holes: a thin wall between two open places is punched where the
  //     hole shortens nobody's walk to the core by more than 15% and the
  //     funnel still holds. The rest is texture; this is a second way in
  const walkMask = () => { const m = new Uint8Array(N); for (let i = 0; i < N; i++) m[i] = isWalk(i) ? 1 : 0; return m; };
  const groundPads = (z) => { const out = []; disc(W, H, z.x, z.y, z.r, (i) => { if (isWalk(i)) out.push(i); }); return out; };
  const groundZones = spec.spawns.filter((z) => z.zone === "ground");
  const coreCells = () => { const out = []; for (let y = core.y - 2; y <= core.y + 2; y++) for (let x = core.x - 2; x <= core.x + 2; x++) out.push(y * W + x); return out; };
  const walkFrom = () => {
    const d = distances(coreCells(), isWalk);
    return groundZones.map((z) => Math.min(...groundPads(z).map((i) => d[i])));
  };
  const funnelHolds = () => {
    if (!spec.funnel) return true;
    const cut = new Uint8Array(N);
    disc(W, H, spec.funnel.x, spec.funnel.y, spec.funnel.r, (i) => (cut[i] = 1));
    const pass = (i) => isWalk(i) && !cut[i];
    const cc = coreCells();
    for (const z of groundZones) {
      const seen = flood(W, H, groundPads(z).filter(pass), pass);
      if (cc.some((i) => seen[i])) return false;
    }
    return true;
  };
  let holes = 0;
  if (spec.holes) {
    const before = walkFrom();
    const cand = [];
    const m = walkMask();
    for (let y = 8; y < H - 8; y++)
      for (let x = 8; x < W - 8; x++) {
        const i = y * W + x;
        if (kind[i] !== WALL) continue;
        // a thin wall: open within 3 cells on both sides, along one axis
        for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
          let a = 0, b = 0;
          for (let k = 1; k <= 4; k++) { if (m[(y + dy * k) * W + x + dx * k]) { a = k; break; } }
          for (let k = 1; k <= 4; k++) { if (m[(y - dy * k) * W + x - dx * k]) { b = k; break; } }
          if (a && b && a + b <= 6) { cand.push([x, y]); break; }
        }
      }
    for (let k = cand.length - 1; k > 0; k--) { const j = (rnd() * (k + 1)) | 0; [cand[k], cand[j]] = [cand[j], cand[k]]; }
    const done = [];
    for (const [x, y] of cand) {
      if (holes >= spec.holes) break;
      if (done.some(([px, py]) => Math.hypot(px - x, py - y) < 24 * SCALE)) continue;
      if (Math.hypot(x - core.x, y - core.y) < 24 * SCALE) continue;
      const saved = Uint8Array.from(kind);
      disc(W, H, x + 0.5, y + 0.5, GAP_GROUND / 2 + 0.6, (i) => { if (kind[i] === WALL) kind[i] = OPEN; });
      const after = walkFrom();
      const ok = after.every((v, k) => v >= before[k] * 0.85) && funnelHolds();
      if (!ok) { kind.set(saved); continue; }
      done.push([x, y]);
      holes++;
    }
  }
  say(`punched ${holes} holes`);
  // the drop zones' own ground, whatever the smoothing did to their mouths
  for (const z of spec.spawns) {
    if (z.zone === "ground") disc(W, H, z.x, z.y, z.r + 1, (i) => { if (kind[i] === WALL) kind[i] = OPEN; else if (kind[i] === DEEP) kind[i] = SHALLOW; });
    if (z.zone === "water") disc(W, H, z.x, z.y, z.r + 1, (i) => { if (kind[i] !== DEEP && kind[i] !== SHALLOW) kind[i] = DEEP; });
  }

  // ---------- paint ----------
  const floor = new Uint8Array(N), wall = new Uint8Array(N), blocked = new Uint8Array(N);
  const dRock = clearance(W, H, (i) => !isRock(i));
  const dWater = clearance(W, H, (i) => !isWater(i));
  const variant = (first, n = 3) => first + ((rnd() * n) | 0);

  // 7. floors by family, and THE WALL IS THE FLOOR'S WALL
  const fam = new Uint8Array(N); // index into spec.floors
  const famN = makeWarped(rnd, spec.floors.scale ?? 48, spec.floors.warp ?? 12, 3);
  const fams = spec.floors.families;
  const total = fams.reduce((a, f) => a + f.weight, 0);
  // the weights are AREAS: the noise is cut at its own quantiles, so a
  // family weighted 0.2 covers a fifth of the board whatever the noise's
  // spread happens to be
  const famV = new Float32Array(N);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) famV[y * W + x] = famN(x, y);
  const sorted = Float32Array.from(famV).sort();
  const cuts = [];
  let acc = 0;
  for (let k = 0; k < fams.length - 1; k++) { acc += fams[k].weight / total; cuts.push(sorted[Math.min(N - 1, Math.floor(acc * N))]); }
  for (let i = 0; i < N; i++) {
    let k = 0;
    while (k < cuts.length && famV[i] >= cuts[k]) k++;
    fam[i] = k;
  }
  const shallowF = spec.water?.shallow ?? FLOOR_SHALLOW_WATER, deepF = spec.water?.deep ?? FLOOR_DEEP_WATER;
  const flatN = makeNoise(rnd, 2);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x, f = fams[fam[i]];
      if (kind[i] === DEEP) { floor[i] = deepF; wall[i] = WALL_DEEP; blocked[i] = 1; continue; }
      if (kind[i] === SHALLOW) { floor[i] = shallowF; continue; }
      let fl = f.floor;
      if (spec.beach && dWater[i] <= spec.beach.depth + (flatN(x / 6, y / 6) - 0.5) * 2) fl = spec.beach.floor;
      else if (spec.flats && !isRock(i) && dRock[i] >= spec.flats.clear + (flatN(x / 14, y / 14) - 0.5) * 6) fl = spec.flats.floor;
      floor[i] = variant(fl);
      if (isRock(i)) {
        blocked[i] = 1;
        const wf = spec.beach && dWater[i] <= spec.beach.depth + 1 && spec.beach.wall != null ? spec.beach.wall : f.wall;
        wall[i] = variant(wf, 2);
      }
    }

  // 7b. forests: rock beside the forest floors becomes pines, in
  //     noise-shaped stands, never on a cell a walker uses
  const pines = [];
  if (spec.forest) {
    const fN = makeWarped(rnd, 26 * SCALE, 8 * SCALE, 2);
    const on = new Set(spec.forest.on);
    for (let y = 1; y < H - 1; y++)
      for (let x = 1; x < W - 1; x++) {
        const i = y * W + x;
        if (!isRock(i) || !on.has(fams[fam[i]].floor) || dWater[i] < 2) continue;
        // the stand: a noise threshold, and only within `depth` of open ground
        if (fN(x, y) < spec.forest.threshold || dRock[i] > 0) continue;
        const dOpen = (() => { let d = 99; for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) { const nx = x + dx, ny = y + dy; if (inb(nx, ny) && !isRock(ny * W + nx)) d = Math.min(d, Math.hypot(dx, dy)); } return d; })();
        if (dOpen > spec.forest.depth) continue;
        wall[i] = WALL_PINE;
        pines.push({ x: (x + 0.5) * CELL, y: (y + 0.5) * CELL, size: CELL * 1.5, rot: ((rnd() * 4) | 0) * (Math.PI / 2), kind: spec.forest.kind });
      }
  }

  // 7c. ruins: rectangles of basalt with broken dark walls, in the rooms
  const ruins = [];
  if (spec.ruins) {
    const clear = clearance(W, H, (i) => !isRock(i) && !isWater(i));
    for (let tries = 0; ruins.length < spec.ruins && tries < 400; tries++) {
      const rw = 5 * SCALE + ((rnd() * 6 * SCALE) | 0), rh = 5 * SCALE + ((rnd() * 6 * SCALE) | 0);
      const x0 = 12 + ((rnd() * (W - 24 - rw)) | 0), y0 = 12 + ((rnd() * (H - 24 - rh)) | 0);
      const cx = x0 + rw / 2, cy = y0 + rh / 2;
      // a ruin is painted after the opening, so it keeps its own gap: a
      // route's width of open ground round the whole rectangle
      if (clear[Math.round(cy) * W + Math.round(cx)] < Math.hypot(rw, rh) / 2 + ROUTE_MIN_GROUND) continue;
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
  }

  // 7d. clutter: each family's own, thick along the rock, thin in the
  //     open, never in a drop zone and never round the core
  const decor = [];
  const nearZone = (x, y) => spec.spawns.some((z) => Math.hypot(x + 0.5 - z.x, y + 0.5 - z.y) <= z.r + 2);
  for (let y = 1; y < H - 1; y++)
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      if (blocked[i] || isWater(i) || nearZone(x, y)) continue;
      if (Math.abs(x - core.x) < 7 * SCALE && Math.abs(y - core.y) < 7 * SCALE) continue;
      const set = CLUTTER[floor[i] - (floor[i] % 3)];
      if (!set) continue;
      const p = (dRock[i] <= 3 ? 0.028 : 0.005) * (spec.clutter ?? 1);
      if (rnd() >= p) continue;
      const d = set[(rnd() * set.length) | 0];
      decor.push({ x: (x + 0.5) * CELL, y: (y + 0.5) * CELL, size: CELL * d.tiles, rot: ((rnd() * 4) | 0) * (Math.PI / 2), kind: d.kinds[(rnd() * d.kinds.length) | 0] });
    }

  // 7e. THE ORE VEINS — where the run's income is (game/economy.ts: a
  //     drill stands on ore and nowhere else). Mindustry lays ore as noise
  //     blobs on the floor; here they are blobs of ORE_PATCH cells on open
  //     dry ground: two within reach of the core's clearing (the opening
  //     drills), the rest spread over the board and biased AWAY from the
  //     core, so expanding is what pays. Never in a drop zone, never under
  //     a hill, never in the water; a blob's edge is noise-ragged
  const ore = new Uint8Array(N);
  const oreN = makeNoise(rnd, 2);
  const isDry = (i) => !blocked[i] && !isWater(i) && !isRock(i);
  let veins = 0;
  const lay = (cx, cy, r) => {
    let cells = 0;
    disc(W, H, cx + 0.5, cy + 0.5, r + 1, (i, x, y) => {
      if (!isDry(i) || nearZone(x, y)) return;
      const d = Math.hypot(x + 0.5 - cx - 0.5, y + 0.5 - cy - 0.5) / r;
      if (d + (oreN(x / 3, y / 3) - 0.5) * 0.9 > 1) return;
      ore[i] = 1;
      cells++;
    });
    return cells;
  };
  const oreR = spec.ore?.r ?? 3 * SCALE;
  const want = spec.ore?.count ?? Math.round(10 * SCALE);
  // two veins in the core's clearing: the first drills go up before the
  // first wave, on ground the core already sees
  for (let k = 0, tries = 0; k < 2 && tries < 400; tries++) {
    const a = rnd() * Math.PI * 2, d = coreR * 0.45 + rnd() * coreR * 0.4;
    const x = Math.round(core.x + Math.cos(a) * d), y = Math.round(core.y + Math.sin(a) * d);
    if (!inb(x, y) || !isDry(y * W + x) || Math.abs(x - core.x) < 5 || Math.abs(y - core.y) < 5) continue;
    if (lay(x, y, Math.max(2, oreR - 1)) >= 4) { k++; veins++; }
  }
  // the rest over the board, spaced out, at least a clearing away from the core
  const laid = [];
  for (let tries = 0; veins < want && tries < want * 80; tries++) {
    const x = 8 + ((rnd() * (W - 16)) | 0), y = 8 + ((rnd() * (H - 16)) | 0), i = y * W + x;
    if (!isDry(i) || nearZone(x, y)) continue;
    if (Math.hypot(x - core.x, y - core.y) < coreR * 2.5) continue;
    if (laid.some(([px, py]) => Math.hypot(px - x, py - y) < 22 * SCALE)) continue;
    if (lay(x, y, oreR) >= 6) { laid.push([x, y]); veins++; }
  }
  let oreCells = 0;
  for (let i = 0; i < N; i++) if (ore[i]) oreCells++;
  say(`laid ${veins} ore veins, ${oreCells} cells`);

  const base = { x: core.x - 2, y: core.y - 2 };
  return { floor, wall, blocked, ore, kind, pines, decor, spawns: spec.spawns.map((z) => ({ x: z.x, y: z.y, r: z.r, zone: z.zone })), base, core, routes, ruins: ruins.length, holes, lumps, veins, log };
}

// ---------- checks ----------

export function check(spec, m) {
  const { floor, wall, blocked, spawns, base } = m;
  const fails = [];
  const say = (ok, msg) => { console.log(`${ok ? "  ok " : "FAIL "}${msg}`); if (!ok) fails.push(msg); };
  const wet = (i) => WATER_FLOORS.includes(floor[i] - (floor[i] % 3));
  const walk = (i) => blocked[i] === 0;
  const coreCells = [];
  for (let y = base.y; y < base.y + CORE; y++) for (let x = base.x; x < base.x + CORE; x++) coreCells.push(y * W + x);
  const pads = (z, pass) => { const out = []; disc(W, H, z.x, z.y, z.r, (i) => { if (pass(i)) out.push(i); }); return out; };

  // the core: open, dry, off every zone, one cell in from the rim
  say(coreCells.every((i) => walk(i) && !wet(i)), `core 5x5 at ${base.x},${base.y} is open dry ground`);
  say(spawns.every((z) => Math.hypot(z.x - m.core.x, z.y - m.core.y) > z.r + CORE), "no drop zone touches the core");

  // the hulls' goal: the water nearest the core, as the sim finds it
  let bestD = Infinity, goal = [];
  for (let i = 0; i < N; i++) if (wet(i)) bestD = Math.min(bestD, Math.hypot((i % W) + 0.5 - m.core.x, ((i / W) | 0) + 0.5 - m.core.y));
  for (let i = 0; i < N; i++) if (wet(i) && Math.hypot((i % W) + 0.5 - m.core.x, ((i / W) | 0) + 0.5 - m.core.y) <= bestD + 1.5) goal.push(i);

  // every zone reaches its goal, and by a way wide enough
  const dG = clearance(W, H, walk), dW = clearance(W, H, wet);
  const lens = [];
  const dCore = distances(coreCells, walk);
  for (const z of spawns) {
    if (z.zone === "boss" || z.zone === "air") continue;
    const water = z.zone === "water";
    const p = pads(z, water ? wet : walk);
    const seen = flood(W, H, p, water ? wet : walk);
    const target = water ? goal : coreCells;
    const reach = target.some((i) => seen[i]);
    say(p.length > 0 && reach, `${z.zone} zone (${z.x},${z.y}): ${p.length} pads, ${reach ? "reaches" : "DOES NOT reach"} its goal`);
    // a hull's goal is a shore cell, where the water is a cell or two
    // deep by definition, so the sea is measured to within a boat's
    // length of the goal rather than onto the beach itself
    const near = new Uint8Array(N);
    if (water) for (const g of target) disc(W, H, (g % W) + 0.5, ((g / W) | 0) + 0.5, 10, (i) => (near[i] = 1));
    const wide = widestRoute(W, H, water ? dW : dG, p, water ? (i) => near[i] === 1 : (i) => target.includes(i));
    const need = water ? ROUTE_MIN_WATER : ROUTE_MIN_GROUND;
    // where it pinches: flood a shade wider than the answer and name the
    // cells at the answer's width that the flood stops against
    let pinch = "";
    if (wide < need) {
      const dist = water ? dW : dG, r = wide / 2 + 0.6;
      const pass = (i) => dist[i] >= r;
      const seenA = flood(W, H, p.filter(pass), pass);
      const seenB = flood(W, H, (water ? [...near.keys()].filter((i) => near[i]) : target).filter(pass), pass);
      const at = [];
      // the bottleneck: a cell of the answer's width with the zone's flood
      // on one side of it and the goal's on the other
      const wideEnough = (i) => dist[i] >= wide / 2 - 0.3;
      const between = flood(W, H, [...Array(N).keys()].filter((i) => !seenA[i] && !seenB[i] && wideEnough(i) && [i - 1, i + 1, i - W, i + W].some((j) => j >= 0 && j < N && seenA[j])), (i) => !seenA[i] && !seenB[i] && wideEnough(i));
      for (let i = 0; i < N && at.length < 4; i++) {
        if (!between[i]) continue;
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
    say(spread <= 0.5, `walks to the core: ${lens.map((l) => `(${l.z.x},${l.z.y}) ${l.len.toFixed(0)}`).join(", ")} — spread ${(spread * 100).toFixed(0)}%`);
  }
  if (bestD !== Infinity) say(bestD <= (spec.coreWaterReach ?? 40), `nearest water to the core: ${bestD.toFixed(0)} cells`);

  // the funnel holds
  if (spec.funnel) {
    const cut = new Uint8Array(N);
    disc(W, H, spec.funnel.x, spec.funnel.y, spec.funnel.r, (i) => (cut[i] = 1));
    const pass = (i) => walk(i) && !cut[i];
    let leaks = 0;
    for (const z of spawns) {
      if (z.zone !== "ground") continue;
      const seen = flood(W, H, pads(z, pass), pass);
      if (coreCells.some((i) => seen[i])) leaks++;
    }
    say(leaks === 0, `funnel at (${spec.funnel.x},${spec.funnel.y}) r${spec.funnel.r}: ${leaks} zone(s) still reach the core when it is walled`);
  }

  // open == reachable
  const seen = flood(W, H, coreCells, walk);
  let orphan = 0;
  for (let i = 0; i < N; i++) if (walk(i) && !seen[i]) orphan++;
  say(orphan === 0, `orphan open cells: ${orphan}`);

  // the rim
  let rim = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if ((x === 0 || y === 0 || x === W - 1 || y === H - 1) && (!blocked[y * W + x] || wall[y * W + x] === WALL_DEEP)) rim++;
  say(rim === 0, `open rim cells: ${rim}`);

  // composition, the way Mindustry's reads
  let rock = 0, pine = 0, open = 0, shallow = 0, deep = 0;
  for (let i = 0; i < N; i++) {
    if (!blocked[i]) { open++; if (wet(i)) shallow++; }
    else if (wall[i] === WALL_DEEP) deep++;
    else if (wall[i] === WALL_PINE) pine++;
    else rock++;
  }
  const pct = (v) => `${((100 * v) / N).toFixed(0)}%`;
  console.log(`  -- ${W}x${H}: open ${pct(open)} (${pct(shallow)} of it ford)  rock ${pct(rock)}  forest ${pct(pine)}  deep ${pct(deep)}  ruins ${m.ruins}  holes ${m.holes}  lumps ${m.lumps}  props ${m.decor.length}  pines ${m.pines.length}`);
  const famCount = new Map();
  for (let i = 0; i < N; i++) { const g = floor[i] - (floor[i] % 3); famCount.set(g, (famCount.get(g) ?? 0) + 1); }
  console.log(`  -- floors: ${[...famCount].sort((a, b) => b[1] - a[1]).map(([g, c]) => `${g} ${pct(c)}`).join(", ")}`);
  say(open / N >= 0.15 && open / N <= 0.5, `open ground between 15% and 50%: ${pct(open)}`);
  say(rock > 8000 * SCALE * SCALE, `rock for towers: ${rock}`);
  let big = 0;
  for (let y = 0; y < H - 3; y++)
    for (let x = 0; x < W - 3; x++) {
      let ok = true;
      for (let dy = 0; dy < 4 && ok; dy++)
        for (let dx = 0; dx < 4; dx++) { const i = (y + dy) * W + x + dx; if (!blocked[i] || wall[i] === WALL_DEEP || wall[i] === WALL_PINE) { ok = false; break; } }
      if (ok) big++;
    }
  say(big > 200 * SCALE * SCALE, `4x4 turret footprints: ${big}`);
  say(m.veins >= 6, `ore veins: ${m.veins}`);
  return fails;
}

// ---------- the picture ----------

// the game's own tile tones (game/tiles.ts FLOOR_STYLE.base, WALL_STYLE.face)
const FLOOR_TONE = {
  [FLOOR_GRASS]: [0x6a, 0x9b, 0x52], [FLOOR_STONE]: [0x7c, 0x7c, 0x84], [FLOOR_DIRT]: [0x8f, 0x6b, 0x4a],
  [FLOOR_SAND]: [0xcf, 0xb4, 0x88], [FLOOR_DARKSAND]: [0x4a, 0x46, 0x44], [FLOOR_SHALLOW_WATER]: [0x4c, 0x6b, 0x9c],
  [FLOOR_DEEP_WATER]: [0x2f, 0x4d, 0x7a], [FLOOR_MOSS]: [0x6c, 0x47, 0x74], [FLOOR_SPORE_MOSS]: [0x71, 0x4a, 0x88],
  [FLOOR_MUD]: [0x37, 0x22, 0x20], [FLOOR_SHALE]: [0x5f, 0x5a, 0x80], [FLOOR_SNOW]: [0xe6, 0xec, 0xf2],
  [FLOOR_SALT]: [0xf0, 0xf1, 0xf5], [FLOOR_ICE]: [0xcf, 0xcf, 0xf6], [FLOOR_BASALT]: [0x41, 0x3e, 0x3e],
  [FLOOR_TAINTED_WATER]: [0x60, 0x4b, 0x94], [FLOOR_DEEP_TAINTED_WATER]: [0x44, 0x35, 0x6b],
};
const WALL_TONE = {
  [WALL_STONE]: [0x84, 0x84, 0x8f], [WALL_DIRT]: [0x9a, 0x72, 0x50], [WALL_DARK]: [0x47, 0x4c, 0x53],
  [WALL_SPORE]: [0x84, 0x57, 0x9a], [WALL_SHALE]: [0x75, 0x73, 0x9a], [WALL_SNOW]: [0xe9, 0xee, 0xf4],
  [WALL_ICE]: [0xd4, 0xd4, 0xfa], [WALL_SALT]: [0xf1, 0xf2, 0xf6], [WALL_SAND]: [0xdc, 0xc3, 0x9e],
  [WALL_DUNE]: [0x57, 0x53, 0x51], [WALL_DACITE]: [0x9f, 0x9f, 0xb4],
};
const PINE_TONE = { 0: [0x5a, 0x9c, 0x4c], 1: [0x8f, 0x5a, 0xa8], 2: [0xe4, 0xeb, 0xf2] };

export function preview(spec, m, SC = 2) {
  const { floor, wall, blocked, base } = m;
  const propAt = new Map();
  for (const p of m.decor) propAt.set(Math.floor(p.y / CELL) * W + Math.floor(p.x / CELL), 1);
  const shade = (c, k) => [c[0] * k | 0, c[1] * k | 0, c[2] * k | 0];
  return png(W * SC, H * SC, (X, Y) => {
    const x = (X / SC) | 0, y = (Y / SC) | 0, i = y * W + x;
    for (const z of m.spawns) {
      const d = Math.hypot(x + 0.5 - z.x, y + 0.5 - z.y);
      if (d <= z.r && d > z.r - 1.2)
        return z.zone === "water" ? [0x4f, 0xb0, 0xe8] : z.zone === "air" ? [0xff, 0xc9, 0x6b] : z.zone === "boss" ? [0xa0, 0x5a, 0xe5] : [0x7b, 0xe5, 0x8a];
    }
    if (x >= base.x && x < base.x + CORE && y >= base.y && y < base.y + CORE) return [0xff, 0xd3, 0x7f];
    if (m.ore[i]) return [0xd3, 0x91, 0x69];
    if (spec.funnel && Math.abs(Math.hypot(x + 0.5 - spec.funnel.x, y + 0.5 - spec.funnel.y) - spec.funnel.r) < 0.7) return [0xff, 0x40, 0x40];
    const f = floor[i] - (floor[i] % 3);
    if (!blocked[i] || wall[i] === WALL_DEEP) {
      const c = FLOOR_TONE[f] ?? [0xff, 0, 0xff];
      return propAt.has(i) ? shade(c, 0.7) : c;
    }
    if (wall[i] === WALL_PINE) return shade(PINE_TONE[m.pines.find((p) => Math.floor(p.x / CELL) === x && Math.floor(p.y / CELL) === y)?.kind ?? 0], (x + y) % 2 ? 0.55 : 0.85);
    const c = WALL_TONE[wall[i] === WALL_DARK || wall[i] === WALL_DARK + 1 ? WALL_DARK : wall[i] - (wall[i] % 2)] ?? [0xff, 0, 0xff];
    // rock is drawn darker than its floor and its edge darker still, the
    // way the wall shading and shadow read in the game
    const edge = [i - 1, i + 1, i - W, i + W].some((j) => j >= 0 && j < N && (!blocked[j] || wall[j] === WALL_DEEP));
    return shade(c, edge ? 0.5 : 0.78);
  });
}

// ---------- run ----------

export function run(authored, argv = process.argv.slice(2)) {
  const spec = scaleSpec(authored);
  const out = argv[0] ?? new URL(`../../public/maps/${spec.id}.json`, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
  console.log(`${spec.name} (${spec.id}), seed ${spec.seed.toString(16)}, ${W}x${H} (authored at ${W / SCALE}, x${SCALE}, openings x${WIDEN})`);
  const m = build(spec);
  const fails = check(spec, m);
  if (argv[1]) { writeFileSync(argv[1], preview(spec, m)); console.log(`  preview -> ${argv[1]}`); }
  if (fails.length && !process.env.FORCE) {
    console.log(`\nREFUSING TO WRITE: ${fails.length} check(s) failed (FORCE=1 to write anyway)`);
    process.exit(1);
  }
  const doc = {
    id: spec.id, name: spec.name, w: W, base: m.base,
    floor: Array.from(m.floor), wall: Array.from(m.wall), blocked: Array.from(m.blocked),
    ore: Array.from(m.ore),
    spawns: m.spawns, pines: m.pines, decor: m.decor,
  };
  writeFileSync(out, JSON.stringify(doc));
  console.log(`  wrote ${out}`);
  return m;
}
