/**
 * MUTATORS — the rules a run is played UNDER, rolled rather than chosen.
 * The model, the cost scale, the measured costs, the roll and every rule's
 * design notes are in docs/mutators.md. Read it before touching a number.
 *
 * The one rule worth repeating here: a mutator changes a wave AFTER it
 * spawns, never what the script sends, which is what keeps ladder.ts's
 * counts and drop audit true whatever the roll came back with.
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
  /** the rule in one sentence, as the codex card and deploy panel print
   *  it: what happens, never how it is implemented */
  blurb: string;
  /** what it is worth against a tier's budget — 1-6, see MUT_COST_MIN/MAX */
  cost: number;
}

/**
 * THE COST SCALE: 1-2 light, 3-4 heavy, 5-6 brutal. Nothing may cost more
 * than the max — a rule that cannot be rolled alongside two others at the
 * top tier is a game mode. docs/mutators.md has what each band means.
 */
export const MUT_COST_MIN = 1;
export const MUT_COST_MAX = 6;

/**
 * THE CATALOG, HARDEST FIRST — which is also codex order, and enforced
 * below. Every cost here was MEASURED (how much shorter the run gets with
 * the rule on), not felt; the instrument, the per-rule numbers and the one
 * cost to distrust are in docs/mutators.md.
 */
export const MUTATIONS: readonly MutationDef[] = [
  {
    id: "hungry",
    name: "Hungry Mechs",
    cost: 6,
    blurb: "A few enemies eat nearby enemies, growing bigger and stronger with each one.",
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
    blurb: "Every enemy revives once, at full health, where it was destroyed.",
  },
  {
    id: "conquest",
    name: "Conquest",
    cost: 4,
    blurb: "Every turret the enemy destroys is turned against you.",
  },
  {
    id: "mechVirus",
    name: "Mech Virus",
    cost: 4,
    blurb: "A few enemies carry a virus that drains a turret, then jumps to the next one.",
  },
  {
    id: "overshields",
    name: "Overshields",
    cost: 4,
    blurb: "Force fields are five times as strong.",
  },
  {
    id: "armored",
    name: "Armored Swarms",
    cost: 3,
    blurb: "Lower tier enemies gain a large amount of armour.",
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
    blurb: "Enemies within 15 tiles of a live T5 take at most 10 damage from any one hit.",
  },
  {
    id: "mitosis",
    name: "Mitosis",
    cost: 3,
    blurb: "Every enemy breaks apart into T1 enemies when it dies.",
  },
  {
    id: "amphibious",
    name: "Amphibious",
    cost: 2,
    blurb: "Ground enemies come out of water faster, tougher and healing.",
  },
  {
    id: "shieldTowers",
    name: "Shield Towers",
    cost: 2,
    blurb: "Shield towers rise periodically and absorb bullets until they are destroyed.",
  },
  {
    id: "volatile",
    name: "Volatile",
    cost: 2,
    blurb: "Enemies explode when they die, damaging nearby turrets.",
  },
];

/** the list is authored by hand, so the list checks itself at import */
for (const m of MUTATIONS) {
  if (!Number.isInteger(m.cost) || m.cost < MUT_COST_MIN || m.cost > MUT_COST_MAX)
    throw new Error(
      `mutator "${m.id}" costs ${m.cost}; the scale is ${MUT_COST_MIN}-${MUT_COST_MAX} whole points`,
    );
  if (MUTATIONS.filter((o) => o.id === m.id).length > 1)
    throw new Error(`two mutators share the id "${m.id}"`);
}

// ...and hardest-first is codex order, which nothing enforced until a
// merge silently dropped Mitosis below two rules dearer than it.
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
// The cost is the only balance dial here, so the dashboard can bend it
// without a rebuild. The override is a scratch pad — a settled number
// belongs on the entry in MUTATIONS. Everything asking what a rule is
// worth goes through mutationCostOf, and a bent cost never reorders the
// catalog (sortByCatalog reads MUTATIONS, not the costs).

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

/** every rule a run is played under — the deploy's roll, in catalog order.
 *  The only way to ask: every entry point that starts a run comes here */
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
 * HOW MANY RULES A RUN IS PLAYED UNDER — the range the tier's dial may be
 * set to (RungKnobs.mutationCount), not a range the roller picks from. The
 * count is a difficulty curve rather than a surprise; which rules is the
 * surprise. Zero is legal and is what the named difficulties carry.
 */
export const MUT_COUNT_MIN = 0;
export const MUT_COUNT_MAX = 5;

