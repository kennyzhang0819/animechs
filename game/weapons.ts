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
 * a body that is a bomb (Skyfall bombers), teal harpoon rails from
 * beyond the board's reach (Harpoon fleet), violet arcs that short a gun
 * off a hull that blinks and cloaks (Wraith fleet) — and, on the seventh
 * tree, NOTHING IN THE AIR AT ALL: the Tuskers carry no gun and maul the
 * turret they are standing on (fx "melee"). Each tree's
 * header below says what its tiers buy. The notes on THE LOOK and THE
 * BITE that follow are about the rows that are still Mindustry's.
 *
 * THE RTS TURN, second half: every unit attack-moves. It walks the field
 * toward the base as it always did, and whatever structure comes within
 * a weapon's reach on the way is shot (Sim.updateUnitWeapons) — the
 * turret on the corner of the lane, the wall of tackers across it, the
 * repeater it is walking into. A structure in the swarm's PATH is now a
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
 *     under entities/bullet, 1:1. An ironhide1's round is bulletYellow, not
 *     copper: units fire BasicBulletType's own defaults, and only turret
 *     ammo recolours them. A weaver4's shell is 19 units of sapBullet
 *     purple; a starhart3's beam is Pal.heal with a 45-degree side stoop1;
 *     the skate5's rail is orangeSpark. These are the game's own art and
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
  | "rail" // instant, very long, the skate5's railgun
  | "field" // EnergyFieldAbility: every structure in reach, at once
  | "scatter" // THE SKY'S SHOTGUN: instant, every structure in a cone off the muzzle, no round drawn
  | "arc" // THE AEGIS ARC: instant chain lightning, the target and then its neighbours in turn
  | "melee"; // THE TUSKS: instant, at arm's length, and what it draws is on the BUILDING

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
  | "boss-missile"
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
 * runts off the muzzle. Style 0 is piercer's — the turret's beam and the
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
 * beam. Style 0 is furnace's (the class default), read by the turret.
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
   * reload runs. Starhart4 and starhart5-class weapons.
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
   *  CARRIES IT ANY MORE — the weaver1's charge was the venom line's old
   *  opening tier and the rework took it off (see the weaver1 row below).
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
   * buy no scaling of their own — what they buy is a way to say "a weaver5
   * poisons every time and a weaver1 one time in four" while both still
   * read as the same status doing the same thing. A player learns one rule
   * and then learns which bodies are reliable.
   *
   * AND IT IS WHY A BURST COMES OUT SPECKLED. The roll is per structure, so
   * a weaver4's bomb rots most of a patch and not all of it — the same
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
   * so the starhart5's 75-wide beam takes a whole patch and the starhart1's thin
   * one takes the row it points down. A held beam with this bites every
   * structure under it every interval.
   */
  pierce?: boolean;
  /**
   * fx "scatter": the CONE — half-angle in radians either side of the aim.
   * Every structure whose footprint edge is within `range` and inside the
   * wedge is hit for `damage`, falling to `falloff` of it at full reach;
   * `maxTargets` caps how many, nearest first. PI is a ring: the stoop2's
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
   * of tackers lights the wall.
   */
  arc?: { jumps: number; reach: number; decay: number; color: RGB };
  /**
   * THE SHORT — the Wraith fleet's attack, and the first status on a
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
   *  ladder poisonChance is: a livewire1 shorts one gun in five it touches, a
   *  livewire5 every one */
  shortChance?: number;
  /**
   * THE REND — the Tuskers' bite, and the other half of what fx "melee"
   * means: on top of `damage`, every blow that connects takes this SHARE
   * OF THE STRUCTURE'S OWN MAX HEALTH (Tower.hpMax, Sim.hitStructure). 0.01
   * is one per cent a blow.
   *
   * IT IS THE ONE THING ON THE FIELD THAT DOES NOT CARE HOW BIG YOU BUILT
   * IT. Every other number the swarm throws is flat, and a turret's pool
   * is not: Giant and Bulwark (mods.ts) put a late-run gun past a quarter
   * of a million health, which is minutes of the venom line's rot and
   * tens of seconds of anything else. A share of the pool is the same
   * number of SECONDS against a tacker and against that, so the answer to a
   * Tusker is never "a bigger turret" — it is not letting one arrive.
   *
   * NEVER ON THE CORE, which has no gun to lose and is the run's whole
   * stake: a percentage bite on a pool that size would make the last
   * stand a formality rather than a fight. The core takes the flat
   * `damage` like everything else does.
   *
   * IT RIDES THE DAMAGE DIAL (unitDamageScale) with the rest of the blow,
   * because unlike the rot it IS damage — it is one hit with two terms,
   * not a status — and a balance sweep that moved one and not the other
   * would be tuning the family twice.
   */
  rend?: number;
  /** fx "scatter": the colour the fan is drawn in, and the sparks on what
   *  it struck. The sky's own orange unless set */
  scatterColor?: RGB;
  /** fx "rail": the colour of the muzzle wings, the blades down the line
   *  and the spikes off what it struck. Pal.orangeSpark unless set */
  railColor?: RGB;
  // ---- THE LOOK, per fx kind ------------------------------------------
  /** bullet / missile / shell / bomb: the sprite in flight */
  look?: ShotLook;
  /** laser: LaserBulletType's palette and runts */
  laser?: LaserStyle;
  /** laser with `beam`: the held beam's washes */
  beamStyle?: BeamStyle;
  sap?: SapStyle;
  shrapnel?: ShrapnelStyle;
  /** lightning: Lightning.create's colour and node count (length + rand) */
  bolt?: { color: RGB; length: number; lengthRand: number; inaccuracy: number };
  /** flame: false is Fx.shootSmallFlame (ironhide2), true the plasma variant
   *  (livewire2: white through Pal.heal to grey, and Fx.hitFlamePlasma) */
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

