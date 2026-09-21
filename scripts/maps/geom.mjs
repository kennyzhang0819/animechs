// Shared raster helpers for the map generators: the disc stamp, the
// morphological offsets, the flood, the clearance transform and the
// widest-route search, a seeded RNG and a PNG writer for the previews.
//
// The arc-only Path builder and the cosine-lobed blob that used to live
// here are gone with the geometric maps they drew: every shape on a map
// now comes out of noise and a brushed A* route (mapgen.mjs).

/** a disc of `r` cells stamped through `put(i, x, y)` */
export const disc = (W, H, cx, cy, r, put) => {
  const x0 = Math.max(0, Math.ceil(cx - r));
  const x1 = Math.min(W - 1, Math.floor(cx + r));
  const y0 = Math.max(0, Math.ceil(cy - r));
  const y1 = Math.min(H - 1, Math.floor(cy + r));
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      if (dx * dx + dy * dy <= r * r) put(y * W + x, x, y);
    }
};

/** disc offsets within radius r, for the morphological passes */
export const discOffsets = (r) => {
  const out = [];
  for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy++)
    for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx++)
      if (dx * dx + dy * dy <= r * r) out.push([dx, dy]);
  return out;
};

/**
 * CLEARANCE: for every cell, the distance to the nearest cell a unit
 * cannot occupy. Twice this is how wide the corridor is at that point, so
 * it is the measure every width rule is written in.
 *
 * A chamfer transform with the 5-7-11 weights, two passes, divided back by
 * 5 — its worst error against true Euclid is about two percent, which on a
 * ten-cell radius is a fifth of a cell.
 *
 * OFF THE BOARD COUNTS AS PASSABLE. The rim is always rock on a finished
 * map, so this never matters there; it keeps the transform honest on a
 * mask that has not been sealed yet.
 */
export const clearance = (W, H, pass) => {
  const INF = 1e9;
  const d = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) d[i] = pass(i) ? INF : 0;
  const relax = (i, j, w) => { if (d[j] + w < d[i]) d[i] = d[j] + w; };
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (d[i] === 0) continue;
      if (x > 0) relax(i, i - 1, 5);
      if (y > 0) relax(i, i - W, 5);
      if (x > 0 && y > 0) relax(i, i - W - 1, 7);
      if (x < W - 1 && y > 0) relax(i, i - W + 1, 7);
      if (x > 1 && y > 0) relax(i, i - W - 2, 11);
      if (x < W - 2 && y > 0) relax(i, i - W + 2, 11);
      if (x > 0 && y > 1) relax(i, i - 2 * W - 1, 11);
      if (x < W - 1 && y > 1) relax(i, i - 2 * W + 1, 11);
    }
  for (let y = H - 1; y >= 0; y--)
    for (let x = W - 1; x >= 0; x--) {
      const i = y * W + x;
      if (d[i] === 0) continue;
      if (x < W - 1) relax(i, i + 1, 5);
      if (y < H - 1) relax(i, i + W, 5);
      if (x < W - 1 && y < H - 1) relax(i, i + W + 1, 7);
      if (x > 0 && y < H - 1) relax(i, i + W - 1, 7);
      if (x < W - 2 && y < H - 1) relax(i, i + W + 2, 11);
      if (x > 1 && y < H - 1) relax(i, i + W - 2, 11);
      if (x < W - 1 && y < H - 2) relax(i, i + 2 * W + 1, 11);
      if (x > 0 && y < H - 2) relax(i, i + 2 * W - 1, 11);
    }
  for (let i = 0; i < W * H; i++) d[i] = d[i] >= INF ? 1e6 : d[i] / 5;
  return d;
};

/**
 * THE WIDEST WAY THROUGH: the largest corridor width for which some route
 * still runs from `seeds` to a cell `isExit` says is one. A widest-path
 * search by bisection — flood the cells with at least this much clearance
 * and ask whether the two ends are still joined.
 *
 * This is the question "is every route from this door at least this
 * wide?" asked so it has a number for an answer, and it is not the same
 * question as "does a route exist": a channel pinched to three cells is
 * connected, passable, and no use at all to something four across.
 */
export const widestRoute = (W, H, dist, seeds, isExit) => {
  let lo = 0;
  let hi = 40; // wider than any corridor this board can hold
  for (let k = 0; k < 24; k++) {
    const r = (lo + hi) / 2;
    const pass = (i) => dist[i] >= r;
    const seen = flood(W, H, seeds.filter(pass), pass);
    let ok = false;
    for (let i = 0; i < W * H && !ok; i++) if (seen[i] && isExit(i)) ok = true;
    if (ok) lo = r; else hi = r;
  }
  return lo * 2;
};

/** 4-way flood over cells where pass(i) holds, seeded from `seeds` */
export const flood = (W, H, seeds, pass) => {
  const seen = new Uint8Array(W * H);
  const q = [];
  for (const i of seeds)
    if (!seen[i] && pass(i)) {
      seen[i] = 1;
      q.push(i);
    }
  for (let h = 0; h < q.length; h++) {
    const i = q[h];
    const x = i % W;
    const y = (i / W) | 0;
    if (x > 0) { const j = i - 1; if (!seen[j] && pass(j)) { seen[j] = 1; q.push(j); } }
    if (x < W - 1) { const j = i + 1; if (!seen[j] && pass(j)) { seen[j] = 1; q.push(j); } }
    if (y > 0) { const j = i - W; if (!seen[j] && pass(j)) { seen[j] = 1; q.push(j); } }
    if (y < H - 1) { const j = i + W; if (!seen[j] && pass(j)) { seen[j] = 1; q.push(j); } }
  }
  return seen;
};

/** a deterministic 32-bit RNG, so a re-run writes the same map */
export const rng = (seed) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

// ---------- a minimal PNG writer, for eyeballing the result ----------
import { deflateSync } from "node:zlib";

const CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
const crc32 = (buf) => {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};
/** rgb: (x, y) => [r, g, b] */
export const png = (w, h, rgb) => {
  const raw = Buffer.alloc(h * (w * 3 + 1));
  let p = 0;
  for (let y = 0; y < h; y++) {
    raw[p++] = 0;
    for (let x = 0; x < w; x++) {
      const c = rgb(x, y);
      raw[p++] = c[0];
      raw[p++] = c[1];
      raw[p++] = c[2];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
};
