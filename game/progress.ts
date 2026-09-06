import { dropsForKills, WORLD, WORLDS } from "./levels";
import { RUNG_COUNT, tierXpBonus, TOP_TIER, WORLD_REQUIRES } from "./ladder";
import {
  FIRST_CLEAR_XP,
  levelForXp,
  pointsForLevel,
  xpAtLevel,
} from "./economy";
import {
  BY_MINDUSTRY_VALUE,
  childrenOf,
  isRefundable,
  isTowerNode,
  NODE_SPEED,
  owns,
  pointsSpent,
  TECH_KINDS,
  techNode,
  techPoints,
  techState,
  isToggleable,
  type TechKind,
  type TechLevels,
  type TechState,
} from "./tech";
import { TOWER_KINDS, type TowerKind } from "./types";
import { clearSave, readSave, writeSave } from "./storage";

/**
 * The player's persistent campaign state: lifetime XP, how far up each
 * world's ladder they have climbed, and which tech nodes they own. Lives in
 * ONE SAVE SLOT (storage.ts: localStorage in a browser, a file under the
 * desktop shell) and every reader goes through loadProgress() so a wiped
 * or mangled save degrades to a fresh campaign instead of a crash.
 */
export interface Progress {
  /**
   * LIFETIME XP, the save's one number. Every kill pays its tier's XP,
   * the rung multiplies it, a first clear adds a bonus (grantRunReward),
   * and it only ever goes up. The player's LEVEL is read off it through
   * the curve in economy.ts, and every level is one skill point — so
   * what a save may still spend is its level's points minus what its
   * tech already cost (pointsFree). Nothing is stored twice.
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
   * says nothing about anywhere else: every world is on the menu from the
   * first run and every world is climbed from the bottom. A world absent
   * from this record has never been won on and reads 0.
   *
   * IT IS AN UNBOUNDED INT, deliberately. The ladder stops at RUNG_COUNT
   * because that is what is authored, not because this number could not
   * hold more.
   */
  clearedByMap: Record<string, number>;
  /**
   * The nodes this save owns, 1 per owned node. A turret's node is its
   * unlock; an upgrade rung's is the stat; a utility's is the switch. A
   * turret this save owns is placeable at every rung of every world — how
   * MANY of it stand on a board is the run's scrap's business.
   */
  tech: TechLevels;
  /**
   * WHICH SAVE FORMAT THIS FILE WAS WRITTEN IN — see SAVE_VERSION. Absent
   * means "written before the format was versioned".
   */
  saveVersion?: number;
  /**
   * The fast-forward multiplier the player last picked, kept so a run does
   * not start at 1x every single time. A pace is a preference about how the
   * player wants to spend their minutes, not a fact about the run. What the
   * save is ALLOWED to run at is a separate question, answered by the tech
   * tree: see startingSpeed.
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
   * The build bar's loadout: which turrets ride in its slots. A SET in
   * effect — the bar always renders in the roster's canonical order
   * (BY_MINDUSTRY_VALUE in tech.ts), whatever order this holds. The bar
   * fits TechState.barSlots of them, PvZ-style — owning a turret does not
   * put it on the bar, picking it does. Absent on a save that has never
   * curated, which reads as "auto-fill the slots from whatever is
   * unlocked" (see MechSwarm's bar).
   */
  loadout?: TowerKind[];
  /**
   * NODES THE SAVE OWNS BUT HAS SWITCHED OFF — see TechNodeDef.toggle.
   * Not a refund and not a loss: the node stays owned and only stops
   * APPLYING. A node listed here that is not toggleable is ignored on load.
   */
  techOff?: TechKind[];
  /**
   * THIS SAVE HAS DECLINED THE DEV GRANT — the wipe's half of the back
   * door (see resetProgress and DEV_UNLOCK_ALL). A wiped save on a dev
   * build would otherwise have the whole tree handed straight back on the
   * next load.
   */
  devGrantOff?: boolean;
  /**
   * WHAT THE SAVE REALLY OWNS, when a grant has been laid over `tech`.
   * Present only on a Progress that loadProgress granted to, and NEVER
   * written to disk: `tech` is the view the game plays with, this is the
   * row the file keeps. Points spent are counted off THIS row when it
   * exists, so a grant never eats the player's real points.
   */
  techBought?: TechLevels;
}

/** one emplacement, as the game reports the board: what, and which cell */
export interface TowerPlacement {
  kind: TowerKind;
  gx: number;
  gy: number;
}

