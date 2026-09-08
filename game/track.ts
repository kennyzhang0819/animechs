import { TOWER_DESC, TOWERS } from "./constants";
import { COMMON_KINDS, FACTION_KEYS, FACTION_TURRETS, factionsOf, kindsFor } from "./factions";
import { familyByKey, WORLDS, type FamilyKey } from "./levels";
import { MUTATIONS, mutationById, type MutationId } from "./mutation";
import { BAR_SLOTS, BY_MINDUSTRY_VALUE, type TechState } from "./tech";
import { TOWER_KINDS, type TowerKind } from "./types";
void COMMON_KINDS;
import {
  ALL_UPGRADES,
  NO_UPGRADES,
  TURRET_UPGRADES,
  upgradeDef,
  type UpgradeKind,
  type UpgradePoints,
} from "./upgrades";

/**
 * THE LEVEL TRACK — the co-op model of progression, and the whole of it.
 *
 * A save has one number, its lifetime XP (progress.ts), and the level read
 * off it (economy.ts) is a tier on this track. Every tier hands out fixed
 * rewards: a map opens, a fast-forward pace switches on, a turret joins
 * the roster, a turret gains a rung of its upgrade branch. Nothing is
 * chosen and nothing is bought — the player levels, the game hands them
 * things, exactly as a commander levels in co-op. A list the player can
 * read top to bottom is the whole progression, which is what a tree of
 * purchases never managed to be.
 *
 * THE TRACK HAS TWO PHASES, AND THEY PULL OPPOSITE WAYS.
 *
 *   THE FACTION PHASE, levels 1 to ROSTER_TOP. The track hands out
 *   FACTIONS (factions.ts) — a family of five units and the three turrets
 *   that belong to it — never a turret on its own. A fresh save opens
 *   with STARTING_FACTIONS, two of the six, and the other four arrive up
 *   the track (FACTION_UNLOCKS); the levels between carry the maps, and a
 *   few carry nothing at all, which is fine — a faction is a big thing to
 *   hand out and the phase is not padded to fill every rung. There is no
 *   gate inside a run: what the save owns it may place from wave 1, and
 *   the deploy screen is where one of its factions is picked to play.
 *
 *   THE MUTATOR PHASE, ROSTER_TOP + 1 to MAX_LEVEL. There is nothing left
 *   to build, so what a level hands out is a RULE: one mutator a level,
 *   lightest first, added to the deck the deploy roll draws from
 *   (MUTATOR_UNLOCKS). The reward for climbing is that the game is allowed
 *   to be harder — which is the reward a tower defence player is actually
 *   climbing for, and it means the track no longer dies at fifteen.
 *
 * Levelling past MAX_LEVEL still happens (up to LEVEL_CAP in economy.ts,
 * a thousand) and pays nothing, which is the honest shape for a game
 * whose roster and whose catalog are both finite.
 *
 * THE FACTIONS ARE WRITTEN, THE REST IS PLACED. FACTION_UNLOCKS is a
 * hand-authored order — which line a new save learns the game with is a
 * design decision. The list is checked at import (every faction exactly
 * once), so adding a family to levels.ts without placing it here fails
 * loudly rather than quietly opening nothing.
 *
 * THE UPGRADE RUNGS ARE OFF THE TRACK. Every turret buff the track used
 * to hand out is switched off at UPGRADES_ON_TRACK — the rungs, their
 * blurbs and the dealing arithmetic are all still here and still
 * typecheck, waiting to be put back somewhere that is not the unlocking
 * phase.
 */

/**
 * THE END OF THE FACTION PHASE — the level at which the last faction
 * opens. Everything under it is the game being handed to the player;
 * everything over it is the game being taken back (the mutators, below).
 */
export const ROSTER_TOP = 15;

