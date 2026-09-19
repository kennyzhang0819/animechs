import { cleanFamilies, VISIBLE_WORLDS, WORLD, WORLDS, type FamilyKey } from "./levels";
import { cleanMutations, type MutationId } from "./mutation";
import { tierXpBonus, TOP_TIER } from "./ladder";
import { ADMIN_ENABLED } from "./env";
import { levelForXp, missionXp, skillPointsAt, SKILL_POINT_LEVELS } from "./economy";
import {
  MAX_RANKS,
  NO_SKILLS,
  ranksOn,
  SKILL_NODES,
  spentSkillPoints,
  type SkillPoints,
} from "./skills";
import { MAX_LEVEL, techStateFor, worldUnlockLevel } from "./track";
import { type TechState } from "./tech";
import { clearSave, readSave, writeSave } from "./storage";
import { TOWER_KINDS, type TowerKind } from "./types";

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
 * WHEN A BODY WEARS ITS ROW OF STATUS SYMBOLS (status.ts, statusArt.ts) —
 * the same three-way shape the health bars have, and deliberately a
 * SEPARATE knob from them, because the two answer different questions: a
 * bar is how much is left of that, a symbol is what is being done to it.
 *
 * - `always`   — every flagged body on the field, at any zoom close
 *   enough for a symbol to resolve (Game.statusLegible)
 * - `selected` — only what the player has actually asked about: the
 *   buildings in hand, and whatever the last click marked. The field
 *   stays clean and the row becomes a thing you go and get.
 * - `never`    — nothing on the field; the inspector still prints the
 *   whole row, which is where the symbols are learned anyway
 */
export type StatusMode = "always" | "selected" | "never";

/** the three, in the order the Interface tab prints them: most marks to none */
export const STATUS_MODES: ReadonlyArray<{ mode: StatusMode; label: string }> = [
  { mode: "always", label: "Always" },
  { mode: "selected", label: "Selected" },
  { mode: "never", label: "Never" },
];

/** absent from the save means this — the behaviour the game had before the knob */
export const STATUS_MARKS_DEFAULT: StatusMode = "always";

/**
 * THE TWO WAYS TO DEPLOY, and the one thing that tells them apart is what
 * they PAY.
 *
 * - `regular` — the campaign. The map is rolled, the families are rolled,
 *   the mutators are rolled inside the difficulty's budget (ladder.ts),
 *   and the run banks XP. The player picks the difficulty and nothing
 *   else: what is coming is the run's own news.
 * - `custom` — the same game with every dial handed over. Pick the map,
 *   the difficulty, the enemy families and — where the difficulty rolls
 *   rules at all — the mutators themselves. The track's locks do not
 *   apply: every map, every rung and every rule in the catalog is on the
 *   list from the first run.
 *
 * AND CUSTOM PAYS NOTHING. Not a share, not a reduced rate — zero XP and
 * no entry in the record (grantRunReward). That is the whole reason the
 * dials can be handed over: a run whose difficulty, swarm and rules are
 * all chosen is not a measurement of anything, so it must not be able to
 * level a save. (The SANDBOX — Animechs.tsx, Ctrl+Shift+S: free
 * building and every pace — is a separate debug door and opens on either
 * mode.)
 */
export type GameMode = "regular" | "custom";

