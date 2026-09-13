/**
 * THE ANIMAL ART SWITCH — a trial, not a decision.
 *
 * On, four families draw as animals instead of Mindustry's hulls, and
 * they are NAMED for the animal rather than for the weapon (levels.ts
 * FAMILY_NAMES, UNIT_NAMES): the ground mechs as the IRONHIDES (a rhino
 * line, the horn is the barrel, four planted legs from the T4), the venom
 * spitters as the WEAVERS (a spider line, legged at every tier), the
 * Starlight mechs as STARHART (a stag line, antler tines for beam
 * emitters, hooves under the body until the T4 opens its stride) and the
 * Skyfall bombers as STOOP (a bat line, membrane wings that flap, the
 * belly charge growing to the T5 nuke). Everything is generated at load
 * (game/animalArt.ts) and packed over the stock cells (game/atlas.ts
 * packAnimalArt), so NOTHING under public/mindustry is touched and
 * flipping this back restores the shipped look byte for byte.
 *
 * The two fleets are still Mindustry's whales and sea slugs and still
 * carry Mindustry's names; they become the Tuskers (narwhal) and the
 * Livewires (electric eel) when their art is drawn.
 *
 * Off, the four lines are exactly what they were: the same sprite files,
 * the same mech and legged rigs, the same single-quad flyers, and the
 * same names on every panel that prints one.
 */
export const ANIMAL_ART = true;
