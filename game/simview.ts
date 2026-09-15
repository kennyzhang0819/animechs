/**
 * WHAT THE DRAWING SIDE IS ALLOWED TO KNOW ABOUT THE WORLD.
 *
 * The renderer and the two canvas overlays (Game.drawOverlay,
 * Game.drawMinimap) used to be handed the `Sim` itself, which meant the
 * boundary between "the game" and "the picture of the game" was wherever
 * somebody last reached. It is HERE now, written down, and the compiler
 * keeps it: draw-side code that wants something new off the world has to
 * add it to this list first, in the open, rather than by typing `sim.`.
 *
 * WHY THAT MATTERS BEYOND TIDINESS. The sim is going to move onto a worker
 * thread, and the first question that move asks is "what exactly does the
 * main thread need to see?" — because that, and only that, has to cross
 * between them. This interface IS the answer, and the shape of it decides
 * the shape of the crossing:
 *
 *   THE TYPED ARRAYS (the u* and fx* fields) are flat numbers and can be
 *   allocated on memory both threads hold, so the renderer keeps reading
 *   them exactly as it does now and nothing is copied per frame. They are
 *   most of this list, which is the whole reason the move is affordable.
 *
 *   THE HEAP FIELDS — `towers`, `shieldTowers`, `projs`, `shots`, `utgt`,
 *   `core` — are objects, so they cannot be shared and have to be packed
 *   and sent. They are the work. Keeping this list short is keeping that
 *   work small, which is why the interface is worth having even before
 *   there is a worker to justify it.
 *
 *   `terrain` and `bulletFor` are neither: they are FIXED for a level and
 *   pure respectively, so both sides can build their own from the same map
 *   document and nothing crosses at all.
 *
 * `Sim` satisfies this structurally and is not asked to implement it — it
 * simply has these members, and the day it is on the other side of a thread
 * something else will have them instead.
 */
import type { BulletStats } from "./constants";
import type { Terrain } from "./terrain";
import type { RGB, Structure, Team, TowerKind } from "./types";
import type { ShotLook } from "./weapons";

/**
 * THE BODIES, as the picture needs them. Every one of these is indexed by
 * unit slot, 0 to `n`, except where the name says otherwise (the leg and
 * segment arrays carry MAX_LEGS / MAX_SEGS entries each).
 */
export interface UnitsView {
  /** how many slots are live — everything below is meaningless past it */
  readonly n: number;
  readonly upx: Float32Array;
  readonly upy: Float32Array;
  /** the chassis' facing, and the turret's on top of it */
  readonly ubrot: Float32Array;
  readonly urot: Float32Array;
  readonly ukind: Uint8Array;
  /** the spawn id, which is what a sprite is keyed on across frames */
  readonly uid: Int32Array;
  readonly uhp: Float32Array;
  readonly uhpmax: Float32Array;
  readonly urad: Float32Array;
  /** the leg cycle's phase, for the walking sprites */
  readonly uwalk: Float32Array;
  readonly ufly: Uint8Array;
  /** what is happening to it: soaked, hungry, wading, cloaked, fed */
  readonly uwet: Float32Array;
  readonly uhungry: Uint8Array;
  readonly ueaten: Uint8Array;
  readonly uwade: Uint8Array;
  readonly ucloakT: Float32Array;
  /** how many bodies this one stands for (Sim.mergeSqueezed) — a fold is
   *  drawn bigger, so the picture needs the count */
  readonly ustack: Uint8Array;
  /** the force field: pool, fade, and the radius scale it is drawn at */
  readonly ushield: Float32Array;
  readonly ushieldAlpha: Float32Array;
  readonly uforceScale: Float32Array;
  /** the held beam and the charge before it, drawn live off these clocks */
  readonly ubeamT: Float32Array;
  readonly ucharge: Float32Array;
  readonly uheldRot: Float32Array;
  /** the legs, MAX_LEGS a body: foot, knee, swing phase, and which are down */
  readonly ulegFX: Float32Array;
  readonly ulegFY: Float32Array;
  readonly ulegJX: Float32Array;
  readonly ulegJY: Float32Array;
  readonly ulegStage: Float32Array;
  readonly ulegMove: Uint8Array;
  /** the crawlers' spine, MAX_SEGS a body */
  readonly usegX: Float32Array;
  readonly usegY: Float32Array;
  /** the wake a hull drags, WAKE_PTS a body, and how many of them are laid */
  readonly uwakeX: Float32Array;
  readonly uwakeY: Float32Array;
  readonly uwakeN: Uint8Array;
  /**
   * IS THIS BODY HOLDING A TARGET — one byte, not the target.
   *
   * The sim's own `utgt` is a reference to a live structure, which is the
   * one thing that cannot cross a thread. It turned out not to need to: the
   * drawing asks a single question of it, "is this body aiming at anything"
   * (it decides whether an energy field is lit), so what crosses is the
   * answer rather than the thing.
   */
  readonly aiming: Uint8Array;
  /** the live census, per kind id — what the composition strip counts */
  readonly aliveByKind: Int32Array;
  /**
   * THE REST OF WHAT THE FIELD'S STATUS ROW READS (status.ts
   * unitFieldStatuses): the arrival grace, the burn, the veteran's
   * multiplier, the leader's cover and the infection. Numbers the sim
   * keeps for its own loops that the picture also stamps a symbol for.
   */
  readonly uspawn: Float32Array;
  readonly uburn: Float32Array;
  readonly uvet: Float32Array;
  readonly uled: Float32Array;
  readonly uvirus: Uint8Array;
}

