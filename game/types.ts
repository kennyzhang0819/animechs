/**
 * Every turret the campaign will ever field: Serpulo's, in tech-tree
 * order, and then the four authored ones that poison.
 *
 * EVERY ONE OF THEM IS IMPLEMENTED — real stats, real ammo, drawn on the
 * field. Two of them, the fixers, are RETIRED for now and dealt to nobody
 * (RETIRED_KINDS below); the other twenty-one are what the deal draws from
 * (rarity.ts) and what the track hands out. The late five were stubs
 * carrying a tacker's bullet until they were given their own: hive's
 * homing missiles, whirl's proximity flak, repeater's piercing twin
 * cannon, furnace's held beam and railhead's rail shot.
 *
 * Douser and deluge are the liquid turrets, and they are the roster's
 * one DELIBERATE DEVIATION rather than a 1:1 port. Upstream their water
 * shoves units back (knockback) and wets them for a 0.94x speed multiplier
 * — a nudge, because their real jobs there are extinguishing fire and
 * healing blocks, neither of which exists here. Here the wet status IS the
 * weapon: no push, and the slow is deep (see BulletStats.wet). Their
 * trivial contact damage is kept — the number on the tin is honest about
 * what they are for.
 *
 * One Serpulo turret stays deliberately absent. Segment shoots down enemy
 * bullets, and our units never fire at buildings, so it would have nothing
 * to intercept. It comes back if that system ever does.
 */
export const TOWER_KINDS = [
  // implemented
  "tacker",
  "lobber",
  "autocannon",
  "airburst",
  "cleaver",
  "torch",
  "coil",
  "piercer",
  "barrage",
  "douser",
  "tether",
  "deluge",
  // the support pair: they shoot nothing and heal the line instead
  "fixer",
  "restorer",
  // extreme and nemesis
  "hive",
  "whirl",
  "repeater",
  "furnace",
  "railhead",
  // THE TOXIN LINE, one gun a footprint and the only turrets that poison
  // (docs/elements.md). Nothing here is a Serpulo port: poison is a
  // channel Mindustry's turrets never carried, so the four are authored
  "duster",
  "blighter",
  "drifter",
  "stinger",
] as const;
export type TowerKind = (typeof TOWER_KINDS)[number];

/**
 * RETIRED FOR NOW — implemented, drawn, priced, and dealt to nobody.
 *
 * The two fixers are the support pair, and the support pair is off the
 * field while the deal (rarity.ts) is being built: a block that heals the
 * line is a different decision from a block that shoots it, and a card
 * dealt at random is the wrong door to hand one through. Everything about
 * them stays — Sim.updateFixer, their stats, their upgrades, their
 * sprites — so putting them back is deleting a name from this list.
 *
 * Nothing outside this file should special-case a kind: read FIELDED_KINDS
 * and the retired ones are simply not there.
 */
export const RETIRED_KINDS: readonly TowerKind[] = ["fixer", "restorer"];

const RETIRED = new Set<TowerKind>(RETIRED_KINDS);

/** is this kind off the field for now? */
export const isRetired = (kind: TowerKind): boolean => RETIRED.has(kind);

/** every turret the game actually fields — the roster the track deals from,
 *  the deal draws from and the build card is built out of */
export const FIELDED_KINDS: readonly TowerKind[] = TOWER_KINDS.filter((k) => !RETIRED.has(k));

/**
 * THE PLAYER'S FACTIONS, and every turret is in exactly one. Foundry is
 * the machine line (docs/turret-factions.md); Gasworks is the toxin line
 * (docs/elements.md), four guns today and a faction because more are
 * coming. Nothing in a run reads the split yet — the deal still draws
 * over the whole fielded roster — it is the grouping the codex prints and
 * a per-faction deal would be built on.
 */
