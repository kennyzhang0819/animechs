import { CELL, HP0, PAL, TEAM_CRUX_RGB, UNIT_SPEED, UR, type MoveLayer } from "./constants";
import { ANIMAL_ART } from "./animalFlag";
import { explain, type RGB, type SaveResult } from "./types";
import { addDrop, dropForUnit, emptyDrop, type Drop } from "./economy";
// type only — mutation.ts must never depend on the campaign, and this
// import must never become a value one or the two files form a cycle
import type { MutationId } from "./mutation";

export const UNIT_KINDS = ["ironhide1", "ironhide2", "ironhide3", "ironhide4", "ironhide5", "dartback1", "dartback2", "dartback3", "dartback4", "dartback5", "starhart1", "starhart2", "starhart3", "starhart4", "starhart5", "stoop1", "stoop2", "stoop3", "stoop4", "stoop5", "skate1", "skate2", "skate3", "skate4", "skate5", "livewire1", "livewire2", "livewire3", "livewire4", "livewire5", "tusker1", "tusker2", "tusker3", "tusker4", "tusker5", "boss", "grapnel1", "grapnel2", "grapnel3", "grapnel4", "grapnel5", "kettle1", "kettle2", "kettle3", "kettle4", "kettle5", "wormhead", "wormcar", "wormtail", "railgun", "goad", "bastion", "bulwark", "lance", "halberd", "juggernaut", "fabricator1", "fabricator2", "fabricator3", "fabricator4", "fabricator5"] as const;
export type UnitKind = (typeof UNIT_KINDS)[number];
export type { TowerKind } from "./types";

/** numeric unit id — index into UNIT_KINDS, stored in the sim's ukind array */
export const UNIT_ID: Record<UnitKind, number> = {
  ironhide1: 0,
  ironhide2: 1,
  ironhide3: 2,
  ironhide4: 3,
  ironhide5: 4,
  dartback1: 5,
  dartback2: 6,
  dartback3: 7,
  dartback4: 8,
  dartback5: 9,
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
  tusker1: 30,
  tusker2: 31,
  tusker3: 32,
  tusker4: 33,
  tusker5: 34,
  boss: 35,
  grapnel1: 36,
  grapnel2: 37,
  grapnel3: 38,
  grapnel4: 39,
  grapnel5: 40,
  kettle1: 41,
  kettle2: 42,
  kettle3: 43,
  kettle4: 44,
  kettle5: 45,
  // the crosser's three pieces (see WORM_CHAIN) — no family, no tier
  // ladder, and never rolled into a wave
  wormhead: 46,
  wormcar: 47,
  wormtail: 48,
  // THE EMPLACEMENT A RAZE MISSION PLANTS (RAZE_NAME). No family, no tier
  // ladder, and never rolled into a wave
  railgun: 49,
  // ...and the two buff towers an intercept plants (PYLON_NAME)
  goad: 50,
  bastion: 51,
  // THE WARDENS (WARDEN_NAME). No family, no tier ladder, and no wave may
  // send one — nothing on any board puts one down today
  bulwark: 52,
  lance: 53,
  halberd: 54,
  juggernaut: 55,
  // THE FABRICATORS (FABRICATOR_NAME): five houses, one a tier, that a
  // map stands up to keep sending that tier (Sim.runFabricators)
  fabricator1: 56,
  fabricator2: 57,
  fabricator3: 58,
  fabricator4: 59,
  fabricator5: 60,
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
  // the kind ids stay `dartback1`..`dartback5` (the sim's arrays and every wave
  // on disk name them); the family is the poison frog on screen
  dartback: { name: ANIMAL_ART ? "Dartbacks" : "Venom spitters", body: "Dartback" },
  groundSupport: { name: ANIMAL_ART ? "Starhart" : "Starlight mechs", body: "Starhart" },
  air: { name: ANIMAL_ART ? "Stoop" : "Skyfall bombers", body: "Stoop" },
  naval: { name: ANIMAL_ART ? "Skates" : "Harpoon fleet", body: "Skate" },
  navalSupport: { name: ANIMAL_ART ? "Livewires" : "Wraith fleet", body: "Livewire" },
  // the seventh line, and the first that never had a Mindustry hull behind
  // it: it is the elephant or it is nothing, so it keeps its name off the
  // switch too (there is no upstream weapon to name it for)
  tusker: { name: "Tuskers", body: "Tusker" },
  // the eighth family, and the second with no upstream hull under it: the
  // starfish (game/grapnelArt.ts), named for the thing on its back
  grapnel: { name: "Grapnels", body: "Grapnel" },
  // the ninth line, the third with no upstream hull under it, and the
  // SECOND thing in the sky: the vulture (game/kettleArt.ts), named for
  // what a flock of them wheeling is called — a flight word like the
  // bat's Stoop, and not a proper noun
  kettle: { name: "Kettles", body: "Kettle" },
} as const satisfies Record<string, { name: string; body: string }>;

/**
 * WHAT THE ONE BOSS IS CALLED, beside the family names for the same reason
 * they are in one place: a name written twice is a name that can disagree
 * with itself, and this one is printed by both UNIT_TREES (the editor's
 * rows) and UNIT_NAMES (every panel).
 *
 * It is the only proper noun on the roster, and it is one for the reason
 * no BODY may have one: a body is its family and its rung, and there are
 * twenty of those; there is exactly one Sovereign. Off the animal switch
 * the Erekir hull is back on screen and the name goes with it.
 */
export const BOSS_NAME = ANIMAL_ART ? "Sovereign" : "Boss";

/**
 * WHAT THE CROSSER IS CALLED, beside the boss's name for the same reason:
 * it is in no family either, and a name written in two files is a name
 * that can disagree with itself.
 *
 * "Borer" and not "worm": the id says worm because that is the shape of
 * the thing in the sim's arrays — a chain of bodies on a line — and the
 * PLAYER is looking at a machine with a cutter head on the front
 * (game/wormArt.ts). Nothing alive crosses Coldline.
 */
export const WORM_NAME = "Borer";

/**
 * WHAT THE SIEGE'S BODIES ARE CALLED — the emplacement and its guards,
 * beside the boss's name and the crosser's for the reason they are all
 * here: none of the three is in a family, so none of them has a
 * `Body (rank)` to be built out of, and a name written in two files is a
 * name that can disagree with itself.
 *
 * THE RAILGUN IS NAMED FOR WHAT IT IS AIMED AT. It is not a turret the
 * player could ever own — it stands on ground the swarm holds, it has one
 * target on the whole board (UnitStats.bombard), and the only thing a
 * player ever does with it is take it down. "Railgun" and not a proper
 * noun, because there are ten of them.
 *
 * THE WARDENS ARE NOT HERE AT ALL. The four machines that used to hold
 * ground beside a railgun are shelved turrets now (types.ts
 * RETIRED_KINDS) and nothing on any board stands one up.
 */
export const RAZE_NAME = "Railgun";
/**
 * THE WARDENS — the swarm's four heavy machines, named rather than
 * tiered: they are in no family, so none of them has a `Body (rank)` to
 * be built out of the way every other body's name is (UNIT_NAMES).
 *
 * NOTHING PUTS ONE ON A BOARD. No wave may send one (FAMILIES, the
 * `objective: true` trees) and no mission stands one up. They walk at the
 * core like everything else on the ground when something does.
 */
export const WARDEN_NAME = "Wardens";

/** the two buff towers a mission plants over its road (docs/mission-marks.md) */
export const PYLON_NAME = "Pylons";

/** the five houses a map stands up, one a tier, each sending that tier of
 *  the run's families on its own clock (docs/mission-marks.md) */
export const FABRICATOR_NAME = "Fabricators";
export const FABRICATOR_KINDS: readonly UnitKind[] = [
  "fabricator1", "fabricator2", "fabricator3", "fabricator4", "fabricator5",
];
/** footprint in tiles, T1 to T5 — the stats' radius and the art's grid
 *  are both this (UNIT_STATS, fabricatorArt.ts) */
export const FABRICATOR_TILES: readonly number[] = [1, 2, 3, 4, 6];
/** seconds between one house's batches, by the mark's rate preset */
export const FABRICATOR_RATES = { slow: 45, medium: 30, fast: 20, xfast: 12 } as const;
export type FabricatorRate = keyof typeof FABRICATOR_RATES;
/** bodies a batch, T1 to T5: a runt house sends a handful, an apex house one */
export const FABRICATOR_BATCH: readonly number[] = [6, 4, 3, 2, 1];
/** the tier a house fabricates, 1-5, or 0 for a body that is not one */
export const fabricatorTier = (kind: UnitKind): number => FABRICATOR_KINDS.indexOf(kind) + 1;
/**
 * WHAT ONE PYLON IS WORTH (Sim.goadMul, Sim.bastionCut — they stack by
 * multiplying). A Goad doubles a Borer's pace, halving the firing a board
 * gets on it; a Bastion halves what reaches it. Either alone is a tax;
 * the wave 6 hand — a Goad and two Bastions — is the mission saying the
 * road is now the hard one.
 *
 * MARKED ON THE MAP, NOT IN A WAVE: no script may send one (UNIT_TREES,
 * objective). An author draws each tower where it stands and names the
 * train it is up for, and nothing about that is rolled — the escalation
 * IS the marks (missionMarks.ts BUFF_TOWER, docs/mission-marks.md).
 */
export const GOAD_SPEED_MUL = 2;
export const BASTION_CUT = 0.5;

/**
 * WHAT A TOWER RISING ON TRAIN WAVE `w` IS MADE OF — its health times this.
 *
 * EVERY TOWER THAT RISES ON ONE WAVE IS THE SAME TOWER, and the next wave's
 * are tougher. That is the whole rule: a board that has answered the pair
 * on wave 4 is not told it has answered wave 6's, and a player reads the
 * difficulty off the wave number rather than off a health bar. It is the
 * ONE thing about a buff tower the map does not decide — where and which
 * and when are all on the mark now, and this is what stops "when" from
 * being a free choice.
 *
 * IT IS GENTLER THAN THE TRAIN'S (WORM_RAMP_GROWTH, 1.35 compounding on
 * itself). A Borer is ONE body the whole board shoots for four minutes; a
 * tower is a thing the board has to go and knock down, and a curve that
 * steep would go from "kill it" to "never kill it" inside two waves. 1.28
 * a wave puts wave 6 at a shade over three times wave 1, which is a board
 * keeping up, not a board locked out.
 */
export const PYLON_RAMP_GROWTH = 1.28;
export const pylonRamp = (wave: number): number =>
  PYLON_RAMP_GROWTH ** Math.max(0, Math.floor(wave) - 1);

/**
 * THE NAVAL TANKS RUN SLOWER THAN MINDUSTRY'S HULLS. A skate1's stock 1.1
 * units a tick is 8.25 tiles a second — more than twice an ironhide1 — and on
 * a water route a third the length of Confluence's march that is a body a
 * wave-1 board sees for five seconds. Every naval speed below carries
 * this factor. IT IS THE SNIPER FAMILY (weapons.ts, the Harpoon fleet):
 * it fires from beyond the board's reach, so the crawl is the point — a
 * hull that takes two minutes to reach the guns has been shooting them
 * for two minutes, and every second of that is a second the board spent
 * being hit by something it could not answer. THE CRAWL USED TO BUY A
 * SECOND THING as well: the fleet carried a veterancy that multiplied
 * every hit by how long the hull had been alive, and a slow arrival was
 * a strong one. That is gone (see the rows in weapons.ts), and the pace
 * stands on reach alone. Change it here, not per hull — and note the
 * number is the STAT: half again afloat, half ashore (constants.ts
 * NAVAL_WATER_SPEED / NAVAL_LAND_SPEED).
 */
const NAVAL_PACE = 0.45;

