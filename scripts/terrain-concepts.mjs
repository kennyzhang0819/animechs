// THE TERRAIN CONCEPTS: one scene, painted five ways, into docs/terrain-concepts/.
//
//   node --experimental-strip-types scripts/terrain-concepts.mjs
//
// The scene is a 24x14 board: a rock mass along the top with a ragged
// edge, a lump and an island in the lane, a lake with a shore, two floor
// families — and on it the things the terrain has to sit under: three
// Foundry heads on the rock (towers stand on rock), the core on the
// floor, boulders, pines. `current.png` is the same scene through the
// game's own painters (game/tiles.ts) with the hill darkness and the rim
// shadow the renderer adds, as the baseline; the rest are the directions
// in docs/terrain-directions.md, and `families.png` is every direction on
// every floor family. Nothing here is wired into the game.
import { mkdirSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { GUN, draw, drawCore, drawHead, plate } from "../game/turretArt.ts";
import { paintFloor, paintProp, paintWall } from "../game/tiles.ts";

// ── png ────────────────────────────────────────────────────────────────
const crcTable = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const body = Buffer.concat([Buffer.from(type, "ascii"), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body)); return Buffer.concat([len, body, crc]); };
const png = (rgba, w, h) => { const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6; const raw = Buffer.alloc((w * 4 + 1) * h); for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; Buffer.from(rgba.buffer, rgba.byteOffset + y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1); } return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]); };

// ── colour ─────────────────────────────────────────────────────────────
const hex = (c) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
const rgb = (r, g, b) => "#" + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
const mix = (a, b, t) => { const A = hex(a), B = hex(b); return rgb(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t); };
const lit = (c, t) => mix(c, "#ffffff", t);
const shd = (c, t) => mix(c, "#000000", t);
const mul = (c, f) => { const [r, g, b] = hex(c); return rgb(r * f, g * f, b * f); };
const desat = (c, t) => { const [r, g, b] = hex(c); const l = 0.3 * r + 0.59 * g + 0.11 * b; return rgb(r + (l - r) * t, g + (l - g) * t, b + (l - b) * t); };

