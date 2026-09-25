/**
 * THE PART OF THE WORLD THAT CANNOT SIMPLY BE SHARED.
 *
 * Most of what the picture needs off the sim is already flat numbers in
 * typed arrays (see simview.ts), and flat numbers can live on memory two
 * threads both hold — nothing has to be copied for those, ever. This file
 * is about the rest: the six members of SimView that are OBJECTS, and so
 * have to be flattened on one side and read back on the other.
 *
 *   towers        the line, and the biggest of them
 *   shieldTowers  the map's domes
 *   core          the one building the run is about
 *   projs         the player's shots in flight
 *   shots         the swarm's
 *   utgt          which bodies are holding a target — a BIT each, because
 *                 that is all the drawing ever asks of it
 *
 * TWO HALVES, DELIBERATELY SEPARATE. `packSnapshot` runs where the sim is
 * and writes numbers; `SnapshotView` runs where the drawing is and presents
 * those numbers as the objects the renderer already expects. Neither knows
 * about threads, which is the point: today they run back to back in one
 * frame and the whole thing is a no-op with extra steps, and the day the sim
 * moves the only new thing between them is the postMessage.
 *
 * THE MIRROR OBJECTS ARE POOLED AND REUSED. A late wave has two and a half
 * thousand turrets and several hundred shots; building fresh objects for
 * them sixty times a second would hand the collector a hundred and fifty
 * thousand corpses a second for no reason. The pool grows to the high-water
 * mark and then stops.
 *
 * WHAT IS NOT HERE, because it does not need to be: `terrain` is fixed for a
 * level, so both sides build their own from the same map document, and
 * `bulletFor` is a pure lookup over a table that is the same on both sides.
 * Neither crosses.
 */
import { PROJ_ALT, PROJ_BARE, PROJ_FRAG, type Projs } from "./projs";
import { TOWER_KINDS, type RGB, type TowerKind } from "./types";
import { UNIT_KINDS, UNIT_STATS } from "./levels";
import * as shared from "./shared";
import { EXTRA_LOOKS, UNIT_WEAPONS, type ShotLook } from "./weapons";
import type { Terrain } from "./terrain";
import {
  canPlaceOn,
  rulerCells,
  waterloggedUnder,
  type BoardBodies,
  type BoardDome,
  type BoardGrids,
} from "./board";
import { SHIELD_TOWER_SIZE } from "./mutation";
import { structStatusMask } from "./status";
import type { Structure } from "./types";
import type {
  ConvoyView,
  CoreView,
  SimView,
  ProjectileView,
  ShieldTowerView,
  ShotView,
  ShotsView,
  StructuresView,
  TowerView,
} from "./simview";

/**
 * EVERY SHOT LOOK THERE IS, in a fixed order.
 *
 * A look is the weapon's, not the shot's — every round a starhart3 fires
 * draws the same way — so a shot in flight carries a POINTER to one, and a
 * pointer is the one thing that cannot cross a thread. Both sides build this
 * table from the same module in the same order, so an index into it means
 * the same look on either side and a shot crosses as one integer instead of
 * nine numbers and a sprite id.
 */
const LOOKS: ShotLook[] = [];
const LOOK_ID = new Map<ShotLook, number>();
const addLook = (l: ShotLook): void => {
  if (LOOK_ID.has(l)) return;
  LOOK_ID.set(l, LOOKS.length);
  LOOKS.push(l);
};
for (const kind of UNIT_KINDS)
  for (const w of UNIT_WEAPONS[kind]) if (w.look) addLook(w.look);
// ...and the rounds that no weapon row carries (weapons.ts EXTRA_LOOKS): a
// bomber's bomblets and its nuke, and every one of the Grapnels' stars,
// which are thrown rather than fired. Without a seat here each of them
// crosses as index 0 and is drawn on the other side as somebody else's
// bullet — the whole point of the table being an index is that both sides
// build the same one
for (const l of EXTRA_LOOKS) addLook(l);
// the roster is walked through UNIT_STATS' own key order above; touching it
// here keeps the import honest if a kind is ever added without a weapon
void UNIT_STATS;

const TOWER_ID = new Map<TowerKind, number>(TOWER_KINDS.map((k, i) => [k, i]));

/** the held beam, as the drawing reads it (see TowerView.spec) */
type Cont = NonNullable<TowerView["spec"]["bullet"]["continuous"]>;
/** ...and the mutable face of it the mirror refills in place */
type Barrel = { continuous?: Cont; fxColor?: RGB };

/** floats a turret takes on the wire — see packTowers for the order */
const TOWER_F = 30;
/** ...a dome, a shot of ours, and a shot of theirs */
const DOME_F = 10;
export const PROJ_F = 10;
const SHOT_F = 7;
/** ...and the core, which there is exactly one of */
const CORE_F = 8;
/**
 * ...AND THE CART, of which there is also exactly one (levels.ts
 * EscortMission): is there one at all, where it is, what it has left, and
 * whether it is standing at a halt. A fixed slab like the core's rather
 * than a list, because the escort mission fields one hauler and the day it
 * fields two is the day this becomes a list — and until then a list would
 * be a count to read and a loop to write for one item.
 */
