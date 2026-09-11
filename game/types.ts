/**
 * Every Serpulo turret the campaign will ever field, in tech-tree order.
 *
 * EVERY ONE OF THEM IS IMPLEMENTED — real stats, real ammo, drawn on the
 * field. Two of them, the menders, are RETIRED for now and dealt to nobody
 * (RETIRED_KINDS below); the other seventeen are what the deal draws from
 * (rarity.ts) and what the track hands out. The late five were stubs
 * carrying a duo's bullet until they were given their own: swarmer's
 * homing missiles, cyclone's fragmenting flak, spectre's piercing twin
 * cannon, meltdown's held beam and foreshadow's rail shot.
 *
 * Wave and tsunami are the liquid turrets, and they are the roster's one
 * DELIBERATE DEVIATION rather than a 1:1 port. Upstream their water shoves
 * units back (knockback) and wets them for a 0.94x speed multiplier — a
 * nudge, because their real jobs there are extinguishing fire and healing
 * blocks, neither of which exists here. Here the wet status IS the weapon:
 * no push, and the slow is deep (see BulletStats.wet). Their trivial
 * contact damage is kept — the number on the tin is honest about what they
 * are for.
 *
 * One Serpulo turret stays deliberately absent. Segment shoots down enemy
 * bullets, and our units never fire at buildings, so it would have nothing
 * to intercept. It comes back if that system ever does.
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
  "wave",
  "parallax",
  "tsunami",
  // the support pair: they shoot nothing and heal the line instead
  "mender",
  "mendProjector",
  // extreme and nemesis
  "swarmer",
  "cyclone",
  "spectre",
  "meltdown",
  "foreshadow",
] as const;
export type TowerKind = (typeof TOWER_KINDS)[number];

/**
 * RETIRED FOR NOW — implemented, drawn, priced, and dealt to nobody.
 *
 * The two menders are the support pair, and the support pair is off the
 * field while the deal (rarity.ts) is being built: a block that heals the
 * line is a different decision from a block that shoots it, and a card
 * dealt at random is the wrong door to hand one through. Everything about
 * them stays — Sim.updateMender, their stats, their upgrades, their
 * sprites — so putting them back is deleting a name from this list.
 *
 * Nothing outside this file should special-case a kind: read FIELDED_KINDS
 * and the retired ones are simply not there.
 */
export const RETIRED_KINDS: readonly TowerKind[] = ["mender", "mendProjector"];

const RETIRED = new Set<TowerKind>(RETIRED_KINDS);

/** is this kind off the field for now? */
export const isRetired = (kind: TowerKind): boolean => RETIRED.has(kind);

/** every turret the game actually fields — the roster the track deals from,
 *  the deal draws from and the build card is built out of */
export const FIELDED_KINDS: readonly TowerKind[] = TOWER_KINDS.filter((k) => !RETIRED.has(k));


/**
 * THE CORE — the one structure the swarm is on the map to destroy, and the
 * one it cannot be without. It stands where a map's base does (terrain.base),
 * it is in the structure grid like a turret (Sim.cellTower) so every unit's
 * weapons find it the way they find a wall across the lane, and its health
 * pool (CORE_HP) is the run: at zero the run is lost. Nothing sells it,
 * nothing buries it, and it fires nothing.
 */
export interface Core {
  core: true;
  gx: number;
  gy: number;
  size: number;
  x: number;
  y: number;
  hp: number;
  hpMax: number;
}

/** anything the swarm can shoot: a turret, or the core */
export type Structure = Tower | Core;
export const isCore = (s: Structure): s is Core => "core" in s;



/**
 * A STRUCTURE ON THE BOARD. THERE IS NO CONSTRUCTION STATE: one used to go
 * up as a 1 hp shell and stand up for real only when a timer ran out, and
 * that timer is gone. A turret is DEALT now (rarity.ts) and a dealt card
 * is already paid for, so the seconds between the click and the gun were a
 * second tax on a decision already made — and worse, a card with ten
 * seconds of life on it could expire while the thing it bought was still
 * scaffolding. Everything is placed finished, full pool, shooting.
 */
