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
  // Mindustry TractorBeamTurret: not a bullet at all. The turret holds a
  // beam on one target, damaging it continuously and PULLING it toward
  // itself with a force divided by the target's mass
  tractor?: {
    force: number; // Mindustry world units of impulse per tick
    scaledForce: number; // ...plus this much again, at point-blank
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
  // StatusEffects.wet, and THE ROSTER'S ONE DELIBERATE DEVIATION. Upstream
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
  | FxKind.HitLiquid;

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
};
/** Fx.lancerLaserCharge's own 38 ticks, inside LancerCharge's 60 */
export const LANCER_CHARGE_SPARK = 38 / 60;

export interface TowerStats {
  name: string;
  size: number; // footprint in tiles (size x size)
  /** Mindustry's own block health for this turret, BEFORE TOWER_HP_SCALE
   *  — see towerMaxHp for where each number comes from */
  health: number;
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
  bullet: BulletStats;
}


export const TOWERS: Record<import("./types").TowerKind, TowerStats> = {
  // Duo, 1:1 from mindustry/content/Blocks.java with copper ammo
  // (BasicBulletType(2.5, 9)): one shot every 20 ticks, alternating between
  // twin barrels 3.5 units apart (ShootAlternate)
  duo: {
    name: "Duo",
    size: 1,
    health: 250,
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
  // Wave, from mindustry/content/Blocks.java with water ammo — 1:1 on
  // every number EXCEPT the water's effect, which is this game's one
  // deliberate deviation (see BulletStats.wet): upstream's knockback 0.7
  // is gone, and the wet status slows instead of garnishing.
  //
  // The geometry is the original's: a size-2 turret hosing twenty orbs a
  // second (reload 3 ticks) over 110 units, at a 50-degree cone and 5
  // degrees of scatter so the stream sprays rather than draws a line.
  // LiquidBulletType(water): speed 3.5, lifetime 34 ticks, statusDuration
  // 60*2 — and 0.2 damage where upstream carries 0, because a turret
  // whose printed DPS is 4 is honest about being a support piece while
  // still able to finish what the water wore down. Wet units drive at 65%
  // speed for 2 s, refreshed on every hit, so anything under the hose is
  // pinned at 65% and stays slowed for two seconds after walking out.
  wave: {
    name: "Wave",
    size: 2,
    health: 1000,
    range: 110 * MU,
    reload: 3 / TICK,
    shots: 1,
    shotDelay: 0,
    spread: 0,
    inaccuracy: (5 * Math.PI) / 180,
    shootCone: (50 * Math.PI) / 180,
    rotateSpeed: ((5 * Math.PI) / 180) * TICK, // BaseTurret default
    targetAir: true,
    targetGround: true,
    bullet: {
      speed: 3.5 * TICK * MU,
      damage: 0.2,
      // no limitRange call upstream: 3.5 units/tick for 34 ticks is 119
      // units against a 110 range — the drag we don't model ate the rest
      lifetime: 34 / TICK,
      splash: 0,
      splashRadius: 0,
      collidesAir: true,
      collidesGround: true,
      hitRadius: (4 / 2) * MU, // BulletType's default hitSize 4
      wet: { duration: 2, slow: 0.65 },
      orb: 3 * MU, // LiquidBulletType's default orbSize
      // LiquidTurret zeroes the block's own effects; the bullet's
      // shootEffect is Fx.shootLiquid and its hit is Fx.hitLiquid — and
      // despawned() fires the hit effect too, so an orb that outruns its
      // lifetime still lands as a splash
      shootFx: FxKind.ShootLiquid,
      hitFx: FxKind.HitLiquid,
      despawnFx: FxKind.HitLiquid,
      fxColor: PAL.water,
    },
  },
  // Parallax, 1:1 from mindustry/content/Blocks.java. A TractorBeamTurret
  // has no reload and fires no bullet at all: it holds a beam on ONE flyer
  // and, every tick it is aimed within 6 degrees, deals 0.5 armour-piercing
  // damage and pulls the target toward itself.
  //
  // The pull is an impulse divided by the target's MASS (hitSize squared,
  // times pi), which is the whole character of the turret: the same 16-25
  // units of force that nearly stops a flare barely leans on an antumbra.
  // Thirty damage a second will not kill anything on its own — parallax
  // takes air units out of formation and hands them to something else.
  parallax: {
    name: "Parallax",
    size: 2,
    health: 640,
    range: 300 * MU,
    reload: 0, // continuous: no volley clock at all
    shots: 1,
    shotDelay: 0,
    spread: 0,
    inaccuracy: 0,
    shootCone: (6 * Math.PI) / 180, // TractorBeamTurret's own default
    rotateSpeed: ((12 * Math.PI) / 180) * TICK,
    targetAir: true,
    targetGround: false,
    bullet: {
      // damageContinuousPierce is per TICK; this table is per second
      speed: 0,
      damage: 0.5 * TICK,
      lifetime: 0,
      splash: 0,
      splashRadius: 0,
      collidesAir: true,
      collidesGround: false,
      pierceArmor: true,
      tractor: { force: 16, scaledForce: 9 },
    },
  },
  // Tsunami, from mindustry/content/Blocks.java with water ammo — wave's
  // rule: 1:1 on every number except the water's effect (BulletStats.wet).
  // Upstream's knockback 1.7 — two and a half waves' worth of shove — is
  // traded for the deeper slow, which is the entire reason to pay a
  // size-3, endgame-priced bill for a 8-DPS turret.
  //
  // Twin barrels 4 units apart firing together (ShootAlternate, shots 2)
  // every 3 ticks: forty orbs a second, so it soaks a COLUMN rather than
  // picking at a file. The heavy shot flies faster and further (speed 4,
  // lifetime 49 ticks over 190 range), soaks for twice wave's duration
  // (statusDuration 60*4), and its 0.2 contact damage is upstream's own.
  // Wet units drive at 45% speed for 4 s — anything crossing its 190-unit
  // umbrella spends better than twice as long under every other turret.
  tsunami: {
    name: "Tsunami",
    size: 3,
    health: 2250,
    range: 190 * MU,
    reload: 3 / TICK,
    shots: 2,
    shotDelay: 0, // both barrels throw on the same tick
    spread: 0,
    inaccuracy: (3 * Math.PI) / 180,
    shootCone: (45 * Math.PI) / 180,
    rotateSpeed: ((5 * Math.PI) / 180) * TICK, // BaseTurret default
    targetAir: true,
    targetGround: true,
    velocityRnd: 0.1,
    barrels: { count: 2, spread: 4 * MU },
    bullet: {
      speed: 4 * TICK * MU,
      damage: 0.2,
      lifetime: 49 / TICK, // 196 units of flight over a 190 range
      splash: 0,
      splashRadius: 0,
      collidesAir: true,
      collidesGround: true,
      hitRadius: (4 / 2) * MU, // BulletType's default hitSize 4
      wet: { duration: 4, slow: 0.45 },
      orb: 4 * MU, // the heavy shot's own orbSize
      shootFx: FxKind.ShootLiquid,
      hitFx: FxKind.HitLiquid,
      despawnFx: FxKind.HitLiquid,
      fxColor: PAL.water,
    },
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
 * IT IS PROSE, NOT A STAT BLOCK. The numbers are already on the board and
 * in the balance page, and repeating them here would go stale the first
 * time constants above are touched. What does not go stale is the shape of
 * the thing — an arc chains, a ripple lobs, a foreshadow takes one enormous
 * shot — so that is what is written.
 *
 * WHO IT SHOOTS AT IS NOT IN HERE. That line is derived from targetAir and
 * targetGround (see targetingLine below) so it can never contradict the
 * stats, and so a rung that grants air targeting — arc's Ionised Air —
 * moves it for free.
 */
export const TOWER_DESC: Record<import("./types").TowerKind, string> = {
  duo: "A cheap single-barrel gun. One small bullet at a time at the nearest body — the turret every board starts with, and the one that stays worth having in numbers.",
  scatter: "A flak gun. Its shells burst near a flyer rather than hitting it, damaging everything caught in the blast.",
  arc: "Fires a lightning bolt that walks from body to body down a file, so it is worth most aimed along a lane rather than across one.",
  hail: "Artillery. Arcs a shell over the ground and explodes where it lands, hitting a cluster instead of a body. It never fires at a flyer.",
  scorch: "A flamethrower with barely any reach. Enormous close-range damage and it sets what it touches alight — burning ignores armour.",
  salvo: "Fires a four-shell volley in quick succession, then spends a while reloading. Steady damage against single hard targets.",
  wave: "Sprays water. It does almost no damage; what it does is soak enemies so they move slower, for the turrets behind it.",
  lancer: "Charges, then fires a beam that cuts through a whole line of bodies at once. Armour counts quadruple against it, so it struggles on heavily armoured waves until Charged Optics.",
  ripple: "Long-range artillery. Lobs four shells an arc onto a wide patch of ground — the longest reach short of a foreshadow, and it never fires at a flyer.",
  parallax: "A tractor beam. It drags flyers backwards down the lane and does small armour-piercing damage while it holds them; the pull is the point, not the damage.",
  fuse: "A close-range shotgun. Three heavy rays at once in a tight cone, with almost no reach — it wants to stand where the lane bends.",
  swarmer: "Fires homing missiles that chase their target and explode on contact, so very little of a volley is ever wasted.",
  cyclone: "A high-rate flak cannon. A constant stream of shells that burst into fragments near whatever they hit.",
  tsunami: "A heavy water sprayer covering a wide area. Like the wave it barely damages anything — it soaks a whole lane at once so everything in it slows.",
  spectre: "A twin-barrel heavy machine gun with the highest sustained damage in the game, alternating between barrels so it never stops firing.",
  meltdown: "Holds a continuous laser on one target, burning through it for as long as it stays in range.",
  foreshadow: "An extreme-range railgun firing one enormous shot on a long reload. It picks the highest-health target in range rather than the nearest.",
};

/**
 * WHO A TURRET WILL SHOOT AT, as the one line the card prints under the
 * description. Derived rather than authored so it cannot drift from the
 * stats, and so it follows an upgraded turret: pass the stats the player
 * actually has and arc reads "ground and air" the moment Ionised Air is
 * bought.
 *
 * A turret that targets NEITHER cannot exist today, and the fallback says
 * so plainly rather than pretending — a silent empty string would hide the
 * bug that produced it.
 */
export const targetingLine = (s: TowerStats): string =>
  s.targetAir && s.targetGround
    ? "Targets both ground and air units"
    : s.targetAir
      ? "Targets air units only"
      : s.targetGround
        ? "Targets ground units only"
        : "Targets nothing";




/**
 * A TURRET'S POOL, TIMES THIS — the one dial over what a structure can
 * take (towerMaxHp). Four: there are no walls to stand in front of a gun
 * (types.ts), so the gun itself holds the pool a line needs to be chewed
 * on for a while, and the swarm's bite (weapons.ts unitDamageScale) stays
 * at Mindustry's own number so a balance pass is done here and never row
 * by row. The core (CORE_HP) is written on its own.
 */
export const TOWER_HP_SCALE = 4;

/** the stats of a structure kind — one funnel, so a caller never reads TOWERS by hand */
export const structStats = (kind: import("./types").TowerKind): TowerStats => TOWERS[kind];

/** a structure's full pool: its Mindustry block health times the dial */
export const towerMaxHp = (kind: import("./types").TowerKind): number =>
  TOWERS[kind].health * TOWER_HP_SCALE;

/**
 * CONSTRUCTION TIME, BY FOOTPRINT — a placed structure is not a finished
 * one. It goes up as a shell first: one hit point, no gun, and the swarm
 * takes it apart with a single shot (Sim.damageTower). Only when the
 * timer runs out does it stand up with its real pool and start shooting.
 *
 * THE TIME IS THE FOOTPRINT'S, NOT THE TURRET'S. Every 1x1 raises in the
 * same beat, every 2x2 in the same longer one, and so on — what a player
 * is paying for in seconds is the ground they are covering, not which gun
 * they picked, so the choice between two turrets of a size stays a choice
 * about the gun. Bigger costs more because a bigger shell is a bigger
 * window in which the swarm can walk up and pop it.
 *
 * Indexed by size (1..4); index 0 is unused padding so the lookup is the
 * footprint itself.
 */
export const BUILD_TIME_BY_SIZE = [0, 2, 4, 6.5, 10, 14, 18, 22, 26, 30] as const;
/** how long this structure spends as a 1 hp shell before it works */
export const buildTimeOf = (kind: import("./types").TowerKind): number =>
  BUILD_TIME_BY_SIZE[structStats(kind).size] ?? BUILD_TIME_BY_SIZE[BUILD_TIME_BY_SIZE.length - 1];

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
 * the same dial every turret carries — the number the fifty-wave script
 * was tuned against. It is the run: the swarm exists to knock it down,
 * and the moment it does the run is over (Sim.lost).
 */
export const CORE_HP = 6000 * TOWER_HP_SCALE;

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

export const clamp = (v: number, a: number, b: number): number =>
  v < a ? a : v > b ? b : v;
