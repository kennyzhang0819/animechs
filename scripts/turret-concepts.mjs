// TURRET CONCEPT SHEETS: draws the four candidate player-side turret
// factions (docs/turret-factions.md) as pixel art with the same rules the
// animal families obey (game/pixelArt.ts, docs/unit-art.md): flat plates,
// four or five colours, nothing thinner than two pixels, no baked outline,
// symmetric by construction, facing up on a square grid at Mindustry's
// 32 px a tile (32 / 64 / 96 / 128 for a 1x1 to a 4x4).
//
//   node scripts/turret-concepts.mjs            → docs/turret-concepts/*.png
//
// These are CONCEPTS, not shipping art: the point is to see four
// directions side by side at the size they would really draw at.
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";

// ── the engine, unit coordinates in ───────────────────────────────────
function grid(n) {
  const px = new Array(n * n).fill(null);
  let clipped = false, erasing = false;
  const u = (v) => Math.round(v * n);
  const set = (x, y, c) => {
    if (x < 0 || y < 0 || x >= n || y >= n) return;
    if (clipped && px[y * n + x] === null) return;
    px[y * n + x] = erasing ? null : c;
  };
  const pen = {
    box(x0, y0, x1, y1, c) { for (let y = u(y0); y < u(y1); y++) for (let x = u(x0); x < u(x1); x++) set(x, y, c); return pen; },
    disc(cx, cy, r, c) {
      const [cxp, cyp, pr] = [u(cx), u(cy), u(r)]; const rr = (pr + 0.5) ** 2;
      for (let y = -pr; y <= pr; y++) { const half = Math.floor(Math.sqrt(rr - y * y)); for (let x = -half; x <= half; x++) set(cxp + x, cyp + y, c); }
      return pen;
    },
    ring(cx, cy, r, w, c) {
      const [cxp, cyp, pr] = [u(cx), u(cy), u(r)]; const inner = pr - w;
      for (let y = -pr; y <= pr; y++) for (let x = -pr; x <= pr; x++) { const d = Math.hypot(x, y); if (d <= pr + 0.5 && d >= inner - 0.5) set(cxp + x, cyp + y, c); }
      return pen;
    },
    poly(pts, c) {
      const P = pts.map(([x, y]) => [u(x), u(y)]);
      let lo = Infinity, hi = -Infinity;
      for (const [, y] of P) { lo = Math.min(lo, y); hi = Math.max(hi, y); }
      for (let y = lo; y < hi; y++) {
        const xs = [];
        for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
          const [xi, yi] = P[i], [xj, yj] = P[j];
          if ((yi <= y && yj > y) || (yj <= y && yi > y)) xs.push(xi + ((y - yi) / (yj - yi)) * (xj - xi));
        }
        xs.sort((a, b) => a - b);
        for (let k = 0; k + 1 < xs.length; k += 2) for (let x = Math.round(xs[k]); x < Math.round(xs[k + 1]); x++) set(x, y, c);
      }
      return pen;
    },
    over(fn) { clipped = true; fn(pen); clipped = false; return pen; },
    erase(fn) { erasing = true; fn(pen); erasing = false; return pen; },
    // a 2px checker, the one addition the animals made for mottled skin
    dither(x0, y0, x1, y1, c) { for (let y = u(y0); y < u(y1); y++) for (let x = u(x0); x < u(x1); x++) if (((x >> 1) + (y >> 1)) % 2 === 0) set(x, y, c); return pen; },
  };
  return { px, pen };
}
/** the left half wins: copy it over the right, pixel for pixel */
function mirror(px, n) {
  for (let y = 0; y < n; y++) for (let x = 0; x < n >> 1; x++) px[y * n + (n - 1 - x)] = px[y * n + x];
}
/** Mindustry's block outline (atlas.ts BLOCK_OUTLINE), one pixel, so the
 *  concept is seen the way a packed turret top is seen */
function outline(px, n, color) {
  const out = px.slice();
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    if (px[y * n + x] !== null) continue;
    let near = false;
    for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1; dx++) {
      const X = x + dx, Y = y + dy;
      if (X < 0 || Y < 0 || X >= n || Y >= n) continue;
      if (px[Y * n + X] !== null) { near = true; break; }
    }
    if (near) out[y * n + x] = color;
  }
  return out;
}

