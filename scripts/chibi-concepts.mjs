#!/usr/bin/env node
// THE CHIBI SHEET (docs/style-concepts/chibi-sheet.png): hand-authored
// sprites, all one size (16 x 20 px), drawn as pixel maps — a big head,
// large eyes, a mouth, a small body, one feature that says who it is, a
// dark outline, flat colours. Enemies first, then turrets as small weapon
// objects, then props. node scripts/chibi-concepts.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { RHINO, STAG, FROG, BAT, MANTA, EAGLE, PALM, PALM2, BUSH, ROCK, PLATE, WEAPON_PIC, keepPic } from "../game/chibiArt.ts";
import { platePic, weaponPic } from "../game/turretTiles.ts";

const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (b) => { let c = 0xffffffff; for (const x of b) c = CRC[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type, "ascii"), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]); };
function png(px, w, h) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; for (let x = 0; x < w; x++) { const c = px[y * w + x]; const o = y * (w * 4 + 1) + 1 + x * 4; if (c == null) { raw.fill(0, o, o + 4); continue; } raw[o] = parseInt(c.slice(1, 3), 16); raw[o + 1] = parseInt(c.slice(3, 5), 16); raw[o + 2] = parseInt(c.slice(5, 7), 16); raw[o + 3] = 255; } }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

// ── the sheet ──────────────────────────────────────────────────────────
const SCALE = 4;
const BG = "#b8306e", BG2 = "#8a2252";
const over = (a, b) => ({ w: a.w, h: a.h, px: a.px.map((c, i) => b.px[i] ?? c) });
const tiles = Object.values(WEAPON_PIC).map((w) => over(PLATE, w));
const AMMOS = Object.keys(WEAPON_PIC);
const tilesAt = (size) => AMMOS.map((a) => over(platePic(size), weaponPic(a, size)));
const items = [
  ["enemies", [RHINO, STAG, FROG, BAT, MANTA, EAGLE]],
  ["turrets", tiles],
  ["props", [PALM, PALM2, BUSH, ROCK]],
  ["keep", [keepPic()]],
];
const W = (16 * SCALE + 8) * 8 + 40, H = 20 * SCALE + 24 + 16 * SCALE + 24 + 40 * SCALE + 24 + 160 * 2 + 40;
const px = new Array(W * H).fill(BG);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (((x >> 5) + (y >> 5)) % 2 === 0) px[y * W + x] = BG2;
let row = 10;
for (const [, list] of items) {
  let col = 20;
  for (const s of list) {
    const k = s.w >= 32 ? 2 : SCALE;
    for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) {
      const c = s.px[y * s.w + x];
      if (c == null) continue;
      for (let yy = 0; yy < k; yy++) for (let xx = 0; xx < k; xx++) { const X = col + x * k + xx, Y = row + y * k + yy; if (X < W && Y < H) px[Y * W + X] = c; }
    }
    col += s.w * k + 8;
  }
  row += Math.max(...list.map((s) => s.h * (s.w >= 32 ? 2 : SCALE))) + 24;
}
mkdirSync("docs/style-concepts", { recursive: true });
writeFileSync("docs/style-concepts/chibi-sheet.png", png(px, W, H));
console.log("chibi-sheet.png");
