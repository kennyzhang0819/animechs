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
 * EVERY LEG IS ON THE EIGHT-HEADING LATTICE AND EVERY CORNER IS 45
 * DEGREES. A leg runs along an axis or exactly on the diagonal — dx or dy
 * zero, or the two equal — and a corner turns by one step of that lattice
 * and no other amount. `roadProblems` refuses a road that breaks either,
 * so this is an invariant of the file and not a habit of the numbers.
 *
 * THE REASON IS THE RAILS (game/railArt.ts). The line is drawn on the
 * ground now, as tiles, one per cell, and 0/45/90/135 are the only
 * headings a square pixel grid draws exactly: a 45-degree line is one
 * pixel across for one pixel along, so a rail piece is painted once and
 * stamped with a quarter turn, never rotated and never resampled. A road
 * free to bend 37 degrees would need its art turned to match, and a
 * turned pixel sprite is a blurred one. The maps were moved to fit the
 * lines rather than the other way about — which is also why these three
 * came out with FEWER corners than the hand-fitted ones they replace
 * (Coldline's south went from nine to six) instead of more.
 *
 * A RUN IS AT LEAST THREE CELLS, checked with the rest. A bend's tile
 * covers the three cells around its corner, so two corners closer than
 * that would each paint over the other's.
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
 * ground with half the map already behind it. Coldline's are 114 cells and
 * 163, both comfortably past the seventy-four of train, and both are the
 * SAME LEG as the one that follows rather than a separate collinear one —
 * on the lattice a run-up that continued the first heading simply is the
 * first leg, so there is no join for the train to kink at.
 * Lengthen the chain and these two numbers have to grow with it — there
 * is no check that can catch it, because a head placed in the open is a
 * legal position, just a bad one.
 */
import { CELL, COLS, ROWS } from "./constants";
import { RAIL_DIRS, RAIL_PIECES } from "./railArt";

/** the shortest straight run a road may carry, in cells: a bend's tile
 *  covers the three cells around its corner, so two corners closer than
 *  this would each paint over the other's */
const MIN_RUN = 3;

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
 * THE TERRAIN IS NOW FIT TO THEM, which is the reversal the lattice
 * bought. These lines used to be traced by hand through whatever gap the
 * generator happened to leave, which is why the south one once carried
 * eleven corners and a 77-degree hairpin. They are laid on the lattice
 * first now and the rock along them is cut back to a seven-cell corridor
 * afterwards (scripts/maps/railbed.mjs) — so the corridor is as wide as
 * the drawing needs everywhere instead of only where the noise was kind.
 *
 * FEWER CORNERS, EACH OF THEM BIGGER, and that trade is worth saying out
 * loud. The south line went from nine corners to six; the north kept its
 * eight. But every corner is a full 45 degrees where the old ones
 * averaged 17, so total turning went UP, from 153 degrees to 270 on the
 * south. The number that matters to a player is the COUNT: six places
 * the line changes its mind is easier to commit a battery against than
 * nine, and a train now kinks by the same amount at every one of them
 * instead of by an assortment between 8 and 37.
 *
 * WHAT THE SOUTH LINE STILL BUYS: it crosses the open plain at its
 * closest 71 cells from the core, which is INSIDE the core's own lit
 * ground (constants.ts CORE_POWER_R is 90). So one stretch of it can be
 * covered by guns bought on free power, where the rest of both roads
 * still costs a beacon. That was a deliberate trade on the hand-drawn
 * line and it was held through the refit on purpose; the north line stays
 * well outside it, at 136.
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
      // 13,780 px rim to rim, in six corners. The first leg is the run-up
      // — 114 cells due east, comfortably past the 74 of train — and the
      // last runs off the east rim on the same heading it arrives at
      cells: [
        [-59, 488], [55, 488], [216, 327], [339, 327], [354, 342],
        [391, 342], [483, 434], [519, 434],
      ],
    },
    {
      name: "the north line",
      // 12,270 px rim to rim, and still the straighter of the two: four
      // long east-west runs with a single diagonal step between each. The
      // step at 314 is the one corner here that the TERRAIN put in rather
      // than the shape — the lake at 322 is deep water, which railbed.mjs
      // will not drain, so the line steps down early to keep the bed's
      // shoulder off it
      cells: [
        [-70, 124], [93, 124], [101, 132], [199, 132], [217, 114],
        [314, 114], [322, 122], [464, 122], [475, 133], [525, 133],
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
   * keeps NINETEEN corners where Coldline's south keeps six — every one
   * of them a place the swarm crosses the line while the cart is still
   * on it.
   *
   * THE LATTICE TOOK THE HAIRPIN AND NOTHING ELSE. The hand-drawn line
   * turned 88 degrees at the top of the eastern climb; no corner here is
   * anything but 45, which cost two corners and 150 degrees of total
   * turning and left the shape — out east along the bottom, up the right,
   * back west across the middle, up the left, east again along the top —
   * exactly where it was. The halts moved by at most three cells, so
   * their fractions below did not have to move at all.
   *
   * THE CART DOES NOT COLLIDE (Sim.updateConvoy), so the corridor cut for
   * this line is about the PICTURE and not about fitting: seven cells of
   * cleared ground under a five-tile cart is a lane, not a squeeze.
   *
   * NO RUN-UP AND NO RUN-OFF, which is the other difference. A Borer is
   * laid down off the rim because it comes from somewhere; a convoy rolls
   * out of the core's own ground and stops at the post, and both ends are
   * places on the board the player can stand a gun next to.
   */
  thornway: [
    {
      name: "the long way round",
      // 23,970 px, core to post. The halts (levels.ts EscortMission) are
      // fractions of it, chosen to land in the clearings at 22, 40, 60
      // and 76 per cent
      cells: [
        [74, 448], [90, 448], [119, 419], [308, 419], [337, 390], [376, 390],
        [415, 351], [415, 342], [372, 299], [315, 299], [302, 286], [236, 286],
        [129, 179], [129, 133], [183, 79], [247, 79], [278, 48], [402, 48],
        [414, 60], [458, 60], [486, 32],
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

// ---------------------------------------------------------------------
// THE RAILS: the same line, as ground
// ---------------------------------------------------------------------

/** one painted cell of rail bed — which piece, and how far round */
export interface RailTile {
  /** the cell the piece is centred on; it covers RAIL_SPAN cells square */
  x: number;
  y: number;
  /** an index into railArt RAIL_PIECES */
  piece: number;
  /** quarter turns clockwise to apply when it is stamped */
  rot: number;
}

/** the lattice heading an offset points along, or -1 — the inverse of
 *  railArt RAIL_DIRS, small enough to search */
const dirOf = (dx: number, dy: number): number =>
  RAIL_DIRS.findIndex((d) => d[0] === Math.sign(dx) && d[1] === Math.sign(dy));

/**
 * WHICH PAINTING JOINS THESE TWO HEADINGS, and how far round it is turned.
 *
 * A cell's piece is the UNORDERED PAIR of neighbours its line connects, so
 * this is the whole vocabulary: sixteen straight-through pairs and eight
 * bends, every one of them one of railArt's four paintings at one of four
 * quarter turns. The table is built from RAIL_PIECES rather than typed
 * out, because a hand-written 8x8 of piece-and-rotation is a place for a
 * corner to be quietly wrong and this is a place it cannot be.
 *
 * A quarter turn is TWO STEPS of the eight, and the renderer's rotation
 * runs the same way the headings are numbered (x right, y down), so
 * turning a piece by `rot` maps the heading `k` it was drawn for onto
 * `k + 2 * rot`.
 */
const PIECE_AT: (readonly [number, number] | null)[][] = (() => {
  const t: (readonly [number, number] | null)[][] = Array.from({ length: 8 }, () =>
    new Array<readonly [number, number] | null>(8).fill(null),
  );
  RAIL_PIECES.forEach((p, i) => {
    if (p.b === null) return;
    for (let rot = 0; rot < 4; rot++) {
      const a = (p.a + 2 * rot) % 8, b = (p.b + 2 * rot) % 8;
      t[a][b] = [i, rot];
      t[b][a] = [i, rot];
    }
  });
  return t;
})();

/** the same for a line that simply STOPS in this cell: one heading, no pair */
const CAP_AT: (readonly [number, number] | null)[] = (() => {
  const t = new Array<readonly [number, number] | null>(8).fill(null);
  RAIL_PIECES.forEach((p, i) => {
    if (p.b !== null) return;
    for (let rot = 0; rot < 4; rot++) t[(p.a + 2 * rot) % 8] = [i, rot];
  });
  return t;
})();

/** every cell a line passes through, corner to corner, ends included */
function walkCells(spec: RoadSpec): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 1; i < spec.cells.length; i++) {
    const [ax, ay] = spec.cells[i - 1], [bx, by] = spec.cells[i];
    const sx = Math.sign(bx - ax), sy = Math.sign(by - ay);
    const n = Math.max(Math.abs(bx - ax), Math.abs(by - ay));
    // the far end of each leg is the near end of the next, so it is left
    // to that leg to add — except on the last, which has no next
    for (let t = 0; t < n; t++) out.push([ax + sx * t, ay + sy * t]);
  }
  out.push([...spec.cells[spec.cells.length - 1]] as [number, number]);
  return out;
}

const RAILS = new Map<string, readonly RailTile[]>();

/**
 * THE RAIL BED THIS MAP CARRIES, one piece a cell, made once and kept.
 *
 * It is DERIVED FROM THE ROAD and stored nowhere else — not in the map
 * document, not in the graph the map is generated from. A line and the
 * rails under it cannot drift apart if there is only one of them, and
 * moving a corner in ROAD_SPECS moves the drawing with it on the next
 * load. The cost is one walk of a few hundred cells at map load.
 *
 * CELLS OFF THE BOARD ARE DROPPED. A crosser's road hangs off both rims
 * on purpose (the run-up above) and there is no ground out there to lay
 * anything on; the renderer scissors the board anyway, so a piece out
 * there would be invisible work.
 */
export function railsFor(mapId: string | undefined): readonly RailTile[] {
  if (!mapId) return [];
  const had = RAILS.get(mapId);
  if (had) return had;
  const specs = ROAD_SPECS[mapId];
  if (!specs) return [];
  const out: RailTile[] = [];
  const seen = new Set<number>();
  for (const spec of specs) {
    const cells = walkCells(spec);
    for (let i = 0; i < cells.length; i++) {
      const [x, y] = cells[i];
      if (x < 0 || y < 0 || x >= COLS || y >= ROWS) continue;
      // a cell two lines share, or one a line crosses twice, is painted
      // once: a second piece on it would blend over the first
      const key = y * COLS + x;
      if (seen.has(key)) continue;
      const back = i > 0 ? dirOf(cells[i - 1][0] - x, cells[i - 1][1] - y) : -1;
      const on = i < cells.length - 1 ? dirOf(cells[i + 1][0] - x, cells[i + 1][1] - y) : -1;
      const pick =
        back >= 0 && on >= 0 ? PIECE_AT[back][on] : CAP_AT[back >= 0 ? back : on] ?? null;
      if (!pick) continue;
      seen.add(key);
      out.push({ x, y, piece: pick[0], rot: pick[1] });
    }
  }
  RAILS.set(mapId, out);
  return out;
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
  // THE LATTICE, CHECKED RATHER THAN TRUSTED (see the note at the top of
  // this file). Every one of these is a rule the RAILS depend on, and
  // every one of them is invisible in the numbers: a leg two cells off
  // the diagonal still draws a fine dashed line on the overlay and still
  // carries a train perfectly well — it simply cannot be tiled, so the
  // bed under it would come out as a staircase of half-joined pieces.
  // Better to refuse the map at load and say which corner did it.
  let last = -1;
  for (let i = 1; i < n; i++) {
    const dx = road.pts[i * 2] - road.pts[i * 2 - 2];
    const dy = road.pts[i * 2 + 1] - road.pts[i * 2 - 1];
    const ax = Math.abs(dx), ay = Math.abs(dy);
    if (!(ax < 1e-6 || ay < 1e-6 || Math.abs(ax - ay) < 1e-6)) {
      out.push(
        `${road.name}: leg ${i} runs ${Math.round(dx / CELL)},${Math.round(dy / CELL)} cells — ` +
          `every leg must be along an axis or exactly diagonal`,
      );
      continue;
    }
    if (Math.max(ax, ay) < MIN_RUN * CELL)
      out.push(
        `${road.name}: leg ${i} is ${Math.round(Math.max(ax, ay) / CELL)} cells — ` +
          `a run under ${MIN_RUN} leaves two bends painting over each other`,
      );
    const d = dirOf(dx, dy);
    // |steps| round the eight-heading dial, 0 (collinear) to 4 (reversed)
    const turn = last < 0 ? 1 : Math.abs(((d - last + 12) % 8) - 4);
    if (turn !== 1)
      out.push(
        `${road.name}: corner ${i - 1} turns ${turn * 45} degrees — ` +
          `every corner must be exactly 45`,
      );
    last = d;
  }
  return out;
}
