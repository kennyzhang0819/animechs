import { FxKind, type RGB } from "./types";

/**
 * THE GRID: 512 cells square. It was 256 — Mindustry's Ground Zero — while
 * the game was a tower defence played on one lane; an RTS run expands
 * outward over 18 to 26 minutes and wants ground to expand INTO, so every
 * map is drawn at twice the width and twice the height (scripts/maps/
 * mindustry.mjs SCALE), and the openings are wider again on top of that.
 * A document narrower than this lands in the top-left of the grid with
 * rock around it (maps.ts terrainFromMap) and the camera stops at its edge.
 */
export const COLS = 512;
export const ROWS = 512;
export const CELL = 20; // one Mindustry ground tile
export const W = COLS * CELL;
export const H = ROWS * CELL;
export const NCELLS = COLS * ROWS;
export const INF = 1e9;

/**
 * THE MOST BODIES THE FIELD HOLDS AT ONCE. The late script sends waves in
 * the thousands and a swarm mutator (Mitosis) multiplies them, so the
 * ceiling is where the fifty-wave campaign wants it: every per-unit array
 * and the renderer's dynamic batch are sized by it.
 */
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
export const MU = CELL / 8; // px per Mindustry world unit
const TICK = 60; // ticks per second

const pal = (hex: number): RGB => [
  ((hex >> 16) & 255) / 255,
  ((hex >> 8) & 255) / 255,
  (hex & 255) / 255,
];
/**
 * mindustry/graphics/Pal.java, plus the two Arc greys its effects ramp
 * through. An ammo type tints its shot AND every effect around that shot
 * in a pair of these, so they belong with the stats rather than as
 * literals scattered over the draw sites.
 */
export const PAL = {
  bulletYellow: pal(0xfff8e8),
  bulletYellowBack: pal(0xf9c27a),
  copperAmmoFront: pal(0xeac1a8),
  copperAmmoBack: pal(0xd39169),
  graphiteAmmoFront: pal(0xdae1ee),
  graphiteAmmoBack: pal(0x7d89d8),
  thoriumAmmoFront: pal(0xffffff),
  thoriumAmmoBack: pal(0xf595be),
  thoriumPink: pal(0xf9a3c7),
  lancerLaser: pal(0xa9d8ff),
  accent: pal(0xffd37f),
  missileYellow: pal(0xffd2ae),
  missileYellowBack: pal(0xe58956),
  blastAmmoFront: pal(0xeeab89),
  blastAmmoBack: pal(0xe9665b),
  plastaniumFront: pal(0xfffac6),
  plastaniumBack: pal(0xd8d97f),
  orangeSpark: pal(0xd2b29c),
  meltdownHit: pal(0xffb98b),
  lightOrange: pal(0xf68021),
  /** Liquids.water.color — not a Pal entry upstream, but it plays the same
   *  role here an ammo colour pair does: the liquid turrets' orb, their
   *  muzzle spray, their splash and the wet flicker are all drawn in it */
  water: pal(0x596ab8),
  lighterOrange: pal(0xf6e096),
  white: pal(0xffffff),
  lightGray: pal(0xbfbfbf), // Arc Color.lightGray
  gray: pal(0x7f7f7f), // Arc Color.gray
  lightishGray: pal(0xa2a2a2),
  stoneGray: pal(0x8f8f8f),
  /** Pal.heal — the support line's whole palette: nova's bolts, pulsar's
   *  arcs, quasar's and corvus's beams, the naval support's plasma */
  heal: pal(0x98ffa9),
  /** the crawler line's purple: Pal.sap is the light, sapBullet the
   *  beam and shell face, sapBulletBack the shell rim and the blast sparks */
  sap: pal(0x665c9f),
  sapBullet: pal(0xbf92f9),
  sapBulletBack: pal(0x6d56bf),
  /** Pal.suppress — Pal.sap x 1.6, the disrupt missile's spark */
  suppress: pal(0xa393fe),
  /** Pal.unitFront / unitBack — zenith's missiles */
  unitFront: pal(0xffa665),
  unitBack: pal(0xd06b53),
  surge: pal(0xf3e979),
  /** Liquids.slag.color — what an atrax spits */
  slag: pal(0xffa166),
} as const;

/**
 * THE TWO TEAM COLOURS. Mindustry paints the same three things in the
 * colour of whichever team owns the body — the `-cell` region on its hull
 * (UnitType.drawCell), the halo and bubble of its shield
 * (UnitType.shieldColor, null on every type, which means "the team's") and
 * the flame behind its engines (UnitEngine.draw) — and a player reads
 * whose a body is off those long before they find a ring under it.
 *
 * THE SWARM IS CRUX AND THE PLAYER IS SHARDED, exactly as upstream: the
 * red is the enemy's and nothing of the player's wears it. Every unit
 * wears its team's cell colour — which is why the cell is drawn
 * rather than baked into the sheet (atlas.ts UNIT_CELL).
 */
export const TEAM_CRUX_RGB: RGB = pal(0xf25555);
/** Team.sharded.color, the player's amber — the core's own (Pal.accent) */
export const TEAM_SHARDED_RGB: RGB = pal(0xffd37f);

/**
 * BasicBulletType.draw, 1:1. Mindustry lays a `-back` region and a shorter
 * inner region on the SAME rect, each tinted with its own ammo colour, so
 * the longer back shows as a rim off the inner region's nose and tail. Both are
 * packed uncropped — pack.json's ignoredWhitespaceStrings keeps everything
 * under `effects/` at its full source rect — so `across` and `along` size
 * the whole region, transparent border and all, exactly as Draw.rect does.
 */
export interface BulletSprite {
  /** which pair of atlas regions: Mindustry's "bullet", "shell" or
   *  "missile" — the sprite name a BasicBulletType is constructed with */
  region: "bullet" | "shell" | "missile";
  across: number; // BasicBulletType.width, px across the line of travel
  along: number; // BasicBulletType.height, px along it
  /** shrinkX/shrinkY: the fraction of each axis the shot gives up in flight */
  shrinkX: number;
  shrinkY: number;
  /**
   * shrinkInterp. Unset is Interp.linear — the shot tapers steadily as it
   * goes. Artillery uses Mathf.slope, which peaks at half life, so a shell
   * swells out of the barrel and draws back in again as it falls
   */
  slopeShrink?: boolean;
  back: RGB; // BasicBulletType.backColor
  front: RGB; // BasicBulletType.frontColor
}

