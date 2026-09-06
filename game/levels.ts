import { CELL, HP0, UNIT_SPEED, UR } from "./constants";
import { addDrop, dropForTier, emptyDrop, LIVES_START, type Drop } from "./economy";
import { explain, type SaveResult } from "./types";
// type only — mutation.ts must never depend on the campaign, and this
// import must never become a value one or the two files form a cycle
import { MUTATIONS, type MutationId } from "./mutation";

export const UNIT_KINDS = ["dagger", "mace", "fortress", "scepter", "reign", "crawler", "atrax", "spiroct", "arkyid", "toxopid", "flare", "nova", "pulsar", "quasar", "vela", "corvus", "horizon", "zenith", "antumbra", "eclipse", "disrupt", "risso", "minke", "bryde", "sei", "omura", "retusa", "oxynoe", "cyerce", "aegires", "navanax"] as const;
export type UnitKind = (typeof UNIT_KINDS)[number];
export type { TowerKind } from "./types";

/** numeric unit id — index into UNIT_KINDS, stored in the sim's ukind array */
export const UNIT_ID: Record<UnitKind, number> = {
  dagger: 0,
  mace: 1,
  fortress: 2,
  scepter: 3,
  reign: 4,
  crawler: 5,
  atrax: 6,
  spiroct: 7,
  arkyid: 8,
  toxopid: 9,
  flare: 10,
  nova: 11,
  pulsar: 12,
  quasar: 13,
  vela: 14,
  corvus: 15,
  horizon: 16,
  zenith: 17,
  antumbra: 18,
  eclipse: 19,
  disrupt: 20,
  risso: 21,
  minke: 22,
  bryde: 23,
  sei: 24,
  omura: 25,
  retusa: 26,
  oxynoe: 27,
  cyerce: 28,
  aegires: 29,
  navanax: 30,
};

/**
 * THE HULLS SAIL SLOWER THAN MINDUSTRY'S. A risso's stock 1.1 units a tick
 * is 8.25 tiles a second — more than twice a dagger — and on a water
 * route a third the length of Confluence's march that is a boat a
 * wave-1 board sees for five seconds. Every naval speed below carries
 * this factor: a risso at 4.5 tiles a second is still the fastest tier-1
 * body in the game, and a fleet is still a fleet, but the front can be
 * held by the turrets a fresh run has. Change it here, not per hull.
 */
const NAVAL_PACE = 0.55;

/** px per Mindustry world unit — leg geometry is written in those units */
const MU = CELL / 8;

/**
 * Mindustry LegsComp/UnitType leg fields: everything the walk cycle of a
 * many-legged unit needs. Lengths are world px (the Mindustry value x MU);
 * the ratios are unitless and carry their original meaning.
 *
 * A legged unit is NOT a mech: instead of two sprites sliding back and
 * forth under a chassis, every leg is a two-segment arm whose foot is
 * planted in the WORLD and only re-placed when its group's turn in the
 * gait comes round. The sim keeps the joint and foot of every leg (see
 * Sim.updateLegs) and the renderer strokes the segments between them.
 */
export interface LegSpec {
  /** how many legs ring the body */
  count: number;
  /** both segments together, px — each half is one segment */
  length: number;
  /** legs per gait group; a 6-legged insect steps 3 at a time (div 3) */
  groupSize: number;
  /** how fast a joint chases its IK solution (non-linear, per tick) */
  speed: number;
  /** how far ahead of the body a stepping foot is placed, as a fraction
   * of the gait's stride — low values make a unit plant its feet under
   * itself, high ones make it reach */
  forwardScl: number;
  /** scales the distance walked between one step and the next */
  moveSpace: number;
  /** the leg mount's own radius from the body center, px */
  baseOffset: number;
  /**
   * How far past the knee the LOWER segment starts, so its sprite covers
   * the joint rather than butting up against it, px. Mindustry states this
   * signed (arkyid's is -15) but only its magnitude ever reaches the
   * screen — see the note in Renderer.pushLegs — so the source's sign is
   * kept here for fidelity and dropped at draw time.
   */
  extension: number;
  /** desynchronizes the gait — leg i's stage is offset by i * this, px */
  pairOffset: number;
  /** how far out a leg TRIES to stand, as a fraction of its length */
  lengthScl: number;
  /** hard reach limits as fractions of leg length: a foot may never be
   * nearer than min or further than max from its mount */
  minLength: number;
  maxLength: number;
  /** UnitType.shadowElevation: how high a swinging foot rides above the
   * ground at the top of its step — the renderer offsets its shadow by it */
  elevation: number;
  /**
   * UnitType.rippleScale: how big the dust a foot throws up when it lands.
   * Mindustry fires Fx.unitLandSmall at every foot the moment its group's
   * turn in the gait passes on, scaled by this — so it is one puff per
   * planted foot, not a puff per unit.
   */
  ripple: number;
}

/** a LegSpec with Mindustry's UnitType defaults filled in */
const legs = (o: Partial<LegSpec> & Pick<LegSpec, "count" | "length">): LegSpec => ({
  groupSize: 2,
  speed: 0.1,
  forwardScl: 1,
  moveSpace: 1,
  baseOffset: 0,
  extension: 0,
  pairOffset: 0,
  lengthScl: 1,
  minLength: 0,
  maxLength: 1.75,
  elevation: 0,
  ripple: 1,
  ...o,
});

/**
 * Mindustry ForceFieldAbility's four numbers plus its polygon. Held on the
 * carrier's own shield pool (UnitStats has no separate store — Mindustry
 * spends `unit.shield` here exactly as ShieldRegenFieldAbility does), so a
 * hit that reaches the carrier through the field eats the field too.
 */
export interface ForceFieldSpec {
  /** the bubble's circumradius in world px */
  radius: number;
  /** shield points restored per second (Mindustry's per-tick regen x 60) */
  regen: number;
  /** the pool's cap, and what a fresh carrier spawns holding */
  max: number;
  /**
   * seconds of downtime after a break. Mindustry buys this by driving the
   * pool to `-cooldown * regen` rather than by running a timer, so the very
   * same regen that refills the field is what times its outage
   */
  cooldown: number;
  /** sides of the shield polygon — 6, a hexagon, for every stock unit */
  sides: number;
  /** the polygon's roll, rad: fixed to the WORLD, never to the carrier */
  rotation: number;
}

/**
 * Mindustry's naval wake — the pair of foam trails a hull drags behind it,
 * and the only animation a ship has (there are no legs and no chassis to
 * slide, so without this a boat is a sprite gliding over a flat surface).
 *
 * WaterMoveComp keeps two Trails, one at (-x, y) and one at (+x, y) in the
 * hull's own frame, feeds each a point every tick, and draws them as
 * strips that taper to nothing at the tail. Everything here is that,
 * converted to world px (the Mindustry value x MU) except `length`, which
 * stays a count of TICKS of history — it is Trail.length, and multiplying
 * it by the hull's speed is what makes a slow omura's 70-point wake and a
 * quick risso's 20-point one come out the lengths they do.
 */
export interface WakeSpec {
  /** UnitType.waveTrailX: half the gap between the two trails, world px */
  x: number;
  /** UnitType.waveTrailY: how far behind the hull's centre they start */
  y: number;
  /** UnitType.trailLength: ticks of history each trail holds */
  length: number;
  /** UnitType.trailScl: the widest half-width, at the head, world px */
  scl: number;
}

/**
 * Mindustry EnergyFieldAbility, reduced to what survives the port. Upstream
 * it is an orb that every `reload` zaps the nearest `maxTargets` things in
 * range — damage and an electrified status to enemies, a percentage heal to
 * damaged allies. This game's enemies have nothing to shoot at (towers
 * cannot be damaged and the player fields no units), so the damage half is
 * dead on arrival and the HEAL is the whole ability.
 *
 * It is the only heal on the roster written as a PERCENTAGE rather than a
 * flat pool (RepairFieldAbility's `amount`), which matters: 1.5% of max
 * health is 2 hp to the dagger beside it and 330 to the reign, so the field
 * is worth most to exactly the heavies that are hardest to kill.
 */
export interface EnergyFieldSpec {
  /** percent of the target's MAX health restored per zap */
  healPercent: number;
  /** healing to a unit of the carrier's own kind is scaled by this */
  sameTypeHealMult: number;
  /**
   * how many units one zap may reach. Mindustry sorts candidates by
   * distance and takes this many; the scan here walks the spatial hash in
   * bucket order and stops at the cap, so in a crowd thicker than the cap
   * WHICH units get topped up differs — how many, and by how much, do not.
   */
  maxTargets: number;
  /** seconds between zaps (Mindustry's tick reload / 60) */
  reload: number;
  /** the field's radius in world px */
  range: number;
}

/**
 * The status effects a unit can carry. Mindustry has dozens; this game
 * fields exactly two — StatusEffects.burning, lit by the scorch turret,
 * and StatusEffects.wet, soaked in by the liquid turrets (wave, tsunami).
 *
 * WET IMMUNITY BELONGS TO THE HULLS, and to nothing else. UnitType.init
 * adds StatusEffects.wet to the immunities of every naval type the moment
 * it detects one (the `water preset` block, alongside canDrown = false), so
 * it is not a per-unit authoring choice upstream and is not one here — all
 * ten ships declare it, and a wave or tsunami soaking a boat does nothing
 * at all. Burning immunity is the opposite: two kinds have it by hand.
 */
