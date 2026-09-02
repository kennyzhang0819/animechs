// Shared geometry for the map generators: a pose-based path builder whose
// only turns are circular arcs, plus the raster helpers the stamps use.

export const TAU = Math.PI * 2;
export const norm = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * A centreline built from a starting pose and a sequence of "steer at that
 * point, then run straight to it" moves. The steer is ALWAYS a circular arc
 * of a named radius, so every bend on the finished road has a radius chosen
 * by hand rather than one that fell out of a polyline corner.
 */
export class Path {
  constructor(x, y, heading) {
    this.pts = [[x, y]];
    this.x = x;
    this.y = y;
    this.h = heading;
    this.step = 0.4;
    /** arclength at each sample, so a stamp can vary its radius along the run */
    this.s = [0];
  }

  #emit(x, y) {
    const [px, py] = this.pts[this.pts.length - 1];
    this.s.push(this.s[this.s.length - 1] + Math.hypot(x - px, y - py));
    this.pts.push([x, y]);
  }

  line(len) {
    const n = Math.max(1, Math.round(len / this.step));
    for (let i = 1; i <= n; i++) {
      const d = (len * i) / n;
      this.#emit(this.x + Math.cos(this.h) * d, this.y + Math.sin(this.h) * d);
    }
    this.x += Math.cos(this.h) * len;
    this.y += Math.sin(this.h) * len;
    return this;
  }

  /** turn by `a` radians on a circle of radius r (a > 0 turns toward +y-of-heading) */
  arc(r, a) {
    const s = Math.sign(a) || 1;
    // centre is 90 degrees off the heading, on the inside of the turn
    const cx = this.x + Math.cos(this.h + (s * Math.PI) / 2) * r;
    const cy = this.y + Math.sin(this.h + (s * Math.PI) / 2) * r;
    const a0 = Math.atan2(this.y - cy, this.x - cx);
    const n = Math.max(1, Math.round((Math.abs(a) * r) / this.step));
    for (let i = 1; i <= n; i++) {
      const t = a0 + (a * i) / n;
      this.#emit(cx + Math.cos(t) * r, cy + Math.sin(t) * r);
    }
    const t = a0 + a;
    this.x = cx + Math.cos(t) * r;
    this.y = cy + Math.sin(t) * r;
    this.h = norm(this.h + a);
    return this;
  }

  /**
   * Head for `target`: one arc of radius r that leaves the pose pointing
   * at the target, then the straight run to it. Both turn directions and
   * both tangent points are tried, the outgoing heading is CHECKED against
   * the target, and the SHORTEST TOTAL — arc plus straight — wins.
   *
   * Shortest total, not smallest turn. A small turn can still curl the
   * pose right past the target and come back at it from the far side:
   * the heading does point at the target, so the check passes, but the
   * road has looped and the pose it leaves behind faces the wrong way for
   * whatever comes next. Adding the straight to the comparison is what
   * makes the obvious answer the winning one.
   */
  toward(tx, ty, r) {
    const cand = [];
    for (const s of [1, -1]) {
      const cx = this.x + Math.cos(this.h + (s * Math.PI) / 2) * r;
      const cy = this.y + Math.sin(this.h + (s * Math.PI) / 2) * r;
      const d = Math.hypot(tx - cx, ty - cy);
      if (d < r + 1e-9) continue; // target inside the turning circle
      const phi = Math.atan2(ty - cy, tx - cx);
      const ac = Math.acos(Math.min(1, r / d));
      const psi0 = Math.atan2(this.y - cy, this.x - cx);
      const run = Math.sqrt(d * d - r * r);
      for (const psiT of [phi + ac, phi - ac]) {
        let a = psiT - psi0;
        a = s > 0 ? ((a % TAU) + TAU) % TAU : -((((-a) % TAU) + TAU) % TAU);
        const px = cx + Math.cos(psiT) * r;
        const py = cy + Math.sin(psiT) * r;
        const out = psiT + (s * Math.PI) / 2;
        if (Math.abs(norm(Math.atan2(ty - py, tx - px) - out)) < 1e-6)
          cand.push({ a, total: Math.abs(a) * r + run });
      }
    }
    if (!cand.length) throw new Error(`no arc of r=${r} aims at (${tx},${ty})`);
    const { a } = cand.sort((p, q) => p.total - q.total)[0];
    if (Math.abs(a) > 1e-6) this.arc(r, a);
    const d = Math.hypot(tx - this.x, ty - this.y);
    if (d > 0.01) this.line(d);
    return this;
  }

  get length() {
    return this.s[this.s.length - 1];
  }

  /** the sharpest heading swing over an 8-cell chord, in degrees */
  sharpest(chord = 8) {
    let worst = 0;
    for (let i = 0; i < this.pts.length; i++) {
      const a = this.pts[i];
      let j = i;
      while (j < this.pts.length && this.s[j] - this.s[i] < chord) j++;
      let k = j;
      while (k < this.pts.length && this.s[k] - this.s[j] < chord) k++;
      if (k >= this.pts.length) break;
      const b = this.pts[j];
      const c = this.pts[k];
      const h1 = Math.atan2(b[1] - a[1], b[0] - a[0]);
      const h2 = Math.atan2(c[1] - b[1], c[0] - b[0]);
      worst = Math.max(worst, Math.abs(norm(h2 - h1)));
    }
    return (worst * 180) / Math.PI;
  }
}