const CONVOY_F = 8;

/**
 * grow a float buffer to hold at least `need`, keeping it a power of two.
 * ON SHARED MEMORY, like the flat arrays: a snapshot packed on the worker
 * is then read on the drawing side with nothing copied — the message that
 * announces it carries views over the same bytes.
 */
const fit = (a: Float32Array, need: number): Float32Array => {
  if (a.length >= need) return a;
  let n = Math.max(64, a.length);
  while (n < need) n *= 2;
  return shared.f32(n);
};

/**
 * ...and the same grow for the ONE buffer that is deliberately NOT shared:
 * the bolt paths. `postMessage` copies an ordinary buffer's bytes and only
 * re-views a shared one, so this is what makes a published frame's paths a
 * private copy the sim cannot touch again.
 *
 * WHY THIS ONE. Everything else here is fixed-width rows — a turret is
 * thirty floats at `i * 30` — so a reader that sees a later frame's bytes
 * under an earlier frame's count still reads well-formed rows, and draws a
 * turret a pixel stale. The paths are self-describing records,
 * [slot, count, x, y, ...], where the count in the data says where the next
 * record begins: read one from the wrong frame and every read after it is
 * misaligned, the count lane lands on a coordinate, and `new Array(1873.4)`
 * throws RangeError — which is how this was found, on a board packed with
 * turrets taking wraith chain lightning (game/weapons.ts livewire).
 *
 * THE TWO SNAPSHOTS DID NOT COVER IT (sim.worker.ts): alternating buffers
 * give the reader ONE tick of slack, about 33ms, and a frame that draws a
 * full board goes over that — the worker laps the rotation and repacks the
 * buffer under the read. A copy costs a memcpy of a few tens of KB at the
 * very worst and ends the whole class of problem for the one array that
 * cannot survive being read a frame late.
 */
const fitOwn = (a: Float32Array, need: number): Float32Array => {
  if (a.length >= need) return a;
  let n = Math.max(64, a.length);
  while (n < need) n *= 2;
  return new Float32Array(n);
};

/**
 * THE FLATTENED WORLD. One array a category, laid out field after field per
 * item, plus the count of how many of the array is live. Float32 throughout
 * — every value here is a coordinate, a clock, a colour channel or a small
 * integer id, and none of them needs more than a float's precision. The unit
 * flags ride as floats too rather than earning an array of their own.
 */
export interface Snapshot {
  time: number;
  towerN: number;
  towers: Float32Array;
  domeN: number;
  domes: Float32Array;
  projN: number;
  projs: Float32Array;
  shotN: number;
  shots: Float32Array;
  core: Float32Array;
  /** the escort's hauler, CONVOY_F wide: [live, x, y, rot, hp, hpMax, halted, walk] */
  convoy: Float32Array;
  /** one per unit slot: is this body holding a target (see SimView.utgt) */
  aiming: Uint8Array;
  aimingN: number;
  /** how many buildings are picked, and where the inspect arrow points:
   *  [is there one, x, y, top] */
  selectedN: number;
  mark: Float32Array;
  /**
   * THE BOLT PATHS (SimView.fxPts) — the one thing in the effect pool that
   * is a list rather than a number, so the one thing there that cannot be
   * shared. Packed as [slot, count, x, y, x, y, ...] per effect that
   * carries one, `ptsN` floats of it. Only filled when asked (packSnapshot
   * withPts): in one thread the array itself is read by reference.
   *
   * ON ITS OWN BUFFER, NOT SHARED MEMORY, alone among the arrays here.
   * `fitOwn` says why: read a frame late, the rest of these only LOOK
   * wrong, and this one throws.
   */
  ptsN: number;
  pts: Float32Array;
}

export const emptySnapshot = (): Snapshot => ({
  time: 0,
  towerN: 0,
  towers: shared.f32(0),
  domeN: 0,
  domes: shared.f32(0),
  projN: 0,
  projs: shared.f32(0),
  shotN: 0,
  shots: shared.f32(0),
  core: shared.f32(CORE_F),
  convoy: shared.f32(CONVOY_F),
  aiming: shared.u8(0),
  aimingN: 0,
  selectedN: 0,
  mark: shared.f32(4),
  ptsN: 0,
  pts: new Float32Array(0),
});

