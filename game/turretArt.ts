/**
 * FOUNDRY: the player's turret heads, generated as pixel art at load and
 * packed over Mindustry's turret cells (atlas.ts) while game/turretFlag.ts
 * FOUNDRY_ART is on. The direction, the rules and the three silhouettes
 * drawn for every kind are in docs/turret-factions.md; the alternates and
 * the concept sheets live in scripts/turret-concepts.mjs, which imports
 * this file so the roster is drawn from one place.
 *
 * HOW A HEAD IS DRAWN, read off tacker.png, piercer.png, barrage.png and
 * repeater.png rather than assumed:
 *   - NO outline, NO rim, NO inset border plate. Four or five flat colours
 *     butted against each other, inside the stock margin (4 px on a 32
 *     grid, 8 on 64, 6 on 96 and 128) so the base plate shows around it.
 *   - Every material is a PAIR: its dark on the left half of the sprite,
 *     its light on the right. That is the whole of the lighting. A part
 *     is drawn once in a material and the shade is applied after, so the
 *     shape is symmetric by construction and the shade never is.
 *   - Cuts are at 45 degrees or straight, NOTHING NARROWER THAN FOUR
 *     PIXELS, and every head is authored in PIXELS on its own grid: a
 *     clearance of four pixels has to be four pixels, and rounding a unit
 *     fraction is how a sliver gets in. Four native px is 2.5 px on the
 *     board at 1x, the least that still reads as a stroke; a bevel band
 *     is four, a bore is four, a barrel is four. A feature that sits on
 *     the midline is EIGHT wide, because the shade split cuts it in two
 *     (a bore may be four: its two shades are one colour). The concept
 *     script checks every render for a run of one material under four,
 *     and for one straddling the midline under eight.
 *   - Boxes and octagons only. A circle's edge is a stair whose steps are
 *     one pixel, and a circle cut by a straight edge or laid near a
 *     chamfer leaves slivers; an octagon with a deep chamfer reads as
 *     round at field zoom and its bands are the width they were drawn.
 *   - A head is a FEW parts — a body, the thing it fires with, one accent
 *     — never a dressing of studs, vents and rounds: at 2.5 px a stroke
 *     on the board those are noise, and the hand-edited sheet this pass
 *     replaced had already scraped most of them off.
 *   - The body is gunmetal (the barrage's and the repeater's), the barrels
 *     steel (the piercer's), a bore near-black, and the ACCENT is the
 *     colour of what the turret throws, in Mindustry's own ammo pairs
 *     where it has one — never the colour of a rarity band.
 *
 * Every head faces up, like a Mindustry sprite file, and goes through the
 * same outline + antialias pass as the stock tops.
 */
import type { Art } from "./animalArt";
import type { TowerKind } from "./types";

// ── materials ──────────────────────────────────────────────────────────
/** a material: its dark shade, then its light */
export type Mat = readonly [string, string];
export const GUN: Mat = ["#4d4e58", "#7b7b7b"];
export const STEEL: Mat = ["#c1c3d4", "#f4f4f4"];
export const BORE: Mat = ["#2c2d38", "#2c2d38"];
/** the same material with its shade reversed — a bevel band drawn in it
 *  catches light the other way, the tacker's light wedge inside its dark
 *  half, done on purpose */
export const rev = (m: Mat): Mat => [m[1], m[0]];
export const GUN_R: Mat = rev(GUN);
/** THE CORE'S TWO METALS, and nowhere else: the building the swarm walks
 *  at is not a turret, and a slab a step darker than gunmetal with a
 *  lighter course inside it is what separates it from the twenty-one heads
 *  standing around it. A head is still gunmetal, steel and a bore */