/** a disc of `r` cells stamped through `put(i)` */
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

/**
 * A BLOB: an ellipse whose radius is bent by a few cosine lobes.
 *
 * A disc is the one shape a stamp gets for free and the one shape nothing
 * in nature has, so a map built out of discs reads as a map built out of
 * discs. This is still pure geometry — six numbers and a couple of lobes,
 * all of it deterministic — but `rx != ry` gives an island a long axis,
 * `rot` points it somewhere, and a lobe at frequency 3 or 5 puts headlands
 * and bays on the coast without a single random number.
 *
 * `lobes` are [amplitude, frequency, phase] triples. Amplitudes want to
 * stay well under 1/frequency: past that the radius folds back on itself
 * and the outline crosses over.
 */
export const blob = (cx, cy, rx, ry, rotDeg = 0, lobes = []) => ({
  cx, cy, rx, ry,
  rot: (rotDeg * Math.PI) / 180,
  lobes,
  // the largest the radius factor can get, for the bounding box
  peak: 1 + lobes.reduce((a, [amp]) => a + Math.abs(amp), 0),
});

/** is (x, y) inside the blob, scaled by `k` (k < 1 is its heartland)? */
export const inBlob = (b, x, y, k = 1) => {
  const c = Math.cos(-b.rot);
  const s = Math.sin(-b.rot);
  const dx = x - b.cx;
  const dy = y - b.cy;
  const u = (dx * c - dy * s) / b.rx;
  const v = (dx * s + dy * c) / b.ry;
  const rho = Math.hypot(u, v);
  if (rho === 0) return true;
  const th = Math.atan2(v, u);
  let f = 1;
  for (const [amp, freq, phase] of b.lobes) f += amp * Math.cos(freq * th + phase);
  return rho <= f * k;
};

/** stamp a blob through `put(i, x, y)` */
export const stampBlob = (W, H, b, put) => {
  const rad = Math.max(b.rx, b.ry) * b.peak;
  const x0 = Math.max(0, Math.floor(b.cx - rad));
  const x1 = Math.min(W - 1, Math.ceil(b.cx + rad));
  const y0 = Math.max(0, Math.floor(b.cy - rad));
  const y1 = Math.min(H - 1, Math.ceil(b.cy + rad));
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++)
      if (inBlob(b, x + 0.5, y + 0.5)) put(y * W + x, x, y);
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
 * it is the measure the "21 cells everywhere" rule is written in.
 *
 * A chamfer transform with the 5-7-11 weights, two passes, divided back by
 * 5 — its worst error against true Euclid is about two percent, which on a
 * ten-cell radius is a fifth of a cell.
 *
 * OFF THE BOARD COUNTS AS PASSABLE. The border is not a wall a unit bumps
 * into, it is where the map stops: a lane that runs off the west edge is
 * full width right up to the last column, and seeding the rim as blocked
 * would report the exit itself as the narrowest point on the road.
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
 * This is the question "is every path a unit can take 21 cells wide?"
 * asked so it has a number for an answer, and it is not the same question
 * as "does a route exist": a channel pinched to nine cells by an islet is
 * connected, passable, and completely useless to anything that has to fit
 * down it.
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