/** absent from the save means this — the mode the game had before there were two */
export const GAME_MODE_DEFAULT: GameMode = "regular";

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
   * (track.ts) — every map, pace, turret, mod and relic the save has is a
   * function of this number. Nothing is stored twice.
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
  /** the HUD's top-left panel collapsed to its one-line wave counter */
  hudMinimized?: boolean;
  /**
   * THE MENU'S LAST PICKS, so the start screen opens on what the player
   * played last rather than on Level 1 every launch. `difficulty` is the
   * rung index (0-based, see ladder.ts); `map` is a world id, and ABSENT
   * means Random — the default.
   *
   * ONE SET OF PICKS FOR BOTH MODES, not one each. The difficulty means
   * the same thing either way, and the three custom-only picks below are
   * simply not read in regular mode — where the map is always rolled, so
   * `map` is remembered through a regular run rather than wiped by one.
   * The one place the modes disagree is reach: regular clamps a
   * difficulty the track has not opened back down (Animechs.tsx), so
   * flipping to regular can lower a rung custom was standing on.
   */
  difficulty?: number;
  map?: string;
  /** which of the two modes the deploy screen was last on (GameMode) */
  mode?: GameMode;
  /**
   * CUSTOM MODE'S HAND, and never read in regular mode: the families the
   * player named for the swarm, and the mutators they named for the run.
   * EMPTY MEANS ROLLED, for each of the two independently — a custom run
   * can pick its map and its rules and still let the die deal the swarm.
   * Both are cleaned on load (cleanFamilies, cleanMutations), so a save
   * naming something this build has never heard of degrades to a roll.
   */
  families?: FamilyKey[];
  mutators?: MutationId[];
  /**
   * Ambient effects — the particle work, and nothing a weapon is made of
   * (see Sim.setEffects). Absent means ON; only an explicit `false` is off.
   */
  effects?: boolean;
  /**
   * THE FRAME COUNTER in the top corner of the field (UiState.fps). Absent
   * means OFF — unlike every other knob on the Video tab it is a diagnostic
   * rather than a preference about how the game should look, so a save that
   * has never asked for it does not get it.
   */
  showFps?: boolean;
  /** the in-game HUD's size, as the --ui-scale multiplier — one of UI_SCALES */
  uiScale?: number;
  /**
   * HOW FAST THE CAMERA PANS — one of PAN_SPEEDS, a multiplier on the
   * rate the keys and the screen's edges move the view at (Game.setPanSpeed).
   * Absent means PAN_SPEED_DEFAULT.
   */
  panSpeed?: number;
  /**
   * WHICH WAY THE WHEEL ZOOMS. The wheel's raw sign is not a fact about
   * the player's intent: macOS's "natural scrolling" flips deltaY for
   * mice as well as trackpads, so the same downward flick reads as
   * negative on one machine and positive on the next, and no API tells us
   * which. So the game ships the web convention — wheel down (positive
   * deltaY) zooms out — and hands anyone whose machine disagrees the
   * switch. Absent means INVERT_ZOOM_DEFAULT.
   */
  invertZoom?: boolean;
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
   * WHEN THE STATUS SYMBOLS RIDE OVER A BODY on the field — one knob for
   * both sides, unlike the bars, because "what is happening to that" is
   * the same question whoever owns the thing it is happening to. Absent
   * means STATUS_MARKS_DEFAULT.
   */
  statusMarks?: StatusMode;
  /**
   * THIS SAVE HAS DECLINED THE DEV GRANT — the wipe's half of the back
   * door (see resetProgress and DEV_UNLOCK_ALL). A wiped save on a dev
   * build would otherwise play at the top of the track again on the next
   * load.
   */
  devGrantOff?: boolean;
  /**
   * THE SKILL TREE'S SPEND (skills.ts): how many rungs of each turret's
   * line the save has bought. A turret absent from the record has an
   * unbought line, and the points NOT here are the ones still in hand —
   * nothing stores the balance, which is level minus this.
   */
  skills?: SkillPoints;
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
 * — every map open, every pace, every module — so any map and any rung
 * can be reached without grinding first. Never in production. Its effect
 * is read at effectiveLevel and NEVER written into a save.
 */
const DEV_UNLOCK_ALL = true;

const devUnlocking = (p?: { devGrantOff?: boolean }): boolean =>
  DEV_UNLOCK_ALL && ADMIN_ENABLED && !p?.devGrantOff;

/** the stored spend, clamped: a node past MAX_RANKS, a node this build has
 *  never heard of (the tree that was one line a turret wrote those), or a
 *  spend past what 100 levels can pay all degrade rather than crash */
