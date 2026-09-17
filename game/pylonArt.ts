/**
 * THE PYLONS — the two buff towers a mission plants over its road
 * (levels.ts `goad`, `bastion`; docs/mission-marks.md).
 *
 * They are the siege's machines' cousins and are drawn out of the same
 * plate, bore and crux (wardenArt.ts ARMOUR / CRUX): a body that was BUILT
 * and left standing is not an animal, and a player should read "installed"
 * off it before reading which one it is.
 *
 * WHAT SEPARATES THEM IS THE SILHOUETTE AND NOTHING ELSE. Same materials,
 * same accent, same plate — so the one thing carrying the difference at
 * field zoom is the OUTLINE: the Goad is narrow and tall with its mass at
 * the top, the Bastion is wide and low with its mass at the bottom. Colour
 * would not survive the distance and a label does not exist.
 *
 * A HIGHLIGHT ON THE ACCENT RUNS ACROSS IT, NEVER DOWN ONE SIDE. The
 * mirror copies the left half over the right (turretArt.ts finish), so a
 * `rev(CRUX)` stripe covering the accent's left half leaves no pixel that
 * is plain CRUX — and the team cell is the mask of exactly that material,
 * so it comes out empty and the atlas refuses the body at level load.
 * scripts/check.mjs `cells` is what catches it.
 *
 * NEITHER HAS A BARREL, deliberately. The railgun's whole drawing is a
 * shaft because it is aimed at your core; these two do nothing to you
 * directly, and a gun on one would promise a threat it never delivers.
 */
import type { MechParts } from "./animalArt";
import { scaler } from "./ironhideArt";
import { BORE, GUN, STEEL, bars, draw, drawWithCell, rev, type Mat, type Pen } from "./turretArt";
import { ARMOUR, CRUX, type WardenTier } from "./wardenArt";

const ARMOUR_R = rev(ARMOUR);

/** four tiles square at the sheet's 0.625 world px per native px, which is
 *  the footprint both towers are authored to (levels.ts, UR x 4) */
export const GOAD_TIER: WardenTier = { n: 128, stride: 0 };
export const BASTION_TIER: WardenTier = { n: 128, stride: 0 };

// ── the Goad ───────────────────────────────────────────────────────────
//
// A FORK ON A MAST. The thing it does is hurry something along, and what
// carries that is the OUTLINE: a thin vertical line with a split tip,
// against the Bastion's wide wedge. Those two shapes cannot be confused at
// any distance, and that is the only job either drawing has.
//
// ITS ACCENT RUNS UP, NOT ACROSS. A bright bar low on a body under two
// pale ones is a mouth under two eyes — the railgun's capacitor was moved
// for exactly that (wardenArt.ts), and a first cut of this pair walked
// into it twice. Every accent here is a vertical stripe, and there is no
// paired feature anywhere on either machine.
function goadBody(P: Pen, T: WardenTier): void {
  const { n } = T;
  const { q, w } = scaler(n);
  const c = n / 2;
  // the two prongs: drawn once on the left and mirrored, so the gap up the
  // middle is the shape rather than a third prong
  P.box(c - w(8), q(1), c - w(4), q(11), STEEL);
  P.box(c - w(8), q(1), c - w(4), q(1) + w(3), BORE);
  // the shaft: narrow, and it runs the whole grid so the silhouette is a
  // line rather than a block. It reaches UP BETWEEN the prongs, so the
  // fork is one machine and not two bars floating over a block
  P.box(c - w(6), q(5), c + w(6), n - q(5), ARMOUR);
  P.box(c - w(6), q(5), c - w(6) + w(4), n - q(5), ARMOUR_R);
  // THE STRIPE: one bright thing, running the length of the shaft
  P.box(c - w(2), q(8), c + w(2), n - q(9), CRUX);
  P.box(c - w(2), q(8), c + w(2), q(8) + w(3), rev(CRUX));
  // the collar where the shaft goes into its footing
  P.octa(q(9), n - q(9), n - q(9), n - q(4), w(3), GUN);
  bars(P, q(12), n - q(12), n - q(8), 2, w(3), w(2));
}

// ── the Bastion ────────────────────────────────────────────────────────
//
// A WEDGE. Wide where the Goad is narrow, low where it is tall, and cut
// back to a nose at the front so the outline is not the octagon every
// plated thing defaults to.
function bastionBody(P: Pen, T: WardenTier): void {
  const { n } = T;
  const { q, w } = scaler(n);
  const c = n / 2;
  // the hull: a deep chamfer takes it off square and into a wedge
  P.octa(q(0), q(8), n - q(0), n - q(7), w(7), ARMOUR);
  P.octa(q(5), q(12), n - q(5), n - q(11), w(5), ARMOUR_R);
  // the leading edge: steel right at the nose, where it reads as a blade
  // rather than as a brow — nothing sits above it and nothing pairs with it
  P.octa(q(6), q(8), n - q(6), q(8) + w(4), w(4), STEEL);
  // THE STRIPE, down the centre like the Goad's and the same width: the
  // family's one accent shape, so a player learns it once and the extra
  // bulk here shows in plate rather than in more red
  P.box(c - w(2), q(11), c + w(2), n - q(12), CRUX);
  P.box(c - w(2), q(11), c + w(2), q(11) + w(3), rev(CRUX));
  // the sink at the back, vented like the railgun's loading bed
  P.octa(q(8), n - q(10), n - q(8), n - q(4), w(3), GUN);
  bars(P, q(11), n - q(11), n - q(9), 2, w(3), w(2));
}

/** THE PLATE EACH STANDS ON — the turrets' own gunmetal (turretArt.ts GUN),
 *  which is what says "somebody built this here" on a body that is not a
 *  turret. It covers the BACK and no more, like the railgun's: a plate that
 *  filled the grid turned both of these into the same octagon and took the
 *  silhouette — the only thing telling them apart — with it. */
function pylonBase(P: Pen, T: WardenTier): void {
  const { n } = T;
  const { q, w } = scaler(n);
  P.octa(q(5), q(17), n - q(5), n - q(1), w(6), GUN);
  P.octa(q(9), q(21), n - q(9), n - q(4), w(4), rev(GUN));
}

/** the anchors: a driven foot at each corner of the plate. They are the
 *  rig's legs and never swing (stride 0) — a Pylon is bolted down */
function pylonFeet(P: Pen, T: WardenTier): void {
  const { n } = T;
  const { q, w } = scaler(n);
  for (const y of [q(19), n - q(10)]) {
    P.box(q(2), y, q(2) + w(6), y + w(6), STEEL);
    P.box(q(2), y + w(6) - w(3), q(2) + w(6), y + w(6), BORE);
  }
}

const pylonMech = (T: WardenTier, body: (P: Pen, T: WardenTier) => void): MechParts => {
  const { art, cell } = drawWithCell(T.n, (P) => body(P, T), CRUX);
  return {
    body: art,
    base: draw(T.n, (P) => pylonBase(P, T)),
    leg: draw(T.n, (P) => pylonFeet(P, T), false),
    cell,
    stride: T.stride,
  };
};

export const goadMech = (T: WardenTier = GOAD_TIER): MechParts => pylonMech(T, goadBody);
export const bastionMech = (T: WardenTier = BASTION_TIER): MechParts => pylonMech(T, bastionBody);

/** the materials this file draws with, for the concept sheets and the
 *  check that every team cell has pixels in it (scripts/check.mjs) */
export const PYLON_MATS: readonly Mat[] = [ARMOUR, CRUX, GUN, STEEL, BORE];
