import { UNIT_KINDS, UNIT_STATS, unitDrop, WORLD, WORLDS } from "./levels";
import { OFFICIAL_MAP_IDS } from "./maps";
import { OPENING_DUOS, tierDropBonus, TOP_TIER, WORLD_REQUIRES } from "./ladder";
import { MUTATION_MAX, cleanMutations } from "./mutation";
import {
  addScaled,
  canAfford,
  costEntries,
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
  BY_MINDUSTRY_VALUE,
  isMaxed,
  isRefundable,
  isTowerNode,
  NODE_SPEED,
  bandForTier,
  TECH_KINDS,
  techCap,
  techNode,
  techPrice,
  techState,
  isToggleable,
  towerBand,
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
   * HOW FAR UP EACH MAP'S OWN LADDER THIS SAVE HAS CLIMBED, keyed by world
   * id. On a map with value `c`, tiers 0..c-1 are beaten and tier `c` is
   * that map's frontier — the highest it will let you attempt. `c` reaching
   * TOP_TIER + 1 means that map is finished.
   *
   * ONE NUMBER PER MAP, NOT ONE FOR THE SAVE. Clearing Onslaught somewhere
   * says nothing about anywhere else: every map is on the menu from the
   * first run and every map is climbed from the bottom. A map absent from
   * this record has never been won on and reads 0.
   *
   * IT DOES NOT DECIDE WHAT A RUN MAY BRING. That is the difficulty's own
   * fixed property (bandForTier in tech.ts) and no amount of progress
   * moves it.
   */
  clearedByMap: Record<string, number>;
  /**
   * Tech points per node. On a turret the points are its placement
   * capacity; on a utility (home, the speed unlocks) there is only one and
   * it means the switch is on.
   */
  tech: TechLevels;
  /**
   * Boss trophies already collected, as "<worldId>:<tier>:<kind>" keys.
   * A boss's FIRST kill on each world+difficulty pays one surge alloy and
   * writes its key here so the same boss can never pay twice (see
   * grantRunReward) — which makes the bank's surge column a counter of how
   * many distinct boss fights this save has won, not a farmable income.
   */
  bossKills?: string[];
  /**
   * The last layout built on each map AND DIFFICULTY, keyed `map@tier` (see
   * layoutKey) — so a lost run does not cost the player the twenty minutes
   * of placing they already did.
   *
   * Safe to keep because PLACING IS FREE: a tower costs nothing but a point
   * of its node's capacity (see Sim.canPlace), and towers build on rock, so
   * a restored layout cannot seal a route or hand back value that was spent.
   * It is convenience, not progress.
   *
   * ONE SLOT PER DIFFICULTY, NOT ONE PER MAP. A board that holds Incursion
   * is not the board that holds Nemesis — same terrain, a different fight —
   * and a player stepping back down to farm wants the board they farmed
   * with, not whatever the last hard run left standing. What crosses
   * between them is the CLEAR: beating a difficulty for the first time
   * stamps the winning board into the difficulty it just opened, so the
   * next one starts from the answer to the last one (see seedLayout).
   *
   * Keyed by MAP rather than by level: the layout is a fact about terrain,
   * and two levels on one map want the same emplacements. A key with no
   * `@` is a PRE-SPLIT save's single per-map layout; splitLegacyLayouts
   * copies it across on load and no key like that survives a save.
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
  /**
   * NODES THE SAVE OWNS BUT HAS SWITCHED OFF — see TechNodeDef.toggle.
   *
   * Not a refund and not a loss: every point stays in `tech` and the node
   * still draws as owned. This only says which of them are ALLOWED TO
   * APPLY, which is the difference between a shop and a settings switch. A
   * player who bought pierce, found it changed the turret into something
   * they did not want to play with, and put it back down has lost nothing
   * for having tried it.
   *
   * A node listed here that is not toggleable is ignored on load — the
   * flag lives on the node, so a save cannot switch off something the tree
   * never offered to switch off.
   */
  techOff?: TechKind[];
  /**
   * THE FULL UNLOCK IS ON FOR THIS SAVE — the back door's switch (see
   * unlockEverything).
   *
   * It is a FLAG AND NOT A PILE OF POINTS, which is the whole reason it
   * can be turned off again. It used to write `min(500, techCap)` into
   * every node and then it was simply gone: granted points and bought
   * points are the same number in the same field, so nothing could tell
   * them apart afterwards and there was nothing to undo. Worse, the
   * grant was permanent by accident — every save the game makes goes
   * through loadProgress and back out through saveProgress, so the first
   * layout stored, speed changed or run finished after the door was
   * opened wrote the whole grant into the file as if it had been earned.
   *
   * Now the points are laid over the save at LOAD (see loadProgress) and
   * stripped again at SAVE (see saveProgress), so what is on disk stays
   * exactly what the player actually bought. Clearing this one boolean
   * hands the real save straight back.
   */
  unlocked?: boolean;
  /**
   * WHAT THE SAVE REALLY HOLDS, when a grant has been laid over `tech`.
   *
   * Present only on a Progress that loadProgress granted to — the dev
   * switch or `unlocked` above — and NEVER written to disk. It is the
   * memory that makes the grant reversible: `tech` is the view the game
   * plays with, this is the row the file keeps, and saveProgress writes
   * this one whenever it exists.
   *
   * Every mutation path in this file is load → change → save, so without
   * it each of those paths would quietly promote the view to the truth.
   */
  techBought?: TechLevels;
  /**
   * The MUTATION ranks switched on for the next run (see mutation.ts) —
   * the optional rules the player has chosen to play under, kept across
   * runs and sessions like `speed` is, because it is a statement about how
   * this player wants to play rather than a fact about one run.
   *
   * It is a CHOICE, not a possession: what a save has EARNED is its rank,
   * and rank is read off the boss ledger (mutationRank) rather than stored
   * here. Absent, or empty, means the campaign as authored.
   *
   * A save written before the line was renamed holds this under
   * `ascension`, which readMutations still reads — the word changed, the
   * switches a player had flipped did not.
   */
  mutations?: number[];
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

/** every currency starts empty — kills are the only income, so the first
 * purchase of the campaign is paid for by the first waves the duos kill */
const freshBank = (): Bank => emptyBank();

const fresh = (): Progress => ({
  bank: freshBank(),
  clearedByMap: {},
  // home is free and granted outright — it is the root the whole tree hangs
  // off, and a save without it would draw nothing at all. Duo's node hangs
  // off home, so granting both leaves no orphan the tree would refuse to
  // draw. Nothing else is free: see OPENING_DUOS
  tech: { home: 1, duo: DUO_START },
});

/**
 * DEV SWITCH: GRANT EVERY TECH NODE ON LOAD. Flip to false to turn it off.
 *
 * This is a debugging convenience, not a game rule, and it is the honest
 * way to hand a developer the whole tree: a save written straight into
 * localStorage only lands in the browser profile that wrote it AND on the
 * exact origin it wrote it to, so one poked into localhost:3000 is invisible
 * from 127.0.0.1:3000, from a second browser, and from a private window.
 * This is read on every load instead, so it holds everywhere the dev server
 * is reachable from.
 *
 * IT NEVER APPLIES TO A PRODUCTION BUILD, whatever this is set to — the
 * NODE_ENV guard below is what makes leaving it on merely noisy rather than
 * a way to ship the game with its progression already finished.
 *
 * It grants NODES ONLY. The bank is untouched (nothing needs paying for —
 * the points are already in), and so is `cleared`, which is what gates the
 * difficulties: the ladder still opens by clearing the tier below it, and
 * Eradication additionally wants the "A Final Threat" node this grants. So
 * a fresh save with this on can field every turret at Incursion and climbs
 * the ladder normally.
 */
const DEV_UNLOCK_ALL = true;

/** is the dev unlock actually in force? production ignores the switch */
const devUnlocking = (): boolean =>
  DEV_UNLOCK_ALL && process.env.NODE_ENV !== "production";

/**
 * THE MUTATION RANK a boss ledger is worth — how far up the tree's left
 * column that save has climbed. Zero on a fresh save, and every save starts
 * there.
 *
 * ONE RANK PER BOSS FELLED, and the count is the ledger ITSELF (one entry
 * per distinct boss fight won, see grantRunReward). Nothing separate is
 * stored: a second number counting the same events is a second number that
 * can disagree with the first, and the ledger is already the save's answer
 * to "which bosses has this player beaten". A boss can therefore never pay
 * a rank twice — the ledger refuses to record it twice — so mutation is
 * earned by beating a boss somewhere new (a fresh world, or a difficulty
 * above the one it last fell on), never by farming the wave it dies on.
 *
 * THE DEV SWITCH REACHES HERE TOO (see DEV_UNLOCK_ALL). It hands a
 * developer the whole tree without playing the campaign, and the mutation
 * line is out of reach for exactly the reason the tree is: its first rank
 * sits behind a boss at the end of a fifty-wave script. Production ignores
 * the switch, so the shipped game earns every rank the honest way.
 *
 * IT IS ONE FUNCTION BECAUSE BOTH READERS MUST AGREE. The save loader
 * cleans the switched-on list against this, and the tree offers switches
 * against it; if they disagreed by so much as the dev grant, a switch the
 * tree let you flip would be scrubbed back off on the very next load.
 */
const rankOf = (bossKills: readonly string[] | undefined): number =>
  devUnlocking() ? MUTATION_MAX : Math.min(MUTATION_MAX, bossKills?.length ?? 0);

/**
 * Raise every node to a usable number of points, keeping anything the save
 * already holds if it is higher. 500 placements is far past what a board
 * has room for and stays under every turret's ceiling; the clamp to
 * techCap is what turns it into exactly 1 on the utilities, which are
 * switches rather than stacks.
 *
 * A REFUNDABLE NODE IS NEVER GRANTED, AND THIS IS LOAD-BEARING. A refund
 * hands back the price of the point being returned (refundTech), so a
 * point that arrives free is a point that can be sold for money that was
 * never paid. With the dev switch on it was worse than a one-off: the
 * grant runs on every loadProgress, so refunding `duo-power` gave a surge
 * alloy, the very next load handed the node straight back, and the pair
 * could be cycled for as much surge as the player had patience for.
 *
 * Skipping them here fixes it at the root and buys an invariant worth
 * having: OWNING A REFUNDABLE NODE MEANS IT WAS BOUGHT. So the refund is
 * always honest, and no purchase ledger has to be kept to prove it.
 *
 * The node stays reachable behind the cheats — unlockEverything hands over
 * the PRICE instead, which is the same offer without the hole.
 */
function grantEveryNode(tech: TechLevels): TechLevels {
  for (const k of TECH_KINDS) {
    if (isRefundable(k)) continue;
    tech[k] = Math.max(tech[k] ?? 0, Math.min(500, techCap(k)));
  }
  return tech;
}

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
  // A PRE-SPLIT SAVE CARRIED ONE NUMBER for the whole campaign, and it was
  // earned on the first world — that is the only map its ladder ever ran on.
  // So it lands there and nowhere else. Handing it to every map would open
  // maps this save has not played at a tier it has not reached on them,
  // which is exactly the reach across maps the split exists to remove.
  const legacy = readLegacyCleared(p);
  if (legacy > 0) out[WORLD.id] = legacy;
  return out;
}

