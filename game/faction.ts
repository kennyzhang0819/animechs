/**
 * THE PLAYER'S FACTION: which set of buildings the roster wears.
 *
 * A faction is a SKIN OVER THE ONE ROSTER, never a second roster. The
 * sim, the deal, the formations, the mods, the relics and the saves are
 * all keyed by TowerKind, and every kind keeps its stats (constants.ts
 * TOWERS) whichever faction is chosen — a Botanica sapling shoots exactly
 * what a duo shoots. What a faction changes is what a kind IS on the
 * board: its name, its drawing, whether it stands on a plate, whether
 * it turns, and what the core looks like.
 *
 *   FOUNDRY  — the machine set (turretArt.ts): a head on a darkened
 *              plate, every head turning to face its target.
 *   BOTANICA — the plant set (botanicaArt.ts): no plate, the plant is
 *              the footprint, and only the five that aim turn.
 *
 * The choice is a saved preference (progress.ts `faction`), picked on
 * the Settings screen and live: the sheet packs both sets at load, so
 * flipping it re-reads the lookups here without a rebuild.
 */
import { TOWERS } from "./constants";
import type { TowerKind } from "./types";

export type Faction = "foundry" | "botanica";
export const FACTIONS: ReadonlyArray<{ mode: Faction; label: string }> = [
  { mode: "foundry", label: "Foundry" },
  { mode: "botanica", label: "Botanica" },
];
export const FACTION_DEFAULT: Faction = "foundry";

let active: Faction = FACTION_DEFAULT;
/** the faction the board is wearing now */
export const activeFaction = (): Faction => active;
export function setActiveFaction(f: Faction): void {
  active = f;
}
export const isFaction = (v: unknown): v is Faction => FACTIONS.some((f) => f.mode === v);

/**
 * WHAT EACH KIND IS CALLED IN BOTANICA. Every plant keeps the role and
 * the numbers of the kind it stands for: the sapling is the duo, the
 * pitcher lobs like the hail, the puffcap bursts like the scatter, the
 * corpse flower's stench is the fuse's short burst, the kudzu's thorns
 * come as thick as the cyclone's flak, the venus colossus's bite is the
 * foreshadow's one shot, the solar bloom's sunbeam the meltdown's beam.
 */
export const PLANT_NAMES: Readonly<Partial<Record<TowerKind, string>>> = {
  duo: "Sapling",
  hail: "Pitcher",
  scorch: "Thornbush",
  arc: "Firefly Reed",
  salvo: "Cannon Fig",
  scatter: "Puffcap",
  lancer: "Sunflower",
  wave: "Dewvine",
  parallax: "Snapdragon",
  swarmer: "Bombardier",
  fuse: "Corpse Flower",
  ripple: "Oak",
  tsunami: "Willow",
  cyclone: "Kudzu",
  spectre: "World Ash",
  meltdown: "Solar Bloom",
  foreshadow: "Venus Colossus",
};

/** a kind's display name under the faction the board is wearing */
export function structName(kind: TowerKind, faction: Faction = active): string {
  return (faction === "botanica" && PLANT_NAMES[kind]) || TOWERS[kind].name;
}
/** the core's name under a faction */
export const coreName = (faction: Faction = active): string => (faction === "botanica" ? "Heartwood" : "Core");