/**
 * THE MUTATOR PHASE — one rule a level, LIGHTEST FIRST, from ROSTER_TOP + 1.
 *
 * A rule that is not on this list yet is not in the deck: the deploy roll
 * draws only from what the save has opened (mutatorsAt, and the exclude
 * it feeds rollMutations), so a fresh save plays clean runs and every
 * level past fifteen puts one more thing that can go wrong into the bag.
 * That is the honest second half for a game whose first half is "here is
 * another gun": once there are no guns left to hand out, the only thing
 * left to hand out is trouble.
 *
 * THE ORDER IS BY WEIGHT, ASCENDING — the reverse of the codex, which
 * reads hardest first. Armored costs one point and is noticed; Amphibious
 * costs five and decides runs. The player meets them in that order, so
 * each level past the roster is a slightly worse deck rather than a cliff
 * at sixteen.
 */
const MUTATOR_UNLOCKS: readonly MutationId[] = [
  /* 16 */ "armored",
  /* 17 */ "mitosis",
  /* 18 */ "volatile",
  /* 19 */ "shieldTowers",
  /* 20 */ "overshields",
  /* 21 */ "speedy",
  /* 22 */ "hungry",
  /* 23 */ "hydrophobic",
  /* 24 */ "amphibious",
];

/**
 * The top of the track — the level at which every reward is out: the
 * roster phase and the mutator phase behind it. Levelling past it still
 * happens and pays nothing.
 */
export const MAX_LEVEL = ROSTER_TOP + MUTATOR_UNLOCKS.length;

/** THE CATALOG IS DEALT WHOLE, ONCE EACH. A rule on no level could never
 *  be rolled, and a rule on two would open twice — both are import-time
 *  failures here rather than a deck that quietly plays short */
(() => {
  const seen = new Set<MutationId>();
  for (const id of MUTATOR_UNLOCKS) {
    if (!mutationById(id)) throw new Error(`the track opens "${id}", which is not a mutator`);
    if (seen.has(id)) throw new Error(`the track opens the mutator "${id}" twice`);
    seen.add(id);
  }
  for (const m of MUTATIONS)
    if (!seen.has(m.id)) throw new Error(`the track never opens the mutator "${m.id}"`);
})();

export type Reward =
  | { kind: "world"; worldId: string }
  | { kind: "speed"; mult: number }
  | { kind: "faction"; id: FamilyKey }
  | { kind: "turret"; id: TowerKind }
  | { kind: "mutator"; id: MutationId }
  | { kind: "upgrade"; id: UpgradeKind };

/** the rewards placed by hand — the structure of the campaign */
const PLACED: readonly { level: number; reward: Reward }[] = [
  // A MAP ALMOST EVERY LEVEL: nine worlds over the fifteen, the second
  // batch (worlds 4 to 9) filling the levels between the first three
  { level: 2, reward: { kind: "world", worldId: "4" } },
  { level: 3, reward: { kind: "world", worldId: "2" } },
  { level: 4, reward: { kind: "world", worldId: "5" } },
  { level: 5, reward: { kind: "world", worldId: "6" } },
  { level: 6, reward: { kind: "world", worldId: "7" } },
  { level: 7, reward: { kind: "world", worldId: "3" } },
  { level: 8, reward: { kind: "world", worldId: "8" } },
  { level: 9, reward: { kind: "world", worldId: "9" } },
  // NO PACE ON THE TRACK. Fast-forward is not a reward any more: every
  // multiplier is a sandbox tool (SPEEDS in game.ts, behind the admin
  // door), and a campaign run always plays at 1x
];

/**
 * WHAT A FRESH SAVE PLAYS: two factions, so the deploy screen's first
 * pick is a pick. The mechs — the volume line every RTS teaches with —
 * and the support mechs beside them, whose beams answer the armour the
 * first line's duos cannot.
 */
export const STARTING_FACTIONS: readonly FamilyKey[] = ["ground", "groundSupport"];

/**
 * WHAT THE TRACK OPENS, BY LEVEL. One faction every three levels: the
 * air line first (a save wants to fly early), the crawlers, then the two
 * fleets last — they play only on the maps with water, which the track
 * has opened by then. The levels between carry the maps (PLACED); a level
 * with nothing in it at all is allowed, and the top of the phase (15) is
 * one.
 */
