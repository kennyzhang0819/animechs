/**
 * THE KETTLES, the vulture (levels.ts `kettle1`..`kettle5`): the ninth
 * family, the SECOND thing in the sky, and the third line drawn from
 * nothing rather than over a Mindustry tree — the Tuskers were the first
 * and the Grapnels the second. There is no upstream hull under it and no
 * sprite file to fall back to, so it asks the packer for cells of its own
 * (atlas.ts KETTLE_CELLS) and sits on the shelf with ANIMAL_ART off
 * (levels.ts SHELVED_FAMILIES), which keeps that flag's promise exact.
 *
 * It came off a concept sheet of three (docs/air-concepts.md,
 * game/skyConceptArt.ts, `npm run gen:air`), which is where the goose and
 * the albatross it was picked over still live.
 *
 * A VULTURE FROM ABOVE IS A PLANK: wings held straight out at one chord
 * from shoulder to wrist and slotted into square fingers past it, a pale
 * ruff of down at the shoulders and a small bare head on a thin neck in
 * front of that. It is the broadest, bluntest silhouette in the sky — the
 * bat's wing tapers and folds deep, and this one does neither — so a
 * kettle is never a stoop at field zoom, which is the only test a new
 * family's outline has to pass.
 *
 * THE CROP IS THE SILHOUETTE. The sac under the ruff is drawn a size
 * bigger every tier, two units wide on the runt and most of the breast on
 * the apex, so the five tiers read as ONE ANIMAL AFTER FOUR MORE COURSES.
 * Nothing in the sim reads it — the family has no ability of any kind
 * yet, by design (levels.ts, the Kettles' stat block) — it is a drawing
 * that leaves room for one.
 *
 * THE RIG IS THE WING RIG, the one the Stoop, the Skate, the Livewire and
 * the Sovereign already ride (familyArt.ts `flyer`, `withCells`,
 * `flyerGeom`): a body column and one wing drawn about its root, mirrored
 * to the other side and folded toward it on a sine by the renderer. A new
 * flyer needs a drawing and nothing else, and this file is the proof.
 *
 * THE GRAMMAR IS THE TURRETS' (docs/unit-art.md section 1b): every
 * material a dark/light PAIR split at the midline, a fold in the reversed
 * pair, nothing under four pixels, no dither, no eyes, no round pair, and
 * the body drawn AT ITS HITBOX on 32 px a tile — 40, 56, 88, 168, 216,
 * which is UR x 1.25 / 1.75 / 2.75 / 5.25 / 6.75.
 *
 * WHAT WENT WRONG FOUR TIMES BEFORE THIS DRAWING WORKED is written up in
 * docs/air-concepts.md and worth one line here: the Stoop's wing is
 * nearly twice as DEEP as it is long, which is right for a bat and wrong
 * for every bird, so a layout that fills the box with body and hangs a
 * deep slab off each side comes out a bottle with wings. A wing that
 * reads as a wing on this grid has a chord of about nine units of the 32
 * layout and a span of half the box, and everything below is built to
 * leave room for exactly that.
 */
import type { StoopArt, StoopGeom } from "./animalArt";
import { BORE, GUN, STEEL, bars, rev, type Mat, type Pen } from "./turretArt";
import { BONE, scaler } from "./ironhideArt";
import { flyer, flyerGeom, withCells, type Base, type FlyerTier, type Wing } from "./familyArt";

/**
 * A BEAK IS DARK KERATIN, and it is here rather than in the family's own
 * block because the next bird will want it too. Three passes of the
 * concept sheet put the bill in HORN or in BONE and every one of them came
 * out a CORK: a pale block on the end of a narrow front, on a body wider
 * than both, is a bottle's whole silhouette, and the eye finds it before
 * it finds the animal. So a bill is the dark end of the same stuff the
 * rhino's horn is, and BONE shows only as the hook a few px long on the
 * one tier big enough to carry one.
 */
export const BEAK: Mat = ["#3b342e", "#6e6154"];

