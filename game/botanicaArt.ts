/**
 * BOTANICA: the player's buildings as plants, generated at load and packed
 * beside the Foundry heads (atlas.ts) so the faction can be flipped live
 * (faction.ts). Every plant is the WHOLE building: there is no plate under
 * it, the plant is drawn to its footprint's edge. Only the five that aim
 * turn (PLANT_TURNS); the rest stand as drawn.
 *
 * Drawn from above, to the same rules as the Foundry heads (turretArt.ts):
 * flat plates, a material's dark on the left and light on the right,
 * nothing under two pixels, symmetric by construction, authored in pixels
 * on the stock grids. scripts/botanica-faction.mjs renders these into
 * docs/botanica/ and checks every one for a one-pixel stroke.
 */
import type { Art } from "./animalArt";
import { BORE, bars, draw, plate, rev, stud, type Mat, type Pen } from "./turretArt";
import type { TowerKind } from "./types";

// ── materials: a plant's, never a machine's ────────────────────────────
export const BARK: Mat = ["#5a3d26", "#8a6238"];
export const LEAF: Mat = ["#3f7f3c", "#6fb85a"];
export const LEAF_R: Mat = rev(LEAF);
export const PALE: Mat = ["#9fd47c", "#d4f0b0"];
export const MOSS: Mat = ["#2f5a2e", "#4a8a48"];
const CAP: Mat = ["#b96a4a", "#e8a37a"];      // a mushroom cap
const SAP: Mat = ["#7a8a2a", "#b9c95a"];      // acid sap, olive — nowhere near the swarm's acid
const NUT: Mat = ["#8a5a2b", "#c9924e"];      // a hard seed
const FIG: Mat = ["#7a2f4a", "#c4587a"];      // a bursting fruit
const DEW: Mat = ["#3f4c96", "#5c6dbb"];      // water
const GLOW: Mat = ["#a9d8ff", "#e6f4ff"];     // a spark
const MAROON: Mat = ["#6a2a3a", "#a84a5e"];   // the corpse flower's petal
const PUMPKIN: Mat = ["#c8641e", "#f5a142"];  // a seed pod
const HEART: Mat = ["#d9a85a", "#ffd37f"];    // the team's colour, in the heartwood

/** a canopy: a leaf disc with dark lobes and pale crowns, a trunk in the middle */
function canopy(P: Pen, cx: number, cy: number, r: number, lobes: readonly (readonly [number, number, number])[], crowns: readonly (readonly [number, number, number])[], trunk: number): void {
  P.disc(cx, cy, r, LEAF);
  for (const [x, y, lr] of lobes) P.disc(x, y, lr, LEAF_R);
  for (const [x, y, cr] of crowns) P.disc(x, y, cr, PALE);
  if (trunk) { P.disc(cx, cy, trunk, BARK); P.disc(cx, cy, Math.max(1, trunk >> 1), BORE); }
}
function fruit(P: Pen, spots: readonly (readonly [number, number])[], r: number, m: Mat): void {
  for (const [x, y] of spots) P.disc(x, y, r, m);
}
/** a ring of petals round a centre, the left half only (the finish mirrors) */
function petalRing(P: Pen, cx: number, cy: number, radius: number, n: number, r: number): void {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const x = Math.round(cx + Math.cos(a) * radius), y = Math.round(cy + Math.sin(a) * radius);
    if (x <= cx) P.disc(x, y, r, PALE);
  }
}

/** the kinds with a plant, and the size each draws at (the kind's own) */
export const PLANT_KINDS = [
  "duo", "hail", "scorch", "arc",
  "salvo", "scatter", "lancer", "wave", "parallax", "swarmer",
  "fuse", "ripple", "tsunami", "cyclone",
  "spectre", "meltdown", "foreshadow",
] as const;
export type PlantKind = (typeof PLANT_KINDS)[number];
const SIZE: Record<PlantKind, 1 | 2 | 3 | 4> = {
  duo: 1, hail: 1, scorch: 1, arc: 1,
  salvo: 2, scatter: 2, lancer: 2, wave: 2, parallax: 2, swarmer: 2,
  fuse: 3, ripple: 3, tsunami: 3, cyclone: 3,
  spectre: 4, meltdown: 4, foreshadow: 4,
};
/** the plants that turn to face their target; the rest stand as drawn */
export const PLANT_TURNS: Readonly<Record<PlantKind, boolean>> = {
  duo: false, hail: false, scorch: false, arc: false,
  salvo: true, scatter: false, lancer: true, wave: false, parallax: true, swarmer: false,
  fuse: false, ripple: false, tsunami: false, cyclone: false,
  spectre: false, meltdown: true, foreshadow: true,
};

