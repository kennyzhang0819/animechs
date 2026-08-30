import { ALL_MOVE_BITS, BASE, CELL, clamp, COLS, LAYER_BIT, NCELLS, ROWS } from "./constants";
import { FLOOR_SHALLOW_WATER } from "./atlas";
import { fitSpawnCircles, rasterizeSpawns, type SpawnCircle } from "./maps";

export interface Prop {
  x: number; // world px, sprite center
  y: number;
  size: number; // fixed per sprite type — native tile scale, never randomized
  rot: number; // radians, quarter-turn steps so the pixel art stays crisp
  kind: number; // index into UV_DECOR (unused for pines)
}

/** random quarter-turn — props vary by rotation, never by size */
const quarterTurn = (rng: () => number): number => ((rng() * 4) | 0) * (Math.PI / 2);

/** wall[] value meaning "grass floor with a pine tree prop on top" */
export const WALL_PINE = 4;

/**
 * wall[] value meaning "this blocked cell is DEEP WATER" — the second
 * sentinel, and the mirror image of the first.
 *
 * A blocked cell is normally a hill: units cannot cross it and towers CAN
 * be built on it (canPlace in sim.ts). The two sentinels are the blocked
 * cells that are not hills, for opposite reasons — a pine forest is too
 * dense to stand a turret on, and deep water is too deep. Both keep their
 * floor showing instead of a wall sprite (see the renderer's showsFloor),
 * and neither takes a tower.
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
 * Can a tower stand on this blocked cell? Every rock family can; the two
 * sentinels cannot. Read this rather than testing WALL_PINE by hand — that
 * test was the whole rule when pines were the only exception, and a second
 * exception is exactly the kind of thing a scattered comparison misses.
 */
export const isBuildableWall = (wall: number): boolean =>
  wall !== WALL_PINE && wall !== WALL_DEEP;

/** does this cell show its floor rather than a wall sprite? true for open
 *  ground and for both sentinels — a pine's prop and the water's surface
 *  are drawn over the floor, never instead of it */
export const showsFloorCell = (blocked: number, wall: number): boolean =>
  !blocked || wall === WALL_PINE || wall === WALL_DEEP;

/**
 * Is this floor index water of either depth? The two water groups are the
 * top of the floor table (FLOOR_SHALLOW_WATER onward in atlas.ts), so the
 * test is a single comparison — and it is the whole definition of where a
 * naval hull may go, the way `blocked` is the whole definition of where a
 * walker may not.
 */
export const isWaterFloor = (floor: number): boolean => floor >= FLOOR_SHALLOW_WATER;

/**
 * The passability mask for the WATER layer: 1 where a hull cannot go, which
 * is every cell that is not water. It is the mirror of `blocked` — dry land
 * is a wall to a boat exactly as deep water is a wall to a walker — and it
 * is built here so the flow field can stay a general "field over a mask"
 * rather than learning what water is.
 */
export function waterWalkMask(t: Terrain): Uint8Array {
  const m = new Uint8Array(t.floor.length);
  for (let i = 0; i < m.length; i++) m[i] = isWaterFloor(t.floor[i]) ? 0 : 1;
  return m;
}

