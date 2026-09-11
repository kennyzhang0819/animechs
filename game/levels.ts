import { CELL, HP0, UNIT_SPEED, UR, type MoveLayer } from "./constants";
import { explain, type SaveResult } from "./types";
import { addDrop, dropForUnit, emptyDrop, type Drop } from "./economy";
// type only — mutation.ts must never depend on the campaign, and this
// import must never become a value one or the two files form a cycle
import type { MutationId } from "./mutation";

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
 * THE NAVAL TANKS RUN SLOWER THAN MINDUSTRY'S HULLS. A risso's stock 1.1
 * units a tick is 8.25 tiles a second — more than twice a dagger — and on
 * a water route a third the length of Confluence's march that is a body a
 * wave-1 board sees for five seconds. Every naval speed below carries
 * this factor: a risso at 4.5 tiles a second is still the fastest tier-1
 * body in the game, and the line is still the fast line, but the front can
 * be held by the turrets a fresh run has. Change it here, not per hull —
 * and note the number is the speed AFLOAT, halved ashore by
 * NAVAL_LAND_SPEED.
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
  /** Health. THIS IS WHAT A KILL PAYS: the drop is the pool times
   *  SCRAP_PER_HP (economy.ts), so a heavier kind is worth more scrap and a
   *  stats edit here moves the salvage with it. No XP either way — XP is
   *  paid per wave cleared (MISSION_XP), never per body */
  hp: number;
  /** world px/s */
  speed: number;
  /** flat damage shaved off every hit, floored at 10% of the raw shot */
  armor: number;
  /** collision radius in world px — half the square hitbox edge */
  radius: number;
  /**
   * Unit tier, 1-5. A shelf in the unit trees and a weight on the audit
   * (ladder.ts) — NOT a price: the scrap a kill pays comes off `hp` above,
   * which is why the T4 and T5 hulls pay what their bodies are worth. A
   * level's enemy mix therefore decides the run's income and nothing about
   * the save's XP, which is a fact about the waves cleared (MISSION_XP).
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
   * NAVAL: this kind travels on the WATER layer, which is the AMPHIBIOUS
   * one. A naval tank crosses deep water AND dry land — the walkers'
   * ground plus the one thing the walkers cannot enter — so the movement
   * layers (MOVE_LAYERS in constants.ts) still decide its flow field, its
   * drop zones and its exits, and a naval kind is a STATS EDIT like every
   * other unit.
   *
   * IT IS SLOWER ASHORE, and only slower: NAVAL_LAND_SPEED scales the
   * drive on any cell that is not a water floor. The field never reads
   * that number, so the route is a plain shortest path over "rock, and
   * nothing else" — a tank swims the channel when the channel is on the
   * way to the core and drives round it when it is not.
   *
   * Upstream never writes this either: UnitType.init sets `naval = true`
   * for anything built on WaterMovec, which is exactly the ten hulls of
   * the two naval trees. Where we depart from Mindustry is the coming
   * ashore — a WaterMovec hull there may never leave the water, and deep
   * water is a wall to the walkers and a road to the hulls. Here it is a
   * wall to the walkers and a road to the tanks, and the land is a road
   * to both.
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
  // scepter: the ground line's T4 — 9000 hp, armor 20, a 2.75x2.75-block
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
    armor: 20,
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
  // armor 30 is the number that matters. Armour is a flat shave floored at
  // a tenth of the raw shot (see Sim.applyArmor), so anything firing under
  // 20 a hit is reduced to paying the floor: a duo's 9-damage bolt lands 0.9
  // instead of 9, and a full duo wall does a tenth of its paper DPS. The
  // counter is calibre, not volume — one lancer hit clears the shave twice
  // over. No ability: at this weight it does not need one
  reign: {
    hp: 24000,
    speed: 3 * CELL,
    armor: 30,
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
  // spiroct: the line's T3 — 1000 hp, armor 9, a 1.875x1.875-block hitbox,
  // 0.54 px/tick = 4.05 tiles/s, the slowest thing on the field. Six legs
  // on longer mounts (legBaseOffset 2) stepping three at a time
  spiroct: {
    hp: 1000,
    speed: 4.05 * CELL,
    armor: 9,
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
  // arkyid: the crawler line's T4 — 8000 hp, armor 14, a 2.875x2.875-block
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
    armor: 14,
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
  // toxopid: the crawler line's T5 — 22000 hp, armor 22, a 3.25x3.25-block
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
    armor: 22,
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
  // nova: the T1 of the support line — 200 hp, armor 1, 1x1-block hitbox,
  // 0.55 px/tick = 4.125 tiles/s. Frailer than a dagger but a step quicker
  // RepairFieldAbility(10, 60*4, 60): 10 hp to everything within 7.5 tiles,
  // every 4 s — a nova escort keeps a dagger line topped up between volleys
  nova: {
    hp: 200,
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
  // ForceFieldAbility(60, 0.4, 500, 60*6): a 7.5-tile bubble holding 500
  // points, refilling at 24/s and dark for 6 s once it breaks (Mindustry
  // draws it as a hexagon; here every force field is a circle). Where nova
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
    },
  },
  // vela: the support line's T4 — 8200 hp, armor 16, a 3x3-block hitbox,
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
    armor: 16,
    radius: UR * 3,
    tier: 4,
    rotateSpeed: 1.8,
    immunities: ["burning"],
  },
  // corvus: the support line's T5 — 18000 hp, armor 14, a 3.625x3.625-block
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
    armor: 14,
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
  // antumbra: the air line's T4 — 7200 hp, armor 17, and a 5.75x5.75-block
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
    armor: 17,
    radius: UR * 5.75,
    tier: 4,
    drag: 0.04,
    rotateSpeed: 1.9,
    flying: true,
  },
  // eclipse: the air line's T5 — 22000 hp, armor 22, and a 7.25x7.25-block
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
    armor: 22,
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
  // (x4 at first; doubled again when the phase turrets melted it before it
  // loomed, then x12 when x8 still fell too fast). Armour is 30
  // over the official 9 — far past the reign's 18, so anything hitting
  // under ~33 pays the 10% floor: pellet AA, duos and salvos all read as
  // sparks off the hull, and the answer is calibre, which is what the
  // phase turrets are. Speed drops from the official 1 unit/tick
  // (7.5 tiles/s, crawler pace — it would outrun its own escort and reach
  // the AA line alone) to 2.0 tiles/s, the slowest thing in the game: a
  // boss is a deadline the player watches coming, not a sprinter. Its
  // suppression field and missile racks stay behind on Erekir — enemies
  // here do not shoot — so what crosses the map is the hull, the looming
  // pace, and 144000 health the board has to answer before it reaches the
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

  // ---- THE NAVAL TANKS ----
  //
  // Ten hulls in two trees, and the roster's third movement layer. Every
  // one of them is `naval` (UnitType.init's water preset, see UnitStats)
  // and therefore wet-immune, and every one carries a wake. Their numbers
  // are otherwise read off mindustry/content/UnitTypes.java like every
  // walker's — hitSize/8 tiles of hitbox, speed x 7.5 tiles a second.
  //
  // THESE ARE THE SPEEDS AFLOAT. A naval tank ashore drives at
  // NAVAL_LAND_SPEED of the number below, which is the only thing the
  // land costs it — the route it takes there is the walkers' own.
  //
  // A tank's speed is the thing to read twice. The naval line tops out at
  // 8.25 tiles/s (risso) and BOTTOMS OUT at 4.65 (omura) — so the fastest
  // boat in the game is barely quicker than a crawler, and the slowest is
  // still quicker than a scepter. The whole fleet moves inside a band the
  // ground roster spreads three times as wide, which is what makes a water
  // lane read as one advancing formation rather than a strung-out column.

  // risso: the naval line's T1 — 280 hp, armor 2, a 1.25x1.25-block hitbox,
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
  // navanax: the support fleet's T5 — 20000 hp, armor 20, and the omura's
  // 7.25x7.25-block hitbox, at 0.65 units/tick = 4.875 tiles/s. Its EMP
  // cannon heals through its shots (healPercent 20 on the bullet), which
  // is a weapon again, so the top of this tree is a bare hull like the
  // top of every other support tree — corvus, vela and this one all
  // arrive with nothing but their size
  navanax: {
    hp: 20000,
    speed: 4.875 * CELL * NAVAL_PACE,
    armor: 20,
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
  { key: "ground", name: "Ground mechs", kinds: ["dagger", "mace", "fortress", "scepter", "reign"] },
  { key: "support", name: "Starlight mechs", kinds: ["nova", "pulsar", "quasar", "vela", "corvus"] },
  { key: "crawler", name: "Venom crawlers", kinds: ["crawler", "atrax", "spiroct", "arkyid", "toxopid"] },
  { key: "air", name: "Sky gunships", kinds: ["flare", "horizon", "zenith", "antumbra", "eclipse"] },
  // the two naval tank trees: upgrade paths like the four above, on the
  // amphibious layer. They used to be the only rows whose units needed a
  // MAP to field them — a wave asking for rissos on a map with no water
  // sent nothing at all — and they no longer are: a naval tank comes in
  // by a ground door and drives to the core when there is no sea
  { key: "naval", name: "Naval tanks", kinds: ["risso", "minke", "bryde", "sei", "omura"] },
  { key: "navalSupport", name: "Aegis tanks", kinds: ["retusa", "oxynoe", "cyerce", "aegires", "navanax"] },
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

/** the drop for one unit kind: scrap off its health, a boss its lump on top (economy.ts) */
export function unitDrop(kind: UnitKind): Drop {
  const s = UNIT_STATS[kind];
  return dropForUnit(s.hp, s.boss === true);
}

