import {
  CELL as CELL_IMPORT,
  clamp as clamp_IMPORT,
  COLS as COLS_IMPORT,
  INF,
  NCELLS,
  ROWS as ROWS_IMPORT,
  W as W_IMPORT,
  H as H_IMPORT,
} from "./constants";
import { STRUCTURE_COST } from "./weapons";
import * as shared from "./shared";
import type { FieldPort, FieldReply, FieldRequest } from "./fieldport";

// Module-local bindings for the constants blockedPx/hitsWall/sample read:
// an imported binding is a getter call under CommonJS interop (dev server,
// node tools), and these functions run ~10 times per unit per tick. A
// module-local const is a plain read.
const CELL = CELL_IMPORT;
const clamp = clamp_IMPORT;
const COLS = COLS_IMPORT;
const ROWS = ROWS_IMPORT;
const W = W_IMPORT;
const H = H_IMPORT;

const SQRT2 = Math.SQRT2;

/** the clock a sliced solve keeps its budget by (advance) */
const now = () => performance.now();

const D8: ReadonlyArray<readonly [number, number, number]> = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, SQRT2],
  [1, -1, SQRT2],
  [-1, 1, SQRT2],
  [-1, -1, SQRT2],
];

const D4: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

export interface Vec2 {
  x: number;
  y: number;
}

/**
 * The passes a solve is made of, in order — see FlowField.advance. They
 * are numbered so `step` can be compared and stepped on; Done is where an
 * idle field sits, and Idle is what starts one.
 */
const enum Step {
  Idle = 0,
  ClearFwd,
  ClearBack,
  Cost,
  Seed,
  Dijkstra,
  Sweep,
  Grad,
  Spawn,
  Done,
}

/**
 * Grid occupancy plus a flow field: one Dijkstra pass seeded from every goal
 * cell produces a distance field, a fast-sweeping pass refines it into a
 * proper eikonal one, then every walkable cell gets a unit direction from
 * that field's upwind gradient. Units just sample the field — pathfinding
 * is O(map), not O(units).
 *
 * ONE FIELD IS ONE MOVEMENT LAYER. The class knows nothing about ground,
 * water or air: it is a field over whatever passability mask it is handed,
 * seeded from whatever goal mask it is handed. The Sim owns three — the
 * walkers' (mask: rock and towers), the hulls' (mask: everything that is
 * not water) and the flyers' (mask: the hills, and nothing else). The
 * third is the odd one, and only in how it is USED: a walker or a hull is
 * stopped by its mask, while a flyer merely routes by its own and is free
 * to be shoved straight through it.
 *
 * That is also what let the region machinery go. This class used to carry a
 * SECOND spawn mask for flyers and a pair of pads-by-region maps, because
 * one field was serving three kinds of unit with one set of doors between
 * them. Each layer has its own field and its own doors now, so a field's
 * spawn list is simply "the cells of my mask a unit of my layer can enter
 * from and actually reach a goal from".
 */
/** a structure's cells on the field: top-left and edge, in cells */
export interface Footprint {
  gx: number;
  gy: number;
  size: number;
}

export class FlowField {
  readonly walk = new Uint8Array(NCELLS); // 1 = impassable to THIS layer
  /**
   * A STRUCTURE STANDS HERE, on ground the layer could otherwise walk.
   * Solid to the body (walk is 1, hitsWall says so) but NOT to the path:
   * compute() routes through a soft cell at STRUCTURE_COST, so the swarm
   * walks around a wall when the way round is cheaper and into it when it
   * is not — and a body pressed into a wall it cannot pass shoots it
   * (Sim.updateUnitWeapons). Mindustry's own ground pathing.
   */
  readonly soft = new Uint8Array(NCELLS);
  /** walk and not soft — what the path solver treats as rock */
  private readonly solid = new Uint8Array(NCELLS);
  /** on shared memory: a placement reads it from the drawing side (board.ts
   *  BoardGrids), which may be the other thread */
  readonly isGoal = shared.u8(NCELLS);
  /**
   * THE PUBLISHED FIELD — the distance, the heading and the room, as
   * everything outside this class reads them. Not readonly, because a
   * sliced solve (advance) swaps a finished field in wholesale: the
   * solver never writes these, it fills the `w`-buffers below and trades
   * the two over at the end. A field being re-solved therefore keeps
   * serving the LAST one, whole and self-consistent, for as long as the
   * new one takes — nothing ever reads a half-solved heading.
   */
  dist: Float32Array = new Float32Array(NCELLS);
  dirX: Float32Array = new Float32Array(NCELLS);
  dirY: Float32Array = new Float32Array(NCELLS);
  /**
   * Cells of this layer's spawn mask that are passable AND connected to one
   * of its goals — where a unit of this layer may actually be dropped. A
   * pad the field cannot reach a goal from is left out rather than
   * stranding the units that enter on it.
   */
  spawnPts: number[] = [];
  private spawnMask: Uint8Array | null = null;

