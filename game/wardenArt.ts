/**
 * THE SIEGE'S THREE MACHINES — the railgun and the two Wardens posted over
 * it (levels.ts `railgun`, `bulwark`, `lance`; RazeMission).
 *
 * THEY ARE NOT ANIMALS, AND THAT IS THE POINT. Nine of the roster's lines
 * are a herd of something with five sizes of it, drawn under the animal
 * flag (animalFlag.ts); these three are MACHINERY, like the Borer and like
 * the turrets the player buys. A body that walks at your core is alive
 * here, and a body that was BUILT and left standing on a patch of ground
 * is not — a player should be able to tell a garrison from a wave at field
 * zoom without reading a name, and the cheapest way to say "this thing was
 * installed" is to draw it out of the same plate, steel and bore the
 * turrets are drawn out of (turretArt.ts).
 *
 * SO THE GRAMMAR IS THE TURRETS' (docs/unit-art.md section 1b) and the RIG
 * is the mech rig every ground body under a T4 rides (animalArt.ts
 * MechParts, atlas.ts packMech): a body, a base plate under it, and one
 * side's legs that the renderer rows fore and aft against their mirror
 * image. Every material is a dark/light PAIR split at the midline, the
 * left half is drawn and mirrored, nothing is under four pixels, and each
 * body is laid out AT ITS HITBOX on 32 native px a tile — 112, 128 and 72,
 * which is UR x 3.5 / 4 / 2.25 (levels.ts UNIT_STATS).
 *
 * THE ACCENT IS THE SWARM'S CRUX, not a family colour, because none of the
 * three is in a family: the garrison wears the red the Sovereign wears
 * (levels.ts FAMILY_ACCENT names nine families and these are in none of
 * them), and the `cell` each drawing returns is the mask of exactly that
 * material, which is what the renderer tints per team.
 *
 * WHAT EACH ONE HAS TO SAY IN ONE GLANCE:
 *
 *   RAILGUN   a gun that is not aimed at you. One barrel up the middle,
 *             longer than anything else on the board, between two rails,
 *             on a bed with four anchors driven into the ground. It never
 *             turns and it never walks (speed 0, Sim.plantUnit), so the
 *             drawing is allowed to be symmetrical and static in a way no
 *             walking body is: it is a BUILDING that happens to be a body.
 *   BULWARK   a wall with a prow. Wider than it is long, a notch bitten
 *             out of the front between two ram wedges, treads down both
 *             flanks. Nothing on it points forward except the two wedges,
 *             because it has no gun — its weapon is arriving.
 *   LANCE     a needle. A third the Bulwark's grid, most of its length a
 *             single emitter tube with a crimson lens at the tip and two
 *             swept fins behind. It should read as the SMALL FAST ONE at
 *             any zoom, which on this grid means long and thin against the
 *             other two's squares.
 */
import type { MechParts } from "./animalArt";
import { scaler } from "./ironhideArt";
import { BORE, GUN, STEEL, bars, draw, drawWithCell, rev, type Mat, type Pen } from "./turretArt";

/**
 * THE GARRISON'S PLATE, and a third metal on a board that already has two:
 * a turret's gunmetal (GUN) and a beacon's blue-black (MAST). This one is
 * colder and darker than either — bare rolled armour with no paint on it —
 * so an emplacement standing in the open is not read as a turret the
 * player forgot they bought.
 */
export const ARMOUR: Mat = ["#2a2e37", "#464c58"];
/** the swarm's crux, as a drawable pair: the accent all three wear, and
 *  the material `drawWithCell` masks out into the team cell */
export const CRUX: Mat = ["#a81f38", "#ff5c73"];
const ARMOUR_R = rev(ARMOUR);

/**
 * ONE MACHINE'S NUMBERS. `n` is the grid, which is the hitbox in native
 * px; `stride` is the mech rig's leg swing, and it is ZERO on the railgun
 * because the railgun does not walk — the rig still draws its legs, they
 * simply never move (atlas.ts MechArt.stride).
 */
export interface WardenTier {
  n: number;
  stride: number;
}
/** the three, in the order the mission puts them down */
export const RAZE_TIER: WardenTier = { n: 112, stride: 0 };
export const BULWARK_TIER: WardenTier = { n: 128, stride: 9 };
export const LANCE_TIER: WardenTier = { n: 72, stride: 6 };