export type StatusKind = "burning" | "wet";

export interface UnitStats {
  hp: number;
  /** world px/s */
  speed: number;
  /** flat damage shaved off every hit, floored at 10% of the raw shot */
  armor: number;
  /** collision radius in world px — half the square hitbox edge */
  radius: number;
  /**
   * Unit tier, 1-5. The tier alone decides what a kill pays — its scrap
   * into the run and its XP into the save (DROP_BY_TIER in economy.ts) —
   * so a level's enemy mix is what determines what a run banks.
   */
  tier: number;
  /**
   * Mindustry UnitType.drag, "movement drag as fraction": how much of an
   * external shove a unit sheds per tick. Nothing this game does steers by
   * it — our units chase a flow field rather than accelerating — but a
   * parallax beam's pull is a Mindustry impulse, and this is what decides
   * how long that pull keeps acting after it stops. Unset takes UnitType's
   * own 0.3, which is what every kind below that omits it has.
   */
  drag?: number;
  /**
   * Mindustry UnitType.rotateSpeed in DEGREES PER TICK: how fast the torso
   * swivels onto a new heading. Unset takes the 5 every stock unit has;
   * the heavies that override it downward visibly lag their own turn.
   * Only the torso — the chassis under it keeps the default, which is
   * what makes a heavy look like it is dragging its guns round.
   */
  rotateSpeed?: number;
  /** flying units ignore terrain and head straight for the base; only
   * towers with targetAir (and bullets with collidesAir) touch them */
  flying?: boolean;
  /**
   * NAVAL: this kind travels on the WATER layer — it moves over water and
   * cannot cross dry land, the exact mirror of a walker. The movement
   * layers (MOVE_LAYERS in constants.ts) are what decide a unit's flow
   * field, its drop zones and its exits, so a naval kind is a STATS EDIT
   * like every other unit — the same way a tier-4 unit was once a stats
   * edit that started paying a new currency.
   *
   * Upstream never writes this either: UnitType.init sets `naval = true`
   * for anything built on WaterMovec, which is exactly the ten hulls of
   * the two naval trees. BOTH depths carry them — shallow water is the
   * one floor both layers share, so a dagger wades where a risso sails —
   * and no hull may leave the water at all, which is what makes deep
   * water a wall to the swarm and a road to the fleet at the same time.
   */
  naval?: boolean;
  /**
   * The naval wake: Mindustry's two WaveTrails, one either side of the
   * hull (UnitType.waveTrailX/waveTrailY/trailScl/trailLength, drawn by
   * WaterMoveComp). Only naval kinds have one — a flyer's trailLength is
   * an ENGINE trail, which none of this game's flyers sets.
   */
  wake?: WakeSpec;
  /**
   * Mindustry's boss (guardian) tag, made a property of the KIND rather
   * than of one spawn: this game fields its bosses as dedicated kinds, so
   * the flag lives here. For now it only marks the unit for presentation —
   * nothing in the sim reads it.
   */
  boss?: boolean;
  /**
   * Mindustry RepairFieldAbility: every `reload` seconds, heal every unit
   * whose hitbox falls inside `range` by `amount`, capped at its max hp.
   * The healer is inside its own field, so it mends itself too.
   */
  repairField?: { amount: number; reload: number; range: number };
  /**
   * Mindustry ShieldRegenFieldAbility: every `reload` seconds, top every
   * unit in `range` up by `amount` of absorbing shield, never past `max`.
   * Shields soak damage before health does (see Sim.damageUnit).
   */
  shieldField?: { amount: number; max: number; reload: number; range: number };
  /**
   * Mindustry EnergyFieldAbility: every `reload` seconds, top up the
   * damaged units in `range` by a PERCENTAGE of their own max health. See
   * EnergyFieldSpec for what upstream's damage half loses in the port.
   */
  energyField?: EnergyFieldSpec;
  /**
   * Mindustry ForceFieldAbility: a standing polygonal bubble that EATS
   * bullets outright — anything absorbable crossing the outline is deleted
   * and its damage billed to the carrier's shield pool instead. Nothing
   * about it is periodic: it regenerates every tick, and once the pool hits
   * zero the field drops for `cooldown` seconds (see Sim.updateAbilities).
   */
  forceField?: ForceFieldSpec;
  /**
   * Mindustry UnitType.immunities: status effects that simply never take.
   * The check is at application time (StatusComp.apply returns early), not
   * a resistance — an immune unit is never lit at all, so it also never
   * shows the burning flicker.
   */
  immunities?: readonly StatusKind[];
  /**
   * A walking unit with real legs rather than a mech's sliding pair. Its
   * presence is what puts a kind on the legged draw path — see LEG_ART in
   * atlas.ts for the matching sprites.
   */
  legs?: LegSpec;
}

/**
 * A WakeSpec with UnitType's own defaults filled in. Only `y` has one that
 * matters — waveTrailY is -3 world units unless a type says otherwise, and
 * the two T1s are the types that don't.
 */
const wake = (o: Partial<WakeSpec> & Pick<WakeSpec, "x" | "length" | "scl">): WakeSpec => ({
  y: -3 * MU,
  ...o,
});