export const SLATE: Mat = ["#343846", "#4e5464"];
export const IRON: Mat = ["#5a5f6e", "#8b90a0"];
/**
 * THE BEACON'S LAMP, and the one accent on this list that is not the colour
 * of something a turret throws (ACCENT below). A mast throws nothing — what
 * it hands out is the player's own permission to build, so it wears the
 * player's own amber, the colour the core is drawn in and the colour every
 * selection ring and price on the HUD is written in. Nothing else in the
 * roster is that hue, which is the point: a mast should be findable on a
 * board of twenty-one gunmetal heads at a glance.
 */
export const POWER: Mat = ["#f6a53a", "#ffd37f"];
/**
 * THE BEACON'S OWN PLATING, darker and bluer than a turret's gunmetal, so a
 * mast is not mistaken for a gun at a glance. It is NOT the core's slate
 * either (SLATE/IRON above are the core's and nowhere else) — the board has
 * three kinds of building on it now and each one is a different metal.
 */
export const MAST: Mat = ["#2f3442", "#48505f"];

/** what a turret throws, and the colour it wears for it */
export type AmmoGroup = "bullet" | "shell" | "flame" | "beam" | "water" | "field" | "missile" | "toxin";
export const ACCENT: Record<AmmoGroup, Mat> = {
  bullet: ["#8f665b", "#c9a58f"], // copper — the tacker's own body
  shell: ["#d99f6b", "#f3e979"], // brass — the whirl's and railhead's
  flame: ["#ec7458", "#ff9c5a"], // ember — the repeater's and furnace's
  beam: ["#6974c4", "#8aa3f4"], // the piercer's blue
  water: ["#3f4c96", "#5c6dbb"], // Liquids.water, darker than the beam
  field: ["#4fa88a", "#8fe0b8"], // mint, the one hue no stock turret uses
  missile: ["#da6b68", "#feb380"], // the barrage's and hive's salmon
  toxin: ["#3d7a2e", "#7cd64a"], // the toxin line's green, and never the swarm's acid
};

/** every channel of the stock base plate times this: still grey, a step
 *  darker, so a head reads as standing on something */
export const BASE_DARK = 0.65;

/** the plate a head stands on (docs/turret-factions.md). It is the one
 *  drawing here that skips the mirror-and-shade finish: a plate is lit off
 *  its own DIAGONAL, not the midline, so its greys are laid as colours —
 *  already through BASE_DARK, so nothing darkens a render of it again */
const PLATE_FACE = "#63646b";
const PLATE_LIT = "#72797d";
const PLATE_SHADE = "#484953";
/** the face's inset and corner cut, by footprint in tiles */
const PLATE_CUT: Readonly<Record<number, readonly [number, number]>> = {
  1: [4, 3], 2: [4, 4], 3: [8, 3], 4: [11, 11], 6: [16, 16],
};
/** every footprint there is a plate for, in tiles */
export const PLATE_SIZES: readonly number[] = Object.keys(PLATE_CUT).map(Number);
/** the plate for a footprint this many tiles on a side, at 32 px a tile */
export function basePlate(size: number): Art {
  const cut = PLATE_CUT[size];
  if (!cut) throw new Error(`no turret plate for a ${size}x${size} footprint`);
  const [i, c] = cut;
  const n = size * 32;
  const px: Art["px"] = new Array<string | null>(n * n);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const dx = Math.min(x - i, n - 1 - i - x), dy = Math.min(y - i, n - 1 - i - y);
      const face = dx >= 0 && dy >= 0 && dx + dy >= c;
      px[y * n + x] = face || y === x ? PLATE_FACE : y < x ? PLATE_LIT : PLATE_SHADE;
    }
  return { n, px };
}