function readLegacyCleared(p: { cleared?: unknown; completed?: unknown }): number {
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
    if (!raw) {
      const p = fresh();
      // a fresh save cannot carry the back door's flag, so only the dev
      // switch can be granting here — but it is granting all the same, and
      // the snapshot has to be taken or the first save would bake it in
      if (devUnlocking()) {
        p.techBought = { ...p.tech };
        grantEveryNode(p.tech);
      }
      return p;
    }
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
    // neither grant can legitimately sit below its free starting value —
    // this also migrates saves from before the per-turret point model, from
    // before home existed at all, and any save written while the baseline
    // was tuned to a smaller loadout. Points only ever go up (there is no
    // selling a node), so a floor can never take anything from a player who
    // has bought past it.
    //
    // ARC HAS NO FLOOR ANY MORE, and deliberately keeps no floor: a save
    // that was handed the five free arcs KEEPS them, because points are
    // never taken back, but no new save is given any
    tech.home = 1;
    tech.duo = Math.max(tech.duo ?? 0, DUO_START);
    // WHERE THE GRANT IS LAID ON, for both doors into it: the dev switch
    // and the save's own `unlocked` flag. It rides on top of a REAL save
    // the same way it does on a fresh one and only ever raises a count.
    //
    // `techBought` is the copy taken BEFORE the grant, and it is what makes
    // "turning it off later gives the save back exactly as it was" true
    // rather than merely intended — saveProgress writes that copy, so no
    // amount of ordinary play can promote a granted point into a bought
    // one. See the field's note on Progress.
    const unlocked = p.unlocked === true;
    const granting = devUnlocking() || unlocked;
    const techBought = granting ? { ...tech } : undefined;
    if (granting) grantEveryNode(tech);
    const bossKills = readBossKills(p);
    const clearedByMap = readClearedByMap(p);
    const layouts = readLayouts(p);
    // a pre-split save is rewritten here rather than re-split on every
    // load: loadProgress runs on a timer during a run, and a migration
    // that never settles would keep handing back boards the player has
    // since cleared away
    const split = splitLegacyLayouts(layouts, clearedByMap);
    const loaded: Progress = {
      bank: readBank(p),
      clearedByMap,
      tech,
      bossKills,
      layouts,
      speed: readSpeed(p),
      hudMinimized: p.hudMinimized === true,
      loadout: readLoadout(p),
      techOff: readTechOff(p),
      unlocked,
      ...(techBought ? { techBought } : null),
      // cleaned against the rank this save has actually earned, so a switch
      // left on by a wiped ledger (or by a hand-edited save) reads as off
      // rather than as a rule the run has no right to be playing under
      mutations: readMutations(p, rankOf(bossKills)),
    };
    if (split) saveProgress(loaded);
    return loaded;
  } catch {
    return fresh();
  }
}

