/**
 * A MISSION'S GEOMETRY — where its bodies WALK and where they STAND
 * (docs/mission-design.md). Two kinds of thing live here:
 *
 *   ROADS — the hard-coded lines the two ROAD MISSIONS are drawn on, and
 *           most of this file (RoadSpec, ROAD_SPECS, roadsFor, roadAt).
 *   POSTS — the places a mission may PLANT something, at the bottom
 *           (PostSpec, POST_SPECS, postsFor). A road is a line and a post
 *           is a circle, and that is the whole difference.
 *
 * WHAT THEY HAVE IN COMMON IS WHY THEY SHARE A FILE: both are AUTHORED
 * WITH THE TERRAIN and keyed by map id, so a mission's geometry and the
 * ground it was fitted to cannot drift apart without the id changing. The
 * mission itself (levels.ts) only ever names an index into one of these.
 *
 * THREE MISSIONS USE IT. INTERCEPT sends the swarm's Borers across
 * Coldline and asks the board to stop them; ESCORT sends the player's own
 * convoy up Thornway and asks the board to get it through — one road
 * machine for both, because the thing a road IS (a line somebody drew, an
 * arc length along it, a heading at that point) is the same question
 * either way, and a second copy of it would be a second place for a corner
 * to be wrong. RAZE stands railguns round Sear's core and asks the board
 * to go and break them; that one wants no line at all, only places and how
 * far each one reaches.
 *
 * ALL OF IT IS DRAWN ON THE MAP NOW. The roads, the emplacements and the
 * garrison regions are marks on the document, placed in the map editor
 * (missionMarks.ts, docs/mission-marks.md); the tables below are the
 * fallback for a map that carries none, and both are empty.
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
 * THE REASON IS THE RAILS (game/railArt.ts) — no road wears a bed today
 * and the rule is kept because one may again. Where a line is drawn on
 * the ground, it is drawn as tiles, one per cell, and 0/45/90/135 are the only
 * headings a square pixel grid draws exactly: a 45-degree line is one
 * pixel across for one pixel along, so a rail piece is painted once and
 * stamped with a quarter turn, never rotated and never resampled. A road
 * free to bend 37 degrees would need its art turned to match, and a
 * turned pixel sprite is a blurred one. The maps were moved to fit the
 * lines rather than the other way about — which is also why these three
 * came out with FEWER corners than the hand-fitted ones they replace
 * (Coldline's south went from nine to six) instead of more.
 *
 * THE LATTICE HOLDS FOR EVERY ROAD, bed or no bed. Coldline's two carry
 * no rail today (ROAD_SPECS) and the rule still binds them: a corner is
 * also a kink in seventy tiles of train, and the terrain along them was
 * cut to the lattice's corridor (railbed.mjs) and stays cut to it.
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
import type { LevelSpec, RazeSection, UnitKind } from "./levels";
import { markKind, markOpts, parseWaves, type MapMark } from "./missionMarks";
import { RAIL_DIRS, RAIL_PIECES, railStyleIndex, type RailStyleName } from "./railArt";

/** the shortest straight run a road may carry, in cells: a bend's tile
 *  covers the three cells around its corner, so two corners closer than
 *  this would each paint over the other's */
export const MIN_RUN = 3;