/** what packSnapshot reads — the sim side of SimView, and nothing else */
export interface Packable extends Omit<ShotsView, "projs" | "projPacked" | "projN"> {
  /** the player's shots as the SIM has them — lanes (projs.ts), which the
   *  packer copies straight across; the drawing side reads them back as
   *  ProjectileView mirrors */
  readonly projs: Projs;
  readonly time: number;
  readonly n: number;
  readonly fxN: number;
  readonly fxPts: readonly (readonly number[] | null)[];
  readonly utgt: readonly (unknown | null)[];
  /**
   * THE STRUCTURES AS THE SIM HAS THEM, which carry more than the view's do
   * — the selection and the mark live beside them rather than on them, so
   * they are asked for here and flattened onto the mirrors.
   */
  readonly towers: readonly PackableTower[];
  readonly shieldTowers: readonly ShieldTowerView[];
  readonly core: Omit<CoreView, "selected">;
  readonly selectedStructN: number;
  isSelectedStruct(s: unknown): boolean;
  readonly inspectedTower: unknown;
  inspectMark(): { x: number; y: number; top: number } | null;
  /** the escort's hauler, or null on every map that does not field one */
  liveConvoy(): { struct: { x: number; y: number; hp: number; hpMax: number }; rot: number; halted: boolean; walk: number } | null;
}

/** a turret as the SIM has one: the view's fields, minus the two flags that
 *  are not on it, plus the reach the ring is drawn at */
export type PackableTower = Omit<TowerView, "selected" | "inspected" | "statuses">;

/**
 * FLATTEN THE WORLD INTO `out`, growing its arrays if the board has. Called
 * once per published frame on the side the sim is on.
 */
export function packSnapshot(w: Packable, out: Snapshot, withPts = false): Snapshot {
  out.time = w.time;

  // ---- the line ----
  const tn = w.towers.length;
  out.towers = fit(out.towers, tn * TOWER_F);
  out.towerN = tn;
  const T = out.towers;
  for (let i = 0; i < tn; i++) {
    const t = w.towers[i];
    const o = i * TOWER_F;
    T[o] = t.x;
    T[o + 1] = t.y;
    T[o + 2] = t.gx;
    T[o + 3] = t.gy;
    T[o + 4] = t.size;
    T[o + 5] = TOWER_ID.get(t.kind) ?? 0;
    T[o + 6] = t.team === "player" ? 0 : 1;
    T[o + 7] = t.hp;
    T[o + 8] = t.hpMax;
    T[o + 9] = t.angle;
    T[o + 10] = t.flashT;
    T[o + 11] = t.flashRot;
    T[o + 12] = t.flashX;
    T[o + 13] = t.flashY;
    T[o + 14] = t.beamT;
    T[o + 15] = t.beamStr;
    T[o + 16] = t.beamOX;
    T[o + 17] = t.beamOY;
    T[o + 18] = t.beamRot;
    T[o + 19] = t.beamX;
    T[o + 20] = t.beamY;
    // the beam this turret actually holds — mods lengthen it, so it is the
    // turret's own three numbers and not its kind's
    const cont = t.spec.bullet.continuous;
    T[o + 21] = cont ? cont.length : -1;
    T[o + 22] = cont ? cont.duration : 0;
    T[o + 23] = cont ? cont.fade : 0;
    // ...and its muzzle colour, packed as one number, -1 for "it has none"
    const fc = t.spec.bullet.fxColor;
    T[o + 24] = fc ? ((fc[0] * 255) << 16) | ((fc[1] * 255) << 8) | (fc[2] * 255) : -1;
    // ...and what the overlay needs to draw a ring round it
    T[o + 25] = w.isSelectedStruct(t) ? 1 : 0;
    T[o + 26] = t === w.inspectedTower ? 1 : 0;
    T[o + 27] = t.spec.range;
    T[o + 28] = t.mods;
    T[o + 29] = structStatusMask(t as unknown as Structure);
  }

  // ---- the domes ----
  const dn = w.shieldTowers.length;
  out.domes = fit(out.domes, dn * DOME_F);
  out.domeN = dn;
  const D = out.domes;
  for (let i = 0; i < dn; i++) {
    const s = w.shieldTowers[i];
    const o = i * DOME_F;
    D[o] = s.x;
    D[o + 1] = s.y;
    D[o + 2] = s.gx;
    D[o + 3] = s.gy;
    D[o + 4] = s.hp;
    D[o + 5] = s.hpMax;
    D[o + 6] = s.domeR;
    D[o + 7] = s.scale;
    D[o + 8] = s.shield;
    D[o + 9] = s.shieldAlpha;
  }

  // ---- the core ----
  const c = w.core;
  const C = out.core;
  C[0] = c.x;
  C[1] = c.y;
  C[2] = c.gx;
  C[3] = c.gy;
  C[4] = c.size;
  C[5] = c.hp;
  C[6] = c.hpMax;
  C[7] = w.isSelectedStruct(c) ? 1 : 0;

  // ---- the cart ----
  const cv = w.liveConvoy();
  const V = out.convoy;
  V[0] = cv ? 1 : 0;
  if (cv) {
    V[1] = cv.struct.x;
    V[2] = cv.struct.y;
    V[3] = cv.rot;
    V[4] = cv.struct.hp;
    V[5] = cv.struct.hpMax;
    V[6] = cv.halted ? 1 : 0;
    V[7] = cv.walk;
  }

  // ---- ours in the air ----
  // ...straight off the sim's lanes (projs.ts): the kind lane already IS
  // the TOWER_KINDS index the mirror reads back, and the flags are bits
  const pj = w.projs;
  const pn = pj.n;
  out.projs = fit(out.projs, pn * PROJ_F);
  out.projN = pn;
  const P = out.projs;
  for (let i = 0; i < pn; i++) {
    const o = i * PROJ_F;
    const fl = pj.flags[i];
    P[o] = pj.x[i];
    P[o + 1] = pj.y[i];
    P[o + 2] = pj.vx[i];
    P[o + 3] = pj.vy[i];
    P[o + 4] = pj.kind[i];
    P[o + 5] = fl & PROJ_FRAG ? 1 : 0;
    P[o + 6] = pj.age[i];
    P[o + 7] = pj.life[i];
    P[o + 8] = fl & PROJ_BARE ? 1 : 0;
    P[o + 9] = fl & PROJ_ALT ? 1 : 0;
  }

  // ---- ...and theirs ----
  const sn = w.shots.length;
  out.shots = fit(out.shots, sn * SHOT_F);
  out.shotN = sn;
  const S = out.shots;
  for (let i = 0; i < sn; i++) {
    const s = w.shots[i];
    const o = i * SHOT_F;
    S[o] = s.x;
    S[o + 1] = s.y;
    S[o + 2] = s.vx;
    S[o + 3] = s.vy;
    S[o + 4] = s.age;
    S[o + 5] = s.life;
    S[o + 6] = LOOK_ID.get(s.look) ?? 0;
  }

  // ---- who is holding a target ----
  if (out.aiming.length < w.n) out.aiming = shared.u8(Math.max(1024, w.n * 2));
  out.aimingN = w.n;
  const A = out.aiming;
  for (let i = 0; i < w.n; i++) A[i] = w.utgt[i] ? 1 : 0;

  // ---- the bolt paths, when they have to cross ----
  out.ptsN = 0;
  if (withPts) {
    // sized first, written second: a buffer grown mid-write would have to
    // carry what was already in it, and two passes over a handful of
    // bolts is cheaper than that
    let need = 0;
    for (let f = 0; f < w.fxN; f++) {
      const p = w.fxPts[f];
      if (p) need += 2 + p.length;
    }
    out.pts = fitOwn(out.pts, need);
    const Q = out.pts;
    let k = 0;
    for (let f = 0; f < w.fxN; f++) {
      const p = w.fxPts[f];
      if (!p) continue;
      Q[k++] = f;
      Q[k++] = p.length;
      for (let j = 0; j < p.length; j++) Q[k++] = p[j];
    }
    out.ptsN = k;
  }

  // ---- the selection's size, and the arrow ----
  out.selectedN = w.selectedStructN;
  const mk = w.inspectMark();
  out.mark[0] = mk ? 1 : 0;
  if (mk) {
    out.mark[1] = mk.x;
    out.mark[2] = mk.y;
    out.mark[3] = mk.top;
  }

  return out;
}

