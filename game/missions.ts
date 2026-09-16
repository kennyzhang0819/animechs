/**
 * WHERE A MISSION'S BODY WALKS — the hard-coded roads the two ROAD
 * MISSIONS are drawn on (docs/mission-design.md).
 *
 * TWO MISSIONS SHARE THIS FILE and they are opposites. INTERCEPT sends
 * the swarm's Borers across Coldline and asks the board to stop them;
 * ESCORT sends the player's own convoy up Thornway and asks the board to
 * get it through. One road machine, because the thing a road IS — a line
 * somebody drew, an arc length along it, a heading at that point — is the
 * same question either way, and a second copy of it would be a second
 * place for a corner to be wrong.
 *
 * A ROAD IS AUTHORED, NOT PATHFOUND, and that is the whole point of both
 * archetypes. Everything else on the field reads the flow field and ends
 * up at the core, which means the player never has to ask WHERE a body
 * will be — only when. A road body ignores the core and the field both:
 * it starts where the road starts, walks a line somebody drew, and
 * finishes where it finishes. The line is fixed, visible from wave one
 * (the overlay in game.ts draws it), and the same every run, because both
 * missions are a question about whether you will PAY to put guns
 * somewhere that defends nothing, and a question you cannot plan the
 * answer to is not that question.
 *
 * THE POINTS ARE IN CELLS, at the map's own 512 grid, because that is the
 * grid a map is authored and read on (scripts/maps, the map editor). They
 * are turned into world px here, once, on the first ask.
 *
 * A ROAD RUNS OFF BOTH EDGES. The first and last points sit outside the
 * open ground on purpose: a worm is a KILOMETRE of train (levels.ts
 * WORM_LENGTH — twenty pieces, seventy-four tiles nose to tail), and one
 * that materialised whole in the middle of a room would read as a spawn
 * rather than as something that came from somewhere. It crawls in through
 * the rim rock and it crawls out through it — see Sim.updateCrosser,
 * which is why a crosser does not collide with walls at all.
 *
 * THE FIRST LEG IS THE RUN-UP AND IT IS SIZED OFF THE TRAIN. Sim.launch-
 * Crosser lays the head a whole WORM_LENGTH past the entry point, so the
 * run-up has to be LONGER THAN THE TRAIN or the head is put down in open
 * ground with half the map already behind it. Both of Coldline's are
 * about a hundred cells, which is the seventy-four of train plus the
 * distance from the rim to the first corner, and both are drawn COLLINEAR
 * with the leg that follows so the train does not kink as it enters.
 * Lengthen the chain and these two numbers have to grow with it — there
 * is no check that can catch it, because a head placed in the open is a
 * legal position, just a bad one.
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
 *
 * THEY ARE FIT TO THE TERRAIN, NOT DRAWN OVER IT. Each line is the
 * shortest route from rim to rim that never comes within six cells of
 * rock (five on the north line, which is tighter), pulled taut and then
 * cut down to the fewest corners that hold that margin — so a Borer keeps
 * to the middle of the ground the generator carved and the player can
 * read where it is going a long way ahead. That margin is what makes the
 * line WALKABLE-LOOKING rather than merely legal: the train is seventy
 * tiles of body and six cells of daylight either side is what stops it
 * appearing to grind along a cliff.
 *
 * THEY USED TO WANDER. The south line was eleven corners with a 77-degree
 * hairpin in it, because it was traced by hand over a document that had
 * rock in places this one no longer does. Refitting the same two rooms
 * against the current terrain cut the south line's total turning from 422
 * degrees to 153 and the north's from 226 to 111, with no corner sharper
 * than 37. A road that bends less is a road a player can commit a battery
 * to before the train reaches it, which is the decision the map is about.
 *
 * WHAT THE SOUTH LINE GIVES UP for that: it crosses the open plain at its
 * closest about 77 cells from the core, which is INSIDE the core's own
 * lit ground (constants.ts CORE_POWER_R is 90). So one stretch of it can
 * be covered by guns bought on free power, where the rest of both roads
 * still costs a beacon. That is a deliberate trade and not an oversight —
 * the alternative was keeping the road outside the disc, which put five
 * more corners back into it.
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
      // 14,100 px rim to rim. The first leg is the run-up (see above);
      // the last runs off the east rim below the corner
      cells: [
        [-75, 502], [31, 488], [68, 483], [91, 460], [162, 367], [211, 338],
        [291, 319], [396, 348], [427, 381], [493, 434], [518, 455],
      ],
    },
    {
      name: "the north line",
      // 12,000 px rim to rim, and the straighter of the two: one shallow
      // dogleg round the rock at 110 and then most of the map in a line
      cells: [
        [-76, 120], [20, 124], [96, 127], [112, 134], [188, 130], [242, 110],
        [373, 123], [440, 122], [499, 133], [518, 136],
      ],
    },
  ],
  /**
   * THORNWAY is the escort map (levels.ts world 12, scripts/maps/
   * thornway.mjs), and it carries ONE road because the mission is one
   * journey. The core stands in the bottom-left corner and the far post
   * is the clearing in the top-right, and between them the map's own
   * corridors make a long double S: out east along the bottom, up the
   * right-hand side, back west across the middle, up the left-hand side,
   * and east again along the top. Twelve hundred cells of it, which is
   * two and a half times the width of the board.
   *
   * IT IS THE OPPOSITE ROAD FROM COLDLINE'S IN EVERY WAY THAT MATTERS.
   * A Borer's line is straightened until it barely bends, because a
   * seventy-tile train kinks at a corner and because the player has to
   * be able to commit a battery to it a long way ahead. A convoy is ONE
   * CART: it turns on the spot, and what the road is for is to take it
   * as far from the core as the map allows and keep it there. So this one
   * is left as the terrain drew it — 646 degrees of turning and a hairpin
   * at the top of the eastern climb, every one of them a place the swarm
   * crosses the line while the cart is still on it.
   *
   * THE CART DOES NOT COLLIDE (Sim.updateConvoy), so the margin here is
   * about the PICTURE and not about fitting: the line never comes within
   * three cells of rock, which on a five-tile cart is half a cell of
   * daylight at the tightest corner and a comfortable lane everywhere
   * else.
   *
   * NO RUN-UP AND NO RUN-OFF, which is the other difference. A Borer is
   * laid down off the rim because it comes from somewhere; a convoy rolls
   * out of the core's own ground and stops at the post, and both ends are
   * places on the board the player can stand a gun next to.
   */
  thornway: [
    {
      name: "the long way round",
      // 23,750 px, core to post. The halts (levels.ts EscortMission) are
      // fractions of it, chosen to land in the clearings at 22, 40, 60
      // and 76 per cent
      cells: [
        [74, 448], [136, 418], [167, 414], [233, 422], [254, 433], [349, 393],
        [396, 377], [421, 338], [372, 304], [279, 287], [244, 284], [154, 215],
        [122, 144], [156, 99], [226, 76], [255, 72], [279, 47], [330, 50],
        [369, 41], [391, 46], [428, 64], [463, 55], [486, 32],
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
 * Does this road stay on the board? A crosser's entry and exit are meant
 * to hang off the rim (see the note at the top) and everything between
 * them is meant not to — a corner outside the world would put a body
 * somewhere no turret can reach and no overlay can draw. The sim checks it
 * once at load and says so rather than playing a mission with a road
 * running off into nothing.
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