/** per-kind combat stats (official Mindustry numbers) */
export const UNIT_STATS: Record<UnitKind, UnitStats> = {
  // dagger: 150 hp, no armor, 1x1-block hitbox, 3.75 tiles/s
  dagger: { hp: HP0, speed: UNIT_SPEED, armor: 0, radius: UR, tier: 1 },
  // mace: 550 hp, armor 4, 1.25x1.25-block hitbox, 3.75 tiles/s
  mace: { hp: 550, speed: UNIT_SPEED, armor: 4, radius: UR * 1.25, tier: 2 },
  // fortress: 900 hp, armor 9, 1.625x1.625-block hitbox, 3.225 tiles/s
  // (0.43 px/tick) — the T3 heavy walks noticeably slower than the line,
  // and rotateSpeed 3 against the stock 5 makes it turn slower too
  fortress: {
    hp: 900,
    speed: 3.225 * CELL,
    armor: 9,
    radius: UR * 1.625,
    tier: 3,
    rotateSpeed: 3,
  },
  // scepter: the ground line's T4 — 9000 hp, armor 10, a 2.75x2.75-block
  // hitbox, 0.36 px/tick = 2.7 tiles/s. Ten fortresses' health on something
  // that walks slower than anything else on the roster, and rotateSpeed 2.1
  // (under half the stock 5) means it cannot even turn quickly
  // ShieldRegenFieldAbility(25, 250, 60, 60): +25 shield EVERY SECOND up to
  // 250, over the usual 7.5-tile field. The pulsar's version tops its
  // escort up between volleys; this one out-heals sustained fire, and it
  // shields itself first of all
  scepter: {
    hp: 9000,
    speed: 2.7 * CELL,
    armor: 10,
    radius: UR * 2.75,
    tier: 4,
    rotateSpeed: 2.1,
    shieldField: { amount: 25, max: 250, reload: 1, range: 7.5 * CELL },
  },
  // reign: the ground line's T5 and the heaviest thing in the game —
  // 24000 hp, a 3.75x3.75-block hitbox, 0.4 px/tick = 3 tiles/s. Note it
  // walks FASTER than the scepter it replaces (2.7), the second time the
  // roster hands a tier an upgrade that is not also a slowdown
  //
  // armor 18 is the number that matters. Armour is a flat shave floored at
  // a tenth of the raw shot (see Sim.applyArmor), so anything firing under
  // 20 a hit is reduced to paying the floor: a duo's 9-damage bolt lands 0.9
  // instead of 9, and a full duo wall does a tenth of its paper DPS. The
  // counter is calibre, not volume — one lancer hit clears the shave twice
  // over. No ability: at this weight it does not need one
  reign: {
    hp: 24000,
    speed: 3 * CELL,
    armor: 18,
    radius: UR * 3.75,
    tier: 5,
    rotateSpeed: 1.65,
  },
  // crawler: 150 hp, no armor, 1x1-block hitbox, 1 px/tick = 7.5 tiles/s —
  // twice the line's pace; the swarm closes distance before towers thin it
  crawler: { hp: 150, speed: 7.5 * CELL, armor: 0, radius: UR, tier: 1 },
  // atrax: the crawler line's T2 — 600 hp, armor 3, a 1.625x1.625-block
  // hitbox, 0.6 px/tick = 4.5 tiles/s. Where the crawler is a fast, frail
  // swarm, its successor plods: four legs carrying four times the health
  // legCount 4 / legLength 9 / legForwardScl 0.6 / legMoveSpace 1.4 — a
  // short reach and a wide gait, so it visibly hauls itself along
  //
  // immunities burning (and melting, which this game does not field): the
  // slag-throwing unit does not burn. Scorch is the counter to the crawler
  // swarm and slides straight off the thing the swarm upgrades INTO
  atrax: {
    hp: 600,
    speed: 4.5 * CELL,
    armor: 3,
    radius: UR * 1.625,
    tier: 2,
    drag: 0.4,
    rotateSpeed: 3,
    immunities: ["burning"],
    legs: legs({ count: 4, length: 9 * MU, forwardScl: 0.6, moveSpace: 1.4, elevation: 0.2 }),
  },
  // spiroct: the line's T3 — 1000 hp, armor 5, a 1.875x1.875-block hitbox,
  // 0.54 px/tick = 4.05 tiles/s, the slowest thing on the field. Six legs
  // on longer mounts (legBaseOffset 2) stepping three at a time
  spiroct: {
    hp: 1000,
    speed: 4.05 * CELL,
    armor: 5,
    radius: UR * 1.875,
    tier: 3,
    drag: 0.4,
    rotateSpeed: 3,
    legs: legs({
      count: 6,
      length: 13 * MU,
      forwardScl: 0.8,
      moveSpace: 1.4,
      baseOffset: 2 * MU,
      elevation: 0.3,
    }),
  },
  // arkyid: the crawler line's T4 — 8000 hp, armor 6, a 2.875x2.875-block
  // hitbox, 0.62 px/tick = 4.65 tiles/s. Eight times the spiroct's health
  // on something that walks faster than it, which makes it the only T4 on
  // the roster that is quicker than the T3 it replaces
  //
  // Its legs are the difference: 30 world units against the spiroct's 13,
  // on mounts 10 units out, so it straddles ground the spiroct walks over.
  // legPairOffset 3 staggers the gait leg by leg (the spiroct's 0 swings
  // each three-leg group as one piece), and legExtension 15 runs each
  // lower segment a whole segment back past its own knee, so the limb
  // sprite covers the joint — which is why arkyid needs no knee cap where
  // every other legged unit has one
  //
  // rippleScale 2 doubles the dust a planted foot throws. Mindustry also
  // gives it legSplashDamage 32 over legSplashRange 30, a stamp that hurts
  // whatever the foot lands on: it has no target here, since this game's
  // towers cannot be damaged and the player fields no units of its own, so
  // what survives of the footfall is the dust and the reach
  arkyid: {
    hp: 8000,
    speed: 4.65 * CELL,
    armor: 6,
    radius: UR * 2.875,
    tier: 4,
    drag: 0.1,
    rotateSpeed: 2.7,
    legs: legs({
      count: 6,
      length: 30 * MU,
      pairOffset: 3 * MU,
      baseOffset: 10 * MU,
      extension: -15 * MU,
      lengthScl: 0.96,
      speed: 0.2,
      elevation: 0.65,
      ripple: 2,
    }),
  },
  // toxopid: the crawler line's T5 — 22000 hp, armor 13, a 3.25x3.25-block
  // hitbox, and 0.5 px/tick = 3.75 tiles/s, which is exactly the dagger's
  // marching pace: the largest spider on the field keeps up with the line
  // it walks in front of
  //
  // Its legs are the whole silhouette. Eight of them at 75 world units —
  // two and a half times the arkyid's 30, the longest reach on the roster
  // — on mounts only 8 units out, so the body sits low inside a span it
  // straddles rather than stands on. legLengthScl 0.93 folds them a little
  // further in than arkyid's 0.96, and shadowElevation 0.95 lifts a
  // swinging foot almost a full body-height off the ground: the gait is
  // visibly high-stepping where the arkyid's is a scuttle
  //
  // Like the arkyid it has no knee cap and takes a shoulder plate instead
  // (legExtension 20 runs each lower segment back over its own joint), and
  // like the arkyid its legSplashDamage 80 / legSplashRange 60 has nothing
  // to hit here — towers cannot be damaged and the player fields no units
  // — so what lands is rippleScale 3, half again the arkyid's dust
  toxopid: {
    hp: 22000,
    speed: UNIT_SPEED,
    armor: 13,
    radius: UR * 3.25,
    tier: 5,
    drag: 0.1,
    rotateSpeed: 1.9,
    legs: legs({
      count: 8,
      length: 75 * MU,
      moveSpace: 0.8,
      pairOffset: 3 * MU,
      extension: -20 * MU,
      baseOffset: 8 * MU,
      lengthScl: 0.93,
      speed: 0.19,
      elevation: 0.95,
      ripple: 3,
    }),
  },
  // flare: 70 hp, no armor, 1.125-block hitbox, 2.7 px/tick = 20.25 tiles/s
  flare: {
    hp: 70,
    speed: 20.25 * CELL,
    armor: 0,
    radius: UR * 1.125,
    tier: 1,
    drag: 0.04,
    flying: true,
  },
  // nova: the T1 of the support line — 120 hp, armor 1, 1x1-block hitbox,
  // 0.55 px/tick = 4.125 tiles/s. Frailer than a dagger but a step quicker
  // RepairFieldAbility(10, 60*4, 60): 10 hp to everything within 7.5 tiles,
  // every 4 s — a nova escort keeps a dagger line topped up between volleys
  nova: {
    hp: 120,
    speed: 4.125 * CELL,
    armor: 1,
    radius: UR,
    tier: 1,
    repairField: { amount: 10, reload: 4, range: 7.5 * CELL },
  },
  // pulsar: support T2 — 320 hp, armor 4 (a mace's plating on half its hp),
  // 1.375x1.375-block hitbox, 0.7 px/tick = 5.25 tiles/s: the line's fastest
  // walker, so it arrives ahead of the daggers it escorts
  // ShieldRegenFieldAbility(20, 40, 60*5, 60): +20 shield every 5 s up to a
  // 40-point cap, over the same 7.5-tile field
  pulsar: {
    hp: 320,
    speed: 5.25 * CELL,
    armor: 4,
    radius: UR * 1.375,
    tier: 2,
    shieldField: { amount: 20, max: 40, reload: 5, range: 7.5 * CELL },
  },
  // quasar: support T3 — 640 hp, armor 9 (a fortress's plating), a
  // 1.625x1.625-block hitbox, 0.5 px/tick = 3.75 tiles/s: after the
  // pulsar's sprint the line drops back to the dagger's marching pace
  // ForceFieldAbility(60, 0.4, 500, 60*6): a 7.5-tile hexagon holding 500
  // points, refilling at 24/s and dark for 6 s once it breaks. Where nova
  // and pulsar hand out health and shields unit by unit, this one covers
  // GROUND — every absorbable shot crossing the outline dies there, so a
  // quasar walking point turns the crowd behind it into a blind spot
  quasar: {
    hp: 640,
    speed: UNIT_SPEED,
    armor: 9,
    radius: UR * 1.625,
    tier: 3,
    forceField: {
      radius: 7.5 * CELL,
      regen: 0.4 * 60,
      max: 500,
      cooldown: 6,
      sides: 6,
      rotation: 0,
    },
  },
  // vela: the support line's T4 — 8200 hp, armor 9, a 3x3-block hitbox,
  // 0.44 px/tick = 3.3 tiles/s, and rotateSpeed 1.8, the slowest turn on
  // the roster. Thirteen quasars' health with none of the quasar's reach:
  // where its predecessor covers the ground around it, this one is simply
  // very hard to remove
  //
  // immunities = burning: scorch's flame slides off this one exactly as it
  // does off the atrax, the roster's only other fireproof unit. A flame
  // wall that melts a dagger column is the wrong answer here — 9 armour
  // already takes 17-damage flame hits down to 8, and the 0.167/tick burn
  // that normally finishes the job never starts
  //
  // Mindustry also gives it canBoost/boostMultiplier 2.4 — a hop over
  // terrain at more than double pace. That is a player's button: the wave
  // AI (GroundAI) only ever LOWERS a boosting unit back down, and never
  // calls updateBoosting to raise one, so a vela arriving in a wave walks
  vela: {
    hp: 8200,
    speed: 3.3 * CELL,
    armor: 9,
    radius: UR * 3,
    tier: 4,
    rotateSpeed: 1.8,
    immunities: ["burning"],
  },
  // corvus: the support line's T5 — 18000 hp, armor 9, a 3.625x3.625-block
  // hitbox, and 0.3 px/tick = 2.25 tiles/s, the slowest thing in the game.
  // rotateSpeed 1.5 is likewise the slowest turn on the roster, under a
  // third of stock: it arrives late and cannot answer a flank
  //
  // It is also the lightest of the four T5s, and the support line's tier
  // where support stops. Mindustry's corvus heals through its WEAPON — a
  // 560-damage charged laser with healPercent 25 and collidesTeam — not
  // through an ability, and enemies in this game never shoot, so nothing
  // of it survives the port. nova, pulsar and quasar all carry real
  // abilities; their T4 and T5 carry none, which makes the top of the
  // support line a pair of very large bodies and nothing more
  //
  // Four legs, not the six or eight the crawler line runs on, at 14 world
  // units on mounts 11 out: nearly all of the leg is the mount offset, so
  // it stands on stubby posts planted wide of a body that overhangs them
  corvus: {
    hp: 18000,
    speed: 2.25 * CELL,
    armor: 9,
    radius: UR * 3.625,
    tier: 5,
    rotateSpeed: 1.5,
    legs: legs({
      count: 4,
      length: 14 * MU,
      forwardScl: 0.58,
      moveSpace: 1.5,
      baseOffset: 11 * MU,
      elevation: 0.2,
    }),
  },
  // horizon: the T2 bomber — 340 hp, armor 3, 1.375x1.375-block hitbox,
  // 1.65 px/tick = 12.375 tiles/s. Slower than a flare but four times the
  // health, and armour 3 blunts the scatter flak that shreds the T1
  horizon: {
    hp: 340,
    speed: 12.375 * CELL,
    armor: 3,
    radius: UR * 1.375,
    tier: 2,
    drag: 0.03,
    rotateSpeed: 4.5,
    flying: true,
  },
  // zenith: the T3 gunship — 700 hp, armor 5, a 2.5x2.5-block hitbox that
  // makes it the widest thing in the sky below the T4/T5 hulls, at
  // 1.7 px/tick = 12.75 tiles/s
  zenith: {
    hp: 700,
    speed: 12.75 * CELL,
    armor: 5,
    radius: UR * 2.5,
    tier: 3,
    drag: 0.016,
    flying: true,
  },
  // antumbra: the air line's T4 — 7200 hp, armor 9, and a 5.75x5.75-block
  // hitbox, more than twice the zenith across; only the eclipse's 7.25
  // outspans it. At 0.8 px/tick = 6 tiles/s it also gives up
  // more speed than any other upgrade takes: the zenith flies at 12.75, so
  // where the rest of the air line's appeal is arriving before the guns
  // can answer, this one crosses at half that pace and spends twice as
  // long inside their range
  //
  // rotateSpeed 1.9 against the stock 5 is what sells the weight: a flyer
  // holds its heading through its own drift, and this one visibly swings
  // round rather than snapping. It carries no ability — the air line has
  // none at any tier
  antumbra: {
    hp: 7200,
    speed: 6 * CELL,
    armor: 9,
    radius: UR * 5.75,
    tier: 4,
    drag: 0.04,
    rotateSpeed: 1.9,
    flying: true,
  },
  // eclipse: the air line's T5 — 22000 hp, armor 13, and a 7.25x7.25-block
  // hitbox. That is the widest thing in the game by a clear margin (the
  // antumbra, itself twice a zenith, is 5.75), and it is what the unit is
  // for: nothing on the roster is harder to miss, and nothing soaks a
  // splash pattern like a body that fills it
  //
  // The air line's whole premise is arriving before the guns can answer,
  // and this is where that premise is abandoned. 0.54 px/tick = 4.05
  // tiles/s is a fifth of the flare's 20.25 and two thirds of the
  // antumbra's 6 — slower than most of the GROUND roster, so it crosses a
  // field of scatter at walking pace. rotateSpeed 1 is the slowest turn of
  // anything that moves here. Like every unit in its line it has no
  // ability; unlike them it cannot outrun the mistake
  eclipse: {
    hp: 22000,
    speed: 4.05 * CELL,
    armor: 13,
    radius: UR * 7.25,
    tier: 5,
    drag: 0.04,
    rotateSpeed: 1,
    flying: true,
  },
  // disrupt: THE FINAL BOSS — Erekir's tier-5 missile bomber, the one kind
  // on the roster from the other planet. Base shape from
  // mindustry/content/UnitTypes.java (hitSize 46; rotateSpeed 2;
  // drag 0.07), boss-tuned in FOUR places. Health is Mindustry's 12000 x8
  // (x4 at first; doubled again when the up-gunned phase turrets melted it
  // before it loomed, then x12 when x8 still fell too fast). Armour is 30
  // over the official 9 — far past the reign's 18, so anything hitting
  // under ~33 pays the 10% floor: pellet AA, duos and salvos all read as
  // sparks off the hull, and the answer is calibre, which is what the
  // phase turrets are. Speed drops from the official 1 unit/tick
  // (7.5 tiles/s, crawler pace — it would outrun its own escort and reach
  // the AA line alone) to 2.0 tiles/s, the slowest thing in the game: a
  // boss is a deadline the player watches coming, not a sprinter. Its
  // suppression field and missile racks stay behind on Erekir — enemies
  // here do not shoot — so what crosses the map is the hull, the looming
  // pace, and 144000 health the fleet has to answer before it reaches the
  // base. It also DRAWS half again its native scale (see UNIT_ART), and
  // the hitbox follows the art: Mindustry's hitSize 46 grows to an
  // effective 56 (UR * 7, just under eclipse's 7.25) so shots land where
  // the silhouette says they should — a boss this size being HARD TO MISS
  // is part of what the size is for.
  disrupt: {
    hp: 12000 * 12,
    speed: 2.0 * CELL,
    armor: 30,
    radius: UR * 7,
    tier: 5,
    drag: 0.07,
    rotateSpeed: 2,
    flying: true,
    boss: true,
  },

  // ---- THE FLEET ----
  //
  // Ten hulls in two trees, and the roster's third movement layer. Every
  // one of them is `naval` (UnitType.init's water preset, see UnitStats)
  // and therefore wet-immune, and every one carries a wake. Their numbers
  // are otherwise read off mindustry/content/UnitTypes.java like every
  // walker's — hitSize/8 tiles of hitbox, speed x 7.5 tiles a second.
  //
  // A ship's speed is the thing to read twice. The naval line tops out at
  // 8.25 tiles/s (risso) and BOTTOMS OUT at 4.65 (omura) — so the fastest
  // boat in the game is barely quicker than a crawler, and the slowest is
  // still quicker than a scepter. The whole fleet moves inside a band the
  // ground roster spreads three times as wide, which is what makes a water
  // lane read as one advancing formation rather than a strung-out column.

  // risso: the fleet's T1 — 280 hp, armor 2, a 1.25x1.25-block hitbox,
  // 1.1 units/tick = 8.25 tiles/s, the fastest hull there is. Note it
  // opens at nearly TWICE the dagger's health with armour the dagger does
  // not have: the naval T1 is not chaff, and a duo's 9-damage bolt is
  // already paying 7 against it
  risso: {
    hp: 280,
    speed: 8.25 * CELL * NAVAL_PACE,
    armor: 2,
    radius: UR * 1.25,
    tier: 1,
    drag: 0.13,
    rotateSpeed: 3.3,
    naval: true,
    immunities: ["wet"],
    wake: wake({ x: 4 * MU, length: 20, scl: 1.3 * MU }),
  },
  // minke: T2 — 600 hp, armor 4 (a mace's plating), a 1.625x1.625-block
  // hitbox, 0.9 units/tick = 6.75 tiles/s
  minke: {
    hp: 600,
    speed: 6.75 * CELL * NAVAL_PACE,
    armor: 4,
    radius: UR * 1.625,
    tier: 2,
    drag: 0.15,
    rotateSpeed: 2.6,
    naval: true,
    immunities: ["wet"],
    wake: wake({ x: 5.5 * MU, y: -4 * MU, length: 20, scl: 1.9 * MU }),
  },
  // bryde: T3 — 910 hp, armor 7, a 2.5x2.5-block hitbox, 0.85 units/tick
  // = 6.375 tiles/s. The one hull in the ATTACK tree carrying an ability:
  // ShieldRegenFieldAbility(20, 40, 60*4, 60) is the pulsar's exact field
  // — +20 shield every 4 s to a 40 cap over 7.5 tiles — so a bryde in the
  // middle of a formation keeps the rissos around it wearing a shield the
  // player has to strip again every four seconds
  bryde: {
    hp: 910,
    speed: 6.375 * CELL * NAVAL_PACE,
    armor: 7,
    radius: UR * 2.5,
    tier: 3,
    drag: 0.17,
    rotateSpeed: 1.8,
    naval: true,
    immunities: ["wet"],
    shieldField: { amount: 20, max: 40, reload: 4, range: 7.5 * CELL },
    wake: wake({ x: 7 * MU, y: -9 * MU, length: 22, scl: 1.5 * MU }),
  },
  // sei: T4 — 11000 hp, armor 12, a 4.875x4.875-block hitbox, 0.73
  // units/tick = 5.475 tiles/s. More health than the scepter at the same
  // tier and two more points of armour, on something that also moves
  // twice as fast: from here up the water line has the better body at
  // every tier, and pays for it with a map most of which it cannot enter
  sei: {
    hp: 11000,
    speed: 5.475 * CELL * NAVAL_PACE,
    armor: 12,
    radius: UR * 4.875,
    tier: 4,
    drag: 0.17,
    rotateSpeed: 1.3,
    naval: true,
    immunities: ["wet"],
    wake: wake({ x: 18 * MU, y: -21 * MU, length: 50, scl: 3 * MU }),
  },
  // omura: the fleet's T5 — 22000 hp, armor 16, and a 7.25x7.25-block
  // hitbox, which is the eclipse's: the widest thing in the game, tied.
  // 0.62 units/tick = 4.65 tiles/s, and rotateSpeed 0.9 is the slowest
  // turn on the whole roster — this one cannot answer anything it did not
  // already have its nose pointed at
  omura: {
    hp: 22000,
    speed: 4.65 * CELL * NAVAL_PACE,
    armor: 16,
    radius: UR * 7.25,
    tier: 5,
    drag: 0.18,
    rotateSpeed: 0.9,
    naval: true,
    immunities: ["wet"],
    wake: wake({ x: 23 * MU, y: -32 * MU, length: 70, scl: 3.5 * MU }),
  },
  // retusa: the naval SUPPORT line's T1 — 270 hp, armor 3, a
  // 1.375x1.375-block hitbox, 0.9 units/tick = 6.75 tiles/s, and
  // rotateSpeed 5, the stock rate every ground unit turns at and the
  // quickest hull on the water by a distance
  //
  // Its repair beam does not port. Where nova heals through a
  // RepairFieldAbility, retusa heals through a WEAPON (RepairBeamWeapon,
  // repairSpeed 0.75) — and a weapon is the one thing this game's enemies
  // do not have, exactly as with the corvus's charged laser
  retusa: {
    hp: 270,
    speed: 6.75 * CELL * NAVAL_PACE,
    armor: 3,
    radius: UR * 1.375,
    tier: 1,
    drag: 0.14,
    rotateSpeed: 5,
    naval: true,
    immunities: ["wet"],
    wake: wake({ x: 5 * MU, length: 20, scl: 1.3 * MU }),
  },
  // oxynoe: support T2 — 560 hp, armor 4, a 1.75x1.75-block hitbox, 0.83
  // units/tick = 6.225 tiles/s
  //
  // Its ability IS an ability, and still does not port:
  // StatusFieldAbility(overclock, ...) hands everything around it a speed
  // buff, and this game fields exactly two statuses (see StatusKind).
  // Adding a third that only one enemy kind can apply is a bigger change
  // than the buff is worth, so the support fleet's T2 is a plain hull
  oxynoe: {
    hp: 560,
    speed: 6.225 * CELL * NAVAL_PACE,
    armor: 4,
    radius: UR * 1.75,
    tier: 2,
    drag: 0.14,
    rotateSpeed: 4,
    naval: true,
    immunities: ["wet"],
    wake: wake({ x: 5.5 * MU, y: -4 * MU, length: 22, scl: 1.9 * MU }),
  },
  // cyerce: support T3 — 870 hp, armor 6, a 2.5x2.5-block hitbox, 0.86
  // units/tick = 6.45 tiles/s: fractionally quicker than the bryde it
  // shares a hitbox with. Its repair beam is a weapon, like retusa's, and
  // goes the same way
  cyerce: {
    hp: 870,
    speed: 6.45 * CELL * NAVAL_PACE,
    armor: 6,
    radius: UR * 2.5,
    tier: 3,
    drag: 0.16,
    rotateSpeed: 2.6,
    naval: true,
    immunities: ["wet"],
    wake: wake({ x: 9 * MU, y: -9 * MU, length: 23, scl: 2 * MU }),
  },
  // aegires: support T4 — 12000 hp, armor 12, a 5.5x5.5-block hitbox,
  // 0.7 units/tick = 5.25 tiles/s. The most health of any T4 in the game
  //
  // EnergyFieldAbility(40, 65, 180) is the reason to shoot it first. Its
  // 22.5-TILE radius is three times the 7.5 every other support field on
  // the roster reaches — one aegires covers most of a lane — and it heals
  // 1.5% of MAX health, so it mends an omura for 330 a zap and a risso
  // for 4. sameTypeHealMult 0.5 halves what it does for another aegires,
  // which is upstream's guard against a pair of them being unkillable; a
  // pair is still twice as hard to remove as one
  aegires: {
    hp: 12000,
    speed: 5.25 * CELL * NAVAL_PACE,
    armor: 12,
    radius: UR * 5.5,
    tier: 4,
    drag: 0.17,
    rotateSpeed: 1.4,
    naval: true,
    immunities: ["wet"],
    energyField: {
      healPercent: 1.5,
      sameTypeHealMult: 0.5,
      maxTargets: 25,
      reload: 65 / 60,
      range: 22.5 * CELL,
    },
    wake: wake({ x: 18 * MU, y: -17 * MU, length: 50, scl: 3.2 * MU }),
  },
  // navanax: the support fleet's T5 — 20000 hp, armor 16, and the omura's
  // 7.25x7.25-block hitbox, at 0.65 units/tick = 4.875 tiles/s. Its EMP
  // cannon heals through its shots (healPercent 20 on the bullet), which
  // is a weapon again, so the top of this tree is a bare hull like the
  // top of every other support tree — corvus, vela and this one all
  // arrive with nothing but their size
  navanax: {
    hp: 20000,
    speed: 4.875 * CELL * NAVAL_PACE,
    armor: 16,
    radius: UR * 7.25,
    tier: 5,
    drag: 0.17,
    rotateSpeed: 1.1,
    naval: true,
    immunities: ["wet"],
    wake: wake({ x: 23 * MU, y: -32 * MU, length: 70, scl: 3.5 * MU }),
  },
};