/**
 * THE SAVE FORMAT'S VERSION, stamped on every write.
 *
 * VERSION 2 IS THE SKILL-POINT SAVE. Before it the file held a five-item
 * bank, a boss-trophy ledger, saved boards and a tech field whose numbers
 * were placement counts. None of that means anything now: the bank is
 * dropped (there is nothing it could buy), the trophies are dropped (no
 * currency to pay), the boards are dropped (a board is bought in scrap
 * now, so a free one would be a cheat), and the tech field is CLAMPED —
 * a node a player bought under the count model stays owned, once, and
 * the XP is set so the level covers what they own (see migrate). A
 * returning player keeps every turret and every rung they cleared and
 * loses only numbers that had stopped meaning anything.
 */
const SAVE_VERSION = 2;

const fresh = (): Progress => ({
  xp: 0,
  clearedByMap: {},
  // home is the root the whole tree hangs off, and duo is the turret a
  // save has to be able to field. Both are free (points: 0 in tech.ts) and
  // granted outright; everything else is a level earned
  tech: { home: 1, duo: 1 },
});

/**
 * DEV SWITCH: GRANT EVERY TECH NODE ON LOAD. Flip to false to turn it off.
 *
 * A debugging convenience, not a game rule: read on every load rather
 * than written once, so it holds everywhere the dev server is reachable
 * from. IT NEVER APPLIES TO A PRODUCTION BUILD, whatever this is set to.
 *
 * It grants NODES ONLY. `clearedByMap` is untouched, so every rung still
 * opens by clearing the one below it — and XP is untouched, so the level
 * strip reads what the save has actually earned. A refundable node CAN be
 * granted, unlike under the bank: points are derived from XP and from
 * what was BOUGHT (techBought), so refunding a granted node hands back
 * nothing and there is no hole to close.
 */
const DEV_UNLOCK_ALL = true;

/**
 * Is the dev unlock actually in force for this save? Production ignores
 * the switch, and so does a save that has been wiped since — the wipe
 * writes `devGrantOff` precisely so the grant does not walk back in on
 * the very next load (see resetProgress).
 */
const devUnlocking = (p?: { devGrantOff?: boolean }): boolean =>
  DEV_UNLOCK_ALL && process.env.NODE_ENV !== "production" && p?.devGrantOff !== true;

/** every node owned, keeping anything the save already holds */
function grantEveryNode(tech: TechLevels): TechLevels {
  for (const k of TECH_KINDS) tech[k] = 1;
  return tech;
}

/**
 * How far up the ladder a raw save has climbed. Saves written before the
 * ladder existed carry `completed: string[]` — a list of cleared WORLD ids
 * — and there is no honest conversion from "beat world 2" to a tier, so
 * every one of them lands on the frontier its world count suggests.
 */
function readClearedByMap(p: {
  clearedByMap?: unknown;
  cleared?: unknown;
  completed?: unknown;
}): Record<string, number> {
  const out: Record<string, number> = {};
  const raw =
    p.clearedByMap && typeof p.clearedByMap === "object"
      ? (p.clearedByMap as Record<string, unknown>)
      : null;
  if (raw) {
    for (const [k, v] of Object.entries(raw))
      if (typeof v === "number" && v > 0) out[k] = Math.floor(v);
    return out;
  }
  // a pre-split save carried one number for the whole campaign, earned on
  // the first world — so it lands there and nowhere else
  const legacy =
    typeof p.cleared === "number" && p.cleared > 0
      ? Math.floor(p.cleared)
      : Array.isArray(p.completed)
        ? p.completed.length
        : 0;
  if (legacy > 0) out[WORLD.id] = legacy;
  return out;
}

/**
 * Every multiplier the game has, whether or not a given save owns it: 1x,
 * one per utility node, and the sandbox-only paces — a save made there has
 * to be able to remember them. The tree is the authority on which of these
 * a save may USE; this is only what counts as a real number to remember.
 */
const ALL_SPEEDS: readonly number[] = [1, 8, 16, ...Object.values(NODE_SPEED)];

/** the remembered pace out of a raw save; anything else reads as 1x */
function readSpeed(p: { speed?: unknown }): number | undefined {
  return typeof p.speed === "number" && ALL_SPEEDS.includes(p.speed) ? p.speed : undefined;
}

/**
 * The HUD sizes Settings offers, smallest first. These are the only values
 * a save may hold (see readUiScale) — the setting is a picker, not a dial.
 */
