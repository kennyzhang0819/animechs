import { PAL, TOWERS, type TowerStats } from "./constants";
import { RARITIES, weightDial, type Rarity, type RarityWeights, type WeightDial } from "./rarity";
import type { TowerKind } from "./types";
import { armored, faster, piercing, reaching, stronger } from "./upgrades";

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
 * numbers — a run banking ten attributes is folding ten multipliers onto
 * the same gun, and a common worth a quarter of a turret would compound
 * into nonsense by wave twenty.
 *
 * A TURRET MOD IS ANYTHING THAT COMPOSES ONTO ONE TURRET'S TABLE. It used
 * to be narrower than that — "a stat tweak and nothing else, behaviour is
 * the relics' job" — and the line was drawn in the wrong place: a fuse
 * that fires five spikes instead of three is not a number going up, it is
 * the gun doing a different thing, and it is still one turret's business
 * and nobody else's. So an attribute may change what a turret DOES as
 * long as it says so through `apply` (the shot count, the spread, the
 * pierce) or `regen`; what it may not do is reach past the turret it
 * landed on. The one rule that survives is the mechanical one: a turret's
 * table is composed ONCE at the placement (Tower.spec) and read flat by
 * the fire loop, never switched on per shot — so an attribute has to be
 * expressible as a table, and "when this turret dies" is not.
 *
 * A RELIC CHANGES THE GAME, AND IS PRICED LIKE IT. Thirty thousand scrap
 * (economy.ts RELIC_ROLL_PRICE) is thirty turret cards, or the whole
 * opening bank four times over, and nothing at that price may be a
 * percentage: the board fires TWICE as fast, every kill pays TRIPLE, every
 * turret stands back up. A relic at "+10% damage" was a mod with a worse
 * price tag, and the run could not tell the two buttons apart by what
 * they did — only by what they cost.
 *
 * A SECOND COPY IS A BIGGER NUMBER, NOT BETTER ODDS. This is the one
 * rule in the file that has been turned round: a copy used to be another
 * independent roll, folded into one probability, and the effect was fixed
 * at the def — so the tenth "+10% damage" a run bought was still +10%
 * damage, bought at odds that were already nearly certain. It bought
 * nothing a player could feel. Now the ODDS ARE THE DEF'S AND NEVER MOVE,
 * and the copies multiply what a turret born with the attribute gets:
 * three copies of +8% damage is +24% on every turret that wins the same
 * one roll in three.
 *
 * THE COPIES SCALE THE BONUS AND NEVER THE PRICE. Every attribute's
 * upside is linear in copies — a multiplier `m` reads 1 + (m - 1) x n,
 * and a flat step (pierce, plating, repair) is simply n of it — while
 * what an attribute CHARGES stays exactly where the def put it: a second
 * Sniper does not take another ninety per cent of the turret's health,
 * and a second Giant is not four times the footprint. A build is meant to
 * get better as it is repeated, not to become impossible.
 *
 * AND IT IS STILL ONE BIT ON THE TURRET. Tower.mods is a mask, so a
 * turret carries an attribute or does not; the STRENGTH is read off the
 * run's ledger when the spec is composed (applyTurretMods), which means a
 * copy bought mid-wave reaches the turrets already standing. That is a
 * deliberate change from what an attribute used to promise — it used to
 * change nothing on the board at all — and it is the only way "the number
 * goes up" can mean anything to a player who already has a board.
 *
 * A TURRET ATTRIBUTE HAS NO CAP AND A RELIC HAS ONE OF EXACTLY ONE. An
 * attribute is a number that grows, so there is always something a copy
 * can do. A relic is a rule in force; a rule does not get more in force,
 * so owning it twice would have to mean something and there is nothing
 * for it to mean.
 *
 * SO THE ONLY HOUSEKEEPING ON SCREEN IS THE COUNT. The boards used to
 * print "One a run" and "Up to 2 of them" under every module, which is a
 * line repeated twenty times to say what one rule says once. A relic is
 * self-explanatory; an attribute prints its odds, and the x3 on its chip
 * is now the whole of what the copies did.
 *
 * THE LOW BANDS WERE HALVED WHEN THE COPIES STARTED COUNTING. A tick was
 * worth a tenth of a turret when a tenth was all it would ever be worth;
 * the same tenth, ten times over, is a doubled gun, and the commons are
 * the band a run banks by the fistful. So every unnamed tick is half what
 * it shipped at — five per cent and twelve rather than ten and
 * twenty-five — and the SECOND copy is where a player gets back to the
 * number they used to buy with the first. The rares and the ultras were
 * left alone: at a tenth of a draw and a fiftieth, a run holding three of
 * one has earned whatever that is.
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
  "splitter",
  "giant",
  "sniper",
  "allround",
  // ---- globals: relics, in force the moment they are bought ------------
  "overclock",
  "coolant",
  "scavenger",
  "insurance",
  "phosphor",
  "lastVolley",
  "phoenix",
  "twinfire",
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
  | "core"
  | "coolant"
  | "coin"
  | "vault"
  | "flame"
  | "volley"
  | "phoenix"
  | "fan"
  | "twin"
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
   * A SECOND COPY IS EFFECT AND NEVER ODDS (see the header). It scales
   * what a turret born with the attribute gets — a second Sniper makes
   * sniper turrets better, not likelier — and the chance below does not
   * move for it.
   */
  max: number;
  /**
   * TURRET MODS ONLY: the odds one new turret is born with this, and they
   * are a CONSTANT — copies buy strength, never odds (see the header).
   * Read through chanceAt, which is the dashboard's dial folded in.
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
   * IT IS HANDED THE RUN'S COPY COUNT and every turret attribute below
   * uses it: the bonuses are linear in `copies` and the costs are not
   * (see the header). A relic is capped at one, so its own `apply` is
   * always called with 1.
   *
   * Mods with no `apply` are the behavioural ones — a revive, a refund, a
   * shift in the deal's odds — and the sim reads those BY NAME at the one
   * place each of them happens. There is no way to express "when a turret
   * dies" as a stat, and pretending otherwise would put a switch in the
   * hot loop for every one of them.
   */
  apply?: (s: TowerStats, copies: number) => TowerStats;
  /**
   * HEALTH RETURNED A SECOND PER COPY OWNED, as a fraction of the
   * turret's OWN ceiling —
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
   *
   * IT IS THE ONE THING COPIES DO NOT SCALE. The ground a building
   * claims is read off the MASK before the turret exists (sizeWithMods,
   * Sim.placeTower), and a second Giant making every giant a 16x16 would
   * be a card that cannot be placed on most of the map.
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
   * A MOD THAT ONLY MEANS ANYTHING ON ONE KIND — the Splitter Array is a
   * fuse's attribute and nothing else's. Unset is every kind.
   *
   * On a turret attribute it gates the ROLL: a placement of any other
   * kind never rolls for it at all (rollTurretMods), so the odds are per
   * FUSE placed and the shelf says so (oddsLine). On a relic it gates the
   * apply, so refreshSpecs can skip the call for the kinds it has nothing
   * to say about. It is on the def rather than inside `apply` because the
   * roll happens before there is a table to apply anything to.
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

/**
 * INSURANCE: what a wrecked turret pays, EVERY time. It used to be a 40%
 * chance at five hundred — an expected two hundred scrap a death, which
 * on a thirty-thousand relic pays itself back after a hundred and fifty
 * wrecks. Two cards' worth, certain, is a relic: a line that is being
 * chewed through is now also a line that is funding its own replacement.
 */
