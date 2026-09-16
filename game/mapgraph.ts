/**
 * THE MAP GRAPH — a map spec as DATA rather than as a module.
 *
 * `scripts/maps/<id>.mjs` is the map: a few dozen numbers handed to the
 * generator (mindustry.mjs). Those numbers are hand-typed, and the part
 * that is actually hard to author is not the terrain — the generator
 * makes that natural on its own — but the ROOM GRAPH: which clearings
 * exist, which of them a road joins, and how wide. Typing coordinates and
 * rendering a PNG to see what happened is a slow way to find that out.
 *
 * THREE THINGS AND NOTHING ELSE. A graph is ROOMS, ROADS and CHOKES. A
 * room is open ground carved into the rock; a road is open ground carved
 * between two rooms; a choke pinches one. Everything else on the board is
 * rock the generator grows out of noise, which is why a shape asked for
 * here comes back as terrain rather than as a drawing.
 *
 * IT SAYS NOTHING ABOUT WHERE THE SWARM COMES IN. The game paints ONE
 * spawn layer with no kinds on it (maps.ts) and a unit picks its own tiles
 * out of it, so a graph that named drop zones would be modelling a
 * distinction the game stopped making. Spawn tiles are painted onto the
 * generated document afterwards, in the map editor — and a regenerated
 * document loses them, which is the price of keeping the two apart.
 *
 * WHAT IT IS NOT: a second generator. The document this describes is fed
 * to mindustry.mjs unchanged — every rule, every check and every pass
 * stays there, and a graph that will not pass its checks is not a map.
 */

/**
 * A clearing. `water` floods it — a big one is simply sea — and `dry`
 * makes it an island, turning water back to ground inside its outline.
 */
export interface GraphRoom {
  x: number;
  y: number;
  r: number;
  wobble?: number;
  water?: boolean;
  dry?: boolean;
  /** the author's own label for it — carried into the .mjs as a comment */
  note?: string;
}

/** the core's end of a road: rooms are indices, and this is the core */
export const CORE_END = -1;

/**
 * A corridor between two rooms, or between a room and the core. The
 * generator walks an A* between the ends over a cost that prefers ground
 * already open and wanders a little, then brushes a radius down the path
 * that oscillates between `width[0]` and `width[1]` — so a road narrows
 * and widens as it goes, and A BEND IS A ROAD DRAWN THROUGH A SMALL ROOM
 * rather than a curve anyone has to draw.
 *
 * `water` cuts a channel instead of a road: deep down the middle, and the
 * land it crosses becomes a ford the walkers can still use.
 */
export interface GraphRoad {
  /** room indices, or CORE_END for the core */
  ends: [number, number];
  width: [number, number];
  water?: boolean;
}

export interface GraphChoke {
  x: number;
  y: number;
  w: number;
  reach: number;
}

/**
 * A TERM OF THE WATER BIAS, which in a .mjs spec is a closure and here is
 * a tag and some numbers. They SUM: a spec's bias is the total of its
 * terms at that cell, exactly as the hand-written ones add a constant to
 * a list of wells.
 *
 * Positive is DRIER (the bias is added to the noise, and water is where
 * the total falls below the level), which reads backwards until you have
 * done it once.
 */
export type BiasTerm =
  /** the same everywhere — every spec has one, and it is the sea level */
  | { kind: "const"; v: number }
  /** a lake: pulls the water down round a point */
  | { kind: "well"; x: number; y: number; r: number; depth: number }
  /** a sea along one edge, drying inland over `span` cells */
  | { kind: "ramp"; dir: "north" | "south" | "east" | "west"; at: number; span: number; amount: number }
  /**
   * a river: a trough along one axis, optionally leaning as it runs
   * (`skew`) and optionally petering out (`taperAt`/`taperSpan`, where the
   * trough is at full depth up to `taperAt` and gone `taperSpan` past it)
   */
  | {
      kind: "channel";
      axis: "x" | "y";
      at: number;
      width: number;
      depth: number;
      skew?: number;
      taperAt?: number;
      taperSpan?: number;
    }
  /** the inverse of a channel: DRIES away from a line, up to `amount` */
  | { kind: "spread"; axis: "x" | "y"; at: number; span: number; amount: number };

export interface GraphFamily {
  floor: number;
  wall: number;
  weight: number;
}

