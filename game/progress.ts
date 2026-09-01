import { UNIT_KINDS, UNIT_STATS, unitDrop, WORLD, WORLDS } from "./levels";
import { OFFICIAL_MAP_IDS } from "./maps";
import { OPENING_DUOS, RUNG_COUNT, tierDropBonus, TOP_TIER, WORLD_REQUIRES } from "./ladder";
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
  TECH_KINDS,
  techCap,
  techNode,
  techPrice,
  techState,
  isToggleable,
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
   * hold more — a longer ladder is a table edit in ladder.ts and nothing
   * here.
   *
   * IT DOES NOT DECIDE WHAT A RUN MAY BRING. Nothing does any more: a
   * turret this save owns is placeable at every rung (see techState).
   */
  clearedByMap: Record<string, number>;
  /**
   * Tech points per node. On a turret the points are its placement
   * capacity; on a utility (home, the speed unlocks) there is only one and
   * it means the switch is on.
   */
  tech: TechLevels;
  /**
   * WHICH SAVE FORMAT THIS FILE WAS WRITTEN IN — see SAVE_VERSION.
   *
   * Absent means "written before the format was versioned", which is the
   * only state in which the shape-sniffing migrations below may run. It is
   * stamped by saveProgress on every write, so a save touched once by this
   * build can never be mistaken for an ancient one again.
   */
  saveVersion?: number;
  /**
   * Boss trophies already collected, as "<worldId>:<tier>:<kind>" keys.
   * A boss's FIRST kill on each world+rung pays one surge alloy and
   * writes its key here so the same boss can never pay twice (see
   * grantRunReward) — which makes the bank's surge column a counter of how
   * many distinct boss fights this save has won, not a farmable income.
   */
  bossKills?: string[];
  /**
   * ONE SAVED BOARD PER WORLD, keyed by world id — so a lost run does not
   * cost the player the twenty minutes of placing they already did.
   *
   * Safe to keep because PLACING IS FREE: a tower costs nothing but a point
   * of its node's capacity (see Sim.canPlace), and towers build on rock, so
   * a restored layout cannot seal a route or hand back value that was spent.
   * It is convenience, not progress.
   *
   * ONE SLOT, NOT ONE PER RUNG. It used to be keyed `map@tier`, a board a
   * difficulty, because the four difficulties were four different fights
   * and a rung's roster ceiling could make a board legal on one and illegal
   * on another. Neither is true now: the rungs are a continuous climb of the
   * same script, every turret is legal everywhere, and a player moving one
   * rung up or down wants the board they were just playing with rather than
   * whatever they left standing several rungs ago. Ten slots a world would
   * have been ten stale boards to keep in step by hand.
   *
   * Keyed by WORLD rather than by map or by level: terrain is a world's,
   * two levels on one world want the same emplacements, and two worlds on
   * one map still send different waves at it. Keys from older saves — a
   * bare map id, or `map@tier` — are collapsed into world slots on load by
   * migrateLayouts, and none of them survives a save.
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
   * Ambient effects — the particle work, and nothing a weapon is made of
   * (see Sim.setEffects). Switched OFF on a device that cannot afford
   * them, which is the whole reason the setting exists, so it is stored
   * the same way the pace and the HUD state are: a preference about the
   * hardware, still true after a loss and after closing the tab.
   *
   * Absent means ON — the effects shipped for years before the switch did,
   * and a save that has never seen it must not read as having turned them
   * off. Only an explicit `false` is off.
   */
  effects?: boolean;
  /**
   * The in-game HUD's size, as the --ui-scale multiplier (see globals.css)
   * — Settings → Interface. A preference about the eyes and the device,
   * kept across sessions like `effects` is. Absent means the shipped
   * default (UI_SCALE_DEFAULT); only a value from UI_SCALES is ever
   * stored, so a hand-edited save cannot draw the HUD at 0.01x.
   */
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
   * THIS SAVE HAS DECLINED THE DEV GRANT — the wipe's half of the back
   * door (see resetProgress and DEV_UNLOCK_ALL).
   *
   * The dev switch is read on every load rather than written once, which
   * is what makes it reach every browser the dev server is open in — and
   * what made "Reset save" a lie on a dev build: the file went, the whole
   * tree came straight back on the next load, and what the player had
   * asked for was a fresh campaign. So the wipe leaves this behind, and
   * it is the ONE thing a wipe writes: a fresh save that says, in the
   * save itself, that the grant is not wanted here.
   *
   * It is not a lock on the tree. The tap door (unlockEverything) still
   * opens it, and clearing the browser's storage by hand puts the dev
   * switch back where it was — this only says that a player who asked for
   * an empty save is not handed 500 points of everything a heartbeat
   * later. Production never grants anything, so there it is inert.
   */
  devGrantOff?: boolean;
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
   * THERE IS NO `mutations` FIELD ANY MORE, and its absence is the whole
   * of what the save has to say about mutators.
   *
   * It used to hold the ranks a player had switched on for their next run,
   * because mutation was an opt-in handicap earned off the boss ledger.
   * Mutators are now ROLLED per deploy, from the difficulty's budget (see
   * mutation.ts), so there is nothing to remember between runs: the roll
   * belongs to the run spec and dies with it. An old save's `mutations` or
   * `ascension` array is simply ignored on load — no migration, because
   * there is no field left for it to migrate into.
   */
}