  // binary min-heap with lazy deletion, sized BY THE GRID: with lazy
  // deletion a cell can sit in the heap more than once, so it is four
  // slots a cell. (It was a fixed 131,072 — 8 a cell on the 128x128
  // board, 2 a cell on the 256 one — and hPush never checks the bound: on
  // the 512x512 grid a fixed size would silently overflow the arrays)
  private readonly hKey = new Float64Array(NCELLS * 4);
  private readonly hVal = new Int32Array(NCELLS * 4);
  private hN = 0;
  private popKey = 0;

  // scratch for sealsSpawns

  // per-cell entry-cost flag: 1-wide slots, bends, and diagonal pinches.
  // Such cells are physically passable (units thread them one at a time)
  // but have single-file throughput — costing them extra keeps the main
  // stream on real lanes, so dense crowds never crush into a crack. A
  // crack that is the ONLY route still gets used: the penalty is finite
  private readonly narrow = new Uint8Array(NCELLS);
  // extra Dijkstra cost per narrow cell entered (in cell units)
  private static readonly NARROW_COST = 4;
  /**
   * THE VERGE: how far from rock a cell stops being charged for being near
   * it, in cells. Beyond this the cost is flat, which is the point — the
   * penalty is "keep off the rock", not "walk the exact centre line", and
   * a lane wider than twice this has a flat band down its middle for the
   * crowd to spread across rather than a single cheapest thread to queue on.
   */
  private static readonly EDGE_REACH = 3.5;
  /**
   * What a cell flush against rock costs on top of its 1, tapering to
   * nothing at EDGE_REACH.
   *
   * This is the number that stops the swarm scraping the walls, and it does
   * it in the FIELD rather than in a steering force, which is the only
   * place it can be done properly. A pure distance field's cheapest route
   * is the geodesic, and a geodesic clips the inside of every corner: on an
   * open map its shortest line runs along the rock for tile after tile with
   * a lane's whole width standing empty beside it. No amount of local
   * push-off fixes that, because the field is pulling the unit back onto
   * the wall every tick. Charging the verge moves the cheapest route off it
   * instead, and everything downstream — the spread, the centring, the
   * crowd shove — then works with the field rather than against it.
   *
   * It also buys the second half of the same idea: the cheapest path is no
   * longer the shortest one. At this weight a detour is worth taking if it
   * trades a tile of wall-hugging for under ~2.2 tiles of open ground, so
   * the field will happily walk a longer, roomier lane past a shorter tight
   * one — and where two routes are close in length, the wide one wins.
   */
  private static readonly EDGE_COST = 2.2;
  /**
   * per-cell travel cost: 1, plus whatever `narrow` adds for single-file
   * throughput, plus the verge charge for sitting near rock (EDGE_COST).
   * Dijkstra pays it on entry; the eikonal sweep reads the same number as
   * the slowness |grad dist| has to match, so both passes agree on what a
   * cell is worth.
   */
  private readonly cost = new Float32Array(NCELLS);
  /**
   * how far each open cell sits from the nearest rock, in cells: 1 for a
   * cell touching a wall, growing toward the middle of a corridor. The sim
   * reads it to decide how much room a crowd has to fan out into — no room
   * means a 1-wide slot, where spreading is not on offer
   */
  clear: Float32Array = new Float32Array(NCELLS);

  // THE WORK BUFFERS: where a solve builds the next field. Swapped with
  // the published ones the instant it finishes (publish), never read from
  // outside
  private wDist: Float32Array = new Float32Array(NCELLS);
  private wDirX: Float32Array = new Float32Array(NCELLS);
  private wDirY: Float32Array = new Float32Array(NCELLS);
  private wClear: Float32Array = new Float32Array(NCELLS);
  private wSpawn: number[] = [];
  /**
   * WHERE THE SOLVE HAS GOT TO. A solve is a run of raster passes, a
   * Dijkstra and a sweep — a tenth of a second of work on a 512x512 map,
   * which is a dropped frame if it is taken in one bite. `advance` takes
   * it a few milliseconds at a time instead and this says where to pick
   * up: which pass, and how far into it.
   */
  private step: Step = Step.Idle;
  /** the row, cell or pop the current pass stopped at */
  private cursor = 0;
  /** the eikonal sweep's place in its two rounds of four orders */
  private sweepRound = 0;
  private sweepOrder = 0;