/**
 * Mindustry's unit trees: each line is one factory's upgrade path, in tier
 * order. This is the shape a level author thinks in — "more ground, less
 * air" — so the level editor lays its unit inputs out one tree per row, and
 * a unit's position in a row is its tier.
 */
export const UNIT_TREES = [
  { key: "ground", name: "Ground", kinds: ["dagger", "mace", "fortress", "scepter", "reign"] },
  { key: "support", name: "Support", kinds: ["nova", "pulsar", "quasar", "vela", "corvus"] },
  { key: "crawler", name: "Crawler", kinds: ["crawler", "atrax", "spiroct", "arkyid", "toxopid"] },
  { key: "air", name: "Air", kinds: ["flare", "horizon", "zenith", "antumbra", "eclipse"] },
  // the two water trees. They are upgrade paths like the four above, and
  // they are also the only rows whose units need a MAP to field them: a
  // wave asking for rissos on a map with no water sends nothing at all
  // (Sim.spawnPads returns an empty pad list), exactly as an air wave
  // would on a map with no air zone
  { key: "naval", name: "Naval", kinds: ["risso", "minke", "bryde", "sei", "omura"] },
  { key: "navalSupport", name: "Naval support", kinds: ["retusa", "oxynoe", "cyerce", "aegires", "navanax"] },
  // not an upgrade path: the boss row holds the kinds that arrive as an
  // event rather than a stream, so its slots do not read as tiers
  { key: "boss", name: "Boss", kinds: ["disrupt"] },
] as const satisfies readonly { key: string; name: string; kinds: readonly UnitKind[] }[];