const FACTION_UNLOCKS: readonly { level: number; faction: FamilyKey }[] = [
  { level: 3, faction: "air" },
  { level: 6, faction: "crawler" },
  { level: 9, faction: "naval" },
  { level: 12, faction: "navalSupport" },
];

/** the factions by the level they open on: the starting two on 1 */
function dealFactions(): Map<number, FamilyKey[]> {
  const out = new Map<number, FamilyKey[]>();
  out.set(1, [...STARTING_FACTIONS]);
  for (const u of FACTION_UNLOCKS) out.set(u.level, [...(out.get(u.level) ?? []), u.faction]);
  return out;
}

const FACTIONS_DEALT = dealFactions();

/**
 * THE TRACK OPENS EVERY FACTION, ONCE EACH, INSIDE THE PHASE. A faction on
 * no level could never be played, one on two would be handed out twice,
 * and one past ROSTER_TOP would land in the mutator phase — all three are
 * import-time failures here rather than a deploy screen quietly short a
 * line.
 */
(() => {
  const seen = new Map<FamilyKey, number>();
  for (const [level, fs] of FACTIONS_DEALT)
    for (const f of fs) {
      const had = seen.get(f);
      if (had !== undefined)
        throw new Error(`the track opens the faction "${f}" twice, on levels ${had} and ${level}`);
      if (level > ROSTER_TOP) throw new Error(`the faction "${f}" opens at ${level}, past the phase's top ${ROSTER_TOP}`);
      seen.set(f, level);
    }
  for (const f of FACTION_KEYS)
    if (!seen.has(f)) throw new Error(`the track never opens the faction "${f}" — no level hands it out`);
})();

/** the level a faction opens on — 1 for the starting two */
export function factionUnlockLevel(f: FamilyKey): number {
  for (const [level, fs] of FACTIONS_DEALT) if (fs.includes(f)) return level;
  return 1;
}

/** the factions a level has opened: the starting two and every one dealt so far */
export function factionsAt(level: number): Set<FamilyKey> {
  const out = new Set<FamilyKey>();
  for (let l = 1; l <= Math.min(level, MAX_LEVEL); l++)
    for (const f of FACTIONS_DEALT.get(l) ?? []) out.add(f);
  return out;
}

/** the level a turret joins the roster: the first level any faction that
 *  owns it opens on — 1 for a common kind (the walls, the drill, the factories) */
export function turretUnlockLevel(kind: TowerKind): number {
  const owners = factionsOf(kind);
  if (owners.length === 0) return 1;
  return Math.min(...owners.map(factionUnlockLevel));
}

/**
 * The first level an upgrade of each rung tier may land on: the rate-of-
 * fire style rungs from the second level, the reworks from the eighth,
 * the ammo swaps from the fourteenth and the ultimates from the twentieth
 * — so the track's back half is where the big changes live.
 */
const TIER_FROM: Readonly<Record<number, number>> = { 1: 2, 2: 8, 3: 14, 4: 20 };

/**
 * Deal the upgrade rungs across levels 2..MAX_LEVEL. Sorted by rung tier,
 * then the turret's own unlock level, then roster order; each rung lands
 * on the first level with room that is no earlier than its tier's
 * TIER_FROM and no earlier than the level its turret joins on — an
 * upgrade for a gun the save cannot place yet would be a chip that says
 * nothing.
 */
