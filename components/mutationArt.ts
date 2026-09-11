/**
 * THE MUTATOR FACES — one drawing per rule, on a 32-square grid.
 *
 * THE HOUSE RULES FOR DRAWING ONE OF THESE ARE IN pixelArt.ts, and so are
 * the pen and the palette. Read them before adding a face: three of the
 * faces below had to be redrawn during the first pass, and those three
 * are the worked examples behind half of those rules.
 *
 * WHY THERE IS NO SPRITE SHEET AND NO CHECKED-IN SVG. These are ten
 * pictures built out of discs, polygons and boxes; describing them costs
 * less than a tenth of what storing them costs, and the description is
 * the thing anyone would actually edit. tiles.ts already draws the game's
 * floors and props this way.
 *
 * WHY 32 WHEN THE MOD GLYPHS ARE 16. Match the grid to the size the thing
 * is read at. A face is read at 20 to 56 CSS pixels — a deploy chip, a
 * reward chip, an unlocks tile — and Mindustry's own status effect
 * sprites, its icons for exactly this thing, are 32x32. A mod glyph is
 * read at 12 to 15 and is drawn at 16 for the same reason (modArt.ts).
 */

import { memoDraw, PAL, type Ink, type Layer, type Pen } from "./pixelArt";

/** the grid, and the viewBox every face is drawn in */
export const FACE_GRID = 32;

/** the heater shield both armour rules are cut from, at any scale about
 *  its own middle — see `armored` for why the plating is concentric */
const shield = (k: number) =>
  ([[0.5, 0.06], [0.14, 0.2], [0.14, 0.52], [0.5, 0.94], [0.86, 0.52], [0.86, 0.2]] as const)
    .map(([x, y]) => [0.5 + (x - 0.5) * k, 0.5 + (y - 0.5) * k] as const);

/** the droplet both water rules are cut from — a point over a ball */
function drop(g: Pen) {
  g.disc(0.5, 0.63, 0.3, PAL.water);
  g.poly([[0.5, 0.05], [0.81, 0.63], [0.19, 0.63]], PAL.water);
  g.over((o) => {
    o.box(0, 0.8, 1, 1, PAL.waterDark);                      // the skirt
    o.box(0.3, 0.5, 0.4, 0.62, PAL.waterLite);               // the shine
  });
}

