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
 * ember for fire, tether blue for a field, the venom line's purple for
 * rot, the fixer's green for repair.
 */

import { memoDraw, PAL, type Ink, type Layer, type Pen } from "./pixelArt";
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

/**
 * THE FLAME both fire symbols are cut from — the same teardrop twice, a
 * cool outer body with a hot heart inside it. That is PARTS and not
 * embossing (rule 5): the inner flame is a smaller flame, not a highlight
 * traced down an edge.
 *
 * TWO CHIPS WEAR IT: `burning`, the body that is alight, and `ignites`,
 * the gun that lights it. One picture, because they are one idea seen
 * from the two ends of it, and the catalog's whole promise is that a
 * player learns a symbol once.
 */
function flame(g: Pen): void {
  g.disc(0.5, 0.64, 0.34, PAL.emberDark);
  g.poly([[0.5, 0.0], [0.84, 0.64], [0.16, 0.64]], PAL.emberDark);
  g.over((o) => {
    o.disc(0.5, 0.7, 0.23, PAL.ember);
    o.poly([[0.5, 0.24], [0.73, 0.7], [0.27, 0.7]], PAL.ember);
  });
  g.over((o) => o.disc(0.5, 0.76, 0.14, PAL.flame));
}

/**
 * THE BOLT the `electric` chip is cut from — the gun whose shot conducts.
 * There was a second bolt beside it once, for a "shocked" mark on the
 * body; the mark did nothing and is gone, and the rule it half-stated is
 * written on SOAKED, which is the status that pays it.
 *
 * IT IS A BOLT IN SPARK BLUE, and the catalog already holds two other
 * bolts: `short` in the Wraith fleet's violet and `boost` in flame. That
 * is on purpose and it is how this file already works — a bolt means
 * ELECTRICITY and the hue says whose. The three never meet on one thing
 * either: a short is a building's, a last volley is a building's, and
 * this one is a body's.
 *
 * The strike is drawn UNSPLIT — one zigzag, nothing behind it — where
 * `short` puts its bolt over a dark bar. The bar there is the gun being
 * struck; nothing is being struck here, the body IS the thing, so the
 * mark stands alone with a dark keel under it for weight at seven pixels.
 */
function bolt(g: Pen): void {
  g.poly(
    [[0.7, 0.0], [0.16, 0.56], [0.44, 0.56], [0.3, 1.0], [0.84, 0.44], [0.56, 0.44]],
    PAL.spark,
  );
  g.over((o) => o.box(0, 0.62, 1, 1, PAL.sparkDark));
}

/**
 * THE CANOPY both field symbols are cut from — an arch with something
 * under it. Plating is already a shield silhouette in this catalog and two
 * shield silhouettes that differ only in colour are one symbol at seven
 * pixels; an arch with a body beneath it says the other half of what a
 * field is, which is that the thing inside is COVERED.
 *
 * `shield` (a pool standing in front of health), `bubble` (the body that
 * projects one) and `shields` (the body that hands them out) all wear it,
 * in three shades of the same blue: one picture, three places on the
 * chain — what is covered, what covers itself, what covers the crowd.
 */
function canopy(g: Pen, ink: Ink, under: Ink, cap: Ink): void {
  g.ring(0.5, 0.6, 0.44, 2, ink);
  g.erase((e) => e.box(0, 0.7, 1, 1, null)); // half a ring is an arch
  g.box(0.32, 0.64, 0.68, 0.98, under); // what is under it
  g.over((o) => o.box(0, 0.64, 1, 0.74, cap)); // its lit cap
}

/**
 * THE HEATER SHIELD, PLATED DOWN ITS MIDDLE — `armor`, the plating a body
 * wears, and `plates`, the body that hands plating out. The strake is
 * vertical for rule 6: a pale band across a symmetrical shield is a visor,
 * and a visor is a face.
 */
function heater(g: Pen): void {
  // FLAT ACROSS THE TOP. The first cut of this had the shoulders sloping
  // up to a point and it read as a funnel — and a funnel is what
  // `arriving` is. A shield has a straight top edge.
  g.poly([[0.08, 0.04], [0.92, 0.04], [0.92, 0.5], [0.5, 0.98], [0.08, 0.5]], PAL.steel);
  g.over((o) => {
    o.box(0.42, 0, 0.58, 1, PAL.steelLite); // the strake
    o.box(0, 0.72, 1, 1, PAL.steelDark); // the point, in shadow
  });
}

