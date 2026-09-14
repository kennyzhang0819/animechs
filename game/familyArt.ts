/**
 * THE OTHER FIVE FAMILIES ON THE TURRETS' GRAMMAR: the Starhart stag, the
 * Stoop bat, the Weaver spider, the Skate manta and the Livewire narwhal,
 * drawn the way the Ironhide rhino is (ironhideArt.ts, whose header is
 * the grammar in full): every material a dark/light PAIR split at the
 * midline and nothing else for lighting, a fold or a band in the reversed
 * pair, NOTHING NARROWER THAN FOUR PIXELS, no dither, and every body drawn
 * AT ITS HITBOX on the turrets' 32 px a tile — a starhart1 on a 32 grid
 * like a duo, a stoop5 on 232. No overshoot: the quad is the box.
 *
 * Every width here is built up from the scaler's units (w, never under
 * four) so that what is left beside a feature is a unit too: a seam ±U on
 * a saddle ±2U on a body ±3U leaves U of steel and U of hide either side,
 * whatever the grid. A sliver is what you get by placing two things by
 * eye on a 32 grid, and there is no eye here.
 *
 * The rigs are the ones the trial built (animalArt.ts header): the stag
 * on the mech rig to T3 and four planted legs from T4, the spider legged
 * at every tier, the bat, the manta and the narwhal on the wing rig — a
 * body column and one wing drawn about its root, mirrored to the other
 * side and folded by the renderer (pushWings). No eyes, and no round pair
 * anywhere: two discs side by side are eyes at every size.
 */
import type { LegParts, MechParts, StoopArt, StoopGeom } from "./animalArt";
import { BORE, GUN, STEEL, bars, draw, drawWithCell, rev, type Mat, type Pen } from "./turretArt";
import { scaler, segment, type IronTier } from "./ironhideArt";

const STEEL_R = rev(STEEL);

// ── shared: pens that move, and the wing rig's frame ───────────────────
/** the same pen, its origin moved */
const shift = (P: Pen, dx: number, dy: number): Pen => ({
  box: (x0, y0, x1, y1, m) => P.box(x0 + dx, y0 + dy, x1 + dx, y1 + dy, m),
  octa: (x0, y0, x1, y1, c, m) => P.octa(x0 + dx, y0 + dy, x1 + dx, y1 + dy, c, m),
  disc: (cx, cy, r, m) => P.disc(cx + dx, cy + dy, r, m),
  ring: (cx, cy, r, w, m) => P.ring(cx + dx, cy + dy, r, w, m),
  diamond: (cx, cy, r, m) => P.diamond(cx + dx, cy + dy, r, m),
});
/** a pen whose x runs OUTWARD from a root pixel: +x on the right side,
 *  -x on the left, so one wing drawing serves the composed sprite's left
 *  wing (mirrored to the right by finish) and the wing cell's right one */
const outward = (P: Pen, rootX: number, s: 1 | -1): Pen => {
  const X = (x: number): number => rootX + s * x;
  // a half-open [x0, x1) flips to [rootX - x1 + 1, rootX - x0 + 1)
  const lo = (x0: number, x1: number): number => (s > 0 ? X(x0) : X(x1) + 1);
  const hi = (x0: number, x1: number): number => (s > 0 ? X(x1) : X(x0) + 1);
  return {
    box: (x0, y0, x1, y1, m) => P.box(lo(x0, x1), y0, hi(x0, x1), y1, m),
    octa: (x0, y0, x1, y1, c, m) => P.octa(lo(x0, x1), y0, hi(x0, x1), y1, c, m),
    disc: (cx, cy, r, m) => P.disc(X(cx), cy, r, m),
    ring: (cx, cy, r, w, m) => P.ring(X(cx), cy, r, w, m),
    diamond: (cx, cy, r, m) => P.diamond(X(cx), cy, r, m),
  };
};

/** a wing-rig tier: the composed grid n (the hitbox), the body column's
 *  width bw and the wing cell's grid nw, both derived from the layout,
 *  and the beat (see FlyerParts) */
export interface FlyerTier {
  t: number;
  n: number;
  bw: number;
  nw: number;
  fold: number;
  sweep: number;
  rate: number;
}
/** where a wing sits on the composed grid: its root `rootX` out from the
 *  centre on row `rootY`, its extent rows y0..y1 and `reach` px outward */
