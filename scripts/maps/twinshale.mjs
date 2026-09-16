/**
 * Twin Shale — two arms off a southern stem, split by a river only the
 * hulls cross. The ally outpost stands at the head of the north arm and
 * the swarm wants it more than the core; because the river divides them,
 * guns on one arm cannot cover the other at all.
 *
 * The river is ONE GAUSSIAN TROUGH in the water bias and nothing else —
 * no channel is drawn.
 *
 *   node scripts/maps/twinshale.mjs [out.json] [preview.png]
 *
 * MISSION ARCHETYPE: PROTECT THE SECOND THING (docs/mission-design.md).
 *
 * A SKETCH, NOT A CAMPAIGN MAP. Its id is deliberately absent from
 * OFFICIAL_MAP_IDS (game/maps.ts) and no world claims it, so nothing
 * loads it and nothing plays it — running this file writes
 * public/maps/twinshale.json like any other spec, and listing the id is what
 * would make it a map. The pipeline and every rule are in mindustry.mjs;
 * this file is the numbers.
 */
import {
  run, FLOOR_MUD, FLOOR_SHALE, FLOOR_STONE, WALL_DUNE, WALL_SHALE,
  WALL_STONE
} from "./mindustry.mjs";

export const spec = {
  id: "twinshale", name: "Twin Shale",
  seed: 0x7015,
  rock: { threshold: 0.44, scale: 23, warp: 13 },
  water: {
    scale: 46, level: 0.36, shore: 0.09, warp: 18,
    // the river: a trough running north from the stem, splitting the arms
    bias: (x, y) => 0.16 - 0.34 * Math.exp(-((x - 128 - (y - 128) * 0.12) ** 2) / (2 * 15 * 15)) * Math.max(0, Math.min(1, (200 - y) / 60)),
  },
  floors: { scale: 34, warp: 13, families: [
    { floor: FLOOR_SHALE, wall: WALL_SHALE, weight: 0.48 },
    { floor: FLOOR_MUD, wall: WALL_DUNE, weight: 0.28 },
    { floor: FLOOR_STONE, wall: WALL_STONE, weight: 0.24 },
  ] },
  beach: { floor: FLOOR_MUD, depth: 2 },
  rooms: [
    { x: 128, y: 206, r: 16 }, // 0 the stem
    { x: 88, y: 164, r: 13 },  // 1 west arm foot
    { x: 64, y: 112, r: 13 },  // 2 west arm middle
    { x: 56, y: 56, r: 13 },   // 3 west arm head — the outpost
    { x: 170, y: 164, r: 13 }, // 4 east arm foot
    { x: 196, y: 110, r: 13 }, // 5 east arm middle
    { x: 204, y: 52, r: 13 },  // 6 east arm head
    { x: 128, y: 150, r: 10, water: true }, // 7 the river mouth
  ],
  core: { x: 126, y: 232, r: 9 },
  spawns: [
    { x: 30, y: 20, r: 12, zone: "ground" },
    { x: 224, y: 18, r: 12, zone: "ground" },
    { x: 18, y: 100, r: 12, zone: "ground" },
    { x: 238, y: 98, r: 12, zone: "ground" },
    { x: 16, y: 16, r: 8, zone: "air" },
    { x: 240, y: 16, r: 8, zone: "air" },
    { x: 128, y: 16, r: 9, zone: "water" },
  ],
  routes: [
    { spawn: 6, to: 7, layer: "water", width: [18, 24] },
    { spawn: 0, via: [3, 2, 1, 0], width: [8, 14] },
    { spawn: 2, via: [2, 1, 0], width: [8, 14] },
    { spawn: 1, via: [6, 5, 4, 0], width: [8, 14] },
    { spawn: 3, via: [5, 4, 0], width: [8, 14] },
  ],
  links: [
    { rooms: [2, 3], width: [6, 9] }, { rooms: [5, 6], width: [6, 9] },
    { rooms: [1, 2], width: [6, 9] }, { rooms: [4, 5], width: [6, 9] },
  ],
  chokes: [{ x: 128, y: 222, w: 10, reach: 8 }],
  holes: 4, lumps: 12, ruins: 2, coreWaterReach: 90,
};

run(spec);
