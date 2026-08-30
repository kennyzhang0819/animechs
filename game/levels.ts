import { CELL, HP0, UNIT_SPEED, UR } from "./constants";
import { itemForTier, type Cost } from "./items";
import { explain, type SaveResult } from "./types";

export const UNIT_KINDS = ["dagger", "mace", "fortress", "scepter", "reign", "crawler", "atrax", "spiroct", "arkyid", "toxopid", "flare", "nova", "pulsar", "quasar", "vela", "corvus", "horizon", "zenith", "antumbra", "eclipse", "disrupt"] as const;
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
};

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
 * The status effects a unit can carry. Mindustry has dozens; this game
 * fields exactly two — StatusEffects.burning, lit by the scorch turret,
 * and StatusEffects.wet, soaked in by the liquid turrets (wave, tsunami).
 * No kind on the roster is wet-immune (upstream reserves that for naval
 * units, which Serpulo's attack waves never field), but the immunity check
 * is generic, so declaring one here is all it would take.
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
   * Unit tier, 1-5. The tier alone decides WHICH currency a kill pays out —
   * T1 drops copper, T2 titanium, T3 thorium, T4 plastanium, T5 phase
   * fabric (see items.ts) — so a level's enemy mix is what determines the
   * resources a run banks.
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
  /** flying units ignore terrain and head straight for the core; only
   * towers with targetAir (and bullets with collidesAir) touch them */
  flying?: boolean;
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
  // core. It also DRAWS half again its native scale (see UNIT_ART), and
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
};

/**
 * Mindustry's unit trees: each line is one factory's upgrade path, in tier
 * order. This is the shape a level author thinks in — "more ground, less
 * air" — so the level editor lays its unit inputs out one tree per row, and
 * a unit's position in a row is its tier.
 */
export const UNIT_TREES = [
  { name: "Ground", kinds: ["dagger", "mace", "fortress", "scepter", "reign"] },
  { name: "Support", kinds: ["nova", "pulsar", "quasar", "vela", "corvus"] },
  { name: "Crawler", kinds: ["crawler", "atrax", "spiroct", "arkyid", "toxopid"] },
  { name: "Air", kinds: ["flare", "horizon", "zenith", "antumbra", "eclipse"] },
  // not an upgrade path: the boss row holds the kinds that arrive as an
  // event rather than a stream, so its slots do not read as tiers
  { name: "Boss", kinds: ["disrupt"] },
] as const satisfies readonly { name: string; kinds: readonly UnitKind[] }[];

/**
 * Every unit kind sits in exactly one tree. Adding a kind to UNIT_KINDS
 * without placing it in a tree fails this line rather than quietly dropping
 * it out of the editor, where nobody would notice it had gone missing.
 */
type UntreedKind = Exclude<UnitKind, (typeof UNIT_TREES)[number]["kinds"][number]>;
const _everyKindHasATree: UntreedKind extends never ? true : never = true;
void _everyKindHasATree;

/**
 * What one kill of this kind pays out: exactly ONE of its tier's item. The
 * tier is the whole drop table — a T2 kill is one titanium whether it was a
 * mace or a pulsar — so a level's difficulty mix is the only thing that
 * decides what a run banks, and no unit is quietly worth more than its tier.
 *
 * EXCEPT A BOSS, WHICH DROPS NOTHING AT ALL. Its entire payout is the
 * one-time surge trophy grantRunReward pays on its first kill per
 * world+difficulty (progress.ts). A boss is an event, not income — were it
 * on the tier table, every replay would farm it like any other T5.
 */