// ── noise ──────────────────────────────────────────────────────────────
const hash2 = (x, y, s = 0) => { let h = (x * 374761393 + y * 668265263 + s * 982451653) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const smooth = (t) => t * t * (3 - 2 * t);
const vnoise = (x, y, s = 0) => { const x0 = Math.floor(x), y0 = Math.floor(y), fx = smooth(x - x0), fy = smooth(y - y0); const a = hash2(x0, y0, s), b = hash2(x0 + 1, y0, s), c = hash2(x0, y0 + 1, s), d = hash2(x0 + 1, y0 + 1, s); return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy; };
const fbm = (x, y, s = 0) => 0.55 * vnoise(x, y, s) + 0.3 * vnoise(x * 2.1 + 7, y * 2.1 + 3, s + 1) + 0.15 * vnoise(x * 4.3 + 2, y * 4.3 + 9, s + 2);

// ── a board: cells, and the fields the painters read ───────────────────
const L = 16, N = 32;                              // logical px a tile, native px a tile
const ROCK = 1, FLOOR = 0, SHALLOW = 2, DEEP = 3;
function makeBoard(TW, TH, cellFn, famFn = () => 0) {
  const LW = TW * L, LH = TH * L;
  const cell = new Uint8Array(TW * TH), fam = new Uint8Array(TW * TH);
  for (let y = 0; y < TH; y++) for (let x = 0; x < TW; x++) { cell[y * TW + x] = cellFn(x, y); fam[y * TW + x] = famFn(x, y); }
  const at = (x, y) => (x < 0 || y < 0 || x >= TW || y >= TH ? ROCK : cell[y * TW + x]);
  const isRock = (x, y) => at(x, y) === ROCK;
  const isWater = (x, y) => at(x, y) >= SHALLOW;
  // erosion depth: how many cells in from open ground a rock cell is
  const depth = new Uint8Array(TW * TH);
  for (let y = 0; y < TH; y++) for (let x = 0; x < TW; x++) if (isRock(x, y)) { let d = 0; outer: for (d = 0; d < 6; d++) { for (let dy = -d; dy <= d; dy++) for (let dx = -d; dx <= d; dx++) if (!isRock(x + dx, y + dy)) break outer; } depth[y * TW + x] = d; }
  // distance in tiles, per logical px, to the nearest cell rect that satisfies pred
  const field = (pred, off = [0, 0]) => {
    const out = new Float32Array(LW * LH);
    const rects = [];
    for (let y = -1; y <= TH; y++) for (let x = -1; x <= TW; x++) if (pred(x, y)) rects.push([x, y]);
    for (let py = 0; py < LH; py++) for (let px = 0; px < LW; px++) {
      const wx = (px + 0.5) / L + off[0], wy = (py + 0.5) / L + off[1];
      let best = 9;
      for (const [rx, ry] of rects) { const dx = Math.max(rx - wx, 0, wx - rx - 1), dy = Math.max(ry - wy, 0, wy - ry - 1); const d = Math.hypot(dx, dy); if (d < best) best = d; }
      out[py * LW + px] = best;
    }
    return out;
  };
  return {
    TW, TH, LW, LH, cell, fam, at, isRock, isWater, depth,
    dRock: field(isRock),
    dRockShadow: field(isRock, [0.3, -0.45]),                 // the shadow falls down-left
    dOpen: field((x, y) => !isRock(x, y) && x >= 0 && y >= 0 && x < TW && y < TH),   // inside the rock: how far to daylight
    dLand: field((x, y) => !isWater(x, y)),
    dWater: field(isWater),
  };
}

// ── the scene ──────────────────────────────────────────────────────────
const SCENE = makeBoard(24, 14, (x, y) => {
  let rock = false;
  const edge = 2.6 + 1.9 * fbm(x * 0.33, 0.7, 11) + 0.6 * vnoise(x * 0.9, 1.3, 12);
  if (y < edge) rock = true;
  if (Math.hypot(x + 0.5 - 4.5, y + 0.5 - 11.2) < 2.1 + 0.8 * fbm(x * 0.5, y * 0.5, 13)) rock = true;
  if (Math.hypot(x + 0.5 - 15.5, y + 0.5 - 7.2) < 1.5 + 0.9 * fbm(x * 0.6, y * 0.6, 14)) rock = true;
  for (const [x0, y0, w, h] of [[3, 0, 3, 3], [9, 0, 1, 3], [14, 0, 2, 2]]) if (x >= x0 && x < x0 + w && y >= y0 && y < y0 + h) rock = true;   // the heads' ground
  const wd = Math.hypot((x + 0.5 - 20.6) * 0.9, y + 0.5 - 11.4) + 1.1 * fbm(x * 0.45, y * 0.45, 15) - 0.5;
  return wd < 2.3 ? DEEP : wd < 3.9 ? SHALLOW : rock ? ROCK : FLOOR;
}, (x, y) => (fbm(x * 0.17 + 3, y * 0.17, 16) > 0.56 ? 1 : 0));
// the things on the scene: [kind, tx, ty]
const HEADS = [["ripple", 3, 0], ["duo", 9, 1], ["lancer", 14, 0]];
const CORE = [8, 8];
const PROPS = [["boulder", 1.4, 7.2], ["boulder", 18.6, 4.3], ["pine", 20, 0.6], ["pine", 0.4, 1.1], ["shrub", 12.3, 12.1]];

// ── the family bases every option derives its tones from ───────────────
// The rock is a step lighter and warmer than the turrets' gunmetal
// (#4d4e58 / #7b7b7b) on purpose: a head has to stand out on it
const FAMILY = {
  grass: { floor: "#6f9a58", rock: "#9a958a", tree: "#4f8a44" },
  dirt: { floor: "#9c7454", rock: "#96755a", tree: "#4f8a44" },
  sand: { floor: "#d6bb8e", rock: "#cdb088", tree: "#6f9a58" },
  stone: { floor: "#a19c94", rock: "#8c867e", tree: "#5f8a58" },
  snow: { floor: "#e9edf2", rock: "#cdd6e0", tree: "#e2e8ee" },
  moss: { floor: "#6f4a7a", rock: "#86679a", tree: "#8f5aa8" },
  basalt: { floor: "#4e4a49", rock: "#6a6461", tree: "#5a7f4a" },
};
const SCENE_FAMS = ["grass", "dirt"];

// ── the options ────────────────────────────────────────────────────────
// each paints one logical pixel of board B in tones t; (wx, wy) logical
// px on the board, (lx, ly) px inside the tile, (tx, ty) the tile
const OPTIONS = {
  /** MESA — the rock is a plateau the player builds on: a lit flat top,
   *  a drawn cliff face along its south edge, a shadow on the lane */
  mesa: {
    tones: (f) => ({
      base: f.floor, fl: lit(f.floor, 0.08), fd: shd(f.floor, 0.1),
      top: lit(f.rock, 0.16), topL: lit(f.rock, 0.28), topD: lit(f.rock, 0.04),
      cliff: shd(f.rock, 0.4), cliffD: shd(f.rock, 0.56), lip: lit(f.rock, 0.42), rimD: shd(f.rock, 0.22),
      deep: "#3d5190", shallow: "#5a72b4", wave: "#8298cc", foam: "#a9b8dc", wet: shd(f.floor, 0.22),
    }),
    floor(B, t, wx, wy, lx, ly, tx, ty) {
      const n = fbm(wx / 38, wy / 38, 21);
      let c = n > 0.62 ? t.fl : n < 0.36 ? t.fd : t.base;
      if (hash2(tx, ty, 22) < 0.3) { const cx = 3 + hash2(tx, ty, 23) * 9, cy = 3 + hash2(tx, ty, 24) * 9; if (Math.hypot((lx + 0.5 - cx) / 2.2, (ly + 0.5 - cy) / 1.4) < 1) c = t.fl; }
      if (B.dWater[wy * B.LW + wx] < 0.14) c = t.wet;
      const ds = B.dRockShadow[wy * B.LW + wx]; if (ds < 0.9) c = mul(c, 1 - 0.3 * (1 - ds / 0.9));
      return c;
    },
    rock(B, t, wx, wy, lx, ly, tx, ty) {
      const S = !B.isRock(tx, ty + 1), Nn = !B.isRock(tx, ty - 1), E = !B.isRock(tx + 1, ty), W = !B.isRock(tx - 1, ty);
      // THE CLIFF: the bottom half of a rock tile whose south side is open
      // is its face, in vertical strata, with a lit lip along the top
      if (S && ly >= 8) { if (ly === 8) return t.lip; return ((((wx / 3) | 0) + ty) % 3) === 0 ? t.cliffD : t.cliff; }
      if (Nn && ly < 2) return t.lip;
      if (E && lx >= 14) return t.lip;
      if (W && lx < 2) return t.rimD;
      const n = fbm(wx / 30, wy / 30, 25);
      let c = n > 0.63 ? t.topL : n < 0.33 ? t.topD : t.top;
      if (hash2(tx, ty, 26) < 0.14) { const x0 = 3 + hash2(tx, ty, 27) * 6, y0 = 3 + hash2(tx, ty, 28) * 6; const d = Math.abs((lx - x0) - (ly - y0)); if (d < 2 && lx >= x0 && lx < x0 + 7 && ly >= y0 && ly < y0 + 7) c = t.rimD; }
      return c;
    },
    water(B, t, kind, wx, wy) {
      if (B.dLand[wy * B.LW + wx] < 0.16) return t.foam;
      const c = kind === DEEP ? t.deep : t.shallow;
      if (hash2(wy >> 1, wx >> 3, 29) < 0.12 && (wx & 7) < 4 && (wy & 1) === 0) return t.wave;
      return c;
    },
    prop: { split: "hard", outline: null },
  },

  /** CHART — a drawn map: paper floors, an ink line round the rock,
   *  contour lines inside it, stipple where the ground meets the cliff */
  chart: {
    tones: (f) => {
      const paper = desat(lit(f.floor, 0.2), 0.35), ink = "#2e2a26", kraft = desat(mix(f.rock, "#b39c7a", 0.3), 0.15);
      return { base: paper, fl: desat(lit(f.floor, 0.28), 0.35), ink, inkSoft: mix(paper, ink, 0.45), rock: kraft, iso: shd(kraft, 0.28), rockL: lit(kraft, 0.1), deep: "#7d95b8", shallow: "#9fb3cf", ripple: "#5f7699", foam: ink };
    },
    floor(B, t, wx, wy, lx, ly, tx, ty) {
      let c = fbm(wx / 50, wy / 50, 31) > 0.6 ? t.fl : t.base;
      const dr = B.dRock[wy * B.LW + wx];
      if (dr < 2.2 && (wx & 1) === 0 && (wy & 1) === 0) { const p = (1 - dr / 2.2) * 0.42; if (hash2(wx >> 1, wy >> 1, 32) < p * p * 2.2) c = t.inkSoft; }
      if (B.dWater[wy * B.LW + wx] < 0.12 && hash2(wx >> 2, wy >> 2, 33) < 0.6) c = t.ink;
      return c;
    },
    rock(B, t, wx, wy, lx, ly, tx, ty) {
      const d = B.dOpen[wy * B.LW + wx];
      if (d < 3 / L) return t.ink;                                  // the ink line round the rock
      const k = d - 0.55, f = k - Math.round(k);
      if (k > 0 && Math.abs(f) < 0.09 && d < 3.6) return t.iso;     // a contour every tile inward
      return fbm(wx / 34, wy / 34, 34) > 0.66 ? t.rockL : t.rock;
    },
    water(B, t, kind, wx, wy) {
      if (B.dLand[wy * B.LW + wx] < 0.12 && ((wx + wy) >> 2) % 2 === 0) return t.foam;
      const s = wy + 5 * fbm(wx / 26, wy / 26, 35), period = kind === DEEP ? 7 : 11;
      if (((s | 0) % period) < 2 && hash2(wx >> 4, (s / period) | 0, 36) < 0.75) return t.ripple;
      return kind === DEEP ? t.deep : t.shallow;
    },
    prop: { split: "soft", outline: "#2e2a26" },
  },

  /** LINOCUT — three tones a family, a carved mass with a wide light band
   *  on its lit edges and a wide dark one on the shaded, a few gouges */
  linocut: {
    tones: (f) => {
      const rock = mix(shd(f.rock, 0.2), "#6a6058", 0.3);
      return { base: f.floor, fl: lit(f.floor, 0.2), fd: shd(f.floor, 0.22), rock, rockL: lit(f.rock, 0.16), rockD: shd(f.rock, 0.62), gouge: lit(rock, 0.12), deep: "#2f3f70", shallow: "#465a9e", crest: "#b7c4e2", wet: shd(f.floor, 0.3) };
    },
    floor(B, t, wx, wy, lx, ly, tx, ty) {
      let c = t.base;
      const h = hash2(tx, ty, 41);
      // a few carved ticks, either diagonal, never a field of them
      if (h < 0.11) { const x0 = 2 + hash2(tx, ty, 42) * 8, y0 = 2 + hash2(tx, ty, 43) * 8, len = 4 + hash2(tx, ty, 44) * 3, flip = hash2(tx, ty, 49) < 0.5 ? 1 : -1; const u = (lx - x0) + flip * (ly - y0), v = (lx - x0) - flip * (ly - y0); if (u >= 0 && u < len * 2 && Math.abs(v) < 1.6) c = h < 0.07 ? t.fl : t.fd; }
      if (B.dWater[wy * B.LW + wx] < 0.18) c = t.wet;
      return c;
    },
    rock(B, t, wx, wy, lx, ly, tx, ty) {
      const S = !B.isRock(tx, ty + 1), Nn = !B.isRock(tx, ty - 1), E = !B.isRock(tx + 1, ty), W = !B.isRock(tx - 1, ty);
      const NE = !B.isRock(tx + 1, ty - 1), SW = !B.isRock(tx - 1, ty + 1);
      const b = 4;
      if ((Nn && ly < b) || (E && lx >= L - b) || (NE && lx >= L - b && ly < b)) return t.rockL;
      if ((S && ly >= L - b) || (W && lx < b) || (SW && lx < b && ly >= L - b)) return t.rockD;
      if (hash2(tx, ty, 45) < 0.2) { const x0 = 1 + hash2(tx, ty, 46) * 6, y0 = 1 + hash2(tx, ty, 47) * 6, flip = hash2(tx, ty, 50) < 0.5 ? 1 : -1; const u = (lx - x0) + flip * (ly - y0), v = (lx - x0) - flip * (ly - y0); if (u >= 0 && u < 16 && Math.abs(v) < 1.6) return t.gouge; }
      return t.rock;
    },
    water(B, t, kind, wx, wy) {
      const c = kind === DEEP ? t.deep : t.shallow;
      if (hash2(wx >> 4, wy >> 3, 48) < (kind === DEEP ? 0.35 : 0.2)) { const x0 = wx & 15, y0 = wy & 7; if (y0 === 4 && x0 >= 2 && x0 < 12) return t.crest; if (x0 >= 10 && x0 < 12 && y0 >= 2 && y0 < 4) return t.crest; }
      return c;
    },
    prop: { split: "hard", outline: null },
  },

  /** STRATA — the evolution: the rock lit inside with sedimentary bands
   *  running across it, floors as slow two-tone blotches, the rim shadow kept */
  strata: {
    tones: (f) => ({
      base: f.floor, fl: lit(f.floor, 0.07), fd: shd(f.floor, 0.09),
      rock: lit(f.rock, 0.06), rockL: lit(f.rock, 0.16), rockD: shd(f.rock, 0.1), rimL: lit(f.rock, 0.34), rimD: shd(f.rock, 0.36),
      deep: "#3f5398", shallow: "#5b71b8", swell: "#7f94cf", foam: "#93a6d6",
    }),
    floor(B, t, wx, wy, lx, ly, tx, ty) {
      const n = fbm(wx / 26, wy / 26, 51);
      let c = n > 0.6 ? t.fl : n < 0.34 ? t.fd : t.base;
      if (hash2(tx, ty, 52) < 0.08) { const cx = 4 + hash2(tx, ty, 53) * 8, cy = 4 + hash2(tx, ty, 54) * 8; if (Math.hypot(lx + 0.5 - cx, (ly + 0.5 - cy) / 0.8) < 1.7) c = ly + 0.5 < cy ? t.fl : t.fd; }
      const dr = B.dRock[wy * B.LW + wx]; if (dr < 0.5) c = mul(c, 1 - 0.45 * (1 - dr / 0.5));
      return c;
    },
    rock(B, t, wx, wy, lx, ly, tx, ty) {
      const Nn = !B.isRock(tx, ty - 1), E = !B.isRock(tx + 1, ty), S = !B.isRock(tx, ty + 1), W = !B.isRock(tx - 1, ty);
      if ((Nn && ly < 2) || (E && lx >= 14)) return t.rimL;
      if ((S && ly >= 14) || (W && lx < 2)) return t.rimD;
      const s = wy + 11 * fbm(wx / 34, wy / 34, 55) + 2 * vnoise(wx / 7, wy / 7, 56);
      const band = ((s / 7) | 0) % 5;
      let c = band === 0 ? t.rockL : band === 3 ? t.rockD : t.rock;
      if (B.depth[ty * B.TW + tx] >= 3) c = mul(c, 0.88);
      return c;
    },
    water(B, t, kind, wx, wy) {
      if (B.dLand[wy * B.LW + wx] < 0.2) return t.foam;
      const c = kind === DEEP ? t.deep : t.shallow;
      if (hash2(wy >> 1, wx >> 3, 57) < 0.2 && (wx & 7) < 5 && (wy & 1) === 0) return t.swell;
      return c;
    },
    prop: { split: "soft", outline: null },
  },
};

// ── props: a boulder, a pine, a shrub, in the option's tones ───────────
function stampProp(out, B, kind, cx, cy, tones, style) {
  const R = kind === "boulder" ? 11 : kind === "pine" ? 13 : 7;
  const mid = kind === "boulder" ? tones.rock : tones.tree, li = lit(mid, style.split === "hard" ? 0.32 : 0.2), da = shd(mid, style.split === "hard" ? 0.4 : 0.28);
  const S = R * 2 + 3, px = new Uint8Array(S * S);
  const disc = (x0, y0, r, sq = 1) => { for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (Math.hypot((x + 0.5 - x0) / r, (y + 0.5 - y0) / (r * sq)) <= 1) px[y * S + x] = 1; };
  const c = S / 2;
  if (kind === "boulder") disc(c, c, R * 0.85, 0.85);
  else if (kind === "pine") { for (let i = 0; i < 6; i++) disc(c + Math.cos(i * 1.047) * R * 0.5, c + Math.sin(i * 1.047) * R * 0.5, R * 0.42); disc(c, c, R * 0.55); }
  else for (let i = 0; i < 4; i++) disc(c + Math.cos(i * 1.57 + 0.4) * R * 0.5, c + Math.sin(i * 1.57 + 0.4) * R * 0.5, R * 0.5, 0.85);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    if (!px[y * S + x]) continue;
    const t = (x - y) / S;
    let col = t > 0.16 ? li : t < -0.2 ? da : mid;
    if (style.outline) { let edge = false; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [2, 0], [-2, 0], [0, 2], [0, -2]]) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= S || ny >= S || !px[ny * S + nx]) edge = true; } if (edge) col = style.outline; }
    if (kind === "pine" && Math.hypot(x + 0.5 - c, y + 0.5 - c) < 1.6) col = da;
    const ox = Math.round(cx * L - c) + x, oy = Math.round(cy * L - c) + y;
    if (ox < 0 || oy < 0 || ox >= B.LW || oy >= B.LH) continue;
    const [r, g, b] = hex(col); const o = (oy * B.LW + ox) * 4; out[o] = r; out[o + 1] = g; out[o + 2] = b; out[o + 3] = 255;
  }
}

