/**
 * MUTATORS — the rules a run is played UNDER, rolled for it rather than
 * chosen by anyone.
 *
 * THIS IS THE STARCRAFT II MODEL, and every decision below follows from
 * it. Each mutator carries a POINT COST that says how much harder it makes
 * the run; a difficulty carries a BUDGET and a COUNT; and picking a
 * difficulty rolls that many mutators to fit inside that budget
 * (rollMutations). The player never picks a mutator, never switches one
 * off, and never sees the roll coming — that is the whole appeal of the
 * mode, and it is why this file has no toggle in it any more.
 *
 * WHY IT STOPPED BEING A TECH-TREE LINE. Mutation used to be the tree's
 * left column: a rank per boss felled, and a switch per rank the player
 * flipped on if they fancied a harder game. Nobody flips those switches —
 * an optional handicap with no reward attached is one nobody takes, and it
 * had to be BALANCED as though everyone did. So it became the opposite
 * thing: MANDATORY, on the maps that want it, and unchosen.
 *
 * WHERE IT IS MANDATORY: EVERY DEPLOY FROM LEVEL 2 UP, on every world.
 * The gate is the LADDER, not the map — a run is played under the points
 * and the count its difficulty carries (mutationBudget, mutationPicks,
 * both of them dials on the rung: see RungKnobs in ladder.ts), and Level 1
 * carries zero of each.
 *
 * THE ROLL USED TO BE A PER-WORLD SWITCH (`LevelSpec.mutators`) and that
 * was one gate too many. A map either mutated or it did not, and the
 * difficulty only decided how hard — so the first world could never be
 * made harder and every world after it could never be played straight.
 * Hanging the roll on the tier instead says the same thing with one
 * number: Level 1 is the campaign as authored, which is where the fleet is
 * still being stood up and a roll on top of that is a wall rather than a
 * challenge. Every step above it is the same script under rules nobody
 * chose, which is ENDGAME RESOURCE FARMING with a roguelike shape.
 *
 * A LEVEL MAY STILL CARRY RULES OF ITS OWN, and that is a different thing
 * from the switch above. `LevelSpec.intrinsicMutation` is a list of rules
 * a world is ALWAYS played under — at every tier, the bottom one included
 * — because they are part of what that world is rather than part of how
 * hard it is being played. They are never rolled and never charged against
 * the tier's points (see mutationsInForce and rollMutations' `exclude`).
 * The old switch said "this map is allowed to mutate, at whatever strength
 * the difficulty says", which put a level in charge of a difficulty curve;
 * this says "this map is the shielded one", which is authorship.
 *
 * THE COSTS ARE THE ONLY BALANCE DIAL. A mutator is not "for" a difficulty
 * — it is worth a number of points, and a difficulty can afford it or
 * cannot. So a cheap mutator turns up at every level of play and an
 * expensive one only where the budget stretches to it, which falls out of
 * the arithmetic instead of needing a per-difficulty list to keep in step.
 *
 * A MUTATOR CHANGES A WAVE AFTER IT SPAWNS, NEVER WHAT THE SCRIPT SENDS.
 * That is a hard rule and it is what keeps ladder.ts honest: wave counts,
 * enemy totals and the drop-ratio audit stay true whatever the roll came
 * back with. A rule that wants to change the script is a wave transform
 * (see WaveTransform), not a mutator.
 */

/** every mutator that exists, by id. The id is what a run spec carries
 *  (LevelSpec.mutation) and what the sim asks about — never the name, and
 *  never an index, so the catalog can be reordered freely */
export type MutationId =
  | "volatile"
  | "overshields"
  | "shieldTowers"
  | "hungry"
  | "armored"
  | "speedy";

export interface MutationDef {
  /** stable key, in the run spec and in the sim's questions */
  id: MutationId;
  /** what it is called on the codex card and in the deploy panel */
  name: string;
  /**
   * THE RULE, IN ONE SHORT SENTENCE — what the codex card and the deploy
   * panel both print.
   *
   * IT SAYS WHAT HAPPENS, NOT HOW IT IS IMPLEMENTED. These used to spell
   * out the meal cap, the health multiplier and which statuses survive; a
   * player reading a card wants to know what is about to be done to them,
   * and the exact arithmetic is in the notes further down this file where
   * it can be kept honest. Anything that does not change how the run is
   * PLAYED does not belong in the sentence.
   */
  blurb: string;
  /**
   * WHAT IT IS WORTH, in the budget a difficulty hands the roller. See
   * MUT_COST_MIN/MAX for the scale, and note that the cost is about how
   * much of the player's game it takes away, not about how much health it
   * adds: Speedy adds no health at all and is still one of the two
   * dearest things here.
   */
  cost: number;
}

/**
 * THE COST SCALE, and the only guidance a new mutator gets:
 *
 *   1-2  LIGHT   — noticed every wave, decides no run on its own
 *   3-4  HEAVY   — changes how the map has to be held
 *   5-6  BRUTAL  — invalidates a way of playing outright
 *
 * Nothing may cost more than MUT_COST_MAX. A rule worth more than that is
 * one that cannot be rolled ALONGSIDE two others at the top difficulty,
 * and a mutator that has to be alone is a game mode.
 */
export const MUT_COST_MIN = 1;
export const MUT_COST_MAX = 6;