/**
 * What a run's kills are worth IN SCRAP: each kind's drop times how many
 * of it went down. The drop is fixed per KIND (economy.ts) — it reads the
 * kind's authored health, never the body's remaining or rung-scaled pool.
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

// ---------- families ----------

/**
 * THE UNIT FAMILIES — Mindustry's trees, five tiers each, in tier order.
 * A family is what a wave is authored in and what the deploy's die roll
 * swaps: a wave that sends "forty of the first ground body" sends forty
 * of the first body of whichever family took that slot (transformScript).
 *
 * `layer` is the movement layer the family travels on: which field it
 * steers by and which doors it comes in through. It no longer decides
 * WHERE a family may play — every layer can cross every map now that the
 * naval one is amphibious (navalWalkMask) and every layer falls back to
 * the map's other doors (Sim.padMaskFor), so every family rolls
 * everywhere (rollFamilies). Disrupt — the one boss — is in no family and
 * is never swapped: a boss is an event, not a volume.
 */
export const FAMILIES = [
  // the mechs of the line: a blade, a mace, a bunker, a sceptre and a
  // crown — Mindustry named this tree after the regalia of a war
  { key: "ground", name: "Ground mechs", layer: "ground", icon: "dagger",
    kinds: ["dagger", "mace", "fortress", "scepter", "reign"] },
  // the spiders, and every one of them a poison: the crawler's blast, the
  // atrax's acid, the spiroct's sap, the toxopid's name itself
  { key: "crawler", name: "Venom crawlers", layer: "ground", icon: "crawler",
    kinds: ["crawler", "atrax", "spiroct", "arkyid", "toxopid"] },
  // named for stars, armed with light: nova, pulsar, quasar, vela, corvus,
  // and not one ballistic gun between them
  { key: "groundSupport", name: "Starlight mechs", layer: "ground", icon: "nova",
    kinds: ["nova", "pulsar", "quasar", "vela", "corvus"] },
  // the sky's own words — a flare, a horizon, a zenith, a shadow and an
  // eclipse — hung on five gunships
  { key: "air", name: "Sky gunships", layer: "air", icon: "flare",
    kinds: ["flare", "horizon", "zenith", "antumbra", "eclipse"] },
  // the whales: risso, minke, bryde, sei, omura. Amphibious armour, quick
  // in the water and a third down on it ashore (NAVAL_LAND_SPEED)
  { key: "naval", name: "Naval tanks", layer: "water", icon: "risso",
    kinds: ["risso", "minke", "bryde", "sei", "omura"] },
  // the sea slugs, and the aegis is one of them by name: retusa, oxynoe,
  // cyerce, AEGIRES, navanax — hulls that carry a shield rather than a gun
  { key: "navalSupport", name: "Aegis tanks", layer: "water", icon: "retusa",
    kinds: ["retusa", "oxynoe", "cyerce", "aegires", "navanax"] },
] as const satisfies readonly {
  key: string;
  name: string;
  layer: MoveLayer;
  icon: UnitKind;
  kinds: readonly UnitKind[];
}[];

