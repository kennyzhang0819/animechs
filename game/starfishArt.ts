/**
 * THE GRAPNELS, THE STARFISH — the eighth family, and the second drawn
 * from nothing rather than over a Mindustry tree (the Tuskers were the
 * first, game/tuskerArt.ts). Same grammar as every other body on the
 * sheet, whose full statement is the header of game/ironhideArt.ts: every
 * material a dark/light PAIR split at the midline, a fold in the reversed
 * pair, NOTHING NARROWER THAN FOUR PIXELS, boxes and octagons only, and
 * the body drawn AT ITS HITBOX on the turrets' 32 native px a tile.
 *
 * FIVE ARMS, AND FIVE IS WHY IT WORKS HERE. The rule that retired the
 * spiders is about PAIRS — two of anything on a head is eyes, two round
 * things anywhere is eyes — and about knees standing outside a
 * silhouette. An odd number of arms has no pair in it; the arms are
 * thick, they lie flat, and they are the animal rather than a rig, so
 * nothing about this body reads as a leg. One arm points forward on the
 * midline and the other four are drawn as two on the left and mirrored,
 * which is also the cheapest possible way to keep a radial animal
 * symmetric by construction.
 *
 * WHAT THE LADDER BUYS is ornament and reach, never a new body plan: the
 * runt is hide and the bare copper drum, the brute sets that drum in a
 * gunmetal hub plate, the elite runs the launch tube up the forward arm,
 * the champion
 * lengthens every arm and rings the hub, and the apex TIPS ALL FIVE ARMS
 * in copper — five lit points, no two of them adjacent, which is the tell
 * that reads at field zoom and the one thing no tier below it wears.
 *
 * THE MACHINE STAYS INSIDE THE DISC. A plate out on an arm makes the arm
 * a limb of a machine, and the arm is the animal; the only thing that
 * leaves the disc is the tube the star-shot comes out of.
 *
 * Every tier rides the MECH RIG (body, base plate, one sprite of near-side
 * tube feet slid by the walk) because a starfish has no legs to plant: the
 * legged rig exists to swing a knee, and a body that crawls on a thousand
 * tube feet has no knee to swing.
 */
import type { MechParts } from "./animalArt";
import { BORE, GUN, STEEL, draw, drawWithCell, rev, type Mat, type Pen } from "./turretArt";
import { scaler, type IronTier } from "./ironhideArt";

/** the animal: a red-purple star, and the pale ossicles down each arm's
 *  ridge — the bumps a starfish's aboral surface actually has */
export const STAR: Mat = ["#7a2e46", "#c4667c"];
export const OSS: Mat = ["#a8907a", "#f0dcc0"];
/** the family's hue: copper, the one metal nothing else on the roster
 *  wears (PAL.hook). It is on the winch and on the apex's arm tips and
 *  nowhere else — the animal keeps its own colour */
export const COPPER: Mat = ["#a35a2a", "#e59a55"];
const STAR_R = rev(STAR);

/** hitboxes UR x 1.125 / 1.625 / 2.25 / 3.625 / 4.625, at 32 px a tile.
 *  THE STRIDE IS ZERO on every tier, which no other family's is: the rig's
 *  leg cell is empty here (see `feet` below) and a stride with nothing to
 *  slide is a number that does nothing */
export const STARFISH_TIERS: readonly IronTier[] = [
  { t: 1, n: 36, stride: 0, small: 16, th: 4, sh: 4 },
  { t: 2, n: 52, stride: 0, small: 16, th: 4, sh: 4 },
  { t: 3, n: 72, stride: 0, small: 32, th: 4, sh: 4 },
  { t: 4, n: 116, stride: 0, small: 32, th: 4, sh: 4 },
  { t: 5, n: 148, stride: 0, small: 48, th: 4, sh: 4 },
];

const R = Math.round;

/**
 * The body. The arms go down first and the disc over them, so every arm's
 * root is covered the way the Tusker's tusks are covered by its skull —
 * order the parts by what is over what in the real animal (docs/unit-art.md).
 */
