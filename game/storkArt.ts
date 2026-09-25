/**
 * THE STORKS, the white stork (levels.ts `stork1`..`stork5`): the carrier
 * line. It flies slow, it is the biggest thing in the sky short of the
 * Sovereign, and what it carries is a BUNDLE of the swarm that drops
 * wherever it comes down (Sim.dropCargo). Drawn from nothing, on cells of
 * its own (atlas.ts STORK_FULL_CELLS), so it sits on the shelf with
 * ANIMAL_ART off like the Tuskers.
 *
 * A stork from above is a CROSS with a long front and a long back: the
 * neck held straight out, the legs trailing straight behind, and one
 * broad plank of a wing either side of the middle. What tells it from the
 * vulture (kettleArt.ts) at field zoom is the colour split on the wing —
 * white coverts, BLACK flight feathers along the whole trailing edge — and
 * the frost sling under the breast, which grows a size a tier because the
 * bundle is the family. See docs/unit-art.md section 1b for the grammar.
 */
import type { StoopArt, StoopGeom } from "./animalArt";
import { BORE, GUN, STEEL, bars, rev, type Mat, type Pen } from "./turretArt";
import { scaler } from "./ironhideArt";
import { flyer, flyerGeom, withCells, type Base, type FlyerTier, type Wing } from "./familyArt";
import { BEAK, reachOf } from "./kettleArt";

export const FEATHER: Mat = ["#8e8f8c", "#e9e8e1"];
export const PINION: Mat = ["#23262b", "#4d525a"];
export const SHANK: Mat = ["#5a3a33", "#9a6154"];
/** the sling, and the family's accent (constants.ts PAL.frost): the one
 *  cold hue on the roster, the seat the palette note leaves free */
export const FROST: Mat = ["#3f86c4", "#d6f2ff"];
const FEATHER_R = rev(FEATHER);

/** the beat: a stork flaps slow and deep and soars between beats, so the
 *  fold is the vulture's and the rate is under it at every tier */
const STORK_BASE: readonly Base[] = [
  { t: 1, n: 56, fold: 0.24, sweep: 0.11, rate: 2.2 },
  { t: 2, n: 80, fold: 0.22, sweep: 0.1, rate: 1.9 },
  { t: 3, n: 120, fold: 0.2, sweep: 0.09, rate: 1.5 },
  { t: 4, n: 184, fold: 0.18, sweep: 0.08, rate: 1.1 },
  { t: 5, n: 240, fold: 0.16, sweep: 0.07, rate: 0.9 },
];
/** the breast's half width: five units, a slim bird between a long neck
 *  and long legs, and the straps at ±(B - U) leave a unit of plume outside */
const storkHalf = (T: Base): number => scaler(T.n).w(5);
/** the wing: rooted two units inside the breast on a chord of seven, the
 *  plank centred on the body so neck and legs stick out equally either end */
const storkWing = (T: Base): Wing => {
  const { n } = T; const { q, w } = scaler(n); const rootX = w(3);
  return { rootX, rootY: q(15), y0: q(12), y1: q(19), reach: reachOf(n, rootX) };
};
export const STORK_TIERS: readonly FlyerTier[] = STORK_BASE.map((T) => withCells(T, storkWing(T), 2 * storkHalf(T) + 2));
export function storkGeom(T: FlyerTier): StoopGeom { return flyerGeom(T, storkWing(T)); }