/**
 * The boss-trophy ledger out of a raw save: known-shape string keys only,
 * deduped. A mangled entry drops out rather than throwing — the worst case
 * is a boss paying its trophy a second time, which beats a dead save.
 */
function readBossKills(p: { bossKills?: unknown }): string[] {
  if (!Array.isArray(p.bossKills)) return [];
  const out: string[] = [];
  for (const k of p.bossKills)
    if (typeof k === "string" && k.length > 0 && !out.includes(k)) out.push(k);
  return out;
}

/**
 * Layouts out of a raw save, keys included: a `map@tier` slot and a
 * pre-split bare `map` key both pass through untouched, because the key is
 * only ever used to look one up (layoutFor) and an unrecognised one simply
 * matches nothing.
 *
 * Every field is re-validated rather than trusted:
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
 * The switched-off nodes out of a raw save: known kinds only, deduped, and
 * only nodes the tree actually offers a switch on. A save naming anything
 * else — hand-edited, or written when a node was toggleable and is not any
 * more — quietly drops it rather than holding an effect off that nothing
 * can turn back on.
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

/**
 * The switched-on ranks out of a raw save, cleaned against the rank this
 * save has actually earned — so a switch left on by a wiped ledger, or by a
 * hand-edited save, reads as off rather than as a rule the run has no right
 * to be playing under.
 *
 * `ascension` is the field's old name and is read when the new one is
 * absent. The line was renamed, not reset: a player who had Hungry switched
 * on before the rename still has it switched on after.
 */
