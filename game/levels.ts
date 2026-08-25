import { HP0, UNIT_SPEED } from "./constants";

export type UnitKind = "dagger";
export type TowerKind = "salvo";

/** per-kind combat stats (official Mindustry numbers) */
export const UNIT_STATS: Record<UnitKind, { hp: number; speed: number }> = {
  dagger: { hp: HP0, speed: UNIT_SPEED },
};

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
    enemies: [{ kind: "dagger", count: 500 }],
  },
];
