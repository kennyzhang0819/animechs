/**
 * THE SIEGE'S MACHINES — the railgun a raze mission plants (levels.ts
 * `railgun`), and the four Wardens, which are SHELVED TURRETS (types.ts
 * RETIRED_KINDS, constants.ts TOWERS): drawn, priced and whole, and stood
 * up by nothing on any board. The drawings are kept because they are worth
 * keeping, not because something is using them.
 *
 * THEY ARE NOT ANIMALS, AND THAT IS THE POINT. Nine of the roster's lines
 * are a herd of something with five sizes of it, drawn under the animal
 * flag (animalFlag.ts); these are MACHINERY, like the Borer and like
 * the turrets the player buys. A body that walks at your core is alive
 * here, and a body that was BUILT and left standing on a patch of ground
 * is not — a player should be able to tell a planted machine from a wave
 * at field zoom without reading a name, and the cheapest way to say "this was
 * installed" is to draw it out of the same plate, steel and bore the
 * turrets are drawn out of (turretArt.ts).
 *
 * SO THE GRAMMAR IS THE TURRETS' (docs/unit-art.md section 1b) and the RIG
 * is the mech rig every ground body under a T4 rides (animalArt.ts
 * MechParts, atlas.ts packMech): a body, a base plate under it, and one
 * side's legs that the renderer rows fore and aft against their mirror
 * image. Every material is a dark/light PAIR split at the midline, the
 * left half is drawn and mirrored, nothing is under four pixels, and each
 * body is laid out AT ITS FOOTPRINT on 32 native px a tile — the railgun
 * on six, the four turrets on 3, 3, 4 and 6 (constants.ts TOWERS).
 *
 * ONLY THE RAILGUN WEARS THE CRUX. It is a BODY a mission plants and a
 * player has to pick it out of a crowd, so it carries the red the
 * Sovereign carries. The four turrets do not: they stand on turret
 * plates and are read by silhouette and plate like every other building,
 * and nothing tints them either (renderer.ts skips the crux multiply for
 * RETIRED_KINDS). Red on art that is already the swarm's says nothing
 * and hides the drawing.
 *
 * WHAT EACH ONE HAS TO SAY IN ONE GLANCE:
 *
 *   RAILGUN   a gun that is not aimed at you. One barrel up the middle,
 *             longer than anything else on the board, stood off by two
 *             rails, on a breech as wide as the six-tile turret plate it
 *             is bolted to. It never turns and it never walks (speed 0,
 *             Sim.plantUnit), so the drawing is allowed to be symmetrical
 *             and static in a way no walking body is: it is a BUILDING
 *             that happens to be a body.
 *   BULWARK   a wall with a prow. Wider than it is long, a notch bitten
 *             out of the front between two ram wedges, treads down both
 *             flanks. Nothing on it points forward except the two wedges,
 *             because it has no gun — its weapon is arriving.
 *   LANCE     a needle. A third the Bulwark's grid, most of its length a
 *             single emitter tube with a crimson lens at the tip and two
 *             swept fins behind. It should read as the SMALL FAST ONE at
 *             any zoom, which on this grid means long and thin against the
 *             other two's squares.
 *   HALBERD   a mortar deck. A squat hull with ONE short fat bore up the
 *             middle and an arc pod out on each shoulder, so the two
 *             things it does are both on the silhouette. Wide and stubby
 *             where the Lance is long and thin.
 *   JUGGERNAUT a block. The biggest of the four and the only one whose
 *             outline is meant to be boring: a slab with a
 *             barbette on it, treads down both flanks and a prow. Nothing
 *             about it is quick, and the drawing says so by being square.
 */
import type { MechParts } from "./animalArt";
import { scaler } from "./ironhideArt";
import { BORE, GUN, STEEL, bars, basePlate, draw, drawWithCell, pad, rev, type Mat, type Pen } from "./turretArt";