/** one road, as authored: a name for the panel and a line in cells */
export interface RoadSpec {
  /** what the objective panel calls it — the player's word for this line */
  name: string;
  /**
   * WHICH RAILWAY IT IS LAID AS (railArt.ts RAIL_STYLES). The shapes are
   * the lattice's and never vary; this is the gauge, the sleepers and
   * what the bed is made of. It is per ROAD rather than per map because
   * the thing it says — whose line is this — is a fact about the mission,
   * the same fact the overlay says in red or amber (game.ts ROAD_MINE).
   *
   * OMITTED IS A ROAD WITH NO BED AT ALL: the line is still walked and
   * still drawn by the overlay, but nothing is painted on the ground.
   * EVERY ROAD ON THE BOARD TODAY IS LAID THAT WAY — the railway art is
   * kept (railArt.ts) and nothing uses it.
   */
  rail?: RailStyleName;
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
 * THE ROADS, BY MAP — EMPTY, AND KEPT. Every road on the board today is
 * drawn on its map instead: a `road` mark on the document
 * (missionMarks.ts, docs/mission-marks.md), placed and dragged in the map
 * editor, which is where a line fitted to terrain belongs. This is the
 * fallback for a map that carries none, and the reason RoadSpec is still
 * a type. Coldline's two lines and Thornway's one lived here until the
 * editor learned to draw them.
 *
 * THE ORDER IS THE MISSION'S EITHER WAY: the pattern in levels.ts names
 * roads by index, so the first road on the document is road 0. On
 * Coldline that is the south line — where y grows DOWNWARD, the south
 * road is the one along the bottom, and "bottom, top, both" is the
 * sequence read off the screen.
 */
export const ROAD_SPECS: Record<string, readonly RoadSpec[]> = {};

const BUILT = new Map<string, readonly Road[]>();
/** roads built off a document's marks, kept per marks array (roadsFor) */
const FROM_MARKS = new WeakMap<object, readonly Road[]>();

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
export function roadsFor(mapId: string | undefined, marks?: readonly MapMark[]): readonly Road[] {
  // THE MAP'S OWN LINES FIRST. Cached on the marks array rather than on
  // the id because that array is the document's, built once per load, and
  // this is called every frame by the overlay (game.ts drawMissionRoads)
  if (marks && marks.length > 0) {
    const had = FROM_MARKS.get(marks);
    if (had) return had;
    const specs = roadSpecsFromMarks(marks);
    if (specs.length > 0) {
      const built = specs.map(build);
      FROM_MARKS.set(marks, built);
      return built;
    }
  }
  if (!mapId) return [];
  const had = BUILT.get(mapId);
  if (had) return had;
  const spec = ROAD_SPECS[mapId];
  if (!spec) return [];
  const built = spec.map(build);
  BUILT.set(mapId, built);
  return built;
}

/** the road marks on a document, in order, as the specs they stand for */
export function roadSpecsFromMarks(marks: readonly MapMark[]): RoadSpec[] {
  const kind = markKind("road");
  if (!kind) return [];
  const out: RoadSpec[] = [];
  for (const m of marks) {
    if (m.kind !== "road" || !m.pts || m.pts.length < 2) continue;
    const o = markOpts(kind, m.opts);
    out.push({ name: String(o.name), cells: m.pts.map((p) => [p[0], p[1]] as const) });
  }
  return out;
}

/**
 * WHAT IS WRONG WITH A LINE, in cells — roadProblems' answer, asked of the
 * corners rather than of a built Road, so the editor can say it while an
 * author is still dragging. Empty means the lattice holds.
 */
export function pathProblems(cells: readonly (readonly [number, number])[]): string[] {
  const out: string[] = [];
  if (cells.length < 2) return ["a road needs two corners"];
  for (let i = 1; i < cells.length; i++) {
    const dx = cells[i][0] - cells[i - 1][0], dy = cells[i][1] - cells[i - 1][1];
    const ax = Math.abs(dx), ay = Math.abs(dy);
    if (!(ax === 0 || ay === 0 || ax === ay)) out.push(`leg ${i} runs ${dx},${dy} — off the lattice`);
    else if (Math.max(ax, ay) < MIN_RUN) out.push(`leg ${i} is ${Math.max(ax, ay)} cells, under ${MIN_RUN}`);
  }
  for (let i = 1; i < cells.length - 1; i++)
    if (cells[i][0] < 0 || cells[i][1] < 0 || cells[i][0] >= COLS || cells[i][1] >= ROWS)
      out.push(`corner ${i} is off the board`);
  return out;
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

/** one painted cell of rail bed — which painting, and how far round */
export interface RailTile {
  /** the cell the piece is centred on; it covers RAIL_SPAN cells square */
  x: number;
  y: number;
  /** an index into railArt RAIL_STYLES: which railway this is */
  style: number;
  /** an index into railArt RAIL_PIECES: which shape of it */
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
    if (!spec.rail) continue;
    const style = railStyleIndex(spec.rail);
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
      out.push({ x, y, style, piece: pick[0], rot: pick[1] });
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

/**
 * A POST: a place a mission may plant something on, in map cells.
 *
 * IT IS THE ROAD'S OPPOSITE NUMBER. A road is where a body WALKS and a
 * post is where a body STANDS, and the raze mission is built out of posts
 * the way the two crossing missions are built out of roads: authored with
 * the terrain, indexed from the mission's own schedule (levels.ts
 * RazeMission.sections), and on the board from the first frame so the
 * player can price a position against it before anything is standing
 * there (Game.drawMissionPosts).
 *
 * `radius` IS TWO THINGS AT ONCE and that is deliberate. It is how wide
 * the section is laid out — the emplacements are rung around the centre
 * inside it, and the garrison inside them — and it is the LEASH the
 * garrison is held to (Sim.garrisonUnit): a Warden posted here will cross
 * the circle to get at a turret standing in it and will never take a step
 * outside. One number, so what the player sees drawn on the board is
 * exactly the ground the guards contest, and there is no second radius to
 * disagree with the first.
 */
export interface PostSpec {
  /** what the objective panel and the board overlay call it */
  name: string;
  /** the centre, in map cells */
  cell: readonly [number, number];
  /** how far the section reaches, in cells — the layout AND the leash */
  radius: number;
}

/** one post, ready to use: the same place in world px */
export interface Post {
  name: string;
  x: number;
  y: number;
  /** the radius in world px */
  r: number;
}

/**
 * THE POSTS, BY MAP — EMPTY, AND KEPT. Every siege on the board today is
 * authored on its map instead (missionMarks.ts BATTERY, siegeFromMarks
 * below), which is where a place belongs; this is the fallback for a raze
 * map that carries no battery marks, and the reason a mission spec's own
 * `sections` still mean something. Crater's four lived here until the map
 * was deleted.
 */
export const POST_SPECS: Record<string, readonly PostSpec[]> = {};

const POSTS = new Map<string, readonly Post[]>();

/**
 * THE POSTS THIS MAP CARRIES, or an empty list — roadsFor's opposite
 * number, and built the same way and for the same reason: the id is the
 * level's own `map` field, so a post list and the terrain it stands on
 * cannot drift apart without the id changing.
 */
export function postsFor(mapId: string | undefined): readonly Post[] {
  if (!mapId) return [];
  const had = POSTS.get(mapId);
  if (had) return had;
  const spec = POST_SPECS[mapId];
  if (!spec) return [];
  const built = spec.map((p) => ({
    name: p.name,
    x: (p.cell[0] + 0.5) * CELL,
    y: (p.cell[1] + 0.5) * CELL,
    r: p.radius * CELL,
  }));
  POSTS.set(mapId, built);
  return built;
}

/**
 * THE SIEGE AN AUTHOR PLACED, or null where the map carries no railguns
 * (missionMarks.ts RAILGUN, docs/mission-marks.md).
 *
 * TWO LISTS, BECAUSE THE MAP SAYS TWO THINGS. `spots` is every
 * emplacement, on the cell it was put on; `sections` is one per RISING,
 * and exists so that everything counting the siege off the mission spec
 * still counts it right (levels.ts razeGuns, missionText, missionProgress).
 *
 * THE GARRISONS ARE NOT IN HERE. A garrison is a fact about a place and
 * not about this mission (garrisonsFrom below), so a siege no longer owns
 * the ground round its guns — an author draws that separately, on any map.
 *
 * IT IS THE MAP'S ANSWER TO A QUESTION THE MISSION ASKS. RazeMission
 * still owns the clock (first, every) and the marks own the places and
 * the counts, which is the same split the intercept's roads and buff
 * towers already run on.
 */
export interface MarkSiege {
  sections: RazeSection[];
  /** one emplacement, in world px, and the rising it belongs to */
  spots: { x: number; y: number; wave: number }[];
}

/** the siege a document carries, worked out once per marks array — the
 *  overlay asks every frame (game.ts drawMissionPosts) */
const SIEGE = new WeakMap<object, MarkSiege | null>();
export function siegeFor(marks: readonly MapMark[]): MarkSiege | null {
  if (SIEGE.has(marks)) return SIEGE.get(marks) ?? null;
  const built = siegeFromMarks(marks);
  SIEGE.set(marks, built);
  return built;
}

export function siegeFromMarks(marks: readonly MapMark[]): MarkSiege | null {
  const gunKind = markKind("railgun");
  if (!gunKind) return null;
  const spots: MarkSiege["spots"] = [];
  const half = (gunKind.size * CELL) / 2;
  for (const m of marks) {
    if (m.kind !== "railgun") continue;
    const o = markOpts(gunKind, m.opts);
    spots.push({ x: m.x * CELL + half, y: m.y * CELL + half, wave: Number(o.wave) });
  }
  if (spots.length === 0) return null;
  // ONE SECTION A RISING: a wave with three guns in it is one line on the
  // panel and one tick of the clock. `post` is meaningless here and named
  // 0 — nothing reads it except the POST_SPECS fallback, which has no marks
  const waves = [...new Set(spots.map((g) => g.wave))].sort((a, b) => a - b);
  const sections: RazeSection[] = waves.map((wave) => ({
    post: 0,
    guns: spots.filter((g) => g.wave === wave).length,
    wave,
    guards: {},
  }));
  return { sections, spots };
}

/**
 * THE GARRISONS A DOCUMENT CARRIES — a circle of ground, the waves it is
 * manned on, and what mans it (missionMarks.ts GARRISON). Every mission
 * reads these and so does a map under no mission at all: what they say is
 * "there is a force dug in here", which is a fact about the board.
 */
export interface MarkGarrison {
  post: Post;
  waves: number[];
  guards: Partial<Record<UnitKind, number>>;
  /** the kinds in `guards`, which is what says whether one still HOLDS its
   *  ground: a wave walking through the circle is not holding it */
  kinds: UnitKind[];
}
const GARRISONS = new WeakMap<object, readonly MarkGarrison[]>();
export function garrisonsFor(marks: readonly MapMark[] | undefined): readonly MarkGarrison[] {
  if (!marks || marks.length === 0) return [];
  const had = GARRISONS.get(marks);
  if (had) return had;
  const kind = markKind("garrison");
  const out: MarkGarrison[] = [];
  const half = kind ? (kind.size * CELL) / 2 : 0;
  for (const m of marks) {
    if (!kind || m.kind !== "garrison") continue;
    const o = markOpts(kind, m.opts);
    const waves = parseWaves(o.waves as string);
    const guards: Partial<Record<UnitKind, number>> = {};
    if (Number(o.bulwark) > 0) guards.bulwark = Number(o.bulwark);
    if (Number(o.lance) > 0) guards.lance = Number(o.lance);
    if (waves.length === 0 || Object.keys(guards).length === 0) continue;
    out.push({
      post: {
        name: `Garrison ${out.length + 1}`,
        x: m.x * CELL + half,
        y: m.y * CELL + half,
        r: Number(o.radius) * CELL,
      },
      waves,
      guards,
      kinds: Object.keys(guards) as UnitKind[],
    });
  }
  GARRISONS.set(marks, out);
  return out;
}

/**
 * THE LEVEL AS THE MAP MAKES IT — a raze whose map carries batteries is
 * played on those and not on the sections written in levels.ts.
 *
 * BOTH SIDES OF THE SEAM CALL IT, on the same document (Sim.reset and
 * simreads.ts World), because everything that counts the siege counts it
 * off `level.mission` (levels.ts razeGuns, missionText, missionProgress)
 * and the two halves must not disagree about how many guns there are.
 */
export function levelWithMarks(level: LevelSpec, marks: readonly MapMark[]): LevelSpec {
  if (level.mission.kind !== "raze") return level;
  const siege = siegeFromMarks(marks);
  if (!siege) return level;
  return { ...level, mission: { ...level.mission, sections: siege.sections } };
}

/** Does this post stand on the board at all? The same cheapest-possible
 *  gate roadProblems is — a section rung round a centre off the rim would
 *  put half its emplacements somewhere nothing can reach */
export function postProblems(post: Post): string[] {
  const out: string[] = [];
  if (post.x - post.r < 0 || post.y - post.r < 0 || post.x + post.r > COLS * CELL || post.y + post.r > ROWS * CELL)
    out.push(`${post.name}: a post at (${Math.round(post.x / CELL)}, ${Math.round(post.y / CELL)}) reaches off the board`);
  if (post.r <= 0) out.push(`${post.name}: a post of no radius`);
  return out;
}
