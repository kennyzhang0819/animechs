/**
 * THE MUTATOR FACES, DRAWN RATHER THAN STORED.
 *
 * WHY THERE IS NO SPRITE SHEET AND NO CHECKED-IN SVG. The faces are ten
 * 32x32 pictures built out of discs, polygons and boxes; describing them
 * costs less than a tenth of what storing them costs, and the description
 * is the thing anyone would actually edit. tiles.ts already draws the
 * game's floors and props this way — art as code, generated once on
 * demand — and this is the same trade at a much smaller scale.
 *
 * WHY 32. Mindustry's status effect sprites — its icons for exactly this
 * thing, a rule laid over a body — are 32x32, and its block art is 32px to
 * the tile. These faces are read beside that art on the same screens, so
 * they are drawn on its grid.
 *
 * WHY FLAT, AND WHY NO OUTLINE. Count the colours in lancer.png or
 * mender.png: four or five, butted against each other along straight
 * edges, with no dark contour anywhere and no gradient. An icon shaded the
 * other way — light traced down its top-left edge, shadow down its
 * bottom-right — looks EMBOSSED, like a button pressed out of the page,
 * and sits wrong beside blocks that look stamped flat. So the only
 * shading primitive here is over(): draw a plain rectangle, clip it to
 * what the face has already drawn, and a top plate or a skirt follows the
 * silhouette exactly. Form comes from parts, not from a light source.
 */

/** the grid, and the viewBox every face is drawn in */
export const FACE_GRID = 32;

/**
 * THE PALETTE, COUNTED OFF THE GAME'S OWN SPRITES rather than invented.
 * Every hex below was taken from the art under public/mindustry/sprites —
 * the gunmetal ramp is what lancer, fuse and spectre are plated in, the
 * green is the mender's and the force projector's, the field blue is
 * parallax's, the ember ramp is spectre's and swarmer's heat, and the
 * water is the #5c6dbb renderer.ts already records shallow-water.png as
 * averaging. A face that invented its own colours next to art this
 * consistent would read as bolted on, and a rule would say nothing about
 * itself; on this palette green heals, blue is a field, ember is damage
 * and gunmetal is a structure, which is the vocabulary the player has
 * already been taught by everything else on the screen.
 */
const PAL = {
  steelDeep: "#2c2d38", steelDark: "#4d4e58", steel: "#7b7b7b",
  steelLite: "#c1c3d4", steelWhite: "#f4f4f4",
  blueDark: "#4e57a0",
  healDark: "#62ae7f", heal: "#84f491", healLite: "#c8ffd2",
  fieldDark: "#6f80e8", field: "#88a4ff", fieldLite: "#c6d6ff",
  emberDark: "#db401c", ember: "#ec7458", emberLite: "#ff9c5a",
  flame: "#ffdd55", flameLite: "#fff2ad",
  waterDark: "#3f4c96", water: "#5c6dbb", waterLite: "#8aa3f4",
  codexDark: "#c25a97", codex: "#ff8acb", codexLite: "#ffc7e6",
} as const;

type Ink = (typeof PAL)[keyof typeof PAL] | null;

/** the pen — unit coordinates in, palette keys on a square grid out */
type Pen = {
  box(x0: number, y0: number, x1: number, y1: number, c: Ink): Pen;
  disc(cx: number, cy: number, r: number, c: Ink): Pen;
  ring(cx: number, cy: number, r: number, w: number, c: Ink): Pen;
  poly(pts: readonly (readonly [number, number])[], c: Ink): Pen;
  over(fn: (o: Pen) => void): Pen;
  erase(fn: (e: Pen) => void): Pen;
};