interface Wing { rootX: number; rootY: number; y0: number; y1: number; reach: number }
type Base = Omit<FlyerTier, "bw" | "nw">;
/** the tier with its cells sized off the layout: the wing cell two px
 *  clear of the wing all round */
const withCells = (T: Base, L: Wing, bw: number): FlyerTier =>
  ({ ...T, bw, nw: Math.max(L.reach, L.y1 - L.y0) + 4 });
const margins = (T: FlyerTier, L: Wing): { m: number; my: number } =>
  ({ m: Math.floor((T.nw - L.reach) / 2), my: Math.floor((T.nw - (L.y1 - L.y0)) / 2) });
/** the three drawings the wing rig packs: the composed sprite (and its
 *  accent cell), the body alone on the same grid, the right wing alone on
 *  its cell with the root where flyerGeom says */
function flyer(T: FlyerTier, L: Wing, body: (P: Pen) => void, wing: (O: Pen) => void, accent: Mat): StoopArt {
  const { n, nw } = T; const c = n / 2;
  const full = drawWithCell(n, (P) => { wing(outward(P, c - 1 - L.rootX, -1)); body(P); }, accent);
  const { m, my } = margins(T, L);
  return {
    full: full.art,
    body: draw(n, body),
    wing: draw(nw, (P) => wing(outward(shift(P, 0, my - L.y0), m, 1)), false),
    cell: full.cell,
  };
}
/** pure numbers for FLYER_PARTS: the root off the body's centre (sideways,
 *  forward) and the wing cell's centre off its root */
function flyerGeom(T: FlyerTier, L: Wing): StoopGeom {
  const { n, nw } = T; const c = n / 2; const { m, my } = margins(T, L);
  return { rootX: L.rootX + 0.5, rootY: c - L.rootY, wingX: nw / 2 - m, wingY: -(nw / 2 - (my - L.y0 + L.rootY)) };
}