// ── the engine: shapes in pixel coordinates, materials shaded after ────
type Cell = Mat | null;
/** the pen, in pixels on an n grid; a box is [x0, x1) by [y0, y1) */
export interface Pen {
  box(x0: number, y0: number, x1: number, y1: number, m: Mat): void;
  /** a box with its corners cut at 45 degrees by c */
  octa(x0: number, y0: number, x1: number, y1: number, c: number, m: Mat): void;
  disc(cx: number, cy: number, r: number, m: Mat): void;
  ring(cx: number, cy: number, r: number, w: number, m: Mat): void;
  /** a square turned 45 degrees */
  diamond(cx: number, cy: number, r: number, m: Mat): void;
}
function grid(n: number): { mat: Cell[]; pen: Pen } {
  const mat: Cell[] = new Array<Cell>(n * n).fill(null);
  const set = (x: number, y: number, m: Mat): void => {
    if (x >= 0 && y >= 0 && x < n && y < n) mat[y * n + x] = m;
  };
  const pen: Pen = {
    box(x0, y0, x1, y1, m) {
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) set(x, y, m);
    },
    octa(x0, y0, x1, y1, c, m) {
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        const dx = Math.min(x - x0, x1 - 1 - x), dy = Math.min(y - y0, y1 - 1 - y);
        if (dx + dy >= c) set(x, y, m);
      }
    },
    // a circle of radius r + 1/2 about the pixel's centre, like the
    // animals': its poles come out as short flat runs, never a lone pixel
    disc(cx, cy, r, m) {
      const rr = (r + 0.5) * (r + 0.5);
      for (let y = -r; y <= r; y++) {
        const half = Math.floor(Math.sqrt(rr - y * y));
        for (let x = -half; x <= half; x++) set(cx + x, cy + y, m);
      }
    },
    ring(cx, cy, r, w, m) {
      const inner = r - w;
      for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
        const d = Math.hypot(x, y);
        if (d <= r + 0.5 && d >= inner - 0.5) set(cx + x, cy + y, m);
      }
    },
    diamond(cx, cy, r, m) {
      for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (Math.abs(x) + Math.abs(y) <= r) set(cx + x, cy + y, m);
    },
  };
  return { mat, pen };
}
/** mirror the left half over the right (x → n-1-x), then shade: every
 *  material's dark on the left half, its light on the right */
function finish(mat: Cell[], n: number, mirror = true): Art {
  if (mirror) for (let y = 0; y < n; y++) for (let x = 0; x < n >> 1; x++) mat[y * n + (n - 1 - x)] = mat[y * n + x];
  return { n, px: mat.map((m, i) => (m === null ? null : m[i % n < n / 2 ? 0 : 1])) };
}
/** the same drawing as a mask: white wherever material `m` was laid, for a
 *  team cell that is the family's accent and nothing else */
function mask(mat: Cell[], n: number, m: Mat): Art {
  return { n, px: mat.map((c) => (c === m ? "#ffffff" : null)) };
}

// ── the vocabulary: the parts a turret is built from ───────────────────
/** a chamfered plate with a bevel band `b` px wide along every chamfer:
 *  the octagon in the reversed shade, then the same octagon cut deeper on
 *  top of it in the plate's own shade. Four is the least band there is */
export function plate(P: Pen, x0: number, y0: number, x1: number, y1: number, c: number, m: Mat, b = 4): void {
  P.octa(x0, y0, x1, y1, c, rev(m));
  P.octa(x0, y0, x1, y1, c + b, m);
}
/** an octagon inset `b` inside another of chamfer `c`, so the band between
 *  them is `b` wide along the straights AND the chamfers: the inner one's
 *  chamfer is `c - b`, never less than 0 */
export function inset(P: Pen, x0: number, y0: number, x1: number, y1: number, c: number, b: number, m: Mat): void {
  P.octa(x0 + b, y0 + b, x1 - b, y1 - b, Math.max(0, c - b), m);
}
export interface BarrelOpts {
  /** the gunmetal muzzle cap's height, the shaft's width; 0 for none */
  cap?: number;
  /** the bore's width inside the cap, centred; 0 for none — the shaft has
   *  to be at least eight wider than it */
  bore?: number;
  /** the accent collar's height at the root; 0 for none */
  collar?: number;
}
/** a barrel: a steel shaft with a gunmetal cap at the muzzle, a bore in
 *  the cap where the shaft is wide enough, an accent collar at the root */
