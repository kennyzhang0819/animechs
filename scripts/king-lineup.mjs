// THE SOVEREIGN BESIDE THE SWARM: every body on one ground at ONE WORLD
// SCALE, into docs/king-concept/lineup.png, with the Erekir hull the boss
// used to be standing in the line for comparison.
//
//   node --experimental-transform-types --import ./scripts/ts-hooks.mjs scripts/king-lineup.mjs
//
// The point of the sheet is that the size claim is checkable rather than
// asserted. Every drawing goes in at its own WORLD px — native px times
// 0.625 for everything on the sheet, times 1.5 again for the boss, which
// is the one kind allowed its own scale (game/atlas.ts UNIT_ART) — so a
// tile is a tile all the way across and the boss is as many of them wider
// than an apex as the roster says it is. The tile grid behind them is the
// board's own 20 world px.
//
// The stock disrupt is read straight off public/mindustry rather than
// redrawn: it is still there, the eagle is packed beside it and not over
// it, and ANIMAL_ART off still plays it.
import { deflateSync, inflateSync } from "node:zlib";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { king } from "../game/kingArt.ts";
import { STOOP_TIERS, stoop, manta, MANTA_TIERS, narwhal, NARWHAL_TIERS, hartMech, HART_TIERS } from "../game/familyArt.ts";
import { IRON_TIERS, ironMech, ironLegged } from "../game/ironhideArt.ts";
import { TUSK_TIERS, tuskLegged } from "../game/tuskerArt.ts";
import { CELL, UNIT_SPRITE } from "../game/constants.ts";

// ── PNG in and out, by hand (scripts/turret-concepts.mjs) ──────────────
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (b) => { let c = 0xffffffff; for (const x of b) c = CRC[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(rgba, w, h) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
/** an 8-bit RGBA non-interlaced PNG to {w, h, px} — enough for the stock sprites */
function readPng(file) {
  const d = readFileSync(file);
  const w = d.readUInt32BE(16), h = d.readUInt32BE(20);
  if (d[24] !== 8 || d[25] !== 6 || d[28] !== 0) throw new Error(`${file}: want 8-bit RGBA, no interlace`);
  const parts = [];
  for (let o = 8; o < d.length;) {
    const len = d.readUInt32BE(o), type = d.toString("ascii", o + 4, o + 8);
    if (type === "IDAT") parts.push(d.subarray(o + 8, o + 8 + len));
    o += len + 12;
  }
  const raw = inflateSync(Buffer.concat(parts));
  const px = Buffer.alloc(w * h * 4);
  const stride = w * 4;
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= 4 ? px[y * stride + x - 4] : 0;
      const b = y > 0 ? px[(y - 1) * stride + x] : 0;
      const c = x >= 4 && y > 0 ? px[(y - 1) * stride + x - 4] : 0;
      let v = line[x];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      px[y * stride + x] = v & 255;
    }
  }
  return { w, h, px };
}