// ── the current look, through the game's own painters ──────────────────
function paintCurrent(B) {
  const out = new Uint8ClampedArray(B.LW * B.LH * 4);
  const put = (px, py, c) => { const [r, g, b] = hex(c); const o = (py * B.LW + px) * 4; out[o] = r; out[o + 1] = g; out[o + 2] = b; out[o + 3] = 255; };
  const floorKind = ["grass", "dirt"], wallKind = ["stone", "dirt"];
  const tiles = new Map();
  const tileOf = (key, fn) => { let t = tiles.get(key); if (!t) { t = fn(); tiles.set(key, t); } return t; };
  for (let ty = 0; ty < B.TH; ty++) for (let tx = 0; tx < B.TW; tx++) {
    const k = B.cell[ty * B.TW + tx], fm = B.fam[ty * B.TW + tx];
    const v = hash2(tx, ty, 61) < 0.5 ? 0 : 1;
    let src;
    if (k === ROCK) src = tileOf(`w${fm}${v}`, () => paintWall(wallKind[fm], v));
    else if (k === FLOOR) src = tileOf(`f${fm}${v}`, () => paintFloor(floorKind[fm], v));
    for (let ly = 0; ly < L; ly++) for (let lx = 0; lx < L; lx++) {
      const wx = tx * L + lx, wy = ty * L + ly;
      let c;
      if (src) { const o = ((ly * 2) * N + lx * 2) * 4; c = rgb(src[o], src[o + 1], src[o + 2]); }
      else { // the water shader, roughly: two blues with a horizontal swell
        const s = wy + 2.5 * Math.sin(wx / 4.5 + wy / 2.2);
        c = k === DEEP ? (((s | 0) % 5) === 0 ? "#4b5fa8" : "#3f5397") : (((s | 0) % 5) === 0 ? "#6478bd" : "#5769ae");
      }
      if (k === ROCK) { const d = B.depth[ty * B.TW + tx]; if (d > 0) c = mul(c, 1 - Math.min((d + 0.5) / 4, 1)); }
      else if (k === FLOOR) { const dr = B.dRock[wy * B.LW + wx]; if (dr < 0.5) c = mul(c, 1 - 0.71 * (1 - dr / 0.5)); }
      put(wx, wy, c);
    }
  }
  const props = { boulder: "boulder0", pine: "pine", shrub: "shrubs" };
  for (const [kind, cx, cy] of PROPS) {
    const src = paintProp(props[kind]); const S = kind === "shrub" ? 32 : 48; const Ls = S / 2;
    for (let y = 0; y < Ls; y++) for (let x = 0; x < Ls; x++) { const o = ((y * 2) * S + x * 2) * 4; if (!src[o + 3]) continue; const ox = Math.round(cx * L - Ls / 2) + x, oy = Math.round(cy * L - Ls / 2) + y; if (ox < 0 || oy < 0 || ox >= B.LW || oy >= B.LH) continue; put(ox, oy, rgb(src[o], src[o + 1], src[o + 2])); }
  }
  return out;
}

