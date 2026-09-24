import { CELL, PAL, SHRAPNEL, TEAM_CRUX_RGB, WARDEN_SHOT, WARDEN_SHOT_BACK } from "./constants";
import type { UnitKind } from "./levels";
import { FxKind, type RGB, type TowerKind } from "./types";

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
 *     ammo recolours them. A dartback4's shell is 19 units of sapBullet
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
  | "orb"
  // the Grapnels' round and nothing else: five arms of the sprite laid
  // round a centre that turns as it flies, so what crosses the field is a
  // little spinning star (renderer.ts, the swarm's shots)
  | "star"
  // ...and the three the heavy tiers throw, each one a DIFFERENT STAR and
  // not a recolour (renderer.ts drawStar): the rot star is stubby arms on
  // a heavy core with a bead dripping off the back of it, the soaked star
  // a round bead inside a hard rim, and the fire star a ten-pointed flare
  // with a short point between every long one, spinning half again as
  // fast. A player has to know which is coming at their line from the
  // shape of it before the colour reaches them
  | "star-rot"
  | "star-soak"
  | "star-fire";

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
   *  CARRIES IT ANY MORE — the dartback1's charge was the venom line's old
   *  opening tier and the rework took it off (see the dartback1 row below).
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
   * buy no scaling of their own — what they buy is a way to say "a dartback5
   * poisons every time and a dartback1 one time in four" while both still
   * read as the same status doing the same thing. A player learns one rule
   * and then learns which bodies are reliable.
   *
   * AND IT IS WHY A BURST COMES OUT SPECKLED. The roll is per structure, so
   * a dartback4's bomb rots most of a patch and not all of it — the same
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
   * THE SOAK this weapon leaves on every structure it reaches — the
   * struck one and everything inside its burst — in seconds, at `soakRate`
   * of the gun's own reload (Sim.soakTower, the same landing the Grapnels'
   * soaked star uses). The Kettles' wet bomb and nothing else.
   */
  soak?: number;
  /** ...and how slowly the gun reloads while it runs; 1, or absent, is no
   *  soak at all */
  soakRate?: number;
  /**
   * THE REND — the Tuskers' bite, and the other half of what fx "melee"
   * means: on top of `damage`, every blow that connects takes this SHARE
   * OF THE STRUCTURE'S OWN MAX HEALTH (Tower.hpMax, Sim.hitStructure). 0.01
   * is one per cent a blow.
   *
   * IT IS THE ONE THING ON THE FIELD THAT DOES NOT CARE HOW BIG YOU BUILT
   * IT. Every other number the swarm throws is flat, and a turret's pool
   * is not: Giant and Bulwark (mods.ts) put a late-run gun past fifty
   * thousand health with one copy of each and past two hundred thousand
   * on a deep stack, which is minutes of the venom line's rot and tens of
   * seconds of anything else. A share of the pool is the same
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
/** NOTHING IN THE GAME FIRES A SAP TODAY — the venom rework took the
 *  spider lines off, and the Grapnels' winch line went with the hook —
 *  but the kind is live end to end (UnitWeapon.fx "sap", FxKind.Sap,
 *  renderer drawSap), so a weapon that wants a line has one waiting */
const sapStyle = (s: Omit<SapStyle, "id">): SapStyle => {
  const st = { ...s, id: SAP_STYLES.length };
  SAP_STYLES.push(st);
  return st;
};
/**
 * SLOT 0, AND THE TABLE MUST NEVER BE EMPTY. Anything pushed with no
 * style of its own reads this row, so leaving the table unregistered
 * means there is no slot 0 at all and the first line drawn in a run puts
 * the renderer on the floor mid-frame (drawSap) — a crash, not a missing
 * line. It cost nothing to keep and it is the whole of the safety net.
 *
 * The width is Mindustry's spiroct sap, the row that used to sit here:
 * the strip is 12 x this and the end caps 18 x it, so a little over six
 * units of cable with a disc at each end — a winch line at the scale the
 * bodies are drawn at.
 */
export const DEFAULT_SAP = sapStyle({ color: PAL.sapBullet, width: 0.54, lifetime: t(35) });
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
/**
 * THE SIEGE'S TWO BEAMS (the railgun and the Lance, UNIT_WEAPONS below).
 * Both are the SWARM'S OWN CRIMSON rather than a family's colour, because
 * neither body is in a family: they wear the crux the way the
 * Sovereign does, and a player who sees red on the line knows what side
 * it came from without being told.
 *
 * The railgun's is the widest beam in the game after the Starlight apex's
 * and it is drawn for a hundred and twenty tiles of travel — it has to
 * read as a LINE ACROSS THE BOARD from the corner of the eye, because
 * that is all the warning the core gets. The Lance's is the thin one: a
 * needle on a two-second clock, meant to be seen a dozen times a fight
 * rather than once.
 */
