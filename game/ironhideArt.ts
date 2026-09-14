/**
 * IRONHIDE, THE RHINO, DRAWN THE WAY FOUNDRY'S TURRETS ARE (turretArt.ts):
 * the first family on the turrets' grammar, and the pattern for the rest.
 *
 * THE GRAMMAR, read off the shipped heads (public/foundry):
 *   - Every material is a PAIR, dark on the left half of the sprite and
 *     light on the right, and that is the whole of the lighting. A part is
 *     drawn once in a material, the shade is applied after (finish), so
 *     the shape is symmetric by construction and the shade never is. A
 *     part drawn in the REVERSED pair (rev) catches light the other way:
 *     that is how a fold, a band or a plate's bevel is shown, never with
 *     a third tone.
 *   - NOTHING NARROWER THAN FOUR PIXELS: no line, no stud, no gap, no
 *     band under four. No dither, no checker, no one-pixel highlight. The
 *     tacker is 32 px and reads with four colours in blocks; so does the T1.
 *   - THE SCALE IS THE TURRETS': 32 native px a tile, so a body is drawn
 *     at its HITBOX. An ironhide1 is a 1x1 (radius UR = 10 world px, a 20
 *     px tile) and draws on a 32 grid, like a tacker; an ironhide5 is a
 *     3.75x3.75 and draws on 120. No overshoot: the quad IS the box, and
 *     the sheet's 0.625 world px per native px puts 32 px on one tile.
 *   - Facing up, on its own square grid, through the same packer as
 *     every stock sprite.
 *
 * THE RHINO: a wall of back seen from above, the head a wedge off the
 * shoulders, the horn a spike of dark keratin whose tip is the crimson —
 * the straight round comes out of the one thing a rhino points at you. A
 * fold of hide across the shoulder and another before the hip, drawn in
 * the reversed pair. The machine grows up the ladder: a gunmetal saddle
 * down the spine from T2 with the crimson seam on it, steel strakes down
 * the flanks and a second horn from T3, pauldrons over the shoulders and
 * a stack at the hip from T4, and at T5 a crest plate over the head, twin
 * stacks, and the CRIMSON OFF THE HORN ONTO THE ARMOUR — a blaze in each
 * pauldron and a cap on each strake, which is the apex's own tell and the
 * quickest way to tell this champion from the Tusker's.
 *
 * T1-T3 ride the mech rig (base plate, body, one sprite of near-side
 * hooves slid by the walk); T4 and T5 the legged rig on four stout legs
 * (caps, hoof, two stretched segments).
 */
import type { Art } from "./animalArt";
import type { LegParts, MechParts, Rect } from "./animalArt";
import { BORE, GUN, STEEL, draw, drawWithCell, rev, type Mat, type Pen } from "./turretArt";

/** the hide, and the crimson the family wears (PAL.mech is the light) */
export const HIDE: Mat = ["#524b4d", "#857c7a"];
export const CRIM: Mat = ["#b0223f", "#ff5c73"];
/**
 * KERATIN, AND IT IS SHARED WITH THE OTHER FAMILIES (familyArt.ts): a
 * horn, an antler, a tusk, a claw and a beak are all the same stuff, and
 * none of them is metal. The rule this pair exists to keep is that STEEL
 * — a near-white — goes on a body ONLY where the animal is really that
 * pale: an elephant's tusk, a deer's antler, the narwhal's ivory. A
 * rhino's horn is dark keratin, so it is drawn in dark keratin, and what
 * is left reading as machine on these bodies is the machine.
 */
export const HORN: Mat = ["#6a5e52", "#a89c8c"];
/** the pale end of the same stuff: antler, ivory, bone */
export const BONE: Mat = ["#a4967a", "#f0e5cd"];
const HIDE_R = rev(HIDE);