// ── PNG, by hand: node has zlib and nothing else ───────────────────────
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (b) => { let c = 0xffffffff; for (const x of b) c = CRC[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(px, w, h) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const c = px[y * w + x]; const o = y * (w * 4 + 1) + 1 + x * 4;
      if (c === null) { raw.fill(0, o, o + 4); continue; }
      raw[o] = parseInt(c.slice(1, 3), 16); raw[o + 1] = parseInt(c.slice(3, 5), 16); raw[o + 2] = parseInt(c.slice(5, 7), 16); raw[o + 3] = 255;
    }
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

// ── the four palettes: the THING's colours, never a rarity band ────────
const FOUNDRY = { deep: "#2c2d38", dark: "#4d4e58", mid: "#7b7b7b", lite: "#c1c3d4", copper: "#e07a3f", glow: "#ffe6c2" };
const VERDANCE = { bark: "#5a3d26", deep: "#2f6b3a", leaf: "#5aa84a", pale: "#a6de7c", blossom: "#ff8a6b", seed: "#f3e6a3" };
const HIVE = { chitin: "#3b2a22", shell: "#8f5a2b", shellLite: "#c98a4a", wax: "#f1e3b6", honey: "#f2b632", sting: "#dfe7ff" };
const RELIQUARY = { dark: "#5d564c", stone: "#9a8f7c", lite: "#d3c7ad", jade: "#3d9a72", gilt: "#e3b752", ember: "#ff9c5a" };

// Every head is drawn FACING UP; the renderer turns it to face its target.
// Left half and centre only: mirror() finishes the right.

// ── FOUNDRY: the high-tech set, redrawn as our own ──────────────────────
const foundry = {
  // 1x1 twin gun — the duo's role: two barrels, a bolted plate between
  head1(p) {
    const C = FOUNDRY;
    p.box(0.06, 0.32, 0.5, 0.96, C.dark);                // body
    p.box(0.12, 0.4, 0.5, 0.9, C.mid);                   // top plate
    p.box(0.44, 0.42, 0.5, 0.9, C.copper);               // centre seam, runs DOWN
    p.box(0.2, 0.05, 0.34, 0.5, C.lite);                 // barrel
    p.box(0.2, 0.05, 0.34, 0.14, C.deep);                // muzzle
    p.box(0.1, 0.82, 0.5, 0.95, C.deep);                 // rear block
  },
  // 2x2 charge beam — the lancer's role: a wedge, capacitors, one slot
  head2(p) {
    const C = FOUNDRY;
    p.poly([[0.5, 0.08], [0.2, 0.3], [0.12, 0.92], [0.5, 0.92]], C.dark);
    p.poly([[0.5, 0.16], [0.26, 0.34], [0.2, 0.86], [0.5, 0.86]], C.mid);
    p.box(0.44, 0.14, 0.5, 0.9, C.copper);
    p.box(0.02, 0.4, 0.14, 0.8, C.deep);                 // side capacitor
    p.box(0.04, 0.44, 0.12, 0.76, C.copper);
    p.box(0.36, 0.18, 0.5, 0.3, C.glow);                 // emitter slot
    p.box(0.3, 0.7, 0.5, 0.82, C.deep);
  },
  // 3x3 mortar — the ripple's role: a turntable with four tube mouths
  head3(p) {
    const C = FOUNDRY;
    p.disc(0.5, 0.55, 0.42, C.dark);
    p.disc(0.5, 0.55, 0.36, C.mid);
    p.box(0.46, 0.14, 0.5, 0.96, C.dark);
    for (const [x, y] of [[0.3, 0.34], [0.3, 0.6]]) {   // tube mouths, seen from above
      p.ring(x, y, 0.1, 3, C.lite); p.disc(x, y, 0.06, C.deep);
    }
    p.box(0.1, 0.8, 0.5, 0.9, C.deep);
    p.box(0.42, 0.06, 0.5, 0.22, C.copper);              // sight rail
  },
  // 4x4 heavy — the spectre's role: long twin barrels, radiator fins
  head4(p) {
    const C = FOUNDRY;
    p.box(0.14, 0.4, 0.5, 0.94, C.dark);
    p.box(0.2, 0.46, 0.5, 0.88, C.mid);
    p.box(0.45, 0.42, 0.5, 0.94, C.copper);
    p.box(0.2, 0.02, 0.38, 0.56, C.lite);                // barrel
    p.box(0.2, 0.02, 0.38, 0.1, C.deep);
    p.box(0.26, 0.12, 0.32, 0.46, C.dark);               // barrel groove, runs down
    p.box(0.04, 0.46, 0.14, 0.9, C.deep);                // radiator rail
    p.box(0.06, 0.5, 0.12, 0.86, C.copper);
    p.box(0.28, 0.62, 0.5, 0.86, C.deep);                // breech block
    p.box(0.44, 0.66, 0.5, 0.82, C.glow);                // charge core, down the seam
  },
  base(p) {
    const C = FOUNDRY;
    p.box(0.02, 0.02, 0.5, 0.98, C.dark);
    p.box(0.08, 0.08, 0.5, 0.92, C.mid);
    p.box(0.08, 0.08, 0.16, 0.16, C.deep); p.box(0.08, 0.84, 0.16, 0.92, C.deep); // corner bolts
  },
};


// ── FOUNDRY VARIANTS: the same high-tech set in five materials ───────────
// Mill (the one above): octagonal bolted plates, gunmetal and copper.
// Boiler: iron and brass, round boilers, rivets, steam. Blackline: stealth
// wedges with light strips. Ceramic: pale lab plates with a signal stripe.
// Scrapyard: welded patches, rust and hazard paint — the currency is scrap.

const BOILER = { iron: "#3a3a42", ironMid: "#6a6a74", ironLite: "#9c9ca8", brass: "#c8973a", brassLite: "#eccb7a", ivory: "#efe7d2" };
const boiler = {
  head1(p) {
    const C = BOILER;
    p.disc(0.5, 0.62, 0.36, C.iron);                     // round boiler
    p.disc(0.5, 0.62, 0.3, C.ironMid);
    p.box(0.46, 0.36, 0.5, 0.9, C.brass);                // brass seam
    p.box(0.2, 0.06, 0.32, 0.48, C.brass);               // brass barrel
    p.box(0.2, 0.06, 0.32, 0.14, C.brassLite);
    p.box(0.1, 0.5, 0.16, 0.56, C.ironLite); p.box(0.1, 0.7, 0.16, 0.76, C.ironLite); // rivets
  },
  head2(p) {
    const C = BOILER;
    p.disc(0.5, 0.56, 0.4, C.iron);
    p.disc(0.5, 0.56, 0.34, C.ironMid);
    p.box(0.46, 0.18, 0.5, 0.94, C.brass);
    p.box(0.3, 0.06, 0.46, 0.4, C.brass);                // wide brass emitter
    p.box(0.3, 0.06, 0.46, 0.12, C.ivory);
    p.disc(0.22, 0.66, 0.1, C.brass); p.disc(0.22, 0.66, 0.06, C.ivory); // gauge
    p.box(0.08, 0.36, 0.14, 0.42, C.ironLite); p.box(0.08, 0.82, 0.14, 0.88, C.ironLite);
    p.box(0.02, 0.5, 0.1, 0.72, C.ironMid);               // steam vent
  },
  head3(p) {
    const C = BOILER;
    p.disc(0.5, 0.56, 0.44, C.iron);
    p.disc(0.5, 0.56, 0.38, C.ironMid);
    p.box(0.46, 0.1, 0.5, 0.98, C.brass);
    for (const [x, y] of [[0.3, 0.36], [0.28, 0.62]]) { p.ring(x, y, 0.1, 3, C.brass); p.disc(x, y, 0.06, C.iron); }
    p.box(0.06, 0.8, 0.5, 0.9, C.iron);
    for (const x of [0.12, 0.2, 0.28, 0.36]) p.box(x, 0.83, x + 0.04, 0.87, C.brassLite); // rivet run at the back
    p.disc(0.14, 0.5, 0.06, C.brassLite);                // valve wheel
  },
  head4(p) {
    const C = BOILER;
    p.disc(0.5, 0.62, 0.42, C.iron);
    p.disc(0.5, 0.62, 0.36, C.ironMid);
    p.box(0.44, 0.3, 0.5, 0.98, C.brass);
    p.box(0.18, 0.02, 0.34, 0.6, C.brass);               // twin brass barrels
    p.box(0.18, 0.02, 0.34, 0.1, C.brassLite);
    p.box(0.24, 0.14, 0.28, 0.54, C.iron);
    p.disc(0.5, 0.68, 0.12, C.brass); p.disc(0.5, 0.68, 0.07, C.ivory); // the great gauge
    p.box(0.02, 0.44, 0.1, 0.8, C.ironMid); p.box(0.04, 0.5, 0.08, 0.74, C.ironLite); // steam stack
    for (const y of [0.4, 0.56, 0.72, 0.88]) p.box(0.14, y, 0.18, y + 0.04, C.brassLite);
  },
  base(p) {
    const C = BOILER;
    p.box(0.02, 0.02, 0.5, 0.98, C.iron);
    p.box(0.08, 0.08, 0.5, 0.92, C.ironMid);
    for (const [x, y] of [[0.1, 0.1], [0.1, 0.86]]) p.box(x, y, x + 0.05, y + 0.05, C.brass);
    p.box(0.44, 0.08, 0.5, 0.92, C.iron);
  },
};

const BLACKLINE = { black: "#1f2128", dark: "#33363f", mid: "#4a4e5a", lite: "#8d92a3", strip: "#9fe8ff", white: "#f4f8ff" };
const blackline = {
  head1(p) {
    const C = BLACKLINE;
    p.poly([[0.5, 0.2], [0.14, 0.34], [0.08, 0.94], [0.5, 0.94]], C.dark);
    p.poly([[0.5, 0.28], [0.2, 0.4], [0.16, 0.88], [0.5, 0.88]], C.mid);
    p.box(0.2, 0.04, 0.3, 0.48, C.lite);                 // barrel
    p.box(0.2, 0.04, 0.3, 0.1, C.black);
    p.box(0.46, 0.3, 0.5, 0.88, C.strip);                // the light line
  },
  head2(p) {
    const C = BLACKLINE;
    p.poly([[0.5, 0.06], [0.2, 0.26], [0.1, 0.94], [0.5, 0.94]], C.dark);
    p.poly([[0.5, 0.14], [0.26, 0.32], [0.18, 0.88], [0.5, 0.88]], C.mid);
    p.poly([[0.5, 0.26], [0.36, 0.34], [0.34, 0.8], [0.5, 0.8]], C.lite);  // pale core plate
    p.box(0.46, 0.12, 0.5, 0.9, C.strip);
    p.box(0.3, 0.16, 0.46, 0.24, C.white);               // emitter slot
    p.box(0.04, 0.44, 0.12, 0.84, C.black); p.box(0.06, 0.5, 0.1, 0.78, C.strip); // flank strip
  },
  head3(p) {
    const C = BLACKLINE;
    p.poly([[0.5, 0.08], [0.16, 0.18], [0.06, 0.5], [0.12, 0.94], [0.5, 0.94]], C.dark);
    p.poly([[0.5, 0.16], [0.22, 0.26], [0.14, 0.5], [0.2, 0.88], [0.5, 0.88]], C.mid);
    p.box(0.46, 0.08, 0.5, 0.94, C.strip);
    for (const [x, y] of [[0.3, 0.36], [0.28, 0.62]]) { p.ring(x, y, 0.1, 3, C.lite); p.disc(x, y, 0.06, C.black); }
    p.box(0.1, 0.82, 0.5, 0.9, C.black);
    p.box(0.14, 0.84, 0.44, 0.88, C.strip);              // rear light bar
  },
  head4(p) {
    const C = BLACKLINE;
    p.poly([[0.5, 0.3], [0.16, 0.38], [0.06, 0.6], [0.1, 0.96], [0.5, 0.96]], C.dark);
    p.poly([[0.5, 0.38], [0.22, 0.44], [0.14, 0.62], [0.18, 0.9], [0.5, 0.9]], C.mid);
    p.poly([[0.5, 0.5], [0.34, 0.54], [0.3, 0.86], [0.5, 0.86]], C.lite);
    p.box(0.2, 0.02, 0.34, 0.56, C.lite);                // long barrels
    p.box(0.2, 0.02, 0.34, 0.1, C.black);
    p.box(0.25, 0.14, 0.29, 0.5, C.strip);               // lit groove down the barrel
    p.box(0.46, 0.36, 0.5, 0.92, C.strip);
    p.box(0.02, 0.62, 0.1, 0.9, C.black); p.box(0.04, 0.66, 0.08, 0.86, C.strip);
  },
  base(p) {
    const C = BLACKLINE;
    p.box(0.02, 0.02, 0.5, 0.98, C.black);
    p.box(0.08, 0.08, 0.5, 0.92, C.dark);
    p.poly([[0.08, 0.08], [0.2, 0.08], [0.08, 0.2]], C.strip);
    p.poly([[0.08, 0.92], [0.2, 0.92], [0.08, 0.8]], C.strip);
  },
};

const CERAMIC = { shade: "#8c8b88", plate: "#c9c7c0", white: "#e8e6e0", slot: "#2a2b31", signal: "#ff6a2a" };
const ceramic = {
  head1(p) {
    const C = CERAMIC;
    p.disc(0.5, 0.64, 0.34, C.shade);
    p.disc(0.5, 0.64, 0.28, C.plate);
    p.box(0.46, 0.4, 0.5, 0.9, C.white);
    p.disc(0.26, 0.3, 0.09, C.plate); p.box(0.17, 0.3, 0.35, 0.6, C.plate); // capsule barrel
    p.box(0.22, 0.06, 0.3, 0.3, C.white); p.box(0.22, 0.06, 0.3, 0.12, C.slot);
    p.box(0.1, 0.74, 0.5, 0.8, C.signal);                // signal band at the back
  },
  head2(p) {
    const C = CERAMIC;
    p.disc(0.5, 0.54, 0.4, C.shade);
    p.disc(0.5, 0.54, 0.34, C.plate);
    p.box(0.46, 0.16, 0.5, 0.92, C.white);
    p.box(0.26, 0.06, 0.46, 0.42, C.white);              // the emitter block
    p.box(0.3, 0.1, 0.46, 0.2, C.slot);
    p.box(0.3, 0.12, 0.46, 0.16, C.signal);              // the lit slot
    p.box(0.06, 0.5, 0.16, 0.78, C.plate); p.box(0.08, 0.54, 0.14, 0.74, C.signal); // side capacitor
  },
  head3(p) {
    const C = CERAMIC;
    p.disc(0.5, 0.56, 0.44, C.shade);
    p.disc(0.5, 0.56, 0.38, C.plate);
    p.box(0.46, 0.12, 0.5, 0.96, C.white);
    for (const [x, y] of [[0.3, 0.36], [0.28, 0.62]]) { p.ring(x, y, 0.1, 3, C.white); p.disc(x, y, 0.06, C.slot); }
    p.box(0.1, 0.82, 0.5, 0.9, C.plate);
    p.box(0.1, 0.84, 0.5, 0.88, C.signal);
    p.box(0.12, 0.44, 0.18, 0.56, C.signal);             // flank marking
  },
  head4(p) {
    const C = CERAMIC;
    p.disc(0.5, 0.64, 0.4, C.shade);
    p.box(0.1, 0.4, 0.5, 0.64, C.shade);
    p.disc(0.5, 0.64, 0.34, C.plate); p.box(0.16, 0.46, 0.5, 0.64, C.plate);
    p.box(0.46, 0.36, 0.5, 0.96, C.white);
    p.disc(0.27, 0.12, 0.09, C.white); p.box(0.18, 0.12, 0.36, 0.58, C.white); // capsule barrels
    p.box(0.23, 0.02, 0.31, 0.12, C.slot);
    p.box(0.25, 0.2, 0.29, 0.52, C.signal);              // signal stripe down the barrel
    p.box(0.04, 0.5, 0.12, 0.9, C.plate); p.box(0.06, 0.56, 0.1, 0.84, C.slot);
    p.disc(0.5, 0.74, 0.1, C.slot); p.disc(0.5, 0.74, 0.05, C.signal); // core
  },
  base(p) {
    const C = CERAMIC;
    p.box(0.02, 0.02, 0.5, 0.98, C.shade);
    p.box(0.08, 0.08, 0.5, 0.92, C.plate);
    p.box(0.08, 0.08, 0.5, 0.13, C.white);
    p.box(0.08, 0.87, 0.5, 0.92, C.white);
  },
};

const SCRAP = { rust: "#8a4a2a", rustLite: "#b8703f", iron: "#5b5b63", plate: "#9a958c", hazard: "#e6c34a", weld: "#2b2b31" };
const scrap = {
  head1(p) {
    const C = SCRAP;
    p.box(0.08, 0.34, 0.5, 0.96, C.iron);
    p.box(0.14, 0.4, 0.5, 0.9, C.plate);
    p.box(0.3, 0.6, 0.5, 0.9, C.rust);                   // a rusted patch, bolted on
    p.box(0.44, 0.4, 0.5, 0.9, C.weld);                  // weld seam
    p.box(0.18, 0.04, 0.32, 0.5, C.iron);                // barrel
    p.box(0.18, 0.04, 0.32, 0.12, C.hazard);             // hazard tip
    p.box(0.16, 0.46, 0.2, 0.5, C.weld); p.box(0.16, 0.8, 0.2, 0.84, C.weld); // bolts
  },
  head2(p) {
    const C = SCRAP;
    p.poly([[0.5, 0.08], [0.18, 0.3], [0.1, 0.94], [0.5, 0.94]], C.iron);
    p.poly([[0.5, 0.16], [0.24, 0.36], [0.18, 0.88], [0.5, 0.88]], C.plate);
    p.poly([[0.5, 0.5], [0.3, 0.56], [0.26, 0.88], [0.5, 0.88]], C.rust); // patch
    p.box(0.44, 0.14, 0.5, 0.9, C.weld);
    p.box(0.3, 0.18, 0.5, 0.3, C.hazard);                // the emitter, hazard-painted
    p.box(0.02, 0.4, 0.14, 0.8, C.rustLite);             // a salvaged capacitor
    p.box(0.04, 0.44, 0.12, 0.76, C.iron);
    p.box(0.2, 0.4, 0.24, 0.44, C.weld); p.box(0.2, 0.8, 0.24, 0.84, C.weld);
  },
  head3(p) {
    const C = SCRAP;
    p.disc(0.5, 0.56, 0.44, C.iron);
    p.disc(0.5, 0.56, 0.36, C.plate);
    p.poly([[0.5, 0.2], [0.14, 0.5], [0.5, 0.92]], C.rust); // a rusted quarter plate
    p.box(0.46, 0.1, 0.5, 0.98, C.weld);
    for (const [x, y] of [[0.3, 0.36], [0.28, 0.62]]) { p.ring(x, y, 0.1, 3, C.iron); p.disc(x, y, 0.06, C.weld); }
    p.box(0.08, 0.8, 0.5, 0.9, C.iron);
    for (let i = 0; i < 4; i++) p.box(0.1 + i * 0.1, 0.82, 0.15 + i * 0.1, 0.88, C.hazard); // hazard stripes at the back
  },
  head4(p) {
    const C = SCRAP;
    p.box(0.1, 0.4, 0.5, 0.96, C.iron);
    p.box(0.16, 0.46, 0.5, 0.9, C.plate);
    p.box(0.16, 0.66, 0.36, 0.9, C.rust);                // welded patch
    p.box(0.34, 0.46, 0.5, 0.64, C.rustLite);            // and another
    p.box(0.45, 0.42, 0.5, 0.96, C.weld);
    p.box(0.18, 0.02, 0.36, 0.56, C.iron);               // twin barrels
    p.box(0.18, 0.02, 0.36, 0.1, C.weld);
    p.box(0.22, 0.12, 0.32, 0.2, C.hazard); p.box(0.22, 0.26, 0.32, 0.34, C.hazard); // painted bands down the barrel
    p.box(0.02, 0.5, 0.12, 0.9, C.rustLite); p.box(0.04, 0.54, 0.1, 0.86, C.iron); // bolted-on rail
    for (const y of [0.5, 0.7, 0.86]) p.box(0.17, y, 0.21, y + 0.04, C.weld);
  },
  base(p) {
    const C = SCRAP;
    p.box(0.02, 0.02, 0.5, 0.98, C.iron);
    p.box(0.08, 0.08, 0.5, 0.92, C.plate);
    p.box(0.08, 0.5, 0.3, 0.92, C.rust);                 // a rusted quarter
    p.box(0.08, 0.08, 0.12, 0.92, C.hazard); p.dither(0.08, 0.08, 0.12, 0.92, C.weld); // hazard edge
  },
};


// ── FOUNDRY, THE ROSTER: seventeen heads on Mill's plating ──────────────
// One faction. Every head shares the gunmetal ramp and the bolted-plate
// language; what differs is the SHAPE (one silhouette a role) and the
// ACCENT, which is the colour of what the turret throws — copper for a
// bullet, olive for a shell, ember for flame, ice for a beam, water for
// water, mint for a field, salmon for a missile or flak. The accent is
// the thing's colour, never the rarity's (pixelArt.ts rule 4).
const STEEL = { deep: "#2c2d38", dark: "#4d4e58", mid: "#7b7b7b", lite: "#c1c3d4", white: "#f4f4f4" };
const ACCENT = {
  bullet: "#e07a3f",   // copper
  shell: "#a8b04a",    // olive brass
  flame: "#ec7458",    // ember
  beam: "#a9d8ff",     // lancer laser
  water: "#5c6dbb",    // Liquids.water
  field: "#8fe0b8",    // mint
  missile: "#f595be",  // thorium pink
};
const mill = {
  // 1x1 ────────────────────────────────────────────────────────────
  duo(p, A) {                                            // twin short barrels
    p.box(0.06, 0.32, 0.5, 0.96, STEEL.dark); p.box(0.12, 0.4, 0.5, 0.9, STEEL.mid);
    p.box(0.44, 0.42, 0.5, 0.9, A);
    p.box(0.2, 0.05, 0.34, 0.5, STEEL.lite); p.box(0.2, 0.05, 0.34, 0.14, STEEL.deep);
    p.box(0.06, 0.82, 0.5, 0.96, STEEL.deep);
  },
  hail(p, A) {                                           // one fat mortar mouth on a turntable
    p.disc(0.5, 0.56, 0.42, STEEL.dark); p.disc(0.5, 0.56, 0.34, STEEL.mid);
    p.ring(0.5, 0.44, 0.2, 3, STEEL.lite); p.disc(0.5, 0.44, 0.13, STEEL.deep);
    p.box(0.46, 0.66, 0.5, 0.94, A);
    p.box(0.1, 0.84, 0.5, 0.94, STEEL.deep);
  },
  scorch(p, A) {                                         // squat, a wide flat nozzle, a tank behind
    p.box(0.1, 0.36, 0.5, 0.9, STEEL.dark); p.box(0.16, 0.42, 0.5, 0.84, STEEL.mid);
    p.poly([[0.5, 0.06], [0.18, 0.1], [0.28, 0.42], [0.5, 0.42]], STEEL.lite);   // flared nozzle
    p.box(0.3, 0.12, 0.5, 0.22, A);
    p.disc(0.5, 0.74, 0.16, STEEL.deep); p.disc(0.5, 0.74, 0.1, A);            // fuel tank
  },
  arc(p, A) {                                            // a coil and a fork, no barrel
    p.disc(0.5, 0.6, 0.36, STEEL.dark); p.ring(0.5, 0.6, 0.3, 3, STEEL.mid); p.disc(0.5, 0.6, 0.16, STEEL.deep);
    p.disc(0.5, 0.6, 0.08, A);
    p.box(0.24, 0.04, 0.34, 0.4, STEEL.lite); p.box(0.24, 0.04, 0.34, 0.12, A);   // the prong
  },
  // 2x2 ────────────────────────────────────────────────────────────
  salvo(p, A) {                                          // three barrels in a row, a magazine behind
    p.box(0.1, 0.36, 0.5, 0.94, STEEL.dark); p.box(0.16, 0.42, 0.5, 0.88, STEEL.mid);
    p.box(0.16, 0.7, 0.5, 0.86, STEEL.deep); p.box(0.2, 0.74, 0.5, 0.82, A);    // magazine
    for (const x of [0.2, 0.44]) { p.box(x, 0.06, x + 0.1, 0.5, STEEL.lite); p.box(x, 0.06, x + 0.1, 0.14, STEEL.deep); }
    p.box(0.44, 0.06, 0.5, 0.14, STEEL.deep);
  },
  scatter(p, A) {                                        // a bell that flares forward
    p.disc(0.5, 0.62, 0.34, STEEL.dark); p.disc(0.5, 0.62, 0.28, STEEL.mid);
    p.poly([[0.5, 0.04], [0.14, 0.08], [0.3, 0.5], [0.5, 0.5]], STEEL.lite);      // the flare
    p.poly([[0.5, 0.12], [0.24, 0.14], [0.36, 0.44], [0.5, 0.44]], STEEL.dark);
    p.box(0.44, 0.14, 0.5, 0.44, A);
    p.box(0.08, 0.7, 0.5, 0.8, STEEL.deep); p.box(0.12, 0.72, 0.5, 0.78, A);
  },
  lancer(p, A) {                                         // a wedge, capacitors on the flanks
    p.poly([[0.5, 0.08], [0.2, 0.3], [0.12, 0.92], [0.5, 0.92]], STEEL.dark);
    p.poly([[0.5, 0.16], [0.26, 0.34], [0.2, 0.86], [0.5, 0.86]], STEEL.mid);
    p.box(0.44, 0.14, 0.5, 0.9, A);
    p.box(0.02, 0.4, 0.14, 0.8, STEEL.deep); p.box(0.04, 0.44, 0.12, 0.76, A);
    p.box(0.36, 0.18, 0.5, 0.3, STEEL.white); p.box(0.3, 0.7, 0.5, 0.82, STEEL.deep);
  },
  wave(p, A) {                                           // a tank with a window and a nozzle
    p.disc(0.5, 0.6, 0.38, STEEL.dark); p.disc(0.5, 0.6, 0.32, STEEL.mid);
    p.disc(0.5, 0.64, 0.2, A);                           // the water window
    p.disc(0.5, 0.64, 0.2, null); p.disc(0.5, 0.64, 0.2, A); p.over(o => o.disc(0.42, 0.56, 0.06, "#8aa3f4"));
    p.box(0.42, 0.04, 0.5, 0.36, STEEL.lite); p.box(0.42, 0.04, 0.5, 0.12, STEEL.deep);   // nozzle
    p.box(0.08, 0.5, 0.16, 0.7, STEEL.deep);
  },
  parallax(p, A) {                                       // a dish on a yoke, no barrel
    p.box(0.1, 0.7, 0.5, 0.94, STEEL.dark); p.box(0.16, 0.76, 0.5, 0.88, STEEL.mid);   // the yoke
    p.ring(0.5, 0.42, 0.36, 4, STEEL.lite); p.ring(0.5, 0.42, 0.28, 3, STEEL.dark);
    p.disc(0.5, 0.42, 0.22, STEEL.mid); p.disc(0.5, 0.42, 0.1, A);
    p.box(0.46, 0.04, 0.5, 0.28, A);                     // the feed horn, forward
  },
  swarmer(p, A) {                                        // a box of missile cells
    p.box(0.08, 0.2, 0.5, 0.94, STEEL.dark); p.box(0.14, 0.26, 0.5, 0.88, STEEL.mid);
    for (const y of [0.3, 0.48]) for (const x of [0.18, 0.36]) { p.box(x, y, x + 0.12, y + 0.12, STEEL.deep); p.box(x + 0.03, y + 0.03, x + 0.09, y + 0.09, A); }
    p.box(0.14, 0.7, 0.5, 0.88, STEEL.deep); p.box(0.46, 0.7, 0.5, 0.88, A);
  },
  // 3x3 ────────────────────────────────────────────────────────────
  fuse(p, A) {                                           // a broadside: three wide short tubes
    p.box(0.08, 0.36, 0.5, 0.94, STEEL.dark); p.box(0.14, 0.42, 0.5, 0.88, STEEL.mid);
    p.poly([[0.5, 0.42], [0.1, 0.42], [0.14, 0.1], [0.5, 0.1]], STEEL.dark);
    for (const x of [0.14, 0.36]) { p.box(x, 0.12, x + 0.16, 0.42, STEEL.lite); p.box(x, 0.12, x + 0.16, 0.18, A); }
    p.box(0.44, 0.44, 0.5, 0.88, A);
    p.box(0.14, 0.76, 0.5, 0.88, STEEL.deep);
  },
  ripple(p, A) {                                         // four ringed mouths
    p.disc(0.5, 0.55, 0.42, STEEL.dark); p.disc(0.5, 0.55, 0.36, STEEL.mid);
    p.box(0.46, 0.14, 0.5, 0.96, STEEL.dark);
    for (const [x, y] of [[0.3, 0.34], [0.3, 0.6]]) { p.ring(x, y, 0.1, 3, STEEL.lite); p.disc(x, y, 0.06, STEEL.deep); }
    p.box(0.1, 0.8, 0.5, 0.9, STEEL.deep); p.box(0.42, 0.06, 0.5, 0.22, A);
  },
  tsunami(p, A) {                                        // a great tank, twin nozzles
    p.disc(0.5, 0.6, 0.42, STEEL.dark); p.disc(0.5, 0.6, 0.36, STEEL.mid);
    p.disc(0.5, 0.64, 0.24, A); p.over(o => o.disc(0.4, 0.54, 0.07, "#8aa3f4"));
    p.box(0.26, 0.04, 0.36, 0.34, STEEL.lite); p.box(0.26, 0.04, 0.36, 0.12, STEEL.deep);
    p.box(0.46, 0.06, 0.5, 0.36, STEEL.deep);
    p.box(0.04, 0.5, 0.12, 0.74, STEEL.deep); p.box(0.1, 0.86, 0.5, 0.94, STEEL.deep);
  },
  cyclone(p, A) {                                        // a rotary: three barrels in a cluster, a drum behind
    p.disc(0.5, 0.64, 0.34, STEEL.dark); p.disc(0.5, 0.64, 0.28, STEEL.mid);      // the drum
    p.ring(0.5, 0.64, 0.28, 3, A);
    p.box(0.3, 0.06, 0.38, 0.5, STEEL.lite); p.box(0.3, 0.06, 0.38, 0.12, STEEL.deep);
    p.box(0.44, 0.02, 0.5, 0.46, STEEL.lite); p.box(0.44, 0.02, 0.5, 0.08, STEEL.deep);
    p.box(0.28, 0.42, 0.5, 0.5, STEEL.deep);             // the barrel clamp
    p.box(0.1, 0.84, 0.5, 0.94, STEEL.deep);
  },
  // 4x4 ────────────────────────────────────────────────────────────
  spectre(p, A) {                                        // long twin barrels, radiator rails
    p.box(0.14, 0.4, 0.5, 0.94, STEEL.dark); p.box(0.2, 0.46, 0.5, 0.88, STEEL.mid);
    p.box(0.45, 0.42, 0.5, 0.94, A);
    p.box(0.2, 0.02, 0.38, 0.56, STEEL.lite); p.box(0.2, 0.02, 0.38, 0.1, STEEL.deep); p.box(0.26, 0.12, 0.32, 0.46, STEEL.dark);
    p.box(0.04, 0.46, 0.14, 0.9, STEEL.deep); p.box(0.06, 0.5, 0.12, 0.86, A);
    p.box(0.28, 0.62, 0.5, 0.86, STEEL.deep); p.box(0.44, 0.66, 0.5, 0.82, STEEL.white);
  },
  meltdown(p, A) {                                       // one great emitter, three capacitor banks, no barrel
    p.poly([[0.5, 0.04], [0.2, 0.2], [0.08, 0.94], [0.5, 0.94]], STEEL.dark);
    p.poly([[0.5, 0.12], [0.26, 0.26], [0.16, 0.88], [0.5, 0.88]], STEEL.mid);
    p.ring(0.5, 0.34, 0.2, 4, STEEL.lite); p.disc(0.5, 0.34, 0.14, A); p.disc(0.5, 0.34, 0.06, STEEL.white);   // the lens
    p.box(0.46, 0.56, 0.5, 0.88, A);
    for (const y of [0.4, 0.58, 0.76]) { p.box(0.02, y, 0.14, y + 0.12, STEEL.deep); p.box(0.04, y + 0.03, 0.12, y + 0.09, A); }
    p.box(0.2, 0.6, 0.42, 0.84, STEEL.deep);
  },
  foreshadow(p, A) {                                     // one rail, accelerator rings along it
    p.box(0.16, 0.5, 0.5, 0.96, STEEL.dark); p.box(0.22, 0.56, 0.5, 0.9, STEEL.mid);
    p.box(0.38, 0.0, 0.5, 0.64, STEEL.lite); p.box(0.44, 0.02, 0.5, 0.6, STEEL.dark);      // the rail
    for (const y of [0.08, 0.22, 0.36, 0.5]) p.box(0.32, y, 0.5, y + 0.06, A);              // the rings
    p.box(0.04, 0.6, 0.16, 0.92, STEEL.deep); p.box(0.06, 0.64, 0.14, 0.88, STEEL.lite);   // stabiliser
    p.box(0.28, 0.66, 0.5, 0.84, STEEL.deep); p.box(0.44, 0.7, 0.5, 0.8, A);
  },
};
/** the roster: size in cells, the accent group, a name in our own words */
const ROSTER = {
  duo: [1, "bullet", "Pinion"], hail: [1, "shell", "Lobber"], scorch: [1, "flame", "Torch"], arc: [1, "beam", "Sparker"],
  salvo: [2, "bullet", "Triplet"], scatter: [2, "missile", "Bellow"], lancer: [2, "beam", "Kiln"], wave: [2, "water", "Sluice"],
  parallax: [2, "field", "Halo"], swarmer: [2, "missile", "Quiver"],
  fuse: [3, "flame", "Broadside"], ripple: [3, "shell", "Bombard"], tsunami: [3, "water", "Floodgate"], cyclone: [3, "missile", "Grindstone"],
  spectre: [4, "bullet", "Crucible"], meltdown: [4, "beam", "Furnace"], foreshadow: [4, "beam", "Railspike"],
};

// ── VERDANCE: plants; the head turns toward the swarm like a heliotrope ─
const verdance = {
  // 1x1 pepperpod: two seed pods on a leaf whorl
  head1(p) {
    const C = VERDANCE;
    p.disc(0.5, 0.66, 0.34, C.deep);                     // leaf whorl
    p.poly([[0.5, 0.66], [0.06, 0.6], [0.16, 0.9]], C.leaf); // leaf, running down
    p.poly([[0.5, 0.66], [0.1, 0.44], [0.4, 0.34]], C.leaf);
    p.box(0.22, 0.08, 0.36, 0.56, C.pale);               // pod
    p.box(0.22, 0.08, 0.36, 0.18, C.blossom);            // pod tip
    p.box(0.46, 0.4, 0.5, 0.9, C.bark);                  // stem, down the middle
  },
  // 2x2 sunsnare: a sunflower — petal ring, dark seed disc, bright lens
  head2(p) {
    const C = VERDANCE;
    for (let i = 0; i < 12; i++) {                       // petals, left half
      const a = (i / 12) * Math.PI * 2; const cx = 0.5 + Math.cos(a) * 0.36, cy = 0.5 + Math.sin(a) * 0.36;
      if (cx <= 0.52) p.disc(cx, cy, 0.11, C.seed);
    }
    p.disc(0.5, 0.5, 0.3, C.bark);                       // seed head
    p.dither(0.2, 0.2, 0.5, 0.8, C.deep);
    p.disc(0.5, 0.5, 0.3, null) ; p.disc(0.5, 0.5, 0.3, C.bark); p.over(o => o.dither(0.2, 0.2, 0.5, 0.8, C.deep));
    p.box(0.46, 0.8, 0.5, 1.0, C.leaf);                  // stem at the back
    p.poly([[0.5, 0.86], [0.24, 0.92], [0.44, 1.0]], C.leaf);
    p.disc(0.5, 0.3, 0.08, C.pale);                      // the lens, at the front
  },
  // 3x3 pitcher: a hooded bulb that lobs seed shells
  head3(p) {
    const C = VERDANCE;
    p.poly([[0.5, 0.1], [0.26, 0.2], [0.14, 0.5], [0.2, 0.9], [0.5, 0.96]], C.deep); // bulb
    p.poly([[0.5, 0.18], [0.32, 0.26], [0.22, 0.5], [0.28, 0.86], [0.5, 0.9]], C.leaf);
    p.box(0.42, 0.2, 0.5, 0.88, C.pale);                 // vein, down the spine
    p.ring(0.5, 0.3, 0.16, 3, C.blossom);                // mouth
    p.disc(0.5, 0.3, 0.1, C.bark);
    p.poly([[0.5, 0.02], [0.3, 0.12], [0.5, 0.2]], C.blossom); // hood
    p.poly([[0.16, 0.92], [0.02, 0.72], [0.3, 0.8]], C.leaf); // basal leaf
  },
  // 4x4 maw: a flytrap — two lobes, teeth, a thick stalk behind
  head4(p) {
    const C = VERDANCE;
    p.poly([[0.5, 0.12], [0.2, 0.16], [0.06, 0.4], [0.08, 0.66], [0.26, 0.8], [0.5, 0.82]], C.deep); // lobe
    p.poly([[0.5, 0.2], [0.26, 0.24], [0.14, 0.42], [0.16, 0.64], [0.3, 0.74], [0.5, 0.76]], C.blossom); // inner
    p.box(0.46, 0.1, 0.5, 0.84, C.bark);                 // the hinge, a dark gap down the middle
    for (let i = 0; i < 6; i++) {                        // teeth along the outer rim, pointing out
      const a = Math.PI * (0.55 + i * 0.13); const cx = 0.5 + Math.cos(a) * 0.36, cy = 0.47 + Math.sin(a) * 0.36;
      p.poly([[cx + Math.cos(a - 0.14) * 0.06, cy + Math.sin(a - 0.14) * 0.06], [cx + Math.cos(a) * 0.14, cy + Math.sin(a) * 0.14], [cx + Math.cos(a + 0.14) * 0.06, cy + Math.sin(a + 0.14) * 0.06]], C.pale);
    }
    p.box(0.42, 0.78, 0.5, 1.0, C.bark);                 // stalk at the back
    p.poly([[0.5, 0.86], [0.16, 0.88], [0.34, 1.0]], C.leaf);
    for (const [x, y] of [[0.3, 0.34], [0.24, 0.52], [0.34, 0.62]]) p.box(x, y, x + 0.06, y + 0.06, C.seed); // trigger hairs
  },
  base(p) {
    const C = VERDANCE;
    p.box(0.02, 0.02, 0.5, 0.98, C.bark);
    p.dither(0.02, 0.02, 0.5, 0.98, "#4a3220");
    p.box(0.1, 0.1, 0.5, 0.9, C.deep);                   // moss mat
    p.dither(0.1, 0.1, 0.5, 0.9, "#3a7a44");
    p.box(0.02, 0.44, 0.14, 0.56, C.bark); p.box(0.44, 0.02, 0.5, 0.12, C.bark); // roots crossing the rim
  },
};

// ── HIVE: chitin and wax; the insect look the swarm was refused ─────────
const hive = {
  // 1x1 stinger: a wasp abdomen, twin stings forward
  head1(p) {
    const C = HIVE;
    p.disc(0.5, 0.6, 0.4, C.shell);
    p.over(o => { o.box(0.28, 0.2, 0.36, 1, C.chitin); o.box(0.44, 0.2, 0.5, 1, C.chitin); }); // stripes DOWN the body
    p.box(0.18, 0.06, 0.28, 0.5, C.sting);
    p.box(0.18, 0.06, 0.28, 0.14, C.wax);
    p.box(0.1, 0.72, 0.5, 0.92, C.chitin);
  },
  // 2x2 glowlamp: a firefly — carapace behind, lantern forward
  head2(p) {
    const C = HIVE;
    p.poly([[0.5, 0.1], [0.22, 0.2], [0.1, 0.5], [0.16, 0.9], [0.5, 0.94]], C.chitin);
    p.poly([[0.5, 0.18], [0.28, 0.26], [0.18, 0.5], [0.24, 0.86], [0.5, 0.88]], C.shell);
    p.box(0.44, 0.2, 0.5, 0.9, C.chitin);                // elytra seam
    p.disc(0.5, 0.36, 0.22, C.wax);                      // the lantern
    p.disc(0.5, 0.36, 0.13, C.honey);
    p.box(0.02, 0.36, 0.12, 0.6, C.shellLite);           // wing case edge
  },
  // 3x3 mound: a termite mound from above, vents forward
  head3(p) {
    const C = HIVE;
    p.disc(0.5, 0.54, 0.44, C.shell);
    p.disc(0.5, 0.54, 0.34, C.shellLite);
    p.disc(0.5, 0.54, 0.22, C.shell);
    p.box(0.46, 0.1, 0.5, 0.98, C.chitin);               // the ridge, down the spine
    for (const [x, y] of [[0.3, 0.32], [0.24, 0.56]]) { p.disc(x, y, 0.08, C.chitin); p.disc(x, y, 0.04, C.honey); } // vents
    p.box(0.1, 0.84, 0.5, 0.94, C.chitin);
  },
  // 4x4 brood: a comb block, a queen cell, four stinger tubes
  head4(p) {
    const C = HIVE;
    p.box(0.1, 0.34, 0.5, 0.96, C.chitin);
    p.box(0.16, 0.4, 0.5, 0.9, C.shell);
    for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) {   // hex cells as offset discs
      const x = 0.22 + c * 0.11 + (r % 2) * 0.055, y = 0.48 + r * 0.11;
      if (x <= 0.5) p.disc(x, y, 0.035, C.wax);
    }
    p.disc(0.5, 0.66, 0.11, C.honey); p.disc(0.5, 0.66, 0.06, C.wax);   // queen cell
    p.box(0.2, 0.02, 0.3, 0.48, C.sting); p.box(0.2, 0.02, 0.3, 0.1, C.wax); // outer sting
    p.box(0.38, 0.12, 0.46, 0.44, C.sting); p.box(0.38, 0.12, 0.46, 0.2, C.wax); // inner sting
    p.box(0.02, 0.5, 0.12, 0.84, C.shellLite);
  },
  base(p) {
    const C = HIVE;
    p.box(0.02, 0.02, 0.5, 0.98, C.chitin);
    p.box(0.08, 0.08, 0.5, 0.92, C.shell);
    p.dither(0.08, 0.08, 0.5, 0.92, "#7a4c24");           // comb texture, kept quiet under the head
    p.box(0.08, 0.08, 0.16, 0.16, C.wax); p.box(0.08, 0.84, 0.16, 0.92, C.wax); // wax caps at the corners
  },
};