/** one drawing per rule, and the codex's own face under `glyph` */
const FACES: Record<string, (g: Pen) => void> = {
  /**
   * A gunmetal bunker under a green field arc. A DOME ON A PLINTH IS A
   * T-SHIRT — wide shoulders over a narrow body is a shirt before it is a
   * tower, at any size. What the rule draws is a shield arching OVER
   * something, so the dome is a hollow arc and the tower flares.
   */
  shieldTowers: (g) => {
    g.ring(0.5, 0.52, 0.42, 2, PAL.heal);
    g.erase((e) => e.box(0, 0.76, 1, 1, null));
    g.over((o) => o.box(0.3, 0, 0.7, 0.26, PAL.healLite));   // the arc's crown
    g.poly([[0.33, 0.48], [0.67, 0.48], [0.77, 0.92], [0.23, 0.92]], PAL.steel);
    // plates bounded to the TOWER's width — a full-width band would
    // repaint the arc's legs, which stand at the grid's edges
    g.over((o) => {
      o.box(0.23, 0.48, 0.77, 0.58, PAL.steelLite);          // the cap
      o.box(0.23, 0.84, 0.77, 1, PAL.steelDark);             // the skirt
    });
    g.box(0.43, 0.62, 0.57, 0.74, PAL.heal);                 // the emitter
  },

  /**
   * A shield with a raised strake down its middle — Armored Swarms.
   *
   * THE PLATING RUNS DOWN, NOT ACROSS, and that is the whole difference
   * between armour and a face. Every horizontal cut tried here turned into
   * one: three stacked bands made a cloud on a funnel, and a plate inside
   * a rim with a seam across it made a helm with a visor and a row of
   * teeth. Nothing symmetrical about a VERTICAL axis can become a face,
   * and it is also how the game's own blocks are built — fuse and spectre
   * are a central strake between flanking plates, nothing more.
   */
  armored: (g) => {
    g.poly(shield(1), PAL.steel);
    g.over((o) => {
      o.box(0.35, 0, 0.65, 1, PAL.steelDeep);                // the strake's shadow
      o.box(0.38, 0, 0.62, 1, PAL.steelLite);                // the strake
      o.box(0, 0.82, 1, 1, PAL.steelDark);                   // the tip, in shadow
      // studs DOWN the strake — a vertical pair cannot read as eyes
      for (const y of [0.26, 0.44, 0.62]) o.box(0.44, y, 0.56, y + 0.06, PAL.steelWhite);
    });
  },

  /** The same shield, but a FIELD and not a plate, so it is parallax blue
   *  and the plus is lit rather than cut out — Overshields is armour ADDED */
  overshields: (g) => {
    g.poly(shield(1), PAL.field);
    g.over((o) => {
      o.box(0, 0.5, 1, 0.74, PAL.fieldDark);
      o.box(0, 0.74, 1, 1, PAL.blueDark);
    });
    g.over((o) => {
      o.box(0.44, 0.24, 0.56, 0.64, PAL.fieldLite);
      o.box(0.3, 0.38, 0.7, 0.5, PAL.fieldLite);
    });
  },

  /** A bolt, hot at the tip and cooling down its length — Speedy, and the
   *  only rule in the catalog worth five */
  speedy: (g) => {
    g.poly([[0.72, 0.04], [0.16, 0.58], [0.44, 0.58], [0.28, 0.96], [0.84, 0.42], [0.56, 0.42]], PAL.flame);
    g.over((o) => {
      o.poly([[0, 0.5], [1, 0.3], [1, 1], [0, 1]], PAL.emberLite);
      o.poly([[0, 0.78], [1, 0.58], [1, 1], [0, 1]], PAL.ember);
    });
    // The streaks are EMBER, not gunmetal. Grey on #0B0B0D is two shades
    // off the ground and disappears the moment the face leaves the codex
    // tile; trailing heat is both visible and the right thing for a bolt
    // to be leaving behind.
    g.box(0.13, 0.26, 0.33, 0.31, PAL.emberDark);
    g.box(0.55, 0.70, 0.75, 0.75, PAL.emberDark);
  },

  /**
   * A steel maw open on a red throat — Hungry eats the bodies.
   * A DEEP PALE TOP PLATE PLUS A GLINTING EYE IS A DUCK: the plate cut at
   * the waterline read as a head, the glint finished the bird, and the
   * throat became a beak. Thin bands, one flat eye, a small throat.
   */
  hungry: (g) => {
    g.disc(0.5, 0.5, 0.46, PAL.steel);
    g.over((o) => {
      o.box(0, 0, 1, 0.3, PAL.steelLite);
      o.box(0, 0.82, 1, 1, PAL.steelDark);
    });
    g.erase((e) => e.poly([[0.5, 0.5], [1.04, 0.1], [1.04, 0.9]], null));
    g.poly([[0.44, 0.5], [0.6, 0.39], [0.6, 0.61]], PAL.emberDark);   // the throat
    g.disc(0.42, 0.25, 0.05, PAL.steelDeep);                 // the eye
  },

  /** A droplet with the mender's green rising out of it — Amphibious is
   *  what comes UP out of the water, stronger than it went in */
  amphibious: (g) => {
    drop(g);
    // The stem stops short of the floor. Run it down to the bottom and the
    // droplet grows a doorway and the rule reads as a building.
    g.over((o) => o.poly([[0.5, 0.34], [0.74, 0.59], [0.62, 0.59], [0.62, 0.8],
                          [0.38, 0.8], [0.38, 0.59], [0.26, 0.59]], PAL.heal));
  },

  /** The same droplet with the arrow turned over and gone cold —
   *  Hydrophobic is what standing near the water does to a turret */
  hydrophobic: (g) => {
    drop(g);
    g.over((o) => o.poly([[0.5, 0.86], [0.26, 0.61], [0.38, 0.61], [0.38, 0.4],
                          [0.62, 0.4], [0.62, 0.61], [0.74, 0.61]], PAL.emberDark));
  },

  /** One body and the two it came apart into — Mitosis is a death that
   *  leaves more of them standing than it took away */
  mitosis: (g) => {
    g.disc(0.3, 0.5, 0.26, PAL.heal);
    g.disc(0.76, 0.27, 0.16, PAL.heal);
    g.disc(0.76, 0.73, 0.16, PAL.heal);
    g.over((o) => o.box(0, 0.56, 1, 1, PAL.healDark));        // one skirt over all three
    g.disc(0.3, 0.44, 0.09, PAL.healLite);                   // the nuclei
    g.disc(0.76, 0.23, 0.05, PAL.healLite);
    g.disc(0.76, 0.69, 0.05, PAL.healLite);
  },

  /** A burst in flat concentric heat — Volatile is what happens when one
   *  of them dies */
  volatile: (g) => {
    const star = (R: number, r: number) => {
      const p: (readonly [number, number])[] = [];
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2 - Math.PI / 2;
        const rad = i % 2 ? r : R;
        p.push([0.5 + Math.cos(a) * rad, 0.5 + Math.sin(a) * rad] as const);
      }
      return p;
    };
    g.poly(star(0.48, 0.27), PAL.emberDark);
    g.poly(star(0.37, 0.21), PAL.emberLite);
    g.disc(0.5, 0.5, 0.21, PAL.flame);
    g.disc(0.5, 0.5, 0.1, PAL.flameLite);
  },

  /**
   * Three chevrons climbing, brightening as they climb — the face a rule
   * nobody has drawn yet falls back to. ONE THICKNESS ALL THE WAY ROUND:
   * the first pass hung a bar under each chevron's elbow, and three of
   * them stacked read as three little trees.
   */
  glyph: (g) => {
    const chev = (y: number, c: Ink) =>
      g.poly([[0.5, y], [0.88, y + 0.21], [0.88, y + 0.32],
              [0.5, y + 0.11], [0.12, y + 0.32], [0.12, y + 0.21]], c);
    chev(0.6, PAL.codexDark); chev(0.33, PAL.codex); chev(0.06, PAL.codexLite);
  },
};

export type { Layer as FaceLayer };

/**
 * The face a rule wears, as paths. An id with no drawing of its own falls
 * back to the codex's chevrons, the way it always has.
 */
export const mutatorFace = memoDraw(FACES, FACE_GRID, "glyph");