export function barrel(P: Pen, x0: number, x1: number, y0: number, y1: number, A: Mat, o: BarrelOpts = {}): void {
  const cap = o.cap ?? 6, bore = o.bore ?? 0, collar = o.collar ?? 0;
  P.box(x0, y0, x1, y1, STEEL);
  if (cap > 0) P.box(x0, y0, x1, y0 + cap, GUN);
  if (bore > 0) { const m = (x0 + x1 - bore) / 2; P.box(m, y0, m + bore, y0 + cap, BORE); }
  if (collar > 0) P.box(x0, y1 - collar, x1, y1, A);
}
/** n bars, h px tall, gap px apart */
export function bars(P: Pen, x0: number, x1: number, y: number, n: number, h: number, gap: number, m: Mat = BORE): void {
  for (let i = 0; i < n; i++) P.box(x0, y + i * (h + gap), x1, y + i * (h + gap) + h, m);
}

// ── the roster ─────────────────────────────────────────────────────────
/** the kinds with a drawing: every turret but the retired fixers */
export const TURRET_ART_KINDS = [
  "tacker", "lobber", "torch", "coil", "duster",
  "autocannon", "airburst", "piercer", "douser", "tether", "hive", "blighter",
  "cleaver", "barrage", "deluge", "whirl", "drifter",
  "repeater", "furnace", "railhead", "stinger",
] as const;
export type TurretArtKind = (typeof TURRET_ART_KINDS)[number];
/** size in cells, and what it throws */
export const ROSTER: Record<TurretArtKind, { size: 1 | 2 | 3 | 4; ammo: AmmoGroup }> = {
  tacker: { size: 1, ammo: "bullet" }, lobber: { size: 1, ammo: "shell" }, torch: { size: 1, ammo: "flame" }, coil: { size: 1, ammo: "beam" },
  autocannon: { size: 2, ammo: "bullet" }, airburst: { size: 2, ammo: "missile" }, piercer: { size: 2, ammo: "beam" }, douser: { size: 2, ammo: "water" },
  tether: { size: 2, ammo: "field" }, hive: { size: 2, ammo: "missile" },
  cleaver: { size: 3, ammo: "flame" }, barrage: { size: 3, ammo: "shell" }, deluge: { size: 3, ammo: "water" }, whirl: { size: 3, ammo: "missile" },
  repeater: { size: 4, ammo: "bullet" }, furnace: { size: 4, ammo: "beam" }, railhead: { size: 4, ammo: "shell" },
  duster: { size: 1, ammo: "toxin" }, blighter: { size: 2, ammo: "toxin" },
  drifter: { size: 3, ammo: "toxin" }, stinger: { size: 4, ammo: "toxin" },
};
export type HeadFn = (P: Pen, A: Mat) => void;

/**
 * THE HEADS: one silhouette a role, so no head is another head at a
 * different size. The twin gun is two barrels on a copper block; the
 * mortar a mouth on a turntable; the charge beam an emitter block with
 * capacitors; the artillery four ringed mouths; the heavy barrels longer
 * than its body. Every head is drawn left half and centre only; finish()
 * mirrors and shades. `A` is the accent pair.
 *
 * Every head is a body, the thing it fires with, and one accent, in
 * boxes and octagons whose every run is four px or more and whose every
 * midline feature is eight wide. WHERE A PART MAY GO: an octagon is flat
 * between its chamfers — rows y0+c..y1-c and columns x0+c..x1-c — and a
 * box laid on it either sits inside that flat, or reaches past the
 * octagon's edge altogether. A straight edge that ends INSIDE a chamfer
 * leaves a wedge that tapers to a pixel, and so does a second octagon
 * whose chamfer is not the first's moved in by the same amount on every
 * side (inset()). The margins are the stock ones: 4 px on the 32 grid, 8
 * on 64, 6 on 96 and 128.
 */