/**
 * THE GARRISON'S PLATE, and a third metal on a board that already has two:
 * a turret's gunmetal (GUN) and a beacon's blue-black (MAST). This one is
 * colder and darker than either — bare rolled armour with no paint on it —
 * so an emplacement standing in the open is not read as a turret the
 * player forgot they bought.
 */
export const ARMOUR: Mat = ["#2a2e37", "#464c58"];
/** the swarm's crux, as a drawable pair: the accent all three wear, and
 *  the material `drawWithCell` masks out into the team cell */
export const CRUX: Mat = ["#a81f38", "#ff5c73"];
const ARMOUR_R = rev(ARMOUR);

/**
 * ONE MACHINE'S NUMBERS. `n` is the grid, which is the hitbox in native
 * px; `stride` is the mech rig's leg swing, and it is ZERO on the railgun
 * because the railgun does not walk — and it draws no legs either, see
 * razeMech (atlas.ts MechArt.stride).
 */
export interface WardenTier {
  n: number;
  stride: number;
}
/** the railgun's footprint: its turret plate, its grid and its hitbox
 *  (levels.ts railgun) are one number, because an emplacement is an enemy
 *  turret that happens to be a body */
export const RAZE_PLATE_TILES = 6;
/**
 * THE FOOTPRINTS, in tiles — the plate each machine stands on, its grid
 * and its TOWERS size (constants.ts), all one number. A turret drawn at
 * one size and standing on another is two mistakes wearing each other.
 */
export const RAZE_PLATE = RAZE_PLATE_TILES;
export const LANCE_PLATE = 3;
export const BULWARK_PLATE = 3;
export const HALBERD_PLATE = 4;
export const JUGGERNAUT_PLATE = 6;
/** the five, in the order the mission puts them down. NONE OF THEM WALKS,
 *  so every stride is zero */
export const RAZE_TIER: WardenTier = { n: RAZE_PLATE * 32, stride: 0 };
export const LANCE_TIER: WardenTier = { n: LANCE_PLATE * 32, stride: 0 };
export const BULWARK_TIER: WardenTier = { n: BULWARK_PLATE * 32, stride: 0 };
export const HALBERD_TIER: WardenTier = { n: HALBERD_PLATE * 32, stride: 0 };
export const JUGGERNAUT_TIER: WardenTier = { n: JUGGERNAUT_PLATE * 32, stride: 0 };

// ── the railgun ────────────────────────────────────────────────────────
//
// TWO THIRDS BARREL, ONE THIRD BREECH, and that split is the whole
// drawing. A railgun has to read as A GUN AIMED SOMEWHERE from across the
// board — the player's answer to it is "go over there", so the one thing
// the silhouette must never be is another square — and the only shape that
// says gun at this size is a long shaft standing out of a heavy block.
//
// THE RAILS ARE DARK AND THE SHAFT IS PALE. Both were steel in the first
// cut and the three of them merged into one white slab: at field zoom a
// pale shape on a pale shape is one shape. Gunmetal rails either side of a
// steel shaft keep the middle readable and put the eye on the bore.
//
// THE CAPACITOR IS A BAND AND NOT A DRUM. It was a crimson hexagon half
// the body wide, which at any distance was a mouth — the machine read as a
// face with the rails for eyes. A band across the breech is the same
// accent doing the same job (one bright thing, low on the body, where the
// eye lands second) without competing with the barrel for the silhouette.
function razeBody(P: Pen, T: WardenTier): void {
  const { n } = T;
  const { q, w } = scaler(n);
  const c = n / 2;
  // the breech: a deep chamfered block over the back third, out to the
  // margin. THE WIDTH IS ALL HERE and the front is the gun alone, which is
  // what keeps a six-tile machine a T aimed somewhere rather than a crate
  P.octa(q(2), q(18), n - q(2), n - q(2), w(6), ARMOUR);
  // the hip fold, in the reversed pair
  P.box(q(3), n - q(9), n - q(3), n - q(9) + w(4), ARMOUR_R);
  // the two rails: gunmetal beams stood well off the shaft, each with its
  // channel cut down the outside, so the front reads as three prongs with
  // daylight between them and not as one slab in three shades
  P.box(c - w(10), q(3), c - w(10) + w(4), q(19), GUN);
  P.box(c - w(10), q(3), c - w(10) + w(1), q(19), BORE);
  // the barrel: a steel shaft two thirds of the body long, with a gunmetal
  // brake wider than the shaft at the muzzle and the bore in it
  P.box(c - w(3), 0, c + w(3), q(21), STEEL);
  P.box(c - w(5), 0, c + w(5), w(5), GUN);
  P.box(c - w(1), 0, c + w(1), w(5), BORE);
  // the trunnion: the steel bar the shaft pivots in, across the front of
  // the breech and wider than it
  P.box(q(3), q(16), n - q(3), q(16) + w(5), STEEL);
  P.box(q(3), q(16), n - q(3), q(16) + w(2), GUN);
  // THE CAPACITOR: the crimson band across the breech
  P.box(q(7), q(22), n - q(7), q(22) + w(5), CRUX);
  P.box(q(7), q(22), n - q(7), q(22) + w(2), rev(CRUX));
  // the loading bed at the back, in gunmetal so the tail is not another
  // slab of the same plate, with the breech slot cut across it
  P.octa(q(8), n - q(9), n - q(8), n - q(3), w(3), GUN);
  P.box(q(11), n - q(7), n - q(11), n - q(7) + w(3), BORE);
}
/** the grid the MACHINE is drawn on inside the plate's: the stock head's
 *  margin (8 px on this grid), so the plate shows round it */
