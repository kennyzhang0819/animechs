#!/usr/bin/env node
/**
 * THE ATLAS LAYOUT, CHECKED FROM THE COMMAND LINE — the same disjointness
 * rule packAtlas asserts in the browser, run without a browser, plus a
 * map of what is free. Run it before and after touching game/atlas.ts:
 *
 *   npm run atlas:check            # pass/fail on overlaps, then the free rectangles
 *   npm run atlas:check -- --map   # also an ASCII occupancy map, one char per 32px
 *
 * WHY THIS EXISTS. The sheet is hand-packed: every cell is a pair of pixel
 * coordinates typed into atlas.ts, and nothing but the registry filled by
 * uv() knows which rectangles are taken. A session that parks a new cell
 * "on the free block right of the environment band" without asking the
 * registry lands on the large walls and the edge fades — which is exactly
 * what happened once, and which the game only shows as blotches on the
 * hills and fringes on the terrain borders. The rule for new cells:
 *
 *   1. run this, and take a rectangle from the FREE list it prints;
 *   2. declare the cell through uv() (or e2(), which is uv()), never by
 *      dividing pixel coordinates by ATLAS_W/H yourself — a rect that
 *      never passed through uv() is invisible to every check here;
 *   3. run this again: it must still pass, and the rectangle you took
 *      must be gone from the FREE list.
 *
 * Loads game/atlas.ts straight from source (node's type stripping, with
 * scripts/ts-resolve.mjs supplying the extensions the bundler forgives).
 */
import { pathToFileURL } from "node:url";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const A = await import(pathToFileURL(path.join(ROOT, "game", "atlas.ts")).href);
const { w: W, h: H } = A.ATLAS_SIZE;
const cells = A.atlasCells();
const wantMap = process.argv.includes("--map");
const minArg = process.argv.indexOf("--min");
const minFree = minArg >= 0 ? +process.argv[minArg + 1] : 64;

// ---- 1. the invariant ----
try {
  A.assertCellsDisjoint();
  console.log(`ok: ${cells.length} cells registered, none overlap (${W}x${H})`);
} catch (e) {
  console.error(String(e && e.message ? e.message : e));
  process.exitCode = 1;
}

// ---- 2. occupancy, at 1px, then the maximal free rectangles ----
// A boolean grid is 8M entries — cheap. Free space is reported as the
// maximal empty rectangles at least `minFree` on a side, largest first,
// so a new cell can be taken off the top of the list.
const grid = new Uint8Array(W * H);
for (const c of cells)
  for (let y = c.y; y < c.y + c.h; y++) grid.fill(1, y * W + c.x, y * W + c.x + c.w);

// coarse the grid to 32px tiles for the search (every cell is 32-aligned
// or larger; a stray non-aligned cell just marks its whole tile taken)
const T = 32, GW = W / T, GH = H / T;
const cg = new Uint8Array(GW * GH);
for (let gy = 0; gy < GH; gy++)
  for (let gx = 0; gx < GW; gx++) {
    let taken = 0;
    for (let y = gy * T; y < gy * T + T && !taken; y++)
      for (let x = gx * T; x < gx * T + T; x++) if (grid[y * W + x]) { taken = 1; break; }
    cg[gy * GW + gx] = taken;
  }

// maximal rectangles: for every top-left, grow the widest-then-tallest
// empty box; keep those not contained in another
const rects = [];
for (let gy = 0; gy < GH; gy++)
  for (let gx = 0; gx < GW; gx++) {
    if (cg[gy * GW + gx]) continue;
    if (gx > 0 && !cg[gy * GW + gx - 1] && gy > 0 && !cg[(gy - 1) * GW + gx]) continue; // not a corner
    let maxW = 0;
    while (gx + maxW < GW && !cg[gy * GW + gx + maxW]) maxW++;
    let w = maxW;
    for (let h = 1; gy + h <= GH; h++) {
      let ww = 0;
      while (ww < w && !cg[(gy + h - 1) * GW + gx + ww]) ww++;
      w = ww;
      if (w === 0) break;
      rects.push({ x: gx * T, y: gy * T, w: w * T, h: h * T });
    }
  }
const contains = (a, b) => a.x <= b.x && a.y <= b.y && a.x + a.w >= b.x + b.w && a.y + a.h >= b.y + b.h;
const free = rects
  .filter((r) => r.w >= minFree && r.h >= minFree)
  .filter((r, i, all) => !all.some((o, j) => j !== i && (o.w * o.h > r.w * r.h || (o.w * o.h === r.w * r.h && j < i)) && contains(o, r)))
  .sort((a, b) => b.w * b.h - a.w * a.h);

let takenPx = 0;
for (let i = 0; i < grid.length; i++) takenPx += grid[i];
console.log(`taken: ${(100 * takenPx / grid.length).toFixed(1)}% of the sheet`);
console.log(`\nFREE (maximal empty rectangles, ${minFree}px+ on a side, largest first; x,y w x h):`);
for (const r of free.slice(0, 40)) console.log(`  ${String(r.x).padStart(4)},${String(r.y).padStart(4)}  ${String(r.w).padStart(4)} x ${String(r.h).padStart(4)}`);
if (free.length > 40) console.log(`  ... and ${free.length - 40} smaller`);

if (wantMap) {
  console.log(`\nMAP (one char per ${T}px; # taken, . free; columns every 256px):`);
  let header = "      ";
  for (let gx = 0; gx < GW; gx++) header += gx % 8 === 0 ? "|" : " ";
  console.log(header);
  for (let gy = 0; gy < GH; gy++) {
    let line = String(gy * T).padStart(5) + " ";
    for (let gx = 0; gx < GW; gx++) line += cg[gy * GW + gx] ? "#" : ".";
    console.log(line);
  }
}