/**
 * THE EFFECT POOL, as the picture needs it: a ring of short-lived marks,
 * FX_MAX of them, `fxN` live. Flat numbers throughout except `fxPts`, which
 * a few kinds use to carry a pre-rolled polygon.
 */
export interface EffectsView {
  readonly fxN: number;
  readonly fxX: Float32Array;
  readonly fxY: Float32Array;
  readonly fxAge: Float32Array;
  readonly fxTtl: Float32Array;
  readonly fxKind: Uint8Array;
  readonly fxLen: Float32Array;
  readonly fxRot: Float32Array;
  readonly fxSeed: Int32Array;
  readonly fxSides: Uint8Array;
  readonly fxUnit: Uint8Array;
  readonly fxHasCol: Uint8Array;
  readonly fxColR: Float32Array;
  readonly fxColG: Float32Array;
  readonly fxColB: Float32Array;
  readonly fxPts: readonly (readonly number[] | null)[];
}

/**
 * A TURRET, AS THE PICTURE NEEDS IT — and no more of one than that.
 *
 * `Tower` itself carries its mods, its rolled attributes, its rot and jam
 * clocks, its whole composed stat block: a run's worth of state the drawing
 * has no business with. THIS is the part that has to cross a thread, so this
 * is the part that is written down, and the compiler is what proves the list
 * complete — grepping for `t.` found fifteen of these fields and quietly
 * missed the three the beam is drawn from.
 */
export interface TowerView {
  readonly kind: TowerKind;
  readonly team: Team;
  /** world centre, and the top-left cell of the footprint (the minimap
   *  draws off the cells, the field off the centre) */
  readonly x: number;
  readonly y: number;
  readonly gx: number;
  readonly gy: number;
  readonly size: number;
  readonly hp: number;
  readonly hpMax: number;
  /** where the barrel is pointing */
  readonly angle: number;
  /** the muzzle mark burning down, and where it sits */
  readonly flashT: number;
  readonly flashRot: number;
  readonly flashX: number;
  readonly flashY: number;
  /** the held beam: seconds left, how far along it has spooled, and the
   *  muzzle it is anchored to */
  readonly beamT: number;
  readonly beamStr: number;
  readonly beamOX: number;
  readonly beamOY: number;
  readonly beamRot: number;
  /** ...and where a LOCK turret's beam is resting, which is a point on the
   *  body it has caught rather than an angle out of the muzzle */
  readonly beamX: number;
  readonly beamY: number;
  /** the two things the drawing reads off a turret's composed stats: the
   *  beam it holds (which MODS CAN LENGTHEN, so it is per turret and not
   *  per kind) and the colour its muzzle flashes */
  /**
   * IS IT PICKED, AND IS IT THE ONE MARKED. Flags on the turret rather than
   * a set of turrets held elsewhere, because a set is a set of REFERENCES
   * and a reference is the one thing that cannot cross a thread — the
   * drawing side's turrets are its own objects. A bit each says the same
   * thing and says it about something it can actually be asked of.
   */
  readonly selected: boolean;
  readonly inspected: boolean;
  /** the attributes it won at its placement (mods.ts) — the pip in its
   *  corner is drawn off the band of the best of them */
  readonly mods: number;
  /** ...and what is happening to it right now, as a bitmask over
   *  STRUCT_FIELD_STATUSES: nine clocks' worth of answer in one number */
  readonly statuses: number;
  readonly spec: {
    /** THE LIVE reach, not the table's: an upgrade branch that lengthened
     *  this turret has to move the ring drawn round it, or the ring is a lie
     *  about what the turret can shoot */
    readonly range: number;
    readonly bullet: {
      /** narrowed to the three the beam is actually drawn from, so that a
       *  turret crosses as three numbers rather than a stat block */
      readonly continuous?: {
        readonly length: number;
        readonly duration: number;
        readonly fade: number;
      };
      readonly fxColor?: RGB;
    };
  };
}

