export const COLS = 256;
export const ROWS = 192;
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
  // a bare BulletType with no sprite of its own (Mindustry's BulletType.draw
  // only draws a trail and parts): the shot is invisible and its shoot and
  // hit effects ARE the visual. This is how scorch's flame works
  invisible?: boolean;
  // Mindustry LaserBulletType: an instant beam, not a projectile. Unlike a
  // `ray` it is capped — Damage.collideLaser stops at the pierceCap'th
  // victim and the DRAWN beam stops there too, so a laser that runs into a
  // crowd is visibly shorter than one fired down an empty lane
  laser?: {
    length: number; // px
    pierceCap: number; // how many units one beam may hit
    width: number; // px — the drawn beam's core width
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
}

export interface TowerStats {
  name: string;
  size: number; // footprint in tiles (size x size)
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
  // ShootAlternate: successive shots leave side-by-side barrels, `spread`
  // px apart perpendicular to the facing
  barrels?: { count: number; spread: number };
  bullet: BulletStats;
}

export const TOWERS: Record<import("./types").TowerKind, TowerStats> = {
  // Duo, 1:1 from mindustry/content/Blocks.java with copper ammo
  // (BasicBulletType(2.5, 9)): one shot every 20 ticks, alternating between
  // twin barrels 3.5 units apart (ShootAlternate)
  duo: {
    name: "Duo",
    size: 1,
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
    },
  },
  // Hail, 1:1 from mindustry/content/Blocks.java with graphite ammo
  // (ArtilleryBulletType(3, 20)): a slow arcing shell every 60 ticks that
  // ignores everything in flight and blasts 33 splash where it lands.
  // Artillery can't touch the air — ground targets only
  hail: {
    name: "Hail",
    size: 1,
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
    },
  },
  // Salvo, 1:1 from mindustry/content/Blocks.java with thorium ammo
  // (BasicBulletType(4, 28)): 4-shot bursts 3 ticks apart, every 29 ticks
  salvo: {
    name: "Salvo",
    size: 2,
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
    },
  },
  // Scatter, 1:1 from mindustry/content/Blocks.java with lead ammo
  // (FlakBulletType(4.2, 3), splash 27*1.5 in a 15-unit radius).
  // Anti-air only, exactly like upstream: it ignores the ground swarm and
  // waits for flyers.
  scatter: {
    name: "Scatter",
    size: 2,
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
    },
  },
  // Fuse, 1:1 from mindustry/content/Blocks.java with thorium ammo
  // (ShrapnelBulletType, damage 105): three instant piercing rays fired as
  // a ShootSpread(3, 20deg) fan, 3 shots / 0.583s = the official 5.14/sec.
  fuse: {
    name: "Fuse",
    size: 3,
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
      invisible: true,
    },
  },

  // ---------- STUBS ----------------------------------------------------
  //
  // The Extreme and Eradication turrets, present so the tech tree can show
  // the whole shape of the game. SIZE, RANGE and RELOAD are the real
  // Mindustry numbers (content/Blocks.java) because those are what the
  // ceiling rule in tech.ts is solved from and they must not be guesses.
  // EVERYTHING ELSE IS A PLACEHOLDER — the bullets below are a duo's, not
  // each turret's own, and the aiming fields are defaults.
  //
  // None of these is in the build menu, so none can be placed. Implementing
  // one means replacing its bullet block with the real ammo and adding it
  // to TOWER_MENU; nothing else here has to change.
  // Arc, 1:1 from mindustry/content/Blocks.java (a PowerTurret, so its one
  // shootType is the whole armament): a LightningBulletType at 20 damage
  // and lightningLength 25. The bolt is not a shot — it walks twelve nodes
  // out from the muzzle, damaging what each lands on and chaining to the
  // furthest enemy within reach of it, which is why arc's reach in a crowd
  // is far longer than the 90 units it targets from. Ground only.
  arc: {
    name: "Arc",
    size: 1,
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
      damage: 20,
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
    },
  },
  // Ripple, 1:1 from mindustry/content/Blocks.java with graphite ammo
  // (ArtilleryBulletType(3, 40), 70 splash in a 22.5-unit radius): four
  // shells every two seconds over 290 units, the longest reach in the game.
  // The volley scatters on purpose — 11 degrees of inaccuracy, a velocity
  // roll in [0.8, 1] and a lifetime roll in [0.95, 1.08] — so it lands as a
  // pattern across the lane rather than four shells in one hole.
  ripple: {
    name: "Ripple",
    size: 3,
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
  ...stubTurrets({
    // EXTREME — homing missiles that chase what they lock
    swarmer: { name: "Swarmer", size: 2, range: 240, reload: 60 * 4 / 7, shots: 4 },
    // EXTREME — a flak wall; the reason to own it is volume of splash
    cyclone: { name: "Cyclone", size: 3, range: 200, reload: 10 },
    // ERADICATION — twin heavy cannon, the highest sustained damage there is
    spectre: { name: "Spectre", size: 4, range: 260, reload: 7, barrels: 2 },
    // ERADICATION — a continuous beam that melts whatever it rests on
    meltdown: { name: "Meltdown", size: 4, range: 195, reload: 90 },
    // ERADICATION — 500 range, one enormous shot; a sniper, not a defence
    foreshadow: { name: "Foreshadow", size: 4, range: 500, reload: 200 },
  }),
};

