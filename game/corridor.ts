import { clamp, CELL, COLS, INF, NCELLS, ROWS } from "./constants";
import type { Vec2 } from "./flowfield";
import { STRUCTURE_COST } from "./weapons";

/**
 * CORRIDOR TILES — a move order's route, as a field over the ground the
 * route actually crosses instead of a field over the whole map.
 *
 * WHY THIS EXISTS. A flow field answers "where do I step from here" for
 * every cell at once, which is exactly right when a great many bodies
 * share ONE destination: the swarm's field is solved once and read by
 * three hundred walkers. It is exactly wrong for move orders, where every
 * click is a new destination and the bodies on it are few. Paid as a
 * field per order it cost 22MB and about a tenth of a second EACH, so the
 * game could only afford four of them at once and had to retire somebody
 * else's order to give you a fifth — which, since the player's army has
 * no standing order to fall back on, stopped a body dead for a click it
 * had nothing to do with.
 *
 * So an order is solved the way Supreme Commander 2 solves one (Emerson,
 * Game AI Pro ch. 23) and roughly the way StarCraft II does: FIND THE
 * ROUTE FIRST, COARSELY, THEN BUILD THE FIELD ONLY ALONG IT.
 *
 *   1. The map is cut into SECTORs. Each sector knows its own connected
 *      components of open ground and the PORTALS — contiguous runs of
 *      open cells — joining it to its neighbours (SectorGraph). That is
 *      one structure for the whole board, shared by every order, and it
 *      only changes when the ground does.
 *   2. An order runs A* over the portals, which is a search over a few
 *      thousand nodes rather than a quarter of a million cells, and comes
 *      back with a chain of sectors: the corridor.
 *   3. The field — clearance, cost, Dijkstra, eikonal sweep, gradient, the
 *      same passes the full-map solve runs — is then computed over the
 *      cells of THOSE sectors only, and the headings are kept a byte an
 *      axis (Corridor).
 *
 * WHAT IT COSTS. A corridor across the whole map is a few hundred tiles
 * at 512 bytes of heading each: tens of kilobytes, against 22 megabytes,
 * and the solve is thousands of cells rather than the map. Orders stop
 * being a scarce resource — the slot count becomes a matter of taste, an
 * order can be solved on the frame it is given without slicing, and four
 * players with a dozen groups each is a few hundred kilobytes in total.
 *
 * WHAT IT COSTS YOU. The corridor is a commitment: a body shoved out of
 * it has no heading until it walks back in, and the route it took is the
 * portal graph's idea of a good one rather than the cell grid's. Both are
 * paid for on purpose — the skirt below widens the corridor by a sector
 * on every side so ordinary crowd shoving never leaves it, and the field
 * inside is the real one, so what a body does WITHIN the corridor is
 * exactly what it did when the field covered the map.
 */

/** cells a sector is on a side. 16 puts 1024 sectors on the 512 board — a
 *  portal graph of a few thousand nodes, and a tile of headings that is
 *  half a kilobyte */
export const SECTOR = 16;
export const SCOLS = (COLS / SECTOR) | 0;
export const SROWS = (ROWS / SECTOR) | 0;
export const NSECT = SCOLS * SROWS;
/** cells in one tile */
const TILE = SECTOR * SECTOR;

const SQRT2 = Math.SQRT2;

/** the sector a cell sits in */
export const sectorOf = (cell: number): number =>
  (((cell / COLS) | 0) / SECTOR | 0) * SCOLS + ((cell % COLS) / SECTOR | 0);

/**
 * THE VERGE CHARGE, the same numbers the full-map field uses
 * (FlowField.EDGE_REACH / EDGE_COST): a cell near rock costs more, so the
 * cheapest line through the corridor runs down the middle of the ground
 * rather than scraping the inside of every corner. Repeated here rather
 * than exported from there because the two solves are separate machines
 * that happen to agree — see the note on the sweep below.
 */
const EDGE_REACH = 3.5;
const EDGE_COST = 2.2;
const NARROW_COST = 1.5;

// ---------------------------------------------------------------------------
// SHARED SOLVE SCRATCH
//
// One corridor is built at a time — a click is a click — so every buffer a
// solve needs is module-wide and reused, and none of it is charged to the
// order. That is the whole trick that makes an order cheap: what used to
// be twenty-two megabytes a field was mostly work buffers and a heap, and
// there only ever needs to be one of those.
//
// `stamp` says which cells the CURRENT solve has touched, so none of these
// has to be cleared between corridors: a value is only real where the
// stamp matches, and a run is one 32-bit increment.
// ---------------------------------------------------------------------------
const dist = new Float32Array(NCELLS);
const cost = new Float32Array(NCELLS);
const clear = new Float32Array(NCELLS);
const stamp = new Int32Array(NCELLS);
/** 1 where a corridor cell is rock, filled as the cells are collected.
 *  The passes below run several times over every cell and each of them
 *  wants to know this; a byte read beats a call with three arguments */
const blk = new Uint8Array(NCELLS);
let runId = 0;

/** binary min-heap with lazy deletion, grown to the high-water mark of the
 *  biggest corridor seen so far rather than sized for the whole map */