export const INSURANCE_SCRAP = 2000;

/** scavenger: what it adds to every kill's drop — TWO more of it, so a
 *  kill pays triple. The economy relic, and the one that has to pay the
 *  thirty thousand back fastest */
export const SCAVENGER_BONUS = 2;

/** last volley: the reload multiplier a death hands its neighbours, how
 *  long it lasts, and how far it reaches (in tiles). Triple, for a
 *  quarter of a minute, over a bigger ring — a death is an EVENT now */
export const LAST_VOLLEY_RATE = 3;
export const LAST_VOLLEY_SECONDS = 15;
export const LAST_VOLLEY_TILES = 8;

/**
 * PHOENIX: the odds a wrecked turret stands back up — EVERY time, not
 * once. A coin flip with no floor under it is worth one extra life on
 * average, the same as Undying's certain one, and it never runs out; the
 * two are the same relic told as certainty and as luck, and a run that
 * owns both spends the certainty first (Sim.reviveTower).
 */
export const PHOENIX_CHANCE = 0.5;

/** overclock and coolant: the board's damage and rate, DOUBLED */
export const OVERCLOCK_MUL = 2;
export const COOLANT_MUL = 2;

/** phosphor: every round hits half again as hard and goes through two
 *  more bodies, on top of burning white */
export const PHOSPHOR_MUL = 1.5;
export const PHOSPHOR_PIERCE = 2;

