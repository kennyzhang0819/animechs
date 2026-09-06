import { dropsForKills, WORLD, WORLDS } from "./levels";
import { RUNG_COUNT, tierXpBonus, TOP_TIER } from "./ladder";
import { FIRST_CLEAR_XP, levelForXp } from "./economy";
import { MAX_LEVEL, techStateFor, worldUnlockLevel } from "./track";
import type { TechState } from "./tech";
import { clearSave, readSave, writeSave } from "./storage";
import { TOWER_KINDS, type TowerKind } from "./types";

/**
 * The player's persistent campaign state: lifetime XP, and how far up
 * each world's ladder they have climbed. Lives in ONE SAVE SLOT
 * (storage.ts: localStorage in a browser, a file under the desktop shell)
 * and every reader goes through loadProgress() so a wiped or mangled save
 * degrades to a fresh campaign instead of a crash.
 */
export interface Progress {
  /**
   * LIFETIME XP, the save's one number. Every kill pays its tier's XP,
   * the rung multiplies it, a first clear adds a bonus (grantRunReward),
   * and it only ever goes up. The player's LEVEL is read off it through
   * the curve in economy.ts, and the level is a rung on the track
   * (track.ts) — every map, pace and upgrade the save has is a function
   * of this number. Nothing is stored twice.
   */
  xp: number;
  /**
   * HOW FAR UP EACH WORLD'S OWN LADDER THIS SAVE HAS CLIMBED, keyed by
   * world id. On a world with value `c`, rungs 0..c-1 are beaten and rung
   * `c` is that world's frontier — the highest it will let you attempt. `c`
   * reaching RUNG_COUNT means that world's ladder, as authored today, is
   * finished.
   *
   * ONE NUMBER PER WORLD, NOT ONE FOR THE SAVE. Clearing rung 6 somewhere
   * says nothing about anywhere else: every world is climbed from the
   * bottom. A world absent from this record has never been won on and
   * reads 0.
   */
  clearedByMap: Record<string, number>;
  /**
   * WHICH SAVE FORMAT THIS FILE WAS WRITTEN IN — see SAVE_VERSION. Absent
   * means "written before the format was versioned".
   */
  saveVersion?: number;
  /**
   * The fast-forward multiplier the player last picked, kept so a run does
   * not start at 1x every single time. A pace is a preference about how the
   * player wants to spend their minutes, not a fact about the run. What the
   * save is ALLOWED to run at is the track's business: see startingSpeed.
   */
  speed?: number;
  /** the HUD's top-left panel collapsed to its one-line wave counter */
  hudMinimized?: boolean;
  /**
   * Ambient effects — the particle work, and nothing a weapon is made of
   * (see Sim.setEffects). Absent means ON; only an explicit `false` is off.
   */
  effects?: boolean;
  /** the in-game HUD's size, as the --ui-scale multiplier — one of UI_SCALES */
  uiScale?: number;
  /**
   * The build bar's loadout: which turrets ride in it. A SET in effect —
   * the bar always renders in the roster's canonical order
   * (BY_MINDUSTRY_VALUE in tech.ts), whatever order this holds. Absent on
   * a save that has never curated, which reads as "the whole roster".
   */
  loadout?: TowerKind[];
  /**
   * THIS SAVE HAS DECLINED THE DEV GRANT — the wipe's half of the back
   * door (see resetProgress and DEV_UNLOCK_ALL). A wiped save on a dev
   * build would otherwise play at the top of the track again on the next
   * load.
   */
  devGrantOff?: boolean;
}

/** one emplacement, as the game reports the board: what, and which cell */
export interface TowerPlacement {
  kind: TowerKind;
  gx: number;
  gy: number;
}

/**
 * THE SAVE FORMAT'S VERSION, bumped whenever a stored field changes
 * meaning. Version 3 dropped the purchased tech tree: a save's XP is now
 * the whole of its progress, and a file from before carries its XP across
 * and loses nothing else worth keeping.
 */
const SAVE_VERSION = 3;

const fresh = (): Progress => ({
  xp: 0,
  clearedByMap: {},
});

/**
 * THE DEV SWITCH: on a dev build every save plays at the top of the track
 * — every map open, every pace, every upgrade — so any map and any rung
 * can be reached without grinding first. Never in production. Its effect
 * is read at effectiveLevel and NEVER written into a save.
 */
const DEV_UNLOCK_ALL = true;

const devUnlocking = (p?: { devGrantOff?: boolean }): boolean =>
  DEV_UNLOCK_ALL && process.env.NODE_ENV !== "production" && !p?.devGrantOff;

function readClearedByMap(p: { clearedByMap?: unknown; cleared?: unknown }): Record<string, number> {
  const out: Record<string, number> = {};
  const raw = p.clearedByMap;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
      if (!WORLDS.some((w) => w.id === id)) continue;
      if (typeof v === "number" && v > 0) out[id] = Math.floor(v);
    }
    return out;
  }
  // the pre-ladder save carried one number for the first world
  if (typeof p.cleared === "number" && p.cleared > 0) out[WORLD.id] = Math.floor(p.cleared);
  return out;
}