/**
 * Every unit kind sits in exactly one tree. Adding a kind to UNIT_KINDS
 * without placing it in a tree fails this line rather than quietly dropping
 * it out of the editor, where nobody would notice it had gone missing.
 */
type UntreedKind = Exclude<UnitKind, (typeof UNIT_TREES)[number]["kinds"][number]>;
const _everyKindHasATree: UntreedKind extends never ? true : never = true;
void _everyKindHasATree;

export function unitDrop(kind: UnitKind): Drop {
  const s = UNIT_STATS[kind];
  return dropForTier(s.tier, s.boss === true);
}

/**
 * What a run's kills are worth: each kind's drop times how many of it
 * died. The shape of the total is the shape of the LINES that died — a
 * pure dagger push pays a trickle, a spiroct column pays real scrap.
 */
export function dropsForKills(killsByKind: ArrayLike<number>): Drop {
  const total = emptyDrop();
  for (let i = 0; i < UNIT_KINDS.length; i++)
    addDrop(total, unitDrop(UNIT_KINDS[i]), killsByKind[i] ?? 0);
  return total;
}

/**
 * Largest unit radius PER LAYER, and over both. Broad-phase bounds have to
 * cover the widest thing a query could actually find, and ground and air
 * never touch each other: a ground-only splash that padded itself by the
 * antumbra's 5.75-block hitbox would sweep more than twice the buckets it
 * can ever hit. So a query that knows its layer uses that layer's number,
 * and only the layer-agnostic ones (a footprint that must be clear of
 * everything) take the overall maximum.
 */
const rmaxOf = (fly: boolean): number =>
  Math.max(
    ...UNIT_KINDS.filter((k) => !!UNIT_STATS[k].flying === fly).map((k) => UNIT_STATS[k].radius),
  );
export const UNIT_RMAX_GROUND = rmaxOf(false);
export const UNIT_RMAX_AIR = rmaxOf(true);
export const UNIT_RMAX = Math.max(UNIT_RMAX_GROUND, UNIT_RMAX_AIR);
/** the widest unit a query touching these layers could turn up */
export const rmaxFor = (air: boolean, ground: boolean): number =>
  Math.max(air ? UNIT_RMAX_AIR : 0, ground ? UNIT_RMAX_GROUND : 0);

/** how many of each kind a wave (or one region's share of it) sends */
export type WaveUnits = Partial<Record<UnitKind, number>>;

/**
 * One region's contingent of a wave. Its units enter ONLY on the spawn pads
 * carrying this region id in the map document's spawn layer — pad choice
 * and order are random within the region, never across regions.
 */
export type RegionWave = WaveUnits & { region: number };

/**
 * One step of a level's script — always a wave. Its kinds drain together and
 * intermingled, all running out at the same moment, so `{ dagger: 10,
 * mace: 20 }` arrives as one mixed push rather than ten daggers followed by
 * twenty maces. The plain form spawns from any pad; the region-group form
 * pins each group to one spawn region: `{ wave: [{ region: 1, flare: 50 },
 * { region: 2, mace: 50 }] }` sends the flares from region 1's pads and the
 * maces from region 2's, both groups draining at once.
 *
 * Timing is NOT part of a step. Every level has one `waveGap` and the sim
 * holds for that long between waves, so pacing is a single number per level
 * instead of a wait row between every pair of waves.
 *
 * This is a one-variant union on purpose: keeping the `{ wave: … }` wrapper
 * means every `waveGroups(step.wave)` call site and every `"wave" in step`
 * guard survived the removal of the wait variant untouched.
 */
