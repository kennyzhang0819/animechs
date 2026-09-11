/**
 * THE MUTATOR FACES, DRAWN AS PIXELS RATHER THAN AS CURVES.
 *
 * WHY A GENERATOR AND NOT NINE HAND-PLACED GRIDS. The faces have to hold
 * at three sizes at once — the deploy chip reads one at 20px, the codex
 * tile at 56px — and a grid hand-placed for one of those is mush at the
 * others. So every face is described ONCE, in unit coordinates, out of
 * primitives that rasterise the way a pixel artist draws: midpoint
 * circles, integer scanline polygons, no antialiasing anywhere. Ask for
 * it at 32 and the same description lands on a 32-square grid; ask at 128
 * and it lands on a 128-square grid with the detail passes switched on.
 *
 * WHY OPACITY AND NOT COLOUR. A face is tinted by how bad the rule is
 * (see components/mutationFace.tsx) — Light green, Heavy amber, Brutal
 * red — and a face that carried its own palette could not be tinted at
 * all, which is the exact reason the old PNG art was thrown out. So the
 * shading ramp is one colour at three opacities: currentColor stays the
 * only pigment, and the form comes from the light.
 */

// ── the tone ramp ────────────────────────────────────────────────────────
// 0 is nothing at all. The rest are currentColor, lit from the top-left:
// the side facing the light is full strength, the body sits under it, and
// the side turned away drops far enough to read as a turn rather than as
// a smudge.
const NONE = 0, LIT = 1, BODY = 2, SHADE = 3;
// The body sits HIGH. It was 0.74 for a while and a shelf of pixel faces
// read visibly duller than the vector ones beside them — most of a face is
// body, so the body IS the face's brightness, and the ramp has to buy its
// form out of the two thin rims rather than out of the bulk.
const TONE_ALPHA = { [LIT]: 1, [BODY]: 0.86, [SHADE]: 0.5 };

/** a square grid of tones, and the pen that writes on it */
function grid(n) {
  const px = new Uint8Array(n * n);
  const inside = (x, y) => x >= 0 && y >= 0 && x < n && y < n;
  const set = (x, y, t) => { if (inside(x, y)) px[y * n + x] = t; };
  const get = (x, y) => (inside(x, y) ? px[y * n + x] : NONE);

  // unit space -> pixel space. A face is authored in [0,1] and the grid
  // decides how coarse that is.
  const u = (v) => Math.round(v * n);

  const g = {
    n, px, set, get, u,

    /** filled box, unit coords, edges inclusive of the left/top pixel */
    box(x0, y0, x1, y1, t) {
      for (let y = u(y0); y < u(y1); y++) for (let x = u(x0); x < u(x1); x++) set(x, y, t);
      return g;
    },

    /** midpoint circle — the pixel artist's circle, filled by span */
    disc(cx, cy, r, t) {
      const [px0, py0, pr] = [u(cx), u(cy), u(r)];
      for (let y = -pr; y <= pr; y++) {
        const half = Math.floor(Math.sqrt(pr * pr - y * y + 0.25));
        for (let x = -half; x <= half; x++) set(px0 + x, py0 + y, t);
      }
      return g;
    },

    /**
     * The same circle, hollow, `w` pixels of wall — and the wall is the
     * same `w` at the apex as it is at the flanks. Walking the rows and
     * subtracting an inner span from an outer one does NOT give you that:
     * it thins to nothing where the curve runs flat, which at 32 is a
     * visible notch out of the top of an arch. So the test is on the
     * radius itself.
     */
    ring(cx, cy, r, w, t) {
      const [px0, py0, pr] = [u(cx), u(cy), u(r)];
      const inner = pr - w;
      for (let y = -pr; y <= pr; y++) for (let x = -pr; x <= pr; x++) {
        const d = Math.sqrt(x * x + y * y);
        if (d <= pr + 0.5 && d >= inner - 0.5) set(px0 + x, py0 + y, t);
      }
      return g;
    },

    /** integer scanline polygon — unit points, wound either way */
    poly(pts, t) {
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
          for (let x = Math.round(xs[k]); x < Math.round(xs[k + 1]); x++) set(x, y, t);
      }
      return g;
    },

    /** Bresenham, thickened into a square nib so it survives 32 */
    stroke(x0, y0, x1, y1, w, t) {
      let [ax, ay, bx, by] = [u(x0), u(y0), u(x1), u(y1)];
      const dx = Math.abs(bx - ax), dy = -Math.abs(by - ay);
      const sx = ax < bx ? 1 : -1, sy = ay < by ? 1 : -1;
      let err = dx + dy;
      const half = Math.max(1, Math.round(w * n));
      for (;;) {
        for (let oy = 0; oy < half; oy++) for (let ox = 0; ox < half; ox++) set(ax + ox, ay + oy, t);
        if (ax === bx && ay === by) break;
        const e2 = 2 * err;
        if (e2 >= dy) { err += dy; ax += sx; }
        if (e2 <= dx) { err += dx; ay += sy; }
      }
      return g;
    },

    /** punch a hole — everything this shape covers goes back to nothing */
    erase(fn) { fn({ ...g, box: (a,b,c,d) => g.box(a,b,c,d,NONE), disc: (a,b,c) => g.disc(a,b,c,NONE),
                     poly: (p) => g.poly(p, NONE), stroke: (a,b,c,d,w) => g.stroke(a,b,c,d,w,NONE) }); return g; },

    /**
     * THE LIGHT PASS, and the only reason these read as objects rather
     * than as stencils. Every body pixel within `d` of the silhouette's
     * top-left edge catches the light; every one within `d` of its
     * bottom-right edge turns away from it. Run last, over whatever the
     * face drew.
     */
    light(d = Math.max(1, Math.round(n / 32))) {
      const src = Uint8Array.from(px);
      const solid = (x, y) => (inside(x, y) ? src[y * n + x] !== NONE : false);
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        if (src[y * n + x] !== BODY) continue;
        let lit = false, dark = false;
        for (let k = 1; k <= d; k++) {
          if (!solid(x - k, y) || !solid(x, y - k)) lit = true;
          if (!solid(x + k, y) || !solid(x, y + k)) dark = true;
        }
        if (lit && !dark) set(x, y, LIT);
        else if (dark && !lit) set(x, y, SHADE);
      }
      return g;
    },
  };
  return g;
}

