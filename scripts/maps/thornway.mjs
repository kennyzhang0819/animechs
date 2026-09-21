/**
 * Thornway
 *
 *   node scripts/maps/thornway.mjs [out.json] [preview.png]
 *
 * MISSION ARCHETYPE: ESCORT THE CROSSER (docs/mission-design.md).
 *
 * WRITTEN BY THE GRAPH EDITOR (/admin/mapgraph). The graph it was drawn
 * from is scripts/maps/graphs/thornway.json — edit there and re-emit, or
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
  run, FLOOR_DIRT, FLOOR_GRASS, FLOOR_MOSS, WALL_DIRT, WALL_SPORE,
  WALL_STONE,
} from "./mapgen.mjs";

export const spec = {
  id: "thornway",
  name: "Thornway",
  seed: 0x7407,
  rock: { threshold: 0.3, scale: 23, warp: 13 },
  water: {
    scale: 58,
    level: 0.3,
    shore: 0.07,
    bias: (x, y) => 0.5,
  },
  floors: {
    scale: 36, warp: 13,
    families: [
      { floor: FLOOR_GRASS, wall: WALL_STONE, weight: 0.56 },
      { floor: FLOOR_DIRT, wall: WALL_DIRT, weight: 0.3 },
      { floor: FLOOR_MOSS, wall: WALL_SPORE, weight: 0.14 },
    ],
  },
  rooms: [
    { x: 37, y: 224, r: 30 }, // 0
    { x: 128, y: 226, r: 8 }, // 1
    { x: 212, y: 200, r: 20 }, // 2
    { x: 198, y: 139, r: 8 }, // 3
    { x: 121, y: 144, r: 16 }, // 4
    { x: 61, y: 117, r: 8 }, // 5
    { x: 64, y: 53, r: 20 }, // 6
    { x: 122, y: 28, r: 8 }, // 7
    { x: 193, y: 32, r: 10 }, // 8
    { x: 168, y: 18, r: 15 }, // 9 ground entry
    { x: 243, y: 16, r: 30 }, // 10
    { x: 183, y: 84, r: 22, water: true }, // 11
    { x: 10, y: 45, r: 20 }, // 12
    { x: 244, y: 123, r: 22 }, // 13
    { x: 178, y: 247, r: 22, water: true }, // 14
    { x: 164, y: 223, r: 6, water: true }, // 15
    { x: 142, y: 84, r: 24, water: true }, // 16
    { x: 4, y: 129, r: 20, water: true }, // 17
    { x: 222, y: 56, r: 12, water: true }, // 18
    { x: 30, y: 222, r: 9, wobble: 0.2 }, // 19 the core's own ground
  ],
  core: { x: 30, y: 222, r: 9 },
  spawns: [],
  routes: [],
  links: [
    { rooms: [0, 1], width: [14, 18] },
    { rooms: [1, 2], width: [14, 18] },
    { rooms: [2, 3], width: [14, 18] },
    { rooms: [3, 4], width: [14, 18] },
    { rooms: [4, 5], width: [14, 18] },
    { rooms: [5, 6], width: [14, 18] },
    { rooms: [6, 7], width: [14, 18] },
    { rooms: [7, 8], width: [14, 18] },
    { rooms: [8, 10], width: [8, 12] },
    { rooms: [12, 6], width: [8, 12] },
    { rooms: [13, 3], width: [8, 12] },
    { rooms: [16, 11], width: [15, 21], layer: "water" },
    { rooms: [11, 18], width: [13, 20], layer: "water" },
  ],
  chokes: [],
  funnel: { x: 44, y: 220, r: 8 },
  holes: 2, lumps: 3, ruins: 2,
};

run(spec);