const razeInner = (T: WardenTier): WardenTier => ({ ...T, n: T.n - 16 });
export function razeMech(T: WardenTier = RAZE_TIER): MechParts {
  const I = razeInner(T);
  const { art, cell } = drawWithCell(I.n, (P) => razeBody(P, I), CRUX);
  return {
    body: pad(art, T.n),
    base: basePlate(RAZE_PLATE_TILES),
    // NOTHING ON THE LEG LAYER. The rig lays its legs UNDER the base
    // (renderer.ts pushMech), and the base is a turret plate covering the
    // whole grid now, so anything drawn here is drawn where nobody sees it
    leg: { n: T.n, px: new Array<string | null>(T.n * T.n).fill(null) },
    cell: pad(cell, T.n),
    stride: T.stride,
  };
}

// ── the four Wardens ───────────────────────────────────────────────────
//
// THEY WEAR NO ACCENT. The railgun above carries the swarm's crimson
// because it is a BODY a mission plants and a player has to pick it out
// of a crowd; these four are TURRETS standing on turret plates, and a
// turret is read by its silhouette and its plate like every other
// building on the board. A red band on one was a costume, and it made
// four machines that share a grammar look like one machine in four
// sizes.
//
// EACH IS DRAWN INSIDE ITS PLATE, on the railgun's terms: the machine on
// a grid one stock margin smaller (`inner`), padded back out and laid
// over `basePlate`. So the plate shows round every one of them and the
// four sit in a row at 3, 3, 4 and 6 tiles reading as one family.

/** the grid a machine is drawn on inside its plate's — the stock head's
 *  8px margin, exactly as the railgun's */
const inner = (T: WardenTier): WardenTier => ({ ...T, n: T.n - 16 });

/** the four share one assembly: a body on the plate its footprint owns */
function plated(T: WardenTier, tiles: number, body: (P: Pen, T: WardenTier) => void): MechParts {
  const I = inner(T);
  const { art, cell } = drawWithCell(I.n, (P) => body(P, I), BORE);
  return {
    body: pad(art, T.n),
    base: basePlate(tiles),
    leg: { n: T.n, px: new Array<string | null>(T.n * T.n).fill(null) },
    cell: pad(cell, T.n),
    stride: T.stride,
  };
}