// ── STARHART ─────────────────────────────────────────────────────────────
//
// The stag: a slim back, a neck, a wedge of a head, and from T2 the
// antlers — a steel beam either side of the head joined to it by a bar,
// tines off the beam outward as the tiers climb, the emitter gold at the
// top of each beam. Steel down the spine with the gold seam on it, the
// gold alone on the runt. Mech rig to T3, four legs from T4.
export const HART: Mat = ["#5a3f2c", "#9a7350"];
export const STAR: Mat = ["#e0a830", "#ffe58a"];
const HART_R = rev(HART);
/** hitboxes UR x 1 / 1.375 / 1.625 / 3 / 3.625, at 32 px a tile */
export const HART_TIERS: readonly IronTier[] = [
  { t: 1, n: 32, stride: 4, small: 16, th: 4, sh: 4 },
  { t: 2, n: 44, stride: 5, small: 16, th: 4, sh: 4 },
  { t: 3, n: 52, stride: 6, small: 16, th: 4, sh: 4 },
  { t: 4, n: 96, stride: 0, small: 32, th: 8, sh: 6 },
  { t: 5, n: 116, stride: 0, small: 48, th: 10, sh: 8 },
];
function hartBody(P: Pen, T: IronTier): void {
  const { n, t } = T; const { q, w } = scaler(n); const c = n / 2; const U = w(2);
  // the back: a slim chamfered plate, the haunch fold in the reversed pair
  P.octa(q(7), q(12), n - q(7), n - q(1), w(4), HART);
  P.box(q(8), q(23), n - q(8), q(23) + w(3), HART_R);
  // the antlers from T2, under the head so it covers the join: the beam,
  // the bar to the head, the tines outward, the emitter at the top
  if (t >= 2) {
    const bx = q(3), top = q(1), beamW = w(4);
    P.box(bx, top, bx + beamW, q(t >= 5 ? 13 : 11), STEEL);
    P.box(bx, q(7), c - w(3), q(7) + beamW, STEEL);
    const tines = t >= 5 ? 3 : t >= 4 ? 2 : t >= 3 ? 1 : 0, tH = w(3), period = tH + w(1.5);
    for (let k = 0; k < tines; k++) P.box(bx - w(3), top + k * period, bx + beamW, top + k * period + tH, STEEL);
    P.box(bx, top, bx + beamW, top + w(3), STAR);
  }
  // the neck and the head, a wedge forward of the shoulders
  P.box(c - w(3), q(8), c + w(3), q(14), HART);
  P.octa(c - w(4), q(2), c + w(4), q(10), U, HART);
  // the saddle: steel down the spine from T2 with the gold seam on it, a
  // gunmetal collar at its front from T3; the runt wears the gold alone
  if (t >= 2) {
    P.box(c - 2 * U, q(13), c + 2 * U, n - q(3), STEEL);
    P.box(c - U, q(13) + U, c + U, n - q(3) - U, STAR);
    if (t >= 3) P.box(c - 2 * U, q(13), c + 2 * U, q(13) + U, GUN);
  } else P.box(c - U, q(14), c + U, q(27), STAR);
  // a gunmetal yoke over each shoulder from T4, out to the saddle's edge,
  // and vents down the saddle; a crest plate over the head at T5
  if (t >= 4) {
    P.octa(q(7), q(12), c - 2 * U, q(12) + w(6), U, GUN);
    bars(P, c - w(3), c + w(3), n - q(9), 2, U, U, BORE);
  }
  if (t >= 5) P.box(c - w(3), q(4), c + w(3), q(4) + w(3), GUN);
}
/** T1-T3 on the mech rig: body, base plate, and the near-side hooves */
export function hartMech(T: IronTier): MechParts {
  const { n } = T; const { q, w } = scaler(n);
  const { art, cell } = drawWithCell(n, (P) => hartBody(P, T), STAR);
  return {
    body: art,
    base: draw(n, (P) => P.octa(q(9), q(12), n - q(9), n - q(2), w(4), GUN)),
    // two hooves at the body's right edge, a unit of each past the back
    leg: draw(n, (P) => {
      for (const y of [q(13), q(23)]) {
        P.box(n - q(7) - w(2), y, n - q(7) + w(3), y + w(5), HART);
        P.box(n - q(7) - w(2), y + w(5) - w(2), n - q(7) + w(3), y + w(5), BORE);
      }
    }, false),
    cell,
    stride: T.stride,
  };
}
/** T4-T5 on the legged rig */
export function hartLegged(T: IronTier): LegParts {
  const { n, small, th } = T; const { q, w } = scaler(n); const sc = small / 2;
  const { art, cell } = drawWithCell(n, (P) => hartBody(P, T), STAR);
  return {
    body: art,
    base: draw(n, (P) => P.octa(q(10), q(13), n - q(10), n - q(3), w(4), GUN)),
    cell,
    foot: draw(small, (P) => { P.box(sc - w(2), sc - w(3), sc + w(2), sc + w(3), HART); P.box(sc - w(2), sc - w(3), sc + w(2), sc - w(3) + w(2), BORE); }, false),
    joint: draw(small, (P) => P.disc(sc, sc, Math.max(2, Math.round(th / 2)), HART), false),
    baseJoint: draw(small, (P) => P.disc(sc, sc, Math.max(3, Math.round(th * 0.75)), GUN), false),
    small,
    leg: segment(64, th, HART),
    legBase: segment(64, T.sh, HART),
  };
}

// ── WEAVER ───────────────────────────────────────────────────────────────
//
// The spider: an abdomen at the back under a steel plate with the acid
// seam down it, a smaller cephalothorax forward, the fangs a pair of
// steel bars ahead of that from T3, a gunmetal waist clamp and a
// spinneret block from T4, a plate over the head at T5. Steel legs at
// every tier, the runt's included.
export const SPIDER: Mat = ["#3a2a3a", "#6c4c6a"];
export const ACID: Mat = ["#6c9a18", "#d8ff40"];
/** hitboxes UR x 1 / 1.625 / 1.875 / 2.875 / 3.25; th is the leg stroke */
export const SPIDER_TIERS: readonly IronTier[] = [
  { t: 1, n: 32, stride: 0, small: 32, th: 4, sh: 4 },
  { t: 2, n: 52, stride: 0, small: 32, th: 5, sh: 5 },
  { t: 3, n: 60, stride: 0, small: 32, th: 6, sh: 6 },
  { t: 4, n: 92, stride: 0, small: 48, th: 9, sh: 9 },
  { t: 5, n: 104, stride: 0, small: 48, th: 12, sh: 12 },
];
function spiderBody(P: Pen, T: IronTier): void {
  const { n, t } = T; const { q, w } = scaler(n); const c = n / 2; const U = w(2);
  const A = t === 1 ? w(8) : w(9);
  // the fangs first, so the head covers their roots
  if (t >= 3) P.box(c - w(5), q(1), c - w(5) + w(3), q(6), STEEL);
  // the abdomen and the cephalothorax
  P.octa(c - A, q(13), c + A, n - q(1), w(4), SPIDER);
  P.octa(c - w(5), q(5), c + w(5), q(15), w(3), SPIDER);
  // the plate from T2, a unit in from the abdomen's edge; the seam a unit in from that
  if (t >= 2) P.octa(c - A + U, q(13) + U, c + A - U, n - q(1) - U, w(3), STEEL);
  const inset = t >= 2 ? 2 * U : U;
  P.box(c - U, q(13) + inset, c + U, n - q(1) - inset, ACID);
  // the waist clamp and the spinneret block from T4; the head plate at T5
  if (t >= 4) {
    P.box(c - w(6), q(12), c + w(6), q(12) + w(3), GUN);
    P.box(c - U, n - q(1) - U, c + U, n, GUN);
  }
  if (t >= 5) P.box(c - w(3), q(6), c + w(3), q(14), STEEL);
}
/** every tier on the legged rig: steel legs, a steel foot and knee, a
 *  shoulder cap of the spider's own hide */
