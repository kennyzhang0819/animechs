/**
 * THE ASCENSION LINE — the tech tree's LEFT column, and the one thing on it
 * that is not bought.
 *
 * Everything else in the tree is a purchase: a bank pays, a node takes a
 * point, the save owns it forever (tech.ts). Ascension is the opposite
 * transaction in every way, and that is why it hangs off its own column
 * rather than being squeezed into TECH_TREE:
 *
 *   IT IS NOT PAID FOR — it is EARNED, one rank per boss felled. There is
 *   no currency it could charge that would mean the same thing, and a price
 *   is exactly what would let a player farm their way past a fight.
 *
 *   IT IS NOT OWNED, IT IS SWITCHED ON. A turret point is capacity you
 *   always have; an ascension is a rule you choose to play under, per run,
 *   and the player turns each one on and off as they like (Progress.ascension).
 *   Reaching a rank does not force it — reaching it OFFERS it.
 *
 *   IT MAKES THE GAME HARDER, NOT EASIER. Every other node is power flowing
 *   towards the player. This flows the other way, which is the whole reason
 *   it wants a visibly separate line: nothing on it should ever be clicked
 *   by someone who thought they were buying an upgrade.
 *
 * THE RANK STARTS AT 0 and every save begins there — no ascension exists to
 * be switched on until a boss dies. Rank is not stored: it is READ OFF the
 * boss-trophy ledger the save already keeps (Progress.bossKills, one entry
 * per distinct boss fight won — see grantRunReward). A second number
 * counting the same events could only ever drift out of step with it.
 *
 * ONE ASCENSION IS BUILT, and the list is the roadmap: rank 1 is Hungry.
 * Adding rank 2 is an entry here plus its rule in the sim; nothing about
 * the tree view, the save or the toggles needs editing to make room.
 */

/** the ascension ranks, in the order they are earned. `level` IS the rank
 *  a save must reach for the entry to be offered, and the value the run
 *  spec carries (LevelSpec.ascension) */
export interface AscensionDef {
  /** rank this switch unlocks at, 1-based — level 0 is "none of them" */
  level: number;
  /** what it is called on the node and in the run's modifier list */
  name: string;
  /** the rule, in one sentence, as the tree's hover card states it */
  blurb: string;
}

/** rank 1: the hungry status — see HUNGRY_* below for the numbers */
export const ASC_HUNGRY = 1;

export const ASCENSIONS: readonly AscensionDef[] = [
  {
    level: ASC_HUNGRY,
    name: "Hungry",
    blurb:
      "One enemy in ten spawns hungry. It eats a neighbour every second — up to ten — taking double their health and swelling with every meal. What it eats drops nothing.",
  },
];

/** the highest rank the line offers — what a fully ascended save reads */
export const ASCENSION_MAX = ASCENSIONS.reduce((m, a) => Math.max(m, a.level), 0);

/** the entry for a rank, or null where the line has nothing yet */
export const ascensionAt = (level: number): AscensionDef | null =>
  ASCENSIONS.find((a) => a.level === level) ?? null;

/** is this rank switched on for the run? — the sim's one question */
export const hasAscension = (
  active: readonly number[] | undefined,
  level: number,
): boolean => !!active && active.includes(level);

/**
 * Clean a raw list of switched-on ranks: known ranks only, no duplicates,
 * nothing above what the save has actually earned, ascending. Every reader
 * goes through this, so a hand-edited save or one written when the line was
 * longer degrades to the ranks it legitimately holds rather than handing
 * the sim a rule that does not exist.
 */
export function cleanAscension(
  raw: unknown,
  rank: number = ASCENSION_MAX,
): number[] {
  if (!Array.isArray(raw)) return [];
  const out: number[] = [];
  for (const v of raw) {
    if (typeof v !== "number" || !Number.isInteger(v)) continue;
    if (v < 1 || v > rank || !ascensionAt(v)) continue;
    if (!out.includes(v)) out.push(v);
  }
  return out.sort((a, b) => a - b);
}

// ---------- RANK 1: HUNGRY ---------------------------------------------
//
// A hungry unit is not a new KIND — every wave the script sends is
// untouched, and the level editor's arithmetic (ladder.ts) still describes
// exactly what arrives. What changes is that one body in ten walks in with
// an appetite, and the wave then eats itself down into fewer, fatter units.
//
// THE PAYOUT IS THE POINT. A devoured unit is removed without ever being
// killed, so it pays no drop at all (killsByKind is the whole ledger — see
// dropsForKills), and the hungry unit that ate it still drops exactly what
// its own kind drops. Ten meals therefore cost the player ten bodies' worth
// of salvage and hand back one body's worth, on top of a unit carrying
// twenty-one times the health it spawned with. The bargain is meant to
// sting: it is what a difficulty a player OPTED INTO should feel like.

/** share of spawns that walk in hungry */
export const HUNGRY_CHANCE = 0.1;

/** seconds between feeding attempts — one meal a second, at most */
export const HUNGRY_PERIOD = 1;

/** meals one hungry unit will ever take */
export const HUNGRY_MAX_MEALS = 10;

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

/** how much bigger a meal draws the unit — art only, the hitbox never
 *  moves (see the note in Sim.feedHungry) */
export const HUNGRY_GROWTH = 0.05;

/** how far a hungry unit can reach for a meal, in px (four tiles) */
export const HUNGRY_REACH = 80;

/** the hungry tint, multiplied into whatever the unit was already drawn in
 *  — the only way to spot one before it has taken its first bite */
export const HUNGRY_HUE: readonly [number, number, number] = [1, 0.55, 0.86];
