import { CELL, HP0, PAL, TEAM_CRUX_RGB, UNIT_SPEED, UR, type MoveLayer } from "./constants";
import { ANIMAL_ART } from "./animalFlag";
import { explain, type RGB, type SaveResult } from "./types";
import { addDrop, dropForUnit, emptyDrop, type Drop } from "./economy";
// type only — mutation.ts must never depend on the campaign, and this
// import must never become a value one or the two files form a cycle
import type { MutationId } from "./mutation";

export const UNIT_KINDS = ["ironhide1", "ironhide2", "ironhide3", "ironhide4", "ironhide5", "weaver1", "weaver2", "weaver3", "weaver4", "weaver5", "starhart1", "starhart2", "starhart3", "starhart4", "starhart5", "stoop1", "stoop2", "stoop3", "stoop4", "stoop5", "skate1", "skate2", "skate3", "skate4", "skate5", "livewire1", "livewire2", "livewire3", "livewire4", "livewire5", "boss"] as const;
export type UnitKind = (typeof UNIT_KINDS)[number];
export type { TowerKind } from "./types";

/** numeric unit id — index into UNIT_KINDS, stored in the sim's ukind array */
export const UNIT_ID: Record<UnitKind, number> = {
  ironhide1: 0,
  ironhide2: 1,
  ironhide3: 2,
  ironhide4: 3,
  ironhide5: 4,
  weaver1: 5,
  weaver2: 6,
  weaver3: 7,
  weaver4: 8,
  weaver5: 9,
  starhart1: 10,
  starhart2: 11,
  starhart3: 12,
  starhart4: 13,
  starhart5: 14,
  stoop1: 15,
  stoop2: 16,
  stoop3: 17,
  stoop4: 18,
  stoop5: 19,
  skate1: 20,
  skate2: 21,
  skate3: 22,
  skate4: 23,
  skate5: 24,
  livewire1: 25,
  livewire2: 26,
  livewire3: 27,
  livewire4: 28,
  livewire5: 29,
  boss: 30,
};

/**
 * WHAT A FAMILY IS CALLED, and what one of its bodies is called — in one
 * place, because two tables name the same six lines (UNIT_TREES for the
 * editor's rows, FAMILIES for the deal) and a family renamed in one of
 * them and not the other is a family with two names.
 *
 * The four the animal art has taken over are named for their ANIMAL now,
 * not for their weapon — the line is a herd of rhinos, not "ground mechs"
 * — and the gimmick behind the name is untouched: the Ironhides still
 * fire the straight round, the Dartbacks still rot what they hit. The two
 * six lines are drawn now (game/animalArt.ts), so all six are named for
 * the animal rather than the weapon: the fleets are Skates (manta) and
 * Livewires (narwhal), not the harpoon and wraith fleets they were while
 * upstream's whales and sea slugs were still on screen.
 *
 * `body` is the SINGULAR the family's five bodies are named off — the
 * family word without its plural or its "fleet" — because a body is not
 * given a name of its own (UNIT_NAMES). Off the switch, all six read
 * exactly as they shipped.
 */
export const FAMILY_NAMES = {
  ground: { name: ANIMAL_ART ? "Ironhides" : "Ground mechs", body: "Ironhide" },
  // the kind ids stay `weaver1`..`weaver5` (the sim's arrays and every wave
  // on disk name them); the family is the poison frog on screen
  weaver: { name: ANIMAL_ART ? "Dartbacks" : "Venom spitters", body: "Dartback" },
  groundSupport: { name: ANIMAL_ART ? "Starhart" : "Starlight mechs", body: "Starhart" },
  air: { name: ANIMAL_ART ? "Stoop" : "Skyfall bombers", body: "Stoop" },
  naval: { name: ANIMAL_ART ? "Skates" : "Harpoon fleet", body: "Skate" },
  navalSupport: { name: ANIMAL_ART ? "Livewires" : "Wraith fleet", body: "Livewire" },
} as const satisfies Record<string, { name: string; body: string }>;

/**
 * THE NAVAL TANKS RUN SLOWER THAN MINDUSTRY'S HULLS. A skate1's stock 1.1
 * units a tick is 8.25 tiles a second — more than twice an ironhide1 — and on
 * a water route a third the length of Confluence's march that is a body a
 * wave-1 board sees for five seconds. Every naval speed below carries
 * this factor. IT IS THE SNIPER FAMILY NOW (weapons.ts, the Harpoon
 * fleet): it fires from beyond the board's reach and GROWS THE LONGER IT
 * LIVES (veteran), so the crawl is the point — a hull that took two
 * minutes to reach the guns has been shooting them for two minutes and
 * hits three times as hard when it gets there. Change it here, not per
 * hull — and note the number is the STAT: half again afloat, half ashore
 * (constants.ts NAVAL_WATER_SPEED / NAVAL_LAND_SPEED).
 */
const NAVAL_PACE = 0.45;

/**
 * ...AND THE WRAITH FLEET RUNS AT TWICE THAT. The crawl is the SNIPER
 * family's premise, not this one's: a wraith carries no rail and no
 * veterancy, it BLINKS forward out of a hit and the top three go dark on
 * a cycle (blink, cloak), and every one of those reads as speed. At the
 * Harpoon fleet's pace the fleet that is supposed to be impossible to
 * hold a target on arrived slowly enough to be shot at leisure between
 * the hops, which made the whole family a worse Harpoon fleet.
 *
 * IT IS ALSO LESS TAXED ASHORE (WRAITH_LAND_SPEED): a beach is where the
 * hops happen, and the family cannot be quick in the water and a sitting
 * target on the sand.
 */
const WRAITH_PACE = NAVAL_PACE * 2;

/**
 * WHAT A WRAITH LOSES ASHORE (UnitStats.landSpeed) — a fifth, against the
 * half the Harpoon fleet pays (constants.ts NAVAL_LAND_SPEED). Same
 * reason as the pace above: the beach is this family's ground, so the
 * land tax cannot be the thing that decides its fights.
 */
const WRAITH_LAND_SPEED = 0.8;

/**
 * THE HARPOON FLEET'S VETERANCY (UnitStats.veteran), one number for all
 * five hulls: a hit grows by 2.5% of its row a second alive, to triple —
 * eighty seconds to full, half a minute round a skate4 (drillField). The rows
 * in weapons.ts are set light against this: a fresh fleet is a nuisance
 * at forty tiles and an old one is a siege.
 */
