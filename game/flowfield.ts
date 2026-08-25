import { BASE, CELL, clamp, COLS, INF, NCELLS, ROWS, W, H } from "./constants";
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
 * distance field, then every walkable cell gets a unit direction toward its
 * cheapest neighbour. Units just sample the field — pathfinding is O(map),
 * not O(units).
 */
export class FlowField {
  readonly walk = new Uint8Array(NCELLS); // 1 = blocked
  readonly isGoal = new Uint8Array(NCELLS);
  readonly dist = new Float32Array(NCELLS);
  readonly dirX = new Float32Array(NCELLS);
  readonly dirY = new Float32Array(NCELLS);
  // spawn-pad cells (indices), from the terrain's spawn layer:
  // spawnPts = open AND connected to the core (where walkers may enter);
  // spawnAir = every open pad (flyers ignore ground connectivity)
  spawnPts: number[] = [];
  spawnAir: number[] = [];
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

  rebuildWalk(towers: readonly Tower[], blockedBase: Uint8Array, spawnMask: Uint8Array): void {
    this.spawnMask = spawnMask;
    this.walk.set(blockedBase);
    this.isGoal.fill(0);
    for (const t of towers)
      for (let y = t.gy; y < t.gy + 2; y++)
        for (let x = t.gx; x < t.gx + 2; x++) this.walk[y * COLS + x] = 1;
    for (let y = BASE.y; y < BASE.y + BASE.size; y++)
      for (let x = BASE.x; x < BASE.x + BASE.size; x++) this.isGoal[y * COLS + x] = 1;
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

  compute(): void {
    const { walk, isGoal, dist, dirX, dirY, narrow } = this;
    for (let i = 0; i < NCELLS; i++) {
      narrow[i] = 0;
      if (walk[i]) continue;
      const x = i % COLS, y = (i / COLS) | 0;
      const bL = x <= 0 || walk[i - 1] === 1;
      const bR = x >= COLS - 1 || walk[i + 1] === 1;
      const bU = y <= 0 || walk[i - COLS] === 1;
      const bD = y >= ROWS - 1 || walk[i + COLS] === 1;
      if ((bL && bR) || (bU && bD) || ((bL || bR) && (bU || bD))) narrow[i] = 1;
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
        const nd = dist[i] + c + (narrow[ni] ? FlowField.NARROW_COST : 0);
        if (nd < dist[ni] - 1e-6) {
          dist[ni] = nd;
          this.hPush(nd, ni);
        }
      }
    }

    for (let i = 0; i < NCELLS; i++) {
      dirX[i] = 0;
      dirY[i] = 0;
      if (walk[i] || isGoal[i] || dist[i] >= INF) continue;
      const x = i % COLS, y = (i / COLS) | 0;
      let best = dist[i], bx = 0, by = 0;
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
      const len = Math.hypot(bx, by);
      if (len > 0) {
        dirX[i] = bx / len;
        dirY[i] = by / len;
      }
    }

    this.spawnPts = [];
    this.spawnAir = [];
    const mask = this.spawnMask;
    if (mask) {
      for (let i = 0; i < NCELLS; i++) {
        if (!mask[i] || walk[i]) continue;
        this.spawnAir.push(i);
        if (this.dist[i] < INF) this.spawnPts.push(i);
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