/** every pace a save might have stored — the track's, plus what sandbox offers */
const ALL_SPEEDS: readonly number[] = [1, 2, 4, 8, 16];

function readSpeed(p: { speed?: unknown }): number | undefined {
  const s = p.speed;
  return typeof s === "number" && ALL_SPEEDS.includes(s) ? s : undefined;
}

export const UI_SCALES = [0.75, 0.85, 1, 1.15] as const;
export const UI_SCALE_DEFAULT = 1;

function readUiScale(p: { uiScale?: unknown }): number | undefined {
  const s = p.uiScale;
  return typeof s === "number" && (UI_SCALES as readonly number[]).includes(s) ? s : undefined;
}

/**
 * What a save from before the track is worth in XP: every first clear it
 * recorded, at the rung's bonus. Its stored XP is kept where it is the
 * larger — a save never loses level on a format change.
 */
function clearsXp(clearedByMap: Record<string, number>): number {
  let clears = 0;
  for (const c of Object.values(clearedByMap))
    for (let tier = 0; tier < Math.min(c, RUNG_COUNT); tier++)
      clears += FIRST_CLEAR_XP * tierXpBonus(tier);
  return Math.round(clears);
}

export function loadProgress(): Progress {
  try {
    const raw = readSave();
    if (!raw) return fresh();
    const p = JSON.parse(raw) as Partial<Progress> & { cleared?: unknown };
    const clearedByMap = readClearedByMap(p);
    const version = typeof p.saveVersion === "number" ? p.saveVersion : 0;
    const migrated = version < SAVE_VERSION;
    const stored = typeof p.xp === "number" && p.xp > 0 ? Math.floor(p.xp) : 0;
    const xp = migrated ? Math.max(stored, clearsXp(clearedByMap)) : stored;
    const loaded: Progress = {
      xp,
      clearedByMap,
      speed: readSpeed(p),
      hudMinimized: p.hudMinimized === true,
      // absent means ON — only an explicit false switches them off
      effects: p.effects !== false,
      uiScale: readUiScale(p),
      loadout: readLoadout(p),
      ...(p.devGrantOff === true ? { devGrantOff: true } : null),
    };
    // a migrated save is rewritten here rather than re-converted on every
    // load: loadProgress runs on a timer during a run
    if (migrated) saveProgress(loaded);
    return loaded;
  } catch {
    return fresh();
  }
}

/** the bar's curation out of a raw save: known turrets only, deduped */
function readLoadout(p: { loadout?: unknown }): TowerKind[] | undefined {
  const raw = p.loadout;
  if (!Array.isArray(raw)) return undefined;
  const known = new Set<string>(TOWER_KINDS);
  const out = [...new Set(raw.filter((k): k is TowerKind => typeof k === "string" && known.has(k)))];
  return out;
}

export function saveLoadout(kinds: readonly TowerKind[]): void {
  const p = loadProgress();
  saveProgress({ ...p, loadout: [...kinds] });
}

export function saveSpeed(mult: number): void {
  const p = loadProgress();
  if (p.speed === mult) return;
  saveProgress({ ...p, speed: mult });
}

export function saveHudMinimized(min: boolean): void {
  const p = loadProgress();
  if ((p.hudMinimized ?? false) === min) return;
  saveProgress({ ...p, hudMinimized: min });
}

export function saveEffects(on: boolean): void {
  const p = loadProgress();
  if ((p.effects ?? true) === on) return;
  saveProgress({ ...p, effects: on });
}

export function saveUiScale(scale: number): void {
  const p = loadProgress();
  if ((p.uiScale ?? UI_SCALE_DEFAULT) === scale) return;
  saveProgress({ ...p, uiScale: scale });
}

/**
 * The pace a run should open at: the save's remembered choice, if the
 * track allows it, else the fastest allowed pace at or under it.
 */
export function startingSpeed(p: Progress, allowed: readonly number[]): number {
  const want = p.speed ?? 1;
  if (allowed.includes(want)) return want;
  let best = 1;
  for (const m of allowed) if (m <= want && m > best) best = m;
  return best;
}

export function saveProgress(p: Progress): void {
  try {
    const out: Progress = { ...p, saveVersion: SAVE_VERSION };
    writeSave(JSON.stringify(out));
  } catch {
    // private windows / blocked storage: the run still plays, nothing sticks
  }
}

/**
 * WIPE THE SAVE — and mean it, on a dev build too. A wipe under the dev
 * switch stores one fresh save carrying `devGrantOff` — an empty campaign
 * that says the grant is not wanted here — instead of storing nothing.
 */
export function resetProgress(): void {
  try {
    clearSave();
    if (devUnlocking()) saveProgress({ ...fresh(), devGrantOff: true });
  } catch {
    // ignore — same storage caveat as saveProgress
  }
}

// ---------- the level ----------

/** the player's level, read off lifetime XP — what the strip prints */
export const levelOf = (p: Progress): number => levelForXp(p.xp);