export type LevelStep = { wave: WaveUnits | readonly RegionWave[] };

/**
 * Normalize a wave into groups of counts indexed like UNIT_KINDS. Groups
 * with nothing in them are dropped.
 *
 * THE REGION IS PARSED AND DISCARDED. Documents written before movement
 * layers carry the group form — `[{ region: 1, flare: 50 }, ...]` — and
 * still have to load, so the shape is still read; but nothing routes by the
 * number any more (a unit's layer picks its door), so it does not survive
 * into the result. A wave is its counts. The level editor sums the groups
 * it gets back into one wave and saves the plain form, so a document
 * converts the first time it is edited.
 */
export function waveGroups(
  wave: WaveUnits | readonly RegionWave[],
): { counts: number[] }[] {
  const specs: readonly (WaveUnits | RegionWave)[] = Array.isArray(wave) ? wave : [wave];
  const groups: { counts: number[] }[] = [];
  for (const spec of specs) {
    const counts = UNIT_KINDS.map((k) => Math.max(0, spec[k] ?? 0));
    if (counts.some((c) => c > 0)) groups.push({ counts });
  }
  return groups;
}

/**
 * A MAP'S STANDING DIFFICULTY — the badge on its card in the map select,
 * and the only thing that ranks one map against another.
 *
 * It is NOT the ladder. A rung (Level 1..10) is a difficulty you PICK for a
 * run and it means the same thing on every map; a badge is a property of
 * the terrain itself — how much the lanes, the water and the drop zones do
 * to you before a single multiplier is applied. A player reads the badge to
 * choose WHERE to fight and the rung to choose HOW HARD, so the two
 * vocabularies are kept apart on purpose and never share a word.
 */
export type MapBadge = "beginner" | "intermediate" | "advanced" | "expert";

/** the badge's own label and colour, wherever a map card shows one */
export const MAP_BADGE: Record<MapBadge, { name: string; color: string }> = {
  beginner: { name: "Beginner", color: "#7BE58A" },
  intermediate: { name: "Intermediate", color: "#7FC4FF" },
  advanced: { name: "Advanced", color: "#FFB65C" },
  expert: { name: "Expert", color: "#FF6B6B" },
};

/**
 * A MAP'S MISSION. Two shapes so far:
 *
 *   hold     — clear every wave the script sends. The classic assignment.
 *   survive  — last `minutes` on the clock. The script plays through and,
 *              if the clock is still running when it ends, its LAST wave
 *              is sent again and again, each repeat a level tougher
 *              (Sim.loadStep) — a tide that does not stop until time does.
 *
 * `lives` is the base's health for the mission (LIVES_START when unset).
 * A "no leaks" map is a hold with lives: 1 — the same script, played
 * without a safety net.
 */
export type Mission =
  | { kind: "hold"; lives?: number }
  | { kind: "survive"; minutes: number; lives?: number };

/** the base's health a mission grants */
export const missionLives = (m: Mission): number => Math.max(1, Math.floor(m.lives ?? LIVES_START));

/** the mission as the deploy panel and the HUD say it: a headline and a clause */
export function missionText(spec: LevelSpec): { title: string; detail: string } {
  const m = spec.mission;
  const lives = missionLives(m);
  const waves = spec.script.length;
  if (m.kind === "survive")
    return {
      title: `Survive ${m.minutes} minutes`,
      detail:
        lives === 1
          ? "The waves do not stop until the clock does. One leak ends it."
          : `The waves do not stop until the clock does. ${lives} lives.`,
    };
  return lives === 1
    ? { title: `No leaks — ${waves} waves`, detail: "Clear every wave. A single leak ends it." }
    : { title: `Hold the line — ${waves} waves`, detail: `Clear every wave. ${lives} lives.` };
}

export interface LevelSpec {
  /**
   * save key — the world's ordinal as a string, e.g. "2". It is NOT shown
   * anywhere: a world is identified to the player only by its name, so this
   * must stay stable even when a world is renamed, or saves break
   */
  id: string;
  /** the world's only display name, e.g. "Confluence" */
  name: string;
  /** official map id this level plays on; the first official map when unset */
  map?: string;
  /**
   * How hard this map is to hold, as a badge on the map select. Unset reads
   * as "beginner" — a map that never says otherwise is the gentle one.
   */
  badge?: MapBadge;
  /**
   * WHAT THIS MAP ASKS OF A RUN — the mission (see Mission). Every map is
   * its own assignment, the way a co-op map is: hold the line for every
   * wave, or last the clock out, with as many lives as the mission grants.
   */
  mission: Mission;
  /**
   * seconds held between waves, and before the first one. The clock starts
   * when the previous wave has finished ENTERING the field — the last unit
   * spawning, not the last unit dying — so a level whose waves outlive the
   * gap will have several on the field at once.
   */
  waveGap: number;
  /** what the level throws at you, run start to finish in order */
  script: LevelStep[];
  /**
   * Enemy level: every unit's health is multiplied by HP_PER_LEVEL^level
   * and nothing else moves — armour, speed, hitbox and drop stay at base.
   * Unset (the authored baseline) means level 0. Set by specForTier().
   */
  enemyLevel?: number;
  /** which tier of the ladder this spec was expanded for; unset = baseline */
  tier?: number;
  /**
   * THE RULES THIS LEVEL IS ALWAYS PLAYED UNDER, by design — part of what
   * the world IS rather than part of how hard it is being played.
   *
   * IT IS NOT THE OLD `mutators` SWITCH. That was a per-world boolean —
   * "does this map roll rules" — which handed a level control of a
   * difficulty curve and was never set on anything. This is a LIST OF
   * NAMED RULES: an author says "the naval front is the shielded front"
   * and every deploy on it, at every tier, plays under exactly that.
   *
   * THREE THINGS FALL OUT OF "BY DESIGN" and they are the whole contract:
   *
   *   IT APPLIES AT LEVEL 1. The bottom tier is the campaign as authored,
   *   and for a world authored with rules on it, this IS the campaign as
   *   authored. The tier decides what is ROLLED, not what is true.
   *
   *   IT IS NEVER ROLLED. The roll is handed these as an exclusion
   *   (rollMutations), so a deploy cannot come back with a rule the level
   *   already has and spend the tier's points changing nothing.
   *
   *   IT IS NEVER CHARGED. The tier's budget buys the roll on top of this,
   *   so an intrinsic rule makes a world harder at every tier rather than
   *   crowding out the rules that make one deploy different from the next.
   *
   * A rule here is subject to the same hard law as a rolled one: it
   * changes what happens to a wave AFTER it spawns, never what the script
   * sends, so every number in ladder.ts stays true on a world that carries
   * three of them. Anything that wants to change the script edits the
   * script.
   */
  intrinsicMutation?: readonly MutationId[];
  /**
   * The MUTATORS this run is played under (see mutation.ts) — what the
   * roll came back with when the run was deployed, not anything the ladder
   * or the player decides.
   *
   * Unset is the campaign as authored, and is what every spec the editor
   * and the audit arithmetic build carries: a mutator changes what happens
   * to a wave AFTER it spawns, never what the script sends, so the numbers
   * in ladder.ts stay true whatever was rolled.
   */
  mutation?: readonly MutationId[];
}

/**
 * HOW LONG A WAVE TAKES TO WALK ONTO THE FIELD, in seconds — the same for
 * every wave, whatever its size.
 *
 * RELEASE PACE IS NOT A TUNABLE ANY MORE. It used to be `spawnRate`, a flat
 * enemies-per-second on each level, and a flat rate makes a wave's release
 * time proportional to its SIZE: the shipped script ran from 0.3s (wave 1's
 * forty daggers, which arrived as a single dump) to 15.7s (wave 20's 2,506,
 * which trickled). Two waves authored to feel different sizes instead felt
 * like different GAMES, and the only way to fix one end was to break the
 * other. The rate is now `count / WAVE_RELEASE_SECONDS`, so a wave's size
 * decides how HARD it arrives and never how long it takes to show up.
 *
 * 3.5 SECONDS IS NOT A TASTE, IT IS THE OLD TOTAL. When the switch was
 * made the script held 28,006 enemies, which at the authored 160/s took
 * 175s of release; 50 waves x 3.5s was the same 175s. The campaign kept
 * its length and only the DISTRIBUTION moved — small waves stop dumping
 * instantly, big ones stop dragging. (The script has since grown to
 * ~50,000 bodies; the per-wave 3.5s stands on its own now.)
 *
 * FOR A BIG WAVE THIS NUMBER IS AN ASPIRATION, and that is by design. A
 * failed spawn keeps its credit and goes as soon as a footprint frees up
 * (see Sim.runScript), so congestion DELAYS a wave and never swallows one.
 * The constant sets the pace where the map can keep up and gets out of the
 * way where it cannot.
 *
 * Measured on Confluence, which has five drop zones: every wave up to
 * about 230/s comes out in the full 3.5s, and wave 20 asks 716/s, gets 253/s
 * and takes 9.9s to release all 2,506 — still quicker than the 15.7s the old
 * flat 160/s gave it. So the ceiling a map imposes is a REAL limit worth
 * knowing, and raising it is a matter of drop zones, not of this number.
 */
