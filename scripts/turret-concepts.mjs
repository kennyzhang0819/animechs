// FOUNDRY, THE TURRET ROSTER: seventeen heads drawn the way Mindustry's
// turret tops are drawn, as pixel art at native size (32 px a tile: 32,
// 64, 96, 128 for a 1x1 to a 4x4), to be checked at the size they draw at.
//
//   node scripts/turret-concepts.mjs        → docs/turret-concepts/mill-<kind>.png
//
// What "the way Mindustry's are drawn" means, read off duo.png, lancer.png,
// ripple.png and spectre.png rather than assumed:
//   - NO outline, NO rim, NO inset border plate. Four or five flat colours
//     butted against each other; the ground under the head is the stock
//     base plate (blocks/turrets/bases/block-N.png), which shows around a
//     four-pixel margin on every side.
//   - Every material is a PAIR: its dark on the left half of the sprite,
//     its light on the right. That is the whole of the lighting. A part is
//     drawn once in a material and the shading is applied after, so the
//     shape is symmetric by construction and the shade never is.
//   - Cuts are at 45 degrees (octagons, diamonds) or straight; nothing is
//     thinner than two pixels on the smallest grid it draws on.
//   - The body is gunmetal (#4d4e58 / #7b7b7b, the ripple's and the
//     spectre's), the barrels steel (#c1c3d4 / #f4f4f4, the lancer's),
//     a bore is #2c2d38, and the ACCENT is the colour of what the turret
//     throws, in Mindustry's own ammo pairs where it has one.
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";

// ── materials ──────────────────────────────────────────────────────────
const GUN = ["#4d4e58", "#7b7b7b"];
const STEEL = ["#c1c3d4", "#f4f4f4"];
const BORE = ["#2c2d38", "#2c2d38"];
const ACCENT = {
  bullet: ["#8f665b", "#c9a58f"],   // copper — the duo's own body
  shell: ["#d99f6b", "#f3e979"],    // brass — the cyclone's and foreshadow's
  flame: ["#ec7458", "#ff9c5a"],    // ember — the spectre's and meltdown's
  beam: ["#6974c4", "#8aa3f4"],     // the lancer's blue
  water: ["#3f4c96", "#5c6dbb"],    // Liquids.water, darker than the beam
  field: ["#4fa88a", "#8fe0b8"],    // mint, the one hue no stock turret uses
  missile: ["#da6b68", "#feb380"],  // the ripple's and swarmer's salmon
};

// ── the engine: shapes in unit coordinates, materials shaded after ─────
function grid(n) {
  const mat = new Array(n * n).fill(null);   // a material pair per pixel
  let erasing = false;
  const u = (v) => Math.round(v * n);
  const set = (x, y, m) => { if (x >= 0 && y >= 0 && x < n && y < n) mat[y * n + x] = erasing ? null : m; };
  const pen = {
    box(x0, y0, x1, y1, m) { for (let y = u(y0); y < u(y1); y++) for (let x = u(x0); x < u(x1); x++) set(x, y, m); return pen; },
    /** a box with its corners cut at 45 degrees by c */
    octa(x0, y0, x1, y1, c, m) {
      const [X0, Y0, X1, Y1, C] = [u(x0), u(y0), u(x1), u(y1), u(c)];
      for (let y = Y0; y < Y1; y++) for (let x = X0; x < X1; x++) {
        const dx = Math.min(x - X0, X1 - 1 - x), dy = Math.min(y - Y0, Y1 - 1 - y);
        if (dx + dy >= C) set(x, y, m);
      }
      return pen;
    },
    disc(cx, cy, r, m) {
      const [cxp, cyp, pr] = [u(cx), u(cy), u(r)]; const rr = (pr + 0.5) ** 2;
      for (let y = -pr; y <= pr; y++) { const half = Math.floor(Math.sqrt(rr - y * y)); for (let x = -half; x <= half; x++) set(cxp + x, cyp + y, m); }
      return pen;
    },
    ring(cx, cy, r, w, m) {
      const [cxp, cyp, pr] = [u(cx), u(cy), u(r)]; const inner = pr - w;
      for (let y = -pr; y <= pr; y++) for (let x = -pr; x <= pr; x++) { const d = Math.hypot(x, y); if (d <= pr + 0.5 && d >= inner - 0.5) set(cxp + x, cyp + y, m); }
      return pen;
    },
    /** a diamond: a square turned 45 degrees */
    diamond(cx, cy, r, m) {
      const [cxp, cyp, pr] = [u(cx), u(cy), u(r)];
      for (let y = -pr; y <= pr; y++) for (let x = -pr; x <= pr; x++) if (Math.abs(x) + Math.abs(y) <= pr) set(cxp + x, cyp + y, m);
      return pen;
    },
    erase(fn) { erasing = true; fn(pen); erasing = false; return pen; },
  };
  return { mat, pen };
}
/** mirror the left half over the right, then shade: dark left, light right */
function finish(mat, n) {
  for (let y = 0; y < n; y++) for (let x = 0; x < n >> 1; x++) mat[y * n + (n - 1 - x)] = mat[y * n + x];
  return mat.map((m, i) => (m === null ? null : m[(i % n) < n / 2 ? 0 : 1]));
}

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