/** twin fire: one more round in every volley on the board */
export const TWINFIRE_SHOTS = 1;

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
 * attribute the run owns, so a late run is folding eight or ten of these
 * multipliers onto one gun; a common worth a quarter of a turret
 * compounds into nonsense, and a common worth a twentieth compounds into
 * a gun that is noticeably better than the one beside it.
 *
 * AND EVERY COPY ADDS ITS STEP AGAIN — `apply` is handed the run's count
 * and the tick is written linear in it, so four of the common damage tick
 * is one turret in three carrying +20%. That is what HALVED these numbers
 * from the tenth and the quarter they shipped at: the tick is a dial now
 * and a dial is read at the far end of its travel, not at the first stop,
 * and what the old step was worth once a run owns it is what the new one
 * is worth twice over.
 */
const tick = (
  id: ModId,
  rarity: Rarity,
  glyph: ModGlyph,
  tweak: string,
  chance: number,
  apply: (s: TowerStats, copies: number) => TowerStats,
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
  blurb: `New turrets have a chance to be born with ${tweak}, once for every copy of it the run holds.`,
  apply,
  regen,
});

/** a multiplier as COPIES of it read: 1 + (m - 1) x n, so two of a x1.5
 *  is a x2 and never a x2.25. Linear is the promise on the chip — "+50%"
 *  twice is "+100%" — and compounding would quietly outrun it */
const per = (mul: number, copies: number): number => 1 + (mul - 1) * Math.max(1, copies);

