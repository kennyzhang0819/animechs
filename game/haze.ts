import { CELL } from "./constants";
import { VOID_RGB } from "./renderer";

/**
 * THE MAP'S EDGE, AND HOW IT STOPS EXISTING — shared by the game view and
 * the map editor so the two show the same world the same way.
 *
 * Both cameras used to disagree about what "zoomed all the way out" means.
 * The game pulls back past cover until the whole map sits on screen inside
 * a margin of void, and pays for that margin with a haze over the map's rim
 * (Mindustry's borderDarkness, World.getDarkness). The editor stopped dead
 * at cover, which is the one zoom at which you cannot see the shape you are
 * drawing — so the thing an author most needs to look at, the whole map,
 * was the one view the editor refused to give.
 *
 * Keeping the numbers here rather than in either caller is what stops them
 * drifting apart again: an editor whose fade is a different depth from the
 * game's is showing you a map with a different edge from the one that gets
 * played.
 */

/**
 * The zoom floor as a fraction of the FIT zoom — the zoom at which the
 * map's long axis exactly spans the viewport. At 0.88 the map fills 88% of
 * the tight axis and the rest is margin: enough to read the map as a shape
 * with edges, not so much that it swims in black.
 */
export const ZOOM_FIT_PAD = 0.88;

/**
 * How deep the haze lies over the map's rim, in CELLS — Mindustry's
 * borderDarkness blends over 2 tiles, and this is the same idea with room
 * for a softer falloff.
 *
 * Cells, and only cells. A depth that also had a floor in screen terms
 * looked better at the zoom floor and was wrong the moment anyone touched
 * the wheel: a band whose world extent depends on the zoom SLIDES across
 * the terrain as you zoom, and the eye reads that as the map's edge moving.
 * Anchored to the world it is simply part of the map, and the price — a
 * tighter fade when the whole map is on screen — is the honest one.
 * Eight cells is deeper than it sounds: the curve below spends most of its
 * density in the first third, so what actually READS as dark is two or
 * three cells — Mindustry's two tiles — and the rest is a tail thin enough
 * to have no visible end.
 */
export const HAZE_CELLS = 8;

/**
 * The haze's density from its outer face inward, as gradient stops.
 *
 * Solid where it meets the void — that stop is what makes the map's edge
 * stop existing — then a curve that gives up most of its weight early and
 * trails the rest out over a long tail. The tail is the whole trick: it is
 * what stops there being a depth where the haze visibly ENDS. A ramp that
 * runs out of density anywhere the eye can find draws a line there, which
 * is exactly the border a fade is meant to be hiding.
 */
const HAZE_STOPS: readonly (readonly [number, number])[] = [
  [0, 1],
  [0.08, 0.84],
  [0.18, 0.63],
  [0.3, 0.45],
  [0.45, 0.29],
  [0.6, 0.17],
  [0.75, 0.08],
  [0.88, 0.025],
  [1, 0],
];

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

/**
 * Lay the haze over the world's four edges, in WORLD coordinates — the
 * caller has already put the context through the camera transform.
 *
 * Corners take haze from two bands, which is right: it pools where they
 * meet, and alpha compositing gets there smoothly on its own.
 */
export function drawHaze(
  c: CanvasRenderingContext2D,
  worldW: number,
  worldH: number,
): void {
  const d = HAZE_CELLS * CELL;
  // x0,y0 is ON the edge, where the haze is solid; x1,y1 is where it has
  // given up the last of its density over the terrain
  const band = (x0: number, y0: number, x1: number, y1: number): CanvasGradient => {
    const grad = c.createLinearGradient(x0, y0, x1, y1);
    for (const [t, a] of HAZE_STOPS) grad.addColorStop(t, `rgba(${VOID_RGB},${a})`);
    return grad;
  };
  c.fillStyle = band(0, 0, d, 0);
  c.fillRect(0, 0, d, worldH);
  c.fillStyle = band(worldW, 0, worldW - d, 0);
  c.fillRect(worldW - d, 0, d, worldH);
  c.fillStyle = band(0, 0, 0, d);
  c.fillRect(0, 0, worldW, d);
  c.fillStyle = band(0, worldH, 0, worldH - d);
  c.fillRect(0, worldH - d, worldW, d);
}