/**
 * THE CATALOG, cheapest first — which is also codex order, so the list a
 * player reads climbs from the survivable to the ruinous.
 *
 * THESE COSTS CAME OFF THE DASHBOARD. They rode in public/balance.json's
 * `mutations` section while they were being tuned and are authored here
 * now; that file is empty again. Nothing in the catalog spends into the
 * BRUTAL band today — the scale still allows it (MUT_COST_MAX), no rule
 * currently earns it.
 */
export const MUTATIONS: readonly MutationDef[] = [
  {
    id: "armored",
    name: "Armored Swarms",
    cost: 1,
    blurb:
      "Lower tier units gain massive armor boosts.",
  },
  {
    id: "volatile",
    name: "Volatile",
    cost: 2,
    blurb:
      "Enemies detonate when they die and damages nearby turrets.",
  },
  {
    id: "overshields",
    name: "Overshields",
    cost: 3,
    blurb:
      "Force fields are five times as strong.",
  },
  {
    id: "shieldTowers",
    name: "Shield Towers",
    cost: 3,
    blurb:
      "Shield towers rise periodically, obsorbing bullets until they are destroyed.",
  },
  {
    id: "hungry",
    name: "Hungry Mechs",
    cost: 4,
    blurb:
      "Hungry mechs eats its neighbours and become stronger with every meal.",
  },
  {
    id: "speedy",
    name: "Speedy",
    cost: 4,
    blurb: "Every enemy moves twice as fast, and nothing can slow them.",
  },
];

/**
 * A CATALOG THAT BREAKS ITS OWN RULES IS A PROGRAMMING ERROR, and it is
 * caught the first time any build or page loads this module rather than on
 * the deploy that happens to roll the offending entry. It is the same
 * bargain validateWaveTransforms makes in levels.ts: the list is authored
 * by hand, so the list checks itself.
 */
for (const m of MUTATIONS) {
  if (!Number.isInteger(m.cost) || m.cost < MUT_COST_MIN || m.cost > MUT_COST_MAX)
    throw new Error(
      `mutator "${m.id}" costs ${m.cost}; the scale is ${MUT_COST_MIN}-${MUT_COST_MAX} whole points`,
    );
  if (MUTATIONS.filter((o) => o.id === m.id).length > 1)
    throw new Error(`two mutators share the id "${m.id}"`);
}

/** the entry for an id, or null for one no build of the game knows */
export const mutationById = (id: string): MutationDef | null =>
  MUTATIONS.find((m) => m.id === id) ?? null;

// ---------- WHAT A RULE COSTS, AND BENDING IT --------------------------
//
// THE COST IS THE ONLY BALANCE DIAL THIS FILE HAS, so it is the one thing
// here the admin dashboard can turn without a rebuild — the same bargain
// tech.ts strikes for turret prices and ladder.ts for the rung dials. A
// cost decides which difficulties can afford a rule at all, so finding the
// right number is an afternoon of small edits and re-rolls, and
// recompiling between each one is how that afternoon becomes a week.
//
// THE OVERRIDE IS A SCRATCH PAD, NEVER THE SOURCE OF TRUTH. Once a number
// is settled it belongs on the entry in MUTATIONS above, where it sits
// next to the blurb that justifies it; the map below is what holds it in
// the meantime. Everything that asks what a rule is worth goes through
// mutationCostOf — the roller, the deploy panel, the codex bands and the
// sandbox — so a bent cost is bent everywhere or the panel would promise a
// roll the run does not play.
//
// ONE THING THE OVERRIDE DELIBERATELY DOES NOT DO IS REORDER THE CATALOG.
// MUTATIONS is authored cheapest-first and sortByCatalog reads that order,
// not the costs; a bent cost changes what a rule is worth without moving
// it in the codex, which keeps a run's printed roll stable while a number
// is being swept.

/** costs the dashboard has bent, by id — empty in a shipped run */
const costOverrides = new Map<MutationId, number>();

/** what a rule is worth right now — authored unless the document bent it */
export const mutationCostOf = (id: MutationId): number =>
  costOverrides.get(id) ?? mutationById(id)?.cost ?? 0;

/** what the catalog authored — where a Reset returns to */
export const authoredMutationCost = (id: MutationId): number =>
  mutationById(id)?.cost ?? 0;

/**
 * Price one rule somewhere else; undefined restores the authored value.
 * Clamped to the scale and rounded, because every reader treats a cost as
 * whole points against a whole budget.
 */
export function setMutationCost(id: MutationId, value: number | undefined): void {
  if (value === undefined || !Number.isFinite(value)) {
    costOverrides.delete(id);
    return;
  }
  const n = Math.min(MUT_COST_MAX, Math.max(MUT_COST_MIN, Math.round(value)));
  if (n === authoredMutationCost(id)) costOverrides.delete(id);
  else costOverrides.set(id, n);
}

/** only what has actually been bent, for the balance document */
export function allMutationCostOverrides(): Record<string, number> {
  return Object.fromEntries(costOverrides);
}

/** replace every cost override at once — what a saved document applies */
export function applyMutationCostOverrides(doc: Record<string, unknown>): void {
  costOverrides.clear();
  for (const m of MUTATIONS) {
    const v = doc[m.id];
    if (typeof v !== "number" || !Number.isFinite(v)) continue;
    setMutationCost(m.id, v);
  }
}