let hKey = new Float64Array(1 << 15);
let hVal = new Int32Array(1 << 15);
let hN = 0;

const hGrow = (): void => {
  const k = new Float64Array(hKey.length * 2);
  k.set(hKey);
  hKey = k;
  const v = new Int32Array(hVal.length * 2);
  v.set(hVal);
  hVal = v;
};

const hPush = (key: number, val: number): void => {
  if (hN >= hKey.length) hGrow();
  let i = hN++;
  hKey[i] = key;
  hVal[i] = val;
  while (i > 0) {
    const p = (i - 1) >> 1;
    if (hKey[p] <= hKey[i]) break;
    const tk = hKey[p]; hKey[p] = hKey[i]; hKey[i] = tk;
    const tv = hVal[p]; hVal[p] = hVal[i]; hVal[i] = tv;
    i = p;
  }
};

let popKey = 0;

const hPop = (): number => {
  const out = hVal[0];
  popKey = hKey[0];
  const n = --hN;
  hKey[0] = hKey[n];
  hVal[0] = hVal[n];
  let i = 0;
  for (;;) {
    const l = i * 2 + 1, r = l + 1;
    let m = i;
    if (l < n && hKey[l] < hKey[m]) m = l;
    if (r < n && hKey[r] < hKey[m]) m = r;
    if (m === i) break;
    const tk = hKey[m]; hKey[m] = hKey[i]; hKey[i] = tk;
    const tv = hVal[m]; hVal[m] = hVal[i]; hVal[i] = tv;
    i = m;
  }
  return out;
};

/** the corridor's cells in raster order, and the same list with each row
 *  reversed: between them the eikonal sweep gets all four of the raster
 *  orders it needs (see sweep) without sorting anything twice */
/** the component flood's queue: one sector's worth of cells, and each is
 *  pushed at most once, so it never needs to be bigger */
const compQ = new Int32Array(TILE);

let rasterA = new Int32Array(1 << 15);
let rasterB = new Int32Array(1 << 15);
let rasterN = 0;

const rasterFit = (n: number): void => {
  if (rasterA.length >= n) return;
  let cap = rasterA.length;
  while (cap < n) cap *= 2;
  rasterA = new Int32Array(cap);
  rasterB = new Int32Array(cap);
};

// ---------------------------------------------------------------------------

/**
 * THE BOARD AS A GRAPH OF DOORWAYS.
 *
 * Every sector holds the connected components of its own open ground, and
 * every boundary between two sectors holds the PORTALS across it: maximal
 * runs of cells open on both sides. A portal is one node; two portals of
 * the same sector are joined when they touch the same component of that
 * sector's ground, which is what makes the graph honest — two doors on
 * opposite walls of a sector cut in half by rock are NOT connected, and a
 * route through that sector is not offered.
 *
 * The edge weight between two portals of a sector is the straight-line
 * distance between their midpoints, not the real walking distance. This is
 * an approximation, deliberately: the corridor is a HINT about which way to
 * go, and the field built inside it works out the actual steps. Paying for
 * exact intra-sector distances (a small Dijkstra per portal per sector)
 * would roughly triple what a rebuild costs to move a route by a cell or
 * two inside a lane the corridor already contains.
 *
 * IT IS REBUILT WHOLE, LAZILY. A structure going up or coming down marks
 * it dirty and nothing more; the next order pays for the rebuild, and a
 * build drag that touches the board fifty times pays once. A whole rebuild
 * is a flood over the map and a scan of the sector borders — a few
 * milliseconds — against the ~100ms the full-map field solve costs, and
 * unlike that one it is shared by every order on the board.
 */
export class SectorGraph {
  /** which component of its own sector each cell belongs to, globally
   *  numbered; -1 where nothing can stand */
  private readonly comp = new Int32Array(NCELLS);
  /** per portal: the two sectors, the two components, and a cell on each
   *  side (the midpoint of the run) */
  private pSecA: number[] = [];
  private pSecB: number[] = [];
  private pCompA: number[] = [];
  private pCompB: number[] = [];
  private pCellA: number[] = [];
  private pCellB: number[] = [];
  /** the portals touching each sector */
  private readonly sectorPortals: number[][] = [];
  /** component ids are handed out and never reused, so a sector rebuilt on
   *  its own cannot collide with the numbers its neighbours are holding */
  private nextComp = 0;
  /** everything is stale (a new map, a first build) */
  private allDirty = true;
  /** ...or only these sectors are (a structure landing on them) */
  private readonly dirtySectors = new Set<number>();

  constructor() {
    for (let s = 0; s < NSECT; s++) this.sectorPortals.push([]);
  }

  /**
   * The ground moved. WHERE it moved, if the caller knows: a structure
   * covers at most a couple of sectors, and rebuilding those and the
   * boundaries they touch is microseconds where rebuilding the board is
   * twenty milliseconds. A build drag is a hundred of these in a second,
   * so the difference is the whole of whether the graph can be honest
   * about a board that is being built on.
   */
  markDirty(sector?: number): void {
    if (sector === undefined) {
      this.allDirty = true;
      this.dirtySectors.clear();
    } else if (!this.allDirty) this.dirtySectors.add(sector);
  }

