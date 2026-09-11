import { WORLD, WORLDS } from "./levels";
import { tierXpBonus, TOP_TIER } from "./ladder";
import { levelForXp, missionXp } from "./economy";
import { MAX_LEVEL, techStateFor, worldUnlockLevel } from "./track";
import { type TechState } from "./tech";
import { clearSave, readSave, writeSave } from "./storage";
import { type TowerKind } from "./types";

/**
 * WHEN A BODY WEARS ITS HEALTH — the Interface tab's two knobs, one for
 * the player's own and one for the swarm's (Game.setHealthBars). The same
 * three choices cover units and buildings alike, because "how much is
 * left of that" is one question whether the thing walks or stands:
 *
 * - `damaged` — only once something has taken a hit. The default, and the
 *   quiet one: a board at full health wears nothing
 * - `always`  — every body, all the time, full bars included
 * - `never`   — nothing on the field; the panel still says what the core
 *   and the bosses are on
 *
 * There was a fourth, `hover` — the one body under the cursor and nothing
 * else. It asked a player mid-wave to point at things one at a time to
 * learn what a glance is supposed to tell them, and it cost a hit test
 * against every living body every frame to answer.
 */
export type HealthBarMode = "damaged" | "always" | "never";

/** the three, in the order the Interface tab prints them: most bars to none */
export const HEALTH_BAR_MODES: ReadonlyArray<{ mode: HealthBarMode; label: string }> = [
  { mode: "always", label: "Always" },
  { mode: "damaged", label: "Damaged" },
  { mode: "never", label: "Never" },
];

/** absent from the save means this — the behaviour the game had before the knob */
export const HEALTH_BARS_DEFAULT: HealthBarMode = "damaged";

/**
 * The player's persistent campaign state: lifetime XP, and how far up
 * each world's ladder they have climbed. Lives in ONE SAVE SLOT
 * (storage.ts: localStorage in a browser, a file under the desktop shell)
 * and every reader goes through loadProgress() so a wiped or mangled save
 * degrades to a fresh campaign instead of a crash.
 */
export interface Progress {
  /**
   * LIFETIME XP, the save's one number. Every wave cleared pays its share
   * of the mission's pot (missionXp), the rung multiplies it, a random
   * map adds a quarter (grantRunReward), and it only ever goes up. The player's LEVEL is read off it through
   * the curve in economy.ts, and the level is a rung on the track
   * (track.ts) — every map, pace and upgrade the save has is a function
   * of this number. Nothing is stored twice.
   */
  xp: number;
  /**
   * THE BEST THIS SAVE HAS DONE ON EACH WORLD, keyed by world id: the
   * NUMBER of the highest level beaten there (1..RUNG_COUNT), so a world
   * whose value is 7 has had Level 7 cleared on it. Every level is open
   * from the first run — the ladder is not climbed one rung at a time any
   * more, and nothing is paid for a first clear — so this is a record and
   * never a gate: the map list prints it, and that is all it does. A world
   * absent from this record has never been won on and reads 0.
   *
   * ONE NUMBER PER WORLD, NOT ONE FOR THE SAVE: beating Level 7 somewhere
   * says nothing about anywhere else.
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
   * THE MENU'S LAST PICKS, so the start screen opens on what the player
   * played last rather than on Level 1 every launch. `difficulty` is the
   * rung index (0-based, see ladder.ts); `map` is a world id, and ABSENT
   * means Random — the default, and the pick that pays the bonus.
   */
  difficulty?: number;
  map?: string;
  /**
   * Ambient effects — the particle work, and nothing a weapon is made of
   * (see Sim.setEffects). Absent means ON; only an explicit `false` is off.
   */
  effects?: boolean;
  /** the in-game HUD's size, as the --ui-scale multiplier — one of UI_SCALES */
  uiScale?: number;
  /**
   * HOW FAST THE CAMERA PANS — one of PAN_SPEEDS, a multiplier on the
   * rate the keys and the screen's edges move the view at (Game.setPanSpeed).
   * Absent means PAN_SPEED_DEFAULT.
   */
  panSpeed?: number;
  /**
   * WHEN A HEALTH BAR RIDES OVER A BODY ON THE FIELD, the player's own
   * (`allyBars`) and the swarm's (`enemyBars`) set apart — a player who
   * wants to see every wound coming in usually does not want their own
   * board covered in green, and the other way round. Absent means
   * HEALTH_BARS_DEFAULT; anything the game does not recognise reads the
   * same way.
   */
  allyBars?: HealthBarMode;
  enemyBars?: HealthBarMode;
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

/**
 * The UI sizes on offer, as --ui-scale multipliers. The panels were sized
 * on a desktop at 1; the steps above it are for a TV across the room or a
 * high-DPI laptop that renders the default small, and they run to 2x
 * because the in-game panels anchor to the corners and reflow (globals.css
 * .ui-zoom), so a big HUD costs field, never overlap.
 */
export const UI_SCALES = [0.75, 0.85, 1, 1.15, 1.3, 1.5, 1.75, 2] as const;
export const UI_SCALE_DEFAULT = 1;
/**
 * The pan-speed steps the Controls tab's slider stops at, as multipliers
 * on the base rate. THE DEFAULT IS 150%, not 100%: the old default was
 * measured on a 256-cell map and reads sluggish on the 512-cell one, and
 * every playtest reached for a faster camera first. 100% is still there,
 * one stop down, for anyone who liked it.
 */
export const PAN_SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3] as const;
export const PAN_SPEED_DEFAULT = 1.5;

