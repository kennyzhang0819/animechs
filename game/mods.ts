import { PAL, TOWERS, type TowerStats } from "./constants";
import { RARITIES, weightDial, type Rarity, type RarityWeights, type WeightDial } from "./rarity";
import type { TowerKind } from "./types";
import { armored, faster, piercing, reaching, stronger } from "./upgrades";

/**
 * MODS — THE MID GAME'S ANSWER, and the first of the game's two categories
 * of module.
 *
 * THERE ARE EXACTLY TWO CATEGORIES AND NEITHER IS CALLED "UPGRADE". A MOD
 * is what this file sells: a CHANCE riding every turret placed from now
 * on, bought in scrap by the fistful, each one a number on a gun. A RELIC
 * (relics.ts) is the other one: a RULE over the whole board, bought once,
 * every one of them something the board could not do before. The relics
 * used to live in this file behind a `scope` field — which meant the code
 * said a relic was a kind of mod, and every screen that grouped the two
 * under one word repeated the untruth. They have their own file, their own
 * ids, their own odds and their own button now, and the word "upgrade" is
 * gone from both halves.
 *
 * WHAT A MOD IS FOR: THE MIDDLE OF A RUN. A mod makes the guns better at
 * what they already do, and that is the answer for as long as the thing
 * walking up the lane can be killed by a better gun. It stops being the
 * answer when the T5 hulls arrive — twenty thousand health behind
 * twenty-two points of armour will out-arithmetic any stack of "+4%
 * damage" — and answering THAT is the relics' job, which is why the track
 * deals the mods across its front half and the relics across its back
 * (track.ts).
 *
 * A MOD IS A MODULE LIKE ANY OTHER. It carries one of the four rarities
 * (rarity.ts) and wears that band's border, exactly as a turret card and
 * a formation do — one palette, now answering "how good is this" a third
 * time. A press of M rolls a band and then a mod uniformly inside it, the
 * same two-step every table in this game uses.
 *
 * IT IS A CHANCE RATHER THAN A GRANT. Owning one does not improve a single
 * gun on the board: it adds a roll to every turret PLACED FROM NOW ON
 * (`chance`), and a turret that wins that roll carries the attribute for
 * as long as it stands. So a mod is a bet on the future of the board, and
 * the patch a card puts down comes out speckled — thirty-six turrets, four
 * of them gleaming.
 *
 * EVERY MOD IS ROLLED FOR EVERY TURRET, INDEPENDENTLY. There is no "at
 * most one": a placement rolls once per mod the run owns (rollTurretMods),
 * so a turret can come out carrying all of them, and the odds alone make
 * that rare. That is why the low bands are small numbers — a run banking
 * ten mods is folding ten multipliers onto the same gun, and a common
 * worth a quarter of a turret would compound into nonsense by wave twenty.
 *
 * A MOD IS ANYTHING THAT COMPOSES ONTO ONE TURRET'S TABLE. It used to be
 * narrower than that — "a stat tweak and nothing else, behaviour is the
 * relics' job" — and the line was drawn in the wrong place: a cleaver that
 * fires five spikes instead of three is not a number going up, it is the
 * gun doing a different thing, and it is still one turret's business and
 * nobody else's. So a mod may change what a turret DOES as long as it says
 * so through `apply` (the shot count, the spread, the pierce) or `regen`;
 * what it may not do is reach past the turret it landed on. The one rule
 * that survives is the mechanical one: a turret's table is composed ONCE
 * at the placement (Tower.spec) and read flat by the fire loop, never
 * switched on per shot — so a mod has to be expressible as a table, and
 * "when this turret dies" is not. That belongs in relics.ts, where the sim
 * reads a rule by name at the one place it happens.
 *
 * A SECOND COPY IS A BIGGER NUMBER, NOT BETTER ODDS. This is the one
 * rule in the file that has been turned round: a copy used to be another
 * independent roll, folded into one probability, and the effect was fixed
 * at the def — so the tenth "+10% damage" a run bought was still +10%
 * damage, bought at odds that were already nearly certain. It bought
 * nothing a player could feel. Now the ODDS ARE THE DEF'S AND NEVER MOVE,
 * and the copies multiply what a turret born with the mod gets: three
 * copies of +8% damage is +24% on every turret that wins the same one
 * roll in three.
 *
 * THE COPIES SCALE THE BONUS AND NEVER THE PRICE. Every mod's upside is
 * linear in copies — a multiplier `m` reads 1 + (m - 1) x n, and a flat
 * step (pierce, plating, repair) is simply n of it — while what a mod
 * CHARGES stays exactly where the def put it: a second Sniper does not
 * take another ninety per cent of the turret's health, and a second Giant
 * is not four times the footprint. A build is meant to get better as it is
 * repeated, not to become impossible.
 *
 * AND IT IS STILL ONE BIT ON THE TURRET. Tower.mods is a mask, so a
 * turret carries a mod or does not; the STRENGTH is read off the run's
 * ledger when the spec is composed (applyTurretMods), which means a copy
 * bought mid-wave reaches the turrets already standing. That is a
 * deliberate change from what a mod used to promise — it used to change
 * nothing on the board at all — and it is the only way "the number goes
 * up" can mean anything to a player who already has a board.
 *
 * A MOD HAS NO CAP AND A RELIC HAS ONE OF EXACTLY ONE. A mod is a number
 * that grows, so there is always something a copy can do, and the run's
 * holdings are a TALLY. A relic is a rule in force; a rule does not get
 * more in force, so the run's relics are a SET (relics.ts).
 *
 * SO THE ONLY HOUSEKEEPING ON SCREEN IS THE COUNT. The boards used to
 * print "One a run" and "Up to 2 of them" under every module, which is a
 * line repeated twenty times to say what one rule says once. A mod prints
 * its odds, and the x3 on its chip is now the whole of what the copies did.
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
 * ONLY THE RARE AND ULTRA MODS HAVE NAMES. A common is not a character,
 * it is a tick: "+10% damage" IS its name, and a made-up one over the top
 * of that ("Honed Barrels") is a word the player has to learn in order to
 * be told a thing the number already said. So the low bands print their
 * tweak and the top two print a name — and the glyph says WHICH STAT
 * while the band colour says HOW MUCH, so a grey barrel and a blue barrel
 * are the same stat at two sizes and need no caption at all. Relics keep
 * their names, all of them: a relic is never a number.
 *
 * THE WHOLE CATALOG BUFFS THE PLAYER, on balance. Nothing here weakens
 * the swarm — debuffing the enemy is the mutators' half of the game
 * (mutation.ts) and they pull the other way — but an ULTRA mod may pay
 * for its size by gutting a stat the build does not want, which is what
 * makes it a build and not a bonus.
 *
 * AN ULTRA MOD IS THE TURRET CHANGING SPECIES. One draw in fifty
 * (MOD_WEIGHTS), so when one lands it has to be worth the fifty: a
 * SNIPER that reaches four times as far and dies to a stiff breeze, an
 * ALL ROUND that is simply better at everything, and a GIANT that is
 * twice the building and eats the whole card to be it. A "+15%" at the
 * top band would be a betrayal of the border it wears.
 */