/** one emplacement, as the save keeps it: what, and which cell */
export interface TowerPlacement {
  kind: TowerKind;
  gx: number;
  gy: number;
}

const KEY = "mechswarm.progress.v1";

/**
 * THE SAVE FORMAT'S VERSION, stamped on every write.
 *
 * It exists to kill a whole CLASS of bug rather than any one bug: the
 * migrations below used to identify an old save by SNIFFING FOR A KEY, and
 * a key sniff is a bet that the key will never mean anything else. That bet
 * was already lost. `readBank` read `"scrap" in bank` as "this save predates
 * the currency shift" — and scrap is a Mindustry item with a sprite already
 * vendored, so the day it becomes an ItemKind (see ITEM_KINDS in items.ts)
 * every save holding one would have had its whole wallet silently shifted a
 * step: copper read as titanium, titanium as thorium. Unrecoverable, and
 * invisible until a player noticed their bank was wrong.
 *
 * So: a save with NO version is older than this line and may be sniffed,
 * exactly as it always was — those saves are fixed, they cannot grow new
 * keys, and the sniffs are still right about them. A save WITH a version is
 * never sniffed again. Bump this only when the format changes in a way a
 * loader must branch on, and gate the branch on the number rather than on
 * the shape.
 */
const SAVE_VERSION = 1;

/**
 * The key the save lived under when the game was called "Sir, We Have a
 * Dagger Problem". A browser that played it still holds a campaign there,
 * so the loader falls back to it and the next save writes the campaign
 * back under KEY. Removable once no live install predates the rename.
 */
const LEGACY_KEY = "dagger-problem.progress.v1";

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
 * the points are already in), and so is `clearedByMap`, which is what gates
 * the rungs: every rung still opens by clearing the one below it, and
 * nothing in the tree can open one. So a fresh save with this on can field
 * every turret on rung 1 and climbs the ladder normally.
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
 * Two migrations run here, and BOTH ARE GATED ON THE SAVE BEING UNVERSIONED
 * (see SAVE_VERSION). Pre-currency saves stored a single `scrap` number and
 * no bank at all. Saves from before the currency shift hold balances under
 * the old names, which are moved up a step rather than dropped — silently
 * zeroing a returning player's bank is worse than any inaccuracy in the
 * conversion. Anything missing or malformed reads as empty, not NaN.
 *
 * A NEW CURRENCY IS NOT A MIGRATION. The wallet starts from emptyBank() and
 * only copies names it recognises, so a save written before an ItemKind
 * existed simply has no key for it and reads zero. That is what makes the
 * currency list cheap to grow — the expensive part was never the save, it
 * was the hand-authored tables that index the list (see items.ts).
 */
