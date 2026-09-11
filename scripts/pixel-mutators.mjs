/**
 * THE MUTATOR FACES, AS 32x32 MINDUSTRY-PALETTE PIXEL ART.
 *
 * WHY 32, AND WHY IT IS NOT AN ARBITRARY PICK. Mindustry's own status
 * effect sprites — its icons for exactly this thing, a rule laid over a
 * body — are 32x32. The block art is 32px to the tile. 32 is the grid this
 * game's art is already drawn on, and these faces sit beside that art.
 *
 * WHY NO OUTLINE AND NO RIM LIGHT. Go and look at lancer.png, ripple.png,
 * mender.png: three to seven colours apiece, no dark contour anywhere, and
 * the form comes from FLAT PLATES butted against each other — a light top
 * plate, a dark skirt, a seam — not from a gradient and not from a lit
 * edge traced round the silhouette. A rim light makes an icon look
 * embossed, like a button pressed out of the page; Mindustry's blocks look
 * stamped flat, and that is the house style these have to match.
 *
 * WHY THEY CARRY THEIR OWN COLOUR NOW. The faces used to be one tinted
 * path each, because the tint was how a player read a rule's weight. They
 * don't have to be: both screens that draw a face already put the band on
 * the FRAME around it — a 3px border on the codex tile (MutationTree) and
 * a 1px one on the deploy chip (MechSwarm) — so the weight is answered
 * either way, and the face is free to say what the RULE is instead of how
 * dear it is. Green is healing, blue is a field, the ember ramp is damage,
 * gunmetal is a structure: the same vocabulary the rest of the game's art
 * already speaks.
 */

/**
 * THE PALETTE, SAMPLED OFF MINDUSTRY'S OWN SPRITES rather than invented.
 * Every hex below was counted out of the art in public/mindustry/sprites —
 * the gunmetal ramp is what lancer, fuse and spectre are plated in, the
 * heal green is the mender's, the field blue is parallax's, the ember ramp
 * is spectre's and swarmer's heat. Inventing a palette next to art this
 * consistent is how an icon ends up looking bolted on.
 */
const PAL = {
  // the gunmetal every block in the game is built out of
  steelDeep: "#2c2d38", steelDark: "#4d4e58", steel: "#7b7b7b",
  steelLite: "#c1c3d4", steelWhite: "#f4f4f4",
  // the blue-grey plating on lancer and arc
  blueDark: "#4e57a0",
  // the mender's and the force projector's green
  healDark: "#62ae7f", heal: "#84f491", healLite: "#c8ffd2",
  // parallax's field blue
  fieldDark: "#6f80e8", field: "#88a4ff", fieldLite: "#c6d6ff",
  // spectre and swarmer's heat, up into Pal.lightFlame
  emberDark: "#db401c", ember: "#ec7458", emberLite: "#ff9c5a",
  flame: "#ffdd55", flameLite: "#fff2ad",
  // shallow-water.png averages #5c6dbb (see renderer.ts)
  waterDark: "#3f4c96", water: "#5c6dbb", waterLite: "#8aa3f4",
  // the codex's own pink, the one colour here that is the UI's and not the game's
  codexDark: "#c25a97", codex: "#ff8acb", codexLite: "#ffc7e6",
};

