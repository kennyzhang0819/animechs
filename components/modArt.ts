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
 * THE RELICS ARE HERE TOO, and they are drawn LOUDER. A MOD is one stat
 * and its picture is one object in gunmetal with one accent; a RELIC is
 * the whole board doing something different, and at a hundred and fifty
 * thousand scrap it is the most expensive thing on the shelf, so its
 * picture carries the colour of what it does — heat, coolant blue, scrap
 * gold, mender green, shield blue — over the whole drawing rather than as
 * a pip. A player scanning the shelf should be able to tell the relics
 * from the mods before reading a single border.
 *
 * ONE TABLE, TWO CATALOGS. The drawings are keyed by glyph name and the
 * two glyph unions are disjoint (mods.ts ModGlyph, relics.ts RelicGlyph),
 * so this file draws both halves without either knowing the other exists.
 */

import { memoDraw, PAL, type Pen } from "./pixelArt";

/** the grid, and the viewBox every glyph is drawn in */
export const MOD_GRID = 16;

/**
 * TWELVE DRAWINGS FOR SIXTEEN MODS. Damage, fire rate, health and range
 * each have a common and an uncommon sharing one picture; the rest are one
 * apiece. The fifteen relics get one drawing each — a relic is never a
 * "better version of" anything, so rule 3 has nothing to collapse.
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

  /** HEALTH — a heart, with a plate bolted across it. The heart is
   *  health in every game anyone has played; the plating is what makes
   *  it THIS game's, and keeps it from reading as a life pickup. Ember
   *  red rather than the mender's green, because the green is REPAIR
   *  (weave, below) and the two have to be told apart at 12 pixels.
   *
   *  The glyph's NAME is still `plate` in game/mods.ts — a key, not a
   *  description, and renaming it would churn the catalog to no effect. */
  plate: (g) => {
    g.disc(0.32, 0.36, 0.24, PAL.ember);               // the two lobes
    g.disc(0.68, 0.36, 0.24, PAL.ember);
    g.poly([[0.06, 0.44], [0.94, 0.44], [0.5, 0.98]], PAL.ember);  // the point
    g.over((o) => {
      o.box(0, 0, 1, 0.3, PAL.emberLite);              // the lit tops of the lobes
      o.box(0, 0.78, 1, 1, PAL.emberDark);             // the skirt
      o.box(0, 0.48, 1, 0.64, PAL.steelLite);          // the plate, bolted across
      o.box(0, 0.62, 1, 0.66, PAL.steelDark);          // its lower edge
    });
    for (const x of [0.22, 0.46, 0.7]) g.box(x, 0.52, x + 0.08, 0.6, PAL.steelDeep);  // rivets
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

  /** REPAIR — a green plus, and nothing else. Mender green is the
   *  colour every healing thing in this game already wears, and a plus
   *  is the one shape nobody has to think about. NO PLATING: a plus has
   *  no parts to butt against each other, and shading one only costs
   *  legibility at the 12 pixels the deal card's list draws it at. It
   *  was a wrench; the plus is the more honest picture of "mends 1% a
   *  second". */
  weave: (g) => {
    g.box(0.31, 0.09, 0.69, 0.91, PAL.heal);
    g.box(0.09, 0.31, 0.91, 0.69, PAL.heal);
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
   *  heater shield the Armored Swarms mutator wears. The pip is a CROSS
   *  ON A SHIELD and the health tick is a bare plus, which is the right
   *  way round: this mod is armour that also mends, and the tick is plain
   *  hit points. */
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

  // ── the fuse's own attribute ────────────────────────────────────────
  /** SPLITTER ARRAY — three spikes fanning out of one breech. The fan IS
   *  the volley: a fuse's three, and the two more this adds are what the
   *  rare border is for. */
  fan: (g) => {
    g.poly([[0.5, 0.94], [0.36, 0.94], [0.02, 0.14], [0.14, 0.06]], PAL.steelLite);
    g.poly([[0.44, 0.94], [0.56, 0.94], [0.56, 0.02], [0.44, 0.02]], PAL.steelLite);
    g.poly([[0.5, 0.94], [0.64, 0.94], [0.98, 0.14], [0.86, 0.06]], PAL.steelLite);
    g.over((o) => o.box(0, 0.62, 1, 1, PAL.steel));
    g.box(0.02, 0.06, 0.16, 0.18, PAL.emberLite);      // three hot tips
    g.box(0.44, 0.0, 0.56, 0.12, PAL.emberLite);
    g.box(0.84, 0.06, 0.98, 0.18, PAL.emberLite);
    g.box(0.3, 0.8, 0.7, 1.0, PAL.steelDark);          // the breech
  },

  // ── the relics ──────────────────────────────────────────────────────
  /** OVERCLOCK CORE — a reactor core running hot: gunmetal housing, and
   *  the whole inside of it is heat. Double damage is the board's power
   *  turned up, and this is the dial. */
  core: (g) => {
    g.ring(0.5, 0.5, 0.46, 3, PAL.steel);
    g.over((o) => o.box(0, 0.5, 1, 1, PAL.steelDark));
    g.disc(0.5, 0.5, 0.3, PAL.emberDark);
    g.disc(0.5, 0.5, 0.2, PAL.emberLite);
    g.disc(0.5, 0.5, 0.1, PAL.flameLite);
    for (const [x, y] of [[0.44, 0.0], [0.44, 0.88], [0.0, 0.44], [0.88, 0.44]])
      g.box(x, y, x + 0.12, y + 0.12, PAL.steelDark);  // four vents
  },

  /** COOLANT LOOP — a loop of pipe with a valve on it, in the water blue
   *  that everything cold in this game already wears. */
  coolant: (g) => {
    g.ring(0.5, 0.54, 0.4, 3, PAL.waterLite);
    g.over((o) => o.box(0, 0.54, 1, 1, PAL.water));
    g.box(0.36, 0.0, 0.64, 0.24, PAL.steelLite);       // the valve, on top
    g.box(0.44, 0.24, 0.56, 0.34, PAL.steelDark);
    g.box(0.42, 0.06, 0.58, 0.12, PAL.steelDark);      // its handle
  },

  /** SCAVENGER RIG — two coins, one behind the other, because the point
   *  is MORE of them. Scrap is grey in the item sprites, but a grey coin
   *  is a washer; a coin is gold or it is not a coin. */
  coin: (g) => {
    g.disc(0.62, 0.42, 0.34, PAL.emberLite);           // the one behind
    g.disc(0.62, 0.42, 0.22, PAL.ember);
    g.disc(0.4, 0.58, 0.36, PAL.flame);                // the one in front
    g.over((o) => o.box(0, 0.62, 0.8, 1, PAL.emberLite));
    g.ring(0.4, 0.58, 0.22, 2, PAL.flameLite);         // its stamped rim
  },

  /** SALVAGE INSURANCE — a safe: a steel box, a darker door, a dial. Two
   *  thousand a wreck is money that was put away in advance. */
  vault: (g) => {
    g.box(0.06, 0.08, 0.94, 0.92, PAL.steel);
    g.box(0.16, 0.18, 0.84, 0.82, PAL.steelDark);      // the door
    g.box(0.16, 0.18, 0.84, 0.28, PAL.steelDeep);      // its top seam
    g.disc(0.5, 0.54, 0.16, PAL.flame);                // the dial
    g.disc(0.5, 0.54, 0.07, PAL.steelDeep);
    g.box(0.72, 0.42, 0.8, 0.66, PAL.steelLite);       // the handle
  },

  /** PHOSPHOR ROUNDS — a flame, white at the heart. The one relic that
   *  is a COLOUR in the game already: this is what every round on the
   *  board looks like once it is bought. */
  flame: (g) => {
    g.poly([[0.5, 0.02], [0.82, 0.4], [0.9, 0.72], [0.72, 0.96], [0.28, 0.96], [0.1, 0.72], [0.18, 0.4]], PAL.emberDark);
    g.poly([[0.5, 0.26], [0.7, 0.5], [0.74, 0.74], [0.62, 0.92], [0.38, 0.92], [0.26, 0.74], [0.3, 0.5]], PAL.emberLite);
    g.poly([[0.5, 0.5], [0.6, 0.66], [0.62, 0.84], [0.38, 0.84], [0.4, 0.66]], PAL.flame);
    g.box(0.44, 0.7, 0.56, 0.84, PAL.steelWhite);      // white-hot
  },

  /** LAST VOLLEY — a wreck, and the three rounds it is still putting out
   *  as it goes. The rounds fly RIGHT, so this and the fan above never
   *  read as each other. */
  volley: (g) => {
    g.box(0.04, 0.3, 0.3, 0.9, PAL.steelDark);         // what is left of it
    g.box(0.04, 0.3, 0.3, 0.42, PAL.steel);
    for (const y of [0.24, 0.48, 0.72]) {
      g.box(0.36, y, 0.72, y + 0.12, PAL.emberLite);   // three rounds
      g.box(0.72, y, 0.9, y + 0.12, PAL.flame);
      g.box(0.9, y + 0.03, 0.98, y + 0.09, PAL.flameLite);
    }
  },

  /** PHOENIX PROTOCOL — the mender's green rising off a wreck. A bird is
   *  eight pixels of nothing at this size; "up, out of the ash, in the
   *  healing colour" is the whole story and it fits. */
  phoenix: (g) => {
    g.box(0.06, 0.8, 0.94, 0.94, PAL.steelDeep);       // the ash
    g.box(0.16, 0.7, 0.84, 0.8, PAL.steelDark);
    g.poly([[0.5, 0.04], [0.9, 0.44], [0.66, 0.44], [0.66, 0.7], [0.34, 0.7], [0.34, 0.44], [0.1, 0.44]], PAL.heal);
    g.over((o) => o.poly([[0.5, 0.04], [0.9, 0.44], [0.5, 0.44]], PAL.healLite));
  },

  /** TWIN FIRE — two rounds side by side, leaving together. One more in
   *  every volley, from every gun: the picture is the extra round. */
  twin: (g) => {
    for (const x of [0.2, 0.56]) {
      g.box(x, 0.3, x + 0.24, 0.96, PAL.emberLite);    // the casing
      g.poly([[x, 0.3], [x + 0.24, 0.3], [x + 0.12, 0.04]], PAL.flame);  // the nose
      g.box(x, 0.84, x + 0.24, 0.96, PAL.emberDark);   // the base
    }
  },

  /** UNDYING LEGION — a rampart. Every turret is a wall that does not
   *  come down the first time, so the picture is the wall, with the
   *  mender's green in the gate. */
  legion: (g) => {
    g.box(0.04, 0.34, 0.96, 0.96, PAL.steel);
    for (const x of [0.04, 0.36, 0.68]) g.box(x, 0.16, x + 0.28, 0.34, PAL.steel);  // the crenels
    g.over((o) => o.box(0, 0.78, 1, 1, PAL.steelDark));
    g.box(0.36, 0.56, 0.64, 0.96, PAL.healDark);       // the gate
    g.box(0.42, 0.62, 0.58, 0.96, PAL.heal);
  },

  /** CASCADE CHARGES — one blast that has already gone off, and the bigger
   *  one it set off. TWO rather than a row of three: at 16 pixels a chain
   *  of rings is a texture, and "this one lit that one" needs exactly two
   *  to be read. */
  chain: (g) => {
    g.ring(0.2, 0.74, 0.2, 2, PAL.emberDark);          // the hull that went first
    g.disc(0.2, 0.74, 0.1, PAL.ember);
    g.ring(0.62, 0.36, 0.34, 3, PAL.flame);            // ...and the one it lit
    g.disc(0.62, 0.36, 0.16, PAL.emberLite);
    g.disc(0.62, 0.36, 0.07, PAL.flameLite);
  },

  /** AEGIS BREAKER — a shield, in the FIELD BLUE every borrowed defence in
   *  this game wears, with a break straight through it. The Bulwark mod's
   *  shield above is gunmetal and whole; this one is the support's colour
   *  and is not, which is the whole difference between owning a shield and
   *  taking one away. */
  aegis: (g) => {
    g.poly([[0.12, 0.04], [0.88, 0.04], [0.88, 0.5], [0.5, 0.98], [0.12, 0.5]], PAL.field);
    g.over((o) => {
      o.box(0, 0, 1, 0.26, PAL.fieldLite);             // the lit top of the face
      o.box(0, 0.74, 1, 1, PAL.fieldDark);             // ...and the dark of the point
    });
    // THE BREAK, and it is an ERASE rather than a dark line: a shield with
    // a stripe painted on it is a shield with a stripe (rule 5), and a
    // shield with a piece missing is a broken shield
    g.erase((e) => e.poly([[0, 0.52], [1, 0.32], [1, 0.44], [0, 0.64]], null));
  },

  /** MONOFILAMENT ROUNDS — a plate in two pieces, and the thread that did
   *  it. The Sabot mod's spike above is a dart stuck THROUGH a wall; this
   *  is a wall that stopped being a wall, and the bead on the left is the
   *  spool the filament came off. */
  thread: (g) => {
    g.box(0.06, 0.08, 0.8, 0.42, PAL.steel);           // the plate's top half
    g.over((o) => o.box(0, 0.08, 1, 0.2, PAL.steelLite));
    // ...and the half that SLID: three pixels over, which is the whole read
    // — two plates flush is a plate with a stripe on it
    g.box(0.26, 0.58, 1.0, 0.92, PAL.steel);
    g.over((o) => o.box(0, 0.8, 1, 0.92, PAL.steelDark));
    g.box(0.0, 0.46, 1.0, 0.54, PAL.steelWhite);       // the filament
    g.disc(0.1, 0.5, 0.14, PAL.steelWhite);            // the spool it came off
    g.disc(0.1, 0.5, 0.06, PAL.steelDeep);
  },

  /** TITAN ROUNDS — a hull too big for the square, and one small round
   *  going into it with everything it has. The read is the SIZE DIFFERENCE:
   *  this relic is worth nothing against a dagger and double against an
   *  eclipse, so the picture is a little round and a large body. */
  titan: (g) => {
    g.box(0.38, 0.04, 1.0, 0.96, PAL.steelDark);       // the hull
    g.over((o) => {
      o.box(0, 0, 1, 0.26, PAL.steel);                 // its lit top plate
      o.box(0, 0.84, 1, 1, PAL.steelDeep);             // ...and its skirt
    });
    g.box(0.0, 0.46, 0.2, 0.56, PAL.emberLite);        // the round, still coming
    // THE HIT, and it has to be the loud part: a small round against a hull
    // this size only reads as damage if the flash does
    g.poly([[0.18, 0.5], [0.42, 0.14], [0.34, 0.5], [0.42, 0.86]], PAL.flame);
    g.box(0.24, 0.38, 0.52, 0.62, PAL.flame);
    g.box(0.28, 0.44, 0.46, 0.56, PAL.flameLite);
  },

  /** TERMINAL PROTOCOL — a skull, and it is the one drawing in this file
   *  that is allowed to be a face (rule 6 is a warning about accidents).
   *  Anything under fifteen per cent dies on the spot; a bar with a sliver
   *  on it was the honest picture and nobody read it in half a second. */
  terminal: (g) => {
    g.disc(0.5, 0.4, 0.36, PAL.steelLite);             // the dome
    g.box(0.28, 0.62, 0.72, 0.9, PAL.steelLite);       // the jaw
    g.over((o) => o.box(0, 0, 1, 0.2, PAL.steelWhite));// bone, lit from above
    g.box(0.22, 0.32, 0.4, 0.5, PAL.steelDeep);        // the sockets
    g.box(0.6, 0.32, 0.78, 0.5, PAL.steelDeep);
    g.box(0.46, 0.5, 0.54, 0.6, PAL.steelDeep);        // the nose
    for (const x of [0.38, 0.52]) g.box(x, 0.68, x + 0.08, 0.9, PAL.steelDeep);  // the teeth
  },

  /** ASCENDANCY PROTOCOL — a four-point star, and the brightest thing in
   *  the file. The deal starts dealing purple; this is what a purple
   *  card feels like coming up. */
  star: (g) => {
    g.poly([[0.5, 0.0], [0.62, 0.38], [1.0, 0.5], [0.62, 0.62], [0.5, 1.0], [0.38, 0.62], [0.0, 0.5], [0.38, 0.38]], PAL.flame);
    g.poly([[0.5, 0.2], [0.58, 0.42], [0.8, 0.5], [0.58, 0.58], [0.5, 0.8], [0.42, 0.58], [0.2, 0.5], [0.42, 0.42]], PAL.flameLite);
    g.box(0.44, 0.44, 0.56, 0.56, PAL.steelWhite);
  },
};

/** every glyph this file can draw — the whole catalog, both halves */
export const DRAWN_GLYPHS: ReadonlySet<string> = new Set(Object.keys(GLYPHS));

/** the picture a mod wears, as paths — drawn once per glyph and kept */
export const modGlyph = memoDraw(GLYPHS, MOD_GRID, "barrel");