  get portalCount(): number {
    return this.pSecA.length;
  }

  /**
   * Rebuild whatever is stale. `walk` and `soft` are the walkers' own
   * masks: a cell is ROCK to an order when it is walkable-blocked and not
   * soft, which is terrain and the player's own buildings. The swarm's
   * buildings are soft — an order routes through them, and the body
   * presses on them and shoots when it arrives, exactly as the full-map
   * order field had it.
   */
  ensure(walk: Uint8Array, soft: Uint8Array): void {
    if (this.allDirty) {
      this.allDirty = false;
      this.dirtySectors.clear();
      this.comp.fill(-1);
      this.nextComp = 0;
      for (let s = 0; s < NSECT; s++) this.componentsOf(walk, soft, s);
      this.rebuildPortals(walk, soft, null);
      return;
    }
    if (this.dirtySectors.size === 0) return;
    const dirty = this.dirtySectors;
    for (const s of dirty) this.componentsOf(walk, soft, s);
    this.rebuildPortals(walk, soft, dirty);
    dirty.clear();
  }

  /** a cell's component, or -1 for rock */
  componentAt(cell: number): number {
    return this.comp[cell];
  }

  /**
   * Flood ONE sector's open ground into components, numbered from a
   * counter that never goes back, so a component id alone says which
   * sector it belongs to and a sector rebuilt alone cannot take a number
   * one of its neighbours is still using.
   *
   * THE FLOOD STEPS DIAGONALLY, and only where both orthogonals beside the
   * step are open — which is exactly the rule the Dijkstra walks by (no
   * cutting corners through rock) and therefore exactly what a body can
   * do. A four-way flood is the obvious thing to write here and it is
   * WRONG on this kind of ground: a noise map is full of lanes that pinch
   * to a single diagonal, and calling those two separate components splits
   * a sector the units walk straight across. It cost three routes in four
   * on a map whose open ground is provably one piece.
   */
  private componentsOf(walk: Uint8Array, soft: Uint8Array, s: number): void {
    const comp = this.comp;
    const sx = (s % SCOLS) * SECTOR, sy = ((s / SCOLS) | 0) * SECTOR;
    for (let ly = 0; ly < SECTOR; ly++)
      for (let lx = 0; lx < SECTOR; lx++) comp[(sy + ly) * COLS + sx + lx] = -1;
    const q = compQ;
    for (let ly = 0; ly < SECTOR; ly++) {
      for (let lx = 0; lx < SECTOR; lx++) {
        const seed = (sy + ly) * COLS + sx + lx;
        if (comp[seed] >= 0 || rock(walk, soft, seed)) continue;
        const id = this.nextComp++;
        comp[seed] = id;
        let head = 0, tail = 0;
        q[tail++] = seed;
        while (head < tail) {
          const ci = q[head++];
          const cx = ci % COLS, cy = (ci / COLS) | 0;
          for (let d = 0; d < 8; d++) {
            const nx = cx + D8X[d], ny = cy + D8Y[d];
            // inside this sector only: a component is a sector's own
            if (nx < sx || ny < sy || nx >= sx + SECTOR || ny >= sy + SECTOR) continue;
            const ni = ny * COLS + nx;
            if (comp[ni] >= 0 || rock(walk, soft, ni)) continue;
            if (D8X[d] !== 0 && D8Y[d] !== 0) {
              // the corner rule, asked of the whole board rather than of
              // this sector: a diagonal at a sector's own corner is still
              // a step a body can take
              if (rock(walk, soft, cy * COLS + nx) || rock(walk, soft, ny * COLS + cx)) continue;
            }
            comp[ni] = id;
            q[tail++] = ni;
          }
        }
      }
    }
  }

