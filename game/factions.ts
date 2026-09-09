import { TOWERS } from "./constants";
import { ACTIVE_FAMILIES, familyByKey, type FamilyKey, type UnitKind } from "./levels";
import { TOWER_KINDS, type TowerKind } from "./types";

/**
 * THE FACTIONS — a family (levels.ts FAMILIES: five units, tier 1 to 5),
 * and nothing else. A run is played as ONE faction, picked on the deploy
 * screen, and what that choice decides is WHICH BODIES THE FACTORIES
 * BUILD. Everything a run may PUT DOWN is the same whichever line it
 * plays (BUILDABLE_KINDS below).
 *
 * A FACTION USED TO OWN THREE TURRETS (FACTION_TURRETS: the duo, the
 * salvo and the spectre were the ground mechs', the arc, the lancer and
 * the meltdown the starlight line's) and it owns none now. THE PLAYER
 * BUILDS NO TURRETS AT ALL — the drill and the factories are the whole of
 * the build menu, and a fight is won with the army the factories make
 * rather than with a gun line behind it. The turrets are
 * still in the game, still implemented and still fielded: a map's own
 * formation is the SWARM's (MapData.enemies), and every one of them is
 * one of the seventeen.
 */

/** every kind that is nobody's: the drill and the five factories */
export const COMMON_KINDS: readonly TowerKind[] = TOWER_KINDS.filter((k) => TOWERS[k].building);

/**
 * WHAT A RUN MAY BUILD, in the order the build menu lays it out
 * (tech.ts BUILD_SLOTS reads this): the drill that pays for everything
 * and the five factories that turn the scrap into the army. No turrets —
 * see the note above — and no walls, since there are none left in the
 * game (types.ts).
 */
export const BUILDABLE_KINDS: readonly TowerKind[] = [
  "drill",
  "factory-t1",
  "factory-t2",
  "factory-t3",
  "factory-t4",
  "factory-t5",
];

/**
 * THE FACTIONS IN PLAY, in the family table's order — the shelf
 * (levels.ts SHELVED_FAMILIES) taken out. Everything downstream reads
 * this rather than FAMILIES: what the track hands out, what the deploy
 * screen lists.
 */
export const FACTION_KEYS: readonly FamilyKey[] = ACTIVE_FAMILIES;

/**
 * WHAT A FACTION IS, in a line, for the deploy screen's detail pane.
 *
 * One per faction rather than one per movement LAYER, which is what it
 * used to be: three of the six walk, and "a line that walks" said the
 * same thing about a wall of maces, a nest of spiders and a file of
 * beam mechs. What a player is choosing between is how the line fights.
 */
export const FACTION_BLURB: Readonly<Record<FamilyKey, string>> = {
  ground:
    "The line that walks: armoured mechs up whatever lane the map gives them, and a fight at the walls when they arrive.",
  crawler:
    "Spiders, and every one of them a poison: they come in numbers, they burn and they blister, and the biggest of them outlives anything else on legs.",
  groundSupport:
    "Named for stars and armed with light — not one ballistic gun in the line. Beams cut through a file rather than stopping at the front of it.",
  air: "Gunships: nothing on the ground stops them, they come the straight way over the hills, and only the turrets that shoot up can answer.",
  naval:
    "Amphibious armour: it crosses the deep water nothing else can, and comes ashore at half pace to finish the job.",
  navalSupport:
    "Amphibious armour that carries a shield instead of a gun — the aegis is in the line by name.",
};

/** a faction's five bodies, tier 1 first */
export const factionUnits = (f: FamilyKey): readonly UnitKind[] => familyByKey(f).kinds;

/** a faction's unit of one tier (1-5) */
export const factionUnit = (f: FamilyKey, tier: number): UnitKind =>
  familyByKey(f).kinds[Math.max(0, Math.min(4, tier - 1))];

/**
 * WHAT A RUN MAY BUILD, as a set — the same roster whichever faction is
 * playing, since a faction owns bodies and nothing else. It still takes
 * the factions so every caller reads the same way if a line ever brings
 * its own building back.
 */
export function kindsFor(_factions: Iterable<FamilyKey>): Set<TowerKind> {
  void _factions;
  return new Set<TowerKind>(BUILDABLE_KINDS);
}

/** the check: nothing with a gun on it can reach the player's build menu
 *  by being listed above — a turret is the swarm's alone now */
(() => {
  for (const k of BUILDABLE_KINDS)
    if (!COMMON_KINDS.includes(k)) throw new Error(`"${k}" is a turret and cannot be built`);
})();
