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
// every floor family. The `linocut-*` renders take that direction onto a
// real map — a crop of Quagmire round its core at full detail, and the
// whole 512 board zoomed out — in four palettes. Nothing here is wired
// into the game.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { GUN, draw, drawCore, drawHead, plate } from "../game/turretArt.ts";
import { paintFloor, paintProp, paintWall } from "../game/tiles.ts";
import { HART_TIERS, RHINO_TIERS, STOOP_TIERS, hartMech, rhinoLegged, rhinoMech, rhinoSeg, stoop } from "../game/animalArt.ts";
import { inflateSync } from "node:zlib";

// ONLY=play (or scene, map, ladder, families) renders that section alone
const ONLY = process.env.ONLY ?? null;
const wants = (section) => !ONLY || ONLY === section;

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
const ROCK = 1, FLOOR = 0, SHALLOW = 2, DEEP = 3, PINE = 4;
// A distance field is answered per pixel from the cells within REACH
// tiles rather than stored, so a 512 board costs the same per pixel as
// the 24x14 scene. Nothing asks further than REACH.
const REACH = 4;
function makeBoard(TW, TH, cellFn, famFn = () => "grass") {
  const LW = TW * L, LH = TH * L;
  const cell = new Uint8Array(TW * TH), fam = new Array(TW * TH);
  for (let y = 0; y < TH; y++) for (let x = 0; x < TW; x++) { cell[y * TW + x] = cellFn(x, y); fam[y * TW + x] = famFn(x, y); }
  const at = (x, y) => (x < 0 || y < 0 || x >= TW || y >= TH ? ROCK : cell[y * TW + x]);
  const isRock = (x, y) => at(x, y) === ROCK;
  const isWater = (x, y) => at(x, y) >= SHALLOW && at(x, y) <= DEEP;
  const inside = (x, y) => x >= 0 && y >= 0 && x < TW && y < TH;
  // erosion depth: how many cells in from open ground a rock cell is
  const depth = new Uint8Array(TW * TH);
  for (let y = 0; y < TH; y++) for (let x = 0; x < TW; x++) if (isRock(x, y)) { let d = 0; outer: for (d = 0; d < 6; d++) { for (let dy = -d; dy <= d; dy++) for (let dx = -d; dx <= d; dx++) if (!isRock(x + dx, y + dy)) break outer; } depth[y * TW + x] = d; }
  // distance in tiles from logical px (wx, wy), offset by (ox, oy) tiles, to the nearest cell rect satisfying pred
  const dist = (pred) => (wx, wy, ox = 0, oy = 0) => {
    const px = (wx + 0.5) / L + ox, py = (wy + 0.5) / L + oy;
    const cx = Math.floor(px), cy = Math.floor(py);
    let best = REACH;
    for (let y = cy - REACH; y <= cy + REACH; y++) for (let x = cx - REACH; x <= cx + REACH; x++) {
      if (!pred(x, y)) continue;
      const dx = Math.max(x - px, 0, px - x - 1), dy = Math.max(y - py, 0, py - y - 1);
      const d = Math.hypot(dx, dy); if (d < best) best = d;
    }
    return best;
  };
  const dRock = dist(isRock);
  return {
    TW, TH, LW, LH, cell, fam, at, isRock, isWater, depth,
    dRock,
    dRockShadow: (wx, wy) => dRock(wx, wy, 0.3, -0.45),   // the shadow falls down-left
    dOpen: dist((x, y) => inside(x, y) && !isRock(x, y)),  // inside the rock: how far to daylight
    dLand: dist((x, y) => !isWater(x, y)),
    dWater: dist(isWater),
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
}, (x, y) => (fbm(x * 0.17 + 3, y * 0.17, 16) > 0.56 ? "dirt" : "grass"));
// the things on the scene: [kind, tx, ty]
const HEADS = [["barrage", 3, 0], ["tacker", 9, 1], ["piercer", 14, 0]];
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
  dust: { floor: "#5a5450", rock: "#6e6762", tree: "#5a7f4a" },
  shale: { floor: "#6b6688", rock: "#7e7a9e", tree: "#5f8a58" },
  salt: { floor: "#f0f1f5", rock: "#d6d9e0", tree: "#e2e8ee" },
  ice: { floor: "#cfcff6", rock: "#c2c4e6", tree: "#e2e8ee" },
  peat: { floor: "#3f2a24", rock: "#5a453c", tree: "#8f5aa8" },
};
// a map document's floor group (index / 3) and wall index, as families
const GROUP_FAMILY = ["grass", "stone", "dirt", "sand", "dust", null, null, "moss", "moss", "peat", "shale", "snow", "salt", "ice", "basalt", null, null];
const WALL_FAMILY = ["stone", "stone", "dirt", "dirt", null, "basalt", "basalt", null, "moss", "moss", "shale", "shale", "snow", "snow", "ice", "ice", "salt", "salt", "sand", "sand", "dust", "dust", "stone", "stone"];