/**
 * EVERY RULE A RUN IS PLAYED UNDER: the ones the LEVEL carries by design
 * (LevelSpec.intrinsicMutation) and the ones the deploy ROLLED for it
 * (LevelSpec.mutation), as one clean list in catalog order.
 *
 * The two are separate fields and one question. A level's own rules are
 * part of what that world IS — the naval front is a shielded front at
 * every tier, including the bottom one, and it is not spending the tier's
 * points to be — while the roll is what this particular deploy came back
 * with. Nothing downstream of this call needs to know which is which: the
 * sim asks what is in force, and the answer is the union.
 *
 * IT IS THE ONLY WAY TO ASK. Every entry point that can start a run — the
 * campaign deploy, the sandbox, the editor's preview, `__ladder.spec` —
 * goes through here or through the sim, so a level cannot be played
 * without the rules it was authored with.
 */
export const mutationsInForce = (
  intrinsic: readonly MutationId[] | undefined,
  rolled: readonly MutationId[] | undefined,
): MutationId[] => cleanMutations([...(intrinsic ?? []), ...(rolled ?? [])]);

/** is this rule in force for the run? — the sim's one question */
export const hasMutation = (
  active: readonly MutationId[] | undefined,
  id: MutationId,
): boolean => !!active && active.includes(id);

/** what a set of mutators is worth, for the panel that prints the roll */
export const mutationCost = (active: readonly MutationId[]): number =>
  active.reduce((sum, id) => sum + mutationCostOf(id), 0);

/**
 * Clean a raw list of mutator ids: known ids only, no duplicates, in
 * catalog order. Every reader goes through this, so a hand-edited save, an
 * old run spec or a document written when the catalog was different
 * degrades to the rules that actually exist rather than handing the sim a
 * name it has never heard of.
 */
export function cleanMutations(raw: unknown): MutationId[] {
  if (!Array.isArray(raw)) return [];
  const out: MutationId[] = [];
  for (const v of raw) {
    const def = typeof v === "string" ? mutationById(v) : null;
    if (!def || out.includes(def.id)) continue;
    out.push(def.id);
  }
  return sortByCatalog(out);
}

/** catalog order, so a roll always reads cheapest rule first */
const sortByCatalog = (ids: readonly MutationId[]): MutationId[] =>
  [...ids].sort(
    (a, b) =>
      MUTATIONS.findIndex((m) => m.id === a) - MUTATIONS.findIndex((m) => m.id === b),
  );

// ---------- THE ROLL ----------------------------------------------------

/**
 * HOW MANY RULES A RUN IS PLAYED UNDER — the range the dial may be set to,
 * not a range the roller picks from.
 *
 * The count used to be rolled as well: three or four, chosen at random
 * alongside the rules themselves. It is a DIAL ON THE TIER now
 * (RungKnobs.mutationCount in ladder.ts), because the count is the one
 * part of a mutating run that is a difficulty curve rather than a
 * surprise — a player stepping from Level 5 to Level 6 is entitled to see
 * what they are taking on, and "three or four, we shall see" is not
 * something a ladder can be tuned against.
 *
 * ZERO IS A LEGAL SETTING and it is what Level 1 carries: a tier with no
 * rules is the campaign as authored. Five is the ceiling for the same
 * reason MUT_COST_MAX is six — a run under six simultaneous rules is not a
 * harder run, it is a different game, and nothing in the catalog is
 * written to be read alongside that many others.
 */
export const MUT_COUNT_MIN = 0;
export const MUT_COUNT_MAX = 5;

/**
 * THE BUDGET A DIFFICULTY HANDS THE ROLLER, as points.
 *
 * It is arithmetic on the tier index for the same reason RUNGS is (see
 * ladder.ts): a ladder that extends must not need this table re-authored.
 * Level 1 spends nothing at all; Level 2 affords three light rules, and
 * the top affords four heavy ones, or three brutal ones and change.
 *
 *   tier    1    2    3    4    5    6    7    8    9   10
 *   points  0    8   10   11   13   15   17   19   20   22
 *
 * IT IS ONLY WHERE THE DIAL STARTS. Every one of these numbers is a knob
 * on the rung (RungKnobs.mutationPoints), bendable from the admin balance
 * tab without a rebuild, exactly like enemy level and shield scale. What
 * is authored here is what a Reset returns to.
 *
 * IT ONLY READS TRUE ONCE THE CATALOG HAS LIGHT RULES IN IT. Today's two
 * entries cost 4 and 5, so the lower tiers genuinely cannot afford three
 * of anything and roll what they can (see rollMutations). That is the
 * catalog being short, not the budget being wrong — the fix is cheap
 * mutators, and the arithmetic here is already waiting for them.
 */
export const MUT_BUDGET_BASE = 6;
export const MUT_BUDGET_PER_RUNG = 1.8;

/**
 * The points a tier (0-based, as the ladder counts them) may spend.
 *
 * THE BOTTOM TIER IS ZERO AND THAT IS NOT THE ARITHMETIC — it is the rule
 * that Level 1 is the campaign as authored, applied here so that every
 * reader of the curve gets it rather than each one having to remember.
 * The arithmetic starts at Level 2, which is what the table prints.
 */
export const mutationBudget = (tier: number): number =>
  tier <= 0 ? 0 : Math.round(MUT_BUDGET_BASE + MUT_BUDGET_PER_RUNG * tier);