export interface Tower {
  kind: TowerKind;
  gx: number; // top-left cell of the size x size footprint (TOWERS[kind].size)
  gy: number;
  x: number; // world-space center
  y: number;
  /**
   * The tower's health pool (towerMaxHp in constants.ts). A STRUCTURE
   * DIES: at zero it is wrecked and gone (Sim.damageTower), its ground
   * open again. Every unit attack-moves at the player's structures
   * (Sim.updateUnitWeapons) and this pool is what they chew on; the
   * Volatile mutator's blast reaches it too (Sim.volatileBlast).
   */
  hp: number;
  /**
   * Which shield tower this tower's current volley is aimed at, as an index into
   * Sim.shieldTowers — or -1, the usual case, when it is aimed at a unit. The
   * instant weapons (laser, lightning, rail, ray, the held beam) damage
   * their target directly rather than via a projectile, so fireShot has to
   * know when "the target" is a shield tower and not a unit index.
   */
  aimShieldTower: number;
  cd: number; // reload: seconds until the next volley is ready
  /**
   * How fast this tower's reload runs: 1 everywhere, HYDROPHOBIC_RATE on
   * a tower built near water while the Hydrophobic rule is in force (see
   * mutation.ts). Fixed when the tower is PLACED — the water does not
   * move, so nothing re-reads it.
   */
  fireRate: number;
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

/**
 * A UNIT'S SHOT IN FLIGHT — a bullet, missile or shell fired at a
 * structure (Sim.updateUnitWeapons). A flat record like Projectile, but
 * its own list: it hits STRUCTURES, by the cell it is over, and never a
 * unit, so it runs none of the swarm's collision machinery. `tx, ty` is
 * where a shell was aimed — it bursts there when its life runs out even
 * if it hit nothing on the way.
 */
export interface EnemyShot {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  /** seconds flown — with `life` it is the shot's fin/fout, which is what
   *  its sprite shrinks on (BasicBulletType.draw) */
  age: number;
  damage: number;
  splash: number;
  splashRadius: number;
  /** how it is drawn and what it leaves where it lands — the weapon's
   *  ShotLook, shared by every shot that weapon fires */
  look: import("./weapons").ShotLook;
  /** a bomb (BombBulletType, collides = false) falls where it was dropped
   *  and bursts when its fuse runs out; nothing it passes over is hit */
  collide: boolean;
  /** ArtilleryBulletType.update's trail clock, and the missiles' chance
   *  roll — see Sim.updateEnemyShots */
  trailT: number;
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
  // fired by one of the SWARM's turrets (Tower.team): it flies past every
  // unit and lands on the player's structures, by the cell it is over —
  // the enemy shots' rule (updateEnemyShots) on the turrets' own bullets
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
  /** Fx.wet — StatusEffects.wet's flicker, burning's blue counterpart:
   *  a water-coloured droplet fading off a soaked unit at effectChance
   *  per tick */
  Wet = 38,
  ShootLiquid = 39, // Fx.shootLiquid — the spray a liquid turret's muzzle throws
  HitLiquid = 40, // Fx.hitLiquid — droplets scattering where an orb lands
  DamageSmoke = 41, // the soot a hurt unit sheds — this game's own, see Sim.updateStatus
  // ---- what the swarm's own weapons draw (game/weapons.ts) -------------
  /** SapBulletType.draw: the spider line, a Drawf.laser from the mount to
   *  the target that retracts onto the mount as it fades. `sides` names
   *  its SapStyle, `len`/`rot` where it reached */
  Sap = 42,
  /** Fx.chainLightning — EnergyFieldAbility's damageEffect: a straight
   *  jittered chain from the unit to each thing its field hit, white
   *  washing into its colour. The path rides fxPts like a bolt's */
  ChainLightning = 43,
  Pulverize = 44, // Fx.pulverize — the crawler's own burst
  SapExplosion = 45, // Fx.sapExplosion — the purple artillery's landing
  MassiveExplosion = 46, // Fx.massiveExplosion — bryde's shell
  RailShoot = 47, // Fx.railShoot — omura's muzzle
  RailTrail = 48, // Fx.railTrail — laid every 60 units down omura's line
  /** navanax's emp burst: the ring at the splash radius (`len`) with ten
   *  spikes on its rim, and the flash inside it */
  EmpHit = 49,
  EmpTrail = 50, // the emp round's trailEffect — two wings across its line
  HitLaserBlast = 51, // Fx.hitLaserBlast — a laser's landing, in its colour
  HitMeltHeal = 52, // Fx.hitMeltHeal — where a green beam rests
  HitLaser = 53, // Fx.hitLaser — a heal bolt's landing
  GreenCloud = 54, // Fx.greenCloud — the retusa torpedo's afterglow
  /** ExplosionEffect with a style (`sides` into EXPLOSION_STYLES): cyerce's
   *  plasma missile and the disrupt missile's burst */
  Explosion = 55,
  ShootBig2 = 56, // Fx.shootBig2 — the big artillery's muzzle
  HitEmpSpark = 57, // Fx.hitEmpSpark — the emp cannon's muzzle spray
  ShootHeal = 58, // Fx.shootHeal — a heal-coloured shootSmall
}

/** an r,g,b triple in 0..1, the form every draw call wants */
export type RGB = readonly [number, number, number];

/**
 * The shape of one effect AS THE DRAW HELPERS READ IT. The sim no longer
 * stores effects as objects of this shape — they live in flat typed
 * arrays on Sim (fxX/fxY/fxAge/..., see the pool there), because a
 * fuse-heavy board pushes thousands a second and an object per push was
 * steady GC pressure. The renderer refills one reused view of this shape
 * per effect per frame, so every field's meaning below is unchanged.
 */
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