export const HEADS: Record<TurretArtKind, HeadFn> = {
  // 1x1, 32 px ───────────────────────────────────────────────────────
  tacker(P, A) {                                         // two barrels on a copper block
    P.octa(6, 12, 26, 28, 4, GUN);                        // the turntable
    P.box(6, 12, 26, 20, A);                              // the copper block, across it
    barrel(P, 8, 12, 4, 12, A, { cap: 4 });               // a barrel, 4 wide, its cap 4 tall
  },
  lobber(P, A) {                                         // one mortar mouth, a plate behind
    P.octa(6, 4, 26, 24, 6, STEEL);                       // the mouth
    P.box(10, 10, 22, 18, A);                             // the shell in it
    P.box(6, 18, 26, 28, GUN);                            // the plate
  },
  torch(P, A) {                                          // a flat wide nozzle on a tank
    P.octa(4, 12, 28, 28, 4, A);                          // the tank
    P.box(8, 4, 24, 12, STEEL);                           // the nozzle, as wide as the tank's top
    P.box(14, 4, 18, 8, BORE);
    P.box(4, 20, 28, 28, GUN);                            // the cradle behind
  },
  coil(P, A) {                                           // a coil dome, two prongs, no barrel
    P.octa(4, 8, 28, 28, 4, GUN);
    P.box(8, 12, 24, 24, A);                              // the coil
    P.box(12, 16, 20, 20, STEEL);                         // its core
    P.box(4, 4, 8, 14, STEEL);                            // a prong, at the edge
  },
  // 2x2, 64 px ───────────────────────────────────────────────────────
  autocannon(P, A) {                                     // three barrels over a magazine
    P.octa(8, 16, 56, 56, 12, GUN);
    barrel(P, 12, 20, 6, 24, A, { cap: 6 });
    barrel(P, 28, 36, 6, 24, A, { cap: 6 });
    P.box(8, 24, 56, 40, A);                              // the magazine, across the drum
    P.box(28, 40, 36, 56, STEEL);                         // the feed
  },
  airburst(P, A) {                                       // a bell that flares forward
    P.octa(8, 26, 56, 58, 10, GUN);
    P.box(14, 14, 50, 30, STEEL);                         // the throat
    P.box(10, 6, 54, 16, A);                              // the flare
    P.box(24, 6, 40, 12, BORE);                           // the mouth
    P.box(20, 40, 44, 52, A);                             // the magazine
  },
  piercer(P, A) {                                        // a wedge with capacitors on the flanks
    P.octa(10, 20, 54, 58, 12, GUN);
    P.box(18, 4, 46, 24, STEEL);                          // the emitter block
    P.box(24, 4, 40, 12, A);                              // the emitter
    P.box(28, 24, 36, 50, A);                             // the charge line
    P.box(8, 24, 18, 42, A);                              // a capacitor on the flank
  },
  douser(P, A) {                                         // a tank with a window and one nozzle
    P.octa(8, 20, 56, 58, 12, GUN);
    inset(P, 8, 20, 56, 58, 12, 6, STEEL);                // the window's rim
    inset(P, 8, 20, 56, 58, 12, 10, A);                   // the water
    P.box(26, 4, 38, 26, STEEL);                          // the nozzle
    P.box(22, 8, 42, 16, A);                              // the valve
  },
  tether(P, A) {                                         // a dish on a yoke
    P.octa(10, 33, 54, 58, 8, GUN); P.box(10, 33, 54, 41, GUN);   // the yoke, square at the top
    P.octa(8, 4, 56, 44, 16, STEEL);                      // the dish
    inset(P, 8, 4, 56, 44, 16, 4, GUN_R);                 // its bowl
    inset(P, 8, 4, 56, 44, 16, 12, A);                    // the field
    P.box(28, 20, 36, 28, STEEL);                         // the emitter
  },
  hive(P, A) {                                           // a box of missile cells
    P.octa(8, 8, 56, 58, 12, GUN);
    P.box(16, 16, 48, 48, STEEL);                         // the box
    P.box(20, 20, 28, 28, A); P.box(20, 32, 28, 40, A);   // two cells a side
  },
  // 3x3, 96 px ───────────────────────────────────────────────────────
  cleaver(P, A) {                                        // one blast face as wide as the drum
    P.octa(6, 30, 90, 90, 18, GUN);
    P.octa(12, 6, 84, 34, 8, STEEL);                      // the blast face
    P.box(12, 34, 84, 42, A);                             // the heat band where it meets the drum
    P.octa(32, 48, 64, 80, 8, A);                         // the breech
    P.box(40, 56, 56, 72, STEEL);
    P.box(10, 48, 22, 72, A);                             // a shell rack on the rim
  },
  barrage(P, A) {                                        // four ringed mouths on a plate
    P.octa(6, 6, 90, 90, 16, GUN);
    for (const y of [14, 54]) {
      P.octa(14, y, 42, y + 28, 8, STEEL);                // a mouth
      inset(P, 14, y, 42, y + 28, 8, 4, A);
      P.box(24, y + 10, 32, y + 18, BORE);
    }
  },
  deluge(P, A) {                                         // the great tank, twin nozzles
    P.octa(6, 26, 90, 90, 14, GUN);
    inset(P, 6, 26, 90, 90, 14, 4, STEEL);                // the window's rim
    inset(P, 6, 26, 90, 90, 14, 8, A);                    // the water
    barrel(P, 24, 40, 4, 30, A, { cap: 6, bore: 8, collar: 6 });   // a nozzle
  },
  whirl(P, A) {                                          // a rotary cluster on a banded drum
    P.octa(10, 34, 86, 90, 14, GUN);
    barrel(P, 20, 32, 10, 38, A, { cap: 6, collar: 6 });  // the outer barrels
    barrel(P, 42, 54, 2, 46, A, { cap: 6, collar: 6 });   // the middle one, forward
    P.octa(26, 50, 70, 86, 12, A);                        // the drum's band
    inset(P, 26, 50, 70, 86, 12, 6, GUN_R);
    P.box(42, 62, 54, 74, STEEL);                         // its hub
  },
  // 4x4, 128 px ──────────────────────────────────────────────────────
  repeater(P, A) {                                       // long twin barrels on a breech, radiator pods
    P.octa(10, 62, 118, 122, 20, GUN);
    P.box(26, 34, 102, 62, A);                            // the breech, the barrels stand on it
    barrel(P, 30, 50, 6, 62, A, { cap: 10, bore: 8 });    // a barrel
    P.box(6, 62, 26, 98, A);                              // a radiator pod, out past the rim
    P.octa(48, 72, 80, 104, 8, A);                        // the ammo drum
    P.box(58, 82, 70, 94, STEEL);
  },
  furnace(P, A) {                                        // one lens and three capacitor banks
    P.octa(8, 26, 120, 122, 26, GUN);
    P.octa(40, 6, 88, 34, 10, STEEL);                     // the emitter housing
    P.box(56, 6, 72, 18, A);                              // the emitter
    P.octa(40, 40, 88, 88, 12, STEEL);                    // the lens
    inset(P, 40, 40, 88, 88, 12, 6, A);
    P.box(58, 58, 70, 70, STEEL);
    P.box(20, 52, 34, 96, A);                             // a capacitor bank on the flank
    P.box(52, 96, 76, 116, A);                            // and one behind
  },
  railhead(P, A) {                                       // a single rail with accelerator rings
    P.octa(16, 60, 112, 122, 16, GUN);
    P.box(44, 2, 84, 80, STEEL);                          // the rail
    P.box(60, 2, 68, 12, BORE);
    for (const y of [12, 28, 44]) P.box(38, y, 90, y + 8, A);   // the rings
    P.box(52, 84, 76, 112, A);                            // the breech
    P.box(58, 90, 70, 106, STEEL);
    P.box(4, 70, 20, 110, STEEL);                         // a stabiliser
  },
  // the toxin line: a vent, not a muzzle, on every one of the four
  duster(P, A) {                                         // one tall nozzle over a gas tank
    P.octa(4, 12, 28, 28, 4, GUN);                        // the tank
    P.box(8, 16, 24, 24, A);                              // the gas in it
    barrel(P, 12, 20, 4, 16, A, { cap: 4 });              // the nozzle, on the midline
    P.box(4, 4, 8, 12, STEEL);                            // a feed pipe at the edge
  },
  blighter(P, A) {                                       // a wide canister mouth over a hopper
    P.octa(8, 22, 56, 58, 12, GUN);
    P.box(12, 8, 52, 26, STEEL);                          // the mouth
    P.box(18, 8, 46, 16, A);                              // the canister in it
    P.box(20, 30, 44, 46, A);                             // the hopper
    P.box(6, 25, 16, 42, A);                              // a rack on the flank
  },
  drifter(P, A) {                                        // a wide vent over a blower drum
    P.octa(6, 30, 90, 90, 18, GUN);                       // the drum
    P.box(14, 4, 82, 30, STEEL);                          // the vent, out over its shoulders
    P.box(20, 4, 76, 14, A);                              // the gas at its mouth
    P.octa(30, 40, 66, 82, 10, A);                        // the blower
    P.box(40, 52, 56, 70, STEEL);                         // its hub
    P.box(6, 54, 22, 68, A);                              // a tank on the rim
  },
  stinger(P, A) {                                        // a bank of needles over a flat breech
    P.octa(10, 62, 118, 122, 20, GUN);
    P.box(20, 34, 108, 84, A);                            // the breech they stand on
    barrel(P, 22, 34, 4, 34, A, { cap: 10 });             // the outer needle
    barrel(P, 44, 56, 4, 34, A, { cap: 10 });             // and its pair
    P.box(6, 62, 26, 98, STEEL);                          // a coolant pod, out past the rim
  },
};

