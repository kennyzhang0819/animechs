/**
 * THE HUD's SMALL MARKS — the run's scrap coin, the campaign's upgrade
 * point and the hostile mark the enemy count wears, drawn by the same pen
 * as the mod glyphs and under the same house rules (game/pixelArt.ts).
 *
 * THEY ARE DRAWN AND NOT SPRITED. Scrap used to be item-scrap.png lifted
 * straight out of Mindustry, which is a 32px ore pebble made to be read on
 * a conveyor — at the 16px the HUD prints it at, it was a grey smudge.
 */

import { memoDraw, PAL, type Pen } from "./pixelArt";

export const CURRENCY_GRID = 16;

export type CurrencyGlyph = "scrap" | "point" | "hostile";

const GLYPHS: Record<CurrencyGlyph, (g: Pen) => void> = {
  /** SCRAP — a coin: brown outline, yellow face, an embossed inner rim, one glint */
  scrap: (g) => {
    g.disc(0.5, 0.5, 0.44, PAL.hookDark);
    g.disc(0.5, 0.5, 0.37, PAL.flame);
    g.ring(0.5, 0.5, 0.27, 1, PAL.hook);
    g.box(0.31, 0.31, 0.44, 0.38, PAL.flameLite);
    g.box(0.31, 0.31, 0.38, 0.44, PAL.flameLite);
  },

  /** AN UPGRADE POINT — a struck gold token with an up triangle on it */
  point: (g) => {
    g.disc(0.5, 0.5, 0.44, PAL.emberLite);
    g.disc(0.5, 0.5, 0.36, PAL.flame);
    g.poly([[0.5, 0.22], [0.78, 0.72], [0.22, 0.72]], PAL.steelDeep);
  },

  /**
   * HOSTILE — a bent sheet of grey plating with two bolt holes. It was the
   * scrap mark once and read as an enemy, so now it counts them.
   */
  hostile: (g) => {
    g.poly([[0.06, 0.34], [0.5, 0.04], [0.5, 0.96], [0.06, 0.74]], PAL.steel);
    g.poly([[0.5, 0.04], [0.94, 0.36], [0.94, 0.72], [0.5, 0.96]], PAL.steelDark);
    g.over((o) => o.box(0, 0, 1, 0.2, PAL.steelLite));
    g.box(0.15, 0.46, 0.3, 0.6, PAL.steelDeep);
    g.box(0.62, 0.5, 0.81, 0.64, PAL.steelDeep);
  },
};

export const currencyGlyph = memoDraw(GLYPHS, CURRENCY_GRID, "scrap");