export function spiderLegged(T: IronTier): LegParts {
  const { n, small, th } = T; const { q, w } = scaler(n); const sc = small / 2, cx = n / 2;
  const { art, cell } = drawWithCell(n, (P) => spiderBody(P, T), ACID);
  const half = Math.max(2, Math.round(th / 2));
  return {
    body: art,
    base: draw(n, (P) => P.octa(cx - w(6), q(8), cx + w(6), n - q(4), w(3), GUN)),
    cell,
    foot: draw(small, (P) => P.box(sc - half, sc - half - 2, sc + half, sc + half + 2, STEEL), false),
    joint: draw(small, (P) => P.disc(sc, sc, half, STEEL), false),
    baseJoint: draw(small, (P) => P.disc(sc, sc, Math.max(3, Math.round(th * 0.75)), SPIDER), false),
    small,
    leg: segment(64, th, STEEL),
    legBase: segment(64, T.sh, STEEL),
  };
}

// ── STOOP ────────────────────────────────────────────────────────────────
//
// The bat: a long fur body with a wider head, the charge a magenta block
// on the belly (the whole belly on the two small tiers), a steel harness
// under it from T2, stacks at the tail from T3, a gunmetal cap on the head
// from T4. The wing is a membrane slab with the arm out along its span
// and fingers trailing back, fur-boned to T2 and steel from T3, with a
// magenta cell on each wing from T4.
export const FUR: Mat = ["#352a3e", "#6b5a7c"];
export const MEMB: Mat = ["#6b1f63", "#b9469f"];
export const MAG: Mat = ["#a02890", "#ff6ad8"];
const FUR_R = rev(FUR);
/** hitboxes UR x 1.125 / 1.375 / 2.5 / 5.75 / 7.25 */
const STOOP_BASE: readonly Base[] = [
  { t: 1, n: 36, fold: 0.32, sweep: 0.16, rate: 5 },
  { t: 2, n: 44, fold: 0.32, sweep: 0.15, rate: 4 },
  { t: 3, n: 80, fold: 0.3, sweep: 0.13, rate: 3 },
  { t: 4, n: 184, fold: 0.28, sweep: 0.11, rate: 2 },
  { t: 5, n: 232, fold: 0.25, sweep: 0.09, rate: 1.4 },
];
/** the body's half width: a unit on the small tiers, three from T3 so a
 *  harness and a charge fit inside it a unit apart */
