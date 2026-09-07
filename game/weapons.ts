import { CELL, PAL, SHRAPNEL } from "./constants";
import type { UnitKind } from "./levels";
import { FxKind, type RGB } from "./types";

/**
 * WHAT EVERY ENEMY SHOOTS — the units' weapons, after Mindustry's
 * UnitTypes.java, in the sim's own units (px, seconds).
 *
 * THE RTS TURN, second half: every unit attack-moves. It walks the field
 * toward the base as it always did, and whatever structure comes within
 * a weapon's reach on the way is shot (Sim.updateUnitWeapons) — the
 * turret on the corner of the lane, the wall of duos across it, the
 * spectre it is walking into. A structure in the swarm's PATH is now a
 * wall the swarm chews through (FlowField: a structure cell is passable
 * at STRUCTURE_COST), which is Mindustry's own ground pathing, and what
 * "a-move" means when the enemy has no player units to fight.
 *
 * TWO KINDS OF NUMBER LIVE IN EVERY ROW, and they are held to different
 * standards.
 *
 *   - THE LOOK — the bullet's sprite, size, shrink and colours, a beam's
 *     palette and width, a sap's colour, what lands where the shot hits —
 *     is read off UnitTypes.java (master, 2026) and the bullet classes
 *     under entities/bullet, 1:1. A dagger's round is bulletYellow, not
 *     copper: units fire BasicBulletType's own defaults, and only turret
 *     ammo recolours them. An arkyid's shell is 19 units of sapBullet
 *     purple; a quasar's beam is Pal.heal with a 45-degree side flare;
 *     the omura's rail is orangeSpark. These are the game's own art and
 *     nothing here is free to differ from it.
 *
 *   - THE BITE — reload, damage, splash, range — was written from memory
 *     of v146 before the repository was reachable, and the balance is
 *     tuned around what was written (see setUnitDamageScale). Where a
 *     row's bite differs from what UnitTypes.java says now, the row says
 *     so in an `upstream:` note and KEEPS ITS NUMBER: truing those up is
 *     a balance pass, not an art pass, and it is done with the stage
 *     table open, not row by row.
 *
 * CONVERSIONS. A Mindustry world unit is MU px (CELL / 8); a bullet's
 * range is speed x lifetime world units; speeds are per tick, so px/s
 * is x MU x 60; reloads are ticks, so seconds are / 60. A MIRRORED
 * weapon (Mindustry's default) is two mounts that alternate, so the pair
 * fires twice per reload: `mounts` is that count and the sim spaces the
 * shots evenly (reload / mounts). `damage` is per bullet AGAINST A
 * STRUCTURE — buildingDamageMultiplier is folded in where Mindustry sets
 * one. Shots that carry splash deal `damage` to what they hit and
 * `splash` to every structure within `splashRadius`.
 */

const MU = CELL / 8;
/** world units to px */
const u = (n: number): number => n * MU;
/** world units per tick to px per second */
const spd = (n: number): number => n * MU * 60;
/** ticks to seconds */
const t = (n: number): number => n / 60;
/** speed x lifetime, in px */
const rng = (speed: number, lifetime: number): number => u(speed * lifetime);

/** how a shot is drawn, and how it lands */
export type WeaponFx =
  | "bullet" // a sprite that flies and hits what it reaches
  | "missile" // the same, splash on arrival
  | "shell" // artillery: flies to where it was aimed and splashes there
  | "flame" // instant, short, a flame tongue at the target
  | "laser" // instant beam from the mount, its full length, through the target
  | "lightning" // a bolt walked out of the muzzle toward the target
  | "sap" // instant thin beam (the spider line)
  | "shrapnel" // instant serrated ray (ShrapnelBulletType)
  | "bomb" // dropped where the unit is: a fused shot that bursts there
  | "rail" // instant, very long, the omura's railgun
  | "field"; // EnergyFieldAbility: every structure in reach, at once

/**
 * Which atlas region pair a flying shot is drawn with — the sprite name a
 * BasicBulletType is constructed with. `orb` is no sprite at all:
 * LiquidBulletType.draw is a filled circle in the liquid's colour.
 */
export type ShotRegion =
  | "bullet"
  | "shell"
  | "missile"
  | "missile-large"
  | "circle-bullet"
  | "mine-bullet"
  | "disrupt-missile"
  | "orb";

/**
 * BasicBulletType.draw, for a shot in flight: the `-back` region under the
 * inner one on a width x height box, each in its own colour, both
 * shrinking on the shot's fout as shrinkX/shrinkY say. Plus what the shot
 * fires with and what it leaves where it lands.
 */
export interface ShotLook {
  region: ShotRegion;
  /** BasicBulletType.width — px ACROSS the line of flight */
  width: number;
  /** BasicBulletType.height — px ALONG it */
  height: number;
  shrinkX: number;
  shrinkY: number;
  /** shrinkInterp = Interp.slope: peaks at half life (artillery) */
  slope?: boolean;
  back: RGB;
  front: RGB;
  /** LaserBoltBulletType.draw: a `height`-long line in `back` and a half
   *  one in `front` laid over the sprite */
  bolt?: boolean;
  /** the muzzle flash (BulletType.shootEffect) and its smoke */
  shoot: FxKind;
  smoke?: FxKind;
  /** BulletType.hitEffect, and the colour effects that ramp into one
   *  (hitBulletColor, hitLiquid) take */
  hit: FxKind;
  hitColor?: RGB;
  /** an ExplosionEffect's style, for hit = FxKind.Explosion */
  hitStyle?: number;
  /** ArtilleryBulletType.update: a trail puff every (3 + fslope * 2) x
   *  mult ticks, fslope x size wide, in the back colour */
  trail?: { size: number; mult: number; color: RGB };
  /** BulletType.trailChance: a Fx.missileTrail puff on this chance per
   *  tick, trailParam wide, in trailColor */
  puff?: { chance: number; size: number; color: RGB };
  /** a fixed life in seconds — a bomb's fuse, which does not fly */
  lifetime?: number;
  /** BulletType.collides = false: nothing on the way is hit */
  collide?: false;
}

