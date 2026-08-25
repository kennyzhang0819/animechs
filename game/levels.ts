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
  /** flying units ignore terrain and head straight for the core; only
   * towers with targetAir (and bullets with collidesAir) touch them */
  flying?: boolean;
}

/** per-kind combat stats (official Mindustry numbers) */
export const UNIT_STATS: Record<UnitKind, UnitStats> = {
  // dagger: 150 hp, no armor, 1x1-block hitbox, 3.75 tiles/s
  dagger: { hp: HP0, speed: UNIT_SPEED, armor: 0, radius: UR },
  // mace: 550 hp, armor 4, 1.25x1.25-block hitbox, 3.75 tiles/s
  mace: { hp: 550, speed: UNIT_SPEED, armor: 4, radius: UR * 1.25 },
  // flare: 70 hp, no armor, 1.125-block hitbox, 2.7 px/tick = 20.25 tiles/s
  flare: { hp: 70, speed: 20.25 * CELL, armor: 0, radius: UR * 1.125, flying: true },
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
  id: number;
  name: string;
  /** enemies entering the field per second — every wave drains at this rate */
  spawnRate: number;
  /** what the level throws at you, run start to finish in order */
  script: readonly LevelStep[];
}

// add a level by appending a spec here — the map itself is shared for now
export const LEVELS: readonly LevelSpec[] = [
  {
    id: 1,
    name: "Level 1",
    spawnRate: 60,
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
];
