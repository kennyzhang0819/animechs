import { PAL, type TowerStats } from "./constants";
import { RARITIES, type Rarity, type RarityWeights } from "./rarity";
import type { TowerKind } from "./types";
import { faster, piercing, reaching, stronger } from "./upgrades";

/**
 * MODS — the run's UPGRADES, and the second thing the deal sells.
 *
 * THE PLAYER'S WORD FOR THESE IS "UPGRADE". The code's word is MOD,
 * because `upgrades.ts` is already taken by the tech tree's per-turret
 * rungs — a save's permanent, skill-point-bought branches — and the two
 * are nothing alike. A rung is bought once for the whole account and
 * belongs to a KIND; a mod is bought in scrap, inside one run, and dies
 * with it. Nothing here touches that file's namespace and nothing there
 * knows this one exists.
 *
 * A MOD IS A MODULE LIKE ANY OTHER. It carries one of the four rarities
 * (rarity.ts) and wears that band's border, exactly as a turret card and
 * a formation do — one palette, now answering "how good is this" a third
 * time. The deal's second button (G, economy.ts UPGRADE_ROLL_PRICE) rolls
 * a band and then a mod uniformly inside it, the same two-step every
 * table in this game uses.
 *
 * THERE ARE TWO SCOPES AND THEY ARE NOT THE SAME KIND OF THING.
 *
 *   GLOBAL — a RELIC. It lands the instant it is bought and it applies to
 *   EVERYTHING: every turret already standing, every turret still to come,
 *   the deal's own odds, what a kill pays, what happens when a structure
 *   falls. It is drawn on the top-left of the field for the rest of the
 *   run (components/Relics.tsx), Slay the Spire's shelf, because a rule
 *   that is always in force has to be always on screen.
 *
 *   TURRET — an ATTRIBUTE, and it is a CHANCE rather than a grant. Owning
 *   one does not improve a single gun on the board: it adds a roll to
 *   every turret PLACED FROM NOW ON (`chance`), and a turret that wins
 *   that roll carries the attribute for as long as it stands. So a turret
 *   mod is a bet on the future of the board, and the patch a card puts
 *   down comes out speckled — thirty-six turrets, four of them gleaming.
 *
 * THE WHOLE CATALOG BUFFS THE PLAYER. Nothing in this file weakens the
 * swarm: debuffing the enemy is the mutators' half of the game
 * (mutation.ts) and they pull the other way. An upgrade makes a turret
 * better at being a turret, and that is the only thing it may do.
 *
 * AN ULTRA MOD IS THE RUN CHANGING SHAPE. One draw in fifty (MOD_WEIGHTS)
 * and there are only three of them, so when one lands it has to be worth
 * the fifty: a turret that fires twice as fast for twice the damage, a
 * board where nothing dies the first time, a deal that hands out purple.
 * A "+15%" at the top band would be a betrayal of the border it wears.
 */

export const MOD_IDS = [
  // ---- turret attributes: a chance to be born on a new turret ----------
  "honed",
  "overclocked",
  "braced",
  "optics",
  "nanoweave",
  "sabot",
  "autoloader",
  "prototype",
  "bulwark",
  "singularity",
  // ---- globals: relics, in force the moment they are bought ------------
  "calibration",
  "coolant",
  "scavenger",
  "insurance",
  "phosphor",
  "lastVolley",
  "phoenix",
  "splitter",
  "undying",
  "ascendancy",
] as const;
export type ModId = (typeof MOD_IDS)[number];

/**
 * WHICH HALF OF THE SYSTEM A MOD IS IN. See the header: "global" is a
 * relic on the shelf, "turret" is a chance rolled at every placement.
 */
export type ModScope = "global" | "turret";

/**
 * The face a mod wears on its chip. There are no sprites for these — a
 * mod is not a building — so the shelf draws each one as a small piece of
 * geometry (components/Relics.tsx), and the glyph is what it draws. Two
 * mods may share a glyph only if they can never be owned at once; today
 * none do.
 */
export type ModGlyph =
  | "barrel"
  | "gear"
  | "plate"
  | "lens"
  | "weave"
  | "spike"
  | "belt"
  | "chassis"
  | "shield"
  | "singularity"
  | "crosshair"
  | "coolant"
  | "coin"
  | "vault"
  | "flame"
  | "volley"
  | "phoenix"
  | "fan"
  | "legion"
  | "star";