export function unitDrop(kind: UnitKind): Cost {
  if (UNIT_STATS[kind].boss) return {};
  return { [itemForTier(UNIT_STATS[kind].tier)]: 1 };
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
 * Normalize a wave into region groups with counts indexed like UNIT_KINDS.
 * The plain kind-count form becomes one region-0 group (region 0 = any
 * pad); groups with nothing in them are dropped.
 */
export function waveGroups(
  wave: WaveUnits | readonly RegionWave[],
): { region: number; counts: number[] }[] {
  const specs: readonly RegionWave[] = Array.isArray(wave) ? wave : [{ region: 0, ...wave }];
  const groups: { region: number; counts: number[] }[] = [];
  for (const spec of specs) {
    const counts = UNIT_KINDS.map((k) => Math.max(0, spec[k] ?? 0));
    if (counts.some((c) => c > 0)) groups.push({ region: spec.region, counts });
  }
  return groups;
}

export interface LevelSpec {
  /**
   * save key — the world's ordinal as a string, e.g. "2". It is NOT shown
   * anywhere: a world is identified to the player only by its name, so this
   * must stay stable even when a world is renamed, or saves break
   */
  id: string;
  /** the world's only display name, e.g. "The Three Gates" */
  name: string;
  /** official map id this level plays on; the first official map when unset */
  map?: string;
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
 * Measured on The Three Gates, which has five drop zones: every wave up to
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
 * The editable half of a level: everything the admin level editor writes.
 * Identity and presentation (name, map) stay in code — an editor that could
 * rename a world or move it to another map would be editing the campaign's
 * structure, not its difficulty.
 */
export interface LevelDoc {
  id: string;
  waveGap: number;
  script: LevelStep[];
}

/** the document form of a level, for saving and for round-trip comparison */
export function levelDoc(spec: LevelSpec): LevelDoc {
  return {
    id: spec.id,
    waveGap: spec.waveGap,
    script: spec.script,
  };
}

/**
 * The campaign: ONE world, played at THREE difficulties, and then it is over.
 *
 * EVERY WAVE THE GAME WILL EVER SEND IS WRITTEN OUT BELOW, in order. A
 * difficulty does not generate waves — it decides HOW MANY OF THESE a run
 * plays, and at what enemy level (see DIFFICULTIES in ladder.ts):
 *
 *   Incursion   waves 1-20   enemy level  0
 *   Onslaught   waves 1-35   enemy level 10
 *   Nemesis     waves 1-50   enemy level 16
 *
 * So a difficulty buys two things at once: fifteen waves of hand-authored
 * fight nobody has seen yet, and x1.79 health on every wave below them.
 * Neither alone would carry it, and new kinds keep debuting deep into the
 * script — scepter at 21, the T5 lines through the 40s, the disrupt boss
 * at 50 — so the upper cuts are new content, not just longer runs.
 *
 * Every kind on the roster is now sent somewhere in the script. Adding one
 * to a wave is a balance decision and belongs in this list rather than in
 * a stat file — the editor's `Check ladder` prices the wave before you
 * commit.
 *
 * ANYTHING PAST WAVE 50 IS NEVER SENT; check() reports any orphans past
 * the top difficulty's cut.
 *
 * Kills are the only income: a finished run banks each dead unit's tier
 * item whether it ended in victory or defeat, times the difficulty's drop
 * bonus.
 *
 * TWO THINGS TO KNOW WHEN EDITING THIS LIST.
 *
 * ONE — a wave's position IS its difficulty gate. Wave i first appears at
 * the first difficulty whose cut reaches it, so moving a wave earlier makes
 * it arrive against a smaller fleet. The comments below mark the cuts.
 *
 * TWO — armour is flat, max(dmg - armor, 0.1 * dmg), so a fortress
 * (armour 9) against a duo (damage 9) hits the 10% floor and costs a duo
 * line ten times its printed health. That is NOT a reason it cannot debut
 * early: the floor is a floor, so nothing is ever unkillable, and a heavy
 * debut is simply a wave that asks for more farming. It is a reason to
 * know what you are asking for — debutViolations() in ladder.ts prints the
 * multiplier so the choice is deliberate.
 */
export const WORLDS: LevelSpec[] = [
  {
    id: "1",
    name: "The Three Gates",
    map: "grass-open",
    waveGap: 15,
    // ================= HOW TO AUTHOR A WAVE ========================
    //
    // THE SCRIPT IS public/levels/1.json. There is no copy in this file to
    // keep in step with it — see the note above `script` at the bottom of
    // this block. Everything below documents HOW to author a wave; WHAT the
    // waves are lives in the document, and the admin level editor writes it.
    //
    // INCURSION (waves 1-20) IS PLAYTESTED AND FIXED. Do not restructure it.
    //
    // A DIFFICULTY IS A PREFIX, NOT A SCRIPT OF ITS OWN. Onslaught plays waves
    // 1-35 and Nemesis 1-50, so both REPLAY every Incursion wave, and the rows
    // in TARGET_DROP_RATIO describe the cumulative total of a whole run.
    // Authoring can only ever ADD to a tier, never subtract, so Incursion's
    // 12,500 tier-1 bodies are the floor for every difficulty above it.
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
    // daggers, and the twelve thousand extra daggers Onslaught adds cost less
    // than its two hundred scepters. Spend the budget on T3/T4/T5 counts;
    // that is the only thing that really moves a difficulty's weight.
    //
    // NO TIER-5 BEFORE NEMESIS. Waves 21-35 must field none at all: phase
    // fabric is what spectre, meltdown and foreshadow are priced in, and
    // those three are meant to be unbuyable until Nemesis has actually been
    // played. Adding one reign to a Onslaught wave quietly unlocks the top of
    // the tech tree a difficulty early.
    //
    // THE PATTERN, past Incursion. One cycle is four waves:
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
    // THE LAST TWO WAVES OF EACH DIFFICULTY ARE HAND-WRITTEN. On Onslaught they
    // are a lull-then-finale PAIR — wave 34 (674 bodies, 0.23M health) drops
    // the floor out so wave 35 (3,505 bodies, 2.17M health) lands as a 9.7x
    // event in one wave gap. A difficulty that simply ramped to its biggest
    // wave would arrive at the same number having spent it. The lull is
    // quieter than the AIR wave before it, which is the quietest thing the
    // pattern otherwise produces.
    //
    // NEMESIS'S LAST TWO ARE A DOUBLE FINALE INSTEAD: waves 49 and 50 split
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
    // Wave 35 fields scepters and arkyids but NO tier 5, because Onslaught must
    // not (see above).
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
    // CHECK THE TOTALS, NOT THE FEEL. A difficulty's cumulative tier counts
    // have to land on TARGET_DROP_RATIO (ladder.ts), because one kill is one
    // item and that ratio IS the economy — miss it and some currency becomes
    // the only real constraint while the rest pile up unspent.
    // `window.__ladder.check()` reports the drift.
    //
    // DO NOT SIZE A DIFFICULTY AGAINST THE MAP'S AREA. A run's total bodies
    // are not its bodies on the field: units stream in over
    // WAVE_RELEASE_SECONDS and die continuously, so a difficulty that sends
    // 52,000 of them never holds a fraction of that at once. If a wave
    // outruns the drop zones they simply queue (Sim.runScript). Size against
    // TARGET_DROP_RATIO and the health step, which are the limits that bind.
    // ==============================================================
    // THE SCRIPT LIVES IN public/levels/1.json AND NOWHERE ELSE. It is
    // deliberately empty here: a second copy in code is a second campaign,
    // and the two had already diverged across all 52 waves (the code copy
    // ran about half the bodies) before this was emptied. Whatever fails to
    // load is visible as a level with no waves, which is the point — a
    // silent fall back to a different, staler campaign is the bug this
    // removes. loadLevelDocs() warns on the console when a world has no
    // document. Edit the waves in the admin level editor, or the JSON.
    script: [],
  },
  {
    // WORLD 2 — the SECOND FRONT, unlocked by the tech tree's "world-2"
    // node (the campaign menu hides it until that node is owned). For now
    // it is a DELIBERATE DUMMY: the same map and the same waves as world 1
    // — public/levels/2.json is a copy of 1.json — standing in so the
    // world picker, the per-world boss trophies and the unlock flow are
    // real before the world itself is authored. Give it its own map and
    // script when that authoring happens; nothing else needs to change.
    id: "2",
    name: "Second Front",
    map: "grass-open",
    waveGap: 15,
    script: [],
  },
];

/**
 * The campaign's FIRST world — the default everywhere a single spec is
 * wanted, and the one a fresh save plays. World 2 sits behind the tech
 * tree's "world-2" node; the campaign menu reaches it through worldById.
 *
 * Its `script` is EMPTY until loadLevelDocs() has run. Nothing reads the
 * script at module load (the sim takes WORLDS[0] as a default parameter,
 * evaluated per construction), and all three entry points — Game.create,
 * Swarmfield and the admin page — await loadLevelDocs() before a run or an
 * audit can start, so by the time anything asks, the document is on.
 */
export const WORLD = WORLDS[0];

export function worldById(id: string): LevelSpec | null {
  return WORLDS.find((w) => w.id === id) ?? null;
}

// ---------- level documents ----------

/**
 * Saved level documents live in public/maps' sibling, public/levels/<id>.json,
 * and are FETCHED rather than imported — same reasoning as the map documents
 * (see maps.ts): an imported JSON turns every editor save into a Turbopack
 * HMR update its runtime cannot hot-apply.
 *
 * Unlike maps, though, a level always exists in code first. WORLDS above is
 * the shipped campaign; a document, when one has been saved, REPLACES that
 * world's waveGap and script wholesale. So the source of truth for an
 * edited level is its JSON, and for an untouched one it is the array above —
 * never a merge of the two.
 *
 * The overlay is applied IN PLACE, which is the whole reason this is safe to
 * call late: WORLDS is never empty, never re-ordered, and never a different
 * array object. Everything that reads it synchronously at module load —
 * Sim's `WORLDS[0]` default, WORLD, progress.ts sizing the opening loadout —
 * keeps working whether or not documents have loaded yet.
 *
 * The free opening loadout does NOT follow this script. It is a fixed
 * design constant (OPENING_DUOS in ladder.ts) because it is the difficulty
 * anchor: the author decides how hard the first run should be and writes
 * the opening waves to fit that fleet, rather than the fleet silently
 * growing to absorb whatever the waves became. `Check ladder` in the level
 * editor reports the gap.
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

/** overlay one document onto its world in place; unknown ids are ignored */
export function applyLevelDoc(doc: LevelDoc): void {
  const world = WORLDS.find((w) => w.id === doc.id);
  if (!world) return;
  world.waveGap = doc.waveGap;
  world.script = doc.script;
}

/**
 * Pull every saved level document over the shipped campaign. Safe to call
 * more than once and safe to call late; a level with no document keeps
 * exactly what WORLDS declares.
 */
export async function loadLevelDocs(): Promise<void> {
  const ids = await fetchLevelIndex();
  const edited = ids.filter((id) => WORLDS.some((w) => w.id === id));
  const docs = await Promise.all(edited.map(fetchLevelDoc));
  for (const doc of docs) if (doc) applyLevelDoc(doc);
  // A world whose document did not arrive has no waves at all, because the
  // script lives only in the document now. That is a loud failure by design
  // — the alternative was a stale second script in code, silently playing a
  // different campaign — but it still deserves a line in the console rather
  // than leaving someone to wonder why nothing spawns.
  for (const w of WORLDS)
    if (w.script.length === 0)
      console.error(
        `level "${w.id}" has no waves: public/levels/${w.id}.json failed to load or is missing from public/levels/index.json`,
      );
}

/**
 * Write a level document back to public/levels/<id>.json through the
 * dev-only API, and overlay it immediately so the running tab reflects the
 * save without a reload. false means the write failed and nothing changed
 * on disk — the editor keeps its dirty flag.
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
