import { TOWERS } from "./constants";
import { ACTIVE_FAMILIES, FAMILIES, familyByKey, type FamilyKey, type UnitKind } from "./levels";
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
  // the ground mechs: the volume gun, the burst, the wall of heavy shells
  ground: ["duo", "salvo", "spectre"],
  // the venom crawlers: fire, homing missiles, the close-range shotgun
  crawler: ["scorch", "swarmer", "fuse"],
  // the starlight mechs, all beams, like the bodies: the bolt, the lancer,
  // the held laser
  groundSupport: ["arc", "lancer", "meltdown"],
  // the sky gunships: flak, the flak cannon, the railgun
  air: ["scatter", "cyclone", "foreshadow"],
  // the naval tanks: water, artillery, the heavy sprayer
  naval: ["wave", "ripple", "tsunami"],
  // the aegis tanks: light artillery, the tractor beam, the held laser.
  // SHELVED with its faction (levels.ts SHELVED_FAMILIES) — the table
  // stays whole so putting the line back is one edit and not six
  navalSupport: ["hail", "parallax", "meltdown"],
};

/** every kind that is nobody's: the walls, the drill and the factories */
export const COMMON_KINDS: readonly TowerKind[] = TOWER_KINDS.filter((k) => TOWERS[k].wall);

/**
 * THE FACTIONS IN PLAY, in the family table's order — the shelf
 * (levels.ts SHELVED_FAMILIES) taken out. Everything downstream reads
 * this rather than FAMILIES: what a turret belongs to (factionsOf), what
 * the track hands out, what the deploy screen lists. A shelved faction's
 * turrets therefore belong to nobody, which is what takes them off the
 * roster with it.
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

/** the factions that own a turret — none for a common kind, and none for
 *  one whose only faction is shelved */
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

/** the check: every faction has three turrets, every turret is on the
 *  roster. Over the WHOLE table, shelf included — a shelved faction is
 *  meant to be one edit away from playing again, so its turrets are held
 *  to the same rule as everyone else's while it waits. */
(() => {
  for (const f of FAMILIES.map((x) => x.key)) {
    const t = FACTION_TURRETS[f];
    if (!t || t.length !== 3) throw new Error(`the faction "${f}" needs exactly three turrets`);
    for (const k of t) if (TOWERS[k].wall) throw new Error(`"${k}" is common and cannot be a faction's turret`);
  }
})();
