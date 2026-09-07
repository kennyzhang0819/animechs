import { CELL } from "./constants";
import type { UnitKind } from "./levels";

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
 * ┌───────────────────────────────────────────────────────────────────┐
 * │ THE NUMBERS BELOW WERE WRITTEN FROM MEMORY OF UnitTypes.java     │
 * │ (v146), NOT READ OFF IT: the Mindustry repository was not         │
 * │ reachable from the session that wrote this file. Every row that   │
 * │ is not certain carries a VERIFY note. To true them up: attach the │
 * │ Mindustry repo (or drop core/src/mindustry/content/UnitTypes.java │
 * │ under vendor/) and re-read each unit's `weapons` block: Weapon    │
 * │ reload (ticks), mirror, shoot.shots, and the bullet's damage,     │
 * │ speed, lifetime, splashDamage, splashDamageRadius and             │
 * │ buildingDamageMultiplier.                                         │
 * └───────────────────────────────────────────────────────────────────┘
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
  | "laser" // instant beam from the mount to the target
  | "lightning" // instant bolt
  | "sap" // instant thin beam (the spider line)
  | "bomb" // dropped straight down: splash where the unit is
  | "rail" // instant, very long, the omura's railgun
  | "field"; // EnergyFieldAbility: every structure in reach, at once

export interface UnitWeapon {
  /** the Mindustry weapon or bullet it is, for the reader */
  name: string;
  /** seconds between this mount's shots (Mindustry reload / 60) */
  reload: number;
  /** how many of this mount the unit carries; a mirrored pair is 2 */
  mounts: number;
  /** bullets per shot (shoot.shots); 1 when unset */
  shots?: number;
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
  /** the unit dies firing it (crawler): the splash is centred on itself */
  suicide?: boolean;
  /** the most structures one field pulse reaches (EnergyFieldAbility.maxTargets) */
  maxTargets?: number;
}

/**
 * ONE DIAL OVER EVERY UNIT WEAPON. Mindustry's numbers are written for a
 * game whose waves are two daggers and forty at the end; this game's
 * open on forty and end on two and a half thousand, so a swarm at
 * Mindustry's per-body bite has fifty to a hundred times the fire of the
 * wave those numbers were tuned against, and at x1 the headless bot's
 * opening board is gone by wave six on every map. The conversion is a
 * body here being a small fraction of the fight a body there is: at
 * x0.02 the bot — which never rebuilds and never walls — dies on
 * Confluence's wave 48, at x0.01 it clears with every life. Balance the
 * swarm's bite here (setUnitDamageScale), not row by row — the rows are
 * Mindustry's, and meant to stay so.
 */
let damageScale = 0.015;
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

/** Bullets.standardCopper: BasicBulletType(2.5, 9), lifetime 60 */
const copper = (name: string, reload: number, mounts: number): UnitWeapon => ({
  name,
  reload: t(reload),
  mounts,
  damage: 9,
  range: rng(2.5, 60),
  speed: spd(2.5),
  fx: "bullet",
});

/** the missiles-mount most of the naval line carries: MissileBulletType(2.7, 12), splash 10 in 25 */
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
});

