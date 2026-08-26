import { CELL, HP0, UNIT_SPEED, UR } from "./constants";

export const UNIT_KINDS = ["dagger", "mace", "fortress", "crawler", "flare", "nova", "pulsar", "horizon", "zenith"] as const;
export type UnitKind = (typeof UNIT_KINDS)[number];
export type { TowerKind } from "./types";

/** numeric unit id — index into UNIT_KINDS, stored in the sim's ukind array */
export const UNIT_ID: Record<UnitKind, number> = {
  dagger: 0,
  mace: 1,
  fortress: 2,
  crawler: 3,
  flare: 4,
  nova: 5,
  pulsar: 6,
  horizon: 7,
  zenith: 8,
};

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
  /**
   * Mindustry RepairFieldAbility: every `reload` seconds, heal every unit
   * whose hitbox falls inside `range` by `amount`, capped at its max hp.
   * The healer is inside its own field, so it mends itself too.
   */
  repairField?: { amount: number; reload: number; range: number };
  /**
   * Mindustry ShieldRegenFieldAbility: every `reload` seconds, top every
   * unit in `range` up by `amount` of absorbing shield, never past `max`.
   * Shields soak damage before health does (see Sim.damageUnit).
   */
  shieldField?: { amount: number; max: number; reload: number; range: number };
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
  // nova: the T1 of the support line — 120 hp, armor 1, 1x1-block hitbox,
  // 0.55 px/tick = 4.125 tiles/s. Frailer than a dagger but a step quicker
  // RepairFieldAbility(10, 60*4, 60): 10 hp to everything within 7.5 tiles,
  // every 4 s — a nova escort keeps a dagger line topped up between volleys
  nova: {
    hp: 120,
    speed: 4.125 * CELL,
    armor: 1,
    radius: UR,
    scrap: 1,
    repairField: { amount: 10, reload: 4, range: 7.5 * CELL },
  },
  // pulsar: support T2 — 320 hp, armor 4 (a mace's plating on half its hp),
  // 1.375x1.375-block hitbox, 0.7 px/tick = 5.25 tiles/s: the line's fastest
  // walker, so it arrives ahead of the daggers it escorts
  // ShieldRegenFieldAbility(20, 40, 60*5, 60): +20 shield every 5 s up to a
  // 40-point cap, over the same 7.5-tile field
  pulsar: {
    hp: 320,
    speed: 5.25 * CELL,
    armor: 4,
    radius: UR * 1.375,
    scrap: 3,
    shieldField: { amount: 20, max: 40, reload: 5, range: 7.5 * CELL },
  },
  // horizon: the T2 bomber — 340 hp, armor 3, 1.375x1.375-block hitbox,
  // 1.65 px/tick = 12.375 tiles/s. Slower than a flare but four times the
  // health, and armour 3 blunts the scatter flak that shreds the T1
  horizon: {
    hp: 340,
    speed: 12.375 * CELL,
    armor: 3,
    radius: UR * 1.375,
    scrap: 4,
    flying: true,
  },
  // zenith: the T3 gunship — 700 hp, armor 5, a 2.5x2.5-block hitbox that
  // makes it the widest thing in the sky, at 1.7 px/tick = 12.75 tiles/s
  zenith: {
    hp: 700,
    speed: 12.75 * CELL,
    armor: 5,
    radius: UR * 2.5,
    scrap: 7,
    flying: true,
  },
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
  /** save key and display number — the world number, e.g. "2" */
  id: string;
  name: string;
  /** flavour name shown under the world number on its card */
  subtitle?: string;
  /** official map id this level plays on; the first official map when unset */
  map?: string;
  /** enemies entering the field per second — every wave drains at this rate */
  spawnRate: number;
  /** what the level throws at you, run start to finish in order */
  script: readonly LevelStep[];
}

/**
 * The campaign: a WORLD is one playable level on its own map, and they play
 * strictly in order — world N opens when world N-1 is cleared. Kills are the
 * only income: a finished run banks scrap per kill whether it ended in
 * victory or defeat, and winning pays in the next world rather than a bonus.
 * See progress.ts.
 */
