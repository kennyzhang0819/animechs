import { UNIT_KINDS, unitDrop, WORLD } from "./levels";
import { startingDuos, tierDropBonus } from "./ladder";
import {
  addScaled,
  canAfford,
  credit,
  emptyBank,
  ITEM_KINDS,
  pay,
  type Bank,
  type Cost,
} from "./items";
import {
  affordablePoints as affordableTechPoints,
  techNode,
  techPrice,
  techState,
  type TechLevels,
  type TechState,
} from "./tech";
import { TOWER_KINDS, type TowerKind } from "./types";

/**
 * The player's persistent campaign state: a bank of every currency, how far
 * up the ladder they have climbed, and tech points per turret. Lives in
 * localStorage — the game is client-only — and every reader goes through
 * loadProgress() so a wiped or mangled save degrades to a fresh campaign
 * instead of a crash.
 */
export interface Progress {
  /** one balance per currency; see items.ts for what drops which */
  bank: Bank;
  /**
   * How many rungs of the ladder have been cleared: tiers 0 .. cleared-1
   * are beaten, and tier `cleared` is the frontier — the highest rung that
   * can be attempted, and the only one that still pays its first-clear
   * bonus. There is no top: clearing the frontier just moves it up one.
   */
  cleared: number;
  /** tech points per turret — a node's points are its placement capacity */
  tech: TechLevels;
}

const KEY = "dagger-problem.progress.v1";

/**
 * The free opening loadout, SOLVED from the baseline rather than picked:
 * enough duos to clear tier 0 outright with nothing bought (see
 * startingDuos). The core has one hit point, so a run demands a 100% kill
 * rate — a fresh save that cannot clear the first rung is not a challenge,
 * it is a die-and-grind loop with no way out, because kills are the only
 * income and a wipe on wave 1 banks almost nothing.
 *
 * Read off the SHIPPED baseline in code, never a level document: documents
 * load asynchronously and this is read the moment a save is opened.
 */
const DUO_START = startingDuos(WORLD);

/** every currency starts empty — kills are the only income, so the first
 * purchase of the campaign is paid for by the first waves the duos kill */
const freshBank = (): Bank => emptyBank();

const fresh = (): Progress => ({ bank: freshBank(), cleared: 0, tech: { duo: DUO_START } });

/**
 * Pull the wallet out of a raw save. Pre-currency saves stored a single
 * `scrap` number and no bank at all, so those migrate into the scrap
 * balance with every other currency starting at zero; anything missing or
 * malformed reads as empty rather than NaN.
 */
function readBank(p: { bank?: unknown; scrap?: unknown }): Bank {
  const bank = emptyBank();
  const raw = p.bank && typeof p.bank === "object" ? (p.bank as Record<string, unknown>) : null;
  if (raw) {
    for (const k of ITEM_KINDS) {
      const v = raw[k];
      if (typeof v === "number" && v > 0) bank[k] = Math.floor(v);
    }
  } else if (typeof p.scrap === "number" && p.scrap > 0) {
    bank.scrap = Math.floor(p.scrap); // legacy single-currency save
  }
  return bank;
}

/**
 * How far up the ladder a raw save has climbed. Saves written before the
 * ladder existed carry `completed: string[]` — a list of cleared WORLD ids
 * — and there is no honest conversion from "beat world 2" to a rung, so
 * every one of them lands on the frontier its world count suggests: one
 * rung per world cleared. That keeps a returning player's tech gates open
 * without inventing progress they never made.
 */
function readCleared(p: { cleared?: unknown; completed?: unknown }): number {
  if (typeof p.cleared === "number" && p.cleared > 0) return Math.floor(p.cleared);
  if (Array.isArray(p.completed)) return p.completed.length;
  return 0;
}

export function loadProgress(): Progress {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fresh();
    const p = JSON.parse(raw) as Partial<Progress> & { tech?: unknown; scrap?: unknown };
    const tech: TechLevels = {};
    if (p.tech && typeof p.tech === "object") {
      for (const k of TOWER_KINDS) {
        const v = (p.tech as Record<string, unknown>)[k];
        if (typeof v === "number" && v > 0) tech[k] = Math.floor(v);
      }
    }
    // duo can never legitimately sit below its free starting capacity —
    // this also migrates saves from before the per-turret point model, and
    // any save written while the baseline was tuned to a smaller loadout
    tech.duo = Math.max(tech.duo ?? 0, DUO_START);
    return { bank: readBank(p), cleared: readCleared(p), tech };
  } catch {
    return fresh();
  }
}

export function saveProgress(p: Progress): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // private windows / blocked storage: the run still plays, nothing sticks
  }
}

export function resetProgress(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore — same storage caveat as saveProgress
  }
}

export function techOf(p: Progress): TechState {
  return techState(p.tech);
}

/**
 * The highest rung that can be attempted: every cleared one, plus the
 * frontier. A player may replay any rung below it to farm — a cleared rung
 * pays exactly what it always did — but only the frontier moves the
 * campaign forward.
 */