  /**
   * EVERY RUN OF CELLS OPEN ON BOTH SIDES OF A SECTOR BOUNDARY IS ONE DOOR.
   *
   * A run ends where the ground closes on either side, and also where the
   * COMPONENT changes on either side: a doorway that starts on one pocket
   * of a sector and finishes on another is two doorways, because a body
   * cannot walk along it from one to the other.
   *
   * The door's position is the middle of its run, taken along the boundary
   * — which is the whole reason this is written as a scan over an axis
   * rather than over cell indices. Averaging two cell INDICES lands on the
   * boundary only when the run happens to be an odd number of cells long;
   * the rest of the time the halved index falls between two rows and
   * truncates to a cell in the middle of the map, whose component belongs
   * to some unrelated sector. That silently shattered the graph into a
   * hundred and fifty pieces and failed three routes in four.
   *
   * With `dirty` given, only the boundaries touching those sectors are
   * rescanned and every other door is kept exactly as it was.
   */
  private rebuildPortals(
    walk: Uint8Array, soft: Uint8Array, dirty: ReadonlySet<number> | null,
  ): void {
    const comp = this.comp;
    const keep = (p: number): boolean =>
      dirty !== null && !dirty.has(this.pSecA[p]) && !dirty.has(this.pSecB[p]);
    const oSecA = this.pSecA, oSecB = this.pSecB, oCompA = this.pCompA;
    const oCompB = this.pCompB, oCellA = this.pCellA, oCellB = this.pCellB;
    this.pSecA = [];
    this.pSecB = [];
    this.pCompA = [];
    this.pCompB = [];
    this.pCellA = [];
    this.pCellB = [];
    for (let s = 0; s < NSECT; s++) this.sectorPortals[s].length = 0;
    const push = (
      sa: number, sb: number, ca: number, cb: number, cellA: number, cellB: number,
    ): void => {
      const p = this.pSecA.length;
      this.pSecA.push(sa);
      this.pSecB.push(sb);
      this.pCompA.push(ca);
      this.pCompB.push(cb);
      this.pCellA.push(cellA);
      this.pCellB.push(cellB);
      this.sectorPortals[sa].push(p);
      this.sectorPortals[sb].push(p);
    };
    // the doors on boundaries nothing has moved keep their cells and their
    // components: neither sector was rebuilt, so neither can have changed
    for (let p = 0; p < oSecA.length; p++)
      if (keep(p)) push(oSecA[p], oSecB[p], oCompA[p], oCompB[p], oCellA[p], oCellB[p]);
    /** one boundary: `cellA` turns a step along it into the cell on side A,
     *  and side B is one step across */
    const scan = (
      sa: number, sb: number, cellA: (k: number) => number, across: number,
    ): void => {
      let run = -1, last = -1, cA = -1, cB = -1;
      const close = (): void => {
        if (run < 0) return;
        const mid = cellA((run + last) >> 1);
        push(sa, sb, comp[mid], comp[mid + across], mid, mid + across);
        run = -1;
      };
      for (let k = 0; k < SECTOR; k++) {
        const a = cellA(k), b = a + across;
        if (rock(walk, soft, a) || rock(walk, soft, b)) {
          close();
          continue;
        }
        // a run holds while both sides stay on the components it started on
        if (run >= 0 && (comp[a] !== cA || comp[b] !== cB)) close();
        if (run < 0) {
          run = k;
          cA = comp[a];
          cB = comp[b];
        }
        last = k;
      }
      close();
    };
    const done = new Set<number>();
    const vertical = (sx: number, sy: number): void => {
      if (sx < 0 || sx >= SCOLS - 1) return;
      const id = (sy * SCOLS + sx) * 2;
      if (done.has(id)) return;
      done.add(id);
      const x = sx * SECTOR + SECTOR - 1, y0 = sy * SECTOR;
      scan(sy * SCOLS + sx, sy * SCOLS + sx + 1, (k) => (y0 + k) * COLS + x, 1);
    };
    const horizontal = (sx: number, sy: number): void => {
      if (sy < 0 || sy >= SROWS - 1) return;
      const id = (sy * SCOLS + sx) * 2 + 1;
      if (done.has(id)) return;
      done.add(id);
      const y = sy * SECTOR + SECTOR - 1, x0 = sx * SECTOR;
      scan(sy * SCOLS + sx, (sy + 1) * SCOLS + sx, (k) => y * COLS + x0 + k, COLS);
    };
    if (dirty === null) {
      for (let sy = 0; sy < SROWS; sy++)
        for (let sx = 0; sx < SCOLS; sx++) {
          vertical(sx, sy);
          horizontal(sx, sy);
        }
      return;
    }
    // only the four boundaries of each sector that moved
    for (const s of dirty) {
      const sx = s % SCOLS, sy = (s / SCOLS) | 0;
      vertical(sx, sy);
      vertical(sx - 1, sy);
      horizontal(sx, sy);
      horizontal(sx, sy - 1);
    }
  }

