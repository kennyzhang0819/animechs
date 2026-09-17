/**
 * THE ANIMAL ART'S SHARED PIECES: the drawing type every family produces,
 * the canvases the packer turns it into, and the part bundles the three
 * rigs take. The drawings themselves live with their families — the
 * Ironhide rhino in ironhideArt.ts, the Starhart stag, Stoop bat, Dartback
 * frog, Skate manta and Livewire narwhal in familyArt.ts — all on the
 * turrets' engine (turretArt.ts) and grammar (docs/unit-art.md section
 * 1b), packed over the stock families' atlas cells (atlas.ts
 * packAnimalArt) while game/animalFlag.ts ANIMAL_ART is on.
 *
 * Every drawing comes out FACING UP on a square grid, exactly like a
 * Mindustry sprite file, and is handed to the same drawFacingRight /
 * antialiased / silhouetted passes the stock art goes through. NO EYES: a
 * pair of dark dots on a top-down body reads as dirt at field zoom and as
 * a cartoon up close, so no animal here gets any — the head is a shape.
 *
 * WHAT EACH FAMILY IS BUILT FOR
 *
 * Ironhide and Starhart ride the two ground rigs the renderer already
 * animates. T1-T3 are MECHS (atlas.ts MechArt): a body, a base plate
 * under it, and one leg sprite holding the two near-side hooves, mirrored
 * for the far side and slid fore and aft by the walk cycle — so the
 * hooves shuffle under a body that keeps its legs tucked. T4 and T5 are
 * LEGGED (LegArt + levels.ts LegSpec): four legs the sim plants and the
 * renderer strokes between mount, knee and hoof, with a shoulder cap and
 * a knee cap — the stance opens out and the legs really walk.
 *
 * Stoop is a flyer at every tier, drawn as three quads instead of one:
 * the body, and one wing sprite mirrored to both sides, each pivoting at
 * its root and folding toward it on a sine (renderer.ts, FLYER_PARTS in
 * atlas.ts). The composed sprite is packed too, for the icon, the spawn
 * effect and the cloak ghost.
 *
 * The Dartback frog (the dartback kinds) is a mech as a runt and legged on
 * FOUR legs from T2: a frog crouched with its legs at its sides is what a
 * frog looks like from above, and four short legs on the legged rig is
 * the nearest the rig comes. It replaced the spider.
 *
 * Skate and Livewire ride the bat's parts rig on the water: hulls go
 * through the same draw path as flyers, so a manta beats its wings the
 * way a bat does, slower, and a narwhal its flippers slower still. The
 * WORM RIG — a head, a chain of body segments the sim drags behind it,
 * and a tail (levels.ts SegmentSpec, Sim.updateSegments,
 * Renderer.pushSegments) — has no rider since the eel went; it waits for
 * the centipede.
 */

type Ink = string | null;

/** a drawing on an n grid: its pixels, null where there is none */
export interface Art { n: number; px: Ink[] }
/** a non-square drawing (a stretched leg segment, a body column) */
export interface Rect { px: Ink[]; w: number; h: number }

/** the drawing on a canvas of its own size — the one place the DOM is needed */
export function toCanvas(a: Art): HTMLCanvasElement {
  return toCanvasRect(a.px, a.n, a.n);
}
export function toCanvasRect(px: Ink[], w: number, h: number): HTMLCanvasElement {
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  const cc = cv.getContext("2d");
  if (!cc) throw new Error("2d context unavailable for animal art");
  const id = cc.createImageData(w, h);
  const d = id.data;
  for (let i = 0; i < w * h; i++) {
    const c = px[i];
    if (c === null) continue;
    d[i * 4] = parseInt(c.slice(1, 3), 16);
    d[i * 4 + 1] = parseInt(c.slice(3, 5), 16);
    d[i * 4 + 2] = parseInt(c.slice(5, 7), 16);
    d[i * 4 + 3] = 255;
  }
  cc.putImageData(id, 0, 0);
  return cv;
}

/** the centre `w` columns of a square drawing, for a body cell narrower
 *  than its grid: a rect `w` wide and `a.n` tall about the grid's centre */
export const column = (a: Art, w: number): Rect => {
  const x0 = Math.floor((a.n - w) / 2); const px: Ink[] = [];
  for (let y = 0; y < a.n; y++) for (let x = 0; x < w; x++) px.push(a.px[y * a.n + x0 + x]);
  return { px, w, h: a.n };
};

/** the mech rig's parts: body, base plate, the near-side legs, the
 *  accent cell, and the leg swing in native px */
export interface MechParts { body: Art; base: Art; leg: Art; cell: Art; stride: number }
/** the legged rig's parts */
export interface LegParts {
  body: Art; base: Art; cell: Art;
  /** on the small grid: foot (drawn pointing up, packed facing +x), and the
   *  knee and shoulder caps, which a rig whose joints are covered omits */
  foot: Art; joint?: Art; baseJoint?: Art; small: number;
  /** the two stretched segments, mount on the left, as exact rects */
  leg: Rect; legBase: Rect;
}
/** the wing rig's parts: the composed sprite, the body alone, the right
 *  wing alone, and the accent cell off the composed sprite */
export interface StoopArt { full: Art; body: Art; wing: Art; cell: Art }
export interface StoopGeom {
  /** the wing root off the body centre: sideways and forward, native px */
  rootX: number; rootY: number;
  /** the wing cell's centre off its root, in the wing's own frame:
   *  sideways (out along the span) and forward, native px */
  wingX: number; wingY: number;
}