export interface GraphSpec {
  id: string;
  name: string;
  seed: number;
  /** what the map is FOR — one of the eight (docs/mission-design.md) */
  archetype?: string;
  /** the author's own note, carried into the .mjs header */
  blurb?: string;
  rock: { threshold: number; scale: number; warp: number };
  water: {
    scale: number;
    level: number;
    shore: number;
    warp?: number;
    bias: BiasTerm[];
    shallow?: number;
    deep?: number;
  };
  floors: { scale: number; warp: number; families: GraphFamily[] };
  beach?: { floor: number; wall?: number; depth: number };
  flats?: { floor: number; clear: number };
  forest?: { kind: number; on: number[]; threshold: number; depth: number };
  rooms: GraphRoom[];
  core: { x: number; y: number; r: number };
  roads: GraphRoad[];
  chokes: GraphChoke[];
  funnel?: { x: number; y: number; r: number };
  holes: number;
  lumps: number;
  ruins: number;
}

/** the authored board every spec is written on — mindustry.mjs scales it */
export const AUTHORED = 256;

/** an empty board to start an author off: a core and one clearing on a road */
export function blankSpec(id = "untitled"): GraphSpec {
  return {
    id,
    name: id.replace(/(^|-)(\w)/g, (_, d: string, c: string) => (d ? " " : "") + c.toUpperCase()),
    seed: 0x1000 + ((Math.random() * 0xefff) | 0),
    rock: { threshold: 0.44, scale: 23, warp: 13 },
    water: { scale: 58, level: 0.3, shore: 0.07, bias: [{ kind: "const", v: 0.16 }] },
    floors: {
      scale: 36,
      warp: 12,
      families: [
        { floor: 0, wall: 0, weight: 0.55 },
        { floor: 6, wall: 2, weight: 0.3 },
        { floor: 3, wall: 0, weight: 0.15 },
      ],
    },
    rooms: [{ x: 128, y: 128, r: 16, note: "the middle" }],
    core: { x: 32, y: 128, r: 9 },
    roads: [{ ends: [0, CORE_END], width: [8, 14] }],
    chokes: [],
    holes: 4,
    lumps: 12,
    ruins: 2,
  };
}

/**
 * THE GRAPH AS THE GENERATOR'S OWN SPEC SHAPE, bias closure aside.
 *
 * Two translations happen here and nowhere else:
 *
 * - THE CORE BECOMES A ROOM, appended after the author's. The generator
 *   names rooms by index in a link and there is no index for the core, so
 *   a road drawn to the core is a link to a room standing where the core
 *   stands. The core already clears its own ground, so the extra room
 *   carves nothing that was not carved anyway.
 * - THERE ARE NO SPAWNS AND NO ROUTES. Every road is a `link`, which the
 *   generator carves exactly as it carves a route. Its checks read the
 *   FINISHED TERRAIN rather than the spec, so all that is lost is the
 *   per-zone reachability report — and a graph with no zones in it has
 *   nothing to say about that anyway.
 */
export function graphSpecShape(g: GraphSpec): Record<string, unknown> {
  const coreRoom = g.rooms.length; // the core's index once appended
  const end = (v: number) => (v === CORE_END ? coreRoom : v);
  const out: Record<string, unknown> = {
    id: g.id,
    name: g.name,
    seed: g.seed,
    rock: { ...g.rock },
    floors: g.floors,
    rooms: [
      ...g.rooms.map(({ note: _note, ...r }) => r),
      { x: g.core.x, y: g.core.y, r: g.core.r, wobble: 0.2 },
    ],
    core: g.core,
    spawns: [],
    routes: [],
    links: g.roads.map((r) => ({
      rooms: [end(r.ends[0]), end(r.ends[1])],
      width: r.width,
      ...(r.water ? { layer: "water" as const } : {}),
    })),
    chokes: g.chokes,
    holes: g.holes,
    lumps: g.lumps,
    ruins: g.ruins,
  };
  if (g.beach) out.beach = g.beach;
  if (g.flats) out.flats = g.flats;
  if (g.forest) out.forest = g.forest;
  if (g.funnel) out.funnel = g.funnel;
  return out;
}

// ---------- emitting the .mjs ----------

const num = (v: number): string =>
  Number.isInteger(v) ? String(v) : String(+v.toFixed(4));

