import { CELL, HP0, UNIT_SPEED, UR } from "./constants";
import { itemForTier, type Cost } from "./items";
import { explain, type SaveResult } from "./types";

export const UNIT_KINDS = ["dagger", "mace", "fortress", "crawler", "atrax", "spiroct", "flare", "nova", "pulsar", "horizon", "zenith"] as const;
export type UnitKind = (typeof UNIT_KINDS)[number];
export type { TowerKind } from "./types";

/** numeric unit id — index into UNIT_KINDS, stored in the sim's ukind array */
export const UNIT_ID: Record<UnitKind, number> = {
  dagger: 0,
  mace: 1,
  fortress: 2,
  crawler: 3,
  atrax: 4,
  spiroct: 5,
  flare: 6,
  nova: 7,
  pulsar: 8,
  horizon: 9,
  zenith: 10,
};

/** px per Mindustry world unit — leg geometry is written in those units */
const MU = CELL / 8;

/**
 * Mindustry LegsComp/UnitType leg fields: everything the walk cycle of a
 * many-legged unit needs. Lengths are world px (the Mindustry value x MU);
 * the ratios are unitless and carry their original meaning.
 *
 * A legged unit is NOT a mech: instead of two sprites sliding back and
 * forth under a chassis, every leg is a two-segment arm whose foot is
 * planted in the WORLD and only re-placed when its group's turn in the
 * gait comes round. The sim keeps the joint and foot of every leg (see
 * Sim.updateLegs) and the renderer strokes the segments between them.
 */
export interface LegSpec {
  /** how many legs ring the body */
  count: number;
  /** both segments together, px — each half is one segment */
  length: number;
  /** legs per gait group; a 6-legged insect steps 3 at a time (div 3) */
  groupSize: number;
  /** how fast a joint chases its IK solution (non-linear, per tick) */
  speed: number;
  /** how far ahead of the body a stepping foot is placed, as a fraction
   * of the gait's stride — low values make a unit plant its feet under
   * itself, high ones make it reach */
  forwardScl: number;
  /** scales the distance walked between one step and the next */
  moveSpace: number;
  /** the leg mount's own radius from the body center, px */
  baseOffset: number;
  /** for jointless legs: how far the lower segment is pulled back along
   * itself so it covers the joint, px */
  extension: number;
  /** desynchronizes the gait — leg i's stage is offset by i * this, px */
  pairOffset: number;
  /** how far out a leg TRIES to stand, as a fraction of its length */
  lengthScl: number;
  /** hard reach limits as fractions of leg length: a foot may never be
   * nearer than min or further than max from its mount */
  minLength: number;
  maxLength: number;
  /** UnitType.shadowElevation: how high a swinging foot rides above the
   * ground at the top of its step — the renderer offsets its shadow by it */
  elevation: number;
}

/** a LegSpec with Mindustry's UnitType defaults filled in */
const legs = (o: Partial<LegSpec> & Pick<LegSpec, "count" | "length">): LegSpec => ({
  groupSize: 2,
  speed: 0.1,
  forwardScl: 1,
  moveSpace: 1,
  baseOffset: 0,
  extension: 0,
  pairOffset: 0,
  lengthScl: 1,
  minLength: 0,
  maxLength: 1.75,
  elevation: 0,
  ...o,
});

export interface UnitStats {
  hp: number;
  /** world px/s */
  speed: number;
  /** flat damage shaved off every hit, floored at 10% of the raw shot */
  armor: number;
  /** collision radius in world px — half the square hitbox edge */
  radius: number;
  /**
   * Unit tier, 1-3 today. The tier alone decides WHICH currency a kill pays
   * out — T1 drops scrap, T2 copper, T3 titanium (see items.ts) — so a
   * level's enemy mix is what determines the resources a run banks.
   */
  tier: number;
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
  /**
   * A walking unit with real legs rather than a mech's sliding pair. Its
   * presence is what puts a kind on the legged draw path — see LEG_ART in
   * atlas.ts for the matching sprites.
   */
  legs?: LegSpec;
}