export const UI_SCALES = [0.75, 0.85, 1, 1.15] as const;
export const UI_SCALE_DEFAULT = 1;

/** the remembered HUD size; anything not in UI_SCALES reads as never set */
function readUiScale(p: { uiScale?: unknown }): number | undefined {
  return typeof p.uiScale === "number" && (UI_SCALES as readonly number[]).includes(p.uiScale)
    ? p.uiScale
    : undefined;
}

/**
 * The tech field out of a raw save: known nodes only, CLAMPED TO ONE. A
 * count-model save holding 300 duos reads as owning duo; a hand-edited
 * save claiming four points of 2x speed reads as owning it once. Nodes
 * the tree no longer has (extra lives, 8x pace) simply drop.
 */
function readTech(p: { tech?: unknown }): TechLevels {
  const tech: TechLevels = {};
  if (p.tech && typeof p.tech === "object") {
    const raw = p.tech as Record<string, unknown>;
    for (const k of TECH_KINDS) {
      const v = raw[k];
      if (typeof v === "number" && v > 0) tech[k] = 1;
    }
    // the bar's curation shipped briefly as its own "tower-filter" node
    // before becoming the slot ladder; a save that paid for it keeps the
    // first slot upgrade rather than silently losing the purchase
    const legacyFilter = raw["tower-filter"];
    if (typeof legacyFilter === "number" && legacyFilter > 0) tech["slot-7"] = 1;
  }
  tech.home = 1;
  tech.duo = 1;
  return tech;
}

/**
 * THE XP A PRE-VERSION-2 SAVE IS OWED. Two honest floors, and the save
 * gets the higher: the level that covers what it already owns (so a
 * migrated save never opens in debt), and the first-clear bonus for every
 * rung it has beaten (what those clears would have paid under this model).
 */
function migratedXp(tech: TechLevels, clearedByMap: Record<string, number>): number {
  const owed = xpAtLevel(1 + pointsSpent(tech));
  let clears = 0;
  for (const c of Object.values(clearedByMap))
    for (let tier = 0; tier < Math.min(c, RUNG_COUNT); tier++)
      clears += FIRST_CLEAR_XP * tierXpBonus(tier);
  return Math.max(owed, Math.round(clears));
}

export function loadProgress(): Progress {
  try {
    const raw = readSave();
    if (!raw) {
      const p = fresh();
      // the dev switch may be granting on a fresh save too, and the
      // snapshot has to be taken or the first save would bake it in
      if (devUnlocking()) {
        p.techBought = { ...p.tech };
        grantEveryNode(p.tech);
      }
      return p;
    }
    const p = JSON.parse(raw) as Partial<Progress> & { tech?: unknown };
    const tech = readTech(p);
    const clearedByMap = readClearedByMap(p);
    const version = typeof p.saveVersion === "number" ? p.saveVersion : 0;
    const migrated = version < SAVE_VERSION;
    const xp =
      !migrated && typeof p.xp === "number" && p.xp > 0
        ? Math.floor(p.xp)
        : migratedXp(tech, clearedByMap);
    // WHERE THE DEV GRANT IS LAID ON. `techBought` is the copy taken BEFORE
    // the grant, and saveProgress writes that copy, so no amount of ordinary
    // play can promote a granted node into an owned one. (An `unlocked`
    // flag from the old touch-only back door is ignored: the tree it granted
    // was never written to disk, so an old save simply loses the grant.)
    const devGrantOff = p.devGrantOff === true;
    const granting = devUnlocking({ devGrantOff });
    const techBought = granting ? { ...tech } : undefined;
    if (granting) grantEveryNode(tech);
    const loaded: Progress = {
      xp,
      clearedByMap,
      tech,
      speed: readSpeed(p),
      hudMinimized: p.hudMinimized === true,
      // absent means ON — only an explicit false switches them off
      effects: p.effects !== false,
      uiScale: readUiScale(p),
      loadout: readLoadout(p),
      techOff: readTechOff(p),
      ...(devGrantOff ? { devGrantOff } : null),
      ...(techBought ? { techBought } : null),
    };
    // a migrated save is rewritten here rather than re-converted on every
    // load: loadProgress runs on a timer during a run, and a migration
    // that never settles would recompute the owed XP forever
    if (migrated) saveProgress(loaded);
    return loaded;
  } catch {
    return fresh();
  }
}

