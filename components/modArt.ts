/**
 * THE MOD GLYPHS — one drawing per GLYPH, on a 16-square grid.
 *
 * THE HOUSE RULES FOR DRAWING ONE OF THESE ARE IN pixelArt.ts. Two of
 * them matter more here than anywhere else in the game:
 *
 * KEYED BY GLYPH, NEVER BY MOD ID (rule 3). The common "+10% damage" and
 * the uncommon "+25% damage" are the same stat at two sizes, so they are
 * the SAME BARREL — the identical drawing, not a recolour and not a
 * variant with an extra pip. What separates them is the band border the
 * chip already wears, which is the same four colours a turret card and a
 * formation wear, so a player has one legend to learn instead of eleven
 * families of near-identical icons. game/mods.ts enforces the other half
 * of this: two mods may share a glyph, but never inside one band, where
 * the colour could not tell them apart.
 *
 * THESE ARE DRAWN AT 16 BECAUSE THEY ARE READ AT 12 (rule 2). A relic
 * shelf chip is 22 CSS pixels with a 15px glyph in it, and the deal
 * card's list draws them at 12. At that size a 32-grid is two art pixels
 * to one screen pixel and every drawing turns to mush; 16 lands about one
 * to one, which is the only place pixel art is actually sharp. It also
 * forces the discipline — there is no room on a 16-grid for anything but
 * one clear object and one accent.
 *
 * RELIC GLYPHS ARE NOT HERE. The global half of the catalog — crosshair,
 * coolant, coin, vault, flame, volley, phoenix, fan, legion, star — is
 * still drawn as line strokes in Relics.tsx. Nothing about that is
 * principled; they simply have not been drawn yet, and Glyph falls
 * through to the old strokes for any glyph this file does not know.
 */

import { memoDraw, PAL, type Pen } from "./pixelArt";

/** the grid, and the viewBox every glyph is drawn in */
export const MOD_GRID = 16;

/**
 * ELEVEN DRAWINGS FOR SIXTEEN TURRET MODS. Damage, fire rate, health and
 * range each have a common and an uncommon sharing one picture; pierce
 * has an uncommon and a rare sharing one; the rest are one apiece.
 *
 * NONE OF THESE TRACES THE LINE GLYPH IT REPLACES (rule 1). The strokes
 * were two marks on a 24-grid and had to be abstract; these do not, so
 * each one is the most obvious concrete object that says the stat. Range
 * was a circle with a stick and is a spyglass. Repair was a lattice and
 * is a wrench. Pierce was a diamond and is a dart going through a plate.
 */
