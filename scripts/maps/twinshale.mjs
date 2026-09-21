/**
 * Twin Shale
 *
 *   node scripts/maps/twinshale.mjs [out.json] [preview.png]
 *
 * MISSION ARCHETYPE: PROTECT THE SECOND THING (docs/mission-design.md).
 *
 * WRITTEN BY THE GRAPH EDITOR (/admin/mapgraph). The graph it was drawn
 * from is scripts/maps/graphs/twinshale.json — edit there and re-emit, or
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
  run, FLOOR_MUD, FLOOR_SHALE, FLOOR_STONE, WALL_DUNE, WALL_SHALE,
  WALL_STONE,
} from "./mapgen.mjs";

export const spec = {
  id: "twinshale",
  name: "Twin Shale",
  seed: 0x7015,
  rock: { threshold: 0.44, scale: 23, warp: 13 },
  water: {
    scale: 46,
    level: 0.36,
    shore: 0.09,
    warp: 18,
    bias: (x, y) => 0.16 + -0.34 * Math.exp(-((x - (128 + (y - 128) * 0.12)) ** 2) / (2 * 15 * 15)) * Math.max(0, Math.min(1, (200 - y) / 60)),
  },
  floors: {
    scale: 34, warp: 13,
    families: [
      { floor: FLOOR_SHALE, wall: WALL_SHALE, weight: 0.48 },
      { floor: FLOOR_MUD, wall: WALL_DUNE, weight: 0.28 },
      { floor: FLOOR_STONE, wall: WALL_STONE, weight: 0.24 },
    ],
  },
  beach: { floor: FLOOR_MUD, depth: 2 },
  rooms: [
    { x: 128, y: 206, r: 16 }, // 0
    { x: 88, y: 164, r: 13 }, // 1
    { x: 64, y: 112, r: 13 }, // 2
    { x: 56, y: 56, r: 13 }, // 3
    { x: 170, y: 164, r: 13 }, // 4
    { x: 196, y: 110, r: 13 }, // 5
    { x: 204, y: 52, r: 13 }, // 6
    { x: 128, y: 150, r: 10, water: true }, // 7
    { x: 30, y: 20, r: 15 }, // 8 ground entry
    { x: 224, y: 18, r: 15 }, // 9 ground entry
    { x: 18, y: 100, r: 15 }, // 10 ground entry
    { x: 238, y: 98, r: 15 }, // 11 ground entry
    { x: 128, y: 16, r: 12, water: true }, // 12 water entry
    { x: 126, y: 232, r: 9, wobble: 0.2 }, // 13 the core's own ground
  ],
  core: { x: 126, y: 232, r: 9 },
  spawns: [],
  routes: [],
  links: [
    { rooms: [12, 7], width: [18, 24], layer: "water" },
    { rooms: [8, 3], width: [8, 14] },
    { rooms: [3, 2], width: [8, 14] },
    { rooms: [2, 1], width: [8, 14] },
    { rooms: [1, 0], width: [8, 14] },
    { rooms: [0, 13], width: [8, 14] },
    { rooms: [10, 2], width: [8, 14] },
    { rooms: [2, 1], width: [8, 14] },
    { rooms: [1, 0], width: [8, 14] },
    { rooms: [0, 13], width: [8, 14] },
    { rooms: [9, 6], width: [8, 14] },
    { rooms: [6, 5], width: [8, 14] },
    { rooms: [5, 4], width: [8, 14] },
    { rooms: [4, 0], width: [8, 14] },
    { rooms: [0, 13], width: [8, 14] },
    { rooms: [11, 5], width: [8, 14] },
    { rooms: [5, 4], width: [8, 14] },
    { rooms: [4, 0], width: [8, 14] },
    { rooms: [0, 13], width: [8, 14] },
    { rooms: [2, 3], width: [6, 9] },
    { rooms: [5, 6], width: [6, 9] },
    { rooms: [1, 2], width: [6, 9] },
    { rooms: [4, 5], width: [6, 9] },
  ],
  chokes: [{ x: 128, y: 222, w: 10, reach: 8 }],
  holes: 4, lumps: 12, ruins: 2,
};

run(spec);
