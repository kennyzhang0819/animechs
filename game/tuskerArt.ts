/**
 * TUSKER, THE ELEPHANT, on the turrets' grammar (turretArt.ts, and the
 * rhino's header in ironhideArt.ts for the grammar in full): every
 * material a dark/light PAIR split at the midline and nothing else for
 * lighting, a fold or a band in the REVERSED pair, NOTHING NARROWER THAN
 * FOUR PIXELS, no dither, no eyes, and every body drawn AT ITS HITBOX on
 * 32 native px a tile.
 *
 * THE ONE THING THAT IS DIFFERENT ABOUT THIS FAMILY IS THE SIZE, and it
 * is the point of it. Every other line opens on a 1x1 — a runt drawn on
 * the same 32 grid as a duo. The Tusker runt is a 1.75x1.75 on a 56 grid,
 * half again the widest T1 on the roster (the livewire1's 1.375), and the
 * apex is a 5.5x5.5 on 176: the largest thing that walks, half again the
 * ironhide5 that held that title. Nothing here overshoots to get there —
 * the quad is still the box (docs/unit-art.md section 2) — the BOX is
 * simply bigger, which is what makes a Tusker read as heavy at field zoom
 * instead of as a rhino drawn larger.
 *
 * THE ELEPHANT, seen from above, is THREE PRONGS OFF ONE BIG MASS. The
 * body is a single plate from the brow to the tail — an elephant has no
 * neck and no waist to draw — and off the front of it stand a TRUNK down
 * the middle with an IVORY TUSK either side, all three clear of the brow
 * with daylight between them. That is the read that survives at field
 * zoom, and it is the read the drawing is built around.
 *
 * The EARS are the second thing: two flared plates in the reversed pair,
 * so they catch the light the other way and lie over the shoulders as
 * flaps rather than as more back. They are rooted BEHIND the brow, which
 * matters — level with it they made a face, two lobes with a bright seam
 * between them, which is the failure the no-eyes rule exists to prevent.
 *
 * The tusks are the weapon: this family has no gun, it walks up to a
 * turret and takes it apart (weapons.ts, fx "melee"), so what it points
 * at you is what it hits you with — the rhino's horn rule, on a bigger
 * animal. The machine grows up the ladder and all of it runs LENGTHWAYS:
 * an ivory seam down the spine on the runt, a gunmetal howdah under it
 * from T2, the howdah run forward to the brow and a collar on each tusk
 * from T3, steel rims on the ears and a stack at the tail from T4, twin
 * stacks at T5. Nothing on this body runs across it.
 *
 * T1-T3 ride the mech rig (base plate, body, one sprite of near-side
 * pads slid by the walk — the legs stay tucked, docs/unit-art.md); T4 and
 * T5 the legged rig on four PILLARS: short for the bulk, planted wide,
 * and the thickest leg strokes on the roster.
 */
import type { LegParts, MechParts } from "./animalArt";
import { BORE, GUN, STEEL, draw, drawWithCell, rev, type Mat, type Pen } from "./turretArt";
import { scaler, segment, type IronTier } from "./ironhideArt";

/**
 * The hide, and the IVORY the family wears (PAL.tusk is the light).
 *
 * IT IS A MID GREY, WHICH IS WHAT AN ELEPHANT IS. The first cut was a
 * near-black slate, picked to be sure the two heavy ground lines were
 * never mistaken for each other — and it made the animal read as
 * armour-plate rather than as hide. This pair is a clear step LIGHTER
 * than the rhino's and cooler than its grey-mauve, which separates them
 * on tone instead of on darkness and costs nothing: at field zoom the
 * rhino is a dark body with one crimson-tipped horn and the Tusker is a
 * pale one with three prongs, two of them ivory.
 *
 * Everything the machine is drawn in (GUN, BORE) is now DARKER than the
 * hide rather than lighter, so the howdah reads as plating laid on the
 * animal — which is the right way round and was the other thing the dark
 * cut got backwards.
 */
export const TUSK_HIDE: Mat = ["#67666f", "#a3a2ad"];
export const IVORY: Mat = ["#a89372", "#fff3de"];
const HIDE_R = rev(TUSK_HIDE);