/**
 * HOW MANY RULES A TIER ROLLS, as authored — the other half of the pair,
 * and the ladder's real difficulty curve.
 *
 * Three from Level 2, one more every MUT_PICKS_EVERY tiers, capped at
 * MUT_COUNT_MAX:
 *
 *   tier    1    2    3    4    5    6    7    8    9   10
 *   rules   0    3    3    3    3    4    4    4    4    5
 *
 * A DEARER RULE AND AN EXTRA RULE ARE DIFFERENT KINDS OF HARDER, which is
 * why this climbs so much more slowly than the budget does. Points buy
 * WEIGHT — the same slots, filled with worse things. The count buys
 * BREADTH, and breadth is what invalidates a way of playing outright,
 * because every rule added is another answer the board has to hold at the
 * same time. Breadth is the scarcer of the two, so it moves in whole
 * steps and rarely.
 */
export const MUT_PICKS_BASE = 3;
export const MUT_PICKS_EVERY = 4;

export const mutationPicks = (tier: number): number =>
  tier <= 0
    ? 0
    : Math.min(
        MUT_COUNT_MAX,
        MUT_PICKS_BASE + Math.floor((tier - 1) / MUT_PICKS_EVERY),
      );

// The floor, as an invariant rather than a paragraph: the FIRST mutating
// tier must be able to pay for its own full roll at the lightest cost the
// scale allows, or the easiest mutating difficulty would quietly be the
// one with the fewest rules. Checking tier 1 checks all of them — the
// budget climbs by MUT_BUDGET_PER_RUNG a tier and the count by a quarter
// of a rule, so the purse only ever gets roomier per slot.
if (mutationBudget(1) < mutationPicks(1) * MUT_COST_MIN)
  throw new Error(
    `Level 2's ${mutationBudget(1)} points cannot pay for ${mutationPicks(1)} mutators`,
  );

/** how many shuffles the roller tries before keeping its best (see below) */
const ROLL_TRIES = 24;

/**
 * ROLL A RUN'S MUTATORS: `want` rules, together fitting the budget.
 *
 * THE COUNT COMES IN AND THE BUDGET IS SPENT ON IT, rather than the budget
 * deciding how many. Filling a budget greedily until it ran out would make
 * every high difficulty a five-rule run and every low one a three-rule
 * run, which is a ramp the point costs already provide — and it would take
 * the count away from the ladder, which is the one place a difficulty is
 * supposed to be legible in advance (see MUT_COUNT_MAX). What a player
 * should not be able to predict is WHICH rules, not how many.
 *
 * THE PASS IS A SHUFFLE AND A WALK: take each rule the remaining budget
 * covers until the count is met. That alone is a legal roll, and a random
 * one — but a single walk can strand a third of the budget by taking a
 * dear rule early, and it can come back short-handed when the rules left
 * are all pricier than what is in the purse. So the roller runs the walk
 * ROLL_TRIES times and keeps the best: MOST RULES first, then MOST POINTS
 * SPENT.
 *
 * SPENDING THE BUDGET IS THE WHOLE DIFFICULTY CURVE, which is why it is
 * the tiebreak and not an afterthought. A roll that habitually left points
 * on the table would make rung 10 and rung 4 the same run. So the dear
 * rules are where the budget stretches to them and nowhere else — and the
 * variety is in WHICH of the combinations that spend it turns up, of
 * which a catalog of any size has plenty.
 *
 * IT NEVER OVERSPENDS AND IT NEVER REPEATS A RULE. It can return fewer
 * rules than were asked for, but only when the catalog cannot honestly do
 * better: a two-entry catalog at a low tier is one rule, because a second
 * one would be a rule the budget has not paid for. A `want` of zero — what
 * Level 1 carries — returns nothing without touching the catalog at all.
 */
export function rollMutations(
  budget: number,
  want: number,
  exclude: readonly MutationId[] = [],
  rand: () => number = Math.random,
): MutationId[] {
  // the rules a level already plays under by design are not in the draw and
  // are not paid for out of this budget (see mutationsInForce): rolling one
  // of them would spend points to change nothing
  const pool = MUTATIONS.filter((m) => !exclude.includes(m.id));
  want = Math.min(pool.length, Math.max(0, Math.floor(want)));
  if (want === 0 || budget <= 0) return [];
  let best: MutationDef[] = [];
  let bestSpend = -1;
  for (let t = 0; t < ROLL_TRIES; t++) {
    const take: MutationDef[] = [];
    let spent = 0;
    for (const m of shuffled(pool, rand)) {
      if (take.length >= want) break;
      // mutationCostOf, not m.cost: the roll has to spend what the dashboard
      // says a rule is worth, or a bent cost would move every panel except
      // the one that actually picks the rules
      const price = mutationCostOf(m.id);
      if (spent + price > budget) continue;
      take.push(m);
      spent += price;
    }
    if (take.length > best.length || (take.length === best.length && spent > bestSpend)) {
      best = take;
      bestSpend = spent;
    }
  }
  return sortByCatalog(best.map((m) => m.id));
}