const TURRET_MODS: readonly ModDef[] = [
  // ---- COMMON: a twentieth of a turret, at three rolls in ten ---------
  tick("dmg1", "common", "barrel", "+5% damage", 0.3, (t, n) => stronger(t, per(1.05, n))),
  tick("rate1", "common", "gear", "+5% fire rate", 0.3, (t, n) => faster(t, per(1.05, n))),
  tick("hp1", "common", "plate", "+10% health", 0.3, (t, n) => tougher(t, per(1.1, n))),
  tick("range1", "common", "lens", "+5% range", 0.3, (t, n) => reaching(t, per(1.05, n))),
  // ---- UNCOMMON: an eighth, at under one roll in five -----------------
  tick("dmg2", "uncommon", "barrel", "+12% damage", 0.18, (t, n) => stronger(t, per(1.12, n))),
  tick("rate2", "uncommon", "gear", "+12% fire rate", 0.18, (t, n) => faster(t, per(1.12, n))),
  tick("hp2", "uncommon", "plate", "+25% health", 0.18, (t, n) => tougher(t, per(1.25, n))),
  tick("range2", "uncommon", "lens", "+12% range", 0.18, (t, n) => reaching(t, per(1.12, n))),
  // PIERCE IS A WHOLE BODY AND NEVER A PERCENTAGE. There is no "+10% of a
  // body to punch through", so the dial has one step and it lives here,
  // at the band where one extra body is worth about what a fifth is —
  // and a copy is simply another body through
  tick("pierce1", "uncommon", "spike", "+1 pierce", 0.18, (t, n) => piercing(t, Math.max(1, n))),
  // ...and REPAIR is the one stat a plain turret has none of, so the tick
  // is the whole thing rather than a percentage of nothing. Its copies are
  // summed by modRegen rather than here — `regen` is a field, not an apply
  tick("regen1", "uncommon", "weave", "repairs 0.5% a second", 0.18, (t) => t, 0.005),

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
    blurb: "New turrets have a chance to be born on a prototype frame: half again the damage and half again the rate of fire, once for every copy of it the run holds.",
    apply: (t, n) => faster(stronger(t, per(1.5, n)), per(1.5, n)),
  },
  {
    id: "bulwark",
    name: "Bulwark Plating",
    tweak: "+100% health, +6 armor, repairs 3% a second",
    rarity: "rare",
    scope: "turret",
    glyph: "shield",
    max: Infinity,
    chance: 0.1,
    // the +6 is a mace's plate and a half: on a 1x1 it is the difference
    // between a dagger biting and a dagger bouncing off
    blurb: "New turrets have a chance to be born armoured: double health, six points of plating, and they mend 3% of it a second — again for every copy of it the run holds.",
    apply: (t, n) => armored(tougher(t, per(2, n)), 6 * Math.max(1, n)),
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
    blurb: "New turrets have a chance to fire sabot: half again the damage, and the round punches through two more bodies — again for every copy of it the run holds.",
    apply: (t, n) => piercing(stronger(t, per(1.5, n)), 2 * Math.max(1, n)),
  },
  {
    // THE FIRST ATTRIBUTE THAT IS NOT A NUMBER GOING UP — see the header.
    // It was a relic, and a relic that improves one kind of gun is a
    // thirty-thousand-scrap bet on the deal handing over fuses; as a
    // fuse's OWN attribute it is rolled on every fuse placed and on
    // nothing else, which is the shape the thing always had
    id: "splitter",
    name: "Splitter Array",
    tweak: "+2 spikes a volley, fuse only",
    rarity: "rare",
    scope: "turret",
    glyph: "fan",
    only: "fuse",
    max: Infinity,
    // STEEPER THAN THE OTHER RARES, because it rolls against ONE kind: a
    // tenth would speckle a patch of duos and never once show on the two
    // fuses a run puts down
    chance: 0.3,
    blurb: "New fuses have a chance to fire two extra spikes — five to the volley instead of three, and two more again for every copy of it the run holds.",
    apply: (s, n) => ({ ...s, shots: s.shots + 2 * Math.max(1, n) }),
  },

  // ---- ULTRA: NAMED, and the turret changes species --------------------
  {
    id: "giant",
    name: "Giant",
    tweak: "+1000% health, +200% damage, +10 armor, −90% range, twice the footprint",
    rarity: "ultra",
    scope: "turret",
    glyph: "giant",
    max: Infinity,
    // ROLLED ONCE PER CARD (`solo`), not once per turret — so this is the
    // odds that a PLACEMENT comes out giant, whatever the card was. It is
    // the loosest of the three because it costs the whole card to happen
    chance: 0.05,
    blurb:
      "A card has a chance to come out GIANT instead: one building, twice the size, eleven times the health, ten more plating and triple the damage — but it sees barely a tenth as far, so it has to be put where the swarm is already coming.",
    // THE FOOTPRINT AND THE BLINDNESS ARE THE PRICE AND DO NOT STACK
    // (see `scale`): copies buy a harder-hitting, tougher, better plated
    // giant standing on exactly the same ground, still seeing a tenth as
    // far as its kind
    apply: (t, n) =>
      bigger(armored(tougher(reaching(stronger(t, per(3, n)), 0.1), per(11, n)), 10 * Math.max(1, n)), GIANT_SCALE),
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
    chance: 0.04,
    blurb:
      "New turrets have a chance to be born SNIPER: four times the reach, triple the rate of fire and double the damage — on a tenth of the health. It kills everything it can see and dies to anything that reaches it.",
    // the tenth of a health pool is the PRICE and is paid once, however
    // many copies the run holds — see the header
    apply: (t, n) => tougher(faster(reaching(stronger(t, per(2, n)), per(4, n)), per(3, n)), 0.1),
  },
  {
    id: "allround",
    name: "All Round",
    tweak: "+100% damage, +100% fire rate, +100% health, +50% range, +3 pierce",
    rarity: "ultra",
    scope: "turret",
    glyph: "allround",
    max: Infinity,
    // THE RAREST OF THE THREE, because it is the only one that charges
    // nothing: the giant gives up its range and the sniper its health, and
    // this one is simply a better turret (see the header)
    chance: 0.03,
    blurb:
      "New turrets have a chance to be born ALL ROUND: double damage, double rate of fire, double health, half again the reach, and the round punches through three more bodies. No cost at all — it is simply a better turret.",
    apply: (t, n) =>
      piercing(
        tougher(reaching(faster(stronger(t, per(2, n)), per(2, n)), per(1.5, n)), per(2, n)),
        3 * Math.max(1, n),
      ),
  },
];