export interface ModDef {
  id: ModId;
  name: string;
  rarity: Rarity;
  scope: ModScope;
  glyph: ModGlyph;
  /** what owning it does, in the player's own terms — the hover card */
  blurb: string;
  /**
   * HOW MANY OF IT ONE RUN MAY HOLD. The roll never offers a mod already
   * at its cap (rollMod), so a late run's draws stay interesting instead
   * of grinding against a catalog it has finished.
   *
   * A stack means different things on the two sides of the scope. A
   * global's stack STRENGTHENS it (`apply` is handed the count). A turret
   * mod's stack raises the ODDS it is rolled onto a new turret and never
   * the effect — see chanceAt, and see the header for why the chance is
   * the whole mechanic there.
   */
  max: number;
  /**
   * TURRET MODS ONLY: the odds one new turret is born with this, per
   * stack owned. Read through chanceAt, never directly.
   *
   * These numbers are small on purpose and they are multiplied by the
   * size of a formation: a citadel is thirty-six placements, so a common
   * attribute at 0.30 speckles it with about eleven and an ultra at 0.05
   * with about two. The card is a PATCH, and the attribute is what makes
   * one patch different from the next.
   */
  chance?: number;
  /**
   * The stat surgery, if the mod is one — both scopes use it.
   *
   * A GLOBAL'S IS HANDED ITS STACK COUNT and folds every copy at once, so
   * three Calibration Matrices are one call and not three. A TURRET
   * MOD'S is handed 1 and ignores it: a turret either has the attribute
   * or does not.
   *
   * Mods with no `apply` are the behavioural ones — a revive, a refund, a
   * shift in the deal's odds — and the sim reads those BY NAME at the one
   * place each of them happens. There is no way to express "when a turret
   * dies" as a stat, and pretending otherwise would put a switch in the
   * hot loop for every one of them.
   */
  apply?: (s: TowerStats, stacks: number) => TowerStats;
  /**
   * A global that improves ONE TURRET KIND rather than the board — the
   * unique-turret relics (splitter: a fuse fires two extra spikes). Unset
   * is every kind. It is on the def rather than inside `apply` so that
   * refreshSpecs can skip the call entirely for the seventeen kinds a
   * relic has nothing to say about.
   */
  only?: TowerKind;
}

// ---------------------------------------------------------------------------
// THE TUNING BEHIND THE BEHAVIOURAL MODS
//
// Every number a global's effect needs, written here beside the def it
// belongs to rather than at the sim site that reads it — the sim owns WHEN
// a thing happens and this file owns HOW MUCH, the same split the mutators
// keep (mutation.ts).
// ---------------------------------------------------------------------------

/** nanoweave / bulwark: the fraction of its own pool a turret returns a second */
export const NANOWEAVE_REGEN = 0.02;
export const BULWARK_REGEN = 0.03;

/** insurance: the odds a wrecked turret pays out, and what it pays */
export const INSURANCE_CHANCE = 0.4;
export const INSURANCE_SCRAP = 500;

/** scavenger: what one stack adds to every kill's drop */
export const SCAVENGER_BONUS = 0.15;

/** last volley: the reload multiplier a death hands its neighbours, how
 *  long it lasts, and how far it reaches (in tiles) */
export const LAST_VOLLEY_RATE = 1.6;
export const LAST_VOLLEY_SECONDS = 6;
export const LAST_VOLLEY_TILES = 6;

/** phoenix: the odds a wrecked turret stands back up. Once per turret,
 *  ever — see Tower.rose */
export const PHOENIX_CHANCE = 0.25;

/**
 * ASCENDANCY: what the relic does to the TURRET deal's odds (rarity.ts
 * BASE_WEIGHTS). It multiplies the two top bands rather than replacing
 * the table, so a future relic that also bends the odds composes with it
 * instead of fighting it.
 *
 * Twenty times on purple is one draw in twenty rather than one in a
 * hundred — the run stops hoping for a 4x4 and starts planning around
 * them, which is exactly what an ultra relic should be worth.
 */
export const ASCENDANCY_MUL: Readonly<Record<Rarity, number>> = {
  common: 1,
  uncommon: 1,
  rare: 5,
  ultra: 20,
};

