"use client";

/**
 * WHAT A MUTATOR LOOKS LIKE — its face, and the colour of how bad it is.
 *
 * IT LIVES HERE BECAUSE THREE SCREENS DRAW THE SAME RULE. The unlocks
 * board shelves every one of them, the progress track hands them out a
 * row at a time, and the deploy dialog draws the handful this run is
 * played under. A rule that reads as Brutal red on one screen and amber
 * on another is a bug a player cannot report, so the band lives here and
 * every screen asks it rather than keeping its own copy. The face is the
 * other half of the same question and comes from mutationArt.ts, which
 * draws it; this module is where a screen goes to get both.
 *
 * NOTHING HERE KNOWS WHAT A SCREEN IS. No layout, no hover card, no
 * geometry — just "what does this rule look like" and "how bad is it",
 * which is the whole of what the three screens agree on.
 */

import { MUT_COST_MAX, mutationById, mutationCostOf } from "@/game/mutation";
import type { MutationDef, MutationId } from "@/game/mutation";
import { FACE_GRID, mutatorFace } from "./mutationArt";

/** the codex's colour, kept from the old column — deliberately NOT the
 *  tree's gold, because gold on the other board means "bought, owned,
 *  yours", and there is nothing here to own. The unlocks tab wears it,
 *  and so does a mutator chip's ring on both boards. */
export const MUT_LIT = "#FF8ACB";

/**
 * The card's face: the rule's picture, drawn on a 32-square pixel grid in
 * the game's own palette (mutationArt.ts). A rule nobody has drawn yet
 * falls back to the codex's chevrons, the way it always has.
 *
 * THE FACE NO LONGER CARRIES THE BAND, AND NOTHING NEEDS IT TO. It used
 * to be a single path tinted by how dear the rule was, because the tint
 * was one of the things answering "how bad is this". Every screen that
 * draws a face already answers it another way: the deploy chip borders
 * itself in the band (DealRuleCell, MechSwarm), and the track and the
 * unlocks board both hand the band to the hover card as its corner word
 * (rewardLook, Progress) — which is the only place either of them ever
 * showed it, since a mutator chip wears the codex's pink on both.
 *
 * So the weight is read as a word or as a border, and the picture inside
 * is free to say what the RULE IS instead. Green heals, blue is a field,
 * ember is damage, gunmetal is a structure: the vocabulary the rest of
 * the art already speaks. On a track row that is the more consistent
 * thing as well as the prettier one — the chip under it holds a
 * full-colour turret sprite, and a flat-tinted glyph was the odd one
 * out.
 *
 * crispEdges is not decoration: without it the browser antialiases the
 * seams between two abutting runs and a 20px chip goes soft.
 */
export function MutationFace({ id, size }: { id: string; size: string }) {
  return (
    <svg
      viewBox={`0 0 ${FACE_GRID} ${FACE_GRID}`}
      className={`${size} shrink-0`}
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      {mutatorFace(id).map((layer) => (
        <path key={layer.color} fill={layer.color} d={layer.d} />
      ))}
    </svg>
  );
}

/**
 * THE THREE WEIGHTS — a border colour and a word.
 *
 * THE COST SCALE (MUT_COST_MIN), WORN RATHER THAN PRINTED. `max` is the
 * top cost that lands in the band; it picks the tile's border colour and
 * is never shown, because a player does not need to know Speedy is worth
 * five points to know it is the worst thing in the catalog. The word turns
 * up once, in the hover card, where it is the answer to "how bad is this".
 *
 * The last band must reach MUT_COST_MAX or a legal mutator would have no
 * colour at all (checked below, the way mutation.ts checks its own
 * catalog).
 */
const BANDS: readonly { label: string; color: string; max: number }[] = [
  { label: "Light", color: "#7BE58A", max: 2 },
  { label: "Heavy", color: "#FFB65C", max: 4 },
  { label: "Brutal", color: "#FF6B6B", max: MUT_COST_MAX },
];

if (BANDS[BANDS.length - 1].max < MUT_COST_MAX)
  throw new Error(
    `the weights stop at ${BANDS[BANDS.length - 1].max} but a mutator may cost ${MUT_COST_MAX}`,
  );

/** how bad a rule is, as the hover card says it */
export const bandOf = (cost: number): { label: string; color: string } =>
  BANDS.find((b) => cost <= b.max) ?? BANDS[BANDS.length - 1];

/**
 * The band a RULE wears — the only form the three screens should use.
 * Special first, weight after, because "not in the draw" outranks "how
 * dear" on a card the draw can never produce. A null def (an id from a
 * save this build does not know) falls through to the lightest band, the
 * same way an undrawn rule falls through to the codex chevrons.
 */
export const bandFor = (def: MutationDef | null): { label: string; color: string } =>
  bandOf(def ? mutationCostOf(def.id) : 0);
