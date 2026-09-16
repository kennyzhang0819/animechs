/**
 * THREE CANDIDATES FOR THE SECOND AIR FAMILY, and the two that did not
 * get built. It is the sheet step 1 of docs/unit-art.md section 3 asks
 * for — draw the T5 first, and if it does not read as the animal in
 * silhouette, stop there — for three animals at once, so the choice was
 * made off drawings rather than off a paragraph.
 *
 * THE KETTLE WON AND HAS LEFT THIS FILE: it is a family now
 * (game/kettleArt.ts, levels.ts `kettle1`..`kettle5`), imported back here
 * so the sheets keep showing all three side by side. The Skein and the
 * Gyre below are still drawings and nothing else — no kind ids, no cells
 * in atlas.ts, no stats in levels.ts.
 *
 *   npm run gen:air      → docs/air-concepts/*.png
 *
 * THE BRIEF. The Stoop is the only thing in the sky and it is a BOMBER:
 * it picks a structure, dives it and goes off on contact (levels.ts
 * `payload`), so the family is answered by killing it anywhere at all —
 * a stoop that dies over the outer wall has spent itself on the outer
 * wall. The second air family is the opposite promise: it does NOT spend
 * itself, it crosses the board over the guns and it arrives at the core,
 * and the whole of what the board has to do is stop it on the way. So
 * each of the three below is one answer to the same question — WHY does
 * this thing survive the crossing — and the drawing carries that answer
 * where it can:
 *
 *   SKEIN, the goose      the flock is one body: only the point bird can
 *                         be hit, so splash is worthless and the wave is
 *                         a queue of kills rather than a pool of health.
 *                         The tell is the DRAFT CELL — the frost at the
 *                         wing root the point burns and the rest ride.
 *   KETTLE, the vulture   your kills feed it: every body that dies under
 *                         a kettle is carrion, and the crop at its
 *                         breast swells with it. The tell is the CROP,
 *                         drawn bigger every tier — the gimmick is the
 *                         silhouette.
 *   GYRE, the albatross   it flies above every gun's arc and what the
 *                         board can shoot is its SHADOW, cast down and
 *                         forward of the wings. The tell is the UMBRA
 *                         down the keel, and the sheet draws the shadow
 *                         beside the bird because the shadow is the unit.
 *
 * All three ride the wing rig the Stoop, the Skate, the Livewire and the
 * Sovereign ride (familyArt.ts `flyer`, `withCells`, `flyerGeom`): a body
 * column and one wing drawn about its root, mirrored and folded by the
 * renderer. A new flyer needs a drawing and nothing else, which is why
 * three of them cost one file.
 *
 * The grammar is the turrets' (docs/unit-art.md section 1b) and it is not
 * relaxed for a concept: every material a dark/light PAIR split at the
 * midline, a fold in the reversed pair, NOTHING UNDER FOUR PIXELS, no
 * dither, no eyes, no round pair, every body drawn AT ITS HITBOX on 32 px
 * a tile. The render script lists every run under four px, same as the
 * Sovereign's sheet.
 *
 * ONE HUE A FAMILY and none of them is a turret's (constants.ts PAL): the
 * swarm already owns rose, lime, gold, magenta, teal, violet, bone and
 * copper, so what is actually free for a ninth family is the cold end —
 * a frost and a near-black. The Skein takes the frost and the Gyre the
 * umbra; the Kettle's rust is the one of the three with a palette
 * problem (it sits between the Ironhides' rose and the Grapnels' copper)
 * and would have to move to the frost seat if it were the one that
 * shipped. Said here rather than discovered on the field.
 */
import type { StoopArt, StoopGeom } from "./animalArt";
import { BORE, GUN, STEEL, bars, rev, type Mat, type Pen } from "./turretArt";
import { scaler } from "./ironhideArt";
import { flyer, flyerGeom, withCells, type Base, type FlyerTier, type Wing } from "./familyArt";
import { BEAK, KETTLE_TIERS, kettle, reachOf } from "./kettleArt";