// ── the linocut palettes: one carved hand, four inks ───────────────────
// each takes a family base and answers the three tones of the rock, the
// three of the floor, the water and its crests
// `S` is the hill-side shading: `dark` how far the shaded band goes toward
// black (0..1), `light` how far the lit band goes toward the ink's
// highlight; the band's width is the painter's (`band`, below)
const SHADE = { dark: 0.6, light: 1 };
const LINOCUT_PALETTES = {
  /** cool slate rock, the floors as they are */
  slate: (f, S = SHADE) => {
    const rock = mix(shd(f.rock, 0.22), "#5a6270", 0.4);
    return { base: desat(f.floor, 0.1), fl: lit(desat(f.floor, 0.1), 0.2), fd: shd(f.floor, 0.22), rock, rockL: mix(rock, mix(lit(f.rock, 0.18), "#c8ccd4", 0.3), S.light), rockD: shd(rock, S.dark), gouge: lit(rock, 0.1), deep: "#2b3a68", shallow: "#43579a", crest: "#b7c4e2", wet: shd(f.floor, 0.3), tree: shd(f.tree, 0.15) };
  },
  /** burnt umber rock, warm floors, teal water */
  ochre: (f, S = SHADE) => {
    const rock = mix(shd(f.rock, 0.18), "#8a5a34", 0.45);
    const floor = mix(f.floor, "#c9a45a", 0.15);
    return { base: floor, fl: lit(floor, 0.2), fd: shd(floor, 0.22), rock, rockL: mix(rock, mix(lit(f.rock, 0.2), "#e2b876", 0.35), S.light), rockD: shd(mix(rock, "#5a3a20", 0.4), S.dark * 0.92), gouge: lit(rock, 0.1), deep: "#1f4a55", shallow: "#2f6b74", crest: "#cfe6d8", wet: shd(floor, 0.3), tree: mix(f.tree, "#6a7a30", 0.3) };
  },
  /** a night print: near-black rock with bone bands, deep floors */
  night: (f, S = SHADE) => {
    const rock = shd(mix(f.rock, "#2a2d3a", 0.7), 0.3);
    const floor = shd(desat(f.floor, 0.2), 0.42);
    return { base: floor, fl: lit(floor, 0.18), fd: shd(floor, 0.3), rock, rockL: mix(rock, mix(lit(f.rock, 0.3), "#d9d3c2", 0.55), S.light), rockD: shd(rock, S.dark), gouge: lit(rock, 0.12), deep: "#141c38", shallow: "#22305a", crest: "#8fa0d0", wet: shd(floor, 0.35), tree: shd(f.tree, 0.45) };
  },
  /** bone and ink: pale floors, dark ink rock with white bands */
  bone: (f, S = SHADE) => {
    const rock = mix(shd(f.rock, 0.55), "#3a3530", 0.5);
    const floor = lit(desat(f.floor, 0.35), 0.3);
    return { base: floor, fl: lit(floor, 0.25), fd: shd(floor, 0.16), rock, rockL: mix(rock, "#d8d2c4", S.light), rockD: shd(rock, S.dark), gouge: lit(rock, 0.12), deep: "#7a93b6", shallow: "#a6b8d0", crest: "#ffffff", wet: shd(floor, 0.25), tree: mix(f.tree, "#b9b39f", 0.3) };
  },
};

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
      if (B.dWater(wx, wy) < 0.14) c = t.wet;
      const ds = B.dRockShadow(wx, wy); if (ds < 0.9) c = mul(c, 1 - 0.3 * (1 - ds / 0.9));
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
      if (B.dLand(wx, wy) < 0.16) return t.foam;
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
      const dr = B.dRock(wx, wy);
      if (dr < 2.2 && (wx & 1) === 0 && (wy & 1) === 0) { const p = (1 - dr / 2.2) * 0.42; if (hash2(wx >> 1, wy >> 1, 32) < p * p * 2.2) c = t.inkSoft; }
      if (B.dWater(wx, wy) < 0.12 && hash2(wx >> 2, wy >> 2, 33) < 0.6) c = t.ink;
      return c;
    },
    rock(B, t, wx, wy, lx, ly, tx, ty) {
      const d = B.dOpen(wx, wy);
      if (d < 3 / L) return t.ink;                                  // the ink line round the rock
      const k = d - 0.55, f = k - Math.round(k);
      if (k > 0 && Math.abs(f) < 0.09 && d < 3.6) return t.iso;     // a contour every tile inward
      return fbm(wx / 34, wy / 34, 34) > 0.66 ? t.rockL : t.rock;
    },
    water(B, t, kind, wx, wy) {
      if (B.dLand(wx, wy) < 0.12 && ((wx + wy) >> 2) % 2 === 0) return t.foam;
      const s = wy + 5 * fbm(wx / 26, wy / 26, 35), period = kind === DEEP ? 7 : 11;
      if (((s | 0) % period) < 2 && hash2(wx >> 4, (s / period) | 0, 36) < 0.75) return t.ripple;
      return kind === DEEP ? t.deep : t.shallow;
    },
    prop: { split: "soft", outline: "#2e2a26" },
  },

  /** LINOCUT — three tones a family, a carved mass with a wide light band
   *  on its lit edges and a wide dark one on the shaded, a few gouges */
  linocut: {
    tones: (f) => LINOCUT_PALETTES.slate(f),
    band: 6,
    floor(B, t, wx, wy, lx, ly, tx, ty) {
      let c = t.base;
      const h = hash2(tx, ty, 41);
      // a few carved ticks, either diagonal, never a field of them
      if (h < 0.07) { const x0 = 2 + hash2(tx, ty, 42) * 8, y0 = 2 + hash2(tx, ty, 43) * 8, len = 4 + hash2(tx, ty, 44) * 3, flip = hash2(tx, ty, 49) < 0.5 ? 1 : -1; const u = (lx - x0) + flip * (ly - y0), v = (lx - x0) - flip * (ly - y0); if (u >= 0 && u < len * 2 && Math.abs(v) < 1.6) c = h < 0.07 ? t.fl : t.fd; }
      if (B.dWater(wx, wy) < 0.18) c = t.wet;
      return c;
    },
    rock(B, t, wx, wy, lx, ly, tx, ty) {
      const S = !B.isRock(tx, ty + 1), Nn = !B.isRock(tx, ty - 1), E = !B.isRock(tx + 1, ty), W = !B.isRock(tx - 1, ty);
      const NE = !B.isRock(tx + 1, ty - 1), SW = !B.isRock(tx - 1, ty + 1);
      const b = this.band;
      if ((Nn && ly < b) || (E && lx >= L - b) || (NE && lx >= L - b && ly < b)) return t.rockL;
      if ((S && ly >= L - b) || (W && lx < b) || (SW && lx < b && ly >= L - b)) return t.rockD;
      if (hash2(tx, ty, 45) < 0.12) { const x0 = 1 + hash2(tx, ty, 46) * 6, y0 = 1 + hash2(tx, ty, 47) * 6, flip = hash2(tx, ty, 50) < 0.5 ? 1 : -1; const u = (lx - x0) + flip * (ly - y0), v = (lx - x0) - flip * (ly - y0); if (u >= 0 && u < 16 && Math.abs(v) < 1.6) return t.gouge; }
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
      const dr = B.dRock(wx, wy); if (dr < 0.5) c = mul(c, 1 - 0.45 * (1 - dr / 0.5));
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
      if (B.dLand(wx, wy) < 0.2) return t.foam;
      const c = kind === DEEP ? t.deep : t.shallow;
      if (hash2(wy >> 1, wx >> 3, 57) < 0.2 && (wx & 7) < 5 && (wy & 1) === 0) return t.swell;
      return c;
    },
    prop: { split: "soft", outline: null },
  },
};

