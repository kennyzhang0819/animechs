/**
 * THE WHALES, the humpback (levels.ts `whale1`..`whale5`): the carrier
 * line, and the one animal on the sheet that flies because a MACHINE
 * makes it — a rocket pod bolted to each flank and, from the champion up,
 * a third on the spine, every one burning frost behind the body
 * (atlas.ts UNIT_ENGINES, the renderer's engine flames in the family's
 * colour). It is the biggest thing in the sky short of the Sovereign, it
 * is slow, and what it carries is a BUNDLE of the swarm that drops
 * wherever it comes down (Sim.dropCargo). Drawn from nothing, on cells of
 * its own (atlas.ts WHALE_FULL_CELLS), so it sits on the shelf with
 * ANIMAL_ART off like the Tuskers.
 *
 * A HUMPBACK FROM ABOVE is a broad blunt head, a body that tapers to a
 * narrow tail stock, a wide flat pair of flukes, and PECTORAL FINS a
 * third of its length — the longest of any whale's, which is why this is
 * the whale that fits a rig built for wings: the fins are the wing cell
 * and beat slow and shallow. The hold on its back is the frost hatch, a
 * size bigger every tier, because the bundle is the family. See
 * docs/unit-art.md section 1b for the grammar.
 */
import type { StoopArt, StoopGeom } from "./animalArt";
import { BORE, GUN, STEEL, rev, type Mat, type Pen } from "./turretArt";
import { scaler } from "./ironhideArt";
import { flyer, flyerGeom, withCells, type Base, type FlyerTier, type Wing } from "./familyArt";

export const HIDE: Mat = ["#2b3a48", "#5f7a8f"];
/** the hatch, and the family's accent (constants.ts PAL.frost): the one
 *  cold hue on the roster, the seat the palette note leaves free, and the
 *  colour the rockets burn */
export const FROST: Mat = ["#3f86c4", "#d6f2ff"];
const HIDE_R = rev(HIDE);

/** the beat: a fin stroke, slow and shallow, slower up the tree — the
 *  thrust is the rockets' and the fins only steer */
const WHALE_BASE: readonly Base[] = [
  { t: 1, n: 56, fold: 0.16, sweep: 0.08, rate: 1.1 },
  { t: 2, n: 80, fold: 0.15, sweep: 0.07, rate: 0.9 },
  { t: 3, n: 120, fold: 0.14, sweep: 0.06, rate: 0.7 },
  { t: 4, n: 184, fold: 0.12, sweep: 0.05, rate: 0.55 },
  { t: 5, n: 240, fold: 0.1, sweep: 0.04, rate: 0.45 },
];
/** the body's half width: five units on a box thirty-two long, which is
 *  a whale's three-to-one from above; the box's width is the fins' */
const whaleHalf = (T: Base): number => scaler(T.n).w(5);
/** the flukes' half span, and so the body column's: past the pods */
const flukeHalf = (T: Base): number => scaler(T.n).w(9);
/** the fin: rooted a unit inside the flank, forward of the middle, on a
 *  chord of five, out to the box's edge — a third of the body, which is
 *  a humpback's and no other whale's */
const whaleWing = (T: Base): Wing => {
  const { n } = T; const { q, w } = scaler(n); const rootX = whaleHalf(T) - w(2);
  return { rootX, rootY: q(12), y0: q(10), y1: q(15), reach: n / 2 - q(1) - rootX };
};
export const WHALE_TIERS: readonly FlyerTier[] = WHALE_BASE.map((T) => withCells(T, whaleWing(T), 2 * flukeHalf(T) + 2));
export function whaleGeom(T: FlyerTier): StoopGeom { return flyerGeom(T, whaleWing(T)); }

/** where the pods sit on the flanks: their centre column off the midline
 *  and the row their nozzles end on, so the engines can burn there */
const podX = (T: Base): number => whaleHalf(T);
const podRow = (T: Base): number => scaler(T.n).q(27);
/** THE ENGINES, in native px off the body's centre: x across, y along
 *  (negative astern), and the flame's radius. One behind each pod at
 *  every tier, and a third on the spine from the champion up (atlas.ts
 *  UNIT_ENGINES turns these into world units) */
