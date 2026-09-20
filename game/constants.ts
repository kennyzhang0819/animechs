import { FxKind, type RGB, type TowerKind } from "./types";

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

/**
 * THE BROAD PHASE'S CELL, in world px, and the grid it makes (Sim.buildHash).
 *
 * It lives here rather than in sim.ts because a PLACEMENT reads the same
 * hash — "is there a body standing under this footprint" is a window query
 * over it (board.ts) — and the placement test has to be answerable from the
 * side the sim is not on.
 *
 * 32px (1.6 cells) puts the common span at 96px; the rare wide units take a
 * larger span, which is what the span machinery is for. Must divide W and H
 * evenly.
 */
export const HC = 32;
export const HCOLS = (W / HC) | 0;
export const HROWS = (H / HC) | 0;
export const HN = HCOLS * HROWS;

export const INF = 1e9;

/**
 * THE MOST BODIES THE FIELD HOLDS AT ONCE. The script sends waves of
 * several thousand — its heaviest is 7,500 — and a swarm mutator (Mitosis)
 * multiplies them, so the ceiling is where the campaign wants it: every
 * per-unit array and the renderer's dynamic batch are sized by it.
 */
export const MAX_UNITS = 22000;
// Ironhide1 at true Mindustry scale: 1-tile hitbox, art overhanging 1.5x
// (48px art on a 32px tile)
export const UR = 10;
// wall-clearance radius (px): strictly under CELL/2, so a 1-tile corridor
// leaves a (CELL - 2*WALL_R)px window a unit can actually thread. UR stays
// the unit-vs-unit and projectile-hit radius
export const WALL_R = 7;
export const UNIT_SPRITE = 40;
// official ironhide1 stats: 150 hp, speed 0.5 px/tick = 3.75 tiles/s
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
  piercerLaser: pal(0xa9d8ff),
  /** Tether's mint, the one hue no stock turret wears (turretArt.ts, the
   *  "field" accent). The dish has always been drawn in it; now the shot
   *  is too, so the gun and the light it throws are the same colour */
  tetherBeam: pal(0x8fe0b8),
  accent: pal(0xffd37f),
  missileYellow: pal(0xffd2ae),
  missileYellowBack: pal(0xe58956),
  blastAmmoFront: pal(0xeeab89),
  blastAmmoBack: pal(0xe9665b),
  plastaniumFront: pal(0xfffac6),
  plastaniumBack: pal(0xd8d97f),
  orangeSpark: pal(0xd2b29c),
  furnaceHit: pal(0xffb98b),
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
  /** Pal.heal — the support line's whole palette: starhart1's bolts, starhart2's
   *  arcs, starhart3's and starhart5's beams, the naval support's plasma */
  heal: pal(0x98ffa9),
  /** the dartback1 line's purple: Pal.sap is the light, sapBullet the
   *  beam and shell face, sapBulletBack the shell rim and the blast sparks */
  sap: pal(0x665c9f),
  sapBullet: pal(0xbf92f9),
  sapBulletBack: pal(0x6d56bf),
  /** Pal.suppress — Pal.sap x 1.6, the boss missile's spark */
  suppress: pal(0xa393fe),
  /** Pal.unitFront / unitBack — stoop3's missiles */
  unitFront: pal(0xffa665),
  unitBack: pal(0xd06b53),
  surge: pal(0xf3e979),
  /** Liquids.slag.color — what a dartback2 spits */
  slag: pal(0xffa166),
  /**
   * THE TOXIN LINE'S GREEN (turretArt.ts, the "toxin" accent): the gas,
   * the cloud and every mote the four poison guns throw.
   *
   * IT IS NOT THE VENOM SPITTERS' ACID, and the distance is the point —
   * the swarm's `venom` below is a chartreuse, this is a mid green with
   * the yellow taken out of it. The family palette's rule is that no
   * family wears a colour of the board's; the same rule read the other
   * way is why this pair is not that one, on a field where both sides
   * are now laying rot.
   */
  toxinFront: pal(0x7cd64a),
  toxinBack: pal(0x3d7a2e),
  // ---- THE FAMILY PALETTE, this game's own ----------------------------
  //
  // ONE HUE A FAMILY, and it is worn everywhere the family shows: the
  // highlight on its hulls (the `-cell` region and the engine flames,
  // levels.ts FAMILY_ACCENT), its shots, its motes and its rings, and the
  // symbol of every status it lays. A player reads a family off the colour
  // before they read the sprite. NONE OF THEM IS A MINDUSTRY AMMO COLOUR:
  // the yellows, the heal green, the sap purple and the missile orange stay
  // the turrets' and the boss's, so the swarm's colours are never the
  // board's.
  //
  // Each is a pair — the bright face a round is drawn in and the dark rim
  // behind it — and six hues spread round the wheel so no two families
  // sit next to each other: crimson, acid, star-gold, magenta, teal,
  // violet. The seventh, the Tuskers' ivory, is the one that is not a hue
  // at all; its note below says why.
  /** Ground mechs: crimson — the wall that walks */
  mech: pal(0xff4d6d),
  mechDark: pal(0x8c1c3a),
  /** Venom spitters: acid — the orb, the rot's mote, the haste ring */
  venom: pal(0xd4ff3a),
  venomDark: pal(0x5c8a12),
  /** Starlight mechs: star-gold — every laser on the tree */
  star: pal(0xfff0a8),
  starDark: pal(0xf0b840),
  /** Skyfall bombers: magenta — the charges, the nuke, the jam */
  bomber: pal(0xff5fd6),
  bomberDark: pal(0x8f2280),
  /** Harpoon fleet: teal — the rails, the spotter's and the drill's rings */
  harpoon: pal(0x4dffe0),
  harpoonDark: pal(0x0f8a78),
  /** Wraith fleet: violet — the arcs, a short's sparks, a blink, a cloak */
  wraith: pal(0xb48cff),
  wraithDark: pal(0x5a35b8),
  /**
   * Tuskers: IVORY — the tusks, the maul that lands on a turret, the dust
   * a rend takes off it.
   *
   * IT IS THE ONE FAMILY THAT IS NOT A HUE. Six hues are already spread
   * round the wheel above and the seat left between any two of them is
   * somewhere the turrets already sit — the missile orange, the piercer
   * blue, the heal green — and the rule over this table is that a family
   * colour is never one of the board's. So the seventh reads by
   * SATURATION instead: a bone white on a slate body, which is the one
   * thing no gun on the field and no other body in the swarm wears. It is
   * also simply what an elephant's tusks are.
   */
  tusk: pal(0xfff3de),
  /**
   * THE EIGHTH FAMILY'S: copper, for the Grapnels (levels.ts, the
   * starfish). The hue nothing else on the board carries — the swarm owns
   * rose, lime, gold, magenta, teal, violet and bone, and the turrets own
   * orange at the muzzle, so a warm metal that is neither the sky's
   * orange nor the ground mechs' rose is what is left. It is the drum on
   * the body's back, the star it fires, and the five lit arm tips on the
   * apex.
   */
  hook: pal(0xe59a55),
  /** ...and its shade, the star's back sprite under the front one */
  hookDark: pal(0xa35a2a),
  /**
   * THE NINTH FAMILY'S: carrion rust, for the Kettles (levels.ts, the
   * vulture) — the crop at the breast, the pods under the wings, and
   * every round they fire.
   *
   * IT IS THE ONE PAIR ON THIS TABLE THAT BREAKS THE RULE OVER IT, and
   * knowingly. What is actually free on the wheel for a ninth line is the
   * cold end — a frost or a near-black — and this is a red-brown that
   * sits between the ground mechs' rose and the Grapnels' copper, nearer
   * the copper than any other two here are to each other. It stayed
   * because it is what a full crop looks like and the drawing is the
   * thing that was picked (game/kettleArt.ts). What keeps it survivable
   * is the LAYER: a Grapnel crawls and a Kettle flies, so the two are
   * never side by side on the same ground. If the field says otherwise
   * the fix is this pair and the CROP material beside it, and nothing
   * else moves.
   */
  carrion: pal(0xc06a3e),
  carrionDark: pal(0x7a3420),
  tuskDark: pal(0x8a7a5e),
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
   *  "missile" — the sprite name a BasicBulletType is constructed with —
   *  or "canister", the toxin line's, which is ours and drawn at pack
   *  time (atlas.ts canisterBullet) */
  region: "bullet" | "shell" | "missile" | "canister";
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

/**
 * WHAT A SOAKED BODY IS WORTH TO AN ELECTRIC SHOT — the multiplier on the
 * hit, and the one reason the liquid turrets sit on a board next to the
 * blue line.
 *
 * WATER CONDUCTS. A douser and a deluge do almost no damage of their
 * own (their trivial contact numbers are honest about that) and buy a
 * deep slow instead; what this adds is a second thing to do with the
 * soak, and it is a thing only another turret can cash. Neither half is
 * worth much alone and the pair is worth double, which is the shape a
 * combo is supposed to have.
 *
 * IT IS ON THE RAW HIT, before plating — for TITAN ROUNDS' reason
 * (Sim.damageUnit): a conducting body is the SHOT landing harder, not the
 * plate mattering less, so the armour still shaves the bigger number.
 */
export const WET_SHOCK_MUL = 2;

/**
 * THE TURRETS WHOSE SHOT IS NOT A ROUND — fire, bolts, beams, rays and
 * rails, everything the roster fields that is not a projectile with a
 * body.
 *
 * WHAT IT DECIDES: a CLOAK stops bullets and nothing else. The Wraith
 * fleet's top three go dark on a cycle (levels.ts cloak) and used to be
 * untouchable by the whole board while they were — which made the answer
 * to a cloak "wait", and waiting is not an answer. These seven still
 * reach a hull that has gone dark, both to aim at it (Sim.bestTarget) and
 * to hurt it (Sim.damageUnit). So a cloak is now a question the board can
 * be built to answer rather than a window in which nothing happens.
 *
 * IT IS A ROSTER FACT AND NOT A DERIVED ONE. Six of the seven could be
 * read off their ammo — a `ray`, a `laser`, a `rail`, a `lightning`, a
 * `continuous`, a `lock` — but TORCH could not: its flame is a
 * short-lived spriteless PROJECTILE in the sim, exactly as it is
 * upstream, and no field on it says "this is fire and not a bullet". A
 * list is honest about being a judgement; a clever predicate over the
 * ammo would have been the same judgement, hidden, and wrong about the
 * flamethrower.
 */
export const NON_BULLET_KINDS: readonly import("./types").TowerKind[] = [
  "torch", // the flame
  "cleaver", // the shrapnel ray
  "coil", // the bolt
  "piercer", // the beam
  "tether", // the held lock
  "furnace", // the continuous laser
  "railhead", // the rail
];

const NON_BULLET = new Set<import("./types").TowerKind>(NON_BULLET_KINDS);