// ── the railgun ────────────────────────────────────────────────────────
//
// TWO THIRDS BARREL, ONE THIRD BREECH, and that split is the whole
// drawing. A railgun has to read as A GUN AIMED SOMEWHERE from across the
// board — the player's answer to it is "go over there", so the one thing
// the silhouette must never be is another square — and the only shape that
// says gun at this size is a long shaft standing out of a heavy block.
//
// THE RAILS ARE DARK AND THE SHAFT IS PALE. Both were steel in the first
// cut and the three of them merged into one white slab: at field zoom a
// pale shape on a pale shape is one shape. Gunmetal rails either side of a
// steel shaft keep the middle readable and put the eye on the bore.
//
// THE CAPACITOR IS A BAND AND NOT A DRUM. It was a crimson hexagon half
// the body wide, which at any distance was a mouth — the machine read as a
// face with the rails for eyes. A band across the breech is the same
// accent doing the same job (one bright thing, low on the body, where the
// eye lands second) without competing with the barrel for the silhouette.
function razeBody(P: Pen, T: WardenTier): void {
  const { n } = T;
  const { q, w } = scaler(n);
  const c = n / 2;
  // the breech: a deep chamfered block over the back third
  P.octa(q(4), q(18), n - q(4), n - q(1), w(6), ARMOUR);
  // the hip fold, in the reversed pair
  P.box(q(5), n - q(9), n - q(5), n - q(9) + w(4), ARMOUR_R);
  // the two rails: gunmetal runs either side of the shaft, from the
  // trunnion to a couple of units short of the muzzle
  P.box(c - w(7), q(3), c - w(7) + w(3), q(19), GUN);
  // the barrel: a steel shaft two thirds of the body long, with a gunmetal
  // muzzle cap and the bore in it
  P.box(c - w(2), 0, c + w(2), q(21), STEEL);
  P.box(c - w(2), 0, c + w(2), w(5), GUN);
  P.box(c - w(1), 0, c + w(1), w(5), BORE);
  // the trunnion: the steel bar the shaft pivots in, across the front of
  // the breech and wider than it
  P.box(q(6), q(16), n - q(6), q(16) + w(5), STEEL);
  P.box(q(6), q(16), n - q(6), q(16) + w(2), GUN);
  // THE CAPACITOR: the crimson band across the breech
  P.box(q(7), q(22), n - q(7), q(22) + w(5), CRUX);
  P.box(q(7), q(22), n - q(7), q(22) + w(2), rev(CRUX));
  // the loading bed at the back, in gunmetal so the tail is not another
  // slab of the same plate, with three vents across it
  P.octa(q(8), n - q(8), n - q(8), n - q(2), w(3), GUN);
  bars(P, q(11), n - q(11), n - q(7), 2, w(3), w(2));
}
/** the bed the whole thing stands on: a plate under the breech and no
 *  further, so an emplacement reads as poured rather than parked — and so
 *  that the barrel is standing OVER open ground rather than over a skirt */
function razeBase(P: Pen, T: WardenTier): void {
  const { n } = T;
  const { q, w } = scaler(n);
  P.octa(q(2), q(15), n - q(2), n - q(1), w(7), GUN);
  P.octa(q(6), q(19), n - q(6), n - q(4), w(5), rev(GUN));
}
/** the anchors: two driven feet a side, at the corners of the bed. They
 *  are the rig's "legs" and they never swing (stride 0) — a railgun is
 *  bolted to the ground it was put on */
function razeFeet(P: Pen, T: WardenTier): void {
  const { n } = T;
  const { q, w } = scaler(n);
  for (const y of [q(17), n - q(11)]) {
    P.box(q(1), y, q(1) + w(6), y + w(6), STEEL);
    P.box(q(1), y + w(6) - w(3), q(1) + w(6), y + w(6), BORE);
  }
}
export function razeMech(T: WardenTier = RAZE_TIER): MechParts {
  const { art, cell } = drawWithCell(T.n, (P) => razeBody(P, T), CRUX);
  return {
    body: art,
    base: draw(T.n, (P) => razeBase(P, T)),
    leg: draw(T.n, (P) => razeFeet(P, T), false),
    cell,
    stride: T.stride,
  };
}

// ── the Bulwark ────────────────────────────────────────────────────────
//
// A WALL WITH A PROW. The body fills nearly the whole grid — this is the
// widest thing the garrison has — and the only shape on it that points
// anywhere is the nose. It is built as TWO chamfered slabs rather than
// one: a broad hull over the back, and a narrower, much deeper-chamfered
// block in front of it, which is the closest this pen gets to a wedge and
// is enough to stop the outline being a crate.
//
// THE RAM IS DARK AND LOW. The first cut put two pale steel wedges at the
// front corners, and pale blocks at the corners of a dark slab are eyes:
// the thing read as a face. The ram is one bar of bore across the nose
// now, with the steel showing only as the shoulders behind it, so the
// front of the body is the darkest part of it — which is what the front of
// something built to be driven into a turret should look like.
function bulwarkBody(P: Pen, T: WardenTier): void {
  const { n } = T;
  const { q, w } = scaler(n);
  const c = n / 2;
  // the hull: the back two thirds, chamfered
  P.octa(q(2), q(10), n - q(2), n - q(2), w(6), ARMOUR);
  // the nose: narrower and cut much harder, so the front comes to a point
  P.octa(q(7), q(1), n - q(7), q(14), w(8), ARMOUR);
  // the belt across the middle and the plate seam behind it
  P.box(q(3), q(16), n - q(3), q(16) + w(5), ARMOUR_R);
  P.box(q(4), n - q(11), n - q(4), n - q(11) + w(4), ARMOUR_R);
  // THE RAM: one bar of bore across the nose, with the steel shoulders
  // showing behind it
  P.box(q(10), q(2), n - q(10), q(2) + w(5), STEEL);
  P.box(q(10), q(2), n - q(10), q(2) + w(3), BORE);
  // the crimson vent behind the ram: small, low, and off the centre line,
  // because a bright band across the middle of a wide dark body is a MOUTH
  // at field zoom whatever it was drawn as. Two of them, one a side —
  // which mirroring gives for the price of drawing one
  // the spine between them, in gunmetal with a steel rib: a machine and
  // not a gap. It is laid FIRST so the vents sit clear of it — a bright
  // accent painted under a pale rib is an accent nobody ever sees
  P.box(c - w(4), q(9), c + w(4), q(21), GUN);
  P.box(c - w(2), q(9), c + w(2), q(21), STEEL);
  P.box(q(5), q(12), q(5) + w(6), q(12) + w(4), CRUX);
  P.box(q(5), q(12), q(5) + w(6), q(12) + w(2), rev(CRUX));
  // the back deck, in gunmetal, with three vents across it
  P.octa(q(7), n - q(9), n - q(7), n - q(3), w(4), GUN);
  bars(P, q(10), n - q(10), n - q(8), 3, w(3), w(2));
}
function bulwarkBase(P: Pen, T: WardenTier): void {
  const { n } = T;
  const { q, w } = scaler(n);
  P.octa(q(1), q(6), n - q(1), n - q(1), w(6), GUN);
}
/** the treads: one long block down the near flank, banded, with the band
 *  gaps reading as plates as it rows */
