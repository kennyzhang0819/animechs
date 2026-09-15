/**
 * THE SOVEREIGN: the boss, and the ninth animal on the sheet.
 *
 * Every other line here is a family — one animal at five sizes, a runt
 * that grows into an apex. This is the one body that is neither: the boss
 * belongs to no family, is never rolled into a wave and never swapped
 * (levels.ts FAMILIES), so it is drawn once, at one size, and that size is
 * the whole point of it.
 *
 * WHAT IT IS: a crowned sea eagle, on the wing rig every other flyer here
 * rides (familyArt.ts `flyer`) — a body column and one wing drawn about
 * its root, mirrored to the other side and BEATEN by the renderer
 * (pushWings). It is the king of the sky the way a lion is the king of the
 * ground, so it is drawn as the bird and not as a machine with feathers:
 * dark plumage over most of its area, the head and the fanned tail in the
 * near-white a sea eagle really wears — the one place on this sheet STEEL
 * is the ANIMAL rather than the hardware — gilt on the beak, the crown and
 * the talons, one gunmetal plate down the spine, and the crux charge in a
 * seam along each wing and one cell on the back.
 *
 * WHERE THE WHITE GOES IS THE WHOLE READ, and it took three passes to
 * learn: a white head that runs on into a neck makes a robed figure of the
 * body, and white anywhere on the back makes a hull with a beak. Two
 * pieces of it, both short, and everything else is feather.
 *
 * WHAT MAKES IT THE BOSS IS THE SIZE, and nothing else in the drawing
 * bends for it (docs/unit-art.md section 1b): every colour is a dark and a
 * light split at the midline, a fold is the reversed pair, nothing is
 * under four pixels, there are no eyes and no round pair anywhere, and the
 * grid IS the hitbox. The grid is simply a 512 — a 24x24-block body, three
 * and a third times the widest T5 on the roster (the stoop5's 7.25) and
 * over four times the largest thing that walks. It draws at the boss's own
 * HALF AGAIN native scale, which is the one convention the boss has always
 * been allowed to break (atlas.ts UNIT_ART), so 512 native px land on 480
 * world px: twenty-four tiles of eagle, with a wingspan the player watches
 * cross the map.
 *
 * THE PRIMARIES ARE THE TELL. A bat's wing is a membrane on three fingers
 * and reads as one slab; an eagle's hand splits into slotted primary
 * feathers, each shorter and further back than the last, with daylight
 * between them. Four of them off a wrist half way out is what stops a very
 * large dark flyer from reading as a very large stoop5 — and the gilt goes
 * on the LEADING one alone, because a gold tip on all four is a handful of
 * studs thrown at a dark shape rather than a crown on a bird.
 *
 * Render it and look at it: `node --experimental-transform-types --import
 * ./scripts/ts-hooks.mjs scripts/king-concept.mjs` writes every part to
 * docs/king-concept/ on a dark ground, puts the boss beside the apexes at
 * one world scale, and lists every run under four pixels.
 */
import type { StoopArt, StoopGeom } from "./animalArt";
import { scaler } from "./ironhideArt";
import { flyer, flyerGeom, withCells, type Base, type FlyerTier, type Wing } from "./familyArt";
import { GUN, STEEL, rev, type Mat, type Pen } from "./turretArt";

/** the plumage: the darkest body on the sheet, and a cold near-black
 *  nothing else here is near — the bat's fur is warm brown, the narwhal's
 *  hide is blue-grey. What crosses the map is a shadow with a white head
 *  on it. It is not darker still because a body has to clear the ground
 *  it flies over, and the rim the atlas adds cannot do that on its own */
export const PLUME: Mat = ["#2e2a33", "#665e70"];
/** the regalia — the beak, the crown, the talons and one wingtip. Gilt is
 *  the animal's own keratin here the way IVORY is the elephant's, not
 *  hardware: a raptor's beak and claws are the one part of it that is not
 *  feather, and gold on those is the whole of what makes it a king */
export const GILT: Mat = ["#8f6a18", "#e6bd52"];
/** the accent, and therefore the team cell (drawWithCell): the crux
 *  charge the sheet tints and lays back over the body */
export const EMBER: Mat = ["#9e2f1e", "#ff7a4a"];
const PLUME_R = rev(PLUME);

/**
 * The one tier there is. `t` is 5 because the boss is a T5 as far as the
 * roster is concerned (levels.ts UNIT_STATS), and nothing here indexes it.
 *
 * THE BEAT IS THE SLOWEST ON THE SHEET and folds the furthest. `rate` 0.55
 * is a wingbeat every two seconds — a stoop5 flaps at 1.4 and a manta5 at
 * 0.4 — and `fold` 0.3 takes a third of the span out at the top of the
 * stroke, which on a twenty-four-block wing is four tiles of travel. A
 * body this size beating at a bat's pace would read as a hummingbird; what
 * a soaring eagle does is one enormous, unhurried stroke, and that is the
 * whole of why the size registers.
 */