export interface BulletStats {
  speed: number; // px/s
  damage: number; // direct-hit damage
  lifetime: number; // s (Mindustry limitRange: how far a shot can fly)
  splash: number; // splash damage at the blast center (0 = none)
  splashRadius: number; // px
  collidesAir: boolean; // can this bullet hit flying units?
  collidesGround: boolean; // ...and ground units?
  flak?: {
    explodeRange: number; // px — proximity fuse trigger radius
    explodeDelay: number; // s between priming and the blast
    interval: number; // s between proximity checks
  };
  // hitscan (Mindustry ShrapnelBulletType): no projectile — the shot is an
  // instant piercing ray damaging everything along it; lifetime is only the
  // draw animation
  ray?: {
    length: number; // px
  };
  // Mindustry ArtilleryBulletType: the shell arcs over everything (no
  // mid-flight collision) and its lifetime is scaled at fire time so it
  // dies — and splashes — exactly at the predicted impact point
  artillery?: boolean;
  // Mindustry pierce: the shot is not consumed by a hit — it flies its full
  // lifetime and damages every unit it passes through, each exactly once
  pierce?: boolean;
  // the bullet's own contact radius in px (Mindustry hitSize / 2). Left
  // unset it keeps the 2.5px the original four turrets have always used
  hitRadius?: number;
  // StatusEffects.burning, applied for this many seconds on every hit
  // (Mindustry statusDuration). Refreshing an already-burning unit resets it
  burn?: number;
  // Mindustry LaserBulletType: an instant beam, not a projectile. Unlike a
  // `ray` it is capped — Damage.collideLaser stops at the pierceCap'th
  // victim and the DRAWN beam stops there too, so a laser that runs into a
  // crowd is visibly shorter than one fired down an empty lane
  laser?: {
    length: number; // px
    pierceCap: number; // how many units one beam may hit
    width: number; // px — the drawn beam's inner width
  };
  // Mindustry LightningBulletType: no projectile either. The shot spawns a
  // bolt that WALKS — `length / 2` nodes, each damaging what it lands on
  // and then jumping to the furthest enemy in reach, or wandering on when
  // there is none. See Sim.lightningBolt
  lightning?: {
    length: number; // Lightning.create's `length`; the bolt walks half of it
  };
  // A LOCK-ON BEAM (Sim.updateLockBeam): not a bullet at all. The turret
  // holds a beam on ONE target and damages it continuously, and the beam
  // SPOOLS UP — `damage` is what it does the instant it catches, and it
  // climbs from there to `peak` times that over `spool` seconds of
  // unbroken contact. It has no reload and no volley: the spool is the
  // whole clock.
  //
  // THE SPOOL BELONGS TO THE LOCK, NOT TO THE TURRET. It fills while the
  // beam is landing, bleeds back at the same rate while it is not (swung
  // off, out of cone), and is ZEROED the moment the turret changes
  // target — so a beam walked across a crowd never gets anywhere and one
  // held on a single big body is the whole point of the turret
  lock?: {
    spool: number; // seconds of unbroken contact to reach full power
    peak: number; // the damage multiplier there (1 would be no ramp at all)
  };
  // Mindustry BulletType.armorMultiplier: the TARGET's armour is scaled by
  // this before the flat subtraction, so a 4 here quadruples what armour
  // takes off the hit. Unset is 1 — armour as printed
  armorMultiplier?: number;
  // Mindustry damagePierce / damageContinuousPierce: skip armour entirely.
  // A shield still soaks it (see Sim.damageUnit)
  pierceArmor?: boolean;
  // Mindustry lifeScaleRandMin/Max: the shell's lifetime is multiplied by a
  // roll in this range at spawn, which is what scatters a volley of
  // artillery along its firing line instead of stacking it on one point
  lifeScaleRand?: readonly [number, number];
  // Mindustry homingPower/homingRange (BulletType.updateHoming): every
  // tick the shot picks the nearest target within `range` of itself and
  // swings `power` degrees toward it. It re-picks each tick, so a missile
  // that loses its mark simply latches onto the next thing it passes
  homing?: {
    power: number; // rad/s the shot may turn (Mindustry power * 50 deg/tick)
    range: number; // px it will look for something to chase
  };
  // Mindustry pierceCap: a piercing shot is SPENT after this many bodies
  // rather than running its whole lifetime. Meaningless without `pierce`
  pierceCap?: number;
  // Mindustry knockback: on every direct hit the victim takes an impulse
  // of knockback * 80 world units, straight out along the shot's line
  knockback?: number;
  // StatusEffects.wet, and ONE OF THE ROSTER'S TWO DELIBERATE DEVIATIONS
  // (the other is parallax's spool, below). Upstream
  // a water shot knocks its victim back and wets it for a 0.94x speed
  // multiplier — a garnish on a turret whose real jobs (extinguishing
  // fires, cooling reactors) do not exist here. Here the wet status IS the
  // liquid turrets' weapon: no knockback at all, and the slow is deep.
  // `slow` is the drive-speed multiplier while wet; `duration` is
  // Mindustry's statusDuration in seconds, and reapplying resets the clock
  // rather than stacking — one status entry per unit, strongest slow in
  // force (see Sim.applyWet). Wet and burning are opposites(): each lands
  // on the other as a quench/dry rather than taking hold
  wet?: { duration: number; slow: number };
  // LiquidBulletType.orbSize: the shot is not an atlas sprite but a filled
  // disc of the liquid's own colour at this radius in px —
  // Fill.circle(b.x, b.y, orbSize), drawn in fxColor
  orb?: number;
  // Mindustry fragBullet/fragBullets (BulletType.createFrags): where this
  // shot dies it throws `count` children, each on a random bearing within
  // half of `spread` of the parent's heading and at a random fraction of
  // the child's own full speed. Cyclone's plastanium flak is the one that
  // uses it: the burst is what makes a flak wall out of a single turret
  frag?: {
    count: number;
    spread: number; // rad — fragRandomSpread, the FULL cone
    velMin: number; // fragVelocityMin/Max, as fractions of the child's speed
    velMax: number;
    offsetMin: number; // fragOffsetMin/Max: px out from the blast it starts
    offsetMax: number;
    bullet: BulletStats;
  };
  // Mindustry RailBulletType: an instant piercing line, but one with a
  // BUDGET — each body it punches through subtracts its own FULL health
  // from the shot's remaining damage (pierceDamageFactor 1), and the shot
  // stops where that budget runs out. Every victim along the way takes
  // whatever damage is still left, so the line kills a health POOL rather
  // than a body count. `pointSpacing` is pointEffectSpace, how often the
  // trail effect is laid down the line it actually reached
  rail?: {
    length: number; // px
    pointSpacing: number; // px between trail effects
  };
  // Mindustry ContinuousLaserBulletType, fired by a LaserTurret: not a shot
  // but a BEAM the turret holds on target, re-damaging everything under it
  // every damageInterval. `damage` is the per-interval hit, not a rate
  continuous?: {
    length: number; // px the beam reaches at full strength
    damageInterval: number; // s between damage passes
    duration: number; // LaserTurret.shootDuration: s the turret holds it
    fade: number; // ContinuousLaserBulletType.fadeTime: s of tail after
    moveFract: number; // LaserTurret.firingMoveFract: turn rate while firing
  };
  // BasicBulletType.draw: the shot itself. A bullet with no sprite draws
  // nothing at all — a laser, a bolt, a hitscan ray and scorch's flame
  // each live entirely in their effects
  sprite?: BulletSprite;
  // ArtilleryBulletType.update: a puff dropped every (3 + fslope*2) * mult
  // ticks at a radius of fslope * size, in the shell's own backColor. It is
  // what makes a shell read as arcing rather than sliding along the ground
  trail?: { size: number; mult: number };
  // BulletType.trailChance/trailParam (updateTrailEffects): a CHANCE per
  // tick of dropping a puff of constant radius. Fx.missileTrail and
  // Fx.artilleryTrail are the same fading disc, so this shares the trail
  // above's draw — what differs is the cadence, and it is the difference
  // between a motor that burns steadily and a shell that is lobbed
  puff?: { chance: number; size: number };
  // BulletType.shootEffect and smokeEffect, both fired where the shot
  // leaves the barrel, along the angle it leaves on
  shootFx?: BulletFx;
  smokeFx?: BulletFx;
  // BulletType.hitEffect, at the point of contact — and again where the
  // shot dies, since BulletType.init gives every splash bullet despawnHit.
  // hitFx2 is Mindustry's MultiEffect: ripple lays a shockwave over its blast
  hitFx?: BulletFx;
  hitFx2?: BulletFx;
  // BulletType.despawnEffect, only where the shot runs out of lifetime
  despawnFx?: BulletFx;
  // RailBulletType.pierceEffect, at every body the line punches through,
  // and pointEffect, laid every `rail.pointSpacing` down the length the
  // line actually reached before its damage budget ran out
  pierceFx?: BulletFx;
  pointFx?: BulletFx;
  // BulletType.chargeEffect, fired at the muzzle the moment a volley with a
  // firstShotDelay is queued — so it plays THROUGH the charge, not after it
  chargeFx?: BulletFx;
  // BulletType.hitColor, handed to every one of those. Unset is Color.white
  fxColor?: RGB;
}

/**
 * The effects a bullet can fire. Naming them as a union is what makes
 * FX_LIFE below total: a kind cannot be put in a BulletStats field without
 * a lifetime, and a lifetime cannot be forgotten when a kind is added.
 */
export type BulletFx =
  | FxKind.Flame
  | FxKind.FlameHit
  | FxKind.Flak
  | FxKind.BulletHit
  | FxKind.ShootSmall
  | FxKind.ShootBig
  | FxKind.SmokeSmall
  | FxKind.SmokeBig
  | FxKind.ArtilleryTrail
  | FxKind.Shockwave
  | FxKind.SparkShoot
  | FxKind.LancerShoot
  | FxKind.LancerCharge
  | FxKind.HitLancer
  | FxKind.BlastExplosion
  | FxKind.PlasticExplosion
  | FxKind.InstShoot
  | FxKind.InstHit
  | FxKind.InstTrail
  | FxKind.InstBomb
  | FxKind.RailHit
  | FxKind.SmokeCloud
  | FxKind.HitMeltdown
  | FxKind.SmokeBig2
  | FxKind.ShootLiquid
  | FxKind.HitLiquid
  | FxKind.WaterBurst;

/**
 * The Mindustry lifetime, in seconds, of each of those. An Effect carries
 * its own duration in the original — the call site only says where and
 * which — so it is looked up here rather than passed in.
 */
export const FX_LIFE: Record<BulletFx, number> = {
  [FxKind.BulletHit]: 14 / TICK,
  [FxKind.ShootSmall]: 8 / TICK,
  [FxKind.ShootBig]: 9 / TICK,
  [FxKind.SmokeSmall]: 20 / TICK,
  [FxKind.SmokeBig]: 17 / TICK,
  [FxKind.ArtilleryTrail]: 50 / TICK,
  [FxKind.Shockwave]: 9 / TICK,
  [FxKind.SparkShoot]: 12 / TICK,
  [FxKind.LancerShoot]: 21 / TICK,
  // MultiEffect(lancerLaserCharge 38, lancerLaserChargeBegin 60): the pair
  // always fires together, so one entity draws both and the shorter of the
  // two simply stops early. The longer lifetime is the entity's
  [FxKind.LancerCharge]: 60 / TICK,
  [FxKind.HitLancer]: 12 / TICK,
  [FxKind.Flak]: 20 / TICK,
  [FxKind.Flame]: 32 / TICK,
  [FxKind.FlameHit]: 14 / TICK,
  [FxKind.BlastExplosion]: 22 / TICK,
  [FxKind.PlasticExplosion]: 24 / TICK,
  [FxKind.InstShoot]: 24 / TICK,
  [FxKind.InstHit]: 20 / TICK,
  [FxKind.InstTrail]: 30 / TICK,
  [FxKind.InstBomb]: 15 / TICK,
  [FxKind.RailHit]: 18 / TICK,
  [FxKind.SmokeCloud]: 70 / TICK,
  [FxKind.HitMeltdown]: 12 / TICK,
  [FxKind.SmokeBig2]: 18 / TICK,
  [FxKind.ShootLiquid]: 15 / TICK,
  [FxKind.HitLiquid]: 16 / TICK,
  // no Mindustry entry to copy: a shell's worth of water wants longer on
  // screen than an orb's 16 ticks, because its whole job is to show the
  // player a radius rather than a point of contact
  [FxKind.WaterBurst]: 26 / TICK,
};
/** Fx.lancerLaserCharge's own 38 ticks, inside LancerCharge's 60 */
export const LANCER_CHARGE_SPARK = 38 / 60;

export interface TowerStats {
  name: string;
  size: number; // footprint in tiles (size x size)
  /** Mindustry's own block health for this turret, BEFORE TOWER_HP_SCALE
   *  — see towerMaxHp for where each number comes from */
  health: number;
  /**
   * PLATING: a flat shave off every hit the structure takes, floored at a
   * tenth of the raw hit — Mindustry's Building.armor, through the same
   * Damage.applyArmor the swarm's own bodies use (Sim.applyArmor), so
   * "armour" means one thing on both sides of the field. See
   * TOWER_ARMOR_BY_SIZE for where each number comes from.
   */
  armor: number;
  range: number; // px
  reload: number; // s per volley
  shots: number; // bullets per volley
  shotDelay: number; // s between a volley's bullets
  spread: number; // rad between a volley's bullets (ShootSpread fan)
  inaccuracy: number; // rad, each shot offset uniformly within ±this
  shootCone: number; // rad — fire only when aimed this close to the target
  rotateSpeed: number; // rad/s
  targetAir: boolean; // will the turret acquire flying units?
  targetGround: boolean; // ...and ground units?
  // Mindustry shootY: how far up the barrel a shot leaves, in px. Unset
  // falls back to the shared size-scaled muzzle
  shootY?: number;
  // Mindustry Turret.minRange, artillery only: NOT a refusal to fire at
  // something close, but the floor on how short a shell's flight may be
  // scaled. A ripple aimed inside 50 units still shoots — the shell just
  // overflies the target rather than landing shorter than this
  minRange?: number;
  // Mindustry shoot.firstShotDelay, in seconds: the volley is queued, then
  // held this long before the shot leaves. Lancer also sets
  // moveWhileCharging false, so the barrel LOCKS for the whole charge
  chargeTime?: number;
  // Mindustry Turret.velocityRnd: each shot leaves at a random fraction of
  // full speed, drawn from [1 - velocityRnd, 1]
  velocityRnd?: number;
  // Mindustry Turret.scaleLifetimeOffset: added to an artillery shell's
  // lifetime scale, so the shell overflies its aim point by this fraction
  lifeScaleOffset?: number;
  // ShootAlternate and ShootBarrel: successive shots leave side-by-side
  // barrels, `spread` px apart perpendicular to the facing
  barrels?: { count: number; spread: number };
  // Mindustry Turret.unitSort. Unset is UnitSorts.closest — every turret
  // bar one. `strongest` is foreshadow's: the HIGHEST CURRENT HEALTH in
  // range, ties broken by distance, because a 1350-damage shot spent on
  // whichever dagger wandered nearest is three and a third seconds of
  // reload thrown away. (Mindustry sorts on maxHealth with a blended
  // distance term; current health strict is a deliberate deviation — it
  // walks off a target other turrets have nearly finished instead of
  // overkilling it.)
  sort?: "strongest";
  // A SUPPORT BLOCK'S PULSE instead of a gun (Sim.updateMender): every
  // `reload` seconds it returns this fraction of their own pool to every
  // player structure whose centre is inside `range`. A block with this set
  // has no target, no barrel and no volley — `bullet` is the inert zero
  // the table's shape demands, and the fire path never reaches it
  heal?: { percent: number };
  bullet: BulletStats;
}


