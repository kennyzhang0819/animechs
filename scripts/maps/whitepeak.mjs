/**
 * Whitepeak
 *
 *   node scripts/maps/whitepeak.mjs [out.json] [preview.png]
 *
 * MISSION ARCHETYPE: RACE THE ENEMY (docs/mission-design.md).
 *
 * WRITTEN BY THE GRAPH EDITOR (/admin/mapgraph). The graph it was drawn
 * from is scripts/maps/graphs/whitepeak.json — edit there and re-emit, or
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
  run, FLOOR_ICE, FLOOR_SALT, FLOOR_SNOW, WALL_ICE, WALL_SALT, WALL_SNOW,
} from "./mindustry.mjs";

/** a lake: pulls the water noise down round a point */
const well = (cx, cy, r, depth) => (x, y) =>
  -depth * Math.exp(-((x - cx) ** 2 + (y - cy) ** 2) / (2 * r * r));

export const spec = {
  id: "whitepeak",
  name: "Whitepeak",
  seed: 0x117e,
  rock: { threshold: 0.515, scale: 30, warp: 16 },
  water: {
    scale: 60,
    level: 0.26,
    shore: 0.06,
    bias: (x, y) => 0.2 + well(60, 60, 14, 0.5)(x, y),
  },
  floors: {
    scale: 40, warp: 14,
    families: [
      { floor: FLOOR_ICE, wall: WALL_ICE, weight: 0.5 },
      { floor: FLOOR_SNOW, wall: WALL_SNOW, weight: 0.32 },
      { floor: FLOOR_SALT, wall: WALL_SALT, weight: 0.18 },
    ],
  },
  beach: { floor: FLOOR_SNOW, depth: 2 },
  flats: { floor: FLOOR_SALT, clear: 14 },
  rooms: [
    { x: 128, y: 128, r: 24, wobble: 0.24 }, // 0
    { x: 128, y: 70, r: 13 }, // 1
    { x: 128, y: 186, r: 13 }, // 2
    { x: 70, y: 128, r: 13 }, // 3
    { x: 186, y: 128, r: 13 }, // 4
    { x: 70, y: 66, r: 9, water: true }, // 5
    { x: 128, y: 18, r: 15, wobble: 0.2 }, // 6 ground entry
    { x: 128, y: 238, r: 15, wobble: 0.2 }, // 7 ground entry
    { x: 18, y: 128, r: 15, wobble: 0.2 }, // 8 ground entry
    { x: 238, y: 128, r: 15, wobble: 0.2 }, // 9 ground entry
    { x: 20, y: 20, r: 12, wobble: 0.15, water: true }, // 10 water entry
    { x: 126, y: 126, r: 10, wobble: 0.2 }, // 11 the core's own ground
  ],
  core: { x: 126, y: 126, r: 10 },
  spawns: [],
  routes: [],
  links: [
    { rooms: [10, 5], width: [17, 23], layer: "water" },
    { rooms: [6, 1], width: [9, 16] },
    { rooms: [1, 11], width: [9, 16] },
    { rooms: [7, 2], width: [9, 16] },
    { rooms: [2, 11], width: [9, 16] },
    { rooms: [8, 3], width: [9, 16] },
    { rooms: [3, 11], width: [9, 16] },
    { rooms: [9, 4], width: [9, 16] },
    { rooms: [4, 11], width: [9, 16] },
    { rooms: [1, 3], width: [8, 11] },
    { rooms: [1, 4], width: [8, 11] },
    { rooms: [2, 3], width: [8, 11] },
    { rooms: [2, 4], width: [8, 11] },
  ],
  chokes: [],
  holes: 8, lumps: 20, ruins: 2, coreWaterReach: 110,
};

run(spec);
