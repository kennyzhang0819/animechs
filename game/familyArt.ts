/**
 * THE OTHER FIVE FAMILIES ON THE TURRETS' GRAMMAR: the Starhart stag, the
 * Stoop bat, the Dartback poison frog, the Skate manta and the Livewire narwhal,
 * drawn the way the Ironhide rhino is (ironhideArt.ts, whose header is
 * the grammar in full): every material a dark/light PAIR split at the
 * midline and nothing else for lighting, a fold or a band in the reversed
 * pair, NOTHING NARROWER THAN FOUR PIXELS, no dither, and every body drawn
 * AT ITS HITBOX on the turrets' 32 px a tile — a dartback1 on a 32 grid
 * like a tacker, a stoop5 on 232. No overshoot: the quad is the box, and
 * an animal that reads too small is a BOX to raise (see HART_TIERS,
 * where the stag's went up a quarter) and never a drawing to spill.
 *
 * Every width here is built up from the scaler's units (w, never under
 * four) so that what is left beside a feature is a unit too: a seam ±U on
 * a saddle ±2U on a body ±3U leaves U of steel and U of hide either side,
 * whatever the grid. A sliver is what you get by placing two things by
 * eye on a 32 grid, and there is no eye here.
 *
 * The rigs are the ones the trial built (animalArt.ts header): the stag
 * on the mech rig to T3 and four planted legs from T4, the frog on the
 * mech rig as a runt and four legs from T2, the bat, the manta and the
 * narwhal on the wing rig — a
 * body column and one wing drawn about its root, mirrored to the other
 * side and folded by the renderer (pushWings). No eyes, and no round pair
 * anywhere: two discs side by side are eyes at every size.
 */
import type { LegParts, MechParts, StoopArt, StoopGeom } from "./animalArt";
import { BORE, GUN, STEEL, bars, draw, drawWithCell, rev, type Mat, type Pen } from "./turretArt";
import { BONE, scaler, segment, type IronTier } from "./ironhideArt";

const BONE_R = rev(BONE);

// ── shared: pens that move, and the wing rig's frame ───────────────────
//
// The frame below (Wing, Base, withCells, flyer, flyerGeom and the two
// pens) is EXPORTED, because the bat, the manta and the narwhal are no
// longer the only things on the wing rig: the boss rides it too (the
// Sovereign, game/kingArt.ts). It is the rig's frame and not any family's,
// so a new flyer needs a drawing and nothing else.
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
export interface Wing { rootX: number; rootY: number; y0: number; y1: number; reach: number }
export type Base = Omit<FlyerTier, "bw" | "nw">;
/** the tier with its cells sized off the layout: the wing cell two px
 *  clear of the wing all round */
export const withCells = (T: Base, L: Wing, bw: number): FlyerTier =>
  ({ ...T, bw, nw: Math.max(L.reach, L.y1 - L.y0) + 4 });
const margins = (T: FlyerTier, L: Wing): { m: number; my: number } =>
  ({ m: Math.floor((T.nw - L.reach) / 2), my: Math.floor((T.nw - (L.y1 - L.y0)) / 2) });
/** the three drawings the wing rig packs: the composed sprite (and its
 *  accent cell), the body alone on the same grid, the right wing alone on
 *  its cell with the root where flyerGeom says */