/**
 * THE LEVEL THE SAVE PLAYS AT: its real one, or the top of the track
 * while the dev switch is on. Every question about what the save may do
 * — which maps, which paces, which upgrades — is asked of this, and the
 * printed level (levelOf) stays honest underneath.
 */
export const effectiveLevel = (p: Progress): number =>
  devUnlocking(p) ? MAX_LEVEL : levelOf(p);

/** what the run may do, as the sim and the bar want it — the track at the save's level */
export function techOf(p: Progress): TechState {
  return techStateFor(effectiveLevel(p));
}

// ---------- the ladder ----------

/** how many rungs this save has cleared on one world */
export const clearedOn = (p: Progress, worldId: string): number =>
  Math.max(0, Math.floor(p.clearedByMap[worldId] ?? 0));

/**
 * The highest rung that can be attempted on a world: every cleared one,
 * plus the frontier. A player may replay any rung below it — a cleared
 * rung pays its kills' XP like any other, only the first-clear bonus is
 * gone — but only the frontier moves the ladder forward.
 */
export const topTier = (p: Progress, worldId: string): number =>
  Math.min(TOP_TIER, clearedOn(p, worldId));

/** the best any world has done — the save's own high-water mark */
export const bestTierCleared = (p: Progress): number =>
  Object.values(p.clearedByMap).reduce((a, b) => Math.max(a, Math.floor(b)), 0);

/** has this world's whole ladder been beaten? */
export const isCampaignComplete = (p: Progress, worldId: string): boolean =>
  clearedOn(p, worldId) >= RUNG_COUNT;

/** has this rung been beaten? (the frontier itself has not) */
export const isTierCleared = (p: Progress, worldId: string, tier: number): boolean =>
  tier < clearedOn(p, worldId);

/** may this rung be played at all? */
export const isTierUnlocked = (p: Progress, worldId: string, tier: number): boolean =>
  tier >= 0 && tier <= topTier(p, worldId);

/**
 * WHAT IS STILL STANDING BETWEEN THIS SAVE AND A MAP — the level the
 * track opens it at, or null when the map is open. Returns the level
 * rather than a boolean because every caller that cares needs to SAY it.
 */
export const worldLock = (p: Progress, worldId: string): { level: number } | null => {
  const level = worldUnlockLevel(worldId);
  return effectiveLevel(p) >= level ? null : { level };
};

/** may this map be entered at all? */
export const isWorldUnlocked = (p: Progress, worldId: string): boolean =>
  worldLock(p, worldId) == null;

// ---------- settling a run ----------

export interface RunReward {
  /** XP the kills paid, rung bonus included */
  xp: number;
  /** the first-clear bonus, rung bonus included — 0 on a replay or a loss */
  firstClearXp: number;
  /** everything the run banked */
  total: number;
  /** the XP multiplier the rung carried */
  xpBonus: number;
  /** the rung that was played, 0-based */
  tier: number;
  /** did this clear push THIS WORLD'S frontier up a rung? */
  firstClear: boolean;
  /** the world it was played on — its ladder is the one that moved */
  worldId: string;
  /** the player's level before and after the run banked */
  levelBefore: number;
  levelAfter: number;
}

/**
 * Settle a FINISHED run into the save.
 *
 * Kills are the income, so a defeat still banks the XP for everything the
 * towers killed on the way down, times the rung's XP bonus. Clearing the
 * frontier rung for the first time pays FIRST_CLEAR_XP on top (times the
 * same bonus) and moves the frontier up one.
 *
 * NOTHING ACCRUES WHILE THE APP IS SHUT. There is no offline income and
 * no idle tick: every point of XP was paid for by a run somebody watched.
 *
 * Only call this on a run that reached its own end (won or lost):
 * abandoning mid-level is worth nothing, which is why the UI settles from
 * the win/loss state and never on the way out to the menu.
 */
export function grantRunReward(
  tier: number,
  killsByKind: ArrayLike<number>,
  won: boolean,
  worldId: string = WORLD.id,
): RunReward {
  const p = loadProgress();
  const n = Math.min(TOP_TIER, Math.max(0, Math.floor(tier)));
  // the frontier only ever moves forward, and only by one, so "this rung is
  // the frontier" is exactly "this (world, rung) has never been cleared"
  const firstClear = won && n >= clearedOn(p, worldId);
  const bonus = tierXpBonus(n);
  const xp = Math.round(dropsForKills(killsByKind).xp * bonus);
  const firstClearXp = firstClear ? Math.round(FIRST_CLEAR_XP * bonus) : 0;
  const levelBefore = levelOf(p);
  p.xp += xp + firstClearXp;
  if (firstClear) p.clearedByMap[worldId] = n + 1;
  saveProgress(p);
  return {
    xp,
    firstClearXp,
    total: xp + firstClearXp,
    xpBonus: bonus,
    tier: n,
    firstClear,
    worldId,
    levelBefore,
    levelAfter: levelOf(p),
  };
}

/** every world's clear count, for anything that wants to say how far the
 *  save has come in one line */
export const worldsCleared = (p: Progress): number =>
  WORLDS.filter((w) => isCampaignComplete(p, w.id)).length;