/** a square grid of palette keys, and the pen that writes on it */
function grid(n) {
  const px = new Array(n * n).fill(null);
  let clipped = false;                          // see over()
  const inside = (x, y) => x >= 0 && y >= 0 && x < n && y < n;
  const set = (x, y, c) => {
    if (!inside(x, y)) return;
    if (clipped && px[y * n + x] === null) return;
    px[y * n + x] = c;
  };
  const u = (v) => Math.round(v * n);           // unit space -> pixel space

  const g = {
    n, px, u,

    box(x0, y0, x1, y1, c) {
      for (let y = u(y0); y < u(y1); y++) for (let x = u(x0); x < u(x1); x++) set(x, y, c);
      return g;
    },

    /** midpoint circle, filled by span — the pixel artist's circle */
    disc(cx, cy, r, c) {
      const [px0, py0, pr] = [u(cx), u(cy), u(r)];
      for (let y = -pr; y <= pr; y++) {
        const half = Math.floor(Math.sqrt(pr * pr - y * y + 0.25));
        for (let x = -half; x <= half; x++) set(px0 + x, py0 + y, c);
      }
      return g;
    },

    /**
     * The same circle, hollow, `w` pixels of wall — and the wall is the
     * same `w` at the apex as at the flanks. Walking the rows and taking
     * an inner span off an outer one does NOT give you that: it thins to
     * nothing where the curve runs flat, which at 32 is a visible notch
     * out of the top of an arch. So the test is on the radius itself.
     */
    ring(cx, cy, r, w, c) {
      const [px0, py0, pr] = [u(cx), u(cy), u(r)];
      const inner = pr - w;
      for (let y = -pr; y <= pr; y++) for (let x = -pr; x <= pr; x++) {
        const d = Math.sqrt(x * x + y * y);
        if (d <= pr + 0.5 && d >= inner - 0.5) set(px0 + x, py0 + y, c);
      }
      return g;
    },

    /** integer scanline polygon — unit points, wound either way */
    poly(pts, c) {
      const P = pts.map(([x, y]) => [u(x), u(y)]);
      let lo = Infinity, hi = -Infinity;
      for (const [, y] of P) { lo = Math.min(lo, y); hi = Math.max(hi, y); }
      for (let y = lo; y < hi; y++) {
        const xs = [];
        for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
          const [xi, yi] = P[i], [xj, yj] = P[j];
          if ((yi <= y && yj > y) || (yj <= y && yi > y))
            xs.push(xi + ((y - yi) / (yj - yi)) * (xj - xi));
        }
        xs.sort((a, b) => a - b);
        for (let k = 0; k + 1 < xs.length; k += 2)
          for (let x = Math.round(xs[k]); x < Math.round(xs[k + 1]); x++) set(x, y, c);
      }
      return g;
    },

    /**
     * A PLATE. Everything drawn inside `fn` lands only where the face has
     * already put something, so a plain rectangle becomes a top plate or a
     * skirt that follows the silhouette exactly and spills nowhere. This
     * is the whole shading model: butt two flat colours together along a
     * straight edge and let the silhouette cut them.
     */
    over(fn) { clipped = true; fn(g); clipped = false; return g; },

    /** punch a hole — whatever `fn` draws goes back to nothing */
    erase(fn) { fn({ ...g, _e: 1 }); return g; },
  };
  // inside erase(), every primitive writes null instead of a colour
  for (const k of ["box", "disc", "ring", "poly"]) {
    const real = g[k];
    g[k] = (...a) => (a[a.length - 1] === undefined ? real(...a.slice(0, -1), null) : real(...a));
  }
  return g;
}
const NIL = undefined;

