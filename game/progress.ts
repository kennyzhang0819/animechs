import { UNIT_KINDS, unitDrop } from "./levels";
import { OPENING_ARCS, OPENING_DUOS, tierDropBonus, TOP_TIER } from "./ladder";
import {
  addScaled,
  canAfford,
  credit,
  emptyBank,
  ITEM_KINDS,
  pay,
  type Bank,
  type Cost,
  type ItemKind,
} from "./items";
import {
  affordablePoints as affordableTechPoints,
  isMaxed,
  NODE_SPEED,
  TECH_KINDS,
  techNode,
  techPrice,
  techState,
  type TechKind,
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
   * How many tiers of the ladder have been cleared: tiers 0 .. cleared-1
   * are beaten, and tier `cleared` is the frontier — the highest tier that
   * can be attempted. The ladder is DIFFICULTIES long, so `cleared`
   * reaching TOP_TIER + 1 means the campaign is finished and there is
   * nothing above it (isCampaignComplete).
   */
  cleared: number;
  /**
   * Tech points per node. On a turret the points are its placement
   * capacity; on a utility (home, the speed unlocks) there is only one and
   * it means the switch is on.
   */
  tech: TechLevels;
  /**
   * The last layout built on each map, by map id — so a lost run does not
   * cost the player the twenty minutes of placing they already did.
   *
   * Safe to keep because PLACING IS FREE: a tower costs nothing but a point
   * of its node's capacity (see Sim.canPlace), and towers build on rock, so
   * a restored layout cannot seal a route or hand back value that was spent.
   * It is convenience, not progress.
   *
   * Keyed by MAP rather than by level: the layout is a fact about terrain,
   * and two levels on one map want the same emplacements.
   */
  layouts?: Record<string, TowerPlacement[]>;
  /**
   * The fast-forward multiplier the player last picked, kept so a run does
   * not start at 1x every single time.
   *
   * A pace is a preference about how the player wants to spend their
   * minutes, not a fact about the run — someone who plays at 4x wants 4x
   * again after a loss, after a win, and after closing the tab. Absent on a
   * save that has never touched the control, which means 1x.
   *
   * What the save is ALLOWED to run at is a separate question, answered by
   * the tech tree: see startingSpeed, which reads this through it.
   */
  speed?: number;
  /**
   * The HUD's top-left panel collapsed to its one-line wave counter. A
   * preference about screen space, kept across runs for the same reason
   * `speed` is: a player who tucked the panel away wants it tucked away
   * after a loss, after a win, and after closing the tab.
   */
  hudMinimized?: boolean;
  /**
   * The build bar's loadout: which turrets ride in its slots. A SET in
   * effect — the bar always renders in the roster's canonical order
   * (BY_MINDUSTRY_VALUE in tech.ts), whatever order this holds. The bar
   * fits TechState.barSlots of them, PvZ-style — owning a turret does not
   * put it on the bar, picking it does. Absent on a save that has never
   * curated, which reads as "auto-fill the slots from whatever is
   * unlocked" (see Swarmfield's bar).
   */
  loadout?: TowerKind[];
}

/** one emplacement, as the save keeps it: what, and which cell */
export interface TowerPlacement {
  kind: TowerKind;
  gx: number;
  gy: number;
}

const KEY = "dagger-problem.progress.v1";

/**
 * The free opening loadout — a hand-tuned constant (see OPENING_DUOS in
 * ladder.ts).
 *
 * The core has one hit point, so a run demands a 100% kill rate. A fresh
 * save that cannot hold wave 1 is not a challenge, it is a die-and-grind
 * loop with no way out, because kills are the only income and a wipe on
 * wave 1 banks almost nothing. Past wave 1 the run pays for its own fleet.
 */
const DUO_START = OPENING_DUOS;
const ARC_START = OPENING_ARCS;

/** every currency starts empty — kills are the only income, so the first
 * purchase of the campaign is paid for by the first waves the duos kill */
const freshBank = (): Bank => emptyBank();

