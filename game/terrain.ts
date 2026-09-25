import { BASE, clamp, COLS, NCELLS, ROWS } from "./constants";
import { forEachMarkPadCell, type MapMark } from "./missionMarks";
import type { RailTile } from "./missions";
import { WATER_FLOOR_GROUPS } from "./atlas";
import { PROP_KINDS, rollRot, TONE } from "./propArt";

/** a prop on the board — see docs/props.md */
export interface Prop {
  /** the top-left cell of its footprint; the footprint is PROP_KINDS[kind].tiles square */
  x: number;
  y: number;
  /** index into PROP_KINDS */
  kind: number;
  /** index into PROP_TONES: the tint a nature prop wears, the weathering on a made one */
  tone: number;
  /** quarter turns, 0..3, for a kind that turns; which painting, for one that does not */
  rot: number;
}

/** wall[] value meaning "this blocked cell is under a prop": its floor shows,
 *  the prop is drawn over it, a flyer crosses it. It was the pine sentinel,
 *  and the value is what every document on disk carries */
export const WALL_PROP = 4;

/** the props of a map, as the cells under them: 1 where a listed prop stands */
export function propMask(props: readonly Prop[], cols = COLS, rows = ROWS): Uint8Array {
  const m = new Uint8Array(NCELLS);
  for (const p of props) {
    const t = PROP_KINDS[p.kind]?.tiles ?? 1;
    for (let y = p.y; y < p.y + t; y++)
      for (let x = p.x; x < p.x + t; x++)
        if (x >= 0 && y >= 0 && x < cols && y < rows) m[y * COLS + x] = 1;
  }
  return m;
}

/** a small deterministic rng for whatever lays props down without a seed of its own */
const mulberry32 = (seed: number) => (): number => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/**
 * COVER A MASK OF CELLS WITH PROPS, the biggest that fit first: a forest
 * is oaks where three cells square are free, trees where two are, shrubs
 * on what is left, so every cell of the mask ends up under something. The
 * generator's fringe forests and the loader's legacy pine cells both come
 * through here. `tone` answers per cell.
 */
export function forestOf(
  mask: Uint8Array,
  tone: (i: number) => number,
  seed: number,
  kinds: { tiles: number; kind: number }[] = FOREST_KINDS,
): Prop[] {
  const rng = mulberry32(seed);
  const free = Uint8Array.from(mask);
  const cells: number[] = [];
  for (let i = 0; i < NCELLS; i++) if (mask[i]) cells.push(i);
  for (let k = cells.length - 1; k > 0; k--) {
    const j = (rng() * (k + 1)) | 0;
    [cells[k], cells[j]] = [cells[j], cells[k]];
  }
  const out: Prop[] = [];
  const sizes = [...new Set(kinds.map((k) => k.tiles))].sort((a, b) => b - a);
  for (const t of sizes) {
    const pick = kinds.filter((k) => k.tiles === t);
    for (const i of cells) {
      const x0 = i % COLS, y0 = (i / COLS) | 0;
      if (x0 + t > COLS || y0 + t > ROWS) continue;
      let ok = true;
      for (let y = y0; y < y0 + t && ok; y++)
        for (let x = x0; x < x0 + t; x++) if (!free[y * COLS + x]) { ok = false; break; }
      if (!ok) continue;
      for (let y = y0; y < y0 + t; y++) for (let x = x0; x < x0 + t; x++) free[y * COLS + x] = 0;
      const kind = pick[(rng() * pick.length) | 0].kind;
      out.push({ x: x0, y: y0, kind, tone: tone(i), rot: rollRot(kind, rng()) });
    }
  }
  return out;
}
const FOREST_KINDS = [
  { tiles: 3, kind: PROP_KINDS.findIndex((k) => k.id === "oak") },
  { tiles: 2, kind: PROP_KINDS.findIndex((k) => k.id === "tree") },
  { tiles: 1, kind: PROP_KINDS.findIndex((k) => k.id === "shrub") },
];
/** the tree a legacy pine of each forest kind grows into */
export const LEGACY_PINE_TONES: readonly number[] = [TONE.pine, TONE.mangrove, TONE.frost];

