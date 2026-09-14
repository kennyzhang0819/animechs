// FOUNDRY, THE TURRET CONCEPT SHEETS: every head of the roster drawn at
// native size (32 px a tile: 32, 64, 96, 128 for a 1x1 to a 4x4) into
// docs/turret-concepts/, and every render checked for a lone pixel or a
// one-pixel stroke — the two things the house rules forbid.
//
// IT IS NOT THE SOURCE OF TRUTH ANY MORE. The sheet it writes is edited by
// hand afterwards and the game ships those PNGs (game/foundryArt.ts), so a
// re-render throws every hand edit away. It refuses to overwrite a drawing
// that is already there unless FORCE=1 says to.
//
//   npm run gen:turrets                       (skips what exists)
//   FORCE=1 npm run gen:turrets               (re-renders from the code)
//   ALL=1 ...   list every flagged pixel      DUMP=1 ...   print its neighbourhood
//
// The engine, the parts and the heads come from the game itself
// (game/turretArt.ts), so the sheet and the board draw from one place.
// The rules a head is drawn to are written at the top of that file and in
// docs/turret-factions.md.
import { deflateSync } from "node:zlib";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { ACCENT, BORE, GUN, GUN_R, HEADS, STEEL, barrel, bars, drawCore, drawHead, plate, rev, stud } from "../game/turretArt.ts";

// ── PNG, by hand ───────────────────────────────────────────────────────
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (b) => { let c = 0xffffffff; for (const x of b) c = CRC[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(px, n) {
  const raw = Buffer.alloc((n * 4 + 1) * n);
  for (let y = 0; y < n; y++) {
    raw[y * (n * 4 + 1)] = 0;
    for (let x = 0; x < n; x++) {
      const c = px[y * n + x]; const o = y * (n * 4 + 1) + 1 + x * 4;
      if (c === null) { raw.fill(0, o, o + 4); continue; }
      raw[o] = parseInt(c.slice(1, 3), 16); raw[o + 1] = parseInt(c.slice(3, 5), 16); raw[o + 2] = parseInt(c.slice(5, 7), 16); raw[o + 3] = 255;
    }
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(n, 0); ihdr.writeUInt32BE(n, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

/** size in cells, accent group, a proposed name (a caption, never a key) */
export const ROSTER = {
  duo: [1, "bullet", "Pinion"], hail: [1, "shell", "Lobber"], scorch: [1, "flame", "Torch"], arc: [1, "beam", "Sparker"],
  salvo: [2, "bullet", "Triplet"], scatter: [2, "missile", "Bellow"], lancer: [2, "beam", "Kiln"], wave: [2, "water", "Sluice"],
  parallax: [2, "field", "Halo"], swarmer: [2, "missile", "Quiver"],
  fuse: [3, "flame", "Broadside"], ripple: [3, "shell", "Bombard"], tsunami: [3, "water", "Floodgate"], cyclone: [3, "missile", "Grindstone"],
  spectre: [4, "bullet", "Crucible"], meltdown: [4, "beam", "Furnace"], foreshadow: [4, "beam", "Railspike"],
};

// ── render, and refuse a hairline ──────────────────────────────────────
const OUT = "docs/turret-concepts";
mkdirSync(OUT, { recursive: true });
const FORCE = !!process.env.FORCE;
let kept = 0;
let hairlines = 0; const dumped = {};
const jobs = [];
for (const kind of Object.keys(ROSTER)) jobs.push([kind, () => drawHead(kind, HEADS)]);
jobs.push(["core", drawCore]);
for (const [name, make] of jobs) {
  const file = `${OUT}/mill-${name}.png`;
  // the drawing on disk may be a hand edit; only FORCE=1 replaces it
  if (!FORCE && existsSync(file)) { kept++; continue; }
  const { n, px } = make();
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const c = px[y * n + x]; if (c === null) continue;
    const at = (X, Y) => (X < 0 || Y < 0 || X >= n || Y >= n ? null : px[Y * n + X]);
    const nb = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && at(x + dx, y + dy) === c) nb.push([dx, dy]);
    const stroke = nb.length === 0 || nb.every(([dx, dy]) => dx * nb[0][1] - dy * nb[0][0] === 0);
    if (stroke) {
      hairlines++;
      if (process.env.ALL || hairlines <= 40) console.log(`  ${name}: one-wide at ${x},${y} ${c}`);
      if (process.env.DUMP && !(dumped[name] ??= new Set()).has(`${x >> 3},${y >> 3}`)) {
        dumped[name].add(`${x >> 3},${y >> 3}`);
        const key = {}; let k = 0;
        const sym = (v) => (v === null ? "." : (key[v] ??= "ABCDEFGHIJKLMNOP"[k++]));
        console.log(`  ${name} around ${x},${y}:`);
        for (let Y = y - 4; Y <= y + 4; Y++) console.log("    " + String(Y).padStart(3) + " " + Array.from({ length: 13 }, (_, i) => sym(at(x - 6 + i, Y))).join(""));
        console.log("    " + Object.entries(key).map(([v, s]) => `${s}=${v}`).join(" "));
      }
    }
  }
  writeFileSync(file, png(px, n));
}
writeFileSync(`${OUT}/roster.json`, JSON.stringify({ roster: ROSTER, accent: ACCENT }, null, 2));
console.log(`wrote ${jobs.length - kept} drawings to ${OUT}/, ${hairlines} lone pixels`);
if (kept) console.log(`kept ${kept} already on disk — FORCE=1 to re-render them from the code`);
