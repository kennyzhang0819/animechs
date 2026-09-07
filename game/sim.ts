import {
  BASE,
  LAYER_BIT,
  MOVE_LAYERS,
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
  ROWS as ROWS_IMPORT,
  TOWERS as TOWERS_IMPORT,
  towerMaxHp,
  UR,
  W as W_IMPORT,
  WALL_R as WALL_R_IMPORT,
  type BulletFx,
  type BulletStats,
  type TowerStats,
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
import { FlowField, type Vec2 } from "./flowfield";
import {
  WORLDS,
  UNIT_ID,
  UNIT_KINDS as UNIT_KINDS_IMPORT,
  UNIT_RMAX,
  UNIT_RMAX_AIR,
  UNIT_RMAX_GROUND,
  UNIT_STATS,
  missionLives,
  unitDrop,
  waveGroups,
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
  MITOSIS_BROOD,
  MITOSIS_SPREAD,
  MITOSIS_TRIES,
  SPEEDY_SPEED,
  VOLATILE_DMG,
  VOLATILE_RADIUS,
} from "./mutation";
import { loadMap, OFFICIAL_MAPS, rasterizeSpawns, terrainFromMap } from "./maps";
import { NO_UPGRADES, upgradedTower, type TechState } from "./tech";
import {
  leakCost,
  LIVES_START,
  SCRAP_START,
  scrapPriceOf,
  sellValue,
  tierOpenAt,
  waveBonusScrap,
} from "./economy";
import { isBuildableWall, isWaterFloor, waterWalkMask, type Terrain } from "./terrain";
import { MAX_WEAPONS, unitDamageScale, UNIT_REACH, UNIT_WEAPONS } from "./weapons";
import {
  FxKind,
  TOWER_KINDS,
  type Projectile,
  type RGB,
  type Tower,
  type TowerKind,
  type EnemyShot,
} from "./types";

/** px per Mindustry world unit — the ported turret geometry is in those */
const MU = CELL / 8;

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

// --- crowd spreading ---
// A flow field hands every unit in a place the same heading, so a crowd
// left to itself collapses into one thread: whoever is behind shoves the
// one in front further along the very line it already walks. The eikonal
// field (see FlowField.sweepEikonal) removes the funnelling the 8-way grid
// used to add; these three forces do the rest, turning a column into a
// front that AoE has to work through instead of a queue it enfilades.
//
// WHERE that front sits is not their job any more. It used to be, badly:
// a distance field's cheapest line clips the inside of every corner, so
// the crowd these forces spread was a crowd spread along the ROCK, and
// force 3 below existed largely to drag it back off. The field now charges
// the verge itself (FlowField.EDGE_COST), which puts the cheap route down
// the middle of a lane before any of this runs — so these three are back
// to their real job, which is width, and two of them were re-tuned for it
// once they stopped fighting the field for position.
//
// All three are GROUND-only. Flyers ignore terrain and fly straight at the
// base, so they never funnel on a corridor wall in the first place; leaving
// them on the untouched Mindustry physics keeps a swarm reading as a swarm
// rather than a wobbling cloud.
//
// 1. Overlaps resolve sideways first. PUSH_LONG is the fraction of a
//    front-to-back shove that stays front-to-back; PUSH_SIDE is how hard
//    the remainder is re-aimed across the direction of travel. The shove's
//    magnitude never changes — only the axis it is spent on
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
const HCOLS = (W / HC) | 0;
const HROWS = (H / HC) | 0;
const HN = HCOLS * HROWS;

export type PlaceResult = "ok" | "invalid" | "would-seal";

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
 * per tick. It bleeds the pull channel, which a parallax beam's drag and a
 * spectre round's knockback both feed (see impulse()).
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
 * index into it (a tower's aimShieldTower, the player's focus, an entombed
 * tower's tombShieldTower, a pierce ledger sentinel) is stable for the run.
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
  // the live base's centre in world px (terrain.base) — the goal-point
  // fallback on maps with no goal layer, and a fresh flyer's first heading
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
   * unit's own drive. A parallax beam adds to it, the kind's drag bleeds
   * it away, and it rides on top of the capped drive exactly like the
   * crowd shove does — a unit can be dragged faster than it can walk, and
   * has to walk back out of it
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
  /** 1 = this unit travels on the WATER layer and steers by waterField.
   *  Kept beside ufly rather than folded into it because the two answer
   *  different questions: ufly decides what may SHOOT at a unit, and this
   *  decides which field it walks. */
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
  private readonly ubeamT = new Float32Array(MAX_UNITS);
  private readonly utgt: (Tower | null)[] = new Array<Tower | null>(MAX_UNITS).fill(null);
  /**
   * WHICH STRUCTURE STANDS ON EACH CELL — every footprint cell of every
   * live tower, rock or ground, kept by claimGround. It is how a unit
   * finds something to shoot (nearestStructure) and how a shot in flight
   * knows it has arrived (updateEnemyShots): one read per cell, never a
   * walk of the tower list.
   */
  private readonly cellTower: (Tower | null)[] = new Array<Tower | null>(NCELLS).fill(null);
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
  leaked = 0;
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
  /** leaks per unit kind this run, indexed like UNIT_KINDS — what got through */
  readonly leakedByKind = new Int32Array(UNIT_KINDS.length);
  /**
   * THE BASE'S HEALTH: a hundred on every run (LIVES_START), and every
   * body that reaches it takes its tier's bite (leakCost) — a dagger one,
   * a scepter eight, a boss the lot. The run is won for as long as any is
   * left. Nothing sells more: plating is not a purchase any more.
   */
  livesMax = LIVES_START;
  lives = this.livesMax;
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

  towers: Tower[] = [];
  projs: Projectile[] = [];

  /**
   * THE RUN'S SHIELD TOWERS (the Shield Towers mutator, mutation.ts) —
   * empty unless the rule was rolled. Entries are appended as shieldTowers
   * emerge and NEVER removed or reordered (a dead shield tower keeps its slot at
   * hp 0), so an index into this array is stable for the whole run and
   * everything — tower aim, the player's focus, entombment, a pierce
   * shot's been-there list — holds indices freely.
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

  /** is the Volatile mutator in force this run? (see reset) */
  private volatileOn = false;

  /** is the Amphibious rule in force this run? (see reset) */
  private amphibiousOn = false;
  /** is the Mitosis mutator in force this run? (see reset, and splitUnit
   *  for what a death then leaves behind) */
  private mitosisOn = false;

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
   * WHICH CELLS COUNT AS WATER TO A WALKER, for the Amphibious rule — 1 on
   * any water floor, shallow or deep. Null on a run the rule is not in
   * force for, which is also the cheap test.
   *
   * Deep water is in the mask even though no walker can ever stand on it:
   * leaving it out would be a second, subtly different definition of
   * "water" from the one the map, the renderer and Hydrophobic all use,
   * and the cells it would drop are ones the ground layer cannot reach
   * anyway (they are blocked). One meaning of water, in one place.
   */
  private wadeable: Uint8Array | null = null;

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
   * The hulls' flow field — the water layer's twin of `field`. Built only
   * on maps that actually have water (`hasWater`); on any other map it is
   * an empty field nothing ever samples.
   */
  readonly waterField = new FlowField();
  private hasWater = false;
  /** the resolved exit mask per layer, after exitsFor's fallbacks */
  private exitGround: Uint8Array = new Uint8Array(NCELLS);
  private exitAir: Uint8Array = new Uint8Array(NCELLS);
  private exitWater: Uint8Array = new Uint8Array(NCELLS);
  /**
   * The air layer's doors: every cell an air zone covers, rock included.
   * Flyers keep their pads here rather than in a FlowField because they
   * have no field — nothing about the terrain constrains where a flyer may
   * be dropped, so there is nothing to solve.
   */
  private airPads: number[] = [];
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
   * THE WALKERS' FIELD NEEDS RECOMPUTING: a structure was placed on, or
   * wrecked off, open ground since the last tick. Placement marks the
   * cells at once (so the next canPlace and the seal check see them) and
   * the ten-millisecond Dijkstra runs ONCE, at the top of the next
   * update, however many towers a drag-chain laid in one frame.
   */
  private fieldDirty = false;
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
    this.leaked = 0;
    this.devoured = 0;
    this.killsByKind.fill(0);
    this.leakedByKind.fill(0);
    this.scrap = SCRAP_START;
    this.scrapEarned = 0;
    // the run's rules, read once: the feed pass runs over every unit on the
    // field, and a spec lookup per unit per tick to answer a question that
    // cannot change mid-run would be pure waste
    // ...the level's own rules and the deploy's roll as one list
    // (mutationsInForce): the sim never asks which of the two a rule came
    // from, only whether it is in force
    const inForce = mutationsInForce(this.level.intrinsicMutation, this.level.mutation);
    this.hungryOn = hasMutation(inForce, "hungry");
    this.speedyOn = hasMutation(inForce, "speedy");
    this.armoredOn = hasMutation(inForce, "armored");
    this.shieldScale = hasMutation(inForce, "overshields") ? OVERSHIELD_SCALE : 1;
    this.volatileOn = hasMutation(inForce, "volatile");
    this.mitosisOn = hasMutation(inForce, "mitosis");
    this.shieldTowersOn = hasMutation(inForce, "shieldTowers");
    this.amphibiousOn = hasMutation(inForce, "amphibious");
    this.shieldTowers.length = 0;
    this.shieldTowerT = 0;
    this.domesUp = false;
    this.focusUid = -1;
    this.focusIdx = -1;
    this.focusShieldTower = -1;
    // the mission sets the base's health and the clock (levels.ts)
    const mission = this.level.mission;
    this.livesMax = missionLives(mission);
    this.lives = this.livesMax;
    this.deadline = mission.kind === "survive" ? mission.minutes * 60 : 0;
    this.loopLevel = 0;
    this.projs.length = 0;
    // drop the fx pool: the count is the pool, but the bolt-path refs must
    // actually go or the last run's arrays sit unreachable-but-held
    this.fxPts.fill(null, 0, this.fxN);
    this.fxN = 0;
    this.towers.length = 0;
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
    // ...and the walkers' side of the same question (the Amphibious rule)
    this.wadeable = this.amphibiousOn ? this.buildWadeable() : null;
    this.goalX = (this.terrain.base.x + this.terrain.base.size / 2) * CELL;
    this.goalY = (this.terrain.base.y + this.terrain.base.size / 2) * CELL;
    // THE EXITS EACH LAYER IS AIMING AT, resolved once here so that no
    // field and no flyer has to know the fallback rules (see exitsFor)
    this.exitGround = this.exitsFor(LAYER_BIT.ground);
    this.exitAir = this.exitsFor(LAYER_BIT.air);
    this.exitWater = this.exitsFor(LAYER_BIT.water);
    this.buildPads();
    // the walkers' field: rock and towers block it, it enters by the ground
    // zones, and it aims at the ground exits
    this.groundPads = this.layerPadMask(LAYER_BIT.ground);
    this.fieldDirty = false;
    this.field.rebuildWalk(this.towers, this.terrain.blocked, this.groundPads, this.exitGround);
    // THE HULLS' FIELD, built only where there is water to sail. It is the
    // mirror image of the walkers' — dry land is its wall — and towers do
    // not block it, because a tower stands on rock and rock is already the
    // whole of its impassable set. Skipped on a map with no water, where it
    // would be a Dijkstra over a grid with nothing in it.
    this.hasWater = false;
    for (let i = 0; i < this.terrain.floor.length; i++)
      if (isWaterFloor(this.terrain.floor[i])) {
        this.hasWater = true;
        break;
      }
    if (this.hasWater)
      this.waterField.rebuildWalk(
        [],
        waterWalkMask(this.terrain),
        this.layerPadMask(LAYER_BIT.water),
        this.exitWater,
      );
    this.buildGoalPts();
    this.field.compute();
    if (this.hasWater) this.waterField.compute();
    // fail LOUDLY on a broken map: with zero doors nothing ever spawns and
    // a wave script stalls forever, which reads as a scheduler bug
    if (this.airPads.length === 0 && this.field.spawnPts.length === 0)
      throw new Error('map "' + doc.id + '" has no drop zones — paint some in the editor');
    // a base sitting on rock is always an authoring slip (a map that moved
    // its base without carving the basin, say) and it reads as "the waves
    // never finish" rather than as a broken map — so say it out loud
    // ...on a map that still HAS one. A goal-layer map never seeds from the
    // base, so its base cells are decoration and may sit under rock
    let walledBase = 0;
    if (!this.usesGoalLayer())
      for (let y = this.terrain.base.y; y < this.terrain.base.y + this.terrain.base.size; y++)
        for (let x = this.terrain.base.x; x < this.terrain.base.x + this.terrain.base.size; x++)
          if (this.terrain.blocked[y * COLS + x]) walledBase++;
    if (walledBase > 0)
      console.warn(
        'map "' + doc.id + '": ' + walledBase +
          " of the base's cells are walled — carve its basin open at " +
          this.terrain.base.x + "," + this.terrain.base.y,
      );
    // A SCRIPT SENDING A LAYER THE MAP HAS NO DOOR FOR is the only
    // map/script mismatch left now that nothing names a region. Warned per
    // layer, and only for layers the script actually sends, so an author
    // hears about it before the run does.
    const doors: ReadonlyArray<readonly [MoveLayer, number]> = [
      ["ground", this.field.spawnPts.length],
      ["air", this.airPads.length],
      ["water", this.hasWater ? this.waterField.spawnPts.length : 0],
    ];
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

  /** does this map route the swarm to painted goal cells rather than a base? */
  usesGoalLayer(): boolean {
    const g = this.terrain.goal;
    for (let i = 0; i < g.length; i++) if (g[i]) return true;
    return false;
  }


  /**
   * THE EXITS ONE MOVEMENT LAYER IS AIMING AT, with the fallbacks that stop
   * a half-painted map from stranding anything.
   *
   * Three rules, in order. A layer with exits of its own uses exactly
   * those — that is the whole point of splitting them, and it is what lets
   * a map land its air waves somewhere its walkers can never reach. A layer
   * with none borrows the UNION of every other layer's, because an author
   * who painted one exit band and stopped meant it for everything rather
   * than meaning "the flyers have nowhere to go". A map with no exits at
   * all falls back to its base block, which is what every pre-exit map is.
   */
  private exitsFor(bit: number): Uint8Array {
    const src = this.terrain.goal;
    const out = new Uint8Array(NCELLS);
    let mine = 0;
    let any = 0;
    for (let i = 0; i < NCELLS; i++) {
      if (!src[i]) continue;
      any++;
      if (src[i] & bit) {
        out[i] = 1;
        mine++;
      }
    }
    if (mine > 0) return out;
    if (any > 0) {
      for (let i = 0; i < NCELLS; i++) if (src[i]) out[i] = 1;
      return out;
    }
    const { base } = this.terrain;
    for (let y = base.y; y < base.y + base.size; y++)
      for (let x = base.x; x < base.x + base.size; x++) out[y * COLS + x] = 1;
    return out;
  }

  /** the cells one layer's zones cover, as a mask a FlowField can take */
  private layerPadMask(bit: number): Uint8Array {
    const src = this.terrain.spawn;
    const out = new Uint8Array(NCELLS);
    for (let i = 0; i < NCELLS; i++) if (src[i] & bit) out[i] = 1;
    return out;
  }

  /**
   * The pad lists the two field-less cases need: the flyers' doors, and the
   * boss's door split by layer.
   *
   * A boss zone is rasterized terrain-blind, so a walking boss's pads are
   * filtered here against the ground it would have to stand on, and a naval
   * one's against water. Doing it per layer rather than in the rasterizer is
   * what lets ONE boss zone serve whatever kind of boss a map fields.
   */
  private buildPads(): void {
    const spawn = this.terrain.spawn;
    const { blocked, floor } = this.terrain;
    this.airPads = [];
    this.bossPads = { ground: [], air: [], water: [] };
    for (let i = 0; i < NCELLS; i++) {
      const m = spawn[i];
      if (!m) continue;
      if (m & LAYER_BIT.air) this.airPads.push(i);
      if (m & LAYER_BIT.boss) {
        this.bossPads.air.push(i);
        if (!blocked[i]) this.bossPads.ground.push(i);
        if (isWaterFloor(floor[i])) this.bossPads.water.push(i);
      }
    }
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

  /**
   * Collect every AIR exit's centre, for a flyer to choose from when it
   * spawns. Air is the one layer with no flow field — a flyer steers
   * straight at a point — so its exits become a list of points here.
   */
  private buildGoalPts(): void {
    // THE AIR LAYER'S OWN EXITS, not every exit on the map. exitsFor has
    // already applied the fallbacks, so this reads a mask that is never
    // empty — the base's block at worst — and a flyer aims at the nearest
    // cell of it. That is the whole of "each layer paths to its own exit"
    // for the one layer with no field to path on.
    const pts: number[] = [];
    const air = this.exitAir;
    for (let i = 0; i < air.length; i++)
      if (air[i]) pts.push((i % COLS) * CELL + CELL / 2, (((i / COLS) | 0) + 0.5) * CELL);
    this.goalPts = Float32Array.from(pts.length > 0 ? pts : [this.goalX, this.goalY]);
  }

  /**
   * THE LINES FLYERS ACTUALLY FLY, one per drop zone — what the route
   * overlay draws. Walkers follow the flow field, which the terrain already
   * shows; flyers ignore it completely and cut whatever straight line their
   * spawn happens to pick, which is invisible until they are on top of you.
   *
   * Drawn from each zone's centre. A flyer entering at the rim picks its own
   * nearest goal and may head somewhere else, so this is the middle of a
   * fan rather than a single guaranteed track.
   */
  airRoutes(): { x1: number; y1: number; x2: number; y2: number; zone: ZoneKind }[] {
    // ONLY WHAT ACTUALLY FLIES GETS A LINE. The straight dashed run to a
    // door is a claim about how something travels — a flyer ignores the
    // maze and steers at one point, so drawing its route as a line is the
    // truth. A walker or a hull follows the flow field down whatever road
    // the map gives it, and a line from its zone to a door crosses hills it
    // will never cross. That was drawn for every zone, so the overlay was
    // three quarters fiction.
    //
    // A boss zone earns a line only if this level's boss flies. Nothing
    // about the zone says which — a boss zone is rasterized terrain-blind
    // precisely so one door can serve whatever kind of boss a map fields —
    // so the script is what settles it.
    const flying = (z: ZoneKind) => z === "air" || (z === "boss" && this.bossFlies());
    return this.terrain.spawns
      .filter((z) => flying(z.zone))
      .map((z) => {
        const x = z.x * CELL, y = z.y * CELL;
        const g = this.nearestGoal(x, y);
        return { x1: x, y1: y, x2: g.x, y2: g.y, zone: z.zone };
      });
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

  /** the base is down — the game freezes and the score screen takes over */
  lost(): boolean {
    return this.lives <= 0;
  }

  /**
   * IS THE MISSION MET? A hold is won when every body the script sends is
   * down (and it sent some); a survive when the clock has run out. Never
   * while the base is dead — a clock that ran out on a lost base is a loss.
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

  /** is building charged? — a campaign run, as opposed to an editor or the
   *  sandbox, which both build for nothing */
  get charging(): boolean {
    return this.tech !== null;
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
    this.specs.clear();
    const up = this.tech?.upgrades;
    if (!up) return;
    const counts = this.towerCounts();
    for (const kind of TOWER_KINDS) {
      const points = up[kind] ?? NO_UPGRADES;
      const spec = upgradedTower(kind, points, { count: counts[kind] });
      if (spec !== TOWERS[kind]) this.specs.set(kind, spec);
    }
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
    return this.specs.get(kind) ?? TOWERS[kind];
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
    for (const t of this.towers) counts[t.kind]++;
    return counts;
  }

  /** enemies left to kill: still unspawned + still walking the field */
  remaining(): number {
    return this.totalEnemies - this.kills - this.leaked - this.devoured - this.exploded;
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
   * THE WAVE THE CLOCK SAYS IT IS — what the stage gate reads. A wave is
   * scheduled every waveGap + WAVE_RELEASE_SECONDS, and on a map whose
   * drop zones cannot pass a big wave that fast the script falls behind
   * its own schedule (Sim.runScript queues what will not fit). The tiers
   * open on the schedule rather than on the count, so a congested map
   * does not hold a player at tier 1 into the fourteenth minute; the
   * larger of the two is taken, so a run that is AHEAD of schedule is
   * never held back either.
   */
  stageWave(): number {
    const cadence = Math.max(1, this.level.waveGap + WAVE_RELEASE_SECONDS);
    return Math.max(this.currentWave(), Math.floor(this.time / cadence) + 1);
  }

  /** seconds until the next wave starts entering, or 0 when one is already
   * draining (or the script has run out) */
  nextWaveIn(): number {
    return this.waitLeft > 0 ? this.waitLeft : 0;
  }

  private addTower(gx: number, gy: number, kind: TowerKind): void {
    const sz = TOWERS[kind].size;
    const tower: Tower = {
      kind,
      gx,
      gy,
      x: (gx + sz / 2) * CELL,
      y: (gy + sz / 2) * CELL,
      hp: towerMaxHp(kind),
      aimShieldTower: -1,
      tombShieldTower: -1,
      cd: Math.random() * 0.1,
      // Hydrophobic (mutation.ts): read the ground once, here, and carry it
      fireRate: this.isWaterlogged(gx, gy, kind) ? HYDROPHOBIC_RATE : 1,
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
      beamT: -1,
      beamOX: 0,
      beamOY: 0,
      beamRot: 0,
      beamDmgT: 0,
    };
    this.towers.push(tower);
    this.claimGround(tower, true);
    // a count-dependent rung (duo power) reads the board, so the board
    // changing is what moves it
    this.refreshSpecs();
  }

  update(dt: number): void {
    // Mindustry Time.time: seconds of SIMULATED time, so animations driven
    // by it (the shield hatch) speed up with the game speed and hold still
    // while the sim is paused
    this.time += dt;
    this.runScript(dt);

    // a structure went up on, or came down off, open ground: re-solve the
    // walkers' field once for the whole frame's worth of changes
    if (this.fieldDirty) {
      this.fieldDirty = false;
      this.field.compute();
      this.unstickUnits();
    }

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
    this.loadStep();
  }

  /**
   * Point the live state at script[stepIdx], skipping empty waves. Leaves
   * everything zeroed once the script runs out, which is what ends the level.
   *
   * Pacing is no longer written into the script: the level carries one
   * `waveGap` and the sim puts it BEFORE every wave, the opening one
   * included, which is the breather the old leading `{ wait: 10 }` gave.
   * A step therefore always describes enemies and never time.
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
        // THE WAVE BONUS, paid as the wave is staged — at the top of its
        // gap, which is exactly when a board wants scrap to spend
        const bonus = waveBonusScrap(this.wavesStarted);
        this.scrap += bonus;
        this.scrapEarned += bonus;
        // hold the gap, then let this wave drain — waitLeft gates runScript
        this.waitLeft = Math.max(0, this.level.waveGap);
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
    this.spawnAcc = Math.min(this.spawnAcc + rate * dt, rate);
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

  // ---------- the swarm's guns ----------

  /**
   * THE NEAREST STRUCTURE WITHIN REACH of a point, by centre — read off
   * cellTower in rings outward, so the first ring that holds anything
   * ends the search. A unit asks this every few tenths of a second
   * (utT), never every tick.
   */
  private nearestStructure(x: number, y: number, reach: number): Tower | null {
    const cx = clamp((x / CELL) | 0, 0, COLS - 1);
    const cy = clamp((y / CELL) | 0, 0, ROWS - 1);
    const R = Math.min(COLS, Math.ceil(reach / CELL) + 2);
    const grid = this.cellTower;
    let best: Tower | null = null;
    let bd = Infinity;
    const consider = (i: number): void => {
      const t = grid[i];
      if (!t) return;
      const half = (TOWERS[t.kind].size * CELL) / 2;
      const dx = t.x - x, dy = t.y - y;
      const d = Math.sqrt(dx * dx + dy * dy) - half;
      if (d <= reach && d < bd) {
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
  private structuresWithin(x: number, y: number, r: number, out: Tower[]): Tower[] {
    out.length = 0;
    const R = Math.ceil(r / CELL) + 1;
    const cx = (x / CELL) | 0, cy = (y / CELL) | 0;
    for (let yy = Math.max(0, cy - R); yy <= Math.min(ROWS - 1, cy + R); yy++)
      for (let xx = Math.max(0, cx - R); xx <= Math.min(COLS - 1, cx + R); xx++) {
        const t = this.cellTower[yy * COLS + xx];
        if (!t || out.includes(t)) continue;
        const half = (TOWERS[t.kind].size * CELL) / 2;
        const dx = t.x - x, dy = t.y - y;
        if (Math.sqrt(dx * dx + dy * dy) - half <= r) out.push(t);
      }
    return out;
  }

  private readonly splashOut: Tower[] = [];

  /** a unit's hit on a structure, through the one dial (unitDamageScale) */
  private hitStructure(t: Tower, dmg: number): void {
    if (dmg <= 0) return;
    this.damageTower(t, dmg * unitDamageScale());
  }

  /** a burst at a point: splash to every structure it reaches */
  private splashStructures(x: number, y: number, splash: number, radius: number): void {
    if (splash <= 0 || radius <= 0) return;
    for (const t of this.structuresWithin(x, y, radius, this.splashOut)) this.hitStructure(t, splash);
  }

  /** is the structure still standing — and within this reach of the point? */
  private inReach(t: Tower, x: number, y: number, reach: number): boolean {
    if (this.cellTower[t.gy * COLS + t.gx] !== t) return false;
    const half = (TOWERS[t.kind].size * CELL) / 2;
    const dx = t.x - x, dy = t.y - y;
    return Math.sqrt(dx * dx + dy * dy) - half <= reach;
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
    const { upx, upy, ukind, uspawn, ucd, utT, ubeamT, utgt } = this;
    for (let i = this.n - 1; i >= 0; i--) {
      if (uspawn[i] > 0) continue; // still arriving, untouchable and unarmed
      const kind = UNIT_KINDS[ukind[i]];
      const ws = UNIT_WEAPONS[kind];
      if (ws.length === 0) continue;
      const x = upx[i], y = upy[i];
      // the target, re-picked every few tenths of a second, dropped the
      // moment it dies or walks out of the longest gun's reach
      utT[i] -= dt;
      let tgt = utgt[i];
      if (tgt && !this.inReach(tgt, x, y, UNIT_REACH[kind])) tgt = null;
      if (utT[i] <= 0 || !tgt) {
        utT[i] = 0.3 + Math.random() * 0.2;
        tgt = this.nearestStructure(x, y, UNIT_REACH[kind]);
        utgt[i] = tgt;
      }
      let exploded = false;
      for (let w = 0; w < ws.length && !exploded; w++) {
        const wp = ws[w];
        const slot = i * MAX_WEAPONS + w;
        if (wp.beam) {
          // a held beam: while it burns it bites every interval, and the
          // reload only starts once it has gone out
          if (ubeamT[i] > 0) {
            ubeamT[i] -= dt;
            ucd[slot] -= dt;
            if (ucd[slot] <= 0) {
              ucd[slot] += wp.beam.interval;
              if (tgt && this.inReach(tgt, x, y, wp.range)) {
                this.hitStructure(tgt, wp.damage);
                this.beamFx(x, y, tgt, wp.beam.interval * 1.5);
              }
            }
            if (ubeamT[i] <= 0) ucd[slot] = wp.reload;
            continue;
          }
          ucd[slot] -= dt;
          if (ucd[slot] <= 0 && tgt && this.inReach(tgt, x, y, wp.range)) {
            ubeamT[i] = wp.beam.duration;
            ucd[slot] = 0;
          }
          continue;
        }
        ucd[slot] -= dt;
        if (ucd[slot] > 0) continue;
        if (!tgt || !this.inReach(tgt, x, y, wp.range)) {
          ucd[slot] = 0; // ready, waiting for something in reach
          continue;
        }
        // a mirrored pair fires twice a reload, alternating: one mount's
        // worth of gap between shots
        ucd[slot] = wp.reload / wp.mounts;
        const shots = wp.shots ?? 1;
        switch (wp.fx) {
          case "bullet":
          case "missile":
          case "shell": {
            for (let k = 0; k < shots; k++) this.fireUnitShot(x, y, tgt, wp, k);
            break;
          }
          case "laser":
          case "sap":
          case "rail": {
            for (let k = 0; k < shots; k++) this.hitStructure(tgt, wp.damage);
            this.beamFx(x, y, tgt, wp.fx === "rail" ? 0.5 : 0.25);
            break;
          }
          case "lightning": {
            for (let k = 0; k < shots; k++) {
              this.hitStructure(tgt, wp.damage);
              this.boltFx(x, y, tgt);
            }
            break;
          }
          case "flame": {
            for (let k = 0; k < shots; k++) this.hitStructure(tgt, wp.damage);
            this.pushFx(x, y, 0.3, FxKind.Flame, Math.atan2(tgt.y - y, tgt.x - x));
            this.pushFx(tgt.x, tgt.y, 0.25, FxKind.FlameHit);
            break;
          }
          case "bomb": {
            // dropped where the unit is — the crawler's own body included
            this.hitStructure(tgt, wp.damage);
            this.splashStructures(x, y, wp.splash ?? 0, wp.splashRadius ?? 0);
            this.pushFx(x, y, 0.4, FxKind.Flak);
            if (wp.suicide) {
              this.pushFx(x, y, 0.35, FxKind.Shockwave, 0, wp.splashRadius ?? 0);
              this.removeUnit(i);
              this.exploded++;
              exploded = true;
            }
            break;
          }
          case "field": {
            // EnergyFieldAbility: one pulse to every structure in reach
            const hit = this.structuresWithin(x, y, wp.range, this.splashOut);
            const max = wp.maxTargets ?? hit.length;
            for (let k = 0; k < hit.length && k < max; k++) {
              this.hitStructure(hit[k], wp.damage);
              this.boltFx(x, y, hit[k]);
            }
            break;
          }
        }
      }
    }
  }

  /** a bullet, missile or shell leaves the unit for the structure */
  private fireUnitShot(x: number, y: number, tgt: Tower, wp: import("./weapons").UnitWeapon, k: number): void {
    const half = (TOWERS[tgt.kind].size * CELL) / 2;
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
      life,
      damage: wp.damage,
      splash: wp.splash ?? 0,
      splashRadius: wp.splashRadius ?? 0,
      fx: wp.fx,
    });
    this.pushFx(x, y, 0.15, wp.fx === "bullet" ? FxKind.ShootSmall : FxKind.ShootBig, a);
  }

  /** the beam from a unit to the structure it is burning */
  private beamFx(x: number, y: number, tgt: Tower, ttl: number): void {
    const dx = tgt.x - x, dy = tgt.y - y;
    this.pushFx(x, y, ttl, FxKind.Laser, Math.atan2(dy, dx), Math.sqrt(dx * dx + dy * dy));
  }

  /** a bolt from a unit to the structure, jagged once in the middle */
  private boltFx(x: number, y: number, tgt: Tower): void {
    const mx = (x + tgt.x) / 2 + (Math.random() - 0.5) * 12;
    const my = (y + tgt.y) / 2 + (Math.random() - 0.5) * 12;
    this.pushBolt(x, y, 0.2, [x, y, mx, my, tgt.x, tgt.y]);
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
      const off = sh.x < 0 || sh.y < 0 || sh.x >= W || sh.y >= H;
      const t = off ? null : this.cellTower[((sh.y / CELL) | 0) * COLS + ((sh.x / CELL) | 0)];
      if (t) {
        this.hitStructure(t, sh.damage);
        if (sh.splash > 0) {
          this.splashStructures(sh.x, sh.y, sh.splash, sh.splashRadius);
          this.pushFx(sh.x, sh.y, 0.35, FxKind.BlastExplosion, 0, sh.splashRadius);
        } else this.pushFx(sh.x, sh.y, 0.2, FxKind.BulletHit, Math.atan2(sh.vy, sh.vx));
      } else if (sh.life <= 0 && !off && sh.splash > 0) {
        this.splashStructures(sh.x, sh.y, sh.splash, sh.splashRadius);
        this.pushFx(sh.x, sh.y, 0.35, FxKind.BlastExplosion, 0, sh.splashRadius);
      }
      if (t || off || sh.life <= 0) {
        shots[p] = shots[shots.length - 1];
        shots.pop();
      }
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
   * unit wades and a channel a hull sails are the same wet ground to a
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

  /** every water cell, shallow or deep — the Amphibious rule's ground */
  private buildWadeable(): Uint8Array {
    const { floor } = this.terrain;
    const out = new Uint8Array(COLS * ROWS);
    for (let i = 0; i < out.length; i++) if (isWaterFloor(floor[i])) out[i] = 1;
    return out;
  }

  /** is this world point standing in water? 0/1 rather than a boolean so it
   *  drops straight into the Uint8Array that remembers it */
  private inWater(x: number, y: number): 0 | 1 {
    const mask = this.wadeable;
    if (!mask) return 0;
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
  isWaterlogged(gx: number, gy: number, kind: TowerKind): boolean {
    const mask = this.waterlogged;
    if (!mask) return false;
    const sz = TOWERS[kind].size;
    for (let y = gy; y < gy + sz; y++)
      for (let x = gx; x < gx + sz; x++)
        if (x >= 0 && y >= 0 && x < COLS && y < ROWS && mask[y * COLS + x]) return true;
    return false;
  }

  canPlace(gx: number, gy: number, kind: TowerKind): boolean {
    // tech gate first: a locked tower or an unaffordable one refuses
    // everywhere, so the drag-chain and keyboard paths can't sidestep the
    // menu. A sandbox or an editor (tech null) is not charged at all
    if (this.tech) {
      if (!this.tech.unlocked.has(kind)) return false;
      // the stage gate: tier 2 waits for wave 21, tier 3 for wave 36
      // (STAGES in economy.ts) — a campaign rule, like the price
      if (!tierOpenAt(kind, this.stageWave())) return false;
      if (this.scrap < scrapPriceOf(kind)) return false;
    }
    const sz = TOWERS[kind].size;
    if (gx < 0 || gy < 0 || gx > COLS - sz || gy > ROWS - sz) return false;
    const { blocked, wall, floor } = this.terrain;
    const { isGoal } = this.field;
    // does any cell of the footprint stand on OPEN GROUND — in the swarm's
    // way, where a structure is a wall as well as a gun?
    let onGround = false;
    for (let y = gy; y < gy + sz; y++)
      for (let x = gx; x < gx + sz; x++) {
        const i = y * COLS + x;
        if (blocked[i]) {
          // pine forests and deep water are the un-buildable kinds of
          // blocked cell (isBuildableWall in terrain.ts holds that rule);
          // every rock family — stone, dirt, dark carbon, indices above
          // the sentinels included — is tower real estate
          if (!isBuildableWall(wall[i])) return false;
          continue;
        }
        // OPEN GROUND IS REAL ESTATE TOO — the RTS turn: a structure can
        // stand anywhere unoccupied and it blocks the swarm that walks
        // there. Never on water (no hull-footed turrets), never on the
        // base line the walkers are aiming at, never on a drop zone (a
        // corked door spawns nothing)
        if (isWaterFloor(floor[i]) || isGoal[i] || this.groundPads[i]) return false;
        onGround = true;
      }
    for (const t of this.towers) {
      const tsz = TOWERS[t.kind].size;
      if (gx < t.gx + tsz && t.gx < gx + sz && gy < t.gy + tsz && t.gy < gy + sz)
        return false;
    }
    // a LIVE shield tower owns its ground: selling a buried turret is allowed,
    // but nothing builds back under the dome until the shield tower is dead
    for (const s of this.shieldTowers) {
      if (s.hp <= 0) continue;
      if (gx < s.gx + SHIELD_TOWER_SIZE && s.gx < gx + sz && gy < s.gy + SHIELD_TOWER_SIZE && s.gy < gy + sz)
        return false;
    }
    // nothing underfoot. Sealing the swarm's route is allowed: a wall it
    // cannot walk around is a wall it walks INTO and shoots (the field
    // routes through structures at a cost — FlowField.soft), so a seal
    // is not a win, it is a fight at the wall
    if (onGround && !this.areaClearOfUnits(gx, gy, sz)) return false;
    return true;
  }

  placeTower(gx: number, gy: number, kind: TowerKind): PlaceResult {
    if (!this.canPlace(gx, gy, kind)) return "invalid";
    this.addTower(gx, gy, kind);
    if (this.charging) this.scrap -= scrapPriceOf(kind);
    return "ok";
  }

  /**
   * Chain building: walk the drag segment a cell at a time, dropping a tower
   * wherever one fits (overlap with the one just placed fails canPlace,
   * which is what spaces the chain). Returns how many towers landed.
   */
  placeLine(x0: number, y0: number, x1: number, y1: number, kind: TowerKind): number {
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

  /** the tower whose footprint covers the world point, if any */
  towerAt(px: number, py: number): Tower | null {
    const gx = (px / CELL) | 0, gy = (py / CELL) | 0;
    for (const t of this.towers) {
      const sz = TOWERS[t.kind].size;
      if (gx >= t.gx && gx < t.gx + sz && gy >= t.gy && gy < t.gy + sz) return t;
    }
    return null;
  }

  /**
   * A structure's footprint on the walkers' field. Rock is already a wall
   * and stays one whichever way this goes; OPEN GROUND under a structure
   * becomes a wall while it stands (`on`) and opens again when it comes
   * down. The field itself is re-solved once, at the next tick
   * (fieldDirty), and the seal check's cache is stale either way.
   */
  private claimGround(t: Tower, on: boolean): void {
    const { blocked } = this.terrain;
    const { walk, soft } = this.field;
    const sz = TOWERS[t.kind].size;
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
        changed = true;
      }
    if (changed) this.fieldDirty = true;
  }

  /** take a structure off the board — sold or wrecked, the ground is the swarm's again */
  private removeTower(t: Tower): void {
    const at = this.towers.indexOf(t);
    if (at < 0) return;
    this.towers.splice(at, 1);
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
    const dx = x1 - x0, dy = y1 - y0;
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / CELL));
    let sold = 0;
    for (let s = 0; s <= steps; s++) {
      if (this.sellTowerAt(x0 + (dx * s) / steps, y0 + (dy * s) / steps)) sold++;
    }
    return sold;
  }

  /** remove the tower whose footprint covers the world point, if any */
  sellTowerAt(px: number, py: number): boolean {
    const t = this.towerAt(px, py);
    if (!t) return false;
    this.removeTower(t);
    // the whole price back (SELL_REFUND, economy.ts): a board is never a
    // commitment, and re-laying it to fund the next tier costs nothing
    if (this.charging) this.scrap += sellValue(t.kind);
    this.pushFx(t.x, t.y, 0.35, FxKind.Death); // demolish puff
    return true;
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
    if (boss && this.bossPads[layer].length > 0) return this.bossPads[layer];
    if (layer === "air") return this.airPads;
    if (layer === "water") return this.hasWater ? this.waterField.spawnPts : [];
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
  private spawnUnit(kind: UnitKind, brood?: { x: number; y: number }): boolean {
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
        const d = Math.sqrt(Math.random()) * MITOSIS_SPREAD;
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
      // a big hitbox can overhang the pad into ragged rock beside it — and
      // for a hull, into the SHORE: the water field's mask is the mirror
      // one, so the same test asks "is any of this boat aground?"
      const wallField = layer === "water" ? this.waterField : this.field;
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
      // flyers never read the flow field, so the routing the field does for
      // free has to be done by hand for them — once, here, not per tick
      if (fly) {
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
          // Fx.shieldBreak: the outline snapping outward as it pops
          this.pushFx(
            upx[i], upy[i], 40 / 60, FxKind.ShieldBreak,
            force.rotation, force.radius * uforceScale[i], 0, force.sides,
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
      if (did)
        this.pushFx(
          upx[i], upy[i], 22 / 60,
          repair || energy ? FxKind.HealWave : FxKind.ShieldWave,
          0, range,
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
    this.killsByKind[kind]++;
    // the kill's scrap, into the run — fixed per tier (economy.ts)
    const drop = unitDrop(UNIT_KINDS[kind]).scrap;
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
    if (this.mitosisOn && !wasBrood) this.splitUnit(x, y, kind);
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
  private splitUnit(x: number, y: number, kind: number): void {
    const tier = KIND_TIER[kind];
    const want = tier < MITOSIS_BROOD.length ? MITOSIS_BROOD[tier] : 0;
    if (want <= 0) return;
    // the parent's own layer, so the brood can walk where it landed
    const s = UNIT_STATS[UNIT_KINDS[kind]];
    const pool = MITOSIS_KINDS[s.flying ? "air" : s.naval ? "water" : "ground"];
    for (let b = 0; b < want; b++)
      this.spawnUnit(UNIT_KINDS[pool[(Math.random() * pool.length) | 0]], { x, y });
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
    // the hulls' clearance map, so the sideways re-aim below asks how much
    // WATER a boat has beside it rather than how much open ground — deep
    // water scores zero on the ground map, which would have switched the
    // re-aim off for the whole fleet
    const wclear = this.waterField.clear;
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
    const { upx, upy, uvx, uvy, uspd, ukind, uwalk, ubrot, urot, ulat, phx, phy, field, flowTmp } =
      this;
    const { upullx, upully, uspawn, uwet, uwetSlow } = this;
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
      // THE MOVER'S OWN FIELD. Everything below that asks the terrain a
      // question — where the exits are, where the walls are, how much room
      // there is to spread — asks it of the layer the unit travels on, and
      // for a hull that is the water field: its mask is the mirror of the
      // ground's, so dry land answers `blocked` and deep water does not.
      // Reading the ground field for a boat would have walled it out of
      // every deep cell on the map and left it circling the shallows.
      // Flyers still read the ground field where they read one at all —
      // they only ever use it for `isGoal`, and a flyer's own destination
      // was picked at spawn (see below), so the cell test is a formality.
      const mf = nav ? this.waterField : field;
      const { isGoal, walk } = mf;
      const cx = clamp((upx[i] / CELL) | 0, 0, COLS - 1);
      const cy = clamp((upy[i] / CELL) | 0, 0, ROWS - 1);
      const ci = cy * COLS + cx;
      // ARRIVING IS TESTED ON THE UNIT'S OWN LAYER. A walker and a hull
      // read their own field's isGoal, which was seeded from that layer's
      // exit mask, so both are already asking the right question.
      //
      // A FLYER HAS NO FIELD, and reading the ground field's isGoal here
      // asked whether it had arrived at a GROUND exit. On a map whose air
      // exits are the same cells as its ground exits that is accidentally
      // right, which is why it survived; the moment a map paints air exits
      // of its own — the whole point of per-layer exits — every flyer flew
      // to the door it was given, found the test false, and sat on it.
      // They pile up, nothing leaks, the wave never empties and the run
      // cannot end. So ask the air mask, which is where the flyer was sent.
      if (fly ? this.exitAir[ci] : isGoal[ci]) {
        // A LEAK PAYS NOTHING. killsByKind is the whole drop ledger (see
        // dropsForKills) and a body that walked off the board was never
        // killed, so it is not in it — the scrap and the XP a leak costs
        // are what the player would have had for stopping it.
        //
        // AND IT BITES BY TIER (leakCost): a dagger takes one life, a
        // scepter eight. A BOSS THAT REACHES THE BASE ENDS THE RUN — a
        // script that builds to one enemy must not have that enemy become
        // a body you shrug off, so it takes the whole pool.
        const stats = UNIT_STATS[UNIT_KINDS[this.ukind[i]]];
        this.pushFx(upx[i], upy[i], 0.4, FxKind.Breach);
        this.leakedByKind[this.ukind[i]]++;
        this.removeUnit(i);
        this.leaked++;
        this.lives = Math.max(0, this.lives - leakCost(stats.tier, stats.boss === true));
        continue;
      }

      if (fly) {
        // flyers ignore the maze: aim straight at the exit they picked when
        // they spawned (the base's centre on a map with no goal layer)
        const gdx = this.ugx[i] - upx[i], gdy = this.ugy[i] - upy[i];
        const gl = Math.sqrt(gdx * gdx + gdy * gdy) || 1;
        flowTmp.x = gdx / gl;
        flowTmp.y = gdy / gl;
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
      const spd =
        uspawn[i] > SPAWN_INVINCIBLE - SPAWN_UNMOVING
          ? 0
          : uwet[i] > 0
            ? uspd[i] * uwetSlow[i]
            : uspd[i];
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

      // every steering force below is ground-only: flyers never probe,
      // jitter, center, or drift. They ignore the maze entirely and hold the
      // straight line to the base they have always flown — open sky has no
      // corridor to spread across and no walls to crowd against, so the
      // crowd fixes a corridor needs would only add wobble up there
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
        // such equilibria and disappears under the flow force in open field
        fx += (Math.random() - 0.5) * 14;
        fy += (Math.random() - 0.5) * 14;

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
      // an outside shove (a parallax beam) rides on top of the capped drive
      // like the crowd shove does, and bleeds off at the kind's own drag —
      // Mindustry keeps the impulse in `vel` and scales the whole thing by
      // (1 - drag) every tick, so the pull outlives the beam by a moment
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
      const mdx = upx[i] - x0, mdy = upy[i] - y0;
      const len = Math.sqrt(mdx * mdx + mdy * mdy);
      if (len > 1e-4) {
        const ang = Math.atan2(mdy, mdx);
        const trot = KIND_ROT[ukind[i]] * dt;
        urot[i] += clamp(Sim.angleDiff(urot[i], ang), -trot, trot);
        if (!fly) {
          uwalk[i] += len;
          const cap = ROT_SPD * Math.min(1, len / (uspd[i] * dt)) * dt;
          ubrot[i] += clamp(Sim.angleDiff(ubrot[i], ang), -cap, cap);
        }
      }
      // legs walk on the chassis angle this frame settled on. A standing
      // unit still runs the pass — its feet ease back under it
      const gait = KIND_LEGS[ukind[i]];
      if (gait) this.updateLegs(i, gait, mdx, mdy, len, dt);
      if (nav) this.updateWake(i, dt);
    }
  }

  /**
   * One tick of a hull's wake: Trail.update, subsampled (see WAKE_PTS).
   *
   * Mindustry pushes a point every tick and drops the oldest once the
   * buffer is full; this pushes one every KIND_WAKE_DT seconds and does
   * the same, so the ring holds the same SPAN of history at a fraction of
   * the points. The timer runs whether the boat moved or not — a hull held
   * still by a crowd stops laying new water down and its wake shortens to
   * a puddle under it, which is exactly what a stalled Trail does.
   */
  private updateWake(i: number, dt: number): void {
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

  /** push units out of freshly blocked cells (after tower placement) */
  private unstickUnits(): void {
    const { upx, upy, ukind, unav, field } = this;
    for (let i = 0; i < this.n; i++) {
      // flyers are allowed over walls — never teleport them off a mountain.
      // Hulls are skipped for a different reason: this pass exists to clear
      // walkers out of cells a STRUCTURE just took (canPlace refuses a
      // footprint with a unit under it, but a unit can drift into one
      // between the check and the tick), no structure stands on water —
      // so a boat reading as blocked here is a boat on the shore of its
      // own field, and shoving it to the nearest open GROUND cell would
      // beach it for good
      if (KIND_FLYING[ukind[i]] || unav[i] !== 0) continue;
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
   * Roll a spot and raise a shield tower on it. A candidate 3x3 must lie inside
   * the map, off the base, off every drop zone and exit, off water — and
   * it must not seal the swarm's last route (the same BFS probe a ground
   * structure would use). It also has to MATTER: a footprint that neither
   * touches walkable ground nor buries a tower is a shield tower in a corner
   * nobody visits, so the roll refuses it. Two dozen tries, then give up
   * until the next period — a crowded map simply mutates less.
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
      // ...and never on a turret. A shield tower takes FREE rock only: the
      // board the player built is theirs, and a mutator that buried it
      // would be a mutator that undid their choices. A map with no free
      // rock left simply raises nothing this period
      for (const t of this.towers) {
        const tsz = TOWERS[t.kind].size;
        if (gx < t.gx + tsz && t.gx < gx + SHIELD_TOWER_SIZE && gy < t.gy + tsz && t.gy < gy + SHIELD_TOWER_SIZE) {
          ok = false;
          break;
        }
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
   * no amount of fire postpones that. A body at zero DIES FOR GOOD: the
   * lane it blocked reopens, every turret it entombed stands back up, and
   * its slot in the array becomes a tombstone.
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
          Math.random() * Math.PI, s.domeR * s.scale, 0, 24,
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
    // free the hostages — an entombed turret comes back the moment the
    // shield tower dies, at whatever health it went under with
    for (const t of this.towers) if (t.tombShieldTower === idx) t.tombShieldTower = -1;
    // no lane to reopen: the footprint was rock (see trySpawnShieldTower), so
    // the swarm's routes never knew this shield tower existed
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
  private damageTower(t: Tower, dmg: number): void {
    if (t.tombShieldTower >= 0) return;
    t.hp -= dmg;
    if (t.hp > 0) return;
    t.hp = 0;
    this.pushFx(t.x, t.y, 0.5, FxKind.Breach);
    this.pushFx(t.x, t.y, 0.35, FxKind.Death);
    this.removeTower(t);
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
    // over a copy: a wrecked tower leaves the list under the loop
    for (const t of [...this.towers]) {
      const half = (TOWERS[t.kind].size * CELL) / 2;
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
  }

  /** mark one shield tower for focus fire — same contract, the other kind */
  setFocusShieldTower(idx: number): void {
    if (idx < 0 || idx >= this.shieldTowers.length || this.shieldTowers[idx].hp <= 0) return;
    this.focusShieldTower = idx;
    this.focusUid = -1;
    this.focusIdx = -1;
  }

  clearFocus(): void {
    this.focusUid = -1;
    this.focusIdx = -1;
    this.focusShieldTower = -1;
  }

  /**
   * Where the focus mark should be drawn, in world px — the overlay's
   * arrow. `top` is above the target's art; null when nothing is marked
   * (or the marked unit has died since, which clears the mark for good).
   */
  focusMark(): { x: number; y: number; top: number } | null {
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

  /** the unit under a tap, if any — a hit-test against live hitboxes with
   *  a little slop so a fingertip can pick a dagger out of a lane */
  unitAt(px: number, py: number): number {
    let best = -1, bd = Infinity;
    for (let i = 0; i < this.n; i++) {
      const dx = this.upx[i] - px, dy = this.upy[i] - py;
      const d2 = dx * dx + dy * dy;
      const r = Math.max(this.urad[i] * 1.6, 10);
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
    for (const t of this.towers) {
      // an ENTOMBED tower (a shield tower rose over it — see trySpawnShieldTower)
      // does nothing at all until the shield tower dies and hands it back
      if (t.tombShieldTower >= 0) continue;
      // DAMAGE SMOKE, the units' own rule (updateStatus): under half its
      // pool a structure sheds soot, thicker the lower it gets, scaled by
      // its footprint so a spectre smokes like the building it is. The
      // tint has gone grey (renderer, HP_TINT); this is the other half
      const maxHp = towerMaxHp(t.kind);
      if (t.hp < maxHp * DAMAGE_SMOKE_BELOW) {
        const hurt = 1 - t.hp / (maxHp * DAMAGE_SMOKE_BELOW);
        const cells = TOWERS[t.kind].size;
        if (Math.random() < DAMAGE_SMOKE_RATE * hurt * cells * dt) {
          const sz = cells * CELL;
          this.pushFx(
            t.x + (Math.random() - 0.5) * sz * 0.6,
            t.y + (Math.random() - 0.5) * sz * 0.6,
            DAMAGE_SMOKE_LIFE, FxKind.DamageSmoke, 0, sz / 2, (Math.random() * 1e9) | 0,
          );
        }
      }
      const st = this.statsFor(t.kind);
      // a tractor turret has no reload and no volley — it holds a beam
      if (st.bullet.tractor) {
        this.updateTractor(t, st, dt);
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
      if (t.cd > 0 && !(cont && t.beamT > cont.fade)) t.cd -= dt * t.fireRate;

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
      // THE PLAYER'S MARK FIRST (setFocusUnit / setFocusShieldTower): a tapped
      // target overrides both the held target and the scan for every
      // turret that can reach it. At most one of the two kinds is ever set
      if (this.focusIdx >= 0 && this.uid[this.focusIdx] === this.focusUid) {
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
      }
      if (best < 0 && !shr) {
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
        if (best < 0 || t.targetT <= 0) {
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
      }
      t.targetIdx = best;
      t.aimShieldTower = shr ? this.shieldTowers.indexOf(shr) : -1;
      if (best < 0 && !shr) {
        // nothing in range: a beam already lit keeps burning down its
        // duration where it is, exactly as Mindustry's held bullet does
        continue;
      }

      // Predict.intercept: aim where target and bullet paths cross. Hitscan
      // bullets (speed ~0) aim straight at the target, like Mindustry's
      // predictTarget guard (bullet.speed >= 0.01 or no lead at all).
      // A shield tower is a building: no velocity, no lead, aim at the centre
      const dx = (shr ? shr.x : upx[best]) - t.x, dy = (shr ? shr.y : upy[best]) - t.y;
      let aimX = dx, aimY = dy;
      if (!shr && st.bullet.speed >= 1) {
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

  /**
   * Units.bestTarget: the best-scoring live targetable unit whose CENTRE
   * is within `range`, with ties broken by the lowest index so neither
   * bucket order nor the linear fallback can ever choose differently. Read
   * off the spatial hash, so a turret pays for the units under its range
   * circle rather than for the whole field.
   *
   * Two sorts (see TowerStats.sort). The default is closest — plain
   * squared distance. `strongest` is the HIGHEST CURRENT HEALTH, distance
   * strictly the tiebreak (the d2 term is scaled far below any health
   * difference): foreshadow finishes nothing another turret has all but
   * killed.
   *
   * The hash is a tick old by the time towers fire (units have stepped
   * once since buildHash), so the bucket sweep is padded by a few px; the
   * distance test itself always reads live positions.
   */
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
    if (st.bullet.lightning) {
      const pts = this.lightningBolt(
        x, y, a,
        st.bullet.damage,
        st.bullet.navalMultiplier ?? 1,
        st.bullet.lightning.length,
        st.bullet.hitRadius ?? 2.5,
        st.bullet.collidesAir,
        st.bullet.collidesGround,
        st.bullet.hitFx,
        st.bullet.fxColor,
      );
      this.pushBolt(x, y, st.bullet.lifetime, pts, true); // the bolt IS arc's shot
      if (shrT) this.shieldTowerHit(shrT, st.bullet.damage, st.bullet.hitFx, a, st.bullet.fxColor);
      return;
    }
    if (st.bullet.laser) {
      const reached = this.laserBeam(
        x, y, a,
        st.bullet.laser.length,
        st.bullet.damage,
        st.bullet.laser.pierceCap,
        st.bullet.armorMultiplier ?? 1,
        st.bullet.navalMultiplier ?? 1,
        st.bullet.collidesAir,
        st.bullet.collidesGround,
        st.bullet.hitFx,
        st.bullet.fxColor,
      );
      // forced: the beam is lancer's entire visible shot (damage is instant)
      this.pushFx(x, y, st.bullet.lifetime, FxKind.Laser, a, reached, 0, 0, true);
      if (shrT) this.shieldTowerHit(shrT, st.bullet.damage, st.bullet.hitFx, a, st.bullet.fxColor);
      return;
    }
    if (st.bullet.rail) {
      this.railShot(x, y, a, st.bullet);
      if (shrT) this.shieldTowerHit(shrT, st.bullet.damage, st.bullet.hitFx, a, st.bullet.fxColor);
      return;
    }
    if (st.bullet.ray) {
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
      if (shrT) this.shieldTowerHit(shrT, st.bullet.damage, st.bullet.hitFx, a, st.bullet.fxColor);
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
    });
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
    navalMult: number,
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
        this.damageUnit(victim, damage, false, 1, navalMult);
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
    navalMult: number,
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
      this.damageUnit(i, damage, false, armorMult, navalMult);
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
      // pierceCap -1: the beam stops for nothing
      for (const i of hits) {
        this.damageUnit(i, b.damage, b.pierceArmor ?? false, b.armorMultiplier ?? 1, b.navalMultiplier ?? 1);
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
   * Mindustry TractorBeamTurret.updateTile: parallax has no reload, no
   * volley and no bullet. It locks the CLOSEST flyer in range, swings onto
   * it, and for as long as it is aimed within its cone it deals continuous
   * armour-piercing damage and pulls the target toward itself.
   *
   * The pull is an impulse divided by the target's mass — hitSize squared
   * times pi (PhysicsComp.mass) — so it is the same force on everything and
   * a completely different effect: it nearly stops a flare, leans hard on a
   * zenith, and barely troubles an antumbra.
   */
  private updateTractor(t: Tower, st: TowerStats, dt: number): void {
    const spec = st.bullet.tractor!;
    const { upx, upy, uhp, urad, ufly, bStart, bUnits } = this;
    // Units.closestEnemy, over the turret's own layer filter — same pick
    // the O(units) scan made (nearest eligible, ties to the lowest index),
    // read off the hash's buckets under the reach circle instead. A turret
    // whose whole target layer is empty pays for none of it
    let best = -1, bd = Infinity;
    if (!(st.targetAir && this.nAliveAir > 0) && !(st.targetGround && this.nAliveGround > 0)) {
      t.beamStr += (0 - t.beamStr) * (1 - Math.pow(1 - 0.1, dt * 60));
      return;
    }
    const pad = st.range + this.rmaxAliveFor(st.targetAir, st.targetGround) + 8;
    const hx0 = clamp(((t.x - pad) / HC) | 0, 0, HCOLS - 1);
    const hy0 = clamp(((t.y - pad) / HC) | 0, 0, HROWS - 1);
    const hx1 = clamp(((t.x + pad) / HC) | 0, 0, HCOLS - 1);
    const hy1 = clamp(((t.y + pad) / HC) | 0, 0, HROWS - 1);
    for (let hy = hy0; hy <= hy1; hy++) {
      const row = hy * HCOLS;
      const e = bStart[row + hx1 + 1];
      for (let k = bStart[row + hx0]; k < e; k++) {
        const i = bUnits[k];
        if (i >= this.n) continue;
        if (ufly[i] !== 0 ? !st.targetAir : !st.targetGround) continue;
        const dx = upx[i] - t.x, dy = upy[i] - t.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        // within(range + hitSize/2): a wide target counts from its edge
        if (d <= st.range + urad[i] && (d < bd || (d === bd && i < best))) {
          bd = d;
          best = i;
        }
      }
    }
    // `strength` lerps in as the beam catches and out as it lets go
    const ease = 1 - Math.pow(1 - 0.1, dt * 60);
    if (best < 0) {
      t.beamStr += (0 - t.beamStr) * ease;
      return;
    }
    const targetRot = Math.atan2(upy[best] - t.y, upx[best] - t.x);
    const diff = Sim.angleDiff(t.angle, targetRot);
    const turn = st.rotateSpeed * dt;
    t.angle = Math.abs(diff) <= turn ? targetRot : t.angle + Math.sign(diff) * turn;
    t.beamX = upx[best];
    t.beamY = upy[best];
    t.beamStr += (1 - t.beamStr) * ease;
    if (Math.abs(Sim.angleDiff(t.angle, targetRot)) >= st.shootCone) return;

    // damageContinuousPierce: armour never applies, but a shield still eats it
    this.damageUnit(best, st.bullet.damage * dt, true);
    if (uhp[best] <= 0) {
      this.killUnit(best);
      return;
    }
    // the pull is applied every TICK, so this frame is worth dt * 60 of
    // them; impulse() does the mass division and the unit conversion
    const mag = (spec.force + (1 - bd / st.range) * spec.scaledForce) * dt * 60;
    const inv = bd > 1e-4 ? 1 / bd : 0;
    this.impulse(best, (t.x - upx[best]) * inv * mag, (t.y - upy[best]) * inv * mag);
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
    navalMult = 1,
  ): void {
    // StatusEffects.invincible, healthMultiplier infinity: every hit lands
    // on a unit still arriving for exactly nothing. It runs a full second,
    // half of it after the unit has started walking
    if (this.uspawn[i] > 0) return;
    // water conducts (BulletStats.navalMultiplier): a hull takes the
    // electric and beam weapons' hit scaled up, before armour sees it
    if (navalMult !== 1 && this.unav[i] !== 0) raw *= navalMult;
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
   * Arc Intersector.isInRegularPolygon, in closed form: fold the bearing
   * into one sector and compare the point's reach along that edge's normal
   * against the apothem. Arc walks the vertex ring instead, but a regular
   * polygon needs no ring — every edge is the same edge, rotated.
   */
  private static inRegularPolygon(
    sides: number,
    cx: number,
    cy: number,
    radius: number,
    rotation: number,
    x: number,
    y: number,
  ): boolean {
    const dx = x - cx, dy = y - cy;
    const dst = Math.sqrt(dx * dx + dy * dy);
    if (dst > radius) return false;
    const step = TAU / sides;
    // vertices sit at multiples of `step` from `rotation`, so the edge
    // facing a point is the one whose normal is half a step further round
    let a = (Math.atan2(dy, dx) - rotation) % step;
    if (a < 0) a += step;
    return dst * Math.cos(a - step / 2) <= radius * Math.cos(step / 2);
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
      if (dx * dx + dy * dy > rad * rad) continue; // cheap circumcircle reject
      if (!Sim.inRegularPolygon(spec.sides, upx[i], upy[i], rad, spec.rotation, px, py)) continue;
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
      // BulletType.updateHoming, BEFORE the step: the shot picks the
      // nearest target within homingRange OF ITSELF and swings toward it,
      // re-picking every tick — so a missile whose mark dies latches onto
      // whatever it passes next instead of flying on into the ground
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
      }
      if (dead) {
        const rot = Math.atan2(pr.vy, pr.vx);
        // BulletType.hit: the blast, and the hit effect a splash bullet
        // saves for it rather than firing per victim above. Mindustry gives
        // every splash bullet despawnHit, so a shell that simply runs out
        // of lifetime blasts exactly as one that ran into something
        if (b.splash > 0) {
          this.bulletFx(b.hitFx, pr.x, pr.y, rot, b.fxColor);
          this.bulletFx(b.hitFx2, pr.x, pr.y, rot, b.fxColor);
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
    // only way artillery (whose shells never collide) hurts one at all
    if (ground) {
      for (const s of this.shieldTowers) {
        if (s.hp <= 0) continue;
        const sdx = s.x - x, sdy = s.y - y;
        const rr = radius + SHIELD_TOWER_BODY_R;
        if (sdx * sdx + sdy * sdy >= rr * rr) continue;
        const d = Math.sqrt(sdx * sdx + sdy * sdy);
        this.damageShieldTower(s, dmg * Math.max(0, 0.4 + 0.6 * (1 - d / radius)));
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
   * Effect.at(x, y, rotation, color) for one of a bullet's own effects.
   * The kind carries its Mindustry lifetime (FX_LIFE) and every one of
   * them scatters particles, so both are filled in here rather than at the
   * dozen call sites. An unset kind is Fx.none and draws nothing.
   * `force` as on pushFx: weapon-defining artifacts skip the cap.
   */
  private bulletFx(
    kind: BulletFx | undefined,
    x: number,
    y: number,
    rot: number,
    col?: RGB,
    force = false,
  ): void {
    // refuse before rolling the seed, so a capped board — or one with the
    // effects switched off (see setEffects) — leaves the random stream
    // exactly where the old object push left it
    if (kind === undefined) return;
    if (!force && (!this.fxOn || this.fxN >= FX_CAP)) return;
    if (this.fxN >= FX_MAX) return;
    const i = this.pushSlot(
      x, y, FX_LIFE[kind], kind, rot, 0, (Math.random() * 0x7fffffff) | 0, 0, force,
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
    if (i >= 0) this.fxUnit[i] = unit;
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
