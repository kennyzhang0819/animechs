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
 * with it. The pipeline and every rule are in mindustry.mjs; this file is
 * the numbers.
 */
import {
  run, FLOOR_DIRT, FLOOR_GRASS, FLOOR_MOSS, WALL_DIRT, WALL_SPORE,
  WALL_STONE,
} from "./mindustry.mjs";

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
    { x: 60, y: 216, r: 8 }, // 0
    { x: 128, y: 226, r: 8 }, // 1
    { x: 204, y: 214, r: 8 }, // 2
    { x: 214, y: 150, r: 8 }, // 3
    { x: 140, y: 140, r: 8 }, // 4
    { x: 56, y: 128, r: 8 }, // 5
    { x: 52, y: 60, r: 8 }, // 6
    { x: 130, y: 42, r: 8 }, // 7
    { x: 208, y: 50, r: 10 }, // 8
    { x: 168, y: 18, r: 15 }, // 9 ground entry
    { x: 240, y: 120, r: 15 }, // 10 ground entry
    { x: 30, y: 222, r: 9, wobble: 0.2 }, // 11 the core's own ground
  ],
  core: { x: 30, y: 222, r: 9 },
  spawns: [],
  routes: [],
  links: [
    { rooms: [9, 11], width: [5, 7] },
    { rooms: [10, 11], width: [5, 7] },
    { rooms: [0, 1], width: [14, 18] },
    { rooms: [1, 2], width: [14, 18] },
    { rooms: [2, 3], width: [14, 18] },
    { rooms: [3, 4], width: [14, 18] },
    { rooms: [4, 5], width: [14, 18] },
    { rooms: [5, 6], width: [14, 18] },
    { rooms: [6, 7], width: [14, 18] },
    { rooms: [7, 8], width: [14, 18] },
    { rooms: [1, 4], width: [7, 9] },
  ],
  chokes: [{ x: 44, y: 220, w: 10, reach: 8 }],
  funnel: { x: 44, y: 220, r: 8 },
  holes: 2, lumps: 6, ruins: 1,
};

run(spec);