/**
 * LaserBulletType.draw's parameters: `colors` (r, g, b, alpha per pass,
 * each pass half the width of the last), the beam width and the side
 * flares off the muzzle. Style 0 is lancer's — the turret's beam and the
 * class default.
 */
export interface LaserStyle {
  id: number;
  colors: readonly (readonly [RGB, number])[];
  width: number; // world units
  sideAngle: number; // radians
  sideWidth: number;
  sideLength: number; // world units
  lifetime: number; // seconds
}

/** SapBulletType: a Drawf.laser in `color`, `width` its scale */
export interface SapStyle {
  id: number;
  color: RGB;
  width: number;
  lifetime: number;
}

/**
 * ContinuousLaserBulletType.colors and width — the four washes of a held
 * beam. Style 0 is meltdown's (the class default), read by the turret.
 */
export interface BeamStyle {
  id: number;
  colors: readonly (readonly [RGB, number])[];
  width: number; // world units
}

/** ShrapnelBulletType.draw's geometry, in px, the shape of constants.SHRAPNEL */
export interface ShrapnelStyle {
  id: number;
  width: number;
  backLen: number;
  tipPad: number;
  serrations: number;
  serrationSpacing: number;
  serrationLenScl: number;
  serrationWidth: number;
  serrationSpaceOffset: number;
  serrationFadeOffset: number;
  fromColor: RGB;
  toColor: RGB;
}

/** ExplosionEffect's fields, in world units */
export interface ExplosionStyle {
  id: number;
  lifetime: number; // seconds
  waveColor: RGB;
  waveLife: number; // ticks
  waveStroke: number;
  waveRad: number;
  waveRadBase: number;
  smokeColor: RGB;
  smokes: number;
  smokeSize: number;
  smokeSizeBase: number;
  smokeRad: number;
  sparkColor: RGB;
  sparks: number;
  sparkStroke: number;
  sparkRad: number;
  sparkLen: number;
}

export interface UnitWeapon {
  /** the Mindustry weapon or bullet it is, for the reader */
  name: string;
  /** seconds between this mount's shots (Mindustry reload / 60) */
  reload: number;
  /** how many of this mount the unit carries; a mirrored pair is 2 */
  mounts: number;
  /** bullets per shot (shoot.shots); 1 when unset */
  shots?: number;
  /** ShootSpread: radians between shots of one volley */
  spread?: number;
  /** damage a bullet does to the structure it hits, building multiplier folded in */
  damage: number;
  /** splash to every structure within splashRadius of the hit, if any */
  splash?: number;
  splashRadius?: number;
  /** how far the weapon reaches, px — the bullet's speed x lifetime */
  range: number;
  /** px/s; 0 is instant (a beam, a bolt, a flame, a bomb) */
  speed: number;
  fx: WeaponFx;
  /**
   * A held beam (ContinuousLaserBulletType): once it fires it deals
   * `damage` every `interval` seconds for `duration` seconds, then the
   * reload runs. Vela and corvus-class weapons.
   */
  beam?: { duration: number; interval: number };
  /**
   * shoot.firstShotDelay: the weapon holds its shot this many seconds
   * after it is ready, glowing (Fx.greenLaserCharge) before the beam. The
   * row's reload INCLUDES it — the cycle is the reload, the charge is
   * how it opens.
   */
  charge?: number;
  /** the unit dies firing it (crawler): the splash is centred on itself */
  suicide?: boolean;
  /** the most structures one field pulse reaches (EnergyFieldAbility.maxTargets) */
  maxTargets?: number;
  // ---- THE LOOK, per fx kind ------------------------------------------
  /** bullet / missile / shell / bomb: the sprite in flight */
  look?: ShotLook;
  /** laser: LaserBulletType's palette and flares */
  laser?: LaserStyle;
  /** laser with `beam`: the held beam's washes */
  beamStyle?: BeamStyle;
  sap?: SapStyle;
  shrapnel?: ShrapnelStyle;
  /** lightning: Lightning.create's colour and node count (length + rand) */
  bolt?: { color: RGB; length: number; lengthRand: number; inaccuracy: number };
  /** flame: false is Fx.shootSmallFlame (mace), true the plasma variant
   *  (oxynoe: white through Pal.heal to grey, and Fx.hitFlamePlasma) */
  plasma?: boolean;
  /** field: EnergyFieldAbility.color, for the chain and the orbit */
  fieldColor?: RGB;
  /** rail / laser: what the muzzle throws */
  shoot?: FxKind;
  shootLen?: number;
}

/**
 * ONE DIAL OVER EVERY UNIT WEAPON, at 1: the rows below are Mindustry's
 * and the swarm bites exactly as they say. Balance is not done yet; when
 * it is, it is done here (setUnitDamageScale) and on TOWER_HP_SCALE, not
 * row by row — the rows are meant to stay Mindustry's. For the record:
 * with the turrets at twice upstream health, x1 lost every map by wave
 * six and x0.015 cleared Confluence; the turrets are at ten times now.
 */
let damageScale = 1;
export const unitDamageScale = (): number => damageScale;
export function setUnitDamageScale(x: number): void {
  damageScale = Math.max(0, x);
}

/**
 * Mindustry Pathfinder.costGround: a tile held by another team's solid
 * block costs 70 extra to path through. That is the whole of "a-move" —
 * the field routes around a wall when the way round is cheaper and
 * through it when it is not, and the bodies that press into it shoot it.
 */
export const STRUCTURE_COST = 70;

// ---- THE STYLE REGISTRIES ------------------------------------------------
// Each style is registered once and carries its index: the sim writes the
// index into an effect's `sides` lane and the renderer reads the style back
// out of the table. Slot 0 of each table is the class default the turrets
// draw with, so an effect pushed with no style still draws as it always did.