export function stork(T: FlyerTier): StoopArt {
  const { n, t } = T; const { q, w } = scaler(n); const cx = n / 2; const U = w(2);
  const B = storkHalf(T), L = storkWing(T);
  // the bundle: half its width and how far down the belly it hangs, a
  // size bigger every rung
  const slingHalf = w(t >= 4 ? 4 : t >= 2 ? 3 : 2), strap = w(1);
  const slingTo = q(t >= 5 ? 24 : t >= 4 ? 23 : t >= 3 ? 22 : t >= 2 ? 21 : 20);
  const body = (P: Pen): void => {
    // the bill, the head and the neck: a LONG bill on a small head on a
    // thin neck, each narrower than the one behind it — the goose's
    // lesson, a taper reads as a bird and a tower reads as a bottle
    P.box(cx - U, 0, cx + U, q(6), BEAK);
    P.octa(cx - w(3), q(4), cx + w(3), q(8), U, FEATHER);
    P.box(cx - U, q(7), cx + U, q(13), FEATHER);
    // the breast: a broad chamfered plate, the belly tapering behind it
    // with the hip fold reversed, and a short square tail
    P.octa(cx - B, q(11), cx + B, q(24), w(4), FEATHER);
    P.octa(cx - w(4), q(22), cx + w(4), q(27), U, FEATHER);
    P.box(cx - w(3), q(22), cx + w(3), q(22) + w(3), FEATHER_R);
    P.box(cx - w(3), q(25), cx + w(3), q(28), PINION);
    // the legs, trailing: held together in flight, so ONE bar and not a
    // pair, out to the grid's rear edge — the long back of the cross
    P.box(cx - U, q(27), cx + U, n, SHANK);
    if (t >= 3) P.box(cx - U, n - w(3), cx + U, n, BEAK);
    // THE SLING: the accent, and the one part of this drawing that is a
    // different size at every tier. It hangs under the breast, and from
    // T2 a gunmetal strap runs down each edge of it
    P.octa(cx - slingHalf, q(13), cx + slingHalf, slingTo, U, FROST);
    if (t >= 2) P.box(cx - slingHalf, q(14), cx - slingHalf + strap, slingTo - U, GUN);
    // a steel buckle across the top of the sling from T3 — the one
    // horizontal break, where the neck really meets the body
    if (t >= 3) P.box(cx - slingHalf, q(12), cx + slingHalf, q(12) + U, STEEL);
    // a gunmetal cap over the crown from T4
    if (t >= 4) P.box(cx - w(3), q(4), cx + w(3), q(4) + U, GUN);
    // the apex: frost on the buckle and two vents at the rump
    if (t >= 5) {
      P.box(cx - U, q(12), cx + U, q(12) + U, FROST);
      bars(P, cx - w(3), cx + w(3), q(25), 2, U, U, BORE);
    }
  };
  const wing = (O: Pen): void => {
    const R = scaler(L.reach); const chord = L.y1 - L.y0;
    const half = Math.max(4, Math.round(chord * 0.45));
    const hand = R.q(21);
    // the plank: white coverts over the leading half and BLACK flight
    // feathers along the whole trailing half, which is a white stork's
    // wing from above and nothing else's on the sheet
    O.box(0, L.y0, hand, L.y0 + half, FEATHER);
    O.box(0, L.y0 + half, hand, L.y1, PINION);
    // the hand: black, slotted into fingers from T3 with daylight between
    const fingers = t >= 5 ? 4 : t >= 4 ? 3 : t >= 3 ? 2 : 0;
    const gap = Math.max(4, Math.round(chord * 0.12));
    if (fingers === 0) O.box(hand, L.y0, L.reach, L.y1, PINION);
    else {
      const h = (chord - (fingers - 1) * gap) / fingers;
      for (let k = 0; k < fingers; k++) {
        const y = L.y0 + Math.round(k * (h + gap));
        O.box(hand, y, L.reach - k * R.q(2), y + Math.round(h), PINION);
      }
    }
    // a gunmetal strap out along the arm from T2, frost at the root on
    // the apex — the sling's own colour, so a flight reads as one family
    // from its wingtips
    if (t >= 2) O.box(R.q(3), L.y0 + U, R.q(3) + R.w(4), L.y0 + half, GUN);
    if (t >= 5) O.box(R.q(10), L.y0 + U, R.q(10) + R.w(5), L.y0 + half, FROST);
  };
  return flyer(T, L, body, wing, FROST);
}