/**
 * THE BOLT PATHS, READ BACK: the packed floats become the per-slot list
 * the renderer expects, in an array the reading side owns. Every slot is
 * cleared first — a path left in a slot whose effect has since died would
 * be drawn under whatever effect took the slot next.
 */
export function readPts(s: Snapshot, into: (readonly number[] | null)[]): void {
  into.fill(null);
  const Q = s.pts;
  const n = Math.min(s.ptsN, Q.length);
  for (let k = 0; k < n; ) {
    const f = Q[k++];
    const len = Q[k++];
    // A RECORD THAT DOES NOT FIT means this buffer and this count are not
    // from the same frame, and every record after it is misread too — so
    // the rest of them are dropped rather than decoded out of alignment.
    // `fitOwn` is what stops that happening, and this is two comparisons a
    // bolt to keep the day it happens anyway a missing effect rather than
    // a RangeError out of `new Array` that takes the run with it
    if (!Number.isInteger(len) || len < 0 || k + len > n) return;
    if (!Number.isInteger(f) || f < 0 || f >= into.length) return;
    const p = new Array<number>(len);
    for (let j = 0; j < len; j++) p[j] = Q[k++];
    into[f] = p;
  }
}

// ---------- the reading side ----------

/** a turret as the renderer sees it, refilled in place from the numbers */
class TowerMirror implements TowerView {
  kind: TowerKind = TOWER_KINDS[0];
  team: "player" | "enemy" = "player";
  x = 0;
  y = 0;
  gx = 0;
  gy = 0;
  size = 1;
  hp = 0;
  hpMax = 0;
  angle = 0;
  flashT = 0;
  flashRot = 0;
  flashX = 0;
  flashY = 0;
  beamT = 0;
  beamStr = 0;
  beamOX = 0;
  beamOY = 0;
  beamRot = 0;
  beamX = 0;
  beamY = 0;
  selected = false;
  inspected = false;
  mods = 0;
  statuses = 0;
  /** rebuilt in place too: the object identity is stable, only the numbers move */
  private readonly cont = { length: 0, duration: 0, fade: 0 };
  readonly bullet: TowerView["spec"]["bullet"] = {};
  readonly spec = { range: 0, bullet: this.bullet };

