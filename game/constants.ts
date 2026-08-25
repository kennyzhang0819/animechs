export const COLS = 64;
export const ROWS = 36;
export const CELL = 20;
export const W = COLS * CELL;
export const H = ROWS * CELL;
export const NCELLS = COLS * ROWS;
export const INF = 1e9;

export const MAX_UNITS = 22000;
export const UR = 2.4; // unit physics radius — constant at every count tier
export const HP0 = 3;

export const TOWER = {
  range: 150,
  cooldown: 0.11,
  dmg: 1,
  projSpd: 430,
} as const;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const OBSTACLES: Rect[] = [
  { x: 14, y: 0, w: 2, h: 13 },
  { x: 14, y: 23, w: 2, h: 13 },
  { x: 30, y: 9, w: 2, h: 18 },
  { x: 46, y: 0, w: 2, h: 12 },
  { x: 46, y: 25, w: 2, h: 11 },
  { x: 22, y: 16, w: 4, h: 4 },
  { x: 38, y: 4, w: 4, h: 3 },
  { x: 38, y: 29, w: 4, h: 3 },
  { x: 6, y: 8, w: 3, h: 2 },
  { x: 6, y: 26, w: 3, h: 2 },
  { x: 54, y: 14, w: 2, h: 8 },
];

export const BASE = { x: 59, y: 17 }; // 2x2 walkable goal cells

// tint per hp bucket (1, 2, 3 hp), applied to the white unit sprite
export const HP_TINT: ReadonlyArray<readonly [number, number, number]> = [
  [0.76, 0.18, 0.24],
  [0.96, 0.34, 0.23],
  [1.0, 0.54, 0.24],
];

export const UNIT_COUNTS = [1000, 5000, 10000, 20000] as const;
export const DEFAULT_TARGET = 5000;

export const clamp = (v: number, a: number, b: number): number =>
  v < a ? a : v > b ? b : v;