// ── the nine rules, plus the codex's own chevrons ────────────────────────
// Each is (g, n) => void. `n` is the grid, so a face can spend detail it
// only has room for: a rivet at 128 is a rivet, and at 32 it is one grey
// pixel in the middle of a plate, which is worse than no rivet.
const FACES = {
  /** a dome on a base — Shield Towers, and the beam it holds up */
  shieldTowers: (g, n) => {
    // A DOME SITTING ON A PLINTH IS A T-SHIRT. It was one here for an
    // afternoon — wide shoulders over a narrow body is a shirt before it
    // is a tower, at every size. What the rule actually draws is a shield
    // ARCHING OVER something, so the dome is a hollow arc now and the
    // tower under it flares out instead of hanging down.
    const wall = Math.max(2, Math.round(n * 0.06));
    g.ring(0.5, 0.52, 0.42, wall, BODY);        // the shield, as an arc
    g.erase((e) => e.box(0, 0.76, 1, 1));       // whose ends come down PAST
    g.poly([[0.33, 0.48], [0.67, 0.48], [0.77, 0.92], [0.23, 0.92]], BODY);
    if (n >= 64) g.box(0.3, 0.78, 0.7, 0.815, SHADE);  // a seam in the stonework
    g.light();
  },

  /** a shield with a plate seam across it — Armored Swarms */
  armored: (g, n) => {
    shieldBody(g);
    g.box(0.22, 0.44, 0.78, 0.53, SHADE);
    g.light();
    // THREE studs on the seam, not two up on the face — two anywhere near
    // the top of a shield are a pair of eyes, and the rule stops being
    // armour and starts being a robot.
    if (n >= 64) for (const x of [0.31, 0.47, 0.63]) g.box(x, 0.455, x + 0.06, 0.52, LIT);
  },

  /** the same shield carrying a plus — Overshields is armour ADDED */
  overshields: (g, n) => {
    shieldBody(g);
    g.erase((e) => { e.box(0.44, 0.26, 0.56, 0.62); e.box(0.32, 0.38, 0.68, 0.5); });
    g.light();
    g.box(0.44, 0.26, 0.56, 0.62, NONE);        // keep the cut clean of light
    g.box(0.32, 0.38, 0.68, 0.5, NONE);
  },

  /** a bolt — Speedy, the only rule in the catalog worth five */
  speedy: (g, n) => {
    g.poly([[0.72, 0.04], [0.16, 0.58], [0.44, 0.58], [0.28, 0.96], [0.84, 0.42], [0.56, 0.42]], BODY);
    if (n >= 64) {                              // the air it left behind,
      g.box(0.13, 0.26, 0.33, 0.305, SHADE);    // close enough to the bolt
      g.box(0.55, 0.70, 0.75, 0.745, SHADE);    // to belong to it
    }
    if (n >= 128) {
      g.box(0.2, 0.36, 0.3, 0.39, SHADE);
      g.box(0.62, 0.61, 0.72, 0.64, SHADE);
    }
    g.light();
  },

  /** an open mouth mid-bite — Hungry eats the bodies */
  hungry: (g, n) => {
    g.disc(0.5, 0.5, 0.46, BODY);
    g.erase((e) => e.poly([[0.5, 0.5], [1.04, 0.1], [1.04, 0.9]]));
    g.light();
    // NO TEETH. They were tried at 64 and up and they cost more than they
    // paid: a fang small enough to sit in the bite is four pixels that
    // read as dirt at 20px, and one big enough to read there closes the
    // mouth. The bite alone is the whole silhouette.
    if (n >= 48) g.disc(0.37, 0.28, 0.045, NONE); // the eye
  },

  /** a droplet with a rising chevron inside — Amphibious is what comes UP
   *  out of the water, stronger than it went in */
  amphibious: (g, n) => {
    dropBody(g);
    // The stem stops short of the floor. Run it to the bottom and the
    // droplet grows a doorway and the rule reads as a building.
    g.erase((e) => e.poly([[0.5, 0.36], [0.72, 0.60], [0.615, 0.60], [0.615, 0.78],
                           [0.385, 0.78], [0.385, 0.60], [0.28, 0.60]]));
    g.light();
  },

  /** a droplet — Hydrophobic is the water itself, standing too close */
  hydrophobic: (g, n) => {
    dropBody(g);
    g.light();
    // The shine is a DOT, high and inboard. It was a tall rectangle in the
    // middle of the bulb once, which read as a screen set into the water.
    if (n >= 64) g.disc(0.38, 0.6, 0.05, LIT);
  },

  /** one body and the two it came apart into — Mitosis is a death that
   *  leaves more of them standing than it took away */
  mitosis: (g, n) => {
    g.disc(0.3, 0.5, 0.26, BODY);
    g.disc(0.76, 0.27, 0.16, BODY);
    g.disc(0.76, 0.73, 0.16, BODY);
    g.light();
    if (n >= 64) { g.disc(0.3, 0.5, 0.07, SHADE); }   // the nucleus
  },

  /** a burst — Volatile is what happens when one of them dies */
  volatile: (g, n) => {
    const spikes = n >= 64 ? 10 : 8, R = 0.48, r = 0.27;
    const pts = [];
    for (let i = 0; i < spikes * 2; i++) {
      const a = (i / (spikes * 2)) * Math.PI * 2 - Math.PI / 2;
      const rad = i % 2 ? r : R;
      pts.push([0.5 + Math.cos(a) * rad, 0.5 + Math.sin(a) * rad]);
    }
    g.poly(pts, BODY);
    g.light();
    g.disc(0.5, 0.5, 0.15, LIT);                // the core, over the light
  },

  /** three chevrons climbing — the codex's own face, and the fallback for
   *  a rule nobody has drawn yet */
  glyph: (g, n) => {
    // ONE THICKNESS ALL THE WAY ROUND. The first pass hung a bar under
    // each chevron's elbow and three of them stacked read as three little
    // trees, which is a poor thing for the codex's own face to be.
    const chev = (y, t) => g.poly([[0.5, y], [0.88, y + 0.21], [0.88, y + 0.32],
                                   [0.5, y + 0.11], [0.12, y + 0.32], [0.12, y + 0.21]], t);
    chev(0.6, BODY); chev(0.33, BODY); chev(0.06, BODY);
    g.light();
  },
};