  read(T: Float32Array, o: number): void {
    this.x = T[o];
    this.y = T[o + 1];
    this.gx = T[o + 2];
    this.gy = T[o + 3];
    this.size = T[o + 4];
    this.kind = TOWER_KINDS[T[o + 5]] ?? TOWER_KINDS[0];
    this.team = T[o + 6] === 0 ? "player" : "enemy";
    this.hp = T[o + 7];
    this.hpMax = T[o + 8];
    this.angle = T[o + 9];
    this.flashT = T[o + 10];
    this.flashRot = T[o + 11];
    this.flashX = T[o + 12];
    this.flashY = T[o + 13];
    this.beamT = T[o + 14];
    this.beamStr = T[o + 15];
    this.beamOX = T[o + 16];
    this.beamOY = T[o + 17];
    this.beamRot = T[o + 18];
    this.beamX = T[o + 19];
    this.beamY = T[o + 20];
    const b = this.bullet as Barrel;
    if (T[o + 21] < 0) b.continuous = undefined;
    else {
      this.cont.length = T[o + 21];
      this.cont.duration = T[o + 22];
      this.cont.fade = T[o + 23];
      b.continuous = this.cont;
    }
    const fc = T[o + 24];
    b.fxColor =
      fc < 0
        ? undefined
        : [((fc >> 16) & 255) / 255, ((fc >> 8) & 255) / 255, (fc & 255) / 255];
    this.selected = T[o + 25] !== 0;
    this.inspected = T[o + 26] !== 0;
    this.spec.range = T[o + 27];
    this.mods = T[o + 28];
    this.statuses = T[o + 29];
  }
}

class DomeMirror implements ShieldTowerView {
  x = 0; y = 0; gx = 0; gy = 0; hp = 0; hpMax = 0;
  domeR = 0; scale = 0; shield = 0; shieldAlpha = 0;
  read(D: Float32Array, o: number): void {
    this.x = D[o]; this.y = D[o + 1]; this.gx = D[o + 2]; this.gy = D[o + 3];
    this.hp = D[o + 4]; this.hpMax = D[o + 5];
    this.domeR = D[o + 6]; this.scale = D[o + 7];
    this.shield = D[o + 8]; this.shieldAlpha = D[o + 9];
  }
}

class ProjMirror implements ProjectileView {
  x = 0; y = 0; vx = 0; vy = 0;
  kind: TowerKind = TOWER_KINDS[0];
  frag = false; age = 0; life = 0; bare = false; alt = false;
  read(P: Float32Array, o: number): void {
    this.x = P[o]; this.y = P[o + 1]; this.vx = P[o + 2]; this.vy = P[o + 3];
    this.kind = TOWER_KINDS[P[o + 4]] ?? TOWER_KINDS[0];
    this.frag = P[o + 5] !== 0;
    this.age = P[o + 6]; this.life = P[o + 7];
    this.bare = P[o + 8] !== 0;
    this.alt = P[o + 9] !== 0;
  }
}

class ShotMirror implements ShotView {
  x = 0; y = 0; vx = 0; vy = 0; age = 0; life = 0;
  look: ShotLook = LOOKS[0];
  read(S: Float32Array, o: number): void {
    this.x = S[o]; this.y = S[o + 1]; this.vx = S[o + 2]; this.vy = S[o + 3];
    this.age = S[o + 4]; this.life = S[o + 5];
    this.look = LOOKS[S[o + 6]] ?? LOOKS[0];
  }
}

class ConvoyMirror implements ConvoyView {
  live = false; x = 0; y = 0; rot = 0; hp = 0; hpMax = 0; halted = false; walk = 0;
  read(V: Float32Array): void {
    this.live = V[0] !== 0;
    this.x = V[1]; this.y = V[2]; this.rot = V[3];
    this.hp = V[4]; this.hpMax = V[5];
    this.halted = V[6] !== 0;
    this.walk = V[7];
  }
}

class CoreMirror implements CoreView {
  x = 0; y = 0; gx = 0; gy = 0; size = 1; hp = 0; hpMax = 0; selected = false;
  read(C: Float32Array): void {
    this.x = C[0]; this.y = C[1]; this.gx = C[2]; this.gy = C[3];
    this.size = C[4]; this.hp = C[5]; this.hpMax = C[6];
    this.selected = C[7] !== 0;
  }
}

/** grow a pool of mirrors to `need`, keeping the ones already made */
function pool<T>(list: T[], need: number, make: () => T): void {
  while (list.length < need) list.push(make());
}

/**
 * THE SNAPSHOT, WEARING THE SHAPE THE RENDERER EXPECTS. Refreshed in place
 * from the packed numbers; the arrays it hands out are the pools themselves,
 * sliced to the live count, so a frame allocates nothing once the board has
 * reached its high-water mark.
 */
