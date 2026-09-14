// BOTANICA, FROM SCRATCH: a second player faction designed as its own
// roster rather than a skin over Mindustry's — seventeen plants and one
// heartwood, each one the whole building: no plate under it, the plant is
// the footprint. Drawn from above at 32 px a tile with the Foundry engine
// (game/turretArt.ts) and the same one-pixel check. The roster, what each
// plant does and how it grows are in docs/botanica.md; this file is the art.
//
//   node --experimental-strip-types scripts/botanica-faction.mjs
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { BORE, bars, draw, plate, rev, stud } from "../game/turretArt.ts";

// ── materials ──────────────────────────────────────────────────────────
const BARK = ["#5a3d26", "#8a6238"];
const LEAF = ["#3f7f3c", "#6fb85a"];
const LEAF_R = rev(LEAF);
const PALE = ["#9fd47c", "#d4f0b0"];
const MOSS = ["#2f5a2e", "#4a8a48"];
const CAP = ["#b96a4a", "#e8a37a"];      // a mushroom cap
const SAP = ["#7a8a2a", "#b9c95a"];      // acid sap, olive — nowhere near the swarm's acid
const NUT = ["#8a5a2b", "#c9924e"];      // a hard seed
const FIG = ["#7a2f4a", "#c4587a"];      // a bursting fruit
const DEW = ["#3f4c96", "#5c6dbb"];      // water
const GLOW = ["#a9d8ff", "#e6f4ff"];     // a spark
const MAROON = ["#6a2a3a", "#a84a5e"];   // the corpse flower's petal
const HEART = ["#d9a85a", "#ffd37f"];    // the team's colour, in the heartwood

/** a canopy: a leaf disc with dark lobes and pale crowns, a trunk in the middle */
function canopy(P, cx, cy, r, lobes, crowns, trunk) {
  P.disc(cx, cy, r, LEAF);
  for (const [x, y, lr] of lobes) P.disc(x, y, lr, LEAF_R);
  for (const [x, y, cr] of crowns) P.disc(x, y, cr, PALE);
  if (trunk) { P.disc(cx, cy, trunk, BARK); P.disc(cx, cy, Math.max(1, trunk >> 1), BORE); }
}
/** fruit on a canopy */
function fruit(P, spots, r, m) { for (const [x, y] of spots) P.disc(x, y, r, m); }