// paint a board in an option: `fams` names the family per fam index, the
// rock is always the first family's (one mass is one stone)
function paintOption(opt, B, fams, props = []) {
  const out = new Uint8ClampedArray(B.LW * B.LH * 4);
  const tones = fams.map((f) => opt.tones({ ...FAMILY[f], rock: FAMILY[fams[0]].rock }));
  for (let ty = 0; ty < B.TH; ty++) for (let tx = 0; tx < B.TW; tx++) {
    const k = B.cell[ty * B.TW + tx], t = tones[B.fam[ty * B.TW + tx]];
    for (let ly = 0; ly < L; ly++) for (let lx = 0; lx < L; lx++) {
      const wx = tx * L + lx, wy = ty * L + ly;
      const c = k === ROCK ? opt.rock(B, t, wx, wy, lx, ly, tx, ty) : k === FLOOR ? opt.floor(B, t, wx, wy, lx, ly, tx, ty) : opt.water(B, t, k, wx, wy);
      const [r, g, b] = hex(c); const o = (wy * B.LW + wx) * 4; out[o] = r; out[o + 1] = g; out[o + 2] = b; out[o + 3] = 255;
    }
  }
  for (const [kind, cx, cy] of props) stampProp(out, B, kind, cx, cy, { rock: FAMILY[fams[0]].rock, tree: FAMILY[fams[0]].tree }, opt.prop);
  return out;
}

