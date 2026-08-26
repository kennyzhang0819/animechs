import { UNIT_KINDS, UNIT_STATS, WORLDS, worldById } from "./levels";
import { techNode, techPrice, techState, type TechLevels, type TechState } from "./tech";
import { TOWER_KINDS, type TowerKind } from "./types";

/**
 * The player's persistent campaign state: banked scrap, cleared levels, and
 * tech points per turret. Lives in localStorage — the game is client-only —
 * and every reader goes through loadProgress() so a wiped or mangled save
 * degrades to a fresh campaign instead of a crash.
 */
export interface Progress {
  scrap: number;
  /** cleared world ids ("1", ...) — clearing world N unlocks world N+1 */
  completed: string[];
  /** tech points per turret — a node's points are its placement capacity */
  tech: TechLevels;
}

const KEY = "dagger-problem.progress.v1";

/** the duo comes free and pre-unlocked: a fresh save can place exactly
 * one, and the tech tree sells the rest (its first ten are 1 scrap each) */
const DUO_START = 1;

/** seed scrap: enough to buy out the 1-scrap duo rung before the first wave */
const SCRAP_START = 10;

const fresh = (): Progress => ({ scrap: SCRAP_START, completed: [], tech: { duo: DUO_START } });

export function loadProgress(): Progress {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fresh();
    const p = JSON.parse(raw) as Partial<Progress> & { tech?: unknown };
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
      scrap: typeof p.scrap === "number" && p.scrap >= 0 ? Math.floor(p.scrap) : 0,
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
  return p.scrap >= techPrice(tower, p.tech[tower] ?? 0) ? "buyable" : "poor";
}

/** put one point in a turret's node (unlock, or +1 capacity); null = refused */
export function buyTech(tower: TowerKind): Progress | null {
  const p = loadProgress();
  if (nodeStatus(p, tower) !== "buyable") return null;
  p.scrap -= techPrice(tower, p.tech[tower] ?? 0);
  p.tech[tower] = (p.tech[tower] ?? 0) + 1;
  saveProgress(p);
  return p;
}

/** scrap the kills of a run are worth */
export function scrapForKills(killsByKind: ArrayLike<number>): number {
  let s = 0;
  for (let i = 0; i < UNIT_KINDS.length; i++)
    s += (killsByKind[i] ?? 0) * UNIT_STATS[UNIT_KINDS[i]].scrap;
  return s;
}

export interface RunReward {
  total: number;
  firstClear: boolean;
}

/**
 * Settle a FINISHED run into the save. Kills are the only income — no clear
 * bonus — so a defeat still banks everything the towers killed on the way
 * down, and the reward for winning is the next level, not a payout.
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
  const total = scrapForKills(killsByKind);
  const firstClear = won && !p.completed.includes(worldId);
  p.scrap += total;
  if (firstClear) p.completed.push(worldId);
  saveProgress(p);
  return { total, firstClear };
}