const GLOBAL_MODS: readonly ModDef[] = [
  // EVERY RELIC BELOW IS THE BOARD DOING A DIFFERENT THING, not the same
  // thing a little better — see the header. The bands are what the deal
  // draws against, not what the relics are worth: at one price for all
  // of them, a common relic is the one that comes up often, and it still
  // has to be worth the thirty thousand when it does
  {
    id: "overclock",
    name: "Overclock Core",
    rarity: "common",
    scope: "global",
    glyph: "core",
    max: 1,
    blurb: "Every turret on the field deals DOUBLE damage.",
    apply: (s) => stronger(s, OVERCLOCK_MUL),
  },
  {
    id: "coolant",
    name: "Coolant Loop",
    rarity: "common",
    scope: "global",
    glyph: "coolant",
    max: 1,
    blurb: "Every turret on the field fires TWICE as fast.",
    apply: (s) => faster(s, COOLANT_MUL),
  },
  {
    id: "scavenger",
    name: "Scavenger Rig",
    rarity: "common",
    scope: "global",
    glyph: "coin",
    max: 1,
    blurb: "Every kill pays TRIPLE scrap.",
  },
  {
    id: "insurance",
    name: "Salvage Insurance",
    rarity: "uncommon",
    scope: "global",
    glyph: "vault",
    max: 1,
    blurb: "Every destroyed turret pays out 2,000 scrap — two cards' worth, every time.",
  },
  {
    id: "phosphor",
    name: "Phosphor Rounds",
    rarity: "uncommon",
    scope: "global",
    glyph: "flame",
    max: 1,
    // the "bullet upgrade that changes what an attack LOOKS like": every
    // round on the board goes white-hot, muzzle spray and hit included —
    // and now it goes THROUGH things, which is what white-hot should mean
    blurb: "Every shot on the field burns phosphor-white: half again the damage, and it punches through two more bodies.",
    apply: (s) => {
      const hot = piercing(stronger(s, PHOSPHOR_MUL), PHOSPHOR_PIERCE);
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
      "A destroyed turret spends its last charge on its neighbours: every turret within 8 tiles fires at TRIPLE rate for 15 seconds.",
  },
  {
    id: "phoenix",
    name: "Phoenix Protocol",
    rarity: "rare",
    scope: "global",
    glyph: "phoenix",
    max: 1,
    blurb: "A destroyed turret has a 50% chance to stand straight back up at full health — every time it falls, with no limit.",
  },
  {
    id: "twinfire",
    name: "Twin Fire",
    rarity: "rare",
    scope: "global",
    glyph: "twin",
    max: 1,
    // what was the Splitter Array's slot: a whole-board version of the
    // same idea, one more round in every volley from every gun
    blurb: "Every turret on the field fires one more round in every volley.",
    apply: (s) => ({ ...s, shots: s.shots + TWINFIRE_SHOTS }),
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
 * THE ODDS ONE NEW TURRET IS BORN WITH THIS ATTRIBUTE — and they are the
 * def's, whatever the run holds.
 *
 * A COPY USED TO BE ANOTHER INDEPENDENT ROLL folded in here, so three
 * copies of a 0.30 attribute read 0.657. It does not any more: copies buy
 * STRENGTH now (see the header), and the one thing this number must do is
 * stay still, because a player reading "30% on every turret placed" off
 * the shelf has to be able to keep reading it after they buy the fourth.
 */
export function chanceAt(id: ModId): number {
  const d = modDef(id);
  // chanceOf, not d.chance: the dashboard's dial has to move the odds the
  // shelf prints and the odds the placement rolls, or the two disagree
  const c = chanceOf(id);
  return d.scope === "turret" && c ? Math.min(1, c) : 0;
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
  kind: TowerKind,
  rng: () => number = Math.random,
): number {
  let mask = 0;
  for (const id of TURRET_MOD_IDS) {
    const d = modDef(id);
    // a SOLO attribute is not rolled here — it is the card's roll, once,
    // before a single footprint is chosen (rollSolo). Rolling it per
    // turret as well would hand one out on top of the shape it is
    // supposed to have replaced
    if (d.solo) continue;
    // ...and a KIND-BOUND one is only ever rolled by its own kind
    if (d.only && d.only !== kind) continue;
    const n = owned[id] ?? 0;
    if (n > 0 && rng() < chanceAt(id)) mask |= modBit(id);
  }
  return mask;
}

/**
 * The attributes in a mask folded onto a turret's stats, catalog order —
 * EACH AT THE STRENGTH THE RUN'S COPIES BUY (`owned`, and see the header).
 *
 * The mask says WHICH and the ledger says HOW MUCH, which is why a copy
 * bought mid-wave reaches the turrets already standing: Sim.refreshSpecs
 * re-composes every one of them through here.
 */
export function applyTurretMods(
  s: TowerStats,
  mask: number,
  owned: Readonly<Partial<Record<ModId, number>>> = {},
): TowerStats {
  if (mask === 0) return s;
  let out = s;
  for (const id of TURRET_MOD_IDS) {
    if ((mask & modBit(id)) === 0) continue;
    const f = modDef(id).apply;
    if (f) out = f(out, Math.max(1, owned[id] ?? 1));
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
export function modRegen(
  mask: number,
  owned: Readonly<Partial<Record<ModId, number>>> = {},
): number {
  let r = 0;
  for (const id of TURRET_MOD_IDS)
    if ((mask & modBit(id)) !== 0)
      r += (modDef(id).regen ?? 0) * Math.max(1, owned[id] ?? 1);
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
    if (n > 0 && rng() < chanceAt(id)) return id;
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
 * A MOD AT ITS CAP IS NOT IN THE POOL. `owned` is the run's copies, and a
 * mod with max copies is skipped and its band's weight redistributed — a
 * late run draws from what is left rather than paying to be told it
 * already has the thing. Null when that half is owned out, which is the
 * one case the button must refuse.
 *
 * NEITHER IS ONE THE SAVE HAS NOT EARNED. `open` is what the track has
 * dealt (track.ts modsAt, carried in on TechState.mods); null is every
 * module there is, which is what a free board draws from — the sandbox
 * and the editors are not a campaign and have nothing to unlock.
 */
export function rollMod(
  owned: Readonly<Partial<Record<ModId, number>>> = {},
  scope: ModScope | null = null,
  weights: RarityWeights = MODULE_ODDS.live(),
  rng: () => number = Math.random,
  open: ReadonlySet<ModId> | null = null,
): ModId | null {
  const byRarity = new Map<Rarity, ModId[]>();
  for (const m of MODS) {
    if (scope && m.scope !== scope) continue;
    if (open && !open.has(m.id)) continue;
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
 *
 * IT TAKES NO COPY COUNT ANY MORE. The odds are a constant (chanceAt) and
 * what the copies moved is the strength — stackLine says that half.
 */
export function oddsLine(d: ModDef): string {
  if (d.scope === "global") return "In force over the whole board the moment it is bought";
  const pct = Math.round(chanceAt(d.id) * 100);
  if (d.solo) return `${pct}% on every card placed`;
  if (d.only) return `${pct}% on every ${TOWERS[d.only].name.toLowerCase()} placed`;
  return `${pct}% on every turret placed`;
}

/**
 * WHAT THE COPIES BOUGHT, in the player's terms — null for a single copy
 * and for every relic, which cannot have one.
 *
 * It says the count rather than the arithmetic: an attribute's tweak is a
 * hand-written string ("+8% damage", "+2 pierce, +50% damage") and there
 * is no honest way to multiply a sentence by three. What a player needs
 * off the shelf is that the copies are DOING something, and how many of
 * them there are; the exact number is on the turret, in the inspector.
 */
export function stackLine(d: ModDef, copies: number): string | null {
  if (d.scope !== "turret" || copies <= 1) return null;
  return `${copies} copies — every one of them applies, so a turret born with it gets all ${copies}`;
}

/** is there anything left in this half of the catalog to draw? — what
 *  greys one of the two buttons out on a run that has bought it out.
 *  `open` is the save's earned catalog, as rollMod takes it */
export const anyModLeft = (
  owned: Readonly<Partial<Record<ModId, number>>>,
  scope: ModScope | null = null,
  open: ReadonlySet<ModId> | null = null,
): boolean =>
  MODS.some(
    (m) =>
      (!scope || m.scope === scope) &&
      (!open || open.has(m.id)) &&
      (owned[m.id] ?? 0) < m.max,
  );

/** has the track opened this half of the catalog AT ALL? — the difference
 *  between a button that has been bought out and one not yet earned */
export const anyModOpen = (scope: ModScope, open: ReadonlySet<ModId> | null): boolean =>
  !open || MODS.some((m) => m.scope === scope && open.has(m.id));

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
    // A TURRET MOD COMPOSES ONTO ONE TURRET'S TABLE (see the header): if
    // it neither composes the table nor repairs, it is a moment wearing an
    // attribute's clothes — "when this dies" is not a table — and it
    // belongs in the relic half, where the sim reads it by name
    if (!m.apply && !m.regen)
      throw new Error(`the turret mod "${m.id}" composes nothing onto the table — a moment belongs to the relics`);
    // ONLY RARE AND ULTRA ARE NAMED — the low bands print their tweak
    const named = m.rarity === "rare" || m.rarity === "ultra";
    if (named !== (m.name !== undefined))
      throw new Error(
        `the ${m.rarity} turret mod "${m.id}" ${m.name ? "has" : "has no"} name; only rare and ultra are named`,
      );
    // ...AND NO ATTRIBUTE HAS A CAP. A copy buys odds, and odds have no
    // ceiling worth authoring — see the header
    if (m.max !== Infinity)
      throw new Error(`the turret mod "${m.id}" is capped at ${m.max}; attributes have no cap`);
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
