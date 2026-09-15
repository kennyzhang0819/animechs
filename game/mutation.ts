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
 * both of them dials on the rung: see RungKnobs in ladder.ts), and the four
 * named difficulties carry zero of each.
 *
 * THE ROLL USED TO BE A PER-WORLD SWITCH (`LevelSpec.mutators`) and that
 * was one gate too many. A map either mutated or it did not, and the
 * difficulty only decided how hard — so the first world could never be
 * made harder and every world after it could never be played straight.
 * Hanging the roll on the tier instead says the same thing with one
 * number: Incursion through Nemesis are the campaign as authored, at a
 * size, which is where the fleet is still being stood up and a roll on top
 * of that is a wall rather than a challenge. Every step above Nemesis
 * is the same full script under rules nobody chose, which is ENDGAME RESOURCE FARMING with a roguelike shape.
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
 * back with. A rule that wants to change the script is an edit to the
 * map's own script, not a mutator.
 */

/** every mutator that exists, by id. The id is what a run spec carries
 *  (LevelSpec.mutation) and what the sim asks about — never the name, and
 *  never an index, so the catalog can be reordered freely */
export type MutationId =
  | "conquest"
  | "leadership"
  | "reconstruction"
  | "mechVirus"
  | "volatile"
  | "mitosis"
  | "overshields"
  | "shieldTowers"
  | "hungry"
  | "armored"
  | "speedy"
  | "hydrophobic"
  | "amphibious";

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
 * THE CATALOG, HARDEST FIRST — which is also codex order, so the list a
 * player reads opens on the map-bound SPECIAL rules and then falls from
 * the ruinous to the survivable.
 *
 * THESE COSTS ARE MEASURED, NOT FELT. Every number below was set from the
 * same experiment: a fixed board on a fixed map, the same seeded run with
 * the rule ON and OFF, and the answer is HOW MUCH SHORTER THE RUN GETS.
 * That is what a point is — how much of the player's game a rule takes
 * away — and it is the only question this file can be wrong about
 * quietly. The board is 400 turrets of ten kinds packed at the core on
 * Confluence at the first mutating tier, three seeds a cell; a rule the
 * instrument cannot see there (one that reads the terrain, one that waits
 * for the last waves) was measured somewhere it can, and the note on that
 * rule says where.
 *
 *   rule             life lost   what the number is
 *   Hungry Mechs        -26%     ...and +32%, i.e. a GIFT, before the
 *                                damage half of a meal was put back
 *   Speedy              -16%
 *   Overshields         -12%
 *   Reconstruction      -10%
 *   Mitosis              -7%
 *   Mech Virus           -7%     -10% on a thin line, which is its board
 *   Leadership           -5%     on a run that reaches the tier fives at
 *                                all; nil before wave 36, where they start
 *   Armored Swarms       -4%     -9% against small guns, which it is for
 *   Conquest             -2%     the least-trusted number here: see below
 *   Volatile             -2%
 *   Amphibious           -2%     -9% on Shoals, and 0.7 crossings a body
 *                                averaged over the nine maps
 *   Hydrophobic          -1%     -20% on Shoals; it taxes 6% of the
 *                                buildable ground on the driest map and
 *                                66% on the wettest
 *   Shield Towers        -1%
 *
 * ONE RULE SPENDS INTO THE BRUTAL BAND: Hungry Mechs, at the scale's
 * ceiling (MUT_COST_MAX), because a wave that eats itself into one body
 * carrying forty times the health and twenty times the bite is not a
 * harder wave, it is a different fight.
 *
 * CONQUEST IS THE ONE NUMBER TO DISTRUST, and it is priced with that said
 * out loud. The instrument's board is four hundred turrets in a blob that
 * is dying anyway, and what Conquest costs a player is the LINE — a thin
 * one, held for fifty waves, where every gun lost is a gun shooting back.
 * It measured -2% and was authored at six on nothing but a hunch; four is
 * the compromise, and the honest thing to do is measure it on a real
 * board rather than argue about it here.
 */
export const MUTATIONS: readonly MutationDef[] = [
  {
    id: "hungry",
    name: "Hungry Mechs",
    cost: 6,
    blurb:
      "A few mechs eat their neighbours, and every meal leaves one bigger and hitting harder.",
  },
  {
    id: "speedy",
    name: "Speedy",
    cost: 5,
    blurb: "Every enemy moves twice as fast, and nothing can slow them.",
  },
  {
    id: "reconstruction",
    name: "Reconstruction",
    cost: 5,
    blurb: "Every enemy stands back up once, whole, where it fell.",
  },
  {
    id: "conquest",
    name: "Conquest",
    cost: 4,
    blurb: "Every turret the swarm wrecks rises again on its side.",
  },
  {
    id: "mechVirus",
    name: "Mech Virus",
    cost: 4,
    blurb: "A few enemies carry a virus that eats a turret and jumps to the next.",
  },
  {
    id: "overshields",
    name: "Overshields",
    cost: 4,
    blurb:
      "Force fields are five times as strong.",
  },
  {
    id: "armored",
    name: "Armored Swarms",
    cost: 3,
    blurb:
      "Lower tier units gain massive armor boosts.",
  },
  {
    id: "hydrophobic",
    name: "Hydrophobic",
    cost: 3,
    blurb: "Turrets built near water attack slower.",
  },
  {
    id: "leadership",
    name: "Leadership",
    cost: 3,
    blurb: "Nothing standing near a tier five body can be hit for more than a scratch.",
  },
  {
    id: "mitosis",
    name: "Mitosis",
    cost: 3,
    blurb:
      "Every enemy breaks apart into tier one units when it dies.",
  },
  {
    id: "amphibious",
    name: "Amphibious",
    cost: 2,
    blurb: "Ground enemies that wade come out faster, tougher and healing.",
  },
  {
    id: "shieldTowers",
    name: "Shield Towers",
    cost: 2,
    blurb:
      "Shield towers rise periodically, obsorbing bullets until they are destroyed.",
  },
  {
    id: "volatile",
    name: "Volatile",
    cost: 2,
    blurb:
      "Enemies detonate when they die and damages nearby turrets.",
  },
];

