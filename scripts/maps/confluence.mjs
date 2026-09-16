/**
 * Confluence — world 1, the desert. Four ground gates on the north, west
 * and south edges flow together through a salt basin in the middle of the
 * board and reach the core on the east edge through one antechamber
 * whose mouth is the map's choke. Two channels come in off the south and
 * east edges to the pool below that antechamber, which is the water the
 * map is named for and as near the core as a hull may bring its guns.
 *
 *   node scripts/maps/confluence.mjs [public/maps/confluence.json] [preview.png]
 *
 * The pipeline and every rule are in mindustry.mjs; this file is the
 * numbers. Sand under sand walls, darksand under dune, stone under stone
 * wall; salt where the rooms open out, two lakes for the coil's earthing,
 * three ruins and the sand's own boulders.
 */
import {
  run, FLOOR_SAND, FLOOR_DARKSAND, FLOOR_STONE, FLOOR_SALT,
  WALL_SAND, WALL_DUNE, WALL_STONE,
} from "./mindustry.mjs";

/** a lake: pulls the water noise down round a point */
const well = (cx, cy, r, depth) => (x, y) => -depth * Math.exp(-((x - cx) ** 2 + (y - cy) ** 2) / (2 * r * r));
const wells = [well(118, 150, 16, 0.5), well(176, 96, 12, 0.45)];

export const spec = {
  id: "confluence",
  name: "Confluence",
  seed: 0xc0f1,
  rock: { threshold: 0.45, scale: 24, warp: 12 },
  water: { scale: 60, level: 0.3, shore: 0.07, bias: (x, y) => 0.14 + wells.reduce((a, w) => a + w(x, y), 0) },
  floors: {
    scale: 36, warp: 12,
    families: [
      { floor: FLOOR_SAND, wall: WALL_SAND, weight: 0.62 },
      { floor: FLOOR_DARKSAND, wall: WALL_DUNE, weight: 0.26 },
      { floor: FLOOR_STONE, wall: WALL_STONE, weight: 0.12 },
    ],
  },
  beach: { floor: FLOOR_DARKSAND, wall: WALL_DUNE, depth: 2 },
  flats: { floor: FLOOR_SALT, clear: 10 },
  rooms: [
    { x: 78, y: 64, r: 14 }, // 0 north-west clearing
    { x: 56, y: 168, r: 13 }, // 1 south-west clearing
    { x: 130, y: 128, r: 20 }, // 2 the basin every road meets in
    { x: 158, y: 66, r: 13 }, // 3 north
    { x: 172, y: 192, r: 14 }, // 4 south-east
    { x: 198, y: 128, r: 11 }, // 5 the antechamber before the core
    { x: 204, y: 166, r: 12, water: true }, // 6 the pool the two channels meet in
  ],
  core: { x: 232, y: 128, r: 9 },
  spawns: [
    { x: 24, y: 32, r: 12, zone: "ground" }, // 0
    { x: 108, y: 16, r: 12, zone: "ground" }, // 1
    { x: 16, y: 150, r: 12, zone: "ground" }, // 2
    { x: 66, y: 238, r: 12, zone: "ground" }, // 3
    { x: 12, y: 12, r: 8, zone: "air" },
    { x: 108, y: 8, r: 8, zone: "air" },
    // the water the map is named for: two channels in off the south and
    // east edges, meeting in the pool beside the antechamber
    { x: 150, y: 244, r: 9, zone: "water" }, // 6
    { x: 244, y: 200, r: 9, zone: "water" }, // 7
  ],
  routes: [
    { spawn: 6, to: 6, layer: "water", width: [18, 24] },
    { spawn: 7, to: 6, layer: "water", width: [18, 24] },
    { spawn: 0, via: [0, 2, 5], width: [8, 16] },
    { spawn: 1, via: [3, 2, 5], width: [8, 14] },
    { spawn: 2, via: [1, 2, 5], width: [8, 18] },
    { spawn: 3, via: [4, 5], width: [8, 14] },
  ],
  links: [
    { rooms: [0, 3], width: [7, 10] },
    { rooms: [1, 4], width: [7, 10] },
    { rooms: [2, 3], width: [7, 12] },
    { rooms: [2, 4], width: [7, 12] },
  ],
  chokes: [{ x: 214, y: 128, w: 9, reach: 8 }, { x: 166, y: 128, w: 9, reach: 7 }],
  funnel: { x: 214, y: 128, r: 8 },
  holes: 6,
  lumps: 14,
  ruins: 3,
};

run(spec);