/** the team's colour as a material: Mindustry's sharded yellow, and a
 *  darker step of it for the shaded half */
export const TEAM: Mat = ["#d9a85a", "#ffd37f"];

/**
 * THE CORE, drawn to the same rules as the heads: a square slab five
 * cells on a side (160 px, the nucleus's size) that never turns, four
 * square courses stepping in to a lit well in the middle. Symmetric on
 * both axes, since a building the swarm walks at from every side has no
 * front — and square to the sprite's edge, with no chamfer and no margin,
 * because a core is a slab of ground the player holds and not a turret
 * standing on a plate.
 *
 * SLATE and IRON alternate down the courses and the well is the team's
 * sharded yellow, its innermost square in the reversed shade so the pit
 * catches light the other way. Sixteen px a course, eight either side of
 * the midline at the bottom of the well: every run clears the four-pixel
 * floor and the eight-pixel midline one.
 */
export const CORE_N = 160;
export function coreHead(P: Pen): void {
  P.box(0, 0, 160, 160, SLATE);      // the slab
  P.box(16, 16, 144, 144, IRON);     // the first course
  P.box(32, 32, 128, 128, SLATE);    // the second
  P.box(48, 48, 112, 112, TEAM);     // the well, in the team's colour
  P.box(64, 64, 96, 96, rev(TEAM));  // its lip, lit the other way
  P.box(74, 74, 86, 86, BORE);       // the pit
}
export function drawCore(): Art {
  return draw(CORE_N, coreHead);
}