/**
 * wall[] value meaning "this blocked cell is DEEP WATER" — the second
 * sentinel, and the mirror image of the first.
 *
 * A blocked cell is normally a hill: nothing walks across it, and a turret
 * stands on it only with its whole footprint (board.ts groundClear).
 * The two sentinels are the blocked cells that are NOT hills, for opposite
 * reasons — a prop is a thing on the ground a flyer crosses, and deep water
 * is the naval layer's own road — so both keep their floor showing instead
 * of a wall sprite (see the renderer's showsFloor) and neither is in the
 * flyers' mask.
 *
 * SHALLOW WATER HAS NO SENTINEL AND WANTS NONE. It is an ordinary floor
 * index (FLOOR_SHALLOW_WATER) on an unblocked cell: ground units walk
 * across it at full speed and the flow field never learns it is there,
 * which is exactly the "wet ground you can march through" it should read
 * as. Mindustry slows units in its own shallow water (speedMultiplier
 * 0.5) and drowns them in deep — we take the drowning and skip the slow,
 * because a speed penalty is a pathfinding input and shallow water is
 * meant to cost the swarm nothing.
 */
export const WALL_DEEP = 7;

/**
 * IS THIS BLOCKED CELL A HILL? Every rock family is; the two sentinels are
 * not. Read this rather than testing WALL_PROP by hand — that test was the
 * whole rule when pines were the only exception, and a second exception is
 * exactly the kind of thing a scattered comparison misses.
 *
 * It answers what SIGHT stops at (airWalkMask, Sim.hasSight), what a
 * ground body cannot hit a building on (Sim.onHill) and, less the cells
 * under a prop, where a turret may stand (hillMask, board.ts groundClear).
 */
export const isBuildableWall = (wall: number): boolean =>
  wall !== WALL_PROP && wall !== WALL_DEEP;

/**
 * MAY A SPAWN TILE BE PAINTED HERE? Open ground, and deep water.
 *
 * "Enemies cannot spawn on hills" is the whole rule, and the deep is not
 * one: it is the naval layer's own road (navalWalkMask), so a fleet coming
 * in out at sea is a door and not a body dropped inside a wall. Rock and
 * props are walls to everything that walks and a place no flyer should
 * ever be dropped into, so they hold no pads.
 *
 * Read by the loader (maps.ts clampSpawn), by the brush (MapEditor) and by
 * nothing else — those two are the only places a spawn tile is created.
 * Both also keep a tile SPAWN_CORE_CLEAR cells off the core.
 */
export const canHoldSpawn = (blocked: number, wall: number): boolean =>
  !blocked || wall === WALL_DEEP;

/** no spawn tile within this many cells of the core's centre, whatever
 *  the ground: a door that close is a body already on the doorstep */
export const SPAWN_CORE_CLEAR = 80;
export const spawnClearOfCore = (x: number, y: number, base: { x: number; y: number; size: number }): boolean =>
  Math.hypot(x + 0.5 - (base.x + base.size / 2), y + 0.5 - (base.y + base.size / 2)) >= SPAWN_CORE_CLEAR;

/** does this cell show its floor rather than a wall sprite? true for open
 *  ground and for both sentinels — a prop and the water's surface are
 *  drawn over the floor, never instead of it */
export const showsFloorCell = (blocked: number, wall: number): boolean =>
  !blocked || wall === WALL_PROP || wall === WALL_DEEP;

/**
 * Is this floor index water of any kind? It is the whole definition of
 * where a naval tank runs at full pace (NAVAL_LAND_SPEED), the way
 * `blocked` is the whole definition of where a walker may not go.
 *
 * It reads the floor's GROUP against WATER_FLOOR_GROUPS rather than
 * comparing the index against FLOOR_SHALLOW_WATER, which is what it used
 * to do while the two waters were the last groups in the table. They are
 * not any more — a new floor family has to be appended, because its index
 * is baked into every map document on disk — so "above the waterline"
 * stopped meaning wet the first time a land family landed past them.
 */
export const isWaterFloor = (floor: number): boolean =>
  WATER_FLOOR_GROUPS.includes((floor / 3) | 0);