export interface Terrain {
  blocked: Uint8Array; // mountains, forests, rocks — everything units can't cross
  floor: Uint8Array; // UV_FLOORS index per cell (pine cells: the grass underneath)
  wall: Uint8Array; // per blocked cell: UV_WALLS index, or WALL_PINE
  /**
   * the authored drop zones. This is the SOURCE: `spawn` below is burned
   * from it (and from `blocked`) by rasterizeSpawns, so anything that moves
   * a circle or paints over one must re-derive the layer, never patch it
   */
  spawns: SpawnCircle[];
  /**
   * Where the swarm ENTERS, as a per-cell LAYER MASK of the same LAYER_BIT
   * bits the goal layer uses, plus LAYER_BIT.boss for the boss door. Zero
   * is "no zone covers this cell".
   *
   * A data layer — nothing paints these cells; the editor shows each zone
   * as its circle overlay, and this is burned from `spawns` by
   * rasterizeSpawns. A mask rather than an id because zones of different
   * layers may overlap, and a byte holding one id could only remember
   * whichever circle was painted last.
   */
  spawn: Uint8Array;
  /**
   * WHERE THE SWARM IS TRYING TO GET TO, as a per-cell LAYER MASK: the
   * LAYER_BIT bits (ground 1, air 2, water 4) of the movement layers that
   * count this cell as an exit. Zero means the cell is not an exit at all.
   *
   * EACH LAYER PATHS TO ITS OWN EXITS AND ONLY ITS OWN. The ground field
   * seeds its Dijkstra from the ground-bit cells, the water field from the
   * water-bit cells, and flyers pick the nearest air-bit cell — so a map
   * can land its air waves on the far side of a ridge its walkers have to
   * go round, which is the whole reason this stopped being one shared 0/1
   * layer. A layer with no exits anywhere falls back to the union of every
   * exit, and a map with none at all falls back to its core (see
   * Sim.exitsFor), so nothing is ever left without a destination.
   *
   * Empty on a map authored before exits existed; documents written before
   * the layer split carry a plain 0/1 `goal` array, which terrainFromMap
   * reads as ALL_MOVE_BITS — every layer, which is exactly what one
   * undifferentiated exit meant.
   */
  goal: Uint8Array;
  pines: Prop[]; // blocking tree cells, drawn as overhanging props
  decor: Prop[]; // non-blocking props: boulders, shrubs
  valleyY: Float32Array; // carved main-valley centerline per column
  /** this map's core: top-left cell + edge length, in cells */
  core: { x: number; y: number; size: number };
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

const mulberry32 = (seed: number) => (): number => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

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
  const pines: Prop[] = [];
  const decor: Prop[] = [];

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
  const coreCy = BASE.y + BASE.size / 2;
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
  const pts: Array<[number, number]> = [[0, clamp(coreCy + rng() * 30 - 15, 10, ROWS - 11)]];
  let side = rng() < 0.5 ? -1 : 1;
  for (const sx of spurXs) {
    pts.push([sx, clamp(coreCy + side * (12 + rng() * 9), 9, ROWS - 10)]);
    side = -side;
  }
  pts.push([COLS - 1, coreCy]);
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
        wall[i] = WALL_PINE;
        pines.push({
          x: (xx + 0.5) * CELL,
          y: (yy + 0.5) * CELL,
          size: CELL * 1.5, // 48px art on a 32px tile, like Mindustry
          rot: quarterTurn(rng),
          kind: 0,
        });
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

  // guaranteed clearings: the spawn mouth on the left, the core on the right.
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

  for (let i = 0; i < NCELLS; i++)
    if (blocked[i] && wall[i] !== WALL_PINE && !mountain[i]) mountain[i] = 1;
  // a cleared cell may keep a stale pine entry — drop props whose cell opened
  for (let k = pines.length - 1; k >= 0; k--) {
    const i = clamp((pines[k].y / CELL) | 0, 0, ROWS - 1) * COLS + clamp((pines[k].x / CELL) | 0, 0, COLS - 1);
    if (!blocked[i]) pines.splice(k, 1);
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
      if (!blocked[i] || wall[i] === WALL_PINE) continue;
      let fringe = false;
      for (let yy = Math.max(0, y - 1); yy <= Math.min(ROWS - 1, y + 1) && !fringe; yy++)
        for (let xx = Math.max(0, x - 1); xx <= Math.min(COLS - 1, x + 1); xx++)
          if (!blocked[yy * COLS + xx]) { fringe = true; break; }
      const h = (rng() * 2) | 0;
      wall[i] = fringe && mountain[i] === 1 && rng() < 0.6 ? 2 + h : h;
    }

  // boulders and shrubs sprinkled on open ground (purely decorative)
  const propTries = 130;
  for (let n = 0; n < propTries; n++) {
    const x = 7 + ((rng() * (COLS - 14)) | 0), y = 1 + ((rng() * (ROWS - 2)) | 0);
    const i = y * COLS + x;
    if (blocked[i]) continue;
    if (x >= BASE.x - 6 && y >= BASE.y - 4 && y < BASE.y + BASE.size + 4) continue;
    const shrub = floor[i] < 3 && rng() < 0.45; // shrubs only look right on grass
    decor.push({
      x: (x + 0.5) * CELL,
      y: (y + 0.5) * CELL,
      size: shrub ? CELL : CELL * 1.5, // native scale: 32px shrub, 48px boulder
      rot: quarterTurn(rng),
      kind: shrub ? 2 : (rng() * 2) | 0,
    });
  }

  // the drop zone: the open ground of the western strip, the same mouth the
  // spawner has always used, expressed as a circle covering it (region 1 —
  // place further zones in the editor)
  const strip = new Uint8Array(NCELLS);
  for (let y = 1; y < ROWS - 1; y++)
    for (let x = 0; x < 6; x++) {
      const i = y * COLS + x;
      if (!blocked[i]) strip[i] = 1;
    }
  const spawns = fitSpawnCircles(strip);
  const spawn = rasterizeSpawns(spawns, { blocked, floor });

  return {
    blocked, floor, wall, spawns, spawn, pines, decor, valleyY,
    // the procedural terrain has no authored exits, so it plays off its
    // core exactly as it always has (see Terrain.goal)
    goal: new Uint8Array(NCELLS),
    core: { ...BASE }, rows: ROWS, cols: COLS,
  };
}