/** a Fisher-Yates copy — the roller never reorders the catalog itself */
function shuffled<T>(list: readonly T[], rand: () => number): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// ---------- HUNGRY ------------------------------------------------------
//
// A hungry unit is not a new KIND — every wave the script sends is
// untouched, and the level editor's arithmetic (ladder.ts) still describes
// exactly what arrives. What changes is that one body in twenty walks in
// with an appetite, and the wave then eats itself down into fewer, fatter
// units.
//
// RARER AND HUNGRIER, and the two moved together on purpose. Halving the
// share while doubling the appetite leaves roughly the same number of
// bodies eaten across a wave, so the salvage the mutator costs is about
// what it always was — but it is concentrated. Instead of a scattering of
// moderately swollen units there are half as many, each carrying twice the
// pool, which is a different fight rather than a harder one: fewer things
// to find, and each one a genuine problem when you do.
//
// THE PAYOUT IS THE POINT. A devoured unit is removed without ever being
// killed, so it pays no drop at all (killsByKind is the whole ledger — see
// dropsForKills), and the hungry unit that ate it still drops exactly what
// its own kind drops. Twenty meals therefore cost the player twenty bodies'
// worth of salvage and hand back one body's worth, on top of a unit
// carrying forty-one times the health it spawned with. The bargain is meant
// to sting: it is what a rolled rule should feel like, and the salvage it
// eats is exactly why the map it is rolled on pays as well as it does.

/** share of spawns that walk in hungry — one in twenty */
export const HUNGRY_CHANCE = 0.05;

/** seconds between feeding attempts — one meal a second, at most */
export const HUNGRY_PERIOD = 1;

/** meals one hungry unit will ever take */
export const HUNGRY_MAX_MEALS = 20;

/**
 * What a meal is worth: DOUBLE the prey's full health, added to the hungry
 * unit's current AND maximum pool.
 *
 * Its MAX health, not what was left of it — a meal is worth the body, not
 * the state a stray shell left it in. Anything else would make a hungry
 * unit worth less the harder the player was already fighting, which reads
 * as the mechanic quietly switching itself off under pressure.
 *
 * NOTHING ELSE CROSSES OVER. Not the shield pool, not a force field, not a
 * repair or shield aura, not burning or wet, not armour, not speed — a
 * dagger that eats a quasar does not come out mending its neighbours. Only
 * the number moves.
 */
export const HUNGRY_HP_PER_MEAL = 2;

/**
 * How much bigger a meal draws the unit — art only, the hitbox never moves
 * (see the note in Sim.feedHungry).
 *
 * FIVE PER CENT IS PER MEAL, so the ceiling is whatever HUNGRY_MAX_MEALS
 * is: at twenty meals a fully fed unit is drawn at DOUBLE its sprite size.
 * That is deliberate — the swell is the only warning the player gets of
 * how much health is walking at them, and a unit carrying forty-one times
 * its spawn pool should not look like one carrying two.
 */
export const HUNGRY_GROWTH = 0.05;

/** how far a hungry unit can reach for a meal, in px (four tiles) */
export const HUNGRY_REACH = 80;

/** the hungry tint, multiplied into whatever the unit was already drawn in
 *  — the only way to spot one before it has taken its first bite */
export const HUNGRY_HUE: readonly [number, number, number] = [1, 0.55, 0.86];

// ---------- ARMORED -----------------------------------------------------
//
// EVERY TIER 1-3 BODY GAINS ARMORED_ARMOR FLAT ARMOUR. The heavies take
// none: a fortress and a zenith already carry the plating that matters,
// and doubling down on them would only make the rule "the same fight, but
// longer". What it hardens is the SWARM — the bodies the script sends by
// the thousand and the player kills with the cheap, fast, small-calibre
// half of the roster.
//
// IT USED TO BE A COLUMN OF THE LADDER (RungKnobs.lowTierArmorBonus): +2 a
// tier from the sixth tier up, landing +10 at the top. That was one dial
// too many in a place that already has one. Enemy level is the ladder's
// difficulty and it is arithmetic on the tier index; a second curve that
// only bit at the top half, only against three unit tiers, and only
// against small guns, was a mutator wearing a ladder's clothes — so it is
// a mutator now, rolled like everything else, and the ladder is the level
// curve and the mutation pair and nothing else.
//
// TEN IS THE OLD TOP-TIER VALUE, kept whole rather than re-derived. Armour
// is a flat shave floored at a tenth of the raw hit (Sim.applyArmor), so
// the rule is REGRESSIVE BY CALIBRE on purpose: +10 is nothing to a
// lancer's 140 and 1.55x effective health against a salvo's 28, but it
// floors a duo's 9 and a scatter's 3 outright — those guns land a tenth of
// what they print and no more. That asymmetry IS the mutator. It does not
// say "the swarm is tougher", it says "the cheap guns stop counting", and
// the answer to it is calibre: bigger emplacements, and an anti-air line
// that is not built out of pellets.
//
// IT IS PRICED AS HEAVY RATHER THAN BRUTAL because that answer exists and
// is affordable. The board that already holds the run holds it under this
// rule too, more slowly; the board built entirely out of duo walls and
// scatters does not, and has to be rebuilt. Rolled early, before the tree
// has anything with weight behind it, it is the harshest 4 in the catalog
// — which is the honest reading of a rule whose whole content is "your
// opening roster is a tenth as good".

/** flat armour added to every unit of tier 3 or below under Armored
 *  Swarms — applied once at spawn (Sim.spawnUnit), so every armour read
 *  downstream, the lancer's x4 included, already sees it */
export const ARMORED_ARMOR = 10;

/** the top unit tier the plating reaches; T4 and T5 never take it */
export const ARMORED_MAX_TIER = 3;

