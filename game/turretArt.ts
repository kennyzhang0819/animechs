/**
 * FOUNDRY: the player's turret heads, generated as pixel art at load and
 * packed over Mindustry's turret cells (atlas.ts) while game/turretFlag.ts
 * FOUNDRY_ART is on. The direction, the rules and the three silhouettes
 * drawn for every kind are in docs/turret-factions.md; the alternates and
 * the concept sheets live in scripts/turret-concepts.mjs, which imports
 * this file so the roster is drawn from one place.
 *
 * HOW A HEAD IS DRAWN, read off duo.png, lancer.png, ripple.png and
 * spectre.png rather than assumed:
 *   - NO outline, NO rim, NO inset border plate. Four or five flat colours
 *     butted against each other, inside the stock margin (4 px on a 32
 *     grid, 8 on 64, 6 on 96 and 128) so the base plate shows around it.
 *   - Every material is a PAIR: its dark on the left half of the sprite,
 *     its light on the right. That is the whole of the lighting. A part
 *     is drawn once in a material and the shade is applied after, so the
 *     shape is symmetric by construction and the shade never is.
 *   - Cuts are at 45 degrees or straight, nothing thinner than two
 *     pixels, and every head is authored in PIXELS on its own grid: a
 *     clearance of two pixels has to be two pixels, and rounding a unit
 *     fraction is how a one-pixel sliver gets in. The concept script
 *     checks every render for a lone pixel or a one-pixel stroke.
 *   - The body is gunmetal (the ripple's and the spectre's), the barrels
 *     steel (the lancer's), a bore near-black, and the ACCENT is the
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
 *  catches light the other way, the duo's light wedge inside its dark
 *  half, done on purpose */
export const rev = (m: Mat): Mat => [m[1], m[0]];
export const GUN_R: Mat = rev(GUN);

/** what a turret throws, and the colour it wears for it */
export type AmmoGroup = "bullet" | "shell" | "flame" | "beam" | "water" | "field" | "missile";
export const ACCENT: Record<AmmoGroup, Mat> = {
  bullet: ["#8f665b", "#c9a58f"], // copper — the duo's own body
  shell: ["#d99f6b", "#f3e979"], // brass — the cyclone's and foreshadow's
  flame: ["#ec7458", "#ff9c5a"], // ember — the spectre's and meltdown's
  beam: ["#6974c4", "#8aa3f4"], // the lancer's blue
  water: ["#3f4c96", "#5c6dbb"], // Liquids.water, darker than the beam
  field: ["#4fa88a", "#8fe0b8"], // mint, the one hue no stock turret uses
  missile: ["#da6b68", "#feb380"], // the ripple's and swarmer's salmon
};

/** every channel of the stock base plate times this: still grey, a step
 *  darker, so a head reads as standing on something */
export const BASE_DARK = 0.65;

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
function finish(mat: Cell[], n: number): Art {
  for (let y = 0; y < n; y++) for (let x = 0; x < n >> 1; x++) mat[y * n + (n - 1 - x)] = mat[y * n + x];
  return { n, px: mat.map((m, i) => (m === null ? null : m[i % n < n / 2 ? 0 : 1])) };
}

// ── the vocabulary: the parts a turret is built from ───────────────────
/** a chamfered plate with a bevel band `b` px wide along every chamfer:
 *  the octagon in the reversed shade, then the same octagon cut deeper on
 *  top of it in the plate's own shade */
export function plate(P: Pen, x0: number, y0: number, x1: number, y1: number, c: number, m: Mat, b = 3): void {
  P.octa(x0, y0, x1, y1, c, rev(m));
  P.octa(x0, y0, x1, y1, c + b, m);
}
export interface BarrelOpts {
  /** how far the brake and the collar stand proud of the shaft, each side */
  lip?: number;
  /** the muzzle brake's height */
  brake?: number;
  /** the root collar's height; 0 for none */
  collar?: number;
  /** how far the bore sits in from the shaft's edge */
  bore?: number;
  /** the rows shroud bands start on */
  bands?: readonly number[];
  bandH?: number;
}
/** a barrel: steel shaft, a wider gunmetal muzzle brake with a bore in it,
 *  optional shroud bands, an accent collar at the root */