/** the reach a wing gets on a tier: out from its root to a unit inside
 *  the grid's edge, which is the Stoop's own formula — the quad is the
 *  box, so a wingtip stops AT the box and never over it. Shared with the
 *  concept sheet (skyConceptArt.ts) */
export const reachOf = (n: number, rootX: number): number => { const { q } = scaler(n); return n / 2 - q(1) - rootX; };

// ── the materials ───────────────────────────────────────────────────────
//
// The plumage is a dark brown CARR with a pale RUFF at the shoulders and
// the bare head and neck in NAKED, which is a vulture and not a gunship.
// The machine is gunmetal straps and one steel rail, the way every other
// family wears its hardware: the animal keeps its own colour and the
// metal is what is bolted to it.
export const CARR: Mat = ["#3a3229", "#726150"];
export const RUFF: Mat = ["#8d8577", "#ddd6c2"];
export const NAKED: Mat = ["#5e514a", "#a89184"];
/**
 * THE CROP, and the family's accent (constants.ts PAL.carrion): the one
 * hue on the body, on the sac and nowhere else, which is the whole of
 * what an accent is for.
 *
 * IT IS THE ONE THING ON THIS FAMILY WORTH A SECOND LOOK. The rule over
 * the family palette is one hue each with no two neighbours on the wheel,
 * and this rust sits between the Ironhides' rose and the Grapnels'
 * copper — closer to the latter than any other pair on the sheet. What is
 * actually free is the cold end, a frost or a near-black, and the reason
 * the rust stayed is that it is what a full crop looks like and it is the
 * drawing that was picked. The two are never on the same layer — a
 * Grapnel crawls and a Kettle flies — which is the only thing making it
 * survivable. Revisit it here, in one pair, if the field disagrees.
 */
export const CROP: Mat = ["#7a3420", "#c06a3e"];
const CARR_R = rev(CARR);

/** the beat: a vulture SOARS, so the fold and the sweep are small and the
 *  rate slow, and both fall the whole way up the tree. The apex beats
 *  about once a second and hardly changes shape doing it, which is the
 *  opposite end of the rig from the bat's five-a-second flutter */
const KETTLE_BASE: readonly Base[] = [
  { t: 1, n: 40, fold: 0.22, sweep: 0.12, rate: 3.2 },
  { t: 2, n: 56, fold: 0.21, sweep: 0.11, rate: 2.8 },
  { t: 3, n: 88, fold: 0.2, sweep: 0.1, rate: 2.2 },
  { t: 4, n: 168, fold: 0.18, sweep: 0.09, rate: 1.6 },
  { t: 5, n: 216, fold: 0.16, sweep: 0.08, rate: 1.2 },
];
/** the body's half width: seven units of the 32 layout, so the flank
 *  straps at ±(B - U) and the crop at ±2U to ±4U each leave a unit of
 *  plumage beside them on every tier */
const kettleHalf = (T: Base): number => scaler(T.n).w(7);
/** the wing: rooted two units inside the body's edge so the plank is
 *  under the bird rather than beside it, on a chord of nine units */
const kettleWing = (T: Base): Wing => {
  const { n } = T; const { q, w } = scaler(n); const rootX = w(5);
  return { rootX, rootY: q(14), y0: q(11), y1: q(20), reach: reachOf(n, rootX) };
};
export const KETTLE_TIERS: readonly FlyerTier[] = KETTLE_BASE.map((T) => withCells(T, kettleWing(T), 2 * kettleHalf(T) + 2));
/** the rig's pure numbers for FLYER_PARTS (atlas.ts) */
export function kettleGeom(T: FlyerTier): StoopGeom { return flyerGeom(T, kettleWing(T)); }

