// BOTANICA, A CONCEPT SHEET: the second player faction as plants and
// fruit, drawn to exactly the rules the Foundry heads obey (game/turretArt.ts:
// flat plates, a material's dark on the left and light on the right,
// nothing under two pixels, pixel-authored on the stock grids) so the two
// factions sit on one board. Every head keeps its Foundry role cue — the
// twin gun is two pods, the mortar a mouth, the heavy stems longer than
// its body — and the accent is what it throws, as a fruit.
//
//   node --experimental-strip-types scripts/botanica-concepts.mjs
//
// Writes docs/turret-concepts/botanica-<kind>.png and botanica-base-N.png
// (the faction's own bed instead of Mindustry's plate) and reports any
// one-pixel stroke, like scripts/turret-concepts.mjs does for Foundry.
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { BORE, ROSTER, bars, draw, plate, rev, stud } from "../game/turretArt.ts";

// ── materials: a plant's, never a machine's ────────────────────────────
const BARK = ["#5a3d26", "#8a6238"];     // stems, canes, trunks
const LEAF = ["#3f7f3c", "#6fb85a"];     // the body: leaves and hulls
const LEAF_R = rev(LEAF);                // a leaf's underside, the bevel
const PALE = ["#9fd47c", "#d4f0b0"];     // petals, lips, veins, the light
const MOSS = ["#2f5a2e", "#4a8a48"];     // the bed under a plant
/** what a turret throws, as a fruit — none of these is a rarity band or
 *  a family hue (crux red, acid, gold, magenta, teal, violet) */
const ACCENT = {
  bullet: ["#8a5a2b", "#c9924e"],   // hazelnut: a hard seed
  shell: ["#c8641e", "#f5a142"],    // pumpkin: a lobbed gourd
  flame: ["#c9401e", "#f27a3c"],    // chili
  beam: ["#4e57a0", "#7f8fe0"],     // blueberry
  water: ["#3f4c96", "#5c6dbb"],    // water, the same as Foundry's
  field: ["#4fa88a", "#8fe0b8"],    // sage
  missile: ["#9c3060", "#e0609a"],  // raspberry: a burst of seeds
};

// ── the parts a plant is built from ─────────────────────────────────────
/** a pod on a stem: a bark stem, a fruit tip with a dark mouth, a pale
 *  calyx at the root — the twin gun's barrel, as a plant */
function pod(P, x0, x1, y0, y1, A, o = {}) {
  const lip = o.lip ?? 2, tip = o.tip ?? 5, calyx = o.calyx ?? 3, mouth = o.mouth ?? 2;
  P.box(x0, y0, x1, y1, BARK);
  P.box(x0 - lip, y0, x1 + lip, y0 + tip, A);
  P.box(x0 + mouth, y0, x1 - mouth, y0 + Math.max(2, tip - 2), BORE);
  for (const y of o.leaves ?? []) P.box(x0 - lip, y, x1 + lip, y + 3, LEAF);
  if (calyx > 0) P.box(x0 - lip, y1 - calyx, x1 + lip, y1, PALE);
}
/** a ring of petals: a pale ring with a leaf ring inside it */
function petals(P, cx, cy, r, w) { P.ring(cx, cy, r, w, PALE); }
/** a berry: a fruit disc with a pale highlight kept off the midline */
function berry(P, cx, cy, r, A) { P.disc(cx, cy, r, A); if (r >= 4) P.disc(cx - 1, cy - 1, 1, rev(A)); }
/** thorns: studs in bark */
const thorn = (P, x, y, r = 2) => stud(P, x, y, r, BARK);