// ── compose at native size: terrain x2, then the plates, heads and core ─
const upscale = (src, w, h, s) => { const out = new Uint8ClampedArray(w * s * h * s * 4); for (let y = 0; y < h * s; y++) for (let x = 0; x < w * s; x++) { const si = (((y / s) | 0) * w + ((x / s) | 0)) * 4, o = (y * w * s + x) * 4; out[o] = src[si]; out[o + 1] = src[si + 1]; out[o + 2] = src[si + 2]; out[o + 3] = src[si + 3]; } return out; };
const stampArt = (out, W, art, x0, y0, f = 1) => { for (let y = 0; y < art.n; y++) for (let x = 0; x < art.n; x++) { const c = art.px[y * art.n + x]; if (c === null) continue; const [r, g, b] = hex(c); const o = ((y0 + y) * W + x0 + x) * 4; out[o] = r * f; out[o + 1] = g * f; out[o + 2] = b * f; out[o + 3] = 255; } };
const plates = {};
const plateArt = (size) => (plates[size] ??= draw(N * size, (P) => plate(P, 0, 0, N * size, N * size, 3 * size, GUN, 3)));
const core = drawCore();
function compose(B, terrain) {
  const W = B.LW * 2, H = B.LH * 2;
  const out = upscale(terrain, B.LW, B.LH, 2);
  for (const [kind, tx, ty] of HEADS) {
    const head = drawHead(kind); const size = head.n / N;
    stampArt(out, W, plateArt(size), tx * N, ty * N, 0.65);
    stampArt(out, W, head, tx * N, ty * N);
  }
  stampArt(out, W, core, CORE[0] * N, CORE[1] * N);
  return upscale(out, W, H, 2);   // and once more for the eye: 64 px a tile
}