// ── a 5x7 font, because a comparison sheet nobody can read the labels on
// is a picture of some shapes ────────────────────────────────────────────
const GLYPHS = {
  A: "01110,10001,10001,11111,10001,10001,10001", B: "11110,10001,11110,10001,10001,10001,11110",
  C: "01110,10001,10000,10000,10000,10001,01110", D: "11110,10001,10001,10001,10001,10001,11110",
  E: "11111,10000,11110,10000,10000,10000,11111", F: "11111,10000,11110,10000,10000,10000,10000",
  G: "01110,10001,10000,10111,10001,10001,01110", H: "10001,10001,11111,10001,10001,10001,10001",
  I: "11111,00100,00100,00100,00100,00100,11111", J: "00111,00010,00010,00010,00010,10010,01100",
  K: "10001,10010,11100,10100,10010,10001,10001", L: "10000,10000,10000,10000,10000,10000,11111",
  M: "10001,11011,10101,10001,10001,10001,10001", N: "10001,11001,10101,10011,10001,10001,10001",
  O: "01110,10001,10001,10001,10001,10001,01110", P: "11110,10001,10001,11110,10000,10000,10000",
  Q: "01110,10001,10001,10001,10101,10010,01101", R: "11110,10001,10001,11110,10100,10010,10001",
  S: "01111,10000,10000,01110,00001,00001,11110", T: "11111,00100,00100,00100,00100,00100,00100",
  U: "10001,10001,10001,10001,10001,10001,01110", V: "10001,10001,10001,10001,10001,01010,00100",
  W: "10001,10001,10001,10101,10101,11011,10001", X: "10001,01010,00100,00100,00100,01010,10001",
  Y: "10001,01010,00100,00100,00100,00100,00100", Z: "11111,00001,00010,00100,01000,10000,11111",
  0: "01110,10001,10011,10101,11001,10001,01110", 1: "00100,01100,00100,00100,00100,00100,01110",
  2: "01110,10001,00001,00110,01000,10000,11111", 3: "11111,00010,00100,00010,00001,10001,01110",
  4: "00010,00110,01010,10010,11111,00010,00010", 5: "11111,10000,11110,00001,00001,10001,01110",
  6: "00110,01000,10000,11110,10001,10001,01110", 7: "11111,00001,00010,00100,01000,01000,01000",
  8: "01110,10001,10001,01110,10001,10001,01110", 9: "01110,10001,10001,01111,00001,00010,01100",
  ".": "00000,00000,00000,00000,00000,01100,01100", "-": "00000,00000,00000,11111,00000,00000,00000",
  "(": "00010,00100,01000,01000,01000,00100,00010", ")": "01000,00100,00010,00010,00010,00100,01000",
  " ": "00000,00000,00000,00000,00000,00000,00000", "/": "00001,00010,00010,00100,01000,01000,10000",
};
const GW = 5, GH = 7;

const W_PER_NATIVE = UNIT_SPRITE / 64; // 0.625 world px a native px, the sheet's own
const BOSS_SCALE = 1.5;                // ...and the boss's extra half again
const PX = 2;                          // screen px a world px on this sheet

const GROUND = [22, 24, 30];
const GRID = [34, 37, 46];
const INK = [196, 200, 214];
const DIM = [120, 126, 146];
const GOLD = [230, 189, 82];

function sheet(w, h) {
  const buf = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) { buf[i * 4] = GROUND[0]; buf[i * 4 + 1] = GROUND[1]; buf[i * 4 + 2] = GROUND[2]; buf[i * 4 + 3] = 255; }
  return buf;
}
const put = (buf, w, h, x, y, c, a = 255) => {
  if (x < 0 || y < 0 || x >= w || y >= h) return;
  const o = (y * w + x) * 4;
  const f = a / 255;
  buf[o] = Math.round(buf[o] * (1 - f) + c[0] * f);
  buf[o + 1] = Math.round(buf[o + 1] * (1 - f) + c[1] * f);
  buf[o + 2] = Math.round(buf[o + 2] * (1 - f) + c[2] * f);
  buf[o + 3] = 255;
};
function text(buf, w, h, s, x, y, c, scale = 2) {
  let cx = x;
  for (const ch of s.toUpperCase()) {
    const g = GLYPHS[ch] ?? GLYPHS[" "];
    g.split(",").forEach((row, ry) => {
      for (let rx = 0; rx < GW; rx++) {
        if (row[rx] !== "1") continue;
        for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++)
          put(buf, w, h, cx + rx * scale + dx, y + ry * scale + dy, c);
      }
    });
    cx += (GW + 1) * scale;
  }
  return cx - x;
}
const textW = (s, scale = 2) => s.length * (GW + 1) * scale;

