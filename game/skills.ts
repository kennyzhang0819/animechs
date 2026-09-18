import { TOWERS, type BulletStats, type TowerStats } from "./constants";
import { armored, faster, piercing, reaching, stronger } from "./upgrades";
import { FIELDED_KINDS, TOWER_KINDS, type TowerKind } from "./types";

/**
 * THE SKILL TREE — one LINE a turret, ten nodes long, bought with the
 * points the level track pays (economy.ts SKILL_POINT_LEVELS). A node
 * costs one point, belongs to exactly one turret, and improves every
 * turret of that kind on the board. See docs/skills.md.
 *
 * It is not upgrades.ts. Those branches are a different, shelved tree
 * dealt BY the track; nothing about them is read here.
 */

/** the chip face a node wears — its effect, in three or four letters */
export type SkillTag =
  | "RATE"
  | "DMG"
  | "RNG"
  | "BLAST"
  | "ARM"
  | "PIERCE"
  | "AIM"
  | "TURN"
  | "HEAL"
  | "ULT";

export interface SkillNode {
  id: string;
  turret: TowerKind;
  /** 1..RUNGS_PER_TURRET — its place in the chain, and its only gate */
  rung: number;
  name: string;
  blurb: string;
  tag: SkillTag;
  apply: (s: TowerStats) => TowerStats;
}

/** how long every line is, and the one number the board's row sizes to */
export const RUNGS_PER_TURRET = 10;

/** what one node costs, in points */
export const NODE_COST = 1;

// ---------------------------------------------------------------------------
// the stat surgery — the composed helpers live in upgrades.ts and are shared
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

const mending = (s: TowerStats, mul: number): TowerStats =>
  s.heal ? { ...s, heal: { ...s.heal, percent: s.heal.percent * mul } } : s;

// ---------------------------------------------------------------------------
// the node builders — a line is written as ten of these
// ---------------------------------------------------------------------------

type Spec = Omit<SkillNode, "id" | "turret" | "rung">;

const rate = (pct: number): Spec => ({
  name: "Rate of Fire",
  blurb: `+${pct}% attack speed.`,
  tag: "RATE",
  apply: (s) => faster(s, 1 + pct / 100),
});

const dmg = (pct: number): Spec => ({
  name: "Payload",
  blurb: `+${pct}% damage, blast included.`,
  tag: "DMG",
  apply: (s) => stronger(s, 1 + pct / 100),
});

const rng = (pct: number): Spec => ({
  name: "Reach",
  blurb: `+${pct}% range, and the shot flies as far.`,
  tag: "RNG",
  apply: (s) => reaching(s, 1 + pct / 100),
});

const blast = (pct: number): Spec => ({
  name: "Blast Radius",
  blurb: `+${pct}% splash radius.`,
  tag: "BLAST",
  apply: (s) => wider(s, 1 + pct / 100),
});

const plate = (add: number): Spec => ({
  name: "Plating",
  blurb: `+${add} armour on every turret of this kind.`,
  tag: "ARM",
  apply: (s) => armored(s, add),
});

const pierce = (extra: number): Spec => ({
  name: "Pierce",
  blurb: `Shots punch through ${extra} more ${extra === 1 ? "body" : "bodies"}.`,
  tag: "PIERCE",
  apply: (s) => piercing(s, extra),
});

const aim = (pct: number): Spec => ({
  name: "Stabilisers",
  blurb: `${pct}% less scatter on every shot.`,
  tag: "AIM",
  apply: (s) => steadier(s, 1 - pct / 100),
});

const turn = (pct: number): Spec => ({
  name: "Servos",
  blurb: `+${pct}% traverse — the barrel comes onto a target sooner.`,
  tag: "TURN",
  apply: (s) => swifter(s, 1 + pct / 100),
});

const heal = (pct: number): Spec => ({
  name: "Pulse Output",
  blurb: `+${pct}% healing a pulse.`,
  tag: "HEAL",
  apply: (s) => mending(s, 1 + pct / 100),
});

/** the tenth rung: authored per turret, and the only one with a name of
 *  its own */
const ult = (name: string, blurb: string, apply: (s: TowerStats) => TowerStats): Spec => ({
  name,
  blurb,
  tag: "ULT",
  apply,
});

// ---------------------------------------------------------------------------
// THE LINES — ten a turret, in the order they are bought
// ---------------------------------------------------------------------------

