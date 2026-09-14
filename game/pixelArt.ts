/**
 * THE PIXEL ART ENGINE, AND THE HOUSE RULES FOR DRAWING ONE OF THESE.
 *
 * Three catalogs draw on it: the mutator faces (components/mutationArt.ts),
 * the mod glyphs (components/modArt.ts) and the STATUS SYMBOLS
 * (game/statusArt.ts). The engine is here so all three obey the same
 * rules, and the rules are here because they are the part that is easy to
 * get wrong.
 *
 * IT SITS UNDER game/ RATHER THAN components/ BECAUSE THE FIELD DRAWS
 * TOO. A status symbol is stamped over a body on the board by the overlay
 * canvas and printed in the inspector by React, and both read the same
 * description — so the engine has to be somewhere the sim's half of the
 * tree can reach. components/pixelArt.ts re-exports it for the two
 * catalogs that were written against that path.
 *
 * ── 1. THE ICON IS NOT AN ILLUSTRATION OF THE OLD ICON ────────────────
 *
 * When one of these replaces a line glyph, DO NOT trace the glyph. The
 * old drawing was constrained by being two strokes on a 24-grid; the new
 * one is not, and copying it inherits a limit that no longer exists.
 * Start from what the rule DOES and draw the most obvious concrete thing
 * that says it. Amphibious does not have to be a droplet with a chevron
 * cut out of it — it could be a frog, or a droplet with a little heart
 * beside it. Pick the picture a player would guess in half a second, and
 * let it be fun; a catalog of tasteful abstract marks is a catalog nobody
 * can tell apart at 15 pixels.
 *
 * ── 2. SIMPLE BEATS FAITHFUL ──────────────────────────────────────────
 *
 * These are read at 12 to 22 CSS pixels on a relic shelf and 20 to 56 on
 * a mutator tile. One clear object, one accent, and nothing finer than
 * two pixels wide. If a detail cannot be named from across the desk it is
 * not detail, it is dirt — the mutator bite lost its fangs for exactly
 * this reason. When in doubt, remove a thing.
 *
 * ── 3. A BETTER VERSION OF A THING IS THE SAME PICTURE ────────────────
 *
 * Two mods that are the same stat at two sizes — the common +10% damage
 * and the uncommon +25% — SHARE ONE DRAWING, byte for byte. Not a
 * recoloured variant, not a bigger one, not one with an extra pip: the
 * same art. The band border around the chip is what says which, and it
 * says so in the same four colours the cards and the formations already
 * use, so the player has one legend to learn instead of a family of
 * near-identical icons to tell apart. This is why a drawing is keyed by
 * GLYPH and never by mod id (see ModGlyph in game/mods.ts).
 *
 * ── 4. NO BAND COLOUR INSIDE THE ART ──────────────────────────────────
 *
 * Follows from 3. A drawing carries the palette of the THING it depicts —
 * gunmetal for a structure, green for healing, blue for a field, ember
 * for damage — and never the colour of how good it is. Every screen that
 * draws one of these already puts the band on the frame around it.
 *
 * ── 5. FLAT, NOT EMBOSSED ─────────────────────────────────────────────
 *
 * Count the colours in piercer.png or fixer.png: four or five, butted
 * along straight edges, no dark contour and no gradient. Do NOT trace
 * light down a silhouette's top-left edge and shadow down its
 * bottom-right — that is how a button is drawn, and it makes an icon look
 * pressed out of the page beside art that looks stamped flat. Form comes
 * from PARTS: use over() to butt one flat plate against another.
 *
 * ── 6. WATCH FOR THE FACE ─────────────────────────────────────────────
 *
 * A horizontal cut across a symmetrical shape turns it into a face, every
 * time. A pale top plate over a dark skirt is a head; two pips near the
 * top are eyes; a wedge under them is a beak. Armored Swarms was a cloud,
 * then a visored helm, before it became a vertical strake, and Hungry
 * Mechs was a duck. Plating that runs DOWN cannot do this.
 */

/**
 * THE PALETTE, COUNTED OFF THE GAME'S OWN SPRITES rather than invented.
 * Every hex was taken from the art under public/mindustry/sprites — the
 * gunmetal ramp is what piercer, cleaver and repeater are plated in, the
 * green is the fixer's and the force projector's, the field blue is
 * tether's, the ember ramp is repeater's and hive's heat, and the water
 * is the #5c6dbb renderer.ts already records shallow-water.png as
 * averaging. Drawing next to art this consistent in invented colours is
 * how an icon ends up looking bolted on.
 */