export const WORLDS: readonly LevelSpec[] = [
  {
    id: "1",
    name: "World 1",
    subtitle: "The Foothills",
    map: "grass-s",
    spawnRate: 40,
    script: [
      { wait: 10 },
      { wave: { dagger: 10 } },
      { wait: 10 },
      { wave: { dagger: 20 } },
      { wait: 10 },
      { wave: { crawler: 10 } },
      { wait: 10 },
      { wave: { dagger: 20, crawler: 10 } },
      { wait: 10 },
      { wave: { dagger: 15, nova: 15 } },
      { wait: 10 },
      { wave: { dagger: 40, mace: 5 } },
      { wait: 10 },
      { wave: { dagger: 50, crawler: 20 } },
      { wait: 10 },
      { wave: { dagger: 60, mace: 8 } },
      { wait: 10 },
      { wave: { dagger: 40, crawler: 40 } },
      { wait: 10 },
      { wave: { dagger: 60, mace: 20 } },
      { wait: 10 },
      { wave: { dagger: 60, crawler: 100 } },
      { wait: 10 },
      { wave: { dagger: 100, mace: 30 } },
      { wait: 10 },
      { wave: { dagger: 100, crawler: 40, mace: 15 } },
      { wait: 10 },
      { wave: { dagger: 100, mace: 30 } },
      { wait: 10 },
      { wave: { dagger: 150, crawler: 50, mace: 50 } },
    ],
  },
  {
    id: "2",
    name: "World 2",
    subtitle: "The Dunes",
    map: "dunes-long",
    spawnRate: 60,
    script: [
      { wait: 10 },
      { wave: { dagger: 50 } },
      { wait: 10 },
      { wave: { crawler: 100 } },
      { wait: 10 },
      { wave: { flare: 15 } },
      { wait: 10 },
      { wave: { dagger: 50, mace: 50 } },
      { wait: 10 },
      { wave: [{ region: 1, flare: 25 }, { region: 2, dagger: 80 }] },
      { wait: 10 },
      { wave: [{ region: 1, mace: 50 }, { region: 3, fortress: 10 }] },
      { wait: 10 },
      { wave: [{ region: 1, flare: 20 }, { region: 2, dagger: 80 }, { region: 3, fortress: 20 }] },
      { wait: 10 },
      { wave: [{ region: 1, mace: 50 }, { region: 2, mace: 40 }, { region: 3, crawler: 200 }] },
      { wait: 10 },
      { wave: { flare: 150 } },
      { wait: 10 },
      { wave: { fortress: 50, crawler: 300 } },
      { wait: 10 },
      { wave: [{ region: 2, mace: 30 }, { region: 3, fortress: 30 }] },
      { wait: 12 },
      { wave: { dagger: 200, mace: 50, fortress: 30, crawler: 100, flare: 50 } },
      { wait: 12 },
      { wave: [{ region: 1, flare: 60 }, { region: 2, dagger: 200 }, { region: 3, mace: 60 }] },
      { wait: 12 },
      { wave: { flare: 250 } },
      { wait: 10 },
      { wave: [{ region: 1, flare: 80 }, { region: 2, dagger: 300 }, { region: 3, mace: 120 }] },
    ],
  },
  {
    id: "3",
    name: "World 3",
    subtitle: "Canyon Run",
    map: "stone-canyon",
    spawnRate: 60,
    script: [
      { wait: 10 },
      { wave: { dagger: 100 } },
      { wait: 10 },
      { wave: { dagger: 120, crawler: 40 } },
      { wait: 10 },
      // north canyon and south canyon each carry their own contingent
      { wave: [{ region: 1, dagger: 100 }, { region: 2, mace: 30 }] },
      { wait: 10 },
      { wave: { mace: 60, flare: 20 } },
      { wait: 10 },
      { wave: { dagger: 120, fortress: 5 } },
      { wait: 10 },
      { wave: [{ region: 1, flare: 40 }, { region: 2, dagger: 150 }] },
      { wait: 10 },
      { wave: { mace: 100, crawler: 60 } },
      { wait: 10 },
      { wave: { mace: 60, fortress: 10 } },
      { wait: 10 },
      { wave: [{ region: 1, dagger: 200 }, { region: 2, fortress: 10 }] },
      { wait: 10 },
      { wave: { flare: 60, mace: 80 } },
      { wait: 10 },
      { wave: { dagger: 250, crawler: 100 } },
      { wait: 10 },
      { wave: [{ region: 1, fortress: 15 }, { region: 2, mace: 120 }] },
      { wait: 12 },
      { wave: { dagger: 200, flare: 80 } },
      { wait: 12 },
      { wave: { mace: 100, fortress: 25 } },
      { wait: 12 },
      { wave: [{ region: 1, dagger: 300 }, { region: 2, flare: 80 }] },
      { wait: 12 },
      { wave: { mace: 200, fortress: 30 } },
      { wait: 12 },
      { wave: [{ region: 1, fortress: 40 }, { region: 2, dagger: 350 }] },
      { wait: 15 },
      { wave: { dagger: 400, mace: 200, fortress: 50, flare: 100 } },
    ],
  },
];

export function worldById(id: string): LevelSpec | null {
  return WORLDS.find((w) => w.id === id) ?? null;
}