// ── RELIQUARY: old stone, jade and gilt; the guardians of a ruin ────────
const reliquary = {
  // 1x1 ward: a carved block with twin jade slots
  head1(p) {
    const C = RELIQUARY;
    p.box(0.08, 0.14, 0.5, 0.94, C.dark);
    p.box(0.14, 0.2, 0.5, 0.88, C.stone);
    p.box(0.44, 0.2, 0.5, 0.88, C.gilt);                 // gilt seam, down the middle
    p.box(0.22, 0.04, 0.34, 0.46, C.lite);               // carved barrel
    p.box(0.24, 0.1, 0.32, 0.2, C.jade);
    p.box(0.08, 0.8, 0.5, 0.94, C.dark);
  },
  // 2x2 lens: a jade lens in a gilt frame, stone housing
  head2(p) {
    const C = RELIQUARY;
    p.poly([[0.5, 0.06], [0.16, 0.24], [0.1, 0.92], [0.5, 0.92]], C.dark);
    p.poly([[0.5, 0.14], [0.24, 0.3], [0.18, 0.86], [0.5, 0.86]], C.stone);
    p.ring(0.5, 0.42, 0.24, 3, C.gilt);                  // the frame
    p.disc(0.5, 0.42, 0.18, C.jade);
    p.disc(0.5, 0.36, 0.06, C.lite);
    p.box(0.44, 0.7, 0.5, 0.92, C.gilt);
    p.box(0.02, 0.44, 0.12, 0.8, C.dark);
  },
  // 3x3 censer: a stone urn, its mouth glowing
  head3(p) {
    const C = RELIQUARY;
    p.disc(0.5, 0.56, 0.42, C.dark);
    p.disc(0.5, 0.56, 0.34, C.stone);
    p.ring(0.5, 0.36, 0.16, 3, C.gilt);                  // the mouth
    p.disc(0.5, 0.36, 0.11, C.dark);
    p.disc(0.5, 0.36, 0.06, C.ember);
    p.box(0.46, 0.06, 0.5, 0.98, C.gilt);                // gilt seam
    p.box(0.1, 0.78, 0.5, 0.9, C.dark); p.box(0.14, 0.82, 0.5, 0.86, C.jade); // jade band at the back
    p.box(0.04, 0.4, 0.14, 0.72, C.dark);                // handle
  },
  // 4x4 sun disc: a gilt disc with rays, a jade core, a stone cradle
  head4(p) {
    const C = RELIQUARY;
    p.box(0.14, 0.6, 0.5, 0.96, C.dark);                 // cradle
    p.box(0.2, 0.66, 0.5, 0.9, C.stone);
    for (let i = 0; i < 16; i++) {                       // rays
      const a = (i / 16) * Math.PI * 2; const x = 0.5 + Math.cos(a) * 0.42, y = 0.42 + Math.sin(a) * 0.42;
      if (x <= 0.52) p.poly([[0.5 + Math.cos(a - 0.12) * 0.28, 0.42 + Math.sin(a - 0.12) * 0.28], [x, y], [0.5 + Math.cos(a + 0.12) * 0.28, 0.42 + Math.sin(a + 0.12) * 0.28]], C.gilt);
    }
    p.disc(0.5, 0.42, 0.3, C.gilt);
    p.disc(0.5, 0.42, 0.24, C.lite);
    p.disc(0.5, 0.42, 0.15, C.jade);
    p.disc(0.5, 0.42, 0.07, C.ember);
    p.box(0.46, 0.02, 0.5, 0.14, C.gilt);                // the ray that aims
  },
  base(p) {
    const C = RELIQUARY;
    p.box(0.02, 0.02, 0.5, 0.98, C.dark);
    p.box(0.06, 0.06, 0.5, 0.94, C.stone);
    p.box(0.06, 0.48, 0.5, 0.52, C.dark); p.box(0.28, 0.06, 0.32, 0.94, C.dark); // flagstone joints
    p.box(0.44, 0.44, 0.5, 0.56, C.gilt);                // inlay at the centre
  },
};

