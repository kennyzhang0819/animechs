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
 * symmetric by construction — and, once those four had to MOVE, the
 * reason the gait cost no new sprite (see THE CRAWL IS THE RIG below).
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
 * THE CRAWL IS THE RIG. Every tier rides the MECH rig, and the sprite it
 * slides with the walk — a hoof on the Ironhide, a pad on the Tusker — is
 * here the FOUR REAR ARMS. The disc, the machine and the forward arm are
 * the body cell and hold still; the two arms on one side are the leg cell
 * and the renderer draws them twice, mirrored, sliding fore and aft in
 * opposite phase (renderer.ts pushMech). What comes out is the animal
 * pulling itself along on its arms, which is what a starfish crawling
 * actually looks like from above, and it is the only gait this family has
 * — nothing in the sim knows about it.
 *
 * THE FORWARD ARM DOES NOT MOVE. It lies on the midline, where the shade
 * split cuts it in two, and a midline sprite cannot be mirrored to one
 * side without tearing that split in half; it is also the arm a crawling
 * star leads with rather than rows with.
 */
import type { MechParts } from "./animalArt";
import { BORE, GUN, STEEL, draw, drawWithCell, rev, type Mat, type Pen } from "./turretArt";
import { scaler, type IronTier } from "./ironhideArt";

/** the animal: a red-purple star, and the pale ossicles down each arm's
 *  ridge — the bumps a starfish's aboral surface actually has */
export const STAR: Mat = ["#7a2e46", "#c4667c"];
export const OSS: Mat = ["#a8907a", "#f0dcc0"];
/** the family's hue: copper, the one metal nothing else on the roster
 *  wears (PAL.hook). It is on the drum, on the launch tube's bore and on
 *  the apex's arm tips, and nowhere else — the animal keeps its own
 *  colour */
export const COPPER: Mat = ["#a35a2a", "#e59a55"];
const STAR_R = rev(STAR);

/** hitboxes UR x 1.125 / 1.625 / 2.25 / 3.625 / 4.625, at 32 px a tile.
 *  THE STRIDE IS ABOUT A FOURTEENTH OF THE BODY on every tier, and here
 *  it is how far the ARMS row fore and aft rather than how far a leg
 *  swings (see `arms`). It sets the CADENCE as well as the throw — the
 *  cycle is four strides of ground covered, so a small stride is a fast
 *  one — and this is where the two meet: the runt scuttles, the apex
 *  hauls itself along about once a second, and the star still reads as a
 *  star at the ends of the swing. A tenth was tried and it is too much:
 *  at full throw an arm's root slides out from under the disc that is
 *  supposed to cover it, and the animal comes apart at the hub. */
export const GRAPNEL_TIERS: readonly IronTier[] = [
  { t: 1, n: 36, stride: 3, small: 16, th: 4, sh: 4 },
  { t: 2, n: 52, stride: 4, small: 16, th: 4, sh: 4 },
  { t: 3, n: 72, stride: 5, small: 32, th: 4, sh: 4 },
  { t: 4, n: 116, stride: 8, small: 32, th: 4, sh: 4 },
  { t: 5, n: 148, stride: 10, small: 48, th: 4, sh: 4 },
];

const R = Math.round;

/** how far an arm reaches past the disc, and how wide the disc is: both
 *  wanted by the body cell and by the arm cell, which are drawn apart */
const disc_ = (T: IronTier): number => scaler(T.n).q(7);
const reachOf = (T: IronTier): number => scaler(T.n).q(T.t >= 4 ? 10 : T.t >= 2 ? 9 : 8);

/**
 * ONE ARM: a chain of blocks walking outward from under the disc,
 * narrowing as it goes, with a pale ossicle every other block. The blocks
 * overlap by more than half their width, so what comes out is a
 * continuous tapering arm and never a row of beads.
 *
 * `deg` is measured off the heading, so 0 is the forward arm, the pair at
 * 72 are the side arms and the pair at 144 the rear ones. A NEGATIVE
 * angle puts the arm on the left half of the grid, which is also the half
 * `finish` shades dark.
 */
function armAt(P: Pen, T: IronTier, deg: number): void {
  const { n, t } = T; const { w } = scaler(n); const c = n / 2; const U = w(2);
  const reach = reachOf(T), d = disc_(T);
  const a = (deg * Math.PI) / 180, dx = Math.sin(a), dy = -Math.cos(a);
  const steps = 6;
  for (let k = 0; k < steps; k++) {
    const f = k / (steps - 1);
    const x = c + dx * (d * 0.5 + f * reach), y = c + dy * (d * 0.5 + f * reach);
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
}

/**
 * THE FOUR THAT ROW, on their own cell: the side arm and the rear arm of
 * ONE side, drawn unmirrored on the left half of the grid, because the
 * renderer draws this cell once a side and mirrors the second copy (the
 * Ironhide's hooves are the same arrangement, ironhideArt.ts). Both come
 * out in the dark half of the pair for the same reason — a cell that is
 * mirrored cannot carry a split — and dark is the right half to pick
 * here: the rowing arms are the ones pressed to the ground.
 */
const arms = (P: Pen, T: IronTier): void => {
  armAt(P, T, -72);
  armAt(P, T, -144);
};

/**
 * The body: the disc, the machine on it and the forward arm — everything
 * that does not row. The arm goes down first and the disc over it, so its
 * root is covered the way the Tusker's tusks are covered by its skull
 * (docs/unit-art.md), and the rowing arms are covered the same way by
 * being on a cell the rig draws UNDER this one.
 */
function body(P: Pen, T: IronTier): void {
  const { n, t } = T; const { q, w } = scaler(n); const c = n / 2; const U = w(2);
  const disc = disc_(T);
  // the forward arm, on the midline and split by the shade like the disc
  armAt(P, T, 0);
  // the disc, over every root, with its rim in the reversed pair
  P.octa(c - disc, c - disc, c + disc, c + disc, w(4), STAR);
  P.octa(c - disc + w(2), c - disc + w(2), c + disc - w(2), c + disc - w(2), w(3), STAR_R);
  // THE DRUM: copper, set in a gunmetal hub plate from T2. It is the
  // whole of the machine on this body bar the tube, and it is what the
  // family is NAMED for (levels.ts FAMILY_NAMES) — a winch the game no
  // longer has a mechanic for. It stays because the name, the copper and
  // the silhouette are all built on it, and because of the next
  // paragraph.
  //
  // THE DRUM IS ON EVERY TIER, RUNT INCLUDED, and that is a hard
  // requirement rather than a taste: a body's TEAM CELL is the mask of
  // every pixel laid in the family's accent (drawWithCell), and the atlas
  // refuses a cell with nothing in it — "the grapnel1 team cell has no
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
 * THERE ARE NO FEET IN THIS DRAWING, AND THERE WILL NOT BE.
 *
 * A starfish has a THOUSAND tube feet and every one of them is on the
 * underside: from above, the one view this game has, there is nothing to
 * see. Every pass that drew some anyway put two blocks in the notches
 * between the arms, and two blocks beside a star read as cargo strapped
 * to it. What moves the animal on screen is the ARMS (see `arms`), which
 * is both the honest reading and the one that needed no new cell.
 */

/** every tier on the mech rig: the still body, the base plate under it,
 *  and the two rowing arms on the cell the walk slides */
export function grapnelMech(T: IronTier): MechParts {
  const { art, cell } = drawWithCell(T.n, (P) => body(P, T), COPPER);
  return {
    body: art,
    base: draw(T.n, (P) => base(P, T)),
    leg: draw(T.n, (P) => arms(P, T), false),
    cell,
    stride: T.stride,
  };
}
