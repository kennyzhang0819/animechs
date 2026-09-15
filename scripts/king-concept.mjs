// THE SOVEREIGN'S CONCEPT SHEET: the boss drawn at native size into
// docs/king-concept/ (full, body, wing, cell and sizes), on a dark
// ground, beside the stoop5, the skate5 and the tusker5 at the same
// px-per-tile so the size claim can be looked at rather than argued about. Same house rules as the turret sheet: no run
// of one material under four pixels (game/turretArt.ts thinRuns).
//
//   node --experimental-transform-types --import ./scripts/ts-hooks.mjs scripts/king-concept.mjs
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { king, KING_TIER } from "../game/kingArt.ts";
import { STOOP_TIERS, stoop, manta, MANTA_TIERS } from "../game/familyArt.ts";
import { TUSK_TIERS, tuskLegged } from "../game/tuskerArt.ts";

// ── PNG, by hand (scripts/turret-concepts.mjs) ─────────────────────────
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

const GROUND = [26, 28, 34];
/** an Art blitted into an rgba buffer at (ox, oy), scaled by `s` */
function blit(buf, W, art, ox, oy, s = 1) {
  for (let y = 0; y < art.n; y++) for (let x = 0; x < art.n; x++) {
    const c = art.px[y * art.n + x];
    if (!c) continue;
    const r = parseInt(c.slice(1, 3), 16), g = parseInt(c.slice(3, 5), 16), b = parseInt(c.slice(5, 7), 16);
    for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++) {
      const o = ((oy + y * s + dy) * W + ox + x * s + dx) * 4;
      buf[o] = r; buf[o + 1] = g; buf[o + 2] = b; buf[o + 3] = 255;
    }
  }
}

const K = king();
const PARTS = [
  ["full", K.full, 1],
  ["body", K.body, 1],
  ["wing", K.wing, 1],
  ["cell", K.cell, 1],
];
// the size comparison, every body at the SAME world scale: the king draws
// half again its native px (atlas.ts), so it goes in at 1.5 against the
// others' 1
const SCALE = process.env.SCALE ? Number(process.env.SCALE) : 1;
const ROSTER = [
  ["king", K.full, 1.5],
  ["stoop5", stoop(STOOP_TIERS[4]).full, 1],
  ["skate5", manta(MANTA_TIERS[4]).full, 1],
  ["tusker5", tuskLegged(TUSK_TIERS[4]).body, 1],
];

// ── the house rules, on the finished drawing ───────────────────────────
// game/turretArt.ts thinRuns reads the pre-shade material array, which the
// family drawings do not hand out; the same rule on the FINISHED pixels
// catches everything but a run that changes shade at the midline, and that
// one is the mirror's own doing.
function thin(art, min = 4) {
  const out = [];
  const at = (x, y) => art.px[y * art.n + x];
  for (let y = 0; y < art.n; y++) for (let x = 0; x < art.n;) {
    const m = at(x, y); let x1 = x; while (x1 < art.n && at(x1, y) === m) x1++;
    if (m !== null && x1 - x < min) out.push(`row ${y} x ${x}..${x1 - 1} (${x1 - x})`);
    x = x1;
  }
  for (let x = 0; x < art.n; x++) for (let y = 0; y < art.n;) {
    const m = at(x, y); let y1 = y; while (y1 < art.n && at(x, y1) === m) y1++;
    if (m !== null && y1 - y < min) out.push(`col ${x} y ${y}..${y1 - 1} (${y1 - y})`);
    y = y1;
  }
  return out;
}

mkdirSync("docs/king-concept", { recursive: true });

for (const [name, art] of [["full", K.full], ["body", K.body], ["wing", K.wing]]) {
  const bad = thin(art);
  if (bad.length === 0) console.log(`${name}: no run under four px`);
  else console.log(`${name}: ${bad.length} thin runs — ${bad.slice(0, process.env.ALL ? 400 : 8).join("; ")}`);
}


// one sheet per part, at native size
for (const [name, art, s] of PARTS) {
  const S = Math.max(1, Math.round(SCALE * s));
  const W = art.n * S, H = art.n * S;
  const buf = Buffer.alloc(W * H * 4);
  for (let i = 0; i < W * H; i++) { buf[i * 4] = GROUND[0]; buf[i * 4 + 1] = GROUND[1]; buf[i * 4 + 2] = GROUND[2]; buf[i * 4 + 3] = 255; }
  blit(buf, W, art, 0, 0, S);
  writeFileSync(`docs/king-concept/${name}.png`, png(buf, W, H));
  console.log(`${name}: ${art.n}px`);
}

// the size sheet: every apex on one ground at one world scale
{
  const PAD = 24;
  const widths = ROSTER.map(([, a, s]) => Math.round(a.n * s));
  const W = widths.reduce((a, b) => a + b + PAD, PAD);
  const H = Math.max(...widths) + 2 * PAD;
  const buf = Buffer.alloc(W * H * 4);
  for (let i = 0; i < W * H; i++) { buf[i * 4] = GROUND[0]; buf[i * 4 + 1] = GROUND[1]; buf[i * 4 + 2] = GROUND[2]; buf[i * 4 + 3] = 255; }
  let x = PAD;
  ROSTER.forEach(([name, art, s], i) => {
    // a whole-pixel upscale only: 1.5 is drawn as 3 into a buffer read at 2
    const up = s === 1.5 ? 3 : 2;
    const big = { n: art.n * up, px: new Array((art.n * up) ** 2).fill(null) };
    for (let y = 0; y < art.n; y++) for (let px = 0; px < art.n; px++) {
      const c = art.px[y * art.n + px];
      for (let dy = 0; dy < up; dy++) for (let dx = 0; dx < up; dx++) big.px[(y * up + dy) * big.n + px * up + dx] = c;
    }
    // then halved back down by nearest, which is the 1.5x / 1x the game uses
    const out = { n: Math.round(art.n * s), px: [] };
    for (let y = 0; y < out.n; y++) for (let px = 0; px < out.n; px++) out.px.push(big.px[Math.min(big.n - 1, y * 2) * big.n + Math.min(big.n - 1, px * 2)]);
    blit(buf, W, out, x, PAD + ((H - 2 * PAD - out.n) >> 1), 1);
    console.log(`${name}: ${out.n} world-equivalent px = ${(out.n / 32).toFixed(2)} tiles`);
    x += widths[i] + PAD;
  });
  writeFileSync("docs/king-concept/sizes.png", png(buf, W, H));
}