const pair = (w: [number, number]): string => `[${num(w[0])}, ${num(w[1])}]`;

/** one bias term as the expression a .mjs spec writes for it */
function biasSource(t: BiasTerm): string {
  switch (t.kind) {
    case "const":
      return num(t.v);
    case "well":
      return `well(${num(t.x)}, ${num(t.y)}, ${num(t.r)}, ${num(t.depth)})(x, y)`;
    case "ramp": {
      // the coordinate that grows INLAND from the named edge
      const c =
        t.dir === "north" ? "y" : t.dir === "south" ? `(${AUTHORED - 1} - y)` :
        t.dir === "west" ? "x" : `(${AUTHORED - 1} - x)`;
      return `Math.max(0, Math.min(1, (${c} - ${num(t.at)}) / ${num(t.span)})) * ${num(t.amount)}`;
    }
    case "channel": {
      const c = t.axis === "x" ? "x" : "y";
      const other = t.axis === "x" ? "y" : "x";
      const centre = t.skew ? `(${num(t.at)} + (${other} - 128) * ${num(t.skew)})` : num(t.at);
      const taper =
        t.taperAt != null && t.taperSpan
          ? ` * Math.max(0, Math.min(1, (${num(t.taperAt)} - ${other}) / ${num(t.taperSpan)}))`
          : "";
      return `-${num(t.depth)} * Math.exp(-((${c} - ${centre}) ** 2) / (2 * ${num(t.width)} * ${num(t.width)}))${taper}`;
    }
    case "spread": {
      const c = t.axis === "x" ? "x" : "y";
      return `Math.min(${num(t.amount)}, (Math.abs(${c} - ${num(t.at)}) / ${num(t.span)}) * ${num(t.amount)})`;
    }
  }
}

/**
 * THE SPEC AS ITS OWN FILE. `names` maps a tile index to the constant
 * mindustry.mjs exports for it, so the emitted source reads the way a
 * hand-written spec does rather than in raw indices — the caller builds
 * it off the generator's own exports, which is the only place those
 * numbers and those names are known to agree.
 */