  /**
   * Re-seed the field: what blocks this layer, where it may enter, and what
   * it is aiming at. `towers` block only layers that share the ground with
   * them — the caller passes an empty list for a layer towers cannot touch.
   *
   * A goal mask with nothing in it leaves the field with no destination and
   * every distance at infinity, which reads downstream as "this layer has
   * nowhere to go". The Sim never lets that happen: it resolves a layer's
   * exits (falling back to the other layers', then to the base) before it
   * gets here, so the fallback lives in one place instead of two.
   */
  rebuildWalk(
    footprints: readonly Footprint[],
    blockedBase: Uint8Array,
    spawnMask: Uint8Array,
    goalMask: Uint8Array,
    /** the SWARM's own structures: rock to its walkers — solid and never
     *  soft, so the path goes round them and nothing shoots them */
    hard: readonly Footprint[] = [],
  ): void {
    this.spawnMask = spawnMask;
    this.walk.set(blockedBase);
    this.soft.fill(0);
    this.isGoal.fill(0);
    for (const t of footprints) {
      const sz = t.size;
      for (let y = t.gy; y < t.gy + sz; y++)
        for (let x = t.gx; x < t.gx + sz; x++) {
          const i = y * COLS + x;
          if (!blockedBase[i]) this.soft[i] = 1;
          this.walk[i] = 1;
        }
    }
    for (const t of hard) {
      const sz = t.size;
      for (let y = t.gy; y < t.gy + sz; y++)
        for (let x = t.gx; x < t.gx + sz; x++) this.walk[y * COLS + x] = 1;
    }
    // compute() seeds its Dijkstra from EVERY isGoal cell at distance 0,
    // which is a multi-source shortest path. THE CORE IS THE GOAL: its
    // cells are a structure's — solid to the body, soft to the path — and
    // a soft goal is still a goal, so every heading leans into the core
    // and the swarm presses against it and fires. A goal under rock is
    // not a goal.
    for (let i = 0; i < NCELLS; i++)
      if (goalMask[i] && (!this.walk[i] || this.soft[i])) this.isGoal[i] = 1;
  }