/** A RING WITH A WEDGE OUT OF IT — `cloaked`, the body that is dark right
 *  now, and `vanishes`, the body that is going to go dark. */
function gone(g: Pen): void {
  g.ring(0.5, 0.5, 0.42, 0.16, PAL.wraith);
  g.over((o) => o.box(0, 0.6, 1, 1, PAL.wraithDark));
  g.erase((e) => e.poly([[0.5, 0.5], [1.0, 0.2], [1.0, 0.8]], PAL.wraith));
}

/** THE CROSS — `regen`, a building being mended, and `heals`, the body
 *  that mends the crowd. */
function cross(g: Pen): void {
  g.box(0.38, 0.06, 0.62, 0.94, PAL.heal);
  g.box(0.06, 0.38, 0.94, 0.62, PAL.heal);
  g.over((o) => o.box(0, 0.62, 1, 1, PAL.healDark));
}

/** TWO CHEVRONS, a rank — `veteran`, the body that has aged, and `ages`,
 *  the body that is going to. */
function chevrons(g: Pen): void {
  g.poly([[0.5, 0.06], [0.94, 0.4], [0.78, 0.56], [0.5, 0.34], [0.22, 0.56], [0.06, 0.4]], PAL.harpoon);
  g.poly([[0.5, 0.5], [0.94, 0.84], [0.78, 1.0], [0.5, 0.78], [0.22, 1.0], [0.06, 0.84]], PAL.harpoon);
  g.over((o) => o.box(0, 0.7, 1, 1, PAL.harpoonDark));
}

/** A BOLT IN FLAME — `boost`, the gun reloading faster, and `hastens`,
 *  the body that drives the crowd faster. Speed is a bolt. */
function speedBolt(g: Pen): void {
  g.poly([[0.74, 0.0], [0.14, 0.58], [0.46, 0.58], [0.28, 1.0], [0.88, 0.42], [0.56, 0.42]], PAL.flame);
  g.over((o) => o.box(0, 0.5, 1, 1, PAL.emberLite));
  g.over((o) => o.box(0, 0.8, 1, 1, PAL.ember));
}

/** A SIGNAL CROSSED OUT — `jam`, the gun under the blanket, and `jams`,
 *  the flyer carrying it. The rings are the blanket, the bar is what it
 *  does to the gun under it. */
function jammed(g: Pen): void {
  g.ring(0.5, 0.5, 0.44, 0.14, PAL.bomber);
  g.ring(0.5, 0.5, 0.2, 0.12, PAL.bomber);
  g.over((o) => o.box(0, 0.6, 1, 1, PAL.bomberDark));
  g.poly([[0.06, 0.2], [0.2, 0.06], [0.94, 0.8], [0.8, 0.94]], PAL.steelDark);
}