// ── the heads, on the Foundry roster's grids and roles ─────────────────
const HEADS = {
  // 1x1, 32 px ───────────────────────────────────────────────────────
  duo(P, A) {                                            // a leaf whorl, two pods, a seed drum
    P.disc(16, 18, 10, LEAF);
    P.disc(16, 20, 6, LEAF_R);
    pod(P, 9, 13, 3, 16, A, { lip: 2, tip: 4, calyx: 4, mouth: 1 });
    P.box(14, 12, 18, 22, A);                             // the seed drum
  },
  hail(P, A) {                                           // a pitcher plant: a lipped mouth on a leaf
    plate(P, 5, 8, 27, 29, 5, LEAF);
    P.ring(16, 17, 7, 3, PALE);                           // the lip
    P.disc(16, 17, 4, A);
    P.disc(16, 17, 2, BORE);
    P.box(10, 21, 22, 29, BARK);                          // the root rack
    P.box(14, 23, 18, 27, A);                             // a gourd in it
  },
  scorch(P, A) {                                         // a chili: a round pod, the stem up top
    P.disc(16, 19, 9, A);
    P.ring(16, 19, 9, 3, rev(A));
    P.disc(16, 19, 5, LEAF);
    P.disc(16, 19, 2, PALE);
    P.box(12, 3, 20, 12, BARK);                           // the stem
    P.box(14, 3, 18, 6, BORE);
    P.box(11, 6, 21, 8, LEAF);                            // the calyx
    P.box(11, 8, 21, 12, PALE);
    P.box(5, 14, 8, 24, BARK);                            // a root on the flank
  },
  arc(P, A) {                                            // a thistle: a bur, one spike
    plate(P, 5, 12, 27, 29, 4, LEAF, 0);
    P.disc(16, 18, 8, A);                                 // the bur
    P.disc(16, 18, 5, PALE);
    P.disc(16, 18, 2, A);
    P.box(12, 3, 20, 12, BARK);                           // the spike
    P.box(14, 3, 18, 7, BORE);
    P.box(12, 9, 20, 12, A);                              // the bur's collar, the bur's colour
    P.box(5, 16, 9, 24, A);                               // a bud on the flank
  },
  // 2x2, 64 px ───────────────────────────────────────────────────────
  salvo(P, A) {                                          // a seed cluster: three pods on a whorl
    P.disc(32, 36, 20, LEAF);
    P.ring(32, 36, 20, 4, LEAF_R);
    pod(P, 14, 20, 4, 30, A, { leaves: [14], calyx: 3 });
    pod(P, 29, 35, 4, 30, A, { leaves: [14], calyx: 3 });
    berry(P, 32, 40, 8, A);                               // the seed drum
    P.disc(32, 40, 4, PALE);
    P.box(8, 34, 20, 46, BARK);                           // a root pod on the rim
    bars(P, 22, 26, 44, 2, 2, 2);
  },
  scatter(P, A) {                                        // a puffball: twin fat pods, a spore dish
    plate(P, 8, 24, 56, 58, 8, LEAF, 4);
    pod(P, 12, 24, 6, 34, A, { lip: 2, tip: 8, calyx: 5, mouth: 3, leaves: [18] });
    P.ring(32, 20, 6, 3, PALE);                           // the spore dish
    P.disc(32, 20, 3, A);
    P.octa(14, 40, 50, 54, 4, BARK);                      // the seed bed
    P.box(18, 44, 46, 51, LEAF);
    berry(P, 22, 47, 1, A); P.box(28, 46, 36, 49, A);     // berries in it
    bars(P, 10, 14, 32, 2, 2, 2);
  },
  lancer(P, A) {                                         // a sunflower: a seed head, a stem, leaf pods
    P.disc(32, 34, 21, BARK);
    petals(P, 32, 34, 21, 5);
    P.box(24, 4, 40, 22, BARK);                           // the stem
    P.box(28, 4, 36, 9, BORE);
    P.box(28, 12, 36, 18, A);                             // the bud
    P.box(8, 26, 19, 44, LEAF);                           // leaf pods, over the petals' inner edge
    bars(P, 8, 19, 29, 3, 2, 3, LEAF_R);
    P.box(28, 22, 36, 48, A);                             // the charge, down the stem
    P.box(19, 34, 44, 44, LEAF_R);                        // a leaf collar, butted to the pods
    P.box(28, 34, 36, 44, PALE);
    P.box(28, 50, 36, 56, A);
  },
  wave(P, A) {                                           // a gourd tank
    plate(P, 8, 22, 56, 58, 8, LEAF, 4);
    P.disc(32, 40, 13, PALE);                             // the window's rind
    P.disc(32, 40, 10, A);
    P.disc(27, 36, 2, rev(A));
    P.box(26, 4, 38, 28, BARK);                           // the stem spout
    P.box(22, 4, 42, 9, LEAF);
    P.box(28, 4, 36, 9, BORE);
    P.box(24, 12, 40, 18, A);                             // the valve
    P.box(10, 30, 16, 50, BARK); P.box(12, 32, 14, 48, A);   // a root on the flank
    P.box(28, 54, 36, 58, A);
  },
  parallax(P, A) {                                       // a bloom on a stalk
    plate(P, 10, 30, 54, 58, 6, LEAF, 3);
    P.box(6, 32, 12, 52, BARK); P.box(8, 34, 10, 50, rev(BARK));   // the stalk's arms
    plate(P, 12, 6, 52, 38, 12, PALE, 4);                 // the petals
    P.octa(18, 12, 46, 32, 8, LEAF_R);
    P.octa(24, 16, 40, 28, 4, A);                         // the pistil
    P.box(30, 20, 34, 24, PALE);
    P.box(28, 4, 36, 12, BARK); P.box(26, 4, 38, 7, A);   // the stamen
    thorn(P, 16, 50);
  },
  swarmer(P, A) {                                        // a seed pod: four seeds in a leaf hull
    P.disc(32, 32, 22, LEAF);
    P.ring(32, 32, 22, 4, LEAF_R);
    for (const cy of [26, 38]) { P.disc(23, cy, 4, BORE); berry(P, 23, cy, 2, A); }   // the seeds
    P.box(28, 20, 36, 44, BARK);                          // the spine
    P.box(30, 24, 34, 40, PALE);
    P.box(20, 48, 44, 55, A);                             // the reload rail, ripe
  },
  // 3x3, 96 px ───────────────────────────────────────────────────────
  fuse(P, A) {                                           // a maw: a drum with one wide trap face
    P.disc(48, 52, 36, LEAF);
    P.ring(48, 52, 36, 6, LEAF_R);
    plate(P, 14, 8, 82, 32, 8, PALE, 4);                  // the trap face
    P.box(20, 12, 26, 28, BORE); P.box(32, 12, 38, 28, BORE); P.box(44, 12, 52, 28, BORE);   // the gaps between teeth
    P.box(16, 30, 80, 38, A);                             // the hinge, hot
    berry(P, 48, 58, 12, A);                              // the breech
    P.disc(48, 58, 6, PALE);
    P.disc(48, 58, 2, BORE);
    P.box(12, 48, 24, 66, BARK);                          // a root rack on the rim
    P.box(14, 50, 18, 54, A); P.box(14, 56, 18, 60, A);
  },
  ripple(P, A) {                                         // a melon patch: four gourds on a leaf, vines between
    plate(P, 8, 8, 88, 90, 14, LEAF, 6);
    for (const cy of [30, 66]) { P.ring(30, cy, 14, 5, PALE); berry(P, 30, cy, 9, A); P.disc(30, cy, 5, BORE); }
    P.box(42, 12, 54, 86, BARK);                          // the vines
    P.box(12, 42, 84, 54, BARK);
    P.diamond(48, 48, 3, A);
  },
  tsunami(P, A) {                                        // a great gourd, twin spouts
    plate(P, 6, 20, 90, 90, 12, LEAF, 5);
    P.disc(48, 56, 24, PALE);                             // the rind, two rows under the vine
    P.disc(48, 56, 20, A);
    P.disc(40, 48, 4, rev(A));
    pod(P, 24, 36, 4, 24, A, { lip: 2, tip: 6, calyx: 0, mouth: 3 });
    P.box(8, 20, 88, 30, BARK);                           // the vine across the front
    P.box(44, 22, 52, 28, A);
    P.box(10, 34, 16, 78, BARK); P.box(12, 36, 14, 76, A);   // a root on the flank
    P.box(42, 83, 54, 90, A);
  },
  cyclone(P, A) {                                        // a bramble: three canes, a berry drum
    plate(P, 10, 30, 86, 90, 14, LEAF, 5);
    pod(P, 24, 32, 12, 44, A, { lip: 2, tip: 6, calyx: 4, mouth: 2, leaves: [24] });
    pod(P, 44, 52, 4, 44, A, { lip: 2, tip: 6, calyx: 4, mouth: 2, leaves: [16] });
    P.ring(48, 66, 20, 5, A);                             // the drum, a ring of berries
    P.disc(48, 66, 15, LEAF_R);
    berry(P, 48, 66, 6, A);
    P.disc(48, 66, 3, PALE);
    P.box(12, 50, 20, 76, BARK); P.box(14, 52, 18, 74, A);   // the cane feeding it
    thorn(P, 24, 58); thorn(P, 24, 66); thorn(P, 24, 74);
  },
  // 4x4, 128 px ──────────────────────────────────────────────────────
  spectre(P, A) {                                        // an ironwood: a stump, twin trunks, fronds
    P.disc(64, 72, 50, BARK);
    P.ring(64, 72, 50, 8, LEAF);
    pod(P, 32, 48, 6, 64, A, { lip: 4, tip: 10, calyx: 6, mouth: 4, leaves: [22, 32, 44] });
    P.octa(50, 24, 78, 56, 6, rev(BARK));                 // the knot between the trunks
    P.box(56, 30, 72, 50, A);
    P.box(60, 34, 68, 46, PALE);
    P.octa(8, 60, 28, 92, 4, LEAF);                       // fronds over the rim
    bars(P, 10, 22, 64, 3, 4, 4, LEAF_R);
    berry(P, 64, 84, 14, A);                              // the great fruit
    P.disc(64, 84, 7, PALE);
    P.disc(64, 84, 3, BORE);
    thorn(P, 48, 104, 3);
  },
  meltdown(P, A) {                                       // a sunburst: a bloom with a bud above it
    P.disc(64, 68, 54, LEAF);
    petals(P, 64, 68, 54, 8);
    plate(P, 40, 6, 88, 30, 10, PALE, 4);                 // the bud
    P.box(58, 6, 70, 14, BORE);
    P.box(58, 18, 70, 26, A);
    P.ring(64, 50, 18, 6, PALE);                          // the sun-fruit
    P.ring(64, 50, 12, 3, rev(A));
    P.disc(64, 50, 9, A);
    P.disc(64, 50, 3, PALE);
    P.octa(6, 52, 23, 84, 4, A);                          // seed pods on the rim
    bars(P, 8, 20, 56, 3, 4, 6, rev(A));
    P.box(58, 66, 70, 106, BARK);                         // the stem
    P.box(44, 78, 84, 94, LEAF_R);                        // a leaf collar
    P.box(58, 78, 70, 94, PALE);
    bars(P, 42, 54, 98, 2, 3, 3);
  },
  foreshadow(P, A) {                                     // twin canes: two long thorn spears
    plate(P, 16, 60, 112, 122, 16, LEAF, 6);
    for (const x of [40]) {
      P.box(x, 2, x + 12, 76, BARK);                      // a cane
      P.box(x - 4, 2, x + 16, 10, PALE);                  // its thorn tip
      P.box(x + 4, 2, x + 8, 72, BORE);
      for (const y of [14, 30, 46]) { P.box(x - 6, y, x + 18, y + 8, LEAF); P.box(x - 4, y + 2, x + 16, y + 6, LEAF_R); }   // leaf collars
    }
    P.box(58, 20, 70, 60, rev(BARK));                     // the bridge between them
    P.box(60, 26, 68, 54, A);
    P.box(62, 32, 66, 48, PALE);
    P.box(4, 76, 20, 106, BARK);                          // roots
    P.box(8, 80, 16, 102, LEAF);
    bars(P, 8, 16, 84, 3, 4, 3, BARK);
    P.octa(40, 84, 88, 118, 8, LEAF_R);                   // the bulb
    P.box(52, 90, 76, 112, A);
    P.box(58, 96, 70, 106, PALE);
    thorn(P, 34, 74, 3);
  },
};