function readSkills(v: unknown): SkillPoints {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  const raw = v as Record<string, unknown>;
  const out: SkillPoints = {};
  let budget = SKILL_POINT_LEVELS;
  for (const node of SKILL_NODES) {
    const n = raw[node.id];
    if (typeof n !== "number" || !(n > 0)) continue;
    const ranks = Math.min(MAX_RANKS, Math.floor(n), budget);
    if (ranks <= 0) continue;
    out[node.id] = ranks;
    budget -= ranks;
  }
  return out;
}

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
/** the wheel follows its own sign until the Controls tab says otherwise */
export const INVERT_ZOOM_DEFAULT = false;

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

/** the stored status-symbol mode, or undefined for anything unrecognised */
function readStatusMode(v: unknown): StatusMode | undefined {
  return typeof v === "string" && STATUS_MODES.some((m) => m.mode === v)
    ? (v as StatusMode)
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
      hudMinimized: p.hudMinimized === true,
      difficulty: readDifficulty(p),
      map: readMapPick(p),
      mode: readMode(p),
      families: cleanFamilies(p.families),
      mutators: cleanMutations(p.mutators),
      // absent means ON — only an explicit false switches them off
      effects: p.effects !== false,
      // absent means OFF — only an explicit true switches it on
      showFps: p.showFps === true,
      uiScale: readUiScale(p),
      panSpeed: readPanSpeed(p),
      // absent means ON — only an explicit false switches it off
      allyBars: readBars(p.allyBars),
      enemyBars: readBars(p.enemyBars),
      statusMarks: readStatusMode(p.statusMarks),
      skills: readSkills(p.skills),
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

/** the remembered map, if it is still a world ON THE MENU; anything else
 *  — a renamed id, or one since hidden (levels.ts HIDDEN_WORLD_IDS) —
 *  reads Random, so a save cannot restore a pick the picker would not
 *  offer today */
function readMapPick(p: { map?: unknown }): string | undefined {
  const m = p.map;
  return typeof m === "string" && VISIBLE_WORLDS.some((w) => w.id === m) ? m : undefined;
}

/** the remembered mode; anything the game does not recognise reads regular */
function readMode(p: { mode?: unknown }): GameMode {
  return p.mode === "custom" ? "custom" : GAME_MODE_DEFAULT;
}

/**
 * THE MENU'S PICKS AS ONE THING, because they are set as one thing: the
 * deploy screen holds all five in state and writes the lot whenever any of
 * them is touched. Five writers taking one field each would mean every
 * caller passing the four it is not changing.
 */
export interface RunPick {
  mode: GameMode;
  difficulty: number;
  /** a world id, or null for Random */
  map: string | null;
  /** custom mode's hand — empty is rolled */
  families: readonly FamilyKey[];
  mutators: readonly MutationId[];
}

/**
 * Remember the menu's picks. `map` null is Random, and is stored as an
 * ABSENT field rather than a sentinel string, so a save that has never
 * picked and one that picked Random read the same way; the two custom
 * lists are stored the same way, absent when nothing is named.
 */
export function saveRunPick(pick: RunPick): void {
  const p = loadProgress();
  const tier = Math.min(TOP_TIER, Math.max(0, Math.floor(pick.difficulty)));
  const families = cleanFamilies(pick.families);
  const mutators = cleanMutations(pick.mutators);
  const same =
    (p.difficulty ?? 0) === tier &&
    (p.map ?? null) === pick.map &&
    (p.mode ?? GAME_MODE_DEFAULT) === pick.mode &&
    sameList(p.families ?? [], families) &&
    sameList(p.mutators ?? [], mutators);
  if (same) return;
  const { map: _map, families: _families, mutators: _mutators, ...rest } = p;
  void [_map, _families, _mutators];
  saveProgress({
    ...rest,
    difficulty: tier,
    mode: pick.mode,
    ...(pick.map ? { map: pick.map } : null),
    ...(families.length > 0 ? { families } : null),
    ...(mutators.length > 0 ? { mutators } : null),
  });
}

/** same ids in the same order — both lists come out of a cleaner, so this is exact */
const sameList = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((v, i) => v === b[i]);


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

/** the Video tab's frame counter — off unless a save has asked for it */
export function saveShowFps(on: boolean): void {
  const p = loadProgress();
  if ((p.showFps ?? false) === on) return;
  saveProgress({ ...p, showFps: on });
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

/** the Interface tab's status-symbol knob — one setting for both sides */
export function saveStatusMarks(mode: StatusMode): void {
  const p = loadProgress();
  if ((p.statusMarks ?? STATUS_MARKS_DEFAULT) === mode) return;
  saveProgress({ ...p, statusMarks: mode });
}

export function savePanSpeed(mult: number): void {
  const p = loadProgress();
  if ((p.panSpeed ?? PAN_SPEED_DEFAULT) === mult) return;
  saveProgress({ ...p, panSpeed: mult });
}

/** the Controls tab's zoom-direction switch */
export function saveInvertZoom(on: boolean): void {
  const p = loadProgress();
  if ((p.invertZoom ?? INVERT_ZOOM_DEFAULT) === on) return;
  saveProgress({ ...p, invertZoom: on });
}

/**
 * The stored zoom direction on its own, for the map editor — a dev screen
 * that stands outside the menu and so has nobody to hand it the knob.
 */
export function loadInvertZoom(): boolean {
  return loadProgress().invertZoom ?? INVERT_ZOOM_DEFAULT;
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
 * — which maps, which paces, which modules — is asked of this, and the
 * printed level (levelOf) stays honest underneath.
 */
export const effectiveLevel = (p: Progress): number =>
  devUnlocking(p) ? MAX_LEVEL : levelOf(p);

/** what the run may do, as the sim and the bar want it — the track at the
 *  save's level, with the save's own skill tree folded in */
export function techOf(p: Progress): TechState {
  return { ...techStateFor(effectiveLevel(p)), skills: p.skills ?? NO_SKILLS };
}

// ---------- the skill tree ----------

/**
 * THE POINTS THIS SAVE HAS BEEN PAID — one a level to
 * SKILL_POINT_LEVELS, and the dev door pays the lot (the same door that
 * plays every save at the top of the track).
 */
export const skillPointsOf = (p: Progress): number =>
  devUnlocking(p) ? SKILL_POINT_LEVELS : skillPointsAt(levelOf(p));

/** ...and the ones still in hand — the one number the board prints */
export const skillPointsLeft = (p: Progress): number =>
  Math.max(0, skillPointsOf(p) - spentSkillPoints(p.skills));

/**
 * RAISE ONE DIAL, or lower it — the tree's only two moves, and the one
 * place their rules live: a rank costs a point, and NO DIAL HAS A CEILING
 * a player can reach, so the whole pool may go into one of the four.
 * MAX_RANKS is only a runaway guard. A buy that cannot be paid for in
 * full takes what it can afford rather than refusing. Returns the save as
 * it now stands; the caller re-reads it (both write through).
 */
export function buySkill(id: string, count = 1): Progress {
  const p = loadProgress();
  const have = ranksOn(p.skills, id);
  const room = Math.min(count, MAX_RANKS - have, skillPointsLeft(p));
  if (room <= 0) return p;
  const next: Progress = { ...p, skills: { ...p.skills, [id]: have + room } };
  saveProgress(next);
  return next;
}

export function refundSkill(id: string, count = 1): Progress {
  const p = loadProgress();
  const have = ranksOn(p.skills, id);
  const back = Math.min(count, have);
  if (back <= 0) return p;
  const skills = { ...p.skills };
  if (have - back <= 0) delete skills[id];
  else skills[id] = have - back;
  const next: Progress = { ...p, skills };
  saveProgress(next);
  return next;
}

/** hand the whole tree back — every rank, every dial */
export function refundAllSkills(): Progress {
  const p = loadProgress();
  const next: Progress = { ...p, skills: {} };
  saveProgress(next);
  return next;
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
/**
 * THE GATE IS BACK ON, because a playable board is a MISSION now and not
 * just different ground. The three that are on the menu carry the three
 * mission kinds (levels.ts PLAYABLE_WORLD_IDS, docs/mission-design.md) and
 * the track deals them ONE A LEVEL (track.ts PLACED), so a first run plays
 * the intercept and nothing else. Handing over all three at once hands
 * over the whole game before the first clear.
 *
 * It was true while seventeen boards went in at once and the point was to
 * sit down on each of them rather than grind eight levels first; fifteen
 * of those are off the MENU entirely now, which is a different question
 * and lives in one list (levels.ts HIDDEN_WORLD_IDS).
 */
const EVERY_MAP_OPEN = false;

export const worldLock = (p: Progress, worldId: string): { level: number } | null => {
  if (EVERY_MAP_OPEN) return null;
  const level = worldUnlockLevel(worldId);
  return effectiveLevel(p) >= level ? null : { level };
};

/** may this map be entered at all? */
export const isWorldUnlocked = (p: Progress, worldId: string): boolean =>
  worldLock(p, worldId) == null;

// ---------- settling a run ----------

export interface RunReward {
  /** XP the run banked: the whole pot on a win, and otherwise the waves it
   *  broke, times every bonus below. ALWAYS ZERO on a custom run — see
   *  `custom` */
  xp: number;
  /**
   * Was this a CUSTOM run? Then it paid nothing and recorded nothing, and
   * the results panel says so rather than printing a zero. Everything else
   * on this object is still true — the waves cleared, the rung, the map —
   * because a custom run is still a run worth reading the end of.
   */
  custom: boolean;
  /** how many waves the run broke — counted to `totalWaves` on a win, which
   *  is what makes the pot whole there whatever the mission actually was */
  wavesCleared: number;
  /** how many waves the run SENT, the tide's repeats included (Sim.totalWaves)
   *  — not the document's fifty */
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
 * A WIN IS THE MISSION MET (levels.ts Mission, Sim.won) — the waves held,
 * the clock outlasted, the crossers cut down — and it pays the WHOLE pot
 * whatever the board was doing at the time, times the rung's XP bonus, and
 * records the level as beaten on that world (clearedByMap).
 *
 * A DEFEAT IS PAID FOR THE WAVES IT BROKE on the way down (missionXp),
 * whichever mission it was and however far off the objective it ended.
 * That is the one thing every mission has in common — a script that never
 * runs out is always sending something to break — and it is what makes a
 * failed push progress rather than a wasted hour. Kills pay nothing here;
 * they paid scrap into the run as it went.
 *
 * NOTHING ACCRUES WHILE THE APP IS SHUT. There is no offline income and
 * no idle tick: every point of XP was paid for by a run somebody watched.
 *
 * A CUSTOM RUN SETTLES INTO NOTHING (GameMode): it pays no XP and records
 * no clear, and the save is not written at all. It still comes back as a
 * RunReward — the waves cleared, the rung, the map — because the results
 * panel reads one shape whichever mode was played, and `custom` is what
 * makes it print "no XP" instead of a zero. THIS IS THE ONE GATE. Every
 * point of XP in the game is minted here, so keeping custom out of the
 * ledger is one branch in one function rather than a rule every caller
 * has to remember.
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
  mode: GameMode = "regular",
): RunReward {
  const p = loadProgress();
  const n = Math.min(TOP_TIER, Math.max(0, Math.floor(tier)));
  const tierBonus = tierXpBonus(n);
  // the difficulty is the whole multiplier; a random map adds nothing
  const bonus = tierBonus;
  const waves = Math.max(0, Math.floor(totalWaves));
  const cleared = won ? waves : Math.min(waves, Math.max(0, Math.floor(wavesCleared)));
  const custom = mode === "custom";
  const xp = custom ? 0 : Math.round(missionXp(cleared, waves) * bonus);
  const levelBefore = levelOf(p);
  if (!custom) {
    p.xp += xp;
    if (won) p.clearedByMap[worldId] = Math.max(bestClearOn(p, worldId), n + 1);
    saveProgress(p);
  }
  return {
    xp,
    custom,
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
