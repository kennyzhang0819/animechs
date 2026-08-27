import {
  BASE,
  BURN_DPS,
  BURN_FX_CHANCE,
  CELL,
  clamp,
  COLS,
  H,
  MAX_UNITS,
  ROWS,
  TOWERS,
  UR,
  W,
  WALL_R,
  type TowerStats,
} from "./constants";
import { FlowField, type Vec2 } from "./flowfield";
import {
  WORLDS,
  UNIT_ID,
  UNIT_KINDS,
  UNIT_RMAX,
  UNIT_RMAX_AIR,
  UNIT_RMAX_GROUND,
  UNIT_STATS,
  rmaxFor,
  waveGroups,
  type LegSpec,
  type LevelSpec,
  type UnitKind,
} from "./levels";
import { unitHpAtLevel } from "./ladder";
import { loadMap, OFFICIAL_MAPS, terrainFromMap } from "./maps";
import type { TechState } from "./tech";
import { WALL_PINE, type Terrain } from "./terrain";
import { FxKind, TOWER_KINDS, type Effect, type Projectile, type Tower, type TowerKind } from "./types";

/** px per Mindustry world unit — the ported turret geometry is in those */
const MU = CELL / 8;

const FX_CAP = 400;
/**
 * Footfall dust gets a third of that and no more. It is ambience, and it
 * is PERIODIC: every legged unit on the field throws a puff per planted
 * foot, several times a second each, so left on the shared budget a wave
 * of walkers would push every hit, death and blast out of the buffer.
 */
const FX_DUST_CAP = 140;

// units per second a "skip to wave N" rush spawns at, in place of the
// level's own spawnRate (20/s). High enough that a dozen waves land in a
// second or two, low enough that the pads aren't asked for more room than
// they have every frame — a rush that outruns its pads just stalls on
// crowding until the units ahead walk clear
const RUSH_SPAWN_RATE = 400;

// refused spawns a rush shrugs off per frame before it starts writing wave
// entries off as blocked (see runScript) — a pad is picked at random, so a
// packed but not full field turns plenty of refusals into hits on a retry
const RUSH_RETRIES = 64;

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
 * what keeps the antumbra's 5.75-block hitbox — more than twice anything
 * that walks — off the ground swarm's bill entirely.
 */
const KIND_REACH = UNIT_KINDS.map(
  (k) =>
    (UNIT_STATS[k].radius + (UNIT_STATS[k].flying ? UNIT_RMAX_AIR : UNIT_RMAX_GROUND)) * PHYS_R,
);
/**
 * Spatial hash cell size (px); rebuilt every frame with a counting sort.
 *
 * Sized to the SMALLEST reach on the roster, because that is what twenty
 * thousand daggers scanning is made of. Each query then spans as many
 * cells as its own reach needs (KIND_SPAN), so correctness does not ride
 * on this number at all — only cost does.
 *
 * Sizing it to the widest unit instead, which is the obvious thing to do,
 * makes every dagger in the swarm walk a cell scaled to a unit it will
 * probably never meet: adding the first T4 that way widened the cell by
 * half and cost a fifth of the whole physics pass, in waves with no T4 in
 * them.
 */
const HC = Math.ceil(Math.min(...KIND_REACH));
/**
 * The same reach in cells: a pair further apart than `span * HC` in either
 * axis is more than `span` buckets away, so this is exactly the ring that
 * can hold anything a unit of this kind might be touching.
 *
 * Whichever kind sets HC comes out at 1 — the plain 3x3 — by construction,
 * and on this roster that is the whole ground swarm. Only the heavies
 * widen their own scan.
 */
const KIND_SPAN = KIND_REACH.map((r) => Math.ceil(r / HC));
/**
 * How many buckets a bullet has to look through to find what it flew into:
 * the widest unit it can hit plus its own contact radius, in cells. Fixed
 * per tower kind, since bullet stats are constants — and no longer the
 * flat 1 it used to be, because the antumbra's hitbox is wider than a hash
 * cell and a shot could otherwise pass clean through one whose centre sat
 * two buckets away.
 */
const HIT_SPAN = Object.fromEntries(
  TOWER_KINDS.map((k) => {
    const b = TOWERS[k].bullet;
    return [k, Math.ceil((rmaxFor(b.collidesAir, b.collidesGround) + (b.hitRadius ?? 2.5)) / HC)];
  }),
) as Record<TowerKind, number>;
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
// All three are GROUND-only. Flyers ignore terrain and fly straight at the
// core, so they never funnel on a corridor wall in the first place; leaving
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
const LAT_FRAC = 0.5;
const LAT_RELAX = 0.6;
const LAT_SIGMA = 0.62;
// no drift where there is no room for it, ramping in over a cell of
// clearance above SPREAD_CLEAR
const LAT_ROOM_K = 1 / 1.1;
// 3. Lane centering: ride the clearance gradient back toward the middle of
//    the corridor, so the band the first two forces spread stays centred on
//    the route rather than smearing along the rock. Only the component
//    across the flow is used — this never brakes or hurries the advance —
//    and it fades out past CENTER_CLEAR cells from the nearest wall
const CENTER_CLEAR = 3.2;
const CENTER_GAIN = 18;
const HCOLS = (W / HC) | 0;
const HROWS = (H / HC) | 0;
const HN = HCOLS * HROWS;

export type PlaceResult = "ok" | "invalid" | "would-seal";

// is a unit kind (by numeric id) airborne? towers and bullets check this
// against their targetAir/targetGround and collidesAir/collidesGround flags
const KIND_FLYING: readonly boolean[] = UNIT_KINDS.map((k) => !!UNIT_STATS[k].flying);
// support fields, indexed like UNIT_KINDS — null for kinds with no ability
const KIND_REPAIR = UNIT_KINDS.map((k) => UNIT_STATS[k].repairField ?? null);
const KIND_SHIELD = UNIT_KINDS.map((k) => UNIT_STATS[k].shieldField ?? null);
const KIND_FORCE = UNIT_KINDS.map((k) => UNIT_STATS[k].forceField ?? null);
/** kind ids that carry a force field — the absorb pass is skipped outright
 * when none of them is on the field, so the scan costs nothing in a wave
 * without one */
const FORCE_KINDS = KIND_FORCE.map((f, i) => (f ? i : -1)).filter((i) => i >= 0);
/** the same thing as a flag array: the carrier scan runs over every unit on
 * the field, and one typed-array read per unit is a great deal cheaper
 * there than reaching into KIND_FORCE for an object it will discard */
const KIND_IS_FORCE = Uint8Array.from(KIND_FORCE, (f) => (f ? 1 : 0));
/**
 * UnitType.immunities as one flag per kind. StatusEffects.burning is the
 * only status this game applies, so the whole immunity table collapses to
 * a bit — and Mindustry checks it in StatusComp.apply, BEFORE the effect
 * is added, so an immune unit never burns and never flickers either
 */
const KIND_BURN_IMMUNE = Uint8Array.from(UNIT_KINDS, (k) =>
  UNIT_STATS[k].immunities?.includes("burning") ? 1 : 0,
);
/**
 * UnitType.drag per kind — the fraction of an external shove a unit sheds
 * per tick, and the only thing that reads it is a parallax beam's pull.
 * Mindustry's own default is 0.3, which is what every kind that does not
 * state one carries.
 */
const KIND_DRAG = Float32Array.from(UNIT_KINDS, (k) => UNIT_STATS[k].drag ?? 0.3);
/** the gait of every legged kind, indexed like UNIT_KINDS — null for the
 * mechs and flyers, whose animation is one sliding pair of leg sprites */
const KIND_LEGS = UNIT_KINDS.map((k) => UNIT_STATS[k].legs ?? null);
/** widest leg count on the roster: the stride of the per-leg arrays */
export const MAX_LEGS = Math.max(1, ...KIND_LEGS.map((l) => l?.count ?? 0));
const TAU = Math.PI * 2;

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
  const len = Math.hypot(ex, ey);
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
  const len = Math.hypot(dx, dy);
  const k = len < 1e-6 ? 1 : len < min ? min / len : len > max ? max / len : 1;
  out.x = dx * k;
  out.y = dy * k;
}

