/**
 * THE CROWD SHOVE, AS A PURE KERNEL — so it can run on the sim's thread or
 * on one of its own (phys.worker.ts) over the same shared arrays.
 *
 * Mindustry's PhysicsProcess.PhysicsWorld.update(), ported 1:1: every unit
 * is a circle (radius PHYS_R * urad) with mass = area; overlapping
 * same-layer pairs are pushed apart along their center line by the full
 * overlap softened by PHYS_SCL, split inversely by mass — an ironhide2
 * plows through runts, runts barely rock the ironhide2. Each unordered pair
 * resolves exactly once per tick, at its first member's turn (the
 * original's `collided` flag == our ascending-index guard), and later pairs
 * see the already-pushed scratch positions, so a pile relaxes a little more
 * per tick than independent pushes would. Exactly stacked units part in a
 * random direction. Ground and air are separate layers that pass through
 * each other freely.
 *
 * One deliberate departure from the original: where a unit has room to
 * step aside, the shove is re-aimed across its direction of travel (see
 * PUSH_LONG / PUSH_SIDE). Mindustry resolves along the centre line, which
 * for a crowd all walking one heading means every overlap lengthens the
 * column — the classic conga line. Same magnitude, different axis.
 *
 * WHAT COMES OUT is a DISPLACEMENT per body (`shx`, `shy`: where the shove
 * moved it minus where it started) and the squeeze scratch (the deepest
 * same-kind partner this tick, by index and by uid), never a position: a
 * displacement computed on another thread against last tick's positions
 * is still a displacement, and Sim.updateUnits adds it on top of the
 * body's own drive exactly as it did when the positions were its own.
 *
 * NOTHING HERE TOUCHES A Sim. Every input is an array or a table, so the
 * worker can run it from the shared memory it was handed and the tables
 * it is sent (hitbox.ts is loaded from documents, and the admin editor
 * can bend it at runtime — so the tables cross by value, refreshed every
 * tick by physport.ts).
 */
import { CELL, COLS, HC, HCOLS, HN, HROWS, MERGE_SQUEEZE, ROWS } from "./constants";

// Note the physics circle is BIGGER than the hitbox — crowds keep a
// sliver of daylight between sprites, exactly like the original
export const PHYS_R = 1.2;
// PhysicsWorld.scl, "how much to soften movement by": each overlapping
// pair moves only 1/1.25 of the way apart per tick, split by mass
export const PHYS_SCL = 1.25;
export const PUSH_LONG = 0.45;
export const PUSH_SIDE = 1.1;
// ...but only where a unit has somewhere to step aside: this much
// clearance (FlowField.clear, in cells) or the shove stays as Mindustry
// wrote it, so a 1-wide slot still resolves a rear-ender by backing off
export const SPREAD_CLEAR = 1.7;

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

/** the per-kind shape tables the kernel reads (hitbox.ts, by value) */
export interface PhysTables {
  readonly HB_A: Float32Array;
  readonly HB_B: Float32Array;
  readonly HB_OUTER: Float32Array;
  readonly HB_OVAL: Uint8Array;
  /** Sim.kindSpanDyn / kindSpanSDyn: the live broad-phase reach per kind */
  readonly spanDyn: Int32Array;
  readonly spanSDyn: Int32Array;
}

/** what the kernel reads of the bodies — every one a Sim array, shared */
export interface PhysIn {
  readonly upx: Float32Array;
  readonly upy: Float32Array;
  readonly uvx: Float32Array;
  readonly uvy: Float32Array;
  readonly urad: Float32Array;
  readonly urot: Float32Array;
  readonly ufly: Uint8Array;
  readonly unav: Uint8Array;
  readonly uheavy: Uint8Array;
  /** Sim.ufix: a body whose position is somebody else's promise — it takes
   *  no share of a pair's separation and hands the whole of it over */
  readonly ufix: Uint8Array;
  readonly ukind: Uint8Array;
  readonly uid: Int32Array;
  /** the walkers' clearance map and the naval tanks' (FlowField.clearShared) */
  readonly clear: Float32Array;
  readonly wclear: Float32Array;
  /** the spatial hash the caller built (buildHash) */
  readonly bStart: Int32Array;
  readonly bUnits: Int32Array;
}

/** the kernel's scratch — private to whichever thread runs it */
export interface PhysScratch {
  readonly phx: Float32Array;
  readonly phy: Float32Array;
  readonly uhx: Float32Array;
  readonly uhy: Float32Array;
}

/** what the kernel produces */
export interface PhysOut {
  readonly shx: Float32Array;
  readonly shy: Float32Array;
  readonly sqzJ: Int32Array;
  readonly sqzU: Int32Array;
  readonly sqzD: Float32Array;
}

export const hashCellOf = (x: number, y: number): number =>
  clamp((y / HC) | 0, 0, HROWS - 1) * HCOLS + clamp((x / HC) | 0, 0, HCOLS - 1);

/** the counting sort that lays every body out by hash bucket (Sim.buildHash) */
export function buildHash(
  upx: Float32Array,
  upy: Float32Array,
  n: number,
  bStart: Int32Array,
  bCount: Int32Array,
  bUnits: Int32Array,
): void {
  bCount.fill(0);
  for (let i = 0; i < n; i++) bCount[hashCellOf(upx[i], upy[i])]++;
  let s = 0;
  for (let c = 0; c < HN; c++) {
    bStart[c] = s;
    s += bCount[c];
  }
  bStart[HN] = s;
  bCount.fill(0);
  for (let i = 0; i < n; i++) {
    const c = hashCellOf(upx[i], upy[i]);
    bUnits[bStart[c] + bCount[c]++] = i;
  }
}