/**
 * The switched-off nodes out of a raw save: known kinds only, deduped, and
 * only nodes the tree actually offers a switch on.
 */
function readTechOff(p: { techOff?: unknown }): TechKind[] {
  if (!Array.isArray(p.techOff)) return [];
  const kinds = new Set<string>(TECH_KINDS);
  const out: TechKind[] = [];
  for (const k of p.techOff)
    if (typeof k === "string" && kinds.has(k) && !out.includes(k as TechKind) && isToggleable(k as TechKind))
      out.push(k as TechKind);
  return out;
}

/**
 * The loadout out of a raw save: known kinds only, deduped, order kept.
 * Absent (undefined) and present-but-empty are different answers — absent
 * means "never curated, auto-fill", empty means the player cleared the bar.
 */
function readLoadout(p: { loadout?: unknown }): TowerKind[] | undefined {
  if (!Array.isArray(p.loadout)) return undefined;
  const kinds = new Set<string>(TOWER_KINDS);
  const out: TowerKind[] = [];
  for (const k of p.loadout)
    if (typeof k === "string" && kinds.has(k) && !out.includes(k as TowerKind))
      out.push(k as TowerKind);
  return out;
}

/** remember which turrets ride in the build bar's slots */
export function saveLoadout(kinds: readonly TowerKind[]): void {
  const p = loadProgress();
  saveProgress({ ...p, loadout: [...kinds] });
}

/** remember the pace just picked, for the next run and the next session */
export function saveSpeed(mult: number): void {
  const p = loadProgress();
  if (p.speed === mult) return;
  saveProgress({ ...p, speed: mult });
}

/** persist the HUD panel's collapsed state — see Progress.hudMinimized */
export function saveHudMinimized(min: boolean): void {
  const p = loadProgress();
  if ((p.hudMinimized ?? false) === min) return;
  saveProgress({ ...p, hudMinimized: min });
}

/** persist the ambient-effects switch — see Progress.effects */
export function saveEffects(on: boolean): void {
  const p = loadProgress();
  if ((p.effects ?? true) === on) return;
  saveProgress({ ...p, effects: on });
}

/** persist the HUD size picked in Settings → Interface — see Progress.uiScale */
export function saveUiScale(scale: number): void {
  if (!(UI_SCALES as readonly number[]).includes(scale)) return;
  const p = loadProgress();
  if ((p.uiScale ?? UI_SCALE_DEFAULT) === scale) return;
  saveProgress({ ...p, uiScale: scale });
}

/**
 * The pace a run should start at: what the player last picked, as far as
 * `allowed` will carry it. Stepping DOWN to the nearest allowed multiplier
 * rather than falling to 1x is what makes a sandbox session harmless.
 */
export function startingSpeed(p: Progress, allowed: readonly number[]): number {
  const want = p.speed ?? 1;
  let best = allowed[0] ?? 1;
  for (const m of allowed) if (m <= want && m > best) best = m;
  return best;
}

/**
 * Write the save — with any UNLOCK VIEW peeled back off it first. The
 * granted rows never reach the disk: `techBought` is the row the file
 * keeps, and it is dropped from the JSON along with the view.
 */
