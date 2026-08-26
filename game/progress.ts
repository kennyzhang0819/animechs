import { LEVELS, UNIT_KINDS, UNIT_STATS, WORLDS, levelById } from "./levels";
import { TECH_PRICE, techNode, techState, type TechLevels, type TechState } from "./tech";
import { TOWER_KINDS, type TowerKind } from "./types";

/**
 * The player's persistent campaign state: banked scrap, cleared levels, and
 * tech points per turret. Lives in localStorage — the game is client-only —
 * and every reader goes through loadProgress() so a wiped or mangled save
 * degrades to a fresh campaign instead of a crash.
 */
export interface Progress {
  scrap: number;
  /** cleared level ids ("1-1", ...) — clearing level i unlocks level i+1 */
  completed: string[];
  /** tech points per turret — a node's points are its placement capacity */
  tech: TechLevels;
}

const KEY = "dagger-problem.progress.v1";

/** duo is the free starter kit — a fresh save can already place a line */
const DUO_START = 6;

const fresh = (): Progress => ({ scrap: 0, completed: [], tech: { duo: DUO_START } });

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
      completed: Array.isArray(p.completed) ? p.completed.filter((id) => levelById(String(id))) : [],
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
 * Strict campaign order: the first level is always open, every other level
 * opens when the one before it in LEVELS is cleared — which also makes each
 * world wait for the previous world's last level.
 */
export function isLevelUnlocked(p: Progress, levelId: string): boolean {
  const i = LEVELS.findIndex((l) => l.id === levelId);
  if (i < 0) return false;
  return i === 0 || p.completed.includes(LEVELS[i - 1].id);
}

/** a world is beaten once every one of its levels is cleared */
export function isWorldBeaten(p: Progress, worldId: number): boolean {
  const w = WORLDS.find((w) => w.id === worldId);
  return !!w && w.levels.every((l) => p.completed.includes(l.id));
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
  return p.scrap >= TECH_PRICE ? "buyable" : "poor";
}

/** put one point in a turret's node (unlock, or +1 capacity); null = refused */
export function buyTech(tower: TowerKind): Progress | null {
  const p = loadProgress();
  if (nodeStatus(p, tower) !== "buyable") return null;
  p.scrap -= TECH_PRICE;
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
  killScrap: number;
  clearBonus: number;
  total: number;
  firstClear: boolean;
}

/**
 * Settle a finished run into the save: kills always pay (defeat included)
 * and a win adds the level's clear bonus. Marks the level cleared on a win.
 * Returns the breakdown for the results screen.
 */
export function grantRunReward(
  levelId: string,
  killsByKind: ArrayLike<number>,
  won: boolean,
): RunReward {
  const level = levelById(levelId);
  const p = loadProgress();
  const killScrap = scrapForKills(killsByKind);
  const clearBonus = won && level ? level.clearBonus : 0;
  const total = killScrap + clearBonus;
  const firstClear = won && !p.completed.includes(levelId);
  p.scrap += total;
  if (firstClear) p.completed.push(levelId);
  saveProgress(p);
  return { killScrap, clearBonus, total, firstClear };
}
