import { BASE, CELL, clamp, COLS, NCELLS, ROWS } from "./constants";

export interface Prop {
  x: number; // world px, sprite center
  y: number;
  size: number;
  kind: number; // index into UV_DECOR (unused for pines)
}

/** wall[] value meaning "grass floor with a pine tree prop on top" */
export const WALL_PINE = 4;

export interface Terrain {
  blocked: Uint8Array; // mountains, forests, rocks — everything units can't cross
  floor: Uint8Array; // UV_FLOORS index per cell (pine cells: the grass underneath)
  wall: Uint8Array; // per blocked cell: UV_WALLS index, or WALL_PINE
  pines: Prop[]; // blocking tree cells, drawn as overhanging props
  decor: Prop[]; // non-blocking props: boulders, shrubs
  valleyY: Float32Array; // carved main-valley centerline per column
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

  // mountains: noise elevation plus a hard bias toward the top/bottom rims,
  // so the open land reads as a valley between two ranges
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const rim = Math.max(0, (11 - Math.min(y, ROWS - 1 - y)) / 11);
      const e = elev(x * 0.055, y * 0.055) + rim * rim * 0.55;
      if (e > 0.67) blocked[y * COLS + x] = 1;
    }
  }

  // main valley: a meandering centerline carved open, pulled toward the core
  // on the right so the lane always arrives
  const valleyY = new Float32Array(COLS);
  const coreCy = BASE.y + BASE.size / 2;
  let cy = 18 + rng() * (ROWS - 36);
  for (let x = 0; x < COLS; x++) {
    valleyY[x] = cy;
    const drift = (meander(x * 0.045, 3.7) - 0.5) * 3.4;
    const pull = (coreCy - cy) * (x > COLS * 0.7 ? 0.09 : 0.012);
    cy = clamp(cy + drift + pull, 9, ROWS - 10);
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
  for (let x = 0; x < COLS; x++) carve(x, valleyY[x], 5 + meander(x * 0.09, 9.1) * 4.5);

  // branch lane: leaves the valley, arcs away, rejoins downstream
  const bx0 = 18 + ((rng() * 14) | 0), bx1 = 84 + ((rng() * 22) | 0);
  const side = rng() < 0.5 ? -1 : 1;
  const amp = 12 + rng() * 9;
  for (let x = bx0; x <= bx1; x++) {
    const t = (x - bx0) / (bx1 - bx0);
    const by = clamp(valleyY[x] + side * Math.sin(t * Math.PI) * amp, 4, ROWS - 5);
    carve(x, by, 3.5 + meander(x * 0.11, 21.3) * 2.5);
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
          x: (xx + 0.5) * CELL + (rng() - 0.5) * 5,
          y: (yy + 0.5) * CELL + (rng() - 0.5) * 5,
          size: CELL * (1.35 + rng() * 0.35),
          kind: 0,
        });
      }
  }

  // rock outcrops: small blobs of bare stone wall inside the valley
  const rocks = 6 + ((rng() * 5) | 0);
  for (let n = 0; n < rocks; n++) {
    const rx = 12 + rng() * (COLS - 30), ry = 4 + rng() * (ROWS - 8);
    const r = 0.8 + rng() * 1.6;
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
  }

  // guaranteed clearings: the spawn mouth on the left, the core on the right
  for (let x = 0; x < 5; x++)
    for (let y = Math.max(1, valleyY[0] - 9); y <= Math.min(ROWS - 2, valleyY[0] + 9); y++)
      blocked[Math.round(y) * COLS + x] = 0;
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
      x: (x + 0.5) * CELL + (rng() - 0.5) * 8,
      y: (y + 0.5) * CELL + (rng() - 0.5) * 8,
      size: shrub ? CELL * (0.95 + rng() * 0.3) : CELL * (1.15 + rng() * 0.5),
      kind: shrub ? 2 : (rng() * 2) | 0,
    });
  }

  return { blocked, floor, wall, pines, decor, valleyY };
}