/** Sim.hitR: how far body `i` reaches along `(dx, dy)` — its radius, or the ellipse's polar radius */
function hitR(
  P: PhysIn,
  T: PhysTables,
  i: number,
  dx: number,
  dy: number,
  d2: number,
): number {
  const k = P.ukind[i];
  if (T.HB_OVAL[k] === 0) return P.urad[i];
  const a = T.HB_A[k], b = T.HB_B[k];
  if (d2 <= 1e-8) return a < b ? a : b;
  const inv = 1 / Math.sqrt(d2);
  const rot = P.urot[i];
  const c = Math.cos(rot), sn = Math.sin(rot);
  const lx = ((dx * c + dy * sn) * inv) / a;
  const ly = ((dy * c - dx * sn) * inv) / b;
  return 1 / Math.sqrt(lx * lx + ly * ly);
}

/** one tick of the crowd shove over bodies `0..n-1` */
export function runPhysics(P: PhysIn, T: PhysTables, S: PhysScratch, O: PhysOut, n: number): void {
  const { upx, upy, urad, ufly, unav, uvx, uvy, uid, bStart, bUnits, clear, wclear } = P;
  const { phx, phy, uhx, uhy } = S;
  const { shx, shy, sqzJ, sqzU, sqzD } = O;
  const { HB_OUTER, HB_OVAL, spanDyn, spanSDyn } = T;
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
        clamp((upy[i] / CELL) | 0, 0, ROWS - 1) * COLS + clamp((upx[i] / CELL) | 0, 0, COLS - 1)
      ] >= SPREAD_CLEAR;
    uhx[i] = room ? vx / vl : 0;
    uhy[i] = room ? vy / vl : 0;
    // the squeeze scratch is this tick's alone (Sim.mergeSqueezed)
    sqzJ[i] = -1;
    sqzU[i] = -1;
    sqzD[i] = 0;
  }
  const { ukind, uheavy, ufix } = P;
  for (let i = 0; i < n; i++) {
    const fly = ufly[i];
    // the size split (see HB_HEAVY): a heavy owns EVERY pair it is part
    // of and scans the wide window for them; a small unit scans only the
    // small-partner window and skips heavy candidates outright. Each
    // unordered pair still resolves exactly once, and the small window
    // is what keeps an ironhide1 swarm's broad phase priced for runts
    // while an ironhide5 stands on the same field
    const iHeavy = uheavy[i];
    const ki = ukind[i];
    // the pair's cheap reject rides the OUTER radii, which is the widest
    // either body can be however it is turned; a shaped pair that gets
    // past it is measured again against its real axes below
    const oi = HB_OUTER[ki] * PHYS_R;
    const ovalI = HB_OVAL[ki];
    const mi = urad[i] * urad[i]; // hitSize^2 * pi — the pi cancels in the ratio
    // the unit's own scratch position rides in locals through the scan —
    // candidates read it every test, and it only moves when a pair
    // actually resolves — and lands back in the array afterwards
    let pxi = phx[i], pyi = phy[i];
    const hix = clamp((pxi / HC) | 0, 0, HCOLS - 1);
    const hiy = clamp((pyi / HC) | 0, 0, HROWS - 1);
    const sp = iHeavy ? spanDyn[ki] : spanSDyn[ki];
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
        const kj = ukind[j];
        let dx = pxi - phx[j], dy = pyi - phy[j];
        const d2 = dx * dx + dy * dy;
        const outer = oi + HB_OUTER[kj] * PHYS_R;
        if (d2 >= outer * outer) continue;
        // ...and where either body is shaped, the touching distance is
        // each one's radius ALONG THE CENTRE LINE (hitR). A round pair's
        // outer radii ARE its radii, so it never pays for this
        const rs =
          ovalI === 0 && HB_OVAL[kj] === 0
            ? outer
            : (hitR(P, T, i, -dx, -dy, d2) + hitR(P, T, j, dx, dy, d2)) * PHYS_R;
        if (d2 >= rs * rs) continue;
        const dst = Math.sqrt(d2);
        // THE SQUEEZE (Sim.mergeSqueezed): a same-kind pair crushed this
        // deep is noted on both bodies — the deepest such partner each
        // has this tick, by index and by uid
        if (dst < rs * MERGE_SQUEEZE && ukind[j] === ukind[i]) {
          const depth = rs - dst;
          if (depth > sqzD[i]) {
            sqzD[i] = depth;
            sqzJ[i] = j;
            sqzU[i] = uid[j];
          }
          if (depth > sqzD[j]) {
            sqzD[j] = depth;
            sqzJ[j] = i;
            sqzU[j] = uid[i];
          }
        }
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
        // ...and where one of the pair is FIXED (ufix) the split by mass
        // is off: the movable one takes the whole overlap and the fixed
        // one does not budge, so a Borer on its road and a railgun on its
        // mark plough the crowd aside instead of trading shoves with it
        const fi = ufix[i], fj = ufix[j];
        if (fi !== 0 || fj !== 0) {
          if (fi === 0) {
            const push = (rs - dst) / PHYS_SCL;
            pxi += dx * push;
            pyi += dy * push;
          } else if (fj === 0) {
            const push = (rs - dst) / PHYS_SCL;
            phx[j] -= dx * push;
            phy[j] -= dy * push;
          }
          continue;
        }
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
  // the shove as a displacement: where the relaxation left each body
  // minus where it started (see the header)
  for (let i = 0; i < n; i++) {
    shx[i] = phx[i] - upx[i];
    shy[i] = phy[i] - upy[i];
  }
}
