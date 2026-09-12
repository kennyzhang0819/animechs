/**
 * THE STATUS SYMBOLS — one drawing per status (status.ts), on a 12-square
 * grid.
 *
 * THE HOUSE RULES FOR DRAWING ONE OF THESE ARE IN pixelArt.ts, and this
 * catalog is the one held hardest to rule 2 (SIMPLE BEATS FAITHFUL),
 * because it is read smaller than anything else in the game.
 *
 * WHY 12. Match the grid to the size the thing is read at. A mod glyph is
 * drawn at 16 because a shelf chip shows it at 12 to 15; a mutator face is
 * drawn at 32 because a tile shows it at 20 to 56. These are read at
 * SEVEN WORLD PIXELS over a body on the field (game.ts STATUS_PX) and at
 * about sixteen CSS pixels in the inspector, and seven is the number that
 * matters — a symbol that only works in the panel is a symbol the player
 * never learns, because the field is where they will meet it. So: nothing
 * narrower than two grid pixels anywhere in this file, which at 12 is a
 * sixth of the icon, and one object per drawing with at most one accent.
 *
 * WHY THE FIELD DRAWS THEM AS PATHS AND NOT AS SPRITES. The overlay is in
 * world space under the camera, so a symbol's size on screen is whatever
 * the zoom makes it and there is no integer scale to snap to. A rasterised
 * 12x12 resampled to 6.3 screen pixels is mush; the same runs filled as
 * geometry are exact at any size, and they cost three fills a symbol
 * because toLayers has already collapsed each colour into one path.
 *
 * NOTHING HERE CARRIES A RARITY BAND (rule 4) — these are not rewards.
 * Each is the colour of the thing it depicts: water blue for a soak,
 * ember for fire, parallax blue for a field, the venom line's purple for
 * rot, the mender's green for repair.
 */

import { memoDraw, PAL, type Layer, type Pen } from "./pixelArt";
import { STATUSES, type StatusId } from "./status";

/** the grid, and the viewBox every symbol is drawn in */
export const STATUS_GRID = 12;

/**
 * THE DROPLET both water symbols are cut from — a point over a ball, the
 * same silhouette the mutator faces use so the three water pictures in
 * the game are one shape at three sizes. The shine is a single flat pip
 * and not a traced highlight (rule 5), and it is ONE pip because two
 * would be eyes (rule 6).
 */
function drop(g: Pen): void {
  g.disc(0.5, 0.6, 0.34, PAL.water);
  g.poly([[0.5, 0.04], [0.86, 0.62], [0.14, 0.62]], PAL.water);
  g.over((o) => {
    o.box(0, 0.78, 1, 1, PAL.waterDark); // the underside
    o.box(0.26, 0.44, 0.42, 0.62, PAL.waterLite); // the shine
  });
}

