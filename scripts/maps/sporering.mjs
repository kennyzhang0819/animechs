/**
 * Spore Ring
 *
 *   node scripts/maps/sporering.mjs [out.json] [preview.png]
 *
 * MISSION ARCHETYPE: HOLD REMOTE GROUND (docs/mission-design.md).
 *
 * WRITTEN BY THE GRAPH EDITOR (/admin/mapgraph). The graph it was drawn
 * from is scripts/maps/graphs/sporering.json — edit there and re-emit, or
 * edit the numbers here and the two drift apart.
 *
 * IT PAINTS NO SPAWN TILES. A graph says where the ground is and nothing
 * about where the swarm enters it, so the document this writes carries no
 * drop zones and the tiles are painted onto it in the map editor
 * afterwards. RE-RUNNING THIS FILE OVERWRITES THE DOCUMENT and takes them
 * with it. The pipeline and every rule are in mapgen.mjs; this file is
 * the numbers.
 */
import {
  run, FLOOR_DEEP_TAINTED_WATER, FLOOR_MOSS, FLOOR_MUD, FLOOR_SHALE,
  FLOOR_SPORE_MOSS, FLOOR_TAINTED_WATER, WALL_DUNE, WALL_SHALE,
  WALL_SPORE,
} from "./mapgen.mjs";

/** a lake: pulls the water noise down round a point */
const well = (cx, cy, r, depth) => (x, y) =>
  -depth * Math.exp(-((x - cx) ** 2 + (y - cy) ** 2) / (2 * r * r));

export const spec = {
  id: "sporering",
  name: "Spore Ring",
  seed: 0x5909,
  rock: { threshold: 0.395, scale: 24, warp: 15 },
  water: {
    scale: 50,
    level: 0.34,
    shore: 0.09,
    warp: 20,
    shallow: FLOOR_TAINTED_WATER,
    deep: FLOOR_DEEP_TAINTED_WATER,
    bias: (x, y) => 0.1 + well(128, 128, 40, -0.14)(x, y),
  },
  floors: {
    scale: 34, warp: 14,
    families: [
      { floor: FLOOR_MOSS, wall: WALL_SPORE, weight: 0.46 },
      { floor: FLOOR_SPORE_MOSS, wall: WALL_SPORE, weight: 0.24 },
      { floor: FLOOR_MUD, wall: WALL_DUNE, weight: 0.18 },
      { floor: FLOOR_SHALE, wall: WALL_SHALE, weight: 0.12 },
    ],
  },
  beach: { floor: FLOOR_MUD, depth: 2 },
  flats: { floor: FLOOR_MUD, clear: 11 },
  rooms: [
    { x: 128, y: 128, r: 22, wobble: 0.22 }, // 0
    { x: 128, y: 66, r: 11 }, // 1
    { x: 128, y: 190, r: 11 }, // 2
    { x: 190, y: 128, r: 11 }, // 3
    { x: 75, y: 75, r: 11 }, // 4
    { x: 178, y: 178, r: 11 }, // 5
    { x: 80, y: 186, r: 14 }, // 6
    { x: 189, y: 73, r: 14 }, // 7
    { x: 209, y: 214, r: 14 }, // 8
    { x: 72, y: 129, r: 14, water: true }, // 9
    { x: 128, y: 16, r: 15 }, // 10 ground entry
    { x: 128, y: 240, r: 15 }, // 11 ground entry
    { x: 240, y: 128, r: 15 }, // 12 ground entry
    { x: 38, y: 38, r: 15 }, // 13 ground entry
    { x: 16, y: 130, r: 21, water: true }, // 14 water entry
    { x: 37, y: 231, r: 21, water: true }, // 15
    { x: 228, y: 27, r: 22 }, // 16
    { x: 234, y: 189, r: 16 }, // 17
    { x: 26, y: 72, r: 16 }, // 18
    { x: 84, y: 24, r: 17 }, // 19
    { x: 126, y: 126, r: 10, wobble: 0.2 }, // 20 the core's own ground
  ],
  core: { x: 126, y: 126, r: 10 },
  spawns: [],
  routes: [],
  links: [
    { rooms: [14, 9], width: [17, 23], layer: "water" },
    { rooms: [10, 1], width: [8, 14] },
    { rooms: [1, 20], width: [8, 14] },
    { rooms: [11, 2], width: [8, 14] },
    { rooms: [2, 20], width: [8, 14] },
    { rooms: [12, 3], width: [8, 14] },
    { rooms: [3, 20], width: [8, 14] },
    { rooms: [13, 4], width: [8, 14] },
    { rooms: [1, 4], width: [7, 10] },
    { rooms: [2, 5], width: [7, 10] },
    { rooms: [5, 3], width: [7, 10] },
    { rooms: [2, 6], width: [6, 9] },
    { rooms: [3, 7], width: [6, 9] },
    { rooms: [1, 7], width: [6, 9] },
    { rooms: [5, 8], width: [6, 9] },
    { rooms: [4, 9], width: [8, 12], layer: "water" },
    { rooms: [9, 0], width: [8, 12], layer: "water" },
    { rooms: [6, 9], width: [8, 12], layer: "water" },
    { rooms: [7, 16], width: [8, 12] },
    { rooms: [12, 16], width: [8, 12] },
    { rooms: [15, 6], width: [8, 12], layer: "water" },
  ],
  chokes: [{ x: 128, y: 100, w: 10, reach: 7 }, { x: 128, y: 156, w: 10, reach: 7 }, { x: 100, y: 128, w: 10, reach: 7 }, { x: 156, y: 126, w: 10, reach: 8 }],
  holes: 6, lumps: 10, ruins: 2,
};

run(spec);