export class SnapshotView implements StructuresView, ShotsView {
  private readonly towerPool: TowerMirror[] = [];
  private readonly domePool: DomeMirror[] = [];
  private readonly projPool: ProjMirror[] = [];
  private readonly shotPool: ShotMirror[] = [];
  private readonly coreMirror = new CoreMirror();
  private readonly convoyMirror = new ConvoyMirror();

  towers: readonly TowerView[] = [];
  shieldTowers: readonly ShieldTowerView[] = [];
  shots: readonly ShotView[] = [];
  /** the shots as packed (ShotsView.projPacked) — what the renderer reads */
  projPacked: Float32Array = new Float32Array(0);
  projN = 0;
  /** ...and as mirrors, built the first time a frame asks (ShotsView.projs) */
  private projsCache: readonly ProjectileView[] = [];
  private projsStale = true;
  get projs(): readonly ProjectileView[] {
    if (this.projsStale) {
      pool(this.projPool, this.projN, () => new ProjMirror());
      for (let i = 0; i < this.projN; i++) this.projPool[i].read(this.projPacked, i * PROJ_F);
      this.projsCache = this.projPool.slice(0, this.projN);
      this.projsStale = false;
    }
    return this.projsCache;
  }
  readonly core: CoreView;
  readonly convoy: ConvoyView;
  time = 0;
  selectedN = 0;
  inspectMark: { x: number; y: number; top: number } | null = null;
  /** the arrow's spot, refilled rather than rebuilt */
  private readonly markAt = { x: 0, y: 0, top: 0 };
  /** one per unit slot — the renderer asks only whether it is set */
  aiming: Uint8Array = new Uint8Array(0);

  /**
   * `bulletFor` is handed in rather than owned: it is a pure lookup that
   * lives with the sim's tables, and both sides call the same one.
   */
  constructor(readonly bulletFor: ShotsView["bulletFor"]) {
    this.core = this.coreMirror;
    this.convoy = this.convoyMirror;
  }

  read(s: Snapshot): void {
    this.time = s.time;
    pool(this.towerPool, s.towerN, () => new TowerMirror());
    for (let i = 0; i < s.towerN; i++) this.towerPool[i].read(s.towers, i * TOWER_F);
    this.towers = this.towerPool.slice(0, s.towerN);

    pool(this.domePool, s.domeN, () => new DomeMirror());
    for (let i = 0; i < s.domeN; i++) this.domePool[i].read(s.domes, i * DOME_F);
    this.shieldTowers = this.domePool.slice(0, s.domeN);

    this.projPacked = s.projs;
    this.projN = s.projN;
    this.projsStale = true;

    pool(this.shotPool, s.shotN, () => new ShotMirror());
    for (let i = 0; i < s.shotN; i++) this.shotPool[i].read(s.shots, i * SHOT_F);
    this.shots = this.shotPool.slice(0, s.shotN);

    this.coreMirror.read(s.core);
    this.convoyMirror.read(s.convoy);
    this.aiming = s.aiming;

    this.selectedN = s.selectedN;
    if (s.mark[0] === 0) this.inspectMark = null;
    else {
      this.markAt.x = s.mark[1];
      this.markAt.y = s.mark[2];
      this.markAt.top = s.mark[3];
      this.inspectMark = this.markAt;
    }
  }
}

// ---------- the whole view, flat half and packed half together ----------

/**
 * THE FLAT HALF OF THE WORLD: every member of SimView that is already a
 * typed array, and whose IDENTITY NEVER CHANGES once the sim is built.
 *
 * That last part is what makes the crossing cheap. These arrays are captured
 * once, not per frame, because `new Float32Array` happens at construction
 * and never again — so when the sim is on a worker and these are allocated
 * on memory both threads hold, the drawing side takes its references once at
 * level load and reads them for the rest of the run with nothing copied and
 * nothing sent.
 */
export type FlatWorld = {
  readonly upx: Float32Array;
  readonly upy: Float32Array;
  readonly ubrot: Float32Array;
  readonly urot: Float32Array;
  readonly ukind: Uint8Array;
  readonly uid: Int32Array;
  readonly uhp: Float32Array;
  readonly uhpmax: Float32Array;
  readonly urad: Float32Array;
  readonly uwalk: Float32Array;
  readonly ufly: Uint8Array;
  readonly uwet: Float32Array;
  readonly uhungry: Uint8Array;
  readonly ueaten: Uint8Array;
  readonly uwade: Uint8Array;
  readonly ucloakT: Float32Array;
  readonly ustack: Uint8Array;
  readonly ushield: Float32Array;
  readonly ushieldAlpha: Float32Array;
  readonly ushieldMax: Float32Array;
  readonly uforceScale: Float32Array;
  readonly ubeamT: Float32Array;
  readonly ucharge: Float32Array;
  readonly uheldRot: Float32Array;
  readonly ulegFX: Float32Array;
  readonly ulegFY: Float32Array;
  readonly ulegJX: Float32Array;
  readonly ulegJY: Float32Array;
  readonly ulegStage: Float32Array;
  readonly ulegMove: Uint8Array;
  readonly usegX: Float32Array;
  readonly usegY: Float32Array;
  readonly uwakeX: Float32Array;
  readonly uwakeY: Float32Array;
  readonly uwakeN: Uint8Array;
  readonly aliveByKind: Int32Array;
  readonly uspawn: Float32Array;
  readonly uburn: Float32Array;
  readonly upoison: Float32Array;
  readonly usoak: Float32Array;
  readonly uvet: Float32Array;
  readonly uled: Float32Array;
  readonly uvirus: Uint8Array;
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
};

