export const COLS = 128;
export const ROWS = 72;
export const CELL = 20; // one Mindustry ground tile
export const W = COLS * CELL;
export const H = ROWS * CELL;
export const NCELLS = COLS * ROWS;
export const INF = 1e9;

export const MAX_UNITS = 22000;
// Dagger at true Mindustry scale: 1-tile hitbox, art overhanging 1.5x
// (48px art on a 32px tile)
export const UR = 10;
export const UNIT_SPRITE = 40;
// official dagger stats: 150 hp, speed 0.5 px/tick = 3.75 tiles/s
export const HP0 = 150;
export const UNIT_SPEED = 3.75 * CELL;

export const TOWER = {
  range: 190,
  cooldown: 0.11,
  dmg: 50, // 3 shots kill a dagger
  projSpd: 520,
} as const;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

// the old 64x36 layout scaled 2x onto the tile grid
export const OBSTACLES: Rect[] = [
  { x: 28, y: 0, w: 4, h: 26 },
  { x: 28, y: 46, w: 4, h: 26 },
  { x: 60, y: 18, w: 4, h: 36 },
  { x: 92, y: 0, w: 4, h: 24 },
  { x: 92, y: 50, w: 4, h: 22 },
  { x: 44, y: 32, w: 8, h: 8 },
  { x: 76, y: 8, w: 8, h: 6 },
  { x: 76, y: 58, w: 8, h: 6 },
  { x: 12, y: 16, w: 6, h: 4 },
  { x: 12, y: 52, w: 6, h: 4 },
  { x: 108, y: 28, w: 4, h: 16 },
];

export const BASE = { x: 120, y: 33, size: 5 }; // 5x5 core-nucleus, walkable goal cells

// damage tint per hp third — full hp renders the sprite as-is
// (gray armor, orange cell, like Mindustry); hits darken and redden it
export const HP_TINT: ReadonlyArray<readonly [number, number, number]> = [
  [0.65, 0.4, 0.38],
  [1.0, 0.72, 0.65],
  [1.0, 1.0, 1.0],
];

export const UNIT_COUNTS = [1000, 5000, 10000, 20000] as const;
export const DEFAULT_TARGET = 5000;

export const clamp = (v: number, a: number, b: number): number =>
  v < a ? a : v > b ? b : v;
