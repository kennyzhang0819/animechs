import { TOWERS, type TowerStats } from "./constants";
import { faster, reaching, stronger } from "./upgrades";
import type { TowerKind } from "./types";

/**
 * THE UPGRADES — four GLOBAL dials, each bought up to twenty times with
 * the points the level track pays (economy.ts SKILL_POINT_LEVELS). A rank
 * costs one point and every rank of every one applies to EVERY TURRET ON
 * THE BOARD. See docs/skills.md.
 *
 * FOUR, AND THEY ARE THE FOUR A PLAYER ALREADY THINKS IN: damage, attack
 * speed, health, range. It was ten for a while — armour, blast, scatter,
 * traverse, shot speed and pierce beside these — and the extra six were
 * dials nobody had a plan for, which is a longer screen and not a bigger
 * decision. What is left is the shape of a board said in four numbers.
 *
 * BEFORE THAT IT WAS ONE LINE A TURRET, which was wrong twice over: a
 * line was a bet on a gun rather than on a way of playing, and the roster
 * is twenty-three guns, so a hundred points over it bought a tenth of the
 * tree and nothing a player could feel.
 *
 * NOTHING HERE REGENERATES. A dial that put health back would be a
 * different game — the answer to a chewed turret is the fixer and the
 * restorer, which are cards a run buys.
 *
 * IT IS NOT upgrades.ts, whatever the tab says. The player-facing word
 * for this screen is Upgrades; those branches are a different, shelved
 * tree dealt BY the track, and nothing about them is read here.
 */

/** the chip face a node wears — its effect, in three or four letters */
export type SkillTag = "DMG" | "RATE" | "HULL" | "RNG";

/** how many times one node may be bought */
export const MAX_RANKS = 20;

/** what one rank costs, in points */
export const NODE_COST = 1;

export interface SkillNode {
  id: string;
  name: string;
  tag: SkillTag;
  /** one line, with the rank's own number in it */
  blurb: (ranks: number) => string;
  /** every rank folded in at once — never called with 0 */
  apply: (s: TowerStats, ranks: number) => TowerStats;
}

// ---------------------------------------------------------------------------
// the one piece of stat surgery the composed helpers in upgrades.ts do not
// cover — the rest of the dials are theirs
// ---------------------------------------------------------------------------

const tougher = (s: TowerStats, mul: number): TowerStats => ({
  ...s,
  health: s.health * mul,
});

// ---------------------------------------------------------------------------
// THE NODES. Every one is a per-rank step and a cap of MAX_RANKS.
// ---------------------------------------------------------------------------

const pct = (n: number): string => (Math.round(n * 10) / 10).toString();

export const SKILL_NODES: readonly SkillNode[] = [
  {
    id: "payload",
    name: "Attack Damage",
    tag: "DMG",
    blurb: (r) => `+${pct(r * 2)}% damage on every turret, blast included.`,
    apply: (s, r) => stronger(s, 1 + (r * 2) / 100),
  },
  {
    id: "cadence",
    name: "Attack Speed",
    tag: "RATE",
    blurb: (r) => `+${pct(r * 2)}% attack speed on every turret.`,
    apply: (s, r) => faster(s, 1 + (r * 2) / 100),
  },
  {
    id: "hull",
    name: "Health",
    tag: "HULL",
    blurb: (r) => `+${pct(r * 4)}% turret health.`,
    apply: (s, r) => tougher(s, 1 + (r * 4) / 100),
  },
  {
    id: "reach",
    name: "Range",
    tag: "RNG",
    blurb: (r) => `+${pct(r * 1.5)}% range, and the shot flies as far.`,
    apply: (s, r) => reaching(s, 1 + (r * 1.5) / 100),
  },
];

/** every point the tree could ever take */
export const TREE_COST = SKILL_NODES.length * MAX_RANKS * NODE_COST;

/** how many ranks a save has bought of each node, keyed by node id */
export type SkillPoints = Partial<Record<string, number>>;

export const NO_SKILLS: SkillPoints = {};

/** the ranks bought of one node, clamped into it */
export const ranksOn = (skills: SkillPoints | undefined, id: string): number =>
  Math.max(0, Math.min(MAX_RANKS, Math.floor(skills?.[id] ?? 0)));

/** every point a spread has spent */
export function spentSkillPoints(skills: SkillPoints | undefined): number {
  let total = 0;
  for (const n of SKILL_NODES) total += ranksOn(skills, n.id) * NODE_COST;
  return total;
}

/**
 * A TURRET WITH THE WHOLE TREE FOLDED IN, applied over whatever the rest
 * of the tech (upgrades.ts) already composed. Returns `base` untouched
 * when nothing is bought, so an unspent save pays nothing.
 *
 * THE ORDER IS THE LIST'S and it has to be fixed: these compose by
 * multiplication and addition both, and a board that applied them in
 * another order would price the same save differently.
 */
export function skilledTower(skills: SkillPoints | undefined, base: TowerStats): TowerStats {
  if (!skills) return base;
  let s = base;
  for (const n of SKILL_NODES) {
    const r = ranksOn(skills, n.id);
    if (r > 0) s = n.apply(s, r);
  }
  return s;
}

/** the stats the tree makes of one stock turret — what a card would print */
export const skilledStock = (kind: TowerKind, skills: SkillPoints | undefined): TowerStats =>
  skilledTower(skills, TOWERS[kind]);
