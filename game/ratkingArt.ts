/**
 * THE RATKINGS, the rat king (levels.ts `ratking1`..`ratking5`): a knot of
 * rats tied together by the tails, which is a real thing rats do and the
 * whole of this family's gimmick — a knot that dies comes apart into the
 * rank below it (Sim.splitKnot), smaller and faster, down to the single
 * rat. Drawn from nothing, on cells of its own (atlas.ts RK_CELLS), so it
 * sits on the shelf with ANIMAL_ART off like the Tuskers.
 *
 * ONE RAT IS THE RUNT, AND EVERY TIER ABOVE IT IS MORE RATS. A rat from
 * above is a teardrop — a broad rump narrowing to a wedge of a head and a
 * snout, no ears (a pair on a head is eyes), and a long bare tail, which
 * is the tell. The knot tiers lay two, three, five and seven of the same
 * rat side by side facing the way they walk, with daylight between the
 * bodies, and their tails run back into one bare-skin KNOT at the rear,
 * on a gunmetal sled — the machine is what the knot is strapped to. The
 * mech rig at every tier: the legs stay tucked and the near-side feet
 * shuffle. See docs/unit-art.md section 1b for the grammar.
 */
import type { MechParts } from "./animalArt";
import { BORE, GUN, STEEL, draw, drawWithCell, rev, type Mat, type Pen } from "./turretArt";
import { scaler, type IronTier } from "./ironhideArt";
import { NAKED } from "./kettleArt";

export const FUR: Mat = ["#3b3633", "#6e6660"];
/** the knot of tails, and the family's accent (constants.ts PAL.knot): a
 *  bare flesh pink on a dark grey animal, on the tails and nowhere else */
export const KNOT: Mat = ["#9c5f66", "#e8b3b6"];
const FUR_R = rev(FUR);

/** hitboxes UR x 1 / 1.5 / 2.25 / 3.5 / 4.5 at 32 px a tile: a 32 runt,
 *  the one 1x1 on the roster that is a whole animal and not a big one */
export const RATKING_TIERS: readonly IronTier[] = [
  { t: 1, n: 32, stride: 3, small: 16, th: 4, sh: 4 },
  { t: 2, n: 48, stride: 3, small: 16, th: 4, sh: 4 },
  { t: 3, n: 72, stride: 4, small: 32, th: 4, sh: 4 },
  { t: 4, n: 112, stride: 5, small: 32, th: 4, sh: 4 },
  { t: 5, n: 144, stride: 6, small: 48, th: 4, sh: 4 },
];

/** where each rat of a knot stands on the 32 layout: its centre column
 *  off the midline (in units, signed) and its snout row, rear ranks first
 *  so the front rank lies over them the way a pile does, and the half
 *  width every rat of that tier is drawn at */
const KNOTS: readonly { rats: readonly (readonly [number, number])[]; rw: number }[] = [
  { rats: [[0, 1]], rw: 6 },
  { rats: [[-7, 2], [7, 2]], rw: 4.5 },
  { rats: [[-11, 5], [11, 5], [0, 0]], rw: 4.5 },
  { rats: [[-5, 8], [5, 8], [-11, 1], [11, 1]], rw: 4 },
  { rats: [[-12, 10], [12, 10], [-6.5, 6], [6.5, 6], [0, 0]], rw: 4 },
];
/** the row the tails knot at, on the 32 layout */
const KNOT_ROW = 25;

/** one rat, snout at row `oy` and centred on column `ox` of the grid: a
 *  wedge of a head lit in the reversed pair, the rump, and the tail
 *  straight back to row `tailTo`. `long` is the runt's own body; a rat
 *  in a knot is drawn shorter so the knot has room behind it */
