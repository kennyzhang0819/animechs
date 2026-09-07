"use client";

/**
 * WHAT A MUTATOR LOOKS LIKE — its face, and the colour of how bad it is.
 *
 * IT LIVES HERE BECAUSE THREE SCREENS DRAW THE SAME RULE. The codex board
 * draws a shelf of them, the deploy dialog draws the handful this run is
 * played under, and the tab strip over both of them wears the codex's own
 * glyph. A rule that reads as Brutal red on one screen and amber on
 * another is a bug a player cannot report, so the face and the band are
 * one module and every screen asks it rather than keeping its own copy.
 *
 * NOTHING HERE KNOWS WHAT A SCREEN IS. No layout, no hover card, no
 * geometry — just "what does this rule look like" and "how bad is it",
 * which is the whole of what the three screens agree on.
 */

import { MUT_COST_MAX, mutationById, mutationCostOf } from "@/game/mutation";
import type { MutationDef, MutationId } from "@/game/mutation";

/** the codex's colour, kept from the old column — deliberately NOT the
 *  tree's gold, because gold on the other board means "bought, owned,
 *  yours", and there is nothing here to own. The tab strip still wears it;
 *  a card's own face wears its band (see MutationFace). */
export const MUT_LIT = "#FF8ACB";

/** three chevrons climbing — the codex tab's face, and the fallback card
 *  glyph for a mutator with no face of its own */
export const MUT_GLYPH = "M12 2 4 9h5v2H4l8 7 8-7h-5V9h5z";

/**
 * THE FACES — one path per rule, no sprites.
 *
 * THESE USED TO BE PNGs. Four rules carried pixel art and the rest carried
 * paths, so a shelf of mutators was half drawn art and half line glyph, at
 * two different weights, and neither half could take the band's colour —
 * the art was whatever colour it had been painted. Every face is a path
 * now: one weight, and every one of them tinted by how bad the rule is.
 *
 * Drawn on a 24x24 box, solid fills, no strokes — they are read at 20px on
 * the deploy chips, so anything finer than a 2px limb disappears there.
 * Two of them cut a hole with fillRule="evenodd" (the shields), which is
 * why the <path> below sets it.
 */
const MUT_FACE: Record<string, string> = {
  /** a dome on a base — the Shield Towers' silhouette */
  shieldTowers: "M4 14a8 8 0 0 1 16 0v2H4zM6 18h12v3H6z",
  /** a shield with a plate seam across it — Armored Swarms */
  armored:
    "M12 1.5 3.5 4.5v7c0 5 3.6 9.3 8.5 11 4.9-1.7 8.5-6 8.5-11v-7zM5.3 10.2h13.4v2.2H5.3z",
  /** the same shield carrying a plus — Overshields is armour ADDED */
  overshields:
    "M12 1.5 3.5 4.5v7c0 5 3.6 9.3 8.5 11 4.9-1.7 8.5-6 8.5-11v-7zM10.9 6.6h2.2v3.3h3.3v2.2h-3.3v3.3h-2.2v-3.3H7.6V9.9h3.3z",
  /** a bolt — Speedy, and the only rule in the catalog worth five */
  speedy: "M13.4 1.5 4 13.4h5.2L8 22.5 19.4 10h-5.6z",
  /** an open mouth mid-bite — Hungry eats the bodies */
  hungry: "M12 12 22.5 6.2A11.5 11.5 0 1 0 22.5 17.8z",
  /** a droplet with a rising chevron inside it — Amphibious is what comes
   *  UP out of the water, stronger than it went in */
  amphibious:
    "M12 1.6c4.3 5 7.3 8.9 7.3 12.4a7.3 7.3 0 0 1-14.6 0c0-3.5 3-7.4 7.3-12.4zM12 8.4l4.4 5.1h-2.6v4.4h-3.6v-4.4H7.6z",
  /** a droplet — Hydrophobic is the water itself, standing too close */
  hydrophobic: "M12 1.6c4.3 5 7.3 8.9 7.3 12.4a7.3 7.3 0 0 1-14.6 0c0-3.5 3-7.4 7.3-12.4z",
  /** one body and the two it came apart into — Mitosis is a death that
   *  leaves more of them standing than it took away */
  mitosis:
    "M2 12a6 6 0 1 0 12 0a6 6 0 1 0-12 0zM15.5 6.5a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0-7 0zM15.5 17.5a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0-7 0z",
  /** a burst — Volatile is what happens when one of them dies */
  volatile: "M12.0 1.0 13.8 7.6 19.8 4.2 16.4 10.2 23.0 12.0 16.4 13.8 19.8 19.8 13.8 16.4 12.0 23.0 10.2 16.4 4.2 19.8 7.6 13.8 1.0 12.0 7.6 10.2 4.2 4.2 10.2 7.6z",
};

/**
 * The card's face: the rule's glyph, tinted by its band. A mutator's whole
 * job on a shelf is "how bad is this", so the face answers it before the
 * border does — Light green, Heavy amber, Brutal red — and a rule nobody
 * has drawn yet falls back to the codex's own chevrons in the same colour.
 */
export function MutationFace({ id, size }: { id: string; size: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`${size} shrink-0 fill-current`}
      style={{ color: bandFor(mutationById(id)).color }}
      aria-hidden="true"
    >
      <path fillRule="evenodd" d={MUT_FACE[id] ?? MUT_GLYPH} />
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
