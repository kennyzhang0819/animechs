/**
 * THE HAULER — the escort mission's cart (levels.ts CONVOY_HP, EscortMission),
 * and the only body on this board that is the PLAYER'S.
 *
 * It is drawn as a CARGO BEAST: a bull-shaped mech, horns forward, four
 * stub legs at the flanks and the load strapped across its back. That is
 * the brief in one silhouette — yours (the cargo is the player's amber,
 * turretArt.ts POWER, the hue nothing in the swarm has), not a turret (it
 * has a head and legs, and a turret is a plate with a gun on it), and
 * going somewhere (a beast walks; a plate does not). Its plating is its
 * own metal (HAUL), the fourth on the board beside gunmetal, slate and rail.
 *
 * It is the biggest single body after the Sovereign — twelve tiles
 * (levels.ts CONVOY_SIZE) — because an objective found from across a map
 * cannot be the size of the things shooting it.
 *
 * The grammar is the families' and the turrets' (docs/unit-art.md): a
 * material is a PAIR, dark on the left half and light on the right, the
 * shade applied after the shape (`draw`), a part in the reversed pair to
 * show a fold, nothing narrower than four pixels, drawn facing up on a
 * square grid at 32 native px a tile.
 */
import type { Art } from "./animalArt";
import { BORE, GUN, GUN_R, POWER, STEEL, draw, type Mat, type Pen } from "./turretArt";

/**
 * THE HAULER'S OWN PLATING: a warm olive-drab, the one colour on the sheet
 * that is neither a turret's gunmetal, the core's slate, the mast's
 * blue-black nor the Borer's cold rail. A working vehicle rather than a
 * weapon, and legible against Thornway's grass and dirt, which is the map
 * it crosses.
 */
const HAUL: Mat = ["#4a4a33", "#7d7c5c"];
const HAUL_R: Mat = [HAUL[1], HAUL[0]];
/** the legs' rubber and the tail, and the bone of the horns */
const TRACK: Mat = ["#232322", "#3b3b38"];
const HORN: Mat = ["#b8ad8a", "#e8e0c4"];

/**
 * THE GRID: 192 native px, which is the resolution the cart is DRAWN at
 * and no longer the size it is drawn AT. atlas.ts CONVOY_QUAD stretches
 * the cell to CONVOY_SIZE tiles, so this grid is magnified about two to
 * one on the board — the one cell on the sheet that is.
 *
 * IT STAYS AT 192 because every coordinate below is a pixel on this grid
 * and the drawing is already made of slabs: the narrowest run on it is
 * the four-px floor (docs/unit-art.md) and most of it is twelve or more,
 * which is a shape that survives magnification. Redrawing it at 384 would
 * buy detail the cart does not want — it is a working vehicle read as a
 * silhouette from across a map, not a body inspected up close.
 */
export const CONVOY_N = 192;

/**
 * The beast, facing up: horns and head at the front, a collar, the barrel
 * of the body with a leg at each corner, the cargo on its back and a tail.
 * Only the left half is drawn — `draw` mirrors it — so every x here is
 * under the midline at 96. The numbers are pixels on the 192 grid, which
 * is not tiles: see CONVOY_N.
 */
function haulerArt(P: Pen): void {
  const n = CONVOY_N;
  const c = n / 2;

  // ---- the body: one long chamfered barrel, widest across the shoulders ----
  P.octa(30, 64, n - 30, n - 18, 18, HAUL);
  // the fold along the flank, in the reversed pair
  P.box(36, 84, 48, n - 36, HAUL_R);

  // ---- the head: a chamfered block narrower than the body, a dark brow
  // band across it and the muzzle below in the reversed pair. A BAND and
  // not two lamps — two discs side by side read as eyes at every size,
  // which is the one thing nothing on this sheet may have ----
  P.octa(54, 12, n - 54, 66, 12, HAUL);
  P.box(60, 24, n - 60, 36, BORE);
  P.box(70, 44, n - 70, 62, HAUL_R);
  // the nose ring: the one amber on the head, so the front reads as the front
  P.box(84, 54, n - 84, 62, POWER);

  // ---- the horns: a staircase of bone climbing out from the brow to the
  // top corner, each step the four-pixel floor and a half ----
  for (let k = 0; k < 5; k++) P.box(58 - 9 * k, 30 - 6 * k, 72 - 9 * k, 40 - 6 * k, HORN);
  P.box(14, 0, 28, 10, TRACK);

  // ---- the collar: a steel yoke where the head meets the shoulders ----
  P.box(58, 62, n - 58, 72, GUN_R);
  P.box(64, 64, n - 64, 70, STEEL);

  // ---- the deck, and the cargo on it. THIS IS THE OBJECTIVE: three
  // crates in the player's own amber, strapped down under steel bands, on
  // a gunmetal bed so the amber has something dark to sit against ----
  P.box(56, 80, n - 56, n - 30, GUN);
  for (let k = 0; k < 3; k++) {
    const y0 = 86 + k * 28;
    P.octa(62, y0, n - 62, y0 + 22, 6, POWER);
    P.box(52, y0 + 8, n - 52, y0 + 14, STEEL);
  }
  // the spine: a rail down the middle, drawn last so it crosses every
  // crate and ties the load into one object
  P.box(c - 6, 80, c + 6, n - 30, GUN_R);

  // ---- the tail ----
  P.box(c - 5, n - 20, c + 5, n - 6, TRACK);
  P.octa(c - 9, n - 10, c + 9, n, 3, BORE);
}

export const hauler = (): Art => draw(CONVOY_N, haulerArt);

/** the leg cell's grid, and where each leg's root sits on the body's 192
 *  grid: (lateral, forward) from the centre, in native px */
export const CONVOY_LEG_N = 48;
export const CONVOY_LEGS: ReadonlyArray<readonly [number, number]> = [
  [-70, 5], [70, 5], [-70, -59], [70, -59],
];

/** one leg, the renderer places four (Renderer.drawConvoy): a rubber
 *  stub with a steel hoof at the rear, drawn once and never mirrored */
function haulerLegArt(P: Pen): void {
  P.box(12, 7, 36, 41, TRACK);
  P.box(12, 31, 36, 41, STEEL);
}
export const haulerLeg = (): Art => draw(CONVOY_LEG_N, haulerLegArt, false);
