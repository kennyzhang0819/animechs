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
  readonly isGoal = new Uint8Array(NCELLS);
  readonly dist = new Float32Array(NCELLS);
  readonly dirX = new Float32Array(NCELLS);
  readonly dirY = new Float32Array(NCELLS);
  /**
   * Cells of this layer's spawn mask that are passable AND connected to one
   * of its goals — where a unit of this layer may actually be dropped. A
   * pad the field cannot reach a goal from is left out rather than
   * stranding the units that enter on it.
   */
  spawnPts: number[] = [];
  private spawnMask: Uint8Array | null = null;

  // binary min-heap with lazy deletion (131,072 slots, ~2.7 per cell —
  // sized for 8 per cell back when the board was 128x128)
  private readonly hKey = new Float64Array(1 << 17);
  private readonly hVal = new Int32Array(1 << 17);
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
  readonly clear = new Float32Array(NCELLS);

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
   */
  private computeClearance(): void {
    const { walk, clear } = this;
    for (let i = 0; i < NCELLS; i++) clear[i] = walk[i] ? 0 : INF;
    for (let y = 0; y < ROWS; y++) {
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
    }
    for (let y = ROWS - 1; y >= 0; y--) {
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
    }
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
  private sweepEikonal(): void {
    const { solid, isGoal, dist, cost } = this;
    for (let round = 0; round < 2; round++) {
      for (let s = 0; s < 4; s++) {
        const rx = (s & 1) !== 0, ry = (s & 2) !== 0;
        for (let yy = 0; yy < ROWS; yy++) {
          const y = ry ? ROWS - 1 - yy : yy;
          const row = y * COLS;
          for (let xx = 0; xx < COLS; xx++) {
            const x = rx ? COLS - 1 - xx : xx;
            const i = row + x;
            if (solid[i] || isGoal[i]) continue;
            const a = Math.min(
              x > 0 && !solid[i - 1] ? dist[i - 1] : INF,
              x < COLS - 1 && !solid[i + 1] ? dist[i + 1] : INF,
            );
            const b = Math.min(
              y > 0 && !solid[i - COLS] ? dist[i - COLS] : INF,
              y < ROWS - 1 && !solid[i + COLS] ? dist[i + COLS] : INF,
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
            if (t < dist[i]) dist[i] = t;
          }
        }
      }
    }
  }

  compute(): void {
    const { walk, soft, solid, isGoal, dist, dirX, dirY, narrow, cost } = this;
    this.computeClearance();
    for (let i = 0; i < NCELLS; i++) solid[i] = walk[i] && !soft[i] ? 1 : 0;
    for (let i = 0; i < NCELLS; i++) {
      narrow[i] = 0;
      cost[i] = 1;
      // a structure's cell is on the path at a price, and nothing else
      // about the lane (narrowness, the verge) is asked of it
      if (soft[i]) {
        cost[i] = 1 + STRUCTURE_COST;
        continue;
      }
      if (walk[i]) continue;
      const x = i % COLS, y = (i / COLS) | 0;
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
      const t = (FlowField.EDGE_REACH - this.clear[i]) / (FlowField.EDGE_REACH - 1);
      if (t > 0) cost[i] += FlowField.EDGE_COST * Math.min(1, t) * Math.min(1, t);
    }
    dist.fill(INF);
    this.hN = 0;
    // every goal seeds at zero, the core's soft cells included (see
    // rebuildWalk): the walk from them into the open ground around the core
    // is what gives every lane its heading
    for (let i = 0; i < NCELLS; i++)
      if (isGoal[i]) {
        dist[i] = 0;
        this.hPush(0, i);
      }

    while (this.hN > 0) {
      const i = this.hPop();
      if (this.popKey > dist[i] + 1e-6) continue;
      const x = i % COLS, y = (i / COLS) | 0;
      for (const [dx, dy, c] of D8) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
        const ni = ny * COLS + nx;
        if (solid[ni]) continue;
        // no cutting corners diagonally through a blocked cell
        if (dx !== 0 && dy !== 0 && (solid[y * COLS + nx] || solid[ny * COLS + x])) continue;
        const nd = dist[i] + c + cost[ni] - 1;
        if (nd < dist[ni] - 1e-6) {
          dist[ni] = nd;
          // push the value AS STORED, not nd. dist is a Float32Array while
          // the heap key is a float64, so pushing nd leaves the key holding
          // more precision than the array kept — and once distances grow
          // past ~130 that rounding gap outruns the 1e-6 slack in the
          // stale-pop guard below, which then throws away LIVE frontier
          // entries. The heap empties early and the walk stops dead at a
          // flat distance contour, stranding every spawn pad beyond it
          this.hPush(dist[ni], ni);
        }
      }
    }

    // Dijkstra settled reachability and an upper bound; the sweep turns that
    // bound into a smooth field whose gradient is a usable heading
    this.sweepEikonal();

    for (let i = 0; i < NCELLS; i++) {
      dirX[i] = 0;
      dirY[i] = 0;
      if (walk[i] || isGoal[i] || dist[i] >= INF) continue;
      const x = i % COLS, y = (i / COLS) | 0;
      const d = dist[i];
      // upwind gradient: on each axis, lean toward the cheaper side by
      // exactly how much cheaper it is. Both magnitudes vary continuously
      // with the field, so the heading turns smoothly across open ground
      // rather than snapping between eight compass points. A SOFT
      // neighbour counts: the heading leans INTO a structure the path
      // runs through, which is what presses the body against it
      const xm = x > 0 && !solid[i - 1] ? dist[i - 1] : INF;
      const xp = x < COLS - 1 && !solid[i + 1] ? dist[i + 1] : INF;
      const ym = y > 0 && !solid[i - COLS] ? dist[i - COLS] : INF;
      const yp = y < ROWS - 1 && !solid[i + COLS] ? dist[i + COLS] : INF;
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
          if (walk[ni]) continue;
          if (dx !== 0 && dy !== 0 && (walk[y * COLS + nx] || walk[ny * COLS + x])) continue;
          if (dist[ni] < best) {
            best = dist[ni];
            bx = dx;
            by = dy;
          }
        }
        len = Math.hypot(bx, by);
      }
      if (len > 0) {
        dirX[i] = bx / len;
        dirY[i] = by / len;
      }
    }

    this.spawnPts = [];
    const mask = this.spawnMask;
    if (mask) {
      for (let i = 0; i < NCELLS; i++) {
        // passable to this layer, covered by one of its zones, and able to
        // reach a goal — a pad failing the last test would strand whatever
        // entered on it, so it is not a door at all
        if (!mask[i] || walk[i] || this.dist[i] >= INF) continue;
        this.spawnPts.push(i);
      }
    }
  }

  

  /** bilinear sample of the direction field at a world position */
  sample(px: number, py: number, out: Vec2): void {
    const { walk, dirX, dirY } = this;
    const gx = px / CELL - 0.5, gy = py / CELL - 0.5;
    const x0 = Math.floor(gx), y0 = Math.floor(gy);
    const tx = gx - x0, ty = gy - y0;
    let sx = 0, sy = 0;
    for (let j = 0; j <= 1; j++) {
      for (let i = 0; i <= 1; i++) {
        const cx = clamp(x0 + i, 0, COLS - 1), cy = clamp(y0 + j, 0, ROWS - 1);
        const ci = cy * COLS + cx;
        if (walk[ci]) continue;
        const w = (i ? tx : 1 - tx) * (j ? ty : 1 - ty);
        sx += dirX[ci] * w;
        sy += dirY[ci] * w;
      }
    }
    const len = Math.sqrt(sx * sx + sy * sy);
    if (len < 0.05) {
      const ci =
        clamp((py / CELL) | 0, 0, ROWS - 1) * COLS + clamp((px / CELL) | 0, 0, COLS - 1);
      out.x = dirX[ci];
      out.y = dirY[ci];
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