export const WAVE_RELEASE_SECONDS = 3.5;

/** enemies per second for a wave of `count` — the whole pacing rule */
export const waveSpawnRate = (count: number): number =>
  Math.max(1, count) / WAVE_RELEASE_SECONDS;

/**
 * The editable half of a level: everything the admin level editor writes,
 * one document per world at public/levels/<id>.json. Identity and
 * presentation (name, map, mission) stay in code — an editor that could
 * rename a world or move it to another map would be editing the campaign's
 * structure, not its difficulty.
 */
export interface LevelDoc {
  id: string;
  waveGap: number;
  script: LevelStep[];
}

/**
 * The documents as last loaded or saved, by world id — the raw counts the
 * level editor edits. A world absent here has no document yet and plays
 * the empty script WORLDS ships with, which is a visible failure where a
 * stale second copy in code would be a silent different campaign.
 */
const docs = new Map<string, LevelDoc>();

/** the current document for a world — what the level editor opens */
export function levelDocOf(worldId: string): LevelDoc {
  return docs.get(worldId) ?? { id: worldId, waveGap: 15, script: [] };
}

/**
 * THE MAPS. Every map is its own mission with its own waves — the co-op
 * model: a map is an assignment, and what makes one map different from
 * the next is what it asks and what it sends, not a re-casting of a
 * shared script. Each world's waves live in public/levels/<id>.json and
 * are loaded onto its entry here by loadLevelDocs(); the identity (name,
 * map, badge, mission, intrinsic rules) is this table's.
 *
 * Every map is played at TEN RUNGS of difficulty (RUNGS in ladder.ts): a
 * rung changes the rules rolled and the XP paid, never the script — so
 * every number the audit prints about a map is true at every rung.
 *
 * Kills are the income: every dead body pays its tier's scrap into the run
 * and its tier's XP into the save, win or lose (economy.ts), and the rung
 * multiplies the XP (tierXpBonus in ladder.ts).
 *
 * Armour is flat, max(dmg - armor, 0.1 * dmg), so a fortress (armour 9)
 * against a duo (damage 9) hits the 10% floor and costs a duo line ten
 * times its printed health. That is not a reason a heavy cannot debut
 * early — the floor is a floor, nothing is unkillable — but it is a
 * reason to know what a wave asks: debutViolations() in ladder.ts prints
 * the multiplier so the choice is deliberate.
 */
export const WORLDS: LevelSpec[] = [
  {
    id: "1",
    name: "Confluence",
    map: "confluence",
    badge: "beginner",
    // THE OPENING ASSIGNMENT: hold every wave with the full hundred lives
    mission: { kind: "hold" },
    waveGap: 15,
    // ================= HOW TO AUTHOR A WAVE ========================
    //
    // THE SCRIPT IS public/levels/1.json — this world's own waves. There
    // is no copy in this file to keep in step with it — see the note above
    // `script` at the bottom of this block. Everything below documents HOW
    // to author a wave; WHAT the waves are lives in the document, and the
    // admin level editor writes it. The other worlds' scripts began as
    // re-castings of this one and are authored on their own now, so the
    // guidance here is Confluence's; the pattern travels, the counts do not.
    //
    // EVERY RUNG PLAYS THIS WHOLE LIST. There is one run per map and ten
    // difficulties to play it at, so the STAGE TABLE (stageAudit in
    // ladder.ts) is one table per map — what waves 1-20, 21-35 and 36-50
    // pay — and an edit anywhere in the list moves the economy of every
    // rung at once.
    //
    //   line       T1        T2       T3         T4         T5
    //   dagger     dagger    mace     fortress   scepter    reign
    //   crawler    crawler   atrax    spiroct    arkyid     toxopid
    //   support    nova      pulsar   quasar     vela       corvus
    //   air        flare     horizon  zenith     antumbra   eclipse
    //
    // KEEP SENDING TIER-1 UNITS. They are the swarm and the game is named
    // after them. They are also nearly free in the health budget — 150 hp
    // against a scepter's 9,000, so one T4 weighs as much as sixty
    // daggers, and the twelve thousand extra daggers the middle rungs add
    // cost less than their two hundred scepters. Spend the budget on
    // T3/T4/T5 counts; that is the only thing that really moves a rung's
    // weight.
    //
    // TIER 5 STARTS IN THE FORTIES AND THAT IS AN ECONOMY DECISION. A T5
    // pays fifty scrap a head, and the tier-3 turrets (fuse up to
    // foreshadow) are priced for what waves 36-50 pay — so where the heavy
    // bodies land is where the heavy turrets become affordable. Move them
    // earlier and stage 2 buys a spectre; check() notices through the
    // stage table.
    //
    // THE PATTERN, past wave 20. One cycle is four waves:
    //
    //   1  DAGGER CLASS  + partial support, and optionally a SMALL amount
    //                      of air — small is the point, not a hedge
    //   2  CRAWLER CLASS + partial support, same optional small air
    //   3  AIR ONLY      — air is strong right now, so this wave is allowed
    //                      to be a DIP in the ramp chart. It should be.
    //   4  MIXED         — a bit of everything
    //
    // Every TWO cycles, insert one wave of PURE SUPPORT. So the repeating
    // unit is nine waves: D C A M  D C A M  S.
    //
    // THE WAVES AROUND THE OLD CUTS ARE HAND-WRITTEN, and they stay where
    // they are: waves 34-35 are a lull-then-finale PAIR — wave 34 (674
    // bodies, 0.23M health) drops the floor out so wave 35 (3,505 bodies,
    // 2.17M health) lands as a 9.7x event in one wave gap. A ramp that
    // simply climbed to its biggest wave would arrive at the same number
    // having spent it. The lull is quieter than the AIR wave before it,
    // which is the quietest thing the pattern otherwise produces.
    //
    // THE SCRIPT'S LAST TWO ARE A DOUBLE FINALE INSTEAD: waves 49 and 50 split
    // what was once a single 6.93M finale into two peers, then eased twice
    // when the ending playtested too hot — first 48-50 by a quarter, then
    // 46-50 by a further fifth (49: 1,454 bodies, 2.41M health; 50: 1,176
    // bodies + the disrupt, 2.31M). 50's fleet is the lighter of the two
    // on purpose — the headroom is the boss's budget, and the boss rides
    // on top. Both waves field every line at full strength. About 8% of
    // the tail's T5 bodies were later dealt back into waves 39-45 — only
    // into waves already fielding the kind, so every debut stays put and
    // the totals (and so the drop ratio) do not move — to thicken the
    // ramp instead of the spike.
    //
    // Wave 35 fields scepters and arkyids but NO tier 5 (see above).
    //
    // ALL FOUR TAKE THEIR BODIES OUT OF THE GENERATED SEGMENT rather than
    // adding on top, so the cumulative ratios stay exactly on target. Resize
    // any of them and the difference moves back into waves 21-33 or 36-48.
    //
    // WITHIN a segment, ramp two things at once: total bodies, and the tier
    // mix. Early waves lean T2; late waves lean T4 and T5. Wave 21's dagger
    // wave is mace 177 / fortress 46 / scepter 1; wave 45's is mace 160 /
    // fortress 275 / scepter 64 / reign 14. Same wave type, different game.
    //
    // CHECK THE TOTALS, NOT THE FEEL. Each stage's cumulative tier counts
    // have to pay for its tier's turrets (STAGE_BOARDS in ladder.ts),
    // because one kill is one fixed drop and those sums ARE the economy —
    // miss it and a tier is priced out of its own stage, or bought by the
    // stage before. `window.__ladder.check()` reports it.
    //
    // DO NOT SIZE A RUNG AGAINST THE MAP'S AREA. A run's total bodies
    // are not its bodies on the field: units stream in over
    // WAVE_RELEASE_SECONDS and die continuously, so a rung that sends
    // 52,000 of them never holds a fraction of that at once. If a wave
    // outruns the drop zones they simply queue (Sim.runScript). Size against
    // the stage table, which is the limit that binds.
    // ==============================================================
    // THE SCRIPT LIVES IN public/levels/1.json AND NOWHERE ELSE. It is
    // deliberately empty here: a second copy in code is a second campaign,
    // and the two had already diverged across all 52 waves (the code copy
    // ran about half the bodies) before this was emptied. Whatever fails
    // to load is visible as a level with no waves, which is the point — a
    // silent fall back to a different, staler campaign is the bug this
    // removes. loadLevelDocs() warns on the console when the document is
    // missing. Edit the waves in the admin level editor, or the JSON.
    script: [],
  },
  {
    // WORLD 2 — the SECOND FRONT, opened by climbing Confluence rather
    // than by buying anything (see WORLD_REQUIRES in ladder.ts).
    //
    // ITS MAP IS ITS OWN AND ITS WAVES ARE THE BLUEPRINT'S, RE-CAST. It
    // plays the same fifty waves as every world; the transforms below are
    // what make it the naval front. Maelstrom is authored terrain — a
    // river, a bay and three crossings — so both of the blueprint's flying
    // and marching lines arrive out of the water the map is made of, and
    // what walks is the dagger class rather than the crawler class.
    id: "2",
    name: "Maelstrom",
    map: "maelstrom",
    badge: "advanced",
    // THE NAVAL FRONT: hold the fifty. Six-second gaps, because hulls are
    // big and the water doors pass a wave slower than the schedule — the
    // late waves are bound by their own release, not the gap — so the
    // short gap is what keeps the run near twenty-five minutes
    mission: { kind: "hold" },
    intrinsicMutation: ["overshields", "hydrophobic"],
    waveGap: 15,
    script: [],
  },
  {
    id: "3",
    name: "Quagmire",
    map: "quagmire",
    badge: "advanced",
    // THE SWAMP: forty waves, held with the full hundred, because its goal
    // is the whole western edge and its bodies wade in heavier than they
    // spawned (Amphibious). The script is Confluence's first forty,
    // marched by the dagger line instead of the crawlers and sailed by
    // the naval line, at seven tenths of the bodies in the first stage
    // and nine in the last; its first twenty waves send no tier-3 body,
    // so the heavies arrive with the turrets that can hurt them. Forty
    // rather than fifty because the last ten were the tier-5 hulls, and a
    // hundred lives did not survive them on this front — the headless
    // playtest holds the forty with sixty-odd to spare
    mission: { kind: "hold" },
    intrinsicMutation: ["amphibious"],
    waveGap: 15,
    script: [],
  },
];