  private hPush(k: number, v: number): void {
    const { hKey, hVal } = this;
    let i = this.hN++;
    hKey[i] = k;
    hVal[i] = v;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (hKey[p] <= hKey[i]) break;
      const tk = hKey[p]; hKey[p] = hKey[i]; hKey[i] = tk;
      const tv = hVal[p]; hVal[p] = hVal[i]; hVal[i] = tv;
      i = p;
    }
  }

  private hPop(): number {
    const { hKey, hVal } = this;
    const v = hVal[0];
    this.popKey = hKey[0];
    this.hN--;
    const n = this.hN;
    if (n > 0) {
      hKey[0] = hKey[n];
      hVal[0] = hVal[n];
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < n && hKey[l] < hKey[m]) m = l;
        if (r < n && hKey[r] < hKey[m]) m = r;
        if (m === i) break;
        const tk = hKey[m]; hKey[m] = hKey[i]; hKey[i] = tk;
        const tv = hVal[m]; hVal[m] = hVal[i]; hVal[i] = tv;
        i = m;
      }
    }
    return v;
  }

  /**
   * Chamfer distance transform for `clear`: two raster passes over a 3x3
   * neighbourhood with 1 / sqrt(2) weights. Rock reads 0, and everything
   * off the edge of the map counts as rock so a border cell never looks
   * like open field.
   *
   * A ROW AT A TIME, like every other pass here, so the solve can be put
   * down mid-map and picked up next frame (advance).
   */
  private stepClearFwd(until: number): void {
    const clear = this.wClear;
    for (let y = this.cursor; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const i = y * COLS + x;
        if (clear[i] === 0) continue;
        let v = x === 0 || y === 0 || x === COLS - 1 || y === ROWS - 1 ? 1 : clear[i];
        if (x > 0) v = Math.min(v, clear[i - 1] + 1);
        if (y > 0) v = Math.min(v, clear[i - COLS] + 1);
        if (x > 0 && y > 0) v = Math.min(v, clear[i - COLS - 1] + SQRT2);
        if (x < COLS - 1 && y > 0) v = Math.min(v, clear[i - COLS + 1] + SQRT2);
        clear[i] = v;
      }
      if (now() >= until) {
        this.cursor = y + 1;
        return;
      }
    }
    this.cursor = ROWS - 1;
    this.step = Step.ClearBack;
  }

  private stepClearBack(until: number): void {
    const clear = this.wClear;
    for (let y = this.cursor; y >= 0; y--) {
      for (let x = COLS - 1; x >= 0; x--) {
        const i = y * COLS + x;
        if (clear[i] === 0) continue;
        let v = clear[i];
        if (x < COLS - 1) v = Math.min(v, clear[i + 1] + 1);
        if (y < ROWS - 1) v = Math.min(v, clear[i + COLS] + 1);
        if (x < COLS - 1 && y < ROWS - 1) v = Math.min(v, clear[i + COLS + 1] + SQRT2);
        if (x > 0 && y < ROWS - 1) v = Math.min(v, clear[i + COLS - 1] + SQRT2);
        clear[i] = v;
      }
      if (now() >= until) {
        this.cursor = y - 1;
        return;
      }
    }
    this.cursor = 0;
    this.step = Step.Cost;
  }

  /**
   * What every cell charges to enter: 1, plus the narrow penalty for a
   * single-file slot, plus the verge charge for sitting near rock — and a
   * structure's cell at STRUCTURE_COST flat, which is what the swarm pays
   * to chew through a wall instead of walking round it.
   */
  private stepCost(until: number): void {
    const { walk, soft, narrow, cost, wClear } = this;
    for (let y = this.cursor; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const i = y * COLS + x;
        narrow[i] = 0;
        cost[i] = 1;
        // a structure's cell is on the path at a price, and nothing else
        // about the lane (narrowness, the verge) is asked of it
        if (soft[i]) {
          cost[i] = 1 + STRUCTURE_COST;
          continue;
        }
        if (walk[i]) continue;
        const bL = x <= 0 || walk[i - 1] === 1;
        const bR = x >= COLS - 1 || walk[i + 1] === 1;
        const bU = y <= 0 || walk[i - COLS] === 1;
        const bD = y >= ROWS - 1 || walk[i + COLS] === 1;
        if ((bL && bR) || (bU && bD) || ((bL || bR) && (bU || bD))) {
          narrow[i] = 1;
          cost[i] = 1 + FlowField.NARROW_COST;
        }
        // ...and the verge charge on top, for every cell within EDGE_REACH of
        // rock (see EDGE_COST). SQUARED, not linear: a linear ramp has the
        // same slope everywhere it acts, which is a steady pull toward the
        // exact middle of any lane narrower than 2 x EDGE_REACH and would
        // trade one queue along the wall for another down the centre line.
        // Squared puts the whole gradient in the last cell or so before the
        // rock, where the point is, and leaves the rest of the lane nearly
        // flat, where the crowd is meant to be able to sit anywhere.
        const t = (FlowField.EDGE_REACH - wClear[i]) / (FlowField.EDGE_REACH - 1);
        if (t > 0) cost[i] += FlowField.EDGE_COST * Math.min(1, t) * Math.min(1, t);
      }
      if (now() >= until) {
        this.cursor = y + 1;
        return;
      }
    }
    this.cursor = 0;
    this.step = Step.Seed;
  }

  /**
   * Every goal seeds the Dijkstra at zero, the core's soft cells included
   * (see rebuildWalk): the walk out of them into the open ground around
   * the core is what gives every lane its heading.
   */
  private stepSeed(until: number): void {
    const { isGoal, wDist } = this;
    for (let y = this.cursor; y < ROWS; y++) {
      const row = y * COLS;
      for (let x = 0; x < COLS; x++) {
        const i = row + x;
        if (!isGoal[i]) continue;
        wDist[i] = 0;
        this.hPush(0, i);
      }
      if (now() >= until) {
        this.cursor = y + 1;
        return;
      }
    }
    this.cursor = 0;
    this.step = Step.Dijkstra;
  }

  /** the multi-source shortest path itself, in bites of POPS_PER_CHECK */
  private stepDijkstra(until: number): void {
    const { solid, wDist, cost } = this;
    let n = 0;
    while (this.hN > 0) {
      const i = this.hPop();
      if (this.popKey > wDist[i] + 1e-6) continue;
      const x = i % COLS, y = (i / COLS) | 0;
      for (const [dx, dy, c] of D8) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
        const ni = ny * COLS + nx;
        if (solid[ni]) continue;
        // no cutting corners diagonally through a blocked cell
        if (dx !== 0 && dy !== 0 && (solid[y * COLS + nx] || solid[ny * COLS + x])) continue;
        const nd = wDist[i] + c + cost[ni] - 1;
        if (nd < wDist[ni] - 1e-6) {
          wDist[ni] = nd;
          // push the value AS STORED, not nd. dist is a Float32Array while
          // the heap key is a float64, so pushing nd leaves the key holding
          // more precision than the array kept — and once distances grow
          // past ~130 that rounding gap outruns the 1e-6 slack in the
          // stale-pop guard below, which then throws away LIVE frontier
          // entries. The heap empties early and the walk stops dead at a
          // flat distance contour, stranding every spawn pad beyond it
          this.hPush(wDist[ni], ni);
        }
      }
      if ((++n & 0x3ff) === 0 && now() >= until) return;
    }
    this.step = Step.Sweep;
  }

  /**
   * Fast-sweeping refinement of the Dijkstra field into an eikonal one:
   * solve |grad dist| = cost with the standard Godunov upwind update, run in
   * four alternating raster orders. Every update takes a min, so seeding the
   * sweep with Dijkstra — whose 8-way distance is an upper bound on the true
   * geodesic — only ever lowers a cell, and lands within a rounding error of
   * the fixed point in two rounds.
   *
   * This is the pass that stops crowds funnelling. An 8-way field offers a
   * cell exactly eight headings, and under octile costs a straight step and a
   * diagonal step buy the same progress, so descent directions collapse onto
   * a few 45-degree seams and every unit in an open field walks the same ray,
   * single file. An eikonal field's gradient is isotropic: two units a tile
   * apart get two slightly different headings, both aimed straight at the
   * base, so a wide crowd stays wide.
   */
  private stepSweep(until: number): void {
    const { solid, isGoal, wDist, cost } = this;
    while (this.sweepRound < 2) {
      const rx = (this.sweepOrder & 1) !== 0, ry = (this.sweepOrder & 2) !== 0;
      for (let yy = this.cursor; yy < ROWS; yy++) {
        const y = ry ? ROWS - 1 - yy : yy;
        const row = y * COLS;
        for (let xx = 0; xx < COLS; xx++) {
          const x = rx ? COLS - 1 - xx : xx;
          const i = row + x;
          if (solid[i] || isGoal[i]) continue;
          const a = Math.min(
            x > 0 && !solid[i - 1] ? wDist[i - 1] : INF,
            x < COLS - 1 && !solid[i + 1] ? wDist[i + 1] : INF,
          );
          const b = Math.min(
            y > 0 && !solid[i - COLS] ? wDist[i - COLS] : INF,
            y < ROWS - 1 && !solid[i + COLS] ? wDist[i + COLS] : INF,
          );
          if (a >= INF && b >= INF) continue;
          const f = cost[i];
          const d = a - b;
          // one axis carries the whole front when the two disagree by more
          // than a cell of cost; otherwise both do, via the two-axis root
          const t =
            Math.abs(d) >= f
              ? Math.min(a, b) + f
              : (a + b + Math.sqrt(2 * f * f - d * d)) * 0.5;
          if (t < wDist[i]) wDist[i] = t;
        }
        if (now() >= until) {
          this.cursor = yy + 1;
          return;
        }
      }
      this.cursor = 0;
      if (++this.sweepOrder >= 4) {
        this.sweepOrder = 0;
        this.sweepRound++;
      }
    }
    this.step = Step.Grad;
  }

  /**
   * The heading itself: every open cell's upwind gradient, read off the
   * field the two passes above settled.
   *
   * A SOFT CELL IS ONE OF THEM. Only rock is skipped here (solid), not
   * every cell a body cannot stand in: the path already runs THROUGH a
   * structure at STRUCTURE_COST, so a cell a turret stands on has a real
   * distance, and refusing to write its heading left it a hole in the
   * published field. Two things fell into that hole.
   *
   * A BODY INSIDE THE PATCH. The Tuskers drop the route and walk straight
   * at what they can see (Sim.updateUnits, the charge), so they are the
   * one family that routinely stands in a turret's own cells. Reading a
   * zero there is a body told to go nowhere, and it stood where it was.
   *
   * AND THE CELL A DEAD TURRET LEAVES BEHIND. `walk` and `soft` are
   * cleared the instant a structure comes down (Sim.claimGround) while the
   * heading is only replaced by the next full solve — and every death
   * aborts the solve in flight, so a line being chewed through can go a
   * long time without one. In that window the wreck's cells read open and
   * pointed nowhere, and sample() blended that zero into the heading of
   * anything standing on them. Writing the heading a soft cell always had
   * closes the window: the cell was already on a route, and now it says so.
   */
  private stepGrad(until: number): void {
    const { solid, isGoal, wDist, wDirX, wDirY } = this;
    for (let i = this.cursor; i < NCELLS; i++) {
      wDirX[i] = 0;
      wDirY[i] = 0;
      if ((i & 0x7ff) === 0 && i !== this.cursor && now() >= until) {
        this.cursor = i;
        return;
      }
      if (solid[i] || isGoal[i] || wDist[i] >= INF) continue;
      const x = i % COLS, y = (i / COLS) | 0;
      const d = wDist[i];
      // upwind gradient: on each axis, lean toward the cheaper side by
      // exactly how much cheaper it is. Both magnitudes vary continuously
      // with the field, so the heading turns smoothly across open ground
      // rather than snapping between eight compass points. A SOFT
      // neighbour counts: the heading leans INTO a structure the path
      // runs through, which is what presses the body against it
      const xm = x > 0 && !solid[i - 1] ? wDist[i - 1] : INF;
      const xp = x < COLS - 1 && !solid[i + 1] ? wDist[i + 1] : INF;
      const ym = y > 0 && !solid[i - COLS] ? wDist[i - COLS] : INF;
      const yp = y < ROWS - 1 && !solid[i + COLS] ? wDist[i + COLS] : INF;
      let bx = 0, by = 0;
      if (xm < xp) { if (xm < d) bx = xm - d; } else if (xp < d) bx = d - xp;
      if (ym < yp) { if (ym < d) by = ym - d; } else if (yp < d) by = d - yp;
      let len = Math.hypot(bx, by);
      if (len < 1e-6) {
        // a cell the sweep never tightened whose orthogonal neighbours all
        // cost at least as much — its descent is diagonal. Fall back to the
        // 8-way steepest step, which Dijkstra guarantees exists
        let best = d;
        for (const [dx, dy] of D8) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
          const ni = ny * COLS + nx;
          // ...over the SAME mask the upwind term above reads. It used to
          // read `walk` here and `solid` there, and the disagreement was
          // the rest of the hole: a soft cell whose orthogonal neighbours
          // all tie it has only soft ones left to descend through, and
          // this refused every one of them.
          //
          // NO ROUTE MOVES FOR IT. Compared cell for cell on a 117-turret
          // board, every open cell that had a heading kept exactly the one
          // it had; the only open cells that changed are the four diagonal
          // corners of the core, which used to be dead and now point at it.
          if (solid[ni]) continue;
          if (dx !== 0 && dy !== 0 && (solid[y * COLS + nx] || solid[ny * COLS + x])) continue;
          if (wDist[ni] < best) {
            best = wDist[ni];
            bx = dx;
            by = dy;
          }
        }
        len = Math.hypot(bx, by);
      }
      if (len > 0) {
        wDirX[i] = bx / len;
        wDirY[i] = by / len;
      }
    }
    this.cursor = 0;
    this.step = Step.Spawn;
  }

  /** the doors that survive: a pad this layer can enter by AND reach a goal from */
  private stepSpawn(until: number): void {
    const mask = this.spawnMask;
    if (!mask) {
      this.wSpawn.length = 0;
      this.step = Step.Done;
      return;
    }
    const { walk, wDist, wSpawn } = this;
    for (let i = this.cursor; i < NCELLS; i++) {
      // passable to this layer, covered by one of its zones, and able to
      // reach a goal — a pad failing the last test would strand whatever
      // entered on it, so it is not a door at all
      if (mask[i] && !walk[i] && wDist[i] < INF) wSpawn.push(i);
      if ((i & 0x1fff) === 0 && i !== this.cursor && now() >= until) {
        this.cursor = i + 1;
        return;
      }
    }
    this.cursor = 0;
    this.step = Step.Done;
  }

  /** the finished field takes the place of the one everything is reading */
  private publish(): void {
    let f = this.dist; this.dist = this.wDist; this.wDist = f;
    f = this.dirX; this.dirX = this.wDirX; this.wDirX = f;
    f = this.dirY; this.dirY = this.wDirY; this.wDirY = f;
    f = this.clear; this.clear = this.wClear; this.wClear = f;
    const s = this.spawnPts; this.spawnPts = this.wSpawn; this.wSpawn = s;
  }

  /** start a solve over: the masks as they stand now, nothing carried across */
  private begin(): void {
    const { walk, soft, solid, wClear, wDist } = this;
    for (let i = 0; i < NCELLS; i++) {
      solid[i] = walk[i] && !soft[i] ? 1 : 0;
      wClear[i] = walk[i] ? 0 : INF;
    }
    wDist.fill(INF);
    this.wSpawn.length = 0;
    this.hN = 0;
    this.cursor = 0;
    this.sweepRound = 0;
    this.sweepOrder = 0;
    this.step = Step.ClearFwd;
  }

  /** a solve is under way and has not published yet — in slices here, or
   *  on the field worker (remoteId) */
  get solving(): boolean {
    return this.step !== Step.Idle || this.remoteId !== 0;
  }

  /** throw away a solve in flight — the board it was solving has moved on.
   *  A reply still to come from the worker is then ignored (adopt) */
  abort(): void {
    this.step = Step.Idle;
    this.remoteId = 0;
  }

  // ---------- the solve on another thread (fieldport.ts) ----------

  /** the request the field worker is answering, or 0 when none */
  private remoteId = 0;

  /** ask the field worker for this field's solve; the answer lands in adopt */
  requestRemote(port: FieldPort): void {
    this.remoteId = port.request(this);
  }

  /** the masks as they stand, COPIED, for a solve over exactly this board */
  masks(id: number): FieldRequest {
    return {
      id,
      walk: this.walk.slice(),
      soft: this.soft.slice(),
      // slice() lands on ordinary memory even from a shared array — the
      // copy is what makes the solve a snapshot rather than a race
      isGoal: this.isGoal.slice(),
      spawn: this.spawnMask ? this.spawnMask.slice() : null,
    };
  }

  /**
   * THE FINISHED FIELD, FROM THE WORKER — adopted whole, the four arrays
   * and the doors together, so nothing ever reads a heading from one solve
   * against a distance from another. A reply to a request this field has
   * since abandoned (abort — a reset under it) is not adopted.
   */
  adopt(r: FieldReply): void {
    if (r.id !== this.remoteId) return;
    this.remoteId = 0;
    this.dist = r.dist;
    this.dirX = r.dirX;
    this.dirY = r.dirY;
    this.clear = r.clear;
    this.spawnPts = r.spawnPts;
  }

  /** the worker's side: take the masks a request carries as this field's own */
  setMasks(walk: Uint8Array, soft: Uint8Array, isGoal: Uint8Array, spawn: Uint8Array | null): void {
    this.walk.set(walk);
    this.soft.set(soft);
    this.isGoal.set(isGoal);
    this.spawnMask = spawn;
  }

  /**
   * ...and hand the published field over for the reply, leaving fresh
   * buffers behind: what is returned gets TRANSFERRED to the other thread,
   * and a transferred buffer is detached here.
   */
  takeResult(): Omit<FieldReply, "id"> {
    const r = {
      dist: this.dist,
      dirX: this.dirX,
      dirY: this.dirY,
      clear: this.clear,
      spawnPts: this.spawnPts,
    };
    this.dist = new Float32Array(NCELLS);
    this.dirX = new Float32Array(NCELLS);
    this.dirY = new Float32Array(NCELLS);
    this.clear = new Float32Array(NCELLS);
    this.spawnPts = [];
    return r;
  }

  /**
   * Forget the published field: no distances, no headings, no doors.
   *
   * A field being re-solved normally keeps serving its last answer, which
   * is the point of the work buffers — but a field being re-AIMED (a move
   * order sent somewhere else, Sim.orderMove) would then spend the whole
   * solve steering bodies at the place they were told to leave. Blanking
   * it makes the readers fall through to whatever they do with no field,
   * which for an order is the straight line at the point.
   */
  blank(): void {
    this.dist.fill(INF);
    this.dirX.fill(0);
    this.dirY.fill(0);
    this.spawnPts = [];
  }

  /**
   * SOLVE IN SLICES, `budgetMs` of work a call, and publish the result the
   * moment it is whole.
   *
   * A solve is about a tenth of a second on a 512x512 map, and a tenth of
   * a second taken in one bite is a visibly dropped frame every time a
   * turret goes down — which is exactly what a player feels when the same
   * click both builds and re-routes. Taken two or three milliseconds at a
   * time it is a dozen frames nobody can see, and because the passes fill
   * the work buffers and only trade them in at the end (publish), the
   * swarm steers by the LAST finished field throughout rather than by a
   * half-solved one.
   *
   * Returns true on the call that publishes.
   */
  advance(budgetMs: number): boolean {
    if (this.step === Step.Idle) this.begin();
    const until = budgetMs >= Infinity ? Infinity : now() + budgetMs;
    while (this.step !== Step.Done) {
      switch (this.step) {
        case Step.ClearFwd: this.stepClearFwd(until); break;
        case Step.ClearBack: this.stepClearBack(until); break;
        case Step.Cost: this.stepCost(until); break;
        case Step.Seed: this.stepSeed(until); break;
        case Step.Dijkstra: this.stepDijkstra(until); break;
        case Step.Sweep: this.stepSweep(until); break;
        case Step.Grad: this.stepGrad(until); break;
        default: this.stepSpawn(until); break;
      }
      // the pass above moved `step` on; TypeScript cannot see through the
      // call, so the read is widened back to what it actually is
      if ((this.step as Step) !== Step.Done && now() >= until) return false;
    }
    this.publish();
    this.step = Step.Idle;
    return true;
  }

  /** the whole solve in one bite — a new map, and the headless tools */
  compute(): void {
    this.abort();
    this.advance(Infinity);
  }

  

  /** bilinear sample of the direction field at a world position */
  sample(px: number, py: number, out: Vec2): void {
    const { walk, dirX, dirY } = this;
    const gx = px / CELL - 0.5, gy = py / CELL - 0.5;
    const x0 = Math.floor(gx), y0 = Math.floor(gy);
    const tx = gx - x0, ty = gy - y0;
    // THE FOUR CORNERS, WRITTEN OUT. Every body on the field reads its
    // field once a tick and this was most of that read: a loop of four
    // whose body is two clamp calls, an index and a branch does not come
    // out of the loop nearly as well as four straight lines do, and the
    // rows are shared between the pairs rather than multiplied out twice.
    const cx0 = x0 < 0 ? 0 : x0 > COLS - 1 ? COLS - 1 : x0;
    const cx1 = x0 + 1 < 0 ? 0 : x0 + 1 > COLS - 1 ? COLS - 1 : x0 + 1;
    const r0 = (y0 < 0 ? 0 : y0 > ROWS - 1 ? ROWS - 1 : y0) * COLS;
    const r1 = (y0 + 1 < 0 ? 0 : y0 + 1 > ROWS - 1 ? ROWS - 1 : y0 + 1) * COLS;
    const wx = 1 - tx, wy = 1 - ty;
    let sx = 0, sy = 0;
    let ci = r0 + cx0;
    if (!walk[ci]) { const w = wx * wy; sx += dirX[ci] * w; sy += dirY[ci] * w; }
    ci = r0 + cx1;
    if (!walk[ci]) { const w = tx * wy; sx += dirX[ci] * w; sy += dirY[ci] * w; }
    ci = r1 + cx0;
    if (!walk[ci]) { const w = wx * ty; sx += dirX[ci] * w; sy += dirY[ci] * w; }
    ci = r1 + cx1;
    if (!walk[ci]) { const w = tx * ty; sx += dirX[ci] * w; sy += dirY[ci] * w; }
    const len = Math.sqrt(sx * sx + sy * sy);
    if (len < 0.05) {
      const at =
        clamp((py / CELL) | 0, 0, ROWS - 1) * COLS + clamp((px / CELL) | 0, 0, COLS - 1);
      out.x = dirX[at];
      out.y = dirY[at];
    } else {
      out.x = sx / len;
      out.y = sy / len;
    }
  }

  /** how far the open ground under this world position reaches from rock, in
   * cells — the sim's budget for letting a crowd spread sideways */
  clearanceAt(x: number, y: number): number {
    return this.clear[
      clamp((y / CELL) | 0, 0, ROWS - 1) * COLS + clamp((x / CELL) | 0, 0, COLS - 1)
    ];
  }

  blockedPx(x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= W || y >= H) return true;
    return this.walk[((y / CELL) | 0) * COLS + ((x / CELL) | 0)] === 1;
  }

  hitsWall(x: number, y: number, r: number): boolean {
    // the box is half-open like the grid cells it tests: a right/bottom
    // edge at exactly a cell boundary touches the next cell, not overlaps
    // it — else a unit flush against a wall reads as colliding and wedges.
    // One bounds check and four direct reads — this runs several times per
    // unit per tick, so it does not go through blockedPx corner by corner
    const r2 = r - 1e-3;
    const x0 = x - r, y0 = y - r, x1 = x + r2, y1 = y + r2;
    if (x0 < 0 || y0 < 0 || x1 >= W || y1 >= H) return true;
    const gx0 = (x0 / CELL) | 0, gx1 = (x1 / CELL) | 0;
    const r0 = ((y0 / CELL) | 0) * COLS, r1 = ((y1 / CELL) | 0) * COLS;
    const w = this.walk;
    return w[r0 + gx0] === 1 || w[r0 + gx1] === 1 || w[r1 + gx0] === 1 || w[r1 + gx1] === 1;
  }
}