/** the heater shield both armour rules are cut from */
function shieldBody(g) {
  g.poly([[0.5, 0.06], [0.14, 0.2], [0.14, 0.52], [0.5, 0.94], [0.86, 0.52], [0.86, 0.2]], BODY);
}

/** the droplet both water rules are cut from — a point over a ball */
function dropBody(g) {
  g.disc(0.5, 0.63, 0.3, BODY);
  g.poly([[0.5, 0.05], [0.81, 0.63], [0.19, 0.63]], BODY);
}

// ── out the other side, as rects ─────────────────────────────────────────
/**
 * One <rect> per RUN of same-toned pixels, not per pixel — a 128 face is
 * a few hundred rects instead of sixteen thousand, and the run is the
 * only compression that keeps every edge exactly where the grid put it.
 * shapeRendering=crispEdges is what stops the browser blurring the seams
 * when the face is scaled to 20px.
 */
function toSvg(g, id) {
  const { n, px } = g;
  const runs = { [LIT]: [], [BODY]: [], [SHADE]: [] };
  for (let y = 0; y < n; y++) {
    let x = 0;
    while (x < n) {
      const t = px[y * n + x];
      if (t === NONE) { x++; continue; }
      let w = 1;
      while (x + w < n && px[y * n + x + w] === t) w++;
      runs[t].push(`<rect x="${x}" y="${y}" width="${w}" height="1"/>`);
      x += w;
    }
  }
  const groups = [LIT, BODY, SHADE]
    .filter((t) => runs[t].length)
    .map((t) => `<g fill="currentColor" fill-opacity="${TONE_ALPHA[t]}">${runs[t].join("")}</g>`)
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges" role="img" aria-label="${id}">${groups}</svg>`;
}

export const SIZES = [32, 64, 128];
export const FACE_IDS = Object.keys(FACES);

export function renderFace(id, n) {
  const g = grid(n);
  FACES[id](g, n);
  return toSvg(g, id);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { mkdirSync, writeFileSync } = await import("node:fs");
  const out = process.argv[2] ?? "public/mutators";
  for (const n of SIZES) {
    mkdirSync(`${out}/${n}`, { recursive: true });
    for (const id of FACE_IDS) writeFileSync(`${out}/${n}/${id}.svg`, renderFace(id, n));
  }
  console.log(`wrote ${FACE_IDS.length} faces x ${SIZES.length} sizes to ${out}/`);
}