for (const [name, pal] of Object.entries(LINOCUT_PALETTES)) OPTIONS[`linocut-${name}`] = { ...OPTIONS.linocut, tones: pal };
// the tree tone every option lacks: a pine cell (blocked, shows its floor) is drawn as canopy
const treeTone = (t, f) => t.tree ?? shd(f.tree, 0.1);

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

// ── PNG in: the shipped Foundry heads and plates ───────────────────────
// 8-bit RGB or RGBA, not interlaced — what public/foundry/ holds. A pixel
// under half alpha is nothing
function readPng(file) {
  const buf = readFileSync(file);
  let pos = 8; const idat = [];
  let w = 0, h = 0, type = 6;
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos), kind = buf.toString("ascii", pos + 4, pos + 8), data = buf.subarray(pos + 8, pos + 8 + len);
    if (kind === "IHDR") { w = data.readUInt32BE(0); h = data.readUInt32BE(4); type = data[9]; if (data[8] !== 8 || data[12] !== 0) throw new Error(`${file}: only 8-bit, not interlaced`); }
    else if (kind === "IDAT") idat.push(data);
    pos += 12 + len;
  }
  const bpp = type === 6 ? 4 : type === 2 ? 3 : (() => { throw new Error(`${file}: colour type ${type}`); })();
  const raw = inflateSync(Buffer.concat(idat)), stride = w * bpp;
  const out = Buffer.alloc(stride * h);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], src = y * (stride + 1) + 1, dst = y * stride;
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? out[dst + i - bpp] : 0, b = y > 0 ? out[dst - stride + i] : 0, c = y > 0 && i >= bpp ? out[dst - stride + i - bpp] : 0, x = raw[src + i];
      let v;
      if (f === 0) v = x; else if (f === 1) v = x + a; else if (f === 2) v = x + b; else if (f === 3) v = x + ((a + b) >> 1);
      else { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); v = x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c); }
      out[dst + i] = v & 255;
    }
  }
  const px = new Array(w * h).fill(null);
  for (let i = 0; i < w * h; i++) { const o = i * bpp; if (bpp === 4 && out[o + 3] < 128) continue; px[i] = rgb(out[o], out[o + 1], out[o + 2]); }
  if (w !== h) throw new Error(`${file}: not square`);
  return { n: w, px };
}
const FOUNDRY = "public/foundry";
const foundryCache = new Map();
const foundryArt = (name) => { let a = foundryCache.get(name); if (!a) { a = readPng(`${FOUNDRY}/${name}.png`); foundryCache.set(name, a); } return a; };