// ── the roster: size in tiles, and the drawing ─────────────────────────
const PLANTS = {
  // ── common ──
  sapling: [1, (P) => {                                  // three leaf lobes on a young trunk
    P.disc(11, 14, 7, LEAF); P.disc(16, 22, 7, LEAF); P.disc(16, 14, 7, LEAF);
    P.disc(10, 12, 2, PALE); P.disc(16, 24, 2, PALE);
    P.disc(16, 17, 2, BARK);
  }],
  thornbush: [1, (P) => {                                // a bark mass, spikes on the rim, a few leaves
    P.disc(16, 16, 10, BARK);
    P.disc(16, 16, 6, rev(BARK));
    stud(P, 16, 5, 2, PALE); stud(P, 7, 10, 2, PALE); stud(P, 7, 22, 2, PALE); stud(P, 16, 27, 2, PALE);
    P.disc(12, 16, 3, LEAF);
  }],
  puffcap: [1, (P) => {                                  // a mushroom cap, spotted
    P.disc(16, 16, 11, CAP);
    P.disc(16, 16, 4, rev(CAP));
    P.disc(11, 11, 2, PALE); P.disc(16, 24, 2, PALE); P.disc(9, 19, 2, PALE);
  }],
  dewvine: [2, (P) => {                                  // a leaf mat with a vine lattice, dew at the crossings
    plate(P, 6, 6, 58, 58, 12, LEAF, 4);
    P.box(10, 20, 54, 26, BARK); P.box(10, 38, 54, 44, BARK);
    P.box(20, 10, 26, 54, BARK); P.box(38, 10, 44, 54, BARK);
    fruit(P, [[23, 23], [23, 41]], 3, DEW);
    P.disc(32, 32, 8, BARK); P.disc(32, 32, 3, PALE);
  }],
  sunflower: [2, (P) => {                                // petals round a seed head; the head turns
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; const x = Math.round(32 + Math.cos(a) * 24), y = Math.round(32 + Math.sin(a) * 24); if (x <= 32) P.disc(x, y, 7, PALE); }
    P.disc(32, 32, 14, BARK);
    P.disc(32, 32, 8, rev(BARK));
    P.disc(32, 32, 4, GLOW);
  }],
  pitcher: [2, (P) => {                                  // three pitchers, lipped mouths, a leaf at the foot
    P.octa(8, 6, 26, 50, 6, LEAF); P.octa(23, 14, 41, 58, 6, LEAF);
    P.ring(17, 16, 5, 2, PALE); P.disc(17, 16, 3, SAP); P.ring(32, 24, 5, 2, PALE); P.disc(32, 24, 3, SAP);
    P.octa(4, 44, 30, 60, 6, LEAF_R);
  }],
  // ── uncommon ──
  willow: [3, (P) => {                                   // a weeping canopy, branches across it, fronds at the rim
    canopy(P, 48, 48, 44, [[26, 30, 12], [30, 66, 10]], [[24, 22, 5], [22, 60, 4]], 0);
    P.box(46, 6, 50, 90, BARK); P.box(6, 46, 90, 50, BARK);
    P.disc(48, 48, 8, BARK); P.disc(48, 48, 4, BORE);      // the trunk, over the boughs
    P.box(4, 30, 8, 66, PALE); P.box(30, 88, 66, 93, PALE);    // fronds hanging off the rim
  }],
  cannonfig: [2, (P) => {                                // a fig tree, figs ripening on the canopy
    canopy(P, 32, 32, 27, [[18, 22, 8], [22, 46, 7]], [], 5);
    fruit(P, [[32, 18], [20, 32], [28, 48]], 4, FIG);
  }],
  oak: [3, (P) => {                                      // the broad canopy, acorns on it
    canopy(P, 48, 48, 45, [[28, 30, 12], [28, 66, 12]], [[48, 14, 6], [18, 48, 5]], 10);
    fruit(P, [[48, 28], [34, 48], [48, 78], [28, 32]], 4, NUT);
  }],
  snapdragon: [2, (P) => {                               // two lobes, teeth, a throat; the jaw turns
    P.octa(6, 8, 30, 40, 8, LEAF); P.octa(12, 14, 30, 34, 4, rev(FIG));
    bars(P, 26, 30, 12, 4, 3, 3, PALE);
    P.box(30, 10, 34, 38, BORE);
    P.box(28, 40, 36, 58, BARK);
    P.octa(4, 44, 26, 60, 6, LEAF);
  }],
  fireflyreed: [1, (P) => {                              // reeds with sparks at their tips
    P.disc(16, 23, 8, MOSS);                              // the wet ground they stand in
    P.box(8, 6, 11, 28, BARK); P.box(14, 4, 18, 28, BARK);
    P.disc(9, 7, 3, GLOW); P.disc(16, 5, 3, GLOW);
  }],
  // ── rare ──
  kudzu: [3, (P) => {                                    // a vine mass with runners reaching every edge
    plate(P, 4, 4, 92, 92, 20, LEAF, 6);
    P.box(4, 44, 92, 52, BARK); P.box(44, 4, 52, 92, BARK);
    P.box(16, 20, 40, 26, BARK); P.box(16, 70, 40, 76, BARK); P.box(20, 16, 26, 40, BARK); P.box(20, 56, 26, 80, BARK);
    fruit(P, [[34, 34], [34, 62], [12, 48], [48, 14], [48, 82]], 5, PALE);
    P.disc(48, 48, 10, BARK); P.disc(48, 48, 4, PALE);
  }],
  bombardier: [3, (P) => {                               // one great seed pod, seeds in rows, leaves at its foot
    plate(P, 12, 8, 84, 88, 20, ["#c8641e", "#f5a142"], 6);
    for (const [x, y] of [[30, 26], [48, 26], [30, 44], [48, 44], [30, 62], [48, 62]]) { P.disc(x, y, 5, BORE); P.disc(x, y, 2, PALE); }
    P.octa(4, 60, 44, 94, 10, LEAF);
  }],
  corpseflower: [3, (P) => {                             // a maroon bloom, a spadix in the middle
    P.ring(48, 48, 46, 14, MAROON);
    P.ring(48, 48, 32, 6, LEAF_R);
    P.disc(48, 48, 18, BARK);
    P.disc(48, 48, 10, FIG);
    P.disc(48, 48, 4, BORE);
    P.octa(4, 66, 34, 94, 8, LEAF);
  }],
  // ── ultra rare ──
  worldash: [4, (P) => {                                 // the colossal canopy: lobes, crowns, a cross of boughs, fruit
    canopy(P, 64, 64, 62, [[34, 34, 18], [34, 94, 15]], [[36, 28, 8], [30, 92, 6]], 0);
    P.box(60, 6, 68, 122, BARK); P.box(6, 60, 122, 68, BARK);
    P.disc(64, 64, 16, BARK); P.disc(64, 64, 6, BORE);      // the trunk, over the boughs
    fruit(P, [[64, 20], [20, 64], [64, 108], [52, 54], [52, 74]], 5, NUT);
  }],
  venuscolossus: [4, (P) => {                            // the giant trap: two lobes, teeth, a throat, a stem
    P.octa(6, 10, 60, 100, 16, LEAF);
    P.octa(14, 20, 52, 92, 10, rev(FIG));
    bars(P, 54, 60, 16, 8, 6, 4, PALE);
    P.box(60, 14, 68, 96, BORE);
    P.box(56, 100, 72, 124, BARK);
    P.octa(4, 96, 44, 126, 10, LEAF);
  }],
  solarbloom: [4, (P) => {                               // the giant sunflower; the head turns
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; const x = Math.round(64 + Math.cos(a) * 50), y = Math.round(64 + Math.sin(a) * 50); if (x <= 64) P.disc(x, y, 14, PALE); }
    P.disc(64, 64, 36, BARK);
    P.ring(64, 64, 28, 6, rev(BARK));
    P.ring(64, 64, 16, 5, rev(BARK));
    P.disc(64, 64, 10, GLOW);
    P.disc(64, 64, 4, PALE);
  }],
};
/** the heartwood: a great stump with its rings, root buttresses, the team's colour at the heart */
function heartwood() {
  return draw(160, (P) => {
    for (const [x, y] of [[8, 8], [8, 112]]) P.octa(x, y, x + 48, y + 40, 12, BARK);
    P.disc(80, 80, 74, BARK);
    for (const r of [62, 46, 30]) P.ring(80, 80, r, 5, rev(BARK));
    P.disc(80, 80, 16, HEART);
    P.disc(80, 80, 6, PALE);
    for (const [x, y] of [[20, 36], [20, 124]]) P.disc(x, y, 9, MOSS);   // moss on the buttresses, outside the rings
  });
}

