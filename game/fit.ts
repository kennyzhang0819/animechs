/**
 * THE ZOOM FLOOR — shared by the game view and the map editor so the two
 * cameras pull back to the same view of the same world.
 *
 * Both used to disagree about what "zoomed all the way out" means. The
 * game pulls back past cover until the whole map sits on screen inside a
 * margin of void; the editor stopped dead at cover, which is the one zoom
 * at which you cannot see the shape you are drawing. Keeping the number
 * here rather than in either caller is what stops them drifting apart.
 *
 * There used to be a haze here too — four gradients laid over the map's
 * rim so the world ended in a soft edge (Mindustry's borderDarkness). It
 * is gone: every map's rim is rock now, and the darkness inside the hills
 * (Renderer.drawDarkness, Mindustry's own darkness buffer) already takes
 * the rim to black on its own — DARK_RIM keeps that true even though an
 * inland hill now stops short of black — so the haze was a second fade
 * over the first.
 */

/**
 * The zoom floor as a fraction of the FIT zoom — the zoom at which the
 * map's long axis exactly spans the viewport. At 0.88 the map fills 88% of
 * the tight axis and the rest is margin: enough to read the map as a shape
 * with edges, not so much that it swims in black.
 */
export const ZOOM_FIT_PAD = 0.88;

/**
 * The zoom at which the whole world fits the viewport with ZOOM_FIT_PAD's
 * margin around it — the camera's floor.
 *
 * `scale` is the cover scale the caller already keeps (max of the two
 * axis ratios), because both cameras express zoom as a multiplier ON cover
 * rather than as an absolute. Returns 1 for a zero-sized canvas, which is
 * the "no meaningful viewport yet" case rather than a zoom worth honouring.
 */
export function fitZoom(
  canvasW: number,
  canvasH: number,
  worldW: number,
  worldH: number,
  scale: number,
): number {
  if (canvasW <= 0 || canvasH <= 0 || scale <= 0) return 1;
  return (Math.min(canvasW / worldW, canvasH / worldH) / scale) * ZOOM_FIT_PAD;
}