// ── art helpers: scale, turn, stamp with alpha ─────────────────────────
/** nearest-neighbour resample of a square Art to m px */
const scaleArt = (art, m) => { const px = new Array(m * m).fill(null); for (let y = 0; y < m; y++) for (let x = 0; x < m; x++) px[y * m + x] = art.px[Math.min(art.n - 1, (y * art.n / m) | 0) * art.n + Math.min(art.n - 1, (x * art.n / m) | 0)]; return { n: m, px }; };
/** the Art turned by `ang` radians about its centre (drawn facing up; +x is ang = pi/2) */
const rotateArt = (art, ang) => {
  const n = art.n, c = (n - 1) / 2, px = new Array(n * n).fill(null), cs = Math.cos(-ang), sn = Math.sin(-ang);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const dx = x - c, dy = y - c; const sx = Math.round(c + dx * cs - dy * sn), sy = Math.round(c + dx * sn + dy * cs); if (sx >= 0 && sy >= 0 && sx < n && sy < n) px[y * n + x] = art.px[sy * n + sx]; }
  return { n, px };
};
/** two Arts of one grid, b over a */
const overArt = (a, b) => ({ n: a.n, px: a.px.map((c, i) => b.px[i] ?? c) });
/** the Art mirrored left to right */
const mirrorArt = (a) => { const n = a.n, px = new Array(n * n); for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) px[y * n + x] = a.px[y * n + (n - 1 - x)]; return { n, px }; };
/** stamp centred at (cx, cy) native px; `shadow` stamps the silhouette as black at that alpha instead */
const stampAt = (out, W, H, art, cx, cy, shadow = 0) => {
  const x0 = Math.round(cx - art.n / 2), y0 = Math.round(cy - art.n / 2);
  for (let y = 0; y < art.n; y++) for (let x = 0; x < art.n; x++) {
    const c = art.px[y * art.n + x]; if (c === null) continue;
    const ox = x0 + x, oy = y0 + y; if (ox < 0 || oy < 0 || ox >= W || oy >= H) continue;
    const o = (oy * W + ox) * 4;
    if (shadow) { out[o] *= 1 - shadow; out[o + 1] *= 1 - shadow; out[o + 2] *= 1 - shadow; continue; }
    const [r, g, b] = hex(c); out[o] = r; out[o + 1] = g; out[o + 2] = b; out[o + 3] = 255;
  }
};

// ── the swarm, off the animal art ──────────────────────────────────────
// A unit's world size is its cell x 0.625 x the tier's scale (docs/unit-art.md);
// a tile is 20 world px and 32 native, so native = world x 1.6
const NATIVE_PER_WORLD = 32 / 20;
const unitPx = (cell, scale) => Math.round(cell * 0.625 * scale * NATIVE_PER_WORLD);
const unitCache = new Map();
/** a ground unit composed facing up at its native size: the mech rig's
 *  belly, hooves and body, or the legged rig's belly, four legs and body */
function unitArt(family, tier) {
  const key = family + tier; let a = unitCache.get(key); if (a) return a;
  if (family === "stoop") { const T = STOOP_TIERS[tier - 1]; a = scaleArt(stoop(T).full, unitPx(T.n + 1, T.scale)); unitCache.set(key, a); return a; }
  const T = (family === "rhino" ? RHINO_TIERS : HART_TIERS)[tier - 1];
  const n = T.n, R = T.R, c = (n - 1) / 2;
  let art;
  if (tier <= 3) {
    const P = family === "rhino" ? rhinoMech(T) : hartMech(T);
    art = overArt(overArt(overArt(P.base, P.leg), mirrorArt(P.leg)), P.body);
  } else {
    const P = rhinoLegged(T);
    const px = P.base.px.slice(); const g = { n, px };
    // four stout legs: mount at the flank, knee out and a little forward, foot planted wide
    const { th, sh } = rhinoSeg(T);
    const tone = ["#3e3a3c", "#66605f", "#8e8684"];
    const stroke = (x0, y0, x1, y1, w) => { const L = Math.hypot(x1 - x0, y1 - y0), nx = -(y1 - y0) / L, ny = (x1 - x0) / L; for (let t = 0; t <= L; t += 0.5) for (let k = -w / 2; k <= w / 2; k += 0.5) { const x = Math.round(x0 + (x1 - x0) * t / L + nx * k), y = Math.round(y0 + (y1 - y0) * t / L + ny * k); if (x >= 0 && y >= 0 && x < n && y < n) px[y * n + x] = k < -w * 0.2 ? tone[2] : k > w * 0.25 ? tone[0] : tone[1]; } };
    for (const s of [-1, 1]) for (const [my, ky, fy] of [[-0.45, -0.75, -0.55], [0.5, 0.75, 0.95]]) {
      const mx = c + s * 0.6 * R, kx = c + s * 1.25 * R, fx = c + s * 1.7 * R;
      stroke(mx, c + my * R, kx, c + ky * R, th); stroke(kx, c + ky * R, fx, c + fy * R, sh);
      const hw = Math.round(R * 0.3), hh = Math.round(R * 0.26);
      for (let y = -hh / 2; y < hh / 2; y++) for (let x = -hw / 2; x < hw / 2; x++) { const X = Math.round(fx + x), Y = Math.round(c + fy * R + y); if (X >= 0 && Y >= 0 && X < n && Y < n) px[Y * n + X] = y < -hh * 0.15 ? "#2c2d38" : tone[0]; }
    }
    art = overArt(g, P.body);
  }
  a = scaleArt(art, unitPx(n + 1, T.scale)); unitCache.set(key, a); return a;
}