/**
 * ...AND THE WRAITH FLEET RUNS AT TWICE THAT. The crawl is the SNIPER
 * family's premise, not this one's: a wraith carries no rail, it BLINKS
 * forward out of a hit and the top three go dark on a cycle (blink,
 * cloak), and every one of those reads as speed. At the
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

/* THE HARPOON FLEET NO LONGER AGES, and HARPOON_VETERAN is why there is a
   hole here. It was `{ perSecond: 0.025, max: 2 }`, one number shared by
   all five hulls: a hit grew by 2.5% of its row every second the hull had
   been alive, to triple at eighty seconds — half a minute of that round a
   skate4, whose drill (drillField) ran the clock two and a half times
   faster. The rows in weapons.ts were written LIGHT against it, so what a
   player met was a fleet whose damage depended on when the board got its
   first shot away rather than on what the wave brought: the same hull was
   a nuisance or a siege and nothing on screen said which.

   THE ROWS CARRY IT ALL NOW — every harpoon in weapons.ts went up by a
   third when the ramp came out, a flat buff and deliberately not the whole
   of what the ramp was worth. UnitStats.veteran and UnitStats.drillField
   are both still wired end to end (Sim, the status chips, the inspector)
   and nothing ships with either; the sim's HAS_VET gate reads the stat
   table, so the cost of keeping them is zero. */

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
   * signed (dartback4's is -15) but only its magnitude ever reaches the
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
 * fields exactly two — StatusEffects.burning, lit by the torch turret,
 * and StatusEffects.wet, soaked in by the liquid turrets (douser, deluge).
 *
 * WET IMMUNITY BELONGS TO THE HULLS, and to nothing else. UnitType.init
 * adds StatusEffects.wet to the immunities of every naval type the moment
 * it detects one (the `water preset` block, alongside canDrown = false), so
 * it is not a per-unit authoring choice upstream and is not one here — all
 * ten ships declare it. It now buys immunity to the SLOW ALONE: a boat is
 * already in the water, but soak still builds on it and still breaks it
 * down under the threshold (docs/elements.md). Burning immunity is the
 * opposite: two kinds have it by hand.
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
  /**
   * Collision radius in world px — half the square hitbox edge, and the
   * body's size in EVERY direction unless `hitbox` below says otherwise.
   */
  radius: number;
  /**
   * THE BODY'S SHAPE, when a circle is the wrong one: `long` nose to tail
   * along the facing, `wide` flank to flank across it, both full extents
   * in px (hitbox.ts). Omit it and the body is the circle `radius` makes,
   * which is what the whole roster still is — a deer that should be long
   * and a frog that should be square are what this is for.
   *
   * THE HITBOX IS THE SIZE, not a second opinion about it: `radius` stops
   * being read the moment this is set, and the sim's `urad` (mass, splash
   * reach, aura reach, the shield halo) becomes the equal-area circle of
   * the two axes. Reshape a body in the admin Hitboxes tab and it gets
   * heavier when it gets bigger, exactly as it should.
   */
  hitbox?: { long: number; wide: number };
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
   * repeater round's knockback is a Mindustry impulse, and this is what
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
   * ARMOUR IS A FLAT SHAVE FLOORED AT A TENTH OF THE HIT (Sim.applyArmor), so
   * this is not a percentage of anything and its worth depends entirely on
   * what is shooting: +12 armour is nothing at all to a cleaver and very
   * nearly everything to a wall of tackers. That is the point of it — an
   * ironhide5 in the crowd does not make the crowd tougher, it makes SMALL
   * CALIBRE stop working, and the answer is to bring a bigger gun rather than
   * more of the same one.
   */
  armorField?: { amount: number; reload: number; range: number };
  /**
   * THE HASTE AURA — the dartback3's, and the venom line's family trait made
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
   * THE DRILL — the skate4's, until the Harpoon fleet stopped ageing.
   * Every `reload` seconds the carrier stamps every body in `range` so
   * that its VETERANCY clock (`veteran` below) runs `mult` times faster
   * while the stamp lasts. Only a kind that has a veterancy at all takes
   * anything from it — so with nothing on the roster ageing, NOTHING
   * SHIPS WITH THIS. It stays wired for the family that wants it back.
   */
  drillField?: { mult: number; reload: number; range: number };
  /**
   * VETERANCY — THE LONGER IT LIVES THE HARDER IT HITS. Every weapon the
   * body fires does `1 + perSecond x age` times its row, up to `1 + max`;
   * age is seconds since it arrived (Sim.uage).
   *
   * NOTHING SHIPS WITH IT. It was the Harpoon fleet's family trait and was
   * taken off all five hulls — a body whose damage depends on how long the
   * board took to reach it is a body a player cannot read, and the fleet's
   * rows in weapons.ts carry the whole number now (see the note by
   * NAVAL_PACE). The mechanism stays because it is a good one for a family
   * built around it from the start, and it costs nothing while unused: the
   * sim's HAS_VET gate reads this table and skips the pass entirely.
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
   * THE CHARGE — the Tuskers' family trait, and the thing that makes a
   * MELEE family possible at all: A BODY THAT LEAVES THE ROUTE TO GET AT
   * A GUN.
   *
   * Every other body on the roster attack-moves — it walks the flow field
   * toward the core and shoots whatever happens to come inside its reach
   * on the way (Sim.updateUnitWeapons). That works because every other
   * family reaches eleven to ninety tiles, so "on the way" is most of the
   * board. A family whose longest weapon is four tiles would simply file
   * past a turret line the field routed it around and never touch it.
   *
   * So this one BREAKS FORMATION. With a structure it can see inside
   * `range`, the body drops the field and walks straight at it
   * (Sim.updateUnits), and `range` is also how far out it goes looking
   * (Sim.updateUnitWeapons picks a target within the longer of this and
   * its weapons' reach). A tusker that has seen your guns is not going to
   * the core any more; it is coming to the guns, and it will keep coming
   * while it can see one.
   *
   * IT IS SAFE TO WALK STRAIGHT AT: a ground body may only target what it
   * can SEE (canSee), so the line to the target is a line with no rock on
   * it. What the charge can still walk into is a crowd, and the crowd
   * shove sorts that out the way it does for everything else.
   */
  charge?: { range: number };
  /**
   * THE BOMBARDMENT — the siege's emplacement, and the one body on the
   * roster that never looks at a turret: IT SHOOTS THE CORE, FROM WHEREVER
   * IT STANDS, AND NOTHING ELSE EVER.
   *
   * Every other kind here attack-moves: it walks the field and fires at
   * the nearest structure that comes inside its reach. A railgun does not
   * walk (speed 0, and it is planted — Sim.plantUnit), does not search,
   * and does not care what the player builds around it. Its target is
   * resolved once, to the core, and its weapon's reach is the width of the
   * board because the whole point of the thing is that it is out of
   * everybody's range and shooting anyway.
   *
   * SO THE ONLY ANSWER TO IT IS TO GO AND KILL IT, which is the sentence
   * the venture-and-destroy archetype is made of (docs/mission-design.md).
   * A player who ignores one is not losing turrets — they are losing the
   * core, slowly, on a clock nothing on the board can interrupt.
   *
   * It costs a branch in the target pick (Sim.updateUnitWeapons) and
   * nothing else: a bombarding body skips the structure search entirely,
   * so ten of them on a board are ten bodies that never walk a ring.
   */
  bombard?: boolean;
  /**
   * CLOAK — every `period` seconds the body vanishes for `duration`, and
   * it is drawn as a ghost of itself. `veil` is the flagship's: when it
   * cloaks, every body within that radius cloaks with it for the same
   * duration.
   *
   * IT STOPS ROUNDS, AND ONLY ROUNDS (Sim.damageUnit, Sim.bestTarget). A
   * bullet cannot find a hull that is not where it was aimed; fire, a
   * bolt, a beam, a ray and a rail are not aimed at a point in that
   * sense, so the seven non-bullet turrets (constants.ts
   * NON_BULLET_KINDS) both take aim at a dark hull and hurt it.
   *
   * IT USED TO STOP EVERYTHING, and that was the problem: a window in
   * which the whole board could do nothing is a pause, not a mechanic,
   * and the only counterplay it offered was waiting. Now a cloak asks the
   * player a question their line can be built to answer — own one of the
   * seven and the fleet is a hard fight; own none and it is still the
   * fight it always was.
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
   * THE STARBURST — the Grapnels' family trait, and the only one on the
   * roster that is not something the body DOES but something that happens
   * TO it. A grapnel carries no weapon at all (weapons.ts UNIT_WEAPONS):
   * it crawls to the core and never once takes aim. What it does instead
   * is throw stars (weapons.ts GRAPNEL_STARS, Sim.throwStar):
   *
   *   A HIT THAT LANDS on it throws one back, `chance` of the time, out
   *   of one of its five arms and no oftener than every `cooldown`
   *   seconds — so a body nobody is shooting at is a body doing nothing,
   *   and a line that opens up on one is a line it is now answering.
   *
   *   ITS DEATH throws FIVE at once, one down every arm, wherever it
   *   falls. Killing a grapnel is not the end of it; it is the loudest
   *   thing it does, and killing one inside your own patch is a mistake
   *   the burst charges for.
   *
   * THE COOLDOWN IS WHAT MAKES IT SURVIVABLE. Without one, rot, fire and
   * a beam's every tick would each roll the chance — a body under a
   * furnace would answer sixty times a second — so the clock is the real
   * rate limit and the chance is the texture on top of it.
   *
   * `merge` IS THE OTHER HALF OF THE FAMILY (Sim.mergeGrapnel): a
   * grapnel REACHES for the nearest grapnel of its own kind and folds
   * with it on purpose, up to `merge` bodies in one. Health, maximum
   * health, shield and the star's bite all add, exactly as they do under
   * the squeeze every other kind shares (constants.ts MERGE_*) — the
   * difference is that this one is deliberate and happens in the open
   * rather than only in a jam. A field of runts left alone becomes a
   * handful of very heavy runts throwing very heavy stars.
   */
  starburst?: { chance: number; cooldown: number; merge: number };
  /**
   * Mindustry UnitType.immunities: status effects that simply never take.
   * The check is at application time (StatusComp.apply returns early), not
   * a resistance — an immune unit is never lit at all, so it also never
   * shows the burning flicker.
   */
  immunities?: readonly StatusKind[];
  /**
   * NO SLOW EVER SCALES THIS BODY'S DRIVE. It is not an immunity in the
   * StatusKind sense — the status still lands, the body still tints, a
   * soak still douses a fire and still hands the electric ammunition its
   * bonus — it is the SPEED MULTIPLIER that is refused, and every one of
   * them: the wet slow the liquid turrets sell and anything that joins it
   * later. The same shape the Speedy mutation already has (Sim.applyWet),
   * written as a property of the kind instead of a rule about the run.
   *
   * The crosser carries it because the mission is a promise about WHEN
   * (missions.ts): a Borer's arrival is a clock the player reads off the
   * road from wave one, and a douser out on the line must not be able to
   * rewrite it.
   */
  unslowable?: boolean;
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

/**
 * HOW FAST A WORM CROSSES, world px/s. Coldline's south line is 14,100 px
 * of walking and its north line 12,000, so at 2.35 tiles a second a Borer
 * is on the board for 5:00 on the long road and 4:16 on the short one —
 * long enough that a player who sees one enter has time to decide whether
 * to answer it, and short enough that five launches and a spare fit
 * inside a run of about twenty minutes (WORLDS, Coldline).
 *
 * BOTH ROADS COUNT THEIR RUN-UP. A road's first leg is the off-board one
 * the train crawls in along (missions.ts), and it is now most of a
 * kilometre because the train itself is: the head is laid at the chain's
 * whole length past the entry (Sim.launchCrosser), so the run-up has to
 * be longer than the train or the head would appear in open ground with
 * forty cells of map behind it. The numbers above are the full arc
 * length, run-up included, which is the launch-to-last-piece-gone clock.
 */
const WORM_SPEED = 2.35 * CELL;

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
    // four planted legs (LEG_ART.ironhide4 in atlas.ts), and a rhino is a
    // BLOCK. It is the one family on the roster whose legs never leave
    // the body at all.
    //
    // THE MOUNTS ARE ALMOST AT THE CENTRE — `baseOffset` 1.5 against the
    // 8 it used to run — and the leg is long enough to reach out from
    // there to the edge and no further (`length` 11, `lengthScl` 0.95,
    // putting the resting foot 1.09 radii out). That sounds like nothing
    // and it is the whole change: the KNEE sits about half way along a
    // leg, so pulling the mount in drags the knee in with it. This one's
    // rides at 0.86 radii through every part of its step — inside the
    // silhouette, under 55 px of drawn body, never seen. What clears the
    // outline is a hoof and a stub of shin, which is what a rhino seen
    // from overhead actually shows. It used to swing its feet out to 3.08
    // radii with the knee at 1.89, folded and bare on both sides of a
    // plate: four thin limbs around a block, which is a spider.
    //
    // And the step is short with it — `moveSpace` 0.7 walks 0.88 radii
    // between footfalls against 2.07 before, so no foot is ever left
    // trailing two body-widths back. `elevation` 0.15 keeps the swinging
    // hoof low: this one does not pick its feet up, it shoves them along.
    // The strokes that go with all this are in IRON_TIERS
    // (game/ironhideArt.ts) — a sixth of the grid, up from a ninth
    ...(ANIMAL_ART
      ? {
          legs: legs({
            count: 4,
            length: 11 * MU,
            forwardScl: 0.65,
            moveSpace: 0.7,
            baseOffset: 1.5 * MU,
            lengthScl: 0.95,
            speed: 0.14,
            elevation: 0.15,
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
  // armor 30 is the number that matters. Armour is a flat shave floored at a
  // tenth of the raw shot (see Sim.applyArmor), so anything firing under 20 a
  // hit is reduced to paying the floor: a tacker's 9-damage bolt lands 0.9
  // instead of 9, and a full tacker wall does a tenth of its paper DPS. The
  // counter is calibre, not volume — one piercer hit clears the shave twice
  // over. No ability: at this weight it does not need one
  ironhide5: {
    hp: 24000,
    speed: 3 * CELL,
    armor: 30,
    radius: UR * 3.75,
    tier: 5,
    rotateSpeed: 1.65,
    // THE CROWN HANDS ITS PLATING DOWN. The line's whole argument is that
    // armour is a flat shave and the counter is calibre, not volume; this is
    // that argument applied to everything walking with it. +12 within nine
    // tiles turns an ironhide1 escort into something a tacker wall reduces
    // itself against, and changes nothing at all for a cleaver.
    //
    // It carries no shield of its own. The ironhide2 and the ironhide3 wear one
    // because they are the tiers that have to survive their own approach;
    // the ironhide5 survives on thirty armour and twenty-four thousand health,
    // and what it adds to the line is the thing it is already best at.
    armorField: { amount: 12, reload: 2, range: 9 * CELL },
    // THE ANIMAL TRIAL (animalFlag.ts): the Ironhide T5, the same block
    // on the same four legs at its own weight (LEG_ART.ironhide5 in
    // atlas.ts), on a body drawn 75 px across. Knee at 0.80 radii, the
    // most buried on the roster; see the note on the ironhide4 above
    ...(ANIMAL_ART
      ? {
          legs: legs({
            count: 4,
            length: 14 * MU,
            forwardScl: 0.6,
            moveSpace: 0.65,
            baseOffset: 2 * MU,
            lengthScl: 0.95,
            speed: 0.13,
            elevation: 0.2,
            ripple: 3,
          }),
        }
      : {}),
  },
  // dartback1: 150 hp, no armor, 1x1-block hitbox, 7.5 tiles/s — twice the
  // ground line's pace, and the fastest walker in the game.
  //
  // IT IS NOT A BOMB ANY MORE. The suicide charge is gone (weapons.ts): a
  // family whose signature is a status that takes six seconds to work
  // cannot have its opening tier delete itself on contact, because a dead
  // spitter stops refreshing the clock it just started. So the T1 lives,
  // keeps its pace, and spits — one orb every three seconds, and every orb
  // lands the rot.
  dartback1: {
    hp: 150,
    speed: 7.5 * CELL,
    armor: 0,
    radius: UR,
    tier: 1,
    // THE ANIMAL TRIAL (animalFlag.ts): the Dartback runt keeps the dartback1
    // mech's rig, a frog with its feet tucked (MECH_ART.dartback1 in atlas.ts)
  },
  // dartback2: the venom line's T2 — 600 hp, armor 2, a 1.625x1.625-block
  // hitbox, 5.5 tiles/s. It is the dartback1's VOLUME tier and nothing else:
  // the same orb, the same rot, four times the health and four barrels.
  //
  // IT NO LONGER THROWS SLAG — the whole tree throws one thing now
  // (weapons.ts) — but it keeps `immunities: burning`, and the reason has
  // simply moved. Upstream it is fireproof because it is the slag unit;
  // here it is fireproof because TORCH IS THE OBVIOUS ANSWER TO A LIGHT,
  // FAST, CLOSE-RANGE FAMILY, and a family with no answer to its own
  // counter is one the player solves with a wall of one turret. So the tier
  // the swarm upgrades INTO is the tier the flame slides off, and a board
  // that opened with torch has to find a second idea by wave twenty.
  dartback2: {
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
    // frog's — SHORT, THICK AND FOLDED UNDER. The whole tree plants its
    // feet about 1.2 body radii out (`baseOffset` + `length` *
    // `lengthScl` over `radius`) where it used to reach 2.85, on mounts
    // pulled in near the centre, so the thigh is buried under the flank
    // and what clears the outline is a stub of shank and the webbed pad
    // on the end of it. `extension` runs that shank back over its own
    // knee, which is what lets the rig drop its caps (game/atlas.ts).
    // Long thin limbs on long mounts are what read as a spider however
    // few of them there are; the strokes and the pad are in FROG_TIERS
    // and frogLegged (game/familyArt.ts)
    legs: ANIMAL_ART
      ? legs({ count: 4, length: 8 * MU, forwardScl: 0.6, moveSpace: 1, baseOffset: 1 * MU, extension: 2 * MU, lengthScl: 0.85, elevation: 0.1 })
      : legs({ count: 4, length: 5 * MU, forwardScl: 0.6, moveSpace: 1.1, elevation: 0.12 }),
  },
  // dartback3: the line's T3 — 1000 hp, armor 9, a 1.875x1.875-block hitbox,
  // 0.54 px/tick = 4.05 tiles/s, the slowest thing on the field. Six legs
  // on longer mounts (legBaseOffset 2) stepping three at a time
  dartback3: {
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
    // THE ANIMAL TRIAL (animalFlag.ts): the Dartback T3 — the T2's
    // crouch on the bigger body, at the same 1.2 radii
    legs: ANIMAL_ART
      ? legs({ count: 4, length: 9 * MU, forwardScl: 0.65, moveSpace: 1, baseOffset: 1 * MU, extension: 2.2 * MU, lengthScl: 0.85, elevation: 0.12 })
      : legs({
          count: 6,
          length: 6.5 * MU,
          forwardScl: 0.8,
          moveSpace: 1.1,
          baseOffset: 1.5 * MU,
          elevation: 0.15,
        }),
  },
  // dartback4: the dartback1 line's T4 — 8000 hp, armor 14, a 2.875x2.875-block
  // hitbox, 0.62 px/tick = 4.65 tiles/s. Eight times the dartback3's health
  // on something that walks faster than it, which makes it the only T4 on
  // the roster that is quicker than the T3 it replaces
  //
  // Its legs are the difference: 30 world units against the dartback3's 13,
  // on mounts 10 units out, so it straddles ground the dartback3 walks over.
  // legPairOffset 3 staggers the gait leg by leg (the dartback3's 0 swings
  // each three-leg group as one piece), and legExtension 15 runs each
  // lower segment a whole segment back past its own knee, so the limb
  // sprite covers the joint — which is why dartback4 needs no knee cap where
  // every other legged unit has one
  //
  // rippleScale 2 doubles the dust a planted foot throws. Mindustry also
  // gives it legSplashDamage 32 over legSplashRange 30, a stamp that hurts
  // whatever the foot lands on: it has no target here, since this game's
  // towers cannot be damaged and the player fields no units of its own, so
  // what survives of the footfall is the dust and the reach
  dartback4: {
    hp: 8000,
    speed: 5.5 * CELL,
    armor: 7,
    radius: UR * 2.875,
    tier: 4,
    drag: 0.1,
    rotateSpeed: 2.7,
    // THE ANIMAL TRIAL (animalFlag.ts): the Dartback T4 — the same
    // crouch again, staggered leg by leg so the four do not swing as one
    legs: ANIMAL_ART
      ? legs({
          count: 4,
          length: 14 * MU,
          forwardScl: 0.7,
          pairOffset: 3 * MU,
          moveSpace: 0.95,
          baseOffset: 1.5 * MU,
          extension: 3.8 * MU,
          lengthScl: 0.85,
          speed: 0.2,
          elevation: 0.18,
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
  // dartback5: the dartback1 line's T5 — 18000 hp, armor 10, a 3.25x3.25-block
  // hitbox, and 0.5 px/tick = 3.75 tiles/s, which is exactly the ironhide1's
  // marching pace: the largest frog on the field keeps up with the line
  // it walks in front of
  //
  // Its legs are the whole silhouette. Eight of them at 75 world units —
  // two and a half times the dartback4's 30, the longest reach on the roster
  // — on mounts only 8 units out, so the body sits low inside a span it
  // straddles rather than stands on. legLengthScl 0.93 folds them a little
  // further in than dartback4's 0.96, and shadowElevation 0.95 lifts a
  // swinging foot almost a full body-height off the ground: the gait is
  // visibly high-stepping where the dartback4's is a scuttle
  //
  // Like the dartback4 it has no knee cap and takes a shoulder plate instead
  // (legExtension 20 runs each lower segment back over its own joint), and
  // like the dartback4 its legSplashDamage 80 / legSplashRange 60 has nothing
  // to hit here — towers cannot be damaged and the player fields no units
  // — so what lands is rippleScale 3, half again the dartback4's dust
  dartback5: {
    hp: 18000,
    speed: 5 * CELL,
    armor: 10,
    radius: UR * 3.25,
    tier: 5,
    drag: 0.1,
    rotateSpeed: 1.9,
    // THE ANIMAL TRIAL (animalFlag.ts): the Dartback T5 — the family's
    // stance at its largest, and still a crouch: the biggest frog on the
    // field puts its feet no further out, in radii, than the T2 does
    legs: ANIMAL_ART
      ? legs({
          count: 4,
          length: 16 * MU,
          forwardScl: 0.7,
          pairOffset: 3 * MU,
          moveSpace: 0.9,
          baseOffset: 1.5 * MU,
          extension: 4.2 * MU,
          lengthScl: 0.85,
          speed: 0.18,
          elevation: 0.2,
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
  // stoop1: 70 hp, no armor, 1.125-block hitbox, 8 tiles/s (upstream 20.25).
  // Still the fastest body in the game — it outruns a dartback1 and laps an
  // ironhide1, in a straight line over everything — but eight is a pace a
  // gun can track, and fifteen was not: the runt is the tier the script
  // sends in the hundreds, and at fifteen a hundred-tile approach was
  // seven seconds of fire against a walking wave's twenty-seven.
  // THE T1 IS THE FAMILY IN MINIATURE (the Skyfall bombers): no gun, a
  // charge that goes off on the turret it dives at — or wherever it is
  // shot down — for 75 over three and a half tiles
  stoop1: {
    hp: 70,
    speed: 8 * CELL,
    armor: 0,
    radius: UR * 1.125,
    tier: 1,
    drag: 0.04,
    flying: true,
    payload: { splash: 75, radius: 28 * MU },
  },
  // starhart1: the T1 of the Starlight mechs — 200 hp, armor 1, a
  // 1.25x0.9375-block hitbox, 0.55 px/tick = 4.125 tiles/s. Frailer than
  // an ironhide1 but a step quicker. THE T1 IS THE FAMILY IN MINIATURE: a thin piercing green
  // lance (weapons.ts) and a repair field — RepairFieldAbility(10, 60*4)
  // upstream, a little quicker here: 12 hp to everything within 7.5 tiles
  // every 3 s, so a starhart1 escort keeps its line topped up between volleys
  starhart1: {
    hp: 200,
    speed: 4.125 * CELL,
    armor: 1,
    radius: UR * 1.25,
    tier: 1,
    repairField: { amount: 12, reload: 3, range: 7.5 * CELL },
  },
  // starhart2: support T2 — 320 hp, armor 4 (an ironhide2's plating on half its hp),
  // a 1.75x1.125-block hitbox, 0.7 px/tick = 5.25 tiles/s: the line's fastest
  // walker, so it arrives ahead of the runts it escorts
  // ShieldRegenFieldAbility(20, 40, 60*5, 60) upstream; +25 shield every
  // 4 s up to a 60-point cap here, over the same 7.5-tile field — the
  // family is the one that hands out shields, and its T2 is where that
  // starts
  starhart2: {
    hp: 320,
    speed: 5.25 * CELL,
    armor: 4,
    radius: UR * 1.75,
    tier: 2,
    shieldField: { amount: 25, max: 60, reload: 4, range: 7.5 * CELL },
  },
  // starhart3: support T3 — 640 hp, armor 9 (an ironhide3's plating), a
  // 2x1.3125-block hitbox, 0.5 px/tick = 3.75 tiles/s: after the
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
    radius: UR * 2,
    tier: 3,
    forceField: {
      radius: 7.5 * CELL,
      regen: 0.4 * 60,
      max: 500,
      cooldown: 6,
    },
  },
  // starhart4: the support line's T4 — 7800 hp, armor 16, a 3.75x2.5-block hitbox,
  // 0.44 px/tick = 3.3 tiles/s, and rotateSpeed 1.8, the slowest turn on
  // the roster. Thirteen elites' health with none of the starhart3's reach:
  // where its predecessor covers the ground around it, this one is simply
  // very hard to remove
  //
  // immunities = burning: torch's flame slides off this one exactly as it
  // does off the dartback2, the roster's only other fireproof unit. A flame
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
    hp: 7800,
    speed: 3.3 * CELL,
    armor: 16,
    radius: UR * 3.75,
    tier: 4,
    rotateSpeed: 1.8,
    immunities: ["burning"],
    repairField: { amount: 40, reload: 2, range: 9 * CELL },
    shieldField: { amount: 30, max: 300, reload: 2, range: 9 * CELL },
    // THE ANIMAL TRIAL (animalFlag.ts): the Starhart T4 is the tier the
    // stag's stance opens, so it leaves the mech rig for four planted legs
    // (LEG_ART.starhart4 in atlas.ts carries the art).
    //
    // A DEER DOES NOT CRAWL. The legged rig will make anything a spider
    // if it is let: mounts on a wide ring, a foot planted well outside
    // the flank, and a knee folded hard enough to stand proud of the body
    // is a crab's limb whatever animal is drawn over it. So this one
    // walks instead, and every number below is that one decision.
    //
    // THE FOOT LANDS AT THE OUTLINE, 1.10 radii out against the 1.32 it
    // used to stand at — a third of a body clear of its own edge — so
    // what shows past the flank is a hoof and the last of a shin, not a
    // splayed limb. Both numbers below went up a quarter with the animal
    // (familyArt.ts HART_TIERS), which is what holds that 1.10 where it
    // was. `lengthScl` 0.92 runs the leg near straight from
    // shoulder to hoof, which is what a deer's leg is from above; the
    // knee barely leaves the line between the two. `elevation` 0.55
    // nearly doubles the lift, so a swinging hoof rises clear of the
    // ground instead of dragging round to the next plant. The stride
    // stays about four fifths of the leg's own length (`moveSpace` 1.25
    // on a leg cut by a sixth), so the hoof really does swing fore and
    // aft through a step rather than shuffling, and `forwardScl` 0.65
    // holds the reach-ahead where the rest of the roster keeps it instead
    // of yanking the limb out past what its two segments can span. The
    // gait groups are diagonal pairs already (four mounts at 45 degrees,
    // `groupSize` 2) — a trot, and the one thing here that was right.
    //
    // The art goes with it: HART_TIERS (game/familyArt.ts) tapers the
    // thigh into a much thinner shin, because two segments of one
    // middling width is a crab's limb however it is walked.
    //
    // Off the trial it has no gait and walks as the mech it always was
    ...(ANIMAL_ART
      ? {
          legs: legs({
            count: 4,
            length: 12.5 * MU,
            forwardScl: 0.65,
            moveSpace: 1.25,
            baseOffset: 5 * MU,
            lengthScl: 0.92,
            speed: 0.22,
            elevation: 0.55,
            ripple: 2,
          }),
        }
      : {}),
  },
  // starhart5: the support line's T5 — 17000 hp, armor 14, a 4.5x3-block
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
  // Four legs, not the six or eight the dartback1 line runs on, at 14 world
  // units on mounts 11 out: nearly all of the leg is the mount offset, so
  // it stands on stubby posts planted wide of a body that overhangs them
  starhart5: {
    hp: 17000,
    speed: 2.25 * CELL,
    armor: 14,
    radius: UR * 4.5,
    tier: 5,
    rotateSpeed: 1.5,
    repairField: { amount: 80, reload: 2, range: 11 * CELL },
    shieldField: { amount: 50, max: 500, reload: 2, range: 11 * CELL },
    // THE ANIMAL TRIAL (animalFlag.ts): as the Starhart T5 the four legs
    // are a stag's — the starhart4's walk scaled to the bigger body:
    // feet 1.11 radii out, the limb near straight, and the highest lift
    // on the roster. Never a spider's span and never a spider's crawl;
    // see the note on the starhart4 above
    legs: ANIMAL_ART
      ? legs({
          count: 4,
          length: 15 * MU,
          forwardScl: 0.65,
          moveSpace: 1.25,
          baseOffset: 6.25 * MU,
          lengthScl: 0.92,
          speed: 0.2,
          elevation: 0.65,
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
  // that is right even where the numbers are not. The line reads
  // 8, 7, 6, 5, 4 here.
  //
  // IT IS A STRAIGHT RAMP NOW, AND IT USED TO BE A CLIFF. The line read
  // 15, 10, 10, 5, 4 — which is not a curve, it is the T1 in a category of
  // its own with the rest of the family behind it. Fifteen was FOUR TIMES
  // an ironhide1 and twice the quickest thing on the ground, and the
  // runt is the tier the script sends by the hundred: a hundred bodies
  // at fifteen tiles a second crossing a hundred tiles of board gave a
  // line seven seconds of fire where a walking wave gives it
  // twenty-seven. The board was not being beaten, it was being skipped.
  //
  // EIGHT IS STILL THE FASTEST THING IN THE GAME and still a straight
  // line over every wall and every channel — a stoop1 outruns a dartback1
  // and laps an ironhide1 — but eight is a pace a gun can track, which
  // fifteen was not. The ramp down from there is one tile a tier, so
  // every step up the tree really is a trade of pace for weight rather
  // than a flat stretch in the middle (the T2 and T3 both sat at ten).
  // The T4 and T5 are untouched and still deliberately heavy: a hull
  // that takes a patch when it lands is a hull the board should see
  // coming.
  //
  // WHAT THE FAMILY ASKS A BOARD FOR is unchanged — guns that reach the
  // sky and answer fast. This is only the time to bring them to bear.

  // stoop2: the T2 — 340 hp, armor 3, 1.375x1.375-block hitbox, 7 tiles/s
  // (upstream 12.375). Slower than a stoop1 but four times the health, and
  // armour 3 blunts the airburst flak that shreds the T1
  // The charge is the bomber's whole reason: 275 over five tiles, which
  // is the old bomb rack's whole rain delivered in one arrival
  stoop2: {
    hp: 340,
    speed: 7 * CELL,
    armor: 3,
    radius: UR * 1.375,
    tier: 2,
    drag: 0.03,
    rotateSpeed: 4.5,
    flying: true,
    payload: { splash: 275, radius: 40 * MU },
  },
  // stoop3: the T3 — 700 hp, armor 5, a 2.5x2.5-block hitbox that makes it
  // the widest thing in the sky below the T4/T5 hulls, at 6 tiles/s
  // (upstream 12.75) — a tile under the stoop2 for two and a half times
  // its bulk, where the two used to share a pace. THE AFTERBURNER (hasteField): everything within nine
  // tiles of it flies four tenths faster — a flight of bombers crossing
  // the flak spends that much less time in it, which for a body whose
  // job is to arrive is the whole game. Its own charge is a stoop2's
  stoop3: {
    hp: 700,
    speed: 6 * CELL,
    armor: 5,
    radius: UR * 2.5,
    tier: 3,
    drag: 0.016,
    flying: true,
    hasteField: { mult: 1.4, reload: 2, range: 9 * CELL },
    payload: { splash: 400, radius: 48 * MU },
  },
  // stoop4: the air line's T4 — 6500 hp, armor 12, and a 5.75x5.75-block
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
    hp: 6500,
    speed: 5 * CELL,
    armor: 12,
    radius: UR * 5.75,
    tier: 4,
    drag: 0.04,
    rotateSpeed: 1.9,
    flying: true,
    jamField: { rate: 0.5, reload: 2, range: 11 * CELL },
    payload: {
      splash: 1000,
      radius: 72 * MU,
      bomblets: { count: 10, splash: 200, radius: 32 * MU, spread: 88 * MU },
    },
  },
  // stoop5: the air line's T5 — 14000 hp, armor 14, and a 7.25x7.25-block
  // hitbox. That is the widest thing in the game by a clear margin (the
  // stoop4, itself twice a stoop3, is 5.75) and it is what the unit is
  // for: nothing on the roster is harder to miss.
  //
  // IT IS THE WIDEST AND THE SOFTEST, which is the point. This line is
  // the bottom of the tankiness ladder above — it was carrying a walker's
  // health behind a walker's plate on the fastest-arriving body in the
  // game, which is the one combination nothing on the board answers. What
  // it delivers is the nuke below, and it is meant to be racing the guns
  // to the drop, not out-lasting them
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
  // then takes 4,500 off everything within SIXTEEN TILES. That is a
  // 32-tile circle of board, which is most of a citadel, at four figures
  // past what a repeater carrying half the catalog is holding: almost
  // nothing in the blast is meant to survive it. The fuse is the player's warning
  // and the family's rule at its largest — a stoop5 shot down over the
  // line is a line with two and a half seconds to be somewhere else, and
  // a turret cannot be somewhere else
  stoop5: {
    hp: 14000,
    speed: 4 * CELL,
    armor: 14,
    radius: UR * 7.25,
    tier: 5,
    drag: 0.04,
    rotateSpeed: 1,
    flying: true,
    payload: { splash: 4500, radius: 128 * MU, fuse: 2.5 },
  },
  // boss: THE SOVEREIGN — the crowned sea eagle (game/kingArt.ts), and the
  // one body on the roster that is in no family, is never rolled and is
  // never swapped. It replaced Erekir's tier-5 missile bomber, which with
  // the animal art on was the last Mindustry sprite left on the field;
  // what survives of that unit is `drag` 0.07 and the path under
  // public/stock the eagle is packed BESIDE rather than over, so the
  // hull is still there with the switch off (atlas.ts KING_CELLS).
  //
  // IT IS TWENTY-FOUR BLOCKS ACROSS. The widest thing any family fields is
  // the stoop5 at 7.25 and the heaviest thing that walks is the tusker5 at
  // 5.5, so the boss is three and a third times the one and over four
  // times the other — it is not the biggest unit, it is a different order
  // of object, and the whole design of the drawing is in service of that
  // (see the file header there). The hitbox is the art: a 24-block span by
  // a 20-block length, authored as an ELLIPSE (hitbox.ts) because a bird
  // really is wider than it is long and a boss shaped like a circle throws
  // away the one silhouette on the sheet a player cannot mistake. `radius`
  // is the equal-area circle of that ellipse, so the halo, the mass and
  // the splash reach agree with the shape.
  //
  // ARMOUR 200, and that is the number that decides the fight. Armour is a
  // flat shave floored at a tenth (Sim.applyArmor), so a shot has to land
  // for over 222 before the shave costs it less than the floor does — and
  // as the rows are authored (constants.ts) the RAILHEAD's 1755 is the
  // only one that does. Everything else is on the floor: the piercer, the
  // cleaver, the repeater and the furnace all used to get seventy per cent
  // of a shot through the old 30 and now get a tenth, which is where most
  // of this plate's bite actually is — a tacker was already on the floor
  // against 30 and has only the health multiplier to show for it.
  //
  // WHAT GETS THROUGH ANYWAY IS THE ARMOUR-PIERCING ROWS, and they are the
  // design: `pierceArmor` skips applyArmor outright, so the TETHER's 550
  // lance lands whole however thick the plate is, the repeater's tier-3
  // Surge Shells (upgrades.ts) give the same to a turret that is otherwise
  // sparks off it, and burning ignores plating the way it always has. The
  // answer to this body is not a wall of guns, it is the right guns and
  // the right nodes — which is what the old 30 was reaching for and never
  // reached, because 30 still let a mid-calibre turret through at seventy
  // per cent.
  //
  // HEALTH IS 720,000 AT NEMESIS, five times what the Erekir hull carried,
  // and it is a SHARE OF THE TIER (ladder.ts tierObjectiveHpScale), like
  // every objective body: one boss is one boss at every difficulty, so it
  // pays the size ramp in hit points instead of in bodies.
  //
  // Speed stays at 2.0 tiles/s, the slowest thing in the game, and the
  // turn is slower than anything else that flies: a boss is a deadline the
  // player watches coming, not a sprinter, and a body this wide that
  // pivots quickly reads as weightless. It carries no weapon — enemies
  // here do not shoot — so what crosses the map is the hull, the beat, the
  // looming pace and the plate.
  boss: {
    hp: 12000 * 60,
    speed: 2.0 * CELL,
    armor: 200,
    radius: UR * 22,
    hitbox: { long: 20 * CELL, wide: 24 * CELL },
    tier: 5,
    drag: 0.07,
    rotateSpeed: 1,
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
  // a rail from beyond the board's reach and crawls ashore. What it hits
  // for is what its row says and nothing else — the `veteran` ramp that
  // grew a hull's damage with its age is gone, and so is the skate4's
  // drill that ran the ramp faster (see the note by NAVAL_PACE). The
  // skate3 is the spotter, and it is the hull to kill: the fleet reaches
  // half again as far round it.

  // skate1: the naval line's T1 — 208 hp, armor 2, a 1.25x1.25-block hitbox,
  // 1.1 units/tick = 8.25 tiles/s, the fastest hull there is. Note it
  // opens at well over half again the ironhide1's health with armour the
  // ironhide1 does not have: the naval T1 is not chaff, and a tacker's
  // 9-damage bolt is already paying 7 against it
  skate1: {
    hp: 208,
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
  // skate2: T2 — 448 hp, armor 4 (an ironhide2's plating), a 1.625x1.625-block
  // hitbox, 0.9 units/tick = 6.75 tiles/s
  skate2: {
    hp: 448,
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
  // skate3: T3 — 680 hp, armor 7, a 2.5x2.5-block hitbox, 0.85 units/tick
  // = 6.375 tiles/s. THE SPOTTER (spotterField): every 2 s it stamps every
  // body within ten tiles with half again its reach. A fleet already
  // firing from outside the board's reach fires from further still round
  // its spotter; it is the hull to kill, and it is the one that stays
  // back
  skate3: {
    hp: 680,
    speed: 6.375 * CELL * NAVAL_PACE,
    armor: 7,
    radius: UR * 2.5,
    tier: 3,
    drag: 0.17,
    rotateSpeed: 1.8,
    naval: true,
    immunities: ["wet"],
    spotterField: { mult: 1.5, reload: 2, range: 10 * CELL },
    wake: wake({ x: 7 * MU, y: -9 * MU, length: 22, scl: 1.5 * MU }),
  },
  // skate4: T4 — 6880 hp, armor 12, a 4.875x4.875-block hitbox, 0.73
  // units/tick = 5.475 tiles/s. It sits a step UNDER the ironhide4 on both
  // health and plating now (9000 and 20) and moves twice as fast for it:
  // the fleet's champion is the toughest of the light lines and not a
  // rival to the walkers'.
  //
  // IT CARRIES NO AURA. It was the DRILL (drillField) — every 2 s it
  // stamped every hull within ten tiles so that its veterancy clock ran
  // two and a half times as fast — and with the veterancy gone there was
  // no clock left to turn. What it is now is the fleet's heaviest rail on
  // the fleet's toughest hull, and the spotter beside it is the only aura
  // the family fields. A T4 with nothing but its gun is a hole worth
  // filling one day; wakeField, the bow wave this hull used to carry, is
  // still wired and would be the honest thing to put back
  skate4: {
    hp: 6880,
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
  // skate5: the fleet's T5 — 16000 hp, armor 16, and a 7.25x7.25-block
  // hitbox, which is the stoop5's: the widest thing in the game, tied.
  // 0.62 units/tick = 4.65 tiles/s, and rotateSpeed 0.9 is the slowest
  // turn on the whole roster — this one cannot answer anything it did not
  // already have its nose pointed at
  skate5: {
    hp: 16000,
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
  // livewire1: the Wraith fleet's T1 — 160 hp, armor 2, a 1.375x1.375-block
  // hitbox, 0.9 units/tick = 6.75 tiles/s, and rotateSpeed 5, the stock
  // rate every ground unit turns at and the quickest hull on the water by
  // a distance. THE T1 IS THE FAMILY IN MINIATURE: one arc, one hop, one
  // short in eight (weapons.ts), and it BLINKS — a hit that lands throws
  // it twelve tiles up its route, once every four seconds. Its upstream
  // repair beam was a weapon and does not port
  livewire1: {
    hp: 160,
    speed: 6.75 * CELL * WRAITH_PACE,
    armor: 2,
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
  // livewire2: Wraith T2 — 320 hp, armor 3, a 1.75x1.75-block hitbox, 0.83
  // units/tick = 6.225 tiles/s. Upstream's ability
  // (StatusFieldAbility(overclock)) does not port. The volume tier: a fast
  // short arc, and the quickest blink on the tree
  livewire2: {
    hp: 320,
    speed: 6.225 * CELL * WRAITH_PACE,
    armor: 3,
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
  // livewire3: Wraith T3 — 520 hp, armor 5, a 2.5x2.5-block hitbox, 0.86
  // units/tick = 6.45 tiles/s: fractionally quicker than the skate3 it
  // shares a hitbox with. The family's chain tier (four hops, weapons.ts),
  // and THE FIRST THAT CLOAKS: two and a half seconds gone in every nine,
  // from the first nine in. The cloak is a window with nothing in it for
  // the guns, and it was shortened a notch across the fleet when the
  // blinks tripled — a hull that cannot be hurt AND cannot be pinned is
  // two answers to the same volley, and one of them has to give. Its upstream repair beam is a weapon, like livewire1's,
  // and goes the same way
  livewire3: {
    hp: 520,
    speed: 6.45 * CELL * WRAITH_PACE,
    armor: 5,
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
  // livewire4: Wraith T4 — 5600 hp, armor 9, a 5.5x5.5-block hitbox,
  // 0.7 units/tick = 5.25 tiles/s. It held the most health of any T4 on
  // the roster and now holds nearly the least, a body second only to the
  // bomber's: this fleet is not hit, it is missed, and a hull that blinks
  // and cloaks does not also get to soak
  //
  // EnergyFieldAbility(40, 65, 180) is the reason to shoot it first, and
  // it does both halves here: the zap SHORTS every structure it reaches
  // (weapons.ts) and the heal mends the fleet. Its 22.5-TILE radius is
  // three times the 7.5 most fields on the roster reach — one livewire4
  // covers most of a lane — and it heals 1.5% of MAX health, so it mends
  // a livewire5 for 180 a zap and a livewire1 for 2. sameTypeHealMult 0.5
  // halves what it does for another livewire4, which is upstream's guard
  // against a pair of them being unkillable; a pair is still twice as
  // hard to remove as one
  livewire4: {
    hp: 5600,
    speed: 5.25 * CELL * WRAITH_PACE,
    armor: 9,
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
  // livewire5: the Wraith fleet's T5 — 12000 hp, armor 13, and the skate5's
  // 7.25x7.25-block hitbox, at 0.65 units/tick = 4.875 tiles/s. Its EMP
  // cannon is the family's long arc (weapons.ts), and it is THE FLAGSHIP:
  // when it cloaks — four and a half seconds in every twelve — every body
  // within ten tiles goes dark with it (cloak.veil). A fleet that vanishes
  // together and reappears EIGHTEEN tiles on is the family's rule at its
  // largest; the seven and a half seconds it shows are the seven and a
  // half seconds to kill it in
  livewire5: {
    hp: 12000,
    speed: 4.875 * CELL * WRAITH_PACE,
    armor: 13,
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

  // ---- THE TUSKERS ------------------------------------------------------
  //
  // THE BIG ONES, and that is the first and the loudest thing about them.
  // Every other line on the roster opens on a 1x1 or thereabouts — the
  // ironhide1 and the dartback1 are exactly one tile, the widest T1
  // anywhere is the livewire1's 1.375 — and the Tusker RUNT is a
  // 1.75x1.75. It is half again the biggest opening body in the game, it
  // is drawn at that box (tuskerArt.ts: no overshoot, the quad is the
  // hitbox), and the ladder ends on a 5.5x5.5 apex: the largest thing
  // that walks, against the ironhide5's 3.75 that held the title. A
  // Tusker wave does not look like anybody else's wave from the first
  // body on.
  //
  // THREE THINGS MAKE THE FAMILY, and the first two are what the size is
  // for:
  //
  // ARMOUR, TWO TO THREE TIMES THE GROUND MECHS' AT EVERY STEP — 3, 12, 22,
  // 38, 52 against the Ironhides' 0, 4, 9, 20, 30. Armour is a FLAT SHAVE
  // floored at a tenth of the raw shot (Sim.applyArmor), so the apex's 52 is
  // not "a tough unit": it is a rule that every gun under 58 damage a hit pays
  // the floor and does a TENTH of its paper DPS. A piercer at 105 still lands
  // 53 and a cleaver at 140 lands 88; an autocannon at 20 lands two. That is
  // the whole sentence the family says. The Ironhides made that argument at 30
  // and the answer was calibre; this family makes it at 52, and the answer is
  // the same answer only more so — cleaver, repeater, furnace, railhead, and
  // nothing else matters.
  //
  //   A MELEE MAUL (weapons.ts, fx "melee"). Not one of these carries a
  //   gun. The tusks are the weapon and the reach is two to four tiles —
  //   against a roster whose SHORTEST gun reaches eleven — so a Tusker
  //   does nothing at all until it is standing on the turret, and then it
  //   does more damage per second than anything else in the game. The
  //   apex mauls for twenty-four hundred a second where the ironhide5's
  //   cannon, the heaviest round the swarm fires, does under four — six
  //   of it, out of a body that has to be standing on the gun.
  //
  //   AND THE CHARGE (UnitStats.charge), the trait that makes the other
  //   two mean anything: THEY LEAVE THE ROUTE. Every other body walks the
  //   field to the core and shoots what its reach happens to cover on the
  //   way; a Tusker that can see a structure inside its charge range drops
  //   the field and walks straight at it. Mazing a Tusker wave past your
  //   guns does not work, because it is not trying to get past them.
  //
  // WHAT IT POSES: a body you cannot chip down and cannot lead away, that
  // takes a turret apart in seconds once it arrives. Every answer is on
  // the approach — calibre, and the reach to use it before they close.
  //
  // AND THEY ARE SLOW, which is the whole reason that answer exists. 3
  // tiles a second down to 2.3: after the Starlight mechs, the slowest
  // line on the field, and the apex turns at 1.3 degrees a tick. A Tusker
  // wave is a deadline you watch walking toward you.

  // tusker1: the runt — 260 hp, armour 6, a 1.75x1.75-block hitbox, 3
  // tiles/s. THE T1 IS THE FAMILY IN MINIATURE and nothing more than
  // that: it is big, it is plated, it charges and it mauls, and it is the
  // ONE TIER OF THE SEVEN THAT CARRIES NO FIELD AT ALL. The fields start
  // at the brute.
  //
  // WHAT IT IS WORTH IS SET AGAINST WAVE 1, and that is not a footnote.
  // A run opens with nothing on the board and answers the first wave with
  // whatever the first card happens to be, which is usually a wall of
  // tackers; a tacker's 9-damage bolt lands 3 here against 9 on an
  // ironhide1, so the runt eats about five times the bolts the body the
  // ground line opens with does. The first cut of this row was 380 hp
  // behind armour 6 and a personal shield bar — and measured against
  // sixteen tackers it was not a hard opening but an unanswerable one:
  // forty ironhide1s died to the wall and left it standing at two-thirds,
  // forty tuskers took the wall to zero and lost seven.
  //
  // WHAT IS HERE NOW CARRIES THAT CUT'S ARMOUR ON THE SMALLER BODY and
  // without the shield bar, so the same nine-damage bolt is at the ten
  // per cent floor against it. Armour is the family's one dial — the
  // whole ladder was doubled at once, on purpose — and this is the tier
  // where that decision is felt hardest, because wave 1 is answered with
  // what wave 1 hands you and a tacker is what it usually hands you.
  // If an opening ever plays as unanswerable again, the number to move
  // is this one.
  tusker1: {
    hp: 260,
    speed: 3 * CELL,
    armor: 6,
    radius: UR * 1.75,
    tier: 1,
    rotateSpeed: 3.2,
    charge: { range: 14 * CELL },
  },
  // tusker2: the brute — 900 hp, armour 24, a 2.25x2.25-block hitbox,
  // 2.8 tiles/s. THE TIER THE FIELDS START, and it starts with both at
  // once: a 5-tile force field holding 220, which EATS absorbable shots
  // outright rather than soaking them (Sim.updateAbilities), and a shield
  // bar for the bodies walking with it. See the note on FAMILIES below
  // for why this line carries the pair
  tusker2: {
    hp: 900,
    speed: 2.8 * CELL,
    armor: 24,
    radius: UR * 2.25,
    tier: 2,
    rotateSpeed: 2.8,
    charge: { range: 16 * CELL },
    forceField: { radius: 5 * CELL, regen: 20, max: 220, cooldown: 6 },
    shieldField: { amount: 25, max: 150, reload: 3, range: 5 * CELL },
  },
  // tusker3: the elite — 2200 hp, armour 44, a 3x3-block hitbox (an
  // ironhide4's, at T3), 2.6 tiles/s. Its bubble is the starhart3's in
  // everything but the pool, and the bar behind it is deeper: this is the
  // tier a Tusker push stops being a body and starts being a front.
  // Measured against sixteen tackers, eight of these took the wall to zero
  // in half a minute and lost nothing — which is the right answer, since
  // a tacker is wave-1 tech and an elite is not a wave-1 problem
  tusker3: {
    hp: 2200,
    speed: 2.6 * CELL,
    armor: 44,
    radius: UR * 3,
    tier: 3,
    rotateSpeed: 2.4,
    charge: { range: 18 * CELL },
    forceField: { radius: 7 * CELL, regen: 32, max: 550, cooldown: 6 },
    shieldField: { amount: 40, max: 260, reload: 3, range: 7 * CELL },
  },
  // tusker4: the champion — 10500 hp, armour 76, a 4.25x4.25-block hitbox
  // (wider than the ironhide5, one tier below the top), 2.45 tiles/s and
  // rotateSpeed 1.7. A 1500-point bubble over nine and a half tiles with
  // the whole herd inside it
  //
  // THE STANCE OPENS HERE (tuskerArt.ts): the T4 leaves the mech rig for
  // four planted legs.
  //
  // AN ELEPHANT STANDS ON PILLARS AND PLODS. The legged rig does not know
  // that — left to itself it gives every family the same ring of thin
  // limbs taking strides longer than the body, which is a spider however
  // big the animal on top is. Three things make this one an elephant.
  // THE LEGS ARE COLUMNS: strokes a fifth of the body's grid, near twice
  // the rhino's, barely tapering from thigh to foot (TUSK_TIERS in
  // game/tuskerArt.ts). THE FEET ARE UNDER IT: `lengthScl` 0.95 on a leg
  // cut by two fifths, on mounts pulled in to match, so a foot rides
  // between 0.85 and 1.6 radii out where it used to swing from 1.05 to
  // 2.49 — and the knee, which used to bow a third of a radius clear of
  // the flank at the folded end of its swing, now bows a sixth. AND THE
  // STEP IS SHORT: `moveSpace` 1.0 on that shorter leg walks 0.66 radii
  // between one footfall and the next, against 1.65 before, so no foot is
  // ever left trailing a body-length behind.
  //
  // `groupSize` 1 is the gait itself. Every other legged unit on the
  // roster swings two diagonal legs at once — a trot, which is right for
  // a deer and wrong for this. At 1 the four legs take their turn one at
  // a time round the ring, so three feet are on the ground at every
  // moment and the body is never in the air between them: the amble, and
  // the reason the herd reads as heavy rather than as scuttling
  tusker4: {
    hp: 10500,
    speed: 2.45 * CELL,
    armor: 76,
    radius: UR * 4.25,
    tier: 4,
    rotateSpeed: 1.7,
    charge: { range: 22 * CELL },
    forceField: { radius: 9.5 * CELL, regen: 60, max: 1500, cooldown: 5 },
    shieldField: { amount: 60, max: 420, reload: 2, range: 9.5 * CELL },
    legs: legs({
      count: 4,
      groupSize: 1,
      length: 9 * MU,
      forwardScl: 0.6,
      moveSpace: 1.0,
      baseOffset: 11 * MU,
      lengthScl: 0.95,
      speed: 0.12,
      elevation: 0.2,
      ripple: 3,
    }),
  },
  // tusker5: the apex, and the largest body that walks — 25000 hp, armour
  // 104, a 5.5x5.5-block hitbox, 2.3 tiles/s, rotateSpeed 1.3. More
  // health than the ironhide5 on a box half again its size, and over
  // three times its plating: at 104 every gun whose shot lands under 116
  // damage is cut to the 10% floor (`max(dmg - armor, 0.1 * dmg)`), which
  // is very nearly the whole catalogue. What gets through this body is
  // calibre per shot, not fire rate, and there is not much of it.
  //
  // Four pillars and the same amble as the champion, scaled up: see the
  // note on the tusker4 for what each number is doing
  //
  // A 3000-POINT BUBBLE OVER TWELVE TILES, the biggest force field in the
  // game, with a 600 bar handed to everything under it. The Starlight T5
  // is the line the board cannot wear down; this one is the line the
  // board cannot get a shot through, and the difference is that when it
  // arrives it eats the turret
  tusker5: {
    hp: 25000,
    speed: 2.3 * CELL,
    armor: 104,
    radius: UR * 5.5,
    tier: 5,
    rotateSpeed: 1.3,
    charge: { range: 26 * CELL },
    forceField: { radius: 12 * CELL, regen: 95, max: 3000, cooldown: 5 },
    shieldField: { amount: 90, max: 600, reload: 2, range: 12 * CELL },
    legs: legs({
      count: 4,
      groupSize: 1,
      length: 11 * MU,
      forwardScl: 0.6,
      moveSpace: 1.0,
      baseOffset: 14 * MU,
      lengthScl: 0.95,
      speed: 0.11,
      elevation: 0.25,
      ripple: 4,
    }),
  },

  // ── THE GRAPNELS, the starfish (game/grapnelArt.ts) ─────────────────
  //
  // THE SLOWEST BODIES IN THE GAME, and the only ones that CRAWL: about
  // two tiles a second at every tier, which is a walker's pace halved.
  //
  // AND THE ONLY ONES THAT DO NOT SHOOT. There is no grapnel weapon in
  // weapons.ts any more — no gun, no reload, no aim. A grapnel crawls at
  // your core and answers what is done to it: a hit that lands throws a
  // homing star back out of one of its five arms, and its death throws
  // five at once (`starburst` below, weapons.ts GRAPNEL_STARS). It is
  // the one family on the roster whose damage is decided by the BOARD —
  // shoot it and it shoots back, kill it and it empties itself into
  // whatever is standing around it, ignore it and it walks into your core
  // having done nothing at all.
  //
  // THEY USED TO VOLLEY, and the volley is gone the way the hook went
  // before it: five unaimed rounds every ten seconds, four of which flew
  // off into the map by construction. A family that only fires when it is
  // fired on cannot afford to miss with four fifths of what it throws, so
  // the stars steer now, and they are thrown far oftener than once a
  // volley.
  //
  // THE CRAWL IS IN THE DRAWING AND NOT IN THESE NUMBERS — the four rear
  // arms swing the body along on the mech rig (game/grapnelArt.ts),
  // which is the only place this family's gait lives.
  //
  // AND THEY FOLD INTO EACH OTHER (`starburst.merge`, Sim.mergeGrapnel).
  // Every other kind folds only when a choke crushes it; these reach for
  // their own kind and fold on purpose, up to ten bodies in one and ten
  // times the health — with the star's bite adding the whole way. A patch
  // of runts the line cannot reach is a T1 problem that becomes one very
  // large T1 problem.
  //
  // THE MIDDLE OF THE ROSTER ON HEALTH, deliberately: tougher than the
  // fleets that blink and cloak, softer than anything that is meant to
  // be a wall. It is slow and it is in the open — plating it like a
  // rhino would make a family nothing answers in time.
  //
  // THE CHANCE IS ONE NUMBER ACROSS THE FAMILY and the COOLDOWN climbs
  // hard with the tier: the runt answers about once a second with a small
  // star, the apex once in two and a half with one that takes a corner of
  // a patch. THE COOLDOWN IS THE REAL RATE and the chance is texture on
  // top of it — a body under a turret line is hit many times a second, so
  // any chance at all saturates a clock this short, and what actually
  // decides a tier's output is how long it waits. An apex on the runt's
  // clock would out-damage every other T5 on the roster several times
  // over, purely for being shot at.
  grapnel1: {
    hp: 240,
    speed: 1.9 * CELL,
    armor: 2,
    radius: UR * 1.125,
    tier: 1,
    rotateSpeed: 3.5,
    starburst: { chance: 0.3, cooldown: 1, merge: 10 },
  },
  grapnel2: {
    hp: 780,
    speed: 1.95 * CELL,
    armor: 4,
    radius: UR * 1.625,
    tier: 2,
    rotateSpeed: 3.2,
    starburst: { chance: 0.3, cooldown: 1.2, merge: 10 },
  },
  grapnel3: {
    hp: 2100,
    speed: 2 * CELL,
    armor: 7,
    radius: UR * 2.25,
    tier: 3,
    rotateSpeed: 2.8,
    starburst: { chance: 0.3, cooldown: 1.5, merge: 10 },
  },
  grapnel4: {
    hp: 7400,
    speed: 2.05 * CELL,
    armor: 13,
    radius: UR * 3.625,
    tier: 4,
    rotateSpeed: 2.2,
    starburst: { chance: 0.3, cooldown: 1.9, merge: 10 },
  },
  grapnel5: {
    hp: 16000,
    speed: 2.1 * CELL,
    armor: 19,
    radius: UR * 4.625,
    tier: 5,
    rotateSpeed: 1.8,
    starburst: { chance: 0.3, cooldown: 2.4, merge: 10 },
  },

  // ── THE PYLONS, the two buff towers (game/pylonArt.ts) ────────────────
  //
  // MISSION ASSETS AND NOTHING ELSE. No wave may send one (UNIT_TREES,
  // objective) — a mission puts them down, on ground an author placed in
  // the map editor, on the train wave that author named (missionMarks.ts).
  //
  // WHAT THEY DO IS NOT HERE, and that is the point: a Pylon has no aura
  // field, no weapon and no ability in this block. It buffs the TRAIN,
  // which is not a body on the field but a crosser (Sim.crossers), so the
  // dial is read off the standing census where the train's own numbers are
  // spent — `Sim.goadMul` and `Sim.bastionCut`. A tower that is down stops
  // counting the same tick, and there is nothing to expire.
  //
  // THEY ARE BOLTED DOWN (Sim.plantUnit) and they do not shoot, so the
  // whole of what the board has to do is REACH one. Both stand on their
  // own ground out by a road, which is the same purchase the mission
  // already asks for and the reason they are worth placing at all.
  //
  // 128 NATIVE PX IS FOUR TILES square, at the sheet's 0.625 world px per
  // native px — so UR x 4 is the drawing's own extent, exactly as the
  // siege's three are (levels.ts railgun, game/pylonArt.ts).
  //
  // THE BASTION IS THE TOUGHER OF THE TWO. It is the one whose loss the
  // player feels immediately — a train's damage taken goes back up the
  // moment it falls — so it is the one worth defending, and a mission
  // that wants it answered early should place it where a board can get at
  // it rather than make it soft.
  goad: {
    hp: 9000,
    speed: 0,
    armor: 14,
    radius: UR * 4,
    tier: 5,
    rotateSpeed: 30,
    unslowable: true,
  },
  bastion: {
    hp: 14000,
    speed: 0,
    armor: 20,
    radius: UR * 4,
    tier: 5,
    rotateSpeed: 30,
    unslowable: true,
  },

  // ── THE FABRICATORS, the five houses (game/fabricatorArt.ts) ─────────
  //
  // Bolted down like the pylons (Sim.plantUnit) and unarmed: what a house
  // does is send its tier on a clock (Sim.runFabricators), so the whole of
  // what the board has to do is reach it. `radius` is the footprint in
  // tiles — 1, 2, 3, 4 and 6 — and `tier` is the tier it sends.
  fabricator1: { hp: 2500, speed: 0, armor: 4, radius: UR * 1, tier: 1, rotateSpeed: 30, unslowable: true },
  fabricator2: { hp: 5000, speed: 0, armor: 8, radius: UR * 2, tier: 2, rotateSpeed: 30, unslowable: true },
  fabricator3: { hp: 9000, speed: 0, armor: 12, radius: UR * 3, tier: 3, rotateSpeed: 30, unslowable: true },
  fabricator4: { hp: 16000, speed: 0, armor: 18, radius: UR * 4, tier: 4, rotateSpeed: 30, unslowable: true },
  fabricator5: { hp: 30000, speed: 0, armor: 25, radius: UR * 6, tier: 5, rotateSpeed: 30, unslowable: true },

  // ── THE KETTLES, the vulture (game/kettleArt.ts) ──────────────────────
  //
  // THE SECOND THING IN THE SKY, AND THE FIRST THAT ARRIVES. The Skyfall
  // bombers are five bodies that ARE bombs: each picks a structure inside
  // its seek reach, leaves the route, dives it and goes off on contact
  // (`payload`), and goes off the same way wherever it is shot down. That
  // makes the whole family answerable ANYWHERE — a stoop killed over the
  // outer wall has spent itself on the outer wall, and the line behind it
  // is never tested.
  //
  // A KETTLE CARRIES NO CHARGE. It does not dive, it does not pick a
  // building, it does not go off when it dies. It flies the air field
  // straight at the core over every gun on the board, holds at the core's
  // edge and works on it with the pods under its wings (weapons.ts) until
  // one of them is gone. The whole of what the board has to do is stop it
  // ON THE WAY, which is the one thing the sky has never asked for here.
  //
  // WHAT IT DOES ON THE WAY IS THE WET BOMB (weapons.ts, the kettle rows):
  // a slow, wide, cheap slosh lobbed at the guns under it that leaves them
  // reloading at 80% for a few seconds. The soak is the family's only
  // ability — no aura, no field, no charge, no veterancy, no blink, no
  // cloak, no death burst — and it is deliberately the weakest one in the
  // game, because the landing takes the deepest rate in force and refreshes
  // the clock, so a flock can hold the tax but never deepen it.
  //
  // THE GIMMICK IT WAS PICKED FOR IS STILL NOT HERE: the carrion mechanic
  // (docs/air-concepts.md), where every body that dies under a kettle feeds
  // it. The drawing has the crop for it and the sim has nothing.
  //
  // THE PACE IS A SOARER'S: 5.5 tiles/s down to 3.5, a hair under the
  // Stoop's 8-to-4 at the light end and level with it at the heavy. The
  // bomber is racing the guns to a drop and this one is not racing
  // anything — it has to cross the whole board either way, so what it
  // trades its speed for is the health to still be flying at the end of
  // the crossing.
  //
  // THE HEALTH IS THE UPPER MIDDLE OF THE ROSTER, over the bombers at
  // every tier and under the walls. A stoop5 is 14,000 on the softest
  // plate in the game because it only has to reach one building; a kettle5
  // has to cross the whole board lobbing bombs and then STAY at the core,
  // so it is 19,500 behind armour 22 — still well short of the tusker5's
  // 25,000 and 104, because a body that ignores the maze must never also
  // be the body that ignores the guns.
  //
  // THESE ARE A FIRST CUT. The shape is argued above; the numbers want a
  // pass on the balance page and a playtest before anyone calls them
  // settled (README, the note on who owns balance).
  //
  // rotateSpeed falls hard up the tree, as it does on the bombers: a
  // heavy flyer that snaps onto a new heading reads as weightless, and
  // the apex at 1.3 visibly swings round.
  //
  // The boxes are the drawings' own, which on this grammar is the same
  // statement twice: UR x 1.25 / 1.75 / 2.75 / 5.25 / 6.75 is the 40, 56,
  // 88, 168 and 216 px grids kettleArt.ts draws on at 32 px a tile. The
  // apex is wide — under the stoop5's 7.25 and over everything else — and
  // that is the one thing a player is meant to see coming.
  kettle1: {
    hp: 300,
    speed: 5.5 * CELL,
    armor: 3,
    radius: UR * 1.25,
    tier: 1,
    drag: 0.03,
    rotateSpeed: 3.5,
    flying: true,
  },
  kettle2: {
    hp: 1000,
    speed: 5 * CELL,
    armor: 6,
    radius: UR * 1.75,
    tier: 2,
    drag: 0.03,
    rotateSpeed: 3,
    flying: true,
  },
  kettle3: {
    hp: 2500,
    speed: 4.5 * CELL,
    armor: 10,
    radius: UR * 2.75,
    tier: 3,
    drag: 0.035,
    rotateSpeed: 2.4,
    flying: true,
  },
  kettle4: {
    hp: 9400,
    speed: 4 * CELL,
    armor: 18,
    radius: UR * 5.25,
    tier: 4,
    drag: 0.04,
    rotateSpeed: 1.8,
    flying: true,
  },
  kettle5: {
    hp: 19500,
    speed: 3.5 * CELL,
    armor: 22,
    radius: UR * 6.75,
    tier: 5,
    drag: 0.04,
    rotateSpeed: 1.3,
    flying: true,
  },

  // ---- THE CROSSER: ONE WORM, IN TWENTY PIECES ----
  //
  // The train that walks Coldline's two roads (missions.ts) while nothing
  // else on the field knows it is there. It is on the WALKERS' layer and
  // it is UNARMED, and both of those are the archetype rather than an
  // oversight: "something moves across the map ignoring the base, and
  // must die before it leaves" (docs/mission-design.md). It never turns
  // toward the core, it never shoots a turret, and a board that ignores
  // it loses nothing this minute — which is exactly what makes paying for
  // guns out on a road that defends nothing a decision.
  //
  // WHY THREE KINDS AND NOT ONE. A worm is twenty bodies in a line
  // (WORM_CHAIN), each with its own pool, because the mission asks the
  // player to kill the WHOLE train: a single body with a chain drawn
  // behind it would have one hurtbox at its nose, and a seventy-tile
  // silhouette whose back half cannot be shot is a lie about where to put
  // a gun. The head leads and is the toughest; the cars are the body; the
  // tail is the piece that says the train has ended.
  //
  // THE POOL IS THE DIAL, and it is 252,000 for a whole worm at the first
  // launch at Nemesis: twenty-one car-equivalents (the head is worth two,
  // the tail one) at 12,000 apiece. It is a SHARED pool — every piece
  // reports it and a hit on any car comes off it (Sim.drainCrosser) — so
  // these three numbers are one number written down with the head's share
  // of it visible, and nothing reads them per piece any more.
  //
  // A Borer is an OBJECTIVE, so what actually spawns is this times the
  // tier's count share (ladder.ts tierObjectiveHpScale) and then times the
  // launch ramp (wormRamp): a quarter of it at Incursion, all of it from
  // Nemesis up.
  //
  // IT WAS 45,000, THEN 126,000. The first number was measured before the
  // roads were refit straighter and before the train stopped taking the
  // wet slow, so the seconds a board gets a Borer under fire had fallen
  // twice over while the pool stayed where it was; the second was the
  // rescale, and the doubling to this is the same complaint answered
  // again. A first train a starting board rolls over is not an opening
  // question, it is a cutscene.
  wormhead: {
    hp: 24000,
    speed: WORM_SPEED,
    armor: 6,
    // HALF AGAIN THE NATIVE SCALE, like the boss and for the same reason:
    // this is the body the whole map is about hitting, and at one-to-one
    // it was a three-tile machine on a five-hundred-tile road. The sheet
    // did not change — the quad did (atlas.ts UNIT_ART) — so every number
    // below is the drawing's own extent times 1.5.
    radius: UR * 4.125,
    // the drawing's own extent: 96 native px of hull by the cutter drum's
    // 72, at the sheet's 0.625 world px per native px (game/wormArt.ts),
    // and then the 1.5. The quad is the box on this body like every other
    hitbox: { long: 90, wide: 69 },
    tier: 4,
    // it turns as fast as the road does: the heading is the road's
    // tangent, written straight onto the body (Sim.updateCrosser), so
    // nothing here is ever asked to catch up with a corner
    rotateSpeed: 30,
    // ...and NOTHING MOVES ITS CLOCK. See UnitStats.unslowable: a douser
    // on the line can still soak a Borer, and the soak is still worth
    // what electric ammunition pays for it — it simply buys no seconds,
    // and a dartback3's pace stamp buys none in the other direction
    // (Sim.updateCrosser reads no multiplier at all)
    unslowable: true,
  },
  wormcar: {
    hp: 12000,
    speed: WORM_SPEED,
    armor: 6,
    radius: UR * 3.75,
    hitbox: { long: 84, wide: 66 },
    tier: 4,
    rotateSpeed: 30,
    unslowable: true,
  },
  wormtail: {
    hp: 12000,
    speed: WORM_SPEED,
    armor: 6,
    radius: UR * 3.75,
    hitbox: { long: 84, wide: 66 },
    tier: 4,
    rotateSpeed: 30,
    unslowable: true,
  },

  // ── THE SIEGE: the railgun ───────────────────────────────────────────
  //
  // THE ONE BODY A MISSION PLANTS (RazeMission, Sim.raiseSection). It is
  // in no family, has no tier ladder, and no wave can send it
  // (OBJECTIVE_KINDS). It is put down at an authored place, it never walks
  // at the core, and the run's whole business with it is going out to
  // where it stands and taking it apart.
  //
  // `tier: 5` is not a rung — there is no ladder here to be on. It is the
  // weight class, written down so the audit and the mutators that read a
  // tier (ARMORED_MAX_TIER) treat it as the heavy body it is rather than
  // as a runt.

  // THE EMPLACEMENT. It does not move (speed 0) and it is PLANTED besides
  // (Sim.plantUnit), so no crowd, no knockback and no beam drag can shift
  // it off the spot the mission chose. Thirty thousand behind twenty-five
  // armour is about a third of a Sovereign: heavy enough that a lone
  // turret pointed at it is a decision and not an afterthought, light
  // enough that four of them are a job a board can finish.
  //
  // ITS ONE TARGET IS THE CORE (bombard) and its reach is the whole
  // board, which is the entire reason the mission exists: the thing
  // cannot be answered where it is hurting you, only where it is
  // standing.
  railgun: {
    hp: 30000,
    speed: 0,
    armor: 25,
    // SIX TILES, which is the turret plate it stands on (wardenArt.ts
    // RAZE_PLATE_TILES) and the grid it is drawn on — one footprint, not
    // three numbers to keep in step
    radius: UR * 6,
    tier: 5,
    // nothing about it turns: the hull is bolted down and the barrel is
    // drawn on the heading it fires on (Sim.updateUnitWeapons)
    rotateSpeed: 30,
    bombard: true,
    // a douser on an emplacement buys nothing, for the same reason it
    // buys nothing on a Borer: the mission is a promise about WHEN, and
    // the railgun's clock must not be rewritable from outside its patch
    unslowable: true,
  },

  // ── THE WARDENS (WARDEN_NAME) ────────────────────────────────────────
  //
  // FOUR HEAVY BODIES IN NO FAMILY, on no tier ladder, and sendable by
  // nothing (FAMILIES, the `objective: true` trees). They WALK — at the
  // core, on the field, like every other body the swarm puts on the
  // ground — and what makes them different from a wave is weight, not
  // behaviour. `tier: 5` is the weight class and not a rung, written down
  // so the audit and the mutators that read a tier (ARMORED_MAX_TIER)
  // treat them as the heavies they are.

  // THE BULWARK — the wall. A Tusker apex's pool and a Tusker apex's
  // plating on a body whose whole reach is its ram: it CHARGES like the
  // elephants do and for the same reason, and everything it costs a board
  // is paid at arm's length.
  bulwark: {
    hp: 25000,
    speed: 2.6 * CELL,
    armor: 104,
    radius: UR * 4,
    tier: 5,
    rotateSpeed: 1.6,
    charge: { range: 22 * CELL },
  },

  // THE LANCE — the needle. The Starlight apex's pool and the Starlight
  // apex's bite (weapons.ts) on the quickest heavy body in the game: five
  // tiles a second, twice the Bulwark and faster than anything else this
  // size. One of them is a wall you cannot get past and the other is a
  // gun you cannot get away from.
  lance: {
    hp: 17000,
    speed: 5 * CELL,
    armor: 14,
    radius: UR * 2.25,
    tier: 5,
    rotateSpeed: 4.5,
  },

  // THE HALBERD — the fan, and the one of the four that walks behind a
  // FORCE FIELD (the same bubble a Tusker carries). Four beams on one
  // pull and a bubble that has to come down before any of it can be
  // answered.
  halberd: {
    hp: 55000,
    speed: 2.2 * CELL,
    armor: 115,
    radius: UR * 5,
    tier: 5,
    rotateSpeed: 1.4,
    forceField: { radius: 11 * CELL, regen: 60, max: 9000, cooldown: 7 },
  },

  // THE JUGGERNAUT — the fortress. The heaviest thing on the ground in
  // this game, slower than anything else that walks, throwing missiles
  // out of both flanks the whole way in.
  juggernaut: {
    hp: 200000,
    speed: 1.6 * CELL,
    armor: 150,
    radius: UR * 7,
    tier: 5,
    rotateSpeed: 0.9,
  },
};

/**
 * THE TRAIN, nose to tail: what one worm is made of, in order. Twenty
 * pieces — a head, eighteen cars and a tail — laid on the road
 * WORM_SPACING apart, which is a little under a car's own length so the
 * couplings overlap and the thing reads as one body rather than twenty.
 *
 * IT IS SEVENTY-FOUR TILES OF TRAIN, nose to tail (19 gaps of 78 px),
 * which is an eighth of Coldline's south road in one body. Two things
 * downstream are sized off that and will bite if the count moves again:
 * the ROAD'S RUN-UP has to be longer than the chain (missions.ts — the
 * head is laid a whole chain-length past the entry, so a short run-up
 * puts the head in open ground), and the on-board clock stops being the
 * road's length the moment the tail is still off the map when the head
 * is halfway across it.
 *
 * A worm is DESTROYED when every piece of it is down and LEAKED when any
 * piece of it reaches the far edge (Sim.updateCrosser). Blowing the head
 * off does not stop the rest: a train with no driver still rolls, and a
 * mission that ended at the nose would be a mission about one turret.
 */
export const WORM_CHAIN: readonly UnitKind[] = [
  "wormhead",
  "wormcar", "wormcar", "wormcar", "wormcar", "wormcar", "wormcar",
  "wormcar", "wormcar", "wormcar", "wormcar", "wormcar", "wormcar",
  "wormcar", "wormcar", "wormcar", "wormcar", "wormcar", "wormcar",
  "wormtail",
];
/** the gap between one piece's centre and the next, world px — scaled with
 *  the bodies (see wormhead's radius), so the couplings keep their overlap */
export const WORM_SPACING = 78;
/** nose to tail, world px: what the road's run-up has to clear */
export const WORM_LENGTH = (WORM_CHAIN.length - 1) * WORM_SPACING;

/**
 * THE CONVOY — the escort mission's cart, and the one body on the board
 * that belongs to the PLAYER (EscortMission, Sim.launchConvoy).
 *
 * IT IS A STRUCTURE AND NOT A UNIT, and that is not an implementation
 * detail, it is the design. "The swarm shoots it exactly the way it
 * shoots a turret" is the whole specification of how the two sides meet:
 * a body walking at the core fires at what its guns can see on the way,
 * and a TURRET is what that sentence is about. Making the cart a
 * structure means every gun on the swarm's side already knows what to do
 * with it — the reach, the sight ray, the rot, the Tusker's rend, the
 * bomber's dive — with no second targeting path to keep in step with the
 * first. What it is NOT is a member of `Sim.towers`: nothing counts it,
 * sells it or selects it, it claims no ground and it blocks no route.
 */
export const CONVOY_NAME = "Hauler";
/**
 * THE POOL IS THE MISSION, and it is a BOSS'S POOL rather than a
 * building's. There is one cart on Thornway, it is under fire for
 * fifteen minutes, and it has to arrive — so the number to read it
 * against is the Sovereign's 180,000 to 720,000, not a turret's few
 * thousand. The first cut was 40,000 and a measured run lost it inside
 * four minutes at the FIRST halt: the road leaves the core, so its
 * opening stretch runs straight through the traffic walking at the base,
 * and a pool that size is spent before the mission has started.
 *
 * Read it against what a halt puts back: CONVOY_MEND a second for
 * CONVOY_HALT seconds is 90,000, a third of the pool. So a leg that cost
 * the cart a third of itself is paid for by the halt at the end of it,
 * and a leg that cost half is a debt carried to the next one.
 */
export const CONVOY_HP = 250000;
/** the cart's plating, shaved flat off every hit like a turret's
 *  (TowerStats.armor) — enough that the runts chewing at it as they walk
 *  past are a nuisance and the heavies are the threat */
export const CONVOY_ARMOR = 40;
/**
 * ITS FOOTPRINT IN CELLS — what the swarm's guns aim at, what the sight
 * ray clips to, and (times CELL) the world quad the art is stretched onto
 * (atlas.ts CONVOY_QUAD, which has to move with this number).
 *
 * TWELVE TILES, WHICH IS TWICE WHAT IT WAS. Six was already "a big square
 * on purpose" and it was not big enough: the cart is the one body on the
 * board a player has to find from across a map, while the swarm is on the
 * screen and the camera is far enough out to see the road, and at six
 * tiles it read as a turret somebody had left in a field. Twelve is wider
 * than anything else on the board bar the Sovereign, which is the size an
 * objective should be. Nothing downstream cares: the cart claims no ground
 * and is in no occupancy grid (see the note in Sim.launchConvoy), so the
 * footprint is only ever a hitbox and a quad.
 */
export const CONVOY_SIZE = 12;
/**
 * WHICH TURRET'S STATS THE CART'S ARE A COPY OF, with its name, footprint
 * and plating written over them (Sim.launchConvoy).
 *
 * A structure has a `spec`, and most of a spec is a GUN — range, reload,
 * ammunition, what it will shoot at. A cart has none of that, and the
 * fields are never read on it because reading them is what the turret
 * loop does and the turret loop walks a list this is not in. So rather
 * than invent thirty numbers that mean nothing, it takes the smallest
 * turret's and says so here: everything about this that is turret-shaped
 * is the default, and the three numbers that are the cart's own are the
 * three above.
 */
export const CONVOY_BASE_KIND = "tacker" as const;
/**
 * HOW FAST IT ROLLS, world px/s: 1.6 tiles a second, under half the pace
 * of the slowest thing the swarm fields. Thornway's road is 23,750 px, so
 * the driving alone is twelve and a half minutes and the halts put it
 * over fifteen.
 *
 * SLOW IS THE POINT. The mission is "hold a position that moves", and a
 * position that moves quickly is not one: the cart has to be somewhere
 * long enough for the swarm to arrive at it, or the escort is a parade.
 */
export const CONVOY_SPEED = 1.6 * CELL;
/** seconds it stands at each halt (EscortMission.halts), and the health it
 *  mends a second while it stands there */
export const CONVOY_HALT = 45;
export const CONVOY_MEND = 2000;

/**
 * EVERY TRAIN IS TOUGHER THAN THE ONE BEFORE IT — what launch `n` (0 for
 * the first) multiplies the whole chain's health pool by.
 *
 * WHY IT IS A RAMP AND NOT A FLAT POOL. The launches are three and a
 * third minutes apart and the run gets RICHER between them: by the
 * seventh the board has had twenty more minutes of scrap than it had at
 * the first, and a Borer worth exactly as much as the one it already
 * killed is a Borer the player has already solved. The mission asks its
 * question once and then asks it again harder — buy more road, or watch
 * this one walk — which is the only way seven repetitions of one event
 * stay a decision instead of a chore.
 *
 * IT USED TO BE A CENTRED LINE, AND THEN A PLAIN GEOMETRIC ONE. 0.7
 * stepping to 1.3 was built to hold the mission's total where a flat pool
 * would have put it, which made it a rule about SHAPE — and the shape was
 * not the problem; it was worth 1.86x from first to last, so the player
 * out-scaled it and the back half got easier as it went. A third again
 * every launch fixed that but kept ONE rate for the whole pattern, and a
 * board compounding for thirteen extra minutes does not grow at one rate:
 * the opening was priced right and the close was still catching up.
 *
 * SO THE RATE ITSELF CLIMBS. The step is GROWTH at the first gap and a
 * further ACCEL each gap after it, which compounds the growth rather than
 * the pool.
 *
 * ...AND THE CURVE IS WALKED AT STRETCH OF A STEP A LAUNCH. It was drawn
 * for a five-launch pattern and reached x4.99 at the last of them; the
 * pattern is SEVEN now, and a curve that kept its old stride would have
 * put x16.7 there instead — the extra launches would have been paid for
 * in health the board was never given the scrap to answer. So the same
 * curve is walked more slowly: the seventh train carries exactly what the
 * fifth used to, and every train before it sits where that curve says.
 * x1.00, x1.21, x1.52, x1.95, x2.59, x3.54, x4.99, and x7.24 for the
 * spare. At Nemesis that is 252,000 of train at the first launch and 1.26M
 * at the seventh.
 *
 * THREE NUMBERS TO MOVE, and they do different jobs. GROWTH is the opening
 * — raise it and the early trains get harder. ACCEL is the back half
 * alone. STRETCH is how many launches the whole curve is spread over:
 * lengthen the pattern and this is the number that keeps the last train
 * where it was, rather than every number below it.
 *
 * THE SPARE KEEPS CLIMBING: it is launched at index `pattern.length`, so
 * the replacement for a train that got through is seven times the first
 * one. And the DROP does not ramp with it: scrap comes off the kind's
 * authored health like every other body's (unitDrop), the same way the
 * level curve leaves drops alone however high the tier climbs.
 */
export const WORM_RAMP_GROWTH = 1.35;
export const WORM_RAMP_ACCEL = 1.07;
/** how far along the curve one launch moves. 4/6 puts the SEVENTH train
 *  (launch 6) exactly where the fifth (launch 4) used to be */
export const WORM_RAMP_STRETCH = 4 / 6;
export const wormRamp = (launch: number): number => {
  const n = Math.max(0, launch) * WORM_RAMP_STRETCH;
  // GROWTH^n is the flat geometric curve; ACCEL^(n(n-1)/2) is the sum of
  // one extra step per gap already taken, which is what makes the RATE
  // rise instead of the pool. n = 0 and n = 1 are untouched by ACCEL.
  return WORM_RAMP_GROWTH ** n * WORM_RAMP_ACCEL ** ((n * (n - 1)) / 2);
};

/**
 * IS THIS KIND A PIECE OF A TRAIN — one flag per kind id, for the readers
 * that have to know without holding a Sim. The sim itself has `ucross`,
 * which is the better answer and says WHICH worm; this is for the build
 * test (board.ts bodiesClear, where a footprint is allowed to land on a
 * Borer because the Borer walks through it) and the corner map's icon
 * (game.ts drawMinimap), neither of which is inside the sim.
 */
export const KIND_IS_CROSSER = Uint8Array.from(UNIT_KINDS, (k) =>
  WORM_CHAIN.includes(k) ? 1 : 0,
);

/**
 * Mindustry's unit trees: each line is one factory's upgrade path, in tier
 * order. This is the shape a level author thinks in — "more ground, less
 * air" — so the level editor lays its unit inputs out one tree per row, and
 * a unit's position in a row is its tier.
 */
export const UNIT_TREES = [
  { key: "ground", name: FAMILY_NAMES.ground.name, kinds: ["ironhide1", "ironhide2", "ironhide3", "ironhide4", "ironhide5"] },
  { key: "support", name: FAMILY_NAMES.groundSupport.name, kinds: ["starhart1", "starhart2", "starhart3", "starhart4", "starhart5"] },
  { key: "dartback", name: FAMILY_NAMES.dartback.name, kinds: ["dartback1", "dartback2", "dartback3", "dartback4", "dartback5"] },
  { key: "air", name: FAMILY_NAMES.air.name, kinds: ["stoop1", "stoop2", "stoop3", "stoop4", "stoop5"] },
  // the two naval tank trees: upgrade paths like the four above, on the
  // amphibious layer. They used to be the only rows whose units needed a
  // MAP to field them — a wave asking for runts on a map with no water
  // sent nothing at all — and they no longer are: a naval tank comes in
  // by a ground door and drives to the core when there is no sea
  { key: "naval", name: FAMILY_NAMES.naval.name, kinds: ["skate1", "skate2", "skate3", "skate4", "skate5"] },
  { key: "navalSupport", name: FAMILY_NAMES.navalSupport.name, kinds: ["livewire1", "livewire2", "livewire3", "livewire4", "livewire5"] },
  // the seventh row: the heavy melee line, on the walkers' layer
  { key: "tusker", name: FAMILY_NAMES.tusker.name, kinds: ["tusker1", "tusker2", "tusker3", "tusker4", "tusker5"] },
  // the eighth row: the crawlers, on the walkers' layer
  { key: "grapnel", name: FAMILY_NAMES.grapnel.name, kinds: ["grapnel1", "grapnel2", "grapnel3", "grapnel4", "grapnel5"] },
  // the ninth row: the second air line, on the flyers' layer
  { key: "kettle", name: FAMILY_NAMES.kettle.name, kinds: ["kettle1", "kettle2", "kettle3", "kettle4", "kettle5"] },
  // THE LAST TWO ROWS ARE OBJECTIVES AND NOT WAVE UNITS (OBJECTIVE_KINDS
  // below). They are in this table because every kind must be in exactly
  // one tree (see the check under it) and because the codex, the hitbox
  // viewer and the balance page all read the table to know a body exists
  // — but a WAVE cannot send them and the editor does not offer them
  // (WAVE_TREES). Neither is an upgrade path either, so their slots do
  // not read as tiers.
  { key: "boss", name: BOSS_NAME, kinds: ["boss"], objective: true },
  { key: "worm", name: WORM_NAME, kinds: ["wormhead", "wormcar", "wormtail"], objective: true },
  // ...and the siege's, on the same terms: the emplacement the raze
  // mission plants (RazeMission). One row and no upgrade path — there are
  // ten railguns on a map and they are one job, not ten rungs
  { key: "railgun", name: RAZE_NAME, kinds: ["railgun"], objective: true },
  // THE PYLONS — the two buff towers an intercept plants over its road
  // (missionMarks.ts, Sim.raiseMarkTowers). One row and not an upgrade
  // path: the two are two jobs and neither is a rung
  { key: "pylon", name: PYLON_NAME, kinds: ["goad", "bastion"], objective: true },
  // THE FABRICATORS — five houses a map stands up (missionMarks.ts
  // FABRICATOR, Sim.runFabricators). The slots ARE tiers here: house n
  // sends tier n, but a wave still may not send a house
  { key: "fabricator", name: FABRICATOR_NAME, kinds: ["fabricator1", "fabricator2", "fabricator3", "fabricator4", "fabricator5"], objective: true },
  // ...AND THE WARDENS (WARDEN_NAME), which nothing puts on a board at
  // all. They are here because every kind must be in exactly one tree,
  // and `objective` keeps them out of every wave and out of the editor's
  // rows. Four bodies and no upgrade path: the slots are not tiers
  { key: "warden", name: WARDEN_NAME, kinds: ["bulwark", "lance", "halberd", "juggernaut"], objective: true },
] as const satisfies readonly {
  key: string;
  name: string;
  kinds: readonly UnitKind[];
  objective?: boolean;
}[];

/**
 * THE BODIES A MISSION PUTS ON THE BOARD, AND NOTHING ELSE CAN.
 *
 * The Sovereign and the Borer are both EVENTS rather than volume — one
 * body that the run has to go and deal with — and that is the shape an
 * objective has (docs/mission-design.md). They used to be two different
 * cases: a Borer was already unrollable and unsendable-by-design, and the
 * boss was simply typed into wave 50 of the campaign document. The boss
 * being the last wave's finale was the old game, where clearing fifty
 * waves WAS the assignment and the script needed a curtain. The script
 * does not end any more (Sim.loadStep, the tide), so a boss on wave 50 is
 * a boss on a lap counter — it would come round again every cycle, at
 * double health, as ordinary traffic. That is the opposite of an event.
 *
 * SO THE GATE IS HERE AND THE STRIPPING IS IN `waveGroups`, which every
 * reader of a wave goes through — the sim, the editor, the audit, the
 * playtest. A document that still names one (an old save, a hand-edited
 * file, a paste) simply stops sending it, with nothing to migrate and no
 * second list to keep in step.
 *
 * THE BODIES ARE NOT RETIRED. Every line of them is live: stats, art,
 * atlas cells, weapons, the health bar. What is gone is the one place
 * that spawned them for no reason. A mission puts them down — the
 * intercept already does (Sim.launchCrosser) and the archetypes that want
 * a Sovereign are drawn and waiting (docs/mission-design.md, "venture and
 * destroy").
 */
export const OBJECTIVE_KINDS: readonly UnitKind[] = UNIT_TREES.filter(
  (t) => "objective" in t && t.objective,
).flatMap((t) => t.kinds as readonly UnitKind[]);

const OBJECTIVE = new Set<UnitKind>(OBJECTIVE_KINDS);

/** is this a body only a mission may field? — see OBJECTIVE_KINDS */
export const isObjectiveKind = (kind: UnitKind): boolean => OBJECTIVE.has(kind);

/** the same as a mask over UNIT_KINDS, for waveGroups' inner loop */
const OBJECTIVE_AT: readonly boolean[] = UNIT_KINDS.map((k) => OBJECTIVE.has(k));

/** the trees a WAVE is authored out of — the table, less the objectives.
 *  This is what the level editor lays out as rows */
export const WAVE_TREES = UNIT_TREES.filter((t) => !("objective" in t && t.objective));

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
 * Largest unit radius PER LAYER, and over both, USED TO LIVE HERE. Broad
 * phase bounds have to cover the widest thing a query could actually find,
 * and ground and air never touch each other: a ground-only splash that
 * padded itself by the stoop4's hull would sweep more than twice the
 * buckets it can ever hit. A body's size is its SHAPE now (UnitStats
 * hitbox), and a shape can be bent by the admin editor after this module
 * has been imported, so the three numbers are live fields on HB_RMAX in
 * hitbox.ts rather than consts derived here at import time.
 */

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
  { key: "ground", name: FAMILY_NAMES.ground.name, gimmick: "Walking armour. Every hit is shaved flat, so calibre beats volume.",
    layer: "ground", icon: "ironhide1",
    kinds: ["ironhide1", "ironhide2", "ironhide3", "ironhide4", "ironhide5"] },
  // THE SPITTERS: light, quick, and every shot they fire is the same purple
  // orb landing the same rot (weapons.ts POISON). No suicide charge, no
  // sap beams, no slag — one weapon look and one status across five tiers,
  // which is the whole point of the family. Its carrier is the dartback3,
  // and what it hands out is PACE, because rot runs on a clock and the
  // family wants more applications inside it.
  //
  // WHAT IT POSES: rot ignores armour, so this is the family a board that
  // out-plated the ground mechs still loses turrets to. Kill them before
  // the clock refreshes, or bring repair.
  { key: "dartback", name: FAMILY_NAMES.dartback.name, gimmick: "Purple orbs that leave rot — damage over time that ignores armour.",
    layer: "ground", icon: "dartback1",
    kinds: ["dartback1", "dartback2", "dartback3", "dartback4", "dartback5"] },
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
  { key: "groundSupport", name: FAMILY_NAMES.groundSupport.name, gimmick: "Piercing green lasers, from behind a crowd that keeps healing itself.",
    layer: "ground", icon: "starhart1",
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
  { key: "air", name: FAMILY_NAMES.air.name, gimmick: "Flying bombs. Every body dives at a structure and goes off on it.",
    layer: "air", icon: "stoop1",
    kinds: ["stoop1", "stoop2", "stoop3", "stoop4", "stoop5"] },
  // THE SNIPERS: the whales — skate1, skate2, skate3, skate4, skate5 — and every
  // gun on them is a HARPOON RAIL from beyond most of the board's reach
  // (forty-five to sixty-two tiles — the top of it level with a railhead). They crawl ashore (NAVAL_PACE, NAVAL_LAND_SPEED), the
  // skate3 is the spotter (the fleet reaches half again as far round it),
  // and the skate5's rail goes through everything on its line. What a hull
  // hits for is its row in weapons.ts, fixed: the fleet used to grow the
  // longer it lived and does not any more.
  //
  // WHAT IT POSES: it is shooting you long before you can shoot it. The
  // answer is the long guns — reach, and the spotter first.
  { key: "naval", name: FAMILY_NAMES.naval.name, gimmick: "Harpoon rails that outrange the board, and a spotter that extends them.",
    layer: "water", icon: "skate1",
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
  { key: "navalSupport", name: FAMILY_NAMES.navalSupport.name, gimmick: "Chain lightning that shorts guns, on hulls that blink and cloak.",
    layer: "water", icon: "livewire1",
    kinds: ["livewire1", "livewire2", "livewire3", "livewire4", "livewire5"] },
  // THE TUSKERS: the elephants — tusker1 to tusker5 — and the first line
  // that carries NO GUN. Every one of them fights with its tusks
  // (weapons.ts, fx "melee"): two to four tiles of reach against a roster
  // whose shortest gun is eleven, and more damage a second at that range
  // than anything else in the game fires at any range.
  //
  // THEY ARE THE BIG ONES. The runt is a 1.75x1.75 where every other
  // family's is about a tile, and the apex is a 5.5x5.5 — the largest
  // body that walks. Every tier wears roughly twice the Ironhides'
  // plating, which at the top means a flat 52 shaved off every hit.
  //
  // AND THEY CHARGE (UnitStats.charge): a tusker that can see a structure
  // inside its range leaves the flow field and walks straight at it. That
  // is the whole reason a melee family can exist here, and it is what
  // makes it a different problem from the Ironhides — a wall that walks
  // can be walled off and walked around; this one comes to find the guns.
  //
  // WHY IT CARRIES BOTH FIELDS. A force field EATS absorbable shots at
  // the outline and bills them to the carrier's shield pool; a shield
  // field hands a bar to the bodies around it. This line wants both
  // because its whole problem is the WALK IN: the bubble is what gets the
  // body through the long guns, the bar is what gets the herd behind it
  // through the same fire, and a broken bubble is a Tusker with nothing
  // but its plating for five seconds. The two share the one pool
  // (ForceFieldSpec), so the bar is deliberately set well under the
  // bubble — a carrier's own pool never drops low enough for its pulse to
  // touch it, and an outage is served in full.
  //
  // WHAT IT POSES: nothing small hurts it, nothing draws it away, and
  // what it reaches it eats. The answer is calibre and reach, used on the
  // approach — there is no answering a Tusker that has arrived.
  { key: "tusker", name: FAMILY_NAMES.tusker.name, gimmick: "Melee giants that leave the path to charge whatever they can see.",
    layer: "ground", icon: "tusker1",
    kinds: ["tusker1", "tusker2", "tusker3", "tusker4", "tusker5"] },
  // THE GRAPNELS: the starfish — grapnel1 to grapnel5 — the slowest
  // bodies in the game, and the only ones that carry no weapon.
  //
  // IT DOES NOT SHOOT; IT ANSWERS. A hit that lands on a grapnel has a
  // chance of throwing a homing star back out of one of its five arms,
  // and a grapnel that dies throws five at once, one down every arm
  // (UnitStats.starburst, weapons.ts GRAPNEL_STARS). From the elite up
  // every star is an element — rot, a soak that slows a gun's reload, or
  // fire — and every one of those bursts as well as bites.
  //
  // AND IT FOLDS INTO ITSELF. A grapnel reaches for the nearest of its
  // own kind and merges with it on purpose, up to ten bodies and ten
  // times the health in one, with the star's bite adding the whole way
  // (Sim.mergeGrapnel).
  //
  // WHAT IT POSES: a body that punishes the board for doing anything to
  // it, and punishes it most for finishing the job. The answer is reach —
  // kill them far from the line, before they have found each other — and
  // spacing, so one death burst cannot take a patch.
  { key: "grapnel", name: FAMILY_NAMES.grapnel.name, gimmick: "Merges with its own kind and throws homing stars back when hit.",
    layer: "ground", icon: "grapnel1",
    kinds: ["grapnel1", "grapnel2", "grapnel3", "grapnel4", "grapnel5"] },
  // THE KETTLES: the vultures — kettle1 to kettle5 — the second thing in
  // the sky and the first that does not blow itself up. A bomber spends
  // itself on the first structure it reaches, so the Skyfall line is
  // answered by killing it ANYWHERE; a kettle carries no charge, ignores
  // every gun it passes over, flies the straight line to the core and
  // parks on it, firing. Wing pods at every tier and nothing else: no
  // aura, no field, no charge, no death burst (UNIT_STATS below).
  //
  // WHAT IT POSES: the whole crossing is the fight, and nothing about the
  // board's SHAPE takes part in it. The answer is reach that points up,
  // far enough out that a flight is dead before the core is in its range
  // — an AA line hugging the core is an AA line being shot at.
  { key: "kettle", name: FAMILY_NAMES.kettle.name, gimmick: "Ignores the board, flies the straight line to the core and parks on it.",
    layer: "air", icon: "kettle1",
    kinds: ["kettle1", "kettle2", "kettle3", "kettle4", "kettle5"] },
] as const satisfies readonly {
  key: string;
  name: string;
  /** ONE LINE ON WHAT MAKES THIS FAMILY ITS OWN PROBLEM — the "what it
   *  poses" note above each entry, said to the player. The faction picker
   *  and the track's unlock card print it, so it is a sentence and not a
   *  stat line */
  gimmick: string;
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
  dartback: PAL.venom,
  groundSupport: PAL.star,
  air: PAL.bomber,
  naval: PAL.harpoon,
  navalSupport: PAL.wraith,
  tusker: PAL.tusk,
  grapnel: PAL.hook,
  kettle: PAL.carrion,
};

/**
 * THE FAMILIES OFF THE BOARD, and the whole of how one gets there: name it
 * here. A shelved family keeps its bodies, its stats and its sprites —
 * every line of it is live code — it is simply never rolled into a wave
 * (rollFamilies), so it cannot be met.
 * Take the name back out and it is on the board again, at the level the
 * track always meant to open it on.
 *
 * NOTHING IS SHELVED WHILE THE ANIMAL ART IS ON. The Wraith fleet sat here
 * (as the Aegis tanks) while the support lines were re-cut; it blinks,
 * cloaks and shorts now and holds a front on its own, so all seven
 * families roll.
 *
 * THE TUSKERS ARE THE ONE FAMILY THE SWITCH CAN SHELVE. The other six are
 * Mindustry trees wearing animal art: turn ANIMAL_ART off and they come
 * back as the hulls they were, byte for byte, which is that flag's whole
 * promise. The elephants have no hull behind them — there is no upstream
 * unit they are packed over, only cells of their own that the animal pass
 * paints (atlas.ts) — so off the switch they would roll into waves as
 * empty sprites. They sit on the shelf instead, which keeps the promise
 * exact: off, the game is the six lines it shipped with.
 */
export const SHELVED_FAMILIES: readonly FamilyKey[] = ANIMAL_ART ? [] : ["tusker", "grapnel", "kettle"];

/** the families in play: the table, less the shelf */
export const ACTIVE_FAMILIES: readonly FamilyKey[] = FAMILIES.map((f) => f.key).filter(
  (k) => !SHELVED_FAMILIES.includes(k),
);

/**
 * HOW MANY FAMILIES A DEPLOY SENDS — the die picks this many, and the
 * script is dealt them a wave at a time (transformScript).
 *
 * IT IS NOT TIED TO THE SCRIPT'S SHAPE ANY MORE. It used to have to equal
 * the number of families the campaign was authored in, because the deal
 * was one fixed cast for the whole run — slot 0 played as families[0] for
 * all fifty waves — so a fourth family had nowhere to go and a second
 * script authored in two would have left one unsent. The deal turns a
 * notch every wave now, so ANY number of families fits ANY script: the
 * run's families ride a ring and each wave takes the next few off it.
 *
 * FOUR, because a run wants a swarm with more than one face in it and
 * three families over fifty waves is three faces. The cap on how many
 * show up AT ONCE is a separate number (MAX_FAMILIES_PER_WAVE) — that is
 * the one that keeps a wave readable, and raising this one does not touch
 * it.
 */
export const FAMILIES_PER_RUN = 4;

/**
 * THE MOST FAMILIES A CUSTOM HAND MAY NAME — the ceiling on what a player
 * can ask for, and a different number from FAMILIES_PER_RUN on purpose.
 *
 * FAMILIES_PER_RUN is how many the DIE deals when nobody says otherwise.
 * This is how many a player may LIST, and there is no reason those two
 * should be the same: the roll is a balance decision about the campaign,
 * the hand is the player asking for a particular fight. Custom mode
 * already hands over the difficulty and the mutators; the swarm's cast is
 * the same kind of dial.
 *
 * TEN IS HEADROOM, not a promise. The roster fields nine families today
 * (ACTIVE_FAMILIES) and a hand cannot name one that does not exist, so
 * the picker fills at nine and this number does nothing until a tenth
 * family ships. It is here so that the day one does, the only thing that
 * has to change is the table — which is exactly what happened when the
 * Grapnels and then the Kettles went on.
 *
 * THE FLOOR IS ONE, and one is a real answer: a hand of a single family
 * plays every wave of the campaign in that family (transformScript), which
 * is the way to sit down and learn what one line actually does. An EMPTY
 * hand is not zero families — it is the absence of a hand, and means
 * rolled (see rollFamilies `chosen`).
 */
export const FAMILIES_MAX = 10;

/**
 * THE MOST FAMILIES ONE WAVE MAY SEND, however many the run rolled.
 *
 * A WAVE IS A THING A PLAYER HAS TO READ IN THREE SECONDS. Ten families
 * arriving together is not ten times the variety, it is mush: every
 * colour on the field at once, every status on the board at once, and no
 * answer that is better than any other. The run's variety belongs ACROSS
 * waves — this wave is the elephants and the bombers, the next is the
 * snipers — and that is what the per-wave deal gives.
 *
 * A wave never sends more than it was AUTHORED with either: the cap bites
 * only where a script draws on more slots than this, and there the extra
 * slots fold back onto the families already dealt (their counts add), so
 * nothing authored is dropped. The shipped script's widest wave draws on
 * three, so today the cap is the ceiling and the script is the floor.
 */
export const MAX_FAMILIES_PER_WAVE = 3;

/**
 * THE FAMILIES THAT ARRIVE BY AIR, and they are never dealt a position
 * the OPENING claims (rollFamilies, openingDeal).
 *
 * THE OPENING MUST BE WALKABLE. A run opens with nothing on the board —
 * no turret is bought until the first scrap is banked — and while the
 * script is still sending one family at a time it is still the stretch a
 * player answers by putting their first cards down. A ground wave walks
 * the route, which is a route the player can read and block; a flight of
 * runts crosses everything between the door and the core in a straight
 * line and cares about none of it. Meeting that there is not a hard
 * opening, it is an opening with one legal answer, and the deal has not
 * necessarily handed over a turret that can even shoot up.
 *
 * IT IS THE SCRIPT THAT SAYS HOW LONG THE OPENING IS (openingDeal): its
 * leading run of single-family waves, two on the shipped campaign. Past
 * that the script is already asking for more than one answer at a time,
 * and a flight is a fair thing to ask for.
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
 * ID — it keys the sim's arrays, the sprite files under public/stock
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
 * half-named. THE BOSS IS IN NO FAMILY and so is named here by hand: it is
 * the Sovereign, the crowned sea eagle (game/kingArt.ts), and it takes a
 * proper noun for the same reason no other body may have one — there is
 * exactly one of it, so the name says which thing rather than which rung.
 * Off the animal switch it is Mindustry's hull again and reads "Boss".
 *
 * Off ANIMAL_ART the ids come back as the names, capitalised, along with
 * Mindustry's sprites — the whole promise of that switch.
 */
export const UNIT_NAMES: Record<UnitKind, string> = (() => {
  const capitalised = Object.fromEntries(
    UNIT_KINDS.map((k) => [k, k[0].toUpperCase() + k.slice(1)]),
  ) as Record<UnitKind, string>;
  const out = { ...capitalised };
  for (const f of FAMILIES) {
    // OFF THE SWITCH, ONLY THE SIX MINDUSTRY LINES FALL BACK — because
    // the id they fall back TO is a real upstream unit with a real
    // upstream sprite, which is the whole of that promise. The Tuskers
    // have no upstream anything to fall back to (they are shelved off the
    // switch, SHELVED_FAMILIES), so they are named off the table either
    // way rather than reading as `Tusker3` in the level editor.
    if (!ANIMAL_ART && f.key !== "tusker" && f.key !== "grapnel" && f.key !== "kettle") continue;
    f.kinds.forEach((k, i) => {
      out[k] = `${FAMILY_NAMES[f.key].body} (${UNIT_RANKS[i]})`;
    });
  }
  out.boss = BOSS_NAME;
  // THE CROSSER'S THREE PIECES, named here for the reason the boss is: no
  // family, so no `Body (rank)` to build them out of. They are named for
  // what they ARE on the board — a player who shoots the third car has to
  // be told it was a car, or the health bar that did not finish the job
  // says nothing about why
  out.wormhead = `${WORM_NAME} (head)`;
  out.wormcar = `${WORM_NAME} (car)`;
  out.wormtail = `${WORM_NAME} (tail)`;
  FABRICATOR_KINDS.forEach((k, i) => (out[k] = `Fabricator (T${i + 1})`));
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
    if (out.length >= FAMILIES_MAX) break;
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
 * the SLOTS the deal fills. The campaign's script is written in three
 * (ground, ground support, air); a slot is a ROLE in a wave ("the line",
 * "the support behind it"), not a promise about which family plays it,
 * and the deal re-lets the roles every wave (transformScript).
 *
 * THE COUNT OF SLOTS NO LONGER HAS TO MATCH THE RUN'S FAMILIES. It is
 * only the widest a wave can be authored; how many families the run
 * sends is FAMILIES_PER_RUN, and the two are independent now.
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
 * WHICH SLOTS ONE WAVE DRAWS ON — the indices into `slots`
 * (scriptFamilies) that this wave actually sends, in slot order.
 *
 * This is a wave's WIDTH as authored, and the deal reads it to know how
 * many families to take off the ring for it (transformScript): a wave
 * written in one slot is one family however many the run rolled, which
 * is the whole reason a fourth family does not turn every wave into a
 * four-way mixture.
 *
 * The boss belongs to no family and draws on no slot, so a boss wave is
 * zero wide and takes nothing off the ring.
 */
export function waveSlots(
  wave: WaveUnits | readonly RegionWave[],
  slots: readonly FamilyKey[],
): number[] {
  const out = new Set<number>();
  for (const g of waveGroups(wave))
    g.counts.forEach((c, i) => {
      if (c <= 0) return;
      const f = familyOf(UNIT_KINDS[i]);
      if (!f) return;
      const at = slots.indexOf(f);
      if (at >= 0) out.add(at);
    });
  return [...out].sort((a, b) => a - b);
}

/**
 * HOW MANY FAMILIES OFF THE FRONT OF THE RING THE OPENING CLAIMS, and
 * therefore how many of the roll's leading families must be able to WALK
 * (rollFamilies, AIR_FAMILIES).
 *
 * THE OPENING IS THE SCRIPT'S LEADING RUN OF SINGLE-FAMILY WAVES. A run
 * starts with nothing on the board — no turret is bought until the first
 * scrap is banked — and while the script is still sending one family at a
 * time it is still asking to be answered with the first card off the
 * deal. A flight crosses everything between the door and the core in a
 * straight line and cares about none of it, so meeting one there is not a
 * hard opening, it is an opening with one legal answer, and the deal has
 * not necessarily handed over a turret that can even shoot up. The
 * shipped script opens with two waves of runts, so its opening is two.
 *
 * IT USED TO BE A LIST OF SLOTS, and could afford to be: one fixed cast
 * held for the whole run, so pinning the opening wave's SLOT pinned it
 * for every wave that slot ever appeared in. The cast turns every wave
 * now, so what has to be pinned is the RING POSITIONS the opening
 * consumes — which, because the deal starts at position 0 and walks
 * forward, are simply the first few (transformScript).
 *
 * A multi-family first wave ends the opening at itself: the script is
 * already asking for more than one answer, so it is past the stretch this
 * rule protects, and only its own width is claimed.
 */
export function openingDeal(script: readonly LevelStep[]): number {
  const slots = scriptFamilies(script);
  let n = 0;
  for (const step of script) {
    const take = Math.min(waveSlots(step.wave, slots).length, MAX_FAMILIES_PER_WAVE);
    if (take === 0) continue; // an empty wave, or the boss alone
    if (take > 1) return n === 0 ? take : n;
    n += take;
  }
  return n;
}

/**
 * THE DIE ROLL: FAMILIES_PER_RUN families, in a random order — and the
 * order is the RING the deal walks, not a slot-for-slot cast. Wave 1
 * starts at families[0] and every wave after it turns the ring one notch
 * (transformScript), so the order decides which family opens the run and
 * which of them tend to arrive together, never "families[2] is the air
 * slot for fifty waves".
 *
 * EVERY FAMILY IN PLAY IS ELIGIBLE ON EVERY MAP. This used to be drawn
 * against the map's doors, and a map with no water door could not roll a
 * naval family at all; the naval layer is amphibious now (navalWalkMask)
 * and every layer falls back to whatever doors the map does paint
 * (Sim.padMaskFor), so there is no longer such a thing as a map a family
 * cannot play. The only thing that keeps a family out of the draw is the
 * shelf (SHELVED_FAMILIES).
 *
 * ...BUT THE FRONT OF THE RING IS RESERVED FOR WALKERS. The opening
 * claims the first few positions (openingDeal) and a flying family is
 * never dealt one of them (AIR_FAMILIES): the waves a script sends one
 * family at a time are answered with the first card off the deal, and a
 * flight that ignores the route and the walls is not an opening a player
 * can be asked to solve with whatever the die handed them. Pass the
 * script and the guarantee is exact; pass none and it holds for position
 * 0, which is the opening of every script this game has ever had.
 *
 * IF THERE ARE NOT ENOUGH WALKERS the front keeps a flyer rather than
 * coming up empty — a wave with nothing in it is worse than a hard one.
 *
 * THE SHUFFLE IS OTHERWISE UNTOUCHED. The opening takes the first walking
 * families off the shuffled pile and everything else falls in behind them
 * in the order a SECOND shuffle leaves. Filling the tail in the order the
 * first shuffle happened to leave would bias where a flyer lands —
 * reserving the front pushes a family shuffled to position 0 into
 * position 1, so air would take the second position more often than the
 * third for no reason anyone designed. Two more swaps make every
 * non-opening position equally likely again; this narrows WHERE air can
 * be dealt, never how often it is drawn.
 *
 * `chosen` IS CUSTOM MODE'S HAND, and the one way a family arrives
 * without the die. A regular deploy passes nothing and gets the roll
 * above.
 *
 * A NAMED HAND IS THE WHOLE LIST, NOT A SEED. Name three families and the
 * run sends those three and nothing else; name ONE and every wave of the
 * campaign arrives in that one family (transformScript deals a wave as
 * many families as it was authored wide, and with a list of one there is
 * only ever the one to deal). It used to be a seed — a hand of one was
 * topped up to FAMILIES_PER_RUN by the shuffle — and that made the
 * picker a liar: a player who ticked the Wraiths to go and look at the
 * Wraiths got the Wraiths and three strangers, and there was no way at
 * all to ask for a single-family run. FAMILIES_PER_RUN is what the DIE
 * deals; it was never meant to be a floor under what a player may ask
 * for.
 *
 * AN EMPTY HAND IS NOT A HAND OF ZERO. It is the absence of one, and
 * means rolled — which is the default, and what regular mode always
 * passes.
 *
 * THE ARRANGEMENT RULE STILL HOLDS OVER A HAND: a walker takes the front
 * where the hand has one, because a script's opening is answered with the
 * first card off the deal whoever picked the swarm. A hand of one flying
 * family is honoured as given — there is nothing to arrange, and a player
 * who asked for that fight has asked for it. What a hand does NOT get is
 * the second shuffle: the tail is the player's list in the order they
 * gave it, since a hand is not a roll and there is no bias to spread.
 */
export function rollFamilies(
  rand: () => number = Math.random,
  script?: readonly LevelStep[],
  chosen: readonly FamilyKey[] = [],
  /** what the DIE may deal — the campaign passes what the track has
   *  opened (track.ts familiesAt); custom mode takes the default */
  open: readonly FamilyKey[] = ACTIVE_FAMILIES,
): FamilyKey[] {
  const hand = cleanFamilies(chosen);
  // A HAND NAMED IS A HAND PLAYED (see `chosen`): the pool is drawn on
  // only to FILL a run nobody named, never to pad one somebody did
  const pool: FamilyKey[] =
    hand.length > 0 ? [] : cleanFamilies(open.length > 0 ? open : ACTIVE_FAMILIES);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const picked = hand.length > 0 ? hand : pool.slice(0, FAMILIES_PER_RUN);
  const opening = Math.min(script ? openingDeal(script) : 1, picked.length);
  if (opening <= 0) return picked;
  // the front first, each position taking the earliest WALKING family
  // still unspent
  const spent = new Set<number>();
  const front: FamilyKey[] = [];
  for (let n = 0; n < opening; n++) {
    const at = picked.findIndex((f, i) => !spent.has(i) && !familyFlies(f));
    if (at < 0) break; // out of walkers — the rest of the front takes what comes
    front.push(picked[at]);
    spent.add(at);
  }
  // ...and everything else is SHUFFLED AGAIN behind them (see above).
  // A CHOSEN HAND SKIPS IT: there is no roll to de-bias, and a player who
  // listed families is owed their list.
  const rest = picked.filter((_, i) => !spent.has(i));
  if (hand.length === 0)
    for (let i = rest.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [rest[i], rest[j]] = [rest[j], rest[i]];
    }
  return [...front, ...rest];
}

/**
 * THE WAVE TRANSFORMATION: the script re-cast into the rolled families,
 * tier for tier, A WAVE AT A TIME.
 *
 * THE DEAL IS PER WAVE, NOT PER RUN. The script's families
 * (scriptFamilies, in order) are its SLOTS — roles, not families: "the
 * line", "the support behind it", "the third thing". Each wave takes as
 * many families off the ring as it has slots, starting where the ring
 * left off and turning ONE NOTCH per wave, so the roles are re-let every
 * wave: wave 1's line is families[0], wave 2's is families[1], and a run
 * of four families shows all four over a handful of waves without ever
 * showing more than one wave's worth at once.
 *
 * WHY A RING AND NOT A SECOND DIE. A per-wave roll would be variety with
 * no guarantee behind it: a family could sit out all fifty waves, or take
 * three waves in a row while another never appeared. The ring is
 * deterministic — the same script and the same roll give the same fifty
 * waves, which is what the audit arithmetic and the headless playtest
 * need — and it spreads the families evenly by construction, because
 * every notch moves every slot onto the next family along.
 *
 * WHY ONE NOTCH AND NOT THE WAVE'S WIDTH. Stepping by the width looks
 * tidier and cycles badly: four families and a run of two-slot waves
 * would alternate {0,1}, {2,3}, {0,1} forever — two mixtures, not four.
 * One notch a wave walks every window across the whole ring.
 *
 * HOW MANY FAMILIES A WAVE GETS is the narrowest of three: the slots it
 * was authored in, MAX_FAMILIES_PER_WAVE, and the families the run has.
 * A WAVE AUTHORED IN ONE SLOT SENDS ONE FAMILY whatever the run rolled —
 * that is the point of reading the wave's own width, and it is why a
 * fourth family does not turn the opening into a mixture. Where a wave is
 * wider than the cap or the run, the extra slots fold back round the
 * families already dealt to it and their counts add, so nothing authored
 * is dropped.
 *
 * THE BOSS IS NEVER TOUCHED. It belongs to no family, draws on no slot,
 * and a wave that is only the boss does not turn the ring.
 */
export function transformScript(
  script: readonly LevelStep[],
  families: readonly FamilyKey[],
): LevelStep[] {
  if (families.length === 0) return [...script];
  const slots = scriptFamilies(script);
  let turn = 0; // the notch the ring is on — one per wave that sends a family
  return script.map((step) => {
    const used = waveSlots(step.wave, slots);
    const take = Math.min(used.length, MAX_FAMILIES_PER_WAVE, families.length);
    if (take === 0) return { ...step };
    // this wave's window on the ring: `take` families from the current
    // notch, with any slots past the cap folded back round them
    const cast = new Map<FamilyKey, FamilyKey>();
    used.forEach((slot, j) => {
      cast.set(slots[slot], families[(turn + (j % take)) % families.length]);
    });
    turn = (turn + 1) % families.length;
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
    return {
      ...step,
      wave: Array.isArray(step.wave)
        ? (step.wave as readonly RegionWave[]).map(recast)
        : recast(step.wave as WaveUnits),
    };
  });
}

/**
 * Normalize a wave into groups of counts indexed like UNIT_KINDS. Groups
 * with nothing in them are dropped.
 *
 * AN OBJECTIVE BODY IS STRIPPED HERE (OBJECTIVE_KINDS) — the Sovereign and
 * the Borer's three pieces come off a wave on the way out of this
 * function, whatever the document says. This is the ONE gate, and it is
 * here because every reader of a wave comes through it: the sim's staging,
 * the editor, the ladder audit, the playtest, the family deal. A document
 * that still names one just stops sending it, so there is nothing to
 * migrate and no second list to keep in step with this one.
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
    const counts = UNIT_KINDS.map((k, i) =>
      OBJECTIVE_AT[i] ? 0 : Math.max(0, spec[k] ?? 0),
    );
    if (counts.some((c) => c > 0)) groups.push({ counts });
  }
  return groups;
}

/**
 * A MAP'S MISSION — WHAT THE RUN IS FOR (docs/mission-design.md).
 *
 * THE WAVES ARE NOT THE OBJECTIVE ANY MORE. The script is an ENGINE: a
 * composition of bodies that arrives on a clock, and when it has nothing
 * left to send it goes round again, heavier, forever (Sim.loadStep — the
 * tide, LEVELS_PER_DOUBLING in ladder.ts). So a map cannot be finished by
 * outlasting its script, and every map has to say what finishing it means.
 * Three shapes so far:
 *
 *   hold      — keep the line for `waves` waves, every body they sent down.
 *               The classic assignment, and now a NUMBER rather than "until
 *               the document runs out": a hold that asks for more waves
 *               than the script holds gets them off the tide.
 *   survive   — last `minutes` on the clock.
 *   intercept — destroy `kills` crossers before they leave (below).
 *
 * Whichever it is THE CORE IS THE STAKE: the swarm walks at it and shoots
 * it (CORE_HP in constants.ts), and the run is lost the moment it falls.
 * Nothing leaks and nothing is counted in lives — a body that reaches the
 * core is a body at the core, chewing on it.
 */
export type Mission =
  | HoldMission
  | { kind: "survive"; minutes: number }
  | InterceptMission
  | EscortMission
  | RazeMission;

/**
 * HOLD THE LINE for a stated number of waves.
 *
 * A wave counts the moment every body it sent is DOWN (Sim.wavesCleared),
 * so the last wave's walk-and-die is part of the assignment and a run is
 * not over while something it let through is still chewing.
 *
 * `waves` UNSET MEANS THE SCRIPT'S OWN LENGTH, which is what every hold in
 * WORLDS plays: the campaign document is authored as a full assignment and
 * a second number beside it in this file would be a number to keep in step
 * with a document somebody else edits (applyLevelDoc). Authoring one is
 * how a map asks for a SHORTER hold — or for a longer one than the script
 * can supply, which is the case that turns the tide.
 */
export interface HoldMission {
  kind: "hold";
  /** how many waves must be cleared; unset is the script's own count */
  waves?: number;
}

/** how many NON-EMPTY waves a script holds — the number a hold defaults to,
 *  and the one the tide is measured against (Sim.scriptWaves) */
export function scriptWaveCount(script: readonly LevelStep[]): number {
  let n = 0;
  for (const step of script) {
    let bodies = 0;
    for (const g of waveGroups(step.wave)) for (const c of g.counts) bodies += c;
    if (bodies > 0) n++;
  }
  return n;
}

/**
 * HOW MANY WAVES THIS MISSION ASKS FOR, 0 on every mission that is not
 * counted in waves — the hold's target, resolved against the script's own
 * length where the mission names no number of its own.
 *
 * `scriptWaves` is passed in rather than read off a spec because the two
 * callers have it in different hands: the sim froze it at stage time
 * (Sim.scriptWaves, which the tide must never move) and the HUD has it off
 * the header. One function, so a hold cannot be measured against one
 * number on the board and another in the panel.
 */
export const missionTarget = (mission: Mission, scriptWaves: number): number =>
  mission.kind === "hold"
    ? Math.max(0, Math.floor(mission.waves ?? scriptWaves))
    : 0;

/** the same, for a spec in hand — what the deploy panel prints */
export const holdWaves = (spec: LevelSpec): number =>
  missionTarget(spec.mission, scriptWaveCount(spec.script));

/**
 * INTERCEPT THE CROSSER (docs/mission-design.md, archetype 2): a fixed
 * number of things cross the map on roads of their own (missions.ts), and
 * the run is what stops them.
 *
 * IT IS THE FIRST MISSION THAT CAN BE FAILED WITHOUT LOSING THE CORE, and
 * the first that can be MET while the script still has waves to send —
 * the swarm and the crossers are two clocks, and the base still has to be
 * standing at the end of both. A hold's objective is the waves; this
 * one's is beside them.
 *
 * THE SCHEDULE IS AUTHORED HERE AND NOWHERE ELSE. The sim reads these
 * numbers and does what they say (Sim.runCrossers), so the whole shape of
 * the mission — how many come, on which road, how far apart, and how much
 * may get past — is one block a designer can read in one go.
 */
export interface InterceptMission {
  kind: "intercept";
  /** how many crossers must be destroyed for the mission to be met */
  kills: number;
  /** how many may reach the far side before the run is lost. One more
   *  than this gets through and the mission cannot be met, so it is over */
  leaks: number;
  /** seconds from the run's start to the first launch */
  first: number;
  /** seconds between one launch and the next */
  every: number;
  /**
   * WHICH ROADS EACH LAUNCH USES, by index into the map's roads
   * (missions.ts ROAD_SPECS). One entry a launch; a launch that names two
   * roads sends one crosser down each at the same moment, which is the
   * whole of what "both" means and the only way this mission asks the
   * player to have paid for two positions rather than one.
   */
  pattern: readonly (readonly number[])[];
  /**
   * THE SPARE LAUNCH, sent one `every` after the last of the pattern and
   * ONLY if something has already got through.
   *
   * It is what makes `leaks` a real allowance rather than a lie. The
   * pattern sends exactly `kills` crossers, so a run that lets one past
   * could not reach the count however well it played afterwards, and the
   * mission would be over at the moment of the leak while pretending it
   * was not. The spare is the second chance the allowance promises —
   * and it is not sent at all to a run that never needed it, so a clean
   * run ends when the pattern does.
   */
  spare: readonly number[];
  /**
   * HOW MANY PYLONS RISE ON EACH TRAIN, one entry a launch and in launch
   * order — the spare's entry last. `goad` speeds every train, `bastion`
   * blunts every shot at one (GOAD_SPEED_MUL, BASTION_CUT), and both are
   * global the moment they are up, so this table IS the mission's
   * escalation.
   *
   * THE COUNTS ARE NEW ARRIVALS, NOT A STANDING TOTAL. Towers accumulate
   * until the board takes them down, so a run that answers none of them
   * meets the last train under the sum of every row above it.
   *
   * WHERE each one stands is rolled from the map's free spots
   * (missionMarks.ts BUFF_TOWER), and a row asking for more than the map
   * has left simply puts fewer down.
   */
  pylons: readonly { goad: number; bastion: number }[];
}

/**
 * ESCORT THE CROSSER (docs/mission-design.md, archetype 3): the same shape
 * as the intercept, turned round. Something of the PLAYER'S crosses the
 * map on a road of its own (missions.ts), and the run is what keeps it
 * alive.
 *
 * IT IS THE MIRROR AND NOT A VARIANT. An intercept asks the board to put
 * a gun where a thing will be for thirty seconds; an escort asks it to
 * put a gun where a thing will be for thirty seconds AND TO STILL BE
 * THERE when the swarm arrives, because the cart is the thing the swarm
 * happens to be walking past. That is the same money spent on the same
 * ground and a completely different feeling, and the reason is the
 * direction the clock runs: a Borer the board fails to kill is a number
 * on a panel, and a convoy the board fails to hold is gone.
 *
 * THE CONVOY IS NOT A GOAL, and that line is the whole of what keeps this
 * mission from turning into a second core. Nothing routes to it, nothing
 * charges it, nothing changes course for it (Sim.updateUnits): the swarm
 * walks at the base exactly as it always does and shoots the cart the way
 * it shoots a turret it finds in reach on the way. So the pressure on the
 * cart is a fact about WHERE THE ROAD CROSSES THE SWARM'S ROUTE, which is
 * a fact about the map, which is what the player is buying guns against.
 *
 * THE HALTS ARE THE MERCY AND THE TRAP. A convoy stops at each of
 * `halts` for `haltSeconds` and mends `mend` a second while it waits, so
 * a leg that went badly is not the end of the run — and a cart standing
 * still for most of a minute is the easiest target on the board. Every
 * halt is therefore a position the player has to have paid for in
 * advance, which is the archetype's own sentence about opportunity cost
 * said in the only grammar this game has.
 */
export interface EscortMission {
  kind: "escort";
  /** how many convoys must reach the far post for the mission to be met */
  deliver: number;
  /** how many may be destroyed on the way before the run is lost. Zero is
   *  a real answer and is what Thornway plays: there is one cart */
  losses: number;
  /** seconds from the run's start to the first convoy rolling out */
  first: number;
  /** seconds between one convoy setting off and the next */
  every: number;
  /** which road each convoy takes, by index into the map's roads
   *  (missions.ts ROAD_SPECS) — one entry a convoy, in order */
  pattern: readonly number[];
  /**
   * WHERE IT WAITS, as fractions of the road from 0 to 1, in order.
   *
   * Fractions and not cells, because a halt is a point ON THE JOURNEY —
   * "a fifth of the way" — and a road edited by a corner should carry its
   * halts with it rather than leaving four cell coordinates pointing at
   * ground the line no longer passes. Thornway's four on the road are
   * chosen to land in the clearings the terrain already has.
   *
   * A HALT AT 0 IS THE DEPOT and is the first entry of every escort that
   * puts its cart down at the start of the run (`first: 0`). It is not a
   * special case in the sim — updateConvoys asks for the next halt before
   * it asks about the arrival, so a cart launched at s = 0 stops at 0 on
   * its first tick — it is only the shape the cart has to be parked in,
   * because a cart that spawns already rolling gives the player nothing to
   * price a position against. scripts/check.mjs allows 0 here for this
   * reason and nothing else; 1 is still illegal, since a halt at the post
   * is a delivery the mission would never count.
   */
  halts: readonly number[];
  /** how long it stands at each, seconds */
  haltSeconds: number;
  /** health a halted convoy mends per second; it never passes its max */
  mend: number;
}

/**
 * VENTURE AND DESTROY (docs/mission-design.md, archetype 1): a set number
 * of static things stand away from the base, and the run is what goes out
 * and takes them down.
 *
 * IT IS THE ARCHETYPE'S HARDEST PROBLEM, and the shape below is the answer
 * to it. A thing that stands still and waits to be shot is not a mission —
 * a player ignores it until the board is rich and then buys one battery.
 * So this one does three things to the shape:
 *
 *   IT SHOOTS THE CORE. Every railgun bombards the base from where it
 *   stands, forever, from the moment it rises (UnitStats.bombard). The
 *   cost of ignoring it is not a worse position later; it is the stake
 *   itself, draining. That is the "visible consequence for skipping it"
 *   the archetype owes, and it is the only one that competes with a wave
 *   clock that never stops.
 *
 *   IT RISES IN SECTIONS, ON A CLOCK. Not ten emplacements on the board at
 *   wave one, which is a wall of health a run either can or cannot afford
 *   and knows the answer to immediately — four sections, each heavier than
 *   the last, each arriving whether or not the one before it is down. A
 *   board that keeps up fights one section at a time; a board that falls
 *   behind is fighting the fourth with the third still firing, and the
 *   arithmetic of that is what the mission is asking about.
 *
 *   WHAT IT COSTS IS THE TRIP. A battery stands a long way from the
 *   core, so answering one is a gun bought out there while the wave is
 *   still walking at the base — "buy a gun that reaches" becomes "buy a
 *   position and hold it", which is the only question this game can ask.
 *
 * THE SCHEDULE AND THE ROSTER ARE AUTHORED HERE; WHERE THE SECTIONS STAND
 * IS AUTHORED WITH THE TERRAIN (missions.ts POST_SPECS), exactly the way
 * the intercept's launches are here and its roads are there. A post is a
 * place on a map; a section is what a mission puts on one.
 */
export interface RazeMission {
  kind: "raze";
  /** seconds from the run's start to the first section rising */
  first: number;
  /** seconds between one section rising and the next. It does NOT wait for
   *  the one before it to fall — that is the whole clock of the mission */
  every: number;
  /** the sections, in the order they rise */
  sections: readonly RazeSection[];
}

/** one section: a post on the map, the emplacements that rise on it, and
 *  anything the mission posts over them */
export interface RazeSection {
  /** which of the map's posts it rises on, by index into POST_SPECS
   *  (missions.ts) — a place authored with the terrain */
  post: number;
  /**
   * WHICH RISING IT BELONGS TO, 1-based. Sections sharing a number rise
   * together on the same tick of the mission's clock; absent means "its
   * own", i.e. position in the list. It is here for the batteries an
   * author places on the map (missionMarks.ts RAILGUN), where two in one
   * section is two marks rather than a shape in the list.
   */
  wave?: number;
  /** how many railguns rise here. The count is the ladder: 1, 2, 3, 4 */
  guns: number;
  /**
   * WHAT STANDS OVER THEM, by kind and count — the same shape a wave is
   * written in (WaveUnits), and deliberately not a list of one special
   * kind: posting a guard is a mission putting bodies on a post, and the
   * day a mission wants to post a Tusker herd it should not need a new
   * field. The shipped siege leaves this empty.
   *
   * Every body named here is PLANTED ON THE POST rather than sent at the
   * core (Sim.garrisonUnit), whatever kind it is.
   */
  guards: Partial<Record<UnitKind, number>>;
}

/** which rising a section belongs to, 1-based: its own number where it
 *  has one, else its place in the list (RazeSection.wave) */
export const razeWave = (s: RazeSection, i: number): number =>
  s.wave != null && s.wave > 0 ? Math.floor(s.wave) : i + 1;

/** how many railguns the whole siege stands up — the count the mission is
 *  measured in, and the number the panel counts down */
export const razeGuns = (m: RazeMission): number =>
  m.sections.reduce((n, s) => n + Math.max(0, Math.floor(s.guns)), 0);

/** the mission as the deploy panel and the HUD say it: a headline and a clause */
export function missionText(spec: LevelSpec): { title: string; detail: string } {
  const m = spec.mission;
  if (m.kind === "survive")
    return {
      title: `Survive ${m.minutes} minutes`,
      detail: "The waves never stop coming. Outlast them, with the core standing.",
    };
  if (m.kind === "escort")
    return {
      title:
        m.deliver === 1
          ? `Deliver the ${CONVOY_NAME.toLowerCase()}`
          : `Deliver ${m.deliver} ${CONVOY_NAME.toLowerCase()}s`,
      detail:
        "It rolls out of your base and crosses the whole map at walking pace. " +
        "Nothing comes looking for it and everything shoots it where it stands. " +
        `${m.losses === 0 ? "There is one, and it has to arrive." : `${m.losses} may be lost.`} The core must stand.`,
    };
  if (m.kind === "raze") {
    const guns = razeGuns(m);
    return {
      title: `Destroy ${guns} ${RAZE_NAME.toLowerCase()}s`,
      detail:
        `They ring you in ${m.sections.length} batteries and they shoot nothing but the core. ` +
        "A battery rises every few minutes whether or not the last one is down, " +
        "and every one of them is guarded. The core must stand.",
    };
  }
  if (m.kind === "intercept")
    return {
      title: `Destroy ${m.kills} ${WORM_NAME.toLowerCase()}s`,
      detail:
        `They cross the map and never come near you. ` +
        `${m.leaks === 1 ? "One may reach the far side" : `${m.leaks} may reach the far side`}; ` +
        `the next one that does ends the run. The core must stand.`,
    };
  return {
    title: `Hold the line — ${holdWaves(spec)} waves`,
    detail: "Break that many waves, with the core standing. What comes after them does not stop.",
  };
}

/**
 * THE MISSION'S PROGRESS, 0 to 1 — the one number every bar on the screen
 * is drawn from (Sim.missionProgress, UiState.missionProgress).
 *
 * IT IS THE OBJECTIVE'S OWN FRACTION AND NEVER THE SCRIPT'S. The wave
 * count used to stand in for this everywhere, which was honest only while
 * clearing the script WAS the assignment; under a tide that never runs out
 * a bar drawn off waves would fill to the brim and then quietly reset. So
 * each mission answers for itself: waves cleared of the hold's target,
 * seconds of the survive's clock, crossers down of the intercept's count.
 *
 * `state` is deliberately the smallest thing that can answer — the HUD has
 * these four numbers and so does the sim, so the definition lives here
 * once instead of on both sides of the worker seam.
 */
export function missionProgress(
  mission: Mission,
  target: number,
  state: {
    wavesCleared: number;
    time: number;
    crossKilled: number;
    convoyDone: number;
    convoyAt: number;
    razeKilled: number;
  },
): number {
  const frac =
    mission.kind === "survive"
      ? state.time / Math.max(1, mission.minutes * 60)
      : // THE SIEGE'S BAR IS THE EMPLACEMENTS AND NOT THE SECTIONS. Four
        // sections is a bar with five positions in it over twenty minutes;
        // ten railguns is a bar that moves every time the board finishes a
        // job, which is the thing a player watching this mission is doing
        mission.kind === "raze"
        ? state.razeKilled / Math.max(1, razeGuns(mission))
        : mission.kind === "intercept"
        ? state.crossKilled / Math.max(1, mission.kills)
        : // THE ESCORT'S BAR IS THE JOURNEY, not the delivery count. A
          // count of one is a bar with two positions in it — empty and
          // full — which over fifteen minutes of driving says nothing at
          // all, and "how far has it got" is the only question a player
          // watching a convoy is asking. So every cart already delivered
          // carries its whole share and the one on the road carries how
          // far along it is (Sim.convoyAt)
          mission.kind === "escort"
          ? (state.convoyDone + state.convoyAt) / Math.max(1, mission.deliver)
          : state.wavesCleared / Math.max(1, target);
  return Math.max(0, Math.min(1, frac));
}

/** what the bar's caption says: the objective counted in its own units */
export function missionCount(
  mission: Mission,
  target: number,
  state: { wavesCleared: number; crossKilled: number; convoyDone: number; razeKilled: number },
): { done: number; of: number; noun: string } {
  if (mission.kind === "survive") return { done: 0, of: 0, noun: "" };
  if (mission.kind === "raze") {
    const guns = razeGuns(mission);
    return { done: Math.min(guns, state.razeKilled), of: guns, noun: "destroyed" };
  }
  if (mission.kind === "intercept")
    return { done: Math.min(mission.kills, state.crossKilled), of: mission.kills, noun: "destroyed" };
  if (mission.kind === "escort")
    return { done: Math.min(mission.deliver, state.convoyDone), of: mission.deliver, noun: "delivered" };
  return { done: Math.min(target, state.wavesCleared), of: target, noun: "waves held" };
}

/**
 * ONE REQUIREMENT OF THE MISSION, as a line of text the player reads.
 *
 * `state` is what the line is COLOURED off and nothing else: a requirement
 * already satisfied, one already broken, or one still open. A broken line
 * only ever shows for the instant before the run's own loss screen takes
 * the panel — it is there because a panel that went from "0/1" to a score
 * screen never said which of the two requirements was the one that went.
 */
export interface MissionLine {
  /** the requirement in the player's words, e.g. "Destroy 7 Borers" */
  text: string;
  /** the count beside it — "1 / 7" — or "" where it has no number */
  count: string;
  state: "open" | "met" | "failed";
}

/**
 * WHAT THIS MISSION ASKS, ONE REQUIREMENT A LINE (the HUD's objective box,
 * components/Animechs.tsx ObjectivePane).
 *
 * IT IS A LIST BECAUSE A MISSION IS A LIST, and the panel used to pretend
 * otherwise. It had one big number, one bar and a row of pips, and every
 * one of those is an answer to "how is it going" — none of them is the
 * question. On the intercept the question is TWO questions that are not
 * the same shape: seven Borers have to die (a thing to achieve) and no
 * more than one may cross (a thing not to do), and a player reading a
 * fraction and a row of lamps has to work out for themselves which of the
 * two ends the run. Written out as sentences there is nothing to work out.
 *
 * SUCCESS AND FAILURE ARE BOTH ON IT, always, and in that order: what the
 * run is for, then what would end it. The last line of every mission is
 * the core, because the core is the stake on all four of them (see
 * Mission) and a panel that only named it on the maps where it is the
 * whole objective was a panel that let the player forget.
 *
 * A COUNT NEVER OVERSHOOTS ITS TARGET — an eighth kill on a mission asking
 * for seven still reads "7 / 7", because the seventh was the one that met
 * it. An ALLOWANCE does overshoot, and has to: "2 / 1" beside "let no more
 * than 1 past you" is the whole of why the run just ended, and clamping it
 * to "1 / 1" would print the same thing a clean run at its limit prints,
 * with only the colour to tell them apart.
 */
export function missionLines(
  mission: Mission,
  target: number,
  state: {
    wavesCleared: number;
    timeLeft: number;
    crossKilled: number;
    crossLeaked: number;
    convoyDone: number;
    convoyLost: number;
    razeKilled: number;
  },
): MissionLine[] {
  const out: MissionLine[] = [];
  /** "n / of", and whether that is all of them */
  const of = (text: string, n: number, cap: number): void => {
    const done = Math.min(cap, Math.max(0, n));
    out.push({ text, count: `${done} / ${cap}`, state: done >= cap ? "met" : "open" });
  };
  /** an ALLOWANCE: how much of it is spent, and it is broken one past the
   *  limit rather than at it — `leaks: 1` means one may go by. The spent
   *  side is NOT clamped: past the limit the overshoot is the news */
  const upTo = (text: string, spent: number, limit: number): void => {
    out.push({
      text,
      count: `${Math.max(0, spent)} / ${limit}`,
      state: spent > limit ? "failed" : "open",
    });
  };
  /** "3 Haulers", "1 Hauler" — the noun agrees, which it did not when this
   *  was written inline and printed "no more than 1 Haulers" */
  const many = (n: number, noun: string): string => `${n} ${noun}${n === 1 ? "" : "s"}`;

  if (mission.kind === "survive") {
    const left = Math.max(0, Math.ceil(state.timeLeft));
    out.push({
      text: `Survive ${mission.minutes} minutes`,
      count: `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")} left`,
      state: left <= 0 ? "met" : "open",
    });
  } else if (mission.kind === "intercept") {
    of(`Destroy ${many(mission.kills, WORM_NAME)}`, state.crossKilled, mission.kills);
    upTo(
      `Let no more than ${many(mission.leaks, WORM_NAME)} past you`,
      state.crossLeaked,
      mission.leaks,
    );
  } else if (mission.kind === "escort") {
    of(
      mission.deliver === 1
        ? `Get the ${CONVOY_NAME} to the far post`
        : `Deliver ${many(mission.deliver, CONVOY_NAME)}`,
      state.convoyDone,
      mission.deliver,
    );
    // ...AND `losses: 0` IS NOT A COUNTER. "0 / 0" is a fraction with
    // nothing to fill, and the requirement it is standing for is the
    // flattest sentence in the game: the one cart has to live
    if (mission.losses === 0)
      out.push({
        text: `Do not lose the ${CONVOY_NAME}`,
        count: "",
        state: state.convoyLost > 0 ? "failed" : "open",
      });
    else
      upTo(
        `Lose no more than ${many(mission.losses, CONVOY_NAME)}`,
        state.convoyLost,
        mission.losses,
      );
  } else if (mission.kind === "raze") {
    // ONE LINE, AND THE COUNT IS ALL OF IT. A siege has exactly one way to
    // be met and one way to be failed, and the second of those is the core
    // — which is already the last line of every mission. How many are
    // firing RIGHT NOW is the other thing a player wants off this panel and
    // it is deliberately NOT here: it is a fact about this second rather
    // than a requirement, and it goes in the commentary under the rule
    // (components/Animechs.tsx ObjectivePane) with the tide and the crossers
    // on the board.
    of(`Destroy ${many(razeGuns(mission), RAZE_NAME)}`, state.razeKilled, razeGuns(mission));
  } else {
    of(`Hold the line for ${target} waves`, state.wavesCleared, target);
  }
  out.push({ text: "Keep the core standing", count: "", state: "open" });
  return out;
}

export interface LevelSpec {
  /**
   * save key — the world's ordinal as a string, e.g. "2". It is NOT shown
   * anywhere: a world is identified to the player only by its name, so this
   * must stay stable even when a world is renamed, or saves break
   */
  id: string;
  /**
   * THE WORLD'S ONLY DISPLAY NAME — and it is named for the MISSION rather
   * than for the terrain, e.g. "Borer Intercept" and not "Coldline".
   *
   * It used to be the map's name, from back when a map WAS the assignment
   * and the mission was "clear the script" on all of them. It is not any
   * more (see Mission — the script is an engine that never runs out), and
   * a picker offering "Coldline" and "Thornway" was asking the player to
   * choose between two place names for two completely different games.
   * The terrain is still on the screen beside the name — the picker draws
   * the map's own thumbnail — so nothing is lost by the name being about
   * the thing the player is choosing.
   *
   * The shelved fifteen (PLAYABLE_WORLD_IDS) still carry terrain names:
   * every one of them is a hold on undressed ground, so there is no
   * mission yet to name them after. Naming one is part of finishing it.
   */
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
   * on the field at once. Nineteen seconds as authored (WAVE_GAP_DEFAULT):
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
   * THE OBJECTIVE BODIES' SHARE OF THE SIZE RAMP (ladder.ts
   * tierObjectiveHpScale): a wave's count is scaled to the tier, but a
   * mission puts down ONE body whatever the difficulty, so every
   * OBJECTIVE_KINDS body pays that share in HEALTH instead. Nothing else
   * on the roster reads this.
   *
   * Unset (the authored baseline) means 1. Set by specForTier().
   */
  objectiveHpScale?: number;
  /**
   * THE FAMILIES THIS RUN SENDS — the die roll (rollFamilies) the deploy
   * made, in the order the deal walks them: the script's first wave plays
   * in families[0], the next in families[1], and so on round the list,
   * every wave taking as many off it as the wave was authored wide
   * (transformScript). There is no fixed "families[2] is the air",
   * because the roles are re-let every wave.
   *
   * HOW MANY THERE ARE IS FAMILIES_PER_RUN, not the script's slot count:
   * the two are independent, and a list of any length plays any script.
   * Unset is the script as authored, which is what the editor and the
   * audit arithmetic price.
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
 * (see Sim.runScript), so congestion STRETCHES a wave and never swallows
 * one. The constant sets the pace where the map can keep up and gets out
 * of the way where it cannot.
 *
 * WHAT A STRETCHED WAVE NO LONGER DOES IS DELAY THE NEXT ONE. The waves
 * are on a clock (Sim.waveStartTime): wave n lands at its moment whatever
 * the doors are doing, and a wave that has outrun its drop zones simply
 * keeps releasing while the one behind it starts. So this number decides
 * how HARD a wave arrives, the level's gap decides how OFTEN, and neither
 * of them is a function of the board any more — which is what makes the
 * run the same length on a five-door map and a two-door one.
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
 * THE RUN'S CLOCK, as authored: FIFTY waves, one every 22.5 seconds. The
 * document (public/levels/campaign.json) sets the gap; this is what a
 * missing document or a missing field plays.
 *
 * NINETEEN IS A RUN LENGTH, not a feel. The cadence a run keeps is this
 * gap plus WAVE_RELEASE_SECONDS, and it is the schedule ITSELF rather
 * than an average — wave n lands at WAVE_GAP_OPENING + (n-1) x cadence
 * and nothing about the board can move it (Sim.waveStartTime). So the
 * script's own clock is 3 + 49 x 22.5 = 1,105s, and with the last wave's
 * walk and die on the end a mission comes in around twenty minutes, which
 * is the sitting one is meant to be.
 */
export const WAVE_GAP_DEFAULT = 19;

/** The OPENING gap only, in seconds: wave 1 is not made to wait a full
 *  cadence, because the first thing a run does is build and there is
 *  nothing to build against yet. */
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
 * under this id in public/levels — and then plays the last eleven of them
 * again, and again, heavier each time (Sim.loadStep). What makes one map
 * different from the next is its ground, its doors, the family roll the
 * deploy makes (rollFamilies) and, above all, its MISSION: the script is
 * pressure, and the mission is what the run is for. A world id passed to
 * levelDocOf is accepted and ignored, so an editor opened on any world
 * edits the campaign.
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
 * the map does paint — and the shared script is re-cast, a wave at a
 * time, into the families the deploy rolled (transformScript). The
 * identity (name, map,
 * mission) is this table's; no map carries rules of its own — all maps
 * are equal, and every mutator is in every roll.
 *
 * Every map is played at TEN RUNGS of difficulty (RUNGS in ladder.ts): a
 * rung changes the rules rolled and the XP paid, never the script — so
 * every number the audit prints about a map is true at every rung.
 *
 * Kills are the run's income: every dead body pays scrap off its own
 * health pool into the run (economy.ts). The save is paid for the MISSION:
 * meeting it banks the whole of MISSION_XP and a defeat banks a share for
 * the waves the board broke on the way down, with the rung multiplying
 * either (tierXpBonus in ladder.ts).
 *
 * Armour is flat, max(dmg - armor, 0.1 * dmg), so an ironhide3 (armour 9)
 * against a tacker (damage 9) hits the 10% floor and costs a tacker line ten
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
    // three SLOTS — ROLES, not families: "the line", "the support behind
    // it", "the third thing". A deploy rolls FAMILIES_PER_RUN of the
    // nine families and the deal re-lets the roles EVERY WAVE
    // (transformScript), so the counts travel to every map and the bodies
    // are whatever the die said.
    //
    // AUTHOR A WAVE'S WIDTH, NOT ITS FAMILIES. How many slots a wave
    // draws on is how many families it sends — one slot is ONE family
    // however many the run rolled, three slots is three — and the cap
    // (MAX_FAMILIES_PER_WAVE) is what stops a run of ten families from
    // turning every wave into mush. So a wave written in one slot is a
    // wave that will always read as one swarm, and a wave written in
    // three is the mixture. The slot COUNT is the design; which families
    // fill it is the run's.
    //
    // THE SLOT COUNT IS NOT THE RUN'S FAMILY COUNT. They used to have to
    // match; they do not any more. Add a fourth slot to widen the mixture
    // a wave may ask for, and raise FAMILIES_PER_RUN to put more faces in
    // the run — they are separate dials.
    //
    // EVERY RUNG PLAYS THIS WHOLE LIST. There is one run per map and ten
    // difficulties to play it at, and a rung only scales the counts
    // (COUNT_SCALE in ladder.ts) — no wave is ever cut. THE SCRIPT IS
    // FIFTY WAVES, 22.5 seconds apart on a clock nothing about the board
    // can move (Sim.waveStartTime), each stronger than the last: a few
    // dozen runts on wave 1, the first heavies by wave 10, waves in the
    // thousands by the end. The waves overlap — the gap is shorter than a
    // wave takes to walk the lane — so the field is a tide, not a series
    // of fights, and a wave the doors cannot pass in one go simply keeps
    // releasing while the next one lands.
    //
    // AND NO WAVE CLOSES IT. The boss used to: one Sovereign typed into
    // wave 50, the curtain on a run that was finished by clearing fifty
    // waves. Nothing is finished that way now, so it is an OBJECTIVE
    // instead (OBJECTIVE_KINDS) and a wave cannot send one at all.
    //
    // FIFTY IS THE DOCUMENT'S LENGTH AND NOT THE RUN'S. The script does
    // not end: past the fiftieth wave the last TIDE_CYCLE_WAVES go again,
    // one doubling of enemy health a cycle, forever (Sim.loadStep — the
    // tide, LEVELS_PER_DOUBLING in ladder.ts). So THE LAST ELEVEN WAVES
    // ARE THE ONES THAT GET PLAYED FOREVER — author that stretch as
    // something that stands repeating, because the endgame of every long
    // run is it.
    //
    //   line       T1        T2       T3         T4         T5
    //   ironhide1     ironhide1    ironhide2     ironhide3   ironhide4    ironhide5
    //   dartback1    dartback1   dartback2    dartback3    dartback4     dartback5
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
    // the tier-3 turrets (cleaver up to railhead) arrive on the bank the
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
    id: "7",
    name: "Shoals",
    map: "shoals",
    // THE ARCHIPELAGO: two thirds of the board is sea, every road between the sand islands is a bar of shallow the swarm wades, the hulls come from the north and south seas, the core on the west island behind one causeway
    mission: { kind: "hold" },
    waveGap: WAVE_GAP_DEFAULT,
    script: [],
  },
  // ================= THE MISSION SKETCHES =========================
  //
  // One world per archetype (docs/mission-design.md), each on a map the
  // graph editor drew. All eight play the campaign's own wave script like
  // every other world; what differs is what each ASKS on top of it.
  //
  // THREE OF THE EIGHT ARE BUILT. Coldline carries INTERCEPT THE CROSSER
  // — seven Borers on two roads, and a run that lets two past is over
  // (InterceptMission, game/missions.ts); Thornway carries ESCORT THE
  // CROSSER, which is the same shape turned round (EscortMission); and
  // Sear carries VENTURE AND DESTROY — ten railguns in four batteries
  // round the core, shooting it from where they stand (RazeMission).
  // The other five are still sketches and still play `hold`, so for now
  // what they are is the TERRAIN: boards that ask a run to spend in five
  // different shapes, waiting for the rule that spends it.
  //
  // NOTHING PLACES THEM ON THE TRACK, so worldUnlockLevel answers 1 and
  // all eight are open from the start (game/track.ts). That is on purpose
  // while they are being looked at rather than played through.
  {
    id: "10",
    name: "Railgun Siege",
    map: "sear",
    // VENTURE AND DESTROY — ten railguns in four batteries ringing the
    // core, and the third mission in the game (docs/mission-design.md).
    //
    // IT IS THE FIRST ONE THAT COMES TO YOU. Coldline's Borers ignore the
    // base and Thornway's hauler leaves it; both missions are about a
    // thing happening SOMEWHERE ELSE, and the base's own fight goes on
    // underneath them unchanged. A railgun does not ignore the base — it
    // is aimed at it, from a hundred and twenty tiles out, and it never
    // stops. So the question this board asks is the one the archetype
    // exists to ask and the other two cannot: how much of the line will
    // you take apart to go and kill something, and how long can you put
    // it off.
    //
    // WHY SEAR. The core stands hard against the east edge of the
    // caldera and every approach is from the west, so the batteries are
    // an ARC and not a ring — one due west, one out to the north-east
    // over the rim, and two on the long north-west and south-west
    // shoulders. The sea takes the south, which is the honest reading of
    // this board: there is no standing ground there, and a mission that
    // pretended otherwise would be putting an emplacement in the water.
    //
    // WHERE THEY STAND IS THE MAP'S (missionMarks.ts RAILGUN). The four
    // are placed in the map editor as marks on the document, along with
    // how many guns rise on each and which section it belongs to;
    // `sections` below is the fallback for a map that carries none, and
    // the clock is this spec's either way.
    //
    // THE DISTANCE IS THE COST. A battery stands out past the base's own
    // ground, so every gun that answers one is a gun that defends nothing
    // while it stands there — which is the archetype's entry fee.
    //
    // THE CLOCK. First battery at two minutes, then one every four:
    // 2:00, 6:00, 10:00, 14:00, and they do NOT wait for each other. One
    // emplacement, then two, then three, then four — so a board that is
    // keeping up always fights the newest section alone, and a board that
    // is not ends up under six or ten at once. Ten health a second each
    // against a 24,000 core (weapons.ts, the railgun row) is the whole
    // arithmetic, and it lands exactly: a run that answers nothing at all
    // is at zero core AT 14:00, the tick the fourth battery rises. Answer
    // each section as it comes and the siege costs about half the base.
    //
    // NOTHING STANDS OVER THEM. A battery is guns and the ground they are
    // on, and what the run has to beat to reach one is the wave that is
    // walking at the core while it goes. `guards` is still on the section
    // (RazeSection) for the day a mission wants to post a body, and the
    // shipped siege posts none.
    mission: {
      kind: "raze",
      first: 120,
      every: 240,
      // the fallback, for a raze map that places no railguns of its own:
      // four posts out of POST_SPECS with the guns rung round them
      sections: [
        { post: 0, guns: 1, guards: {} },
        { post: 1, guns: 2, guards: {} },
        { post: 2, guns: 3, guards: {} },
        { post: 3, guns: 4, guards: {} },
      ],
    },
    waveGap: WAVE_GAP_DEFAULT,
    script: [],
  },
  {
    id: "11",
    name: "Borer Intercept",
    map: "coldline",
    // INTERCEPT THE CROSSER — two convoy roads west to east with the core
    // on its own ground between them, and the first mission in the game
    // that is not the waves (docs/mission-design.md).
    //
    // WHAT IT COSTS. Neither road passes within a hundred cells of the
    // core, so every gun that shoots a Borer is a gun standing where it
    // defends nothing, paid for out of the same purse the defence comes
    // out of. The sale returns nothing either, so the whole difficulty of
    // this map is that one decision made five or six times.
    //
    // THE PATTERN IS THE DESIGN. Lower, upper, both, lower, both,
    // upper, both — ten Borers over seven launches, which is exactly the
    // ten the mission asks for, so a run that lets one through has spent
    // its allowance and the spare (lower, one launch later) is the only
    // way back to ten. Two through and it is over: there is no second
    // spare and the arithmetic says so before the player has to work it
    // out.
    //
    // ...AND EACH LAUNCH IS HEAVIER THAN THE LAST (wormRamp), by more
    // each time, on a board that has had more minutes of scrap to spend.
    // The whole pattern is also a share of the tier, like every objective
    // body. Compounding is what it takes to stay ahead of a board that is
    // itself compounding, and compounding faster is what it takes at the
    // end, where the board's own curve is steepest: a battery that
    // answered the first train is nowhere near the battery that answers
    // the seventh, which is what keeps the third repetition from being
    // the second one again.
    //
    // ...AND UNDER AN EVER-LARGER HAND OF PYLONS (mission.pylons), whose
    // POSITIONS are rolled from the spots drawn on the map. The last
    // train comes in under everything the board failed to pull down.
    //
    // THE CLOCK. First launch at 2:30, one every 3:20 after it, the last
    // of the pattern at 22:30. The spare has no moment of its own — it
    // goes the instant a leak is on the books (Sim.runCrossers), which on
    // a run that never leaks is never. A Borer is on the board for 4:16 to
    // 5:00 (WORM_SPEED) before a Goad touches it. The wave script
    // underneath all of that is the campaign's own and is tuned
    // separately.
    mission: {
      kind: "intercept",
      kills: 10,
      leaks: 1,
      first: 150,
      every: 200,
      // road 0 is the LOWER line and road 1 the UPPER (missionMarks.ts
      // ROAD, in map order). Ten trains over seven launches, which is
      // exactly the ten the mission asks for
      pattern: [[0], [1], [0, 1], [0], [0, 1], [1], [0, 1]],
      spare: [0],
      pylons: [
        { goad: 0, bastion: 0 },
        { goad: 1, bastion: 0 },
        { goad: 0, bastion: 1 },
        { goad: 1, bastion: 1 },
        { goad: 2, bastion: 1 },
        { goad: 2, bastion: 2 },
        { goad: 2, bastion: 3 },
        { goad: 2, bastion: 4 },
      ],
    },
    waveGap: WAVE_GAP_DEFAULT,
    script: [],
  },
  {
    id: "12",
    name: "Hauler Escort",
    map: "thornway",
    // ESCORT THE CROSSER — one road, a double S from the core in the
    // bottom-left corner to the post in the top-right, and the second
    // mission in the game (docs/mission-design.md).
    //
    // IT IS COLDLINE INSIDE OUT. There the road is the swarm's and the
    // board pays to reach it; here the road is YOURS and the board pays
    // to stay on it. The money goes to the same place either way — a
    // battery a long way from anything that defends the base — and the
    // difference is what happens when you get it wrong: a Borer
    // you failed to kill is a number on a panel, and a hauler you failed
    // to hold is gone.
    //
    // WHAT IT COSTS. The road is thirteen hundred cells long, so all but
    // the first tenth of it is a long way from anything that defends the
    // base. And the cart is only ever in ONE place, which is the thing
    // that makes this mission different to defend than a base: a battery
    // built for the third halt is dead weight for the first fourteen
    // minutes and the only thing that matters for the ninety seconds the
    // cart is standing in it.
    //
    // THE CLOCK. It is ON THE BOARD FROM THE FIRST FRAME (`first: 0`) and
    // the first thing it does is STAND STILL: the halt at 0 is the depot
    // it is loaded at, so the mission opens with the cart parked outside
    // the core for forty-five seconds rather than with ninety seconds of
    // empty road and then a spawn.
    //
    // THAT IS THE WHOLE REASON FOR IT. An escort is a thing the player is
    // asked to spend against, and until it exists there is nothing to
    // spend against — a cart that materialises at 1:30 is a cart whose
    // first leg is defended by whatever happened to be there. Parked at
    // the start it is a fact about the board the player can see, walk the
    // camera along, and price a battery against before it moves.
    //
    // Then it drives at 1.6 tiles a second (CONVOY_SPEED), so the driving
    // is fourteen minutes; five halts of forty-five seconds put the
    // arrival a little past seventeen. The four on the road are at 15,
    // 32, 55 and 79 per cent, each chosen to land in a clearing the
    // terrain already has — a stopped cart is the easiest target on the
    // board, and standing it in a corridor would be asking the player to
    // defend a place they cannot build in.
    //
    // ONE CART AND NO SPARE. `losses: 0` is the honest reading of an
    // escort: the thing either arrives or it does not, and a second
    // hauler sent after the first was destroyed would be the mission
    // saying the first one did not matter.
    mission: {
      kind: "escort",
      deliver: 1,
      losses: 0,
      first: 0,
      every: 300,
      pattern: [0],
      halts: [0, 0.15, 0.32, 0.55, 0.79],
      haltSeconds: CONVOY_HALT,
      mend: CONVOY_MEND,
    },
    waveGap: WAVE_GAP_DEFAULT,
    script: [],
  },
  {
    id: "13",
    name: "Spore Ring",
    map: "sporering",
    // HOLD REMOTE GROUND — the core dead centre, six arcs in, three of them worth owning
    mission: { kind: "hold" },
    waveGap: WAVE_GAP_DEFAULT,
    script: [],
  },
  {
    id: "14",
    name: "Twin Shale",
    map: "twinshale",
    // PROTECT THE SECOND THING — two arms off a southern stem, split by a river only the hulls cross
    mission: { kind: "hold" },
    waveGap: WAVE_GAP_DEFAULT,
    script: [],
  },
  {
    id: "15",
    name: "Whitepeak",
    map: "whitepeak",
    // RACE THE ENEMY — the open board, almost no chokes, every position bought rather than found
    mission: { kind: "hold" },
    waveGap: WAVE_GAP_DEFAULT,
    script: [],
  },
  {
    id: "16",
    name: "Emberdeep",
    map: "emberdeep",
    // STOP THE RITUAL — the other end of the dial, a branching tunnel system to an arena at the far end
    mission: { kind: "hold" },
    waveGap: WAVE_GAP_DEFAULT,
    script: [],
  },
  {
    id: "17",
    name: "Saltmouth",
    map: "saltmouth",
    // PICK ONE — two peninsulas either side of an estuary, and nothing reaches both
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

/**
 * THE WORLDS THAT ARE IN THE GAME TODAY, and the whole of how a board
 * gets on or off the menu: name it here. A world NOT on this list keeps
 * everything — its entry, its map, its document, its place in the admin
 * editor and the save editor — it is simply never OFFERED: not a row in
 * the map picker, not in Random's hat, not a reward on the progress
 * screen, and not a pick a stale save may restore. It is the
 * SHELVED_FAMILIES of the map table, and for the same reason: a board
 * that is not ready to be met should not be met, and deleting it to say
 * so loses the work.
 *
 * It is not a lock. A lock is the track saying "not yet, come back at
 * level 8" (worldLock, progress.ts) and it is printed as a promise; this
 * is the map not being in the game today.
 *
 * IT IS A LIST OF WHAT IS IN RATHER THAN OF WHAT IS OUT, and it was the
 * other way round until the shelf got longer than the game. Seventeen
 * boards are drawn and THREE are in the game: the three that carry a
 * built mission — Coldline's intercept, Thornway's escort and Crater's
 * siege (docs/mission-design.md). Everything else is terrain with a hold
 * mission on it and no reason yet to be played, so naming the fourteen
 * would be writing the catalog down twice and forgetting one of them the
 * next time a board lands.
 *
 * CONFLUENCE CAME OFF THE LIST with the rest of the holds. It is still the
 * board the campaign's numbers are tuned against, still world 1, still
 * what the menu backdrop is drawn from, and still constructed by
 * scripts/check.mjs — what it is not is a MISSION. Its assignment is
 * "clear the script", and the script does not run out any more (see
 * Mission and the tide): so it is a map that can only be played until the
 * player gets bored, offered in a picker that now names each row after the
 * thing it asks for. It comes back the day it is given one.
 */
export const PLAYABLE_WORLD_IDS: readonly string[] = ["10", "11", "12"];

/** is this world off the menu? — everything the list above does not name */
export const worldHidden = (id: string): boolean => !PLAYABLE_WORLD_IDS.includes(id);

/**
 * The worlds a player may be offered — the table, less the hidden ones.
 * The SAME OBJECTS as WORLDS holds, never copies, because a level
 * document is overlaid onto its entry IN PLACE (applyLevelDoc below): a
 * copy here would be a second world that never gets its script.
 */
export const VISIBLE_WORLDS: LevelSpec[] = WORLDS.filter((w) => !worldHidden(w.id));

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
