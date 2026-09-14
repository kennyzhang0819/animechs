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

// ── the A set: the first, angular-leaning silhouettes ──────────────────
// Every head faces up and is drawn left half and centre only; finish()
// mirrors x → n-1-x and shades. `A` is the accent pair. The margin is the
// stock one: 4 px on a 32 grid, 8 on 64, 6 on 96 and 128.
const HEADS_A = {
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

// ── THE ROSTER (the round set, chosen), then the two alternates ───────
const HEADS = {
  duo(P, A) {                                            // a round turret, a drum between the barrels
    P.disc(16, 18, 10, GUN);
    P.disc(16, 20, 6, GUN_R);                             // the bevel under the drum
    barrel(P, 9, 13, 3, 16, A, { lip: 2, brake: 3, collar: 4, bore: 1 });
    P.box(14, 12, 18, 22, A);                             // the ammo drum
  },
  hail(P, A) {                                           // a square mortar with a shell rack
    plate(P, 5, 8, 27, 29, 5, GUN);
    P.ring(16, 17, 7, 3, STEEL);                          // the tube
    P.disc(16, 17, 4, A);
    P.disc(16, 17, 2, BORE);
    P.box(10, 21, 22, 29, A);                             // the shell rack
    P.box(14, 23, 18, 27, STEEL);                         // a shell in it
  },
  scorch(P, A) {                                         // a round tank, the nozzle up top
    P.disc(16, 19, 9, GUN);
    P.ring(16, 19, 9, 3, GUN_R);
    P.disc(16, 19, 5, A);                                 // the fuel
    P.disc(16, 19, 2, STEEL);                             // its cap
    P.box(12, 3, 20, 12, STEEL);                          // the nozzle
    P.box(14, 3, 18, 6, BORE);
    P.box(11, 6, 21, 8, GUN);                             // its lip
    P.box(11, 8, 21, 12, A);                              // the burner
    P.box(5, 14, 8, 24, STEEL);                           // a fuel line on the flank
  },
  arc(P, A) {                                            // a tesla dome, one forked prong
    plate(P, 5, 12, 27, 29, 4, GUN, 0);
    P.disc(16, 18, 8, A);                                 // the dome
    P.disc(16, 18, 5, STEEL);
    P.disc(16, 18, 2, A);
    P.box(12, 3, 20, 12, STEEL);                          // the prong
    P.box(14, 3, 18, 7, BORE);                            // its slot
    P.box(12, 9, 20, 12, A);                              // its collar, where the prong meets the dome
    P.box(5, 16, 9, 24, A);                               // a coil on the flank, butted to the dome
  },
  salvo(P, A) {                                          // a round gatling salvo
    P.disc(32, 36, 20, GUN);
    P.ring(32, 36, 20, 4, GUN_R);
    barrel(P, 14, 20, 4, 30, A, { bands: [14], collar: 3 });
    barrel(P, 29, 35, 4, 30, A, { bands: [14], collar: 3 });
    P.disc(32, 40, 8, A);                                 // the drum
    P.disc(32, 40, 4, STEEL);
    P.box(8, 34, 20, 46, A);                              // the feed pod, over the rim
    bars(P, 22, 26, 44, 2, 2, 2);
  },
  scatter(P, A) {                                        // twin fat barrels, a radar between
    plate(P, 8, 24, 56, 58, 8, GUN, 4);
    barrel(P, 12, 24, 6, 34, A, { lip: 2, brake: 8, collar: 5, bore: 3, bands: [18] });
    P.ring(32, 20, 6, 3, STEEL);                          // the ranging dish
    P.disc(32, 20, 3, A);
    P.octa(14, 40, 50, 54, 4, A);                         // the magazine
    P.box(18, 44, 46, 51, GUN);                           // its lid
    P.box(20, 46, 24, 49, STEEL); P.box(28, 46, 36, 49, STEEL);   // flak shells
    bars(P, 10, 14, 32, 2, 2, 2);
  },
  lancer(P, A) {                                         // a round lancer, pods on the rim
    P.disc(32, 34, 21, GUN);
    P.ring(32, 34, 21, 4, GUN_R);
    P.box(24, 4, 40, 22, STEEL);                          // the emitter block
    P.box(28, 4, 36, 9, BORE);
    P.box(28, 12, 36, 18, A);
    P.box(8, 26, 18, 44, A);                              // capacitor pods, over the rim
    bars(P, 8, 18, 29, 3, 2, 3, GUN);
    P.box(28, 22, 36, 48, A);                             // the charge line
    P.box(20, 34, 44, 44, GUN_R);                         // the coil housing
    P.box(28, 34, 36, 44, STEEL);
    P.box(28, 50, 36, 56, A);
  },
  wave(P, A) {                                           // a square tank
    plate(P, 8, 22, 56, 58, 8, GUN, 4);
    P.disc(32, 40, 13, STEEL);                            // the window
    P.disc(32, 40, 10, A);
    P.disc(27, 36, 2, rev(A));
    P.box(26, 4, 38, 28, STEEL);                          // the nozzle
    P.box(22, 4, 42, 9, GUN);
    P.box(28, 4, 36, 9, BORE);
    P.box(24, 12, 40, 18, A);                             // the valve
    P.box(10, 30, 16, 50, STEEL); P.box(12, 32, 14, 48, A);   // a pipe on the flank
    P.box(28, 54, 36, 58, A);                             // the drain
  },
  parallax(P, A) {                                       // an octagonal dish on a yoke
    plate(P, 10, 30, 54, 58, 6, GUN, 3);
    P.box(6, 32, 12, 52, GUN); P.box(8, 34, 10, 50, GUN_R);   // the yoke arms
    plate(P, 12, 6, 52, 38, 12, STEEL, 4);                // the dish
    P.octa(18, 12, 46, 32, 8, GUN_R);
    P.octa(24, 16, 40, 28, 4, A);
    P.box(30, 20, 34, 24, STEEL);                         // the emitter core
    P.box(28, 4, 36, 12, STEEL); P.box(26, 4, 38, 7, A);  // the feed horn
    stud(P, 16, 50);
  },
  swarmer(P, A) {                                        // round pod launcher, four tubes
    P.disc(32, 32, 22, GUN);
    P.ring(32, 32, 22, 4, GUN_R);
    for (const cy of [26, 38]) { P.disc(23, cy, 4, BORE); P.disc(23, cy, 2, A); }   // the tubes, well inside the rim
    P.box(28, 20, 36, 44, A);                             // the spine
    P.box(30, 24, 34, 40, STEEL);
    P.box(20, 48, 44, 55, A);                             // the reload rail
  },
  fuse(P, A) {                                           // a round shotgun, three barrels, shell racks
    P.disc(48, 52, 36, GUN);
    P.ring(48, 52, 36, 6, GUN_R);
    barrel(P, 18, 32, 6, 40, A, { lip: 3, brake: 6, bands: [22], collar: 7, bore: 4 });
    barrel(P, 41, 55, 6, 40, A, { lip: 3, brake: 6, bands: [22], collar: 7, bore: 4 });
    P.disc(48, 58, 12, A);                                // the breech
    P.disc(48, 58, 6, STEEL);
    P.disc(48, 58, 2, BORE);
    P.box(12, 48, 24, 66, A);                             // a shell rack on the rim
    P.box(14, 50, 18, 54, STEEL); P.box(14, 56, 18, 60, STEEL);
  },
  ripple(P, A) {                                         // a square four-tube mortar block
    plate(P, 8, 8, 88, 90, 14, GUN, 6);
    for (const cy of [30, 66]) { P.ring(30, cy, 14, 5, STEEL); P.disc(30, cy, 9, A); P.disc(30, cy, 5, BORE); }
    P.box(42, 12, 54, 86, GUN_R);                         // the cross between the tubes
    P.box(12, 42, 84, 54, GUN_R);
    P.diamond(48, 48, 3, A);
  },
  tsunami(P, A) {                                        // a square tank, twin nozzles
    plate(P, 6, 20, 90, 90, 12, GUN, 5);
    P.disc(48, 56, 26, STEEL);                            // the window
    P.disc(48, 56, 22, A);
    P.disc(40, 48, 4, rev(A));
    barrel(P, 24, 36, 4, 24, A, { lip: 2, brake: 6, collar: 0, bore: 3 });
    P.box(8, 20, 88, 30, GUN);                            // the manifold
    P.box(44, 22, 52, 28, A);
    P.box(10, 34, 16, 78, STEEL); P.box(12, 36, 14, 76, A);   // a pipe on the flank
    P.box(42, 83, 54, 90, A);                             // the drain
  },
  cyclone(P, A) {                                        // a hex turret, three barrels in a triangle
    plate(P, 10, 30, 86, 90, 14, GUN, 5);
    barrel(P, 24, 32, 12, 44, A, { lip: 2, brake: 6, bands: [24], bandH: 4, collar: 4, bore: 2 });
    barrel(P, 44, 52, 4, 44, A, { lip: 2, brake: 6, bands: [16], bandH: 4, collar: 4, bore: 2 });
    P.ring(48, 66, 20, 5, A);                             // the drum
    P.disc(48, 66, 15, GUN_R);
    P.disc(48, 66, 6, A);
    P.disc(48, 66, 3, STEEL);
    P.box(12, 50, 20, 76, STEEL); P.box(14, 52, 18, 74, A);   // the feed chute
    bars(P, 22, 26, 56, 3, 2, 2);
  },
  spectre(P, A) {                                        // a round heavy, radiator pods
    P.disc(64, 72, 50, GUN);
    P.ring(64, 72, 50, 8, GUN_R);
    barrel(P, 32, 48, 6, 64, A, { lip: 4, brake: 10, bands: [22, 32, 44], bandH: 4, collar: 6, bore: 4 });
    P.octa(50, 24, 78, 56, 6, GUN_R);                     // the breech between the barrels
    P.box(56, 30, 72, 50, A);
    P.box(60, 34, 68, 46, STEEL);
    P.octa(8, 60, 28, 92, 4, A);                          // the radiator pods, over the rim
    bars(P, 10, 22, 64, 3, 4, 4, GUN);
    P.disc(64, 84, 14, A);                                // the ammo drum
    P.disc(64, 84, 7, STEEL);
    P.disc(64, 84, 3, BORE);
    stud(P, 48, 104, 3);
  },
  meltdown(P, A) {                                       // a round reactor, an emitter housing above
    P.disc(64, 68, 54, GUN);
    P.ring(64, 68, 54, 8, GUN_R);
    plate(P, 40, 6, 88, 30, 10, STEEL, 4);                // the emitter housing
    P.box(58, 6, 70, 14, BORE);
    P.box(58, 18, 70, 26, A);
    P.ring(64, 50, 18, 6, STEEL);                         // the lens
    P.ring(64, 50, 12, 3, rev(A));
    P.disc(64, 50, 9, A);
    P.disc(64, 50, 3, STEEL);
    P.octa(6, 52, 23, 84, 4, A);                          // capacitor pods, over the rim
    bars(P, 8, 20, 56, 3, 4, 6, rev(A));
    P.box(58, 66, 70, 106, A);                            // the charge line
    P.box(44, 78, 84, 94, GUN_R);
    P.box(58, 78, 70, 94, STEEL);
    bars(P, 42, 54, 98, 2, 3, 3);
  },
  foreshadow(P, A) {                                     // twin rails
    plate(P, 16, 60, 112, 122, 16, GUN, 6);
    for (const x of [40]) {
      P.box(x, 2, x + 12, 76, STEEL);                     // a rail
      P.box(x - 4, 2, x + 16, 10, GUN);                   // its muzzle
      P.box(x + 4, 2, x + 8, 72, BORE);
      for (const y of [14, 30, 46]) { P.box(x - 6, y, x + 18, y + 8, A); P.box(x - 4, y + 2, x + 16, y + 6, rev(A)); }
    }
    P.box(58, 20, 70, 60, GUN_R);                         // the bridge between them
    P.box(60, 26, 68, 54, A);
    P.box(62, 32, 66, 48, STEEL);
    P.box(4, 76, 20, 106, STEEL);                         // the stabilisers
    P.box(8, 80, 16, 102, GUN);
    bars(P, 8, 16, 84, 3, 4, 3, STEEL);
    P.octa(40, 84, 88, 118, 8, GUN_R);                    // the breech
    P.box(52, 90, 76, 112, A);
    P.box(58, 96, 70, 106, STEEL);
    stud(P, 34, 74, 3);
  },
};
const HEADS_C = {
  duo(P, A) {                                            // a boxy hex, one twin-bore block
    plate(P, 5, 10, 27, 29, 5, GUN);
    P.box(8, 3, 24, 14, STEEL);                           // the barrel block
    P.box(10, 3, 13, 7, BORE);                            // its bores
    P.box(7, 12, 25, 15, A);                              // the collar
    P.box(12, 18, 20, 26, A);                             // the receiver
    bars(P, 7, 10, 18, 2, 2, 2);
  },
  hail(P, A) {                                           // a wedge mortar, a square mouth
    plate(P, 6, 9, 26, 29, 6, GUN);
    barrel(P, 11, 21, 3, 17, A, { lip: 2, brake: 4, collar: 3, bore: 2 });
    P.box(6, 16, 9, 24, STEEL);                           // recoil pistons
    P.box(12, 20, 20, 26, A);                             // the base
    stud(P, 16, 23);
  },
  scorch(P, A) {                                         // a wide three-jet flamer
    plate(P, 4, 14, 28, 29, 4, GUN);
    P.box(6, 4, 26, 12, STEEL);                           // the nozzle
    P.box(6, 4, 26, 6, GUN);
    P.box(8, 6, 11, 10, BORE); P.box(14, 6, 18, 10, BORE);   // the jets
    P.box(8, 12, 24, 16, A);                              // the burner
    P.box(12, 19, 20, 26, A);                             // the tank
    P.box(14, 21, 18, 24, STEEL);
    P.box(6, 18, 9, 26, STEEL);                           // a fuel line
  },
  arc(P, A) {                                            // twin coils, a central prong
    plate(P, 4, 12, 28, 29, 5, GUN, 0);
    P.disc(9, 20, 3, A);                                  // a coil
    P.disc(9, 20, 1, STEEL);
    P.box(12, 3, 20, 16, STEEL);                          // the prong
    P.box(12, 3, 20, 6, A);
    P.box(14, 8, 18, 12, BORE);
    P.box(12, 25, 20, 27, BORE);                          // a vent
  },
  salvo(P, A) {                                          // a boxy salvo with a wide magazine
    plate(P, 8, 20, 56, 56, 6, GUN, 4);
    barrel(P, 12, 20, 4, 34, A, { bands: [12, 22], collar: 3 });
    barrel(P, 28, 36, 4, 34, A, { bands: [12, 22], collar: 3 });
    P.octa(12, 40, 52, 54, 4, A);                         // the magazine
    P.box(16, 44, 48, 51, GUN);
    P.box(18, 46, 22, 49, A); P.box(25, 46, 29, 49, A);   // the rounds
    bars(P, 10, 14, 36, 2, 2, 2);
  },
  scatter(P, A) {                                        // an octagonal horn with a muzzle grid
    P.disc(32, 40, 15, GUN);
    P.ring(32, 40, 15, 3, GUN_R);
    plate(P, 10, 4, 54, 28, 10, STEEL, 4);                // the horn
    P.octa(16, 8, 48, 24, 6, BORE);
    bars(P, 20, 44, 10, 3, 2, 3, GUN);                    // the muzzle grid
    P.box(29, 8, 35, 24, A);                              // the centre feed
    P.box(16, 26, 48, 34, GUN);                           // the throat
    P.octa(20, 32, 44, 40, 3, A);                         // the collar
    P.box(22, 46, 42, 56, A);                             // the bin
    P.box(26, 49, 38, 53, GUN);
  },
  lancer(P, A) {                                         // a prism
    plate(P, 10, 6, 54, 58, 16, GUN, 5);
    P.octa(22, 6, 42, 24, 6, STEEL);                      // the nose
    P.box(28, 8, 36, 14, BORE);
    P.box(28, 16, 36, 22, A);
    P.octa(6, 26, 18, 44, 3, A);                          // capacitor pods
    bars(P, 8, 16, 30, 3, 2, 3, GUN);
    P.box(28, 24, 36, 50, A);                             // the charge line
    P.octa(24, 30, 40, 46, 4, STEEL);                     // the prism
    P.diamond(32, 38, 4, A);
  },
  wave(P, A) {                                           // a barrel tank with twin nozzles
    P.disc(32, 32, 20, GUN);
    P.ring(32, 32, 20, 4, GUN_R);
    P.box(20, 4, 28, 22, STEEL);                          // a nozzle, down to where the rim runs flat
    P.box(18, 4, 30, 8, GUN);
    P.box(22, 4, 26, 8, BORE);
    P.box(18, 12, 30, 16, A);                             // its valve
    P.box(28, 10, 36, 18, STEEL);                         // the manifold
    P.box(30, 12, 34, 16, A);
    P.disc(32, 32, 10, STEEL);                            // the window
    P.disc(32, 32, 7, A);
    P.disc(28, 30, 1, rev(A));
    P.box(28, 48, 36, 53, A);                             // the drain
  },
  parallax(P, A) {                                       // twin prongs, a field ring
    plate(P, 8, 20, 56, 58, 8, GUN, 4);
    P.ring(32, 34, 12, 4, STEEL);                         // the emitter
    P.disc(32, 34, 8, A);
    P.disc(32, 34, 3, STEEL);
    P.box(14, 4, 20, 26, STEEL);                          // a prong
    P.box(14, 4, 20, 8, A);
    P.box(14, 22, 20, 26, A);
    P.box(20, 14, 44, 20, GUN);                           // the bridge
    P.box(24, 16, 40, 18, A);
    bars(P, 10, 14, 30, 2, 2, 2);
  },
  swarmer(P, A) {                                        // two big cells, four missiles
    plate(P, 8, 8, 56, 58, 10, GUN, 4);
    P.octa(12, 12, 30, 40, 4, BORE);                      // a cell
    for (const x of [14, 22]) { P.box(x, 16, x + 6, 36, A); P.box(x + 2, 16, x + 4, 20, STEEL); }
    P.box(30, 12, 34, 40, GUN_R);                         // the divider
    P.box(18, 44, 46, 54, STEEL);                         // the loader
    bars(P, 20, 44, 46, 2, 2, 2, A);
  },
  fuse(P, A) {                                           // a wedge shotgun, one wide five-bore muzzle
    plate(P, 6, 24, 90, 90, 16, GUN, 5);
    P.box(12, 6, 84, 30, STEEL);                          // the muzzle block
    P.box(12, 6, 84, 12, GUN);
    P.box(16, 6, 24, 12, BORE); P.box(30, 6, 38, 12, BORE); P.box(44, 6, 52, 12, BORE);
    P.box(12, 18, 84, 22, A);                             // the heat band
    P.octa(20, 60, 76, 84, 6, A);                         // the breech
    P.box(28, 64, 68, 80, GUN);
    P.box(32, 68, 38, 76, STEEL); P.box(42, 68, 48, 76, STEEL);
    bars(P, 10, 16, 40, 3, 2, 2);
  },
  ripple(P, A) {                                         // one great mortar tube on a turntable
    P.disc(48, 50, 40, GUN);
    P.ring(48, 50, 40, 6, GUN_R);
    P.ring(48, 44, 22, 8, STEEL);                         // the tube
    P.disc(48, 44, 14, A);
    P.disc(48, 44, 9, BORE);
    P.box(6, 40, 20, 70, STEEL); P.box(9, 44, 17, 66, A);     // recoil rails, out past the rim
    P.octa(36, 72, 60, 86, 4, A);                         // the shell hoist
  },
  tsunami(P, A) {                                        // a round tank, a nozzle housing on top
    P.disc(48, 52, 38, GUN);
    P.ring(48, 52, 38, 6, GUN_R);
    P.disc(48, 52, 28, STEEL);                            // the window
    P.disc(48, 52, 24, A);
    P.disc(40, 44, 4, rev(A));
    P.octa(30, 6, 66, 40, 8, GUN_R);                      // the nozzle housing
    barrel(P, 30, 38, 6, 30, A, { lip: 2, brake: 6, collar: 4, bore: 2 });
    barrel(P, 44, 52, 4, 30, A, { lip: 2, brake: 6, collar: 4, bore: 2 });
    P.box(10, 47, 26, 72, STEEL); P.box(12, 49, 24, 70, A);   // a pipe, run into the window
    P.box(42, 81, 54, 91, A);                             // the drain
  },
  cyclone(P, A) {                                        // a round minigun, four barrels, a banded drum
    P.disc(48, 58, 32, GUN);
    P.ring(48, 58, 32, 6, A);                             // the drum's band
    P.ring(48, 58, 22, 3, GUN_R);
    barrel(P, 26, 32, 4, 40, A, { lip: 2, brake: 6, bands: [18], bandH: 4, collar: 4, bore: 2 });
    barrel(P, 38, 44, 8, 40, A, { lip: 2, brake: 6, bands: [22], bandH: 4, collar: 4, bore: 2 });
    P.box(32, 28, 38, 36, GUN_R);                         // a clamp filling the gap between the barrels
    P.octa(20, 40, 76, 52, 4, GUN_R);                     // the clamp
    P.box(24, 44, 72, 48, BORE);
    P.box(8, 56, 20, 76, A);                              // the ammo box on the flank
    P.box(10, 58, 18, 74, GUN);
    bars(P, 42, 54, 60, 3, 2, 2);
  },
  spectre(P, A) {                                        // four barrels, a boxy magazine
    plate(P, 14, 48, 114, 122, 16, GUN, 6);
    barrel(P, 18, 30, 14, 54, A, { lip: 4, brake: 8, bands: [30], bandH: 4, collar: 6, bore: 3 });
    barrel(P, 40, 52, 6, 54, A, { lip: 4, brake: 8, bands: [22], bandH: 4, collar: 6, bore: 3 });
    P.octa(56, 24, 72, 54, 4, GUN_R);                     // the breech
    P.box(60, 30, 68, 48, A);
    P.box(62, 34, 66, 44, STEEL);
    P.octa(24, 68, 104, 96, 6, A);                        // the magazine
    P.box(32, 74, 96, 90, GUN);
    P.box(36, 78, 42, 86, STEEL); P.box(46, 78, 52, 86, STEEL); P.box(56, 78, 62, 86, STEEL);
    bars(P, 18, 24, 98, 2, 4, 2);
  },
  meltdown(P, A) {                                       // a great prism
    plate(P, 14, 6, 114, 122, 34, GUN, 6);
    P.octa(44, 6, 84, 40, 12, STEEL);                     // the nose
    P.box(58, 8, 70, 20, BORE);
    P.box(58, 24, 70, 36, A);
    P.ring(64, 58, 16, 5, STEEL);                         // the lens
    P.ring(64, 58, 11, 3, rev(A));
    P.disc(64, 58, 8, A);
    P.disc(64, 58, 3, STEEL);
    P.octa(4, 44, 20, 88, 4, A);                          // capacitor pods
    bars(P, 6, 18, 50, 3, 4, 8, rev(A));
    P.box(58, 72, 70, 112, A);                            // the charge line
    P.octa(48, 80, 80, 104, 6, STEEL);                    // the prism
    P.diamond(64, 92, 6, A);
  },
  foreshadow(P, A) {                                     // a coilgun on a round base
    P.disc(64, 80, 42, GUN);
    P.ring(64, 80, 42, 8, GUN_R);
    P.box(54, 2, 74, 90, STEEL);                          // the rail
    P.box(48, 2, 80, 12, GUN);
    P.box(60, 2, 68, 86, BORE);
    for (const y of [16, 31, 46]) { P.octa(40, y, 88, y + 12, 3, A); P.box(44, y + 4, 84, y + 8, rev(A)); }   // the coils, the last over the base's top
    P.disc(64, 90, 16, A);                                // the breech
    P.disc(64, 90, 8, STEEL);
    P.disc(64, 90, 3, BORE);
    P.octa(6, 66, 26, 110, 4, STEEL);                     // stabiliser pods
    P.box(10, 70, 22, 106, GUN);
    bars(P, 10, 22, 74, 4, 4, 4, STEEL);
    stud(P, 48, 108, 3);
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
for (const [tag, set] of [["", HEADS], ["-a", HEADS_A], ["-c", HEADS_C]]) for (const [kind, [size, group]] of Object.entries(ROSTER)) {
  const n = 32 * size;
  const g = grid(n); set[kind](pixelPen(g.pen, n), ACCENT[group]);
  const px = finish(g.mat, n);
  const name = kind + tag;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const c = px[y * n + x]; if (c === null) continue;
    const at = (X, Y) => (X < 0 || Y < 0 || X >= n || Y >= n ? null : px[Y * n + X]);
    const nb = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && at(x + dx, y + dy) === c) nb.push([dx, dy]);
    const stroke = nb.length === 0 || nb.every(([dx, dy]) => dx * nb[0][1] - dy * nb[0][0] === 0);
    if (stroke) {
      hairlines++;
      if (process.env.ALL || hairlines <= 40) console.log(`  ${name}: one-wide at ${x},${y} ${c}`);
      if (process.env.DUMP && !(dumped[name] ??= new Set()).has(`${x >> 3},${y >> 3}`)) {
        dumped[name].add(`${x >> 3},${y >> 3}`);
        const key = {}; let k = 0;
        const sym = (v) => (v === null ? "." : (key[v] ??= "ABCDEFGHIJKLMNOP"[k++]));
        console.log(`  ${name} around ${x},${y}:`);
        for (let Y = y - 4; Y <= y + 4; Y++) console.log("    " + String(Y).padStart(3) + " " + Array.from({ length: 13 }, (_, i) => sym(at(x - 6 + i, Y))).join(""));
        console.log("    " + Object.entries(key).map(([v, s]) => `${s}=${v}`).join(" "));
      }
    }
  }
  writeFileSync(`${OUT}/mill-${name}.png`, png(px, n));
}
writeFileSync(`${OUT}/roster.json`, JSON.stringify({ roster: ROSTER, accent: ACCENT }, null, 2));
console.log(`wrote ${Object.keys(ROSTER).length * 3} heads to ${OUT}/, ${hairlines} lone pixels`);