/** scratch vectors for the leg pass — one per call site, never nested */
const legTmp: Vec2 = { x: 0, y: 0 };
const legTmp2: Vec2 = { x: 0, y: 0 };

/** any support unit on the roster at all? skips the pass entirely when not */
const HAS_ABILITIES = KIND_REPAIR.some(Boolean) || KIND_SHIELD.some(Boolean) || FORCE_KINDS.length > 0;

// where flyers aim: the core's center in world px — they need no flow
// field. Per map, so a core placed low or high pulls them the right way

// how fast body and chassis swivel: Mindustry's default rotateSpeed /
// baseRotateSpeed, 5 degrees per tick
const ROT_SPD = ((5 * Math.PI) / 180) * 60;
/**
 * UnitType.rotateSpeed per kind, rad/s — how fast the TORSO comes round.
 * Only the heavies override it; everything else takes the default, and the
 * chassis under all of them keeps baseRotateSpeed either way
 */
const KIND_ROT = Float32Array.from(UNIT_KINDS, (k) => {
  const deg = UNIT_STATS[k].rotateSpeed;
  return deg === undefined ? ROT_SPD : ((deg * Math.PI) / 180) * 60;
});

/**
 * The whole simulation: units in struct-of-arrays, a spatial hash for
 * separation and projectile hits, towers, and the flow field they block.
 */
export class Sim {
  readonly field = new FlowField();
  terrain!: Terrain; // assigned by reset() in the constructor
  // the live core's center in world px (terrain.core), what flyers home on
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
   * StatusEffects.burning: seconds of fire left. Reapplying resets it to
   * the full statusDuration rather than stacking, exactly like Mindustry's
   * status map, which keeps one entry per effect
   */
  readonly uburn = new Float32Array(MAX_UNITS);
  /**
   * a never-reused identity, Mindustry's entity id. Indices are recycled by
   * swap-remove the instant anything dies, so anything that must remember a
   * particular unit across ticks — a piercing bullet's hit list — has to
   * hold this instead
   */
  readonly uid = new Int32Array(MAX_UNITS);
  readonly ukind = new Uint8Array(MAX_UNITS); // UNIT_ID of the kind
  /**
   * this walker's sideways bias in [-1, 1]: how far off the flow line it
   * prefers to walk. Wanders on a multi-second clock, so two units that
   * left the same pad a moment apart are soon aiming at different lanes and
   * the stream between them widens into a band. Unused by flyers, which
   * steer straight at the core and are never nudged off it
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
  /** one bit per leg: is it mid-swing this frame? */
  readonly ulegMove = new Uint8Array(MAX_UNITS);
  /** Mindustry LegsComp.totalLength: px walked, the gait's clock */
  readonly ulegT = new Float32Array(MAX_UNITS);
  /** LegsComp.curMoveOffset: the smoothed lean the whole gait takes into
   * the direction of travel, so feet land ahead of a walking body */
  readonly ulegOX = new Float32Array(MAX_UNITS);
  readonly ulegOY = new Float32Array(MAX_UNITS);
  n = 0;
  private nextId = 1;

  level: LevelSpec = WORLDS[0];
  totalEnemies = 0;
  kills = 0;
  leaked = 0;
  /** kills per unit kind this run, indexed like UNIT_KINDS — the drop payout */
  readonly killsByKind = new Int32Array(UNIT_KINDS.length);
  // the core's health: every unit that reaches it takes one point. At 1
  // max, the first leak is the loss — raise this when cores get tougher
  readonly coreHpMax = 1;
  coreHp = this.coreHpMax;
  // which towers may be built and how many of each — null (the default, and
  // the map editor's mode) places no restrictions; the campaign sets it from
  // the save's tech tree before play (see Game.setTech)
  private tech: TechState | null = null;
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
  // the wave being drained, flattened to (region, kind) entries — every
  // entry runs out at the same moment (see nextWaveEntry), each spawning
  // only on its own region's pads (region 0 = any pad)
  private waveEntries: { region: number; kind: number; left: number; total: number }[] = [];
  private waitLeft = 0;
  private spawnAcc = 0;
  // "skip to wave N": while this is set, the script runs with no gaps and a
  // rushed spawn rate until wave N is the one on the field. Nothing is
  // skipped — every wave on the way still enters, they just pile up. 0 = off
  private rushTarget = 0;

  /** seconds of simulated time since the level was reset (Time.time) */
  time = 0;

  towers: Tower[] = [];
  projs: Projectile[] = [];
  effects: Effect[] = [];

  private readonly bStart = new Int32Array(HN + 1);
  private readonly bCount = new Int32Array(HN);
  private readonly bUnits = new Int32Array(MAX_UNITS);
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
  // spawning flyer scans to pick its destination. One entry (the core's
  // centre) on a map with no goal layer, so the old behaviour is the
  // one-goal case of the new one rather than a separate path
  private goalPts = new Float32Array(2);