/** any drawing on an n grid through the same mirror-and-shade finish —
 *  what a concept sheet uses for a plate or another faction's heads. A
 *  part drawn for one side of a body (a mech rig's near-side hooves) asks
 *  not to be mirrored and is shaded as it lies */
export function draw(n: number, fn: (P: Pen) => void, mirror = true): Art {
  const g = grid(n);
  fn(g.pen);
  return finish(g.mat, n, mirror);
}
/** a drawing centred in a bigger square grid: what a body drawn at its
 *  own size needs before it can be laid on a plate wider than it */
export function pad(a: Art, n: number): Art {
  if (a.n === n) return a;
  const o = (n - a.n) >> 1;
  const px: Art["px"] = new Array<string | null>(n * n).fill(null);
  for (let y = 0; y < a.n; y++)
    for (let x = 0; x < a.n; x++) px[(y + o) * n + x + o] = a.px[y * a.n + x];
  return { n, px };
}
/** a drawing and its accent mask together: the body, and the team cell
 *  that is every pixel laid in `accent` (the animals' bodies, whose cell
 *  is the family colour on them and nothing else) */
export function drawWithCell(n: number, fn: (P: Pen) => void, accent: Mat): { art: Art; cell: Art } {
  const g = grid(n);
  fn(g.pen);
  // finish mirrors the material grid in place, so the mask is read after it
  const art = finish(g.mat, n);
  return { art, cell: mask(g.mat, n, accent) };
}