const SYMBOLS: Record<StatusId, (g: Pen) => void> = {
  /**
   * PLATING — a heater shield, plated DOWN its middle. The strake is
   * vertical for rule 6: a pale band across a symmetrical shield is a
   * visor, and a visor is a face.
   */
  armor: (g) => {
    // FLAT ACROSS THE TOP. The first cut of this had the shoulders sloping
    // up to a point and it read as a funnel — and a funnel is what
    // `arriving` is, two rows down. A shield has a straight top edge.
    g.poly([[0.08, 0.04], [0.92, 0.04], [0.92, 0.5], [0.5, 0.98], [0.08, 0.5]], PAL.steel);
    g.over((o) => {
      o.box(0.42, 0, 0.58, 1, PAL.steelLite); // the strake
      o.box(0, 0.72, 1, 1, PAL.steelDark); // the point, in shadow
    });
  },

  /**
   * SOAKED — the droplet, and nothing else. This is the symbol the
   * liquid turrets earn: a wave puts it on everything it reaches, so it
   * is the one in this file that will be on the screen in bulk, and
   * anything added to it would be the thing that stops reading first.
   */
  wet: (g) => drop(g),

  /**
   * BURNING — a flame, drawn as the same teardrop twice: a cool outer
   * body with a hot heart inside it. That is PARTS and not embossing
   * (rule 5) — the inner flame is a smaller flame, not a highlight
   * traced down an edge.
   */
  burning: (g) => {
    g.disc(0.5, 0.64, 0.34, PAL.emberDark);
    g.poly([[0.5, 0.0], [0.84, 0.64], [0.16, 0.64]], PAL.emberDark);
    g.over((o) => {
      o.disc(0.5, 0.7, 0.23, PAL.ember);
      o.poly([[0.5, 0.24], [0.73, 0.7], [0.27, 0.7]], PAL.ember);
    });
    g.over((o) => o.disc(0.5, 0.76, 0.14, PAL.flame));
  },

  /**
   * FORCE FIELD — a canopy over a body, not a shield outline. Plating is
   * already a shield silhouette in this catalog and two shield
   * silhouettes that differ only in colour are one symbol at seven
   * pixels; an arc with something under it says the other half of what a
   * force field is, which is that the thing inside is covered.
   */
  shield: (g) => {
    g.ring(0.5, 0.6, 0.44, 2, PAL.field);
    g.erase((e) => e.box(0, 0.7, 1, 1, null)); // half a ring is an arch
    g.box(0.32, 0.64, 0.68, 0.98, PAL.fieldDark); // what is under it
    g.over((o) => o.box(0, 0.64, 1, 0.74, PAL.fieldLite)); // its lit cap
  },

  /**
   * ARRIVING — a chevron coming down onto a pad. It is the drop, not the
   * body: the unit is not there yet, which is the whole reason shots are
   * passing through it.
   */
  arriving: (g) => {
    // A STEM AND A HEAD, not a bare triangle: a wide triangle over a bar
    // is a funnel, which is what the plating shield used to look like.
    g.box(0.38, 0.02, 0.62, 0.48, PAL.steelLite);
    g.poly([[0.5, 0.76], [0.12, 0.32], [0.88, 0.32]], PAL.steelLite);
    g.box(0.06, 0.84, 0.94, 1, PAL.steel); // the pad it is coming down onto
  },

  /**
   * HUNGRY — a steel maw with a wedge bitten out of it and an ember
   * throat behind. The mutator face wears an eye; at seven pixels an eye
   * is dirt, so this has none — and without it the shape cannot turn
   * into the duck that face had to be redrawn out of (rule 6).
   */
  hungry: (g) => {
    g.disc(0.5, 0.5, 0.46, PAL.steel);
    g.over((o) => o.box(0, 0.72, 1, 1, PAL.steelDark));
    g.erase((e) => e.poly([[0.44, 0.5], [1.1, 0.1], [1.1, 0.9]], null));
    g.poly([[0.36, 0.5], [0.6, 0.32], [0.6, 0.68]], PAL.emberDark);
  },

  /**
   * AMPHIBIOUS — the mender's green coming UP out of a waterline. It is
   * deliberately not the droplet-with-a-stem the mutator face uses: that
   * one and the plain droplet are the same silhouette, and the two would
   * be indistinguishable at the size this is read at. A line of water
   * with something rising out of it is a different shape at any size.
   */
  waded: (g) => {
    g.box(0, 0.7, 1, 0.84, PAL.water);
    g.box(0, 0.84, 1, 1, PAL.waterDark);
    g.poly([[0.5, 0.02], [0.96, 0.48], [0.68, 0.48], [0.68, 0.72], [0.32, 0.72], [0.32, 0.48], [0.04, 0.48]], PAL.heal);
  },

  /**
   * ROT — the venom orb, dripping. The orb is the spitter family's whole
   * signature on the field (weapons.ts venomOrb: a two-tone purple ball),
   * so what is eating the turret is drawn as the thing that was thrown at
   * it. The two drips are different widths and sit at different heights,
   * which is what keeps a pair of marks under a round shape from
   * becoming a face.
   */
  rot: (g) => {
    g.disc(0.5, 0.38, 0.37, PAL.sapDark);
    g.over((o) => o.disc(0.5, 0.34, 0.21, PAL.sap));
    g.box(0.14, 0.72, 0.36, 1, PAL.sapDark);
    g.box(0.58, 0.78, 0.86, 1, PAL.sap);
  },

  /**
   * VETERAN — two chevrons, a sergeant's stripes, in the flame gold that
   * means "more" everywhere else in the game (last volley's bolt is the
   * same ink). The lower one is darker so the pair reads as stacked
   * rather than as one fat V.
   */
  veteran: (g) => {
    g.poly([[0.5, 0.06], [0.94, 0.4], [0.78, 0.56], [0.5, 0.34], [0.22, 0.56], [0.06, 0.4]], PAL.flame);
    g.poly([[0.5, 0.5], [0.94, 0.84], [0.78, 1.0], [0.5, 0.78], [0.22, 1.0], [0.06, 0.84]], PAL.flameLite);
    g.over((o) => o.box(0, 0.7, 1, 1, PAL.ember));
  },

  /**
   * CLOAKED — a hollow ring with a bite out of it, in the wraiths' cyan:
   * the outline of a thing whose middle is not there. It is the one
   * symbol in the file drawn as a ring rather than a body, because that
   * is what a cloak is.
   */
  cloaked: (g) => {
    g.ring(0.5, 0.5, 0.42, 0.16, PAL.emp);
    g.over((o) => o.box(0, 0.6, 1, 1, PAL.empDark));
    g.erase((e) => e.poly([[0.5, 0.5], [1.0, 0.2], [1.0, 0.8]], PAL.emp));
  },

  /**
   * SHORTED — a cyan bolt across a dark bar. The bar is the gun that is
   * out; the bolt is what put it out, in the one colour that means EMP
   * (PAL.emp, the Wraith fleet's arc). It shares a shape with LAST VOLLEY
   * below on purpose and nothing else: both are electricity doing
   * something to a reload, and the colour is which — hot means faster,
   * cyan means off.
   */
  short: (g) => {
    g.box(0.06, 0.34, 0.94, 0.66, PAL.steelDark);
    g.poly([[0.68, 0.0], [0.2, 0.56], [0.46, 0.56], [0.32, 1.0], [0.82, 0.42], [0.56, 0.42]], PAL.emp);
    g.over((o) => o.box(0, 0.62, 1, 1, PAL.empDark));
  },

  /**
   * JAMMED — a signal crossed out: two rings, in the sky's own orange,
   * with a dark bar struck through them. The rings are the flight's
   * blanket and the bar is what it does to the gun under it.
   */
  jam: (g) => {
    g.ring(0.5, 0.5, 0.44, 0.14, PAL.sky);
    g.ring(0.5, 0.5, 0.2, 0.12, PAL.sky);
    g.over((o) => o.box(0, 0.6, 1, 1, PAL.skyDark));
    g.poly([[0.06, 0.2], [0.2, 0.06], [0.94, 0.8], [0.8, 0.94]], PAL.steelDark);
  },

  /** LAST VOLLEY — a bolt, hot at the tip and cooling down its length.
   *  A gun reloading three times as fast is speed, and speed is a bolt. */
  boost: (g) => {
    g.poly([[0.74, 0.0], [0.14, 0.58], [0.46, 0.58], [0.28, 1.0], [0.88, 0.42], [0.56, 0.42]], PAL.flame);
    g.over((o) => o.box(0, 0.5, 1, 1, PAL.emberLite));
    g.over((o) => o.box(0, 0.8, 1, 1, PAL.ember));
  },

  /** MENDING — the mender's cross. Nothing else in the game is a green
   *  plus, and a plus is the one shape that survives any size. */
  regen: (g) => {
    g.box(0.38, 0.06, 0.62, 0.94, PAL.heal);
    g.box(0.06, 0.38, 0.94, 0.62, PAL.heal);
    g.over((o) => o.box(0, 0.62, 1, 1, PAL.healDark));
  },

  /**
   * UNDYING — a rampart with the mender's green in the gate, the same
   * picture the Undying Legion attribute wears on the shelf (modArt.ts
   * `legion`). Two places, one drawing, one thing to learn: the wall that
   * does not come down the first time.
   */
  revive: (g) => {
    g.box(0.04, 0.32, 0.96, 0.96, PAL.steel);
    for (const x of [0.04, 0.4, 0.76]) g.box(x, 0.1, x + 0.2, 0.32, PAL.steel);
    g.over((o) => o.box(0, 0.78, 1, 1, PAL.steelDark));
    g.box(0.38, 0.54, 0.62, 0.96, PAL.healDark);
  },

  /**
   * WATERLOGGED — the droplet with a cold arrow driven down through it,
   * exactly as the Hydrophobic mutator face is drawn. A soaked BODY and a
   * soaked TURRET are the same water doing two different things, and the
   * arrow is which one: the body's symbol is the plain drop, the
   * building's is the drop pointing down at the reload it costs.
   */
  soaked: (g) => {
    drop(g);
    g.over((o) =>
      // WHITE, not the gunmetal the mutator face uses. A dark arrow inside
      // a dark blue droplet is two shades apart and the arrow is the whole
      // difference between this symbol and the body's.
      o.poly([[0.5, 0.88], [0.24, 0.58], [0.38, 0.58], [0.38, 0.32], [0.62, 0.32], [0.62, 0.58], [0.76, 0.58]], PAL.steelWhite),
    );
  },

  /**
   * TAKEN — a flag on a pole, in the swarm's own red. Conquest turns a
   * wreck into a gun pointed the other way, and a flag planted on it is
   * the oldest picture there is for ground that has changed hands.
   */
  conquered: (g) => {
    g.box(0.12, 0.02, 0.32, 1.0, PAL.steelDark);
    g.over((o) => o.box(0.12, 0.02, 0.22, 1.0, PAL.steel));
    g.box(0.32, 0.1, 0.94, 0.56, PAL.emberDark);
    g.over((o) => o.box(0, 0.1, 1, 0.34, PAL.ember));
  },
};

