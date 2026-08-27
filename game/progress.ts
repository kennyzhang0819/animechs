import { UNIT_KINDS, unitDrop, WORLDS, worldById } from "./levels";
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
import { techNode, techPrice, techState, type TechLevels, type TechState } from "./tech";
import { TOWER_KINDS, type TowerKind } from "./types";

/**
 * The player's persistent campaign state: a bank of every currency, cleared
 * levels, and tech points per turret. Lives in localStorage — the game is
 * client-only — and every reader goes through loadProgress() so a wiped or
 * mangled save degrades to a fresh campaign instead of a crash.
 */
export interface Progress {
  /** one balance per currency; see items.ts for what drops which */
  bank: Bank;
  /** cleared world ids ("1", ...) — clearing world N unlocks world N+1 */
  completed: string[];
  /** tech points per turret — a node's points are its placement capacity */
  tech: TechLevels;
}

const KEY = "dagger-problem.progress.v1";

/** the duo comes free and pre-unlocked, and a fresh save can place ten of
 * them: the opening loadout is the whole starting budget, so world 1 is
 * survivable with nothing bought and the tree sells everything past duos */
const DUO_START = 10;

/** every currency starts empty — kills are the only income, so the first
 * purchase of the campaign is paid for by the first waves the duos kill */
const freshBank = (): Bank => emptyBank();

const fresh = (): Progress => ({ bank: freshBank(), completed: [], tech: { duo: DUO_START } });

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
    // this also migrates saves from before the per-turret point model
    tech.duo = Math.max(tech.duo ?? 0, DUO_START);
    return {
      bank: readBank(p),
      completed: Array.isArray(p.completed) ? p.completed.filter((id) => worldById(String(id))) : [],
      tech,
    };
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
 * Strict campaign order: world 1 is always open, and every later world opens
 * when the one before it is cleared.
 */
export function isWorldUnlocked(p: Progress, worldId: string): boolean {
  const i = WORLDS.findIndex((w) => w.id === worldId);
  if (i < 0) return false;
  return i === 0 || p.completed.includes(WORLDS[i - 1].id);
}

/** a world is beaten once its run has been won (tech.ts gates off this) */
export function isWorldBeaten(p: Progress, worldId: number): boolean {
  return p.completed.includes(String(worldId));
}

/**
 * What a tree node can do right now. "hidden" nodes (parent unbought) are
 * not drawn at all; "locked-world" nodes are drawn dimmed with the world
 * they wait for; the rest differ only by affordability.
 */
export type NodeStatus = "buyable" | "poor" | "locked-world" | "hidden";

export function nodeStatus(p: Progress, tower: TowerKind): NodeStatus {
  const def = techNode(tower);
  if (def.requires && (p.tech[def.requires] ?? 0) < 1) return "hidden";
  if (def.world && !isWorldBeaten(p, def.world)) return "locked-world";
  return canAfford(p.bank, techPrice(tower, p.tech[tower] ?? 0)) ? "buyable" : "poor";
}

/** put one point in a turret's node (unlock, or +1 capacity); null = refused */
export function buyTech(tower: TowerKind): Progress | null {
  const p = loadProgress();
  if (nodeStatus(p, tower) !== "buyable") return null;
  pay(p.bank, techPrice(tower, p.tech[tower] ?? 0));
  p.tech[tower] = (p.tech[tower] ?? 0) + 1;
  saveProgress(p);
  return p;
}

/**
 * The bundle a run's kills are worth. Each kind pays its own tier's item, so
 * the shape of this bundle is the shape of the wave that died: a pure
 * dagger push is scrap only, a fortress column is titanium only.
 */
export function dropsForKills(killsByKind: ArrayLike<number>): Cost {
  const total: Cost = {};
  for (let i = 0; i < UNIT_KINDS.length; i++)
    addScaled(total, unitDrop(UNIT_KINDS[i]), killsByKind[i] ?? 0);
  return total;
}

export interface RunReward {
  /** everything the run banked, by currency */
  earned: Cost;
  firstClear: boolean;
}

/**
 * Settle a FINISHED run into the save. Kills are the only income — no clear
 * bonus — so a defeat still banks everything the towers killed on the way
 * down, in whatever currencies those kills happened to drop, and the reward
 * for winning is the next level, not a payout.
 *
 * Only call this on a run that reached its own end (won or lost): abandoning
 * mid-level is worth nothing, which is why the UI settles from the win/loss
 * state and never on the way out to the menu.
 */
export function grantRunReward(
  worldId: string,
  killsByKind: ArrayLike<number>,
  won: boolean,
): RunReward {
  const p = loadProgress();
  const earned = dropsForKills(killsByKind);
  const firstClear = won && !p.completed.includes(worldId);
  credit(p.bank, earned);
  if (firstClear) p.completed.push(worldId);
  saveProgress(p);
  return { earned, firstClear };
}
