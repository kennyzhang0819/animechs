import { PAL, type TowerStats } from "./constants";
import { RARITIES, weightDial, type Rarity, type RarityWeights, type WeightDial } from "./rarity";
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
 * time. A press rolls a band and then a mod uniformly inside it, the same
 * two-step every table in this game uses.
 *
 * THERE ARE TWO SCOPES, THEY ARE NOT THE SAME KIND OF THING, AND THEY ARE
 * SOLD BY TWO DIFFERENT BUTTONS. The corner's "Buy mods" (M) draws from
 * the turret half and "Buy relics" (R) from the global half, at prices of
 * their own (economy.ts MOD_ROLL_PRICE, RELIC_ROLL_PRICE) — see rollMod's
 * `scope`. They used to be one button and one coin-flip between the two,
 * which meant a player who needed a relic paid relic money for even odds
 * of an attribute; a purchase whose SCOPE is random is a purchase the
 * player cannot aim, and the two halves below are exactly the two things
 * a player is ever trying to aim at.
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
 * EVERY ATTRIBUTE IS ROLLED FOR EVERY TURRET, INDEPENDENTLY. There is no
 * "at most one": a placement rolls once per attribute the run owns
 * (rollTurretMods), so a turret can come out carrying all of them, and
 * the odds alone make that rare. That is why the low bands are small
 * numbers — a run banking ten attributes is stacking ten multipliers on
 * the same gun, and a common worth a quarter of a turret would compound
 * into nonsense by wave twenty.
 *
 * A TURRET MOD IS A STAT TWEAK AND NOTHING ELSE. Damage, fire rate,
 * range, pierce, health, repair — `apply` and `regen`, and no behaviour
 * anywhere. Behaviour is the RELIC half's job: a revive, a refund, a
 * shift in the deal's odds are all things that happen at a moment, and a
 * moment is not a number on a turret. Keeping the two apart is what lets
 * a turret's stats be composed once at the placement and then read flat
 * by the fire loop (Tower.spec) instead of switched on per shot.
 *
 * A TURRET ATTRIBUTE HAS NO CAP AND A RELIC HAS ONE OF EXACTLY ONE.
 * There is no third rule and no per-mod number to look up: an attribute is
 * a standing CHANCE, so a second copy is simply better odds and a
 * twentieth is better odds again — nothing about the board stops a run
 * fielding ten sniper turrets, and the only thing making that rare is how
 * rarely the top band comes up at all. A relic is a rule in force; a rule
 * does not get more in force, so owning it twice would have to mean
 * something and there is nothing for it to mean.
 *
 * SO NOTHING ON SCREEN SAYS ANY OF THIS. The boards used to print "One a
 * run" and "Up to 2 of them" and "Stacks without limit" under every
 * module, which is a line of housekeeping repeated twenty times to say
 * what two sentences of the rules say once. A relic is self-explanatory;
 * an attribute's only number is its odds, and the odds are already there.
 *
 * ONLY THE RARE AND ULTRA ATTRIBUTES HAVE NAMES. A common is not a
 * character, it is a tick: "+10% damage" IS its name, and a made-up one
 * over the top of that ("Honed Barrels") is a word the player has to
 * learn in order to be told a thing the number already said. So the low
 * bands print their tweak and the top two print a name — and the glyph
 * says WHICH STAT while the band colour says HOW MUCH, so a grey barrel
 * and a blue barrel are the same stat at two sizes and need no caption at
 * all. Relics keep their names, all of them: a relic is never a number.
 *
 * THE WHOLE CATALOG BUFFS THE PLAYER, on balance. Nothing here weakens
 * the swarm — debuffing the enemy is the mutators' half of the game
 * (mutation.ts) and they pull the other way — but an ULTRA attribute may
 * pay for its size by gutting a stat the build does not want, which is
 * what makes it a build and not a bonus.
 *
 * AN ULTRA MOD IS THE TURRET CHANGING SPECIES. One draw in fifty
 * (MOD_WEIGHTS), so when one lands it has to be worth the fifty: a
 * SNIPER that reaches four times as far and dies to a stiff breeze, an
 * ALL ROUND that is simply better at everything, and a GIANT that is
 * twice the building and eats the whole card to be it. A "+15%" at the
 * top band would be a betrayal of the border it wears.
 */

