// THE DARTBACK'S STANCE ON PAPER: every frog tier walking right, at three
// points of its gait, with the legs laid out by the sim's own numbers.
//
//   node --experimental-transform-types --import ./scripts/ts-hooks.mjs scripts/frog-gait.mjs [out.png]
//
// The gait below is Sim.updateLegs re-run headlessly: the only way to see
// what a LegSpec change does to a silhouette without playing a wave.
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { FROG_TIERS, frogLegged } from "../game/familyArt.ts";
import { UNIT_STATS as UNITS } from "../game/levels.ts";
import { UNIT_SPRITE } from "../game/constants.ts";

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
  for (let y = 0; y < h; y++) rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

// ── the gait, ported from Sim.updateLegs ───────────────────────────────
const TAU = Math.PI * 2;
const keepOver = (k, t) => (t === 1 ? k : Math.pow(k, t));
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
function solveIK(a, b, ex, ey, side) {
  const len = Math.hypot(ex, ey);
  if (len < 1e-4) return { x: 0, y: a };
  const ax = ex / len, ay = ey / len;
  const px = side ? -ay : ay, py = side ? ax : -ax;
  const along = clamp((len + (a * a - b * b) / len) / 2, 0, a);
  const out2 = Math.sqrt(Math.max(0, a * a - along * along));
  return { x: ax * along + px * out2, y: ay * along + py * out2 };
}
function clampLen(dx, dy, min, max) {
  const len = Math.hypot(dx, dy);
  const k = len < 1e-6 ? 1 : len < min ? min / len : len > max ? max / len : 1;
  return { x: dx * k, y: dy * k };
}
/** walk a body right at `speed` px/s for `secs`, returning the leg state */
function walk(L, speed, secs, dt = 1 / 60) {
  const n = L.count;
  const trig = [];
  for (let k = 0; k < n; k++) { const c = (TAU / n) * k + Math.PI / n; trig.push(Math.cos(c), Math.sin(c)); }
  const fx = [], fy = [], jx = [], jy = [], stage = [];
  let x = 0, y = 0, t = 0, ox = 0, oy = 0;
  for (let k = 0; k < n; k++) {
    const ca = trig[k * 2], sa = trig[k * 2 + 1];
    const bx = x + ca * L.baseOffset, by = y + sa * L.baseOffset;
    jx[k] = bx + ca * (L.length / 2); jy[k] = by + sa * (L.length / 2);
    fx[k] = bx + ca * L.length; fy[k] = by + sa * L.length;
    stage[k] = 0;
  }
  const div = Math.max((n / L.groupSize) | 0, 2);
  const space = (L.length / 1.6 / (div / 2)) * L.moveSpace;
  const ticks = dt * 60;
  const ease = 1 - keepOver(0.9, ticks);
  const knee = 1 - keepOver(1 - L.speed / 4, ticks);
  const minJ = (L.minLength * L.length) / 2, maxJ = (L.maxLength * L.length) / 2;
  const minF = L.minLength * L.length, maxF = L.maxLength * L.length;
  for (let s = 0; s < Math.round(secs / dt); s++) {
    const moved = speed * dt;
    x += moved;
    t += moved;
    const trns = space * 0.85 * L.forwardScl;
    ox += (trns - ox) * ease; oy += (0 - oy) * ease;
    for (let k = 0; k < n; k++) {
      const ca = trig[k * 2], sa = trig[k * 2 + 1];
      const bx = x + ca * L.baseOffset, by = y + sa * L.baseOffset;
      let v = clampLen(jx[k] - bx, jy[k] - by, minJ, maxJ); jx[k] = bx + v.x; jy[k] = by + v.y;
      v = clampLen(fx[k] - bx, fy[k] - by, minF, maxF); fx[k] = bx + v.x; fy[k] = by + v.y;
      const stageF = (t + k * L.pairOffset) / space;
      const frac = stageF - Math.floor(stageF);
      const step = k % div === Math.floor(stageF) % div;
      stage[k] = frac;
      const back = Math.abs(k + 0.5 - n / 2) <= 0.501;
      const side = (k < n / 2) !== back;
      const ik = solveIK(L.length / 2, L.length / 2, fx[k] - bx, fy[k] - by, side);
      const jdx = bx + ik.x, jdy = by + ik.y;
      if (step) {
        const dx = bx + ca * L.length * L.lengthScl + ox;
        const dy = by + sa * L.length * L.lengthScl + oy;
        const a = 1 - keepOver(1 - frac, ticks);
        fx[k] += (dx - fx[k]) * a; fy[k] += (dy - fy[k]) * a;
        const a2 = 1 - keepOver(1 - frac / 2, ticks);
        jx[k] += (jdx - jx[k]) * a2; jy[k] += (jdy - jy[k]) * a2;
      }
      jx[k] += (jdx - jx[k]) * knee; jy[k] += (jdy - jy[k]) * knee;
      v = clampLen(jx[k] - bx, jy[k] - by, minJ, maxJ); jx[k] = bx + v.x; jy[k] = by + v.y;
      v = clampLen(fx[k] - bx, fy[k] - by, minF, maxF); fx[k] = bx + v.x; fy[k] = by + v.y;
    }
  }
  return { x, y, fx, fy, jx, jy, trig };
}

