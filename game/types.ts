export type TowerKind = "salvo" | "scatter" | "fuse";

export interface Tower {
  kind: TowerKind;
  gx: number; // top-left cell of the 2x2 footprint
  gy: number;
  x: number; // world-space center
  y: number;
  cd: number; // reload: seconds until the next volley is ready
  angle: number;
  burstLeft: number; // shots still queued in the current volley
  burstT: number; // seconds until the next queued shot fires
}

export interface Projectile {
  kind: TowerKind; // which tower's bullet stats drive it
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  age: number;
  // flak proximity fuse (Mindustry FlakBulletType): primeT < 0 means not
  // primed; once an enemy strays inside explodeRange it counts down to boom
  primeT: number;
  flakT: number; // seconds until the next proximity check
}

export const enum FxKind {
  Hit = 0,
  Death = 1,
  Breach = 2,
  Flak = 3,
  Shrapnel = 4,
}

export interface Effect {
  x: number;
  y: number;
  age: number;
  ttl: number;
  kind: FxKind;
  rot?: number; // Shrapnel: ray direction (rad)
  len?: number; // Shrapnel: ray length (px)
}