/** the faction's bed: bark with a bevel, moss inside, on the plate's grids */
function bed(n) {
  const c = n / 8, b = Math.max(2, n / 16);
  return draw(n, (P) => {
    plate(P, 0, 0, n, n, c, BARK, b);
    P.octa(b + 1, b + 1, n - b - 1, n - b - 1, c, MOSS);
  });
}

// ── PNG, by hand ───────────────────────────────────────────────────────
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (b) => { let c = 0xffffffff; for (const x of b) c = CRC[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type, "ascii"), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]); }
function png(px, n) {
  const raw = Buffer.alloc((n * 4 + 1) * n);
  for (let y = 0; y < n; y++) { raw[y * (n * 4 + 1)] = 0; for (let x = 0; x < n; x++) { const c = px[y * n + x]; const o = y * (n * 4 + 1) + 1 + x * 4; if (c === null) { raw.fill(0, o, o + 4); continue; } raw[o] = parseInt(c.slice(1, 3), 16); raw[o + 1] = parseInt(c.slice(3, 5), 16); raw[o + 2] = parseInt(c.slice(5, 7), 16); raw[o + 3] = 255; } }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(n, 0); ihdr.writeUInt32BE(n, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

// ── render, and refuse a one-pixel stroke ──────────────────────────────
const OUT = "docs/turret-concepts";
mkdirSync(OUT, { recursive: true });
let flagged = 0; const dumped = {};
const jobs = Object.entries(ROSTER).map(([kind, { size, ammo }]) => [`botanica-${kind}`, () => draw(32 * size, (P) => HEADS[kind](P, ACCENT[ammo]))]);
for (const s of [1, 2, 3, 4]) jobs.push([`botanica-base-${s}`, () => bed(32 * s)]);
for (const [name, make] of jobs) {
  const { n, px } = make();
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const c = px[y * n + x]; if (c === null) continue;
    const at = (X, Y) => (X < 0 || Y < 0 || X >= n || Y >= n ? null : px[Y * n + X]);
    const nb = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && at(x + dx, y + dy) === c) nb.push([dx, dy]);
    if (nb.length === 0 || nb.every(([dx, dy]) => dx * nb[0][1] - dy * nb[0][0] === 0)) {
      flagged++;
      if (process.env.ALL || flagged <= 40) console.log(`  ${name}: one-wide at ${x},${y} ${c}`);
      if (process.env.DUMP && !(dumped[name] ??= new Set()).has(`${x >> 3},${y >> 3}`)) {
        dumped[name].add(`${x >> 3},${y >> 3}`);
        const key = {}; let k = 0; const sym = (v) => (v === null ? "." : (key[v] ??= "ABCDEFGHIJKLMNOP"[k++]));
        console.log(`  ${name} around ${x},${y}:`);
        for (let Y = y - 4; Y <= y + 4; Y++) console.log("    " + String(Y).padStart(3) + " " + Array.from({ length: 13 }, (_, i) => sym(at(x - 6 + i, Y))).join(""));
        console.log("    " + Object.entries(key).map(([v, s]) => `${s}=${v}`).join(" "));
      }
    }
  }
  writeFileSync(`${OUT}/${name}.png`, png(px, n));
}
console.log(`wrote ${jobs.length} drawings to ${OUT}/, ${flagged} one-pixel strokes`);
