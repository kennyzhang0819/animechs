/**
 * Maelstrom — world 2, the storm coast. The sea fills the north and east
 * of the board and the hulls come down it; three ground gates on the west
 * edge walk the coast to a core on the south-east shore, within gun reach
 * of the water. The naval front, and the hydrophobic one: the rock along
 * the coast is the rock that is taxed.
 *
 *   node scripts/maps/maelstrom.mjs [public/maps/maelstrom.json] [preview.png]
 */
import {
  run, FLOOR_STONE, FLOOR_DARKSAND, FLOOR_SHALE, FLOOR_BASALT,
  WALL_STONE, WALL_DUNE, WALL_SHALE,
} from "./mindustry.mjs";

export const spec = {
  id: "maelstrom",
  name: "Maelstrom",
  seed: 0x3a1f,
  rock: { threshold: 0.445, scale: 24, warp: 12 },
  // the sea: wet along the north and east edges, dry a hundred cells in
  water: { scale: 50, level: 0.44, shore: 0.08, warp: 18, bias: (x, y) => (Math.min(255 - x, y) / 130) * 0.7 - 0.24 },
  floors: {
    scale: 36, warp: 12,
    families: [
      { floor: FLOOR_STONE, wall: WALL_STONE, weight: 0.6 },
      { floor: FLOOR_DARKSAND, wall: WALL_DUNE, weight: 0.25 },
      { floor: FLOOR_SHALE, wall: WALL_SHALE, weight: 0.15 },
    ],
  },
  beach: { floor: FLOOR_DARKSAND, wall: WALL_DUNE, depth: 3 },
  flats: { floor: FLOOR_BASALT, clear: 12 },
  rooms: [
    { x: 70, y: 70, r: 13 }, // 0
    { x: 60, y: 160, r: 13 }, // 1
    { x: 126, y: 134, r: 17 }, // 2 the inland basin
    { x: 148, y: 60, r: 12 }, // 3 the north headland
    { x: 124, y: 214, r: 13 }, // 4 the south shore
    { x: 170, y: 204, r: 11 }, // 5 the antechamber
    { x: 236, y: 206, r: 10, water: true }, // 6 the bay under the core
  ],
  core: { x: 202, y: 224, r: 9 },
  spawns: [
    { x: 30, y: 28, r: 12, zone: "ground" }, // 0
    { x: 18, y: 130, r: 12, zone: "ground" }, // 1
    { x: 36, y: 232, r: 12, zone: "ground" }, // 2
    { x: 234, y: 42, r: 12, zone: "water" }, // 3
    { x: 236, y: 112, r: 12, zone: "water" }, // 4
    { x: 12, y: 12, r: 8, zone: "air" },
    { x: 244, y: 12, r: 8, zone: "air" },
  ],
  routes: [
    { spawn: 0, via: [0, 2, 5], width: [8, 16] },
    { spawn: 1, via: [1, 2, 5], width: [8, 16] },
    { spawn: 2, via: [4, 2, 5], width: [8, 14] },
    { spawn: 3, via: [4], to: 6, layer: "water", width: [12, 24] },
  ],
  links: [
    { rooms: [0, 3], width: [7, 10] },
    { rooms: [3, 2], width: [7, 12] },
    { rooms: [1, 4], width: [7, 10] },
    { rooms: [2, 4], width: [7, 12] },
    { rooms: ["spawn:4", 6], width: [12, 22], layer: "water" },
  ],
  chokes: [{ x: 186, y: 214, w: 9, reach: 8 }],
  funnel: { x: 186, y: 214, r: 8 },
  holes: 5,
  lumps: 10,
  ruins: 2,
  coreWaterReach: 40,
};

run(spec);