export type FamilyKey = (typeof FAMILIES)[number]["key"];

/**
 * THE FAMILIES OFF THE BOARD, and the whole of how one gets there: name it
 * here. A shelved family keeps its bodies, its stats and its sprites —
 * every line of it is live code — it is simply never rolled into a wave
 * (rollFamilies), so it cannot be met.
 * Take the name back out and it is on the board again, at the level the
 * track always meant to open it on.
 *
 * The Aegis tanks are shelved while the support lines are re-cut: a
 * support family is meant to hold a front on its own rather than to prop
 * up whatever it was dealt beside, and until its bodies are worth that
 * it is a slot the die can spend on nothing.
 */
export const SHELVED_FAMILIES: readonly FamilyKey[] = ["navalSupport"];

/** the families in play: the table, less the shelf */
export const ACTIVE_FAMILIES: readonly FamilyKey[] = FAMILIES.map((f) => f.key).filter(
  (k) => !SHELVED_FAMILIES.includes(k),
);

/** how many families a deploy sends — the die picks this many */
export const FAMILIES_PER_RUN = 3;

/** the family a kind belongs to, or null for the boss */
const FAMILY_OF: Partial<Record<UnitKind, FamilyKey>> = {};
for (const f of FAMILIES) for (const k of f.kinds) FAMILY_OF[k] = f.key;
export const familyOf = (kind: UnitKind): FamilyKey | null => FAMILY_OF[kind] ?? null;

