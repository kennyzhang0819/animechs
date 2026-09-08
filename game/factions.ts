import { TOWERS } from "./constants";
import { FAMILIES, familyByKey, type FamilyKey, type UnitKind } from "./levels";
import { TOWER_KINDS, type TowerKind } from "./types";

/**
 * THE FACTIONS — a family (levels.ts FAMILIES: five units, tier 1 to 5)
 * with THREE TURRETS OF ITS OWN, tier 1 to 3. A run is played as ONE
 * faction, picked on the deploy screen: the player's factories build
 * that faction's units and the build bar carries that faction's turrets,
 * plus the common roster every faction shares (COMMON_KINDS — the walls,
 * the drill, the factories). The track hands out factions, never
 * individual turrets (track.ts).
 *
 * THE TURRETS ARE DEALT, NOT DERIVED. The roster is seventeen guns and
 * six factions want eighteen, so one is shared (the meltdown, on both
 * support lines) — a faction's three are a design call about what the
 * line feels like to defend with, not a sort of the price list.
 */
export const FACTION_TURRETS: Readonly<Record<FamilyKey, readonly [TowerKind, TowerKind, TowerKind]>> = {
  // the mechs: the volume gun, the burst, the wall of heavy shells
  ground: ["duo", "salvo", "spectre"],
  // the crawlers: fire, homing missiles, the close-range shotgun
  crawler: ["scorch", "swarmer", "fuse"],
  // the support mechs, all beams: the bolt, the lancer, the held laser
  groundSupport: ["arc", "lancer", "meltdown"],
  // the air line: flak, the flak cannon, the railgun
  air: ["scatter", "cyclone", "foreshadow"],
  // the fleet: water, artillery, the heavy sprayer
  naval: ["wave", "ripple", "tsunami"],
  // the support fleet: light artillery, the tractor beam, the held laser
  navalSupport: ["hail", "parallax", "meltdown"],
};

/** every kind that is nobody's: the walls, the drill and the factories */
export const COMMON_KINDS: readonly TowerKind[] = TOWER_KINDS.filter((k) => TOWERS[k].wall);

/** the factions, in the family table's order */
export const FACTION_KEYS: readonly FamilyKey[] = FAMILIES.map((f) => f.key);

/** a faction's five bodies, tier 1 first */
export const factionUnits = (f: FamilyKey): readonly UnitKind[] => familyByKey(f).kinds;

/** a faction's unit of one tier (1-5) */
export const factionUnit = (f: FamilyKey, tier: number): UnitKind =>
  familyByKey(f).kinds[Math.max(0, Math.min(4, tier - 1))];

/** the factions that own a turret — none for a common kind */
export function factionsOf(kind: TowerKind): FamilyKey[] {
  return FACTION_KEYS.filter((f) => (FACTION_TURRETS[f] as readonly TowerKind[]).includes(kind));
}

/**
 * WHAT A RUN MAY BUILD: the common roster, plus the turrets of the
 * factions given — one faction on a campaign run, every owned faction on
 * the sandbox and the progress screen's census.
 */
export function kindsFor(factions: Iterable<FamilyKey>): Set<TowerKind> {
  const out = new Set<TowerKind>(COMMON_KINDS);
  for (const f of factions) for (const k of FACTION_TURRETS[f]) out.add(k);
  return out;
}

/**
 * THE BAR AS A FRESH RUN OPENS IT, out of what the run owns: the
 * faction's three guns, the copper wall, the drill and the first three
 * factories — the eight things a run's first ten minutes are built with.
 * A save that has curated its loadout (Progress.loadout) overrides it.
 */
export function defaultLoadout(owned: Iterable<TowerKind>): TowerKind[] {
  const have = new Set(owned);
  const want: TowerKind[] = ["copper-wall", "drill", "factory-t1", "factory-t2", "factory-t3"];
  const guns = [...have].filter((k) => !TOWERS[k].wall);
  return [...guns, ...want.filter((k) => have.has(k))];
}

/** the check: every faction has three turrets, every turret is on the roster */
(() => {
  for (const f of FACTION_KEYS) {
    const t = FACTION_TURRETS[f];
    if (!t || t.length !== 3) throw new Error(`the faction "${f}" needs exactly three turrets`);
    for (const k of t) if (TOWERS[k].wall) throw new Error(`"${k}" is common and cannot be a faction's turret`);
  }
})();