/** every plant, drawn left half and centre; the finish mirrors and shades */
export const PLANTS: Record<PlantKind, (P: Pen) => void> = {
  // ── 1x1 ──
  duo(P) {                                               // SAPLING: three leaf lobes on a young trunk
    P.disc(11, 14, 7, LEAF); P.disc(16, 22, 7, LEAF); P.disc(16, 14, 7, LEAF);
    P.disc(10, 12, 2, PALE); P.disc(16, 24, 2, PALE);
    P.disc(16, 17, 2, BARK);
  },
  hail(P) {                                              // PITCHER: one pitcher, a lipped mouth, a leaf at the foot
    P.octa(8, 3, 24, 27, 5, LEAF);
    P.ring(16, 10, 5, 2, PALE);
    P.disc(16, 10, 3, SAP);
    P.octa(4, 20, 20, 30, 4, LEAF_R);
  },
  scorch(P) {                                            // THORNBUSH: a bark mass, spikes on the rim, a few leaves
    P.disc(16, 16, 10, BARK);
    P.disc(16, 16, 6, rev(BARK));
    stud(P, 16, 5, 2, PALE); stud(P, 7, 10, 2, PALE); stud(P, 7, 22, 2, PALE); stud(P, 16, 27, 2, PALE);
    P.disc(12, 16, 3, LEAF);
  },
  arc(P) {                                               // FIREFLY REED: reeds with sparks at their tips
    P.disc(16, 23, 8, MOSS);
    P.box(8, 6, 11, 28, BARK); P.box(14, 4, 18, 28, BARK);
    P.disc(9, 7, 3, GLOW); P.disc(16, 5, 3, GLOW);
  },
  // ── 2x2 ──
  salvo(P) {                                             // CANNON FIG: a fig tree, figs ripening on the canopy; turns
    canopy(P, 32, 32, 27, [[18, 22, 8], [22, 46, 7]], [], 5);
    fruit(P, [[32, 18], [20, 32], [28, 48]], 4, FIG);
  },
  scatter(P) {                                           // PUFFCAP: a broad mushroom cap, spotted, gills at the rim
    P.disc(32, 32, 28, CAP);
    P.ring(32, 32, 28, 4, rev(CAP));
    P.disc(32, 32, 10, rev(CAP));
    P.disc(17, 21, 3, PALE); P.disc(16, 38, 3, PALE); P.disc(26, 48, 3, PALE);   // spots, clear of the dome and the rim
  },
  lancer(P) {                                            // SUNFLOWER: petals round a seed head; turns
    petalRing(P, 32, 32, 24, 8, 7);
    P.disc(32, 32, 14, BARK);
    P.disc(32, 32, 8, rev(BARK));
    P.disc(32, 32, 4, GLOW);
  },
  wave(P) {                                              // DEWVINE: a leaf mat with a vine lattice, dew at the crossings
    plate(P, 6, 6, 58, 58, 12, LEAF, 4);
    P.box(10, 20, 54, 26, BARK); P.box(10, 38, 54, 44, BARK);
    P.box(20, 10, 26, 54, BARK); P.box(38, 10, 44, 54, BARK);
    fruit(P, [[23, 23], [23, 41]], 3, DEW);
    P.disc(32, 32, 8, BARK); P.disc(32, 32, 3, PALE);
  },
  parallax(P) {                                          // SNAPDRAGON: two lobes, teeth, a throat; turns
    P.octa(6, 8, 30, 40, 8, LEAF); P.octa(12, 14, 30, 34, 4, rev(FIG));
    bars(P, 26, 30, 12, 4, 3, 3, PALE);
    P.box(30, 10, 34, 38, BORE);
    P.box(28, 40, 36, 58, BARK);
    P.octa(4, 44, 26, 60, 6, LEAF);
  },
  swarmer(P) {                                           // BOMBARDIER: a seed pod, seeds in rows, leaves at its foot
    plate(P, 10, 6, 54, 58, 12, PUMPKIN, 4);
    for (const [x, y] of [[22, 20], [22, 38], [32, 30]] as const) { P.disc(x, y, 4, BORE); P.disc(x, y, 2, PALE); }
    P.octa(2, 46, 34, 62, 6, LEAF);                       // leaves at its foot, meeting under it
  },
  // ── 3x3 ──
  fuse(P) {                                              // CORPSE FLOWER: a maroon bloom, a spadix in the middle
    P.ring(48, 48, 46, 14, MAROON);
    P.ring(48, 48, 32, 6, LEAF_R);
    P.disc(48, 48, 18, BARK);
    P.disc(48, 48, 10, FIG);
    P.disc(48, 48, 4, BORE);
    P.octa(4, 66, 34, 94, 8, LEAF);
  },
  ripple(P) {                                            // OAK: the broad canopy, acorns on it
    canopy(P, 48, 48, 45, [[28, 30, 12], [28, 66, 12]], [[48, 14, 6], [18, 48, 5]], 10);
    fruit(P, [[48, 28], [34, 48], [48, 78], [28, 32]], 4, NUT);
  },
  tsunami(P) {                                           // WILLOW: a weeping canopy, boughs across it, fronds off the rim
    canopy(P, 48, 48, 44, [[26, 30, 12], [30, 66, 10]], [[24, 22, 5], [22, 60, 4]], 0);
    P.box(46, 6, 50, 90, BARK); P.box(6, 46, 90, 50, BARK);
    P.disc(48, 48, 8, BARK); P.disc(48, 48, 4, BORE);
    P.box(4, 30, 8, 66, PALE); P.box(30, 88, 66, 93, PALE);
  },
  cyclone(P) {                                           // KUDZU: a vine mass with runners reaching every edge
    plate(P, 4, 4, 92, 92, 20, LEAF, 6);
    P.box(4, 44, 92, 52, BARK); P.box(44, 4, 52, 92, BARK);
    P.box(16, 20, 40, 26, BARK); P.box(16, 70, 40, 76, BARK); P.box(20, 16, 26, 40, BARK); P.box(20, 56, 26, 80, BARK);
    fruit(P, [[34, 34], [34, 62], [12, 48], [48, 14], [48, 82]], 5, PALE);
    P.disc(48, 48, 10, BARK); P.disc(48, 48, 4, PALE);
  },
  // ── 4x4 ──
  spectre(P) {                                           // WORLD ASH: the colossal canopy, boughs, fruit
    canopy(P, 64, 64, 62, [[34, 34, 18], [34, 94, 15]], [[36, 28, 8], [30, 92, 6]], 0);
    P.box(60, 6, 68, 122, BARK); P.box(6, 60, 122, 68, BARK);
    P.disc(64, 64, 16, BARK); P.disc(64, 64, 6, BORE);
    fruit(P, [[64, 20], [20, 64], [64, 108], [52, 54], [52, 74]], 5, NUT);
  },
  meltdown(P) {                                          // SOLAR BLOOM: the giant sunflower; turns
    petalRing(P, 64, 64, 50, 12, 14);
    P.disc(64, 64, 36, BARK);
    P.ring(64, 64, 28, 6, rev(BARK));
    P.ring(64, 64, 16, 5, rev(BARK));
    P.disc(64, 64, 10, GLOW);
    P.disc(64, 64, 4, PALE);
  },
  foreshadow(P) {                                        // VENUS COLOSSUS: the giant trap, teeth, a throat, a stem; turns
    P.octa(6, 10, 60, 100, 16, LEAF);
    P.octa(14, 20, 52, 92, 10, rev(FIG));
    bars(P, 54, 60, 16, 8, 6, 4, PALE);
    P.box(60, 14, 68, 96, BORE);
    P.box(56, 100, 72, 124, BARK);
    P.octa(4, 96, 44, 126, 10, LEAF);
  },
};

