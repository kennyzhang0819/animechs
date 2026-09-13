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
    /** a triangle, for a facet — keep its edges at 45 degrees */
    tri(x0, y0, x1, y1, x2, y2, m) {
      const P = [[u(x0), u(y0)], [u(x1), u(y1)], [u(x2), u(y2)]];
      const lo = Math.min(P[0][1], P[1][1], P[2][1]), hi = Math.max(P[0][1], P[1][1], P[2][1]);
      for (let y = lo; y < hi; y++) {
        const xs = [];
        for (let i = 0, j = 2; i < 3; j = i++) {
          const [xi, yi] = P[i], [xj, yj] = P[j];
          if ((yi <= y && yj > y) || (yj <= y && yi > y)) xs.push(xi + ((y - yi) / (yj - yi)) * (xj - xi));
        }
        xs.sort((a, b) => a - b);
        if (xs.length >= 2) for (let x = Math.round(xs[0]); x < Math.round(xs[1]); x++) set(x, y, m);
      }
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

// ── the vocabulary: the parts a turret is built from ───────────────────
// Every head below is authored in PIXELS on its own grid (32, 64, 96 or
// 128), not in unit fractions: a clearance of two pixels has to be two
// pixels, and rounding a fraction is how a one-pixel sliver gets in. The
// pen here takes pixel coordinates and hands unit ones to the engine.
function pixelPen(p, n) {
  const U = (v) => v / n;
  return {
    box: (x0, y0, x1, y1, m) => p.box(U(x0), U(y0), U(x1), U(y1), m),
    octa: (x0, y0, x1, y1, c, m) => p.octa(U(x0), U(y0), U(x1), U(y1), U(c), m),
    disc: (cx, cy, r, m) => p.disc(U(cx), U(cy), U(r), m),
    ring: (cx, cy, r, w, m) => p.ring(U(cx), U(cy), U(r), w, m),
    diamond: (cx, cy, r, m) => p.diamond(U(cx), U(cy), U(r), m),
  };
}
// Facets: GUN_R is gunmetal with its shade reversed, so a band drawn in it
// along a chamfer catches light the other way and the plate reads as
// bevelled — the duo's light wedge inside its dark half, done on purpose.
const rev = (m) => [m[1], m[0]];
const GUN_R = rev(GUN);
/** a chamfered plate with a bevel band `b` px wide along every chamfer:
 *  the octagon in the reversed shade, then the same octagon cut deeper on
 *  top of it in the plate's own shade */
function plate(P, x0, y0, x1, y1, c, m, b = 3) {
  P.octa(x0, y0, x1, y1, c, rev(m));
  P.octa(x0, y0, x1, y1, c + b, m);
}
/** a barrel: steel shaft, a wider gunmetal muzzle brake with a bore in
 *  it, optional shroud bands, an accent collar at the root. All in px */
function barrel(P, x0, x1, y0, y1, A, o = {}) {
  const lip = o.lip ?? 2, brake = o.brake ?? 4, collar = o.collar ?? 3, boreIn = o.bore ?? 2;
  P.box(x0, y0, x1, y1, STEEL);
  P.box(x0 - lip, y0, x1 + lip, y0 + brake, GUN);
  P.box(x0 + boreIn, y0, x1 - boreIn, y0 + brake, BORE);
  for (const y of o.bands ?? []) P.box(x0 - lip, y, x1 + lip, y + (o.bandH ?? 3), GUN);
  P.box(x0 - lip, y1 - collar, x1 + lip, y1, A);
}
/** n bars, h px tall, gap px apart */
function bars(P, x0, x1, y, n, h, gap, m = BORE) {
  for (let i = 0; i < n; i++) P.box(x0, y + i * (h + gap), x1, y + i * (h + gap) + h, m);
}
const stud = (P, x, y, r = 2, m = BORE) => P.diamond(x, y, r, m);

// ── the roster ─────────────────────────────────────────────────────────
// Every head faces up and is drawn left half and centre only; finish()
// mirrors x → n-1-x and shades. `A` is the accent pair. The margin is the
// stock one: 4 px on a 32 grid, 8 on 64, 6 on 96 and 128.
const HEADS = {
  // 1x1, 32 px ───────────────────────────────────────────────────────
  duo(P, A) {                                            // two barrels on a copper receiver
    plate(P, 4, 12, 28, 29, 4, GUN);
    P.box(10, 15, 22, 26, A);                             // the receiver
    P.box(14, 15, 18, 26, GUN);                           // the feed between the barrels
    barrel(P, 8, 13, 3, 18, A, { lip: 1, brake: 3, collar: 3, bore: 1 });
    bars(P, 6, 10, 20, 2, 2, 2);                          // flank vents
  },
  hail(P, A) {                                           // one mortar mouth on a turntable
    P.disc(16, 16, 11, GUN);
    P.box(6, 21, 26, 28, GUN);                            // the recoil bed squares the base
    P.ring(16, 15, 8, 3, STEEL);                          // the mouth, two px inside the turntable
    P.disc(16, 15, 5, A);                                 // its brass throat
    P.disc(16, 15, 2, BORE);
    P.box(12, 23, 20, 26, A);                             // the shell hoist
    stud(P, 9, 24);
  },
  scorch(P, A) {                                         // a flat nozzle, a burner, a tank
    plate(P, 6, 12, 26, 29, 3, GUN);
    P.box(4, 3, 28, 9, STEEL);                            // the wide nozzle
    P.box(4, 3, 28, 5, GUN);                              // its lip
    P.box(6, 5, 9, 9, BORE); P.box(11, 5, 14, 9, BORE);   // the jets
    P.box(8, 9, 24, 13, A);                               // the burner block
    P.disc(16, 21, 4, A);                                 // the fuel tank
    P.box(6, 16, 9, 26, STEEL);                           // fuel lines down the flanks
  },
  arc(P, A) {                                            // a coil, a core, two prongs
    plate(P, 5, 13, 27, 29, 4, GUN, 0);                   // no bevel: the coil would run parallel to it
    P.ring(16, 18, 8, 3, A);                              // the coil
    P.disc(16, 18, 5, STEEL);
    P.disc(16, 18, 2, A);                                 // the core
    P.box(7, 3, 12, 14, STEEL); P.box(7, 3, 12, 6, A);    // the prongs, tipped
    P.box(7, 10, 12, 14, GUN);                            // the prong's insulator
    P.box(5, 18, 9, 24, A);                               // a capacitor on the flank, butted to the coil
  },
  // 2x2, 64 px ───────────────────────────────────────────────────────
  salvo(P, A) {                                          // three barrels over a magazine
    plate(P, 8, 22, 56, 56, 8, GUN, 4);
    P.octa(12, 39, 52, 53, 3, A);                         // the magazine
    P.box(16, 43, 48, 51, GUN);                           // its lid
    P.box(19, 45, 23, 49, A); P.box(28, 45, 36, 49, A);   // the rounds showing
    barrel(P, 12, 18, 4, 33, A, { bands: [16], collar: 3 });
    barrel(P, 29, 35, 4, 33, A, { bands: [16], collar: 3 });
    P.box(20, 26, 27, 30, GUN_R);                         // the barrel clamp, bevelled
    bars(P, 10, 14, 35, 2, 2, 2);                         // flank vents
  },
  scatter(P, A) {                                        // a bell that flares forward
    P.disc(32, 41, 14, GUN);
    P.ring(32, 41, 14, 3, GUN_R);                         // the drum's rim
    P.box(12, 22, 52, 32, GUN);                           // the throat
    plate(P, 8, 4, 56, 26, 8, STEEL, 4);                  // the bell mouth
    P.octa(14, 8, 50, 22, 5, BORE);                       // the bore
    P.box(20, 10, 44, 20, GUN);                           // the flak drum inside the mouth
    P.box(29, 8, 35, 22, A);                              // the lit centre feed
    P.octa(16, 30, 48, 38, 3, A);                         // the feed collar
    P.box(22, 44, 42, 56, A);                             // the ammo bin
    P.box(24, 47, 40, 53, GUN);                           // its lid
    stud(P, 16, 27);
  },
  lancer(P, A) {                                         // a wedge, capacitors on the flanks
    plate(P, 12, 5, 52, 58, 12, GUN, 4);
    P.box(4, 26, 14, 46, GUN);                            // the capacitor housings
    P.box(6, 28, 12, 44, A);                              // the capacitors
    bars(P, 6, 12, 32, 3, 2, 2, GUN);                     // their cooling bands
    P.box(22, 8, 42, 20, STEEL);                          // the emitter block
    P.box(26, 8, 38, 12, BORE);                           // the aperture
    P.box(28, 14, 36, 18, A);                             // the charge window
    P.box(28, 20, 36, 52, A);                             // the charge line down the spine
    P.box(18, 36, 46, 46, GUN_R);                         // the coil housing across it
    P.box(28, 36, 36, 46, STEEL);
  },
  wave(P, A) {                                           // a tank with a window, one nozzle
    P.disc(32, 34, 21, GUN);
    P.ring(32, 34, 21, 4, GUN_R);                         // the tank's rim
    P.disc(32, 34, 14, STEEL);                            // the window frame, concentric with the tank
    P.disc(32, 34, 11, A);                                // the water
    P.disc(27, 32, 2, rev(A));                            // a gleam
    P.box(26, 4, 38, 26, STEEL);                          // the nozzle
    P.box(22, 4, 42, 9, GUN);                             // its lip
    P.box(28, 4, 36, 9, BORE);
    P.box(24, 11, 40, 17, A);                             // the valve
    P.box(28, 51, 36, 56, A);                             // the drain
  },
  parallax(P, A) {                                       // a dish on a yoke, no barrel
    plate(P, 12, 40, 52, 58, 5, GUN, 3);                  // the yoke
    P.box(5, 30, 12, 52, GUN); P.box(7, 32, 9, 50, GUN_R);    // the yoke arms
    P.ring(32, 27, 22, 5, STEEL);                         // the dish rim
    P.ring(32, 27, 17, 3, GUN_R);                         // the dish's inner bevel
    P.disc(32, 27, 14, GUN);
    P.disc(32, 27, 10, A);                                // the field emitter
    P.disc(32, 27, 3, STEEL);
    P.box(28, 4, 36, 18, STEEL); P.box(26, 4, 38, 8, A);  // the feed horn, tipped
    stud(P, 16, 49);
  },
  swarmer(P, A) {                                        // a box of missile cells
    plate(P, 8, 8, 56, 58, 7, GUN, 0);
    P.box(12, 11, 52, 42, GUN_R);                         // the launcher face
    for (const [x0, x1, m0, m1, n0, n1] of [[14, 24, 16, 22, 18, 20], [26, 38, 28, 36, 30, 34]]) for (const y0 of [14, 28]) {
      P.box(x0, y0, x1, y0 + 12, BORE);                   // a cell
      P.box(m0, y0 + 2, m1, y0 + 10, A);                  // the missile in it
      P.box(n0, y0 + 2, n1, y0 + 5, STEEL);               // its nose
    }
    P.octa(16, 44, 48, 54, 3, A);                         // the reload magazine
    bars(P, 20, 44, 46, 2, 2, 2, GUN);
  },
  // 3x3, 96 px ───────────────────────────────────────────────────────
  fuse(P, A) {                                           // a broadside: three wide short tubes
    plate(P, 8, 30, 88, 90, 12, GUN, 5);
    P.octa(20, 62, 76, 84, 5, A);                         // the breech block
    P.box(26, 66, 70, 80, GUN);                           // its lid
    P.box(30, 70, 36, 76, A); P.box(40, 70, 46, 76, A);   // the shells
    barrel(P, 14, 30, 8, 46, A, { lip: 2, brake: 6, bands: [24], collar: 4, bore: 4 });
    barrel(P, 40, 56, 8, 46, A, { lip: 2, brake: 6, bands: [24], collar: 4, bore: 4 });
    P.box(32, 36, 38, 42, GUN_R);                         // the clamp between them
    P.box(8, 48, 12, 60, STEEL);                          // side armour
    bars(P, 14, 20, 50, 3, 2, 2);                         // flank vents
  },
  ripple(P, A) {                                         // four ringed mouths on a turntable
    P.disc(48, 48, 41, GUN);
    P.ring(48, 48, 41, 5, GUN_R);                         // the turntable lip
    P.octa(26, 20, 70, 78, 10, GUN_R);                    // the cradle, raised
    for (const cy of [36, 62]) { P.ring(31, cy, 10, 4, STEEL); P.disc(31, cy, 6, A); P.disc(31, cy, 3, BORE); }
    P.box(40, 12, 56, 84, A);                             // the spine, brass
    P.box(44, 16, 52, 80, GUN);
    P.box(6, 42, 16, 54, STEEL); P.box(9, 45, 13, 51, A); // a recoil damper on the rim
  },
  tsunami(P, A) {                                        // the great tank, twin nozzles
    P.disc(48, 50, 39, GUN);
    P.ring(48, 50, 39, 6, GUN_R);
    barrel(P, 28, 40, 4, 26, A, { lip: 2, brake: 6, collar: 0, bore: 3 });   // a nozzle
    P.disc(48, 50, 26, STEEL);                            // the window frame, concentric with the tank
    P.disc(48, 50, 22, A);                                // the water
    P.disc(40, 44, 4, rev(A));                            // a gleam
    P.box(4, 24, 92, 38, GUN);                            // the manifold across the front
    P.box(44, 27, 52, 35, A);                             // its gauge
    stud(P, 20, 31);
    P.box(42, 83, 54, 90, A);                             // the drain
  },
  cyclone(P, A) {                                        // a rotary cluster on a drum
    P.disc(48, 60, 29, GUN);
    P.ring(48, 60, 29, 6, A);                             // the drum's band
    P.ring(48, 60, 22, 3, GUN_R);
    barrel(P, 30, 38, 8, 40, A, { lip: 2, brake: 6, bands: [20], bandH: 4, collar: 4, bore: 2 });
    barrel(P, 44, 52, 4, 40, A, { lip: 2, brake: 6, bands: [16], bandH: 4, collar: 4, bore: 2 });
    P.octa(26, 40, 70, 54, 5, GUN_R);                     // the barrel clamp
    P.box(30, 45, 66, 49, BORE);
    P.box(12, 56, 20, 80, STEEL); P.box(14, 58, 18, 78, GUN_R);   // the feed chute
    bars(P, 42, 54, 64, 3, 2, 2);                         // drum vents
  },
  // 4x4, 128 px ──────────────────────────────────────────────────────
  spectre(P, A) {                                        // long twin barrels, radiator rails
    plate(P, 20, 52, 108, 120, 14, GUN, 6);
    P.box(20, 68, 108, 104, GUN);                         // squared shoulders
    P.box(8, 66, 24, 106, GUN);                           // the rail housings
    P.box(10, 68, 22, 104, A);                            // the radiators
    bars(P, 10, 22, 72, 5, 3, 3, GUN);                    // their fins
    barrel(P, 32, 48, 6, 52, A, { lip: 4, brake: 10, bands: [22, 32], bandH: 4, collar: 6, bore: 4 });
    P.octa(50, 20, 78, 50, 6, GUN_R);                     // the breech, raised between the barrels
    P.box(56, 26, 72, 44, A);                             // the breech core
    P.box(60, 30, 68, 40, STEEL);
    stud(P, 40, 60, 3); stud(P, 40, 110, 3);
  },
  meltdown(P, A) {                                       // one lens, three capacitor banks
    plate(P, 18, 6, 110, 122, 26, GUN, 6);
    P.octa(40, 14, 88, 36, 12, GUN_R);                    // the nose plate
    P.ring(64, 42, 24, 7, STEEL);                         // the lens housing
    P.ring(64, 42, 17, 3, rev(A));
    P.disc(64, 42, 14, A);
    P.disc(64, 42, 5, STEEL);
    P.box(56, 6, 72, 20, STEEL);                          // the aperture
    P.box(60, 6, 68, 14, BORE);
    P.box(4, 40, 20, 96, GUN);                            // the capacitor housings
    P.box(6, 44, 18, 92, A);                              // the capacitors
    bars(P, 6, 18, 48, 4, 4, 8, rev(A));                  // their charge bands
    P.box(58, 70, 70, 110, A);                            // the charge line
    P.box(44, 78, 84, 92, GUN_R);                         // the coil housing across it
    P.box(58, 78, 70, 92, STEEL);
    bars(P, 34, 50, 100, 2, 3, 3);                        // vents
  },
  foreshadow(P, A) {                                     // one rail, accelerator rings along it
    plate(P, 18, 56, 110, 122, 18, GUN, 6);
    P.box(18, 74, 110, 104, GUN);                         // squared shoulders
    P.box(54, 2, 74, 80, STEEL);                          // the rail
    P.box(50, 2, 78, 10, GUN);                            // the muzzle
    P.box(60, 2, 68, 76, BORE);                           // the bore, open the whole length
    for (const y of [14, 30, 46]) { P.box(44, y, 84, y + 10, A); P.box(46, y + 3, 82, y + 7, rev(A)); }   // the rings
    P.box(4, 74, 22, 104, STEEL);                         // the stabilisers
    P.box(8, 78, 18, 102, GUN);
    bars(P, 8, 18, 82, 3, 3, 4, STEEL);
    P.octa(40, 84, 88, 118, 8, GUN_R);                    // the breech
    P.box(52, 90, 76, 112, A);
    P.box(58, 96, 70, 106, STEEL);
    stud(P, 32, 66, 3); stud(P, 32, 110, 3);
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
let hairlines = 0; const dumped = {};
for (const [kind, [size, group]] of Object.entries(ROSTER)) {
  const n = 32 * size;
  const g = grid(n); HEADS[kind](pixelPen(g.pen, n), ACCENT[group]);
  const px = finish(g.mat, n);
  // a pixel with no same-colour neighbour to either side, or above and
  // below, is a one-wide run: a hairline or a lone pixel, the two things
  // the house rules forbid. Count them and say where
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const c = px[y * n + x]; if (c === null) continue;
    const at = (X, Y) => (X < 0 || Y < 0 || X >= n || Y >= n ? null : px[Y * n + X]);
    // the same-colour neighbours among the eight. None: a lone pixel. All
    // on one line through the pixel: a one-pixel stroke, straight or
    // diagonal. A curve's edge and a 45-degree step both have a neighbour
    // off that line and pass, as they do in the stock art.
    const nb = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && at(x + dx, y + dy) === c) nb.push([dx, dy]);
    const stroke = nb.length === 0 || nb.every(([dx, dy]) => dx * nb[0][1] - dy * nb[0][0] === 0);
    if (stroke) {
      hairlines++;
      if (process.env.ALL || hairlines <= 40) console.log(`  ${kind}: one-wide at ${x},${y} ${c}`);
      if (process.env.DUMP && !(dumped[kind] ??= new Set()).has(`${x >> 3},${y >> 3}`)) {
        dumped[kind].add(`${x >> 3},${y >> 3}`);
        const key = {}; let k = 0;
        const sym = (v) => (v === null ? "." : (key[v] ??= "ABCDEFGHIJKLMNOP"[k++]));
        console.log(`  ${kind} around ${x},${y}:`);
        for (let Y = y - 4; Y <= y + 4; Y++) console.log("    " + String(Y).padStart(3) + " " + Array.from({ length: 13 }, (_, i) => sym(at(x - 6 + i, Y))).join(""));
        console.log("    " + Object.entries(key).map(([v, s]) => `${s}=${v}`).join(" "));
      }
    }
  }
  writeFileSync(`${OUT}/mill-${kind}.png`, png(px, n));
}
writeFileSync(`${OUT}/roster.json`, JSON.stringify({ roster: ROSTER, accent: ACCENT }, null, 2));
console.log(`wrote ${Object.keys(ROSTER).length} heads to ${OUT}/, ${hairlines} lone pixels`);
