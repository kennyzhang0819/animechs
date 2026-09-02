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

import { MUT_COST_MAX } from "@/game/mutation";

/** the codex's colour, kept from the old column — deliberately NOT the
 *  tree's gold, because gold on the other board means "bought, owned,
 *  yours", and there is nothing here to own */
export const MUT_LIT = "#FF8ACB";

/** three chevrons climbing — the codex tab's face, and the fallback card
 *  glyph for a mutator with no face of its own */
export const MUT_GLYPH = "M12 2 4 9h5v2H4l8 7 8-7h-5V9h5z";
/** a dome on a base — the Shield Towers' silhouette */
const SHIELD_TOWER_GLYPH = "M4 14a8 8 0 0 1 16 0v2H4zM6 18h12v3H6z";
/** a shield with a plate seam across it — Armored Swarms */
const ARMORED_GLYPH =
  "M12 1.5 3.5 4.5v7c0 5 3.6 9.3 8.5 11 4.9-1.7 8.5-6 8.5-11v-7zM5.3 10.2h13.4v2.2H5.3z";

/**
 * The face a mutator wears on its card, as a path — the stand-in for a
 * rule nobody has drawn yet. MUT_ART wins wherever it has an entry, so a
 * rule listed in both would have a glyph that never renders: when art
 * lands for one of these, its line here goes.
 */
const MUT_FACE: Record<string, string> = {
  shieldTowers: SHIELD_TOWER_GLYPH,
  armored: ARMORED_GLYPH,
};

/**
 * ART, where a rule has some — pixel sprites, drawn at the scale the
 * turret icons are, because a card whose whole job is "how bad is this"
 * leads with a face rather than a number. A drawn icon beats a path the
 * moment one exists, so the glyphs above are only ever reached by a rule
 * nobody has illustrated yet.
 */
const MUT_ART: Record<string, string> = {
  hungry: "/mutators/hungry.png",
  speedy: "/mutators/speedy.png",
  volatile: "/mutators/volatile.png",
  overshields: "/mutators/overshields.png",
};

/** the card's face: the sprite if the rule has one, else its glyph */
export function MutationFace({ id, size }: { id: string; size: string }) {
  const art = MUT_ART[id];
  if (art)
    return (
      // eslint-disable-next-line @next/next/no-img-element -- raw pixel sprite
      <img
        src={art}
        alt=""
        className={`${size} shrink-0 object-contain [image-rendering:pixelated]`}
      />
    );
  return (
    <svg
      viewBox="0 0 24 24"
      className={`${size} shrink-0 fill-current`}
      style={{ color: MUT_LIT }}
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
