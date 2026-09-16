/**
 * THE COLDLINE WORM, drawn on the turrets' engine (turretArt.ts) like
 * every other body on the sheet — and the first thing on it that is not
 * an animal.
 *
 * It is a MACHINE ON PURPOSE. Every family is one animal drawn from above
 * (docs/unit-art.md), and the reason that rule holds is that the swarm is
 * alive and the board is not. The worm is neither: it is the mission's
 * crosser (docs/mission-design.md, "intercept the crosser") — a thing that
 * walks a fixed line across the map ignoring the base, on rails it laid
 * itself. So it is drawn as the thing it reads as at field zoom: a train.
 * Gunmetal cars on a hot seam, a steel cutter at the front and two stacks
 * at the back, and no eyes, no legs and nothing organic anywhere on it.
 *
 * THREE DRAWINGS, NOT TWENTY. A worm on the field is twenty BODIES in a
 * line (levels.ts WORM_CHAIN, Sim.launchCrosser) rather than one body
 * with a chain drawn behind it, because every segment has to be shootable
 * on its own — the mission is "kill the whole train before it crosses",
 * and a train with one hurtbox at the nose is a mission about hitting a
 * nose. So the sheet carries a head, a car and a tail, and the car is
 * packed once and drawn eighteen times.
 *
 * THE DRAWINGS ARE DRAWN AT 96 AND SHOWN AT 144. The quad grew by half
 * (atlas.ts UNIT_ART) without the art changing, which makes the Borer the
 * second body on the sheet to break the px-per-px rule after the boss.
 * Nothing below moves: the grid here is still the hitbox at 32 native px
 * a tile, and levels.ts carries the 1.5 once, on the box.
 *
 * The grammar is the families': a material is a PAIR, dark on the left
 * half of the sprite and light on the right, the shade applied after the
 * shape (`draw`), a part in the reversed pair to show a fold, and nothing
 * narrower than four pixels. The grid is the hitbox at 32 native px a
 * tile, so all three are drawn on 96 — three tiles of body a segment.
 */
import type { Art } from "./animalArt";
import { CRIM } from "./ironhideArt";
import { BORE, GUN, GUN_R, STEEL, draw, type Mat, type Pen } from "./turretArt";

/**
 * THE FRAME METAL IS THE WORM'S OWN, not the turrets' and not the core's.
 * `IRON` in turretArt.ts is the core's slab and says so; the Tusker took
 * a warm iron of its own for the same reason. This one is the other way —
 * a cold blue-grey a shade under gunmetal — because the train runs on a
 * snow map and its chassis should read as the coldest thing on it.
 */
const RAIL: Mat = ["#3b4150", "#6a7185"];

/**
 * THE GRID: 96 native px, three tiles, for all three pieces. The cars are
 * drawn narrower than the grid rather than on a grid of their own, so the
 * whole train rides one cell size and one quad — a head that needed its
 * own cell would buy four pixels of nose and a second set of numbers to
 * keep in step with the hitboxes in levels.ts.
 */
export const WORM_N = 96;

/**
 * THE HEAD: a cutter drum, a drive collar behind it, and the hull the
 * train is pulled by. The drum is the only STEEL on the body and the only
 * thing on the worm that is wider at the front than behind — everything
 * else tapers back — so the silhouette says which end is coming at you
 * from across the map.
 */
