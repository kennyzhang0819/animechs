import { CELL, HP0, UNIT_SPEED, UR } from "./constants";

export const UNIT_KINDS = ["dagger", "mace", "fortress", "crawler", "flare"] as const;
export type UnitKind = (typeof UNIT_KINDS)[number];
export type { TowerKind } from "./types";

/** numeric unit id — index into UNIT_KINDS, stored in the sim's ukind array */
export const UNIT_ID: Record<UnitKind, number> = { dagger: 0, mace: 1, fortress: 2, crawler: 3, flare: 4 };

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
  // fortress: 900 hp, armor 9, 1.625x1.625-block hitbox, 3.225 tiles/s
  // (0.43 px/tick) — the T3 heavy walks noticeably slower than the line
  fortress: { hp: 900, speed: 3.225 * CELL, armor: 9, radius: UR * 1.625, scrap: 8 },
  // crawler: 150 hp, no armor, 1x1-block hitbox, 1 px/tick = 7.5 tiles/s —
  // twice the line's pace; the swarm closes distance before towers thin it
  crawler: { hp: 150, speed: 7.5 * CELL, armor: 0, radius: UR, scrap: 1 },
  // flare: 70 hp, no armor, 1.125-block hitbox, 2.7 px/tick = 20.25 tiles/s
  flare: { hp: 70, speed: 20.25 * CELL, armor: 0, radius: UR * 1.125, scrap: 2, flying: true },
};

/** largest unit radius — pads broad-phase bounds that must cover any unit */
export const UNIT_RMAX = Math.max(...UNIT_KINDS.map((k) => UNIT_STATS[k].radius));

/** how many of each kind a wave (or one region's share of it) sends */
export type WaveUnits = Partial<Record<UnitKind, number>>;

/**
 * One region's contingent of a wave. Its units enter ONLY on the spawn pads
 * carrying this region id in the map document's spawn layer — pad choice
 * and order are random within the region, never across regions.
 */
export type RegionWave = WaveUnits & { region: number };

/**
 * One step of a level's script. A wave says how many of each kind to send;
 * its kinds drain together and intermingled, all running out at the same
 * moment, so `{ dagger: 10, mace: 20 }` arrives as one mixed push rather
 * than ten daggers followed by twenty maces. The plain form spawns from any
 * pad; the region-group form pins each group to one spawn region:
 * `{ wave: [{ region: 1, flare: 50 }, { region: 2, mace: 50 }] }` sends the
 * flares from region 1's pads and the maces from region 2's, both groups
 * draining at once. A wait holds for that many seconds once the previous
 * wave has finished entering the field — the clock starts when the last
 * unit spawns, not when it dies.
 */
export type LevelStep =
  | { wave: WaveUnits | readonly RegionWave[] }
  | { wait: number };

/**
 * Normalize a wave into region groups with counts indexed like UNIT_KINDS.
 * The plain kind-count form becomes one region-0 group (region 0 = any
 * pad); groups with nothing in them are dropped.
 */
export function waveGroups(
  wave: WaveUnits | readonly RegionWave[],
): { region: number; counts: number[] }[] {
  const specs: readonly RegionWave[] = Array.isArray(wave) ? wave : [{ region: 0, ...wave }];
  const groups: { region: number; counts: number[] }[] = [];
  for (const spec of specs) {
    const counts = UNIT_KINDS.map((k) => Math.max(0, spec[k] ?? 0));
    if (counts.some((c) => c > 0)) groups.push({ region: spec.region, counts });
  }
  return groups;
}

export interface LevelSpec {
  /** save key and display number, "world-index" (e.g. "2-1") */
  id: string;
  name: string;
  /** official map id this level plays on; the first official map when unset */
  map?: string;
  /** enemies entering the field per second — every wave drains at this rate */
  spawnRate: number;
  /** what the level throws at you, run start to finish in order */
  script: readonly LevelStep[];
}

export interface WorldSpec {
  id: number;
  name: string;
  levels: readonly LevelSpec[];
}

/**
 * The campaign: worlds play strictly in order, and so do the levels inside
 * each one — a level is playable once the one before it (across the whole
 * flattened list) has been cleared. Kills are the only income: a finished
 * run banks scrap per kill whether it ended in victory or defeat, and
 * winning pays in the next level rather than a bonus. See progress.ts.
 */
export const WORLDS: readonly WorldSpec[] = [
  {
    id: 1,
    name: "The Foothills",
    levels: [
      {
        id: "1-1",
        name: "First Contact",
        spawnRate: 30,
        script: [
          { wait: 10 },
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
        spawnRate: 40,
        script: [
          { wait: 8 },
          { wave: { dagger: 40 } },
          { wait: 10 },
          { wave: { dagger: 60, crawler: 10 } },
          { wait: 10 },
          { wave: { dagger: 60, mace: 5 } },
          { wait: 10 },
          { wave: { dagger: 80, mace: 10, crawler: 20 } },
        ],
      },
      {
        id: "1-3",
        name: "The Dagger Problem",
        spawnRate: 60,
        script: [
          { wait: 10 },
          { wave: { dagger: 50 } },
          { wait: 20 },
          { wave: { dagger: 100, mace: 10 } },
          { wait: 20 },
          { wave: { mace: 35 } },
          { wait: 20 },
          { wave: { dagger: 150, mace: 50 } },
          { wait: 20 },
          { wave: { dagger: 100, mace: 100 } },
        ],
      },
    ],
  },
  {
    id: 2,
    name: "The Dunes",
    levels: [
      {
        id: "2-1",
        name: "Air Raid",
        spawnRate: 60,
        script: [
          { wait: 8 },
          { wave: { dagger: 60, crawler: 20 } },
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
        spawnRate: 80,
        script: [
          { wait: 8 },
          { wave: { dagger: 120, mace: 20 } },
          { wait: 10 },
          { wave: { flare: 40, crawler: 40 } },
          { wait: 10 },
          { wave: { dagger: 200, mace: 40, fortress: 5 } },
          { wait: 12 },
          { wave: { dagger: 250, mace: 60, flare: 40 } },
        ],
      },
      {
        id: "2-3",
        name: "The Horde",
        map: "desert-3way",
        spawnRate: 60,
        script: [
          { wait: 10 },
          { wave: { dagger: 300, mace: 50 } },
          { wait: 20 },
          { wave: { mace: 30, flare: 20 } },
          { wait: 20 },
          { wave: { mace: 300 } },
          { wait: 20 },
          { wave: { fortress: 50 } },
          { wait: 20 },
          { wave: { flare: 200, mace: 200 } },
          { wait: 20 },
          { wave: { flare: 50, dagger: 300, mace: 300, fortress: 300 } },
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
