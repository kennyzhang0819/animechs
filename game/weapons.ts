import { CELL, PAL, SHRAPNEL } from "./constants";
import type { UnitKind } from "./levels";
import { FxKind, type RGB } from "./types";

/**
 * WHAT EVERY ENEMY SHOOTS — the units' weapons, in the sim's own units
 * (px, seconds), after Mindustry's UnitTypes.java where a family kept its
 * upstream guns and this game's own where it did not.
 *
 * ONE LOOK AND ONE MECHANIC A FAMILY. Every one of the six trees is
 * authored so that a shot in the air says which family fired it and what
 * it is about to do: yellow straight bullets (Ground mechs), purple orbs
 * that rot (Venom spitters), green lasers that pierce (Starlight mechs),
 * orange shotgun fans (Sky gunships), navy shells lobbed over the wall
 * (Naval tanks) and cyan arcs that short a gun (Aegis tanks). Each tree's
 * header below says what its tiers buy. The notes on THE LOOK and THE
 * BITE that follow are about the rows that are still Mindustry's.
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
  | "field" // EnergyFieldAbility: every structure in reach, at once
  | "scatter" // THE SKY'S SHOTGUN: instant, every structure in a cone off the muzzle, no round drawn
  | "arc"; // THE AEGIS ARC: instant chain lightning, the target and then its neighbours in turn

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
  /** the most structures one field pulse — or one cone — reaches (EnergyFieldAbility.maxTargets) */
  maxTargets?: number;
  /**
   * THE STARLIGHT MECHS' FAMILY TRAIT: a laser that hits EVERY structure
   * along its length rather than the one it was aimed at
   * (Sim.structuresAlong). Mindustry's LaserBulletType already draws its
   * full length through whatever it hit and only ever damaged the first
   * thing; here the drawing and the damage agree. The corridor is the
   * style's own width (LaserStyle.width, BeamStyle.width for a held beam),
   * so the corvus's 75-wide beam takes a whole patch and the nova's thin
   * one takes the row it points down. A held beam with this bites every
   * structure under it every interval.
   */
  pierce?: boolean;
  /**
   * fx "scatter": the CONE — half-angle in radians either side of the aim.
   * Every structure whose footprint edge is within `range` and inside the
   * wedge is hit for `damage`, falling to `falloff` of it at full reach;
   * `maxTargets` caps how many, nearest first. PI is a ring: the horizon's
   * blast straight down under it.
   */
  cone?: number;
  /** fx "scatter": the share of `damage` a pellet still carries at full
   *  reach (1 is no falloff at all) */
  falloff?: number;
  /**
   * fx "arc": the CHAIN. The target takes `damage`; then the bolt jumps to
   * the nearest structure within `reach` of the last one it struck that it
   * has not struck yet, `jumps` times, each hop carrying `decay` of the
   * last. A patch is a chain's whole reason to exist — one hull on a wall
   * of duos lights the wall.
   */
  arc?: { jumps: number; reach: number; decay: number; color: RGB };
  /**
   * THE SHORT — the Aegis tanks' family trait, and the first status on a
   * building after the rot: every structure this weapon connects with
   * (the target, every hop of a chain, every structure a field pulse
   * reaches) has its gun put out for this many seconds (Tower.shortT).
   *
   * IT IS A REFRESH AND NOT A STACK, and the row's reload is longer than
   * its short on every tier, so a single hull cannot hold a turret down
   * — it flickers. What holds a gun down is a crowd of them landing shorts
   * faster than the clocks run out, which is the venom line's rule read
   * for time instead of health: what a tier buys is reach and reliability,
   * and the crowd is the scaling.
   */
  short?: number;
  /** ...and the odds a connection takes, rolled PER STRUCTURE, the same
   *  ladder poisonChance is: a retusa shorts one gun in five it touches, a
   *  navanax every one */
  shortChance?: number;
  /** fx "scatter": the colour the fan is drawn in, and the sparks on what
   *  it struck. The sky's own orange unless set */
  scatterColor?: RGB;
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
/** no unit throws a sap any more (the venom rework took the spider lines
 *  off); the maker stays with the fx kind and the renderer's draw, for the
 *  day a family wants one back */
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
/** THE STARLIGHT MECHS' THIN BEAMS (weapons "nova-lance", "pulsar-fan"):
 *  quasar's palette on a line a fraction of its width, with the same
 *  45-degree flare cut down to match. Style 0 is lancer's and the two
 *  green ones above are Mindustry's own; these two are this game's, so
 *  the family's opening tiers fire the family's light */
