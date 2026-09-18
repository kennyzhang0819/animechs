/**
 * CAN A BUILDING STAND HERE — asked of grids, not of the sim.
 *
 * THE REASON THIS IS ITS OWN FILE. `drawOverlay` asks `canPlace` of every
 * cell under the cursor on EVERY FRAME, to colour the ghost the player is
 * dragging. That is fine while the sim is in the same thread and impossible
 * the moment it is not: a question asked across threads cannot be answered
 * before the next frame, and the main thread may not block waiting (there is
 * no Atomics.wait on it, and there should not be). A build cursor that
 * answered a frame late would be the whole feel of placing a turret, ruined.
 *
 * So the test does not move to the other thread — it moves OUT of the sim,
 * into functions over the arrays it reads. The sim calls them and so does
 * the drawing side, over the same shared grids (game/shared.ts), and both
 * get the same answer at the same instant because they are reading the same
 * memory rather than asking each other.
 *
 * WHAT A PLACEMENT ACTUALLY READS turns out to be five grids, the domes, the
 * bodies and the tech set — and nothing else about the world. That is what
 * made this worth doing: the surface is small, and none of it is state that
 * only the sim can know.
 *
 * ONE ANSWER, ONE PLACE. These are the only implementation; Sim.canPlace is
 * a call to `canPlaceOn` and nothing more. A mirror that is a second copy of
 * the rule would drift from it, and a build cursor that disagrees with what
 * the board will actually accept is worse than one that is a frame late.
 */
import {
  CELL,
  clamp,
  COLS,
  CORE_POWER_R,
  HC,
  HCOLS,
  HROWS,
  NCELLS,
  BEACON_POWER_R,
  BEACON_SIZE,
  ROWS,
  structStats,
} from "./constants";
import { HB_A, HB_B, HB_OVAL, HB_RMAX } from "./hitbox";
import { KIND_IS_CROSSER } from "./levels";
import type { TowerKind } from "./types";

/** how many buildings a ruler drag will lay down at most */
export const RULER_MAX = 64;

/**
 * THE BOARD AS A PLACEMENT SEES IT: five masks, one cell each.
 *
 * `occupied` is the one that is not simply terrain — it is a flag per cell
 * saying a structure stands on it, kept beside the sim's own `cellTower` (it
 * holds the buildings themselves, which cannot be shared) and written in the
 * same one place every structure appears or leaves (Sim.claimGround).
 */
export interface BoardGrids {
  /** mountains, forests, rocks — everything a unit cannot cross */
  readonly blocked: Uint8Array;
  /** the swarm's doors: a corked one spawns nothing, so nothing builds on it */
  readonly spawn: Uint8Array;
  /**
   * THE METAL DECKING ROUND A MISSION MARK (missionMarks.ts
   * forEachMarkPadCell): ground a mission's own structures will rise on,
   * so the player may not stand a turret in their way.
   *
   * IT IS THE PLATE THAT IS DRAWN, cell for cell — the decking is on the
   * board from the first frame precisely so the three places the swarm
   * keeps re-taking are readable before anything has risen on them, and
   * ground that LOOKS reserved has to BE reserved or the picture is a lie.
   */
  readonly reserved: Uint8Array;
  /** the core's own cells */
  readonly isGoal: Uint8Array;
  /** a structure stands here */
  readonly occupied: Uint8Array;
  /** the Hydrophobic rule's mask, or null where the rule is not in force */
  readonly waterlogged: Uint8Array | null;
  /**
   * THE POWER GRID: 1 on every cell the base or a bought beacon lights, and
   * nothing may be built anywhere else.
   *
   * It is a MASK and not a list of circles for the same reason `occupied`
   * is a mask and not a list of buildings: the drawing side reads it every
   * frame — once per cell under the cursor for the ghost, and the whole of
   * it for the overlay — and a cell test has to be one array read, not a
   * walk of every beacon on the board.
   *
   * ALWAYS AN ARRAY, never absent. Where the rule is off (the sandbox, the
   * two editors) it is all ones and every cell passes — see the note in
   * Sim.rebuildPower for why "off" is a mask of ones rather than no mask.
   */
  readonly powered: Uint8Array;
}

/**
 * ...AND THE BODIES ON IT, for the one test that is not about ground: a
 * footprint may not be dropped onto a unit. Read through the same spatial
 * hash the physics uses, so a placement costs a window and not a sweep.
 */
export interface BoardBodies {
  readonly n: number;
  readonly upx: Float32Array;
  readonly upy: Float32Array;
  readonly urot: Float32Array;
  readonly urad: Float32Array;
  readonly ukind: Uint8Array;
  readonly bStart: Int32Array;
  readonly bUnits: Int32Array;
}