export const MOD_IDS = [
  // ---- turret attributes: a chance to be born on a new turret ----------
  // the unnamed ticks first, band by band — their id is the stat and the
  // step, because their LABEL is the tweak (see the header)
  "dmg1",
  "rate1",
  "hp1",
  "range1",
  "dmg2",
  "rate2",
  "hp2",
  "range2",
  "pierce1",
  "regen1",
  // ...then the named ones
  "prototype",
  "bulwark",
  "sabot",
  "giant",
  "sniper",
  "allround",
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
 * geometry (components/Relics.tsx), and the glyph is what it draws.
 *
 * THE GLYPH IS THE STAT AND THE COLOUR IS THE SIZE. A barrel is damage
 * whatever band it wears, so the four unnamed damage ticks and the rare
 * that is mostly damage all wear one, and what tells them apart is the
 * border — which is the same thing that tells a grey turret card from a
 * purple one. Two mods may therefore share a glyph, but never inside ONE
 * BAND, where the colour could not separate them (checked at import).
 */
export type ModGlyph =
  | "barrel"
  | "gear"
  | "plate"
  | "lens"
  | "weave"
  | "spike"
  | "chassis"
  | "shield"
  | "giant"
  | "scope"
  | "allround"
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
  /**
   * THE NAME — and only the RARE and ULTRA attributes have one, plus
   * every relic (see the header). A common is a tick, not a character:
   * its label is its tweak, and `modName` is the one place that decides.
   */
  name?: string;
  /**
   * WHAT IT DOES TO THE STATS, in the fewest words that can be true:
   * "+10% damage", "+50% damage, +50% fire rate". Every turret attribute
   * carries one — it is the LABEL of an unnamed one and the summary line
   * of a named one — and a relic carries one only where it is a plain
   * stat change. It is written by hand rather than derived from `apply`,
   * because a function that returns a TowerStats cannot be asked what it
   * changed without running it on something.
   */
  tweak?: string;
  rarity: Rarity;
  scope: ModScope;
  glyph: ModGlyph;
  /** what owning it does, in the player's own terms — the hover card */
  blurb: string;
  /**
   * HOW MANY OF IT ONE RUN MAY HOLD, and there are only two answers:
   * Infinity for a turret attribute, 1 for a relic (checked at import, and
   * see the header for why). The roll never offers a mod already at its
   * cap (rollMod), which is what lets the relic half be owned out and the
   * attribute half never be.
   *
   * A STACK OF AN ATTRIBUTE IS ODDS AND NEVER EFFECT. Every copy is
   * another independent roll folded into one probability (chanceAt), so a
   * second Sniper does not make a sniper turret better — it makes sniper
   * turrets likelier. The effect is fixed at the def.
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
   * HEALTH RETURNED A SECOND, as a fraction of the turret's OWN ceiling —
   * so the same 3% mends a braced spectre faster in absolute hp than a
   * bare duo, which is what "a percentage of its own pool" has to mean.
   * The sim resolves it to hp/second once at the placement
   * (Sim.resolveTower) and the fire loop adds `regen * dt`; nothing
   * re-reads a percentage per tick.
   */
  regen?: number;
  /**
   * THE FOOTPRINT MULTIPLIER — the GIANT and nothing else. A turret with
   * this stands on `scale` times its kind's edge in tiles, so a 4x4
   * foreshadow becomes an 8x8 building. It is on the def rather than a
   * check on the id so the sim asks the catalog "how big is a turret with
   * this mask" (sizeWithMods) instead of asking "is it the giant".
   */
  scale?: number;
  /**
   * THIS ATTRIBUTE EATS THE CARD. A formation that rolls one places ONE
   * turret carrying it, at the middle of where the shape would have gone,
   * instead of the shape — see Game.placeFormation. Only the giant has
   * it, and only the giant should: a card is a patch, and the one thing
   * worth breaking that promise for is a building too big to be a patch.
   *
   * IT IS ROLLED ONCE PER CARD, NOT ONCE PER TURRET, which is the one
   * place rollTurretMods's rule is bent and it has to be: a x10 citadel
   * is three hundred and sixty rolls, and at any chance worth having,
   * three hundred and sixty rolls is a giant every single time. See
   * rollSolo.
   */
  solo?: boolean;
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

/**
 * THE GIANT'S EDGE, as a multiple of the turret's own: twice, so a duo's
 * 2x2 is a 4x4 and a foreshadow's 4x4 is an 8x8 — the biggest thing that
 * will ever stand on this board, core included.
 */
export const GIANT_SCALE = 2;

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

/** ...and one that stands on more ground: the giant, and nothing else */
const bigger = (s: TowerStats, mul: number): TowerStats => ({ ...s, size: s.size * mul });

/**
 * THE UNNAMED TICKS — four stats, two bands, and the id says which is
 * which. `dmg1` is the common damage tick and `dmg2` the uncommon one;
 * there is no third, because a third band of the same dial is what the
 * NAMED rares are for.
 *
 * THE STEPS ARE SMALL AND THAT IS THE POINT. Every turret rolls for every
 * attribute the run owns, so a late run is stacking eight or ten of these
 * multiplicatively on one gun; a common worth a quarter of a turret
 * compounds into nonsense, and a common worth a tenth compounds into a
 * gun that is noticeably better than the one beside it. Ten per cent is
 * the number you feel across a patch of thirty-six and never across one.
 */
const tick = (
  id: ModId,
  rarity: Rarity,
  glyph: ModGlyph,
  tweak: string,
  chance: number,
  apply: (s: TowerStats) => TowerStats,
  regen?: number,
): ModDef => ({
  id,
  tweak,
  rarity,
  scope: "turret",
  glyph,
  // NO CAP. An unnamed tick is a dial, and a dial with a stop at three is
  // a dial that stops being a decision — see the header
  max: Infinity,
  chance,
  blurb: `New turrets have a chance to be born with ${tweak}.`,
  apply: (t) => apply(t),
  regen,
});

const TURRET_MODS: readonly ModDef[] = [
  // ---- COMMON: a tenth of a turret, at three rolls in ten -------------
  tick("dmg1", "common", "barrel", "+10% damage", 0.3, (t) => stronger(t, 1.1)),
  tick("rate1", "common", "gear", "+10% fire rate", 0.3, (t) => faster(t, 1.1)),
  tick("hp1", "common", "plate", "+20% health", 0.3, (t) => tougher(t, 1.2)),
  tick("range1", "common", "lens", "+10% range", 0.3, (t) => reaching(t, 1.1)),
  // ---- UNCOMMON: a quarter, at under one roll in five -----------------
  tick("dmg2", "uncommon", "barrel", "+25% damage", 0.18, (t) => stronger(t, 1.25)),
  tick("rate2", "uncommon", "gear", "+25% fire rate", 0.18, (t) => faster(t, 1.25)),
  tick("hp2", "uncommon", "plate", "+50% health", 0.18, (t) => tougher(t, 1.5)),
  tick("range2", "uncommon", "lens", "+25% range", 0.18, (t) => reaching(t, 1.25)),
  // PIERCE IS A WHOLE BODY AND NEVER A PERCENTAGE. There is no "+10% of a
  // body to punch through", so the dial has one step and it lives here,
  // at the band where one extra body is worth about what a quarter is
  tick("pierce1", "uncommon", "spike", "+1 pierce", 0.18, (t) => piercing(t, 1)),
  // ...and REPAIR is the one stat a plain turret has none of, so the tick
  // is the whole thing rather than a percentage of nothing
  tick("regen1", "uncommon", "weave", "repairs 1% a second", 0.18, (t) => t, 0.01),

  // ---- RARE: NAMED, and a pair of stats rather than a dial ------------
  // Half a turret is the rare step. What makes these rare rather than a
  // third tick is that each one is a SHAPE — a gun, a wall, a spear — so
  // rolling one says something about the turret it landed on.
  {
    id: "prototype",
    name: "Prototype Chassis",
    tweak: "+50% damage, +50% fire rate",
    rarity: "rare",
    scope: "turret",
    glyph: "chassis",
    max: Infinity,
    chance: 0.1,
    blurb: "New turrets have a chance to be born on a prototype frame: half again the damage and half again the rate of fire.",
    apply: (t) => faster(stronger(t, 1.5), 1.5),
  },
  {
    id: "bulwark",
    name: "Bulwark Plating",
    tweak: "+100% health, repairs 3% a second",
    rarity: "rare",
    scope: "turret",
    glyph: "shield",
    max: Infinity,
    chance: 0.1,
    blurb: "New turrets have a chance to be born armoured: double health, and they mend 3% of it a second.",
    apply: (t) => tougher(t, 2),
    regen: 0.03,
  },
  {
    id: "sabot",
    name: "Sabot Rounds",
    tweak: "+2 pierce, +50% damage",
    rarity: "rare",
    scope: "turret",
    glyph: "spike",
    max: Infinity,
    chance: 0.1,
    blurb: "New turrets have a chance to fire sabot: half again the damage, and the round punches through two more bodies.",
    apply: (t) => piercing(stronger(t, 1.5), 2),
  },

  // ---- ULTRA: NAMED, and the turret changes species --------------------
  {
    id: "giant",
    name: "Giant",
    tweak: "+1000% health, +200% damage, −90% range, twice the footprint",
    rarity: "ultra",
    scope: "turret",
    glyph: "giant",
    max: Infinity,
    // ROLLED ONCE PER CARD (`solo`), not once per turret — so this is the
    // odds that a PLACEMENT comes out giant, whatever the card was
    chance: 0.12,
    blurb:
      "A card has a chance to come out GIANT instead: one building, twice the size, eleven times the health and triple the damage — but it sees barely a tenth as far, so it has to be put where the swarm is already coming.",
    apply: (t) => bigger(tougher(reaching(stronger(t, 3), 0.1), 11), GIANT_SCALE),
    scale: GIANT_SCALE,
    solo: true,
  },
  {
    id: "sniper",
    name: "Sniper",
    tweak: "+300% range, +200% fire rate, +100% damage, −90% health",
    rarity: "ultra",
    scope: "turret",
    glyph: "scope",
    max: Infinity,
    chance: 0.05,
    blurb:
      "New turrets have a chance to be born SNIPER: four times the reach, triple the rate of fire and double the damage — on a tenth of the health. It kills everything it can see and dies to anything that reaches it.",
    apply: (t) => tougher(faster(reaching(stronger(t, 2), 4), 3), 0.1),
  },
  {
    id: "allround",
    name: "All Round",
    tweak: "+100% damage, +100% fire rate, +100% health, +50% range, +3 pierce",
    rarity: "ultra",
    scope: "turret",
    glyph: "allround",
    max: Infinity,
    chance: 0.05,
    blurb:
      "New turrets have a chance to be born ALL ROUND: double damage, double rate of fire, double health, half again the reach, and the round punches through three more bodies. No cost at all — it is simply a better turret.",
    apply: (t) => piercing(tougher(reaching(faster(stronger(t, 2), 2), 1.5), 2), 3),
  },
];

const GLOBAL_MODS: readonly ModDef[] = [
  {
    id: "calibration",
    name: "Calibration Matrix",
    rarity: "common",
    scope: "global",
    glyph: "crosshair",
    max: 1,
    blurb: "Every turret on the field deals 10% more damage.",
    apply: (s, n) => stronger(s, 1 + 0.1 * n),
  },
  {
    id: "coolant",
    name: "Coolant Loop",
    rarity: "common",
    scope: "global",
    glyph: "coolant",
    max: 1,
    blurb: "Every turret on the field fires 10% faster.",
    apply: (s, n) => faster(s, 1 + 0.1 * n),
  },
  {
    id: "scavenger",
    name: "Scavenger Rig",
    rarity: "common",
    scope: "global",
    glyph: "coin",
    max: 1,
    blurb: "Every kill pays 15% more scrap.",
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

/**
 * WHAT TO CALL ONE, and the single answer every screen reads: the name if
 * it has one, and its tweak if it does not (see the header — only the
 * rare and ultra attributes are named, and every relic is).
 */
export const modName = (d: ModDef): string => d.name ?? d.tweak ?? d.id;

/** ...by id, for the callers that only have one */
export const modNameOf = (id: ModId): string => modName(modDef(id));

/** is this one a character or a tick? — what a board prints differently */
export const isNamed = (d: ModDef): boolean => d.name !== undefined;

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
  // chanceOf, not d.chance: the dashboard's dial has to move the odds the
  // shelf prints and the odds the placement rolls, or the two disagree
  const c = chanceOf(id);
  if (d.scope !== "turret" || !c || stacks <= 0) return 0;
  return 1 - (1 - Math.min(1, c)) ** stacks;
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
    // a SOLO attribute is not rolled here — it is the card's roll, once,
    // before a single footprint is chosen (rollSolo). Rolling it per
    // turret as well would hand one out on top of the shape it is
    // supposed to have replaced
    if (modDef(id).solo) continue;
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

/**
 * THE FRACTION OF ITS OWN POOL one turret's attributes repair a second,
 * summed over everything in the mask (ModDef.regen).
 *
 * IT IS A PERCENTAGE OF THE TURRET'S OWN CEILING, not a flat number of
 * hit points: Sim.resolveTower multiplies this by hpMax once, at the
 * placement, so a turret that also rolled +50% health mends half again
 * as fast in absolute terms. Data rather than a list of ids, so adding a
 * repairing attribute is one field on its def.
 */
export function modRegen(mask: number): number {
  let r = 0;
  for (const id of TURRET_MOD_IDS)
    if ((mask & modBit(id)) !== 0) r += modDef(id).regen ?? 0;
  return r;
}

/**
 * HOW BIG A TURRET WITH THIS MASK STANDS, in tiles — the kind's own edge
 * times whatever the mask scales it by (ModDef.scale, the giant and
 * nothing else).
 *
 * THE SIM ASKS THIS BEFORE THE TURRET EXISTS. A giant's footprint has to
 * be known to test the ground and to claim it (Sim.placeTower), which is
 * the one thing that cannot be read off the finished Tower.spec — so the
 * scale lives on the def and the placement path asks the catalog.
 */
export function sizeWithMods(base: number, mask: number): number {
  let sz = base;
  for (const id of TURRET_MOD_IDS)
    if ((mask & modBit(id)) !== 0) sz *= modDef(id).scale ?? 1;
  return sz;
}

/**
 * THE ONCE-PER-CARD ROLL: which SOLO attribute, if any, this placement
 * comes out as (ModDef.solo — the giant). Null is the ordinary case, and
 * the card lays its shape down as usual.
 *
 * ONE ROLL A CARD, NOT ONE A TURRET, and it has to be. Every other
 * attribute is rolled per placement (rollTurretMods) because a patch
 * coming out speckled is the whole charm of them; a solo attribute EATS
 * the patch, so rolling it per turret would mean a x10 citadel — three
 * hundred and sixty rolls — comes out giant at any chance above about a
 * hundredth of a per cent. The card is the unit of the decision, so the
 * card is the unit of the roll.
 */
export function rollSolo(
  owned: Readonly<Partial<Record<ModId, number>>>,
  rng: () => number = Math.random,
): ModId | null {
  for (const id of TURRET_MOD_IDS) {
    const d = modDef(id);
    if (!d.solo) continue;
    const n = owned[id] ?? 0;
    if (n > 0 && rng() < chanceAt(id, n)) return id;
  }
  return null;
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

/** ...and the same table as a dial the dashboard can turn (rarity.ts
 *  weightDial). BOTH BUTTONS READ IT: M and G roll the same bands and
 *  renormalise inside their own half, so there is one table, not two */
export const MODULE_ODDS: WeightDial = weightDial(MOD_WEIGHTS);

/**
 * WHAT ONE ATTRIBUTE'S ROLL COSTS TO TURN, per mod id — the second half of
 * the rarities dashboard, and the one number that decides how speckled a
 * patch comes out.
 *
 * It is separate from the band weights above because the two answer
 * different questions: a BAND weight decides how often the deal hands the
 * attribute over at the shop, and a CHANCE decides how often an attribute
 * the run already owns lands on a turret. Bending one must not bend the
 * other.
 */
const chanceBent = new Map<ModId, number>();

/** the roll odds in force for one attribute — authored, or whatever the
 *  dashboard has bent it to */
export const chanceOf = (id: ModId): number => chanceBent.get(id) ?? modDef(id).chance ?? 0;

/** what a Reset returns to */
export const authoredChance = (id: ModId): number => modDef(id).chance ?? 0;

/** bend one; undefined restores the authored odds */
export function setChance(id: ModId, v: number | undefined): void {
  if (v === undefined || !Number.isFinite(v) || v < 0 || v > 1) chanceBent.delete(id);
  else chanceBent.set(id, v);
}

export const allChanceOverrides = (): Record<string, number> =>
  Object.fromEntries([...chanceBent]);

export function applyChanceOverrides(doc: Record<string, unknown>): void {
  chanceBent.clear();
  for (const id of TURRET_MOD_IDS) {
    const v = doc[id];
    if (typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1) chanceBent.set(id, v);
  }
}

/**
 * ONE DRAW OFF THE MODULE TABLE: a band against the weights, then a mod
 * uniformly inside it — the deal's own two-step (rarity.ts rollTurret),
 * for the same reason: adding a fourth ultra mod must make WHICH ultra
 * less predictable and never make ultras more likely.
 *
 * `scope` IS WHICH BUTTON WAS PRESSED. The corner sells the two halves of
 * this catalog separately — "Buy mods" draws only turret attributes,
 * "Buy relics" only globals — because they are different purchases and a
 * player who needs one should not be made to pay for a coin-flip between
 * them. Null draws from the whole table, which is what a test or a free
 * board wants.
 *
 * EACH HALF RENORMALISES OVER ITSELF. The bands are weighed across the
 * mods that are actually in the pool, so the relic table's own ultras
 * come up at the ultra rate rather than at half of it.
 *
 * A MOD AT ITS CAP IS NOT IN THE POOL. `owned` is the run's stacks, and a
 * mod with max copies is skipped and its band's weight redistributed — a
 * late run draws from what is left rather than paying to be told it
 * already has the thing. Null when that half is owned out, which is the
 * one case the button must refuse.
 */
export function rollMod(
  owned: Readonly<Partial<Record<ModId, number>>> = {},
  scope: ModScope | null = null,
  weights: RarityWeights = MODULE_ODDS.live(),
  rng: () => number = Math.random,
): ModId | null {
  const byRarity = new Map<Rarity, ModId[]>();
  for (const m of MODS) {
    if (scope && m.scope !== scope) continue;
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

/**
 * WHAT ONE COPY OF THIS BUYS, in the player's terms — the line every
 * board and every chip prints under the blurb.
 *
 * THE UNIT IS NOT ALWAYS A TURRET. An ordinary attribute is rolled once
 * per turret placed, so its odds are per turret; a SOLO one (the giant)
 * is rolled once per CARD, so saying "on every turret placed" would
 * overstate it by a factor of the whole formation — which on a x10
 * citadel is three hundred and sixty.
 */
export function oddsLine(d: ModDef, stacks = 1): string {
  if (d.scope === "global") return "In force over the whole board the moment it is bought";
  const pct = Math.round(chanceAt(d.id, stacks) * 100);
  return d.solo ? `${pct}% on every card placed` : `${pct}% on every turret placed`;
}

/** is there anything left in this half of the catalog to draw? — what
 *  greys one of the two buttons out on a run that has bought it out */
export const anyModLeft = (
  owned: Readonly<Partial<Record<ModId, number>>>,
  scope: ModScope | null = null,
): boolean =>
  MODS.some((m) => (!scope || m.scope === scope) && (owned[m.id] ?? 0) < m.max);

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
  for (const m of TURRET_MODS) {
    if (!m.chance) throw new Error(`the turret mod "${m.id}" has no chance to be rolled`);
    if (!m.tweak) throw new Error(`the turret mod "${m.id}" does not say what it tweaks`);
    // A TURRET MOD IS A STAT TWEAK AND NOTHING ELSE (see the header): if
    // it neither composes stats nor repairs, it is behaviour wearing an
    // attribute's clothes and belongs in the relic half
    if (!m.apply && !m.regen)
      throw new Error(`the turret mod "${m.id}" changes no stat — behaviour belongs to the relics`);
    // ONLY RARE AND ULTRA ARE NAMED — the low bands print their tweak
    const named = m.rarity === "rare" || m.rarity === "ultra";
    if (named !== (m.name !== undefined))
      throw new Error(
        `the ${m.rarity} turret mod "${m.id}" ${m.name ? "has" : "has no"} name; only rare and ultra are named`,
      );
    // ...AND NO ATTRIBUTE HAS A CAP. A stack is odds, and odds have no
    // ceiling worth authoring — see the header
    if (m.max !== Infinity)
      throw new Error(`the turret mod "${m.id}" is capped at ${m.max}; attributes stack without limit`);
  }
  for (const m of GLOBAL_MODS) {
    if (m.chance) throw new Error(`the global mod "${m.id}" carries a placement chance`);
    // EVERY RELIC IS NAMED. A relic is never a number, so there is
    // nothing for an unnamed one to be called
    if (!m.name) throw new Error(`the relic "${m.id}" has no name`);
    // ONE IS ENOUGH. A rule in force does not get more in force, so a
    // second copy would have to mean something and there is nothing for
    // it to mean
    if (m.max !== 1) throw new Error(`the relic "${m.id}" may be held ${m.max} times; one is enough`);
    if (m.solo || m.scale) throw new Error(`the relic "${m.id}" is trying to be a turret`);
  }
  // ONE GLYPH MAY BE WORN TWICE, but never inside one band, where the
  // border colour could not tell the two apart (see ModGlyph)
  const worn = new Set<string>();
  for (const m of MODS) {
    const key = `${m.glyph}/${m.rarity}`;
    if (worn.has(key))
      throw new Error(`two ${m.rarity} mods wear the ${m.glyph} glyph — nothing can tell them apart`);
    worn.add(key);
  }
})();
