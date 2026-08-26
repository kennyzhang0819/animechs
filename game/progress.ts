import { LEVELS, UNIT_KINDS, UNIT_STATS, levelById } from "./levels";
import { buyState, nodeById, techState, type TechState } from "./tech";

/**
 * The player's persistent campaign state: banked scrap, cleared levels, and
 * owned tech nodes. Lives in localStorage — the game is client-only — and
 * every reader goes through loadProgress() so a wiped or mangled save
 * degrades to a fresh campaign instead of a crash.
 */
export interface Progress {
  scrap: number;
  /** cleared level ids ("1-1", ...) — clearing level i unlocks level i+1 */
  completed: string[];
  /** owned tech node ids (see tech.ts) */
  nodes: string[];
}

const KEY = "dagger-problem.progress.v1";

const fresh = (): Progress => ({ scrap: 0, completed: [], nodes: [] });

export function loadProgress(): Progress {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fresh();
    const p = JSON.parse(raw) as Partial<Progress>;
    return {
      scrap: typeof p.scrap === "number" && p.scrap >= 0 ? Math.floor(p.scrap) : 0,
      completed: Array.isArray(p.completed) ? p.completed.filter((id) => levelById(String(id))) : [],
      nodes: Array.isArray(p.nodes) ? p.nodes.filter((id) => nodeById(String(id))) : [],
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
  return techState(p.nodes);
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

/** scrap the kills of a run are worth, before bonuses and economy nodes */
export function scrapForKills(killsByKind: ArrayLike<number>): number {
  let s = 0;
  for (let i = 0; i < UNIT_KINDS.length; i++)
    s += (killsByKind[i] ?? 0) * UNIT_STATS[UNIT_KINDS[i]].scrap;
  return s;
}

export interface RunReward {
  killScrap: number;
  clearBonus: number;
  perfectBonus: number;
  /** what the economy nodes added on top of the three above */
  incomeBonus: number;
  total: number;
  firstClear: boolean;
}

/**
 * Settle a finished run into the save: kills always pay (defeat included),
 * a win adds the level's clear bonus, a win with nothing leaked adds half
 * of it again, and economy nodes multiply the lot. Marks the level cleared
 * on a win. Returns the breakdown for the results screen.
 */
export function grantRunReward(
  levelId: string,
  killsByKind: ArrayLike<number>,
  won: boolean,
  perfect: boolean,
): RunReward {
  const level = levelById(levelId);
  const p = loadProgress();
  const killScrap = scrapForKills(killsByKind);
  const clearBonus = won && level ? level.clearBonus : 0;
  const perfectBonus = won && perfect && level ? Math.floor(level.clearBonus / 2) : 0;
  const base = killScrap + clearBonus + perfectBonus;
  const total = Math.floor(base * techOf(p).incomeMult);
  const firstClear = won && !p.completed.includes(levelId);
  p.scrap += total;
  if (firstClear) p.completed.push(levelId);
  saveProgress(p);
  return { killScrap, clearBonus, perfectBonus, incomeBonus: total - base, total, firstClear };
}

/** buy a tech node if affordable and its parent is owned; null = refused */
export function buyNode(nodeId: string): Progress | null {
  const node = nodeById(nodeId);
  if (!node) return null;
  const p = loadProgress();
  if (buyState(node, new Set(p.nodes), p.scrap) !== "ok") return null;
  p.scrap -= node.cost;
  p.nodes.push(nodeId);
  saveProgress(p);
  return p;
}