// ── the sheet ──────────────────────────────────────────────────────────
const PX = 3;                       // screen px a world px
const W_PER_NATIVE = UNIT_SPRITE / 64;
const GROUND = [22, 24, 30];
const put = (buf, w, h, x, y, c, a = 255) => {
  x |= 0; y |= 0;
  if (x < 0 || y < 0 || x >= w || y >= h) return;
  const o = (y * w + x) * 4, f = a / 255;
  buf[o] = Math.round(buf[o] * (1 - f) + c[0] * f);
  buf[o + 1] = Math.round(buf[o + 1] * (1 - f) + c[1] * f);
  buf[o + 2] = Math.round(buf[o + 2] * (1 - f) + c[2] * f);
  buf[o + 3] = 255;
};
const hex = (c) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];

/**
 * One quad the way renderer.push lays it down: a `wpx` x `hpx` world-px
 * rect centred on (cx, cy) and turned by `rot`, sampling `src` (an Art or
 * a Rect). `up` rotates the source a quarter turn, which is what packing a
 * drawing made facing up into a cell facing +x does.
 */
function quad(buf, W, H, src, cx, cy, wpx, hpx, rot, up, ox, oy) {
  const sw = src.n ?? src.w, sh = src.n ?? src.h;
  const co = Math.cos(rot), si = Math.sin(rot);
  const half = Math.hypot(wpx, hpx) / 2 + 2;
  const px0 = Math.floor((cx - half) * PX), px1 = Math.ceil((cx + half) * PX);
  const py0 = Math.floor((cy - half) * PX), py1 = Math.ceil((cy + half) * PX);
  for (let py = py0; py <= py1; py++) for (let px = px0; px <= px1; px++) {
    const wx = px / PX - cx, wy = py / PX - cy;
    const lx = wx * co + wy * si, ly = -wx * si + wy * co;   // into quad space
    let u = lx / wpx + 0.5, v = ly / hpx + 0.5;
    if (u < 0 || u >= 1 || v < 0 || v >= 1) continue;
    if (up) { const t = u; u = v; v = 1 - t; }               // drawn facing up
    const sx = Math.min(sw - 1, (u * sw) | 0), sy = Math.min(sh - 1, (v * sh) | 0);
    const c = src.px[sy * sw + sx];
    if (!c) continue;
    put(buf, W, H, px + ox, py + oy, hex(c));
  }
}