// ── PNG, by hand ───────────────────────────────────────────────────────
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (b) => { let c = 0xffffffff; for (const x of b) c = CRC[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type, "ascii"), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]); }
function png(px, n) {
  const raw = Buffer.alloc((n * 4 + 1) * n);
  for (let y = 0; y < n; y++) { raw[y * (n * 4 + 1)] = 0; for (let x = 0; x < n; x++) { const c = px[y * n + x]; const o = y * (n * 4 + 1) + 1 + x * 4; if (c === null) { raw.fill(0, o, o + 4); continue; } raw[o] = parseInt(c.slice(1, 3), 16); raw[o + 1] = parseInt(c.slice(3, 5), 16); raw[o + 2] = parseInt(c.slice(5, 7), 16); raw[o + 3] = 255; } }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(n, 0); ihdr.writeUInt32BE(n, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

// ── render, and refuse a one-pixel stroke ──────────────────────────────
const OUT = "docs/botanica";
mkdirSync(OUT, { recursive: true });
let flagged = 0; const dumped = {};
const jobs = Object.entries(PLANTS).map(([name, [size, fn]]) => [name, () => draw(32 * size, fn)]);
jobs.push(["heartwood", heartwood]);
for (const [name, make] of jobs) {
  const { n, px } = make();
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const c = px[y * n + x]; if (c === null) continue;
    const at = (X, Y) => (X < 0 || Y < 0 || X >= n || Y >= n ? null : px[Y * n + X]);
    const nb = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && at(x + dx, y + dy) === c) nb.push([dx, dy]);
    if (nb.length === 0 || nb.every(([dx, dy]) => dx * nb[0][1] - dy * nb[0][0] === 0)) {
      flagged++;
      if (process.env.ALL || flagged <= 40) console.log(`  ${name}: one-wide at ${x},${y} ${c}`);
      if (process.env.DUMP && !(dumped[name] ??= new Set()).has(`${x >> 3},${y >> 3}`)) {
        dumped[name].add(`${x >> 3},${y >> 3}`);
        const key = {}; let k = 0; const sym = (v) => (v === null ? "." : (key[v] ??= "ABCDEFGHIJKLMNOP"[k++]));
        console.log(`  ${name} around ${x},${y}:`);
        for (let Y = y - 4; Y <= y + 4; Y++) console.log("    " + String(Y).padStart(3) + " " + Array.from({ length: 13 }, (_, i) => sym(at(x - 6 + i, Y))).join(""));
        console.log("    " + Object.entries(key).map(([v, s]) => `${s}=${v}`).join(" "));
      }
    }
  }
  writeFileSync(`${OUT}/${name}.png`, png(px, n));
}
writeFileSync(`${OUT}/roster.json`, JSON.stringify(Object.fromEntries(Object.entries(PLANTS).map(([k, [size]]) => [k, size])), null, 1));
console.log(`wrote ${jobs.length} drawings to ${OUT}/, ${flagged} one-pixel strokes`);