/** does this turret fire ROUNDS — the kind of shot a cloak stops? */
export const firesBullets = (kind: import("./types").TowerKind): boolean =>
  !NON_BULLET.has(kind);

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
  // fire STACKS added per hit, not seconds — see docs/elements.md
  burn?: number;
  // poison damage a second added per hit; stacks add and never cap
  poison?: number;
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
  // (the other is tether's spool, below). Upstream
  // a water shot knocks its victim back and wets it for a 0.94x speed
  // multiplier — a garnish on a turret whose real jobs (extinguishing
  // fires, cooling reactors) do not exist here. Here the wet status IS the
  // liquid turrets' weapon: no knockback at all, and the slow is deep.
  // `slow` is the drive-speed multiplier while wet; `duration` is
  // Mindustry's statusDuration in seconds, and reapplying resets the clock
  // rather than stacking — one status entry per unit, strongest slow in
  // force (see Sim.applyWet). Wet and burning are opposites(): each lands
  // on the other as a quench/dry rather than taking hold
  wet?: { duration: number; slow: number; soak: number };
  // ELECTRIC (status.ts "electric"): this shot conducts. It is a FLAG and
  // not a duration, because there is nothing to time — an electric shot
  // leaves no mark of its own on the body it hits.
  //
  // WHAT IT BUYS IS PAID ON A SOAKED BODY (WET_SHOCK_MUL): water
  // conducts, so an electric hit on a wet one is worth double. That is
  // the whole of the mechanic, and it is a combo between TWO turrets
  // rather than a property of one — a douser or a deluge lays the water,
  // a coil or a piercer collects on it.
  //
  // It used to be `shock: SHOCK_SECONDS`, which laid a "shocked" status
  // on the body for three seconds. That status did nothing: it was a
  // second symbol on the panel, a second clock in the sim and a second
  // parameter threaded through every damage path, all to say what this
  // one boolean says. The pairing is legible from the water alone —
  // a soaked body is the one the blue line wants.
  electric?: boolean;
  // LiquidBulletType.orbSize: the shot is not an atlas sprite but a filled
  // disc of the liquid's own colour at this radius in px —
  // Fill.circle(b.x, b.y, orbSize), drawn in fxColor
  orb?: number;
  // Mindustry fragBullet/fragBullets (BulletType.createFrags): where this
  // shot dies it throws `count` children, each on a random bearing within
  // half of `spread` of the parent's heading and at a random fraction of
  // the child's own full speed. No ammo in the game names it today —
  // whirl, the one that did, carries a wider blast instead
  // THE SECOND AMMO IN THE MAGAZINE. It is loaded one of two ways, and a
  // turret that names an `alt` has to say which (checked at import below):
  // BY BARREL, where a gun with `barrels` throws from its mounts in turn
  // (ShootAlternate, Sim.fireShot) and the ODD mount loads it — deluge's
  // volley leaves one nozzle as water and the other as fire; or BY ROLL
  // (TowerStats.altChance), where every shot is a fresh chance at the
  // second round — airburst's incendiary shell. It is a WHOLE BulletStats
  // and not a patch, because the two rounds are two shots — their own
  // burst radius, their own status, their own colour and effects — and a
  // diff would have to name every field anyway.
  //
  // IT IS RESOLVED WHERE `frag` IS (bulletOf, Sim.bulletFor) and written
  // onto the projectile as one more flag (projs.ts PROJ_ALT), so a ball in
  // the air answers for its own stats and the renderer draws the ammo
  // that was actually fired. Alt first, then frag: a fragment of the
  // fire ball is the FIRE ball's child.
  alt?: BulletStats;
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
  // A DRIFTING CLOUD (Sim.updateProjectiles): the shot collides with
  // nothing and never lands. It flies its whole lifetime and PULSES every
  // `interval`, poisoning and chipping everything within `radius` of
  // wherever it has got to — so what it covers is the line it walks
  // rather than the point it dies on. Drifter's, and nothing else's
  cloud?: {
    radius: number; // px the pulse reaches
    interval: number; // s between pulses
    poison: number; // poison a second added to every body in one pulse
  };
  // BasicBulletType.draw: the shot itself. A bullet with no sprite draws
  // nothing at all — a laser, a bolt, a hitscan ray and torch's flame
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
  // hitFx2 is Mindustry's MultiEffect: barrage lays a shockwave over its
  // blast
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
  | FxKind.PiercerShoot
  | FxKind.PiercerCharge
  | FxKind.HitPiercer
  | FxKind.BlastExplosion
  | FxKind.PlasticExplosion
  | FxKind.InstShoot
  | FxKind.InstHit
  | FxKind.InstTrail
  | FxKind.InstBomb
  | FxKind.RailHit
  | FxKind.SmokeCloud
  | FxKind.HitFurnace
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
  [FxKind.PiercerShoot]: 21 / TICK,
  // MultiEffect(piercerLaserCharge 38, piercerLaserChargeBegin 60): the pair
  // always fires together, so one entity draws both and the shorter of the
  // two simply stops early. The longer lifetime is the entity's
  [FxKind.PiercerCharge]: 60 / TICK,
  [FxKind.HitPiercer]: 12 / TICK,
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
  [FxKind.HitFurnace]: 12 / TICK,
  [FxKind.SmokeBig2]: 18 / TICK,
  [FxKind.ShootLiquid]: 15 / TICK,
  [FxKind.HitLiquid]: 16 / TICK,
  // no Mindustry entry to copy: a shell's worth of water wants longer on
  // screen than an orb's 16 ticks, because its whole job is to show the
  // player a radius rather than a point of contact
  [FxKind.WaterBurst]: 26 / TICK,
};
/** Fx.piercerLaserCharge's own 38 ticks, inside PiercerCharge's 60 */
export const PIERCER_CHARGE_SPARK = 38 / 60;

