import type { CSSProperties } from "react";

/**
 * THE COLOUR A TILE WEARS, as the one inline style a `.ms-tile` takes
 * (app/globals.css). The frame, its light and dark rows and its ground
 * are all mixed from this in CSS, so a call site says what
 * colour the thing is and nothing about how the square is drawn — and
 * never sets border-color or background on it, which would paint over
 * the frame.
 */
export const tile = (color: string): CSSProperties =>
  ({ "--tile": color }) as CSSProperties;