mkdirSync("docs/terrain-concepts", { recursive: true });
const jobs = [["current", () => paintCurrent(SCENE)], ...Object.entries(OPTIONS).map(([k, o]) => [k, () => paintOption(o, SCENE, SCENE_FAMS, PROPS)])];
for (const [name, fn] of jobs) {
  const file = `docs/terrain-concepts/${name}.png`;
  writeFileSync(file, png(compose(SCENE, fn()), SCENE.LW * 4, SCENE.LH * 4), );
  console.log("wrote", file);
}

// the family strip: every option on every family, a 3x3 board a card —
// rock across the top, floor in the middle, water along the bottom
{
  const fams = Object.keys(FAMILY), names = Object.keys(OPTIONS);
  const MINI = makeBoard(3, 3, (x, y) => (y === 0 ? ROCK : y === 1 ? FLOOR : x === 2 ? DEEP : SHALLOW));
  const SW = MINI.LW, SH = MINI.LH, GAP = 4;
  const W = fams.length * (SW + GAP) + GAP, H = names.length * (SH + GAP) + GAP;
  const strip = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < strip.length; i += 4) { strip[i] = 24; strip[i + 1] = 24; strip[i + 2] = 28; strip[i + 3] = 255; }
  names.forEach((name, row) => fams.forEach((f, col) => {
    const card = paintOption(OPTIONS[name], MINI, [f]);
    for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) { const si = (y * SW + x) * 4, o = ((GAP + row * (SH + GAP) + y) * W + GAP + col * (SW + GAP) + x) * 4; strip[o] = card[si]; strip[o + 1] = card[si + 1]; strip[o + 2] = card[si + 2]; strip[o + 3] = 255; }
  }));
  writeFileSync("docs/terrain-concepts/families.png", png(upscale(strip, W, H, 3), W * 3, H * 3));
  console.log("wrote docs/terrain-concepts/families.png");
}