// ---------- SPEEDY ------------------------------------------------------
//
// THE SWARM ARRIVES TWICE AS FAST AND CANNOT BE SLOWED. Two halves of one
// rule, and they are one mutator rather than two because either alone has
// an answer: doubled speed is answered by a liquid turret, and slow
// immunity is answered by simply not building one. Together they say the
// thing the mutator is for — the time a player buys between the drop zone
// and the base is gone, and no amount of water buys it back.
//
// IT ADDS NO HEALTH, WHICH IS WHY IT COSTS WHAT IT DOES. Every other dial
// in the game makes bodies harder to kill; this one shortens the window
// they can be killed IN. A turret's damage per second is unchanged and its
// damage per WAVE is halved, so the mutator is worth roughly a doubling of
// the swarm's health to every emplacement on the board — while the audit
// arithmetic, which counts bodies and health, sees nothing at all. That is
// the honest reading of it, and it is priced as the dearest thing in the
// catalog on the strength of it.
//
// THE IMMUNITY IS TO THE SLOW, NOT TO THE STATUS. A soaked unit is still
// soaked: it still shows wet, still puts out a fire it is carrying, still
// takes whatever the ammunition does. It simply does not lose a step for
// it (see Sim.applyWet). Cancelling the status outright would have quietly
// deleted the fire-dousing rule as well, which is not what "immune to
// slowness" says and not what the card promises.

/** the drive-speed multiplier every unit walks in with under Speedy —
 *  applied once at spawn (Sim.spawnUnit), never per tick */
export const SPEEDY_SPEED = 2;

// ---------- OVERSHIELDS -------------------------------------------------
//
// EVERY FORCE FIELD IS FIVE TIMES THE POOL IT WAS — the unit bubbles a
// quasar walks in with, and the shield tower domes if Shield Towers is rolled
// alongside. Pool, cap and regen all carry the factor, so a scaled field
// breaks later, refills proportionally faster, and is dark for exactly the
// same `cooldown` seconds when it pops.
//
// IT USED TO BE A COLUMN OF THE LADDER (RungKnobs.shieldScale): 1.00 at the
// bottom compounding to 5.00 at the top, on the reasoning that a shield is
// measured in SECONDS OF ABSORBED TOWER FIRE and so has to track the
// player's firepower rather than the health curve. That reasoning was
// sound and it is exactly why this is a mutator rather than a deleted
// feature — but as a per-tier column it was a second difficulty curve
// nobody could see, bending one unit kind's bubble by an amount no screen
// ever printed. As a rule it is legible: it is named, it is on the card
// before Deploy, and it is either in force or it is not.
//
// FIVE IS THE OLD TOP-TIER VALUE, kept whole rather than re-derived.
//
// WHAT IT COSTS THE PLAYER IS TIME, NOT BODIES. A shield adds no health to
// the audit arithmetic and no bodies to the script; it delays the damage a
// board was already going to do, which is the same audit-invisible
// currency Speedy and Volatile tax. Priced at 3 because the swarm's force
// fields are carried by one kind — a quasar's bubble shelters what stands
// near it — so a board that can break one is inconvenienced rather than
// beaten. Rolled beside Shield Towers it is worth considerably more than
// three, and that is the catalog working as intended: rules that compound
// are what a big budget is FOR.

/** the multiplier every shield pool, cap and regen carries under
 *  Overshields — read once per run (Sim.reset), never per tick */
export const OVERSHIELD_SCALE = 5;

// ---------- VOLATILE ----------------------------------------------------
//
// EVERY ENEMY DETONATES WHEN IT DIES, AND THE BLAST DAMAGES TOWERS. This
// is the rule that turns tower health (towerMaxHp in constants.ts) from a
// dead field into a mechanic: nothing else in the game hurts a tower.
//
// IT TAXES POINT-BLANK PLAY SPECIFICALLY. A blast reaches under two cells,
// so only the emplacements built against the lane — scorch, fuse, arc, a
// duo wall on the choke — ever feel it, and they feel it in proportion to
// how many bodies die at their feet. A long-range board is untouched. That
// asymmetry is the design: the mutator does not say "your towers take
// damage", it says "the kill zone cannot also be the front row", which is
// a layout problem rather than a stat problem.
//
// A DOWNED TOWER IS SECONDS, NOT SALVAGE. The tower stands back up at full
// health after TOWER_DOWN_TIME, so what a swarm of detonating daggers
// costs the player is windows of silence in the kill zone — the same
// currency Speedy taxes, invisible to the audit arithmetic in exactly the
// same way, and priced lighter because a well-spread board barely pays it.
//
// THE DAMAGE SCALES WITH THE BODY'S TIER, NOT ITS LEVEL. Tier is the
// currency ladder (UNIT_STATS.tier, 1-5): a dagger's pop is a scratch and
// a fortress's is a real dent, at every difficulty alike. Scaling with
// level would make the rule unpayable at Level 10 for the same reason
// armour is never level-scaled — tower health does not climb the ladder,
// so neither may the thing that spends it.

/** blast reach from the dead body's centre, in px (1.75 cells of 20) —
 *  plus the body's own hitbox radius, so a fortress's boom is wider than
 *  a flare's. A literal rather than CELL because this file deliberately
 *  imports nothing */
export const VOLATILE_RADIUS = 35;