const HARPOON_VETERAN = { perSecond: 0.025, max: 2 } as const;

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
   * signed (weaver4's is -15) but only its magnitude ever reaches the
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

/**
 * THE WORM RIG: a chain of body segments the sim drags behind the head.
 * Each segment follows the one ahead of it at `spacing`, so the body lies
 * along the path the head took and bends where it turned. It is display
 * only — the hitbox is the head's — and the renderer lays a body sprite
 * on every segment and a tail past the last one (Renderer.pushSegments,
 * SEGMENT_ART in atlas.ts). The eels rode it until the narwhal replaced
 * them; it has no rider now and waits for the centipede, which is the same
 * chain with legs drawn on the segments.
 */
export interface SegmentSpec {
  /** how many segments trail the head */
  count: number;
  /** the distance each keeps from the one ahead, world px */
  spacing: number;
  /** how far behind the head's centre the chain hangs from (the neck), world px */
  neck: number;
  /**
   * THE SWIM. The neck sways across the heading as the head moves — a
   * sine whose phase advances with distance travelled, one full cycle
   * per `wavelength` of path — so the body is pulled along a sinuous
   * path and the curve travels back down it, the way an eel's does.
   * `amp` is the sway's half width, world px. A standing body is
   * straight but for a slow idle sway (a cycle every few seconds).
   */
  amp: number;
  wavelength: number;
}
export const worm = (count: number, spacing: number, neck: number, amp: number, wavelength: number): SegmentSpec =>
  ({ count, spacing, neck, amp, wavelength });

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
 * it by the hull's speed is what makes a slow skate5's 70-point wake and a
 * quick skate1's 20-point one come out the lengths they do.
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
 * health is 2 hp to the ironhide1 beside it and 330 to the ironhide5, so the field
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
   *  SCRAP_PER_HP, bent down past the knee at the heavy end (payableHp in
   *  economy.ts), so a heavier kind is worth more scrap — just not
   *  proportionally more once it is a T4 or a T5 — and a stats edit here
   *  moves the salvage with it. No XP either way — XP is paid per wave
   *  cleared (MISSION_XP), never per body */
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
   * spectre round's knockback is a Mindustry impulse, and this is what
   * decides how long that shove keeps acting after it lands. Unset takes
   * UnitType's own 0.3, which is what every kind below that omits it has.
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
   * WHAT THIS HULL LOSES ASHORE, overriding the layer's own land tax
   * (constants.ts NAVAL_LAND_SPEED, the half the Harpoon fleet pays). It
   * multiplies the drive on any cell that is not a water floor and
   * nothing else — the naval field never reads it either, so the route is
   * still the plain shortest path.
   *
   * Only meaningful on a `naval` kind: a walker is never charged the tax
   * to begin with. The Wraith fleet sets it (WRAITH_LAND_SPEED) because
   * the beach is the ground its blinks happen on.
   */
  landSpeed?: number;
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
   * THE PLATING AURA — the ironhide5's, and the ground mechs' family trait made
   * into a rule (FAMILIES). Every `reload` seconds the carrier stamps
   * `amount` of extra armour onto every body in `range`, live for as long as
   * the stamp lasts (constants.ts AURA_LINGER).
   *
   * ARMOUR IS A FLAT SHAVE FLOORED AT A TENTH OF THE HIT (Sim.applyArmor),
   * so this is not a percentage of anything and its worth depends entirely
   * on what is shooting: +12 armour is nothing at all to a fuse and very
   * nearly everything to a wall of duos. That is the point of it — an ironhide5
   * in the crowd does not make the crowd tougher, it makes SMALL CALIBRE
   * stop working, and the answer is to bring a bigger gun rather than more
   * of the same one.
   */
  armorField?: { amount: number; reload: number; range: number };
  /**
   * THE HASTE AURA — the weaver3's, and the venom line's family trait made
   * into a rule. Every `reload` seconds the carrier stamps a speed
   * MULTIPLIER onto every body in `range`, live for as long as the stamp
   * lasts.
   *
   * IT MULTIPLIES THE DRIVE AND NOT THE STAT (Sim.updateUnits, alongside
   * the wet slow), so it compounds with nothing permanently and a body that
   * walks out of the field goes back to its own pace. The venom line is the
   * light, fast one; this is the tier that makes the rest of the family —
   * and whatever else the wave happens to be carrying — move like it.
   */
  hasteField?: { mult: number; reload: number; range: number };
  /**
   * THE JAMMING AURA — the stoop4's, and the Skyfall bombers' second family
   * trait made into a rule (FAMILIES). Every `reload` seconds the carrier
   * stamps every BUILDING in `range` with `rate`: while the stamp lasts
   * that turret's reload runs at `rate` of its own (Tower.jamT / jamRate,
   * on top of the Hydrophobic tax and a dying neighbour's charge).
   *
   * IT IS THE FIRST AURA IN THE GAME THAT LANDS ON THE BOARD AND NOT ON THE
   * SWARM. The three above make the crowd tougher or quicker; this one
   * makes the guns under the flight slower, which is what a family that
   * ignores the maze and hangs over the turrets should be doing to them.
   * Kill the carrier and the line wakes up on the next pulse.
   */
  jamField?: { rate: number; reload: number; range: number };
  /**
   * THE BOW WAVE — the skate4's, and the Harpoon fleet's old bow wave, kept for a hull that wants one. Every
   * `reload` seconds the carrier stamps every HULL in `range`: while the
   * stamp lasts the hull drives ashore as it would afloat — the land tax
   * (constants.ts NAVAL_LAND_SPEED) is lifted, and nothing else changes.
   * A walker or a flyer in the same water takes nothing from it: it is a
   * thing the big hull does to the water, not to the crowd.
   */
  wakeField?: { reload: number; range: number };
  /**
   * THE SPOTTER — the skate3's, and the Harpoon fleet's range aura. Every
   * `reload` seconds the carrier stamps a reach MULTIPLIER onto every body
   * in `range`: while the stamp lasts, every weapon it carries reaches
   * `mult` times further (Sim.updateUnitWeapons). A fleet already firing
   * from outside a board's reach fires from further still around its
   * spotter; the spotter is the hull to kill.
   */
  spotterField?: { mult: number; reload: number; range: number };
  /**
   * THE DRILL — the skate4's. Every `reload` seconds the carrier stamps every
   * body in `range` so that its VETERANCY clock (`veteran` below) runs
   * `mult` times faster while the stamp lasts. Only a kind that has a
   * veterancy at all takes anything from it.
   */
  drillField?: { mult: number; reload: number; range: number };
  /**
   * VETERANCY — the Harpoon fleet's family trait: THE LONGER IT LIVES THE
   * HARDER IT HITS. Every weapon the body fires does `1 + perSecond x age`
   * times its row, up to `1 + max`; age is seconds since it arrived
   * (Sim.uage). A fleet that fires from beyond the board's reach and
   * moves at a crawl is a fleet that is old by the time it is in range,
   * and the answer is reaching out to kill it young.
   */
  veteran?: { perSecond: number; max: number };
  /**
   * BLINK — the Wraith fleet's family trait: A HIT THAT LANDS THROWS IT
   * FORWARD. When damage gets through (past a cloak, a shield, plating),
   * the body jumps `dist` px along its route, at most once per `cooldown`
   * seconds, stopping short of rock and of any building (Sim.blinkUnit).
   * A turret line that opens fire on a wraith is a turret line the wraith
   * is suddenly past; the answer is bursts and fields, or killing it in
   * the one hit.
   *
   * A BLINK IS A TELEPORT, AND FOUR TILES WAS A STUMBLE. The jumps used
   * to be four to six tiles on a one-and-a-half to two second cooldown:
   * about the width of the hull doing the jumping, which at the pace
   * these things already swim read as a hitch in the walk rather than a
   * body appearing somewhere else. They are TWELVE TO EIGHTEEN now — a
   * whole patch crossed in one frame, past the guns that just fired —
   * and the cooldown is DOUBLED to pay for it. A rarer, bigger jump is
   * an event the player watches happen; a constant small one is noise,
   * and at the new distance a constant one would also mean no turret
   * line ever gets a second volley into the same hull.
   */
  blink?: { dist: number; cooldown: number };
  /**
   * CLOAK — every `period` seconds the body vanishes for `duration`:
   * nothing can target it and nothing can hurt it (Sim.damageUnit,
   * bestTarget), and it is drawn as a ghost of itself. `veil` is the
   * flagship's: when it cloaks, every body within that radius cloaks with
   * it for the same duration.
   */
  cloak?: { duration: number; period: number; veil?: number };
  /**
   * THE PAYLOAD — the Skyfall bombers' whole family: A BODY THAT IS A
   * BOMB. It carries no gun; it dives at the nearest structure within its
   * seek range and goes off on contact (weapons.ts fx "bomb", suicide) —
   * and it goes off THE SAME WAY WHEN IT IS KILLED, wherever that is
   * (Sim.killUnit -> detonate). Shooting one down over your own line is
   * the danger; the answer is reach, so it dies over nothing.
   *
   * `splash` over `radius` where it goes off. `bomblets` scatters that
   * many smaller charges out to `spread` px first, each bursting for its
   * own splash. `fuse` ARMS the charge instead: it sits where the body
   * fell for that many seconds and then goes off — the T5's small nuke.
   *
   * THE CHARGES ARE HEAVY AND THE RADII ARE WIDE, and they have to be
   * heavier than any other family's for one structural reason: THIS
   * FAMILY CANNOT BE THE WAVE. The wave script never picks an air kind as
   * a wave's most frequent body, so a flight of bombers is always a
   * garnish on somebody else's ground push — a dozen or two hulls, never
   * the two thousand that make the venom line or the Harpoon guns
   * frightening by weight of numbers. A family that only ever arrives in
   * handfuls has to land like a handful of artillery, so one charge takes
   * a corner of a patch and the T4's and the T5's take the patch: 200
   * over three tiles was a scratch on a board that fields turrets with
   * five figures of health, and a 4000 nuke over eleven tiles was one
   * turret's worth of damage spread thin enough to kill nothing.
   *
   * THE WEIGHT IS IN THE RADIUS AND NOT THE NUMBER. The charges were cut
   * a fifth back from the first pass at these figures, radii untouched:
   * what makes a bomber frightening is how much of the board is inside
   * the burst, and a splash with no falloff (Sim.splashStructures) pays
   * a wide one every turret it covers. Trimming the damage costs the
   * family the turrets it was overkilling and none of the turrets it was
   * reaching, which is the cheapest fifth on the table.
   */
  payload?: {
    splash: number;
    radius: number;
    fuse?: number;
    bomblets?: { count: number; splash: number; radius: number; spread: number };
  };
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
  /**
   * A body drawn as a chain of segments behind the head (the worm rig,
   * see SegmentSpec). Its presence puts a kind on the segmented draw path
   * — SEGMENT_ART in atlas.ts carries the head, body and tail sprites.
   */
  segments?: SegmentSpec;
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
  // ironhide1: 150 hp, no armor, 1x1-block hitbox, 3.75 tiles/s
  ironhide1: { hp: HP0, speed: UNIT_SPEED, armor: 0, radius: UR, tier: 1 },
  // ironhide2: 550 hp, armor 4, 1.25x1.25-block hitbox, 3.75 tiles/s
  // ...and where the line's plating starts, so does its SHIELD. A personal
  // field at range 0 is the whole of the ground mechs' second family trait
  // (FAMILIES): the pulse catches whatever its own hitbox covers, which on
  // a body standing still is the body itself. Nothing else in the crowd is
  // topped up — that is the ironhide4's job, three tiers up, and the reason
  // this one is a bar the mech carries rather than a field it projects
  ironhide2: {
    hp: 550,
    speed: UNIT_SPEED,
    armor: 4,
    radius: UR * 1.25,
    tier: 2,
    shieldField: { amount: 30, max: 120, reload: 3, range: 0 },
  },
  // ironhide3: 900 hp, armor 9, 1.625x1.625-block hitbox, 3.225 tiles/s
  // (0.43 px/tick) — the T3 heavy walks noticeably slower than the line,
  // and rotateSpeed 3 against the stock 5 makes it turn slower too
  ironhide3: {
    hp: 900,
    speed: 3.225 * CELL,
    armor: 9,
    radius: UR * 1.625,
    tier: 3,
    rotateSpeed: 3,
    // the ironhide2's bar, deeper: the line's shield grows with its plating
    shieldField: { amount: 40, max: 200, reload: 3, range: 0 },
  },
  // ironhide4: the ground line's T4 — 9000 hp, armor 20, a 2.75x2.75-block
  // hitbox, 0.36 px/tick = 2.7 tiles/s. Ten fortresses' health on something
  // that walks slower than anything else on the roster, and rotateSpeed 2.1
  // (under half the stock 5) means it cannot even turn quickly
  // ShieldRegenFieldAbility(25, 250, 60, 60): +25 shield EVERY SECOND up to
  // 250, over the usual 7.5-tile field. The starhart2's version tops its
  // escort up between volleys; this one out-heals sustained fire, and it
  // shields itself first of all
  ironhide4: {
    hp: 9000,
    speed: 2.7 * CELL,
    armor: 20,
    radius: UR * 2.75,
    tier: 4,
    rotateSpeed: 2.1,
    shieldField: { amount: 25, max: 250, reload: 1, range: 7.5 * CELL },
    // THE ANIMAL TRIAL (animalFlag.ts): the Ironhide T4 is a rhino on
    // four stout planted legs (LEG_ART.ironhide4 in atlas.ts), short for
    // its bulk so the feet stay close under a body that is mostly back.
    // The body is drawn at its hitbox (ironhideArt.ts), 55 px across, so
    // the legs mount inside its edge and reach a little past it
    ...(ANIMAL_ART
      ? {
          legs: legs({
            count: 4,
            length: 14 * MU,
            forwardScl: 0.7,
            moveSpace: 1.3,
            baseOffset: 8 * MU,
            lengthScl: 0.9,
            speed: 0.14,
            elevation: 0.25,
            ripple: 2,
          }),
        }
      : {}),
  },
  // ironhide5: the ground line's T5 and the heaviest thing in the game —
  // 24000 hp, a 3.75x3.75-block hitbox, 0.4 px/tick = 3 tiles/s. Note it
  // walks FASTER than the ironhide4 it replaces (2.7), the second time the
  // roster hands a tier an upgrade that is not also a slowdown
  //
  // armor 30 is the number that matters. Armour is a flat shave floored at
  // a tenth of the raw shot (see Sim.applyArmor), so anything firing under
  // 20 a hit is reduced to paying the floor: a duo's 9-damage bolt lands 0.9
  // instead of 9, and a full duo wall does a tenth of its paper DPS. The
  // counter is calibre, not volume — one lancer hit clears the shave twice
  // over. No ability: at this weight it does not need one
  ironhide5: {
    hp: 24000,
    speed: 3 * CELL,
    armor: 30,
    radius: UR * 3.75,
    tier: 5,
    rotateSpeed: 1.65,
    // THE CROWN HANDS ITS PLATING DOWN. The line's whole argument is that
    // armour is a flat shave and the counter is calibre, not volume; this
    // is that argument applied to everything walking with it. +12 within
    // nine tiles turns an ironhide1 escort into something a duo wall reduces
    // itself against, and changes nothing at all for a fuse.
    //
    // It carries no shield of its own. The ironhide2 and the ironhide3 wear one
    // because they are the tiers that have to survive their own approach;
    // the ironhide5 survives on thirty armour and twenty-four thousand health,
    // and what it adds to the line is the thing it is already best at.
    armorField: { amount: 12, reload: 2, range: 9 * CELL },
    // THE ANIMAL TRIAL (animalFlag.ts): the Ironhide T5, the same four
    // legs at the ironhide5's weight and reach (LEG_ART.ironhide5 in
    // atlas.ts), on a body drawn 75 px across
    ...(ANIMAL_ART
      ? {
          legs: legs({
            count: 4,
            length: 19 * MU,
            forwardScl: 0.7,
            moveSpace: 1.4,
            baseOffset: 11 * MU,
            lengthScl: 0.9,
            speed: 0.13,
            elevation: 0.35,
            ripple: 3,
          }),
        }
      : {}),
  },
  // weaver1: 150 hp, no armor, 1x1-block hitbox, 7.5 tiles/s — twice the
  // ground line's pace, and the fastest walker in the game.
  //
  // IT IS NOT A BOMB ANY MORE. The suicide charge is gone (weapons.ts): a
  // family whose signature is a status that takes six seconds to work
  // cannot have its opening tier delete itself on contact, because a dead
  // spitter stops refreshing the clock it just started. So the T1 lives,
  // keeps its pace, and spits — one orb every three seconds, and every orb
  // lands the rot.
  weaver1: {
    hp: 150,
    speed: 7.5 * CELL,
    armor: 0,
    radius: UR,
    tier: 1,
    // THE ANIMAL TRIAL (animalFlag.ts): the Dartback runt keeps the weaver1
    // mech's rig, a frog with its feet tucked (MECH_ART.weaver1 in atlas.ts)
  },
  // weaver2: the venom line's T2 — 600 hp, armor 2, a 1.625x1.625-block
  // hitbox, 5.5 tiles/s. It is the weaver1's VOLUME tier and nothing else:
  // the same orb, the same rot, four times the health and four barrels.
  //
  // IT NO LONGER THROWS SLAG — the whole tree throws one thing now
  // (weapons.ts) — but it keeps `immunities: burning`, and the reason has
  // simply moved. Upstream it is fireproof because it is the slag unit;
  // here it is fireproof because SCORCH IS THE OBVIOUS ANSWER TO A LIGHT,
  // FAST, CLOSE-RANGE FAMILY, and a family with no answer to its own
  // counter is one the player solves with a wall of one turret. So the tier
  // the swarm upgrades INTO is the tier the flame slides off, and a board
  // that opened with scorch has to find a second idea by wave twenty.
  weaver2: {
    hp: 600,
    speed: 5.5 * CELL,
    armor: 2,
    radius: UR * 1.625,
    tier: 2,
    drag: 0.4,
    rotateSpeed: 3,
    immunities: ["burning"],
    // SHORT LEGS. The line used to haul itself along on a wide, slow gait;
    // the family is the light fast one now, and a long stride reads as
    // weight. Every leg on this tree is cut to roughly a third of what
    // Mindustry gives it and the elevation with it, so the body sits down
    // on its feet and scuttles instead of striding.
    //
    // THE ANIMAL TRIAL (animalFlag.ts): as the Dartback T2 the legs are a
    // frog's — four, on short mounts, planted just past a 32 world px body
    legs: ANIMAL_ART
      ? legs({ count: 4, length: 14 * MU, forwardScl: 0.6, moveSpace: 1.1, baseOffset: 6 * MU, lengthScl: 0.9, elevation: 0.15 })
      : legs({ count: 4, length: 5 * MU, forwardScl: 0.6, moveSpace: 1.1, elevation: 0.12 }),
  },
  // weaver3: the line's T3 — 1000 hp, armor 9, a 1.875x1.875-block hitbox,
  // 0.54 px/tick = 4.05 tiles/s, the slowest thing on the field. Six legs
  // on longer mounts (legBaseOffset 2) stepping three at a time
  weaver3: {
    hp: 1000,
    speed: 5.5 * CELL,
    armor: 4,
    radius: UR * 1.875,
    tier: 3,
    drag: 0.4,
    rotateSpeed: 3,
    // THE ONE THAT MAKES THE REST GO. The venom line poisons on a clock —
    // six seconds of rot per application — so what it actually wants is
    // more applications landing before the first one runs out, and the
    // cheapest way to buy that is to get the whole family to the wall
    // sooner. A third of again on everything within ten tiles, itself
    // included, and it is the only speed buff in the game.
    hasteField: { mult: 1.35, reload: 2, range: 10 * CELL },
    // THE ANIMAL TRIAL (animalFlag.ts): the Dartback T3, four legs a
    // little longer
    legs: ANIMAL_ART
      ? legs({ count: 4, length: 16 * MU, forwardScl: 0.65, moveSpace: 1.1, baseOffset: 7 * MU, lengthScl: 0.9, elevation: 0.2 })
      : legs({
          count: 6,
          length: 6.5 * MU,
          forwardScl: 0.8,
          moveSpace: 1.1,
          baseOffset: 1.5 * MU,
          elevation: 0.15,
        }),
  },
  // weaver4: the weaver1 line's T4 — 8000 hp, armor 14, a 2.875x2.875-block
  // hitbox, 0.62 px/tick = 4.65 tiles/s. Eight times the weaver3's health
  // on something that walks faster than it, which makes it the only T4 on
  // the roster that is quicker than the T3 it replaces
  //
  // Its legs are the difference: 30 world units against the weaver3's 13,
  // on mounts 10 units out, so it straddles ground the weaver3 walks over.
  // legPairOffset 3 staggers the gait leg by leg (the weaver3's 0 swings
  // each three-leg group as one piece), and legExtension 15 runs each
  // lower segment a whole segment back past its own knee, so the limb
  // sprite covers the joint — which is why weaver4 needs no knee cap where
  // every other legged unit has one
  //
  // rippleScale 2 doubles the dust a planted foot throws. Mindustry also
  // gives it legSplashDamage 32 over legSplashRange 30, a stamp that hurts
  // whatever the foot lands on: it has no target here, since this game's
  // towers cannot be damaged and the player fields no units of its own, so
  // what survives of the footfall is the dust and the reach
  weaver4: {
    hp: 8000,
    speed: 5.5 * CELL,
    armor: 7,
    radius: UR * 2.875,
    tier: 4,
    drag: 0.1,
    rotateSpeed: 2.7,
    // THE ANIMAL TRIAL (animalFlag.ts): the Dartback T4 — four legs at
    // twice the stock reach, staggered leg by leg
    legs: ANIMAL_ART
      ? legs({
          count: 4,
          length: 24 * MU,
          pairOffset: 3 * MU,
          moveSpace: 1.2,
          baseOffset: 10 * MU,
          lengthScl: 0.9,
          speed: 0.2,
          elevation: 0.3,
          ripple: 2,
        })
      : legs({
          count: 6,
          length: 11 * MU,
          pairOffset: 3 * MU,
          baseOffset: 5 * MU,
          extension: -6 * MU,
          lengthScl: 0.96,
          speed: 0.2,
          elevation: 0.25,
          ripple: 2,
        }),
  },
  // weaver5: the weaver1 line's T5 — 22000 hp, armor 22, a 3.25x3.25-block
  // hitbox, and 0.5 px/tick = 3.75 tiles/s, which is exactly the ironhide1's
  // marching pace: the largest frog on the field keeps up with the line
  // it walks in front of
  //
  // Its legs are the whole silhouette. Eight of them at 75 world units —
  // two and a half times the weaver4's 30, the longest reach on the roster
  // — on mounts only 8 units out, so the body sits low inside a span it
  // straddles rather than stands on. legLengthScl 0.93 folds them a little
  // further in than weaver4's 0.96, and shadowElevation 0.95 lifts a
  // swinging foot almost a full body-height off the ground: the gait is
  // visibly high-stepping where the weaver4's is a scuttle
  //
  // Like the weaver4 it has no knee cap and takes a shoulder plate instead
  // (legExtension 20 runs each lower segment back over its own joint), and
  // like the weaver4 its legSplashDamage 80 / legSplashRange 60 has nothing
  // to hit here — towers cannot be damaged and the player fields no units
  // — so what lands is rippleScale 3, half again the weaver4's dust
  weaver5: {
    hp: 22000,
    speed: 5 * CELL,
    armor: 10,
    radius: UR * 3.25,
    tier: 5,
    drag: 0.1,
    rotateSpeed: 1.9,
    // THE ANIMAL TRIAL (animalFlag.ts): the Dartback T5 — four legs, the
    // longest stride on the ground, high-stepping
    legs: ANIMAL_ART
      ? legs({
          count: 4,
          length: 30 * MU,
          pairOffset: 3 * MU,
          moveSpace: 1.0,
          baseOffset: 12 * MU,
          lengthScl: 0.9,
          speed: 0.18,
          elevation: 0.4,
          ripple: 3,
        })
      : legs({
          count: 8,
          length: 20 * MU,
          moveSpace: 0.8,
          pairOffset: 3 * MU,
          extension: -8 * MU,
          baseOffset: 5 * MU,
          lengthScl: 0.93,
          speed: 0.19,
          elevation: 0.3,
          ripple: 3,
        }),
  },
  // stoop1: 70 hp, no armor, 1.125-block hitbox, 15 tiles/s (upstream 20.25).
  // The fastest thing in the sky still, but the whole line was brought down
  // to a pace the guns can track — a stoop1 used to cross the flak before a
  // scatter finished a burst.
  // THE T1 IS THE FAMILY IN MINIATURE (the Skyfall bombers): no gun, a
  // charge that goes off on the turret it dives at — or wherever it is
  // shot down — for 150 over three and a half tiles
  stoop1: {
    hp: 70,
    speed: 15 * CELL,
    armor: 0,
    radius: UR * 1.125,
    tier: 1,
    drag: 0.04,
    flying: true,
    payload: { splash: 150, radius: 28 * MU },
  },
  // starhart1: the T1 of the Starlight mechs — 200 hp, armor 1, 1x1-block
  // hitbox, 0.55 px/tick = 4.125 tiles/s. Frailer than an ironhide1 but a step
  // quicker. THE T1 IS THE FAMILY IN MINIATURE: a thin piercing green
  // lance (weapons.ts) and a repair field — RepairFieldAbility(10, 60*4)
  // upstream, a little quicker here: 12 hp to everything within 7.5 tiles
  // every 3 s, so a starhart1 escort keeps its line topped up between volleys
  starhart1: {
    hp: 200,
    speed: 4.125 * CELL,
    armor: 1,
    radius: UR,
    tier: 1,
    repairField: { amount: 12, reload: 3, range: 7.5 * CELL },
  },
  // starhart2: support T2 — 320 hp, armor 4 (an ironhide2's plating on half its hp),
  // 1.375x1.375-block hitbox, 0.7 px/tick = 5.25 tiles/s: the line's fastest
  // walker, so it arrives ahead of the runts it escorts
  // ShieldRegenFieldAbility(20, 40, 60*5, 60) upstream; +25 shield every
  // 4 s up to a 60-point cap here, over the same 7.5-tile field — the
  // family is the one that hands out shields, and its T2 is where that
  // starts
  starhart2: {
    hp: 320,
    speed: 5.25 * CELL,
    armor: 4,
    radius: UR * 1.375,
    tier: 2,
    shieldField: { amount: 25, max: 60, reload: 4, range: 7.5 * CELL },
  },
  // starhart3: support T3 — 640 hp, armor 9 (an ironhide3's plating), a
  // 1.625x1.625-block hitbox, 0.5 px/tick = 3.75 tiles/s: after the
  // starhart2's sprint the line drops back to the ironhide1's marching pace
  // ForceFieldAbility(60, 0.4, 500, 60*6): a 7.5-tile bubble holding 500
  // points, refilling at 24/s and dark for 6 s once it breaks (Mindustry
  // draws it as a hexagon; here every force field is a circle). Where starhart1
  // and starhart2 hand out health and shields unit by unit, this one covers
  // GROUND — every absorbable shot crossing the outline dies there, so a
  // starhart3 walking point turns the crowd behind it into a blind spot
  starhart3: {
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
  // starhart4: the support line's T4 — 8200 hp, armor 16, a 3x3-block hitbox,
  // 0.44 px/tick = 3.3 tiles/s, and rotateSpeed 1.8, the slowest turn on
  // the roster. Thirteen elites' health with none of the starhart3's reach:
  // where its predecessor covers the ground around it, this one is simply
  // very hard to remove
  //
  // immunities = burning: scorch's flame slides off this one exactly as it
  // does off the weaver2, the roster's only other fireproof unit. A flame
  // wall that melts an ironhide1 column is the wrong answer here — 9 armour
  // already takes 17-damage flame hits down to 8, and the 0.167/tick burn
  // that normally finishes the job never starts
  //
  // Mindustry also gives it canBoost/boostMultiplier 2.4 — a hop over
  // terrain at more than double pace. That is a player's button: the wave
  // AI (GroundAI) only ever LOWERS a boosting unit back down, and never
  // calls updateBoosting to raise one, so a starhart4 arriving in a wave walks
  //
  // IT CARRIES BOTH FIELDS NOW. The stock T4 of this line heals through its beam
  // (healPercent on the bullet), which this game's enemies had nothing to
  // aim at; here the healing is an ability, as the starhart1's is — 40 hp to
  // everything within nine tiles every 2 s, and 30 shield up to 300 on the
  // same pulse. A starhart4 in the crowd is a crowd that does not go down, and
  // the beam it drags across the patch is the part that hurts
  starhart4: {
    hp: 8200,
    speed: 3.3 * CELL,
    armor: 16,
    radius: UR * 3,
    tier: 4,
    rotateSpeed: 1.8,
    immunities: ["burning"],
    repairField: { amount: 40, reload: 2, range: 9 * CELL },
    shieldField: { amount: 30, max: 300, reload: 2, range: 9 * CELL },
    // THE ANIMAL TRIAL (animalFlag.ts): the Starhart T4 is the tier the
    // stag's stance opens, so it leaves the mech rig for four planted legs
    // (LEG_ART.starhart4 in atlas.ts carries the art). A deer's legs from
    // above are UNDER the deer: the same short reach as the rhino's
    // (ironhide4 above, 14 on mounts 8), a little shorter still on mounts
    // that sit inside the stag's narrower back, so a foot lands about a
    // body's half-width out from the flank and no further. Off the trial
    // it has no gait and walks as the starhart4 mech it always was
    ...(ANIMAL_ART
      ? {
          legs: legs({
            count: 4,
            length: 12 * MU,
            forwardScl: 0.7,
            moveSpace: 1.3,
            baseOffset: 5 * MU,
            lengthScl: 0.9,
            speed: 0.15,
            elevation: 0.3,
            ripple: 2,
          }),
        }
      : {}),
  },
  // starhart5: the support line's T5 — 18000 hp, armor 14, a 3.625x3.625-block
  // hitbox, and 0.3 px/tick = 2.25 tiles/s, the slowest thing in the game.
  // rotateSpeed 1.5 is likewise the slowest turn on the roster, under a
  // third of stock: it arrives late and cannot answer a flank
  //
  // It is also the lightest of the four T5s, and THE FAMILY'S WHOLE IDEA
  // AT ITS LARGEST. The stock T5 of this line heals through its WEAPON — a
  // 560-damage charged laser with healPercent 25 and collidesTeam — which
  // this game's enemies had nothing to aim at; here the healing is the
  // biggest field on the roster (80 hp to everything within eleven tiles
  // every 2 s, and 50 shield up to 500 on the same pulse), and the laser
  // is the long one: fifty-seven tiles, nine cells wide, every structure
  // inside it (weapons.ts). Kill it before it fires, or lose the row
  //
  // Four legs, not the six or eight the weaver1 line runs on, at 14 world
  // units on mounts 11 out: nearly all of the leg is the mount offset, so
  // it stands on stubby posts planted wide of a body that overhangs them
  starhart5: {
    hp: 18000,
    speed: 2.25 * CELL,
    armor: 14,
    radius: UR * 3.625,
    tier: 5,
    rotateSpeed: 1.5,
    repairField: { amount: 80, reload: 2, range: 11 * CELL },
    shieldField: { amount: 50, max: 500, reload: 2, range: 11 * CELL },
    // THE ANIMAL TRIAL (animalFlag.ts): as the Starhart T5 the four legs
    // are a stag's — the starhart4's short reach scaled to the bigger
    // body (the ironhide5 runs 19 on mounts 11), planted under it, never
    // a spider's span
    legs: ANIMAL_ART
      ? legs({
          count: 4,
          length: 15 * MU,
          forwardScl: 0.7,
          moveSpace: 1.4,
          baseOffset: 6 * MU,
          lengthScl: 0.9,
          speed: 0.15,
          elevation: 0.4,
          ripple: 3,
        })
      : legs({
          count: 4,
          length: 14 * MU,
          forwardScl: 0.58,
          moveSpace: 1.5,
          baseOffset: 11 * MU,
          elevation: 0.2,
        }),
  },
  // ---- THE SKY GUNSHIPS' PACE ----
  //
  // THE LIGHT TIERS ARE FAST AND THE HEAVY ONES ARE NOT. Mindustry's own
  // air tree trades its speed away as it climbs — stoop1 20.25 tiles/s,
  // stoop2 12.4, stoop3 12.75, stoop4 6, stoop5 4.05 — and the shape of
  // that is right even where the numbers are not. The line reads 15, 10,
  // 10, 5, 4 here: the T1 and T2 still arrive faster than anything on the
  // ground, the T3 holds the T2's pace on two and a half times the bulk,
  // and the T4 and T5 are deliberately heavy — a hull that takes a patch
  // when it lands is a hull the board should see coming. The stoop1's old
  // 20.25 was the other end of the problem from the stoop5's 4.05: it
  // crossed the flak faster than a scatter finished a burst, so the guns
  // never got their answer either. What the family asks a board for is
  // guns that reach the sky and answer fast — and now it gives them the
  // time to, at the tiers where the damage actually is.

  // stoop2: the T2 — 340 hp, armor 3, 1.375x1.375-block hitbox, 10 tiles/s
  // (upstream 12.375). Slower than a stoop1 but four times the health, and
  // armour 3 blunts the scatter flak that shreds the T1
  // The charge is the bomber's whole reason: 550 over five tiles, which
  // is the old bomb rack's whole rain delivered in one arrival
  stoop2: {
    hp: 340,
    speed: 10 * CELL,
    armor: 3,
    radius: UR * 1.375,
    tier: 2,
    drag: 0.03,
    rotateSpeed: 4.5,
    flying: true,
    payload: { splash: 550, radius: 40 * MU },
  },
  // stoop3: the T3 — 700 hp, armor 5, a 2.5x2.5-block hitbox that makes it
  // the widest thing in the sky below the T4/T5 hulls, at 10 tiles/s
  // (upstream 12.75) — the stoop2's pace on two and a half times its bulk. THE AFTERBURNER (hasteField): everything within nine
  // tiles of it flies four tenths faster — a flight of bombers crossing
  // the flak spends that much less time in it, which for a body whose
  // job is to arrive is the whole game. Its own charge is a stoop2's
  stoop3: {
    hp: 700,
    speed: 10 * CELL,
    armor: 5,
    radius: UR * 2.5,
    tier: 3,
    drag: 0.016,
    flying: true,
    hasteField: { mult: 1.4, reload: 2, range: 9 * CELL },
    payload: { splash: 800, radius: 48 * MU },
  },
  // stoop4: the air line's T4 — 7200 hp, armor 17, and a 5.75x5.75-block
  // hitbox, more than twice the stoop3 across; only the stoop5's 7.25
  // outspans it. 5 tiles/s (upstream 6): the heavy tiers are where the sky
  // slows down — still quicker than most walkers, and half the stoop3 it
  // replaces, so the board gets time to answer the hull that matters
  //
  // rotateSpeed 1.9 against the stock 5 is what sells the weight: a flyer
  // holds its heading through its own drift, and this one visibly swings
  // round rather than snapping.
  //
  // THE JAM (jamField): every 2 s it stamps every building within eleven
  // tiles, and a stamped gun reloads at HALF pace while the flight is over
  // it — the guns under the wing get half the shots off before the
  // bombers land on them. THE CLUSTER CHARGE: 2,000 over NINE TILES where
  // it goes off, and ten bomblets thrown out to eleven tiles first, each
  // bursting for 400 over four — so the pattern overlaps itself across
  // twenty tiles of board and a turret in the middle of it is hit by the
  // charge and by three or four bomblets. This is the family's area tier
  // and the one whose death over a patch TAKES the patch, which is a
  // promise the old 300-over-three-tiles never came close to keeping
  stoop4: {
    hp: 7200,
    speed: 5 * CELL,
    armor: 17,
    radius: UR * 5.75,
    tier: 4,
    drag: 0.04,
    rotateSpeed: 1.9,
    flying: true,
    jamField: { rate: 0.5, reload: 2, range: 11 * CELL },
    payload: {
      splash: 2000,
      radius: 72 * MU,
      bomblets: { count: 10, splash: 400, radius: 32 * MU, spread: 88 * MU },
    },
  },
  // stoop5: the air line's T5 — 22000 hp, armor 22, and a 7.25x7.25-block
  // hitbox. That is the widest thing in the game by a clear margin (the
  // stoop4, itself twice a stoop3, is 5.75), and it is what the unit is
  // for: nothing on the roster is harder to miss, and nothing soaks a
  // splash pattern like a body that fills it
  //
  // The air line's whole premise is arriving before the guns can answer,
  // and upstream is where that premise was abandoned: 0.54 px/tick = 4.05
  // tiles/s, slower than most of the GROUND roster. It flies at 4 here —
  // barely above that, and the slowest thing in the sky bar the boss: the
  // heaviest hull on the roster is one the player watches come. rotateSpeed
  // 1 is the slowest turn of anything that moves here: it cannot answer a
  // flank, and it does not need to, because its broadside is a cone
  //
  // THE NUKE (payload.fuse): where it goes off — on the structure it
  // dived at, or wherever it was shot down — the charge ARMS and sits for
  // two and a half seconds, a fat orange orb swelling on the ground, and
  // then takes 9,000 off everything within SIXTEEN TILES. That is a
  // 32-tile circle of board, which is most of a citadel, at four figures
  // past what a spectre carrying half the catalog is holding: nothing in
  // the blast is meant to survive it. The fuse is the player's warning
  // and the family's rule at its largest — a stoop5 shot down over the
  // line is a line with two and a half seconds to be somewhere else, and
  // a turret cannot be somewhere else
  stoop5: {
    hp: 22000,
    speed: 4 * CELL,
    armor: 22,
    radius: UR * 7.25,
    tier: 5,
    drag: 0.04,
    rotateSpeed: 1,
    flying: true,
    payload: { splash: 9000, radius: 128 * MU, fuse: 2.5 },
  },
  // boss: THE FINAL BOSS — Erekir's tier-5 missile bomber, the one kind
  // on the roster from the other planet. Base shape from
  // mindustry/content/UnitTypes.java (hitSize 46; rotateSpeed 2;
  // drag 0.07), boss-tuned in FOUR places. Health is Mindustry's 12000 x8
  // (x4 at first; doubled again when the phase turrets melted it before it
  // loomed, then x12 when x8 still fell too fast). Armour is 30
  // over the official 9 — far past the ironhide5's 18, so anything hitting
  // under ~33 pays the 10% floor: pellet AA, duos and salvos all read as
  // sparks off the hull, and the answer is calibre, which is what the
  // phase turrets are. Speed drops from the official 1 unit/tick
  // (7.5 tiles/s, weaver1 pace — it would outrun its own escort and reach
  // the AA line alone) to 2.0 tiles/s, the slowest thing in the game: a
  // boss is a deadline the player watches coming, not a sprinter. Its
  // suppression field and missile racks stay behind on Erekir — enemies
  // here do not shoot — so what crosses the map is the hull, the looming
  // pace, and 144000 health the board has to answer before it reaches the
  // base. It also DRAWS half again its native scale (see UNIT_ART), and
  // the hitbox follows the art: Mindustry's hitSize 46 grows to an
  // effective 56 (UR * 7, just under stoop5's 7.25) so shots land where
  // the silhouette says they should — a boss this size being HARD TO MISS
  // is part of what the size is for.
  boss: {
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

  // ---- THE HARPOON FLEET AND THE WRAITH FLEET ----
  //
  // Ten hulls in two trees, and the roster's third movement layer. Every
  // one of them is `naval` (UnitType.init's water preset, see UnitStats)
  // and therefore wet-immune, and every one carries a wake. Their numbers
  // are otherwise read off mindustry/content/UnitTypes.java like every
  // walker's — hitSize/8 tiles of hitbox, speed x 7.5 tiles a second.
  //
  // THESE ARE THE HULLS' STATS, and the water and the land both move them:
  // afloat a tank drives at NAVAL_WATER_SPEED of the number below (half
  // again), ashore at NAVAL_LAND_SPEED of it (constants.ts) — which is the
  // only thing the ground costs it; the route it takes there is the
  // walkers' own.
  //
  // THE HARPOON FLEET IS THE SNIPER FAMILY (weapons.ts): every hull fires
  // a rail from beyond the board's reach, crawls ashore, and carries
  // `veteran` — every hit multiplied by how long it has been alive, to
  // triple after two minutes. The skate3 is the spotter (the hulls round
  // it reach half again as far) and the skate4 is the drill (they age twice
  // and a half as fast). Kill them young, and kill those two first.

  // skate1: the naval line's T1 — 280 hp, armor 2, a 1.25x1.25-block hitbox,
  // 1.1 units/tick = 8.25 tiles/s, the fastest hull there is. Note it
  // opens at nearly TWICE the ironhide1's health with armour the ironhide1 does
  // not have: the naval T1 is not chaff, and a duo's 9-damage bolt is
  // already paying 7 against it
  skate1: {
    hp: 280,
    speed: 8.25 * CELL * NAVAL_PACE,
    armor: 2,
    radius: UR * 1.25,
    tier: 1,
    drag: 0.13,
    rotateSpeed: 3.3,
    naval: true,
    immunities: ["wet"],
    veteran: HARPOON_VETERAN,
    wake: wake({ x: 4 * MU, length: 20, scl: 1.3 * MU }),
  },
  // skate2: T2 — 600 hp, armor 4 (an ironhide2's plating), a 1.625x1.625-block
  // hitbox, 0.9 units/tick = 6.75 tiles/s
  skate2: {
    hp: 600,
    speed: 6.75 * CELL * NAVAL_PACE,
    armor: 4,
    radius: UR * 1.625,
    tier: 2,
    drag: 0.15,
    rotateSpeed: 2.6,
    naval: true,
    immunities: ["wet"],
    veteran: HARPOON_VETERAN,
    wake: wake({ x: 5.5 * MU, y: -4 * MU, length: 20, scl: 1.9 * MU }),
  },
  // skate3: T3 — 910 hp, armor 7, a 2.5x2.5-block hitbox, 0.85 units/tick
  // = 6.375 tiles/s. THE SPOTTER (spotterField): every 2 s it stamps every
  // body within ten tiles with half again its reach. A fleet already
  // firing from outside the board's reach fires from further still round
  // its spotter; it is the hull to kill, and it is the one that stays
  // back
  skate3: {
    hp: 910,
    speed: 6.375 * CELL * NAVAL_PACE,
    armor: 7,
    radius: UR * 2.5,
    tier: 3,
    drag: 0.17,
    rotateSpeed: 1.8,
    naval: true,
    immunities: ["wet"],
    veteran: HARPOON_VETERAN,
    spotterField: { mult: 1.5, reload: 2, range: 10 * CELL },
    wake: wake({ x: 7 * MU, y: -9 * MU, length: 22, scl: 1.5 * MU }),
  },
  // skate4: T4 — 11000 hp, armor 12, a 4.875x4.875-block hitbox, 0.73
  // units/tick = 5.475 tiles/s. More health than the ironhide4 at the same
  // tier and two more points of armour, on something that also moves
  // twice as fast.
  //
  // THE DRILL (drillField): every 2 s it stamps every hull within ten
  // tiles so that its veterancy clock runs two and a half times as fast —
  // a fleet round a skate4 is a fleet at full strength in under a minute.
  // The T4 is the reason the fleet cannot be waited out
  skate4: {
    hp: 11000,
    speed: 5.475 * CELL * NAVAL_PACE,
    armor: 12,
    radius: UR * 4.875,
    tier: 4,
    drag: 0.17,
    rotateSpeed: 1.3,
    naval: true,
    immunities: ["wet"],
    veteran: HARPOON_VETERAN,
    drillField: { mult: 2.5, reload: 2, range: 10 * CELL },
    wake: wake({ x: 18 * MU, y: -21 * MU, length: 50, scl: 3 * MU }),
  },
  // skate5: the fleet's T5 — 22000 hp, armor 16, and a 7.25x7.25-block
  // hitbox, which is the stoop5's: the widest thing in the game, tied.
  // 0.62 units/tick = 4.65 tiles/s, and rotateSpeed 0.9 is the slowest
  // turn on the whole roster — this one cannot answer anything it did not
  // already have its nose pointed at
  skate5: {
    hp: 22000,
    speed: 4.65 * CELL * NAVAL_PACE,
    armor: 16,
    radius: UR * 7.25,
    tier: 5,
    drag: 0.18,
    rotateSpeed: 0.9,
    naval: true,
    immunities: ["wet"],
    veteran: HARPOON_VETERAN,
    wake: wake({ x: 23 * MU, y: -32 * MU, length: 70, scl: 3.5 * MU }),
  },
  // livewire1: the Wraith fleet's T1 — 270 hp, armor 3, a 1.375x1.375-block
  // hitbox, 0.9 units/tick = 6.75 tiles/s, and rotateSpeed 5, the stock
  // rate every ground unit turns at and the quickest hull on the water by
  // a distance. THE T1 IS THE FAMILY IN MINIATURE: one arc, one hop, one
  // short in eight (weapons.ts), and it BLINKS — a hit that lands throws
  // it twelve tiles up its route, once every four seconds. Its upstream
  // repair beam was a weapon and does not port
  livewire1: {
    hp: 270,
    speed: 6.75 * CELL * WRAITH_PACE,
    armor: 3,
    radius: UR * 1.375,
    tier: 1,
    drag: 0.14,
    rotateSpeed: 5,
    naval: true,
    landSpeed: WRAITH_LAND_SPEED,
    immunities: ["wet"],
    blink: { dist: 12 * CELL, cooldown: 4 },
    wake: wake({ x: 5 * MU, length: 20, scl: 1.3 * MU }),
  },
  // livewire2: Wraith T2 — 560 hp, armor 4, a 1.75x1.75-block hitbox, 0.83
  // units/tick = 6.225 tiles/s. Upstream's ability
  // (StatusFieldAbility(overclock)) does not port. The volume tier: a fast
  // short arc, and the quickest blink on the tree
  livewire2: {
    hp: 560,
    speed: 6.225 * CELL * WRAITH_PACE,
    armor: 4,
    radius: UR * 1.75,
    tier: 2,
    drag: 0.14,
    rotateSpeed: 4,
    naval: true,
    landSpeed: WRAITH_LAND_SPEED,
    immunities: ["wet"],
    blink: { dist: 12 * CELL, cooldown: 3 },
    wake: wake({ x: 5.5 * MU, y: -4 * MU, length: 22, scl: 1.9 * MU }),
  },
  // livewire3: Wraith T3 — 870 hp, armor 6, a 2.5x2.5-block hitbox, 0.86
  // units/tick = 6.45 tiles/s: fractionally quicker than the skate3 it
  // shares a hitbox with. The family's chain tier (four hops, weapons.ts),
  // and THE FIRST THAT CLOAKS: two and a half seconds gone in every nine,
  // from the first nine in. The cloak is a window with nothing in it for
  // the guns, and it was shortened a notch across the fleet when the
  // blinks tripled — a hull that cannot be hurt AND cannot be pinned is
  // two answers to the same volley, and one of them has to give. Its upstream repair beam is a weapon, like livewire1's,
  // and goes the same way
  livewire3: {
    hp: 870,
    speed: 6.45 * CELL * WRAITH_PACE,
    armor: 6,
    radius: UR * 2.5,
    tier: 3,
    drag: 0.16,
    rotateSpeed: 2.6,
    naval: true,
    landSpeed: WRAITH_LAND_SPEED,
    immunities: ["wet"],
    blink: { dist: 15 * CELL, cooldown: 3 },
    cloak: { duration: 2.5, period: 9 },
    wake: wake({ x: 9 * MU, y: -9 * MU, length: 23, scl: 2 * MU }),
  },
  // livewire4: Wraith T4 — 12000 hp, armor 12, a 5.5x5.5-block hitbox,
  // 0.7 units/tick = 5.25 tiles/s. The most health of any T4 in the game
  //
  // EnergyFieldAbility(40, 65, 180) is the reason to shoot it first, and
  // it does both halves here: the zap SHORTS every structure it reaches
  // (weapons.ts) and the heal mends the fleet. Its 22.5-TILE radius is
  // three times the 7.5 most fields on the roster reach — one livewire4
  // covers most of a lane — and it heals 1.5% of MAX health, so it mends
  // a livewire5 for 300 a zap and a livewire1 for 4. sameTypeHealMult 0.5
  // halves what it does for another livewire4, which is upstream's guard
  // against a pair of them being unkillable; a pair is still twice as
  // hard to remove as one
  livewire4: {
    hp: 12000,
    speed: 5.25 * CELL * WRAITH_PACE,
    armor: 12,
    radius: UR * 5.5,
    tier: 4,
    drag: 0.17,
    rotateSpeed: 1.4,
    naval: true,
    landSpeed: WRAITH_LAND_SPEED,
    immunities: ["wet"],
    blink: { dist: 15 * CELL, cooldown: 4 },
    cloak: { duration: 3.5, period: 10 },
    energyField: {
      healPercent: 1.5,
      sameTypeHealMult: 0.5,
      maxTargets: 25,
      reload: 65 / 60,
      range: 22.5 * CELL,
    },
    wake: wake({ x: 18 * MU, y: -17 * MU, length: 50, scl: 3.2 * MU }),
  },
  // livewire5: the Wraith fleet's T5 — 20000 hp, armor 20, and the skate5's
  // 7.25x7.25-block hitbox, at 0.65 units/tick = 4.875 tiles/s. Its EMP
  // cannon is the family's long arc (weapons.ts), and it is THE FLAGSHIP:
  // when it cloaks — four and a half seconds in every twelve — every body
  // within ten tiles goes dark with it (cloak.veil). A fleet that vanishes
  // together and reappears EIGHTEEN tiles on is the family's rule at its
  // largest; the seven and a half seconds it shows are the seven and a
  // half seconds to kill it in
  livewire5: {
    hp: 20000,
    speed: 4.875 * CELL * WRAITH_PACE,
    armor: 20,
    radius: UR * 7.25,
    tier: 5,
    drag: 0.17,
    rotateSpeed: 1.1,
    naval: true,
    landSpeed: WRAITH_LAND_SPEED,
    immunities: ["wet"],
    blink: { dist: 18 * CELL, cooldown: 4 },
    cloak: { duration: 4.5, period: 12, veil: 10 * CELL },
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
  { key: "ground", name: FAMILY_NAMES.ground.name, kinds: ["ironhide1", "ironhide2", "ironhide3", "ironhide4", "ironhide5"] },
  { key: "support", name: FAMILY_NAMES.groundSupport.name, kinds: ["starhart1", "starhart2", "starhart3", "starhart4", "starhart5"] },
  { key: "weaver", name: FAMILY_NAMES.weaver.name, kinds: ["weaver1", "weaver2", "weaver3", "weaver4", "weaver5"] },
  { key: "air", name: FAMILY_NAMES.air.name, kinds: ["stoop1", "stoop2", "stoop3", "stoop4", "stoop5"] },
  // the two naval tank trees: upgrade paths like the four above, on the
  // amphibious layer. They used to be the only rows whose units needed a
  // MAP to field them — a wave asking for runts on a map with no water
  // sent nothing at all — and they no longer are: a naval tank comes in
  // by a ground door and drives to the core when there is no sea
  { key: "naval", name: FAMILY_NAMES.naval.name, kinds: ["skate1", "skate2", "skate3", "skate4", "skate5"] },
  { key: "navalSupport", name: FAMILY_NAMES.navalSupport.name, kinds: ["livewire1", "livewire2", "livewire3", "livewire4", "livewire5"] },
  // not an upgrade path: the boss row holds the kinds that arrive as an
  // event rather than a stream, so its slots do not read as tiers
  { key: "boss", name: "Boss", kinds: ["boss"] },
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
 * stoop4's 5.75-block hitbox would sweep more than twice the buckets it
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
 * intermingled, all running out at the same moment, so `{ ironhide1: 10,
 * ironhide2: 20 }` arrives as one mixed push rather than ten runts followed by
 * twenty brutes. The plain form spawns from any pad; the region-group form
 * pins each group to one spawn region: `{ wave: [{ region: 1, stoop1: 50 },
 * { region: 2, ironhide2: 50 }] }` sends the runts from region 1's pads and the
 * brutes from region 2's, both groups draining at once.
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
 * everywhere (rollFamilies). Boss — the one boss — is in no family and
 * is never swapped: a boss is an event, not a volume.
 */
export const FAMILIES = [
  // THE LINE: straight bullets, heavy plating, and a shield on every tier
  // that has to survive its own approach. Not one arcing shell and not one
  // beam between them — everything this family fires goes where it is
  // pointed, and everything it does to stay alive is worn rather than
  // projected. Its two carriers are the ironhide4 (a shield for the crowd)
  // and the ironhide5 (plating for the crowd), so the tiers that hand something
  // out are the top two rather than the bottom three.
  //
  // WHAT IT POSES: a wall that walks, and armour is a flat shave floored at
  // a tenth (Sim.applyArmor) — so the answer is calibre and never volume.
  { key: "ground", name: FAMILY_NAMES.ground.name, layer: "ground", icon: "ironhide1",
    kinds: ["ironhide1", "ironhide2", "ironhide3", "ironhide4", "ironhide5"] },
  // THE SPITTERS: light, quick, and every shot they fire is the same purple
  // orb landing the same rot (weapons.ts POISON). No suicide charge, no
  // sap beams, no slag — one weapon look and one status across five tiers,
  // which is the whole point of the family. Its carrier is the weaver3,
  // and what it hands out is PACE, because rot runs on a clock and the
  // family wants more applications inside it.
  //
  // WHAT IT POSES: rot ignores armour, so this is the family a board that
  // out-plated the ground mechs still loses turrets to. Kill them before
  // the clock refreshes, or bring repair.
  { key: "weaver", name: FAMILY_NAMES.weaver.name, layer: "ground", icon: "weaver1",
    kinds: ["weaver1", "weaver2", "weaver3", "weaver4", "weaver5"] },
  // THE LIGHT: named for stars, armed with green lasers, and every laser
  // PIERCES — it takes every structure along its length (weapons.ts
  // pierce). Nothing flies; nothing is ballistic. Every tier heals or
  // shields the crowd around it, and the top two do both at once, so the
  // family is the one the board cannot wear down.
  //
  // WHAT IT POSES: a wall of green across a patch, from behind a crowd
  // that keeps mending. The answer is the carriers — kill the starhart4 and
  // the starhart5 before the line reaches the guns, because a row under a
  // starhart5 beam is a row.
  { key: "groundSupport", name: FAMILY_NAMES.groundSupport.name, layer: "ground", icon: "starhart1",
    kinds: ["starhart1", "starhart2", "starhart3", "starhart4", "starhart5"] },
  // THE BOMBERS: five bodies that ARE bombs (payload). Not one carries a
  // gun; each dives at the nearest structure inside its seek reach and
  // goes off on contact — and goes off the same way wherever it is shot
  // down. Fast at every tier (the T5 flies at 9 tiles/s). Its carriers
  // are the stoop3 (afterburner: the flight round it flies faster) and
  // the stoop4 (a jam over the ground: guns under it reload at half
  // pace, and a cluster charge). The stoop5 carries the small nuke, on a
  // fuse.
  //
  // WHAT IT POSES: an AA line over the guns it protects detonates bombers
  // over them. The answer is reach — kill them over nothing.
  { key: "air", name: FAMILY_NAMES.air.name, layer: "air", icon: "stoop1",
    kinds: ["stoop1", "stoop2", "stoop3", "stoop4", "stoop5"] },
  // THE SNIPERS: the whales — skate1, skate2, skate3, skate4, skate5 — and every
  // gun on them is a HARPOON RAIL from beyond the board's reach (forty to
  // eighty tiles). They crawl ashore (NAVAL_PACE, NAVAL_LAND_SPEED) and
  // GROW THE LONGER THEY LIVE (veteran): every hit multiplied by the
  // hull's age, to triple. The skate3 is the spotter (the fleet reaches
  // half again as far round it), the skate4 the drill (it ages faster round
  // it), and the skate5's rail goes through everything on its line.
  //
  // WHAT IT POSES: it is shooting you long before you can shoot it, and
  // it is getting stronger. The answer is the long guns, and killing
  // them young — the spotter and the drill first.
  { key: "naval", name: FAMILY_NAMES.naval.name, layer: "water", icon: "skate1",
    kinds: ["skate1", "skate2", "skate3", "skate4", "skate5"] },
  // THE WRAITHS: the sea slugs — livewire1, livewire2, livewire3, livewire4, livewire5
  // — and every gun on them is an ARC (weapons.ts): violet chain lightning
  // that hops from the structure it struck to its neighbours and SHORTS
  // every one it touches (Tower.shortT). Every hull BLINKS: a hit that
  // lands throws it forward, past the gun that landed it. The top three
  // CLOAK on a cycle — gone, untargetable, untouchable — and the
  // flagship's cloak veils the fleet round it.
  //
  // AND IT IS THE QUICK FLEET: twice the Harpoon fleet's pace (WRAITH_PACE)
  // and a fifth ashore rather than a half (WRAITH_LAND_SPEED). A livewire1
  // outruns an ironhide1. The crawl belongs to the snipers — a hull that is
  // hard to hold a target on has to arrive faster than a gun can settle.
  //
  // WHAT IT POSES: a line that cannot hold a target. The answer is
  // bursts and fields that catch a body wherever it lands, and killing
  // the flagship in the seconds it shows.
  { key: "navalSupport", name: FAMILY_NAMES.navalSupport.name, layer: "water", icon: "livewire1",
    kinds: ["livewire1", "livewire2", "livewire3", "livewire4", "livewire5"] },
] as const satisfies readonly {
  key: string;
  name: string;
  layer: MoveLayer;
  icon: UnitKind;
  kinds: readonly UnitKind[];
}[];

export type FamilyKey = (typeof FAMILIES)[number]["key"];

/**
 * THE HIGHLIGHT EVERY BODY WEARS, by family (constants.ts, the family
 * palette): the `-cell` region on its hull and the flames behind its
 * engines, which Mindustry paints in the team's colour and this game
 * paints in the FAMILY'S. A player reads which family a body is off the
 * colour on it before they read the sprite, and it is the same hue its
 * shots and its statuses are drawn in. Where a family is still on stock
 * art the sprite itself is untouched — only what it wears is ours. The
 * boss belongs to no family and keeps the swarm's crux red.
 */
export const FAMILY_ACCENT: Readonly<Record<FamilyKey, RGB>> = {
  ground: PAL.mech,
  weaver: PAL.venom,
  groundSupport: PAL.star,
  air: PAL.bomber,
  naval: PAL.harpoon,
  navalSupport: PAL.wraith,
};

/**
 * THE FAMILIES OFF THE BOARD, and the whole of how one gets there: name it
 * here. A shelved family keeps its bodies, its stats and its sprites —
 * every line of it is live code — it is simply never rolled into a wave
 * (rollFamilies), so it cannot be met.
 * Take the name back out and it is on the board again, at the level the
 * track always meant to open it on.
 *
 * NOTHING IS SHELVED. The Wraith fleet sat here (as the Aegis tanks) while
 * the support lines were re-cut; it blinks, cloaks and shorts now and holds
 * a front on its own, so all six families roll.
 */
export const SHELVED_FAMILIES: readonly FamilyKey[] = [];

/** the families in play: the table, less the shelf */
export const ACTIVE_FAMILIES: readonly FamilyKey[] = FAMILIES.map((f) => f.key).filter(
  (k) => !SHELVED_FAMILIES.includes(k),
);

/** how many families a deploy sends — the die picks this many */
export const FAMILIES_PER_RUN = 3;

/**
 * THE FAMILIES THAT ARRIVE BY AIR, and they are never dealt an opening
 * slot (rollFamilies).
 *
 * WAVE 1 MUST BE WALKABLE. A run opens with nothing on the board — no
 * turret is bought until the first scrap is banked — and the opening wave
 * is the one the player answers by putting the first card down. A ground
 * wave walks the route, which is a route the player can read and block; a
 * flight of runts crosses everything between the door and the core in a
 * straight line and cares about none of it. Meeting that on wave 1 is not
 * a hard opening, it is an opening with one legal answer, and the deal has
 * not necessarily handed over a turret that can even shoot up.
 *
 * IT IS READ OFF THE BODIES, not off the family's `layer` label: a family
 * is "air" here if ANY of its kinds flies, so a mixed family could never
 * sneak a flyer into the opening by being filed under ground. The two
 * agree today and the import check below keeps them agreeing.
 */
export const AIR_FAMILIES: readonly FamilyKey[] = FAMILIES.filter((f) =>
  f.kinds.some((k) => UNIT_STATS[k].flying),
).map((f) => f.key);

/** does this family put anything in the sky? */
export const familyFlies = (key: FamilyKey): boolean => AIR_FAMILIES.includes(key);

/** the family a kind belongs to, or null for the boss */
const FAMILY_OF: Partial<Record<UnitKind, FamilyKey>> = {};
for (const f of FAMILIES) for (const k of f.kinds) FAMILY_OF[k] = f.key;
export const familyOf = (kind: UnitKind): FamilyKey | null => FAMILY_OF[kind] ?? null;

/** a family's entry by key — every key in FamilyKey is in the table */
export const familyByKey = (key: FamilyKey) => FAMILIES.find((f) => f.key === key)!;

/**
 * THE HUE A BODY WEARS: its family's, or the swarm's crux red for the boss,
 * which is in no family. The renderer bakes this into a per-kind table
 * (KIND_ACCENT) and the HUD's thumbnails ask for it one body at a time
 * (unitIcon), and both wanted the same two lines.
 */
export const unitAccent = (kind: UnitKind): RGB => {
  const f = familyOf(kind);
  return f ? FAMILY_ACCENT[f] : TEAM_CRUX_RGB;
};

/**
 * THE FIVE STEPS A FAMILY COMES IN, T1 to T5 — the whole of a body's
 * name past its family's.
 */
export const UNIT_RANKS = ["runt", "brute", "elite", "champion", "apex"] as const;
export type UnitRank = (typeof UNIT_RANKS)[number];

/**
 * WHAT A BODY IS CALLED ON SCREEN, and it is NOT its kind. The kind is an
 * ID — it keys the sim's arrays, the sprite files under public/mindustry
 * and every wave in public/levels/campaign.json — and a panel that
 * answers "what is this?" with "starhart3" is naming a Mindustry unit the
 * player has never been shown a picture of.
 *
 * A BODY DOES NOT GET A NAME OF ITS OWN. It is its family and how far up
 * the family it is: an Ironhide (runt) and an Ironhide (apex) are the
 * same rhino at two sizes (docs/unit-art.md — five tiers are one animal
 * growing up), and twenty proper nouns made a player learn twenty things
 * to read what the ladder already says. Five words, shared by all six
 * lines, and the family in front of them is the whole roster.
 *
 * It is built off FAMILIES rather than typed out, so a family added to
 * that table is named the moment it has a `body` word and cannot go in
 * half-named. The boss is in no family and keeps its own name.
 *
 * Off ANIMAL_ART the ids come back as the names, capitalised, along with
 * Mindustry's sprites — the whole promise of that switch.
 */
export const UNIT_NAMES: Record<UnitKind, string> = (() => {
  const capitalised = Object.fromEntries(
    UNIT_KINDS.map((k) => [k, k[0].toUpperCase() + k.slice(1)]),
  ) as Record<UnitKind, string>;
  if (!ANIMAL_ART) return capitalised;
  const out = { ...capitalised };
  for (const f of FAMILIES)
    f.kinds.forEach((k, i) => {
      out[k] = `${FAMILY_NAMES[f.key].body} (${UNIT_RANKS[i]})`;
    });
  return out;
})();

/** what to print for a body: its name, never its id */
export const unitName = (kind: UnitKind): string => UNIT_NAMES[kind];

/**
 * How far up its family a body is, as the word the name carries — for a
 * panel that has already said which family this is and would only be
 * repeating itself. Null for the boss, which is in no family.
 */
const UNIT_RANK_OF: Partial<Record<UnitKind, UnitRank>> = {};
for (const f of FAMILIES) f.kinds.forEach((k, i) => (UNIT_RANK_OF[k] = UNIT_RANKS[i]));
export const unitRank = (kind: UnitKind): UnitRank | null => UNIT_RANK_OF[kind] ?? null;

/**
 * Clean a raw list of family keys: families IN PLAY only (the shelf is
 * still a shelf, whoever is asking), no duplicates, never more than a run
 * has slots for, in the order given.
 *
 * It is cleanMutations' opposite number (mutation.ts) and exists for the
 * same reason: custom mode lets a player NAME a family, and that name
 * reaches the roller by way of the save, where it can be hand-edited, go
 * stale across a release, or name something since shelved. Every reader
 * goes through here, so a bad key degrades to a rolled family rather than
 * reaching transformScript as a slot that casts to nothing.
 */
export function cleanFamilies(raw: unknown): FamilyKey[] {
  if (!Array.isArray(raw)) return [];
  const out: FamilyKey[] = [];
  for (const v of raw) {
    const key = ACTIVE_FAMILIES.find((f) => f === v);
    if (!key || out.includes(key)) continue;
    out.push(key);
    if (out.length >= FAMILIES_PER_RUN) break;
  }
  return out;
}

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
 * WHICH SLOTS THE OPENING WAVE DRAWS ON — the indices into scriptFamilies
 * that the script's FIRST wave actually sends, and therefore the slots a
 * flying family must be kept out of.
 *
 * It is a list rather than "slot 0" because a script is a document the
 * level editor writes: wave 1 is one family today, and the day somebody
 * opens with two, the second one must be kept walkable as well without
 * anybody having to remember that this rule exists.
 */
export function openingSlots(script: readonly LevelStep[]): number[] {
  const first = script.find((st) => "wave" in st);
  if (!first) return [];
  const slots = scriptFamilies(script);
  const out = new Set<number>();
  for (const g of waveGroups(first.wave))
    g.counts.forEach((c, i) => {
      if (c <= 0) return;
      const f = familyOf(UNIT_KINDS[i]);
      if (!f) return; // the boss belongs to no family and fills no slot
      const at = slots.indexOf(f);
      if (at >= 0) out.add(at);
    });
  return [...out].sort((a, b) => a - b);
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
 *
 * ...BUT NOT EVERY FAMILY IS ELIGIBLE FOR EVERY SLOT. A flying family is
 * never dealt a slot the opening wave sends (AIR_FAMILIES, openingSlots):
 * wave 1 is answered with the first card off the deal, and a flight that
 * ignores the route and the walls is not an opening a player can be asked
 * to solve with whatever the die handed them. Pass the script and the
 * guarantee is exact; pass none and it holds for slot 0, which is the
 * opening slot of every script this game has ever had.
 *
 * THE SHUFFLE IS OTHERWISE UNTOUCHED. The opening slots take the first
 * walking families off the shuffled pile and everything else falls into
 * the remaining slots in the order it was shuffled, so a flying family is
 * still equally likely to land in any slot that is not an opening one —
 * this narrows WHERE air can be dealt, never how often it is drawn.
 *
 * `chosen` IS CUSTOM MODE'S HAND, and the one way a family arrives
 * without the die. A regular deploy passes nothing and gets the roll
 * above; a custom one passes the families the player ticked, which are
 * taken FIRST and the rest of the run filled out by the same shuffle —
 * so a hand of one is one family asked for and two rolled. The
 * arrangement rule still holds over a chosen hand: a walker takes the
 * opening slot where the hand has one, because a script's first wave is
 * answered with the first card off the deal whoever picked the swarm.
 * What a chosen hand does NOT get is the second shuffle: the slots are
 * the player's list in the order they gave it, since a hand is not a
 * roll and there is no bias left to spread.
 */
export function rollFamilies(
  rand: () => number = Math.random,
  script?: readonly LevelStep[],
  chosen: readonly FamilyKey[] = [],
): FamilyKey[] {
  const hand = cleanFamilies(chosen);
  const pool: FamilyKey[] = ACTIVE_FAMILIES.filter((f) => !hand.includes(f));
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const picked = [...hand, ...pool].slice(0, FAMILIES_PER_RUN);
  const opening = script ? openingSlots(script) : [0];
  if (opening.length === 0) return picked;
  const out: (FamilyKey | undefined)[] = new Array(picked.length).fill(undefined);
  const spent = new Set<number>();
  // the opening slots first, each taking the earliest WALKING family still
  // unspent. If there are somehow none left the slot keeps a flyer rather
  // than coming up empty — a wave with nothing in it is worse than a hard one
  for (const slot of opening) {
    if (slot >= picked.length) continue;
    const at = picked.findIndex((f, i) => !spent.has(i) && !familyFlies(f));
    if (at < 0) continue;
    out[slot] = picked[at];
    spent.add(at);
  }
  // ...and everything else is SHUFFLED AGAIN into the slots that are left.
  // Filling them in the order the first shuffle happened to leave would
  // bias which slot a flyer lands in — reserving slot 0 pushes a family
  // shuffled to the front into slot 1, so air would take the second slot
  // twice as often as the third for no reason anyone designed. A second
  // shuffle over the leftovers costs two swaps and makes every
  // non-opening slot equally likely again.
  // A CHOSEN HAND SKIPS IT (see `chosen` above): there is no roll to
  // de-bias, and a player who listed three families is owed their list.
  const rest = picked.filter((_, i) => !spent.has(i));
  if (hand.length === 0)
    for (let i = rest.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [rest[i], rest[j]] = [rest[j], rest[i]];
    }
  let next = 0;
  for (let i = 0; i < out.length; i++) if (!out[i]) out[i] = rest[next++];
  return out as FamilyKey[];
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
 * layers carry the group form — `[{ region: 1, stoop1: 50 }, ...]` — and
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
 * forty runts, which arrived as a single dump) to 15.7s (wave 20's 2,506,
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
 * Armour is flat, max(dmg - armor, 0.1 * dmg), so an ironhide3 (armour 9)
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
    // few dozen runts on wave 1, the first heavies by wave 10, waves in
    // the thousands by the end, and the boss as the boss that closes
    // it. The waves overlap — the gap is shorter than a wave takes to
    // walk the lane — so the field is a tide, not a series of fights.
    //
    //   line       T1        T2       T3         T4         T5
    //   ironhide1     ironhide1    ironhide2     ironhide3   ironhide4    ironhide5
    //   weaver1    weaver1   weaver2    weaver3    weaver4     weaver5
    //   support    starhart1      starhart2   starhart3     starhart4       starhart5
    //   air        stoop1     stoop2  stoop3     stoop4   stoop5
    //
    // KEEP SENDING TIER-1 UNITS. They are the line's body, and nearly
    // free in the health budget — 150 hp against an ironhide4's 9,000, so one
    // T4 weighs as much as sixty runts. Spend the budget on T3/T4/T5
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
 * Animechs and the admin page — await loadLevelDocs() before a run or an
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

/**
 * A FAMILY'S `layer` AND ITS BODIES MUST AGREE about flight. AIR_FAMILIES
 * is read off the bodies so a mixed family cannot smuggle a flyer into
 * wave 1 under a "ground" label — and this says so at build time rather
 * than leaving the label quietly wrong for whatever else reads it.
 */
(() => {
  for (const f of FAMILIES) {
    const flies = f.kinds.some((k) => UNIT_STATS[k].flying);
    if (flies !== (f.layer === "air"))
      throw new Error(
        `the family "${f.key}" is filed under "${f.layer}" and ${flies ? "does" : "does not"} fly`,
      );
  }
})();