  /**
   * A* OVER THE DOORS, from a cell to a cell. `out` comes back holding the
   * sectors the route passes through, in order, and the call returns false
   * when there is no route at all — the two cells are on ground that does
   * not join up.
   *
   * The search is over portals, so its size is the number of doorways on
   * the board (a few thousand) rather than the number of cells (a quarter
   * of a million), and a route across the whole map is tens of
   * microseconds rather than the ~100ms a full-map Dijkstra costs.
   */
  route(fromCell: number, toCell: number, out: number[]): boolean {
    out.length = 0;
    const comp = this.comp;
    const cFrom = comp[fromCell], cTo = comp[toCell];
    if (cFrom < 0 || cTo < 0) return false;
    const sFrom = sectorOf(fromCell), sTo = sectorOf(toCell);
    if (cFrom === cTo) {
      // same component of the same sector: the corridor is that one tile
      out.push(sFrom);
      return true;
    }
    const n = this.pSecA.length;
    if (n === 0) return false;
    const g = new Float64Array(n).fill(Infinity);
    const from = new Int32Array(n).fill(-1);
    const done = new Uint8Array(n);
    const tx = (toCell % COLS) + 0.5, ty = ((toCell / COLS) | 0) + 0.5;
    const h = (p: number): number => {
      // the closer of the door's two sides to the goal
      const a = this.pCellA[p], b = this.pCellB[p];
      const ax = (a % COLS) - tx, ay = ((a / COLS) | 0) - ty;
      const bx = (b % COLS) - tx, by = ((b / COLS) | 0) - ty;
      return Math.min(Math.sqrt(ax * ax + ay * ay), Math.sqrt(bx * bx + by * by));
    };
    /** the side of portal p that lies in sector s, as [cell, comp] */
    const sideOf = (p: number, s: number): number =>
      this.pSecA[p] === s ? this.pCellA[p] : this.pCellB[p];
    const compOf = (p: number, s: number): number =>
      this.pSecA[p] === s ? this.pCompA[p] : this.pCompB[p];
    const step = (a: number, b: number): number => {
      const ax = a % COLS, ay = (a / COLS) | 0;
      const bx = b % COLS, by = (b / COLS) | 0;
      const dx = ax - bx, dy = ay - by;
      return Math.sqrt(dx * dx + dy * dy);
    };
    hN = 0;
    let best = -1;
    for (const p of this.sectorPortals[sFrom]) {
      if (compOf(p, sFrom) !== cFrom) continue;
      g[p] = step(fromCell, sideOf(p, sFrom));
      hPush(g[p] + h(p), p);
    }
    while (hN > 0) {
      const p = hPop();
      if (done[p]) continue;
      done[p] = 1;
      // a door with a side on the goal's own ground ends the search
      if (
        (this.pSecA[p] === sTo && this.pCompA[p] === cTo) ||
        (this.pSecB[p] === sTo && this.pCompB[p] === cTo)
      ) {
        best = p;
        break;
      }
      for (const s of [this.pSecA[p], this.pSecB[p]]) {
        const cs = compOf(p, s), here = sideOf(p, s);
        for (const q of this.sectorPortals[s]) {
          if (q === p || done[q] || compOf(q, s) !== cs) continue;
          const nd = g[p] + step(here, sideOf(q, s));
          if (nd < g[q]) {
            g[q] = nd;
            from[q] = p;
            hPush(nd + h(q), q);
          }
        }
      }
    }
    if (best < 0) return false;
    // walk the chain back, collecting every sector either side of every
    // door on it — that set IS the corridor
    const seen = new Set<number>();
    seen.add(sTo);
    for (let p = best; p >= 0; p = from[p]) {
      seen.add(this.pSecA[p]);
      seen.add(this.pSecB[p]);
    }
    seen.add(sFrom);
    for (const s of seen) out.push(s);
    return true;
  }
}

/** rock to an order: blocked and not one of the swarm's buildings */
const rock = (walk: Uint8Array, soft: Uint8Array, cell: number): boolean =>
  walk[cell] === 1 && soft[cell] === 0;

/**
 * ONE ORDER'S FIELD, over the sectors its route crosses and nowhere else.
 *
 * The tiles are the corridor the SectorGraph came back with, widened by a
 * ring of neighbouring sectors (the skirt) so that a body shoved sideways
 * by the crowd still has a heading under it. Inside them the solve is the
 * full-map field's own, pass for pass — clearance, cost with the verge
 * charge, an 8-way Dijkstra from the goal, the fast-sweeping eikonal
 * refinement, and an upwind gradient — so a body walking a corridor moves
 * exactly as it did when the field covered the map.
 *
 * The heading is kept as a PAIR OF BYTES a cell. A direction is a unit
 * vector, and a hundredth of a degree of it was never worth four bytes an
 * axis: at 1/127 the quantization is a fortieth of what the chassis turn
 * rate rounds away in a single tick.
 */
export class Corridor {
  /** the cell the order points at, -1 for an empty corridor */
  goal = -1;
  /** sector -> index into `dirs`, or -1 for ground this corridor does not
   *  cover. A thousand ints, so the lookup is one read */
  private readonly tileOf = new Int32Array(NSECT);
  /** two signed bytes a cell, tile by tile */
  private dirs = new Int8Array(0);
  private nTiles = 0;

  constructor() {
    this.tileOf.fill(-1);
  }

  /** what this order costs to hold, in bytes of heading */
  get bytes(): number {
    return this.dirs.length + this.tileOf.byteLength;
  }

  get tiles(): number {
    return this.nTiles;
  }

  /** does this corridor have anything to say at a cell? — what a body
   *  joining an order already in flight (Sim.sendUnitTo) has to ask before
   *  it takes one, since a route built for somebody else's starting place
   *  need not pass anywhere near its own */
  covers(cell: number): boolean {
    return this.tileOf[sectorOf(cell)] >= 0;
  }

  reset(): void {
    this.goal = -1;
    this.nTiles = 0;
    this.tileOf.fill(-1);
  }