/** the picture a status wears, as paths — drawn once per id and kept */
export const statusGlyph = memoDraw(SYMBOLS, STATUS_GRID, "armor");

/**
 * A CATALOG THAT BREAKS ITS OWN RULES IS A PROGRAMMING ERROR, and it is
 * caught on the first page load rather than by a blank square appearing
 * over a body mid-wave: every status in the catalog has to have a picture
 * here, and nothing here may be a picture of a status that does not
 * exist.
 */
for (const d of STATUSES)
  if (!(d.id in SYMBOLS)) throw new Error(`status ${d.id} has no symbol (statusArt.ts)`);

/**
 * THE SAME DRAWINGS, RASTERISED ONCE PER SIZE, for the field.
 *
 * THIS USED TO FILL PATHS AND THAT WAS THE BUG. Each symbol is three to
 * five colours and each colour is a Path2D of twenty-odd one-pixel-tall
 * rectangles, so drawing one cost four `fill()` calls over a hundred-odd
 * sub-rectangles — and a wave soaked by a tsunami puts a few hundred
 * symbols on the screen at once, which is a couple of thousand path fills
 * a frame. It does not show up in a CPU timer around the call, because
 * what is expensive is the canvas rasterising them, not the JS asking.
 *
 * So each symbol is drawn ONCE into a little offscreen canvas at the
 * exact pixel size the field wants it, and the field blits it. One
 * drawImage a symbol, no tessellation, and the cache is keyed by size so
 * the blit is always 1:1 — which also makes it CRISP, where filling
 * geometry at 2.6 px was a smear.
 *
 * The cache is per (symbol, integer pixel size). Zoom is continuous but
 * the size is rounded, so the set is bounded and small: thirteen symbols
 * across the two-to-sixty-four pixel range these are ever drawn at, each
 * a few kilobytes, built lazily and only for the sizes actually used.
 *
 * It is built on first use rather than at module load because `document`
 * is not a thing in the playtest bot, which imports this file's catalog.
 */
const SPRITES = new Map<string, HTMLCanvasElement>();

/** the biggest a field symbol is ever asked for — a hard bound on the
 *  cache, and far past what any zoom on any display reaches */
const SPRITE_MAX = 64;

export function statusSprite(id: StatusId, px: number): HTMLCanvasElement {
  const n = Math.max(1, Math.min(SPRITE_MAX, Math.round(px)));
  const key = id + "|" + n;
  let hit = SPRITES.get(key);
  if (!hit) {
    hit = document.createElement("canvas");
    hit.width = n;
    hit.height = n;
    const c = hit.getContext("2d");
    if (c) {
      const k = n / STATUS_GRID;
      c.scale(k, k);
      for (const l of statusGlyph(id) as readonly Layer[]) {
        c.fillStyle = l.color;
        c.fill(new Path2D(l.d));
      }
    }
    SPRITES.set(key, hit);
  }
  return hit;
}
