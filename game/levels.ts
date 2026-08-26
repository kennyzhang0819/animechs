import { CELL, HP0, UNIT_SPEED, UR } from "./constants";

export const UNIT_KINDS = ["dagger", "mace", "flare"] as const;
export type UnitKind = (typeof UNIT_KINDS)[number];
export type { TowerKind } from "./types";

/** numeric unit id — index into UNIT_KINDS, stored in the sim's ukind array */
export const UNIT_ID: Record<UnitKind, number> = { dagger: 0, mace: 1, flare: 2 };

export interface UnitStats {
  hp: number;
  /** world px/s */
  speed: number;
  /** flat damage shaved off every hit, floored at 10% of the raw shot */
  armor: number;
  /** collision radius in world px — half the square hitbox edge */
  radius: number;
  /** meta-currency banked per kill, win or lose (see progress.ts) */
  scrap: number;
  /** flying units ignore terrain and head straight for the core; only
   * towers with targetAir (and bullets with collidesAir) touch them */
  flying?: boolean;
}

/** per-kind combat stats (official Mindustry numbers) */
export const UNIT_STATS: Record<UnitKind, UnitStats> = {
  // dagger: 150 hp, no armor, 1x1-block hitbox, 3.75 tiles/s
  dagger: { hp: HP0, speed: UNIT_SPEED, armor: 0, radius: UR, scrap: 1 },
  // mace: 550 hp, armor 4, 1.25x1.25-block hitbox, 3.75 tiles/s
  mace: { hp: 550, speed: UNIT_SPEED, armor: 4, radius: UR * 1.25, scrap: 4 },
  // flare: 70 hp, no armor, 1.125-block hitbox, 2.7 px/tick = 20.25 tiles/s
  flare: { hp: 70, speed: 20.25 * CELL, armor: 0, radius: UR * 1.125, scrap: 2, flying: true },
};

/** largest unit radius — pads broad-phase bounds that must cover any unit */
export const UNIT_RMAX = Math.max(...UNIT_KINDS.map((k) => UNIT_STATS[k].radius));

/**
 * One step of a level's script. A wave says how many of each kind to send;
 * its kinds drain together and intermingled, all running out at the same
 * moment, so `{ dagger: 10, mace: 20 }` arrives as one mixed push rather
 * than ten daggers followed by twenty maces. A wait holds for that many
 * seconds once the previous wave has finished entering the field — the
 * clock starts when the last unit spawns, not when it dies.
 */
export type LevelStep =
  | { wave: Partial<Record<UnitKind, number>> }
  | { wait: number };

export interface LevelSpec {
  /** save key and display number, "world-index" (e.g. "2-1") */
  id: string;
  name: string;
  /** which official map document the level plays on (see maps.ts) */
  mapId: string;
  /** enemies entering the field per second — every wave drains at this rate */
  spawnRate: number;
  /** what the level throws at you, run start to finish in order */
  script: readonly LevelStep[];
  /** scrap on top of kill payouts for holding the core to the end; a
   * perfect run (nothing leaked) pays half of it again */
  clearBonus: number;
}

export interface WorldSpec {
  id: number;
  name: string;
  levels: readonly LevelSpec[];
}

/**
 * The campaign: worlds play strictly in order, and so do the levels inside
 * each one — a level is playable once the one before it (across the whole
 * flattened list) has been cleared. Every run banks scrap per kill whether
 * it ends in victory or defeat; see progress.ts for the ledger.
 * All levels share the one official map for now — add a JSON under
 * public/maps/, list it in OFFICIAL_MAP_IDS, and point mapId at it.
 */
export const WORLDS: readonly WorldSpec[] = [
  {
    id: 1,
    name: "The Foothills",
    levels: [
      {
        id: "1-1",
        name: "First Contact",
        mapId: "generated-24",
        spawnRate: 30,
        clearBonus: 60,
        script: [
          { wait: 8 },
          { wave: { dagger: 20 } },
          { wait: 10 },
          { wave: { dagger: 30 } },
          { wait: 10 },
          { wave: { dagger: 50 } },
        ],
      },
      {
        id: "1-2",
        name: "Thin Red Line",
        mapId: "generated-24",
        spawnRate: 40,
        clearBonus: 90,
        script: [
          { wait: 8 },
          { wave: { dagger: 40 } },
          { wait: 10 },
          { wave: { dagger: 60 } },
          { wait: 10 },
          { wave: { dagger: 60, mace: 5 } },
          { wait: 10 },
          { wave: { dagger: 80, mace: 10 } },
        ],
      },
      {
        id: "1-3",
        name: "The Dagger Problem",
        mapId: "generated-24",
        spawnRate: 60,
        clearBonus: 140,
        script: [
          { wait: 10 },
          { wave: { dagger: 50 } },
          { wait: 10 },
          { wave: { dagger: 50 } },
          { wait: 10 },
          { wave: { mace: 20 } },
          { wait: 10 },
          { wave: { dagger: 100, mace: 20 } },
          { wait: 10 },
          { wave: { dagger: 200, mace: 50 } },
        ],
      },
    ],
  },
  {
    id: 2,
    name: "The Overgrowth",
    levels: [
      {
        id: "2-1",
        name: "Air Raid",
        mapId: "generated-24",
        spawnRate: 60,
        clearBonus: 200,
        script: [
          { wait: 8 },
          { wave: { dagger: 60 } },
          { wait: 10 },
          { wave: { flare: 15 } },
          { wait: 10 },
          { wave: { dagger: 100, flare: 20 } },
          { wait: 10 },
          { wave: { dagger: 150, mace: 20, flare: 30 } },
        ],
      },
      {
        id: "2-2",
        name: "Pincer",
        mapId: "generated-24",
        spawnRate: 80,
        clearBonus: 280,
        script: [
          { wait: 8 },
          { wave: { dagger: 120, mace: 20 } },
          { wait: 10 },
          { wave: { flare: 40 } },
          { wait: 10 },
          { wave: { dagger: 200, mace: 40 } },
          { wait: 12 },
          { wave: { dagger: 250, mace: 60, flare: 40 } },
        ],
      },
      {
        id: "2-3",
        name: "The Horde",
        mapId: "generated-24",
        spawnRate: 100,
        clearBonus: 400,
        script: [
          { wait: 8 },
          { wave: { dagger: 200 } },
          { wait: 10 },
          { wave: { dagger: 200, mace: 50 } },
          { wait: 10 },
          { wave: { flare: 60 } },
          { wait: 10 },
          { wave: { dagger: 300, mace: 80, flare: 50 } },
          { wait: 15 },
          { wave: { dagger: 500, mace: 120, flare: 80 } },
        ],
      },
    ],
  },
];

/** the campaign flattened in play order — index i unlocks when i-1 is cleared */
export const LEVELS: readonly LevelSpec[] = WORLDS.flatMap((w) => w.levels);

export function levelById(id: string): LevelSpec | null {
  return LEVELS.find((l) => l.id === id) ?? null;
}
