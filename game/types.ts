export const TOWER_KINDS = ["duo", "hail", "salvo", "scatter", "fuse", "scorch"] as const;
export type TowerKind = (typeof TOWER_KINDS)[number];

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
  shotCount: number; // lifetime shots fired — picks the next barrel (ShootAlternate)
  // the predicted impact point in world px, fixed when the volley starts.
  // Artillery shells scale their lifetime by the muzzle's distance to it,
  // so they expire — and blast — on target instead of overflying it
  aimX: number;
  aimY: number;
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
  // Mindustry Bullet.collided: a piercing shot keeps flying and remembers
  // whom it already hit, so one flame tongue costs each unit exactly one
  // hit however many ticks it spends inside the hitbox. Unit IDS, not
  // indices — swap-remove reshuffles indices under us. null = no pierce
  pierced: number[] | null;
}

export const enum FxKind {
  Hit = 0,
  Death = 1,
  Breach = 2,
  Flak = 3,
  Shrapnel = 4,
  Heal = 5,
  HealWave = 6,
  ShieldWave = 7,
  Flame = 8,
  FlameHit = 9,
  Burning = 10,
  Absorb = 11,
  ShieldBreak = 12,
  Footfall = 13,
}

export interface Effect {
  x: number;
  y: number;
  age: number;
  ttl: number;
  kind: FxKind;
  rot?: number; // Shrapnel: ray direction (rad); ShieldBreak: polygon roll;
  // Footfall: the unit's rippleScale, which is the slot Mindustry itself
  // passes it in (Fx.unitLandSmall reads e.rotation as its size)
  len?: number; // Shrapnel: ray length (px); ShieldBreak: polygon radius
  sides?: number; // ShieldBreak: sides of the force field that just popped
  // Mindustry seeds Mathf.rand with the effect's entity id and replays the
  // same sequence every frame, so a particle keeps its own direction while
  // its distance grows. Effects with scattered particles carry that seed
  seed?: number;
}

/**
 * The outcome of a dev-tool save (maps, levels). The API routes explain
 * every refusal in their JSON body, so the client carries that text back to
 * the editor rather than collapsing it to a bare boolean — a save that
 * cannot succeed must at least say why.
 */
export type SaveResult = { ok: true } | { ok: false; error: string };

/**
 * The message behind a failed save response. Both dev routes answer with
 * `{ error }`, but a crashed route or a proxy can answer with anything, so
 * fall back to the status rather than showing "undefined" to the author.
 */
export async function explain(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: unknown };
    if (typeof body.error === "string" && body.error) return body.error;
  } catch {
    // not JSON — an HTML error page or an empty body
  }
  return `server said ${res.status} ${res.statusText}`.trim();
}