function bulwarkTreads(P: Pen, T: WardenTier): void {
  const { n } = T;
  const { q, w } = scaler(n);
  P.box(0, q(8), w(7), n - q(4), ARMOUR);
  bars(P, 0, w(7), q(10), 6, w(3), w(3), BORE);
}
export function bulwarkMech(T: WardenTier = BULWARK_TIER): MechParts {
  const { art, cell } = drawWithCell(T.n, (P) => bulwarkBody(P, T), CRUX);
  return {
    body: art,
    base: draw(T.n, (P) => bulwarkBase(P, T)),
    leg: draw(T.n, (P) => bulwarkTreads(P, T), false),
    cell,
    stride: T.stride,
  };
}

// ── the Lance ──────────────────────────────────────────────────────────
//
// A NEEDLE. The hull is a narrow column down the middle of the grid and
// most of what is drawn is the emitter tube standing out of the front of
// it; the two fins are swept back off the shoulders and are the only wide
// thing on the body. On a 72 grid that leaves most of the box empty, which
// is exactly the read wanted: the small quick one.
function lanceBody(P: Pen, T: WardenTier): void {
  const { n } = T;
  const { q, w } = scaler(n);
  const c = n / 2;
  // the hull: a narrow chamfered column
  P.octa(c - w(7), q(8), c + w(7), n - q(3), w(4), ARMOUR);
  P.box(c - w(7), q(14), c + w(7), q(14) + w(4), ARMOUR_R);
  // the fins: swept back off the shoulders to the body's own width
  P.box(q(2), q(16), c - w(5), q(16) + w(5), ARMOUR);
  P.box(q(2), q(16) + w(5) - w(3), c - w(5), q(16) + w(5), GUN);
  // the emitter: a steel tube out of the front, capped in gunmetal with
  // the crimson lens in the mouth
  P.box(c - w(3), q(1), c + w(3), q(18), STEEL);
  P.box(c - w(3), q(1), c + w(3), q(1) + w(4), GUN);
  P.box(c - w(2), q(1), c + w(2), q(1) + w(4), CRUX);
  // the charge block behind it, and two lines off it down the hull
  P.octa(c - w(6), q(19), c + w(6), q(25), w(2), GUN);
  bars(P, c - w(2), c + w(2), q(26), 2, w(3), w(2), CRUX);
}
/** how far in from the edge the Lance's base plate sits: it is a narrow
 *  body, so a plate the width of the grid would be a skirt */
const lanceInset = (n: number): number => Math.round((n / 32) * 9);
function lanceBase(P: Pen, T: WardenTier): void {
  const { n } = T;
  const { q, w } = scaler(n);
  const i = lanceInset(n);
  P.octa(i, q(11), n - i, n - q(2), w(4), GUN);
}
/** the skids: two short runners down the near flank */
function lanceSkids(P: Pen, T: WardenTier): void {
  const { n } = T;
  const { q, w } = scaler(n);
  for (const y of [q(13), q(23)]) {
    P.box(q(5), y, q(5) + w(5), y + w(6), ARMOUR);
    P.box(q(5), y + w(6) - w(2), q(5) + w(5), y + w(6), BORE);
  }
}
export function lanceMech(T: WardenTier = LANCE_TIER): MechParts {
  const { art, cell } = drawWithCell(T.n, (P) => lanceBody(P, T), CRUX);
  return {
    body: art,
    base: draw(T.n, (P) => lanceBase(P, T)),
    leg: draw(T.n, (P) => lanceSkids(P, T), false),
    cell,
    stride: T.stride,
  };
}