const fresh = (): Progress => ({
  bank: freshBank(),
  cleared: 0,
  // home is free and granted outright — it is the root the whole tree hangs
  // off, and a save without it would draw nothing at all. Arc's node hangs
  // off duo and duo's off home, so granting all three leaves no orphan the
  // tree would refuse to draw
  tech: { home: 1, duo: DUO_START, arc: ARC_START },
});

/**
 * The currency scale before scrap was dropped off the bottom of it, in the
 * old cheapest-first order. A balance saved under one of these names is
 * worth the same number of the item that took its place — the shift moved
 * every drop AND every price by one step together, so a shifted wallet buys
 * exactly what it used to.
 */
const LEGACY_ITEM_SHIFT: Record<string, ItemKind> = {
  scrap: "copper",
  copper: "titanium",
  titanium: "thorium",
  thorium: "plastanium",
};

/**
 * Pull the wallet out of a raw save.
 *
 * Two migrations run here. Pre-currency saves stored a single `scrap` number
 * and no bank at all. Saves from before the currency shift hold balances
 * under the old names, which are moved up a step rather than dropped —
 * silently zeroing a returning player's bank is worse than any inaccuracy in
 * the conversion. Anything missing or malformed reads as empty, not NaN.
 */
function readBank(p: { bank?: unknown; scrap?: unknown }): Bank {
  const bank = emptyBank();
  const raw = p.bank && typeof p.bank === "object" ? (p.bank as Record<string, unknown>) : null;
  if (raw) {
    // A PRE-SHIFT SAVE IS IDENTIFIED BY ITS SCRAP KEY, and the whole wallet
    // has to move together. Deciding per name instead would leave a pre-shift
    // save's copper sitting in copper — where it now means a currency one
    // step cheaper than the one it was earned as.
    const preShift = "scrap" in raw;
    for (const [k, v] of Object.entries(raw)) {
      if (typeof v !== "number" || v <= 0) continue;
      const item = preShift ? LEGACY_ITEM_SHIFT[k] : (k as ItemKind);
      if (item && item in bank) bank[item] += Math.floor(v);
    }
  } else if (typeof p.scrap === "number" && p.scrap > 0) {
    bank[LEGACY_ITEM_SHIFT.scrap] = Math.floor(p.scrap); // legacy single-currency save
  }
  return bank;
}

/**
 * How far up the ladder a raw save has climbed. Saves written before the
 * ladder existed carry `completed: string[]` — a list of cleared WORLD ids
 * — and there is no honest conversion from "beat world 2" to a tier, so
 * every one of them lands on the frontier its world count suggests: one
 * tier per world cleared. That keeps a returning player's tech gates open
 * without inventing progress they never made.
 */
function readCleared(p: { cleared?: unknown; completed?: unknown }): number {
  if (typeof p.cleared === "number" && p.cleared > 0) return Math.floor(p.cleared);
  if (Array.isArray(p.completed)) return p.completed.length;
  return 0;
}

/**
 * Every multiplier the game has, whether or not a given save owns it: 1x,
 * one per utility node, and 16x — which no node sells any more but sandbox
 * still offers, so a save made there has to be able to remember it. The tree
 * is the authority on which of these a save may USE — this is only what
 * counts as a real number to remember.
 */
const ALL_SPEEDS: readonly number[] = [1, 16, ...Object.values(NODE_SPEED)];

/**
 * The remembered pace out of a raw save. Anything that is not a multiplier
 * this game offers — a hand-edited save, or one written when the strip had
 * a pace it no longer has — reads as "never chosen", which is 1x.
 */
function readSpeed(p: { speed?: unknown }): number | undefined {
  return typeof p.speed === "number" && ALL_SPEEDS.includes(p.speed) ? p.speed : undefined;
}

/**
 * A node's ceiling, as the save loader needs it: a hand-edited or
 * stale save must not be able to claim four points of "2x speed".
 */
const techCapOf = (k: TechKind): number => techNode(k).cap ?? Infinity;