/**
 * EVERY MOD, in catalog order — and the order is load-bearing twice over:
 * a turret carries the ones it rolled as a BITMASK keyed by position
 * (TURRET_MOD_IDS), and the shelf, the codex and the track all read the
 * catalog in this order. The unnamed ticks come first, band by band, and
 * their id is the stat and the step because their LABEL is the tweak (see
 * the header).
 */
export const MOD_IDS = [
  "dmg1",
  "rate1",
  "hp1",
  "range1",
  "dmg2",
  "rate2",
  "hp2",
  "range2",
  "regen1",
  // ...then the named ones
  "prototype",
  "bulwark",
  "sabot",
  "giant",
  "sniper",
  "allround",
] as const;
export type ModId = (typeof MOD_IDS)[number];

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
  | "allround";

export interface ModDef {
  id: ModId;
  /**
   * THE NAME — and only the RARE and ULTRA mods have one (see the header).
   * A common is a tick, not a character: its label is its tweak, and
   * `modName` is the one place that decides.
   */
  name?: string;
  /**
   * WHAT IT DOES TO THE STATS, in the fewest words that can be true:
   * "+10% damage", "+50% damage, +50% fire rate". EVERY mod carries one —
   * it is the LABEL of an unnamed one and the summary line of a named
   * one. It is written by hand rather than derived from `apply`, because
   * a function that returns a TowerStats cannot be asked what it changed
   * without running it on something.
   */
  tweak?: string;
  /**
   * THE SAME TWEAK AT THE COPY COUNT THE RUN ACTUALLY HOLDS — "+2%
   * damage" at one, "+14% damage" at seven. Every mod carries one. A
   * relic has no equivalent and needs none: it is held once, so its blurb
   * is already the whole of what it is worth (relics.ts).
   *
   * IT EXISTS BECAUSE THE SHELF USED TO SAY "3 copies — every one of
   * them applies", which is the arithmetic handed to the player to do
   * mid-wave. `tweak` is hand-written and a sentence cannot be
   * multiplied, so the total is written as a function of the count
   * beside it, from the same numbers `apply` reads.
   */
  total?: (copies: number) => string;
  rarity: Rarity;
  glyph: ModGlyph;
  /** what owning it does, in the player's own terms — the hover card */
  blurb: string;
  /**
   * THE ODDS ONE NEW TURRET IS BORN WITH THIS, and they are a CONSTANT —
   * copies buy strength, never odds (see the header).
   *
   * THERE IS NO CAP FIELD. A mod is a number that grows, so a run may
   * hold any number of copies and the M button never stops offering one:
   * the half cannot be bought out, which is exactly the difference
   * between it and the relics (relics.ts anyRelicLeft).
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
   * The stat surgery.
   *
   * IT IS HANDED THE RUN'S COPY COUNT and every mod below uses it: the
   * bonuses are linear in `copies` and the costs are not (see the header).
   *
   * EVERY MOD HAS ONE, or repairs (`regen`) — checked at import. A module
   * that is a MOMENT rather than a table ("when this turret dies") cannot
   * be expressed here at all, and is a relic (relics.ts), where the sim
   * reads it by name at the one place it happens.
   */
  apply?: (s: TowerStats, copies: number) => TowerStats;
  /**
   * HEALTH RETURNED A SECOND PER COPY OWNED, as a fraction of the
   * turret's OWN ceiling —
   * so the same 3% mends a braced repeater faster in absolute hp than a
   * bare tacker, which is what "a percentage of its own pool" has to mean.
   * The sim resolves it to hp/second once at the placement
   * (Sim.resolveTower) and the fire loop adds `regen * dt`; nothing
   * re-reads a percentage per tick.
   */
  regen?: number;
  /**
   * THE FOOTPRINT MULTIPLIER — the GIANT and nothing else. A turret with
   * this stands on `scale` times its kind's edge in tiles, so a 4x4
   * railhead becomes an 8x8 building. It is on the def rather than a
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
   * A MOD THAT ONLY MEANS ANYTHING ON ONE KIND — one turret's own
   * attribute and nothing else's. Unset is every kind, and NOTHING SETS
   * IT TODAY: the one mod that did has been taken off the list. The
   * machinery stays because the next one-kind attribute wants it.
   *
   * It gates the ROLL: a placement of any other kind never rolls for it
   * at all (rollTurretMods), so the odds are per THAT KIND placed and the
   * shelf says so (oddsLine). It is on the def rather than inside `apply`
   * because the roll happens before there is a table to apply anything to.
   */
  only?: TowerKind;
}