export function kettle(T: FlyerTier): StoopArt {
  const { n, t } = T; const { q, w } = scaler(n); const cx = n / 2; const U = w(2);
  const B = kettleHalf(T), L = kettleWing(T);
  // what the crop has eaten: half its width and how far down the breast
  // it has swollen, both a tier's worth bigger every rung
  const cropHalf = w(t >= 4 ? 4 : t >= 3 ? 3 : 2);
  const cropTo = q(t >= 5 ? 24 : t >= 4 ? 22 : t >= 3 ? 20 : t >= 2 ? 19 : 18);
  const body = (P: Pen): void => {
    // the bare head on a thin neck, and the hooked bill in front of it:
    // a vulture's head is the SMALLEST thing on it, which is half of why
    // the bird reads as all shoulders
    P.box(cx - U, 0, cx + U, q(5), BEAK);
    if (t >= 5) P.box(cx - U, 0, cx + U, w(2), BONE);
    P.octa(cx - w(3), q(3), cx + w(3), q(8), w(2), NAKED);
    P.box(cx - U, q(7), cx + U, q(13), NAKED);
    // the ruff: a pale collar at the shoulders. A horizontal band on a
    // symmetrical body is a face — this one is allowed because the animal
    // really has one there, and it is the vulture's own tell
    P.octa(cx - w(5), q(10), cx + w(5), q(15), w(3), RUFF);
    // the body: a broad chamfered plate with the hip fold reversed, and a
    // SQUARE tail off the back of it the way a vulture's is
    P.octa(cx - B, q(13), cx + B, q(27), w(5), CARR);
    P.box(cx - B + U, q(24), cx + B - U, q(24) + w(3), CARR_R);
    P.box(cx - w(5), q(26), cx + w(5), n - q(1), CARR);
    // THE CROP: the accent, and the only part of this drawing that is a
    // different size at every tier. It hangs under the ruff and swells
    // down the breast — an empty runt against a gorged apex is the same
    // body with this one shape four sizes apart
    P.octa(cx - cropHalf, q(14), cx + cropHalf, cropTo, U, CROP);
    // the machine: gunmetal straps down the flanks from T2 — down the
    // body, so they never cut it across, and well clear of the crop
    if (t >= 2) P.box(cx - B + U, q(16), cx - B + 2 * U, q(26), GUN);
    // a gunmetal cap over the crown from T4
    if (t >= 4) P.box(cx - w(3) + U, q(4), cx + w(3) - U, q(4) + w(3), GUN);
    // the apex: a steel rail along the ruff and two vents down the tail
    if (t >= 5) {
      P.box(cx - w(5) + U, q(10), cx + w(5) - U, q(10) + U, STEEL);
      bars(P, cx - w(3), cx + w(3), q(27), 2, U, U, BORE);
    }
  };
  const wing = (O: Pen): void => {
    const R = scaler(L.reach);
    // the plank: ONE chord out to the wrist, blunt, no taper at all
    O.box(0, L.y0, R.q(20), L.y1, CARR);
    // the fingers: slotted primaries past the wrist with DAYLIGHT between
    // them, one more of them every tier from T3. Four bars a unit apart
    // is the thing that says vulture from across a board, and the reason
    // they arrive late is arithmetic: a slot needs four px of finger and
    // four of sky, and the runt's hand has room for neither
    const fingers = t >= 5 ? 4 : t >= 4 ? 3 : t >= 3 ? 2 : 0;
    const gap = Math.max(4, Math.round((L.y1 - L.y0) * 0.12));
    if (fingers === 0) O.box(R.q(18), L.y0, L.reach, L.y1, CARR);
    else {
      const h = (L.y1 - L.y0 - (fingers - 1) * gap) / fingers;
      for (let k = 0; k < fingers; k++) {
        const y = L.y0 + Math.round(k * (h + gap));
        // each finger a little shorter than the one behind it
        O.box(R.q(18), y, L.reach - k * R.q(2), y + Math.round(h), CARR);
      }
    }
    // a gunmetal shoulder strap out along the arm from T2 — it is also
    // where the pods the family fires from sit (weapons.ts) — and the
    // crop's own rust at the wing root on the apex
    if (t >= 2) O.box(R.q(4), L.y0 + U, R.q(4) + R.w(4), L.y1 - U, GUN);
    if (t >= 5) O.box(R.q(10), L.y0 + U, R.q(10) + R.w(5), L.y1 - U, CROP);
  };
  return flyer(T, L, body, wing, CROP);
}
