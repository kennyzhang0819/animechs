// BOTANICA, THE CONCEPT SHEETS: every plant of the faction (game/botanicaArt.ts,
// one a kind, keyed by the kind it stands for) and the heartwood, drawn
// at native size into docs/botanica/ and checked for a one-pixel stroke.
// The roster and what each plant does are in docs/botanica.md.
//
//   node --experimental-strip-types scripts/botanica-faction.mjs
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { drawHeartwood, drawPlant, PLANT_KINDS } from "../game/botanicaArt.ts";
import { PLANT_NAMES } from "../game/faction.ts";

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
const jobs = PLANT_KINDS.map((k) => [k, () => drawPlant(k)]);
jobs.push(["heartwood", drawHeartwood]);
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
writeFileSync(`${OUT}/roster.json`, JSON.stringify(Object.fromEntries(PLANT_KINDS.map((k) => [k, { size: 32 * 0 + [1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4][PLANT_KINDS.indexOf(k)], name: PLANT_NAMES[k] }])), null, 1));
console.log(`wrote ${jobs.length} drawings to ${OUT}/, ${flagged} one-pixel strokes`);