export const LASER_STYLES: LaserStyle[] = [];
const laserStyle = (s: Omit<LaserStyle, "id">): LaserStyle => {
  const st = { ...s, id: LASER_STYLES.length };
  LASER_STYLES.push(st);
  return st;
};
export const SAP_STYLES: SapStyle[] = [];
const sapStyle = (s: Omit<SapStyle, "id">): SapStyle => {
  const st = { ...s, id: SAP_STYLES.length };
  SAP_STYLES.push(st);
  return st;
};
export const BEAM_STYLES: BeamStyle[] = [];
const beamStyle = (s: Omit<BeamStyle, "id">): BeamStyle => {
  const st = { ...s, id: BEAM_STYLES.length };
  BEAM_STYLES.push(st);
  return st;
};
export const SHRAPNEL_STYLES: ShrapnelStyle[] = [];
const shrapnelStyle = (s: Omit<ShrapnelStyle, "id">): ShrapnelStyle => {
  const st = { ...s, id: SHRAPNEL_STYLES.length };
  SHRAPNEL_STYLES.push(st);
  return st;
};
export const EXPLOSION_STYLES: ExplosionStyle[] = [];
const explosionStyle = (s: Omit<ExplosionStyle, "id">): ExplosionStyle => {
  const st = { ...s, id: EXPLOSION_STYLES.length };
  EXPLOSION_STYLES.push(st);
  return st;
};

const DEG = Math.PI / 180;
const WHITE: RGB = PAL.white;

/** LaserBulletType's own defaults — lancer's beam, style 0 */
export const LANCER_LASER = laserStyle({
  colors: [[PAL.lancerLaser, 0.4], [PAL.lancerLaser, 1], [WHITE, 1]],
  width: 15,
  sideAngle: 90 * DEG,
  sideWidth: 0.7,
  sideLength: 29,
  lifetime: t(16),
});
/** quasar's beam-weapon: Pal.heal, a wide 45-degree side flare */
const QUASAR_LASER = laserStyle({
  colors: [[PAL.heal, 0.4], [PAL.heal, 1], [WHITE, 1]],
  width: 15,
  sideAngle: 45 * DEG,
  sideWidth: 1,
  sideLength: 70,
  lifetime: t(16),
});
/** corvus-weapon: the same green, 75 wide, no side flare, 65 ticks */
const CORVUS_LASER = laserStyle({
  colors: [[PAL.heal, 0.4], [PAL.heal, 1], [WHITE, 1]],
  width: 75,
  sideAngle: 15 * DEG,
  sideWidth: 0,
  sideLength: 0,
  lifetime: t(65),
});
/** eclipse's large-laser-mount: the hot orange of a continuous laser, 25 wide */
const ECLIPSE_LASER = laserStyle({
  colors: [[[0xec / 255, 0x74 / 255, 0x58 / 255], 0xaa / 255], [[1, 0x9c / 255, 0x5a / 255], 1], [WHITE, 1]],
  width: 25,
  sideAngle: 20 * DEG,
  sideWidth: 1.5,
  sideLength: 80,
  lifetime: t(16),
});

/** every sap gun on the roster fires Color.valueOf("bf92f9") — Pal.sapBullet */
const SPIROCT_SAP = sapStyle({ color: PAL.sapBullet, width: 0.54, lifetime: t(35) });
const SPIROCT_MOUNT_SAP = sapStyle({ color: PAL.sapBullet, width: 0.4, lifetime: t(25) });
const ARKYID_SAP = sapStyle({ color: PAL.sapBullet, width: 0.55, lifetime: t(30) });

/** ContinuousLaserBulletType.colors — meltdown's, style 0 */
export const MELTDOWN_BEAM = beamStyle({
  colors: [
    [[0xec / 255, 0x74 / 255, 0x58 / 255], 0x55 / 255],
    [[0xec / 255, 0x74 / 255, 0x58 / 255], 0xaa / 255],
    [[1, 0x9c / 255, 0x5a / 255], 1],
    [WHITE, 1],
  ],
  width: 9,
});
/** Pal.heal at .2, .5, x1.2 and white — vela's and navanax's plasma */
const healBright: RGB = [Math.min(1, PAL.heal[0] * 1.2), 1, Math.min(1, PAL.heal[2] * 1.2)];
const VELA_BEAM = beamStyle({
  colors: [[PAL.heal, 0.2], [PAL.heal, 0.5], [healBright, 1], [WHITE, 1]],
  width: 9,
});
const NAVANAX_BEAM = beamStyle({
  colors: [[PAL.heal, 0.2], [PAL.heal, 0.5], [healBright, 1], [WHITE, 1]],
  width: 4,
});

/** fuse's ray — style 0, the geometry constants.ts already carries */
export const FUSE_SHRAPNEL = shrapnelStyle({ ...SHRAPNEL });
/** toxopid's large-purple-mount: 25 wide, ten serrations, sapBullet fading to sapBulletBack */
const TOXOPID_SHRAPNEL = shrapnelStyle({
  width: u(25),
  backLen: u(10),
  tipPad: u(4),
  serrations: 10,
  serrationSpacing: u(8),
  serrationLenScl: u(7),
  serrationWidth: u(6),
  serrationSpaceOffset: u(60),
  serrationFadeOffset: 0,
  fromColor: PAL.sapBullet,
  toColor: PAL.sapBulletBack,
});

