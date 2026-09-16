/**
 * THE LINE THE BORER LAID — the rail bed under a road mission, painted
 * rather than loaded, like the ground it sits on (game/tiles.ts).
 *
 * wormArt.ts has said since the Borer was drawn that it "walks a fixed
 * line across the map ignoring the base, ON RAILS IT LAID ITSELF". This
 * file is the rails. Nothing about the mission changes: the line is still
 * missions.ts ROAD_SPECS, the bodies still walk it through roadAt, and
 * the dashed overlay still draws it for the player. What changes is that
 * the ground now says where it goes, at the ground's own resolution.
 *
 * A PIECE IS A TILE AND EVERY TILE IS AXIS-ALIGNED. The whole reason the
 * road is on an eight-heading lattice (missions.ts, roadProblems) is this
 * file: 0, 45, 90 and 135 degrees are the only headings a square pixel
 * grid draws EXACTLY — a 45-degree line is one pixel across for one
 * pixel along, with no stair pattern to go irregular — so a rail can be
 * drawn once and stamped, quarter-turned, and never resampled. A road
 * free to bend 37 degrees would need the art rotated to match, and a
 * rotated pixel sprite is a blurred one.
 *
 * FOUR PAINTINGS AND TWO CAPS, because a cell's piece is the UNORDERED
 * PAIR of neighbours its line connects, and a quarter turn maps most
 * pairs onto each other. Straight-through comes in an orthogonal and a
 * diagonal; a 45-degree bend comes in two hands (they are mirror images,
 * and the renderer has no mirror, so both are drawn); and a line that
 * simply stops — Thornway's core and its far post — takes a buffer.
 * Everything else on the sheet is one of those six turned by a multiple
 * of ninety (missions.ts PIECE_AT).
 *
 * A PIECE PAINTS ITS OWN SLICE OF THE LINE AND NOTHING ELSE. The window
 * is three cells square, centred on the cell, and the centreline inside
 * it runs from the midpoint of the edge toward one neighbour, through
 * the cell's centre, to the midpoint of the edge toward the other. A
 * pixel past either END of that is not painted at all — which is what
 * makes two neighbouring pieces meet exactly, with no overlap to double-
 * blend and no gap to show the floor through. The turn at the CENTRE is
 * capped round instead, so the outside of a bend carries the ballast
 * across the corner rather than mitring to a point.
 *
 * THE MARGIN IS NOT DECORATION. The art is painted four px larger than
 * the window on every side and the cell is sampled four px in (RAIL_CELL,
 * RAIL_INSET). The antialias pass clips at its input's edge — the same
 * thing that makes a 3x3 water block one drawing rather than nine
 * (atlas.ts) — so a piece painted exactly to its cut would carry a
 * softened border, and a board of them would show every cut as a
 * hairline. Painted past the cut, the filter has real neighbours to
 * average against and the seam disappears.
 *
 * SLEEPER SPACING IS PER PIECE AND THAT IS DELIBERATE. A cell crossed
 * corner to corner is 41 per cent longer than one crossed edge to edge,
 * so a fixed count would put the diagonals' sleepers that much further
 * apart. Each piece divides its OWN length into whole sleepers nearest
 * the target gap, which lands every run within about six per cent of
 * sixteen px and — because the count is whole and the sleepers centred
 * in their slots — tiles seamlessly along a run of any length.
 */

/** px across one cell of rail art: the ground's own 32 (game/tiles.ts) */
export const RAIL_ART = 32;
/** cells across a piece's window — the bed is under three, and a bend's
 *  round cap reaches BALLAST px of the centre, inside the 48px half */
export const RAIL_SPAN = 3;
/** px painted past the window on every side, for the antialias pass */
export const RAIL_MARGIN = 4;
/** the painted canvas: the window plus its margin, at art scale */
export const RAIL_PX = RAIL_SPAN * RAIL_ART + RAIL_MARGIN * 2;
/** the atlas cell, at the sheet's 2x, and how far in it is sampled */
export const RAIL_CELL = RAIL_PX * 2;
export const RAIL_INSET = RAIL_MARGIN * 2;

/**
 * THE BED, IN ART PX FROM THE CENTRELINE. Two and three quarter cells of
 * ballast is 55 world px, under a Borer's car of 66 and the Hauler's 120
 * (levels.ts) — a body wider than its track, which is what rolling stock
 * looks like and what stops the bed reading as a runway. Everything here
 * clears the four-px floor (tiles.ts MIN_MARK): no line on the ground is
 * allowed to be thinner than the ground's own smallest mark.
 */