// ── the original hill-side shading, as the renderer draws it ───────────
// Mindustry's two buffers on top of any terrain: the rim shadow on the
// floor (0.71 black at the wall's edge, gone half a cell out) and the
// darkness inside the hill (an erosion ramp: nothing on the rim cell,
// 0.375 one cell in, then 0.625, 0.875, solid). The darkness is drawn
// over the ground units and the structures too, so it goes on after the
// heads and the walkers and before the flyers, exactly as in the game
function originalShading(out, W, H, B, native = 2) {
  for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
    const wx = (px / native) | 0, wy = (py / native) | 0, tx = (wx / L) | 0, ty = (wy / L) | 0;
    const k = B.cell[ty * B.TW + tx];
    let f = 1;
    if (k === ROCK) { const d = B.depth[ty * B.TW + tx]; if (d > 0) f = 1 - Math.min((d + 0.5) / 4, 1); }
    else { const dr = B.dRock(wx, wy); if (dr < 0.5) f = 1 - 0.71 * (1 - dr / 0.5); }
    if (f === 1) continue;
    const o = (py * W + px) * 4; out[o] *= f; out[o + 1] *= f; out[o + 2] *= f;
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
    const k = B.cell[ty * B.TW + tx], fm = B.fam[ty * B.TW + tx] === "dirt" ? 1 : 0;
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
      else if (k === FLOOR) { const dr = B.dRock(wx, wy); if (dr < 0.5) c = mul(c, 1 - 0.71 * (1 - dr / 0.5)); }
      put(wx, wy, c);
    }
  }
  const props = { boulder: "boulder0", pine: "pine", shrub: "shrubs" };
  for (const [kind, cx, cy] of PROPS) {
    const src = paintProp(props[kind]); const S = kind === "shrub" ? 32 : 48; const Ls = S / 2;
    for (let y = 0; y < Ls; y++) for (let x = 0; x < Ls; x++) { const o = ((y * 2) * S + x * 2) * 4; if (!src[o + 3]) continue; const ox = Math.round(cx * L - Ls / 2) + x, oy = Math.round(cy * L - Ls / 2) + y; if (ox < 0 || oy < 0 || ox >= B.LW || oy >= B.LH) continue; put(ox, oy, rgb(src[o], src[o + 1], src[o + 2])); }
  }
  return { px: out, W: B.LW, H: B.LH };
}

// paint a board in an option. `rockFam` names one family for every rock
// cell (the scene: one mass is one stone) or null to take each cell's
// own (a map: the wall is the floor's wall). `step` samples every step-th
// logical px, for a whole map zoomed out
function paintOption(opt, B, { rockFam = null, props = [], step = 1 } = {}) {
  const W = Math.floor(B.LW / step), H = Math.floor(B.LH / step);
  const out = new Uint8ClampedArray(W * H * 4);
  const tones = new Map();
  const tonesFor = (f, rf) => { const key = f + "/" + rf; let t = tones.get(key); if (!t) { t = opt.tones({ ...FAMILY[f], rock: FAMILY[rf].rock }); tones.set(key, t); } return t; };
  // one logical px per output px at step 1; past that, the step-th px is
  // not picked but the 2x2 samples across it averaged, the way the game's
  // mipmaps show a map zoomed out
  const paintAt = (wx, wy) => {
    const tx = (wx / L) | 0, ty = (wy / L) | 0, lx = wx % L, ly = wy % L;
    const k = B.cell[ty * B.TW + tx], f = B.fam[ty * B.TW + tx];
    const t = tonesFor(f, rockFam ?? f);
    if (k === ROCK) return opt.rock(B, t, wx, wy, lx, ly, tx, ty);
    if (k === FLOOR) return opt.floor(B, t, wx, wy, lx, ly, tx, ty);
    if (k === PINE) { const tt = treeTone(t, FAMILY[f]); return hash2(tx, ty, 71) < 0.5 && Math.hypot(lx - 8, ly - 8) < 5 ? lit(tt, 0.14) : tt; }
    return opt.water(B, t, k, wx, wy);
  };
  const offs = step === 1 ? [[0, 0]] : [[step >> 2, step >> 2], [(step * 3) >> 2, step >> 2], [step >> 2, (step * 3) >> 2], [(step * 3) >> 2, (step * 3) >> 2]];
  for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
    let r = 0, g = 0, b = 0;
    for (const [ox, oy] of offs) { const [cr, cg, cb] = hex(paintAt(px * step + ox, py * step + oy)); r += cr; g += cg; b += cb; }
    const o = (py * W + px) * 4, n = offs.length; out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n; out[o + 3] = 255;
  }
  const rf = rockFam ?? "grass";
  for (const [kind, cx, cy] of props) stampProp(out, B, kind, cx, cy, { rock: FAMILY[rf].rock, tree: FAMILY[rf].tree }, opt.prop);
  return { px: out, W, H };
}