/**
 * A TAPERED, SWEPT WING, in four panels out the span. Each panel's chord
 * is interpolated between the root's and the tip's, so the outline can
 * only narrow — the pass that placed three boxes by eye left a sliver
 * hanging off the tip on two tiers out of five, which is the sort of
 * thing a formula cannot do and an eye does every time.
 *
 * `front` and `back` are the fractions of the root chord the LEADING and
 * the TRAILING edge give up over the span. Front bigger than back is
 * what sweeps a tip BACK: the wing's front line falls away and its rear
 * line barely moves, so the tip ends up behind the shoulder. Both at
 * zero is the plank the vulture flies.
 */
function panels(O: Pen, L: Wing, mats: readonly [Mat, Mat], front: number, back: number, n = 4): void {
  const chord = L.y1 - L.y0;
  for (let k = 0; k < n; k++) {
    const f = k / (n - 1);
    const x0 = Math.round((k * L.reach) / n);
    const x1 = Math.min(L.reach, Math.round(((k + 1.35) * L.reach) / n));
    const top = L.y0 + Math.round(f * front * chord);
    const bot = L.y1 - Math.round(f * back * chord);
    if (bot - top < 4 || x1 - x0 < 4) continue;
    O.box(x0, top, x1, bot, k < n / 2 ? mats[0] : mats[1]);
  }
}

// ── SKEIN: the goose ────────────────────────────────────────────────────
//
// A goose from above is a CROSS: a narrow body running the length of the
// box with the wings out either side of the middle of it, a neck in front
// and a short tail behind. That shape — and not any detail on it — is
// what four passes of this drawing were about, because the first three
// filled the box with body and hung a deep slab off each side of it,
// which is a bat: the Stoop's wing is nearly twice as DEEP as it is long,
// and every bird's is the other way round. A wing that reads as a wing on
// this grid has a chord of about six units of the 32 layout and a span of
// half the box, and everything else here is built to leave room for it.
//
// The plumage is a grey-brown DOWN with the nape near-black down its
// midline and the wingtips a darker PINION, which is a greylag and not a
// gunship. The machine is a gunmetal plate down the spine from T2 with
// the FROST cell on it. The apex takes the frost into its collar and two
// keel bars at the tail.
export const DOWN: Mat = ["#54473a", "#a08b6e"];
export const NECK: Mat = ["#23262b", "#4d525a"];
export const PINION: Mat = ["#34302a", "#6b6354"];
export const FROST: Mat = ["#3f86c4", "#d6f2ff"];
const DOWN_R = rev(DOWN);

/** hitboxes UR x 1.125 / 1.375 / 2.25 / 4.375 / 5.625 — a leaner line
 *  than the Stoop's (which ends at 7.25), because this family's weight is
 *  in how many of them are in the wedge and not in any one body */
const SKEIN_BASE: readonly Base[] = [
  { t: 1, n: 36, fold: 0.26, sweep: 0.15, rate: 4.5 },
  { t: 2, n: 44, fold: 0.26, sweep: 0.14, rate: 4 },
  { t: 3, n: 72, fold: 0.24, sweep: 0.13, rate: 3.2 },
  { t: 4, n: 140, fold: 0.22, sweep: 0.11, rate: 2.4 },
  { t: 5, n: 180, fold: 0.2, sweep: 0.1, rate: 1.8 },
];
/** the breast's half width: six units of the 32 layout, so a spine plate
 *  at ±2U and its cell at ±U leave a unit of down either side of both */