// ---------------------------------------------------------------------------
// THE CATALOG
// ---------------------------------------------------------------------------

/** a turret with a fatter pool — `health` is pre-scale (constants.ts towerMaxHp) */
const tougher = (s: TowerStats, mul: number): TowerStats => ({ ...s, health: s.health * mul });

const TURRET_MODS: readonly ModDef[] = [
  {
    id: "honed",
    name: "Honed Barrels",
    rarity: "common",
    scope: "turret",
    glyph: "barrel",
    max: 3,
    chance: 0.3,
    blurb: "New turrets have a chance to deal 25% more damage.",
    apply: (s) => stronger(s, 1.25),
  },
  {
    id: "overclocked",
    name: "Overclocked Breech",
    rarity: "common",
    scope: "turret",
    glyph: "gear",
    max: 3,
    chance: 0.3,
    blurb: "New turrets have a chance to fire 25% faster.",
    apply: (s) => faster(s, 1.25),
  },
  {
    id: "braced",
    name: "Braced Frame",
    rarity: "common",
    scope: "turret",
    glyph: "plate",
    max: 3,
    chance: 0.3,
    blurb: "New turrets have a chance to carry 50% more health.",
    apply: (s) => tougher(s, 1.5),
  },
  {
    id: "optics",
    name: "Long Optics",
    rarity: "common",
    scope: "turret",
    glyph: "lens",
    max: 3,
    chance: 0.25,
    blurb: "New turrets have a chance to reach 20% further.",
    apply: (s) => reaching(s, 1.2),
  },
  {
    id: "nanoweave",
    name: "Nanoweave",
    rarity: "uncommon",
    scope: "turret",
    glyph: "weave",
    max: 3,
    chance: 0.2,
    // the one attribute that changes what a turret IS rather than what it
    // does: a structure that heals itself survives the tide it lost to
    blurb: "New turrets have a chance to repair 2% of their health a second.",
  },
  {
    id: "sabot",
    name: "Sabot Rounds",
    rarity: "uncommon",
    scope: "turret",
    glyph: "spike",
    max: 3,
    chance: 0.18,
    blurb: "New turrets have a chance to punch through one extra body.",
    apply: (s) => piercing(s, 1),
  },
  {
    id: "autoloader",
    name: "Autoloader",
    rarity: "uncommon",
    scope: "turret",
    glyph: "belt",
    max: 3,
    chance: 0.18,
    blurb: "New turrets have a chance to fire 50% faster and reach 15% further.",
    apply: (s) => reaching(faster(s, 1.5), 1.15),
  },
  {
    id: "prototype",
    name: "Prototype Chassis",
    rarity: "rare",
    scope: "turret",
    glyph: "chassis",
    max: 2,
    chance: 0.12,
    blurb: "New turrets have a chance to gain 40% damage, 30% fire rate and 25% range.",
    apply: (s) => reaching(faster(stronger(s, 1.4), 1.3), 1.25),
  },
  {
    id: "bulwark",
    name: "Bulwark Plating",
    rarity: "rare",
    scope: "turret",
    glyph: "shield",
    max: 2,
    chance: 0.12,
    blurb:
      "New turrets have a chance to carry 150% more health and repair 3% of it a second.",
    apply: (s) => tougher(s, 2.5),
  },
  {
    id: "singularity",
    name: "Singularity Core",
    rarity: "ultra",
    scope: "turret",
    glyph: "singularity",
    max: 1,
    // 5% of thirty-six placements is about two per citadel, and two
    // doubled turrets in a patch is a patch that reads differently
    chance: 0.05,
    blurb:
      "New turrets have a chance to be born SINGULAR: double damage, double fire rate, 40% more range, and their shots punch through one extra body.",
    apply: (s) => piercing(reaching(faster(stronger(s, 2), 2), 1.4), 1),
  },
];