/** per-kind combat stats (official Mindustry numbers) */
export const UNIT_STATS: Record<UnitKind, UnitStats> = {
  // dagger: 150 hp, no armor, 1x1-block hitbox, 3.75 tiles/s
  dagger: { hp: HP0, speed: UNIT_SPEED, armor: 0, radius: UR, tier: 1 },
  // mace: 550 hp, armor 4, 1.25x1.25-block hitbox, 3.75 tiles/s
  mace: { hp: 550, speed: UNIT_SPEED, armor: 4, radius: UR * 1.25, tier: 2 },
  // fortress: 900 hp, armor 9, 1.625x1.625-block hitbox, 3.225 tiles/s
  // (0.43 px/tick) — the T3 heavy walks noticeably slower than the line
  fortress: { hp: 900, speed: 3.225 * CELL, armor: 9, radius: UR * 1.625, tier: 3 },
  // crawler: 150 hp, no armor, 1x1-block hitbox, 1 px/tick = 7.5 tiles/s —
  // twice the line's pace; the swarm closes distance before towers thin it
  crawler: { hp: 150, speed: 7.5 * CELL, armor: 0, radius: UR, tier: 1 },
  // atrax: the crawler line's T2 — 600 hp, armor 3, a 1.625x1.625-block
  // hitbox, 0.6 px/tick = 4.5 tiles/s. Where the crawler is a fast, frail
  // swarm, its successor plods: four legs carrying four times the health
  // legCount 4 / legLength 9 / legForwardScl 0.6 / legMoveSpace 1.4 — a
  // short reach and a wide gait, so it visibly hauls itself along
  atrax: {
    hp: 600,
    speed: 4.5 * CELL,
    armor: 3,
    radius: UR * 1.625,
    tier: 2,
    legs: legs({ count: 4, length: 9 * MU, forwardScl: 0.6, moveSpace: 1.4, elevation: 0.2 }),
  },
  // spiroct: the line's T3 — 1000 hp, armor 5, a 1.875x1.875-block hitbox,
  // 0.54 px/tick = 4.05 tiles/s, the slowest thing on the field. Six legs
  // on longer mounts (legBaseOffset 2) stepping three at a time
  spiroct: {
    hp: 1000,
    speed: 4.05 * CELL,
    armor: 5,
    radius: UR * 1.875,
    tier: 3,
    legs: legs({
      count: 6,
      length: 13 * MU,
      forwardScl: 0.8,
      moveSpace: 1.4,
      baseOffset: 2 * MU,
      elevation: 0.3,
    }),
  },
  // flare: 70 hp, no armor, 1.125-block hitbox, 2.7 px/tick = 20.25 tiles/s
  flare: { hp: 70, speed: 20.25 * CELL, armor: 0, radius: UR * 1.125, tier: 1, flying: true },
  // nova: the T1 of the support line — 120 hp, armor 1, 1x1-block hitbox,
  // 0.55 px/tick = 4.125 tiles/s. Frailer than a dagger but a step quicker
  // RepairFieldAbility(10, 60*4, 60): 10 hp to everything within 7.5 tiles,
  // every 4 s — a nova escort keeps a dagger line topped up between volleys
  nova: {
    hp: 120,
    speed: 4.125 * CELL,
    armor: 1,
    radius: UR,
    tier: 1,
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
    tier: 2,
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
    tier: 2,
    flying: true,
  },
  // zenith: the T3 gunship — 700 hp, armor 5, a 2.5x2.5-block hitbox that
  // makes it the widest thing in the sky, at 1.7 px/tick = 12.75 tiles/s
  zenith: {
    hp: 700,
    speed: 12.75 * CELL,
    armor: 5,
    radius: UR * 2.5,
    tier: 3,
    flying: true,
  },
};

/**
 * Mindustry's unit trees: each line is one factory's upgrade path, in tier
 * order. This is the shape a level author thinks in — "more ground, less
 * air" — so the level editor lays its unit inputs out one tree per row, and
 * a unit's position in a row is its tier.
 */
export const UNIT_TREES = [
  { name: "Ground", kinds: ["dagger", "mace", "fortress"] },
  { name: "Support", kinds: ["nova", "pulsar"] },
  { name: "Crawler", kinds: ["crawler", "atrax", "spiroct"] },
  { name: "Air", kinds: ["flare", "horizon", "zenith"] },
] as const satisfies readonly { name: string; kinds: readonly UnitKind[] }[];

/**
 * Every unit kind sits in exactly one tree. Adding a kind to UNIT_KINDS
 * without placing it in a tree fails this line rather than quietly dropping
 * it out of the editor, where nobody would notice it had gone missing.
 */
