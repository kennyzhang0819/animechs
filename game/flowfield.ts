import { CELL, clamp, COLS, INF, NCELLS, ROWS, W, H } from "./constants";
import type { Tower } from "./types";

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
 * Grid occupancy plus a flow field: one Dijkstra pass from the core produces a
 * distance field, a fast-sweeping pass refines it into a proper eikonal one,
 * then every walkable cell gets a unit direction from that field's upwind
 * gradient. Units just sample the field — pathfinding is O(map), not O(units).
 */
export class FlowField {
  readonly walk = new Uint8Array(NCELLS); // 1 = blocked
  readonly isGoal = new Uint8Array(NCELLS);
  readonly dist = new Float32Array(NCELLS);
  readonly dirX = new Float32Array(NCELLS);
  readonly dirY = new Float32Array(NCELLS);
  // spawn-pad cells (indices), from the terrain's spawn layer (whose values
  // are region ids — 0 none, N >= 1 a pad in region N):
  // spawnPts = open AND connected to the core (where walkers may enter);
  // spawnAir = every open pad (flyers ignore ground connectivity).
  // The ByRegion maps split the same lists per region id, for wave groups
  // that pin their units to one region
  spawnPts: number[] = [];
  spawnAir: number[] = [];
  readonly spawnPtsByRegion = new Map<number, number[]>();
  readonly spawnAirByRegion = new Map<number, number[]>();
  private spawnMask: Uint8Array | null = null;

  // binary min-heap with lazy deletion (sized for ~8 relaxations per cell)
  private readonly hKey = new Float64Array(1 << 17);
  private readonly hVal = new Int32Array(1 << 17);
  private hN = 0;
  private popKey = 0;

  // scratch for sealsSpawns
  private readonly bfsSeen = new Uint8Array(NCELLS);
  private readonly bfsQ = new Int32Array(NCELLS);

  // per-cell entry-cost flag: 1-wide slots, bends, and diagonal pinches.
  // Such cells are physically passable (units thread them one at a time)
  // but have single-file throughput — costing them extra keeps the main
  // stream on real lanes, so dense crowds never crush into a crack. A
  // crack that is the ONLY route still gets used: the penalty is finite
  private readonly narrow = new Uint8Array(NCELLS);
  // extra Dijkstra cost per narrow cell entered (in cell units)
  private static readonly NARROW_COST = 4;
  /**
   * per-cell travel cost, i.e. 1 plus whatever `narrow` adds. Dijkstra pays
   * it on entry; the eikonal sweep reads the same number as the slowness
   * |grad dist| has to match, so both passes agree on what a cell is worth
   */
  private readonly cost = new Float32Array(NCELLS);
  /**
   * how far each open cell sits from the nearest rock, in cells: 1 for a
   * cell touching a wall, growing toward the middle of a corridor. The sim
   * reads it to decide how much room a crowd has to fan out into — no room
   * means a 1-wide slot, where spreading is not on offer
   */
  readonly clear = new Float32Array(NCELLS);