// ---------------------------------------------------------------------------
// THE TUNING BEHIND THE MODS THAT ARE NOT A PLAIN MULTIPLIER
//
// The numbers are written here beside the def they belong to rather than at
// the site that reads them. Every relic's tuning lives in relics.ts for the
// same reason.
// ---------------------------------------------------------------------------

/**
 * THE GIANT'S EDGE, as a multiple of the turret's own: twice, so a tacker's
 * 2x2 is a 4x4 and a railhead's 4x4 is an 8x8 — the biggest thing that
 * will ever stand on this board, core included.
 */
export const GIANT_SCALE = 2;

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
  total: (copies: number) => string,
  chance: number,
  apply: (s: TowerStats, copies: number) => TowerStats,
  regen?: number,
): ModDef => ({
  id,
  tweak,
  total,
  rarity,
  glyph,
  chance,
  blurb: `A chance for a new turret to be born with ${tweak} — again for every copy held.`,
  apply,
  regen,
});

/** a multiplier as COPIES of it read: 1 + (m - 1) x n, so two of a x1.5
 *  is a x2 and never a x2.25. Linear is the promise on the chip — "+50%"
 *  twice is "+100%" — and compounding would quietly outrun it */
const per = (mul: number, copies: number): number => 1 + (mul - 1) * Math.max(1, copies);

