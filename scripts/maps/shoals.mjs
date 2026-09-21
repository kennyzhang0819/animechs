/**
 * Shoals — the archipelago: two thirds of the board is sea, the land is
 * sand islands, and every road between them is a bar of shallow water
 * the swarm wades. Three ground gates on the east, the hulls from the
 * north and south seas, the core on the west island behind one causeway.
 *
 *   node scripts/maps/shoals.mjs [public/maps/shoals.json] [preview.png]
 */
import {
  run, FLOOR_SAND, FLOOR_DARKSAND, FLOOR_SHALE, FLOOR_SALT,
  WALL_SAND, WALL_DUNE, WALL_SHALE,
} from "./mapgen.mjs";

export const spec = {
  id: "shoals",
  name: "Shoals",
  seed: 0x5ea5,
  rock: { threshold: 0.44, scale: 22, warp: 12 },
  water: { scale: 40, level: 0.5, shore: 0.08, warp: 16, bias: () => -0.04 },
  floors: {
    scale: 36, warp: 12,
    families: [
      { floor: FLOOR_SAND, wall: WALL_SAND, weight: 0.55 },
      { floor: FLOOR_DARKSAND, wall: WALL_DUNE, weight: 0.25 },
      { floor: FLOOR_SHALE, wall: WALL_SHALE, weight: 0.2 },
    ],
  },
  beach: { floor: FLOOR_DARKSAND, depth: 2 },
  flats: { floor: FLOOR_SALT, clear: 9 },
  rooms: [
    { x: 176, y: 96, r: 13, dry: true }, // 0 north-east island
    { x: 176, y: 160, r: 13, dry: true }, // 1 south-east island
    { x: 118, y: 128, r: 16, dry: true }, // 2 the middle island
    { x: 70, y: 80, r: 11, dry: true }, // 3 north-west island
    { x: 70, y: 176, r: 11, dry: true }, // 4 south-west island
    { x: 62, y: 128, r: 9, dry: true }, // 5 the antechamber islet
    { x: 30, y: 80, r: 9, water: true }, // 6 the north cove
    { x: 30, y: 176, r: 9, water: true }, // 7 the south cove
  ],
  core: { x: 36, y: 128, r: 10 },
  spawns: [
    { x: 236, y: 128, r: 12, zone: "ground" }, // 0
    { x: 216, y: 40, r: 12, zone: "ground" }, // 1
    { x: 216, y: 216, r: 12, zone: "ground" }, // 2
    { x: 128, y: 20, r: 10, zone: "water" }, // 3
    { x: 128, y: 236, r: 10, zone: "water" }, // 4
    { x: 244, y: 20, r: 8, zone: "air" },
    { x: 244, y: 236, r: 8, zone: "air" },
  ],
  routes: [
    { spawn: 3, to: 6, layer: "water", width: [16, 22] },
    { spawn: 4, to: 7, layer: "water", width: [16, 22] },
    { spawn: 0, via: [0, 2, 5], width: [8, 14] },
    { spawn: 1, via: [0, 2, 5], width: [8, 14] },
    { spawn: 2, via: [1, 2, 5], width: [8, 14] },
  ],
  links: [
    { rooms: [0, 1], width: [7, 10] },
    { rooms: [2, 3], width: [7, 10] },
    { rooms: [2, 4], width: [7, 10] },
    { rooms: [3, 5], width: [7, 10] },
    { rooms: [4, 5], width: [7, 10] },
  ],
  chokes: [{ x: 49, y: 128, w: 9, reach: 7 }],
  funnel: { x: 49, y: 128, r: 7 },
  holes: 4,
  lumps: 8,
  ruins: 1,
};

run(spec);