export interface TowerStats {
  name: string;
  size: number; // footprint in tiles (size x size)
  /**
   * THE POOL, BEFORE TOWER_HP_SCALE — written on the row, one turret at a
   * time, so a turret's toughness is tweaked where the rest of it lives
   * and nowhere else.
   *
   * THE NUMBERS ARE NOT UPSTREAM'S ANY MORE, and they are not arbitrary
   * either: they are banded by footprint, because a footprint is a tier
   * is a rarity (rarity.ts) and the border on the card has to promise
   * something the field can show. The bands are 300 / 900 / 2,400 /
   * 6,000, and no turret in one may reach the one above it — a 3x3 that
   * shrugs off what kills a 4x4 makes the card's colour a lie.
   *
   * INSIDE a band they sit within a sixth either way, because choosing
   * between two commons is choosing a gun and never choosing how long
   * the thing lives. Where a turret sits in that sixth is its RANGE,
   * inverted: a short reach is planted in the swarm's path and takes the
   * bite for as long as it works, a long one is picked off only by what
   * got past everything else. Torch leads the commons, tether trails the
   * uncommons, railhead sits at the floor of the ultras.
   *
   * So: move one freely, and keep it inside its band.
   */
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
  // scaled. A barrage aimed inside 50 units still shoots — the shell just
  // overflies the target rather than landing shorter than this
  minRange?: number;
  // Mindustry shoot.firstShotDelay, in seconds: the volley is queued, then
  // held this long before the shot leaves. Piercer also sets
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
  // the odds that any one shot loads `bullet.alt` instead of the turret's
  // own round, for a gun whose second ammo is a roll rather than a mount
  altChance?: number;
  // Mindustry Turret.unitSort. Unset is UnitSorts.closest — every turret
  // bar one. `strongest` is railhead's: the HIGHEST CURRENT HEALTH in
  // range, ties broken by distance, because a 1350-damage shot spent on
  // whichever ironhide1 wandered nearest is three and a third seconds of
  // reload thrown away. (Mindustry sorts on maxHealth with a blended
  // distance term; current health strict is a deliberate deviation — it
  // walks off a target other turrets have nearly finished instead of
  // overkilling it.)
  sort?: "strongest";
  // A SUPPORT BLOCK'S PULSE instead of a gun (Sim.updateFixer): every
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
 * fixer honestly does zero damage.
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
 * on the swarm's own ladder: a 2x2 wears an ironhide2's plate (4), a 3x3 a
 * ironhide3's (9), a 4x4 a shade under an ironhide4's (15), and a 1x1 wears
 * nothing, the way an ironhide1 wears nothing.
 *
 * WHAT THAT DOES, because armour is a flat shave PER HIT and the swarm's
 * bite is authored per hit too (weapons.ts): an ironhide1's 9 is halved on a
 * 2x2 and floored on anything bigger, an ironhide3 shell's 20 is cut to a
 * quarter on a 4x4, and an ironhide5's 80 loses a fifth. Small arms bounce off
 * big guns and the heavies still chew through them, which is exactly the
 * relationship the swarm's own armour already has with the turrets'
 * bullets. It is deliberately NOT a fraction of the pool: the pool is
 * ten times the block health (TOWER_HP_SCALE) and this is not, so the two
 * dials are two dials.
 */
export const TOWER_ARMOR_BY_SIZE: readonly number[] = [0, 0, 4, 9, 15];

/**
 * ONE HIDDEN CLASS FOR EVERY BULLET, AND ONE FOR EVERY TURRET.
 *
 * WHY. V8 gives an object literal a hidden class from the keys it was
 * written with, and every ammo below is written with a different set of
 * optional keys — hive has `homing`, whirl has `flak`, torch
 * has none of the sprite fields. A property read like `b.splash` in the
 * sim's hot loops is fast while it has met at most four classes; past that
 * it is a hash lookup on every read. Measured on the turret clocks
 * (scripts/check.mjs, ten thousand of one kind): the whirl pass cost 10ms
 * with only whirl's own ammo seen, and 13.8ms in a process that had
 * stepped a mixed board first — the same code, the same shots, a third
 * slower because the stats reads had gone megamorphic. A real board is
 * always the mixed one.
 *
 * SO EVERY STATS OBJECT IS REBUILT WITH EVERY KEY, in one fixed order,
 * absent ones as undefined (normalizeBullet, normalizeTower), and the
 * table the game reads (TOWERS) holds only those. A read of an absent key
 * is undefined either way; the code never asks `"homing" in b`. Spreads
 * downstream (`{ ...b, damage }` in upgrades.ts, mods.ts, relics.ts) keep
 * the shape: a clone of one class with an existing key overwritten is the
 * same class. Written as LITERALS rather than a key loop on purpose — V8
 * turns an object that gains more than a dozen properties through keyed
 * stores into a dictionary, which would be the very thing this prevents.
 * `Full<T>` is the exhaustiveness check: a field added to the interface and
 * not to the literal is a type error here, not a silently dropped stat.
 */
// (`keyof T & string` keeps the mapped type non-homomorphic, so an optional
// field is required HERE — the exhaustiveness — while its value may still be
// undefined; a plain `-?` would strip the undefined and refuse the absent ones)
type Full<T> = { [K in keyof T & string]: T[K] };

export function normalizeBullet(b: BulletStats): BulletStats {
  const out: Full<BulletStats> = {
    speed: b.speed,
    damage: b.damage,
    lifetime: b.lifetime,
    splash: b.splash,
    splashRadius: b.splashRadius,
    collidesAir: b.collidesAir,
    collidesGround: b.collidesGround,
    flak: b.flak,
    ray: b.ray,
    artillery: b.artillery,
    pierce: b.pierce,
    hitRadius: b.hitRadius,
    burn: b.burn,
    poison: b.poison,
    laser: b.laser,
    lightning: b.lightning,
    lock: b.lock,
    armorMultiplier: b.armorMultiplier,
    pierceArmor: b.pierceArmor,
    lifeScaleRand: b.lifeScaleRand,
    homing: b.homing,
    pierceCap: b.pierceCap,
    knockback: b.knockback,
    wet: b.wet,
    electric: b.electric,
    orb: b.orb,
    alt: b.alt ? normalizeBullet(b.alt) : undefined,
    frag: b.frag ? { ...b.frag, bullet: normalizeBullet(b.frag.bullet) } : undefined,
    rail: b.rail,
    continuous: b.continuous,
    cloud: b.cloud,
    sprite: b.sprite,
    trail: b.trail,
    puff: b.puff,
    shootFx: b.shootFx,
    smokeFx: b.smokeFx,
    hitFx: b.hitFx,
    hitFx2: b.hitFx2,
    despawnFx: b.despawnFx,
    pierceFx: b.pierceFx,
    pointFx: b.pointFx,
    chargeFx: b.chargeFx,
    fxColor: b.fxColor,
  };
  return out;
}

export function normalizeTower(s: TowerStats): TowerStats {
  const out: Full<TowerStats> = {
    name: s.name,
    size: s.size,
    health: s.health,
    armor: s.armor,
    range: s.range,
    reload: s.reload,
    shots: s.shots,
    shotDelay: s.shotDelay,
    spread: s.spread,
    inaccuracy: s.inaccuracy,
    shootCone: s.shootCone,
    rotateSpeed: s.rotateSpeed,
    targetAir: s.targetAir,
    targetGround: s.targetGround,
    shootY: s.shootY,
    minRange: s.minRange,
    chargeTime: s.chargeTime,
    velocityRnd: s.velocityRnd,
    lifeScaleOffset: s.lifeScaleOffset,
    barrels: s.barrels,
    altChance: s.altChance,
    sort: s.sort,
    heal: s.heal,
    bullet: normalizeBullet(s.bullet),
  };
  return out;
}

/** the roster as written — see TOWERS below for the one the game reads */
const RAW_TOWERS: Record<import("./types").TowerKind, TowerStats> = {
  // Tacker, 1:1 from mindustry/content/Blocks.java with copper ammo
  // (BasicBulletType(2.5, 9)): one shot every 20 ticks, alternating between
  // twin barrels 3.5 units apart (ShootAlternate)
  tacker: {
    name: "Tacker",
    size: 1,
    health: 280, // common band (300), mid: 50 tiles
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
  // Lobber, 1:1 from mindustry/content/Blocks.java with graphite ammo
  // (ArtilleryBulletType(3, 20)): a slow arcing shell every 60 ticks that
  // ignores everything in flight and blasts 33 splash where it lands.
  // Artillery can't touch the air — ground targets only
  lobber: {
    name: "Lobber",
    size: 1,
    health: 250, // common band, the longest reach of the four
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
  // Autocannon, 1:1 from mindustry/content/Blocks.java with thorium ammo
  // (BasicBulletType(4, 28)): 4-shot bursts 3 ticks apart, every 29 ticks
  autocannon: {
    name: "Autocannon",
    size: 2,
    health: 930, // uncommon band
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
        along: 13 * MU, // half again as long as tacker's copper pellet
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
  // Airburst, from mindustry/content/Blocks.java with lead ammo
  // (FlakBulletType(4.2, 3), splash 27*1.5 in a 15-unit radius).
  //
  // TWO deliberate breaks from upstream. The first: our airburst is not
  // anti-air only. Upstream's flak waits for flyers, and a turret that idles
  // through every ground wave is a turret nobody buys — so its shells fuse
  // over the ground swarm too. That doubles the board it covers, and the shell pays
  // for it: the lead flak's 3/40.5 goes to 2/13.5, a third of the blast it
  // carried when it only ever saw the air. A tier-1 common at 180 scrap
  // should not out-damage a 900-scrap autocannon on both layers at once.
  // The second is the incendiary shell it now rolls for — see the `alt`
  // below, and docs/elements.md for what fire is worth.
  airburst: {
    name: "Airburst",
    size: 2,
    health: 870, // uncommon band
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
    targetGround: true,
    bullet: {
      speed: 4.2 * TICK * MU,
      damage: 2,
      lifetime: (220 + 2 + 10) / 4.2 / TICK, // limitRange(2) + base 10-unit margin
      splash: 27 * 0.5,
      splashRadius: 15 * MU,
      collidesAir: true,
      collidesGround: true,
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
      // THE INCENDIARY SHELL (BulletStats.alt, rolled at `altChance`): the
      // same lead flak wearing pyratite's colours, and the only number
      // that differs is the fire. A blast carries a status (Sim.splash),
      // so one shell lights the whole crowd it burst over — which is why
      // it is a ROLL and not every round: at two shells a volley six
      // times a second an always-incendiary airburst would hold anything
      // it could see at the stack cap, for 180 scrap.
      alt: {
        speed: 4.2 * TICK * MU,
        damage: 2,
        lifetime: (220 + 2 + 10) / 4.2 / TICK,
        splash: 27 * 0.5,
        splashRadius: 15 * MU,
        collidesAir: true,
        collidesGround: true,
        burn: 1,
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
          back: PAL.lightOrange,
          front: PAL.lighterOrange,
        },
        shootFx: FxKind.ShootSmall,
        smokeFx: FxKind.SmokeSmall,
        hitFx: FxKind.Flak,
        hitFx2: FxKind.FlameHit,
        despawnFx: FxKind.BulletHit,
        fxColor: PAL.lightOrange,
      },
    },
    // one shell in five is the incendiary one: enough that a stream of
    // flak keeps a crowd alight, short of torch's, which is the gun whose
    // whole job is fire
    altChance: 0.2,
  },
  // Cleaver, 1:1 from mindustry/content/Blocks.java with thorium ammo
  // (ShrapnelBulletType, damage 105): three instant piercing rays fired as
  // a ShootSpread(3, 20deg) fan, 3 shots / 0.583s = the official 5.14/sec.
  cleaver: {
    name: "Cleaver",
    size: 3,
    health: 2800, // rare band (2,400) ceiling — 28 tiles
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
      hitFx: FxKind.HitPiercer, // ShrapnelBulletType's own
      fxColor: PAL.thoriumPink,
    },
  },
  // Torch, 1:1 from mindustry/content/Blocks.java with coal ammo
  // (BulletType(3.35, 17)): a flamethrower. It fires every 6 ticks — ten
  // times a second — and the "bullet" is a plain BulletType, which in the
  // original draws NOTHING. The flame you see is the shoot effect
  // (Fx.shootSmallFlame) painted at the muzzle; the shot itself is an
  // invisible piercing dart that rakes the whole file of units in front of
  // it and sets each alight. 60 units of range makes it the shortest-
  // ranged turret in the game, and it cannot touch the air at all
  torch: {
    name: "Torch",
    size: 1,
    health: 350, // common band ceiling — 19 tiles, planted in the swarm
    armor: 0,
    range: 60 * MU,
    reload: 6 / TICK,
    shots: 1,
    shotDelay: 0,
    spread: 0,
    inaccuracy: 0, // Turret default — torch never overrides it
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
      burn: 2,
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

  // Coil, 1:1 from mindustry/content/Blocks.java (a PowerTurret, so its
  // one shootType is the whole armament): a LightningBulletType at 20
  // damage and lightningLength 25. The bolt is not a shot — it walks twelve
  // nodes out from the muzzle, damaging what each lands on and chaining to
  // the furthest enemy within reach of it, which is why coil's reach in
  // a crowd is far longer than the 90 units it targets from. Ground only.
  coil: {
    name: "Coil",
    size: 1,
    health: 320, // common band, short reach
    armor: 0,
    range: 90 * MU,
    reload: 35 / TICK,
    shots: 1,
    shotDelay: 0,
    spread: 0,
    inaccuracy: 0, // Turret default — coil never overrides it
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
      electric: true, // the blue line conducts (BulletStats.electric)
      // the turret names Fx.lightningShoot but leaves smokeEffect alone,
      // so BulletType's stock puff comes along with the sparks
      shootFx: FxKind.SparkShoot,
      smokeFx: FxKind.SmokeSmall,
      hitFx: FxKind.HitPiercer, // every node's own bullet lands one
      fxColor: PAL.piercerLaser,
    },
  },
  // Piercer, 1:1 from mindustry/content/Blocks.java: a LaserBulletType(140)
  // 173 units long that pierces FOUR units and stops. shoot.firstShotDelay
  // 40 makes it charge for two thirds of a second before it fires, and
  // moveWhileCharging false locks the barrel for that whole charge — a
  // piercer commits to where it was aiming, not where the target went.
  //
  // armorMultiplier 4 is the catch: armour counts quadruple against it, so
  // the 140 that guts an ironhide1 is 104 against an ironhide3. Ground only.
  piercer: {
    name: "Piercer",
    size: 2,
    health: 990, // uncommon band
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
      electric: true, // the blue line conducts (BulletStats.electric)
      // the turret names Fx.piercerLaserShoot and sets smokeEffect to none:
      // a piercer fires clean, with two blue wings and no powder at all
      shootFx: FxKind.PiercerShoot,
      chargeFx: FxKind.PiercerCharge,
      hitFx: FxKind.HitPiercer,
      fxColor: PAL.piercerLaser,
    },
  },
  // Barrage, from mindustry/content/Blocks.java with graphite ammo
  // (ArtilleryBulletType(3, 40), 70 splash): SIX shells every two seconds
  // over 290 units — outreached only by tether's 300 and railhead's 500.
  // The volley scatters on purpose — 11 degrees of inaccuracy, a velocity
  // roll in [0.8, 1] and a lifetime roll in [0.95, 1.08] — so it lands as a
  // pattern across the lane rather than six shells in one hole.
  //
  // THE VOLLEY AND THE BLAST ARE OURS, NOT UPSTREAM'S. Four shells in a
  // 22.5-unit radius is what Mindustry throws; a 3x3 that costs a tier-3
  // card wants to answer a lane rather than a file, so it throws two more
  // and each one opens nearly twice as wide (40 units). The scatter is
  // what makes that a wall of ground rather than a bigger hole.
  //
  // AND THE SHELLS ARE SLOW — half upstream's muzzle velocity, so a volley
  // at full reach is better than three seconds in the air. The lifetime
  // is not touched: scaleLife (Sim.fireShot) stretches it against the
  // bullet's own reach, so a slower shell simply flies longer to the same
  // aim point. What the flight time buys is the weight at the other end,
  // 115 splash a shell: the gun is a commitment to where the lane WILL be
  // rather than an answer to where it is, and a board that reads the lane
  // early is paid for it.
  barrage: {
    name: "Barrage",
    size: 3,
    health: 2000, // rare band floor — 91 tiles
    armor: 9,
    range: 290 * MU,
    minRange: 50 * MU,
    reload: 120 / TICK,
    shots: 6,
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
      speed: 1.5 * TICK * MU, // half upstream's 3 — the shells are slow
      damage: 40, // never lands directly — an artillery shell arcs over
      lifetime: 80 / TICK,
      splash: 115,
      splashRadius: 53 * 0.75 * MU, // ~40 units, over upstream's 22.5
      collidesAir: false,
      collidesGround: true,
      artillery: true,
      lifeScaleRand: [0.95, 1.08],
      sprite: {
        region: "shell",
        across: 12 * MU,
        along: 14 * MU, // longer than lobber's, and not round
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
      // a white ring running out of it — what tells a barrage's landing
      // apart from a lobber's
      hitFx: FxKind.Flak,
      hitFx2: FxKind.Shockwave,
      despawnFx: FxKind.BulletHit,
      fxColor: PAL.graphiteAmmoBack,
    },
  },
  // Douser — THE FIRST OF THE TWO TURRETS (deluge is the other) WHOSE
  // WEAPON IS NOT MINDUSTRY'S. Upstream's wave is a hose: twenty tiny orbs
  // a second, each soaking the single body it touches. That reads as a
  // stream of dots and pins exactly one enemy at a time, so the block that
  // is supposed to be the board's crowd-control answer only ever answered
  // the unit at the front of the file.
  //
  // Here it throws ONE heavy ball of water that bursts on contact and
  // soaks everything inside the burst. The block, its footprint, its
  // health, its range and its 50-degree cone are still upstream's; what
  // changed is the ammunition, and with it the whole shape of what the
  // turret does — a shot answers a GROUP, not a body.
  //
  // The numbers that follow from that:
  //  - reload 45 ticks. One ball every 0.75 s where the hose threw fifteen
  //    in that time. The soak lasts 2 s, so a single douser still holds a
  //    patch of lane wet with uptime to spare.
  //  - splash 10 over a 30-unit radius — near four tiles of reach, so the
  //    burst is better than seven tiles across. It USED TO BE 1, which is
  //    not a number, and a turret that soaked a crowd and left the bank
  //    untouched read as a debuff with a price tag rather than a gun. Ten
  //    is a BIT of damage and is meant to stay one: thirteen a second
  //    laid over the whole burst, against lobber's thirty-three into a
  //    third of the area for a third of the price. It chips what it wets
  //    and it still kills nothing on its own — armour shaves it like any
  //    other hit (applyArmor), and ten points shaved is most of ten.
  //    Deluge is the same ball at twenty a piece and six times the rate,
  //    so the pair still reads as one weapon at two scales rather than
  //    one turret at two prices.
  //  - 18 degrees of inaccuracy, where upstream sprays 5. A ball that
  //    lands on the aim point every time is a ball that soaks the same
  //    patch forever; scattering them means consecutive shots cover lane
  //    rather than repaint one puddle, and the burst radius is what makes
  //    the scatter forgiving instead of a miss.
  // Wet units still drive at 65% speed for 2 s, refreshed on every soak.
  douser: {
    name: "Douser",
    size: 2,
    health: 1050, // uncommon band (900) ceiling — 34 tiles
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
      splash: 10,
      splashRadius: 30 * MU,
      collidesAir: true,
      collidesGround: true,
      // the ball is a fat thing, and a fat thing bursts where it touches:
      // the hit radius is the ball's own size rather than BulletType's
      // default 4, so the burst centre reads as the ball's centre
      hitRadius: 5 * MU,
      wet: { duration: 2, slow: 0.65, soak: 14 },
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
  // Tether, and THE ROSTER'S OTHER DELIBERATE DEVIATION (the first is
  // the liquid turrets' soak, see `wet`). Mindustry's tether is a
  // TractorBeamTurret: it holds a beam on one FLYER, deals 30
  // armour-piercing damage a second and DRAGS it backwards. Neither half
  // survives here. The drag is a lovely thing in a game where flyers steer
  // themselves and a menace in one where they walk a flow field — it
  // shoves the swarm off the lane the whole board was built around. And
  // the HELD BEAM, which this turret did keep for a long time, was a line
  // drawn across the map every frame it was alive: two tethers on a board
  // and the lane disappeared under white cable that never stopped moving.
  //
  // So the beam is now a SHOT. One mint lance, every 4.5 seconds, at the
  // highest-health body in reach — and between shots the turret draws
  // nothing at all but the dish tracking its mark.
  //
  // WHAT MAKES IT ANTI-HEAVY IS NOW THE SHAPE OF THE SHOT, not a ramp.
  // Three things, and none of them is a timer:
  //  - `pierceArmor`: the lance never meets armour, so the 550 lands whole
  //    on the one body plated thickly enough that everything else on the
  //    board is shaving twenty a hit off it.
  //  - `sort: "strongest"`, railhead's pick for railhead's reason: a gun
  //    that fires this rarely cannot spend a shot on whichever dartback1
  //    wandered nearest.
  //  - `pierceCap: 1` and 550 damage on a 4.5-second clock. Against a
  //    crowd that is ONE dead chaff body every 4.5 seconds and five
  //    hundred points thrown into the dirt — the overkill IS the
  //    anti-chaff rule, and it needs no code. Against a heavy it is 122
  //    damage a second through armour, which is what the turret is for.
  //
  // IT IS NOT A RAILHEAD AND MUST NEVER READ AS ONE, and the numbers are
  // picked to keep the two apart at a glance. Railhead spends 1,755 on a
  // QUEUE every 3.3 seconds — 527 a second, through as many bodies as the
  // budget reaches, from 200 units further out. Tether spends 550 on ONE
  // body every 4.5 — 122 a second, and the second body in the line is
  // untouched. It is SLOWER than the railhead as well as smaller, which is
  // the point: under a quarter of the rate at an eighth of the price, and
  // that is the whole of the tier-2 bargain.
  //
  // THE RELOAD IS THE COST AND IT IS MEANT TO HURT, and it is the one
  // number on this turret that has been deliberately walked the WRONG way.
  // 270 ticks with a 4-degree cone and a 4-degree-a-tick yoke: the turret
  // commits to a mark, swings slowly onto it, and a body that dies
  // mid-swing costs the player the whole cycle. At 165 the gun fired often
  // enough to feel like a gun; at 270 every shot is a decision, which is
  // what a siege weapon is supposed to be. Nothing here may be shortened
  // without taking the reload back to where it stops being one.
  tether: {
    name: "Tether",
    size: 2,
    health: 750, // uncommon band floor — 94 tiles
    armor: 4,
    range: 300 * MU,
    reload: 270 / TICK, // 4.5 s — SLOWER than railhead's 3.3, on purpose
    shots: 1,
    shotDelay: 0,
    spread: 0,
    inaccuracy: 0,
    // it commits, nearly as hard as a railhead does: four degrees of cone
    // on a yoke that turns four a tick
    shootCone: (4 * Math.PI) / 180,
    rotateSpeed: ((4 * Math.PI) / 180) * TICK,
    targetAir: true,
    targetGround: true,
    sort: "strongest",
    bullet: {
      speed: 0,
      damage: 550,
      // the damage is instant; this is the lance's FADE, a third of a
      // second so a shot that big is still on screen long enough to read
      lifetime: 20 / TICK,
      splash: 0,
      splashRadius: 0,
      collidesAir: true,
      collidesGround: true,
      pierceArmor: true,
      // ONE body, and the beam stops dead at it (Sim.laserBeam's
      // findPierceLength) — so a lance fired into a crowd visibly ends at
      // the thing it picked instead of running the lane. Length is a
      // touch over the turret's range, as piercer's is over its.
      // `width` is carried for the table's sake only — the drawn width
      // comes off the style (weapons.ts TETHER_LASER), so the two are
      // kept equal rather than allowed to contradict each other
      laser: { length: 310 * MU, pierceCap: 1, width: 9 * MU },
      // a laser fires clean: a spark at the muzzle and no powder at all
      shootFx: FxKind.SparkShoot,
      // Fx.hitPiercer, the white bars every instant beam on the roster
      // lands with — colourless on purpose, so the mint is the LANCE and
      // the impact is just impact
      hitFx: FxKind.HitPiercer,
      fxColor: PAL.tetherBeam,
    },
  },
  // Deluge — douser's weapon at the endgame's scale, and the same
  // departure from upstream for the same reason (see wave above).
  // Mindustry's deluge is a bigger hose; this one is a bigger SHELL.
  // Upstream's knockback 1.7 is still traded for the deeper slow.
  //
  // AND IT HITS, WHICH DOUSER DOES NOT. This used to be douser's splash of
  // 2 at three times the price and a size-3 footprint: a rare that could
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
  //    puddles. The scatter is deliberately wider than douser's: at 190
  //    units of range a tight pair would soak one spot, and a burst this
  //    size can afford to miss by tiles and still catch the whole group.
  //  - splash 26 a ball, so eight balls a second is 208 a second laid
  //    over everything in the burst, air and ground alike. Against
  //    barrage's 140 that reads as more, and it is not: a ball is ARMOUR
  //    SHAVED LIKE ANY OTHER HIT (applyArmor), and twenty-six points
  //    shaved flat eight times a second is what a lobber does to a heavy,
  //    while barrage's seventy lands whole. What deluge has over the
  //    artillery is the area — four times barrage's — and the status
  //    under it. Wave chips at ten a ball and a ball and a third a second
  //    — a twelfth of this rate — so the two never read as the same
  //    turret at two prices: one softens a group, this one kills it.
  //
  // THE TWO NOZZLES THROW DIFFERENT AMMO, and that is the whole shape of
  // the gun now: the even barrel throws WATER and the odd one throws
  // FIRE (BulletStats.alt, loaded in Sim.fireShot). Four of each a
  // second, same weight of splash, and the two statuses answer the two
  // things a wall of bodies can be — the water slows a group so every
  // other gun on the line gets more seconds on it, and the fire takes
  // health off the pool with the plating ignored, which is the half that
  // still works on an armoured hull.
  //
  // THEY QUENCH EACH OTHER WHERE THEY OVERLAP, and that is the roster's
  // rule and not an oversight: burning and wet are opposites
  // (Sim.applyBurn / applyWet), so a body caught by both takes whichever
  // landed last and the other is spent putting it out. It reads as a
  // patchwork rather than a stack BECAUSE OF THE SCATTER — 22 degrees of
  // inaccuracy at 190 range throws the two balls tiles apart, so a
  // volley covers two patches of ground and most bodies stand in one of
  // them. A player who wants the whole crowd soaked still builds a
  // douser; this one is a gun that is also weather.
  // The shot itself is upstream's heavy round — speed 4, lifetime 49 ticks
  // over 190 range — and the soak is upstream's duration (statusDuration
  // 60*4): wet units drive at 45% speed for 4 s, so anything crossing its
  // umbrella spends better than twice as long under every other turret.
  deluge: {
    name: "Deluge",
    size: 3,
    health: 2530, // rare band
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
      damage: 0, // as douser: every point this shot deals is splash
      lifetime: 49 / TICK, // 196 units of flight over a 190 range
      splash: 26,
      splashRadius: 46 * MU,
      collidesAir: true,
      collidesGround: true,
      hitRadius: 6 * MU, // the ball's own size, as wave's
      wet: { duration: 4, slow: 0.45, soak: 36 },
      orb: 6 * MU, // the heavy ball
      shootFx: FxKind.ShootLiquid,
      hitFx: FxKind.WaterBurst,
      hitFx2: FxKind.HitLiquid,
      despawnFx: FxKind.HitLiquid,
      fxColor: PAL.water,
      // THE OTHER NOZZLE (BulletStats.alt): the same ball, lit. Same
      // weight of splash, a slightly tighter burst — fire pools where
      // water spreads — and burning instead of wet, which is 4 s of
      // BURN_DPS taken straight off the pool with the plating ignored.
      // So the fire half answers exactly what the water half cannot: an
      // armoured hull, which shaves nine points off every 26 the flood
      // lands and nothing at all off the burn.
      alt: {
        speed: 4 * TICK * MU,
        damage: 0,
        lifetime: 49 / TICK,
        splash: 26,
        splashRadius: 40 * MU,
        collidesAir: true,
        collidesGround: true,
        hitRadius: 6 * MU,
        burn: 2,
        orb: 6 * MU,
        shootFx: FxKind.Flame,
        // THE FLOOD SHAPE IN FLAME COLOURS, and deliberately not
        // Fx.blastExplosion: WaterBurst is the one hit effect drawn at
        // the blast's REAL reach (Sim's splash branch hands it
        // splashRadius), and a burst this wide has to be visible as the
        // patch it is or the player cannot tell which nozzle covered
        // which ground. Every layer of it takes the colour it is given.
        hitFx: FxKind.WaterBurst,
        hitFx2: FxKind.FlameHit,
        despawnFx: FxKind.FlameHit,
        fxColor: PAL.lightOrange,
      },
    },
  },
  // ---------- THE SUPPORT PAIR ----------------------------------------
  //
  // Fixer and restorer, Mindustry's two block healers, and the only
  // things on the card that never shoot. A gun answers the wave in front of
  // it; these answer the wave AFTER it, by putting a line back together
  // between them — which is why they are worth a slot on a board where
  // nothing repairs and a chewed tacker stays chewed until it falls over.
  //
  // THE PULSE IS OURS, THE REST IS UPSTREAM'S. Mindustry's fixer mends 4%
  // on a 200-tick clock and its projector 15% on 250, both of them fed
  // silicon to do it; here there is no silicon and no logistics to carry
  // it, so a healer that ticks at upstream's rate would be a block that
  // did nothing a player could see. The clocks and the ranges are
  // Mindustry's own; the PERCENTAGES are set to what makes the block worth
  // its price on a full hold — a tenth of a pool a pulse, a fifth for
  // the big one.
  fixer: {
    name: "Fixer",
    size: 1,
    health: 300, // common band, flat: retired, and a heal radius is not a range
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
  // the projector: double the fixer's pulse over better than twice its
  // reach, on a slightly longer clock — one of these behind a line does
  // what four fixers scattered along it would, which is the whole reason
  // to pay a 2x2 footprint and a tier-2 price for a block that fires nothing
  restorer: {
    name: "Restorer",
    size: 2,
    health: 900, // uncommon band, flat: retired (types.ts RETIRED_KINDS)
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
  // Hive, 1:1 from mindustry/content/Blocks.java with blast-compound
  // ammo (MissileBulletType(3.7, 10)): four missiles a volley, five ticks
  // apart, out of three barrels 4 units abreast (ShootBarrel).
  //
  // THE MISSILE IS THE POINT. homingPower 0.08 turns it four degrees a
  // tick toward the nearest thing within 50 units of ITSELF — re-picked
  // every tick, so a missile whose mark dies simply latches onto the next
  // body it passes. Ten damage on contact is nothing; the 45 splash it
  // lands is the weapon, and the homing is what stops a volley of it
  // being wasted on a target that has already fallen over.
  hive: {
    name: "Hive",
    size: 2,
    health: 810, // uncommon band
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
  // Whirl, after mindustry/content/Blocks.java with plastanium ammo
  // (FlakBulletType(4, 8)): a shell every ten ticks out of three barrels,
  // proximity-fused at 20 units.
  //
  // Upstream's shell shatters into six fragments on random bearings; this
  // one does not. The whole burst is folded into the blast instead — 60
  // splash across fifty-two — so six shells a second is a rolling wall of
  // overlapping circles rather than a scatter that may or may not connect.
  //
  // Unlike airburst, plastanium sets collidesGround: whirl answers both
  // layers.
  whirl: {
    name: "Whirl",
    size: 3,
    health: 2270, // rare band
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
      splash: 60,
      splashRadius: 52 * 0.75 * MU,
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
      shootFx: FxKind.ShootBig,
      smokeFx: FxKind.SmokeSmall,
      hitFx: FxKind.PlasticExplosion,
      despawnFx: FxKind.BulletHit,
      // plastanium sets frontColor and backColor but NOT hitColor, so the
      // hit ramp keeps BulletType's own white
      fxColor: PAL.white,
    },
  },
  // Repeater, 1:1 from mindustry/content/Blocks.java with thorium ammo
  // (BasicBulletType(8, 80)). A shell every seven ticks, alternating twin
  // barrels 8 units apart (ShootAlternate) — with the shell up-gunned 30%
  // over stock, 80 -> 104, alongside furnace and railhead: the phase
  // tier is priced as the run's last purchase and plays like it. 891
  // damage a second, the highest sustained figure in the game and the
  // whole reason it exists.
  //
  // pierceCap 2 makes every shell worth two bodies rather than one, and
  // knockback 0.7 shoves what survives back down the lane. Nothing about
  // it is clever: it is a wall of heavy shells.
  repeater: {
    name: "Repeater",
    size: 4,
    health: 6000, // ultra band
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
      // stats — a repeater ends tacker's line and now wears tacker's
      // plating, so it throws tacker's round at four times the size
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
  // Furnace, from mindustry/content/Blocks.java: a LaserTurret, which
  // is a turret that does not fire shots at all. It lights a
  // ContinuousLaserBulletType and HOLDS it — Mindustry's 78 raised 30% to
  // 101 (the phase-tier up-gun, see repeater) to everything under the beam
  // every five ticks, for 230 ticks, and only then does the 90-tick reload
  // start running. 1,212 damage a second while it burns,
  // against nothing at all while it cools: a 72% duty cycle.
  //
  // firingMoveFract halves the turret's turn rate for as long as the beam
  // is lit, so furnace tracks a crossing target badly and a queue walking
  // into it perfectly. The beam pierces without limit, which is what makes
  // that queue the case it is built for.
  furnace: {
    name: "Furnace",
    size: 4,
    health: 7000, // ultra band (6,000) ceiling — 61 tiles
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
    shootY: 4 * 4 * MU, // Turret's own default, as repeater's
    bullet: {
      speed: 0,
      damage: 101, // per damageInterval, NOT per second — stock 78, +30%
      lifetime: 0, // the beam is turret state, not a projectile
      splash: 0,
      splashRadius: 0,
      collidesAir: true,
      collidesGround: true,
      hitRadius: (4 / 2) * MU, // hitSize 4
      // A FURNACE SETS THINGS ON FIRE, which is what a furnace is and what
      // this turret's own blurb has always said it does. It was electric
      // — the end of coil's and piercer's blue line — and electricity is
      // the one thing it should NOT have been: an electric shot is only
      // worth its bonus on a SOAKED body, and fire dries a soaked body
      // (Sim.applyBurn spends the flame on the water first). A gun that
      // both ignited and conducted would have been undoing its own combo
      // every tick. So the beam ignites, the burn runs six seconds, and
      // the blue line is coil and piercer — the two that pair with water
      burn: 3,
      continuous: {
        length: 200 * MU,
        damageInterval: 5 / TICK,
        duration: 230 / TICK, // LaserTurret.shootDuration
        fade: 16 / TICK, // ContinuousLaserBulletType.fadeTime
        moveFract: 0.5, // LaserTurret.firingMoveFract
      },
      // Upstream the TURRET names Fx.shootBigSmoke2 and the bullet none,
      // so the block's orange powder cloud is what plays. A laser throws
      // no powder, so it lights up the way a piercer fires instead: two
      // wings off the muzzle, square to the beam. No other TURRET fired
      // the cloud; the swarm's artillery and its spark guns still do
      // (weapons.ts)
      shootFx: FxKind.PiercerShoot,
      hitFx: FxKind.HitFurnace,
      // AND THE BEAM IS HOT, not blue. It was painted piercer's blue when
      // it ended piercer's line; it ignites now, and a gun's colour is
      // the fastest thing a player reads off a board — a blue beam that
      // sets bodies alight is the board lying about what it does. This
      // entry carries the muzzle cloud and the bars flicking off whatever
      // the beam rests on; the four washes of the beam itself are
      // FURNACE_BEAM (weapons.ts), repainted to match
      fxColor: PAL.furnaceHit,
    },
  },
  // Railhead, from mindustry/content/Blocks.java with surge ammo (a
  // RailBulletType): 500 units of range — the only turret that outreaches
  // the map's own lanes — and one 1755-damage shot every 200 ticks
  // (Mindustry's 1350, +30%: the phase-tier up-gun, see repeater).
  //
  // THE DAMAGE IS A BUDGET, NOT A NUMBER. The rail is an instant line, and
  // every body it punches through takes whatever is LEFT of the 1350 and
  // then subtracts its own full health from it (pierceDamageFactor 1). So
  // one shot deletes a queue until 1350 health has gone by and stops dead
  // there — nine runts, or an ironhide3 and a half. It kills a health
  // POOL, which is why it targets the STRONGEST thing in range rather than
  // the nearest: spending the reload on a stray dartback1 is the one way to
  // waste it.
  railhead: {
    name: "Railhead",
    size: 4,
    health: 5000, // ultra band floor — 156 tiles, it is never in reach
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
    shootY: 4 * 4 * MU, // Turret's own default, as repeater's
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

  // THE TOXIN LINE — four authored guns, one a footprint, and the only
  // turrets that poison. What each one is for, and the arithmetic behind
  // these numbers, is docs/elements.md.
  duster: {
    name: "Duster",
    size: 1,
    health: 250, // common band floor — the longest reach on the board bar three
    armor: 0,
    range: 285 * MU,
    reload: 85 / TICK,
    shots: 1,
    shotDelay: 0,
    spread: 0,
    inaccuracy: (3 * Math.PI) / 180,
    shootCone: (20 * Math.PI) / 180,
    rotateSpeed: ((10 * Math.PI) / 180) * TICK,
    targetAir: false,
    targetGround: true,
    bullet: {
      speed: 2.2 * TICK * MU,
      // every point is splash, as douser's ball and blighter's canister:
      // the dart is a container, and what it carries is the burst
      damage: 0,
      poison: 1.2,
      lifetime: (285 + 10) / 2.2 / TICK,
      splash: 9,
      splashRadius: 30 * 0.75 * MU,
      collidesAir: false,
      collidesGround: true,
      hitRadius: 4 * MU,
      sprite: {
        region: "canister",
        across: 8 * MU,
        along: 11 * MU,
        shrinkX: 0,
        shrinkY: 0,
        back: PAL.toxinBack,
        front: PAL.toxinFront,
      },
      puff: { chance: 0.3 * TICK, size: 3 * MU },
      shootFx: FxKind.ShootLiquid,
      smokeFx: FxKind.SmokeSmall,
      hitFx: FxKind.WaterBurst, // drawn at the radius it actually gassed
      hitFx2: FxKind.HitLiquid,
      despawnFx: FxKind.HitLiquid,
      fxColor: PAL.toxinBack,
    },
  },
  blighter: {
    name: "Blighter",
    size: 2,
    health: 880, // uncommon band, a long lob
    armor: 4,
    range: 225 * MU,
    minRange: 50 * MU,
    reload: 95 / TICK,
    shots: 1,
    shotDelay: 0,
    spread: 0,
    inaccuracy: (4 * Math.PI) / 180,
    shootCone: (8 * Math.PI) / 180,
    rotateSpeed: ((5 * Math.PI) / 180) * TICK,
    targetAir: false,
    targetGround: true,
    bullet: {
      speed: 2.8 * TICK * MU,
      // every point is splash, as douser's ball: a canister that bursts
      // short of its mark is worth what one bursting on its face is
      damage: 0,
      lifetime: 90 / TICK,
      splash: 26,
      splashRadius: 46 * 0.75 * MU, // the widest blast on the board
      poison: 1.4,
      collidesAir: false,
      collidesGround: true,
      artillery: true,
      sprite: {
        region: "canister",
        across: 13 * MU,
        along: 16 * MU,
        shrinkX: 0.15,
        shrinkY: 0.35,
        slopeShrink: true,
        back: PAL.toxinBack,
        front: PAL.toxinFront,
      },
      trail: { size: 4 * MU, mult: 1 },
      shootFx: FxKind.ShootBig,
      smokeFx: FxKind.SmokeSmall,
      hitFx: FxKind.WaterBurst, // drawn at the radius it actually gassed
      hitFx2: FxKind.HitLiquid,
      despawnFx: FxKind.HitLiquid,
      fxColor: PAL.toxinBack,
    },
  },
  drifter: {
    name: "Drifter",
    size: 3,
    health: 2400, // rare band ceiling — it stands well back
    armor: 9,
    range: 260 * MU,
    // ONE FIELD AT A TIME, AND BARELY THAT: sixteen seconds between
    // canisters against a field that lives fourteen, so a drifter is a
    // turret the board waits on rather than one it listens to
    reload: 960 / TICK,
    shots: 1,
    shotDelay: 0,
    spread: 0,
    inaccuracy: 0,
    shootCone: (12 * Math.PI) / 180,
    rotateSpeed: ((4 * Math.PI) / 180) * TICK,
    targetAir: true,
    targetGround: true,
    bullet: {
      // a walking pace: the canister crosses 450 units, over twice what
      // the turret aims inside, and takes fourteen seconds doing it
      speed: 0.53 * TICK * MU,
      damage: 6, // per pulse, not per second
      lifetime: 850 / TICK,
      splash: 0,
      splashRadius: 0,
      collidesAir: true,
      collidesGround: true,
      cloud: { radius: 84 * MU, interval: 0.5, poison: 1 },
      // the canister itself, tumbling in the middle of its own gas — the
      // field is drawn by the shield pass (renderer.ts drawCloudFields)
      sprite: {
        region: "canister",
        across: 11 * MU,
        along: 14 * MU,
        shrinkX: 0,
        shrinkY: 0,
        back: PAL.toxinBack,
        front: PAL.toxinFront,
      },
      puff: { chance: 1.6 * TICK, size: 9 * MU },
      shootFx: FxKind.ShootLiquid,
      smokeFx: FxKind.SmokeBig,
      hitFx: FxKind.HitLiquid, // fired at every pulse (Sim.updateProjectiles)
      despawnFx: FxKind.SmokeCloud,
      fxColor: PAL.toxinBack,
    },
  },
  stinger: {
    name: "Stinger",
    size: 4,
    health: 6400, // ultra band
    armor: 15,
    range: 215 * MU,
    reload: 5 / TICK,
    shots: 1,
    shotDelay: 0,
    spread: 0,
    inaccuracy: (4 * Math.PI) / 180,
    shootCone: (20 * Math.PI) / 180,
    rotateSpeed: ((5 * Math.PI) / 180) * TICK,
    targetAir: true,
    targetGround: true,
    shootY: 4 * 4 * MU, // Turret's own default, as repeater's
    barrels: { count: 2, spread: 7 * MU },
    bullet: {
      speed: 6 * TICK * MU,
      damage: 30,
      poison: 1.6,
      lifetime: (215 + 9 + 10) / 6 / TICK,
      splash: 0,
      splashRadius: 0,
      collidesAir: true,
      collidesGround: true,
      hitRadius: (5 / 2) * MU,
      sprite: {
        region: "bullet",
        across: 7 * MU,
        along: 13 * MU,
        shrinkX: 0,
        shrinkY: 0.5,
        back: PAL.toxinBack,
        front: PAL.toxinFront,
      },
      shootFx: FxKind.ShootSmall,
      smokeFx: FxKind.SmokeSmall,
      hitFx: FxKind.BulletHit,
      despawnFx: FxKind.BulletHit,
      fxColor: PAL.toxinBack,
    },
  },

  // ---- THE GARRISON'S GUNS (types.ts ENEMY_ONLY_KINDS) ----
  //
  // FOUR TURRETS THE PLAYER NEVER OWNS. They are the swarm's, an author
  // stands them on a map (missionMarks.ts EMPLACEMENT), and every number
  // here is the body each of them used to be: the pools, the plating and
  // the weapons are carried over rather than re-invented, because the
  // whole point of turning them into turrets was that they stop walking,
  // not that they stop being the Bulwark and the Lance.
  //
  // THE POOLS ARE THE POOLS THEY HAD AS BODIES, and they are written here
  // DIVIDED BY TOWER_HP_SCALE because every turret's table health is
  // multiplied by it (resolveTower). A Bulwark stood on 25,000 and stands
  // on 25,000: `health: 2500` is how you say that in this table.
  //
  // THEY STILL DWARF EVERY ROW ABOVE. A railhead is a few thousand on the
  // board; a Juggernaut is two hundred thousand behind a hundred and
  // fifty armour. That is deliberate and it is the same reason it was
  // deliberate when they were bodies: these are OBJECTIVES, a trip the
  // run makes on purpose, not traffic.
  //
  // NONE OF THEM TARGETS AIR. A garrison gun answers the board in front
  // of it, and the board is buildings.

  // THE BULWARK — the ram, as a gun with no reach. Five tiles is arm's
  // length: it is the turret you can stand next to and not the turret you
  // can stand away from, which is what the charging body was.
  bulwark: {
    name: "Bulwark",
    size: 2,
    health: 2500,
    armor: 104,
    range: 40 * MU,
    reload: 40 / TICK,
    shots: 2,
    shotDelay: 6 / TICK,
    spread: 0,
    inaccuracy: 0,
    shootCone: (20 * Math.PI) / 180,
    rotateSpeed: ((6 * Math.PI) / 180) * TICK,
    targetAir: false,
    targetGround: true,
    bullet: {
      speed: 0,
      damage: 800,
      lifetime: 10 / TICK,
      splash: 280,
      splashRadius: 36 * MU,
      collidesAir: false,
      collidesGround: true,
      shootFx: FxKind.ShootBig,
      hitFx: FxKind.BlastExplosion,
      fxColor: TEAM_CRUX_RGB,
    },
  },
  // THE LANCE — the needle, unchanged: one crimson beam every two and a
  // sixth seconds, twenty-four tiles, and it does NOT pierce
  lance: {
    name: "Lance",
    size: 2,
    health: 1700,
    armor: 14,
    range: 190 * MU,
    reload: 130 / TICK,
    chargeTime: 20 / TICK,
    shots: 1,
    shotDelay: 0,
    spread: 0,
    inaccuracy: 0,
    shootCone: (8 * Math.PI) / 180,
    rotateSpeed: ((90 * Math.PI) / 180) * TICK,
    targetAir: false,
    targetGround: true,
    bullet: {
      speed: 0,
      damage: 560,
      lifetime: 14 / TICK,
      splash: 0,
      splashRadius: 0,
      collidesAir: false,
      collidesGround: true,
      laser: { length: 195 * MU, pierceCap: 1, width: 7 * MU },
      shootFx: FxKind.PiercerShoot,
      chargeFx: FxKind.PiercerCharge,
      hitFx: FxKind.HitPiercer,
      fxColor: TEAM_CRUX_RGB,
    },
  },
  // THE HALBERD — the mortar. The shell is the body's, number for number,
  // and the arc it carried as a second weapon is a BOLT off the same
  // shell (BulletStats.lightning): a turret fires one thing, so the two
  // halves are one round that bursts and then jumps.
  halberd: {
    name: "Halberd",
    size: 3,
    health: 5500,
    armor: 115,
    range: 319 * MU,
    reload: 200 / TICK,
    shots: 1,
    shotDelay: 0,
    spread: 0,
    inaccuracy: (1 * Math.PI) / 180,
    shootCone: (10 * Math.PI) / 180,
    rotateSpeed: ((5 * Math.PI) / 180) * TICK,
    targetAir: false,
    targetGround: true,
    bullet: {
      speed: 4.2 * TICK * MU,
      damage: 220,
      lifetime: (319 + 10) / 4.2 / TICK,
      splash: 820,
      splashRadius: 104 * MU,
      collidesAir: false,
      collidesGround: true,
      artillery: true,
      lightning: { length: 32 * MU },
      sprite: {
        region: "shell",
        across: 13 * MU,
        along: 20 * MU,
        shrinkX: 0,
        shrinkY: 0.2,
        slopeShrink: true,
        back: TEAM_CRUX_RGB,
        front: PAL.lighterOrange,
      },
      trail: { size: 3.4 * MU, mult: 1 },
      shootFx: FxKind.ShootBig,
      hitFx: FxKind.BlastExplosion,
      fxColor: TEAM_CRUX_RGB,
    },
  },
  // THE JUGGERNAUT — the flak fan. The body swept an eighty-degree wedge
  // and took eight things at once; a turret has one barrel, so the wedge
  // is FIVE SHELLS IN A SPREAD and the sweep is what lands rather than
  // what is drawn. Its force field and its plating aura do not come over:
  // a turret is not a body and has no crowd to hand anything to.
  juggernaut: {
    name: "Juggernaut",
    size: 4,
    health: 20000,
    armor: 150,
    range: 150 * MU,
    reload: 120 / TICK,
    shots: 5,
    shotDelay: 3 / TICK,
    spread: (10 * Math.PI) / 180,
    inaccuracy: (3 * Math.PI) / 180,
    shootCone: (40 * Math.PI) / 180,
    rotateSpeed: ((4 * Math.PI) / 180) * TICK,
    targetAir: false,
    targetGround: true,
    bullet: {
      speed: 5 * TICK * MU,
      damage: 180,
      lifetime: (150 + 10) / 5 / TICK,
      splash: 240,
      splashRadius: 30 * MU,
      collidesAir: false,
      collidesGround: true,
      sprite: {
        region: "shell",
        across: 10 * MU,
        along: 14 * MU,
        shrinkX: 0,
        shrinkY: 0.4,
        back: TEAM_CRUX_RGB,
        front: PAL.lighterOrange,
      },
      shootFx: FxKind.ShootBig,
      hitFx: FxKind.BlastExplosion,
      fxColor: TEAM_CRUX_RGB,
    },
  },
};

/** every turret's stats under ONE hidden class each (normalizeTower) — the
 *  only table the game reads; RAW_TOWERS above is how they were written */
export const TOWERS: Record<TowerKind, TowerStats> = Object.fromEntries(
  (Object.keys(RAW_TOWERS) as TowerKind[]).map((k) => [k, normalizeTower(RAW_TOWERS[k])]),
) as Record<TowerKind, TowerStats>;

/**
 * HOW FAR POWER REACHES, in pixels, from the two things that carry it.
 *
 * THE CORE'S IS THE HOME GROUND and it is deliberately large: a player
 * should never be asked to buy permission to defend their own base. Ninety
 * cells is better than a third of the board across, which on every
 * official map covers the approach, the chokes either side of it and room
 * behind to stack a second line — everything a run does before it has any
 * business thinking about the rest of the map.
 *
 * A BEACON'S IS SMALLER THAN THAT AND BIGGER THAN ANY GUN. Sixty cells is
 * a shade under a railhead's reach (500 MU, ~62 cells), which is the
 * comparison that matters: one beacon opens enough ground to stand the
 * longest gun in the game and give it somewhere to shoot from.
 *
 * BOTH ARE MEASURED FROM THE CENTRE, and a cell is lit when its own centre
 * falls inside the disc — see Sim.rebuildPower.
 */
export const CORE_POWER_R = 90 * CELL;
export const BEACON_POWER_R = 60 * CELL;

/**
 * A BEACON'S FOOTPRINT, in cells. It stands on ROCK (see MapBeacon in
 * maps.ts) and claims no ground the swarm could ever want, so this is a
 * drawing measurement and nothing else — there is no placement to test and
 * nothing to occupy.
 *
 * THREE, LIKE A THREE-BY-THREE TURRET, because it is drawn like one: the
 * same plate under it (renderer.ts, UV_TOWER_BASE3) with its mast standing
 * on top. A two-cell block had no plate and read as a loose diamond
 * scratched onto the rock; on a plate it reads as a BUILDING, which is
 * what it is, and the square is what a player recognises from every turret
 * they have ever placed.
 *
 * It is also an odd number, which is what makes the block sit ON a cell
 * rather than on the seam between two: the centre lands at (x + 1.5) cells
 * and a click aimed at the middle of it is aimed at the middle of a tile.
 */
export const BEACON_SIZE = 3;

/**
 * HOW FAR A BEACON SEES, in pixels — the two radii of the pool of light it
 * keeps around itself on the hill.
 *
 * WHY IT NEEDS ONE AT ALL. A beacon stands on rock, and the inside of a
 * hill is the darkest ground in the game (Renderer.drawDarkness, DARK_MAX):
 * a building put there is drawn, then buried under the same black the rock
 * around it wears. The result was a silhouette you could only find by
 * knowing where to look. A lamp on a mast lights the ground it stands on —
 * so it does, and the darkness lifts inside this disc.
 *
 * IT IS A RING AND NOT A HOLE, which is the whole of why there are two
 * numbers. Punching the darkness flat to zero inside one radius cuts a
 * circle out of the hill with a hard rim, and a hard rim on a soft
 * gradient reads as a rendering fault. Full light out to the inner radius,
 * then the hill's own darkness fading back in over the gap to the outer
 * one, reads as light falling off — which is what it is.
 *
 * IT IS NOT THE POWER DISC and is much smaller than it (BEACON_POWER_R, 60
 * cells). This is what the beacon can SEE; that is what it lets you BUILD
 * on, and a player who could not tell the two apart would read a lit hill
 * as buildable rock. Nothing about this ring is bought — it is on from the
 * first frame of the map, for beacons the run will never afford.
 */
export const BEACON_VISION_R = 7 * CELL;
export const BEACON_VISION_FADE_R = 13 * CELL;

/**
 * THE MOST BEACONS ONE MAP MAY CARRY.
 *
 * It is a cap because which beacons are BOUGHT has to live on memory both
 * threads hold (Sim.beaconOn), and a shared array has to be sized before
 * the map that fills it is read. Sixty-four is far past what any map
 * should want — the official nine are authored at a dozen or so — and it
 * costs 64 bytes, so the ceiling is set where nobody will ever meet it
 * rather than where the current maps happen to sit.
 */
export const MAX_BEACONS = 64;

/**
 * WHAT A BEACON COSTS — ONE RISING PRICE FOR THE WHOLE BOARD.
 *
 * THE RULE. Every beacon on a map is offered at the same price, and that
 * price is a rung of this ladder: the FIRST one a run switches on costs
 * rung 1, whichever hill it stands on, and buying it moves every other
 * beacon on the board up to rung 2. Nothing is priced by where it is.
 *
 * WHY IT IS NOT PRICED BY DISTANCE ANY MORE. It used to be: three bands
 * cut by how far from the base a beacon sat, stamped onto each one when
 * the map was authored. That made the decision "which of these is the
 * bargain" — a run swept the cheap ring first because it was cheap, and
 * the far edge was a wall of forty-thousands nobody crossed until late no
 * matter what the mission wanted. One rising price asks the question the
 * game is actually about: HOW MUCH GROUND is this run going to open, and
 * is the next acre worth more than the guns it would buy. Where that acre
 * is, is the player's business.
 *
 * THE NUMBERS, read against what a run earns. A full run banks about
 * 2.05 million scrap off the core (economy.ts) and the unit of mid-run
 * spending is the 1,350-scrap tier-1 block. So the first beacon is about
 * two blocks — an opening purchase nobody agonises over — and by the fifth
 * the board is asking eighteen. Cumulatively: two beacons cost 8.5k, five
 * cost 57k, all ten cost 436k, about a fifth of everything a run earns. A
 * WHOLE MAP IS MEANT TO BE UNAFFORDABLE: the ground a run opens should be
 * a shape it chose, not a box it ticked.
 *
 * THE CURVE WAS EASED ONCE, MOST OF ALL AT THE BOTTOM. Every step was cut
 * — about a third off the first, a tenth off the last — because the old
 * first three (3k/5k/8k) priced the opening acre against guns a run still
 * badly needed, and the choice read as "not yet" rather than as a choice.
 * The shape is unchanged: still geometric, still ending somewhere no run
 * comfortably reaches.
 *
 * TEN RUNGS, AND THE LAST ONE REPEATS. A map carrying more beacons than
 * the ladder has rungs offers the eleventh at the tenth's price — the
 * curve has already made its point by then.
 *
 * ONE LADDER FOR THE WHOLE CAMPAIGN. Maps used to be able to carry a
 * ladder of their own, typed into a panel in the map editor; no map ever
 * did, and a per-map price list was a second answer to a question this
 * curve already answers. An author who wants a board to cost more opens
 * it with MORE BEACONS, which is a decision about ground and reads on the
 * map itself. This list is the only place a beacon's price is written.
 */
export const BEACON_LADDER: readonly number[] = [
  3000, 5500, 9500, 15000, 24000, 35000, 50000, 70000, 96000, 128000,
];

/**
 * WHAT THE NEXT BEACON COSTS on a board that has already bought `bought`
 * of them. Past the last rung the last price repeats; an empty ladder is
 * free ground. It takes the ladder as an argument rather than reading
 * BEACON_LADDER itself so that the rule stays testable against a made-up
 * curve; every caller in the game passes BEACON_LADDER.
 */
export const beaconPriceAt = (ladder: readonly number[], bought: number): number => {
  if (ladder.length === 0) return 0;
  const rung = Math.min(Math.max(bought | 0, 0), ladder.length - 1);
  return Math.max(0, Math.round(ladder[rung]));
};

/**
 * A SECOND AMMO NEEDS A WAY TO BE LOADED — checked at import.
 *
 * Sim.fireShot picks the alt either off the counter that steps the mount
 * point (ShootAlternate, so the second ammo leaves by a nozzle of its own)
 * or off a per-shot roll (`altChance`, so it leaves as a round of its own).
 * With neither, the alt would be thrown out of the same nozzle on every
 * shot and be invisible as a second ammo, which is the entire point of
 * loading it.
 */
(() => {
  for (const [kind, spec] of Object.entries(TOWERS)) {
    if (spec.bullet.alt && (spec.barrels?.count ?? 1) < 2 && spec.altChance === undefined)
      throw new Error(`"${kind}" loads a second ammo with neither a second barrel nor a chance`);
    if (spec.altChance !== undefined && !spec.bullet.alt)
      throw new Error(`"${kind}" rolls for a second ammo it does not load`);
  }
})();

/**
 * WHAT A TURRET IS, in one sentence, for the card the tech tree opens over
 * its node.
 *
 * The node itself can only ever say what BUYING it does — "+1 Tacker
 * placement" — which is the shopkeeper's half of the question and not the
 * player's. The player is choosing between twenty-one guns they have never
 * fired, so the card has to say what the gun DOES: how it delivers damage,
 * and the one quirk that decides where it wants to stand.
 *
 * ONE PLAIN SENTENCE, AND NOTHING ELSE. No numbers — they are already on
 * the board and in the balance page, and they would go stale the first time
 * the constants above are touched. No tactics either: where a turret wants
 * to stand is the player's discovery, and a card that hands it over is both
 * longer and less fun. Just what the gun DOES — a coil jumps, a barrage
 * lobs, a railhead takes one huge shot — because a card nobody finishes
 * reading mid-wave has told the player nothing.
 *
 * WHO IT SHOOTS AT IS NOT IN HERE. That line is derived from targetAir and
 * targetGround (see targetingLine below) so it can never contradict the
 * stats, and so a rung that grants air targeting — coil's Ionised Air —
 * moves it for free.
 */
export const TOWER_DESC: Record<import("./types").TowerKind, string> = {
  // the garrison's four (types.ts ENEMY_ONLY_KINDS): never dealt and never
  // bought, but the codex and the inspector print a line for every kind
  bulwark: "The swarm's wall. Hits like a ram, and only what is next to it.",
  lance: "The swarm's needle. One armour-cutting beam down a long line, slowly.",
  halberd: "The swarm's mortar. Lobs a shell that bursts wide and throws a bolt.",
  juggernaut: "The swarm's fortress. Sweeps a fan of shells and will not die.",
  tacker: "Shoots small bullets quickly.",
  airburst: "Shoots flak shells that burst near enemies, some of them incendiary.",
  coil: "Shoots lightning that jumps between enemies.",
  lobber: "Lobs shells that explode where they land.",
  torch: "Sprays fire at close range and sets enemies alight.",
  autocannon: "Shoots four shells at once, then reloads slowly.",
  douser: "Lobs a ball of water that bursts, soaking everything nearby and chipping at it.",
  piercer: "Charges up, then fires a beam through a line of enemies.",
  barrage: "Lobs six shells at once over a long distance.",
  tether: "Fires one huge armour-piercing lance at the toughest enemy in range, then reloads slowly.",
  cleaver: "Shoots three heavy rays at very close range.",
  hive: "Shoots homing missiles that explode on contact.",
  whirl: "Shoots a fast stream of shells that burst in a wide blast.",
  deluge:
    "Throws balls of water and fire together. Each bursts into a large cloud: the water soaks and slows, the fire burns through plating.",
  fixer: "Repairs nearby buildings every few seconds.",
  restorer: "Repairs nearby buildings faster and over a wider area.",
  repeater: "Shoots heavy bullets from two barrels without stopping.",
  furnace: "Holds a laser that sets everything in its path on fire.",
  railhead: "Shoots one huge railgun shot with a long reload.",
  duster: "Spits gas over a long distance, poisoning what it hits.",
  blighter: "Lobs a canister that bursts into a huge cloud of poison.",
  drifter:
    "Fires one slow cloud that drifts far past its target, poisoning everything it passes over. Very long reload.",
  stinger: "Shoots poisoned needles without stopping, stacking the poison as fast as it fires.",
};

/**
 * WHO A TURRET WILL SHOOT AT, as the one line the card prints under the
 * description. Derived rather than authored so it cannot drift from the
 * stats, and so it follows an upgraded turret: pass the stats the player
 * actually has and coil reads "ground and air" the moment Ionised Air is
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
 * EVERY TURRET'S POOL, TIMES THIS — the one dial over what a structure
 * can take (towerMaxHp). There are no walls to stand in front of a gun
 * (types.ts), so the gun itself holds the pool a line needs to be chewed
 * on for a while, and the swarm's bite (weapons.ts unitDamageScale) stays
 * at its authored number so a balance pass is done on this side.
 *
 * IT IS THE WHOLE TABLE'S DIAL AND NOTHING ELSE. Which turret is tougher
 * than which is written on the turret's own row (TowerStats.health, one
 * band a footprint); this only says how big all four bands are at once.
 *
 * TEN. It was four, then eight when the deal came in — a turret is no
 * longer chosen and paid for at its own price but dealt (rarity.ts) and
 * placed free, so a line cannot be repaired by buying the same gun again
 * and a structure has to SURVIVE its mistake rather than be replaced out
 * of it — then five, on the reading that eight took the pressure off the
 * placement entirely. Ten goes the other way deliberately: a line is
 * meant to HOLD long enough to be worth building deep and worth
 * defending with mods and relics, and at five the swarm's bite ate the
 * front row faster than any of that could be brought to bear.
 *
 * The core is written on its own (CORE_HP) and did NOT move with it.
 */
export const TOWER_HP_SCALE = 10;

/** the stats of a structure kind — one funnel, so a caller never reads TOWERS by hand */
export const structStats = (kind: import("./types").TowerKind): TowerStats => TOWERS[kind];

/** a structure's full pool: the health on its row, times the dial */
export const towerMaxHp = (kind: TowerKind): number =>
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
 * keeps a projectile a flat set of lanes (projs.ts), which is what the sim's hot loop wants.
 */
export function bulletOf(
  kind: import("./types").TowerKind,
  frag: boolean,
  alt = false,
): BulletStats {
  const own = structStats(kind).bullet;
  // ALT FIRST, THEN FRAG: the second ammo is a whole shot of its own
  // (BulletStats.alt), so a fragment thrown by the fire ball is the FIRE
  // ball's child and not the water's
  const b = alt && own.alt ? own.alt : own;
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
 * layer picks which flow field it steers by, which of the map's SPAWN TILES
 * it may enter on, and which exits it is trying to reach.
 *
 * THE DOORS ARE NO LONGER SORTED BY LAYER. A map paints one spawn layer —
 * plain tiles, no kind on them (see maps.ts) — and the layer picks its own
 * tiles out of it: a hull prefers the wet ones, a walker and a flyer take
 * the dry ones. So a layer is still what decides where a body comes in,
 * and an author no longer has to say it three times.
 *
 * "WATER" IS THE AMPHIBIOUS LAYER, not a wetter kind of ground. A naval
 * tank crosses deep water AND dry land, so its field is the walkers' with
 * the deep cells opened up (navalWalkMask) and its doors are the water
 * zones AND the ground ones. What the layer still costs it is pace: ashore
 * it drives at NAVAL_LAND_SPEED of its stat. That is why every family now
 * lands on every map — there is no terrain a layer cannot cross.
 *
 * A WAVE SCRIPT NAMES NONE OF THIS. It used to name a region number the
 * map had to match, in two editors, with nothing checking they agreed —
 * and what every one of those numbers was actually FOR was "the flyers
 * come in over there, the walkers up this lane", which is a fact about the
 * units rather than a label a script should have to repeat.
 */
export const MOVE_LAYERS = ["ground", "air", "water"] as const;
export type MoveLayer = (typeof MOVE_LAYERS)[number];

/**
 * WHAT A HULL LOSES ASHORE: half its speed, applied to the drive and to
 * nothing else. The Harpoon fleet is the sniper family (weapons.ts) and
 * the crawl up the beach is the point of it — a hull that is slow to
 * arrive has been shooting the whole way in. (It used to arrive OLD as
 * well, and old meant hitting three times as hard; that ramp is gone —
 * see the note by levels.ts NAVAL_PACE.)
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
 *
 * IT IS THE DEFAULT AND NOT THE RULE: a kind may name its own tax
 * (levels.ts UnitStats.landSpeed), and the Wraith fleet does — it pays a
 * fifth, because the sniper family's crawl up the beach is the Harpoon
 * fleet's premise and the wraiths' whole idea is a body that cannot be
 * held wherever it is.
 */
export const NAVAL_LAND_SPEED = 0.5;
/**
 * ...AND WHAT IT GAINS AFLOAT: half again its stat, on the drive and on
 * nothing else, on every cell that IS a water floor (Sim.updateUnits).
 *
 * The naval stat is the speed a hull was authored at, and ashore it was
 * always fine — a skate4 on a beach reads as a tank and drives like one. The
 * water was the problem: the same number on the water made the sea a road
 * no faster than the land, and a family whose whole premise is "quick in
 * the water, slow on it ashore" had a premise nobody could see. Half
 * again is the number that makes a channel read as a channel — a skate1
 * crossing a bay is a boat and a skate1 crossing a beach is not — without
 * a hull outrunning the guns a fresh board has (NAVAL_PACE in levels.ts
 * is still the dial under it). Like the land tax it is not a pathfinding
 * input: the naval field never reads it.
 */
export const NAVAL_WATER_SPEED = 1.5;

/** Fx.unitSpawn's own 30 ticks — the entrance, and the only thing an
 *  arrival draws now */
export const FX_UNIT_SPAWN = 30 / TICK;

// the three elements — what each number means is docs/elements.md
export const FIRE_DPS_PER_STACK = 4;
export const FIRE_MAX_STACKS = 15;
export const FIRE_SECONDS = 3;
export const FIRE_SPREAD_CHANCE = 0.35;
/** how far past touching a body may still catch: fire spreads on CONTACT,
 *  so the reach is the two hitboxes plus this and nothing else. Loose
 *  enough that a marching column still passes it along; nowhere near a
 *  lone hull's neighbours */
export const FIRE_SPREAD_GAP = 12;
/** status ticks between one body's spread rolls; staggered by index so the
 *  whole burning crowd never rolls on the same tick */
export const FIRE_SPREAD_STRIDE = 12;
export const POISON_SECONDS = 5;
export const BURN_FX_CHANCE = 0.15 * TICK; // Mathf.chanceDelta(0.15)
// StatusEffects.wet's flicker: Fx.wet at effectChance 0.09 per tick, from
// a random point inside the hitbox exactly like burning's. The status's
// TEETH — the slow — are per-bullet (BulletStats.wet), not here: douser and
// deluge soak to different depths, so the strength travels with the ammo
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
 * a dial OF ITS OWN — the number the campaign script was tuned against.
 * It is the run: the swarm exists to knock it down, and the moment it does
 * the run is over (Sim.lost).
 *
 * It used to read TOWER_HP_SCALE, and it stopped the day that dial was
 * doubled for the deal — it has moved again since, and this has not.
 * Raising the turrets is a statement about how long a LINE holds; raising
 * the core would be a statement about how long the whole script takes
 * to lose, which is every map's pacing at once and is not a change
 * anybody asked for. Four, where it has always been.
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
/** puffs a second at death's door, for an ironhide1-sized body; the sim scales
 *  it by the hitbox, so a dartback5 at the same health pours several times
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
 * IT STACKS WITH HOW MANY ARE SHOOTING, AND THERE IS NO CEILING. Every
 * application adds its rate and puts the clock back to full; everything
 * above one application drains again (POISON_DECAY below). So the rot a
 * turret takes settles wherever the shooting balances the draining, and
 * that level is LINEAR IN THE SIZE OF THE CROWD — ten bodies is a trickle,
 * three thousand is a flood.
 *
 * THERE USED TO BE A FLAT CEILING AND IT GAVE THE MECHANIC A SHELF LIFE.
 * Capped at four applications, the rot a turret took was IDENTICAL under
 * ten bodies and under three thousand — the one thing on a field built for
 * twenty thousand of them that did not care how many there were. Worse, a
 * fixed number of hit points a second ages badly against a pool that grows
 * by MULTIPLIERS: a late-run turret carrying Giant and Bulwark (mods.ts) is
 * some quarter of a million health, which at the old ceiling was eighty
 * minutes of rot on a run that lasts twelve. The status quietly expired
 * somewhere around wave thirty.
 *
 * SO THE CROWD IS THE SCALING, AND THE TIER IS THE WEIGHT. A dartback1's
 * spit is twelve health a second at two rolls in five, and what makes a
 * wave of them frightening is that there is a wave of them; a dartback5's
 * bomb is a hundred and fifty across seventeen tiles, and what makes one
 * frightening is the one. The per-application rates used to top out at
 * ten a second for every tier alike, which against a pool that grows by
 * MULTIPLIERS was a status that had quietly expired — see the venom
 * ladder in weapons.ts. The decay is still the only bound, and it is
 * still a self-correcting one.
 */
export const POISON_TIME = 6;
/**
 * EVERYTHING ABOVE ONE APPLICATION BLEEDS BACK, at this fraction of itself
 * a second (Sim.updateTowers). This is the whole bound on the rot, and it
 * is what makes it a SWARM mechanic rather than a switch.
 *
 * IT HAS TO BE PROPORTIONAL, NOT FLAT. A flat drain — so many hit points a
 * second, whatever the stack — is a threshold and not an equilibrium: a
 * shooter whose inflow beats it climbs forever however slowly it fires, and
 * one whose inflow does not never accumulates at all. Draining a share of
 * the EXCESS gives a stable level instead, at roughly `inflow / decay`,
 * which is linear in how many spitters are landing shots.
 *
 * AND IT IS THE ONLY THING STOPPING A RATCHET. Without it, "add and refresh"
 * means the rot only ever climbs while a wave is in reach, so what kills a
 * patch is how LONG the wave stands there rather than how big it is — and
 * the damage goes quadratic in time. One line of decay is what turns that
 * into a level the crowd has to hold up.
 *
 * ONE A SECOND puts a lone spitter a little over its own rate and lets a
 * crowd push as far as it can feed.
 */
export const POISON_DECAY = 1;
/** motes a second a rotting structure lifts, for a 1x1 — scaled by the
 *  footprint exactly as the damage smoke is, so a rotting repeater reads
 *  from across the field */
export const POISON_FX_RATE = 6;
/** seconds one mote lives */
export const POISON_FX_LIFE = 0.6;
/** sparks a second a SHORTED building throws (Tower.shortT), for a 1x1 —
 *  scaled by the footprint as the rot's motes are */
export const SHORT_FX_RATE = 8;
/** seconds one spark lives */
export const SHORT_FX_LIFE = 0.22;

/**
 * THE AURAS THE TWO REWORKED FAMILIES CARRY, both of them a STAMP rather
 * than a standing lookup: a carrier's pulse writes a timer onto every body
 * in reach (Sim.updateAbilities), and the buff is live while that timer is.
 *
 * IT IS A STAMP BECAUSE THE ALTERNATIVE IS A SCAN PER BODY PER TICK. There
 * are up to 22,000 bodies and a handful of carriers; asking every body
 * "is an ironhide5 near me" every frame is the wrong way round. The carrier
 * pulses on its own reload and pays for the search once.
 *
 * THE TIMER OUTLIVES THE PULSE by AURA_LINGER, so a body inside a field
 * that pulses every two seconds is buffed continuously rather than
 * flickering off in the gaps — and one that walks out of the field keeps it
 * for that long and no longer.
 */
export const AURA_LINGER = 1.35;

/**
 * THE SQUEEZE (Sim.mergeSqueezed): two bodies of one kind crushed into
 * each other at a choke fold into ONE that carries both — health, maximum
 * health, shield and weapon damage all add, so nothing the wave sent is
 * lost; it is just standing in one place instead of two.
 *
 * MERGE_SQUEEZE is how deep the crush has to be: the pair's centres closer
 * than this fraction of their combined PHYSICS radius. Half is well past
 * anything a flowing crowd shows — the physics pass parts an ordinary
 * overlap by four fifths every tick, so only a pile pressed from every side
 * holds a pair that deep.
 * MERGE_HOLD is how long it has to stay that deep, in seconds. A shove from
 * a shell's knockback is over in a few ticks; a jam is not.
 * MERGE_MAX_STACK is the most bodies one survivor may stand for, so the
 * rule thins a jam rather than collapsing a whole wave into one ball.
 * MERGE_GROWTH is how much bigger a stack is DRAWN per folded body. The
 * hitbox never moves, exactly as under the hungry rule (mutation.ts).
 */
export const MERGE_SQUEEZE = 0.5;
export const MERGE_HOLD = 0.5;
export const MERGE_MAX_STACK = 8;
export const MERGE_GROWTH = 0.12;

/**
 * THE GRAPNELS' FOLD (Sim.mergeGrapnel) — the same arithmetic as the
 * squeeze above and none of its trigger. A grapnel does not have to be
 * crushed into one of its own to fold with it: it REACHES for the nearest
 * one and folds on purpose, which is the family's whole shape on a board.
 * Everything a fold moves is what the squeeze moves — health, maximum
 * health, shield and the star's bite all add (ustack) — so a field of
 * runts becomes a handful of very heavy runts that throw very heavy stars,
 * and the answer is to kill them before they find each other.
 *
 * GRAPNEL_MERGE_REACH is how far one looks, centre to EDGE like every
 * other neighbour scan in the sim, so a wide body is in reach as soon as
 * its arms are.
 * GRAPNEL_MERGE_PERIOD is how often it looks, in seconds — one attempt a
 * period and never a banked one, exactly as the hungry rule eats.
 * WHERE IT STOPS IS NOT HERE. The ceiling is authored per kind, with the
 * rest of the trait (levels.ts UnitStats.starburst.merge, ten bodies —
 * which on a rule that only ever folds two of ONE KIND is ten times the
 * health it walked in with), because it is a thing about the family and
 * not about the mechanic. MERGE_MAX_STACK above does not apply to them: a
 * family whose trait is folding would be capped below its own ceiling by
 * the rule it shares with everybody else.
 */
export const GRAPNEL_MERGE_REACH = 88;
export const GRAPNEL_MERGE_PERIOD = 1;

/**
 * FIRE ON A BUILDING (Tower.burnT, the Grapnels' fire star) — burning as
 * the swarm's bodies have always had it, pointed the other way.
 *
 * IT IS A REFRESH ON THE CLOCK AND A MAX ON THE RATE, which is the shape
 * every status the swarm lays on a turret has (the short, the jam): a
 * second star does not stack a second fire, it re-lights the one that is
 * burning and, if it is the bigger star, burns hotter. The rate is the
 * STAR'S, authored per tier (weapons.ts StarSpec.burn), because a T5's
 * fire being a T3's would make two thirds of the ladder decoration.
 *
 * LIKE THE ROT, IT IGNORES PLATING (Sim.damageTower's pierce flag). Fire
 * has ignored armour on the other side of the field since the torch was
 * written, and a fire that a bulwarked tacker simply shrugs off is a
 * status the player never has to answer.
 */
export const TOWER_BURN_TIME = 5;
/** flames a second a BURNING building throws, for a 1x1 — scaled by the
 *  footprint exactly as the rot's motes and the short's sparks are */
export const TOWER_BURN_FX_RATE = 7;
/** seconds one flame lives */
export const TOWER_BURN_FX_LIFE = 0.5;

export const clamp = (v: number, a: number, b: number): number =>
  v < a ? a : v > b ? b : v;
