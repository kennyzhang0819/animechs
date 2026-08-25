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

export const BASE = { x: 120, y: 33, size: 5 }; // 5x5 core-nucleus, walkable goal cells

// damage tint per hp third — full hp renders the sprite as-is
// (gray armor, orange cell, like Mindustry); hits darken and redden it
export const HP_TINT: ReadonlyArray<readonly [number, number, number]> = [
  [0.65, 0.4, 0.38],
  [1.0, 0.72, 0.65],
  [1.0, 1.0, 1.0],
];

export const clamp = (v: number, a: number, b: number): number =>
  v < a ? a : v > b ? b : v;