/**
 * THE INERT ROUND a block that fires nothing carries. TowerStats.bullet is
 * required — every other field in the table is read by something, and
 * making it optional would put a `?.` on every call site that reads a
 * turret's damage — so the support pair (see `heal`) carries this instead:
 * no speed, no damage, no lifetime, and nothing it collides with. The fire
 * path leaves before it is ever looked at; what reads it is the UI, and a
 * mender honestly does zero damage.
 */
const ZERO_BULLET: BulletStats = {
  speed: 0,
  damage: 0,
  lifetime: 0,
  splash: 0,
  splashRadius: 0,
  collidesAir: false,
  collidesGround: false,
};

/**
 * WHAT A TURRET'S PLATING IS, BY FOOTPRINT — the one place the armour
 * numbers in the table below come from.
 *
 * SERPULO TURRETS CARRY NO ARMOUR UPSTREAM. Mindustry only started plating
 * blocks on Erekir, so a 1:1 lift would put a zero on every row and the
 * system would exist without doing anything. So the numbers are AUTHORED,
 * on the swarm's own ladder: a 2x2 wears a mace's plate (4), a 3x3 a
 * fortress's (9), a 4x4 a shade under a scepter's (15), and a 1x1 wears
 * nothing, the way a dagger wears nothing.
 *
 * WHAT THAT DOES, because armour is a flat shave PER HIT and the swarm's
 * bite is authored per hit too (weapons.ts): a dagger's 9 is halved on a
 * 2x2 and floored on anything bigger, a fortress shell's 20 is cut to a
 * quarter on a 4x4, and a reign's 80 loses a fifth. Small arms bounce off
 * big guns and the heavies still chew through them, which is exactly the
 * relationship the swarm's own armour already has with the turrets'
 * bullets. It is deliberately NOT a fraction of the pool: the pool is
 * five times Mindustry's (TOWER_HP_SCALE) and this is not, so the two
 * dials are two dials.
 */
export const TOWER_ARMOR_BY_SIZE: readonly number[] = [0, 0, 4, 9, 15];

