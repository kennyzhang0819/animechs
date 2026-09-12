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
  | "gun" // instant, NO round drawn: a gun splash at the muzzle and the hit
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
  /** the unit dies firing it: the splash is centred on itself. NOTHING
   *  CARRIES IT ANY MORE — the crawler's charge was the venom line's old
   *  opening tier and the rework took it off (see the crawler row below).
   *  The mechanism stays because it is one branch in updateUnitWeapons and
   *  a family built around contact is a family this game should be able to
   *  field again */
  suicide?: boolean;
  /**
   * THE ROT this weapon lays on what it hits, in RAW health a second — and
   * on everything its splash reaches, where it has splash. It is the Venom
   * spitters' family trait and nothing else in the game carries it.
   *
   * IT IS NOT A CHANCE. Every venom shot that connects poisons, every time:
   * a status that lands one time in five is a status the player cannot plan
   * around, and the whole reason the family exists is to be a problem a
   * board answers deliberately (repair, or killing them before the clock
   * runs down) rather than one it absorbs on average.
   *
   * The duration is the same for every source (constants.ts POISON_TIME) —
   * what a tier buys is RATE, REACH and RELIABILITY, not a longer clock, so
   * the family scales by landing more of the same thing rather than by
   * landing a better version of it.
   */
  poison?: number;
  /**
   * ...AND THE ODDS IT TAKES, rolled once PER STRUCTURE the shot reaches
   * (Sim.poisonTower). 1, or absent, is a tier that never misses.
   *
   * IT IS THE TIER LADDER THAT DOES NOT MOVE THE NUMBER. `rate x chance` is
   * the same expected rot as a smaller rate landing every time, so the odds
   * buy no scaling of their own — what they buy is a way to say "a toxopid
   * poisons every time and a crawler one time in four" while both still
   * read as the same status doing the same thing. A player learns one rule
   * and then learns which bodies are reliable.
   *
   * AND IT IS WHY A BURST COMES OUT SPECKLED. The roll is per structure, so
   * an arkyid's bomb rots most of a patch and not all of it — the same
   * charm the turret attributes have (mods.ts), on the other side of the
   * field. A crowd large enough averages it away, which is exactly when
   * volume is supposed to take over.
   */
  poisonChance?: number;
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
  /** rail / laser / gun: what the muzzle throws (a gun: Fx.shootSmall unless set) */
  shoot?: FxKind;
  shootLen?: number;
  /** gun: the powder behind the flash, if any (a copper round's Fx.shootSmallSmoke) */
  smoke?: FxKind;
  /** gun: the colour the splash ramps into — the round's hitColor, what
   *  Effect.at is handed for a shootEffect. Pal.lightOrange unless set */
  shootColor?: RGB;
}

/**
 * ONE DIAL OVER EVERY UNIT WEAPON, at 1: the rows below are Mindustry's
 * and the swarm bites a structure exactly as they say. The rows are meant
 * to stay Mindustry's — the balance pass is done on the player's side
 * (TOWER_HP_SCALE, the prices and the drops in economy.ts), and the
 * playtest takes this dial as --unit-damage for a sweep. For the record,
 * the headless bot on Confluence at the lowest rung, whole roster: at x1
 * its line is chewed flat by wave 11, at x0.05 by wave 22, at x0.005 by
 * wave 41, and with the dial at 0 it holds all fifty.
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

/**
 * ContinuousLaserBulletType.colors — meltdown's, style 0, REPAINTED BLUE.
 * The class's shape is untouched: a deep wash twice over at rising alpha,
 * a light one at full, and a white filament down the middle. Only the two
 * hues move — Mindustry's ec7458/ff9c5a for the blue a meltdown's own line
 * already fires in, since arc and lancer stand below it. The hull itself
 * is upstream's gunmetal again; the beam keeps the line's blue.
 *
 * 6974c4 is lancer.png's own plating shade, so the beam's base is the
 * colour of the turret throwing it; Pal.lancerLaser is what arc's bolt and
 * lancer's beam are already drawn in, and it takes the third wash.
 */