/**
 * The passability mask for the NAVAL layer: 1 where a naval tank cannot go.
 *
 * A naval tank is AMPHIBIOUS. This mask is the walkers' `blocked` with the
 * deep water taken back out of it — rock stops a tank exactly as it stops a
 * walker, and nothing else does. Shallow water was never in `blocked` at
 * all, so the whole difference between the two layers is the WALL_DEEP
 * sentinel: the one cell type the swarm must walk round and the fleet
 * drives straight through.
 *
 * It used to be the mirror image of `blocked` — every dry cell a wall —
 * which is what made a fleet a thing that could only ever play on a map
 * with a sea. Now the field is a superset of the walkers' and the water is
 * a shortcut rather than a moat, so a naval faction deploys on any map at
 * all; what water still buys is SPEED (NAVAL_LAND_SPEED), which is a fact
 * about the drive and not about the route.
 */
export function navalWalkMask(t: Terrain): Uint8Array {
  const m = new Uint8Array(t.blocked.length);
  for (let i = 0; i < m.length; i++) m[i] = t.blocked[i] && t.wall[i] !== WALL_DEEP ? 1 : 0;
  return m;
}

/**
 * The passability mask for the AIR layer: 1 on a HILL, 0 everywhere else.
 *
 * A flyer is not stopped by terrain — it can sit inside a mountain if a
 * crowd shoves it there — but it does not ROUTE through one. It reads a
 * field over this mask exactly as a walker reads one over `blocked`, so
 * the swarm comes over the same saddles and gaps a player can see on the
 * map instead of cutting one invisible straight line from its door to the
 * core. The two sentinels are open sky: a prop is something to fly over,
 * and deep water is the whole reason air and naval exist.
 *
 * It is `isBuildableWall` that decides what a hill is, and not by accident
 * — "rock standing above the floor" is one idea, and a second predicate
 * spelling it out again is a second place for the sentinel list to go
 * stale. Same set, for the same reason: what a flyer flies around is what
 * SIGHT stops at (Sim.hasSight).
 */
export function airWalkMask(t: Terrain): Uint8Array {
  const m = new Uint8Array(t.blocked.length);
  for (let i = 0; i < m.length; i++) m[i] = t.blocked[i] && isBuildableWall(t.wall[i]) ? 1 : 0;
  return m;
}

export interface Terrain {
  blocked: Uint8Array; // mountains, props, deep water — everything units can't cross
  floor: Uint8Array; // UV_FLOORS index per cell (prop cells: the ground underneath)
  wall: Uint8Array; // per blocked cell: UV_WALLS index, or a sentinel
  /**
   * WHERE THE SWARM ENTERS: the painted spawn layer, 1 a cell.
   *
   * The layer itself, not a cache of something else — it is what the map
   * document carries (MapData.spawnTiles) and what the brush paints. One
   * flat layer with no kinds in it: every unit picks its own tiles out of
   * it by its movement layer (Sim.padMaskFor), so nothing here has to know
   * that hulls like the wet ones.
   *
   * INVARIANT: a set cell is open ground (see maps.ts clampSpawn). The
   * loader clips the layer against `blocked` and every editor stroke that
   * raises rock takes its tiles back.
   */
  spawn: Uint8Array;
  /** everything standing on the ground or the hills (docs/props.md): every
   *  cell under one is blocked and wears WALL_PROP or its hill's rock, and
   *  the list is what is drawn */
  props: Prop[];
  valleyY: Float32Array; // carved main-valley centerline per column
  /** the mission furniture placed on this map (missionMarks.ts MapMark):
   *  where a mission's own things stand, and nothing about when */
  marks: MapMark[];
  /**
   * ...AND THE GROUND THOSE THINGS WILL RISE ON, as a mask: 1 on every cell
   * of metal decking a mark lays (missionMarks.ts forEachMarkPadCell).
   *
   * DERIVED FROM `marks` AND NEVER AUTHORED — rebuildReserved is the one
   * way it is filled, so the plate the renderer draws and the plate a
   * placement is refused on cannot drift apart. It is a mask rather than a
   * walk of the marks because a build cursor asks about it once per cell
   * of its footprint, every frame (board.ts groundClear).
   */
  reserved: Uint8Array;
  /**
   * THE RAIL BED, if this map carries a road mission: one painted piece a
   * cell (missions.ts railsFor, game/railArt.ts).
   *
   * It is DERIVED, not loaded. A map document says nothing about rails and
   * should not — the line lives in ROAD_SPECS, and a copy of it on disk
   * would be a second place for a corner to be wrong. The loader walks the
   * line for the map's own id and this is the answer; a document with no
   * road in that table gets an empty list and draws no bed.
   */
  rails: readonly RailTile[];
  /** this map's base: top-left cell + edge length, in cells */
  base: { x: number; y: number; size: number };
  /** how many columns of the grid this map actually uses — the horizontal
   * twin of `rows`. A document drawn on the old narrower board lands in the
   * left of the grid and the camera stops at its edge */
  cols: number;
  /** how many rows of the grid this map actually uses. Documents saved on a
   * shorter grid are padded with rock to fill the arrays (see
   * terrainFromMap), but the CAMERA stops at this height, so an older map
   * plays exactly as it did instead of panning into a dead rock apron */
  rows: number;
}