const GLOBAL_MODS: readonly ModDef[] = [
  {
    id: "calibration",
    name: "Calibration Matrix",
    rarity: "common",
    scope: "global",
    glyph: "crosshair",
    max: 3,
    blurb: "Every turret on the field deals 10% more damage. Stacks.",
    apply: (s, n) => stronger(s, 1 + 0.1 * n),
  },
  {
    id: "coolant",
    name: "Coolant Loop",
    rarity: "common",
    scope: "global",
    glyph: "coolant",
    max: 3,
    blurb: "Every turret on the field fires 10% faster. Stacks.",
    apply: (s, n) => faster(s, 1 + 0.1 * n),
  },
  {
    id: "scavenger",
    name: "Scavenger Rig",
    rarity: "common",
    scope: "global",
    glyph: "coin",
    max: 3,
    blurb: "Every kill pays 15% more scrap. Stacks.",
  },
  {
    id: "insurance",
    name: "Salvage Insurance",
    rarity: "uncommon",
    scope: "global",
    glyph: "vault",
    max: 1,
    blurb: "A destroyed turret has a 40% chance to pay out 500 scrap.",
  },
  {
    id: "phosphor",
    name: "Phosphor Rounds",
    rarity: "uncommon",
    scope: "global",
    glyph: "flame",
    max: 1,
    // the "bullet upgrade that changes what an attack LOOKS like": every
    // round on the board goes white-hot, muzzle spray and hit included
    blurb: "Every shot on the field burns phosphor-white, and deals 12% more damage.",
    apply: (s) => {
      const hot = stronger(s, 1.12);
      return {
        ...hot,
        bullet: {
          ...hot.bullet,
          fxColor: PAL.bulletYellow,
          ...(hot.bullet.sprite
            ? {
                sprite: {
                  ...hot.bullet.sprite,
                  front: PAL.white,
                  back: PAL.bulletYellowBack,
                },
              }
            : null),
        },
      };
    },
  },
  {
    id: "lastVolley",
    name: "Last Volley",
    rarity: "uncommon",
    scope: "global",
    glyph: "volley",
    max: 1,
    blurb:
      "A destroyed turret spends its last charge on its neighbours: every turret within 6 tiles fires 60% faster for 6 seconds.",
  },
  {
    id: "phoenix",
    name: "Phoenix Protocol",
    rarity: "rare",
    scope: "global",
    glyph: "phoenix",
    max: 1,
    blurb: "A destroyed turret has a 25% chance to stand straight back up at full health. Once each.",
  },
  {
    id: "splitter",
    name: "Splitter Array",
    rarity: "rare",
    scope: "global",
    glyph: "fan",
    max: 1,
    only: "fuse",
    blurb: "Every fuse fires two extra spikes — five to the volley instead of three.",
    apply: (s) => ({ ...s, shots: s.shots + 2 }),
  },
  {
    id: "undying",
    name: "Undying Legion",
    rarity: "ultra",
    scope: "global",
    glyph: "legion",
    max: 1,
    blurb:
      "EVERY turret you own stands back up once, at full health, the first time it is destroyed — the ones already on the field included.",
  },
  {
    id: "ascendancy",
    name: "Ascendancy Protocol",
    rarity: "ultra",
    scope: "global",
    glyph: "star",
    max: 1,
    blurb:
      "The deal starts handing over the big guns: rare turrets come up five times as often and ULTRA turrets twenty times as often, for the rest of the run.",
  },
];

export const MODS: readonly ModDef[] = [...TURRET_MODS, ...GLOBAL_MODS];

const BY_ID = new Map<ModId, ModDef>(MODS.map((m) => [m.id, m]));

export const modDef = (id: ModId): ModDef => {
  const d = BY_ID.get(id);
  if (!d) throw new Error(`no such mod: ${id}`);
  return d;
};

/** every mod of one scope, in catalog order */
export const modsOfScope = (scope: ModScope): readonly ModDef[] =>
  MODS.filter((m) => m.scope === scope);

/** every mod of one band, in catalog order — for the codex */
export const modsOfRarity = (r: Rarity): readonly ModDef[] => MODS.filter((m) => m.rarity === r);

/**
 * THE TURRET ATTRIBUTES, IN A FIXED ORDER, because a turret carries the
 * ones it rolled as a BITMASK (Tower.mods) and not a list. A board is
 * hundreds of structures deep and a placement puts down up to thirty-six
 * at once; an array per turret would be an allocation per turret for a
 * field that is empty on most of them.
 *
 * The order is the catalog's, so adding an attribute appends a bit and
 * moves nothing. A run does not survive a reload, so no saved mask can
 * ever be read against a different order.
 */
