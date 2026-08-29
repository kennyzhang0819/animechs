/**
 * Every Serpulo turret the campaign will ever field, in tech-tree order.
 *
 * ALL FIFTEEN ARE IMPLEMENTED — real stats, real ammo, drawn on the field,
 * and every one of them in the build menu. The last five were stubs
 * carrying a duo's bullet until they were given their own: swarmer's
 * homing missiles, cyclone's fragmenting flak, spectre's piercing twin
 * cannon, meltdown's held beam and foreshadow's rail shot.
 *
 * Three Serpulo turrets are deliberately absent. Wave and tsunami are
 * liquid turrets whose job is extinguishing fire, wetting units and healing
 * blocks — none of which exists here. Segment shoots down enemy bullets,
 * and our units never fire at buildings, so it would have nothing to
 * intercept. They come back if those systems ever do.
 */
export const TOWER_KINDS = [
  // implemented
  "duo",
  "hail",
  "salvo",
  "scatter",
  "fuse",
  "scorch",
  "arc",
  "lancer",
  "ripple",
  "parallax",
  // extreme and eradication
  "swarmer",
  "cyclone",
  "spectre",
  "meltdown",
  "foreshadow",
] as const;
export type TowerKind = (typeof TOWER_KINDS)[number];

export interface Tower {
  kind: TowerKind;
  gx: number; // top-left cell of the 2x2 footprint
  gy: number;
  x: number; // world-space center
  y: number;
  cd: number; // reload: seconds until the next volley is ready
  angle: number;
  // Turret.target under BaseTurret.targetInterval: the unit this turret is
  // tracking, held between the periodic re-picks rather than re-chosen
  // every tick. `target` is the unit's never-reused id (indices reshuffle
  // under swap-remove); `targetIdx` is only the last known index, a hint
  // revalidated against uid before use. -1 = nothing held. `targetT` is
  // seconds until the next scheduled re-pick
  target: number;
  targetIdx: number;
  targetT: number;
  burstLeft: number; // shots still queued in the current volley
  burstT: number; // seconds until the next queued shot fires
  shotCount: number; // lifetime shots fired — picks the next barrel (ShootAlternate)
  // the predicted impact point in world px, fixed when the volley starts.
  // Artillery shells scale their lifetime by the muzzle's distance to it,
  // so they expire — and blast — on target instead of overflying it
  aimX: number;
  aimY: number;
  // Mindustry shoot.firstShotDelay: seconds left of a queued volley's
  // charge, or -1 when nothing is charging. Lancer sets moveWhileCharging
  // false, so a charging turret also stops turning
  chargeT: number;
  // TractorBeamTurret's live beam: where it ends, and Mindustry's
  // `strength`, which lerps in as the beam catches and out as it lets go.
  // A tractor turret has no bullets, so this IS its whole visual state
  beamX: number;
  beamY: number;
  beamStr: number;
  // LaserTurret's held beam (meltdown). Mindustry pins the beam bullet to
  // the muzzle for shootDuration and then simply LETS GO of it: the last
  // fadeTime of beam stays where it was released while the turret is
  // already slewing off and reloading. So the beam carries its own origin
  // and heading rather than reading the turret's, which no longer match.
  // beamT < 0 is a turret that is not firing at all
  beamT: number; // seconds left of the burst: shootDuration, then fadeTime
  beamOX: number; // where the beam leaves — frozen the moment it is let go
  beamOY: number;
  beamRot: number;
  beamDmgT: number; // Bullet.timer(1, damageInterval): the beam's own clock
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
  // Bullet.timer(0, ...), the rolling clock ArtilleryBulletType.update
  // drops its trail puffs on. Left at 0 by everything else
  trailT: number;
  // a shot thrown by BulletType.createFrags rather than by a barrel: its
  // stats are the parent ammo's `frag.bullet`, not the turret's own. One
  // flag rather than a stats pointer keeps a projectile a flat record —
  // see bulletOf() in constants.ts
  frag: boolean;
}