export function specSource(s: GraphSpec, names: Record<number, string>): string {
  const tile = (v: number, kind: "floor" | "wall"): string =>
    names[kind === "floor" ? v : v + 1000] ?? String(v);
  const used = new Set<string>();
  const floorName = (v: number): string => {
    const n = tile(v, "floor");
    if (n.startsWith("FLOOR_")) used.add(n);
    return n;
  };
  const wallName = (v: number): string => {
    const n = tile(v, "wall");
    if (n.startsWith("WALL_")) used.add(n);
    return n;
  };

  // THE CORE IS A ROOM TOO, last, so a road can name it (graphSpecShape)
  const coreRoom = s.rooms.length;
  const rooms = [
    ...s.rooms.map((r, i) => {
      const bits = [`x: ${num(r.x)}`, `y: ${num(r.y)}`, `r: ${num(r.r)}`];
      if (r.wobble != null) bits.push(`wobble: ${num(r.wobble)}`);
      if (r.water) bits.push("water: true");
      if (r.dry) bits.push("dry: true");
      return `    { ${bits.join(", ")} }, // ${i}${r.note ? ` ${r.note}` : ""}`;
    }),
    `    { x: ${num(s.core.x)}, y: ${num(s.core.y)}, r: ${num(s.core.r)}, wobble: 0.2 }, // ${coreRoom} the core's own ground`,
  ].join("\n");

  const roads = s.roads
    .map((r) => {
      const a = r.ends[0] === CORE_END ? coreRoom : r.ends[0];
      const b = r.ends[1] === CORE_END ? coreRoom : r.ends[1];
      const layer = r.water ? `, layer: "water"` : "";
      return `    { rooms: [${a}, ${b}], width: ${pair(r.width)}${layer} },`;
    })
    .join("\n");

  const chokes = s.chokes
    .map((c) => `{ x: ${num(c.x)}, y: ${num(c.y)}, w: ${num(c.w)}, reach: ${num(c.reach)} }`)
    .join(", ");

  const families = s.floors.families
    .map((f) => `      { floor: ${floorName(f.floor)}, wall: ${wallName(f.wall)}, weight: ${num(f.weight)} },`)
    .join("\n");

  const bias = s.water.bias.map(biasSource).join(" + ");
  const needsWell = s.water.bias.some((t) => t.kind === "well");
  const waterBits = [
    `scale: ${num(s.water.scale)}`,
    `level: ${num(s.water.level)}`,
    `shore: ${num(s.water.shore)}`,
  ];
  if (s.water.warp != null) waterBits.push(`warp: ${num(s.water.warp)}`);
  if (s.water.shallow != null) waterBits.push(`shallow: ${floorName(s.water.shallow)}`);
  if (s.water.deep != null) waterBits.push(`deep: ${floorName(s.water.deep)}`);
  waterBits.push(`bias: (x, y) => ${bias || "0"}`);

  const tail: string[] = [];
  if (s.beach) {
    const b = [`floor: ${floorName(s.beach.floor)}`];
    if (s.beach.wall != null) b.push(`wall: ${wallName(s.beach.wall)}`);
    b.push(`depth: ${num(s.beach.depth)}`);
    tail.push(`  beach: { ${b.join(", ")} },`);
  }
  if (s.flats) tail.push(`  flats: { floor: ${floorName(s.flats.floor)}, clear: ${num(s.flats.clear)} },`);

  const forest = s.forest
    ? `  forest: { kind: ${s.forest.kind}, on: [${s.forest.on.map(floorName).join(", ")}], threshold: ${num(s.forest.threshold)}, depth: ${num(s.forest.depth)} },\n`
    : "";
  const funnel = s.funnel
    ? `  funnel: { x: ${num(s.funnel.x)}, y: ${num(s.funnel.y)}, r: ${num(s.funnel.r)} },\n`
    : "";

  const imports = ["run", ...[...used].sort()];
  const wrapped: string[] = [];
  let line = "";
  for (const n of imports) {
    if (line.length + n.length + 2 > 70) {
      wrapped.push(line);
      line = "";
    }
    line += (line ? ", " : "") + n;
  }
  if (line) wrapped.push(line);

  const wellDecl = needsWell
    ? "\n/** a lake: pulls the water noise down round a point */\nconst well = (cx, cy, r, depth) => (x, y) =>\n  -depth * Math.exp(-((x - cx) ** 2 + (y - cy) ** 2) / (2 * r * r));\n"
    : "";

  return `/**
 * ${s.name}${s.blurb ? ` — ${s.blurb}` : ""}
 *
 *   node scripts/maps/${s.id}.mjs [out.json] [preview.png]
 *
${s.archetype ? ` * MISSION ARCHETYPE: ${s.archetype} (docs/mission-design.md).\n *\n` : ""} * WRITTEN BY THE GRAPH EDITOR (/admin/mapgraph). The graph it was drawn
 * from is scripts/maps/graphs/${s.id}.json — edit there and re-emit, or
 * edit the numbers here and the two drift apart.
 *
 * IT PAINTS NO SPAWN TILES. A graph says where the ground is and nothing
 * about where the swarm enters it, so the document this writes carries no
 * drop zones and the tiles are painted onto it in the map editor
 * afterwards. RE-RUNNING THIS FILE OVERWRITES THE DOCUMENT and takes them
 * with it. The pipeline and every rule are in mindustry.mjs; this file is
 * the numbers.
 */
import {
${wrapped.map((l) => `  ${l},`).join("\n")}
} from "./mindustry.mjs";
${wellDecl}
export const spec = {
  id: "${s.id}",
  name: "${s.name}",
  seed: 0x${s.seed.toString(16)},
  rock: { threshold: ${num(s.rock.threshold)}, scale: ${num(s.rock.scale)}, warp: ${num(s.rock.warp)} },
  water: {
    ${waterBits.join(",\n    ")},
  },
  floors: {
    scale: ${num(s.floors.scale)}, warp: ${num(s.floors.warp)},
    families: [
${families}
    ],
  },
${tail.join("\n")}${tail.length ? "\n" : ""}  rooms: [${rooms ? `
${rooms}
  ` : ""}],
  core: { x: ${num(s.core.x)}, y: ${num(s.core.y)}, r: ${num(s.core.r)} },
  spawns: [],
  routes: [],
  links: [${roads ? `
${roads}
  ` : ""}],
  chokes: [${chokes}],
${funnel}${forest}  holes: ${s.holes}, lumps: ${s.lumps}, ruins: ${s.ruins},
};

run(spec);
`;
}