// ── the roster ─────────────────────────────────────────────────────────
// Every head faces up, sits inside a 0.125 margin, and is drawn left half
// and centre only; finish() mirrors and shades. `A` is the accent pair.
const HEADS = {
  // 1x1 ──────────────────────────────────────────────────────────────
  duo(p, A) {                                            // two barrels, a copper block
    p.octa(0.14, 0.4, 0.86, 0.88, 0.08, A);
    p.box(0.4, 0.44, 0.6, 0.84, GUN);                     // the breech between them
    p.box(0.2, 0.12, 0.38, 0.5, STEEL);
  },
  hail(p, A) {                                           // one mortar mouth on a turntable
    p.disc(0.5, 0.52, 0.36, GUN);
    p.ring(0.5, 0.44, 0.22, 3, A);
    p.disc(0.5, 0.44, 0.13, BORE);
    p.box(0.3, 0.76, 0.7, 0.88, A);
  },
  scorch(p, A) {                                         // a flat nozzle, a tank behind
    p.octa(0.2, 0.44, 0.8, 0.88, 0.08, GUN);
    p.box(0.14, 0.12, 0.86, 0.3, STEEL);                  // the wide nozzle
    p.box(0.2, 0.3, 0.8, 0.44, A);                        // the burner
    p.disc(0.5, 0.7, 0.13, A);                            // the tank
  },
  arc(p, A) {                                            // a coil and a prong
    p.disc(0.5, 0.58, 0.32, GUN);
    p.ring(0.5, 0.58, 0.24, 3, A);
    p.disc(0.5, 0.58, 0.1, STEEL);
    p.box(0.22, 0.12, 0.36, 0.44, STEEL); p.box(0.22, 0.12, 0.36, 0.2, A);   // the prongs
  },
  // 2x2 ──────────────────────────────────────────────────────────────
  salvo(p, A) {                                          // three barrels over a magazine
    p.octa(0.12, 0.36, 0.88, 0.9, 0.08, GUN);
    p.box(0.18, 0.66, 0.82, 0.84, A);                     // the magazine
    p.box(0.16, 0.08, 0.28, 0.5, STEEL); p.box(0.44, 0.08, 0.56, 0.5, STEEL);
  },
  scatter(p, A) {                                        // a bell that flares forward
    p.disc(0.5, 0.62, 0.32, GUN);
    p.octa(0.12, 0.08, 0.88, 0.44, 0.12, STEEL);          // the bell mouth
    p.box(0.3, 0.16, 0.7, 0.36, BORE);
    p.octa(0.26, 0.42, 0.74, 0.58, 0.06, A);              // the feed collar
    p.box(0.3, 0.76, 0.7, 0.9, A);
  },
  lancer(p, A) {                                         // a wedge, capacitors on the flanks
    p.octa(0.18, 0.1, 0.82, 0.9, 0.16, GUN);
    p.box(0.1, 0.4, 0.22, 0.82, A); p.box(0.78, 0.4, 0.9, 0.82, A);   // capacitors
    p.box(0.36, 0.14, 0.64, 0.3, STEEL);                  // the emitter
    p.box(0.42, 0.3, 0.58, 0.8, A);                       // the charge line
  },
  wave(p, A) {                                           // a tank with a window, one nozzle
    p.disc(0.5, 0.58, 0.36, GUN);
    p.disc(0.5, 0.62, 0.22, A);                           // the window
    p.box(0.42, 0.08, 0.58, 0.4, STEEL);                  // the nozzle
    p.box(0.44, 0.08, 0.56, 0.16, BORE);
  },
  parallax(p, A) {                                       // a dish on a yoke, no barrel
    p.box(0.22, 0.66, 0.78, 0.9, GUN);
    p.ring(0.5, 0.42, 0.34, 5, STEEL);
    p.disc(0.5, 0.42, 0.24, GUN);
    p.disc(0.5, 0.42, 0.12, A);
    p.box(0.44, 0.08, 0.56, 0.3, A);                      // the feed, forward
  },
  swarmer(p, A) {                                        // a box of missile cells
    p.octa(0.12, 0.14, 0.88, 0.9, 0.1, GUN);
    for (const y of [0.22, 0.4]) for (const x of [0.2, 0.4]) { p.box(x, y, x + 0.14, y + 0.14, BORE); p.box(x + 0.03, y + 0.03, x + 0.11, y + 0.11, A); }
    p.box(0.2, 0.64, 0.8, 0.82, A);
  },
  // 3x3 ──────────────────────────────────────────────────────────────
  fuse(p, A) {                                           // a broadside: three wide short tubes
    p.octa(0.12, 0.34, 0.88, 0.9, 0.12, GUN);
    p.box(0.2, 0.68, 0.8, 0.82, A);
    for (const x of [0.14, 0.4]) { p.box(x, 0.1, x + 0.2, 0.44, STEEL); p.box(x + 0.04, 0.1, x + 0.16, 0.18, BORE); }
    p.box(0.6, 0.1, 0.66, 0.44, STEEL);                   // closes the middle tube after the mirror
  },
  ripple(p, A) {                                         // four ringed mouths on a turntable
    p.disc(0.5, 0.52, 0.42, GUN);
    for (const [x, y] of [[0.32, 0.36], [0.32, 0.64]]) { p.ring(x, y, 0.11, 4, STEEL); p.disc(x, y, 0.07, BORE); }
    p.box(0.44, 0.14, 0.56, 0.9, A);                      // the spine
  },
  tsunami(p, A) {                                        // the great tank, twin nozzles
    p.disc(0.5, 0.56, 0.42, GUN);
    p.disc(0.5, 0.6, 0.26, A);
    p.box(0.26, 0.06, 0.4, 0.36, STEEL); p.box(0.29, 0.06, 0.37, 0.14, BORE);
    p.box(0.44, 0.12, 0.56, 0.36, GUN);                   // the manifold between them
  },
  cyclone(p, A) {                                        // a rotary cluster on a drum
    p.disc(0.5, 0.62, 0.34, GUN);
    p.ring(0.5, 0.62, 0.34, 6, A);                        // the drum's band
    p.octa(0.3, 0.42, 0.7, 0.56, 0.04, GUN);              // the barrel clamp
    p.box(0.3, 0.06, 0.4, 0.5, STEEL); p.box(0.45, 0.02, 0.55, 0.5, STEEL);
    p.box(0.32, 0.06, 0.38, 0.12, BORE); p.box(0.47, 0.02, 0.53, 0.08, BORE);
  },
  // 4x4 ──────────────────────────────────────────────────────────────
  spectre(p, A) {                                        // long twin barrels, radiator rails
    p.octa(0.16, 0.4, 0.84, 0.92, 0.1, GUN);
    p.box(0.08, 0.5, 0.18, 0.88, A); p.box(0.82, 0.5, 0.92, 0.88, A);   // the rails
    p.box(0.22, 0.04, 0.38, 0.56, STEEL); p.box(0.26, 0.04, 0.34, 0.12, BORE);
    p.box(0.42, 0.62, 0.58, 0.86, A);                     // the breech core
  },
  meltdown(p, A) {                                       // one lens, three capacitor banks
    p.octa(0.14, 0.08, 0.86, 0.92, 0.18, GUN);
    p.ring(0.5, 0.34, 0.2, 5, STEEL); p.disc(0.5, 0.34, 0.17, A);
    for (const y of [0.4, 0.58, 0.76]) p.box(0.06, y, 0.2, y + 0.12, A);
    p.box(0.42, 0.56, 0.58, 0.86, A);
  },
  foreshadow(p, A) {                                     // one rail, accelerator rings along it
    p.octa(0.14, 0.48, 0.86, 0.94, 0.12, GUN);
    p.box(0.42, 0.02, 0.58, 0.64, STEEL);                 // the rail
    p.box(0.46, 0.02, 0.54, 0.6, BORE);
    for (const y of [0.1, 0.24, 0.38]) p.box(0.34, y, 0.66, y + 0.08, A);   // the rings
    p.box(0.06, 0.58, 0.18, 0.9, STEEL);                  // the stabilisers
    p.box(0.42, 0.68, 0.58, 0.86, A);
  },
};
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
let hairlines = 0;
for (const [kind, [size, group]] of Object.entries(ROSTER)) {
  const n = 32 * size;
  const g = grid(n); HEADS[kind](g.pen, ACCENT[group]);
  const px = finish(g.mat, n);
  // a run of one pixel in both directions is a lone pixel; a colour that
  // is one wide across a whole run is a hairline — both are the thing the
  // house rules forbid, so count them and say so
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const c = px[y * n + x]; if (c === null) continue;
    const at = (X, Y) => (X < 0 || Y < 0 || X >= n || Y >= n ? null : px[Y * n + X]);
    const h1 = at(x - 1, y) !== c && at(x + 1, y) !== c;
    const v1 = at(x, y - 1) !== c && at(x, y + 1) !== c;
    if (h1 && v1) { hairlines++; console.log(`  ${kind}: lone pixel at ${x},${y} ${c}`); }
  }
  writeFileSync(`${OUT}/mill-${kind}.png`, png(px, n));
}
writeFileSync(`${OUT}/roster.json`, JSON.stringify({ roster: ROSTER, accent: ACCENT }, null, 2));
console.log(`wrote ${Object.keys(ROSTER).length} heads to ${OUT}/, ${hairlines} lone pixels`);
