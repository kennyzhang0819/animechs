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
// wall-clearance radius (px): strictly under CELL/2, so a 1-tile corridor
// leaves a (CELL - 2*WALL_R)px window a unit can actually thread. UR stays
// the unit-vs-unit and projectile-hit radius
export const WALL_R = 7;
export const UNIT_SPRITE = 40;
// official dagger stats: 150 hp, speed 0.5 px/tick = 3.75 tiles/s
export const HP0 = 150;
export const UNIT_SPEED = 3.75 * CELL;

// Mindustry's world scale: 8 world units per tile, 60 ticks per second.
// Stats copied from the official repo convert through these.
const MU = CELL / 8; // px per Mindustry world unit
const TICK = 60; // ticks per second

export interface BulletStats {
  speed: number; // px/s
  damage: number; // direct-hit damage
  lifetime: number; // s (Mindustry limitRange: how far a shot can fly)
  splash: number; // splash damage at the blast center (0 = none)
  splashRadius: number; // px
  hitsWalls: boolean; // false = flies over terrain (collidesGround = false)
  flak?: {
    explodeRange: number; // px — proximity fuse trigger radius
    explodeDelay: number; // s between priming and the blast
    interval: number; // s between proximity checks
  };
}

export interface TowerStats {
  name: string;
  range: number; // px
  reload: number; // s per volley
  shots: number; // bullets per volley
  shotDelay: number; // s between a volley's bullets
  inaccuracy: number; // rad, each shot offset uniformly within ±this
  shootCone: number; // rad — fire only when aimed this close to the target
  rotateSpeed: number; // rad/s
  bullet: BulletStats;
}

export const TOWERS: Record<import("./types").TowerKind, TowerStats> = {
  salvo: {
    name: "Salvo",
    range: 190,
    reload: 0.11,
    shots: 1,
    shotDelay: 0,
    inaccuracy: 0,
    shootCone: Math.PI * 2,
    rotateSpeed: Infinity,
    bullet: {
      speed: 520,
      damage: 50, // 3 shots kill a dagger
      lifetime: (190 + 50) / 520,
      splash: 0,
      splashRadius: 0,
      hitsWalls: true,
    },
  },
  // Scatter, 1:1 from mindustry/content/Blocks.java with lead ammo
  // (FlakBulletType(4.2, 3), splash 27*1.5 in a 15-unit radius). One
  // deviation: targetGround is false upstream (pure anti-air) — here it
  // targets the ground swarm, since that's all there is to shoot.
  scatter: {
    name: "Scatter",
    range: 220 * MU,
    reload: 18 / TICK,
    shots: 2,
    shotDelay: 5 / TICK,
    inaccuracy: (17 * Math.PI) / 180,
    shootCone: (35 * Math.PI) / 180,
    rotateSpeed: ((15 * Math.PI) / 180) * TICK,
    bullet: {
      speed: 4.2 * TICK * MU,
      damage: 3,
      lifetime: (220 + 2 + 10) / 4.2 / TICK, // limitRange(2) + base 10-unit margin
      splash: 27 * 1.5,
      splashRadius: 15 * MU,
      hitsWalls: false, // flak shells arc over terrain
      flak: {
        explodeRange: 30 * MU,
        explodeDelay: 5 / TICK,
        interval: 6 / TICK,
      },
    },
  },
};

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