  rebuildWalk(
    towers: readonly Tower[],
    blockedBase: Uint8Array,
    spawnMask: Uint8Array,
    core: { x: number; y: number; size: number },
  ): void {
    this.spawnMask = spawnMask;
    this.walk.set(blockedBase);
    this.isGoal.fill(0);
    for (const t of towers)
      for (let y = t.gy; y < t.gy + 2; y++)
        for (let x = t.gx; x < t.gx + 2; x++) this.walk[y * COLS + x] = 1;
    for (let y = core.y; y < core.y + core.size; y++)
      for (let x = core.x; x < core.x + core.size; x++) this.isGoal[y * COLS + x] = 1;
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
   * core, so a wide crowd stays wide.
   */
  private sweepEikonal(): void {
    const { walk, isGoal, dist, cost } = this;
    for (let round = 0; round < 2; round++) {
      for (let s = 0; s < 4; s++) {
        const rx = (s & 1) !== 0, ry = (s & 2) !== 0;
        for (let yy = 0; yy < ROWS; yy++) {
          const y = ry ? ROWS - 1 - yy : yy;
          const row = y * COLS;
          for (let xx = 0; xx < COLS; xx++) {
            const x = rx ? COLS - 1 - xx : xx;
            const i = row + x;
            if (walk[i] || isGoal[i]) continue;
            const a = Math.min(
              x > 0 && !walk[i - 1] ? dist[i - 1] : INF,
              x < COLS - 1 && !walk[i + 1] ? dist[i + 1] : INF,
            );
            const b = Math.min(
              y > 0 && !walk[i - COLS] ? dist[i - COLS] : INF,
              y < ROWS - 1 && !walk[i + COLS] ? dist[i + COLS] : INF,
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
    const { walk, isGoal, dist, dirX, dirY, narrow, cost } = this;
    this.computeClearance();
    for (let i = 0; i < NCELLS; i++) {
      narrow[i] = 0;
      cost[i] = 1;
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
    }
    dist.fill(INF);
    this.hN = 0;
    for (let i = 0; i < NCELLS; i++)
      if (isGoal[i] && !walk[i]) {
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
        if (walk[ni]) continue;
        // no cutting corners diagonally through a blocked cell
        if (dx !== 0 && dy !== 0 && (walk[y * COLS + nx] || walk[ny * COLS + x])) continue;
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
      // rather than snapping between eight compass points
      const xm = x > 0 && !walk[i - 1] ? dist[i - 1] : INF;
      const xp = x < COLS - 1 && !walk[i + 1] ? dist[i + 1] : INF;
      const ym = y > 0 && !walk[i - COLS] ? dist[i - COLS] : INF;
      const yp = y < ROWS - 1 && !walk[i + COLS] ? dist[i + COLS] : INF;
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
    this.spawnAir = [];
    this.spawnPtsByRegion.clear();
    this.spawnAirByRegion.clear();
    const mask = this.spawnMask;
    if (mask) {
      const into = (map: Map<number, number[]>, region: number, i: number): void => {
        const pads = map.get(region);
        if (pads) pads.push(i);
        else map.set(region, [i]);
      };
      for (let i = 0; i < NCELLS; i++) {
        if (!mask[i] || walk[i]) continue;
        this.spawnAir.push(i);
        into(this.spawnAirByRegion, mask[i], i);
        if (this.dist[i] < INF) {
          this.spawnPts.push(i);
          into(this.spawnPtsByRegion, mask[i], i);
        }
      }
    }
  }

  /**
   * Would blocking this 2x2 footprint cut every spawn cell off from the core?
   * A BFS reachability probe — nothing is mutated and no field is recomputed.
   * 4-connectivity matches the movement rules: the no-corner-cutting check in
   * compute() only permits a diagonal when both orthogonal cells are open, so
   * a diagonal never connects anything a 4-connected path doesn't.
   */
  sealsSpawns(bgx: number, bgy: number): boolean {
    const { walk, isGoal, bfsSeen: seen, bfsQ: q } = this;
    seen.fill(0);
    let n = 0;
    for (let i = 0; i < NCELLS; i++)
      if (isGoal[i] && !walk[i]) {
        seen[i] = 1;
        q[n++] = i;
      }
    for (let h = 0; h < n; h++) {
      const i = q[h];
      const x = i % COLS, y = (i / COLS) | 0;
      if (this.spawnMask?.[i]) return false; // a spawn pad is still reachable
      for (const [dx, dy] of D4) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
        if (nx >= bgx && nx < bgx + 2 && ny >= bgy && ny < bgy + 2) continue;
        const ni = ny * COLS + nx;
        if (seen[ni] || walk[ni]) continue;
        seen[ni] = 1;
        q[n++] = ni;
      }
    }
    return true;
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
    const len = Math.hypot(sx, sy);
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
    // it — else a unit flush against a wall reads as colliding and wedges
    const r2 = r - 1e-3;
    return (
      this.blockedPx(x - r, y - r) ||
      this.blockedPx(x + r2, y - r) ||
      this.blockedPx(x - r, y + r2) ||
      this.blockedPx(x + r2, y + r2)
    );
  }
}