export function saveProgress(p: Progress): void {
  try {
    const { techBought, ...rest } = p;
    const out: Progress = techBought ? { ...rest, tech: techBought } : rest;
    out.saveVersion = SAVE_VERSION;
    writeSave(JSON.stringify(out));
  } catch {
    // a save that cannot be serialized: the run still plays, nothing sticks
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

/** the save's tech, as the sim and the bar want it — what it owns is the
 *  whole answer to what it may place */
export function techOf(p: Progress): TechState {
  return techState(p.tech, techOffSet(p));
}

/** the nodes this save has switched off, as the set techState wants */
export const techOffSet = (p: Progress): ReadonlySet<TechKind> => new Set(p.techOff ?? []);

/** is this owned node applying its effect? — the tree's On/Off state */
export const isTechOn = (p: Progress, node: TechKind): boolean =>
  !(p.techOff ?? []).includes(node);

/**
 * Switch one owned node's effect on or off, keeping it either way. A node
 * the tree offers no switch on cannot be switched: the flag is the node's.
 */
export function saveTechOn(node: TechKind, on: boolean): Progress {
  const p = loadProgress();
  if (!isToggleable(node)) return p;
  const off = new Set(p.techOff ?? []);
  if (on) off.delete(node);
  else off.add(node);
  const next = { ...p, techOff: [...off] };
  saveProgress(next);
  return next;
}

// ---------- level and points ----------

/** the player's level, read off lifetime XP */
export const levelOf = (p: Progress): number => levelForXp(p.xp);

/** the points the save has ever earned — one a level past the first */
export const pointsEarned = (p: Progress): number => pointsForLevel(levelOf(p));

/**
 * The points still unspent. Counted off what was BOUGHT (techBought)
 * when a grant is laid over the save, so the dev switch and the back door
 * never eat a real point.
 */
export const pointsFree = (p: Progress): number =>
  Math.max(0, pointsEarned(p) - pointsSpent(p.techBought ?? p.tech));

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
 * WHAT IS STILL STANDING BETWEEN THIS SAVE AND A MAP — the requirement it
 * has not met, or null when the map is open. Returns the requirement
 * rather than a boolean because every caller that cares needs to SAY it.
 */
export const worldLock = (
  p: Progress,
  worldId: string,
): { world: string; tier: number } | null => {
  const req = WORLD_REQUIRES[worldId];
  return !req || isTierCleared(p, req.world, req.tier) ? null : req;
};

/** may this map be entered at all? */
export const isWorldUnlocked = (p: Progress, worldId: string): boolean =>
  worldLock(p, worldId) == null;

// ---------- the tree ----------

/**
 * What a tree node can do right now. "hidden" nodes (parent unowned) are
 * not drawn at all; "locked-level" nodes are drawn dimmed with the level
 * they wait for; "poor" is a node the save could take but has no point
 * for; "owned" has nothing left to sell.
 */
export type NodeStatus = "buyable" | "poor" | "locked-level" | "owned" | "hidden";

export function nodeStatus(p: Progress, node: TechKind): NodeStatus {
  const def = techNode(node);
  if (def.requires && !owns(p.tech, def.requires)) return "hidden";
  if (owns(p.tech, node)) return "owned";
  if (def.requiresLevel != null && levelOf(p) < def.requiresLevel) return "locked-level";
  return pointsFree(p) >= techPoints(node) ? "buyable" : "poor";
}

/**
 * Take a node — one click, its whole cost in points. Returns null when it
 * could not be bought, so the caller can leave its control alone rather
 * than showing a button that does nothing.
 */
export function buyTech(node: TechKind): Progress | null {
  const p = loadProgress();
  if (nodeStatus(p, node) !== "buyable") return null;
  p.tech[node] = 1;
  // A PURCHASE IS REAL EVEN UNDER A GRANT, so it has to be written into
  // the row that survives (see Progress.techBought). Without this the node
  // would live only in the view and saveProgress would peel it straight
  // back off
  if (p.techBought) p.techBought[node] = 1;
  // A turret's unlock should ride the build bar without a trip through the
  // loadout picker. A save that has never curated already gets this — the
  // bar auto-fills from whatever is unlocked — so only a curated save needs
  // the new kind written in, and only while its picks leave a slot free
  if (isTowerNode(node) && p.loadout && !p.loadout.includes(node)) {
    const picks = p.loadout;
    if (picks.length < techState(p.tech).barSlots)
      p.loadout = BY_MINDUSTRY_VALUE.filter((k) => k === node || picks.includes(k));
  }
  saveProgress(p);
  return p;
}

/**
 * MAY THIS NODE BE HANDED BACK RIGHT NOW? Owned, worth something, and
 * nothing that hangs off it still owned — a branch is taken back from its
 * tip, so the tree's shape holds and no owned node is ever left without
 * the node it requires.
 */
export const canRefund = (p: Progress, node: TechKind): boolean =>
  owns(p.tech, node) &&
  isRefundable(node) &&
  childrenOf(node).every((c) => !owns(p.tech, c));

/**
 * Hand a node back, and the points it cost with it. Points are derived,
 * so the refund is the node ceasing to be owned and nothing else — there
 * is nothing to credit and nothing to farm. A node still holding up a
 * child refuses (canRefund).
 */
export function refundTech(node: TechKind): Progress | null {
  const p = loadProgress();
  if (!canRefund(p, node)) return null;
  delete p.tech[node];
  if (p.techBought) delete p.techBought[node];
  // a turret handed back leaves the bar too, or the bar would carry a
  // button for a turret the save no longer owns
  if (isTowerNode(node) && p.loadout) p.loadout = p.loadout.filter((k) => k !== node);
  saveProgress(p);
  return p;
}

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