/**
 * THE BUDGET A DIFFICULTY HANDS THE ROLLER, as points — arithmetic on the
 * tier index so the ladder extends without re-authoring, and only where
 * the tier's dial starts (RungKnobs.mutationPoints). The named
 * difficulties spend nothing. Curve and reasoning: docs/mutators.md.
 */
export const MUT_BUDGET_BASE = 6;
export const MUT_BUDGET_PER_RUNG = 1.8;

/** the points a tier (0-based) may spend; the named difficulties are zero
 *  by rule rather than by arithmetic, which starts at MUT_FIRST_TIER */
export const mutationBudget = (tier: number): number => {
  const step = mutationStep(tier);
  return step <= 0 ? 0 : Math.round(MUT_BUDGET_BASE + MUT_BUDGET_PER_RUNG * step);
};

/** the first tier that rolls, 0-based: the one above Nemesis */
export const MUT_FIRST_TIER = 4;

/** how many tiers into the mutating band a tier is — 1 on the first one,
 *  0 or less on every named difficulty */
export const mutationStep = (tier: number): number => tier - MUT_FIRST_TIER + 1;

/**
 * HOW MANY RULES A TIER ROLLS — three on the first mutating tier, one more
 * every MUT_PICKS_EVERY, capped. It climbs far slower than the budget
 * because points buy WEIGHT and the count buys BREADTH; breadth is the
 * scarcer of the two (docs/mutators.md).
 */
export const MUT_PICKS_BASE = 3;
export const MUT_PICKS_EVERY = 4;

export const mutationPicks = (tier: number): number => {
  const step = mutationStep(tier);
  return step <= 0
    ? 0
    : Math.min(MUT_COUNT_MAX, MUT_PICKS_BASE + Math.floor((step - 1) / MUT_PICKS_EVERY));
};

// The first mutating tier must afford its own full roll at the lightest
// cost the scale allows, or the easiest mutating difficulty would quietly
// be the one with the fewest rules. Checking it checks all of them.
if (mutationBudget(MUT_FIRST_TIER) < mutationPicks(MUT_FIRST_TIER) * MUT_COST_MIN)
  throw new Error(
    `the first mutating tier's ${mutationBudget(MUT_FIRST_TIER)} points cannot pay for ${mutationPicks(MUT_FIRST_TIER)} mutators`,
  );

/** how many shuffles the roller tries before keeping its best (see below) */
const ROLL_TRIES = 24;

/**
 * ROLL A RUN'S MUTATORS: `want` rules, together fitting the budget.
 *
 * A shuffle-and-walk, run ROLL_TRIES times, keeping the best — most rules
 * first, then most points spent. It never overspends and never repeats;
 * it returns fewer rules only when the catalog cannot honestly do better.
 * Why the count comes in rather than the budget deciding it, and why
 * spending the budget is the tiebreak: docs/mutators.md.
 */
