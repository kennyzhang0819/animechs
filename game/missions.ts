/**
 * WHERE A CROSSER WALKS — the hard-coded roads the "intercept the
 * crosser" mission sends its worms down (docs/mission-design.md).
 *
 * A ROAD IS AUTHORED, NOT PATHFOUND, and that is the whole point of the
 * archetype. Everything else on the field reads the flow field and ends
 * up at the core, which means the player never has to ask WHERE a body
 * will be — only when. A crosser ignores the core and the field both: it
 * enters at one edge, walks a line somebody drew, and leaves at the
 * other. The line is fixed, visible from wave one (the overlay in
 * game.ts draws it), and the same every run, because the mission is a
 * question about whether you will PAY to put guns somewhere useless, and
 * a question you cannot plan the answer to is not that question.
 *
 * THE POINTS ARE IN CELLS, at the map's own 512 grid, because that is the
 * grid a map is authored and read on (scripts/maps, the map editor). They
 * are turned into world px here, once, on the first ask.
 *
 * A ROAD RUNS OFF BOTH EDGES. The first and last points sit outside the
 * open ground on purpose: a worm is a hundred-odd px of train, and one
 * that materialised whole in the middle of a room would read as a spawn
 * rather than as something that came from somewhere. It crawls in through
 * the rim rock and it crawls out through it — see Sim.updateCrosser,
 * which is why a crosser does not collide with walls at all.
 */
import { CELL, COLS, ROWS } from "./constants";

/** one road, as authored: a name for the panel and a line in cells */
export interface RoadSpec {
  /** what the objective panel calls it — the player's word for this line */
  name: string;
  /** the line, in map cells, entry first and exit last */
  cells: readonly (readonly [number, number])[];
}

/**
 * one road, ready to walk: the same line in world px with its arc lengths
 * measured, so a body's position is one binary search and a lerp
 */
export interface Road {
  name: string;
  /** x, y pairs in world px */
  pts: Float32Array;
  /** distance from the entry to each point — cum[0] is 0 */
  cum: Float32Array;
  /** the whole road, world px: how far a worm walks to cross */
  length: number;
}

/**
 * THE ROADS, BY MAP. A map with no entry here has no crossers and cannot
 * carry the mission — Sim.reset says so out loud rather than running a
 * mission with nowhere to walk.
 *
 * COLDLINE is the intercept map (levels.ts world 11, scripts/maps/
 * coldline.mjs): two roads west to east with the core on its own ground
 * between them, far enough from each that one battery cannot cover both.
 * They are the map's own corridors — the spec's rooms 14-5-6-7-8-15 and
 * 17-1-2-3-4-16 — walked cell by cell over the generated document and
 * then straightened into the fewest points that stay in the open, so a
 * worm keeps to the middle of the ground the generator carved instead of
 * cutting the corners off it.
 *
 * SOUTH FIRST, and the order is the mission's: the pattern in levels.ts
 * names roads by index, and "bottom, top, both, bottom, both" is the
 * sequence read off the screen — where y grows DOWNWARD, so the south
 * road is the one along the bottom.
 */
export const ROAD_SPECS: Record<string, readonly RoadSpec[]> = {
  coldline: [
    {
      name: "the south line",
      cells: [
        [-4, 492], [28, 488], [69, 483], [171, 360], [239, 337], [297, 366],
        [396, 340], [426, 355], [442, 351], [454, 375], [453, 400], [499, 443],
        [516, 449],
      ],
    },
    {
      name: "the north line",
      cells: [
        [-4, 124], [20, 124], [97, 124], [140, 154], [240, 107], [390, 130],
        [419, 116], [499, 133], [516, 129],
      ],
    },
  ],
};

/** built roads per map, made once and kept — the arithmetic is the same
 *  every run and a road is a few dozen floats */
const BUILT = new Map<string, readonly Road[]>();

/** the middle of a cell, in world px — where a road's corner sits */
const px = (c: number): number => (c + 0.5) * CELL;

function build(spec: RoadSpec): Road {
  const n = spec.cells.length;
  const pts = new Float32Array(n * 2);
  const cum = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    pts[i * 2] = px(spec.cells[i][0]);
    pts[i * 2 + 1] = px(spec.cells[i][1]);
    if (i === 0) continue;
    const dx = pts[i * 2] - pts[i * 2 - 2], dy = pts[i * 2 + 1] - pts[i * 2 - 1];
    cum[i] = cum[i - 1] + Math.sqrt(dx * dx + dy * dy);
  }
  return { name: spec.name, pts, cum, length: cum[n - 1] };
}

/**
 * THE ROADS THIS MAP CARRIES, or an empty list. `mapId` is the level's own
 * `map` field (levels.ts LevelSpec), which is the id of a document under
 * public/maps — so a road list and the terrain it is drawn over cannot
 * drift apart without the id changing.
 */
export function roadsFor(mapId: string | undefined): readonly Road[] {
  if (!mapId) return [];
  const had = BUILT.get(mapId);
  if (had) return had;
  const spec = ROAD_SPECS[mapId];
  if (!spec) return [];
  const built = spec.map(build);
  BUILT.set(mapId, built);
  return built;
}

/**
 * WHERE A BODY `s` px ALONG THE ROAD IS, and which way it is pointed.
 * Clamped at both ends: `s` under zero is the entry and its first
 * heading, `s` past the length is the exit and its last — a worm that has
 * reached the exit is off the board anyway (Sim.updateCrosser), and the
 * clamp is what keeps the last frame before that from being a NaN.
 *
 * The walk is linear rather than a binary search: a road has a dozen
 * points and a handful of worms walk it, so the search would cost more
 * to write than it saves.
 */
export function roadAt(road: Road, s: number, out: { x: number; y: number; dx: number; dy: number }): void {
  const { pts, cum } = road;
  const n = cum.length;
  let i = 1;
  while (i < n - 1 && cum[i] < s) i++;
  const x0 = pts[i * 2 - 2], y0 = pts[i * 2 - 1];
  const x1 = pts[i * 2], y1 = pts[i * 2 + 1];
  const leg = cum[i] - cum[i - 1];
  const t = leg > 1e-6 ? (s - cum[i - 1]) / leg : 0;
  const tc = t < 0 ? 0 : t > 1 ? 1 : t;
  out.x = x0 + (x1 - x0) * tc;
  out.y = y0 + (y1 - y0) * tc;
  const len = Math.sqrt((x1 - x0) ** 2 + (y1 - y0) ** 2) || 1;
  out.dx = (x1 - x0) / len;
  out.dy = (y1 - y0) / len;
}

/**
 * Does this road stay on the board? The entry and the exit are meant to
 * hang off the rim (see the note at the top), and everything between them
 * is meant not to — a corner outside the world would put a worm somewhere
 * no turret can reach and no overlay can draw. The sim checks it once at
 * load and says so rather than playing a mission with a road running off
 * into nothing.
 */
export function roadProblems(road: Road): string[] {
  const out: string[] = [];
  const n = road.cum.length;
  for (let i = 1; i < n - 1; i++) {
    const x = road.pts[i * 2], y = road.pts[i * 2 + 1];
    if (x < 0 || y < 0 || x > COLS * CELL || y > ROWS * CELL)
      out.push(`${road.name}: corner ${i} at (${Math.round(x)}, ${Math.round(y)}) is off the board`);
  }
  if (road.length <= 0) out.push(`${road.name}: a road of no length`);
  return out;
}