  /**
   * Route from every distinct starting sector to the goal, take the union
   * of the corridors, and solve the field inside it.
   *
   * Several starts because a selection can be spread over the map, and one
   * body's route is not another's: a group split either side of a massif
   * needs both ways round in the corridor or half of it has no heading.
   * They cost one A* each over a graph of doorways, which is nothing.
   */
  build(
    graph: SectorGraph,
    walk: Uint8Array,
    soft: Uint8Array,
    goalCell: number,
    fromCells: readonly number[],
  ): boolean {
    this.reset();
    if (graph.componentAt(goalCell) < 0) return false;
    const sectors = new Set<number>();
    const path: number[] = [];
    for (const c of fromCells) {
      if (graph.route(c, goalCell, path)) for (const s of path) sectors.add(s);
    }
    if (sectors.size === 0) return false;
    // NO SKIRT ROUND IT. A ring of margin sectors is the obvious way to
    // give a body shoved off its line somewhere to read a heading from,
    // and it costs THREE TILES OF MARGIN FOR EVERY TILE OF ROUTE — a
    // diagonal chain of sectors has neighbours on every side of every
    // link, and the ring tripled both the memory and the solve for ground
    // nobody walks on. It is not needed: consecutive sectors of a route
    // always share a whole EDGE (both sides of every portal are in it), so
    // the corridor is a band sixteen cells wide the entire way, the verge
    // charge below leans a body back toward the middle of it, and the odd
    // body the crowd does push over the rim reaches a few cells for a
    // heading in sample() instead of carrying tiles for the case.
    const list = [...sectors].sort((a, b) => a - b);
    this.nTiles = list.length;
    this.dirs = new Int8Array(this.nTiles * TILE * 2);
    for (let t = 0; t < list.length; t++) this.tileOf[list[t]] = t * TILE * 2;
    this.goal = goalCell;
    this.solve(walk, soft, list, goalCell);
    return true;
  }