const GLYPHS: Record<string, (g: Pen) => void> = {
  /** DAMAGE — a cannon barrel, firing. The muzzle flash is the whole
   *  read: a barrel alone is a rectangle, a barrel with fire coming out
   *  of it is damage. */
  barrel: (g) => {
    g.box(0.12, 0.34, 0.66, 0.66, PAL.steel);
    g.over((o) => {
      o.box(0, 0.34, 1, 0.47, PAL.steelLite);          // the lit top of the tube
      o.box(0, 0.6, 1, 0.66, PAL.steelDark);
    });
    g.box(0.06, 0.28, 0.25, 0.72, PAL.steelDark);      // the breech
    g.box(0.66, 0.3, 0.78, 0.7, PAL.emberDark);        // the muzzle, and the flash
    g.box(0.78, 0.38, 0.9, 0.62, PAL.emberLite);
    g.box(0.9, 0.44, 1, 0.56, PAL.flame);
  },

  /** FIRE RATE — a gear. Four stub teeth on a fat hub, not eight long
   *  ones: at 16 pixels a long tooth cross reads as a PLUS SIGN and the
   *  wheel disappears behind it. */
  gear: (g) => {
    g.disc(0.5, 0.5, 0.4, PAL.steel);
    for (const [x0, y0, x1, y1] of [[0.4, 0.0, 0.6, 0.2], [0.4, 0.8, 0.6, 1.0],
                                    [0.0, 0.4, 0.2, 0.6], [0.8, 0.4, 1.0, 0.6]])
      g.box(x0, y0, x1, y1, PAL.steel);
    g.over((o) => o.box(0, 0.58, 1, 1, PAL.steelDark));
    g.disc(0.5, 0.5, 0.16, PAL.flame);                 // the hub, running hot
  },

  /** HEALTH — a bolted hull plate. Deliberately RECTANGULAR: the Bulwark
   *  shield below is a tower shield and the mutator's Armored Swarms is a
   *  heater shield, and three armour icons in one game need three
   *  silhouettes rather than three sizes of the same one. */
  plate: (g) => {
    g.box(0.08, 0.16, 0.92, 0.84, PAL.steel);
    g.box(0.2, 0.28, 0.8, 0.72, PAL.steelLite);        // the inner panel
    for (const x of [0.11, 0.83]) for (const y of [0.2, 0.68])
      g.box(x, y, x + 0.1, y + 0.12, PAL.steelWhite);  // four corner bolts
  },

  /** RANGE — a magnifying glass: a RING of rim, glass inside it, and a
   *  stick of a handle off the corner. The rim has to be a ring and the
   *  handle has to be thin — drawn solid and stubby it came out a teapot.
   *  The Sniper's scope below is a reticle instead, so the two never
   *  collide. */
  lens: (g) => {
    g.poly([[0.58, 0.66], [0.74, 0.5], [1.0, 0.82], [0.84, 0.98]], PAL.steelDark);  // the handle
    g.disc(0.4, 0.4, 0.26, PAL.waterLite);             // the glass
    g.over((o) => o.box(0, 0.42, 1, 1, PAL.water));
    g.ring(0.4, 0.4, 0.36, 2, PAL.steelLite);          // the rim
  },

  /** PIERCE — a round already through the wall. THE HOLE IS THE POINT: a
   *  dart on its own is an arrow, and a dart with fins on it at 16 pixels
   *  is an aeroplane, which is what this was on the first pass. */
  spike: (g) => {
    g.box(0.6, 0.04, 0.88, 0.96, PAL.steelDark);       // the wall, edge on
    g.over((o) => o.box(0.6, 0, 0.7, 1, PAL.steel));
    g.erase((e) => e.box(0.58, 0.38, 0.9, 0.62, null));// punched clean through
    g.box(0.04, 0.44, 0.72, 0.56, PAL.steelLite);      // the shaft
    g.box(0.02, 0.38, 0.16, 0.62, PAL.steelDark);      // the base
    g.poly([[0.98, 0.5], [0.7, 0.34], [0.7, 0.66]], PAL.emberLite);  // the head, out the far side
  },

  /** REPAIR — an open-end wrench with a mender-green grip. A SQUARE head
   *  with a notch bitten out of it, not a C bent out of a ring: the ring
   *  version came out as a pair of antlers at this size. The old glyph
   *  was a woven lattice, which is a picture of a material rather than of
   *  anything being mended. */
  weave: (g) => {
    g.box(0.22, 0.04, 0.78, 0.36, PAL.steelLite);      // the head
    g.erase((e) => e.box(0.4, 0.0, 0.6, 0.22, null));  // the jaw
    g.box(0.38, 0.3, 0.62, 1.0, PAL.steel);            // the handle
    g.over((o) => o.box(0, 0.66, 1, 1, PAL.heal));     // the grip
  },

  /** PROTOTYPE CHASSIS — a frame with a live core in it. Half again the
   *  damage AND the rate is not one stat, so the picture is the FRAME the
   *  gun is built on rather than any part of the gun. */
  chassis: (g) => {
    g.box(0.1, 0.1, 0.9, 0.9, PAL.steel);
    g.erase((e) => e.box(0.24, 0.24, 0.76, 0.76, null));
    g.over((o) => o.box(0, 0.5, 1, 1, PAL.steelDark));
    for (const [x, y] of [[0.02, 0.02], [0.78, 0.02], [0.02, 0.78], [0.78, 0.78]])
      g.box(x, y, x + 0.2, y + 0.2, PAL.steelLite);    // four corner mounts
    g.box(0.34, 0.34, 0.66, 0.66, PAL.fieldDark);      // the core
    g.box(0.4, 0.4, 0.6, 0.6, PAL.fieldLite);
  },

  /** BULWARK PLATING — a tower shield with a mender pip. A TOWER shield,
   *  flat-topped and square-shouldered, so it does not collide with the
   *  heater shield the Armored Swarms mutator wears. */
  shield: (g) => {
    g.poly([[0.2, 0.08], [0.8, 0.08], [0.8, 0.6], [0.5, 0.94], [0.2, 0.6]], PAL.steel);
    g.over((o) => {
      o.box(0.44, 0, 0.56, 1, PAL.steelDeep);          // plating runs DOWN (rule 6)
      o.box(0.46, 0, 0.54, 1, PAL.steelLite);
      o.box(0, 0.74, 1, 1, PAL.steelDark);
    });
    g.box(0.28, 0.26, 0.44, 0.34, PAL.heal);           // the repair cross
    g.box(0.32, 0.18, 0.4, 0.42, PAL.heal);
  },

  /** GIANT — the big one, and the one it used to be, side by side. The
   *  first pass ran the body off the canvas to say "does not fit", and
   *  clipped art just reads as a drawing mistake; a SIZE COMPARISON says
   *  the same thing and survives being 12 pixels wide. */
  giant: (g) => {
    g.box(0.06, 0.66, 0.28, 0.94, PAL.steelDark);      // what a turret normally is
    g.box(0.34, 0.14, 0.98, 0.94, PAL.steel);          // what this one is
    g.over((o) => {
      o.box(0, 0.14, 1, 0.36, PAL.steelLite);
      o.box(0, 0.82, 1, 1, PAL.steelDark);
    });
    g.box(0.52, 0.46, 0.8, 0.66, PAL.emberLite);       // one lit port, for scale
  },

  /** SNIPER — a reticle, with the long ticks a scope has and a barrel
   *  block has not. Drawn as RINGS AND LINES rather than as an optic:
   *  the first pass drew the tube from the side and it read as a pair of
   *  goggles. */
  scope: (g) => {
    g.ring(0.5, 0.5, 0.44, 2, PAL.steelLite);
    g.box(0.46, 0.0, 0.54, 0.34, PAL.steelLite);       // the ticks, in past the ring
    g.box(0.46, 0.66, 0.54, 1.0, PAL.steelLite);
    g.box(0.0, 0.46, 0.34, 0.54, PAL.steelLite);
    g.box(0.66, 0.46, 1.0, 0.54, PAL.steelLite);
    g.disc(0.5, 0.5, 0.12, PAL.emberDark);             // where it lands
  },

  /** ALL ROUND — four arrows out of one core, and no dark side to it.
   *  Arrows on the axes rather than a starburst, so it cannot be mistaken
   *  for the Volatile mutator's explosion. */
  allround: (g) => {
    g.box(0.44, 0.06, 0.56, 0.94, PAL.steelLite);      // the shafts
    g.box(0.06, 0.44, 0.94, 0.56, PAL.steelLite);
    g.poly([[0.5, 0.0], [0.72, 0.22], [0.28, 0.22]], PAL.flame);      // the heads
    g.poly([[0.5, 1.0], [0.28, 0.78], [0.72, 0.78]], PAL.flame);
    g.poly([[0.0, 0.5], [0.22, 0.28], [0.22, 0.72]], PAL.flame);
    g.poly([[1.0, 0.5], [0.78, 0.28], [0.78, 0.72]], PAL.flame);
    g.box(0.32, 0.32, 0.68, 0.68, PAL.steel);          // the core
    g.box(0.38, 0.38, 0.62, 0.62, PAL.flameLite);
  },
};

/** every glyph this file can draw — Relics.tsx falls through to its old
 *  line strokes for anything not in here (the relic half) */
export const DRAWN_GLYPHS: ReadonlySet<string> = new Set(Object.keys(GLYPHS));

/** the picture a mod wears, as paths — drawn once per glyph and kept */
export const modGlyph = memoDraw(GLYPHS, MOD_GRID, "barrel");