export const UNIT_WEAPONS: Record<UnitKind, readonly UnitWeapon[]> = {
  // ---- the dagger line --------------------------------------------------
  // large-weapon: reload 13, standardCopper, mirrored
  dagger: [copper("large-weapon", 13, 2)],
  // flamethrower: reload 11, BulletType(4.2, 37) lifetime 13, pierceBuilding
  mace: [
    { name: "flamethrower", reload: t(11), mounts: 2, damage: 37, range: rng(4.2, 13), speed: 0, fx: "flame" },
  ],
  // artillery: reload 60, ArtilleryBulletType(2, 20) lifetime 120, splash 80 in 35
  fortress: [
    {
      name: "artillery", reload: t(60), mounts: 2, damage: 20, splash: 80, splashRadius: u(35),
      range: rng(2, 120), speed: spd(2), fx: "shell",
    },
  ],
  // VERIFY: scepter-weapon (BasicBulletType(7, 50)?, reload 60?) plus two
  // mount-weapon pairs (BasicBulletType(3, 10), reload 13)
  scepter: [
    { name: "scepter-weapon", reload: t(60), mounts: 2, damage: 50, range: rng(7, 25), speed: spd(7), fx: "bullet" },
    { name: "mount-weapon", reload: t(13), mounts: 4, damage: 10, range: rng(3, 50), speed: spd(3), fx: "bullet" },
  ],
  // VERIFY: reign-weapon BasicBulletType(13, 80), pierceBuilding, reload 25?, lifetime ~24
  reign: [
    { name: "reign-weapon", reload: t(25), mounts: 2, damage: 80, range: rng(13, 24), speed: spd(13), fx: "bullet" },
  ],

  // ---- the crawler line -------------------------------------------------
  // the crawler IS the bullet: splash 90 in 55, rangeOverride 30, and it dies
  crawler: [
    {
      name: "crawler", reload: t(24), mounts: 1, damage: 0, splash: 90, splashRadius: u(55),
      range: u(30), speed: 0, fx: "bomb", suicide: true,
    },
  ],
  // atrax-weapon: reload 9, LiquidBulletType(slag) damage 13, speed 2.5, lifetime 57
  atrax: [
    { name: "atrax-weapon", reload: t(9), mounts: 2, damage: 13, range: rng(2.5, 57), speed: spd(2.5), fx: "bullet" },
  ],
  // spiroct-weapon: reload 14, SapBulletType damage 23, length 75; mount-purple-weapon: reload 20, damage 18, length 40
  spiroct: [
    { name: "spiroct-weapon", reload: t(14), mounts: 2, damage: 23, range: u(75), speed: 0, fx: "sap" },
    { name: "mount-purple-weapon", reload: t(20), mounts: 2, damage: 18, range: u(40), speed: 0, fx: "sap" },
  ],
  // VERIFY: four spiroct-weapon saps (damage 20?, length 90?) and a
  // large-purple-mount artillery (splash 70 in 80?, reload 60?)
  arkyid: [
    { name: "spiroct-weapon", reload: t(14), mounts: 4, damage: 20, range: u(90), speed: 0, fx: "sap" },
    {
      name: "large-purple-mount", reload: t(60), mounts: 1, damage: 12, splash: 70, splashRadius: u(60),
      range: rng(2, 100), speed: spd(2), fx: "shell",
    },
  ],
  // VERIFY: large-purple-mount ShrapnelBulletType damage 110 length 90,
  // reload 30; toxopid-cannon ArtilleryBulletType(3, 50) splash 90?, reload 65?
  toxopid: [
    { name: "large-purple-mount", reload: t(30), mounts: 2, damage: 110, range: u(90), speed: 0, fx: "laser" },
    {
      name: "toxopid-cannon", reload: t(65), mounts: 1, damage: 50, splash: 90, splashRadius: u(55),
      range: rng(3, 90), speed: spd(3), fx: "shell",
    },
  ],

  // ---- the support line -------------------------------------------------
  // heal-weapon: reload 24, LaserBoltBulletType(5.2, 13) lifetime 30, alternate false
  nova: [
    { name: "heal-weapon", reload: t(24), mounts: 2, damage: 13, range: rng(5.2, 30), speed: spd(5.2), fx: "laser" },
  ],
  // heal-shotgun-weapon: reload 36, three lightnings of 14, buildingDamageMultiplier 0.25, maxRange 40
  pulsar: [
    { name: "heal-shotgun-weapon", reload: t(36), mounts: 2, shots: 3, damage: 14 * 0.25, range: u(40), speed: 0, fx: "lightning" },
  ],
  // beam-weapon: reload 55, LaserBulletType damage 45, length 135
  quasar: [
    { name: "beam-weapon", reload: t(55), mounts: 2, damage: 45, range: u(135), speed: 0, fx: "laser" },
  ],
  // vela-weapon: ContinuousLaserBulletType(35) length 180, lifetime 160, reload 155 (+40 charge)
  vela: [
    {
      name: "vela-weapon", reload: t(155 + 40), mounts: 1, damage: 35, range: u(180), speed: 0, fx: "laser",
      beam: { duration: t(160), interval: t(5) },
    },
  ],
  // corvus-weapon: reload 350 (+80 charge), LaserBulletType damage 560, length 460
  corvus: [
    { name: "corvus-weapon", reload: t(350 + 80), mounts: 1, damage: 560, range: u(460), speed: 0, fx: "rail" },
  ],

  // ---- the air line -----------------------------------------------------
  // reload 20, BasicBulletType(2.5, 9) lifetime 45, mirrored
  flare: [
    { name: "flare", reload: t(20), mounts: 2, damage: 9, range: rng(2.5, 45), speed: spd(2.5), fx: "bullet" },
  ],
  // bombs: reload 12, BombBulletType(27, 25), dropped on what it flies over
  horizon: [
    {
      name: "horizon-bomb", reload: t(12), mounts: 2, damage: 0, splash: 27, splashRadius: u(25),
      range: u(30), speed: 0, fx: "bomb",
    },
  ],
  // zenith-missiles: reload 40, two MissileBulletType(3, 14) lifetime 50, splash 15 in 25
  zenith: [
    {
      name: "zenith-missiles", reload: t(40), mounts: 2, shots: 2, damage: 14, splash: 15, splashRadius: u(25),
      range: rng(3, 50), speed: spd(3), fx: "missile",
    },
  ],
  // VERIFY: two missiles-mount pairs (MissileBulletType(2.7, 12), splash 30
  // in 20, reload 20) and a large-bullet-mount pair (BasicBulletType(7, 55), reload ~7)
  antumbra: [
    {
      name: "missiles-mount", reload: t(20), mounts: 2, damage: 12, splash: 30, splashRadius: u(20),
      range: rng(2.7, 50), speed: spd(2.7), fx: "missile",
    },
    { name: "large-bullet-mount", reload: t(7), mounts: 2, damage: 55, range: rng(7, 25), speed: spd(7), fx: "bullet" },
  ],
  // VERIFY: large-laser-mount pair (LaserBulletType damage 115, length 230,
  // reload 45) and large-artillery pairs (BasicBulletType(7, 15)?, reload 9)
  eclipse: [
    { name: "large-laser-mount", reload: t(45), mounts: 2, damage: 115, range: u(230), speed: 0, fx: "laser" },
    { name: "large-artillery", reload: t(9), mounts: 4, damage: 15, range: rng(7, 25), speed: spd(7), fx: "bullet" },
  ],
  // VERIFY: the disrupt's missile pods — modelled as a heavy missile pair
  disrupt: [
    {
      name: "disrupt-weapon", reload: t(70), mounts: 2, damage: 30, splash: 80, splashRadius: u(35),
      range: rng(3.7, 60), speed: spd(3.7), fx: "missile",
    },
  ],

  // ---- the naval line ---------------------------------------------------
  // mount-weapon pair (standardCopper, reload 13) and one missiles-mount (reload 25, lifetime 65)
  risso: [copper("mount-weapon", 13, 2), missilesMount(1, 25, 10, 65)],
  // VERIFY: mount-weapon pair firing flakScrap (FlakBulletType(4, 3), splash 40 in 15) and missile mounts
  minke: [
    {
      name: "mount-weapon", reload: t(13), mounts: 2, damage: 3, splash: 40, splashRadius: u(15),
      range: rng(4, 45), speed: spd(4), fx: "bullet",
    },
    missilesMount(2, 20, 30),
  ],
  // VERIFY: large-artillery (ArtilleryBulletType(3, 20) lifetime 80, splash 85? in 25*0.75, reload 65) and a missiles-mount pair (reload 20)
  bryde: [
    {
      name: "large-artillery", reload: t(65), mounts: 1, damage: 20, splash: 85, splashRadius: u(25 * 0.75),
      range: rng(3, 80), speed: spd(3), fx: "shell",
    },
    missilesMount(2, 20),
  ],
  // VERIFY: sei-launcher (six MissileBulletType(4.2, 42), splash 45 in 35, reload 45) and a large-bullet-mount pair (BasicBulletType(7, 57), reload 13)
  sei: [
    {
      name: "sei-launcher", reload: t(45), mounts: 1, shots: 6, damage: 42, splash: 45, splashRadius: u(35),
      range: rng(4.2, 62), speed: spd(4.2), fx: "missile",
    },
    { name: "large-bullet-mount", reload: t(13), mounts: 2, damage: 57, range: rng(7, 25), speed: spd(7), fx: "bullet" },
  ],
  // omura-cannon: reload 110, RailBulletType damage 1250, length 500; VERIFY the small mounts
  omura: [
    { name: "omura-cannon", reload: t(110), mounts: 1, damage: 1250, range: u(500), speed: 0, fx: "rail" },
    missilesMount(2, 25, 20),
  ],

  // ---- the naval support line ------------------------------------------
  // VERIFY: the retusa's torpedo (damage 22?, slow, homing) — and whether it
  // may hit a structure at all (collidesTiles); modelled as a slow bullet
  retusa: [
    { name: "retusa-weapon", reload: t(60), mounts: 1, damage: 22, range: u(140), speed: spd(1.4), fx: "bullet" },
  ],
  // plasma-mount-weapon pair: reload 5, BulletType(3.4, 23) flame, lifetime 18, pierceBuilding
  oxynoe: [
    { name: "plasma-mount-weapon", reload: t(5), mounts: 2, damage: 23, range: rng(3.4, 18), speed: 0, fx: "flame" },
  ],
  // VERIFY: the cyerce's mounts — modelled as a missile pair over its repair beam
  cyerce: [
    {
      name: "missiles-mount", reload: t(25), mounts: 2, damage: 15, splash: 40, splashRadius: u(30),
      range: rng(2.7, 50), speed: spd(2.7), fx: "missile",
    },
  ],
  // EnergyFieldAbility(35, 65, 180): 35 to everything in 180, every 65 ticks
  aegires: [
    { name: "energy-field", reload: t(65), mounts: 1, damage: 35, range: u(180), speed: 0, fx: "field", maxTargets: 25 },
  ],
  // VERIFY: EnergyFieldAbility(40, 65, 220)?, two emp-cannon-mount (EmpBulletType,
  // splash ~80 in 100?) and two plasma-laser-mount held beams
  navanax: [
    { name: "energy-field", reload: t(65), mounts: 1, damage: 40, range: u(220), speed: 0, fx: "field", maxTargets: 25 },
    {
      name: "emp-cannon-mount", reload: t(65), mounts: 2, damage: 30, splash: 80, splashRadius: u(60),
      range: rng(5.8, 50), speed: spd(5.8), fx: "missile",
    },
    {
      name: "plasma-laser-mount", reload: t(90), mounts: 2, damage: 12, range: u(90), speed: 0, fx: "laser",
      beam: { duration: t(60), interval: t(5) },
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

for (const [k, ws] of Object.entries(UNIT_WEAPONS))
  if (ws.length > MAX_WEAPONS)
    throw new Error(`${k} carries ${ws.length} weapons; MAX_WEAPONS is ${MAX_WEAPONS}`);
