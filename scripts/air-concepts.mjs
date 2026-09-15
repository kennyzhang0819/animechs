// THE SECOND AIR FAMILY'S CONCEPT SHEETS: three candidate flyers drawn at
// native size into docs/air-concepts/, on a dark ground, each beside the
// stoop5 at the same px-per-tile so the size claim can be looked at
// rather than argued about. The drawings are game/skyConceptArt.ts and
// nothing there is wired into the game.
//
//   npm run gen:air
//
// Same house rules as the Sovereign's sheet (scripts/king-concept.mjs):
// every part is checked for a run of one material under four pixels.
//
//   SCALE=4  render everything at 4x instead of the per-sheet default
//   ALL=1    print every thin run rather than the first eight
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { SKY_CONCEPTS, shadowOf } from "../game/skyConceptArt.ts";
import { STOOP_TIERS, stoop } from "../game/familyArt.ts";

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
const SCALE = process.env.SCALE ? Number(process.env.SCALE) : 0;
/** a buffer of `w` by `h` filled with the sheet's ground */
function sheet(w, h) {
  const buf = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) { buf[i * 4] = GROUND[0]; buf[i * 4 + 1] = GROUND[1]; buf[i * 4 + 2] = GROUND[2]; buf[i * 4 + 3] = 255; }
  return buf;
}
/** an Art blitted into an rgba buffer at (ox, oy), scaled by `s`, every
 *  channel times `dim` — the wedge sheet draws the birds the guns cannot
 *  touch darker than the one they can */
function blit(buf, W, H, art, ox, oy, s = 1, dim = 1) {
  for (let y = 0; y < art.n; y++) for (let x = 0; x < art.n; x++) {
    const c = art.px[y * art.n + x];
    if (!c) continue;
    const r = parseInt(c.slice(1, 3), 16) * dim, g = parseInt(c.slice(3, 5), 16) * dim, b = parseInt(c.slice(5, 7), 16) * dim;
    for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++) {
      const px = ox + x * s + dx, py = oy + y * s + dy;
      if (px < 0 || py < 0 || px >= W || py >= H) continue;
      const o = (py * W + px) * 4;
      buf[o] = r; buf[o + 1] = g; buf[o + 2] = b; buf[o + 3] = 255;
    }
  }
}

// ── the house rules, on the finished drawing ───────────────────────────
// turretArt.ts thinRuns reads the pre-shade material array, which a
// composed flyer does not hand out; the same rule on the FINISHED pixels
// catches everything but a run that changes shade at the midline, and
// that one is the mirror's own doing.
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

mkdirSync("docs/air-concepts", { recursive: true });
const PAD = 24;

// ── one lineup a candidate: all five tiers on one ground, at 2x ────────
for (const { key, animal, tiers, art } of SKY_CONCEPTS) {
  const S = SCALE || 2;
  const drawings = tiers.map((T) => art(T).full);
  const W = drawings.reduce((a, d) => a + d.n * S + PAD, PAD);
  const H = Math.max(...drawings.map((d) => d.n)) * S + 2 * PAD;
  const buf = sheet(W, H);
  let x = PAD;
  drawings.forEach((d) => {
    blit(buf, W, H, d, x, PAD + ((H - 2 * PAD - d.n * S) >> 1), S);
    x += d.n * S + PAD;
  });
  writeFileSync(`docs/air-concepts/${key}.png`, png(buf, W, H));
  const bad = drawings.flatMap((d, i) => thin(d).map((s) => `T${i + 1} ${s}`));
  console.log(`${key} (${animal}): ${tiers.map((T) => T.n).join(", ")} px — ` +
    (bad.length === 0 ? "no run under four px" : `${bad.length} thin runs: ${bad.slice(0, process.env.ALL ? 400 : 8).join("; ")}`));
}

// ── the parts a candidate's rig would pack, for the winner ─────────────
for (const { key, tiers, art } of SKY_CONCEPTS) {
  const A = art(tiers[4]);
  const S = SCALE || 2;
  for (const [part, d] of [["body", A.body], ["wing", A.wing]]) {
    const W = d.n * S, H = d.n * S;
    const buf = sheet(W, H);
    blit(buf, W, H, d, 0, 0, S);
    writeFileSync(`docs/air-concepts/${key}-${part}.png`, png(buf, W, H));
  }
}

// ── the size sheet: every apex beside the stoop5 it would fly with ─────
{
  const S = SCALE || 1;
  const ROSTER = [["stoop5", stoop(STOOP_TIERS[4]).full], ...SKY_CONCEPTS.map(({ key, tiers, art }) => [`${key}5`, art(tiers[4]).full])];
  const W = ROSTER.reduce((a, [, d]) => a + d.n * S + PAD, PAD);
  const H = Math.max(...ROSTER.map(([, d]) => d.n)) * S + 2 * PAD;
  const buf = sheet(W, H);
  let x = PAD;
  for (const [name, d] of ROSTER) {
    blit(buf, W, H, d, x, PAD + ((H - 2 * PAD - d.n * S) >> 1), S);
    console.log(`${name}: ${d.n} px = ${(d.n / 32).toFixed(3)} tiles`);
    x += d.n * S + PAD;
  }
  writeFileSync("docs/air-concepts/sizes.png", png(buf, W, H));
}