/** cyerce's plasma missile: a heal wave to 30 with white smoke and heal sparks */
const CYERCE_EXPLOSION = explosionStyle({
  lifetime: t(28),
  waveColor: PAL.heal,
  waveLife: 10,
  waveStroke: 6,
  waveRad: 30,
  waveRadBase: 7,
  smokeColor: WHITE,
  smokes: 6,
  smokeSize: 4,
  smokeSizeBase: 0.5,
  smokeRad: 23,
  sparkColor: PAL.heal,
  sparks: 6,
  sparkStroke: 1.5,
  sparkRad: 35,
  sparkLen: 4,
});
/** the disrupt missile's shootOnDeath burst: Pal.sap x 1.8 wave, suppress smoke and sparks */
const sapBright: RGB = [Math.min(1, PAL.sap[0] * 1.8), Math.min(1, PAL.sap[1] * 1.8), Math.min(1, PAL.sap[2] * 1.8)];
const DISRUPT_EXPLOSION = explosionStyle({
  lifetime: t(50),
  waveColor: sapBright,
  waveLife: 12,
  waveStroke: 5,
  waveRad: 40,
  waveRadBase: 2,
  smokeColor: PAL.suppress,
  smokes: 7,
  smokeSize: 4,
  smokeSizeBase: 0,
  smokeRad: 23,
  sparkColor: PAL.suppress,
  sparks: 10,
  sparkStroke: 2,
  sparkRad: 40,
  sparkLen: 6,
});

// ---- THE LOOKS -----------------------------------------------------------

/**
 * BasicBulletType(speed, damage) as a unit fires it: the "bullet" sprite in
 * Pal.bulletYellowBack / bulletYellow, shrinking to half its length by the
 * end, Fx.shootSmall out of the muzzle and Fx.hitBulletSmall (white into
 * Pal.lightOrange) where it lands.
 */
const basic = (width: number, height: number, o: Partial<ShotLook> = {}): ShotLook => ({
  region: "bullet",
  width: u(width),
  height: u(height),
  shrinkX: 0,
  shrinkY: 0.5,
  back: PAL.bulletYellowBack,
  front: PAL.bulletYellow,
  shoot: FxKind.ShootSmall,
  smoke: FxKind.SmokeSmall,
  hit: FxKind.BulletHit,
  hitColor: PAL.lightOrange,
  ...o,
});
/** MissileBulletType: the "missile" sprite, 8x8, no shrink, a Fx.missileTrail puff on a 0.2 chance, Fx.blastExplosion */
const missile = (back: RGB, front: RGB, trailColor: RGB, o: Partial<ShotLook> = {}): ShotLook => ({
  region: "missile",
  width: u(8),
  height: u(8),
  shrinkX: 0,
  shrinkY: 0,
  back,
  front,
  shoot: FxKind.ShootSmall,
  smoke: FxKind.SmokeSmall,
  hit: FxKind.BlastExplosion,
  puff: { chance: 0.2, size: u(2), color: trailColor },
  ...o,
});
/** ArtilleryBulletType: the "shell" sprite, Interp.slope shrink, Fx.shootBig, an artilleryTrail in the back colour */
const artillery = (size: number, back: RGB, front: RGB, hit: FxKind, o: Partial<ShotLook> = {}): ShotLook => ({
  region: "shell",
  width: u(size),
  height: u(size),
  shrinkX: 0.15,
  shrinkY: 0.5,
  slope: true,
  back,
  front,
  shoot: FxKind.ShootBig,
  smoke: FxKind.SmokeSmall,
  hit,
  trail: { size: u(4), mult: 1, color: back },
  ...o,
});
/** FlakBulletType: a "shell" in the default yellows, 8x10 unless set, Fx.flakExplosion */
const flak = (width = 8, height = 10, o: Partial<ShotLook> = {}): ShotLook => ({
  region: "shell",
  width: u(width),
  height: u(height),
  shrinkX: 0,
  shrinkY: 0.5,
  back: PAL.bulletYellowBack,
  front: PAL.bulletYellow,
  shoot: FxKind.ShootSmall,
  smoke: FxKind.SmokeSmall,
  hit: FxKind.Flak,
  ...o,
});
/**
 * LaserBoltBulletType: BasicBulletType's 5x7 "bullet" in Pal.heal / white
 * with the two centred lines over it, Fx.hitLaser at both ends. The class
 * hides its parent's width/height with its own, so the sprite keeps the
 * 5x7 default whatever the bolt's line is drawn at.
 */
const healBolt: ShotLook = {
  region: "bullet",
  width: u(5),
  height: u(7),
  shrinkX: 0,
  shrinkY: 0.5,
  back: PAL.heal,
  front: WHITE,
  bolt: true,
  shoot: FxKind.HitLaser,
  hit: FxKind.HitLaser,
  hitColor: PAL.heal,
};

/** Bullets.standardCopper: BasicBulletType(2.5, 9), lifetime 60 */
const copper = (name: string, reload: number, mounts: number): UnitWeapon => ({
  name,
  reload: t(reload),
  mounts,
  damage: 9,
  range: rng(2.5, 60),
  speed: spd(2.5),
  fx: "bullet",
  look: basic(7, 9),
});

/**
 * the missiles-mount most of the naval line carries: MissileBulletType(2.7,
 * 12), splash 10 in 25 — the "missile" sprite in bulletYellowBack /
 * bulletYellow (the naval line recolours it off the missile default) with
 * a grey trail
 */
const navalMissile = missile(PAL.bulletYellowBack, PAL.bulletYellow, PAL.gray);
const missilesMount = (mounts: number, reload = 25, splash = 10, lifetime = 50): UnitWeapon => ({
  name: "missiles-mount",
  reload: t(reload),
  mounts,
  damage: 12,
  splash,
  splashRadius: u(25),
  range: rng(2.7, lifetime),
  speed: spd(2.7),
  fx: "missile",
  look: navalMissile,
});