const NOVA_LASER = laserStyle({
  colors: [[PAL.heal, 0.4], [PAL.heal, 1], [WHITE, 1]],
  width: 7,
  sideAngle: 45 * DEG,
  sideWidth: 0.7,
  sideLength: 18,
  lifetime: t(14),
});
const PULSAR_LASER = laserStyle({
  colors: [[PAL.heal, 0.4], [PAL.heal, 1], [WHITE, 1]],
  width: 5,
  sideAngle: 45 * DEG,
  sideWidth: 0.6,
  sideLength: 14,
  lifetime: t(14),
});

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
/** Pal.heal at .2, .5, x1.2 and white — vela's plasma */
const healBright: RGB = [Math.min(1, PAL.heal[0] * 1.2), 1, Math.min(1, PAL.heal[2] * 1.2)];
const VELA_BEAM = beamStyle({
  colors: [[PAL.heal, 0.2], [PAL.heal, 0.5], [healBright, 1], [WHITE, 1]],
  width: 9,
});
/** fuse's ray — style 0, the geometry constants.ts already carries */
export const FUSE_SHRAPNEL = shrapnelStyle({ ...SHRAPNEL });
/** THE NAVAL SHELL'S LANDING: blastExplosion's shape in the water's own
 *  colours — a navy wave, foam-white smoke, navy sparks — scaled to the
 *  three-tile burst the line's middle tiers throw. The fleet's every shell
 *  lands in this, so a burst on the shore reads as the sea's from across
 *  the field */