// ── the gimmick sheets: the three answers, drawn ───────────────────────
//
// THE SKEIN'S WEDGE. Seven runts in the V, the point bird lit and the six
// behind it dimmed: the dim ones are the ones no gun on the board can
// touch while the point is alive, which is the whole family in one
// picture. The wedge is drawn at the spacing the flock would really hold
// — a body and a half back, a body out — so what the sheet shows is also
// how much board a skein covers.
{
  const skeinC = SKY_CONCEPTS[0];
  const S = SCALE || 3;
  const d = skeinC.art(skeinC.tiers[1]).full;
  const n = d.n * S, back = Math.round(n * 0.95), out = Math.round(n * 0.7);
  const rows = 4;
  const W = 2 * (rows - 1) * out + n + 2 * PAD, H = (rows - 1) * back + n + 2 * PAD;
  const buf = sheet(W, H);
  const cx = (W - n) >> 1;
  for (let r = rows - 1; r >= 0; r--) {
    const y = PAD + r * back;
    if (r === 0) blit(buf, W, H, d, cx, y, S);
    else for (const s of [-1, 1]) blit(buf, W, H, d, cx + s * r * out, y, S, 0.45);
  }
  writeFileSync("docs/air-concepts/skein-wedge.png", png(buf, W, H));
}
//
// THE KETTLE'S CROP. The same animal at the five ranks, cropped to the
// breast and blown up: an empty runt against a gorged apex. Every other
// line on the sheet grows by being drawn bigger; this one grows by
// filling up, and the tiers ARE the courses.
{
  const kettleC = SKY_CONCEPTS[1];
  const drawings = kettleC.tiers.map((T) => kettleC.art(T).body);
  // the front three quarters of each body column, which is where the crop
  // is — and EVERY TIER BLOWN UP TO THE SAME HEIGHT, because what this
  // sheet is about is the share of the breast the sac takes and not how
  // big the bird got. A runt drawn a fifth the size of the apex answers
  // the wrong question
  const crops = drawings.map((d) => {
    const h = Math.round(d.n * 0.76), w = Math.round(d.n * 0.56), x0 = (d.n - w) >> 1;
    const px = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) px.push(d.px[y * d.n + x0 + x]);
    return { n: w, h, px, s: Math.max(1, Math.round((SCALE || 128) / h)) };
  });
  const W = crops.reduce((a, c) => a + c.n * c.s + PAD, PAD);
  const H = Math.max(...crops.map((c) => c.h * c.s)) + 2 * PAD;
  const buf = sheet(W, H);
  let x = PAD;
  for (const c of crops) {
    const S = c.s;
    // blit reads a square Art; a crop is a rect, so it goes in by hand
    for (let y = 0; y < c.h; y++) for (let px = 0; px < c.n; px++) {
      const col = c.px[y * c.n + px];
      if (!col) continue;
      const r = parseInt(col.slice(1, 3), 16), g = parseInt(col.slice(3, 5), 16), b = parseInt(col.slice(5, 7), 16);
      for (let dy = 0; dy < S; dy++) for (let dx = 0; dx < S; dx++) {
        const o = ((PAD + y * S + dy) * W + x + px * S + dx) * 4;
        buf[o] = r; buf[o + 1] = g; buf[o + 2] = b; buf[o + 3] = 255;
      }
    }
    x += c.n * c.s + PAD;
  }
  writeFileSync("docs/air-concepts/kettle-crop.png", png(buf, W, H));
}
//
// THE GYRE'S SHADOW. The apex and the thing the board actually shoots at,
// which is not in the same place: the shadow goes in first, offset down
// and forward by the sun, in one flat ink with no lighting in it at all.
// A player aiming by eye at the bird misses by the length of that offset
// every time, and a gun whose reach ends between the two of them never
// gets a shot.
{
  const gyreC = SKY_CONCEPTS[2];
  const S = SCALE || 2;
  const d = gyreC.art(gyreC.tiers[4]).full;
  const sh = shadowOf(d, "#0c0d13");
  const off = Math.round(d.n * 0.38), n = d.n * S;
  const W = n + off * S + 2 * PAD, H = n + off * S + 2 * PAD;
  const buf = sheet(W, H);
  blit(buf, W, H, sh, PAD + off * S, PAD + off * S, S);
  blit(buf, W, H, d, PAD, PAD, S);
  writeFileSync("docs/air-concepts/gyre-shadow.png", png(buf, W, H));
}
console.log("docs/air-concepts/: lineups, parts, sizes, and the three gimmick sheets");