/** an Art (or a stock RGBA sprite) drawn at `world` world px wide, nearest */
function blitScaled(buf, w, h, src, ox, oy, world) {
  const n = src.n ?? src.w;
  const side = Math.round(world * PX);
  for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) {
    const sx = Math.min(n - 1, (x * n / side) | 0);
    const sy = Math.min((src.n ?? src.h) - 1, (y * (src.n ?? src.h) / side) | 0);
    if (src.px && typeof src.px[0] !== "number") {
      const c = src.px[sy * n + sx];
      if (!c) continue;
      put(buf, w, h, ox + x, oy + y, [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]);
    } else {
      const o = (sy * src.w + sx) * 4;
      if (src.px[o + 3] < 24) continue;
      put(buf, w, h, ox + x, oy + y, [src.px[o], src.px[o + 1], src.px[o + 2]], src.px[o + 3]);
    }
  }
  return side;
}

// ── the line-up, biggest first ─────────────────────────────────────────
const art = (a, scl = 1) => ({ art: a, world: a.n * W_PER_NATIVE * scl });
const stockArt = (file, scl) => { const s = readPng(file); return { art: s, world: s.w * W_PER_NATIVE * scl }; };

const ROW = [
  { label: "SOVEREIGN", sub: "THE BOSS", ...art(king().full, BOSS_SCALE), hero: true },
  { label: "DISRUPT", sub: "THE OLD BOSS", ...stockArt("public/mindustry/sprites/units/disrupt.png", BOSS_SCALE), was: true },
  { label: "STOOP", sub: "APEX BOMBER", ...art(stoop(STOOP_TIERS[4]).full) },
  { label: "SKATE", sub: "APEX HULL", ...art(manta(MANTA_TIERS[4]).full) },
  { label: "TUSKER", sub: "APEX WALKER", ...art(tuskLegged(TUSK_TIERS[4]).body) },
  { label: "IRONHIDE", sub: "APEX MECH", ...art(ironLegged(IRON_TIERS[4]).body) },
  { label: "IRONHIDE", sub: "RUNT", ...art(ironMech(IRON_TIERS[0]).body) },
];

const PAD = 34, LABEL_H = 46, TITLE_H = 56;
// a column is as wide as its DRAWING or its CAPTION, whichever is wider —
// a runt is one block across and its name is not
const arts = ROW.map((r) => Math.round(r.world * PX));
const caps = ROW.map((r) => `${r.sub}  ${(r.world / CELL).toFixed(2).replace(/\.?0+$/, "")} BLOCKS`);
const cols = ROW.map((r, i) => Math.max(arts[i], textW(r.label, 2), textW(caps[i], 1)));
const W = cols.reduce((a, b) => a + b + PAD, PAD);
const BODY_H = Math.max(...arts);
const H = TITLE_H + BODY_H + LABEL_H + PAD;
const buf = sheet(W, H);

// the board's own tile grid behind everything, so "blocks" is a unit the
// eye can count rather than a word in a caption
for (let x = 0; x < W; x += CELL * PX) for (let y = TITLE_H; y < TITLE_H + BODY_H; y++) put(buf, W, H, x, y, GRID);
for (let y = TITLE_H + BODY_H; y > TITLE_H; y -= CELL * PX) for (let x = 0; x < W; x++) put(buf, W, H, x, y, GRID);

text(buf, W, H, "EVERY BODY AT ONE WORLD SCALE - EVERY SQUARE IS ONE BLOCK", PAD, 18, DIM, 2);

let x = PAD;
ROW.forEach((r, i) => {
  const side = arts[i];
  // centred in its column and stood on a common baseline
  const ax = x + ((cols[i] - side) >> 1);
  blitScaled(buf, W, H, r.art, ax, TITLE_H + BODY_H - side, r.world);
  const c = r.hero ? GOLD : r.was ? DIM : INK;
  text(buf, W, H, r.label, x, TITLE_H + BODY_H + 10, c, 2);
  text(buf, W, H, caps[i], x, TITLE_H + BODY_H + 28, DIM, 1);
  console.log(`${r.label.padEnd(10)} ${caps[i]}`);
  x += cols[i] + PAD;
});

mkdirSync("docs/king-concept", { recursive: true });
writeFileSync("docs/king-concept/lineup.png", png(buf, W, H));
console.log(`\ndocs/king-concept/lineup.png  ${W}x${H}`);