  /**
   * The field itself, over the corridor's cells. Everything outside the
   * corridor is treated as rock by every pass: a cell has no neighbours it
   * cannot see, the clearance transform charges the corridor's own rim, and
   * the Dijkstra never leaves. That last is what bounds the work — a solve
   * is the corridor, not the map.
   *
   * ALL OF IT RUNS OFF TWO FLAT LISTS of the corridor's cells: one in
   * raster order, one with every row reversed. `list` arrives sorted by
   * sector, so the sectors of one sector-row are already adjacent in it and
   * both lists come out of a single walk — no sort, which on twenty
   * thousand cells cost more than the Dijkstra did. The four raster orders
   * the eikonal sweep wants are then those two lists read forwards and
   * backwards.
   *
   * Every pass reads `stamp` for "is this cell in the corridor" and `blk`
   * for "is it rock", both plain array reads on the shared scratch. They
   * were a pair of helper calls with the masks passed in, which is the
   * same test written more nicely and about three times the cost over the
   * eight passes that ask it.
   */
  private solve(
    walk: Uint8Array, soft: Uint8Array, list: readonly number[], goalCell: number,
  ): void {
    const run = ++runId;

    // ---- THE CELLS, in raster order and in reversed-row order
    rasterFit(list.length * TILE);
    rasterN = 0;
    {
      let i = 0;
      while (i < list.length) {
        const sr = (list[i] / SCOLS) | 0;
        let j = i;
        while (j < list.length && ((list[j] / SCOLS) | 0) === sr) j++;
        const wide = (j - i) * SECTOR; // cells across one row of this band
        for (let ly = 0; ly < SECTOR; ly++) {
          const y = sr * SECTOR + ly;
          const row = rasterN;
          for (let t = i; t < j; t++) {
            const base = y * COLS + (list[t] % SCOLS) * SECTOR;
            for (let lx = 0; lx < SECTOR; lx++) {
              const ci = base + lx;
              rasterA[rasterN] = ci;
              rasterB[row + wide - 1 - (rasterN - row)] = ci;
              rasterN++;
              stamp[ci] = run;
              blk[ci] = walk[ci] === 1 && soft[ci] === 0 ? 1 : 0;
            }
          }
        }
        i = j;
      }
    }

    // ---- CLEARANCE, two chamfer passes: how far a cell is from rock, in
    // cells, with anything off the corridor counting as rock
    for (let i = 0; i < rasterN; i++) {
      const ci = rasterA[i];
      clear[ci] = blk[ci] === 1 ? 0 : INF;
    }
    for (let i = 0; i < rasterN; i++) {
      const ci = rasterA[i];
      if (clear[ci] === 0) continue;
      const x = ci % COLS, y = (ci / COLS) | 0;
      let v = clear[ci], n = 0, c = 0;
      if (x > 0) { n = ci - 1; c = stamp[n] === run ? clear[n] + 1 : 1; if (c < v) v = c; } else if (1 < v) v = 1;
      if (y > 0) { n = ci - COLS; c = stamp[n] === run ? clear[n] + 1 : 1; if (c < v) v = c; } else if (1 < v) v = 1;
      if (x > 0 && y > 0) { n = ci - COLS - 1; c = stamp[n] === run ? clear[n] + SQRT2 : SQRT2; if (c < v) v = c; }
      if (x < COLS - 1 && y > 0) { n = ci - COLS + 1; c = stamp[n] === run ? clear[n] + SQRT2 : SQRT2; if (c < v) v = c; }
      clear[ci] = v;
    }
    for (let i = rasterN - 1; i >= 0; i--) {
      const ci = rasterA[i];
      if (clear[ci] === 0) continue;
      const x = ci % COLS, y = (ci / COLS) | 0;
      let v = clear[ci], n = 0, c = 0;
      if (x < COLS - 1) { n = ci + 1; c = stamp[n] === run ? clear[n] + 1 : 1; if (c < v) v = c; } else if (1 < v) v = 1;
      if (y < ROWS - 1) { n = ci + COLS; c = stamp[n] === run ? clear[n] + 1 : 1; if (c < v) v = c; } else if (1 < v) v = 1;
      if (x < COLS - 1 && y < ROWS - 1) { n = ci + COLS + 1; c = stamp[n] === run ? clear[n] + SQRT2 : SQRT2; if (c < v) v = c; }
      if (x > 0 && y < ROWS - 1) { n = ci + COLS - 1; c = stamp[n] === run ? clear[n] + SQRT2 : SQRT2; if (c < v) v = c; }
      clear[ci] = v;
    }

    // ---- COST: 1, plus the single-file charge, plus the verge charge —
    // the full-map field's own formula (FlowField.stepCost)
    for (let i = 0; i < rasterN; i++) {
      const ci = rasterA[i];
      dist[ci] = INF;
      if (soft[ci] === 1) {
        cost[ci] = 1 + STRUCTURE_COST;
        continue;
      }
      cost[ci] = 1;
      if (blk[ci] === 1) continue;
      const x = ci % COLS, y = (ci / COLS) | 0;
      const bL = x <= 0 || stamp[ci - 1] !== run || blk[ci - 1] === 1;
      const bR = x >= COLS - 1 || stamp[ci + 1] !== run || blk[ci + 1] === 1;
      const bU = y <= 0 || stamp[ci - COLS] !== run || blk[ci - COLS] === 1;
      const bD = y >= ROWS - 1 || stamp[ci + COLS] !== run || blk[ci + COLS] === 1;
      if ((bL && bR) || (bU && bD) || ((bL || bR) && (bU || bD))) cost[ci] = 1 + NARROW_COST;
      const t = (EDGE_REACH - clear[ci]) / (EDGE_REACH - 1);
      if (t > 0) cost[ci] += EDGE_COST * Math.min(1, t) * Math.min(1, t);
    }

    // ---- DIJKSTRA from the goal, 8-way, no cutting corners through rock
    hN = 0;
    dist[goalCell] = 0;
    hPush(0, goalCell);
    while (hN > 0) {
      const ci = hPop();
      const here = dist[ci];
      if (popKey > here + 1e-6) continue;
      const x = ci % COLS, y = (ci / COLS) | 0;
      for (let d = 0; d < 8; d++) {
        const dx = D8X[d], dy = D8Y[d];
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
        const ni = ny * COLS + nx;
        if (stamp[ni] !== run || blk[ni] === 1) continue;
        if (dx !== 0 && dy !== 0) {
          const a = y * COLS + nx, b = ny * COLS + x;
          if (stamp[a] !== run || blk[a] === 1 || stamp[b] !== run || blk[b] === 1) continue;
        }
        const nd = here + D8C[d] + cost[ni] - 1;
        if (nd < dist[ni] - 1e-6) {
          dist[ni] = nd;
          hPush(nd, ni);
        }
      }
    }

    // ---- THE EIKONAL SWEEP, the pass that keeps a crowd off the eight
    // compass headings an 8-way field would otherwise collapse onto. Four
    // raster orders, twice: each list read forwards and backwards gives
    // (x+,y+), (x-,y-), (x-,y+) and (x+,y-)
    for (let round = 0; round < 2; round++) {
      for (let order = 0; order < 4; order++) {
        const src = order < 2 ? rasterA : rasterB;
        const back = order === 1 || order === 3;
        for (let k = 0; k < rasterN; k++) {
          const ci = src[back ? rasterN - 1 - k : k];
          if (ci === goalCell || blk[ci] === 1) continue;
          const x = ci % COLS, y = (ci / COLS) | 0;
          let a = INF, b = INF, n = 0;
          if (x > 0) { n = ci - 1; if (stamp[n] === run && blk[n] === 0 && dist[n] < a) a = dist[n]; }
          if (x < COLS - 1) { n = ci + 1; if (stamp[n] === run && blk[n] === 0 && dist[n] < a) a = dist[n]; }
          if (y > 0) { n = ci - COLS; if (stamp[n] === run && blk[n] === 0 && dist[n] < b) b = dist[n]; }
          if (y < ROWS - 1) { n = ci + COLS; if (stamp[n] === run && blk[n] === 0 && dist[n] < b) b = dist[n]; }
          if (a >= INF && b >= INF) continue;
          const f = cost[ci];
          const d = a - b;
          const t =
            Math.abs(d) >= f
              ? Math.min(a, b) + f
              : (a + b + Math.sqrt(2 * f * f - d * d)) * 0.5;
          if (t < dist[ci]) dist[ci] = t;
        }
      }
    }

    // ---- THE HEADING, upwind, a byte an axis
    const dirs = this.dirs;
    for (let i = 0; i < rasterN; i++) {
      const ci = rasterA[i];
      const at = this.tileOf[sectorOf(ci)] + slotOf(ci);
      dirs[at] = 0;
      dirs[at + 1] = 0;
      const d = dist[ci];
      if (blk[ci] === 1 || ci === goalCell || d >= INF) continue;
      const x = ci % COLS, y = (ci / COLS) | 0;
      let n = 0, xm = INF, xp = INF, ym = INF, yp = INF;
      if (x > 0) { n = ci - 1; if (stamp[n] === run && blk[n] === 0) xm = dist[n]; }
      if (x < COLS - 1) { n = ci + 1; if (stamp[n] === run && blk[n] === 0) xp = dist[n]; }
      if (y > 0) { n = ci - COLS; if (stamp[n] === run && blk[n] === 0) ym = dist[n]; }
      if (y < ROWS - 1) { n = ci + COLS; if (stamp[n] === run && blk[n] === 0) yp = dist[n]; }
      let bx = 0, by = 0;
      if (xm < xp) { if (xm < d) bx = xm - d; } else if (xp < d) bx = d - xp;
      if (ym < yp) { if (ym < d) by = ym - d; } else if (yp < d) by = d - yp;
      let len = Math.sqrt(bx * bx + by * by);
      if (len < 1e-6) {
        // the descent from here is diagonal: take the steepest 8-way step,
        // which the Dijkstra guarantees exists
        let bd = d;
        for (let k = 0; k < 8; k++) {
          const nx = x + D8X[k], ny = y + D8Y[k];
          if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
          const ni = ny * COLS + nx;
          if (stamp[ni] !== run || blk[ni] === 1) continue;
          if (dist[ni] < bd) { bd = dist[ni]; bx = D8X[k]; by = D8Y[k]; }
        }
        len = Math.sqrt(bx * bx + by * by);
        if (len < 1e-6) continue;
      }
      dirs[at] = Math.round((bx / len) * 127);
      dirs[at + 1] = Math.round((by / len) * 127);
    }
  }