export const TOWERS: Record<import("./types").TowerKind, TowerStats> = {
  // Duo, 1:1 from mindustry/content/Blocks.java with copper ammo
  // (BasicBulletType(2.5, 9)): one shot every 20 ticks, alternating between
  // twin barrels 3.5 units apart (ShootAlternate)
  duo: {
    name: "Duo",
    size: 1,
    health: 250,
    armor: 0,
    range: 160 * MU,
    reload: 20 / TICK,
    shots: 1,
    shotDelay: 0,
    spread: 0,
    inaccuracy: (2 * Math.PI) / 180,
    shootCone: (15 * Math.PI) / 180,
    rotateSpeed: ((10 * Math.PI) / 180) * TICK,
    targetAir: true,
    targetGround: true,
    barrels: { count: 2, spread: 3.5 * MU },
    bullet: {
      speed: 2.5 * TICK * MU,
      damage: 9,
      lifetime: (160 + 5 + 10) / 2.5 / TICK, // limitRange(5) + base 10-unit margin
      splash: 0,
      splashRadius: 0,
      collidesAir: true,
      collidesGround: true,
      sprite: {
        region: "bullet",
        across: 7 * MU,
        along: 9 * MU,
        shrinkX: 0,
        shrinkY: 0.5, // BasicBulletType's default: half its length by the end
        back: PAL.copperAmmoBack,
        front: PAL.copperAmmoFront,
      },
      shootFx: FxKind.ShootSmall,
      smokeFx: FxKind.SmokeSmall,
      hitFx: FxKind.BulletHit,
      despawnFx: FxKind.BulletHit,
      fxColor: PAL.copperAmmoBack,
    },
  },
  // Hail, 1:1 from mindustry/content/Blocks.java with graphite ammo
  // (ArtilleryBulletType(3, 20)): a slow arcing shell every 60 ticks that
  // ignores everything in flight and blasts 33 splash where it lands.
  // Artillery can't touch the air — ground targets only
  hail: {
    name: "Hail",
    size: 1,
    health: 260,
    armor: 0,
    range: 235 * MU,
    reload: 60 / TICK,
    shots: 1,
    shotDelay: 0,
    spread: 0,
    inaccuracy: (1 * Math.PI) / 180,
    shootCone: (10 * Math.PI) / 180,
    rotateSpeed: ((5 * Math.PI) / 180) * TICK, // BaseTurret default
    targetAir: false,
    targetGround: true,
    bullet: {
      speed: 3 * TICK * MU,
      damage: 20, // never lands directly — kept 1:1 with the source
      lifetime: (235 + 0 + 10) / 3 / TICK, // limitRange(0) + base 10-unit margin
      splash: 33,
      splashRadius: 25 * 0.75 * MU,
      collidesAir: false,
      collidesGround: true,
      artillery: true,
      sprite: {
        region: "shell",
        across: 11 * MU,
        along: 11 * MU,
        // ArtilleryBulletType's own defaults, and the reason a shell reads
        // as leaving the ground: Mathf.slope peaks at half life, so it
        // opens out of the barrel at half size and closes again on impact
        shrinkX: 0.15,
        shrinkY: 0.5,
        slopeShrink: true,
        back: PAL.graphiteAmmoBack,
        front: PAL.graphiteAmmoFront,
      },
      trail: { size: 4 * MU, mult: 1 },
      shootFx: FxKind.ShootBig,
      smokeFx: FxKind.SmokeSmall,
      // collides is false, so a shell only ever dies of old age — and
      // despawnHit then fires BOTH of these on the same spot
      hitFx: FxKind.Flak,
      despawnFx: FxKind.BulletHit,
      fxColor: PAL.graphiteAmmoBack,
    },
  },
  // Salvo, 1:1 from mindustry/content/Blocks.java with thorium ammo
  // (BasicBulletType(4, 28)): 4-shot bursts 3 ticks apart, every 29 ticks
  salvo: {
    name: "Salvo",
    size: 2,
    health: 960,
    armor: 4,
    range: 190 * MU,
    reload: 29 / TICK,
    shots: 4,
    shotDelay: 3 / TICK,
    spread: 0,
    inaccuracy: 0,
    // turret defaults: 8-degree shoot cone, 5 deg/tick turn rate
    shootCone: (8 * Math.PI) / 180,
    rotateSpeed: ((5 * Math.PI) / 180) * TICK,
    targetAir: true,
    targetGround: true,
    bullet: {
      speed: 4 * TICK * MU,
      damage: 28,
      lifetime: (190 + 9 + 10) / 4 / TICK, // limitRange() default margin 9
      splash: 0,
      splashRadius: 0,
      collidesAir: true,
      collidesGround: true,
      sprite: {
        region: "bullet",
        across: 8 * MU,
        along: 13 * MU, // half again as long as duo's copper pellet
        shrinkX: 0,
        shrinkY: 0.5,
        back: PAL.thoriumAmmoBack,
        front: PAL.thoriumAmmoFront,
      },
      shootFx: FxKind.ShootBig,
      smokeFx: FxKind.SmokeBig,
      hitFx: FxKind.BulletHit,
      despawnFx: FxKind.BulletHit,
      fxColor: PAL.thoriumAmmoBack,
    },
  },
  // Scatter, 1:1 from mindustry/content/Blocks.java with lead ammo
  // (FlakBulletType(4.2, 3), splash 27*1.5 in a 15-unit radius).
  // Anti-air only, exactly like upstream: it ignores the ground swarm and
  // waits for flyers.
  scatter: {
    name: "Scatter",
    size: 2,
    health: 800,
    armor: 4,
    range: 220 * MU,
    reload: 18 / TICK,
    shots: 2,
    shotDelay: 5 / TICK,
    spread: 0,
    inaccuracy: (17 * Math.PI) / 180,
    shootCone: (35 * Math.PI) / 180,
    rotateSpeed: ((15 * Math.PI) / 180) * TICK,
    targetAir: true,
    targetGround: false,
    bullet: {
      speed: 4.2 * TICK * MU,
      damage: 3,
      lifetime: (220 + 2 + 10) / 4.2 / TICK, // limitRange(2) + base 10-unit margin
      splash: 27 * 1.5,
      splashRadius: 15 * MU,
      collidesAir: true,
      collidesGround: false,
      flak: {
        explodeRange: 30 * MU,
        explodeDelay: 5 / TICK,
        interval: 6 / TICK,
      },
      sprite: {
        region: "shell",
        across: 6 * MU,
        along: 8 * MU,
        shrinkX: 0,
        shrinkY: 0.5,
        // lead ammo overrides no colour, so the shell keeps the stock pair
        back: PAL.bulletYellowBack,
        front: PAL.bulletYellow,
      },
      shootFx: FxKind.ShootSmall,
      smokeFx: FxKind.SmokeSmall,
      hitFx: FxKind.Flak,
      // lead sets no despawnEffect either, so it keeps Fx.hitBulletSmall —
      // which is hitBulletColor with its ramp fixed to Pal.lightOrange
      despawnFx: FxKind.BulletHit,
      fxColor: PAL.lightOrange,
    },
  },
  // Fuse, 1:1 from mindustry/content/Blocks.java with thorium ammo
  // (ShrapnelBulletType, damage 105): three instant piercing rays fired as
  // a ShootSpread(3, 20deg) fan, 3 shots / 0.583s = the official 5.14/sec.
  fuse: {
    name: "Fuse",
    size: 3,
    health: 1980,
    armor: 9,
    range: 90 * MU,
    reload: 35 / TICK,
    shots: 3,
    shotDelay: 0,
    spread: (20 * Math.PI) / 180,
    inaccuracy: 0,
    shootCone: (30 * Math.PI) / 180,
    rotateSpeed: ((5 * Math.PI) / 180) * TICK, // BaseTurret default
    targetAir: true,
    targetGround: true,
    bullet: {
      speed: 0,
      damage: 105,
      lifetime: 10 / TICK, // animation only — damage is instant
      splash: 0,
      splashRadius: 0,
      collidesAir: true,
      collidesGround: true,
      ray: {
        length: (90 + 10) * MU, // brange = range + 10
      },
      // thorium ammo sets shootEffect = smokeEffect = Fx.thoriumShoot, so
      // the muzzle throws the same spray of pink sparks twice over
      shootFx: FxKind.SparkShoot,
      smokeFx: FxKind.SparkShoot,
      hitFx: FxKind.HitLancer, // ShrapnelBulletType's own
      fxColor: PAL.thoriumPink,
    },
  },
  // Scorch, 1:1 from mindustry/content/Blocks.java with coal ammo
  // (BulletType(3.35, 17)): a flamethrower. It fires every 6 ticks — ten
  // times a second — and the "bullet" is a plain BulletType, which in the
  // original draws NOTHING. The flame you see is the shoot effect
  // (Fx.shootSmallFlame) painted at the muzzle; the shot itself is an
  // invisible piercing dart that rakes the whole file of units in front of
  // it and sets each alight. 60 units of range makes it the shortest-
  // ranged turret in the game, and it cannot touch the air at all
  scorch: {
    name: "Scorch",
    size: 1,
    health: 400,
    armor: 0,
    range: 60 * MU,
    reload: 6 / TICK,
    shots: 1,
    shotDelay: 0,
    spread: 0,
    inaccuracy: 0, // Turret default — scorch never overrides it
    shootCone: (50 * Math.PI) / 180,
    rotateSpeed: ((5 * Math.PI) / 180) * TICK, // BaseTurret default
    targetAir: false,
    targetGround: true,
    shootY: 3 * MU,
    bullet: {
      speed: 3.35 * TICK * MU,
      damage: 17,
      // no limitRange call: 3.35 units/tick for 18 ticks is 60.3 units,
      // which is exactly the turret's range
      lifetime: 18 / TICK,
      splash: 0,
      splashRadius: 0,
      collidesAir: false,
      collidesGround: true,
      pierce: true,
      hitRadius: (7 / 2) * MU, // hitSize 7
      burn: 4, // statusDuration 60 * 4
      // no `sprite`: a bare BulletType draws nothing but its trail and its
      // parts, and coal ammo has neither. Fx.shootSmallFlame IS the weapon
      shootFx: FxKind.Flame,
      // coal overrides no smokeEffect, so the flame carries BulletType's
      // stock puff along with it
      smokeFx: FxKind.SmokeSmall,
      hitFx: FxKind.FlameHit,
      // despawnEffect = Fx.none: a flame tongue simply runs out
    },
  },

  // Arc, 1:1 from mindustry/content/Blocks.java (a PowerTurret, so its one
  // shootType is the whole armament): a LightningBulletType at 20 damage
  // and lightningLength 25. The bolt is not a shot — it walks twelve nodes
  // out from the muzzle, damaging what each lands on and chaining to the
  // furthest enemy within reach of it, which is why arc's reach in a crowd
  // is far longer than the 90 units it targets from. Ground only.
  arc: {
    name: "Arc",
    size: 1,
    health: 260,
    armor: 0,
    range: 90 * MU,
    reload: 35 / TICK,
    shots: 1,
    shotDelay: 0,
    spread: 0,
    inaccuracy: 0, // Turret default — arc never overrides it
    shootCone: (40 * Math.PI) / 180,
    rotateSpeed: ((8 * Math.PI) / 180) * TICK,
    targetAir: false,
    targetGround: true,
    bullet: {
      speed: 0,
      damage: 12, // LightningBulletType damage upstream (master)
      // Fx.lightning's own 10 ticks: the bolt is instant, and this is only
      // how long the drawn arc lingers
      lifetime: 10 / TICK,
      splash: 0,
      splashRadius: 0,
      collidesAir: false,
      collidesGround: true,
      // the node bullet is a plain BulletType, hitSize 4
      hitRadius: (4 / 2) * MU,
      lightning: { length: 25 },
      // the turret names Fx.lightningShoot but leaves smokeEffect alone,
      // so BulletType's stock puff comes along with the sparks
      shootFx: FxKind.SparkShoot,
      smokeFx: FxKind.SmokeSmall,
      hitFx: FxKind.HitLancer, // every node's own bullet lands one
      fxColor: PAL.lancerLaser,
    },
  },
  // Lancer, 1:1 from mindustry/content/Blocks.java: a LaserBulletType(140)
  // 173 units long that pierces FOUR units and stops. shoot.firstShotDelay
  // 40 makes it charge for two thirds of a second before it fires, and
  // moveWhileCharging false locks the barrel for that whole charge — a
  // lancer commits to where it was aiming, not where the target went.
  //
  // armorMultiplier 4 is the catch: armour counts quadruple against it, so
  // the 140 that guts a dagger is 104 against a fortress. Ground only.
  lancer: {
    name: "Lancer",
    size: 2,
    health: 1120,
    armor: 4,
    range: 165 * MU,
    reload: 80 / TICK,
    chargeTime: 40 / TICK,
    shots: 1,
    shotDelay: 0,
    spread: 0,
    inaccuracy: 0,
    // turret defaults: 8-degree shoot cone, 5 deg/tick turn rate
    shootCone: (8 * Math.PI) / 180,
    rotateSpeed: ((5 * Math.PI) / 180) * TICK,
    targetAir: false,
    targetGround: true,
    bullet: {
      speed: 0,
      damage: 140,
      lifetime: 16 / TICK, // the beam's fade — the damage is instant
      splash: 0,
      splashRadius: 0,
      collidesAir: false,
      collidesGround: true,
      armorMultiplier: 4,
      laser: { length: 173 * MU, pierceCap: 4, width: 15 * MU },
      // the turret names Fx.lancerLaserShoot and sets smokeEffect to none:
      // a lancer fires clean, with two blue wings and no powder at all
      shootFx: FxKind.LancerShoot,
      chargeFx: FxKind.LancerCharge,
      hitFx: FxKind.HitLancer,
      fxColor: PAL.lancerLaser,
    },
  },
  // Ripple, 1:1 from mindustry/content/Blocks.java with graphite ammo
  // (ArtilleryBulletType(3, 40), 70 splash in a 22.5-unit radius): four
  // shells every two seconds over 290 units — outreached only by
  // parallax's 300 and foreshadow's 500.
  // The volley scatters on purpose — 11 degrees of inaccuracy, a velocity
  // roll in [0.8, 1] and a lifetime roll in [0.95, 1.08] — so it lands as a
  // pattern across the lane rather than four shells in one hole.
  ripple: {
    name: "Ripple",
    size: 3,
    health: 1170,
    armor: 9,
    range: 290 * MU,
    minRange: 50 * MU,
    reload: 120 / TICK,
    shots: 4,
    shotDelay: 0, // ShootPattern.shots with no delay — the volley leaves together
    spread: 0,
    inaccuracy: (11 * Math.PI) / 180,
    shootCone: (8 * Math.PI) / 180,
    rotateSpeed: ((5 * Math.PI) / 180) * TICK,
    targetAir: false,
    targetGround: true,
    velocityRnd: 0.2,
    lifeScaleOffset: 1 / 9,
    bullet: {
      speed: 3 * TICK * MU,
      damage: 40, // never lands directly — an artillery shell arcs over
      lifetime: 80 / TICK,
      splash: 70,
      splashRadius: 30 * 0.75 * MU,
      collidesAir: false,
      collidesGround: true,
      artillery: true,
      lifeScaleRand: [0.95, 1.08],
      sprite: {
        region: "shell",
        across: 12 * MU,
        along: 14 * MU, // longer than hail's, and not round
        shrinkX: 0.15,
        shrinkY: 0.5,
        slopeShrink: true,
        back: PAL.graphiteAmmoBack,
        front: PAL.graphiteAmmoFront,
      },
      trail: { size: 4 * MU, mult: 1 },
      shootFx: FxKind.ShootBig,
      smokeFx: FxKind.SmokeSmall,
      // MultiEffect(Fx.flakExplosion, Fx.shockwaveSmaller): the blast, and
      // a white ring running out of it — what tells a ripple's landing
      // apart from a hail's
      hitFx: FxKind.Flak,
      hitFx2: FxKind.Shockwave,
      despawnFx: FxKind.BulletHit,
      fxColor: PAL.graphiteAmmoBack,
    },
  },
  // Wave — THE FIRST OF THE TWO TURRETS (tsunami is the other) WHOSE WEAPON
  // IS NOT MINDUSTRY'S. Upstream's wave is a hose: twenty tiny orbs a
  // second, each soaking the single body it touches. That reads as a stream
  // of dots and pins exactly one enemy at a time, so the block that is
  // supposed to be the board's crowd-control answer only ever answered the
  // unit at the front of the file.
  //
  // Here it throws ONE heavy ball of water that bursts on contact and
  // soaks everything inside the burst. The block, its footprint, its
  // health, its range and its 50-degree cone are still upstream's; what
  // changed is the ammunition, and with it the whole shape of what the
  // turret does — a shot answers a GROUP, not a body.
  //
  // The numbers that follow from that:
  //  - reload 45 ticks. One ball every 0.75 s where the hose threw fifteen
  //    in that time. The soak lasts 2 s, so a single wave still holds a
  //    patch of lane wet with uptime to spare.
  //  - splash 1 over a 30-unit radius — near four tiles of reach, so the
  //    burst is better than seven tiles across. "Little to no damage" is
  //    the point: armour floors a hit at a tenth of it, so this never
  //    kills anything — it slows what the rest of the board is shooting.
  //  - 18 degrees of inaccuracy, where upstream sprays 5. A ball that
  //    lands on the aim point every time is a ball that soaks the same
  //    patch forever; scattering them means consecutive shots cover lane
  //    rather than repaint one puddle, and the burst radius is what makes
  //    the scatter forgiving instead of a miss.
  // Wet units still drive at 65% speed for 2 s, refreshed on every soak.
  wave: {
    name: "Wave",
    size: 2,
    health: 1000,
    armor: 4,
    range: 110 * MU,
    reload: 45 / TICK,
    shots: 1,
    shotDelay: 0,
    spread: 0,
    inaccuracy: (18 * Math.PI) / 180,
    shootCone: (50 * Math.PI) / 180,
    rotateSpeed: ((5 * Math.PI) / 180) * TICK, // BaseTurret default
    targetAir: true,
    targetGround: true,
    bullet: {
      speed: 3.5 * TICK * MU,
      // the contact hit is gone entirely: every point this shot deals is
      // splash, so a ball that bursts short of its target is worth exactly
      // as much as one that bursts on its face
      damage: 0,
      // no limitRange call upstream: 3.5 units/tick for 34 ticks is 119
      // units against a 110 range — the drag we don't model ate the rest.
      // A ball that runs the clock out bursts anyway (BulletType.despawnHit,
      // and the splash branch in updateProjectiles), so a shot thrown past
      // a dodging target still wets the ground it was headed for
      lifetime: 34 / TICK,
      splash: 1,
      splashRadius: 30 * MU,
      collidesAir: true,
      collidesGround: true,
      // the ball is a fat thing, and a fat thing bursts where it touches:
      // the hit radius is the ball's own size rather than BulletType's
      // default 4, so the burst centre reads as the ball's centre
      hitRadius: 5 * MU,
      wet: { duration: 2, slow: 0.65 },
      orb: 5 * MU, // one ball, not a droplet — LiquidBulletType.draw's disc
      // LiquidTurret zeroes the block's own effects; the bullet's
      // shootEffect is still Fx.shootLiquid. The landing is not: hitLiquid
      // is a handspan of droplets and this burst is seven tiles wide, so
      // WaterBurst draws it at the radius it actually soaked
      shootFx: FxKind.ShootLiquid,
      hitFx: FxKind.WaterBurst,
      hitFx2: FxKind.HitLiquid,
      despawnFx: FxKind.HitLiquid,
      fxColor: PAL.water,
    },
  },
  // Parallax, and THE ROSTER'S OTHER DELIBERATE DEVIATION (the first is
  // the liquid turrets' soak, see `wet`). Mindustry's parallax is a
  // TractorBeamTurret: it holds a beam on one FLYER, deals 30
  // armour-piercing damage a second and DRAGS it backwards. The drag is a
  // lovely thing in a game where flyers steer themselves and a menace in
  // one where they walk a flow field — it shoves the swarm off the lane
  // the whole board was built around — so the beam keeps everything else
  // and trades the pull for a SPOOL.
  //
  // The beam takes both layers, locks the HIGHEST-HEALTH body in range the
  // way foreshadow's rail does, and holds it until it dies or leaves.
  // Thirty damage a second is what it opens with — still nothing, still
  // upstream's number — and eight seconds of unbroken contact walks it up
  // to seven times that. So it is a SIEGE WEAPON, not a gun: worthless
  // against anything that dies quickly or arrives in a crowd (a target
  // change zeroes the spool outright), and the tier-2 answer to the one
  // armoured body nothing else can chew through, because the beam never
  // meets armour at all.
  //
  // IT IS NOT A FORESHADOW AND MUST NEVER READ AS ONE. Fully spooled it is
  // 210 damage a second against a single body; foreshadow spends 1,755 on
  // a queue every 3.3 seconds — better than twice parallax's rate, through
  // as many bodies as the budget reaches, from 200 units further out, and
  // from the first shot rather than the eighth second. The ramp buys
  // parallax the ONE case foreshadow is wasted on: a lone heavy that has
  // to be ground down rather than deleted.
  parallax: {
    name: "Parallax",
    size: 2,
    health: 640,
    armor: 4,
    range: 300 * MU,
    reload: 0, // continuous: no volley clock at all
    shots: 1,
    shotDelay: 0,
    spread: 0,
    inaccuracy: 0,
    shootCone: (6 * Math.PI) / 180, // TractorBeamTurret's own default
    rotateSpeed: ((12 * Math.PI) / 180) * TICK,
    targetAir: true,
    targetGround: true,
    // foreshadow's pick, for foreshadow's reason: a beam that has to be
    // held for seconds to be worth anything cannot spend them on whichever
    // crawler wandered nearest
    sort: "strongest",
    bullet: {
      // damageContinuousPierce is per TICK; this table is per second
      speed: 0,
      damage: 0.5 * TICK,
      lifetime: 0,
      splash: 0,
      splashRadius: 0,
      collidesAir: true,
      collidesGround: true,
      pierceArmor: true,
      lock: { spool: 8, peak: 7 },
    },
  },
  // Tsunami — wave's weapon at the endgame's scale, and the same departure
  // from upstream for the same reason (see wave above). Mindustry's
  // tsunami is a bigger hose; this one is a bigger SHELL. Upstream's
  // knockback 1.7 is still traded for the deeper slow.
  //
  // AND IT HITS, WHICH WAVE DOES NOT. This used to be wave's splash of 2
  // at three times the price and a size-3 footprint: a rare that could
  // not kill the thing it had spent four seconds slowing, so a board
  // fielding one was paying five thousand scrap for a debuff and nothing
  // else. The slow is still WHAT IT IS FOR — the 45% for 4 s is the reason
  // it goes down, and it is untouched — but the shot is a shot now.
  //
  // Everything about it is wave's shot, louder:
  //  - twin barrels 4 units apart throwing together (ShootAlternate,
  //    shots 2) every 15 ticks — eight balls a second against wave's one
  //    and a third, which is the "much faster" half of the pair.
  //  - a 46-unit burst radius: near twelve tiles across, better than half
  //    again wave's reach per ball, and the reason two balls a volley at
  //    22 degrees of scatter read as a WALL of water rather than two
  //    puddles. The scatter is deliberately wider than wave's: at 190
  //    units of range a tight pair would soak one spot, and a burst this
  //    size can afford to miss by tiles and still catch the whole group.
  //  - splash 20 a ball, so eight balls a second is 160 a second laid
  //    over everything in the burst, air and ground alike. Against
  //    ripple's 140 that reads as more, and it is not: a ball is ARMOUR
  //    SHAVED LIKE ANY OTHER HIT (applyArmor), and twenty points shaved
  //    flat eight times a second is what a hail does to a heavy, while
  //    ripple's seventy lands whole. What tsunami has over the artillery
  //    is the area — four times ripple's — and the four seconds of wet
  //    under it. Wave is still the one that kills nothing (splash 1): it
  //    is a size-2 common, and the two must not read as the same turret
  //    at two prices.
  // The shot itself is upstream's heavy round — speed 4, lifetime 49 ticks
  // over 190 range — and the soak is upstream's duration (statusDuration
  // 60*4): wet units drive at 45% speed for 4 s, so anything crossing its
  // umbrella spends better than twice as long under every other turret.
  tsunami: {
    name: "Tsunami",
    size: 3,
    health: 2250,
    armor: 9,
    range: 190 * MU,
    reload: 15 / TICK,
    shots: 2,
    shotDelay: 0, // both barrels throw on the same tick
    spread: 0,
    inaccuracy: (22 * Math.PI) / 180,
    shootCone: (45 * Math.PI) / 180,
    rotateSpeed: ((5 * Math.PI) / 180) * TICK, // BaseTurret default
    targetAir: true,
    targetGround: true,
    velocityRnd: 0.1,
    barrels: { count: 2, spread: 4 * MU },
    bullet: {
      speed: 4 * TICK * MU,
      damage: 0, // as wave: every point this shot deals is splash
      lifetime: 49 / TICK, // 196 units of flight over a 190 range
      splash: 20,
      splashRadius: 46 * MU,
      collidesAir: true,
      collidesGround: true,
      hitRadius: 6 * MU, // the ball's own size, as wave's
      wet: { duration: 4, slow: 0.45 },
      orb: 6 * MU, // the heavy ball
      shootFx: FxKind.ShootLiquid,
      hitFx: FxKind.WaterBurst,
      hitFx2: FxKind.HitLiquid,
      despawnFx: FxKind.HitLiquid,
      fxColor: PAL.water,
    },
  },
  // ---------- THE SUPPORT PAIR ----------------------------------------
  //
  // Mender and mend projector, Mindustry's two block healers, and the only
  // things on the card that never shoot. A gun answers the wave in front of
  // it; these answer the wave AFTER it, by putting a line back together
  // between them — which is why they are worth a slot on a board where
  // nothing repairs and a chewed duo stays chewed until it falls over.
  //
  // THE PULSE IS OURS, THE REST IS UPSTREAM'S. Mindustry's mender mends 4%
  // on a 200-tick clock and its projector 15% on 250, both of them fed
  // silicon to do it; here there is no silicon and no logistics to carry
  // it, so a healer that ticks at upstream's rate would be a block that
  // did nothing a player could see. The clocks and the ranges are
  // Mindustry's own; the PERCENTAGES are set to what makes the block worth
  // its price on a fifty-wave hold — a tenth of a pool a pulse, a fifth for
  // the big one.
  mender: {
    name: "Mender",
    size: 1,
    health: 200,
    armor: 0,
    range: 40 * MU,
    reload: 200 / TICK,
    shots: 0,
    shotDelay: 0,
    spread: 0,
    inaccuracy: 0,
    shootCone: 0,
    rotateSpeed: 0,
    targetAir: false,
    targetGround: false,
    heal: { percent: 0.1 },
    bullet: ZERO_BULLET,
  },
  // the projector: double the mender's pulse over better than twice its
  // reach, on a slightly longer clock — one of these behind a line does
  // what four menders scattered along it would, which is the whole reason
  // to pay a 2x2 footprint and a tier-2 price for a block that fires nothing
  mendProjector: {
    name: "Mend Projector",
    size: 2,
    health: 700,
    armor: 4,
    range: 85 * MU,
    reload: 250 / TICK,
    shots: 0,
    shotDelay: 0,
    spread: 0,
    inaccuracy: 0,
    shootCone: 0,
    rotateSpeed: 0,
    targetAir: false,
    targetGround: false,
    heal: { percent: 0.2 },
    bullet: ZERO_BULLET,
  },
  // Swarmer, 1:1 from mindustry/content/Blocks.java with blast-compound
  // ammo (MissileBulletType(3.7, 10)): four missiles a volley, five ticks
  // apart, out of three barrels 4 units abreast (ShootBarrel).
  //
  // THE MISSILE IS THE POINT. homingPower 0.08 turns it four degrees a
  // tick toward the nearest thing within 50 units of ITSELF — re-picked
  // every tick, so a missile whose mark dies simply latches onto the next
  // body it passes. Ten damage on contact is nothing; the 45 splash it
  // lands is the weapon, and the homing is what stops a volley of it
  // being wasted on a target that has already fallen over.
  swarmer: {
    name: "Swarmer",
    size: 2,
    health: 1200,
    armor: 4,
    range: 240 * MU,
    reload: (60 * 4) / 7 / TICK,
    shots: 4,
    shotDelay: 5 / TICK,
    spread: 0,
    inaccuracy: (10 * Math.PI) / 180,
    // turret defaults: 8-degree shoot cone, 5 deg/tick turn rate
    shootCone: (8 * Math.PI) / 180,
    rotateSpeed: ((4 * Math.PI) / 180) * TICK,
    targetAir: true,
    targetGround: true,
    shootY: 4.5 * MU,
    barrels: { count: 3, spread: 4 * MU },
    bullet: {
      speed: 3.7 * TICK * MU,
      damage: 10,
      lifetime: (240 + 5 + 10) / 3.7 / TICK, // limitRange(5) + base 10-unit margin
      splash: 30 * 1.5,
      splashRadius: 30 * 0.75 * MU,
      collidesAir: true,
      collidesGround: true,
      // homingPower * 50 degrees a tick, and homingRange is BulletType's
      // own 50 — measured from the MISSILE, not from the turret
      homing: { power: ((0.08 * 50 * Math.PI) / 180) * TICK, range: 50 * MU },
      sprite: {
        region: "missile",
        across: 8 * MU,
        along: 8 * MU,
        shrinkX: 0,
        shrinkY: 0, // MissileBulletType zeroes it: a missile does not taper
        back: PAL.blastAmmoBack,
        front: PAL.blastAmmoFront,
      },
      // MissileBulletType.trailChance 0.2 over BulletType's 2-unit puff:
      // one in five ticks, which reads as a motor rather than an arc
      puff: { chance: 0.2 * TICK, size: 2 * MU },
      // blast compound overrides neither, so the missile leaves on
      // BulletType's stock pair
      shootFx: FxKind.ShootSmall,
      smokeFx: FxKind.SmokeSmall,
      hitFx: FxKind.BlastExplosion,
      despawnFx: FxKind.BlastExplosion,
      fxColor: PAL.blastAmmoBack,
    },
  },
  // Cyclone, 1:1 from mindustry/content/Blocks.java with plastanium ammo
  // (FlakBulletType(4, 8)): a shell every ten ticks out of three barrels,
  // proximity-fused at 20 units, 37.5 splash across forty.
  //
  // AND THEN IT FRAGMENTS. Every blast throws six more bullets on random
  // bearings, each 12 damage — so one cyclone shell is a burst, not a
  // point, and a turret firing six a second lays a wall of them. That is
  // the whole reason to own it, and the reason its ammo is plastanium
  // rather than the surge that hits harder in a straight line.
  //
  // Unlike scatter, plastanium sets collidesGround: cyclone answers both
  // layers.
  cyclone: {
    name: "Cyclone",
    size: 3,
    health: 1305,
    armor: 9,
    range: 200 * MU,
    reload: 10 / TICK,
    shots: 1,
    shotDelay: 0,
    spread: 0,
    inaccuracy: (10 * Math.PI) / 180,
    shootCone: (30 * Math.PI) / 180,
    rotateSpeed: ((7 * Math.PI) / 180) * TICK,
    targetAir: true,
    targetGround: true,
    shootY: 10 * MU,
    barrels: { count: 3, spread: 3 * MU },
    bullet: {
      speed: 4 * TICK * MU,
      damage: 8,
      lifetime: (200 + 9 + 10) / 4 / TICK, // limitRange() default margin 9
      splash: 37.5,
      splashRadius: 40 * 0.75 * MU,
      collidesAir: true,
      collidesGround: true,
      flak: {
        explodeRange: 20 * MU,
        explodeDelay: 5 / TICK,
        interval: 6 / TICK,
      },
      sprite: {
        region: "shell",
        across: 8 * MU, // FlakBulletType's own 8x10; plastanium keeps it
        along: 10 * MU,
        shrinkX: 0,
        shrinkY: 0.5,
        back: PAL.plastaniumBack,
        front: PAL.plastaniumFront,
      },
      frag: {
        count: 6,
        spread: 2 * Math.PI, // fragRandomSpread 360: the burst is a circle
        velMin: 0.2,
        velMax: 1,
        offsetMin: 1 * MU,
        offsetMax: 7 * MU,
        bullet: {
          speed: 2.5 * TICK * MU,
          damage: 12,
          lifetime: 15 / TICK,
          splash: 0,
          splashRadius: 0,
          collidesAir: true,
          collidesGround: true,
          sprite: {
            region: "bullet",
            across: 10 * MU,
            along: 12 * MU,
            shrinkX: 0,
            shrinkY: 1, // the whole length: a fragment burns out to nothing
            back: PAL.plastaniumBack,
            front: PAL.plastaniumFront,
          },
          hitFx: FxKind.BulletHit,
          // despawnEffect = Fx.none: a fragment that hits nothing just ends
          fxColor: PAL.plastaniumBack,
        },
      },
      shootFx: FxKind.ShootBig,
      smokeFx: FxKind.SmokeSmall,
      hitFx: FxKind.PlasticExplosion,
      despawnFx: FxKind.BulletHit,
      // plastanium sets frontColor and backColor but NOT hitColor, so the
      // hit ramp keeps BulletType's own white
      fxColor: PAL.white,
    },
  },
  // Spectre, 1:1 from mindustry/content/Blocks.java with thorium ammo
  // (BasicBulletType(8, 80)). A shell every seven ticks, alternating twin
  // barrels 8 units apart (ShootAlternate) — with the shell up-gunned 30%
  // over stock, 80 -> 104, alongside meltdown and foreshadow: the phase
  // tier is priced as the run's last purchase and plays like it. 891
  // damage a second, the highest sustained figure in the game and the
  // whole reason it exists.
  //
  // pierceCap 2 makes every shell worth two bodies rather than one, and
  // knockback 0.7 shoves what survives back down the lane. Nothing about
  // it is clever: it is a wall of heavy shells.
  spectre: {
    name: "Spectre",
    size: 4,
    health: 2560,
    armor: 15,
    range: 260 * MU,
    reload: 7 / TICK,
    shots: 1,
    shotDelay: 0,
    spread: 0,
    inaccuracy: (3 * Math.PI) / 180,
    shootCone: (24 * Math.PI) / 180,
    rotateSpeed: ((4 * Math.PI) / 180) * TICK,
    targetAir: true,
    targetGround: true,
    // Turret's own shootY default, size * tilesize / 2 in world units. The
    // shared `size * 5` fallback is half of that, which parks a size-4
    // muzzle inside the hull
    shootY: 4 * 4 * MU,
    barrels: { count: 2, spread: 8 * MU },
    bullet: {
      speed: 8 * TICK * MU,
      damage: 104, // Mindustry's 80, +30% (see the note above)
      lifetime: (260 + 9 + 10) / 8 / TICK, // limitRange() default margin 9
      splash: 0,
      splashRadius: 0,
      collidesAir: true,
      collidesGround: true,
      hitRadius: (5 / 2) * MU, // hitSize 5
      // BulletType.init: pierceCap >= 1 turns pierce on by itself
      pierce: true,
      pierceCap: 2,
      knockback: 0.7,
      // THE SHELL IS DRAWN IN COPPER, not in thorium's pink. Every number
      // above is still thorium ammo's; this is the line's look, not its
      // stats — a spectre ends duo's line and now wears
      // duo's plating, so it throws duo's round at four times the size
      sprite: {
        region: "bullet",
        across: 16 * MU,
        along: 23 * MU, // the biggest round on the field by half again
        shrinkX: 0,
        shrinkY: 0.5,
        back: PAL.copperAmmoBack,
        front: PAL.copperAmmoFront,
      },
      shootFx: FxKind.ShootBig,
      smokeFx: FxKind.SmokeSmall,
      hitFx: FxKind.BulletHit,
      despawnFx: FxKind.BulletHit,
      fxColor: PAL.copperAmmoBack,
    },
  },
  // Meltdown, from mindustry/content/Blocks.java: a LaserTurret, which
  // is a turret that does not fire shots at all. It lights a
  // ContinuousLaserBulletType and HOLDS it — Mindustry's 78 raised 30% to
  // 101 (the phase-tier up-gun, see spectre) to everything under the beam
  // every five ticks, for 230 ticks, and only then does the 90-tick reload
  // start running. 1,212 damage a second while it burns,
  // against nothing at all while it cools: a 72% duty cycle.
  //
  // firingMoveFract halves the turret's turn rate for as long as the beam
  // is lit, so meltdown tracks a crossing target badly and a queue walking
  // into it perfectly. The beam pierces without limit, which is what makes
  // that queue the case it is built for.
  meltdown: {
    name: "Meltdown",
    size: 4,
    health: 3200,
    armor: 15,
    range: 195 * MU,
    reload: 90 / TICK,
    shots: 1,
    shotDelay: 0,
    spread: 0,
    inaccuracy: 0,
    shootCone: (40 * Math.PI) / 180,
    rotateSpeed: ((1.5 * Math.PI) / 180) * TICK,
    targetAir: true,
    targetGround: true,
    shootY: 4 * 4 * MU, // Turret's own default, as spectre's
    bullet: {
      speed: 0,
      damage: 101, // per damageInterval, NOT per second — stock 78, +30%
      lifetime: 0, // the beam is turret state, not a projectile
      splash: 0,
      splashRadius: 0,
      collidesAir: true,
      collidesGround: true,
      hitRadius: (4 / 2) * MU, // hitSize 4
      continuous: {
        length: 200 * MU,
        damageInterval: 5 / TICK,
        duration: 230 / TICK, // LaserTurret.shootDuration
        fade: 16 / TICK, // ContinuousLaserBulletType.fadeTime
        moveFract: 0.5, // LaserTurret.firingMoveFract
      },
      // Upstream the TURRET names Fx.shootBigSmoke2 and the bullet none,
      // so the block's orange powder cloud is what plays. A laser throws
      // no powder, and this one ends lancer's line, so it lights up the
      // way a lancer fires instead: the two blue wings off the muzzle,
      // square to the beam. No other TURRET fired the cloud; the swarm's
      // artillery and its spark guns still do (weapons.ts)
      shootFx: FxKind.LancerShoot,
      hitFx: FxKind.HitMeltdown,
      // THE BEAM IS LANCER'S BLUE, not Mindustry's orange — a meltdown
      // ends arc's and lancer's line and now wears its
      // plating, so it burns in its colour too. This entry carries the
      // muzzle cloud and the bars flicking off whatever the beam rests on;
      // the four washes of the beam itself are MELTDOWN_BEAM (weapons.ts),
      // which is repainted to match
      fxColor: PAL.lancerLaser,
    },
  },
  // Foreshadow, from mindustry/content/Blocks.java with surge ammo (a
  // RailBulletType): 500 units of range — the only turret that outreaches
  // the map's own lanes — and one 1755-damage shot every 200 ticks
  // (Mindustry's 1350, +30%: the phase-tier up-gun, see spectre).
  //
  // THE DAMAGE IS A BUDGET, NOT A NUMBER. The rail is an instant line, and
  // every body it punches through takes whatever is LEFT of the 1350 and
  // then subtracts its own full health from it (pierceDamageFactor 1). So
  // one shot deletes a queue until 1350 health has gone by and stops dead
  // there — nine daggers, or a fortress and a half. It kills a health
  // POOL, which is why it targets the STRONGEST thing in range rather than
  // the nearest: spending the reload on a stray crawler is the one way to
  // waste it.
  foreshadow: {
    name: "Foreshadow",
    size: 4,
    health: 2400,
    armor: 15,
    range: 500 * MU,
    reload: 200 / TICK,
    shots: 1,
    shotDelay: 0,
    spread: 0,
    inaccuracy: 0,
    shootCone: (2 * Math.PI) / 180, // it commits: two degrees, and 1.5 deg/tick
    rotateSpeed: ((1.5 * Math.PI) / 180) * TICK,
    targetAir: true,
    targetGround: true,
    shootY: 4 * 4 * MU, // Turret's own default, as spectre's
    sort: "strongest",
    bullet: {
      speed: 0,
      damage: 1755, // Mindustry's 1350, +30% (see the note above)
      lifetime: 1 / TICK, // RailBulletType's own: the damage is instant
      splash: 0,
      splashRadius: 0,
      collidesAir: true,
      collidesGround: true,
      rail: { length: 500 * MU, pointSpacing: 20 * MU },
      pierceFx: FxKind.RailHit,
      pointFx: FxKind.InstTrail,
      shootFx: FxKind.InstShoot,
      smokeFx: FxKind.SmokeCloud,
      hitFx: FxKind.InstHit,
      // despawnEffect fires where the shot DIES, and a rail bullet dies at
      // the muzzle it never left — so instBomb is the turret's own flash
      despawnFx: FxKind.InstBomb,
      fxColor: PAL.bulletYellowBack,
    },
  },
};