function body(P: Pen, T: IronTier): void {
  const { n, t } = T; const { q, w } = scaler(n); const c = n / 2; const U = w(2);
  const disc = q(7);
  // one arm: a chain of blocks walking outward from under the disc,
  // narrowing as it goes, with a pale ossicle every other block. The
  // blocks overlap by more than half their width, so what comes out is a
  // continuous tapering arm and never a row of beads
  const arm = (deg: number, reach: number): void => {
    const a = (deg * Math.PI) / 180, dx = Math.sin(a), dy = -Math.cos(a);
    const steps = 6;
    for (let k = 0; k < steps; k++) {
      const f = k / (steps - 1);
      const x = c + dx * (disc * 0.5 + f * reach), y = c + dy * (disc * 0.5 + f * reach);
      // the block's size is QUANTISED TO THE UNIT and floored at two of
      // them. Both halves of that are the four-pixel rule: a taper that
      // shrinks by a pixel a step leaves one- and two-pixel steps down
      // every diagonal edge, and the forward arm lies ON the midline,
      // where the shade split cuts anything under eight in two
      const s = Math.max(2 * U, U * Math.round((w(9) - f * w(6)) / U));
      P.box(R(x - s / 2), R(y - s / 2), R(x + s / 2), R(y + s / 2), STAR);
      // the ridge, and only where the arm is wide enough to hold one with
      // a unit of hide left either side of it
      if (k % 2 === 1 && s >= 4 * U) {
        const o = 2 * U;
        P.box(R(x - o / 2), R(y - o / 2), R(x + o / 2), R(y + o / 2), OSS);
      }
      // THE APEX IS TIPPED, and that is its own tell: copper on all five
      // points, which no tier below it wears and which reads across a
      // board at a glance
      if (t >= 5 && k === steps - 1) {
        const o = 2 * U;
        P.box(R(x - o / 2), R(y - o / 2), R(x + o / 2), R(y + o / 2), COPPER);
      }
    }
  };
  const reach = q(t >= 4 ? 10 : t >= 2 ? 9 : 8);
  // the forward arm on the midline, then the two left ones — the mirror
  // makes the other two, so the star is symmetric by construction
  arm(0, reach); arm(-72, reach); arm(-144, reach);
  // the disc, over every root, with its rim in the reversed pair
  P.octa(c - disc, c - disc, c + disc, c + disc, w(4), STAR);
  P.octa(c - disc + w(2), c - disc + w(2), c + disc - w(2), c + disc - w(2), w(3), STAR_R);
  // THE WINCH: the copper drum the hook runs off, with a gunmetal hub
  // plate round it from T2. It is the whole of the machine on this body
  // bar the tube.
  //
  // THE DRUM IS ON EVERY TIER, RUNT INCLUDED, and that is a hard
  // requirement rather than a taste: a body's TEAM CELL is the mask of
  // every pixel laid in the family's accent (drawWithCell), and the atlas
  // refuses a cell with nothing in it — "the starfish1 team cell has no
  // pixels in it", thrown while a level is loading. The runt wore no
  // copper at all for one build and took the game down with it.
  if (t >= 2) P.box(c - 2 * U, c - 2 * U, c + 2 * U, c + 2 * U, GUN);
  P.box(c - U, c - U, c + U, c + U, COPPER);
  // the launch tube up the forward arm from T3, its bore at the tip: the
  // one piece of machine that leaves the disc, because the star-shot has
  // to come out of something
  if (t >= 3) {
    P.box(c - U, c - disc - w(4), c + U, c - U, STEEL);
    P.box(c - U, c - disc - w(4), c + U, c - disc - w(1), BORE);
  }
  // a rim round the hub from T4, and a heat band at the disc's back edge
  // on the apex
  if (t >= 4) P.box(c - disc + w(2), c - disc + w(2), c + disc - w(2), c - disc + w(2) + w(3), GUN);
  if (t >= 5) P.box(c - 2 * U, c + disc - w(2) - U, c + 2 * U, c + disc - w(2), COPPER);
}

/** the plate the rig's feet mount to, under the body: gunmetal, inside the
 *  disc's own edge so none of it shows past the animal */
const base = (P: Pen, T: IronTier): void => {
  const { n } = T; const { q, w } = scaler(n); const c = n / 2;
  P.octa(c - q(6), c - q(6), c + q(6), c + q(6), w(4), GUN);
};

/**
 * THE FEET CELL IS EMPTY, AND THAT IS THE DRAWING.
 *
 * The mech rig wants a near-side leg sprite it can slide with the walk,
 * and every other family on it has one — a hoof, a pad, a claw showing
 * past the flank. A starfish has a THOUSAND tube feet and every one of
 * them is on the underside: from above, the one view this game has, there
 * is nothing to see. Every pass that drew some anyway put two blocks in
 * the notches between the arms, and two blocks beside a star read as
 * cargo strapped to it, not as feet — so the cell is left blank and the
 * body is the whole silhouette.
 *
 * The stride is 0 to match (STARFISH_TIERS): nothing slides, because
 * nothing is drawn to slide.
 */
const feet = (_P: Pen, _T: IronTier): void => {};

/** every tier on the mech rig: body, base plate and the near-side feet */
export function starfishMech(T: IronTier): MechParts {
  const { art, cell } = drawWithCell(T.n, (P) => body(P, T), COPPER);
  return {
    body: art,
    base: draw(T.n, (P) => base(P, T)),
    leg: draw(T.n, (P) => feet(P, T), false),
    cell,
    stride: T.stride,
  };
}