  // seal-test cache: hover asks canPlace every frame, and the test costs two
  // flow-field recomputes — remember the verdict for the last cell asked
  private sealGx = -1;
  private sealGy = -1;
  private sealResult = false;

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
    this.killsByKind.fill(0);
    this.coreHp = this.coreHpMax;
    this.sealGx = -1;
    this.projs.length = 0;
    this.effects.length = 0;
    this.towers.length = 0;
    // the official map document IS the world: map-editor saves land in its
    // JSON, and the next full page load plays them. The documents are
    // fetched before the sim is built (see Game.create), never imported.
    // A level may name its map; the first official map is the default
    const doc = (this.level.map ? loadMap(this.level.map) : null) ?? OFFICIAL_MAPS[0];
    if (!doc) throw new Error("official maps not loaded — await loadOfficialMaps() first");
    this.terrain = terrainFromMap(doc);
    this.goalX = (this.terrain.core.x + this.terrain.core.size / 2) * CELL;
    this.goalY = (this.terrain.core.y + this.terrain.core.size / 2) * CELL;
    this.field.rebuildWalk(
      this.towers,
      this.terrain.blocked,
      this.terrain.spawn,
      this.terrain.core,
      this.terrain.goal,
    );
    this.buildGoalPts();
    this.field.compute();
    // fail LOUDLY on a broken map: with zero pads nothing ever spawns and a
    // wave script stalls forever, which reads as a scheduler bug otherwise
    if (this.field.spawnAir.length === 0)
      throw new Error(`map "${doc.id}" has no spawn pads — paint some in the editor`);
    // a core sitting on rock is always an authoring slip (a map that moved
    // its core without carving the basin, say) and it reads as "the waves
    // never finish" rather than as a broken map — so say it out loud
    // ...on a map that still HAS one. A goal-layer map never seeds from the
    // core, so its core cells are decoration and may sit under rock
    let walledCore = 0;
    if (!this.usesGoalLayer())
      for (let y = this.terrain.core.y; y < this.terrain.core.y + this.terrain.core.size; y++)
        for (let x = this.terrain.core.x; x < this.terrain.core.x + this.terrain.core.size; x++)
          if (this.terrain.blocked[y * COLS + x]) walledCore++;
    if (walledCore > 0)
      console.warn(
        `map "${doc.id}": ${walledCore} of the core's cells are walled — carve its basin open at ${this.terrain.core.x},${this.terrain.core.y}`,
      );
    if (this.field.spawnPts.length === 0)
      console.warn(`map "${doc.id}": no spawn pad connects to the core — ground waves will stall`);
    this.totalEnemies = 0;
    this.totalWaves = 0;
    // an empty wave is not a wave — loadStep skips it, so it must not count
    // here either, or the HUD would promise a wave that never arrives
    const regions = new Set<number>();
    for (const step of this.level.script) {
      if (!("wave" in step)) continue;
      let n = 0;
      for (const g of waveGroups(step.wave)) {
        for (const c of g.counts) n += c;
        if (g.region > 0) regions.add(g.region);
      }
      if (n === 0) continue;
      this.totalWaves++;
      this.totalEnemies += n;
    }
    // a script naming a region the map doesn't carry falls back to any pad
    // (see spawnPads) — a map/script mismatch, so say so up front
    for (const r of regions) {
      if (!this.field.spawnAirByRegion.get(r)?.length)
        console.warn(`map "${doc.id}" has no region-${r} spawn pads — that wave group will use any pad`);
      else if (!this.field.spawnPtsByRegion.get(r)?.length)
        console.warn(`map "${doc.id}": no region-${r} pad connects to the core — its ground units will use any pad`);
    }
    this.stepIdx = 0;
    this.waitLeft = 0;
    this.spawnAcc = 0;
    this.wavesStarted = 0;
    this.rushTarget = 0;
    this.loadStep();
    this.aliveByKind.fill(0);
  }

  loadLevel(spec: LevelSpec): void {
    this.level = spec;
    this.reset();
  }

  /** does this map route the swarm to painted goal cells rather than a core? */
  usesGoalLayer(): boolean {
    const g = this.terrain.goal;
    for (let i = 0; i < g.length; i++) if (g[i]) return true;
    return false;
  }

  /**
   * Collect every goal cell's centre, for flyers to choose from. Falls back
   * to the core's centre so a pre-goal map is simply the one-goal case —
   * there is no second code path for it anywhere.
   */
  private buildGoalPts(): void {
    const { goal, core } = this.terrain;
    const pts: number[] = [];
    for (let i = 0; i < goal.length; i++)
      if (goal[i]) pts.push((i % COLS) * CELL + CELL / 2, (((i / COLS) | 0) + 0.5) * CELL);
    this.goalPts = Float32Array.from(
      pts.length > 0 ? pts : [this.goalX, this.goalY],
    );
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

  /** the core is down — the game freezes and the score screen takes over */
  lost(): boolean {
    return this.coreHp <= 0;
  }

  /** campaign restrictions on building; null lifts them (editor, dev) */
  setTech(tech: TechState | null): void {
    this.tech = tech;
  }

  /** live towers per kind — the HUD's "2/6" badges, and the cap check */
  towerCounts(): Record<TowerKind, number> {
    const counts = Object.fromEntries(TOWER_KINDS.map((k) => [k, 0])) as Record<TowerKind, number>;
    for (const t of this.towers) counts[t.kind]++;
    return counts;
  }

  /** enemies left to kill: still unspawned + still walking the field */
  remaining(): number {
    return this.totalEnemies - this.kills - this.leaked;
  }

  /** per-kind head count currently on the field, indexed like UNIT_KINDS */
  aliveByKindList(): number[] {
    return Array.from(this.aliveByKind);
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
    return Math.max(1, this.wavesStarted - (this.waitLeft > 0 ? 1 : 0));
  }

  /** seconds until the next wave starts entering, or 0 when one is already
   * draining (or the script has run out) */
  nextWaveIn(): number {
    return this.waitLeft > 0 ? this.waitLeft : 0;
  }

  /** cut the between-waves wait short: the next wave starts entering now.
   * A no-op while a wave is still draining (there is nothing to skip).
   * The gap belongs to the wave loadStep already staged, so zeroing it
   * releases THAT wave — advancing the script here would skip it outright */
  skipWave(): void {
    if (this.waitLeft <= 0) return;
    this.waitLeft = 0;
  }

  /**
   * Run the script forward until wave `n` is the wave on the field. This
   * skips nothing: every wave before `n` still spawns in full, back to back
   * with no gap between them, so the field ends up holding all of them at
   * once. Below the current wave it is a no-op, and 0 cancels a rush already
   * under way. Past the last wave is allowed: it empties the script onto the
   * field and the rush ends there.
   */
  skipToWave(n: number): void {
    const target = Math.floor(n);
    // the wave ON THE FIELD is the yardstick, not `wavesStarted`: asking for
    // the wave already staged inside its gap means "start it now", and the
    // rush releases that gap on its first frame.
    // A target past the end of the script is not clamped — it just means
    // "empty the script onto the field", and runScript drops the rush when
    // the last wave is out
    this.rushTarget = target > this.currentWave() ? target : 0;
  }

  /** the wave a rush is heading for, or 0 when none is running */
  rushingTo(): number {
    return this.rushTarget;
  }

  private addTower(gx: number, gy: number, kind: TowerKind): void {
    const sz = TOWERS[kind].size;
    this.towers.push({
      kind,
      gx,
      gy,
      x: (gx + sz / 2) * CELL,
      y: (gy + sz / 2) * CELL,
      cd: Math.random() * 0.1,
      angle: 0,
      burstLeft: 0,
      burstT: 0,
      shotCount: 0,
      aimX: 0,
      aimY: 0,
      chargeT: -1,
      beamX: 0,
      beamY: 0,
      beamStr: 0,
    });
  }

  update(dt: number): void {
    // Mindustry Time.time: seconds of SIMULATED time, so animations driven
    // by it (the shield hatch) speed up with the game speed and hold still
    // while the sim is paused
    this.time += dt;
    this.runScript(dt);

    this.buildHash();
    this.updatePhysics();
    this.updateUnits(dt);
    this.updateAbilities(dt);
    this.updateStatus(dt);
    // ShieldComp: shieldAlpha fades out over 15 ticks once nothing refreshes it
    for (let i = 0; i < this.n; i++)
      if (this.ushieldAlpha[i] > 0) this.ushieldAlpha[i] = Math.max(0, this.ushieldAlpha[i] - dt * (60 / 15));
    this.fireTowers(dt);
    this.updateProjectiles(dt);

    const fx = this.effects;
    for (let e = fx.length - 1; e >= 0; e--) {
      fx[e].age += dt;
      if (fx[e].age >= fx[e].ttl) {
        fx[e] = fx[fx.length - 1];
        fx.pop();
      }
    }
  }

  // ---------- level script ----------

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
    this.waitLeft = 0;
    const script = this.level.script;
    for (; this.stepIdx < script.length; this.stepIdx++) {
      const step = script[this.stepIdx];
      for (const g of waveGroups(step.wave))
        for (let kind = 0; kind < g.counts.length; kind++)
          if (g.counts[kind] > 0)
            this.waveEntries.push({ region: g.region, kind, left: g.counts[kind], total: g.counts[kind] });
      if (this.waveEntries.length > 0) {
        this.wavesStarted++;
        // hold the gap, then let this wave drain — waitLeft gates runScript
        this.waitLeft = Math.max(0, this.level.waveGap);
        return;
      }
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
   * `skip` (their region's pads were too crowded this frame) don't compete.
   */
  private nextWaveEntry(
    skip: ReadonlySet<unknown>,
  ): { region: number; kind: number; left: number; total: number } | null {
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
   * the current wave at its spawn rate. A failed spawn (the drop zone is too
   * crowded) leaves the unit in the wave and keeps its drain credit for a
   * later frame, so a packed field delays a wave rather than swallowing it.
   */
  private runScript(dt: number): void {
    // a rush eats the gaps outright, the arrival frame included — landing on
    // the target wave releases it immediately rather than parking the player
    // in front of one more countdown
    if (this.rushTarget > 0) {
      this.waitLeft = 0;
      if (this.wavesStarted >= this.rushTarget) this.rushTarget = 0;
    }
    if (this.waitLeft > 0) {
      this.waitLeft -= dt;
      // the gap belongs to the wave already loaded, so running it out just
      // releases that wave — there is no next step to advance to
      if (this.waitLeft > 0) return;
      this.waitLeft = 0;
    }

    let left = 0;
    for (const e of this.waveEntries) left += e.left;
    if (left === 0) {
      this.rushTarget = 0; // script finished — nothing left to rush toward
      return;
    }

    // a rush drains at RUSH_SPAWN_RATE, and one wave per frame at most: the
    // wave that empties here only advances the script at the bottom of this
    // call, so the next one starts on the next frame. That keeps the rush
    // bounded no matter how far ahead the target is
    const rate = this.rushTarget > 0 ? RUSH_SPAWN_RATE : this.level.spawnRate;
    this.spawnAcc = Math.min(this.spawnAcc + rate * dt, rate);
    // one region's crowded pads must not stall the other regions' share of
    // the wave — a failed entry sits out the rest of this frame while the
    // remaining entries keep draining
    const blocked = new Set<unknown>();
    // a rush spawns into a field that is already packed, so the first
    // refusal is normal rather than a sign the pads are full — it retries
    // (the pad picked is random) before writing the entry off for the frame
    let retries = this.rushTarget > 0 ? RUSH_RETRIES : 0;
    while (left > 0 && this.spawnAcc >= 1) {
      const e = this.nextWaveEntry(blocked);
      if (!e) break;
      if (!this.spawnUnit(UNIT_KINDS[e.kind], e.region)) {
        if (retries > 0) retries--;
        else blocked.add(e);
        continue;
      }
      e.left--;
      this.spawnAcc--;
      left--;
    }
    if (left === 0) this.nextStep();
  }

  // ---------- placement ----------

  /** the 2x2 footprint is on the map, off the core, and free of walls */
  private cellsFree(gx: number, gy: number): boolean {
    if (gx < 0 || gy < 0 || gx > COLS - 2 || gy > ROWS - 2) return false;
    const { walk, isGoal } = this.field;
    for (let y = gy; y < gy + 2; y++)
      for (let x = gx; x < gx + 2; x++) {
        const i = y * COLS + x;
        if (walk[i] || isGoal[i]) return false;
      }
    return true;
  }

  /** no unit may be standing on (or overhanging into) the footprint */
  private areaClearOfUnits(gx: number, gy: number): boolean {
    const x0 = gx * CELL, y0 = gy * CELL;
    const x1 = x0 + CELL * 2, y1 = y0 + CELL * 2;
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

  /** would this footprint cut the swarm's last route to the core? */
  private wouldSeal(gx: number, gy: number): boolean {
    if (gx === this.sealGx && gy === this.sealGy) return this.sealResult;
    const sealed = this.field.sealsSpawns(gx, gy);
    this.sealGx = gx;
    this.sealGy = gy;
    this.sealResult = sealed;
    return sealed;
  }

  /**
   * Towers build on HIGHGROUND only: mountain/rock wall cells (not forest,
   * not floor), free of other towers. They overlook the lanes and never
   * touch the flow field — the rock was already unwalkable.
   */
  canPlace(gx: number, gy: number, kind: TowerKind): boolean {
    // tech gate first: a locked tower or an exhausted cap refuses everywhere,
    // so the drag-chain and keyboard paths can't sidestep the menu
    if (this.tech) {
      if (!this.tech.unlocked.has(kind)) return false;
      let count = 0;
      for (const t of this.towers) if (t.kind === kind) count++;
      if (count >= this.tech.caps[kind]) return false;
    }
    const sz = TOWERS[kind].size;
    if (gx < 0 || gy < 0 || gx > COLS - sz || gy > ROWS - sz) return false;
    const { blocked, wall } = this.terrain;
    for (let y = gy; y < gy + sz; y++)
      for (let x = gx; x < gx + sz; x++) {
        const i = y * COLS + x;
        // pine forests are the one un-buildable kind of blocked cell; every
        // rock family (stone, dirt, dark carbon: indices above the sentinel
        // too) is tower real estate
        if (!blocked[i] || wall[i] === WALL_PINE) return false;
      }
    for (const t of this.towers) {
      const tsz = TOWERS[t.kind].size;
      if (gx < t.gx + tsz && t.gx < gx + sz && gy < t.gy + tsz && t.gy < gy + sz)
        return false;
    }
    return true;
  }

  placeTower(gx: number, gy: number, kind: TowerKind): PlaceResult {
    if (!this.canPlace(gx, gy, kind)) return "invalid";
    this.addTower(gx, gy, kind);
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
    this.towers.splice(this.towers.indexOf(t), 1);
    // the rock under it belongs to the mountain — nothing to unblock
    this.pushFx(t.x, t.y, 0.35, FxKind.Death); // demolish puff
    return true;
  }

  /**
   * Future ground-placed structures build on the floor with the full rule
   * set towers used to have: free walkable cells, no units underfoot, and
   * no sealing of the swarm's last route. Blocks the cells and recomputes
   * the flow. Unused today — kept wired for when such structures exist.
   */
  placeGroundStructure(gx: number, gy: number): PlaceResult {
    if (!this.cellsFree(gx, gy) || !this.areaClearOfUnits(gx, gy)) return "invalid";
    if (this.wouldSeal(gx, gy)) return "would-seal";
    const { walk } = this.field;
    for (let y = gy; y < gy + 2; y++)
      for (let x = gx; x < gx + 2; x++) walk[y * COLS + x] = 1;
    this.field.compute();
    this.sealGx = -1; // the wall layout changed; cached verdicts are stale
    this.unstickUnits();
    return "ok";
  }

  // ---------- spawning ----------

  /**
   * A spawn spot is free if no unit from last frame's hash sits on it —
   * keeps the spawn strip from overcrowding, so separation never
   * slingshots units forward.
   */
  private spawnSpotFree(x: number, y: number, r: number, fly: boolean, span: number): boolean {
    const hx = clamp((x / HC) | 0, 0, HCOLS - 1);
    const hy = clamp((y / HC) | 0, 0, HROWS - 1);
    for (let gy = Math.max(0, hy - span); gy <= Math.min(HROWS - 1, hy + span); gy++) {
      for (let gx = Math.max(0, hx - span); gx <= Math.min(HCOLS - 1, hx + span); gx++) {
        const c = gy * HCOLS + gx, e = this.bStart[c + 1];
        for (let k = this.bStart[c]; k < e; k++) {
          const i = this.bUnits[k];
          if (i >= this.n || KIND_FLYING[this.ukind[i]] !== fly) continue;
          // free means the physics circles wouldn't touch, so a fresh
          // spawn never starts mid-shove; only the same layer counts —
          // air and ground never collide
          const dx = this.upx[i] - x, dy = this.upy[i] - y;
          const rs = (r + this.urad[i]) * PHYS_R;
          if (dx * dx + dy * dy < rs * rs) return false;
        }
      }
    }
    return true;
  }

  /** the pad cells a unit may enter on: its wave group's region, or every
   * pad for a region-less group (region 0). A region the map doesn't carry
   * — or whose pads are all cut off — falls back to every pad, so a
   * mismatched script keeps playing instead of stalling (warned at reset) */
  private spawnPads(fly: boolean, region: number): number[] {
    const all = fly ? this.field.spawnAir : this.field.spawnPts;
    if (region <= 0) return all;
    const byRegion = fly ? this.field.spawnAirByRegion : this.field.spawnPtsByRegion;
    const pads = byRegion.get(region);
    return pads && pads.length > 0 ? pads : all;
  }

  private spawnUnit(kind: UnitKind, region: number): boolean {
    const stats = UNIT_STATS[kind];
    const fly = !!stats.flying;
    // every enemy enters on a spawn pad from the terrain's spawn layer;
    // walkers need a pad connected to the core, flyers take any open pad
    const pads = this.spawnPads(fly, region);
    if (this.n >= MAX_UNITS || pads.length === 0) return false;
    const r = stats.radius;
    // the drop-zone test is the same broad-phase query the physics pass
    // runs, so it needs the same reach: a ring of 1 would let two antumbras
    // land inside one another and start the wave already shoving
    const span = KIND_SPAN[UNIT_ID[kind]];
    for (let a = 0; a < 8; a++) {
      const ci = pads[(Math.random() * pads.length) | 0];
      // jitter within the pad, but keep the hitbox inside the cell when it
      // fits (a mace is wider than a tile — it spawns pad-centered)
      const j = Math.max(0, CELL / 2 - r - 1);
      const x = ((ci % COLS) + 0.5) * CELL + (Math.random() * 2 - 1) * j;
      const y = (((ci / COLS) | 0) + 0.5) * CELL + (Math.random() * 2 - 1) * j;
      // a big hitbox can overhang the pad into ragged rock beside it
      if ((!fly && this.field.hitsWall(x, y, WALL_R)) || !this.spawnSpotFree(x, y, r, fly, span))
        continue;
      const i = this.n++;
      // LEVEL SCALING, and the only stat the ladder touches: health alone
      // moves with the enemy level, so armour, speed, hitbox and drop stay
      // exactly where UNIT_STATS put them however high the tier climbs.
      // That is what keeps a tier-1 dagger a dagger — a fat one, but still
      // something a duo shot lands its full 9 damage on
      const hp = unitHpAtLevel(kind, this.level.enemyLevel ?? 0);
      this.upx[i] = x;
      this.upy[i] = y;
      this.uvx[i] = 0;
      this.uvy[i] = 0;
      this.uhp[i] = hp;
      this.uhpmax[i] = hp;
      this.uspd[i] = stats.speed;
      this.urad[i] = r;
      // flyers never read the flow field, so the routing the field does for
      // free has to be done by hand for them — once, here, not per tick
      if (fly) {
        const g = this.nearestGoal(x, y);
        this.ugx[i] = g.x;
        this.ugy[i] = g.y;
      }
      this.uarmor[i] = stats.armor;
      // ForceFieldAbility.created: a carrier walks in with the bubble
      // already full, so the first tower to see one meets 500 points of
      // shield rather than a field still charging up
      this.ushield[i] = stats.forceField ? stats.forceField.max : 0;
      this.ushieldAlpha[i] = 0;
      this.uforceScale[i] = 0;
      this.uforceDown[i] = 0;
      // a fresh support unit waits a full cycle before its first pulse,
      // exactly like a newly constructed Ability's zeroed timer
      this.uability[i] = 0;
      this.upullx[i] = 0;
      this.upully[i] = 0;
      this.uburn[i] = 0;
      this.uid[i] = this.nextId++;
      this.ukind[i] = UNIT_ID[kind];
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
    for (let i = 0; i < this.n; i++) {
      const k = ukind[i];
      const force = KIND_FORCE[k];
      if (force) {
        // ForceFieldAbility.update. The break is billed to the pool itself:
        // draining it by one cooldown's worth of regen means the same
        // steady +regen that refills the field is also what times its
        // outage, and the field is dark for exactly `cooldown` seconds
        if (ushield[i] <= 0 && !uforceDown[i]) {
          ushield[i] -= force.cooldown * force.regen;
          // Fx.shieldBreak: the outline snapping outward as it pops
          this.pushFx(
            upx[i], upy[i], 40 / 60, FxKind.ShieldBreak,
            force.rotation, force.radius * uforceScale[i], 0, force.sides,
          );
        }
        uforceDown[i] = ushield[i] <= 0 ? 1 : 0;
        // regen is unconditional, so a pool sitting at -144 climbs back
        // through zero on its own and the field comes up again
        if (ushield[i] < force.max) ushield[i] = Math.min(ushield[i] + force.regen * dt, force.max);
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
      if (!repair && !shield) continue;
      const reload = (repair ?? shield)!.reload;
      uability[i] += dt;
      if (uability[i] < reload) continue;
      uability[i] = 0;

      const range = (repair ?? shield)!.range;
      // RepairFieldAbility.wasHealed / ShieldRegenFieldAbility.applied: the
      // carrier's wave only plays when the pulse actually did something
      let did = false;
      const pad = range + UNIT_RMAX;
      const hx0 = clamp(((upx[i] - pad) / HC) | 0, 0, HCOLS - 1);
      const hy0 = clamp(((upy[i] - pad) / HC) | 0, 0, HROWS - 1);
      const hx1 = clamp(((upx[i] + pad) / HC) | 0, 0, HCOLS - 1);
      const hy1 = clamp(((upy[i] + pad) / HC) | 0, 0, HROWS - 1);
      for (let hy = hy0; hy <= hy1; hy++) {
        for (let hx = hx0; hx <= hx1; hx++) {
          const c = hy * HCOLS + hx, e = this.bStart[c + 1];
          for (let b = this.bStart[c]; b < e; b++) {
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
            if (shield && ushield[j] < shield.max) {
              ushield[j] = Math.min(ushield[j] + shield.amount, shield.max);
              ushieldAlpha[j] = 1;
              did = true;
            }
          }
        }
      }
      // healWaveDynamic / shieldWave: a 22-tick ring out to the field edge
      if (did)
        this.pushFx(upx[i], upy[i], 22 / 60, repair ? FxKind.HealWave : FxKind.ShieldWave, 0, range);
    }
  }

  /**
   * StatusEffect.update for the one status we carry, burning: it ticks
   * damageContinuousPierce every frame — armour-piercing, though a shield
   * still eats it — and flickers Fx.burning at effectChance per tick from a
   * random point inside the unit's hitbox. Walking backwards so a unit that
   * burns to death can be swap-removed without skipping its neighbour.
   */
  private updateStatus(dt: number): void {
    const { uburn, uhp, upx, upy, urad } = this;
    for (let i = this.n - 1; i >= 0; i--) {
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

  /** a tower kill: death puff, removal, and the per-kind drop ledger */
  private killUnit(i: number): void {
    this.killsByKind[this.ukind[i]]++;
    this.pushFx(this.upx[i], this.upy[i], 0.35, FxKind.Death);
    this.removeUnit(i);
    this.kills++;
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
    this.upx[i] = this.upx[n];
    this.upy[i] = this.upy[n];
    this.uvx[i] = this.uvx[n];
    this.uvy[i] = this.uvy[n];
    this.uhp[i] = this.uhp[n];
    this.uhpmax[i] = this.uhpmax[n];
    this.uspd[i] = this.uspd[n];
    this.urad[i] = this.urad[n];
    this.uarmor[i] = this.uarmor[n];
    this.ushield[i] = this.ushield[n];
    this.ushieldAlpha[i] = this.ushieldAlpha[n];
    this.uability[i] = this.uability[n];
    this.upullx[i] = this.upullx[n];
    this.upully[i] = this.upully[n];
    this.uforceScale[i] = this.uforceScale[n];
    this.uforceDown[i] = this.uforceDown[n];
    this.uburn[i] = this.uburn[n];
    this.uid[i] = this.uid[n];
    this.ukind[i] = this.ukind[n];
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
      const ang = rot + (TAU / n) * k + Math.PI / n;
      const ca = Math.cos(ang), sa = Math.sin(ang);
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
    // that carry it — legSplashDamage. Arkyid is the only kind on this
    // roster with that last one, and it has nothing to land on: its 32
    // damage over 30 units hits enemy units and buildings, and the player
    // here fields no units and builds towers that cannot be damaged. So
    // what a footfall leaves behind is the dust, scaled by rippleScale
    const landed = this.ulegMove[i] & ~bits;
    if (landed !== 0 && this.effects.length < FX_DUST_CAP) {
      for (let k = 0; k < n; k++) {
        if ((landed & (1 << k)) === 0) continue;
        this.pushFx(ulegFX[off + k], ulegFY[off + k], 30 / 60, FxKind.Footfall,
          L.ripple, 0, (Math.random() * 0x7fffffff) | 0);
      }
    }
    this.ulegMove[i] = bits;
  }

  // ---------- spatial hash ----------

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
    const { upx, upy, urad, ukind, uvx, uvy, uhx, uhy, uid, phx, phy, bStart, bUnits } = this;
    const { clear } = this.field;
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
        !KIND_FLYING[ukind[i]] &&
        clear[
          clamp((upy[i] / CELL) | 0, 0, ROWS - 1) * COLS +
            clamp((upx[i] / CELL) | 0, 0, COLS - 1)
        ] >= SPREAD_CLEAR;
      uhx[i] = room ? vx / vl : 0;
      uhy[i] = room ? vy / vl : 0;
    }
    for (let i = 0; i < n; i++) {
      const fly = KIND_FLYING[ukind[i]];
      const ri = urad[i] * PHYS_R;
      const mi = urad[i] * urad[i]; // hitSize^2 * pi — the pi cancels in the ratio
      const hx = clamp((phx[i] / HC) | 0, 0, HCOLS - 1);
      const hy = clamp((phy[i] / HC) | 0, 0, HROWS - 1);
      const sp = KIND_SPAN[ukind[i]];
      for (let gy = Math.max(0, hy - sp); gy <= Math.min(HROWS - 1, hy + sp); gy++) {
        for (let gx = Math.max(0, hx - sp); gx <= Math.min(HCOLS - 1, hx + sp); gx++) {
          const c = gy * HCOLS + gx, e = bStart[c + 1];
          for (let k = bStart[c]; k < e; k++) {
            const j = bUnits[k];
            if (j <= i || j >= n || KIND_FLYING[ukind[j]] !== fly) continue;
            const rs = ri + urad[j] * PHYS_R;
            let dx = phx[i] - phx[j], dy = phy[i] - phy[j];
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
            phx[i] += dx * push * mj;
            phy[i] += dy * push * mj;
            phx[j] -= dx * push * mi;
            phy[j] -= dy * push * mi;
          }
        }
      }
    }
  }

  private updateUnits(dt: number): void {
    const { upx, upy, uvx, uvy, uspd, ukind, uwalk, ubrot, urot, ulat, phx, phy, field, flowTmp } =
      this;
    const { upullx, upully } = this;
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
    const { isGoal, walk } = field;

    for (let i = this.n - 1; i >= 0; i--) {
      const cx = clamp((upx[i] / CELL) | 0, 0, COLS - 1);
      const cy = clamp((upy[i] / CELL) | 0, 0, ROWS - 1);
      const ci = cy * COLS + cx;
      if (isGoal[ci]) {
        this.pushFx(upx[i], upy[i], 0.4, FxKind.Breach);
        this.removeUnit(i);
        this.leaked++;
        if (this.coreHp > 0) this.coreHp--;
        continue;
      }

      const fly = KIND_FLYING[ukind[i]];
      if (fly) {
        // flyers ignore the maze: aim straight at the exit they picked when
        // they spawned (the core's centre on a map with no goal layer)
        const gdx = this.ugx[i] - upx[i], gdy = this.ugy[i] - upy[i];
        const gl = Math.hypot(gdx, gdy) || 1;
        flowTmp.x = gdx / gl;
        flowTmp.y = gdy / gl;
      } else {
        field.sample(upx[i], upy[i], flowTmp);
      }
      uvx[i] += (flowTmp.x * uspd[i] - uvx[i]) * steer;
      uvy[i] += (flowTmp.y * uspd[i] - uvy[i]) * steer;

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
      // straight line to the core they have always flown — open sky has no
      // corridor to spread across and no walls to crowd against, so the
      // crowd fixes a corridor needs would only add wobble up there
      if (!fly) {
        const cl = field.clear[ci];

        // lateral drift. The physics re-aim above only spreads units already
        // touching; once a stream is strung out single file nothing is left
        // to widen it. So each walker wanders a little across the flow, on a
        // multi-second clock so the walk actually accumulates instead of
        // averaging away frame to frame. The bias reverts to zero, so a unit
        // drifts off the line and back rather than committing to a wall
        ulat[i] = clamp(ulat[i] + (Math.random() * 2 - 1) * LAT_N - ulat[i] * LAT_A, -1, 1);
        const room = clamp((cl - SPREAD_CLEAR) * LAT_ROOM_K, 0, 1);
        if (room > 0) {
          const drift = ulat[i] * LAT_FRAC * uspd[i] * room;
          fx -= flowTmp.y * drift;
          fy += flowTmp.x * drift;
        }

        // wall repulsion probes: push off nearby walls so corners can't wedge
        // units (in a 1-wide corridor both sides fire and cancel — harmless)
        if (field.blockedPx(upx[i] + PR, upy[i])) fx -= REP;
        if (field.blockedPx(upx[i] - PR, upy[i])) fx += REP;
        if (field.blockedPx(upx[i], upy[i] + PR)) fy -= REP;
        if (field.blockedPx(upx[i], upy[i] - PR)) fy += REP;

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
          const cw = field.clear;
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
        // inside the turn's window and redirects its speed into the turn
        const bL = cx <= 0 || walk[cy * COLS + cx - 1] === 1;
        const bR = cx >= COLS - 1 || walk[cy * COLS + cx + 1] === 1;
        const bU = cy <= 0 || walk[(cy - 1) * COLS + cx] === 1;
        const bD = cy >= ROWS - 1 || walk[(cy + 1) * COLS + cx] === 1;
        if (bL && bR) fx += ((cx + 0.5) * CELL - upx[i]) * CENTER_K;
        if (bU && bD) fy += ((cy + 0.5) * CELL - upy[i]) * CENTER_K;
      }

      // the unit's own drive (flow + terrain steering) never exceeds its
      // stat speed; the physics shove then rides on top uncapped
      let mvx = uvx[i] + fx, mvy = uvy[i] + fy;
      const ml = Math.hypot(mvx, mvy);
      if (ml > uspd[i]) {
        mvx = (mvx / ml) * uspd[i];
        mvy = (mvy / ml) * uspd[i];
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
      const wedged = fly || field.hitsWall(upx[i], upy[i], WALL_R);
      let nx = upx[i] + dxT;
      if (!wedged && field.hitsWall(nx, upy[i], WALL_R)) {
        const cX =
          dxT > 0
            ? Math.floor((nx + WALL_R) / CELL) * CELL - WALL_R
            : Math.ceil((nx - WALL_R) / CELL) * CELL + WALL_R;
        const fwd = dxT > 0 ? cX > upx[i] : cX < upx[i];
        if (fwd && !field.hitsWall(cX, upy[i], WALL_R)) nx = cX;
        else {
          nx = upx[i];
          uvy[i] += Math.sign(uvy[i] || flowTmp.y || 1) * Math.abs(uvx[i]) * 0.6;
          uvx[i] = 0;
        }
      }
      let ny = upy[i] + dyT;
      if (!wedged && field.hitsWall(nx, ny, WALL_R)) {
        const cY =
          dyT > 0
            ? Math.floor((ny + WALL_R) / CELL) * CELL - WALL_R
            : Math.ceil((ny - WALL_R) / CELL) * CELL + WALL_R;
        const fwd = dyT > 0 ? cY > upy[i] : cY < upy[i];
        if (fwd && !field.hitsWall(nx, cY, WALL_R)) ny = cY;
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
      const len = Math.hypot(mdx, mdy);
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
    }
  }

  /** push units out of freshly blocked cells (after tower placement) */
  private unstickUnits(): void {
    const { upx, upy, ukind, field } = this;
    for (let i = 0; i < this.n; i++) {
      // flyers are allowed over walls — never teleport them off a mountain
      if (KIND_FLYING[ukind[i]] || !field.hitsWall(upx[i], upy[i], WALL_R)) continue;
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

  /**
   * The Turret.java loop: reload runs regardless of targeting, queued volley
   * shots fire on their shotDelay timers at the turret's current rotation,
   * the barrel turns toward the intercept point at rotateSpeed, and a new
   * volley starts only when aimed within shootCone of the target.
   */
  private fireTowers(dt: number): void {
    const { upx, upy, uvx, uvy } = this;
    for (const t of this.towers) {
      const st = TOWERS[t.kind];
      // a tractor turret has no reload and no volley — it holds a beam
      if (st.bullet.tractor) {
        this.updateTractor(t, st, dt);
        continue;
      }
      if (t.cd > 0) t.cd -= dt;

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

      let best = -1, bd = st.range * st.range;
      for (let i = 0; i < this.n; i++) {
        // air-only turrets ignore the ground swarm and vice versa
        if (KIND_FLYING[this.ukind[i]] ? !st.targetAir : !st.targetGround) continue;
        const dx = upx[i] - t.x, dy = upy[i] - t.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < bd) {
          bd = d2;
          best = i;
        }
      }
      if (best < 0) continue;

      // Predict.intercept: aim where target and bullet paths cross. Hitscan
      // bullets (speed ~0) aim straight at the target, like Mindustry's
      // predictTarget guard (bullet.speed >= 0.01 or no lead at all)
      const dx = upx[best] - t.x, dy = upy[best] - t.y;
      let aimX = dx, aimY = dy;
      if (st.bullet.speed >= 1) {
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
        const turn = st.rotateSpeed * dt;
        t.angle = Math.abs(diff) <= turn ? targetRot : t.angle + Math.sign(diff) * turn;
      }

      // updateShooting: a charging turret starts no new volley, though its
      // reload keeps running underneath (reloadWhileCharging, the default)
      if (t.cd <= 0 && t.chargeT < 0 && Math.abs(Sim.angleDiff(t.angle, targetRot)) < st.shootCone) {
        t.cd += st.reload; // reloadCounter %= reload
        // artillery lands its shells here: the intercept point in world px
        t.aimX = t.x + aimX;
        t.aimY = t.y + aimY;
        if (st.chargeTime) {
          t.chargeT = st.chargeTime; // fires when it runs out, above
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
    // BulletType.shootEffect, fired at the muzzle along the shot's angle.
    // For scorch this IS the weapon: the bullet draws nothing at all
    if (st.bullet.invisible)
      this.pushFx(x, y, 32 / 60, FxKind.Flame, a, 0, (Math.random() * 0x7fffffff) | 0);
    if (st.bullet.lightning) {
      const pts = this.lightningBolt(
        x, y, a,
        st.bullet.damage,
        st.bullet.lightning.length,
        st.bullet.hitRadius ?? 2.5,
        st.bullet.collidesAir,
        st.bullet.collidesGround,
      );
      this.pushBolt(x, y, st.bullet.lifetime, pts);
      return;
    }
    if (st.bullet.laser) {
      const reached = this.laserBeam(
        x, y, a,
        st.bullet.laser.length,
        st.bullet.damage,
        st.bullet.laser.pierceCap,
        st.bullet.armorMultiplier ?? 1,
        st.bullet.collidesAir,
        st.bullet.collidesGround,
      );
      this.pushFx(x, y, st.bullet.lifetime, FxKind.Laser, a, reached);
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
      );
      this.pushFx(x, y, st.bullet.lifetime, FxKind.Shrapnel, a, st.bullet.ray.length);
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
    });
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
  ): void {
    const { upx, upy, uhp, uarmor, urad, ukind, bStart, bUnits, splashHits } = this;
    const EXPAND = 7.5; // collideLine's expand = 3 world units
    const dirx = Math.cos(angle), diry = Math.sin(angle);
    const x2 = x + dirx * length, y2 = y + diry * length;
    const pad = rmaxFor(air, ground) + EXPAND;
    const hx0 = clamp(((Math.min(x, x2) - pad) / HC) | 0, 0, HCOLS - 1);
    const hy0 = clamp(((Math.min(y, y2) - pad) / HC) | 0, 0, HROWS - 1);
    const hx1 = clamp(((Math.max(x, x2) + pad) / HC) | 0, 0, HCOLS - 1);
    const hy1 = clamp(((Math.max(y, y2) + pad) / HC) | 0, 0, HROWS - 1);
    splashHits.length = 0;
    for (let hy = hy0; hy <= hy1; hy++) {
      for (let hx = hx0; hx <= hx1; hx++) {
        const c = hy * HCOLS + hx, e = bStart[c + 1];
        for (let k = bStart[c]; k < e; k++) {
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
    }
    for (const i of splashHits) {
      this.damageUnit(i, dmg);
      if (uhp[i] > 0) this.pushFx(upx[i], upy[i], 0.12, FxKind.Hit);
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
    const pad = brad + rmaxFor(air, ground);
    const hx0 = clamp(((x - pad) / HC) | 0, 0, HCOLS - 1);
    const hy0 = clamp(((y - pad) / HC) | 0, 0, HROWS - 1);
    const hx1 = clamp(((x + pad) / HC) | 0, 0, HCOLS - 1);
    const hy1 = clamp(((y + pad) / HC) | 0, 0, HROWS - 1);
    let best = -1, bd = Infinity;
    for (let hy = hy0; hy <= hy1; hy++) {
      for (let hx = hx0; hx <= hx1; hx++) {
        const c = hy * HCOLS + hx, e = bStart[c + 1];
        for (let k = bStart[c]; k < e; k++) {
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
    }
    return best;
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
        if (uhp[victim] > 0) this.pushFx(x, y, 0.12, FxKind.Hit);
        else if (!hits.includes(victim)) hits.push(victim);
      }
      pts.push(x + (Math.random() * 2 - 1) * 3 * MU, y + (Math.random() * 2 - 1) * 3 * MU);

      // the chain: the furthest un-hit enemy whose hitbox touches the square
      let far = -1, fd = -1;
      if (chained.size < MAX_CHAIN) {
        const pad = half + rmaxFor(air, ground);
        const hx0 = clamp(((x - pad) / HC) | 0, 0, HCOLS - 1);
        const hy0 = clamp(((y - pad) / HC) | 0, 0, HROWS - 1);
        const hx1 = clamp(((x + pad) / HC) | 0, 0, HCOLS - 1);
        const hy1 = clamp(((y + pad) / HC) | 0, 0, HROWS - 1);
        for (let hy = hy0; hy <= hy1; hy++) {
          for (let hx = hx0; hx <= hx1; hx++) {
            const c = hy * HCOLS + hx, e = bStart[c + 1];
            for (let k = bStart[c]; k < e; k++) {
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
  ): number {
    const { upx, upy, uhp, urad, ukind, bStart, bUnits } = this;
    const EXPAND = 7.5; // collideLine's expand = 3 world units
    const dirx = Math.cos(angle), diry = Math.sin(angle);
    const hits = this.boltHits;
    hits.length = 0;
    const dists = this.boltDists;
    dists.length = 0;
    const x2 = x + dirx * length, y2 = y + diry * length;
    const pad = rmaxFor(air, ground) + EXPAND;
    const hx0 = clamp(((Math.min(x, x2) - pad) / HC) | 0, 0, HCOLS - 1);
    const hy0 = clamp(((Math.min(y, y2) - pad) / HC) | 0, 0, HROWS - 1);
    const hx1 = clamp(((Math.max(x, x2) + pad) / HC) | 0, 0, HCOLS - 1);
    const hy1 = clamp(((Math.max(y, y2) + pad) / HC) | 0, 0, HROWS - 1);
    for (let hy = hy0; hy <= hy1; hy++) {
      for (let hx = hx0; hx <= hx1; hx++) {
        const c = hy * HCOLS + hx, e = bStart[c + 1];
        for (let k = bStart[c]; k < e; k++) {
          const i = bUnits[k];
          if (i >= this.n || uhp[i] <= 0) continue;
          if (KIND_FLYING[ukind[i]] ? !air : !ground) continue;
          const tt = clamp((upx[i] - x) * dirx + (upy[i] - y) * diry, 0, length);
          const dx = upx[i] - (x + dirx * tt), dy = upy[i] - (y + diry * tt);
          const rr = urad[i] + EXPAND;
          if (dx * dx + dy * dy < rr * rr) {
            hits.push(i);
            dists.push(Math.hypot(upx[i] - x, upy[i] - y));
          }
        }
      }
    }
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
      if (uhp[i] > 0) this.pushFx(upx[i], upy[i], 0.12, FxKind.Hit);
      else dead.push(i);
    }
    dead.sort((a, b) => b - a);
    for (const i of dead) if (uhp[i] <= 0) this.killUnit(i);
    return reached;
  }

  /** scratch for the two instant weapons; never nested, never persisted */
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
    const { upx, upy, uhp, urad, ukind, upullx, upully } = this;
    // Units.closestEnemy, over the turret's own layer filter
    let best = -1, bd = Infinity;
    for (let i = 0; i < this.n; i++) {
      if (KIND_FLYING[ukind[i]] ? !st.targetAir : !st.targetGround) continue;
      const dx = upx[i] - t.x, dy = upy[i] - t.y;
      const d = Math.hypot(dx, dy);
      // within(range + hitSize/2): a wide target counts from its edge
      if (d < bd && d <= st.range + urad[i]) {
        bd = d;
        best = i;
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
    // impulse(v) is vel += v / mass, and mass is the hitbox's own area
    const hitSize = (urad[best] * 2) / MU;
    const mass = hitSize * hitSize * Math.PI;
    const mag = spec.force + (1 - bd / st.range) * spec.scaledForce;
    // world units per tick, over this frame's ticks, into px per second
    const dv = ((mag * dt * 60) / mass) * MU * 60;
    const inv = bd > 1e-4 ? 1 / bd : 0;
    upullx[best] += (t.x - upx[best]) * inv * dv;
    upully[best] += (t.y - upy[best]) * inv * dv;
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
  private damageUnit(i: number, raw: number, pierceArmor = false, armorMult = 1): void {
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
    const dst = Math.hypot(dx, dy);
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
    return false;
  }

  private updateProjectiles(dt: number): void {
    const { upx, upy, uhp, uarmor, urad, projs, bStart, bUnits } = this;
    this.collectForceFields();
    for (let p = projs.length - 1; p >= 0; p--) {
      const pr = projs[p];
      const b = TOWERS[pr.kind].bullet;
      pr.x += pr.vx * dt;
      pr.y += pr.vy * dt;
      pr.life -= dt;
      pr.age += dt;

      // a force field eats the shot where it stands: no hit, no splash
      if (this.fldN > 0 && this.absorb(pr.x, pr.y, b.damage)) {
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
        const sp = HIT_SPAN[pr.kind];
        const hx = clamp((pr.x / HC) | 0, 0, HCOLS - 1);
        const hy = clamp((pr.y / HC) | 0, 0, HROWS - 1);
        // a piercing shot may hit several units this tick and outlive them
        // all, so its victims are gathered first and removed afterwards
        // from the highest index down — a swap-remove mid-scan would drag
        // an unvisited unit into a bucket we have already walked past
        const hits = this.splashHits;
        hits.length = 0;
        outer: for (let cy = Math.max(0, hy - sp); cy <= Math.min(HROWS - 1, hy + sp); cy++) {
          for (let cx = Math.max(0, hx - sp); cx <= Math.min(HCOLS - 1, hx + sp); cx++) {
            const c = cy * HCOLS + cx, e = bStart[c + 1];
            for (let k = bStart[c]; k < e; k++) {
              const i = bUnits[k];
              if (i >= this.n || uhp[i] <= 0) continue;
              if (KIND_FLYING[this.ukind[i]] ? !b.collidesAir : !b.collidesGround) continue;
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
              }
            }
          }
        }
        for (const i of hits) {
          this.damageUnit(i, b.damage);
          if (uhp[i] > 0 && b.burn && !KIND_BURN_IMMUNE[this.ukind[i]]) this.uburn[i] = b.burn;
          // BulletType.hitEffect, at the bullet rather than the victim
          if (uhp[i] > 0 && b.splash <= 0)
            this.pushFx(
              pr.x, pr.y, b.invisible ? 14 / 60 : 0.12,
              b.invisible ? FxKind.FlameHit : FxKind.Hit,
              Math.atan2(pr.vy, pr.vx), 0,
              (Math.random() * 0x7fffffff) | 0,
            );
        }
        hits.sort((a2, b2) => b2 - a2);
        for (const i of hits) if (uhp[i] <= 0) this.killUnit(i);
      }
      if (dead) {
        // splash bullets blast wherever they die: direct hit, proximity
        // fuse, or end of lifetime (Mindustry's despawnHit)
        if (b.splash > 0)
          this.splash(pr.x, pr.y, b.splashRadius, b.splash, b.collidesAir, b.collidesGround);
        projs[p] = projs[projs.length - 1];
        projs.pop();
      }
    }
  }

  /** is any live targetable unit's hitbox within r of (x, y)? */
  private anyUnitWithin(x: number, y: number, r: number, air: boolean, ground: boolean): boolean {
    const { upx, upy, uhp, urad, ukind, bStart, bUnits } = this;
    const pad = r + rmaxFor(air, ground);
    const hx0 = clamp(((x - pad) / HC) | 0, 0, HCOLS - 1);
    const hy0 = clamp(((y - pad) / HC) | 0, 0, HROWS - 1);
    const hx1 = clamp(((x + pad) / HC) | 0, 0, HCOLS - 1);
    const hy1 = clamp(((y + pad) / HC) | 0, 0, HROWS - 1);
    for (let hy = hy0; hy <= hy1; hy++) {
      for (let hx = hx0; hx <= hx1; hx++) {
        const c = hy * HCOLS + hx, e = bStart[c + 1];
        for (let k = bStart[c]; k < e; k++) {
          const i = bUnits[k];
          if (i >= this.n || uhp[i] <= 0) continue;
          if (KIND_FLYING[ukind[i]] ? !air : !ground) continue;
          const dx = upx[i] - x, dy = upy[i] - y;
          const rr = r + urad[i];
          if (dx * dx + dy * dy < rr * rr) return true;
        }
      }
    }
    return false;
  }

  private readonly splashHits: number[] = [];

  /**
   * Area damage with Mindustry's falloff (Damage.calculateDamage): full at
   * the blast center easing to 40% at the radius edge; anything whose
   * hitbox overlaps the radius is affected, armor applying per victim.
   */
  private splash(
    x: number,
    y: number,
    radius: number,
    dmg: number,
    air: boolean,
    ground: boolean,
  ): void {
    const { upx, upy, uhp, uarmor, urad, ukind, bStart, bUnits, splashHits } = this;
    splashHits.length = 0;
    const reach = radius + rmaxFor(air, ground);
    const hx0 = clamp(((x - reach) / HC) | 0, 0, HCOLS - 1);
    const hy0 = clamp(((y - reach) / HC) | 0, 0, HROWS - 1);
    const hx1 = clamp(((x + reach) / HC) | 0, 0, HCOLS - 1);
    const hy1 = clamp(((y + reach) / HC) | 0, 0, HROWS - 1);
    for (let hy = hy0; hy <= hy1; hy++) {
      for (let hx = hx0; hx <= hx1; hx++) {
        const c = hy * HCOLS + hx, e = bStart[c + 1];
        for (let k = bStart[c]; k < e; k++) {
          const i = bUnits[k];
          if (i >= this.n || uhp[i] <= 0) continue;
          if (KIND_FLYING[ukind[i]] ? !air : !ground) continue;
          const dx = upx[i] - x, dy = upy[i] - y;
          const rr = radius + urad[i];
          if (dx * dx + dy * dy < rr * rr) splashHits.push(i);
        }
      }
    }
    // damage first (indices stay stable), then remove the dead from the
    // highest index down so swap-remove can't disturb pending removals
    for (const i of splashHits) {
      const d = Math.hypot(upx[i] - x, upy[i] - y);
      const raw = dmg * Math.max(0, 0.4 + 0.6 * (1 - d / radius));
      this.damageUnit(i, raw);
    }
    splashHits.sort((a, b) => b - a);
    for (const i of splashHits) {
      if (uhp[i] > 0) continue;
      this.killUnit(i);
    }
    this.pushFx(x, y, 0.3, FxKind.Flak);
  }

  /** Fx.lightning: the only effect whose shape is data rather than a seed —
   * Mindustry hands it the very point list the walk built */
  private pushBolt(x: number, y: number, ttl: number, pts: readonly number[]): void {
    if (this.effects.length < FX_CAP)
      this.effects.push({ x, y, age: 0, ttl, kind: FxKind.Lightning, pts });
  }

  private pushFx(
    x: number,
    y: number,
    ttl: number,
    kind: FxKind,
    rot = 0,
    len = 0,
    seed = 0,
    sides = 0,
  ): void {
    if (this.effects.length < FX_CAP)
      this.effects.push({ x, y, age: 0, ttl, kind, rot, len, seed, sides });
  }
}