export const PLAYER_FACTIONS = [
  { key: "foundry", name: "Foundry",
    blurb: "Machine turrets: one metal, an accent per ammo, and every kind its own shape.",
    kinds: ["tacker", "lobber", "autocannon", "airburst", "cleaver", "torch", "coil", "piercer", "barrage",
      "douser", "tether", "deluge", "fixer", "restorer", "hive", "whirl", "repeater", "furnace", "railhead"] },
  { key: "gasworks", name: "Gasworks",
    blurb: "The toxin line: it vents rather than fires, and the rot ignores plating.",
    kinds: ["duster", "blighter", "drifter", "stinger"] },
] as const satisfies readonly { key: string; name: string; blurb: string; kinds: readonly TowerKind[] }[];
export type PlayerFactionKey = (typeof PLAYER_FACTIONS)[number]["key"];

type UnfactionedKind = Exclude<TowerKind, (typeof PLAYER_FACTIONS)[number]["kinds"][number]>;
const _everyTurretHasAFaction: UnfactionedKind extends never ? true : never = true;
void _everyTurretHasAFaction;

const FACTION_OF: Readonly<Record<TowerKind, PlayerFactionKey>> = (() => {
  const out = {} as Record<TowerKind, PlayerFactionKey>;
  for (const f of PLAYER_FACTIONS)
    for (const k of f.kinds) {
      if (out[k]) throw new Error(`the ${k} turret is in two player factions`);
      out[k] = f.key;
    }
  return out;
})();
export const factionOf = (kind: TowerKind): (typeof PLAYER_FACTIONS)[number] =>
  PLAYER_FACTIONS.find((f) => f.key === FACTION_OF[kind])!;


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

/** anything either side can shoot: a turret, or the core */
export type Structure = Tower | Core;
export const isCore = (s: Structure): s is Core => "core" in s;

/**
 * WHOSE BUILDING IT IS. The player builds every structure on the board and
 * the core is always theirs — so in an ordinary run this is "player" on
 * everything and nothing ever reads it twice.
 *
 * THE SWARM OWNS BUILDINGS UNDER ONE RULE AND ONE RULE ONLY: CONQUEST
 * (mutation.ts). A turret the swarm wrecks under it is not removed, it
 * CHANGES SIDES — same footprint, same stats, same gun, pointed the other
 * way — and from that moment it is a thing the player has to shoot down.
 * The two sides fight only each other: the player's guns take the swarm's
 * buildings and its bodies, the swarm's guns and bodies take the player's.
 * Nothing sells, selects, upgrades or counts a building of the swarm's,
 * and the swarm walks AROUND its own turret rather than chewing through
 * it.
 */
export type Team = "player" | "enemy";