export function flyer(T: FlyerTier, L: Wing, body: (P: Pen) => void, wing: (O: Pen) => void, accent: Mat): StoopArt {
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
export function flyerGeom(T: FlyerTier, L: Wing): StoopGeom {
  const { n, nw } = T; const c = n / 2; const { m, my } = margins(T, L);
  return { rootX: L.rootX + 0.5, rootY: c - L.rootY, wingX: nw / 2 - m, wingY: -(nw / 2 - (my - L.y0 + L.rootY)) };
}

// ── STARHART ─────────────────────────────────────────────────────────────
//
// The stag: a slim back (20/32 of the grid, against the rhino's 26 and
// the elephant's full width — it is the narrowest animal here, and the
// reason its box had to grow; see HART_TIERS), a neck, a wedge of
// a head, and from T2 the
// antlers — a BONE beam either side of the head joined to it by a bar,
// tines off the beam outward as the tiers climb, the emitter gold at the
// top of each beam. A gunmetal plate down the spine with the gold seam on
// it and a steel rim at its front from T3, the gold alone on the runt. At T5 the gold leaves the antlers: a panel down
// each shoulder yoke and a blaze in the crest plate, which is the apex's
// own tell. Mech rig to T3, four legs from T4.
export const HART: Mat = ["#5a3f2c", "#9a7350"];
export const STAR: Mat = ["#e0a830", "#ffe58a"];
const HART_R = rev(HART);
/**
 *  THE WHOLE ANIMAL GREW A QUARTER — box and drawing together, which is
 *  the only way it can grow while the grid IS the hitbox (the header).
 *  The deer was the roster's slimmest silhouette laid on the roster's
 *  narrowest box: a back 20/32 of its grid where the rhino's is 26 and
 *  the elephant's fills it, so a starhart1 beside a tusker1 read as a
 *  seed beside a boulder. The answer is not to draw past the box, it is
 *  a bigger deer.
 *
 *  So the boxes went up a quarter (public/balance.json, and the authored
 *  radii in levels.ts with them) AND KEPT THEIR SHAPE — the long
 *  rectangle a stag ought to have, 25x18.75 up to 90x60, the same
 *  long-to-wide the tier had before. The grids follow: hitboxes
 *  UR x 1.25 / 1.75 / 2 / 3.75 / 4.5, which is 40/56/64/120/144 px at 32
 *  a tile, even so the mirror has a centre column to fold on.
 *
 *  THE ELEPHANT IS STILL THE BIGGER ANIMAL at every tier and by a clear
 *  margin — 70x75 px of the stag's ink against the tusker4's 85x80,
 *  84x90 against the tusker5's 110x102, and the width in those is a rack
 *  of antlers rather than mass — which is the one proportion this family
 *  is sized against.
 *
 *  `stride` (the mech rig's hoof swing) and the legged tiers' feet
 *  (levels.ts starhart4/starhart5, `length` and `baseOffset`) are up the
 *  same quarter, so the stance against the body is exactly what it was.
 *
 *  A DEER'S LEG TAPERS: the thigh is meat and the cannon bone under the
 *  hock is a stick, so `th` (mount to knee) is near twice `sh` (knee to
 *  hoof) on the two legged tiers. Two segments of the same middling width
 *  is a crab's limb, and a crab's limb on a ring of four mounts is what
 *  reads as a spider however the thing walks */
export const HART_TIERS: readonly IronTier[] = [
  { t: 1, n: 40, stride: 5, small: 16, th: 4, sh: 4 },
  { t: 2, n: 56, stride: 6, small: 16, th: 4, sh: 4 },
  { t: 3, n: 64, stride: 7, small: 16, th: 4, sh: 4 },
  { t: 4, n: 120, stride: 0, small: 40, th: 12, sh: 6 },
  { t: 5, n: 144, stride: 0, small: 60, th: 16, sh: 7 },
];
function hartBody(P: Pen, T: IronTier): void {
  const { n, t } = T; const { q, w } = scaler(n); const c = n / 2; const U = w(2);
  // the back: a chamfered plate, the haunch fold in the reversed pair
  P.octa(q(6), q(12), n - q(6), n - q(1), w(4), HART);
  P.box(q(7), q(23), n - q(7), q(23) + w(3), HART_R);
  // the antlers from T2, under the head so it covers the join: the beam,
  // the bar to the head, the tines outward, the emitter at the top
  if (t >= 2) {
    const bx = q(3), top = q(1), beamW = w(4);
    P.box(bx, top, bx + beamW, q(t >= 5 ? 13 : 11), BONE);
    P.box(bx, q(7), c - w(3), q(7) + beamW, BONE);
    const tines = t >= 5 ? 3 : t >= 4 ? 2 : t >= 3 ? 1 : 0, tH = w(3), period = tH + w(1.5);
    for (let k = 0; k < tines; k++) P.box(bx - w(3), top + k * period, bx + beamW, top + k * period + tH, BONE);
    P.box(bx, top, bx + beamW, top + w(3), STAR);
  }
  // a gunmetal yoke over each shoulder from T4, from beside the neck out
  // to the back's edge and in to the saddle: it is also where the legged
  // rig's shoulder caps sit (levels.ts starhart4, mounts 5 MU out at 45
  // degrees), so the caps come up under a plate, not beside a bare neck
  if (t >= 4) P.octa(q(5), q(9), c - 2 * U, q(12) + w(6), U, GUN);
  // the apex gilds them: a gold panel down each yoke, a unit in from its
  // edges so it lies in the flat and never crosses a chamfer. Gold on the
  // shoulders and gold on the brow is what this champion has that the T4
  // has not — the emitters are no longer only at the antlers' tips
  if (t >= 5) P.box(q(5) + U, q(9) + U, c - 3 * U, q(9) + U + w(6), STAR);
  // the neck and the head, a wedge forward of the shoulders
  P.box(c - w(3), q(8), c + w(3), q(14), HART);
  P.octa(c - w(4), q(2), c + w(4), q(10), U, HART);
  // the saddle: a gunmetal plate down the spine from T2 with the gold seam
  // on it and a steel rim at its front from T3; the runt wears the gold
  // alone. The plate is gunmetal and not steel because a white plate the
  // length of a brown deer's back is the machine wearing the animal
  if (t >= 2) {
    P.box(c - 2 * U, q(13), c + 2 * U, n - q(3), GUN);
    P.box(c - U, q(13) + U, c + U, n - q(3) - U, STAR);
    if (t >= 3) P.box(c - 2 * U, q(13), c + 2 * U, q(13) + U, STEEL);
  } else P.box(c - U, q(14), c + U, q(27), STAR);
  // vents down the saddle from T4; a crest plate over the head at T5 with
  // the gold burning in the middle of it, a unit of gunmetal either side
  if (t >= 4) bars(P, c - w(3), c + w(3), n - q(9), 2, U, U, BORE);
  if (t >= 5) {
    P.box(c - w(3), q(4), c + w(3), q(4) + w(3), GUN);
    P.box(c - w(2), q(4), c + w(2), q(4) + w(3), STAR);
  }
}
/** T1-T3 on the mech rig: body, base plate, and the near-side hooves */
export function hartMech(T: IronTier): MechParts {
  const { n } = T; const { q, w } = scaler(n);
  const { art, cell } = drawWithCell(n, (P) => hartBody(P, T), STAR);
  return {
    body: art,
    base: draw(n, (P) => P.octa(q(8), q(12), n - q(8), n - q(2), w(4), GUN)),
    // two hooves at the body's right edge, a unit of each past the back
    leg: draw(n, (P) => {
      for (const y of [q(13), q(23)]) {
        P.box(n - q(6) - w(2), y, n - q(6) + w(3), y + w(5), HART);
        P.box(n - q(6) - w(2), y + w(5) - w(2), n - q(6) + w(3), y + w(5), BORE);
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
    base: draw(n, (P) => P.octa(q(9), q(13), n - q(9), n - q(3), w(4), GUN)),
    cell,
    foot: draw(small, (P) => { P.box(sc - w(2), sc - w(3), sc + w(2), sc + w(3), HART); P.box(sc - w(2), sc - w(3), sc + w(2), sc - w(3) + w(2), BORE); }, false),
    joint: draw(small, (P) => P.disc(sc, sc, Math.max(2, Math.round(th / 2)), HART), false),
    baseJoint: draw(small, (P) => P.disc(sc, sc, Math.max(3, Math.round(th * 0.75)), GUN), false),
    small,
    leg: segment(64, th, HART),
    legBase: segment(64, T.sh, HART),
  };
}

// ── DARTBACK ─────────────────────────────────────────────────────────────
//
// The poison frog (the Dartbacks): the silhouette is the whole animal,
// and A FROG SEEN FROM ABOVE IS WIDE — a broad mass of folded thigh at
// the back, a body barely narrower, and a head nearly as wide again
// tapering to a blunt snout. Two acid dots sit out on the back, one a
// side, the way a dart frog is spotted — bars on the apex. The machine is the venom: a steel
// tank down the spine from T2, the spitter a steel tube from the tank
// forward over the head to the snout from T3, a gunmetal collar at the
// shoulders and a stack behind the tank from T4, a brow plate at T5 with
// THE DOTS DRAWN OUT INTO BARS and the stack banded at both
// ends: the apex is the loudest one, which on a dart frog is the point.
// Acid toes. The runt sits on the mech rig with its feet tucked; T2 up
// ride the legged rig on FOUR legs, a frog's.
//
// THE OUTLINE IS IN q(), NOT IN MULTIPLES OF w(2). A body laid out in
// units of the scaler's w() stops growing the moment w's four-pixel
// floor bites: 3 * w(2) is 12 px on the 32 grid AND on the 52 and the
// 60, so every tier above the runt used to come out a narrow trunk
// rattling around inside a big box with four long thin legs reaching out
// of it. That is a spider, which is the one thing this family exists to
// not be. The silhouette scales with the grid now — the thighs are 26/32
// of it at every tier, the rhino's own proportion — and only the
// machine's bands are still built from w(), which is what that floor is
// for.
//
// AND THE LEGS ARE SHORT AND THICK. The stroke is a fifth of the body's
// grid, near twice what the rhino and the elephant take, and the foot
// reaches about one body-width out (`baseOffset` + `length` * `lengthScl`
// in game/levels.ts: ~1.75 radii, against the 2.85 it used to be), with
// `lengthScl` low enough that the knee stands well clear of the flank.
// Thin limbs on long mounts read as a spider however few of them there
// are; a frog's limb is as thick as a third of its own body and folds up
// beside it.
export const FROG: Mat = ["#1c2430", "#3c5068"];
export const ACID: Mat = ["#6c9a18", "#d8ff40"];
/** hitboxes UR x 1 / 1.625 / 1.875 / 2.875 / 3.25; th and sh the leg
 *  strokes, a fifth of the grid (the rhino's are a ninth) */
export const FROG_TIERS: readonly IronTier[] = [
  { t: 1, n: 32, stride: 5, small: 16, th: 4, sh: 4 },
  { t: 2, n: 52, stride: 0, small: 32, th: 10, sh: 8 },
  { t: 3, n: 60, stride: 0, small: 32, th: 12, sh: 9 },
  { t: 4, n: 92, stride: 0, small: 48, th: 18, sh: 14 },
  { t: 5, n: 104, stride: 0, small: 48, th: 21, sh: 16 },
];
function frogBody(P: Pen, T: IronTier): void {
  const { n, t } = T; const { q, w } = scaler(n); const c = n / 2; const U = w(2);
  // half the hide left between the two dots: what the tank, the collar
  // and the stack are all sized off, so nothing down the spine ever
  // crowds a dot whatever the grid rounds to
  const spine = q(8) - w(3);
  // Four overlapping octagons — a blunt snout, a jaw that widens fast,
  // a trunk, and the folded thighs, which are the widest thing on the
  // animal. Each reaches far enough into the next that no pair of
  // chamfers ever meets: two chamfers facing each other pinch a waist
  // into the outline, and a waist on a top-down body is a thorax.
  P.octa(c - q(13), q(11), c + q(13), n - q(1), w(6), FROG);   // the thighs, at the back
  P.octa(c - q(12), q(7), c + q(12), q(21), w(4), FROG);       // the trunk
  P.octa(c - q(11), q(4), c + q(11), q(14), w(4), FROG);       // the jaw
  P.octa(c - q(5), q(1), c + q(5), q(9), w(2), FROG);          // the snout, blunt
  // THE TWO MARKS, one a side and the mirror does the right: a dart
  // frog's back is SPOTTED, so up to T4 each side wears a single square
  // acid dot out on the flank over the thighs, mid-back. It is a box
  // like everything else here — the body's grammar is straight edges
  // and it holds for the marking too — sized off q() so it grows with
  // the grid rather than off w(), whose four-pixel floor would leave the
  // apex wearing the runt's spot. It sits far enough inboard that it can
  // never run off the outline at its widest row
  const dot = Math.max(w(2), q(2.5));
  if (t < 5) P.box(c - q(8) - dot, q(17) - dot, c - q(8) + dot, q(17) + dot, ACID);
  // THE APEX WEARS A BAR INSTEAD OF THE DOT, one a side, on the dot's
  // own centre row and only half again as long as it — the loudest body
  // in the family wears a STRETCHED SPOT, not a stripe down the back: a
  // mark that ran the length of the flank stopped reading as a marking
  // and started reading as trim. It keeps the narrow width too, because
  // a mark as wide as it is long is a slab, and a slab on the flank is
  // plate rather than skin
  if (t >= 5) {
    const bw = Math.max(w(1), q(1.5)); const bl = Math.round(dot * 1.7);
    P.box(c - q(8) - bw, q(17) - bl, c - q(8) + bw, q(17) + bl, ACID);
  }
  // the tank down the spine from T2, between the dots and wider than
  // the tube it feeds, so the two read as plumbing and not as one bar.
  // Gunmetal under a steel tube: the bright metal on this body is the
  // barrel alone, and the vessel behind it is plate. It starts on the row
  // the tube ENDS on, never under it — a vessel a pixel wider than the
  // tube lying over it is two slivers of grey, which is the one thing
  // this grammar does not allow
  if (t >= 2) P.box(c - (spine - U), q(14), c + (spine - U), n - q(9), GUN);
  // the brow plate at T5: gunmetal, not steel, so the spitter reads as a
  // tube lying OVER it rather than melting into one steel T
  if (t >= 5) P.box(c - q(5), q(6), c + q(5), q(6) + w(3), GUN);
  // the spitter from T3: the steel tube off the tank, forward over the
  // head to the snout, its bore at the tip
  if (t >= 3) { P.box(c - U, q(3), c + U, q(14), STEEL); P.box(c - U, q(3), c + U, q(3) + U, BORE); }
  // the collar at the shoulders and the stack behind the tank from T4, an
  // acid heat band on it. The collar runs from one dot's line to the other and
  // stops there: a band that crosses the WHOLE body is a horizontal cut,
  // and a horizontal cut on a symmetrical body is a face
  if (t >= 4) {
    P.box(c - spine, q(12), c + spine, q(12) + w(3), GUN);
    P.box(c - U, n - q(9), c + U, n - q(3), GUN);
    P.box(c - U, n - q(9), c + U, n - q(9) + U, ACID);
    // the apex's stack is banded at both ends, the rhino's tell
    if (t >= 5) P.box(c - U, n - q(3) - U, c + U, n - q(3), ACID);
  }
}
/** the runt on the mech rig: body, base plate, and the near-side feet —
 *  broad pads at the flank with the acid across their toes, tucked up
 *  against the body the way a sitting frog's are */
export function frogMech(T: IronTier): MechParts {
  const { n } = T; const { q, w } = scaler(n);
  const { art, cell } = drawWithCell(n, (P) => frogBody(P, T), ACID);
  return {
    body: art,
    base: draw(n, (P) => P.octa(q(6), q(10), n - q(6), n - q(3), w(4), GUN)),
    leg: draw(n, (P) => {
      for (const y of [q(7), q(19)]) {
        P.box(n - q(7), y, n - q(1), y + w(8), FROG);
        P.box(n - q(7), y, n - q(1), y + w(3), ACID);
      }
    }, false),
    cell,
    stride: T.stride,
  };
}
/** T2-T5 on the legged rig: four thick legs of hide, and a foot that is
 *  a broad pad WIDER THAN THE LEG IT HANGS OFF — a frog's splayed toes —
 *  with the acid across its front */
export function frogLegged(T: IronTier): LegParts {
  const { n, small, th } = T; const { q, w } = scaler(n); const c = n / 2; const sc = small / 2;
  const { art, cell } = drawWithCell(n, (P) => frogBody(P, T), ACID);
  return {
    body: art,
    base: draw(n, (P) => P.octa(c - q(10), q(10), c + q(10), n - q(2), w(5), GUN)),
    cell,
    foot: draw(small, (P) => {
      P.box(sc - w(5), sc - w(3), sc + w(5), sc + w(3), FROG);
      P.box(sc - w(5), sc - w(3), sc + w(5), sc - w(3) + w(2), ACID);
    }, false),
    joint: draw(small, (P) => P.disc(sc, sc, Math.max(2, Math.round(th / 2)), FROG), false),
    baseJoint: draw(small, (P) => P.disc(sc, sc, Math.max(3, Math.round(th * 0.75)), GUN), false),
    small,
    leg: segment(64, th, FROG),
    legBase: segment(64, T.sh, FROG),
  };
}

// ── STOOP ────────────────────────────────────────────────────────────────
//
// The bat: a long body of BROWN FUR with a wider head and darker brown
// membranes, because that is what a bat is. The pair this line used to
// wear — a violet body under magenta wings — made a very large moth: the
// magenta is the family's hue (PAL.bomber) and it belongs on the charge
// and nowhere else, which is the whole of what an accent is for.
//
// So: the charge a magenta block on the belly (the whole belly on the two
// small tiers), a gunmetal harness under it from T2, stacks at the tail
// from T3, a gunmetal cap on the head from T4. The wing is a membrane
// slab with the arm out along its span and fingers trailing back, all
// three of them FUR-boned at every tier — a finger is a finger and not a
// strut — with a magenta cell on each wing from T4, and at T5 a SECOND
// cell down the same finger and the magenta at the front of each tail
// stack.
export const FUR: Mat = ["#4a3526", "#8b6845"];
export const MEMB: Mat = ["#332621", "#63483a"];
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
    if (t >= 2) P.box(cx - (t >= 3 ? 2 * U : U), q(10), cx + (t >= 3 ? 2 * U : U), q(24), GUN);
    P.box(cx - U, q(14), cx + U, q(14) + w(5), MAG);
    if (t >= 3) P.box(cx - B, q(25), cx - B + U, q(30), GUN);
    if (t >= 4) P.box(cx - H + U, q(3), cx + H - U, q(3) + w(3), GUN);
    // the apex's stacks run hot: the magenta takes the front of each one
    if (t >= 5) P.box(cx - B, q(25), cx - B + U, q(25) + w(3), MAG);
  };
  const wing = (O: Pen): void => {
    const R = scaler(L.reach); const bone = FUR_R; const ya = L.rootY;
    O.octa(0, L.y0, L.reach, L.y1, R.w(8), MEMB);
    O.box(0, ya, R.q(29), ya + w(3), bone);
    O.box(R.q(8), ya, R.q(8) + R.w(5), L.y1 - w(4), bone);
    if (t >= 3) O.box(R.q(24), ya, R.q(24) + R.w(5), L.y1 - w(8), bone);
    if (t >= 4) O.box(R.q(15), ya + w(4), R.q(15) + R.w(5), ya + 2 * w(4), MAG);
    // a SECOND cell down the same finger at T5, clear of the first and of
    // the membrane's trailing chamfer: the apex carries twice the charge,
    // and two cells a wing is the tell that reads at field zoom
    if (t >= 5) O.box(R.q(15), ya + 3 * w(4), R.q(15) + R.w(5), ya + 3 * w(4) + w(3), MAG);
  };
  return flyer(T, L, body, wing, MAG);
}

// ── SKATE ────────────────────────────────────────────────────────────────
//
// The manta: a long plate of a body with the cephalic fins as one cowl
// forward of it — IN THE REVERSED PAIR AND NOT IN STEEL, because a fin is
// part of the fish and only the gear on its back is machine — the harpoon
// tail the same, with its barb the family's teal. The teal seam runs down
// the spine from T2 and a gunmetal transom sits at the hips from T4. The wings are FINS, not the bat's pods: wider than they
// are tall, full height at the root and tapering on 45-degree cuts to a
// four-pixel tip, with a fold along the leading edge — in the reversed
// pair to T3, a gunmetal spar from T4 — that follows the taper at one width all
// the way out. A teal cell on each fin at T5, a second one out where the
// taper leaves less room, and the cowl grown into the two CEPHALIC PRONGS
// a manta leads with — the apex's own tell, and the thing that tells it
// from the bat at a glance.
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
/** the fin's rows: q(9) to q(21), an even count so the tip's column is
 *  exactly four tall once the taper has taken half the height less two
 *  off each side */
const mantaWing = (T: Base): Wing => {
  const { n } = T; const { q } = scaler(n); const B = mantaHalf(T);
  const y0 = q(9), h = (q(21) - q(9)) & ~1;
  return { rootX: B, rootY: q(11), y0, y1: y0 + h, reach: n - q(1) - (n / 2 + B) };
};
export const MANTA_TIERS: readonly FlyerTier[] = MANTA_BASE.map((T) => withCells(T, mantaWing(T), 2 * mantaHalf(T) + 2));
export function mantaGeom(T: FlyerTier): StoopGeom { return flyerGeom(T, mantaWing(T)); }
export function manta(T: FlyerTier): StoopArt {
  const { n, t } = T; const { q, w } = scaler(n); const cx = n / 2; const U = w(2);
  const B = mantaHalf(T), L = mantaWing(T);
  const body = (P: Pen): void => {
    P.octa(cx - B, q(4), cx + B, q(27), w(4), SKIN);
    // the cephalic fins: one steel cowl across the nose to T4, and at T5
    // the thing a manta actually leads with — the cowl run out to the
    // body's full width with a PRONG standing forward off each end of it,
    // a clear notch between them. Three shapes off the front, which is
    // what tells this apex from the bat's at a glance
    if (t >= 5) {
      P.box(cx - B, q(3), cx + B, q(3) + w(4), SKIN_R);
      P.box(cx - B, 0, cx - B + w(3), q(3) + w(4), SKIN_R);
    } else P.box(cx - B + U, q(1), cx + B - U, q(1) + w(4), SKIN_R);
    // the seam ends a unit above the harpoon's shaft, never nearer
    const shaft = q(27) - 1 - (w(4) - U);
    if (t >= 2) P.box(cx - U, q(9), cx + U, shaft - U, TEAL);
    if (t >= 4) P.box(cx - B, q(24), cx + B, q(24) + w(3), GUN);
    // the harpoon last, over the transom: the shaft and the barb
    // the shaft starts on the row where the body's chamfer has narrowed
    // to the shaft's own width, so no sliver of skin is left beside it
    P.box(cx - U, shaft, cx + U, n, SKIN_R);
    const barb = t >= 3 ? w(3) : U;
    P.box(cx - barb, n - U, cx + barb, n, TEAL);
  };
  const wing = (O: Pen): void => {
    const R = scaler(L.reach); const { y0, y1, reach } = L;
    // the fin: an octagon whose chamfer c takes the tip down to four
    // rows, begun c inside the body so its root corners are cut under
    // the body and the root the wing shows is a straight, full-height
    // edge. The leading-edge fold is a box along the straight part of
    // the edge, stopping four short of where the taper begins: a band
    // that followed the taper would narrow to a point against the
    // trailing edge. The runt's fin is too short for one
    const c = (y1 - y0 - 4) / 2, fold = reach - c - 4;
    O.octa(-c, y0, reach, y1, c, SKIN);
    if (fold >= 4) O.box(0, y0, fold, y0 + w(4), t >= 4 ? GUN : SKIN_R);
    // two teal cells out the fin at T5, the outer one shorter because the
    // taper leaves it less room: a manta's spots, and they sit inside the
    // octagon's diagonals at every row they cross
    if (t >= 5) {
      O.box(R.q(10), q(14), R.q(10) + R.w(6), q(14) + w(4), TEAL);
      O.box(R.q(19), q(14), R.q(19) + R.w(5), q(14) + w(3), TEAL);
    }
  };
  return flyer(T, L, body, wing, TEAL);
}

// ── LIVEWIRE ─────────────────────────────────────────────────────────────
//
// The narwhal: a melon rounding into the shoulders, a body narrowing to a
// peduncle and a fluke in the reversed pair, the tusk IVORY off the melon
// — it is the one part of this animal that is really that pale, and the
// rule is that a near-white goes nowhere else on a body — with the violet
// electrode at its tip and the spiral's ridges across it from T3.
//
// GUNMETAL saddle and violet seam from T2, a collar from T3, a stack at
// the peduncle from T4, and at T5 a plated fluke edge, a GIRTH the body's
// full width across the shoulders and a violet cell on each flipper — the
// apex is harnessed. The gear is gunmetal and not steel on purpose: a
// whale is grey, and a white plate the length of its back turned the
// animal into a hull. Small flippers on the wing rig, a shallow beat.
export const NARW: Mat = ["#47525f", "#8a95a5"];
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
    if (t >= 5) P.octa(cx - F, n - q(6), cx + F, n, w(3), GUN);
    const e = t >= 5 ? w(1.5) : 0;
    P.octa(cx - F + e, n - q(6) + e, cx + F - e, n - e, w(3), NARW_R);
    // the body and the peduncle
    P.octa(cx - B, q(8), cx + B, n - q(8), w(5), NARW);
    P.box(cx - B + w(3), n - q(9), cx + B - w(3), n - q(4), NARW);
    // the tusk, its electrode, its ridges
    P.box(cx - U, 0, cx + U, q(10), BONE);
    P.box(cx - U, 0, cx + U, w(3), VOLT);
    if (t >= 3) for (let y = w(3) + U; y + U <= q(9); y += 2 * U) P.box(cx - U, y, cx + U, y + U, BONE_R);
    // the machine: saddle and seam, collar, the stack
    if (t >= 2) { P.box(cx - 2 * U, q(14), cx + 2 * U, n - q(9), GUN); P.box(cx - U, q(14) + U, cx + U, n - q(9) - U, VOLT); }
    if (t >= 3) P.box(cx - B + U, q(12), cx + B - U, q(12) + w(3), GUN);
    // the apex is HARNESSED: a steel girth the body's full width across the
    // shoulders, a clear gap behind the collar, laid where the melon is
    // straight-sided so it ends flush with the silhouette and not on a
    // chamfer. With the saddle running down from it the machine reads as
    // one rig rather than as a strip down the spine
    if (t >= 5) P.box(cx - B, q(16), cx + B, q(16) + w(2), GUN);
    if (t >= 4) { P.box(cx - U, n - q(9), cx + U, n - q(5), GUN); P.box(cx - U, n - q(9), cx + U, n - q(9) + U, VOLT); }
  };
  const wing = (O: Pen): void => {
    O.octa(0, L.y0, L.reach, L.y1, U, t >= 4 ? GUN : NARW_R);
    O.octa(0, L.y0 + w(3), L.reach, L.y1, U, NARW);
    // a violet cell on each flipper at T5, inside the octagon's diagonals
    if (t >= 5) O.box(U, L.y0 + w(4), L.reach - U, L.y1 - w(2), VOLT);
  };
  return flyer(T, L, body, wing, VOLT);
}