export function rollMutations(
  budget: number,
  want: number,
  exclude: readonly MutationId[] = [],
  rand: () => number = Math.random,
): MutationId[] {
  // every rule is in every draw on every map — a terrain rule simply reads
  // whatever terrain it lands on. `exclude` is for a caller that wants a
  // rule out of one draw.
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

// ---------- HUNGRY — docs/mutators.md ---------------------------------
//
// One body in twenty eats the wave down into fewer, fatter units. A meal
// pays no drop at all (killsByKind is the whole ledger), which is most of
// what the rule costs the player.

/** share of spawns that walk in hungry — one in twenty */
export const HUNGRY_CHANCE = 0.05;

/** seconds between feeding attempts — one meal a second, at most */
export const HUNGRY_PERIOD = 1;

/** meals one hungry unit will ever take */
export const HUNGRY_MAX_MEALS = 20;

/** a meal is worth DOUBLE the prey's MAX health, onto current and max.
 *  Nothing else crosses over — no shield, aura, status, armour or speed */
export const HUNGRY_HP_PER_MEAL = 2;

/** ...and what a meal adds to the eater's BITE, as a share of its own
 *  weapon. Without this the rule was a GIFT: it spent the swarm's numbers,
 *  which is what a swarm hurts a line with, to buy one body a pool */
export const HUNGRY_DMG_PER_MEAL = 1;

/** how much bigger a meal DRAWS the unit — art only, the hitbox never
 *  moves. The swell is the player's only warning of what walks at them */
export const HUNGRY_GROWTH = 0.05;

/** how far a hungry unit can reach for a meal, in px (four tiles) */
export const HUNGRY_REACH = 80;

/** the hungry tint, multiplied into whatever the unit was already drawn in
 *  — the only way to spot one before it has taken its first bite */
export const HUNGRY_HUE: readonly [number, number, number] = [1, 0.55, 0.86];

// ---------- ARMORED SWARMS — docs/mutators.md -------------------------
//
// Flat armour on the tier 1-3 bodies only. Armour is a shave floored at a
// tenth of the raw hit, so the rule is REGRESSIVE BY CALIBRE on purpose:
// it says "the cheap guns stop counting", not "the swarm is tougher".

/** flat armour added to every unit of tier 3 or below under Armored
 *  Swarms — applied once at spawn (Sim.spawnUnit), so every armour read
 *  downstream, the piercer's x4 included, already sees it */
export const ARMORED_ARMOR = 10;

/** the top unit tier the plating reaches; T4 and T5 never take it */
export const ARMORED_MAX_TIER = 3;

// ---------- SPEEDY — docs/mutators.md ---------------------------------
//
// Twice as fast, and immune to the SLOW but not to the status: a soaked
// unit is still wet, still puts out a fire, still takes what the
// ammunition does (Sim.applyWet). It adds no health at all, which the
// audit arithmetic cannot see and its price is entirely about.

/** the drive-speed multiplier every unit walks in with under Speedy —
 *  applied once at spawn (Sim.spawnUnit), never per tick */
export const SPEEDY_SPEED = 2;

// ---------- HYDROPHOBIC — docs/mutators.md ----------------------------
//
// A turret built near water reloads at a third rate. Two things worth
// knowing at the code: the penalty is FIXED WHEN THE TURRET IS PLACED and
// never re-read (the water does not move), and it slows the RELOAD, not
// the volley — a tractor turret has no reload and is untouched.

/** how far from water the tax reaches, in cells — measured from any water
 *  floor, shallow or deep, to the nearest cell of the turret's footprint */
export const HYDROPHOBIC_RANGE = 10;

/** what a waterlogged turret's reload runs at — 70% off, so a volley it
 *  used to start every second now takes three and a third */
export const HYDROPHOBIC_RATE = 0.3;

// ---------- AMPHIBIOUS — docs/mutators.md -----------------------------
//
// A walker that enters water comes out better, up to five times over a
// route. A stack is an ENTRY, not a duration, so the gain is paid for by
// route rather than by loitering. Every percentage is of what the body
// SPAWNED with, read once per stack — off the current pool the stacks
// would compound, and a hungry unit's meals would feed them.

/** how many times one body may take the bonus */
export const AMPHIBIOUS_MAX_STACKS = 5;

/** health added per stack, as a share of the health it spawned with — put
 *  on the CURRENT pool as well as the maximum, so wading heals */
export const AMPHIBIOUS_HP = 0.15;

/** drive speed added per stack, as a share of what it spawned with
 *  (Speedy's doubling included). It was +250% a body, and the headless
 *  playtest lost the map on wave 4 with every leak a dartback1 */
export const AMPHIBIOUS_SPEED = 0.1;

/** armour added per stack, FLAT — the dartback line's T1 has armour 0, so
 *  a percentage would skip the body the rule is most about. It was 10,
 *  which is a body every tacker hits for its floor */
export const AMPHIBIOUS_ARMOR = 0.5;

/** healing per stack per second, as a share of the health it spawned with:
 *  at the cap a body mends itself in twenty seconds, which chip damage
 *  cannot outrun and a real kill zone does not notice */
export const AMPHIBIOUS_REGEN = 0.01;

/** how much bigger a waded body DRAWS per stack — art only, like the
 *  hungry swelling it sits alongside (HUNGRY_GROWTH). The sim's hitbox
 *  never moves; this is how a player picks the upgraded ones out of a lane */
export const AMPHIBIOUS_GROWTH = 0.04;

// ---------- OVERSHIELDS — docs/mutators.md ----------------------------
//
// Pool, cap and regen all carry the factor, so a scaled field breaks
// later, refills proportionally faster, and is dark for the same cooldown.

/** the multiplier every shield pool, cap and regen carries under
 *  Overshields — read once per run (Sim.reset), never per tick */
export const OVERSHIELD_SCALE = 5;

// ---------- VOLATILE — docs/mutators.md -------------------------------
//
// Deaths damage towers, which is the only thing in the game that does.
// The damage scales with the body's TIER, never its level: tower health
// does not climb the ladder, so neither may the thing that spends it.

/**
 * BLAST REACH from the dead body's centre, in px, BY THE DEAD UNIT'S TIER
 * (index 0 unused) — plus the body's own hitbox radius on top. Literals
 * rather than CELL because this file deliberately imports nothing. The
 * ring Sim.volatileBlast draws is sized from this, so a row edit carries.
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

// ---------- MITOSIS — docs/mutators.md --------------------------------
//
// Three things the arithmetic below cannot tell you. It TERMINATES because
// a brood body does not brood — a flag on the body (Sim.ubrood), not a
// zero in the table, which is what lets every row be a free dial. A LEAK
// IS NOT A DEATH, so a body that walks off leaves nothing. And the brood
// keeps its parent's LAYER (MITOSIS_KINDS in sim.ts), or runts land in
// deep water.

/** how many tier-1 bodies a death leaves, by the dead unit's tier (index
 *  0 unused) — roughly the tier's own weight. Tier 1 leaves one, which is
 *  what makes the card's "every enemy" literally true */
export const MITOSIS_BROOD: readonly number[] = [0, 1, 2, 4, 7, 12];

/** how far a brood member may land, in px */
export const MITOSIS_SPREAD = 36;

/** placement attempts per brood member — a body dying against rock leaves
 *  a smaller brood than the table promises, which is the honest outcome */
export const MITOSIS_TRIES = 6;

// The table checks itself. Termination is NOT what is checked — that is
// Sim.ubrood's job. A fractional count is a spawn loop run a nonsense
// number of times, and a table short of tier 5 is a rule that switches
// itself off on exactly the deaths it was written for.
if (MITOSIS_BROOD.length <= 5)
  throw new Error(
    `Mitosis's brood table stops at tier ${MITOSIS_BROOD.length - 1}; unit tiers run to 5`,
  );
for (let t = 1; t < MITOSIS_BROOD.length; t++)
  if (!Number.isInteger(MITOSIS_BROOD[t]) || MITOSIS_BROOD[t] < 0)
    throw new Error(`Mitosis has tier ${t} leaving ${MITOSIS_BROOD[t]} bodies — that is not a count`);

// ---------- SHIELD TOWERS — docs/mutators.md --------------------------
//
// A dome that absorbs projectiles until it is broken; instant weapons are
// never absorbed, which makes the beam roster the tower-breaking roster.
// Two rules the code depends on: it asks board.ts (groundClear,
// domesClear) what ground a turret could stand on rather than carrying its
// own test — it used to want buildable ROCK, and every dome landed on a
// hill the player had stopped wanting — and it never touches what the
// player built: a roll over a turret is re-rolled, and a board with no
// free ground raises nothing that period.
//
// px literals below assume CELL = 20; this file imports nothing.

/** the footprint's edge, in cells — always square */
export const SHIELD_TOWER_SIZE = 3;
/** the hittable body, from the shield tower's centre (1.4 cells) */
export const SHIELD_TOWER_BODY_R = 28;
/** the dome the shield pass draws and the absorb sweep tests (8 cells) */
export const SHIELD_TOWER_DOME_R = 160;
/**
 * Body pool at wave one, before the wave curve and the run's multiplier.
 * FOUR TIMES THE DOME'S, and that ratio is the pacing: a body that dies
 * inside one reform window never gives the dome trade a chance to happen.
 */
export const SHIELD_TOWER_HP = 12000;
/** dome pool at wave one, before the wave curve and the run's multiplier */
export const SHIELD_TOWER_SHIELD = 3000;
/**
 * Seconds from the dome breaking to the dome returning — WHOLE, not by
 * degrees, and NOT INTERRUPTIBLE. The clock starts when the dome breaks
 * and nothing restarts it; breaking it is also the only thing that starts
 * it, so a dome chipped to 40% and left alone stays there forever.
 */
export const SHIELD_TOWER_SHIELD_DELAY = 10;
/** seconds between one shield tower rising and the next trying to. No
 *  opening grace: the first attempt is on the run's first tick, so a board
 *  builds around them rather than having one dropped into it later */
export const SHIELD_TOWER_SPAWN_PERIOD = 30;
/** shield towers standing at once, at most — the timer idles at the cap.
 *  Twenty is a landscape rather than an event: the rule competes with the
 *  player for the ground the turrets want */
export const SHIELD_TOWER_MAX_ALIVE = 20;

// ---------- THE WAVE CURVE — docs/mutators.md -------------------------
//
// Both pools are set by the wave the tower rises on, and they compound —
// what they are racing is the player's damage, which compounds too. FIXED
// AT SPAWN, never re-read, which is what makes clearing them promptly
// worth anything.

/** what each wave multiplies the previous wave's pools by. It is 1.1 ** 5:
 *  the curve was authored a wave at a time against a fifty-wave script and
 *  a wave is five of those now (levels.ts), so the growth compounds five
 *  times over to keep the same shape end to end */
export const SHIELD_TOWER_WAVE_GROWTH = 1.1 ** 5;

/** the multiplier on both pools for a tower rising on `wave` — 1.00 on
 *  wave one, ~6.7 by five, ~107 by ten. The run's shield multiplier
 *  (Overshields, or 1) rides on top */
export const shieldTowerWaveScale = (wave: number): number =>
  Math.pow(SHIELD_TOWER_WAVE_GROWTH, Math.max(0, wave - 1));

// ---------- THE MEGA SHIELD TOWER — docs/mutators.md ------------------
//
// Same rule, same regen, a dome four times the area — it is about REACH,
// not pools. It used to multiply the pools by five as well, which put a
// cliff in the middle of a curve meant to be smooth.

/** the wave from which every new shield tower rises as a mega shield tower —
 *  wave 6 of the old fifty-wave script, folded five into one */
export const SHIELD_TOWER_MEGA_WAVE = 2;
/** its dome, in px (16 cells) — four times the ordinary dome's area */
export const SHIELD_TOWER_MEGA_DOME_R = 320;

// ---------- CONQUEST — docs/mutators.md -------------------------------
//
// A turret the swarm brings down changes sides where it stands. Three
// things the constants cannot say. A turret is only taken when it TRULY
// dies — every revive (mods.ts) is asked first and spent. Every taken gun
// shoots, whatever it used to target, because the swarm's copy has only
// buildings to shoot at; a fixer and a tractor have no gun and become a
// wall. And the copy is handed the charges the turret was BORN with but
// never the Phoenix roll, which the run owns rather than the building.

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

// ---------- RECONSTRUCTION — docs/mutators.md -------------------------
//
// One generation deep, like Mitosis: the risen body carries a mark
// (Sim.urisen), so a lane cannot become a loop. THE LEDGER ONLY COUNTS THE
// SECOND DEATH — a first death pays no scrap, counts no kill and holds its
// wave open — which is what keeps the drop audit honest: the rule adds
// work, never income. Volatile and Mitosis both hang on the true death for
// the same reason.

/** how long a corpse lies there before it stands up, in seconds. Long
 *  enough to read as a body getting back up rather than as a shot that
 *  missed, short enough that the second pass is still part of the same
 *  fight rather than a wave of its own. */
export const RECONSTRUCT_DELAY = 1.6;

/** how long the sim keeps retrying a corpse with nowhere to stand, in
 *  seconds past its due time, before booking it as the kill it always was
 *  rather than holding its wave open forever */
export const RECONSTRUCT_GRACE = 6;

if (RECONSTRUCT_DELAY <= 0 || RECONSTRUCT_GRACE <= 0)
  throw new Error("Reconstruction's clocks have to be positive seconds");

// ---------- LEADERSHIP — docs/mutators.md -----------------------------
//
// A CEILING on any one hit near a live tier five, not a share of it — so
// it prices the big-single-shot half of the roster at ten and leaves the
// rate half untouched. The leader is not under its own order, which is the
// whole counter. It caps EVERYTHING that lands on a body because every
// point of damage goes through one door (Sim.damageUnit); ticks are
// already under the cap, so it is not the DoT nerf it looks like.

/** how far the order carries, in cells, measured centre to centre */
export const LEADERSHIP_TILES = 15;

/** the most any one hit may take off a led body */
export const LEADERSHIP_CAP = 10;

/** the aura's beat and how long a stamp outlives it — the armour aura's
 *  own bargain (AURA_LINGER): capped continuously rather than flickering,
 *  and lost a beat after walking out rather than on the frame */
export const LEADERSHIP_PERIOD = 0.25;
export const LEADERSHIP_LINGER = 0.2;

if (LEADERSHIP_CAP <= 0 || LEADERSHIP_TILES <= 0 || LEADERSHIP_PERIOD <= 0)
  throw new Error("Leadership's ceiling, reach and beat all have to be positive");

// ---------- MECH VIRUS — docs/mutators.md -----------------------------
//
// KILLING THE CARRIER is what sets it off. It eats a share of the host's
// OWN ceiling, so it reads the same on the first wave and the fiftieth and
// cannot be out-built, and plating does not shave it. It jumps from each
// turret it finishes to the next — the GAP is the counter. A revive clears
// it; selling an infected turret is its death and does not.

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