/** LaserBulletType's own defaults — piercer's beam, style 0 */
export const PIERCER_LASER = laserStyle({
  colors: [[PAL.piercerLaser, 0.4], [PAL.piercerLaser, 1], [WHITE, 1]],
  width: 15,
  sideAngle: 90 * DEG,
  sideWidth: 0.7,
  sideLength: 29,
  lifetime: t(16),
});
/** starhart3's beam-weapon: the family's star-gold, a wide 45-degree side stoop1 */
const STARHART3_LASER = laserStyle({
  colors: [[PAL.starDark, 0.4], [PAL.star, 1], [WHITE, 1]],
  width: 9,
  sideAngle: 45 * DEG,
  sideWidth: 0.8,
  sideLength: 30,
  lifetime: t(16),
});
/** starhart5-weapon: the same gold, 75 wide, no side stoop1, 65 ticks */
const STARHART5_LASER = laserStyle({
  colors: [[PAL.starDark, 0.4], [PAL.star, 1], [WHITE, 1]],
  width: 75,
  sideAngle: 15 * DEG,
  sideWidth: 0,
  sideLength: 0,
  lifetime: t(65),
});
/** THE STARLIGHT MECHS' THIN BEAMS (weapons "starhart1-lance", "starhart2-fan"):
 *  starhart3's palette on a line a fraction of its width, with the same
 *  45-degree stoop1 cut down to match. Style 0 is piercer's and the two
 *  green ones above are Mindustry's own; these two are this game's, so
 *  the family's opening tiers fire the family's light */
const STARHART1_LASER = laserStyle({
  colors: [[PAL.starDark, 0.4], [PAL.star, 1], [WHITE, 1]],
  width: 4,
  sideAngle: 45 * DEG,
  sideWidth: 0.5,
  sideLength: 6,
  lifetime: t(12),
});
const STARHART2_LASER = laserStyle({
  colors: [[PAL.starDark, 0.4], [PAL.star, 1], [WHITE, 1]],
  width: 3,
  sideAngle: 45 * DEG,
  sideWidth: 0.4,
  sideLength: 5,
  lifetime: t(12),
});

/**
 * ContinuousLaserBulletType.colors — furnace's, style 0, REPAINTED BLUE.
 * The class's shape is untouched: a deep wash twice over at rising alpha,
 * a light one at full, and a white filament down the middle. Only the two
 * hues move — Mindustry's ec7458/ff9c5a for the blue a furnace's own line
 * already fires in, since coil and piercer stand below it. The hull itself
 * is upstream's gunmetal again; the beam keeps the line's blue.
 *
 * 6974c4 is piercer.png's own plating shade, so the beam's base is the
 * colour of the turret throwing it; Pal.piercerLaser is what coil's bolt and
 * piercer's beam are already drawn in, and it takes the third wash.
 */
const PIERCER_HULL: RGB = [0x69 / 255, 0x74 / 255, 0xc4 / 255];
export const FURNACE_BEAM = beamStyle({
  colors: [
    [PIERCER_HULL, 0x55 / 255],
    [PIERCER_HULL, 0xaa / 255],
    [PAL.piercerLaser, 1],
    [WHITE, 1],
  ],
  width: 9,
});
/** the star-gold at .2, .5, then the bright face and white — starhart4's beam,
 *  the four washes of ContinuousLaserBulletType in the family's hue */
