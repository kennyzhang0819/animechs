/**
 * Emberdeep
 *
 *   node scripts/maps/emberdeep.mjs [out.json] [preview.png]
 *
 * MISSION ARCHETYPE: STOP THE RITUAL (docs/mission-design.md).
 *
 * WRITTEN BY THE GRAPH EDITOR (/admin/mapgraph). The graph it was drawn
 * from is scripts/maps/graphs/emberdeep.json — edit there and re-emit, or
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
  run, FLOOR_BASALT, FLOOR_DARKSAND, FLOOR_SHALE, WALL_DARK, WALL_DUNE,
  WALL_SHALE,
} from "./mindustry.mjs";

/** a lake: pulls the water noise down round a point */
const well = (cx, cy, r, depth) => (x, y) =>
  -depth * Math.exp(-((x - cx) ** 2 + (y - cy) ** 2) / (2 * r * r));

export const spec = {
  id: "emberdeep",
  name: "Emberdeep",
  seed: 0xe4be,
  rock: { threshold: 0.38, scale: 20, warp: 12 },
  water: {
    scale: 56,
    level: 0.3,
    shore: 0.07,
    bias: (x, y) => 0.18 + well(74, 206, 15, 0.5)(x, y),
  },
  floors: {
    scale: 32, warp: 12,
    families: [
      { floor: FLOOR_BASALT, wall: WALL_DARK, weight: 0.56 },
      { floor: FLOOR_DARKSAND, wall: WALL_DUNE, weight: 0.26 },
      { floor: FLOOR_SHALE, wall: WALL_SHALE, weight: 0.18 },
    ],
  },
  beach: { floor: FLOOR_DARKSAND, depth: 2 },
  rooms: [
    { x: 62, y: 128, r: 14 }, // 0
    { x: 96, y: 78, r: 12 }, // 1
    { x: 140, y: 118, r: 13 }, // 2
    { x: 118, y: 182, r: 12 }, // 3
    { x: 178, y: 196, r: 12 }, // 4
    { x: 196, y: 96, r: 13 }, // 5
    { x: 220, y: 156, r: 17 }, // 6
    { x: 84, y: 198, r: 9, water: true }, // 7
    { x: 158, y: 26, r: 15 }, // 8 ground entry
    { x: 196, y: 42, r: 15 }, // 9 ground entry
    { x: 142, y: 230, r: 15 }, // 10 ground entry
    { x: 196, y: 212, r: 15 }, // 11 ground entry
    { x: 26, y: 228, r: 12, water: true }, // 12 water entry
    { x: 28, y: 128, r: 9, wobble: 0.2 }, // 13 the core's own ground
  ],
  core: { x: 28, y: 128, r: 9 },
  spawns: [],
  routes: [],
  links: [
    { rooms: [12, 7], width: [17, 23], layer: "water" },
    { rooms: [8, 2], width: [8, 14] },
    { rooms: [2, 1], width: [8, 14] },
    { rooms: [1, 0], width: [8, 14] },
    { rooms: [0, 13], width: [8, 14] },
    { rooms: [9, 5], width: [8, 14] },
    { rooms: [5, 2], width: [8, 14] },
    { rooms: [2, 1], width: [8, 14] },
    { rooms: [1, 0], width: [8, 14] },
    { rooms: [0, 13], width: [8, 14] },
    { rooms: [10, 4], width: [8, 14] },
    { rooms: [4, 3], width: [8, 14] },
    { rooms: [3, 0], width: [8, 14] },
    { rooms: [0, 13], width: [8, 14] },
    { rooms: [11, 6], width: [8, 14] },
    { rooms: [6, 4], width: [8, 14] },
    { rooms: [4, 3], width: [8, 14] },
    { rooms: [3, 0], width: [8, 14] },
    { rooms: [0, 13], width: [8, 14] },
    { rooms: [1, 2], width: [6, 9] },
    { rooms: [2, 3], width: [6, 9] },
    { rooms: [2, 5], width: [6, 9] },
    { rooms: [4, 6], width: [6, 9] },
    { rooms: [5, 6], width: [6, 9] },
  ],
  chokes: [{ x: 44, y: 128, w: 9, reach: 8 }, { x: 118, y: 100, w: 9, reach: 7 }],
  funnel: { x: 44, y: 128, r: 8 },
  holes: 5, lumps: 18, ruins: 3, coreWaterReach: 95,
};

run(spec);