/** a family's entry by key — every key in FamilyKey is in the table */
export const familyByKey = (key: FamilyKey) => FAMILIES.find((f) => f.key === key)!;

/** a kind's tier index within its family, 0-4 */
const tierIndexOf = (kind: UnitKind): number => {
  const f = familyOf(kind);
  return f ? (familyByKey(f).kinds as readonly UnitKind[]).indexOf(kind) : -1;
};

/**
 * The families a script is authored in, in order of first appearance —
 * the SLOTS the roll fills. The campaign's script is written in three
 * (ground, ground support, air), and that order is what the deploy's
 * three families are dealt into.
 */
export function scriptFamilies(script: readonly LevelStep[]): FamilyKey[] {
  const out: FamilyKey[] = [];
  for (const step of script)
    for (const g of waveGroups(step.wave))
      g.counts.forEach((c, i) => {
        if (c <= 0) return;
        const f = familyOf(UNIT_KINDS[i]);
        if (f && !out.includes(f)) out.push(f);
      });
  return out;
}

/**
 * THE DIE ROLL: FAMILIES_PER_RUN families, in a random order — the order
 * is the deal, since slot i of the script plays as families[i].
 *
 * EVERY FAMILY IN PLAY IS ELIGIBLE ON EVERY MAP. This used to be drawn
 * against the map's doors, and a map with no water door could not roll a
 * naval family at all; the naval layer is amphibious now (navalWalkMask)
 * and every layer falls back to whatever doors the map does paint
 * (Sim.padMaskFor), so there is no longer such a thing as a map a family
 * cannot play. The only thing that keeps a family out of the draw is the
 * shelf (SHELVED_FAMILIES).
 */
export function rollFamilies(rand: () => number = Math.random): FamilyKey[] {
  const pool: FamilyKey[] = [...ACTIVE_FAMILIES];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, FAMILIES_PER_RUN);
}

/**
 * THE WAVE TRANSFORMATION: the script re-cast into the rolled families,
 * tier for tier. The script's families (scriptFamilies, in order) are
 * its slots; slot i becomes families[i]. A script with more slots than
 * the deal has families wraps — its fourth family plays as the first
 * again — so nothing authored is dropped, and one with fewer leaves the
 * spare families unsent. The boss is never touched. Two slots landing on
 * one family add their counts.
 */