// A SPECIAL mutator is out of every roll (MutationDef.special), so a
// world naming it in `intrinsicMutation` is the ONLY way one is ever
// played. One that no world names is therefore dead code that still shows
// up on the codex shelf, promising the player a rule they cannot meet —
// caught here, at module load, rather than by nobody.
for (const m of MUTATIONS) {
  if (!m.special) continue;
  if (!WORLDS.some((w) => (w.intrinsicMutation ?? []).includes(m.id)))
    throw new Error(
      `special mutator "${m.id}" is on no world's intrinsicMutation — nothing can ever play it`,
    );
}

/**
 * The campaign's FIRST world — the default everywhere a single spec is
 * wanted, and the one a fresh save plays. The other maps open by player
 * level (track.ts); the campaign menu reaches them through worldById.
 *
 * Its `script` is EMPTY until loadLevelDocs() has run. Nothing reads the
 * script at module load (the sim takes WORLDS[0] as a default parameter,
 * evaluated per construction), and all three entry points — Game.create,
 * MechSwarm and the admin page — await loadLevelDocs() before a run or an
 * audit can start, so by the time anything asks, the document is on.
 */
export const WORLD = WORLDS[0];

export function worldById(id: string): LevelSpec | null {
  return WORLDS.find((w) => w.id === id) ?? null;
}

// ---------- level documents ----------

/**
 * A world's document lives in public/levels/<id>.json and is FETCHED
 * rather than imported — same reasoning as the map documents (see
 * maps.ts): an imported JSON turns every editor save into a Turbopack HMR
 * update its runtime cannot hot-apply.
 *
 * The source of truth for a world's WAVES is its JSON, and for its
 * IDENTITY (name, map, mission) it is WORLDS above — never a merge.
 *
 * The overlay is applied IN PLACE, which is the whole reason this is safe
 * to call late: WORLDS is never empty, never re-ordered, and never a
 * different array object. Everything that reads it synchronously at module
 * load — Sim's `WORLDS[0]` default, WORLD — keeps working whether or not
 * the document has loaded yet.
 *
 * The opening scrap does NOT follow a script. It is a fixed design
 * constant (SCRAP_START in economy.ts) because it is the difficulty
 * anchor: the author decides how hard the first waves should be and
 * writes them to fit that opening board.
 */
async function fetchLevelDoc(id: string): Promise<LevelDoc | null> {
  try {
    const res = await fetch(`/levels/${id}.json`, { cache: "no-store" });
    if (!res.ok) return null;
    return readLevelDoc(id, await res.json());
  } catch {
    return null; // offline or malformed: play the campaign as shipped
  }
}

/*
 * Both fetch helpers above swallow their own errors on purpose, and
 * loadLevelDocs therefore never rejects. That is load-bearing, not merely
 * tidy: Game.create awaits it in the same Promise.all as the map re-read at
 * level start, so a helper that threw would turn one unreadable level file
 * into a game that cannot start a run at all. Keep them total.
 */

/**
 * Which levels have a saved document, so the loader fetches only files that
 * exist. Blind-fetching every level instead would 404 for each unedited one,
 * and a browser logs a failed request as a console error whether or not the
 * caller catches it — three red lines on every page load, for the normal
 * case. The manifest ships as an empty list, so the common path is one 200
 * and no noise.
 */
async function fetchLevelIndex(): Promise<string[]> {
  try {
    const res = await fetch("/levels/index.json", { cache: "no-store" });
    if (!res.ok) return [];
    const ids = (await res.json()) as unknown;
    return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

/**
 * Validate a raw document and bring it up to the current shape. A
 * hand-mangled file must not take the campaign down, so anything that fails
 * to make sense returns null and the level plays as shipped.
 *
 * Documents written before pacing became per-level carry a `{ wait: n }`
 * step between their waves and no `waveGap`. Those are migrated rather than
 * rejected: the level keeps its waves in order and inherits the wait value
 * it used most often, which is the closest single number to what its author
 * actually built. Dropping the timings silently instead would quietly make
 * an edited level harder than it was saved.
 */
function readLevelDoc(id: string, raw: unknown): LevelDoc | null {
  if (!raw || typeof raw !== "object") return null;
  // `spawnRate` is read off older documents and DISCARDED, not rejected —
  // release pacing is no longer a per-level number (see WAVE_RELEASE_SECONDS)
  const d = raw as Partial<LevelDoc> & { script?: unknown };
  if (!Array.isArray(d.script)) return null;

  const waits: number[] = [];
  const script: LevelStep[] = [];
  for (const step of d.script) {
    if (!step || typeof step !== "object") return null;
    if ("wait" in step) {
      const w = (step as { wait: unknown }).wait; // legacy per-step pacing
      if (typeof w !== "number" || !(w >= 0)) return null;
      waits.push(w);
      continue;
    }
    if (!("wave" in step)) return null;
    const wave = (step as { wave: unknown }).wave;
    if (typeof wave !== "object" || wave === null) return null;
    script.push(step as LevelStep);
  }

  const waveGap =
    typeof d.waveGap === "number" && d.waveGap >= 0 ? d.waveGap : commonest(waits);
  return { id, waveGap, script };
}

/** the most frequent value, ties going to the smaller; 10s if there are none */
function commonest(values: readonly number[]): number {
  if (values.length === 0) return 10;
  const seen = new Map<number, number>();
  for (const v of values) seen.set(v, (seen.get(v) ?? 0) + 1);
  return [...seen].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
}

/**
 * Overlay a world's document onto its WORLDS entry in place: the entry
 * takes the document's waveGap and script. This is the one place a
 * world's waves are ever set, so a save and a load land on identical
 * scripts by construction. A document for a world the table does not
 * hold is kept but changes nothing.
 */
export function applyLevelDoc(doc: LevelDoc): void {
  docs.set(doc.id, doc);
  const world = worldById(doc.id);
  if (!world) return;
  world.waveGap = doc.waveGap;
  world.script = [...doc.script];
}

/**
 * Pull every saved document over the shipped campaign. Safe to call more
 * than once and safe to call late; a world with no document keeps its
 * empty script and the console says so.
 *
 * The index names the worlds with a document (see fetchLevelIndex). A
 * checkout from before per-world documents lists "blueprint" instead:
 * that file was every world's script, so it loads onto every world that
 * has none of its own rather than stranding an edited campaign.
 */
export async function loadLevelDocs(): Promise<void> {
  const ids = await fetchLevelIndex();
  const legacy = ids.includes("blueprint") ? await fetchLevelDoc("blueprint") : null;
  await Promise.all(
    WORLDS.map(async (w) => {
      const doc = ids.includes(w.id) ? await fetchLevelDoc(w.id) : null;
      if (doc) applyLevelDoc(doc);
      else if (legacy) applyLevelDoc({ ...legacy, id: w.id });
    }),
  );
  for (const w of WORLDS)
    if (w.script.length === 0)
      console.error(
        `${w.name} has no waves: public/levels/${w.id}.json failed to load or is missing from public/levels/index.json`,
      );
}

/**
 * Write one world's document back to public/levels/<id>.json through the
 * dev-only API, and overlay it immediately so the running tab reflects
 * the save without a reload. A failed write changes nothing on disk and
 * the editor keeps its dirty flag.
 */
export async function saveLevel(doc: LevelDoc): Promise<SaveResult> {
  let res: Response;
  try {
    res = await fetch("/api/levels", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(doc),
    });
  } catch (err) {
    const why = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `could not reach the dev server (${why})` };
  }
  if (!res.ok) return { ok: false, error: await explain(res) };
  applyLevelDoc(doc);
  return { ok: true };
}