const NAVAL_EXPLOSION = explosionStyle({
  lifetime: t(26),
  waveColor: PAL.navalBack,
  waveLife: 8,
  waveStroke: 4,
  waveRad: 26,
  waveRadBase: 4,
  smokeColor: PAL.navalFront,
  smokes: 6,
  smokeSize: 3.5,
  smokeSizeBase: 0.4,
  smokeRad: 22,
  sparkColor: PAL.navalBack,
  sparks: 7,
  sparkStroke: 1.5,
  sparkRad: 30,
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

/**
 * THE NAVAL SHELL — the one thing the Naval tanks throw, at five sizes.
 *
 * ArtilleryBulletType's own "shell" sprite and slope shrink, in the
 * water's navy with a foam-white face (PAL.navalBack / navalFront) and a
 * navy trail behind it, landing in NAVAL_EXPLOSION. `collide: false` is
 * the family's whole trajectory: a lobbed shell flies over whatever is in
 * front of it and bursts where it was aimed — the fortress gave that up
 * (a flat, blockable siege round) so that exactly one family would keep
 * it, and this is the family. `size` is the sprite's box in world units,
 * and the family's ladder of look: a risso's mortar round is 8, an
 * omura's siege shell 22.
 */
const navalShell = (size: number, o: Partial<ShotLook> = {}): ShotLook => ({
  region: "shell",
  width: u(size),
  height: u(size),
  shrinkX: 0.15,
  shrinkY: 0.5,
  slope: true,
  back: PAL.navalBack,
  front: PAL.navalFront,
  shoot: FxKind.ShootBig,
  smoke: FxKind.SmokeSmall,
  hit: FxKind.Explosion,
  hitStyle: NAVAL_EXPLOSION.id,
  hitColor: PAL.navalBack,
  trail: { size: u(Math.max(3, size * 0.3)), mult: 1, color: PAL.navalBack },
  collide: false,
  ...o,
});

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

  // ---- THE STARLIGHT MECHS --------------------------------------------
  //
  // ONE LIGHT ACROSS FIVE TIERS: every weapon on this tree is a GREEN LASER
  // (Pal.heal), instant, and every one of them PIERCES — it hits every
  // structure along its length rather than the one it was pointed at
  // (UnitWeapon.pierce, Sim.structuresAlong). Nothing flies. The line used
  // to open with a bolt that flew and a shotgun of lightning, and only from
  // the T3 up was it the laser family it is named for; it is that family
  // from the first body now, and a player who sees a green line across a
  // patch knows every turret on that line just paid for it.
  //
  // WHAT A TIER BUYS IS LENGTH AND WIDTH. A nova's lance is a thin line
  // seven tiles long that takes the row it points down; a corvus's is a
  // fifty-seven-tile beam nine cells wide that takes the patch. The
  // damage ladder is Mindustry's own where it had one — quasar 45, vela 35
  // a bite, corvus 560 — and the two new guns at the bottom are set so the
  // line's T1 and T2 bite a single turret about as hard as the bolt and the
  // arcs they replace did, and a row of them harder.
  //
  // THE OTHER HALF OF THE FAMILY IS IN levels.ts: every tier heals or
  // shields the crowd around it, and the T4 and T5 do both at once. The
  // lasers are what it does to the board; the fields are what it does for
  // the swarm, and a Starlight wave is answered by killing the carriers
  // before the wall of green reaches the guns.
  //
  // nova-lance: a thin heal-green beam, nineteen tiles — the bolt's own
  // reach (5.2 x 30) — on a mirrored pair. Replaces the
  // LaserBoltBulletType(5.2, 13) that flew, on the same 30-tick cycle
  // upstream gives the heal-weapon: a beam that lands the moment it fires
  // and keeps going
  nova: [
    {
      name: "nova-lance", reload: t(30), mounts: 2, damage: 14, range: u(150), speed: 0, fx: "laser",
      pierce: true, laser: NOVA_LASER, shoot: FxKind.ShootHeal,
    },
  ],
  // pulsar-fan: THREE thin beams a volley, twelve degrees apart, each its
  // own piercing line. Replaces the heal-shotgun-weapon's three lightning
  // bolts (buildingDamage 0.25 — under four a bolt) with three lasers that
  // do seven each and go through; the fan is the shotgun read as light
  pulsar: [
    {
      name: "pulsar-fan", reload: t(36), mounts: 2, shots: 3, spread: 12 * DEG, damage: 8, range: u(90), speed: 0,
      fx: "laser", pierce: true, laser: PULSAR_LASER, shoot: FxKind.ShootHeal,
    },
  ],
  // beam-weapon: reload 55, LaserBulletType damage 45 in Pal.heal, length
  // 150 (row 135), sideAngle 45 / sideWidth 1 / sideLength 70 — the one
  // tier that was already a laser, and pierces now like the rest
  quasar: [
    {
      name: "beam-weapon", reload: t(55), mounts: 2, damage: 45, range: u(135), speed: 0, fx: "laser",
      pierce: true, laser: QUASAR_LASER, shoot: FxKind.HitLancer,
    },
  ],
  // vela-weapon: ContinuousLaserBulletType(35) length 180, lifetime 160,
  // reload 155 with a 40-tick charge (Fx.greenLaserChargeSmall) — the four
  // heal washes, Fx.hitMeltHeal where it rests. A held beam that pierces
  // bites everything under it every five ticks for as long as it burns
  vela: [
    {
      name: "vela-weapon", reload: t(155 + 40), mounts: 1, damage: 35, range: u(180), speed: 0, fx: "laser",
      pierce: true, beam: { duration: t(160), interval: t(5) }, charge: t(40), beamStyle: VELA_BEAM,
    },
  ],
  // corvus-weapon: reload 350 with an 80-tick charge (Fx.greenLaserCharge),
  // LaserBulletType damage 560, length 460, width 75, 65 ticks on screen.
  // THE LONG LASER: fifty-seven tiles, nine cells wide, and every
  // structure inside that corridor takes the 560 — a T5 that answers a
  // patch by drawing a line through it
  corvus: [
    {
      name: "corvus-weapon", reload: t(350 + 80), mounts: 1, damage: 560, range: u(460), speed: 0, fx: "laser",
      pierce: true, laser: CORVUS_LASER, charge: t(80), shoot: FxKind.HitLancer,
    },
  ],

  // ---- THE SKY GUNSHIPS -----------------------------------------------
  //
  // ONE BLAST ACROSS FIVE TIERS, AND NOTHING IN THE AIR BUT THE SHIPS. Every
  // weapon on this tree is a SHOTGUN (fx "scatter"): an instant cone off
  // the muzzle in which every structure takes a pellet's worth, less the
  // further out it stands, nearest first up to a cap. No round crosses the
  // field — what is drawn is the fan of hot streaks leaving the ship
  // (FxKind.Scatter), white into Pal.unitFront's orange, and the sparks on
  // what it struck. The line used to fire five different things — copper
  // rounds, dropped bombs, missiles, a cannon, a laser and flak — and read
  // as five families that happened to fly. It is one family now.
  //
  // THE FAMILY'S TWO IDEAS ARE FLYING AND SPEED. Flying it always had: it
  // ignores the route and the walls and sees its whole radius. Speed it
  // used to throw away — the T5 flew at a fifth of the T1's pace and
  // crossed a field of scatter at walking speed — and it keeps now
  // (levels.ts): every tier is quicker than any walker, so what a gunship
  // wave asks the board for is GUNS THAT REACH THE SKY AND ANSWER FAST,
  // because the flight will be over the line before a slow gun has turned.
  // A shotgun is the weapon of a body that arrives before it is answered:
  // short, wide, and spent on whatever it is over.
  //
  // WHAT A TIER BUYS IS WIDTH AND WEIGHT. A flare's fan is eighteen degrees
  // and touches three things for nine each; an eclipse's broadside is
  // twenty-nine tiles long and takes six for a hundred and twenty. The
  // horizon's is the odd one — a full circle, straight down, the family's
  // blast under the ship where its bombs used to fall.
  //
  // THE REACH IS THE OLD GUNS' REACH: a fan runs as far as the round it
  // replaced flew (a flare's copper 14 tiles, a zenith's missiles 19, the
  // eclipse's laser 29). The first cut of this family was a five-tile
  // shotgun on every tier and the flight died in the flak before it fired
  // — reach is what a fast body converts into time over the target, and a
  // shotgun with none is a body with none. The rates are set against what
  // the old guns did to ONE turret: a flare bites a duo as its copper pair
  // did, an antumbra rather less than its 55-a-round cannon on a
  // seven-tick reload (the heaviest single-target gun on the roster, on a
  // flyer) and an eclipse about what its laser and flak did together; the
  // family's real damage lives in the spread on top of that.
  flare: [
    {
      name: "flare-scatter", reload: t(20), mounts: 2, damage: 9, range: u(110), speed: 0, fx: "scatter",
      cone: 18 * DEG, falloff: 0.5, maxTargets: 3, shoot: FxKind.ShootSmall,
    },
  ],
  // THE BLAST UNDER THE SHIP: a full-circle scatter at under four tiles,
  // where the horizon used to drop bombs. It is the family's area tier,
  // and its pellets go every way at once, so a horizon over a patch is a
  // horizon on all of it
  horizon: [
    {
      name: "horizon-blast", reload: t(24), mounts: 1, damage: 60, range: u(36), speed: 0, fx: "scatter",
      cone: Math.PI, falloff: 0.6, maxTargets: 6,
    },
  ],
  // the zenith's two missile racks, as two fans: a wider cone than the
  // flare's, twice the reach, four things a shot. The tier also carries
  // the flight's shield (levels.ts shieldField)
  zenith: [
    {
      name: "zenith-scatter", reload: t(30), mounts: 2, damage: 30, range: u(150), speed: 0, fx: "scatter",
      cone: 22 * DEG, falloff: 0.5, maxTargets: 4, shoot: FxKind.ShootBig,
    },
  ],
  // the antumbra's whole battery as one heavy fan on a mirrored pair. The
  // tier's real contribution is the jam it carries (levels.ts jamField):
  // it hangs over the line and the line reloads at half pace under it
  antumbra: [
    {
      name: "antumbra-scatter", reload: t(20), mounts: 2, damage: 80, range: u(170), speed: 0, fx: "scatter",
      cone: 25 * DEG, falloff: 0.5, maxTargets: 5, shoot: FxKind.ShootBig,
    },
  ],
  // THE BROADSIDE: the family's long gun — a hundred units, a narrow cone,
  // six things for ninety — where the large-laser-mount pair used to be;
  // and four flak fans off the wings, wide and fast, where the artillery
  // was. A T5 that fills the sky over a patch and fills the patch
  eclipse: [
    {
      name: "eclipse-broadside", reload: t(40), mounts: 2, damage: 120, range: u(230), speed: 0, fx: "scatter",
      cone: 15 * DEG, falloff: 0.6, maxTargets: 6, shoot: FxKind.Shockwave, shootLen: u(28),
    },
    {
      name: "eclipse-flak", reload: t(12), mounts: 4, damage: 18, range: u(150), speed: 0, fx: "scatter",
      cone: 30 * DEG, falloff: 0.5, maxTargets: 4,
    },
  ],
  // disrupt-weapon: three disrupt-missile UNITS a volley (shoot.shots 3,
  // inaccuracy 28), each its own sprite with a sapBulletBack engine, going
  // off as ExplosionBulletType(140, 25) in Pal.sap x 1.8 and Pal.suppress,
  // Fx.sparkShoot + shootSmokeTitan off the rail. upstream: speed 4.6,
  // splash 140 in 25. THE BOSS IS IN NO FAMILY and keeps its missiles
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

  // ---- THE NAVAL TANKS ------------------------------------------------
  //
  // ONE SHELL ACROSS FIVE TIERS: every weapon on this tree LOBS an
  // artillery round (fx "shell") in the water's own navy with a foam-white
  // face (navalShell), that flies OVER whatever is in front of it and
  // bursts where it was aimed. The line used to carry copper rounds, flak,
  // missiles, artillery and a railgun; it is the ARTILLERY family now, the
  // one line on the roster whose every shot arcs, which the fortress gave
  // up in the ground rework so that exactly one family would keep it.
  //
  // WHAT IT POSES: bombardment from the water. The hulls are quick afloat
  // (constants.ts NAVAL_WATER_SPEED — half again their stat) and slow
  // ashore, so a channel that points at the core is a road the fleet
  // comes up fast and shells the shore from, over the wall a player put
  // there. The answer is not a wall — a shell ignores one — it is
  // contesting the water: guns whose reach covers the channel, and the
  // hulls dead before the big shells arrive.
  //
  // WHAT A TIER BUYS IS THE BURST. A risso's mortar lands on one turret
  // and clips the four touching it, for twelve, at nineteen tiles; a
  // minke's burst is a tile and a quarter and takes the eight round it; a
  // bryde's is three tiles; an omura's siege shell is five hundred over
  // four and a half tiles at FIFTY, the longest reach any body on the
  // roster has. The bryde's shield and the sei's bow wave (levels.ts) are
  // what the fleet does for itself.
  //
  // THE AREA IS METERED ON THE MASS TIERS, and the meter was set by
  // playtest (seed 7, world 1, the fleet alone). The script sends its T1
  // by the thousand — wave 15 is two thousand of them — so a burst on the
  // risso is a burst two thousand times over: a tile-and-a-half one on a
  // lobbed, unblockable, nineteen-tile round on a hull half again as quick
  // afloat took the bot's board apart by wave eighteen, where the old
  // copper-and-missiles risso took until forty-two; a burst under half a
  // tile and the bot won with the core untouched. The four-neighbour clip
  // is the line between those two. Against ONE turret each tier bites
  // near its old row, less on the T1, since its round now flies over the
  // wall.
  risso: [
    {
      name: "risso-mortar", reload: t(40), mounts: 2, damage: 16, splash: 12, splashRadius: u(7),
      range: rng(2.5, 60), speed: spd(2.5), fx: "shell", look: navalShell(8),
    },
  ],
  // twin mortars, two shells a volley: the tier that puts more of the
  // family's one idea in the air at once
  minke: [
    {
      name: "minke-mortar", reload: t(40), mounts: 2, shots: 2, damage: 16, splash: 24, splashRadius: u(10),
      range: rng(3, 55), speed: spd(3), fx: "shell", look: navalShell(10),
    },
  ],
  // large-artillery, as upstream has it: ArtilleryBulletType(3.2, 15)
  // 15x15.5, Fx.massiveExplosion — repainted navy. THIRTY TILES, the
  // fortress's old reach, and the first tier that outranges most of a
  // board. The tier also carries the fleet's shield (levels.ts)
  bryde: [
    {
      name: "bryde-artillery", reload: t(50), mounts: 1, damage: 40, splash: 100, splashRadius: u(24),
      range: rng(3, 80), speed: spd(3), fx: "shell",
      look: navalShell(15, { height: u(15.5), shoot: FxKind.ShootBig2 }),
    },
  ],
  // THE BARRAGE: the sei-launcher's six a volley, as six shells. upstream
  // fires them as missiles for 42 + 45 in 35; these burst for 20 + 40
  // over three tiles each, which across six is the family's area tier
  sei: [
    {
      name: "sei-barrage", reload: t(45), mounts: 1, shots: 6, damage: 24, splash: 48, splashRadius: u(24),
      range: rng(4.2, 55), speed: spd(4.2), fx: "shell", look: navalShell(9),
    },
  ],
  // THE SIEGE SHELL: fifty tiles, five hundred over a five-tile burst,
  // once every two seconds — the omura's
  // railgun read as artillery. The rail punched one thing for 1250 down a
  // line; this drops on a patch from further away than any gun on the
  // board reaches back. And a pair of the T1's mortars off the deck, so
  // the hull is never idle between shells
  omura: [
    {
      name: "omura-siege", reload: t(120), mounts: 1, damage: 400, splash: 500, splashRadius: u(36),
      range: rng(4, 100), speed: spd(4), fx: "shell",
      look: navalShell(22, { shoot: FxKind.ShootBig2, smoke: FxKind.SmokeBig2 }),
    },
    {
      name: "omura-mortar", reload: t(40), mounts: 2, damage: 16, splash: 30, splashRadius: u(7),
      range: rng(3, 55), speed: spd(3), fx: "shell", look: navalShell(10),
    },
  ],

  // ---- THE AEGIS TANKS ------------------------------------------------
  //
  // ONE ARC ACROSS FIVE TIERS: every weapon on this tree is CHAIN LIGHTNING
  // (fx "arc") in an electric cyan (PAL.emp) — instant, the target first
  // and then the nearest structure the last one struck can reach, hop
  // after hop, each carrying a share of the last — and every structure it
  // connects with rolls a SHORT (UnitWeapon.short, Tower.shortT): its gun
  // is out for a moment. The line used to be a torpedo, a plasma flame,
  // plasma missiles, a heal field and an EMP cannon, all in the support
  // line's green; it is the EMP family now, in a colour nothing else wears.
  //
  // WHAT IT POSES: a board that goes quiet. Rot takes a turret's health
  // and ignores plating; a short takes its TIME and ignores everything —
  // a shorted spectre is a spectre that is not shooting, whatever its
  // pool or its plating. And it is the venom rule read for time: the
  // short is a refresh, not a stack, and every tier's reload is longer
  // than its short, so one hull flickers a gun and a crowd of them holds
  // it down. What a tier buys is reach, hops and reliability — a retusa
  // shorts one gun in eight it touches for half a second, a navanax one in
  // two for a full second, seven guns at a time.
  //
  // THE BITE SITS BETWEEN THE STARLIGHT LINE'S AND THE GROUND LINE'S, tier
  // for tier, before the hops: a family whose trick is taking a gun's TIME
  // still has to be worth shooting when the gun is up, or it is a slot the
  // die spends on nothing — which is what put it on the shelf before.
  //
  // THE AEGIS ITSELF is in levels.ts: the T2 and the T5 stand inside FORCE
  // FIELDS that eat the player's shots outright, and the T4 heals the
  // fleet by a share of its health. A family named for a shield carries
  // the game's biggest ones, and the arcs are what it does from behind
  // them.
  //
  // THE CHAIN'S REACH is a patch neighbour — three to four tiles — so an
  // arc on a lone duo is one hit and an arc on a wall of them is the wall.
  retusa: [
    {
      name: "retusa-arc", reload: t(40), mounts: 2, damage: 20, range: u(110), speed: 0, fx: "arc",
      arc: { jumps: 1, reach: u(28), decay: 0.7, color: PAL.emp }, short: 0.6, shortChance: 0.12,
    },
  ],
  // the plasma-mount-weapon's five-tick reload, as a fast short arc: the
  // family's volume tier, and the first that stands inside a bubble
  oxynoe: [
    {
      name: "oxynoe-arc", reload: t(12), mounts: 2, damage: 12, range: u(60), speed: 0, fx: "arc",
      arc: { jumps: 2, reach: u(24), decay: 0.6, color: PAL.emp }, short: 0.4, shortChance: 0.06,
    },
  ],
  // the family's chain tier: four hops, so one cyerce on the corner of a
  // patch lights five of it
  cyerce: [
    {
      name: "cyerce-arc", reload: t(50), mounts: 2, damage: 60, range: u(140), speed: 0, fx: "arc",
      arc: { jumps: 4, reach: u(30), decay: 0.75, color: PAL.emp }, short: 0.7, shortChance: 0.15,
    },
  ],
  // EnergyFieldAbility(40, 65, 180): 80 (upstream 40) to everything in 180
  // — twenty-two tiles — every 65 ticks, a Fx.chainLightning to each, in the
  // family's cyan and with a SHORT rolled on every one of them. The
  // family's area tier and its healer at once (levels.ts energyField)
  aegires: [
    {
      name: "energy-field", reload: t(65), mounts: 1, damage: 80, range: u(180), speed: 0, fx: "field",
      maxTargets: 25, fieldColor: PAL.emp, short: 1, shortChance: 0.35,
    },
  ],
  // THE EMP CANNON as the family's long arc: thirty-two tiles, six hops,
  // a one-second short on every other thing it touches — upstream's
  // EmpBulletType (damage 110, splash 110 in 100) read as a chain instead
  // of a burst. The tier stands inside the biggest bubble in the game
  navanax: [
    {
      name: "navanax-emp", reload: t(120), mounts: 2, damage: 300, range: u(260), speed: 0, fx: "arc",
      arc: { jumps: 6, reach: u(36), decay: 0.8, color: PAL.emp }, short: 1, shortChance: 0.5,
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
    if (w.fx === "scatter" && w.cone === undefined) throw new Error(`${k}/${w.name} is a scatter with no cone`);
    if (w.fx === "arc" && !w.arc) throw new Error(`${k}/${w.name} is an arc with no chain`);
    if (w.pierce && w.fx !== "laser") throw new Error(`${k}/${w.name} pierces but is not a laser`);
  }
}