// ── compose at native size: terrain x2, then the plates, heads and core ─
const upscale = (src, w, h, s) => { const out = new Uint8ClampedArray(w * s * h * s * 4); for (let y = 0; y < h * s; y++) for (let x = 0; x < w * s; x++) { const si = (((y / s) | 0) * w + ((x / s) | 0)) * 4, o = (y * w * s + x) * 4; out[o] = src[si]; out[o + 1] = src[si + 1]; out[o + 2] = src[si + 2]; out[o + 3] = src[si + 3]; } return out; };
const stampArt = (out, W, art, x0, y0, f = 1) => { for (let y = 0; y < art.n; y++) for (let x = 0; x < art.n; x++) { const c = art.px[y * art.n + x]; if (c === null) continue; const [r, g, b] = hex(c); const o = ((y0 + y) * W + x0 + x) * 4; out[o] = r * f; out[o + 1] = g * f; out[o + 2] = b * f; out[o + 3] = 255; } };
const plates = {};
const plateArt = (size) => (plates[size] ??= draw(N * size, (P) => plate(P, 0, 0, N * size, N * size, 3 * size, GUN, 3)));
const coreArt = drawCore();
function compose(terrain, { heads = [], core = null, zoom = 2 } = {}) {
  const W = terrain.W * 2, H = terrain.H * 2;
  const out = upscale(terrain.px, terrain.W, terrain.H, 2);
  for (const [kind, tx, ty] of heads) {
    const head = drawHead(kind); const size = head.n / N;
    stampArt(out, W, plateArt(size), tx * N, ty * N, 0.65);
    stampArt(out, W, head, tx * N, ty * N);
  }
  if (core) stampArt(out, W, coreArt, core[0] * N, core[1] * N);
  return zoom === 1 ? { px: out, W, H } : { px: upscale(out, W, H, zoom), W: W * zoom, H: H * zoom };
}
const write = (file, img) => { writeFileSync(file, png(img.px, img.W, img.H)); console.log("wrote", file, img.W + "x" + img.H); };

mkdirSync("docs/terrain-concepts", { recursive: true });
const SCENE_OPTS = ["mesa", "chart", "linocut", "strata"];
if (wants("scene")) write("docs/terrain-concepts/current.png", compose(paintCurrent(SCENE), { heads: HEADS, core: CORE }));
if (wants("scene")) for (const name of SCENE_OPTS) write(`docs/terrain-concepts/${name}.png`, compose(paintOption(OPTIONS[name], SCENE, { rockFam: "grass", props: PROPS }), { heads: HEADS, core: CORE }));

// the family strip: every option on every family, a 3x3 board a card —
// rock across the top, floor in the middle, water along the bottom
if (wants("families")) {
  const fams = ["grass", "dirt", "sand", "stone", "snow", "moss", "basalt"];
  const MINI = makeBoard(3, 3, (x, y) => (y === 0 ? ROCK : y === 1 ? FLOOR : x === 2 ? DEEP : SHALLOW));
  const SW = MINI.LW, SH = MINI.LH, GAP = 4;
  const W = fams.length * (SW + GAP) + GAP, H = SCENE_OPTS.length * (SH + GAP) + GAP;
  const strip = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < strip.length; i += 4) { strip[i] = 24; strip[i + 1] = 24; strip[i + 2] = 28; strip[i + 3] = 255; }
  SCENE_OPTS.forEach((name, row) => fams.forEach((f, col) => {
    const mini = makeBoard(3, 3, (x, y) => (y === 0 ? ROCK : y === 1 ? FLOOR : x === 2 ? DEEP : SHALLOW), () => f);
    const card = paintOption(OPTIONS[name], mini).px;
    for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) { const si = (y * SW + x) * 4, o = ((GAP + row * (SH + GAP) + y) * W + GAP + col * (SW + GAP) + x) * 4; strip[o] = card[si]; strip[o + 1] = card[si + 1]; strip[o + 2] = card[si + 2]; strip[o + 3] = 255; }
  }));
  write("docs/terrain-concepts/families.png", { px: upscale(strip, W, H, 3), W: W * 3, H: H * 3 });
}

