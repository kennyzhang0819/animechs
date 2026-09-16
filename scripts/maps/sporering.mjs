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
 * with it. The pipeline and every rule are in mindustry.mjs; this file is
 * the numbers.
 */
import {
  run, FLOOR_DEEP_TAINTED_WATER, FLOOR_MOSS, FLOOR_MUD, FLOOR_SHALE,
  FLOOR_SPORE_MOSS, FLOOR_TAINTED_WATER, WALL_DUNE, WALL_SHALE,
  WALL_SPORE,
} from "./mindustry.mjs";

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
    { x: 66, y: 128, r: 11 }, // 3
    { x: 190, y: 128, r: 11 }, // 4
    { x: 78, y: 78, r: 11 }, // 5
    { x: 178, y: 178, r: 11 }, // 6
    { x: 74, y: 196, r: 14 }, // 7
    { x: 196, y: 68, r: 14 }, // 8
    { x: 208, y: 210, r: 14 }, // 9
    { x: 108, y: 172, r: 9, water: true }, // 10
    { x: 128, y: 16, r: 15 }, // 11 ground entry
    { x: 128, y: 240, r: 15 }, // 12 ground entry
    { x: 16, y: 128, r: 15 }, // 13 ground entry
    { x: 240, y: 128, r: 15 }, // 14 ground entry
    { x: 38, y: 38, r: 15 }, // 15 ground entry
    { x: 218, y: 218, r: 15 }, // 16 ground entry
    { x: 18, y: 176, r: 12, water: true }, // 17 water entry
    { x: 238, y: 176, r: 12, water: true }, // 18 water entry
    { x: 126, y: 126, r: 10, wobble: 0.2 }, // 19 the core's own ground
  ],
  core: { x: 126, y: 126, r: 10 },
  spawns: [],
  routes: [],
  links: [
    { rooms: [17, 10], width: [17, 23], layer: "water" },
    { rooms: [18, 10], width: [17, 23], layer: "water" },
    { rooms: [11, 1], width: [8, 14] },
    { rooms: [1, 19], width: [8, 14] },
    { rooms: [12, 2], width: [8, 14] },
    { rooms: [2, 19], width: [8, 14] },
    { rooms: [13, 3], width: [8, 14] },
    { rooms: [3, 19], width: [8, 14] },
    { rooms: [14, 4], width: [8, 14] },
    { rooms: [4, 19], width: [8, 14] },
    { rooms: [15, 5], width: [8, 14] },
    { rooms: [5, 19], width: [8, 14] },
    { rooms: [16, 6], width: [8, 14] },
    { rooms: [6, 19], width: [8, 14] },
    { rooms: [1, 5], width: [7, 10] },
    { rooms: [5, 3], width: [7, 10] },
    { rooms: [2, 6], width: [7, 10] },
    { rooms: [6, 4], width: [7, 10] },
    { rooms: [3, 7], width: [6, 9] },
    { rooms: [2, 7], width: [6, 9] },
    { rooms: [4, 8], width: [6, 9] },
    { rooms: [1, 8], width: [6, 9] },
    { rooms: [6, 9], width: [6, 9] },
  ],
  chokes: [{ x: 128, y: 100, w: 10, reach: 7 }, { x: 128, y: 156, w: 10, reach: 7 }, { x: 100, y: 128, w: 10, reach: 7 }, { x: 156, y: 128, w: 10, reach: 7 }],
  holes: 6, lumps: 16, ruins: 2, coreWaterReach: 60,
};

run(spec);
