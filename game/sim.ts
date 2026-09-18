// THE ARRAYS THE DRAWING SIDE READS are allocated where both threads can
// reach them (shared.ts). Everything else in here stays the sim's own and
// is allocated the ordinary way — sharing what nobody outside reads would
// be memory handed over for nothing.
import * as shared from "./shared";
import {
  HEADER_LEN,
  NWORK,
  STEP_BUDGET_MS,
  type PhaseRead,
  type ProfileCensus,
  type ProfileRead,
} from "./simreport";
// the placement rule lives over grids so that the drawing side can ask it
// too, without waiting on this thread (board.ts)
import {
  canMoveOn,
  canPlaceOn,
  domesClear,
  groundClear,
  paintPower,
  powerDiscsOf,
  rulerCells,
  waterloggedUnder,
  type BoardGrids,
} from "./board";
import {
  HC,
  HCOLS,
  HN,
  HROWS,
  CORE_HP,
  MAX_BEACONS,
  INF,
  MOVE_LAYERS,
  NAVAL_LAND_SPEED,
  NAVAL_WATER_SPEED,
  NCELLS,
  type MoveLayer,
  FIRE_DPS_PER_STACK as FIRE_DPS_IMPORT,
  FIRE_MAX_STACKS,
  FIRE_SECONDS,
  FIRE_SPREAD_CHANCE,
  FIRE_SPREAD_GAP,
  FIRE_SPREAD_STRIDE,
  POISON_SECONDS,
  BURN_FX_CHANCE as BURN_FX_CHANCE_IMPORT,
  AURA_LINGER,
  DAMAGE_SMOKE_BELOW,
  DAMAGE_SMOKE_LIFE,
  DAMAGE_SMOKE_RATE,
  POISON_DECAY,
  POISON_FX_LIFE,
  POISON_FX_RATE,
  POISON_TIME,
  SHORT_FX_LIFE,
  SHORT_FX_RATE,
  FX_UNIT_SPAWN,
  SPAWN_INVINCIBLE as SPAWN_INVINCIBLE_IMPORT,
  SPAWN_UNMOVING as SPAWN_UNMOVING_IMPORT,
  CELL as CELL_IMPORT,
  clamp as clamp_IMPORT,
  COLS as COLS_IMPORT,
  FX_LIFE as FX_LIFE_IMPORT,
  WET_FX_CHANCE as WET_FX_CHANCE_IMPORT,
  H as H_IMPORT,
  MAX_UNITS,
  MERGE_HOLD,
  MERGE_MAX_STACK,
  MERGE_SQUEEZE,
  GRAPNEL_MERGE_PERIOD,
  GRAPNEL_MERGE_REACH,
  TOWER_BURN_FX_LIFE,
  TOWER_BURN_FX_RATE,
  TOWER_BURN_TIME,
  PAL,
  TEAM_CRUX_RGB,
  ROWS as ROWS_IMPORT,
  TOWERS as TOWERS_IMPORT,
  TOWER_HP_SCALE,
  WET_SHOCK_MUL,
  firesBullets,
  towerMaxHp,
  UR,
  W as W_IMPORT,
  WALL_R as WALL_R_IMPORT,
  type BulletFx,
  type BulletStats,
  type TowerStats,
  structStats,
} from "./constants";

// Module-local bindings for everything the per-unit and per-bullet loops
// read. An imported binding compiles to a GETTER call on the module record
// under CommonJS interop (the dev server, node-side tools) to keep the
// binding live — and the loops below read these tens of thousands of times
// a tick, which made the getters one of the largest line items in a CPU
// profile. A module-local const is a plain read everywhere. The values are
// constants, so nothing is lost.
const FIRE_DPS_PER_STACK = FIRE_DPS_IMPORT;
const BURN_FX_CHANCE = BURN_FX_CHANCE_IMPORT;
const WET_FX_CHANCE = WET_FX_CHANCE_IMPORT;
const SPAWN_INVINCIBLE = SPAWN_INVINCIBLE_IMPORT;
const SPAWN_UNMOVING = SPAWN_UNMOVING_IMPORT;
const CELL = CELL_IMPORT;
const clamp = clamp_IMPORT;
const COLS = COLS_IMPORT;
const FX_LIFE = FX_LIFE_IMPORT;
const H = H_IMPORT;
const ROWS = ROWS_IMPORT;
const TOWERS = TOWERS_IMPORT;
const W = W_IMPORT;
const WALL_R = WALL_R_IMPORT;
import { FlowField, type Footprint, type Vec2 } from "./flowfield";
import { makeFieldPort, type FieldLink, type FieldPort } from "./fieldport";
import {
  buildHash,
  runPhysics,
  PHYS_R,
  SPREAD_CLEAR,
  type PhysIn,
  type PhysOut,
  type PhysScratch,
  type PhysTables,
} from "./physkernel";
import { makePhysPort, type PhysLink, type PhysPort } from "./physport";
// the clock's own two constants: a step's length, and the most wall time
// one frame may bank. Both are read by the profiler (profLiveMs)
import { DT_CAP, SIM_DT } from "./simclock";
import {
  HB_A,
  HB_B,
  HB_HEAVY,
  HB_MEAN,
  HB_OUTER,
  HB_OVAL,
  HB_RMAX,
} from "./hitbox";
import {
  WORLDS,
  missionProgress,
  missionTarget,
  razeGuns,
  razeWave,
  type RazeSection,
  unitName,
  BASTION_CUT,
  GOAD_SPEED_MUL,
  pylonRamp,
  pylonsDue,
  UNIT_ID,
  UNIT_KINDS as UNIT_KINDS_IMPORT,
  UNIT_STATS,
  waveGroups,
  WAVE_GAP_OPENING,
  WAVE_RELEASE_SECONDS,
  wormRamp,
  CONVOY_ARMOR,
  CONVOY_BASE_KIND,
  CONVOY_HP,
  CONVOY_NAME,
  CONVOY_SIZE,
  CONVOY_SPEED,
  WORM_CHAIN,
  WORM_NAME,
  WORM_LENGTH,
  WORM_SPACING,
  type LegSpec,
  type SegmentSpec,
  type LevelSpec,
  type UnitKind,
  waveSpawnRate,
} from "./levels";

/** module-local for the same getter reason as the constants block above */
const UNIT_KINDS = UNIT_KINDS_IMPORT;
import { LEVELS_PER_DOUBLING, unitHpOnRung } from "./ladder";

/**
 * THE TIDE — WHAT MAKES THE SCRIPT INFINITE, and the reason no map is
 * finished by outlasting its waves any more (levels.ts Mission).
 *
 * A script is a finite document: fifty waves, and then nothing. That was
 * the whole game while clearing it WAS the assignment. It is not any more
 * — a mission is an objective beside the waves (docs/mission-design.md) —
 * so the script had to stop being able to run out underneath one. When the
 * cursor reaches the end and the mission is still open, THE LAST
 * TIDE_CYCLE_WAVES GO AGAIN, at TIDE_LEVELS more enemy level than the
 * cycle before: waves 40 to 50 of a fifty-wave script, then 40 to 50 at
 * double health, then at quadruple, then at eight times, with no ceiling.
 *
 * ELEVEN WAVES, NOT ONE. The tail of a script is its shape — a lull, a
 * spike, a boss — and a finale sent on a loop is a metronome. Replaying
 * the last stretch keeps the rhythm the author wrote, so the climb reads
 * as the same fight getting heavier rather than as a different game.
 *
 * ONE DOUBLING A CYCLE (LEVELS_PER_DOUBLING) because the step has to be
 * felt. Three levels — about +19% — was the old survive-only ramp, and a
 * board that had beaten a wave outright beat it nineteen percent heavier
 * too; the climb only became a climb after half a dozen cycles nobody sat
 * through. Doubling means the SECOND cycle is already a different question
 * and the fourth is a wall, which is what an endless mode owes a player
 * who is there to find their ceiling.
 *
 * A LEVEL IS HEALTH AND NOTHING ELSE (ladder.ts unitHpAtLevel) — same
 * speed, same armour, same drop, same silhouette. The swarm that comes
 * back is the swarm that was just beaten, and the only thing that has
 * changed is how long it takes to kill.
 */
const TIDE_LEVELS = LEVELS_PER_DOUBLING;
const TIDE_CYCLE_WAVES = 11;
import {
  ARMORED_ARMOR,
  ARMORED_MAX_TIER,
  hasMutation,
  mutationsInForce,
  OVERSHIELD_SCALE,
  HUNGRY_CHANCE,
  HUNGRY_DMG_PER_MEAL,
  HUNGRY_HP_PER_MEAL,
  HUNGRY_MAX_MEALS,
  HUNGRY_PERIOD,
  HUNGRY_REACH,
  SHIELD_TOWER_BODY_R,
  SHIELD_TOWER_DOME_R,
  SHIELD_TOWER_HP,
  SHIELD_TOWER_MAX_ALIVE,
  SHIELD_TOWER_MEGA_DOME_R,
  SHIELD_TOWER_MEGA_WAVE,
  SHIELD_TOWER_SHIELD,
  SHIELD_TOWER_SHIELD_DELAY,
  SHIELD_TOWER_SIZE,
  SHIELD_TOWER_SPAWN_PERIOD,
  shieldTowerWaveScale,
  AMPHIBIOUS_ARMOR,
  AMPHIBIOUS_HP,
  AMPHIBIOUS_MAX_STACKS,
  AMPHIBIOUS_REGEN,
  AMPHIBIOUS_SPEED,
  HYDROPHOBIC_RANGE,
  HYDROPHOBIC_RATE,
  CONQUEST_HP,
  CONQUEST_RATE,
  LEADERSHIP_CAP,
  LEADERSHIP_LINGER,
  LEADERSHIP_PERIOD,
  LEADERSHIP_TILES,
  MITOSIS_BROOD,
  MITOSIS_SPREAD,
  MITOSIS_TRIES,
  RECONSTRUCT_DELAY,
  RECONSTRUCT_GRACE,
  VIRUS_CHANCE,
  VIRUS_DPS,
  VIRUS_JUMP_TILES,
  SPEEDY_SPEED,
  VOLATILE_DMG,
  VOLATILE_RADIUS,
} from "./mutation";
import { loadMap, OFFICIAL_MAPS, terrainFromMap } from "./maps";
import { markKind } from "./missionMarks";
import {
  garrisonsFor, levelWithMarks, postProblems, postsFor, roadAt, roadProblems, roadsFor,
  siegeFromMarks, type MarkGarrison, type MarkSiege, type Post, type Road,
} from "./missions";
import { NO_UPGRADES, skilledTower, upgradedTower, type TechState } from "./tech";

import { countSensitive } from "./upgrades";
import {
  applyTurretMods,
  modBit,
  modRegen,
  rollSolo,
  sizeWithMods,
  MODS,
  rollTurretMods,
  type ModId,
} from "./mods";
import {
  applyRelics,
  CASCADE_CHAIN_CAP,
  CASCADE_FRACTION,
  CASCADE_MIN_TIER,
  CASCADE_TILES,
  dropScale,
  INSURANCE_SCRAP,
  LAST_VOLLEY_RATE,
  LAST_VOLLEY_SECONDS,
  LAST_VOLLEY_TILES,
  PHOENIX_CHANCE,
  RELICS,
  TERMINAL_FRACTION,
  TITAN_MUL,
  type RelicId,
  type RelicsHeld,
} from "./relics";
import { coreIncomeRate, RICH_SCRAP, SCRAP_START, sellValue } from "./economy";
import { airWalkMask, isWaterFloor, navalWalkMask, type Terrain } from "./terrain";
import {
  BOMBLET_LOOK,
  MAX_WEAPONS,
  NUKE_LOOK,
  GRAPNEL_STARS,
  unitDamageScale,
  UNIT_REACH,
  UNIT_WEAPONS,
  EXPLOSION_STYLES,
  TOWER_LASER_STYLE,
  type StarSpec,
  type UnitWeapon,
} from "./weapons";
import { Projs, TOWER_KIND_ID, PROJ_FRAG, PROJ_ALT, PROJ_ENEMY, PROJ_BARE } from "./projs";
import {
  FxKind,
  TOWER_KINDS,
  type RGB,
  type Core,
  isCore,
  type Structure,
  type Tower,
  type TowerKind,
  type Team,
  teamOf,
  type EnemyShot,
} from "./types";

/** px per Mindustry world unit — the ported turret geometry is in those */
const MU = CELL / 8;
/** how close a bomber has to be to what it dives at before it goes off
 *  (levels.ts payload): two world units past touching, so a body hovering
 *  at the core's rim (updateUnits) is in contact with it */
const CONTACT_REACH = 8 * MU;

/**
 * An effect kind's Mindustry lifetime in seconds: FX_LIFE for the bullet
 * effects the turrets share, and the swarm's own kinds spelled out here
 * (Fx.<name>'s first argument, in ticks)
 */
const UNIT_FX_LIFE: Partial<Record<FxKind, number>> = {
  [FxKind.HitLaser]: 8 / 60,
  [FxKind.ShootHeal]: 8 / 60,
  [FxKind.ShootBig2]: 10 / 60,
  [FxKind.HitEmpSpark]: 40 / 60,
  [FxKind.SapExplosion]: 25 / 60,
  [FxKind.MassiveExplosion]: 30 / 60,
  [FxKind.Pulverize]: 40 / 60,
};
/** a buff tower's footprint in cells (missionMarks.ts) — the one number
 *  the sim needs off the registry, to put a body at the middle of the
 *  square an author placed */
const MARK_TOWER_SIZE = markKind("buffTower")?.size ?? 4;

const fxLife = (kind: FxKind): number =>
  (FX_LIFE as Partial<Record<FxKind, number>>)[kind] ?? UNIT_FX_LIFE[kind] ?? 20 / 60;
/** ExplosionEffect lifetimes by style (EXPLOSION_STYLES) */
const EXPLOSION_LIFE: readonly number[] = EXPLOSION_STYLES.map((e) => e.lifetime);

/**
 * How many effects may be alive at once, shared by everything that throws
 * one. A push past it is DROPPED — and it is the newest that go, so a board
 * over budget loses the flash of the shot being fired while stale puffs
 * linger. The one exception: effects that ARE a weapon — a hitscan shot's
 * only visible artifact — push past the cap (see pushFx's `force`), so a
 * saturated screen can no longer make a firing cleaver look like a stalled
 * one.
 *
 * Measured, uncapped, on a 160-turret map with 3,200 units walking into it:
 * demand runs at ~730 and spikes to ~1,800 for the instant the crowd
 * arrives. 1,400 is a shade under twice the sustained figure, so it clears
 * every steady-state peak and clips only that one arrival spike — the one
 * moment the screen is too full to tell. It has to be this much higher than
 * the 400 it was: the muzzle flash, powder and hit spark every turret now
 * throws on every shot roughly doubled the standing demand.
 */
const FX_CAP = 1400;
/**
 * THE WEAPON LANE. A forced effect (pushFx `force`) is a weapon's one
 * visible artifact — the harpoon's line, the lance's beam, the round's
 * muzzle splash — and goes past FX_CAP so that a firing body and a stalled
 * one never look the same, on exactly the wave where the ambient pool is
 * full. It is not unbounded: this many slots above the cap, and then the
 * weapons queue like everything else. Bounded by body count x fire rate x
 * a few tenths of a second of life, a ten-thousand-body wave's worth of
 * lines is a couple of thousand quads, which the draw does not feel.
 */
const FX_WEAPON_CAP = 3000;
/** the most links a chain-lightning path is built from (chainFx) */
const CHAIN_LINKS_MAX = 64;
/** seconds a homing shot holds its quarry before it searches for a nearer
 *  one — six ticks (updateProjectiles) */
const HOMING_REPICK = 6 / 60;
/** the hit list, highest body index first, so swap-removes below never
 *  disturb a removal still pending above (updateProjectiles) */
const PROJ_DESC = (a: number, b: number): number => b - a;
/** an ammo's shape as bits, one byte a table slot (updateProjectiles) */
const BF_HOMING = 1, BF_PUFF = 2, BF_TRAIL = 4, BF_FLAK = 8, BF_ARTILLERY = 16, BF_SPLASH = 32, BF_FRAG = 64,
  BF_CLOUD = 128;
/**
 * Footfall dust gets 140 of those and no more — a fixed slice, not a share,
 * so raising the budget above buys room for shots rather than for grit. It
 * is ambience, and it is PERIODIC: every legged unit on the field throws a
 * puff per planted foot, several times a second each, so left on the shared
 * budget a wave of walkers would push every hit, death and blast out of the
 * buffer.
 */
const FX_DUST_CAP = 140;
/**
 * The pool's HARD size — what the struct-of-arrays effect storage below is
 * allocated at, and the one ceiling even a `force` push cannot pass. It is
 * deliberately far above FX_CAP: forced pushes are bounded by turret count
 * times fire rate (tens over the cap, not thousands), so in any reachable
 * game state this never clips — it exists so the arrays have a size.
 */
const FX_MAX = 8192;
/**
 * How long the FALLBACK MUZZLE FLASH burns (Tower.flashT, and the tower
 * pass in the renderer that draws it). Eight ticks — Fx.shootSmall's own
 * lifetime, since that is the effect it is standing in for — so a turret
 * whose muzzle effect the pool refused flickers at exactly the rate it
 * would have flickered with the budget to spare.
 */
export const MUZZLE_FLASH_LIFE = 8 / 60;
/** seconds a death ring lives — the puff a body leaves wherever it went */
const FX_DEATH = 0.35;
/** what a DEVOURED body's ring is drawn in (see feedHungry) — the hungry
 *  hue, so a meal never reads as a kill the player's towers scored */
const HUNGRY_FX_COL: RGB = [1, 0.35, 0.72];
/**
 * HOW FINELY A ROUND'S STEP IS SAMPLED against the buildings (sweepShot):
 * half a cell, which is the coarsest spacing that cannot step over a 1x1
 * footprint. A round slower than this a tick — every round in the game but
 * the Grapnels' stars — costs exactly the one cell read it always did.
 */
const SHOT_SWEEP = CELL_IMPORT / 2;
/** the ring drawn when two squeezed bodies fold into one (mergeSqueezed):
 *  amber, so a fold never reads as a kill and never as a meal */
const MERGE_FX_COL: RGB = [1, 0.8, 0.4];

// --- Mindustry unit physics (async/PhysicsProcess.java) ---
// every unit is a circle of radius hitSize * unitCollisionRadiusScale
// (0.6); our urad stores hitSize/2 in px, so the factor doubles to 1.2.
// Note the physics circle is BIGGER than the hitbox — crowds keep a
// sliver of daylight between sprites, exactly like the original
// (PHYS_R, PHYS_SCL, PUSH_LONG, PUSH_SIDE and SPREAD_CLEAR live in
// physkernel.ts now, beside the pair loop that reads them)
/**
 * THE THINKING IS SLICED. A body's steering decision — the field sample,
 * the wall probes, the drift, the lane centering, the doorway jitter — is
 * taken once every THINK_STRIDE ticks (staggered by index, so a quarter of
 * the swarm thinks each tick) or the tick it enters a new cell, whichever
 * comes first, and reused in between. The MOVE is every tick: velocity,
 * the wall slide, the clamp to the board, the turn toward the cached aim.
 * The velocity relaxes toward the decision at ~8Hz anyway (updateUnits
 * `steer`), so a decision a few ticks old is under the smoothing; the
 * cell trigger is what keeps a fast body's corners fresh.
 */
const THINK_STRIDE = 4;
// PhysicsWorld.scl, "how much to soften movement by": each overlapping
// pair moves only 1/1.25 of the way apart per tick, split by mass
/**
 * Spatial hash cell size (px); rebuilt every frame with a counting sort.
 *
 * Every query spans as many cells as its own reach needs (kindSpan and
 * the dynamic spans in updateAliveBounds), so correctness does not ride
 * on this number at all — only cost does, and it pulls two ways. A big
 * cell makes broad queries (a turret's range circle) touch few buckets
 * but stuffs each one with far-away units; a small cell trims the
 * candidate set toward what is actually in reach but walks more buckets.
 *
 * This used to be the smallest kindSpan reach (~83px), which is sized
 * by the widest unit on the ROSTER's layer: an ironhide1 checking neighbours
 * within ~30px swept a 250px window for them, and in a thousand-ironhide1
 * crowd the physics pass was mostly distance tests that could never hit.
 * 32px (1.6 cells) puts the common span at 96px instead; the rare wide
 * units simply take a larger span, which is what the span machinery is
 * for. Must divide W and H evenly (5120 and 3840 both are 32 * k).
 */
/**
 * How far a body of this kind has to look, IN BUCKETS, to find something
 * it might be touching: its own physics radius plus the widest outer
 * radius on its own layer, since ground and air pass straight through one
 * another. That layer split is what keeps the stoop5's 7.25-block hull —
 * nearly twice the ironhide5, the widest thing that walks — off the ground
 * swarm's bill entirely.
 *
 * This ROSTER-sized bound serves only the spawn-spot test, which runs a
 * handful of times a tick; the physics pass takes the tighter per-tick
 * spans updateAliveBounds derives from what is actually on the field. It
 * is computed per call rather than tabled at import because a shape can
 * be bent after this module loads (hitbox.ts).
 */
const kindSpan = (id: number, fly: boolean): number =>
  Math.ceil(((HB_OUTER[id] + (fly ? HB_RMAX.air : HB_RMAX.ground)) * PHYS_R) / HC);
// NOTE: a bullet's broad-phase span (how many buckets it looks through for
// what it flew into) used to be fixed per tower kind off the roster's
// widest hitbox. It is now derived per tick from the widest hitbox ALIVE
// on the bullet's layers — see updateAliveBounds and updateProjectiles.
/**
 * Mindustry BaseTurret.targetInterval, 20 ticks: how long a turret keeps
 * the target it picked before looking for a better one. Stock Mindustry
 * re-picks ONLY on this clock — a turret whose victim died coasts out the
 * rest of the interval doing nothing. Here a target that stops being valid
 * (died, left range) re-picks immediately instead, so the port's kill
 * throughput against a swarm stays what it was when it re-picked every
 * tick; the interval only governs how long a still-valid target is kept.
 */
const TARGET_INTERVAL = 20 / 60;

// narrow-passage centering gain (1/s): in 1-wide corridors and L-bend
// corners, steer toward the cell centerline so units line up with the
// slim (CELL - 2*WALL_R)px window instead of scraping the jambs
const CENTER_K = 25;


// ...but only where a unit has somewhere to step aside: this much
// clearance (FlowField.clear, in cells) or the shove stays as Mindustry
// wrote it, so a 1-wide slot still resolves a rear-ender by backing off
// 2. Lateral drift: every WALKER carries a bias in [-1, 1] and walks that
//    fraction of its speed across the flow. LAT_RELAX sets how fast the
//    bias decorrelates (1/s — its reciprocal is the correlation time, and
//    it must be seconds, not frames, or the walk averages out to nothing);
//    LAT_SIGMA is the stationary spread the re-roll is normalised to hold
//
//    Both of the first two were raised once the field started keeping the
//    crowd off the rock, and they answer different halves of the same ask.
//    LAT_FRAC is HOW FAR off the line a unit is willing to walk. LAT_RELAX
//    is HOW LONG it stays committed to being off it — 0.35/s is a ~3-second
//    correlation time against the ~1.7 it used to be, which is the
//    difference between a unit wobbling around the ideal heading and one
//    that actually commits to the left-hand way round something and takes
//    it. That commitment is the whole of "accept a route that is not the
//    best one": a bias that decorrelates faster than a fork takes to walk
//    can never carry anybody down the other branch.
//
//    Neither could have been raised before. Drifting this wide off a line
//    that already ran along the rock just pressed units into it; drifting
//    this wide off a line down the middle of a lane is the lane getting used
const LAT_FRAC = 0.68;
const LAT_RELAX = 0.35;
const LAT_SIGMA = 0.62;
// no drift where there is no room for it, ramping in over a cell of
// clearance above SPREAD_CLEAR
const LAT_ROOM_K = 1 / 1.1;
// 3. Lane centering: ride the clearance gradient back toward the middle of
//    the corridor, so the band the first two forces spread stays centred on
//    the route rather than smearing along the rock. Only the component
//    across the flow is used — this never brakes or hurries the advance —
//    and it fades out past CENTER_CLEAR cells from the nearest wall
//
//    THE GAIN IS DOWN FROM 18, because this force is no longer the only
//    thing holding the crowd off the rock and a second full-strength pull
//    toward the same middle does not centre twice as well — it narrows.
//    Stacked on the field's verge charge it squeezed the band onto the
//    centre LINE, which trades a queue along the wall for a queue down the
//    middle and is the same bug wearing the other hat. What is left is a
//    corrective on top of a field that is already right: enough to keep the
//    spread from smearing, not enough to undo it
const CENTER_CLEAR = 3.2;
const CENTER_GAIN = 8;

// TRAVEL THAT COUNTS AS TRAVEL, as a fraction of the stride a unit's own
// speed makes in a tick: below this, a frame's movement is not a heading
// (a drive bleeding off, a neighbour leaning on someone) and neither the
// body, the chassis nor the legs take a bearing from it. Without it a
// standing unit re-aims every frame at whatever fraction of a pixel it
// last drifted, which reads as a shiver
const TURN_DEAD = 0.03;

export type PlaceResult = "ok" | "invalid" | "would-seal";

/**
 * HOW LONG THE BOARD MUST HOLD STILL before a dirtied flow field is
 * re-solved, in seconds. A solve is ~100ms of main thread on a 512x512
 * map, and a build drag lays a turret EVERY FRAME: solving per frame is
 * one solve per placement and the frame rate falls to the solve rate.
 * Waiting out a short quiet spell instead collapses a whole drag — and a
 * whole saved layout, and the deploy screen's prewarm — into one solve.
 */
const FIELD_SETTLE = 0.15;
/**
 * ...and the longest a pending re-solve may be put off however busy the
 * board stays, so a drag held down for ten seconds still re-routes the
 * swarm about once a second rather than only when the finger comes up.
 */
const FIELD_MAX_STALE = 1;
/**
 * WHAT A RE-ROUTE COSTS A FRAME, in milliseconds — WHEN IT IS SOLVED ON
 * THIS THREAD. The solve itself is sliced (FlowField.advance) and this is
 * the size of the slice: the whole of what building a turret takes out of
 * a frame, whatever is queued behind it. Three milliseconds leaves a 60fps
 * frame the other thirteen.
 *
 * In the game the solve runs on a thread of its own (fieldport.ts) and
 * this is not paid at all: on a late board the queue never emptied and
 * the slice was the third-largest phase of every step. The slices remain
 * for the headless tools (no Worker in node) and as the fallback if the
 * worker fails.
 */
const FIELD_BUDGET_MS = 3;
/**
 * ...AND WHAT IT COSTS A HEADLESS RUN, which must be a different question.
 *
 * A wall-clock budget is right for a game — a re-route takes three
 * milliseconds of a frame and the swarm steers by the last finished field
 * until the new one is whole. It is WRONG FOR A MEASUREMENT: how much of
 * the field is solved per tick then depends on how fast the machine is and
 * what else it is running, so the same script on the same seed routes the
 * swarm differently on a loaded box than on an idle one, and a faster sim
 * is a HARDER sim. Two playtests of the same build came back at wave 15 and
 * wave 50 for exactly that reason.
 *
 * Sim.setFieldBudget(Infinity) is what the playtest sets: every queued
 * solve finishes in the tick that queued it, so a run is reproducible and
 * comparable to another run on another machine. The shipped game never
 * sets it and keeps the slice.
 */

/**
 * WHAT IS LEFT AFTER EASING FOR A WHILE — Mindustry's Mathf.lerpDelta with
 * its alpha compounded over a frame. `keep` is the share of the gap a value
 * holds on to per 1/60s tick, and this is what it holds on to over `ticks`
 * of them.
 *
 * THE FAST PATH IS THE ONLY PATH THE GAME EVER TAKES. Game.frame steps the
 * sim in SIM_DT quanta and in nothing else, so `ticks` is exactly one on
 * every frame of every run — and a thing raised to the first power is
 * itself, which the exponentiation has no way to know. It is worth the
 * compare because this shape is everywhere a value eases toward another:
 * the leg solver alone asks for it five thousand times a step, the drag on
 * every body once more, and Math.pow is some fifty times the cost of a
 * branch that is always taken.
 *
 * The identity is EXACT and not merely close — `Math.pow(x, 1)` is x to the
 * bit — so a tick-sized step comes out where it always did.
 */
const keepOver = (keep: number, ticks: number): number =>
  ticks === 1 ? keep : Math.pow(keep, ticks);

/** ...and the smallest slice worth entering the solver for */
const FIELD_MIN_SLICE = 0.25;
/** the clock the slices are measured by */
const nowMs = () => performance.now();

/**
 * HOW BIG A BODY IS TO THE CURSOR — the hit circle a click tests against,
 * which is deliberately larger than the sprite. A unit is small, moving,
 * and usually in a crowd; asking the hand to land inside twelve pixels of
 * walking metal is a tax on every order the player gives.
 *
 * Two sizes, because leniency must never cost precision: the TIGHT circle
 * is what a click means when it lands on a body, and it is tried first so
 * a turret clicked on purpose still wins over a walker standing beside it.
 * The LENIENT circle is the second pass, taken only once nothing at all
 * was hit dead on — a near miss on empty ground is a miss the player did
 * not mean, so it is read as the nearest body rather than as "deselect".
 */
const PICK_MULT = 2.0;
/** ...with a floor in world px, so the smallest bodies are a cell across */
const PICK_MIN = CELL;
/** the reach of the first pass: the body as the click sees it */
export const PICK_TIGHT = 1;
/** ...and of the second, once the board has said nothing was under the point */
export const PICK_LENIENT = 1.6;
/**
 * ...and how far past a building's own footprint a click still counts as
 * that building, in world px. The same idea as the circle above and a
 * smaller number, because a footprint is already a big target: this is
 * only the pixel or two of slop that keeps a click on the very edge of a
 * wall from reading as the ground behind it.
 */
export const PICK_STRUCT_PAD = CELL * 0.5;
/** how far from a gathering click "everything like it" reaches (Sim.click) */
export const SEL_LIKE_STRUCT_R = CELL * 40;


/** how many buildings one ruler line may lay down (rulerCells) */

/**
 * WHAT A UNIT'S WEAPON IS AIMED AT: one of the other side's structures,
 * or one of its bodies — the nearer of the two within reach. x, y and
 * half are the target's centre and half-width for every reader that
 * only wants a point to shoot at; `s` and `u` (a unit's never-reused id,
 * with `ui` the last known index) say which it is, and are what the
 * damage lands on (Sim.aimHit).
 */
export interface Aim {
  x: number;
  y: number;
  half: number;
  s: Structure;
}

// is a unit kind (by numeric id) airborne? towers and bullets check this
// against their targetAir/targetGround and collidesAir/collidesGround flags
const KIND_FLYING: readonly boolean[] = UNIT_KINDS.map((k) => !!UNIT_STATS[k].flying);
// EVERY KIND'S SIZE LIVES IN hitbox.ts, in tables that are rewritten in
// place when a shape is overridden: HB_OUTER is the widest half-extent (the
// broad phase's radius), HB_MEAN the equal-area circle (what urad holds),
// HB_A / HB_B the two semi-axes the narrow phase reads through Sim.hitR,
// and HB_HEAVY the physics size split. Nothing here may cache them.
// the currency ladder (UNIT_STATS.tier, 1-5) — what a Volatile blast reads
const KIND_TIER = Uint8Array.from(UNIT_KINDS, (k) => UNIT_STATS[k].tier);
// support fields, indexed like UNIT_KINDS — null for kinds with no ability
const KIND_REPAIR = UNIT_KINDS.map((k) => UNIT_STATS[k].repairField ?? null);
const KIND_SHIELD = UNIT_KINDS.map((k) => UNIT_STATS[k].shieldField ?? null);
const KIND_ENERGY = UNIT_KINDS.map((k) => UNIT_STATS[k].energyField ?? null);
const KIND_FORCE = UNIT_KINDS.map((k) => UNIT_STATS[k].forceField ?? null);
/** the two STAMP auras (levels.ts armorField / hasteField): the ironhide5's
 *  plating and the dartback3's pace, one carrier each at the moment */
const KIND_ARMOR_F = UNIT_KINDS.map((k) => UNIT_STATS[k].armorField ?? null);
const KIND_HASTE_F = UNIT_KINDS.map((k) => UNIT_STATS[k].hasteField ?? null);
/** ...and the two the sky and the sea carry (levels.ts jamField /
 *  wakeField): the stoop4's stamp on the BUILDINGS under it, and the
 *  skate4's on the hulls around it */
const KIND_JAM_F = UNIT_KINDS.map((k) => UNIT_STATS[k].jamField ?? null);
const KIND_WAKE_F = UNIT_KINDS.map((k) => UNIT_STATS[k].wakeField ?? null);
/** the Harpoon fleet's two stamps: the skate3's reach and the skate4's drill */
const KIND_SPOTTER_F = UNIT_KINDS.map((k) => UNIT_STATS[k].spotterField ?? null);
const KIND_DRILL_F = UNIT_KINDS.map((k) => UNIT_STATS[k].drillField ?? null);
/**
 * WHAT A HIT IS — a two-bit description of the damage arriving at a body,
 * threaded through every damage path in the sim to Sim.damageUnit, which
 * is the one door they all come through.
 *
 * TWO RULES READ IT AND NOTHING ELSE DOES:
 *
 *   BULLET   — a round, and a CLOAK stops rounds. The seven turrets whose
 *              shot is not a round (constants.ts NON_BULLET_KINDS) keep
 *              hitting a hull that has gone dark; everything else does
 *              not. Fire ticks and blasts thrown by dying hulls carry
 *              whatever their source carried.
 *   ELECTRIC — the blue line's, and a SOAKED body takes WET_SHOCK_MUL
 *              times the hit (constants.ts).
 *
 * A NUMBER RATHER THAN A PAIR OF BOOLEANS because this rides every hit in
 * the game, including the inner loop of a bolt walking a crowd: one int
 * compared twice costs nothing, and the alternative — an object saying
 * what the shot was — would allocate per victim.
 */
const DMG_BULLET = 1;
const DMG_ELECTRIC = 2;
/** fire, and anything else with no gun behind it: neither rule applies */
const DMG_NEITHER = 0;

/**
 * EVERY TURRET'S NATURE, precomputed by kind. `firesBullets` is the roster
 * list (constants.ts) and the electric bit is read off the ammo, because
 * `electric` on a bullet IS what makes that bullet electric.
 */
const TOWER_NATURE: Record<TowerKind, number> = Object.fromEntries(
  TOWER_KINDS.map((k) => [
    k,
    (firesBullets(k) ? DMG_BULLET : 0) |
      (TOWERS_IMPORT[k].bullet.electric ? DMG_ELECTRIC : 0),
  ]),
) as Record<TowerKind, number>;

/** the three families' own traits (levels.ts): veterancy, blink, cloak,
 *  and the payload a bomber IS */
const KIND_VET = UNIT_KINDS.map((k) => UNIT_STATS[k].veteran ?? null);
const KIND_BLINK = UNIT_KINDS.map((k) => UNIT_STATS[k].blink ?? null);
const KIND_CLOAK = UNIT_KINDS.map((k) => UNIT_STATS[k].cloak ?? null);
const KIND_PAYLOAD = UNIT_KINDS.map((k) => UNIT_STATS[k].payload ?? null);
/**
 * THE CHARGE (levels.ts UnitStats.charge), the Tuskers' trait: how far out
 * a body goes looking for a structure to leave the route for, in world px,
 * and 0 for everything that does not.
 *
 * ...AND THE REACH IT PICKS A TARGET AT, which is the longer of that and
 * its own longest gun. A melee family's weapons reach a few tiles, so
 * picking targets at weapon reach would mean a tusker only ever noticed a
 * turret it was already touching and never charged anything; a ranged
 * family has no charge and the pick is its reach exactly, as it always was.
 */
const KIND_CHARGE = Float64Array.from(UNIT_KINDS, (k) => UNIT_STATS[k].charge?.range ?? 0);
const HAS_CHARGE = KIND_CHARGE.some((r) => r > 0);
const KIND_SEEK = Float64Array.from(UNIT_KINDS, (k) =>
  Math.max(UNIT_REACH[k], UNIT_STATS[k].charge?.range ?? 0),
);
/**
 * DOES THIS KIND SHOOT THE CORE AND NOTHING ELSE (levels.ts
 * UnitStats.bombard)? — the siege's emplacement, and nothing else on the
 * roster. HAS_BOMBARD reads the ROSTER, not the run: it is true while any
 * kind carries the flag, and it is here so the branch in the target pick
 * costs one already-loaded boolean rather than an array index on every
 * body on the board, every tick, on every map.
 */
const KIND_BOMBARD = Uint8Array.from(UNIT_KINDS, (k) => (UNIT_STATS[k].bombard ? 1 : 0));
const HAS_BOMBARD = KIND_BOMBARD.some((b) => b === 1);
/**
 * THE STARBURST (levels.ts UnitStats.starburst), the Grapnels' trait, and
 * the stars it throws (weapons.ts GRAPNEL_STARS) resolved per KIND — the
 * table is authored by tier, and every read of it here is on a body whose
 * kind is already in hand.
 *
 * A null in either is a kind that never throws a star, which is every kind
 * but five; HAS_STARBURST is the gate that keeps the whole rule — the
 * riposte roll on every hit that lands, and the fold pass — out of a run
 * whose roster has no Grapnel in it.
 */
const KIND_STARBURST = UNIT_KINDS.map((k) => UNIT_STATS[k].starburst ?? null);
const KIND_STARS = UNIT_KINDS.map((k) =>
  UNIT_STATS[k].starburst ? (GRAPNEL_STARS[UNIT_STATS[k].tier - 1] ?? null) : null,
);
const HAS_STARBURST = KIND_STARBURST.some(Boolean);
/** ...as a list of kind ids, so the fold pass can ask the per-kind census
 *  whether any of them is standing before it walks the field at all */
const STARBURST_KINDS = KIND_STARBURST.map((b, i) => (b ? i : -1)).filter((i) => i >= 0);
/**
 * THE MOST BODIES ONE SURVIVOR MAY STAND FOR, by kind — the squeeze's own
 * MERGE_MAX_STACK for everything, and the Grapnels' own ceiling for a
 * grapnel (levels.ts starburst.merge, ten). Read by BOTH fold passes, so
 * a grapnel cannot reach eight through the squeeze and then ten through
 * its own rule, or go over its ceiling by taking one route after the other.
 */
const KIND_MERGE_MAX = Uint8Array.from(
  UNIT_KINDS,
  (k) => UNIT_STATS[k].starburst?.merge ?? MERGE_MAX_STACK,
);
// A TRAIT WITH NO ROUND BEHIND IT IS A FAMILY THAT SILENTLY DOES NOTHING
// — the body would take its hits, roll its chance and throw nothing at
// all — so the two tables are checked against each other at load rather
// than on the first hit that happens to need one
UNIT_KINDS.forEach((k, i) => {
  if (KIND_STARBURST[i] && !KIND_STARS[i]?.length)
    throw new Error(`${k} has a starburst but no star is authored for tier ${UNIT_STATS[k].tier}`);
});
const KIND_BOSS: readonly boolean[] = UNIT_KINDS.map((k) => !!UNIT_STATS[k].boss);
const BOSS_KINDS = KIND_BOSS.map((b, i) => (b ? i : -1)).filter((i) => i >= 0);
/**
 * WHERE A CROSSER'S HEALTH-BAR KEY STARTS (Sim.objectiveBars). The stack is
 * keyed by one id space shared between bosses (their spawn id) and trains
 * (their launch index), and React needs those to never collide — a boss and
 * a Borer sharing a key would have the two bars swap places the frame one of
 * them died. A spawn id is a counter off the same run, so the trains are
 * lifted clear of anything it can reach.
 */
const BAR_CROSSER_ID = 1e9;
/** ...and where the CARTS' keys start, clear of both (levels.ts
 *  EscortMission). No map fields a Borer and a hauler at once today; the
 *  id space costs nothing and the day one does, the bars still hold still */
const BAR_CONVOY_ID = 2e9;
/** which FLD_SLICE a world x falls in, clamped onto the board */
const sliceOf = (x: number): number => {
  const b = (x / FLD_SLICE) | 0;
  return b < 0 ? 0 : b >= FLD_SLICES ? FLD_SLICES - 1 : b;
};

/** the pad list a brood spawn is handed — it picks its own spot, so there
 *  are no doors to draw from and nothing to allocate per body */
const EMPTY_PADS: readonly number[] = [];
/** how many spawn mouths the route overlay draws a line from (Sim.spawnMouths) */
const MAX_MOUTHS = 12;
/**
 * THE AIM INDEX'S SQUARE, in cells: every structure on the board is filed
 * in one of these (Sim.structBlocks), and nearestStructure walks squares
 * instead of cells once a body's reach is long enough to make that pay.
 *
 * WHY THERE IS A SECOND GRID AT ALL. The cell walk is exact and cheap while
 * a reach is short — a couple of rings and it has its answer — and it is
 * QUADRATIC IN THE REACH, so a spotter-stamped skate looking two hundred and
 * seventy cells out reads seventy thousand cells to find a turret thirty
 * away, or to find nothing at all. Over squares that is about five thousand
 * reads of a mostly-empty array, and a body standing in a line finds its
 * target in the first ring or two and stops.
 *
 * Eight a side rather than four or sixteen because a square is the unit of
 * BOTH costs: too small and a sweep over open ground reads too many of them,
 * too big and a body in a crowded line weighs too many buildings it was
 * never going to take.
 */
const AIM_BLOCK = 8;
const AIM_BCOLS = Math.ceil(COLS / AIM_BLOCK);
const AIM_BROWS = Math.ceil(ROWS / AIM_BLOCK);
const AIM_BLOCK_PX = AIM_BLOCK * CELL;
/**
 * THE FORCE-FIELD SWEEP'S SLICE, in world px (Sim.absorb). Every shot in
 * flight asks "is there a bubble over me", and the carriers are a Tusker
 * column's worth of bodies — seven hundred of them against three hundred
 * shots was two hundred thousand distance tests a tick, which is what a
 * linear scan of a thing that moves costs once there is a lot of it.
 *
 * Laying the carriers out in vertical slices makes that a read of the two
 * or three slices a shot could possibly be covered by. The width is picked
 * off the bubbles themselves: a tusker4's is 190px and the widest anything
 * carries is 240, so a slice wider than that would be read almost whole and
 * a much narrower one would have every query spanning a dozen of them.
 */
const FLD_SLICE = 256;
const FLD_SLICES = Math.ceil(W / FLD_SLICE) + 1;
/**
 * MITOSIS (mutation.ts): the tier-1 kinds a death may break into, grouped
 * by the movement layer they travel on — ground gets ironhide1, dartback1 and
 * starhart1, air gets stoop1, water gets skate1 and livewire1.
 *
 * THE LAYER IS THE WHOLE FILTER and it is not a convenience. A brood is
 * dropped where its parent fell, so a kind that cannot stand there is a
 * kind that spawns inside rock or aground on a shoreline — the same test
 * spawnUnit runs at the doors, failed on every attempt. Picking from the
 * parent's own layer means the brood always has somewhere to walk.
 *
 * Bosses are out of the roster (never of the brood — a boss is an
 * authored event, not something an ironhide2 leaves behind), which today
 * removes nothing: the one boss kind is T5.
 */
const MITOSIS_KINDS: Record<MoveLayer, readonly number[]> = (() => {
  const out = { ground: [], air: [], water: [] } as Record<MoveLayer, number[]>;
  UNIT_KINDS.forEach((k, i) => {
    const s = UNIT_STATS[k];
    if (s.tier !== 1 || s.boss) return;
    out[s.flying ? "air" : s.naval ? "water" : "ground"].push(i);
  });
  // A LAYER WITH NO T1 KIND WOULD SILENTLY SWALLOW THE RULE on everything
  // that travels it — a whole movement layer immune to a mutator the card
  // says is universal — so the roster checks itself the way the mutator
  // catalog does, at load rather than on the death that happens to need it
  for (const layer of MOVE_LAYERS)
    if (out[layer].length === 0)
      throw new Error(`no tier-1 unit kind travels on the ${layer} layer — Mitosis cannot brood there`);
  return out;
})();
/** kind ids that carry a force field — the absorb pass is skipped outright
 * when none of them is on the field, so the scan costs nothing in a wave
 * without one */
const FORCE_KINDS = KIND_FORCE.map((f, i) => (f ? i : -1)).filter((i) => i >= 0);
/** the same thing as a flag array: the carrier scan runs over every unit on
 * the field, and one typed-array read per unit is a great deal cheaper
 * there than reaching into KIND_FORCE for an object it will discard */
const KIND_IS_FORCE = Uint8Array.from(KIND_FORCE, (f) => (f ? 1 : 0));
/**
 * UnitType.immunities as one flag per kind and per status — burning and
 * wet are the two this game applies. Mindustry checks it in
 * StatusComp.apply, BEFORE the effect is added, so an immune unit is never
 * lit (or soaked) and never flickers either. No stock kind is wet-immune;
 * the flag exists so declaring one in UNIT_STATS is all it would take.
 */
const KIND_BURN_IMMUNE = Uint8Array.from(UNIT_KINDS, (k) =>
  UNIT_STATS[k].immunities?.includes("burning") ? 1 : 0,
);
const KIND_WET_IMMUNE = Uint8Array.from(UNIT_KINDS, (k) =>
  UNIT_STATS[k].immunities?.includes("wet") ? 1 : 0,
);
/**
 * UnitStats.unslowable as one flag per kind: NO SLOW MULTIPLIER EVER
 * SCALES THIS BODY'S DRIVE.
 *
 * It is deliberately NOT an entry in the table above, because it is not a
 * status immunity. An immune body never takes the status at all — never
 * tints, never douses a fire it is carrying, never hands the electric
 * ammunition the soaked bonus. This one takes everything the soak does
 * and refuses only the seconds, which is the same split the Speedy
 * mutation already draws (applyWet). The ONE reader is the drive in
 * updateUnits, and every slow this game grows later has to come through
 * it — a crosser never reaches it, because its advance reads no
 * multiplier of any kind (updateCrosser).
 */
const KIND_NO_SLOW = Uint8Array.from(UNIT_KINDS, (k) =>
  UNIT_STATS[k].unslowable ? 1 : 0,
);
/**
 * UnitType.drag per kind — the fraction of an external shove a unit sheds
 * per tick. It bleeds the pull channel, which a repeater round's knockback
 * feeds (see impulse()).
 * Mindustry's own default is 0.3, which is what every kind that does not
 * state one carries.
 */
const KIND_DRAG = Float32Array.from(UNIT_KINDS, (k) => UNIT_STATS[k].drag ?? 0.3);
/** what each kind's drive is multiplied by on a cell that is not water —
 *  the layer's land tax unless the kind names its own (levels.ts
 *  UnitStats.landSpeed, which the Wraith fleet does). Read for naval
 *  kinds only: nothing else is charged it */
const KIND_LAND_SPEED = Float32Array.from(
  UNIT_KINDS,
  (k) => UNIT_STATS[k].landSpeed ?? NAVAL_LAND_SPEED,
);
/** the gait of every legged kind, indexed like UNIT_KINDS — null for the
 * mechs and flyers, whose animation is one sliding pair of leg sprites */
const KIND_LEGS = UNIT_KINDS.map((k) => UNIT_STATS[k].legs ?? null);
/**
 * WHAT ONE TICK DID TO A PIECE OF A TRAIN (Sim.updateCrosser). Three
 * outcomes and not a boolean, because a Borer's piece leaves the board
 * two different ways and they are opposite in the ledger: a LEAK is the
 * mission failing and a DEATH is it being met.
 */
type CrosserStep = 0 | 1 | 2;
const CROSS_WALKING: CrosserStep = 0;
const CROSS_LEAKED: CrosserStep = 1;
const CROSS_DEAD: CrosserStep = 2;

/** the worm rig of every segmented kind (levels.ts SegmentSpec), null for the rest */
const KIND_SEGS = UNIT_KINDS.map((k) => UNIT_STATS[k].segments ?? null);
/** the wake of every naval kind, indexed like UNIT_KINDS — null for
 *  everything that is not a hull */
const KIND_WAKE = UNIT_KINDS.map((k) => UNIT_STATS[k].wake ?? null);
/**
 * How many points of a hull's wake the sim actually keeps.
 *
 * Mindustry's Trail holds one point PER TICK — 20 for a skate1, 70 for an
 * skate5 — and redraws the lot every frame. That is a fine deal for the
 * handful of boats a Mindustry sector fields and a poor one for a wave of
 * them here, so the path is SUBSAMPLED: eight points spread over the same
 * span of history the original keeps, which is 8 quads a side instead of
 * 70. The wake is a smooth curve behind a hull that turns at a couple of
 * degrees a tick, so the eight land on it almost exactly.
 *
 * One path, not two. Upstream keeps a separate Trail for each side because
 * each is fed already-offset world points; the two are the same curve a
 * fixed distance either side of the hull's own, so this stores the hull's
 * and the renderer lays the offsets on at draw time (see Renderer.pushWake).
 */
export const WAKE_PTS = 8;
/** seconds between wake samples per kind: the kind's own history span
 *  (trailLength ticks) spread over the WAKE_PTS points that stand in for it */
const KIND_WAKE_DT = Float32Array.from(UNIT_KINDS, (k) => {
  const w = UNIT_STATS[k].wake;
  return w ? w.length / 60 / (WAKE_PTS - 1) : 0;
});
/** widest leg count on the roster: the stride of the per-leg arrays */
export const MAX_LEGS = Math.max(1, ...KIND_LEGS.map((l) => l?.count ?? 0));
// ulegMove packs one swing bit per leg into a Uint8Array, so eight legs is
// the roster's ceiling — and the dartback5 sits exactly on it. A ninth would
// not fail anywhere: the bit would truncate silently, that leg would never
// register a landing, and it would simply stop throwing dust. Widen
// ulegMove to a Uint16Array if a unit ever needs more.
if (MAX_LEGS > 8) throw new Error(`MAX_LEGS ${MAX_LEGS} > 8: widen Sim.ulegMove past Uint8Array`);
/** longest chain on the roster: the stride of the per-segment arrays */
export const MAX_SEGS = Math.max(1, ...KIND_SEGS.map((s) => s?.count ?? 0));
const TAU = Math.PI * 2;

/**
 * Per-kind leg-mount unit vectors: cos/sin of each leg's fixed slice of
 * the ring ((TAU / count) * k + PI / count). The per-frame mount angle is
 * the chassis rotation composed on top by the angle-addition identity,
 * which costs four multiplies per leg instead of two trig calls — and the
 * gait pass runs per leg per unit per tick.
 */
const KIND_LEG_TRIG = KIND_LEGS.map((L) => {
  if (!L) return null;
  const arr = new Float64Array(L.count * 2);
  for (let k = 0; k < L.count; k++) {
    const c = (TAU / L.count) * k + Math.PI / L.count;
    arr[k * 2] = Math.cos(c);
    arr[k * 2 + 1] = Math.sin(c);
  }
  return arr;
});

/**
 * Arc InverseKinematics.solve, the knee placement for a two-segment leg:
 * given the foot at (ex, ey) relative to the mount, put the joint where
 * both segments keep their length. `side` chooses between the two mirror
 * solutions — the original passes an attractor built by rotating the foot
 * vector one degree, which after normalizing is exactly the perpendicular
 * on that side, so the perpendicular is what this uses.
 *
 * An unreachable foot (further than a + b) is not an error: the reach
 * clamp pulls it back next frame, and meanwhile the knee locks straight.
 */
function solveIK(a: number, b: number, ex: number, ey: number, side: boolean, out: Vec2): void {
  const len = Math.sqrt(ex * ex + ey * ey);
  if (len < 1e-4) {
    out.x = 0;
    out.y = a;
    return;
  }
  const ax = ex / len, ay = ey / len;
  const px = side ? -ay : ay, py = side ? ax : -ax;
  const along = clamp((len + (a * a - b * b) / len) / 2, 0, a);
  const out2 = Math.sqrt(Math.max(0, a * a - along * along));
  out.x = ax * along + px * out2;
  out.y = ay * along + py * out2;
}

/** clamp a vector's length into [min, max], writing it back to `out` */
function clampLen(dx: number, dy: number, min: number, max: number, out: Vec2): void {
  const len = Math.sqrt(dx * dx + dy * dy);
  const k = len < 1e-6 ? 1 : len < min ? min / len : len > max ? max / len : 1;
  out.x = dx * k;
  out.y = dy * k;
}

/** scratch vectors for the leg pass — one per call site, never nested */
const legTmp: Vec2 = { x: 0, y: 0 };
/** ...and one for a blink's route sample (Sim.blinkUnit) */
const flowTmpBlink: Vec2 = { x: 0, y: 0 };
const legTmp2: Vec2 = { x: 0, y: 0 };

/** any support unit on the roster at all? skips the pass entirely when not */
const HAS_ABILITIES =
  KIND_REPAIR.some(Boolean) ||
  KIND_SHIELD.some(Boolean) ||
  KIND_ENERGY.some(Boolean) ||
  KIND_ARMOR_F.some(Boolean) ||
  KIND_HASTE_F.some(Boolean) ||
  KIND_JAM_F.some(Boolean) ||
  KIND_WAKE_F.some(Boolean) ||
  KIND_SPOTTER_F.some(Boolean) ||
  KIND_DRILL_F.some(Boolean) ||
  FORCE_KINDS.length > 0;
/** ...and whether either STAMP is on the roster at all — the two reads that
 *  cost something are in the movement and damage hot loops, so they are
 *  gated on this rather than on a per-unit test */
const HAS_ARMOR_AURA = KIND_ARMOR_F.some(Boolean);

/** LEADERSHIP (mutation.ts): the bodies that give the order. Tier five is
 *  the roster's top rung — the apexs, apexs, correspondingly huge
 *  hulls and flyers, and the boss — so the rule turns itself on exactly
 *  where a wave is at its heaviest and is dead weight everywhere else */
const KIND_T5 = Uint8Array.from(UNIT_KINDS, (k) => (UNIT_STATS[k].tier === 5 ? 1 : 0));

/** MECH VIRUS (mutation.ts): the venom purple the rot already wears, which
 *  is this board's colour for "something is eating that building" */
const VIRUS_RGB: RGB = PAL.sap;
const HAS_HASTE_AURA = KIND_HASTE_F.some(Boolean);
const HAS_WAKE_AURA = KIND_WAKE_F.some(Boolean);
const HAS_SPOTTER = KIND_SPOTTER_F.some(Boolean);
const HAS_VET = KIND_VET.some(Boolean);
const HAS_BLINK = KIND_BLINK.some(Boolean);
const HAS_CLOAK = KIND_CLOAK.some(Boolean);

// how fast body and chassis swivel: Mindustry's default rotateSpeed /
// baseRotateSpeed, 5 degrees per tick
const ROT_SPD = ((5 * Math.PI) / 180) * 60;
/**
 * UnitType.rotateSpeed per kind, rad/s — how fast the TORSO comes round.
 * Much of the roster above the T1s overrides it (ironhide3, dartback2 and
 * dartback3 at 3, the stoop2 at 4.5); kinds that state none take the
 * default, and the chassis under all of them keeps baseRotateSpeed
 * either way
 */
const KIND_ROT = Float32Array.from(UNIT_KINDS, (k) => {
  const deg = UNIT_STATS[k].rotateSpeed;
  return deg === undefined ? ROT_SPD : ((deg * Math.PI) / 180) * 60;
});

/**
 * ONE SHIELD TOWER — the Shield Towers mutator's structure (mutation.ts
 * has the whole design). The shield state mirrors a unit's (shield /
 * shieldAlpha / scale are ushield / ushieldAlpha / uforceScale under other
 * names) so the renderer's shield pass can treat a dome exactly as it
 * treats a carrier's bubble.
 *
 * A shield tower EMERGES mid-run (updateShieldTowers rolls the spot) and a destroyed
 * one is gone for good — hp 0 is its tombstone. The ENTRY, though, is
 * never removed from Sim.shieldTowers and the array is never reordered, so an
 * index into it (a tower's aimShieldTower, the player's mark, a pierce
 * ledger sentinel) is stable for the run.
 */
export interface ShieldTower {
  gx: number; // top-left cell of the 3x3 footprint
  gy: number;
  x: number; // world-space centre
  y: number;
  hp: number; // body pool — hittable only once the dome is down. 0 = dead
  hpMax: number;
  shield: number; // the dome's pool; 0 = dome down, regenerating
  shieldMax: number;
  shieldAlpha: number; // whitening flash on a hit, fading like a unit's
  scale: number; // dome radius lerp, ForceFieldAbility.radiusScale
  /** this shield tower's dome radius in px — SHIELD_TOWER_DOME_R, or the mega one.
   *  Per-shield tower rather than a constant because the two sizes coexist:
   *  ordinary shieldTowers raised before the mega wave keep standing after it */
  domeR: number;
  /** a MEGA shield tower (mutation.ts): five times the pools, four times the
   *  dome's area. Everything else about it is an ordinary shield tower */
  mega: boolean;
  regenT: number; // seconds until the dome reforms whole (reset on any hit)
}

/**
 * The whole simulation: units in struct-of-arrays, a spatial hash for
 * separation and projectile hits, towers, and the flow field they block.
 */
export class Sim {
  readonly field = new FlowField();
  terrain!: Terrain; // assigned by reset() in the constructor
  // the core's centre in world px — where every flyer is heading
  private goalX = 0;
  private goalY = 0;

  readonly upx = shared.f32(MAX_UNITS);
  readonly upy = shared.f32(MAX_UNITS);
  readonly uvx = shared.f32(MAX_UNITS);
  readonly uvy = shared.f32(MAX_UNITS);
  /**
   * WHERE THE BODY IS TRYING TO GO, smoothed: the drive plus the slow
   * steering (drift, probes, centring), through the same first-order
   * filter uvx rides on, and what the facing is aimed at (updateUnits).
   * It is a separate vector from uvx because the steering forces are
   * deliberately NOT part of the filtered drive — they must land on the
   * position the tick they fire, or a wall probe would arrive late — but
   * several of them carry white noise tick to tick (the drift bias's
   * random increment, a probe switching on and off at a pixel edge), and
   * a body aimed straight at the sum shivers on it
   */
  readonly uaimx = new Float32Array(MAX_UNITS);
  readonly uaimy = new Float32Array(MAX_UNITS);
  readonly uhp = shared.f32(MAX_UNITS);
  readonly uhpmax = shared.f32(MAX_UNITS);
  readonly uspd = new Float32Array(MAX_UNITS);
  readonly urad = shared.f32(MAX_UNITS);
  readonly uarmor = new Float32Array(MAX_UNITS);
  // a flyer's own destination in world px, fixed when it spawns: the goal
  // cell nearest where it entered. Walkers read the flow field instead, and
  // the field already routes them to their nearest goal for free — this is
  // only here because flyers never touch it
  readonly ugx = new Float32Array(MAX_UNITS);
  readonly ugy = new Float32Array(MAX_UNITS);
  /** absorbing shield (Mindustry ShieldComp.shield): eaten before health */
  readonly ushield = shared.f32(MAX_UNITS);
  /** shield draw opacity — 1 on apply or hit, fading over 15 ticks */
  readonly ushieldAlpha = shared.f32(MAX_UNITS);
  /** seconds since this unit's support ability last pulsed */
  readonly uability = new Float32Array(MAX_UNITS);
  /**
   * ForceFieldAbility.radiusScale: the bubble does not snap to full size,
   * it inflates toward 1 while it holds charge and collapses to 0 the
   * instant it breaks. It scales the radius everywhere — the absorb test
   * reads the same number the renderer draws, so a half-grown field really
   * does only cover half its reach
   */
  readonly uforceScale = shared.f32(MAX_UNITS);
  /**
   * ForceFieldAbility.wasBroken: 1 once the pool has been seen empty. It is
   * what makes a break fire exactly once — the pool sits negative for the
   * whole outage, and without this every tick of it would re-break
   */
  readonly uforceDown = new Uint8Array(MAX_UNITS);
  /**
   * Mindustry's impulse velocity, px/s: an outside shove that is NOT the
   * unit's own drive. A repeater round's knockback adds to it, the kind's
   * drag bleeds it away, and it rides on top of the capped drive exactly
   * like the crowd shove does — a unit can be shoved faster than it can
   * walk, and has to walk back out of it
   */
  readonly upullx = new Float32Array(MAX_UNITS);
  readonly upully = new Float32Array(MAX_UNITS);
  /**
   * WaveSpawner.spawnEffect's two statuses, as one clock: seconds left of
   * the arrival. It counts down from SPAWN_INVINCIBLE, and the unit is
   * INVINCIBLE for all of it and UNMOVING for the first SPAWN_UNMOVING —
   * so the boundary between the two is also the frame Fx.spawn fires on.
   * Zero is a unit that has finished arriving, which is nearly all of them
   */
  readonly uspawn = shared.f32(MAX_UNITS);
  /**
   * StatusEffects.burning: seconds of fire left. Reapplying resets it to
   * the full statusDuration rather than stacking, exactly like Mindustry's
   * status map, which keeps one entry per effect
   */
  /** fire STACKS, not seconds (docs/elements.md) */
  readonly uburn = shared.f32(MAX_UNITS);
  private readonly uburnT = new Float32Array(MAX_UNITS);
  /** poison damage a second; hits add and it never caps */
  readonly upoison = shared.f32(MAX_UNITS);
  private readonly upoisonT = new Float32Array(MAX_UNITS);
  /** accumulated soak: the hp a body breaks down under. Never expires */
  readonly usoak = shared.f32(MAX_UNITS);
  private statusFrame = 0;
  /**
   * THE TWO STAMPED AURAS (constants.ts AURA_LINGER), each a value and the
   * seconds it has left to run: extra armour from an ironhide5, a speed
   * multiplier from a dartback3. A carrier's pulse writes both; nothing else
   * ever does, and a body with an expired clock reads as if it had never
   * been stamped.
   *
   * A STAMP AND NOT A LOOKUP. There are up to 22,000 bodies and a handful
   * of carriers, so the carrier pays for one search on its own reload and
   * every body pays one float compare — the other way round is 22,000
   * searches a frame for a buff almost nobody is in range of.
   *
   * THEY ARE MAXIMA, NOT SUMS. Two apexs walking together do not stack
   * their plating: the stronger stamp wins and the clock refreshes. An
   * aura that summed would make a T5 pair the answer to every board, and
   * the family trait is meant to be a rule about calibre rather than a
   * number that runs away.
   */
  readonly uarmorAdd = new Float32Array(MAX_UNITS);
  readonly uarmorT = new Float32Array(MAX_UNITS);
  readonly uhasteMul = new Float32Array(MAX_UNITS);
  readonly uhasteT = new Float32Array(MAX_UNITS);
  /** THE BOW WAVE (levels.ts wakeField): seconds a hull still drives
   *  ashore at its afloat pace. Only ever written onto naval bodies */
  readonly ubowT = new Float32Array(MAX_UNITS);
  /** seconds since the body arrived, run only on the kinds that age
   *  (levels.ts veteran) and `udrillMul` times faster under a drill */
  readonly uage = new Float32Array(MAX_UNITS);
  /** what age is worth right now: the damage multiplier every weapon the
   *  body fires carries (1 on everything that does not age) */
  readonly uvet = shared.f32(MAX_UNITS);
  readonly udrillMul = new Float32Array(MAX_UNITS);
  readonly udrillT = new Float32Array(MAX_UNITS);
  /** THE SPOTTER'S STAMP (levels.ts spotterField): the reach multiplier
   *  and the seconds it has left */
  readonly ureachMul = new Float32Array(MAX_UNITS);
  readonly ureachT = new Float32Array(MAX_UNITS);
  /** BLINK (levels.ts blink): seconds until the body may jump again */
  readonly ublinkCd = new Float32Array(MAX_UNITS);
  /**
   * THE STARBURST (levels.ts starburst, the Grapnels): seconds until this
   * body may throw another star in answer to a hit, and seconds until it
   * next reaches for one of its own kind to fold with (mergeGrapnel).
   *
   * THE FIRST OF THEM IS THE RULE'S REAL RATE LIMIT. The chance is rolled
   * inside damageUnit, which is the door EVERY point of damage in the game
   * comes through — a tick of rot, a tick of fire, a beam's bite — so
   * without a clock a body standing in a furnace's beam would answer sixty
   * times a second. Both are dead weight on every kind but five, which is
   * what HAS_STARBURST is for.
   */
  private readonly ustarCd = new Float32Array(MAX_UNITS);
  private readonly ufoldT = new Float32Array(MAX_UNITS);
  /** CLOAK (levels.ts cloak): seconds still hidden, and seconds until the
   *  next time it hides */
  readonly ucloakT = shared.f32(MAX_UNITS);
  readonly ucloakCd = new Float32Array(MAX_UNITS);
  /**
   * StatusEffects.wet: seconds of soaking left, and the drive-speed
   * multiplier in force while it lasts. One entry like the status map's —
   * reapplying re-times rather than stacks, and the strongest slow wins
   * (see applyWet). `uwetSlow` is only meaningful while uwet > 0; expiry
   * and spawn both park it back at 1 so a recycled slot can never leak a
   * stale slow. The renderer reads uwet to tint soaked units blue
   */
  readonly uwet = shared.f32(MAX_UNITS);
  readonly uwetSlow = new Float32Array(MAX_UNITS);
  /**
   * THE HUNGRY STATUS (the Hungry mutator, mutation.ts): 1 = this unit eats
   * its neighbours. Rolled once at spawn and never applied by anything
   * else — there is no weapon, aura or effect that makes a unit hungry, so
   * unlike burning and wet this one never changes for the rest of a life.
   *
   * `ueaten` is how many meals it has taken, capped at HUNGRY_MAX_MEALS.
   * The renderer reads BOTH: the flag tints it, the count swells it.
   * `uhungerT` is the seconds left on its feeding clock.
   *
   * These are three arrays and not one packed field because the feed pass
   * reads the flag over every unit on the field and only touches the other
   * two for the tenth that answers yes.
   */
  readonly uhungry = shared.u8(MAX_UNITS);
  readonly ueaten = shared.u8(MAX_UNITS);
  private readonly uhungerT = new Float32Array(MAX_UNITS);
  /**
   * THE SQUEEZE (mergeSqueezed, constants.ts MERGE_*): how many bodies
   * this row stands for — 1 for every body that walked in through a door,
   * more once bodies of its kind have been folded into it at a choke. The
   * weapons pass multiplies every hit by it, killUnit books it as this
   * many kills and drops, and the renderer swells the sprite by it.
   *
   * `usqzT` is the seconds this body has spent squeezed against a partner
   * of its own kind; `usqzJ`, `usqzU` and `usqzD` are scratch the physics
   * pass rebuilds every tick — the deepest such partner's index, its uid
   * (the index alone cannot be trusted across the removals between the
   * two passes) and how deep the pair sat.
   */
  readonly ustack = shared.u8(MAX_UNITS);
  private readonly usqzT = new Float32Array(MAX_UNITS);
  private readonly usqzJ = new Int32Array(MAX_UNITS);
  private readonly usqzU = new Int32Array(MAX_UNITS);
  private readonly usqzD = new Float32Array(MAX_UNITS);
  /**
   * THE AMPHIBIOUS RULE (mutation.ts), in two bytes a unit.
   *
   * `uwade` is how many times this body has stepped into water, capped at
   * AMPHIBIOUS_MAX_STACKS — the whole of the bonus it is carrying, since
   * the gains themselves are already baked into uhpmax, uspd and uarmor.
   * The renderer reads it to swell a waded body, exactly as it reads
   * ueaten for a fed one.
   *
   * `uwet01` is only whether the unit was standing in water on the LAST
   * tick, which is what turns a position into an ENTRY: a stack is taken
   * on the 0 -> 1 crossing and never while it stands there. Named apart
   * from `uwet` on purpose — that one is the liquid turrets' status, a
   * countdown in seconds, and the two are unrelated.
   */
  readonly uwade = shared.u8(MAX_UNITS);
  private readonly uwet01 = new Uint8Array(MAX_UNITS);
  /**
   * MITOSIS (mutation.ts): 1 on a body this rule PUT on the field, 0 on
   * one that walked in through a door.
   *
   * IT IS THE TERMINATION GUARANTEE, and it is a property of the body
   * rather than arithmetic on the tier table. A brood that could brood
   * again is a chain with no upper bound — one ironhide1, one ironhide1, forever
   * — and a wave that can never be finished is not a harder wave. Saying
   * it here says it once and says it for good: whatever the table is
   * edited to, whatever tiers are added, whatever a dashboard bends, the
   * rule is exactly ONE generation deep and the swarm cannot outrun the
   * script that sent it.
   *
   * IT USED TO BE A ZERO IN THE TABLE — tier 1 bred nothing, so the chain
   * ended because everything it created was tier 1. That worked and it was
   * the wrong place to put it: it made "does this terminate?" a question
   * about a balance dial, so the day someone gave T1 a brood the game
   * would hang rather than play differently. With the flag, the table is
   * free to be a pure balance dial again — which is why tier 1 has a brood
   * of its own now, and why the card can honestly say EVERY enemy.
   *
   * A byte a unit rather than a bit in ufly's neighbourhood for the same
   * reason the three hungry arrays are three arrays: killUnit reads it once
   * per death and nothing else reads it at all.
   */
  private readonly ubrood = new Uint8Array(MAX_UNITS);
  /**
   * HAS THIS BODY ALREADY STOOD BACK UP? (Reconstruction, mutation.ts.)
   * The same shape of guarantee ubrood carries for Mitosis and for the
   * same reason: the rule is one generation deep as a property of the
   * BODY, so no clock, count or table can turn a lane into a loop.
   */
  private readonly urisen = new Uint8Array(MAX_UNITS);
  /**
   * LEADERSHIP (mutation.ts): seconds left on the order stamped over this
   * body by a tier five standing near it. A timer rather than a flag, for
   * the reason the armour aura's is (AURA_LINGER): it is re-stamped on a
   * beat, and a body that walks out of the circle has to stop being
   * covered on its own rather than waiting for someone to notice.
   */
  readonly uled = shared.f32(MAX_UNITS);
  /**
   * MECH VIRUS (mutation.ts): is this body a carrier? One byte, rolled
   * once at the spawn like the hungry mark beside it, and read once when
   * the body dies.
   */
  readonly uvirus = shared.u8(MAX_UNITS);
  /**
   * THE CROSSER A BODY BELONGS TO — its index into `crossers` — or -1,
   * which is everything the script ever sent (levels.ts InterceptMission,
   * missions.ts).
   *
   * A crosser does not read the flow field, is not shoved by the crowd,
   * and does not collide with rock: it walks a road somebody drew, and
   * `ucrossS` is how far behind the HEAD this piece is laid, in world px —
   * a constant, written once at the launch and never touched again.
   *
   * THE TRAIN HAS ONE CLOCK AND IT IS THE WORM'S (`crossers[].s`). Every
   * piece's arc length is that clock minus its own offset, so the chain
   * cannot stretch, bunch or come apart whatever is happening to any one
   * car — which it could, and did, while each car advanced itself: a
   * dartback3's pace stamp reaches ten tiles and a Borer is seventy-four
   * long, so a haste that caught four cars pulled them out of the train.
   *
   * THEY ARE NOT SHARED. The renderer draws a Borer off upx/upy/urot like
   * any other body, because that is all a body IS on the sheet — the
   * chain it belongs to is a fact about the mission, not about the
   * picture.
   */
  private readonly ucross = new Int16Array(MAX_UNITS);
  private readonly ucrossS = new Float32Array(MAX_UNITS);
  /**
   * IMMOVABLE: this body takes no share of a crowd shove and hands the
   * whole overlap to whatever it met (physkernel.ts). A crosser and a
   * planted emplacement both carry it, and for the same reason — their
   * position is somebody else's promise (a road, a mission's mark), so
   * the only honest resolution of a pair is that the other body moves.
   */
  readonly ufix = shared.u8(MAX_UNITS);
  /**
   * THE POST A BODY HOLDS — 0 for everything the script ever sent, and the
   * whole of how a mission puts a body somewhere and keeps it there
   * (garrisonUnit, plantUnit).
   *
   * EVERY BODY IN THIS GAME WALKS AT THE CORE. That is not a behaviour a
   * kind opts into, it is the shape of the field (flowfield.ts — every
   * route on the board runs to the base), and it is why the swarm is a
   * TIDE rather than an army. A mission that wants a thing to be SOMEWHERE
   * — an emplacement to go and break, a garrison standing over it, a camp,
   * a nest, a picket on a road — cannot ask for it in that language: a
   * body handed to the field is a body that will be at your door in ninety
   * seconds whatever it was put down for.
   *
   * So a garrisoned body simply does not read the field. `ugar` says which
   * of three things it is:
   *
   *   0  FREE — the field, the crowd, the core. Everything else.
   *   1  LEASHED — it holds the circle at (ugarx, ugary) of radius ugarr.
   *      It walks at what it has picked inside that circle, walks back to
   *      the middle when it has nothing, and never takes a step outside
   *      (updateUnits). Its target search is clipped to the same circle
   *      (updateUnitWeapons), so a turret a tile beyond the line is a
   *      turret it does not know about. That last part is the mission
   *      design and not an optimisation: a guard that could be pulled off
   *      its post by building near it would be a wave with extra steps.
   *   2  PLANTED — bolted to the ground it was put on. No heading, no
   *      crowd shove, no knockback, no beam drag. An emplacement the
   *      physics could walk off its own footprint is an emplacement that
   *      ends up somewhere the mission did not author.
   *
   * IT IS DELIBERATELY NOT A PROPERTY OF THE KIND. The Wardens are the
   * first bodies to use it and they are not the point — the point is that
   * ANY kind can be posted, so the next mission that wants a Tusker herd
   * camped on a hill writes a roster (levels.ts RazeSection.guards) rather
   * than a new unit.
   */
  private readonly ugar = new Uint8Array(MAX_UNITS);
  private readonly ugarx = new Float32Array(MAX_UNITS);
  private readonly ugary = new Float32Array(MAX_UNITS);
  private readonly ugarr = new Float32Array(MAX_UNITS);
  /**
   * THE CROSSERS THIS RUN HAS LAUNCHED, in launch order and never
   * reordered — `ucross` is an index into this, and an index that moved
   * would put a car in somebody else's train. A dead crosser keeps its
   * entry with `alive` at zero.
   */
  /**
   * ONE WORM, ONE HEALTH POOL. `hp`/`hpMax` are the TRAIN'S, not a
   * piece's: every car on it reports this number and every hit on any car
   * comes off it (damageUnit, drainCrosser), so a Borer is twenty
   * hurtboxes on ONE body rather than twenty bodies in a line.
   *
   * WHY, when the pieces were separate for a good reason. They still are:
   * the chain exists so the whole length of the train is shootable, which
   * is what makes the mission about how much ROAD you have under fire
   * rather than about hitting a nose. What the separate POOLS added on top
   * of that was a train that came apart — cars popping off one at a time,
   * gaps opening in the middle, a head sailing on alone — and that reads
   * as twenty machines travelling together, which is not what it is. The
   * hurtboxes stay twenty; the thing they belong to is one.
   *
   * `hpMax` is the sum of what the pieces spawned with, so the level
   * curve and the launch ramp both still land exactly as they did.
   */
  private crossers: { road: number; alive: number; leaked: boolean; hp: number; hpMax: number; s: number; spd: number }[] = [];
  /** the roads this map carries (missions.ts), empty on every other map */
  private roads: readonly Road[] = [];
  /** crossers destroyed whole — every piece of them down before the exit */
  crossKilled = 0;
  /** crossers that got a piece of themselves to the far side */
  crossLeaked = 0;
  /** launches made, counting into the pattern and then the spare */
  private crossLaunched = 0;
  /**
   * THE BUFF TOWER SPOTS THIS MAP CARRIES (missionMarks.ts MapMark,
   * docs/mission-marks.md) — GROUND ONLY. Which tower rises and when is
   * the schedule's (levels.ts pylonsDue); the map says where one MAY
   * stand, and each train wave rolls its hand into the spots still free.
   *
   * A SPOT IS NOT A RISE. The list is read once at reset and never spent —
   * a spot whose tower was knocked down is back in the draw, and one
   * whose tower is still standing is skipped. So what an author places is
   * ground the swarm keeps re-taking, and what the board buys by killing
   * a tower is the waves until that spot comes up again.
   */
  private towerSpots: { x: number; y: number }[] = [];
  /**
   * IS THE MISSION'S SECOND CLOCK DISARMED? — true once there is nothing
   * left to launch, ever (runCrossers).
   *
   * It is a flag rather than a countdown because the schedule is absolute
   * now: when a launch is due is arithmetic on `time` and the pattern, so
   * the only thing the sim has to REMEMBER is whether the pattern and its
   * spare are spent. That is also what lets a jump work — there is no timer
   * left to be out of step with the clock (skipToTime).
   */
  private crossDone = false;
  /** is the field being swept by a jump rather than fought? — removeUnit
   *  reads it so a skipped train counts as neither killed nor leaked */
  private crossSweeping = false;

  /**
   * THE CONVOYS — the ESCORT mission's carts (levels.ts EscortMission),
   * the mirror of the crossers above and the other half of what
   * missions.ts's roads are for.
   *
   * A CART IS A STRUCTURE, and `struct` below is a real `Tower` object
   * with `team: "player"` on it — see the note on CONVOY_HP. It is
   * deliberately NOT in `towers`, never claims a cell in `cellTower` and
   * is never in the building index, so nothing that walks the board's
   * buildings can see it: it is not counted, not sold, not selected, and
   * it blocks no route. The ONE place it is offered is the swarm's target
   * search (nearestStructure), which is the whole of what "the swarm
   * shoots it like a turret" means.
   *
   * `s` is how far along its road it has driven, in world px, exactly as
   * a crosser's `ucrossS` is. `halt` is which of the mission's halts it
   * is waiting at (-1 while it is rolling) and `holdT` the seconds it has
   * left to wait there.
   */
  private convoys: {
    struct: Tower;
    road: number;
    s: number;
    /** the heading it is pointed on, radians: the road's own tangent, kept
     *  here rather than on the structure because a building has no facing */
    rot: number;
    halt: number;
    holdT: number;
    /** it reached the post: off the board, on the ledger */
    home: boolean;
    /** it was destroyed on the road */
    dead: boolean;
  }[] = [];
  /** convoys delivered, and convoys lost — the escort's whole ledger */
  convoyDone = 0;
  convoyLost = 0;
  /** carts rolled out so far, counting into EscortMission.pattern */
  private convoyOut = 0;
  /** true once there is nothing left to send (runConvoys) */
  private convoyEnd = false;
  /** the furthest any cart has got along its road, 0 to 1 — what the bar
   *  and the end screen read once there is nothing on the road (convoyAt) */
  private convoyBest = 0;

  /**
   * THE SIEGE — the RAZE mission's ledger (levels.ts RazeMission), the
   * third thing missions.ts's geometry is for, and the first mission whose
   * bodies STAND rather than walk.
   *
   * There is no per-section record here on purpose, and that is worth a
   * line because the two road missions both keep one. A crosser has state
   * of its own — where it is on the road, how much of it is left, whether
   * it got across — and so does a cart. A SECTION HAS NONE: it is a moment
   * in the schedule and a handful of bodies, and once they are on the
   * board they are ordinary bodies that the ordinary machinery kills. So
   * what the mission has to remember is three numbers.
   *
   * `razeRisen` is how many sections have been stood up, which is the
   * whole of the schedule's state (runSections reads it against the
   * clock). `razeKilled` is emplacements destroyed, counted at the one
   * door out (removeUnit) for the same reason a crosser's ledger is:
   * a railgun can leave the board killed, devoured or blown apart by a
   * cascade, and a count kept at the kill would miss two of those.
   */
  private razeRisen = 0;
  /**
   * THE SIEGE THE MAP CARRIES, or null where it carries none and the
   * mission's own sections are what rises (missions.ts siegeFromMarks).
   * Every emplacement is a place an author put a gun.
   */
  private siege: MarkSiege | null = null;
  /**
   * THE GROUND THE SWARM HOLDS, on every map and under every mission
   * (missions.ts garrisonsFor, missionMarks.ts GARRISON). Read once at
   * reset and never spent: a garrison whose bodies are still standing does
   * nothing on its later waves, and one that has been cleared is manned
   * again on the next one it names — so what an author draws is a place
   * the swarm keeps re-taking.
   */
  private garrisons: readonly MarkGarrison[] = [];
  /** railguns destroyed — the mission's whole objective */
  razeKilled = 0;
  /** the posts this map carries (missions.ts), empty on every other map */
  private posts: readonly Post[] = [];

  /**
   * THE WAVE EVERY BODY BELONGS TO, 1-based: the number loadStep staged
   * it under, and a brood member's is its parent's. A wave is cleared when
   * every body carrying its number is off the field — see wavesCleared,
   * which is what a HOLD is measured in (won) and what a LOSS is paid for
   * (MISSION_XP in economy.ts).
   */
  private readonly uwave = new Uint16Array(MAX_UNITS);
  /** bodies each wave has put on the field so far, by wave number (index
   *  0 unused) — the script's own and any brood born into it */
  private waveSpawned: number[] = [];
  /** bodies of each wave that have left the field: killed, devoured or
   *  blown up. removeUnit is the one door out, so it keeps this */
  private waveDown: number[] = [];
  /** has the wave finished ENTERING? Until its last body is through the
   *  door a wave is not clearable however empty the field looks */
  private waveEntered: boolean[] = [];
  /**
   * a never-reused identity, Mindustry's entity id. Indices are recycled by
   * swap-remove the instant anything dies, so anything that must remember a
   * particular unit across ticks — a piercing bullet's hit list — has to
   * hold this instead
   */
  readonly uid = shared.i32(MAX_UNITS);
  readonly ukind = shared.u8(MAX_UNITS); // UNIT_ID of the kind
  /**
   * KIND_FLYING[ukind[i]], denormalised to one read: the broad-phase loops
   * test every candidate's layer, and chasing kind -> flag through two
   * arrays is measurably slower than reading one
   */
  readonly ufly = shared.u8(MAX_UNITS);
  /** 1 = this unit is a NAVAL TANK: it steers by navalField, so the deep
   *  water is open to it, and it drives at NAVAL_LAND_SPEED whenever it is
   *  not on a water floor. Kept beside ufly rather than folded into it
   *  because the two answer different questions: ufly decides what may
   *  SHOOT at a unit, and this decides which field it walks. */
  readonly unav = shared.u8(MAX_UNITS);
  /**
   * THE SWARM'S GUNS (weapons.ts). Per unit: a reload clock per weapon
   * slot (MAX_WEAPONS wide), the structure it has picked to shoot, when
   * it next looks for one, and how long a held beam has left. The target
   * is an object reference rather than an index because towers are
   * spliced out from under everything when they are sold or wrecked.
   */
  private readonly ucd = new Float32Array(MAX_UNITS * MAX_WEAPONS);
  private readonly utT = new Float32Array(MAX_UNITS);
  /**
   * The held beam's clock and the charge's — public, because the renderer
   * draws both LIVE off the unit rather than off the effect pool: a starhart4's
   * beam is a thing the unit is doing for two and a half seconds, and the
   * ring a starhart5 gathers before it fires follows the hull. `ubeamT` is
   * seconds of beam left, `ucharge` seconds of charge left (weapons.ts
   * `charge`); `uheldRot` the heading the beam or charge is aimed on,
   * fixed when it began. UNIT_HELD names the weapon
   */
  readonly ubeamT = shared.f32(MAX_UNITS);
  readonly ucharge = shared.f32(MAX_UNITS);
  readonly uheldRot = shared.f32(MAX_UNITS);
  readonly utgt: (Aim | null)[] = new Array<Aim | null>(MAX_UNITS).fill(null);
  /**
   * THE SIGHT, REMEMBERED (updateUnitWeapons): the cell this body last
   * asked "can I see my target?" from (-1: not yet asked for this target),
   * and the answer. The question is put once per decision — a fresh pick,
   * or a new cell under the body — never once per tick.
   */
  private readonly utcell = new Int32Array(MAX_UNITS);
  private readonly uinview = new Uint8Array(MAX_UNITS);
  /**
   * WHICH STRUCTURE STANDS ON EACH CELL — every footprint cell of every
   * live tower, rock or ground, kept by claimGround. It is how a unit
   * finds something to shoot (nearestStructure) and how a shot in flight
   * knows it has arrived (updateEnemyShots): one read per cell, never a
   * walk of the tower list.
   */
  private readonly cellTower: (Structure | null)[] = new Array<Structure | null>(NCELLS).fill(null);
  /**
   * ...AND THE SAME THING AS A FLAG PER CELL, on memory both threads hold.
   *
   * `cellTower` holds the buildings themselves, which is what the sim needs
   * and exactly what cannot be shared. A placement only ever asks whether a
   * cell is taken (board.ts), so what crosses is the yes or no. Written in
   * the one place a structure appears or leaves (claimGround), so the two
   * cannot disagree.
   */
  readonly occupied = shared.u8(NCELLS);
  /**
   * THE POWER GRID: 1 on every cell the core or a connected beacon lights.
   *
   * NOTHING IS BUILT ANYWHERE ELSE (board.ts poweredClear) and nothing
   * standing anywhere else fires (fireTowers). It is the one grid in this
   * game the PLAYER draws: the core lights a generous piece of home ground
   * for free, and every cell past that edge was paid for with a mast.
   *
   * SHARED, for the reason `occupied` is shared and then some. The build
   * cursor tests a footprint against it every frame, and the overlay paints
   * the WHOLE of it while a card is in hand — neither can wait on this
   * thread for an answer, so the answer lives in memory both threads hold.
   *
   * REBUILT, NEVER PATCHED (rebuildPower). A mast going down can darken
   * ground on the far side of the board, because the grid is a TREE rooted
   * at the core rather than a union of discs — so there is no incremental
   * edit that is correct, and the whole thing is repainted on the few
   * events that can move it: a beacon built, a beacon lost, a new board.
   */
  readonly powered = shared.u8(NCELLS);
  /**
   * ...and a counter that goes up every time it is repainted, so the
   * drawing side knows its overlay layer is stale without diffing 262,144
   * cells to find out (simreport.ts HDR.POWER).
   */
  powerVersion = 0;
  /**
   * THE SCALARS THE GAME READS, one slot each, on shared memory — the
   * clock, the count, the purse, the wave (simreport.ts HDR). Written by
   * writeHeader after every step and every command, read by the game
   * directly, so the frame loop's own questions never wait on a message.
   */
  readonly header = shared.f64(HEADER_LEN);
  /** the swarm's bullets, missiles and shells in flight (see EnemyShot) */
  readonly shots: EnemyShot[] = [];
  /** runts that went off on a structure: gone, and paid for by no one */
  exploded = 0;
  /** HB_HEAVY[ukind[i]], same reasoning — the physics split reads it per
   * candidate */
  readonly uheavy = shared.u8(MAX_UNITS);
  /**
   * this walker's sideways bias in [-1, 1]: how far off the flow line it
   * prefers to walk. Wanders on a multi-second clock, so two units that
   * left the same pad a moment apart are soon aiming at different lanes and
   * the stream between them widens into a band. Unused by flyers, which
   * steer straight at the base and are never nudged off it
   */
  readonly ulat = new Float32Array(MAX_UNITS);
  /**
   * scratch, rebuilt every frame: unit-length travel direction, zeroed for
   * anyone standing still, boxed in too tight to step aside, or airborne.
   * Only the physics pass reads it, to decide which way an overlap should
   * resolve — a zero here means resolve it the way Mindustry always did
   */
  private readonly uhx = new Float32Array(MAX_UNITS);
  private readonly uhy = new Float32Array(MAX_UNITS);
  // animation state, sim-owned so it survives swap-remove: distance walked
  // (drives the mech leg cycle), chassis angle, body angle
  readonly uwalk = shared.f32(MAX_UNITS);
  readonly ubrot = shared.f32(MAX_UNITS);
  readonly urot = shared.f32(MAX_UNITS);
  // --- legged units (UnitStats.legs) ---
  // A leg is two segments between three points: the mount (derived from the
  // body every frame), the knee JOINT, and the FOOT, which is planted in
  // the world and only moves when the gait lifts it. Both live here, MAX_LEGS
  // slots per unit, so a leg keeps its footing across frames — and across
  // the swap-remove that recycles a dead unit's index
  readonly ulegFX = shared.f32(MAX_UNITS * MAX_LEGS);
  readonly ulegFY = shared.f32(MAX_UNITS * MAX_LEGS);
  readonly ulegJX = shared.f32(MAX_UNITS * MAX_LEGS);
  readonly ulegJY = shared.f32(MAX_UNITS * MAX_LEGS);
  /** how far through its swing each leg is, 0..1 — the renderer lifts a
   * stepping foot by it, and it eases back to 0 when the unit stands still */
  readonly ulegStage = shared.f32(MAX_UNITS * MAX_LEGS);
  /** one bit per leg: is it mid-swing this frame? Eight bits is the whole
   * budget — see the MAX_LEGS guard above */
  readonly ulegMove = shared.u8(MAX_UNITS);
  /** Mindustry LegsComp.totalLength: px walked, the gait's clock */
  readonly ulegT = new Float32Array(MAX_UNITS);
  /** LegsComp.curMoveOffset: the smoothed lean the whole gait takes into
   * the direction of travel, so feet land ahead of a walking body */
  readonly ulegOX = new Float32Array(MAX_UNITS);
  readonly ulegOY = new Float32Array(MAX_UNITS);
  /** THE WORM RIG'S CHAIN (levels.ts SegmentSpec): every segment's world
   *  position, MAX_SEGS per unit, dragged behind the head by
   *  updateSegments and read back by Renderer.pushSegments */
  readonly usegX = shared.f32(MAX_UNITS * MAX_SEGS);
  readonly usegY = shared.f32(MAX_UNITS * MAX_SEGS);
  /** the swim's phase per unit (SegmentSpec.wavelength), rad */
  readonly usegPh = new Float32Array(MAX_UNITS);
  // --- naval hulls (UnitStats.wake) ---
  // The path the hull has taken, WAKE_PTS world points per unit, oldest
  // first: the wake is drawn along it. Like a leg's foot these are world
  // positions rather than offsets, so they travel with the unit through
  // swap-remove or the wake of whatever is recycled into a dead boat's
  // index snaps across the map.
  readonly uwakeX = shared.f32(MAX_UNITS * WAKE_PTS);
  readonly uwakeY = shared.f32(MAX_UNITS * WAKE_PTS);
  /** how many of the WAKE_PTS slots have been written — a hull that has
   *  just spawned trails a stub that grows to its full length */
  readonly uwakeN = shared.u8(MAX_UNITS);
  /** seconds until the next sample (see KIND_WAKE_DT) */
  readonly uwakeT = new Float32Array(MAX_UNITS);
  n = 0;
  private nextId = 1;

  level: LevelSpec = WORLDS[0];
  totalEnemies = 0;
  kills = 0;
  /**
   * Bodies EATEN by hungry units (the Hungry mutator) — removed from the
   * field without ever having been killed or leaked.
   *
   * It is its own counter and not a kill because the HUD's kill count is
   * what the player's towers did, and crediting them with a meal they had
   * no part in is a lie on the one number that says how the run is going.
   *
   * IT NO LONGER HAS TO BE PAID BACK ANYWHERE. It used to come off
   * `remaining()`, because that was a ledger and a body eaten had to be
   * credited or a wave that ate itself could never be finished. remaining()
   * counts the field and the unsent script now, so an eaten body stops
   * counting by being gone. This is a REPORT NUMBER, as `merged` is.
   *
   * killsByKind — the drop ledger — is deliberately untouched, which is the
   * whole "hungry enemies do not drop more materials" rule: what is eaten
   * pays nothing, and the eater still pays exactly its own kind's drop.
   */
  devoured = 0;
  /**
   * FOLDS the squeeze has made (mergeSqueezed): rows taken off the field
   * by folding into a neighbour. Unlike `devoured` this does NOT come off
   * remaining(): a folded body is still on the field inside its survivor,
   * whose death counts for the whole stack. It is a report number — how
   * much a jam had to be thinned.
   */
  merged = 0;
  /** kills per unit kind this run, indexed like UNIT_KINDS — the drop payout */
  readonly killsByKind = new Int32Array(UNIT_KINDS.length);
  /**
   * THE CORE (types.ts): the building the swarm is on the map to knock
   * down. Built by reset() where the map's base stands, with CORE_HP to
   * lose; it sits in cellTower like a turret so every unit's guns find it,
   * and the run ends the moment it is gone (lost). Nothing leaks any more:
   * a body that reaches the core stays there and chews on it.
   */
  core!: Core;
  /**
   * THE MISSION'S CLOCK, in seconds of run time: a survive mission is won
   * the moment `time` reaches it. 0 on every mission that is not kept to a
   * clock, which is what missionProgress branches on.
   */
  deadline = 0;
  /**
   * HOW MANY LEVELS THE TIDE HAS RISEN, and HOW MANY CYCLES DEEP IT IS
   * (see TIDE_LEVELS at the top of the file). A script that runs out
   * under an open mission sends its tail again, TIDE_LEVELS heavier every
   * time round, so `loopLevel` is TIDE_LEVELS x `loopCycle` and the health
   * multiplier the HUD prints is 2^loopCycle.
   *
   * THEY ARE THE WHOLE OF THE INFINITE CLIMB. Nothing else about a cycle
   * differs from the one before it: same waves, same counts, same families
   * — a level is health and only health (ladder.ts).
   */
  loopLevel = 0;
  loopCycle = 0;
  /**
   * THE RUN'S MONEY (economy.ts). Opens at SCRAP_START and climbs off the
   * CORE, on the run clock and nothing else: no kill pays, no wave pays,
   * and a sale refunds SELL_REFUND of the price. Charged only under a tech
   * state — a sandbox or an editor (tech null) builds for free and the
   * counter just runs.
   */
  scrap = SCRAP_START;
  /** scrap the core has paid out — the tally the results screen reads */
  scrapEarned = 0;
  /** the fraction of a scrap the income is carrying between steps: the
   *  rate is per SECOND and a step is a sixtieth of one, so the purse only
   *  ever moves in whole scrap */
  private incomeCarry = 0;
  // which towers may be built and how many of each — null (the default, and
  // the map editor's mode) places no restrictions; the campaign sets it from
  // the save's level through the track before play (see Game.setTech)
  private tech: TechState | null = null;
  /**
   * THE BOTTOMLESS PURSE — the admin view's unlimited income.
   *
   * It is deliberately NOT the old "tech null builds for free" road. Free
   * building switches the whole economy off: no deal, no mod rolls, no
   * prices, which is the one thing the sandbox must not do when the point
   * of the sandbox is to look at the deal. So the run stays CHARGED and
   * the money simply never runs out — same prices, same odds, same corner.
   *
   * The player's real balance is parked in `purseWas` while it is on and
   * handed back when it goes off, so a run dropped into the sandbox and
   * pulled out again comes back with the scrap it actually earned rather
   * than a sandbox fortune.
   */
  private rich = false;
  private purseWas = 0;
  /**
   * EVERY TURRET AS THIS SAVE HAS UPGRADED IT — the stats each kind on the
   * field actually fires with, standing in for the stock TOWERS entry.
   *
   * It is a CACHE, refreshed only when one of its two inputs moves: the
   * save's points (setTech) and the number of each kind standing
   * (refreshSpecs on the spot when the player buys; a per-kind recount at
   * the step's end for whatever was placed or lost, see oweCount).
   * Neither can change between those moments, and tacker power's per-tacker
   * damage would otherwise mean a head count of the whole board on every
   * bullet — five hundred scans a tick to recompute a number that did not
   * move.
   *
   * A kind with nothing bought is simply absent, and statsFor falls back to
   * the shared stock object — so an un-upgraded save pays nothing at all
   * for these branches existing.
   */
  private specs = new Map<TowerKind, TowerStats>();
  /**
   * HOW MANY TIMES THE TABLE HAS BEEN RECOMPOSED. The drawing side keeps
   * its own copy of it (World.statsFor — a bullet is drawn with the stats
   * it was fired with), and this is how it knows the copy has gone stale
   * without being sent the whole table every frame (simreport.ts).
   */
  specsVersion = 0;

  /** the composed table as entries — what crosses when specsVersion moves */
  specTable(): [TowerKind, TowerStats][] {
    return [...this.specs];
  }

  /** how deep the placement batch is (batchPlacement), and whether a FULL
   *  refresh is owed — a purchase made inside a batch. Paid at the batch's
   *  end or the step's end, whichever comes first (flushSpecs) */
  private specsHold = 0;
  private specsPending = false;
  /** the kinds whose HEAD COUNT moved since the last flush — a turret of
   *  the kind placed, wrecked, sold or conquered (oweCount). Only a kind
   *  with a count-reading rung bought is recomposed for it (countSensitive) */
  private readonly countsOwed = new Set<TowerKind>();
  /**
   * THE RUN'S MODS (mods.ts), id to how many copies of it are owned — a
   * TALLY, because a mod is a number that grows and a run may hold any
   * number of copies.
   *
   * IT IS RUN STATE AND NOT SAVE STATE. Nothing here survives a reset: a
   * mod is bought in scrap inside one mission and is gone with it, which
   * is what makes it a different thing from the tech tree's rungs
   * (upgrades.ts) that the save owns forever.
   *
   * NOTHING READS IT PAST THE PLACEMENT. A mod is rolled once into
   * Tower.mods and the attribute lives on the structure from then on; the
   * ledger is here so that a copy bought mid-wave can re-compose the
   * turrets already standing (resolveTower).
   */
  private mods: Partial<Record<ModId, number>> = {};
  /**
   * ...AND THE RUN'S RELICS (relics.ts), which are a SET and not a tally:
   * a relic is a rule in force, held once, and a rule does not get more
   * in force. The two categories keep two ledgers because they are two
   * categories — they used to share one behind a `scope` field, and the
   * cap that stopped a relic being offered twice was arithmetic on a
   * count that could only ever be 0 or 1.
   *
   * Run state, exactly as the mods are. The four relics that are stat
   * surgery are folded into every kind's spec (refreshSpecs) and the rest
   * are read BY NAME at the one site each of them happens — a kill's
   * drop, a turret's death, the damage chokepoint. The five that answer a
   * T5 swarm are pre-read into the flags below, so the hot loop tests a
   * number rather than a Set.
   */
  private relics = new Set<RelicId>();
  /**
   * THE ANTI-T5 RELICS, PRE-READ (relics.ts, and see `relics` above).
   * Every one of the four is checked inside Sim.damageUnit or Sim.killUnit —
   * the chokepoints every damage path and every death in the game passes
   * through — so what they must never be is a Set lookup per hit. They
   * are refreshed together whenever the run's relics change (takeRelic).
   *
   *   armorBlind  Monofilament Rounds: armour stops applying, full stop
   *   titanOn     Titan Rounds: a round gains a quarter a tier (TITAN_MUL)
   *   executeAt   Terminal Protocol: the fraction of its own pool a body
   *               dies at, or 0 for "nothing is executed"
   *   cascadeOn   Cascade Charges: a heavy hull detonates where it falls
   */
  private armorBlind = false;
  private titanOn = false;
  private executeAt = 0;
  private cascadeOn = false;
  /**
   * WHAT CASCADE CHARGES HAS LEFT TO SET OFF — a queue rather than a call,
   * and it has to be one. A detonation damages units, a damaged unit can
   * die, and a death is what queues a detonation: done in place it would
   * be killUnit recursing into itself through Sim.splash, in the middle
   * of the swap-remove that killUnit is halfway through. So a death only
   * WRITES here, and the blasts go off once a frame at a point where no
   * removal is in flight (drainCascades).
   */
  private readonly cascades: { x: number; y: number; r: number; dmg: number }[] = [];
  /** is the Hungry mutator in force this run? (see reset) */
  private hungryOn = false;
  /**
   * Is the Speedy mutator in force this run? (see reset)
   *
   * It is read in exactly two places — the spawn, where it doubles the
   * unit's stat speed once and for all, and applyWet, where it refuses the
   * slow. Nothing in the per-tick movement pass knows the mutator exists.
   */
  private speedyOn = false;
  /** is the Armored Swarms mutator in force this run? (see reset) — read
   *  at the spawn only, where it plates the light bodies once */
  private armoredOn = false;
  /**
   * THE MULTIPLIER EVERY SHIELD POOL, CAP AND REGEN CARRIES: 1 normally,
   * OVERSHIELD_SCALE under Overshields (mutation.ts), and it covers unit
   * force fields and shield tower domes alike.
   *
   * It is a field rather than a call because it used to be one — a rung's
   * shieldScale, looked up per spawn and per ability tick from the enemy
   * level. The ladder does not scale shields any more, so what is left is
   * a run-long constant: read once here, and every reader of a shield
   * spec's max/amount/regen multiplies by it or the pool and its refill
   * would disagree.
   */
  private shieldScale = 1;
  /** are ambient effects being kept? (see setEffects) */
  private fxOn = true;
  // live per-kind census, updated the moment a unit spawns or is removed
  readonly aliveByKind = shared.i32(UNIT_KINDS.length);
  // the level script's cursor, plus the live state of the step it points at:
  // a wave counts down per kind, a wait counts down in seconds
  private stepIdx = 0;
  /**
   * HOW MANY WAVES THERE ARE TO SEND, and how many have been STAGED by
   * loadStep. Staging runs one waveGap ahead of the wave entering, so
   * currentWave() backs this off by one while that gap is still running: a
   * wave stays current through the wait that follows it.
   *
   * `totalWaves` GROWS. Every turn of the tide adds its cycle's waves to it
   * (loadStep), because it is what the sandbox's jump is bounded by and
   * what the XP shares are dealt over — both of which are questions about
   * what this RUN will send, not about what the document holds. The
   * document's own count is `scriptWaves`, and it never moves.
   */
  totalWaves = 0;
  private wavesStarted = 0;
  /**
   * HOW MANY NON-EMPTY WAVES THE AUTHORED SCRIPT HOLDS — fifty on the
   * shipped campaign, fixed for the run however many times the tide turns.
   * It is what a hold mission with no `waves` of its own is measured
   * against (levels.ts holdWaves) and what the tide's cycle is cut from.
   */
  scriptWaves = 0;
  /** index of the script's last non-empty wave — the end the tide walks back from */
  private lastWaveIdx = -1;
  /**
   * SUFFIX SUMS OVER THE SCRIPT: `scriptLeft[i]` is how many bodies every
   * step from `i` to the end of the script still holds, so
   * `scriptLeft[stepIdx + 1]` is everything the cursor has NOT reached, in
   * one read. Built once by stageScript and never touched again — it
   * describes the script, not the run.
   *
   * IT IS THE REASON remaining() NEEDS NO LEDGER. A counter that has to be
   * paid down every time a body leaves the field by some new door — eaten,
   * exploded, folded, swept off by a wave skip — is a counter that goes
   * wrong the first time someone adds a door and forgets. This is derived
   * from where the cursor IS, so a jump that walks past thirty waves stops
   * counting them by arithmetic rather than by remembering to.
   *
   * Length is script.length + 1 so the last entry is always a real 0 and
   * the read past the end needs no branch of its own.
   */
  private scriptLeft: number[] = [0];
  /**
   * THE WAVES CURRENTLY WALKING ONTO THE FIELD — more than one at a time,
   * and that is the whole of what "everything syncs to time" means here.
   *
   * THERE USED TO BE EXACTLY ONE. The script held a single loaded wave, a
   * countdown to it and one drain credit, and the next wave was loaded when
   * the last had finished spawning. Which made the CLOCK A CONSEQUENCE OF
   * THE BOARD: a wave whose drop zones were packed released slowly, and
   * every wave behind it — and with it the tide, the stages, the whole run
   * — arrived late. Two players on the same script at the same difficulty
   * could be four minutes apart at wave forty, and nothing on screen said
   * why.
   *
   * NOW THE CLOCK IS THE SCRIPT (waveStartTime). Wave n lands at its
   * moment whatever the board is doing, so a wave that cannot get through
   * the doors simply keeps releasing WHILE the next one starts. Nothing is
   * lost — a failed spawn holds its credit (runScript) — and nothing is
   * delayed: congestion now costs a thicker field rather than a longer
   * run.
   *
   * OLDEST FIRST when they drain, so a backlogged wave clears the doors
   * ahead of a fresh one and the field cannot invert the order it was
   * authored in.
   *
   * `rate` is the wave's OWN size over WAVE_RELEASE_SECONDS, fixed when it
   * is staged rather than recomputed from what remains — a rate derived
   * from the remainder would decay as the wave drains and stretch its tail
   * out for as long again. `acc` is its drain credit.
   */
  private live: {
    wave: number;
    entries: { kind: number; left: number; total: number }[];
    rate: number;
    acc: number;
  }[] = [];

  /** seconds of simulated time since the level was reset (Time.time) */
  time = 0;

  /** every standing turret and wall, the SWARM's included — see Tower.team */
  towers: Tower[] = [];
  /** the box each side's buildings stand in, and whether the board has
   *  moved under it — see structBox() */
  private readonly structBoxCache = { x0: 0, y0: 0, x1: 0, y1: 0, n: 0 };
  /** the aim index (structBox) is owed a full rebuild — true only from
   *  the reset until the first search; every add and removal after that
   *  keeps it exact in place (indexStructure) */
  private structBoxDirty = true;
  /**
   * EVERY STRUCTURE, FILED BY SQUARE (AIM_BLOCK) — the aim index's coarse
   * half, rebuilt beside the box on the same flag and from the same walk. An
   * empty square holds null rather than an empty array, so a sweep over open
   * ground is one read and one branch a square and nothing else.
   */
  private readonly structBlocks: (Structure[] | null)[] = new Array<Structure[] | null>(
    AIM_BCOLS * AIM_BROWS,
  ).fill(null);
  /** the widest half-footprint standing, so a square ring's lower bound on
   *  distance stays honest for a building whose middle sits a ring further
   *  out than the wall a body would actually reach */
  private structMaxHalf = 0;
  /** the player's shots in flight, as lanes — see projs.ts for why */
  readonly projs = new Projs();
  /** the stats and bucket span of each (kind, frag, alt) met in ONE pass of
   *  updateProjectiles — cleared at the top of every pass */
  private readonly bulletTbl: (BulletStats | null)[] = new Array(TOWER_KINDS.length * 4).fill(null);
  private readonly bulletSp = new Float64Array(TOWER_KINDS.length * 4);
  private readonly bulletFl = new Uint8Array(TOWER_KINDS.length * 4);
  private readonly bulletBrad = new Float64Array(TOWER_KINDS.length * 4);

  /**
   * THE RUN'S SHIELD TOWERS (the Shield Towers mutator, mutation.ts) —
   * empty unless the rule was rolled. Entries are appended as shieldTowers
   * emerge and NEVER removed or reordered (a dead shield tower keeps its slot at
   * hp 0), so an index into this array is stable for the whole run and
   * everything — tower aim, the player's mark, a pierce shot's
   * been-there list — holds indices freely.
   */
  readonly shieldTowers: ShieldTower[] = [];
  /** is any shield tower's dome standing this tick? — the projectile pass's
   *  cheap gate on the absorb sweep, refreshed by updateShieldTowers */
  private domesUp = false;
  /** is the Shield Towers mutator in force this run? (see reset) */
  private shieldTowersOn = false;
  /** seconds until the next shield tower tries to rise */
  private shieldTowerT = 0;

  /**
   * THE PLAYER'S FOCUS MARK — one tapped target the whole board is told
   * about (setFocus*). Either a unit (uid + index hint, maintained across
   * swap-removes exactly as fldI is) or a shield tower index; never both. Every
   * turret that can reach the mark drops what it was doing for it.
   */
  private inspectUid = -1;
  private inspectIdx = -1;
  private inspectShieldTower = -1;
  /**
   * ...and the third kind of mark: one of the SWARM's conquered turrets
   * (Conquest, mutation.ts), held by reference rather than by index — a
   * building has no uid, and its cells are what say whether it still
   * stands. Null in every run without the rule.
   */
  private inspectTower: Tower | null = null;

  /** is the Volatile mutator in force this run? (see reset) */
  private volatileOn = false;

  /** is the Amphibious rule in force this run? (see reset) */
  private amphibiousOn = false;
  /** is the Mitosis mutator in force this run? (see reset, and splitUnit
   *  for what a death then leaves behind) */
  private mitosisOn = false;
  /**
   * CONQUEST (mutation.ts): is the swarm taking the wrecks? The one flag
   * that puts buildings on the swarm's side of the board — in a run
   * without it `enemyTowers` stays 0 and every team test in this file is
   * a comparison that has already been decided.
   */
  private conquestOn = false;
  /**
   * How many of the standing towers are the SWARM's. It is the gate every
   * enemy-building scan opens on (the shot sweeps, the player's idle
   * turrets, the splash), so an ordinary run pays one integer test where
   * it would otherwise pay a grid walk.
   */
  private enemyTowers = 0;
  /** RECONSTRUCTION (mutation.ts): does a body get back up? */
  private reconstructOn = false;
  /** LEADERSHIP (mutation.ts): is the tier-five aura in force? */
  private leadershipOn = false;
  /** the aura's own beat, counted down once for the whole field rather
   *  than per carrier: every leader stamps on the same tick */
  private leadT = 0;
  /** MECH VIRUS (mutation.ts): are a few of the bodies carrying it? */
  private virusOn = false;
  /**
   * THE CORPSES WAITING TO STAND UP (updateCorpses). A body killed under
   * Reconstruction leaves the field at once — it is off the physics, off
   * the crowd and off the drop zones while it waits — and this holds what
   * is needed to put the same body back: its kind, where it fell, which
   * wave answers for it, and the two clocks (`t` to the rise,
   * `grace` to giving up on a spot that never opens).
   */
  private corpses: { kind: number; x: number; y: number; wave: number; t: number; grace: number; stack: number }[] = [];

  /**
   * WHICH CELLS THE HYDROPHOBIC RULE TAXES — 1 where a turret's reload
   * runs at HYDROPHOBIC_RATE, 0 everywhere else. Null on the ordinary run
   * where the rule is not in force, which is also the cheap test: the mask
   * is only ever BUILT on a map that carries the rule.
   *
   * It is terrain, so it is built once per level and never touched again
   * (buildWaterlogged). A tower reads it exactly once, when it is placed.
   */
  private waterlogged: Uint8Array | null = null;

  /**
   * WHICH CELLS ARE WATER — 1 on any water floor, shallow or deep. Two
   * rules read it, and they read the same array on purpose: the Amphibious
   * mutator's stacks (a walker stepping into the wet) and the naval tanks'
   * pace (NAVAL_LAND_SPEED, charged on every cell that is not in here).
   *
   * Deep water is in the mask even though no walker can ever stand on it:
   * leaving it out would be a second, subtly different definition of
   * "water" from the one the map, the renderer and Hydrophobic all use,
   * and the cells it would drop are ones the ground layer cannot reach
   * anyway (they are blocked). One meaning of water, in one place.
   *
   * Unlike the Hydrophobic mask beside it this is built on EVERY run, not
   * only the ones a mutator asks for it: the naval pace is a rule of the
   * game rather than a roll of the dice.
   */
  private waterCells: Uint8Array = new Uint8Array(NCELLS);

  // --- effects, in struct-of-arrays like the units ---
  // These used to be an array of small objects, allocated on every push —
  // and a cleaver-heavy board at 8x speed pushes thousands a second, which is
  // steady GC pressure timed exactly to the busiest frames. The pool is
  // flat typed arrays with a live count and swap-remove, so a push is a
  // handful of stores and an expiry allocates nothing. The renderer reads
  // these directly (see its effects passes); everything an old Effect
  // object carried has a lane here, with fxHasCol standing in for the
  // optional colour and fxPts — the one field that is genuinely a list,
  // coil's bolt path — kept as a parallel ref array that swap-removes in
  // step and only ever holds an array while a bolt is alive.
  fxN = 0;
  readonly fxX = shared.f32(FX_MAX);
  readonly fxY = shared.f32(FX_MAX);
  readonly fxAge = shared.f32(FX_MAX);
  readonly fxTtl = shared.f32(FX_MAX);
  readonly fxKind = shared.u8(FX_MAX);
  readonly fxRot = shared.f32(FX_MAX);
  readonly fxLen = shared.f32(FX_MAX);
  readonly fxSeed = shared.i32(FX_MAX);
  readonly fxSides = shared.u8(FX_MAX);
  /** UnitSpawn's kind id — meaningless (0) for every other kind */
  readonly fxUnit = shared.u8(FX_MAX);
  /** Effect.at's optional colour: the rgb lanes are only meaningful where
   * fxHasCol is set — a reused slot's stale colour must never leak */
  readonly fxHasCol = shared.u8(FX_MAX);
  readonly fxColR = shared.f32(FX_MAX);
  readonly fxColG = shared.f32(FX_MAX);
  readonly fxColB = shared.f32(FX_MAX);
  readonly fxPts: (readonly number[] | null)[] = new Array<readonly number[] | null>(
    FX_MAX,
  ).fill(null);

  /**
   * THE BROAD PHASE'S BUCKETS. Shared and readable from outside, unlike the
   * rest of the hash, because a PLACEMENT asks "is a body standing here"
   * through them (board.ts) and the drawing side has to be able to ask that
   * without crossing a thread. `bCount` is scratch for the sort and stays
   * the sim's own.
   */
  readonly bStart = shared.i32(HN + 1);
  readonly bUnits = shared.i32(MAX_UNITS);
  private readonly bCount = new Int32Array(HN);
  /**
   * The largest radius STANDING on each layer this tick, and the per-kind
   * physics spans derived from it (see updateAliveBounds). The static
   * kindSpan / HIT_SPAN bounds are sized to the biggest unit on the whole
   * roster, so every ironhide1's broad phase paid scan area for a dartback5
   * that is almost never on the field; these shrink each bound to what is
   * actually alive, which changes no query's RESULT — only its cost.
   */
  private rmaxAliveGround = 0;
  private rmaxAliveAir = 0;
  /** physics span per kind against ANY live partner on its layer — what a
   * heavy scans, since a heavy owns every pair it is in */
  private readonly kindSpanDyn = shared.i32(UNIT_KINDS.length);
  /** physics span per kind against SMALL live partners only — what the
   * swarm scans, its heavy pairs being the heavies' job (see HB_HEAVY) */
  private readonly kindSpanSDyn = shared.i32(UNIT_KINDS.length);
  /** live head counts per layer — they let a turret whose target layer is
   * empty skip its scan outright. Snapshots from the top of the tick, so
   * mid-tick deaths only ever leave them high (a scan that finds nothing),
   * never low (a scan wrongly skipped) */
  private nAliveAir = 0;
  private nAliveGround = 0;
  // physics scratch positions: start each tick at upx/upy, get mutated by
  // the pairwise resolution, and the difference is that tick's crowd shove.
  // Never swapped in removeUnit — fully rebuilt every tick before use
  private readonly phx = new Float32Array(MAX_UNITS);
  private readonly phy = new Float32Array(MAX_UNITS);
  /** this tick's crowd shove per body, as a displacement (physkernel.ts) */
  readonly ushx = shared.f32(MAX_UNITS);
  readonly ushy = shared.f32(MAX_UNITS);
  /** the kernel's tables, scratch and output, for the run in this thread */
  private readonly physTables: PhysTables = {
    HB_A, HB_B, HB_OUTER, HB_OVAL,
    spanDyn: this.kindSpanDyn,
    spanSDyn: this.kindSpanSDyn,
  };
  private readonly physScratch: PhysScratch = { phx: this.phx, phy: this.phy, uhx: this.uhx, uhy: this.uhy };
  private readonly physOut: PhysOut = {
    shx: this.ushx, shy: this.ushy, sqzJ: this.usqzJ, sqzU: this.usqzU, sqzD: this.usqzD,
  };
  /** the crowd shove's thread (physport.ts), or null: the kernel runs here */
  private physPort: PhysPort | null = null;
  /** ticks stepped since construction — the physics handshake's clock, and the thinking's stagger */
  private tick = 0;
  // THE CACHED DECISION (THINK_STRIDE): the flow heading, the steering
  // forces, the doorway jitter, and the cell the body last thought in
  private readonly uthx = new Float32Array(MAX_UNITS);
  private readonly uthy = new Float32Array(MAX_UNITS);
  private readonly ufcx = new Float32Array(MAX_UNITS);
  private readonly ufcy = new Float32Array(MAX_UNITS);
  private readonly ujx = new Float32Array(MAX_UNITS);
  private readonly ujy = new Float32Array(MAX_UNITS);
  private readonly ucellT = new Int32Array(MAX_UNITS);
  /**
   * the carriers standing a force field this projectile pass, by unit
   * index. Gathered at the top of the pass — after every earlier step that
   * can swap-remove a unit — and kept straight through the pass itself by
   * removeUnit, which is free to reshuffle indices out from under it as
   * shots kill what they hit
   */
  private readonly fldI: number[] = [];
  private fldN = 0;
  private readonly flowTmp: Vec2 = { x: 0, y: 0 };
  // every goal cell's centre in world px, as flat x,y pairs — what a
  // spawning flyer scans to pick its destination. One entry (the base's
  // centre) on a map with no goal layer, so the old behaviour is the
  // one-goal case of the new one rather than a separate path
  private goalPts = new Float32Array(2);
  /**
   * The naval tanks' flow field — the amphibious layer's twin of `field`.
   * Same rock, the same structures soft, the same core to aim at; the one
   * difference is the mask (navalWalkMask), which hands the deep water
   * back. Built on every map, because there is no map a naval tank has
   * nowhere to drive on.
   */
  readonly navalField = new FlowField();
  /**
   * The air layer's doors: the spawn tiles a flyer may use (padMaskFor).
   * Flyers keep their pads here rather than in `airField.spawnPts` because
   * a door is not a route — what stops a flyer flying is nothing, so the
   * field below decides where it goes from a tile, not whether it may land
   * on one.
   */
  private airPads: number[] = [];
  /**
   * ...and the part of that list that is OPEN SKY: a pad the air field has
   * a heading at. Spawn tiles are open ground by construction (maps.ts
   * clampSpawn), so this is rarely smaller — what it still catches is a
   * pocket of tiles ringed by rock, which would drop a flyer with no route
   * out of it and leave it flying the fallback straight line. A layer with
   * NO open pad keeps every pad it has: a door that only opens inside a
   * pocket is still a door.
   */
  private airOpen: number[] = [];
  /**
   * THE FLYERS' FIELD — the third of the three, over airWalkMask: hills
   * are its walls, and nothing else on the map is. A flyer used to hold
   * one straight line from its door to the core, which crossed whatever
   * the line happened to cross; it steers by this instead, so it comes
   * round a mountain the way the rest of the swarm does and only crosses
   * one where there is no way round.
   *
   * A HILL IS A WALL, and it is the only one a flyer has. updateUnits
   * collides every airborne body against THIS field's mask — so a mountain
   * stops one exactly as it stops a walker, and the route above is a route
   * the body is actually held to rather than advice a crowd shove could
   * push it through.
   *
   * It used to be a detour and nothing more: no wall test in updateUnits
   * applied to a flyer, so the crowd could shove one inside a peak and
   * bodies ended up sitting in rock. The safety valve from those days is
   * kept and still earns its place — the field has no heading inside a
   * hill, airHeading falls back to the straight line at the core, and the
   * slide lets a body already inside rock move freely until it is out. A
   * hill stops a flyer; it never traps one.
   *
   * Structures are not in it (the footprint list is empty): a turret is
   * something to fly over, not around. Which is also why it is never
   * dirtied — building and selling cannot change it, only a new map can.
   */
  readonly airField = new FlowField();
  /**
   * WHERE THE HILLS ARE (airWalkMask), kept because two different questions
   * ask it: what a flyer routes around, and what a shot cannot be taken
   * through (hasSight). Rebuilt with the terrain and never after.
   */
  private hills: Uint8Array = new Uint8Array(NCELLS);
  /** the player's BUILDINGS currently selected — a gathered row to sell or inspect */
  private readonly selStructs = new Set<Structure>();
  // seal-test cache: hover asks canPlace every frame, and the test costs two
  // flow-field recomputes — remember the verdict for the last cell asked
  /**
   * THE FIELDS NEED RE-SOLVING: a structure was placed on, or wrecked off,
   * open ground. Placement marks the CELLS at once (so the next canPlace,
   * every wall test and the seal check see them) and the solve — the
   * expensive part, a Dijkstra and a sweep over the whole grid — is put
   * off: until the board has held still for FIELD_SETTLE, or
   * FIELD_MAX_STALE has run out, whichever comes first.
   *
   * A DRAG IS THEREFORE ONE SOLVE, not one per turret. That is the whole
   * of why this is deferred: the fields' cost used to be paid per
   * placement, so laying a chain of turrets cost a full solve every frame
   * and the frame rate fell to the solve rate.
   *
   * ...and that one solve is itself taken a slice a frame (solveQueue,
   * FlowField.advance), because a single turret laid on its own still owes
   * a whole solve and a whole solve is a dropped frame. Deferring alone
   * moved the stutter from every placement to the last one; slicing is
   * what takes it off the frame altogether.
   */
  private fieldDirty = false;
  /** ...the naval tanks' twin of it, flagged apart so a map with no tank
   *  out never pays for the second solve */
  private navalDirty = false;
  /** seconds since the last structure change — the settle clock */
  private fieldQuiet = 0;
  /** seconds a pending solve has been waiting — the staleness cap */
  private fieldStale = 0;
  /**
   * THE SOLVES IN FLIGHT, head first: fields whose masks have moved and
   * whose new routes are being worked out a slice a frame (runSolveQueue).
   */
  private solveQueue: FlowField[] = [];
  /**
   * A WALL MOVED and the bodies standing there have not been pushed off it
   * yet. Separate from the solve because it is cheap and must not wait: a
   * unit inside a turret's footprint is shoved out on the very next tick,
   * however long the route behind it takes to catch up.
   */
  private unstickPending = false;

  /** a Sim is always born on a level — building a default world and then
   * calling loadLevel solved the flow field twice and threw the first away */
  /**
   * `solver` is the line to the route solver's thread (fieldport.ts), handed
   * in by whoever builds a sim inside a browser — the page spawns the
   * thread, never the sim; the headless tools pass nothing and solve in
   * slices (see fieldPort).
   */
  constructor(level: LevelSpec = WORLDS[0], solver?: FieldLink | null, shove?: PhysLink | null) {
    this.level = level;
    // the crowd shove's thread, on the same terms as the solver's
    this.physPort = makePhysPort(shove, this.physIn(), this.kindSpanDyn, this.kindSpanSDyn);
    // a solve that lands takes its field off the queue
    this.fieldPort = makeFieldPort(solver, (f) => {
      const i = this.solveQueue.indexOf(f);
      if (i >= 0) this.solveQueue.splice(i, 1);
    });
    this.reset();
  }

  /**
   * THE ROUTE SOLVER'S THREAD (fieldport.ts), or null where there is no
   * such thing — node, where the headless tools run and every solve is
   * finished in the tick that queued it anyway (setFieldBudget). Made
   * once per sim.
   */
  private fieldPort: FieldPort | null = null;

  /** stop talking to the solver — the level is over (the page ends its thread) */
  dispose(): void {
    this.fieldPort?.close();
    this.fieldPort = null;
    this.physPort?.close();
    this.physPort = null;
  }

  /** what the crowd shove reads of the bodies — every one of them shared (physkernel.ts) */
  private physIn(): PhysIn {
    return {
      upx: this.upx, upy: this.upy, uvx: this.uvx, uvy: this.uvy,
      urad: this.urad, urot: this.urot, ufly: this.ufly, unav: this.unav,
      uheavy: this.uheavy, ufix: this.ufix, ukind: this.ukind, uid: this.uid,
      clear: this.field.clearShared, wclear: this.navalField.clearShared,
      bStart: this.bStart, bUnits: this.bUnits,
    };
  }

  reset(): void {
    this.n = 0;
    this.time = 0;
    this.kills = 0;
    // a new board owes the bench nothing (setBench)
    this.benchTowerRange = null;
    this.benchUnitRange = null;
    this.devoured = 0;
    this.merged = 0;
    this.killsByKind.fill(0);
    this.scrap = SCRAP_START;
    this.scrapEarned = 0;
    this.incomeCarry = 0;
    // the run's modules are the RUN's (see `mods` and `relics`): a new
    // board owns none of either half
    this.mods = {};
    this.relics.clear();
    this.readRelics();
    this.cascades.length = 0;
    // the run's rules, read once: the feed pass runs over every unit on the
    // field, and a spec lookup per unit per tick to answer a question that
    // cannot change mid-run would be pure waste
    // ...the level's own rules and the deploy's roll as one list
    // (mutationsInForce): the sim never asks which of the two a rule came
    // from, only whether it is in force
    const inForce = mutationsInForce(this.level.mutation);
    this.hungryOn = hasMutation(inForce, "hungry");
    this.speedyOn = hasMutation(inForce, "speedy");
    this.armoredOn = hasMutation(inForce, "armored");
    this.shieldScale = hasMutation(inForce, "overshields") ? OVERSHIELD_SCALE : 1;
    this.volatileOn = hasMutation(inForce, "volatile");
    this.mitosisOn = hasMutation(inForce, "mitosis");
    this.shieldTowersOn = hasMutation(inForce, "shieldTowers");
    this.amphibiousOn = hasMutation(inForce, "amphibious");
    this.conquestOn = hasMutation(inForce, "conquest");
    this.reconstructOn = hasMutation(inForce, "reconstruction");
    this.leadershipOn = hasMutation(inForce, "leadership");
    this.virusOn = hasMutation(inForce, "mechVirus");
    this.leadT = 0;
    this.enemyTowers = 0;
    this.corpses.length = 0;
    this.shieldTowers.length = 0;
    this.shieldTowerT = 0;
    this.domesUp = false;
    this.inspectUid = -1;
    this.inspectIdx = -1;
    this.inspectShieldTower = -1;
    this.inspectTower = null;
    // the mission sets the clock (levels.ts); the core's pool is CORE_HP on every map
    const mission = this.level.mission;
    this.deadline = mission.kind === "survive" ? mission.minutes * 60 : 0;
    // ...and an INTERCEPT sets a second one, which is the crossers'
    // (runCrossers). The roads come off the map id rather than off the
    // mission, so the geometry lives with the terrain it was drawn over
    // and a mission put on a map with no roads says so instead of
    // quietly sending nothing
    this.crossers.length = 0;
    this.crossKilled = 0;
    this.crossLeaked = 0;
    this.crossLaunched = 0;
    this.crossDone = mission.kind !== "intercept";
    this.crossSweeping = false;
    this.towerSpots = [];
    // ...and so does an ESCORT, off the same roads (runConvoys). Both
    // missions are drawn on missions.ts lines, so the geometry is fetched
    // once here for whichever of the two is being played
    this.convoys.length = 0;
    this.convoyDone = 0;
    this.convoyLost = 0;
    this.convoyOut = 0;
    this.convoyEnd = mission.kind !== "escort";
    this.convoyBest = 0;
    // ...and a RAZE reads the map's POSTS the way the other two read its
    // roads — but off the terrain rather than off the id, so that block
    // waits until the document is loaded, below
    this.razeRisen = 0;
    this.razeKilled = 0;
    this.posts = [];
    this.roads = [];
    this.loopLevel = 0;
    this.loopCycle = 0;
    this.projs.clear();
    // drop the fx pool: the count is the pool, but the bolt-path refs must
    // actually go or the last run's arrays sit unreachable-but-held
    this.fxPts.fill(null, 0, this.fxN);
    this.fxN = 0;
    this.towers.length = 0;
    // a new board holds none of the last one's hand: no building picked,
    // and no route drawn behind anybody
    this.selStructs.clear();
    // ...and a new core is about to be stood up under it (see below)
    this.structBoxDirty = true;
    this.cellTower.fill(null);
    this.occupied.fill(0);
    this.shots.length = 0;
    this.exploded = 0;
    this.refreshSpecs(); // an empty board is a tacker with no company
    // the official map document IS the world: map-editor saves land in its
    // JSON, and the next full page load plays them. The documents are
    // fetched before the sim is built (see Game.create), never imported.
    // A level may name its map; the first official map is the default
    const doc = (this.level.map ? loadMap(this.level.map) : null) ?? OFFICIAL_MAPS[0];
    if (!doc) throw new Error("official maps not loaded — await loadOfficialMaps() first");
    this.terrain = terrainFromMap(doc);
    // THE SIEGE THE MAP CARRIES, if it carries one (missions.ts
    // siegeFromMarks). The batteries an author placed are the places AND
    // the sections; a map with none falls back to POST_SPECS and the
    // sections written in levels.ts. `this.level` is rebuilt rather than
    // read around because everything that counts the siege counts it off
    // level.mission (levels.ts razeGuns) — simreads.ts World does the
    // same to the host's copy, off the same document
    const raze = this.level.mission.kind === "raze" ? this.level.mission : null;
    // THE GROUND THE SWARM HOLDS, whatever the mission: a map may draw a
    // garrison on any board, and the waves each one names are when it is
    // manned (runGarrisons)
    this.garrisons = garrisonsFor(this.terrain.marks);
    if (raze) {
      const siege = siegeFromMarks(this.terrain.marks);
      this.siege = siege;
      this.level = levelWithMarks(this.level, this.terrain.marks);
      this.posts = siege ? [] : postsFor(this.level.map);
      const sections = siege ? siege.sections : raze.sections;
      const bad: string[] = [];
      if (sections.length === 0) bad.push("a siege with no sections in it");
      if (!siege)
        for (const sec of sections)
          if (!this.posts[sec.post])
            bad.push(`a section names post ${sec.post} and the map has ${this.posts.length}`);
      for (const post of this.posts) bad.push(...postProblems(post));
      if (bad.length > 0) throw new Error(`${this.level.name}: ${bad.join("; ")}`);
    }
    for (const g of this.garrisons) {
      const bad = postProblems(g.post);
      if (bad.length > 0) throw new Error(`${this.level.name}: ${bad.join("; ")}`);
    }
    // ...and the ROADS, off the same document: a map's own `road` marks
    // where it carries them, ROAD_SPECS where it does not (missions.ts)
    const onRoads = mission.kind === "intercept" || mission.kind === "escort";
    this.roads = onRoads ? roadsFor(this.level.map, this.terrain.marks) : [];
    if (onRoads) {
      // every road index the schedule names has to exist, and every road
      // the map carries has to stay on the board. Said once, at load,
      // rather than discovered as a NaN four minutes into a run
      const named =
        mission.kind === "intercept"
          ? new Set(mission.pattern.flat().concat(mission.spare))
          : new Set(mission.pattern);
      const bad: string[] = [];
      for (const r of named)
        if (!this.roads[r]) bad.push(`the pattern names road ${r} and the map has ${this.roads.length}`);
      for (const road of this.roads) bad.push(...roadProblems(road));
      // ...and a halt is a fraction of a road, so it has to be one — in
      // order, and 0 is the DEPOT (levels.ts EscortMission.halts): an
      // escort whose cart is on the board from the first frame parks it at
      // the start, and updateConvoys asks for the next halt before it asks
      // about the arrival, so a cart launched at s = 0 stops there on its
      // first tick with nothing special written for it. ONE IS STILL
      // ILLEGAL: a halt at the post is a delivery the cart would stand
      // next to forever without the mission ever counting it.
      if (mission.kind === "escort") {
        let prev = -1;
        for (const h of mission.halts) {
          if (!(h >= 0 && h < 1)) bad.push(`a halt at ${h} is not a fraction of the road`);
          else if (h <= prev) bad.push(`a halt at ${h} comes after one at ${prev}`);
          prev = h;
        }
      }
      if (bad.length > 0)
        throw new Error(`${this.level.name}: ${bad.join("; ")}`);
    }
    // THE BUFF TOWERS AN AUTHOR PLACED, if this mission understands them
    // (missionMarks.ts). It is read HERE and not up with the rest of the
    // mission reset because the marks come off the terrain, and the board
    // is not loaded until this line. Where each one stands is the map's and
    // WHEN it rises is the number on that mark; nothing is put down yet —
    // runCrossers spends the list as the trains go out
    if (this.level.mission.kind === "intercept")
      for (const mk of this.terrain.marks) {
        if (mk.kind !== "buffTower") continue;
        // the mark's top-left cell is a footprint corner; a body stands at
        // the middle of the square an author drew
        const half = (MARK_TOWER_SIZE * CELL) / 2;
        this.towerSpots.push({ x: mk.x * CELL + half, y: mk.y * CELL + half });
      }
    // the Hydrophobic mask needs the terrain, so it is built here rather
    // than up with the other rules — and only where the rule is in force
    this.waterlogged = hasMutation(inForce, "hydrophobic") ? this.buildWaterlogged() : null;
    // ...and the water itself, which the naval tanks' pace and the
    // Amphibious rule both read (waterCells)
    this.waterCells = this.buildWaterCells();
    // THE CORE stands where the map's base does, with everything to lose
    const b = this.terrain.base;
    this.core = {
      core: true,
      gx: b.x,
      gy: b.y,
      size: b.size,
      x: (b.x + b.size / 2) * CELL,
      y: (b.y + b.size / 2) * CELL,
      hp: CORE_HP,
      hpMax: CORE_HP,
    };
    this.goalX = this.core.x;
    this.goalY = this.core.y;
    for (let y = b.y; y < b.y + b.size; y++)
      for (let x = b.x; x < b.x + b.size; x++) {
        this.cellTower[y * COLS + x] = this.core;
        this.occupied[y * COLS + x] = 1;
      }
    // ...and the ground it lights, which on a fresh board is the whole of
    // the grid: no beacon has been bought yet, so the core's own disc IS
    // where this run may build. A NEW BOARD IS A NEW MAP, so the beacons
    // this run has switched on go with the old one
    this.beaconOn.fill(0);
    this.rebuildPower();
    this.buildPads();
    // a new map is a new set of mouths, and a new pad list for the hulls
    // to be cut from (waterPads)
    this.mouths = null;
    this.routes = null;
    this.navalPadsFrom = null;
    // a new map is a new board: nothing is pending on it, and a solve
    // still grinding away at the LAST one is solving a map that no longer
    // exists — the one place a solve in flight is genuinely worthless
    this.abortSolves();
    this.fieldDirty = false;
    this.navalDirty = false;
    this.unstickPending = false;
    this.fieldQuiet = 0;
    this.fieldStale = 0;
    // the walkers' field: rock and structures block it, it enters on the
    // dry spawn tiles, and it aims at the core (coreGoal)
    this.field.rebuildWalk(this.footprints(), this.terrain.blocked,
      this.padMaskFor("ground"), this.coreGoal());
    // THE NAVAL TANKS' FIELD. It used to be the mirror image of the
    // walkers' — dry land its wall, the water nearest the core its goal,
    // and no field at all on a map with no sea. It is a SUPERSET of the
    // walkers' now: the same rock, the same structures soft, the same core
    // to press against, over a mask that hands the deep water back
    // (navalWalkMask). So a tank takes the walkers' own shortest path and
    // simply cuts the water when the water is on the way — and every map
    // has one of these fields, because every map has ground.
    this.navalField.rebuildWalk(this.footprints(), navalWalkMask(this.terrain),
      this.padMaskFor("water"), this.coreGoal());
    // THE FLYERS' FIELD, and the mask sight is traced through (hasSight):
    // one array, because "a hill" is one idea. Towers are left out of it
    // on purpose — see airField — so it is solved once here and never
    // again, however much is built or sold during the run.
    this.hills = airWalkMask(this.terrain);
    this.airField.rebuildWalk([], this.hills, this.padMaskFor("air"), this.coreGoal());
    this.buildGoalPts();
    this.field.compute();
    this.navalField.compute();
    this.airField.compute();
    // ...which is what the open-sky pad lists need, so they are picked here
    // rather than in buildPads: a pad is open sky only once there is a
    // field to ask
    this.airOpen = this.openSky(this.airPads);
    // fail LOUDLY on a broken map: with zero doors nothing ever spawns and
    // a wave script stalls forever, which reads as a scheduler bug
    if (this.airPads.length === 0 && this.field.spawnPts.length === 0)
      throw new Error('map "' + doc.id + '" has no spawn tiles — paint some in the editor');
    // a core sitting on rock is always an authoring slip (a map that moved
    // its base without carving the basin, say) and it reads as "the waves
    // never finish" rather than as a broken map — so say it out loud
    let walledBase = 0;
    for (let y = this.terrain.base.y; y < this.terrain.base.y + this.terrain.base.size; y++)
        for (let x = this.terrain.base.x; x < this.terrain.base.x + this.terrain.base.size; x++)
          if (this.terrain.blocked[y * COLS + x]) walledBase++;
    if (walledBase > 0)
      console.warn(
        'map "' + doc.id + '": ' + walledBase +
          " of the core's cells are walled — carve its basin open at " +
          this.terrain.base.x + "," + this.terrain.base.y,
      );
    // A SCRIPT SENDING A LAYER THE MAP HAS NO DOOR FOR is the only
    // map/script mismatch left now that nothing names a region. Warned per
    // layer, and only for layers the script actually sends, so an author
    // hears about it before the run does.
    const doors: ReadonlyArray<readonly [MoveLayer, number]> = [
      ["ground", this.field.spawnPts.length],
      ["air", this.airPads.length],
      ["water", this.navalField.spawnPts.length],
    ];
    // ...and an AIR door with no open sky in it. Not broken — a flyer in a
    // rock pocket still gets out, it just flies the fallback straight line
    // to do it, which is the one case where the swarm's route is not the
    // route the overlay and the map imply.
    if (this.airPads.length > 0 && this.airOpen.length === 0 && this.scriptSends("air"))
      console.warn(
        'map "' + doc.id +
          '": every spawn tile is walled in — flyers will enter inside the pocket and fly straight out' +
          " before they pick up a route. Paint some tiles on open ground.",
      );
    for (const [layer, pads] of doors)
      if (pads === 0 && this.scriptSends(layer))
        console.warn(
          'map "' + doc.id + '" has no ' + layer +
            " spawn tile that reaches an exit, but its script sends " + layer + " units",
        );
    this.stageScript();
    this.aliveByKind.fill(0);
  }

  loadLevel(spec: LevelSpec): void {
    this.level = spec;
    this.reset();
  }

  /** every PLAYER structure's cells as the field takes them — SOFT, routed
   *  through at a cost and shot at when the swarm gets there: the player's
   *  turrets and the core */
  private footprints(): Footprint[] {
    const out: Footprint[] = [];
    for (const t of this.towers) if (t.team === "player") out.push({ gx: t.gx, gy: t.gy, size: t.size });
    out.push(this.core);
    return out;
  }

  // ...and the swarm's own (Conquest) are in neither list: they hold no
  // ground at all (see conquerTower), so the path simply does not know
  // they are there


  /**
   * THE DEFERRED HALF OF A STRUCTURE CHANGE: re-solve the fields the board
   * has dirtied — but only once it has held still for FIELD_SETTLE (or
   * waited out FIELD_MAX_STALE), and only the fields something alive is
   * actually steering by.
   *
   * The wait is what makes a build drag cheap: a chain of turrets laid a
   * frame apart dirties the fields a dozen times and pays for one solve
   * at the end of it, instead of one solve per turret.
   *
   * THE GATE IS WHAT MAKES BUILDING BETWEEN WAVES FREE. With nothing on
   * the field, no body reads a heading, so no heading is worth computing
   * and the flag simply stands until one does — a restored layout, the
   * title screen's opening line, all at
   * no cost at all. Only a solve clears the flag, so the first body of a
   * layer to appear finds its field fresh: spawning runs above this, in
   * runScript.
   */
  private solveDirtyFields(dt: number): void {
    this.fieldQuiet += dt;
    // one per turret
    // a solve already under way takes this frame's slice; nothing new is
    // started until the queue is clear, so the cost per frame is one slice
    // however much is waiting
    if (this.solveQueue.length > 0) return this.runSolveQueue();
    if (!this.fieldDirty && !this.navalDirty) return;
    this.fieldStale += dt;
    if (this.fieldQuiet < FIELD_SETTLE && this.fieldStale < FIELD_MAX_STALE) return;
    // who is out, and so which of the fields is being read. Only the
    // SWARM's bodies count: a flyer is not one of them (its field is over
    // the hills alone and no building ever changes it), and the player's
    // own read no field but the order they are under, which is solved when
    // the order is given rather than when the board moves
    let ground = false, naval = false;
    for (let i = 0; i < this.n; i++) {
      if (this.ufly[i]) continue;
      else if (this.unav[i]) naval = true;
      else ground = true;
    }
    // ...and the two ground-bound fields carry a flag each. A structure
    // dirties both, but a wave of walkers on a map with no tank out reads
    // one of them, and solving the other would double the bill for nothing
    if (this.fieldDirty && ground) {
      this.fieldDirty = false;
      this.solveQueue.push(this.field);
    }
    if (this.navalDirty && naval) {
      this.navalDirty = false;
      this.solveQueue.push(this.navalField);
    }
    // the cap is spent whether or not a solve came of it: a flag left
    // standing is one nothing reads, and it is re-offered every tick from
    // here on — the scan above is a walk over the units and nothing more
    this.fieldStale = 0;
    this.runSolveQueue();
  }

  /**
   * Spend this frame's slice on the solve at the head of the queue, and
   * take the next one up if it finishes with time to spare.
   *
   * FIELD_BUDGET_MS is the whole of what a re-route costs a frame now. A
   * solve is ~100ms of Dijkstra and sweeping, and five fields can be
   * queued at once; paid at three milliseconds a frame that is a second
   * of imperceptible work rather than half a second of dropped frames,
   * and the swarm steers by the last finished field until the new one is
   * whole (FlowField.advance).
   */
  private runSolveQueue(): void {
    // ON THE FIELD WORKER, where there is one: every queued field is asked
    // for at once (the worker answers them in order) and this thread pays
    // for a copy of the masks and nothing else. The queue empties as the
    // replies land (fieldPort's onDone). A worker that has died is dropped
    // here, and the fields it was holding start over in slices below — a
    // route that is late is a route; a route never solved is a traffic jam
    const port = this.fieldPort;
    if (port && !port.alive) {
      this.fieldPort = null;
      for (const f of this.solveQueue) f.abort();
    } else if (port) {
      for (const f of this.solveQueue) if (!f.solving) f.requestRemote(port);
      return;
    }
    const until = nowMs() + this.fieldBudgetMs;
    while (this.solveQueue.length > 0) {
      const left = until - nowMs();
      this.fieldSlices++;
      if (!this.solveQueue[0].advance(Math.max(left, FIELD_MIN_SLICE))) return;
      this.solveQueue.shift();
      if (nowMs() >= until) return;
    }
  }

  /**
   * What a re-route may spend per tick (FIELD_BUDGET_MS). Infinity finishes
   * every queued solve in the tick it was queued, which is what makes a
   * headless run reproducible — see the note on FIELD_BUDGET_MS.
   */
  setFieldBudget(ms: number): void {
    this.fieldBudgetMs = ms;
  }
  private fieldBudgetMs = FIELD_BUDGET_MS;

  /**
   * Drop the solves in flight and everything waiting behind them — for a
   * board that is not merely different but GONE (a new map, a reset).
   *
   * NOT FOR AN ORDINARY BOARD CHANGE, which is what it used to be for, and
   * that was the single worst bug the routing has had. A structure going
   * up or coming down threw away the solve in flight so the next one could
   * start from the board as it now stands. On a quiet board that is free.
   * On a LATE NEMESIS board — a wave chewing through a line while the
   * player lays another — something changes every few tenths of a second,
   * and a solve is half a second of slices: every one of them was killed
   * before it published, forever. Measured on a campaign map at rung four, with a
   * board held at eight hundred turrets against the whole script: the
   * walkers' field last published at 10:42 of a 16:40 run and never again,
   * SIX MINUTES of the swarm steering by a board that had turned over
   * twice, while nine hundred aborted solves piled up behind it.
   *
   * What the swarm does with a field that old is exactly what it was
   * reported doing: it walks the lane that was open minutes ago,
   * piles into the face of a line that has gone up across it since, and
   * stands there — because the route that would have taken it round was
   * never solved. THE FIX IS TO LET THE SOLVE FINISH. A field one board
   * change out of date is a route; no field at all is a traffic jam. The
   * same run with the solve left alone: eight hundred and ninety routes
   * published instead of a hundred and forty-six, not one abort, and the
   * worst the swarm's routing ever lagged the board was 3.6 SECONDS.
   *
   * It is also safe, which is what makes it cheap. The solver's topology
   * comes from `solid` (walk and not soft), snapshotted at begin(), and a
   * structure change cannot move it: claimGround writes walk and soft
   * TOGETHER, so a cell is non-solid whether the building is there or not.
   * Only the COST of a cell shifts under a running solve, and a cost that
   * shifts mid-pass still leaves a finite, monotone field with a heading
   * everywhere — the route it describes is simply a blend of the board a
   * moment ago and the board now. The flags raised alongside this then buy
   * a clean one as soon as the board holds still (solveDirtyFields).
   */
  private abortSolves(): void {
    for (const f of this.solveQueue) f.abort();
    this.solveQueue.length = 0;
  }


  /** the walkers' destination: the core's own cells — a soft goal, see FlowField.rebuildWalk */
  private coreGoal(): Uint8Array {
    const out = new Uint8Array(NCELLS);
    const c = this.core;
    for (let y = c.gy; y < c.gy + c.size; y++)
      for (let x = c.gx; x < c.gx + c.size; x++) out[y * COLS + x] = 1;
    return out;
  }

  /**
   * THE SPAWN TILES ONE LAYER MAY ENTER ON, as a mask a FlowField takes.
   *
   * The map paints ONE spawn layer and the layer sorts itself out of it:
   *
   *  - a WALKER or a FLYER takes the DRY tiles. Sending them in over the
   *    water was never what a shoreline of pads meant — the wet tiles are
   *    the channel, and a walker wading out of one enters the map already
   *    in the sea.
   *  - a HULL takes them all, and PREFERS the wet ones once the field has
   *    said which of them it can actually sail from (navalWaterPads). It
   *    is amphibious, so a beach is a door it can use; the water is just
   *    the door it would rather have.
   *
   * Each falls back to the whole layer when its own share is empty, so a
   * map painted entirely on its shallows still lands walkers and a map
   * with no water at all still lands hulls. THAT IS WHAT MAKES EVERY
   * FAMILY LANDABLE ON EVERY MAP. The field filters the mask against its
   * own passability and reachability afterwards (FlowField.spawnPts), so a
   * fallback tile the layer cannot actually use is dropped rather than
   * stranding whatever entered on it.
   */
  private padMaskFor(layer: MoveLayer): Uint8Array {
    const src = this.terrain.spawn;
    const { floor } = this.terrain;
    const out = new Uint8Array(NCELLS);
    if (layer === "water") {
      out.set(src);
      return out;
    }
    let any = false;
    for (let i = 0; i < NCELLS; i++)
      if (src[i] && !isWaterFloor(floor[i])) {
        out[i] = 1;
        any = true;
      }
    if (!any) out.set(src);
    return out;
  }

  /**
   * THE HULLS' PREFERRED DOORS: the wet ones among the naval field's, cut
   * from the pad list the field just published.
   *
   * Derived rather than masked because the preference has to survive the
   * field's own filtering: a mask of "water tiles only" would leave a map
   * whose channel is walled off from the core with no naval door at all,
   * where this leaves it with the dry ones the field did accept.
   *
   * Kept BY THE IDENTITY of the list it was cut from. FlowField.publish
   * swaps a fresh array in on every solve, so the check is a pointer
   * compare per spawn and the walk happens once per re-route — which is
   * the difference between a wave of five thousand costing one pass over
   * a couple of thousand pads and costing five thousand of them.
   */
  private navalWaterPads: number[] = [];
  private navalPadsFrom: readonly number[] | null = null;

  private waterPads(): number[] {
    const pads = this.navalField.spawnPts;
    if (this.navalPadsFrom === pads) return this.navalWaterPads;
    const { floor } = this.terrain;
    const wet: number[] = [];
    for (const i of pads) if (isWaterFloor(floor[i])) wet.push(i);
    this.navalPadsFrom = pads;
    this.navalWaterPads = wet;
    return wet;
  }

  /**
   * THE FLYERS' DOORS, the one pad list no field builds: a flyer is
   * stopped by nothing, so its doors are simply the spawn tiles its mask
   * offers (padMaskFor — the dry ones, with the whole layer as fallback).
   *
   * The boss lists that used to sit beside it are gone with the boss zone:
   * a map paints one kind of spawn tile, so a boss comes in on its own
   * layer's tiles like every other body.
   */
  private buildPads(): void {
    const air = this.padMaskFor("air");
    this.airPads = [];
    for (let i = 0; i < NCELLS; i++) if (air[i]) this.airPads.push(i);
  }

  /** the cells of an air pad list the air field actually has a road from */
  private openSky(pads: readonly number[]): number[] {
    const { walk, dist } = this.airField;
    return pads.filter((i) => !walk[i] && dist[i] < INF);
  }

  /** the movement layer a unit kind travels on — the one place it is decided */
  private layerOf(kind: UnitKind): MoveLayer {
    const s = UNIT_STATS[kind];
    return s.flying ? "air" : s.naval ? "water" : "ground";
  }

  /** does this level's script send anything on this layer? */
  private scriptSends(layer: MoveLayer): boolean {
    for (const step of this.level.script) {
      if (!("wave" in step)) continue;
      for (const g of waveGroups(step.wave))
        for (let k = 0; k < g.counts.length; k++)
          if (g.counts[k] > 0 && this.layerOf(UNIT_KINDS[k]) === layer) return true;
    }
    return false;
  }

  /** where a flyer is sent: the core, and nothing else on the map */
  private buildGoalPts(): void {
    this.goalPts = Float32Array.from([this.goalX, this.goalY]);
  }

  /**
   * THE LINES FLYERS ACTUALLY FLY, one polyline per MOUTH — what the route
   * overlay draws. Each is the air field walked from the mouth's middle,
   * the same way a flyer walks it, so the curve on screen bends round the
   * same mountains the swarm will.
   *
   * A MOUTH IS A PATCH OF SPAWN TILES, not a tile (spawnMouths). One line a
   * tile would be two thousand curves over the map and not one of them
   * readable; the patch is the thing a player recognises as "where they
   * come in", and its middle is the middle of the fan the patch throws.
   *
   * ONLY WHAT ACTUALLY FLIES GETS A LINE. Walkers and hulls read fields
   * the terrain itself already shows the shape of.
   */
  airRoutes(): { pts: number[] }[] {
    // TRACED ONCE PER MAP. The air field is solved at load and never again
    // — no building changes it (see airField) — and the mouths and the
    // goal are fixed with it, so every frame of the overlay would retrace
    // the same curves. reset() drops this with the rest of the map.
    if (this.routes) return this.routes;
    this.routes = this.spawnMouths().map((i) => {
      const x = ((i % COLS) + 0.5) * CELL, y = (((i / COLS) | 0) + 0.5) * CELL;
      return { pts: this.airTrace(x, y) };
    });
    return this.routes;
  }
  private routes: { pts: number[] }[] | null = null;

  /**
   * THE MAP'S MOUTHS: one representative cell per connected patch of
   * flyer-usable spawn tiles, biggest patch first, capped at MAX_MOUTHS.
   *
   * Solved once per map — the overlay asks for it every frame it is up,
   * and a flood fill over a quarter of a million cells is not a per-frame
   * cost. The representative is the patch cell nearest its own centroid,
   * so a crescent painted round a headland is marked ON the paint rather
   * than in the bay it curls around.
   *
   * The cap is an overlay decision and nothing else: a map may paint as
   * many patches as it likes and the swarm uses every one of them. Past a
   * dozen curves the picture stops being information.
   */
  private spawnMouths(): number[] {
    if (this.mouths) return this.mouths;
    const pad = new Uint8Array(NCELLS);
    for (const i of this.airPads) pad[i] = 1;
    const seen = new Uint8Array(NCELLS);
    const stack: number[] = [];
    const patches: { cells: number[]; sx: number; sy: number }[] = [];
    for (const start of this.airPads) {
      if (seen[start]) continue;
      seen[start] = 1;
      stack.length = 0;
      stack.push(start);
      const cells: number[] = [];
      let sx = 0, sy = 0;
      while (stack.length > 0) {
        const i = stack.pop() as number;
        const x = i % COLS, y = (i / COLS) | 0;
        cells.push(i);
        sx += x;
        sy += y;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx, ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
            const j = ny * COLS + nx;
            if (pad[j] && !seen[j]) {
              seen[j] = 1;
              stack.push(j);
            }
          }
      }
      patches.push({ cells, sx, sy });
    }
    patches.sort((p, q) => q.cells.length - p.cells.length);
    this.mouths = patches.slice(0, MAX_MOUTHS).map(({ cells, sx, sy }) => {
      const cx = sx / cells.length, cy = sy / cells.length;
      let best = Infinity, at = cells[0];
      for (const i of cells) {
        const dx = (i % COLS) - cx, dy = ((i / COLS) | 0) - cy;
        const d = dx * dx + dy * dy;
        if (d < best) { best = d; at = i; }
      }
      return at;
    });
    return this.mouths;
  }
  /** spawnMouths' answer for the terrain currently loaded — null until asked */
  private mouths: number[] | null = null;

  /**
   * One flyer's road from a point to the core, as flat x,y pairs: step
   * along airHeading until the hold radius, exactly as updateUnits does.
   *
   * The step is a cell and a half — long enough that a 256-cell crossing is
   * a couple of hundred points rather than a couple of thousand, short
   * enough that a turn round a headland still reads as a curve. The cap is
   * the safety net for a field that somehow circulates: an overlay must not
   * be able to hang the frame.
   */
  private airTrace(x: number, y: number): number[] {
    const g = this.nearestGoal(x, y);
    const hold = (this.core.size * CELL) / 2 + CELL * 1.5;
    const step = CELL * 1.5;
    const pts = [x, y];
    const dir: Vec2 = { x: 0, y: 0 };
    for (let n = 0; n < 400; n++) {
      const dx = g.x - x, dy = g.y - y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d <= hold) break;
      this.airHeading(x, y, dx / d, dy / d, dir);
      x += dir.x * Math.min(step, d);
      y += dir.y * Math.min(step, d);
      pts.push(x, y);
    }
    return pts;
  }

  /** the goal cell nearest a point, in world px — a flyer's destination */
  private nearestGoal(x: number, y: number): { x: number; y: number } {
    const p = this.goalPts;
    let bx = p[0], by = p[1], best = Infinity;
    for (let k = 0; k < p.length; k += 2) {
      const dx = p[k] - x, dy = p[k + 1] - y;
      const d = dx * dx + dy * dy;
      if (d < best) { best = d; bx = p[k]; by = p[k + 1]; }
    }
    return { x: bx, y: by };
  }

  /**
   * A FLYER'S HEADING at a point: the air field's, or the straight line to
   * its goal where the field has none.
   *
   * The fallback is not a failure case, it is the other half of the rule.
   * The field is silent in exactly two places — inside a hill, and over the
   * core itself (compute() zeroes the heading on a goal cell) — and in both
   * the straight line is the right answer: from inside a peak it flies the
   * shortest way back out into open sky, and over the core there is nowhere
   * left to route to. Hills bend a flyer's path; they never trap one.
   *
   * `gx, gy` is the already-normalized direction to the unit's goal, which
   * updateUnits has in hand anyway.
   */
  private airHeading(x: number, y: number, gx: number, gy: number, out: Vec2, field = this.airField): void {
    field.sample(x, y, out);
    if (out.x * out.x + out.y * out.y < 0.25) {
      out.x = gx;
      out.y = gy;
    }
  }

  /**
   * THE RUN IS OVER AND THE PLAYER DID NOT MAKE IT — the game freezes and
   * the score screen takes over.
   *
   * The core falling is the only way: the swarm exists to knock it down.
   */
  lost(): boolean {
    if (this.core.hp > 0) {
      // ...OR THE MISSION HAS BECOME IMPOSSIBLE, which is the second way
      // to lose and the only one that is not about the base. An intercept
      // sends exactly `kills` crossers plus one spare (levels.ts
      // InterceptMission), so the allowance is real arithmetic: once more
      // than `leaks` have got across, the count can never be reached
      // however the rest of the run goes, and a run that cannot be won is
      // over. Saying it here rather than letting it play out is the whole
      // difference between a mission and a formality.
      const m = this.level.mission;
      // ...and an ESCORT is the same arithmetic pointed the other way:
      // the allowance is how many carts may be lost, and one more than
      // that and the delivery count can never be reached. On Thornway the
      // allowance is ZERO, so this is simply "the hauler was destroyed" —
      // which is the honest end of an escort and wants saying at the
      // moment it happens rather than fifteen minutes later
      if (m.kind === "escort")
        return (
          this.convoyLost > m.losses ||
          (this.convoyEnd && this.liveConvoy() === null && this.convoyDone < m.deliver)
        );
      if (m.kind !== "intercept") return false;
      if (this.crossLeaked > m.leaks) return true;
      // ...and the same fact arrived at from the other side: nothing left
      // to send (runCrossers has disarmed), nothing left on the board, and
      // the count short. Today the allowance and the spare make that the
      // line above said twice — but the two are separate arithmetic, and
      // the day a mission is authored with two leaks allowed and one spare
      // this is what stops the run hanging on a count it can no longer
      // reach instead of ending on it
      return this.crossDone && this.crossersLive() === 0 && this.crossKilled < m.kills;
    }
    return true;
  }

  /**
   * HOW MANY WAVES THIS HOLD ASKS FOR, 0 on every other mission — the
   * mission's own number where it has one, and otherwise the authored
   * script's length (levels.ts holdWaves).
   *
   * It is answered against `scriptWaves` and NOT against `totalWaves`,
   * which the tide grows: a hold measured against a number that goes up
   * every time the script loops is a hold that can never be finished.
   */
  holdTarget(): number {
    return missionTarget(this.level.mission, this.scriptWaves);
  }

  /**
   * DOES THE SCRIPT GO ROUND AGAIN when the cursor reaches its end? — the
   * one question loadStep asks before it turns the tide.
   *
   * THE RULE IS "CAN MORE WAVES STILL DECIDE THIS MISSION". A survive's
   * clock is still running, so they can: the tide is the only thing
   * keeping the board honest until it stops. An intercept is decided by
   * crossers and the waves are the pressure underneath them, so they must
   * not run dry while the run is still going. A HOLD IS THE ONE THAT CAN
   * SAY NO: its objective is counted in waves, and once every wave it
   * asked for has been staged there is nothing a further one can add — the
   * run is decided by whether what is already walking gets put down. Ask
   * a hold for MORE waves than the document holds and it turns the tide
   * like anything else, which is how a hold map plays the infinite climb.
   */
  private tideTurns(): boolean {
    const m = this.level.mission;
    if (m.kind === "hold") return this.wavesStarted < this.holdTarget();
    if (m.kind === "survive") return this.time < this.deadline;
    return true;
  }

  /**
   * HOW FAR THROUGH ITS OBJECTIVE THIS RUN IS, 0 to 1 — what every
   * progress bar on the screen is drawn from (levels.ts missionProgress,
   * which is where the per-mission arithmetic lives so the HUD and the sim
   * cannot disagree about it).
   */
  missionProgress(): number {
    return missionProgress(this.level.mission, this.holdTarget(), {
      wavesCleared: this.wavesCleared(),
      time: this.time,
      crossKilled: this.crossKilled,
      convoyDone: this.convoyDone,
      convoyAt: this.convoyAt(),
      razeKilled: this.razeKilled,
    });
  }

  /**
   * IS THE MISSION MET? Each kind answers for itself, and NONE of them
   * answers "the script ran out" any more — the script does not run out
   * (see TIDE_LEVELS). A hold is won when it has cleared the waves it was
   * asked for, a survive when the clock has run out, an intercept when the
   * count is reached. Never while the base is dead — a clock that ran out
   * on a lost base is a loss.
   *
   * A HOLD'S TEST IS `wavesCleared`, which is counted off the world and
   * holds a wave open for anything it sent that is still walking OR lying
   * on the floor waiting to stand up (the corpse un-books itself in
   * killUnit). So "forty waves held" means forty waves with nothing left
   * of them, which is the same fact `remaining() <= 0` used to state for
   * the whole script — said per wave, so a target shorter or longer than
   * the document can be stated at all.
   *
   * The target being above zero is the one thing the count cannot see: a
   * script with no waves in it is a level with nothing to hold against,
   * and an empty field on wave zero is not a victory.
   */
  won(): boolean {
    if (this.lost()) return false;
    // AN INTERCEPT IS MET BY ITS COUNT AND BY NOTHING ELSE (levels.ts
    // InterceptMission): the waves are still coming, the tide may have
    // turned twice underneath it, and the mission is over the moment the
    // seventh Borer is down. The two clocks are separate on purpose — the
    // swarm is what can lose the run, and the crossers are what wins it
    const m = this.level.mission;
    if (m.kind === "intercept") return this.crossKilled >= m.kills;
    // ...A SIEGE IS MET BY ITS COUNT AND BY NOTHING ELSE either: the last
    // emplacement going down ends the run, with whatever is left of the
    // garrison still standing on ground nobody needs any more
    if (m.kind === "raze") return this.razeKilled >= razeGuns(m);
    // ...and an escort the moment the last cart is at the post
    if (m.kind === "escort") return this.convoyDone >= m.deliver;
    if (m.kind === "survive") return this.time >= this.deadline;
    const target = this.holdTarget();
    return target > 0 && this.wavesCleared() >= target;
  }













  /** campaign restrictions on building; null lifts them (editor, dev) —
   *  and null is also what makes building FREE (see canPlace) */
  setTech(tech: TechState | null): void {
    this.tech = tech;
    this.refreshSpecs();
    // ...AND THE POWER GRID, because this is what decides whether there is
    // one (powerOn rides the tech gate). A board is built and reset before
    // anybody says what it may field, so the grid painted back there was
    // painted under the sandbox's rule — no rule at all — and switching the
    // rule on without repainting would leave a campaign run holding an
    // all-dark mask and unable to build anywhere at all.
    this.rebuildPower();
  }

  /** unlimited income: the balance goes bottomless, spending stops
   *  deducting, and the player's own scrap is held to be given back */
  setRich(on: boolean): void {
    if (on === this.rich) return;
    this.rich = on;
    if (on) {
      this.purseWas = this.scrap;
      this.scrap = RICH_SCRAP;
    } else {
      this.scrap = this.purseWas;
    }
  }

  /** is building charged? — a campaign run, as opposed to an editor or the
   *  sandbox, which both build for nothing */
  get charging(): boolean {
    return this.tech !== null || this.rich;
  }

  /**
   * AMBIENT EFFECTS OFF — the settings switch, for a device that cannot
   * afford the particle work (a phone, mostly).
   *
   * It rides the line `force` already draws, and draws it for exactly the
   * reason this switch needs drawn: an effect marked forced IS a weapon
   * rather than dressing on one — cleaver's shrapnel ray, piercer's beam and
   * its charge glow, coil's bolt, the rail's trail — and those weapons deal
   * instant invisible damage, so dropping them would leave a firing turret
   * and a stalled one looking identical. Every one of them therefore
   * survives this switch. What goes is the dressing: death puffs,
   * footfalls, smoke, muzzle flash, burning, splashes, heal and shield
   * rings, the lot.
   *
   * REFUSED AT THE PUSH, not at the draw, so an effect that is off costs
   * nothing anywhere — not a slot, not an update, not a quad. The pool
   * behaves exactly as it does when ambient effects have filled it (see
   * pushSlot), which is a state every caller already handles.
   *
   * IT DOES NOT CHANGE WHAT THE SIM DOES. Nothing reads the pool back —
   * effects are the sim TELLING the renderer what happened, never the
   * other way round — so a run plays out the same either way.
   *
   * The renderer has a switch of its own for the decoration it owns
   * outright (see Renderer.setEffects), and Game.setEffects works the pair.
   */
  setEffects(on: boolean): void {
    this.fxOn = on;
  }

  /**
   * Re-resolve every upgraded turret. Called whenever the save's tech
   * changes or a tower is placed, sold or cleared — see `specs` for why
   * those are the only moments that can move it.
   *
   * The head count is what a count-dependent rung reads (tacker power: "each
   * OTHER tacker on the board", hence the whole board's census here). Every
   * turret of one kind shares the one resolved spec, which is what makes a
   * single cached object the honest answer rather than an approximation of
   * a per-turret one.
   *
   * ONLY UPGRADED KINDS GET AN ENTRY. A board of stock turrets leaves the
   * map empty and statsFor hands back the shared table object, so the census
   * below is the entire cost of this branch on a save that has bought none
   * of it.
   */
  private refreshSpecs(): void {
    // INSIDE A BATCH, THE WORK IS OWED RATHER THAN DONE. Every placement
    // asks for this and the answer only depends on the board it leaves
    // behind, so a card that lays three hundred and sixty turrets would
    // otherwise re-compose every standing turret three hundred and sixty
    // times — quadratic in the board, and the stutter a big fleet card
    // used to cost. One flush at the end of the batch is the same answer
    // (batchPlacement).
    if (this.specsHold > 0) {
      this.specsPending = true;
      return;
    }
    this.specs.clear();
    this.countsOwed.clear(); // a full refresh reads every count anyway
    const up = this.tech?.upgrades;
    const skills = this.tech?.skills;
    const counts = up ? this.towerCounts() : null;
    for (const kind of TOWER_KINDS) {
      // the tech tree's rungs first (the save's), then the run's relics on
      // top of them — two different purchases composing onto one table
      const base = up && counts
        ? upgradedTower(kind, up[kind] ?? NO_UPGRADES, { count: counts[kind] })
        : TOWERS[kind];
      const spec = applyRelics(skilledTower(skills, base), this.relics);
      if (spec !== TOWERS[kind]) this.specs.set(kind, spec);
    }
    // ...and every STANDING turret re-composed on top of that, because its
    // own attributes (Tower.mods) sit above its kind's stats and a relic
    // bought mid-wave has to reach the board that is already down
    // ...the player's own. A CONQUERED TURRET KEEPS THE STATS IT CHANGED
    // SIDES WITH (Sim.conquerTower): a relic or a tech rung bought after
    // the loss is the player's purchase, and buffing the swarm's copy with
    // it would make every upgrade a gift to the thing shooting back
    for (const t of this.towers) if (t.team === "player") this.resolveTower(t);
    this.specsVersion++;
  }

  /**
   * A HEAD COUNT MOVED — a turret of this kind placed, wrecked, sold or
   * conquered. The table is OWED a look, not given one.
   *
   * WHY A DEATH MAY NOT REFRESH ON THE SPOT. refreshSpecs re-composes every
   * standing turret (resolveTower), which is O(board), and it was called
   * once per death — inside hitStructure, inside the weapons pass. On a
   * wave-50 board of five to ten thousand buildings, with something dying
   * most steps and several dying on the bad ones, that was tens of
   * thousands of re-compositions a step, billed to unitGuns and counted by
   * nothing: the phase read as "each candidate got dearer" while its
   * candidate counts sat flat, which is the exact signature simreport.ts
   * warns about. Measured, it was the bulk of a 20ms step that should be
   * under 7.
   *
   * WHY IT IS NOT EVEN ONE FULL REFRESH A STEP. Deferred to the step's end
   * it was still O(board) on every step with a death — 11ms a refresh at
   * eight and a half thousand turrets, the top line of the profile, and
   * linear in the board. And almost all of it produced the table it
   * started with: the only thing a coming or going turret changes is ONE
   * kind's head count, and the only rung in the game that reads a head
   * count is tacker power (upgrades.ts `counted`). So the flush asks each
   * touched kind whether a count-reading rung of it is even bought
   * (countSensitive) — no for every kind but an upgraded tacker — and does
   * nothing for the ones that say no. For the one that says yes it recounts
   * that kind and re-resolves that kind's turrets, and nobody else's.
   *
   * A player's own purchase (takeMod, takeRelic, setTech) still refreshes
   * the whole table on the spot: those change every kind, they are rare,
   * and the shelf should read right the instant it is pressed.
   */
  private oweCount(kind: TowerKind): void {
    this.countsOwed.add(kind);
  }

  /**
   * PAY WHAT IS OWED — the step's end, and the batch's. A full refresh if
   * one is pending; otherwise the per-kind recount for the kinds touched.
   */
  private flushSpecs(): void {
    if (this.specsHold > 0) return;
    if (this.specsPending) {
      this.specsPending = false;
      this.refreshSpecs();
      return;
    }
    if (this.countsOwed.size === 0) return;
    const up = this.tech?.upgrades;
    let changed = false;
    if (up) {
      const mine = this.countScratch;
      for (const kind of this.countsOwed) {
        const points = up[kind] ?? NO_UPGRADES;
        if (!countSensitive(kind, points)) continue;
        // one pass for the census and the turrets it applies to, together
        mine.length = 0;
        for (const t of this.towers) if (t.team === "player" && t.kind === kind) mine.push(t);
        const spec = applyRelics(
          skilledTower(this.tech?.skills, upgradedTower(kind, points, { count: mine.length })),
          this.relics,
        );
        if (spec === TOWERS[kind]) this.specs.delete(kind);
        else this.specs.set(kind, spec);
        for (let i = 0; i < mine.length; i++) this.resolveTower(mine[i]);
        mine.length = 0;
        changed = true;
      }
    }
    this.countsOwed.clear();
    if (changed) this.specsVersion++;
  }
  /** flushSpecs's scratch: the standing turrets of one kind */
  private readonly countScratch: Tower[] = [];

  /**
   * ONE TURRET'S LIVE STATS AND POOL, composed: its kind's spec (above)
   * with this turret's own attributes folded in. The pool is re-derived
   * with it and the CURRENT health carried across as a FRACTION — a relic
   * that widens every turret's pool must not leave the board's structures
   * standing at a sliver of their new ceiling, and one that is somehow
   * narrowed must not leave them over it.
   */
  private resolveTower(t: Tower): void {
    const kind = this.specs.get(t.kind) ?? structStats(t.kind);
    // the mask says WHICH attributes this turret won and the run's ledger
    // says how strong each of them is right now (mods.ts): copies scale
    // the effect, so a copy bought mid-wave lands on the board already
    // standing, through this very call
    t.spec = applyTurretMods(kind, t.mods, this.mods);
    // ...under the bench's reach when one is set — see setBench
    if (this.benchTowerRange !== null) t.spec = { ...t.spec, range: this.benchTowerRange };
    const max = t.spec.health * TOWER_HP_SCALE;
    if (max !== t.hpMax) {
      const f = t.hpMax > 0 ? t.hp / t.hpMax : 1;
      t.hpMax = max;
      t.hp = Math.min(max, Math.max(1, f * max));
    }
    t.regen = modRegen(t.mods, this.mods) * max;
  }

  // ---------- the bench (scripts/check.mjs, scripts/bench.mjs) ----------
  //
  // THREE COMMANDS THAT EXIST FOR THE CLOCKS AND NOTHING ELSE. The perf
  // suite stands boards no run ever stands — ten thousand of ONE turret,
  // ten thousand of ONE body — to ask the two questions a real fight makes
  // impossible to ask in isolation: what does this kind cost the step, and
  // what does it cost the draw. They live on the sim rather than in the
  // harness so that the headless check and the browser bench (which
  // reaches the sim only through the worker seam, sim.worker.ts COMMANDS)
  // build the identical board from the identical code.
  //
  // None of this is a rule of the game. The overrides are cleared by
  // reset(), so a scene is a scene; and a bench range bypasses every stamp
  // and module a real reach carries (the spotter, the relics, the mods) on
  // purpose — it means "always has a target", not a number.
  //
  // A BENCH REACH IS A GATE AND NEVER A FOOTPRINT. It widens what a body
  // may PICK and what a weapon may FIRE AT; it does not widen what the
  // weapon's effect covers — the radius a field pulse walks, the length a
  // piercing beam is walked and drawn, a scatter's cone (updateUnitWeapons
  // wreach / wspan). When it did, every cost proportional to range was
  // paid over the whole 512x512 board: the livewire4 clock read 71ms a
  // step and the starhart2 clock 25ms, and neither number was the game's.

  /** every turret's reach, while the bench has set one (resolveTower) */
  private benchTowerRange: number | null = null;
  /** every body's — the pick's and each weapon's (updateUnitWeapons) */
  private benchUnitRange: number | null = null;

  setBench(opts: { towerRange?: number | null; unitRange?: number | null; coreHp?: number | null }): void {
    // a reach past the map's diagonal is the same reach and a longer walk
    // (the aim searches ring out to it), so that is the most it can be
    const bound = (r: number | null | undefined): number | null | undefined =>
      r == null ? r : Math.min(r, Math.hypot(W, H));
    if (opts.unitRange !== undefined) this.benchUnitRange = bound(opts.unitRange) ?? null;
    const towerRange = bound(opts.towerRange);
    if (towerRange !== undefined && towerRange !== this.benchTowerRange) {
      this.benchTowerRange = towerRange;
      // the standing board re-composed under the new reach — the walk a
      // relic bought mid-wave takes (refreshSpecs)
      for (const t of this.towers) this.resolveTower(t);
    }
    if (opts.coreHp != null) {
      this.core.hpMax = opts.coreHp;
      this.core.hp = opts.coreHp;
    }
  }

  /**
   * `n` bodies of one kind through the doors — or, `scatter`, dropped over
   * the whole field at once the way a brood lands (spawnUnit): a random
   * open cell of the body's own layer, tested for rock and for crowding
   * exactly as an arrival is. `at` drops them round one point instead.
   * `hp` pins the pool, both hp and max, which is how the bench makes a
   * body that never dies. Returns how many landed.
   */
  spawnMany(
    kind: UnitKind,
    n: number,
    opts: { scatter?: boolean; at?: { x: number; y: number }; hp?: number } = {},
  ): number {
    const fly = !!UNIT_STATS[kind].flying;
    const walkField = this.layerOf(kind) === "water" ? this.navalField : this.field;
    let made = 0;
    for (let a = 0, tries = n * 8; a < tries && made < n; a++) {
      let ok: boolean;
      if (opts.at) ok = this.spawnUnit(kind, opts.at);
      else if (opts.scatter) {
        const c = (Math.random() * NCELLS) | 0;
        if (!fly && walkField.walk[c]) continue;
        ok = this.spawnUnit(kind, { x: ((c % COLS) + 0.5) * CELL, y: (((c / COLS) | 0) + 0.5) * CELL });
      } else ok = this.spawnUnit(kind);
      if (!ok) continue;
      if (opts.hp !== undefined) {
        this.uhp[this.n - 1] = opts.hp;
        this.uhpmax[this.n - 1] = opts.hp;
      }
      made++;
    }
    return made;
  }

  /**
   * A BOARD THROWN DOWN AT RANDOM: `kinds` dealt round-robin onto random
   * cells until `n` turrets stand — and, `fill`, a tacker where the kind
   * in hand does not fit (its size, its cap), which is how a late board
   * looks; off, the board is `kinds` and nothing else, however many of
   * them the ground takes, which is what an isolated clock wants. One
   * board change, like a card (batchPlacement). Returns the board's size.
   */
  scatterTowers(kinds: readonly TowerKind[], n: number, fill = true): number {
    return this.batchPlacement(() => {
      let ki = 0;
      for (let t = 0, tries = Math.max(n * 400, 1e5); t < tries && this.towers.length < n; t++) {
        const x = (Math.random() * COLS) | 0, y = (Math.random() * ROWS) | 0;
        if (this.placeTower(x, y, kinds[ki % kinds.length]) === "ok") ki++;
        else if (fill) this.placeTower(x, y, "tacker");
      }
      return this.towers.length;
    });
  }

  // ---------- the run's modules: mods (mods.ts) and relics (relics.ts) ----------

  /** how many copies of one mod the run owns */
  modStacks(id: ModId): number {
    return this.mods[id] ?? 0;
  }

  /** every MOD the run owns, catalog order, with its stack count — half of
   *  what the shelf on the top-left of the field draws */
  ownedMods(): { id: ModId; n: number }[] {
    const out: { id: ModId; n: number }[] = [];
    for (const m of MODS) {
      const n = this.mods[m.id] ?? 0;
      if (n > 0) out.push({ id: m.id, n });
    }
    return out;
  }

  /** ...and every RELIC, catalog order — the other half, and no counts,
   *  because a relic is held once (relics.ts) */
  ownedRelics(): RelicId[] {
    return RELICS.filter((d) => this.relics.has(d.id)).map((d) => d.id);
  }

  /** the whole mod ledger, for the composers that read a copy count */
  get modLedger(): Readonly<Partial<Record<ModId, number>>> {
    return this.mods;
  }

  /** ...and the relics held, for the roll that must not offer one twice */
  get relicsHeld(): RelicsHeld {
    return this.relics;
  }

  /**
   * TAKE A MOD. It joins the pool the NEXT placement rolls against and
   * deliberately changes nothing already on the board — except that a
   * COPY scales what the turrets born with it already get, which is what
   * refreshSpecs carries back to them (see mods.ts).
   */
  takeMod(id: ModId): void {
    this.mods[id] = (this.mods[id] ?? 0) + 1;
    this.refreshSpecs();
  }

  /**
   * TAKE A RELIC, and it lands NOW — that is the whole difference between
   * the two categories. It is folded into every kind's stats on the spot
   * and reaches every turret already standing.
   *
   * Undying Legion is the one that has to reach further back than the
   * stats do: it grants a revive to EVERY turret, and a player who buys
   * it mid-wave is buying it for the line being chewed on right now.
   */
  takeRelic(id: RelicId): void {
    this.relics.add(id);
    this.readRelics();
    if (id === "undying")
      for (const t of this.towers) {
        if (t.team !== "player") continue; // the swarm's copies are not the run's to bless
        t.revives = Math.max(t.revives, 1);
        t.revivesMax = Math.max(t.revivesMax, 1);
      }
    this.refreshSpecs();
  }

  /**
   * THE FOUR FLAGS THE HOT LOOPS READ, re-derived from the set (see
   * `armorBlind` and the fields beside it). Called wherever the run's
   * relics change and nowhere else — damageUnit must never do a Set
   * lookup, and killUnit must never do four.
   */
  private readRelics(): void {
    this.armorBlind = this.relics.has("monofil");
    this.titanOn = this.relics.has("titan");
    this.executeAt = this.relics.has("terminal") ? TERMINAL_FRACTION : 0;
    this.cascadeOn = this.relics.has("cascade");
  }

  /**
   * The stats a turret of this kind fires with — the stock table unless
   * the tree has an upgrade branch's worth of points in it (see `specs`).
   * Every reader of a turret's live stats goes through here, so no caller
   * has to know which kinds have been upgraded.
   *
   * PUBLIC, because the renderer and the field's own overlays need it too.
   * They used to read TOWERS directly, which meant a furnace whose beam
   * had been lengthened damaged at the new reach and was DRAWN at the old
   * one, and a selected turret showed a range ring its shots outran — the
   * two halves asking different tables the same question.
   */
  statsFor(kind: TowerKind): TowerStats {
    return this.specs.get(kind as TowerKind) ?? structStats(kind);
  }

  /**
   * The same resolution for a bullet already in the air (cf. bulletOf).
   *
   * PUBLIC BECAUSE THE RENDERER NEEDS IT TOO. It used to call the module's
   * own bulletOf, which reads the STATIC table — so a graphite round was
   * fired with 18 damage and its own colours and then drawn as a copper
   * pellet, because the two halves were asking different tables the same
   * question. Anything that wants a live bullet's stats comes through here.
   */
  bulletFor(kind: TowerKind, frag: boolean, alt = false): BulletStats {
    const own = this.statsFor(kind).bullet;
    // alt first, then frag — see bulletOf in constants.ts
    const b = alt && own.alt ? own.alt : own;
    return frag && b.frag ? b.frag.bullet : b;
  }

  /** live towers per kind — the bar's remaining-count badges, and the cap check */
  towerCounts(): Record<TowerKind, number> {
    const counts = Object.fromEntries(TOWER_KINDS.map((k) => [k, 0])) as Record<TowerKind, number>;
    // the swarm's conquered turrets are not the player's board: they are
    // not counted, not upgraded, and never move a count-dependent rung
    for (const t of this.towers) if (t.team === "player") counts[t.kind]++;
    return counts;
  }

  /**
   * ENEMIES LEFT TO KILL, COUNTED OFF THE WORLD RATHER THAN OFF A LEDGER:
   * what is standing on the field right now, plus what the script has not
   * sent yet. Nothing is subtracted, so nothing can fail to be subtracted.
   *
   * IT IS A READOUT AND NOT A WIN CONDITION. It used to be the whole of
   * the hold test — "no body, no corpse, no wave left" was what winning a
   * map meant — and that reading is gone with the fifty-wave objective:
   * the script goes round again (see TIDE_LEVELS), so on most missions
   * this number never reaches zero at all. What a mission is met by is
   * `won()`, per kind. This is what the HUD prints.
   *
   * THIS USED TO BE `totalEnemies - kills - devoured - exploded`, and that
   * shape is why a run could not be won after a wave skip: the skip walks
   * the cursor past waves whose bodies were already in `totalEnemies` and
   * pays none of them back, so the total stayed owed forever and the level
   * never ended (see skipToWave). The same hole opens for every future
   * door a body might leave by — a new mutator that removes units, an
   * ability that banishes them, anything at all — because each one has to
   * remember to credit a counter it has no reason to know about.
   *
   * Counted from the world there is no such obligation. A body that is
   * gone is gone because it is not on the field; a wave the cursor has
   * walked past is not counted because the cursor is past it. The four
   * pieces:
   *
   *  - every row on the field, weighted by `ustack` — a folded body
   *    (mergeSqueezed) is several bodies riding in one row, and the wave
   *    that sent them is not finished until the row that holds them dies.
   *  - every wave still walking on, its unsent remainder off `live`.
   *  - every wave the cursor has not reached (scriptLeft).
   *  - THE CORPSES, stacks and all. Reconstruction (updateCorpses) stands
   *    them back up, so a field that looks clear with a corpse on it has
   *    bodies still to come — and the old ledger, which had already
   *    counted the corpse as a kill, could declare the level won a moment
   *    before its swarm got off the floor.
   */
  remaining(): number {
    let left = 0;
    for (let i = 0; i < this.n; i++) left += this.ustack[i];
    for (const lw of this.live) for (const e of lw.entries) left += e.left;
    for (const c of this.corpses) left += c.stack;
    // the cursor is left PAST every wave it has staged (stageOne) and those
    // waves' remainders are in `live` above, so the unreached script starts
    // at the step the cursor is on. Clamped because a spent script leaves
    // stepIdx at the script's own length
    left += this.scriptLeft[Math.min(this.stepIdx, this.scriptLeft.length - 1)];
    return left;
  }

  /** per-kind head count currently on the field, indexed like UNIT_KINDS */
  aliveByKindList(): number[] {
    return Array.from(this.aliveByKind);
  }

  /**
   * EVERY OBJECTIVE BODY ON THE FIELD, one row a thing, for the HUD's bar
   * stack — a Sovereign and a Borer alike (levels.ts OBJECTIVE_KINDS).
   *
   * THE BAR IS WHAT MAKES A BODY AN EVENT. Everything else on the board is
   * volume: it is read as a crowd, it is priced by the wave, and a bar
   * over each would be noise. An objective is one thing the run has to go
   * and deal with, and the only honest readout of "how is that going" is
   * its health — which nothing else on screen says, because a Borer is
   * twenty hurtboxes wearing one pool and a Sovereign is off at the far
   * end of the map behind its own escort.
   *
   * A BORER IS ONE ROW AND NOT TWENTY. The train is twenty separately
   * shootable pieces and ONE health pool (`crossers`), so the bar is the
   * pool: a player shooting the ninth car watches the same bar move as one
   * shooting the nose, which is the fact the mission is actually about.
   *
   * ROWS ARE KEYED AND ORDERED so the stack never reshuffles: a boss by
   * its spawn id (unit indices swap under swap-remove, and a bar that
   * traded places with its neighbour whenever something died would read as
   * a glitch), a crosser by its launch order, and the crossers after the
   * bosses. The HUD stacks them downward in this order.
   *
   * `ally` IS WHOSE THING THE BAR IS OVER, and it is on the row rather
   * than worked out in the HUD off the name. Every bar in this stack used
   * to be painted the swarm's crimson, which was true of every row in it
   * until the escort landed — and then the one body on the board the
   * player is paying to keep alive wore the colour this game uses for
   * "shoot this". A player glancing at the top of the screen read their
   * own hauler as another thing to kill. The sim knows which side a row
   * came off; the HUD does not, and matching a display name against a
   * string constant to find out would be a second place for the answer to
   * live (see the note on the seam in CLAUDE.md).
   *
   * The boss scan early-exits off the census the way collectForceFields
   * does, so a board with no boss on it pays nothing.
   */
  objectiveBars(): { id: number; name: string; hp: number; max: number; ally: boolean }[] {
    const out: { id: number; name: string; hp: number; max: number; ally: boolean }[] = [];
    let left = 0;
    for (const k of BOSS_KINDS) left += this.aliveByKind[k];
    if (left > 0) {
      const bosses: { id: number; name: string; hp: number; max: number; ally: boolean }[] = [];
      for (let i = 0; i < this.n && bosses.length < left; i++) {
        const k = this.ukind[i];
        if (!KIND_BOSS[k]) continue;
        bosses.push({
          id: this.uid[i],
          name: unitName(UNIT_KINDS[k]),
          hp: Math.max(0, this.uhp[i]),
          max: this.uhpmax[i],
          ally: false,
        });
      }
      bosses.sort((a, b) => a.id - b.id);
      out.push(...bosses);
    }
    // ...and the trains, in launch order. A worm that has leaked is off
    // the board and out of the count (updateCrosser) even while its last
    // pieces walk off the rim, so `alive` is the whole test
    for (let id = 0; id < this.crossers.length; id++) {
      const w = this.crossers[id];
      if (w.alive <= 0) continue;
      out.push({
        id: BAR_CROSSER_ID + id,
        name: WORM_NAME,
        hp: Math.max(0, w.hp),
        max: w.hpMax,
        ally: false,
      });
    }
    // ...AND THE CART, which wears the same bar as the things trying to
    // kill it. It is the player's, and that is exactly why it belongs
    // here: an objective bar is "the thing this map is about, and how it
    // is doing", and on Thornway that thing is a hauler rather than a
    // Borer. `ally` is what the HUD paints it WHITE off — the swarm's
    // crimson on the player's own objective read as a target.
    for (let id = 0; id < this.convoys.length; id++) {
      const c = this.convoys[id];
      if (c.dead || c.home) continue;
      out.push({
        id: BAR_CONVOY_ID + id,
        name: CONVOY_NAME,
        hp: Math.max(0, c.struct.hp),
        max: c.struct.hpMax,
        ally: true,
      });
    }
    return out;
  }

  /**
   * 1-BASED NUMBER OF THE WAVE ON THE FIELD — the one the player is
   * fighting, and now simply the last one the clock called.
   *
   * IT USED TO NEED ARITHMETIC. Staging ran a whole waveGap ahead of a
   * wave entering, so `wavesStarted` had to be backed off by one for the
   * length of that gap or the HUD named a wave that had not arrived, with
   * a special case for the opening where there was no earlier wave to be
   * current. Staging IS entering now (stageOne runs when waveStartTime
   * says so), so the number is the number.
   *
   * The floor keeps a run reading "wave 1" through the opening gap, before
   * anything has been staged at all.
   */
  currentWave(): number {
    return Math.max(1, this.wavesStarted);
  }

  /**
   * THE WAVE THE CLOCK SAYS IT IS — which is the same wave the field says
   * it is, now that the script cannot fall behind its own schedule
   * (runScript). Kept as its own name because the playtest and the stage
   * tables ask the question that way, and because the difference between
   * the two mattered for years.
   */
  stageWave(): number {
    return Math.max(1, this.wavesDueAt(this.time));
  }

  /** seconds until the next wave starts entering — off the schedule, so it
   *  is a real countdown and not a guess about when the doors will clear */
  nextWaveIn(): number {
    return Math.max(0, this.waveStartTime(this.wavesStarted + 1) - this.time);
  }

  /**
   * HOW MANY WAVES ARE CLEARED. A wave is cleared when it has finished
   * entering and every body it put on the field, brood included, is down:
   * killed, devoured or blown up.
   *
   * IT IS NO LONGER THE OBJECTIVE, and it is still two things. A HOLD
   * mission is counted in it (won, holdTarget) — that is the one mission
   * whose assignment is stated in waves. And on EVERY mission it is what a
   * DEFEAT is paid for (missionXp in economy.ts): a run that goes down
   * short of its objective still banks the waves it broke on the way, so
   * a failed push is progress. A win pays the whole pot and never reads
   * this. Counted over every
   * wave staged rather than as a prefix, because waves overlap on a long
   * field — a wave 8 whose last ironhide3 is still walking must not hold
   * wave 9's payout back once wave 9 is dead to the last ironhide1.
   */
  wavesCleared(): number {
    let n = 0;
    for (let w = 1; w <= this.wavesStarted; w++)
      if (this.waveEntered[w] && (this.waveDown[w] ?? 0) >= (this.waveSpawned[w] ?? 0)) n++;
    return n;
  }

  /**
   * THE BUILDING GOES UP, on the footprint and with the attributes the
   * placement already settled.
   *
   * THE MASK ARRIVES FROM OUTSIDE NOW rather than being rolled here. It
   * used to be rolled on this line, which was fine while every turret was
   * its kind's own size; the GIANT (mods.ts) decides a FOOTPRINT, and a
   * footprint has to be known before the ground can be tested — so the
   * roll moved up to placeTower and this takes the answer.
   */
  /**
   * HOW MANY STRUCTURES THIS RUN HAS EVER PUT DOWN, only ever going up.
   *
   * The card layer watches it to know the card in hand has landed. It is
   * counted HERE, where a building is actually made, rather than by the
   * caller adding up what a placement returned — a count that has to be
   * returned is a count that cannot cross a thread, and this one never has
   * to be asked for at all.
   */
  placed = 0;

  private addTower(gx: number, gy: number, kind: TowerKind, sz: number, mods: number): void {
    this.placed++;
    const tower = this.newTower(gx, gy, kind, sz, mods);
    this.towers.push(tower);
    // the attributes it just rolled become its stats and its pool, and it
    // opens at FULL health on the new ceiling rather than the table's
    this.resolveTower(tower);
    tower.hp = tower.hpMax;
    this.claimGround(tower, true);
    // a count-dependent rung (tacker power) reads the board, so the board
    // changing is what moves it — owed, and paid once at the batch's or
    // the step's end (oweCount)
    this.oweCount(kind);
  }

  /**
   * ONE STRUCTURE RECORD, filled in — every field a Tower has, at the
   * value a freshly placed one carries. It is SPLIT OUT of addTower
   * because a second thing in this file needs a Tower that is not a
   * building: the escort mission's cart (launchConvoy, levels.ts
   * CONVOY_HP), which is a structure the swarm shoots and is in no list,
   * claims no ground and is never resolved.
   *
   * THE SPLIT IS WHAT MAKES THAT SAFE. The cart used to be a hand-written
   * literal cast to Tower, which meant the day somebody added a field
   * here the cart would be missing it and nothing would say so — a cast
   * is a promise the compiler stops checking. Built through this, the
   * cart is a real one with four numbers written over it.
   */
  private newTower(gx: number, gy: number, kind: TowerKind, sz: number, mods: number): Tower {
    // EVERY STRUCTURE IS PLACED FINISHED — full pool, gun live, this tick.
    // It used to go up as a 1 hp shell on a timer (see Tower in types.ts)
    const x = (gx + sz / 2) * CELL, y = (gy + sz / 2) * CELL;
    const tower: Tower = {
      kind,
      gx,
      gy,
      x,
      y,
      size: sz,
      hp: towerMaxHp(kind),
      hpMax: towerMaxHp(kind),
      mods,
      // the player builds it; only Conquest ever writes the other value
      team: "player" as Team,
      spec: structStats(kind),
      regen: 0,
      // a fresh building is not rotting (Tower.poison); only the venom
      // line's orbs ever write these two
      poison: 0,
      poisonUnit: 0,
      poisonT: 0,
      // ...nor shorted (the Wraith fleet's EMP) nor jammed (the sky's T4),
      // nor alight (the Grapnels' fire star)
      shortT: 0,
      burnT: 0,
      burnDps: 0,
      jamT: 0,
      jamRate: 1,
      soakT: 0,
      soakRate: 1,
      // ...and nothing is infected the moment it is built: the Mech Virus
      // only ever arrives off a dead carrier or off a dead neighbour
      virus: false,
      // Undying Legion (mods.ts) grants every turret one stand-up, the
      // ones bought after it included
      revives: this.relics.has("undying") ? 1 : 0,
      // ...and what Conquest hands the swarm's copy back (Tower.revivesMax)
      revivesMax: this.relics.has("undying") ? 1 : 0,
      boostT: 0,
      aimShieldTower: -1,
      aimTower: null,
      cd: Math.random() * 0.1,
      // Hydrophobic (mutation.ts): read the ground once, here, and carry it
      fireRate: this.isWaterlogged(gx, gy, kind, sz) ? HYDROPHOBIC_RATE : 1,
      angle: 0,
      target: -1,
      targetIdx: -1,
      // start the re-pick clock at a random phase so a wall of turrets
      // spreads its scans across the interval instead of all paying on
      // the same tick
      targetT: Math.random() * TARGET_INTERVAL,
      burstLeft: 0,
      burstT: 0,
      shotCount: 0,
      aimX: 0,
      aimY: 0,
      chargeT: -1,
      beamX: 0,
      beamY: 0,
      beamStr: 0,
      beamSpool: 0,
      beamT: -1,
      beamOX: 0,
      beamOY: 0,
      beamRot: 0,
      beamDmgT: 0,
      flashT: 0,
      flashX: 0,
      flashY: 0,
      flashRot: 0,
    };
    return tower;
  }



  /** the structure standing on a world point, if it is `team`'s */
  private structureAt(px: number, py: number, team: Team = "player"): Structure | null {
    if (px < 0 || py < 0 || px >= W || py >= H) return null;
    // THE CART FIRST, because it is not on the grid this reads (levels.ts
    // CONVOY_HP) and this is the function every arriving round comes
    // through — sweepShot walks a step by calling it, and a shell that
    // runs out of life asks it what it landed on. Without this a round
    // aimed at the hauler flew straight through it: the swarm picked the
    // objective, fired at the objective, and only its SPLASH ever landed,
    // because splash goes through structuresWithin and that one walks
    // cells rather than reading them.
    //
    // A SQUARE, like every other footprint on the board, and the cart's
    // own `size` is the square — the art turns with the road but the box
    // does not, which is the same simplification `canSee` and the target
    // search already make about it.
    if (this.convoys.length > 0 && team === "player")
      for (const c of this.convoys) {
        if (c.dead || c.home || c.struct.hp <= 0) continue;
        const half = (c.struct.size * CELL) / 2;
        if (
          px >= c.struct.x - half && px <= c.struct.x + half &&
          py >= c.struct.y - half && py <= c.struct.y + half
        )
          return c.struct;
      }
    const t = this.cellTower[((py / CELL) | 0) * COLS + ((px / CELL) | 0)];
    // the team test costs nothing in a run without Conquest, where every
    // building on the board is the player's and `enemyTowers` is 0
    return t && (this.enemyTowers === 0 ? team === "player" : teamOf(t) === team) ? t : null;
  }


  /**
   * WHERE THE STEP'S TIME GOES, phase by phase.
   *
   * WHY THIS EXISTS. The frames check times the step as one number against
   * a board IT builds, and a board it builds is a guess at the board a
   * player plays. When the two disagree — and they have — a single number
   * cannot say which pass is responsible, so the only honest next move is
   * to measure the step in the game rather than in the harness.
   *
   * FREE WHEN OFF, which is what lets it live in the shipping path rather
   * than in a branch that rots. `mark` returns on a boolean before it
   * reads a clock, and every call site passes a string LITERAL, so nothing
   * is allocated and nothing is computed until someone asks. Switched on
   * it costs one performance.now() per phase — about a microsecond a step,
   * against the tens of milliseconds it is there to explain.
   *
   * THE NAMES BUILD THEMSELVES from the call sites, in the order they run,
   * so a phase added to update() shows up here without a table anyone has
   * to remember to update. A table beside the code is a table that rots.
   */
  private profOn = false;
  private profAt = 0;
  private profI = 0;
  private profSteps = 0;
  /**
   * THE HIGH-WATER MARKS over the tally's window. The census is read at
   * PUBLISH time and so describes the board at the moment you asked —
   * which is very often not the board that produced the worst step. A
   * wave that spikes and clears leaves a census that makes the times look
   * inexplicable; these are what say "there were nine hundred shots in
   * the air at some point in that window", which is usually the answer.
   */
  private profPeakBodies = 0;
  private profPeakShots = 0;
  private profPeakRmax = 0;
  /** where the step's own clock started, and the dearest whole step seen */
  private profStepAt = 0;
  private profStepMs = 0;
  private profStepWorst = 0;
  private profOver = 0;
  private readonly profNames: string[] = [];
  private readonly profTotal: number[] = [];
  private readonly profWorst: number[] = [];
  private readonly profProbes: number[] = [];
  /** the probe count as it stood at the last mark, for this phase's share */
  private profProbeAt = 0;

  /**
   * THE SLOW STEPS, TALLIED APART FROM THE REST — and this is the half of
   * the reading that survives a long window.
   *
   * A mean is only an answer when the window is all one thing. Arm the
   * clock and play for three minutes and most of those ten thousand steps
   * were fine; the forty that hitched are what the player actually came
   * to ask about, and they are four tenths of one per cent of the
   * average. The mean says the sim is comfortable. The player says it
   * stutters. BOTH ARE TRUE, and a reading that can only print the first
   * one quietly argues the player out of a real complaint.
   *
   * So every step that misses the budget adds its phases into a SECOND
   * set of totals. The main table stays what it was — what a step costs
   * on this board — and this one answers the different question: when it
   * goes wrong, where does the time go? A phase that is a tenth of the
   * mean and half of the slow steps is the whole bug, and it is invisible
   * in any single average of the two.
   *
   * It costs a per-phase array copy on slow steps only, which is to say
   * on the steps that have already lost twenty milliseconds.
   */
  /** per phase, per counter: the work that phase did (flat, NWORK wide) */
  private readonly profWork: number[] = [];
  /**
   * ...THE SAME, OVER THE SLOW STEPS ALONE, and it is the half that
   * usually names the cause. A rare, expensive event — a route re-solve
   * lands on one step in a hundred and fifty — averages to nothing per
   * step and reads as a phase doing no work at all, while being the
   * entire reason the game stutters. Averaged over the steps that ACTUALLY
   * MISSED, the same event reads as 1.0 per slow step, which is the whole
   * answer in one number.
   */
  private readonly profSlowWork: number[] = [];
  /** this step's work per phase, held until the step is judged slow or not */
  private readonly profStepWork: number[] = [];
  /** each counter as it stood at the last mark */
  private readonly profWorkAt: number[] = new Array(NWORK).fill(0);
  private readonly profStepPhase: number[] = [];
  private readonly profStepProbe: number[] = [];
  private readonly profSlowTotal: number[] = [];
  private readonly profSlowProbes: number[] = [];
  private profSlowMs = 0;

  /**
   * WALL TIME THE SIM WAS ACTUALLY LIVE FOR, which is not the same thing
   * as the window's length and not the same thing as its steps.
   *
   * THE STEP COUNT IS GAME TIME. Every step is SIM_DT exactly, so 3,000
   * steps is fifty seconds of the WORLD however long they took to run.
   * When the sim keeps up, fifty seconds of world is fifty seconds of
   * wall and the two agree. When it does not, SimClock caps catch-up at
   * SIM_STEPS_MAX and FORFEITS the rest (simclock.ts) — so a sim that
   * cannot hold 60 steps a second does not fall behind and catch up, it
   * quietly runs the world in slow motion. That is what "the bullets lag"
   * looks like from the inside, and a phase table cannot show it: every
   * step still costs what it costs, there are simply fewer of them.
   *
   * So the gap between one step and the next is banked here, CAPPED AT
   * DT_CAP — the same cap the clock puts on a frame, and the reason a
   * pause does not corrupt this. Held, the sim is not stepped at all
   * (SimClock.advance returns early), so a pause is one enormous gap
   * between two steps, and the cap counts it as a single slow frame
   * rather than as the minutes it really was. Pausing costs this figure
   * 50ms per pause and nothing else.
   */
  private profLiveMs = 0;
  private profLastEnd = 0;
  /** the board as it stood at the dearest step, not at the moment you asked */
  private profWorstBodies = 0;
  private profWorstShots = 0;

  /**
   * THE DENOMINATOR: every candidate the broad phase has handed the narrow
   * one since the sim started. Each bucket sweep in this file adds the
   * LENGTH of the row it is about to walk — one add per hash row, never
   * one per body — so the counter costs nothing measurable and is kept
   * whether the clock is armed or not, which is what lets `mark` take a
   * difference without a branch in the sweeps themselves.
   *
   * WHY IT IS THE NUMBER THAT MATTERS. Milliseconds say WHICH pass is
   * slow; they cannot say whether it is slow because there is more to do
   * or because each thing costs more. Probes split those apart: ms over
   * probes is the price of one candidate (which barely moves), and probes
   * over the population is how many candidates each shot, each turret,
   * each body is walking — which is exactly what a wide hitbox or a
   * crowded bucket blows up, and exactly what a wave-count does not.
   */
  probes = 0;
  /**
   * ...AND THE OTHER KINDS OF WORK, because a step does more than one.
   *
   * THE MISTAKE THIS FIXES. There used to be only `probes`, and probes
   * are body-hash candidates. Every phase whose work is NOT a body sweep
   * therefore reported milliseconds against a denominator that did not
   * describe it — and dividing one by the other produced a per-item cost
   * that looked damning and meant nothing. A profiler that answers
   * confidently with the wrong denominator is worse than one that says
   * nothing, because it gets acted on.
   *
   * So each distinct kind of work the sim does has its own counter, and
   * `mark` files ALL of them per phase. A phase then reports what it
   * actually did, whatever that is, and a phase whose counters are all
   * zero is visibly a phase doing something nobody is counting — which is
   * a statement the reader can act on rather than a trap.
   */
  /** candidates walked out of the STRUCTURE index and the cell grid */
  structCands = 0;
  /** sight rays cast (hasSight), and the grid cells they walked */
  rays = 0;
  rayCells = 0;
  /** per-body iterations of the big linear passes */
  bodyIters = 0;
  /** target searches actually run (pickAim) */
  picks = 0;
  /** flow-field solve slices spent (runSolveQueue) */
  fieldSlices = 0;

  /** close the phase that just ran, open the next */
  private mark(name: string): void {
    if (!this.profOn) return;
    const t = performance.now();
    const i = this.profI++;
    if (this.profNames.length <= i) {
      this.profNames.push(name);
      this.profTotal.push(0);
      this.profWorst.push(0);
      this.profProbes.push(0);
      this.profSlowTotal.push(0);
      this.profSlowProbes.push(0);
      this.profStepPhase.push(0);
      this.profStepProbe.push(0);
      for (let w = 0; w < NWORK; w++) {
        this.profWork.push(0);
        this.profSlowWork.push(0);
        this.profStepWork.push(0);
      }
    }
    const ms = t - this.profAt;
    const probes = this.probes - this.profProbeAt;
    this.profTotal[i] += ms;
    if (ms > this.profWorst[i]) this.profWorst[i] = ms;
    this.profProbes[i] += probes;
    // ...and kept for THIS step alone, because whether this step counts
    // as a slow one is not known until every phase of it has run
    this.profStepPhase[i] = ms;
    this.profStepProbe[i] = probes;
    this.profProbeAt = this.probes;
    // EVERY COUNTER, into this phase's row. Six subtractions a mark, a
    // hundred-odd a step — against the tens of milliseconds they exist to
    // explain, and only while the clock is armed
    const at = this.profWorkAt;
    const row = i * NWORK;
    const w = this.profWork;
    const sw = this.profStepWork;
    sw[row] = this.probes - at[0]; at[0] = this.probes;
    sw[row + 1] = this.structCands - at[1]; at[1] = this.structCands;
    sw[row + 2] = this.rays - at[2]; at[2] = this.rays;
    sw[row + 3] = this.rayCells - at[3]; at[3] = this.rayCells;
    sw[row + 4] = this.bodyIters - at[4]; at[4] = this.bodyIters;
    sw[row + 5] = this.picks - at[5]; at[5] = this.picks;
    sw[row + 6] = this.fieldSlices - at[6]; at[6] = this.fieldSlices;
    for (let k = 0; k < NWORK; k++) w[row + k] += sw[row + k];
    this.profAt = t;
  }

  /**
   * Start or stop the phase clock. STARTING clears the tally; stopping
   * KEEPS it, so a run can be ended and then read — the other way round
   * throws away the measurement at the moment you ask for it, which is a
   * trap rather than an API.
   */
  /** is the phase clock armed — the report carries its reading only then */
  get profiling(): boolean {
    return this.profOn;
  }

  profile(on: boolean): void {
    if (on) {
      this.profSteps = 0;
      this.profStepMs = 0;
      this.profStepWorst = 0;
      this.profOver = 0;
      this.profSlowMs = 0;
      this.profLiveMs = 0;
      this.profLastEnd = 0;
      this.profPeakBodies = 0;
      this.profPeakShots = 0;
      this.profPeakRmax = 0;
      this.profWorstBodies = 0;
      this.profWorstShots = 0;
      this.profTotal.fill(0);
      this.profWorst.fill(0);
      this.profProbes.fill(0);
      this.profSlowTotal.fill(0);
      this.profSlowProbes.fill(0);
      this.profWork.fill(0);
      this.profSlowWork.fill(0);
    }
    this.profOn = on;
  }

  /**
   * THE WHOLE READING, and it is deliberately more than a list of times.
   *
   * A phase table alone has never been enough to act on. "projectiles
   * 9.8ms" is the same sentence whether the board is firing nine hundred
   * shots that each cost what a shot costs, or ninety that have each been
   * made twenty times dearer by one wide body standing on the field — and
   * those two have opposite fixes. So every figure here comes with the
   * thing it has to be divided by:
   *
   *   MS AND PROBES, per phase. ms/probes is the price of one candidate
   *   and is near-constant; probes/step is the work, and it is the number
   *   that actually moves. A phase that doubled in ms with its probes
   *   flat got slower per item (a new test, a cache miss, a trig call);
   *   one whose probes doubled with it is simply doing twice as much.
   *
   *   WORST BESIDE MEAN, per phase and for the step. Lag is felt as a
   *   SPIKE and averaged away as a mean: a 3ms mean with a 40ms worst is
   *   a route re-solve or a wave spawn, and no amount of staring at the
   *   mean will say so.
   *
   *   THE CENSUS, once. The populations every figure above is per: the
   *   bodies, the shots, the turrets — and the widest live hitbox, which
   *   is what sizes the broad-phase pad every sweep in this file pays
   *   (rmaxAliveFor), and so the one dial that can multiply the probe
   *   count of a board that has not otherwise changed.
   *
   * PER STEP, never per frame: the step is what has to fit in 16.7ms, and
   * a slow frame runs it more than once (see Game.simMs).
   */
  profileRead(): PhaseRead[] {
    const n = Math.max(1, this.profSteps);
    const slow = Math.max(1, this.profOver);
    return this.profNames
      .map((name, i) => ({
        name,
        ms: this.profTotal[i] / n,
        worst: this.profWorst[i],
        probes: this.profProbes[i] / n,
        // ...and the same pass over the slow steps ALONE, which is a
        // different average and very often a different ranking
        slowMs: this.profSlowTotal[i] / slow,
        slowProbes: this.profSlowProbes[i] / slow,
        work: this.profWork.slice(i * NWORK, i * NWORK + NWORK).map((v) => v / n),
        slowWork: this.profSlowWork
          .slice(i * NWORK, i * NWORK + NWORK)
          .map((v) => v / slow),
      }))
      .sort((a, b) => b.ms - a.ms);
  }

  /** the reading with its denominators — what the console prints */
  profileFull(): ProfileRead {
    const n = Math.max(1, this.profSteps);
    return {
      steps: this.profSteps,
      ms: this.profStepMs / n,
      worst: this.profStepWorst,
      over: this.profOver,
      slowMs: this.profSlowMs / Math.max(1, this.profOver),
      simMs: this.profSteps * SIM_DT * 1000,
      liveMs: this.profLiveMs,
      worstBodies: this.profWorstBodies,
      worstShots: this.profWorstShots,
      phases: this.profileRead(),
      census: this.profileCensus(),
    };
  }

  /**
   * THE POPULATIONS, read where they live and costing one walk of the
   * shot list. Everything here is a denominator for something in the
   * phase table above; nothing here is measured, so it is as true of the
   * instant it is asked as the header is.
   */
  profileCensus(): ProfileCensus {
    let shots = 0, hostile = this.shots.length;
    const FL = this.projs.flags;
    for (let i = 0; i < this.projs.n; i++) {
      if (FL[i] & PROJ_ENEMY) hostile++;
      else shots++;
    }
    // THE PAD ONE BULLET PAYS, in hash cells: the sweep in
    // updateProjectiles walks (2*span+1) squared of them, and span is set
    // by the widest hitbox ALIVE rather than by anything about the bullet.
    // One heavy body on the field therefore raises the price of every
    // shot in the air, which is the single most surprising line in this
    // whole report and the reason it is printed
    const rmax = Math.max(this.rmaxAliveAir, this.rmaxAliveGround);
    const span = Math.max(1, Math.ceil((rmax + 2.5) / HC));
    return {
      wave: this.currentWave(),
      bodies: this.n,
      air: this.nAliveAir,
      ground: this.nAliveGround,
      shots,
      hostileShots: hostile,
      towers: this.towers.length,
      domes: this.shieldTowers.length,
      corpses: this.corpses.length,
      fx: this.fxN,
      rmaxAir: this.rmaxAliveAir,
      rmaxGround: this.rmaxAliveGround,
      shotSpan: span,
      shotCells: (2 * span + 1) * (2 * span + 1),
      peakBodies: this.profPeakBodies,
      peakShots: this.profPeakShots,
      peakRmax: this.profPeakRmax,
    };
  }

  update(dt: number): void {
    // Mindustry Time.time: seconds of SIMULATED time, so animations driven
    // by it (the shield hatch) speed up with the game speed and hold still
    // while the sim is paused
    this.time += dt;
    this.tick++;
    if (this.profOn) {
      this.profSteps++;
      this.profI = 0;
      this.profAt = performance.now();
      this.profStepAt = this.profAt;
      this.profProbeAt = this.probes;
      const at = this.profWorkAt;
      at[0] = this.probes;
      at[1] = this.structCands;
      at[2] = this.rays;
      at[3] = this.rayCells;
      at[4] = this.bodyIters;
      at[5] = this.picks;
      at[6] = this.fieldSlices;
      // the wait since the last step, on the clock's own terms (DT_CAP)
      if (this.profLastEnd > 0) {
        const gap = this.profAt - this.profLastEnd;
        this.profLiveMs += gap < DT_CAP * 1000 ? gap : DT_CAP * 1000;
      }
    }
    this.runIncome(dt);
    this.runScript(dt);
    // ...and the mission's own schedule, where it has one (levels.ts
    // InterceptMission): the crossers are an appointment somewhere else
    // on the map, not a wave — and, like the waves, an appointment kept by
    // the clock rather than by whatever the board is doing
    this.runCrossers();
    // ...and one section up per moment, on the same absolute clock
    // (runSections)
    this.runSections();
    // ...and the escort's, which is the same clock read the other way:
    // one departure per cart, on absolute moments (runConvoys)
    this.runConvoys();
    // a structure went up on, or came down off, open ground: shove anything
    // standing in its cells clear now, and re-solve the routes when the
    // board settles (solveDirtyFields)
    if (this.unstickPending) {
      this.unstickPending = false;
      this.unstickUnits();
    }
    this.solveDirtyFields(dt);
    this.mark("script+field");

    this.updateAliveBounds();
    this.mark("bounds");
    this.buildHash();
    this.mark("hash");
    this.updatePhysics();
    this.mark("physics");
    this.updateUnits(dt);
    // ...and the escort's cart, on the same beat and for the same reason
    // the crossers ride updateUnits: it is a body on a road, and the rot
    // burning on it has to tick whether or not it is rolling
    this.updateConvoys(dt);
    this.mark("units");
    this.updateAbilities(dt);
    this.mark("abilities");
    // ...and the ORDER over the tier fives' escorts (Leadership), on its
    // own beat. After the abilities and before anything shoots, so a body
    // that walked into the circle this tick is covered for the volley
    // that lands this tick
    this.updateLeadership(dt);
    this.mark("leadership");
    this.updateStatus(dt);
    this.mark("status");
    // the hungry eat AFTER the status pass and before the towers fire, so a
    // unit that burned to death this tick is already gone rather than being
    // swallowed as a corpse — and so a meal's health is on the eater before
    // anything shoots at it
    this.feedHungry(dt);
    this.mark("hungry");
    // ...and the squeezed fold, on the same footing: a body that died this
    // tick is gone rather than folded, and a fold's pooled health is on
    // the survivor before anything shoots at it
    this.mergeSqueezed(dt);
    this.mark("squeeze");
    // ...and the Grapnels' own fold beside it, on the same footing and for
    // the same reasons: a grapnel that died this tick is gone rather than
    // folded, and a fold's pooled health is on the survivor before
    // anything shoots at it
    this.mergeGrapnel(dt);
    this.mark("fold");
    // the waders gain AFTER the status pass for the same reason: a body
    // that burned to death this tick is already gone, and a stack taken
    // this tick is on the unit before anything shoots at it
    this.updateAmphibious(dt);
    this.mark("amphibious");
    // ShieldComp: shieldAlpha fades out over 15 ticks once nothing refreshes it
    for (let i = 0; i < this.n; i++)
      if (this.ushieldAlpha[i] > 0) this.ushieldAlpha[i] = Math.max(0, this.ushieldAlpha[i] - dt * (60 / 15));
    this.mark("shieldFade");
    // shieldTowers run before the towers so a dome that regenerated this tick
    // absorbs the volley fired this tick, never one late
    this.updateShieldTowers(dt);
    this.mark("domes");
    this.fireTowers(dt);
    this.mark("towers");
    this.updateProjectiles(dt);
    this.mark("projectiles");
    this.updateUnitWeapons(dt);
    this.mark("unitGuns");
    this.updateEnemyShots(dt);
    this.mark("enemyShots");
    // CASCADE CHARGES (relics.ts): the heavy hulls that fell this tick,
    // going off — after every pass that can kill, so nothing is halfway
    // through a removal when a blast reaps its own dead (drainCascades)
    if (this.cascadeOn) this.drainCascades();
    this.mark("cascades");
    // RECONSTRUCTION (mutation.ts): the corpses standing back up, at the
    // very end of the tick — a body raised here starts walking on the NEXT
    // one, with a fresh hash and a fresh set of alive bounds under it,
    // rather than appearing halfway through passes that have already
    // decided what is on the field
    this.updateCorpses(dt);
    this.mark("corpses");
    // THE TABLE THE STEP OWES, paid once against the finished board — after
    // every pass that can kill or conquer (oweCount). Its own
    // phase, so an O(board) re-composition is a line in the profile with a
    // number beside it rather than a weight hidden inside whichever pass
    // happened to land the killing blow
    this.flushSpecs();
    this.mark("specs");

    const { fxAge, fxTtl } = this;
    for (let e = this.fxN - 1; e >= 0; e--) {
      fxAge[e] += dt;
      if (fxAge[e] >= fxTtl[e]) this.removeFx(e);
    }
    this.mark("fx");
    // the bodies stand where they stand until the next tick: resolve the
    // pile now, on its own thread, and take the answer at the next tick's
    // physics phase (physport.ts)
    this.physPort?.kick(this.n, this.tick);
    // THE STEP AS ONE NUMBER, closed after the last phase. It is not the
    // sum of the phases — the marks leave the gaps between them out, and
    // a total that quietly differed from its own parts would be the first
    // thing to mislead. Its WORST is the reading a player's "it stutters"
    // actually points at; the mean is what fits in the budget on paper
    if (this.profOn) {
      const end = performance.now();
      const ms = end - this.profStepAt;
      this.profStepMs += ms;
      this.profLiveMs += ms;
      this.profLastEnd = end;
      if (ms > this.profStepWorst) {
        this.profStepWorst = ms;
        // THE BOARD AT THE SPIKE. Over a long window the peaks below and
        // the census at publish time can both be miles from whatever the
        // dearest step was actually carrying, and without this there is
        // nothing to divide that step's milliseconds by
        this.profWorstBodies = this.n;
        this.profWorstShots = this.projs.n;
      }
      if (ms > STEP_BUDGET_MS) {
        this.profOver++;
        this.profSlowMs += ms;
        for (let i = 0; i < this.profI; i++) {
          this.profSlowTotal[i] += this.profStepPhase[i];
          this.profSlowProbes[i] += this.profStepProbe[i];
          const row = i * NWORK;
          for (let k = 0; k < NWORK; k++)
            this.profSlowWork[row + k] += this.profStepWork[row + k];
        }
      }
      // THE HIGH-WATER MARKS, taken at the END of the step and not its
      // start. Sampled at the start they miss whatever this step spawned,
      // and the census — which is read later still — can then come back
      // HIGHER than its own peak, which reads as a broken instrument and
      // costs the reader their trust in every other figure in the block
      if (this.n > this.profPeakBodies) this.profPeakBodies = this.n;
      if (this.projs.n > this.profPeakShots) this.profPeakShots = this.projs.n;
      const rm = this.rmaxAliveAir > this.rmaxAliveGround ? this.rmaxAliveAir : this.rmaxAliveGround;
      if (rm > this.profPeakRmax) this.profPeakRmax = rm;
    }
  }

  // ---------- level script ----------

  /**
   * Count the script and put its cursor on the first wave to play. Every run
   * opens on wave one: a save cannot buy its way past the opening any more,
   * so there is nothing to walk the cursor past.
   *
   * An empty wave is not a wave — loadStep skips it, so it must not count
   * here either, or the HUD would promise a wave that never arrives.
   */
  private stageScript(): void {
    this.totalEnemies = 0;
    this.totalWaves = 0;
    const script = this.level.script;
    this.lastWaveIdx = -1;
    // the per-step body counts, kept so the suffix sums below can be laid
    // down in one pass back over them
    const per = new Array<number>(script.length).fill(0);
    for (let i = 0; i < script.length; i++) {
      const step = script[i];
      if (!("wave" in step)) continue;
      let n = 0;
      for (const g of waveGroups(step.wave)) for (const c of g.counts) n += c;
      if (n === 0) continue;
      per[i] = n;
      this.totalWaves++;
      this.totalEnemies += n;
      this.lastWaveIdx = i;
    }
    // ...and the suffix sums over them, walked backwards (see scriptLeft)
    this.scriptLeft = new Array<number>(script.length + 1).fill(0);
    for (let i = script.length - 1; i >= 0; i--)
      this.scriptLeft[i] = this.scriptLeft[i + 1] + per[i];
    // the document's own count, frozen before the tide is allowed to move
    // totalWaves (see scriptWaves) — a hold with no number of its own is
    // measured against this one
    this.scriptWaves = this.totalWaves;
    this.stepIdx = 0;
    this.live.length = 0;
    this.wavesStarted = 0;
    this.waveSpawned.length = 0;
    this.waveDown.length = 0;
    this.waveEntered.length = 0;
    // NOTHING IS STAGED HERE. The first wave lands when its moment comes
    // like every wave after it (waveStartTime, stageDue) — a run opens on
    // an empty board and the opening gap is the breather it builds its
    // first line in.
  }

  // ---------- the wave clock ----------

  /**
   * HOW OFTEN A WAVE LANDS, in seconds — the level's gap plus the time a
   * wave takes to walk on. It is the run's whole pacing, and it is a fact
   * about the SCRIPT and never about the board.
   */
  private get waveCadence(): number {
    return Math.max(1, this.level.waveGap + WAVE_RELEASE_SECONDS);
  }

  /**
   * WHEN WAVE `n` (1-based) STARTS ENTERING, in seconds of run time. This
   * is the schedule, and everything else about the waves is derived from
   * it — which wave is current, how long until the next, where a skip
   * lands, when the tide turns.
   *
   * The opening is the one irregular gap: WAVE_GAP_OPENING rather than the
   * full one, so a run does not open on an empty map for twenty seconds.
   * (Capped by the level's own gap, so a level authored with a short gap
   * does not get a LONGER opening than its cadence.)
   */
  waveStartTime(n: number): number {
    const open = Math.min(WAVE_GAP_OPENING, Math.max(0, this.level.waveGap));
    return open + (Math.max(1, n) - 1) * this.waveCadence;
  }

  /** how many waves the clock has called by run time `t` — the wave number
   *  a skip to `t` lands on (skipToTime) */
  wavesDueAt(t: number): number {
    const open = this.waveStartTime(1);
    if (t < open) return 0;
    return Math.floor((t - open) / this.waveCadence) + 1;
  }

  /**
   * STAGE EVERY WAVE THE CLOCK HAS CALLED — run once a step, off `time`
   * and nothing else (waveStartTime).
   *
   * The loop is a `while` rather than an `if` because one step is allowed
   * to owe several waves: a skip lands mid-schedule, and a step that took
   * longer than a cadence would otherwise quietly drop one.
   */
  private stageDue(): void {
    while (this.time >= this.waveStartTime(this.wavesStarted + 1) && this.stageOne());
  }

  /**
   * PUT THE NEXT WAVE OF THE SCRIPT ON THE FIELD, or turn the tide and take
   * one off that. False when there was nothing left to send, which on a
   * hold that has staged its whole count is the script genuinely ending.
   *
   * An empty step is not a wave: it is walked past without costing a wave
   * number, so the schedule and the document agree about which wave is
   * which however many blank rows an author leaves in.
   *
   * THE CURSOR IS LEFT PAST THE WAVE IT STAGED, which is the one thing that
   * changed about `stepIdx` when the waves went on the clock — it used to
   * SIT ON the loaded wave, because there was only ever one loaded.
   * remaining() reads it accordingly.
   *
   * Recursion after the tide turns is one level deep by construction:
   * lastWaveIdx names a wave that is not empty, and the cursor is put at or
   * before it.
   */
  private stageOne(): boolean {
    const script = this.level.script;
    while (this.stepIdx < script.length) {
      const step = script[this.stepIdx];
      this.stepIdx++;
      const entries: { kind: number; left: number; total: number }[] = [];
      for (const g of waveGroups(step.wave))
        for (let kind = 0; kind < g.counts.length; kind++)
          if (g.counts[kind] > 0)
            entries.push({ kind, left: g.counts[kind], total: g.counts[kind] });
      if (entries.length === 0) continue;
      let total = 0;
      for (const e of entries) total += e.total;
      this.wavesStarted++;
      // ...and staging it pays NOTHING. It used to pay a bonus here; every
      // scrap comes off the swarm now (economy.ts)
      this.live.push({ wave: this.wavesStarted, entries, rate: waveSpawnRate(total), acc: 0 });
      this.manGarrisons(this.wavesStarted);
      return true;
    }
    // THE SCRIPT IS SPENT, AND THE TIDE TURNS (see TIDE_LEVELS at the top
    // of the file): the last TIDE_CYCLE_WAVES go again, one doubling of
    // health heavier, and count toward the run like any other wave. The
    // only mission that stops here is a hold that has already staged every
    // wave it asked for (tideTurns) — for everything else the waves are
    // pressure under an objective, and pressure that ran out would hand the
    // rest of the run to an empty board.
    if (this.tideTurns() && this.lastWaveIdx >= 0) {
      const from = Math.max(0, this.lastWaveIdx - (TIDE_CYCLE_WAVES - 1));
      for (let i = from; i <= this.lastWaveIdx; i++) {
        const step = script[i];
        if (!("wave" in step)) continue;
        let n = 0;
        for (const g of waveGroups(step.wave)) for (const c of g.counts) n += c;
        if (n === 0) continue;
        this.totalEnemies += n;
        this.totalWaves++;
      }
      this.loopCycle++;
      this.loopLevel += TIDE_LEVELS;
      this.stepIdx = from;
      return this.stageOne();
    }
    return false;
  }

  /**
   * THE CORE PAYS, AND IT IS THE ONLY THING THAT DOES (economy.ts
   * coreIncomeRate). The rate reads the run clock — not the board, not the
   * swarm, not the rung — so every difficulty sends the same money at the
   * same second and a harder rung is harder rather than poorer.
   *
   * Nothing is paid on a free board: the sandbox's purse is RICH_SCRAP and
   * an income on top of it would just be arithmetic on a number already
   * past every check.
   */
  private runIncome(dt: number): void {
    if (!this.charging || this.rich || this.lost() || dt <= 0) return;
    this.incomeCarry += coreIncomeRate(this.time) * dt;
    const paid = Math.floor(this.incomeCarry);
    if (paid <= 0) return;
    this.incomeCarry -= paid;
    this.scrap += paid;
    this.scrapEarned += paid;
  }

  /**
   * SKIP THE RUN FORWARD TO `target` SECONDS — the sandbox's jump, and the
   * only thing in the sim that moves the clock other than the clock
   * running. Nothing in a campaign run reaches it: the control is on the
   * sandbox strip and nowhere else.
   *
   * IT IS A TIME AND NOT A WAVE NUMBER, because the run IS a time now.
   * Every schedule in the game hangs off this one clock — which wave is due
   * (waveStartTime), when the next Borer launches (runCrossers), a
   * survive's deadline, the tide's cycles — so moving the clock moves all
   * of them at once and in step. A jump that moved a wave cursor left the
   * mission wherever it was, which is exactly what the old "skip to wave"
   * did on an intercept map: wave forty on the panel, and the Borers still
   * four minutes out.
   *
   * FORWARD ONLY. Walking backwards would mean un-spawning bodies that are
   * already dead and un-paying the scrap they dropped, and there is no
   * ledger here that can be run in reverse.
   *
   * WHAT SKIPPED TIME IS WORTH: nothing. The run did not fight it, so its
   * waves are not cleared, pay no XP (wavesCleared) and drop no scrap — a
   * jump to minute fifteen is a jump to minute fifteen's FIGHT, not to the
   * board and the purse a run that played fifteen minutes would have. The
   * sandbox builds for free anyway (setRich), which is the whole reason the
   * purse does not have to be faked here.
   */
  skipToTime(target: number): void {
    const want = Math.max(0, target);
    if (!Number.isFinite(want) || want <= this.time) return;
    const m = this.level.mission;

    // THE FIELD IS CLEARED FIRST. Every body still walking belongs to a
    // moment the jump is about to leave behind, and fighting wave three's
    // walkers under a panel that reads minute fifteen is not the board that
    // was asked for. removeUnit is the same door a kill leaves by, minus
    // the drop, the death puff and the ledger: a swarm nobody fought scores
    // nothing on the way out.
    //
    // WHOSE WAVES THEY WERE IS WORTH KNOWING, though, and is read here
    // while the rows still exist. removeUnit books each body as DOWN, and
    // down is most of what "cleared" means (wavesCleared) — so a wave
    // already through the door with three stragglers left would be paid for
    // the instant the jump swept them off, which is the opposite of what
    // happened to it. A wave with a body still walking is unfinished by
    // definition; the jump abandons it, and abandoned is not cleared.
    const abandoned = new Set<number>();
    this.crossSweeping = true;
    for (let i = this.n - 1; i >= 0; i--) {
      abandoned.add(this.uwave[i]);
      this.removeUnit(i);
    }
    this.crossSweeping = false;
    // ...and the corpses go with them, or Reconstruction stands a skipped
    // wave back up in the middle of the one jumped to (updateCorpses). A
    // corpse is a body its wave is still owed (killUnit un-books it), so
    // its wave is unfinished for exactly the same reason.
    for (const c of this.corpses) abandoned.add(c.wave);
    this.corpses.length = 0;
    // ...and every wave still walking on, thrown away unspent
    for (const lw of this.live) abandoned.add(lw.wave);
    this.live.length = 0;
    // A BORER SWEPT OFF BY A JUMP IS NEITHER KILLED NOR LEAKED. removeUnit
    // has already taken its pieces off the board above; this is what stops
    // the empty trains being counted as still crossing (crossersLive), and
    // therefore what lets the mission's own schedule re-arm at the new time
    for (const w of this.crossers) w.alive = 0;
    // ...and the launches the jump passed over are SPENT, all but the last.
    //
    // runCrossers reads the schedule off `time` (that is the whole point of
    // it), so a jump to minute nine would otherwise find four launches
    // overdue and send all four at once — from the same entry, two of them
    // down the same road, exactly superimposed. What minute nine actually
    // looks like is the launch minute nine called and the ones before it
    // long gone, so that is what a jump leaves: the cursor one short, and
    // runCrossers brings the current launch in a tick later.
    //
    // The passed launches are not made back, and are not meant to be —
    // skipped time is worth nothing here for the same reason a skipped
    // wave is not cleared. A jumped intercept cannot be met, which is true
    // of a jumped hold too.
    if (m.kind === "intercept") {
      const due = Math.floor((want - m.first) / Math.max(1e-6, m.every)) + 1;
      this.crossLaunched = Math.min(m.pattern.length, Math.max(this.crossLaunched, due - 1));
    }
    // ...AND THE SIEGE'S SECTIONS THE SAME WAY, for the same reason.
    // runSections also reads the schedule off `time`, so a jump to minute
    // thirteen would otherwise stand all four batteries up in one tick, on
    // top of each other's ground. What minute thirteen looks like is the
    // battery minute thirteen called and the ones before it long since
    // fought; that is what a jump leaves, with the cursor one short so
    // runSections raises the current one a tick later.
    //
    // THE SKIPPED BATTERIES ARE NOT MADE BACK, so a jumped siege cannot be
    // met — which is exactly as true of a jumped intercept and a jumped
    // hold. Skipped time is worth nothing here. The swept emplacements do
    // not score either: removeUnit ran above under `crossSweeping`.
    if (m.kind === "raze") {
      const dueSec = Math.floor((want - m.first) / Math.max(1e-6, m.every)) + 1;
      let past = 0;
      while (past < m.sections.length && razeWave(m.sections[past], past) < dueSec) past++;
      this.razeRisen = Math.max(this.razeRisen, past);
    }

    // WALK THE CURSOR RATHER THAN LEAPING IT, and stop ONE SHORT. A script
    // step is only a wave once it has been looked at — empty ones are
    // skipped and do not count (stageScript) — so the arithmetic only comes
    // out right if each one is staged in turn; and the tide has to be given
    // the chance to turn on the way, which is what makes a jump past the
    // script's end land in the climb instead of on an empty board.
    //
    // Nothing spawns on the way: each staged wave is popped straight back
    // off `live` unspent. The LAST one due is deliberately left for stageDue
    // to bring in a moment later, so the jump lands on a wave arriving
    // rather than on a board that has just been swept.
    const due = this.wavesDueAt(want);
    while (this.wavesStarted < due - 1 && this.stageOne()) {
      const lw = this.live.pop();
      if (lw) abandoned.add(lw.wave);
    }

    // ...and then un-say what staging said about those waves. A wave that
    // never spawned a body reads as cleared — nothing down, nothing to put
    // down — and would pay out its share of the mission's XP.
    for (const w of abandoned) this.waveEntered[w] = false;

    // THE CLOCK ITSELF, last: everything above is about what the jump
    // leaves behind, and this line IS the jump. Every other schedule in the
    // run reads `time` and therefore moves with it.
    this.time = want;
  }

  /**
   * Which entry to send next out of ONE live wave: whichever is furthest
   * from finishing, by fraction of its own total. That intermingles a mixed
   * wave from its first unit and lands every entry's last unit together,
   * instead of emptying one pile before starting the next. Entries in
   * `skip` (their layer's doors were too crowded this frame) don't compete.
   *
   * It is asked PER WAVE rather than over the whole field, because several
   * waves can be releasing at once now (`live`) and each one is entitled to
   * arrive looking like the wave it was authored as — a shared pick would
   * blend two waves' mixtures into one soup.
   */
  private nextWaveEntry(
    entries: readonly { kind: number; left: number; total: number }[],
    skip: ReadonlySet<unknown>,
  ): { kind: number; left: number; total: number } | null {
    let best = null;
    let bestFrac = 0;
    for (const e of entries) {
      if (e.left <= 0 || skip.has(e)) continue;
      const frac = e.left / e.total;
      if (frac > bestFrac) {
        bestFrac = frac;
        best = e;
      }
    }
    return best;
  }

  /**
   * Run the level script: stage whatever the CLOCK owes (stageDue), then
   * drain every wave already walking on, each at ITS OWN rate — the wave's
   * size over the fixed WAVE_RELEASE_SECONDS, so every wave takes the same
   * time to walk on whatever its size.
   *
   * THE TWO HALVES ARE INDEPENDENT NOW, and that is the point. Staging is a
   * question about `time`; draining is a question about the doors. A wave
   * that cannot get through its drop zones keeps releasing while the next
   * one lands on schedule behind it, so congestion costs a THICKER FIELD
   * and never a longer run.
   *
   * A failed spawn (the drop zone is too crowded) leaves the unit in its
   * wave and keeps its drain credit for a later frame, so a packed field
   * slows a wave rather than swallowing one. That is what makes the rate
   * safe to scale with size: a wave big enough to outrun the pads simply
   * queues behind them, and the field fills as fast as there is room.
   *
   * OLDEST WAVE FIRST, so a backlog clears the doors ahead of a fresh wave
   * and the field cannot serve the script out of order.
   */
  private runScript(dt: number): void {
    this.stageDue();
    if (this.live.length === 0) return;
    let done = 0;
    for (const lw of this.live) {
      let left = 0;
      for (const e of lw.entries) left += e.left;
      if (left > 0) {
        // the credit is capped at a second's worth of release — but never
        // under ONE body: a wave smaller than WAVE_RELEASE_SECONDS bodies
        // has a rate under 1/s, and a cap at that rate would never let the
        // credit reach the whole unit the loop below spends (a squad of
        // three at Incursion sat in the door forever)
        lw.acc = Math.min(lw.acc + lw.rate * dt, Math.max(1, lw.rate));
        // one layer's crowded pads must not stall the rest of the wave — a
        // failed entry sits out the rest of this frame while the remaining
        // entries keep draining
        const blocked = new Set<unknown>();
        while (left > 0 && lw.acc >= 1) {
          const e = this.nextWaveEntry(lw.entries, blocked);
          if (!e) break;
          if (!this.spawnUnit(UNIT_KINDS[e.kind], undefined, lw.wave)) {
            blocked.add(e);
            continue;
          }
          e.left--;
          lw.acc--;
          left--;
        }
      }
      // THROUGH THE DOOR: from here the wave is cleared the moment its last
      // body drops (wavesCleared). A wave leaves `live` only when every body
      // it was authored with is actually on the field, which is what stops
      // a congested wave being paid for early
      if (left === 0) {
        this.waveEntered[lw.wave] = true;
        done++;
      }
    }
    if (done > 0) this.live = this.live.filter((lw) => !this.waveEntered[lw.wave]);
  }

  // ---------- the crossers ----------

  /**
   * THE MISSION'S SECOND CLOCK (levels.ts InterceptMission): one launch
   * every `every` seconds until the pattern is spent, and then the spare
   * if the run has earned one.
   *
   * IT IS NOT THE WAVE SCRIPT AND IT MUST NOT BE. The waves are a tide
   * that answers the core; a launch is an appointment somewhere else on
   * the map, and putting it on the wave cursor would tie it to whatever
   * the script happens to be doing at the time — a mission whose fifth
   * Borer arrives late because a big wave is congesting a drop zone.
   * This one runs off the run's own clock and nothing else.
   *
   * THE SPARE DOES NOT HAVE A DEADLINE, and that is the one thing about
   * this loop that is not obvious. It cannot be "one `every` after the
   * pattern, if a leak has happened by then": the last launch of the
   * pattern is still walking at that point, and a Borer takes longer to
   * cross than the gap between launches — so the leak that earns the
   * spare routinely lands AFTER the moment a timed spare would have been
   * decided. A run that let its last one through would then be six kills
   * out of seven with nothing left to send and no way to lose either,
   * which is a run that never ends. So once the pattern is spent this
   * waits, asking every tick, and sends the spare the instant a leak is
   * on the books.
   */
  private runCrossers(): void {
    const m = this.level.mission;
    if (m.kind !== "intercept" || this.crossDone) return;
    // THE PATTERN, ON ABSOLUTE MOMENTS. Launch k is due at `first + k *
    // every` seconds of run time and at no other moment — not "one `every`
    // after the last one went", which is what it used to be.
    //
    // THE LOOP IS WHAT MAKES A SKIP WORK. A countdown has to be ticked to
    // be moved, so the sandbox's jump (skipToTime) left the mission sitting
    // wherever the clock had been: minute fifteen on the panel, and the
    // Borers still four minutes out. Read off `time`, every launch the jump
    // passed over is simply due at once — and the mission arrives where the
    // player asked to be.
    while (this.crossLaunched < m.pattern.length &&
           this.time >= m.first + this.crossLaunched * m.every) {
      // BOTH ROADS OF ONE LAUNCH GET THE SAME RAMP (levels.ts wormRamp):
      // the index is the launch's, not the worm's, so the pair sent in
      // "both" are twins. A player who found one of them softer than the
      // other would be reading a die roll, not a schedule
      for (const r of m.pattern[this.crossLaunched]) this.launchCrosser(r, this.crossLaunched);
      this.crossLaunched++;
      // ...and whatever the author hung on THIS train wave comes up with
      // it. The wave is 1-based because that is how an author counts
      // trains; a jump (skipToTime) walks this loop, so every rise the
      // jump passed over happens at once, like every launch it passed over
      this.raiseMarkTowers(this.crossLaunched);
    }
    if (this.crossLaunched < m.pattern.length) return;
    // ...and then the spare, owed to any run that has let one through.
    //
    // THE SPARE HAS NO MOMENT, and that is the one thing here that is not
    // on the clock. It cannot be "one `every` after the pattern, if a leak
    // has happened by then": the last launch of the pattern is still
    // walking at that point, and a Borer takes longer to cross than the gap
    // between launches — so the leak that earns the spare routinely lands
    // AFTER the moment a timed spare would have been decided. A run that
    // let its last one through would then be six kills out of seven with
    // nothing left to send and no way to lose either, which is a run that
    // never ends. So this waits, asking every tick, and sends the spare the
    // instant a leak is on the books.
    if (this.crossLeaked > 0) {
      // ...and the spare is one rung PAST the pattern's last (wormRamp),
      // which falls out of the index rather than being a number of its own
      for (const r of m.spare) this.launchCrosser(r, this.crossLaunched);
      // THE SPARE IS A TRAIN WAVE LIKE ANY OTHER as far as the towers are
      // concerned (missionMarks.ts): it is the wave after the pattern's
      // last, so a spot authored "2-7" covers it without naming it.
      // ONLY IF ONE WAS ACTUALLY SENT — a mission with an empty spare list
      // reaches this line too, and counting a train that never left would
      // burn a wave number and skip whatever was authored on it
      if (m.spare.length > 0) {
        this.crossLaunched++;
        this.raiseMarkTowers(this.crossLaunched);
      }
      this.crossDone = true;
      return;
    }
    // nothing owed, and nothing still walking that could come to owe it:
    // the pattern was the whole mission and the board took all of it
    if (this.crossersLive() === 0) this.crossDone = true;
  }

  /**
   * THE SIEGE'S SCHEDULE (levels.ts RazeMission): section `n` rises at
   * `first + n * every` and every one of them rises, whether or not the
   * board has finished the last.
   *
   * IT IS ABSOLUTE MOMENTS, like the two road missions' launches and for
   * the same reason: nothing here is a timer counting down, so a jump
   * (skipToTime) cannot leave the schedule out of step with the clock, and
   * a player can read the next rise off run time rather than off a hidden
   * countdown.
   *
   * AND IT DOES NOT WAIT. The obvious other rule — "the next section rises
   * when the last one falls" — reads well and makes the mission strictly
   * easier the worse you are at it, which is the wrong direction for every
   * clock in this game. Rising on the clock means falling behind COSTS:
   * the fourth section arriving over a third that is still firing is six
   * emplacements on the core at once, and that is the shape the mission
   * wants — a board that keeps up fights one at a time, and a board that
   * does not fights all of it.
   */
  private runSections(): void {
    const m = this.level.mission;
    if (m.kind !== "raze") return;
    while (
      this.razeRisen < m.sections.length &&
      this.time >= m.first + (razeWave(m.sections[this.razeRisen], this.razeRisen) - 1) * m.every
    ) {
      const sec = m.sections[this.razeRisen];
      // THE MAP'S OWN GUNS WHERE IT HAS THEM: every emplacement placed for
      // this rising goes up on its own cell. What holds the ground round
      // them is not this mission's (runGarrisons). A map with no marks
      // falls back to the mission's sections, which ring a post instead
      if (this.siege) {
        const wave = razeWave(sec, this.razeRisen);
        for (const g of this.siege.spots) if (g.wave === wave) this.raiseGun(g.x, g.y);
      } else {
        this.raiseSection(sec);
      }
      this.razeRisen++;
    }
  }

  /**
   * ONE SECTION UP: the emplacements rung round the post, the garrison
   * scattered inside it (levels.ts RazeSection, missions.ts PostSpec).
   *
   * THE EMPLACEMENTS ARE ON A RING AND THE GUARDS ARE NOT. A railgun is
   * the thing the player has to reach, so where each one stands is the
   * mission's geometry and has to be legible: one in the middle when there
   * is one, and otherwise evenly round a circle at half the post's radius,
   * which reads as a battery from any direction rather than as a heap. The
   * guards are scattered because a garrison in formation reads as a wave
   * that has stopped, and because they are going to move anyway.
   *
   * IT NEVER FAILS TO PLACE. `clearNear` walks out from the wanted spot
   * for open ground and the spawn is `exact`, so a section rung over a
   * rock does not quietly come up short — a mission asking for ten
   * railguns and standing up nine would be a run that can never be won,
   * reported nowhere.
   */
  /**
   * THE TOWERS DUE ON THIS TRAIN WAVE (levels.ts pylonsDue), ROLLED into
   * the spots an author placed (missionMarks.ts). Bolted to the ground
   * like an emplacement is (plantUnit) and pointing at the core, which is
   * the only heading a body that never turns can be given.
   *
   * FREE GROUND FIRST, and only free ground: a spot still holding a tower
   * is out of the draw, so the board's reward for killing one is that the
   * ground it held can come up again. A hand with more towers in it than
   * there are free spots simply places what fits.
   *
   * IT DOES NOT clearNear. A raze section is rung round a post by the sim
   * and may land its geometry on a boulder, so it walks for open ground; a
   * buff tower was put on a cell by a person looking at the map, and moving
   * it a couple of tiles "for them" would mean the thing they placed and
   * the thing that rose are in different places. A tower placed in rock is
   * an authoring mistake and the editor is where it is caught.
   */
  private raiseMarkTowers(wave: number): void {
    const due = pylonsDue(wave);
    if (due.length === 0) return;
    const free = this.towerSpots.filter((t) => !this.towerStanding(t.x, t.y));
    for (let k = free.length - 1; k > 0; k--) {
      const j = (Math.random() * (k + 1)) | 0;
      [free[k], free[j]] = [free[j], free[k]];
    }
    for (const kind of due) {
      const t = free.pop();
      if (!t) return;
      if (!this.spawnUnit(kind, { x: t.x, y: t.y, exact: true }, 0)) continue;
      const i = this.n - 1;
      this.plantUnit(i);
      // ...AND IT IS MADE OF THE WAVE IT ROSE ON (levels.ts pylonRamp), so
      // every tower up on one wave is the same tower and the next wave's
      // are tougher. Applied here, over whatever the level curve and the
      // tier's objective share already made it, exactly as the train's own
      // launch ramp rides on top of its pool (launchCrosser)
      const ramp = pylonRamp(wave);
      this.uhp[i] *= ramp;
      this.uhpmax[i] *= ramp;
      const a = Math.atan2(this.core.y - t.y, this.core.x - t.x);
      this.urot[i] = a;
      this.ubrot[i] = a;
      this.uheldRot[i] = a;
    }
  }

  /**
   * IS ONE OF THIS SPOT'S TOWERS STILL UP? A planted body never moves, so
   * the question is only whether a living Pylon is standing on that point.
   *
   * It walks the board, and that is fine: it is asked once per spot per
   * train wave — a couple of dozen times in a whole run — and the
   * alternative is a unit id to keep in step across a reap that swaps
   * slots (removeUnit), which is a second thing to get wrong.
   */
  private towerStanding(x: number, y: number): boolean {
    for (let i = 0; i < this.n; i++) {
      if (this.ukind[i] !== UNIT_ID.goad && this.ukind[i] !== UNIT_ID.bastion) continue;
      if (this.uhp[i] <= 0) continue;
      if (Math.abs(this.upx[i] - x) < CELL && Math.abs(this.upy[i] - y) < CELL) return true;
    }
    return false;
  }

  /**
   * WHAT THE STANDING PYLONS ARE WORTH RIGHT NOW (levels.ts GOAD_SPEED_MUL,
   * BASTION_CUT) — read off the alive census rather than stored, so a tower
   * the board takes down stops counting the same tick and there is no
   * clock to expire and nothing to get out of step.
   *
   * THEY STACK BY MULTIPLYING, which is what keeps two of them from being
   * an instant loss: two Bastions at a quarter off each leave 56% of the
   * damage getting through rather than half, and ten of them still never
   * reach zero. An author who rings a road with towers gets a hard mission,
   * not an unkillable one.
   */
  private get goadMul(): number {
    const n = this.aliveByKind[UNIT_ID.goad];
    return n > 0 ? GOAD_SPEED_MUL ** n : 1;
  }
  private get bastionCut(): number {
    const n = this.aliveByKind[UNIT_ID.bastion];
    return n > 0 ? (1 - BASTION_CUT) ** n : 1;
  }

  /**
   * ONE EMPLACEMENT UP, where it was put. `exact` means exact: a gun an
   * author placed is not walked off its cell (raiseMarkTowers says why),
   * and a gun the mission rang round a post is walked to open ground by
   * the caller before it gets here.
   */
  private raiseGun(x: number, y: number): void {
    if (!this.spawnUnit("railgun", { x, y, exact: true }, 0)) return;
    const i = this.n - 1;
    this.plantUnit(i);
    // it is BUILT POINTING AT THE BASE. A planted body never turns
    // (updateUnits leaves its facing alone, since it has no drive to aim
    // off), so the heading it rises on is the heading it keeps — and the
    // only heading a railgun ever wants is the one its beam goes down.
    const a = Math.atan2(this.core.y - y, this.core.x - x);
    this.urot[i] = a;
    this.ubrot[i] = a;
    this.uheldRot[i] = a;
  }

  /**
   * EVERY GARRISON DUE ON THIS WAVE, MANNED (missions.ts garrisonsFor).
   *
   * A GARRISON WITH ITS BODIES STILL STANDING DOES NOTHING — not a second
   * force stacked on the first, and not a top-up of the one holding. The
   * board's reward for clearing a garrison is the waves before the next,
   * and refilling it would take that away without showing the player why.
   * It is the buff towers' rule (raiseMarkTowers) and it is the same rule
   * because it answers the same question.
   */
  private manGarrisons(wave: number): void {
    for (const g of this.garrisons) {
      if (!g.waves.includes(wave)) continue;
      if (this.garrisonHeld(g.post)) continue;
      this.raiseGarrison(g.post, g.guards);
    }
  }

  /** is anything still holding this ground? — a live body leashed to it */
  private garrisonHeld(post: Post): boolean {
    for (let i = 0; i < this.n; i++) {
      if (this.ugar[i] !== 1 || this.uhp[i] <= 0) continue;
      if (this.ugarx[i] === post.x && this.ugary[i] === post.y) return true;
    }
    return false;
  }

  /** the garrison of one region, scattered inside it and leashed to it */
  private raiseGarrison(post: Post, guards: Partial<Record<UnitKind, number>>): void {
    for (const [kind, n] of Object.entries(guards) as [UnitKind, number][]) {
      for (let g = 0; g < Math.max(0, Math.floor(n)); g++) {
        // anywhere inside the post, biased outward: sqrt of a uniform roll
        // spreads them evenly over the AREA rather than piling them at the
        // middle, which is where the railguns already are
        const a = Math.random() * Math.PI * 2;
        const d = Math.sqrt(Math.random()) * post.r * 0.85;
        const spot = this.clearNear(post.x + Math.cos(a) * d, post.y + Math.sin(a) * d, HB_OUTER[UNIT_ID[kind]]);
        if (!this.spawnUnit(kind, { x: spot.x, y: spot.y, exact: true }, 0)) return;
        this.garrisonUnit(this.n - 1, post.x, post.y, post.r);
      }
    }
  }

  private raiseSection(sec: RazeSection): void {
    const post = this.posts[sec.post];
    if (!post) return;
    const guns = Math.max(0, Math.floor(sec.guns));
    const ring = post.r * 0.5;
    for (let g = 0; g < guns; g++) {
      // one in the middle; two or more evenly round the ring, opened at a
      // quarter turn so a pair stands across the player's approach rather
      // than one behind the other
      const ang = (g / guns) * Math.PI * 2 + Math.PI / 4;
      const wantX = guns === 1 ? post.x : post.x + Math.cos(ang) * ring;
      const wantY = guns === 1 ? post.y : post.y + Math.sin(ang) * ring;
      const spot = this.clearNear(wantX, wantY, HB_OUTER[UNIT_ID.railgun]);
      this.raiseGun(spot.x, spot.y);
    }
    for (const [kind, n] of Object.entries(sec.guards) as [UnitKind, number][]) {
      for (let g = 0; g < Math.max(0, Math.floor(n)); g++) {
        // anywhere inside the post, biased outward: sqrt of a uniform roll
        // spreads them evenly over the AREA rather than piling them at the
        // middle, which is where the railguns already are
        const a = Math.random() * Math.PI * 2;
        const d = Math.sqrt(Math.random()) * post.r * 0.85;
        const spot = this.clearNear(post.x + Math.cos(a) * d, post.y + Math.sin(a) * d, HB_OUTER[UNIT_ID[kind]]);
        if (!this.spawnUnit(kind, { x: spot.x, y: spot.y, exact: true }, 0)) return;
        this.garrisonUnit(this.n - 1, post.x, post.y, post.r);
      }
    }
  }

  /**
   * THE NEAREST OPEN SPOT TO A POINT, for a body of radius `r` — a spiral
   * of rings out to a few tiles, taking the first that is not rock.
   *
   * It is the one thing standing between an authored post and the terrain
   * it was authored over: a mission names a place in cells and the ground
   * there may have a boulder on it, and a body dropped inside rock is a
   * body nothing can see to shoot (canSee). The walk is small and it runs
   * a couple of dozen times a run, at the moment a section rises.
   */
  private clearNear(x: number, y: number, r: number): { x: number; y: number } {
    const field = this.field;
    const fit = (px: number, py: number): boolean =>
      px >= r && py >= r && px <= W - r && py <= H - r && !field.hitsWall(px, py, WALL_R);
    if (fit(x, y)) return { x, y };
    for (let step = 1; step <= 10; step++) {
      const rad = step * CELL * 1.5;
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2;
        const px = x + Math.cos(a) * rad, py = y + Math.sin(a) * rad;
        if (fit(px, py)) return { x: px, y: py };
      }
    }
    return { x: clamp(x, r, W - r), y: clamp(y, r, H - r) };
  }

  /**
   * POST A BODY TO A CIRCLE (see ugar): it holds this ground, fights
   * whatever the player builds inside it, and never leaves.
   *
   * THIS IS THE GENERAL MECHANISM AND THE SIEGE IS ITS FIRST CUSTOMER.
   * Anything a mission wants standing somewhere — a camp, a nest, a picket
   * on a road, an escort of the swarm's own — is this call and a roster,
   * with no new unit kinds and nothing in UNIT_STATS.
   */
  garrisonUnit(i: number, x: number, y: number, r: number): void {
    this.ugar[i] = 1;
    this.ugarx[i] = x;
    this.ugary[i] = y;
    this.ugarr[i] = r;
    // it drops whatever the spawn's target clock happened to leave on it:
    // a pick made before the leash was written is a pick from the whole
    // board, and the clip only runs at the next re-pick
    this.utgt[i] = null;
  }

  /** BOLT A BODY DOWN (see ugar): no heading, no shove, no knockback. What
   *  an emplacement is, and the only way to put something on the board that
   *  is exactly where the mission said it would be for the whole run */
  plantUnit(i: number): void {
    this.ugar[i] = 2;
    this.ufix[i] = 1;
    this.ugarx[i] = this.upx[i];
    this.ugary[i] = this.upy[i];
    this.ugarr[i] = 0;
  }

  /**
   * ONE BORER ONTO ONE ROAD: the whole chain laid nose to tail at the
   * road's entry, head furthest along (levels.ts WORM_CHAIN).
   *
   * THE HEAD IS LAID A WHOLE TRAIN-LENGTH PAST THE ENTRY, which is the
   * one thing here a road author has to know: the run-up leg (missions.ts)
   * must be longer than levels.ts WORM_LENGTH, or the head appears in
   * open ground with the map already behind it instead of crawling in off
   * the rim. The chain got twenty pieces long and both of Coldline's
   * roads grew their first leg to match.
   *
   * WAVE ZERO, and that is the load-bearing line. A crosser is not part
   * of any wave — it was not staged by loadStep, it pays no XP, and a
   * wave must not be held open waiting for a train to die three minutes
   * later. `wavesCleared` counts from wave 1, so a body booked under 0 is
   * invisible to every ledger that pays the save (economy.ts MISSION_XP).
   * What it IS worth is scrap, like every other kill, because that is a
   * fact about a body dying rather than about a wave.
   */
  private launchCrosser(roadIdx: number, launch: number): void {
    const road = this.roads[roadIdx];
    if (!road) return;
    const id = this.crossers.length;
    const worm = { road: roadIdx, alive: 0, leaked: false, hp: 0, hpMax: 0, s: WORM_LENGTH, spd: 0 };
    this.crossers.push(worm);
    const ramp = wormRamp(launch);
    const slots: number[] = [];
    for (let k = 0; k < WORM_CHAIN.length; k++) {
      const s = WORM_LENGTH - k * WORM_SPACING;
      roadAt(road, s, this.roadTmp);
      if (!this.spawnUnit(WORM_CHAIN[k], { x: this.roadTmp.x, y: this.roadTmp.y, exact: true }, 0)) break;
      const i = this.n - 1;
      slots.push(i);
      this.ucross[i] = id;
      // the piece's fixed place in the chain, not its arc: the worm's own
      // clock carries the arc (see ucross)
      this.ucrossS[i] = k * WORM_SPACING;
      // ...and the train's pace is the head's, read off the body the level
      // curve and the Speedy roll have already finished with
      if (k === 0) worm.spd = this.uspd[i];
      this.ufix[i] = 1;
      // the heading is the road's, from the first frame: a piece that
      // spawned facing +x and swung round over the next second would
      // enter the map sideways
      const ang = Math.atan2(this.roadTmp.dy, this.roadTmp.dx);
      this.urot[i] = ang;
      this.ubrot[i] = ang;
      this.uaimx[i] = this.roadTmp.dx;
      this.uaimy[i] = this.roadTmp.dy;
      // THE SWARM'S ROLLS ARE NOT THE CROSSER'S. Hungry and Mech Virus are
      // rules about the crowd walking at the core (mutation.ts); a machine
      // on a road eats nothing and infects nothing, and a Borer that swelled
      // a meal at a time would stop matching the hitbox the mission is
      // asking the player to hit
      this.uhungry[i] = 0;
      this.uvirus[i] = 0;
      worm.alive++;
    }
    // THE POOL, ONCE EVERY PIECE IS DOWN: what the twenty spawned with,
    // added up, times this launch's ramp.
    //
    // It is SUMMED FROM THE BODIES rather than computed from the roster,
    // and that is what keeps two other systems working without knowing
    // this one exists. The level curve scales a body's health as it
    // spawns (spawnUnit, baseHpOf), so reading the pieces back means a
    // Borer on a high rung is exactly as much tougher as every other body
    // on that rung. The ramp then goes on the total, which is the same
    // number it used to go on per piece.
    //
    // ...and then onto EVERY PIECE, both bars. uhp and uhpmax are the
    // train's from here on, so every read of the fraction — the bar, the
    // damage tint, the smoke, the execute line — is a fact about the
    // WORM, and all twenty cars say the same thing at the same time.
    for (const i of slots) worm.hpMax += this.uhp[i];
    worm.hpMax *= ramp;
    worm.hp = worm.hpMax;
    for (const i of slots) {
      this.uhp[i] = worm.hp;
      this.uhpmax[i] = worm.hpMax;
    }
  }

  /**
   * A HIT ON ANY CAR, TAKEN OFF THE TRAIN. The one place a crosser's
   * health moves, and the reason damageUnit branches at all.
   *
   * IT DOES NOT TOUCH `uhp` AND IT DOES NOT KILL. Both are deliberate.
   * Mirroring the pool onto twenty slots here would be a scan of the
   * field on every point of damage a busy board deals, and killing from
   * inside a damage callback would reorder the unit slots under whichever
   * loop is spending a blast — which is exactly why every other reaper in
   * this file collects its dead and reaps after. updateCrosser does both
   * jobs a tick later, on a pass that is already walking these bodies:
   * the bars catch up and the train dies whole.
   */
  private drainCrosser(id: number, amount: number): void {
    const worm = this.crossers[id];
    if (!worm || worm.hp <= 0) return;
    // ...less whatever the standing Bastions are taking off it. Here, at
    // the ONE place every hit on a train lands, so a shot, a splash, a rot
    // tick and an execute all pay it once and none of them can forget to
    worm.hp -= amount * this.bastionCut;
    // TERMINAL PROTOCOL (relics.ts) reads the pool like every other
    // execute, which on a shared pool means it takes the whole train. That
    // is the honest reading of the rule — the body it is knocking over is
    // the worm — and it is the one relic that can end a Borer early
    if (this.executeAt > 0 && worm.hp > 0 && worm.hp <= worm.hpMax * this.executeAt)
      worm.hp = 0;
  }

  /**
   * HOW MANY CROSSERS ARE ON THE BOARD — worms, not pieces. A train with
   * one car left is still one thing to shoot, and a panel counting bodies
   * would read "14 on the line" for two half-dead worms.
   */
  /** HOW MANY EMPLACEMENTS ARE FIRING ON THE CORE right now — the siege's
   *  second number (levels.ts missionLines). It is the alive census and
   *  not "risen minus killed", because the census is already kept for
   *  every kind on the board and cannot drift from what is standing */
  razeUp(): number {
    return this.aliveByKind[UNIT_ID.railgun];
  }

  crossersLive(): number {
    let n = 0;
    for (const w of this.crossers) if (w.alive > 0) n++;
    return n;
  }

  /** scratch for the road sampler — one call site, never nested */
  private readonly roadTmp = { x: 0, y: 0, dx: 0, dy: 0 };

  /**
   * ONE TICK OF A BORER'S PIECE, and it is KINEMATIC: the road says where
   * the body is, not a velocity integrated against a wall.
   *
   * NOTHING ELSE IN THE FILE MOVES LIKE THIS, and the reason is that the
   * mission is a promise about geometry. A crosser that read the flow
   * field would turn for the core; one that took the crowd shove would be
   * pushed off its line by the wave it walked through; one that collided
   * with rock could be wedged in a corner by a knockback and sit there
   * for the rest of the run, which on a mission whose whole question is
   * "did it get across" is not a bug that can be shrugged at. So the
   * position is read off the road at an arc length this advances, and the
   * heading is the road's own tangent.
   *
   * WHAT STILL REACHES IT is everything that is done TO a body rather than
   * by it — damage lands, statuses land — BUT NOTHING THAT MOVES THE
   * CLOCK. A Borer is `unslowable` (levels.ts) and it is un-hastenable
   * with it: the advance below reads neither the wet slow nor the
   * dartback3's pace stamp, and it reads the WORM's arc rather than this
   * piece's, so the train is one body at one speed however many of its
   * cars are standing in an aura. A douser on the line still soaks it,
   * still puts a fire on it out, still hands the electric ammunition the
   * soaked bonus; it simply cannot move the arrival. That is the
   * mission's promise being kept — the road is drawn from wave one and so
   * is the clock — and it means the only way to stop a train is to kill it.
   *
   * Returns true when the piece has reached the exit, which is a LEAK: the
   * caller lifts it off the board (see updateUnits).
   */
  private updateCrosser(i: number): CrosserStep {
    const worm = this.crossers[this.ucross[i]];
    const road = this.roads[worm.road];
    // THE TRAIN'S HEALTH ONTO THIS CAR, every tick. The pool is the truth
    // (drainCrosser) and these two are the copy every other reader sees —
    // the bar over the body, the damage tint, the smoke. Copied on the
    // pass that is already here rather than at the hit, so a board putting
    // a hundred rounds a second into a Borer pays twenty writes a tick
    // instead of twenty per round.
    this.uhp[i] = worm.hp;
    this.uhpmax[i] = worm.hpMax;
    // ...AND THE TRAIN DIES WHOLE. The pool emptied, so every piece goes
    // this tick, together, wherever on the road it happens to be: the
    // caller reaps them after the loop for the reason it reaps the
    // leakers there (removeUnit moves slots under a descending walk). A
    // car that popped on its own would be the thing the shared pool
    // exists to stop.
    if (worm.hp <= 0) return CROSS_DEAD;
    // NO ARRIVAL CLOCK IS READ HERE, because a crosser never has one:
    // launchCrosser spawns through the brood door, which is the door that
    // hands out no invincibility and no unmoving half-second (spawnUnit).
    // A Borer is walking from its first frame — the road is where it came
    // from, and a train that stood still for half a second on the rim
    // would be standing still in the one place nothing can reach it
    const spd = worm.spd * this.goadMul;
    const s = worm.s - this.ucrossS[i];
    if (s >= road.length) return CROSS_LEAKED;
    roadAt(road, s, this.roadTmp);
    this.upx[i] = this.roadTmp.x;
    this.upy[i] = this.roadTmp.y;
    // the velocity is reported rather than integrated — the weapons pass
    // and the renderer's walk cycle both read it, and a body whose stated
    // speed disagreed with the ground going past under it would lead
    // every turret's aim wrong
    this.uvx[i] = this.roadTmp.dx * spd;
    this.uvy[i] = this.roadTmp.dy * spd;
    const ang = Math.atan2(this.roadTmp.dy, this.roadTmp.dx);
    this.urot[i] = ang;
    this.ubrot[i] = ang;
    this.uaimx[i] = this.uvx[i];
    this.uaimy[i] = this.uvy[i];
    this.uwalk[i] = s;
    return CROSS_WALKING;
  }

  /**
   * A PIECE HAS REACHED THE FAR SIDE. The whole worm is booked as leaked
   * on the FIRST piece through, never once per piece: a train that got
   * half of itself across got across, and counting nine leaks for one
   * would end the run on the first one.
   *
   * Everything still behind it keeps walking and can still be shot. It
   * cannot save the worm — the leak is already booked — but a run does not
   * get to stop paying attention to a thing on the board because the
   * ledger has already written it off.
   */
  private leakCrosser(i: number): void {
    const worm = this.crossers[this.ucross[i]];
    if (worm && !worm.leaked) {
      worm.leaked = true;
      this.crossLeaked++;
    }
    this.removeUnit(i);
  }

  // ---------- the convoys ----------

  /**
   * THE ESCORT'S CLOCK (levels.ts EscortMission), and it is the crossers'
   * clock in a mirror: cart `k` rolls out at `first + k * every` seconds
   * of run time and at no other moment.
   *
   * ABSOLUTE MOMENTS FOR THE SAME REASON runCrossers uses them — a
   * countdown has to be ticked to be moved, so a sandbox jump
   * (skipToTime) would leave the mission sitting wherever the clock had
   * been. Read off `time`, every departure the jump passed over is simply
   * due at once.
   */
  private runConvoys(): void {
    const m = this.level.mission;
    if (m.kind !== "escort" || this.convoyEnd) return;
    while (
      this.convoyOut < m.pattern.length &&
      this.time >= m.first + this.convoyOut * m.every
    ) {
      this.launchConvoy(m.pattern[this.convoyOut]);
      this.convoyOut++;
    }
    if (this.convoyOut >= m.pattern.length) this.convoyEnd = true;
  }

  /**
   * ONE CART ONTO ITS ROAD, standing at the road's first point — which on
   * Thornway is the ground just outside the core's own footprint, so it
   * rolls out of the base rather than appearing on it.
   *
   * THE STRUCTURE IS BUILT HERE AND NOWHERE ELSE (levels.ts CONVOY_HP for
   * why it is a structure at all). Its `spec` is a copy of a real turret's
   * with the cart's own name, footprint and plating written over it: the
   * fields under that are a gun's — range, reload, ammunition — and NOT
   * ONE OF THEM IS EVER READ, because reading them is what `fireTowers`
   * does and `fireTowers` walks `towers`, which this is not in. Spreading
   * a real one rather than inventing thirty numbers is the honest way to
   * say "everything about this that is a turret is the default".
   */
  private launchConvoy(roadIdx: number): void {
    const road = this.roads[roadIdx];
    if (!road) return;
    roadAt(road, 0, this.roadTmp);
    const hp = CONVOY_HP;
    const struct = this.newTower(
      // THE CELLS IT STANDS ON ARE A LIE AND HAVE TO BE. `gx`/`gy` are
      // read by everything that asks where a building's footprint is, and
      // this one has no footprint: it claims no ground, nothing writes it
      // into cellTower, and updateConvoy keeps these in step with the
      // cart's centre only so a reader doing the usual arithmetic gets
      // the usual answer rather than a NaN.
      Math.round(this.roadTmp.x / CELL - CONVOY_SIZE / 2),
      Math.round(this.roadTmp.y / CELL - CONVOY_SIZE / 2),
      CONVOY_BASE_KIND,
      CONVOY_SIZE,
      0,
    );
    // ...and then the four numbers that are the CART'S rather than a
    // turret's. Its spec is a copy of the base kind's with its own name,
    // footprint and plating written over it: the fields under those are a
    // GUN's — range, reload, ammunition — and not one of them is ever
    // read, because reading them is what the turret loop does and the
    // turret loop walks `towers`, which this is not in.
    struct.x = this.roadTmp.x;
    struct.y = this.roadTmp.y;
    struct.hp = hp;
    struct.hpMax = hp;
    // ...AND NO STAND-UP. Undying Legion (relics.ts) grants every turret
    // one revive and `newTower` hands it out; damageConvoy never asks, so
    // this is only saying out loud what the code already does — a relic
    // bought to keep the LINE standing does not also make the mission
    // unloseable, and a hauler that got back up would make "it has to
    // arrive" mean something else on one run in fourteen.
    struct.revives = 0;
    struct.revivesMax = 0;
    struct.spec = {
      ...structStats(CONVOY_BASE_KIND),
      name: CONVOY_NAME,
      size: CONVOY_SIZE,
      armor: CONVOY_ARMOR,
      health: hp,
    };
    this.convoys.push({
      struct,
      road: roadIdx,
      s: 0,
      rot: Math.atan2(this.roadTmp.dy, this.roadTmp.dx),
      halt: -1,
      holdT: 0,
      home: false,
      dead: false,
    });
  }

  /**
   * IS THE THING THIS BODY IS SHOOTING AT THE CART? — the one question
   * that makes an escort an escort rather than a second core.
   *
   * NOTHING SEEKS THE CONVOY. The swarm walks at the base and shoots what
   * its guns find on the way, which is exactly how it treats a turret and
   * exactly what the mission wants. What it must never do is CHANGE
   * COURSE for the cart: a bomber that dives at it and a Tusker that
   * charges it are both bodies leaving their route, and a route left is
   * pressure taken off the core and put onto the objective. That turns
   * the hauler into a magnet the whole field drifts toward, which is a
   * different mission and a much worse one — the player would be
   * defending one thing instead of two, and the base would go quiet.
   *
   * So the cart is a TARGET and never a DESTINATION. It is shot by
   * whatever happens to have it in reach, and nothing walks a step it
   * would not have walked anyway.
   */
  private aimIsConvoy(a: Aim | null): boolean {
    if (a === null || this.convoys.length === 0) return false;
    for (const c of this.convoys) if (c.struct === a.s) return true;
    return false;
  }

  /**
   * IS THIS STRUCTURE A CART? — the standing-in for the occupancy grid on
   * the one body that is not in it.
   *
   * Three places ask, and all three are asking the same question in the
   * grid's words: `inReach` before a weapon fires, the homing star before
   * it keeps steering, and the ledger in damageTower. A cart is standing
   * for as long as it is on the road with health in it, which is what
   * `convoyOf` answers.
   */
  private isConvoy(t: Structure): boolean {
    return this.convoys.length > 0 && this.convoyOf(t) !== null;
  }

  /** the cart this structure IS, or null — one linear walk of a list that
   *  is one long, guarded by the caller on `convoys.length` */
  private convoyOf(t: Structure): (typeof this.convoys)[number] | null {
    for (const c of this.convoys) if (c.struct === t) return c;
    return null;
  }

  /**
   * ONE TICK OF EVERY CART: the statuses it can carry, then the drive.
   *
   * IT IS KINEMATIC LIKE A CROSSER (updateCrosser) and for the same
   * reason: the mission is a promise about a line on the map, and a cart
   * that could be shoved, wedged or routed would be a mission about
   * physics. What is different is that it STOPS — at each of the
   * mission's halts it stands for `haltSeconds` and mends `mend` a
   * second, which is the only healing on the player's side of this board
   * and the reason a bad leg is not the end of the run.
   *
   * THE TWO STATUSES A CART CAN CARRY are the rot and the fire, and they
   * are ticked here rather than in fireTowers because fireTowers is the
   * GUN loop — it walks `towers`, works a reload and looks for something
   * to shoot, and a cart has none of those. Everything else that pass
   * does is turret-only by nature: a cart has no gun to short out, no
   * ammunition to jam, and no plating that mends itself.
   */
  private updateConvoys(dt: number): void {
    if (this.convoys.length === 0) return;
    const m = this.level.mission;
    if (m.kind !== "escort") return;
    for (const c of this.convoys) {
      if (c.dead || c.home) continue;
      const t = c.struct;
      // THE ROT (Tower.poison), on the same arithmetic fireTowers runs:
      // the stack bleeds back toward the heaviest single source and the
      // damage is raw, past plating, because a status plating could shave
      // would be a second copy of what the ground mechs already do
      if (t.poisonT > 0) {
        t.poisonT -= dt;
        if (t.poisonT <= 0) {
          t.poisonT = 0;
          t.poison = 0;
          t.poisonUnit = 0;
        } else {
          if (t.poison > t.poisonUnit)
            t.poison = t.poisonUnit + (t.poison - t.poisonUnit) * Math.exp(-POISON_DECAY * dt);
          this.damageConvoy(c, t.poison * dt);
        }
      }
      // ...and the fire, which refreshes rather than stacks (burnTower)
      if (t.burnT > 0) {
        t.burnT -= dt;
        if (t.burnT <= 0) {
          t.burnT = 0;
          t.burnDps = 0;
        } else this.damageConvoy(c, t.burnDps * dt);
      }
      if (c.dead) continue;
      const road = this.roads[c.road];
      if (c.holdT > 0) {
        // STANDING AT A HALT: it mends, and it is the easiest target on
        // the board while it does. The clock runs whatever is happening
        // to it — a cart pinned down does not get to wait longer
        c.holdT -= dt;
        if (t.hp < t.hpMax) t.hp = Math.min(t.hpMax, t.hp + m.mend * dt);
        if (c.holdT <= 0) c.holdT = 0;
        continue;
      }
      c.s += CONVOY_SPEED * dt;
      // ...HAS IT REACHED THE NEXT HALT? Asked before the arrival, so a
      // halt authored at 0.99 still happens
      const next = c.halt + 1;
      if (next < m.halts.length && c.s >= m.halts[next] * road.length) {
        c.halt = next;
        c.s = m.halts[next] * road.length;
        c.holdT = m.haltSeconds;
      } else if (c.s >= road.length) {
        // THE POST. The cart is off the board and on the ledger, and the
        // structure goes with it so nothing can shoot a delivery
        c.s = road.length;
        c.home = true;
        this.convoyBest = 1;
        this.convoyDone++;
        this.pushFx(t.x, t.y, 0.6, FxKind.Breach);
        continue;
      }
      if (road.length > 0) this.convoyBest = Math.max(this.convoyBest, c.s / road.length);
      roadAt(road, c.s, this.roadTmp);
      t.x = this.roadTmp.x;
      t.y = this.roadTmp.y;
      c.rot = Math.atan2(this.roadTmp.dy, this.roadTmp.dx);
      t.gx = Math.round(t.x / CELL - CONVOY_SIZE / 2);
      t.gy = Math.round(t.y / CELL - CONVOY_SIZE / 2);
    }
  }

  /**
   * A HIT ON THE CART. The one place a convoy's health moves, and the
   * reason damageTower branches at all: everything under that branch —
   * the revives, the payout, the virus, the conquest, the removal from
   * `towers` — is about a BUILDING, and this is a vehicle with a mission
   * riding on it.
   *
   * `raw` has already been through plating where the caller meant it to
   * (damageTower shaves it; the rot and the fire above do not, which is
   * the same exemption a turret's statuses have).
   */
  private damageConvoy(c: (typeof this.convoys)[number], raw: number): void {
    const t = c.struct;
    if (c.dead || c.home || t.hp <= 0) return;
    t.hp -= raw;
    if (t.hp > 0) return;
    t.hp = 0;
    c.dead = true;
    this.convoyLost++;
    this.pushFx(t.x, t.y, 0.8, FxKind.Breach);
    this.pushFx(t.x, t.y, 0.6, FxKind.Death);
  }

  /**
   * HOW FAR THE CART ON THE ROAD HAS GOT, 0 to 1 — what the objective bar
   * is filled from between deliveries (levels.ts missionProgress).
   *
   * A HALT COUNTS AS THE GROUND IT STANDS ON and not as progress of its
   * own: the bar moves while the cart moves and holds while it waits,
   * which is the truth about the journey and is also the clearest thing a
   * player can be told about why nothing is happening.
   */
  convoyAt(): number {
    for (const c of this.convoys) {
      if (c.dead || c.home) continue;
      const road = this.roads[c.road];
      if (road && road.length > 0) return Math.max(0, Math.min(1, c.s / road.length));
    }
    // ...AND HOW FAR THE LAST ONE GOT, when there is none on the road.
    // A run that lost its cart at the third halt is a run that got sixty
    // per cent of the way there, and the end screen has nothing else to
    // say about it — reading zero off an empty list would tell a player
    // who nearly made it that they never started.
    return this.convoyBest;
  }

  /** the cart on the road, for the HUD and the renderer — null when there
   *  is none (before the first departure, between two, or after a loss) */
  liveConvoy(): { struct: Tower; rot: number; halted: boolean; halts: number; at: number } | null {
    const m = this.level.mission;
    if (m.kind !== "escort") return null;
    for (const c of this.convoys) {
      if (c.dead || c.home) continue;
      return {
        struct: c.struct,
        rot: c.rot,
        halted: c.holdT > 0,
        halts: m.halts.length - 1 - c.halt,
        at: this.convoyAt(),
      };
    }
    return null;
  }

  // ---------- the swarm's weapons ----------

  /**
   * THE NEAREST STRUCTURE WITHIN REACH of a point, by centre — read off
   * cellTower in rings outward, so the first ring that holds anything
   * ends the search. A unit asks this every few tenths of a second
   * (utT), never every tick.
   */
  /** a structure's edge, in cells: the turret's own footprint (Tower.size
   *  — a GIANT's is twice its kind's) or the core's */
  private sizeOf(s: Structure): number {
    return s.size;
  }

  /**
   * IS THERE A HILL IN THE WAY? A supercover walk of the hill mask from one
   * world point to another, cell by cell (Amanatides-Woo), true when the
   * line gets through.
   *
   * NEITHER END CELL IS TESTED, and both exclusions earn their keep. The
   * near one: a body shoved into a peak, or standing on the lip of one, is
   * not blind — it would otherwise be unable to see anything at all,
   * forever. The far one: the target's own cell is the thing being looked
   * AT, and a shot arriving at it has already arrived.
   *
   * Only hills stop sight. Not structures — the swarm shoots the wall in
   * front of it and the gun behind it alike, which is Mindustry's ground
   * AI and the whole reason a wall is worth building. Not forest, not deep
   * water: neither stands above the floor (see airWalkMask, the same mask).
   */
  private hasSight(x0: number, y0: number, x1: number, y1: number): boolean {
    this.rays++;
    let cx = clamp((x0 / CELL) | 0, 0, COLS - 1), cy = clamp((y0 / CELL) | 0, 0, ROWS - 1);
    const ex = clamp((x1 / CELL) | 0, 0, COLS - 1), ey = clamp((y1 / CELL) | 0, 0, ROWS - 1);
    if (cx === ex && cy === ey) return true;
    const dx = x1 - x0, dy = y1 - y0;
    const sx = dx > 0 ? 1 : -1, sy = dy > 0 ? 1 : -1;
    // distance along the ray to the first cell boundary on each axis, and
    // the distance between boundaries after that — both in units of the
    // ray's own length, so the smaller of the two always names the next
    // cell the line enters
    let tx = dx === 0 ? Infinity : ((dx > 0 ? cx + 1 : cx) * CELL - x0) / dx;
    let ty = dy === 0 ? Infinity : ((dy > 0 ? cy + 1 : cy) * CELL - y0) / dy;
    const gx = dx === 0 ? Infinity : Math.abs(CELL / dx);
    const gy = dy === 0 ? Infinity : Math.abs(CELL / dy);
    const hills = this.hills;
    // the walk cannot outlast the board even diagonally corner to corner;
    // the cap is there so a degenerate ray can never spin
    for (let n = COLS + ROWS + 2; n > 0; n--) {
      // one add per CELL the ray walks: a ray's cost is its LENGTH, and a
      // count of rays alone cannot tell a board of short ones from a
      // board of ninety-tile ones
      this.rayCells++;
      if (tx < ty) {
        cx += sx;
        tx += gx;
      } else {
        cy += sy;
        ty += gy;
      }
      if (cx === ex && cy === ey) return true;
      if (cx < 0 || cy < 0 || cx >= COLS || cy >= ROWS) return false;
      if (hills[cy * COLS + cx]) return false;
    }
    return false;
  }

  /**
   * CAN THIS BODY WALK STRAIGHT THERE? The same DDA as hasSight, over
   * WALKABILITY rather than sight, and with one deliberate hole in it:
   * a cell a STRUCTURE stands on does not count as a wall.
   *
   * IT IS THE CHARGE'S SAFETY CATCH (levels.ts UnitStats.charge). Sight is
   * cast over rock alone, because a hill is the only thing that stops a
   * bullet; a Tusker that leaves the flow field to walk at what it can see
   * would happily grind against the near shore of a lake for the rest of
   * the run, with a turret in plain view on the far side. So the charge
   * asks a stricter question than the gun does — is there anything on this
   * line I cannot cross — and falls back to the route when the answer is
   * yes.
   *
   * A structure is the exception because a structure is the POINT: a
   * turret in a patch is reached by walking through its neighbours, which
   * is what a body pressed into a wall does anyway (FlowField.soft).
   */
  private canWalkTo(x0: number, y0: number, x1: number, y1: number, f: FlowField): boolean {
    let cx = clamp((x0 / CELL) | 0, 0, COLS - 1), cy = clamp((y0 / CELL) | 0, 0, ROWS - 1);
    const ex = clamp((x1 / CELL) | 0, 0, COLS - 1), ey = clamp((y1 / CELL) | 0, 0, ROWS - 1);
    if (cx === ex && cy === ey) return true;
    const dx = x1 - x0, dy = y1 - y0;
    const sx = dx > 0 ? 1 : -1, sy = dy > 0 ? 1 : -1;
    let tx = dx === 0 ? Infinity : ((dx > 0 ? cx + 1 : cx) * CELL - x0) / dx;
    let ty = dy === 0 ? Infinity : ((dy > 0 ? cy + 1 : cy) * CELL - y0) / dy;
    const gx = dx === 0 ? Infinity : Math.abs(CELL / dx);
    const gy = dy === 0 ? Infinity : Math.abs(CELL / dy);
    const { walk, soft } = f;
    for (let n = COLS + ROWS + 2; n > 0; n--) {
      if (tx < ty) {
        cx += sx;
        tx += gx;
      } else {
        cy += sy;
        ty += gy;
      }
      if (cx === ex && cy === ey) return true;
      if (cx < 0 || cy < 0 || cx >= COLS || cy >= ROWS) return false;
      const i = cy * COLS + cx;
      if (walk[i] === 1 && soft[i] === 0) return false;
    }
    return false;
  }

  /**
   * CAN THIS BODY SEE THAT BUILDING? The line runs to the nearest point of
   * the structure's FOOTPRINT, not to its middle: a 3x3 core is a wall of a
   * thing, and asking for sight of the one cell at its centre would have a
   * unit standing at its flank unable to shoot the side it is touching.
   *
   * Flyers never ask. They see everything inside their reach — a hill is
   * something they are looking down on.
   */
  private canSee(t: Structure, x: number, y: number): boolean {
    const half = (this.sizeOf(t) * CELL) / 2;
    return this.hasSight(x, y, clamp(x, t.x - half, t.x + half), clamp(y, t.y - half, t.y + half));
  }

  /**
   * THE BOX ONE SIDE'S BUILDINGS STAND IN, in world px and grown by each
   * footprint's own half-width, rebuilt only when a structure appears or
   * leaves (claimGround raises the flag).
   *
   * WHY IT EXISTS. The ring walk below is bounded by the RANGE and not by
   * where anything actually is: its early break needs a candidate to
   * break on, so a gun with nothing in reach walks every square of its
   * circle before it can say "nothing". A wave of a thousand bodies
   * against a line of two dozen buildings in one corner of a 512-cell
   * board is nearly a thousand of those scans a tick spent proving the
   * obvious. The test here is four comparisons and it is EXACT — a
   * structure within `reach` of the point is within the box by
   * construction, so nothing that would have been found is refused.
   */
  private structBox(): { x0: number; y0: number; x1: number; y1: number; n: number } {
    if (this.structBoxDirty) {
      this.structBoxDirty = false;
      const b = this.structBoxCache;
      b.x0 = Infinity;
      b.y0 = Infinity;
      b.x1 = -Infinity;
      b.y1 = -Infinity;
      b.n = 0;
      // ...and the coarse index with it: same flag, same walk, so the two
      // halves of the aim index can never disagree about what is standing
      const blocks = this.structBlocks;
      for (const list of blocks) if (list) list.length = 0;
      this.structMaxHalf = 0;
      const add = (s: Structure): void => {
        const half = (this.sizeOf(s) * CELL) / 2;
        if (s.x - half < b.x0) b.x0 = s.x - half;
        if (s.y - half < b.y0) b.y0 = s.y - half;
        if (s.x + half > b.x1) b.x1 = s.x + half;
        if (s.y + half > b.y1) b.y1 = s.y + half;
        b.n++;
        if (half > this.structMaxHalf) this.structMaxHalf = half;
        const bi =
          clamp((s.y / AIM_BLOCK_PX) | 0, 0, AIM_BROWS - 1) * AIM_BCOLS +
          clamp((s.x / AIM_BLOCK_PX) | 0, 0, AIM_BCOLS - 1);
        const list = blocks[bi] ?? (blocks[bi] = []);
        list.push(s);
      };
      // the core is on the board and in cellTower without being one of the
      // towers (see the reset), and it is a target for as long as it stands
      add(this.core);
      for (const t of this.towers) add(t);
    }
    return this.structBoxCache;
  }

  private nearestStructure(
    x: number,
    y: number,
    reach: number,
    sighted: boolean,
    team: Team = "player",
  ): Structure | null {
    // THE CART IS OFFERED HERE AND ONLY HERE (levels.ts CONVOY_HP), and it
    // has to be offered BEFORE the box. It is not in the building index
    // and claims no cell, because it moves — so `structBox`, which is the
    // rectangle the player's BUILDINGS stand in, does not contain it, and
    // a cart fifty tiles up the road from the nearest turret is outside
    // that box by a mile. Under the early-out this loop simply never ran
    // and the swarm walked past the objective all run without firing a
    // shot at it. A list of one behind a length test, so every other map
    // pays one compare.
    let best: Structure | null = null;
    let bd = Infinity;
    if (this.convoys.length > 0 && team === "player")
      for (const c of this.convoys) {
        if (c.dead || c.home) continue;
        const t = c.struct;
        if (t.hp <= 0) continue;
        const half = (t.size * CELL) / 2;
        const dx = t.x - x, dy = t.y - y;
        const d = Math.sqrt(dx * dx + dy * dy) - half;
        if (d <= reach && d < bd && (!sighted || this.canSee(t, x, y))) {
          bd = d;
          best = t;
        }
      }
    const box = this.structBox();
    if (box.n === 0) return best;
    if (x + reach < box.x0 || x - reach > box.x1 || y + reach < box.y0 || y - reach > box.y1)
      return best;
    const blocks = this.structBlocks;
    const grid = this.cellTower;
    const bx = clamp((x / AIM_BLOCK_PX) | 0, 0, AIM_BCOLS - 1);
    const by = clamp((y / AIM_BLOCK_PX) | 0, 0, AIM_BROWS - 1);
    const maxR = Math.ceil(reach / AIM_BLOCK_PX) + 1;
    const consider = (bi: number): void => {
      const list = blocks[bi];
      if (!list) return;
      // THE SWARM'S SEARCH IS A BROAD PHASE TOO, over the building index
      // rather than the body hash. It is counted on the same terms and
      // into the same number, so a phase that spends its time looking for
      // turrets is not reported as a phase that walked nothing at all —
      // which reads as "each item got dearer" and is the wrong diagnosis
      this.structCands += list.length;
      for (let k = 0; k < list.length; k++) {
        const t = list[k];
        // the index is rebuilt from claimGround and can be a moment stale:
        // a building whose anchor cell no longer points back at it is one
        // that came down, and the cell walk this replaced got that test for
        // free by reading the occupancy grid
        if (grid[t.gy * COLS + t.gx] !== t) continue;
        // only the OTHER side's buildings are targets: a body walks past the
        // swarm's own conquered turret, and that turret never fires on it
        if (this.enemyTowers > 0 && teamOf(t) !== team) continue;
        const half = (this.sizeOf(t) * CELL) / 2;
        const dx = t.x - x, dy = t.y - y;
        const d = Math.sqrt(dx * dx + dy * dy) - half;
        // the cheap tests first: the raycast is only spent on a candidate
        // that would actually be taken
        if (d <= reach && d < bd && (!sighted || this.canSee(t, x, y))) {
          bd = d;
          best = t;
        }
      }
    };
    consider(by * AIM_BCOLS + bx);
    for (let r = 1; r <= maxR; r++) {
      // NOTHING IN THIS RING OR BEYOND can be nearer than the ring's inner
      // edge, less the widest footprint standing: a building is filed by its
      // middle, and its wall reaches a little way back towards us. Before
      // anything is found the same bound is read against the reach, which is
      // what stops a sweep over open ground at the edge of the circle
      // instead of at the edge of the map.
      if ((r - 1) * AIM_BLOCK_PX - this.structMaxHalf > (best ? bd : reach)) break;
      const x0 = bx - r, x1 = bx + r, y0 = by - r, y1 = by + r;
      for (let xx = x0; xx <= x1; xx++) {
        if (xx < 0 || xx >= AIM_BCOLS) continue;
        if (y0 >= 0) consider(y0 * AIM_BCOLS + xx);
        if (y1 < AIM_BROWS) consider(y1 * AIM_BCOLS + xx);
      }
      for (let yy = y0 + 1; yy <= y1 - 1; yy++) {
        if (yy < 0 || yy >= AIM_BROWS) continue;
        if (x0 >= 0) consider(yy * AIM_BCOLS + x0);
        if (x1 < AIM_BCOLS) consider(yy * AIM_BCOLS + x1);
      }
    }
    return best;
  }

  /**
   * ONE STRUCTURE IN OR OUT OF THE AIM INDEX, in place.
   *
   * The index used to be REBUILT — every block cleared and every standing
   * building re-filed — the first time a search ran after anything at all
   * changed (structBoxDirty). That is O(board) per change, and on a late
   * board the changes are deaths, interleaved with the searches that pay
   * for them: several a step, each one a walk of five to ten thousand
   * buildings, and none of it in any counter. Filing the one building that
   * moved is O(its block), and a block is sixty-four cells.
   *
   * The bounds and the widest half are only ever used to stop a search
   * EARLY, so on a removal they are left where they are: a box a little
   * too large, or a half a little too wide, stops a search a little later
   * and never wrongly. The full rebuild still runs once after a reset,
   * which is the only time the index and the board can disagree.
   */
  private indexStructure(s: Structure, on: boolean): void {
    if (this.structBoxDirty) return; // a rebuild is owed and will file it
    const b = this.structBoxCache;
    const blocks = this.structBlocks;
    const bi =
      clamp((s.y / AIM_BLOCK_PX) | 0, 0, AIM_BROWS - 1) * AIM_BCOLS +
      clamp((s.x / AIM_BLOCK_PX) | 0, 0, AIM_BCOLS - 1);
    if (on) {
      const half = (this.sizeOf(s) * CELL) / 2;
      if (s.x - half < b.x0) b.x0 = s.x - half;
      if (s.y - half < b.y0) b.y0 = s.y - half;
      if (s.x + half > b.x1) b.x1 = s.x + half;
      if (s.y + half > b.y1) b.y1 = s.y + half;
      b.n++;
      if (half > this.structMaxHalf) this.structMaxHalf = half;
      (blocks[bi] ?? (blocks[bi] = [])).push(s);
    } else {
      const list = blocks[bi];
      if (list) {
        const k = list.indexOf(s);
        if (k >= 0) list.splice(k, 1);
      }
      b.n--;
    }
  }

  /** every live structure whose footprint comes within r of a point, once each */
  private structuresWithin(
    x: number,
    y: number,
    r: number,
    out: Structure[],
    team: Team = "player",
  ): Structure[] {
    out.length = 0;
    const seen = this.seenStructs;
    seen.clear();
    // ...and the cart, for the same reason nearestStructure has to name
    // it: a blast that reached every building in its circle and not the
    // one standing in the middle of it would be a hole a player can see
    if (this.convoys.length > 0 && team === "player")
      for (const c of this.convoys) {
        if (c.dead || c.home || c.struct.hp <= 0) continue;
        const t = c.struct;
        const half = (t.size * CELL) / 2;
        if (Math.sqrt((t.x - x) ** 2 + (t.y - y) ** 2) - half <= r) out.push(t);
      }
    const R = Math.ceil(r / CELL) + 1;
    const cx = (x / CELL) | 0, cy = (y / CELL) | 0;
    // a square of cells, and every one of them a candidate looked at. The
    // count is the WALK; the dedupe beside it is O(1) (seenStructs) and so
    // the walk is the whole price. It was an `out.includes` scan, which
    // made this quadratic in what it FINDS — see seenStructs for what that
    // cost on a board with thousands of buildings on it
    this.structCands +=
      (Math.min(ROWS - 1, cy + R) - Math.max(0, cy - R) + 1) *
      (Math.min(COLS - 1, cx + R) - Math.max(0, cx - R) + 1);
    for (let yy = Math.max(0, cy - R); yy <= Math.min(ROWS - 1, cy + R); yy++)
      for (let xx = Math.max(0, cx - R); xx <= Math.min(COLS - 1, cx + R); xx++) {
        const t = this.cellTower[yy * COLS + xx];
        if (!t || seen.has(t)) continue;
        seen.add(t);
        if (this.enemyTowers > 0 && teamOf(t) !== team) continue;
        const half = (this.sizeOf(t) * CELL) / 2;
        const dx = t.x - x, dy = t.y - y;
        if (Math.sqrt(dx * dx + dy * dy) - half <= r) out.push(t);
      }
    return out;
  }

  /**
   * THE DEDUPE FOR EVERY GRID WALK OVER BUILDINGS (structuresWithin,
   * structuresAlong). A building owns size x size cells and the occupancy
   * grid points every one of them at it, so a sweep meets the same
   * structure up to thirty-six times and has to take it once.
   *
   * IT WAS AN `out.includes` SCAN, and that is linear in what the sweep
   * has ALREADY FOUND — so the walk was quadratic in its own output, on a
   * board whose output grows with how much the player has built. A field
   * weapon reaching twenty-two tiles walks some two thousand cells; on a
   * board carrying six or seven thousand buildings it finds hundreds in
   * them, and the scan turned that into over a million comparisons for ONE
   * pulse. Measured on a wave-50 board it was the bulk of unitGuns, which
   * was two thirds of the step — the sim was running at 83% of real time
   * and forfeiting catch-up steps.
   *
   * Reused and cleared per call rather than allocated: these run thousands
   * of times a step, and a fresh Set each time would hand the whole saving
   * to the collector. The walk is never re-entered while it is filling, so
   * one set serves both callers.
   */
  private readonly seenStructs = new Set<Structure>();
  private readonly splashOut: Structure[] = [];
  /** the arc's own scratch: the structures one chain has already struck */
  private readonly arcOut: Structure[] = [];
  private readonly arcNear: Structure[] = [];
  private readonly alongOut: Structure[] = [];

  /**
   * EVERY LIVE STRUCTURE A BEAM CROSSES — the Starlight mechs' family
   * trait (weapons.ts UnitWeapon.pierce). The line is walked half a cell
   * at a time from the muzzle to `len`, and a corridor `halfW` either side
   * of it a cell at a time, reading the occupancy grid at each sample;
   * each structure is taken once, in the order the beam reaches it.
   *
   * IT IS A GRID WALK AND NOT A SEARCH: a starhart5's 57-tile beam is some
   * hundred and fifteen samples down the line and nine across, a thousand
   * array reads, once every seven seconds. A starhart1's is fifteen. It costs
   * what it looks like it costs.
   */
  private structuresAlong(
    x: number,
    y: number,
    angle: number,
    len: number,
    halfW: number,
    out: Structure[],
    team: Team = "player",
  ): Structure[] {
    out.length = 0;
    const seen = this.seenStructs;
    seen.clear();
    const cos = Math.cos(angle), sin = Math.sin(angle);
    // the corridor: offsets square to the line, a cell apart, the centre
    // line always one of them
    const lanes = Math.max(0, Math.floor(halfW / CELL));
    const step = CELL * 0.5;
    const grid = this.cellTower;
    for (let d = 0; d <= len; d += step) {
      const px = x + cos * d, py = y + sin * d;
      this.structCands += lanes * 2 + 1;
      for (let l = -lanes; l <= lanes; l++) {
        const ox = px - sin * l * CELL, oy = py + cos * l * CELL;
        const cx = (ox / CELL) | 0, cy = (oy / CELL) | 0;
        if (cx < 0 || cy < 0 || cx >= COLS || cy >= ROWS) continue;
        const t = grid[cy * COLS + cx];
        if (!t || seen.has(t)) continue;
        seen.add(t);
        if (this.enemyTowers > 0 && teamOf(t) !== team) continue;
        out.push(t);
      }
    }
    return out;
  }

  /**
   * EVERY LIVE STRUCTURE IN A CONE OFF THE MUZZLE — the old sky line's
   * shotgun (weapons.ts fx "scatter"): within `reach`, and with its centre
   * inside `cone` either side of `aim` (a footprint's own half-width
   * widens the test, so a wall the cone's edge clips is in it). The list
   * comes back nearest first, which is what `maxTargets` cuts against.
   * A ground body only takes what it can see; a flyer sees the whole
   * wedge, and the flyers that carried it flew.
   */
  private structuresInCone(
    x: number,
    y: number,
    aim: number,
    reach: number,
    cone: number,
    sighted: boolean,
    out: Structure[],
  ): Structure[] {
    this.structuresWithin(x, y, reach, out);
    if (cone < Math.PI) {
      let w = 0;
      for (let k = 0; k < out.length; k++) {
        const t = out[k];
        const dx = t.x - x, dy = t.y - y;
        const d = Math.sqrt(dx * dx + dy * dy);
        const half = (this.sizeOf(t) * CELL) / 2;
        let da = Math.atan2(dy, dx) - aim;
        while (da > Math.PI) da -= Math.PI * 2;
        while (da < -Math.PI) da += Math.PI * 2;
        // the footprint's angular half-width, as seen from the muzzle
        const slack = d > half ? Math.asin(half / d) : Math.PI;
        if (Math.abs(da) <= cone + slack) out[w++] = t;
      }
      out.length = w;
    }
    if (sighted) {
      let w = 0;
      for (let k = 0; k < out.length; k++) if (this.canSee(out[k], x, y)) out[w++] = out[k];
      out.length = w;
    }
    if (out.length > 1)
      out.sort((a, b) => {
        const ax = a.x - x, ay = a.y - y, bx = b.x - x, by = b.y - y;
        return ax * ax + ay * ay - (bx * bx + by * by);
      });
    return out;
  }

  /**
   * THE SHORT LANDING (Tower.shortT): the gun goes out for `dur` seconds,
   * or stays out that long from now if it already was — a REFRESH, never
   * a stack, and never on the core (the core has no gun to put out). The
   * odds are rolled here, per structure, exactly as the rot's are
   * (poisonTower), so a chain across a patch comes out speckled.
   */
  private shortTower(t: Structure, dur: number, chance = 1): void {
    if (dur <= 0 || isCore(t) || t.hp <= 0) return;
    if (chance < 1 && Math.random() >= chance) return;
    if (dur > t.shortT) t.shortT = dur;
  }

  /**
   * A unit's hit on a structure, through the one dial (unitDamageScale) —
   * and the ROT it carries, if it is a venom shot (weapons.ts
   * UnitWeapon.poison).
   *
   * THE ROT IS NOT SCALED BY THE DIAL. `unitDamageScale` is the sweep
   * handle over the swarm's BITE — what a balance pass turns to make the
   * bodies hit harder or softer — and poison is authored as health a second
   * against a turret's pool directly. A status that moved with the dial
   * would make every sweep silently re-tune the venom family twice.
   *
   * A HIT THAT DOES NO DAMAGE STILL POISONS. The rot rides on the shot
   * CONNECTING, not on the damage surviving armour: a dartback1's 8-point
   * spit against a railhead's plating lands 0.8 and six full seconds of
   * rot, which is the entire reason that body is on the field.
   */
  private hitStructure(t: Structure, dmg: number, poison = 0, poisonChance = 1, rend = 0): void {
    // THE REND (weapons.ts UnitWeapon.rend), the Tuskers' melee bite: a
    // share of THIS structure's own maximum pool, added to the blow
    // before the dial rather than billed separately, because it is one
    // hit with two terms. Never on the core — it has no gun to lose and
    // it is the run's stake (see the note on the field)
    const raw = rend > 0 && !isCore(t) ? dmg + t.hpMax * rend : dmg;
    // ...times the firing body's VETERANCY (uvet), set for the body whose
    // weapons are being run (updateUnitWeapons) and 1 the rest of the
    // time; a shot in flight carried it out of the muzzle already
    if (raw > 0) this.damageTower(t, raw * unitDamageScale() * this.dmgMul);
    if (poison > 0) this.poisonTower(t, poison, poisonChance);
  }
  /** the veterancy of the body whose weapons are being run right now */
  private dmgMul = 1;

  /**
   * THE ROT LANDING (Tower.poison): the rate stacks and the clock refreshes.
   *
   * ADDITIVE ON THE RATE, WITH NO CEILING, AND BLEEDING BACK DOWN. Each
   * application adds its rate here; everything above ONE application drains
   * again in the tower loop (POISON_DECAY), so the rot a turret is actually
   * taking is the balance of the two — and that level is LINEAR IN HOW MANY
   * SPITTERS ARE SHOOTING IT. Ten bodies is a trickle and three thousand is
   * a flood, which is the only shape a status can have in a game that puts
   * twenty thousand of them on a field.
   *
   * A FLAT CEILING WAS THE WRONG BOUND AND IT IS GONE. It made the rot
   * identical under ten bodies and under three thousand, and — being a fixed
   * number of hit points a second — it aged out entirely against a pool that
   * grows by multipliers: a late-run Giant-and-Bulwark turret (mods.ts) is a
   * quarter of a million health, eighty minutes of rot at the old ceiling,
   * on a run that lasts twelve. The decay is the bound now, and it is one
   * that scales with what is doing the shooting.
   *
   * THE ODDS ARE ROLLED HERE, PER STRUCTURE, so a burst that reaches a whole
   * patch comes out speckled rather than all-or-nothing — see
   * UnitWeapon.poisonChance.
   *
   * THE CLOCK IS A REFRESH AND NEVER A QUEUE, the same rule burning runs on
   * a body: a turret under steady fire rots continuously, and one the wave
   * has walked past stops POISON_TIME later. So the counter is killing them
   * or out-mending them, never waiting.
   */
  private poisonTower(t: Structure, rate: number, chance = 1): void {
    if (rate <= 0 || isCore(t) || t.hp <= 0) return;
    if (chance < 1 && Math.random() >= chance) return;
    // the FLOOR — the heaviest single source in force, which the decay never
    // eats into, so one spitter rots at exactly what its weapon says
    if (rate > t.poisonUnit) t.poisonUnit = rate;
    t.poison += rate;
    t.poisonT = POISON_TIME;
  }

  /** a burst at a point: splash — and rot — to every structure it reaches */
  private splashStructures(
    x: number,
    y: number,
    splash: number,
    radius: number,
    poison = 0,
    poisonChance = 1,
  ): void {
    if (splash <= 0 || radius <= 0) return;
    for (const t of this.structuresWithin(x, y, radius, this.splashOut))
      this.hitStructure(t, splash, poison, poisonChance);
  }

  /**
   * A TURRET'S HIT ON A BUILDING — the player's shot on one of the swarm's
   * conquered turrets, or a conquered turret's shot on one of the
   * player's. The damage lands directly (there is no unit index to sweep
   * for) and the hit effect goes off on the near face of the footprint,
   * where the shot arrived.
   *
   * WHICH SIDE IS BEING HIT DECIDES THE DIAL. A shot ARRIVING on the
   * player rides the swarm's own damage scale (hitStructure), exactly as
   * its bodies' weapons do, so a conquered repeater hits as hard as the
   * swarm hits; a shot the player fires lands raw.
   */
  private structureHit(s: Structure, dmg: number, fx: BulletFx | undefined, angle: number, col?: RGB): void {
    if (this.cellTower[s.gy * COLS + s.gx] !== s) return; // already down
    if (teamOf(s) === "player") this.hitStructure(s, dmg);
    else this.damageTower(s, dmg);
    const half = (this.sizeOf(s) * CELL) / 2;
    this.bulletFx(fx, s.x - Math.cos(angle) * half, s.y - Math.sin(angle) * half, angle, col);
  }

  /** is the structure still standing — and within this reach of the point? */
  private inReach(t: Structure, x: number, y: number, reach: number): boolean {
    // IS IT STILL STANDING? The grid read is what makes a held target
    // drop the moment the building under it comes down — and it is the
    // one test on this path that a CART cannot pass, because a cart is
    // never on the grid (levels.ts CONVOY_HP). Without the guard the
    // swarm PICKED the hauler, HELD the hauler, and never fired a shot at
    // it: every weapon asks this before it pulls a trigger, and the
    // answer was always no.
    if (!this.isConvoy(t) && this.cellTower[t.gy * COLS + t.gx] !== t) return false;
    const half = (this.sizeOf(t) * CELL) / 2;
    const dx = t.x - x, dy = t.y - y;
    return Math.sqrt(dx * dx + dy * dy) - half <= reach;
  }

  /**
   * WHAT A BODY AIMS AT: the nearer of the other side's nearest structure
   * and its nearest body within reach — a target either way (Aim). With
   * `sighted` the search takes only what it can see (the charge's search,
   * updateUnitWeapons); without it, the nearest in reach, and whether the
   * body may FIRE at that is a separate question asked once per decision.
   */
  private pickAim(x: number, y: number, reach: number, sighted: boolean): Aim | null {
    this.picks++;
    const s = this.nearestStructure(x, y, reach, sighted);
    if (!s) return null;
    return { x: s.x, y: s.y, half: (this.sizeOf(s) * CELL) / 2, s };
  }


  /** is the aim still standing, and within this reach of the point? */
  private aimReach(a: Aim, x: number, y: number, reach: number): boolean {
    return this.inReach(a.s, x, y, reach);
  }

  /** one hit on the aim, from a body of `team` */
  private aimHit(a: Aim, dmg: number, poison = 0, poisonChance = 1, rend = 0): void {
    this.hitStructure(a.s, dmg, poison, poisonChance, rend);
  }




  /**
   * EVERY UNIT ATTACK-MOVES. It walks the field as it always has, and
   * meanwhile every weapon it carries (UNIT_WEAPONS) fires at the nearest
   * structure within its reach — Mindustry's GroundAI: pathfind to the
   * core, shoot whatever the guns can see on the way. A structure across
   * its route is one it is pressed into by the field (FlowField.soft), in
   * reach of everything it has.
   *
   * Instant weapons (beams, bolts, flames, saps, fields, bombs) land the
   * moment they fire; the rest put a shot in flight (shots, updateEnemyShots).
   * A dartback1's weapon is itself: it goes off on the structure and is gone.
   */
  private updateUnitWeapons(dt: number): void {
    const { upx, upy, urot, ukind, uspawn, ucd, utT, ubeamT, ucharge, uheldRot, utgt } = this;
    const { utcell, uinview } = this;
    for (let i = this.n - 1; i >= 0; i--) {
      if (uspawn[i] > 0) continue; // still arriving, untouchable and unarmed
      const kind = UNIT_KINDS[ukind[i]];
      const ws = UNIT_WEAPONS[kind];
      if (ws.length === 0) continue;
      this.bodyIters++;
      const x = upx[i], y = upy[i];
      // A GROUND OR NAVAL BODY SHOOTS WHAT IT CAN SEE. Reach is not sight:
      // a hill between the two is a hill, and the swarm has to come round
      // it before it can open up on what is behind. A FLYER is looking down
      // and sees its whole radius (canSee) — that, and not the ability to
      // cross a mountain, is what the air layer is worth.
      // ...unless the bench has set its reach (setBench): a bench reach is
      // "always has a target", and a hill in the way would make it a lie
      const sighted = this.ufly[i] === 0 && this.benchUnitRange === null;
      // THE SPOTTER'S STAMP (levels.ts spotterField): every reach this body
      // has is this much longer while it lasts — the longest gun's, for
      // the pick, and each weapon's own below
      const reachMul = HAS_SPOTTER && this.ureachT[i] > 0 ? this.ureachMul[i] : 1;
      const reach = this.benchUnitRange ?? KIND_SEEK[ukind[i]] * reachMul;
      // ...and its VETERANCY (uvet): what every hit below is multiplied by
      // (hitStructure), and what a shot leaving the muzzle carries
      this.dmgMul = HAS_VET ? this.uvet[i] : 1;
      // THE EMPLACEMENT HOLDS THE CORE AND ASKS NOTHING (levels.ts
      // UnitStats.bombard). No search, no clock, no reach test, no sight
      // ray: the target is the base, it is the base for as long as the
      // base is standing, and the weapon's reach is the board (weapons.ts,
      // the railgun row). Every other branch below is about finding
      // something, and a railgun has nothing to find.
      if (HAS_BOMBARD && KIND_BOMBARD[ukind[i]]) {
        const core = this.core;
        if (core.hp > 0) {
          const half = (core.size * CELL) / 2;
          const dx = core.x - x, dy = core.y - y;
          this.fireBombard(i, x, y, ws, Math.sqrt(dx * dx + dy * dy) - half, dt);
        }
        continue;
      }
      // the target, re-picked every few tenths of a second, dropped the
      // moment it dies or walks out of the longest gun's reach
      utT[i] -= dt;
      let tgt = utgt[i];
      const had = tgt !== null;
      if (tgt && !this.aimReach(tgt, x, y, reach)) tgt = null;
      // ...on the clock, or the moment the one it had is gone. A body that
      // has NOTHING waits for the clock like everyone else rather than
      // re-scanning every tick: an empty search is the most expensive one
      // there is (it walks every ring out to reach), and it is exactly the
      // search a swarm still crossing open ground is running. `had` is
      // what tells the two apart
      if (utT[i] <= 0 || (had && !tgt)) {
        utT[i] = 0.3 + Math.random() * 0.2;
        // THE SEARCH DOES NOT LOOK OVER HILLS. It takes the nearest
        // structure in reach, sighted or not, and the ray below decides
        // whether this body may fire at it. The search used to cast a ray
        // at EVERY candidate until one was in view, and for a long gun on
        // the water — a Harpoon hull reaches fifty to ninety tiles, and
        // from the sea most of the board is behind a ridge — that was
        // thousands of rays a pick, ~8,000 a tick on a skate wave against
        // ~170 without: the whole of the fleet's cost. The price is a
        // blind spot: a hull whose nearest turret is behind rock holds its
        // fire even when a farther one stands in the open. Under the rule
        // that no ground gun shoots through a hill, that is what a sniper
        // behind a ridge does.
        //
        // The charge (KIND_CHARGE, the tuskers) is the one search that
        // stays sighted: it LEAVES THE ROUTE for its target (updateUnits),
        // so what it picks must be a thing it can walk straight at, and
        // its reach is a few tiles — a ray a candidate costs nothing there.
        const seek = HAS_CHARGE && KIND_CHARGE[ukind[i]] > 0;
        tgt = this.pickAim(x, y, reach, sighted && seek);
        // A POSTED BODY SEES ONLY ITS OWN GROUND (see ugar). The pick is
        // the ordinary one and then it is CLIPPED to the post's circle:
        // anything standing outside the leash is not a target, however
        // near it is and however far the gun reaches.
        //
        // WHY IT IS A FILTER AND NOT A SEARCH FROM THE POST. The search
        // takes the nearest structure and stops (see nearestStructure),
        // so clipping can throw away a pick and leave a legal one further
        // out unfound — a turret just outside the line can shadow one just
        // inside it for a re-pick or two. That is the honest trade: a
        // search centred on the post would need its own ring walk with its
        // own radius on top of the one every body already pays for, to fix
        // a case that lasts a third of a second and resolves itself the
        // moment either body moves.
        if (tgt && this.ugar[i] === 1) {
          const gx = tgt.x - this.ugarx[i], gy = tgt.y - this.ugary[i];
          if (gx * gx + gy * gy > this.ugarr[i] * this.ugarr[i]) tgt = null;
        }
        utgt[i] = tgt;
        utcell[i] = -1;
      }
      // THE SIGHT, ONCE PER DECISION. A ground or naval body asks whether it
      // can see the target it holds from the CELL it stands in, and asks
      // again only when it stands in another cell or has picked again; in
      // between, nothing that the answer depends on has moved (the target
      // is a structure). Out of view, the target is HELD and not fired at.
      //
      // WHY THIS IS NOT THE SAMPLING THAT WAS TRIED AND REJECTED: an
      // earlier cut thinned this ray to one tick in six, or to the re-pick
      // clock, and that was a balance change — a hull moving along a
      // ridge went on firing through the rock for the tenths of a second
      // between checks, and measured, it took the Harpoon fleet from
      // losing on wave 50 to taking the bot's board on wave 15. That was
      // sampling in TIME: the body moved, the answer changed, nobody asked.
      // This is sampling in SPACE: the answer is re-asked the tick the body
      // crosses a cell line, and within one cell the line of sight shifts
      // by less than a cell's width along its whole length — the error is
      // one hill cell's edge, not a ridge.
      if (tgt && sighted) {
        const ci =
          clamp((y / CELL) | 0, 0, ROWS - 1) * COLS + clamp((x / CELL) | 0, 0, COLS - 1);
        if (utcell[i] !== ci) {
          utcell[i] = ci;
          uinview[i] = this.canSee(tgt.s, x, y) ? 1 : 0;
        }
        if (uinview[i] === 0) tgt = null;
      }
      let exploded = false;
      // HUNGRY MECHS (mutation.ts): A MEAL IS WORTH WHAT IT ATE, NOT JUST
      // WHAT IT WEIGHED. The rule used to move health alone, and health
      // alone is what made it a GIFT: twenty runts walking at a line do
      // twenty runts' worth of damage to it, and one body carrying their
      // health does one ironhide1's. Measured, a run under the rule lasted a
      // third LONGER than the same run without it — the swarm was eating
      // its own damage. So a meal carries the eaten body's bite as well:
      // what the rule concentrates is the threat, not just the pool
      // ...TIMES THE STACK (mergeSqueezed): a body standing for N bodies
      // hits for N of them, which is the other half of a fold losing
      // nothing the wave sent
      const fed =
        (this.hungryOn && this.uhungry[i] ? 1 + this.ueaten[i] * HUNGRY_DMG_PER_MEAL : 1) *
        this.ustack[i];
      for (let w = 0; w < ws.length && !exploded; w++) {
        const wp = ws[w];
        // what THIS body's copy of the weapon hits for (see `fed` above);
        // in every ordinary run it is the weapon's own number
        const wpDamage = wp.damage * fed;
        const wpSplash = (wp.splash ?? 0) * fed;
        const slot = i * MAX_WEAPONS + w;
        // this weapon's reach, the spotter's stamp folded in — TWO NUMBERS
        // that are the same number everywhere but on the bench. `wreach`
        // is the GATE: how far a target may stand for this weapon to fire
        // at it. `wspan` is the FOOTPRINT: how far the weapon's effect
        // itself extends — the radius a field pulse walks, the length a
        // piercing beam or rail is walked and drawn, the cone a scatter
        // sweeps. A bench reach (setBench) widens the gate so every body
        // on the board has something to shoot, and must NOT widen the
        // footprint: with the map's diagonal as its radius a field pulse
        // walked all 262,144 cells of the board — 24.8 million cell reads
        // a step on the livewire4 clock, 66ms of a 71ms step — and a
        // starhart2's beam was walked the length of the map three times a
        // volley. Those were the bench's numbers, not the game's
        const wspan = wp.range * reachMul;
        const wreach = this.benchUnitRange ?? wspan;
        if (wp.beam) {
          // a held beam: while it burns it bites every interval, and the
          // reload only starts once it has gone out. Fx.hitMeltHeal (its
          // hitEffect) flicks off whatever it is resting on at each bite
          if (ubeamT[i] > 0) {
            ubeamT[i] -= dt;
            ucd[slot] -= dt;
            // the mount is fixed to the hull (rotate = false), and the hull
            // turns onto its target at the type's rotateSpeed — the starhart4's
            // 1.8 degrees a tick; the beam swings with it
            if (tgt) {
              const want = Math.atan2(tgt.y - y, tgt.x - x);
              let d = want - uheldRot[i];
              while (d > Math.PI) d -= Math.PI * 2;
              while (d < -Math.PI) d += Math.PI * 2;
              const step = ((1.8 * Math.PI) / 180) * 60 * dt;
              uheldRot[i] += Math.abs(d) <= step ? d : Math.sign(d) * step;
            }
            if (ucd[slot] <= 0) {
              ucd[slot] += wp.beam.interval;
              if (wp.pierce) {
                // THE STARLIGHT RULE: a held beam bites everything under
                // it, every interval, the width of its own washes
                const halfW = ((wp.beamStyle?.width ?? 4) * MU) / 2;
                const hit = this.structuresAlong(x, y, uheldRot[i], wspan, halfW, this.alongOut);
                for (let k = 0; k < hit.length; k++) {
                  this.hitStructure(hit[k], wpDamage, wp.poison ?? 0, wp.poisonChance ?? 1);
                  if (k < 4) this.pushFxCol(hit[k].x, hit[k].y, 12 / 60, FxKind.HitMeltHeal, 0, 0, wp.beamStyle?.colors[2][0] ?? PAL.heal);
                }
              } else if (tgt && this.aimReach(tgt, x, y, wreach)) {
                this.aimHit(tgt, wpDamage, wp.poison ?? 0, wp.poisonChance ?? 1);
                this.pushFxCol(tgt.x, tgt.y, 12 / 60, FxKind.HitMeltHeal, 0, 0, wp.beamStyle?.colors[2][0] ?? PAL.heal);
              }
            }
            if (ubeamT[i] <= 0) ucd[slot] = wp.reload - (wp.charge ?? 0);
            continue;
          }
          if (ucharge[i] > 0) {
            // charging (shoot.firstShotDelay): the beam opens when it runs out
            ucharge[i] -= dt;
            if (ucharge[i] <= 0) {
              ubeamT[i] = wp.beam.duration;
              ucd[slot] = 0;
              if (tgt) uheldRot[i] = Math.atan2(tgt.y - y, tgt.x - x);
            }
            continue;
          }
          ucd[slot] -= dt;
          if (ucd[slot] <= 0 && tgt && this.aimReach(tgt, x, y, wreach)) {
            uheldRot[i] = Math.atan2(tgt.y - y, tgt.x - x);
            if (wp.charge) ucharge[i] = wp.charge;
            else {
              ubeamT[i] = wp.beam.duration;
              ucd[slot] = 0;
            }
          }
          continue;
        }
        if (wp.charge) {
          // a charged shot (starhart5): the glow gathers for firstShotDelay
          // on the heading it was aimed on, then the beam goes down it
          if (ucharge[i] > 0) {
            ucharge[i] -= dt;
            if (ucharge[i] <= 0) {
              this.fireUnitLaser(x, y, uheldRot[i], tgt, wp, wreach, true, fed, wspan);
              ucd[slot] = wp.reload - wp.charge;
            }
            continue;
          }
          ucd[slot] -= dt;
          if (ucd[slot] <= 0 && tgt && this.aimReach(tgt, x, y, wreach)) {
            uheldRot[i] = Math.atan2(tgt.y - y, tgt.x - x);
            ucharge[i] = wp.charge;
          }
          continue;
        }
        ucd[slot] -= dt;
        if (ucd[slot] > 0) continue;
        if (!tgt || !this.aimReach(tgt, x, y, wreach)) {
          ucd[slot] = 0; // ready, waiting for something in reach
          continue;
        }
        // a mirrored pair fires twice a reload, alternating: one mount's
        // worth of gap between shots
        ucd[slot] = wp.reload / wp.mounts;
        const shots = wp.shots ?? 1;
        const aim = Math.atan2(tgt.y - y, tgt.x - x);
        switch (wp.fx) {
          case "bullet":
          case "missile":
          case "shell": {
            for (let k = 0; k < shots; k++) this.fireUnitShot(x, y, tgt, wp, k, fed);
            break;
          }
          case "gun": {
            // A ROUND WITH NO BODY: the hit lands the moment the trigger is
            // pulled and the only thing drawn is the gun's own splash at
            // the muzzle — no projectile crosses the field (weapons.ts:
            // the ironhide1's and the boats' copper rounds, the livewire1's
            // torpedo). Splash, where a row carries it, bursts on the
            // target the way the round would have
            for (let k = 0; k < shots; k++) {
              this.aimHit(tgt, wpDamage, wp.poison ?? 0, wp.poisonChance ?? 1);
              if (wpSplash)
                this.splashStructures(tgt.x, tgt.y, wpSplash, wp.splashRadius ?? 0, wp.poison ?? 0, wp.poisonChance ?? 1);
              this.fireUnitGun(x, y, aim + (k - (shots - 1) / 2) * 0.06, wp);
            }
            break;
          }
          case "melee": {
            // THE TUSKS (weapons.ts, the Tuskers): nothing is fired and
            // nothing crosses the field. The body is standing against the
            // building and tears at it — the blow carries its REND, a
            // share of the structure's own pool, and on the heavy tiers a
            // stomp that reaches the rest of the patch.
            //
            // WHAT IS DRAWN IS ON THE BUILDING, not at a muzzle, because
            // that is where it is happening: rubble off the near face of
            // the footprint, where the tusks are, and an ivory spark over
            // it. Every other weapon in the game announces itself at the
            // body that fired it; this one announces itself at the thing
            // coming apart
            for (let k = 0; k < shots; k++) {
              this.aimHit(tgt, wpDamage, wp.poison ?? 0, wp.poisonChance ?? 1, wp.rend ?? 0);
              if (wpSplash)
                this.splashStructures(tgt.x, tgt.y, wpSplash, wp.splashRadius ?? 0, wp.poison ?? 0, wp.poisonChance ?? 1);
            }
            const fx = tgt.x - Math.cos(aim) * tgt.half, fy = tgt.y - Math.sin(aim) * tgt.half;
            this.pushFx(fx, fy, 24 / 60, FxKind.Pulverize, 0, 0, (Math.random() * 0x7fffffff) | 0);
            this.pushFxCol(fx, fy, 14 / 60, FxKind.BulletHit, aim, 0, PAL.tusk);
            break;
          }
          case "laser": {
            // a volley of them fans by ShootSpread (the starhart2's three)
            for (let k = 0; k < shots; k++)
              this.fireUnitLaser(x, y, aim + (k - (shots - 1) / 2) * (wp.spread ?? 0), tgt, wp, wreach, KIND_TIER[ukind[i]] >= 4, fed, wspan);
            break;
          }
          case "sap": {
            // SapBulletType: the line lands on the target and retracts onto
            // the mount as it fades (the draw lerps its far end back over fin)
            for (let k = 0; k < shots; k++) this.aimHit(tgt, wpDamage, wp.poison ?? 0, wp.poisonChance ?? 1);
            const st = wp.sap;
            if (st) {
              const dx = tgt.x - x, dy = tgt.y - y;
              this.pushFxCol(x, y, st.lifetime, FxKind.Sap, aim, Math.sqrt(dx * dx + dy * dy), st.color, st.id, true);
            }
            this.pushFx(x, y, FX_LIFE[FxKind.ShootSmall], FxKind.ShootSmall, aim);
            break;
          }
          case "shrapnel": {
            // ShrapnelBulletType: an instant serrated ray its full length,
            // one per shot, fanned by ShootSpread; Fx.sparkShoot at the muzzle
            const st = wp.shrapnel;
            for (let k = 0; k < shots; k++) {
              this.aimHit(tgt, wpDamage, wp.poison ?? 0, wp.poisonChance ?? 1);
              const a = aim + (k - (shots - 1) / 2) * (wp.spread ?? 0);
              if (st) this.pushFx(x, y, 10 / 60, FxKind.Shrapnel, a, wspan, 0, st.id, true);
            }
            this.pushFxCol(x, y, FX_LIFE[FxKind.SparkShoot], FxKind.SparkShoot, aim, 0, PAL.white);
            break;
          }
          case "lightning": {
            // LightningBulletType: each shot is a Lightning.create walk out
            // of the muzzle, in the bullet's colour, `inaccuracy` off the aim
            const bt = wp.bolt;
            for (let k = 0; k < shots; k++) {
              this.aimHit(tgt, wpDamage, wp.poison ?? 0, wp.poisonChance ?? 1);
              if (bt) {
                const a = aim + (Math.random() * 2 - 1) * bt.inaccuracy;
                this.unitBolt(x, y, a, bt.length + Math.floor(Math.random() * (bt.lengthRand + 1)), bt.color);
              }
            }
            this.pushFxCol(x, y, 8 / 60, FxKind.ShootHeal, aim, 0, wp.bolt?.color ?? PAL.heal);
            break;
          }
          case "flame": {
            // Fx.shootSmallFlame out of the barrel and Fx.hitFlameSmall on
            // the wall — or their plasma pair, white through heal to grey
            for (let k = 0; k < shots; k++) this.aimHit(tgt, wpDamage, wp.poison ?? 0, wp.poisonChance ?? 1);
            const seed = (Math.random() * 0x7fffffff) | 0;
            if (wp.plasma) {
              this.pushFxCol(x, y, 32 / 60, FxKind.Flame, aim, 0, PAL.heal, 1, false, seed);
              this.pushFxCol(tgt.x, tgt.y, 14 / 60, FxKind.FlameHit, aim, 0, PAL.heal, 0, false, seed + 1);
            } else {
              this.pushFx(x, y, 32 / 60, FxKind.Flame, aim, 0, seed);
              this.pushFx(tgt.x, tgt.y, 14 / 60, FxKind.FlameHit, aim, 0, seed + 1);
            }
            break;
          }
          case "bomb": {
            if (wp.suicide) {
              // A BODY THAT IS THE BULLET. A kind with a PAYLOAD (levels.ts)
              // seeks to `range` and goes off on CONTACT — the last
              // stretch is flown at the target (updateUnits) and the
              // charge is the payload's; a kind without one is the old
              // dartback1 charge, the row's own splash centred on itself.
              // Either way it is gone, and no kill goes on the ledger.
              //
              if (KIND_PAYLOAD[ukind[i]]) {
                if (!this.aimReach(tgt, x, y, CONTACT_REACH)) break;
                this.detonate(i);
              } else {
                this.aimHit(tgt, wpDamage, wp.poison ?? 0, wp.poisonChance ?? 1);
                this.splashStructures(x, y, wpSplash, wp.splashRadius ?? 0, wp.poison ?? 0, wp.poisonChance ?? 1);
                // the burst is the whole of the bomb: weapon lane
                this.pushFx(x, y, 40 / 60, FxKind.Pulverize, 0, 0, (Math.random() * 0x7fffffff) | 0, 0, true);
              }
              this.pushDeathFx(x, y);
              // a stack that goes off is that many bodies gone — read
              // before the row is recycled under us
              this.exploded += this.ustack[i];
              this.removeUnit(i);
              exploded = true;
            } else if (wp.look) {
              // BombBulletType: dropped where the unit is on its heading, a
              // fused shot that barely moves (speed 0.7 under drag 0.05 —
              // some fourteen units in all, so half that speed for its
              // whole fuse) and bursts when the fuse runs out
              const bs = 0.35 * MU * 60;
              this.shots.push({
                x, y, vx: Math.cos(urot[i]) * bs, vy: Math.sin(urot[i]) * bs,
                life: wp.look.lifetime ?? 0.5, age: 0,
                damage: wpDamage, splash: wpSplash, splashRadius: wp.splashRadius ?? 0,
                look: wp.look, collide: wp.look.collide !== false, trailT: 0,
                poison: wp.poison ?? 0,
                poisonChance: wp.poisonChance ?? 1,
                homing: 0,
                seek: null,
                soakT: wp.soak ?? 0,
                soakRate: wp.soakRate ?? 1,
                burn: 0,
              });
            }
            break;
          }
          case "rail": {
            // RailBulletType: Fx.railShoot at the muzzle, Fx.railTrail every
            // 60 units down the line (pointEffectSpace), Fx.railHit on what
            // it punched through, Fx.shootBig2 smoke — its whole length,
            // in the row's colour (the Harpoon fleet's teal). A
            // PIERCING rail punches through everything on the line
            const rc = wp.railColor ?? PAL.orangeSpark;
            // A THIN LINE AND NOTHING ELSE. The rail used to throw a muzzle
            // splash, a blade every sixty units down its length and a
            // spike on what it struck, every one of them forced past the
            // effect cap — which on a thousand runts was thousands of
            // uncapped quads a second and a frame that stalled. It is ONE
            // effect now: the whole line as a hair-thin streak carrying its
            // length (FxKind.RailShoot, `len`) and a small hit flick. THE
            // LINE IS FORCED FOR EVERY TIER (the weapon lane, FX_WEAPON_CAP):
            // it used to be forced for the top tiers only, and on a late
            // board the ambient pool was full, so a T1-T3 fleet fired by
            // the thousand and showed nothing at all. The mass tiers' line
            // is a bare thread — no muzzle ring (renderer drawRailShoot) —
            // and the hit flick stays dressing, kept only for the heavy
            // tiers (`big`)
            const big = KIND_TIER[ukind[i]] >= 4;
            if (wp.pierce) {
              const hit = this.structuresAlong(x, y, aim, wspan, CELL * 0.5, this.alongOut);
              for (let k = 0; k < hit.length; k++) {
                this.hitStructure(hit[k], wpDamage, wp.poison ?? 0, wp.poisonChance ?? 1);
                if (k < 6) this.pushFxCol(hit[k].x, hit[k].y, 14 / 60, FxKind.RailHit, aim, 0, rc, 0, big);
              }
            } else {
              this.aimHit(tgt, wpDamage, wp.poison ?? 0, wp.poisonChance ?? 1);
              this.pushFxCol(tgt.x, tgt.y, 14 / 60, FxKind.RailHit, aim, 0, rc, 0, big);
            }
            const dx = tgt.x - x, dy = tgt.y - y;
            const along = wp.pierce ? wspan : Math.min(wspan, Math.sqrt(dx * dx + dy * dy));
            this.pushFxCol(x, y, 16 / 60, FxKind.RailShoot, aim, along, rc, big ? 1 : 0, true);
            break;
          }
          case "scatter": {
            // THE SKY'S SHOTGUN: no round at all. Every structure in the
            // cone takes a pellet's worth the instant the trigger is
            // pulled, less the further out it stands, nearest first up to
            // the cap; the fan out of the muzzle is the whole of what is
            // drawn (FxKind.Scatter), plus the sparks on what it struck
            const cone = wp.cone ?? Math.PI;
            const hit = this.structuresInCone(x, y, aim, wspan, cone, sighted, this.splashOut);
            const max = wp.maxTargets ?? hit.length;
            const fall = wp.falloff ?? 1;
            const col = wp.scatterColor ?? PAL.bomber;
            for (let k = 0; k < hit.length && k < max; k++) {
              const t = hit[k];
              const half = (this.sizeOf(t) * CELL) / 2;
              const dx = t.x - x, dy = t.y - y;
              const d = Math.max(0, Math.sqrt(dx * dx + dy * dy) - half);
              const share = 1 - (1 - fall) * Math.min(1, d / wspan);
              this.hitStructure(t, wpDamage * share, wp.poison ?? 0, wp.poisonChance ?? 1);
              if (k < 6)
                this.pushFxCol(t.x, t.y, FX_LIFE[FxKind.BulletHit], FxKind.BulletHit, Math.atan2(dy, dx), 0, col, 0,
                  false, (Math.random() * 0x7fffffff) | 0);
            }
            // the fan carries its cone in degrees down the style lane
            const deg = Math.min(255, Math.round((cone * 180) / Math.PI));
            for (let k = 0; k < shots; k++)
              this.pushFxCol(x, y, 13 / 60, FxKind.Scatter, aim, wspan, col, deg, true,
                (Math.random() * 0x7fffffff) | 0);
            break;
          }
          case "arc": {
            // THE AEGIS ARC: the target, then the nearest structure the
            // last one struck can reach, `jumps` times, each hop a share
            // of the last — and a SHORT rolled on every one of them. A
            // Fx.chainLightning from the mount to the first and from each
            // to the next, so the chain is drawn where it went
            const ar = wp.arc;
            if (!ar) break;
            const seen = this.arcOut;
            seen.length = 0;
            let cur: Structure = tgt.s;
            let dmg = wpDamage;
            this.hitStructure(cur, dmg, wp.poison ?? 0, wp.poisonChance ?? 1);
            this.shortTower(cur, wp.short ?? 0, wp.shortChance ?? 1);
            this.chainFx(x, y, cur, ar.color);
            // the first hop's blast is what an arc shows of itself: weapon lane
            this.pushFxCol(cur.x, cur.y, 12 / 60, FxKind.HitLaserBlast, aim, 0, ar.color, 0, true);
            seen.push(cur);
            for (let j = 0; j < ar.jumps; j++) {
              const near = this.structuresWithin(cur.x, cur.y, ar.reach, this.arcNear);
              let next: Structure | null = null;
              let bd = Infinity;
              for (let k = 0; k < near.length; k++) {
                const c = near[k];
                if (seen.includes(c)) continue;
                const ddx = c.x - cur.x, ddy = c.y - cur.y;
                const d2 = ddx * ddx + ddy * ddy;
                if (d2 < bd) {
                  bd = d2;
                  next = c;
                }
              }
              if (!next) break;
              dmg *= ar.decay;
              this.hitStructure(next, dmg, wp.poison ?? 0, wp.poisonChance ?? 1);
              this.shortTower(next, wp.short ?? 0, wp.shortChance ?? 1);
              this.chainFx(cur.x, cur.y, next, ar.color);
              this.pushFxCol(next.x, next.y, 12 / 60, FxKind.HitLaserBlast, 0, 0, ar.color);
              seen.push(next);
              cur = next;
            }
            this.pushFxCol(x, y, 8 / 60, FxKind.HitEmpSpark, aim, 0, ar.color, 0, false,
              (Math.random() * 0x7fffffff) | 0);
            break;
          }
          case "field": {
            // EnergyFieldAbility: one pulse to every structure in reach —
            // but DRAWN AS ONE BOLT, not as one per target. The ability
            // reaches twenty-two tiles and takes twenty-five things, and a
            // star of twenty-five bolts leaving the same hull is a white
            // blot where a weapon should be. So the pulse WALKS instead:
            // out of the mount to the nearest structure, then nearest to
            // nearest through the rest, one Fx.chainLightning a hop. Same
            // targets, same damage on every one of them — the hop order is
            // the only thing the walk decides, and it decides it so the
            // line is short and legible rather than so the chain is fair
            const hit = this.structuresWithin(x, y, wspan, this.splashOut);
            const max = Math.min(hit.length, wp.maxTargets ?? hit.length);
            const col = wp.fieldColor ?? PAL.heal;
            let cx = x, cy = y;
            for (let k = 0; k < max; k++) {
              // NEAREST-NEIGHBOUR, IN PLACE: pick the closest of the
              // structures not yet walked (hit[k..]) and swap it to k, so
              // the tail stays the unvisited set with nothing allocated
              let bi = k, bd = Infinity;
              for (let j = k; j < hit.length; j++) {
                const ddx = hit[j].x - cx, ddy = hit[j].y - cy;
                const d2 = ddx * ddx + ddy * ddy;
                if (d2 < bd) { bd = d2; bi = j; }
              }
              if (bi !== k) { const sw = hit[k]; hit[k] = hit[bi]; hit[bi] = sw; }
              const t = hit[k];
              // the rot rides a field pulse exactly as it rides a bullet: no
              // hit path in this file may quietly drop a weapon's status, or
              // the next family built on `field` loses it without a word
              this.hitStructure(t, wpDamage, wp.poison ?? 0, wp.poisonChance ?? 1);
              if (wp.short) this.shortTower(t, wp.short, wp.shortChance ?? 1);
              this.chainFx(cx, cy, t, col);
              this.pushFxCol(t.x, t.y, 12 / 60, FxKind.HitLaserBlast, Math.atan2(t.y - cy, t.x - cx), 0, col);
              cx = t.x;
              cy = t.y;
            }
            break;
          }
        }
      }
    }
    this.dmgMul = 1;
  }

  /**
   * THE GUN SPLASH — what a "gun" weapon draws instead of a round: the
   * bullet's own shootEffect (Fx.shootSmall's flash unless the row says
   * otherwise) and its smoke, thrown off the muzzle on the aim in the
   * round's colour, exactly as fireUnitShot throws them behind a shot. The
   * shot itself is the part that is gone.
   */
  private fireUnitGun(x: number, y: number, a: number, wp: UnitWeapon): void {
    const shoot = wp.shoot ?? FxKind.ShootSmall;
    const col = wp.shootColor ?? PAL.lightOrange;
    const seed = (Math.random() * 0x7fffffff) | 0;
    // the splash is the whole of what a bodiless round shows, so it rides
    // the weapon lane (FX_WEAPON_CAP); the smoke is dressing
    this.pushFxCol(x, y, fxLife(shoot), shoot, a, 0, col, 0, true, seed);
    if (wp.smoke !== undefined) this.pushFxCol(x, y, fxLife(wp.smoke), wp.smoke, a, 0, col, 0, false, seed + 1);
  }

  /** a bullet, missile or shell leaves the unit for the structure */
  private fireUnitShot(x: number, y: number, tgt: Aim, wp: UnitWeapon, k: number, fed = 1): void {
    if (!wp.look) return;
    const half = tgt.half;
    // aim at the footprint, with a little spread so a burst is a burst
    const ax = tgt.x + (Math.random() * 2 - 1) * half * 0.6;
    const ay = tgt.y + (Math.random() * 2 - 1) * half * 0.6;
    const dx = ax - x, dy = ay - y;
    const d = Math.max(1, Math.sqrt(dx * dx + dy * dy));
    const a = Math.atan2(dy, dx) + (Math.random() * 2 - 1) * 0.05 + (k - ((wp.shots ?? 1) - 1) / 2) * 0.06;
    // a shell lives exactly long enough to reach where it was aimed; a
    // bullet flies its full range and stops at what it hits on the way
    this.fireUnitShotAt(x, y, a, wp, fed, wp.fx === "shell" ? d / wp.speed : undefined);
  }

  /**
   * ONE ROUND ON A HEADING — what fireUnitShot resolves to once it has
   * decided where to point, and what the radial volley (weapons.ts
   * UnitWeapon.radial) uses directly, since it never aims at anything.
   * `life` overrides the flight time for a shell, which lives exactly long
   * enough to reach where it was lobbed.
   */
  private fireUnitShotAt(x: number, y: number, a: number, wp: UnitWeapon, fed = 1, life?: number): void {
    const look = wp.look;
    if (!look) return;
    const sp = wp.speed;
    this.shots.push({
      x, y,
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      life: life ?? wp.range / sp, age: 0,
      // ...at what the BODY hits for, not what the weapon says: a fed
      // Hungry mech's shells carry its meals exactly as its direct hits do
      // (see `fed` in updateUnitWeapons)
      damage: wp.damage * fed,
      splash: (wp.splash ?? 0) * fed,
      splashRadius: wp.splashRadius ?? 0,
      look,
      collide: look.collide !== false,
      trailT: 0,
      // the venom line's rot rides the shot, so a bomb still in the air
      // poisons what it lands on rather than what its shooter was aiming at
      // when it was fired (weapons.ts UnitWeapon.poison)
      poison: wp.poison ?? 0,
      poisonChance: wp.poisonChance ?? 1,
      // no weapon on the roster steers or lights a gun: those two belong to
      // the Grapnels' stars, which are not weapons and are not fired from
      // here (fireStar). The soak has a weapon row behind it as well now —
      // the Kettles' wet bomb (weapons.ts UnitWeapon.soak)
      homing: 0,
      seek: null,
      soakT: wp.soak ?? 0,
      soakRate: wp.soakRate ?? 1,
      burn: 0,
    });
    // the bullet's own shootEffect and smokeEffect, in its hitColor (what
    // Effect.at is handed for a shootEffect) — sparkShoot ramps into it
    const fc = look.hitColor ?? look.back;
    const seed = (Math.random() * 0x7fffffff) | 0;
    this.pushFxCol(x, y, fxLife(look.shoot), look.shoot, a, 0, fc, 0, false, seed);
    if (look.smoke) this.pushFxCol(x, y, fxLife(look.smoke), look.smoke, a, 0, fc, 0, false, seed + 1);
  }

  /**
   * THE STARBURST (levels.ts UnitStats.starburst, weapons.ts
   * GRAPNEL_STARS) — the Grapnels throwing stars. `count` of them leave
   * the body at once, evenly spaced round the whole circle: ONE, from a
   * random arm, when a hit that landed rolled its answer; FIVE, one down
   * every arm, when the body died where it stands.
   *
   * IT IS NOT A WEAPON AND THERE IS NO AIM. Nothing pulled a trigger and
   * nothing was targeted — the headings are the body's own five arms on
   * the heading it happens to be crawling, exactly as the old volley's
   * were. What is new is that each round then STEERS: it looks for the
   * nearest building it can see inside its own travel and turns onto it
   * (EnemyShot.homing, updateEnemyShots). A star thrown with nothing in
   * reach flies its arm's heading and burns out in the open, which is
   * what makes killing them away from the line the answer.
   *
   * WHAT IT HITS FOR IS THE BODY'S, NOT THE ROW'S: a folded stack throws
   * for every body in it (ustack, the same rule the squeeze and every
   * weapon in the game run on), and a fed Hungry mech's stars carry its
   * meals. That is the other half of the fold — ten runts in one body
   * throw one star worth ten.
   *
   * THE ELEMENT IS ROLLED PER STAR and not per body, so a death burst off
   * an apex is five different things arriving at once — which is the
   * point of it: there is no one status to build against.
   */
  private throwStar(i: number, count: number): void {
    const stars = KIND_STARS[this.ukind[i]];
    if (!stars) return;
    const x = this.upx[i], y = this.upy[i];
    // ...times the stack and the meals, exactly as updateUnitWeapons bills
    // a weapon it fires (see `fed` there)
    const fed =
      (this.hungryOn && this.uhungry[i] ? 1 + this.ueaten[i] * HUNGRY_DMG_PER_MEAL : 1) *
      this.ustack[i];
    // a single star leaves a RANDOM arm; five leave all five. Either way
    // the spacing is the body's own — seventy-two degrees, off its facing
    const first = count >= 5 ? 0 : (Math.floor(Math.random() * 5) * Math.PI * 2) / 5;
    for (let k = 0; k < count; k++) {
      const sp = stars.length === 1 ? stars[0] : stars[(Math.random() * stars.length) | 0];
      this.fireStar(x, y, this.urot[i] + first + (k * Math.PI * 2) / 5, sp, fed);
    }
  }

  /**
   * ONE STAR ON ONE ARM'S HEADING — what throwStar resolves to once it has
   * rolled the element, and the only place a star is ever made.
   *
   * THE QUARRY IS PICKED HERE AND ONCE. The star looks for the nearest
   * building it can SEE within its whole travel — sighted, like the ground
   * body that threw it, so a turret behind a ridge is not one a star finds
   * — and carries the pointer out of the muzzle. Everything after that is
   * the shot's own business (updateEnemyShots): it steers onto it, it
   * looks once more if the building comes down under it, and it is spent
   * wherever it happens to be when its travel runs out.
   */
  private fireStar(x: number, y: number, a: number, sp: StarSpec, fed: number): void {
    const look = sp.look;
    this.shots.push({
      x, y,
      vx: Math.cos(a) * sp.speed, vy: Math.sin(a) * sp.speed,
      // the travel is the WHOLE of what a star gets — "a nearby turret" is
      // exactly this number, and nothing further off is ever reachable
      life: sp.range / sp.speed, age: 0,
      damage: sp.damage * fed,
      splash: sp.splash * fed,
      splashRadius: sp.splashRadius,
      look,
      collide: true,
      trailT: 0,
      poison: sp.poison,
      // a star never misses by a roll — the element IS the round, so what
      // it carries lands every time it connects
      poisonChance: 1,
      homing: sp.homing,
      seek: this.nearestStructure(x, y, sp.range, true),
      soakT: sp.soak,
      soakRate: sp.soakRate,
      burn: sp.burn,
    });
    const fc = look.hitColor ?? look.back;
    const seed = (Math.random() * 0x7fffffff) | 0;
    this.pushFxCol(x, y, fxLife(look.shoot), look.shoot, a, 0, fc, 0, false, seed);
  }

  /**
   * LaserBulletType: an instant beam its FULL length down the aim —
   * Mindustry stops a laser only at a block that absorbs lasers, so it runs
   * through the structure it hit and on to its length. The target takes
   * the damage; the shootEffect (Fx.hitPiercer, or stoop5's shockwave)
   * goes off at the muzzle
   *
   * `range` is the GATE (may the target be fired at from here) and `span`
   * the beam's LENGTH — walked and drawn. One number in the game, two on
   * the bench, where the gate is the whole map and the length must stay
   * the weapon's own (see wreach / wspan in updateUnitWeapons)
   */
  /**
   * THE EMPLACEMENT'S CYCLE, and the whole of what a railgun does with its
   * life (levels.ts UnitStats.bombard, weapons.ts the railgun row).
   *
   * IT IS A SEPARATE PATH BECAUSE IT HAS NO QUESTIONS IN IT. The ordinary
   * weapon loop is mostly search, sight and reach — pick a target, ask
   * whether the body can see it, ask whether this mount reaches it, drop
   * it when it dies — and every one of those has exactly one answer here:
   * the core, yes, yes, and it does not. What is left is a clock and a
   * beam, which is this function.
   *
   * THE BEAM IS DRAWN TO THE CORE AND NOT TO THE WEAPON'S REACH. The reach
   * is two hundred tiles (it has to clear any board), and the fx is drawn
   * `span` long from the muzzle — so a railgun a hundred and twenty tiles
   * out would otherwise paint a line eighty tiles out the far side of the
   * base. `dist` is measured to the core's own edge by the caller and
   * passed in, so what is drawn is what is hit.
   */
  private fireBombard(
    i: number,
    x: number,
    y: number,
    ws: readonly UnitWeapon[],
    dist: number,
    dt: number,
  ): void {
    const core = this.core;
    const aim = Math.atan2(core.y - y, core.x - x);
    this.bombardAim.x = core.x;
    this.bombardAim.y = core.y;
    this.bombardAim.half = (core.size * CELL) / 2;
    this.bombardAim.s = core;
    for (let w = 0; w < ws.length; w++) {
      const wp = ws[w];
      const slot = i * MAX_WEAPONS + w;
      // the charge is the tell (weapons.ts): the light gathers on the
      // heading for firstShotDelay and the beam goes down it after
      if (wp.charge) {
        if (this.ucharge[i] > 0) {
          this.ucharge[i] -= dt;
          if (this.ucharge[i] <= 0) {
            this.fireUnitLaser(x, y, this.uheldRot[i], this.bombardAim, wp, wp.range, true, 1, dist);
            this.ucd[slot] = wp.reload - wp.charge;
          }
          continue;
        }
        this.ucd[slot] -= dt;
        if (this.ucd[slot] <= 0) {
          this.uheldRot[i] = aim;
          this.ucharge[i] = wp.charge;
        }
        continue;
      }
      this.ucd[slot] -= dt;
      if (this.ucd[slot] > 0) continue;
      this.ucd[slot] = wp.reload / wp.mounts;
      this.fireUnitLaser(x, y, aim, this.bombardAim, wp, wp.range, true, 1, dist);
    }
  }

  /** the one Aim a bombarding body ever holds, rewritten in place: it is
   *  the core every time, and ten emplacements allocating one apiece every
   *  tick would be garbage for a fact that never changes */
  private readonly bombardAim: Aim = { x: 0, y: 0, half: 0, s: null as unknown as Structure };

  private fireUnitLaser(
    x: number, y: number, aim: number, tgt: Aim | null, wp: UnitWeapon, range = wp.range, big = true,
    fed = 1, span = range,
  ): void {
    const st = wp.laser;
    if (wp.pierce) {
      // THE STARLIGHT RULE (UnitWeapon.pierce): everything the beam
      // crosses takes the hit, the corridor the style's own width
      const halfW = ((st?.width ?? 6) * MU) / 2;
      const hit = this.structuresAlong(x, y, aim, span, halfW, this.alongOut);
      for (let k = 0; k < hit.length; k++) {
        this.hitStructure(hit[k], wp.damage * fed, wp.poison ?? 0, wp.poisonChance ?? 1);
        if (wp.short) this.shortTower(hit[k], wp.short, wp.shortChance ?? 1);
        if (st && k > 0 && k < (big ? 6 : 2))
          this.pushFxCol(hit[k].x, hit[k].y, 12 / 60, FxKind.HitLaserBlast, aim, 0, st.colors[st.colors.length - 1][0]);
      }
    } else if (tgt && this.aimReach(tgt, x, y, range)) {
      this.aimHit(tgt, wp.damage * fed, wp.poison ?? 0, wp.poisonChance ?? 1);
    }
    if (!st) return;
    // THE BEAM IS THE ATTACK and is forced for every tier (the weapon
    // lane, FX_WEAPON_CAP): a thousand runts' lances that fell under the
    // ambient cap were a thousand bodies firing invisibly on the wave that
    // most needed to be read. The muzzle flash and the hit blast below stay
    // dressing
    this.pushFx(x, y, st.lifetime, FxKind.Laser, aim, span, 0, st.id, true);
    if (wp.shoot === FxKind.Shockwave) this.pushFx(x, y, 10 / 60, FxKind.Shockwave, 0, wp.shootLen ?? 0);
    else if (wp.shoot !== undefined)
      this.pushFxCol(x, y, fxLife(wp.shoot), wp.shoot, aim, 0, st?.colors[1][0] ?? PAL.heal, 0, false, (Math.random() * 0x7fffffff) | 0);
    if (tgt) this.pushFxCol(tgt.x, tgt.y, 12 / 60, FxKind.HitLaserBlast, aim, 0, st.colors[st.colors.length - 1][0]);
  }

  /**
   * Lightning.create for a unit's bolt: a walk of `length / 2` nodes out
   * of the muzzle, each 15 units (hitRange / 2) on, the heading wandering
   * up to 20 degrees a step and every node jittered 3 units — the path
   * Fx.lightning strokes. The structure the weapon picked already took the
   * damage; this is the shape of the shot
   */
  private unitBolt(x: number, y: number, angle: number, length: number, col: RGB): void {
    const pts: number[] = [];
    let rot = angle;
    const nodes = Math.max(2, (length / 2) | 0);
    for (let k = 0; k < nodes; k++) {
      pts.push(x + (Math.random() * 2 - 1) * 3 * MU, y + (Math.random() * 2 - 1) * 3 * MU);
      rot += (Math.random() * 2 - 1) * (20 * Math.PI) / 180;
      x += Math.cos(rot) * 15 * MU;
      y += Math.sin(rot) * 15 * MU;
    }
    const i = this.pushSlot(pts[0], pts[1], 10 / 60, FxKind.Lightning, 0, 0, 0, 0, true);
    if (i >= 0) {
      this.fxPts[i] = pts;
      this.fxHasCol[i] = 1;
      this.fxColR[i] = col[0];
      this.fxColG[i] = col[1];
      this.fxColB[i] = col[2];
    }
  }

  /**
   * Fx.chainLightning: a chain from the unit to what its field hit, a link
   * every 6 units with each joint thrown up to 3 units off the line — the
   * point list is built here, as Mindustry builds it in the draw, so the
   * renderer only strokes it
   */
  private chainFx(x: number, y: number, tgt: Structure, col: RGB): void {
    const dx = tgt.x - x, dy = tgt.y - y;
    const dst = Math.sqrt(dx * dx + dy * dy);
    if (dst < 1) return;
    const nx = dx / dst, ny = dy / dst;
    const range = 6 * MU;
    // ...AND NO MORE THAN CHAIN_LINKS_MAX OF THEM. The count is the
    // distance to the target, and the longest chain the roster fires (the
    // livewire5's, thirty-two tiles) is forty-four links — under the cap,
    // so no arc in the game draws differently. Over it a link is simply
    // longer. The cap exists for the bench, where every target is in
    // reach and so may be the far side of the map: a chain to a core seven
    // hundred tiles off was six hundred and sixty links, three arrays of
    // them a step for every livewire2 firing, and building those lists
    // was the whole of that clock's 23ms — a draw cost, billed to unitGuns
    const links = Math.min(CHAIN_LINKS_MAX, Math.max(1, Math.ceil(dst / range)));
    const spacing = dst / links;
    const pts: number[] = [x, y];
    for (let k = 0; k < links; k++) {
      if (k === links - 1) pts.push(tgt.x, tgt.y);
      else {
        const len = (k + 1) * spacing;
        const ra = Math.random() * Math.PI * 2, rl = range / 2;
        pts.push(x + nx * len + Math.cos(ra) * rl, y + ny * len + Math.sin(ra) * rl);
      }
    }
    const i = this.pushSlot(x, y, 20 / 60, FxKind.ChainLightning, 0, 0, 0, 0, true);
    if (i >= 0) {
      this.fxPts[i] = pts;
      this.fxHasCol[i] = 1;
      this.fxColR[i] = col[0];
      this.fxColG[i] = col[1];
      this.fxColB[i] = col[2];
    }
  }

  /** where the last sweepShot's round actually met the building, in world
   *  px, rather than where its step happened to end */
  private sweepHitX = 0;
  private sweepHitY = 0;

  /**
   * THE FIRST STRUCTURE A ROUND CROSSED THIS TICK — the line from where it
   * was to where it now is, sampled every half cell, and the nearest thing
   * standing on it.
   *
   * IT EXISTS BECAUSE A FAST ROUND OUTRUNS THE GRID. One cell read at the
   * end of the step is the whole collision test for the swarm's shots, and
   * it is exact for anything moving less than a cell a tick — which was
   * every round in the game until the Grapnels' stars, at forty px a tick
   * against a thirty-two px cell. A round that skips cells does not miss
   * SOMETIMES; it misses every turret whose footprint happens to fall
   * between two samples, which on a 1x1 is most of them.
   *
   * SO THE COST IS PAID BY THE ROUNDS THAT NEED IT AND BY NO OTHERS: the
   * sample count is the step over half a cell, which is 1 — one cell read,
   * exactly as before — for everything slower than that.
   *
   * It stops at the FIRST thing the round meets, which is where the round
   * stops: nothing the swarm fires goes through a building any more — the
   * one round that did was the Grapnels' old volley, and the stars that
   * replaced it strike one thing and burst.
   */
  private sweepShot(sh: EnemyShot, x0: number, y0: number): Structure | null {
    const dx = sh.x - x0, dy = sh.y - y0;
    const len = Math.sqrt(dx * dx + dy * dy);
    const steps = len > SHOT_SWEEP ? Math.ceil(len / SHOT_SWEEP) : 1;
    for (let k = 1; k <= steps; k++) {
      const f = k / steps;
      const sx = x0 + dx * f, sy = y0 + dy * f;
      if (sx < 0 || sy < 0 || sx >= W || sy >= H) break;
      const t = this.structureAt(sx, sy);
      if (!t) continue;
      this.sweepHitX = sx;
      this.sweepHitY = sy;
      return t;
    }
    return null;
  }

  /**
   * THE SWARM'S SHOTS IN FLIGHT. Each flies its heading — or steers onto
   * a building, if it is one of the Grapnels' stars — and the first
   * structure its STEP crossed (sweepShot) is what it hits. A shell that
   * runs out of life bursts where it is (that is where it was aimed); a
   * missile does the same; a bullet that reaches nothing is spent.
   */
  private updateEnemyShots(dt: number): void {
    const shots = this.shots;
    this.bodyIters += shots.length;
    for (let p = shots.length - 1; p >= 0; p--) {
      const sh = shots[p];
      // A ROUND THAT STEERS (weapons.ts StarSpec.homing, the Grapnels'
      // star): it turns onto its quarry at its own rate, which keeps the
      // speed and moves the heading — a star is flung, not guided, and one
      // thrown past a turret at close range overshoots and comes back
      // round rather than pivoting on the spot.
      //
      // ITS QUARRY IS REVALIDATED EVERY TICK against the occupancy grid,
      // exactly as a turret's held target is: a building whose anchor cell
      // no longer points back at it is one that came down. When that
      // happens the star looks ONCE for another inside the travel it has
      // LEFT — not its whole range, which would let a spent round reach
      // further than a fresh one — and if there is nothing there it stops
      // steering and flies out the heading it is on.
      if (sh.homing > 0) {
        const sp = Math.sqrt(sh.vx * sh.vx + sh.vy * sh.vy);
        // ...and a star steering at the CART keeps steering: the grid test
        // below is "is this building still standing", and a hauler is
        // never on the grid, so without the guard every star thrown at one
        // would drop its quarry on the tick after it was thrown
        if (sh.seek && !this.isConvoy(sh.seek) && this.cellTower[sh.seek.gy * COLS + sh.seek.gx] !== sh.seek) {
          sh.seek = this.nearestStructure(sh.x, sh.y, sh.life * sp, true);
          if (!sh.seek) sh.homing = 0;
        }
        if (sh.seek) {
          const want = Math.atan2(sh.seek.y - sh.y, sh.seek.x - sh.x);
          let a = Math.atan2(sh.vy, sh.vx);
          let d = want - a;
          while (d > Math.PI) d -= Math.PI * 2;
          while (d < -Math.PI) d += Math.PI * 2;
          const step = sh.homing * dt;
          a += Math.abs(d) <= step ? d : Math.sign(d) * step;
          sh.vx = Math.cos(a) * sp;
          sh.vy = Math.sin(a) * sp;
        }
      }
      // where it was before this tick's step — the far end of the line the
      // sweep below tests, which is the only thing that lets a round move
      // further than a cell in one tick and still hit what is on its way
      const x0 = sh.x, y0 = sh.y;
      sh.x += sh.vx * dt;
      sh.y += sh.vy * dt;
      sh.life -= dt;
      sh.age += dt;
      const look = sh.look;
      // ArtilleryBulletType.update's trail, on its own clock — and the
      // missiles' Fx.missileTrail, a puff on a chance per tick
      if (look.trail) {
        const fin = sh.age / (sh.age + sh.life);
        const slope = 1 - Math.abs(fin - 0.5) * 2;
        sh.trailT += dt;
        if (sh.trailT >= ((3 + slope * 2) * look.trail.mult) / 60) {
          sh.trailT = 0;
          this.pushTrail(sh.x, sh.y, slope * look.trail.size, look.trail.color);
        }
      } else if (look.puff && Math.random() < look.puff.chance * dt * 60) {
        this.pushTrail(sh.x, sh.y, look.puff.size, look.puff.color);
      }
      const off = sh.x < 0 || sh.y < 0 || sh.x >= W || sh.y >= H;
      // WHAT IT CROSSED, not what it is standing on. A round used to be
      // tested against the one cell it ended the tick over, which is
      // exactly right while a round moves less than a cell in a tick and
      // silently wrong the moment one does not: the Grapnels' stars fly
      // forty px a tick against a thirty-two px cell, so half the turrets
      // on their line were passed straight THROUGH. The sweep walks the
      // step instead (sweepShot) and is a single cell read — the same one
      // this always did — for every round slower than that, which is every
      // other round in the game.
      const t = off || !sh.collide ? null : this.sweepShot(sh, x0, y0);
      if (t) {
        // it stops WHERE IT STRUCK and not where the step ended, so the
        // burst, the flames and the hit mark are all on the building
        sh.x = this.sweepHitX;
        sh.y = this.sweepHitY;
        this.hitStructure(t, sh.damage, sh.poison, sh.poisonChance);
        if (sh.splash > 0)
          this.splashStructures(sh.x, sh.y, sh.splash, sh.splashRadius, sh.poison, sh.poisonChance);
        this.starStatus(sh, t);
        this.shotHitFx(sh);
      } else if (sh.life <= 0 && !off) {
        // a shell that runs out of flight lands where it is — ON whatever
        // stands there, which takes the round's own damage as a struck
        // structure would (the shot was aimed at it, and a lobbed round
        // that flew over the wall to reach it is not a round that missed),
        // and then the burst reaches it and its neighbours. Without the
        // first half a lobbed row's `damage` was a number nothing read: the
        // naval shells landed at a fraction of their rows and the venom
        // line's thrown bombs at their splash alone
        const under = sh.collide ? null : this.structureAt(sh.x, sh.y);
        if (under) this.hitStructure(under, sh.damage, sh.poison, sh.poisonChance);
        if (sh.splash > 0) {
          this.splashStructures(sh.x, sh.y, sh.splash, sh.splashRadius, sh.poison, sh.poisonChance);
          // ...and a burst that went off in the open still soaks and still
          // lights whatever happened to be standing inside it
          this.starStatus(sh, under);
          this.shotHitFx(sh);
        } else if (under || look.hit === FxKind.HitLaser) this.shotHitFx(sh);
      }
      if (t || off || sh.life <= 0) {
        shots[p] = shots[shots.length - 1];
        shots.pop();
      }
    }
  }

  /**
   * WHAT A ROUND LEAVES BEHIND BESIDES A HOLE (weapons.ts StarSpec, and
   * UnitWeapon.soak for the one weapon row that carries one): the soaked
   * star's and the wet bomb's slowed reload, and the fire star's flames,
   * on the building it struck and on everything its burst reached.
   *
   * THE ROT IS NOT HERE and does not need to be: poison already rides
   * every shot in the game (EnemyShot.poison) and hitStructure and
   * splashStructures both lay it. These two are the statuses nothing but
   * a star applies, so this is the only place that knows about them — and
   * it is a NO-OP, one compare, on every other round in flight.
   *
   * IT WALKS THE BURST A SECOND TIME rather than threading two more
   * arguments through splashStructures, which every weapon in the game
   * calls and none of them would ever pass. Stars are thrown by the
   * handful and never by the thousand: the second walk is over the
   * structures inside one splash radius, and it is paid only by the round
   * that actually carries a status.
   */
  private starStatus(sh: EnemyShot, t: Structure | null): void {
    if (sh.soakT <= 0 && sh.burn <= 0) return;
    if (t) {
      this.soakTower(t, sh.soakT, sh.soakRate);
      this.burnTower(t, sh.burn);
    }
    if (sh.splash <= 0 || sh.splashRadius <= 0) return;
    for (const s of this.structuresWithin(sh.x, sh.y, sh.splashRadius, this.splashOut)) {
      if (s === t) continue;
      this.soakTower(s, sh.soakT, sh.soakRate);
      this.burnTower(s, sh.burn);
    }
  }

  /**
   * THE SOAK LANDING (Tower.soakT / soakRate, the Grapnels' soaked star
   * and the Kettles' wet bomb): this gun reloads at `rate` of its own for
   * `dur` seconds.
   *
   * IT WEARS THE SAME CHIP AS WATERLOGGING and it is not the same thing
   * (see the note on the field): a wound a round left, not a fact about
   * the ground. What the player reads off both is the one number that
   * matters — how fast this gun is reloading — so the inspector folds them
   * into one rate and the field wears one symbol.
   *
   * A REFRESH on the clock and the DEEPEST rate in force, exactly like the
   * short and the fire: two stars do not slow a gun twice, and the heavier
   * of them decides how slow.
   */
  private soakTower(t: Structure, dur: number, rate: number): void {
    if (dur <= 0 || isCore(t) || t.hp <= 0) return;
    if (t.soakT <= 0 || rate < t.soakRate) t.soakRate = rate;
    if (dur > t.soakT) t.soakT = dur;
  }

  /**
   * THE FIRE LANDING (Tower.burnT, the Grapnels' fire star): the building
   * burns for TOWER_BURN_TIME, for `dps` raw health a second.
   *
   * A REFRESH ON THE CLOCK AND A MAX ON THE RATE (see the note on the
   * field). And it ignores plating, like burning on a body and like the
   * rot: the two statuses that go through armour are the two answers to
   * armour, and a fire a bulwarked tacker shrugs off is a status the
   * player never has to think about.
   */
  private burnTower(t: Structure, dps: number): void {
    if (dps <= 0 || isCore(t) || t.hp <= 0) return;
    if (dps > t.burnDps) t.burnDps = dps;
    t.burnT = TOWER_BURN_TIME;
  }

  /** BulletType.hitEffect.at(x, y, rotation, hitColor) for a swarm shot */
  private shotHitFx(sh: EnemyShot): void {
    const look = sh.look;
    const rot = Math.atan2(sh.vy, sh.vx);
    switch (look.hit) {
      case FxKind.BlastExplosion:
      case FxKind.Flak:
      case FxKind.SapExplosion:
      case FxKind.MassiveExplosion:
        this.pushFx(sh.x, sh.y, fxLife(look.hit), look.hit, 0, sh.splashRadius, (Math.random() * 0x7fffffff) | 0);
        break;
      case FxKind.EmpHit:
        this.pushFxCol(sh.x, sh.y, 50 / 60, FxKind.EmpHit, 0, sh.splashRadius, look.hitColor ?? PAL.heal, 0,
          false, (Math.random() * 0x7fffffff) | 0);
        break;
      case FxKind.WaterBurst:
        // drawn at the radius it actually soaked, like the dousers' own
        this.pushFxCol(sh.x, sh.y, fxLife(FxKind.WaterBurst), FxKind.WaterBurst, 0, sh.splashRadius,
          look.hitColor ?? PAL.water, 0, false, (Math.random() * 0x7fffffff) | 0);
        break;
      case FxKind.Explosion:
        this.pushFx(sh.x, sh.y, EXPLOSION_LIFE[look.hitStyle ?? 0] ?? 22 / 60, FxKind.Explosion, 0, 0,
          (Math.random() * 0x7fffffff) | 0, look.hitStyle ?? 0);
        break;
      case FxKind.GreenCloud:
        // the livewire1 torpedo: MultiEffect(blastExplosion, greenCloud)
        this.pushFx(sh.x, sh.y, fxLife(FxKind.BlastExplosion), FxKind.BlastExplosion, 0, 0, (Math.random() * 0x7fffffff) | 0);
        this.pushFxCol(sh.x, sh.y, 80 / 60, FxKind.GreenCloud, 0, 0, look.hitColor ?? PAL.heal, 0, false,
          (Math.random() * 0x7fffffff) | 0);
        break;
      default:
        // hitBulletColor / hitLiquid / hitLaser: a ramp into the shot's colour
        this.pushFxCol(sh.x, sh.y, fxLife(look.hit), look.hit, rot, 0, look.hitColor ?? look.back, 0, false,
          (Math.random() * 0x7fffffff) | 0);
    }
  }

  // ---------- placement ----------

  /** no unit may be standing on (or overhanging into) the footprint */
  private areaClearOfUnits(gx: number, gy: number, sz: number): boolean {
    const x0 = gx * CELL, y0 = gy * CELL;
    const x1 = x0 + CELL * sz, y1 = y0 + CELL * sz;
    const rmax = HB_RMAX.both;
    const hx0 = clamp(((x0 - rmax) / HC) | 0, 0, HCOLS - 1);
    const hy0 = clamp(((y0 - rmax) / HC) | 0, 0, HROWS - 1);
    const hx1 = clamp(((x1 + rmax) / HC) | 0, 0, HCOLS - 1);
    const hy1 = clamp(((y1 + rmax) / HC) | 0, 0, HROWS - 1);
    for (let hy = hy0; hy <= hy1; hy++) {
      for (let hx = hx0; hx <= hx1; hx++) {
        const c = hy * HCOLS + hx, e = this.bStart[c + 1];
        for (let k = this.bStart[c]; k < e; k++) {
          const i = this.bUnits[k];
          if (i >= this.n) continue;
          const dx = this.upx[i] - clamp(this.upx[i], x0, x1);
          const dy = this.upy[i] - clamp(this.upy[i], y0, y1);
          const d2 = dx * dx + dy * dy;
          const r = this.hitR(i, dx, dy, d2);
          if (d2 < r * r) return false;
        }
      }
    }
    return true;
  }

  /** would this footprint cut the swarm's last route to the base? */


  /**
   * Towers build on HIGHGROUND only: mountain/rock wall cells (not forest,
   * not floor), free of other towers. They overlook the lanes and never
   * touch the flow field — the rock was already unwalkable.
   */
  /**
   * THE HYDROPHOBIC MASK: every cell within HYDROPHOBIC_RANGE of water.
   *
   * "Water" is any water FLOOR, shallow or deep (isWaterFloor) — a ford a
   * unit wades and a channel a tank swims are the same wet ground to a
   * turret standing beside them, and a rule the player has to squint at to
   * predict is a rule they cannot plan around.
   *
   * The distance is a 5-7-11 chamfer in fifths of a cell, which is the
   * same approximation the map generators measure their lane clearances
   * with (scripts/maps/geom.mjs) — within about 2% of true Euclidean,
   * and two linear passes rather than a search per cell. It runs over the
   * WHOLE grid including rock, because rock is exactly where turrets go.
   */
  private buildWaterlogged(): Uint8Array {
    const { floor } = this.terrain;
    const n = COLS * ROWS;
    const INF = 1 << 20;
    const d = new Int32Array(n).fill(INF);
    for (let i = 0; i < n; i++) if (isWaterFloor(floor[i])) d[i] = 0;
    // the two half-kernels, as (dx, dy, cost) — the second is the first
    // mirrored through the origin, which is what makes the pair exact
    const FWD = [
      [-1, -2, 11], [1, -2, 11],
      [-2, -1, 11], [-1, -1, 7], [0, -1, 5], [1, -1, 7], [2, -1, 11],
      [-1, 0, 5],
    ];
    const sweep = (fwd: boolean) => {
      const y0 = fwd ? 0 : ROWS - 1;
      const yEnd = fwd ? ROWS : -1;
      const yStep = fwd ? 1 : -1;
      for (let y = y0; y !== yEnd; y += yStep) {
        const x0 = fwd ? 0 : COLS - 1;
        const xEnd = fwd ? COLS : -1;
        const xStep = fwd ? 1 : -1;
        for (let x = x0; x !== xEnd; x += xStep) {
          const i = y * COLS + x;
          if (d[i] === 0) continue;
          for (const [ox, oy, c] of FWD) {
            const nx = x + (fwd ? ox : -ox);
            const ny = y + (fwd ? oy : -oy);
            if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
            const v = d[ny * COLS + nx] + c;
            if (v < d[i]) d[i] = v;
          }
        }
      }
    };
    sweep(true);
    sweep(false);
    const out = new Uint8Array(n);
    const reach = HYDROPHOBIC_RANGE * 5;
    for (let i = 0; i < n; i++) if (d[i] <= reach) out[i] = 1;
    return out;
  }

  /** every water cell, shallow or deep — see waterCells */
  private buildWaterCells(): Uint8Array {
    const { floor } = this.terrain;
    const out = new Uint8Array(COLS * ROWS);
    for (let i = 0; i < out.length; i++) if (isWaterFloor(floor[i])) out[i] = 1;
    return out;
  }

  /** is this world point standing in water? 0/1 rather than a boolean so it
   *  drops straight into the Uint8Array that remembers it */
  private inWater(x: number, y: number): 0 | 1 {
    const mask = this.waterCells;
    const gx = (x / CELL) | 0;
    const gy = (y / CELL) | 0;
    if (gx < 0 || gy < 0 || gx >= COLS || gy >= ROWS) return 0;
    return mask[gy * COLS + gx] ? 1 : 0;
  }

  /**
   * WHAT ONE BODY OF A KIND SPAWNS WITH, in one place because three
   * callers need the same answer: the spawn itself, and the amphibious
   * rule twice (which recomputes rather than remembers — see the note
   * there on why compounding is the thing to avoid).
   *
   * Two dials, and they are the run's rather than the body's: the LEVEL
   * curve (the spec's enemyLevel plus whatever the loop has added), and
   * the OBJECTIVE BODIES' SHARE OF THE SIZE RAMP (ladder.ts
   * tierObjectiveHpScale) — a quarter of their health at Incursion and all
   * of it from Nemesis up, because a mission puts down one body whatever
   * the difficulty. Both come off the level document; unset is 1.
   */
  private baseHpOf(kind: UnitKind): number {
    return unitHpOnRung(kind, (this.level.enemyLevel ?? 0) + this.loopLevel, this.level.objectiveHpScale ?? 1);
  }

  /**
   * THE AMPHIBIOUS RULE (mutation.ts): walkers come out of water better
   * than they went in.
   *
   * Two jobs in one walk over the ground units. The first is the ENTRY
   * test — a body that was dry last tick and is wet now takes a stack, up
   * to AMPHIBIOUS_MAX_STACKS, and the stack's worth of health, speed and
   * armour lands on it there and then. The second is the healing every
   * stacked body carries afterwards, wet or dry: the water changed what it
   * IS, so the mending does not stop at the bank.
   *
   * THE PERCENTAGES COME OFF WHAT IT SPAWNED WITH, recomputed here from
   * the kind and the tier rather than read off the unit's current pool —
   * see the note in mutation.ts on why compounding is the thing to avoid.
   * It is the same pair of expressions spawnUnit uses, and it runs at most
   * five times in a body's life, so recomputing costs less than the array
   * it would take to remember.
   *
   * FLYERS AND HULLS ARE NOT ASKED. A hull is never out of the water, so
   * it would cap out on its first tick; a flyer is never in it. The rule
   * is about the walk.
   */
  private updateAmphibious(dt: number): void {
    if (!this.amphibiousOn) return;
    const { upx, upy, uhp, uhpmax, uspd, uarmor, uwade, uwet01, ufly, unav, ukind } = this;
    for (let i = 0; i < this.n; i++) {
      // ...and NEITHER IS A CROSSER, which is the third body this rule is
      // not about. A stack adds SPEED, and a Borer's speed is the mission's
      // clock (levels.ts WORM_SPEED): a road that happens to ford a lake
      // would hand the swarm a faster train on Amphibious runs and a
      // slower one otherwise, for no reason a player could see. It also
      // swells the sprite off its own hitbox, on the one body the whole
      // map is about hitting
      if (ufly[i] || unav[i] || this.ucross[i] >= 0) continue;
      const wet = this.inWater(upx[i], upy[i]);
      // THE CROSSING, not the standing: only a dry -> wet step pays
      if (wet && !uwet01[i] && uwade[i] < AMPHIBIOUS_MAX_STACKS) {
        const kind = UNIT_KINDS[ukind[i]];
        const stats = UNIT_STATS[kind];
        const base = this.baseHpOf(kind);
        uwade[i]++;
        // health goes on BOTH pools, so a stack is a heal and a bigger tank
        const gain = base * AMPHIBIOUS_HP;
        uhpmax[i] += gain;
        uhp[i] += gain;
        uspd[i] += stats.speed * (this.speedyOn ? SPEEDY_SPEED : 1) * AMPHIBIOUS_SPEED;
        uarmor[i] += AMPHIBIOUS_ARMOR;
        this.pushFx(upx[i], upy[i], 0.4, FxKind.Heal);
      }
      uwet01[i] = wet;
      if (uwade[i] > 0 && uhp[i] < uhpmax[i]) {
        const base = this.baseHpOf(UNIT_KINDS[ukind[i]]);
        uhp[i] = Math.min(uhp[i] + base * AMPHIBIOUS_REGEN * uwade[i] * dt, uhpmax[i]);
      }
    }
  }

  /** is the Hydrophobic rule in force? — what the build ghost asks before
   *  it bothers to test any ground */
  get hydrophobicOn(): boolean {
    return this.waterlogged !== null;
  }

  /** the taxed cells themselves, or null where the rule is not in force —
   *  for the one caller that wants to PAINT them (Game's build overlay)
   *  rather than ask about a single footprint */
  waterloggedMask(): Uint8Array | null {
    return this.waterlogged;
  }

  /** the lit cells — the mask the drawing side holds by reference, for the
   *  ghost's test and for the overlay that paints the whole region while a
   *  card is in hand. Always the array, never null (see rebuildPower) */
  poweredMask(): Uint8Array {
    return this.powered;
  }

  /** ...and which of the map's beacons are switched on, for the drawing
   *  side to light and price them (the array itself, held by reference) */
  beaconOnMask(): Uint8Array {
    return this.beaconOn;
  }

  /**
   * Would a turret of `kind` placed here fire slowed? True if ANY
   * cell of its footprint is within reach of water — a turret is one
   * building, so one wet corner soaks the whole thing rather than the
   * penalty depending on which cell the game happens to measure from.
   */
  isWaterlogged(gx: number, gy: number, kind: TowerKind, size?: number): boolean {
    return waterloggedUnder(this.boardGrids(), gx, gy, kind, size);
  }

  /**
   * CAN A BUILDING STAND HERE. The rule itself is in board.ts, over grids,
   * because the DRAWING side has to be able to ask it too — a build cursor
   * that waited on another thread for its colour would be a build cursor
   * that lied for a frame. This is the sim's way in to the same answer.
   */
  canPlace(gx: number, gy: number, kind: TowerKind, size?: number): boolean {
    return canPlaceOn(
      this.boardGrids(),
      this,
      this.shieldTowers,
      SHIELD_TOWER_SIZE,
      this.tech ? this.tech.unlocked : null,
      gx,
      gy,
      kind,
      size,
    );
  }

  /** what this save may field, or null where everything is allowed (a
   *  sandbox or an editor) — the gate board.ts tests a placement against */
  techUnlocked(): ReadonlySet<TowerKind> | null {
    return this.tech ? this.tech.unlocked : null;
  }

  /** the five masks a placement reads (board.ts), gathered from where the
   *  sim keeps them — terrain, field and its own occupancy shadow */
  boardGrids(): BoardGrids {
    return {
      blocked: this.terrain.blocked,
      spawn: this.terrain.spawn,
      reserved: this.terrain.reserved,
      isGoal: this.field.isGoal,
      occupied: this.occupied,
      waterlogged: this.waterlogged,
      powered: this.powered,
    };
  }

  /**
   * IS THE POWER RULE IN FORCE? It rides the TECH GATE and nothing else: a
   * campaign run has a roster it may field and ground it may field it on,
   * and both are the same kind of allowance. A sandbox and the two editors
   * have neither — they build anything, anywhere, for nothing, and a board
   * with nothing to defend has nothing to power.
   */
  get powerOn(): boolean {
    return this.tech !== null;
  }

  /**
   * WHICH OF THE MAP'S BEACONS HAVE BEEN SWITCHED ON, one byte each, indexed
   * into terrain.beacons.
   *
   * SHARED, because the drawing side has to know which of them to light and
   * which to price, every frame, and this is one byte per beacon against a
   * message. WHERE they are does not cross at all: both threads build their
   * own terrain from the same map document, so both already have the list.
   *
   * IT ONLY EVER GOES UP. A beacon stands on rock, cannot be targeted and
   * cannot be destroyed (see MapBeacon in terrain.ts) — so buying one is a
   * permanent widening of the board and nothing in the game turns one back
   * off. That is what lets the power mask only ever grow, which is in turn
   * what lets a placed turret never lose its ground.
   */
  readonly beaconOn = shared.u8(MAX_BEACONS);

  /**
   * SWITCH ONE ON — the whole of the beacon mechanic, and it is a purchase
   * and not a placement: there is no footprint to test, no ground to claim
   * and nothing to roll. The circle around it becomes buildable, for the
   * rest of the run.
   *
   * IT TAKES NO MONEY, exactly as placeTower takes none. The scrap is gone
   * before this is called (Game.buyBeacon pays the world and tells the host,
   * which is the one money path every purchase in this game goes down) —
   * charging again here would charge a run twice for one press.
   *
   * Returns whether anything changed, so a stale press can be ignored: an
   * index off the end, or a beacon that is already on.
   */
  setBeaconOn(i: number): boolean {
    if (!this.terrain.beacons[i] || this.beaconOn[i]) return false;
    this.beaconOn[i] = 1;
    this.rebuildPower();
    return true;
  }

  /**
   * EVERYTHING LIGHTING GROUND RIGHT NOW: the core, which lights for free
   * and always, then every beacon that has been bought.
   *
   * A FLAT UNION AND NOT A TREE. An earlier cut of this had beacons daisy-
   * chaining out from the core, each needing the one behind it — which is a
   * real mechanic, and the wrong one for beacons that cannot be destroyed:
   * with nothing able to cut a chain, the chain was only ever a second way
   * of saying what the price already says. The price IS the gate, and it is
   * a rising one: every beacon on a board costs the same rung of the one
   * campaign ladder and buying any of them puts the rest up
   * (game/constants.ts BEACON_LADDER). Reaching a far hill early is a run
   * spending its whole middle game on that hill, which is the gate an
   * author is setting when they decide how many beacons a board carries.
   */
  powerDiscs(): { x: number; y: number; r: number }[] {
    return powerDiscsOf(this.terrain, this.beaconOn, this.core.x, this.core.y);
  }

  /**
   * REPAINT THE POWER GRID: the core's disc, plus one per bought beacon.
   *
   * SPAN FILL rather than a per-cell distance test — at ninety cells the
   * core's disc alone is better than twenty-five thousand cells, and each
   * row is solved with one square root. It runs when a beacon is bought and
   * when a board is loaded, never in a step and never in a frame.
   */
  private rebuildPower(): void {
    this.powerVersion++;
    // WHERE THE RULE IS OFF THE MASK IS ALL ONES, rather than absent.
    //
    // It used to be handed over as null on a free board, and that was a bug
    // with a long fuse: the drawing side takes its reference to this array
    // ONCE, when the level loads (simreads.ts World), and whether the rule
    // is on is not known until setTech runs a moment later — so a campaign
    // run captured the null and could never build anywhere.
    //
    // A mask that is always an array and always true has no such moment. It
    // costs 262,144 bytes on a board that does not need them and removes
    // every question about when the answer becomes known.
    if (!this.powerOn) {
      this.powered.fill(1);
      return;
    }
    paintPower(this.powered, this.powerDiscs());
  }



  /**
   * ONE CARD'S WORTH OF PLACEMENTS AS ONE BOARD CHANGE.
   *
   * Everything a placement does to a single footprint (the roll, the
   * ground test, claiming the cells) is per turret and stays per turret.
   * The one thing that is NOT is the spec table: it is composed off the
   * board as a whole — the count-dependent rungs read a census, and every
   * standing turret is re-resolved on top of the result — so asking for
   * it once per turret means the ninth copy of a x9 citadel re-resolves
   * the eight that went before it, and the board, and the card costs
   * O(turrets squared) to lay down.
   *
   * Inside here refreshSpecs only notes that it is owed; the flush at the
   * end does it once, against the finished board, which is the same table
   * the last of those calls would have produced. Re-entrant (a giant that
   * will not fit falls back to the ordinary shape through the same path),
   * and it flushes even if the body throws.
   */
  /**
   * ONE CARD, LAID DOWN — the whole of what pressing the button on a held
   * formation does, on the side the board is on.
   *
   * It used to live in Game as a closure handed to batchPlacement, which
   * worked only because the two were in the same thread: a closure is the
   * one kind of command that cannot be sent anywhere. Written out here it
   * is a call with plain arguments and a number back, which can cross —
   * and it belongs here anyway, because every line of it is about the board
   * rather than about the cursor that aimed it.
   *
   * The SOLO roll is part of it and stays part of it: rolling on the side
   * that owns the dice is what keeps a run reproducible (see the seeded
   * runs the playtest depends on).
   */
  placeFormation(cells: readonly { gx: number; gy: number }[], kind: TowerKind): number {
    return this.batchPlacement(() => {
      const solo = this.rollSoloMod();
      if (solo) {
        const one = this.placeSolo(cells, kind, solo);
        if (one > 0) return one;
      }
      let n = 0;
      for (const c of cells) if (this.placeTower(c.gx, c.gy, kind) === "ok") n++;
      return n;
    });
  }

  /** a saved layout, stood back up as one board change — how many stood */
  placeMany(towers: readonly { gx: number; gy: number; kind: TowerKind }[]): number {
    return this.batchPlacement(() => {
      let n = 0;
      for (const t of towers) if (this.placeTower(t.gx, t.gy, t.kind) === "ok") n++;
      return n;
    });
  }

  batchPlacement<T>(fn: () => T): T {
    this.specsHold++;
    try {
      return fn();
    } finally {
      this.specsHold--;
      this.flushSpecs();
    }
  }

  /**
   * ONE ORDINARY TURRET. THE MOD ROLL HAPPENS HERE (mods.ts): one
   * independent roll per mod the run owns, so a card that puts
   * down thirty-six turrets rolls thirty-six times and the patch comes
   * out speckled rather than uniform.
   *
   * None of the attributes it can roll changes the footprint — the one
   * that does is rolled once per CARD and lands through placeSolo — so
   * the ground is tested at the kind's own size.
   */
  placeTower(gx: number, gy: number, kind: TowerKind): PlaceResult {
    const sz = structStats(kind).size;
    if (!this.canPlace(gx, gy, kind, sz)) return "invalid";
    this.addTower(gx, gy, kind, sz, this.charging ? rollTurretMods(this.mods, kind) : 0);
    return "ok";
  }

  /**
   * DOES THIS CARD COME OUT AS ONE BUILDING INSTEAD? — the once-per-card
   * roll (mods.ts rollSolo), asked by Game.placeFormation before a single
   * footprint is laid. Null is the ordinary case.
   */
  rollSoloMod(): ModId | null {
    return this.charging ? rollSolo(this.mods) : null;
  }

  /**
   * THE CARD SPENT ON ONE BUILDING: a GIANT, at the middle of where the
   * shape was going to go, on twice its kind's ground.
   *
   * `cells` is the ghost the player was aiming — the whole shape — and
   * the giant is centred on its bounding box, so the building lands where
   * the patch was going to be rather than at some corner of it. The
   * attributes it rolls are the ordinary ones on top of the solo one: a
   * giant is still a turret and still rolls like one.
   *
   * IT RETURNS 0 RATHER THAN FORCING ITSELF ON. A giant is four times the
   * area of the shape's own cells and the ground may simply not have room
   * — in which case the caller lays the ordinary shape down instead, and
   * the card is not wasted on a roll the map could not honour.
   */
  placeSolo(cells: readonly { gx: number; gy: number }[], kind: TowerKind, id: ModId): number {
    if (cells.length === 0) return 0;
    const base = structStats(kind).size;
    const mask = modBit(id) | (this.charging ? rollTurretMods(this.mods, kind) : 0);
    const sz = sizeWithMods(base, mask);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const c of cells) {
      if (c.gx < x0) x0 = c.gx;
      if (c.gy < y0) y0 = c.gy;
      if (c.gx > x1) x1 = c.gx;
      if (c.gy > y1) y1 = c.gy;
    }
    // the shape's own middle, in cells — its far edge is a turret wide
    const cx = (x0 + x1 + base) / 2, cy = (y0 + y1 + base) / 2;
    const gx = clamp(Math.round(cx - sz / 2), 0, COLS - sz);
    const gy = clamp(Math.round(cy - sz / 2), 0, ROWS - sz);
    if (!this.canPlace(gx, gy, kind, sz)) return 0;
    this.addTower(gx, gy, kind, sz, mask);
    return 1;
  }

  /**
   * SPEND, the run's one outgoing. Everything a campaign buys goes through
   * here — which today is one thing, a turret card off the deal (Game
   * .buyTurretCard) — and it refuses rather than overdrawing. A board that
   * is not charged at all (an editor, the sandbox) buys everything for
   * nothing and always succeeds, which is what makes the same button work
   * on both sides of the door.
   */
  spend(amount: number): boolean {
    if (!this.charging) return true;
    // the purse is bottomless, but every other rule of the economy — the
    // affordability checks upstream, the prices on the buttons — reads a
    // real balance, so it is left sitting at RICH_SCRAP rather than
    // special-cased at each till
    if (this.rich) return true;
    const n = Math.max(0, amount);
    if (this.scrap < n) return false;
    this.scrap -= n;
    return true;
  }

  /**
   * Chain building: walk the drag segment a cell at a time, dropping a tower
   * wherever one fits (overlap with the one just placed fails canPlace,
   * which is what spaces the chain). Returns how many towers landed.
   */
  placeLine(x0: number, y0: number, x1: number, y1: number, kind: TowerKind): number {
    return this.batchPlacement(() => this.placeLineInner(x0, y0, x1, y1, kind));
  }

  private placeLineInner(x0: number, y0: number, x1: number, y1: number, kind: TowerKind): number {
    const sz = TOWERS[kind].size;
    const dx = x1 - x0, dy = y1 - y0;
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / CELL));
    let placed = 0, pgx = -1, pgy = -1;
    for (let s = 0; s <= steps; s++) {
      const gx = clamp(Math.round((x0 + (dx * s) / steps) / CELL - sz / 2), 0, COLS - sz);
      const gy = clamp(Math.round((y0 + (dy * s) / steps) / CELL - sz / 2), 0, ROWS - sz);
      if (gx === pgx && gy === pgy) continue;
      pgx = gx;
      pgy = gy;
      if (this.placeTower(gx, gy, kind) === "ok") placed++;
    }
    return placed;
  }

  /**
   * THE RULER (Game's shift-drag while a building is in hand): the line of
   * footprints from where the drag began to where the cursor is, PACKED —
   * each one exactly its own width along from the last, so a run of walls
   * comes out as a wall rather than as a dotted line with the gaps a
   * free-hand drag leaves.
   *
   * THE DIRECTION IS SNAPPED to one of the eight compass headings, in
   * even 45-degree sectors. That is the whole reason a ruler exists: a
   * hand cannot hold a straight line across forty cells, and a wall one
   * cell out of true is a wall with a door in it. The step is taken in
   * CELLS (`sz` of them per building, on each axis the heading uses), so
   * a diagonal run comes out corner to corner rather than overlapping.
   *
   * Returns the cells the line would fill, in order, whether or not
   * anything can be built on them — the ghost draws all of them and colours
   * each by its own canPlace, so the player sees the line they are drawing
   * and where it is refused, not a line with holes already cut out of it.
   */
  rulerCells(x0: number, y0: number, x1: number, y1: number, kind: TowerKind): { gx: number; gy: number }[] {
    return rulerCells(x0, y0, x1, y1, kind);
  }

  /** ...and build it: every cell of the ruler's line that will take one */
  placeRuler(x0: number, y0: number, x1: number, y1: number, kind: TowerKind): number {
    return this.batchPlacement(() => {
      let placed = 0;
      for (const c of this.rulerCells(x0, y0, x1, y1, kind))
        if (this.placeTower(c.gx, c.gy, kind) === "ok") placed++;
      return placed;
    });
  }

  /** the PLAYER's tower whose footprint covers the world point, if any —
   *  what a tap selects and a right-click sells. The swarm's buildings are
   *  not the player's to sell: see enemyTowerAt */
  towerAt(px: number, py: number): Tower | null {
    const t = this.structureAt(px, py);
    // ...AND THE CART IS NOT ONE, however much of a Tower it is in the
    // type system (levels.ts CONVOY_HP). This is what a tap picks and what
    // a right-click SELLS, and a hauler the player could sell is a mission
    // the player can end by clicking on it. It holds no ground to give
    // back and is in none of the lists a sale walks, so the sale would
    // also be quietly corrupt — but the reason it is refused is the first
    // one.
    return t && !isCore(t) && !this.isConvoy(t) ? t : null;
  }


  /**
   * A structure's footprint on the two GROUND-BOUND fields — the walkers'
   * and the naval tanks', which stand on the same rock and are stopped by
   * the same buildings. Rock is already a wall and stays one whichever way
   * this goes; OPEN GROUND under a structure becomes a wall while it stands
   * (`on`) and opens again when it comes down. THE MASK CHANGES NOW —
   * every wall test, canPlace and the shove out of a new footprint read it
   * this instant — while the ROUTES over it are re-solved when the board
   * settles (fieldDirty, solveDirtyFields), which is what keeps a build
   * drag to one solve instead of one a turret.
   *
   * A structure never stands on deep water (canPlace), so writing the same
   * cells into both fields cannot disagree with either mask.
   */
  private claimGround(t: Structure, on: boolean): void {
    // EVERY structure that appears or leaves comes through here, which is
    // what makes this the one place the aim index has to be told
    // (indexStructure). Told whatever the masks below decide: a footprint
    // laid entirely on cells the terrain already called rock changes no
    // mask and is still a thing that can be shot at.
    this.indexStructure(t, on);
    const { blocked } = this.terrain;
    const { walk, soft } = this.field;
    const nWalk = this.navalField.walk, nSoft = this.navalField.soft;
    const sz = this.sizeOf(t);
    let changed = false;
    for (let y = t.gy; y < t.gy + sz; y++)
      for (let x = t.gx; x < t.gx + sz; x++) {
        const i = y * COLS + x;
        this.cellTower[i] = on ? t : null;
        // ...and its shadow on the shared grid, written in the same breath so
        // the two cannot come apart (see `occupied`)
        this.occupied[i] = on ? 1 : 0;
        if (blocked[i]) continue;
        // solid to the body, soft to the path: the swarm may route
        // through it, and shoots it when it gets there
        walk[i] = on ? 1 : 0;
        soft[i] = on ? 1 : 0;
        nWalk[i] = walk[i];
        nSoft[i] = soft[i];
        changed = true;
      }
    if (changed) {
      // A SOLVE IN FLIGHT IS LEFT TO FINISH. It is solving the board as it
      // was a moment ago, and a route a moment out of date is worth far
      // more than the nothing that killing it buys — see abortSolves for
      // what dropping it did to a busy board. The flags below queue the
      // clean one behind it, once the board holds still
      this.fieldDirty = true;
      this.navalDirty = true;
      this.unstickPending = true;
      // the board moved, so the settle clock starts over — a drag holds it
      // at zero and pays for one solve when it ends (solveDirtyFields)
      this.fieldQuiet = 0;
    }
  }

  /**
   * A REMOVAL ORDER ON AN INFECTED TURRET, answered as the DEATH it is
   * (Mech Virus, mutation.ts) — the virus jumps, Salvage Insurance and
   * Last Volley fire, and under Conquest the swarm takes the wreck. There
   * is no refund and no demolish puff: nothing was sold.
   *
   * THE STAND-UP CHARGES ARE NOT ASKED. A revive REFUSES a death, and an
   * order the player gave has to be carried out — an Undying board whose
   * sell key did nothing would be a board that cannot be rearranged.
   *
   * Returns true when it took the building; false leaves it to the
   * ordinary sale.
   */
  private wreckIfInfected(t: Tower): boolean {
    if (!t.virus) return false;
    this.pushFx(t.x, t.y, 0.5, FxKind.Breach);
    this.payOutTower(t);
    this.spreadVirusFrom(t);
    if (this.conquestOn) this.conquerTower(t);
    else this.removeTower(t);
    return true;
  }

  /** take a structure off the board — sold or wrecked, the ground is the swarm's again */
  private removeTower(t: Tower): void {
    const at = this.towers.indexOf(t);
    if (at < 0) return;
    this.towers.splice(at, 1);
    if (t.team === "enemy") this.enemyTowers--;
    // the selection holds buildings by reference: a demolished one has to
    // leave it here, or its ring would keep being drawn over bare ground
    this.selStructs.delete(t);
    this.claimGround(t, false);
    // owed, not done: a sale is one call and pays at the step's end like a
    // death does — see oweCount for why a death may not pay here
    this.oweCount(t.kind);
  }

  /**
   * Chain demolition, the mirror of placeLine: walk the drag segment a cell
   * at a time and pull down every tower it crosses. Sampling at most one
   * cell apart means a fast drag cannot skip over a footprint, and
   * sellTowerAt is a no-op on bare rock, so overlapping samples are free.
   * Returns how many towers came down.
   */
  sellLine(x0: number, y0: number, x1: number, y1: number): number {
    // one board change, one spec refresh — the same batching a multi-cell
    // placement gets (batchPlacement), for the same reason
    return this.batchPlacement(() => {
      const dx = x1 - x0, dy = y1 - y0;
      const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / CELL));
      let sold = 0;
      for (let s = 0; s <= steps; s++) {
        if (this.sellTowerAt(x0 + (dx * s) / steps, y0 + (dy * s) / steps)) sold++;
      }
      return sold;
    });
  }

  /** remove the tower whose footprint covers the world point, if any */
  sellTowerAt(px: number, py: number): boolean {
    const t = this.towerAt(px, py);
    if (!t) return false;
    // AN INFECTED TURRET CANNOT BE SOLD, ONLY LOST (mutation.ts): the
    // order goes through as a DEATH, so the virus jumps, the payout
    // relics fire, and under Conquest the swarm takes the wreck. Isolating
    // the thing and leaving it nowhere to jump is the counter; deleting
    // it with a click would be the answer to the puzzle
    if (this.wreckIfInfected(t)) return true;
    this.removeTower(t);
    // nothing back (SELL_REFUND is 0, economy.ts): a placed turret is
    // spent, and demolishing it only clears the ground. The dial stays
    // wired so a refund can be tried again from one number
    if (this.charging) this.scrap += sellValue(t.kind);
    this.pushFx(t.x, t.y, 0.35, FxKind.Death); // demolish puff
    return true;
  }

  /** sell every selected building — the delete key over a gathered row */
  sellSelected(): number {
    return this.batchPlacement(() => {
      let k = 0;
      for (const st of [...this.selStructs]) {
        if (isCore(st)) continue;
        // ...the infected ones are lost rather than sold, exactly as they
        // are under a single click (see sellTowerAt)
        if (this.wreckIfInfected(st)) {
          k++;
          continue;
        }
        if (this.charging) this.scrap += sellValue(st.kind);
        this.pushFx(st.x, st.y, 0.35, FxKind.Death);
        this.removeTower(st);
        k++;
      }
      return k;
    });
  }

  /**
   * THE GATHERED ROW, PICKED UP AND SET DOWN dgx/dgy CELLS AWAY. All of it
   * or none: a group that only half fits is a formation nobody drew.
   *
   * IT IS THE SAME BUILDINGS, not copies — a sale and a rebuild would
   * reroll their attributes and hand back a full pool. The core is skipped
   * rather than refused: it does not move, and a marquee that caught it
   * should still move the turrets around it.
   */
  moveSelected(dgx: number, dgy: number): number {
    const moving: Tower[] = [];
    for (const st of this.selStructs) {
      if (isCore(st) || st.team !== "player" || this.isConvoy(st)) continue;
      // one that came down since the drag began is not ours to move
      if (this.cellTower[st.gy * COLS + st.gx] !== st) continue;
      moving.push(st);
    }
    if (moving.length === 0) return 0;
    if (!canMoveOn(this.boardGrids(), this, this.shieldTowers, SHIELD_TOWER_SIZE, moving, dgx, dgy))
      return 0;
    return this.batchPlacement(() => {
      // every footprint is let go of before any is claimed: claimGround
      // files a building in the aim index at the position it reads off it,
      // so a row sliding over its own cells would unfile itself
      for (const t of moving) this.claimGround(t, false);
      for (const t of moving) {
        t.gx += dgx;
        t.gy += dgy;
        t.x = (t.gx + t.size / 2) * CELL;
        t.y = (t.gy + t.size / 2) * CELL;
        // Hydrophobic is a fact about the ground it stands on, so a turret
        // that moved off the shore is dry and one that moved onto it is not
        t.fireRate = this.isWaterlogged(t.gx, t.gy, t.kind, t.size) ? HYDROPHOBIC_RATE : 1;
        this.claimGround(t, true);
      }
      return moving.length;
    });
  }

  // ---------- spawning ----------

  /**
   * A spawn spot is free if no unit from last frame's hash sits on it —
   * keeps the spawn strip from overcrowding, so separation never
   * slingshots units forward.
   */
  private spawnSpotFree(x: number, y: number, r: number, fly: boolean, span: number): boolean {
    const f = fly ? 1 : 0;
    const hx = clamp((x / HC) | 0, 0, HCOLS - 1);
    const hy = clamp((y / HC) | 0, 0, HROWS - 1);
    const gx0 = Math.max(0, hx - span), gx1 = Math.min(HCOLS - 1, hx + span);
    for (let gy = Math.max(0, hy - span); gy <= Math.min(HROWS - 1, hy + span); gy++) {
      const row = gy * HCOLS;
      const e = this.bStart[row + gx1 + 1];
      const e0 = this.bStart[row + gx0];
      this.probes += e - e0;
      for (let k = e0; k < e; k++) {
        const i = this.bUnits[k];
        if (i >= this.n || this.ufly[i] !== f) continue;
        // free means the physics circles wouldn't touch, so a fresh
        // spawn never starts mid-shove; only the same layer counts —
        // air and ground never collide
        const dx = this.upx[i] - x, dy = this.upy[i] - y;
        const d2 = dx * dx + dy * dy;
        // the arrival is a circle at its outer radius (see spawnUnit) and
        // the body already standing there is whatever shape it is, facing
        // wherever it is facing
        const rs = (r + this.hitR(i, dx, dy, d2)) * PHYS_R;
        if (d2 < rs * rs) return false;
      }
    }
    return true;
  }

  /**
   * THE SPAWN TILES ONE MOVEMENT LAYER ENTERS ON — a plain array, picked
   * from at random, and the whole of what a spawn costs to place.
   *
   * Every list here is BUILT WHEN THE MAP OR THE ROUTES CHANGE and read
   * straight: no filtering, no allocation, no scan of the map per body. A
   * map with two thousand painted tiles and a script sending five thousand
   * units therefore pays for two thousand cells once per re-route and one
   * array index per arrival (see spawnUnit).
   *
   *  - AIR: its own tiles, narrowed to the ones the air field has a
   *    heading at, with the unnarrowed list as the fallback.
   *  - WATER: the wet tiles the naval field accepted, else the dry ones it
   *    accepted, else the walkers' — a hull is amphibious, so the last
   *    fallback is a real door and not a compromise.
   *  - GROUND: the walkers' field's own, which is the mask already
   *    filtered for passability and for reaching an exit.
   *
   * A boss has no special door any more: the boss zone went with the other
   * three kinds, so a boss comes in on its layer's tiles like every other
   * body. Hold one back by painting its tiles somewhere only it can use.
   */
  private spawnPads(layer: MoveLayer): number[] {
    if (layer === "air") return this.airOpen.length > 0 ? this.airOpen : this.airPads;
    if (layer === "water") {
      const wet = this.waterPads();
      if (wet.length > 0) return wet;
      return this.navalField.spawnPts.length > 0 ? this.navalField.spawnPts : this.field.spawnPts;
    }
    return this.field.spawnPts;
  }

  /**
   * Put one unit on the board, at a door or — under MITOSIS (mutation.ts)
   * — around a point on the field.
   *
   * `brood` is the ONE thing that changes, and it changes three lines:
   * where the candidate spots come from, how many are tried, and whether
   * the arrival is invincible. Everything under those lines is the same
   * unit-building code the wave script runs, ON PURPOSE — a brood body
   * carries the level's health curve, the run's Armored plating, the run's
   * Speedy doubling and, above all, its own roll of THE HUNGRY APPETITE.
   * One body in twenty walks in hungry whatever put it on the field
   * (HUNGRY_CHANCE): the rule is about the swarm, not about the door it
   * came through, so a rule that spawns bodies feeds that one too, and a
   * second construction path here is how those two rules would quietly
   * stop composing.
   */
  private spawnUnit(
    kind: UnitKind,
    brood?: { x: number; y: number; exact?: boolean },
    wave = this.wavesStarted,
  ): boolean {
    const stats = UNIT_STATS[kind];
    const fly = !!stats.flying;
    const layer = this.layerOf(kind);
    const pads = brood ? EMPTY_PADS : this.spawnPads(layer);
    if (this.n >= MAX_UNITS || (!brood && pads.length === 0)) return false;
    // THE ARRIVAL IS TESTED ROUND, at the body's OUTER radius: a spot a
    // long body fits in nose-first it might not fit in broadside, and a
    // fresh body has not picked a heading yet. Costing the widest case is
    // a spawn or two rejected on a crowded pad, which the retry loop below
    // already handles; the alternative is a champion landing inside a wall
    // the moment it turns
    const r = HB_OUTER[UNIT_ID[kind]];
    // the drop-zone test is the same broad-phase query the physics pass
    // runs, so it needs the same reach: a ring of 1 would let two champions
    // land inside one another and start the wave already shoving
    const span = kindSpan(UNIT_ID[kind], fly);
    const tries = brood ? MITOSIS_TRIES : 8;
    for (let a = 0; a < tries; a++) {
      let x: number, y: number;
      if (brood?.exact) {
        // EXACTLY HERE, and none of the tests below. It is what the
        // crossers use (launchCrosser): a Borer's pieces are laid on a
        // road at fixed intervals, and a spot moved a few px to miss a
        // rock would put a car through the side of the one in front. A
        // crosser walks through rock anyway (updateCrosser), so there is
        // nothing for the wall test to protect it from.
        x = brood.x;
        y = brood.y;
      } else if (brood) {
        // a ring around the body, clamped inside the world — the wall and
        // crowding tests below are the same ones a door spot has to pass,
        // so a brood never lands in rock or aground on a shoreline
        const ang = Math.random() * Math.PI * 2;
        const d = Math.random() * MITOSIS_SPREAD;
        x = clamp(brood.x + Math.cos(ang) * d, r, W - r);
        y = clamp(brood.y + Math.sin(ang) * d, r, H - r);
      } else {
        const ci = pads[(Math.random() * pads.length) | 0];
        // jitter within the pad, but keep the hitbox inside the cell when it
        // fits (an ironhide2 is wider than a tile — it spawns pad-centered)
        const j = Math.max(0, CELL / 2 - r - 1);
        x = ((ci % COLS) + 0.5) * CELL + (Math.random() * 2 - 1) * j;
        y = (((ci / COLS) | 0) + 0.5) * CELL + (Math.random() * 2 - 1) * j;
      }
      // a big hitbox can overhang the pad into ragged rock beside it, so
      // the arrival is tested against the mover's OWN field: for a naval
      // tank that is the one with the deep water open, which is what lets
      // it land half in a channel and half on its bank
      const wallField = layer === "water" ? this.navalField : this.field;
      if (
        !brood?.exact &&
        ((!fly && wallField.hitsWall(x, y, WALL_R)) || !this.spawnSpotFree(x, y, r, fly, span))
      )
        continue;
      const i = this.n++;
      // LEVEL SCALING: health rides the level curve, and the rung adds a
      // flat armour bonus and a shield multiplier below (both from RUNGS,
      // both piecewise per rung rather than per level). Speed, hitbox and
      // drop stay exactly where UNIT_STATS put them however high the rung
      // climbs
      const hp = this.baseHpOf(kind);
      this.upx[i] = x;
      this.upy[i] = y;
      this.uvx[i] = 0;
      this.uvy[i] = 0;
      this.uaimx[i] = 0;
      this.uaimy[i] = 0;
      this.uhp[i] = hp;
      this.uhpmax[i] = hp;
      // SPEEDY (mutation.ts) is a stat, not a status: the doubling lands
      // here, once, so every reader of uspd — the drive, the chassis turn
      // rate, the leg cycle — is already looking at the speed this unit
      // actually travels at
      this.uspd[i] = stats.speed * (this.speedyOn ? SPEEDY_SPEED : 1);
      // ...but what it CARRIES is the equal-area circle (hitbox.ts
      // HB_MEAN): urad is the body's nominal size — its mass, its splash
      // and aura reach, its halo — and a stretched body is no heavier than
      // the round one with the same area. The DIRECTIONAL radius every hit
      // test actually uses is Sim.hitR, off the two semi-axes
      this.urad[i] = HB_MEAN[UNIT_ID[kind]];
      // the core, resolved once here rather than per tick: it is where the
      // air field aims (coreGoal) and where a flyer with no field under it
      // steers by hand (airHeading)
      if (fly) {
        // the swarm's flyer aims at the core; the player's aims at nothing
        // — it hovers where it was made until it is sent somewhere
        const g = this.nearestGoal(x, y);
        this.ugx[i] = g.x;
        this.ugy[i] = g.y;
      }
      // ...plus ARMORED SWARMS' plating on the light bodies (mutation.ts —
      // the heavies never take it): baked into uarmor here so every armour
      // read downstream — the piercer's x4 included — sees it
      this.uarmor[i] =
        stats.armor +
        (this.armoredOn && stats.tier <= ARMORED_MAX_TIER ? ARMORED_ARMOR : 0);
      // ForceFieldAbility.created: a carrier walks in with the bubble
      // already full, so the first tower to see one meets a whole pool of
      // shield rather than a field still charging up. The pool carries the
      // run's shield multiplier (this.shieldScale — Overshields, or 1), and
      // so does every other read of a shield spec's max/amount/regen
      // (updateAbilities), or the spawn bonus could never refill
      this.ushield[i] = stats.forceField ? stats.forceField.max * this.shieldScale : 0;
      this.ushieldAlpha[i] = 0;
      this.uforceScale[i] = 0;
      this.uforceDown[i] = 0;
      // a fresh support unit waits a full cycle before its first pulse,
      // exactly like a newly constructed Ability's zeroed timer
      this.uability[i] = 0;
      this.upullx[i] = 0;
      this.upully[i] = 0;
      // THE ARRIVAL CLOCK IS A DOOR RULE, so a brood does not get one: the
      // invincibility is there to stop a drop zone being camped, and a body
      // that broke out of another body in the middle of the kill zone is
      // already past every door on the map. Twelve untouchable runts a
      // ironhide5 would be a gift rather than a mutator — a brood is killable
      // the instant it lands, by the same splash that killed its parent
      this.uspawn[i] = brood ? 0 : SPAWN_INVINCIBLE;
      this.uburn[i] = 0;
      this.uburnT[i] = 0;
      this.upoison[i] = 0;
      this.upoisonT[i] = 0;
      this.usoak[i] = 0;
      this.uwet[i] = 0;
      this.uwetSlow[i] = 1;
      // a body walks in unstamped: the ironhide5's plating and the dartback3's
      // pace are both things it has to be standing near something to have
      this.uarmorAdd[i] = 0;
      this.uarmorT[i] = 0;
      this.uhasteMul[i] = 1;
      this.uhasteT[i] = 0;
      this.ubowT[i] = 0;
      this.uage[i] = 0;
      this.uvet[i] = 1;
      this.udrillMul[i] = 1;
      this.udrillT[i] = 0;
      this.ureachMul[i] = 1;
      this.ureachT[i] = 0;
      this.ublinkCd[i] = 0;
      // THE STARBURST (levels.ts, the Grapnels): a grapnel walks in able
      // to answer the first hit that lands on it, and somewhere inside the
      // fold period rather than at the start of one — a wave that all
      // reached for a partner on the same frame would collapse into a
      // handful of bodies in one visible step, and pay for the search in
      // one visible spike
      this.ustarCd[i] = 0;
      this.ufoldT[i] = Math.random() * GRAPNEL_MERGE_PERIOD;
      // a cloaking kind walks in visible and hides for the first time a
      // full period in — a door that spat out ghosts would be a door with
      // no answer
      this.ucloakT[i] = 0;
      this.ucloakCd[i] = stats.cloak ? stats.cloak.period : 0;
      // AMPHIBIOUS (mutation.ts): every body walks in dry and unstacked,
      // whatever ground it happens to have been dropped onto — a drop zone
      // is not a crossing, and crediting one would hand the bonus out for
      // free to whichever zones a map happens to have painted on wet ground
      this.uwade[i] = 0;
      this.uwet01[i] =
        this.amphibiousOn && layer === "ground" ? this.inWater(x, y) : 0;
      // THE HUNGRY ROLL (the Hungry mutator) — the only place the status is
      // ever applied. One body in twenty walks in with an appetite, whatever
      // kind it is: the mutation is a rule about the SWARM, so exempting
      // the kinds it would be inconvenient on would just be authoring a
      // second wave script nobody can read. Its clock starts full, so the
      // first meal is a second after it lands rather than the instant it
      // does
      this.uhungry[i] = this.hungryOn && Math.random() < HUNGRY_CHANCE ? 1 : 0;
      // MECH VIRUS (mutation.ts): the other elite mark, rolled the same
      // way and on the same line — one body in a hundred walks in with a
      // building-killer in it, and nothing about it shows until it dies
      this.uvirus[i] = this.virusOn && Math.random() < VIRUS_CHANCE ? 1 : 0;
      // ...and nothing is under anyone's order until a leader stamps it
      this.uled[i] = 0;
      // ...and the one thing a brood body carries that a door body does
      // not: the mark that says it may not brood in its turn (see ubrood)
      this.ubrood[i] = brood ? 1 : 0;
      // ...and a fresh body has not yet had its one stand-up
      // (Reconstruction): updateCorpses marks the ones that have
      this.urisen[i] = 0;
      this.ueaten[i] = 0;
      this.uhungerT[i] = HUNGRY_PERIOD;
      // ...and every body walks in standing for itself alone, with no
      // squeeze on its clock (mergeSqueezed)
      this.ustack[i] = 1;
      this.usqzT[i] = 0;
      this.usqzJ[i] = -1;
      this.usqzU[i] = -1;
      this.usqzD[i] = 0;
      this.ucellT[i] = -1;
      this.utcell[i] = -1;
      this.uinview[i] = 0;
      // ...and nothing walks a road unless the mission puts it on one
      // (launchCrosser writes these two straight after the spawn)
      this.ucross[i] = -1;
      this.ucrossS[i] = 0;
      this.ufix[i] = 0;
      // ...nor holds a post unless the mission gives it one (garrisonUnit
      // and plantUnit write these four straight after the spawn)
      this.ugar[i] = 0;
      this.ugarx[i] = 0;
      this.ugary[i] = 0;
      this.ugarr[i] = 0;
      this.uid[i] = this.nextId++;
      this.ukind[i] = UNIT_ID[kind];
      this.ufly[i] = fly ? 1 : 0;
      this.unav[i] = layer === "water" ? 1 : 0;
      this.uheavy[i] = HB_HEAVY[UNIT_ID[kind]];
      // the guns arrive at a random point in their reload, so a wave does
      // not open fire in one volley; the target search is staggered too
      this.utgt[i] = null;
      this.utT[i] = Math.random() * 0.4;
      this.ubeamT[i] = 0;
      this.ucharge[i] = 0;
      this.uheldRot[i] = 0;
      const ws = UNIT_WEAPONS[kind];
      for (let w = 0; w < MAX_WEAPONS; w++)
        this.ucd[i * MAX_WEAPONS + w] = w < ws.length ? Math.random() * ws[w].reload : 0;
      // start already off-line, drawn from the bias's own resting spread —
      // a wave that all began dead centre would need seconds to fan out
      this.ulat[i] = clamp((Math.random() * 2 - 1) * LAT_SIGMA * 1.7, -1, 1);
      // face the way it will walk, with legs mid-cycle at a random phase so
      // a wave doesn't march in lockstep
      const a0 = fly ? Math.atan2(this.goalY - y, this.goalX - x) : 0;
      this.uwalk[i] = Math.random() * 100;
      this.ubrot[i] = a0;
      this.urot[i] = a0;
      if (stats.legs) this.resetLegs(i, stats.legs);
      if (stats.segments) this.resetSegments(i, stats.segments);
      // a hull arrives with no wake at all: one point under it, and the
      // trail grows out behind as it sails. Mindustry's Trail.clear on add
      // does the same thing, and it is what stops a fresh boat from being
      // drawn with a stripe running back to wherever the last one died
      if (stats.wake) {
        this.uwakeX[i * WAKE_PTS] = x;
        this.uwakeY[i * WAKE_PTS] = y;
        this.uwakeN[i] = 1;
        this.uwakeT[i] = KIND_WAKE_DT[UNIT_ID[kind]];
      }
      // Call.spawnEffect: the entrance, drawn in the arriving unit's own
      // sprite and on the heading it will be drawn at. Fx.spawn is NOT
      // fired here — Mindustry runs it 30 ticks behind, which updateStatus
      // does when the unmoving half of the clock runs out
      this.pushSpawnFx(x, y, a0, UNIT_ID[kind]);
      this.aliveByKind[UNIT_ID[kind]]++;
      this.uwave[i] = wave;
      this.waveSpawned[wave] = (this.waveSpawned[wave] ?? 0) + 1;
      return true;
    }
    return false;
  }

  /**
   * The support line's Ability.update, 1:1 with RepairFieldAbility,
   * ShieldRegenFieldAbility and ForceFieldAbility.
   *
   * The first two are pulses: each carrier runs its own timer, and on the
   * tick it reaches `reload` it fires once over everything in range and
   * zeroes the timer (no carry-over, matching `timer = 0f`).
   *
   * Units.nearby's circle test counts the OTHER unit's hitbox — a unit
   * whose edge reaches the field is inside it — so the radius compared
   * against is `range + urad[j]`. A carrier sits inside its own field and
   * mends or shields itself along with everyone else.
   *
   * A force field is not a pulse at all and takes the branch below: it
   * regenerates continuously and its work happens in the projectile pass,
   * where the shots it eats are.
   */
  private updateAbilities(dt: number): void {
    if (!HAS_ABILITIES) return;
    const { upx, upy, uhp, uhpmax, urad, ushield, ushieldAlpha, uability, ukind } = this;
    const { uforceScale, uforceDown } = this;
    // the run's shield multiplier (Overshields, else 1): pool, cap and
    // regen all carry it, so a scaled field breaks later, refills
    // proportionally faster, and is still dark for exactly `cooldown`
    // seconds when it pops
    const ss = this.shieldScale;
    for (let i = 0; i < this.n; i++) {
      const k = ukind[i];
      const force = KIND_FORCE[k];
      if (force) {
        // ForceFieldAbility.update. The break is billed to the pool itself:
        // draining it by one cooldown's worth of regen means the same
        // steady +regen that refills the field is also what times its
        // outage, and the field is dark for exactly `cooldown` seconds
        if (ushield[i] <= 0 && !uforceDown[i]) {
          ushield[i] -= force.cooldown * force.regen * ss;
          // Fx.shieldBreak: the outline snapping outward as it pops, in
          // the unit's shieldColor — the colour of whichever team owns it
          this.pushFxCol(
            upx[i], upy[i], 40 / 60, FxKind.ShieldBreak,
            0, force.radius * uforceScale[i], TEAM_CRUX_RGB,
          );
        }
        uforceDown[i] = ushield[i] <= 0 ? 1 : 0;
        // regen is unconditional, so a pool sitting below zero climbs back
        // through it on its own and the field comes up again
        const fmax = force.max * ss;
        if (ushield[i] < fmax) ushield[i] = Math.min(ushield[i] + force.regen * ss * dt, fmax);
        // Mathf.lerpDelta(radiusScale, 1, 0.06) per tick, compounded over
        // the frame; a broken field has no radius at all
        uforceScale[i] =
          ushield[i] > 0
            ? uforceScale[i] + (1 - uforceScale[i]) * (1 - keepOver(1 - 0.06, dt * 60))
            : 0;
        // ...AND IT FALLS THROUGH, because a bubble is no longer the last
        // word on what a body carries. The Tuskers (levels.ts) wear a
        // force field AND a shield field: the bubble is the carrier's own
        // and the bar is what it hands the herd walking behind it. The
        // pulse below is skipped anyway for a kind that has nothing else,
        // so a starhart3 costs exactly what it did
      }
      const repair = KIND_REPAIR[k];
      const shield = KIND_SHIELD[k];
      const energy = KIND_ENERGY[k];
      // THE TWO STAMPS (levels.ts armorField / hasteField). They ride the
      // same clock and the same one search as the healers above, because
      // they are the same shape of thing: a carrier, a radius, a reload.
      // What they write is a timer rather than a pool
      const armorF = KIND_ARMOR_F[k];
      const hasteF = KIND_HASTE_F[k];
      // ...and the sky's and the sea's (levels.ts jamField / wakeField)
      const jamF = KIND_JAM_F[k];
      const wakeF = KIND_WAKE_F[k];
      const spotF = KIND_SPOTTER_F[k];
      const drillF = KIND_DRILL_F[k];
      if (!repair && !shield && !energy && !armorF && !hasteF && !jamF && !wakeF && !spotF && !drillF) continue;
      const spec = (repair ?? shield ?? energy ?? armorF ?? hasteF ?? jamF ?? wakeF ?? spotF ?? drillF)!;
      const reload = spec.reload;
      uability[i] += dt;
      if (uability[i] < reload) continue;
      uability[i] = 0;

      const range = spec.range;
      // THE JAM lands on BUILDINGS, not bodies: one structure search per
      // pulse, a timer and a rate written onto each. It rides the same
      // clock as the rest and shares a ring with them below
      if (jamF) {
        const hit = this.structuresWithin(upx[i], upy[i], jamF.range, this.splashOut);
        for (let q = 0; q < hit.length; q++) {
          const t = hit[q];
          if (isCore(t)) continue;
          if (t.jamT <= 0 || jamF.rate < t.jamRate) t.jamRate = jamF.rate;
          t.jamT = reload + AURA_LINGER;
        }
        if (hit.length > 0)
          this.pushFxCol(upx[i], upy[i], 22 / 60, FxKind.ShieldWave, 0, jamF.range, PAL.bomber);
        if (!repair && !shield && !energy && !armorF && !hasteF && !wakeF && !spotF && !drillF) continue;
      }
      // EnergyFieldAbility.maxTargets: how many units one zap may still
      // reach. Upstream sorts the candidates by distance and takes the
      // nearest few; this walks the hash in bucket order and stops when
      // the budget runs out, which changes WHICH units a crowded field
      // picks and nothing else (see EnergyFieldSpec)
      let budget = energy ? energy.maxTargets : 0;
      // RepairFieldAbility.wasHealed / ShieldRegenFieldAbility.applied: the
      // carrier's wave only plays when the pulse actually did something
      let did = false;
      const pad = range + Math.max(this.rmaxAliveGround, this.rmaxAliveAir);
      const hx0 = clamp(((upx[i] - pad) / HC) | 0, 0, HCOLS - 1);
      const hy0 = clamp(((upy[i] - pad) / HC) | 0, 0, HROWS - 1);
      const hx1 = clamp(((upx[i] + pad) / HC) | 0, 0, HCOLS - 1);
      const hy1 = clamp(((upy[i] + pad) / HC) | 0, 0, HROWS - 1);
      for (let hy = hy0; hy <= hy1; hy++) {
        const row = hy * HCOLS;
        const e = this.bStart[row + hx1 + 1];
        const e0 = this.bStart[row + hx0];
        this.probes += e - e0;
        for (let b = e0; b < e; b++) {
          const j = this.bUnits[b];
          if (j >= this.n || uhp[j] <= 0) continue;
          const dx = upx[j] - upx[i], dy = upy[j] - upy[i];
          const d2 = dx * dx + dy * dy;
          const rr = range + this.hitR(j, dx, dy, d2);
          if (d2 > rr * rr) continue;
          if (repair && uhp[j] < uhpmax[j]) {
            // Unit.heal clamps at max health
            uhp[j] = Math.min(uhp[j] + repair.amount, uhpmax[j]);
            this.pushFx(upx[j], upy[j], 0.18, FxKind.Heal);
            did = true;
          }
          // THE PLATING STAMP: the stronger of what is already on the body
          // and what this carrier gives, on a clock that outlives the pulse
          // by AURA_LINGER so a body inside the field is buffed
          // continuously rather than flickering off between beats
          if (armorF) {
            if (this.uarmorT[j] <= 0 || armorF.amount > this.uarmorAdd[j])
              this.uarmorAdd[j] = armorF.amount;
            this.uarmorT[j] = reload + AURA_LINGER;
            did = true;
          }
          // ...and the PACE STAMP, the same rule
          if (hasteF) {
            if (this.uhasteT[j] <= 0 || hasteF.mult > this.uhasteMul[j])
              this.uhasteMul[j] = hasteF.mult;
            this.uhasteT[j] = reload + AURA_LINGER;
            did = true;
          }
          // ...and THE BOW WAVE, on hulls and on nothing else: the land tax
          // is lifted while the stamp runs (updateUnits)
          if (wakeF && this.unav[j] !== 0) {
            this.ubowT[j] = reload + AURA_LINGER;
            did = true;
          }
          // THE SPOTTER'S REACH and THE DRILL'S CLOCK (levels.ts), the
          // stamp rule again: the stronger of what is on the body and
          // what this carrier gives, on a clock that outlives the pulse
          if (spotF) {
            if (this.ureachT[j] <= 0 || spotF.mult > this.ureachMul[j]) this.ureachMul[j] = spotF.mult;
            this.ureachT[j] = reload + AURA_LINGER;
            did = true;
          }
          if (drillF && KIND_VET[ukind[j]]) {
            if (this.udrillT[j] <= 0 || drillF.mult > this.udrillMul[j]) this.udrillMul[j] = drillF.mult;
            this.udrillT[j] = reload + AURA_LINGER;
            did = true;
          }
          // A BROKEN FORCE FIELD SERVES ITS OUTAGE. ForceFieldAbility buys
          // its cooldown by driving the pool NEGATIVE (see the branch
          // above), so a pool under zero is a bubble counting itself back
          // up — and a shield pulse landing in it would cut that short by
          // however much the crowd happened to be carrying. Two Tuskers
          // standing together would then hold each other's bubbles up
          // forever, which is the one thing a field that eats bullets
          // outright must not be able to do. The bar is for bodies that
          // have one to fill; a bubble refills itself
          if (shield && ushield[j] >= 0 && ushield[j] < shield.max * ss) {
            ushield[j] = Math.min(ushield[j] + shield.amount * ss, shield.max * ss);
            ushieldAlpha[j] = 1;
            did = true;
          }
          // EnergyFieldAbility: a percentage of the TARGET's own max
          // health, halved for another carrier of the same kind, and only
          // ever spent on something already damaged — upstream's `all`
          // list skips an undamaged ally outright, so a full-health crowd
          // never eats the budget
          if (energy && budget > 0 && uhp[j] < uhpmax[j]) {
            const mult = ukind[j] === k ? energy.sameTypeHealMult : 1;
            uhp[j] = Math.min(
              uhp[j] + (energy.healPercent / 100) * uhpmax[j] * mult,
              uhpmax[j],
            );
            this.pushFx(upx[j], upy[j], 0.18, FxKind.Heal);
            budget--;
            did = true;
          }
        }
      }
      // healWaveDynamic / shieldWave: a 22-tick ring out to the field edge
      // — the shield one in the unit's shieldColor, its own team's colour
      // the pulse's own ring, in the colour of what it did: the healers'
      // green, the shield and plating stamps' crux red, and the venom
      // line's purple for the pace one — one ring, three meanings, and the
      // player learns which is which by what happens next
      if (did)
        this.pushFxCol(
          upx[i], upy[i], 22 / 60,
          repair || energy ? FxKind.HealWave : FxKind.ShieldWave,
          0, range,
          repair || energy ? PAL.heal : hasteF ? PAL.venom : wakeF || spotF || drillF ? PAL.harpoon : TEAM_CRUX_RGB,
        );
    }
  }

  /**
   * StatusEffect.update for the two statuses we carry. Burning ticks
   * damageContinuousPierce every frame — armour-piercing, though a shield
   * still eats it — and flickers Fx.burning at effectChance per tick from a
   * random point inside the unit's hitbox. Wet only runs its clock down
   * (the slow itself is read by updateUnits) and flickers Fx.wet the same
   * way. Walking backwards so a unit that burns to death can be
   * swap-removed without skipping its neighbour.
   */
  private updateStatus(dt: number): void {
    const { uburn, uwet, uhp, uhpmax, upx, upy, urad, uspawn, upoison, usoak } = this;
    this.statusFrame++;
    this.bodyIters += this.n;
    for (let i = this.n - 1; i >= 0; i--) {
      // the arrival clock. Nothing is drawn when it runs out any more:
      // Fx.spawn's accent square used to snap out on the frame `unmoving`
      // expired, and the entrance (Fx.unitSpawn) already says a body
      // arrived — the square on top of it was a second announcement of
      // the same event
      if (uspawn[i] > 0) uspawn[i] = Math.max(0, uspawn[i] - dt);
      // THE TWO STAMPED AURAS running down (constants.ts AURA_LINGER). No
      // effect on the way out: an aura is a thing a body has while it is
      // near the carrier, and a puff announcing that it no longer is would
      // be noise on every body leaving an ironhide5's wake
      if (this.uarmorT[i] > 0 && (this.uarmorT[i] -= dt) <= 0) {
        this.uarmorT[i] = 0;
        this.uarmorAdd[i] = 0;
      }
      if (this.uhasteT[i] > 0 && (this.uhasteT[i] -= dt) <= 0) {
        this.uhasteT[i] = 0;
        this.uhasteMul[i] = 1;
      }
      if (this.ubowT[i] > 0 && (this.ubowT[i] -= dt) <= 0) this.ubowT[i] = 0;
      if (this.ureachT[i] > 0 && (this.ureachT[i] -= dt) <= 0) {
        this.ureachT[i] = 0;
        this.ureachMul[i] = 1;
      }
      if (this.udrillT[i] > 0 && (this.udrillT[i] -= dt) <= 0) {
        this.udrillT[i] = 0;
        this.udrillMul[i] = 1;
      }
      // VETERANCY (levels.ts veteran): the clock, faster under a drill,
      // and what it is worth — read by every weapon the body fires
      // (updateUnitWeapons) and by the inspector's chip
      if (HAS_VET) {
        const vet = KIND_VET[this.ukind[i]];
        if (vet && uspawn[i] <= 0) {
          this.uage[i] += dt * this.udrillMul[i];
          this.uvet[i] = 1 + Math.min(vet.max, this.uage[i] * vet.perSecond);
        }
      }
      if (HAS_BLINK && this.ublinkCd[i] > 0) this.ublinkCd[i] -= dt;
      // THE STARBURST'S clock (levels.ts starburst): seconds until this
      // body may answer a hit with another star. The fold clock is ticked
      // in the fold pass itself, for the reason feedHungry ticks its own
      if (HAS_STARBURST && this.ustarCd[i] > 0) this.ustarCd[i] -= dt;
      // THE CLOAK CYCLE (levels.ts cloak): hidden for `duration`, then
      // seen for the rest of `period`, from the first period in. The
      // flagship's veil hides the bodies round it for the same spell —
      // one hash search each time it goes, which is rare
      if (HAS_CLOAK) {
        const cl = KIND_CLOAK[this.ukind[i]];
        if (cl) {
          if (this.ucloakT[i] > 0) this.ucloakT[i] -= dt;
          else if ((this.ucloakCd[i] -= dt) <= 0) {
            this.ucloakCd[i] = cl.period;
            this.ucloakT[i] = cl.duration;
            if (cl.veil) this.veil(i, cl.veil, cl.duration);
          }
        } else if (this.ucloakT[i] > 0) this.ucloakT[i] -= dt;
      }
      // ...and the ORDER (Leadership, mutation.ts), which is the same
      // shape of thing with nothing but a clock behind it
      if (this.uled[i] > 0 && (this.uled[i] -= dt) <= 0) this.uled[i] = 0;
      if (uwet[i] > 0) {
        uwet[i] -= dt;
        if (uwet[i] <= 0) {
          uwet[i] = 0;
          this.uwetSlow[i] = 1; // dry — never let a slow outlive its status
        } else if (Math.random() < WET_FX_CHANCE * dt) {
          // the same random-point-in-the-disc draw burning's flicker uses
          const a = Math.random() * Math.PI * 2;
          const r = (Math.random() * 2 - 1) * (urad[i] / 2);
          this.pushFx(upx[i] + Math.cos(a) * r, upy[i] + Math.sin(a) * r, 80 / 60, FxKind.Wet);
        }
      }
      // DAMAGE SMOKE: a body under DAMAGE_SMOKE_BELOW of its pool sheds
      // soot, and the lower it gets the thicker it pours — the tint has
      // gone grey (HP_TINT), and this is the other half of "that one is
      // nearly dead". Scaled by the hitbox so a dartback5 smokes like the
      // building it is and an ironhide1 like an ironhide1. pushFx refuses it with
      // effects off (setEffects), which is the whole of that switch — no
      // second gate here
      if (uhp[i] < uhpmax[i] * DAMAGE_SMOKE_BELOW) {
        const hurt = 1 - uhp[i] / (uhpmax[i] * DAMAGE_SMOKE_BELOW); // 0 at the line, 1 at death
        const size = urad[i] / UR;
        if (Math.random() < DAMAGE_SMOKE_RATE * hurt * size * dt) {
          const a = Math.random() * Math.PI * 2;
          const r = (Math.random() * 2 - 1) * (urad[i] / 2);
          this.pushFx(
            upx[i] + Math.cos(a) * r, upy[i] + Math.sin(a) * r,
            DAMAGE_SMOKE_LIFE, FxKind.DamageSmoke, 0, urad[i], (Math.random() * 1e9) | 0,
          );
        }
      }
      // soak never expires, so this is the whole of the water kill: a body
      // whose pool has fallen under what it has taken on simply breaks down
      if (usoak[i] > 0 && uhp[i] < usoak[i]) {
        this.damageUnit(i, uhp[i], true, 1, DMG_NEITHER);
        if (uhp[i] <= 0) {
          this.killUnit(i);
          continue;
        }
      }
      if (upoison[i] > 0) {
        if ((this.upoisonT[i] -= dt) <= 0) {
          upoison[i] = 0;
          this.upoisonT[i] = 0;
        } else {
          this.damageUnit(i, upoison[i] * dt, true, 1, DMG_NEITHER);
          if (uhp[i] <= 0) {
            this.killUnit(i);
            continue;
          }
          if (Math.random() < BURN_FX_CHANCE * dt) {
            const a = Math.random() * Math.PI * 2;
            const r = (Math.random() * 2 - 1) * (urad[i] / 2);
            this.pushFxCol(
              upx[i] + Math.cos(a) * r, upy[i] + Math.sin(a) * r,
              35 / 60, FxKind.Burning, 0, 0, PAL.venom, 0,
            );
          }
        }
      }
      if (uburn[i] <= 0) continue;
      if ((this.uburnT[i] -= dt) <= 0) {
        uburn[i] = 0;
        this.uburnT[i] = 0;
        continue;
      }
      // fire is not a round and never was: a cloak does not put it out
      this.damageUnit(i, FIRE_DPS_PER_STACK * uburn[i] * dt, true, 1, DMG_NEITHER);
      if (uhp[i] <= 0) {
        this.killUnit(i);
        continue;
      }
      // the spread roll is staggered by index so the whole burning crowd
      // never walks the hash on one tick
      if ((this.statusFrame + i) % FIRE_SPREAD_STRIDE === 0 && Math.random() < FIRE_SPREAD_CHANCE)
        this.spreadFire(i);
      // Mathf.chanceDelta: the per-tick chance scaled by the frame's ticks
      if (Math.random() < BURN_FX_CHANCE * dt) {
        // Tmp.v1.rnd(Mathf.range(hitSize / 2)): a random point in the disc
        const a = Math.random() * Math.PI * 2;
        const r = (Math.random() * 2 - 1) * (urad[i] / 2);
        this.pushFx(upx[i] + Math.cos(a) * r, upy[i] + Math.sin(a) * r, 35 / 60, FxKind.Burning);
      }
    }
  }

  /**
   * One stack jumps to a body TOUCHING this one — reservoir pick, one pass.
   * Contact, not a radius: an isolated hull has nothing to give fire to,
   * which is the whole of why fire is a crowd weapon (docs/elements.md).
   */
  private spreadFire(from: number): void {
    const { upx, upy, uhp, urad, ukind, bStart, bUnits } = this;
    const x = upx[from], y = upy[from];
    // the search box has to allow for the BIGGEST body alive reaching in
    const reach = urad[from] + FIRE_SPREAD_GAP + this.rmaxAliveFor(true, true);
    const hx0 = clamp(((x - reach) / HC) | 0, 0, HCOLS - 1);
    const hy0 = clamp(((y - reach) / HC) | 0, 0, HROWS - 1);
    const hx1 = clamp(((x + reach) / HC) | 0, 0, HCOLS - 1);
    const hy1 = clamp(((y + reach) / HC) | 0, 0, HROWS - 1);
    let pick = -1, seen = 0;
    for (let hy = hy0; hy <= hy1; hy++) {
      const row = hy * HCOLS;
      const e = bStart[row + hx1 + 1];
      const e0 = bStart[row + hx0];
      this.probes += e - e0;
      for (let k = e0; k < e; k++) {
        const i = bUnits[k];
        if (i === from || i >= this.n || uhp[i] <= 0) continue;
        if (this.uburn[i] >= FIRE_MAX_STACKS || KIND_BURN_IMMUNE[ukind[i]]) continue;
        const dx = upx[i] - x, dy = upy[i] - y;
        const touch = urad[from] + urad[i] + FIRE_SPREAD_GAP;
        if (dx * dx + dy * dy > touch * touch) continue;
        if (Math.random() * ++seen < 1) pick = i;
      }
    }
    if (pick >= 0) this.applyBurn(pick, 1);
  }

  /**
   * THE HUNGRY MUTATOR — the hungry eat (see mutation.ts for the numbers and
   * for why the rule exists).
   *
   * Every hungry unit runs its own one-second clock. When it comes up, it
   * reaches HUNGRY_REACH for a neighbour and, if one is there, swallows it:
   * the prey leaves the field, the eater takes DOUBLE the prey's full
   * health onto both its current and its maximum pool, and it draws five
   * per cent bigger. Ten meals and it is full.
   *
   * WHAT DOES NOT CROSS OVER IS EVERYTHING ELSE. Shields, force fields,
   * repair and shield auras, burning, wet, armour, speed, layer, kind — a
   * meal moves one number and nothing else, so a hungry ironhide1 that has
   * eaten a starhart3 is a very fat ironhide1 and not a starhart3.
   *
   * THE HITBOX NEVER MOVES EITHER. urad is what the physics pass, the
   * projectile pass and every targeting scan read; growing it would quietly
   * re-tune separation, splash and hit rates against a value the swarm was
   * never balanced for. The swelling is art — the honest statement of it is
   * that the health bar is where the meal actually went.
   *
   * THE CLOCK RESETS WHETHER OR NOT IT FINDS ANYTHING, so a hungry unit
   * walking alone does not bank up an instant meal for the moment it
   * rejoins the crowd: the rule is one attempt a second, not one meal a
   * second held in reserve.
   *
   * ORDER: this runs downward like updateStatus, because eating removes a
   * unit and removal swaps the LAST unit into the freed slot. On a downward
   * scan that slot is always one already visited, so nothing can slip past
   * the pass — and a unit that lands below the cursor and is visited twice
   * cannot eat twice for it, because its clock is reset the moment it is
   * found ready, and the clocks are ticked in the separate pass above
   * rather than here.
   */
  private feedHungry(dt: number): void {
    if (!this.hungryOn) return;
    const { uhungry, ueaten, uhungerT, uhp, uhpmax } = this;
    // pass one: the clocks. Separate from the eating below because that
    // loop can visit a slot twice, and a doubly-ticked clock would feed
    // faster than once a second
    for (let i = 0; i < this.n; i++) if (uhungry[i]) uhungerT[i] -= dt;
    for (let i = this.n - 1; i >= 0; i--) {
      if (!uhungry[i] || uhungerT[i] > 0 || ueaten[i] >= HUNGRY_MAX_MEALS) continue;
      uhungerT[i] = HUNGRY_PERIOD;
      const j = this.preyFor(i);
      if (j < 0) continue;
      const meal = uhpmax[j] * HUNGRY_HP_PER_MEAL;
      uhp[i] += meal;
      uhpmax[i] += meal;
      ueaten[i]++;
      // the meal's own last frame, drawn where it stood and in the hungry
      // colour rather than the kill puff's orange — a devoured unit is not
      // a unit the player killed, and the effect should not claim it was
      this.pushDeathFx(this.upx[j], this.upy[j], HUNGRY_FX_COL);
      // removeUnit keeps the per-kind census itself, exactly as killUnit
      // leaves it to
      // ...booked as every body the meal stood for (ustack): a folded
      // stack eaten whole is that many bodies off the field
      this.devoured += this.ustack[j];
      this.removeUnit(j);
      // NOTHING TO PATCH UP AFTER THE SWAP. Removal moves the LAST unit
      // into the freed slot, and the last slot is always at or above `i` on
      // a downward scan — so the unit that moves is one this pass has
      // already visited, possibly the eater itself. Landing below `i` means
      // it gets visited a second time and no more: its clock was reset the
      // moment it was found ready, so a second visit finds it fed.
    }
  }

  /**
   * A meal for the hungry unit at `i`: a random eligible neighbour within
   * HUNGRY_REACH, or -1.
   *
   * RANDOM, NOT NEAREST. Nearest is what every targeting scan in this file
   * does, and it is wrong here: a pack of hungry units standing in one
   * crowd would all lock onto the same body, and nine of them would find it
   * gone the moment the first one swallowed it. Reservoir sampling over the
   * candidates gives each an even chance and costs one extra random per
   * hit, with no array to build.
   *
   * WHAT IS EDIBLE: anything alive, not already hungry (the rule says so —
   * hungry units do not cannibalise each other, which is what stops the
   * whole wave collapsing into one body), not a boss (a boss is an authored
   * event with its own health bar, not a snack), finished arriving (a unit
   * inside its spawn invincibility is untouchable by every weapon on the
   * map and this is no exception), and on the SAME movement layer — a
   * walker does not pluck a stoop1 out of the sky, and nothing eats a hull
   * off the water it cannot stand on.
   *
   * The broad phase is the frame's own hash, so the stale-index guard is
   * the same one every other scan carries: a slot that has since been
   * recycled is re-tested against the live rows here, so the worst it can
   * do is offer a different but equally valid neighbour.
   */
  private preyFor(i: number): number {
    const { upx, upy, uhp, uhungry, ukind, ufly, unav, uspawn, urad, bStart, bUnits } = this;
    const x = upx[i], y = upy[i];
    const fly = ufly[i], nav = unav[i];
    // the reach is centre-to-EDGE like Units.nearby, so a wide neighbour is
    // in range as soon as its hitbox is
    const pad = HUNGRY_REACH + this.rmaxAliveFor(fly === 1, fly === 0);
    const hx0 = clamp(((x - pad) / HC) | 0, 0, HCOLS - 1);
    const hy0 = clamp(((y - pad) / HC) | 0, 0, HROWS - 1);
    const hx1 = clamp(((x + pad) / HC) | 0, 0, HCOLS - 1);
    const hy1 = clamp(((y + pad) / HC) | 0, 0, HROWS - 1);
    let seen = 0, pick = -1;
    for (let hy = hy0; hy <= hy1; hy++) {
      const row = hy * HCOLS;
      const e = bStart[row + hx1 + 1];
      const e0 = bStart[row + hx0];
      this.probes += e - e0;
      for (let k = e0; k < e; k++) {
        const j = bUnits[k];
        if (j === i || j >= this.n || uhp[j] <= 0) continue;
        if (uhungry[j] || uspawn[j] > 0 || KIND_BOSS[ukind[j]]) continue;
        // ...and a CROSSER is not food, for the boss's reason and one of
        // its own. A Borer is a machine on a road (levels.ts, the worm
        // block), and a meal takes a body off the board whole — so a
        // Hungry run would have the swarm destroying the player's own
        // objective for free, which is a mission met by a die roll
        if (this.ucross[j] >= 0) continue;
        if (ufly[j] !== fly || unav[j] !== nav) continue;
        const dx = upx[j] - x, dy = upy[j] - y;
        const d2 = dx * dx + dy * dy;
        const rr = HUNGRY_REACH + this.hitR(j, dx, dy, d2);
        if (d2 > rr * rr) continue;
        // reservoir sampling: the nth candidate takes the slot 1-in-n of
        // the time, which leaves every candidate equally likely
        if (Math.random() * ++seen < 1) pick = j;
      }
    }
    return pick;
  }

  /**
   * THE SQUEEZE — two bodies of one kind crushed into each other at a
   * choke fold into one (constants.ts MERGE_*).
   *
   * WHY: a choke point packs the swarm into a pile the physics pass can
   * never relax — every body is shoved from every side, so the pairs sit
   * deep inside one another and the pile only grows. This turns the pile
   * back into bodies with room: two of a kind that have spent MERGE_HOLD
   * seconds squeezed closer than MERGE_SQUEEZE of their combined physics
   * radius become ONE body carrying BOTH. Health adds, maximum health
   * adds, the force-field pool adds, and the survivor's weapons hit for
   * the sum (ustack, read by updateUnitWeapons and detonate). It is a fold
   * and not a cull: nothing the wave sent is lost, it is standing in one
   * place instead of two.
   *
   * SAME KIND ONLY — which is also same tier and same layer, because a
   * kind IS a tier (UNIT_STATS.tier). An ironhide1 never folds into an
   * ironhide2, so a stack is always "N of this" and the survivor is
   * exactly what it looks like, only heavier. Bosses never fold (a boss is
   * an authored event with its own bar), nor does a body still inside its
   * arrival clock, and a stack stops at the kind's own ceiling
   * (KIND_MERGE_MAX — MERGE_MAX_STACK for everything but a grapnel, which
   * carries its family's ten) so the rule thins a jam rather than
   * collapsing a whole wave into one ball.
   *
   * WHAT THE LEDGERS SEE: the folded body leaves through removeUnit, so
   * its wave books it down at once; the survivor then counts for ustack
   * kills, drops, explosions or meals when it goes — every tally that
   * decides "is the wave over" and "what did it pay" sees the same N
   * bodies it would have without the rule. `merged` is a report number
   * only and comes off nothing.
   *
   * HOW IT IS FOUND: updatePhysics already visits every overlapping pair,
   * so it notes the deepest same-kind partner on both bodies of any pair
   * squeezed past the line (usqzJ, with its uid in usqzU so a slot
   * recycled between the two passes cannot pass for it). This pass keeps
   * the clock per body: a tick with a partner adds dt, a tick without
   * resets it, and a knock from a shell is over long before MERGE_HOLD
   * runs out. Downward like feedHungry, for the same reason: removal swaps
   * the last row into the freed slot, and on a downward scan that row is
   * one already visited.
   */
  private mergeSqueezed(dt: number): void {
    const { usqzT, usqzJ, usqzU, ustack, ukind, uhp, uhpmax, ushield, uspawn, uid, upx, upy, urad } = this;
    for (let i = this.n - 1; i >= 0; i--) {
      const j = usqzJ[i];
      if (j < 0) {
        usqzT[i] = 0;
        continue;
      }
      if ((usqzT[i] += dt) < MERGE_HOLD) continue;
      // the partner has to still be the body the physics pass saw — alive,
      // the same kind, both arrived, neither a boss, and room in the stack
      // ...and NEVER A CROSSER. Two of a Borer's cars ride a road four px
      // closer than their own hitboxes (levels.ts WORM_SPACING), which is
      // a squeeze by every test here — and a train that folded its own
      // couplings together would be one car of double size, one piece
      // short of the count the mission is keeping, and carrying one of
      // the two arc lengths that used to be two bodies
      if (
        j === i || j >= this.n || uid[j] !== usqzU[i] || ukind[j] !== ukind[i] ||
        uhp[j] <= 0 || uhp[i] <= 0 || uspawn[i] > 0 || uspawn[j] > 0 ||
        KIND_BOSS[ukind[i]] || this.ucross[i] >= 0 || this.ucross[j] >= 0 ||
        ustack[i] + ustack[j] > KIND_MERGE_MAX[ukind[i]]
      ) continue;
      uhp[i] += uhp[j];
      uhpmax[i] += uhpmax[j];
      ushield[i] += ushield[j];
      ustack[i] += ustack[j];
      this.merged++;
      usqzT[i] = 0;
      usqzJ[i] = -1;
      // the fold, drawn as a ring closing on the survivor — the folded
      // body's own last frame would read as a kill nobody scored
      this.pushFxCol(upx[i], upy[i], 22 / 60, FxKind.ShieldWave, 0, urad[i] * 2.5, MERGE_FX_COL);
      this.removeUnit(j);
    }
  }

  /**
   * THE GRAPNELS' FOLD — a grapnel reaches for the nearest grapnel of
   * its own kind and merges with it ON PURPOSE (levels.ts starburst.merge,
   * constants.ts GRAPNEL_*).
   *
   * IT IS THE SQUEEZE WITHOUT THE SQUEEZE. Everything it moves is what
   * mergeSqueezed moves and by the same arithmetic — health, maximum
   * health, the force-field pool and the stack all add, the survivor's
   * stars hit for the sum (ustack, read by throwStar), and the folded body
   * leaves through removeUnit so every ledger books it at once. What is
   * different is the TRIGGER: the squeeze needs a choke to crush two
   * bodies into each other and holds them there for half a second, and
   * this needs neither. A grapnel in open ground, touching nothing, folds
   * with whatever of its kind is within GRAPNEL_MERGE_REACH of it.
   *
   * SO IT IS A CLOCK AND NOT A PILE. One attempt every
   * GRAPNEL_MERGE_PERIOD, never banked (a lone grapnel that walks into a
   * crowd does not get an instant fold owed to it), which is also what
   * keeps the pass cheap: the neighbour search is paid only by the
   * grapnel whose clock came up this tick, and by nothing else on the
   * field at all. The clocks start at a random point in the period, like
   * the guns' reloads do, so a wave that arrived together does not all
   * reach for a partner on the same frame.
   *
   * TEN BODIES AND TEN TIMES THE HEALTH is where it stops (KIND_MERGE_MAX).
   * A fold only ever joins two of ONE KIND, so a stack of ten is exactly
   * ten times what one of them walked in with — which is the ceiling the
   * family is authored to, and it is shared with the squeeze so neither
   * route can be used to get past the other.
   *
   * ORDER: downward, like feedHungry and the squeeze, and for the same
   * reason — removal swaps the LAST row into the freed slot, and on a
   * downward scan that row is one already visited.
   */
  private mergeGrapnel(dt: number): void {
    if (!HAS_STARBURST) return;
    // ...and nothing at all in a wave with no Grapnel in it: the clocks
    // below are a pass over every body on the field, and most waves on
    // most boards are carrying none of these
    let any = false;
    for (const k of STARBURST_KINDS) if (this.aliveByKind[k] > 0) { any = true; break; }
    if (!any) return;
    const { ufoldT, ukind, ustack, uhp, uhpmax, ushield, uspawn, upx, upy, urad } = this;
    // pass one: the clocks, separate from the fold below for feedHungry's
    // reason — that loop can visit a slot twice, and a doubly-ticked clock
    // would fold faster than the period says
    for (let i = 0; i < this.n; i++) if (KIND_STARBURST[ukind[i]]) ufoldT[i] -= dt;
    for (let i = this.n - 1; i >= 0; i--) {
      if (!KIND_STARBURST[ukind[i]] || ufoldT[i] > 0) continue;
      ufoldT[i] = GRAPNEL_MERGE_PERIOD;
      if (uspawn[i] > 0 || uhp[i] <= 0 || ustack[i] >= KIND_MERGE_MAX[ukind[i]]) continue;
      const j = this.foldMateFor(i);
      if (j < 0) continue;
      uhp[i] += uhp[j];
      uhpmax[i] += uhpmax[j];
      ushield[i] += ushield[j];
      ustack[i] += ustack[j];
      this.merged++;
      // the same ring the squeeze closes on its survivor — one rule, one
      // mark, whichever of the two folded these bodies
      this.pushFxCol(upx[i], upy[i], 22 / 60, FxKind.ShieldWave, 0, urad[i] * 2.5, MERGE_FX_COL);
      this.removeUnit(j);
    }
  }

  /**
   * A FOLD PARTNER for the grapnel at `i`: another of its own kind within
   * GRAPNEL_MERGE_REACH that the pair can fit inside the ceiling, or -1.
   *
   * RANDOM, NOT NEAREST, for preyFor's reason: a crowd of grapnels all
   * locking onto the single nearest body would have nine of them find it
   * gone the moment the first one folded it in. Reservoir sampling gives
   * every candidate an even chance for one extra random per hit and builds
   * no array.
   *
   * SAME KIND ONLY, which is also same tier: a runt never folds into a
   * brute, so a stack is always "N of this" and the survivor is exactly
   * what it looks like, only heavier. The reach is centre to EDGE like
   * every other neighbour scan here, so a wide body is in reach as soon as
   * its arms are.
   */
  private foldMateFor(i: number): number {
    const { upx, upy, uhp, ukind, uspawn, ustack, bStart, bUnits } = this;
    const x = upx[i], y = upy[i];
    const kind = ukind[i];
    const room = KIND_MERGE_MAX[kind] - ustack[i];
    const pad = GRAPNEL_MERGE_REACH + this.rmaxAliveFor(false, true);
    const hx0 = clamp(((x - pad) / HC) | 0, 0, HCOLS - 1);
    const hy0 = clamp(((y - pad) / HC) | 0, 0, HROWS - 1);
    const hx1 = clamp(((x + pad) / HC) | 0, 0, HCOLS - 1);
    const hy1 = clamp(((y + pad) / HC) | 0, 0, HROWS - 1);
    let seen = 0, pick = -1;
    for (let hy = hy0; hy <= hy1; hy++) {
      const row = hy * HCOLS;
      const e = bStart[row + hx1 + 1];
      const e0 = bStart[row + hx0];
      this.probes += e - e0;
      for (let k = e0; k < e; k++) {
        const j = bUnits[k];
        // the broad phase is the frame's own hash, so a slot recycled
        // since it was built is re-tested against the live rows here
        if (j === i || j >= this.n || uhp[j] <= 0) continue;
        if (ukind[j] !== kind || uspawn[j] > 0 || ustack[j] > room) continue;
        const dx = upx[j] - x, dy = upy[j] - y;
        const d2 = dx * dx + dy * dy;
        const rr = GRAPNEL_MERGE_REACH + this.hitR(j, dx, dy, d2);
        if (d2 > rr * rr) continue;
        if (Math.random() * ++seen < 1) pick = j;
      }
    }
    return pick;
  }

  /** a tower kill: death puff, removal, and the per-kind drop ledger */
  private killUnit(i: number): void {
    const kind = this.ukind[i];
    const x = this.upx[i], y = this.upy[i];
    // read before the row is recycled under us: a body Mitosis put here
    // does not brood in its turn (see ubrood)
    const wasBrood = this.ubrood[i];
    const wave = this.uwave[i];
    // RECONSTRUCTION (mutation.ts): THE FIRST DEATH IS NOT A DEATH. The
    // body leaves the field at once — off the physics, off the crowd, off
    // the drop zones — and a corpse waits where it fell to put the same
    // body back whole (updateCorpses). Nothing below this line runs for
    // it: no scrap, no kill on the ledger, no Volatile blast and no
    // Mitosis brood, because every one of those answers a death and this
    // is not one yet. A body that has ALREADY risen (urisen) falls
    // straight through, which is what keeps the rule one generation deep
    // however long a wave lasts.
    // ...and a CROSSER never stands back up. Reconstruction puts a body
    // back through spawnUnit (updateCorpses), which knows nothing about
    // roads: what would get up is a Borer's car walking to the core,
    // outside the train it belongs to and outside the count the mission
    // is keeping. The rule is about the swarm, and the swarm is the thing
    // walking at the base
    if (this.reconstructOn && !this.urisen[i] && this.ucross[i] < 0) {
      this.pushDeathFx(x, y);
      this.removeUnit(i);
      // ...and the wave is held open behind it. removeUnit has just booked
      // the body as down (waveDown); un-booking it here is what stops a
      // wave from reading as cleared — and paying out its XP — while
      // something it sent is lying on the floor about to get up
      this.waveDown[wave] = (this.waveDown[wave] ?? 1) - 1;
      this.corpses.push({
        kind, x, y, wave, t: RECONSTRUCT_DELAY, grace: RECONSTRUCT_DELAY + RECONSTRUCT_GRACE,
        // ...and the whole stack lies down with it (mergeSqueezed), or
        // the bodies folded in would leave every ledger through a door
        // that never counted them
        stack: this.ustack[i],
      });
      return;
    }
    // A STACK IS THAT MANY KILLS (mergeSqueezed): every body folded into
    // this one died here, and the ledger, the drop and the HUD's count all
    // see the bodies the wave actually sent
    const stack = this.ustack[i];
    this.killsByKind[kind] += stack;
    // A KILL PAYS NOTHING. The run's whole income is the core's clock
    // (economy.ts coreIncomeRate, runIncome below)
    this.pushDeathFx(x, y);
    // THE DEATH BURST (levels.ts starburst, the Grapnels): A GRAPNEL
    // EMPTIES ITSELF WHEN IT DIES — five stars at once, one down every
    // arm, wherever it fell. It is the loudest thing the family does and
    // it is collected by the BOARD: killing one at reach costs nothing,
    // killing one standing in your own patch is five homing rounds
    // already inside the line.
    //
    // Thrown from here, which is after the RECONSTRUCTION branch above:
    // the first death under that rule is not a death, and a body about to
    // get up whole has not emptied itself of anything. The stars carry
    // the stack (throwStar), so a fold of ten throws a burst worth ten.
    if (HAS_STARBURST && KIND_STARBURST[kind]) this.throwStar(i, 5);
    // CASCADE CHARGES (relics.ts): a T4 or T5 hull comes apart where it
    // falls, for a fifth of its OWN maximum health over six tiles. Read
    // here, while the row is still the dead body's, and set off later —
    // the blast can kill, and a kill is what queues a blast, so doing it
    // in place would be this function recursing into itself in the middle
    // of its own swap-remove (see `cascades`)
    if (this.cascadeOn && KIND_TIER[kind] >= CASCADE_MIN_TIER)
      this.cascades.push({
        x,
        y,
        // the hull's own hitbox widens the reach, exactly as Volatile's does
        r: CASCADE_TILES * CELL + this.urad[i],
        dmg: this.uhpmax[i] * CASCADE_FRACTION,
      });
    // VOLATILE (mutation.ts): the body's parting blast, before the arrays
    // reshuffle under it
    if (this.volatileOn) this.volatileBlast(x, y, this.urad[i], kind);
    // THE PAYLOAD (levels.ts): a bomber shot down goes off where it was
    // shot down, exactly as it would have on arrival
    if (KIND_PAYLOAD[kind]) this.detonate(i);
    // MECH VIRUS (mutation.ts): KILLING THE CARRIER IS WHAT SETS IT OFF.
    // The body has to actually die for it — a carrier Reconstruction is
    // about to revive returned above and still has it, and one that
    // walks off the board was never killed at all, so the thing only ever
    // goes off where the player is fighting
    if (this.uvirus[i]) this.infectNear(x, y, null);
    this.removeUnit(i);
    this.kills += stack;
    // MITOSIS (mutation.ts): what the body breaks into, AFTER the removal
    // rather than before it. Spawning first would append the brood above
    // the dead row and leave removeUnit swapping a live newborn down into
    // it — legal, but it would put brood indices inside the pending-removal
    // lists every caller of killUnit is halfway through. Removing first
    // means the brood only ever lands on slots those lists have already
    // finished with, and a stale index there meets a body with health,
    // which every one of them re-tests for
    // ...and nothing breaks out of a Borer for the same reason (a brood
    // walks; `wasBrood` is already 1 on a crosser, since launchCrosser
    // spawns through the brood door, so this is belt and braces)
    if (this.mitosisOn && !wasBrood) this.splitUnit(x, y, kind, wave);
  }

  /**
   * THE MECH VIRUS LOOKING FOR A HOST (mutation.ts): the nearest turret
   * of the PLAYER's within VIRUS_JUMP_TILES of a point that is not
   * already carrying it, infected — or nothing at all, which is what a
   * player who left a gap has bought.
   *
   * NEAREST, AND NOT THE NEAREST ALREADY ROTTING. "Closest turret in
   * range" with no second thought would have the virus jump back and
   * forth between the same two guns and spread nowhere, so an infected
   * neighbour is skipped and the search goes on past it: what the rule
   * promises is that it moves ON.
   *
   * THE SWARM'S OWN ARE NOT HOSTS. A turret Conquest has taken is the
   * swarm's building, and a weapon the swarm is carrying does not eat it.
   *
   * `from` is the turret handing it on, excluded so a jump is always a
   * move. The walk is over the standing turrets rather than the cell grid
   * because the reach is short and the board's turret list is the shorter
   * of the two on every map that matters.
   */
  private infectNear(x: number, y: number, from: Tower | null): boolean {
    const reach = VIRUS_JUMP_TILES * CELL;
    let best: Tower | null = null;
    let bd = Infinity;
    for (const t of this.towers) {
      if (t === from || t.virus || t.team !== "player" || t.hp <= 0) continue;
      const half = (this.sizeOf(t) * CELL) / 2;
      const dx = t.x - x, dy = t.y - y;
      // centre to the footprint's EDGE, the reach every building test in
      // this file uses: an ironhide3 is in range as soon as its wall is
      const d = Math.sqrt(dx * dx + dy * dy) - half;
      if (d <= reach && d < bd) {
        bd = d;
        best = t;
      }
    }
    if (!best) return false;
    best.virus = true;
    // the jump is drawn as a chain from where it came to what it found —
    // the one moment the rule is visible before a health bar starts
    // falling somewhere new
    this.chainFx(x, y, best, VIRUS_RGB);
    this.pushFxCol(best.x, best.y, 0.5, FxKind.ShieldWave, 0, (best.size * CELL) / 2, VIRUS_RGB);
    return true;
  }

  /**
   * A TURRET THAT IS REALLY GONE HANDS THE VIRUS ON (mutation.ts): to the
   * nearest turret in range of where it stood, and to nothing if there is
   * none — which is the whole counter. Called from every door a turret
   * leaves the player's board by, the sale included, because a sale that
   * quietly deleted the thing would be the answer to the rule's puzzle.
   */
  private spreadVirusFrom(t: Tower): void {
    if (!t.virus) return;
    t.virus = false;
    this.infectNear(t.x, t.y, t);
  }

  /**
   * MITOSIS (mutation.ts): the brood one dead body leaves — MITOSIS_BROOD
   * tier-1 units for its tier, each a random kind off its own movement
   * layer, scattered within MITOSIS_SPREAD of where it fell.
   *
   * IT NEVER RUNS TWICE ON THE SAME LINEAGE. killUnit only calls this for
   * a body that is not itself brood (ubrood), so the rule is exactly ONE
   * generation deep however the table is tuned — the guarantee is a
   * property of the body rather than arithmetic on MITOSIS_BROOD, which
   * leaves that table free to be nothing but a balance dial.
   *
   * A BROOD MEMBER THAT FINDS NOWHERE TO STAND IS SIMPLY NOT BORN. A body
   * dying against rock, on a shoreline or in a crush of its own kin leaves
   * fewer than the table promises — spawnUnit's own wall and crowding
   * tests decide, exactly as they do at a door — and the alternative would
   * be stacking units inside walls to hit a number nobody is counting.
   */
  private splitUnit(x: number, y: number, kind: number, wave: number): void {
    const tier = KIND_TIER[kind];
    const want = tier < MITOSIS_BROOD.length ? MITOSIS_BROOD[tier] : 0;
    if (want <= 0) return;
    // the parent's own layer, so the brood can walk where it landed
    const s = UNIT_STATS[UNIT_KINDS[kind]];
    const pool = MITOSIS_KINDS[s.flying ? "air" : s.naval ? "water" : "ground"];
    // the brood answers for its parent's wave: a wave is not cleared while
    // what its bodies broke into is still walking
    for (let b = 0; b < want; b++)
      this.spawnUnit(UNIT_KINDS[pool[(Math.random() * pool.length) | 0]], { x, y }, wave);
  }

  /**
   * RECONSTRUCTION (mutation.ts): the corpses standing back up.
   *
   * A corpse is off the board while it waits, so this pass is the whole
   * of the rule's cost — a handful of records ticking down, and one
   * spawnUnit each when their clock runs out. The body comes back WHOLE
   * and where it fell, carrying its parent wave so the wave it belonged
   * to is still the wave answering for it, and marked risen (urisen) so
   * its second death is a death like any other.
   *
   * A RISE CAN FAIL, and the grace clock is why this cannot wedge a run.
   * spawnUnit refuses a spot inside rock, off a shoreline or in a crush
   * of the dead body's own kin, exactly as it refuses one at a door; a
   * corpse simply tries again next tick while the crowd moves on. Past
   * RECONSTRUCT_GRACE it is written off and booked as the kill it always
   * was — scrap, ledger and wave — because a body that can never stand up
   * must not hold its wave open forever.
   */
  private updateCorpses(dt: number): void {
    if (this.corpses.length === 0) return;
    for (let c = this.corpses.length - 1; c >= 0; c--) {
      const body = this.corpses[c];
      body.t -= dt;
      body.grace -= dt;
      if (body.t > 0) continue;
      // spawnUnit books the arrival against the wave, and the corpse's
      // removal was un-booked when it fell — so the pair has to net to
      // nothing or the wave would be owed a body twice over
      this.waveSpawned[body.wave] = (this.waveSpawned[body.wave] ?? 1) - 1;
      if (this.spawnUnit(UNIT_KINDS[body.kind], { x: body.x, y: body.y }, body.wave)) {
        const r = this.n - 1;
        this.urisen[r] = 1;
        // a stack revives as the stack it was (mergeSqueezed): the
        // pooled health and the many-bodies mark, as if it had never fallen
        if (body.stack > 1) {
          this.ustack[r] = body.stack;
          this.uhp[r] *= body.stack;
          this.uhpmax[r] *= body.stack;
        }
        // the support line's own green on a BODY: the one thing on the
        // field that says "this did not stay dead"
        this.pushFx(body.x, body.y, 0.5, FxKind.HealWave, 0, this.urad[this.n - 1] * 2.2);
        this.corpses[c] = this.corpses[this.corpses.length - 1];
        this.corpses.pop();
        continue;
      }
      this.waveSpawned[body.wave] = (this.waveSpawned[body.wave] ?? 0) + 1;
      if (body.grace > 0) continue;
      // nowhere to stand, and no more time to wait: it was a kill after all
      this.killsByKind[body.kind] += body.stack;
      this.kills += body.stack;
      this.waveDown[body.wave] = (this.waveDown[body.wave] ?? 0) + 1;
      this.corpses[c] = this.corpses[this.corpses.length - 1];
      this.corpses.pop();
    }
  }

  /**
   * The ring a body leaves behind. Colourless is the kill puff's own
   * orange; a colour is passed only where the body did not die to
   * anything the player did — a devoured one (feedHungry) wears the
   * hungry hue so the two read apart on a crowded lane.
   */
  private pushDeathFx(x: number, y: number, col?: RGB): void {
    const i = this.pushSlot(x, y, FX_DEATH, FxKind.Death, 0, 0, 0, 0, false);
    if (i >= 0 && col) {
      this.fxHasCol[i] = 1;
      this.fxColR[i] = col[0];
      this.fxColG[i] = col[1];
      this.fxColB[i] = col[2];
    }
  }

  private removeUnit(i: number): void {
    this.aliveByKind[this.ukind[i]]--;
    this.waveDown[this.uwave[i]] = (this.waveDown[this.uwave[i]] ?? 0) + 1;
    // A CROSSER'S LEDGER IS KEPT HERE, at the one door out, and not in
    // killUnit — a Borer's piece can leave the board killed, devoured
    // (Hungry), blown apart by a cascade, or walked off the far edge, and
    // a count kept at the kill would miss three of those four. The worm is
    // DESTROYED when its last piece goes and it was not already booked as
    // leaked: a train that got across is not a train the board killed,
    // however much of it was left smoking on the road behind it.
    // ...AND THE SIEGE'S IS KEPT HERE TOO, at the same door and for the
    // same reason (levels.ts RazeMission): an emplacement can leave the
    // board killed, devoured or taken apart by a cascade, and a count kept
    // at the kill would miss two of the three. The sweep guard is the
    // crossers' — a board jumped past rather than fought must not be
    // handed the mission (skipToTime)
    if (this.ukind[i] === UNIT_ID.railgun && !this.crossSweeping) this.razeKilled++;
    const cross = this.ucross[i];
    if (cross >= 0) {
      const worm = this.crossers[cross];
      // ...unless the board is being SWEPT rather than fought (skipToTime).
      // A jump takes every body off the field through this door, and a
      // train the run never shot at must not be booked as one it destroyed
      // — it would hand the sandbox free mission progress and, on a jump
      // past the last launch, decide the mission outright
      if (worm && --worm.alive <= 0 && !worm.leaked && !this.crossSweeping) this.crossKilled++;
    }
    const n = --this.n;
    // the projectile pass holds its force-field carriers by index, and a
    // shot that kills what it hits reshuffles them mid-pass: the dead
    // carrier leaves the list, and the unit swapped down into its slot
    // follows its row. Without this a stale index points at a row that has
    // moved on — the bubble deflects from where its carrier used to be,
    // and once something else lands there it is not a carrier at all
    for (let f = this.fldN - 1; f >= 0; f--) {
      if (this.fldI[f] === i) this.fldI[f] = this.fldI[--this.fldN];
      else if (this.fldI[f] === n) this.fldI[f] = i;
    }
    // the player's inspect mark rides the same reshuffle: the marked unit
    // dying clears the mark for good, and the unit swapped down into its
    // slot drags the index hint with it (see setInspectUnit)
    if (this.inspectIdx === i) {
      this.inspectIdx = -1;
      this.inspectUid = -1;
    } else if (this.inspectIdx === n) {
      this.inspectIdx = i;
    }
    this.upx[i] = this.upx[n];
    this.upy[i] = this.upy[n];
    this.uvx[i] = this.uvx[n];
    this.uvy[i] = this.uvy[n];
    this.uaimx[i] = this.uaimx[n];
    this.uaimy[i] = this.uaimy[n];
    this.uhp[i] = this.uhp[n];
    this.uhpmax[i] = this.uhpmax[n];
    this.uspd[i] = this.uspd[n];
    this.urad[i] = this.urad[n];
    // a flyer's exit is picked ONCE, at spawn, so it has to travel with the
    // unit like its feet do. Left behind, the flyer swapped down into a
    // dead unit's slot silently inherits that unit's destination — on a
    // multi-exit map it turns for the wrong one mid-flight, and a slot last
    // held by a walker (which never writes these at all) points it at
    // whatever stale value was sitting there
    this.ugx[i] = this.ugx[n];
    this.ugy[i] = this.ugy[n];
    this.uarmor[i] = this.uarmor[n];
    this.ushield[i] = this.ushield[n];
    this.ushieldAlpha[i] = this.ushieldAlpha[n];
    this.uability[i] = this.uability[n];
    this.upullx[i] = this.upullx[n];
    this.upully[i] = this.upully[n];
    this.uspawn[i] = this.uspawn[n];
    this.uforceScale[i] = this.uforceScale[n];
    this.utgt[i] = this.utgt[n];
    this.utgt[n] = null;
    this.utT[i] = this.utT[n];
    this.ubeamT[i] = this.ubeamT[n];
    for (let w = 0; w < MAX_WEAPONS; w++)
      this.ucd[i * MAX_WEAPONS + w] = this.ucd[n * MAX_WEAPONS + w];
    this.uforceDown[i] = this.uforceDown[n];
    this.uburn[i] = this.uburn[n];
    this.uburnT[i] = this.uburnT[n];
    this.upoison[i] = this.upoison[n];
    this.upoisonT[i] = this.upoisonT[n];
    this.usoak[i] = this.usoak[n];
    this.uwet[i] = this.uwet[n];
    this.uwetSlow[i] = this.uwetSlow[n];
    this.uarmorAdd[i] = this.uarmorAdd[n];
    this.uarmorT[i] = this.uarmorT[n];
    this.uhasteMul[i] = this.uhasteMul[n];
    this.uhasteT[i] = this.uhasteT[n];
    this.ubowT[i] = this.ubowT[n];
    this.uage[i] = this.uage[n];
    this.uvet[i] = this.uvet[n];
    this.udrillMul[i] = this.udrillMul[n];
    this.udrillT[i] = this.udrillT[n];
    this.ureachMul[i] = this.ureachMul[n];
    this.ureachT[i] = this.ureachT[n];
    this.ublinkCd[i] = this.ublinkCd[n];
    this.ustarCd[i] = this.ustarCd[n];
    this.ufoldT[i] = this.ufoldT[n];
    this.ucloakT[i] = this.ucloakT[n];
    this.ucloakCd[i] = this.ucloakCd[n];
    this.uhungry[i] = this.uhungry[n];
    this.ueaten[i] = this.ueaten[n];
    this.uhungerT[i] = this.uhungerT[n];
    this.ustack[i] = this.ustack[n];
    this.usqzT[i] = this.usqzT[n];
    // the squeeze scratch travels too: mergeSqueezed removes rows in the
    // middle of reading it, and the body swapped down must keep the
    // partner the physics pass noted on it
    this.usqzJ[i] = this.usqzJ[n];
    this.usqzU[i] = this.usqzU[n];
    this.usqzD[i] = this.usqzD[n];
    this.ubrood[i] = this.ubrood[n];
    this.urisen[i] = this.urisen[n];
    this.uled[i] = this.uled[n];
    this.uvirus[i] = this.uvirus[n];
    this.uwave[i] = this.uwave[n];
    // ...and the road the moved body was walking, with how far along it
    // had got: a crosser that inherited a stale slot would be a car in
    // somebody else's train, or a runt teleported onto a road
    this.ucross[i] = this.ucross[n];
    this.ucrossS[i] = this.ucrossS[n];
    this.ufix[i] = this.ufix[n];
    // ...and the post it was holding, for the same reason: a body that
    // inherited a stale slot would be leashed to somebody else's circle,
    // or an ordinary walker bolted to a patch of open ground
    this.ugar[i] = this.ugar[n];
    this.ugarx[i] = this.ugarx[n];
    this.ugary[i] = this.ugary[n];
    this.ugarr[i] = this.ugarr[n];
    this.uid[i] = this.uid[n];
    this.ukind[i] = this.ukind[n];
    this.ufly[i] = this.ufly[n];
    this.unav[i] = this.unav[n];
    this.uwade[i] = this.uwade[n];
    this.uwet01[i] = this.uwet01[n];
    this.uheavy[i] = this.uheavy[n];
    this.ulat[i] = this.ulat[n];
    this.uwalk[i] = this.uwalk[n];
    this.ubrot[i] = this.ubrot[n];
    this.urot[i] = this.urot[n];
    // the moved unit's feet are world positions, not offsets — they have to
    // travel with it to its new index or its legs snap back to the origin
    if (KIND_LEGS[this.ukind[i]]) {
      const a = i * MAX_LEGS, b = n * MAX_LEGS;
      for (let k = 0; k < MAX_LEGS; k++) {
        this.ulegFX[a + k] = this.ulegFX[b + k];
        this.ulegFY[a + k] = this.ulegFY[b + k];
        this.ulegJX[a + k] = this.ulegJX[b + k];
        this.ulegJY[a + k] = this.ulegJY[b + k];
        this.ulegStage[a + k] = this.ulegStage[b + k];
      }
      this.ulegMove[i] = this.ulegMove[n];
      this.ulegT[i] = this.ulegT[n];
      this.ulegOX[i] = this.ulegOX[n];
      this.ulegOY[i] = this.ulegOY[n];
    }
    // the chain too: world positions, so they travel with the head
    if (KIND_SEGS[this.ukind[i]]) {
      const a = i * MAX_SEGS, b = n * MAX_SEGS;
      for (let k = 0; k < MAX_SEGS; k++) {
        this.usegX[a + k] = this.usegX[b + k];
        this.usegY[a + k] = this.usegY[b + k];
      }
      this.usegPh[i] = this.usegPh[n];
    }
    // and the moved hull's wake, for the same reason its feet move
    if (KIND_WAKE[this.ukind[i]]) {
      const a = i * WAKE_PTS, b = n * WAKE_PTS;
      for (let k = 0; k < WAKE_PTS; k++) {
        this.uwakeX[a + k] = this.uwakeX[b + k];
        this.uwakeY[a + k] = this.uwakeY[b + k];
      }
      this.uwakeN[i] = this.uwakeN[n];
      this.uwakeT[i] = this.uwakeT[n];
    }
  }

  /**
   * Mindustry LegsComp.resetLegs: stand every leg straight out along its
   * own mount angle, knee halfway. A fresh unit has never walked, so its
   * gait clock starts at a random point — a wave of them steps out of
   * phase instead of marching like a chorus line.
   */
  /** lay the chain out straight behind the head, along the way it faces */
  private resetSegments(i: number, S: SegmentSpec): void {
    const off = i * MAX_SEGS;
    const cx = Math.cos(this.urot[i]), sy = Math.sin(this.urot[i]);
    for (let k = 0; k < S.count; k++) {
      this.usegX[off + k] = this.upx[i] - cx * (S.neck + S.spacing * (k + 1));
      this.usegY[off + k] = this.upy[i] - sy * (S.neck + S.spacing * (k + 1));
    }
    this.usegPh[i] = Math.random() * TAU;
  }
  /**
   * One tick of the chain. The neck — the point the chain hangs from,
   * behind the head's centre — sways across the heading on a phase that
   * advances with distance travelled (SegmentSpec.amp, wavelength), with
   * a slow idle sway on top so a standing body is not a rod. Then each
   * segment is pulled to exactly `spacing` behind the point ahead of it
   * whenever it has fallen further, and left where it is otherwise — so
   * the body follows the neck's sinuous path, bunches a little when the
   * head turns back on it, and never stretches.
   */
  private updateSegments(i: number, S: SegmentSpec, moved: number, dt: number): void {
    const off = i * MAX_SEGS;
    this.usegPh[i] = (this.usegPh[i] + (moved / S.wavelength) * TAU + dt * 0.25 * TAU) % TAU;
    const rot = this.urot[i], cr = Math.cos(rot), sr = Math.sin(rot);
    const sway = Math.sin(this.usegPh[i]) * S.amp;
    let lx = this.upx[i] - cr * S.neck - sr * sway, ly = this.upy[i] - sr * S.neck + cr * sway;
    for (let k = 0; k < S.count; k++) {
      const p = off + k;
      const dx = lx - this.usegX[p], dy = ly - this.usegY[p];
      const d = Math.hypot(dx, dy);
      if (d > S.spacing) {
        const f = S.spacing / d;
        this.usegX[p] = lx - dx * f;
        this.usegY[p] = ly - dy * f;
      }
      lx = this.usegX[p];
      ly = this.usegY[p];
    }
  }

  private resetLegs(i: number, L: LegSpec): void {
    const off = i * MAX_LEGS;
    const x = this.upx[i], y = this.upy[i], rot = this.ubrot[i];
    for (let k = 0; k < L.count; k++) {
      const ang = rot + (TAU / L.count) * k + Math.PI / L.count;
      const ca = Math.cos(ang), sa = Math.sin(ang);
      const bx = x + ca * L.baseOffset, by = y + sa * L.baseOffset;
      this.ulegJX[off + k] = bx + ca * (L.length / 2);
      this.ulegJY[off + k] = by + sa * (L.length / 2);
      this.ulegFX[off + k] = bx + ca * L.length;
      this.ulegFY[off + k] = by + sa * L.length;
      this.ulegStage[off + k] = 0;
    }
    this.ulegMove[i] = 0;
    this.ulegT[i] = Math.random() * 100;
    this.ulegOX[i] = 0;
    this.ulegOY[i] = 0;
  }

  /**
   * One legged unit's gait, ported from Mindustry LegsComp.update.
   *
   * The legs are divided into `div` groups that take turns: the gait clock
   * is the distance the body has walked, and every `moveSpace` px of it the
   * turn passes to the next group. A leg whose turn it is swings toward the
   * spot it wants to stand on (straight out along its mount angle, plus the
   * body's lean into its travel); every other leg keeps its foot planted
   * exactly where it is while the body walks out from over it. The knee is
   * whatever IK says it must be for the segment lengths to hold, so all the
   * bending falls out of the two endpoints rather than being animated.
   */
  private updateLegs(i: number, L: LegSpec, mdx: number, mdy: number, moved: number, dt: number): void {
    const { ulegFX, ulegFY, ulegJX, ulegJY, ulegStage } = this;
    const off = i * MAX_LEGS;
    const x = this.upx[i], y = this.upy[i], rot = this.ubrot[i];
    const n = L.count;
    // each mount angle is rot + a fixed slice — compose off one cos/sin
    const trig = KIND_LEG_TRIG[this.ukind[i]]!;
    const cr = Math.cos(rot), sr = Math.sin(rot);
    const div = Math.max((n / L.groupSize) | 0, 2);
    const space = (L.length / 1.6 / (div / 2)) * L.moveSpace;
    // Mathf.lerpDelta's alpha is per 1/60 s tick; compound it over the frame
    const ticks = dt * 60;
    const ease = 1 - keepOver(0.9, ticks);
    const knee = 1 - keepOver(1 - L.speed / 4, ticks);
    const moving = moved > 1e-3;
    this.ulegT[i] += moved;

    // the gait leans most of one stride into the direction of travel, eased
    // so a turning unit's feet swing round rather than jumping
    const trns = space * 0.85 * L.forwardScl;
    const tx = moving ? (mdx / moved) * trns : 0;
    const ty = moving ? (mdy / moved) * trns : 0;
    this.ulegOX[i] += (tx - this.ulegOX[i]) * ease;
    this.ulegOY[i] += (ty - this.ulegOY[i]) * ease;
    const ox = this.ulegOX[i], oy = this.ulegOY[i];

    const minJ = (L.minLength * L.length) / 2, maxJ = (L.maxLength * L.length) / 2;
    const minF = L.minLength * L.length, maxF = L.maxLength * L.length;
    let bits = 0;
    for (let k = 0; k < n; k++) {
      const p = off + k;
      // the mount this leg hangs from: its own slice of the ring around the
      // body, turning with the chassis
      const ck = trig[k * 2], sk = trig[k * 2 + 1];
      const ca = cr * ck - sr * sk, sa = sr * ck + cr * sk;
      const bx = x + ca * L.baseOffset, by = y + sa * L.baseOffset;

      // no leg may be stretched or folded past its reach — enforced before
      // the step and again after it, exactly like the original
      clampLen(ulegJX[p] - bx, ulegJY[p] - by, minJ, maxJ, legTmp);
      ulegJX[p] = bx + legTmp.x;
      ulegJY[p] = by + legTmp.y;
      clampLen(ulegFX[p] - bx, ulegFY[p] - by, minF, maxF, legTmp);
      ulegFX[p] = bx + legTmp.x;
      ulegFY[p] = by + legTmp.y;

      // whose turn it is: the clock's whole part picks the group, its
      // fraction is how far through the swing this leg has come
      const stageF = (this.ulegT[i] + k * L.pairOffset) / space;
      const frac = stageF - Math.floor(stageF);
      const step = k % div === Math.floor(stageF) % div;
      if (step) bits |= 1 << k;
      ulegStage[p] = moving ? frac : ulegStage[p] * (1 - ease);

      // knees splay outward: the front and back halves take opposite IK
      // solutions, and the pair straddling the middle flips again
      // (Mindustry flipBackLegs) so the hindmost legs bend like the front
      const back = Math.abs(k + 0.5 - n / 2) <= 0.501;
      const side = k < n / 2 !== back;
      solveIK(L.length / 2, L.length / 2, ulegFX[p] - bx, ulegFY[p] - by, side, legTmp2);
      const jdx = bx + legTmp2.x, jdy = by + legTmp2.y;

      if (step) {
        // the spot this leg is swinging to, and a knee chasing it twice as slowly
        const dx = bx + ca * L.length * L.lengthScl + ox;
        const dy = by + sa * L.length * L.lengthScl + oy;
        const a = 1 - keepOver(1 - frac, ticks);
        ulegFX[p] += (dx - ulegFX[p]) * a;
        ulegFY[p] += (dy - ulegFY[p]) * a;
        const a2 = 1 - keepOver(1 - frac / 2, ticks);
        ulegJX[p] += (jdx - ulegJX[p]) * a2;
        ulegJY[p] += (jdy - ulegJY[p]) * a2;
      }
      // planted or not, the knee keeps easing toward its IK solution
      ulegJX[p] += (jdx - ulegJX[p]) * knee;
      ulegJY[p] += (jdy - ulegJY[p]) * knee;

      clampLen(ulegJX[p] - bx, ulegJY[p] - by, minJ, maxJ, legTmp);
      ulegJX[p] = bx + legTmp.x;
      ulegJY[p] = by + legTmp.y;
      clampLen(ulegFX[p] - bx, ulegFY[p] - by, minF, maxF, legTmp);
      ulegFX[p] = bx + legTmp.x;
      ulegFY[p] = by + legTmp.y;
    }
    // a leg is DOWN the moment its group's turn passes on, and that
    // transition is where Mindustry hangs everything a footstep does:
    // Fx.unitLandSmall at the foot, the step shake, and — on the units
    // that carry it — legSplashDamage. Dartback4 (32 over 30 units) and
    // dartback5 (80 over 60) carry that last one on this roster, and
    // neither has anything to land on: it hits enemy units and buildings,
    // and the player here fields no units and builds towers that cannot
    // be damaged. So
    // what a footfall leaves behind is the dust, scaled by rippleScale
    const landed = this.ulegMove[i] & ~bits;
    // fxOn is read here rather than left to pushSlot's refusal because
    // this guard is a BUDGET check: with the effects off the pool stays
    // near-empty, so it would read as room forever and every planted foot
    // would roll a seed for a puff that is never taken
    if (landed !== 0 && this.fxOn && this.fxN < FX_DUST_CAP) {
      for (let k = 0; k < n; k++) {
        if ((landed & (1 << k)) === 0) continue;
        this.pushFx(ulegFX[off + k], ulegFY[off + k], 30 / 60, FxKind.Footfall,
          L.ripple, 0, (Math.random() * 0x7fffffff) | 0);
      }
    }
    this.ulegMove[i] = bits;
  }

  // ---------- spatial hash ----------

  /**
   * Refresh the live per-layer bounds off the census: the widest radius
   * standing on each layer, the per-kind physics spans it implies, and the
   * airborne head count. Runs after the script's spawns and before the
   * hash, so everything on the field this tick is counted; units that die
   * MID-tick only ever leave the bounds conservative (too wide), never
   * wrong. Cost is one pass over the kind table, not the units.
   */
  private updateAliveBounds(): void {
    let g = 0, a = 0, na = 0, ng = 0;
    // widest SMALL unit per layer, for the swarm's own physics span
    let gs = 0, as = 0;
    for (let k = 0; k < UNIT_KINDS.length; k++) {
      const alive = this.aliveByKind[k];
      if (alive <= 0) continue;
      const r = HB_OUTER[k];
      if (KIND_FLYING[k]) {
        na += alive;
        if (r > a) a = r;
        if (!HB_HEAVY[k] && r > as) as = r;
      } else {
        ng += alive;
        if (r > g) g = r;
        if (!HB_HEAVY[k] && r > gs) gs = r;
      }
    }
    this.rmaxAliveGround = g;
    this.rmaxAliveAir = a;
    this.nAliveAir = na;
    this.nAliveGround = ng;
    // the same reach kindSpan holds, with the live rmax in place of the
    // roster's: a pair further apart than span * HC cannot be touching
    for (let k = 0; k < UNIT_KINDS.length; k++) {
      const rk = HB_OUTER[k];
      const fly = KIND_FLYING[k];
      this.kindSpanDyn[k] = Math.max(1, Math.ceil(((rk + (fly ? a : g)) * PHYS_R) / HC));
      this.kindSpanSDyn[k] = Math.max(1, Math.ceil(((rk + (fly ? as : gs)) * PHYS_R) / HC));
    }
  }

  /** the widest live OUTER radius a bullet with these layer flags can meet
   * — the live-roster stand-in for HB_RMAX in every broad-phase pad */
  private rmaxAliveFor(air: boolean, ground: boolean): number {
    return Math.max(air ? this.rmaxAliveAir : 0, ground ? this.rmaxAliveGround : 0);
  }

  /**
   * THE NARROW PHASE'S ONE QUESTION: how far does body `i` reach in the
   * direction of `(dx, dy)`? For a round kind that is its radius and this
   * is one array read; for a shaped one it is the ellipse's polar radius
   * (hitbox.ts), which needs the body's heading and so pays two trig calls
   * and a square root.
   *
   * EVERY HIT TEST IN THE FILE IS WRITTEN THE SAME WAY — take the vector
   * from the query point to the body, square it, compare against
   * `(r + urad[i]) ** 2` — so making a body oval is a matter of swapping
   * `urad[i]` for this call at each of them and nothing else. `d2` is that
   * squared length, which the caller has always already computed.
   *
   * THE BROAD PHASE IS NOT AFFECTED and must not be: a pad sized by the
   * directional radius would be a pad that shrinks as the body turns, and
   * a candidate dropped from a bucket sweep is never tested at all. Every
   * pad stays on the OUTER radius (HB_OUTER, rmaxAliveFor), which is the
   * widest this can return.
   */
  private hitR(i: number, dx: number, dy: number, d2: number): number {
    const k = this.ukind[i];
    if (HB_OVAL[k] === 0) return this.urad[i];
    const a = HB_A[k], b = HB_B[k];
    if (d2 <= 1e-8) return a < b ? a : b;
    const inv = 1 / Math.sqrt(d2);
    const rot = this.urot[i];
    const c = Math.cos(rot), sn = Math.sin(rot);
    const lx = ((dx * c + dy * sn) * inv) / a;
    const ly = ((dy * c - dx * sn) * inv) / b;
    return 1 / Math.sqrt(lx * lx + ly * ly);
  }

  private hashCellOf(i: number): number {
    return (
      clamp((this.upy[i] / HC) | 0, 0, HROWS - 1) * HCOLS +
      clamp((this.upx[i] / HC) | 0, 0, HCOLS - 1)
    );
  }

  private buildHash(): void {
    this.bodyIters += this.n;
    buildHash(this.upx, this.upy, this.n, this.bStart, this.bCount, this.bUnits);
  }

  // ---------- units ----------

  /**
   * Mindustry's PhysicsProcess.PhysicsWorld.update(), ported 1:1: every
   * unit is a circle (radius PHYS_R * urad) with mass = area; overlapping
   * same-layer pairs are pushed apart along their center line by the full
   * overlap softened by PHYS_SCL, split inversely by mass — an ironhide2 plows
   * through runts, runts barely rock the ironhide2. Each unordered pair
   * resolves exactly once per tick, at its first member's turn (the
   * original's `collided` flag == our ascending-index guard), and later
   * pairs see the already-pushed scratch positions, so a pile relaxes a
   * little more per tick than independent pushes would. Exactly stacked
   * units part in a random direction. Ground and air are separate layers
   * that pass through each other freely.
   *
   * One deliberate departure from the original: where a unit has room to
   * step aside, the shove is re-aimed across its direction of travel (see
   * PUSH_LONG / PUSH_SIDE). Mindustry resolves along the centre line, which
   * for a crowd all walking one heading means every overlap lengthens the
   * column — the classic conga line. Same magnitude, different axis.
   */
  private updatePhysics(): void {
    // on the shove's own thread the answer for the tick just ended is
    // waiting (or is not, and this tick goes without); in this thread the
    // kernel runs here over the same arrays
    this.bodyIters += this.n;
    const port = this.physPort;
    if (port && port.take(this.tick, this.n, this.uid, this.physOut)) return;
    // nothing new from the thread this tick: shove here. A thread that
    // has thrown, or answered nothing for two seconds, is let go of
    if (port && !port.alive) {
      console.warn("physics worker went quiet; shoving in-thread from here");
      this.physPort = null;
    }
    runPhysics(this.physIn(), this.physTables, this.physScratch, this.physOut, this.n);
  }

  private updateUnits(dt: number): void {
    this.bodyIters += this.n;
    const { upx, upy, uvx, uvy, uspd, ukind, uwalk, ubrot, urot, ulat, ushx, ushy, field, flowTmp } = this;
    const { uthx, uthy, ufcx, ufcy, ujx, ujy, ucellT, tick } = this;
    const { upullx, upully, uspawn, uwet, uwetSlow, uaimx, uaimy } = this;
    // the water mask, for the naval tanks' pace ashore (NAVAL_LAND_SPEED)
    const water = this.waterCells;
    const steer = Math.min(1, dt * 8);
    // one step of the lateral bias's mean-reverting walk, precomputed: pull
    // LAT_A of the way back to straight-ahead, then add noise scaled so the
    // stationary spread lands on LAT_SIGMA whatever the tick rate
    const LAT_A = Math.min(1, LAT_RELAX * dt * THINK_STRIDE);
    const LAT_N = LAT_SIGMA * Math.sqrt(6 * LAT_A);
    // repulsion probes reach 4px past the wall-clearance radius: any longer
    // and the push-off fires while a unit hugs a wall to enter a staggered
    // narrow passage, shoving it back out of the entry window forever
    const PR = WALL_R + 4, REP = 55;

    // THE CROSSERS COME OFF THIS PASS ENTIRELY (updateCrosser): they are
    // kinematic, and a body whose position is read off a road has no use
    // for a heading, a shove, a wall or a steering force. The ones that
    // reach the exit are lifted afterwards rather than in the loop —
    // removeUnit swaps the last row down into the dead one's slot, and a
    // descending walk that removed in place would step straight over
    // whatever landed there
    // ...and their clock is wound ONCE, here, for the whole train (see
    // ucross). A per-piece advance inside the loop is what let a chain
    // come apart
    // ...times whatever the standing Goads are adding (see goadMul). The
    // reported velocity below is multiplied by the same number, so a
    // turret's aim lead and the ground going past agree
    const gm = this.goadMul;
    for (const w of this.crossers) if (w.alive > 0 && w.hp > 0) w.s += w.spd * gm * dt;
    let leaked: number[] | null = null;
    let slain: number[] | null = null;
    for (let i = this.n - 1; i >= 0; i--) {
      if (this.ucross[i] >= 0) {
        const step = this.updateCrosser(i);
        if (step === CROSS_LEAKED) (leaked ??= []).push(i);
        else if (step === CROSS_DEAD) (slain ??= []).push(i);
        continue;
      }
      const fly = this.ufly[i] !== 0;
      const nav = this.unav[i] !== 0;
      const mf = nav ? this.navalField : field;
      const { walk } = mf;
      const cx = clamp((upx[i] / CELL) | 0, 0, COLS - 1);
      const cy = clamp((upy[i] / CELL) | 0, 0, ROWS - 1);
      const ci = cy * COLS + cx;
      // THIS TICK'S DECISION, OR THE CACHED ONE (THINK_STRIDE)
      const think = ucellT[i] !== ci || ((i + tick) & (THINK_STRIDE - 1)) === 0;
      if (!think) {
        flowTmp.x = uthx[i];
        flowTmp.y = uthy[i];
      } else {
      ucellT[i] = ci;
      // NOTHING ARRIVES AND NOTHING LEAKS. The core is the goal (coreGoal)
      // and it is solid: a body that reaches it is pressed against it by
      // the field and stays there, firing (updateUnitWeapons), until one of
      // them is gone. A naval tank aims at the same core the walkers do —
      // it used to park on the water nearest it and fire from the shore,
      // which was the whole of what a hull could reach.

      if (this.ugar[i] !== 0) {
        // A POSTED BODY DOES NOT READ THE FIELD (see ugar). Planted is the
        // easy half — no heading at all, ever. Leashed is the whole idea:
        // it walks at the thing it has picked inside its circle, and when
        // it has nothing it walks back to the middle of the circle and
        // stands there.
        //
        // THE WALK HOME IS WHAT MAKES THE LEASH A LEASH. Without it a
        // guard that chased a target to the edge of its post would simply
        // stop there and hold the wrong ground for the rest of the run;
        // with it the post is a place the garrison returns to, which is
        // what a player watching one fight and win expects to see. The
        // dead zone is a fifth of the radius so a guard that is nearly
        // home does not jitter on the spot.
        const tgt = this.ugar[i] === 1 ? this.utgt[i] : null;
        const gx = tgt ? tgt.x : this.ugarx[i];
        const gy = tgt ? tgt.y : this.ugary[i];
        const dx = gx - upx[i], dy = gy - upy[i];
        const dl = Math.sqrt(dx * dx + dy * dy);
        const home = !tgt && dl < this.ugarr[i] * 0.2;
        if (this.ugar[i] === 2 || home || dl < 1) {
          flowTmp.x = 0;
          flowTmp.y = 0;
        } else {
          flowTmp.x = dx / dl;
          flowTmp.y = dy / dl;
        }
      } else if (fly) {
        // flyers take the air field's route round the hills and HOLD over
        // the core's edge once there — Mindustry's FlyingAI circles what it
        // attacks; this one hovers, and its guns do the rest
        // (updateUnitWeapons)
        const gdx = this.ugx[i] - upx[i], gdy = this.ugy[i] - upy[i];
        const gl = Math.sqrt(gdx * gdx + gdy * gdy) || 1;
        const hold = (this.core.size * CELL) / 2 + CELL * 1.5;
        // A BOMBER DIVES (levels.ts payload): with a structure picked
        // inside its seek reach (updateUnitWeapons) it flies straight at
        // that instead of the core, and goes off on contact
        const dive = KIND_PAYLOAD[ukind[i]] && !this.aimIsConvoy(this.utgt[i]) ? this.utgt[i] : null;
        if (dive) {
          const tx = dive.x - upx[i], ty = dive.y - upy[i];
          const tl = Math.sqrt(tx * tx + ty * ty) || 1;
          flowTmp.x = tx / tl;
          flowTmp.y = ty / tl;
        } else if (gl <= hold) {
          flowTmp.x = 0;
          flowTmp.y = 0;
        } else this.airHeading(upx[i], upy[i], gdx / gl, gdy / gl, flowTmp, this.airField);
      } else {
        // A TUSKER CHARGES (levels.ts charge): with a structure picked
        // inside its charge range (updateUnitWeapons, which scans out to
        // KIND_SEEK for exactly this) it drops the flow field and walks
        // straight at that instead of at the core — the bomber's dive,
        // on the ground.
        //
        // IT IS THE ONLY REASON A MELEE FAMILY WORKS. Attack-moving is
        // enough for a gun that reaches eleven tiles or ninety: the route
        // to the core passes through what it can shoot. A body whose
        // reach is two tiles would be routed neatly around your guns and
        // arrive at the core having touched nothing, so this one leaves
        // the route.
        //
        // WALKING STRAIGHT IS SAFE HERE: a ground body may only hold a
        // target it can SEE (updateUnitWeapons casts the ray every tick),
        // so there is no rock on the line. A crowd on the line is sorted
        // out by the same shove that sorts out every other body's.
        const rush =
          HAS_CHARGE && KIND_CHARGE[ukind[i]] > 0 && !this.aimIsConvoy(this.utgt[i])
            ? this.utgt[i]
            : null;
        if (rush && this.canWalkTo(upx[i], upy[i], rush.x, rush.y, mf)) {
          const tx = rush.x - upx[i], ty = rush.y - upy[i];
          const tl = Math.sqrt(tx * tx + ty * ty) || 1;
          flowTmp.x = tx / tl;
          flowTmp.y = ty / tl;
        } else mf.sample(upx[i], upy[i], flowTmp);
      }
      uthx[i] = flowTmp.x;
      uthy[i] = flowTmp.y;
      }
      // StatusEffects.unmoving is a speedMultiplier of 0, not a freeze: a
      // unit still materialising cannot drive itself anywhere, but the
      // crowd shove below still lands on it. Wet is the other multiplier
      // (StatusEffects.wet, and the liquid turrets' whole weapon): it
      // scales the DRIVE only, so a soaked unit can still be crowd-shoved
      // or beam-dragged at full force. `spd` is those multipliers applied
      // — the STAT speed stays in uspd, which the chassis turn rate
      // further down reads as the pace to measure travel against
      // ...and a NAVAL TANK ASHORE drives at NAVAL_LAND_SPEED of its stat.
      // It is a third multiplier on the drive and nothing more: the field
      // it is reading knows nothing about it, so the route stays the plain
      // shortest path and the water is a place a tank is quicker rather
      // than a place it is drawn to.
      // ...AND HALF AGAIN AFLOAT (NAVAL_WATER_SPEED): the water is the road
      // the family is quick on, and a hull under the skate4's bow wave
      // (ubowT, levels.ts wakeField) keeps its afloat pace ashore too.
      // The tax itself is per KIND (KIND_LAND_SPEED): the Wraith fleet
      // pays a fifth where the Harpoon fleet pays a half, because the
      // crawl ashore is the sniper family's premise and not the wraiths'
      const land = !nav
        ? 1
        : water[ci]
          ? NAVAL_WATER_SPEED
          : HAS_WAKE_AURA && this.ubowT[i] > 0
            ? 1
            : KIND_LAND_SPEED[ukind[i]];
      // ...and a FOURTH multiplier: the dartback3's pace stamp (levels.ts
      // hasteField). It rides here with the wet slow and the land penalty
      // rather than on uspd, so it is a thing happening TO the body and
      // never a permanent change to what it is — walk out of the field and
      // the next frame is at its own speed again. The two can meet: a
      // soaked body under a dartback3 is slowed and hurried at once, and the
      // product is the honest answer to both.
      const haste = HAS_HASTE_AURA && this.uhasteT[i] > 0 ? this.uhasteMul[i] : 1;
      // ...unless the kind refuses every slow there is (KIND_NO_SLOW). The
      // soak is still on the body and still doing everything else a soak
      // does; this one branch is where it would have cost seconds
      const slow = uwet[i] > 0 && !KIND_NO_SLOW[ukind[i]] ? uwetSlow[i] : 1;
      const spd =
        uspawn[i] > SPAWN_INVINCIBLE - SPAWN_UNMOVING
          ? 0
          : uspd[i] * slow * land * haste;
      uvx[i] += (flowTmp.x * spd - uvx[i]) * steer;
      uvy[i] += (flowTmp.y * spd - uvy[i]) * steer;

      // this tick's crowd shove, precomputed by updatePhysics: whatever the
      // pairwise resolution moved this unit's scratch position. Applied on
      // top of the unit's own capped drive — a crowd can shove a unit
      // faster than it walks, exactly as in Mindustry — but it rides
      // through the same wall slide below, so pressure never pins anyone
      // into rock
      // ...AND A PLANTED BODY TAKES NO SHOVE (see ugar). The physics pass
      // still resolves everything that walks into an emplacement — the
      // crowd goes round it — it is only this side of the pair that is
      // refused, so a railgun cannot be walked off the spot the mission
      // put it on by a wave filing past.
      const planted = this.ugar[i] === 2;
      const shx = planted ? 0 : ushx[i], shy = planted ? 0 : ushy[i];
      let fx = 0, fy = 0;
      // ...and the doorway jitter, kept apart from the rest of the steering
      // because the FACING below must not see it (see aimX)
      let jx = 0, jy = 0;

      // HAS THIS BODY ANYWHERE TO BE? A zero heading is a unit with no
      // route at all — the player's army standing where it was left, a
      // flyer holding over the core, anyone the field cannot reach the goal
      // from. The crowd forces below that are spent ACROSS the flow
      // (lateral drift, lane centering) already come out zero for such a
      // body; the jitter is the one that does not, and a random shove on
      // something with nowhere to go is a unit twitching on the spot. The
      // wall probes and the narrow-slot centering stay unconditional: those
      // are a body's quarrel with rock, and it has that standing still.
      const driving = flowTmp.x !== 0 || flowTmp.y !== 0;

      // every steering force below is ground-only: flyers never probe,
      // jitter, center, or drift. Their field bends them round a mountain
      // but nothing up there stops them — no corridor to spread across and
      // no wall to crowd against, so the crowd fixes a corridor needs would
      // only add wobble
      if (think && !fly) {
        const cl = mf.clear[ci];

        // lateral drift. The physics re-aim above only spreads units already
        // touching; once a stream is strung out single file nothing is left
        // to widen it. So each walker wanders a little across the flow, on a
        // multi-second clock so the walk actually accumulates instead of
        // averaging away frame to frame. The bias reverts to zero, so a unit
        // drifts off the line and back rather than committing to a wall
        ulat[i] = clamp(ulat[i] + (Math.random() * 2 - 1) * LAT_N - ulat[i] * LAT_A, -1, 1);
        const room = clamp((cl - SPREAD_CLEAR) * LAT_ROOM_K, 0, 1);
        if (room > 0) {
          const drift = ulat[i] * LAT_FRAC * spd * room;
          fx -= flowTmp.y * drift;
          fy += flowTmp.x * drift;
        }

        // wall repulsion probes: push off nearby walls so corners can't wedge
        // units (in a 1-wide corridor both sides fire and cancel — harmless).
        // The probes reach PR = 11px — inside the orthogonally adjacent cell
        // — so they can only ever land on rock when this cell's clearance is
        // exactly 1 (an orthogonal rock neighbour, or the map border, which
        // the clearance transform also scores 1). Anywhere clearer, all four
        // would come back false, so they are not asked
        if (cl < 1.2) {
          if (mf.blockedPx(upx[i] + PR, upy[i])) fx -= REP;
          if (mf.blockedPx(upx[i] - PR, upy[i])) fx += REP;
          if (mf.blockedPx(upx[i], upy[i] + PR)) fy -= REP;
          if (mf.blockedPx(upx[i], upy[i] - PR)) fy += REP;
        }

        // symmetry-breaking jitter: units contesting a doorway can settle into
        // a perfectly balanced standoff (flow vs separation, a fraction of a
        // pixel outside the opening, forever) — a small random push dissolves
        // such equilibria and disappears under the flow force in open field.
        // Only for a body that is GOING somewhere: there is no standoff to
        // dissolve where there is no flow to be balanced against, and the
        // push is the whole of what a standing unit's shiver was
        if (driving) {
          jx = (Math.random() - 0.5) * 14;
          jy = (Math.random() - 0.5) * 14;
        }

        // lane centering: lean up the clearance gradient so the band the
        // drift and the re-aim spread stays centred on the route instead of
        // grinding along both walls. Only the component across the flow is
        // taken, so this never brakes or hurries the advance; it is zero in
        // a 1-wide slot (both sides read the same clearance) and fades out
        // once there is a comfortable margin of rock on either hand
        if (cl < CENTER_CLEAR) {
          const cw = mf.clear;
          const gx = cw[cx < COLS - 1 ? ci + 1 : ci] - cw[cx > 0 ? ci - 1 : ci];
          const gy = cw[cy < ROWS - 1 ? ci + COLS : ci] - cw[cy > 0 ? ci - COLS : ci];
          const lean =
            (gy * flowTmp.x - gx * flowTmp.y) * CENTER_GAIN * (1 - cl / CENTER_CLEAR);
          fx -= flowTmp.y * lean;
          fy += flowTmp.x * lean;
        }

        // narrow-passage centering: 1-wide corridors leave only a slim window
        // (unit clearance is WALL_R < CELL/2) — steer onto the cell centerline
        // there. Strictly both-sides-blocked cells only: anything looser (e.g.
        // an L-corner heuristic) also matches convex corners in open ground
        // and would drag passing units into the corner. Corners of narrow
        // bends need no help — the axis-separated slide stops a unit just
        // inside the turn's window and redirects its speed into the turn.
        // Gated like the probes above: an orthogonal rock neighbour (or the
        // border) means clearance exactly 1, so anywhere clearer every one
        // of these tests would be false
        if (cl < 1.2) {
          const bL = cx <= 0 || walk[cy * COLS + cx - 1] === 1;
          const bR = cx >= COLS - 1 || walk[cy * COLS + cx + 1] === 1;
          const bU = cy <= 0 || walk[(cy - 1) * COLS + cx] === 1;
          const bD = cy >= ROWS - 1 || walk[(cy + 1) * COLS + cx] === 1;
          if (bL && bR) fx += ((cx + 0.5) * CELL - upx[i]) * CENTER_K;
          if (bU && bD) fy += ((cy + 0.5) * CELL - upy[i]) * CENTER_K;
        }
      }
      if (think) {
        ufcx[i] = fx;
        ufcy[i] = fy;
        ujx[i] = jx;
        ujy[i] = jy;
      } else {
        fx = ufcx[i];
        fy = ufcy[i];
        jx = ujx[i];
        jy = ujy[i];
      }

      // the unit's own drive (flow + terrain steering) never exceeds its
      // stat speed; the physics shove then rides on top uncapped
      let mvx = uvx[i] + fx, mvy = uvy[i] + fy;
      // WHERE THE BODY IS TRYING TO GO, which is what it faces (further
      // down): the drive and the slow steering, before the jitter and
      // before the crowd shove. Both of those are fresh noise every tick —
      // the jitter by construction, the shove because a pile resolves a
      // different neighbour first each frame — and a body aimed at the
      // step it actually took swivels on them every frame, up to the whole
      // of its turn rate. Mindustry aims at `vel` and lets its physics
      // move the position underneath, and this is the same split. A flyer
      // never had either force on it, which is why the air never shook
      let aimX = mvx, aimY = mvy;
      mvx += jx;
      mvy += jy;
      const ml = Math.sqrt(mvx * mvx + mvy * mvy);
      if (ml > spd) {
        mvx = (mvx / ml) * spd;
        mvy = (mvy / ml) * spd;
      }
      // an outside shove (a repeater round's knockback) rides on top of the
      // capped drive like the crowd shove does, and bleeds off at the
      // kind's own drag — Mindustry keeps the impulse in `vel` and scales
      // the whole thing by (1 - drag) every tick, so a shove outlives the
      // hit that dealt it by a moment
      const pull = upullx[i] !== 0 || upully[i] !== 0;
      const dxT = mvx * dt + shx + (pull ? upullx[i] * dt : 0);
      const dyT = mvy * dt + shy + (pull ? upully[i] * dt : 0);
      if (pull) {
        const keep = keepOver(1 - KIND_DRAG[ukind[i]], dt * 60);
        upullx[i] *= keep;
        upully[i] *= keep;
      }

      // axis-separated move with slide-to-contact: a blocked axis advances
      // flush against the wall face rather than rejecting the whole step —
      // all-or-nothing rejection zeroes the axis velocity each frame, and a
      // unit that must shed a corner overlap in sub-pixel steps deadlocks.
      // Contact placement also lands units exactly on a narrow passage's
      // window edge, so 1-wide corridors and their L-bends stay threadable.
      // Only a zero-progress axis redirects its speed into the free one, and
      // a unit already overlapping a wall (crowd shoves) skips the veto
      // entirely so it can always walk back out.
      //
      // A FLYER COLLIDES TOO, AND WITH THE HILLS ONLY. It used to skip this
      // wholesale — `wedged` was forced true for anything airborne — which
      // meant the air field's careful route round a mountain was advice a
      // flyer could be shoved straight through: the crowd pushes on the air
      // layer like any other, and the push landed bodies inside peaks with
      // no heading to read (see airField). A mountain stops a flyer now.
      // What it collides WITH is airField, not the walkers' field, and the
      // difference is the whole point of using it: its mask is the hills
      // (airWalkMask) and its footprint list is empty, so a flyer still
      // crosses water, still crosses a turret, and is stopped by rock.
      const x0 = upx[i], y0 = upy[i];
      const cf = fly ? this.airField : mf;
      // ...and the escape is the same one a walker gets: a body ALREADY
      // inside rock skips the veto so it can always move back out. That is
      // what keeps a hill from becoming a trap for anything a shove, a
      // spawn or a pull has managed to put inside one — airHeading hands it
      // a straight line out of the peak and this lets it take it
      const wedged = cf.hitsWall(upx[i], upy[i], WALL_R);
      let nx = upx[i] + dxT;
      if (!wedged && cf.hitsWall(nx, upy[i], WALL_R)) {
        const cX =
          dxT > 0
            ? Math.floor((nx + WALL_R) / CELL) * CELL - WALL_R
            : Math.ceil((nx - WALL_R) / CELL) * CELL + WALL_R;
        const fwd = dxT > 0 ? cX > upx[i] : cX < upx[i];
        if (fwd && !cf.hitsWall(cX, upy[i], WALL_R)) nx = cX;
        else {
          nx = upx[i];
          uvy[i] += Math.sign(uvy[i] || flowTmp.y || 1) * Math.abs(uvx[i]) * 0.6;
          uvx[i] = 0;
          aimX = 0; // face along the wall, not into it
        }
      }
      let ny = upy[i] + dyT;
      if (!wedged && cf.hitsWall(nx, ny, WALL_R)) {
        const cY =
          dyT > 0
            ? Math.floor((ny + WALL_R) / CELL) * CELL - WALL_R
            : Math.ceil((ny - WALL_R) / CELL) * CELL + WALL_R;
        const fwd = dyT > 0 ? cY > upy[i] : cY < upy[i];
        if (fwd && !cf.hitsWall(nx, cY, WALL_R)) ny = cY;
        else {
          ny = upy[i];
          uvx[i] += Math.sign(uvx[i] || flowTmp.x || 1) * Math.abs(uvy[i]) * 0.6;
          uvy[i] = 0;
          aimY = 0;
        }
      }
      upx[i] = clamp(nx, WALL_R, W - WALL_R);
      upy[i] = clamp(ny, WALL_R, H - WALL_R);

      // animation state. THE FACING is where the drive is pointed (aimX,
      // above): the body turns toward it at its steady rate, and the
      // chassis (Mindustry baseRotation) toward the same bearing but only
      // as fast as the unit is REALLY moving — shoved units swivel
      // feet-last, and a unit held still by a crowd keeps its feet where
      // they were. The legs and the walk cycle read what actually happened
      // this frame, since a footfall belongs where the foot landed.
      // ...and a drive too small to be a drive does not steer anything:
      // what is left under a body with nowhere to go is a velocity
      // bleeding off, and while its direction is stable the threshold
      // keeps the last few thousandths of a pixel from aiming anybody. The
      // deadzone is a fraction of this unit's own pace, so it scales with
      // a slowed or a hurried unit rather than being a pixel count that
      // means different things to different kinds
      const mdx = upx[i] - x0, mdy = upy[i] - y0;
      const len = Math.sqrt(mdx * mdx + mdy * mdy);
      const stride = uspd[i] * dt;
      // the aim through the drive's own filter (see uaimx): the drift's
      // random increment and a probe's on/off are white noise on top of a
      // bearing that is otherwise steady, and this takes them out at the
      // same time constant the velocity turns on, so the body comes round
      // a corner exactly as fast as the motion does
      uaimx[i] += (aimX - uaimx[i]) * steer;
      uaimy[i] += (aimY - uaimy[i]) * steer;
      const ax = uaimx[i], ay = uaimy[i];
      const aimL = Math.sqrt(ax * ax + ay * ay);
      if (aimL > Math.max(1e-4, uspd[i] * TURN_DEAD)) {
        const ang = Math.atan2(ay, ax);
        const trot = KIND_ROT[ukind[i]] * dt;
        urot[i] += clamp(Sim.angleDiff(urot[i], ang), -trot, trot);
        if (!fly && len > 1e-4) {
          const cap = ROT_SPD * Math.min(1, len / stride) * dt;
          ubrot[i] += clamp(Sim.angleDiff(ubrot[i], ang), -cap, cap);
        }
      }
      if (!fly && len > Math.max(1e-4, stride * TURN_DEAD)) uwalk[i] += len;
      // legs walk on the chassis angle this frame settled on. A standing
      // unit still runs the pass — its feet ease back under it
      const gait = KIND_LEGS[ukind[i]];
      if (gait) this.updateLegs(i, gait, mdx, mdy, len, dt);
      const chain = KIND_SEGS[ukind[i]];
      if (chain) this.updateSegments(i, chain, len, dt);
      if (nav) this.updateWake(i, dt, water[ci] !== 0);
    }
    // the exits, highest slot first so each swap-remove only ever moves a
    // row this list has already finished with
    // the dead first, then the leakers: a piece can only be one of the two
    // and both lists were gathered on the same descending walk, so the
    // order is only about reading the code
    if (slain) for (const i of slain) this.killUnit(i);
    if (leaked) for (const i of leaked) this.leakCrosser(i);
  }

  /**
   * One tick of a hull's wake: Trail.update, subsampled (see WAKE_PTS).
   *
   * Mindustry pushes a point every tick and drops the oldest once the
   * buffer is full; this pushes one every KIND_WAKE_DT seconds and does
   * the same, so the ring holds the same SPAN of history at a fraction of
   * the points. The timer runs whether the tank moved or not — one held
   * still by a crowd stops laying new water down and its wake shortens to
   * a puddle under it, which is exactly what a stalled Trail does.
   *
   * ASHORE THERE IS NO WAKE. The trail is dropped whole the moment a tank
   * leaves the water rather than drained point by point, because the strip
   * the renderer draws joins the live hull to the oldest sample it holds
   * (pushWake): a trail that emptied slowly would drag foam across the
   * beach behind a tank that had already climbed it. It lays a fresh one
   * from nothing when it swims again.
   */
  private updateWake(i: number, dt: number, afloat: boolean): void {
    if (!afloat) {
      this.uwakeN[i] = 0;
      return;
    }
    this.uwakeT[i] -= dt;
    if (this.uwakeT[i] > 0) return;
    const step = KIND_WAKE_DT[this.ukind[i]];
    // one sample per call however far the clock overran (a huge frame, or
    // 8x game speed): the next is due a full step from now, and catching
    // up by pushing several copies of one position would only lay a
    // pile-up of identical points
    this.uwakeT[i] += step > 0 ? step : 1;
    if (this.uwakeT[i] < 0) this.uwakeT[i] = step;
    const off = i * WAKE_PTS;
    const n = this.uwakeN[i];
    if (n < WAKE_PTS) {
      this.uwakeX[off + n] = this.upx[i];
      this.uwakeY[off + n] = this.upy[i];
      this.uwakeN[i] = n + 1;
      return;
    }
    // full: shuffle the oldest out. WAKE_PTS is eight, so the copy is
    // cheaper than the branch a ring's head index would cost every read
    for (let k = 0; k < WAKE_PTS - 1; k++) {
      this.uwakeX[off + k] = this.uwakeX[off + k + 1];
      this.uwakeY[off + k] = this.uwakeY[off + k + 1];
    }
    this.uwakeX[off + WAKE_PTS - 1] = this.upx[i];
    this.uwakeY[off + WAKE_PTS - 1] = this.upy[i];
  }

  /**
   * Push units out of freshly blocked cells (after tower placement).
   *
   * A NAVAL TANK IS IN THIS PASS NOW, read against its own field. It used
   * to be skipped: a structure never stands on water, so a hull reading as
   * blocked could only be one on the shore of its own mirror-image field,
   * and shoving it to the nearest open GROUND cell would have beached it
   * for good. A tank shares the walkers' ground, so a building can land on
   * top of one exactly as it can on an ironhide1 — and the cell it is moved to
   * is one its own mask calls open, which is ground or water either way.
   * Flyers stay out: they are allowed over walls, and nothing should
   * teleport one off a mountain.
   */
  private unstickUnits(): void {
    const { upx, upy, ukind, unav } = this;
    for (let i = 0; i < this.n; i++) {
      if (KIND_FLYING[ukind[i]]) continue;
      const field = unav[i] !== 0 ? this.navalField : this.field;
      if (!field.hitsWall(upx[i], upy[i], WALL_R)) continue;
      const cx = clamp((upx[i] / CELL) | 0, 0, COLS - 1);
      const cy = clamp((upy[i] / CELL) | 0, 0, ROWS - 1);
      let done = false;
      for (let r = 1; r <= 3 && !done; r++) {
        for (let dy = -r; dy <= r && !done; dy++) {
          for (let dx = -r; dx <= r && !done; dx++) {
            const nx = cx + dx, ny = cy + dy;
            if (nx < 1 || ny < 1 || nx >= COLS - 1 || ny >= ROWS - 1) continue;
            if (field.walk[ny * COLS + nx]) continue;
            upx[i] = (nx + 0.5) * CELL + (Math.random() - 0.5) * 6;
            upy[i] = (ny + 0.5) * CELL + (Math.random() - 0.5) * 6;
            done = true;
          }
        }
      }
    }
  }

  // ---------- towers & projectiles ----------

  /** smallest signed difference a -> b in radians */
  private static angleDiff(a: number, b: number): number {
    let d = (b - a) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return d;
  }

  // ---------- shieldTowers & tower health ----------

  /**
   * The shieldTowers' own clock: the spawn timer rolling new ones, dome swell,
   * shield regen, and the whitening flash fading exactly as a unit's does.
   * Also settles domesUp, the one-boolean gate the projectile pass reads
   * before paying for an absorb sweep nothing could pass. A no-op on every
   * run the mutator was not rolled for (shieldTowers stays empty).
   */
  private updateShieldTowers(dt: number): void {
    // the timer idles at the cap and while the rule is off — a shield tower
    // rises SHIELD_TOWER_SPAWN_PERIOD after the previous ATTEMPT, not after a
    // death, so a player who clears them fast simply sees the next sooner
    if (this.shieldTowersOn) {
      const alive = this.shieldTowers.reduce((n2, s) => n2 + (s.hp > 0 ? 1 : 0), 0);
      if (alive < SHIELD_TOWER_MAX_ALIVE) {
        this.shieldTowerT -= dt;
        if (this.shieldTowerT <= 0) {
          this.shieldTowerT = SHIELD_TOWER_SPAWN_PERIOD;
          this.trySpawnShieldTower();
        }
      }
    }
    this.domesUp = false;
    for (const s of this.shieldTowers) {
      if (s.hp <= 0) continue; // dead for good — its slot is a tombstone
      // ForceFieldAbility.radiusScale: the dome swells in rather than snapping
      s.scale = Math.min(1, s.scale + dt * 2);
      if (s.shieldAlpha > 0) s.shieldAlpha = Math.max(0, s.shieldAlpha - dt * (60 / 15));
      // THE DOME REFORMS WHOLE (see SHIELD_TOWER_SHIELD_DELAY): ten seconds
      // after it BROKE the whole thing is back. This clock is the only
      // shield regeneration the rule has — a dented dome does not tick up,
      // a broken one does not trickle, and nothing here restarts a running
      // clock, so sustained fire buys one window on the body and not an
      // indefinite one
      if (s.regenT > 0) {
        s.regenT -= dt;
        if (s.regenT <= 0) {
          s.shield = s.shieldMax;
          s.shieldAlpha = 1; // the flash a fresh dome comes back on
          this.pushFxCol(s.x, s.y, 0.5, FxKind.ShieldWave, 0, 0, TEAM_CRUX_RGB);
        }
      }
      if (s.shield > 0 && s.scale > 0.5) this.domesUp = true;
    }
  }

  /**
   * Roll a spot and raise a shield tower on it. A candidate 3x3 has to be
   * GROUND A TURRET COULD HAVE STOOD ON AND NOTHING IS STANDING ON: open
   * floor, off the core, off the swarm's doors, and clear of every
   * structure and every other dome.
   *
   * IT ASKS THE PLACEMENT RULE ITSELF (board.ts groundClear, domesClear)
   * RATHER THAN SPELLING THE GROUND OUT AGAIN. This roller used to want
   * BUILDABLE ROCK — blocked cells a turret could be built on top of —
   * which was the right test while turrets stood on the highground. They
   * stand on the FLOOR now, and the roller was never told: a rule whose
   * whole cost is an emplacement the player does not get was quietly
   * spending rock nobody wanted, which is why every dome on a map was
   * sitting on a hill. The two predicates below are the same ones the
   * build cursor is coloured by, so "somewhere a turret could go" has one
   * definition and the rule cannot drift off the board's again.
   *
   * WHAT THE OLD TEST CARRIED FOR FREE HAS TO BE ASKED FOR NOW. Rock was
   * already impassable, already dry and already nowhere a door could be,
   * so a footprint on it could not cork a drop zone or sit in water
   * whatever the roll said. On open floor none of that is true by
   * construction — groundClear is what refuses the doors and the core,
   * and the deep water is in `blocked` with them.
   *
   * Two dozen tries, then GIVE UP until the next period. That is the whole
   * failure mode and it is deliberate: a board whose free ground the player
   * has built out raises nothing at all, rather than the rule reaching for
   * a square that is taken. Nothing the player owns is ever displaced,
   * buried or disabled by a shield tower — it competes for empty ground
   * and loses when there is none.
   */
  private trySpawnShieldTower(): void {
    const grids = this.boardGrids();
    for (let tries = 0; tries < 24; tries++) {
      const gx = 1 + ((Math.random() * (this.terrain.cols - SHIELD_TOWER_SIZE - 2)) | 0);
      const gy = 1 + ((Math.random() * (this.terrain.rows - SHIELD_TOWER_SIZE - 2)) | 0);
      // TURRET GROUND ONLY — and `occupied` is the board's own index of
      // what stands where (claimGround writes it in the same breath as
      // cellTower), so the core and every turret the player owns are
      // refused by the same sweep that refuses rock. The board the player
      // built is theirs: a mutator that buried it would be a mutator that
      // undid their choices, so a roll that lands on one is thrown away
      // and a map with no free ground left raises nothing this period.
      if (!groundClear(grids, gx, gy, SHIELD_TOWER_SIZE)) continue;
      // ...and never on top of another shield tower — the same test the
      // player's own placement is refused by, read off the same array, so
      // a dome's ground is a dome's ground whoever is asking for it
      if (!domesClear(this.shieldTowers, SHIELD_TOWER_SIZE, gx, gy, SHIELD_TOWER_SIZE)) continue;

      // the spot holds — raise it. BOTH POOLS ARE SET BY THE WAVE IT RISES
      // ON and fixed there for the rest of the run (shieldTowerWaveScale:
      // ten per cent a wave, compounding), then multiplied by the run's
      // shield multiplier, so a shield tower rolled alongside Overshields
      // is the five-times obstacle that rule promises everywhere else.
      // Nothing re-reads the wave afterwards — an old shield tower left
      // standing stays as cheap as the wave that made it
      const wave = this.currentWave();
      const pool = this.shieldScale * shieldTowerWaveScale(wave);
      // PAST SHIELD_TOWER_MEGA_WAVE EVERY NEW SHIELD TOWER IS A MEGA ONE —
      // which now buys the DOME's reach and nothing else, because the wave
      // curve above is already carrying the pools past it (see mutation.ts)
      const mega = wave >= SHIELD_TOWER_MEGA_WAVE;
      const idx = this.shieldTowers.length;
      this.shieldTowers.push({
        gx,
        gy,
        x: (gx + SHIELD_TOWER_SIZE / 2) * CELL,
        y: (gy + SHIELD_TOWER_SIZE / 2) * CELL,
        hp: SHIELD_TOWER_HP * pool,
        hpMax: SHIELD_TOWER_HP * pool,
        shield: SHIELD_TOWER_SHIELD * pool,
        shieldMax: SHIELD_TOWER_SHIELD * pool,
        shieldAlpha: 0,
        scale: 0,
        domeR: mega ? SHIELD_TOWER_MEGA_DOME_R : SHIELD_TOWER_DOME_R,
        mega,
        regenT: 0,
      });
      // NOTHING TOUCHES THE FLOW FIELD, and now that a dome stands on open
      // floor that is a CHOICE rather than a consequence. A building the
      // SWARM owns holds no ground against the swarm — the same rule a
      // conquered turret is released under (conquerTower): its bodies will
      // not shoot it, so a wall they cannot pass and will not break is a
      // wall they would stand at forever. So a dome is solid to the
      // player's placement (board.ts domesClear) and thin air to the
      // horde walking under it: raising one changes no route and costs no
      // Dijkstra, which is what makes a cap of twenty affordable
      this.pushFxCol(this.shieldTowers[idx].x, this.shieldTowers[idx].y, 0.7, FxKind.ShieldWave, 0, 0, TEAM_CRUX_RGB);
      this.pushFx(this.shieldTowers[idx].x, this.shieldTowers[idx].y, 0.35, FxKind.Shockwave);
      return;
    }
  }

  /**
   * All shield tower damage funnels through here: shield first — the dome
   * shelters the body for exactly as long as it stands — then the body.
   * A hit that leaves the dome short of whole STARTS the reform clock if
   * it is not already running, and a hit never restarts a clock that is:
   * the dome is coming back SHIELD_TOWER_SHIELD_DELAY after it went, and
   * no amount of fire postpones that. A body at zero DIES FOR GOOD: its
   * ground is open again and its slot in the array becomes a tombstone.
   */
  private damageShieldTower(s: ShieldTower, dmg: number): void {
    if (s.hp <= 0) return;
    if (s.shield > 0) {
      s.shield -= dmg;
      s.shieldAlpha = 1;
      if (s.shield <= 0) {
        s.shield = 0;
        // BREAKING IT IS THE ONLY THING THAT STARTS THE CLOCK, and nothing
        // restarts it: a board that keeps shooting must not be able to
        // push the dome's return out in front of itself forever, which is
        // exactly what restarting on every hit did. A dome merely DENTED
        // stays dented — there is no trickle and no top-up anywhere in
        // this rule, only whole domes and broken ones
        s.regenT = SHIELD_TOWER_SHIELD_DELAY;
        // the dome pops the way a carrier's does — same effect, same red
        this.pushFxCol(
          s.x, s.y, 0.5, FxKind.ShieldBreak,
          0, s.domeR * s.scale, TEAM_CRUX_RGB,
        );
      }
      return;
    }
    s.hp -= dmg;
    if (s.hp > 0) return;
    s.hp = 0;
    s.scale = 0;
    s.shield = 0;
    const idx = this.shieldTowers.indexOf(s);
    // nothing to hand back and no lane to reopen: a shield tower rose on
    // FREE GROUND and only free ground (see trySpawnShieldTower), so it
    // never held a turret, and it was never in the fields for the swarm's
    // routes to have known it existed. What its death DOES give back is
    // the emplacement — the cells go quiet in domesClear the moment hp
    // hits zero, so the player may build there on the next frame
    // a dead shield tower is no longer anyone's mark
    if (this.inspectShieldTower === idx) this.inspectShieldTower = -1;
    this.pushFx(s.x, s.y, 0.6, FxKind.Breach);
    this.pushFx(s.x, s.y, 0.5, FxKind.Shockwave);
  }

  /**
   * An instant weapon's hit on a shield tower (see fireShot): the sweeps behind
   * laser/lightning/rail/ray know only the unit arrays, so a volley aimed
   * at a shield tower hands its damage over directly, with the hit effect at the
   * body's rim on the shot's own line so the beam visibly ENDS somewhere.
   */
  private shieldTowerHit(s: ShieldTower, dmg: number, fx: BulletFx | undefined, angle: number, col?: RGB): void {
    if (s.hp <= 0) return;
    this.damageShieldTower(s, dmg);
    this.bulletFx(
      fx,
      s.x - Math.cos(angle) * SHIELD_TOWER_BODY_R,
      s.y - Math.sin(angle) * SHIELD_TOWER_BODY_R,
      angle,
      col,
    );
  }

  /** the nearest live shield tower within reach — what an IDLE turret spends its
   *  reload on, and only an idle one (see fireTowers) */
  private idleShieldTowerFor(t: Tower, r2t: number): number {
    let best = -1, bd = r2t;
    for (let i = 0; i < this.shieldTowers.length; i++) {
      const s = this.shieldTowers[i];
      if (s.hp <= 0) continue;
      const dx = s.x - t.x, dy = s.y - t.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bd) {
        bd = d2;
        best = i;
      }
    }
    return best;
  }

  /**
   * STRUCTURE DAMAGE. At zero the structure is WRECKED: a blast, the
   * demolish puff, and it is gone — the board is a thing the swarm can
   * take apart, and its ground is the swarm's again (removeTower).
   *
   * WHO CALLS THIS: every unit on the field (updateUnitWeapons and the
   * shots it fires — weapons.ts is the arsenal), and the Volatile
   * mutator's blast. The swarm attack-moves: it walks at the base and
   * hits whatever stands in the way, and a wall across its route is a
   * wall it chews through.
   */
  private damageTower(t: Structure, dmg: number, pierceArmor = false): void {
    // PLATING, the way a body wears it (constants.ts TowerStats.armor): a
    // flat shave off this hit, floored at a tenth, through the same
    // applyArmor the swarm's armour goes through. It comes off AFTER the
    // unit-damage dial has scaled the hit, as Mindustry applies it to the
    // final amount. The core wears none — its pool is written on its own
    // (CORE_HP) and its fall is the run ending, not a structure dying
    //
    // ...UNLESS THE CALLER SAYS OTHERWISE. `pierceArmor` is the rot's door
    // (Tower.poison), and the swarm's own burning status has exactly the
    // same exemption on the other side of the field: a status is not a hit,
    // so there is nothing for plating to shave. It is also the whole reason
    // the Venom spitters and the Ground mechs are different problems.
    if (!pierceArmor && !isCore(t)) dmg = Sim.applyArmor(dmg, t.spec.armor);
    // THE CART TAKES ITS HIT SOMEWHERE ELSE (damageConvoy). Everything
    // below this line answers the death of a BUILDING — a revive, a
    // payout, the virus moving on, a conquest, the ground being handed
    // back — and a convoy is a vehicle with a mission riding on it. The
    // guard is on the list being non-empty, so every other board pays one
    // compare per structure hit.
    if (this.convoys.length > 0) {
      const c = this.convoyOf(t);
      if (c) {
        this.damageConvoy(c, dmg);
        return;
      }
    }
    t.hp -= dmg;
    if (t.hp > 0) return;
    t.hp = 0;
    // THE CORE FALLING IS THE RUN ENDING (lost): it stays on the board,
    // dark, under the crowd that took it down
    const big = isCore(t) ? 1.6 : 1;
    this.pushFx(t.x, t.y, 0.5 * big, FxKind.Breach);
    this.pushFx(t.x, t.y, 0.35 * big, FxKind.Death);
    if (isCore(t)) return;
    // A CONQUERED TURRET IS ALREADY THE SWARM'S and has nothing left to
    // change into: it stands up on its own charges while it has any
    // (conquerTower hands it back the ones it was born with, and the
    // Phoenix roll is the player's alone), and is otherwise wrecked, with its
    // ground open again. Nothing conquers back.
    if (t.team === "enemy") {
      if (this.reviveTower(t)) return;
      this.removeTower(t);
      return;
    }
    // THE RELICS THAT ANSWER A DEATH (mods.ts) get their say BEFORE the
    // ground is given back, because one of them refuses the death outright
    if (this.reviveTower(t)) return;
    // ...and so do the relics that answer a turret being LOST, which is
    // what a conquest is from the player's side: Salvage Insurance pays
    // out and Last Volley charges the neighbours, because the thing they
    // are for — a hole in the line, right here, right now — has happened
    // whether the wreck is cleared away or turned round
    this.payOutTower(t);
    // ...and the MECH VIRUS moves on (mutation.ts). Before the conquest
    // below, so the swarm never takes an infected building: the thing is
    // theirs, it does not eat their own, and a turret that changes sides
    // changes sides clean
    this.spreadVirusFrom(t);
    // CONQUEST (mutation.ts): the wreck changes sides instead of leaving.
    // It is asked AFTER every revive has been refused — a turret that can
    // still stand up stands up on the player's side, and only the death
    // nothing answers is a conquest
    if (this.conquestOn) {
      this.conquerTower(t);
      return;
    }
    this.removeTower(t);
  }

  /**
   * CONQUEST (mutation.ts): the turret changes sides where it stands.
   *
   * NOTHING IS REMOVED AND NOTHING IS PLACED. The record stays in
   * `towers`, its cells keep pointing at it, and the routing never learns
   * that anything happened — which is the point: the swarm walks around
   * the turret it just took exactly as it walked around the turret it was
   * shooting, and the lane the player was holding stays held by the thing
   * that is now holding it against them.
   *
   * WHAT IT KEEPS is everything that makes it the turret it was: the
   * kind, the footprint, the attributes it rolled at its placement
   * (Tower.mods) and the RESOLVED stats those composed (Tower.spec) — a
   * giant braced repeater comes back a giant braced repeater. What it is
   * handed back is the revives it was BORN with (Tower.revivesMax), so
   * an Undying board arms the swarm with turrets that have to be killed
   * twice. What it never gets is the player's Phoenix roll (an unlimited
   * flip the RUN owns, held to the player's side in reviveTower), a share
   * of the player's later modules (refreshSpecs skips it), or its full
   * pool: it rises on CONQUEST_HP of its ceiling and
   * fires at CONQUEST_RATE of its rate.
   */
  private conquerTower(t: Tower): void {
    t.team = "enemy";
    this.enemyTowers++;
    t.hp = t.hpMax * CONQUEST_HP;
    // as stubborn as it was for the player, and no luckier: the hard
    // charges come back (reviveTower keeps the Phoenix roll to the
    // player's own side)
    t.revives = t.revivesMax;
    // ...and as fast as the rule says, on top of whatever the ground did
    // to it (Hydrophobic's waterlogging is a property of where it stands,
    // and changing sides does not move it off the water)
    t.fireRate *= CONQUEST_RATE;
    // it holds nothing of what it was aiming at: the mark, the volley, the
    // charge and any beam it was burning all belong to the other side
    t.target = -1;
    t.targetIdx = -1;
    t.targetT = Math.random() * TARGET_INTERVAL;
    t.aimShieldTower = -1;
    t.aimTower = null;
    t.burstLeft = 0;
    t.chargeT = -1;
    t.beamT = -1;
    t.beamStr = 0;
    t.boostT = 0;
    t.cd = t.spec.reload;
    // swung round at what the swarm is here for, so the barrel reads as
    // having turned the moment it is taken
    t.angle = Math.atan2(this.core.y - t.y, this.core.x - t.x);
    // THE SWARM WALKS STRAIGHT PAST ITS OWN. A building of the PLAYER's
    // stands in the swarm's way — solid to the body, soft to the path, and
    // a body pressed against one shoots it (canPlace: sealing the map is
    // allowed precisely because a seal is a fight at the wall). NONE of
    // that can be true of a building the swarm owns: its bodies will not
    // shoot it, so a wall they cannot pass and will not break is a wall
    // they would stand at forever — and the board a player sealed is
    // exactly the board where the wall changes hands. So a conquered
    // turret stops holding ground altogether: the lane it was closing
    // opens, the swarm streams past the gun that used to be shooting it,
    // and no arrangement of turrets anywhere can strand a wave.
    //
    // IT STILL OWNS ITS CELLS IN THE STRUCTURE GRID (cellTower), which is
    // what shots collide with and what refuses a placement on top of it —
    // the ground is the swarm's to stand a gun on, not the player's to
    // build over.
    if (this.cellTower[t.gy * COLS + t.gx] === t) {
      const { blocked } = this.terrain;
      for (let y = t.gy; y < t.gy + t.size; y++)
        for (let x = t.gx; x < t.gx + t.size; x++) {
          const i = y * COLS + x;
          if (blocked[i]) continue; // rock was never this turret's to open
          this.field.walk[i] = 0;
          this.field.soft[i] = 0;
          this.navalField.walk[i] = 0;
          this.navalField.soft[i] = 0;
        }
      // ...and the routes over it are re-solved when the board settles,
      // the same deferral every other structure change gets — and, like
      // every other structure change, a solve already under way is left to
      // finish rather than thrown away (claimGround, abortSolves)
      this.fieldDirty = true;
      this.navalDirty = true;
      this.fieldQuiet = 0;
    }
    // it is nobody's to select or sell any more, and the count-dependent
    // rungs have one turret fewer to read
    this.selStructs.delete(t);
    this.oweCount(t.kind); // the swarm took it: owed, paid at the step's end
    // the swarm's own colours over the taking: the crux ring, and the
    // shockwave that says a thing on the board just changed hands
    this.pushFxCol(t.x, t.y, 0.7, FxKind.ShieldWave, 0, (t.size * CELL) / 2, TEAM_CRUX_RGB);
    this.pushFx(t.x, t.y, 0.4, FxKind.Shockwave, 0, t.size * CELL);
  }

  /**
   * UNDYING LEGION and PHOENIX PROTOCOL (mods.ts): the two relics that
   * turn a wreck into a turret standing at full health where it was.
   *
   * IT IS A REFUSAL, NOT A REBUILD. Nothing is removed and nothing is
   * placed — the structure never leaves the board, never gives its ground
   * back, and never drops the target it was tracking, so a line does not
   * open for the frame it takes to come back. A revive is therefore also
   * invisible to the routing, which is the whole reason to do it this way.
   *
   * The hard charges go first and the Phoenix roll is only reached when
   * there are none left: a run carrying both should spend the certainty
   * before it spends the chance. The Phoenix roll has NO once-per-turret
   * gate any more — it is a coin flip every time the turret falls, which
   * is the whole of what makes it a relic (mods.ts PHOENIX_CHANCE).
   */
  private reviveTower(t: Tower): boolean {
    let rose = false;
    if (t.revives > 0) {
      t.revives--;
      rose = true;
    } else if (t.team === "player" && this.relics.has("phoenix") && Math.random() < PHOENIX_CHANCE) {
      // PHOENIX IS THE RUN'S LUCK, NOT THE TURRET'S (mods.ts): an
      // unlimited coin flip the player bought. A turret the swarm has
      // taken (Conquest, mutation.ts) keeps the hard charges it was born
      // with — those are part of the building — and never this: an
      // endless roll on the swarm's side would make every conquered
      // turret unkillable for exactly the runs that own the relic
      rose = true;
    }
    if (!rose) return false;
    t.hp = t.hpMax;
    // A STAND-UP IS A NEW BUILDING IN AN OLD ONE'S PLACE, so it comes back
    // clean: every status a turret can be under goes with the death it
    // just refused — the Mech Virus (mutation.ts), which makes the two
    // revive relics the one real answer to that rule, and the spitters'
    // rot with it. Nothing that is a property of WHERE it stands is
    // touched: a waterlogged turret is waterlogged because of the ground
    // under it (Hydrophobic), and standing up does not move it
    t.virus = false;
    t.poison = 0;
    t.poisonUnit = 0;
    t.poisonT = 0;
    // the support line's own green, on a structure rather than a body —
    // the one thing on the field that says "this did not die"
    this.pushFx(t.x, t.y, 0.6, FxKind.HealWave, 0, (t.size * CELL) / 2);
    this.pushFx(t.x, t.y, 0.4, FxKind.Heal);
    return true;
  }

  /**
   * SALVAGE INSURANCE and LAST VOLLEY (mods.ts): what a turret that is
   * really gone leaves behind. Called once, from the death above, after
   * every revive has been refused and before the ground is released.
   */
  private payOutTower(t: Tower): void {
    // insurance pays EVERY wreck, no roll: a certain two thousand is what
    // makes a line being chewed through into a line funding its own
    // replacement (mods.ts INSURANCE_SCRAP)
    if (this.relics.has("insurance")) {
      this.scrap += INSURANCE_SCRAP;
      this.scrapEarned += INSURANCE_SCRAP;
      this.pushFx(t.x, t.y, 0.5, FxKind.Absorb);
    }
    if (this.relics.has("lastVolley")) {
      // the dying turret dumps its charge into everything nearby, itself
      // excluded — it is not on the board a tick from now
      const r = LAST_VOLLEY_TILES * CELL;
      const r2 = r * r;
      for (const o of this.towers) {
        if (o === t || o.team !== "player") continue;
        const dx = o.x - t.x, dy = o.y - t.y;
        if (dx * dx + dy * dy > r2) continue;
        o.boostT = Math.max(o.boostT, LAST_VOLLEY_SECONDS);
      }
      this.pushFx(t.x, t.y, 0.45, FxKind.ShieldWave, 0, r);
    }
  }

  /**
   * CASCADE CHARGES (relics.ts): every queued detonation, set off.
   *
   * IT IS A CHAIN AND IT IS BOUNDED. A blast kills, a kill queues another
   * blast, and the loop walks the queue by index so a detonation that
   * lands one goes off in the same frame — which is what makes a wall of
   * heavies unzip rather than pop one hull at a time. CASCADE_CHAIN_CAP is
   * the stop: a pathological board cannot spend a whole frame detonating,
   * and anything past the cap simply does not go off. Nothing is carried
   * over to the next frame, because a charge that fires a second late
   * lands on a board that has moved.
   *
   * IT RUNS WHERE NO REMOVAL IS IN FLIGHT — once a frame, after every pass
   * that can kill has finished (Sim.update). Sim.splash reaps its own dead
   * from the highest index down, exactly as every other blast in the game
   * does, so a detonation may safely kill.
   */
  private drainCascades(): void {
    if (this.cascades.length === 0) return;
    for (let k = 0; k < this.cascades.length && k < CASCADE_CHAIN_CAP; k++) {
      const c = this.cascades[k];
      // AIR AND GROUND BOTH. A hull coming apart does not check what is
      // flying over it, and the air T5s are exactly the swarm this relic
      // is an answer to
      this.splash(c.x, c.y, c.r, c.dmg, true, true);
      this.pushFx(c.x, c.y, 0.45, FxKind.Shockwave, 0, c.r);
    }
    this.cascades.length = 0;
  }

  /**
   * VOLATILE (mutation.ts): the dead body's parting blast, billed to every
   * standing tower whose footprint it reaches. Tier decides the damage and
   * the body's own hitbox widens the reach — an ironhide3 pops like a shell,
   * an ironhide1 like a firecracker. Towers only; the swarm never hurts itself.
   */
  private volatileBlast(x: number, y: number, urad: number, kind: number): void {
    // one tier index into both tables: the reach climbs with the tier and
    // the damage does too, and the body's own hitbox widens either
    const tier = Math.min(KIND_TIER[kind], VOLATILE_DMG.length - 1);
    const reach = VOLATILE_RADIUS[tier] + urad;
    const dmg = VOLATILE_DMG[tier];
    // over a copy: a wrecked tower leaves the list under the loop. The
    // core is a structure like any other to a blast
    for (const t of [...this.towers, this.core]) {
      if (!isCore(t) && t.team !== "player") continue; // the swarm never hurts its own
      const half = (this.sizeOf(t) * CELL) / 2;
      const r = reach + half;
      const dx = t.x - x, dy = t.y - y;
      if (dx * dx + dy * dy < r * r) this.damageTower(t, dmg);
    }
    // the ring is sized from the blast itself (see the Shockwave branch in
    // the renderer), so the pop a player sees is the pop that hit them
    this.pushFx(x, y, 0.35, FxKind.Shockwave, 0, reach);
  }

  // ---------- the player's inspect mark ----------

  /**
   * Mark one unit as THE THING THE PANEL IS ANSWERING ABOUT (Game.inspect)
   * — what it is, how much of it is left, what has landed on it. It is not
   * an order: no turret's aim changes for it (see fireTowers). The mark is
   * a uid plus an index hint maintained across swap-removes, exactly as
   * the force-field carrier list is — it dies with the unit and is never
   * dangling.
   */
  setInspectUnit(idx: number): void {
    if (idx < 0 || idx >= this.n) return;
    this.inspectUid = this.uid[idx];
    this.inspectIdx = idx;
    this.inspectShieldTower = -1;
    this.inspectTower = null;
  }

  /** mark one shield tower for the panel — same contract, the other kind */
  setInspectShieldTower(idx: number): void {
    if (idx < 0 || idx >= this.shieldTowers.length || this.shieldTowers[idx].hp <= 0) return;
    this.inspectShieldTower = idx;
    this.inspectUid = -1;
    this.inspectIdx = -1;
    this.inspectTower = null;
  }

  /**
   * ...and on one of the SWARM'S CONQUERED TURRETS (Conquest): a taken
   * emplacement reads as a building, pools and plating and all, and the
   * panel is the only place to read it.
   */
  setInspectTower(t: Tower | null): void {
    if (!t || t.team !== "enemy" || this.cellTower[t.gy * COLS + t.gx] !== t) return;
    this.inspectTower = t;
    this.inspectUid = -1;
    this.inspectIdx = -1;
    this.inspectShieldTower = -1;
  }

  /** the SWARM's building under a world point, if one stands there —
   *  what a tap marks, and the mirror of towerAt */
  enemyTowerAt(px: number, py: number): Tower | null {
    if (this.enemyTowers === 0) return null;
    const t = this.structureAt(px, py, "enemy");
    return t && !isCore(t) ? t : null;
  }


  clearInspect(): void {
    this.inspectUid = -1;
    this.inspectIdx = -1;
    this.inspectShieldTower = -1;
    this.inspectTower = null;
  }

  /**
   * ONE LEFT CLICK ON THE BOARD — everything it can mean, in the order a
   * player means them. It used to be a chain of questions Game asked the
   * sim one after another (unitAt, then shieldTowerAt, then ...), each
   * with an answer the next depended on; that is a conversation, and a
   * conversation cannot cross a thread. Asked HERE it is one command with
   * four numbers in it, and every answer is local.
   *
   * With `like` (ctrl, or the second click of a double): everything LIKE
   * the thing under the cursor and near it, buildings gathered the way a
   * squad is — click one of them. The near miss is forgiven here too, so
   * each half is asked tight first and only once that came back empty with
   * the forgiving reach. Nothing gathered leaves the click to be an
   * ordinary one rather than nothing.
   *
   * The ordinary click:
   *
   *   an ENEMY   — ASK WHAT IT IS: the panel answers for the tapped body
   *                (setInspectUnit). It is a question and nothing else —
   *                no turret's aim moves for it, and nothing is drawn over
   *                the body itself
   *   a SHIELD TOWER   — the same question, of the mutator's structure
   *   a BUILDING OF OURS — SELECT IT, which is what draws its range ring
   *                and what the delete key sells. Shift (`add`) adds it to
   *                whatever is already held
   *   nothing    — clear everything: selection and mark alike
   *
   * Bodies first because they are small, moving, and the thing a panicking
   * player is jabbing at; a building is big, still, and easy to hit on
   * purpose. Everything is asked TIGHT first and then, only once all of it
   * has come back empty, asked again with the forgiving reach
   * (PICK_LENIENT) — so a near miss lands on what it nearly hit instead of
   * clearing the board, and nothing precise is ever taken from a click
   * that did hit something.
   *
   * A SHIFT-CLICK ON NOTHING KEEPS THE SELECTION. Adding one building at
   * a time means missing one now and then, and a miss that emptied the
   * hand would make the gesture unusable.
   */
  click(px: number, py: number, add: boolean, like: boolean): void {
    if (like)
      for (const structPad of [0, PICK_STRUCT_PAD] as const)
        if (this.selectStructsLike(px, py, SEL_LIKE_STRUCT_R, add, structPad) > 0) return;
    // a plain click replaces the selection; a mark on an enemy clears it too
    const replaced = (): void => {
      if (!add) this.clearStructSelection();
    };
    const ui = this.unitAt(px, py);
    if (ui >= 0) {
      replaced();
      this.setInspectUnit(ui);
      return;
    }
    const si = this.shieldTowerAt(px, py);
    if (si >= 0) {
      replaced();
      this.setInspectShieldTower(si);
      return;
    }
    // a turret the swarm has taken (Conquest) is read like any other
    // enemy, and asked BEFORE the selection: it is not the player's to
    // select, so a click on one can only ever be the question
    const et = this.enemyTowerAt(px, py);
    if (et) {
      replaced();
      this.setInspectTower(et);
      return;
    }
    if (this.selectStructAt(px, py, add)) return;
    if (this.selectStructAt(px, py, add, PICK_STRUCT_PAD)) return;
    const lui = this.unitAt(px, py, PICK_LENIENT);
    if (lui >= 0) {
      replaced();
      this.setInspectUnit(lui);
      return;
    }
    if (add) return; // a shift-click on bare ground is not a change of mind
    this.clearAllSelection();
    this.clearInspect();
  }

  /**
   * THE MARKED BODY, as a live index — -1 when the mark is on something
   * else, on a body that has since died, or on nothing.
   *
   * A tap on an enemy is one thing and not two: a QUESTION — what is
   * that, and what is happening to it — which the inspector reads to
   * answer (Game.inspect). It used to be an order as well, every gun in
   * range dropping what it was doing for the tapped body; it is not one
   * any more.
   *
   * The revalidation is inspectMark's, for the same reason: indices are
   * recycled by swap-remove, so a uid that no longer sits at the hint is
   * a body that is gone.
   */
  get inspectedUnit(): number {
    return this.inspectIdx >= 0 && this.inspectIdx < this.n && this.uid[this.inspectIdx] === this.inspectUid
      ? this.inspectIdx
      : -1;
  }

  /** the marked SHIELD TOWER, or null — the same question of the mutator's
   *  structure. A dead one is not a mark, and its entry never moves */
  get inspectedShieldTower(): ShieldTower | null {
    const s = this.inspectShieldTower >= 0 ? this.shieldTowers[this.inspectShieldTower] : undefined;
    return s && s.hp > 0 ? s : null;
  }

  /** the marked TURRET OF THE SWARM'S (Conquest), or null. Held by
   *  reference, so the occupancy grid is what says it is still standing */
  get inspectedTower(): Tower | null {
    const t = this.inspectTower;
    return t && this.cellTower[t.gy * COLS + t.gx] === t ? t : null;
  }

  /**
   * Where the inspect mark should be drawn, in world px — the overlay's
   * arrow. `top` is above the target's art; null when nothing is marked
   * (or the marked unit has died since, which clears the mark for good).
   */
  inspectMark(): { x: number; y: number; top: number } | null {
    if (this.inspectTower) {
      const t = this.inspectTower;
      // a building that came down is not a mark any more, and the cells
      // are what know: nothing else is holding this reference
      if (this.cellTower[t.gy * COLS + t.gx] !== t) {
        this.inspectTower = null;
        return null;
      }
      return { x: t.x, y: t.y, top: t.y - (t.size * CELL) / 2 - 4 };
    }
    if (this.inspectShieldTower >= 0) {
      const s = this.shieldTowers[this.inspectShieldTower];
      if (!s || s.hp <= 0) return null;
      return { x: s.x, y: s.y, top: s.y - SHIELD_TOWER_SIZE * CELL * 0.75 };
    }
    if (this.inspectIdx >= 0 && this.inspectIdx < this.n && this.uid[this.inspectIdx] === this.inspectUid) {
      const i = this.inspectIdx;
      return { x: this.upx[i], y: this.upy[i], top: this.upy[i] - this.urad[i] * 2.4 - 6 };
    }
    return null;
  }

  /**
   * HOW BIG BODY `i` IS TO A CLICK, in world px — the sprite's radius
   * grown by PICK_MULT and floored at PICK_MIN, then scaled by the pass's
   * reach. Every hit-test the cursor makes goes through here, so the two
   * passes stay in step by construction.
   */
  private pickR(i: number, reach: number): number {
    return Math.max(this.urad[i] * PICK_MULT, PICK_MIN) * reach;
  }


  /**
   * THE PLAYER'S BUILDING UNDER A POINT — the mirror of myUnitAt, and the
   * core counts. `pad` grows the footprint outwards for the second, more
   * forgiving pass (PICK_STRUCT_PAD); at 0 it is the exact footprint, one
   * grid lookup and nothing more.
   */
  myStructAt(px: number, py: number, pad = 0): Structure | null {
    // the cart is not pickable either, for towerAt's reason: the selection
    // and the inspector are about BUILDINGS, and a hauler inspected would
    // print the stats of the turret its spec is a copy of
    const hit = this.structureAt(px, py);
    const exact = hit && this.isConvoy(hit) ? null : hit;
    if (exact || pad <= 0) return exact;
    let best: Structure | null = null, bd = Infinity;
    const near = (t: Structure): void => {
      const half = (this.sizeOf(t) * CELL) / 2 + pad;
      const dx = Math.abs(px - t.x), dy = Math.abs(py - t.y);
      if (dx > half || dy > half) return;
      const d = dx * dx + dy * dy;
      if (d < bd) {
        bd = d;
        best = t;
      }
    };
    for (const t of this.towers) if (t.team === "player") near(t);
    near(this.core);
    return best;
  }

  /** nothing of the player's BUILDINGS is selected any more */
  clearStructSelection(): void {
    this.selStructs.clear();
  }

  /** the selection, both halves of it: bodies and buildings */
  clearAllSelection(): void {
    this.clearStructSelection();
  }

  /** how many of the player's buildings are selected right now */
  get selectedStructN(): number {
    return this.selStructs.size;
  }

  /** ...and which, for the range rings drawn over them */
  get selectedStructs(): readonly Structure[] {
    return [...this.selStructs];
  }

  /**
   * IS THIS ONE PICKED. Asked of a building rather than answered with a list
   * of them, because the drawing side holds its own copies and a list of
   * references would mean nothing to it (snapshot.ts flattens the answer
   * onto each mirror instead).
   */
  isSelectedStruct(s: unknown): boolean {
    return this.selStructs.has(s as Structure);
  }


  /**
   * Select the building under a point, `add` toggling exactly as it does
   * for a body. Returns the one it hit, or null.
   */
  selectStructAt(px: number, py: number, add = false, pad = 0): Structure | null {
    const s = this.myStructAt(px, py, pad);
    if (!add) this.clearStructSelection();
    if (!s) return null;
    if (add && this.selStructs.has(s)) this.selStructs.delete(s);
    else this.selStructs.add(s);
    return s;
  }

  /** every building of the player's a world rectangle touches */
  structsInRect(x0: number, y0: number, x1: number, y1: number, add = false): number {
    const ax = Math.min(x0, x1), bx = Math.max(x0, x1);
    const ay = Math.min(y0, y1), by = Math.max(y0, y1);
    if (!add) this.clearStructSelection();
    let k = 0;
    const take = (t: Structure): void => {
      const half = (this.sizeOf(t) * CELL) / 2;
      if (t.x + half < ax || t.x - half > bx || t.y + half < ay || t.y - half > by) return;
      this.selStructs.add(t);
      k++;
    };
    for (const t of this.towers) if (t.team === "player") take(t);
    take(this.core);
    return k;
  }



  /**
   * EVERY BUILDING LIKE THIS ONE NEARBY — the same gesture as selectLike,
   * on the other half of the selection. A ctrl- or double-click on a tacker
   * takes every tacker within reach of it, which is how a line of turrets is
   * upgraded or sold without clicking each one.
   *
   * "Like" is the KIND, so a tacker gathers tackers and a barrage barrages;
   * a shell still going up counts, because a row half-built is still the
   * row you meant. The CORE is the one thing that gathers nothing: there
   * is only ever one, and a click on it means it.
   *
   * Returns how many were taken.
   */
  selectStructsLike(px: number, py: number, radius: number, add = false, pad = 0): number {
    const at = this.myStructAt(px, py, pad);
    if (!at) return 0;
    if (!add) this.clearStructSelection();
    if (isCore(at)) {
      this.selStructs.add(at);
      return 1;
    }
    const kind = at.kind;
    const ox = at.x, oy = at.y;
    let k = 0;
    for (const t of this.towers) {
      if (t.kind !== kind || t.team !== "player") continue;
      const dx = t.x - ox, dy = t.y - oy;
      if (dx * dx + dy * dy > radius * radius) continue;
      this.selStructs.add(t);
      k++;
    }
    return k;
  }


  unitAt(px: number, py: number, reach = PICK_TIGHT): number {
    let best = -1, bd = Infinity;
    for (let i = 0; i < this.n; i++) {
      const dx = this.upx[i] - px, dy = this.upy[i] - py;
      const d2 = dx * dx + dy * dy;
      const r = this.pickR(i, reach);
      if (d2 < r * r && d2 < bd) {
        bd = d2;
        best = i;
      }
    }
    return best;
  }

  /** the shield tower whose footprint (or body circle) covers a world point */
  shieldTowerAt(px: number, py: number): number {
    for (let i = 0; i < this.shieldTowers.length; i++) {
      const s = this.shieldTowers[i];
      if (s.hp <= 0) continue;
      const gx = (px / CELL) | 0, gy = (py / CELL) | 0;
      if (gx >= s.gx && gx < s.gx + SHIELD_TOWER_SIZE && gy >= s.gy && gy < s.gy + SHIELD_TOWER_SIZE) return i;
    }
    return -1;
  }

  /**
   * The Turret.java loop: reload runs regardless of targeting, queued volley
   * shots fire on their shotDelay timers at the turret's current rotation,
   * the barrel turns toward the intercept point at rotateSpeed, and a new
   * volley starts only when aimed within shootCone of the target.
   */
  private fireTowers(dt: number): void {
    const { upx, upy, uvx, uvy } = this;
    this.bodyIters += this.towers.length;
    // the core sheds soot under half its pool exactly as a turret does below
    {
      const c = this.core;
      if (c.hp < c.hpMax * DAMAGE_SMOKE_BELOW) {
        const hurt = 1 - c.hp / (c.hpMax * DAMAGE_SMOKE_BELOW);
        if (Math.random() < DAMAGE_SMOKE_RATE * hurt * c.size * dt) {
          const sz = c.size * CELL;
          this.pushFx(
            c.x + (Math.random() - 0.5) * sz * 0.6,
            c.y + (Math.random() - 0.5) * sz * 0.6,
            DAMAGE_SMOKE_LIFE, FxKind.DamageSmoke, 0, sz / 2, (Math.random() * 1e9) | 0,
          );
        }
      }
    }
    for (const t of this.towers) {
      // the fallback muzzle mark burning down (Tower.flashT, set in
      // fireShot): first thing in the pass, so it fades whatever else the
      // turret is or is not doing — shorted, mending, holding a beam
      if (t.flashT > 0) t.flashT -= dt;
      // DAMAGE SMOKE, the units' own rule (updateStatus): under half its
      // pool a structure sheds soot, thicker the lower it gets, scaled by
      // its footprint so a repeater smokes like the building it is. The
      // tint has gone grey (renderer, HP_TINT); this is the other half
      // NANOWEAVE / BULWARK (mods.ts): a turret born with either repairs
      // itself, and it repairs at ITS OWN ceiling — a braced tacker mends
      // faster than the plain one beside it because its pool is bigger
      if (t.regen > 0 && t.hp > 0 && t.hp < t.hpMax)
        t.hp = Math.min(t.hpMax, t.hp + t.regen * dt);
      // THE ROT (Tower.poison, the Venom spitters' weapons.ts trait). Raw
      // health a second, straight off the pool — applyArmor is not on this
      // path and must not be, because a status that plating shaved would be
      // a second copy of the thing the ground mechs already do.
      //
      // IT RUNS AGAINST REPAIR RATHER THAN AROUND IT. The tick above went
      // first, so a Bulwarked turret under one spitter is genuinely mending
      // faster than it rots and a player can watch that hold and then fail
      // as the stack grows. Two dials pulling on one pool is the fight.
      // THE MECH VIRUS (mutation.ts), on the rot's own terms and with none
      // of its arithmetic: no stack, no decay and no clock, a flat share
      // of this turret's OWN ceiling every second, raw so plating cannot
      // blunt it. Twenty seconds is twenty seconds whether the building is
      // a tacker or a Giant Bulwarked repeater, which is the only way a status
      // stays worth something across a run that multiplies pools
      if (t.virus && t.hp > 0) this.damageTower(t, t.hpMax * VIRUS_DPS * dt, true);
      if (t.poisonT > 0) {
        t.poisonT -= dt;
        if (t.poisonT <= 0) {
          t.poisonT = 0;
          t.poison = 0;
          t.poisonUnit = 0;
        } else {
          // THE STACK BLEEDS BACK TO ONE APPLICATION (constants.ts
          // POISON_DECAY). The floor is poisonUnit — the heaviest single
          // source in force — and it never decays while the clock runs, so
          // a turret with one spitter on it rots at exactly the rate that
          // spitter's weapon says. Everything ABOVE the floor is the crowd's
          // contribution, and it is the crowd's only for as long as the
          // crowd keeps landing shots.
          //
          // THIS IS WHAT MAKES THE ROT A SWARM MECHANIC. On a plain
          // refresh-and-hold clock a lone body walked itself to the old
          // ceiling and a hundred bodies did no more — the one thing on this
          // field that did not scale with how many there were.
          //
          // THE BLEED IS A SHARE OF THE EXCESS, not a flat number. A flat
          // drain is a threshold: a shooter that out-paces it climbs without
          // limit however slowly it fires, and one that does not never
          // stacks at all. Draining a fraction of what is ABOVE the floor
          // gives a real equilibrium instead, at roughly inflow over decay —
          // and that is linear in how many spitters are landing shots, which
          // is the whole point. It is also the ONLY bound on the rot now,
          // so it is the line that keeps `poison += rate` from running away.
          if (t.poison > t.poisonUnit)
            t.poison =
              t.poisonUnit + (t.poison - t.poisonUnit) * Math.exp(-POISON_DECAY * dt);
          if (t.hp > 0) {
            this.damageTower(t, t.poison * dt, true);
            // the motes, on the damage smoke's own rule: scaled by
            // footprint, so a rotting 4x4 reads from across the field
            if (Math.random() < POISON_FX_RATE * t.size * dt) {
              const sz = t.size * CELL;
              this.pushFx(
                t.x + (Math.random() - 0.5) * sz * 0.7,
                t.y + (Math.random() - 0.5) * sz * 0.7,
                POISON_FX_LIFE,
                FxKind.Poison,
              );
            }
          }
        }
      }
      // ALIGHT (Tower.burnT, the Grapnels' fire star): raw health a
      // second, PAST PLATING like the rot above it, and the flames on the
      // rot's own footprint rule so a burning repeater reads from across
      // the field. A refresh and a max rather than a stack (burnTower), so
      // unlike the rot there is nothing here to bleed back down — it burns
      // at what the biggest star that lit it said, and then it is out
      if (t.burnT > 0) {
        t.burnT -= dt;
        if (t.burnT <= 0) {
          t.burnT = 0;
          t.burnDps = 0;
        } else if (t.hp > 0) {
          this.damageTower(t, t.burnDps * dt, true);
          if (Math.random() < TOWER_BURN_FX_RATE * t.size * dt) {
            const sz = t.size * CELL;
            this.pushFx(
              t.x + (Math.random() - 0.5) * sz * 0.7,
              t.y + (Math.random() - 0.5) * sz * 0.7,
              TOWER_BURN_FX_LIFE,
              FxKind.Burning,
            );
          }
        }
      }
      // LAST VOLLEY (mods.ts): a dead neighbour's charge, running down
      if (t.boostT > 0) t.boostT -= dt;
      // THE JAM (levels.ts jamField), running down the same way — the
      // rate it wrote is read at the reload below while the clock runs
      if (t.jamT > 0 && (t.jamT -= dt) <= 0) {
        t.jamT = 0;
        t.jamRate = 1;
      }
      // ...and the SOAK (Tower.soakT, the soaked star and the wet bomb)
      // beside it, on the same terms and its own clock
      if (t.soakT > 0 && (t.soakT -= dt) <= 0) {
        t.soakT = 0;
        t.soakRate = 1;
      }
      const maxHp = t.hpMax;
      if (t.hp < maxHp * DAMAGE_SMOKE_BELOW) {
        const hurt = 1 - t.hp / (maxHp * DAMAGE_SMOKE_BELOW);
        const cells = t.size;
        if (Math.random() < DAMAGE_SMOKE_RATE * hurt * cells * dt) {
          const sz = cells * CELL;
          this.pushFx(
            t.x + (Math.random() - 0.5) * sz * 0.6,
            t.y + (Math.random() - 0.5) * sz * 0.6,
            DAMAGE_SMOKE_LIFE, FxKind.DamageSmoke, 0, sz / 2, (Math.random() * 1e9) | 0,
          );
        }
      }
      // THE TURRET'S OWN STATS, not its kind's (Tower.spec): composed at
      // the placement and at every refreshSpecs, read raw here — and a
      // CONQUERED turret's are the ones it changed sides with, frozen
      // there (see conquerTower)
      const st = t.spec;
      const hostile = t.team === "enemy";
      // SHORTED OUT (Tower.shortT, the Wraith fleet's EMP): nothing below
      // runs — no reload, no volley, no mending, no beam — until the clock
      // is out. The sparks are the only sign, on the rot's own footprint
      // rule, so a shorted repeater reads from across the field
      if (t.shortT > 0) {
        t.shortT -= dt;
        if (t.shortT <= 0) t.shortT = 0;
        else {
          if (Math.random() < SHORT_FX_RATE * t.size * dt) {
            const sz = t.size * CELL;
            this.pushFxCol(
              t.x + (Math.random() - 0.5) * sz * 0.8,
              t.y + (Math.random() - 0.5) * sz * 0.8,
              SHORT_FX_LIFE, FxKind.ShortSpark, Math.random() * Math.PI * 2, 0, PAL.wraith, 0, false,
              (Math.random() * 0x7fffffff) | 0,
            );
          }
          continue;
        }
      }
      // a support block has no target and no barrel — it pulses (the
      // damage smoke above is still its, because it is still a building
      // the swarm can chew on). THE SWARM'S COPY PULSES NOTHING: a fixer
      // mends a line, and the swarm has no line here to mend
      if (st.heal) {
        if (!hostile) this.updateFixer(t, st, dt);
        continue;
      }
      // a lock turret has no reload and no volley — it holds a beam on one
      // body and spools up on it (updateLockBeam). THE SWARM'S COPY LOCKS
      // NOTHING: the beam only ever catches BODIES, and the swarm has none
      if (st.bullet.lock) {
        if (!hostile) this.updateLockBeam(t, st, dt);
        continue;
      }
      // LaserTurret: while the beam is lit the reload does NOT run, so a
      // furnace's cycle is 230 ticks of burning and only then 90 of
      // cooling. The beam is also what damages, every damageInterval
      const cont = st.bullet.continuous;
      if (cont && t.beamT >= 0) this.updateBeam(t, st, cont, dt);
      // LaserTurret.updateTile runs the reload only while `bullets` is
      // EMPTY, and the turret lets go of its beam at the end of
      // shootDuration — so the fade tail cools alongside the turret
      // ...at the TOWER'S rate, which is 1 for everything except a turret
      // the Hydrophobic rule has waterlogged (mutation.ts)
      // ...times a dying neighbour's parting charge, if one is running
      // ...times the sky's jam, while a bomber wing's stamp is on it
      // ...times a Grapnel star's soak, while one is on it
      const rate =
        t.fireRate * (t.boostT > 0 ? LAST_VOLLEY_RATE : 1) * (t.jamT > 0 ? t.jamRate : 1) *
        (t.soakT > 0 ? t.soakRate : 1);
      if (t.cd > 0 && !(cont && t.beamT > cont.fade)) t.cd -= dt * rate;

      // a queued volley that is still charging: the shots are already spent
      // from the reload's point of view, they just have not left yet
      if (t.chargeT >= 0) {
        t.chargeT -= dt;
        if (t.chargeT <= 0) {
          t.chargeT = -1;
          t.burstLeft = st.shots;
          t.burstT = 0;
        }
      }

      // shots already queued by a volley fire even if the target moved/died
      if (t.burstLeft > 0) {
        t.burstT -= dt;
        while (t.burstLeft > 0 && t.burstT <= 0) {
          this.fireShot(t, st, st.shots - t.burstLeft);
          t.burstLeft--;
          t.burstT += st.shotDelay;
        }
      }

      // Units.bestTarget over Turret.unitSort, on BaseTurret's target
      // clock (TARGET_INTERVAL). The held target is used for as long as it
      // stays valid — alive (its uid still sits where the index hint says)
      // and its centre still within range — and the actual scan runs only
      // when the interval expires or the hold breaks. The scan walks the
      // spatial hash's buckets under the range circle rather than every
      // unit on the field; a turret whose whole target layer is empty
      // skips even that. The default sort is UnitSorts.closest — plain
      // squared distance; railhead's `strongest` is documented on
      // bestTarget and TowerStats.sort
      const r2t = st.range * st.range;
      let best = -1;
      let shr: ShieldTower | null = null;
      let aimT: Structure | null = null;
      if (hostile) {
        // THE SWARM'S TURRET (Conquest, mutation.ts). It has no bodies to
        // shoot — the player fields none — so it holds on the nearest of
        // the PLAYER'S buildings within its range, the core included, for
        // as long as that stands and stays in reach, re-picking on the
        // same clock the player's guns do. The scan runs on the clock and
        // nowhere else: a gun with nothing in reach is the ordinary state
        // of a board, and re-walking the ring every tick for it is how an
        // idle line costs a frame
        const held = t.aimTower;
        if (held && teamOf(held) === "player" && this.inReach(held, t.x, t.y, st.range)) aimT = held;
        t.targetT -= dt;
        if (t.targetT <= 0) {
          t.targetT = TARGET_INTERVAL;
          aimT = this.nearestStructure(t.x, t.y, st.range, false, "player");
        }
      }
      // A TAP MARKS NOTHING FOR THE GUNS. Clicking an enemy used to
      // override both the held target and the scan for every turret that
      // could reach it; it is a QUESTION now and only that (Game.inspect),
      // so a line's aim is its own sort's and never the cursor's
      if (!hostile) {
        if (
          t.target >= 0 &&
          t.targetIdx >= 0 &&
          t.targetIdx < this.n &&
          this.uid[t.targetIdx] === t.target
        ) {
          const dx = upx[t.targetIdx] - t.x, dy = upy[t.targetIdx] - t.y;
          if (dx * dx + dy * dy < r2t) best = t.targetIdx;
        }
        t.targetT -= dt;
        // the scan runs on the clock and nowhere else — see the note on
        // the swarm's branch above
        const scan = t.targetT <= 0;
        if (scan) {
          const hasTargets =
            (st.targetAir && this.nAliveAir > 0) ||
            (st.targetGround && this.nAliveGround > 0);
          best = hasTargets
            ? this.bestTarget(
                t.x, t.y, st.range, st.targetAir, st.targetGround,
                st.sort === "strongest", !(TOWER_NATURE[t.kind] & DMG_BULLET),
              )
            : -1;
          t.targetT = TARGET_INTERVAL;
          t.target = best >= 0 ? this.uid[best] : -1;
        }
        // IDLE HANDS CHEW THE MAP'S SHIELD TOWERS: only a turret with nothing
        // else in range spends its reload on one unforced, so clearing a
        // shield tower idly costs time between waves and never mid-wave DPS
        if (best < 0 && st.targetGround && this.shieldTowers.length > 0) {
          const si = this.idleShieldTowerFor(t, r2t);
          if (si >= 0) shr = this.shieldTowers[si];
        }
        // ...AND THE SWARM'S CONQUERED TURRETS THE SAME WAY (Conquest):
        // only a turret with nothing else in range spends its reload on
        // one unforced, so taking a lost emplacement back down costs time
        // between waves and never mid-wave DPS. The held building is kept
        // between scans for the same reason the swarm's gun keeps its:
        // finding one is a ring walk over the board
        if (best < 0 && !shr && st.targetGround && this.enemyTowers > 0) {
          const heldT = t.aimTower;
          if (heldT && teamOf(heldT) === "enemy" && this.inReach(heldT, t.x, t.y, st.range))
            aimT = heldT;
          else if (scan) aimT = this.nearestStructure(t.x, t.y, st.range, false, "enemy");
        }
        // whatever was held loses to a body or a dome found this tick
        if (best >= 0 || shr) aimT = null;
      }
      t.targetIdx = best;
      t.aimShieldTower = shr ? this.shieldTowers.indexOf(shr) : -1;
      t.aimTower = aimT;
      if (best < 0 && !shr && !aimT) {
        // nothing in range: a beam already lit keeps burning down its
        // duration where it is, exactly as Mindustry's held bullet does
        continue;
      }

      // Predict.intercept: aim where target and bullet paths cross. Hitscan
      // bullets (speed ~0) aim straight at the target, like Mindustry's
      // predictTarget guard (bullet.speed >= 0.01 or no lead at all).
      // A shield tower is a building: no velocity, no lead, aim at the centre
      // A structure is a building: no velocity, no lead, aim at the centre
      const bx = shr ? shr.x : aimT ? aimT.x : upx[best];
      const by = shr ? shr.y : aimT ? aimT.y : upy[best];
      const dx = bx - t.x, dy = by - t.y;
      let aimX = dx, aimY = dy;
      if (!shr && !aimT && st.bullet.speed >= 1) {
        const tvx = uvx[best], tvy = uvy[best];
        const s2 = st.bullet.speed * st.bullet.speed;
        const qa = tvx * tvx + tvy * tvy - s2;
        const qb = 2 * (dx * tvx + dy * tvy);
        const qc = dx * dx + dy * dy;
        let lead = Math.sqrt(qc) / st.bullet.speed; // fallback: current distance
        if (Math.abs(qa) > 1e-4) {
          const disc = qb * qb - 4 * qa * qc;
          if (disc >= 0) {
            const root = (-qb - Math.sqrt(disc)) / (2 * qa);
            if (root > 0) lead = root;
          }
        } else if (Math.abs(qb) > 1e-4) {
          const root = -qc / qb;
          if (root > 0) lead = root;
        }
        aimX = dx + tvx * lead;
        aimY = dy + tvy * lead;
      }
      const targetRot = Math.atan2(aimY, aimX);

      // Turret.shouldTurn: moveWhileCharging false LOCKS the barrel for the
      // whole charge, so a piercer commits to where it was aiming rather
      // than tracking through the two thirds of a second it takes to fire
      if (t.chargeT < 0) {
        const diff = Sim.angleDiff(t.angle, targetRot);
        // LaserTurret.turnToTarget: firingMoveFract while the beam is
        // HELD (not while it fades), so furnace tracks a crossing target
        // at half speed and a queue walking into it at full
        const held = cont !== undefined && t.beamT > cont.fade;
        const turn = st.rotateSpeed * (held ? cont!.moveFract : 1) * dt;
        t.angle = Math.abs(diff) <= turn ? targetRot : t.angle + Math.sign(diff) * turn;
      }

      // updateShooting: a charging turret starts no new volley, though its
      // reload keeps running underneath (reloadWhileCharging, the default)
      if (t.cd <= 0 && t.chargeT < 0 && Math.abs(Sim.angleDiff(t.angle, targetRot)) < st.shootCone) {
        // LaserTurret.updateShooting: lighting the beam IS the shot. It
        // burns for shootDuration and then fades, and only once it is out
        // does the reload above start counting again
        if (cont) {
          if (t.beamT > cont.fade) continue; // still holding one
          t.beamT = cont.duration + cont.fade;
          // Bullet.timer(1, damageInterval): Interval.get fires only once
          // the clock EXCEEDS the interval, so a fresh beam's first pass
          // lands one interval in, not on the frame it is lit
          t.beamDmgT = cont.damageInterval;
          t.cd = st.reload;
          const mz = st.shootY ?? st.size * 5;
          this.bulletFx(
            st.bullet.shootFx,
            t.x + Math.cos(t.angle) * mz,
            t.y + Math.sin(t.angle) * mz,
            t.angle,
            st.bullet.fxColor,
          );
          continue;
        }
        t.cd += st.reload; // reloadCounter %= reload
        // artillery lands its shells here: the intercept point in world px
        t.aimX = t.x + aimX;
        t.aimY = t.y + aimY;
        if (st.chargeTime) {
          t.chargeT = st.chargeTime; // fires when it runs out, above
          // BulletType.chargeEffect: fired the moment the volley is
          // QUEUED, so it plays through the charge rather than after it,
          // and off the barrel's own facing (no per-shot inaccuracy yet)
          const mz = st.shootY ?? st.size * 5;
          // forced: the glow is the only sign a charging turret is doing
          // anything at all — dropped, a winding-up piercer reads as stalled
          this.bulletFx(
            st.bullet.chargeFx,
            t.x + Math.cos(t.angle) * mz,
            t.y + Math.sin(t.angle) * mz,
            t.angle,
            st.bullet.fxColor,
            true,
          );
          continue;
        }
        t.burstLeft = st.shots;
        t.burstT = 0;
        // shots with no shotDelay (a ShootSpread fan) all leave this frame
        while (t.burstLeft > 0 && t.burstT <= 0) {
          this.fireShot(t, st, st.shots - t.burstLeft);
          t.burstLeft--;
          t.burstT += st.shotDelay;
        }
      }
    }
  }



  /**
   * `seeCloaked` IS THE OTHER HALF OF THE CLOAK RULE (see damageUnit). A
   * turret whose shot goes through a cloak has to be able to AIM at the
   * hull as well, or the rule buys nothing for the six of the seven that
   * need a target to fire at — only a bolt and a rail happen to sweep a
   * body they were not pointed at. A furnace that could burn a dark hull
   * but never pick one is a furnace that stares past it.
   *
   * AND IT IS A REAL TELL, not a cheat: the beam that swings onto an empty
   * patch of ground is the player being shown where the wraith is.
   */
  private bestTarget(
    x: number,
    y: number,
    range: number,
    air: boolean,
    ground: boolean,
    strongest: boolean,
    seeCloaked: boolean,
  ): number {
    const { upx, upy, uhp, ufly } = this;
    const n = this.n;
    const r2 = range * range;
    const score = (i: number, d2: number): number =>
      strongest ? -uhp[i] + d2 * 1e-9 : d2;
    let best = -1, bs = Infinity;
    // a short field is cheaper to walk directly than through the buckets
    if (n <= 128) {
      // ...and they are the same candidates, so they are the same probes:
      // a counter that only saw the bucket path would report a board of a
      // hundred bodies as doing no work at all
      this.probes += n;
      for (let i = 0; i < n; i++) {
        if (ufly[i] !== 0 ? !air : !ground) continue;
        // hidden: not there to aim at, unless this gun goes through it
        if (HAS_CLOAK && !seeCloaked && this.ucloakT[i] > 0) continue;
        const dx = upx[i] - x, dy = upy[i] - y;
        const d2 = dx * dx + dy * dy;
        if (d2 >= r2) continue;
        const s = score(i, d2);
        if (s < bs || (s === bs && i < best)) {
          bs = s;
          best = i;
        }
      }
      return best;
    }
    const { bStart, bUnits } = this;
    const pad = range + 8;
    const hx0 = clamp(((x - pad) / HC) | 0, 0, HCOLS - 1);
    const hy0 = clamp(((y - pad) / HC) | 0, 0, HROWS - 1);
    const hx1 = clamp(((x + pad) / HC) | 0, 0, HCOLS - 1);
    const hy1 = clamp(((y + pad) / HC) | 0, 0, HROWS - 1);
    for (let hy = hy0; hy <= hy1; hy++) {
      const row = hy * HCOLS;
      const e = bStart[row + hx1 + 1];
      const e0 = bStart[row + hx0];
      this.probes += e - e0;
      for (let k = e0; k < e; k++) {
        const i = bUnits[k];
        if (i >= n) continue;
        if (ufly[i] !== 0 ? !air : !ground) continue;
        if (HAS_CLOAK && !seeCloaked && this.ucloakT[i] > 0) continue;
        const dx = upx[i] - x, dy = upy[i] - y;
        const d2 = dx * dx + dy * dy;
        if (d2 >= r2) continue;
        const s = score(i, d2);
        if (s < bs || (s === bs && i < best)) {
          bs = s;
          best = i;
        }
      }
    }
    return best;
  }

  /**
   * One bullet at the turret's rotation plus the volley's ShootSpread fan
   * offset and the per-shot inaccuracy. Hitscan rays (cleaver shrapnel) damage
   * instantly and leave only their animation; the rest spawn projectiles.
   */
  private fireShot(t: Tower, st: TowerStats, idx: number): void {
    const fan = (idx - (st.shots - 1) / 2) * st.spread;
    const a = t.angle + fan + (Math.random() * 2 - 1) * st.inaccuracy;
    const cos = Math.cos(a), sin = Math.sin(a);
    // Mindustry shootY where the turret states one, else the shared
    // size-scaled muzzle
    const muzzle = st.shootY ?? st.size * 5;
    let x = t.x + cos * muzzle, y = t.y + sin * muzzle;
    if (st.barrels) {
      // ShootAlternate: the mount point steps sideways barrel to barrel,
      // perpendicular to the turret's facing (not the inaccuracy-jittered a)
      const bi = (t.shotCount % st.barrels.count) - (st.barrels.count - 1) / 2;
      const off = bi * st.barrels.spread;
      x += -Math.sin(t.angle) * off;
      y += Math.cos(t.angle) * off;
    }
    // WHICH AMMO THIS SHOT IS LOADED WITH (BulletStats.alt). A gun that
    // rolls for its second round asks the roll (airburst's incendiary
    // shell); every other one reads the BARREL INDEX and not the shot
    // count, so the ammo and the mount it leaves by are one decision and
    // stay one on a gun with more than two nozzles: even mounts throw the
    // turret's own bullet, odd mounts the second. A turret with no alt
    // never asks (and one with an alt has one or the other — checked at
    // import, constants.ts).
    const alt =
      st.bullet.alt !== undefined &&
      (st.altChance !== undefined
        ? Math.random() < st.altChance
        : (t.shotCount % (st.barrels?.count ?? 1)) % 2 === 1);
    const bul = alt ? st.bullet.alt! : st.bullet;
    t.shotCount++;
    // BulletType.shootEffect and smokeEffect, both fired at the muzzle
    // along the shot's angle. For torch the pair IS the weapon: the
    // bullet itself draws nothing at all
    const shownShoot = this.bulletFx(bul.shootFx, x, y, a, bul.fxColor);
    const shownSmoke = this.bulletFx(bul.smokeFx, x, y, a, bul.fxColor);
    // A SHOT MUST NEVER BE SILENT (Tower.flashT). The pool drops the
    // NEWEST push once it is over FX_CAP, which is to say it drops the
    // flash of the shot being fired while stale puffs linger — and a
    // swarm big enough to saturate the budget is exactly the moment a
    // player is reading the line for which guns are still working. So a
    // turret whose muzzle effect was refused stands its own mark up
    // instead: state on the building, one quad, nothing the pool can say
    // no to. Only on refusal, so a board inside its budget draws the real
    // effect and nothing else, and the two are never both on screen.
    //
    // The instant weapons below never reach this: their shape IS their
    // shot and is already forced past the cap.
    // ...only where the ammo ASKED for a muzzle effect: a bullet that
    // deliberately has neither is a bullet whose barrel is meant to be
    // quiet, and standing a flash in for an effect nobody wanted would
    // invent one
    const wantsMuzzle = bul.shootFx !== undefined || bul.smokeFx !== undefined;
    if (wantsMuzzle && !shownShoot && !shownSmoke && this.fxOn) {
      t.flashT = MUZZLE_FLASH_LIFE;
      t.flashX = x;
      t.flashY = y;
      t.flashRot = a;
    }
    // aimed at a shield tower, the INSTANT weapons hand their damage straight to
    // it — the sweeps behind laser/lightning/rail/ray know only the unit
    // arrays. Projectile weapons need nothing here: their shots really fly,
    // and the shield tower's dome and body collide them like anything else
    const shrT = t.aimShieldTower >= 0 ? this.shieldTowers[t.aimShieldTower] : null;
    // ...and the same for a BUILDING either side is aiming at (Tower.aimTower)
    const aimT = t.aimTower;
    const hitAimed = (): void => {
      if (shrT) this.shieldTowerHit(shrT, bul.damage, bul.hitFx, a, bul.fxColor);
      if (aimT) this.structureHit(aimT, bul.damage, bul.hitFx, a, bul.fxColor);
    };
    // THE SWARM'S OWN INSTANT WEAPONS SWEEP NOTHING (Conquest): every
    // sweep below walks the swarm's BODIES, and a conquered turret has
    // none to walk. Its shot is the building it was aimed at, plus the
    // same shape on screen — the bolt, the beam, the rail's trail, the
    // ray — at the weapon's own length, so a taken piercer still visibly
    // fires a piercer's beam
    const hostile = t.team === "enemy";
    // WHAT THIS TURRET'S HIT IS (TOWER_NATURE), handed to every sweep
    // below and written onto every projectile it throws. It is read here,
    // once a shot, rather than inside the sweeps: a bolt walking eight
    // bodies should not look the answer up eight times, and a sweep that
    // decided for itself would be a second place the roster's judgement
    // about what counts as a bullet could drift from the first
    const nature = TOWER_NATURE[t.kind];
    if (bul.lightning) {
      if (hostile) {
        this.unitBolt(x, y, a, bul.lightning.length, bul.fxColor ?? PAL.piercerLaser);
        hitAimed();
        return;
      }
      const pts = this.lightningBolt(
        x, y, a,
        bul.damage,
        bul.lightning.length,
        bul.hitRadius ?? 2.5,
        bul.collidesAir,
        bul.collidesGround,
        bul.hitFx,
        bul.fxColor,
        nature,
      );
      this.pushBolt(x, y, bul.lifetime, pts, true); // the bolt IS coil's shot
      hitAimed();
      return;
    }
    if (bul.laser) {
      const reached = hostile
        ? bul.laser.length
        : this.laserBeam(
            x, y, a,
            bul.laser.length,
            bul.damage,
            bul.laser.pierceCap,
            bul.armorMultiplier ?? 1,
            bul.pierceArmor ?? false,
            bul.collidesAir,
            bul.collidesGround,
            bul.hitFx,
            bul.fxColor,
            nature,
          );
      // forced: the beam IS the shot for every laser turret (damage is
      // instant), and the style rides `sides` — piercer's blue sheet by
      // default, tether's mint lance where the table names one
      this.pushFx(
        x, y, bul.lifetime, FxKind.Laser, a, reached, 0,
        TOWER_LASER_STYLE[t.kind] ?? 0, true,
      );
      hitAimed();
      return;
    }
    if (bul.rail) {
      if (hostile) {
        // the line the player's rail draws, without the sweep behind it
        const spec = bul.rail;
        if (bul.pointFx !== undefined)
          for (let d = 0; d <= spec.length; d += spec.pointSpacing)
            this.bulletFx(bul.pointFx, x + cos * d, y + sin * d, a, bul.fxColor, true);
        this.bulletFx(bul.despawnFx, x, y, a, bul.fxColor, true);
      } else this.railShot(x, y, a, bul, nature);
      hitAimed();
      return;
    }
    if (bul.ray) {
      if (!hostile)
        this.hitscanRay(
          x,
          y,
          a,
          bul.ray.length,
          bul.damage,
          bul.collidesAir,
          bul.collidesGround,
          bul.hitFx,
          bul.fxColor,
          nature,
        );
      // forced: the ray is cleaver's entire visible shot (damage is instant)
      this.pushFx(x, y, bul.lifetime, FxKind.Shrapnel, a, bul.ray.length, 0, 0, true);
      hitAimed();
      return;
    }
    // Mindustry scaleLife (Turret.java): an artillery shell's lifetime
    // shrinks to the MUZZLE's distance from the predicted impact, scaled
    // against the BULLET's own reach (speed x lifetime) rather than the
    // turret's range — the two differ, and dividing by the shorter turret
    // range stretched every shell past its aim point
    let life = bul.lifetime;
    if (bul.artillery) {
      const reach = bul.speed * bul.lifetime;
      // scaleLifetimeOffset overshoots the aim point by a fraction, and
      // minRange is the FLOOR on the scale — a shell aimed inside it
      // overflies rather than landing short
      const off = st.lifeScaleOffset ?? 0;
      const lo = (st.minRange ?? 0) / reach;
      life *=
        clamp(((1 + off) * Math.hypot(t.aimX - x, t.aimY - y)) / reach, lo, st.range / reach);
    }
    // lifeScaleRandMin/Max and velocityRnd: the two rolls that turn a
    // barrage's six shells from one hole into a pattern down the lane
    const lr = bul.lifeScaleRand;
    if (lr) life *= lr[0] + Math.random() * (lr[1] - lr[0]);
    const vr = st.velocityRnd ?? 0;
    const speed = bul.speed * (vr > 0 ? 1 - vr + Math.random() * vr : 1);
    this.projs.push(
      TOWER_KIND_ID[t.kind], x, y, cos * speed, sin * speed, life,
      bul.flak ? bul.flak.interval : 0,
      bul.pierce ? [] : null,
      // which nozzle threw it, so the ball answers for its own stats for
      // the rest of its flight (Sim.bulletFor) and is drawn as the ammo
      // that was actually fired (PROJ_ALT);
      // a shot of the swarm's flies past every body and lands on the
      // player's buildings instead (PROJ_ENEMY, stepHostileProjectile);
      // TORCH, AND ONLY TORCH: a bullet with neither sprite nor orb has
      // no visible body of its own, so when the pool refused its flame
      // there is nothing left on screen at all. Say so, and the renderer
      // draws the bullet itself down the lane (PROJ_BARE)
      (alt ? PROJ_ALT : 0) |
        (hostile ? PROJ_ENEMY : 0) |
        (!shownShoot && !bul.sprite && !bul.orb ? PROJ_BARE : 0),
    );
  }


  /**
   * ONE STEP OF A SHOT FIRED BY ONE OF THE SWARM'S CONQUERED TURRETS
   * (Conquest, mutation.ts): it flies past every body and lands on the
   * first of the PLAYER's structures it is over — the enemy shots' rule
   * (updateEnemyShots) on a turret's own bullet. An artillery shell
   * collides with nothing and only ever bursts where its life ran out.
   *
   * IT SKIPS THE WHOLE UNIT PASS, and that is the point of it being its
   * own step rather than a flag inside one: the swarm's shot has no
   * spatial-hash sweep, no pierce ledger, no homing, no flak fuse and no
   * force field to be eaten by — its target is a building, and buildings
   * are a grid read.
   *
   * Returns true once the shot is spent, with its hit, blast and
   * fragments done.
   */
  private stepHostileProjectile(p: number, b: BulletStats, dt: number): boolean {
    const P = this.projs;
    const px = (P.x[p] += P.vx[p] * dt);
    const py = (P.y[p] += P.vy[p] * dt);
    P.life[p] -= dt;
    P.age[p] += dt;
    // the trails are the shot's own look and belong to whoever fired it
    if (b.puff && Math.random() < b.puff.chance * dt)
      this.pushTrail(px, py, b.puff.size, b.sprite?.back);
    if (b.trail) {
      const fin = P.age[p] / (P.age[p] + P.life[p]);
      const slope = 1 - Math.abs(fin - 0.5) * 2;
      P.trailT[p] += dt;
      const every = ((3 + slope * 2) * b.trail.mult) / 60;
      if (P.trailT[p] >= every) {
        P.trailT[p] = 0;
        this.pushTrail(px, py, slope * b.trail.size, b.sprite?.back);
      }
    }
    const off = px < 0 || py < 0 || px >= W || py >= H;
    let dead = P.life[p] <= 0 || off;
    const rot = Math.atan2(P.vy[p], P.vx[p]);
    if (!dead && !b.artillery) {
      const s = this.structureAt(px, py, "player");
      if (s) {
        // through the swarm's own damage dial, exactly as its bodies' shots
        this.hitStructure(s, b.damage);
        if (b.splash <= 0) this.bulletFx(b.hitFx, px, py, rot, b.fxColor);
        dead = true;
      }
    }
    if (!dead) return false;
    if (!off) {
      if (b.splash > 0) {
        this.bulletFx(b.hitFx, px, py, rot, b.fxColor, false,
          b.hitFx === FxKind.WaterBurst ? b.splashRadius : 0);
        this.bulletFx(b.hitFx2, px, py, rot, b.fxColor, false,
          b.hitFx2 === FxKind.WaterBurst ? b.splashRadius : 0);
        // the blast takes the player's buildings and nothing else: the
        // swarm's shell never chips the swarm's own turret, and it has no
        // bodies of the player's to catch
        this.splashStructures(px, py, b.splash, b.splashRadius);
      }
      if (P.life[p] <= 0) this.bulletFx(b.despawnFx, px, py, rot, b.fxColor);
      if (b.frag) this.createFrags(p, b.frag);
    }
    return true;
  }

  /**
   * Mindustry BulletType.createFrags: where a fragmenting shot dies it
   * throws `count` children, each on a bearing drawn uniformly from the
   * full `spread` cone around the parent's heading, at a random fraction
   * of the CHILD's own speed and starting a random offset out from the
   * blast. Whirl's six plastanium fragments are the only user, and they
   * are what turns one shell into a wall.
   */
  private createFrags(p: number, spec: NonNullable<BulletStats["frag"]>): void {
    const P = this.projs;
    // the parent, read BEFORE the first push: a push can re-allocate the
    // lanes (Projs.grow), and the parent's slot is about to be removed
    const px = P.x[p], py = P.y[p];
    const rot = Math.atan2(P.vy[p], P.vx[p]);
    const kind = P.kind[p];
    // ...of the ammo the parent was: a fragment of the fire ball is the
    // fire ball's child (PROJ_ALT — bulletOf resolves alt before frag);
    // fragments belong to whoever threw the parent (PROJ_ENEMY); and a
    // fragment is thrown by a burst, not by a barrel: it has no muzzle
    // effect to have been refused, and every frag ammo in the game has a
    // sprite of its own — never PROJ_BARE
    const flags = PROJ_FRAG | (P.flags[p] & (PROJ_ALT | PROJ_ENEMY));
    const child = spec.bullet;
    for (let i = 0; i < spec.count; i++) {
      const off = spec.offsetMin + Math.random() * (spec.offsetMax - spec.offsetMin);
      const a = rot + (Math.random() - 0.5) * spec.spread;
      const v = child.speed * (spec.velMin + Math.random() * (spec.velMax - spec.velMin));
      const cos = Math.cos(a), sin = Math.sin(a);
      P.push(kind, px + cos * off, py + sin * off, cos * v, sin * v, child.lifetime, 0,
        child.pierce ? [] : null, flags);
    }
  }

  /**
   * Mindustry RailBulletType.init, 1:1. There is no projectile at all: the
   * line is walked the moment the shot leaves, nearest body first, and
   * each one takes whatever damage is LEFT and then subtracts its own full
   * health from the budget (pierceDamageFactor 1). The shot stops where
   * the budget runs out, and that is also where the drawn line stops —
   * `pointEffect` is laid down the length it actually reached, not the
   * 500 units it was allowed.
   */
  private railShot(
    x: number,
    y: number,
    angle: number,
    b: BulletStats,
    nature: number,
  ): void {
    const spec = b.rail!;
    const { upx, upy, uhp } = this;
    const dirx = Math.cos(angle), diry = Math.sin(angle);
    const hits = this.boltHits, dists = this.boltDists;
    this.collideLine(x, y, dirx, diry, spec.length, b.collidesAir, b.collidesGround, hits, dists);
    const order = hits.map((_, k) => k).sort((p, q) => dists[p] - dists[q]);
    let left = b.damage;
    let reached = spec.length;
    const dead: number[] = [];
    for (const k of order) {
      if (left <= 0) {
        reached = Math.min(reached, dists[k]);
        break;
      }
      const i = hits[k];
      const health = uhp[i];
      this.damageUnit(i, left, false, 1, nature);
      // hit(), then handlePierce: the burst lands on the body, and the
      // body's own health comes off the budget that made it
      this.bulletFx(b.hitFx, upx[i], upy[i], angle, b.fxColor);
      this.bulletFx(b.pierceFx, upx[i], upy[i], angle, b.fxColor);
      if (uhp[i] <= 0) dead.push(i);
      left -= Math.min(left, health);
      if (left <= 0) reached = Math.min(reached, dists[k]);
    }
    dead.sort((p, q) => q - p);
    for (const i of dead) if (uhp[i] <= 0) this.killUnit(i);
    // pointEffect every pointEffectSpace down what the line reached
    if (b.pointFx !== undefined) {
      // forced: the trail line is the rail's entire visible shot
      for (let d = 0; d <= reached; d += spec.pointSpacing)
        this.bulletFx(b.pointFx, x + dirx * d, y + diry * d, angle, b.fxColor, true);
    }
    // BulletType.despawned: a rail bullet has speed 0 and a lifetime of one
    // tick, so it dies where it was fired and its despawn effect is, in
    // practice, the turret's own detonation — forced with the trail
    this.bulletFx(b.despawnFx, x, y, angle, b.fxColor, true);
  }

  /**
   * Instant piercing ray (Mindustry Damage.collideLine): every unit whose
   * hitbox — grown by collideLine's 3-unit expand — touches the segment
   * takes the full damage; no pierce cap, and terrain never blocks it.
   */
  private hitscanRay(
    x: number,
    y: number,
    angle: number,
    length: number,
    dmg: number,
    air: boolean,
    ground: boolean,
    hitFx: BulletFx | undefined,
    fxColor: RGB | undefined,
    nature: number,
  ): void {
    const { upx, upy, uhp, uarmor, urad, ukind, bStart, bUnits, splashHits } = this;
    const EXPAND = 7.5; // collideLine's expand = 3 world units
    const dirx = Math.cos(angle), diry = Math.sin(angle);
    const x2 = x + dirx * length, y2 = y + diry * length;
    const pad = this.rmaxAliveFor(air, ground) + EXPAND;
    const hx0 = clamp(((Math.min(x, x2) - pad) / HC) | 0, 0, HCOLS - 1);
    const hy0 = clamp(((Math.min(y, y2) - pad) / HC) | 0, 0, HROWS - 1);
    const hx1 = clamp(((Math.max(x, x2) + pad) / HC) | 0, 0, HCOLS - 1);
    const hy1 = clamp(((Math.max(y, y2) + pad) / HC) | 0, 0, HROWS - 1);
    splashHits.length = 0;
    for (let hy = hy0; hy <= hy1; hy++) {
      const row = hy * HCOLS;
      const e = bStart[row + hx1 + 1];
      const e0 = bStart[row + hx0];
      this.probes += e - e0;
      for (let k = e0; k < e; k++) {
        const i = bUnits[k];
        if (i >= this.n || uhp[i] <= 0) continue;
        if (KIND_FLYING[ukind[i]] ? !air : !ground) continue;
        // distance from the unit to the ray segment
        const tt = clamp((upx[i] - x) * dirx + (upy[i] - y) * diry, 0, length);
        const dx = upx[i] - (x + dirx * tt), dy = upy[i] - (y + diry * tt);
        const d2 = dx * dx + dy * dy;
        const rr = this.hitR(i, dx, dy, d2) + EXPAND;
        if (d2 < rr * rr) splashHits.push(i);
      }
    }
    for (const i of splashHits) {
      this.damageUnit(i, dmg, false, 1, nature);
      if (uhp[i] > 0) this.bulletFx(hitFx, upx[i], upy[i], angle, fxColor);
    }
    splashHits.sort((a2, b2) => b2 - a2);
    for (const i of splashHits) {
      if (uhp[i] > 0) continue;
      this.killUnit(i);
    }
  }

  /**
   * The single unit a point-blank bullet would land on: the nearest whose
   * hitbox contains the point. One victim, like any non-piercing shot.
   */
  private nearestUnit(
    x: number,
    y: number,
    brad: number,
    air: boolean,
    ground: boolean,
  ): number {
    const { upx, upy, uhp, urad, ukind, bStart, bUnits } = this;
    const pad = brad + this.rmaxAliveFor(air, ground);
    const hx0 = clamp(((x - pad) / HC) | 0, 0, HCOLS - 1);
    const hy0 = clamp(((y - pad) / HC) | 0, 0, HROWS - 1);
    const hx1 = clamp(((x + pad) / HC) | 0, 0, HCOLS - 1);
    const hy1 = clamp(((y + pad) / HC) | 0, 0, HROWS - 1);
    let best = -1, bd = Infinity;
    for (let hy = hy0; hy <= hy1; hy++) {
      const row = hy * HCOLS;
      const e = bStart[row + hx1 + 1];
      const e0 = bStart[row + hx0];
      this.probes += e - e0;
      for (let k = e0; k < e; k++) {
        const i = bUnits[k];
        if (i >= this.n || uhp[i] <= 0) continue;
        if (KIND_FLYING[ukind[i]] ? !air : !ground) continue;
        const dx = upx[i] - x, dy = upy[i] - y;
        const d2 = dx * dx + dy * dy;
        const rr = this.hitR(i, dx, dy, d2) + brad;
        if (d2 < rr * rr && d2 < bd) {
          bd = d2;
          best = i;
        }
      }
    }
    return best;
  }

  /**
   * Mindustry Units.closestTarget: the nearest live targetable unit whose
   * CENTRE is within `range`. That is the difference from nearestUnit
   * above, which tests a bullet against a hitbox and so counts a wide
   * unit from its edge; a homing missile's search is centre to centre.
   */
  private nearestInRange(
    x: number,
    y: number,
    range: number,
    air: boolean,
    ground: boolean,
  ): number {
    const { upx, upy, uhp, ukind, bStart, bUnits } = this;
    const hx0 = clamp(((x - range) / HC) | 0, 0, HCOLS - 1);
    const hy0 = clamp(((y - range) / HC) | 0, 0, HROWS - 1);
    const hx1 = clamp(((x + range) / HC) | 0, 0, HCOLS - 1);
    const hy1 = clamp(((y + range) / HC) | 0, 0, HROWS - 1);
    let best = -1, bd = range * range;
    for (let hy = hy0; hy <= hy1; hy++) {
      const row = hy * HCOLS;
      const e = bStart[row + hx1 + 1];
      const e0 = bStart[row + hx0];
      this.probes += e - e0;
      for (let k = e0; k < e; k++) {
        const i = bUnits[k];
        if (i >= this.n || uhp[i] <= 0) continue;
        if (KIND_FLYING[ukind[i]] ? !air : !ground) continue;
        const dx = upx[i] - x, dy = upy[i] - y;
        const d2 = dx * dx + dy * dy;
        if (d2 < bd) {
          bd = d2;
          best = i;
        }
      }
    }
    return best;
  }

  /**
   * Mindustry Unit.impulse(v): `vel += v / mass`, and PhysicsComp.mass is
   * the hitbox's own area — hitSize squared, times pi. The vector is in
   * world units of velocity per TICK, as every Mindustry impulse is; it
   * lands in the pull channel, which the movement step reads and then
   * bleeds away, so the shove outlives the frame that dealt it.
   *
   * That mass divisor is the whole character of both weapons that use it:
   * the same push all but stops an ironhide1 and barely leans on an ironhide3.
   */
  private impulse(i: number, wx: number, wy: number): void {
    // ...AND A PLANTED BODY TAKES NONE OF IT (see ugar). The mission put
    // the thing where it is; a repeater round is not allowed to move it.
    if (this.ugar[i] === 2) return;
    const hitSize = (this.urad[i] * 2) / MU;
    const mass = hitSize * hitSize * Math.PI;
    // world units per tick -> px per second
    const k = (MU * 60) / mass;
    this.upullx[i] += wx * k;
    this.upully[i] += wy * k;
  }

  /**
   * Mindustry Lightning.createLightningInternal, ported whole: coil's shot
   * is not a projectile but a bolt that WALKS.
   *
   * It takes `length / 2` steps. At each one it drops a node bullet where
   * it stands — that is where the damage happens, one victim per node —
   * then looks for enemies whose hitbox falls inside a 30-unit SQUARE
   * around it and jumps to the FURTHEST of them, which is what makes the
   * bolt reach across a crowd rather than nuzzle the nearest body. With
   * nobody in reach it turns up to 20 degrees and wanders half a square on.
   *
   * A unit is only chained ONCE, and only the first `maxChain` of them:
   * past eight victims the bolt stops looking and just walks out. The
   * jittered node positions are handed back as the drawn path.
   *
   * ONE DIVERGENCE. In Mindustry each node is a real bullet, and a real
   * bullet is absorbable — a starhart3's force field standing over a node
   * would eat it. Here the node damages directly and no field sees it, so
   * a bolt walks through a bubble it should have died in. Coil is a
   * 90-unit ground turret and the bubble is 7.5 tiles, so the two rarely
   * meet; wiring it up properly means the absorb pass running before the
   * turrets rather than after them, which is a change to the tick order.
   */
  private lightningBolt(
    x: number,
    y: number,
    angle: number,
    damage: number,
    length: number,
    brad: number,
    air: boolean,
    ground: boolean,
    hitFx: BulletFx | undefined,
    fxColor: RGB | undefined,
    nature: number,
  ): number[] {
    const { upx, upy, uhp, urad, ukind, bStart, bUnits } = this;
    const HIT_RANGE = 30 * MU; // Lightning.hitRange
    const MAX_CHAIN = 8; // Lightning.maxChain
    const half = HIT_RANGE / 2;
    const pts: number[] = [];
    const chained = new Set<number>(); // unit IDS — indices move under us
    const hits = this.boltHits;
    hits.length = 0;
    let rot = angle;
    const nodes = (length / 2) | 0;
    for (let step = 0; step < nodes; step++) {
      // the node's own bullet, which is where every point of coil's damage
      // is actually dealt
      const victim = this.nearestUnit(x, y, brad, air, ground);
      if (victim >= 0) {
        this.damageUnit(victim, damage, false, 1, nature);
        if (uhp[victim] > 0) this.bulletFx(hitFx, x, y, rot, fxColor);
        else if (!hits.includes(victim)) hits.push(victim);
      }
      pts.push(x + (Math.random() * 2 - 1) * 3 * MU, y + (Math.random() * 2 - 1) * 3 * MU);

      // the chain: the furthest un-hit enemy whose hitbox touches the square
      let far = -1, fd = -1;
      if (chained.size < MAX_CHAIN) {
        const pad = half + this.rmaxAliveFor(air, ground);
        const hx0 = clamp(((x - pad) / HC) | 0, 0, HCOLS - 1);
        const hy0 = clamp(((y - pad) / HC) | 0, 0, HROWS - 1);
        const hx1 = clamp(((x + pad) / HC) | 0, 0, HCOLS - 1);
        const hy1 = clamp(((y + pad) / HC) | 0, 0, HROWS - 1);
        for (let hy = hy0; hy <= hy1; hy++) {
          const row = hy * HCOLS;
          const e = bStart[row + hx1 + 1];
          const e0 = bStart[row + hx0];
          this.probes += e - e0;
          for (let k = e0; k < e; k++) {
            const j = bUnits[k];
            if (j >= this.n || uhp[j] <= 0 || chained.has(this.uid[j])) continue;
            if (KIND_FLYING[ukind[j]] ? !air : !ground) continue;
            const dx = upx[j] - x, dy = upy[j] - y;
            // Rect vs hitbox, not a circle — and an axis-aligned one, so
            // this is the only reach test in the file that reads the
            // NOMINAL radius rather than the shaped one (Sim.hitR): the
            // bolt is choosing whom to jump to, and the damage it deals
            // when it lands goes through nearestUnit, which is shaped
            const reach = half + urad[j];
            if (Math.abs(dx) > reach || Math.abs(dy) > reach) continue;
            const d2 = dx * dx + dy * dy;
            if (d2 > fd) {
              fd = d2;
              far = j;
            }
          }
        }
      }
      if (far >= 0) {
        chained.add(this.uid[far]);
        x = upx[far];
        y = upy[far];
      } else {
        rot += (Math.random() * 2 - 1) * ((20 * Math.PI) / 180);
        x += Math.cos(rot) * half;
        y += Math.sin(rot) * half;
      }
    }
    // the walk read live positions, so nothing may be removed until it ends
    hits.sort((a, b) => b - a);
    for (const i of hits) if (uhp[i] <= 0) this.killUnit(i);
    return pts;
  }

  /**
   * Mindustry Damage.collideLaser, the piercer's whole shot: an instant beam
   * that pierces a FIXED NUMBER of units and stops.
   *
   * Two passes, exactly as the original: findPierceLength collects every
   * eligible unit the segment crosses and, if there are more of them than
   * the cap, shortens the beam to the cap'th nearest; collideLine then
   * damages that many, nearest first. Returns the length the beam reached,
   * which is what gets drawn — a piercer firing into a crowd is visibly
   * shorter than one firing down an empty lane.
   */
  private laserBeam(
    x: number,
    y: number,
    angle: number,
    length: number,
    damage: number,
    pierceCap: number,
    armorMult: number,
    pierceArmor: boolean,
    air: boolean,
    ground: boolean,
    hitFx: BulletFx | undefined,
    fxColor: RGB | undefined,
    nature: number,
  ): number {
    const { upx, upy, uhp } = this;
    const dirx = Math.cos(angle), diry = Math.sin(angle);
    const hits = this.boltHits, dists = this.boltDists;
    this.collideLine(x, y, dirx, diry, length, air, ground, hits, dists);
    // nearest first, so the cap keeps the units the beam reaches first
    const order = hits.map((_, k) => k).sort((a, b) => dists[a] - dists[b]);
    // findPierceLength: under the cap the beam runs its full length; at or
    // over it, it stops dead at the cap'th victim (never inside 6 units)
    const reached =
      pierceCap <= 0 || order.length < pierceCap
        ? length
        : Math.max(6 * MU, dists[order[pierceCap - 1]]);
    const dead: number[] = [];
    for (let k = 0; k < order.length && (pierceCap <= 0 || k < pierceCap); k++) {
      const i = hits[order[k]];
      this.damageUnit(i, damage, pierceArmor, armorMult, nature);
      if (uhp[i] > 0) this.bulletFx(hitFx, upx[i], upy[i], angle, fxColor);
      else dead.push(i);
    }
    dead.sort((a, b) => b - a);
    for (const i of dead) if (uhp[i] <= 0) this.killUnit(i);
    return reached;
  }

  /**
   * Mindustry Damage.collideLine's scan: every live targetable unit whose
   * hitbox — grown by collideLine's 3-unit `expand` — touches the segment
   * from (x, y) out `length` along (dirx, diry), together with how far
   * down the line each one sits. Terrain never blocks it; the callers
   * decide what the hits mean. Both arrays are cleared first.
   */
  private collideLine(
    x: number,
    y: number,
    dirx: number,
    diry: number,
    length: number,
    air: boolean,
    ground: boolean,
    hits: number[],
    dists: number[],
  ): void {
    const { upx, upy, uhp, urad, ukind, bStart, bUnits } = this;
    const EXPAND = 7.5; // collideLine's expand = 3 world units
    hits.length = 0;
    dists.length = 0;
    const x2 = x + dirx * length, y2 = y + diry * length;
    const pad = this.rmaxAliveFor(air, ground) + EXPAND;
    const hx0 = clamp(((Math.min(x, x2) - pad) / HC) | 0, 0, HCOLS - 1);
    const hy0 = clamp(((Math.min(y, y2) - pad) / HC) | 0, 0, HROWS - 1);
    const hx1 = clamp(((Math.max(x, x2) + pad) / HC) | 0, 0, HCOLS - 1);
    const hy1 = clamp(((Math.max(y, y2) + pad) / HC) | 0, 0, HROWS - 1);
    for (let hy = hy0; hy <= hy1; hy++) {
      const row = hy * HCOLS;
      const e = bStart[row + hx1 + 1];
      const e0 = bStart[row + hx0];
      this.probes += e - e0;
      for (let k = e0; k < e; k++) {
        const i = bUnits[k];
        if (i >= this.n || uhp[i] <= 0) continue;
        if (KIND_FLYING[ukind[i]] ? !air : !ground) continue;
        const tt = clamp((upx[i] - x) * dirx + (upy[i] - y) * diry, 0, length);
        const dx = upx[i] - (x + dirx * tt), dy = upy[i] - (y + diry * tt);
        const d2 = dx * dx + dy * dy;
        const rr = this.hitR(i, dx, dy, d2) + EXPAND;
        if (d2 < rr * rr) {
          hits.push(i);
          const hx2 = upx[i] - x, hy2 = upy[i] - y;
          dists.push(Math.sqrt(hx2 * hx2 + hy2 * hy2));
        }
      }
    }
  }

  /**
   * LaserTurret's held beam (Mindustry ContinuousBulletType.update). For
   * shootDuration the beam is PINNED to the muzzle and rakes everything
   * under it every damageInterval; then the turret lets go and the last
   * fadeTime of it stays where it was, shortening as it goes out, still
   * damaging on the same clock. Nothing about it is a projectile — the
   * beam's whole state is on the turret, and this is where it burns down.
   */
  private updateBeam(
    t: Tower,
    st: TowerStats,
    cont: NonNullable<BulletStats["continuous"]>,
    dt: number,
  ): void {
    const b = st.bullet;
    const held = t.beamT > cont.fade;
    if (held) {
      // pinned: the beam leaves the muzzle on the turret's current facing
      const mz = st.shootY ?? st.size * 5;
      t.beamOX = t.x + Math.cos(t.angle) * mz;
      t.beamOY = t.y + Math.sin(t.angle) * mz;
      t.beamRot = t.angle;
    }
    // ContinuousLaserBulletType.draw/currentLength: full while held, then
    // linearly out over fadeTime — and the beam SHORTENS as it fades
    const fout = held ? 1 : t.beamT / cont.fade;
    const reach = cont.length * fout;
    // Bullet.timer(1, damageInterval): the damage clock runs through the
    // fade too, over the shorter line
    t.beamDmgT -= dt;
    if (t.beamDmgT <= 0) {
      t.beamDmgT += cont.damageInterval;
      const { upx, upy, uhp } = this;
      const hits = this.boltHits, dists = this.boltDists;
      this.collideLine(
        t.beamOX, t.beamOY, Math.cos(t.beamRot), Math.sin(t.beamRot),
        reach, b.collidesAir, b.collidesGround, hits, dists,
      );
      const dead: number[] = [];
      // every body under the beam takes the tick's damage; the dead are
      // removed highest index first so the swap-remove never moves a
      // body that is still waiting its turn
      for (const i of hits) {
        this.damageUnit(
          i, b.damage, b.pierceArmor ?? false, b.armorMultiplier ?? 1, TOWER_NATURE[t.kind],
        );
        if (uhp[i] > 0) {
          // THE BEAM LIGHTS WHAT IT RAKES (constants.ts furnace, `burn`).
          // Every damage interval re-times the fire rather than stacking
          // it, so a body held under the beam burns for the full term
          // from the moment it leaves — which is the point of a furnace
          if (b.burn && !KIND_BURN_IMMUNE[this.ukind[i]]) this.applyBurn(i, b.burn);
          if (b.poison) this.applyPoison(i, b.poison);
          this.bulletFx(b.hitFx, upx[i], upy[i], t.beamRot, b.fxColor);
        } else dead.push(i);
      }
      dead.sort((p, q) => q - p);
      for (const i of dead) if (uhp[i] <= 0) this.killUnit(i);
      // a beam held on a shield tower burns it exactly as it burns a unit — the
      // collide line above knows only the unit arrays (see fireShot)
      if (t.aimShieldTower >= 0) {
        const s = this.shieldTowers[t.aimShieldTower];
        if (s && s.hp > 0) this.shieldTowerHit(s, b.damage, b.hitFx, t.beamRot, b.fxColor);
      }
      // ...and a beam held on a BUILDING the same way, which is the only
      // damage a conquered furnace ever does: the sweep above walks the
      // swarm's bodies, and the swarm's own gun has none to walk
      if (t.aimTower) this.structureHit(t.aimTower, b.damage, b.hitFx, t.beamRot, b.fxColor);
    }
    t.beamT -= dt;
    if (t.beamT <= 0) {
      t.beamT = -1;
      t.beamDmgT = 0;
    }
  }

  /** scratch for the instant weapons and the held beam; never nested,
   *  never persisted */
  private readonly boltHits: number[] = [];
  private readonly boltDists: number[] = [];

  /**
   * THE SUPPORT PAIR'S PULSE (TowerStats.heal): every `reload` seconds a
   * fixer or a restorer returns `heal.percent` of their OWN pool to
   * every player structure whose centre is inside its range, itself
   * included.
   *
   * What it will not touch:
   *
   *   the CORE, which is the run. Its pool is what every map's pacing is
   *   set against (see CORE_HP), and a block that quietly undid the swarm's
   *   work on it would rewrite every level at once rather than help a line
   *   hold;
   *   and anything already full, which is most of the board most of the
   *   time and the reason the ring is only thrown when something took.
   *
   * The reload runs on the tower's own fireRate like a gun's, so the
   * Hydrophobic rule slows a waterlogged fixer exactly as it slows a
   * waterlogged tacker.
   */
  private updateFixer(t: Tower, st: TowerStats, dt: number): void {
    if (t.cd > 0) {
      t.cd -= dt * t.fireRate;
      return;
    }
    t.cd = st.reload;
    const r2 = st.range * st.range;
    let did = false;
    for (const o of this.towers) {
      if (o.team !== "player") continue; // nothing of the player's mends the swarm's
      // the TARGET's own ceiling (Tower.hpMax), not its kind's: a fixer
      // topping up a braced turret has to fill the pool that turret has
      const max = o.hpMax;
      if (o.hp >= max) continue;
      const dx = o.x - t.x, dy = o.y - t.y;
      if (dx * dx + dy * dy > r2) continue;
      o.hp = Math.min(max, o.hp + max * st.heal!.percent);
      did = true;
      // Fx.heal on each block that took, the same mark a healed body wears
      this.pushFx(o.x, o.y, 0.4, FxKind.Heal);
    }
    // ...and healWaveDynamic over the pulse's whole reach, so a player can
    // see what a fixer actually covers without selecting it. Only when
    // something took: a fixer over an untouched line is quiet
    if (did) this.pushFxCol(t.x, t.y, 22 / 60, FxKind.HealWave, 0, st.range, PAL.heal);
  }

  /**
   * THE LOCK BEAM (BulletStats.lock, tether and nothing else). No
   * reload, no volley and no bullet: the turret picks ONE body, swings
   * onto it, and for as long as it is aimed within its cone it burns that
   * body and nothing else.
   *
   * WHAT MAKES IT A WEAPON IS THE SPOOL. `bullet.damage` is what the beam
   * does the instant it catches — thirty a second, which kills nothing —
   * and every second of unbroken contact walks that up toward `peak` times
   * as much, reached after `spool` seconds. The ramp is linear in time and
   * hard-capped there; it never climbs past it, however long the siege
   * runs.
   *
   * THE SPOOL BELONGS TO THE LOCK. Changing target zeroes it outright, so
   * a beam walked across a crowd is worth its cold damage the whole way
   * and the turret is only ever paid for holding still. Swinging off the
   * held target — out of cone, or mid-turn — bleeds it back at the rate it
   * filled rather than dropping it, so a target that jinks costs seconds
   * and not the siege.
   *
   * WHICH BODY IT PICKS is railhead's rule (TowerStats.sort
   * "strongest"): the highest CURRENT health in range, because the one
   * thing a ramp cannot afford is to spend its climb on a dartback1. And it
   * HOLDS that pick — the scan only runs once the lock is broken by death
   * or by the target leaving reach, never to trade up — because re-picking
   * the strongest every interval would ping-pong between two bodies as
   * their pools crossed and the beam would never spool at all.
   */
  private updateLockBeam(t: Tower, st: TowerStats, dt: number): void {
    const lock = st.bullet.lock!;
    const { upx, upy, uhp, urad, ufly } = this;
    // what the beam was holding LAST frame, as one comparable key: a
    // unit's never-reused uid, or a shield tower folded into the negatives
    // below -1. It is what decides whether the spool survives this frame
    const prevKey = t.aimShieldTower >= 0 ? -2 - t.aimShieldTower : t.target;
    const r2 = st.range * st.range;

    // Nothing the cursor has tapped gets a say here, exactly as the volley
    // path takes it: a click is a question about a body, never an order to
    // the line (Game.inspect)
    let best = -1;
    // the held lock, revalidated against the uid the index hint claims —
    // alive, and still within reach counted from its EDGE, so a wide body
    // sliding out is not dropped a moment before it visibly leaves
    if (best < 0 && t.target >= 0 && t.targetIdx >= 0 && t.targetIdx < this.n &&
        this.uid[t.targetIdx] === t.target) {
      const i = t.targetIdx;
      if (ufly[i] !== 0 ? st.targetAir : st.targetGround) {
        const dx = upx[i] - t.x, dy = upy[i] - t.y;
        const d2 = dx * dx + dy * dy;
        const reach = st.range + this.hitR(i, dx, dy, d2);
        if (d2 <= reach * reach) best = i;
      }
    }
    // ...and only a BROKEN lock scans, on BaseTurret's clock so a turret
    // staring at an empty lane pays for the walk at most five times a
    // second
    t.targetT -= dt;
    if (best < 0 && t.targetT <= 0) {
      const hasTargets =
        (st.targetAir && this.nAliveAir > 0) || (st.targetGround && this.nAliveGround > 0);
      best = hasTargets
        ? this.bestTarget(
            t.x, t.y, st.range, st.targetAir, st.targetGround,
            st.sort === "strongest", !(TOWER_NATURE[t.kind] & DMG_BULLET),
          )
        : -1;
      t.targetT = TARGET_INTERVAL;
    }
    // a live lock leaves the clock ARMED, so the frame the lock breaks —
    // the body died, or walked out — re-scans on the spot rather than
    // standing dark for the rest of an interval
    if (best >= 0) t.targetT = 0;
    t.targetIdx = best;
    t.target = best >= 0 ? this.uid[best] : -1;

    // IDLE HANDS CHEW THE MAP'S SHIELD TOWERS (see the volley path): a
    // beam with nothing else in range spends the lull on a dome, and the
    // spool it builds there is a real one — it just never survives the
    // switch to the body that walks in next
    let shr: ShieldTower | null = null;
    if (best < 0 && st.targetGround && this.shieldTowers.length > 0) {
      const si = this.idleShieldTowerFor(t, r2);
      if (si >= 0) shr = this.shieldTowers[si];
    }
    t.aimShieldTower = shr ? this.shieldTowers.indexOf(shr) : -1;

    // `strength` lerps in as the beam catches and out as it lets go, and
    // the spool rides on top of it: a cold beam is drawn at a FIFTH of its
    // width and a fully spooled one at all of it. The floor is deliberately
    // low — the beam is thin (Renderer.drawLockBeam), so the only thing
    // that thickens it is the ramp, and its width reads as its damage
    const ease = 1 - keepOver(1 - 0.1, dt * 60);
    if (best < 0 && !shr) {
      t.beamStr += (0 - t.beamStr) * ease;
      t.beamSpool = 0; // nothing held: the next lock starts cold
      return;
    }
    // a changed lock is a new lock, and a new lock starts at zero — and
    // the ramp is read only after that, so the frame a beam jumps bodies
    // is already worth the cold damage and not the last lock's
    const key = shr ? -2 - t.aimShieldTower : t.target;
    if (key !== prevKey) t.beamSpool = 0;
    const frac = lock.spool > 0 ? t.beamSpool / lock.spool : 1;

    const tx = shr ? shr.x : upx[best];
    const ty = shr ? shr.y : upy[best];
    const targetRot = Math.atan2(ty - t.y, tx - t.x);
    const diff = Sim.angleDiff(t.angle, targetRot);
    const turn = st.rotateSpeed * dt;
    t.angle = Math.abs(diff) <= turn ? targetRot : t.angle + Math.sign(diff) * turn;
    t.beamX = tx;
    t.beamY = ty;
    t.beamStr += (0.2 + 0.8 * frac - t.beamStr) * ease;
    if (Math.abs(Sim.angleDiff(t.angle, targetRot)) >= st.shootCone) {
      // swung off it, but still HOLDING it: the spool bleeds back at the
      // rate it filled rather than being thrown away
      t.beamSpool = Math.max(0, t.beamSpool - dt);
      return;
    }

    // the ramp, linear in contact time and capped at `peak`
    const dmg = st.bullet.damage * (1 + (lock.peak - 1) * frac) * dt;
    t.beamSpool = Math.min(lock.spool, t.beamSpool + dt);
    if (shr) {
      this.shieldTowerHit(shr, dmg, st.bullet.hitFx, t.angle, st.bullet.fxColor);
      return;
    }
    // damageContinuousPierce: armour never applies, but a shield still eats it
    this.damageUnit(best, dmg, st.bullet.pierceArmor ?? false, 1, TOWER_NATURE[t.kind]);
    if (uhp[best] <= 0) this.killUnit(best);
  }

  /**
   * StatusComp.apply for the one OPPOSITE PAIR this game fields.
   * StatusEffects declares burning.opposite(wet), and Mindustry's
   * handleOpposite resolves a status landing on its opposite by SPENDING
   * the application draining the opposite's clock — `result.time -=
   * time * 0.5` — and only when that empties it does the incoming status
   * take hold, at its own full duration. So water quenches a burning unit
   * before it can soak it, fire dries a soaked unit before it can light
   * it, and torch and the liquid turrets covering one lane fight each
   * other for the status slot exactly as they do upstream.
   */

  private applyBurn(i: number, stacks: number): void {
    this.uburn[i] = Math.min(this.uburn[i] + stacks, FIRE_MAX_STACKS);
    this.uburnT[i] = FIRE_SECONDS;
  }

  /** hits ADD and never cap — the punishing one (docs/elements.md) */
  applyPoison(i: number, dps: number): void {
    if (i < 0 || i >= this.n || this.uhp[i] <= 0) return;
    this.upoison[i] += dps;
    this.upoisonT[i] = POISON_SECONDS;
  }

  /**
   * The wet half of the pair, plus the one rule opposite() cannot supply:
   * WHICH water wins. Mindustry keeps one status entry and re-times it;
   * our wet carries a per-ammo slow, so the strongest slow in force holds
   * the entry — a deluge soaking cannot be watered down by a douser
   * droplet, while an equal or deeper soak re-times freely.
   */
  private applyWet(i: number, spec: { duration: number; slow: number; soak: number }): void {
    // the soak is permanent and the slow is not, so the two immunities are
    // separate: SPEEDY (mutation.ts) and a HULL (KIND_WET_IMMUNE — a boat is
    // already in the water) both shrug off the slow, and neither stops the
    // threshold building
    this.usoak[i] += spec.soak;
    if (KIND_WET_IMMUNE[this.ukind[i]]) return;
    const slow = this.speedyOn ? 1 : spec.slow;
    if (this.uwet[i] <= 0 || slow < this.uwetSlow[i]) this.uwetSlow[i] = slow;
    this.uwet[i] = spec.duration;
  }

  /** Mindustry Damage.applyArmor: flat reduction, floored at 10% of the raw hit */
  private static applyArmor(dmg: number, armor: number): number {
    return Math.max(dmg - armor, 0.1 * dmg);
  }

  /**
   * Mindustry ShieldComp.rawDamage: armor comes off the raw hit, then the
   * shield soaks everything it can and only the remainder reaches health.
   * Every damage source goes through here so shields can never be skipped.
   *
   * pierceArmor is ShieldComp.damagePierce — it skips applyArmor but still
   * runs the shield, which is how burning damage behaves in the original.
   *
   * armorMult is BulletType.armorMultiplier, applied the way
   * ShieldComp.damageArmorMult does: it scales the TARGET'S ARMOUR, not the
   * damage, so a piercer's 4 means armour counts quadruple against it and
   * the same beam is worth far less to an ironhide3 than to an ironhide1.
   */
  private damageUnit(
    i: number,
    raw: number,
    pierceArmor = false,
    armorMult = 1,
    /** what the hit IS (DMG_BULLET / DMG_ELECTRIC) — a round unless said */
    nature = DMG_BULLET,
  ): void {
    // StatusEffects.invincible, healthMultiplier infinity: every hit lands
    // on a unit still arriving for exactly nothing. It runs a full second,
    // half of it after the unit has started walking
    if (this.uspawn[i] > 0) return;
    // ...and on a CLOAKED body (levels.ts cloak), A ROUND lands on it for
    // nothing until it shows again.
    //
    // ONLY A ROUND. The cloak used to eat every point of damage in the
    // game, which made the Wraith fleet's answer "wait for it to come
    // back" — and a window in which the board can do nothing at all is
    // not a mechanic a player can build against, it is a pause. What
    // stops a bullet is the hull not being where the bullet was aimed;
    // fire, a bolt, a beam, a ray and a rail are not aimed at a point in
    // that sense, so the seven non-bullet turrets (constants.ts
    // NON_BULLET_KINDS) go through it. That makes a cloak a REASON TO
    // OWN ONE OF THEM rather than a reason to stop playing, and it is why
    // those seven can also still take aim at a dark hull (bestTarget).
    if (HAS_CLOAK && nature & DMG_BULLET && this.ucloakT[i] > 0) return;
    // THE IRONHIDE5'S PLATING STAMP rides on top of the body's own armour
    // (levels.ts armorField), and it goes through the same armorMult a
    // bullet carries — borrowed plating is plating, so a piercer's
    // armorMultiplier counts it four times over exactly as it counts the
    // body's own. Nothing is stamped when no carrier is on the roster
    // (HAS_ARMOR_AURA), so this costs one compare in the usual case
    const armor =
      HAS_ARMOR_AURA && this.uarmorT[i] > 0
        ? this.uarmor[i] + this.uarmorAdd[i]
        : this.uarmor[i];
    // TITAN ROUNDS (relics.ts): the round gains a quarter again for every
    // tier the body stands above the first, so the ramp is worth nothing
    // against an ironhide1 and DOUBLE against a stoop5. Before armour,
    // because it is the round hitting harder and not the plate mattering
    // less — Monofilament below is the other one
    let hit = this.titanOn ? raw * TITAN_MUL[KIND_TIER[this.ukind[i]]] : raw;
    // WATER CONDUCTS (constants.ts WET_SHOCK_MUL): an electric shot on a
    // SOAKED body is worth the multiple, and THAT IS THE WHOLE OF THE
    // ELECTRIC MECHANIC — two things, a flag on the gun (bullet.electric,
    // read into DMG_ELECTRIC) and the water already on the body. There is
    // no third piece: the "shocked" mark this used to lay did nothing but
    // print a second symbol, and it is gone.
    //
    // It sits beside Titan, above plating, for Titan's reason — the shot
    // lands harder, the plate does not matter less — and it keys off the
    // body being wet RIGHT NOW, so a soak that has dried is worth nothing
    // and a body soaked a tick ago pays in full
    if (nature & DMG_ELECTRIC && this.uwet[i] > 0) hit *= WET_SHOCK_MUL;
    // MONOFILAMENT ROUNDS (relics.ts): armour stops applying, to every
    // damage path in the game at once. It is here rather than on
    // BulletStats because a bullet's own `pierceArmor` is honoured by
    // exactly ONE of the sim's damage paths — a relic written as a bullet
    // field would have done nothing at all for a piercer or a furnace
    let amount =
      pierceArmor || this.armorBlind ? hit : Sim.applyArmor(hit, armor * armorMult);
    // LEADERSHIP (mutation.ts): the CEILING on one hit, taken after
    // plating and before anything is spent — so a hit that lands on a led
    // body is worth at most LEADERSHIP_CAP whether it goes into the force
    // field or into the pool, and a weapon whose whole damage is the size
    // of each shot is worth exactly that. It sits on this line because
    // this line is the one door every point of damage to a body comes
    // through: a shot, a blast's share, a beam's tick, fire, venom
    //
    // AND IT IS LAST, WHICH MEANS IT BEATS THE RELICS THAT MAKE A HIT
    // BIGGER. Titan and Monofilament both land above this line, so under
    // Leadership they buy almost nothing — a capped hit is a capped hit
    // however hard the round was. That is the mutators pulling the other
    // way, exactly as they are supposed to, and it is why TERMINAL
    // PROTOCOL is the relic that answers this rule: an execute is not
    // damage, so it does not come through this door at all.
    if (this.uled[i] > 0 && amount > LEADERSHIP_CAP) amount = LEADERSHIP_CAP;
    if (this.ushield[i] > 0.0001) {
      this.ushieldAlpha[i] = 1;
      const soaked = Math.min(this.ushield[i], amount);
      this.ushield[i] -= soaked;
      amount -= soaked;
    }
    // A CROSSER'S HEALTH IS NOT ITS OWN (drainCrosser): the hit comes off
    // the train's pool, and this body's own bar catches up on the next
    // tick. Everything above this line still applies to the CAR that was
    // hit — its plating, the soak on it, the cap over it — because that is
    // what the shot actually struck; only where the remainder is spent
    // moves.
    const cross = this.ucross[i];
    if (cross >= 0) {
      if (amount > 0) this.drainCrosser(cross, amount);
    } else if (amount > 0) {
      this.uhp[i] -= amount;
      // TERMINAL PROTOCOL (relics.ts): a body knocked to the last fraction
      // of its own pool does not get to spend it. Zeroing the health is
      // the whole of it — every caller of this already reaps whatever came
      // out of it at or below zero, so the death goes through the one path
      // it always did
      if (this.executeAt > 0 && this.uhp[i] > 0 && this.uhp[i] <= this.uhpmax[i] * this.executeAt)
        this.uhp[i] = 0;
      // BLINK (levels.ts blink): a hit that got through throws the body
      // forward, if its jump is off cooldown and it is still alive to jump
      if (HAS_BLINK && this.uhp[i] > 0 && this.ublinkCd[i] <= 0) {
        const bl = KIND_BLINK[this.ukind[i]];
        if (bl) this.blinkUnit(i, bl.dist, bl.cooldown);
      }
    }
    // THE STARBURST (levels.ts starburst, the Grapnels): A HIT THAT LANDS
    // THROWS A STAR BACK, on a chance and no oftener than its clock. This
    // is the family's ONLY output — a grapnel carries no weapon at all —
    // so the rule sits on the one line every point of damage in the game
    // comes through, and the clock above it is what keeps a body under a
    // beam or a rot from answering every tick.
    //
    // A SHIELD EATING THE HIT IS STILL A HIT. The roll is outside the
    // `amount > 0` branch on purpose: what pulls the answer out of a
    // grapnel is the board shooting at it, not the board getting through
    // its plating, and a rule that needed health to come off would be
    // silent for exactly as long as a force field held.
    //
    // A BODY THAT DIED ON THIS HIT DOES NOT ANSWER, because it is about to
    // do something far louder: killUnit throws five (see there).
    if (HAS_STARBURST && this.uhp[i] > 0 && this.ustarCd[i] <= 0) {
      const sb = KIND_STARBURST[this.ukind[i]];
      if (sb && Math.random() < sb.chance) {
        this.ustarCd[i] = sb.cooldown;
        this.throwStar(i, 1);
      }
    }
  }

  /**
   * COULD THIS FOOTPRINT HOLD THIS BUILDING? canPlace's ground test with
   * the tech gate, the price and the crowd left out, and with the
   * building's OWN cells treated as free — a structure is never in its own
   * way when it is the thing being moved. Units standing where it lands
   * are not asked about either: claimGround raises `unstickPending`, and
   * the same shove that clears a fresh building's cells clears these.
   */
  private canStand(gx: number, gy: number, sz: number, self: Structure): boolean {
    if (gx < 0 || gy < 0 || gx > COLS - sz || gy > ROWS - sz) return false;
    const { blocked } = this.terrain;
    const { isGoal } = this.field;
    for (let y = gy; y < gy + sz; y++)
      for (let x = gx; x < gx + sz; x++) {
        const i = y * COLS + x;
        if (blocked[i] || isGoal[i] || this.terrain.spawn[i]) return false;
        const occ = this.cellTower[i];
        if (occ && occ !== self) return false;
      }
    for (const s of this.shieldTowers) {
      if (s.hp <= 0) continue;
      if (gx < s.gx + SHIELD_TOWER_SIZE && s.gx < gx + sz && gy < s.gy + SHIELD_TOWER_SIZE && s.gy < gy + sz)
        return false;
    }
    return true;
  }

  /**
   * THE JUMP (levels.ts blink): `dist` px along the route the body is on,
   * half a cell at a time, stopping short of the first cell its layer
   * cannot enter and of any building's cell — a wraith blinks past a
   * turret line, never into it. Its momentum is kept; only the position
   * moves, so the crowd shove and the wall slide pick it up where it
   * lands. The streak between the two points is the whole of the effect.
   */
  private blinkUnit(i: number, dist: number, cooldown: number): void {
    const fly = this.ufly[i] !== 0;
    const mf = this.unav[i] !== 0 ? this.navalField : this.field;
    const x0 = this.upx[i], y0 = this.upy[i];
    let dx: number, dy: number;
    if (fly) {
      const gx = this.ugx[i] - x0, gy = this.ugy[i] - y0;
      const gl = Math.sqrt(gx * gx + gy * gy) || 1;
      dx = gx / gl;
      dy = gy / gl;
    } else {
      mf.sample(x0, y0, flowTmpBlink);
      dx = flowTmpBlink.x;
      dy = flowTmpBlink.y;
      if (dx * dx + dy * dy < 0.01) return;
    }
    const step = CELL * 0.5;
    let d = 0;
    for (let t = step; t <= dist; t += step) {
      const px = x0 + dx * t, py = y0 + dy * t;
      const cx = (px / CELL) | 0, cy = (py / CELL) | 0;
      if (cx < 1 || cy < 1 || cx >= COLS - 1 || cy >= ROWS - 1) break;
      const ci = cy * COLS + cx;
      if (!fly && (mf.walk[ci] || this.cellTower[ci])) break;
      d = t;
    }
    this.ublinkCd[i] = cooldown;
    if (d < step) return;
    this.upx[i] = x0 + dx * d;
    this.upy[i] = y0 + dy * d;
    this.pushFxCol(x0, y0, 18 / 60, FxKind.Blink, Math.atan2(dy, dx), d, PAL.wraith);
  }

  /**
   * THE VEIL (levels.ts cloak.veil): the flagship going dark takes every
   * body within `range` with it for the same spell — a stamp, like the
   * auras, written once as it cloaks
   */
  private veil(i: number, range: number, duration: number): void {
    const { upx, upy, urad } = this;
    const pad = range + Math.max(this.rmaxAliveGround, this.rmaxAliveAir);
    const hx0 = clamp(((upx[i] - pad) / HC) | 0, 0, HCOLS - 1);
    const hy0 = clamp(((upy[i] - pad) / HC) | 0, 0, HROWS - 1);
    const hx1 = clamp(((upx[i] + pad) / HC) | 0, 0, HCOLS - 1);
    const hy1 = clamp(((upy[i] + pad) / HC) | 0, 0, HROWS - 1);
    for (let hy = hy0; hy <= hy1; hy++) {
      const row = hy * HCOLS;
      const e = this.bStart[row + hx1 + 1];
      const e0 = this.bStart[row + hx0];
      this.probes += e - e0;
      for (let b = e0; b < e; b++) {
        const j = this.bUnits[b];
        if (j >= this.n || j === i) continue;
        const dx = upx[j] - upx[i], dy = upy[j] - upy[i];
        const d2 = dx * dx + dy * dy;
        const rr = range + this.hitR(j, dx, dy, d2);
        if (d2 > rr * rr) continue;
        if (this.ucloakT[j] < duration) this.ucloakT[j] = duration;
      }
    }
  }

  /**
   * THE PAYLOAD GOING OFF (levels.ts payload), where the body is — on
   * contact (updateUnitWeapons, the suicide branch) or on its death
   * (killUnit), the same either way. A plain charge bursts at once;
   * bomblets are thrown out as short fused shots that burst where they
   * stop; a fuse ARMS a charge that sits there and goes off later, which
   * is the nuke, and the seconds it sits are the seconds the player has
   * to see it
   */
  private detonate(i: number): void {
    const pl = KIND_PAYLOAD[this.ukind[i]];
    if (!pl) return;
    const x = this.upx[i], y = this.upy[i];
    // a stack goes off for every body in it (mergeSqueezed) — the blast's
    // reach is the kind's, its bite is the bodies'
    const stack = this.ustack[i];
    if (pl.bomblets) {
      const b = pl.bomblets;
      for (let k = 0; k < b.count; k++) {
        const a = Math.random() * Math.PI * 2;
        const sp = (b.spread * (0.4 + Math.random() * 0.6)) / 0.5;
        this.shots.push({
          x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
          life: 0.5, age: 0, damage: 0, splash: b.splash * stack, splashRadius: b.radius,
          look: BOMBLET_LOOK, collide: false, trailT: 0, poison: 0, poisonChance: 1,
          homing: 0, seek: null, soakT: 0, soakRate: 1, burn: 0,
        });
      }
    }
    if (pl.fuse) {
      this.shots.push({
        x, y, vx: 0, vy: 0,
        life: pl.fuse, age: 0, damage: 0, splash: pl.splash * stack, splashRadius: pl.radius,
        look: NUKE_LOOK, collide: false, trailT: 0, poison: 0, poisonChance: 1,
        homing: 0, seek: null, soakT: 0, soakRate: 1, burn: 0,
      });
      this.pushFx(x, y, 10 / 60, FxKind.Shockwave, 0, pl.radius * 0.35);
      return;
    }
    this.splashStructures(x, y, pl.splash * stack, pl.radius);
    // the ring at the blast's reach is the heavy tiers' — a T1 that goes
    // off by the hundred goes off as a small burst and no more
    if (KIND_TIER[this.ukind[i]] >= 4) this.pushFx(x, y, 10 / 60, FxKind.Shockwave, 0, pl.radius);
    this.pushFx(x, y, fxLife(FxKind.BlastExplosion), FxKind.BlastExplosion, 0, pl.radius, (Math.random() * 0x7fffffff) | 0);
  }

  /**
   * LEADERSHIP (mutation.ts): the tier fives stamping their order over
   * everything around them.
   *
   * IT IS ONE PASS ON ONE BEAT, not a question asked per hit. Asking "is
   * a tier five near this body" inside damageUnit would put a radius
   * search on the hottest path in the file — every bullet, every splash
   * victim, every burn tick — so the answer is written onto the bodies
   * instead, LEADERSHIP_PERIOD apart, and the hot path reads one float.
   *
   * THE SCAN COSTS NOTHING WHEN THERE IS NOBODY TO LEAD. The census
   * (aliveByKind) says how many tier fives are out there before anything
   * is walked, and it doubles as the walk's early exit once the last one
   * has been found — so the ordinary wave, which fields none, pays one
   * loop over seven counters.
   */
  private updateLeadership(dt: number): void {
    if (!this.leadershipOn) return;
    this.leadT -= dt;
    if (this.leadT > 0) return;
    this.leadT = LEADERSHIP_PERIOD;
    let left = 0;
    for (let k = 0; k < KIND_T5.length; k++) if (KIND_T5[k]) left += this.aliveByKind[k];
    if (left === 0) return;
    const { upx, upy, uhp, ukind, urad, bStart, bUnits } = this;
    const range = LEADERSHIP_TILES * CELL;
    const hold = LEADERSHIP_PERIOD + LEADERSHIP_LINGER;
    for (let i = 0; i < this.n && left > 0; i++) {
      if (!KIND_T5[ukind[i]] || uhp[i] <= 0) continue;
      left--;
      // the same broad phase every aura in this file walks, over the
      // circle the order carries (a body is covered as soon as its OWN
      // hitbox reaches the edge, which is Units.nearby's rule)
      const pad = range + Math.max(this.rmaxAliveGround, this.rmaxAliveAir);
      const hx0 = clamp(((upx[i] - pad) / HC) | 0, 0, HCOLS - 1);
      const hy0 = clamp(((upy[i] - pad) / HC) | 0, 0, HROWS - 1);
      const hx1 = clamp(((upx[i] + pad) / HC) | 0, 0, HCOLS - 1);
      const hy1 = clamp(((upy[i] + pad) / HC) | 0, 0, HROWS - 1);
      for (let hy = hy0; hy <= hy1; hy++) {
        const row = hy * HCOLS;
        const e = bStart[row + hx1 + 1];
        const e0 = bStart[row + hx0];
        this.probes += e - e0;
        for (let b = e0; b < e; b++) {
          const j = bUnits[b];
          if (j >= this.n || uhp[j] <= 0) continue;
          // THE LEADER IS NOT UNDER ITS OWN ORDER, and neither is any
          // other tier five standing in the circle: the bodies the rule
          // is about are the escort, and the thing giving the order has
          // to stay killable or the rule has no answer (see mutation.ts)
          if (KIND_T5[ukind[j]]) continue;
          const dx = upx[j] - upx[i], dy = upy[j] - upy[i];
          const d2 = dx * dx + dy * dy;
          const rr = range + this.hitR(j, dx, dy, d2);
          if (d2 > rr * rr) continue;
          this.uled[j] = hold;
        }
      }
    }
  }

  /**
   * Gather the force fields standing this tick. Skipped outright unless a
   * carrier kind is actually alive, so the scan only costs anything in the
   * waves that field one.
   */
  /**
   * THE CARRIERS AS THE SWEEP READS THEM (absorb): middle, squared radius
   * and unit index, laid out in FLD_SLICE-wide vertical slices by the
   * counting sort at the bottom of collectForceFields — the same shape
   * buildHash lays the bodies out in, for the same reason.
   */
  // ...at DOUBLE precision, and not because the middles need it: the
  // squared radius is compared against a squared distance, and rounding the
  // one side to a float moved a shot in every twenty thousand from inside a
  // bubble to outside it. A sweep that replaces another has to answer the
  // same question on the boundary as well as in the middle.
  private readonly fldX = new Float64Array(MAX_UNITS);
  private readonly fldY = new Float64Array(MAX_UNITS);
  private readonly fldR2 = new Float64Array(MAX_UNITS);
  private readonly fldU = new Int32Array(MAX_UNITS);
  private readonly fldStart = new Int32Array(FLD_SLICES + 1);
  private readonly fldCount = new Int32Array(FLD_SLICES);
  private readonly fldCur = new Int32Array(FLD_SLICES);
  /** the widest bubble standing, which is how far either side of a shot the
   *  slices have to be read */
  private fldMaxR = 0;

  private collectForceFields(): void {
    this.fldN = 0;
    this.fldMaxR = 0;
    if (this.projs.n === 0) return;
    // the census already knows how many carriers are out there: none means
    // no scan at all, and the count doubles as the scan's early exit once
    // it has seen the last one
    let left = 0;
    for (const k of FORCE_KINDS) left += this.aliveByKind[k];
    if (left === 0) return;
    const { ukind, ushield, uforceScale } = this;
    for (let i = 0; i < this.n && left > 0; i++) {
      if (!KIND_IS_FORCE[ukind[i]]) continue;
      left--;
      // ForceFieldAbility.update guards its bullet sweep on shield > 0, so
      // a pool still climbing back through zero deflects nothing
      if (ushield[i] <= 0 || uforceScale[i] <= 0.01) continue;
      this.fldI[this.fldN++] = i;
    }
    if (this.fldN === 0) return;
    // ...AND INTO SLICES. Count, prefix, place — and the carriers go in in
    // the order they were collected, which is ascending unit index, because
    // that is the order the sweep resolves ties in (see absorb).
    const { fldI, fldX, fldY, fldR2, fldU, fldStart, fldCount, fldCur, upx, upy } = this;
    fldCount.fill(0);
    for (let f = 0; f < this.fldN; f++) {
      const i = fldI[f];
      const rad = KIND_FORCE[ukind[i]]!.radius * uforceScale[i];
      if (rad > this.fldMaxR) this.fldMaxR = rad;
      fldCount[sliceOf(upx[i])]++;
    }
    fldStart[0] = 0;
    for (let b = 0; b < FLD_SLICES; b++) fldStart[b + 1] = fldStart[b] + fldCount[b];
    fldCur.set(fldStart.subarray(0, FLD_SLICES));
    for (let f = 0; f < this.fldN; f++) {
      const i = fldI[f];
      const rad = KIND_FORCE[ukind[i]]!.radius * uforceScale[i];
      const at = fldCur[sliceOf(upx[i])]++;
      fldX[at] = upx[i];
      fldY[at] = upy[i];
      fldR2[at] = rad * rad;
      fldU[at] = i;
    }
  }

  /**
   * ForceFieldAbility's shieldConsumer: a shot whose position falls inside
   * a standing bubble is deleted outright and its damage billed to the
   * carrier's pool. Absorption happens the moment the shot is inside the
   * outline, before it can reach anything sheltering there, and an absorbed
   * bullet never splashes (BulletType.despawned skips the blast on
   * `b.absorbed`) — the blast dies with the shell.
   *
   * Only `absorbable` bullets are eaten. Cleaver is the exception on this
   * roster and needs no flag: its ShrapnelBulletType sets absorbable=false
   * AND deals its damage as an instant ray at the muzzle, so it never
   * becomes a projectile here at all and rakes straight through a field.
   */
  private absorb(px: number, py: number, damage: number): boolean {
    const { ushield, ushieldAlpha, fldX, fldY, fldR2, fldU, fldStart } = this;
    if (this.fldN > 0) {
      // ONLY THE SLICES A BUBBLE COULD REACH THIS SHOT FROM: a carrier
      // further off in x than the widest bubble standing cannot be over it,
      // whatever its y (see FLD_SLICE)
      const r = this.fldMaxR;
      const end = fldStart[Math.min(FLD_SLICES - 1, sliceOf(px + r)) + 1];
      // THE LOWEST UNIT INDEX WINS, which is what the flat scan this
      // replaced settled on by walking the carriers in index order. Two
      // bubbles over one shot is common in a Tusker column, and which pool
      // pays for the shot is a fact about the run — so the slices are read
      // whole rather than returned from early.
      let hit = -1;
      for (let f = fldStart[Math.max(0, sliceOf(px - r))]; f < end; f++) {
        const dx = px - fldX[f], dy = py - fldY[f];
        // the field is a circle, drawn and tested alike (Renderer draws it
        // off the same disc the shield towers' domes use)
        if (dx * dx + dy * dy > fldR2[f]) continue;
        const i = fldU[f];
        if (hit < 0 || i < hit) hit = i;
      }
      if (hit >= 0) {
        // Bullet.type.shieldDamage: the shot's damage, shieldDamageMultiplier 1
        ushield[hit] -= damage;
        ushieldAlpha[hit] = 1;
        this.pushFxCol(px, py, 12 / 60, FxKind.Absorb, 0, 0, TEAM_CRUX_RGB);
        return true;
      }
    }
    // the shieldTowers' domes eat shots exactly as a carrier's bubble does —
    // circles rather than polygons, and the damage lands in the shield tower's
    // own shield pool (see damageShieldTower)
    if (this.domesUp) {
      for (const s of this.shieldTowers) {
        if (s.hp <= 0 || s.shield <= 0 || s.scale < 0.5) continue;
        const rad = s.domeR * s.scale;
        const dx = px - s.x, dy = py - s.y;
        if (dx * dx + dy * dy > rad * rad) continue;
        this.damageShieldTower(s, damage);
        this.pushFxCol(px, py, 12 / 60, FxKind.Absorb, 0, 0, TEAM_CRUX_RGB);
        return true;
      }
    }
    return false;
  }

  private updateProjectiles(dt: number): void {
    const { upx, upy, uhp, bStart, bUnits } = this;
    const P = this.projs;
    this.bodyIters += P.n;
    this.collectForceFields();
    // THE LANES ARE READ THROUGH `P` EVERY TIME, NEVER HELD IN LOCALS, AND
    // THIS LOOP CREATES NO CLOSURE. Both are V8 rules, not style. A local
    // per lane (`const X = P.x`) needs re-taking after any push that can
    // re-allocate the lanes (createFrags, Projs.grow), and the re-take
    // was a closure over those locals; a comparator for the hit sort was
    // another, made inside the loop. Either closure makes V8 desugar
    // `for (let p ...)` into a per-iteration-environment loop — two
    // nested loops in the bytecode with a copy flag — and put the locals
    // in a heap context. Traced (--trace-deopt) that shape deoptimized
    // on EVERY call, "exit from OSR'd inner loop": each pass entered
    // unoptimized, was on-stack-replaced into Maglev, and fell out at the
    // end, so the shot loop never ran in TurboFan at all. A lane load
    // through a constant-shaped object is one L1 read; it is not the
    // cost. The comparator is PROJ_DESC, made once at module scope
    const K = P.kind, FL = P.flags, PIER = P.pierced;
    const { uid, ufly } = this;
    // THE STATS, ONCE A PASS PER (KIND, FRAG, ALT) rather than once a shot:
    // bulletFor is a map lookup on a string and a chain of reads, and
    // beside it the bucket span (rmaxAliveFor, a ceil and a divide) is
    // the same for every shot of one ammo for the whole pass — the live
    // roster's widest hitbox is taken at the hash build and holds until
    // the next. So both are looked up the first time an ammo is met and
    // read back from a table for the rest, keyed by the kind index and
    // the two low flag bits (PROJ_FRAG, PROJ_ALT). Cleared every pass:
    // four slots a kind, and no version to keep honest
    const tbl = this.bulletTbl, spt = this.bulletSp, bft = this.bulletFl, brt = this.bulletBrad;
    tbl.fill(null);
    // ...AND THE AMMO'S SHAPE AS ONE INTEGER (BF_*). The common tick asks
    // eight yes/no questions of the stats — does it home, puff, trail,
    // fuse, arc, splash, fragment, how wide is it — and each was a
    // property load on an object whose hidden class differs from ammo to
    // ammo (every BulletStats literal has its own set of optional keys),
    // so every one was a polymorphic inline cache: measured, 3ms of a
    // whirl pass, as much as the whole move-and-sweep floor. Folded into
    // a byte per table slot they are one typed read and a mask, and the
    // stats object is touched only inside the branch that fires
    const eaten = this.fldN > 0 || this.domesUp;
    let probes = 0;
    for (let p = P.n - 1; p >= 0; p--) {
      const fl = FL[p];
      const ti = (K[p] << 2) | (fl & (PROJ_FRAG | PROJ_ALT));
      let b = tbl[ti];
      if (b === null) {
        b = this.bulletFor(TOWER_KINDS[K[p]], (fl & PROJ_FRAG) !== 0, (fl & PROJ_ALT) !== 0);
        tbl[ti] = b;
        // the static HIT_SPAN/FRAG_SPAN bound, shrunk to the LIVE largest
        // hitbox on the layers this bullet can touch — same hits, fewer
        // buckets walked in the waves that field no heavy
        brt[ti] = b.hitRadius ?? 2.5;
        spt[ti] = Math.max(
          1,
          Math.ceil((this.rmaxAliveFor(b.collidesAir, b.collidesGround) + brt[ti]) / HC),
        );
        bft[ti] =
          (b.homing ? BF_HOMING : 0) |
          (b.puff ? BF_PUFF : 0) |
          (b.trail ? BF_TRAIL : 0) |
          (b.flak ? BF_FLAK : 0) |
          (b.artillery ? BF_ARTILLERY : 0) |
          (b.splash > 0 ? BF_SPLASH : 0) |
          (b.frag ? BF_FRAG : 0) |
          (b.cloud ? BF_CLOUD : 0);
      }
      const bf = bft[ti];
      // A SHOT OF THE SWARM'S (Conquest) runs its own, much shorter step:
      // it flies past every body and lands on the player's buildings, by
      // the cell it is over — the enemy shots' rule (updateEnemyShots) on
      // a turret's own bullet
      if (fl & PROJ_ENEMY) {
        if (this.stepHostileProjectile(p, b, dt)) P.remove(p);
        continue;
      }
      // BulletType.updateHoming, BEFORE the step: the shot picks the
      // nearest target within homingRange OF ITSELF and swings toward it
      // — so a missile whose mark dies latches onto whatever it passes
      // next instead of flying on into the ground.
      // The swarm's missile homes on nothing: its marks are buildings
      //
      // THE SEARCH IS ON A CLOCK, NOT ON EVERY TICK. Mindustry re-picks
      // every tick; here the quarry is HELD (homeI, checked by uid) and
      // the hash is searched again only when it is gone — dead, out of
      // range, or a different body under a reused index — or when
      // HOMING_REPICK has run out. Between searches the missile turns
      // onto what it holds exactly as before. What changes is only how
      // soon it notices a NEARER body than the one it has, and at four
      // degrees a tick of turn a tenth of a second is inside the swing
      // it was already making. Measured on the hive clock (79,000
      // missiles in flight, one body on the board) the every-tick search
      // was a third of the projectiles phase: every one of them walked
      // its 5x5 buckets each tick and found nothing, sixty times a second
      if (bf & BF_HOMING) {
        const hm = b.homing!;
        let tgt = P.homeI[p];
        if (tgt >= 0) {
          if (tgt >= this.n || uhp[tgt] <= 0 || uid[tgt] !== P.homeUid[p]) tgt = -1;
          else {
            const hdx = upx[tgt] - P.x[p], hdy = upy[tgt] - P.y[p];
            if (hdx * hdx + hdy * hdy >= hm.range * hm.range) tgt = -1;
          }
        }
        P.homeT[p] -= dt;
        if (tgt < 0 || P.homeT[p] <= 0) {
          tgt = this.nearestInRange(P.x[p], P.y[p], hm.range, b.collidesAir, b.collidesGround);
          P.homeI[p] = tgt;
          P.homeUid[p] = tgt >= 0 ? uid[tgt] : 0;
          P.homeT[p] = HOMING_REPICK;
        }
        if (tgt >= 0) {
          const want = Math.atan2(upy[tgt] - P.y[p], upx[tgt] - P.x[p]);
          const cur = Math.atan2(P.vy[p], P.vx[p]);
          const diff = Sim.angleDiff(cur, want);
          const turn = hm.power * dt;
          const a = Math.abs(diff) <= turn ? want : cur + Math.sign(diff) * turn;
          // Vec2.setAngle keeps the speed and turns the heading
          const spd = Math.sqrt(P.vx[p] * P.vx[p] + P.vy[p] * P.vy[p]);
          P.vx[p] = Math.cos(a) * spd;
          P.vy[p] = Math.sin(a) * spd;
        }
      }
      const px = (P.x[p] += P.vx[p] * dt);
      const py = (P.y[p] += P.vy[p] * dt);
      P.life[p] -= dt;
      P.age[p] += dt;

      // BulletType.updateTrailEffects: a puff on a per-tick CHANCE, at a
      // constant radius — Fx.missileTrail, which is Fx.artilleryTrail's
      // fading disc under another name, so it rides the same pass
      // ...rolled only while the pool would take it: a puff is dressing,
      // refused above FX_CAP (pushSlot), and a roll for a refused puff is
      // a random and a call per missile per tick for nothing. The pool is
      // at its cap on every late board, which is exactly when there are
      // eighty thousand missiles asking
      if (bf & BF_PUFF && this.fxOn && this.fxN < FX_CAP && Math.random() < b.puff!.chance * dt)
        this.pushTrail(px, py, b.puff!.size, b.sprite?.back);

      // ArtilleryBulletType.update: a puff every (3 + fslope*2) * mult
      // ticks, at a radius of fslope * size. fslope peaks at half life, so
      // the trail is both fastest and fattest at the top of the arc and
      // thins away at both ends — which is the whole illusion of height
      if (bf & BF_TRAIL) {
        const tr = b.trail!;
        const fin = P.age[p] / (P.age[p] + P.life[p]);
        const slope = 1 - Math.abs(fin - 0.5) * 2;
        P.trailT[p] += dt;
        const every = ((3 + slope * 2) * tr.mult) / 60;
        if (P.trailT[p] >= every) {
          P.trailT[p] = 0;
          this.pushTrail(px, py, slope * tr.size, b.sprite?.back);
        }
      }

      // a force field eats the shot where it stands: no hit, no splash —
      // and a shield tower's dome the same way (domesUp gates its half of the
      // sweep the way fldN gates the carriers')
      if (eaten && this.absorb(px, py, b.damage)) {
        P.remove(p);
        continue;
      }

      // flak proximity fuse: check every interval; an enemy inside
      // explodeRange (+ its hitbox) primes the shell, which detonates
      // explodeDelay later while continuing to fly
      if (bf & BF_FLAK && P.primeT[p] < 0) {
        const fk = b.flak!;
        P.flakT[p] -= dt;
        if (P.flakT[p] <= 0) {
          P.flakT[p] += fk.interval;
          if (this.anyUnitWithin(px, py, fk.explodeRange, b.collidesAir, b.collidesGround)) {
            P.primeT[p] = fk.explodeDelay;
          }
        }
      }
      if (P.primeT[p] >= 0) {
        P.primeT[p] -= dt;
        if (P.primeT[p] <= 0) P.life[p] = 0;
      }

      // A DRIFTING CLOUD (constants.ts BulletStats.cloud): it touches
      // nothing and lands nowhere. Every `interval` of its flight it
      // poisons whatever it is over, so the pulse rides the age lane
      // rather than a clock of its own — a shot that is only ever a few
      // in the air does not earn a lane on every one of them
      if (bf & BF_CLOUD) {
        const cl = b.cloud!;
        if (((P.age[p] / cl.interval) | 0) !== (((P.age[p] - dt) / cl.interval) | 0)) {
          this.splash(
            px, py, cl.radius, b.damage, b.collidesAir, b.collidesGround,
            undefined, undefined, TOWER_NATURE[TOWER_KINDS[K[p]]], cl.poison,
          );
          this.bulletFx(b.hitFx, px, py, 0, b.fxColor);
        }
      }

      // shots come from elevated towers and arc over terrain — they never
      // collide with rock, only with units or their range-capped life.
      // Artillery shells overfly units too: they only die on target, where
      // the splash below is their whole damage — and a cloud never
      // collides at all
      let dead = P.life[p] <= 0;
      if (!dead && !(bf & (BF_ARTILLERY | BF_CLOUD))) {
        const pier = PIER[p];
        const brad = brt[ti];
        const sp = spt[ti];
        const hx = clamp((px / HC) | 0, 0, HCOLS - 1);
        const hy = clamp((py / HC) | 0, 0, HROWS - 1);
        // a piercing shot may hit several units this tick and outlive them
        // all, so its victims are gathered first and removed afterwards
        // from the highest index down — a swap-remove mid-scan would drag
        // an unvisited unit into a bucket we have already walked past
        // A LENGTH IS NOT A STORE. `hits.length = 0` on an array is a
        // runtime call in V8, and run unconditionally it cost 3.4ms of a
        // whirl pass — for a list that is already empty on all but a few
        // hundred of a hundred and forty thousand shots. Asked first
        const hits = this.splashHits;
        if (hits.length !== 0) hits.length = 0;
        const cx0 = Math.max(0, hx - sp), cx1 = Math.min(HCOLS - 1, hx + sp);
        outer: for (let cy = Math.max(0, hy - sp); cy <= Math.min(HROWS - 1, hy + sp); cy++) {
          const row = cy * HCOLS;
          const e = bStart[row + cx1 + 1];
          const e0 = bStart[row + cx0];
          probes += e - e0;
          for (let k = e0; k < e; k++) {
            const i = bUnits[k];
            if (i >= this.n || uhp[i] <= 0) continue;
            if (ufly[i] !== 0 ? !b.collidesAir : !b.collidesGround) continue;
            // Bullet.collides: a pierce shot skips whoever it already hit
            if (pier && pier.includes(uid[i])) continue;
            const dx = upx[i] - px, dy = upy[i] - py;
            const d2 = dx * dx + dy * dy;
            const hr = this.hitR(i, dx, dy, d2) + brad;
            if (d2 < hr * hr) {
              hits.push(i);
              // Bullet.collision: a plain shot is spent on the first hit,
              // a piercing one is only added to `collided` and flies on
              if (!pier) {
                dead = true;
                break outer;
              }
              pier.push(uid[i]);
              // Mindustry pierceCap: a capped pierce is SPENT once it
              // has been through that many bodies, rather than running
              // its whole lifetime
              if (b.pierceCap !== undefined && pier.length >= b.pierceCap) {
                dead = true;
                break outer;
              }
            }
          }
        }
        // NOTHING WAS HIT, WHICH IS THE COMMON CASE BY FAR: a shot spends
        // almost all its ticks over empty ground, and the sort and the
        // two loops below have nothing to do — skipped rather than run on
        // an empty list, because at a hundred and forty thousand shots a
        // step the call alone is a line in the profile
        if (hits.length > 0) {
          for (const i of hits) {
            this.damageUnit(i, b.damage, false, 1, TOWER_NATURE[TOWER_KINDS[K[p]]]);
            // BulletType.hitEntity: an impulse of knockback * 80 world units
            // straight out from the shot. Unit.impulse divides by mass, so
            // the same shove all but stops an ironhide1 and leans on an ironhide3
            if (b.knockback) {
              const dx = upx[i] - px, dy = upy[i] - py;
              const d = Math.sqrt(dx * dx + dy * dy) || 1;
              const mag = b.knockback * 80;
              this.impulse(i, (dx / d) * mag, (dy / d) * mag);
            }
            if (uhp[i] > 0 && b.burn && !KIND_BURN_IMMUNE[this.ukind[i]]) this.applyBurn(i, b.burn);
            // ...and a splash round's rot is the BLAST's, laid once on
            // everything it reaches — applying it here as well would
            // poison whatever the shot touched twice
            if (uhp[i] > 0 && b.poison && b.splash <= 0) this.applyPoison(i, b.poison);
            if (uhp[i] > 0 && b.wet) this.applyWet(i, b.wet);
            // BulletType.hitEffect, at the bullet rather than the victim.
            // A splash shot skips it — the blast in the `dead` branch below
            // is its hit effect — and so does a killing blow, whose death
            // puff would only be buried under it
            if (uhp[i] > 0 && b.splash <= 0)
              this.bulletFx(b.hitFx, px, py, Math.atan2(P.vy[p], P.vx[p]), b.fxColor);
          }
          if (hits.length > 1) hits.sort(PROJ_DESC);
          for (const i of hits) if (uhp[i] <= 0) this.killUnit(i);
        }
        // a shield tower's BODY is a target no bucket holds: there are at most a
        // handful alive, so a direct circle test per shot costs less than
        // teaching the spatial hash about buildings. The dome (absorbed
        // above, wider than the body) shields it for as long as it stands,
        // so a shot landing here with the dome up was already spent
        if (!dead && this.shieldTowers.length > 0) {
          for (let si = 0; si < this.shieldTowers.length; si++) {
            const s = this.shieldTowers[si];
            if (s.hp <= 0) continue;
            // the pierce ledger holds unit uids; a shield tower rides it as a
            // negative sentinel no uid can collide with
            const sid = -1000 - si;
            if (pier && pier.includes(sid)) continue;
            const sdx = s.x - px, sdy = s.y - py;
            const hr = SHIELD_TOWER_BODY_R + brad;
            if (sdx * sdx + sdy * sdy >= hr * hr) continue;
            this.damageShieldTower(s, b.damage);
            this.bulletFx(b.hitFx, px, py, Math.atan2(P.vy[p], P.vx[p]), b.fxColor);
            if (!pier) {
              dead = true;
              break;
            }
            pier.push(sid);
            if (b.pierceCap !== undefined && pier.length >= b.pierceCap) {
              dead = true;
              break;
            }
          }
        }
        // THE SWARM'S CONQUERED TURRETS stand in the shot's way too
        // (Conquest): one grid read at the shot, the enemy shots' own rule
        // turned round. A piercing shot goes through a building once, on a
        // sentinel below any shield tower's
        if (!dead && this.enemyTowers > 0) {
          const es = this.structureAt(px, py, "enemy");
          if (es) {
            const sid = -1000000 - (es.gy * COLS + es.gx);
            if (!pier || !pier.includes(sid)) {
              this.damageTower(es, b.damage);
              if (b.splash <= 0)
                this.bulletFx(b.hitFx, px, py, Math.atan2(P.vy[p], P.vx[p]), b.fxColor);
              if (!pier) dead = true;
              else {
                pier.push(sid);
                if (b.pierceCap !== undefined && pier.length >= b.pierceCap) dead = true;
              }
            }
          }
        }
      }
      if (dead) {
        const rot = Math.atan2(P.vy[p], P.vx[p]);
        // BulletType.hit: the blast, and the hit effect a splash bullet
        // saves for it rather than firing per victim above. Mindustry gives
        // every splash bullet despawnHit, so a shell that simply runs out
        // of lifetime blasts exactly as one that ran into something
        if (bf & BF_SPLASH) {
          // ONLY the water burst is told how far the blast reached. Every
          // other hit effect — a flak pop, a shockwave ring — carries its
          // own fixed Mindustry size, and handing them a radius here would
          // quietly resize effects that have drawn the same for every
          // turret that shipped before this one
          this.bulletFx(b.hitFx, px, py, rot, b.fxColor, false,
            b.hitFx === FxKind.WaterBurst ? b.splashRadius : 0);
          this.bulletFx(b.hitFx2, px, py, rot, b.fxColor, false,
            b.hitFx2 === FxKind.WaterBurst ? b.splashRadius : 0);
          this.splash(
            px,
            py,
            b.splashRadius,
            b.splash,
            b.collidesAir,
            b.collidesGround,
            b.burn,
            b.wet,
            TOWER_NATURE[TOWER_KINDS[K[p]]],
            b.poison,
          );
        }
        // BulletType.despawned, and only that: a shot spent on a direct
        // hit was removed, not despawned, and leaves nothing behind
        if (P.life[p] <= 0) this.bulletFx(b.despawnFx, px, py, rot, b.fxColor);
        // BulletType.hit -> createFrags: the burst that makes a whirl
        // shell a wall rather than a point. Fired here, at the end, so a
        // fragment is never walked by the loop it was born in — it lands
        // past `p`, which this backward walk has already left behind. K, FL
        // and PIER are safe across the grow a push can cause: a grow copies
        // the lanes, and the old buffers still hold every slot below p,
        // which is all this walk has left to visit
        if (bf & BF_FRAG) this.createFrags(p, b.frag!);
        P.remove(p);
      }
    }
    this.probes += probes;
  }

  /** is any live targetable unit's hitbox within r of (x, y)? */
  private anyUnitWithin(x: number, y: number, r: number, air: boolean, ground: boolean): boolean {
    const { upx, upy, uhp, urad, ukind, bStart, bUnits } = this;
    const pad = r + this.rmaxAliveFor(air, ground);
    const hx0 = clamp(((x - pad) / HC) | 0, 0, HCOLS - 1);
    const hy0 = clamp(((y - pad) / HC) | 0, 0, HROWS - 1);
    const hx1 = clamp(((x + pad) / HC) | 0, 0, HCOLS - 1);
    const hy1 = clamp(((y + pad) / HC) | 0, 0, HROWS - 1);
    for (let hy = hy0; hy <= hy1; hy++) {
      const row = hy * HCOLS;
      const e = bStart[row + hx1 + 1];
      const e0 = bStart[row + hx0];
      this.probes += e - e0;
      for (let k = e0; k < e; k++) {
        const i = bUnits[k];
        if (i >= this.n || uhp[i] <= 0) continue;
        if (KIND_FLYING[ukind[i]] ? !air : !ground) continue;
        const dx = upx[i] - x, dy = upy[i] - y;
        const d2 = dx * dx + dy * dy;
        const rr = r + this.hitR(i, dx, dy, d2);
        if (d2 < rr * rr) return true;
      }
    }
    return false;
  }

  private readonly splashHits: number[] = [];

  /**
   * Area damage with Mindustry's falloff (Damage.calculateDamage): full at
   * the blast center easing to 40% at the radius edge; anything whose
   * hitbox overlaps the radius is affected, armor applying per victim.
   * The blast the player SEES is the bullet's own hitEffect, fired beside
   * this by whatever set the shot off.
   *
   * A BLAST CARRIES THE ROUND'S STATUS TOO, and that is a deliberate
   * departure from upstream, where a status is a thing a bullet's DIRECT
   * hit applies and a splash is only ever damage. It exists for the
   * incendiary and freezing rungs of the upgrade branches (upgrades.ts):
   * an artillery shell arcs OVER its target and never lands a direct hit
   * at all, so "shells that set fire" applied to precisely nothing until
   * the fire travelled with the blast. Every stock turret in the game
   * either splashes or applies a status and never both, so nothing that
   * shipped before this changes behaviour by one point.
   */
  private splash(
    x: number,
    y: number,
    radius: number,
    dmg: number,
    air: boolean,
    ground: boolean,
    burn?: number,
    wet?: BulletStats["wet"],
    /** what threw it — a shell's blast is its shell's (TOWER_NATURE). A
     *  hull coming apart (Cascade) has no gun behind it and keeps the
     *  default, which is the behaviour it always had */
    nature = DMG_BULLET,
    /** poison a second, flat across the blast rather than falling off with
     *  it: the rot the toxin line lays is the same wherever in the cloud a
     *  body was standing */
    poison = 0,
  ): void {
    const { upx, upy, uhp, uarmor, urad, ukind, bStart, bUnits, splashHits } = this;
    splashHits.length = 0;
    const reach = radius + this.rmaxAliveFor(air, ground);
    const hx0 = clamp(((x - reach) / HC) | 0, 0, HCOLS - 1);
    const hy0 = clamp(((y - reach) / HC) | 0, 0, HROWS - 1);
    const hx1 = clamp(((x + reach) / HC) | 0, 0, HCOLS - 1);
    const hy1 = clamp(((y + reach) / HC) | 0, 0, HROWS - 1);
    for (let hy = hy0; hy <= hy1; hy++) {
      const row = hy * HCOLS;
      const e = bStart[row + hx1 + 1];
      const e0 = bStart[row + hx0];
      this.probes += e - e0;
      for (let k = e0; k < e; k++) {
        const i = bUnits[k];
        if (i >= this.n || uhp[i] <= 0) continue;
        if (KIND_FLYING[ukind[i]] ? !air : !ground) continue;
        const dx = upx[i] - x, dy = upy[i] - y;
        const d2 = dx * dx + dy * dy;
        const rr = radius + this.hitR(i, dx, dy, d2);
        if (d2 < rr * rr) splashHits.push(i);
      }
    }
    // shieldTowers stand in blasts too: the body is a fat circle, so a shell
    // landing beside one chips it exactly as it chips a unit — this is the
    // only way artillery (whose shells never collide) hurts one at all.
    // (A blast on the PLAYER's side — a swarm shell — chips neither the
    // map's shield towers nor the swarm's own walls)
    if (ground) {
      for (const s of this.shieldTowers) {
        if (s.hp <= 0) continue;
        const sdx = s.x - x, sdy = s.y - y;
        const rr = radius + SHIELD_TOWER_BODY_R;
        if (sdx * sdx + sdy * sdy >= rr * rr) continue;
        const d = Math.sqrt(sdx * sdx + sdy * sdy);
        this.damageShieldTower(s, dmg * Math.max(0, 0.4 + 0.6 * (1 - d / radius)));
      }
      // ...and so do the SWARM's conquered turrets (Conquest), by their
      // footprint's edge and at the same falloff — a shell landing beside
      // one chips it, which is the only way artillery reaches one at all
      if (this.enemyTowers > 0)
        for (const es of this.structuresWithin(x, y, radius, this.splashOut, "enemy")) {
          const half = (this.sizeOf(es) * CELL) / 2;
          const d = Math.max(0, Math.hypot(es.x - x, es.y - y) - half);
          this.damageTower(es, dmg * Math.max(0, 0.4 + 0.6 * (1 - d / radius)));
        }
    }
    // damage first (indices stay stable), then remove the dead from the
    // highest index down so swap-remove can't disturb pending removals
    for (const i of splashHits) {
      const ddx = upx[i] - x, ddy = upy[i] - y;
      const d = Math.sqrt(ddx * ddx + ddy * ddy);
      const raw = dmg * Math.max(0, 0.4 + 0.6 * (1 - d / radius));
      this.damageUnit(i, raw, false, 1, nature);
      // the status lands on what SURVIVED the blast, exactly as it does on
      // a direct hit — lighting a corpse is a fire nobody sees
      if (uhp[i] > 0) {
        if (burn && !KIND_BURN_IMMUNE[ukind[i]]) this.applyBurn(i, burn);
        if (wet) this.applyWet(i, wet);
        if (poison > 0) this.applyPoison(i, poison);
      }
    }
    splashHits.sort((a, b) => b - a);
    for (const i of splashHits) {
      if (uhp[i] > 0) continue;
      this.killUnit(i);
    }
  }

  /**
   * Claim and fill one slot of the effect pool, every lane written — a
   * slot is REUSED after swap-remove, so a field left unset here would be
   * whatever the previous tenant put there. The specialised pushers below
   * overwrite the lanes they own after this returns. -1 = pool refused
   * (ambient effects switched off, over FX_CAP without `force`, or the
   * hard FX_MAX either way).
   */
  private pushSlot(
    x: number,
    y: number,
    ttl: number,
    kind: FxKind,
    rot: number,
    len: number,
    seed: number,
    sides: number,
    force: boolean,
  ): number {
    const i = this.fxN;
    // dressing is refused outright with the switch off (see setEffects);
    // a forced effect is a weapon and goes through either way
    if (!force && (!this.fxOn || i >= FX_CAP)) return -1;
    if (i >= FX_MAX || (force && i >= FX_CAP + FX_WEAPON_CAP)) return -1;
    this.fxN = i + 1;
    this.fxX[i] = x;
    this.fxY[i] = y;
    this.fxAge[i] = 0;
    this.fxTtl[i] = ttl;
    this.fxKind[i] = kind;
    this.fxRot[i] = rot;
    this.fxLen[i] = len;
    this.fxSeed[i] = seed;
    this.fxSides[i] = sides;
    this.fxUnit[i] = 0;
    this.fxHasCol[i] = 0;
    this.fxPts[i] = null;
    return i;
  }

  /** swap-remove one effect, keeping the bolt-path refs in step */
  private removeFx(i: number): void {
    const n = --this.fxN;
    this.fxX[i] = this.fxX[n];
    this.fxY[i] = this.fxY[n];
    this.fxAge[i] = this.fxAge[n];
    this.fxTtl[i] = this.fxTtl[n];
    this.fxKind[i] = this.fxKind[n];
    this.fxRot[i] = this.fxRot[n];
    this.fxLen[i] = this.fxLen[n];
    this.fxSeed[i] = this.fxSeed[n];
    this.fxSides[i] = this.fxSides[n];
    this.fxUnit[i] = this.fxUnit[n];
    this.fxHasCol[i] = this.fxHasCol[n];
    this.fxColR[i] = this.fxColR[n];
    this.fxColG[i] = this.fxColG[n];
    this.fxColB[i] = this.fxColB[n];
    this.fxPts[i] = this.fxPts[n];
    this.fxPts[n] = null; // the vacated slot must not pin a bolt path
  }

  /** Fx.lightning: the only effect whose shape is data rather than a seed —
   * Mindustry hands it the very point list the walk built */
  private pushBolt(x: number, y: number, ttl: number, pts: readonly number[], force = false): void {
    const i = this.pushSlot(x, y, ttl, FxKind.Lightning, 0, 0, 0, 0, force);
    if (i >= 0) this.fxPts[i] = pts;
  }

  /**
   * `force` marks an effect that IS a weapon rather than dressing on one —
   * cleaver's shrapnel ray, piercer's beam and charge glow, coil's bolt, the
   * rail's trail — and pushes it past FX_CAP. Those weapons deal instant
   * invisible damage, so with their one visible artifact dropped a firing
   * turret and a stalled one look identical, and a swarm big enough to
   * saturate the budget is exactly when that report comes in. Bounded by
   * turret count x fire rate — tens of overshoot, not the crowd's
   * thousands — so the cap still holds for everything ambient.
   */
  private pushFx(
    x: number,
    y: number,
    ttl: number,
    kind: FxKind,
    rot = 0,
    len = 0,
    seed = 0,
    sides = 0,
    force = false,
  ): void {
    this.pushSlot(x, y, ttl, kind, rot, len, seed, sides, force);
  }

  /**
   * pushFx with Effect.at's colour argument and a style index in `sides`:
   * the swarm's weapons, whose looks are data (weapons.ts) rather than a
   * kind apiece. `force` as on pushFx
   */
  private pushFxCol(
    x: number,
    y: number,
    ttl: number,
    kind: FxKind,
    rot: number,
    len: number,
    col: RGB,
    sides = 0,
    force = false,
    seed = 0,
  ): void {
    const i = this.pushSlot(x, y, ttl, kind, rot, len, seed, sides, force);
    if (i >= 0) {
      this.fxHasCol[i] = 1;
      this.fxColR[i] = col[0];
      this.fxColG[i] = col[1];
      this.fxColB[i] = col[2];
    }
  }

  /**
   * Effect.at(x, y, rotation, color) for one of a bullet's own effects.
   * The kind carries its Mindustry lifetime (FX_LIFE) and every one of
   * them scatters particles, so both are filled in here rather than at the
   * dozen call sites. An unset kind is Fx.none and draws nothing.
   * `force` as on pushFx: weapon-defining artifacts skip the cap. `len` is
   * left at 0 by every effect that draws at its own Mindustry size and is
   * only filled in for the one kind that cannot (FxKind.WaterBurst, whose
   * whole job is to show the reach of the blast that fired it).
   *
   * Returns whether the effect actually LANDED. Nearly every caller
   * ignores it; fireShot does not, because a muzzle effect the pool
   * refused is a shot with nothing to show for it (see the fallback flash
   * on Tower.flashT and the bare flag on the shot, projs.ts PROJ_BARE).
   */
  private bulletFx(
    kind: BulletFx | undefined,
    x: number,
    y: number,
    rot: number,
    col?: RGB,
    force = false,
    len = 0,
  ): boolean {
    // refuse before rolling the seed, so a capped board — or one with the
    // effects switched off (see setEffects) — leaves the random stream
    // exactly where the old object push left it
    if (kind === undefined) return false;
    if (!force && (!this.fxOn || this.fxN >= FX_CAP)) return false;
    if (this.fxN >= FX_MAX) return false;
    const i = this.pushSlot(
      x, y, FX_LIFE[kind], kind, rot, len, (Math.random() * 0x7fffffff) | 0, 0, force,
    );
    if (i < 0) return false;
    if (col) {
      this.fxHasCol[i] = 1;
      this.fxColR[i] = col[0];
      this.fxColG[i] = col[1];
      this.fxColB[i] = col[2];
    }
    return true;
  }

  /**
   * Fx.unitSpawn, via Call.spawnEffect. It takes its own push because it is
   * the one effect that carries a UNIT (Mindustry's e.data): the entrance
   * is drawn in the arriving unit's own sprite, so the renderer has to be
   * told which one landed.
   */
  private pushSpawnFx(x: number, y: number, rot: number, unit: number): void {
    const i = this.pushSlot(x, y, FX_UNIT_SPAWN, FxKind.UnitSpawn, rot, 0, 0, 0, false);
    if (i < 0) return;
    this.fxUnit[i] = unit;
    // the arriving body is drawn in its own sprite, so it arrives wearing
    // its own team's cell too — the colour rides the effect because the
    // unit it belongs to may be dead by the time the husk fades
    this.fxHasCol[i] = 1;
    const col = TEAM_CRUX_RGB;
    this.fxColR[i] = col[0];
    this.fxColG[i] = col[1];
    this.fxColB[i] = col[2];
  }

  /**
   * Fx.artilleryTrail: a disc that fades where it was dropped. It takes
   * its own push because its radius rides the `len` slot and it is drawn
   * a layer under the shells rather than with the rest of the effects.
   */
  private pushTrail(x: number, y: number, radius: number, col?: RGB): void {
    const i = this.pushSlot(
      x, y, FX_LIFE[FxKind.ArtilleryTrail], FxKind.ArtilleryTrail, 0, radius, 0, 0, false,
    );
    if (i >= 0 && col) {
      this.fxHasCol[i] = 1;
      this.fxColR[i] = col[0];
      this.fxColG[i] = col[1];
      this.fxColB[i] = col[2];
    }
  }
}