/** a dome's footprint — it owns its ground for as long as it lives */
export interface BoardDome {
  readonly gx: number;
  readonly gy: number;
  readonly hp: number;
}

/**
 * A BODY'S RADIUS ALONG ONE DIRECTION. The round ones answer with their
 * radius; a shaped one is an ellipse and answers with where its own outline
 * crosses the line. Lifted out of Sim unchanged — it reads a kind, a facing
 * and two tables, all of which either side has.
 */
function hitR(b: BoardBodies, i: number, dx: number, dy: number, d2: number): number {
  const k = b.ukind[i];
  if (HB_OVAL[k] === 0) return b.urad[i];
  const a = HB_A[k], bb = HB_B[k];
  if (d2 <= 1e-8) return a < bb ? a : bb;
  const inv = 1 / Math.sqrt(d2);
  const rot = b.urot[i];
  const c = Math.cos(rot), sn = Math.sin(rot);
  const lx = ((dx * c + dy * sn) * inv) / a;
  const ly = ((dy * c - dx * sn) * inv) / bb;
  return 1 / Math.sqrt(lx * lx + ly * ly);
}

/**
 * Is there nothing standing under this footprint?
 *
 * A CROSSER IS NOT "STANDING" AND NEVER COUNTS. A Borer is kinematic: its
 * position is read off an authored road and it walks through rock, walls
 * and buildings alike (Sim.updateCrosser), so nothing can be in its way
 * and it is in nothing's way either. Letting it block a placement would
 * be the one direction the obstruction CAN go — a player dropping a
 * turret onto the line, being refused because seventy tiles of train
 * happen to be passing over the spot, and having to wait for it — which
 * is exactly backwards on the map whose whole point is buying guns out on
 * that line. It is tested by KIND, not by the sim's `ucross`, because
 * this file is on the drawing side of the seam and reads arrays only.
 */
export function bodiesClear(b: BoardBodies, gx: number, gy: number, sz: number): boolean {
  const x0 = gx * CELL, y0 = gy * CELL;
  const x1 = x0 + CELL * sz, y1 = y0 + CELL * sz;
  const rmax = HB_RMAX.both;
  const hx0 = clamp(((x0 - rmax) / HC) | 0, 0, HCOLS - 1);
  const hy0 = clamp(((y0 - rmax) / HC) | 0, 0, HROWS - 1);
  const hx1 = clamp(((x1 + rmax) / HC) | 0, 0, HCOLS - 1);
  const hy1 = clamp(((y1 + rmax) / HC) | 0, 0, HROWS - 1);
  for (let hy = hy0; hy <= hy1; hy++) {
    for (let hx = hx0; hx <= hx1; hx++) {
      const c = hy * HCOLS + hx, e = b.bStart[c + 1];
      for (let k = b.bStart[c]; k < e; k++) {
        const i = b.bUnits[k];
        if (i >= b.n || KIND_IS_CROSSER[b.ukind[i]]) continue;
        const dx = b.upx[i] - clamp(b.upx[i], x0, x1);
        const dy = b.upy[i] - clamp(b.upy[i], y0, y1);
        const d2 = dx * dx + dy * dy;
        const r = hitR(b, i, dx, dy, d2);
        if (d2 < r * r) return false;
      }
    }
  }
  return true;
}

/**
 * GROUND LEVEL ONLY. A structure stands on open ground, in the swarm's way,
 * where it is a wall as well as a gun — never on a hill, a forest or deep
 * water (every blocked cell), never on another structure (the core
 * included), never on a spawn tile. Shallow water is ground, as it is in
 * Mindustry: a naval map's shallows are most of the floor it has.
 */
export function groundClear(
  g: BoardGrids,
  gx: number,
  gy: number,
  sz: number,
  /** cells a move is about to vacate, which are not occupied to it (canMoveOn) */
  leaving?: ReadonlySet<number> | null,
): boolean {
  if (gx < 0 || gy < 0 || gx > COLS - sz || gy > ROWS - sz) return false;
  for (let y = gy; y < gy + sz; y++)
    for (let x = gx; x < gx + sz; x++) {
      const i = y * COLS + x;
      if (g.blocked[i] || g.isGoal[i] || g.spawn[i] || g.reserved[i]) return false;
      if (g.occupied[i] && !(leaving && leaving.has(i))) return false;
    }
  return true;
}

/**
 * ONE CIRCLE OF BUILDABLE GROUND: the core's, or a beacon that has been
 * switched on. `r` is per-disc rather than looked up off a kind, because
 * the core and a beacon light different distances (constants.ts
 * CORE_POWER_R, BEACON_POWER_R) and nothing below should have to know which
 * of the two it is holding.
 */