const KING_BASE: Base = { t: 5, n: 512, fold: 0.3, sweep: 0.1, rate: 0.55 };

const S = scaler(KING_BASE.n);

/**
 * A CHAMFERED PLATE WITH ITS ROOT-SIDE CORNERS FILLED BACK IN — the one
 * shape this drawing needed that the vocabulary did not already have.
 *
 * An `octa` cuts all four corners, and a cut corner laid over a flat sheds
 * the flat a pixel at a time down its slope: a one-pixel sliver, then two,
 * then three, which is exactly what "nothing under four pixels" is about.
 * On a wing every plate is butted against the plate inboard of it, so the
 * chamfer is wanted at the TIP and never at the root. Filling the root's
 * two corners with a box costs one call and makes the whole wing legal.
 */
const tapered = (O: Pen, x1: number, y0: number, y1: number, c: number, m: Mat): void => {
  O.octa(0, y0, x1, y1, c, m);
  O.box(0, y0, c, y1, m);
};
/** the torso's half width — two and a half units on a body twenty-four
 *  blocks across, because a raptor's span is ten times its back and a
 *  body drawn any wider than this is a bomber with feathers on */
const BODY = S.w(2.5);
/** the tail fan's half width, and the widest thing the body column has to
 *  hold: well over twice the torso, because a raptor's tail really does
 *  fan wider than its back and a tail that does not is a rudder */
const TAIL = S.w(6);
/** the skull's half width. SMALL: a bald eagle's white head is the one
 *  bright thing on a dark bird, and a big one turns the whole body into a
 *  robed figure rather than an animal */
const HEAD = S.w(2);

/**
 * WHERE THE WING SITS, and the one measurement the whole drawing turned
 * on. The root is at the torso's flank on the shoulder row; the span is
 * whatever is left to a unit inside the grid's edge (200 px, so the two
 * wings and the body together fill the 512 and the quad is the box); and
 * the CHORD IS ELEVEN UNITS — 176 px, a bit over a quarter of the SPAN,
 * which is about what a soaring eagle's is. The first cut had a chord as
 * deep as the wing was long, and that is a moth: a bird is a span with a
 * body hung under it, so the grid is allowed to run empty fore and aft
 * rather than have the wing fill it.
 */
const KING_WING: Wing = {
  rootX: BODY,
  rootY: S.q(13),
  y0: S.q(9),
  y1: S.q(20),
  reach: KING_BASE.n - S.q(1) - (KING_BASE.n / 2 + BODY),
};

export const KING_TIER: FlyerTier = withCells(KING_BASE, KING_WING, 2 * TAIL + 2);
export function kingGeom(): StoopGeom {
  return flyerGeom(KING_TIER, KING_WING);
}

/**
 * The body, drawn left half and centre only (finish mirrors and shades),
 * back to front the way the animal really lies: the tail under the rump,
 * the talons under the flank, the beak under the skull.
 */