export interface IronTier {
  t: number;
  /** the grid: the hitbox in native px (32 a tile) */
  n: number;
  /** the mech rig's leg swing, native px (T1-T3) */
  stride: number;
  /** the legged rig's small grid (caps and hoof) and its two segment
   *  heights, native px across the leg (T4-T5) */
  small: number;
  th: number;
  sh: number;
}
/** hitboxes UR x 1 / 1.25 / 1.625 / 2.75 / 3.75, at 32 px a tile.
 *  A RHINO IS A BLOCK ON FOUR STUMPS. The legged tiers' strokes are a
 *  sixth of the grid, between the stag's tapering limb and the
 *  elephant's pillar, and they hardly narrow: what little of a leg shows
 *  past a body this wide is all shin. They were a ninth, which on a
 *  stance that swung the feet three radii out (game/levels.ts) made four
 *  thin limbs reaching from under a plate — a spider. */
export const IRON_TIERS: readonly IronTier[] = [
  { t: 1, n: 32, stride: 5, small: 16, th: 4, sh: 4 },
  { t: 2, n: 40, stride: 6, small: 16, th: 4, sh: 4 },
  { t: 3, n: 52, stride: 7, small: 16, th: 4, sh: 4 },
  { t: 4, n: 88, stride: 0, small: 32, th: 15, sh: 12 },
  { t: 5, n: 120, stride: 0, small: 48, th: 20, sh: 16 },
];

/** pixel coordinates on the tier's grid, off a 32-grid layout: every value
 *  is scaled and rounded, and a width is held to four or more. Shared
 *  with the other families (familyArt.ts) */
export const scaler = (n: number) => {
  const u = n / 32;
  const q = (v: number): number => Math.round(v * u);
  const w = (v: number): number => Math.max(4, Math.round(v * u));
  return { q, w };
};

/** the body: everything but the legs. Laid out on a 32 grid — horn at the
 *  top, then the head, then the back — and scaled to the tier's. No pair
 *  of anything on the head, and no round pair anywhere: two discs side by
 *  side are eyes at any size */
function body(P: Pen, T: IronTier): void {
  const { n, t } = T; const { q, w } = scaler(n); const c = n / 2;
  // the horn's reach past the head and its width: the gun grows with the tier
  const hornW = w(t >= 5 ? 6 : t >= 3 ? 5 : 4), hornL = q(t >= 5 ? 9 : t >= 3 ? 8 : 7);
  // the back: a chamfered plate, the shoulder fold and the hip fold in the reversed pair
  P.octa(q(3), q(12), n - q(3), n - q(1), w(5), HIDE);
  P.box(q(3), q(15), n - q(3), q(15) + w(4), HIDE_R);
  P.box(q(4), q(24), n - q(4), q(24) + w(4), HIDE_R);
  // the head: a wedge off the shoulders
  P.octa(c - w(7), q(4), c + w(7), q(14), w(4), HIDE);
  // the crest: a gunmetal plate over the forehead at T5, under the horn
  if (t >= 5) P.octa(c - w(5), q(5), c + w(5), q(12), w(2), GUN);
  // the horn: a spike of dark keratin, its tip the crimson. It is horn
  // and not steel because a rhino's horn is not steel and not white — the
  // ram is the animal's own, and the metal on this body is the plate
  P.box(c - hornW / 2, 0, c + hornW / 2, hornL, HORN);
  P.box(c - hornW / 2, 0, c + hornW / 2, w(3), CRIM);
  if (t >= 3) P.box(c - hornW / 2, q(9), c + hornW / 2, q(9) + w(4), HORN);   // the second horn, behind the first
  if (t >= 5) P.box(c - hornW / 2 - w(2), q(3), c + hornW / 2 + w(2), q(3) + w(3), GUN);   // a muzzle collar
  // strakes: steel down each flank from T3, inside the back's edge; from
  // T4 they start below the pauldron, a clear gap between
  if (t >= 3) P.box(q(5), q(t >= 4 ? 22 : 16), q(5) + w(3), n - q(6), STEEL);
  // the apex is PAINTED, which is the one thing no other tier is: the
  // crimson runs off the horn's tip onto the armour, a blaze filling each
  // pauldron's flat and a cap on the tail of each strake. It is the read
  // that separates this champion from the Tusker's at field zoom — two
  // grey masses otherwise, one with red on its shoulders
  if (t >= 5) P.box(q(5), n - q(6) - w(2), q(5) + w(3), n - q(6), CRIM);
  // pauldrons: a gunmetal plate over each shoulder from T4, square to the back
  if (t >= 4) P.octa(q(3), q(11), q(3) + w(9), q(11) + w(7), w(2), GUN);
  // the blaze sits inside the pauldron's FLAT (a chamfer's width in on
  // every side), so it never ends against a diagonal and leaves no wedge
  if (t >= 5) P.box(q(3) + w(2), q(11) + w(2), q(3) + w(9) - w(2), q(11) + w(7) - w(2), CRIM);
  // the saddle: a gunmetal plate down the spine from T2, the crimson seam on it
  if (t >= 2) {
    P.box(c - w(4), q(14), c + w(4), n - q(4), GUN);
    P.box(c - w(2), q(16), c + w(2), n - q(7), CRIM);
  } else P.box(c - w(2), q(16), c + w(2), q(24), CRIM);
  // a stack at the hip from T4, twin stacks at T5, each with a crimson heat band
  if (t >= 4) for (const x of t >= 5 ? [c - w(5), c + w(5)] : [c]) {
    P.box(x - w(2), n - q(7), x + w(2), n, GUN);
    P.box(x - w(2), n - q(7), x + w(2), n - q(7) + w(2), BORE);
    P.box(x - w(2), n - q(3), x + w(2), n - q(3) + w(2), CRIM);
  }
}