export const enum FxKind {
  Death = 0,
  Breach = 1,
  Shrapnel = 2,
  Heal = 3,
  HealWave = 4,
  ShieldWave = 5,
  Absorb = 6,
  ShieldBreak = 7,
  Footfall = 8,
  Burning = 9,
  Lightning = 10,
  Laser = 11,
  // ---- what a bullet fires, one member per Mindustry Fx entry ---------
  Flame = 12, // Fx.shootSmallFlame
  FlameHit = 13, // Fx.hitFlameSmall
  Flak = 14, // Fx.flakExplosion
  /** Fx.hitBulletColor — and Fx.hitBulletSmall, which is the same effect
   *  with its ramp fixed to Pal.lightOrange, so one member covers both */
  BulletHit = 15,
  ShootSmall = 16, // Fx.shootSmall
  ShootBig = 17, // Fx.shootBig
  SmokeSmall = 18, // Fx.shootSmallSmoke
  SmokeBig = 19, // Fx.shootBigSmoke
  ArtilleryTrail = 20, // Fx.artilleryTrail
  Shockwave = 21, // Fx.shockwaveSmaller
  /** Fx.thoriumShoot and Fx.lightningShoot — again one shape, two colours */
  SparkShoot = 22,
  LancerShoot = 23, // Fx.lancerLaserShoot
  LancerCharge = 24, // Fx.lancerLaserCharge over Fx.lancerLaserChargeBegin
  HitLancer = 25, // Fx.hitLancer
  BlastExplosion = 26, // Fx.blastExplosion — swarmer's warhead
  PlasticExplosion = 27, // Fx.plasticExplosion — cyclone's
  InstShoot = 28, // Fx.instShoot — foreshadow's muzzle
  InstHit = 29, // Fx.instHit
  InstTrail = 30, // Fx.instTrail, laid every 20 units down the rail line
  InstBomb = 31, // Fx.instBomb, where a rail shot runs out unspent
  RailHit = 32, // Fx.railHit, at each body the rail punches through
  SmokeCloud = 33, // Fx.smokeCloud
  HitMeltdown = 34, // Fx.hitMeltdown
  SmokeBig2 = 35, // Fx.shootBigSmoke2 — meltdown's, wider than shootBigSmoke
  /** Fx.unitSpawn: the entrance. Two copies of the arriving unit's OWN
   *  sprite — one shrinking onto it out of nothing, one counter-rotated
   *  underneath fading away. WaveSpawner.spawnEffect fires it on every
   *  unit a wave puts on the map */
  UnitSpawn = 36,
  /** Fx.spawn: the accent square that snaps out where a unit finished
   *  arriving. Mindustry runs it 30 ticks BEHIND unitSpawn, which is
   *  exactly when the unit stops being unmoving and walks */
  Spawn = 37,
}

/** an r,g,b triple in 0..1, the form every draw call wants */
export type RGB = readonly [number, number, number];

export interface Effect {
  x: number;
  y: number;
  age: number;
  ttl: number;
  kind: FxKind;
  /**
   * Effect.at(x, y, rotation, color)'s last argument. Mindustry hands a
   * colour to any effect whose look is the AMMO's rather than its own —
   * hitBulletColor ramps to it, artilleryTrail is drawn in it — and the
   * effects that carry their own palette simply ignore it
   */
  col?: RGB;
  rot?: number; // Shrapnel: ray direction (rad); ShieldBreak: polygon roll;
  // Footfall: the unit's rippleScale, which is the slot Mindustry itself
  // passes it in (Fx.unitLandSmall reads e.rotation as its size)
  len?: number; // Shrapnel: ray length (px); ShieldBreak: polygon radius;
  // Laser: how far the beam actually reached before its pierce cap stopped it
  /** Lightning: the bolt's path, x,y pairs — Mindustry hands Fx.lightning
   * the very Seq<Vec2> the walk built, and the effect just strokes it */
  pts?: readonly number[];
  sides?: number; // ShieldBreak: sides of the force field that just popped
  /** Effect.data. Only unitSpawn carries one: the UnitKind id whose sprite
   *  the effect draws, since the entrance IS the unit's own art */
  unit?: number;
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