/** a material laid on a pixel, or none */
export type Laid = Mat | null;
/** the drawing BEFORE the shade: which material lies on every pixel,
 *  mirrored. The rule check reads this (a run of one material under four
 *  px, or one straddling the midline under eight), since the shade split
 *  is not a feature and a material's two shades are one thing */
export function layout(n: number, fn: (P: Pen) => void, mirror = true): readonly Laid[] {
  const g = grid(n);
  fn(g.pen);
  if (mirror) for (let y = 0; y < n; y++) for (let x = 0; x < n >> 1; x++) g.mat[y * n + (n - 1 - x)] = g.mat[y * n + x];
  return g.mat;
}
/** the runs the rules forbid on a laid-out grid: every maximal run of one
 *  material along a row or a column under `min` px, and every run that
 *  crosses the midline under `mid` px (a material whose shades are one
 *  colour is exempt from the second). Each is "row y x0..x1" or "col x
 *  y0..y1" with the run's length */
export function thinRuns(mat: readonly Laid[], n: number, min = 4, mid = 8): string[] {
  const out: string[] = [];
  const at = (x: number, y: number): Laid => mat[y * n + x];
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n;) {
      const m = at(x, y); let x1 = x; while (x1 < n && at(x1, y) === m) x1++;
      const len = x1 - x;
      if (m !== null) {
        if (len < min) out.push(`row ${y} x ${x}..${x1 - 1} (${len})`);
        else if (len < mid && x < n / 2 && x1 > n / 2 && m[0] !== m[1]) out.push(`row ${y} x ${x}..${x1 - 1} (${len}) on the midline`);
      }
      x = x1;
    }
  }
  for (let x = 0; x < n; x++) {
    for (let y = 0; y < n;) {
      const m = at(x, y); let y1 = y; while (y1 < n && at(x, y1) === m) y1++;
      if (m !== null && y1 - y < min) out.push(`col ${x} y ${y}..${y1 - 1} (${y1 - y})`);
      y = y1;
    }
  }
  return out;
}

/** draw one head of `set` (the roster by default) at its native size */
export function drawHead(kind: TurretArtKind, set: Record<TurretArtKind, HeadFn> = HEADS): Art {
  const { size, ammo } = ROSTER[kind];
  const n = 32 * size;
  const g = grid(n);
  set[kind](g.pen, ACCENT[ammo]);
  return finish(g.mat, n);
}

const isArtKind = (kind: TowerKind): kind is TurretArtKind => (TURRET_ART_KINDS as readonly string[]).includes(kind);
const HEAD_CACHE = new Map<TurretArtKind, Art>();
/** the head for a turret kind, drawn once and kept — null for a kind with
 *  no Foundry drawing (the retired fixers keep their stock sprites) */
export function turretHead(kind: TowerKind): Art | null {
  if (!isArtKind(kind)) return null;
  let a = HEAD_CACHE.get(kind);
  if (!a) {
    a = drawHead(kind);
    HEAD_CACHE.set(kind, a);
  }
  return a;
}