/** the plate the mech rig's legs mount to, under the body: gunmetal, a
 *  step in from the back's edge */
const base = (P: Pen, T: IronTier): void => {
  const { n } = T; const { q, w } = scaler(n);
  P.octa(q(6), q(12), n - q(6), n - q(2), w(4), GUN);
};
/** the near-side hooves: two blocks at the body's right edge, the slide
 *  showing a sliver of each past the back. Drawn for the right side only
 *  (the renderer mirrors it for the left), so it is not mirrored here */
const hooves = (P: Pen, T: IronTier): void => {
  const { n } = T; const { q, w } = scaler(n);
  for (const y of [q(13), q(23)]) {
    P.box(n - q(5), y, n, y + w(6), HIDE);
    P.box(n - q(5), y + w(6) - w(2), n, y + w(6), GUN);
  }
};

/** T1-T3 on the mech rig */
export function ironMech(T: IronTier): MechParts {
  const { art, cell } = drawWithCell(T.n, (P) => body(P, T), CRIM);
  return {
    body: art,
    base: draw(T.n, (P) => base(P, T)),
    leg: draw(T.n, (P) => hooves(P, T), false),
    cell,
    stride: T.stride,
  };
}

/** a stretched leg segment: hide, its top half dark and its bottom light,
 *  as a round leg seen from above is. Shared with the other families */
export const segment = (w: number, h: number, m: Mat): Rect => {
  const px: (string | null)[] = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) px.push(y < h / 2 ? m[0] : m[1]);
  return { px, w, h };
};

/** T4-T5 on the legged rig: body and base plus the caps, the hoof and the segments */
export function ironLegged(T: IronTier): LegParts {
  const { n, small } = T; const { q, w } = scaler(n); const sc = small / 2;
  const { art, cell } = drawWithCell(n, (P) => body(P, T), CRIM);
  return {
    body: art,
    base: draw(n, (P) => P.octa(q(7), q(13), n - q(7), n - q(3), w(4), GUN)),
    cell,
    // the hoof: a broad block of hide with a gunmetal toe, drawn pointing
    // up. Wider across the leg than along it, and wider than the leg
    // itself — on the two legged tiers the hoof and a stub of shin are
    // the only parts of a leg that clear the body at all
    foot: draw(small, (P) => { P.box(sc - w(4), sc - w(3), sc + w(4), sc + w(3), HIDE); P.box(sc - w(4), sc - w(3), sc + w(4), sc - w(3) + w(2), GUN); }, false),
    joint: draw(small, (P) => P.disc(sc, sc, Math.max(2, Math.round(T.th / 2)), HIDE), false),
    baseJoint: draw(small, (P) => P.disc(sc, sc, Math.max(3, Math.round(T.th * 0.75)), GUN), false),
    small,
    leg: segment(64, T.th, HIDE),
    legBase: segment(64, T.sh, HIDE),
  };
}