const stoopHalf = (T: Base): number => { const { w } = scaler(T.n); return T.t >= 3 ? 3 * w(2) : w(2); };
const stoopHead = (T: Base): number => { const { w } = scaler(T.n); return T.t >= 3 ? stoopHalf(T) : 2 * w(2); };
const stoopWing = (T: Base): Wing => {
  const { n } = T; const { q } = scaler(n); const B = stoopHalf(T);
  return { rootX: B, rootY: q(9), y0: q(5), y1: q(25), reach: n - q(1) - (n / 2 + B) };
};
export const STOOP_TIERS: readonly FlyerTier[] = STOOP_BASE.map((T) => withCells(T, stoopWing(T), 2 * stoopHead(T) + 2));
export function stoopGeom(T: FlyerTier): StoopGeom { return flyerGeom(T, stoopWing(T)); }
export function stoop(T: FlyerTier): StoopArt {
  const { n, t } = T; const { q, w } = scaler(n); const cx = n / 2; const U = w(2);
  const B = stoopHalf(T), H = stoopHead(T), L = stoopWing(T);
  const body = (P: Pen): void => {
    P.octa(cx - B, q(8), cx + B, q(27), U, FUR);
    P.octa(cx - H, q(2), cx + H, q(10), U, FUR);
    if (t >= 2) P.box(cx - (t >= 3 ? 2 * U : U), q(10), cx + (t >= 3 ? 2 * U : U), q(24), STEEL);
    P.box(cx - U, q(14), cx + U, q(14) + w(5), MAG);
    if (t >= 3) P.box(cx - B, q(25), cx - B + U, q(30), GUN);
    if (t >= 4) P.box(cx - H + U, q(3), cx + H - U, q(3) + w(3), GUN);
  };
  const wing = (O: Pen): void => {
    const R = scaler(L.reach); const bone = t >= 3 ? STEEL : FUR_R; const ya = L.rootY;
    O.octa(0, L.y0, L.reach, L.y1, R.w(8), MEMB);
    O.box(0, ya, R.q(29), ya + w(3), bone);
    O.box(R.q(8), ya, R.q(8) + R.w(5), L.y1 - w(4), bone);
    if (t >= 3) O.box(R.q(24), ya, R.q(24) + R.w(5), L.y1 - w(8), bone);
    if (t >= 4) O.box(R.q(15), ya + w(4), R.q(15) + R.w(5), ya + 2 * w(4), MAG);
  };
  return flyer(T, L, body, wing, MAG);
}

// ── SKATE ────────────────────────────────────────────────────────────────
//
// The manta: a long plate of a body with the cephalic fins as one steel
// cowl forward of it, the harpoon tail steel with its barb the family's
// teal, the teal seam down the spine from T2, a gunmetal transom at the
// hips from T4. Broad wings with a fold along the leading edge in the
// reversed pair, steel from T4, a teal cell at the tip at T5.
export const SKIN: Mat = ["#28404c", "#5a8090"];
export const TEAL: Mat = ["#149a86", "#5cffe4"];
const SKIN_R = rev(SKIN);
/** hitboxes UR x 1.25 / 1.625 / 2.5 / 4.875 / 7.25 */
const MANTA_BASE: readonly Base[] = [
  { t: 1, n: 40, fold: 0.22, sweep: 0.08, rate: 0.9 },
  { t: 2, n: 52, fold: 0.22, sweep: 0.08, rate: 0.8 },
  { t: 3, n: 80, fold: 0.2, sweep: 0.07, rate: 0.65 },
  { t: 4, n: 156, fold: 0.18, sweep: 0.06, rate: 0.5 },
  { t: 5, n: 232, fold: 0.16, sweep: 0.05, rate: 0.4 },
];
const mantaHalf = (T: Base): number => 2 * scaler(T.n).w(2);
const mantaWing = (T: Base): Wing => {
  const { n } = T; const { q } = scaler(n); const B = mantaHalf(T);
  return { rootX: B, rootY: q(11), y0: q(7), y1: q(25), reach: n - q(1) - (n / 2 + B) };
};
export const MANTA_TIERS: readonly FlyerTier[] = MANTA_BASE.map((T) => withCells(T, mantaWing(T), 2 * mantaHalf(T) + 2));
export function mantaGeom(T: FlyerTier): StoopGeom { return flyerGeom(T, mantaWing(T)); }
export function manta(T: FlyerTier): StoopArt {
  const { n, t } = T; const { q, w } = scaler(n); const cx = n / 2; const U = w(2);
  const B = mantaHalf(T), L = mantaWing(T);
  const body = (P: Pen): void => {
    P.octa(cx - B, q(4), cx + B, q(27), w(4), SKIN);
    P.box(cx - B + U, q(1), cx + B - U, q(1) + w(4), STEEL);
    if (t >= 2) P.box(cx - U, q(9), cx + U, q(23), TEAL);
    if (t >= 4) P.box(cx - B, q(24), cx + B, q(24) + w(3), GUN);
    // the harpoon last, over the transom: the shaft and the barb
    P.box(cx - U, q(26), cx + U, n, STEEL);
    const barb = t >= 3 ? w(3) : U;
    P.box(cx - barb, n - w(4), cx + barb, n, TEAL);
  };
  const wing = (O: Pen): void => {
    const R = scaler(L.reach);
    O.octa(0, L.y0, L.reach, L.y1, R.w(7), t >= 4 ? STEEL : SKIN_R);
    O.octa(0, L.y0 + w(5), L.reach, L.y1, R.w(7), SKIN);
    if (t >= 5) O.box(R.q(18), q(14), R.q(18) + R.w(6), q(14) + w(4), TEAL);
  };
  return flyer(T, L, body, wing, TEAL);
}