const TIERS = [2, 3, 4, 5];
const PHASES = [0.6, 0.85, 1.1];
const PAD = 12;
const cells = TIERS.map((t) => {
  const T = FROG_TIERS[t - 1];
  const L = UNITS[`dartback${t}`].legs;
  const span = (L.baseOffset + L.length * L.maxLength) * 2 + T.n * W_PER_NATIVE;
  return Math.ceil(span * PX) + PAD;
});
const CW = Math.max(...cells);
const W = CW * PHASES.length + PAD;
const H = cells.reduce((a, b) => a + b, 0) + PAD;
const buf = Buffer.alloc(W * H * 4);
for (let i = 0; i < W * H; i++) { buf[i * 4] = GROUND[0]; buf[i * 4 + 1] = GROUND[1]; buf[i * 4 + 2] = GROUND[2]; buf[i * 4 + 3] = 255; }

let rowY = PAD / 2;
TIERS.forEach((t, ti) => {
  const T = FROG_TIERS[t - 1];
  const A = frogLegged(T);
  const L = UNITS[`dartback${t}`].legs;
  const sz = T.n * W_PER_NATIVE;
  const sm = A.small * W_PER_NATIVE;
  const stroke = T.th * W_PER_NATIVE, bstroke = T.sh * W_PER_NATIVE;
  PHASES.forEach((secs, pi) => {
    const g = walk(L, UNITS[`dartback${t}`].speed, secs);
    const ox = Math.round(PAD / 2 + pi * CW + cells[ti] / 2 - g.x * PX);
    const oy = Math.round(rowY + cells[ti] / 2);
    const n = L.count;
    for (let j = n - 1; j >= 0; j--) {
      const k = j % 2 === 0 ? j / 2 : n - 1 - ((j / 2) | 0);
      const ca = g.trig[k * 2], sa = g.trig[k * 2 + 1];
      const mx = g.x + ca * L.baseOffset, my = g.y + sa * L.baseOffset;
      quad(buf, W, H, A.foot, g.fx[k], g.fy[k], sm, sm, Math.atan2(g.fy[k] - my, g.fx[k] - mx), true, ox, oy);
      const mid = { x: (mx + g.jx[k]) / 2, y: (my + g.jy[k]) / 2 };
      quad(buf, W, H, A.leg, mid.x, mid.y, Math.hypot(g.jx[k] - mx, g.jy[k] - my), stroke,
        Math.atan2(g.jy[k] - my, g.jx[k] - mx), false, ox, oy);
      const dx = g.jx[k] - g.fx[k], dy = g.jy[k] - g.fy[k];
      const d = Math.hypot(dx, dy) || 1, ext = Math.abs(L.extension);
      const ex = g.jx[k] + (dx / d) * ext, ey = g.jy[k] + (dy / d) * ext;
      quad(buf, W, H, A.legBase, (ex + g.fx[k]) / 2, (ey + g.fy[k]) / 2, Math.hypot(g.fx[k] - ex, g.fy[k] - ey),
        bstroke, Math.atan2(g.fy[k] - ey, g.fx[k] - ex), false, ox, oy);
      if (A.joint) quad(buf, W, H, A.joint, g.jx[k], g.jy[k], sm, sm, 0, true, ox, oy);
    }
    if (A.baseJoint && t >= 4) for (let k = 0; k < n; k++) {
      quad(buf, W, H, A.baseJoint, g.x + g.trig[k * 2] * L.baseOffset, g.y + g.trig[k * 2 + 1] * L.baseOffset, sm, sm, 0, true, ox, oy);
    }
    if (A.base && t < 4) quad(buf, W, H, A.base, g.x, g.y, sz, sz, 0, true, ox, oy);
    quad(buf, W, H, A.body, g.x, g.y, sz, sz, 0, true, ox, oy);
  });
  rowY += cells[ti];
});

const out = process.argv[2] ?? "docs/frog-gait.png";
mkdirSync(out.replace(/\/[^/]+$/, ""), { recursive: true });
writeFileSync(out, png(buf, W, H));
console.log(`${out}  ${W}x${H}`);