/**
 * EVERY KEY OF FlatWorld, by name, so the worker can hand across exactly
 * these views and nothing else of the sim (flatOf). Kept beside the type
 * because the compiler checks the two against each other: a key added to
 * one and not the other fails to build.
 */
export const FLAT_KEYS = [
  "upx", "upy", "ubrot", "urot", "ukind", "uid", "uhp", "uhpmax", "urad", "uwalk",
  "ufly", "uwet", "uhungry", "ueaten", "uwade", "ucloakT", "ustack", "ushield",
  "ushieldAlpha", "ushieldMax", "uforceScale", "ubeamT", "ucharge", "uheldRot", "ulegFX", "ulegFY",
  "ulegJX", "ulegJY", "ulegStage", "ulegMove", "usegX", "usegY", "uwakeX", "uwakeY",
  "uwakeN", "aliveByKind", "uspawn", "uburn", "upoison", "usoak", "uvet", "uled", "uvirus", "fxX", "fxY", "fxAge", "fxTtl", "fxKind", "fxLen", "fxRot",
  "fxSeed", "fxSides", "fxUnit", "fxHasCol", "fxColR", "fxColG", "fxColB", "fxPts",
] as const satisfies readonly (keyof FlatWorld)[];
// ...and the other direction: every key of the type is in the list
type Missing = Exclude<keyof FlatWorld, (typeof FLAT_KEYS)[number]>;
const _everyKeyListed: Missing extends never ? true : Missing = true;
void _everyKeyListed;

/** just the flat half of a world — what crosses to the drawing side by reference */
export function flatOf(src: FlatWorld): FlatWorld {
  const out: Partial<Record<keyof FlatWorld, unknown>> = {};
  for (const k of FLAT_KEYS) out[k] = src[k];
  return out as FlatWorld;
}

/**
 * WHAT THE DRAWING SIDE ACTUALLY HOLDS. The flat arrays by reference, the
 * object half through a SnapshotView, and the three live counts on top.
 *
 * It exists so that `Sim` does not have to be the thing the renderer is
 * handed. Today it is built around a Sim sitting in the same thread and the
 * indirection buys nothing; the day the sim moves, the arrays come from
 * shared memory and `read` is fed by a message, and NOTHING ELSE CHANGES —
 * the renderer has been drawing from this all along.
 */
export class DrawView implements SimView {
  readonly upx: Float32Array;
  readonly upy: Float32Array;
  readonly ubrot: Float32Array;
  readonly urot: Float32Array;
  readonly ukind: Uint8Array;
  readonly uid: Int32Array;
  readonly uhp: Float32Array;
  readonly uhpmax: Float32Array;
  readonly urad: Float32Array;
  readonly uwalk: Float32Array;
  readonly ufly: Uint8Array;
  readonly uwet: Float32Array;
  readonly uhungry: Uint8Array;
  readonly ueaten: Uint8Array;
  readonly uwade: Uint8Array;
  readonly ucloakT: Float32Array;
  readonly ustack: Uint8Array;
  readonly ushield: Float32Array;
  readonly ushieldAlpha: Float32Array;
  readonly ushieldMax: Float32Array;
  readonly uforceScale: Float32Array;
  readonly ubeamT: Float32Array;
  readonly ucharge: Float32Array;
  readonly uheldRot: Float32Array;
  readonly ulegFX: Float32Array;
  readonly ulegFY: Float32Array;
  readonly ulegJX: Float32Array;
  readonly ulegJY: Float32Array;
  readonly ulegStage: Float32Array;
  readonly ulegMove: Uint8Array;
  readonly usegX: Float32Array;
  readonly usegY: Float32Array;
  readonly uwakeX: Float32Array;
  readonly uwakeY: Float32Array;
  readonly uwakeN: Uint8Array;
  readonly aliveByKind: Int32Array;
  readonly uspawn: Float32Array;
  readonly uburn: Float32Array;
  readonly upoison: Float32Array;
  readonly usoak: Float32Array;
  readonly uvet: Float32Array;
  readonly uled: Float32Array;
  readonly uvirus: Uint8Array;
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

  /** the object half, refilled from the packed numbers */
  private readonly snap: SnapshotView;

  /** the three that move every frame */
  n = 0;
  fxN = 0;
  time = 0;
  aiming: Uint8Array = new Uint8Array(0);
  terrain: Terrain;