export function transformScript(
  script: readonly LevelStep[],
  families: readonly FamilyKey[],
): LevelStep[] {
  if (families.length === 0) return [...script];
  const slots = scriptFamilies(script);
  const cast = new Map<FamilyKey, FamilyKey>();
  slots.forEach((f, i) => cast.set(f, families[i % families.length]));
  const recast = <T extends WaveUnits>(w: T): T => {
    const out: WaveUnits = {};
    if ("region" in w) (out as RegionWave).region = (w as RegionWave).region;
    for (const k of UNIT_KINDS) {
      const c = w[k] ?? 0;
      if (c <= 0) continue;
      const from = familyOf(k);
      const to = from ? cast.get(from) : null;
      const kind = to ? familyByKey(to).kinds[tierIndexOf(k)] : k;
      out[kind] = (out[kind] ?? 0) + c;
    }
    return out as T;
  };
  return script.map((step) => ({
    ...step,
    wave: Array.isArray(step.wave)
      ? (step.wave as readonly RegionWave[]).map(recast)
      : recast(step.wave as WaveUnits),
  }));
}

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
 * A MAP'S MISSION. Two shapes so far:
 *
 *   hold     — clear every wave the script sends. The classic assignment.
 *   survive  — last `minutes` on the clock. The script plays through and,
 *              if the clock is still running when it ends, its LAST wave
 *              is sent again and again, each repeat a level tougher
 *              (Sim.loadStep) — a tide that does not stop until time does.
 *
 * Either way THE CORE IS THE STAKE: the swarm walks at it and shoots it
 * (CORE_HP in constants.ts), and the run is lost the moment it falls.
 * Nothing leaks and nothing is counted in lives — a body that reaches the
 * core is a body at the core, chewing on it.
 */
export type Mission =
  | { kind: "hold" }
  | { kind: "survive"; minutes: number };