const RAZE_LASER = laserStyle({
  colors: [[PAL.sap, 0.4], [TEAM_CRUX_RGB, 1], [WHITE, 1]],
  width: 46,
  sideAngle: 15 * DEG,
  sideWidth: 0,
  sideLength: 0,
  lifetime: t(48),
});
const LANCE_LASER = laserStyle({
  colors: [[PAL.sap, 0.4], [TEAM_CRUX_RGB, 1], [WHITE, 1]],
  width: 7,
  sideAngle: 45 * DEG,
  sideWidth: 0.6,
  sideLength: 8,
  lifetime: t(14),
});
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
 * TETHER'S LANCE, and the second tower beam in the table after piercer's.
 *
 * It has to read as the OPPOSITE of piercer at a glance, because the two
 * sit one band apart and both fire an instant beam: piercer's is a wide
 * blue sheet that cuts a line of four, this one is a thin mint spike that
 * ends in one body. So the width is 9 against piercer's 15, and the side
 * flares are pulled in to 30 degrees and shortened — a lance has a point,
 * not wings.
 *
 * The hue is the dish's own accent (turretArt.ts "field", PAL.tetherBeam),
 * which is the one colour no other turret on the board throws.
 */
export const TETHER_LASER = laserStyle({
  colors: [[PAL.tetherBeam, 0.4], [PAL.tetherBeam, 1], [WHITE, 1]],
  width: 9,
  sideAngle: 30 * DEG,
  sideWidth: 0.6,
  sideLength: 14,
  lifetime: t(20),
});

/**
 * WHICH LASER STYLE A TURRET'S SHOT DRAWS IN. A tower's beam is picked by
 * kind rather than carried in its BulletStats, because constants.ts is
 * UPSTREAM of this file (weapons.ts imports PAL from it) and cannot name a
 * style without a cycle. Anything absent draws style 0, piercer's.
 */
/**
 * THE WARDENS' BEAM (levels.ts WARDEN_NAME) — red over near-black, the
 * palette every one of their guns throws (constants.ts WARDEN_SHOT), so
 * the beam and the round it comes out beside are the same machine's.
 */
const WARDEN_LASER = laserStyle({
  colors: [[WARDEN_SHOT_BACK, 0.55], [WARDEN_SHOT, 1], [WHITE, 1]],
  width: 11,
  sideAngle: 35 * DEG,
  sideWidth: 0.7,
  sideLength: 12,
  lifetime: t(16),
});

/** the Brander's held beam (UNIT_WEAPONS brander): the Wardens' red over
 *  black, in the four washes a held beam is drawn in */
const BRANDER_BEAM = beamStyle({
  colors: [[WARDEN_SHOT_BACK, 0.25], [WARDEN_SHOT_BACK, 0.55], [WARDEN_SHOT, 1], [WHITE, 1]],
  width: 7,
});

export const TOWER_LASER_STYLE: Partial<Record<TowerKind, number>> = {
  tether: TETHER_LASER.id,
};

/** the furnace's beam, and it is HOT: the deep orange at .33 and .67, the
 *  pale flame face, then white. It was piercer's blue while the turret was
 *  electric; the beam ignites now (constants.ts furnace, `burn`), and the
 *  four washes say so */