/**
 * The hitboxes, UR x 1.75 / 2.25 / 3 / 4.25 / 5.5, at 32 px a tile — so
 * the grids are 56, 72, 96, 136 and 176. `stride` is the mech rig's pad
 * swing (T1-T3); `small`, `th` and `sh` the legged rig's cap grid and its
 * two segment strokes (T4-T5), and both strokes are the widest here of
 * any family: a pillar is a leg with no taper.
 */
export const TUSK_TIERS: readonly IronTier[] = [
  { t: 1, n: 56, stride: 8, small: 16, th: 4, sh: 4 },
  { t: 2, n: 72, stride: 10, small: 16, th: 4, sh: 4 },
  { t: 3, n: 96, stride: 12, small: 16, th: 4, sh: 4 },
  { t: 4, n: 136, stride: 0, small: 48, th: 15, sh: 12 },
  { t: 5, n: 176, stride: 0, small: 64, th: 20, sh: 16 },
];

/**
 * The body: everything but the legs, laid out on a 32 grid and scaled to
 * the tier's. Drawn back to front — the back, the head, the ears over
 * both, then the machine, then the trunk and the tusks on top of
 * everything, because they are what the animal leads with.
 *
 * Only the LEFT half and the centre are drawn; finish() mirrors and
 * shades. No round pair anywhere and no pair of anything on the head: the
 * tusks flank a trunk, which is three shapes and not two.
 */
function body(P: Pen, T: IronTier): void {
  const { n, t } = T; const { q, w } = scaler(n); const c = n / 2; const U = w(2);
  // EVERY WIDTH ON THIS BODY IS A MULTIPLE OF U, the scaler's unit, and
  // the layout is one stack read from the middle out: trunk and seam U
  // either side of the midline, howdah 2U, tusk from 2U to 3U, ear from
  // 4U to the grid's edge, body 5U. What is left beside a feature is a
  // unit too, on every tier — which is the whole reason the front comes
  // out as three prongs with a unit of daylight between them at 56 px
  // and at 176, instead of as a two-pixel sliver on one and a gap on the
  // other.
  const B = 5 * U;
  // the body: ONE broad plate from the brow to the tail, pinched at the
  // shoulders by the ears rather than by a cut, with the hip fold across
  // it in the reversed pair. A single mass is what an elephant is from
  // above — there is no neck to draw and no waist — and the brow sits a
  // quarter of the way down the grid, because everything in front of it
  // is trunk and tusk
  P.octa(c - B, q(8), c + B, q(21), w(3), TUSK_HIDE);
  P.octa(c - B, q(15), c + B, n - q(1), w(3), TUSK_HIDE);
  P.box(c - B + U, q(25), c + B - U, q(25) + w(3), HIDE_R);
  // THE EARS: one flared plate each side, in the reversed pair so it
  // catches the light the other way and reads as a flap rather than as
  // more back. They are rooted BEHIND the brow and laid back over the
  // shoulders, out to the grid's edge — which is where an elephant's ears
  // are, and is what keeps a pair of shapes on a body from reading as a
  // pair of shapes on a FACE. They overlap the body by a unit and take
  // the silhouette to its widest across the shoulders
  const ear = t >= 4 ? q(27) : q(26);
  P.octa(q(1), q(11), c - 4 * U, ear, U, HIDE_R);
  // ...rimmed in steel along the leading edge from T4
  if (t >= 4) P.box(q(1) + U, q(11) + 2 * U, q(1) + 2 * U, ear - 2 * U, STEEL);
  // the machine, and it rides the SPINE on this family and never the
  // flanks, so the mass either side of it stays one dark block. NOTHING
  // ON IT RUNS ACROSS: a band over a symmetrical body is a mouth, and on
  // a body that already carries two ear flaps it is the whole face. The
  // ladder is therefore all length — the ivory seam alone on the runt, a
  // gunmetal howdah under it from T2, and the howdah run forward to the
  // brow from T3
  if (t >= 2) {
    P.box(c - 2 * U, q(t >= 3 ? 14 : 19), c + 2 * U, n - q(3), GUN);
    P.box(c - U, q(t >= 3 ? 16 : 21), c + U, n - q(5), IVORY);
  } else P.box(c - U, q(20), c + U, q(27), IVORY);
  // a stack at the tail from T4, twin stacks either side of the seam at
  // T5, each with an ivory heat band — the rhino's tell, on a bigger body
  if (t >= 4) for (const x of t >= 5 ? [c - 2 * U, c + 2 * U] : [c]) {
    P.box(x - U, n - q(7), x + U, n, GUN);
    P.box(x - U, n - q(7), x + U, n - q(7) + U, BORE);
    P.box(x - U, n - q(3), x + U, n - q(3) + U, IVORY);
  }
  // THE THREE PRONGS, and they are the whole of what this animal is from
  // above: a trunk down the middle with a tusk either side of it, all
  // three standing clear of the brow with daylight between them. It is
  // what survives at field zoom when the ears and the howdah are four
  // grey pixels — a big body with three things sticking out of the front
  // of it, the middle one long and the outer two ivory.
  //
  // The trunk is 2U wide, reaches the grid's front edge and runs back
  // under the brow to the shoulders. It is drawn in the REVERSED pair
  // root to tip, so it is lit against the body behind it and reads as its
  // own limb rather than as a notch in the skull
  P.box(c - U, 0, c + U, q(19), HIDE_R);
  // the tusks: ivory, a unit wide, a unit of daylight either side of the
  // trunk, and they ARE the weapon — this family has no gun (weapons.ts,
  // fx "melee"), so what it points at you is what it hits you with. A
  // collar of gunmetal across each from T3, and they lengthen up the
  // ladder
  const tuskL = q(t >= 4 ? 15 : t >= 3 ? 14 : 13);
  P.box(c - 3 * U, q(2), c - 2 * U, tuskL, IVORY);
  if (t >= 3) P.box(c - 3 * U, q(10), c - 2 * U, q(10) + U, GUN);
}