function body(P: Pen): void {
  const { q, w } = S;
  const cx = KING_BASE.n / 2;
  // THE TAIL, first and therefore lowest: a white fan, and no root under
  // it at all. The rump tapers to a third of its width and the fan steps
  // straight out from there, which is what a fanned tail looks like — a
  // stem between the two only ever showed as a sliver beside the rump's
  // chamfer, a pixel at a time, which is the four-pixel rule's own case
  P.octa(cx - TAIL, q(23), cx + TAIL, q(30), w(2.5), STEEL);
  // the shafts: dark feather lines DOWN the fan and never across it — a
  // horizontal cut on a symmetric body is a face, and this one is white.
  // Two a side, which with the mirror makes the five-feather fan a raptor
  // spreads when it brakes
  for (const x of [cx - w(4.25), cx - w(1.75)]) P.box(x, q(25), x + w(0.75), q(29), PLUME);
  // THE TALONS, tucked: a raptor in flight carries its feet UP under the
  // tail, so what shows from above is two gilt claws a side at the hip and
  // no leg at all — the inner one half under the flank, which is where a
  // tucked foot is
  for (let k = 0; k < 2; k++) {
    const x = cx - BODY - w(1.75) + k * w(1);
    P.box(x, q(19.5), x + w(0.75), q(22), GILT);
  }
  // THE BODY, in two pieces and not one octagon: a straight-sided torso
  // from the shoulders to the hips, and a chamfered rump that tapers into
  // the tail. A single octagon's TOP chamfer grows a pixel a row out from
  // under the skull, and a one-pixel sliver beside a flat is the thing the
  // four-pixel rule exists to stop — two shapes have no such transition,
  // because the torso is full width the moment it appears
  P.box(cx - BODY, q(9), cx + BODY, q(21), PLUME);
  P.octa(cx - BODY, q(17), cx + BODY, q(24), w(1.25), PLUME);
  // the spine plate: the machine bolted to the animal, gunmetal down the
  // back with a steel rim at its head, a unit of plumage left either side
  P.box(cx - w(1.25), q(12), cx + w(1.25), q(21), GUN);
  P.box(cx - w(1.25), q(12), cx + w(1.25), q(12) + w(1), STEEL);
  // the charge — ONE cell, and the one the crux red is tinted on. A column
  // of them down a midline is a row of buttons
  P.box(cx - w(0.6), q(15), cx + w(0.6), q(15) + w(2.5), EMBER);
  // THE BEAK, laid down BEFORE the skull so the head covers its root and
  // only the hook stands out past the brow — the tusker's rule, and the
  // one thing a raptor seen from above really does show
  P.octa(cx - w(0.9), q(3), cx + w(0.9), q(9), w(0.5), GILT);
  // the head: the sea eagle's white skull, and SHORT. Drawn any longer it
  // is a neck, and a bright neck down the midline of a symmetric body
  // turns the whole animal into a robed figure
  P.octa(cx - HEAD, q(5.5), cx + HEAD, q(10), w(0.75), STEEL);
  // THE CROWN, which is why this one has a name: a gilt ridge running back
  // off the beak over the skull, and the band it lands on at the nape.
  // Both are ON THE MIDLINE or symmetric about it — nothing is added to a
  // head in twos here, because two of anything on a head are eyes whatever
  // they were drawn as, and the band sits exactly where a bird's one
  // horizontal break is (the neck against the mantle, the bat's own join)
  P.box(cx - w(0.6), q(5.5), cx + w(0.6), q(10), GILT);
  // the band takes the skull's FULL width and not a little less: a hair
  // narrower and the head's bottom chamfer shows past it a pixel at a time
  P.box(cx - HEAD, q(9), cx + HEAD, q(10.5), GILT);
}

/**
 * One wing, drawn about its root with an OUTWARD pen: x runs away from the
 * body and y is the composed grid's own row, so the same drawing serves
 * the composed sprite's left wing and the wing cell's right one.
 */
function wing(O: Pen): void {
  const { w } = S;
  const { y0, y1, rootY, reach } = KING_WING;
  // spanwise units: the 32-layout scaled to the wing's own reach, so a
  // feature out along the span is built from units like everything else
  const R = scaler(reach);
  /** where the arm ends and the hand begins — half way out */
  const WRIST = R.q(16);
  // THE ARM, the secondaries: full chord at the shoulder and swept away to
  // the wrist. A wing of one rectangle reads as a plank; what a bird has
  // is a chord that falls away outboard
  tapered(O, WRIST + R.q(2), y0, y1, R.w(5), PLUME);
  // the coverts: the shorter feathers layered over the inner arm, in the
  // reversed pair. This is the only lighting a wing gets here, and it is
  // what keeps a dark slab from reading as one plate of metal
  tapered(O, R.q(11), y0 + w(1.5), y1 - w(1.5), R.w(4), PLUME_R);
  // the arm's spar — gunmetal out along the bone from the shoulder, the
  // steel cap and the gilt stud of the alula at the wrist
  O.box(0, rootY - w(0.5), WRIST - R.q(3), rootY + w(0.5), GUN);
  O.box(WRIST - R.q(5), rootY - w(0.5), WRIST - R.q(3), rootY + w(0.5), STEEL);
  O.box(WRIST - R.q(3), rootY - w(0.75), WRIST + R.q(1), rootY + w(0.75), GILT);
  // THE PRIMARIES: four slotted fingers off the wrist with daylight
  // between them, each shorter and further back than the last. This is the
  // eagle's hand, and it is the whole reason a very large dark flyer does
  // not read as a very large bat
  for (let k = 0; k < 4; k++) {
    const fy = y0 + w(0.5) + k * (w(2) + w(0.6));
    O.box(WRIST - R.q(2), fy, reach - k * R.q(3), fy + w(2), PLUME);
  }
  // and the gilt on the LEADING primary alone. One gold tip a wing is
  // regalia; four of them is a handful of studs thrown at a dark shape
  O.box(reach - R.q(5), y0 + w(0.5), reach, y0 + w(0.5) + w(2), GILT);
  // the charge: ONE seam a wing, run out along the spar. Two of them was
  // two bright squares side by side on a dark wing, which is a pair of
  // eyes at field zoom whatever the rule says they are
  O.box(R.q(2), rootY + w(1.25), R.q(11), rootY + w(2.25), EMBER);
}

/** the three drawings the wing rig packs, plus the accent cell */
export function king(): StoopArt {
  return flyer(KING_TIER, KING_WING, body, wing, EMBER);
}