// ── LIVEWIRE ─────────────────────────────────────────────────────────────
//
// The narwhal: a melon rounding into the shoulders, a body narrowing to a
// peduncle and a fluke in the reversed pair, the tusk a steel spike off
// the melon with the violet electrode at its tip and ridges across it
// from T3 (violet themselves at T5). Steel saddle and violet seam from
// T2, a collar from T3, a stack at the peduncle from T4, steel on the
// fluke's edge at T5. Small flippers on the wing rig, a shallow beat.
export const NARW: Mat = ["#5b6577", "#aab6c6"];
export const VOLT: Mat = ["#6a3fd0", "#c0a0ff"];
const NARW_R = rev(NARW);
/** hitboxes UR x 1.375 / 1.75 / 2.5 / 5.5 / 7.25 */
const NARWHAL_BASE: readonly Base[] = [
  { t: 1, n: 44, fold: 0.14, sweep: 0.07, rate: 0.7 },
  { t: 2, n: 56, fold: 0.14, sweep: 0.07, rate: 0.6 },
  { t: 3, n: 80, fold: 0.13, sweep: 0.06, rate: 0.5 },
  { t: 4, n: 176, fold: 0.12, sweep: 0.05, rate: 0.4 },
  { t: 5, n: 232, fold: 0.11, sweep: 0.05, rate: 0.35 },
];
const narwhalHalf = (T: Base): number => 3 * scaler(T.n).w(2);
const narwhalWing = (T: Base): Wing => {
  const { q, w } = scaler(T.n); const B = narwhalHalf(T);
  return { rootX: B, rootY: q(16), y0: q(16), y1: q(16) + w(7), reach: w(6) };
};
export const NARWHAL_TIERS: readonly FlyerTier[] = NARWHAL_BASE.map((T) => withCells(T, narwhalWing(T), 2 * (narwhalHalf(T) + scaler(T.n).w(3)) + 2));
export function narwhalGeom(T: FlyerTier): StoopGeom { return flyerGeom(T, narwhalWing(T)); }
export function narwhal(T: FlyerTier): StoopArt {
  const { n, t } = T; const { q, w } = scaler(n); const cx = n / 2; const U = w(2);
  const B = narwhalHalf(T), F = B + w(3), L = narwhalWing(T);
  const body = (P: Pen): void => {
    // the fluke first, under the peduncle
    if (t >= 5) P.octa(cx - F, n - q(6), cx + F, n, w(3), STEEL);
    const e = t >= 5 ? w(1.5) : 0;
    P.octa(cx - F + e, n - q(6) + e, cx + F - e, n - e, w(3), NARW_R);
    // the body and the peduncle
    P.octa(cx - B, q(8), cx + B, n - q(8), w(5), NARW);
    P.box(cx - B + w(3), n - q(9), cx + B - w(3), n - q(4), NARW);
    // the tusk, its electrode, its ridges
    P.box(cx - U, 0, cx + U, q(10), STEEL);
    P.box(cx - U, 0, cx + U, w(3), VOLT);
    if (t >= 3) for (let y = w(3) + U; y + U <= q(9); y += 2 * U) P.box(cx - U, y, cx + U, y + U, t >= 5 ? VOLT : STEEL_R);
    // the machine: saddle and seam, collar, the stack
    if (t >= 2) { P.box(cx - 2 * U, q(14), cx + 2 * U, n - q(9), STEEL); P.box(cx - U, q(14) + U, cx + U, n - q(9) - U, VOLT); }
    if (t >= 3) P.box(cx - B + U, q(12), cx + B - U, q(12) + w(3), STEEL);
    if (t >= 4) { P.box(cx - U, n - q(9), cx + U, n - q(5), GUN); P.box(cx - U, n - q(9), cx + U, n - q(9) + U, VOLT); }
  };
  const wing = (O: Pen): void => {
    O.octa(0, L.y0, L.reach, L.y1, U, t >= 4 ? STEEL : NARW_R);
    O.octa(0, L.y0 + w(3), L.reach, L.y1, U, NARW);
  };
  return flyer(T, L, body, wing, VOLT);
}