export interface PowerDisc {
  readonly x: number;
  readonly y: number;
  readonly r: number;
}

/**
 * EVERY CIRCLE LIGHTING GROUND RIGHT NOW — the core first, then one per
 * beacon the run has bought.
 *
 * IT IS HERE, IN board.ts, FOR THE REASON THE WHOLE FILE IS HERE: the sim
 * paints its mask from this and the DRAWING side reads it to ring the
 * beacons on screen. Two copies of "where does the light reach" would be
 * two pictures of one board, and the one a player is aiming at would be
 * the wrong one.
 *
 * `beaconOn` is indexed the same as `terrain.beacons` and is the ONLY thing
 * about beacons that crosses between threads — where they are and what they
 * cost is in the map document, which both sides read for themselves.
 */
export function powerDiscsOf(
  terrain: { readonly beacons: readonly { readonly x: number; readonly y: number }[] },
  beaconOn: Uint8Array,
  coreX: number,
  coreY: number,
): PowerDisc[] {
  const out: PowerDisc[] = [{ x: coreX, y: coreY, r: CORE_POWER_R }];
  const rs = terrain.beacons;
  for (let i = 0; i < rs.length; i++) {
    if (!beaconOn[i]) continue;
    out.push({ ...beaconCentre(rs[i]), r: BEACON_POWER_R });
  }
  return out;
}

/** a beacon's centre in world px, from the top-left cell the map wrote */
export const beaconCentre = (r: { readonly x: number; readonly y: number }): { x: number; y: number } => ({
  x: (r.x + BEACON_SIZE / 2) * CELL,
  y: (r.y + BEACON_SIZE / 2) * CELL,
});

/**
 * PAINT THE DISCS INTO A CELL MASK, from scratch every time.
 *
 * SPAN FILL rather than a per-cell distance test: the core's disc alone is
 * better than twenty-five thousand cells, and this way each ROW costs one
 * square root instead of one per cell. A cell is lit when its own CENTRE
 * falls inside a disc, which is the line poweredClear then tests footprints
 * against — so the mask and the rule agree by construction.
 */
export function paintPower(into: Uint8Array, discs: readonly PowerDisc[]): void {
  into.fill(0);
  for (const d of discs) {
    const r2 = d.r * d.r;
    const gy0 = Math.max(0, Math.floor((d.y - d.r) / CELL));
    const gy1 = Math.min(ROWS - 1, Math.ceil((d.y + d.r) / CELL));
    for (let gy = gy0; gy <= gy1; gy++) {
      const dy = (gy + 0.5) * CELL - d.y;
      const rem = r2 - dy * dy;
      if (rem < 0) continue;
      const half = Math.sqrt(rem);
      const a = Math.max(0, Math.ceil((d.x - half) / CELL - 0.5));
      const b = Math.min(COLS - 1, Math.floor((d.x + half) / CELL - 0.5));
      const row = gy * COLS;
      for (let gx = a; gx <= b; gx++) into[row + gx] = 1;
    }
  }
}

/**
 * IS THIS FOOTPRINT ON LIT GROUND — every cell of it, not the middle one.
 *
 * ALL OR NOTHING because the overlay draws the mask exactly as it is: a
 * rule that took a building whose corner hung over the dark would be a
 * rule the picture on screen does not describe, and the picture is the
 * only way a player knows where the line is.
 *
 * This is the test a BEACON passes too, and that is the whole chain: a mast
 * may only stand on ground something already lights, so the lit region
 * grows outward from the core one mast at a time and can never leap.
 */
export function poweredClear(
  powered: Uint8Array,
  gx: number,
  gy: number,
  sz: number,
): boolean {
  for (let y = gy; y < gy + sz; y++)
    for (let x = gx; x < gx + sz; x++) if (!powered[y * COLS + x]) return false;
  return true;
}

/** a LIVE dome owns its ground: it rose on free rock and holds it */
export function domesClear(
  domes: readonly BoardDome[],
  domeSize: number,
  gx: number,
  gy: number,
  sz: number,
): boolean {
  for (const s of domes) {
    if (s.hp <= 0) continue;
    if (gx < s.gx + domeSize && s.gx < gx + sz && gy < s.gy + domeSize && s.gy < gy + sz)
      return false;
  }
  return true;
}