function readMutations(p: object, rank: number): number[] {
  const raw = p as { mutations?: unknown; ascension?: unknown };
  return cleanMutations(raw.mutations ?? raw.ascension, rank);
}

/** how far up the tree's left column this save has climbed — see rankOf */
export const mutationRank = (p: Progress): number => rankOf(p.bossKills);

/** the ranks this run will actually be played under: what the player
 *  switched on, held to what they have earned */
export const activeMutations = (p: Progress): number[] =>
  cleanMutations(p.mutations, mutationRank(p));

/** switch one mutation rank on or off, and remember it for the next run */
export function saveMutation(level: number, on: boolean): Progress {
  const p = loadProgress();
  const have = new Set(activeMutations(p));
  if (on) have.add(level);
  else have.delete(level);
  const next = { ...p, mutations: cleanMutations([...have], mutationRank(p)) };
  saveProgress(next);
  return next;
}

/** remember which turrets ride in the build bar's slots */
export function saveLoadout(kinds: readonly TowerKind[]): void {
  const p = loadProgress();
  saveProgress({ ...p, loadout: [...kinds] });
}

/**
 * How far up a map's ladder this save has climbed, found from a MAP id
 * rather than a world id — the two are different names for the same thing
 * from opposite sides, and layouts are filed by map while progress is
 * filed by world. Several worlds could name one map; the furthest of them
 * is the answer, since the map has demonstrably been beaten that far.
 */
function clearedOnMap(clearedByMap: Record<string, number>, mapId: string): number {
  let best = 0;
  for (const w of WORLDS)
    if ((w.map ?? OFFICIAL_MAP_IDS[0]) === mapId)
      best = Math.max(best, Math.floor(clearedByMap[w.id] ?? 0));
  return best;
}

/**
 * SPLIT A PRE-SPLIT SAVE'S LAYOUTS, one per map, into one per difficulty.
 *
 * Layouts used to be filed one to a map with no difficulty attached. Such
 * a save has, in effect, already built that board on every difficulty it
 * ever played, so it gets it back on every difficulty it has UNLOCKED —
 * anything up to the map's frontier. Difficulties past the frontier are
 * left empty on purpose: they have never been seen, and the first clear
 * below them is what hands a board up (see seedLayout).
 *
 * ILLEGAL TURRETS ARE DROPPED ON THE WAY THROUGH, DIFFICULTY BY
 * DIFFICULTY. What a run may bring is fixed by the difficulty
 * (bandForTier) and these boards were built before that rule existed, so
 * one board can easily be legal on Nemesis and illegal on Incursion.
 * Each copy is therefore filtered against the tier it lands on — the same
 * board arrives thinner the further down it goes. Copying unfiltered would
 * stand up turrets that difficulty would never let the player place by
 * hand.
 *
 * A slot that already exists is never touched, and the bare key is dropped
 * once it has been split, so this runs exactly once per save.
 */