export const UNIT_WEAPONS: Record<UnitKind, readonly UnitWeapon[]> = {
  // ---- the dagger line --------------------------------------------------
  // large-weapon: reload 13, BasicBulletType(2.5, 9) 7x9, lifetime 60, mirrored
  dagger: [copper("large-weapon", 13, 2)],
  // flamethrower: BulletType(4.2, 37) lifetime 13, pierceBuilding —
  // Fx.shootSmallFlame out of the barrel, Fx.hitFlameSmall on the wall.
  // upstream: reload 22, damage 37 x 2 (hitSize 7)
  mace: [
    { name: "flamethrower", reload: t(11), mounts: 2, damage: 37, range: rng(4.2, 13), speed: 0, fx: "flame" },
  ],
  // artillery: reload 60, ArtilleryBulletType(2, 20, "shell") 14x14 in
  // bulletYellowBack / bulletYellow, Fx.blastExplosion, splash 80 in 35.
  // upstream: lifetime 120 - (35 - 8) / 2 = 106.5
  fortress: [
    {
      name: "artillery", reload: t(60), mounts: 2, damage: 20, splash: 80, splashRadius: u(35),
      range: rng(2, 120), speed: spd(2), fx: "shell",
      look: artillery(14, PAL.bulletYellowBack, PAL.bulletYellow, FxKind.BlastExplosion),
    },
  ],
  // scepter-weapon: BasicBulletType(8, 70) 11x20, shrinkX 0.4 / shrinkY 0,
  // Fx.shootBig, Fx.blastExplosion — plus two scepter-mount pairs firing a
  // 4.5x35 sliver (shrinkX 0.6, shrinkY 0, Interp.slope).
  // upstream: main reload 45 with shoot.shots 3 (shotDelay 4), speed 8,
  // damage 70, lifetime 27; mounts reload 12 and 15, BasicBulletType(12, 20)
  scepter: [
    {
      name: "scepter-weapon", reload: t(60), mounts: 2, damage: 50, range: rng(7, 25), speed: spd(7), fx: "bullet",
      look: basic(11, 20, { shrinkX: 0.4, shrinkY: 0, shoot: FxKind.ShootBig, hit: FxKind.BlastExplosion }),
    },
    {
      name: "scepter-mount", reload: t(13), mounts: 4, damage: 10, range: rng(3, 50), speed: spd(3), fx: "bullet",
      look: basic(4.5, 35, { shrinkX: 0.6, shrinkY: 0, slope: true, hitColor: PAL.bulletYellowBack }),
    },
  ],
  // reign-weapon: BasicBulletType(13, 80) 14x33, pierce, Fx.shootBig,
  // Fx.blastExplosion. upstream: reload 9, lifetime 15, splash 18 in 13
  // and three 10x10 frag rounds
  reign: [
    {
      name: "reign-weapon", reload: t(25), mounts: 2, damage: 80, range: rng(13, 24), speed: spd(13), fx: "bullet",
      look: basic(14, 33, { shoot: FxKind.ShootBig, hit: FxKind.BlastExplosion }),
    },
  ],

  // ---- the crawler line -------------------------------------------------
  // the crawler IS the bullet: splash 90 in 55, rangeOverride 30, and it
  // dies — Fx.pulverize where it went off, and the body's own death blast.
  // upstream: splash 80 x 0.68 in 44, rangeOverride 25
  crawler: [
    {
      name: "crawler", reload: t(24), mounts: 1, damage: 0, splash: 90, splashRadius: u(55),
      range: u(30), speed: 0, fx: "bomb", suicide: true,
    },
  ],
  // atrax-weapon: reload 9, LiquidBulletType(slag) damage 13, speed 2.5,
  // lifetime 57 — an orb of slag (Fill.circle, radius 3) with Fx.shootSmall
  // and Fx.hitLiquid in the same colour
  atrax: [
    {
      name: "atrax-weapon", reload: t(9), mounts: 2, damage: 13, range: rng(2.5, 57), speed: spd(2.5), fx: "bullet",
      look: {
        region: "orb", width: u(6), height: u(6), shrinkX: 0, shrinkY: 0,
        back: PAL.slag, front: PAL.slag,
        shoot: FxKind.ShootSmall, hit: FxKind.HitLiquid, hitColor: PAL.slag,
      },
    },
  ],
  // spiroct-weapon: reload 14, SapBulletType damage 23, length 75, width
  // 0.54; mount-purple-weapon: SapBulletType damage 18, length 40, width
  // 0.4 — both in bf92f9. upstream: mount reload 18 (row 20)
  spiroct: [
    { name: "spiroct-weapon", reload: t(14), mounts: 2, damage: 23, range: u(75), speed: 0, fx: "sap", sap: SPIROCT_SAP },
    { name: "mount-purple-weapon", reload: t(20), mounts: 2, damage: 18, range: u(40), speed: 0, fx: "sap", sap: SPIROCT_MOUNT_SAP },
  ],
  // three spiroct-weapon sap pairs (SapBulletType width 0.55) and a
  // large-purple-mount ArtilleryBulletType(2, 12), 19x19 in sapBulletBack /
  // sapBullet, Fx.sapExplosion, Fx.shootBigSmoke2.
  // upstream: saps at reload 9 / 14 / 22, damage 40, length 55; the
  // artillery reload 45, lifetime 70, splash 65 in 70
  arkyid: [
    { name: "spiroct-weapon", reload: t(14), mounts: 4, damage: 20, range: u(90), speed: 0, fx: "sap", sap: ARKYID_SAP },
    {
      name: "large-purple-mount", reload: t(60), mounts: 1, damage: 12, splash: 70, splashRadius: u(60),
      range: rng(2, 100), speed: spd(2), fx: "shell",
      look: artillery(19, PAL.sapBulletBack, PAL.sapBullet, FxKind.SapExplosion, { smoke: FxKind.SmokeBig2 }),
    },
  ],
  // large-purple-mount: ShrapnelBulletType damage 110, length 90, two rays
  // 17 degrees apart (ShootSpread), Fx.sparkShoot; toxopid-cannon:
  // ArtilleryBulletType(3, 50) 25x25 in the sap purples, Fx.sapExplosion.
  // upstream: cannon reload 210, lifetime 80, splash 75 in 80, nine frags
  toxopid: [
    {
      name: "large-purple-mount", reload: t(30), mounts: 2, shots: 2, spread: 17 * DEG, damage: 110, range: u(90),
      speed: 0, fx: "shrapnel", shrapnel: TOXOPID_SHRAPNEL,
    },
    {
      name: "toxopid-cannon", reload: t(65), mounts: 1, damage: 50, splash: 90, splashRadius: u(55),
      range: rng(3, 90), speed: spd(3), fx: "shell",
      look: artillery(25, PAL.sapBulletBack, PAL.sapBullet, FxKind.SapExplosion, { smoke: FxKind.SmokeBig2 }),
    },
  ],

  // ---- the support line -------------------------------------------------
  // heal-weapon: LaserBoltBulletType(5.2, 13) lifetime 30, alternate false —
  // a green bolt that FLIES, Fx.hitLaser at both ends. upstream: reload 30
  nova: [
    {
      name: "heal-weapon", reload: t(24), mounts: 2, damage: 13, range: rng(5.2, 30), speed: spd(5.2), fx: "bullet",
      look: healBolt,
    },
  ],
  // heal-shotgun-weapon: reload 36, three LightningBulletType bolts of 8 +
  // rand 7 nodes in Pal.heal, 35 degrees of inaccuracy, buildingDamage
  // 0.25 — damage 14 (upstream 15), maxRange 40
  pulsar: [
    {
      name: "heal-shotgun-weapon", reload: t(36), mounts: 2, shots: 3, damage: 14 * 0.25, range: u(40), speed: 0,
      fx: "lightning", bolt: { color: PAL.heal, length: 8, lengthRand: 7, inaccuracy: 35 * DEG },
    },
  ],
  // beam-weapon: reload 55, LaserBulletType damage 45 in Pal.heal, length
  // 150 (row 135), sideAngle 45 / sideWidth 1 / sideLength 70
  quasar: [
    {
      name: "beam-weapon", reload: t(55), mounts: 2, damage: 45, range: u(135), speed: 0, fx: "laser",
      laser: QUASAR_LASER, shoot: FxKind.HitLancer,
    },
  ],
  // vela-weapon: ContinuousLaserBulletType(35) length 180, lifetime 160,
  // reload 155 with a 40-tick charge (Fx.greenLaserChargeSmall) — the four
  // heal washes, Fx.hitMeltHeal where it rests
  vela: [
    {
      name: "vela-weapon", reload: t(155 + 40), mounts: 1, damage: 35, range: u(180), speed: 0, fx: "laser",
      beam: { duration: t(160), interval: t(5) }, charge: t(40), beamStyle: VELA_BEAM,
    },
  ],
  // corvus-weapon: reload 350 with an 80-tick charge (Fx.greenLaserCharge),
  // LaserBulletType damage 560, length 460, width 75, 65 ticks on screen
  corvus: [
    {
      name: "corvus-weapon", reload: t(350 + 80), mounts: 1, damage: 560, range: u(460), speed: 0, fx: "laser",
      laser: CORVUS_LASER, charge: t(80), shoot: FxKind.HitLancer,
    },
  ],

  // ---- the air line -----------------------------------------------------
  // BasicBulletType(2.5, 9) 7x9, Fx.shootSmall + shootSmallSmoke.
  // upstream: reload 80 with shoot.shots 3, lifetime 32, one mount
  flare: [
    { name: "flare", reload: t(20), mounts: 2, damage: 9, range: rng(2.5, 45), speed: spd(2.5), fx: "bullet", look: basic(7, 9) },
  ],
  // bombs: reload 12, BombBulletType(27, 25) — a 10x14 "shell" in the
  // default yellows dropped where the unit is, shrinking (shrinkY 0.7) over
  // its 30-tick fuse, Fx.flakExplosion when it bursts. collides = false
  horizon: [
    {
      name: "horizon-bomb", reload: t(12), mounts: 2, damage: 0, splash: 27, splashRadius: u(25),
      range: u(30), speed: 0, fx: "bomb",
      look: {
        region: "shell", width: u(10), height: u(14), shrinkX: 0, shrinkY: 0.7,
        back: PAL.bulletYellowBack, front: PAL.bulletYellow,
        shoot: FxKind.ShootSmall, hit: FxKind.Flak, lifetime: t(30), collide: false,
      },
    },
  ],
  // zenith-missiles: reload 40, two MissileBulletType(3, 14) lifetime 50,
  // splash 15 in 25 — 8x8 in Pal.unitBack / unitFront with a unitBack trail
  zenith: [
    {
      name: "zenith-missiles", reload: t(40), mounts: 2, shots: 2, damage: 14, splash: 15, splashRadius: u(25),
      range: rng(3, 50), speed: spd(3), fx: "missile",
      look: missile(PAL.unitBack, PAL.unitFront, PAL.unitBack),
    },
  ],
  // two missiles-mount pairs, MissileBulletType(2.7, 18) in the missile
  // default yellows (missileYellowBack / missileYellow), and a
  // large-bullet-mount pair: BasicBulletType(7, 55) 12x18, Fx.shootBig.
  // upstream: missiles at reload 20 and 35, damage 18, splash 37 in 20;
  // the cannon reload 12
  antumbra: [
    {
      name: "missiles-mount", reload: t(20), mounts: 2, damage: 12, splash: 30, splashRadius: u(20),
      range: rng(2.7, 50), speed: spd(2.7), fx: "missile",
      look: missile(PAL.missileYellowBack, PAL.missileYellow, PAL.missileYellowBack),
    },
    {
      name: "large-bullet-mount", reload: t(7), mounts: 2, damage: 55, range: rng(7, 25), speed: spd(7), fx: "bullet",
      look: basic(12, 18, { shoot: FxKind.ShootBig }),
    },
  ],
  // large-laser-mount pair: LaserBulletType damage 115, length 230, width
  // 25 in ec7458 / ff9c5a / white, Fx.shockwave out of the muzzle;
  // large-artillery pairs: FlakBulletType(4, 15) 8x10, Fx.shootBig,
  // Fx.flakExplosion. upstream: flak lifetime 47, splash 65 in 25, reloads
  // 9 and 12
  eclipse: [
    {
      name: "large-laser-mount", reload: t(45), mounts: 2, damage: 115, range: u(230), speed: 0, fx: "laser",
      laser: ECLIPSE_LASER, shoot: FxKind.Shockwave, shootLen: u(28),
    },
    {
      name: "large-artillery", reload: t(9), mounts: 4, damage: 15, range: rng(7, 25), speed: spd(7), fx: "bullet",
      look: flak(8, 10, { shoot: FxKind.ShootBig }),
    },
  ],
  // disrupt-weapon: three disrupt-missile UNITS a volley (shoot.shots 3,
  // inaccuracy 28), each its own sprite with a sapBulletBack engine, going
  // off as ExplosionBulletType(140, 25) in Pal.sap x 1.8 and Pal.suppress,
  // Fx.sparkShoot + shootSmokeTitan off the rail. upstream: speed 4.6,
  // splash 140 in 25
  disrupt: [
    {
      name: "disrupt-weapon", reload: t(70), mounts: 2, damage: 30, splash: 80, splashRadius: u(35),
      range: rng(3.7, 60), speed: spd(3.7), fx: "missile",
      look: {
        region: "disrupt-missile", width: u(39 / 4), height: u(60 / 4), shrinkX: 0, shrinkY: 0,
        back: WHITE, front: WHITE, hitColor: PAL.suppress,
        shoot: FxKind.SparkShoot, smoke: FxKind.SmokeBig2,
        hit: FxKind.Explosion, hitStyle: DISRUPT_EXPLOSION.id,
        puff: { chance: 0.5, size: u(3), color: PAL.sapBulletBack },
      },
    },
  ],

  // ---- the naval line ---------------------------------------------------
  // mount-weapon pair (BasicBulletType(2.5, 9) 7x9, reload 13) and one
  // missiles-mount (MissileBulletType(2.7, 12, "missile") in the naval
  // yellows, grey trail, reload 25, lifetime 65)
  risso: [copper("mount-weapon", 13, 2), missilesMount(1, 25, 10, 65)],
  // mount-weapon pair firing FlakBulletType(4.2, 3) 6x8, Fx.flakExplosion,
  // and an artillery-mount pair: ArtilleryBulletType(3, 20, "shell") 11x11
  // in the default yellows, Fx.flakExplosion. upstream: flak reload 10,
  // lifetime 52.5, splash 40.5 in 15; artillery reload 30, lifetime 73.5,
  // splash 40 in 22.5 — the row keeps the missiles-mount it was written with
  minke: [
    {
      name: "mount-weapon", reload: t(13), mounts: 2, damage: 3, splash: 40, splashRadius: u(15),
      range: rng(4, 45), speed: spd(4), fx: "bullet", look: flak(6, 8),
    },
    {
      ...missilesMount(2, 20, 30),
      name: "artillery-mount", fx: "shell",
      look: artillery(11, PAL.bulletYellowBack, PAL.bulletYellow, FxKind.Flak),
    },
  ],
  // large-artillery: ArtilleryBulletType(3.2, 15) 15x15.5 in
  // missileYellowBack / missileYellow, a 6-wide trail at x0.8,
  // Fx.massiveExplosion, Fx.shootBig2; and a missiles-mount pair (two a
  // volley, lifetime 70). upstream: artillery speed 3.2, lifetime 84,
  // splash 70 in 40
  bryde: [
    {
      name: "large-artillery", reload: t(65), mounts: 1, damage: 20, splash: 85, splashRadius: u(25 * 0.75),
      range: rng(3, 80), speed: spd(3), fx: "shell",
      look: artillery(15, PAL.missileYellowBack, PAL.missileYellow, FxKind.MassiveExplosion, {
        height: u(15.5), shoot: FxKind.ShootBig2, trail: { size: u(6), mult: 0.8, color: PAL.missileYellowBack },
      }),
    },
    { ...missilesMount(2, 20), shots: 2 },
  ],
  // sei-launcher: six MissileBulletType(4.2, 42) 8x8 in the naval yellows
  // (no shrink at all), a bulletYellowBack trail, Fx.blastExplosion; and a
  // large-bullet-mount pair: BasicBulletType(7, 57) 13x19, Fx.shootBig.
  // upstream: splash 45 in 35; the cannon reload 60 with shoot.shots 3,
  // lifetime 35
  sei: [
    {
      name: "sei-launcher", reload: t(45), mounts: 1, shots: 6, damage: 42, splash: 45, splashRadius: u(35),
      range: rng(4.2, 62), speed: spd(4.2), fx: "missile",
      look: missile(PAL.bulletYellowBack, PAL.bulletYellow, PAL.bulletYellowBack),
    },
    {
      name: "large-bullet-mount", reload: t(13), mounts: 2, damage: 57, range: rng(7, 25), speed: spd(7), fx: "bullet",
      look: basic(13, 19, { shoot: FxKind.ShootBig }),
    },
  ],
  // omura-cannon: reload 110, RailBulletType damage 1250, length 500 —
  // Fx.railShoot at the muzzle, Fx.railTrail every 60 units down the
  // line, Fx.railHit on what it punches through, all in Pal.orangeSpark.
  // upstream: the omura carries no small mounts at all
  omura: [
    { name: "omura-cannon", reload: t(110), mounts: 1, damage: 1250, range: u(500), speed: 0, fx: "rail" },
    missilesMount(2, 25, 20),
  ],

  // ---- the naval support line ------------------------------------------
  // the retusa's torpedo: BasicBulletType speed 0.7, "mine-bullet" 8x8 in
  // Pal.heal / white with a heal trail, homing, splash 40 in 32, going off
  // as Fx.blastExplosion + Fx.greenCloud. upstream: reload 90 with
  // shoot.shots 3, lifetime 87, maxRange 50 — plus a LaserBolt pair the
  // row does not carry
  retusa: [
    {
      name: "retusa-torpedo", reload: t(60), mounts: 1, damage: 22, range: u(140), speed: spd(1.4), fx: "bullet",
      look: {
        region: "mine-bullet", width: u(8), height: u(8), shrinkX: 0, shrinkY: 0,
        back: PAL.heal, front: WHITE,
        shoot: FxKind.ShootHeal, hit: FxKind.GreenCloud, hitColor: PAL.heal,
        puff: { chance: 0.5, size: u(1.5), color: PAL.heal },
      },
    },
  ],
  // plasma-mount-weapon pair: reload 5, BulletType(3.4, 23) flame, lifetime
  // 18 — the plasma variant: white through Pal.heal to grey out of the
  // muzzle, Fx.hitFlamePlasma on the wall
  oxynoe: [
    { name: "plasma-mount-weapon", reload: t(5), mounts: 2, damage: 23, range: rng(3.4, 18), speed: 0, fx: "flame", plasma: true },
  ],
  // plasma-missile-mount: FlakBulletType(2.5, 25) on the "missile-large"
  // sprite, 12x12 in Pal.heal / white with a heal trail, a heal
  // ExplosionEffect where it bursts. upstream: reload 60, lifetime 80,
  // splash 25 in 30, seven heal frag missiles
  cyerce: [
    {
      name: "plasma-missile-mount", reload: t(25), mounts: 2, damage: 15, splash: 40, splashRadius: u(30),
      range: rng(2.7, 50), speed: spd(2.7), fx: "missile",
      look: {
        region: "missile-large", width: u(12), height: u(12), shrinkX: 0, shrinkY: 0,
        back: PAL.heal, front: WHITE,
        shoot: FxKind.ShootSmall, smoke: FxKind.SmokeSmall,
        hit: FxKind.Explosion, hitStyle: CYERCE_EXPLOSION.id,
        puff: { chance: 0.5, size: u(2.5), color: PAL.heal },
      },
    },
  ],
  // EnergyFieldAbility(40, 65, 180): 35 (upstream 40) to everything in
  // 180, every 65 ticks — a Fx.chainLightning to each in Pal.heal
  aegires: [
    {
      name: "energy-field", reload: t(65), mounts: 1, damage: 35, range: u(180), speed: 0, fx: "field",
      maxTargets: 25, fieldColor: PAL.heal,
    },
  ],
  // emp-cannon-mount pair: EmpBulletType speed 5, lifetime 60, the
  // "circle-bullet" 12x12 in Pal.heal / white, a heal trail, Fx.hitEmpSpark
  // + shootBigSmoke2 off the muzzle and the heal ring where it lands; two
  // plasma-laser-mount pairs of held ContinuousLaserBulletType, width 4,
  // length 95 (row 90); and no energy field of its own upstream — that is
  // the aegires's. upstream: emp damage 110, splash 110 in 100; lasers
  // reload 170, damage 27, lifetime 155
  navanax: [
    {
      name: "energy-field", reload: t(65), mounts: 1, damage: 40, range: u(220), speed: 0, fx: "field",
      maxTargets: 25, fieldColor: PAL.heal,
    },
    {
      name: "emp-cannon-mount", reload: t(65), mounts: 2, damage: 30, splash: 80, splashRadius: u(60),
      range: rng(5.8, 50), speed: spd(5.8), fx: "missile",
      look: {
        region: "circle-bullet", width: u(12), height: u(12), shrinkX: 0, shrinkY: 0,
        back: PAL.heal, front: WHITE,
        shoot: FxKind.HitEmpSpark, smoke: FxKind.SmokeBig2,
        hit: FxKind.EmpHit, hitColor: PAL.heal,
        trail: { size: u(4), mult: 1, color: PAL.heal },
      },
    },
    {
      name: "plasma-laser-mount", reload: t(90), mounts: 2, damage: 12, range: u(90), speed: 0, fx: "laser",
      beam: { duration: t(60), interval: t(5) }, beamStyle: NAVANAX_BEAM,
    },
  ],
};