type UntreedKind = Exclude<UnitKind, (typeof UNIT_TREES)[number]["kinds"][number]>;
const _everyKindHasATree: UntreedKind extends never ? true : never = true;
void _everyKindHasATree;

/**
 * What one kill of this kind pays out: exactly ONE of its tier's item. The
 * tier is the whole drop table — a T2 kill is one copper whether it was a
 * mace or a pulsar — so a level's difficulty mix is the only thing that
 * decides what a run banks, and no unit is quietly worth more than its tier.
 */
export function unitDrop(kind: UnitKind): Cost {
  return { [itemForTier(UNIT_STATS[kind].tier)]: 1 };
}

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
 * One step of a level's script — always a wave. Its kinds drain together and
 * intermingled, all running out at the same moment, so `{ dagger: 10,
 * mace: 20 }` arrives as one mixed push rather than ten daggers followed by
 * twenty maces. The plain form spawns from any pad; the region-group form
 * pins each group to one spawn region: `{ wave: [{ region: 1, flare: 50 },
 * { region: 2, mace: 50 }] }` sends the flares from region 1's pads and the
 * maces from region 2's, both groups draining at once.
 *
 * Timing is NOT part of a step. Every level has one `waveGap` and the sim
 * holds for that long between waves, so pacing is a single number per level
 * instead of a wait row between every pair of waves.
 *
 * This is a one-variant union on purpose: keeping the `{ wave: … }` wrapper
 * means every `waveGroups(step.wave)` call site and every `"wave" in step`
 * guard survived the removal of the wait variant untouched.
 */
export type LevelStep = { wave: WaveUnits | readonly RegionWave[] };

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
  /**
   * save key — the world's ordinal as a string, e.g. "2". It is NOT shown
   * anywhere: a world is identified to the player only by its name, so this
   * must stay stable even when a world is renamed, or saves break
   */
  id: string;
  /** the world's only display name, e.g. "The Foothills" */
  name: string;
  /** official map id this level plays on; the first official map when unset */
  map?: string;
  /** enemies entering the field per second — every wave drains at this rate */
  spawnRate: number;
  /**
   * seconds held between waves, and before the first one. The clock starts
   * when the previous wave has finished ENTERING the field — the last unit
   * spawning, not the last unit dying — so a level whose waves outlive the
   * gap will have several on the field at once.
   */
  waveGap: number;
  /** what the level throws at you, run start to finish in order */
  script: LevelStep[];
  /**
   * Enemy level: every unit's health is multiplied by HP_PER_LEVEL^level
   * and nothing else moves — armour, speed, hitbox and drop stay at base.
   * Unset (the authored baseline) means level 0. Set by specForTier().
   */
  enemyLevel?: number;
  /** which rung of the ladder this spec was expanded for; unset = baseline */
  tier?: number;
}

/**
 * The editable half of a level: everything the admin level editor writes.
 * Identity and presentation (name, map) stay in code — an editor that could
 * rename a world or move it to another map would be editing the campaign's
 * structure, not its difficulty.
 */
export interface LevelDoc {
  id: string;
  spawnRate: number;
  waveGap: number;
  script: LevelStep[];
}

/** the document form of a level, for saving and for round-trip comparison */
export function levelDoc(spec: LevelSpec): LevelDoc {
  return {
    id: spec.id,
    spawnRate: spec.spawnRate,
    waveGap: spec.waveGap,
    script: spec.script,
  };
}

