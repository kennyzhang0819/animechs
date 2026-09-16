/**
 * Emberdeep — the other end of the same dial. Rock threshold 0.38
 * leaves 35% open, which on this board is a branching tunnel system
 * rather than a field, and the ritual arena sits at the far east end of
 * it. The defence is cheap because the corridors are narrow; the
 * expedition is the whole budget.
 *
 *   node scripts/maps/emberdeep.mjs [out.json] [preview.png]
 *
 * MISSION ARCHETYPE: STOP THE RITUAL (docs/mission-design.md).
 *
 * A SKETCH, NOT A CAMPAIGN MAP. Its id is deliberately absent from
 * OFFICIAL_MAP_IDS (game/maps.ts) and no world claims it, so nothing
 * loads it and nothing plays it — running this file writes
 * public/maps/emberdeep.json like any other spec, and listing the id is what
 * would make it a map. The pipeline and every rule are in mindustry.mjs;
 * this file is the numbers.
 */
import {
  run, FLOOR_BASALT, FLOOR_DARKSAND, FLOOR_SHALE, WALL_DARK, WALL_DUNE,
  WALL_SHALE
} from "./mindustry.mjs";

/** a lake: pulls the water noise down round a point */
const well = (cx, cy, r, depth) => (x, y) =>
  -depth * Math.exp(-((x - cx) ** 2 + (y - cy) ** 2) / (2 * r * r));

export const spec = {
  id: "emberdeep", name: "Emberdeep",
  seed: 0xe4be,
  rock: { threshold: 0.38, scale: 20, warp: 12 },
  water: { scale: 56, level: 0.3, shore: 0.07, bias: (x, y) => 0.18 + well(74, 206, 15, 0.5)(x, y) },
  floors: { scale: 32, warp: 12, families: [
    { floor: FLOOR_BASALT, wall: WALL_DARK, weight: 0.56 },
    { floor: FLOOR_DARKSAND, wall: WALL_DUNE, weight: 0.26 },
    { floor: FLOOR_SHALE, wall: WALL_SHALE, weight: 0.18 },
  ] },
  beach: { floor: FLOOR_DARKSAND, depth: 2 },
  rooms: [
    { x: 62, y: 128, r: 14 },  // 0 the antechamber
    { x: 96, y: 78, r: 12 },   // 1
    { x: 140, y: 118, r: 13 }, // 2
    { x: 118, y: 182, r: 12 }, // 3
    { x: 178, y: 196, r: 12 }, // 4
    { x: 196, y: 96, r: 13 },  // 5
    { x: 220, y: 156, r: 17 }, // 6 the ritual arena
    { x: 84, y: 198, r: 9, water: true }, // 7 the sump
  ],
  core: { x: 28, y: 128, r: 9 },
  spawns: [
    { x: 158, y: 26, r: 12, zone: "ground" },
    { x: 196, y: 42, r: 12, zone: "ground" },
    { x: 142, y: 230, r: 12, zone: "ground" },
    { x: 196, y: 212, r: 12, zone: "ground" },
    { x: 236, y: 24, r: 8, zone: "air" },
    { x: 24, y: 232, r: 8, zone: "air" },
    { x: 26, y: 228, r: 9, zone: "water" },
  ],
  routes: [
    { spawn: 6, to: 7, layer: "water", width: [17, 23] },
    { spawn: 0, via: [2, 1, 0], width: [8, 14] },
    { spawn: 1, via: [5, 2, 1, 0], width: [8, 14] },
    { spawn: 2, via: [4, 3, 0], width: [8, 14] },
    { spawn: 3, via: [6, 4, 3, 0], width: [8, 14] },
  ],
  links: [
    { rooms: [1, 2], width: [6, 9] }, { rooms: [2, 3], width: [6, 9] },
    { rooms: [2, 5], width: [6, 9] }, { rooms: [4, 6], width: [6, 9] },
    { rooms: [5, 6], width: [6, 9] },
  ],
  chokes: [{ x: 44, y: 128, w: 9, reach: 8 }, { x: 118, y: 100, w: 9, reach: 7 }],
  funnel: { x: 44, y: 128, r: 8 },
  holes: 5, lumps: 18, ruins: 3, coreWaterReach: 95,
};

run(spec);