const LINES: Record<TowerKind, readonly Spec[]> = {
  tacker: [
    rate(20), dmg(20), pierce(1), rng(10), rate(25), plate(2), dmg(25), aim(30), rate(30),
    ult("Swarm Fire", "+60% attack speed and shots punch through two more bodies.",
      (s) => piercing(faster(s, 1.6), 2)),
  ],
  lobber: [
    dmg(20), blast(15), rng(12), rate(20), dmg(25), plate(3), blast(20), rate(25), rng(15),
    ult("Saturation Shell", "+60% damage over a blast half again as wide.",
      (s) => wider(stronger(s, 1.6), 1.5)),
  ],
  autocannon: [
    rate(20), dmg(20), pierce(1), aim(25), rate(25), plate(3), dmg(25), rng(12), rate(25),
    ult("Belt Feed", "+70% attack speed, and the barrel swings half again as fast.",
      (s) => swifter(faster(s, 1.7), 1.5)),
  ],
  airburst: [
    dmg(20), blast(20), rate(20), rng(12), dmg(25), plate(3), blast(20), rate(25), aim(30),
    ult("Proximity Curtain", "+50% damage over a blast 60% wider.",
      (s) => wider(stronger(s, 1.5), 1.6)),
  ],
  cleaver: [
    dmg(20), rng(12), rate(20), pierce(1), dmg(25), plate(4), rate(25), rng(15), turn(25),
    ult("Whetted Edge", "+70% damage and the beam reaches 25% further.",
      (s) => reaching(stronger(s, 1.7), 1.25)),
  ],
  torch: [
    rate(20), dmg(25), rng(10), plate(3), rate(25), dmg(25), turn(30), rng(12), plate(4),
    ult("Pyratite Feed", "+80% damage and half again the reach.",
      (s) => reaching(stronger(s, 1.8), 1.5)),
  ],
  coil: [
    dmg(20), rng(12), rate(20), pierce(1), dmg(25), plate(3), rate(25), rng(15), aim(30),
    ult("Cascade", "+70% damage and shots arc through three more bodies.",
      (s) => piercing(stronger(s, 1.7), 3)),
  ],
  piercer: [
    dmg(25), rng(15), rate(15), pierce(1), dmg(25), plate(4), rng(15), rate(20), aim(30),
    ult("Focused Optics", "+80% damage and a third more range.",
      (s) => reaching(stronger(s, 1.8), 1.33)),
  ],
  barrage: [
    dmg(20), blast(15), rate(20), rng(12), dmg(25), plate(4), blast(20), rate(25), aim(25),
    ult("Plastanium Rounds", "+60% damage and a blast 60% wider.",
      (s) => wider(stronger(s, 1.6), 1.6)),
  ],
  douser: [
    rate(20), dmg(20), rng(12), plate(3), rate(25), dmg(25), turn(25), rng(15), plate(4),
    ult("Cryofluid", "+70% damage and a third more reach.",
      (s) => reaching(stronger(s, 1.7), 1.33)),
  ],
  tether: [
    rng(15), dmg(20), rate(20), plate(3), rng(15), dmg(25), aim(30), rate(25), plate(4),
    ult("Phase Aperture", "+70% damage and half again the reach.",
      (s) => reaching(stronger(s, 1.7), 1.5)),
  ],
  deluge: [
    rate(20), dmg(20), rng(12), blast(15), rate(25), plate(4), dmg(25), rng(15), turn(25),
    ult("Flood Chamber", "+60% attack speed and +40% damage.",
      (s) => stronger(faster(s, 1.6), 1.4)),
  ],
  fixer: [
    heal(20), rng(15), rate(20), plate(3), heal(20), rng(15), rate(20), plate(4), heal(25),
    ult("Overdrive Coils", "+60% healing a pulse, delivered 40% faster.",
      (s) => mending(faster(s, 1.4), 1.6)),
  ],
  restorer: [
    heal(20), rng(15), rate(20), plate(3), heal(20), rng(15), rate(20), plate(4), heal(25),
    ult("Phase Weave", "+70% healing a pulse over a third more ground.",
      (s) => reaching(mending(s, 1.7), 1.33)),
  ],
  hive: [
    dmg(20), rate(20), rng(12), blast(15), dmg(25), plate(4), rate(25), rng(15), blast(20),
    ult("Warhead Racks", "+60% damage and a blast half again as wide.",
      (s) => wider(stronger(s, 1.6), 1.5)),
  ],
  whirl: [
    rate(20), dmg(20), blast(15), rng(12), rate(25), plate(4), dmg(25), aim(30), blast(20),
    ult("Surge Belt", "+70% attack speed and +40% damage.",
      (s) => stronger(faster(s, 1.7), 1.4)),
  ],
  repeater: [
    rate(20), dmg(20), pierce(1), rng(12), rate(25), plate(5), dmg(25), aim(25), turn(25),
    ult("Surge Bases", "+70% attack speed and shots punch through two more bodies.",
      (s) => piercing(faster(s, 1.7), 2)),
  ],
  furnace: [
    dmg(25), rate(15), rng(12), blast(15), dmg(25), plate(5), rate(20), rng(15), blast(20),
    ult("Phase Loop", "+80% damage over a blast 60% wider.",
      (s) => wider(stronger(s, 1.8), 1.6)),
  ],
  railhead: [
    dmg(25), rng(15), rate(15), pierce(1), dmg(25), plate(5), rng(15), rate(20), aim(30),
    ult("Surge Capacitors", "+90% damage and shots pass through three more bodies.",
      (s) => piercing(stronger(s, 1.9), 3)),
  ],
  duster: [
    rate(20), dmg(20), rng(12), blast(15), rate(25), plate(2), dmg(25), aim(25), rng(15),
    ult("Saturated Dust", "+60% damage over a blast half again as wide.",
      (s) => wider(stronger(s, 1.6), 1.5)),
  ],
  blighter: [
    dmg(20), rate(20), blast(15), rng(12), dmg(25), plate(3), rate(25), blast(20), rng(15),
    ult("Virulence", "+70% damage and a blast 60% wider.",
      (s) => wider(stronger(s, 1.7), 1.6)),
  ],
  drifter: [
    dmg(20), rng(15), rate(20), blast(15), dmg(25), plate(4), rng(15), rate(25), aim(25),
    ult("Drift Bloom", "+60% damage and half again the reach.",
      (s) => reaching(stronger(s, 1.6), 1.5)),
  ],
  stinger: [
    dmg(25), rate(15), rng(15), pierce(1), dmg(25), plate(5), rate(20), rng(15), aim(30),
    ult("Envenomed Core", "+80% damage and shots punch through two more bodies.",
      (s) => piercing(stronger(s, 1.8), 2)),
  ],
};