/** 3-octave value noise in [0,1] — a fresh random lattice per call */
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
    const cc = lattice(ix, iy + 1), d = lattice(ix + 1, iy + 1);
    return a + (b - a) * sx + (cc - a) * sy + (a - b - cc + d) * sx * sy;
  };
  return (x, y) =>
    val(x + ox, y + oy) * 0.55 +
    val((x + ox) * 2.17, (y + oy) * 2.17) * 0.28 +
    val((x + ox) * 4.31, (y + oy) * 4.31) * 0.17;
}

export function generateTerrain(seed: number): Terrain {
  const rng = mulberry32(seed);
  const elev = makeNoise(rng);
  const meander = makeNoise(rng);
  const patch = makeNoise(rng);

  const blocked = new Uint8Array(NCELLS);
  const floor = new Uint8Array(NCELLS);
  const wall = new Uint8Array(NCELLS);
  const mountain = new Uint8Array(NCELLS); // blocked minus forests/rocks, for floor fringes
  const forest = new Uint8Array(NCELLS);

  // mountains: noise elevation plus a hard bias toward the top/bottom rims.
  // the threshold is low enough that the interior is properly mountainous —
  // the carved lane below is the way through, not a shortcut across a plain
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const rim = Math.max(0, (12 - Math.min(y, ROWS - 1 - y)) / 12);
      const e = elev(x * 0.055, y * 0.055) + rim * rim * 0.55;
      if (e > 0.62) blocked[y * COLS + x] = 1;
    }
  }

  // baffle spurs: noisy full-height ranges across the middle of the map.
  // only the lane carves below punch through them, so the shortest path is
  // forced to actually ride the valley's curves instead of beelining.
  // The crest line wanders, the width breathes along the ridge, and it
  // swells into broad roots where the spur meets the top/bottom ranges —
  // so the ridges read as mountains instead of uniform bars
  const baseCy = BASE.y + BASE.size / 2;
  const spurXs: number[] = [];
  const spurs = 2 + (rng() < 0.6 ? 1 : 0);
  for (let s = 0; s < spurs; s++)
    spurXs.push(Math.round(COLS * (0.22 + ((s + 0.2 + rng() * 0.6) * 0.58) / spurs)));
  for (const sx of spurXs) {
    const w = 4 + rng() * 3;
    for (let y = 0; y < ROWS; y++) {
      const rim = Math.abs(y / (ROWS - 1) - 0.5) * 2; // 0 mid-map, 1 at the rims
      const drift = (meander(sx * 0.7, y * 0.045) - 0.5) * 8;
      // never thinner than 3.5: the per-cell edge noise below reaches -2,
      // and a spine thinner than that can open a hole clean through the
      // spur — a lane bypass, not a mountain
      const wy = Math.max(3.5, w * (0.55 + rim * rim * 1.6) + (elev(sx * 0.13, y * 0.11) - 0.5) * 5);
      const cx = sx + drift;
      for (let x = Math.max(0, Math.floor(cx - wy - 2)); x <= Math.min(COLS - 1, Math.ceil(cx + wy + 2)); x++)
        if (Math.abs(x - cx) < wy + (elev(x * 0.21, y * 0.21) - 0.5) * 4)
          blocked[y * COLS + x] = 1;
    }
  }

  // main valley centerline: waypoints at each spur with ALTERNATING offsets
  // from the midline, cosine-interpolated — consecutive spur holes are
  // guaranteed on opposite sides, so the lane serpentines by construction
  const valleyY = new Float32Array(COLS);
  const pts: Array<[number, number]> = [[0, clamp(baseCy + rng() * 30 - 15, 10, ROWS - 11)]];
  let side = rng() < 0.5 ? -1 : 1;
  for (const sx of spurXs) {
    pts.push([sx, clamp(baseCy + side * (12 + rng() * 9), 9, ROWS - 10)]);
    side = -side;
  }
  pts.push([COLS - 1, baseCy]);
  let seg = 0;
  for (let x = 0; x < COLS; x++) {
    while (seg < pts.length - 2 && x > pts[seg + 1][0]) seg++;
    const [x0, y0] = pts[seg], [x1, y1] = pts[seg + 1];
    const t = clamp((x - x0) / (x1 - x0), 0, 1);
    const ease = 0.5 - 0.5 * Math.cos(t * Math.PI);
    const drift = (meander(x * 0.03, 3.7) - 0.5) * 6;
    valleyY[x] = clamp(y0 + (y1 - y0) * ease + drift, 9, ROWS - 10);
  }
  const carve = (px: number, py: number, r: number): void => {
    const x0 = Math.max(0, Math.ceil(px - r)), x1 = Math.min(COLS - 1, Math.floor(px + r));
    const y0 = Math.max(0, Math.ceil(py - r)), y1 = Math.min(ROWS - 1, Math.floor(py + r));
    for (let yy = y0; yy <= y1; yy++)
      for (let xx = x0; xx <= x1; xx++) {
        const dx = xx - px, dy = yy - py;
        if (dx * dx + dy * dy <= r * r) blocked[yy * COLS + xx] = 0;
      }
  };
  // the lane pinches into a proper choke where it crosses each spur, and
  // breathes back open between them
  for (let x = 0; x < COLS; x++) {
    let w = 4.5 + meander(x * 0.09, 9.1) * 4;
    for (const sx of spurXs) {
      const d = Math.abs(x - sx);
      if (d < 10) w = Math.min(w, 3.1 + d * 0.4);
    }
    carve(x, valleyY[x], w);
  }

  // branch lane: a loop that leaves the valley and rejoins WITHIN one
  // segment between spurs — never through one, so it can't open a shortcut
  // hole that lets the path skip a serpentine bend
  const bounds: Array<[number, number]> = [];
  let prevEdge = 6;
  for (const sx of spurXs) {
    bounds.push([prevEdge, sx - 5]);
    prevEdge = sx + 5;
  }
  bounds.push([prevEdge, COLS - 16]);
  const wide = bounds.filter(([a, b]) => b - a >= 20);
  if (wide.length > 0) {
    const [bx0, bx1] = wide[(rng() * wide.length) | 0];
    const bSide = rng() < 0.5 ? -1 : 1;
    const bAmp = 9 + rng() * 8;
    for (let x = bx0; x <= bx1; x++) {
      const t = (x - bx0) / (bx1 - bx0);
      const by = clamp(valleyY[x] + bSide * Math.sin(t * Math.PI) * bAmp, 4, ROWS - 5);
      carve(x, by, 3.5 + meander(x * 0.11, 21.3) * 2.5);
    }
  }

  // forests: pine clumps scattered in the open land
  const clumps = 5 + ((rng() * 3) | 0);
  for (let n = 0; n < clumps; n++) {
    const fx = 14 + rng() * (COLS - 34), fy = 5 + rng() * (ROWS - 10);
    const r = 1.6 + rng() * 1.9;
    for (let yy = Math.max(1, Math.ceil(fy - r)); yy <= Math.min(ROWS - 2, fy + r); yy++)
      for (let xx = Math.max(8, Math.ceil(fx - r)); xx <= Math.min(COLS - 10, fx + r); xx++) {
        const dx = xx - fx, dy = yy - fy;
        if (dx * dx + dy * dy > r * r * (0.6 + rng() * 0.5)) continue;
        const i = yy * COLS + xx;
        if (blocked[i]) continue;
        blocked[i] = 1;
        wall[i] = WALL_PROP;
        forest[i] = 1;
      }
  }

  // rock blobs: bare stone that doubles as TOWER PLATFORMS — towers build
  // only on highground, so rocks near the lane are the player's real estate
  const rock = (rx: number, ry: number, r: number): void => {
    for (let yy = Math.max(1, Math.ceil(ry - r)); yy <= Math.min(ROWS - 2, ry + r); yy++)
      for (let xx = Math.max(8, Math.ceil(rx - r)); xx <= Math.min(COLS - 10, rx + r); xx++) {
        const dx = xx - rx, dy = yy - ry;
        if (dx * dx + dy * dy > r * r) continue;
        const i = yy * COLS + xx;
        if (!blocked[i]) {
          blocked[i] = 1;
          mountain[i] = 2; // outcrop: skip the dirt-slope fringe treatment
        }
      }
  };
  // a pair of platforms flanking every spur choke — the best spots overlook
  // the tightest part of the lane
  for (const sx of spurXs)
    for (const s of [-1, 1])
      rock(sx + rng() * 4 - 2, valleyY[sx] + s * (5 + rng() * 2), 1.7 + rng());
  // platforms strung along the rest of the lane, alternating sides
  for (let x = 13; x < COLS - 18; x += 6 + ((rng() * 5) | 0)) {
    const s = rng() < 0.5 ? -1 : 1;
    rock(x, valleyY[x] + s * (5.5 + rng() * 2.5), 1.2 + rng() * 1.2);
  }
  // and loose scatter rocks in the open basins
  const rocks = 10 + ((rng() * 5) | 0);
  for (let n = 0; n < rocks; n++)
    rock(12 + rng() * (COLS - 30), 4 + rng() * (ROWS - 8), 0.9 + rng() * 1.6);

  // guaranteed clearings: the spawn mouth on the left, the base on the right.
  // the mouth continues as a funnel that tapers into the carved lane, so
  // late-placed rocks can never pinch the swarm's way out of the strip
  for (let x = 0; x < 16; x++) {
    const cy = x < 7 ? valleyY[0] : valleyY[x]; // rectangular strip, then follow the lane
    const r = x < 7 ? 9 : Math.max(5, 9 - (x - 6) * 0.7);
    for (let y = Math.max(1, Math.ceil(cy - r)); y <= Math.min(ROWS - 2, Math.floor(cy + r)); y++)
      blocked[y * COLS + x] = 0;
  }
  // the southwest bay: a rock peninsula used to wall off the spawn strip's
  // lower half, squeezing those units through a 4-cell corridor along the
  // map edge. Carve an organic chain of clearings over it so the lower
  // spawn pocket opens straight into the first basin
  for (const [bx, by, br] of [
    [6, 45, 5], [7, 50, 6], [9, 55, 6], [12, 59, 5.5], [15, 61, 4.5],
  ] as const)
    carve(bx, by, br);
  for (let y = Math.max(0, BASE.y - 4); y < Math.min(ROWS, BASE.y + BASE.size + 4); y++)
    for (let x = BASE.x - 6; x < COLS; x++) blocked[y * COLS + x] = 0;

  for (let i = 0; i < NCELLS; i++) {
    if (blocked[i] && wall[i] !== WALL_PROP && !mountain[i]) mountain[i] = 1;
    if (forest[i] && !blocked[i]) forest[i] = 0; // a clearing took the tree
  }

  // floors: grass base with random meadow patches of dirt, then stone/dirt
  // fringes hugging the mountains so the slopes read as rocky ground
  const mountainNear = (x: number, y: number, r: number): boolean => {
    for (let yy = Math.max(0, y - r); yy <= Math.min(ROWS - 1, y + r); yy++)
      for (let xx = Math.max(0, x - r); xx <= Math.min(COLS - 1, x + r); xx++)
        if (mountain[yy * COLS + xx] === 1) return true;
    return false;
  };
  for (let y = 0; y < ROWS; y++)
    for (let x = 0; x < COLS; x++) {
      const i = y * COLS + x;
      const h = rng();
      if (mountainNear(x, y, 1)) floor[i] = 3 + ((h * 3) | 0);
      else if (mountainNear(x, y, 2)) floor[i] = h < 0.55 ? 3 + ((rng() * 3) | 0) : 6 + ((rng() * 3) | 0);
      else if (mountainNear(x, y, 3) && h < 0.45) floor[i] = 6 + ((rng() * 3) | 0);
      else if (patch(x * 0.12, y * 0.12) > 0.72) floor[i] = 6 + ((h * 3) | 0);
      else floor[i] = (h * 3) | 0;
    }

  // wall sprites: dirt slopes where the range meets open ground, stone deeper in
  for (let y = 0; y < ROWS; y++)
    for (let x = 0; x < COLS; x++) {
      const i = y * COLS + x;
      if (!blocked[i] || wall[i] === WALL_PROP) continue;
      let fringe = false;
      for (let yy = Math.max(0, y - 1); yy <= Math.min(ROWS - 1, y + 1) && !fringe; yy++)
        for (let xx = Math.max(0, x - 1); xx <= Math.min(COLS - 1, x + 1); xx++)
          if (!blocked[yy * COLS + xx]) { fringe = true; break; }
      const h = (rng() * 2) | 0;
      wall[i] = fringe && mountain[i] === 1 && rng() < 0.6 ? 2 + h : h;
    }

  const props = forestOf(forest, () => LEGACY_PINE_TONES[0], seed);

  // the spawn tiles: the open ground of the western strip, the same mouth
  // the spawner has always used — paint more of them in the editor
  const spawn = new Uint8Array(NCELLS);
  for (let y = 1; y < ROWS - 1; y++)
    for (let x = 0; x < 6; x++) {
      const i = y * COLS + x;
      if (!blocked[i]) spawn[i] = 1;
    }

  return {
    blocked, floor, wall, spawn, reserved: new Uint8Array(NCELLS), props, valleyY,
    // the generated fallback board carries no marks: they are authored,
    // and a board nobody authored has no mission furniture on it
    marks: [],
    // ...and no rails, for the same reason: a road is authored against a
    // map id (missions.ts ROAD_SPECS) and this board has none
    rails: [],
    base: { ...BASE }, rows: ROWS, cols: COLS,
  };
}

