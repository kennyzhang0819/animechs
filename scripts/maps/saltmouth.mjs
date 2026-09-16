/**
 * Saltmouth
 *
 *   node scripts/maps/saltmouth.mjs [out.json] [preview.png]
 *
 * MISSION ARCHETYPE: PICK ONE (docs/mission-design.md).
 *
 * WRITTEN BY THE GRAPH EDITOR (/admin/mapgraph). The graph it was drawn
 * from is scripts/maps/graphs/saltmouth.json — edit there and re-emit, or
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
  run, FLOOR_DARKSAND, FLOOR_SALT, FLOOR_SAND, WALL_DUNE, WALL_SALT,
  WALL_SAND,
} from "./mindustry.mjs";

export const spec = {
  id: "saltmouth",
  name: "Saltmouth",
  seed: 0x5a17,
  rock: { threshold: 0.45, scale: 22, warp: 13 },
  water: {
    scale: 42,
    level: 0.46,
    shore: 0.08,
    warp: 16,
    bias: (x, y) => -0.14 + Math.max(0, Math.min(1, (y - 26) / 205)) * 0.56 + Math.min(0.4, (Math.abs(x - 128) / 96) * 0.4),
  },
  floors: {
    scale: 34, warp: 12,
    families: [
      { floor: FLOOR_SAND, wall: WALL_SAND, weight: 0.5 },
      { floor: FLOOR_SALT, wall: WALL_SALT, weight: 0.26 },
      { floor: FLOOR_DARKSAND, wall: WALL_DUNE, weight: 0.24 },
    ],
  },
  beach: { floor: FLOOR_DARKSAND, depth: 3 },
  flats: { floor: FLOOR_SALT, clear: 10 },
  rooms: [
    { x: 128, y: 200, r: 16 }, // 0
    { x: 78, y: 158, r: 13 }, // 1
    { x: 62, y: 104, r: 13, dry: true }, // 2
    { x: 54, y: 56, r: 12, dry: true }, // 3
    { x: 178, y: 158, r: 13 }, // 4
    { x: 196, y: 106, r: 13, dry: true }, // 5
    { x: 206, y: 58, r: 12, dry: true }, // 6
    { x: 128, y: 96, r: 14, water: true }, // 7
    { x: 128, y: 168, r: 11, water: true }, // 8
    { x: 26, y: 34, r: 15 }, // 9 ground entry
    { x: 86, y: 22, r: 15 }, // 10 ground entry
    { x: 172, y: 22, r: 15 }, // 11 ground entry
    { x: 230, y: 36, r: 15 }, // 12 ground entry
    { x: 112, y: 14, r: 13, water: true }, // 13 water entry
    { x: 148, y: 14, r: 13, water: true }, // 14 water entry
    { x: 126, y: 226, r: 9, wobble: 0.2 }, // 15 the core's own ground
  ],
  core: { x: 126, y: 226, r: 9 },
  spawns: [],
  routes: [],
  links: [
    { rooms: [13, 7], width: [18, 24], layer: "water" },
    { rooms: [7, 8], width: [18, 24], layer: "water" },
    { rooms: [14, 7], width: [18, 24], layer: "water" },
    { rooms: [7, 8], width: [18, 24], layer: "water" },
    { rooms: [9, 3], width: [8, 14] },
    { rooms: [3, 2], width: [8, 14] },
    { rooms: [2, 1], width: [8, 14] },
    { rooms: [1, 0], width: [8, 14] },
    { rooms: [0, 15], width: [8, 14] },
    { rooms: [10, 3], width: [8, 14] },
    { rooms: [3, 2], width: [8, 14] },
    { rooms: [2, 1], width: [8, 14] },
    { rooms: [1, 0], width: [8, 14] },
    { rooms: [0, 15], width: [8, 14] },
    { rooms: [11, 6], width: [8, 14] },
    { rooms: [6, 5], width: [8, 14] },
    { rooms: [5, 4], width: [8, 14] },
    { rooms: [4, 0], width: [8, 14] },
    { rooms: [0, 15], width: [8, 14] },
    { rooms: [12, 6], width: [8, 14] },
    { rooms: [6, 5], width: [8, 14] },
    { rooms: [5, 4], width: [8, 14] },
    { rooms: [4, 0], width: [8, 14] },
    { rooms: [0, 15], width: [8, 14] },
    { rooms: [2, 3], width: [6, 9] },
    { rooms: [5, 6], width: [6, 9] },
    { rooms: [1, 2], width: [6, 9] },
    { rooms: [4, 5], width: [6, 9] },
  ],
  chokes: [{ x: 128, y: 216, w: 10, reach: 8 }],
  holes: 4, lumps: 10, ruins: 2, coreWaterReach: 70,
};

run(spec);