/**
 * WHAT A TURRET IS, in one sentence, for the card the tech tree opens over
 * its node.
 *
 * The node itself can only ever say what BUYING it does — "+1 Duo
 * placement" — which is the shopkeeper's half of the question and not the
 * player's. The player is choosing between seventeen guns they have never
 * fired, so the card has to say what the gun DOES: how it delivers damage,
 * and the one quirk that decides where it wants to stand.
 *
 * ONE PLAIN SENTENCE, AND NOTHING ELSE. No numbers — they are already on
 * the board and in the balance page, and they would go stale the first time
 * the constants above are touched. No tactics either: where a turret wants
 * to stand is the player's discovery, and a card that hands it over is both
 * longer and less fun. Just what the gun DOES — an arc jumps, a ripple
 * lobs, a foreshadow takes one huge shot — because a card nobody finishes
 * reading mid-wave has told the player nothing.
 *
 * WHO IT SHOOTS AT IS NOT IN HERE. That line is derived from targetAir and
 * targetGround (see targetingLine below) so it can never contradict the
 * stats, and so a rung that grants air targeting — arc's Ionised Air —
 * moves it for free.
 */
export const TOWER_DESC: Record<import("./types").TowerKind, string> = {
  duo: "Shoots small bullets quickly.",
  scatter: "Shoots flak shells that burst near enemies.",
  arc: "Shoots lightning that jumps between enemies.",
  hail: "Lobs shells that explode where they land.",
  scorch: "Sprays fire at close range and sets enemies alight.",
  salvo: "Shoots four shells at once, then reloads slowly.",
  wave: "Lobs a ball of water that bursts and soaks everything nearby.",
  lancer: "Charges up, then fires a beam through a line of enemies.",
  ripple: "Lobs four shells at once over a long distance.",
  parallax: "Locks a beam onto one enemy that burns hotter the longer it holds.",
  fuse: "Shoots three heavy rays at very close range.",
  swarmer: "Shoots homing missiles that explode on contact.",
  cyclone: "Shoots a fast stream of shells that burst into fragments.",
  tsunami: "Throws heavy water balls that burst into a huge flood, soaking and shredding everything caught in it.",
  mender: "Repairs nearby buildings every few seconds.",
  mendProjector: "Repairs nearby buildings faster and over a wider area.",
  spectre: "Shoots heavy bullets from two barrels without stopping.",
  meltdown: "Burns one enemy with a continuous laser.",
  foreshadow: "Shoots one huge railgun shot with a long reload.",
};

