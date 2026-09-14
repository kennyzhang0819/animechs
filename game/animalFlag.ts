/**
 * THE ANIMAL ART SWITCH.
 *
 * On, all six families draw as animals instead of Mindustry's hulls, and
 * they are NAMED for the animal rather than for the weapon (levels.ts
 * FAMILY_NAMES, UNIT_NAMES): the ground mechs as the IRONHIDES (a rhino
 * line, the horn is the barrel, four planted legs from the T4), the venom
 * spitters as the WEAVERS (a spider line, legged at every tier), the
 * Starlight mechs as STARHART (a stag line, antler tines for beam
 * emitters, hooves under the body until the T4 opens its stride), the
 * Skyfall bombers as STOOP (a bat line, membrane wings that flap, the
 * belly charge growing to the T5 nuke), the harpoon fleet as the SKATES
 * (a manta line on the bat's parts rig) and the wraith fleet as the
 * LIVEWIRES (an eel line on the worm rig). Everything is generated at
 * load (game/animalArt.ts) and packed over the stock cells (game/atlas.ts
 * packAnimalArt), so NOTHING under public/mindustry is touched and
 * flipping this back restores the shipped look byte for byte.
 *
 * Off, the six lines are exactly what they were: the same sprite files,
 * the same rigs, and Mindustry's own names on every panel that prints one
 * (UNIT_NAMES falls back to the kind, capitalised).
 */
export const ANIMAL_ART = true;
