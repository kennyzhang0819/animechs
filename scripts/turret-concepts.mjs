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
const FACTIONS = { foundry, verdance, hive, reliquary };
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
console.log(`wrote ${Object.keys(FACTIONS).length * SIZES.length * 2} sprites to ${OUT}/`);