const BALLAST = 44;
/** the darker shoulder along both edges of the bed */
const SHOULDER = 4;
/** how far a sleeper reaches either side, and how thick it is along the line */
const SLEEPER_HALF = 34;
const SLEEPER_W = 6;
/** the gap a piece aims for between sleeper centres, before it is rounded
 *  to a whole count of its own length */
const SLEEPER_GAP = 15.5;
/** the rails themselves: their offset from the centreline and their width.
 *  A gauge of 44 px under a 66 px car is the ratio real stock carries */
const RAIL_OFF = 22;
const RAIL_W = 6;
/** the buffer beam that closes a line that simply stops */
const BUFFER_W = 8;

/**
 * THE COLOURS ARE THE BORER'S, not the ground's. wormArt.ts gives the
 * train a cold blue-grey of its own precisely so it reads as the coldest
 * thing on a snow map; its road is the same metal, one step darker so the
 * bed sits UNDER the train rather than beside it.
 *
 * FLAT, WITH NO SPECKLE. A floor tile can carry a mark because it has two
 * paintings and the renderer picks between them per cell (tiles.ts); a
 * rail piece is ONE painting stamped hundreds of times down a line, so
 * anything scattered into it repeats at the cell pitch and reads as a
 * pattern rather than as gravel. The rhythm on this bed is the sleepers.
 */
const C_BALLAST = "#3a3f4d";
const C_SHOULDER = "#2b2f3a";
const C_SLEEPER = "#22252e";
const C_RAIL = "#8b93a8";

/** the eight headings, as the offset to the neighbour they point at */
export const RAIL_DIRS: readonly (readonly [number, number])[] = [
  [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1],
];

/**
 * THE SIX PAINTINGS, each named by the pair of headings its line joins.
 * `b` is null on a cap — a line that ends in this cell. Everything the
 * lattice can produce is one of these turned by a quarter (missions.ts
 * PIECE_AT builds that table from this one).
 */
export const RAIL_PIECES: readonly { name: string; a: number; b: number | null }[] = [
  { name: "straight", a: 4, b: 0 },
  { name: "diagonal", a: 5, b: 1 },
  { name: "bend-l", a: 3, b: 0 },
  { name: "bend-r", a: 4, b: 1 },
  { name: "cap", a: 4, b: null },
  { name: "cap-diagonal", a: 5, b: null },
];

type Vec = { x: number; y: number };
const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y });
const len = (v: Vec): number => Math.hypot(v.x, v.y);

/**
 * WHERE `p` FALLS ON ONE HALF OF THE LINE: `from` is the outer end and
 * `to` the cell's centre, `t` runs 0 to 1 between them, and `d` is the
 * distance to the line at that `t` — the true perpendicular while `t` is
 * inside the half, and the distance to whichever end it ran past outside
 * it. The caller decides what to do with a `t` outside 0..1; this only
 * measures.
 */
function ray(p: Vec, from: Vec, to: Vec): { t: number; d: number; L: number } {
  const v = sub(to, from);
  const L = len(v) || 1;
  const t = ((p.x - from.x) * v.x + (p.y - from.y) * v.y) / (L * L);
  const c = t < 0 ? 0 : t > 1 ? 1 : t;
  return { t, d: Math.hypot(p.x - (from.x + v.x * c), p.y - (from.y + v.y * c)), L };
}

/**
 * PAINT ONE PIECE, as RGBA at RAIL_PX square.
 *
 * Deterministic and DOM-free, so the check's art stage can run it in Node
 * exactly as the browser does (scripts/check.mjs).
 */