export function barrel(P: Pen, x0: number, x1: number, y0: number, y1: number, A: Mat, o: BarrelOpts = {}): void {
  const lip = o.lip ?? 2, brake = o.brake ?? 4, collar = o.collar ?? 3, boreIn = o.bore ?? 2;
  P.box(x0, y0, x1, y1, STEEL);
  P.box(x0 - lip, y0, x1 + lip, y0 + brake, GUN);
  P.box(x0 + boreIn, y0, x1 - boreIn, y0 + brake, BORE);
  for (const y of o.bands ?? []) P.box(x0 - lip, y, x1 + lip, y + (o.bandH ?? 3), GUN);
  if (collar > 0) P.box(x0 - lip, y1 - collar, x1 + lip, y1, A);
}
/** n bars, h px tall, gap px apart */
export function bars(P: Pen, x0: number, x1: number, y: number, n: number, h: number, gap: number, m: Mat = BORE): void {
  for (let i = 0; i < n; i++) P.box(x0, y + i * (h + gap), x1, y + i * (h + gap) + h, m);
}
/** a stud: a small diamond */
export const stud = (P: Pen, x: number, y: number, r = 2, m: Mat = BORE): void => P.diamond(x, y, r, m);

// ── the roster ─────────────────────────────────────────────────────────
/** the kinds with a drawing: every turret but the retired menders */
export const TURRET_ART_KINDS = [
  "duo", "hail", "scorch", "arc",
  "salvo", "scatter", "lancer", "wave", "parallax", "swarmer",
  "fuse", "ripple", "tsunami", "cyclone",
  "spectre", "meltdown", "foreshadow",
] as const;
export type TurretArtKind = (typeof TURRET_ART_KINDS)[number];
/** size in cells, and what it throws */
export const ROSTER: Record<TurretArtKind, { size: 1 | 2 | 3 | 4; ammo: AmmoGroup }> = {
  duo: { size: 1, ammo: "bullet" }, hail: { size: 1, ammo: "shell" }, scorch: { size: 1, ammo: "flame" }, arc: { size: 1, ammo: "beam" },
  salvo: { size: 2, ammo: "bullet" }, scatter: { size: 2, ammo: "missile" }, lancer: { size: 2, ammo: "beam" }, wave: { size: 2, ammo: "water" },
  parallax: { size: 2, ammo: "field" }, swarmer: { size: 2, ammo: "missile" },
  fuse: { size: 3, ammo: "flame" }, ripple: { size: 3, ammo: "shell" }, tsunami: { size: 3, ammo: "water" }, cyclone: { size: 3, ammo: "missile" },
  spectre: { size: 4, ammo: "bullet" }, meltdown: { size: 4, ammo: "beam" }, foreshadow: { size: 4, ammo: "beam" },
};
export type HeadFn = (P: Pen, A: Mat) => void;

/**
 * THE HEADS: one silhouette a role, so no head is another head at a
 * different size. The twin gun is two barrels; the mortar a mouth on a
 * turntable; the charge beam an emitter block with capacitors; the
 * artillery ringed mouths; the heavy barrels longer than its body.
 * Every head is drawn left half and centre only; finish() mirrors and
 * shades. `A` is the accent pair.
 */
export const HEADS: Record<TurretArtKind, HeadFn> = {
  // 1x1, 32 px ───────────────────────────────────────────────────────
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
  // 2x2, 64 px ───────────────────────────────────────────────────────
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
  // 3x3, 96 px ───────────────────────────────────────────────────────
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
  // 4x4, 128 px ──────────────────────────────────────────────────────
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
 *  no Foundry drawing (the retired menders keep their stock sprites) */
export function turretHead(kind: TowerKind): Art | null {
  if (!isArtKind(kind)) return null;
  let a = HEAD_CACHE.get(kind);
  if (!a) {
    a = drawHead(kind);
    HEAD_CACHE.set(kind, a);
  }
  return a;
}
