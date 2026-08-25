export interface Tower {
  gx: number; // top-left cell of the 2x2 footprint
  gy: number;
  x: number; // world-space center
  y: number;
  cd: number;
  angle: number;
}

export interface Projectile {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  age: number;
}

export const enum FxKind {
  Hit = 0,
  Death = 1,
  Breach = 2,
}

export interface Effect {
  x: number;
  y: number;
  age: number;
  ttl: number;
  kind: FxKind;
}