/**
 * A CATALOG THAT BREAKS ITS OWN RULES IS A PROGRAMMING ERROR, and it is
 * caught the first time any build or page loads this module rather than on
 * the deploy that happens to roll the offending entry: the list is
 * authored by hand, so the list checks itself.
 */
for (const m of MUTATIONS) {
  if (!Number.isInteger(m.cost) || m.cost < MUT_COST_MIN || m.cost > MUT_COST_MAX)
    throw new Error(
      `mutator "${m.id}" costs ${m.cost}; the scale is ${MUT_COST_MIN}-${MUT_COST_MAX} whole points`,
    );
  if (MUTATIONS.filter((o) => o.id === m.id).length > 1)
    throw new Error(`two mutators share the id "${m.id}"`);
}

// ...AND IT IS AUTHORED HARDEST FIRST, which is codex order, so the check
// belongs here with the rest of them. This is not fussiness: the order is
// a comment above the list and nothing enforced it, so a rule added by one
// hand while another reordered the list lands wherever the merge put it —
// which is exactly how Mitosis came to sit above two rules dearer than it,
// silently, in a merge that reported itself clean.
for (let i = 1; i < MUTATIONS.length; i++) {
  const prev = MUTATIONS[i - 1];
  const here = MUTATIONS[i];
  if (here.cost > prev.cost)
    throw new Error(
      `the catalog is authored hardest first, but "${here.id}" (${here.cost}) ` +
        `sits below "${prev.id}" (${prev.cost})`,
    );
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
// MUTATIONS is authored hardest-first and sortByCatalog reads that order,
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
 * EVERY RULE A RUN IS PLAYED UNDER: what the deploy ROLLED for it
 * (LevelSpec.mutation), as one clean list in catalog order. No level
 * carries rules of its own any more — all maps are equal — so the roll
 * is the whole answer.
 *
 * IT IS THE ONLY WAY TO ASK. Every entry point that can start a run — the
 * campaign deploy, the sandbox, the editor's preview, `__ladder.spec` —
 * goes through here or through the sim.
 */
export const mutationsInForce = (rolled: readonly MutationId[] | undefined): MutationId[] =>
  cleanMutations([...(rolled ?? [])]);

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

/** catalog order, so a roll always reads its heaviest rule first */
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
 * surprise — a player stepping one difficulty up is entitled to see
 * what they are taking on, and "three or four, we shall see" is not
 * something a ladder can be tuned against.
 *
 * ZERO IS A LEGAL SETTING and it is what the named difficulties carry: a tier with no
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
 * The named difficulties spend nothing at all; the first mutating tier
 * affords three light rules, and
 * the top affords four heavy ones, or three brutal ones and change.
 *
 *   tier    1    2    3    4    5    6    7    8    9   10
 *   points  0    0    0    0    8   10   11   13   15   17
 *
 * THE FIRST FOUR TIERS SPEND NOTHING. Incursion through Nemesis are
 * the same script at a quarter, a half, three quarters and the whole of
 * its count (ladder.ts, COUNT_SCALE) — a size ramp, not a rules ramp. The
 * roll starts on the tier above Nemesis (MUT_FIRST_TIER) and every
 * tier from there is Nemesis's full swarm under more rules.
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
 * THE FIRST FOUR TIERS ARE ZERO AND THAT IS NOT THE ARITHMETIC — it is the
 * rule that the named difficulties are the campaign as authored, at a
 * size, applied here so that every reader of the curve gets it rather
 * than each one having to remember. The arithmetic starts at
 * MUT_FIRST_TIER and counts from one there, which is what the table
 * prints.
 */
export const mutationBudget = (tier: number): number => {
  const step = mutationStep(tier);
  return step <= 0 ? 0 : Math.round(MUT_BUDGET_BASE + MUT_BUDGET_PER_RUNG * step);
};

/**
 * THE FIRST TIER THAT ROLLS, 0-based: index 4, the fifth difficulty, the
 * one above Nemesis. Everything below it is a named difficulty that
 * sends the authored script at a size and nothing else.
 */
export const MUT_FIRST_TIER = 4;

/** how many tiers into the mutating band a tier is — 1 on the first one,
 *  0 or less on every named difficulty */
export const mutationStep = (tier: number): number => tier - MUT_FIRST_TIER + 1;

/**
 * HOW MANY RULES A TIER ROLLS, as authored — the other half of the pair,
 * and the ladder's real difficulty curve.
 *
 * Three on the first mutating tier, one more every MUT_PICKS_EVERY tiers,
 * capped at MUT_COUNT_MAX:
 *
 *   tier    1    2    3    4    5    6    7    8    9   10
 *   rules   0    0    0    0    3    3    3    3    4    4
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

export const mutationPicks = (tier: number): number => {
  const step = mutationStep(tier);
  return step <= 0
    ? 0
    : Math.min(MUT_COUNT_MAX, MUT_PICKS_BASE + Math.floor((step - 1) / MUT_PICKS_EVERY));
};

// The floor, as an invariant rather than a paragraph: the FIRST mutating
// tier must be able to pay for its own full roll at the lightest cost the
// scale allows, or the easiest mutating difficulty would quietly be the
// one with the fewest rules. Checking the first mutating tier checks all
// of them — the budget climbs by MUT_BUDGET_PER_RUNG a tier and the count
// by a quarter of a rule, so the purse only ever gets roomier per slot.
if (mutationBudget(MUT_FIRST_TIER) < mutationPicks(MUT_FIRST_TIER) * MUT_COST_MIN)
  throw new Error(
    `the first mutating tier's ${mutationBudget(MUT_FIRST_TIER)} points cannot pay for ${mutationPicks(MUT_FIRST_TIER)} mutators`,
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
 * a named difficulty carries — returns nothing without touching the catalog at all.
 */
export function rollMutations(
  budget: number,
  want: number,
  exclude: readonly MutationId[] = [],
  rand: () => number = Math.random,
): MutationId[] {
  // EVERY RULE IS IN EVERY DRAW ON EVERY MAP. The catalog used to hold
  // map-bound rules (Hydrophobic, Amphibious) that only a world naming
  // them could play; all maps are equal now, so a rule that reads the
  // terrain simply reads whatever terrain it lands on — Hydrophobic on a
  // dry map is a cheap slot, and that is the roll's business. `exclude`
  // stays for a caller that wants a rule out of one draw.
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
 * ironhide1 that eats a starhart3 does not come out mending its neighbours. Only
 * the number moves.
 */
export const HUNGRY_HP_PER_MEAL = 2;

/**
 * ...AND WHAT A MEAL ADDS TO ITS BITE, as a share of the weapon's own
 * damage per meal taken.
 *
 * THE RULE USED TO BE A GIFT AND THIS IS WHY. A meal moved HEALTH and
 * nothing else, so the rule spent the swarm's numbers to buy one body a
 * pool — and numbers are what a swarm hurts a line with. Twenty runts
 * walking into a board do twenty runts' worth of damage to it; one body
 * carrying all twenty pools does ONE ironhide1's. Measured on a fixed board
 * at a fixed seed, a run under Hungry Mechs lasted THIRTY PER CENT LONGER
 * than the same run without it: the mutator was eating the swarm's own
 * damage and handing the player the difference.
 *
 * So a meal now carries the eaten body's bite as well as its pool. At
 * HUNGRY_MAX_MEALS the eater hits for twenty-one times its own weapon,
 * which is roughly what the bodies it swallowed would have done between
 * them — the rule CONCENTRATES a wave's threat into one terrible body
 * instead of deleting it, which is what the card has always promised.
 *
 * IT IS A SHARE OF ITS OWN WEAPON, NOT OF WHAT IT ATE, for the reason the
 * health is not: an ironhide1 that eats a starhart3 does not come out firing a
 * starhart3's gun. It comes out firing a great many runts' worth of its
 * own.
 */
export const HUNGRY_DMG_PER_MEAL = 1;

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
// none: an ironhide3 and a stoop3 already carry the plating that matters,
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
// TEN IS THE OLD TOP-TIER VALUE, kept whole rather than re-derived. Armour is
// a flat shave floored at a tenth of the raw hit (Sim.applyArmor), so the
// rule is REGRESSIVE BY CALIBRE on purpose: +10 is nothing to a piercer's 140
// and 1.55x effective health against an autocannon's 28, but it floors a
// tacker's 9 and an airburst's 3 outright — those guns land a tenth of what
// they print and no more. That asymmetry IS the mutator. It does not say "the
// swarm is tougher", it says "the cheap guns stop counting", and the answer
// to it is calibre: bigger emplacements, and an anti-air line that is not
// built out of pellets.
//
// IT IS PRICED AS HEAVY RATHER THAN BRUTAL because that answer exists and
// is affordable. The board that already holds the run holds it under this
// rule too, more slowly; the board built entirely out of tacker walls and
// scatters does not, and has to be rebuilt. Rolled early, before the tree
// has anything with weight behind it, it is the harshest 4 in the catalog
// — which is the honest reading of a rule whose whole content is "your
// opening roster is a tenth as good".

/** flat armour added to every unit of tier 3 or below under Armored
 *  Swarms — applied once at spawn (Sim.spawnUnit), so every armour read
 *  downstream, the piercer's x4 included, already sees it */
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

// ---------- HYDROPHOBIC -------------------------------------------------
//
// MAELSTROM'S OWN RULE, and the first one in the catalog that reads the
// TERRAIN rather than the wave: a turret built near water fires at less
// than a third of its rate, so the shoreline — the ground that overlooks
// the crossings and the bay, the ground a naval front makes you want — is
// the ground that costs you most of your damage to hold.
//
// IT IS SPECIAL BECAUSE IT IS WORTH NOTHING ON A DRY MAP. Confluence
// has no water at all, so a roll of this there would be a slot spent
// changing not one shot, and a player reading their roll would learn
// nothing from it. Measured over the three maps as authored, counting
// every 3x3 turret footprint whose ground is entirely buildable rock:
//
//   Confluence  30,512 sites,      0 within reach of water   ( 0%)
//   Maelstrom   20,448 sites,  7,242 within reach            (35%)
//   Quagmire    11,462 sites,  8,143 within reach            (71%)
//
// Maelstrom's 35% is the number this was tuned to: a third of the board
// taxed is a real decision every time you place something, and the rest
// still dry is a board that can be held by someone who thinks about it.
// Quagmire's 71% is why the flag matters even between two wet maps — the
// same rule there is nearly a different rule, and if it ever goes on
// Quagmire it should be re-costed rather than reused.
//
// THE REACH AND THE RATE MOVE TOGETHER and were set as a pair. Widening
// the band taxes more of the board; deepening the cut makes each taxed
// square worth less. At 8 cells and half rate this covered 30% of
// Maelstrom at a cost a player could shrug off by building one turret
// deeper; 10 and 0.3 is the version that actually decides where a line
// goes.
//
// THE PENALTY IS FIXED WHEN THE TURRET IS PLACED and never re-read. The
// water does not move, so nothing would ever change it; a turret carries
// its own reload rate (Tower.fireRate) rather than the sim asking the
// terrain on every tick of every barrel.
//
// IT SLOWS THE RELOAD, NOT THE VOLLEY. A wet turret's shots still leave
// the barrel at the spacing its weapon has (Sim.fireTowers' burst timers);
// what stretches is how often a volley starts, which is what "attacks
// slower" means to a player watching one. A TRACTOR turret has no reload
// at all and so is untouched — it is not a damage piece, and taxing it
// would be taxing nothing.

// WHAT IT IS ACTUALLY WORTH NOW, AND WHY IT IS TWO POINTS. The rule was
// authored at five for QUAGMIRE, a map drawn so that no ground lane is
// dry: three fords on the trunk road alone, and a body that has waded
// every one of them arrives as something the board has not fought. That
// map is one of nine. Counted across all of them — the stacks a body has
// taken by the time it reaches the core, with no turrets on the map at
// all, which is the most generous reading the terrain can give:
//
//   Shoals 3.0   Quagmire 1.4   Estuary 0.5   Tundra 0.5   Riverlands 0.4
//   Crater 0.4   Greenwood 0.2  Confluence 0.1   Maelstrom 0.04
//
// Two maps deliver the rule and the other seven hand out under half a
// stack — a tenth of a body's health. On Confluence it costs the player
// 2% of a run; on Shoals, 9%. A rule that is a full slot on two maps and
// a free one on the rest is a LIGHT rule with a good day, not a heavy one.
//
// AND THE OBVIOUS REWORK DOES NOT WORK — measured, not guessed. If the
// swarm ROUTED through water (the flow field charging less for a wet
// cell, so a ford beats the dry way round) the rule would fire on every
// map that has any water at all, and it does: the average body's
// crossings roughly double, and Greenwood goes from 0.2 stacks to 1.2.
// The run gets EASIER anyway. A discount deep enough to pull a lane into
// the water is deep enough to buy a detour, and a detour is more seconds
// spent walking under the guns than the stacks are worth: +5.5% run life
// at a 0.45 discount, and 0% at 0.8, over three seeds on two maps. The
// swarm arrives tougher and later, and later wins. Anyone reaching for
// this again should reach for the STACK's own numbers instead.

/** how far from water the tax reaches, in cells — measured from any water
 *  floor, shallow or deep, to the nearest cell of the turret's footprint */
export const HYDROPHOBIC_RANGE = 10;

// WHAT IT TAXES, MAP BY MAP, as a share of the buildable ground: Shoals
// 66%, Quagmire 34%, Estuary 25%, Maelstrom 21%, Crater 13%, Greenwood
// 12%, Tundra 8%, Riverlands 8%, Confluence 6%. So the SAME rule is a
// wall on two maps and a rounding error on four, and it is priced at the
// middle of that: three points. It costs 20% of a run on Shoals and 1% on
// Confluence, which is the widest spread of any rule in the catalog and
// the reason it is not priced for its best day.

/** what a waterlogged turret's reload runs at — 70% off, so a volley it
 *  used to start every second now takes three and a third */
export const HYDROPHOBIC_RATE = 0.3;

// ---------- AMPHIBIOUS --------------------------------------------------
//
// QUAGMIRE'S OWN RULE. A walker that steps into water comes out of it
// BETTER: faster, tougher, harder to kill and healing as it goes — and it
// can do that five times over a route, so a body that has forded every
// crossing on the way in arrives as something the board has not fought
// before.
//
// IT IS THE MAP, TURNED AGAINST THE PLAYER. Quagmire's water is not
// scenery and it is not a wall — every ground lane on it is crossed by a
// ford, three on the trunk road alone, because the map was drawn so a
// walker never has a dry route. Under this rule that stops being
// decoration and becomes the swarm's upgrade path: the crossings the
// player is trying to hold are the exact squares that make the thing
// walking through them worse.
//
// EACH BONUS IS A SHARE OF THE UNIT'S OWN NUMBERS, not a flat amount, so
// one rule reads the same on a 150-hp weaver1 and a 22,000-hp weaver5: a
// stack is always "a fifth again of what you were", never "+30 hp", which
// would be everything to the first and nothing to the second. The one
// exception is ARMOUR, and it is a deliberate one — the weaver1 line's T1
// has armour 0, so a percentage of it is a percentage of nothing, and the
// rule would skip the very body it is most about. Armour is therefore a
// flat step on the same scale ARMORED_ARMOR uses.
//
// A STACK IS AN ENTRY, NOT A DURATION. It is taken the moment a unit
// crosses from dry ground into water and never again until it has left
// and come back, so the gain is paid for by ROUTE — how many crossings a
// body has walked through — rather than by loitering. A swarm that pools
// in a ford does not ratchet; a swarm that has come the long way in does.
//
// THE PERCENTAGES ARE OF WHAT IT SPAWNED WITH, read once per stack from
// the kind and the tier's level curve rather than from the unit's current
// pool. Off the CURRENT pool the stacks would compound, and worse, a
// hungry unit's meals would feed the wading bonus and the wading bonus
// would feed the next meal — two rules multiplying each other is not a
// number anyone can tune.
//
// WHAT IT DOES NOT TOUCH: the hitbox, the layer, the kind. A waded
// weaver1 is a fast fat weaver1, and it still cannot swim — deep water is
// impassable to it exactly as before, and the rule only ever fires on the
// shallow ground the map already lets it walk on.

/** how many times one body may take the bonus */
export const AMPHIBIOUS_MAX_STACKS = 5;

/** health added per stack, as a share of the health it spawned with — put
 *  on the CURRENT pool as well as the maximum, so wading heals */
export const AMPHIBIOUS_HP = 0.15;

/**
 * Drive speed added per stack, as a share of the speed it spawned with
 * (Speedy's doubling included — a share of what it actually walks at).
 *
 * FIVE STACKS IS +50%, short of Speedy's doubling on purpose. It was
 * +250% — a weaver1 that forded every crossing on Quagmire arrived at
 * three and a half times its pace — and that was a swarm no tier-1 board
 * could catch: the headless playtest lost the map on wave 4 with every
 * leak a weaver1, at half the authored counts. The rule keeps its teeth
 * in the health and the plating; the speed is what a kill zone can still
 * answer. It still has to be WALKED for, one crossing at a time, and only
 * the bodies that took the long way in arrive carrying it.
 */
export const AMPHIBIOUS_SPEED = 0.1;

/** armour added per stack, FLAT — see the note above on why this one is
 *  not a percentage. Five stacks is two and a half plates — it was ten,
 *  the whole of ARMORED_ARMOR, and a body wearing ten plates is a body a
 *  tacker hits for its floor, which on Quagmire was every weaver1 by wave
 *  four and every ironhide2 by wave twelve. The health is the rule's weight
 *  now; the plating is the edge that makes a lobber worth more than a
 *  tacker */
export const AMPHIBIOUS_ARMOR = 0.5;

/** healing per stack per second, as a share of the health it spawned with:
 *  at the cap a body mends itself in twenty seconds, which chip damage
 *  cannot outrun and a real kill zone does not notice */
export const AMPHIBIOUS_REGEN = 0.01;

/** how much bigger a waded body DRAWS per stack — art only, like the
 *  hungry swelling it sits alongside (HUNGRY_GROWTH). The sim's hitbox
 *  never moves; this is how a player picks the upgraded ones out of a lane */
export const AMPHIBIOUS_GROWTH = 0.04;

// ---------- OVERSHIELDS -------------------------------------------------
//
// EVERY FORCE FIELD IS FIVE TIMES THE POOL IT WAS — the unit bubbles a
// starhart3 walks in with, and the shield tower domes if Shield Towers is rolled
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
// fields are carried by one kind — a starhart3's bubble shelters what stands
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
// IT TAXES POINT-BLANK PLAY SPECIFICALLY. A blast reaches from a little over
// two cells (an ironhide1) to six (a tier-5 body), so the emplacements built
// against the lane — torch, cleaver, coil, a tacker wall on the choke —
// feel it hardest, and they feel it in proportion to how many bodies die at
// their feet and how heavy those bodies were. A long-range board is still
// untouched. That asymmetry is the design: the mutator does not say "your
// towers take damage", it says "the kill zone cannot also be the front row",
// which is a layout problem rather than a stat problem.
//
// THE REACH CLIMBS WITH THE TIER (VOLATILE_RADIUS) and that is what gives
// the rule its shape rather than just its strength. An ironhide1's pop only
// ever costs the turret it died on top of; an ironhide5's takes the whole
// second rank behind the choke with it, so spacing a line off the lane
// by one turret buys immunity from the chaff and none at all from the
// thing that was worth killing — which is the point, because one turret
// of clearance was a habit rather than a decision.
//
// A WRECKED TOWER IS GONE. What a swarm of detonating runts costs the
// player is turrets — the scrap to stand them back up, and the silence in
// the kill zone until they do — which is the same currency the coming
// enemy attacks will spend, and the reason this rule is priced as a
// preview of them rather than as a mutator of its own.
//
// THE DAMAGE SCALES WITH THE BODY'S TIER, NOT ITS LEVEL. Tier is the
// currency ladder (UNIT_STATS.tier, 1-5): an ironhide1's pop is a scratch and
// an ironhide3's is a real dent, at every difficulty alike. Scaling with
// level would make the rule unpayable at the top difficulty for the same reason
// armour is never level-scaled — tower health does not climb the ladder,
// so neither may the thing that spends it.

/**
 * BLAST REACH from the dead body's centre, in px, BY THE DEAD UNIT'S TIER
 * (index 0 unused) — plus the body's own hitbox radius on top, so a
 * ironhide3's boom is wider than a stoop1's even within a tier. Literals
 * rather than CELL because this file deliberately imports nothing.
 *
 *   tier     1      2      3      4      5
 *   cells    2.25   2.75   3.5    4.5    6
 *
 * THE REACH CLIMBS WITH THE TIER AND THE DAMAGE TABLE BELOW DOES NOT MOVE
 * FOR IT. The two tables are the rule's two axes: VOLATILE_DMG says how
 * hard each tower in reach is hit, this says how many towers are in
 * reach, and a heavy body is worse on both. A tier-5 dying inside the
 * kill zone is meant to be an EVENT — six cells is a whole emplacement,
 * not a front row — while an ironhide1's pop stays the firecracker it was.
 *
 * THE RING DRAWN FOR THE POP IS SIZED FROM THIS. Sim.volatileBlast hands
 * the reach to the shockwave effect, so what a player sees is exactly
 * what took the damage — change a row and the visual follows.
 */
export const VOLATILE_RADIUS: readonly number[] = [0, 45, 55, 70, 90, 120];

/** blast damage to each tower in reach, by the dead unit's tier (index 0
 *  unused). Tier 4-5 bodies are bosses and boss-adjacent — their deaths
 *  are the run's punctuation marks and should feel like it */
export const VOLATILE_DMG: readonly number[] = [0, 12, 30, 70, 150, 300];

// the two tables are read side by side with one tier index (Sim.volatileBlast),
// so they have to reach the same tier — a reach table that stopped short
// would give the heaviest deaths no blast at all, silently
if (VOLATILE_RADIUS.length !== VOLATILE_DMG.length)
  throw new Error(
    `Volatile's reach table has ${VOLATILE_RADIUS.length} rows and its damage table ${VOLATILE_DMG.length}`,
  );

// ---------- MITOSIS -----------------------------------------------------
//
// EVERY BODY THE PLAYER KILLS BREAKS INTO TIER-1 BODIES, more of them the
// heavier the thing that died. An ironhide2 leaves two runts behind, an ironhide5
// leaves twelve — so a kill stops being the end of a fight and becomes the
// start of a smaller one, and the board that could only just clear the
// wave now has to clear it twice.
//
// IT IS A RULE ABOUT THROUGHPUT, NOT ABOUT HEALTH. The brood is the
// cheapest thing in the game: an ironhide1 at whatever the level curve says,
// no armour, no shield, no ability. A turret that can kill things fast
// barely notices it. What it takes apart is the board built to kill a few
// EXPENSIVE things — the long-reload heavies, the single-target snipers,
// the piercer line whose whole answer to an ironhide3 is one shot that is
// worth it. Those turrets spend the same reload on an ironhide1, and the
// mutator hands them eleven more of them to spend it on.
//
// IT TERMINATES BECAUSE A BROOD BODY DOES NOT BROOD. That is a property
// of the BODY, carried on the unit itself (Sim.ubrood) and read once when
// it dies — not a zero in the table below. A brood that bred in its turn
// would be a chain reaction with no upper bound: one ironhide1, one ironhide1,
// forever, and a wave that can never be finished is not a harder wave.
//
// PUTTING THE GUARANTEE ON THE UNIT IS WHAT LETS THE TABLE BE A DIAL. It
// used to live in the arithmetic — tier 1 bred nothing, so everything the
// rule created was sterile by virtue of its tier — and that quietly made
// "does this terminate?" a question about a balance number, so the day
// someone gave T1 a brood the game would hang rather than play
// differently. With the flag, every row below is free to be tuned to
// whatever the fight wants, tier 1 included, and the rule stays exactly
// ONE generation deep however it is set.
//
// A BROOD BODY IS A REAL UNIT AND PAYS A REAL DROP. It is killed like
// anything else, so it lands in killsByKind and pays its kind's drop —
// scrap off that kind's health (see unitDrop in levels.ts). It also answers for its
// parent's WAVE (Sim.uwave): the wave is not cleared, and its XP not
// banked, until the brood is down too. That is deliberate: the game's
// standing rule is that no body is quietly worth more OR LESS than any
// other of its kind, and a mutator that minted invisible units would be
// the first exception to it.
// So the rule gives the player the smallest drop there is — in exchange
// for the one thing a tower defence cannot buy, which is time in the
// kill zone. That
// is the bargain, and it is why this sits in the LIGHT band next to
// Volatile rather than up with Hungry: it is noticed every wave and it
// decides no run on its own.
//
// A LEAK IS NOT A DEATH. A body that walks off the board was never killed
// (Sim.updateUnits removes it without going through killUnit), so it
// leaves no brood — the same line Volatile draws, and the same reason:
// the rule is about what happens where the player is fighting.
//
// THE BROOD KEEPS ITS PARENT'S LAYER. A flyer leaves flyers, a hull
// leaves hulls, a walker leaves walkers — the sim picks the T1 kinds that
// travel on the dead unit's movement layer (MITOSIS_KINDS in sim.ts).
// Anything else would drop runts into deep water and runts onto a lane
// they have no business on, and a brood that cannot walk where it landed
// is a brood the player never has to answer.

/**
 * HOW MANY TIER-1 BODIES A DEATH LEAVES, by the dead unit's tier (index 0
 * unused).
 *
 * The curve is roughly the tier's own weight rather than a flat number: a
 * T2 is worth a couple of runts and a T5 is worth a small wave, which is
 * about what those bodies cost to kill in the first place. Twelve at the
 * top is the number this was set to — enough that an ironhide5 dying inside the
 * kill zone visibly refills it, and few enough that a board with any
 * splash at all is not simply overrun by its own success.
 *
 * TIER 1 BREAKS INTO ONE, which is what makes the card's "every enemy"
 * literally true rather than nearly true. It is the cheapest row here and
 * the one the player meets most: a killed ironhide1 leaves an ironhide1, so
 * clearing the T1 stream costs twice the shots it used to and no more —
 * and it costs it ONCE, because the body it left is brood and brood does
 * not brood (see above). A player watching the swarm should never have to
 * work out which of the things dying in front of them the rule applies to.
 */
export const MITOSIS_BROOD: readonly number[] = [0, 1, 2, 4, 7, 12];

/**
 * How far from the body a brood member may land, in px (a little under two
 * cells of 20). Wide enough that twelve of them are not one stack, tight
 * enough that they are unmistakably what the dead thing left behind.
 */
export const MITOSIS_SPREAD = 36;

/**
 * Placement attempts per brood member before it is given up on. A body
 * that dies against rock, on a shoreline or in a crush of its own kin
 * leaves a smaller brood than the table promises, and that is the honest
 * outcome — the alternative is stacking units inside walls.
 */
export const MITOSIS_TRIES = 6;

// The table is authored by hand, so the table checks itself — the same
// bargain the catalog above makes. Termination is NOT what is checked
// here: that is Sim.ubrood's job and no row below can break it. What a bad
// row CAN do is quieter and worth catching anyway — a fractional or
// negative count is a spawn loop that runs a nonsense number of times, and
// a table that does not reach tier 5 is a rule that silently switches
// itself off on exactly the deaths it was written for.
if (MITOSIS_BROOD.length <= 5)
  throw new Error(
    `Mitosis's brood table stops at tier ${MITOSIS_BROOD.length - 1}; unit tiers run to 5`,
  );
for (let t = 1; t < MITOSIS_BROOD.length; t++)
  if (!Number.isInteger(MITOSIS_BROOD[t]) || MITOSIS_BROOD[t] < 0)
    throw new Error(`Mitosis has tier ${t} leaving ${MITOSIS_BROOD[t]} bodies — that is not a count`);

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
// piercer, coil, cleaver, railhead, furnace's held beam, tether's lock
// beam — are not absorbed,
// exactly as unit force fields never absorb them: aimed at the shield tower
// they damage shield first, then body, which quietly makes the beam
// roster the shield tower-breaking roster.
//
// IT RISES ON EMPTY TURRET GROUND, AND THAT IS THE WHOLE COST. A shield
// tower only ever lands on ground a TURRET COULD HAVE STOOD ON that is
// FREE — open floor, off the core, off the swarm's doors, and never on a
// square anything already stands on — so what it takes is one unbuilt
// emplacement and nothing else. The dome hangs over the road around it,
// which is where the sheltering happens; what the footprint costs is
// somewhere to shoot from.
//
// IT ASKS THE PLACEMENT RULE, IT DOES NOT RESTATE IT. The roller reads
// board.ts (groundClear, domesClear) — the same two predicates the build
// cursor is coloured by — so "somewhere a turret could go" has exactly
// one definition. It used to carry its own, and that is how this rule
// broke: it wanted BUILDABLE ROCK, which was right while turrets stood on
// the highground, and turrets stand on the FLOOR now. Every dome on every
// map was landing on a hill — competing with the player for ground the
// player had stopped wanting, at which point the rule's whole cost was
// zero. A rule priced on what it takes away must ask the board what there
// is to take.
//
// IT HOLDS NO GROUND AGAINST THE SWARM. The footprint is solid to a
// PLACEMENT and thin air to a body: the horde walks straight through its
// own building, exactly as it walks through a turret Conquest took off
// the player (Sim.conquerTower). A dome its own bodies will not shoot and
// cannot pass would be a wall a wave stands at forever, so raising one
// still changes no route and costs no re-solve.
//
// IT NEVER TOUCHES WHAT THE PLAYER BUILT. A roll that would land over a
// turret is thrown away and re-rolled, and a board with no free ground left
// simply raises NOTHING that period (Sim.trySpawnShieldTower) — the rule
// competes with the player for empty ground, it does not take ground back
// off them. The mutator used to ENTOMB a turret it landed on, disabling it
// until the shield tower died; that is gone, and with it the one way this
// rule could undo a decision the player had already paid for.
//
// TURRETS CHEW SHIELD TOWERS ONLY WHEN IDLE — a turret with nothing else in
// range spends its reload on one, so clearing a shield tower costs time
// between waves and never mid-wave DPS. That is the whole game of the rule:
// a dome comes down in the gaps, or it does not come down. A tap on one is
// only a question about it (Game.inspect) and never an order to the line.
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
 * BUILDABLE GROUND (see the spot roller in sim.ts), the shieldTowers are
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
 * board's damage per second climbs by modules and by better bands, both
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
export const SHIELD_TOWER_MEGA_WAVE = 6;
/** its dome, in px (16 cells) — four times the ordinary dome's area */
export const SHIELD_TOWER_MEGA_DOME_R = 320;
/** the dome's colour — RED, deliberately not the amber of friendly
 *  shields: amber means "the swarm is protected by one of its own", red
 *  means "the RULE is protecting them", and the two must never read alike */
export const SHIELD_TOWER_COL: readonly [number, number, number] = [1.0, 0.36, 0.36];

// ---------- CONQUEST ----------------------------------------------------
//
// THE BOARD IS THE PRIZE. A turret the swarm brings down is not wrecked
// and cleared away — it CHANGES SIDES, standing where it stood, with the
// health, the footprint, the attributes and the resolved stats it had a
// tick earlier (Sim.conquerTower), its barrel swung round at the core. The
// player then has to shoot down the thing they paid for, with the guns
// standing next to it.
//
// IT IS THE ONLY RULE IN THE CATALOG THAT COSTS SIX, and the first to
// spend into the BRUTAL band at all, because it is the one that
// invalidates a way of playing outright: every board built on a dense
// block of turrets is a board that arms the swarm in proportion to how
// well it was built, and the denser the block the worse the loss. A
// forward line of repeaters is a forward line of repeaters pointed at the
// core the moment it breaks.
//
// A TURRET IS ONLY TAKEN WHEN IT TRULY DIES. The relics that refuse a
// death (mods.ts: Undying Legion's charges and the Phoenix roll) are asked
// FIRST and every one of them is spent before the swarm gets its hands on
// anything — a turret that can still stand up stands up on the player's
// side. Only the death nothing answers is a conquest, which keeps the two
// mechanics from arguing: a revive is "this did not die", and this rule is
// about what happens when something does.
//
// EVERY TAKEN GUN SHOOTS, whatever it used to shoot at. A turret's air/
// ground targeting is about BODIES, and the swarm's copy has no bodies to
// pick between — its only mark is a building — so a conquered airburst
// shells the line exactly as a conquered repeater does rather than
// standing there inert because the player fields no aircraft. The two
// turrets with no gun at all are the exceptions and stay exceptions: a
// fixer mends nothing for the swarm and a tractor beam drags nothing
// (Sim.fireTowers), so taking one costs the player the block and hands
// the swarm a wall.
//
// ...AND IT COMES BACK AS STUBBORN AS IT WAS. The swarm's copy is handed
// the charges the turret was BORN with (Tower.revivesMax), so an Undying
// Legion board does not simply hand the swarm free turrets — it hands them
// turrets that have to be killed twice, exactly as they had to be killed
// twice for the swarm. What the copy never gets is the PHOENIX roll: that
// is an unlimited coin flip the RUN owns rather than a charge the building
// carries (mods.ts), and handing it over would make a conquered turret
// unkillable for exactly the runs that bought the relic. A conquered turret destroyed is gone for good — its ground opens
// again, and nothing ever conquers back.

/** what health a conquered turret rises with, as a share of its own
 *  ceiling. A full pool would make a broken line an unbroken enemy line;
 *  three fifths is enough that clearing it is real work and little enough
 *  that a board answering fast gets the ground back. */
export const CONQUEST_HP = 0.6;

/** the swarm's copy fires at this share of the rate it did for the player
 *  — the rule is the turret pointed the other way, not a better turret,
 *  and a slower barrel is what keeps a conquered repeater from simply
 *  out-trading the two that killed it */
export const CONQUEST_RATE = 0.7;

if (CONQUEST_HP <= 0 || CONQUEST_HP > 1)
  throw new Error(`Conquest raises a turret on ${CONQUEST_HP} of its pool; that is not a share of one`);
if (CONQUEST_RATE <= 0 || CONQUEST_RATE > 1)
  throw new Error(`Conquest fires at ${CONQUEST_RATE} of the turret's rate; that is not a share of one`);

// ---------- RECONSTRUCTION ----------------------------------------------
//
// EVERY BODY DIES TWICE. A unit the player kills goes down, lies where it
// fell for RECONSTRUCT_DELAY seconds, and stands back up WHOLE — same
// kind, same wave, full health — and only the second death is a death.
// Nothing rises twice: the risen body carries a mark (Sim.urisen) that
// says it has already had its turn, so the rule is exactly one generation
// deep the way Mitosis is, and a lane cannot become a loop.
//
// IT IS A DOUBLING OF THE WORK, NOT OF THE SWARM. The field never holds
// more bodies than the script sent — a corpse is off the board while it
// waits — so nothing about the crowd, the physics or the drop zones
// changes. What changes is that every kill zone has to kill everything
// through it twice, and the second pass arrives BEHIND the first: the
// bodies that rise are the ones that already walked deepest.
//
// THE LEDGER ONLY COUNTS THE SECOND DEATH. A first death pays no scrap,
// counts no kill, and does not clear its wave — the body is coming back,
// so as far as the run's arithmetic is concerned it never left (see
// Sim.killUnit, which holds the wave open by un-booking the removal). That
// keeps ladder.ts's drop-ratio audit honest: the rule adds no income to a
// run, only work, which is the whole reason it is worth points.
//
// ...AND NEITHER DOES ANYTHING ELSE THAT ANSWERS A DEATH. Volatile does
// not detonate a body that is coming back and Mitosis does not split one:
// both hang on the true death, at the bottom of killUnit, for the same
// reason the relics do under Conquest. A rule that says "when this dies"
// should fire when the thing actually dies.

/** how long a corpse lies there before it stands up, in seconds. Long
 *  enough to read as a body getting back up rather than as a shot that
 *  missed, short enough that the second pass is still part of the same
 *  fight rather than a wave of its own. */
export const RECONSTRUCT_DELAY = 1.6;

/**
 * How long the sim keeps trying to stand a corpse up before writing it off
 * as truly dead, in seconds past its due time. A body that died in a crush
 * of its own kin, against rock or on a shoreline may have nowhere to
 * stand (spawnUnit's own wall and crowding tests decide, exactly as they
 * do at a door); it retries while the crowd moves on, and is then booked
 * as the kill it always was rather than holding its wave open forever.
 */
export const RECONSTRUCT_GRACE = 6;

if (RECONSTRUCT_DELAY <= 0 || RECONSTRUCT_GRACE <= 0)
  throw new Error("Reconstruction's clocks have to be positive seconds");

// ---------- LEADERSHIP ---------------------------------------------------
//
// THE BIG ONES LEAD, AND NOTHING NEAR THEM CAN BE HIT HARD. Every body
// within LEADERSHIP_TILES of a LIVE TIER FIVE takes at most
// LEADERSHIP_CAP off any one hit — not a share of the hit, a CEILING on
// it — so the escort around an ironhide5 stops caring what is being fired at
// it and starts caring only how often.
//
// IT INVALIDATES A WAY OF PLAYING, WHICH IS WHAT FIVE POINTS BUYS. A board
// built on big single shots — a repeater's cannon, a railhead's rail, a
// barrage's shells — is a board whose whole damage is the SIZE of each
// hit, and this rule prices that at ten whatever the number on the tin
// says. A board built on rate — tackers, torches, coils, a furnace's beam —
// is untouched, because every one of those already lands under the cap.
// So the rule does not make the swarm tougher so much as it makes one
// half of the roster worthless while a tier five is on the screen, and
// hands the other half the wave.
//
// THE LEADER IS NOT UNDER ITS OWN ORDER. A tier five takes its hits in
// full, and that is the whole answer to the rule: kill the thing the aura
// is coming from and the escort is ordinary again. Capping the leader too
// would have made the one body that must die the one body that cannot,
// and left the rule with no counter at all except waiting.
//
// IT CAPS EVERYTHING, NOT JUST SHOTS. Fire, a held beam's tick, a blast's
// share, a spitter's own hit — every point of damage that lands on a body
// goes through one door (Sim.damageUnit) and the ceiling is on that door.
// That is also why it is not the nerf to damage-over-time it looks like:
// a burn tick and a beam tick are already worth a fraction of the cap, so
// the rule never touches them. It only ever takes the top off a big one.

// AND IT IS A LATE-RUN RULE, WHICH IS MOST OF WHY IT IS THREE. The
// script's first tier five walks in on WAVE 36 of fifty, and tier fives
// are 2% of the bodies in the ten waves after that — so for seventy per
// cent of a run this rule is an empty slot, and the deploy panel has
// already charged for it. Where it does apply it is savage: measured
// against the board, the ceiling deletes 87% of a mixed line's damage,
// and per turret it takes 0% off a tacker, 11% off a coil, 35% off a
// torch, 61% off an autocannon, 71% off a barrage and 90% off a repeater, a
// cleaver or a piercer. On a run that actually reaches the tier fives it
// costs 5% of the run's life.

/** how far the order carries, in cells, measured centre to centre */
export const LEADERSHIP_TILES = 15;

/** the most any one hit may take off a led body */
export const LEADERSHIP_CAP = 10;

/**
 * How often the aura is re-stamped, in seconds, and how long a stamp
 * outlives its pulse. The pair is the armour aura's own bargain
 * (Sim.updateAbilities, AURA_LINGER): a body inside the circle is capped
 * CONTINUOUSLY rather than flickering with the beat, and a body that
 * walks out of it loses the cap a beat later rather than on the frame.
 */
export const LEADERSHIP_PERIOD = 0.25;
export const LEADERSHIP_LINGER = 0.2;

if (LEADERSHIP_CAP <= 0 || LEADERSHIP_TILES <= 0 || LEADERSHIP_PERIOD <= 0)
  throw new Error("Leadership's ceiling, reach and beat all have to be positive");

// ---------- MECH VIRUS ---------------------------------------------------
//
// AN ELITE THAT KILLS BUILDINGS INSTEAD OF FIGHTING THEM. VIRUS_CHANCE of
// the bodies a wave sends carry it — the same shape of roll Hungry Mechs
// uses, and the same kind of thing: one body in a hundred, marked, that a
// player has to treat differently from the ninety-nine beside it. Killing
// the carrier is what SETS THE VIRUS OFF: it jumps to the nearest turret
// within VIRUS_JUMP_TILES and starts eating it, VIRUS_DPS of that
// turret's own ceiling every second.
//
// IT IS A SHARE OF THE POOL AND THAT IS DELIBERATE. A flat rate would be
// death to a tacker and a rounding error to a Giant Bulwarked repeater; five
// percent is TWENTY SECONDS whatever the building is, so the rule reads
// the same on the first wave and the fiftieth and cannot be out-built.
// Plating does not shave it either (it is raw, the rot's own rule): a
// status a plate could blunt would just be the ground mechs again.
//
// AND IT DOES NOT STOP WHEN THE TURRET DOES. A building the virus kills
// hands it on to the nearest turret in range, and that one to the next:
// what starts as one dead ironhide1 walks through a dense line one gun at a
// time until it runs out of neighbours. THE GAP IS THE COUNTER — a line
// with air in it is a line the virus cannot cross, and the player's own
// spacing is the whole defence.
//
// THE OTHER COUNTER IS A STAND-UP. A turret that revives comes back CLEAN
// (Sim.reviveTower clears every status a turret can be under, this one and
// the rot alike), so Undying Legion and the Phoenix roll are the two
// relics that genuinely answer this rule rather than merely surviving it.
//
// SELLING AN INFECTED TURRET IS NOT AN ESCAPE. A removal order on an
// infected building is its DEATH, with everything a death does — the virus
// jumps, the payout relics fire, and under Conquest the swarm takes it —
// so the only way to be rid of the thing is to take its neighbours away
// first and leave it nowhere to go. That is the rule's whole puzzle, and
// a sale that quietly deleted it would be the answer to the puzzle.

/** the share of a wave's bodies that carry it */
export const VIRUS_CHANCE = 0.01;

/** what an infected turret loses a second, as a share of its OWN ceiling */
export const VIRUS_DPS = 0.05;

/** how far it reaches for its next host, in cells — from the dead body,
 *  and from each turret it finishes */
export const VIRUS_JUMP_TILES = 5;

if (VIRUS_CHANCE <= 0 || VIRUS_CHANCE > 1)
  throw new Error(`the Mech Virus rides ${VIRUS_CHANCE} of a wave; that is not a share of one`);
if (VIRUS_DPS <= 0 || VIRUS_DPS > 1)
  throw new Error(`the Mech Virus eats ${VIRUS_DPS} of a pool a second; that is not a share of one`);