  constructor(
    src: FlatWorld,
    terrain: Terrain,
    readonly bulletFor: ShotsView["bulletFor"],
    /**
     * THE GRIDS A PLACEMENT READS, and the bodies standing on them. Held by
     * reference like the flat arrays: on shared memory these are the sim's
     * own, so the answers below are computed from the same bytes the sim
     * would compute them from, at the same instant, without asking it.
     */
    private readonly grids: BoardGrids,
    private readonly bodies: BoardBodies,
    private readonly domes: () => readonly BoardDome[],
    private readonly unlocked: () => ReadonlySet<TowerKind> | null,
    airRoutes: readonly { pts: readonly number[] }[] = [],
  ) {
    this.airRoutes = airRoutes;
    this.upx = src.upx;
    this.upy = src.upy;
    this.ubrot = src.ubrot;
    this.urot = src.urot;
    this.ukind = src.ukind;
    this.uid = src.uid;
    this.uhp = src.uhp;
    this.uhpmax = src.uhpmax;
    this.urad = src.urad;
    this.uwalk = src.uwalk;
    this.ufly = src.ufly;
    this.uwet = src.uwet;
    this.uhungry = src.uhungry;
    this.ueaten = src.ueaten;
    this.uwade = src.uwade;
    this.ucloakT = src.ucloakT;
    this.ustack = src.ustack;
    this.ushield = src.ushield;
    this.ushieldAlpha = src.ushieldAlpha;
    this.ushieldMax = src.ushieldMax;
    this.uforceScale = src.uforceScale;
    this.ubeamT = src.ubeamT;
    this.ucharge = src.ucharge;
    this.uheldRot = src.uheldRot;
    this.ulegFX = src.ulegFX;
    this.ulegFY = src.ulegFY;
    this.ulegJX = src.ulegJX;
    this.ulegJY = src.ulegJY;
    this.ulegStage = src.ulegStage;
    this.ulegMove = src.ulegMove;
    this.usegX = src.usegX;
    this.usegY = src.usegY;
    this.uwakeX = src.uwakeX;
    this.uwakeY = src.uwakeY;
    this.uwakeN = src.uwakeN;
    this.aliveByKind = src.aliveByKind;
    this.uspawn = src.uspawn;
    this.uburn = src.uburn;
    this.upoison = src.upoison;
    this.usoak = src.usoak;
    this.uvet = src.uvet;
    this.uled = src.uled;
    this.uvirus = src.uvirus;
    this.fxX = src.fxX;
    this.fxY = src.fxY;
    this.fxAge = src.fxAge;
    this.fxTtl = src.fxTtl;
    this.fxKind = src.fxKind;
    this.fxLen = src.fxLen;
    this.fxRot = src.fxRot;
    this.fxSeed = src.fxSeed;
    this.fxSides = src.fxSides;
    this.fxUnit = src.fxUnit;
    this.fxHasCol = src.fxHasCol;
    this.fxColR = src.fxColR;
    this.fxColG = src.fxColG;
    this.fxColB = src.fxColB;
    this.fxPts = src.fxPts;
    this.terrain = terrain;
    this.snap = new SnapshotView(bulletFor);
  }

  get towers(): readonly TowerView[] {
    return this.snap.towers;
  }
  get shieldTowers(): readonly ShieldTowerView[] {
    return this.snap.shieldTowers;
  }
  get core(): CoreView {
    return this.snap.core;
  }
  get convoy(): ConvoyView {
    return this.snap.convoy;
  }
  get projs(): readonly ProjectileView[] {
    return this.snap.projs;
  }
  get projPacked(): Float32Array {
    return this.snap.projPacked;
  }
  get projN(): number {
    return this.snap.projN;
  }
  get shots(): readonly ShotView[] {
    return this.snap.shots;
  }
  get selectedN(): number {
    return this.snap.selectedN;
  }
  get inspectMark(): { x: number; y: number; top: number } | null {
    return this.snap.inspectMark;
  }
  /** fixed for the level, so it is taken once and not published (see SimView) */
  readonly airRoutes: readonly { pts: readonly number[] }[];
  // ---- the board questions, answered here rather than across a thread ----

  canPlace(gx: number, gy: number, kind: TowerKind, size?: number): boolean {
    return canPlaceOn(
      this.grids,
      this.bodies,
      this.domes(),
      SHIELD_TOWER_SIZE,
      this.unlocked(),
      gx,
      gy,
      kind,
      size,
    );
  }

  isWaterlogged(gx: number, gy: number, kind: TowerKind, size?: number): boolean {
    return waterloggedUnder(this.grids, gx, gy, kind, size);
  }

  rulerCells(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    kind: TowerKind,
  ): { gx: number; gy: number }[] {
    return rulerCells(x0, y0, x1, y1, kind);
  }

  get hydrophobicOn(): boolean {
    return this.grids.waterlogged !== null;
  }

  /** take a published frame: the counts, and the object half behind them */
  read(s: Snapshot, n: number, fxN: number): void {
    this.n = n;
    this.fxN = fxN;
    this.time = s.time;
    this.aiming = s.aiming;
    this.snap.read(s);
  }
}