/**
 * The campaign: ONE world, played over and over at an ever-higher TIER.
 *
 * EVERY WAVE THE GAME WILL EVER SEND IS WRITTEN OUT BELOW, in order. The
 * tier does not generate waves — it decides HOW MANY OF THESE a run plays.
 * Tier 0 sends the first four, and every rung adds three more (see
 * WAVES_PER_TIER in ladder.ts), so:
 *
 *   tier  0   waves 1-4      tier  4   waves 1-16
 *   tier  1   waves 1-7      tier  8   waves 1-28
 *   tier  2   waves 1-10     tier 16   waves 1-52  (all of them)
 *
 * That is what makes climbing worth doing. A rung is not the same fight
 * with a bigger number on it — it is three waves of hand-authored fight
 * nobody has seen yet, on top of everything below. The enemy LEVEL rises
 * alongside (health only, x1.06 a level), and past the end of this list the
 * level keeps rising on its own, so the ladder never hard-stops; it just
 * stops adding new content until more waves are written here.
 *
 * Kills are the only income: a finished run banks each dead unit's tier
 * item whether it ended in victory or defeat, times the rung's drop bonus.
 *
 * TWO RULES WHEN EDITING THIS LIST.
 *
 * ONE — a wave's position IS its difficulty gate. Wave i first appears at
 * tier ceil((i - 4) / 3), so moving a wave earlier makes it arrive against
 * a smaller fleet. The comments below mark where each rung begins.
 *
 * TWO — a unit may not debut before the player can own a turret whose
 * per-shot damage exceeds its armour. Armour is flat, max(dmg - armor,
 * 0.1 * dmg), so a fortress (armour 9) against a duo (damage 9) hits the
 * 10% floor and reads as a 9,000-health unit rather than a 900-health one.
 * That is why the sky opens with flares, tier 3 opens with spiroct
 * (armour 5, still 4 damage a duo shot), and the fortress waits until
 * wave 26 — tier 8, five rungs after salvo's 28-damage shells go on sale.
 * debutViolations() in ladder.ts warns in dev if an edit breaks this.
 */
export const WORLDS: LevelSpec[] = [
  {
    id: "1",
    name: "The Foothills",
    map: "grass-s",
    // slow enough that a wave is still walking in when the next gap starts,
    // so the field reads as one continuous swarm rather than a set of pushes
    spawnRate: 20,
    waveGap: 15,
    script: [
      // ---------- tier 0: waves 1-4 -----------------------------------
      { wave: { dagger: 24 } },
      { wave: { dagger: 40, crawler: 25 } },
      { wave: { dagger: 50, mace: 6, nova: 12 } },
      { wave: { dagger: 60, mace: 24, fortress: 3, nova: 10 } },
      // ---------- tier 1: waves 5-7 -----------------------------------
      { wave: { dagger: 48, crawler: 44, nova: 10 } },
      { wave: { dagger: 44, mace: 25, pulsar: 8 } },
      { wave: { dagger: 52, fortress: 6, crawler: 50 } },
      // ---------- tier 2: waves 8-10 ----------------------------------
      { wave: { dagger: 45, flare: 34 } },
      { wave: { dagger: 70, mace: 22, atrax: 12, spiroct: 7 } },
      { wave: { crawler: 100, flare: 30, nova: 18 } },
      // ---------- tier 3: waves 11-13 ---------------------------------
      { wave: { dagger: 85, mace: 26, spiroct: 8, pulsar: 14 } },
      { wave: { dagger: 60, crawler: 80, flare: 50 } },
      { wave: { dagger: 85, atrax: 24, spiroct: 10, nova: 22 } },
      // ---------- tier 4: waves 14-16 ---------------------------------
      { wave: { dagger: 90, flare: 45, horizon: 20 } },
      { wave: { dagger: 100, mace: 40, atrax: 24, spiroct: 18 } },
      { wave: { crawler: 150, spiroct: 10, pulsar: 24 } },
      // ---------- tier 5: waves 17-19 ---------------------------------
      { wave: { mace: 30, spiroct: 8, flare: 70, horizon: 28 } },
      { wave: { dagger: 120, mace: 46, atrax: 30, pulsar: 20 } },
      { wave: { dagger: 110, crawler: 190, spiroct: 14 } },
      // ---------- tier 6: waves 20-22 ---------------------------------
      { wave: { flare: 80, horizon: 24, zenith: 10 } },
      { wave: { dagger: 170, mace: 50, atrax: 34, spiroct: 15 } },
      { wave: { crawler: 220, spiroct: 11, nova: 45, pulsar: 26 } },
      // ---------- tier 7: waves 23-25 ---------------------------------
      { wave: { dagger: 140, atrax: 24, horizon: 30, zenith: 14 } },
      { wave: { dagger: 190, mace: 62, spiroct: 18 } },
      { wave: { crawler: 250, spiroct: 15, flare: 80 } },
      // ---------- tier 8: waves 26-28 ---------------------------------
      { wave: { dagger: 90, mace: 48, fortress: 7, atrax: 30 } },
      { wave: { dagger: 210, crawler: 200, spiroct: 18, zenith: 10 } },
      { wave: { flare: 130, pulsar: 32, horizon: 42, zenith: 14 } },
      // ---------- tier 9: waves 29-31 ---------------------------------
      { wave: { dagger: 190, mace: 60, fortress: 9, spiroct: 15 } },
      { wave: { crawler: 280, atrax: 46, nova: 60 } },
      { wave: { flare: 150, horizon: 46, zenith: 17 } },
      // ---------- tier 10: waves 32-34 --------------------------------
      { wave: { dagger: 110, fortress: 11, atrax: 52, spiroct: 20, pulsar: 36 } },
      { wave: { dagger: 240, mace: 70, crawler: 240 } },
      { wave: { dagger: 170, flare: 120, horizon: 52, zenith: 19 } },
      // ---------- tier 11: waves 35-37 --------------------------------
      { wave: { dagger: 130, mace: 76, fortress: 13, spiroct: 22 } },
      { wave: { dagger: 230, crawler: 330, nova: 70, pulsar: 40 } },
      { wave: { atrax: 54, flare: 120, horizon: 58, zenith: 21 } },
      // ---------- tier 12: waves 38-40 --------------------------------
      { wave: { dagger: 150, fortress: 15, atrax: 62, spiroct: 26 } },
      { wave: { dagger: 280, mace: 88, crawler: 280, pulsar: 44 } },
      { wave: { fortress: 11, flare: 190, horizon: 66, zenith: 24 } },
      // ---------- tier 13: waves 41-43 --------------------------------
      { wave: { dagger: 170, mace: 100, fortress: 18, spiroct: 30 } },
      { wave: { dagger: 270, crawler: 380, atrax: 68, nova: 80 } },
      { wave: { spiroct: 24, flare: 150, horizon: 74, zenith: 27 } },
      // ---------- tier 14: waves 44-46 --------------------------------
      { wave: { dagger: 190, fortress: 21, atrax: 78, spiroct: 34, pulsar: 52 } },
      { wave: { dagger: 330, mace: 110, crawler: 330 } },
      { wave: { fortress: 15, flare: 220, horizon: 84, zenith: 31 } },
      // ---------- tier 15: waves 47-49 --------------------------------
      { wave: { dagger: 200, mace: 122, fortress: 25, atrax: 84, spiroct: 38 } },
      { wave: { dagger: 320, crawler: 440, nova: 92, pulsar: 58 } },
      { wave: { spiroct: 30, flare: 190, horizon: 96, zenith: 35 } },
      // ---------- tier 16: waves 50-52 --------------------------------
      { wave: { dagger: 230, fortress: 30, atrax: 96, spiroct: 42 } },
      { wave: { dagger: 370, mace: 132, crawler: 420, pulsar: 64 } },
      { wave: { fortress: 22, spiroct: 36, flare: 210, horizon: 108, zenith: 40 } },
    ],
  },
];