export const PAL = {
  steelDeep: "#2c2d38", steelDark: "#4d4e58", steel: "#7b7b7b",
  steelLite: "#c1c3d4", steelWhite: "#f4f4f4",
  blueDark: "#4e57a0",
  healDark: "#62ae7f", heal: "#84f491", healLite: "#c8ffd2",
  fieldDark: "#6f80e8", field: "#88a4ff", fieldLite: "#c6d6ff",
  emberDark: "#db401c", ember: "#ec7458", emberLite: "#ff9c5a",
  flame: "#ffdd55", flameLite: "#fff2ad",
  waterDark: "#3f4c96", water: "#5c6dbb", waterLite: "#8aa3f4",
  // THE FAMILY PALETTE, straight off constants.ts (PAL.mech and the rest):
  // one hue a family, and the symbol of every status a family lays is
  // drawn in that family's hue — acid for the rot, violet for a short and
  // a cloak, magenta for a jam, teal for a veteran
  // THE BLUE LINE'S OWN, off constants.ts PAL.piercerLaser: coil, piercer
  // and furnace all fire in #a9d8ff, so the electric mark and the chips
  // that point at it are drawn in the colour the shot itself is
  sparkDark: "#3d6fc4", spark: "#a9d8ff", sparkLite: "#e4f3ff",
  venomDark: "#5c8a12", venom: "#d4ff3a",
  wraithDark: "#5a35b8", wraith: "#b48cff",
  bomberDark: "#8f2280", bomber: "#ff5fd6",
  harpoonDark: "#0f8a78", harpoon: "#4dffe0",
  codexDark: "#c25a97", codex: "#ff8acb", codexLite: "#ffc7e6",
} as const;

export type Ink = (typeof PAL)[keyof typeof PAL] | null;

/** the pen — unit coordinates in, palette keys on a square grid out */
export type Pen = {
  box(x0: number, y0: number, x1: number, y1: number, c: Ink): Pen;
  disc(cx: number, cy: number, r: number, c: Ink): Pen;
  ring(cx: number, cy: number, r: number, w: number, c: Ink): Pen;
  poly(pts: readonly (readonly [number, number])[], c: Ink): Pen;
  over(fn: (o: Pen) => void): Pen;
  erase(fn: (e: Pen) => void): Pen;
};

/**
 * EVERYTHING IS IN UNIT COORDINATES, 0 to 1, never in pixels. A drawing
 * that names pixels is a drawing that only works on the grid it was
 * written for; one that names fractions lands on any of them, which is
 * how the same descriptions survived being moved from a 32 grid to a 16.
 */
export function grid(n: number): { px: Ink[]; pen: Pen } {
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
     * where the curve runs flat, which is a visible notch out of the top
     * of an arch. So the test is on the radius itself.
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
     * A PLATE, and the whole of rule 5. Everything drawn inside `fn`
     * lands only where the drawing has already put something, so a plain
     * rectangle becomes a top plate or a skirt that follows the
     * silhouette exactly and spills nowhere.
     */
    over(fn) { clipped = true; fn(pen); clipped = false; return pen; },

    /** punch a hole — whatever `fn` draws goes back to nothing */
    erase(fn) { erasing = true; fn(pen); erasing = false; return pen; },
  };
  return { px, pen };
}

/** one <path> per colour: that colour's pixels, as a run of 1-tall boxes */
export type Layer = { readonly color: string; readonly d: string };

/**
 * Runs of one colour along a row, collected per colour, so the hex is
 * written once per layer rather than once per pixel. A drawing lands in
 * three to six paths.
 */
export function toLayers(px: Ink[], n: number): readonly Layer[] {
  const byColor = new Map<string, string[]>();
  for (let y = 0; y < n; y++) {
    let x = 0;
    while (x < n) {
      const c = px[y * n + x];
      if (c === null) { x++; continue; }
      let w = 1;
      while (x + w < n && px[y * n + x + w] === c) w++;
      const runs = byColor.get(c) ?? [];
      runs.push(`M${x} ${y}h${w}v1h-${w}z`);
      byColor.set(c, runs);
      x += w;
    }
  }
  return [...byColor].map(([color, d]) => ({ color, d: d.join("") }));
}

/** draw once, keep it — a drawing never changes after its first draw, and
 *  the shelves that show these re-render on every hover */
export function memoDraw<K extends string>(
  drawings: Record<K, (g: Pen) => void>,
  n: number,
  fallback: K,
): (key: string) => readonly Layer[] {
  const done = new Map<string, readonly Layer[]>();
  return (want: string) => {
    const key = (want in drawings ? want : fallback) as K;
    const hit = done.get(key);
    if (hit) return hit;
    const { px, pen } = grid(n);
    drawings[key](pen);
    const layers = toLayers(px, n);
    done.set(key, layers);
    return layers;
  };
}