// ── render ────────────────────────────────────────────────────────────
const OUT = "docs/turret-concepts";
mkdirSync(OUT, { recursive: true });
const FACTIONS = { foundry, verdance, hive, reliquary, boiler, blackline, ceramic, scrap };
const SIZES = [1, 2, 3, 4];
const OUTLINE = "#404049";
for (const [name, f] of Object.entries(FACTIONS)) {
  for (const s of SIZES) {
    const n = 32 * s;
    const head = grid(n); f[`head${s}`](head.pen); mirror(head.px, n);
    writeFileSync(`${OUT}/${name}-${s}.png`, png(outline(head.px, n, OUTLINE), n, n));
    const base = grid(n); f.base(base.pen); mirror(base.px, n);
    writeFileSync(`${OUT}/${name}-base-${s}.png`, png(base.px, n, n));
  }
}
for (const [kind, [size, group]] of Object.entries(ROSTER)) {
  const n = 32 * size;
  const g = grid(n); mill[kind](g.pen, ACCENT[group]); mirror(g.px, n);
  writeFileSync(`${OUT}/mill-${kind}.png`, png(outline(g.px, n, OUTLINE), n, n));
}
writeFileSync(`${OUT}/roster.json`, JSON.stringify({ roster: ROSTER, accent: ACCENT }, null, 2));
console.log(`wrote ${Object.keys(FACTIONS).length * SIZES.length * 2} sprites to ${OUT}/`);