/** the campaign's only world — everything above tier 0 is ladder.ts */
export const WORLD = WORLDS[0];

export function worldById(id: string): LevelSpec | null {
  return WORLDS.find((w) => w.id === id) ?? null;
}

// ---------- level documents ----------

/**
 * Saved level documents live in public/maps' sibling, public/levels/<id>.json,
 * and are FETCHED rather than imported — same reasoning as the map documents
 * (see maps.ts): an imported JSON turns every editor save into a Turbopack
 * HMR update its runtime cannot hot-apply.
 *
 * Unlike maps, though, a level always exists in code first. WORLDS above is
 * the shipped campaign; a document, when one has been saved, REPLACES that
 * world's spawnRate and script wholesale. So the source of truth for an
 * edited level is its JSON, and for an untouched one it is the array above —
 * never a merge of the two.
 *
 * The overlay is applied IN PLACE, which is the whole reason this is safe to
 * call late: WORLDS is never empty, never re-ordered, and never a different
 * array object. Everything that reads it synchronously at module load —
 * Sim's `WORLDS[0]` default, WORLD, progress.ts sizing the opening loadout —
 * keeps working whether or not documents have loaded yet.
 *
 * The free opening loadout does NOT follow this script. It is a fixed
 * design constant (OPENING_DUOS in ladder.ts) because it is the difficulty
 * anchor: the author decides how hard the first run should be and writes
 * the opening waves to fit that fleet, rather than the fleet silently
 * growing to absorb whatever the waves became. `Check ladder` in the level
 * editor reports the gap.
 */
async function fetchLevelDoc(id: string): Promise<LevelDoc | null> {
  try {
    const res = await fetch(`/levels/${id}.json`, { cache: "no-store" });
    if (!res.ok) return null;
    return readLevelDoc(id, await res.json());
  } catch {
    return null; // offline or malformed: play the campaign as shipped
  }
}

