import { TOWERS, type BulletStats, type TowerStats } from "./constants";
import { armored, faster, piercing, reaching, stronger } from "./upgrades";
import type { TowerKind } from "./types";

/**
 * THE SKILL TREE — a short list of GLOBAL dials, each bought up to twenty
 * times with the points the level track pays (economy.ts
 * SKILL_POINT_LEVELS). A rank costs one point and every rank of every
 * node applies to EVERY TURRET ON THE BOARD. See docs/skills.md.
 *
 * IT USED TO BE ONE LINE A TURRET, ten nodes long, and that was the wrong
 * shape twice over. A line was a bet on a gun rather than on a way of
 * playing — and the roster is twenty-three guns, so a hundred points
 * spread over it bought a tenth of the tree and nothing a player could
 * feel. These are stackable instead: a point in Payload is a point every
 * gun you will ever build gets, and twenty of them is a decision about
 * what your whole board is.
 *
 * NOTHING HERE REGENERATES. A dial that put health back would be a
 * different game — the answer to a chewed turret is the fixer and the
 * restorer, which are cards a run buys.
 *
 * It is not upgrades.ts. Those branches are a different, shelved tree
 * dealt BY the track; nothing about them is read here.
 */

/** the chip face a node wears — its effect, in three or four letters */
export type SkillTag =
  | "DMG"
  | "RATE"
  | "RNG"
  | "ARM"
  | "HULL"
  | "BLAST"
  | "AIM"
  | "TURN"
  | "VEL"
  | "PIERCE";

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
// the stat surgery the composed helpers in upgrades.ts do not cover
// ---------------------------------------------------------------------------

const eachAmmo = (s: TowerStats, f: (b: BulletStats) => BulletStats): TowerStats => {
  const b = f(s.bullet);
  return { ...s, bullet: s.bullet.alt ? { ...b, alt: f(s.bullet.alt) } : b };
};

const wider = (s: TowerStats, mul: number): TowerStats =>
  eachAmmo(s, (b) => ({ ...b, splashRadius: b.splashRadius * mul }));

const steadier = (s: TowerStats, mul: number): TowerStats => ({
  ...s,
  inaccuracy: s.inaccuracy * mul,
  spread: s.spread * mul,
});

const swifter = (s: TowerStats, mul: number): TowerStats => ({
  ...s,
  rotateSpeed: s.rotateSpeed * mul,
  shootCone: s.shootCone * mul,
});

const tougher = (s: TowerStats, mul: number): TowerStats => ({
  ...s,
  health: s.health * mul,
});

/**
 * A ROUND THAT LEAVES THE BARREL FASTER, and covers the same ground doing
 * it: speed alone would cut the distance a shot crosses before its
 * lifetime runs out, which is a range nerf wearing a buff's name.
 */
const quicker = (s: TowerStats, mul: number): TowerStats =>
  eachAmmo(s, (b) => ({ ...b, speed: b.speed * mul, lifetime: b.lifetime / mul }));

// ---------------------------------------------------------------------------
// THE NODES. Every one is a per-rank step and a cap of MAX_RANKS.
// ---------------------------------------------------------------------------

const pct = (n: number): string => (Math.round(n * 10) / 10).toString();

export const SKILL_NODES: readonly SkillNode[] = [
  {
    id: "payload",
    name: "Payload",
    tag: "DMG",
    blurb: (r) => `+${pct(r * 2)}% damage on every turret, blast included.`,
    apply: (s, r) => stronger(s, 1 + (r * 2) / 100),
  },
  {
    id: "cadence",
    name: "Cadence",
    tag: "RATE",
    blurb: (r) => `+${pct(r * 2)}% attack speed on every turret.`,
    apply: (s, r) => faster(s, 1 + (r * 2) / 100),
  },
  {
    id: "reach",
    name: "Reach",
    tag: "RNG",
    blurb: (r) => `+${pct(r * 1.5)}% range, and the shot flies as far.`,
    apply: (s, r) => reaching(s, 1 + (r * 1.5) / 100),
  },
  {
    id: "plating",
    name: "Plating",
    tag: "ARM",
    blurb: (r) => `+${r} armour on every turret — a flat shave off each hit.`,
    apply: (s, r) => armored(s, r),
  },
  {
    id: "hull",
    name: "Hull",
    tag: "HULL",
    blurb: (r) => `+${pct(r * 4)}% turret health.`,
    apply: (s, r) => tougher(s, 1 + (r * 4) / 100),
  },
  {
    id: "blast",
    name: "Blast Radius",
    tag: "BLAST",
    blurb: (r) => `+${pct(r * 2)}% splash radius, wherever a shot has one.`,
    apply: (s, r) => wider(s, 1 + (r * 2) / 100),
  },
  {
    id: "stabilisers",
    name: "Stabilisers",
    tag: "AIM",
    blurb: (r) => `${pct(r * 2)}% less scatter on every shot.`,
    apply: (s, r) => steadier(s, 1 - (r * 2) / 100),
  },
  {
    id: "servos",
    name: "Servos",
    tag: "TURN",
    blurb: (r) => `+${pct(r * 3)}% traverse — barrels come onto a target sooner.`,
    apply: (s, r) => swifter(s, 1 + (r * 3) / 100),
  },
  {
    id: "velocity",
    name: "Muzzle Velocity",
    tag: "VEL",
    blurb: (r) => `+${pct(r * 2)}% shot speed, over the same ground.`,
    apply: (s, r) => quicker(s, 1 + (r * 2) / 100),
  },
  {
    // THE ONE COARSE DIAL. Pierce is a count of bodies and not a
    // percentage, so a rank of it cannot be a fifth of one — four ranks
    // buy a body, and the twentieth is the fifth of them.
    id: "penetrators",
    name: "Penetrators",
    tag: "PIERCE",
    blurb: (r) =>
      `Shots punch through ${Math.floor(r / 4)} more ${Math.floor(r / 4) === 1 ? "body" : "bodies"}` +
      (r % 4 === 0 ? "." : ` — ${4 - (r % 4)} more rank${4 - (r % 4) === 1 ? "" : "s"} for the next.`),
    apply: (s, r) => (r >= 4 ? piercing(s, Math.floor(r / 4)) : s),
  },
];

/** every point the tree could ever take — twice what 100 levels pay, on
 *  purpose: a hundred points over ten dials is a hand, not a checklist */
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