/** blast damage to each tower in reach, by the dead unit's tier (index 0
 *  unused). Tier 4-5 bodies are bosses and boss-adjacent — their deaths
 *  are the run's punctuation marks and should feel like it */
export const VOLATILE_DMG: readonly number[] = [0, 12, 30, 70, 150, 300];

// ---------- SHIELD TOWERS ----------------------------------------------
//
// SHIELD TOWERS RISE MID-RUN AND SHELTER THE SWARM UNTIL THEY FALL. Every
// so often a 3x3 shield tower emerges somewhere on the map and stands a RED
// force dome over the ground around it: any of the player's projectiles
// crossing the dome is absorbed into its shield pool, so the enemies
// walking under it are safe from projectile fire until the pool is broken
// — and the dome REFORMS WHOLE, SHIELD_TOWER_SHIELD_DELAY after it breaks,
// no matter what is being fired at it meanwhile. Only with the
// dome down can the shield tower's body be hurt, and a destroyed shield tower is GONE
// FOR GOOD; another rises elsewhere on the timer. Instant weapons —
// lancer, arc, fuse, foreshadow, meltdown's held beam — are not absorbed,
// exactly as unit force fields never absorb them: aimed at the shield tower
// they damage shield first, then body, which quietly makes the beam
// roster the shield tower-breaking roster.
//
// IT RISES ON TURRET GROUND, AND THAT IS THE WHOLE COST. A shield tower only
// ever lands on BUILDABLE ROCK — the same highground a turret needs, and
// never on the lanes — so it takes no pathing decision away from the
// swarm and every emplacement away from the player. The dome still hangs
// over the road beside it, which is where the sheltering happens; what
// the footprint costs is somewhere to shoot from.
//
// AND A SHIELD TOWER THAT LANDS OVER TOWERS ENTOMBS THEM: a buried turret is
// disabled, not destroyed, untouchable, and stands back up the moment the
// shield tower dies. "My scorch is hostage under that dome" is an objective,
// not a loss; nothing the player owns is ever taken permanently.
//
// TURRETS CHEW SHIELD TOWERS ONLY WHEN IDLE — a turret with nothing else in
// range spends its reload on one, so clearing a shield tower costs time between
// waves and never mid-wave DPS. The player can TAP a shield tower (or any
// enemy) to focus it, forcing every turret in range onto it: spending
// mid-wave DPS on the dome becomes a choice with a cost, which is the
// whole game of the rule.
//
// BOTH POOLS ARE SET BY THE WAVE THE SHIELD TOWER RISES ON and then ride
// the run's shield multiplier — see THE WAVE CURVE below. They used to
// ride the TIER's shield scale, so a shield tower grew with the ladder
// and not with the run; a rule whose whole cost is the player's damage
// arriving later has to grow the way the player's damage does, which is
// per wave. Like every rule here it is invisible to the audit arithmetic:
// it adds no bodies and no health, it just makes the player's damage
// arrive later.
//
// px literals below assume CELL = 20; this file deliberately imports
// nothing (see VOLATILE_RADIUS).

/** the footprint's edge, in cells — always square */
export const SHIELD_TOWER_SIZE = 3;
/** the hittable body, from the shield tower's centre (1.4 cells) */
export const SHIELD_TOWER_BODY_R = 28;
/** the dome the shield pass draws and the absorb sweep tests (8 cells) */
export const SHIELD_TOWER_DOME_R = 160;
/**
 * Body pool AT WAVE ONE, before the wave curve and the run's multiplier.
 *
 * IT IS FOUR TIMES THE DOME'S, and that ratio is the rule's whole pacing.
 * The dome is the part that comes back: every hit — on either pool —
 * opens a SHIELD_TOWER_SHIELD_DELAY window and no more: a board pouring
 * fire into a shield tower has exactly that long on the body before the
 * whole dome is back, whether or not it ever stopped shooting. A body
 * that dies inside one window never gives that trade a chance to happen:
 * the dome pops, a couple of volleys finish the structure, and
 * SHIELD_TOWER_SHIELD_DELAY below never gets to matter. A long body is
 * what turns the shield tower into an objective you have to COMMIT to —
 * several windows deep, with a whole dome to break at the start of each.
 */
export const SHIELD_TOWER_HP = 12000;
/** dome pool at wave one, before the wave curve and the run's multiplier */
export const SHIELD_TOWER_SHIELD = 3000;
/**
 * SECONDS FROM THE DOME BREAKING TO THE DOME RETURNING — WHOLE, not by
 * degrees, and NOT INTERRUPTIBLE.
 *
 * It used to be a regen DELAY in front of a trickle (90 shield a second,
 * so a broken dome took half a minute to mean anything), and a trickle is
 * the wrong shape for this: a dome at 12% is not a weaker obstacle, it is
 * one more volley, so every second of that climb played exactly like no
 * dome at all. Reforming whole makes the rule binary the way the player
 * experiences it — the dome is either up and eating your shots or it is
 * not.
 *
 * THE CLOCK STARTS WHEN THE DOME BREAKS AND NOTHING RESTARTS IT. Hits used
 * to, and that quietly turned the rule inside out: a board with enough
 * turrets pointed at a shield tower never let four idle seconds happen, so
 * the dome it broke once simply never came back and the whole reform
 * mechanic only existed for players who were already winning. Now the
 * regen is a promise the shield tower keeps regardless — commit fire and
 * you get exactly this long to spend on the body before you are paying
 * for the dome a second time, which is the trade the rule is for.
 *
 * BREAKING IT IS ALSO THE ONLY THING THAT STARTS IT. There is no other
 * shield regeneration in this rule at all: a dome chipped to 40% and left
 * alone stays at 40% forever, because a dome's only job is to be up or
 * down and a partial one is already down as far as the next volley cares.
 * That is one clock, one trigger and one outcome — the whole behaviour of
 * a dome fits in a sentence, which is what a player has to be able to
 * predict mid-wave.
 */