function readPanSpeed(p: { panSpeed?: unknown }): number | undefined {
  const s = p.panSpeed;
  return typeof s === "number" && (PAN_SPEEDS as readonly number[]).includes(s) ? s : undefined;
}

function readUiScale(p: { uiScale?: unknown }): number | undefined {
  const s = p.uiScale;
  return typeof s === "number" && (UI_SCALES as readonly number[]).includes(s) ? s : undefined;
}

/** the stored health-bar mode, or undefined for anything the game has since dropped */
function readBars(v: unknown): HealthBarMode | undefined {
  return typeof v === "string" && HEALTH_BAR_MODES.some((m) => m.mode === v)
    ? (v as HealthBarMode)
    : undefined;
}

export function loadProgress(): Progress {
  try {
    const raw = readSave();
    if (!raw) return fresh();
    const p = JSON.parse(raw) as Partial<Progress> & { cleared?: unknown };
    const clearedByMap = readClearedByMap(p);
    const version = typeof p.saveVersion === "number" ? p.saveVersion : 0;
    const migrated = version < SAVE_VERSION;
    const xp = typeof p.xp === "number" && p.xp > 0 ? Math.floor(p.xp) : 0;
    const loaded: Progress = {
      xp,
      clearedByMap,
      speed: readSpeed(p),
      hudMinimized: p.hudMinimized === true,
      difficulty: readDifficulty(p),
      map: readMapPick(p),
      // absent means ON — only an explicit false switches them off
      effects: p.effects !== false,
      uiScale: readUiScale(p),
      panSpeed: readPanSpeed(p),
      // absent means ON — only an explicit false switches it off
      allyBars: readBars(p.allyBars),
      enemyBars: readBars(p.enemyBars),
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

/** the remembered rung, clamped into the ladder; absent means Level 1 */
function readDifficulty(p: { difficulty?: unknown }): number | undefined {
  const d = p.difficulty;
  return typeof d === "number" && Number.isFinite(d)
    ? Math.min(TOP_TIER, Math.max(0, Math.floor(d)))
    : undefined;
}

/** the remembered map, if it is still a world; anything else reads Random */
function readMapPick(p: { map?: unknown }): string | undefined {
  const m = p.map;
  return typeof m === "string" && WORLDS.some((w) => w.id === m) ? m : undefined;
}

/**
 * Remember the menu's picks. `map` null is Random, and is stored as an
 * ABSENT field rather than a sentinel string, so a save that has never
 * picked and one that picked Random read the same way.
 */
export function saveRunPick(difficulty: number, map: string | null): void {
  const p = loadProgress();
  const tier = Math.min(TOP_TIER, Math.max(0, Math.floor(difficulty)));
  if ((p.difficulty ?? 0) === tier && (p.map ?? null) === map) return;
  const { map: _dropped, ...rest } = p;
  void _dropped;
  saveProgress({ ...rest, difficulty: tier, ...(map ? { map } : null) });
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
 * The Interface tab's health-bar knobs. One writer a side, because the two
 * are set one at a time and a single call taking both would have every
 * caller pass the value it is not changing.
 */
export function saveAllyBars(mode: HealthBarMode): void {
  const p = loadProgress();
  if ((p.allyBars ?? HEALTH_BARS_DEFAULT) === mode) return;
  saveProgress({ ...p, allyBars: mode });
}

export function saveEnemyBars(mode: HealthBarMode): void {
  const p = loadProgress();
  if ((p.enemyBars ?? HEALTH_BARS_DEFAULT) === mode) return;
  saveProgress({ ...p, enemyBars: mode });
}

export function savePanSpeed(mult: number): void {
  const p = loadProgress();
  if ((p.panSpeed ?? PAN_SPEED_DEFAULT) === mult) return;
  saveProgress({ ...p, panSpeed: mult });
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

// ---------- the record ----------

/** the number of the highest level this save has beaten on one world — 0 for none */
export const bestClearOn = (p: Progress, worldId: string): number =>
  Math.min(TOP_TIER + 1, Math.max(0, Math.floor(p.clearedByMap[worldId] ?? 0)));

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
  /** XP the run banked: the waves it cleared, times every bonus below */
  xp: number;
  /** how many of the mission's waves the run cleared — every one on a win */
  wavesCleared: number;
  /** how many waves the mission held */
  totalWaves: number;
  /** the multiplier the run carried, which is the difficulty's and
   *  nothing else's — kept beside tierBonus, equal to it, because every
   *  screen that prints a payout reads this one */
  xpBonus: number;
  /** the XP multiplier the difficulty carried */
  tierBonus: number;
  /** was the map the game's pick? it pays no more for it (economy.ts) —
   *  the results screen still says which kind of run it was */
  randomMap: boolean;
  /** the rung that was played, 0-based */
  tier: number;
  /** the world it was played on */
  worldId: string;
  /** the player's level before and after the run banked */
  levelBefore: number;
  levelAfter: number;
}

/**
 * Settle a FINISHED run into the save.
 *
 * Waves are the objectives, so a defeat still banks the share of the
 * mission's pot for every wave the board cleared on the way down
 * (missionXp), times the rung's XP bonus and — on a map the game picked —
 * the random-map bonus. A win is every objective met: it pays the whole
 * pot whatever the last wave's bodies were doing when the mission ended,
 * and records the level as beaten on that world (clearedByMap). Kills
 * pay nothing here; they paid scrap into the run as it went.
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
  wavesCleared: number,
  totalWaves: number,
  won: boolean,
  worldId: string = WORLD.id,
  randomMap = false,
): RunReward {
  const p = loadProgress();
  const n = Math.min(TOP_TIER, Math.max(0, Math.floor(tier)));
  const tierBonus = tierXpBonus(n);
  // the difficulty is the whole multiplier; a random map adds nothing
  const bonus = tierBonus;
  const waves = Math.max(0, Math.floor(totalWaves));
  const cleared = won ? waves : Math.min(waves, Math.max(0, Math.floor(wavesCleared)));
  const xp = Math.round(missionXp(cleared, waves) * bonus);
  const levelBefore = levelOf(p);
  p.xp += xp;
  if (won) p.clearedByMap[worldId] = Math.max(bestClearOn(p, worldId), n + 1);
  saveProgress(p);
  return {
    xp,
    wavesCleared: cleared,
    totalWaves: waves,
    xpBonus: bonus,
    tierBonus,
    randomMap,
    tier: n,
    worldId,
    levelBefore,
    levelAfter: levelOf(p),
  };
}