/** refill `reserved` from `marks` — called wherever the marks change */
export function rebuildReserved(t: Terrain): void {
  t.reserved.fill(0);
  for (const m of t.marks)
    forEachMarkPadCell(m, t.cols, t.rows, (x, y) => {
      t.reserved[y * COLS + x] = 1;
    });
}

/** the rock a turret may stand on (board.ts groundClear): every hill cell
 *  that is not under a listed prop */
export function hillMask(t: Terrain): Uint8Array {
  const under = propMask(t.props);
  const m = airWalkMask(t);
  for (let i = 0; i < NCELLS; i++) if (under[i]) m[i] = 0;
  return m;
}

/** a prop's health by its footprint: seven tenths of the turret band of the
 *  same size, times the turret scale (constants.ts towerMaxHp); no armour */
export const PROP_HP: Readonly<Record<number, number>> = { 1: 2000, 2: 6000, 3: 17000, 4: 42000, 6: 90000 };
export const propHpFor = (kind: number): number => PROP_HP[PROP_KINDS[kind]?.tiles ?? 1] ?? 2000;

/** a prop comes down: its own cells open; a hill's rock under one stays */
export function openPropCells(t: Terrain, p: Prop): void {
  const n = PROP_KINDS[p.kind]?.tiles ?? 1;
  for (let y = p.y; y < p.y + n; y++)
    for (let x = p.x; x < p.x + n; x++) {
      if (x < 0 || y < 0 || x >= COLS || y >= ROWS) continue;
      const i = y * COLS + x;
      if (t.wall[i] === WALL_PROP) { t.blocked[i] = 0; t.wall[i] = 0; }
    }
}
/** ...and the reverse, for a copy of the terrain catching up with a reset */
export function closePropCells(t: Terrain, p: Prop): void {
  const n = PROP_KINDS[p.kind]?.tiles ?? 1;
  for (let y = p.y; y < p.y + n; y++)
    for (let x = p.x; x < p.x + n; x++) {
      if (x < 0 || y < 0 || x >= COLS || y >= ROWS) continue;
      const i = y * COLS + x;
      if (t.blocked[i] === 0) { t.blocked[i] = 1; t.wall[i] = WALL_PROP; }
    }
}
/** hillMask, into an array something already holds by reference */
export function hillMaskInto(t: Terrain, out: Uint8Array): void {
  out.set(hillMask(t));
}