  /**
   * The heading at a world position, bilinear over the four cells around
   * it exactly as the full-map field samples — false when this order has
   * nothing to say here, which is a body outside its own corridor and the
   * caller's cue to walk the straight line at the point instead.
   */
  sample(px: number, py: number, out: Vec2): boolean {
    const gx = px / CELL - 0.5, gy = py / CELL - 0.5;
    const x0 = Math.floor(gx), y0 = Math.floor(gy);
    const tx = gx - x0, ty = gy - y0;
    let sx = 0, sy = 0;
    for (let j = 0; j <= 1; j++) {
      for (let i = 0; i <= 1; i++) {
        const cx = clamp(x0 + i, 0, COLS - 1), cy = clamp(y0 + j, 0, ROWS - 1);
        const ci = cy * COLS + cx;
        const base = this.tileOf[sectorOf(ci)];
        if (base < 0) continue;
        const at = base + slotOf(ci);
        const w = (i ? tx : 1 - tx) * (j ? ty : 1 - ty);
        sx += this.dirs[at] * w;
        sy += this.dirs[at + 1] * w;
      }
    }
    const len = Math.sqrt(sx * sx + sy * sy);
    if (len < 4) {
      // NOTHING WORTH A HEADING IN THE FOUR AROUND IT — standing on the
      // goal, on rock, or a cell or two outside the corridor. Reach for
      // the nearest cell that does have one, out to REACH cells, before
      // giving up: the corridor stops at a sector edge, and a body the
      // crowd has pushed over that edge is a step from a heading rather
      // than lost. Carrying another ring of tiles to cover the same case
      // would cost a hundred times as much as this search.
      const cx = clamp((px / CELL) | 0, 0, COLS - 1);
      const cy = clamp((py / CELL) | 0, 0, ROWS - 1);
      for (let r = 0; r <= REACH; r++) {
        for (let dy = -r; dy <= r; dy++)
          for (let dx = -r; dx <= r; dx++) {
            if (r > 0 && Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
            const nx = cx + dx, ny = cy + dy;
            if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
            const base = this.tileOf[sectorOf(ny * COLS + nx)];
            if (base < 0) continue;
            const at = base + slotOf(ny * COLS + nx);
            const hx = this.dirs[at], hy = this.dirs[at + 1];
            if (hx === 0 && hy === 0) continue;
            const l = Math.sqrt(hx * hx + hy * hy);
            out.x = hx / l;
            out.y = hy / l;
            return true;
          }
      }
      return false;
    }
    out.x = sx / len;
    out.y = sy / len;
    return true;
  }
}

/** how far sample() will reach for a heading when the cell under a body
 *  has none of its own, in cells */
const REACH = 4;

/** where a cell's two heading bytes sit inside its tile */
const slotOf = (cell: number): number =>
  ((((cell / COLS) | 0) % SECTOR) * SECTOR + ((cell % COLS) % SECTOR)) * 2;

const D8X = [1, -1, 0, 0, 1, 1, -1, -1];
const D8Y = [0, 0, 1, -1, 1, -1, 1, -1];
const D8C = [1, 1, 1, 1, SQRT2, SQRT2, SQRT2, SQRT2];