/** the heartwood: a great stump with its rings, root buttresses, the team's colour at the heart */
export function drawHeartwood(): Art {
  return draw(160, (P) => {
    for (const [x, y] of [[8, 8], [8, 112]] as const) P.octa(x, y, x + 48, y + 40, 12, BARK);
    P.disc(80, 80, 74, BARK);
    for (const r of [62, 46, 30]) P.ring(80, 80, r, 5, rev(BARK));
    P.disc(80, 80, 16, HEART);
    P.disc(80, 80, 6, PALE);
    for (const [x, y] of [[20, 36], [20, 124]] as const) P.disc(x, y, 9, MOSS);
  });
}

const isPlantKind = (kind: TowerKind): kind is PlantKind => (PLANT_KINDS as readonly string[]).includes(kind);
/** draw one plant at its native size */
export const drawPlant = (kind: PlantKind): Art => draw(32 * SIZE[kind], PLANTS[kind]);
const CACHE = new Map<PlantKind, Art>();
/** the plant for a kind, drawn once and kept — null for a kind without one (the menders) */
export function plantArt(kind: TowerKind): Art | null {
  if (!isPlantKind(kind)) return null;
  let a = CACHE.get(kind);
  if (!a) {
    a = drawPlant(kind);
    CACHE.set(kind, a);
  }
  return a;
}
/** does this kind turn to face its target under Botanica? */
export const plantTurns = (kind: TowerKind): boolean => (isPlantKind(kind) ? PLANT_TURNS[kind] : true);