const LANCER_HULL: RGB = [0x69 / 255, 0x74 / 255, 0xc4 / 255];
export const MELTDOWN_BEAM = beamStyle({
  colors: [
    [LANCER_HULL, 0x55 / 255],
    [LANCER_HULL, 0xaa / 255],
    [PAL.lancerLaser, 1],
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
/**
 * THE VENOM ORB — the one thing the Venom spitters throw, at five sizes.
 *
 * ShotRegion "orb" is no sprite at all: the renderer fills a disc, so the
 * family's signature costs nothing in the atlas and cannot be confused with
 * any other shot in the game. It is drawn two-tone — Pal.sapBulletBack
 * outside, the bright Pal.sapBullet as a core — which is what makes a
 * purple ball read as a THING at a glance rather than as a coloured dot.
 *
 * `size` is the diameter in world units, and it is the whole tier ladder of
 * the family's look: a crawler's spit is 7 across, a toxopid's bomb 22.
 */
const venomOrb = (size: number, o: { trail?: boolean } = {}): ShotLook => ({
  region: "orb",
  width: u(size),
  height: u(size),
  shrinkX: 0,
  shrinkY: 0,
  back: PAL.sapBulletBack,
  front: PAL.sapBullet,
  shoot: FxKind.ShootSmall,
  smoke: FxKind.SmokeSmall,
  hit: FxKind.SapExplosion,
  hitColor: PAL.sapBullet,
  // the thrown bombs stream; the spits do not, or the field would be a
  // purple fog by wave thirty
  ...(o.trail
    ? {
        trail: { size: u(size * 0.35), mult: 1, color: PAL.sapBulletBack },
        // A THROWN BOMB FLIES OVER WHAT IS IN FRONT OF IT. It is the one
        // unblockable shot left in these two families — the fortress's
        // siege round was made flat and blockable in the same pass, and
        // this is the deliberate other side of that: the ground mechs are
        // answered by putting something in the way, and the venom line is
        // answered by killing it. A family that can be walled and a family
        // that cannot are two problems; two families that can both be
        // walled are one.
        collide: false as const,
      }
    : {}),
});

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

/**
 * Bullets.standardCopper: BasicBulletType(2.5, 9), lifetime 60 — THE BITE
 * ONLY. The round itself is not drawn any more: the tier-1 guns (dagger,
 * risso) fire as a "gun", an instant hit with the round's own muzzle
 * splash (Fx.shootSmall and its smoke, in the round's lightOrange) and
 * nothing crossing the field. Forty daggers' worth of yellow rounds was
 * the busiest thing on the screen in the opening waves and said nothing
 * a flash at the muzzle does not; the reload, damage and range are the
 * same numbers they were.
 */
const copper = (name: string, reload: number, mounts: number, damage = 9): UnitWeapon => ({
  name,
  reload: t(reload),
  mounts,
  damage,
  range: rng(2.5, 60),
  speed: 0,
  fx: "gun",
  shoot: FxKind.ShootSmall,
  smoke: FxKind.SmokeSmall,
  shootColor: PAL.lightOrange,
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
  //
  // ONE WEAPON CLASS ACROSS FIVE TIERS: a round that goes where it is
  // pointed. No arc, no beam, no flame. What a tier buys is CALIBRE — 18,
  // 26, 55, 70, 80 a round — which is the same thing the line's own armour
  // asks the player for, read from the other side.
  //
  // large-weapon: BasicBulletType 7x9, mirrored pair. Mindustry fires it
  // every 13 ticks for 9; this one fires every 26 for 18. HALF THE RATE AND
  // TWICE THE BITE is the same paper damage and a different weapon: a
  // slower, heavier round is one that gets through plating, and the dagger
  // is the tier a player first learns that armour is a flat shave off each
  // HIT rather than a share of the damage
  dagger: [copper("large-weapon", 26, 2, 18)],
  // THE MACE IS RANGED NOW. It used to carry Mindustry's flamethrower — 74
  // damage at four tiles, which meant the T2 of a straight-bullet family
  // had to be standing on the turret to do anything at all, and read as a
  // different family every time it arrived. It carries a short, fast
  // carbine instead: the line's quickest round, at the line's shortest
  // reach, so the mace is still the tier that wants to be close and is no
  // longer the tier that is useless until it gets there.
  //
  // THE RATE IS SET AGAINST WHAT THE FLAME WAS WORTH. Upstream's
  // flamethrower is 74 a hit every 11 ticks off a mirrored pair — some 800
  // damage a second, four times anything else the family carries, and
  // dropping that on the floor quietly took a fifth of the swarm's bite out
  // of the ground line (the headless bot lived twenty waves longer for it).
  // A 26-damage round every seven ticks off the same pair is a little over
  // half the flame's output, which is where a T2 belongs next to the
  // fortress's 55 and the scepter's 70: the calibre ladder is kept, and the
  // mace stays the family's FAST gun rather than its big one.
  mace: [
    {
      name: "mace-carbine", reload: t(7), mounts: 2, damage: 26, range: rng(4, 22), speed: spd(4), fx: "bullet",
      look: basic(8, 11, { shoot: FxKind.ShootSmall, smoke: FxKind.SmokeSmall }),
    },
  ],
  // THE FORTRESS SHOOTS FLAT AND THE SHELL EXPLODES WHERE IT LANDS. Upstream
  // this is an ArtilleryBulletType — a lobbed shell that ignores everything
  // in flight and blasts on arrival. It is a direct round here: it flies the
  // line of sight, it hits the FIRST thing it reaches, and it bursts there
  // for 80 in a 35-unit radius.
  //
  // THAT IS A REAL CHANGE AND IT IS THE POINT OF THE TIER. An arcing shell
  // cannot be blocked, so the fortress used to be the one body in the family
  // that did not care what the player built in front of it. Flat fire can
  // be blocked, which puts it back inside the rule the rest of the line
  // plays by — and makes the front rank of a patch the thing that eats the
  // splash. It keeps its upstream reach exactly (2 x 120 = 240 world units,
  // thirty tiles) — the change is the trajectory, not the distance.
  //
  // AND IT IS STILL THE SLOW ONE. Five eighths of a second off a mirrored
  // pair against the mace's fifteenth: the same 135 damage a round arriving
  // at a third of the rate, which is the tier reading as artillery without
  // being artillery
  fortress: [
    {
      name: "fortress-siege", reload: t(75), mounts: 2, damage: 55, splash: 80, splashRadius: u(35),
      range: rng(5, 48), speed: spd(5), fx: "bullet",
      look: basic(13, 17, {
        shoot: FxKind.ShootBig, smoke: FxKind.SmokeBig,
        hit: FxKind.BlastExplosion, hitColor: PAL.bulletYellowBack,
      }),
    },
  ],
  // scepter-weapon: BasicBulletType(8, 70) 11x20, shrinkX 0.4 / shrinkY 0,
  // Fx.shootBig, Fx.blastExplosion — plus two scepter-mount pairs firing a
  // 4.5x35 sliver (shrinkX 0.6, shrinkY 0, Interp.slope). Straight bullets
  // already, and left alone: the tier's contribution is the shield field it
  // walks under (levels.ts), not the gun
  scepter: [
    {
      name: "scepter-weapon", reload: t(60), mounts: 2, damage: 70, range: rng(7, 25), speed: spd(7), fx: "bullet",
      look: basic(11, 20, { shrinkX: 0.4, shrinkY: 0, shoot: FxKind.ShootBig, hit: FxKind.BlastExplosion }),
    },
    {
      name: "scepter-mount", reload: t(13), mounts: 4, damage: 20, range: rng(3, 50), speed: spd(3), fx: "bullet",
      look: basic(4.5, 35, { shrinkX: 0.6, shrinkY: 0, slope: true, hitColor: PAL.bulletYellowBack }),
    },
  ],
  // reign-weapon: BasicBulletType(13, 80) 14x33, Fx.shootBig,
  // Fx.blastExplosion. The heaviest round in the family, on the tier that
  // hands its plating to everything around it (levels.ts armorField)
  reign: [
    {
      name: "reign-weapon", reload: t(25), mounts: 2, damage: 80, range: rng(13, 24), speed: spd(13), fx: "bullet",
      look: basic(14, 33, { shoot: FxKind.ShootBig, hit: FxKind.BlastExplosion }),
    },
  ],

  // ---- the venom spitters -----------------------------------------------
  //
  // ONE LOOK AND ONE STATUS ACROSS FIVE TIERS. Every weapon on this tree
  // throws the same thing: a filled purple orb (ShotRegion "orb" — no
  // sprite, LiquidBulletType's own draw) in Pal.sap, landing POISON. The
  // line used to be four different weapon classes wearing one colour — a
  // contact bomb, slag orbs, sap beams, shrapnel rays — and read as four
  // families that happened to share a palette. It is one family now, and a
  // player who sees a purple orb in the air knows exactly what is about to
  // be wrong with the turret it lands on.
  //
  // WHAT A TIER BUYS IS RATE, REACH AND RELIABILITY — never a better
  // status. The rot is the same six seconds from the T1 and the T5
  // (constants.ts POISON_TIME); a crawler's spit is six health a second at
  // one roll in four and a toxopid's bomb is ten across a whole patch,
  // every time. That keeps the status one thing the player learns once.
  //
  // THE NUMBERS ARE SMALL BECAUSE THE CROWD IS THE SCALING. There is no
  // ceiling on the rot any more: applications add up and bleed back down
  // (POISON_DECAY), so what a turret takes is linear in how many spitters
  // are shooting it. Six a hit at one roll in four is nothing from one
  // crawler and is the board coming apart from three hundred — which is
  // the only way a status stays relevant against a late-run pool that has
  // grown by multipliers (mods.ts: Giant is +1000% health on its own).
  //
  // THE DIRECT DAMAGE IS DELIBERATELY SMALL. These bodies are light and
  // quick (levels.ts) and what they do to a board is make it rot, not
  // punch it down — a patch under venom fire loses health with nothing
  // visibly shooting it, which is the whole feel of the family.
  //
  // NO SUICIDE CHARGE. The crawler's contact bomb is gone: a status that
  // works over six seconds cannot have its opening tier delete itself on
  // arrival, because a dead spitter is one that never refreshes the clock.
  crawler: [
    {
      name: "venom-spit", reload: t(180), mounts: 1, damage: 25, range: rng(6, 16), speed: spd(6),
      fx: "bullet", poison: 6, poisonChance: 0.25, look: venomOrb(7),
    },
  ],
  // FOUR BARRELS, AND THE FIRST ORB THAT BURSTS. A mirrored bank fires once
  // per reload divided by its mount count (updateUnitWeapons), so four
  // barrels is four times the APPLICATIONS rather than four shots at once —
  // which is what an atrax is for now that the rot bleeds back down
  // (constants.ts POISON_DECAY): volume is how the family holds a ceiling.
  //
  // THE SPLASH IS SMALL ON PURPOSE — under two tiles, so it catches a
  // turret and its four neighbours and nothing more. The family's ladder
  // used to be three tiers of single-target pea-shooters and then two tiers
  // of area bombardment, a fortyfold step between the spiroct and the
  // arkyid; it reads as one idea growing now: a ball, a small burst, a
  // bigger burst, a thrown bomb, a barrage. The rot rides the burst, so
  // what a tier really buys is HOW MUCH OF A PATCH one orb rots at once.
  atrax: [
    {
      name: "venom-spit", reload: t(180), mounts: 4, damage: 8, splash: 20, splashRadius: u(10),
      range: rng(6, 18), speed: spd(6), fx: "bullet", poison: 4, poisonChance: 0.3, look: venomOrb(8),
    },
  ],
  // THE PACE TIER. Its gun is the family's standard orb at a middling rate;
  // what the spiroct is FOR is the haste field it walks under (levels.ts
  // hasteField) — a third again on everything within ten tiles. It is the
  // only tier on the tree that hands something out, and what it hands out
  // is more applications inside the same six seconds
  spiroct: [
    {
      name: "venom-spit", reload: t(120), mounts: 2, damage: 10, splash: 24, splashRadius: u(14),
      range: rng(6, 20), speed: spd(6), fx: "bullet", poison: 6, poisonChance: 0.4, look: venomOrb(10),
    },
  ],
  // TWO WEAPONS, AND THE FIRST TIME THE FAMILY REACHES PAST ONE TURRET. The
  // spit is the family's standard orb; the BOMB is a heavy orb thrown far
  // that bursts for 70 across a 60-unit radius and poisons every structure
  // inside it. A patch is four to thirty-six turrets standing in a block —
  // this is the tier that rots the block instead of the turret, and it does
  // it from a hundred units out
  arkyid: [
    {
      name: "venom-spit", reload: t(90), mounts: 4, damage: 10, range: rng(6, 20), speed: spd(6),
      fx: "bullet", poison: 3, poisonChance: 0.5, look: venomOrb(8),
    },
    {
      name: "venom-bomb", reload: t(150), mounts: 1, damage: 14, splash: 70, splashRadius: u(60),
      range: rng(4, 50), speed: spd(4), fx: "shell", poison: 8, poisonChance: 0.8,
      look: venomOrb(18, { trail: true }),
    },
  ],
  // THE BOMB, FAST. The toxopid drops the single-target spit altogether and
  // throws nothing but area rot — three mounts on a one-second cycle, each
  // one an arkyid's bomb with more reach behind it. It is the same weapon
  // the tier below introduces, arriving often enough that a patch is never
  // out from under it, which is what a T5 of this family should be: not a
  // new idea, the family's idea at a rate nothing answers casually
  toxopid: [
    {
      name: "venom-bomb", reload: t(180), mounts: 3, damage: 18, splash: 75, splashRadius: u(70),
      range: rng(4, 62), speed: spd(4), fx: "shell", poison: 10, poisonChance: 1,
      look: venomOrb(22, { trail: true }),
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
      name: "heal-shotgun-weapon", reload: t(36), mounts: 2, shots: 3, damage: 15 * 0.25, range: u(40), speed: 0,
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
      name: "horizon-bomb", reload: t(12), mounts: 2, damage: 0, splash: 25, splashRadius: u(25),
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
      name: "missiles-mount", reload: t(20), mounts: 2, damage: 18, splash: 37, splashRadius: u(20),
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
      name: "large-artillery", reload: t(65), mounts: 1, damage: 20, splash: 70, splashRadius: u(25 * 0.75),
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
  // row does not carry. Like the other tier-1 rounds it is a "gun" now:
  // the torpedo is not drawn, the hit is instant, and the mount throws
  // its own Fx.shootHeal splash in the torpedo's heal green
  retusa: [
    {
      name: "retusa-torpedo", reload: t(60), mounts: 1, damage: 22, range: u(140), speed: 0, fx: "gun",
      shoot: FxKind.ShootHeal, shootColor: PAL.heal,
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
      name: "energy-field", reload: t(65), mounts: 1, damage: 40, range: u(180), speed: 0, fx: "field",
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