function rat(P: Pen, T: IronTier, ox: number, oy: number, hw: number, tailTo: number, long: boolean): void {
  const { n } = T; const { q, w } = scaler(n); const U = w(2);
  const head = Math.max(U, Math.round(hw * 0.55));
  const rump0 = q(long ? 7 : 5), rump1 = q(long ? 23 : 19);
  // the head first: a wedge whose root the rump covers, so what stands
  // out of the front is the snout and nothing else
  P.octa(ox - head, oy, ox + head, oy + rump0 + U, Math.max(U, head - U), FUR_R);
  P.octa(ox - hw, oy + rump0, ox + hw, oy + rump1, w(3), FUR);
  const tw = ox === n / 2 ? U : w(1);
  P.box(ox - tw, oy + rump1 - U, ox + tw, tailTo, NAKED);
}

function body(P: Pen, T: IronTier): void {
  const { n, t } = T; const { q, w } = scaler(n); const c = n / 2; const U = w(2);
  const { rats, rw } = KNOTS[t - 1];
  const hw = w(rw);
  // the runt: one rat, its tail to the grid's rear edge, the tip bare pink
  if (t === 1) {
    rat(P, T, c, q(1), hw, n, true);
    P.box(c - U, n - q(4), c + U, n, KNOT);
    return;
  }
  // the knot: every tail runs into one mass of bare skin across the rear,
  // as wide as the outer rats' tails — the thing the family is named for,
  // and the accent. Only the left half and the midline are drawn
  const knotY = q(KNOT_ROW);
  const outer = Math.max(...rats.map(([dx]) => Math.abs(dx)));
  const knotHalf = q(outer) + w(1) + U;
  for (const [dx, dy] of rats) if (dx <= 0) rat(P, T, c + q(dx), q(dy), hw, knotY + U, false);
  P.octa(c - knotHalf, knotY, c + knotHalf, n - q(1), U, KNOT);
  // the sled: a gunmetal yoke down over the tails where they meet, steel
  // beside it from T4, and on the apex a bore down its middle — all of
  // it running DOWN the body, never across
  const yoke = w(t >= 4 ? 3 : 2);
  P.box(c - yoke, knotY - q(t >= 4 ? 5 : 3), c + yoke, knotY + 2 * U, GUN);
  if (t >= 4) P.box(c - yoke - U, knotY - q(2), c - yoke, knotY + 2 * U, STEEL);
  if (t >= 5) P.box(c - U, knotY - q(3), c + U, knotY + U, BORE);
}

/** the plate under the knot: the sled, gunmetal, a unit proud of the knot */
const base = (P: Pen, T: IronTier): void => {
  const { n, t } = T; const { q, w } = scaler(n); const U = w(2);
  const { rats } = KNOTS[t - 1];
  const outer = Math.max(...rats.map(([dx]) => Math.abs(dx)));
  const half = t === 1 ? w(4) : q(outer) + w(1) + 2 * U;
  P.octa(n / 2 - half, q(KNOT_ROW) - U, n / 2 + half, n, w(3), GUN);
};
/** the near-side feet of the outermost rat: two small pads at the body's
 *  right edge, the only thing the walk slides. Right side only — the
 *  renderer mirrors it — so not mirrored here */
const feet = (P: Pen, T: IronTier): void => {
  const { n, t } = T; const { q, w } = scaler(n);
  const { rats, rw } = KNOTS[t - 1];
  const [dx, dy] = rats.reduce((a, b) => (b[0] > a[0] ? b : a));
  const x1 = n / 2 + q(dx) + w(rw) + w(1);
  const rows = t === 1 ? [dy + 10, dy + 17] : [dy + 8, dy + 14];
  for (const y of rows) P.box(x1 - w(4), q(y), x1, q(y) + w(3), FUR);
};

export function ratkingMech(T: IronTier): MechParts {
  const { art, cell } = drawWithCell(T.n, (P) => body(P, T), KNOT);
  return {
    body: art,
    base: draw(T.n, (P) => base(P, T)),
    leg: draw(T.n, (P) => feet(P, T), false),
    cell,
    stride: T.stride,
  };
}