export const TURRET_MOD_IDS: readonly ModId[] = TURRET_MODS.map((m) => m.id);

const BIT: ReadonlyMap<ModId, number> = new Map(TURRET_MOD_IDS.map((id, i) => [id, 1 << i]));

/** the bit one turret attribute occupies in Tower.mods, or 0 for a global */
export const modBit = (id: ModId): number => BIT.get(id) ?? 0;

/** does this turret carry that attribute? */
export const hasMod = (mask: number, id: ModId): boolean => (mask & modBit(id)) !== 0;

/** every attribute a mask carries, in catalog order — what a chip row reads */
export const modsInMask = (mask: number): ModDef[] =>
  TURRET_MOD_IDS.filter((id) => (mask & modBit(id)) !== 0).map(modDef);

/**
 * THE BAND A MODDED TURRET IS MARKED IN: the deepest band among the
 * attributes it rolled, or null for a plain one. The field draws one pip
 * per turret and it can only be one colour, and the honest one is the
 * best thing the turret has.
 */
export function maskRarity(mask: number): Rarity | null {
  let best: Rarity | null = null;
  let bestAt = -1;
  for (const id of TURRET_MOD_IDS) {
    if ((mask & modBit(id)) === 0) continue;
    const at = RARITIES.indexOf(modDef(id).rarity);
    if (at > bestAt) {
      bestAt = at;
      best = modDef(id).rarity;
    }
  }
  return best;
}

/**
 * THE ODDS ONE NEW TURRET IS BORN WITH THIS ATTRIBUTE, given how many
 * copies of it the run owns.
 *
 * Stacks are INDEPENDENT ROLLS folded into one probability, not a sum:
 * three copies of a 0.30 attribute is 1 - 0.7^3 = 0.657 and never 0.9,
 * so a stack always helps and can never reach certainty. A global's
 * stack strengthens the effect instead — see ModDef.max.
 */
export function chanceAt(id: ModId, stacks: number): number {
  const d = modDef(id);
  if (d.scope !== "turret" || !d.chance || stacks <= 0) return 0;
  return 1 - (1 - Math.min(1, d.chance)) ** stacks;
}

/**
 * WHICH ATTRIBUTES A TURRET PLACED RIGHT NOW IS BORN WITH — one roll per
 * attribute the run owns, independent of each other, folded to a mask.
 *
 * Independent rather than "at most one": a run that has banked five
 * attributes has bought the right to a turret carrying three of them, and
 * that turret is the story of the run. The odds make it rare on its own.
 */
export function rollTurretMods(
  owned: Readonly<Partial<Record<ModId, number>>>,
  rng: () => number = Math.random,
): number {
  let mask = 0;
  for (const id of TURRET_MOD_IDS) {
    const n = owned[id] ?? 0;
    if (n > 0 && rng() < chanceAt(id, n)) mask |= modBit(id);
  }
  return mask;
}

/** the attributes in a mask folded onto a turret's stats, catalog order */
export function applyTurretMods(s: TowerStats, mask: number): TowerStats {
  if (mask === 0) return s;
  let out = s;
  for (const id of TURRET_MOD_IDS) {
    if ((mask & modBit(id)) === 0) continue;
    const f = modDef(id).apply;
    if (f) out = f(out, 1);
  }
  return out;
}

/**
 * ...and the run's RELICS folded onto one kind's stats. Called once per
 * kind per refreshSpecs and never per shot — see Sim.specs.
 */
export function applyGlobalMods(
  s: TowerStats,
  kind: TowerKind,
  owned: Readonly<Partial<Record<ModId, number>>>,
): TowerStats {
  let out = s;
  for (const d of GLOBAL_MODS) {
    const n = owned[d.id] ?? 0;
    if (n <= 0 || !d.apply) continue;
    if (d.only && d.only !== kind) continue;
    out = d.apply(out, n);
  }
  return out;
}

/** the fraction of its own pool one turret's attributes repair a second */
export function modRegen(mask: number): number {
  let r = 0;
  if (hasMod(mask, "nanoweave")) r += NANOWEAVE_REGEN;
  if (hasMod(mask, "bulwark")) r += BULWARK_REGEN;
  return r;
}

