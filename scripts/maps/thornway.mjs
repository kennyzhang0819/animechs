/**
 * Thornway — ONE ROAD, drawn as an S from the bottom.
 *
 *   node scripts/maps/thornway.mjs [out.json] [preview.png]
 *
 * MISSION ARCHETYPE: ESCORT THE CROSSER (docs/mission-design.md).
 */
import {
  run, FLOOR_DIRT, FLOOR_GRASS, FLOOR_MOSS, WALL_DIRT, WALL_SPORE,
  WALL_STONE
} from "./mindustry.mjs";

export const spec = {
  id: "thornway", name: "Thornway",
  seed: 0x7407,
  rock: { threshold: 0.30, scale: 23, warp: 13 },
  // no water on this board — nothing competes with the road
  water: { scale: 58, level: 0.3, shore: 0.07, bias: () => 0.5 },
  floors: { scale: 36, warp: 13, families: [
    { floor: FLOOR_GRASS, wall: WALL_STONE, weight: 0.56 },
    { floor: FLOOR_DIRT, wall: WALL_DIRT, weight: 0.30 },
    { floor: FLOOR_MOSS, wall: WALL_SPORE, weight: 0.14 },
  ] },
  rooms: [
    { x: 60, y: 216, r: 8 },  // 0 the antechamber — the caravan sets out here
    { x: 128, y: 226, r: 8 }, // 1 the bottom sweep, going east
    { x: 204, y: 214, r: 8 }, // 2 the bottom-right turn
    { x: 214, y: 150, r: 8 }, // 3 the right-hand riser
    { x: 140, y: 140, r: 8 }, // 4 the middle sweep, going west
    { x: 56, y: 128, r: 8 },  // 5 the middle-west turn
    { x: 52, y: 60, r: 8 },   // 6 the left-hand riser, up to the north-west
    { x: 130, y: 42, r: 8 },  // 7 the top sweep, going east again
    { x: 208, y: 50, r: 10 }, // 8 the delivery point
  ],
  core: { x: 30, y: 222, r: 9 },
  spawns: [
    { x: 168, y: 18, r: 12, zone: "ground" },
    { x: 240, y: 120, r: 12, zone: "ground" },
    { x: 20, y: 20, r: 8, zone: "air" },
    { x: 238, y: 238, r: 8, zone: "air" },
  ],
  routes: [
    { spawn: 0, width: [5, 7] },
    { spawn: 1, width: [5, 7] },
  ],
  links: [
    // THE ROAD — one line, bottom to top
    { rooms: [0, 1], width: [14, 18] }, { rooms: [1, 2], width: [14, 18] },
    { rooms: [2, 3], width: [14, 18] }, { rooms: [3, 4], width: [14, 18] },
    { rooms: [4, 5], width: [14, 18] }, { rooms: [5, 6], width: [14, 18] },
    { rooms: [6, 7], width: [14, 18] }, { rooms: [7, 8], width: [14, 18] },
    // THE ONE SHORTCUT: straight up the middle, skipping the right-hand loop
    { rooms: [1, 4], width: [7, 9] },
  ],
  chokes: [{ x: 44, y: 220, w: 10, reach: 8 }],
  funnel: { x: 44, y: 220, r: 8 },
  holes: 2, lumps: 6, ruins: 1,
};

run(spec);