export function loadProgress(): Progress {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fresh();
    const p = JSON.parse(raw) as Partial<Progress> & { tech?: unknown; scrap?: unknown };
    const tech: TechLevels = {};
    if (p.tech && typeof p.tech === "object") {
      for (const k of TECH_KINDS) {
        const v = (p.tech as Record<string, unknown>)[k];
        if (typeof v === "number" && v > 0) tech[k] = Math.min(Math.floor(v), techCapOf(k));
      }
      // the bar's curation shipped briefly as its own "tower-filter" node
      // before becoming the slot ladder; a save that paid for it is granted
      // the first slot upgrade rather than silently losing the purchase
      const legacyFilter = (p.tech as Record<string, unknown>)["tower-filter"];
      if (typeof legacyFilter === "number" && legacyFilter > 0) tech["slot-7"] = 1;
    }
    // none of the three grants can legitimately sit below its free starting
    // value — this also migrates saves from before the per-turret point
    // model, from before home existed at all, and any save written while the
    // baseline was tuned to a smaller loadout. Points only ever go up (there
    // is no selling a node), so a floor can never take anything from a
    // player who has bought past it
    tech.home = 1;
    tech.duo = Math.max(tech.duo ?? 0, DUO_START);
    tech.arc = Math.max(tech.arc ?? 0, ARC_START);
    return {
      bank: readBank(p),
      cleared: readCleared(p),
      tech,
      layouts: readLayouts(p),
      speed: readSpeed(p),
      hudMinimized: p.hudMinimized === true,
      loadout: readLoadout(p),
    };
  } catch {
    return fresh();
  }
}

/**
 * Layouts out of a raw save. Every field is re-validated rather than trusted:
 * these are cell coordinates that will be replayed into placeTower, and a
 * stale or hand-edited save must degrade to "no layout" rather than throw.
 * Placement itself re-checks the terrain, so a cell that stopped being rock
 * simply loses its tower.
 */