/** the most weapon slots any unit carries — the per-unit cooldown stride in the sim */
export const MAX_WEAPONS = 3;

/** how far a unit can reach a structure at all: its longest weapon, in px */
export const UNIT_REACH: Readonly<Record<UnitKind, number>> = Object.fromEntries(
  (Object.keys(UNIT_WEAPONS) as UnitKind[]).map((k) => [
    k,
    UNIT_WEAPONS[k].reduce((r, w) => Math.max(r, w.range), 0),
  ]),
) as Record<UnitKind, number>;

/**
 * The one held beam or charged shot a unit carries, if any — the renderer
 * draws it live off the sim's per-unit beam and charge clocks rather than
 * off the effect pool, so it needs to know which weapon that is
 */
export const UNIT_HELD: Readonly<Record<UnitKind, UnitWeapon | null>> = Object.fromEntries(
  (Object.keys(UNIT_WEAPONS) as UnitKind[]).map((k) => [
    k,
    UNIT_WEAPONS[k].find((w) => w.beam || w.charge) ?? null,
  ]),
) as Record<UnitKind, UnitWeapon | null>;

for (const [k, ws] of Object.entries(UNIT_WEAPONS)) {
  if (ws.length > MAX_WEAPONS)
    throw new Error(`${k} carries ${ws.length} weapons; MAX_WEAPONS is ${MAX_WEAPONS}`);
  if (ws.filter((w) => w.beam || w.charge).length > 1)
    throw new Error(`${k} carries two held weapons; the sim keeps one beam clock per unit`);
  for (const w of ws) {
    const flying = w.fx === "bullet" || w.fx === "missile" || w.fx === "shell" || (w.fx === "bomb" && !w.suicide);
    if (flying && !w.look) throw new Error(`${k}/${w.name} flies with no look`);
    if (w.fx === "laser" && !w.laser && !w.beam) throw new Error(`${k}/${w.name} is a laser with no style`);
    if (w.beam && !w.beamStyle) throw new Error(`${k}/${w.name} is a held beam with no style`);
    if (w.fx === "sap" && !w.sap) throw new Error(`${k}/${w.name} is a sap with no style`);
    if (w.fx === "shrapnel" && !w.shrapnel) throw new Error(`${k}/${w.name} is shrapnel with no style`);
    if (w.fx === "lightning" && !w.bolt) throw new Error(`${k}/${w.name} is lightning with no bolt`);
  }
}