/** a map's dome tower, as the picture needs it */
export interface ShieldTowerView {
  readonly x: number;
  readonly y: number;
  readonly gx: number;
  readonly gy: number;
  readonly hp: number;
  readonly hpMax: number;
  /** the dome: its reach, how far open it is, and the pool behind it */
  readonly domeR: number;
  readonly scale: number;
  readonly shield: number;
  readonly shieldAlpha: number;
}

/** the core, which is drawn like a building and is not one */
export interface CoreView {
  readonly x: number;
  readonly y: number;
  readonly gx: number;
  readonly gy: number;
  readonly size: number;
  readonly hp: number;
  readonly hpMax: number;
  /** the core can be picked like any building, and wears the same ring */
  readonly selected: boolean;
}

/** one of the player's shots in flight */
export interface ProjectileView {
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  /** which turret's bullet this is, and whether it is a fragment of one —
   *  the pair `bulletFor` takes */
  readonly kind: TowerKind;
  readonly frag: boolean;
  /** seconds flown, out of how many it has: the shot's fade in and out */
  readonly age: number;
  readonly life: number;
  /** a shot with no sprite at all (a ray, a flame) — it lives in its effects */
  readonly bare: boolean;
}

/** ...and one of the swarm's */
export interface ShotView {
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly age: number;
  readonly life: number;
  /**
   * HOW IT IS DRAWN. Shared by every shot that weapon fires, so this is a
   * pointer into a fixed table rather than per-shot data — which is what
   * lets it cross as one integer instead of nine numbers.
   */
  readonly look: ShotLook;
}

/** everything standing on the board that can be drawn or shot at */
export interface StructuresView {
  readonly towers: readonly TowerView[];
  readonly shieldTowers: readonly ShieldTowerView[];
  readonly core: CoreView;
}

/** ...and everything in the air between them */
export interface ShotsView {
  readonly projs: readonly ProjectileView[];
  readonly shots: readonly ShotView[];
  /** the bullet table, which is a pure lookup and crosses no threads */
  bulletFor(kind: TowerKind, frag: boolean): BulletStats;
}

/**
 * THE QUESTIONS THE OVERLAY ASKS OF THE BOARD, every frame, about the cell
 * under the cursor. They are answered from grids (board.ts) rather than by
 * asking the sim, which is what lets them stay instant when the sim is on
 * another thread — a build cursor that took a frame to decide its colour
 * would be the feel of placing a turret, gone.
 */
export interface BoardView {
  canPlace(gx: number, gy: number, kind: TowerKind, size?: number): boolean;
  isWaterlogged(gx: number, gy: number, kind: TowerKind, size?: number): boolean;
  rulerCells(x0: number, y0: number, x1: number, y1: number, kind: TowerKind): {
    gx: number;
    gy: number;
  }[];
  /** is the Hydrophobic rule in force at all — the overlay only shades for it
   *  when there is a mask to shade from */
  readonly hydrophobicOn: boolean;
}

/**
 * THE WHOLE OF IT. `Sim` has all of this today and is handed straight over;
 * the day the sim is on a worker, the main thread builds something else
 * with the same members and the renderer never knows the difference.
 */
export interface SimView extends UnitsView, EffectsView, StructuresView, ShotsView, BoardView {
  /** SIMULATED seconds — what the sea and every other animation rides, so
   *  that pausing the game stills them and the speed switcher moves them */
  readonly time: number;
  /** the map, which is fixed for a level: both sides build their own */
  readonly terrain: Terrain;
  /**
   * HOW MANY BUILDINGS ARE PICKED. The range ring is only drawn when it is
   * exactly one — a screen of overlapping discs is a screen nobody can see
   * the fight through — so the count is asked before the flags are.
   */
  readonly selectedN: number;
  /** where the inspect arrow points, or null when nothing is marked */
  readonly inspectMark: { x: number; y: number; top: number } | null;
  /**
   * THE AIR LANES, traced ONCE PER MAP. No building changes the air field,
   * so these are fixed for the level and are handed over with the terrain
   * rather than crossing every frame.
   */
  readonly airRoutes: readonly { pts: readonly number[] }[];
}

/** the draw side reads structures but never writes one */
export type ViewStructure = Structure;