export function whaleEngines(T: FlyerTier): readonly { x: number; y: number; r: number }[] {
  const { n, t } = T; const { q, w } = scaler(n);
  const y = -(podRow(T) - n / 2), x = podX(T), r = w(2) * 0.9;
  const out = [{ x, y, r }, { x: -x, y, r }];
  if (t >= 4) out.push({ x: 0, y: -(q(28) - n / 2), r: w(3) * 0.9 });
  return out;
}

export function whale(T: FlyerTier): StoopArt {
  const { n, t } = T; const { q, w } = scaler(n); const cx = n / 2; const U = w(2);
  const B = whaleHalf(T), F = flukeHalf(T), L = whaleWing(T);
  const hatchHalf = w(t >= 3 ? 3 : 2);
  const hatchTo = q(t >= 5 ? 19 : t >= 4 ? 18 : t >= 3 ? 17 : t >= 2 ? 16 : 15);
  const body = (P: Pen): void => {
    // the flukes first, under everything: a wide flat plate in the
    // reversed pair with its outer corners cut, off the tail stock
    P.octa(cx - F, q(26), cx + F, q(30), w(3), HIDE_R);
    // the head: blunt, the chamfer for the rostrum's curve; then the body
    // one plate to the hips and the tail stock narrowing behind it, the
    // hip fold across it reversed
    P.octa(cx - B, 0, cx + B, q(11), w(3), HIDE);
    P.octa(cx - B, q(7), cx + B, q(23), w(3), HIDE);
    P.octa(cx - w(3), q(21), cx + w(3), q(27), U, HIDE);
    P.box(cx - B + U, q(20), cx + B - U, q(20) + U, HIDE_R);
    // the blowhole: one bore on the midline behind the rostrum
    P.box(cx - U, q(4), cx + U, q(4) + U, BORE);
    // THE ROCKET PODS: a gunmetal tube on each flank astern of the fin,
    // half over the body and half proud of it, its nozzle a bore at the
    // stern where the engine burns (whaleEngines). Steel-capped from T3
    const px = podX(T);
    P.box(cx - px - U, q(17), cx - px + U, podRow(T), GUN);
    P.box(cx - px - U, podRow(T) - U, cx - px + U, podRow(T), BORE);
    if (t >= 3) P.box(cx - px - U, q(17), cx - px + U, q(17) + U, STEEL);
    // THE HATCH: the hold on its back, the accent, and the one part of
    // this drawing that is a different size at every tier
    P.octa(cx - hatchHalf, q(8), cx + hatchHalf, hatchTo, U, FROST);
    // the champion and the apex carry a THIRD rocket on the spine over
    // the tail stock, its cowl steel and its nozzle a bore at the flukes
    if (t >= 4) {
      P.box(cx - U, q(19), cx + U, q(28), GUN);
      P.box(cx - U, q(19), cx + U, q(19) + U, STEEL);
      P.box(cx - U, q(28) - U, cx + U, q(28), BORE);
    }
    // the apex: frost on every pod's cap
    if (t >= 5) {
      P.box(cx - px - U, q(17), cx - px + U, q(17) + U, FROST);
      P.box(cx - U, q(19), cx + U, q(19) + U, FROST);
    }
  };
  const wing = (O: Pen): void => {
    const R = scaler(L.reach); const chord = L.y1 - L.y0;
    // THE FIN: a humpback's pectoral, long and narrow, tapering on one
    // 45-degree cut to a four-row tip, its leading edge in the reversed
    // pair — the pale scalloped edge that is the animal's own mark
    const c = Math.max(0, (chord - 4) / 2);
    O.octa(-c, L.y0, L.reach, L.y1, c, HIDE);
    const fold = L.reach - c - 4;
    if (fold >= 4) O.box(0, L.y0, fold, L.y0 + Math.max(4, Math.round(chord * 0.3)), HIDE_R);
    // a gunmetal strap over the root from T2, and frost out the fin on
    // the apex, so a flight reads as one family from its fins
    if (t >= 2) O.box(R.q(2), L.y0 + U, R.q(2) + R.w(4), L.y1 - U, GUN);
    if (t >= 5) O.box(R.q(12), L.y0 + U, R.q(12) + R.w(5), L.y1 - U, FROST);
  };
  return flyer(T, L, body, wing, FROST);
}