function splitLegacyLayouts(
  layouts: Record<string, TowerPlacement[]>,
  clearedByMap: Record<string, number>,
): boolean {
  let changed = false;
  for (const key of Object.keys(layouts)) {
    if (key.includes("@")) continue;
    const board = layouts[key];
    delete layouts[key];
    changed = true;
    const cleared = clearedOnMap(clearedByMap, key);
    // 0..frontier inclusive: the frontier is unlocked — it is the tier the
    // map is offering to play next — and everything under it is beaten
    for (let tier = 0; tier <= Math.min(TOP_TIER, cleared); tier++) {
      const slot = layoutKey(key, tier);
      if (layouts[slot]) continue;
      const band = bandForTier(tier);
      const legal = board.filter((t) => towerBand(t.kind) <= band);
      if (legal.length > 0) layouts[slot] = legal.map((t) => ({ ...t }));
    }
  }
  return changed;
}

/** which slot a board is filed in: one map, one difficulty */
const layoutKey = (mapId: string, tier: number): string =>
  `${mapId}@${Math.min(TOP_TIER, Math.max(0, Math.floor(tier)))}`;

/**
 * The blueprint to stand up when a run on this map and difficulty begins.
 *
 * Nothing to fall back to: a save that predates the split had its one
 * per-map board copied into every difficulty it had unlocked when it
 * loaded (see splitLegacyLayouts), so by the time anything reads one the
 * slots are already filled.
 */
export const layoutFor = (
  p: Progress,
  mapId: string,
  tier: number,
): TowerPlacement[] | undefined => p.layouts?.[layoutKey(mapId, tier)];

/** remember what was standing on a map and difficulty when the run ended */
export function saveLayout(
  mapId: string,
  tier: number,
  towers: readonly TowerPlacement[],
): void {
  const p = loadProgress();
  const layouts = { ...(p.layouts ?? {}) };
  const key = layoutKey(mapId, tier);
  if (towers.length > 0) layouts[key] = towers.map((t) => ({ ...t }));
  else delete layouts[key];
  saveProgress({ ...p, layouts });
}

/**
 * Hand a winning board forward: file it as the opening blueprint for a
 * difficulty, but ONLY IF THAT DIFFICULTY HAS NONE. Called on a first
 * clear, against the tier the clear just opened.
 *
 * The empty-slot rule is what keeps it from being a wrecking ball. A
 * player who has already played the tier above has a board there they
 * built on purpose, and a later replay of the tier below must not
 * overwrite it — the paste is a leg up for a difficulty being seen for the
 * first time, not a sync between them.
 *
 * The bare pre-split key is deliberately NOT consulted: it stands in for
 * "no board here yet", and a newly opened difficulty should get the board
 * that actually won rather than keep inheriting the legacy one.
 *
 * Nothing is filtered on the way up. The board is only ever handed to a
 * HARDER difficulty, and the band only widens as the ladder climbs
 * (bandForTier), so every turret that was legal where it won is legal
 * where it lands. The split migration, which pushes boards DOWNWARD into
 * easier difficulties, is the one that has to filter.
 */
