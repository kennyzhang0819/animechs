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

export interface LevelSpec {
  id: number;
  name: string;
  /** enemies entering the field per second */
  spawnRate: number;
  /** what the level throws at you, spawned in order */
  enemies: ReadonlyArray<{ kind: UnitKind; count: number }>;
}

// add a level by appending a spec here — the map itself is shared for now
export const LEVELS: readonly LevelSpec[] = [
  {
    id: 1,
    name: "Level 1",
    spawnRate: 60,
    enemies: [
      { kind: "dagger", count: 500 },
      { kind: "mace", count: 100 },
      { kind: "flare", count: 200 },
    ],
  },
];
