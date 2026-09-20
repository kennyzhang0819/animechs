/**
 * THE HAULER — the escort mission's cart (levels.ts CONVOY_HP, EscortMission),
 * and the only body on this board that is the PLAYER'S.
 *
 * THAT IS THE WHOLE OF THE BRIEF. Everything else on the field is either a
 * gun you placed or an animal coming to knock it over, and this is a third
 * thing: a vehicle of yours, crossing ground you do not hold, which you
 * are spending money to keep alive. So it is drawn to read as YOURS at a
 * glance and as NOT A TURRET at the same glance —
 *
 *   - it wears the PLAYER'S AMBER (turretArt.ts POWER), the hue the core,
 *     every selection ring and every price on the HUD
 *     are drawn in, and the one hue nothing in the swarm has. The amber is
 *     the CARGO: three crates strapped to the deck, which is the thing the
 *     mission is actually about and the part a player should find first;
 *   - its plating is its own metal (HAUL below), not a turret's gunmetal
 *     and not the core's slate, for the reason the Tusker's iron and the
 *     Borer's rail are their own: the board has four kinds of thing on it
 *     now and each one is a different metal;
 *   - it has TRACKS, and nothing else on the sheet does. A turret is a
 *     plate with a head on it and every animal walks; a thing that rolls
 *     is a thing that is going somewhere, which is the one fact about this
 *     body a player has to read.
 *
 * IT IS THE BIGGEST SINGLE BODY ON THE BOARD after the Sovereign — a
 * TWELVE-tile square, three times the widest turret (levels.ts
 * CONVOY_SIZE) — because an objective that has to be found from across a
 * map while the swarm is on the screen cannot be the size of the things
 * shooting it. Six tiles was the first answer and it was not enough: on a
 * camera pulled far enough out to see the road it read as a turret
 * somebody had left in a field.
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
/** the track rubber, and the bright rim of each road wheel */
const TRACK: Mat = ["#232322", "#3b3b38"];

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
 * The cart, facing up: tracks down both flanks, a cab at the front, and
 * the cargo on the deck behind it. Only the left half is drawn — `draw`
 * mirrors it — so every x here is under the midline at 96. The numbers
 * are pixels on the 192 grid, which is not tiles: see CONVOY_N.
 */
function haulerArt(P: Pen): void {
  const n = CONVOY_N;
  const c = n / 2;

  // ---- the hull: one long chamfered plate, the length of the grid ----
  P.octa(26, 8, n - 26, n - 8, 20, HAUL);

  // ---- the tracks: a band down each flank, wider than the hull's edge
  // so the cart reads as sitting ON something. Eight road wheels a side,
  // each a steel rim in the rubber — twelve px of wheel and eight of gap,
  // which is the four-pixel floor with half again on top of it ----
  P.box(14, 22, 46, n - 22, TRACK);
  for (let y = 28; y + 12 <= n - 28; y += 20) P.box(18, y, 42, y + 12, STEEL);
  // the track guard: a plate over the top of the run, in the reversed
  // pair so it reads as a lip standing proud of the hull
  P.box(40, 22, 56, n - 22, HAUL_R);

  // ---- the cab, at the front and narrower than the deck: a chamfered
  // box with a dark screen across it and a roll bar behind ----
  P.octa(56, 12, n - 56, 74, 14, HAUL);
  P.box(62, 20, n - 62, 40, BORE);
  P.box(56, 46, n - 56, 56, GUN_R);
  // the lamps: the cart's own amber, at the leading corners. A PAIR OF
  // BOXES and not a pair of discs — two circles side by side read as eyes
  // at every size, which is the one thing nothing on this sheet may have
  P.box(62, 12, 78, 24, POWER);

  // ---- the deck, and the cargo on it. THIS IS THE OBJECTIVE: three
  // crates in the player's own amber, strapped down under steel bands, on
  // a gunmetal bed so the amber has something dark to sit against ----
  P.box(56, 78, n - 56, n - 16, GUN);
  for (let k = 0; k < 3; k++) {
    const y0 = 86 + k * 34;
    P.octa(64, y0, n - 64, y0 + 26, 6, POWER);
    // the strap across each crate, in steel: the thing that says the
    // cargo is LOAD and not a light
    P.box(56, y0 + 10, n - 56, y0 + 16, STEEL);
  }

  // ---- the spine: a rail down the middle of the deck, drawn last so it
  // crosses every crate and ties the load into one object ----
  P.box(c - 8, 78, c + 8, n - 16, GUN_R);

  // ---- the tow hitch at the back ----
  P.box(c - 14, n - 20, c + 14, n - 8, TRACK);
}

export const hauler = (): Art => draw(CONVOY_N, haulerArt);