export function seedLayout(
  mapId: string,
  tier: number,
  towers: readonly TowerPlacement[],
): boolean {
  if (towers.length === 0) return false;
  const p = loadProgress();
  const key = layoutKey(mapId, tier);
  if (p.layouts?.[key]) return false;
  saveProgress({ ...p, layouts: { ...(p.layouts ?? {}), [key]: towers.map((t) => ({ ...t })) } });
  return true;
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

/**
 * Write the save — with any UNLOCK VIEW peeled back off it first.
 *
 * THIS IS THE HALF THAT MAKES THE GRANT REVERSIBLE. loadProgress hands out
 * a Progress whose `tech` may be every node in the tree; almost every
 * writer in this file then takes that object, changes one unrelated thing
 * — a layout, the speed, a cleared tier — and passes the whole of it back
 * here. Storing it verbatim is what used to make the full unlock permanent
 * and, once stored, indistinguishable from a campaign someone had played.
 *
 * So the granted rows never reach the disk: `techBought` is the row the
 * file keeps, and it is dropped from the JSON along with the view.
 */
export function saveProgress(p: Progress): void {
  try {
    const { techBought, ...rest } = p;
    const out: Progress = techBought ? { ...rest, tech: techBought } : rest;
    localStorage.setItem(KEY, JSON.stringify(out));
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

/**
 * The save's tech AS ONE DIFFICULTY WILL HONOUR IT. Two gates stack here
 * and they answer different questions: `p.tech` is what this save OWNS,
 * bought once and owned everywhere, and the tier's band is what this
 * difficulty will let through its door, which is a constant of the
 * difficulty and never moves. A save with every turret still plays an
 * Incursion holding duos — the first time and the hundredth.
 *
 * Pass no tier and there is no difficulty gate — the editor and sandbox,
 * where owning a turret is the only question worth asking.
 */
export function techOf(p: Progress, tier?: number): TechState {
  return techState(p.tech, tier == null ? undefined : bandForTier(tier), techOffSet(p));
}

/** the nodes this save has switched off, as the set techState wants */
export const techOffSet = (p: Progress): ReadonlySet<TechKind> => new Set(p.techOff ?? []);

/** is this owned node applying its effect? — the tree's On/Off state */
export const isTechOn = (p: Progress, node: TechKind): boolean =>
  !(p.techOff ?? []).includes(node);

/**
 * Switch one owned node's effect on or off, keeping its points either way.
 * A node the tree offers no switch on cannot be switched: the flag is the
 * node's, not the save's.
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

/** how many tiers this save has cleared on one map */
export const clearedOn = (p: Progress, worldId: string): number =>
  Math.max(0, Math.floor(p.clearedByMap[worldId] ?? 0));

/**
 * The highest tier that can be attempted: every cleared one, plus the
 * frontier. A player may replay any tier below it to farm — a cleared tier
 * pays exactly what it always did — but only the frontier moves the
 * campaign forward.
 *
 * ERADICATION IS HIDDEN BEHIND THE TREE, not behind clearing: the table's
 * top tier only exists for a save that owns the "A Final Threat" node.
 * Without it the ladder tops out one below, at Nemesis, exactly as the
 * visible campaign always has. This is the one difficulty gated by tech —
 * everything under it still unlocks purely by clearing the tier below.
 */
export const topTier = (p: Progress, worldId: string): number =>
  Math.min(TOP_TIER, clearedOn(p, worldId));

/**
 * The best any map has done, for the things that are still about the SAVE
 * rather than about a map — a tech node with a `requiresTier` gate is a
 * purchase, and a purchase is owned campaign-wide, so it asks whether this
 * save has ever cleared that tier anywhere.
 */
export const bestTierCleared = (p: Progress): number =>
  Object.values(p.clearedByMap).reduce((a, b) => Math.max(a, Math.floor(b)), 0);

/**
 * Has the whole campaign been beaten? `cleared` runs one past the top tier
 * on the final win, which is the only state that means "there is nothing
 * above this".
 */
export const isCampaignComplete = (p: Progress, worldId: string): boolean =>
  clearedOn(p, worldId) > TOP_TIER;

/** has this tier been beaten? (the frontier itself has not) */
export const isTierCleared = (p: Progress, worldId: string, tier: number): boolean =>
  tier < clearedOn(p, worldId);

/** may this tier be played at all? */
export const isTierUnlocked = (p: Progress, worldId: string, tier: number): boolean =>
  tier >= 0 && tier <= topTier(p, worldId);

/**
 * WHAT IS STILL STANDING BETWEEN THIS SAVE AND A MAP — the requirement it
 * has not met, or null when the map is open.
 *
 * Returns the requirement rather than a boolean because every caller that
 * cares needs to SAY it: a locked map that will not say what unlocks it is
 * a dead end on the screen. See WORLD_REQUIRES.
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
  if (def.requiresTier != null && bestTierCleared(p) <= def.requiresTier) return "locked-tier";
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
  const wasOwned = (p.tech[node] ?? 0) > 0;
  const n = Math.min(Math.max(1, Math.floor(count)), affordablePoints(p, node, count));
  if (n < 1) return null;
  for (let i = 0; i < n; i++) {
    const owned = p.tech[node] ?? 0;
    pay(p.bank, techPrice(node, owned));
    p.tech[node] = owned + 1;
    // A PURCHASE IS REAL EVEN UNDER A GRANT, so it has to be written into
    // the row that survives (see Progress.techBought). Without this the
    // point would live only in the view and saveProgress would peel it
    // straight back off — a player who bought something with the dev
    // switch on would watch it vanish the moment they turned it off.
    if (p.techBought) p.techBought[node] = (p.techBought[node] ?? 0) + 1;
  }
  // A turret's FIRST point is its unlock, and a fresh unlock should ride
  // the build bar without a trip through the loadout picker. A save that
  // has never curated (loadout absent) already gets this — the bar
  // auto-fills from whatever is unlocked — so only a curated save needs
  // the new kind written in, and only while its picks leave a slot free:
  // a full bar means the player has chosen all of it, so nothing is
  // evicted on their behalf. Stored in canonical order like every other
  // loadout write, so the save reads exactly like the bar.
  if (!wasOwned && isTowerNode(node) && p.loadout && !p.loadout.includes(node)) {
    const picks = p.loadout;
    if (picks.length < techState(p.tech).barSlots)
      p.loadout = BY_MINDUSTRY_VALUE.filter((k) => k === node || picks.includes(k));
  }
  saveProgress(p);
  return p;
}

/**
 * THE BACK DOOR: raise every node in the tree to a usable number of points
 * and write it to the save, IN PRODUCTION TOO.
 *
 * WHY THIS EXISTS SEPARATELY FROM DEV_UNLOCK_ALL. That switch is compiled
 * out of a production build on purpose and should stay that way — the
 * shipped game must not hand the tree to whoever loads the page. But the
 * only device this game is actually played on by hand is an iPad, and an
 * iPad runs the DEPLOYED build: there is no dev server to point it at and
 * no keyboard for the Ctrl+Shift shortcuts the desktop debug modes use. So
 * testing anything past the first few waves meant playing the campaign to
 * get there, every time.
 *
 * IT IS A DELIBERATE ACT, NOT A FLAG. Nothing calls this on load. It is
 * reached only by the tap gesture on the settings screen (see Swarmfield),
 * which no player finds by accident and no player is told about — the same
 * bargain Android's build-number tap makes.
 *
 * NODES, exactly like the dev switch: the ladder still opens by clearing
 * tiers, and MUTATION RANKS ARE NOT GRANTED — those hang off the boss
 * ledger (rankOf), which is a record of fights actually won and not a
 * thing to forge. A save that takes this door still has to fell a boss to
 * get its first mutation.
 *
 * THE ONE THING IT PUTS IN THE BANK is the price of the refundable nodes,
 * because grantEveryNode refuses to hand those over (see the invariant
 * there) and a node this door could not reach at all would be a node that
 * cannot be tested on the device the door exists for. So it tops the
 * wallet up to what buying them costs and lets the player buy them
 * normally.
 *
 * TOPPING UP CANNOT BE FARMED, and that is why it is a max rather than a
 * credit. Tapping the door twice does nothing the first tap did not, and
 * the buy/refund cycle it enables is net zero — spend the surge on the
 * node, get the same surge back when you switch it off, and the ceiling
 * this sets is never exceeded. A `credit` here would have reopened the
 * very hole the invariant closes.
 */
export function unlockEverything(): Progress {
  const p = loadProgress();
  const bank = { ...p.bank };
  // WHAT EVERY REFUNDABLE NODE WOULD COST AT ONCE — the ultimates, which
  // are the only nodes grantEveryNode refuses to hand over. It is a TOTAL
  // rather than a per-node maximum because there are seventeen of them
  // now and a door that only ever funded the dearest one could not reach
  // the other sixteen at all.
  //
  // IT IS STILL A CEILING, NOT A CREDIT, and that is what keeps it
  // unfarmable: tapping the door twice does nothing the first tap did not,
  // and the buy/refund cycle it enables is net zero.
  const want: Cost = {};
  for (const k of TECH_KINDS) {
    if (!isRefundable(k)) continue;
    addScaled(want, techPrice(k, p.tech[k] ?? 0), 1);
  }
  for (const { item, amount } of costEntries(want))
    bank[item] = Math.max(bank[item], amount);
  // FLIP THE SWITCH, DO NOT POUR IN THE POINTS. loadProgress lays the whole
  // tree over the save while this is set and saveProgress peels it back
  // off, so what is stored stays the campaign the player actually played
  // and lockEverything can hand it back intact.
  saveProgress({ ...p, bank, unlocked: true });
  return loadProgress();
}

/**
 * SHUT THE BACK DOOR: clear the full unlock and give the save back exactly
 * as it was before the door was opened.
 *
 * Nothing is lost and nothing is taken. The granted points were never
 * stored (see Progress.unlocked), so this removes a view rather than a
 * possession: every node the player genuinely bought, every tier they
 * cleared and every boss they felled is still there, because none of it
 * was ever entangled with the grant.
 *
 * THE SURGE ALLOY THE DOOR HANDED OVER IS NOT CLAWED BACK, deliberately.
 * It is topped up to the price of the refundable nodes so they can be
 * tried at all (see unlockEverything), a `Math.max` that cannot stack, and
 * a save that has been through the door is not one whose bank is being
 * audited. Taking it back would also be wrong the moment any of it had
 * been spent.
 */
export function lockEverything(): Progress {
  const p = loadProgress();
  saveProgress({ ...p, unlocked: false });
  return loadProgress();
}

/** is the full unlock switched on for this save? */
export const isUnlocked = (p: Progress): boolean => p.unlocked === true;

/**
 * Hand a node's last point back, and the price of that point with it.
 *
 * ONLY A REFUNDABLE NODE ANSWERS (isRefundable — today that is `duo-power`
 * alone), and it refunds the price of the point BEING RETURNED rather than
 * the cheapest one: a curve is walked up and must be walked back down the
 * same steps, or a node with any climb at all becomes a money printer for
 * anyone willing to click twice.
 *
 * Returns null when there is nothing to give back, so the caller can leave
 * its control alone rather than showing a button that does nothing.
 */
export function refundTech(node: TechKind, count = 1): Progress | null {
  if (!isRefundable(node)) return null;
  const p = loadProgress();
  const n = Math.min(Math.max(1, Math.floor(count)), p.tech[node] ?? 0);
  if (n < 1) return null;
  for (let i = 0; i < n; i++) {
    const owned = p.tech[node] ?? 0;
    // the point coming back is the (owned - 1)th, which is the one whose
    // price was last paid
    credit(p.bank, techPrice(node, owned - 1));
    if (owned <= 1) delete p.tech[node];
    else p.tech[node] = owned - 1;
    // A REFUND IS REAL EVEN UNDER A GRANT, and this line is the whole
    // reason the node cannot be farmed. `p.tech` is the GRANTED VIEW while
    // the back door or the dev switch is on, and saveProgress writes
    // `techBought` in its place (see Progress.techBought) — so a refund
    // that only took the point off the view credited the currency and then
    // watched the point come straight back on the next load. Every click
    // was a free surge alloy. buyTech has always mirrored its purchases
    // here; this is the same line on the way back down.
    if (p.techBought) {
      const had = p.techBought[node] ?? 0;
      if (had <= 1) delete p.techBought[node];
      else p.techBought[node] = had - 1;
    }
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
  /** did this clear push THIS MAP'S frontier up a tier? */
  firstClear: boolean;
  /** the world it was played on — its ladder is the one that moved */
  worldId: string;
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
 *
 * `worldId` names the world the run was played on — it keys the boss
 * trophies, so the same boss on a different world is a different trophy.
 */
export function grantRunReward(
  tier: number,
  killsByKind: ArrayLike<number>,
  won: boolean,
  worldId: string = WORLD.id,
): RunReward {
  const p = loadProgress();
  const n = Math.min(TOP_TIER, Math.max(0, Math.floor(tier)));
  const firstClear = won && n >= clearedOn(p, worldId);
  // a tier pays the same whether or not it is new: what clearing the
  // frontier buys is the NEXT tier — more waves, more enemies, more kinds of
  // them — and that is the whole reason to push rather than farm
  const dropBonus = tierDropBonus(n);
  const earned = scaleCost(dropsForKills(killsByKind), dropBonus);
  // THE BOSS TROPHY: a boss kind's FIRST kill on each (world, difficulty)
  // pays exactly one surge alloy, on win or loss alike — the trophy is for
  // killing the boss, and a run can fell it and still leak elsewhere. The
  // key written here is what stops it ever paying again, so the bank's
  // surge column counts distinct boss fights won, not runs farmed. No
  // multiplier touches it: tier bonuses scale drops, and this is not a drop.
  const bossKills = p.bossKills ?? [];
  for (let i = 0; i < UNIT_KINDS.length; i++) {
    const kind = UNIT_KINDS[i];
    if (!UNIT_STATS[kind].boss || (killsByKind[i] ?? 0) <= 0) continue;
    const key = `${worldId}:${n}:${kind}`;
    if (bossKills.includes(key)) continue;
    bossKills.push(key);
    earned["surge-alloy"] = (earned["surge-alloy"] ?? 0) + 1;
  }
  p.bossKills = bossKills;
  credit(p.bank, earned);
  // the frontier only ever moves forward, and only by one: clearing tier 5
  // when tier 5 was the frontier opens tier 6, and replaying tier 2 later
  // does nothing
  if (firstClear) p.clearedByMap[worldId] = n + 1;
  saveProgress(p);
  return { earned, tier: n, dropBonus, firstClear, worldId };
}
