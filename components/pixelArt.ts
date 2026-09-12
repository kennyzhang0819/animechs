/**
 * THE PIXEL ART ENGINE lives on the game side now (game/pixelArt.ts), for
 * the same reason the icon table does (components/towerIcons.ts): the
 * FIELD draws these too. A status symbol over a body on the board is
 * stamped by the overlay canvas (game/game.ts) off the very same drawing
 * the HUD puts in the inspector — one description, two surfaces — and
 * nothing under game/ may reach up into components/.
 *
 * The two catalogs that were here before (modArt.ts, mutationArt.ts) keep
 * importing the pen from this path.
 */
export { PAL, grid, toLayers, memoDraw } from "@/game/pixelArt";
export type { Ink, Pen, Layer } from "@/game/pixelArt";