function grid(n: number): { px: Ink[]; pen: Pen } {
  const px: Ink[] = new Array<Ink>(n * n).fill(null);
  let clipped = false;
  let erasing = false;
  const u = (v: number) => Math.round(v * n);
  const set = (x: number, y: number, c: Ink) => {
    if (x < 0 || y < 0 || x >= n || y >= n) return;
    if (clipped && px[y * n + x] === null) return;
    px[y * n + x] = erasing ? null : c;
  };

  const pen: Pen = {
    box(x0, y0, x1, y1, c) {
      for (let y = u(y0); y < u(y1); y++) for (let x = u(x0); x < u(x1); x++) set(x, y, c);
      return pen;
    },

    /** midpoint circle, filled by span — the pixel artist's circle */
    disc(cx, cy, r, c) {
      const [cxp, cyp, pr] = [u(cx), u(cy), u(r)];
      for (let y = -pr; y <= pr; y++) {
        const half = Math.floor(Math.sqrt(pr * pr - y * y + 0.25));
        for (let x = -half; x <= half; x++) set(cxp + x, cyp + y, c);
      }
      return pen;
    },

    /**
     * The same circle, hollow, `w` pixels of wall — and the wall is the
     * same `w` at the apex as at the flanks. Taking an inner span off an
     * outer one row by row does NOT give you that: it thins to nothing
     * where the curve runs flat, which at 32 is a visible notch out of the
     * top of an arch. So the test is on the radius itself.
     */
    ring(cx, cy, r, w, c) {
      const [cxp, cyp, pr] = [u(cx), u(cy), u(r)];
      const inner = pr - w;
      for (let y = -pr; y <= pr; y++) for (let x = -pr; x <= pr; x++) {
        const d = Math.sqrt(x * x + y * y);
        if (d <= pr + 0.5 && d >= inner - 0.5) set(cxp + x, cyp + y, c);
      }
      return pen;
    },

    /** integer scanline polygon — unit points, wound either way */
    poly(pts, c) {
      const P = pts.map(([x, y]) => [u(x), u(y)] as const);
      let lo = Infinity, hi = -Infinity;
      for (const [, y] of P) { lo = Math.min(lo, y); hi = Math.max(hi, y); }
      for (let y = lo; y < hi; y++) {
        const xs: number[] = [];
        for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
          const [xi, yi] = P[i], [xj, yj] = P[j];
          if ((yi <= y && yj > y) || (yj <= y && yi > y))
            xs.push(xi + ((y - yi) / (yj - yi)) * (xj - xi));
        }
        xs.sort((a, b) => a - b);
        for (let k = 0; k + 1 < xs.length; k += 2)
          for (let x = Math.round(xs[k]); x < Math.round(xs[k + 1]); x++) set(x, y, c);
      }
      return pen;
    },

    /**
     * A PLATE. Everything drawn inside `fn` lands only where the face has
     * already put something, so a plain rectangle becomes a top plate or a
     * skirt that follows the silhouette exactly and spills nowhere. This
     * is the whole shading model.
     */
    over(fn) { clipped = true; fn(pen); clipped = false; return pen; },

    /** punch a hole — whatever `fn` draws goes back to nothing */
    erase(fn) { erasing = true; fn(pen); erasing = false; return pen; },
  };
  return { px, pen };
}

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

/** one <path> per colour: the face's pixels of that colour, as a run of
 *  1-tall boxes. A face lands in three to six paths. */
export type FaceLayer = { readonly color: string; readonly d: string };

/**
 * Drawn ONCE per rule and kept. Three screens render a shelf of these and
 * a shelf re-renders on every hover; redrawing ten 32-squares each time
 * would be work nobody asked for, and a face never changes after its
 * first draw.
 */
const drawn = new Map<string, readonly FaceLayer[]>();

/** the face a rule wears, as paths — an id with no drawing of its own
 *  falls back to the codex's chevrons, the way it always has */
export function mutatorFace(id: string): readonly FaceLayer[] {
  const key = id in FACES ? id : "glyph";
  const hit = drawn.get(key);
  if (hit) return hit;

  const { px, pen } = grid(FACE_GRID);
  FACES[key](pen);

  // runs of one colour along a row, collected per colour, so the hex is
  // written once per layer rather than once per pixel
  const byColor = new Map<string, string[]>();
  for (let y = 0; y < FACE_GRID; y++) {
    let x = 0;
    while (x < FACE_GRID) {
      const c = px[y * FACE_GRID + x];
      if (c === null) { x++; continue; }
      let w = 1;
      while (x + w < FACE_GRID && px[y * FACE_GRID + x + w] === c) w++;
      const runs = byColor.get(c) ?? [];
      runs.push(`M${x} ${y}h${w}v1h-${w}z`);
      byColor.set(c, runs);
      x += w;
    }
  }
  const layers: readonly FaceLayer[] = [...byColor].map(([color, d]) => ({ color, d: d.join("") }));
  drawn.set(key, layers);
  return layers;
}
