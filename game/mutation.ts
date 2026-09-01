/**
 * MUTATORS — the rules a run is played UNDER, rolled for it rather than
 * chosen by anyone.
 *
 * THIS IS THE STARCRAFT II MODEL, and every decision below follows from
 * it. Each mutator carries a POINT COST that says how much harder it makes
 * the run; a difficulty carries a BUDGET; and picking a difficulty rolls
 * three or four mutators that fit inside that budget (rollMutations). The
 * player never picks a mutator, never switches one off, and never sees the
 * roll coming — that is the whole appeal of the mode, and it is why this
 * file has no toggle in it any more.
 *
 * WHY IT STOPPED BEING A TECH-TREE LINE. Mutation used to be the tree's
 * left column: a rank per boss felled, and a switch per rank the player
 * flipped on if they fancied a harder game. Nobody flips those switches —
 * an optional handicap with no reward attached is one nobody takes, and it
 * had to be BALANCED as though everyone did. So it became the opposite
 * thing: MANDATORY, on the maps that want it, and unchosen.
 *
 * WHERE IT IS MANDATORY: any world that sets `mutators` on its LevelSpec,
 * which is meant to be every world past the first (see the note there).
 * World 1 is the campaign as authored — it is where the fleet is still
 * being stood up, and a roll on top of that is not a challenge, it is a
 * wall. By the time a player reaches the second front they are strong
 * enough that the fifty waves are a formality, and the roll is what makes
 * the map a fight again. This is ENDGAME RESOURCE FARMING with a roguelike
 * shape: the same script, a different set of rules every time you deploy.
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
export type MutationId = "hungry" | "speedy";

export interface MutationDef {
  /** stable key, in the run spec and in the sim's questions */
  id: MutationId;
  /** what it is called on the codex card and in the deploy panel */
  name: string;
  /** the rule, in one sentence, as the codex states it */
  blurb: string;
  /**
   * WHAT IT IS WORTH, in the budget a difficulty hands the roller. See
   * MUT_COST_MIN/MAX for the scale, and note that the cost is about how
   * much of the player's game it takes away, not about how much health it
   * adds: Speedy adds no health at all and is the dearest thing here.
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
 */
export const MUTATIONS: readonly MutationDef[] = [
  {
    id: "hungry",
    name: "Hungry",
    cost: 4,
    blurb:
      "One enemy in twenty spawns hungry. It eats a neighbour every second — up to twenty — taking double their health and swelling with every meal. What it eats drops nothing.",
  },
  {
    id: "speedy",
    name: "Speedy",
    cost: 5,
    blurb:
      "Every enemy moves twice as fast and cannot be slowed. Water, cryofluid and every other soaking still lands — it just no longer costs them a step.",
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

/** is this rule in force for the run? — the sim's one question */
export const hasMutation = (
  active: readonly MutationId[] | undefined,
  id: MutationId,
): boolean => !!active && active.includes(id);

/** what a set of mutators is worth, for the panel that prints the roll */
export const mutationCost = (active: readonly MutationId[]): number =>
  active.reduce((sum, id) => sum + (mutationById(id)?.cost ?? 0), 0);

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

/** how many rules a run is played under — never fewer, never more */
export const MUT_PICK_MIN = 3;
export const MUT_PICK_MAX = 4;

/**
 * THE BUDGET A DIFFICULTY HANDS THE ROLLER, as points.
 *
 * It is arithmetic on the rung index for the same reason RUNGS is (see
 * ladder.ts): a ladder that extends must not need this table re-authored.
 * The bottom rung affords three light rules; the top affords four heavy
 * ones, or three brutal ones and change.
 *
 *   rung    1    2    3    4    5    6    7    8    9   10
 *   points  6    8   10   11   13   15   17   19   20   22
 *
 * THE FLOOR IS MUT_PICK_MIN x MUT_COST_MIN and that is not a coincidence:
 * the bottom rung must be able to pay for a full roll of the lightest
 * rules there are, or the lowest difficulty would quietly be the one with
 * the FEWEST rules, which is a mercy nobody asked for and nobody would
 * understand.
 *
 * IT ONLY HOLDS ONCE THE CATALOG HAS LIGHT RULES IN IT. Today's two
 * entries cost 4 and 5, so the bottom rungs genuinely cannot afford three
 * of anything and roll what they can (see rollMutations). That is the
 * catalog being short, not the budget being wrong — the fix is cheap
 * mutators, and the arithmetic here is already waiting for them.
 */
export const MUT_BUDGET_BASE = 6;
export const MUT_BUDGET_PER_RUNG = 1.8;

/** the points a rung (0-based, as the ladder counts them) may spend */
export const mutationBudget = (tier: number): number =>
  Math.round(MUT_BUDGET_BASE + MUT_BUDGET_PER_RUNG * Math.max(0, tier));

// the floor above, as an invariant rather than a paragraph: the bottom
// rung must be able to pay for a full roll of the lightest rules the scale
// allows, or the easiest difficulty would be the one with the fewest rules
if (MUT_BUDGET_BASE < MUT_PICK_MIN * MUT_COST_MIN)
  throw new Error(
    `the bottom rung's ${MUT_BUDGET_BASE} points cannot pay for ${MUT_PICK_MIN} mutators`,
  );

/** how many shuffles the roller tries before keeping its best (see below) */
const ROLL_TRIES = 24;

/**
 * ROLL A RUN'S MUTATORS: three or four rules, together fitting the budget.
 *
 * THE COUNT IS PICKED FIRST AND THE BUDGET IS SPENT ON IT, rather than the
 * other way round. Filling a budget greedily until it ran out would make
 * every high difficulty a four-rule run and every low one a three-rule
 * run, which is a ramp the point costs already provide — what a player
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
 * than MUT_PICK_MIN, but only when the catalog cannot honestly do better:
 * a two-entry catalog at the bottom rung is one rule, because a second one
 * would be a rule the budget has not paid for.
 */
export function rollMutations(
  budget: number,
  rand: () => number = Math.random,
): MutationId[] {
  const span = MUT_PICK_MAX - MUT_PICK_MIN + 1;
  const want = Math.min(
    MUTATIONS.length,
    MUT_PICK_MIN + Math.floor(rand() * span),
  );
  let best: MutationDef[] = [];
  let bestSpend = -1;
  for (let t = 0; t < ROLL_TRIES; t++) {
    const take: MutationDef[] = [];
    let spent = 0;
    for (const m of shuffled(MUTATIONS, rand)) {
      if (take.length >= want) break;
      if (spent + m.cost > budget) continue;
      take.push(m);
      spent += m.cost;
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

// ---------- SPEEDY ------------------------------------------------------
//
// THE SWARM ARRIVES TWICE AS FAST AND CANNOT BE SLOWED. Two halves of one
// rule, and they are one mutator rather than two because either alone has
// an answer: doubled speed is answered by a liquid turret, and slow
// immunity is answered by simply not building one. Together they say the
// thing the mutator is for — the time a player buys between the drop zone
// and the core is gone, and no amount of water buys it back.
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