function dealUpgrades(): Map<number, UpgradeKind[]> {
  const order = new Map<TowerKind, number>(BY_MINDUSTRY_VALUE.map((k, i) => [k, i]));
  const rungs = [...ALL_UPGRADES].sort(
    (a, b) =>
      a.tier - b.tier ||
      turretUnlockLevel(a.turret) - turretUnlockLevel(b.turret) ||
      (order.get(a.turret) ?? 0) - (order.get(b.turret) ?? 0),
  );
  const levels = MAX_LEVEL - 1;
  const perLevel = Math.ceil(rungs.length / levels);
  const out = new Map<number, UpgradeKind[]>();
  for (const r of rungs) {
    let level = Math.max(2, TIER_FROM[r.tier] ?? 2, turretUnlockLevel(r.turret));
    while ((out.get(level)?.length ?? 0) >= perLevel && level < MAX_LEVEL) level++;
    const list = out.get(level) ?? [];
    list.push(r.id);
    out.set(level, list);
  }
  return out;
}

/**
 * THE TURRET BUFFS ARE OFF THE TRACK. Flip this to true and the rungs
 * deal up it exactly as they did; dealUpgrades, upgradesAt and the rung
 * blurbs in upgrades.ts are live code either way. With it false every
 * turret plays at its stock stats at every level, and the track is the
 * roster and nothing else.
 *
 * ONE THING TO FIX BEFORE FLIPPING IT BACK: TIER_FROM holds the old
 * thirty-level track's floors (ultimates from 20), which is past the end
 * of a fifteen-level one. Wherever the buffs land next, those floors are
 * a fraction of the track's length rather than the numbers below.
 */
const UPGRADES_ON_TRACK = false;

const DEALT: Map<number, UpgradeKind[]> = UPGRADES_ON_TRACK ? dealUpgrades() : new Map();

/** every reward a level hands out: maps and paces first, then the turrets, then the rungs */
export function rewardsAt(level: number): Reward[] {
  const out: Reward[] = PLACED.filter((p) => p.level === level).map((p) => p.reward);
  for (const id of FACTIONS_DEALT.get(level) ?? []) out.push({ kind: "faction", id });
  const mut = MUTATOR_UNLOCKS[level - ROSTER_TOP - 1];
  if (mut) out.push({ kind: "mutator", id: mut });
  for (const id of DEALT.get(level) ?? []) out.push({ kind: "upgrade", id });
  return out;
}

/** the whole track, level by level, for the progress screen */
export const TRACK: readonly { level: number; rewards: Reward[] }[] = Array.from(
  { length: MAX_LEVEL },
  (_, i) => ({ level: i + 1, rewards: rewardsAt(i + 1) }),
);

/** the mutators a level has put in the deck — empty through the whole
 *  roster phase, the lot of them at the top of the track */
export function mutatorsAt(level: number): Set<MutationId> {
  return new Set(MUTATOR_UNLOCKS.slice(0, Math.max(0, Math.min(level, MAX_LEVEL) - ROSTER_TOP)));
}

/**
 * THE RULES THIS SAVE CANNOT MEET YET — what the deploy roll is told to
 * keep out of the draw (rollMutations' `exclude`). A save inside the
 * roster phase excludes the whole catalog and plays clean runs.
 */
export function lockedMutators(level: number): MutationId[] {
  const open = mutatorsAt(level);
  return MUTATIONS.filter((m) => !open.has(m.id)).map((m) => m.id);
}

/** the level a mutator joins the deck — MAX_LEVEL + 1 for one the track
 *  somehow never opens, which the import check above makes impossible */
export function mutatorUnlockLevel(id: MutationId): number {
  const i = MUTATOR_UNLOCKS.indexOf(id);
  return i < 0 ? MAX_LEVEL + 1 : ROSTER_TOP + 1 + i;
}

/** the level a map opens at — 1 for a map the track never names */
export function worldUnlockLevel(worldId: string): number {
  for (const p of PLACED)
    if (p.reward.kind === "world" && p.reward.worldId === worldId) return p.level;
  return 1;
}

/** the fast-forward paces a level has switched on, ascending, 1x included */
export function speedsAt(level: number): number[] {
  const out = [1];
  for (const p of PLACED)
    if (p.reward.kind === "speed" && p.level <= level) out.push(p.reward.mult);
  return out.sort((a, b) => a - b);
}