/**
 * THE ODDS AT THE UPGRADE BUTTON, and they are STEEPER THAN THE TURRET
 * DEAL'S at the top: one draw in fifty is purple against the formation
 * table's one in ten. A formation is spent the moment it is placed and an
 * upgrade is owned for the rest of the run, so the two cannot possibly be
 * priced against the same curve.
 *
 * Relative, like every weight table here, and renormalised over the bands
 * that still have an unowned mod in them (rollMod) — so a run that has
 * taken every common keeps drawing.
 */
export const MOD_WEIGHTS: RarityWeights = {
  common: 52,
  uncommon: 30,
  rare: 16,
  ultra: 2,
};

/**
 * ONE DRAW OFF THE UPGRADE TABLE: a band against the weights, then a mod
 * uniformly inside it — the deal's own two-step (rarity.ts rollTurret),
 * for the same reason: adding a fourth ultra mod must make WHICH ultra
 * less predictable and never make ultras more likely.
 *
 * A MOD AT ITS CAP IS NOT IN THE POOL. `owned` is the run's stacks, and a
 * mod with max copies is skipped and its band's weight redistributed — a
 * late run draws from what is left rather than paying to be told it
 * already has the thing. Null when the whole catalog is owned out, which
 * is the one case the button must refuse.
 */
export function rollMod(
  owned: Readonly<Partial<Record<ModId, number>>> = {},
  weights: RarityWeights = MOD_WEIGHTS,
  rng: () => number = Math.random,
): ModId | null {
  const byRarity = new Map<Rarity, ModId[]>();
  for (const m of MODS) {
    if ((owned[m.id] ?? 0) >= m.max) continue;
    const list = byRarity.get(m.rarity);
    if (list) list.push(m.id);
    else byRarity.set(m.rarity, [m.id]);
  }
  const live = RARITIES.filter((r) => (byRarity.get(r)?.length ?? 0) > 0);
  if (live.length === 0) return null;
  const pick = (r: Rarity): ModId => {
    const list = byRarity.get(r)!;
    return list[Math.floor(rng() * list.length) % list.length];
  };
  const total = live.reduce((n, r) => n + Math.max(0, weights[r]), 0);
  if (total <= 0) return pick(live[live.length - 1]);
  let n = rng() * total;
  for (const r of live) {
    n -= Math.max(0, weights[r]);
    if (n <= 0) return pick(r);
  }
  return pick(live[live.length - 1]);
}

/** is there anything left in the catalog to draw? — what greys the button
 *  out on a run that has bought the whole table */
export const anyModLeft = (owned: Readonly<Partial<Record<ModId, number>>>): boolean =>
  MODS.some((m) => (owned[m.id] ?? 0) < m.max);

/** the turret deal's odds as the run's relics leave them (ascendancy) */
export function shiftedWeights(
  base: RarityWeights,
  owned: Readonly<Partial<Record<ModId, number>>>,
): RarityWeights {
  if (!(owned.ascendancy ?? 0)) return base;
  return Object.fromEntries(
    RARITIES.map((r) => [r, base[r] * ASCENDANCY_MUL[r]]),
  ) as unknown as RarityWeights;
}

/** what one kill pays, times this — the scavenger relic and nothing else */
export const dropScale = (owned: Readonly<Partial<Record<ModId, number>>>): number =>
  1 + SCAVENGER_BONUS * (owned.scavenger ?? 0);

/**
 * A MASK IS A 32-BIT NUMBER and the attributes have to fit in one —
 * checked at import, so the day a thirty-first is written the build says
 * so rather than the thirty-first silently doing nothing.
 */
(() => {
  if (TURRET_MOD_IDS.length > 30)
    throw new Error(
      `${TURRET_MOD_IDS.length} turret attributes will not fit in Tower.mods — widen the mask`,
    );
  for (const m of TURRET_MODS)
    if (!m.chance) throw new Error(`the turret mod "${m.id}" has no chance to be rolled`);
  for (const m of GLOBAL_MODS)
    if (m.chance) throw new Error(`the global mod "${m.id}" carries a placement chance`);
  if (new Set(MODS.map((m) => m.glyph)).size !== MODS.length)
    throw new Error("two mods wear the same glyph — the shelf cannot tell them apart");
})();