const skeinHalf = (T: Base): number => scaler(T.n).w(6);
const skeinWing = (T: Base): Wing => {
  const { n } = T; const { q, w } = scaler(n); const rootX = w(3);
  // the root sits three units INSIDE the breast's edge, so the wing is
  // under the bird rather than beside it however the body tapers
  return { rootX, rootY: q(14), y0: q(12), y1: q(18), reach: reachOf(n, rootX) };
};
export const SKEIN_TIERS: readonly FlyerTier[] = SKEIN_BASE.map((T) => withCells(T, skeinWing(T), 2 * skeinHalf(T) + 2));
export function skeinGeom(T: FlyerTier): StoopGeom { return flyerGeom(T, skeinWing(T)); }
export function skein(T: FlyerTier): StoopArt {
  const { n, t } = T; const { q, w } = scaler(n); const cx = n / 2; const U = w(2);
  const B = skeinHalf(T), L = skeinWing(T);
  const body = (P: Pen): void => {
    // front to back, each part narrower than the one behind it: a beak of
    // four units, a head of eight, a neck of six, a breast of twelve. The
    // taper IS the animal — two passes drew a near-black tower on a pale
    // body and both came out a bottle with a cork in it, and no head
    // shape argues with a silhouette
    P.box(cx - U, 0, cx + U, q(5), BEAK);
    P.octa(cx - w(5), q(3), cx + w(5), q(10), w(3), DOWN);
    P.box(cx - w(3), q(8), cx + w(3), q(15), DOWN);
    // the dark nape down the midline of the neck from T2: a line down the
    // animal, the way the plating rule asks, and the one place the
    // near-black belongs
    if (t >= 2) P.box(cx - U, q(4), cx + U, q(12), NECK);
    // the breast at full width under the wings, the belly tapering behind
    // it, the hip fold reversed and low — a fold up at the shoulders is a
    // horizontal cut across a symmetrical body, which reads as a face
    P.octa(cx - B, q(13), cx + B, q(24), w(4), DOWN);
    P.octa(cx - w(4), q(22), cx + w(4), q(28), w(3), DOWN);
    P.box(cx - w(3), q(23), cx + w(3), q(23) + w(3), DOWN_R);
    P.box(cx - w(3), q(27), cx + w(3), n - q(1), PINION);
    // the machine: a gunmetal plate down the SPINE from T2 with the frost
    // CELL on it. The cell is a cell and not a stripe — a hue run the
    // length of a body is the wrong animal, which is what turned the
    // Stoop into a moth the first time it was drawn
    if (t >= 2) P.box(cx - 2 * U, q(15), cx + 2 * U, q(24), GUN);
    P.box(cx - U, q(16), cx + U, q(16) + w(6), FROST);
    // a gunmetal collar where the neck meets the shoulders from T4: the
    // one horizontal break allowed, because a goose really has one there
    if (t >= 4) P.box(cx - w(3), q(12), cx + w(3), q(12) + w(3), GUN);
    // the apex: the collar burns frost, and two keel bars sit at the tail
    if (t >= 5) {
      P.box(cx - U, q(12), cx + U, q(12) + w(3), FROST);
      bars(P, cx - w(3), cx + w(3), q(25), 2, U, U, BORE);
    }
  };
  const wing = (O: Pen): void => {
    const R = scaler(L.reach); const chord = L.y1 - L.y0;
    // half the chord off the leading edge over the span and a tenth off
    // the trailing one: the wing narrows to a third at the tip and the
    // tip sits BEHIND the shoulder, which is a goose's wing and not a
    // bat's slab
    panels(O, L, [DOWN, PINION], 0.45, 0.12);
    // the leading edge: a dark bar along the front of the arm
    O.box(0, L.y0, R.q(15), L.y0 + Math.max(4, Math.round(chord * 0.28)), PINION);
    // THE DRAFT CELL at the elbow, on every tier — the point bird burns
    // these and the wedge behind it rides what comes off them, so it is
    // the one mark the family cannot be without. A second out at the
    // wrist on the apex
    O.box(R.q(7), L.y0 + Math.round(chord * 0.35), R.q(7) + R.w(5), L.y1, FROST);
    if (t >= 5) O.box(R.q(18), L.y0 + Math.round(chord * 0.55), R.q(18) + R.w(5), L.y1, FROST);
  };
  return flyer(T, L, body, wing, FROST);
}

// ── KETTLE: the vulture — SHIPPED, and drawn in game/kettleArt.ts ───────
//
// THE ONE THAT WAS PICKED. It is a real family now (levels.ts
// `kettle1`..`kettle5`), so its drawing moved out of this file into
// game/kettleArt.ts and is imported back for the sheets below — one
// source of truth, and a concept sheet that keeps telling the truth about
// what shipped. It went in WITHOUT the carrion mechanic below: the art
// first, the ability when the design is ready for it.