export const SHIELD_TOWER_SHIELD_DELAY = 10;
/**
 * Seconds between one shield tower rising and the next trying to. There is no
 * opening grace: the first attempt lands on the run's first tick, so a
 * board is choosing where to build around a shield tower from the start rather
 * than laying out a defence and having one dropped into it later.
 */
export const SHIELD_TOWER_SPAWN_PERIOD = 30;
/**
 * Shield Towers standing at once, at most — the timer idles at the cap.
 *
 * TWENTY, WHICH IS A LANDSCAPE RATHER THAN AN EVENT. At three the rule
 * was a handful of objectives to clear; at twenty, and only ever on
 * BUILDABLE ROCK (see the spot roller in sim.ts), the shieldTowers are
 * competing with the player for the same real estate the turrets want.
 * The cost stops being "go and break that" and becomes "there is nowhere
 * left to stand", which is a far better fit for a rule that never touches
 * the swarm's health.
 */
export const SHIELD_TOWER_MAX_ALIVE = 20;

// ---------- THE WAVE CURVE ---------------------------------------------
//
// BOTH POOLS ARE SET BY THE WAVE THE SHIELD TOWER RISES ON, AND THEY
// COMPOUND. A flat 15,000 was an obstacle for about twenty waves and then
// scenery: a late board focuses several thousand damage a second onto one
// point, so a fixed pool that took a minute to chew at wave five was gone
// inside five seconds at wave forty, dome and body together, before the
// four-second reform clock could ever matter. The rule needs to cost the
// same DECISION at every point in the run, and the only thing that grows
// underneath it is the player's damage — so the pools grow the way that
// does, by a percentage a wave rather than by a step.
//
// TEN PER CENT A WAVE, WHICH IS A HUNDREDFOLD ACROSS A FIFTY-WAVE RUN.
// The curve is anchored at 1.00 on wave one, so nothing about the opening
// changes; by wave twenty a shield tower is worth six of the old ones,
// by thirty-five twenty-five, and the last shield towers of a run are
// genuinely something a board has to commit to. The alternative — a
// bigger flat number — makes the early game unplayable to fix the late
// one, which is the trade a compounding curve exists to avoid.
//
// IT IS FIXED AT SPAWN, NEVER RE-READ. A shield tower carries the wave it
// rose on for the rest of the run, which is what makes clearing them
// promptly worth anything: the tower you leave standing through ten waves
// stays the cheap one it was born as, and the one that replaces it does
// not.

/**
 * What each wave multiplies the previous wave's pools by.
 *
 * Compounding, not linear, because what it is racing is compounding: a
 * board's damage per second climbs by upgrades and by better bands, both
 * of which multiply. A linear curve loses that race by construction —
 * it is only ever a question of which wave it starts losing on.
 */
export const SHIELD_TOWER_WAVE_GROWTH = 1.1;

/**
 * The multiplier on both pools for a shield tower rising on `wave`. 1.00
 * on wave one, ~2.4 by ten, ~6.1 by twenty, ~25 by thirty-five, ~107 by
 * fifty. The run's shield multiplier (Overshields, or 1) rides on top.
 */
export const shieldTowerWaveScale = (wave: number): number =>
  Math.pow(SHIELD_TOWER_WAVE_GROWTH, Math.max(0, wave - 1));

// ---------- THE MEGA SHIELD TOWER --------------------------------------
//
// PAST WAVE 35 THE SHIELD TOWERS STOP BEING A CHORE AND BECOME A WALL. Same
// rule, same regen, five times the pools and a dome four times the area —
// sixteen tiles across, which is wider than most turrets can reach from
// one emplacement and therefore a thing a whole SECTION of the board has
// to be pointed at rather than whatever happened to be idle.
//
// IT IS A LATE-RUN ANSWER TO A LATE-RUN BOARD, AND IT IS ABOUT REACH NOW.
// The mega shield tower used to multiply both pools by five as well; the
// wave curve above already passes five times somewhere around wave
// eighteen and reaches twenty-five by thirty-five, so a second multiplier
// on top only put a cliff in the middle of a curve that was supposed to
// be smooth. What wave 35 buys is the DOME — sixteen tiles across, wider
// than most turrets reach from one emplacement — and the pools behind it
// are simply what the wave says they are.

/** the wave from which every new shield tower rises as a mega shield tower */
export const SHIELD_TOWER_MEGA_WAVE = 35;
/** its dome, in px (16 cells) — four times the ordinary dome's area */
export const SHIELD_TOWER_MEGA_DOME_R = 320;
/** the dome's colour — RED, deliberately not the amber of friendly
 *  shields: amber means "the swarm is protected by one of its own", red
 *  means "the RULE is protecting them", and the two must never read alike */
export const SHIELD_TOWER_COL: readonly [number, number, number] = [1.0, 0.36, 0.36];