export function paintRail(piece: number): Uint8ClampedArray<ArrayBuffer> {
  const spec = RAIL_PIECES[piece];
  const out = new Uint8ClampedArray(RAIL_PX * RAIL_PX * 4);
  const mid = RAIL_PX / 2;
  const at = (k: number): Vec => ({
    x: mid + (RAIL_DIRS[k][0] * RAIL_ART) / 2,
    y: mid + (RAIL_DIRS[k][1] * RAIL_ART) / 2,
  });
  const centre: Vec = { x: mid, y: mid };
  const A = at(spec.a);
  const B = spec.b === null ? null : at(spec.b);
  // arc length is measured from the outer end of the FIRST half, so a
  // sleeper pattern laid on `s` runs continuously through the cell
  const la = len(sub(centre, A));
  // the direction the line travels through this cell on the way IN: the
  // wedge measures its angle from the perpendicular to this
  const inA: Vec = { x: (centre.x - A.x) / (la || 1), y: (centre.y - A.y) / (la || 1) };
  const lb = B ? len(sub(centre, B)) : 0;
  const total = la + lb;
  const slots = Math.max(spec.b === null ? 1 : 2, Math.round(total / SLEEPER_GAP));
  const gap = total / slots;

  const put = (x: number, y: number, hex: string): void => {
    const o = (y * RAIL_PX + x) * 4;
    out[o] = parseInt(hex.slice(1, 3), 16);
    out[o + 1] = parseInt(hex.slice(3, 5), 16);
    out[o + 2] = parseInt(hex.slice(5, 7), 16);
    out[o + 3] = 255;
  };

  for (let y = 0; y < RAIL_PX; y++) {
    for (let x = 0; x < RAIL_PX; x++) {
      const p: Vec = { x: x + 0.5, y: y + 0.5 };
      // the first half runs inward from the neighbour edge; the second
      // outward to the other. A cap has no second half, so its line stops
      // at the centre and the buffer below closes it
      const ha = ray(p, A, centre);
      const hb = B ? ray(p, B, centre) : null;
      // WHICH HALF OWNS THIS PIXEL, and the one case where neither does.
      //
      // A half owns it while `t` is between its outer end and the centre
      // — plus the margin past the outer end, which is the overspill the
      // antialias pass reads and the sampled cell never shows. Past the
      // outer end beyond that, the NEIGHBOURING PIECE owns it and paints
      // it identically, so this one declines and the two meet exactly.
      //
      // Both halves reading past the centre at once is the outside of a
      // BEND, and only a bend: on a straight the two point opposite ways
      // and cannot both be past it. That wedge is the join, and it takes
      // the distance to the corner itself — a round join, which carries
      // the ballast across the outside of the turn instead of mitring it
      // to a spike. Getting this wrong is not subtle: allowing the clamp
      // unconditionally paints a disc of bed round EVERY cell's centre,
      // and a line of them scallops down both shoulders.
      const okA = ha.t >= -RAIL_MARGIN / ha.L && ha.t <= 1;
      const okB = hb != null && hb.t >= -RAIL_MARGIN / hb.L && hb.t <= 1;
      let d: number, s: number;
      if (okA && (!okB || ha.d <= (hb as { d: number }).d)) { d = ha.d; s = ha.t * ha.L; }
      else if (okB && hb) { d = hb.d; s = total - hb.t * hb.L; }
      else if (hb && ha.t > 1 && hb.t > 1) {
        // THE WEDGE, AND WHY IT IS NOT JUST A ROUNDED CORNER. Distance to
        // the corner is enough to SHAPE it — the ballast rounds, and the
        // rails come round it as arcs — but the sleepers are laid on `s`,
        // and pinning `s` to the corner makes the whole wedge one phase:
        // either solid sleeper or, far more often, a bare patch of bed at
        // every bend on the map.
        //
        // So `s` runs with the ANGLE round the corner instead, at a fixed
        // nominal radius. A line of constant `s` is then a ray from the
        // corner, which lays the sleepers here as a FAN — closer together
        // at the inside of the turn than the outside, which is what track
        // through a curve actually does. A quarter of the lattice's turn
        // at that radius is 17 px, near enough one sleeper gap, so the
        // pattern picks up on the far side where it left off.
        d = Math.hypot(p.x - centre.x, p.y - centre.y);
        if (d < 1e-6) { s = la; }
        else {
          const cos = ((p.x - centre.x) * inA.x + (p.y - centre.y) * inA.y) / d;
          s = la + (Math.acos(Math.min(1, Math.max(-1, cos))) - Math.PI / 2) * RAIL_OFF;
        }
      }
      else continue;
      if (d > BALLAST) continue;
      let col = d > BALLAST - SHOULDER ? C_SHOULDER : C_BALLAST;
      // the sleepers: whole slots along this piece's own length, each
      // centred in its slot so none is cut in half by a cell boundary.
      // The modulo is taken positive because `s` runs negative inside the
      // margin, where the pattern has to keep stepping backwards
      const phase = Math.abs((((s / gap) % 1) + 1) % 1 - 0.5) * gap;
      if (d <= SLEEPER_HALF && phase <= SLEEPER_W / 2) col = C_SLEEPER;
      // ...and the two rails over them
      if (Math.abs(d - RAIL_OFF) <= RAIL_W / 2) col = C_RAIL;
      // a cap's buffer beam, square across the line at the cell's centre
      if (spec.b === null && s > total - BUFFER_W && d <= SLEEPER_HALF) col = C_RAIL;
      put(x, y, col);
    }
  }
  return out;
}

/** the same painting as a canvas, for the packer (browser only) */
export function railCanvas(piece: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = c.height = RAIL_PX;
  const g = c.getContext("2d");
  if (!g) throw new Error("2d context unavailable for a rail piece");
  g.putImageData(new ImageData(paintRail(piece), RAIL_PX, RAIL_PX), 0, 0);
  return c;
}