/** every kind a level may build, across all the factions it has opened:
 *  the common roster and each faction's three (factions.ts kindsFor) */
export function turretsAt(level: number): Set<TowerKind> {
  return kindsFor(factionsAt(level));
}

/** every turret's upgrade points at a level — the rungs the track has dealt so far */
export function upgradesAt(level: number): Record<TowerKind, UpgradePoints> {
  const owned = new Set<UpgradeKind>();
  for (let l = 2; l <= Math.min(level, MAX_LEVEL); l++)
    for (const id of DEALT.get(l) ?? []) owned.add(id);
  return Object.fromEntries(
    TOWER_KINDS.map((k) => [
      k,
      owned.size === 0
        ? NO_UPGRADES
        : TURRET_UPGRADES[k].map((u) => (owned.has(u.id) ? 1 : 0)),
    ]),
  ) as Record<TowerKind, UpgradePoints>;
}

/** the next level that hands out anything, past `level`; null at the top */
export function nextRewardLevel(level: number): number | null {
  for (let l = level + 1; l <= MAX_LEVEL; l++) if (rewardsAt(l).length > 0) return l;
  return null;
}

/** a reward in the player's own words */
export function rewardText(r: Reward): string {
  if (r.kind === "world") return `${WORLDS.find((w) => w.id === r.worldId)?.name ?? "A map"} opens`;
  if (r.kind === "speed") return `${r.mult}x speed`;
  if (r.kind === "faction") return `Faction: ${familyByKey(r.id).name}`;
  if (r.kind === "turret") return `${TOWERS[r.id].wall ? "Wall" : "Turret"}: ${TOWER_NAME[r.id]}`;
  if (r.kind === "mutator") return `Mutator: ${mutationById(r.id)?.name ?? r.id}`;
  const u = upgradeDef(r.id);
  return `${TOWER_NAME[u.turret]}: ${u.name}`;
}

/**
 * WHAT A REWARD DOES, in a sentence — the hover card on a track chip.
 * An upgrade rung reads its own blurb (upgrades.ts), a turret its card
 * description (constants.ts), and the maps and paces say what they open.
 */
export function rewardBlurb(r: Reward): string {
  if (r.kind === "world") return "Unlocks a new map ";
  if (r.kind === "speed") return `Fast-forward: a run may be played at ${r.mult}x pace from the strip under the wave panel.`;
  if (r.kind === "faction") {
    const fam = familyByKey(r.id);
    const units = fam.kinds.map((k) => k[0].toUpperCase() + k.slice(1)).join(", ");
    const guns = FACTION_TURRETS[r.id].map((k) => TOWER_NAME[k]).join(", ");
    return `A line to play a run as: its factories build ${units}, and its turrets are ${guns} — plus the walls, the drill and the factories every faction shares. Pick it on the deploy screen.`;
  }
  if (r.kind === "turret") return TOWER_DESC[r.id];
  if (r.kind === "mutator")
    return `${mutationById(r.id)?.blurb ?? ""} From here on a run may roll it.`;
  return upgradeDef(r.id).blurb;
}

/** the turret's display name, as the bar prints it */
export const TOWER_NAME: Readonly<Record<TowerKind, string>> = Object.fromEntries(
  TOWER_KINDS.map((k) => [k, TOWERS[k].name]),
) as Record<TowerKind, string>;

/**
 * WHAT A SAVE AT THIS LEVEL MAY DO, as the sim and the bar read it: the
 * factions the track has handed out and every kind they and the common
 * roster allow, the paces it has switched on, and every upgrade rung
 * dealt so far. The one place a level becomes a TechState; a run narrows
 * it to one faction with withFaction (tech.ts).
 */
export function techStateFor(level: number): TechState {
  const factions = factionsAt(level);
  return {
    factions,
    faction: null,
    unlocked: kindsFor(factions),
    speeds: speedsAt(level),
    barSlots: BAR_SLOTS,
    upgrades: upgradesAt(level),
  };
}