// ── linocut on a real map ──────────────────────────────────────────────
// Quagmire (public/maps/quagmire.json): a crop round the core at full
// detail with a few heads set on the rock beside the lane, and the whole
// 512 board zoomed out, in every palette
{
  const doc = JSON.parse(readFileSync("public/maps/quagmire.json", "utf8"));
  const MW = doc.w, MH = doc.floor.length / doc.w;
  const WALL_PINE = 4, WALL_DEEP = 7;
  const cellAt = (x, y) => {
    const i = y * MW + x, g = (doc.floor[i] / 3) | 0;
    if (doc.wall[i] === WALL_DEEP || g === 6 || g === 16) return DEEP;
    if (g === 5 || g === 15) return SHALLOW;
    if (doc.wall[i] === WALL_PINE) return PINE;
    return doc.blocked[i] ? ROCK : FLOOR;
  };
  const famAt = (x, y) => { const i = y * MW + x; return doc.blocked[i] && doc.wall[i] !== WALL_PINE && doc.wall[i] !== WALL_DEEP ? WALL_FAMILY[doc.wall[i]] ?? "stone" : GROUP_FAMILY[(doc.floor[i] / 3) | 0] ?? "grass"; };
  // the crop: the 96x56 window with the most in it — rock about half,
  // some water, some forest, more than one floor family
  const CW = 96, CH = 56;
  let cx0 = 0, cy0 = 0, bestScore = -1;
  for (let y0 = 0; y0 + CH <= MH; y0 += 8) for (let x0 = 0; x0 + CW <= MW; x0 += 8) {
    let rock = 0, water = 0, pine = 0; const fams = new Set();
    for (let y = y0; y < y0 + CH; y += 2) for (let x = x0; x < x0 + CW; x += 2) { const k = cellAt(x, y); if (k === ROCK) rock++; else if (k === PINE) pine++; else if (k >= SHALLOW) water++; else fams.add(famAt(x, y)); }
    const n = (CW * CH) / 4, rockF = rock / n, waterF = water / n, pineF = pine / n;
    const score = (rockF > 0.35 && rockF < 0.6 ? 1 : 0) + Math.min(waterF, 0.12) / 0.12 + Math.min(pineF, 0.05) / 0.05 + Math.min(fams.size, 3) / 3;
    if (score > bestScore) { bestScore = score; cx0 = x0; cy0 = y0; }
  }
  console.log(`crop at (${cx0}, ${cy0}), score ${bestScore.toFixed(2)}`);
  const CROP = makeBoard(CW, CH, (x, y) => cellAt(cx0 + x, cy0 + y), (x, y) => famAt(cx0 + x, cy0 + y));
  // a few heads on rock beside open ground: the first footprints that fit, spread out
  const heads = [];
  const fits = (x, y, s) => { for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++) if (!CROP.isRock(x + dx, y + dy) || CROP.depth[(y + dy) * CW + x + dx] > 2) return false; let edge = false; for (let dy = -1; dy <= s; dy++) for (let dx = -1; dx <= s; dx++) if (!CROP.isRock(x + dx, y + dy)) edge = true; return edge; };
  const wanted = [["barrage", 3], ["piercer", 2], ["tacker", 1], ["tacker", 1], ["autocannon", 2], ["tacker", 1], ["lobber", 1], ["airburst", 2]];
  for (const [kind, s] of wanted) {
    let placed = false;
    for (let tries = 0; tries < 4000 && !placed; tries++) {
      const x = 4 + Math.floor(hash2(tries, s, 77) * (CW - 12)), y = 4 + Math.floor(hash2(s, tries, 78) * (CH - 12));
      if (!fits(x, y, s)) continue;
      if (heads.some(([, hx, hy, hs]) => Math.abs(hx - x) < hs + s + 3 && Math.abs(hy - y) < hs + s + 3)) continue;
      heads.push([kind, x, y, s]); placed = true;
    }
  }
  const inCrop = doc.base.x >= cx0 && doc.base.x + 5 <= cx0 + CW && doc.base.y >= cy0 && doc.base.y + 5 <= cy0 + CH;
  const core = inCrop ? [doc.base.x - cx0, doc.base.y - cy0] : null;
  const pineProps = [];
  if (wants("map")) for (const name of Object.keys(LINOCUT_PALETTES)) {
    const opt = OPTIONS[`linocut-${name}`];
    write(`docs/terrain-concepts/linocut-${name}.png`, compose(paintOption(opt, SCENE, { rockFam: "grass", props: PROPS }), { heads: HEADS, core: CORE }));
    write(`docs/terrain-concepts/linocut-${name}-crop.png`, compose(paintOption(opt, CROP, { props: pineProps }), { heads: heads.map(([k, x, y]) => [k, x, y]), core, zoom: 1 }));
  }
  // THE SHADE LADDER: linocut in ochre with the hill-side band at four
  // widths and strengths, from the six-pixel band above down to a
  // two-pixel edge, on a 64x36 window of the crop and on the whole map
  const LADDER = [
    { name: "6", band: 6, dark: 0.6, light: 1 },
    { name: "4", band: 4, dark: 0.45, light: 0.75 },
    { name: "3", band: 3, dark: 0.32, light: 0.55 },
    { name: "2", band: 2, dark: 0.2, light: 0.4 },
  ];
  const SW2 = 64, SH2 = 36, sx0 = cx0 + 20, sy0 = cy0 + 10;
  const SUB = makeBoard(SW2, SH2, (x, y) => cellAt(sx0 + x, sy0 + y), (x, y) => famAt(sx0 + x, sy0 + y));
  const subHeads = heads.filter(([, x, y, sz]) => x - 20 >= 0 && y - 10 >= 0 && x - 20 + sz <= SW2 && y - 10 + sz <= SH2).map(([k, x, y]) => [k, x - 20, y - 10]);
  const subCore = core && core[0] - 20 >= 0 && core[1] - 10 >= 0 && core[0] - 20 + 5 <= SW2 && core[1] - 10 + 5 <= SH2 ? [core[0] - 20, core[1] - 10] : null;
  const MAP = makeBoard(MW, MH, cellAt, famAt);
  if (wants("map")) for (const name of Object.keys(LINOCUT_PALETTES)) write(`docs/terrain-concepts/linocut-${name}-map.png`, paintOption(OPTIONS[`linocut-${name}`], MAP, { step: 4 }));
  if (wants("ladder")) for (const step of LADDER) {
    const opt = { ...OPTIONS.linocut, band: step.band, tones: (f) => LINOCUT_PALETTES.ochre(f, { dark: step.dark, light: step.light }) };
    write(`docs/terrain-concepts/linocut-ochre-shade${step.name}.png`, compose(paintOption(opt, SUB), { heads: subHeads, core: subCore, zoom: 1 }));
    write(`docs/terrain-concepts/linocut-ochre-shade${step.name}-map.png`, paintOption(opt, MAP, { step: 4 }));
  }

  // ── THE PLAY RENDER: linocut ochre with the shipped heads, the swarm
  // on the lane and the game's own hill shading ───────────────────────
  if (wants("play")) {
    const opt = OPTIONS["linocut-ochre"];
    const terrain = paintOption(opt, SUB);
    const W = SUB.LW * 2, H = SUB.LH * 2;
    const out = upscale(terrain.px, SUB.LW, SUB.LH, 2);
    // the core, in map coordinates, is what everything faces
    const coreX = (doc.base.x + 2.5 - sx0) * N, coreY = (doc.base.y + 2.5 - sy0) * N;
    // the swarm: on open dry ground, the big ones clear of the rock, each
    // heading for the core
    const walkers = [["rhino", 1, 6], ["rhino", 2, 3], ["rhino", 3, 2], ["rhino", 4, 1], ["hart", 2, 2], ["hart", 3, 1]];
    const flyers = [["stoop", 2, 2], ["stoop", 3, 1]];
    const placed = [];
    const clear = (x, y, r) => placed.every(([px, py, pr]) => Math.hypot(px - x, py - y) > r + pr);
    const tryPlace = (fam, tier, count, air) => {
      const art = unitArt(fam, tier), r = art.n * 0.34;
      let n = 0;
      for (let tries = 0; tries < 6000 && n < count; tries++) {
        const tx = hash2(tries, tier * 7 + n, 91) * SW2, ty = hash2(tier * 7 + n, tries, 92) * SH2;
        const k = SUB.at(tx | 0, ty | 0);
        if (!air && k !== FLOOR) continue;
        if (air && (k >= SHALLOW && k <= DEEP)) continue;
        const wx = (tx * L) | 0, wy = (ty * L) | 0;
        if (!air && SUB.dRock(wx, wy) * N < r * 0.8) continue;
        const x = tx * N, y = ty * N;
        if (x < r || y < r || x > W - r || y > H - r || !clear(x, y, r)) continue;
        placed.push([x, y, r, fam, tier, air]); n++;
      }
    };
    for (const [fam, tier, count] of walkers) tryPlace(fam, tier, count, false);
    for (const [fam, tier, count] of flyers) tryPlace(fam, tier, count, true);
    // the heads, the shipped PNGs on their plates, each turned to its nearest walker
    const SIZE = { tacker: 1, lobber: 1, torch: 1, coil: 1, autocannon: 2, airburst: 2, piercer: 2, douser: 2, tether: 2, hive: 2, cleaver: 3, barrage: 3, deluge: 3, whirl: 3, repeater: 4, furnace: 4, railhead: 4 };
    for (const [kind, tx, ty] of subHeads) {
      const size = SIZE[kind], cx = (tx + size / 2) * N, cy = (ty + size / 2) * N;
      stampAt(out, W, H, foundryArt(`base-${size}`), cx, cy);
      let best = null, bd = Infinity;
      for (const u of placed) { if (u[5]) continue; const d = Math.hypot(u[0] - cx, u[1] - cy); if (d < bd) { bd = d; best = u; } }
      // the file faces +x; the turn is the heading to the target
      const ang = best ? Math.atan2(best[1] - cy, best[0] - cx) : 0;
      stampAt(out, W, H, rotateArt(foundryArt(kind), ang), cx, cy);
    }
    if (subCore) stampAt(out, W, H, foundryArt("core"), (subCore[0] + 2.5) * N, (subCore[1] + 2.5) * N);
    // the walkers, facing the core (the art faces up, so the heading is turned a quarter)
    for (const [x, y, , fam, tier, air] of placed) if (!air) stampAt(out, W, H, rotateArt(unitArt(fam, tier), Math.atan2(coreY - y, coreX - x) + Math.PI / 2), x, y);
    // then the game's shading over the lot, and the flyers above it with their drop shadows
    originalShading(out, W, H, SUB);
    for (const [x, y, , fam, tier, air] of placed) if (air) { const a = rotateArt(unitArt(fam, tier), Math.atan2(coreY - y, coreX - x) + Math.PI / 2); stampAt(out, W, H, a, x + 6 * NATIVE_PER_WORLD, y + 6 * NATIVE_PER_WORLD, 0.22); stampAt(out, W, H, a, x, y); }
    write("docs/terrain-concepts/linocut-ochre-play.png", { px: out, W, H });
    // and the same, without the shading, for the difference
    const out2 = upscale(terrain.px, SUB.LW, SUB.LH, 2);
    for (const [kind, tx, ty] of subHeads) { const size = SIZE[kind], cx = (tx + size / 2) * N, cy = (ty + size / 2) * N; stampAt(out2, W, H, foundryArt(`base-${size}`), cx, cy); let best = null, bd = Infinity; for (const u of placed) { if (u[5]) continue; const d = Math.hypot(u[0] - cx, u[1] - cy); if (d < bd) { bd = d; best = u; } } stampAt(out2, W, H, rotateArt(foundryArt(kind), best ? Math.atan2(best[1] - cy, best[0] - cx) : 0), cx, cy); }
    if (subCore) stampAt(out2, W, H, foundryArt("core"), (subCore[0] + 2.5) * N, (subCore[1] + 2.5) * N);
    for (const [x, y, , fam, tier, air] of placed) if (!air) stampAt(out2, W, H, rotateArt(unitArt(fam, tier), Math.atan2(coreY - y, coreX - x) + Math.PI / 2), x, y);
    for (const [x, y, , fam, tier, air] of placed) if (air) { const a = rotateArt(unitArt(fam, tier), Math.atan2(coreY - y, coreX - x) + Math.PI / 2); stampAt(out2, W, H, a, x + 6 * NATIVE_PER_WORLD, y + 6 * NATIVE_PER_WORLD, 0.22); stampAt(out2, W, H, a, x, y); }
    write("docs/terrain-concepts/linocut-ochre-play-unshaded.png", { px: out2, W, H });
  }
}