/** whose it is — the core is the player's by definition */
export const teamOf = (s: Structure): Team => (isCore(s) ? "player" : s.team);



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
  /**
   * WHOSE IT IS (Team). "player" on everything a run builds, and the only
   * thing that ever writes "enemy" is the CONQUEST mutator taking a wreck
   * over (Sim.conquerTower). It is not fixed at the placement the way
   * `size` and `mods` are — changing sides is the whole rule.
   */
  team: Team;
  gx: number; // top-left cell of the size x size footprint
  gy: number;
  /**
   * HOW MANY TILES ON A SIDE THIS BUILDING ACTUALLY STANDS ON, and it is
   * per-TOWER rather than per-kind because the GIANT attribute doubles it
   * (mods.ts sizeWithMods): a giant railhead is an 8x8 where every
   * other railhead is a 4x4.
   *
   * EVERYTHING THAT MEASURES A FOOTPRINT READS THIS, never the table —
   * the ground it claims, the shadow it casts, the quad it is drawn on,
   * what a unit walks into. It is fixed at the placement: the mask that
   * decided it is fixed too, and re-sizing a building that already owns
   * its cells would leave the occupancy grid holding ground nothing
   * stands on.
   */
  size: number;
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
   * THIS TURRET'S OWN CEILING, and it is per-TURRET rather than per-kind
   * (constants.ts towerMaxHp) because a turret's mods move it: a tacker
   * born with Braced Frame carries half again what the tacker beside it
   * does. Everything that draws or reads a structure's fullness reads this,
   * never the table.
   */
  hpMax: number;
  /**
   * THE MODS THIS TURRET WAS BORN WITH, as a bitmask over
   * mods.ts TURRET_MOD_IDS — 0, the usual case, for a plain turret.
   *
   * IT IS FIXED AT THE PLACEMENT AND NEVER MOVES. A turret mod is a
   * CHANCE rolled once, when the structure goes down (Sim.addTower), and
   * buying another copy of the attribute afterwards raises the odds for
   * the NEXT turret and does nothing at all for this one. That is the
   * whole shape of the mechanic — see the header of mods.ts.
   */
  mods: number;
  /**
   * The stats this turret actually fires with: its kind's (the tech
   * tree's rungs and the run's relics folded in, Sim.specs) with this
   * turret's OWN attributes on top.
   *
   * IT IS RESOLVED, NOT LOOKED UP. A per-turret stat table cannot be
   * shared per kind any more, and re-deriving one inside the fire loop
   * would allocate a TowerStats per turret per tick — so it is composed
   * once at the placement and re-composed at the few moments a kind's
   * stats can move (Sim.refreshSpecs), and the hot loop just reads it.
   */
  spec: import("./constants").TowerStats;
  /** health returned a second by this turret's own attributes (nanoweave,
   *  bulwark) — 0 on everything else, and the fire loop's cheap gate */
  regen: number;
  /**
   * THE ROT IN FORCE ON THIS BUILDING, in raw health a second, and the
   * seconds it still has to run (constants.ts POISON_TIME). The venom line
   * is the only thing in the game that applies it.
   *
   * IT IS RAW DAMAGE AND NOT A PERCENTAGE. A tenth of a tacker's pool a
   * second and a tenth of a railhead's are not the same rule, and the one
   * that scales with the target turns the venom family into a flat tax the
   * big guns pay hardest. A number of hit points a second is a number the
   * player can hold against the thing they are about to place.
   *
   * IT ALSO IGNORES ARMOUR, exactly as burning does on the other side
   * (Sim.applyStatusDamage): plating is the ground mechs' answer to volume,
   * and rot is the answer to plating. The two families are built to pose
   * opposite problems.
   *
   * STACKING IS ADDITIVE ON THE RATE, A REFRESH ON THE CLOCK, AND HAS NO
   * CEILING. Every application adds its rate; everything above one
   * application bleeds back down (POISON_DECAY), so what a turret is
   * actually rotting at is an equilibrium between how fast the spitters are
   * landing shots and how fast the stack drains — and that level is LINEAR
   * IN THE SIZE OF THE CROWD.
   *
   * THE NUMBERS PER APPLICATION ARE SMALL AND MOST OF THEM ARE A CHANCE
   * (weapons.ts poisonChance). A dartback1's spit is six health a second, one
   * roll in four; a dartback5's bomb lands every time. What makes a wave
   * lethal is that it is a wave.
   *
   * `poisonUnit` IS THE FLOOR — the heaviest single application in force,
   * which does not decay while the clock runs, so one spitter on a turret
   * rots it at exactly the rate its weapon says.
   */
  poison: number;
  poisonUnit: number;
  poisonT: number;
  /**
   * SHORTED OUT — the Aegis tanks' EMP (weapons.ts UnitWeapon.short): the
   * seconds this building's gun is dead. While it runs the turret neither
   * reloads nor fires nor mends; the clock is a REFRESH and never a stack
   * (Sim.shortTower), so one hull cannot hold a gun down on its own — its
   * reload is longer than its short — and a crowd of them can, which is
   * the shape every swarm status here has.
   */
  shortT: number;
  /**
   * ALIGHT — the Grapnels' fire star (weapons.ts StarSpec.burn): the
   * seconds this building is burning and the raw health a second it is
   * losing to it. A REFRESH on the clock and a MAX on the rate, like the
   * short above and unlike the rot, which stacks: a second star re-lights
   * the fire rather than laying a second one, and a bigger star's fire
   * burns hotter than the one already on it (Sim.burnTower).
   *
   * IT IGNORES PLATING, exactly as burning does on the swarm's own bodies.
   */
  burnT: number;
  burnDps: number;
  /**
   * JAMMED — the Sky gunships' T4 blankets the ground under it
   * (levels.ts jamField): while `jamT` runs, the reload goes at `jamRate`
   * on top of `fireRate`. A stamp like the swarm's own auras — the carrier
   * pulses, the building carries the timer — so a gun under the flight is
   * slowed for as long as the flight is over it and no longer.
   */
  jamT: number;
  jamRate: number;
  /**
   * SOAKED — the Grapnels' soaked star (weapons.ts StarSpec.soak): while
   * `soakT` runs, this gun's reload goes at `soakRate` of its own, on top
   * of the jam above and everything else that moves it.
   *
   * IT IS NOT THE JAM AND IT IS NOT WATERLOGGING, however alike the three
   * read on the turret. The jam is a STAMP — a bomber wing is overhead
   * right now and the timer is refreshed while it stays — and waterlogging
   * (`fireRate`) is a fact about the ground the turret was built on that
   * never changes. This is a wound: laid once by a round that landed, it
   * runs down and is gone. Sharing either field would have a star's soak
   * cleared by a flight leaving, or a permanent property re-timed by a
   * round. A REFRESH on the clock and the DEEPEST rate in force, like the
   * short and the fire (Sim.soakTower).
   */
  soakT: number;
  soakRate: number;
  /**
   * THE MECH VIRUS IS IN THIS BUILDING (mutation.ts). Unlike the rot
   * above it carries no rate and no clock, because it has neither: it
   * eats a fixed share of the turret's OWN ceiling every second and it
   * never times out. It leaves on exactly two events — the turret stands
   * back up (Sim.reviveTower, which is the rule's counter) or the turret
   * is gone for good, in which case it does not leave so much as MOVE
   * (Sim.spreadVirusFrom).
   */
  virus: boolean;
  /**
   * How many times this turret can still revive when it is
   * wrecked (mods.ts: Undying Legion grants one to everything). Spent
   * before the Phoenix roll is even reached.
   */
  revives: number;
  /**
   * How many revives this turret was BORN with — what `revives` started
   * at, held so CONQUEST (mutation.ts) can hand the swarm's copy the same
   * charges the player's turret had. A turret that spent its Undying
   * Legion charge holding the line does not get to keep the swarm from
   * spending one in its turn: the thing that changes sides is the whole
   * turret, its stubbornness included.
   *
   * PHOENIX IS NOT IN HERE, and cannot be: it is a roll the RUN owns
   * rather than a charge the turret carries (mods.ts PHOENIX_CHANCE), and
   * the swarm never rolls it — see Sim.reviveTower.
   */
  revivesMax: number;
  /** seconds left on a neighbour's dying charge (Last Volley): while it
   *  runs the reload goes at LAST_VOLLEY_RATE on top of `fireRate` */
  boostT: number;
  /**
   * Which shield tower this tower's current volley is aimed at, as an index into
   * Sim.shieldTowers — or -1, the usual case, when it is aimed at a unit. The
   * instant weapons (laser, lightning, rail, ray, the held beam) damage
   * their target directly rather than via a projectile, so fireShot has to
   * know when "the target" is a shield tower and not a unit index.
   */
  aimShieldTower: number;
  /**
   * The STRUCTURE this turret's volley is aimed at — one of the swarm's
   * conquered turrets for a gun of the player's, one of the player's
   * buildings (the core included) for a gun of the swarm's — or null, the
   * usual case, when it is aimed at a body or at nothing.
   *
   * It is held by reference and revalidated against the occupancy grid
   * before every use (Sim.inReach), because a building that came down is
   * a building whose cells no longer point at it.
   */
  aimTower: Structure | null;
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
  // charge, or -1 when nothing is charging. Piercer sets moveWhileCharging
  // false, so a charging turret also stops turning
  chargeT: number;
  // A LOCK BEAM's live state (tether, Sim.updateLockBeam): where the
  // beam ends, and Mindustry's `strength` — which lerps in as the beam
  // catches and out as it lets go, and which the spool below rides on top
  // of so a hot beam is visibly fatter than a cold one. A lock turret has
  // no bullets, so this IS its whole visual state
  beamX: number;
  beamY: number;
  beamStr: number;
  /**
   * Seconds of UNBROKEN contact the current lock has, capped at the
   * bullet's `lock.spool`: the beam's damage is scaled from 1 up to
   * `lock.peak` across it. It fills while the beam is landing, bleeds at
   * the same rate while it is not, and is zeroed outright the moment the
   * turret changes target — the spool belongs to the lock, never to the
   * turret (see Sim.updateLockBeam).
   */
  beamSpool: number;
  // LaserTurret's held beam (furnace). Mindustry pins the beam bullet to
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
  /**
   * THE FALLBACK MUZZLE FLASH (Sim.fireShot, Renderer's tower pass).
   *
   * Seconds left on a mark drawn at the barrel for a shot whose own muzzle
   * effect the effect pool REFUSED — so a screen saturated past FX_CAP can
   * never make a firing turret look like a stalled one. It is state on the
   * TURRET rather than an effect precisely because the pool is what failed:
   * one quad, no slot, no cap to be refused by.
   *
   * Set only on refusal, so a board inside its budget never draws it and
   * never pays for it, and the shot's own effect is never doubled.
   * `flashX/flashY` is the muzzle the shot actually left from and
   * `flashRot` its heading, both fixed at the shot — the turret slews on
   * while the mark fades, exactly as a real muzzle effect would.
   */
  flashT: number;
  flashX: number;
  flashY: number;
  flashRot: number;
}