/** the plate the mech rig's pads mount to, under the body */
const base = (P: Pen, T: IronTier): void => {
  const { n } = T; const { q, w } = scaler(n);
  P.octa(q(8), q(12), n - q(8), n - q(2), w(5), GUN);
};
/** the near-side pads: two broad blocks at the body's right edge, each
 *  with a band of ivory toenail across its front — the one place the
 *  family's colour shows anywhere but the tusks, and what the eye follows
 *  through the walk cycle. Drawn for the right side only (the renderer
 *  mirrors it for the left), so it is not mirrored here */
const pads = (P: Pen, T: IronTier): void => {
  const { n } = T; const { q, w } = scaler(n);
  for (const y of [q(14), q(24)]) {
    P.box(n - q(10), y, n - q(2), y + w(7), TUSK_HIDE);
    P.box(n - q(10), y, n - q(2), y + w(2), IVORY);
  }
};

/** T1-T3 on the mech rig */
export function tuskMech(T: IronTier): MechParts {
  const { art, cell } = drawWithCell(T.n, (P) => body(P, T), IVORY);
  return {
    body: art,
    base: draw(T.n, (P) => base(P, T)),
    leg: draw(T.n, (P) => pads(P, T), false),
    cell,
    stride: T.stride,
  };
}

/** T4-T5 on the legged rig: the body and base plus the caps, the pad and
 *  the two pillar segments */
export function tuskLegged(T: IronTier): LegParts {
  const { n, small, th } = T; const { q, w } = scaler(n); const sc = small / 2;
  const { art, cell } = drawWithCell(n, (P) => body(P, T), IVORY);
  // the pad: a round block of hide with the ivory toenail across its
  // front, the same band the mech tiers' pads wear
  const foot = (P: Pen): void => {
    P.octa(sc - w(4), sc - w(4), sc + w(4), sc + w(4), w(2), TUSK_HIDE);
    P.box(sc - w(3), sc - w(3), sc + w(3), sc - w(3) + w(2), IVORY);
  };
  return {
    body: art,
    base: draw(n, (P) => P.octa(q(9), q(13), n - q(9), n - q(3), w(5), GUN)),
    cell,
    foot: draw(small, foot, false),
    joint: draw(small, (P) => P.disc(sc, sc, Math.max(2, Math.round(th / 2)), TUSK_HIDE), false),
    baseJoint: draw(small, (P) => P.disc(sc, sc, Math.max(3, Math.round(th * 0.75)), GUN), false),
    small,
    leg: segment(64, th, TUSK_HIDE),
    legBase: segment(64, T.sh, TUSK_HIDE),
  };
}
