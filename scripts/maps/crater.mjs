/**
 * Crater — the core in the middle of the board, in a basalt crater, and
 * six gates round the edge coming at it from every side. No funnel: the
 * crater's rim has a mouth toward every road, and each mouth is a choke.
 * Two channels come in off the east and west edges and flood the pit
 * under the southern rim, which is the hulls' way in.
 *
 *   node scripts/maps/crater.mjs [public/maps/crater.json] [preview.png]
 */
import {
  run, FLOOR_BASALT, FLOOR_DARKSAND, FLOOR_STONE,
  WALL_DARK, WALL_DUNE, WALL_STONE,
} from "./mindustry.mjs";

const well = (cx, cy, r, depth) => (x, y) => -depth * Math.exp(-((x - cx) ** 2 + (y - cy) ** 2) / (2 * r * r));
const wells = [well(72, 190, 12, 0.45), well(190, 66, 12, 0.45)];

export const spec = {
  id: "crater",
  name: "Crater",
  seed: 0xc7a7,
  rock: { threshold: 0.44, scale: 22, warp: 12 },
  water: { scale: 60, level: 0.3, shore: 0.07, bias: (x, y) => 0.16 + wells.reduce((a, w) => a + w(x, y), 0) },
  floors: {
    scale: 36, warp: 12,
    families: [
      { floor: FLOOR_BASALT, wall: WALL_DARK, weight: 0.5 },
      { floor: FLOOR_DARKSAND, wall: WALL_DUNE, weight: 0.3 },
      { floor: FLOOR_STONE, wall: WALL_STONE, weight: 0.2 },
    ],
  },
  beach: { floor: FLOOR_DARKSAND, depth: 2 },
  flats: { floor: FLOOR_DARKSAND, clear: 12 },
  rooms: [
    { x: 128, y: 128, r: 28, wobble: 0.2 }, // 0 the crater
    { x: 128, y: 64, r: 11 }, // 1 north
    { x: 128, y: 192, r: 11 }, // 2 south
    { x: 64, y: 128, r: 11 }, // 3 west
    { x: 192, y: 128, r: 11 }, // 4 east
    { x: 76, y: 76, r: 11 }, // 5 north-west
    { x: 180, y: 180, r: 11 }, // 6 south-east
    { x: 128, y: 176, r: 10, water: true }, // 7 the flooded pit under the rim
  ],
  core: { x: 128, y: 128, r: 10 },
  spawns: [
    { x: 128, y: 16, r: 12, zone: "ground" }, // 0
    { x: 128, y: 240, r: 12, zone: "ground" }, // 1
    { x: 16, y: 128, r: 12, zone: "ground" }, // 2
    { x: 240, y: 128, r: 12, zone: "ground" }, // 3
    { x: 40, y: 40, r: 12, zone: "ground" }, // 4
    { x: 216, y: 216, r: 12, zone: "ground" }, // 5
    // THE SKY OVER THIS BOARD IS ROCK EVERYWHERE BUT THE GATES: the rim's
    // north-east and south-west corners, where the air doors used to sit,
    // are solid, and a flyer entering inside a peak flies the fallback
    // straight line out instead of the route the map implies. Both doors
    // stand over the diagonal gates' own corners, which are open sky
    { x: 24, y: 24, r: 8, zone: "air" },
    { x: 224, y: 224, r: 8, zone: "air" },
    // the two channels that flooded the pit, in off the east and west edges
    { x: 244, y: 180, r: 9, zone: "water" }, // 8
    { x: 12, y: 180, r: 9, zone: "water" }, // 9
  ],
  routes: [
    { spawn: 8, to: 7, layer: "water", width: [16, 22] },
    { spawn: 9, to: 7, layer: "water", width: [16, 22] },
    { spawn: 0, via: [1], width: [8, 14] },
    { spawn: 1, via: [2], width: [8, 14] },
    { spawn: 2, via: [3], width: [8, 14] },
    { spawn: 3, via: [4], width: [8, 14] },
    { spawn: 4, via: [5], width: [8, 14] },
    { spawn: 5, via: [6], width: [8, 14] },
  ],
  links: [
    { rooms: [1, 5], width: [7, 10] },
    { rooms: [5, 3], width: [7, 10] },
    { rooms: [2, 6], width: [7, 10] },
    { rooms: [6, 4], width: [7, 10] },
    { rooms: [1, 4], width: [7, 10] },
    { rooms: [3, 2], width: [7, 10] },
  ],
  // the crater's six mouths
  chokes: [
    { x: 128, y: 98, w: 9, reach: 7 },
    { x: 128, y: 158, w: 9, reach: 7 },
    { x: 98, y: 128, w: 9, reach: 7 },
    { x: 158, y: 128, w: 9, reach: 7 },
    { x: 106, y: 106, w: 9, reach: 7 },
    { x: 150, y: 150, w: 9, reach: 7 },
  ],
  holes: 6,
  lumps: 16,
  ruins: 2,
  coreWaterReach: 55,
};

run(spec);