/** the mission as the deploy panel and the HUD say it: a headline and a clause */
export function missionText(spec: LevelSpec): { title: string; detail: string } {
  const m = spec.mission;
  const waves = spec.script.length;
  if (m.kind === "survive")
    return {
      title: `Survive ${m.minutes} minutes`,
      detail: "The waves do not stop until the clock does. The core must stand.",
    };
  return { title: `Hold the line — ${waves} waves`, detail: "Clear every wave. The core must stand." };
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
   * WHAT THIS MAP ASKS OF A RUN — the mission (see Mission). Every map is
   * its own assignment, the way a co-op map is: hold the line for every
   * wave, or last the clock out, with the core standing at the end of it.
   */
  mission: Mission;
  /**
   * seconds held between waves. The clock starts when the previous wave
   * has finished ENTERING the field — the last unit spawning, not the last
   * unit dying — so a level whose waves outlive the gap will have several
   * on the field at once. Fifteen seconds as authored (WAVE_GAP_DEFAULT):
   * the run is a tide, and the waves overlap.
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
   * THE FAMILIES THIS RUN SENDS — the die roll (rollFamilies) the deploy
   * made, in slot order: the script's first
   * family plays as families[0], its second as families[1], its third as
   * families[2] (transformScript). Unset is the script as authored, which
   * is what the editor and the audit arithmetic price.
   */
  families?: readonly FamilyKey[];
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
 * THE RUN'S CLOCK, as authored: a wave every fifteen seconds, fifty of
 * them, each stronger than the last. The document
 * (public/levels/campaign.json) sets the gap; this is what a missing
 * document or a missing field plays.
 */
export const WAVE_GAP_DEFAULT = 15;

/**
 * The OPENING gap only, in seconds. Every later wave waits WAVE_GAP_DEFAULT
 * (or whatever the document sets); the first one lands almost at once, so a
 * run starts playing instead of watching an empty map count down.
 */
export const WAVE_GAP_OPENING = 3;

/**
 * The documents as last loaded or saved, by world id — the raw counts the
 * level editor edits. A world absent here has no document yet and plays
 * the empty script WORLDS ships with, which is a visible failure where a
 * stale second copy in code would be a silent different campaign.
 */
const docs = new Map<string, LevelDoc>();

/**
 * THE ONE SCRIPT. Every map plays the same fifty waves — the document
 * under this id in public/levels — and what makes one map different
 * from the next is its ground, its doors and the family roll the deploy
 * makes (rollFamilies). A world id passed to levelDocOf is accepted and
 * ignored, so an editor opened on any world edits the campaign.
 */
export const CAMPAIGN_DOC_ID = "campaign";

/** the current document — the campaign's, whichever world asks */
export function levelDocOf(_worldId?: string): LevelDoc {
  return (
    docs.get(CAMPAIGN_DOC_ID) ?? {
      id: CAMPAIGN_DOC_ID,
      waveGap: WAVE_GAP_DEFAULT,
      script: [],
    }
  );
}

/**
 * THE MAPS. Every map plays the same eight waves (CAMPAIGN_DOC_ID), and
 * what makes one map different from the next is its ground and its
 * doors. Every family may be rolled on every map (rollFamilies) — every
 * movement layer crosses every ground now, and comes in by whatever door
 * the map does paint — and the shared script is re-cast into the three
 * the deploy rolled (transformScript). The identity (name, map,
 * mission) is this table's; no map carries rules of its own — all maps
 * are equal, and every mutator is in every roll.
 *
 * Every map is played at TEN RUNGS of difficulty (RUNGS in ladder.ts): a
 * rung changes the rules rolled and the XP paid, never the script — so
 * every number the audit prints about a map is true at every rung.
 *
 * Kills are the run's income: every dead body pays scrap off its own
 * health pool into the run (economy.ts). The save is paid by the WAVE: every wave cleared
 * banks its share of MISSION_XP, win or lose, and the rung multiplies it
 * (tierXpBonus in ladder.ts).
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
    mission: { kind: "hold" },
    waveGap: WAVE_GAP_DEFAULT,
    // ================= HOW TO AUTHOR A WAVE ========================
    //
    // THE SCRIPT IS public/levels/campaign.json — the waves EVERY map
    // plays. There is no copy in this file to keep in step with it — see
    // the note above `script` at the bottom of this block. Everything
    // below documents HOW to author a wave; WHAT the waves are lives in
    // the document, and the admin level editor writes it. It is authored
    // in three families (ground, ground support, air) and those are its
    // three SLOTS: a deploy rolls three of the six families and deals
    // them into the slots (transformScript), so the counts
    // travel to every map and the bodies are whatever the die said.
    //
    // EVERY RUNG PLAYS THIS WHOLE LIST. There is one run per map and ten
    // difficulties to play it at, and a rung only scales the counts
    // (COUNT_SCALE in ladder.ts) — no wave is ever cut. THE SCRIPT IS
    // FIFTY WAVES, fifteen seconds apart, each stronger than the last: a
    // few dozen daggers on wave 1, the first heavies by wave 10, waves in
    // the thousands by the end, and the disrupt as the boss that closes
    // it. The waves overlap — the gap is shorter than a wave takes to
    // walk the lane — so the field is a tide, not a series of fights.
    //
    //   line       T1        T2       T3         T4         T5
    //   dagger     dagger    mace     fortress   scepter    reign
    //   crawler    crawler   atrax    spiroct    arkyid     toxopid
    //   support    nova      pulsar   quasar     vela       corvus
    //   air        flare     horizon  zenith     antumbra   eclipse
    //
    // KEEP SENDING TIER-1 UNITS. They are the line's body, and nearly
    // free in the health budget — 150 hp against a scepter's 9,000, so one
    // T4 weighs as much as sixty daggers. Spend the budget on T3/T4/T5
    // counts; that is the only thing that really moves a wave's weight.
    //
    // THE HEAVY KINDS LAND WHERE THE DROPS CAN HAVE PAID FOR THEIR
    // ANSWER: a body pays scrap off its health when it dies (economy.ts),
    // and the heavies pay the most of it, so
    // the tier-3 turrets (fuse up to foreshadow) arrive on the bank the
    // middle script has filled, which is why the tier-5 bodies start
    // deep in the second half.
    script: [],
  },
  {
    // WORLD 2 — the SECOND FRONT, opened by climbing Confluence rather
    // than by buying anything (see WORLD_REQUIRES in ladder.ts).
    //
    // ITS MAP IS ITS OWN AND ITS WAVES ARE THE CAMPAIGN'S. Maelstrom is
    // a coast — the sea along its north and east edges, a bay under the
    // core — so a naval roll here comes in off the water and takes a
    // route no other map can offer it.
    id: "2",
    name: "Maelstrom",
    map: "maelstrom",
    // THE NAVAL FRONT: hold the eight, tanks off the sea where the die deals them
    mission: { kind: "hold" },
    waveGap: WAVE_GAP_DEFAULT,
    script: [],
  },
  {
    id: "3",
    name: "Quagmire",
    map: "quagmire",
    // THE SWAMP: its core stands on the west edge behind one causeway and
    // its bodies wade in heavier than they spawned. It plays the campaign's
    // eight like every map; its doors decide which families the die may
    // deal it.
    mission: { kind: "hold" },
    waveGap: WAVE_GAP_DEFAULT,
    script: [],
  },
  {
    id: "4",
    name: "Greenwood",
    map: "greenwood",
    // THE EARTHY ONE: dirt roads under dirt cliffs, grass and pine stands, two lakes; four gates on the west, south and north, the core in the north-east corner behind one antechamber
    mission: { kind: "hold" },
    waveGap: WAVE_GAP_DEFAULT,
    script: [],
  },
  {
    id: "5",
    name: "Tundra",
    map: "tundra",
    // THE SNOWY ONE: snow under snow walls, ice round two frozen lakes, shale outcrops, snow pines; four gates on the south corners and the east and west edges, the core on the north edge
    mission: { kind: "hold" },
    waveGap: WAVE_GAP_DEFAULT,
    script: [],
  },
  {
    id: "6",
    name: "Crater",
    map: "crater",
    // THE CORE IN THE MIDDLE, in a basalt crater with six mouths, and six gates round the edge coming at it from every side. No funnel: the crater's rim is the defence
    mission: { kind: "hold" },
    waveGap: WAVE_GAP_DEFAULT,
    script: [],
  },
  {
    id: "7",
    name: "Shoals",
    map: "shoals",
    // THE ARCHIPELAGO: two thirds of the board is sea, every road between the sand islands is a bar of shallow the swarm wades, the hulls come from the north and south seas, the core on the west island behind one causeway
    mission: { kind: "hold" },
    waveGap: WAVE_GAP_DEFAULT,
    script: [],
  },
  {
    id: "8",
    name: "Riverlands",
    map: "riverlands",
    // THE CORE IN THE MIDDLE WITH RIVERS RUNNING TO IT: the hulls sail in from the west, east and south edges to the pool beside the core, and five ground gates come from the north and the corners, fording the rivers on the way
    mission: { kind: "hold" },
    waveGap: WAVE_GAP_DEFAULT,
    script: [],
  },
  {
    id: "9",
    name: "Estuary",
    map: "estuary",
    // THE ESTUARY: the sea fills the south of the board, a river comes down from the north-east to meet it, and the core stands on the north shore where the river opens out; four ground gates inland, the hulls from the sea and down the river
    mission: { kind: "hold" },
    waveGap: WAVE_GAP_DEFAULT,
    script: [],
  },
];

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
  const clean = { ...doc, id: CAMPAIGN_DOC_ID };
  docs.set(CAMPAIGN_DOC_ID, clean);
  // one script, every world: the map is what differs, never the waves
  for (const world of WORLDS) {
    world.waveGap = clean.waveGap;
    world.script = [...clean.script];
  }
}

/**
 * Pull the saved campaign over the shipped worlds. Safe to call more than
 * once and safe to call late; with no document every world keeps its
 * empty script and the console says so.
 *
 * The index names the documents there are (see fetchLevelIndex). The
 * campaign's is CAMPAIGN_DOC_ID; a checkout from before one shared script
 * lists the first world's id (or, older still, "blueprint"), and either
 * of those was the campaign, so it loads rather than stranding an edited
 * one.
 */
export async function loadLevelDocs(): Promise<void> {
  const ids = await fetchLevelIndex();
  const id = [CAMPAIGN_DOC_ID, WORLD.id, "blueprint"].find((k) => ids.includes(k));
  const doc = id ? await fetchLevelDoc(id) : null;
  if (doc) applyLevelDoc(doc);
  else
    console.error(
      `the campaign has no waves: public/levels/${CAMPAIGN_DOC_ID}.json failed to load or is missing from public/levels/index.json`,
    );
}

/**
 * Write the campaign's document back to public/levels/campaign.json
 * through the dev-only API, and overlay it immediately so the running
 * tab reflects the save without a reload. A failed write changes nothing on disk and
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
