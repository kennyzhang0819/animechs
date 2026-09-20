/**
 * THE TWO CURRENCY MARKS — the run's scrap and the campaign's upgrade
 * point, drawn by the same pen as the mod glyphs and under the same house
 * rules (game/pixelArt.ts).
 *
 * THEY ARE DRAWN AND NOT SPRITED. Scrap used to be item-scrap.png lifted
 * straight out of Mindustry, which is a 32px ore pebble made to be read on
 * a conveyor — at the 16px the HUD prints it at, it was a grey smudge, and
 * it had no sibling for the point to be drawn as.
 *
 * ONE IS METAL AND THE OTHER IS GOLD, on purpose: the two currencies never
 * touch (economy.ts) and the colour says which before the number does.
 */

import { memoDraw, PAL, type Pen } from "./pixelArt";

export const CURRENCY_GRID = 16;

export type CurrencyGlyph = "scrap" | "point";

const GLYPHS: Record<CurrencyGlyph, (g: Pen) => void> = {
  /**
   * SCRAP — a bent sheet of plating, folded down the middle, with two
   * bolt holes and a torn bottom edge.
   *
   * THE FOLD IS THE WHOLE READ. One flat grey chunk is a rock; two faces
   * of one sheet at an angle to each other is METAL that has been through
   * something. The plating runs DOWN and not across, which is the one
   * thing that stops a light top over a dark skirt turning into a face
   * (pixelArt.ts rule 6).
   */
  scrap: (g) => {
    g.poly([[0.06, 0.34], [0.5, 0.04], [0.5, 0.96], [0.06, 0.74]], PAL.steel);
    g.poly([[0.5, 0.04], [0.94, 0.36], [0.94, 0.72], [0.5, 0.96]], PAL.steelDark);
    g.over((o) => o.box(0, 0, 1, 0.2, PAL.steelLite));
    g.box(0.15, 0.46, 0.3, 0.6, PAL.steelDeep);
    g.box(0.62, 0.5, 0.81, 0.64, PAL.steelDeep);
  },

  /**
   * AN UPGRADE POINT — a struck gold token with three rising bars on it.
   *
   * THE STAMP IS THE DIAL, not an arrow. Every point buys exactly one
   * thing — a rank on one of the four global dials (skills.ts) — and a
   * staircase says that where a 16px arrow says only "up" and, at this
   * size, mostly reads as a dark smudge. The token is what says currency;
   * the bars are what say which one.
   */
  point: (g) => {
    g.disc(0.5, 0.5, 0.44, PAL.emberLite);
    g.disc(0.5, 0.5, 0.36, PAL.flame);
    g.box(0.22, 0.6, 0.38, 0.78, PAL.steelDeep);
    g.box(0.42, 0.44, 0.58, 0.78, PAL.steelDeep);
    g.box(0.62, 0.28, 0.78, 0.78, PAL.steelDeep);
  },
};

export const currencyGlyph = memoDraw(GLYPHS, CURRENCY_GRID, "scrap");