const SYMBOLS: Record<StatusId, (g: Pen) => void> = {
  /**
   * PLATING — a heater shield, plated DOWN its middle. The strake is
   * vertical for rule 6: a pale band across a symmetrical shield is a
   * visor, and a visor is a face.
   */
  armor: (g) => heater(g),

  /**
   * SOAKED — the droplet, and nothing else. This is the symbol the
   * liquid turrets earn: a douser puts it on everything it reaches, so it
   * is the one in this file that will be on the screen in bulk, and
   * anything added to it would be the thing that stops reading first.
   */
  /**
   * NON-BULLET — a LANCE, and the only thing in this catalog drawn as a
   * line across the square rather than as an object in the middle of it.
   *
   * That is the point: every other symbol here is a thing (a droplet, a
   * flame, a shield), and this one is a thing PASSING THROUGH. A beam
   * that runs edge to edge says "it does not stop" without needing
   * anything for it to be not-stopping at, and a bullet-with-a-slash —
   * the obvious alternative — would have been two objects and a negation
   * at seven pixels, which is mush.
   *
   * The pale core inside the blue body is PARTS and not embossing (rule
   * 5): a beam is a hot line inside a cooler one, which is how every beam
   * in the game is actually drawn.
   */
  nonbullet: (g) => {
    g.poly([[0.0, 0.62], [0.62, 0.0], [1.0, 0.0], [0.38, 0.62]], PAL.sparkDark);
    g.poly([[0.0, 1.0], [0.62, 0.38], [1.0, 0.38], [0.38, 1.0]], PAL.sparkDark);
    g.over((o) => {
      o.poly([[0.16, 0.74], [0.7, 0.2], [0.88, 0.2], [0.34, 0.74]], PAL.spark);
      o.poly([[0.16, 0.96], [0.7, 0.42], [0.88, 0.42], [0.34, 0.96]], PAL.spark);
    });
    g.over((o) => o.poly([[0.24, 0.8], [0.72, 0.32], [0.8, 0.32], [0.32, 0.8]], PAL.sparkLite));
  },

  /** IGNITES — the flame again: the gun that lights what it hits, drawn
   *  as the fire it lights (see `flame`). */
  ignites: (g) => flame(g),

  /** SOAKS — the droplet again: the gun that leaves what it hits wet,
   *  drawn as the water it leaves (see `drop`). */
  soaks: (g) => drop(g),

  /** ELECTRIC — the bolt: the gun whose shot conducts (see `bolt`). */
  electric: (g: Pen) => bolt(g),

  // ---- THE BODY TRAITS (status.ts) ------------------------------------
  //
  // Seven of the fourteen are drawn as the thing they DO, borrowing the
  // picture of the live status they hand out — the canopy, the cross, the
  // heater, the bolt, the rings, the chevrons. That is this catalog's
  // whole promise working the way round it was meant to: a player who has
  // learned the green cross over a mending building reads "it mends the
  // crowd" off a body without being taught a second picture.

  /** FORCE FIELD — the canopy, in the mid blue: a body that covers
   *  ITSELF. Between `shield` (dark, what is under the arch is the pool)
   *  and `shields` (pale, it covers everyone). */
  bubble: (g) => canopy(g, PAL.fieldDark, PAL.field, PAL.fieldLite),

  /** SHIELD FIELD — the canopy at its brightest: the body handing the
   *  cover OUT. */
  shields: (g) => canopy(g, PAL.fieldLite, PAL.field, PAL.fieldLite),

  /** REPAIR FIELD — the green cross again (see `cross`). */
  heals: (g) => cross(g),

  /** PLATING FIELD — the heater shield again (see `heater`): what it
   *  hands out is the plate every body already wears. */
  plates: (g) => heater(g),

  /** HASTE FIELD — the flame bolt again (see `speedBolt`): speed is a
   *  bolt, and this one gives it away. */
  hastens: (g) => speedBolt(g),

  /** JAM FIELD — the crossed-out signal again (see `jammed`): the flyer
   *  carrying the blanket, drawn as the blanket. */
  jams: (g) => jammed(g),

  /**
   * SPOTTER — a LONG ARROW, because what a spotter gives is reach and
   * nothing else. A reticle was the first cut and this catalog already
   * holds three rings (`cloaked`, `jam`, `immune`); a fourth would have
   * been a ring the player has to read the colour of. An arrow that runs
   * off the edge of the square says "further" with no ring at all.
   */
  spots: (g) => {
    g.box(0.02, 0.42, 0.7, 0.58, PAL.harpoon);
    g.poly([[0.6, 0.16], [1.0, 0.5], [0.6, 0.84]], PAL.harpoon);
    g.over((o) => o.box(0, 0.6, 1, 1, PAL.harpoonDark));
  },

  /**
   * DRILL — an HOURGLASS, because what it hands the fleet is TIME: the
   * bodies round it get to hitting hard sooner. Narrow, so the pinch in
   * the middle is the silhouette — the chevrons beside it in this same
   * teal are full-width arrows, and the two must not be one shape.
   */
  drills: (g) => {
    g.poly([[0.24, 0.04], [0.76, 0.04], [0.5, 0.5]], PAL.harpoon);
    g.poly([[0.5, 0.5], [0.76, 0.96], [0.24, 0.96]], PAL.harpoon);
    g.over((o) => o.box(0, 0.6, 1, 1, PAL.harpoonDark));
  },

  /** VETERAN — the two chevrons again (see `chevrons`): the rank it is
   *  climbing, on the body that climbs it. */
  ages: (g) => chevrons(g),

  /**
   * BLINK — TWO ARROWS AND THE GAP BETWEEN THEM: a dim one where the body
   * was and a bright one where it now is. The gap is the whole idea, so it
   * is a third of the square wide — a teleport drawn without room to have
   * travelled reads as an arrow with a bite out of it.
   */
  blinks: (g) => {
    g.poly([[0.02, 0.2], [0.36, 0.5], [0.02, 0.8]], PAL.wraithDark);
    g.poly([[0.56, 0.12], [0.98, 0.5], [0.56, 0.88]], PAL.wraith);
  },

  /** CLOAK — the ring with a wedge out of it (see `gone`): the body that
   *  goes dark, drawn as the dark it goes into. */
  vanishes: (g) => gone(g),

  /**
   * CHARGE — A BODY AIMED AT A BUILDING, which is the whole of what the
   * trait is: it leaves the route and walks at the gun. The block is on
   * the right and the wedge is pointed into it, so the symbol has a
   * direction and the direction is "at your line".
   */
  charges: (g) => {
    g.box(0.74, 0.08, 1.0, 0.92, PAL.tuskDark);
    g.poly([[0.0, 0.5], [0.56, 0.12], [0.56, 0.88]], PAL.tusk);
    g.over((o) => o.box(0, 0.72, 1, 1, PAL.tuskDark));
  },

  /**
   * GRAPPLE — A HOOK ON A LINE, and the line is taut. The shank runs from
   * the bottom-left corner to the head at the top right and the two barbs
   * come back off it, which at seven pixels is the only hook shape that
   * survives: a grapnel drawn with three or four flukes is a blob. Copper,
   * the family's own (PAL.hook), and nothing else on it.
   */
  grapples: (g) => {
    g.poly([[0.02, 0.98], [0.2, 0.98], [0.86, 0.3], [0.68, 0.14]], PAL.hookDark);
    g.box(0.56, 0.02, 0.98, 0.26, PAL.hook);
    g.box(0.36, 0.14, 0.56, 0.34, PAL.hook);
    g.over((o) => o.box(0, 0.6, 1, 1, PAL.hookDark));
  },

  /**
   * ANCHORED — the same hook, STOPPED: a block with a bar across it, in
   * the same copper, because what the chip says is "this one has already
   * been dragged and no other hook may take it". It has to read as a
   * refusal at a glance rather than as a second grapple, so the hook shape
   * is gone entirely and what is left is the ground peg and the bar.
   */
  anchored: (g) => {
    g.box(0.4, 0.06, 0.6, 0.72, PAL.hook);
    g.box(0.12, 0.72, 0.88, 0.94, PAL.hookDark);
    g.box(0.06, 0.3, 0.94, 0.48, PAL.hookDark);
    g.over((o) => o.box(0, 0.74, 1, 1, PAL.hookDark));
  },

  /**
   * PAYLOAD — a bomb with a lit fuse. The body IS the bomb, so the symbol
   * is the bomb and not a body carrying one; the spark is the single
   * accent (rule 5), and it is what says the thing is live rather than
   * cargo.
   */
  bomb: (g) => {
    g.disc(0.44, 0.62, 0.36, PAL.bomber);
    g.over((o) => o.box(0, 0.74, 1, 1, PAL.bomberDark));
    g.box(0.56, 0.04, 0.74, 0.32, PAL.bomber);
    g.over((o) => o.disc(0.65, 0.1, 0.16, PAL.flame));
  },

  /**
   * IMMUNE — a ring with a BAR STRAIGHT THROUGH IT, the plainest "no" this
   * catalog can draw, in steel because it is not about any one status.
   * The bar is horizontal and the ring single, which is what keeps it off
   * `jam` (two rings, a DIAGONAL bar, magenta) at seven pixels.
   */
  immune: (g) => {
    g.ring(0.5, 0.5, 0.42, 0.16, PAL.steelLite);
    g.over((o) => o.box(0, 0.6, 1, 1, PAL.steelDark));
    g.box(0.1, 0.42, 0.9, 0.58, PAL.steelWhite);
  },

  wet: (g) => drop(g),

  /**
   * BURNING — a flame, drawn as the same teardrop twice: a cool outer
   * body with a hot heart inside it. That is PARTS and not embossing
   * (rule 5) — the inner flame is a smaller flame, not a highlight
   * traced down an edge.
   */
  burning: (g) => flame(g),

  /**
   * FORCE FIELD — a canopy over a body, not a shield outline. Plating is
   * already a shield silhouette in this catalog and two shield
   * silhouettes that differ only in colour are one symbol at seven
   * pixels; an arc with something under it says the other half of what a
   * force field is, which is that the thing inside is covered.
   */
  shield: (g) => canopy(g, PAL.field, PAL.fieldDark, PAL.fieldLite),

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
   * AMPHIBIOUS — the fixer's green coming UP out of a waterline. It is
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
   * LED — two rank chevrons, the pale one over the dim. A stripe on a
   * sleeve is what "there is an officer here" has looked like for two
   * centuries, and at seven pixels a chevron is the one shape that still
   * has a direction.
   *
   * The pair is UNEVEN — the top one wider and brighter — because two
   * identical marks stacked above a gap read as a face at this size
   * (rule 6), and because the eye needs one of them to lead.
   */
  led: (g) => {
    const chev = (y: number, k: number, c: Ink) =>
      g.poly([
        [0.5, y], [0.5 + 0.46 * k, y + 0.26 * k], [0.5 + 0.46 * k, y + 0.44 * k],
        [0.5, y + 0.18 * k], [0.5 - 0.46 * k, y + 0.44 * k], [0.5 - 0.46 * k, y + 0.26 * k],
      ], c);
    chev(0.5, 1, PAL.steel);
    chev(0.06, 1, PAL.steelWhite);
  },

  /**
   * MECH VIRUS — a gunmetal plate with a venom bite taken out of its
   * side and the bug sitting in the hole.
   *
   * IT IS DELIBERATELY NOT THE ROT SYMBOL IN ANOTHER COLOUR. Both eat a
   * building and both are drawn in the venom ink, so if they shared a
   * silhouette a
   * player would have to read the colour to tell "a spitter is on that"
   * from "the plague is on that" — and colour is the first thing seven
   * pixels takes away. Rot is a round blob dripping; this is a straight
   * plate with a piece missing. Different shape, same palette, one
   * glance.
   */
  virus: (g) => {
    g.box(0.06, 0.1, 0.94, 0.9, PAL.steel);
    g.over((o) => o.box(0, 0.62, 1, 1, PAL.steelDark));
    // the bite: a disc cut clean out of the plate's right edge
    g.erase((e) => e.disc(0.88, 0.5, 0.3, null));
    g.disc(0.74, 0.5, 0.19, PAL.venomDark);
    g.over((o) => o.disc(0.74, 0.44, 0.1, PAL.venom));
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
    g.disc(0.5, 0.38, 0.37, PAL.venomDark);
    g.over((o) => o.disc(0.5, 0.34, 0.21, PAL.venom));
    g.box(0.14, 0.72, 0.36, 1, PAL.venomDark);
    g.box(0.58, 0.78, 0.86, 1, PAL.venom);
  },

  /**
   * VETERAN — two chevrons, a sergeant's stripes, in the Harpoon fleet's
   * teal: the family whose hulls earn them. The lower one is darker so
   * the pair reads as stacked rather than as one fat V.
   */
  veteran: (g) => chevrons(g),

  /**
   * CLOAKED — a hollow ring with a bite out of it, in the wraiths' violet:
   * the outline of a thing whose middle is not there. It is the one
   * symbol in the file drawn as a ring rather than a body, because that
   * is what a cloak is.
   */
  cloaked: (g) => gone(g),

  /**
   * SHORTED — a violet bolt across a dark bar. The bar is the gun that is
   * out; the bolt is what put it out, in the one colour that means EMP
   * (PAL.wraith, the Wraith fleet's arc). It shares a shape with LAST VOLLEY
   * below on purpose and nothing else: both are electricity doing
   * something to a reload, and the colour is which — hot means faster,
   * violet means off.
   */
  short: (g) => {
    g.box(0.06, 0.34, 0.94, 0.66, PAL.steelDark);
    g.poly([[0.68, 0.0], [0.2, 0.56], [0.46, 0.56], [0.32, 1.0], [0.82, 0.42], [0.56, 0.42]], PAL.wraith);
    g.over((o) => o.box(0, 0.62, 1, 1, PAL.wraithDark));
  },

  /**
   * JAMMED — a signal crossed out: two rings, in the sky's own orange,
   * with a dark bar struck through them. The rings are the flight's
   * blanket and the bar is what it does to the gun under it.
   */
  jam: (g) => jammed(g),

  /** LAST VOLLEY — a bolt, hot at the tip and cooling down its length.
   *  A gun reloading three times as fast is speed, and speed is a bolt. */
  boost: (g) => speedBolt(g),

  /** MENDING — the fixer's cross. Nothing else in the game is a green
   *  plus, and a plus is the one shape that survives any size. */
  regen: (g) => cross(g),

  /**
   * UNDYING — a rampart with the fixer's green in the gate, the same
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
 * sub-rectangles — and a wave soaked by a deluge puts a few hundred
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
