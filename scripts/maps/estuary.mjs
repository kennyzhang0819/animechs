/**
 * Estuary — the sea fills the south of the board, a river comes down
 * from the north-east to meet it, two lakes lie inland, and the core
 * stands on the north shore where the river opens out. Four ground gates
 * on the north corners and the east and west edges; the hulls from the
 * sea and down the river.
 *
 *   node scripts/maps/estuary.mjs [public/maps/estuary.json] [preview.png]
 */
import {
  run, FLOOR_SAND, FLOOR_DARKSAND, FLOOR_STONE,
  WALL_SAND, WALL_DUNE, WALL_STONE,
} from "./mindustry.mjs";

const well = (cx, cy, r, depth) => (x, y) => -depth * Math.exp(-((x - cx) ** 2 + (y - cy) ** 2) / (2 * r * r));
const wells = [well(60, 96, 13, 0.55), well(200, 100, 12, 0.5)];

export const spec = {
  id: "estuary",
  name: "Estuary",
  seed: 0xe57a,
  rock: { threshold: 0.45, scale: 24, warp: 12 },
  // the sea: wet along the south edge, dry a hundred cells up
  water: {
    scale: 50, level: 0.44, shore: 0.08, warp: 16,
    bias: (x, y) => ((255 - y) / 160) * 0.9 - 0.42 + wells.reduce((a, w) => a + w(x, y), 0),
  },
  floors: {
    scale: 36, warp: 12,
    families: [
      { floor: FLOOR_SAND, wall: WALL_SAND, weight: 0.5 },
      { floor: FLOOR_DARKSAND, wall: WALL_DUNE, weight: 0.3 },
      { floor: FLOOR_STONE, wall: WALL_STONE, weight: 0.2 },
    ],
  },
  beach: { floor: FLOOR_DARKSAND, wall: WALL_DUNE, depth: 3 },
  rooms: [
    { x: 64, y: 64, r: 12 }, // 0 north-west
    { x: 164, y: 64, r: 12 }, // 1 north-east
    { x: 60, y: 130, r: 12 }, // 2 west
    { x: 170, y: 130, r: 12 }, // 3 east
    { x: 128, y: 118, r: 11 }, // 4 the antechamber
    { x: 196, y: 205, r: 10, water: true }, // 5 the river's mouth
  ],
  core: { x: 128, y: 162, r: 9 },
  spawns: [
    { x: 24, y: 24, r: 12, zone: "ground" }, // 0
    { x: 232, y: 24, r: 12, zone: "ground" }, // 1
    { x: 16, y: 120, r: 12, zone: "ground" }, // 2
    { x: 240, y: 110, r: 12, zone: "ground" }, // 3
    { x: 30, y: 232, r: 12, zone: "water" }, // 4 the south-west sea
    { x: 226, y: 232, r: 12, zone: "water" }, // 5 the south-east sea
    { x: 200, y: 14, r: 8, zone: "water" }, // 6 the river's head
    // beside the river's head, where the north rim is open: over the
    // middle of that rim the circle was buried in rock
    { x: 224, y: 20, r: 8, zone: "air" },
    { x: 244, y: 244, r: 8, zone: "air" },
  ],
  routes: [
    { spawn: 6, to: 5, layer: "water", width: [16, 22] },
    { spawn: 0, via: [0, 4], width: [8, 16] },
    { spawn: 1, via: [1, 4], width: [8, 16] },
    { spawn: 2, via: [2, 4], width: [8, 14] },
    { spawn: 3, via: [3, 4], width: [8, 14] },
  ],
  links: [
    { rooms: [0, 1], width: [7, 10] },
    { rooms: [0, 2], width: [7, 10] },
    { rooms: [1, 3], width: [7, 10] },
  ],
  chokes: [{ x: 128, y: 140, w: 9, reach: 8 }],
  funnel: { x: 128, y: 140, r: 8 },
  holes: 5,
  lumps: 10,
  ruins: 2,
};

run(spec);