function headArt(P: Pen): void {
  const n = WORM_N;
  // THE HULL IS NARROWER THAN THE DRUM, by six px a side. It is the only
  // thing that makes the front of this body read as a cutter rather than
  // as the front of a box: the drum overhangs, so the silhouette steps IN
  // behind it, and a Borer coming at you across the map is the one shape
  // on the board that gets wider at the end you are looking at
  P.octa(16, 16, n - 16, n, 14, GUN);
  // two folds across the back, in the reversed pair — the same trick the
  // rhino's shoulder and hip use, and the only thing drawing a plate this
  // long as more than one flat
  P.box(16, 34, n - 16, 42, GUN_R);
  P.box(16, 66, n - 16, 74, GUN_R);
  // the flank rails down both sides, which is what the cars couple onto
  P.box(16, 22, 26, n, RAIL);
  // the spine, and the hot seam down the middle of it. The seam is the
  // one accent the machine wears and it runs the length of the train
  P.box(38, 18, 58, n, RAIL);
  P.box(42, 22, 54, n - 6, CRIM);
  // THE CUTTER: a steel drum across the nose, a dark bore cut into its
  // face, and five teeth crossing the bore. The teeth are stepped TWELVE
  // px apart about the midline, so the mirror lands one exactly on it and
  // the daylight between any two is four — the floor, and no thinner
  P.octa(12, 0, n - 12, 30, 8, STEEL);
  P.box(22, 6, n - 22, 24, BORE);
  for (const cx of [48, 36, 24]) P.box(cx - 4, 0, cx + 4, 18, STEEL);
  // the drive collar: the band the drum turns in, on the hull's own width
  P.box(16, 28, n - 16, 36, RAIL);
}

/**
 * A CAR: the piece seven of the nine segments are. Shorter than the grid
 * (90 of 96) and narrower (70), which is the 56x44 hitbox levels.ts gives
 * it — a train car is longer than it is wide, and a square segment reads
 * as a crate.
 */
function carArt(P: Pen): void {
  const n = WORM_N;
  const x0 = 13, x1 = n - 13, y0 = 3, y1 = n - 3;
  P.octa(x0, y0, x1, y1, 12, GUN);
  // the couplings, front and back: the plate each end butts against, held
  // six px inside the car so the chamfer survives at all four corners —
  // full-width end plates simply square the body off again
  P.box(x0 + 6, y0, x1 - 6, y0 + 10, RAIL);
  P.box(x0 + 6, y1 - 10, x1 - 6, y1, RAIL);
  // two ribs across the roof, in the reversed pair
  P.box(x0, 30, x1, 38, GUN_R);
  P.box(x0, 58, x1, 66, GUN_R);
  // the flank vent, dark, well inside the outline so the chamfer survives
  P.box(17, 22, 27, y1 - 22, BORE);
  // the spine and the seam, continuing the head's
  P.box(38, y0, 58, y1, RAIL);
  P.box(42, y0 + 10, 54, y1 - 10, CRIM);
}

/**
 * THE TAIL: the car with its back end tapered off and two stacks on it.
 * It is what says the train has ENDED — a chain of identical cars running
 * off the screen has no readable last segment, and the whole mission is
 * counting whether the last one died.
 */
function tailArt(P: Pen): void {
  const n = WORM_N;
  const x0 = 13, x1 = n - 13, y0 = 3;
  // the car, cut short, and a tapered rump behind it
  P.octa(x0, y0, x1, 64, 12, GUN);
  P.octa(x0 + 8, 56, x1 - 8, n - 3, 18, GUN);
  P.box(x0 + 6, y0, x1 - 6, y0 + 10, RAIL);
  P.box(x0, 30, x1, 38, GUN_R);
  P.box(17, 22, 27, 56, BORE);
  // the spine, stopping where the rump starts
  P.box(38, y0, 58, 62, RAIL);
  P.box(42, y0 + 10, 54, 58, CRIM);
  // the two stacks, on the rump either side of the centre. A PAIR OF
  // BOXES and not a pair of discs: two circles side by side read as eyes
  // at every size, which is the one thing nothing on this sheet may have
  P.box(26, 66, 38, 84, RAIL);
  P.box(28, 68, 36, 80, BORE);
}

export const wormHead = (): Art => draw(WORM_N, headArt);
export const wormCar = (): Art => draw(WORM_N, carArt);
export const wormTail = (): Art => draw(WORM_N, tailArt);