// ── the ten faces ────────────────────────────────────────────────────────
const FACES = {
  /**
   * A gunmetal tower under a green field arc. A DOME ON A PLINTH IS A
   * T-SHIRT — it was one here for an afternoon, because wide shoulders
   * over a narrow body is a shirt before it is a tower at any size. What
   * the rule actually draws is a shield arching OVER something.
   */
  shieldTowers: (g) => {
    g.ring(0.5, 0.52, 0.42, 2, PAL.heal);
    g.erase((e) => e.box(0, 0.76, 1, 1, NIL));
    g.over((o) => o.box(0.3, 0, 0.7, 0.26, PAL.healLite));   // the arc's crown
    g.poly([[0.33, 0.48], [0.67, 0.48], [0.77, 0.92], [0.23, 0.92]], PAL.steel);
    // plates bounded to the TOWER's width — a full-width band would repaint
    // the arc's legs, which stand at the grid's edges
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
   * teeth. Anything symmetrical about a VERTICAL axis cannot become a
   * face, and it is also how the game's own blocks are built — fuse and
   * spectre are a central strake between flanking plates, nothing more.
   */
  armored: (g) => {
    g.poly(shield(1), PAL.steel);
    g.over((o) => {
      o.box(0.35, 0, 0.65, 1, PAL.steelDeep);                // the strake's shadow
      o.box(0.38, 0, 0.62, 1, PAL.steelLite);                // the strake
      o.box(0, 0.82, 1, 1, PAL.steelDark);                   // the tip, in shadow
      // studs down the strake — a vertical pair cannot read as eyes
      for (const y of [0.26, 0.44, 0.62]) o.box(0.44, y, 0.56, y + 0.06, PAL.steelWhite);
    });
  },

  /** The same shield, but it is a FIELD and not a plate, so it is blue and
   *  the plus is lit rather than cut out of it — Overshields is armour ADDED */
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

  /** A bolt, plated hot at the top and cooling down its length — Speedy */
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

  /** A steel maw open on a red throat — Hungry eats the bodies */
  hungry: (g) => {
    // A DEEP TOP PLATE PLUS A GLINTING EYE IS A DUCK. The pale plate cut
    // at the waterline read as a head, the lit eye finished the bird, and
    // the throat became a beak. The plates are thin bands top and bottom
    // now, the eye is one flat dark disc with no glint, and the throat is
    // small enough to stay inside the bite.
    g.disc(0.5, 0.5, 0.46, PAL.steel);
    g.over((o) => {
      o.box(0, 0, 1, 0.3, PAL.steelLite);
      o.box(0, 0.82, 1, 1, PAL.steelDark);
    });
    g.erase((e) => e.poly([[0.5, 0.5], [1.04, 0.1], [1.04, 0.9]], NIL));
    g.poly([[0.44, 0.5], [0.6, 0.39], [0.6, 0.61]], PAL.emberDark);   // the throat
    g.disc(0.42, 0.25, 0.05, PAL.steelDeep);                 // the eye
  },

  /** A droplet with a green chevron rising out of it — Amphibious is what
   *  comes UP out of the water, stronger than it went in */
  amphibious: (g) => {
    drop(g);
    g.over((o) => {
      // The stem stops short of the floor. Run it down to the bottom and
      // the droplet grows a doorway and the rule reads as a building.
      o.poly([[0.5, 0.34], [0.74, 0.59], [0.62, 0.59], [0.62, 0.8],
              [0.38, 0.8], [0.38, 0.59], [0.26, 0.59]], PAL.heal);
    });
  },

  /** The same droplet, with the arrow turned over and gone cold —
   *  Hydrophobic is what standing near the water does to a turret */
  hydrophobic: (g) => {
    drop(g);
    g.over((o) => {
      o.poly([[0.5, 0.86], [0.26, 0.61], [0.38, 0.61], [0.38, 0.4],
              [0.62, 0.4], [0.62, 0.61], [0.74, 0.61]], PAL.emberDark);
    });
  },

  /** One body and the two it came apart into — Mitosis is a death that
   *  leaves more of them standing than it took away */
  mitosis: (g) => {
    g.disc(0.3, 0.5, 0.26, PAL.heal);
    g.disc(0.76, 0.27, 0.16, PAL.heal);
    g.disc(0.76, 0.73, 0.16, PAL.heal);
    g.over((o) => o.box(0, 0.56, 1, 1, PAL.healDark));
    g.disc(0.3, 0.44, 0.09, PAL.healLite);                   // the nucleus
    g.disc(0.76, 0.23, 0.05, PAL.healLite);
    g.disc(0.76, 0.69, 0.05, PAL.healLite);
  },

  /** A burst, in flat concentric heat — Volatile is what happens when one
   *  of them dies */
  volatile: (g) => {
    const star = (R, r) => {
      const p = [];
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2 - Math.PI / 2;
        const rad = i % 2 ? r : R;
        p.push([0.5 + Math.cos(a) * rad, 0.5 + Math.sin(a) * rad]);
      }
      return p;
    };
    g.poly(star(0.48, 0.27), PAL.emberDark);
    g.poly(star(0.37, 0.21), PAL.emberLite);
    g.disc(0.5, 0.5, 0.21, PAL.flame);
    g.disc(0.5, 0.5, 0.1, PAL.flameLite);
  },

  /** Three chevrons climbing, and getting brighter as they climb — the
   *  codex's own face, and the fallback for a rule nobody has drawn yet */
  glyph: (g) => {
    // ONE THICKNESS ALL THE WAY ROUND. The first pass hung a bar under
    // each chevron's elbow and three of them stacked read as three little
    // trees, which is a poor thing for the codex's own face to be.
    const chev = (y, c) => g.poly([[0.5, y], [0.88, y + 0.21], [0.88, y + 0.32],
                                   [0.5, y + 0.11], [0.12, y + 0.32], [0.12, y + 0.21]], c);
    chev(0.6, PAL.codexDark); chev(0.33, PAL.codex); chev(0.06, PAL.codexLite);
  },
};