/**
 * THE `total` SIDE OF THE SAME ARITHMETIC (ModDef.total). A multiplier
 * step reads as the percentage `per` would hand `apply` at that count, a
 * flat step as the count times itself — so the line on the chip is the
 * number on the turret and never a second opinion about it.
 */
const nOf = (copies: number): number => Math.max(1, copies);
const pctOf = (mul: number, label: string) => (n: number) =>
  `+${Math.round((mul - 1) * 100 * nOf(n))}% ${label}`;
const flatOf = (step: number, label: string) => (n: number) => `+${step * nOf(n)} ${label}`;
/** two or more steps on one attribute, in the order the tweak says them */
const bothOf =
  (...parts: readonly ((n: number) => string)[]) =>
  (n: number): string =>
    parts.map((f) => f(n)).join(", ");

const TURRET_MODS: readonly ModDef[] = [
  // ---- COMMON: a fiftieth of a turret, at three rolls in ten ----------
  //
  // THE TICKS ARE A FIFTH OF WHAT THEY WERE, and this is the second time
  // they have been cut for the same reason: the copies are the dial (see
  // the header) and a late run does not hold three of a common, it holds
  // THIRTY. At +5% a copy, thirty commons was a turret firing at four
  // times its own damage off the grey band alone, which made the rares
  // and the ultras a rounding error on the way past. At +2% the same
  // thirty is +60% — a real number, earned by a stack nobody assembles
  // by accident, and still worth less than one Prototype Chassis.
  tick("dmg1", "common", "barrel", "+2% damage", pctOf(1.02, "damage"), 0.3, (t, n) => stronger(t, per(1.02, n))),
  tick("rate1", "common", "gear", "+2% fire rate", pctOf(1.02, "fire rate"), 0.3, (t, n) => faster(t, per(1.02, n))),
  tick("hp1", "common", "plate", "+4% health", pctOf(1.04, "health"), 0.3, (t, n) => tougher(t, per(1.04, n))),
  tick("range1", "common", "lens", "+2% range", pctOf(1.02, "range"), 0.3, (t, n) => reaching(t, per(1.02, n))),
  // ---- UNCOMMON: twice the common step, at under one roll in five -----
  tick("dmg2", "uncommon", "barrel", "+4% damage", pctOf(1.04, "damage"), 0.18, (t, n) => stronger(t, per(1.04, n))),
  tick("rate2", "uncommon", "gear", "+4% fire rate", pctOf(1.04, "fire rate"), 0.18, (t, n) => faster(t, per(1.04, n))),
  tick("hp2", "uncommon", "plate", "+8% health", pctOf(1.08, "health"), 0.18, (t, n) => tougher(t, per(1.08, n))),
  tick("range2", "uncommon", "lens", "+4% range", pctOf(1.04, "range"), 0.18, (t, n) => reaching(t, per(1.04, n))),
  // THERE IS NO PIERCE TICK, and the gap is deliberate. PIERCE IS A WHOLE
  // BODY AND NEVER A PERCENTAGE: there is no "+10% of a body to punch
  // through", so unlike the four dials above it cannot be shaved when the
  // copies start adding up — a stack of ten commons is +20% damage and a
  // stack of ten one-body ticks is a gun whose rounds cross the whole
  // lane. The thing it wanted to be at a cut rate would have been "+1
  // every second copy", and ONE STACK IS ONE STACK — a copy that does
  // half a thing is a chip the player cannot read and arithmetic nobody
  // asked for.
  //
  // AND THE IDEA IS ALREADY IN THE CATALOG, one band up and wearing the
  // same spike: SABOT ROUNDS is +1 pierce and harder rounds with it, at a
  // tenth of a draw. So an uncommon pierce tick was a worse Sabot at
  // better odds, which is two entries for one idea. Pierce is a rare's
  // job now, and the uncommon band is the four dials and the repair.
  //
  // REPAIR is the one stat a plain turret has none of, so the tick
  // is the whole thing rather than a percentage of nothing. Its copies are
  // summed by modRegen rather than here — `regen` is a field, not an apply
  tick(
    "regen1", "uncommon", "weave", "repairs 0.15% a second",
    (n) => `repairs ${(0.15 * nOf(n)).toFixed(2).replace(/\.?0+$/, "")}% a second`,
    0.18,
    (t) => t,
    0.0015,
  ),

  // ---- RARE: NAMED, and a pair of stats rather than a dial ------------
  // What makes these rare rather than a third tick is that each one is a
  // SHAPE — a gun, a wall, a spear — so rolling one says something about
  // the turret it landed on.
  //
  // THESE WERE CUT WITH THE TICKS, and for the same reason: an amber
  // attribute comes up one draw in ten, which over a run is a fistful
  // and not a prize. Half a turret a copy compounded into a board that
  // had stopped caring what the purple band did, so the rare step is now
  // a QUARTER of a turret on two axes at once — still the biggest thing
  // below the ultras, and still the band a build is named after.
  {
    id: "prototype",
    name: "Prototype Chassis",
    tweak: "+12% damage, +12% fire rate",
    total: bothOf(pctOf(1.12, "damage"), pctOf(1.12, "fire rate")),
    rarity: "rare",
    glyph: "chassis",
    chance: 0.1,
    blurb: "A chance for a new turret to be born on a prototype frame: more damage and more rate of fire, on both axes at once.",
    apply: (t, n) => faster(stronger(t, per(1.12, n)), per(1.12, n)),
  },
  {
    id: "bulwark",
    name: "Bulwark Plating",
    tweak: "+25% health, +2 armor, repairs 0.8% a second",
    total: bothOf(pctOf(1.25, "health"), flatOf(2, "armor"), (n) =>
      `repairs ${(0.8 * nOf(n)).toFixed(2).replace(/\.?0+$/, "")}% a second`),
    rarity: "rare",
    glyph: "shield",
    chance: 0.1,
    // the +2 is half an ironhide2's plate — a copy is not the difference
    // between an ironhide1 biting and bouncing off any more, but four are
    blurb: "A chance for a new turret to be born armoured: more health, plating an ironhide1 has to get through, and it mends itself.",
    apply: (t, n) => armored(tougher(t, per(1.25, n)), 2 * Math.max(1, n)),
    regen: 0.008,
  },
  {
    id: "sabot",
    name: "Sabot Rounds",
    tweak: "+1 pierce, +15% damage",
    total: bothOf(flatOf(1, "pierce"), pctOf(1.15, "damage")),
    rarity: "rare",
    glyph: "spike",
    chance: 0.1,
    blurb: "A chance for a new turret to fire sabot: harder rounds, and each one punches through another body.",
    apply: (t, n) => piercing(stronger(t, per(1.15, n)), 1 * Math.max(1, n)),
  },
  // ---- ULTRA: NAMED, and the turret changes species --------------------
  {
    id: "giant",
    name: "Giant",
    tweak: "+1000% health, +200% damage, +10 armor, −90% range, twice the footprint",
    // the blindness and the footprint are the PRICE and never scale, so
    // they read the same at every count — see `scale`
    total: bothOf(pctOf(11, "health"), pctOf(3, "damage"), flatOf(10, "armor"), () =>
      "−90% range, twice the footprint"),
    rarity: "ultra",
    glyph: "giant",
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
    total: bothOf(pctOf(4, "range"), pctOf(3, "fire rate"), pctOf(2, "damage"), () => "−90% health"),
    rarity: "ultra",
    glyph: "scope",
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
    total: bothOf(
      pctOf(2, "damage"), pctOf(2, "fire rate"), pctOf(2, "health"), pctOf(1.5, "range"),
      flatOf(3, "pierce"),
    ),
    rarity: "ultra",
    glyph: "allround",
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

/** the whole catalog — one category, so this IS the turret mods */
export const MODS: readonly ModDef[] = TURRET_MODS;

const BY_ID = new Map<ModId, ModDef>(MODS.map((m) => [m.id, m]));

/**
 * WHAT TO CALL ONE, and the single answer every screen reads: the name if
 * it has one, and its tweak if it does not (see the header — only the
 * rare and ultra mods are named). A relic always has a name, so its side
 * needs no such rule (relics.ts relicName).
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

/** the bit one mod occupies in Tower.mods */
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
  // chanceOf, not the def's own: the dashboard's dial has to move the odds
  // the shelf prints and the odds the placement rolls, or the two disagree
  return Math.min(1, chanceOf(id));
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
 * THE ODDS AT THE M BUTTON, and they are STEEPER THAN THE TURRET DEAL'S
 * at the top: one draw in fifty is purple against the formation table's
 * one in ten. A formation is spent the moment it is placed and a mod is
 * owned for the rest of the run, so the two cannot possibly be priced
 * against the same curve.
 *
 * Relative, like every weight table here, and renormalised over the bands
 * the save has actually opened (rollMod).
 */
export const MOD_WEIGHTS: RarityWeights = {
  common: 52,
  uncommon: 30,
  rare: 16,
  ultra: 2,
};

/**
 * ...and the same table as a dial the dashboard can turn (rarity.ts
 * weightDial). IT IS THE MODS' TABLE AND NOTHING ELSE'S: the relics have
 * their own (relics.ts RELIC_ODDS). The two used to share this one, which
 * meant bending the odds of an ultra MOD bent the odds of an ultra RELIC
 * with it — two categories with one knob between them.
 */
export const MOD_ODDS: WeightDial = weightDial(MOD_WEIGHTS);

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
 * IT NEVER RETURNS NULL ON A CAMPAIGN THAT HAS OPENED ANYTHING. A mod has
 * no cap — a copy is always worth something — so unlike the relic half
 * (relics.ts rollRelic) this pool never empties and the M button is never
 * bought out. Null means the save has opened no mod at all, which only a
 * board with an empty `open` can manage.
 *
 * `open` IS WHAT THE TRACK HAS DEALT (track.ts modsAt, carried in on
 * TechState.mods); null is every mod there is, which is what a free board
 * draws from — the sandbox and the editors are not a campaign and have
 * nothing to unlock.
 */
export function rollMod(
  weights: RarityWeights = MOD_ODDS.live(),
  rng: () => number = Math.random,
  open: ReadonlySet<ModId> | null = null,
): ModId | null {
  const byRarity = new Map<Rarity, ModId[]>();
  for (const m of MODS) {
    if (open && !open.has(m.id)) continue;
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
  const pct = Math.round(chanceAt(d.id) * 100);
  // "chance to roll" rather than "on every turret placed": the words a
  // player is reading mid-wave should be the shortest true ones, and
  // WHAT is rolled against only has to be said where it is not a turret
  if (d.solo) return `${pct}% chance to roll, per card`;
  if (d.only) return `${pct}% chance to roll, per ${TOWERS[d.only].name.toLowerCase()}`;
  return `${pct}% chance to roll`;
}

/**
 * WHAT THE STACK IS WORTH RIGHT NOW — the accumulated tweak at the copy
 * count the run holds. A relic has no equivalent: it is held once.
 *
 * IT USED TO SAY THE COUNT AND MAKE THE PLAYER DO THE ARITHMETIC: "3
 * copies — every one of them applies, so a turret born with it gets all
 * 3". A number multiplied three times in the head, mid-wave, over a
 * sentence that had already said the same thing on the chip. So the def
 * carries the total as a function of the count (ModDef.total) and this
 * prints it: the chip says "+2% damage" and the card says "+6% damage",
 * which is the only number a player wanted off the shelf.
 *
 * ONE COPY PRINTS NOTHING for an unnamed tick, because the tick's own
 * NAME is its tweak and the line would be the title said twice; a named
 * attribute prints its total from the first copy, where the name says
 * nothing about the numbers.
 */
export function stackLine(d: ModDef, copies: number): string | null {
  if (!d.total) return null;
  if (copies <= 1 && !d.name) return null;
  return d.total(Math.max(1, copies));
}

/**
 * HAS THE TRACK OPENED THE MOD HALF AT ALL? — what tells a LOCKED M
 * button from a live one. There is no "bought out" answer on this side:
 * a mod has no cap, so once the half is open it stays open (see rollMod).
 * The relic half has both answers (relics.ts).
 */
export const anyModOpen = (open: ReadonlySet<ModId> | null): boolean =>
  !open || MODS.some((m) => open.has(m.id));

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
    // ...AND WHAT IT IS WORTH AT THE COUNT THE RUN HOLDS (ModDef.total).
    // The shelf prints the accumulated number rather than the copy count
    // (stackLine), so an attribute without one is an attribute whose
    // stack is invisible to the player who bought it
    if (!m.total) throw new Error(`the turret mod "${m.id}" does not say what a stack of it is worth`);
    // A MOD COMPOSES ONTO ONE TURRET'S TABLE (see the header): if it
    // neither composes the table nor repairs, it is a moment wearing a
    // mod's clothes — "when this dies" is not a table — and it belongs in
    // relics.ts, where the sim reads a rule by name
    if (!m.apply && !m.regen)
      throw new Error(`the mod "${m.id}" composes nothing onto the table — a moment is a relic`);
    // ONLY RARE AND ULTRA ARE NAMED — the low bands print their tweak
    const named = m.rarity === "rare" || m.rarity === "ultra";
    if (named !== (m.name !== undefined))
      throw new Error(
        `the ${m.rarity} turret mod "${m.id}" ${m.name ? "has" : "has no"} name; only rare and ultra are named`,
      );
  }
  // THE CATALOG AND ITS ID LIST AGREE, in both directions — the mask is
  // keyed by position in TURRET_MOD_IDS, so a def missing from MOD_IDS
  // would silently take a bit off every mod written after it
  const ids = new Set<string>(MOD_IDS);
  for (const m of MODS)
    if (!ids.has(m.id)) throw new Error(`the mod "${m.id}" is not in MOD_IDS`);
  if (MODS.length !== MOD_IDS.length)
    throw new Error("the catalog and MOD_IDS disagree about how many mods there are");
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