const STARHART4_BEAM = beamStyle({
  colors: [[PAL.starDark, 0.2], [PAL.starDark, 0.5], [PAL.star, 1], [WHITE, 1]],
  width: 9,
});
/** cleaver's ray — style 0, the geometry constants.ts already carries */
export const CLEAVER_SHRAPNEL = shrapnelStyle({ ...SHRAPNEL });
/** the boss missile's shootOnDeath burst: Pal.sap x 1.8 wave, suppress smoke and sparks */
const sapBright: RGB = [Math.min(1, PAL.sap[0] * 1.8), Math.min(1, PAL.sap[1] * 1.8), Math.min(1, PAL.sap[2] * 1.8)];
const BOSS_EXPLOSION = explosionStyle({
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
  back: PAL.mechDark,
  front: PAL.mech,
  shoot: FxKind.ShootSmall,
  smoke: FxKind.SmokeSmall,
  hit: FxKind.BulletHit,
  hitColor: PAL.mech,
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
 * the family's look: a weaver1's spit is 7 across, a weaver5's bomb 22.
 */
const venomOrb = (size: number, o: { trail?: boolean } = {}): ShotLook => ({
  region: "orb",
  width: u(size),
  height: u(size),
  shrinkX: 0,
  shrinkY: 0,
  back: PAL.venomDark,
  front: PAL.venom,
  shoot: FxKind.ShootSmall,
  smoke: FxKind.SmokeSmall,
  hit: FxKind.SapExplosion,
  hitColor: PAL.venom,
  // the thrown bombs stream; the spits do not, or the field would be a
  // purple fog by wave thirty
  ...(o.trail
    ? {
        trail: { size: u(size * 0.35), mult: 1, color: PAL.venomDark },
        // A THROWN BOMB FLIES OVER WHAT IS IN FRONT OF IT. It is the one
        // unblockable shot left in these two families — the ironhide3's
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
 * Bullets.standardCopper: BasicBulletType(2.5, 9), lifetime 60 — THE BITE
 * ONLY. The round itself is not drawn any more: the tier-1 guns (ironhide1,
 * skate1) fire as a "gun", an instant hit with the round's own muzzle
 * splash (Fx.shootSmall and its smoke, in the round's lightOrange) and
 * nothing crossing the field. Forty runts' worth of yellow rounds was
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
  shootColor: PAL.mech,
});

/**
 * THE SKYFALL BOMBERS' CHARGES (levels.ts UnitStats.payload), drawn by the
 * sim when a bomber goes off: the bomblets a stoop4 scatters — small
 * shells in the sky's orange, fused, bursting where they stop — and the
 * stoop5's armed nuke, a fat orange orb sitting where the hull fell
 * until its fuse runs out. Both are BombBulletType's shape: dropped, not
 * fired, collides = false.
 */
export const BOMBLET_LOOK: ShotLook = {
  region: "shell",
  width: u(8),
  height: u(11),
  shrinkX: 0,
  shrinkY: 0.6,
  back: PAL.bomberDark,
  front: PAL.bomber,
  shoot: FxKind.ShootSmall,
  hit: FxKind.BlastExplosion,
  hitColor: PAL.bomber,
  puff: { chance: 0.3, size: u(2), color: PAL.bomberDark },
  collide: false,
};
export const NUKE_LOOK: ShotLook = {
  region: "circle-bullet",
  width: u(26),
  height: u(26),
  shrinkX: -0.4,
  shrinkY: -0.4,
  back: PAL.bomberDark,
  front: PAL.white,
  shoot: FxKind.ShootBig,
  hit: FxKind.NukeBurst,
  hitColor: PAL.bomber,
  collide: false,
};

export const UNIT_WEAPONS: Record<UnitKind, readonly UnitWeapon[]> = {
  // ---- the ironhide1 line --------------------------------------------------
  //
  // ONE WEAPON CLASS ACROSS FIVE TIERS: a round that goes where it is
  // pointed. No arc, no beam, no flame. What a tier buys is CALIBRE — 18,
  // 26, 55, 70, 80 a round — which is the same thing the line's own armour
  // asks the player for, read from the other side.
  //
  // large-weapon: BasicBulletType 7x9, mirrored pair. Mindustry fires it
  // every 13 ticks for 9; this one fires every 26 for 18. HALF THE RATE AND
  // TWICE THE BITE is the same paper damage and a different weapon: a
  // slower, heavier round is one that gets through plating, and the ironhide1
  // is the tier a player first learns that armour is a flat shave off each
  // HIT rather than a share of the damage
  ironhide1: [copper("large-weapon", 26, 2, 18)],
  // THE IRONHIDE2 IS RANGED NOW. It used to carry Mindustry's flamethrower — 74
  // damage at four tiles, which meant the T2 of a straight-bullet family
  // had to be standing on the turret to do anything at all, and read as a
  // different family every time it arrived. It carries a short, fast
  // carbine instead: the line's quickest round, at the line's shortest
  // reach, so the ironhide2 is still the tier that wants to be close and is no
  // longer the tier that is useless until it gets there.
  //
  // THE RATE IS SET AGAINST WHAT THE FLAME WAS WORTH. Upstream's
  // flamethrower is 74 a hit every 11 ticks off a mirrored pair — some 800
  // damage a second, four times anything else the family carries, and
  // dropping that on the floor quietly took a fifth of the swarm's bite out
  // of the ground line (the headless bot lived twenty waves longer for it).
  // A 26-damage round every seven ticks off the same pair is a little over
  // half the flame's output, which is where a T2 belongs next to the
  // ironhide3's 55 and the ironhide4's 70: the calibre ladder is kept, and the
  // ironhide2 stays the family's FAST gun rather than its big one.
  ironhide2: [
    {
      name: "ironhide2-carbine", reload: t(7), mounts: 2, damage: 26, range: rng(4, 22), speed: spd(4), fx: "bullet",
      look: basic(6, 9, { shoot: FxKind.ShootSmall, smoke: FxKind.SmokeSmall }),
    },
  ],
  // THE IRONHIDE3 SHOOTS FLAT AND THE SHELL EXPLODES WHERE IT LANDS. Upstream
  // this is an ArtilleryBulletType — a lobbed shell that ignores everything
  // in flight and blasts on arrival. It is a direct round here: it flies the
  // line of sight, it hits the FIRST thing it reaches, and it bursts there
  // for 80 in a 35-unit radius.
  //
  // THAT IS A REAL CHANGE AND IT IS THE POINT OF THE TIER. An arcing shell
  // cannot be blocked, so the ironhide3 used to be the one body in the family
  // that did not care what the player built in front of it. Flat fire can
  // be blocked, which puts it back inside the rule the rest of the line
  // plays by — and makes the front rank of a patch the thing that eats the
  // splash. It keeps its upstream reach exactly (2 x 120 = 240 world units,
  // thirty tiles) — the change is the trajectory, not the distance.
  //
  // AND IT IS STILL THE SLOW ONE. Five eighths of a second off a mirrored
  // pair against the ironhide2's fifteenth: the same 135 damage a round arriving
  // at a third of the rate, which is the tier reading as artillery without
  // being artillery
  ironhide3: [
    {
      name: "ironhide3-siege", reload: t(75), mounts: 2, damage: 55, splash: 80, splashRadius: u(35),
      range: rng(5, 48), speed: spd(5), fx: "bullet",
      look: basic(10, 14, {
        shoot: FxKind.ShootBig, smoke: FxKind.SmokeBig,
        hit: FxKind.BlastExplosion, hitColor: PAL.mechDark,
      }),
    },
  ],
  // ironhide4-weapon: BasicBulletType(8, 70) 11x20, shrinkX 0.4 / shrinkY 0,
  // Fx.shootBig, Fx.blastExplosion — plus two ironhide4-mount pairs firing a
  // 4.5x35 sliver (shrinkX 0.6, shrinkY 0, Interp.slope). Straight bullets
  // already, and left alone: the tier's contribution is the shield field it
  // walks under (levels.ts), not the gun
  ironhide4: [
    {
      name: "ironhide4-weapon", reload: t(60), mounts: 2, damage: 70, range: rng(7, 25), speed: spd(7), fx: "bullet",
      look: basic(11, 20, { shrinkX: 0.4, shrinkY: 0, shoot: FxKind.ShootBig, hit: FxKind.BlastExplosion }),
    },
    {
      name: "ironhide4-mount", reload: t(13), mounts: 4, damage: 20, range: rng(3, 50), speed: spd(3), fx: "bullet",
      look: basic(4.5, 35, { shrinkX: 0.6, shrinkY: 0, slope: true, hitColor: PAL.mechDark }),
    },
  ],
  // ironhide5-weapon: BasicBulletType(13, 80) 14x33, Fx.shootBig,
  // Fx.blastExplosion. The heaviest round in the family, on the tier that
  // hands its plating to everything around it (levels.ts armorField)
  ironhide5: [
    {
      name: "ironhide5-weapon", reload: t(25), mounts: 2, damage: 80, range: rng(13, 24), speed: spd(13), fx: "bullet",
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
  // WHAT A TIER BUYS IS RATE, REACH, RELIABILITY — AND, NOW, WEIGHT. The
  // rot is still the same six seconds from the T1 and the T5 (constants.ts
  // POISON_TIME), so the status is one thing the player learns once; what
  // climbs with the tier is how much a second one application is worth
  // and how much of a patch it lands on.
  //
  // IT USED TO CLIMB FROM SIX TO TEN ACROSS FIVE TIERS and that was the
  // whole ladder — a weaver5's bomb, the family's flagship weapon, put
  // ten health a second on a building, which against a late-run turret
  // carrying Giant and Bulwark (mods.ts) was minutes of rot for a boss
  // that lives seconds. A hundred points of chip on a ten-thousand-health
  // turret is not a threat, it is a decoration. The ladder is twelve to a
  // hundred and fifty now, and the T4 and T5 bombs are heavy enough that
  // a patch under one visibly comes apart.
  //
  // THE CROWD IS STILL THE SCALING ON TOP OF THAT. There is no ceiling:
  // applications add up and bleed back down (POISON_DECAY), so what a
  // turret takes is linear in how many spitters are shooting it, and a
  // heavier per-application rate raises the level the whole crowd
  // settles at.
  //
  // THE DIRECT DAMAGE IS DELIBERATELY SMALL. These bodies are light and
  // quick (levels.ts) and what they do to a board is make it rot, not
  // punch it down — a patch under venom fire loses health with nothing
  // visibly shooting it, which is the whole feel of the family.
  //
  // NO SUICIDE CHARGE. The weaver1's contact bomb is gone: a status that
  // works over six seconds cannot have its opening tier delete itself on
  // arrival, because a dead spitter is one that never refreshes the clock.
  weaver1: [
    {
      name: "venom-spit", reload: t(180), mounts: 1, damage: 25, range: rng(6, 16), speed: spd(6),
      fx: "bullet", poison: 12, poisonChance: 0.4, look: venomOrb(7),
    },
  ],
  // FOUR BARRELS, AND THE FIRST ORB THAT BURSTS. A mirrored bank fires once
  // per reload divided by its mount count (updateUnitWeapons), so four
  // barrels is four times the APPLICATIONS rather than four shots at once —
  // which is what a weaver2 is for now that the rot bleeds back down
  // (constants.ts POISON_DECAY): volume is the only thing that holds a
  // stack up, so four barrels on one body is four bodies' worth of rot.
  //
  // THE SPLASH IS THE REACH OF THE ROT, and it is what the tier ladder
  // is really buying — three and a half tiles here, seventeen on the T5's
  // bomb. It used to open under two tiles and top out at nine, which on a
  // card that puts down a thirty-six turret block meant the family's own
  // area weapons rotted a corner of one patch. The family's ladder
  // used to be three tiers of single-target pea-shooters and then two tiers
  // of area bombardment, a fortyfold step between the weaver3 and the
  // weaver4; it reads as one idea growing now: a ball, a small burst, a
  // bigger burst, a thrown bomb, a barrage. The rot rides the burst, so
  // what a tier really buys is HOW MUCH OF A PATCH one orb rots at once.
  weaver2: [
    {
      name: "venom-spit", reload: t(180), mounts: 4, damage: 8, splash: 30, splashRadius: u(28),
      range: rng(6, 18), speed: spd(6), fx: "bullet", poison: 15, poisonChance: 0.5, look: venomOrb(7),
    },
  ],
  // THE PACE TIER. Its gun is the family's standard orb at a middling rate;
  // what the weaver3 is FOR is the haste field it walks under (levels.ts
  // hasteField) — a third again on everything within ten tiles. It is the
  // only tier on the tree that hands something out, and what it hands out
  // is more applications inside the same six seconds
  weaver3: [
    {
      name: "venom-spit", reload: t(120), mounts: 2, damage: 10, splash: 40, splashRadius: u(36),
      range: rng(6, 20), speed: spd(6), fx: "bullet", poison: 30, poisonChance: 0.7, look: venomOrb(9),
    },
  ],
  // TWO WEAPONS, AND THE FIRST TIME THE FAMILY REACHES PAST ONE TURRET. The
  // spit is the family's standard orb; the BOMB is a heavy orb thrown far
  // that bursts across FOURTEEN TILES and lays ninety health a second on
  // every structure inside it. A patch is four to thirty-six turrets
  // standing in a block — this is the tier that rots the whole block
  // instead of a corner of it, and it does it from six tiles out
  weaver4: [
    {
      name: "venom-spit", reload: t(90), mounts: 4, damage: 10, range: rng(6, 20), speed: spd(6),
      fx: "bullet", poison: 25, poisonChance: 0.8, look: venomOrb(8),
    },
    {
      name: "venom-bomb", reload: t(150), mounts: 1, damage: 14, splash: 120, splashRadius: u(112),
      range: rng(4, 50), speed: spd(4), fx: "shell", poison: 90, poisonChance: 0.8,
      look: venomOrb(18, { trail: true }),
    },
  ],
  // THE BOMB, FAST. The weaver5 drops the single-target spit altogether and
  // throws nothing but area rot — three mounts on a one-second cycle, each
  // one a weaver4's bomb with more reach behind it. It is the same weapon
  // the tier below introduces, arriving often enough that a patch is never
  // out from under it, which is what a T5 of this family should be: not a
  // new idea, the family's idea at a rate nothing answers casually
  weaver5: [
    {
      name: "venom-bomb", reload: t(180), mounts: 3, damage: 18, splash: 160, splashRadius: u(136),
      range: rng(4, 62), speed: spd(4), fx: "shell", poison: 150, poisonChance: 1,
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
  // WHAT A TIER BUYS IS LENGTH AND WIDTH. A starhart1's lance is a thin line
  // seven tiles long that takes the row it points down; a starhart5's is a
  // fifty-seven-tile beam nine cells wide that takes the patch. The
  // damage ladder is Mindustry's own where it had one — starhart3 45, starhart4 35
  // a bite, starhart5 560 — and the two new guns at the bottom are set so the
  // line's T1 and T2 bite a single turret about as hard as the bolt and the
  // arcs they replace did, and a row of them harder.
  //
  // THE OTHER HALF OF THE FAMILY IS IN levels.ts: every tier heals or
  // shields the crowd around it, and the T4 and T5 do both at once. The
  // lasers are what it does to the board; the fields are what it does for
  // the swarm, and a Starlight wave is answered by killing the carriers
  // before the wall of green reaches the guns.
  //
  // starhart1-lance: a thin heal-green beam, nineteen tiles — the bolt's own
  // reach (5.2 x 30) — on a mirrored pair. Replaces the
  // LaserBoltBulletType(5.2, 13) that flew, on the same 30-tick cycle
  // upstream gives the heal-weapon: a beam that lands the moment it fires
  // and keeps going
  starhart1: [
    {
      name: "starhart1-lance", reload: t(30), mounts: 2, damage: 14, range: u(150), speed: 0, fx: "laser",
      pierce: true, laser: STARHART1_LASER, shoot: FxKind.ShootHeal,
    },
  ],
  // starhart2-fan: THREE thin beams a volley, twelve degrees apart, each its
  // own piercing line. Replaces the heal-shotgun-weapon's three lightning
  // bolts (buildingDamage 0.25 — under four a bolt) with three lasers that
  // do seven each and go through; the fan is the shotgun read as light
  starhart2: [
    {
      name: "starhart2-fan", reload: t(36), mounts: 2, shots: 3, spread: 12 * DEG, damage: 8, range: u(90), speed: 0,
      fx: "laser", pierce: true, laser: STARHART2_LASER, shoot: FxKind.ShootHeal,
    },
  ],
  // beam-weapon: reload 55, LaserBulletType damage 45 in Pal.heal, length
  // 150 (row 135), sideAngle 45 / sideWidth 1 / sideLength 70 — the one
  // tier that was already a laser, and pierces now like the rest
  starhart3: [
    {
      name: "beam-weapon", reload: t(55), mounts: 2, damage: 45, range: u(135), speed: 0, fx: "laser",
      pierce: true, laser: STARHART3_LASER, shoot: FxKind.HitPiercer,
    },
  ],
  // starhart4-weapon: ContinuousLaserBulletType(35) length 180, lifetime 160,
  // reload 155 with a 40-tick charge (Fx.greenLaserChargeSmall) — the four
  // heal washes, Fx.hitMeltHeal where it rests. A held beam that pierces
  // bites everything under it every five ticks for as long as it burns
  starhart4: [
    {
      name: "starhart4-weapon", reload: t(155 + 40), mounts: 1, damage: 35, range: u(180), speed: 0, fx: "laser",
      pierce: true, beam: { duration: t(160), interval: t(5) }, charge: t(40), beamStyle: STARHART4_BEAM,
    },
  ],
  // starhart5-weapon: reload 350 with an 80-tick charge (Fx.greenLaserCharge),
  // LaserBulletType damage 560, length 460, width 75, 65 ticks on screen.
  // THE LONG LASER: fifty-seven tiles, nine cells wide, and every
  // structure inside that corridor takes the 560 — a T5 that answers a
  // patch by drawing a line through it
  starhart5: [
    {
      name: "starhart5-weapon", reload: t(350 + 80), mounts: 1, damage: 560, range: u(460), speed: 0, fx: "laser",
      pierce: true, laser: STARHART5_LASER, charge: t(80), shoot: FxKind.HitPiercer,
    },
  ],

  // ---- THE SKYFALL BOMBERS --------------------------------------------
  //
  // A BODY THAT IS A BOMB, FIVE SIZES OF IT. Not one of these carries a
  // gun. Each has ONE weapon and it is itself (fx "bomb", suicide): it
  // picks the nearest structure inside its seek reach, dives at it
  // (Sim.updateUnits) and goes off on contact — and it goes off THE SAME
  // WAY when it is shot down, wherever that is (levels.ts payload,
  // Sim.detonate). The charge is the payload's; this row is only the
  // trigger: `range` is how far out it will spot something to dive at,
  // and the reload is the tick between checks.
  //
  // THE FAMILY'S TWO IDEAS ARE FLYING AND THE PAYLOAD. It ignores the
  // maze and sees everything under it, as the air always did; and what it
  // brings is a charge that goes off on your turrets whether it arrives
  // or is stopped — so an AA line over the guns it protects is an AA line
  // that detonates bombers over them, and the answer is REACH: kill them
  // over nothing. Its carriers are the stoop3 (afterburner: the flight
  // moves faster round it) and the stoop4 (a jam over the guns under
  // it). The stoop5 carries the small nuke.
  //
  // THE SEEK REACH IS THE LADDER: a stoop1 dives at what is under it, an
  // stoop5 picks its target from twenty tiles out.
  stoop1: [{ name: "stoop1-charge", reload: t(6), mounts: 1, damage: 0, range: u(56), speed: 0, fx: "bomb", suicide: true }],
  stoop2: [{ name: "stoop2-charge", reload: t(6), mounts: 1, damage: 0, range: u(72), speed: 0, fx: "bomb", suicide: true }],
  stoop3: [{ name: "stoop3-charge", reload: t(6), mounts: 1, damage: 0, range: u(96), speed: 0, fx: "bomb", suicide: true }],
  stoop4: [{ name: "stoop4-charge", reload: t(6), mounts: 1, damage: 0, range: u(120), speed: 0, fx: "bomb", suicide: true }],
  stoop5: [{ name: "stoop5-nuke", reload: t(6), mounts: 1, damage: 0, range: u(160), speed: 0, fx: "bomb", suicide: true }],
  // boss-weapon: three boss-missile UNITS a volley (shoot.shots 3,
  // inaccuracy 28), each its own sprite with a sapBulletBack engine, going
  // off as ExplosionBulletType(140, 25) in Pal.sap x 1.8 and Pal.suppress,
  // Fx.sparkShoot + shootSmokeTitan off the rail. upstream: speed 4.6,
  // splash 140 in 25. THE BOSS IS IN NO FAMILY and keeps its missiles
  boss: [
    {
      name: "boss-weapon", reload: t(70), mounts: 2, damage: 30, splash: 80, splashRadius: u(35),
      range: rng(3.7, 60), speed: spd(3.7), fx: "missile",
      look: {
        region: "boss-missile", width: u(39 / 4), height: u(60 / 4), shrinkX: 0, shrinkY: 0,
        back: WHITE, front: WHITE, hitColor: PAL.suppress,
        shoot: FxKind.SparkShoot, smoke: FxKind.SmokeBig2,
        hit: FxKind.Explosion, hitStyle: BOSS_EXPLOSION.id,
        puff: { chance: 0.5, size: u(3), color: PAL.sapBulletBack },
      },
    },
  ],

  // ---- THE HARPOON FLEET ----------------------------------------------
  //
  // ONE HARPOON ACROSS FIVE TIERS: every gun on this tree is a RAIL (fx
  // "rail") — an instant line the length of its reach, in the fleet's
  // teal (railColor), that hits what it was aimed at and nothing
  // else, except the skate5's, which PIERCES everything on the line. And
  // every tier has INSANE REACH: a skate1 harpoons from FIFTY tiles, past
  // every gun on the board but the railhead (sixty-two), and a skate5
  // from NINETY, past that too. The line used to be copper, flak,
  // missiles and artillery at the walkers' reaches; it is the SNIPER
  // family now — and the reach has to clear the long guns, or it is a
  // slow family standing inside a barrage's range for its whole crawl in
  // (the first cut, at forty tiles, was a walkover for the headless bot).
  //
  // WHAT IT POSES: it opens fire long before anything can answer, from a
  // hull that crawls ashore (levels.ts NAVAL_PACE, NAVAL_LAND_SPEED) and
  // GROWS THE LONGER IT LIVES (levels.ts veteran: every hit here is
  // multiplied by the hull's age, to triple). The rows below are LIGHT —
  // a fresh skate1's harpoon is a tenth of the old copper pair — because a
  // fleet that has been alive eighty seconds hits three times as hard and
  // is still out of reach. The answer is a gun that reaches out
  // (barrage, repeater, railhead) and kills them YOUNG, and the spotter
  // (skate3) and the drill (skate4) are the hulls to kill first.
  skate1: [
    { name: "skate1-harpoon", reload: t(90), mounts: 1, damage: 20, range: u(400), speed: 0, fx: "rail", railColor: PAL.harpoon },
  ],
  skate2: [
    { name: "skate2-harpoon", reload: t(75), mounts: 2, damage: 36, range: u(440), speed: 0, fx: "rail", railColor: PAL.harpoon },
  ],
  // THE SPOTTER (levels.ts spotterField) — its own harpoon is the
  // middling one; what it does is make every hull round it reach half
  // again as far
  skate3: [
    { name: "skate3-harpoon", reload: t(75), mounts: 1, damage: 90, range: u(480), speed: 0, fx: "rail", railColor: PAL.harpoon },
  ],
  // THE DRILL (levels.ts drillField): the hulls round it age twice as fast
  skate4: [
    { name: "skate4-harpoon", reload: t(60), mounts: 2, damage: 160, range: u(560), speed: 0, fx: "rail", railColor: PAL.harpoon },
  ],
  // skate5-cannon, as upstream has it: RailBulletType, and it goes THROUGH
  // — every structure on its eighty-tile line takes the hit
  // (UnitWeapon.pierce). upstream damage 1250, length 500
  skate5: [
    { name: "skate5-cannon", reload: t(120), mounts: 1, damage: 900, range: u(720), speed: 0, fx: "rail", pierce: true, railColor: PAL.harpoon },
  ],

  // ---- THE WRAITH FLEET -----------------------------------------------
  //
  // THE ARC IS THE ATTACK; THE FAMILY IS HOW IT CANNOT BE HIT. Every gun
  // on this tree is CHAIN LIGHTNING (fx "arc") in the family's violet
  // (PAL.wraith): the target first, then the nearest structure the last one
  // struck can reach, hop after hop, each carrying a share of the last —
  // and every structure it connects with rolls a SHORT (UnitWeapon.short,
  // Tower.shortT): its gun is out for a moment, a refresh and never a
  // stack, so one hull flickers a gun and a crowd holds it down.
  //
  // WHAT IT POSES is in levels.ts: every hull BLINKS — a hit that lands
  // throws it forward past the gun that landed it — and the top three
  // CLOAK on a cycle, the flagship taking the hulls round it with it. A
  // turret line that opens fire on wraiths is a line the wraiths are
  // past; the answer is bursts and fields that catch a body wherever it
  // lands, and killing the flagship in the seconds it shows.
  //
  // THE CLOAK STOPS ROUNDS AND NOTHING ELSE (levels.ts cloak). Fire, a
  // bolt, a beam, a ray and a rail all reach a dark hull, so a board
  // holding any of the seven non-bullet turrets has an answer to the
  // vanishing that does not consist of waiting.
  //
  // THE CHAIN'S REACH is a patch neighbour — three to four tiles — so an
  // arc on a lone tacker is one hit and an arc on a wall of them is the wall.
  livewire1: [
    {
      name: "livewire1-arc", reload: t(40), mounts: 2, damage: 20, range: u(110), speed: 0, fx: "arc",
      arc: { jumps: 1, reach: u(28), decay: 0.7, color: PAL.wraith }, short: 0.6, shortChance: 0.12,
    },
  ],
  livewire2: [
    {
      name: "livewire2-arc", reload: t(12), mounts: 2, damage: 12, range: u(60), speed: 0, fx: "arc",
      arc: { jumps: 2, reach: u(24), decay: 0.6, color: PAL.wraith }, short: 0.4, shortChance: 0.06,
    },
  ],
  livewire3: [
    {
      name: "livewire3-arc", reload: t(50), mounts: 2, damage: 60, range: u(140), speed: 0, fx: "arc",
      arc: { jumps: 4, reach: u(30), decay: 0.75, color: PAL.wraith }, short: 0.7, shortChance: 0.15,
    },
  ],
  // EnergyFieldAbility(40, 65, 180): 80 (upstream 40) to everything in 180
  // — twenty-two tiles — every 65 ticks, a Fx.chainLightning to each, in
  // the family's violet and with a SHORT rolled on every one of them. The
  // family's area tier and its healer at once (levels.ts energyField)
  livewire4: [
    {
      name: "energy-field", reload: t(65), mounts: 1, damage: 80, range: u(180), speed: 0, fx: "field",
      maxTargets: 25, fieldColor: PAL.wraith, short: 1, shortChance: 0.35,
    },
  ],
  // THE EMP CANNON as the family's long arc: thirty-two tiles, six hops,
  // a one-second short on every other thing it touches — upstream's
  // EmpBulletType (damage 110, splash 110 in 100) read as a chain instead
  // of a burst. The flagship, and its cloak veils the fleet (levels.ts)
  livewire5: [
    {
      name: "livewire5-emp", reload: t(120), mounts: 2, damage: 300, range: u(260), speed: 0, fx: "arc",
      arc: { jumps: 6, reach: u(36), decay: 0.8, color: PAL.wraith }, short: 1, shortChance: 0.5,
    },
  ],

  // ---- THE TUSKERS ------------------------------------------------------
  //
  // NO GUN, AT ANY TIER. Every other family on the roster is authored so a
  // shot in the air says who fired it; this one is authored so that there
  // is nothing in the air at all. A tusker walks up to the turret and
  // takes it apart with its tusks (fx "melee"): nothing is drawn crossing
  // the field, and what the player sees is the BUILDING coming apart —
  // ivory sparks and rubble off the face the body is standing against.
  //
  // THE REACH IS THE WHOLE PRICE OF THE FAMILY. Two tiles at the runt,
  // just under five at the apex, against a roster whose SHORTEST gun —
  // the starhart2's fan — reaches eleven and whose longest reaches ninety.
  // A Tusker inside its own reach is the most dangerous body in the game
  // and a Tusker outside it is a slow, enormous target. Everything else
  // about the line (levels.ts: the plating, the bubble, the charge) exists
  // to get it from the second state to the first.
  //
  // WHAT A TIER BUYS IS WEIGHT, and the ladder is steep on purpose: 224
  // damage a second at the runt, twenty-four HUNDRED at the apex. For
  // scale, the ironhide5's cannon — the heaviest round the swarm fires —
  // is under four hundred, from eighteen tiles, so the apex's tusks are
  // six of it and the runt's are most of one. And every blow also RENDS
  // (UnitWeapon.rend): a share of the turret's own maximum health, which
  // is the family's answer to a board that solved everything else by
  // building bigger pools.
  //
  // THE TUSKS WERE DOUBLED, and the reach, the pace and the rend were
  // not. Every number above is twice what the family shipped with and
  // nothing else about it moved, which is deliberate: the line's price
  // has always been the WALK IN (the two tiles of reach, the crawl, the
  // long guns it has to cross), and what was wrong was the reward at the
  // end of it — a body that had paid that price and arrived was taking a
  // turret apart slower than the Ironhides were shooting it from
  // eighteen tiles. Doubling the blow pays the arrival and leaves the
  // price exactly where it was.
  //
  // THE RUNT IS SET AGAINST WAVE 1 (see its row in levels.ts): two
  // hundred and twenty damage a second and a fifth of a per cent a blow,
  // against the wall of sixteen tackers a first card actually buys. Forty
  // runts now take roughly twice the share of that wall they used to —
  // the share was a tenth to a fifth at the old numbers, measured run to
  // run — and every one of them still dies doing it, where forty
  // ironhide1s shooting from eighteen tiles the whole way in take a
  // third. A tusker runt is the tougher body that does less on the
  // approach and more once it lands, which is the family in one row.
  //
  // THE TOP TWO STOMP (splash). The champion and the apex are heavy
  // enough that a blow lands on the patch and not just the gun — three
  // and four tiles of it — so a Tusker that reaches a block of turrets is
  // taking the block apart rather than one turret at a time.
  tusker1: [
    { name: "tusker1-tusks", reload: t(30), mounts: 2, damage: 56, range: u(14), speed: 0, fx: "melee", rend: 0.002 },
  ],
  tusker2: [
    { name: "tusker2-tusks", reload: t(30), mounts: 2, damage: 120, range: u(18), speed: 0, fx: "melee", rend: 0.0035 },
  ],
  tusker3: [
    { name: "tusker3-tusks", reload: t(32), mounts: 2, damage: 220, range: u(22), speed: 0, fx: "melee", rend: 0.005 },
  ],
  tusker4: [
    {
      name: "tusker4-tusks", reload: t(36), mounts: 2, damage: 440, splash: 140, splashRadius: u(26),
      range: u(30), speed: 0, fx: "melee", rend: 0.008,
    },
  ],
  tusker5: [
    {
      name: "tusker5-tusks", reload: t(40), mounts: 2, damage: 800, splash: 280, splashRadius: u(36),
      range: u(38), speed: 0, fx: "melee", rend: 0.012,
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
    if (w.pierce && w.fx !== "laser" && w.fx !== "rail") throw new Error(`${k}/${w.name} pierces but is neither laser nor rail`);
    // the rend is the melee bite and nothing else's: a percentage of a
    // turret's pool arriving from across the board would be a different
    // game, and the family's whole cost is having to walk up to it
    if (w.rend && w.fx !== "melee") throw new Error(`${k}/${w.name} rends but is not a melee weapon`);
  }
}