function readLayouts(p: { layouts?: unknown }): Record<string, TowerPlacement[]> {
  const out: Record<string, TowerPlacement[]> = {};
  if (!p.layouts || typeof p.layouts !== "object") return out;
  const kinds = new Set<string>(TOWER_KINDS);
  for (const [mapId, raw] of Object.entries(p.layouts as Record<string, unknown>)) {
    if (!Array.isArray(raw)) continue;
    const list: TowerPlacement[] = [];
    for (const t of raw) {
      if (!t || typeof t !== "object") continue;
      const { kind, gx, gy } = t as Record<string, unknown>;
      if (typeof kind !== "string" || !kinds.has(kind)) continue;
      if (typeof gx !== "number" || typeof gy !== "number") continue;
      if (!Number.isInteger(gx) || !Number.isInteger(gy) || gx < 0 || gy < 0) continue;
      list.push({ kind: kind as TowerKind, gx, gy });
    }
    if (list.length > 0) out[mapId] = list;
  }
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

/** remember what was standing on a map when the run ended */
export function saveLayout(mapId: string, towers: readonly TowerPlacement[]): void {
  const p = loadProgress();
  const layouts = { ...(p.layouts ?? {}) };
  if (towers.length > 0) layouts[mapId] = towers.map((t) => ({ ...t }));
  else delete layouts[mapId];
  saveProgress({ ...p, layouts });
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

/**
 * The pace a run should start at: what the player last picked, as far as
 * `allowed` will carry it.
 *
 * Stepping DOWN to the nearest allowed multiplier rather than falling to 1x
 * is what makes a sandbox session harmless — a 16x picked with the tree
 * switched off comes back as the fastest pace the save actually owns, which
 * is what that player was reaching for.
 */
export function startingSpeed(p: Progress, allowed: readonly number[]): number {
  const want = p.speed ?? 1;
  let best = allowed[0] ?? 1;
  for (const m of allowed) if (m <= want && m > best) best = m;
  return best;
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
 * The highest tier that can be attempted: every cleared one, plus the
 * frontier — capped at TOP_TIER, because the ladder is finite and ends at
 * Nemesis. A player may replay any tier below it to farm — a
 * cleared tier pays exactly what it always did — but only the frontier
 * moves the campaign forward.
 */
export const topTier = (p: Progress): number => Math.min(TOP_TIER, p.cleared);

/**
 * Has the whole campaign been beaten? `cleared` runs one past the top tier
 * on the final win, which is the only state that means "there is nothing
 * above this".
 */
export const isCampaignComplete = (p: Progress): boolean => p.cleared > TOP_TIER;

/** has this tier been beaten? (the frontier itself has not) */
export const isTierCleared = (p: Progress, tier: number): boolean => tier < p.cleared;

/** may this tier be played at all? */
export const isTierUnlocked = (p: Progress, tier: number): boolean =>
  tier >= 0 && tier <= topTier(p);

/**
 * What a tree node can do right now. "hidden" nodes (parent unbought) are
 * not drawn at all; "locked-tier" nodes are drawn dimmed with the tier they
 * wait for; the rest differ only by affordability.
 */
export type NodeStatus = "buyable" | "poor" | "locked-tier" | "maxed" | "hidden";

export function nodeStatus(p: Progress, node: TechKind): NodeStatus {
  const def = techNode(node);
  const owned = p.tech[node] ?? 0;
  if (def.requires && (p.tech[def.requires] ?? 0) < 1) return "hidden";
  // "maxed" means nothing left to sell: a utility switch that is already
  // on, or a turret that has hit techCap (CAP_TILES over its footprint).
  // Saying so is friendlier than leaving a lit node that refuses every
  // click
  if (isMaxed(node, owned)) return "maxed";
  if (def.requiresTier != null && !isTierCleared(p, def.requiresTier)) return "locked-tier";
  return canAfford(p.bank, techPrice(node, owned)) ? "buyable" : "poor";
}

/**
 * How many more points this save could put into a node right now — the
 * price walk in tech.ts, plus the gates. `limit` caps it: the buy controls
 * ask for a specific step, and only "Max" wants the true ceiling.
 *
 * This exists because a mid-campaign bank buys turrets by the hundred — duo
 * starts at 8 copper and its curve is gentle for a long way (tech.ts) — and a
 * tree that could only be clicked one point at a time would make the game's
 * central action its most tedious one.
 */
export function affordablePoints(p: Progress, node: TechKind, limit = Infinity): number {
  if (nodeStatus(p, node) !== "buyable") return 0;
  return affordableTechPoints(p.bank, node, p.tech[node] ?? 0, limit);
}

/**
 * Put points into a node — unlock, or +N capacity. Buys as many as
 * asked for OR as many as the wallet covers, whichever is fewer, and
 * returns null only when it could not buy a single one, so a "×100" that
 * can afford 37 lands 37 rather than refusing.
 */
export function buyTech(node: TechKind, count = 1): Progress | null {
  const p = loadProgress();
  const n = Math.min(Math.max(1, Math.floor(count)), affordablePoints(p, node, count));
  if (n < 1) return null;
  for (let i = 0; i < n; i++) {
    const owned = p.tech[node] ?? 0;
    pay(p.bank, techPrice(node, owned));
    p.tech[node] = owned + 1;
  }
  saveProgress(p);
  return p;
}

/**
 * The bundle a run's kills are worth before the ladder's multipliers. Each
 * kind pays its own tier's item, so the shape of this bundle is the shape of
 * the wave that died: a pure dagger push is copper only, a spiroct column is
 * thorium only.
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
  /** the tier that was played */
  tier: number;
  /** drop multiplier the tier itself carries */
  dropBonus: number;
  /** did this clear push the frontier up a tier? */
  firstClear: boolean;
}

/**
 * Settle a FINISHED run into the save.
 *
 * Kills are the only income, so a defeat still banks everything the towers
 * killed on the way down — in whatever currencies those kills happened to
 * drop — multiplied by the tier's own drop bonus. Clearing the frontier
 * tier for the first time moves it up one.
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
  const n = Math.min(TOP_TIER, Math.max(0, Math.floor(tier)));
  const firstClear = won && n >= p.cleared;
  // a tier pays the same whether or not it is new: what clearing the
  // frontier buys is the NEXT tier — more waves, more enemies, more kinds of
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