/**
 * WHO A TURRET WILL SHOOT AT, as the one line the card prints under the
 * description. Derived rather than authored so it cannot drift from the
 * stats, and so it follows an upgraded turret: pass the stats the player
 * actually has and arc reads "ground and air" the moment Ionised Air is
 * bought.
 *
 * A SUPPORT BLOCK (TowerStats.heal) reads "Shoots nothing", which is the
 * whole truth about it — what it does INSTEAD is the sentence above, and
 * saying it twice on one card helps nobody. Anything else that targets
 * neither is a bug, and the last line says so plainly rather than
 * pretending — a silent empty string would hide it.
 */
export const targetingLine = (s: TowerStats): string =>
  s.heal
    ? "Shoots nothing"
    : s.targetAir && s.targetGround
    ? "Targets both ground and air units"
    : s.targetAir
      ? "Targets air units only"
      : s.targetGround
        ? "Targets ground units only"
        : "Targets nothing";




/**
 * A TURRET'S POOL, TIMES THIS — the one dial over what a structure can
 * take (towerMaxHp). There are no walls to stand in front of a gun
 * (types.ts), so the gun itself holds the pool a line needs to be chewed
 * on for a while, and the swarm's bite (weapons.ts unitDamageScale) stays
 * at Mindustry's own number so a balance pass is done here and never row
 * by row.
 *
 * FIVE. It was four, then eight when the deal came in — a turret is no
 * longer chosen and paid for at its own price but dealt (rarity.ts) and
 * placed free, so a line cannot be repaired by buying the same gun again
 * and a structure has to SURVIVE its mistake rather than be replaced out
 * of it. Eight bought that, and overshot: a pool that deep took the
 * pressure off the placement entirely, and a misplaced turret sat there
 * absorbing a whole tide instead of teaching anything. Five keeps the
 * lesson and gives the swarm back its teeth.
 *
 * The core is written on its own (CORE_HP) and did NOT move with it.
 */
