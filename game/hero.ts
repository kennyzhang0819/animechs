// The hero prototype: one stationary gunner mech at the core, aimed skills,
// a one-direction corridor board, and a swarm that overlaps instead of
// shoving. Everything on this branch keys off HERO_MODE.
import { CELL } from "./constants";
import { FLOOR_DIRT, FLOOR_GRASS, FLOOR_SHALLOW_WATER, FLOOR_DEEP_WATER, WALL_DARK, WALL_DEEP } from "./mapgen";
import type { MapData } from "./maps";

export const HERO_MODE = true;
/** the core stands alone with no turrets round it, so it is this much tougher */
export const HERO_CORE_HP_MUL = 150;

export const CORRIDOR_COLS = 320;
export const CORRIDOR_ROWS = 112;
const RIM = 4;
const SPAWN_X0 = 296;
const SPAWN_X1 = 311;
const BASE_X = 14;
const BASE_SIZE = 10;

/** the held attack: shells landing under the cursor */
export const HERO_FIRE_RATE = 7;
export const HERO_FIRE_DMG = 400;
export const HERO_FIRE_RADIUS = 4 * CELL;
export const HERO_FIRE_JITTER = 1.5 * CELL;

/** Q — barrage: a ring of shells over a wide circle */
export const HERO_Q_CD = 8;
export const HERO_Q_SHELLS = 14;
export const HERO_Q_DMG = 1500;
export const HERO_Q_RADIUS = 6 * CELL;
export const HERO_Q_SPREAD = 14 * CELL;
export const HERO_Q_SALVO = 0.6;

/** W — lance: a beam the length of the board, through plating */
export const HERO_W_CD = 6;
export const HERO_W_DMG = 6000;
export const HERO_W_LEN = 160 * CELL;
export const HERO_W_HALF = 2.5 * CELL;
export const HERO_W_SHOVE = 1.2 * CELL;

export function corridorMap(seed: number): MapData {
  const w = CORRIDOR_COLS, h = CORRIDOR_ROWS, n = w * h;
  const floor = new Array<number>(n).fill(FLOOR_GRASS);
  const wall = new Array<number>(n).fill(0);
  const blocked = new Array<number>(n).fill(0);
  let s = seed >>> 0 || 1;
  const rnd = (): number => {
    s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (x < RIM || y < RIM || x >= w - RIM || y >= h - RIM) {
        blocked[i] = 1;
        wall[i] = WALL_DARK;
        continue;
      }
      if (rnd() < 0.08) floor[i] = FLOOR_DIRT;
    }
  // a river along the top: deep in the middle, shallow at both banks, open
  // at its west end so the ground walkers above it have a way round
  const RY0 = 10, RY1 = 20, RX0 = 70;
  for (let y = RY0; y <= RY1; y++)
    for (let x = RX0; x < w - RIM; x++) {
      const i = y * w + x;
      const deep = y > RY0 + 1 && y < RY1 - 1 && x > RX0 + 4;
      floor[i] = deep ? FLOOR_DEEP_WATER : FLOOR_SHALLOW_WATER;
      if (deep) { blocked[i] = 1; wall[i] = WALL_DEEP; }
    }
  const spawnTiles: number[] = [];
  for (let y = RIM; y < h - RIM; y++)
    for (let x = SPAWN_X0; x <= SPAWN_X1; x++) spawnTiles.push(y * w + x);
  return {
    id: "corridor",
    name: "The Line",
    w,
    base: { x: BASE_X, y: (h - BASE_SIZE) >> 1 },
    floor,
    wall,
    blocked,
    spawnTiles,
    props: [],
    marks: [],
  };
}