// ── GYRE: the albatross ─────────────────────────────────────────────────
//
// An albatross from above is a WHITE BODY BETWEEN TWO BLACK NEEDLES, and
// that is the whole drawing: the narrowest chord on the sheet — four
// units of the 32 layout, against the goose's six and the vulture's nine
// — run out to the edge of the box with no taper in it at all, a heavy
// hooked bill on a mantle with no neck showing, and a short dark tail. If
// the three candidates are ever seen together this is the one that reads
// at any size, because nothing else in the game is a line.
//
// It is also the one body where a PALE plumage is honest: docs/unit-art.md
// keeps the near-whites for the places an animal really is near-white,
// and a wandering albatross's back is one of them. It goes on in a warm
// off-white rather than in STEEL, which would make it a hull.
//
// THE UMBRA IS THE GIMMICK. What the board shoots is the shadow this
// thing casts, not the bird, so the family's colour is the shadow's: a
// cold near-black on the keel, at the wing root and along the leading
// edge of the apex's hand. The sheet draws the shadow beside the bird
// (docs/air-concepts/gyre-shadow.png) because the shadow is the unit —
// the drawing on its own is only half of it.
export const PLUME: Mat = ["#96968a", "#eceadd"];
export const MANTLE: Mat = ["#22242e", "#4a4d5e"];
export const UMBRA: Mat = ["#2b2f4a", "#7079b0"];
const PLUME_R = rev(PLUME);

/** hitboxes UR x 1.375 / 1.875 / 3 / 6.125 / 7.25 — the apex ties the
 *  stoop5 for the widest box in the game, which on the one family whose
 *  premise is that you cannot shoot it is the right kind of joke: it is
 *  enormous, and its size buys the board nothing */
