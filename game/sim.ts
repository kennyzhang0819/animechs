import {
  ALL_MOVE_BITS,
  CORE_HP,
  INF,
  LAYER_BIT,
  MOVE_LAYERS,
  NAVAL_LAND_SPEED,
  NCELLS,
  type MoveLayer,
  type ZoneKind,
  BURN_DPS as BURN_DPS_IMPORT,
  BURN_FX_CHANCE as BURN_FX_CHANCE_IMPORT,
  DAMAGE_SMOKE_BELOW,
  DAMAGE_SMOKE_LIFE,
  DAMAGE_SMOKE_RATE,
  FX_SPAWN,
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
  PAL,
  TEAM_CRUX_RGB,
  ROWS as ROWS_IMPORT,
  TOWERS as TOWERS_IMPORT,
  TOWER_HP_SCALE,
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
const BURN_DPS = BURN_DPS_IMPORT;
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
import {
  WORLDS,
  UNIT_ID,
  UNIT_KINDS as UNIT_KINDS_IMPORT,
  UNIT_RMAX,
  UNIT_RMAX_AIR,
  UNIT_RMAX_GROUND,
  UNIT_STATS,
  unitDrop,
  waveGroups,
  WAVE_GAP_OPENING,
  WAVE_RELEASE_SECONDS,
  type LegSpec,
  type LevelSpec,
  type UnitKind,
  waveSpawnRate,
} from "./levels";

/** module-local for the same getter reason as the constants block above */
const UNIT_KINDS = UNIT_KINDS_IMPORT;
import { unitHpAtLevel } from "./ladder";

/**
 * THE TIDE: what a survive mission sends once its script is spent. The
 * last SURVIVE_CYCLE_WAVES waves go again as a cycle, and every cycle
 * adds SURVIVE_LOOP_LEVELS to the enemy level every body spawns at —
 * three levels is HP_PER_LEVEL^3, about +19% health a cycle, so a clock
 * that outlives its script by a few minutes climbs a handful of steps
 * rather than a cliff. Four waves rather than one so the tide keeps the
 * script's rhythm (a lull, a spike) instead of sending its finale on a
 * loop.
 */
const SURVIVE_LOOP_LEVELS = 3;
const SURVIVE_CYCLE_WAVES = 4;
import {
  ARMORED_ARMOR,
  ARMORED_MAX_TIER,
  hasMutation,
  mutationsInForce,
  OVERSHIELD_SCALE,
  HUNGRY_CHANCE,
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
  MITOSIS_BROOD,
  MITOSIS_SPREAD,
  MITOSIS_TRIES,
  RECONSTRUCT_DELAY,
  RECONSTRUCT_GRACE,
  SPEEDY_SPEED,
  VOLATILE_DMG,
  VOLATILE_RADIUS,
} from "./mutation";
import { loadMap, OFFICIAL_MAPS, rasterizeSpawns, terrainFromMap, type SpawnCircle } from "./maps";
import { NO_UPGRADES, upgradedTower, type TechState } from "./tech";
import {
  applyGlobalMods,
  applyTurretMods,
  dropScale,
  INSURANCE_SCRAP,
  LAST_VOLLEY_RATE,
  LAST_VOLLEY_SECONDS,
  LAST_VOLLEY_TILES,
  modBit,
  modRegen,
  rollSolo,
  sizeWithMods,
  MODS,
  PHOENIX_CHANCE,
  rollTurretMods,
  type ModId,
} from "./mods";
import { RICH_SCRAP, SCRAP_START, sellValue } from "./economy";
import { airWalkMask, isBuildableWall, isWaterFloor, navalWalkMask, WALL_DEEP, type Terrain } from "./terrain";
import {
  MAX_WEAPONS,
  unitDamageScale,
  UNIT_REACH,
  UNIT_WEAPONS,
  EXPLOSION_STYLES,
  type UnitWeapon,
} from "./weapons";
import {
  FxKind,
  TOWER_KINDS,
  type Projectile,
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
 * saturated screen can no longer make a firing fuse look like a stalled
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
/** seconds a death ring lives — the puff a body leaves wherever it went */
const FX_DEATH = 0.35;
/** what a DEVOURED body's ring is drawn in (see feedHungry) — the hungry
 *  hue, so a meal never reads as a kill the player's towers scored */
const HUNGRY_FX_COL: RGB = [1, 0.35, 0.72];

// --- Mindustry unit physics (async/PhysicsProcess.java) ---
// every unit is a circle of radius hitSize * unitCollisionRadiusScale
// (0.6); our urad stores hitSize/2 in px, so the factor doubles to 1.2.
// Note the physics circle is BIGGER than the hitbox — crowds keep a
// sliver of daylight between sprites, exactly like the original
const PHYS_R = 1.2;
// PhysicsWorld.scl, "how much to soften movement by": each overlapping
// pair moves only 1/1.25 of the way apart per tick, split by mass
const PHYS_SCL = 1.25;
/**
 * How far a unit of each kind has to look to find something it might be
 * touching: its own physics radius plus the widest ON ITS OWN LAYER, since
 * ground and air pass straight through one another. That layer split is
 * what keeps the eclipse's 7.25-block hitbox — nearly twice the reign, the
 * widest thing that walks — off the ground swarm's bill entirely.
 */
const KIND_REACH = UNIT_KINDS.map(
  (k) =>
    (UNIT_STATS[k].radius + (UNIT_STATS[k].flying ? UNIT_RMAX_AIR : UNIT_RMAX_GROUND)) * PHYS_R,
);
/**
 * Spatial hash cell size (px); rebuilt every frame with a counting sort.
 *
 * Every query spans as many cells as its own reach needs (KIND_SPAN and
 * the dynamic spans in updateAliveBounds), so correctness does not ride
 * on this number at all — only cost does, and it pulls two ways. A big
 * cell makes broad queries (a turret's range circle) touch few buckets
 * but stuffs each one with far-away units; a small cell trims the
 * candidate set toward what is actually in reach but walks more buckets.
 *
 * This used to be the smallest KIND_REACH (~83px), which is still sized
 * by the widest unit on the ROSTER's layer: a dagger checking neighbours
 * within ~30px swept a 250px window for them, and in a thousand-dagger
 * crowd the physics pass was mostly distance tests that could never hit.
 * 32px (1.6 cells) puts the common span at 96px instead; the rare wide
 * units simply take a larger span, which is what the span machinery is
 * for. Must divide W and H evenly (5120 and 3840 both are 32 * k).
 */
const HC = 32;
/**
 * The same reach in cells: a pair further apart than `span * HC` in either
 * axis is more than `span` buckets away, so this is exactly the ring that
 * can hold anything a unit of this kind might be touching.
 *
 * This ROSTER-sized bound now serves only the spawn-spot test, which runs
 * a handful of times a tick; the physics pass takes the tighter per-tick
 * spans updateAliveBounds derives from what is actually on the field.
 */
const KIND_SPAN = KIND_REACH.map((r) => Math.ceil(r / HC));
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


const PUSH_LONG = 0.45;
const PUSH_SIDE = 1.1;
// ...but only where a unit has somewhere to step aside: this much
// clearance (FlowField.clear, in cells) or the shove stays as Mindustry
// wrote it, so a 1-wide slot still resolves a rear-ender by backing off
const SPREAD_CLEAR = 1.7;
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
const HCOLS = (W / HC) | 0;
const HROWS = (H / HC) | 0;
const HN = HCOLS * HROWS;

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
 * WHAT A RE-ROUTE COSTS A FRAME, in milliseconds. The solve itself is
 * sliced (FlowField.advance) and this is the size of the slice: the whole
 * of what building a turret takes out of a frame, whatever is queued
 * behind it. Three milliseconds leaves a 60fps frame the other thirteen.
 */
const FIELD_BUDGET_MS = 3;
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


/** how many buildings one ruler line may lay down (rulerCells) */
const RULER_MAX = 64;

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
/** every kind's collision radius, for the live per-layer bounds below */
const KIND_RADIUS = Float32Array.from(UNIT_KINDS, (k) => UNIT_STATS[k].radius);
/**
 * The physics size split: the roster's radii cluster into a numerous small
 * class (10..18.75px — daggers to spirocts, the actual swarm) and a sparse
 * heavy class (25px up — the zenith and the T4/T5 hulls).
 * Cut between the clusters. A HEAVY unit owns every pair it is part of in
 * the physics pass, so the swarm's scan window is sized by the widest
 * SMALL unit alive rather than by the reign three lanes over; the handful
 * of heavies scan the wide window themselves.
 */
const HEAVY_R = 20;
const KIND_HEAVY = Uint8Array.from(UNIT_KINDS, (k) => (UNIT_STATS[k].radius > HEAVY_R ? 1 : 0));
// the currency ladder (UNIT_STATS.tier, 1-5) — what a Volatile blast reads
const KIND_TIER = Uint8Array.from(UNIT_KINDS, (k) => UNIT_STATS[k].tier);
// support fields, indexed like UNIT_KINDS — null for kinds with no ability
const KIND_REPAIR = UNIT_KINDS.map((k) => UNIT_STATS[k].repairField ?? null);
const KIND_SHIELD = UNIT_KINDS.map((k) => UNIT_STATS[k].shieldField ?? null);
const KIND_ENERGY = UNIT_KINDS.map((k) => UNIT_STATS[k].energyField ?? null);
const KIND_FORCE = UNIT_KINDS.map((k) => UNIT_STATS[k].forceField ?? null);
const KIND_BOSS: readonly boolean[] = UNIT_KINDS.map((k) => !!UNIT_STATS[k].boss);
const BOSS_KINDS = KIND_BOSS.map((b, i) => (b ? i : -1)).filter((i) => i >= 0);
/** the pad list a brood spawn is handed — it picks its own spot, so there
 *  are no doors to draw from and nothing to allocate per body */
const EMPTY_PADS: readonly number[] = [];
/**
 * MITOSIS (mutation.ts): the tier-1 kinds a death may break into, grouped
 * by the movement layer they travel on — ground gets dagger, crawler and
 * nova, air gets flare, water gets risso and retusa.
 *
 * THE LAYER IS THE WHOLE FILTER and it is not a convenience. A brood is
 * dropped where its parent fell, so a kind that cannot stand there is a
 * kind that spawns inside rock or aground on a shoreline — the same test
 * spawnUnit runs at the doors, failed on every attempt. Picking from the
 * parent's own layer means the brood always has somewhere to walk.
 *
 * Bosses are out of the roster (never of the brood — a boss is an
 * authored event, not something a mace leaves behind), which today
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
 * UnitType.drag per kind — the fraction of an external shove a unit sheds
 * per tick. It bleeds the pull channel, which a spectre round's knockback
 * feeds (see impulse()).
 * Mindustry's own default is 0.3, which is what every kind that does not
 * state one carries.
 */
const KIND_DRAG = Float32Array.from(UNIT_KINDS, (k) => UNIT_STATS[k].drag ?? 0.3);
/** the gait of every legged kind, indexed like UNIT_KINDS — null for the
 * mechs and flyers, whose animation is one sliding pair of leg sprites */
const KIND_LEGS = UNIT_KINDS.map((k) => UNIT_STATS[k].legs ?? null);
/** the wake of every naval kind, indexed like UNIT_KINDS — null for
 *  everything that is not a hull */
const KIND_WAKE = UNIT_KINDS.map((k) => UNIT_STATS[k].wake ?? null);
/**
 * How many points of a hull's wake the sim actually keeps.
 *
 * Mindustry's Trail holds one point PER TICK — 20 for a risso, 70 for an
 * omura — and redraws the lot every frame. That is a fine deal for the
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
// the roster's ceiling — and the toxopid sits exactly on it. A ninth would
// not fail anywhere: the bit would truncate silently, that leg would never
// register a landing, and it would simply stop throwing dust. Widen
// ulegMove to a Uint16Array if a unit ever needs more.
if (MAX_LEGS > 8) throw new Error(`MAX_LEGS ${MAX_LEGS} > 8: widen Sim.ulegMove past Uint8Array`);
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
const legTmp2: Vec2 = { x: 0, y: 0 };

/** any support unit on the roster at all? skips the pass entirely when not */
const HAS_ABILITIES =
  KIND_REPAIR.some(Boolean) ||
  KIND_SHIELD.some(Boolean) ||
  KIND_ENERGY.some(Boolean) ||
  FORCE_KINDS.length > 0;

// how fast body and chassis swivel: Mindustry's default rotateSpeed /
// baseRotateSpeed, 5 degrees per tick
const ROT_SPD = ((5 * Math.PI) / 180) * 60;
/**
 * UnitType.rotateSpeed per kind, rad/s — how fast the TORSO comes round.
 * Much of the roster above the T1s overrides it (fortress, atrax and
 * spiroct at 3, the horizon at 4.5); kinds that state none take the
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
 * index into it (a tower's aimShieldTower, the player's focus, a pierce
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

  readonly upx = new Float32Array(MAX_UNITS);
  readonly upy = new Float32Array(MAX_UNITS);
  readonly uvx = new Float32Array(MAX_UNITS);
  readonly uvy = new Float32Array(MAX_UNITS);
  readonly uhp = new Float32Array(MAX_UNITS);
  readonly uhpmax = new Float32Array(MAX_UNITS);
  readonly uspd = new Float32Array(MAX_UNITS);
  readonly urad = new Float32Array(MAX_UNITS);
  readonly uarmor = new Float32Array(MAX_UNITS);
  // a flyer's own destination in world px, fixed when it spawns: the goal
  // cell nearest where it entered. Walkers read the flow field instead, and
  // the field already routes them to their nearest goal for free — this is
  // only here because flyers never touch it
  readonly ugx = new Float32Array(MAX_UNITS);
  readonly ugy = new Float32Array(MAX_UNITS);
  /** absorbing shield (Mindustry ShieldComp.shield): eaten before health */
  readonly ushield = new Float32Array(MAX_UNITS);
  /** shield draw opacity — 1 on apply or hit, fading over 15 ticks */
  readonly ushieldAlpha = new Float32Array(MAX_UNITS);
  /** seconds since this unit's support ability last pulsed */
  readonly uability = new Float32Array(MAX_UNITS);
  /**
   * ForceFieldAbility.radiusScale: the bubble does not snap to full size,
   * it inflates toward 1 while it holds charge and collapses to 0 the
   * instant it breaks. It scales the radius everywhere — the absorb test
   * reads the same number the renderer draws, so a half-grown field really
   * does only cover half its reach
   */
  readonly uforceScale = new Float32Array(MAX_UNITS);
  /**
   * ForceFieldAbility.wasBroken: 1 once the pool has been seen empty. It is
   * what makes a break fire exactly once — the pool sits negative for the
   * whole outage, and without this every tick of it would re-break
   */
  readonly uforceDown = new Uint8Array(MAX_UNITS);
  /**
   * Mindustry's impulse velocity, px/s: an outside shove that is NOT the
   * unit's own drive. A spectre round's knockback adds to it, the kind's
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
  readonly uspawn = new Float32Array(MAX_UNITS);
  /**
   * StatusEffects.burning: seconds of fire left. Reapplying resets it to
   * the full statusDuration rather than stacking, exactly like Mindustry's
   * status map, which keeps one entry per effect
   */
  readonly uburn = new Float32Array(MAX_UNITS);
  /**
   * StatusEffects.wet: seconds of soaking left, and the drive-speed
   * multiplier in force while it lasts. One entry like the status map's —
   * reapplying re-times rather than stacks, and the strongest slow wins
   * (see applyWet). `uwetSlow` is only meaningful while uwet > 0; expiry
   * and spawn both park it back at 1 so a recycled slot can never leak a
   * stale slow. The renderer reads uwet to tint soaked units blue
   */
  readonly uwet = new Float32Array(MAX_UNITS);
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
  readonly uhungry = new Uint8Array(MAX_UNITS);
  readonly ueaten = new Uint8Array(MAX_UNITS);
  private readonly uhungerT = new Float32Array(MAX_UNITS);
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
  readonly uwade = new Uint8Array(MAX_UNITS);
  private readonly uwet01 = new Uint8Array(MAX_UNITS);
  /**
   * MITOSIS (mutation.ts): 1 on a body this rule PUT on the field, 0 on
   * one that walked in through a door.
   *
   * IT IS THE TERMINATION GUARANTEE, and it is a property of the body
   * rather than arithmetic on the tier table. A brood that could brood
   * again is a chain with no upper bound — one dagger, one dagger, forever
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
   * THE WAVE EVERY BODY BELONGS TO, 1-based: the number loadStep staged
   * it under, and a brood member's is its parent's. It is what makes a
   * wave an OBJECTIVE (MISSION_XP in economy.ts): a wave is cleared when
   * every body carrying its number is off the field, and that is the
   * moment its share of the mission's XP is banked — see wavesCleared.
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
  readonly uid = new Int32Array(MAX_UNITS);
  readonly ukind = new Uint8Array(MAX_UNITS); // UNIT_ID of the kind
  /**
   * KIND_FLYING[ukind[i]], denormalised to one read: the broad-phase loops
   * test every candidate's layer, and chasing kind -> flag through two
   * arrays is measurably slower than reading one
   */
  readonly ufly = new Uint8Array(MAX_UNITS);
  /** 1 = this unit is a NAVAL TANK: it steers by navalField, so the deep
   *  water is open to it, and it drives at NAVAL_LAND_SPEED whenever it is
   *  not on a water floor. Kept beside ufly rather than folded into it
   *  because the two answer different questions: ufly decides what may
   *  SHOOT at a unit, and this decides which field it walks. */
  readonly unav = new Uint8Array(MAX_UNITS);
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
   * draws both LIVE off the unit rather than off the effect pool: a vela's
   * beam is a thing the unit is doing for two and a half seconds, and the
   * ring a corvus gathers before it fires follows the hull. `ubeamT` is
   * seconds of beam left, `ucharge` seconds of charge left (weapons.ts
   * `charge`); `uheldRot` the heading the beam or charge is aimed on,
   * fixed when it began. UNIT_HELD names the weapon
   */
  readonly ubeamT = new Float32Array(MAX_UNITS);
  readonly ucharge = new Float32Array(MAX_UNITS);
  readonly uheldRot = new Float32Array(MAX_UNITS);
  readonly utgt: (Aim | null)[] = new Array<Aim | null>(MAX_UNITS).fill(null);
  /**
   * WHICH STRUCTURE STANDS ON EACH CELL — every footprint cell of every
   * live tower, rock or ground, kept by claimGround. It is how a unit
   * finds something to shoot (nearestStructure) and how a shot in flight
   * knows it has arrived (updateEnemyShots): one read per cell, never a
   * walk of the tower list.
   */
  private readonly cellTower: (Structure | null)[] = new Array<Structure | null>(NCELLS).fill(null);
  /** the swarm's bullets, missiles and shells in flight (see EnemyShot) */
  readonly shots: EnemyShot[] = [];
  /** crawlers that went off on a structure: gone, and paid for by no one */
  exploded = 0;
  /** KIND_HEAVY[ukind[i]], same reasoning — the physics split reads it per
   * candidate */
  readonly uheavy = new Uint8Array(MAX_UNITS);
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
  readonly uwalk = new Float32Array(MAX_UNITS);
  readonly ubrot = new Float32Array(MAX_UNITS);
  readonly urot = new Float32Array(MAX_UNITS);
  // --- legged units (UnitStats.legs) ---
  // A leg is two segments between three points: the mount (derived from the
  // body every frame), the knee JOINT, and the FOOT, which is planted in
  // the world and only moves when the gait lifts it. Both live here, MAX_LEGS
  // slots per unit, so a leg keeps its footing across frames — and across
  // the swap-remove that recycles a dead unit's index
  readonly ulegFX = new Float32Array(MAX_UNITS * MAX_LEGS);
  readonly ulegFY = new Float32Array(MAX_UNITS * MAX_LEGS);
  readonly ulegJX = new Float32Array(MAX_UNITS * MAX_LEGS);
  readonly ulegJY = new Float32Array(MAX_UNITS * MAX_LEGS);
  /** how far through its swing each leg is, 0..1 — the renderer lifts a
   * stepping foot by it, and it eases back to 0 when the unit stands still */
  readonly ulegStage = new Float32Array(MAX_UNITS * MAX_LEGS);
  /** one bit per leg: is it mid-swing this frame? Eight bits is the whole
   * budget — see the MAX_LEGS guard above */
  readonly ulegMove = new Uint8Array(MAX_UNITS);
  /** Mindustry LegsComp.totalLength: px walked, the gait's clock */
  readonly ulegT = new Float32Array(MAX_UNITS);
  /** LegsComp.curMoveOffset: the smoothed lean the whole gait takes into
   * the direction of travel, so feet land ahead of a walking body */
  readonly ulegOX = new Float32Array(MAX_UNITS);
  readonly ulegOY = new Float32Array(MAX_UNITS);
  // --- naval hulls (UnitStats.wake) ---
  // The path the hull has taken, WAKE_PTS world points per unit, oldest
  // first: the wake is drawn along it. Like a leg's foot these are world
  // positions rather than offsets, so they travel with the unit through
  // swap-remove or the wake of whatever is recycled into a dead boat's
  // index snaps across the map.
  readonly uwakeX = new Float32Array(MAX_UNITS * WAKE_PTS);
  readonly uwakeY = new Float32Array(MAX_UNITS * WAKE_PTS);
  /** how many of the WAKE_PTS slots have been written — a hull that has
   *  just spawned trails a stub that grows to its full length */
  readonly uwakeN = new Uint8Array(MAX_UNITS);
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
   * It is its own counter and not a kill for two reasons. The HUD's kill
   * count is what the player's towers did, and crediting them with a meal
   * they had no part in is a lie on the one number that says how the run is
   * going. And `remaining()` is what ENDS the run: a devoured unit is gone,
   * so it has to come off the total or a wave that eats itself can never be
   * finished and the level never wins.
   *
   * killsByKind — the drop ledger — is deliberately untouched, which is the
   * whole "hungry enemies do not drop more materials" rule: what is eaten
   * pays nothing, and the eater still pays exactly its own kind's drop.
   */
  devoured = 0;
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
   * the moment `time` reaches it. 0 on a hold mission, which has no clock
   * — it is won when the script is spent (see won).
   */
  deadline = 0;
  /**
   * HOW MANY LEVELS THE TIDE HAS RISEN. A survive mission whose script
   * runs out before its clock sends its LAST wave again, and every repeat
   * adds SURVIVE_LOOP_LEVELS to the enemy level every body spawns at
   * (loadStep) — so the waves keep coming and keep getting heavier until
   * the clock, not the script, ends the run.
   */
  loopLevel = 0;
  /**
   * THE RUN'S MONEY (economy.ts). Opens at SCRAP_START, every kill drops
   * its tier's scrap, every wave staged pays its bonus, every turret
   * placed costs its price and every one sold refunds SELL_REFUND of it.
   * Charged only under a tech state — a sandbox or an editor (tech null)
   * builds for free and the counter just runs.
   */
  scrap = SCRAP_START;
  /** scrap the run has taken in, kills and wave bonuses alike — the tally
   *  the results screen reads */
  scrapEarned = 0;
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
   * (refreshSpecs, at every place a tower is added, sold or cleared).
   * Neither can change between those moments, and duo power's per-duo
   * damage would otherwise mean a head count of the whole board on every
   * bullet — five hundred scans a tick to recompute a number that did not
   * move.
   *
   * A kind with nothing bought is simply absent, and statsFor falls back to
   * the shared stock object — so an un-upgraded save pays nothing at all
   * for these branches existing.
   */
  private specs = new Map<TowerKind, TowerStats>();

  /** how deep the placement batch is (batchPlacement), and whether anything
   *  inside it asked for a spec refresh that is still owed */
  private specsHold = 0;
  private specsPending = false;
  /**
   * THE RUN'S UPGRADES (mods.ts), id to how many copies of it are owned —
   * both scopes in one ledger, because the deal draws them off one table
   * and the cap that stops a mod being offered twice is one rule.
   *
   * IT IS RUN STATE AND NOT SAVE STATE. Nothing here survives a reset:
   * upgrades are bought in scrap inside one mission and are gone with it,
   * which is what makes them a different thing from the tech tree's rungs
   * (upgrades.ts) that the save owns forever.
   *
   * The GLOBALS in it are folded into every kind's spec (refreshSpecs) and
   * read by name at the handful of sites whose effect is not a stat — a
   * kill's drop, a turret's death. The TURRET ones are never read here at
   * all past the placement: they are rolled once into Tower.mods and the
   * attribute lives on the structure from then on.
   */
  private mods: Partial<Record<ModId, number>> = {};
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
  readonly aliveByKind = new Int32Array(UNIT_KINDS.length);
  // the level script's cursor, plus the live state of the step it points at:
  // a wave counts down per kind, a wait counts down in seconds
  private stepIdx = 0;
  // how many waves the script holds, and how many have been STAGED by
  // loadStep — the HUD's "Wave 2 / 5". Staging runs one waveGap ahead of the
  // wave entering, so currentWave() backs this off by one while that gap is
  // still running: a wave stays current through the wait that follows it
  totalWaves = 0;
  private wavesStarted = 0;
  /** index of the script's last non-empty wave — what a survive mission repeats */
  private lastWaveIdx = -1;
  // the wave being drained, flattened to (region, kind) entries — every
  // entry runs out at the same moment (see nextWaveEntry), each spawning
  // only on its own region's pads (region 0 = any pad)
  private waveEntries: { kind: number; left: number; total: number }[] = [];
  /**
   * Enemies per second for the wave currently loaded — its OWN size over
   * WAVE_RELEASE_SECONDS, cached at load. Cached rather than recomputed from
   * `left` because a rate derived from what REMAINS would decay as the wave
   * drains, stretching its tail out for as long again.
   */
  private waveRate = 0;
  private waitLeft = 0;
  private spawnAcc = 0;

  /** seconds of simulated time since the level was reset (Time.time) */
  time = 0;

  /** every standing turret and wall, the SWARM's included — see Tower.team */
  towers: Tower[] = [];
  /** the box each side's buildings stand in, and whether the board has
   *  moved under it — see structBox() */
  private readonly structBoxCache = { x0: 0, y0: 0, x1: 0, y1: 0, n: 0 };
  private structBoxDirty = true;
  projs: Projectile[] = [];

  /**
   * THE RUN'S SHIELD TOWERS (the Shield Towers mutator, mutation.ts) —
   * empty unless the rule was rolled. Entries are appended as shieldTowers
   * emerge and NEVER removed or reordered (a dead shield tower keeps its slot at
   * hp 0), so an index into this array is stable for the whole run and
   * everything — tower aim, the player's focus, a pierce shot's
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
  private focusUid = -1;
  private focusIdx = -1;
  private focusShieldTower = -1;
  /**
   * ...and the third kind of mark: one of the SWARM's conquered turrets
   * (Conquest, mutation.ts), held by reference rather than by index — a
   * building has no uid, and its cells are what say whether it still
   * stands. Null in every run without the rule.
   */
  private focusTower: Tower | null = null;

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
  /**
   * THE CORPSES WAITING TO STAND UP (updateCorpses). A body killed under
   * Reconstruction leaves the field at once — it is off the physics, off
   * the crowd and off the drop zones while it waits — and this holds what
   * is needed to put the same body back: its kind, where it fell, which
   * wave answers for it, and the two clocks (`t` to the rise,
   * `grace` to giving up on a spot that never opens).
   */
  private corpses: { kind: number; x: number; y: number; wave: number; t: number; grace: number }[] = [];

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
  // and a fuse-heavy board at 8x speed pushes thousands a second, which is
  // steady GC pressure timed exactly to the busiest frames. The pool is
  // flat typed arrays with a live count and swap-remove, so a push is a
  // handful of stores and an expiry allocates nothing. The renderer reads
  // these directly (see its effects passes); everything an old Effect
  // object carried has a lane here, with fxHasCol standing in for the
  // optional colour and fxPts — the one field that is genuinely a list,
  // arc's bolt path — kept as a parallel ref array that swap-removes in
  // step and only ever holds an array while a bolt is alive.
  fxN = 0;
  readonly fxX = new Float32Array(FX_MAX);
  readonly fxY = new Float32Array(FX_MAX);
  readonly fxAge = new Float32Array(FX_MAX);
  readonly fxTtl = new Float32Array(FX_MAX);
  readonly fxKind = new Uint8Array(FX_MAX);
  readonly fxRot = new Float32Array(FX_MAX);
  readonly fxLen = new Float32Array(FX_MAX);
  readonly fxSeed = new Int32Array(FX_MAX);
  readonly fxSides = new Uint8Array(FX_MAX);
  /** UnitSpawn's kind id — meaningless (0) for every other kind */
  readonly fxUnit = new Uint8Array(FX_MAX);
  /** Effect.at's optional colour: the rgb lanes are only meaningful where
   * fxHasCol is set — a reused slot's stale colour must never leak */
  readonly fxHasCol = new Uint8Array(FX_MAX);
  readonly fxColR = new Float32Array(FX_MAX);
  readonly fxColG = new Float32Array(FX_MAX);
  readonly fxColB = new Float32Array(FX_MAX);
  readonly fxPts: (readonly number[] | null)[] = new Array<readonly number[] | null>(
    FX_MAX,
  ).fill(null);

  private readonly bStart = new Int32Array(HN + 1);
  private readonly bCount = new Int32Array(HN);
  private readonly bUnits = new Int32Array(MAX_UNITS);
  /**
   * The largest radius STANDING on each layer this tick, and the per-kind
   * physics spans derived from it (see updateAliveBounds). The static
   * KIND_SPAN / HIT_SPAN bounds are sized to the biggest unit on the whole
   * roster, so every dagger's broad phase paid scan area for a toxopid
   * that is almost never on the field; these shrink each bound to what is
   * actually alive, which changes no query's RESULT — only its cost.
   */
  private rmaxAliveGround = 0;
  private rmaxAliveAir = 0;
  /** physics span per kind against ANY live partner on its layer — what a
   * heavy scans, since a heavy owns every pair it is in */
  private readonly kindSpanDyn = new Int32Array(UNIT_KINDS.length);
  /** physics span per kind against SMALL live partners only — what the
   * swarm scans, its heavy pairs being the heavies' job (see HEAVY_R) */
  private readonly kindSpanSDyn = new Int32Array(UNIT_KINDS.length);
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
   * The air layer's doors: every cell an air zone covers, rock included.
   * Flyers keep their pads here rather than in `airField.spawnPts` because
   * a door is not a route — nothing about the terrain constrains where a
   * flyer may be DROPPED, and a pad on a peak is a perfectly good one. The
   * field below decides where it goes from there, not whether it may land.
   */
  private airPads: number[] = [];
  /**
   * ...and the part of that list that is OPEN SKY: a pad the air field has
   * a heading at. A drop zone is rasterized terrain-blind, so a circle
   * painted over the rim or across a massif has cells buried in rock, and a
   * flyer entering on one would fly the fallback straight line out of the
   * mountain before its route ever began. Entering on the open part of the
   * same circle puts it on its road at once — which is what the other two
   * layers already do (FlowField.spawnPts drops a pad that cannot reach a
   * goal). A zone with NO open cell keeps every cell it has: a door that
   * only opens inside a peak is still a door.
   */
  private airOpen: number[] = [];
  private bossAirOpen: number[] = [];
  /**
   * THE FLYERS' FIELD — the third of the three, over airWalkMask: hills
   * are its walls, and nothing else on the map is. A flyer used to hold
   * one straight line from its door to the core, which crossed whatever
   * the line happened to cross; it steers by this instead, so it comes
   * round a mountain the way the rest of the swarm does and only crosses
   * one where there is no way round.
   *
   * A HILL IS NOT AN OBSTACLE, only a detour: nothing collides a flyer
   * with terrain (see updateUnits — every wall test there is behind
   * `!fly`), so a crowd CAN shove one inside a peak. The field has no
   * heading in there, and airHeading falls back to the straight line at
   * the core, which flies it back out into open sky.
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
  /**
   * The boss door's cells, split by the layer that may use them: a boss
   * zone is terrain-blind like an air zone, but a WALKING boss still has to
   * land on ground it can stand on, so the filtering happens per layer here
   * rather than in the rasterizer.
   */
  private bossPads: Record<MoveLayer, number[]> = { ground: [], air: [], water: [] };

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
  /** the ground drop zones, as a mask — nothing may be built on one */
  private groundPads: Uint8Array = new Uint8Array(NCELLS);

  /** a Sim is always born on a level — building a default world and then
   * calling loadLevel solved the flow field twice and threw the first away */
  constructor(level: LevelSpec = WORLDS[0]) {
    this.level = level;
    this.reset();
  }

  reset(): void {
    this.n = 0;
    this.time = 0;
    this.kills = 0;
    this.devoured = 0;
    this.killsByKind.fill(0);
    this.scrap = SCRAP_START;
    this.scrapEarned = 0;
    // the run's upgrades are the RUN's (see `mods`): a new board owns none
    this.mods = {};
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
    this.enemyTowers = 0;
    this.corpses.length = 0;
    this.shieldTowers.length = 0;
    this.shieldTowerT = 0;
    this.domesUp = false;
    this.focusUid = -1;
    this.focusIdx = -1;
    this.focusShieldTower = -1;
    this.focusTower = null;
    // the mission sets the clock (levels.ts); the core's pool is CORE_HP on every map
    const mission = this.level.mission;
    this.deadline = mission.kind === "survive" ? mission.minutes * 60 : 0;
    this.loopLevel = 0;
    this.projs.length = 0;
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
    this.shots.length = 0;
    this.exploded = 0;
    this.refreshSpecs(); // an empty board is a duo with no company
    // the official map document IS the world: map-editor saves land in its
    // JSON, and the next full page load plays them. The documents are
    // fetched before the sim is built (see Game.create), never imported.
    // A level may name its map; the first official map is the default
    const doc = (this.level.map ? loadMap(this.level.map) : null) ?? OFFICIAL_MAPS[0];
    if (!doc) throw new Error("official maps not loaded — await loadOfficialMaps() first");
    this.terrain = terrainFromMap(doc);
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
      for (let x = b.x; x < b.x + b.size; x++) this.cellTower[y * COLS + x] = this.core;
    this.buildPads();
    // the walkers' field: rock and structures block it, it enters by the
    // ground zones, and it aims at the core (coreGoal)
    this.groundPads = this.padMaskFor("ground");
    // a new map is a new board: nothing is pending on it
    this.fieldDirty = false;
    this.navalDirty = false;
    this.unstickPending = false;
    this.fieldQuiet = 0;
    this.fieldStale = 0;
    this.field.rebuildWalk(this.footprints(), this.terrain.blocked, this.groundPads, this.coreGoal());
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
    this.bossAirOpen = this.openSky(this.bossPads.air);
    // fail LOUDLY on a broken map: with zero doors nothing ever spawns and
    // a wave script stalls forever, which reads as a scheduler bug
    if (this.airPads.length === 0 && this.field.spawnPts.length === 0)
      throw new Error('map "' + doc.id + '" has no drop zones — paint some in the editor');
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
    // ...and an AIR door with no open sky in it. Not broken — a flyer
    // entering inside a peak still gets out, it just flies the fallback
    // straight line to do it, which is the one case where the swarm's route
    // is not the route the overlay and the map imply. Worth saying: moving
    // the circle a few cells off the rim is all it takes.
    if (this.airPads.length > 0 && this.airOpen.length === 0 && this.scriptSends("air"))
      console.warn(
        'map "' + doc.id +
          '": every air drop zone is buried in rock — flyers will enter inside it and fly straight out' +
          " before they pick up a route. Move the circles onto open sky.",
      );
    for (const [layer, pads] of doors)
      if (pads === 0 && this.scriptSends(layer))
        console.warn(
          'map "' + doc.id + '" has no ' + layer +
            " drop zone that reaches an exit, but its script sends " + layer + " units",
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
    const until = nowMs() + FIELD_BUDGET_MS;
    while (this.solveQueue.length > 0) {
      const left = until - nowMs();
      if (!this.solveQueue[0].advance(Math.max(left, FIELD_MIN_SLICE))) return;
      this.solveQueue.shift();
      if (nowMs() >= until) return;
    }
  }

  /** drop the solves in flight: the board they were solving has moved on */
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
   * THE DOORS ONE LAYER MAY ENTER BY, as a mask a FlowField can take.
   *
   * A layer's own zones — and THE NAVAL LAYER ALSO TAKES THE GROUND'S: an
   * amphibious tank drives out of a ground door as readily as it swims out
   * of a water one, so a map with its sea in one corner and its doors on
   * the road still sends its tanks up the road.
   *
   * Every layer then falls back to every non-boss zone the map paints when
   * its own come to nothing. THAT IS WHAT MAKES EVERY FAMILY LANDABLE ON
   * EVERY MAP: a map with no water zone still lands naval tanks, one with
   * no air zone still lands flyers. The field filters the mask against its
   * own passability and its own reachability afterwards
   * (FlowField.spawnPts), so a fallback pad the layer cannot actually use
   * is dropped rather than stranding whatever enters on it. The boss door
   * stays out of the fallback — it is a door held back from the ordinary
   * swarm, and a fallback that swallowed it would hand it to everything.
   */
  private padMaskFor(layer: MoveLayer): Uint8Array {
    const src = this.terrain.spawn;
    const bits = layer === "water" ? LAYER_BIT.water | LAYER_BIT.ground : LAYER_BIT[layer];
    const out = new Uint8Array(NCELLS);
    let any = false;
    for (let i = 0; i < NCELLS; i++)
      if (src[i] & bits) {
        out[i] = 1;
        any = true;
      }
    if (!any) for (let i = 0; i < NCELLS; i++) if (src[i] & ALL_MOVE_BITS) out[i] = 1;
    return out;
  }

  /**
   * The pad lists the two field-less cases need: the flyers' doors, and the
   * boss's door split by layer.
   *
   * The air doors come through padMaskFor, so they take the same fallback
   * every layer does — a map with no air zone lands its flyers on whatever
   * doors it does paint rather than sending nothing at all.
   *
   * A boss zone is rasterized terrain-blind, so a walking boss's pads are
   * filtered here against the ground it would have to stand on, and a naval
   * one's against the ground plus the deep water: the same set its field is
   * solved over (navalWalkMask), which is what stops a naval boss being the
   * one body on the map that still needs a sea. Doing it per layer rather
   * than in the rasterizer is what lets ONE boss zone serve whatever kind
   * of boss a map fields.
   */
  private buildPads(): void {
    const spawn = this.terrain.spawn;
    const { blocked, wall } = this.terrain;
    const air = this.padMaskFor("air");
    this.airPads = [];
    this.bossPads = { ground: [], air: [], water: [] };
    for (let i = 0; i < NCELLS; i++) {
      if (air[i]) this.airPads.push(i);
      if (spawn[i] & LAYER_BIT.boss) {
        this.bossPads.air.push(i);
        if (!blocked[i]) this.bossPads.ground.push(i);
        if (!blocked[i] || wall[i] === WALL_DEEP) this.bossPads.water.push(i);
      }
    }
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
   * THE LINES FLYERS ACTUALLY FLY, one polyline per drop zone — what the
   * route overlay draws. It is the air field walked from the zone's centre,
   * the same way a flyer walks it, so the curve on screen bends round the
   * same mountains the swarm will.
   *
   * It was one straight segment while a flyer flew one straight line, and
   * the whole point of drawing it was that the line was the truth. The
   * flyers route now (airField), so the truth is a route.
   *
   * Traced from each zone's CENTRE. A flyer entering at the rim starts on a
   * neighbouring streamline and arrives by a slightly different road, so
   * this is the middle of a fan rather than a rail.
   */
  airRoutes(): { pts: number[]; zone: ZoneKind }[] {
    // ONLY WHAT ACTUALLY FLIES GETS A LINE. Walkers and hulls read fields
    // the terrain itself already shows the shape of, and a drawn route per
    // zone would be three quarters redundant overlay.
    //
    // A boss zone earns a line only if this level's boss flies. Nothing
    // about the zone says which — a boss zone is rasterized terrain-blind
    // precisely so one door can serve whatever kind of boss a map fields —
    // so the script is what settles it.
    const flying = (z: ZoneKind) => z === "air" || (z === "boss" && this.bossFlies());
    return this.terrain.spawns
      .filter((z) => flying(z.zone))
      .map((z) => {
        const from = this.airDoor(z);
        return { pts: this.airTrace(from.x, from.y), zone: z.zone };
      });
  }

  /**
   * Where a zone's flyers actually come out, in world px: its centre when
   * that is open sky, and otherwise the open cell of the circle nearest to
   * it. A door painted across a massif or over the map's rock rim has its
   * middle buried, and spawnPads hands those flyers the open part of the
   * circle (airOpen) — so tracing the overlay from the buried centre would
   * draw a road out of a mountain nothing takes.
   */
  private airDoor(z: SpawnCircle): { x: number; y: number } {
    const cx = z.x * CELL, cy = z.y * CELL;
    const gi = clamp(z.y | 0, 0, ROWS - 1) * COLS + clamp(z.x | 0, 0, COLS - 1);
    if (!this.airField.walk[gi]) return { x: cx, y: cy };
    const pads = z.zone === "boss" ? this.bossAirOpen : this.airOpen;
    const r2 = (z.r + 1) * (z.r + 1);
    let bx = cx, by = cy, best = Infinity;
    for (const i of pads) {
      const x = (i % COLS) + 0.5, y = ((i / COLS) | 0) + 0.5;
      const d = (x - z.x) * (x - z.x) + (y - z.y) * (y - z.y);
      if (d > r2 || d >= best) continue;
      best = d;
      bx = x * CELL;
      by = y * CELL;
    }
    return { x: bx, y: by };
  }

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

  /** does this level's script send a boss that flies? */
  private bossFlies(): boolean {
    for (const step of this.level.script) {
      if (!("wave" in step)) continue;
      for (const g of waveGroups(step.wave))
        for (let k = 0; k < g.counts.length; k++) {
          if (g.counts[k] <= 0) continue;
          const s = UNIT_STATS[UNIT_KINDS[k]];
          if (s.boss && s.flying) return true;
        }
    }
    return false;
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
    return this.core.hp <= 0;
  }

  /**
   * IS THE MISSION MET? A hold is won when every body the script sends is
   * down (and it sent some); a survive when the clock has run out.
   * Never while the base is dead — a clock that ran out on a lost base is
   * a loss.
   */
  won(): boolean {
    if (this.lost()) return false;
    if (this.deadline > 0) return this.time >= this.deadline;
    return this.totalEnemies > 0 && this.remaining() <= 0;
  }













  /** campaign restrictions on building; null lifts them (editor, dev) —
   *  and null is also what makes building FREE (see canPlace) */
  setTech(tech: TechState | null): void {
    this.tech = tech;
    this.refreshSpecs();
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
   * rather than dressing on one — fuse's shrapnel ray, lancer's beam and
   * its charge glow, arc's bolt, the rail's trail — and those weapons deal
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
   * The head count is what a count-dependent rung reads (duo power: "each
   * OTHER duo on the board", hence the whole board's census here). Every
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
    const up = this.tech?.upgrades;
    const counts = up ? this.towerCounts() : null;
    for (const kind of TOWER_KINDS) {
      // the tech tree's rungs first (the save's), then the run's relics on
      // top of them — two different purchases composing onto one table
      const base = up && counts
        ? upgradedTower(kind, up[kind] ?? NO_UPGRADES, { count: counts[kind] })
        : TOWERS[kind];
      const spec = applyGlobalMods(base, kind, this.mods);
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
  }

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
    const max = t.spec.health * TOWER_HP_SCALE;
    if (max !== t.hpMax) {
      const f = t.hpMax > 0 ? t.hp / t.hpMax : 1;
      t.hpMax = max;
      t.hp = Math.min(max, Math.max(1, f * max));
    }
    t.regen = modRegen(t.mods, this.mods) * max;
  }

  // ---------- the run's upgrades (mods.ts) ----------

  /** how many copies of one upgrade the run owns */
  modStacks(id: ModId): number {
    return this.mods[id] ?? 0;
  }

  /** every upgrade the run owns, catalog order, with its stack count — the
   *  shelf on the top-left of the field reads exactly this */
  ownedMods(): { id: ModId; n: number }[] {
    const out: { id: ModId; n: number }[] = [];
    for (const m of MODS) {
      const n = this.mods[m.id] ?? 0;
      if (n > 0) out.push({ id: m.id, n });
    }
    return out;
  }

  /** the whole ledger, for the roll that must not offer a maxed mod */
  get modLedger(): Readonly<Partial<Record<ModId, number>>> {
    return this.mods;
  }

  /**
   * TAKE AN UPGRADE, and it lands NOW. A global is folded into every
   * kind's stats on the spot and reaches the turrets already standing; a
   * turret attribute only joins the pool the next placement rolls
   * against, and deliberately changes nothing on the board (see mods.ts).
   *
   * Undying Legion is the one global that has to reach back: it grants a
   * revive to EVERY turret, and a player who buys it mid-wave is buying
   * it for the line that is being chewed on right now.
   */
  takeMod(id: ModId): void {
    this.mods[id] = (this.mods[id] ?? 0) + 1;
    if (id === "undying")
      for (const t of this.towers) {
        if (t.team !== "player") continue; // the swarm's copies are not the run's to bless
        t.revives = Math.max(t.revives, 1);
        t.revivesMax = Math.max(t.revivesMax, 1);
      }
    this.refreshSpecs();
  }

  /**
   * The stats a turret of this kind fires with — the stock table unless
   * the tree has an upgrade branch's worth of points in it (see `specs`).
   * Every reader of a turret's live stats goes through here, so no caller
   * has to know which kinds have been upgraded.
   *
   * PUBLIC, because the renderer and the field's own overlays need it too.
   * They used to read TOWERS directly, which meant a meltdown whose beam
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
  bulletFor(kind: TowerKind, frag: boolean): BulletStats {
    const b = this.statsFor(kind).bullet;
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

  /** enemies left to kill: still unspawned + still walking the field */
  remaining(): number {
    return this.totalEnemies - this.kills - this.devoured - this.exploded;
  }

  /** per-kind head count currently on the field, indexed like UNIT_KINDS */
  aliveByKindList(): number[] {
    return Array.from(this.aliveByKind);
  }

  /**
   * Every boss on the field, one row per unit, for the HUD's bar stack.
   * The census early-exits the scan the way collectForceFields does, so a
   * bossless wave pays nothing. Rows are keyed and ordered by spawn id —
   * unit indices reshuffle under swap-remove, and a bar that traded places
   * with its neighbour whenever something died would read as a glitch.
   */
  bossBars(): { id: number; kind: number; hp: number; max: number }[] {
    let left = 0;
    for (const k of BOSS_KINDS) left += this.aliveByKind[k];
    if (left === 0) return [];
    const out: { id: number; kind: number; hp: number; max: number }[] = [];
    for (let i = 0; i < this.n && out.length < left; i++) {
      const k = this.ukind[i];
      if (!KIND_BOSS[k]) continue;
      out.push({
        id: this.uid[i],
        kind: k,
        hp: Math.max(0, this.uhp[i]),
        max: this.uhpmax[i],
      });
    }
    out.sort((a, b) => a.id - b.id);
    return out;
  }

  /**
   * 1-based number of the wave ON THE FIELD — the one the player is fighting.
   *
   * `wavesStarted` counts a wave from the moment loadStep STAGES it, which is
   * one waveGap before its first unit enters, so reporting it raw credits the
   * next wave the instant the current one finishes spawning and leaves the HUD
   * naming a wave that has not arrived. A staged wave still inside its gap
   * therefore does not count yet.
   *
   * The floor keeps a level that opens with a wait reading "Wave 1" while it
   * counts down to that first wave.
   */
  currentWave(): number {
    // ...except in the OPENING gap, where there is no earlier wave to still
    // be current: the run has not played one, and backing off there reported
    // "wave 0", floored to 1
    const opening = this.wavesStarted <= 1;
    const back = this.waitLeft > 0 && !opening ? 1 : 0;
    return Math.max(1, this.wavesStarted - back);
  }

  /**
   * THE WAVE THE CLOCK SAYS IT IS. The first wave enters at once, and
   * every one after it waveGap + WAVE_RELEASE_SECONDS later; on a map
   * whose drop zones cannot pass a big wave that fast the script falls
   * behind its own schedule (Sim.runScript queues what will not fit). The
   * larger of the two is taken, so a run that is AHEAD of schedule reads
   * ahead.
   */
  stageWave(): number {
    const cadence = Math.max(1, this.level.waveGap + WAVE_RELEASE_SECONDS);
    const byClock = Math.floor(this.time / cadence) + 1;
    return Math.max(this.currentWave(), byClock);
  }

  /** seconds until the next wave starts entering, or 0 when one is already
   * draining (or the script has run out) */
  nextWaveIn(): number {
    return this.waitLeft > 0 ? this.waitLeft : 0;
  }

  /**
   * HOW MANY WAVES ARE CLEARED — the objectives met, and what the run's
   * XP is paid for (missionXp in economy.ts). A wave is cleared when it
   * has finished entering and every body it put on the field, brood
   * included, is down: killed, devoured or blown up. Counted over every
   * wave staged rather than as a prefix, because waves overlap on a long
   * field — a wave 8 whose last fortress is still walking must not hold
   * wave 9's payout back once wave 9 is dead to the last dagger.
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
  private addTower(gx: number, gy: number, kind: TowerKind, sz: number, mods: number): void {
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
      // Undying Legion (mods.ts) grants every turret one stand-up, the
      // ones bought after it included
      revives: this.mods.undying ? 1 : 0,
      // ...and what Conquest hands the swarm's copy back (Tower.revivesMax)
      revivesMax: this.mods.undying ? 1 : 0,
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
    };
    this.towers.push(tower);
    // the attributes it just rolled become its stats and its pool, and it
    // opens at FULL health on the new ceiling rather than the table's
    this.resolveTower(tower);
    tower.hp = tower.hpMax;
    this.claimGround(tower, true);
    // a count-dependent rung (duo power) reads the board, so the board
    // changing is what moves it
    this.refreshSpecs();
  }



  /** the structure standing on a world point, if it is `team`'s */
  private structureAt(px: number, py: number, team: Team = "player"): Structure | null {
    if (px < 0 || py < 0 || px >= W || py >= H) return null;
    const t = this.cellTower[((py / CELL) | 0) * COLS + ((px / CELL) | 0)];
    // the team test costs nothing in a run without Conquest, where every
    // building on the board is the player's and `enemyTowers` is 0
    return t && (this.enemyTowers === 0 ? team === "player" : teamOf(t) === team) ? t : null;
  }


  update(dt: number): void {
    // Mindustry Time.time: seconds of SIMULATED time, so animations driven
    // by it (the shield hatch) speed up with the game speed and hold still
    // while the sim is paused
    this.time += dt;
    this.runScript(dt);
    // a structure went up on, or came down off, open ground: shove anything
    // standing in its cells clear now, and re-solve the routes when the
    // board settles (solveDirtyFields)
    if (this.unstickPending) {
      this.unstickPending = false;
      this.unstickUnits();
    }
    this.solveDirtyFields(dt);

    this.updateAliveBounds();
    this.buildHash();
    this.updatePhysics();
    this.updateUnits(dt);
    this.updateAbilities(dt);
    this.updateStatus(dt);
    // the hungry eat AFTER the status pass and before the towers fire, so a
    // unit that burned to death this tick is already gone rather than being
    // swallowed as a corpse — and so a meal's health is on the eater before
    // anything shoots at it
    this.feedHungry(dt);
    // the waders gain AFTER the status pass for the same reason: a body
    // that burned to death this tick is already gone, and a stack taken
    // this tick is on the unit before anything shoots at it
    this.updateAmphibious(dt);
    // ShieldComp: shieldAlpha fades out over 15 ticks once nothing refreshes it
    for (let i = 0; i < this.n; i++)
      if (this.ushieldAlpha[i] > 0) this.ushieldAlpha[i] = Math.max(0, this.ushieldAlpha[i] - dt * (60 / 15));
    // shieldTowers run before the towers so a dome that regenerated this tick
    // absorbs the volley fired this tick, never one late
    this.updateShieldTowers(dt);
    this.fireTowers(dt);
    this.updateProjectiles(dt);
    this.updateUnitWeapons(dt);
    this.updateEnemyShots(dt);
    // RECONSTRUCTION (mutation.ts): the corpses standing back up, at the
    // very end of the tick — a body raised here starts walking on the NEXT
    // one, with a fresh hash and a fresh set of alive bounds under it,
    // rather than appearing halfway through passes that have already
    // decided what is on the field
    this.updateCorpses(dt);

    const { fxAge, fxTtl } = this;
    for (let e = this.fxN - 1; e >= 0; e--) {
      fxAge[e] += dt;
      if (fxAge[e] >= fxTtl[e]) this.removeFx(e);
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
    for (let i = 0; i < script.length; i++) {
      const step = script[i];
      if (!("wave" in step)) continue;
      let n = 0;
      for (const g of waveGroups(step.wave)) for (const c of g.counts) n += c;
      if (n === 0) continue;
      this.totalWaves++;
      this.totalEnemies += n;
      this.lastWaveIdx = i;
    }
    this.stepIdx = 0;
    this.waitLeft = 0;
    this.spawnAcc = 0;
    this.wavesStarted = 0;
    this.waveSpawned.length = 0;
    this.waveDown.length = 0;
    this.waveEntered.length = 0;
    this.loadStep();
  }

  /**
   * Point the live state at script[stepIdx], skipping empty waves. Leaves
   * everything zeroed once the script runs out, which is what ends the level.
   *
   * Pacing is no longer written into the script: the level carries one
   * `waveGap` and the sim puts it BEFORE every wave, the opening one
   * included: the first wave is the breather a run builds its first line
   * in. A step therefore always describes enemies and never time.
   *
   * The opening gap is the one exception — WAVE_GAP_OPENING, a few seconds
   * rather than the full gap, so a run does not open on an empty map.
   */
  private loadStep(): void {
    this.waveEntries.length = 0;
    this.waveRate = 0;
    this.waitLeft = 0;
    const script = this.level.script;
    for (; this.stepIdx < script.length; this.stepIdx++) {
      const step = script[this.stepIdx];
      for (const g of waveGroups(step.wave))
        for (let kind = 0; kind < g.counts.length; kind++)
          if (g.counts[kind] > 0)
            this.waveEntries.push({ kind, left: g.counts[kind], total: g.counts[kind] });
      if (this.waveEntries.length > 0) {
        let total = 0;
        for (const e of this.waveEntries) total += e.total;
        this.waveRate = waveSpawnRate(total);
        this.wavesStarted++;
        // ...and staging it pays NOTHING. It used to pay a bonus here, at
        // the top of the gap; every scrap comes off the swarm now
        // (economy.ts). Hold the gap, then let this wave drain — waitLeft
        // gates runScript
        this.waitLeft =
          this.wavesStarted === 1
            ? Math.min(WAVE_GAP_OPENING, Math.max(0, this.level.waveGap))
            : Math.max(0, this.level.waveGap);
        return;
      }
    }
    // THE SCRIPT IS SPENT. On a hold that is the end of the level; on a
    // survive with time still on the clock it is the tide turning: the
    // last few waves go again as a cycle, a few enemy levels heavier, and
    // count toward the run like any other wave. Recursion is one level
    // deep by construction — lastWaveIdx names a wave that is not empty,
    // and the cursor is put at or before it
    if (this.deadline > 0 && this.time < this.deadline && this.lastWaveIdx >= 0) {
      const from = Math.max(0, this.lastWaveIdx - (SURVIVE_CYCLE_WAVES - 1));
      for (let i = from; i <= this.lastWaveIdx; i++) {
        const step = script[i];
        if (!("wave" in step)) continue;
        let n = 0;
        for (const g of waveGroups(step.wave)) for (const c of g.counts) n += c;
        if (n === 0) continue;
        this.totalEnemies += n;
        this.totalWaves++;
      }
      this.loopLevel += SURVIVE_LOOP_LEVELS;
      this.stepIdx = from;
      this.loadStep();
    }
  }

  /** move to the next step, resetting the drain credit so waves start clean */
  private nextStep(): void {
    // the wave just drained is through the door: from here it is cleared
    // the moment its last body drops (wavesCleared)
    this.waveEntered[this.wavesStarted] = true;
    this.stepIdx++;
    this.spawnAcc = 0;
    this.loadStep();
  }

  /**
   * Which entry to send next out of the current wave: whichever is furthest
   * from finishing, by fraction of its own total. That intermingles a mixed
   * wave from its first unit and lands every entry's last unit together,
   * instead of emptying one pile before starting the next. Entries in
   * `skip` (their layer's doors were too crowded this frame) don't compete.
   */
  private nextWaveEntry(
    skip: ReadonlySet<unknown>,
  ): { kind: number; left: number; total: number } | null {
    let best = null;
    let bestFrac = 0;
    for (const e of this.waveEntries) {
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
   * Run the level script: hold through the level's wave gap, otherwise drain
   * the current wave at ITS OWN rate — the wave's size over the fixed
   * WAVE_RELEASE_SECONDS, so every wave takes the same time to walk on.
   *
   * A failed spawn (the drop zone is too crowded) leaves the unit in the wave
   * and keeps its drain credit for a later frame, so a packed field delays a
   * wave rather than swallowing it. That is what makes the rate safe to scale
   * with size: a wave big enough to outrun the pads simply queues behind
   * them, and the field fills as fast as there is room for it.
   */
  private runScript(dt: number): void {
    if (this.waitLeft > 0) {
      this.waitLeft -= dt;
      // the gap belongs to the wave already loaded, so running it out just
      // releases that wave — there is no next step to advance to
      if (this.waitLeft > 0) return;
      this.waitLeft = 0;
    }

    let left = 0;
    for (const e of this.waveEntries) left += e.left;
    if (left === 0) return;

    const rate = this.waveRate;
    // the credit is capped at a second's worth of release — but never
    // under ONE body: a wave smaller than WAVE_RELEASE_SECONDS bodies has
    // a rate under 1/s, and a cap at that rate would never let the credit
    // reach the whole unit the loop below spends (a squad of three at
    // Incursion sat in the door forever)
    this.spawnAcc = Math.min(this.spawnAcc + rate * dt, Math.max(1, rate));
    // one region's crowded pads must not stall the other regions' share of
    // the wave — a failed entry sits out the rest of this frame while the
    // remaining entries keep draining
    const blocked = new Set<unknown>();
    while (left > 0 && this.spawnAcc >= 1) {
      const e = this.nextWaveEntry(blocked);
      if (!e) break;
      if (!this.spawnUnit(UNIT_KINDS[e.kind])) {
        blocked.add(e);
        continue;
      }
      e.left--;
      this.spawnAcc--;
      left--;
    }
    if (left === 0) this.nextStep();
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
   * break on, so a gun with nothing in reach walks every cell of its
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
      const add = (s: Structure): void => {
        const half = (this.sizeOf(s) * CELL) / 2;
        if (s.x - half < b.x0) b.x0 = s.x - half;
        if (s.y - half < b.y0) b.y0 = s.y - half;
        if (s.x + half > b.x1) b.x1 = s.x + half;
        if (s.y + half > b.y1) b.y1 = s.y + half;
        b.n++;
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
    const box = this.structBox();
    if (box.n === 0) return null;
    if (x + reach < box.x0 || x - reach > box.x1 || y + reach < box.y0 || y - reach > box.y1)
      return null;
    const cx = clamp((x / CELL) | 0, 0, COLS - 1);
    const cy = clamp((y / CELL) | 0, 0, ROWS - 1);
    const R = Math.min(COLS, Math.ceil(reach / CELL) + 2);
    const grid = this.cellTower;
    let best: Structure | null = null;
    let bd = Infinity;
    const consider = (i: number): void => {
      const t = grid[i];
      // only the OTHER side's buildings are targets: a body walks past the
      // swarm's own conquered turret, and that turret never fires on it
      if (!t || (this.enemyTowers > 0 && teamOf(t) !== team)) return;
      const half = (this.sizeOf(t) * CELL) / 2;
      const dx = t.x - x, dy = t.y - y;
      const d = Math.sqrt(dx * dx + dy * dy) - half;
      // the cheap tests first: the raycast is only spent on a candidate
      // that would actually be taken
      if (d <= reach && d < bd && (!sighted || this.canSee(t, x, y))) {
        bd = d;
        best = t;
      }
    };
    consider(cy * COLS + cx);
    for (let r = 1; r <= R; r++) {
      const x0 = cx - r, x1 = cx + r, y0 = cy - r, y1 = cy + r;
      for (let xx = x0; xx <= x1; xx++) {
        if (xx < 0 || xx >= COLS) continue;
        if (y0 >= 0) consider(y0 * COLS + xx);
        if (y1 < ROWS) consider(y1 * COLS + xx);
      }
      for (let yy = y0 + 1; yy <= y1 - 1; yy++) {
        if (yy < 0 || yy >= ROWS) continue;
        if (x0 >= 0) consider(yy * COLS + x0);
        if (x1 < COLS) consider(yy * COLS + x1);
      }
      // a ring further out cannot hold a structure nearer than one already
      // found a full ring closer; one extra ring covers the footprint slack
      if (best && r * CELL > bd + CELL * 2) break;
    }
    return best;
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
    const R = Math.ceil(r / CELL) + 1;
    const cx = (x / CELL) | 0, cy = (y / CELL) | 0;
    for (let yy = Math.max(0, cy - R); yy <= Math.min(ROWS - 1, cy + R); yy++)
      for (let xx = Math.max(0, cx - R); xx <= Math.min(COLS - 1, cx + R); xx++) {
        const t = this.cellTower[yy * COLS + xx];
        if (!t || out.includes(t)) continue;
        if (this.enemyTowers > 0 && teamOf(t) !== team) continue;
        const half = (this.sizeOf(t) * CELL) / 2;
        const dx = t.x - x, dy = t.y - y;
        if (Math.sqrt(dx * dx + dy * dy) - half <= r) out.push(t);
      }
    return out;
  }

  private readonly splashOut: Structure[] = [];

  /** a unit's hit on a structure, through the one dial (unitDamageScale) */
  private hitStructure(t: Structure, dmg: number): void {
    if (dmg <= 0) return;
    this.damageTower(t, dmg * unitDamageScale());
  }

  /** a burst at a point: splash to every structure it reaches */
  private splashStructures(x: number, y: number, splash: number, radius: number): void {
    if (splash <= 0 || radius <= 0) return;
    for (const t of this.structuresWithin(x, y, radius, this.splashOut)) this.hitStructure(t, splash);
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
   * its bodies' weapons do, so a conquered spectre hits as hard as the
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
    if (this.cellTower[t.gy * COLS + t.gx] !== t) return false;
    const half = (this.sizeOf(t) * CELL) / 2;
    const dx = t.x - x, dy = t.y - y;
    return Math.sqrt(dx * dx + dy * dy) - half <= reach;
  }

  /**
   * WHAT A BODY AIMS AT: the nearer of the other side's nearest structure
   * and its nearest body within reach — a target either way (Aim). A
   * ground body only takes what it can see; a flyer sees its radius.
   */
  private pickAim(x: number, y: number, reach: number, sighted: boolean): Aim | null {
    const s = this.nearestStructure(x, y, reach, sighted);
    if (!s) return null;
    return { x: s.x, y: s.y, half: (this.sizeOf(s) * CELL) / 2, s };
  }


  /** is the aim still standing, and within this reach of the point? */
  private aimReach(a: Aim, x: number, y: number, reach: number): boolean {
    return this.inReach(a.s, x, y, reach);
  }

  /** can a ground body at the point see its aim? */
  private aimSeen(a: Aim, x: number, y: number): boolean {
    return this.canSee(a.s, x, y);
  }

  /** one hit on the aim, from a body of `team` */
  private aimHit(a: Aim, dmg: number): void {
    this.hitStructure(a.s, dmg);
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
   * A crawler's weapon is itself: it goes off on the structure and is gone.
   */
  private updateUnitWeapons(dt: number): void {
    const { upx, upy, urot, ukind, uspawn, ucd, utT, ubeamT, ucharge, uheldRot, utgt } = this;
    for (let i = this.n - 1; i >= 0; i--) {
      if (uspawn[i] > 0) continue; // still arriving, untouchable and unarmed
      const kind = UNIT_KINDS[ukind[i]];
      const ws = UNIT_WEAPONS[kind];
      if (ws.length === 0) continue;
      const x = upx[i], y = upy[i];
      // A GROUND OR NAVAL BODY SHOOTS WHAT IT CAN SEE. Reach is not sight:
      // a hill between the two is a hill, and the swarm has to come round
      // it before it can open up on what is behind. A FLYER is looking down
      // and sees its whole radius (canSee) — that, and not the ability to
      // cross a mountain, is what the air layer is worth.
      const sighted = this.ufly[i] === 0;
      // the target, re-picked every few tenths of a second, dropped the
      // moment it dies, walks out of the longest gun's reach, or goes
      // behind rock — the sight test rides here, once per body per tick,
      // rather than in inReach, which every weapon calls every tick
      utT[i] -= dt;
      let tgt = utgt[i];
      const had = tgt !== null;
      if (tgt && (!this.aimReach(tgt, x, y, UNIT_REACH[kind]) || (sighted && !this.aimSeen(tgt, x, y))))
        tgt = null;
      // ...on the clock, or the moment the one it had is gone. A body that
      // has NOTHING waits for the clock like everyone else rather than
      // re-scanning every tick: an empty search is the most expensive one
      // there is (it walks every ring out to reach, and now casts a ray at
      // each candidate), and it is exactly the search a swarm still crossing
      // open ground is running. `had` is what tells the two apart
      if (utT[i] <= 0 || (had && !tgt)) {
        utT[i] = 0.3 + Math.random() * 0.2;
        tgt = this.pickAim(x, y, UNIT_REACH[kind], sighted);
        utgt[i] = tgt;
      }
      let exploded = false;
      for (let w = 0; w < ws.length && !exploded; w++) {
        const wp = ws[w];
        const slot = i * MAX_WEAPONS + w;
        if (wp.beam) {
          // a held beam: while it burns it bites every interval, and the
          // reload only starts once it has gone out. Fx.hitMeltHeal (its
          // hitEffect) flicks off whatever it is resting on at each bite
          if (ubeamT[i] > 0) {
            ubeamT[i] -= dt;
            ucd[slot] -= dt;
            // the mount is fixed to the hull (rotate = false), and the hull
            // turns onto its target at the type's rotateSpeed — the vela's
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
              if (tgt && this.aimReach(tgt, x, y, wp.range)) {
                this.aimHit(tgt, wp.damage);
                this.pushFxCol(tgt.x, tgt.y, 12 / 60, FxKind.HitMeltHeal, 0, 0, PAL.heal);
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
          if (ucd[slot] <= 0 && tgt && this.aimReach(tgt, x, y, wp.range)) {
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
          // a charged shot (corvus): the glow gathers for firstShotDelay
          // on the heading it was aimed on, then the beam goes down it
          if (ucharge[i] > 0) {
            ucharge[i] -= dt;
            if (ucharge[i] <= 0) {
              this.fireUnitLaser(x, y, uheldRot[i], tgt, wp);
              ucd[slot] = wp.reload - wp.charge;
            }
            continue;
          }
          ucd[slot] -= dt;
          if (ucd[slot] <= 0 && tgt && this.aimReach(tgt, x, y, wp.range)) {
            uheldRot[i] = Math.atan2(tgt.y - y, tgt.x - x);
            ucharge[i] = wp.charge;
          }
          continue;
        }
        ucd[slot] -= dt;
        if (ucd[slot] > 0) continue;
        if (!tgt || !this.aimReach(tgt, x, y, wp.range)) {
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
            for (let k = 0; k < shots; k++) this.fireUnitShot(x, y, tgt, wp, k);
            break;
          }
          case "gun": {
            // A ROUND WITH NO BODY: the hit lands the moment the trigger is
            // pulled and the only thing drawn is the gun's own splash at
            // the muzzle — no projectile crosses the field (weapons.ts:
            // the dagger's and the boats' copper rounds, the retusa's
            // torpedo). Splash, where a row carries it, bursts on the
            // target the way the round would have
            for (let k = 0; k < shots; k++) {
              this.aimHit(tgt, wp.damage);
              if (wp.splash) this.splashStructures(tgt.x, tgt.y, wp.splash, wp.splashRadius ?? 0);
              this.fireUnitGun(x, y, aim + (k - (shots - 1) / 2) * 0.06, wp);
            }
            break;
          }
          case "laser": {
            this.fireUnitLaser(x, y, aim, tgt, wp);
            break;
          }
          case "sap": {
            // SapBulletType: the line lands on the target and retracts onto
            // the mount as it fades (the draw lerps its far end back over fin)
            for (let k = 0; k < shots; k++) this.aimHit(tgt, wp.damage);
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
              this.aimHit(tgt, wp.damage);
              const a = aim + (k - (shots - 1) / 2) * (wp.spread ?? 0);
              if (st) this.pushFx(x, y, 10 / 60, FxKind.Shrapnel, a, wp.range, 0, st.id, true);
            }
            this.pushFxCol(x, y, FX_LIFE[FxKind.SparkShoot], FxKind.SparkShoot, aim, 0, PAL.white);
            break;
          }
          case "lightning": {
            // LightningBulletType: each shot is a Lightning.create walk out
            // of the muzzle, in the bullet's colour, `inaccuracy` off the aim
            const bt = wp.bolt;
            for (let k = 0; k < shots; k++) {
              this.aimHit(tgt, wp.damage);
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
            for (let k = 0; k < shots; k++) this.aimHit(tgt, wp.damage);
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
              // the crawler IS the bullet: Fx.pulverize where it went off,
              // and the body's own death blast, centred on itself
              this.aimHit(tgt, wp.damage);
              this.splashStructures(x, y, wp.splash ?? 0, wp.splashRadius ?? 0);
              this.pushFx(x, y, 40 / 60, FxKind.Pulverize, 0, 0, (Math.random() * 0x7fffffff) | 0);
              this.pushDeathFx(x, y);
              this.removeUnit(i);
              this.exploded++;
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
                damage: wp.damage, splash: wp.splash ?? 0, splashRadius: wp.splashRadius ?? 0,
                look: wp.look, collide: wp.look.collide !== false, trailT: 0,
              });
            }
            break;
          }
          case "rail": {
            // RailBulletType: Fx.railShoot at the muzzle, Fx.railTrail every
            // 60 units down the line (pointEffectSpace), Fx.railHit on what
            // it punched through, Fx.shootBig2 smoke — all its 500 units
            this.aimHit(tgt, wp.damage);
            this.pushFx(x, y, 24 / 60, FxKind.RailShoot, aim, 0, 0, 0, true);
            this.pushFx(x, y, 10 / 60, FxKind.ShootBig2, aim);
            const ca = Math.cos(aim), sa = Math.sin(aim);
            for (let d = 0; d <= wp.range; d += 60 * MU)
              this.pushFx(x + ca * d, y + sa * d, 16 / 60, FxKind.RailTrail, aim, 0, 0, 0, true);
            this.pushFx(tgt.x, tgt.y, 18 / 60, FxKind.RailHit, aim, 0, 0, 0, true);
            break;
          }
          case "field": {
            // EnergyFieldAbility: one pulse to every structure in reach, a
            // Fx.chainLightning to each and Fx.hitLaserBlast off the unit
            // toward it, in the ability's colour
            const hit = this.structuresWithin(x, y, wp.range, this.splashOut);
            const max = wp.maxTargets ?? hit.length;
            const col = wp.fieldColor ?? PAL.heal;
            for (let k = 0; k < hit.length && k < max; k++) {
              this.hitStructure(hit[k], wp.damage);
              this.chainFx(x, y, hit[k], col);
              this.pushFxCol(x, y, 12 / 60, FxKind.HitLaserBlast, Math.atan2(hit[k].y - y, hit[k].x - x), 0, col);
            }
            break;
          }
        }
      }
    }
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
    this.pushFxCol(x, y, fxLife(shoot), shoot, a, 0, col, 0, false, seed);
    if (wp.smoke !== undefined) this.pushFxCol(x, y, fxLife(wp.smoke), wp.smoke, a, 0, col, 0, false, seed + 1);
  }

  /** a bullet, missile or shell leaves the unit for the structure */
  private fireUnitShot(x: number, y: number, tgt: Aim, wp: UnitWeapon, k: number): void {
    const look = wp.look;
    if (!look) return;
    const half = tgt.half;
    // aim at the footprint, with a little spread so a burst is a burst
    const ax = tgt.x + (Math.random() * 2 - 1) * half * 0.6;
    const ay = tgt.y + (Math.random() * 2 - 1) * half * 0.6;
    const dx = ax - x, dy = ay - y;
    const d = Math.max(1, Math.sqrt(dx * dx + dy * dy));
    const a = Math.atan2(dy, dx) + (Math.random() * 2 - 1) * 0.05 + (k - ((wp.shots ?? 1) - 1) / 2) * 0.06;
    const sp = wp.speed;
    // a shell lives exactly long enough to reach where it was aimed; a
    // bullet flies its full range and stops at what it hits on the way
    const life = wp.fx === "shell" ? d / sp : wp.range / sp;
    this.shots.push({
      x, y,
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      life, age: 0,
      damage: wp.damage,
      splash: wp.splash ?? 0,
      splashRadius: wp.splashRadius ?? 0,
      look,
      collide: look.collide !== false,
      trailT: 0,
    });
    // the bullet's own shootEffect and smokeEffect, in its hitColor (what
    // Effect.at is handed for a shootEffect) — sparkShoot ramps into it
    const fc = look.hitColor ?? look.back;
    const seed = (Math.random() * 0x7fffffff) | 0;
    this.pushFxCol(x, y, fxLife(look.shoot), look.shoot, a, 0, fc, 0, false, seed);
    if (look.smoke) this.pushFxCol(x, y, fxLife(look.smoke), look.smoke, a, 0, fc, 0, false, seed + 1);
  }

  /**
   * LaserBulletType: an instant beam its FULL length down the aim —
   * Mindustry stops a laser only at a block that absorbs lasers, so it runs
   * through the structure it hit and on to its length. The target takes
   * the damage; the shootEffect (Fx.hitLancer, or eclipse's shockwave)
   * goes off at the muzzle
   */
  private fireUnitLaser(x: number, y: number, aim: number, tgt: Aim | null, wp: UnitWeapon): void {
    if (tgt && this.aimReach(tgt, x, y, wp.range)) this.aimHit(tgt, wp.damage);
    const st = wp.laser;
    if (!st) return;
    this.pushFx(x, y, st.lifetime, FxKind.Laser, aim, wp.range, 0, st.id, true);
    if (wp.shoot === FxKind.Shockwave) this.pushFx(x, y, 10 / 60, FxKind.Shockwave, 0, wp.shootLen ?? 0);
    else if (wp.shoot !== undefined) this.pushFx(x, y, fxLife(wp.shoot), wp.shoot, aim, 0, (Math.random() * 0x7fffffff) | 0);
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
    const links = Math.max(1, Math.ceil(dst / range));
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

  /**
   * THE SWARM'S SHOTS IN FLIGHT. Each flies its heading; the structure
   * under it — one cellTower read — is what it hits. A shell that runs
   * out of life bursts where it is (that is where it was aimed); a
   * missile does the same; a bullet that reaches nothing is spent.
   */
  private updateEnemyShots(dt: number): void {
    const shots = this.shots;
    for (let p = shots.length - 1; p >= 0; p--) {
      const sh = shots[p];
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
      const t = off || !sh.collide ? null : this.structureAt(sh.x, sh.y);
      if (t) {
        this.hitStructure(t, sh.damage);
        if (sh.splash > 0) this.splashStructures(sh.x, sh.y, sh.splash, sh.splashRadius);
        this.shotHitFx(sh);
      } else if (sh.life <= 0 && !off) {
        // a shell that runs out of flight lands where it is
        if (sh.splash > 0) {
          this.splashStructures(sh.x, sh.y, sh.splash, sh.splashRadius);
          this.shotHitFx(sh);
        } else if (look.hit === FxKind.HitLaser) this.shotHitFx(sh);
      }
      if (t || off || sh.life <= 0) {
        shots[p] = shots[shots.length - 1];
        shots.pop();
      }
    }
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
      case FxKind.Explosion:
        this.pushFx(sh.x, sh.y, EXPLOSION_LIFE[look.hitStyle ?? 0] ?? 22 / 60, FxKind.Explosion, 0, 0,
          (Math.random() * 0x7fffffff) | 0, look.hitStyle ?? 0);
        break;
      case FxKind.GreenCloud:
        // the retusa torpedo: MultiEffect(blastExplosion, greenCloud)
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
    const hx0 = clamp(((x0 - UNIT_RMAX) / HC) | 0, 0, HCOLS - 1);
    const hy0 = clamp(((y0 - UNIT_RMAX) / HC) | 0, 0, HROWS - 1);
    const hx1 = clamp(((x1 + UNIT_RMAX) / HC) | 0, 0, HCOLS - 1);
    const hy1 = clamp(((y1 + UNIT_RMAX) / HC) | 0, 0, HROWS - 1);
    for (let hy = hy0; hy <= hy1; hy++) {
      for (let hx = hx0; hx <= hx1; hx++) {
        const c = hy * HCOLS + hx, e = this.bStart[c + 1];
        for (let k = this.bStart[c]; k < e; k++) {
          const i = this.bUnits[k];
          if (i >= this.n) continue;
          const dx = this.upx[i] - clamp(this.upx[i], x0, x1);
          const dy = this.upy[i] - clamp(this.upy[i], y0, y1);
          if (dx * dx + dy * dy < this.urad[i] * this.urad[i]) return false;
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
    const level = (this.level.enemyLevel ?? 0) + this.loopLevel;
    for (let i = 0; i < this.n; i++) {
      if (ufly[i] || unav[i]) continue;
      const wet = this.inWater(upx[i], upy[i]);
      // THE CROSSING, not the standing: only a dry -> wet step pays
      if (wet && !uwet01[i] && uwade[i] < AMPHIBIOUS_MAX_STACKS) {
        const kind = UNIT_KINDS[ukind[i]];
        const stats = UNIT_STATS[kind];
        const base = unitHpAtLevel(kind, level);
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
        const base = unitHpAtLevel(UNIT_KINDS[ukind[i]], level);
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

  /**
   * Would a turret of `kind` placed here fire slowed? True if ANY
   * cell of its footprint is within reach of water — a turret is one
   * building, so one wet corner soaks the whole thing rather than the
   * penalty depending on which cell the game happens to measure from.
   */
  isWaterlogged(gx: number, gy: number, kind: TowerKind, size?: number): boolean {
    const mask = this.waterlogged;
    if (!mask) return false;
    const sz = size ?? structStats(kind).size;
    for (let y = gy; y < gy + sz; y++)
      for (let x = gx; x < gx + sz; x++)
        if (x >= 0 && y >= 0 && x < COLS && y < ROWS && mask[y * COLS + x]) return true;
    return false;
  }

  canPlace(gx: number, gy: number, kind: TowerKind, size?: number): boolean {
    // THE TECH GATE, and no price gate at all. A turret is bought as a
    // CARD (spend, and rarity.ts for the roll) and the card is placed for
    // nothing, so by the time a footprint is being tested the scrap is
    // already gone — asking for the price again here would charge a run
    // twice and refuse a card it had paid for. What the save owns (the
    // track, track.ts) it may place from wave 1; there is no stage gate
    // inside a run. A sandbox or an editor (tech null) owns everything
    if (this.tech && !this.tech.unlocked.has(kind)) return false;
    // the footprint the CALLER means, which is the kind's own everywhere
    // but the giant (mods.ts): a building has to be tested on the ground
    // it will actually stand on, and that is decided before it exists
    const sz = size ?? TOWERS[kind].size;
    if (gx < 0 || gy < 0 || gx > COLS - sz || gy > ROWS - sz) return false;
    const { blocked } = this.terrain;
    const { isGoal } = this.field;
    // GROUND LEVEL ONLY. A structure stands on open ground, in the swarm's
    // way, where it is a wall as well as a gun — never on a hill, a forest
    // or deep water (every blocked cell), never on another structure — the
    // core included — never on a drop zone (a corked door spawns nothing).
    // Shallow water is ground, as it is in Mindustry: a naval map's
    // shallows are most of the floor it has
    for (let y = gy; y < gy + sz; y++)
      for (let x = gx; x < gx + sz; x++) {
        const i = y * COLS + x;
        if (blocked[i] || isGoal[i] || this.groundPads[i] || this.cellTower[i]) return false;
      }
    // a LIVE shield tower owns its ground: it rose on free rock and holds
    // it, so nothing builds inside its footprint until it is dead
    for (const s of this.shieldTowers) {
      if (s.hp <= 0) continue;
      if (gx < s.gx + SHIELD_TOWER_SIZE && s.gx < gx + sz && gy < s.gy + SHIELD_TOWER_SIZE && s.gy < gy + sz)
        return false;
    }
    // nothing underfoot. Sealing the swarm's route is allowed: a wall it
    // cannot walk around is a wall it walks INTO and shoots (the field
    // routes through structures at a cost — FlowField.soft), so a seal
    // is not a win, it is a fight at the wall
    if (!this.areaClearOfUnits(gx, gy, sz)) return false;
    return true;
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
  batchPlacement<T>(fn: () => T): T {
    this.specsHold++;
    try {
      return fn();
    } finally {
      this.specsHold--;
      if (this.specsHold === 0 && this.specsPending) {
        this.specsPending = false;
        this.refreshSpecs();
      }
    }
  }

  /**
   * ONE ORDINARY TURRET. THE ATTRIBUTE ROLL HAPPENS HERE (mods.ts): one
   * independent roll per turret upgrade the run owns, so a card that puts
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
    const sz = TOWERS[kind].size;
    const gx0 = clamp(Math.round(x0 / CELL - sz / 2), 0, COLS - sz);
    const gy0 = clamp(Math.round(y0 / CELL - sz / 2), 0, ROWS - sz);
    const dx = x1 - x0, dy = y1 - y0;
    const ax = Math.abs(dx), ay = Math.abs(dy);
    // tan(67.5 degrees): the cut that makes the eight sectors even
    const OCT = 2.4142;
    let sx = 0, sy = 0;
    if (ax > ay * OCT) sx = Math.sign(dx);
    else if (ay > ax * OCT) sy = Math.sign(dy);
    else {
      sx = Math.sign(dx);
      sy = Math.sign(dy);
    }
    const out = [{ gx: gx0, gy: gy0 }];
    if (!sx && !sy) return out;
    // how far along that heading the cursor actually is, in buildings
    const step = CELL * sz;
    const reach = (ax * Math.abs(sx) + ay * Math.abs(sy)) / (Math.abs(sx) + Math.abs(sy));
    const n = Math.min(RULER_MAX, Math.floor(reach / step));
    for (let k = 1; k <= n; k++) {
      const gx = gx0 + sx * sz * k, gy = gy0 + sy * sz * k;
      if (gx < 0 || gy < 0 || gx > COLS - sz || gy > ROWS - sz) break;
      out.push({ gx, gy });
    }
    return out;
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
    return t && !isCore(t) ? t : null;
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
    // what makes this the one place the aim boxes have to be told
    // (structBox). Raised whatever the masks below decide: a footprint
    // laid entirely on cells the terrain already called rock changes no
    // mask and is still a thing that can be shot at.
    this.structBoxDirty = true;
    const { blocked } = this.terrain;
    const { walk, soft } = this.field;
    const nWalk = this.navalField.walk, nSoft = this.navalField.soft;
    const sz = this.sizeOf(t);
    let changed = false;
    for (let y = t.gy; y < t.gy + sz; y++)
      for (let x = t.gx; x < t.gx + sz; x++) {
        const i = y * COLS + x;
        this.cellTower[i] = on ? t : null;
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
      // a solve in flight is solving the board as it was a moment ago:
      // drop it and let the flags below buy a fresh one once things settle
      if (this.solveQueue.length > 0) this.abortSolves();
      this.fieldDirty = true;
      this.navalDirty = true;
      this.unstickPending = true;
      // the board moved, so the settle clock starts over — a drag holds it
      // at zero and pays for one solve when it ends (solveDirtyFields)
      this.fieldQuiet = 0;
    }
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
    this.refreshSpecs();
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
        if (this.charging) this.scrap += sellValue(st.kind);
        this.pushFx(st.x, st.y, 0.35, FxKind.Death);
        this.removeTower(st);
        k++;
      }
      return k;
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
      for (let k = this.bStart[row + gx0]; k < e; k++) {
        const i = this.bUnits[k];
        if (i >= this.n || this.ufly[i] !== f) continue;
        // free means the physics circles wouldn't touch, so a fresh
        // spawn never starts mid-shove; only the same layer counts —
        // air and ground never collide
        const dx = this.upx[i] - x, dy = this.upy[i] - y;
        const rs = (r + this.urad[i]) * PHYS_R;
        if (dx * dx + dy * dy < rs * rs) return false;
      }
    }
    return true;
  }

  /**
   * The doors one movement layer may enter by — and, for a boss, the boss
   * door instead when the map paints one.
   *
   * This is where the region system used to live: a wave group named a
   * number, the pads were looked up by that number, and an unknown number
   * fell back to "anywhere". A unit's LAYER answers the same question
   * without anyone authoring anything, so the only special case left is the
   * boss, which is not a layer but a door reserved from the ordinary swarm.
   */
  private spawnPads(layer: MoveLayer, boss: boolean): number[] {
    // A BOSS IGNORES ITS LAYER'S ZONES when the map paints a boss door —
    // that is the door's whole meaning. A map WITHOUT one leaves the boss
    // on its layer's own zones rather than falling back to "anywhere".
    if (boss && this.bossPads[layer].length > 0)
      return layer === "air" && this.bossAirOpen.length > 0 ? this.bossAirOpen : this.bossPads[layer];
    if (layer === "air") return this.airOpen.length > 0 ? this.airOpen : this.airPads;
    if (layer === "water") return this.navalField.spawnPts;
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
    brood?: { x: number; y: number },
    wave = this.wavesStarted,
  ): boolean {
    const stats = UNIT_STATS[kind];
    const fly = !!stats.flying;
    const layer = this.layerOf(kind);
    const pads = brood ? EMPTY_PADS : this.spawnPads(layer, !!stats.boss);
    if (this.n >= MAX_UNITS || (!brood && pads.length === 0)) return false;
    const r = stats.radius;
    // the drop-zone test is the same broad-phase query the physics pass
    // runs, so it needs the same reach: a ring of 1 would let two antumbras
    // land inside one another and start the wave already shoving
    const span = KIND_SPAN[UNIT_ID[kind]];
    const tries = brood ? MITOSIS_TRIES : 8;
    for (let a = 0; a < tries; a++) {
      let x: number, y: number;
      if (brood) {
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
        // fits (a mace is wider than a tile — it spawns pad-centered)
        const j = Math.max(0, CELL / 2 - r - 1);
        x = ((ci % COLS) + 0.5) * CELL + (Math.random() * 2 - 1) * j;
        y = (((ci / COLS) | 0) + 0.5) * CELL + (Math.random() * 2 - 1) * j;
      }
      // a big hitbox can overhang the pad into ragged rock beside it, so
      // the arrival is tested against the mover's OWN field: for a naval
      // tank that is the one with the deep water open, which is what lets
      // it land half in a channel and half on its bank
      const wallField = layer === "water" ? this.navalField : this.field;
      if ((!fly && wallField.hitsWall(x, y, WALL_R)) || !this.spawnSpotFree(x, y, r, fly, span))
        continue;
      const i = this.n++;
      // LEVEL SCALING: health rides the level curve, and the rung adds a
      // flat armour bonus and a shield multiplier below (both from RUNGS,
      // both piecewise per rung rather than per level). Speed, hitbox and
      // drop stay exactly where UNIT_STATS put them however high the rung
      // climbs
      const hp = unitHpAtLevel(kind, (this.level.enemyLevel ?? 0) + this.loopLevel);
      this.upx[i] = x;
      this.upy[i] = y;
      this.uvx[i] = 0;
      this.uvy[i] = 0;
      this.uhp[i] = hp;
      this.uhpmax[i] = hp;
      // SPEEDY (mutation.ts) is a stat, not a status: the doubling lands
      // here, once, so every reader of uspd — the drive, the chassis turn
      // rate, the leg cycle — is already looking at the speed this unit
      // actually travels at
      this.uspd[i] = stats.speed * (this.speedyOn ? SPEEDY_SPEED : 1);
      this.urad[i] = r;
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
      // read downstream — the lancer's x4 included — sees it
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
      // already past every door on the map. Twelve untouchable daggers a
      // reign would be a gift rather than a mutator — a brood is killable
      // the instant it lands, by the same splash that killed its parent
      this.uspawn[i] = brood ? 0 : SPAWN_INVINCIBLE;
      this.uburn[i] = 0;
      this.uwet[i] = 0;
      this.uwetSlow[i] = 1;
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
      // ...and the one thing a brood body carries that a door body does
      // not: the mark that says it may not brood in its turn (see ubrood)
      this.ubrood[i] = brood ? 1 : 0;
      // ...and a fresh body has not yet had its one stand-up
      // (Reconstruction): updateCorpses marks the ones that have
      this.urisen[i] = 0;
      this.ueaten[i] = 0;
      this.uhungerT[i] = HUNGRY_PERIOD;
      this.uid[i] = this.nextId++;
      this.ukind[i] = UNIT_ID[kind];
      this.ufly[i] = fly ? 1 : 0;
      this.unav[i] = layer === "water" ? 1 : 0;
      this.uheavy[i] = KIND_HEAVY[UNIT_ID[kind]];
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
            ? uforceScale[i] + (1 - uforceScale[i]) * (1 - Math.pow(1 - 0.06, dt * 60))
            : 0;
        continue;
      }
      const repair = KIND_REPAIR[k];
      const shield = KIND_SHIELD[k];
      const energy = KIND_ENERGY[k];
      if (!repair && !shield && !energy) continue;
      const spec = (repair ?? shield ?? energy)!;
      const reload = spec.reload;
      uability[i] += dt;
      if (uability[i] < reload) continue;
      uability[i] = 0;

      const range = spec.range;
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
        for (let b = this.bStart[row + hx0]; b < e; b++) {
          const j = this.bUnits[b];
          if (j >= this.n || uhp[j] <= 0) continue;
          const dx = upx[j] - upx[i], dy = upy[j] - upy[i];
          const rr = range + urad[j];
          if (dx * dx + dy * dy > rr * rr) continue;
          if (repair && uhp[j] < uhpmax[j]) {
            // Unit.heal clamps at max health
            uhp[j] = Math.min(uhp[j] + repair.amount, uhpmax[j]);
            this.pushFx(upx[j], upy[j], 0.18, FxKind.Heal);
            did = true;
          }
          if (shield && ushield[j] < shield.max * ss) {
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
      if (did)
        this.pushFxCol(
          upx[i], upy[i], 22 / 60,
          repair || energy ? FxKind.HealWave : FxKind.ShieldWave,
          0, range, repair || energy ? PAL.heal : TEAM_CRUX_RGB,
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
    const { uburn, uwet, uhp, uhpmax, upx, upy, urad, uspawn } = this;
    for (let i = this.n - 1; i >= 0; i--) {
      // the arrival clock. Mindustry schedules Fx.spawn with Time.run(30),
      // which lands on the frame `unmoving` expires — so the ring going up
      // and the unit taking its first step are the same moment, and one
      // threshold crossing does for both
      if (uspawn[i] > 0) {
        const was = uspawn[i];
        uspawn[i] = Math.max(0, was - dt);
        const walks = SPAWN_INVINCIBLE - SPAWN_UNMOVING;
        if (was > walks && uspawn[i] <= walks)
          this.pushFx(upx[i], upy[i], FX_SPAWN, FxKind.Spawn);
      }
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
      // nearly dead". Scaled by the hitbox so a toxopid smokes like the
      // building it is and a dagger like a dagger. pushFx refuses it with
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
      if (uburn[i] <= 0) continue;
      uburn[i] -= dt;
      this.damageUnit(i, BURN_DPS * dt, true);
      if (uhp[i] <= 0) {
        this.killUnit(i);
        continue;
      }
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
   * meal moves one number and nothing else, so a hungry dagger that has
   * eaten a quasar is a very fat dagger and not a quasar.
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
      this.removeUnit(j);
      this.devoured++;
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
   * walker does not pluck a flare out of the sky, and nothing eats a hull
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
      for (let k = bStart[row + hx0]; k < e; k++) {
        const j = bUnits[k];
        if (j === i || j >= this.n || uhp[j] <= 0) continue;
        if (uhungry[j] || uspawn[j] > 0 || KIND_BOSS[ukind[j]]) continue;
        if (ufly[j] !== fly || unav[j] !== nav) continue;
        const dx = upx[j] - x, dy = upy[j] - y;
        const rr = HUNGRY_REACH + urad[j];
        if (dx * dx + dy * dy > rr * rr) continue;
        // reservoir sampling: the nth candidate takes the slot 1-in-n of
        // the time, which leaves every candidate equally likely
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
    if (this.reconstructOn && !this.urisen[i]) {
      this.pushDeathFx(x, y);
      this.removeUnit(i);
      // ...and the wave is held open behind it. removeUnit has just booked
      // the body as down (waveDown); un-booking it here is what stops a
      // wave from reading as cleared — and paying out its XP — while
      // something it sent is lying on the floor about to get up
      this.waveDown[wave] = (this.waveDown[wave] ?? 1) - 1;
      this.corpses.push({
        kind, x, y, wave, t: RECONSTRUCT_DELAY, grace: RECONSTRUCT_DELAY + RECONSTRUCT_GRACE,
      });
      return;
    }
    this.killsByKind[kind]++;
    // the kill's scrap, into the run — off the kind's health (economy.ts)
    // ...times what the SCAVENGER RIG relics add (mods.ts), which is the
    // one thing in the run that moves what a body is worth
    const drop = Math.round(unitDrop(UNIT_KINDS[kind]).scrap * dropScale(this.mods));
    this.scrap += drop;
    this.scrapEarned += drop;
    this.pushDeathFx(x, y);
    // VOLATILE (mutation.ts): the body's parting blast, before the arrays
    // reshuffle under it
    if (this.volatileOn) this.volatileBlast(x, y, this.urad[i], kind);
    this.removeUnit(i);
    this.kills++;
    // MITOSIS (mutation.ts): what the body breaks into, AFTER the removal
    // rather than before it. Spawning first would append the brood above
    // the dead row and leave removeUnit swapping a live newborn down into
    // it — legal, but it would put brood indices inside the pending-removal
    // lists every caller of killUnit is halfway through. Removing first
    // means the brood only ever lands on slots those lists have already
    // finished with, and a stale index there meets a body with health,
    // which every one of them re-tests for
    if (this.mitosisOn && !wasBrood) this.splitUnit(x, y, kind, wave);
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
        this.urisen[this.n - 1] = 1;
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
      this.killsByKind[body.kind]++;
      const drop = Math.round(unitDrop(UNIT_KINDS[body.kind]).scrap * dropScale(this.mods));
      this.scrap += drop;
      this.scrapEarned += drop;
      this.kills++;
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
    // the player's focus mark rides the same reshuffle: the marked unit
    // dying clears the mark for good, and the unit swapped down into its
    // slot drags the index hint with it (see setFocusUnit)
    if (this.focusIdx === i) {
      this.focusIdx = -1;
      this.focusUid = -1;
    } else if (this.focusIdx === n) {
      this.focusIdx = i;
    }
    this.upx[i] = this.upx[n];
    this.upy[i] = this.upy[n];
    this.uvx[i] = this.uvx[n];
    this.uvy[i] = this.uvy[n];
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
    this.uwet[i] = this.uwet[n];
    this.uwetSlow[i] = this.uwetSlow[n];
    this.uhungry[i] = this.uhungry[n];
    this.ueaten[i] = this.ueaten[n];
    this.uhungerT[i] = this.uhungerT[n];
    this.ubrood[i] = this.ubrood[n];
    this.urisen[i] = this.urisen[n];
    this.uwave[i] = this.uwave[n];
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
    const ease = 1 - Math.pow(0.9, ticks);
    const knee = 1 - Math.pow(1 - L.speed / 4, ticks);
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
        const a = 1 - Math.pow(1 - frac, ticks);
        ulegFX[p] += (dx - ulegFX[p]) * a;
        ulegFY[p] += (dy - ulegFY[p]) * a;
        const a2 = 1 - Math.pow(1 - frac / 2, ticks);
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
    // that carry it — legSplashDamage. Arkyid (32 over 30 units) and
    // toxopid (80 over 60) carry that last one on this roster, and
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
      const r = KIND_RADIUS[k];
      if (KIND_FLYING[k]) {
        na += alive;
        if (r > a) a = r;
        if (!KIND_HEAVY[k] && r > as) as = r;
      } else {
        ng += alive;
        if (r > g) g = r;
        if (!KIND_HEAVY[k] && r > gs) gs = r;
      }
    }
    this.rmaxAliveGround = g;
    this.rmaxAliveAir = a;
    this.nAliveAir = na;
    this.nAliveGround = ng;
    // the same reach KIND_SPAN held, with the live rmax in place of the
    // roster's: a pair further apart than span * HC cannot be touching
    for (let k = 0; k < UNIT_KINDS.length; k++) {
      const rk = KIND_RADIUS[k];
      const fly = KIND_FLYING[k];
      this.kindSpanDyn[k] = Math.max(1, Math.ceil(((rk + (fly ? a : g)) * PHYS_R) / HC));
      this.kindSpanSDyn[k] = Math.max(1, Math.ceil(((rk + (fly ? as : gs)) * PHYS_R) / HC));
    }
  }

  /** the widest live radius a bullet with these layer flags can meet — the
   * live-roster stand-in for rmaxFor() in every broad-phase pad */
  private rmaxAliveFor(air: boolean, ground: boolean): number {
    return Math.max(air ? this.rmaxAliveAir : 0, ground ? this.rmaxAliveGround : 0);
  }

  private hashCellOf(i: number): number {
    return (
      clamp((this.upy[i] / HC) | 0, 0, HROWS - 1) * HCOLS +
      clamp((this.upx[i] / HC) | 0, 0, HCOLS - 1)
    );
  }

  private buildHash(): void {
    const { bStart, bCount, bUnits } = this;
    bCount.fill(0);
    for (let i = 0; i < this.n; i++) bCount[this.hashCellOf(i)]++;
    let s = 0;
    for (let c = 0; c < HN; c++) {
      bStart[c] = s;
      s += bCount[c];
    }
    bStart[HN] = s;
    bCount.fill(0);
    for (let i = 0; i < this.n; i++) {
      const c = this.hashCellOf(i);
      bUnits[bStart[c] + bCount[c]++] = i;
    }
  }

  // ---------- units ----------

  /**
   * Mindustry's PhysicsProcess.PhysicsWorld.update(), ported 1:1: every
   * unit is a circle (radius PHYS_R * urad) with mass = area; overlapping
   * same-layer pairs are pushed apart along their center line by the full
   * overlap softened by PHYS_SCL, split inversely by mass — a mace plows
   * through daggers, daggers barely rock the mace. Each unordered pair
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
    const { upx, upy, urad, ufly, unav, uvx, uvy, uhx, uhy, uid, phx, phy, bStart, bUnits } = this;
    const { clear } = this.field;
    // the naval tanks' clearance map, so the sideways re-aim below asks
    // how much room a tank has beside it on its OWN mask — deep water
    // scores zero on the ground map, which would have switched the
    // re-aim off for the whole naval line
    const wclear = this.navalField.clear;
    const n = this.n;
    for (let i = 0; i < n; i++) {
      phx[i] = upx[i];
      phy[i] = upy[i];
      const vx = uvx[i], vy = uvy[i];
      const vl = Math.sqrt(vx * vx + vy * vy);
      // walkers only, and only where there is open ground beside them: the
      // sideways re-aim would otherwise grind a unit into rock. Flyers are
      // left on Mindustry's own centre-line resolution — the conga line is
      // a corridor problem, and they are not in a corridor
      const room =
        vl > 1e-3 &&
        ufly[i] === 0 &&
        (unav[i] !== 0 ? wclear : clear)[
          clamp((upy[i] / CELL) | 0, 0, ROWS - 1) * COLS +
            clamp((upx[i] / CELL) | 0, 0, COLS - 1)
        ] >= SPREAD_CLEAR;
      uhx[i] = room ? vx / vl : 0;
      uhy[i] = room ? vy / vl : 0;
    }
    const { ukind, kindSpanDyn, kindSpanSDyn, uheavy } = this;
    for (let i = 0; i < n; i++) {
      const fly = ufly[i];
      // the size split (see HEAVY_R): a heavy owns EVERY pair it is part
      // of and scans the wide window for them; a small unit scans only the
      // small-partner window and skips heavy candidates outright. Each
      // unordered pair still resolves exactly once, and the small window
      // is what keeps a dagger swarm's broad phase priced for daggers
      // while a reign stands on the same field
      const iHeavy = uheavy[i];
      const ri = urad[i] * PHYS_R;
      const mi = urad[i] * urad[i]; // hitSize^2 * pi — the pi cancels in the ratio
      // the unit's own scratch position rides in locals through the scan —
      // candidates read it every test, and it only moves when a pair
      // actually resolves — and lands back in the array afterwards
      let pxi = phx[i], pyi = phy[i];
      const hix = clamp((pxi / HC) | 0, 0, HCOLS - 1);
      const hiy = clamp((pyi / HC) | 0, 0, HROWS - 1);
      const sp = iHeavy ? kindSpanDyn[ukind[i]] : kindSpanSDyn[ukind[i]];
      // the counting sort lays a row's buckets out contiguously in bUnits,
      // so each row of the window is ONE range — no per-bucket setup
      const gx0 = Math.max(0, hix - sp), gx1 = Math.min(HCOLS - 1, hix + sp);
      for (let gy = Math.max(0, hiy - sp); gy <= Math.min(HROWS - 1, hiy + sp); gy++) {
        const row = gy * HCOLS;
        const e = bStart[row + gx1 + 1];
        for (let k = bStart[row + gx0]; k < e; k++) {
          const j = bUnits[k];
          if (j >= n || ufly[j] !== fly) continue;
          if (iHeavy) {
            // a heavy meets everyone; only the heavy-heavy pair needs the
            // once-per-pair guard (its small pairs are exclusively its own)
            if (j === i || (uheavy[j] !== 0 && j <= i)) continue;
          } else {
            if (j <= i || uheavy[j] !== 0) continue;
          }
          const rs = ri + urad[j] * PHYS_R;
          let dx = pxi - phx[j], dy = pyi - phy[j];
          const d2 = dx * dx + dy * dy;
          if (d2 >= rs * rs) continue;
          const dst = Math.sqrt(d2);
          if (dst < 1e-4) {
            const a = Math.random() * Math.PI * 2;
            dx = Math.cos(a);
            dy = Math.sin(a);
          } else {
            dx /= dst;
            dy /= dst;
          }
          // re-aim the (unit-length) push across the direction of travel:
          // split it into along- and across-heading parts, keep a fraction
          // of the along part, and spend what is left widening the rank.
          // Renormalised, so the pair still separates by exactly the
          // overlap and the relaxation cannot overshoot into jitter
          const hx = uhx[i], hy = uhy[i];
          if (hx !== 0 || hy !== 0) {
            const al = dx * hx + dy * hy;
            const ll = Math.sqrt(Math.max(0, 1 - al * al));
            let lx: number, ly: number;
            if (ll < 1e-3) {
              // dead in line astern — no across-component to grow, so take
              // a side from the pair's ids: stable frame to frame, which
              // matters because a side that flipped would just shudder
              const s = (uid[i] ^ uid[j]) & 1 ? 1 : -1;
              lx = -hy * s;
              ly = hx * s;
            } else {
              lx = (dx - al * hx) / ll;
              ly = (dy - al * hy) / ll;
            }
            const pa = al * PUSH_LONG;
            const pl = ll + Math.abs(al) * PUSH_SIDE;
            const pn = Math.sqrt(pa * pa + pl * pl) || 1;
            dx = (pa * hx + pl * lx) / pn;
            dy = (pa * hy + pl * ly) / pn;
          }
          const mj = urad[j] * urad[j];
          const push = (rs - dst) / PHYS_SCL / (mi + mj);
          pxi += dx * push * mj;
          pyi += dy * push * mj;
          phx[j] -= dx * push * mi;
          phy[j] -= dy * push * mi;
        }
      }
      phx[i] = pxi;
      phy[i] = pyi;
    }
  }

  private updateUnits(dt: number): void {
    const { upx, upy, uvx, uvy, uspd, ukind, uwalk, ubrot, urot, ulat, phx, phy, field, flowTmp } = this;
    const { upullx, upully, uspawn, uwet, uwetSlow } = this;
    // the water mask, for the naval tanks' pace ashore (NAVAL_LAND_SPEED)
    const water = this.waterCells;
    const steer = Math.min(1, dt * 8);
    // one step of the lateral bias's mean-reverting walk, precomputed: pull
    // LAT_A of the way back to straight-ahead, then add noise scaled so the
    // stationary spread lands on LAT_SIGMA whatever the tick rate
    const LAT_A = Math.min(1, LAT_RELAX * dt);
    const LAT_N = LAT_SIGMA * Math.sqrt(6 * LAT_A);
    // repulsion probes reach 4px past the wall-clearance radius: any longer
    // and the push-off fires while a unit hugs a wall to enter a staggered
    // narrow passage, shoving it back out of the entry window forever
    const PR = WALL_R + 4, REP = 55;

    for (let i = this.n - 1; i >= 0; i--) {
      const fly = this.ufly[i] !== 0;
      const nav = this.unav[i] !== 0;
      const mf = nav ? this.navalField : field;
      const { walk } = mf;
      const cx = clamp((upx[i] / CELL) | 0, 0, COLS - 1);
      const cy = clamp((upy[i] / CELL) | 0, 0, ROWS - 1);
      const ci = cy * COLS + cx;
      // NOTHING ARRIVES AND NOTHING LEAKS. The core is the goal (coreGoal)
      // and it is solid: a body that reaches it is pressed against it by
      // the field and stays there, firing (updateUnitWeapons), until one of
      // them is gone. A naval tank aims at the same core the walkers do —
      // it used to park on the water nearest it and fire from the shore,
      // which was the whole of what a hull could reach.

      if (fly) {
        // flyers take the air field's route round the hills and HOLD over
        // the core's edge once there — Mindustry's FlyingAI circles what it
        // attacks; this one hovers, and its guns do the rest
        // (updateUnitWeapons)
        const gdx = this.ugx[i] - upx[i], gdy = this.ugy[i] - upy[i];
        const gl = Math.sqrt(gdx * gdx + gdy * gdy) || 1;
        const hold = (this.core.size * CELL) / 2 + CELL * 1.5;
        if (gl <= hold) {
          flowTmp.x = 0;
          flowTmp.y = 0;
        } else this.airHeading(upx[i], upy[i], gdx / gl, gdy / gl, flowTmp, this.airField);
      } else {
        mf.sample(upx[i], upy[i], flowTmp);
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
      const land = nav && !water[ci] ? NAVAL_LAND_SPEED : 1;
      const spd =
        uspawn[i] > SPAWN_INVINCIBLE - SPAWN_UNMOVING
          ? 0
          : uwet[i] > 0
            ? uspd[i] * uwetSlow[i] * land
            : uspd[i] * land;
      uvx[i] += (flowTmp.x * spd - uvx[i]) * steer;
      uvy[i] += (flowTmp.y * spd - uvy[i]) * steer;

      // this tick's crowd shove, precomputed by updatePhysics: whatever the
      // pairwise resolution moved this unit's scratch position. Applied on
      // top of the unit's own capped drive — a crowd can shove a unit
      // faster than it walks, exactly as in Mindustry — but it rides
      // through the same wall slide below, so pressure never pins anyone
      // into rock
      const shx = phx[i] - upx[i], shy = phy[i] - upy[i];
      let fx = 0, fy = 0;

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
      if (!fly) {
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
          fx += (Math.random() - 0.5) * 14;
          fy += (Math.random() - 0.5) * 14;
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

      // the unit's own drive (flow + terrain steering) never exceeds its
      // stat speed; the physics shove then rides on top uncapped
      let mvx = uvx[i] + fx, mvy = uvy[i] + fy;
      const ml = Math.sqrt(mvx * mvx + mvy * mvy);
      if (ml > spd) {
        mvx = (mvx / ml) * spd;
        mvy = (mvy / ml) * spd;
      }
      // an outside shove (a spectre round's knockback) rides on top of the
      // capped drive like the crowd shove does, and bleeds off at the
      // kind's own drag — Mindustry keeps the impulse in `vel` and scales
      // the whole thing by (1 - drag) every tick, so a shove outlives the
      // hit that dealt it by a moment
      const pull = upullx[i] !== 0 || upully[i] !== 0;
      const dxT = mvx * dt + shx + (pull ? upullx[i] * dt : 0);
      const dyT = mvy * dt + shy + (pull ? upully[i] * dt : 0);
      if (pull) {
        const keep = Math.pow(1 - KIND_DRAG[ukind[i]], dt * 60);
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
      // entirely so it can always walk back out. Flyers skip walls wholesale
      const x0 = upx[i], y0 = upy[i];
      const wedged = fly || mf.hitsWall(upx[i], upy[i], WALL_R);
      let nx = upx[i] + dxT;
      if (!wedged && mf.hitsWall(nx, upy[i], WALL_R)) {
        const cX =
          dxT > 0
            ? Math.floor((nx + WALL_R) / CELL) * CELL - WALL_R
            : Math.ceil((nx - WALL_R) / CELL) * CELL + WALL_R;
        const fwd = dxT > 0 ? cX > upx[i] : cX < upx[i];
        if (fwd && !mf.hitsWall(cX, upy[i], WALL_R)) nx = cX;
        else {
          nx = upx[i];
          uvy[i] += Math.sign(uvy[i] || flowTmp.y || 1) * Math.abs(uvx[i]) * 0.6;
          uvx[i] = 0;
        }
      }
      let ny = upy[i] + dyT;
      if (!wedged && mf.hitsWall(nx, ny, WALL_R)) {
        const cY =
          dyT > 0
            ? Math.floor((ny + WALL_R) / CELL) * CELL - WALL_R
            : Math.ceil((ny - WALL_R) / CELL) * CELL + WALL_R;
        const fwd = dyT > 0 ? cY > upy[i] : cY < upy[i];
        if (fwd && !mf.hitsWall(nx, cY, WALL_R)) ny = cY;
        else {
          ny = upy[i];
          uvx[i] += Math.sign(uvx[i] || flowTmp.x || 1) * Math.abs(uvy[i]) * 0.6;
          uvy[i] = 0;
        }
      }
      upx[i] = clamp(nx, WALL_R, W - WALL_R);
      upy[i] = clamp(ny, WALL_R, H - WALL_R);

      // animation state from what actually happened this frame: legs cycle
      // with distance covered; the body turns toward travel at its steady
      // rate while the chassis (Mindustry baseRotation) only turns as fast
      // as the unit is really moving — shoved units swivel feet-last
      // ...and a step too small to be a step does not steer anything. What
      // is left under a standing body — a decaying drive, a neighbour's
      // shove — is a direction that flips frame to frame, and a body that
      // re-aims at it swivels on the spot however still it actually is. The
      // deadzone is a fraction of the stride this unit's own pace would
      // make, so it scales with a slowed or a hurried unit rather than
      // being a pixel count that means different things to different kinds
      const mdx = upx[i] - x0, mdy = upy[i] - y0;
      const len = Math.sqrt(mdx * mdx + mdy * mdy);
      const stride = uspd[i] * dt;
      if (len > Math.max(1e-4, stride * TURN_DEAD)) {
        const ang = Math.atan2(mdy, mdx);
        const trot = KIND_ROT[ukind[i]] * dt;
        urot[i] += clamp(Sim.angleDiff(urot[i], ang), -trot, trot);
        if (!fly) {
          uwalk[i] += len;
          const cap = ROT_SPD * Math.min(1, len / stride) * dt;
          ubrot[i] += clamp(Sim.angleDiff(ubrot[i], ang), -cap, cap);
        }
      }
      // legs walk on the chassis angle this frame settled on. A standing
      // unit still runs the pass — its feet ease back under it
      const gait = KIND_LEGS[ukind[i]];
      if (gait) this.updateLegs(i, gait, mdx, mdy, len, dt);
      if (nav) this.updateWake(i, dt, water[ci] !== 0);
    }
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
   * top of one exactly as it can on a dagger — and the cell it is moved to
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
          this.pushFx(s.x, s.y, 0.5, FxKind.ShieldWave);
        }
      }
      if (s.shield > 0 && s.scale > 0.5) this.domesUp = true;
    }
  }

  /**
   * Roll a spot and raise a shield tower on it. A candidate 3x3 has to be
   * EMPTY BUILDABLE ROCK: every cell of it rock a turret could itself have
   * stood on, and nothing already standing on any of them — no other
   * shield tower, no turret, not the core.
   *
   * Two dozen tries, then GIVE UP until the next period. That is the whole
   * failure mode and it is deliberate: a board whose free rock the player
   * has built out raises nothing at all, rather than the rule reaching for
   * a square that is taken. Nothing the player owns is ever displaced,
   * buried or disabled by a shield tower — it competes for empty ground
   * and loses when there is none.
   */
  private trySpawnShieldTower(): void {
    const { blocked, wall } = this.terrain;
    for (let tries = 0; tries < 24; tries++) {
      const gx = 1 + ((Math.random() * (this.terrain.cols - SHIELD_TOWER_SIZE - 2)) | 0);
      const gy = 1 + ((Math.random() * (this.terrain.rows - SHIELD_TOWER_SIZE - 2)) | 0);
      // TURRET GROUND ONLY: every cell of the footprint has to be rock a
      // tower could itself have been built on — blocked, and not one of
      // the un-buildable kinds (isBuildableWall: no pine, no deep water).
      //
      // That one test replaces every rule this roller used to carry. A
      // shield tower on rock cannot cork a drop zone, cannot stand in a lane,
      // cannot sit on water and cannot seal the swarm's route, because
      // rock is already impassable and already none of those things — so
      // the base apron, the spawn/exit test, the water test and the BFS
      // seal probe are all gone rather than merely passing every time.
      let ok = true;
      for (let y = gy; y < gy + SHIELD_TOWER_SIZE && ok; y++)
        for (let x = gx; x < gx + SHIELD_TOWER_SIZE; x++) {
          const i = y * COLS + x;
          if (!blocked[i] || !isBuildableWall(wall[i])) {
            ok = false;
            break;
          }
        }
      if (!ok) continue;
      // ...and never on top of another shield tower. Harmless at a cap of three
      // and near-certain at twenty: rock is a small share of the map, so
      // without this the roller stacks them on the same few outcrops
      for (const o of this.shieldTowers) {
        if (o.hp <= 0) continue;
        if (
          gx < o.gx + SHIELD_TOWER_SIZE && o.gx < gx + SHIELD_TOWER_SIZE &&
          gy < o.gy + SHIELD_TOWER_SIZE && o.gy < gy + SHIELD_TOWER_SIZE
        ) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      // ...and never on anything already standing. cellTower is the board's
      // own occupancy index — the core and the player's turrets alike — so
      // one sweep of the footprint answers
      // it for all of them. The board the player built is theirs: a mutator
      // that buried it would be a mutator that undid their choices, so a
      // roll that lands on one is thrown away and a map with no free rock
      // left raises nothing this period
      for (let y = gy; y < gy + SHIELD_TOWER_SIZE && ok; y++)
        for (let x = gx; x < gx + SHIELD_TOWER_SIZE; x++)
          if (this.cellTower[y * COLS + x]) {
            ok = false;
            break;
          }
      if (!ok) continue;

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
      // NOTHING TOUCHES THE FLOW FIELD. A shield tower stands on rock the swarm
      // could never walk anyway, so raising one changes no route and costs
      // no Dijkstra — which is what makes a cap of twenty affordable
      this.pushFx(this.shieldTowers[idx].x, this.shieldTowers[idx].y, 0.7, FxKind.ShieldWave);
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
        // the dome pops the way a carrier's does — same effect, its own red
        this.pushFx(
          s.x, s.y, 0.5, FxKind.ShieldBreak,
          0, s.domeR * s.scale,
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
    // nothing to hand back and no lane to reopen: a shield tower stands on
    // FREE ROCK and only free rock (see trySpawnShieldTower), so it never
    // held a turret and the swarm's routes never knew it existed
    // a dead shield tower is no longer anyone's mark
    if (this.focusShieldTower === idx) this.focusShieldTower = -1;
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
  private damageTower(t: Structure, dmg: number): void {
    // PLATING, the way a body wears it (constants.ts TowerStats.armor): a
    // flat shave off this hit, floored at a tenth, through the same
    // applyArmor the swarm's armour goes through. It comes off AFTER the
    // unit-damage dial has scaled the hit, as Mindustry applies it to the
    // final amount. The core wears none — its pool is written on its own
    // (CORE_HP) and its fall is the run ending, not a structure dying
    if (!isCore(t)) dmg = Sim.applyArmor(dmg, t.spec.armor);
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
   * giant braced spectre comes back a giant braced spectre. What it is
   * handed back is the stand-ups it was BORN with (Tower.revivesMax), so
   * an Undying board arms the swarm with turrets that have to be killed
   * twice. What it never gets is the player's Phoenix roll (an unlimited
   * flip the RUN owns, held to the player's side in reviveTower), a share
   * of the player's later upgrades (refreshSpecs skips it), or its full
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
      // the same deferral every other structure change gets
      if (this.solveQueue.length > 0) this.abortSolves();
      this.fieldDirty = true;
      this.navalDirty = true;
      this.fieldQuiet = 0;
    }
    // it is nobody's to select or sell any more, and the count-dependent
    // rungs have one turret fewer to read
    this.selStructs.delete(t);
    this.refreshSpecs();
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
    } else if (t.team === "player" && this.mods.phoenix && Math.random() < PHOENIX_CHANCE) {
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
    if (this.mods.insurance) {
      this.scrap += INSURANCE_SCRAP;
      this.scrapEarned += INSURANCE_SCRAP;
      this.pushFx(t.x, t.y, 0.5, FxKind.Absorb);
    }
    if (this.mods.lastVolley) {
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
   * VOLATILE (mutation.ts): the dead body's parting blast, billed to every
   * standing tower whose footprint it reaches. Tier decides the damage and
   * the body's own hitbox widens the reach — a fortress pops like a shell,
   * a dagger like a firecracker. Towers only; the swarm never hurts itself.
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

  // ---------- the player's focus mark ----------

  /**
   * Mark one unit for focus fire: every turret in range drops what it was
   * doing for it (see fireTowers). The mark is a uid plus an index hint
   * maintained across swap-removes, exactly as the force-field carrier
   * list is — it dies with the unit and is never dangling.
   */
  setFocusUnit(idx: number): void {
    if (idx < 0 || idx >= this.n) return;
    this.focusUid = this.uid[idx];
    this.focusIdx = idx;
    this.focusShieldTower = -1;
    this.focusTower = null;
  }

  /** mark one shield tower for focus fire — same contract, the other kind */
  setFocusShieldTower(idx: number): void {
    if (idx < 0 || idx >= this.shieldTowers.length || this.shieldTowers[idx].hp <= 0) return;
    this.focusShieldTower = idx;
    this.focusUid = -1;
    this.focusIdx = -1;
    this.focusTower = null;
  }

  /**
   * ...and on one of the SWARM'S CONQUERED TURRETS (Conquest): the one way
   * a player can make the line drop a wave and take a lost emplacement
   * back down, since an unmarked building is only ever shot at by a turret
   * with nothing else to do (see fireTowers).
   */
  setFocusTower(t: Tower | null): void {
    if (!t || t.team !== "enemy" || this.cellTower[t.gy * COLS + t.gx] !== t) return;
    this.focusTower = t;
    this.focusUid = -1;
    this.focusIdx = -1;
    this.focusShieldTower = -1;
  }

  /** the SWARM's building under a world point, if one stands there —
   *  what a tap marks, and the mirror of towerAt */
  enemyTowerAt(px: number, py: number): Tower | null {
    if (this.enemyTowers === 0) return null;
    const t = this.structureAt(px, py, "enemy");
    return t && !isCore(t) ? t : null;
  }


  clearFocus(): void {
    this.focusUid = -1;
    this.focusIdx = -1;
    this.focusShieldTower = -1;
    this.focusTower = null;
  }

  /**
   * Where the focus mark should be drawn, in world px — the overlay's
   * arrow. `top` is above the target's art; null when nothing is marked
   * (or the marked unit has died since, which clears the mark for good).
   */
  focusMark(): { x: number; y: number; top: number } | null {
    if (this.focusTower) {
      const t = this.focusTower;
      // a building that came down is not a mark any more, and the cells
      // are what know: nothing else is holding this reference
      if (this.cellTower[t.gy * COLS + t.gx] !== t) {
        this.focusTower = null;
        return null;
      }
      return { x: t.x, y: t.y, top: t.y - (t.size * CELL) / 2 - 4 };
    }
    if (this.focusShieldTower >= 0) {
      const s = this.shieldTowers[this.focusShieldTower];
      if (!s || s.hp <= 0) return null;
      return { x: s.x, y: s.y, top: s.y - SHIELD_TOWER_SIZE * CELL * 0.75 };
    }
    if (this.focusIdx >= 0 && this.focusIdx < this.n && this.uid[this.focusIdx] === this.focusUid) {
      const i = this.focusIdx;
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
    const exact = this.structureAt(px, py);
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
   * on the other half of the selection. A ctrl- or double-click on a duo
   * takes every duo within reach of it, which is how a line of turrets is
   * upgraded or sold without clicking each one.
   *
   * "Like" is the KIND, so a duo gathers duos and a ripple ripples;
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
      // DAMAGE SMOKE, the units' own rule (updateStatus): under half its
      // pool a structure sheds soot, thicker the lower it gets, scaled by
      // its footprint so a spectre smokes like the building it is. The
      // tint has gone grey (renderer, HP_TINT); this is the other half
      // NANOWEAVE / BULWARK (mods.ts): a turret born with either repairs
      // itself, and it repairs at ITS OWN ceiling — a braced duo mends
      // faster than the plain one beside it because its pool is bigger
      if (t.regen > 0 && t.hp > 0 && t.hp < t.hpMax)
        t.hp = Math.min(t.hpMax, t.hp + t.regen * dt);
      // LAST VOLLEY (mods.ts): a dead neighbour's charge, running down
      if (t.boostT > 0) t.boostT -= dt;
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
      // a support block has no target and no barrel — it pulses (the
      // damage smoke above is still its, because it is still a building
      // the swarm can chew on). THE SWARM'S COPY PULSES NOTHING: a mender
      // mends a line, and the swarm has no line here to mend
      if (st.heal) {
        if (!hostile) this.updateMender(t, st, dt);
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
      // meltdown's cycle is 230 ticks of burning and only then 90 of
      // cooling. The beam is also what damages, every damageInterval
      const cont = st.bullet.continuous;
      if (cont && t.beamT >= 0) this.updateBeam(t, st, cont, dt);
      // LaserTurret.updateTile runs the reload only while `bullets` is
      // EMPTY, and the turret lets go of its beam at the end of
      // shootDuration — so the fade tail cools alongside the turret
      // ...at the TOWER'S rate, which is 1 for everything except a turret
      // the Hydrophobic rule has waterlogged (mutation.ts)
      // ...times a dying neighbour's parting charge, if one is running
      const rate = t.fireRate * (t.boostT > 0 ? LAST_VOLLEY_RATE : 1);
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
      // squared distance; foreshadow's `strongest` is documented on
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
      } else if (this.focusIdx >= 0 && this.uid[this.focusIdx] === this.focusUid) {
        // THE PLAYER'S MARK FIRST (setFocusUnit / setFocusShieldTower /
        // setFocusTower): a tapped target overrides both the held target
        // and the scan for every turret that can reach it. At most one of
        // the three kinds is ever set
        const fi = this.focusIdx;
        if (this.ufly[fi] !== 0 ? st.targetAir : st.targetGround) {
          const dx = upx[fi] - t.x, dy = upy[fi] - t.y;
          if (dx * dx + dy * dy < r2t) best = fi;
        }
      } else if (this.focusShieldTower >= 0 && st.targetGround) {
        const s = this.shieldTowers[this.focusShieldTower];
        if (s && s.hp > 0) {
          const dx = s.x - t.x, dy = s.y - t.y;
          if (dx * dx + dy * dy < r2t) shr = s;
        }
      } else if (this.focusTower && st.targetGround) {
        // ...and the third kind of mark: a CONQUERED TURRET the player has
        // tapped (setFocusTower). It overrides the scan exactly as a
        // tapped body does, which is the one way a line can be made to
        // drop a wave and take its own turret back down mid-fight
        const ft = this.focusTower;
        if (this.cellTower[ft.gy * COLS + ft.gx] === ft && this.inReach(ft, t.x, t.y, st.range))
          aimT = ft;
      }
      if (!hostile && best < 0 && !shr && !aimT) {
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
            ? this.bestTarget(t.x, t.y, st.range, st.targetAir, st.targetGround, st.sort === "strongest")
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
        // between waves and never mid-wave DPS — and the player can always
        // force it with the focus mark above. The held building is kept
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
      // whole charge, so a lancer commits to where it was aiming rather
      // than tracking through the two thirds of a second it takes to fire
      if (t.chargeT < 0) {
        const diff = Sim.angleDiff(t.angle, targetRot);
        // LaserTurret.turnToTarget: firingMoveFract while the beam is
        // HELD (not while it fades), so meltdown tracks a crossing target
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
          // anything at all — dropped, a winding-up lancer reads as stalled
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



  private bestTarget(
    x: number,
    y: number,
    range: number,
    air: boolean,
    ground: boolean,
    strongest: boolean,
  ): number {
    const { upx, upy, uhp, ufly } = this;
    const n = this.n;
    const r2 = range * range;
    const score = (i: number, d2: number): number =>
      strongest ? -uhp[i] + d2 * 1e-9 : d2;
    let best = -1, bs = Infinity;
    // a short field is cheaper to walk directly than through the buckets
    if (n <= 128) {
      for (let i = 0; i < n; i++) {
        if (ufly[i] !== 0 ? !air : !ground) continue;
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
      for (let k = bStart[row + hx0]; k < e; k++) {
        const i = bUnits[k];
        if (i >= n) continue;
        if (ufly[i] !== 0 ? !air : !ground) continue;
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
   * offset and the per-shot inaccuracy. Hitscan rays (fuse shrapnel) damage
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
    t.shotCount++;
    // BulletType.shootEffect and smokeEffect, both fired at the muzzle
    // along the shot's angle. For scorch the pair IS the weapon: the
    // bullet itself draws nothing at all
    this.bulletFx(st.bullet.shootFx, x, y, a, st.bullet.fxColor);
    this.bulletFx(st.bullet.smokeFx, x, y, a, st.bullet.fxColor);
    // aimed at a shield tower, the INSTANT weapons hand their damage straight to
    // it — the sweeps behind laser/lightning/rail/ray know only the unit
    // arrays. Projectile weapons need nothing here: their shots really fly,
    // and the shield tower's dome and body collide them like anything else
    const shrT = t.aimShieldTower >= 0 ? this.shieldTowers[t.aimShieldTower] : null;
    // ...and the same for a BUILDING either side is aiming at (Tower.aimTower)
    const aimT = t.aimTower;
    const hitAimed = (): void => {
      if (shrT) this.shieldTowerHit(shrT, st.bullet.damage, st.bullet.hitFx, a, st.bullet.fxColor);
      if (aimT) this.structureHit(aimT, st.bullet.damage, st.bullet.hitFx, a, st.bullet.fxColor);
    };
    // THE SWARM'S OWN INSTANT WEAPONS SWEEP NOTHING (Conquest): every
    // sweep below walks the swarm's BODIES, and a conquered turret has
    // none to walk. Its shot is the building it was aimed at, plus the
    // same shape on screen — the bolt, the beam, the rail's trail, the
    // ray — at the weapon's own length, so a taken lancer still visibly
    // fires a lancer's beam
    const hostile = t.team === "enemy";
    if (st.bullet.lightning) {
      if (hostile) {
        this.unitBolt(x, y, a, st.bullet.lightning.length, st.bullet.fxColor ?? PAL.lancerLaser);
        hitAimed();
        return;
      }
      const pts = this.lightningBolt(
        x, y, a,
        st.bullet.damage,
        st.bullet.lightning.length,
        st.bullet.hitRadius ?? 2.5,
        st.bullet.collidesAir,
        st.bullet.collidesGround,
        st.bullet.hitFx,
        st.bullet.fxColor,
      );
      this.pushBolt(x, y, st.bullet.lifetime, pts, true); // the bolt IS arc's shot
      hitAimed();
      return;
    }
    if (st.bullet.laser) {
      const reached = hostile
        ? st.bullet.laser.length
        : this.laserBeam(
            x, y, a,
            st.bullet.laser.length,
            st.bullet.damage,
            st.bullet.laser.pierceCap,
            st.bullet.armorMultiplier ?? 1,
            st.bullet.collidesAir,
            st.bullet.collidesGround,
            st.bullet.hitFx,
            st.bullet.fxColor,
          );
      // forced: the beam is lancer's entire visible shot (damage is instant)
      this.pushFx(x, y, st.bullet.lifetime, FxKind.Laser, a, reached, 0, 0, true);
      hitAimed();
      return;
    }
    if (st.bullet.rail) {
      if (hostile) {
        // the line the player's rail draws, without the sweep behind it
        const spec = st.bullet.rail;
        if (st.bullet.pointFx !== undefined)
          for (let d = 0; d <= spec.length; d += spec.pointSpacing)
            this.bulletFx(st.bullet.pointFx, x + cos * d, y + sin * d, a, st.bullet.fxColor, true);
        this.bulletFx(st.bullet.despawnFx, x, y, a, st.bullet.fxColor, true);
      } else this.railShot(x, y, a, st.bullet);
      hitAimed();
      return;
    }
    if (st.bullet.ray) {
      if (!hostile)
        this.hitscanRay(
          x,
          y,
          a,
          st.bullet.ray.length,
          st.bullet.damage,
          st.bullet.collidesAir,
          st.bullet.collidesGround,
          st.bullet.hitFx,
          st.bullet.fxColor,
        );
      // forced: the ray is fuse's entire visible shot (damage is instant)
      this.pushFx(x, y, st.bullet.lifetime, FxKind.Shrapnel, a, st.bullet.ray.length, 0, 0, true);
      hitAimed();
      return;
    }
    // Mindustry scaleLife (Turret.java): an artillery shell's lifetime
    // shrinks to the MUZZLE's distance from the predicted impact, scaled
    // against the BULLET's own reach (speed x lifetime) rather than the
    // turret's range — the two differ, and dividing by the shorter turret
    // range stretched every shell past its aim point
    let life = st.bullet.lifetime;
    if (st.bullet.artillery) {
      const reach = st.bullet.speed * st.bullet.lifetime;
      // scaleLifetimeOffset overshoots the aim point by a fraction, and
      // minRange is the FLOOR on the scale — a shell aimed inside it
      // overflies rather than landing short
      const off = st.lifeScaleOffset ?? 0;
      const lo = (st.minRange ?? 0) / reach;
      life *=
        clamp(((1 + off) * Math.hypot(t.aimX - x, t.aimY - y)) / reach, lo, st.range / reach);
    }
    // lifeScaleRandMin/Max and velocityRnd: the two rolls that turn a
    // ripple's four shells from one hole into a pattern down the lane
    const lr = st.bullet.lifeScaleRand;
    if (lr) life *= lr[0] + Math.random() * (lr[1] - lr[0]);
    const vr = st.velocityRnd ?? 0;
    const speed = st.bullet.speed * (vr > 0 ? 1 - vr + Math.random() * vr : 1);
    this.projs.push({
      kind: t.kind,
      x,
      y,
      vx: cos * speed,
      vy: sin * speed,
      life,
      age: 0,
      primeT: -1,
      flakT: st.bullet.flak ? st.bullet.flak.interval : 0,
      pierced: st.bullet.pierce ? [] : null,
      trailT: 0,
      frag: false,
      // a shot of the swarm's flies past every body and lands on the
      // player's buildings instead (stepHostileProjectile)
      enemy: hostile,
    });
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
  private stepHostileProjectile(pr: Projectile, b: BulletStats, dt: number): boolean {
    pr.x += pr.vx * dt;
    pr.y += pr.vy * dt;
    pr.life -= dt;
    pr.age += dt;
    // the trails are the shot's own look and belong to whoever fired it
    if (b.puff && Math.random() < b.puff.chance * dt)
      this.pushTrail(pr.x, pr.y, b.puff.size, b.sprite?.back);
    if (b.trail) {
      const fin = pr.age / (pr.age + pr.life);
      const slope = 1 - Math.abs(fin - 0.5) * 2;
      pr.trailT += dt;
      const every = ((3 + slope * 2) * b.trail.mult) / 60;
      if (pr.trailT >= every) {
        pr.trailT = 0;
        this.pushTrail(pr.x, pr.y, slope * b.trail.size, b.sprite?.back);
      }
    }
    const off = pr.x < 0 || pr.y < 0 || pr.x >= W || pr.y >= H;
    let dead = pr.life <= 0 || off;
    const rot = Math.atan2(pr.vy, pr.vx);
    if (!dead && !b.artillery) {
      const s = this.structureAt(pr.x, pr.y, "player");
      if (s) {
        // through the swarm's own damage dial, exactly as its bodies' shots
        this.hitStructure(s, b.damage);
        if (b.splash <= 0) this.bulletFx(b.hitFx, pr.x, pr.y, rot, b.fxColor);
        dead = true;
      }
    }
    if (!dead) return false;
    if (!off) {
      if (b.splash > 0) {
        this.bulletFx(b.hitFx, pr.x, pr.y, rot, b.fxColor, false,
          b.hitFx === FxKind.WaterBurst ? b.splashRadius : 0);
        this.bulletFx(b.hitFx2, pr.x, pr.y, rot, b.fxColor, false,
          b.hitFx2 === FxKind.WaterBurst ? b.splashRadius : 0);
        // the blast takes the player's buildings and nothing else: the
        // swarm's shell never chips the swarm's own turret, and it has no
        // bodies of the player's to catch
        this.splashStructures(pr.x, pr.y, b.splash, b.splashRadius);
      }
      if (pr.life <= 0) this.bulletFx(b.despawnFx, pr.x, pr.y, rot, b.fxColor);
      if (b.frag) this.createFrags(pr, b.frag);
    }
    return true;
  }

  /**
   * Mindustry BulletType.createFrags: where a fragmenting shot dies it
   * throws `count` children, each on a bearing drawn uniformly from the
   * full `spread` cone around the parent's heading, at a random fraction
   * of the CHILD's own speed and starting a random offset out from the
   * blast. Cyclone's six plastanium fragments are the only user, and they
   * are what turns one shell into a wall.
   */
  private createFrags(pr: Projectile, spec: NonNullable<BulletStats["frag"]>): void {
    const rot = Math.atan2(pr.vy, pr.vx);
    const child = spec.bullet;
    for (let i = 0; i < spec.count; i++) {
      const off = spec.offsetMin + Math.random() * (spec.offsetMax - spec.offsetMin);
      const a = rot + (Math.random() - 0.5) * spec.spread;
      const v = child.speed * (spec.velMin + Math.random() * (spec.velMax - spec.velMin));
      const cos = Math.cos(a), sin = Math.sin(a);
      this.projs.push({
        kind: pr.kind,
        x: pr.x + cos * off,
        y: pr.y + sin * off,
        vx: cos * v,
        vy: sin * v,
        life: child.lifetime,
        age: 0,
        primeT: -1,
        flakT: 0,
        pierced: child.pierce ? [] : null,
        trailT: 0,
        frag: true,
        // fragments belong to whoever threw the parent
        enemy: pr.enemy,
      });
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
  private railShot(x: number, y: number, angle: number, b: BulletStats): void {
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
      this.damageUnit(i, left);
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
      for (let k = bStart[row + hx0]; k < e; k++) {
        const i = bUnits[k];
        if (i >= this.n || uhp[i] <= 0) continue;
        if (KIND_FLYING[ukind[i]] ? !air : !ground) continue;
        // distance from the unit to the ray segment
        const tt = clamp((upx[i] - x) * dirx + (upy[i] - y) * diry, 0, length);
        const dx = upx[i] - (x + dirx * tt), dy = upy[i] - (y + diry * tt);
        const rr = urad[i] + EXPAND;
        if (dx * dx + dy * dy < rr * rr) splashHits.push(i);
      }
    }
    for (const i of splashHits) {
      this.damageUnit(i, dmg);
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
      for (let k = bStart[row + hx0]; k < e; k++) {
        const i = bUnits[k];
        if (i >= this.n || uhp[i] <= 0) continue;
        if (KIND_FLYING[ukind[i]] ? !air : !ground) continue;
        const dx = upx[i] - x, dy = upy[i] - y;
        const d2 = dx * dx + dy * dy;
        const rr = urad[i] + brad;
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
      for (let k = bStart[row + hx0]; k < e; k++) {
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
   * the same push all but stops a dagger and barely leans on a fortress.
   */
  private impulse(i: number, wx: number, wy: number): void {
    const hitSize = (this.urad[i] * 2) / MU;
    const mass = hitSize * hitSize * Math.PI;
    // world units per tick -> px per second
    const k = (MU * 60) / mass;
    this.upullx[i] += wx * k;
    this.upully[i] += wy * k;
  }

  /**
   * Mindustry Lightning.createLightningInternal, ported whole: arc's shot
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
   * bullet is absorbable — a quasar's force field standing over a node
   * would eat it. Here the node damages directly and no field sees it, so
   * a bolt walks through a bubble it should have died in. Arc is a
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
      // the node's own bullet, which is where every point of arc's damage
      // is actually dealt
      const victim = this.nearestUnit(x, y, brad, air, ground);
      if (victim >= 0) {
        this.damageUnit(victim, damage);
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
          for (let k = bStart[row + hx0]; k < e; k++) {
            const j = bUnits[k];
            if (j >= this.n || uhp[j] <= 0 || chained.has(this.uid[j])) continue;
            if (KIND_FLYING[ukind[j]] ? !air : !ground) continue;
            const dx = upx[j] - x, dy = upy[j] - y;
            const reach = half + urad[j]; // Rect vs hitbox, not a circle
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
   * Mindustry Damage.collideLaser, the lancer's whole shot: an instant beam
   * that pierces a FIXED NUMBER of units and stops.
   *
   * Two passes, exactly as the original: findPierceLength collects every
   * eligible unit the segment crosses and, if there are more of them than
   * the cap, shortens the beam to the cap'th nearest; collideLine then
   * damages that many, nearest first. Returns the length the beam reached,
   * which is what gets drawn — a lancer firing into a crowd is visibly
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
    air: boolean,
    ground: boolean,
    hitFx: BulletFx | undefined,
    fxColor: RGB | undefined,
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
      this.damageUnit(i, damage, false, armorMult);
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
      for (let k = bStart[row + hx0]; k < e; k++) {
        const i = bUnits[k];
        if (i >= this.n || uhp[i] <= 0) continue;
        if (KIND_FLYING[ukind[i]] ? !air : !ground) continue;
        const tt = clamp((upx[i] - x) * dirx + (upy[i] - y) * diry, 0, length);
        const dx = upx[i] - (x + dirx * tt), dy = upy[i] - (y + diry * tt);
        const rr = urad[i] + EXPAND;
        if (dx * dx + dy * dy < rr * rr) {
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
        this.damageUnit(i, b.damage, b.pierceArmor ?? false, b.armorMultiplier ?? 1);
        if (uhp[i] > 0) this.bulletFx(b.hitFx, upx[i], upy[i], t.beamRot, b.fxColor);
        else dead.push(i);
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
      // damage a conquered meltdown ever does: the sweep above walks the
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
   * mender or a mend projector returns `heal.percent` of their OWN pool to
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
   * Hydrophobic rule slows a waterlogged mender exactly as it slows a
   * waterlogged duo.
   */
  private updateMender(t: Tower, st: TowerStats, dt: number): void {
    if (t.cd > 0) {
      t.cd -= dt * t.fireRate;
      return;
    }
    t.cd = st.reload;
    const r2 = st.range * st.range;
    let did = false;
    for (const o of this.towers) {
      if (o.team !== "player") continue; // nothing of the player's mends the swarm's
      // the TARGET's own ceiling (Tower.hpMax), not its kind's: a mender
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
    // see what a mender actually covers without selecting it. Only when
    // something took: a mender over an untouched line is quiet
    if (did) this.pushFxCol(t.x, t.y, 22 / 60, FxKind.HealWave, 0, st.range, PAL.heal);
  }

  /**
   * THE LOCK BEAM (BulletStats.lock, parallax and nothing else). No
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
   * WHICH BODY IT PICKS is foreshadow's rule (TowerStats.sort
   * "strongest"): the highest CURRENT health in range, because the one
   * thing a ramp cannot afford is to spend its climb on a crawler. And it
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

    // THE PLAYER'S MARK FIRST, exactly as the volley path takes it: a
    // tapped body overrides both the held lock and the scan for every
    // turret that can reach it
    let best = -1;
    if (this.focusIdx >= 0 && this.uid[this.focusIdx] === this.focusUid) {
      const fi = this.focusIdx;
      if (ufly[fi] !== 0 ? st.targetAir : st.targetGround) {
        const dx = upx[fi] - t.x, dy = upy[fi] - t.y;
        if (dx * dx + dy * dy < r2) best = fi;
      }
    }
    // the held lock, revalidated against the uid the index hint claims —
    // alive, and still within reach counted from its EDGE, so a wide body
    // sliding out is not dropped a moment before it visibly leaves
    if (best < 0 && t.target >= 0 && t.targetIdx >= 0 && t.targetIdx < this.n &&
        this.uid[t.targetIdx] === t.target) {
      const i = t.targetIdx;
      if (ufly[i] !== 0 ? st.targetAir : st.targetGround) {
        const dx = upx[i] - t.x, dy = upy[i] - t.y;
        const reach = st.range + urad[i];
        if (dx * dx + dy * dy <= reach * reach) best = i;
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
        ? this.bestTarget(t.x, t.y, st.range, st.targetAir, st.targetGround, st.sort === "strongest")
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
    // the spool rides on top of it: a cold beam is drawn at a third of its
    // width and a fully spooled one at all of it
    const ease = 1 - Math.pow(1 - 0.1, dt * 60);
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
    t.beamStr += (0.35 + 0.65 * frac - t.beamStr) * ease;
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
    this.damageUnit(best, dmg, st.bullet.pierceArmor ?? false);
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
   * it, and scorch and the liquid turrets covering one lane fight each
   * other for the status slot exactly as they do upstream.
   */
  private applyBurn(i: number, duration: number): void {
    if (this.uwet[i] > 0) {
      this.uwet[i] -= duration * 0.5;
      if (this.uwet[i] > 0) return; // still soaked: the flame was spent drying it
      this.uwet[i] = 0;
      this.uwetSlow[i] = 1;
    }
    this.uburn[i] = duration;
  }

  /**
   * The wet half of the pair, plus the one rule opposite() cannot supply:
   * WHICH water wins. Mindustry keeps one status entry and re-times it;
   * our wet carries a per-ammo slow, so the strongest slow in force holds
   * the entry — a tsunami soaking cannot be watered down by a wave
   * droplet, while an equal or deeper soak re-times freely.
   */
  private applyWet(i: number, spec: { duration: number; slow: number }): void {
    if (this.uburn[i] > 0) {
      this.uburn[i] -= spec.duration * 0.5;
      if (this.uburn[i] > 0) return; // still alight: the water was spent quenching
      this.uburn[i] = 0;
    }
    // SPEEDY (mutation.ts) is immunity to the SLOW, not to the status. The
    // soak still lands, still tints, still puts a fire out and still
    // carries whatever the ammunition does — it is simply worth a
    // multiplier of 1, so every "strongest slow wins" comparison below and
    // every drive read in updateUnits behaves exactly as it does on a dry
    // unit. Refusing the status outright would have deleted the
    // fire-dousing rule with it, which is not what the card promises.
    const slow = this.speedyOn ? 1 : spec.slow;
    if (this.uwet[i] > 0 && slow > this.uwetSlow[i]) return;
    this.uwet[i] = spec.duration;
    this.uwetSlow[i] = slow;
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
   * damage, so a lancer's 4 means armour counts quadruple against it and
   * the same beam is worth far less to a fortress than to a dagger.
   */
  private damageUnit(
    i: number,
    raw: number,
    pierceArmor = false,
    armorMult = 1,
  ): void {
    // StatusEffects.invincible, healthMultiplier infinity: every hit lands
    // on a unit still arriving for exactly nothing. It runs a full second,
    // half of it after the unit has started walking
    if (this.uspawn[i] > 0) return;
    let amount = pierceArmor ? raw : Sim.applyArmor(raw, this.uarmor[i] * armorMult);
    if (this.ushield[i] > 0.0001) {
      this.ushieldAlpha[i] = 1;
      const soaked = Math.min(this.ushield[i], amount);
      this.ushield[i] -= soaked;
      amount -= soaked;
    }
    if (amount > 0) this.uhp[i] -= amount;
  }

  /**
   * Gather the force fields standing this tick. Skipped outright unless a
   * carrier kind is actually alive, so the scan only costs anything in the
   * waves that field one.
   */
  private collectForceFields(): void {
    this.fldN = 0;
    if (this.projs.length === 0) return;
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
  }

  /**
   * ForceFieldAbility's shieldConsumer: a shot whose position falls inside
   * a standing bubble is deleted outright and its damage billed to the
   * carrier's pool. Absorption happens the moment the shot is inside the
   * outline, before it can reach anything sheltering there, and an absorbed
   * bullet never splashes (BulletType.despawned skips the blast on
   * `b.absorbed`) — the blast dies with the shell.
   *
   * Only `absorbable` bullets are eaten. Fuse is the exception on this
   * roster and needs no flag: its ShrapnelBulletType sets absorbable=false
   * AND deals its damage as an instant ray at the muzzle, so it never
   * becomes a projectile here at all and rakes straight through a field.
   */
  private absorb(px: number, py: number, damage: number): boolean {
    const { upx, upy, ushield, ushieldAlpha, ukind, fldI } = this;
    for (let f = 0; f < this.fldN; f++) {
      const i = fldI[f];
      const spec = KIND_FORCE[ukind[i]]!;
      const rad = spec.radius * this.uforceScale[i];
      const dx = px - upx[i], dy = py - upy[i];
      // the field is a circle, drawn and tested alike (Renderer draws it
      // off the same disc the shield towers' domes use)
      if (dx * dx + dy * dy > rad * rad) continue;
      // Bullet.type.shieldDamage: the shot's damage, shieldDamageMultiplier 1
      ushield[i] -= damage;
      ushieldAlpha[i] = 1;
      this.pushFx(px, py, 12 / 60, FxKind.Absorb);
      return true;
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
        this.pushFx(px, py, 12 / 60, FxKind.Absorb);
        return true;
      }
    }
    return false;
  }

  private updateProjectiles(dt: number): void {
    const { upx, upy, uhp, uarmor, urad, projs, bStart, bUnits } = this;
    this.collectForceFields();
    for (let p = projs.length - 1; p >= 0; p--) {
      const pr = projs[p];
      const b = this.bulletFor(pr.kind, pr.frag);
      // A SHOT OF THE SWARM'S (Conquest) runs its own, much shorter step:
      // it flies past every body and lands on the player's buildings, by
      // the cell it is over — the enemy shots' rule (updateEnemyShots) on
      // a turret's own bullet
      if (pr.enemy) {
        if (this.stepHostileProjectile(pr, b, dt)) {
          projs[p] = projs[projs.length - 1];
          projs.pop();
        }
        continue;
      }
      // BulletType.updateHoming, BEFORE the step: the shot picks the
      // nearest target within homingRange OF ITSELF and swings toward it,
      // re-picking every tick — so a missile whose mark dies latches onto
      // whatever it passes next instead of flying on into the ground.
      // The swarm's missile homes on nothing: its marks are buildings
      if (b.homing) {
        const tgt = this.nearestInRange(pr.x, pr.y, b.homing.range, b.collidesAir, b.collidesGround);
        if (tgt >= 0) {
          const want = Math.atan2(upy[tgt] - pr.y, upx[tgt] - pr.x);
          const cur = Math.atan2(pr.vy, pr.vx);
          const diff = Sim.angleDiff(cur, want);
          const turn = b.homing.power * dt;
          const a = Math.abs(diff) <= turn ? want : cur + Math.sign(diff) * turn;
          // Vec2.setAngle keeps the speed and turns the heading
          const sp = Math.sqrt(pr.vx * pr.vx + pr.vy * pr.vy);
          pr.vx = Math.cos(a) * sp;
          pr.vy = Math.sin(a) * sp;
        }
      }
      pr.x += pr.vx * dt;
      pr.y += pr.vy * dt;
      pr.life -= dt;
      pr.age += dt;

      // BulletType.updateTrailEffects: a puff on a per-tick CHANCE, at a
      // constant radius — Fx.missileTrail, which is Fx.artilleryTrail's
      // fading disc under another name, so it rides the same pass
      if (b.puff && Math.random() < b.puff.chance * dt)
        this.pushTrail(pr.x, pr.y, b.puff.size, b.sprite?.back);

      // ArtilleryBulletType.update: a puff every (3 + fslope*2) * mult
      // ticks, at a radius of fslope * size. fslope peaks at half life, so
      // the trail is both fastest and fattest at the top of the arc and
      // thins away at both ends — which is the whole illusion of height
      if (b.trail) {
        const fin = pr.age / (pr.age + pr.life);
        const slope = 1 - Math.abs(fin - 0.5) * 2;
        pr.trailT += dt;
        const every = ((3 + slope * 2) * b.trail.mult) / 60;
        if (pr.trailT >= every) {
          pr.trailT = 0;
          this.pushTrail(pr.x, pr.y, slope * b.trail.size, b.sprite?.back);
        }
      }

      // a force field eats the shot where it stands: no hit, no splash —
      // and a shield tower's dome the same way (domesUp gates its half of the
      // sweep the way fldN gates the carriers')
      if ((this.fldN > 0 || this.domesUp) && this.absorb(pr.x, pr.y, b.damage)) {
        projs[p] = projs[projs.length - 1];
        projs.pop();
        continue;
      }

      // flak proximity fuse: check every interval; an enemy inside
      // explodeRange (+ its hitbox) primes the shell, which detonates
      // explodeDelay later while continuing to fly
      if (b.flak && pr.primeT < 0) {
        pr.flakT -= dt;
        if (pr.flakT <= 0) {
          pr.flakT += b.flak.interval;
          if (this.anyUnitWithin(pr.x, pr.y, b.flak.explodeRange, b.collidesAir, b.collidesGround)) {
            pr.primeT = b.flak.explodeDelay;
          }
        }
      }
      if (pr.primeT >= 0) {
        pr.primeT -= dt;
        if (pr.primeT <= 0) pr.life = 0;
      }

      // shots come from elevated towers and arc over terrain — they never
      // collide with rock, only with units or their range-capped life.
      // Artillery shells overfly units too: they only die on target, where
      // the splash below is their whole damage
      let dead = pr.life <= 0;
      if (!dead && !b.artillery) {
        const brad = b.hitRadius ?? 2.5;
        // the static HIT_SPAN/FRAG_SPAN bound, shrunk to the LIVE largest
        // hitbox on the layers this bullet can touch — same hits, fewer
        // buckets walked in the waves that field no heavy
        const sp = Math.max(
          1,
          Math.ceil((this.rmaxAliveFor(b.collidesAir, b.collidesGround) + brad) / HC),
        );
        const hx = clamp((pr.x / HC) | 0, 0, HCOLS - 1);
        const hy = clamp((pr.y / HC) | 0, 0, HROWS - 1);
        // a piercing shot may hit several units this tick and outlive them
        // all, so its victims are gathered first and removed afterwards
        // from the highest index down — a swap-remove mid-scan would drag
        // an unvisited unit into a bucket we have already walked past
        const hits = this.splashHits;
        hits.length = 0;
        const cx0 = Math.max(0, hx - sp), cx1 = Math.min(HCOLS - 1, hx + sp);
        outer: for (let cy = Math.max(0, hy - sp); cy <= Math.min(HROWS - 1, hy + sp); cy++) {
          const row = cy * HCOLS;
          const e = bStart[row + cx1 + 1];
          for (let k = bStart[row + cx0]; k < e; k++) {
            const i = bUnits[k];
            if (i >= this.n || uhp[i] <= 0) continue;
            if (this.ufly[i] !== 0 ? !b.collidesAir : !b.collidesGround) continue;
            // Bullet.collides: a pierce shot skips whoever it already hit
            if (pr.pierced && pr.pierced.includes(this.uid[i])) continue;
            const dx = upx[i] - pr.x, dy = upy[i] - pr.y;
            const hr = urad[i] + brad;
            if (dx * dx + dy * dy < hr * hr) {
              hits.push(i);
              // Bullet.collision: a plain shot is spent on the first hit,
              // a piercing one is only added to `collided` and flies on
              if (!pr.pierced) {
                dead = true;
                break outer;
              }
              pr.pierced.push(this.uid[i]);
              // Mindustry pierceCap: a capped pierce is SPENT once it
              // has been through that many bodies, rather than running
              // its whole lifetime
              if (b.pierceCap !== undefined && pr.pierced.length >= b.pierceCap) {
                dead = true;
                break outer;
              }
            }
          }
        }
        for (const i of hits) {
          this.damageUnit(i, b.damage);
          // BulletType.hitEntity: an impulse of knockback * 80 world units
          // straight out from the shot. Unit.impulse divides by mass, so
          // the same shove all but stops a dagger and leans on a fortress
          if (b.knockback) {
            const dx = upx[i] - pr.x, dy = upy[i] - pr.y;
            const d = Math.sqrt(dx * dx + dy * dy) || 1;
            const mag = b.knockback * 80;
            this.impulse(i, (dx / d) * mag, (dy / d) * mag);
          }
          if (uhp[i] > 0 && b.burn && !KIND_BURN_IMMUNE[this.ukind[i]]) this.applyBurn(i, b.burn);
          if (uhp[i] > 0 && b.wet && !KIND_WET_IMMUNE[this.ukind[i]]) this.applyWet(i, b.wet);
          // BulletType.hitEffect, at the bullet rather than the victim.
          // A splash shot skips it — the blast in the `dead` branch below
          // is its hit effect — and so does a killing blow, whose death
          // puff would only be buried under it
          if (uhp[i] > 0 && b.splash <= 0)
            this.bulletFx(b.hitFx, pr.x, pr.y, Math.atan2(pr.vy, pr.vx), b.fxColor);
        }
        hits.sort((a2, b2) => b2 - a2);
        for (const i of hits) if (uhp[i] <= 0) this.killUnit(i);
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
            if (pr.pierced && pr.pierced.includes(sid)) continue;
            const sdx = s.x - pr.x, sdy = s.y - pr.y;
            const hr = SHIELD_TOWER_BODY_R + brad;
            if (sdx * sdx + sdy * sdy >= hr * hr) continue;
            this.damageShieldTower(s, b.damage);
            this.bulletFx(b.hitFx, pr.x, pr.y, Math.atan2(pr.vy, pr.vx), b.fxColor);
            if (!pr.pierced) {
              dead = true;
              break;
            }
            pr.pierced.push(sid);
            if (b.pierceCap !== undefined && pr.pierced.length >= b.pierceCap) {
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
          const es = this.structureAt(pr.x, pr.y, "enemy");
          if (es) {
            const sid = -1000000 - (es.gy * COLS + es.gx);
            if (!pr.pierced || !pr.pierced.includes(sid)) {
              this.damageTower(es, b.damage);
              if (b.splash <= 0)
                this.bulletFx(b.hitFx, pr.x, pr.y, Math.atan2(pr.vy, pr.vx), b.fxColor);
              if (!pr.pierced) dead = true;
              else {
                pr.pierced.push(sid);
                if (b.pierceCap !== undefined && pr.pierced.length >= b.pierceCap) dead = true;
              }
            }
          }
        }
      }
      if (dead) {
        const rot = Math.atan2(pr.vy, pr.vx);
        // BulletType.hit: the blast, and the hit effect a splash bullet
        // saves for it rather than firing per victim above. Mindustry gives
        // every splash bullet despawnHit, so a shell that simply runs out
        // of lifetime blasts exactly as one that ran into something
        if (b.splash > 0) {
          // ONLY the water burst is told how far the blast reached. Every
          // other hit effect — a flak pop, a shockwave ring — carries its
          // own fixed Mindustry size, and handing them a radius here would
          // quietly resize effects that have drawn the same for every
          // turret that shipped before this one
          this.bulletFx(b.hitFx, pr.x, pr.y, rot, b.fxColor, false,
            b.hitFx === FxKind.WaterBurst ? b.splashRadius : 0);
          this.bulletFx(b.hitFx2, pr.x, pr.y, rot, b.fxColor, false,
            b.hitFx2 === FxKind.WaterBurst ? b.splashRadius : 0);
          this.splash(
            pr.x,
            pr.y,
            b.splashRadius,
            b.splash,
            b.collidesAir,
            b.collidesGround,
            b.burn,
            b.wet,
          );
        }
        // BulletType.despawned, and only that: a shot spent on a direct
        // hit was removed, not despawned, and leaves nothing behind
        if (pr.life <= 0) this.bulletFx(b.despawnFx, pr.x, pr.y, rot, b.fxColor);
        // BulletType.hit -> createFrags: the burst that makes a cyclone
        // shell a wall rather than a point. Fired here, at the end, so a
        // fragment is never walked by the loop it was born in
        if (b.frag) this.createFrags(pr, b.frag);
        projs[p] = projs[projs.length - 1];
        projs.pop();
      }
    }
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
      for (let k = bStart[row + hx0]; k < e; k++) {
        const i = bUnits[k];
        if (i >= this.n || uhp[i] <= 0) continue;
        if (KIND_FLYING[ukind[i]] ? !air : !ground) continue;
        const dx = upx[i] - x, dy = upy[i] - y;
        const rr = r + urad[i];
        if (dx * dx + dy * dy < rr * rr) return true;
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
      for (let k = bStart[row + hx0]; k < e; k++) {
        const i = bUnits[k];
        if (i >= this.n || uhp[i] <= 0) continue;
        if (KIND_FLYING[ukind[i]] ? !air : !ground) continue;
        const dx = upx[i] - x, dy = upy[i] - y;
        const rr = radius + urad[i];
        if (dx * dx + dy * dy < rr * rr) splashHits.push(i);
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
      this.damageUnit(i, raw);
      // the status lands on what SURVIVED the blast, exactly as it does on
      // a direct hit — lighting a corpse is a fire nobody sees
      if (uhp[i] > 0) {
        if (burn && !KIND_BURN_IMMUNE[ukind[i]]) this.applyBurn(i, burn);
        if (wet && !KIND_WET_IMMUNE[ukind[i]]) this.applyWet(i, wet);
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
    if (i >= FX_MAX) return -1;
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
   * fuse's shrapnel ray, lancer's beam and charge glow, arc's bolt, the
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
   */
  private bulletFx(
    kind: BulletFx | undefined,
    x: number,
    y: number,
    rot: number,
    col?: RGB,
    force = false,
    len = 0,
  ): void {
    // refuse before rolling the seed, so a capped board — or one with the
    // effects switched off (see setEffects) — leaves the random stream
    // exactly where the old object push left it
    if (kind === undefined) return;
    if (!force && (!this.fxOn || this.fxN >= FX_CAP)) return;
    if (this.fxN >= FX_MAX) return;
    const i = this.pushSlot(
      x, y, FX_LIFE[kind], kind, rot, len, (Math.random() * 0x7fffffff) | 0, 0, force,
    );
    if (i >= 0 && col) {
      this.fxHasCol[i] = 1;
      this.fxColR[i] = col[0];
      this.fxColG[i] = col[1];
      this.fxColB[i] = col[2];
    }
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