/*
 * Both fetch helpers above swallow their own errors on purpose, and
 * loadLevelDocs therefore never rejects. That is load-bearing, not merely
 * tidy: Game.create awaits it in the same Promise.all as the map re-read at
 * level start, so a helper that threw would turn one unreadable level file
 * into a game that cannot start a run at all. Keep them total.
 */

/**
 * Which levels have a saved document, so the loader fetches only files that
 * exist. Blind-fetching every level instead would 404 for each unedited one,
 * and a browser logs a failed request as a console error whether or not the
 * caller catches it — three red lines on every page load, for the normal
 * case. The manifest ships as an empty list, so the common path is one 200
 * and no noise.
 */
async function fetchLevelIndex(): Promise<string[]> {
  try {
    const res = await fetch("/levels/index.json", { cache: "no-store" });
    if (!res.ok) return [];
    const ids = (await res.json()) as unknown;
    return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

/**
 * Validate a raw document and bring it up to the current shape. A
 * hand-mangled file must not take the campaign down, so anything that fails
 * to make sense returns null and the level plays as shipped.
 *
 * Documents written before pacing became per-level carry a `{ wait: n }`
 * step between their waves and no `waveGap`. Those are migrated rather than
 * rejected: the level keeps its waves in order and inherits the wait value
 * it used most often, which is the closest single number to what its author
 * actually built. Dropping the timings silently instead would quietly make
 * an edited level harder than it was saved.
 */
function readLevelDoc(id: string, raw: unknown): LevelDoc | null {
  if (!raw || typeof raw !== "object") return null;
  const d = raw as Partial<LevelDoc> & { script?: unknown };
  if (typeof d.spawnRate !== "number" || !(d.spawnRate > 0)) return null;
  if (!Array.isArray(d.script)) return null;

  const waits: number[] = [];
  const script: LevelStep[] = [];
  for (const step of d.script) {
    if (!step || typeof step !== "object") return null;
    if ("wait" in step) {
      const w = (step as { wait: unknown }).wait; // legacy per-step pacing
      if (typeof w !== "number" || !(w >= 0)) return null;
      waits.push(w);
      continue;
    }
    if (!("wave" in step)) return null;
    const wave = (step as { wave: unknown }).wave;
    if (typeof wave !== "object" || wave === null) return null;
    script.push(step as LevelStep);
  }

  const waveGap =
    typeof d.waveGap === "number" && d.waveGap >= 0 ? d.waveGap : commonest(waits);
  return { id, spawnRate: d.spawnRate, waveGap, script };
}

/** the most frequent value, ties going to the smaller; 10s if there are none */
function commonest(values: readonly number[]): number {
  if (values.length === 0) return 10;
  const seen = new Map<number, number>();
  for (const v of values) seen.set(v, (seen.get(v) ?? 0) + 1);
  return [...seen].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
}

/** overlay one document onto its world in place; unknown ids are ignored */
export function applyLevelDoc(doc: LevelDoc): void {
  const world = WORLDS.find((w) => w.id === doc.id);
  if (!world) return;
  world.spawnRate = doc.spawnRate;
  world.waveGap = doc.waveGap;
  world.script = doc.script;
}

/**
 * Pull every saved level document over the shipped campaign. Safe to call
 * more than once and safe to call late; a level with no document keeps
 * exactly what WORLDS declares.
 */
export async function loadLevelDocs(): Promise<void> {
  const ids = await fetchLevelIndex();
  const edited = ids.filter((id) => WORLDS.some((w) => w.id === id));
  const docs = await Promise.all(edited.map(fetchLevelDoc));
  for (const doc of docs) if (doc) applyLevelDoc(doc);
}

/**
 * Write a level document back to public/levels/<id>.json through the
 * dev-only API, and overlay it immediately so the running tab reflects the
 * save without a reload. false means the write failed and nothing changed
 * on disk — the editor keeps its dirty flag.
 */
export async function saveLevel(doc: LevelDoc): Promise<SaveResult> {
  let res: Response;
  try {
    res = await fetch("/api/levels", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(doc),
    });
  } catch (err) {
    const why = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `could not reach the dev server (${why})` };
  }
  if (!res.ok) return { ok: false, error: await explain(res) };
  applyLevelDoc(doc);
  return { ok: true };
}