function readBank(p: { bank?: unknown; scrap?: unknown; saveVersion?: unknown }): Bank {
  const bank = emptyBank();
  // an unversioned save is older than SAVE_VERSION and fixed in shape, so
  // the sniffs below are still true of it; a versioned one is never sniffed
  const legacy = typeof p.saveVersion !== "number";
  const raw = p.bank && typeof p.bank === "object" ? (p.bank as Record<string, unknown>) : null;
  if (raw) {
    // A PRE-SHIFT SAVE IS IDENTIFIED BY ITS SCRAP KEY, and the whole wallet
    // has to move together. Deciding per name instead would leave a pre-shift
    // save's copper sitting in copper — where it now means a currency one
    // step cheaper than the one it was earned as.
    const preShift = legacy && "scrap" in raw;
    for (const [k, v] of Object.entries(raw)) {
      if (typeof v !== "number" || v <= 0) continue;
      const item = preShift ? LEGACY_ITEM_SHIFT[k] : (k as ItemKind);
      if (item && item in bank) bank[item] += Math.floor(v);
    }
  } else if (legacy && typeof p.scrap === "number" && p.scrap > 0) {
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
 * The HUD sizes Settings offers, smallest first. These are the only values
 * a save may hold (see readUiScale) — the setting is a picker, not a dial,
 * so every size shown is one that was actually laid out and checked.
 */
export const UI_SCALES = [0.75, 0.85, 1, 1.15] as const;
export const UI_SCALE_DEFAULT = 0.85;

/** the remembered HUD size; anything not in UI_SCALES reads as never set */
function readUiScale(p: { uiScale?: unknown }): number | undefined {
  return typeof p.uiScale === "number" && (UI_SCALES as readonly number[]).includes(p.uiScale)
    ? p.uiScale
    : undefined;
}

/**
 * A node's ceiling, as the save loader needs it: a hand-edited or
 * stale save must not be able to claim four points of "2x speed".
 */
const techCapOf = (k: TechKind): number => techNode(k).cap ?? Infinity;

export function loadProgress(): Progress {
  try {
    const raw = localStorage.getItem(KEY) ?? localStorage.getItem(LEGACY_KEY);
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
    // a wiped save carries the refusal, and it outranks the dev switch —
    // see Progress.devGrantOff. The tap door is still a door: `unlocked`
    // is the player asking for the grant, and asking gets it
    const devGrantOff = p.devGrantOff === true;
    const granting = devUnlocking({ devGrantOff }) || unlocked;
    const techBought = granting ? { ...tech } : undefined;
    if (granting) grantEveryNode(tech);
    const bossKills = readBossKills(p);
    const clearedByMap = readClearedByMap(p);
    const layouts = readLayouts(p);
    // an older save is rewritten here rather than re-collapsed on every
    // load: loadProgress runs on a timer during a run, and a migration
    // that never settles would keep handing back boards the player has
    // since cleared away
    const split = migrateLayouts(layouts);
    const loaded: Progress = {
      bank: readBank(p),
      clearedByMap,
      tech,
      bossKills,
      layouts,
      speed: readSpeed(p),
      hudMinimized: p.hudMinimized === true,
      // absent means ON — only an explicit false switches them off
      effects: p.effects !== false,
      uiScale: readUiScale(p),
      loadout: readLoadout(p),
      techOff: readTechOff(p),
      unlocked,
      ...(devGrantOff ? { devGrantOff } : null),
      ...(techBought ? { techBought } : null),
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
 * Layouts out of a raw save, keys included: a world slot and either of the
 * two older map-shaped keys all pass through untouched, because the key is
 * only ever used to look one up (layoutFor) or to migrate it, and an
 * unrecognised one simply matches nothing.
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

/** remember which turrets ride in the build bar's slots */
export function saveLoadout(kinds: readonly TowerKind[]): void {
  const p = loadProgress();
  saveProgress({ ...p, loadout: [...kinds] });
}

/**
 * COLLAPSE AN OLDER SAVE'S LAYOUTS INTO ONE BOARD PER WORLD.
 *
 * Two shapes came before this one, and both were filed by MAP: a bare
 * `map` key (one board a map, the oldest), then `map@tier` (one board a
 * map and difficulty). Neither key means anything now — a board is a
 * world's — so both are read out, matched to the worlds that play that
 * map, and written back under the world id.
 *
 * THE DEEPEST BOARD WINS. A `map@tier` save has up to four boards for one
 * map and only one slot to put them in, and the right one is the board
 * from the HIGHEST difficulty it kept: that is the fight the player last
 * solved, and every turret on it is legal at every rung now, so nothing has
 * to be filtered out of it on the way across. A bare key loses to any
 * `map@tier` board, being older than all of them.
 *
 * TWO WORLDS ON ONE MAP BOTH INHERIT IT, which is right — they have the
 * same terrain and the board was legal on it.
 *
 * Every old key is dropped once it has been read, and a world slot that
 * already exists is never touched, so this runs exactly once per save.
 */
function migrateLayouts(layouts: Record<string, TowerPlacement[]>): boolean {
  // the best board per map id: the highest tier slot seen, bare key last
  const byMap = new Map<string, { rank: number; board: TowerPlacement[] }>();
  let changed = false;
  for (const key of Object.keys(layouts)) {
    // a world id is never a map id, so a key already migrated is left alone
    if (WORLDS.some((w) => w.id === key)) continue;
    const at = key.indexOf("@");
    const mapId = at < 0 ? key : key.slice(0, at);
    // a bare key ranks BELOW every tier slot — it is older than all of them
    const parsed = at < 0 ? -1 : Number(key.slice(at + 1));
    const rank = Number.isFinite(parsed) ? parsed : -1;
    const board = layouts[key];
    delete layouts[key];
    changed = true;
    const best = byMap.get(mapId);
    if (board.length > 0 && (!best || rank > best.rank)) byMap.set(mapId, { rank, board });
  }
  if (!changed) return false;
  for (const w of WORLDS) {
    if (layouts[w.id]) continue;
    const best = byMap.get(w.map ?? OFFICIAL_MAP_IDS[0]);
    if (best) layouts[w.id] = best.board.map((t) => ({ ...t }));
  }
  return true;
}

/**
 * The blueprint to stand up when a run on this world begins — the board
 * that ended the last run on it, whatever rung that was.
 *
 * Nothing to fall back to: an older save's boards were collapsed into
 * world slots when it loaded (see migrateLayouts), so by the time anything
 * reads one the slot is already filled or was always empty.
 */
export const layoutFor = (p: Progress, worldId: string): TowerPlacement[] | undefined =>
  p.layouts?.[worldId];

/** remember what was standing on a world when the run ended */
export function saveLayout(worldId: string, towers: readonly TowerPlacement[]): void {
  const p = loadProgress();
  const layouts = { ...(p.layouts ?? {}) };
  if (towers.length > 0) layouts[worldId] = towers.map((t) => ({ ...t }));
  else delete layouts[worldId];
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
    // stamped on EVERY write, not just on new saves: one touch by this build
    // is what takes an old file out of reach of the shape sniffs for good
    out.saveVersion = SAVE_VERSION;
    localStorage.setItem(KEY, JSON.stringify(out));
  } catch {
    // private windows / blocked storage: the run still plays, nothing sticks
  }
}

/**
 * WIPE THE SAVE — and mean it, on a dev build too.
 *
 * Removing the file is only half the job while the dev switch is on: it is
 * read on every load, so the next loadProgress would hand the fresh save
 * all 500 points of every turret and the whole tree with it, and the
 * player who pressed Wipe would watch their campaign come back finished.
 * The back door's `unlocked` flag lives IN the save and goes with it; the
 * dev switch does not, so the refusal has to be written down.
 *
 * So a wipe under the switch stores one fresh save carrying `devGrantOff`
 * — an empty campaign that says the grant is not wanted here — instead of
 * storing nothing. With the switch off (production, always) there is
 * nothing to refuse and the keys simply go, exactly as before.
 *
 * The grant is still one tap away: the settings door (unlockEverything)
 * asks for it explicitly and gets it.
 */
export function resetProgress(): void {
  try {
    localStorage.removeItem(KEY);
    localStorage.removeItem(LEGACY_KEY); // or the pre-rename save would reappear
    if (devUnlocking()) saveProgress({ ...fresh(), devGrantOff: true });
  } catch {
    // ignore — same storage caveat as saveProgress
  }
}

/**
 * THE SAVE'S TECH, AND THAT IS THE WHOLE ANSWER. `p.tech` is what this save
 * owns, bought once and owned everywhere; owning a turret is now the only
 * question worth asking about whether it may be placed.
 *
 * It used to take a tier as well, and narrow the roster to what that
 * difficulty would admit (bandForTier, deleted — see techState in tech.ts).
 * A save with every turret in the tree now brings every turret in the tree,
 * to rung 1 and to rung 10 alike.
 */
export function techOf(p: Progress): TechState {
  return techState(p.tech, techOffSet(p));
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

/** how many rungs this save has cleared on one world */
export const clearedOn = (p: Progress, worldId: string): number =>
  Math.max(0, Math.floor(p.clearedByMap[worldId] ?? 0));

/**
 * The highest rung that can be attempted on a world: every cleared one,
 * plus the frontier. A player may replay any rung below it to farm — a
 * cleared rung pays exactly what it always did — but only the frontier
 * moves the ladder forward.
 *
 * NOTHING IS HIDDEN BEHIND TECH. Every rung opens by clearing the rung
 * below it and by nothing else; the old top difficulty, which needed a tech
 * node to appear at all, went with the names.
 */
export const topTier = (p: Progress, worldId: string): number =>
  Math.min(TOP_TIER, clearedOn(p, worldId));

/**
 * The best any world has done, for the things that are still about the SAVE
 * rather than about a world — a tech node with a `requiresTier` gate is a
 * purchase, and a purchase is owned campaign-wide, so it asks whether this
 * save has ever cleared that rung anywhere.
 */
export const bestTierCleared = (p: Progress): number =>
  Object.values(p.clearedByMap).reduce((a, b) => Math.max(a, Math.floor(b)), 0);

/**
 * Has this world's whole ladder been beaten? `cleared` runs one past the
 * top rung on the final win, which is the only state that means "there is
 * nothing above this" — until the ladder grows, which is what makes this a
 * question about RUNG_COUNT rather than a permanent fact about the save.
 */
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
 * reached only by the tap gesture on the settings screen (see MechSwarm),
 * which no player finds by accident and no player is told about — the same
 * bargain Android's build-number tap makes.
 *
 * NODES, exactly like the dev switch: the ladder still opens by clearing
 * tiers, and there is nothing else for this door to hand over — a run's
 * mutators are rolled at deploy from the difficulty picked (mutation.ts)
 * and were never a thing a save could own.
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
 * The bundle a run's kills are worth before the ladder's multipliers.
 *
 * Each kind pays its FAMILY'S currency in its TIER'S quantity (unitDrop in
 * levels.ts), so the shape of this bundle is the shape of the LINES that
 * died: a pure dagger push is copper only, a spiroct column thorium only,
 * and a run on a world whose script sends neither banks neither. It is
 * also why a run's takings say which map was played — the world decides
 * which lines arrive, and the lines decide the currencies.
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
  /** the rung that was played, 0-based */
  tier: number;
  /** drop multiplier the rung itself carries — LOOT_PER_RUNG ^ tier */
  dropBonus: number;
  /** did this clear push THIS WORLD'S frontier up a rung? */
  firstClear: boolean;
  /** the world it was played on — its ladder is the one that moved */
  worldId: string;
}

/**
 * Settle a FINISHED run into the save.
 *
 * Kills are the only income, so a defeat still banks everything the towers
 * killed on the way down — in whatever currencies those kills happened to
 * drop — multiplied by the rung's own drop bonus. Clearing the frontier
 * rung for the first time moves it up one.
 *
 * NOTHING ACCRUES WHILE THE APP IS SHUT. There is no offline income, no
 * idle tick and no "welcome back, you earned this while you were away".
 * Every item in the bank was paid for by a run somebody watched, and that
 * is a design commitment rather than a feature not written yet. It puts the
 * whole pacing burden on the loot curve — LOOT_PER_RUNG for the ladder and
 * the script's own tier mix for the kill (itemForTier) — which is where it
 * is legible and tunable, rather than in a clock nobody is looking at.
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
  // a rung pays the same whether or not it is new, and EVERY rung pays more
  // than the one below it — the bonus compounds all the way to the top (see
  // LOOT_PER_RUNG). That gradient is the only reason to push rather than
  // farm now that no rung holds any turret back
  const dropBonus = tierDropBonus(n);
  const earned = scaleCost(dropsForKills(killsByKind), dropBonus);
  // THE BOSS TROPHY: a boss kind's FIRST kill on each (world, rung) pays
  // exactly one surge alloy, on win or loss alike — the trophy is for
  // killing the boss, and a run can fell it and still leak elsewhere. The
  // key written here is what stops it ever paying again, so the bank's
  // surge column counts distinct boss fights won, not runs farmed. No
  // multiplier touches it: rung bonuses scale drops, and this is not a drop.
  //
  // TEN RUNGS MEANS TEN TROPHIES A WORLD rather than four, because a boss
  // fought at rung 10 is not the boss fought at rung 6. That is the surge
  // supply widening with the ladder it is keyed to, which is what keeps the
  // ultimates (ULTIMATE_SURGE in tech.ts) priced against progress.
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
  // the frontier only ever moves forward, and only by one: clearing rung 5
  // when rung 5 was the frontier opens rung 6, and replaying rung 2 later
  // does nothing
  if (firstClear) p.clearedByMap[worldId] = n + 1;
  saveProgress(p);
  return { earned, tier: n, dropBonus, firstClear, worldId };
}
