/**
 * THE ANIMAL ART SWITCH.
 *
 * On, the six Mindustry trees draw as animals instead of its hulls, and
 * they are NAMED for the animal rather than for the weapon (levels.ts
 * FAMILY_NAMES, UNIT_NAMES): the ground mechs as the IRONHIDES (a rhino
 * line, the horn is the barrel, four planted legs from the T4), the venom
 * spitters as the DARTBACKS (a poison frog line, a mech as a runt and on
 * four legs from the T2), the Starlight mechs as STARHART (a stag line,
 * antler tines for beam emitters, hooves under the body until the T4
 * opens its stride), the
 * Skyfall bombers as STOOP (a bat line, membrane wings that flap, the
 * belly charge growing to the T5 nuke), the harpoon fleet as the SKATES
 * (a manta line on the bat's parts rig) and the wraith fleet as the
 * LIVEWIRES (a narwhal line on the same rig, its tusk the arc emitter).
 * Everything is generated at load (game/animalArt.ts) and packed over
 * the stock cells (game/atlas.ts packAnimalArt), so NOTHING under public/stock is touched and
 * flipping this back restores the shipped look byte for byte.
 *
 * IT ALSO GATES THE TWO FAMILIES THAT ARE NOT MINDUSTRY TREES. The
 * TUSKERS (an elephant line, game/tuskerArt.ts: no gun, a melee maul, and
 * bodies that open at nearly twice every other family's T1) and the
 * GRAPNELS (a starfish line, game/grapnelArt.ts) have no upstream hull
 * behind them and no sprite file to fall back to — they draw into cells
 * of their own that only the animal pass paints. Off the switch they
 * would be ten empty sprites, so both are shelved there instead
 * (levels.ts SHELVED_FAMILIES) and never rolled into a wave.
 *
 * Off, then, the six Mindustry lines are exactly what they were: the same
 * sprite files, the same rigs, and Mindustry's own names on every panel
 * that prints one (UNIT_NAMES falls back to the kind, capitalised), with
 * the seventh and eighth off the board.
 */
export const ANIMAL_ART = true;