export const TOWER_HP_SCALE = 5;

/** the stats of a structure kind — one funnel, so a caller never reads TOWERS by hand */
export const structStats = (kind: import("./types").TowerKind): TowerStats => TOWERS[kind];

/** a structure's full pool: its Mindustry block health times the dial */
export const towerMaxHp = (kind: import("./types").TowerKind): number =>
  TOWERS[kind].health * TOWER_HP_SCALE;

/*
 * CONSTRUCTION TIME IS GONE (BUILD_TIME_BY_SIZE, buildTimeOf). A placed
 * structure used to go up as a 1 hp shell, sized by its footprint, and
 * only stand up for real when a timer ran out. Every placement is
 * INSTANT now — see the note on Tower in types.ts for why the deal made
 * that timer untenable.
 */

/**
 * The stats driving one live projectile. Almost always the firing turret's
 * own ammo — the exception is a shot thrown by BulletType.createFrags,
 * which is the PARENT ammo's child and has its own speed, damage, life and
 * sprite. One boolean rather than a stats pointer on every projectile
 * keeps Projectile a flat record, which is what the sim's hot loop wants.
 */
export function bulletOf(kind: import("./types").TowerKind, frag: boolean): BulletStats {
  const b = structStats(kind).bullet;
  return frag && b.frag ? b.frag.bullet : b;
}

/**
 * Mindustry WaveSpawner.spawnEffect, 1:1: what a wave does to every unit it
 * puts on the map, beyond placing it.
 *
 * StatusEffects.unmoving (speedMultiplier 0) for half a second and
 * StatusEffects.invincible (healthMultiplier infinity) for a whole one. A
 * unit therefore MATERIALISES where it lands rather than sliding out of the
 * pad already walking — which is the entrance, and the reason Fx.unitSpawn
 * has something to play over.
 *
 * `unmoving` is a speed multiplier and not a freeze: the crowd can still
 * shove an arriving unit, it just cannot walk itself.
 */
export const SPAWN_INVINCIBLE = 60 / TICK;
export const SPAWN_UNMOVING = 30 / TICK;