export const FURNACE_BEAM = beamStyle({
  colors: [
    [PAL.lightOrange, 0x55 / 255],
    [PAL.lightOrange, 0xaa / 255],
    [PAL.furnaceHit, 1],
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
 * the family's look: a dartback1's spit is 7 across, a dartback5's bomb 22.
 */
/**
 * THE GRAPNELS' STAR: a five-armed round in the family's copper, drawn as
 * the bullet sprite laid five times round a spinning centre (renderer.ts).
 * `size` is the star's full span in world units, so the arms are half of
 * it. No trail — five of these leave the body at once and a trail on each
 * would put a copper asterisk over a quarter of the board.
 */
const star = (size: number): ShotLook => ({
  region: "star",
  width: u(size * 0.42),
  height: u(size),
  // it does not shrink: the round is the same star the whole way out, and
  // what says it is running out of flight is that it stops
  shrinkX: 0,
  shrinkY: 0,
  back: PAL.hookDark,
  front: PAL.hook,
  shoot: FxKind.ShootBig,
  hit: FxKind.BulletHit,
  hitColor: PAL.hook,
});

/**
 * THE THREE ELEMENTAL STARS (StarSpec below): the same round with a
 * different thing riding on it, drawn as three different objects.
 *
 * COLOUR SAYS WHAT IT DOES AND THE SHAPE SAYS IT AGAIN. The rot star is
 * the venom line's acid, the soaked star the dousers' blue, the fire star
 * a red core burning out to a pale flame — three hues nothing in the
 * Grapnels' own copper palette can be confused with, on three silhouettes
 * (see ShotRegion) that read at field zoom when the colours do not. All
 * three stream a puff, which the plain copper star deliberately does not:
 * a round with something on it should look like it is carrying something.
 */
const elemStar = (
  size: number,
  region: "star-rot" | "star-soak" | "star-fire",
  back: RGB,
  front: RGB,
  hit: FxKind,
): ShotLook => ({
  region,
  width: u(size * 0.42),
  height: u(size),
  shrinkX: 0,
  shrinkY: 0,
  back,
  front,
  shoot: FxKind.ShootBig,
  hit,
  hitColor: front,
  puff: { chance: 0.3, size: u(size * 0.3), color: back },
});

const rotStar = (size: number): ShotLook =>
  elemStar(size, "star-rot", PAL.venomDark, PAL.venom, FxKind.SapExplosion);
const soakStar = (size: number): ShotLook =>
  elemStar(size, "star-soak", PAL.water, PAL.piercerLaser, FxKind.EmpHit);
const fireStar = (size: number): ShotLook =>
  elemStar(size, "star-fire", PAL.blastAmmoBack, PAL.lighterOrange, FxKind.BlastExplosion);

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
/**
 * THE KETTLES' WING PODS — the close weapon of the two the vultures carry,
 * and the one that finishes a building. A mirrored PAIR on every tier,
 * mounted where the gunmetal strap runs out along each arm
 * (game/kettleArt.ts), firing the same instant round the copper guns above
 * do in the family's own rust.
 *
 * IT IS A PLAIN GUN ON PURPOSE. What a tier buys here is what a tier buys
 * on the ground mechs: CALIBRE and REACH, and nothing that needs
 * explaining. A body that arrives at the core has to be able to do
 * something to it, and this is the smallest thing that is true of. The
 * family's one trick is the other row (wetBomb).
 */
const pods = (name: string, reload: number, damage: number, reach: number): UnitWeapon => ({
  name,
  reload: t(reload),
  mounts: 2,
  damage,
  range: u(reach),
  speed: 0,
  fx: "gun",
  shoot: FxKind.ShootSmall,
  smoke: FxKind.SmokeSmall,
  shootColor: PAL.carrion,
});

/**
 * THE KETTLES' WET BOMB — the family's one ability, and the only thing on
 * the roster that soaks a gun without being one of the Grapnels' stars.
 *
 * A HEAVY SLOSH LOBBED OVER THE LINE, from further out than the pods
 * reach and at a quarter of anything else's pace: it is visibly in the air
 * for most of a second, it does not collide on the way, and it bursts wide
 * for very little health. What it is really doing is the SOAK — every gun
 * inside the burst reloads at KETTLE_SOAK_RATE while it runs.
 *
 * THE SOAK IS DELIBERATELY WEAK, because of how the landing stacks
 * (Sim.soakTower): it takes the DEEPEST rate in force and refreshes the
 * clock, so one number over a whole family is one number a crowd cannot
 * deepen — only hold. Twenty per cent off a board's rate of fire for as
 * long as kettles are overhead is a tax the player plays around; anything
 * near the Grapnels' 0.4 would be a stun a flock could keep up forever.
 */
const KETTLE_SOAK_RATE = 0.8;

const wetBombLook = (size: number): ShotLook => ({
  region: "orb",
  width: u(size),
  height: u(size),
  shrinkX: 0,
  shrinkY: 0,
  slope: true,
  // the soaked star's two blues, so the board reads one colour for one
  // status however it arrives (elemStar above)
  back: PAL.water,
  front: PAL.piercerLaser,
  shoot: FxKind.ShootLiquid,
  hit: FxKind.WaterBurst,
  hitColor: PAL.piercerLaser,
  trail: { size: u(size * 0.3), mult: 1.4, color: PAL.water },
  collide: false as const,
});

const wetBomb = (
  name: string,
  o: { reload: number; damage: number; splash: number; radius: number;
       life: number; soak: number; size: number },
): UnitWeapon => ({
  name,
  reload: t(o.reload),
  mounts: 1,
  damage: o.damage,
  splash: o.splash,
  splashRadius: u(o.radius),
  // a third of the venom line's thrown bomb: the arc is the tell
  range: rng(2, o.life),
  speed: spd(2),
  fx: "shell",
  soak: o.soak,
  soakRate: KETTLE_SOAK_RATE,
  look: wetBombLook(o.size),
});

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
  // whole ladder — a dartback5's bomb, the family's flagship weapon, put
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
  // NO SUICIDE CHARGE. The dartback1's contact bomb is gone: a status that
  // works over six seconds cannot have its opening tier delete itself on
  // arrival, because a dead spitter is one that never refreshes the clock.
  dartback1: [
    {
      name: "venom-spit", reload: t(180), mounts: 1, damage: 25, range: rng(6, 16), speed: spd(6),
      fx: "bullet", poison: 12, poisonChance: 0.4, look: venomOrb(7),
    },
  ],
  // FOUR BARRELS, AND THE FIRST ORB THAT BURSTS. A mirrored bank fires once
  // per reload divided by its mount count (updateUnitWeapons), so four
  // barrels is four times the APPLICATIONS rather than four shots at once —
  // which is what a dartback2 is for now that the rot bleeds back down
  // (constants.ts POISON_DECAY): volume is the only thing that holds a
  // stack up, so four barrels on one body is four bodies' worth of rot.
  //
  // THE SPLASH IS THE REACH OF THE ROT, and it is what the tier ladder
  // is really buying — three and a half tiles here, seventeen on the T5's
  // bomb. It used to open under two tiles and top out at nine, which on a
  // card that puts down a thirty-six turret block meant the family's own
  // area weapons rotted a corner of one patch. The family's ladder
  // used to be three tiers of single-target pea-shooters and then two tiers
  // of area bombardment, a fortyfold step between the dartback3 and the
  // dartback4; it reads as one idea growing now: a ball, a small burst, a
  // bigger burst, a thrown bomb, a barrage. The rot rides the burst, so
  // what a tier really buys is HOW MUCH OF A PATCH one orb rots at once.
  dartback2: [
    {
      name: "venom-spit", reload: t(180), mounts: 4, damage: 8, splash: 30, splashRadius: u(28),
      range: rng(6, 18), speed: spd(6), fx: "bullet", poison: 15, poisonChance: 0.5, look: venomOrb(7),
    },
  ],
  // THE PACE TIER. Its gun is the family's standard orb at a middling rate;
  // what the dartback3 is FOR is the haste field it walks under (levels.ts
  // hasteField) — a third again on everything within ten tiles. It is the
  // only tier on the tree that hands something out, and what it hands out
  // is more applications inside the same six seconds
  dartback3: [
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
  dartback4: [
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
  // THE BOMB, FAST. The dartback5 drops the single-target spit altogether and
  // throws nothing but area rot — three mounts on a one-second cycle, each
  // one a dartback4's bomb with more reach behind it. It is the same weapon
  // the tier below introduces, arriving often enough that a patch is never
  // out from under it, which is what a T5 of this family should be: not a
  // new idea, the family's idea at a rate nothing answers casually
  dartback5: [
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
  // every tier still opens first: a skate1 harpoons from FORTY-FIVE tiles,
  // past every gun on the board but the railhead, and the line tops out at
  // SIXTY-TWO — dead level with the railhead rather than past it. The line
  // used to be copper, flak, missiles and artillery at the walkers'
  // reaches; it is the SNIPER family now — and the reach has to clear the
  // long guns, or it is a slow family standing inside a barrage's range
  // for its whole crawl in (the first cut, at forty tiles FLAT, was a
  // walkover for the headless bot). What the ramp may no longer do is put
  // the apex beyond every answer on the board.
  //
  // WHAT IT POSES: it opens fire long before anything can answer, from a
  // hull that crawls ashore (levels.ts NAVAL_PACE, NAVAL_LAND_SPEED). The
  // answer is a gun that reaches out — barrage, repeater, railhead — and
  // the spotter (skate3) is the hull to kill first.
  //
  // THE ROWS BELOW USED TO BE LIGHT, and they are not any more. The fleet
  // carried a VETERANCY (levels.ts veteran): every hit multiplied by how
  // long the hull had been alive, to triple at eighty seconds, and the
  // rows were written against the old end of that ramp. So the same
  // skate1 was a rounding error or a real gun depending on when the board
  // got its first shot away, which is not a thing a player can read off
  // the field. The ramp is gone and every row here went up BY A THIRD to
  // pay for it. A third is deliberately NOT what the ramp was worth — a
  // hull that lived eighty seconds was on x3 — and THE CROSSOVER IS
  // THIRTEEN SECONDS: 1 + 0.025 x 13.3 = 1.33, so a hull the board kills
  // inside about thirteen seconds of its arrival now hits HARDER than it
  // used to, and every second past that it hits less. The trade is an old
  // fleet's ceiling for a young fleet's floor, which is the trade a family
  // that sells REACH should be making. Measured end to end, 120s of
  // naval-only wave on an undefended core — the case the old ramp liked
  // best, hulls reaching the x3 cap — went from 14,996 damage to 7,278;
  // against a board that actually shoots back the two are far closer.
  skate1: [
    { name: "skate1-harpoon", reload: t(90), mounts: 1, damage: 13, range: u(360), speed: 0, fx: "rail", railColor: PAL.harpoon },
  ],
  skate2: [
    { name: "skate2-harpoon", reload: t(75), mounts: 2, damage: 24, range: u(390), speed: 0, fx: "rail", railColor: PAL.harpoon },
  ],
  // THE SPOTTER (levels.ts spotterField) — its own harpoon is the
  // middling one; what it does is make every hull round it reach half
  // again as far
  skate3: [
    { name: "skate3-harpoon", reload: t(75), mounts: 1, damage: 60, range: u(420), speed: 0, fx: "rail", railColor: PAL.harpoon },
  ],
  // THE HEAVIEST OF THE FOUR SMALL RAILS, and the fleet's only other
  // two-mount gun. It was the DRILL (levels.ts drillField) — the hulls
  // round it aged two and a half times as fast — and that went out with
  // the veterancy it ran
  skate4: [
    { name: "skate4-harpoon", reload: t(60), mounts: 2, damage: 107, range: u(460), speed: 0, fx: "rail", railColor: PAL.harpoon },
  ],
  // skate5-cannon, as upstream has it: RailBulletType, and it goes THROUGH
  // — every structure on its eighty-tile line takes the hit
  // (UnitWeapon.pierce). upstream damage 1250, length 500
  skate5: [
    { name: "skate5-cannon", reload: t(120), mounts: 1, damage: 600, range: u(500), speed: 0, fx: "rail", pierce: true, railColor: PAL.harpoon },
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
  // — twenty-two tiles — every 65 ticks, in the family's violet and with a
  // SHORT rolled on every one of them. The family's area tier and its
  // healer at once (levels.ts energyField).
  //
  // IT IS DRAWN AS ONE BOLT AND NOT AS TWENTY-FIVE. The pulse takes every
  // target at once, but the lightning WALKS them nearest to nearest out of
  // the mount (sim.ts case "field") instead of leaving the hull once per
  // target: a star of twenty-five beams off one body is a blot, and this
  // family's whole look is a line that goes somewhere
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

  // ---- THE GRAPNELS, the starfish: NO WEAPON AT ALL ----------------
  //
  // THE ONLY BODIES ON THE ROSTER THAT NEVER PULL A TRIGGER. Every other
  // kind in this table attack-moves — it walks the field and fires at
  // whatever comes inside its reach — and a grapnel does neither: it
  // crawls to the core and it does not so much as look at a turret on the
  // way (Sim.updateUnitWeapons skips a body with no weapons outright, so
  // it does not even pay for the search).
  //
  // WHAT IT DOES INSTEAD IS ANSWER. A hit that lands on a grapnel has a
  // chance of throwing a star back out of one of its five arms, and a
  // grapnel that DIES throws five at once, one down every arm
  // (GRAPNEL_STARS below, levels.ts UnitStats.starburst, Sim.throwStar).
  // So the family's whole output is a function of the board shooting at
  // it, which is the one shape no other family here has: a line that
  // opens up on a crawling star is a line the star is now shooting back
  // at, and a line that kills one is a line with five stars incoming.
  //
  // The rounds are not weapons and are not in this table, because nothing
  // about them is a weapon: no reload, no mount, no aim, no target to
  // pull a trigger. They are in GRAPNEL_STARS.
  grapnel1: [],
  grapnel2: [],
  grapnel3: [],
  grapnel4: [],
  grapnel5: [],
  // ---- the Kettles, the vulture -------------------------------------
  //
  // TWO ROWS, AT TWO DISTANCES. A kettle does not dive and does not go off
  // (levels.ts): it crosses the board and holds at the core's edge. The
  // PODS are what it works on the core with, so their reach has to clear
  // the hover — a flyer parks about a tile and a half off the core's own
  // edge — at every tier, and the runt's twenty-eight units is already
  // well past it. Their ladder is the ground mechs' (see the ironhide1
  // row): one class, five tiers, calibre and reach, eighteen a round to a
  // hundred and ten on a pair of mounts at a rate that barely moves.
  //
  // The WET BOMB is what it does to everything else on the way, from five
  // tiles out at the runt to eleven at the apex — so the family opens fire
  // long before the pods bear, and what it opens with is a wide, cheap
  // burst that soaks the guns under it rather than a shot that kills one.
  kettle1: [
    pods("kettle1-pod", 45, 18, 28),
    wetBomb("kettle1-bomb", { reload: 150, damage: 8, splash: 14, radius: 24, life: 20, soak: 2.5, size: 10 }),
  ],
  kettle2: [
    pods("kettle2-pod", 42, 30, 32),
    wetBomb("kettle2-bomb", { reload: 160, damage: 12, splash: 22, radius: 28, life: 26, soak: 3, size: 12 }),
  ],
  kettle3: [
    pods("kettle3-pod", 40, 48, 38),
    wetBomb("kettle3-bomb", { reload: 175, damage: 18, splash: 34, radius: 34, life: 32, soak: 3.5, size: 14 }),
  ],
  kettle4: [
    pods("kettle4-pod", 38, 76, 46),
    wetBomb("kettle4-bomb", { reload: 190, damage: 24, splash: 50, radius: 40, life: 38, soak: 4, size: 17 }),
  ],
  kettle5: [
    pods("kettle5-pod", 36, 110, 54),
    wetBomb("kettle5-bomb", { reload: 210, damage: 32, splash: 70, radius: 48, life: 44, soak: 4.5, size: 20 }),
  ],
  // THE CROSSER CARRIES NOTHING, and that is the archetype rather than a
  // gap in the table (levels.ts, the worm block): a Borer walks its road
  // and never looks at the base or at anything the player built beside
  // it. What it costs a run is the guns bought to reach it, never the
  // guns it takes down.
  wormhead: [],
  wormcar: [],
  wormtail: [],

  // ---- THE SIEGE: the railgun ----------------------------------------
  //
  // THE RAILGUN'S REACH IS THE BOARD. Two hundred tiles is not a number
  // anything else on this table comes near, and it is not meant to be
  // read as reach at all — it is the weapon saying "distance is not part
  // of this". The body holds ONE target for its whole life (levels.ts
  // UnitStats.bombard, Sim.updateUnitWeapons) and that target is the
  // core, so the gate this number opens is the only gate there is.
  //
  // WHAT IT DOES TO THE CORE, and why it is a small number beside every
  // other row here. The core is 24,000 (constants.ts CORE_HP) and there
  // are TEN railguns: a Lance's 560 a shot would take the base down in
  // under a minute with the last section up. 120 every twelve seconds is
  // ten health a second EACH, and on the siege's schedule (levels.ts world
  // 10) that arithmetic lands on a number worth writing down: a siege
  // NOBODY ANSWERS takes the core to zero at 14:00, which is the exact
  // moment the fourth battery rises. Ignore the mission completely and
  // you lose on the tick it finishes arriving. A board that clears each
  // section before the next one is up pays about half the core for the
  // privilege instead. That is the whole balance of the mission, and it
  // is these two numbers.
  //
  // THE CHARGE IS THE TELL. Two seconds of gathering light before the
  // beam, on a body a hundred and twenty tiles away: it is how a player
  // reading the base learns which way to look, and it is the only warning
  // the mission gives.
  railgun: [
    {
      name: "railgun-bombard", reload: t(720), mounts: 1, damage: 120,
      range: u(1600), speed: 0, fx: "laser", laser: RAZE_LASER, charge: t(120),
      shoot: FxKind.HitPiercer,
    },
  ],

  // ---- THE WARDENS (levels.ts WARDEN_NAME) ---------------------------
  //
  // FOUR BODIES NO WAVE MAY SEND (FAMILIES, `objective: true`). They walk
  // at the core like everything else the swarm puts on the ground, and
  // nothing on any board puts one down today.
  //
  // EVERYTHING THEY THROW IS RED AND BLACK (constants.ts WARDEN_SHOT) —
  // one palette over four guns, so a round in the air is theirs before a
  // player has worked out which of them fired it.

  // THE BULWARK'S TUSKS are the Tusker apex's, number for number
  // (tusker5 above): 800 a swing off a mirrored pair, 280 of splash over
  // four and a half tiles, and the rend that eats a building's armour.
  // "This is a T5 melee body" is the entire brief, so copying the row
  // rather than inventing one is the honest way to say it.
  bulwark: [
    {
      name: "bulwark-tusks", reload: t(40), mounts: 2, damage: 800, splash: 280, splashRadius: u(36),
      range: u(38), speed: 0, fx: "melee", rend: 0.012,
    },
  ],
  // THE LANCE'S BEAM is the Starlight apex's bite on a third of its cycle
  // and a third of its reach, and it does NOT pierce. A starhart5 fires
  // 560 down fifty-seven tiles and then spends five seconds doing
  // nothing; this one carries the same 560 into a twenty-four-tile line
  // every two seconds, at one target — constant rather than enormous.
  lance: [
    {
      name: "lance-beam", reload: t(130), mounts: 1, damage: 560, range: u(190), speed: 0,
      fx: "laser", laser: WARDEN_LASER, charge: t(20), shoot: FxKind.ShootBig,
    },
  ],
  // THE HALBERD CUTS FOUR LANES AT ONCE. One pull, four beams in a narrow
  // fan, armour-cutting like the Lance's and shorter: what it does to a
  // line is open four holes in it rather than burn one.
  halberd: [
    {
      name: "halberd-fan", reload: t(150), mounts: 1, shots: 4, spread: 7 * DEG,
      damage: 380, range: u(230), speed: 0, fx: "laser", laser: WARDEN_LASER,
      charge: t(24), shoot: FxKind.ShootBig,
    },
  ],
  // THE JUGGERNAUT THROWS OUT OF BOTH FLANKS — six homing missiles a
  // volley off a mirrored pair of sponsons, three volleys a second, each
  // one small and splashing. The body is slow and the volume is the point.
  juggernaut: [
    {
      name: "juggernaut-sponsons", reload: t(24), mounts: 2, shots: 3, spread: 9 * DEG,
      damage: 260, splash: 300, splashRadius: u(26),
      range: rng(9, 40), speed: spd(9), fx: "missile",
      look: {
        region: "missile", width: u(9), height: u(15), shrinkX: 0, shrinkY: 0,
        back: WARDEN_SHOT_BACK, front: WARDEN_SHOT, hitColor: WARDEN_SHOT,
        shoot: FxKind.ShootBig, hit: FxKind.BlastExplosion,
        trail: { size: u(2.6), mult: 1, color: WARDEN_SHOT_BACK },
      },
    },
  ],

  // THE PYLONS CARRY NOTHING (levels.ts goad, bastion). A buff tower does
  // not shoot: what it does is a number on the train (Sim.goadMul,
  // Sim.bastionCut), and a gun on one would make it a second railgun —
  // a thing that hurts you where it stands — which is not what it is for.
  goad: [],
  bastion: [],
  // ...and neither does a fabricator: it sends bodies, and they shoot
  fabricatorSmall: [],
  fabricatorLarge: [],
  // THE BRANDER'S BEAM is CONSTANT: a held beam that bites the Hauler
  // (levels.ts huntsConvoy) every tenth of a second, no charge, and a
  // reload of nothing so the next burn opens the tick the last goes out.
  // Twenty tiles of reach against the cart's twelve-tile box, and 150 a
  // bite over the cart's forty plating is ~1,100 a second — a leg past
  // one tower costs the cart what one halt mends
  brander: [
    {
      name: "brander-beam", reload: 0, mounts: 1, damage: 150, range: u(160), speed: 0, fx: "laser",
      beam: { duration: 2, interval: t(6) }, beamStyle: BRANDER_BEAM,
    },
  ],
};

/**
 * THE STAR — what a grapnel throws, and the only round in the game that
 * is not fired by a weapon.
 *
 * A grapnel carries no gun (UNIT_WEAPONS, above): it crawls, and a hit
 * that lands on it has a chance of throwing ONE of these back out of one
 * of its five arms, and a grapnel that dies throws FIVE, one down every
 * arm (Sim.throwStar). So there is no reload, no mount, no aim and no
 * target that pulls a trigger — there is a round, a heading and how far
 * it is allowed to travel before it burns out.
 *
 * IT STEERS. A star leaves on its arm's heading and then turns onto the
 * nearest building it can see (`homing`, Sim.updateEnemyShots), which is
 * what makes a round nobody aimed worth throwing: the old volley put five
 * unaimed rounds on the board and four of them flew into the map by
 * construction, and a family that only shoots when it is shot cannot
 * afford to miss with four fifths of what it throws. What it cannot do is
 * chase forever — `range` is the WHOLE of its travel, and a star thrown
 * at nothing, or at something behind a ridge, burns out in the open.
 *
 * AND IT IS FAST — twice the pace the old volley flew at, and half a
 * second of flight at the outside. That is a performance number as much
 * as a feel one: every body in a Grapnel wave can throw these and a dying
 * one throws five, so what keeps the air clear is each round being OVER
 * quickly rather than crossing nine tiles at a walk. It reads correctly
 * too — a star is a thing that is flung. It is also why the shots pass
 * sweeps its step (Sim.sweepShot): at this pace a round moves further
 * than a cell in a tick, and one cell read would miss what it flew
 * through.
 *
 * WHAT THE LADDER BUYS is the ELEMENT. The runt and the brute throw a
 * plain copper star: one building, one bite, nothing after it. From the
 * elite up every star rolls one of three, and all three carry a BURST as
 * well as a bite, wider and heavier the higher the tier:
 *
 *   the ROT star    — the venom line's acid on what it reaches
 *   the SOAKED star — that gun reloads at a fraction of its rate
 *   the FIRE star   — it burns, and fire ignores plating
 *
 * A player cannot know which one is coming, which is the point: the
 * answer to the heavy tiers is not a counter to one status, it is
 * killing the body before it has thrown very many.
 */
export interface StarSpec {
  /** what it is, for the roll and for the drawing */
  element: "plain" | "rot" | "soak" | "fire";
  /** the bite on what it strikes... */
  damage: number;
  /** ...and the burst around it, T3 and up. 0 on the plain star */
  splash: number;
  splashRadius: number;
  /** THE WHOLE OF ITS TRAVEL in world px — a star that has flown this far
   *  is spent wherever it is, and this is the "nearby" in "it attacks a
   *  nearby turret": nothing further away is ever reachable */
  range: number;
  /** world px a second */
  speed: number;
  /** how hard it turns onto its quarry, radians a second */
  homing: number;
  /** raw health a second of ROT it lays, over POISON_TIME (the rot star) */
  poison: number;
  /** the SOAK: seconds of slowed reload, and the fraction of its own rate
   *  the gun reloads at while they run (Sim.soakTower) */
  soak: number;
  soakRate: number;
  /** the FIRE: raw health a second, over TOWER_BURN_TIME (Sim.burnTower) */
  burn: number;
  look: ShotLook;
}

/** the shared half of a star — everything but what it carries */
const starOf = (
  element: StarSpec["element"],
  o: {
    damage: number; splash?: number; splashRadius?: number; range: number; speed: number;
    homing: number; poison?: number; soak?: number; soakRate?: number; burn?: number;
    look: ShotLook;
  },
): StarSpec => ({
  element,
  damage: o.damage,
  splash: o.splash ?? 0,
  splashRadius: o.splashRadius ?? 0,
  range: o.range,
  speed: o.speed,
  homing: o.homing,
  poison: o.poison ?? 0,
  soak: o.soak ?? 0,
  soakRate: o.soakRate ?? 1,
  burn: o.burn ?? 0,
  look: o.look,
});

/**
 * Every star on the roster, indexed by TIER 1-5 — a body throwing one
 * rolls evenly among the entry for its tier (one on the runt and the
 * brute, three from the elite up).
 *
 * THE NUMBERS ARE SIZED FOR A ROUND THAT CONNECTS. The old volley threw
 * five unaimed rounds every ten seconds and landed about one, so its
 * damage carried four misses; a star is thrown perhaps twice as often,
 * lands, and hits for about what one of those rounds did. The death
 * burst is where the family's weight actually is — five of these at once
 * is what a grapnel is worth to the wave, and it is collected by the
 * board killing it.
 */
export const GRAPNEL_STARS: readonly (readonly StarSpec[])[] = [
  // T1, the runt: one copper star, one building, nothing after it
  [starOf("plain", { damage: 150, range: u(110), speed: spd(5), homing: 16, look: star(9) })],
  // T2, the brute: the same round, heavier
  [starOf("plain", { damage: 330, range: u(120), speed: spd(5), homing: 16, look: star(11) })],
  // T3, the elite: the elements arrive, and with them the burst
  [
    starOf("rot", {
      damage: 420, splash: 210, splashRadius: u(18), range: u(130), speed: spd(5.2), homing: 17,
      poison: 22, look: rotStar(13),
    }),
    starOf("soak", {
      damage: 420, splash: 210, splashRadius: u(18), range: u(130), speed: spd(5.2), homing: 17,
      soak: 4, soakRate: 0.6, look: soakStar(13),
    }),
    starOf("fire", {
      damage: 420, splash: 210, splashRadius: u(18), range: u(130), speed: spd(5.2), homing: 17,
      burn: 26, look: fireStar(13),
    }),
  ],
  // T4, the champion
  [
    starOf("rot", {
      damage: 800, splash: 420, splashRadius: u(26), range: u(140), speed: spd(5.4), homing: 18,
      poison: 40, look: rotStar(16),
    }),
    starOf("soak", {
      damage: 800, splash: 420, splashRadius: u(26), range: u(140), speed: spd(5.4), homing: 18,
      soak: 5, soakRate: 0.5, look: soakStar(16),
    }),
    starOf("fire", {
      damage: 800, splash: 420, splashRadius: u(26), range: u(140), speed: spd(5.4), homing: 18,
      burn: 48, look: fireStar(16),
    }),
  ],
  // T5, the apex: the burst is most of what it is worth — a star off an
  // apex takes a corner of a patch and not a turret
  [
    starOf("rot", {
      damage: 1350, splash: 760, splashRadius: u(36), range: u(150), speed: spd(5.6), homing: 19,
      poison: 68, look: rotStar(20),
    }),
    starOf("soak", {
      damage: 1350, splash: 760, splashRadius: u(36), range: u(150), speed: spd(5.6), homing: 19,
      soak: 6, soakRate: 0.4, look: soakStar(20),
    }),
    starOf("fire", {
      damage: 1350, splash: 760, splashRadius: u(36), range: u(150), speed: spd(5.6), homing: 19,
      burn: 85, look: fireStar(20),
    }),
  ],
];

for (const [i, tier] of GRAPNEL_STARS.entries())
  for (const sp of tier) {
    if (sp.range <= 0 || sp.speed <= 0)
      throw new Error(`the tier-${i + 1} ${sp.element} star flies nowhere`);
    // the element is what the drawing keys off, so a star that says it is
    // one thing and is drawn as another is a round a player cannot read
    const want = sp.element === "plain" ? "star" : `star-${sp.element}`;
    if (sp.look.region !== want)
      throw new Error(`the tier-${i + 1} ${sp.element} star is drawn as a ${sp.look.region}`);
  }

/**
 * THE LOOKS NO WEAPON ROW CARRIES. The snapshot crosses a shot as an
 * INDEX into a table both threads build from this module (snapshot.ts),
 * and it builds that table by walking UNIT_WEAPONS — so a round thrown by
 * something that is not a weapon (a bomber's bomblets, its nuke, and
 * every one of the Grapnels' stars) would cross as index 0 and be drawn
 * on the drawing side as somebody else's bullet. These are the rounds
 * that have no row, and this is how they get a seat at the table.
 */
export const EXTRA_LOOKS: readonly ShotLook[] = [
  BOMBLET_LOOK,
  NUKE_LOOK,
  ...GRAPNEL_STARS.flatMap((tier) => tier.map((sp) => sp.look)),
];

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
    // a pierce is a beam that takes everything on its length or a rail
    // that punches through, and nothing else: no round the swarm fires
    // goes through a building. The one that did was the Grapnels' old
    // volley, and what replaced it strikes one thing and bursts
    if (w.pierce && w.fx !== "laser" && w.fx !== "rail")
      throw new Error(`${k}/${w.name} pierces but is neither a laser nor a rail`);
    // the rend is the melee bite and nothing else's: a percentage of a
    // turret's pool arriving from across the board would be a different
    // game, and the family's whole cost is having to walk up to it
    if (w.rend && w.fx !== "melee") throw new Error(`${k}/${w.name} rends but is not a melee weapon`);
  }
}