export const topTier = (p: Progress): number => p.cleared;

/** has this rung been beaten? (the frontier itself has not) */
export const isTierCleared = (p: Progress, tier: number): boolean => tier < p.cleared;

/** may this rung be played at all? */
export const isTierUnlocked = (p: Progress, tier: number): boolean =>
  tier >= 0 && tier <= topTier(p);

/**
 * What a tree node can do right now. "hidden" nodes (parent unbought) are
 * not drawn at all; "locked-tier" nodes are drawn dimmed with the rung they
 * wait for; the rest differ only by affordability.
 */
export type NodeStatus = "buyable" | "poor" | "locked-tier" | "hidden";

export function nodeStatus(p: Progress, tower: TowerKind): NodeStatus {
  const def = techNode(tower);
  if (def.requires && (p.tech[def.requires] ?? 0) < 1) return "hidden";
  if (def.requiresTier != null && !isTierCleared(p, def.requiresTier)) return "locked-tier";
  return canAfford(p.bank, techPrice(tower, p.tech[tower] ?? 0)) ? "buyable" : "poor";
}

/**
 * How many more points this save could put into a node right now — the
 * price walk in tech.ts, plus the gates. `limit` caps it: the buy controls
 * ask for a specific step, and only "Max" wants the true ceiling.
 *
 * This exists because the volume turret is FLAT (tech.ts): at 8 scrap a
 * point a mid-campaign bank buys duos by the thousand, and a tree that could
 * only be clicked one point at a time would make the game's central action
 * its most tedious one.
 */
export function affordablePoints(p: Progress, tower: TowerKind, limit = Infinity): number {
  if (nodeStatus(p, tower) !== "buyable") return 0;
  return affordableTechPoints(p.bank, tower, p.tech[tower] ?? 0, limit);
}

/**
 * Put points into a turret's node — unlock, or +N capacity. Buys as many as
 * asked for OR as many as the wallet covers, whichever is fewer, and
 * returns null only when it could not buy a single one, so a "×100" that
 * can afford 37 lands 37 rather than refusing.
 */
export function buyTech(tower: TowerKind, count = 1): Progress | null {
  const p = loadProgress();
  const n = Math.min(Math.max(1, Math.floor(count)), affordablePoints(p, tower, count));
  if (n < 1) return null;
  for (let i = 0; i < n; i++) {
    const owned = p.tech[tower] ?? 0;
    pay(p.bank, techPrice(tower, owned));
    p.tech[tower] = owned + 1;
  }
  saveProgress(p);
  return p;
}

/**
 * The bundle a run's kills are worth before the ladder's multipliers. Each
 * kind pays its own tier's item, so the shape of this bundle is the shape of
 * the wave that died: a pure dagger push is scrap only, a spiroct column is
 * titanium only.
 */
export function dropsForKills(killsByKind: ArrayLike<number>): Cost {
  const total: Cost = {};
  for (let i = 0; i < UNIT_KINDS.length; i++)
    addScaled(total, unitDrop(UNIT_KINDS[i]), killsByKind[i] ?? 0);
  return total;
}

/** scale a bundle and floor it — items are whole things */
function scaleCost(cost: Cost, mul: number): Cost {
  const out: Cost = {};
  for (const k of ITEM_KINDS) {
    const v = cost[k];
    if (v) out[k] = Math.floor(v * mul);
  }
  return out;
}

export interface RunReward {
  /** everything the run banked, by currency, after every multiplier */
  earned: Cost;
  /** the rung that was played */
  tier: number;
  /** drop multiplier the rung itself carries */
  dropBonus: number;
  /** did this clear push the frontier up a rung? */
  firstClear: boolean;
}

/**
 * Settle a FINISHED run into the save.
 *
 * Kills are the only income, so a defeat still banks everything the towers
 * killed on the way down — in whatever currencies those kills happened to
 * drop — multiplied by the rung's own drop bonus. Clearing a rung for the
 * first time doubles that, and moves the frontier up one.
 *
 * Only call this on a run that reached its own end (won or lost):
 * abandoning mid-level is worth nothing, which is why the UI settles from
 * the win/loss state and never on the way out to the menu.
 */
export function grantRunReward(
  tier: number,
  killsByKind: ArrayLike<number>,
  won: boolean,
): RunReward {
  const p = loadProgress();
  const n = Math.max(0, Math.floor(tier));
  const firstClear = won && n >= p.cleared;
  // a rung pays the same whether or not it is new: what clearing the
  // frontier buys is the NEXT rung — more waves, more enemies, more kinds of
  // them — and that is the whole reason to push rather than farm
  const dropBonus = tierDropBonus(n);
  const earned = scaleCost(dropsForKills(killsByKind), dropBonus);
  credit(p.bank, earned);
  // the frontier only ever moves forward, and only by one: clearing tier 5
  // when tier 5 was the frontier opens tier 6, and replaying tier 2 later
  // does nothing
  if (firstClear) p.cleared = n + 1;
  saveProgress(p);
  return { earned, tier: n, dropBonus, firstClear };
}