/**
 * THE MOVEMENT LAYERS, and the axis the whole spawn/exit model turns on.
 *
 * A unit belongs to exactly one of these for its whole life, decided by its
 * kind: a flyer is air, a naval tank is water, everything else walks. The
 * layer picks which flow field it steers by, which drop zones it may enter
 * from, and which exits it is trying to reach — three questions that used
 * to share one answer plus a hand-authored region id on top.
 *
 * "WATER" IS THE AMPHIBIOUS LAYER, not a wetter kind of ground. A naval
 * tank crosses deep water AND dry land, so its field is the walkers' with
 * the deep cells opened up (navalWalkMask) and its doors are the water
 * zones AND the ground ones. What the layer still costs it is pace: ashore
 * it drives at NAVAL_LAND_SPEED of its stat. That is why every family now
 * lands on every map — there is no terrain a layer cannot cross.
 *
 * REGIONS ARE GONE AND THIS REPLACED THEM. A drop zone used to carry a
 * NUMBER, and a wave group had to name the same number to use it — two
 * places to keep in step, in two different editors, with nothing checking
 * that they agreed. What every one of those numbers was actually FOR was
 * "the flyers come in over there, the walkers up this lane", which is a
 * fact about the units rather than a label a script should have to repeat.
 * So the zone carries the layer, and each unit finds its own door.
 */
export const MOVE_LAYERS = ["ground", "air", "water"] as const;
export type MoveLayer = (typeof MOVE_LAYERS)[number];

/**
 * WHAT A NAVAL TANK LOSES ASHORE: thirty per cent of its speed, applied to
 * the drive and to nothing else.
 *
 * It is deliberately NOT a pathfinding input. The naval field is a plain
 * shortest-path solve over "rock, and nothing else" (navalWalkMask), so a
 * tank takes the same route a walker would and simply crosses the water on
 * the way when the water is on the way — it does not detour for a channel,
 * and it does not refuse a shortcut over land. The penalty is what makes
 * the sea worth being in when the sea happens to point at the core, and
 * what a player standing turrets over a beach is buying.
 *
 * Mindustry's own shallow-water speedMultiplier is 0.5 for the same reason
 * we skip it for walkers (see terrain.ts WALL_DEEP): there, a speed
 * penalty would be a pathfinding input. Here it is not one — the field
 * never reads it.
 */
export const NAVAL_LAND_SPEED = 0.7;

/**
 * What a drop zone feeds: one of the movement layers, or the BOSS door.
 *
 * Boss is not a movement layer — a boss still walks or flies like anything
 * else — it is a zone only boss-flagged kinds may use, and which the
 * ordinary swarm is kept out of. It outlived the region ids because it was
 * never really one of them: it answered to no wave group even then. A map
 * with no boss zone lets its bosses use their own layer's zones.
 */
export const ZONE_KINDS = ["ground", "air", "water", "boss"] as const;
export type ZoneKind = (typeof ZONE_KINDS)[number];

/**
 * One bit per zone kind, for the rasterized per-cell layers (Terrain.spawn
 * and Terrain.goal). A cell can sit under several zones at once — a ground
 * zone and an air zone are allowed to overlap — so the layer is a MASK
 * rather than an id, which is the other half of what the old region byte
 * got wrong: a byte could only ever remember the last circle painted over
 * a cell.
 *
 * The exit layer uses the three movement bits and never the boss one: a
 * boss leaves by its own layer's exits, like everything else.
 */
export const LAYER_BIT: Readonly<Record<ZoneKind, number>> = {
  ground: 1,
  air: 2,
  water: 4,
  boss: 8,
};
/** every movement bit at once — what an exit that serves everything means,
 *  and what a pre-layer document's exits are read as */
export const ALL_MOVE_BITS = LAYER_BIT.ground | LAYER_BIT.air | LAYER_BIT.water;

/** Fx.unitSpawn's own 30 ticks, and Fx.spawn's — the second is run 30
 *  ticks BEHIND the first (Time.run), so it lands exactly as the unit
 *  stops being unmoving and takes its first step */
export const FX_UNIT_SPAWN = 30 / TICK;
export const FX_SPAWN = 30 / TICK;

// StatusEffects.burning, 1:1: 0.167 damage per tick, and it pierces armor
// (StatusEffect.update calls damageContinuousPierce) — but a shield still
// soaks it. Fx.burning flickers off a burning unit at effectChance per tick
export const BURN_DPS = 0.167 * TICK;
export const BURN_FX_CHANCE = 0.15 * TICK; // Mathf.chanceDelta(0.15)
// StatusEffects.wet's flicker: Fx.wet at effectChance 0.09 per tick, from
// a random point inside the hitbox exactly like burning's. The status's
// TEETH — the slow — are per-bullet (BulletStats.wet), not here: wave and
// tsunami soak to different depths, so the strength travels with the ammo
export const WET_FX_CHANCE = 0.09 * TICK;

// ShrapnelBulletType draw geometry (world units -> px), shared by the
// renderer so the animation matches the original exactly
export const SHRAPNEL = {
  width: 20 * MU, // thorium keeps the default width
  backLen: 10 * MU,
  tipPad: 4 * MU,
  serrations: 7,
  serrationSpacing: 8 * MU,
  serrationLenScl: 10 * MU,
  serrationWidth: 4 * MU,
  serrationSpaceOffset: 80 * MU,
  serrationFadeOffset: 0.5,
  fromColor: PAL.white,
  toColor: PAL.thoriumPink,
} as const;

// the DEFAULT base: a 5x5 block of walkable goal cells. A map document
// may place its own base anywhere (MapData.base), so nothing but the
// fallback should read BASE directly — the live position is terrain.base

/**
 * THE CORE'S HEALTH: Mindustry's core nucleus, 6,000 (Blocks.java), times
 * a dial OF ITS OWN — the number the fifty-wave script was tuned against.
 * It is the run: the swarm exists to knock it down, and the moment it does
 * the run is over (Sim.lost).
 *
 * It used to read TOWER_HP_SCALE, and it stopped the day that dial was
 * doubled for the deal. Doubling the turrets is a statement about how long
 * a LINE holds; doubling the core would be a statement about how long the
 * whole fifty waves take to lose, which is every map's pacing at once and
 * is not a change anybody asked for. Four, where it has always been.
 */
export const CORE_HP_SCALE = 4;
export const CORE_HP = 6000 * CORE_HP_SCALE;

export const BASE = { x: 120, y: 33, size: 5 };
/** every base is this many cells square */
export const BASE_SIZE = BASE.size;

/**
 * DAMAGE TINT PER HP THIRD — full health renders the sprite as-is (grey
 * armour, orange cell, like Mindustry), and a hit greys it down: soot,
 * not blood.
 *
 * IT USED TO REDDEN. That put the game's one alarm colour on the thing
 * the player is winning against, so a lane full of nearly-dead bodies
 * read as danger — and it was the same red the HUD spends on the last
 * life and the build ghost spends on "you cannot place this". Red is for
 * the player's problems now. The swarm's damage is a body going dark,
 * which is what a burning machine does, and the sim puts smoke on it to
 * say the same thing twice (DAMAGE_SMOKE_BELOW).
 *
 * A neutral grey rather than a warm or cool one, so the water tint and
 * the hungry hue multiply into it cleanly — a wet, hurt unit is a darker
 * blue, not a muddy purple. Towers wear the same table, so "this is
 * taking damage" still reads identically on both sides of the fight.
 */
export const HP_TINT: ReadonlyArray<readonly [number, number, number]> = [
  [0.5, 0.5, 0.52],
  [0.76, 0.76, 0.78],
  [1.0, 1.0, 1.0],
];

/**
 * DAMAGE SMOKE (Sim.updateStatus): a unit below this share of its pool
 * sheds grey puffs, thickening toward death. Half, so it starts at the
 * same moment the tint's middle step does — one threshold, said two ways.
 */
export const DAMAGE_SMOKE_BELOW = 0.5;
/** puffs a second at death's door, for a dagger-sized body; the sim scales
 *  it by the hitbox, so a toxopid at the same health pours several times
 *  this. Mathf.chanceDelta-style: a per-second chance scaled by dt */
export const DAMAGE_SMOKE_RATE = 5;
/** seconds one puff lives — short, so a body that is healed stops
 *  smoking within a breath rather than trailing it */
export const DAMAGE_SMOKE_LIFE = 0.55;

/**
 * POISON — the Venom spitters' whole family trait (weapons.ts), and the
 * only status this game puts on a BUILDING.
 *
 * IT IS RAW HEALTH A SECOND AND IT IGNORES ARMOUR. Every other thing the
 * swarm does to a structure is a hit that plating shaves; this one is not,
 * which is what makes the venom line the answer to a board that has
 * out-armoured the ground mechs. See the note on Tower.poison.
 *
 * ONE CLOCK, REFRESHED. A fresh application does not queue behind the last
 * one — it adds its rate and puts the clock back to full, the way burning
 * resets on a body. So a turret under steady fire rots continuously and a
 * turret the wave has walked past stops rotting POISON_TIME later.
 */
export const POISON_TIME = 6;
/** the ceiling on stacked rot, as a multiple of ONE application's rate.
 *  Four spitters on one turret rot it four times as fast; a whole wave
 *  standing on it does not, or the cap on a patch's life would be how many
 *  bodies happened to be in reach rather than anything the player chose */
export const POISON_MAX_RATE = 4;
/** motes a second a rotting structure lifts, for a 1x1 — scaled by the
 *  footprint exactly as the damage smoke is, so a rotting spectre reads
 *  from across the field */
export const POISON_FX_RATE = 6;
/** seconds one mote lives */
export const POISON_FX_LIFE = 0.6;

/**
 * THE AURAS THE TWO REWORKED FAMILIES CARRY, both of them a STAMP rather
 * than a standing lookup: a carrier's pulse writes a timer onto every body
 * in reach (Sim.updateAbilities), and the buff is live while that timer is.
 *
 * IT IS A STAMP BECAUSE THE ALTERNATIVE IS A SCAN PER BODY PER TICK. There
 * are up to 22,000 bodies and a handful of carriers; asking every body
 * "is a reign near me" every frame is the wrong way round. The carrier
 * pulses on its own reload and pays for the search once.
 *
 * THE TIMER OUTLIVES THE PULSE by AURA_LINGER, so a body inside a field
 * that pulses every two seconds is buffed continuously rather than
 * flickering off in the gaps — and one that walks out of the field keeps it
 * for that long and no longer.
 */
export const AURA_LINGER = 1.35;

export const clamp = (v: number, a: number, b: number): number =>
  v < a ? a : v > b ? b : v;