/** one turret's chain, in buy order */
export const SKILL_LINES: Record<TowerKind, readonly SkillNode[]> = (() => {
  const out = {} as Record<TowerKind, readonly SkillNode[]>;
  for (const kind of TOWER_KINDS)
    out[kind] = LINES[kind].map((spec, i) => ({
      ...spec,
      id: `${kind}-${i + 1}`,
      turret: kind,
      rung: i + 1,
    }));
  return out;
})();

/** THE LINES ARE A FIXED LENGTH — the board draws ten cells a row */
(() => {
  for (const kind of TOWER_KINDS)
    if (SKILL_LINES[kind].length !== RUNGS_PER_TURRET)
      throw new Error(`${kind}'s skill line has ${SKILL_LINES[kind].length} nodes, not ${RUNGS_PER_TURRET}`);
})();

/** how many points a line can ever take */
export const LINE_COST = RUNGS_PER_TURRET * NODE_COST;

/** the rows the board draws, in the roster's own order */
export const SKILL_TURRETS: readonly TowerKind[] = FIELDED_KINDS;

/** how many rungs a save has bought on every line, keyed by turret */
export type SkillPoints = Partial<Record<TowerKind, number>>;

export const NO_SKILLS: SkillPoints = {};

/** the rungs bought on one line, clamped into the line */
export const rungsOn = (skills: SkillPoints | undefined, kind: TowerKind): number =>
  Math.max(0, Math.min(RUNGS_PER_TURRET, Math.floor(skills?.[kind] ?? 0)));

/** every point a spread has spent */
export function spentSkillPoints(skills: SkillPoints | undefined): number {
  let total = 0;
  for (const kind of TOWER_KINDS) total += rungsOn(skills, kind) * NODE_COST;
  return total;
}

/**
 * The turret with its bought rungs folded in, applied over whatever the
 * rest of the tech (upgrades.ts) already composed. Returns `base`
 * untouched when the line is unbought, so an unspent save pays nothing.
 */
export function skilledTower(kind: TowerKind, rungs: number, base: TowerStats): TowerStats {
  const n = Math.max(0, Math.min(RUNGS_PER_TURRET, Math.floor(rungs)));
  if (n === 0) return base;
  const line = SKILL_LINES[kind];
  let s = base;
  for (let i = 0; i < n; i++) s = line[i].apply(s);
  return s;
}

/** the stats one line's first `rungs` nodes make of the stock turret —
 *  what the board prints beside a row */
export const skilledStock = (kind: TowerKind, rungs: number): TowerStats =>
  skilledTower(kind, rungs, TOWERS[kind]);