/**
 * THE WHOLE TEST, in the order that refuses soonest and reads least: the
 * tech gate first (no grid at all), then the footprint against the masks,
 * then the POWER grid, then the domes, then the bodies — which is the only
 * part that walks a spatial hash.
 *
 * THE TECH GATE, AND NO PRICE GATE AT ALL. A turret is bought as a CARD and
 * the card is placed for nothing, so by the time a footprint is being tested
 * the scrap is already gone — asking for the price again here would charge a
 * run twice and refuse a card it had paid for. What the save owns it may
 * place from wave 1; there is no stage gate inside a run. A sandbox or an
 * editor owns everything, which is what `unlocked` being null means.
 *
 * `size` is the footprint the CALLER means, which is the kind's own
 * everywhere but the giant (mods.ts): a building has to be tested on the
 * ground it will actually stand on, and that is decided before it exists.
 *
 * Sealing the swarm's route is allowed: a wall it cannot walk around is a
 * wall it walks INTO and shoots (the field routes through structures at a
 * cost), so a seal is not a win, it is a fight at the wall.
 */
export function canPlaceOn(
  g: BoardGrids,
  b: BoardBodies,
  domes: readonly BoardDome[],
  domeSize: number,
  unlocked: ReadonlySet<TowerKind> | null,
  gx: number,
  gy: number,
  kind: TowerKind,
  size?: number,
): boolean {
  if (unlocked && !unlocked.has(kind)) return false;
  const sz = size ?? structStats(kind).size;
  if (!groundClear(g, gx, gy, sz)) return false;
  if (!poweredClear(g.powered, gx, gy, sz)) return false;
  if (!domesClear(domes, domeSize, gx, gy, sz)) return false;
  return bodiesClear(b, gx, gy, sz);
}

/** a building a drag is carrying: where it stands now, and how big it is */
export interface BoardMove {
  readonly gx: number;
  readonly gy: number;
  readonly size: number;
  readonly kind: TowerKind;
}

/**
 * CAN THIS GROUP OF BUILDINGS SHIFT BY (dgx, dgy) CELLS? The placement rule
 * again, with the one difference that makes a move a move: the ground the
 * movers are standing on is theirs to leave, so their own cells do not
 * count as occupied — a turret may step one cell sideways, and a block of
 * them may slide over itself.
 *
 * ALL OR NOTHING. A group that half fits is a formation the player did not
 * draw, so the answer for the group is the AND of the answers for its
 * buildings; `into`, when given, is filled with those per-building answers
 * so the ghost can say which one is in the way.
 *
 * The tech gate is not asked: every one of these is already standing.
 */
export function canMoveOn(
  g: BoardGrids,
  b: BoardBodies,
  domes: readonly BoardDome[],
  domeSize: number,
  moves: readonly BoardMove[],
  dgx: number,
  dgy: number,
  into?: boolean[] | null,
): boolean {
  const leaving = new Set<number>();
  for (const m of moves)
    for (let y = m.gy; y < m.gy + m.size; y++)
      for (let x = m.gx; x < m.gx + m.size; x++) leaving.add(y * COLS + x);
  let all = moves.length > 0 && (dgx !== 0 || dgy !== 0);
  for (let i = 0; i < moves.length; i++) {
    const m = moves[i];
    const gx = m.gx + dgx, gy = m.gy + dgy;
    const fits =
      groundClear(g, gx, gy, m.size, leaving) &&
      poweredClear(g.powered, gx, gy, m.size) &&
      domesClear(domes, domeSize, gx, gy, m.size) &&
      bodiesClear(b, gx, gy, m.size);
    if (into) into[i] = fits;
    if (!fits) {
      all = false;
      if (!into) break;
    }
  }
  return all;
}

/** does any cell of this footprint fall on the Hydrophobic mask? */
export function waterloggedUnder(
  g: BoardGrids,
  gx: number,
  gy: number,
  kind: TowerKind,
  size?: number,
): boolean {
  const mask = g.waterlogged;
  if (!mask) return false;
  const sz = size ?? structStats(kind).size;
  for (let y = gy; y < gy + sz; y++)
    for (let x = gx; x < gx + sz; x++)
      if (x >= 0 && y >= 0 && x < COLS && y < ROWS && mask[y * COLS + x]) return true;
  return false;
}

/**
 * THE RULER'S LINE: every footprint a drag from one point to another lays
 * down, snapped to one of the eight headings.
 *
 * It reads no world at all — only the drag and the kind's footprint — which
 * is why it lived in the sim for no reason other than that it was written
 * there. Nothing about it has changed in the move.
 */
export function rulerCells(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  kind: TowerKind,
): { gx: number; gy: number }[] {
  const sz = structStats(kind).size;
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

/** the occupancy flag grid a board keeps beside its structures */
export const newOccupancy = (): Uint8Array => new Uint8Array(NCELLS);