const GYRE_BASE: readonly Base[] = [
  { t: 1, n: 44, fold: 0.16, sweep: 0.1, rate: 2.6 },
  { t: 2, n: 60, fold: 0.15, sweep: 0.09, rate: 2.2 },
  { t: 3, n: 96, fold: 0.14, sweep: 0.08, rate: 1.7 },
  { t: 4, n: 196, fold: 0.12, sweep: 0.07, rate: 1.2 },
  { t: 5, n: 232, fold: 0.1, sweep: 0.06, rate: 0.9 },
];
const gyreHalf = (T: Base): number => scaler(T.n).w(4);
const gyreWing = (T: Base): Wing => {
  const { n } = T; const { q, w } = scaler(n); const rootX = w(3);
  // THE CHORD IS THE FAMILY: rows 14..18 of the 32 layout and no more,
  // a third of what the bat's wing takes, so every tier is span and the
  // fold the renderer puts on it barely changes the outline
  return { rootX, rootY: q(15), y0: q(14), y1: q(18), reach: reachOf(n, rootX) };
};
export const GYRE_TIERS: readonly FlyerTier[] = GYRE_BASE.map((T) => withCells(T, gyreWing(T), 2 * gyreHalf(T) + 2));
export function gyreGeom(T: FlyerTier): StoopGeom { return flyerGeom(T, gyreWing(T)); }
export function gyre(T: FlyerTier): StoopArt {
  const { n, t } = T; const { q, w } = scaler(n); const cx = n / 2; const U = w(2);
  const B = gyreHalf(T), L = gyreWing(T);
  const body = (P: Pen): void => {
    // the bill: long, heavy, hooked, and NARROWER than the head behind
    // it. A tubenose really carries a pair of nostril tubes, one a side,
    // and a pair of anything on a head is a pair of eyes at every size —
    // so this bird gets the one, down the midline
    P.box(cx - U, 0, cx + U, q(7), BEAK);
    // the head with no neck showing, then the mantle running most of the
    // length of the box: an albatross is a long bird with a short face.
    // The body is NARROW — four units of the 32 layout against the
    // goose's six — because a pale plate as wide as it is long is the
    // hull docs/unit-art.md warns a near-white turns a body into
    P.octa(cx - w(3), q(4), cx + w(3), q(12), w(2), PLUME);
    P.octa(cx - B, q(9), cx + B, q(26), w(3), PLUME);
    P.box(cx - B + U, q(21), cx + B - U, q(21) + w(3), PLUME_R);
    // the rear of the same plate in the dark pair rather than a tail
    // block behind it: a wedge hung off the back of a chamfer floats off
    // it a row at a time, which is the trap a big body has
    P.octa(cx - w(3), q(25), cx + w(3), n - q(1), w(2), MANTLE);
    // the machine: a gunmetal keel down the spine from T2 with the umbra
    // on it. The runt carries the cell alone. THE KEEL IS SHORT on
    // purpose — a plate the length of a pale body leaves the plumage as a
    // rim round a grey slab, and what that draws is a rocket
    if (t >= 2) P.box(cx - 2 * U, q(14), cx + 2 * U, q(21), GUN);
    P.box(cx - U, q(15), cx + U, q(15) + w(5), UMBRA);
    if (t >= 2) P.box(cx - U, q(5), cx + U, q(5) + w(3), UMBRA);
    // a gunmetal brow over the front of the mantle from T4
    if (t >= 4) P.box(cx - w(4) + U, q(8), cx + w(4) - U, q(8) + w(3), GUN);
    // the apex: the umbra runs the keel's whole length, and the tail
    // takes two vents
    if (t >= 5) {
      P.box(cx - U, q(14), cx + U, q(21), UMBRA);
      P.box(cx - U, q(24), cx + U, q(24) + w(4), UMBRA);
      bars(P, cx - w(3), cx + w(3), q(28), 2, U, U, BORE);
    }
  };
  const wing = (O: Pen): void => {
    const R = scaler(L.reach); const chord = L.y1 - L.y0;
    const edge = Math.max(4, Math.round(chord * 0.35));
    // the inner wing pale to the elbow and the outer black to the tip: a
    // wandering albatross whitens from the body outward as it ages, so
    // the pale root is the animal and not a highlight. NO TAPER — the
    // chord it leaves the shoulder with is the chord it ends on, which is
    // what makes the span read as a line rather than as a fin
    O.box(0, L.y0, R.q(14), L.y1, PLUME);
    O.box(R.q(12), L.y0, L.reach, L.y1, MANTLE);
    // the leading edge: black the whole span, over the pale root too
    O.box(0, L.y0, L.reach, L.y0 + edge, MANTLE);
    // THE UMBRA at the wing root from T3, and out along the hand on the
    // apex: the family's colour is the shadow's, and this is where it
    // shows on the bird
    if (t >= 3) O.box(R.q(4), L.y0 + edge, R.q(4) + R.w(5), L.y1, UMBRA);
    if (t >= 5) O.box(R.q(18), L.y0 + edge, R.q(18) + R.w(6), L.y1, UMBRA);
  };
  return flyer(T, L, body, wing, UMBRA);
}

/**
 * THE SHADOW, for the Gyre's sheet: the same drawing flattened to one
 * flat ink, which is what a shadow is. It is not a fourth material and
 * not a shade — a shadow has no lighting in it, which is exactly why it
 * reads as a hole in the ground rather than as a second bird.
 */
export function shadowOf(a: { n: number; px: (string | null)[] }, ink = "#16171e"): { n: number; px: (string | null)[] } {
  return { n: a.n, px: a.px.map((c) => (c === null ? null : ink)) };
}

/** every candidate, for the render script */
export const SKY_CONCEPTS = [
  { key: "skein", animal: "the goose", tiers: SKEIN_TIERS, art: skein },
  { key: "kettle", animal: "the vulture (SHIPPED — game/kettleArt.ts)", tiers: KETTLE_TIERS, art: kettle },
  { key: "gyre", animal: "the albatross", tiers: GYRE_TIERS, art: gyre },
] as const;

/** unused-export guard: the geometry a rig would need is derived here the
 *  same way the shipped flyers derive theirs, so a candidate that wins
 *  moves into familyArt.ts whole rather than being re-measured */
export const SKY_GEOM = { skein: skeinGeom, gyre: gyreGeom };
