/**
 * THE ANIMAL ART SWITCH — a trial, not a decision.
 *
 * On, two families draw as animals instead of Mindustry's hulls: the
 * Starlight mechs as STARHART (a stag line, antler tines for beam
 * emitters, hooves under the body until the T4 opens its stride) and the
 * Skyfall bombers as STOOP (a bat line, membrane wings that flap, the
 * belly charge growing to the T5 nuke). Everything is generated at load
 * (game/animalArt.ts) and packed over the stock cells (game/atlas.ts
 * packAnimalArt), so NOTHING under public/mindustry is touched and
 * flipping this back restores the shipped look byte for byte.
 *
 * Off, the two lines are exactly what they were: the same sprite files,
 * the same mech and legged rigs, the same single-quad flyers.
 */
export const ANIMAL_ART = true;