/** the heater shield both armour rules are cut from, at any scale about
 *  its own middle — see armored for why the plating is concentric */
function shield(k) {
  return [[0.5, 0.06], [0.14, 0.2], [0.14, 0.52], [0.5, 0.94], [0.86, 0.52], [0.86, 0.2]]
    .map(([x, y]) => [0.5 + (x - 0.5) * k, 0.5 + (y - 0.5) * k]);
}

/** the droplet both water rules are cut from — a point over a ball */
function drop(g) {
  g.disc(0.5, 0.63, 0.3, PAL.water);
  g.poly([[0.5, 0.05], [0.81, 0.63], [0.19, 0.63]], PAL.water);
  g.over((o) => {
    o.box(0, 0.8, 1, 1, PAL.waterDark);                      // the skirt
    o.box(0.3, 0.5, 0.4, 0.62, PAL.waterLite);               // the shine
  });
}

// ── out the other side, as rects ─────────────────────────────────────────
/**
 * One <rect> per RUN of same-coloured pixels, not per pixel, and the runs
 * grouped by colour so the hex is written once per group. A face lands
 * around a hundred rects and 2 KB. shapeRendering=crispEdges is what stops
 * the browser blurring the seams when the face is scaled to the 20px chip.
 */
function toSvg(g, id) {
  const { n, px } = g;
  const runs = new Map();
  for (let y = 0; y < n; y++) {
    let x = 0;
    while (x < n) {
      const c = px[y * n + x];
      if (c === null) { x++; continue; }
      let w = 1;
      while (x + w < n && px[y * n + x + w] === c) w++;
      if (!runs.has(c)) runs.set(c, []);
      runs.get(c).push(`<rect x="${x}" y="${y}" width="${w}" height="1"/>`);
      x += w;
    }
  }
  const groups = [...runs].map(([c, r]) => `<g fill="${c}">${r.join("")}</g>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges" role="img" aria-label="${id}">${groups}</svg>`;
}

/** the grid these are drawn for, and the one Mindustry draws its own on */
export const SIZE = 32;
export const FACE_IDS = Object.keys(FACES);
export const PALETTE = PAL;

export function renderFace(id, n = SIZE) {
  const g = grid(n);
  FACES[id](g);
  return toSvg(g, id);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { mkdirSync, writeFileSync } = await import("node:fs");
  const out = process.argv[2] ?? "public/mutators";
  mkdirSync(out, { recursive: true });
  for (const id of FACE_IDS) writeFileSync(`${out}/${id}.svg`, renderFace(id));
  console.log(`wrote ${FACE_IDS.length} faces to ${out}/`);
}