// ── the Lance ──────────────────────────────────────────────────────────
//
// A NEEDLE ON A BLOCK. It was a long thin body when it walked, and on a
// three-tile plate that read as a splinter lying in a square. So the hull
// is a squat chamfered box filling the plate and the EMITTER is the only
// thing that leaves it — a steel tube out of the front, collared, with
// the bore down the middle. The shape that says "one long shot" at this
// size is a barrel with nothing beside it.
function lanceBody(P: Pen, T: WardenTier): void {
  const { n } = T;
  const { q, w } = scaler(n);
  const c = n / 2;
  P.octa(q(4), q(9), n - q(4), n - q(3), w(6), ARMOUR);
  P.box(q(5), q(15), n - q(5), q(15) + w(4), ARMOUR_R);
  // the emitter: steel out past the hull, a gunmetal collar, the bore in
  // the mouth
  P.box(c - w(3), 0, c + w(3), q(14), STEEL);
  P.box(c - w(5), q(6), c + w(5), q(6) + w(4), GUN);
  P.box(c - w(1), 0, c + w(1), w(6), BORE);
  // the capacitor fins off the shoulders, and the vented deck behind
  P.box(q(1), q(13), q(1) + w(5), q(21), GUN);
  P.box(q(1), q(13), q(1) + w(2), q(21), BORE);
  P.octa(q(7), n - q(10), n - q(7), n - q(4), w(3), GUN);
  bars(P, q(10), n - q(10), n - q(8), 2, w(2), w(2));
}
export const lanceMech = (T: WardenTier = LANCE_TIER): MechParts =>
  plated(T, LANCE_PLATE, lanceBody);

// ── the Bulwark ────────────────────────────────────────────────────────
//
// A WALL WITH A PROW, and the only one of the four whose front is not a
// bore. Its reach is arm's length, so what the silhouette has to say is
// MASS: the hull fills the plate, the nose is one bar of bore with a
// single steel ram out of the middle of it, and the treads are banded
// blocks down both flanks rather than legs it no longer has.
function bulwarkBody(P: Pen, T: WardenTier): void {
  const { n } = T;
  const { q, w } = scaler(n);
  const c = n / 2;
  // the hull, corner to corner: on three tiles the only way to say MASS
  // is to leave no grid unused
  P.octa(q(1), q(4), n - q(1), n - q(1), w(6), ARMOUR);
  P.box(q(2), q(14), n - q(2), q(14) + w(5), ARMOUR_R);
  P.box(q(3), n - q(8), n - q(3), n - q(8) + w(4), ARMOUR_R);
  // THE PROW: a bar of bore across the WHOLE nose with a broad steel
  // wedge low in it. Wide and flat, because a spike says reach and this
  // thing has none — its whole argument is that it is in the way
  P.box(q(2), q(3), n - q(2), q(3) + w(6), BORE);
  P.octa(c - w(8), 0, c + w(8), q(7), w(3), STEEL);
  // the treads: a banded block down the near flank, mirrored, run right
  // to the edge so the outline is tracks and not a chamfer. FOUR HEAVY
  // BANDS and not six thin ones — at three tiles a fine comb is a
  // texture, and what this needs to read as is a track
  P.box(0, q(9), w(6), n - q(3), GUN);
  bars(P, 0, w(6), q(11), 4, w(3), w(3), BORE);
  // the deck between them, with the hatch cut across it
  P.octa(q(10), q(13), n - q(10), n - q(5), w(4), GUN);
  P.box(q(12), q(17), n - q(12), q(17) + w(3), BORE);
}
export const bulwarkMech = (T: WardenTier = BULWARK_TIER): MechParts =>
  plated(T, BULWARK_PLATE, bulwarkBody);