/** shape of one stub before it is filled out into a whole TowerStats */
interface StubSpec {
  name: string;
  size: number;
  /** Mindustry world units, as printed in Blocks.java */
  range: number;
  /** Mindustry ticks between volleys */
  reload: number;
  shots?: number;
  air?: boolean;
  ground?: boolean;
  barrels?: number;
}

/**
 * Fill a stub out into a valid TowerStats so the record typechecks and a
 * stray placement cannot crash the sim. The bullet is a duo's, deliberately
 * — a stub that fired something plausible would be harder to notice than
 * one that fires a copper pellet.
 */
function stubTurrets<K extends string>(specs: Record<K, StubSpec>): Record<K, TowerStats> {
  const out = {} as Record<K, TowerStats>;
  for (const [kind, s] of Object.entries(specs) as [K, StubSpec][]) {
    out[kind] = {
      name: s.name,
      size: s.size,
      range: s.range * MU,
      reload: s.reload / TICK,
      shots: s.shots ?? 1,
      shotDelay: 0,
      spread: 0,
      inaccuracy: (5 * Math.PI) / 180,
      shootCone: (15 * Math.PI) / 180,
      rotateSpeed: ((10 * Math.PI) / 180) * TICK,
      targetAir: s.air ?? true,
      targetGround: s.ground ?? true,
      ...(s.barrels ? { barrels: { count: s.barrels, spread: 4 * MU } } : {}),
      bullet: {
        speed: 2.5 * TICK * MU,
        damage: 9, // PLACEHOLDER
        lifetime: (s.range + 15) / 2.5 / TICK,
        splash: 0,
        splashRadius: 0,
        collidesAir: s.air ?? true,
        collidesGround: s.ground ?? true,
      },
    };
  }
  return out;
}

// StatusEffects.burning, 1:1: 0.167 damage per tick, and it pierces armor
// (StatusEffect.update calls damageContinuousPierce) — but a shield still
// soaks it. Fx.burning flickers off a burning unit at effectChance per tick
export const BURN_DPS = 0.167 * TICK;
export const BURN_FX_CHANCE = 0.15 * TICK; // Mathf.chanceDelta(0.15)

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
  fromColor: [1, 1, 1] as const, // white
  toColor: [0xf9 / 255, 0xa3 / 255, 0xc7 / 255] as const, // Pal.thoriumPink
} as const;

// the DEFAULT core: 5x5 core-nucleus of walkable goal cells. A map document
// may place its own core anywhere (MapData.core), so nothing but the
// fallback should read BASE directly — the live position is terrain.core
export const BASE = { x: 120, y: 33, size: 5 };
/** every core is this many cells square */
export const CORE_SIZE = BASE.size;

// damage tint per hp third — full hp renders the sprite as-is
// (gray armor, orange cell, like Mindustry); hits darken and redden it
export const HP_TINT: ReadonlyArray<readonly [number, number, number]> = [
  [0.65, 0.4, 0.38],
  [1.0, 0.72, 0.65],
  [1.0, 1.0, 1.0],
];

export const clamp = (v: number, a: number, b: number): number =>
  v < a ? a : v > b ? b : v;