/**
 * A UNIT'S SHOT IN FLIGHT — a bullet, missile or shell fired at a
 * structure (Sim.updateUnitWeapons). A flat record, as a shot once was, but
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
  /** raw health a second of ROT this shot lays on what it hits, and on
   *  everything its splash reaches — 0 on every shot that is not the venom
   *  line's (weapons.ts UnitWeapon.poison) */
  poison: number;
  /** ...and the odds it takes, rolled PER STRUCTURE so a burst comes out
   *  speckled (weapons.ts UnitWeapon.poisonChance). 1 on the tiers that
   *  never miss */
  poisonChance: number;
  /**
   * A ROUND THAT STEERS (weapons.ts StarSpec.homing, the Grapnels' star
   * and nothing else today): how hard it turns onto its quarry, in
   * radians a second. 0 on every shot that flies the heading it was
   * fired on, which is all of them but this one.
   */
  homing: number;
  /**
   * ...and what it is chasing. Held by reference and revalidated against
   * the occupancy grid every tick (Sim.updateEnemyShots), because a
   * building that came down is a building whose cells no longer point at
   * it; a star whose quarry is gone looks once for another and then flies
   * straight until its travel runs out. Null on everything else.
   */
  seek: Structure | null;
  /**
   * THE SOAKED STAR (Sim.soakTower): seconds of slowed reload it lays on
   * what it hits, and the fraction of its own rate that gun then reloads
   * at. 0 and 1 on every shot that is not one.
   */
  soakT: number;
  soakRate: number;
  /** THE FIRE STAR (Sim.burnTower): raw health a second it sets what it
   *  hits alight for, over TOWER_BURN_TIME. 0 on everything else */
  burn: number;
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
  PiercerShoot = 23, // Fx.piercerLaserShoot
  PiercerCharge = 24, // Fx.piercerLaserCharge over Fx.piercerLaserChargeBegin
  HitPiercer = 25, // Fx.hitPiercer
  BlastExplosion = 26, // Fx.blastExplosion — hive's warhead
  PlasticExplosion = 27, // Fx.plasticExplosion — whirl's
  InstShoot = 28, // Fx.instShoot — railhead's muzzle
  InstHit = 29, // Fx.instHit
  InstTrail = 30, // Fx.instTrail, laid every 20 units down the rail line
  InstBomb = 31, // Fx.instBomb, where a rail shot runs out unspent
  RailHit = 32, // Fx.railHit, at each body the rail punches through
  SmokeCloud = 33, // Fx.smokeCloud
  HitFurnace = 34, // Fx.hitFurnace
  SmokeBig2 = 35, // Fx.shootBigSmoke2 — furnace's, wider than shootBigSmoke
  /** Fx.unitSpawn: the entrance. Two copies of the arriving unit's OWN
   *  sprite — one shrinking onto it out of nothing, one counter-rotated
   *  underneath fading away. WaveSpawner.spawnEffect fires it on every
   *  unit a wave puts on the map */
  UnitSpawn = 36,
  // 37 was Fx.spawn, the accent square that snapped out where a unit
  // finished arriving. The entrance below already reads as an arrival
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
  Pulverize = 44, // Fx.pulverize — the dartback1's own burst
  SapExplosion = 45, // Fx.sapExplosion — the purple artillery's landing
  MassiveExplosion = 46, // Fx.massiveExplosion — skate3's shell
  RailShoot = 47, // Fx.railShoot — skate5's muzzle
  RailTrail = 48, // Fx.railTrail — laid every 60 units down skate5's line
  /** livewire5's emp burst: the ring at the splash radius (`len`) with ten
   *  spikes on its rim, and the flash inside it */
  EmpHit = 49,
  EmpTrail = 50, // the emp round's trailEffect — two wings across its line
  HitLaserBlast = 51, // Fx.hitLaserBlast — a laser's landing, in its colour
  HitMeltHeal = 52, // Fx.hitMeltHeal — where a green beam rests
  HitLaser = 53, // Fx.hitLaser — a heal bolt's landing
  GreenCloud = 54, // Fx.greenCloud — the livewire1 torpedo's afterglow
  /** ExplosionEffect with a style (`sides` into EXPLOSION_STYLES): livewire3's
   *  plasma missile and the boss missile's burst */
  Explosion = 55,
  ShootBig2 = 56, // Fx.shootBig2 — the big artillery's muzzle
  HitEmpSpark = 57, // Fx.hitEmpSpark — the emp cannon's muzzle spray
  ShootHeal = 58, // Fx.shootHeal — a heal-coloured shootSmall
  /** THIS GAME'S OWN, and the one bullet effect with no Mindustry entry
   *  behind it: the flood a bursting water shell throws out. Fx.hitLiquid
   *  is five droplets at a fixed handspan, which is the right size for an
   *  orb landing on one body and useless for a shell that soaks a whole
   *  stretch of lane — the player has to be able to SEE which bodies got
   *  wet. So this one carries the blast's reach in `len` and floods out to
   *  exactly it. (See Sim.updateProjectiles, where the splash branch hands
   *  it splashRadius and every other hit effect keeps its own scale.) */
  WaterBurst = 59,
  /** THE ROT, and the venom line's whole signature (weapons.ts, the Venom
   *  spitters): a purple mote lifting off a poisoned STRUCTURE, the
   *  burning flicker's counterpart on the other side of the field. Burning
   *  is a status a body carries; this is one a building carries, so it is
   *  pushed by the tower loop (Sim.updateTowers) and never by updateStatus. */
  Poison = 60,
  /** THE SKY GUNSHIPS' WHOLE LOOK (weapons.ts, fx "scatter"): a shotgun
   *  blast out of the muzzle — a fan of hot streaks thrown the cone's
   *  width (`sides`, in degrees) and out to the gun's reach (`len`), gone
   *  in a fifth of a second. Nothing crosses the field: the blast IS the
   *  shot, and the pellets that struck are read off the sparks on what
   *  they hit. Every gunship fires this and nothing else does */
  Scatter = 61,
  /** A SHORTED TURRET (Tower.shortT, the Aegis tanks' EMP): a cyan spark
   *  jumping off a building whose gun is out. The rot's mote is the same
   *  idea in purple; this one is a bar, because a short is electrical */
  ShortSpark = 62,
  /** A BLINK (levels.ts blink): the streak a wraith leaves between where
   *  it was hit and where it landed — `rot` and `len` are the jump */
  Blink = 63,
  /** THE NUKE (levels.ts payload.fuse): the flash that fills the whole
   *  blast radius (`len`), white into orange, with the ring on its rim */
  NukeBurst = 64,
  Cleave = 65, // the cleaver's slash: a thick crescent swept out through its cone
  Torch = 66, // the torch's tongue: a fat round jet, the whole visible weapon
}

/** an r,g,b triple in 0..1, the form every draw call wants */
export type RGB = readonly [number, number, number];

/**
 * The shape of one effect AS THE DRAW HELPERS READ IT. The sim no longer
 * stores effects as objects of this shape — they live in flat typed arrays
 * on Sim (fxX/fxY/fxAge/..., see the pool there), because a cleaver-heavy
 * board pushes thousands a second and an object per push was steady GC
 * pressure. The renderer refills one reused view of this shape per effect
 * per frame, so every field's meaning below is unchanged.
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