// ── the Halberd ────────────────────────────────────────────────────────
//
// A MORTAR DECK. One short fat bore up the middle — wide and stubby where
// the Lance is long and thin, because what it does is LOB — with the
// shell hoist behind it and an arc pod out on each shoulder. Four tiles
// is the room to carry both without either going under.
function halberdBody(P: Pen, T: WardenTier): void {
  const { n } = T;
  const { q, w } = scaler(n);
  const c = n / 2;
  P.octa(q(3), q(8), n - q(3), n - q(2), w(7), ARMOUR);
  P.octa(q(8), q(2), n - q(8), q(13), w(5), ARMOUR);
  P.box(q(4), q(16), n - q(4), q(16) + w(5), ARMOUR_R);
  P.box(q(5), n - q(10), n - q(5), n - q(10) + w(4), ARMOUR_R);
  // the spine first, so nothing the shoulders carry is painted under it
  P.box(c - w(4), q(11), c + w(4), q(24), GUN);
  // THE MOUTH: a short fat bore in a gunmetal collar
  P.box(c - w(7), q(2), c + w(7), q(11), GUN);
  P.box(c - w(5), q(3), c + w(5), q(9), STEEL);
  P.box(c - w(4), q(3), c + w(4), q(7), BORE);
  // the arc pods on the shoulders, each with its emitter slots
  P.box(q(1), q(13), q(1) + w(6), q(22), GUN);
  P.box(q(1), q(15), q(1) + w(6), q(15) + w(3), BORE);
  P.box(q(1), q(19), q(1) + w(6), q(19) + w(3), BORE);
  // the hoist at the back, vented
  P.octa(q(8), n - q(9), n - q(8), n - q(3), w(4), GUN);
  bars(P, q(11), n - q(11), n - q(8), 3, w(2), w(2));
}
export const halberdMech = (T: WardenTier = HALBERD_TIER): MechParts =>
  plated(T, HALBERD_PLATE, halberdBody);

// ── the Juggernaut ─────────────────────────────────────────────────────
//
// THE RAILGUN'S SHAPE AT THE RAILGUN'S SIZE, and that is deliberate: six
// tiles is the biggest plate there is, and the one thing a machine that
// big must not be is a square. So it is built the way the emplacement is
// — a heavy breech across the back, rails standing off a shaft, a brake
// at the muzzle — with the width pushed into a pair of sponsons the
// railgun does not have, so the two read as the same works at the same
// scale doing two different jobs.
function juggernautBody(P: Pen, T: WardenTier): void {
  const { n } = T;
  const { q, w } = scaler(n);
  const c = n / 2;
  // the breech, out to the margin: all of the width is here
  P.octa(q(2), q(17), n - q(2), n - q(2), w(6), ARMOUR);
  P.box(q(3), n - q(9), n - q(3), n - q(9) + w(4), ARMOUR_R);
  // the sponsons: a banded block down each flank of the breech, which is
  // what this has and the railgun does not
  P.box(q(1), q(19), q(1) + w(5), n - q(5), GUN);
  bars(P, q(1), q(1) + w(5), q(21), 4, w(2), w(3), BORE);
  // the rails: gunmetal beams stood off the shaft with a channel cut down
  // the outside of each, so the front is prongs with daylight between
  P.box(c - w(11), q(2), c - w(11) + w(4), q(18), GUN);
  P.box(c - w(11), q(2), c - w(11) + w(1), q(18), BORE);
  // the shaft: steel, two thirds of the body, a wide brake at the muzzle.
  // NARROW ON PURPOSE — a pale shaft is the brightest thing on the
  // machine and a fat one turns six tiles of dark plate into a white slab
  P.box(c - w(3), 0, c + w(3), q(20), STEEL);
  P.box(c - w(5), 0, c + w(5), w(5), GUN);
  P.box(c - w(1), 0, c + w(1), w(5), BORE);
  // the trunnion across the front of the breech: gunmetal, with only its
  // top edge in steel, so it reads as a bar and not as a stripe
  P.box(q(5), q(15), n - q(5), q(15) + w(4), GUN);
  P.box(q(5), q(15), n - q(5), q(15) + w(1), STEEL);
  // the loading bed at the back, with the breech slot cut across it
  P.octa(q(8), n - q(9), n - q(8), n - q(3), w(3), GUN);
  P.box(q(11), n - q(7), n - q(11), n - q(7) + w(3), BORE);
}
export const juggernautMech = (T: WardenTier = JUGGERNAUT_TIER): MechParts =>
  plated(T, JUGGERNAUT_PLATE, juggernautBody);
