/**
 * ANIMAL ART: the Starhart (stag), Stoop (bat), Ironhide (rhino) and
 * Weaver (spider) families, generated as pixel art at load and packed
 * over the Starlight mechs', Skyfall bombers', ground mechs' and venom
 * spitters' atlas cells (atlas.ts packAnimalArt) while game/animalFlag.ts
 * ANIMAL_ART is on.
 *
 * The style these follow and the rule for how big a tier draws are in
 * docs/unit-art.md; read it before adding a family.
 *
 * Every drawing here comes out FACING UP on a square grid, exactly like a
 * Mindustry sprite file, and is handed to the same drawFacingRight /
 * antialiased / silhouetted passes the stock art goes through. The rules
 * are game/pixelArt.ts's: flat plates, nothing thinner than two pixels,
 * no outline, plating that runs down rather than across (a horizontal cut
 * on a symmetrical body is a face). Every body is left-right symmetric by
 * construction: the left half is drawn and mirrored.
 *
 * WHAT EACH FAMILY IS BUILT FOR
 *
 * Starhart rides the two ground rigs the renderer already animates. T1-T3
 * are MECHS (atlas.ts MechArt): a body, a base plate under it, and one
 * leg sprite holding the two near-side hooves, mirrored for the far side
 * and slid fore and aft by the walk cycle — so the hooves shuffle under
 * a body that keeps its legs tucked. T4 and T5 are LEGGED (LegArt +
 * levels.ts LegSpec): four legs the sim plants and the renderer strokes
 * between mount, knee and hoof, with a shoulder cap and a knee cap — the
 * stance opens out and the legs really walk.
 *
 * Stoop is a flyer at every tier, drawn as three quads instead of one:
 * the body, and one wing sprite mirrored to both sides, each pivoting at
 * its root and folding toward it on a sine (renderer.ts, FLYER_PARTS in
 * atlas.ts). The composed sprite is packed too, for the icon, the spawn
 * effect and the cloak ghost.
 *
 * Ironhide follows the stag's split exactly: mech rig to T3, four legs
 * from T4. Weaver is legged at every tier, the T1 included — a spider's
 * legs ARE its silhouette, so the one animal that gets its legs out at
 * every size is the one whose body is nothing without them.
 */

// ── the engine: a square grid of colour strings ────────────────────────
type Ink = string | null;
type Pt = readonly [number, number];
interface Pen {
  box(x0: number, y0: number, x1: number, y1: number, c: Ink): void;
  disc(cx: number, cy: number, r: number, c: Ink): void;
  ring(cx: number, cy: number, r: number, w: number, c: Ink): void;
  poly(pts: readonly Pt[], c: Ink): void;
  over(fn: (o: Pen) => void): void;
  erase(fn: (e: Pen) => void): void;
  dither(x0: number, y0: number, x1: number, y1: number, c: Ink): void;
}
/** unit coordinates in, like pixelArt.ts grid(); the dither is the one
 *  addition, a 2px checker for mottled skin */
function grid(n: number): { px: Ink[]; pen: Pen } {
  const px: Ink[] = new Array<Ink>(n * n).fill(null);
  let clipped = false, erasing = false;
  const u = (v: number) => Math.round(v * n);
  const set = (x: number, y: number, c: Ink) => {
    if (x < 0 || y < 0 || x >= n || y >= n) return;
    if (clipped && px[y * n + x] === null) return;
    px[y * n + x] = erasing ? null : c;
  };
  const pen: Pen = {
    box(x0, y0, x1, y1, c) { for (let y = u(y0); y < u(y1); y++) for (let x = u(x0); x < u(x1); x++) set(x, y, c); },
    // a circle of radius r + 1/2 about the pixel's centre: its poles come
    // out as short flat runs, never the lone pixel a radius-r circle
    // leaves sticking out at the top, bottom and sides
    disc(cx, cy, r, c) {
      const [cxp, cyp, pr] = [u(cx), u(cy), u(r)]; const rr = (pr + 0.5) * (pr + 0.5);
      for (let y = -pr; y <= pr; y++) { const half = Math.floor(Math.sqrt(rr - y * y)); for (let x = -half; x <= half; x++) set(cxp + x, cyp + y, c); }
    },
    ring(cx, cy, r, w, c) {
      const [cxp, cyp, pr] = [u(cx), u(cy), u(r)]; const inner = pr - w;
      for (let y = -pr; y <= pr; y++) for (let x = -pr; x <= pr; x++) { const d = Math.sqrt(x * x + y * y); if (d <= pr + 0.5 && d >= inner - 0.5) set(cxp + x, cyp + y, c); }
    },
    poly(pts, c) {
      const P = pts.map(([x, y]) => [u(x), u(y)] as const);
      let lo = Infinity, hi = -Infinity;
      for (const [, y] of P) { lo = Math.min(lo, y); hi = Math.max(hi, y); }
      for (let y = lo; y < hi; y++) {
        const xs: number[] = [];
        for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
          const [xi, yi] = P[i], [xj, yj] = P[j];
          if ((yi <= y && yj > y) || (yj <= y && yi > y)) xs.push(xi + ((y - yi) / (yj - yi)) * (xj - xi));
        }
        xs.sort((a, b) => a - b);
        for (let k = 0; k + 1 < xs.length; k += 2) for (let x = Math.round(xs[k]); x < Math.round(xs[k + 1]); x++) set(x, y, c);
      }
    },
    over(fn) { clipped = true; fn(pen); clipped = false; },
    erase(fn) { erasing = true; fn(pen); erasing = false; },
    dither(x0, y0, x1, y1, c) { for (let y = u(y0); y < u(y1); y++) for (let x = u(x0); x < u(x1); x++) if (((x >> 1) + (y >> 1)) % 2 === 0) set(x, y, c); },
  };
  return { px, pen };
}

/** a drawing on an n grid, its pixels and the pen that made it */
export interface Art { n: number; px: Ink[] }

/** the drawing on a canvas of its own size — the one place the DOM is needed */
export function toCanvas(a: Art): HTMLCanvasElement {
  const cv = document.createElement("canvas");
  cv.width = a.n;
  cv.height = a.n;
  const cc = cv.getContext("2d");
  if (!cc) throw new Error("2d context unavailable for animal art");
  const id = cc.createImageData(a.n, a.n);
  const d = id.data;
  for (let i = 0; i < a.n * a.n; i++) {
    const c = a.px[i];
    if (c === null) continue;
    d[i * 4] = parseInt(c.slice(1, 3), 16);
    d[i * 4 + 1] = parseInt(c.slice(3, 5), 16);
    d[i * 4 + 2] = parseInt(c.slice(5, 7), 16);
    d[i * 4 + 3] = 255;
  }
  cc.putImageData(id, 0, 0);
  return cv;
}
/** a non-square drawing (the stretched leg segments) */
export function toCanvasRect(px: Ink[], w: number, h: number): HTMLCanvasElement {
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  const cc = cv.getContext("2d");
  if (!cc) throw new Error("2d context unavailable for animal art");
  const id = cc.createImageData(w, h);
  const d = id.data;
  for (let i = 0; i < w * h; i++) {
    const c = px[i];
    if (c === null) continue;
    d[i * 4] = parseInt(c.slice(1, 3), 16);
    d[i * 4 + 1] = parseInt(c.slice(3, 5), 16);
    d[i * 4 + 2] = parseInt(c.slice(5, 7), 16);
    d[i * 4 + 3] = 255;
  }
  cc.putImageData(id, 0, 0);
  return cv;
}

// ── pixel-coordinate helpers on an n grid ──────────────────────────────
type Tone = readonly [string, string, string]; // dark, mid, lite
interface Shape { disc?: readonly [number, number, number]; poly?: readonly Pt[] }
interface H {
  n: number;
  p(v: number): number;
  P(pts: readonly Pt[]): Pt[];
  R(x0: number, y0: number, x1: number, y1: number): Pt[];
  rot(cx: number, cy: number, w: number, h: number, deg: number): Pt[];
  fill(g: Pen, s: Shape, c: Ink): void;
  within(g: Pen, s: Shape, fn: (t: Pen) => void): void;
  org(g: Pen, s: Shape, t: Tone, mottle?: boolean): void;
  mech(g: Pen, s: Shape, seam?: boolean): void;
  seg(g: Pen, x0: number, y0: number, x1: number, y1: number, w: number, t: Tone): void;
  cap(g: Pen, cx: number, cy: number, r: number, t: Tone): void;
  vents(g: Pen, x: number, y: number, count: number, h?: number): void;
  pipe(g: Pen, x0: number, y0: number, x1: number, y1: number): void;
  hull(g: Pen, s: Shape): void;
}
const ST = { deep: "#3a3b48", dark: "#55576a", mid: "#74768a", lite: "#8d909c" };
const STL: Tone = [ST.dark, ST.mid, ST.lite];
const STAR: Tone = ["#f0b840", "#fff0a8", "#fffbe0"];
const MAG: Tone = ["#8f2280", "#ff5fd6", "#ffa8ea"];
const HIDE: Tone = ["#4a3222", "#7a5636", "#a8845a"];
const FUR: Tone = ["#2a2230", "#4a3e52", "#7a6a84"];
const WHITE = "#ffffff";

function mk(n: number): H {
  const p = (v: number) => v / n;
  const P = (pts: readonly Pt[]): Pt[] => pts.map(([x, y]) => [p(x), p(y)] as const);
  const R = (x0: number, y0: number, x1: number, y1: number) => P([[x0, y0], [x1, y0], [x1, y1], [x0, y1]]);
  const rot = (cx: number, cy: number, w: number, h: number, deg: number): Pt[] => {
    const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
    return P(([[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]] as Pt[]).map(([x, y]) => [cx + x * c - y * s, cy + x * s + y * c] as const));
  };
  const bbox = (s: Shape): [number, number, number, number] => {
    if (s.disc) { const [cx, cy, r] = s.disc; return [cx - r, cy - r, cx + r + 1, cy + r + 1]; }
    const xs = s.poly!.map(([x]) => x * n), ys = s.poly!.map(([, y]) => y * n);
    return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  };
  const fill = (g: Pen, s: Shape, c: Ink) => s.disc ? g.disc(p(s.disc[0]), p(s.disc[1]), p(s.disc[2]), c) : g.poly(s.poly!, c);
  const within = (g: Pen, s: Shape, fn: (t: Pen) => void) => {
    const { px: m, pen: mm } = grid(n); fill(mm, s, "#m");
    const { px: t, pen: tt } = grid(n); fn(tt);
    g.over((o) => { for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (m[y * n + x] && t[y * n + x]) o.box(p(x), p(y), p(x + 1), p(y + 1), t[y * n + x]); });
  };
  const H: H = {
    n, p, P, R, rot, fill, within,
    org(g, s, [dark, mid, lite], mottle = true) {
      fill(g, s, mid); const [x0, y0, x1, y1] = bbox(s); const h = y1 - y0;
      within(g, s, (t) => {
        t.box(p(x0), p(y0), p(x1), p(y0 + Math.max(2, Math.round(h * 0.32))), lite);
        if (mottle && h >= 10) t.dither(p(x0), p(y0 + Math.round(h * 0.32)), p(x1), p(y0 + Math.round(h * 0.62)), lite);
        t.box(p(x0), p(y1 - 2), p(x1), p(y1), dark);
      });
    },
    mech(g, s, seam = true) {
      fill(g, s, ST.mid); const [x0, y0, x1, y1] = bbox(s); const h = y1 - y0;
      within(g, s, (t) => {
        t.box(p(x0), p(y0), p(x1), p(y0 + Math.max(2, Math.round(h * 0.3))), ST.lite);
        t.box(p(x0), p(y1 - Math.max(2, Math.round(h * 0.2))), p(x1), p(y1), ST.dark);
        if (seam) t.box(p(x0), p(y1 - 2), p(x1), p(y1), ST.deep);
      });
    },
    seg(g, x0, y0, x1, y1, w, [dark, mid, lite]) {
      const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1, a = (Math.atan2(dy, dx) * 180) / Math.PI;
      const mx = (x0 + x1) / 2, my = (y0 + y1) / 2, nx = -dy / L, ny = dx / L;
      g.poly(rot(mx, my, L + 1, w, a), mid); const o = w * 0.3;
      g.poly(rot(mx - nx * o, my - ny * o, L + 1, Math.max(2, w * 0.4), a), lite);
      g.poly(rot(mx + nx * o, my + ny * o, L + 1, Math.max(2, w * 0.3), a), dark);
    },
    cap(g, cx, cy, r, [, mid, lite]) { g.disc(p(cx), p(cy), p(r), mid); g.over((o) => o.box(p(cx - r), p(cy - r), p(cx + r + 1), p(cy), lite)); },
    vents(g, x, y, count, h = 6) { for (let i = 0; i < count; i++) g.box(p(x + i * 4), p(y), p(x + i * 4 + 2), p(y + h), ST.deep); },
    pipe(g, x0, y0, x1, y1) {
      g.box(p(x0), p(y0), p(x1), p(y1), ST.mid); const w = x1 - x0, h = y1 - y0;
      if (h >= w) { g.box(p(x0 + 1), p(y0), p(x1 - 1), p(y1), ST.lite); g.box(p(x0), p(y0), p(x1), p(y0 + 2), ST.deep); g.box(p(x0), p(y1 - 2), p(x1), p(y1), ST.deep); }
      else { g.box(p(x0), p(y0 + 1), p(x1), p(y1 - 1), ST.lite); g.box(p(x0), p(y0), p(x0 + 2), p(y1), ST.deep); g.box(p(x1 - 2), p(y0), p(x1), p(y1), ST.deep); }
    },
    hull(g, s) {
      fill(g, s, ST.mid); const [x0, y0, x1, y1] = bbox(s); const w = x1 - x0;
      const sw = Math.max(4, Math.round(w * 0.34)), cx = (x0 + x1) / 2, rail = Math.max(2, Math.round(w * 0.12));
      within(g, s, (t) => {
        t.box(p(cx - sw / 2), p(y0), p(cx + sw / 2), p(y1), ST.lite);
        t.box(p(x0), p(y0), p(x0 + rail), p(y1), ST.dark); t.box(p(x1 - rail), p(y0), p(x1), p(y1), ST.dark);
        t.box(p(x0), p(y1 - 3), p(x1), p(y1), ST.deep);
      });
    },
  };
  return H;
}
const el = (H: H, cx: number, cy: number, rx: number, ry: number, n = 28): Shape => ({ poly: H.P(Array.from({ length: n }, (_, i) => { const a = (i / n) * Math.PI * 2; return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry] as const; })) });
const limb = (g: Pen, H: H, pts: readonly Pt[], w: number, t: Tone): void => {
  w = Math.max(2, Math.round(w));
  for (let i = 0; i + 1 < pts.length; i++) H.seg(g, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], w, t);
  for (let i = 1; i + 1 < pts.length; i++) H.cap(g, pts[i][0], pts[i][1], Math.max(2, Math.round(w / 2)), t);
};
const stubs = (g: Pen, H: H, pts: readonly Pt[], w: number, h: number, t: Tone): void => {
  for (const [x, y] of pts) { g.box(H.p(x - w / 2), H.p(y), H.p(x + w / 2), H.p(y + h), t[0]); g.box(H.p(x - w / 2), H.p(y + h - Math.max(2, h * 0.3)), H.p(x + w / 2), H.p(y + h), ST.deep); }
};
const glow = (g: Pen, H: H, x: number, y: number, r: number, a: Tone): void => {
  r = Math.max(2, Math.round(r)); g.disc(H.p(x), H.p(y), H.p(r), a[1]);
  g.over((q) => q.box(H.p(x - r), H.p(y - r), H.p(x + r + 1), H.p(y), a[2]));
};
const stacks = (g: Pen, H: H, xs: readonly number[], y0: number, y1: number, w: number): void => { for (const x of xs) H.pipe(g, x - Math.floor(w / 2), y0, x - Math.floor(w / 2) + w, y1); };
/** the left half copied onto the right: symmetry by construction */
const symmetrize = (px: Ink[], n: number): Ink[] => { for (let y = 0; y < n; y++) for (let x = 0; x < n >> 1; x++) px[y * n + (n - 1 - x)] = px[y * n + x]; return px; };
/** slivers and specks the polygon clipping leaves behind, cleaned the way
 *  the sheets were: an isolated pixel goes, a 1px run takes a neighbour's colour */
const cleanup = (px: Ink[], n: number): void => {
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= n || y >= n ? null : px[y * n + x]);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const c = px[y * n + x]; if (c === null) continue;
    const nb = [at(x - 1, y), at(x + 1, y), at(x, y - 1), at(x, y + 1)];
    if (nb.every((v) => v === null)) { px[y * n + x] = null; continue; }
    if (!nb.includes(c)) { const f = nb.find((v) => v !== null); if (f !== undefined && f !== null) px[y * n + x] = f; }
  }
};
const draw = (n: number, fn: (g: Pen, H: H) => void, mirror = true): Art => {
  const { px, pen } = grid(n); fn(pen, mk(n));
  if (mirror) symmetrize(px, n); cleanup(px, n); if (mirror) symmetrize(px, n);
  return { n, px };
};
/** the family-colour cell: white wherever `fn` paints, on the body's grid */
const cellOf = (n: number, fn: (g: Pen, H: H) => void): Art => {
  const { px, pen } = grid(n); const H = mk(n);
  const white: Pen = { ...pen, disc: (cx, cy, r) => pen.disc(cx, cy, r, WHITE), box: (a, b, c, d) => pen.box(a, b, c, d, WHITE), poly: (pts) => pen.poly(pts, WHITE), ring: (a, b, c, d) => pen.ring(a, b, c, d, WHITE) };
  fn(white, H); symmetrize(px, n);
  return { n, px };
};

// ── STARHART ─────────────────────────────────────────────────────────────
export interface HartTier {
  /** the body grid, and the radius scale everything is drawn against */
  n: number; R: number; t: number; spread: number;
  /** how far past its cell's nominal world size the quad is drawn: the
   *  big tiers OVERSHOOT on purpose, so a T4 arriving reads as trouble */
  scale: number;
}
/** T1-T3 on the mech rig, T4-T5 on the legged rig. Grids fill the cell
 *  sizes the Starlight mechs already own (64/64/128/256/256) */
export const HART_TIERS: readonly HartTier[] = [
  { t: 1, n: 63, R: 18, spread: 0.1, scale: 1.5 },
  { t: 2, n: 63, R: 16, spread: 0.15, scale: 1.5 },
  { t: 3, n: 127, R: 34, spread: 0.3, scale: 1.4 },
  { t: 4, n: 255, R: 62, spread: 0.75, scale: 1.6 },
  { t: 5, n: 255, R: 62, spread: 1.0, scale: 2.0 },
];

/** the antler geometry, shared by the body and its cell: [x0,y0,x1,y1] in R
 *  units for each tine, and the glow points */
function antlers(t: number): { beam: [number, number, number, number]; tines: [number, number, number, number][] } {
  const beam: [number, number, number, number] = [0.2, -1.2, t >= 5 ? 1.0 : t >= 4 ? 0.85 : 0.5, t >= 5 ? -1.85 : t >= 4 ? -1.78 : -1.65];
  const tines: [number, number, number, number][] =
    t <= 2 ? [] : t === 3 ? [[0.32, -1.32, 0.38, -1.62]]
    : t === 4 ? [[0.32, -1.32, 0.3, -1.72], [0.52, -1.5, 0.55, -1.92], [0.72, -1.66, 0.8, -1.92], [0.95, -1.55, 1.08, -1.75]]
    : [[0.3, -1.3, 0.26, -1.75], [0.48, -1.5, 0.5, -1.95], [0.66, -1.68, 0.72, -1.95], [0.84, -1.78, 0.95, -1.95], [1.0, -1.6, 1.15, -1.8], [1.05, -1.45, 1.2, -1.6]];
  return { beam, tines };
}
function hartGlows(t: number, R: number, c: number): { x: number; y: number; r: number }[] {
  const out: { x: number; y: number; r: number }[] = [];
  const gl = Math.max(2, R * 0.07);
  if (t >= 2) { const { beam, tines } = antlers(t); for (const s of [-1, 1]) { out.push({ x: c + s * beam[2] * R, y: c + beam[3] * R, r: gl }); for (const [, , x1, y1] of tines) out.push({ x: c + s * x1 * R, y: c + y1 * R, r: gl }); } }
  out.push({ x: c, y: c - 1.28 * R, r: t >= 5 ? R * 0.12 : t >= 3 ? R * 0.08 : R * 0.06 });
  if (t >= 5) out.push({ x: c, y: c - 1.3 * R, r: R * 0.12 });
  return out;
}

/** the stag's body: everything but the legs */
function hartBody(g: Pen, H: H, T: HartTier): void {
  const { n, R, t } = T; const c = (n - 1) / 2, o = HIDE;
  const X = (v: number) => c + v * R, Y = (v: number) => c + v * R;
  H.org(g, el(H, c, Y(0.4), R * 0.76, R * 0.98), o);
  g.over((q) => q.box(H.p(X(-0.06)), H.p(Y(-0.4)), H.p(X(0.06) + 1), H.p(Y(1.25)), o[2]));
  if (t === 1) g.over((q) => { for (const [x, y] of [[-0.25, 0.2], [0.25, 0.2], [-0.3, 0.7], [0.3, 0.7], [-0.18, 1.0], [0.18, 1.0]]) q.disc(H.p(X(x)), H.p(Y(y)), H.p(Math.max(1.5, R * 0.09)), o[2]); });
  H.org(g, { poly: H.R(X(-0.17), Y(-1.0), X(0.17) + 1, Y(-0.3)) }, o, false);
  H.org(g, { disc: [c, Y(-1.15), R * 0.3] }, o, false);
  H.org(g, { disc: [c, Y(-1.45), R * 0.17] }, o, false);
  g.box(H.p(X(-0.07)), H.p(Y(-1.6)), H.p(X(0.07) + 1), H.p(Y(-1.5)), o[0]);
  for (const s of [-1, 1]) H.org(g, { poly: H.rot(X(s * 0.32), Y(-1.1), R * 0.14, R * 0.3, s * 40) }, o, false);
  // antlers: the emitters
  const tw = Math.max(3, R * 0.11);
  if (t >= 2) {
    const { beam, tines } = antlers(t);
    for (const s of [-1, 1]) {
      limb(g, H, [[X(s * beam[0]), Y(beam[1])], [X(s * beam[2]), Y(beam[3])]], tw, STL);
      if (t >= 4) H.mech(g, { poly: H.P([[X(s * 0.3), Y(-1.28)], [X(s * 0.75), Y(-1.76)], [X(s * (t >= 5 ? 1.02 : 0.9)), Y(-1.55)], [X(s * 0.62), Y(-1.2)]]) }, false);
      for (const [x0, y0, x1, y1] of tines) limb(g, H, [[X(s * x0), Y(y0)], [X(s * x1), Y(y1)]], tw * 0.8, STL);
    }
  }
  if (t >= 5) H.mech(g, { disc: [c, Y(-1.3), R * 0.2] }, false);
  for (const q of hartGlows(t, R, c)) glow(g, H, q.x, q.y, q.r, STAR);
  // steel on the back
  if (t >= 2) H.hull(g, { poly: H.R(X(-0.34), Y(-0.05), X(0.34) + 1, Y(1.05)) });
  if (t >= 3) g.ring(H.p(c), H.p(Y(0.55)), H.p(Math.max(4, R * 0.16)), Math.max(2, Math.round(R * 0.05)), STAR[1]);
  if (t >= 4) { H.vents(g, X(-0.11), Y(0.1), 3, Math.max(4, R * 0.22)); stacks(g, H, t >= 5 ? [X(-0.18), X(0.18)] : [c], Y(1.2), Y(1.6), Math.max(4, Math.round(R * 0.16))); }
}

export interface HartMechArt { body: Art; base: Art; leg: Art; cell: Art; stride: number }
export interface HartLegArt {
  body: Art; base: Art; cell: Art;
  /** on the small grid: hoof (drawn pointing up, packed facing +x), knee cap, shoulder cap */
  foot: Art; joint: Art; baseJoint: Art; small: number;
  /** the two stretched segments, mount on the left, as exact rects */
  leg: { px: Ink[]; w: number; h: number }; legBase: { px: Ink[]; w: number; h: number };
}

/** T1-T3: body, base and the near-side hoof pair as the mech rig's leg */
export function hartMech(T: HartTier): HartMechArt {
  const { n, R } = T; const c = (n - 1) / 2;
  const body = draw(n, (g, H) => hartBody(g, H, T));
  // the belly, under the body: only its rim ever shows
  const base = draw(n, (g, H) => H.org(g, el(H, c, c + R * 0.4, R * 0.66, R * 0.88), [HIDE[0], HIDE[0], HIDE[1]], false));
  // the two near-side hooves (right side; the renderer mirrors the far side)
  const leg = draw(n, (g, H) => stubs(g, H, [[c + R * 0.64, c - R * 0.3], [c + R * 0.64, c + R * 1.0]], Math.max(4, R * 0.26), Math.max(6, R * 0.4), HIDE), false);
  const cell = cellOf(n, (g, H) => { for (const q of hartGlows(T.t, R, c)) g.disc(H.p(q.x), H.p(q.y), H.p(Math.max(2, Math.round(q.r))), WHITE); });
  return { body, base, leg, cell, stride: [0, 2.5, 3, 4][T.t] };
}

/** T4-T5: body and base, plus the legged rig's caps, hoof and segments */
export function hartLegged(T: HartTier): HartLegArt {
  const { n, R } = T; const c = (n - 1) / 2;
  const body = draw(n, (g, H) => hartBody(g, H, T));
  const base = draw(n, (g, H) => H.org(g, { disc: [c, c + R * 0.35, R * 0.6] }, [HIDE[0], HIDE[0], HIDE[1]], false));
  const cell = cellOf(n, (g, H) => { for (const q of hartGlows(T.t, R, c)) g.disc(H.p(q.x), H.p(q.y), H.p(Math.max(2, Math.round(q.r))), WHITE); });
  const small = hartSmall(T); const sc = (small - 1) / 2;
  const kr = Math.round(R * 0.12), sr = Math.round(R * 0.17), hw = Math.round(R * 0.24), hh = Math.round(R * 0.22);
  const foot = draw(small, (g, H) => { g.box(H.p(sc - hw / 2), H.p(sc - hh / 2), H.p(sc + hw / 2), H.p(sc + hh / 2), HIDE[0]); g.box(H.p(sc - hw / 2), H.p(sc - hh / 2), H.p(sc + hw / 2), H.p(sc - hh / 2 + Math.max(2, hh * 0.35)), ST.deep); }, false);
  const joint = draw(small, (g, H) => H.cap(g, sc, sc, kr, HIDE), false);
  const baseJoint = draw(small, (g, H) => H.cap(g, sc, sc, sr, HIDE), false);
  // segments: thigh and shin, drawn horizontally on exact rects (mount left)
  const segment = (w: number, h: number): { px: Ink[]; w: number; h: number } => {
    const px: Ink[] = new Array<Ink>(w * h).fill(null);
    const lite = Math.max(2, Math.round(h * 0.3)), dark = Math.max(2, Math.round(h * 0.25));
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) px[y * w + x] = y < lite ? HIDE[2] : y >= h - dark ? HIDE[0] : HIDE[1];
    return { px, w, h };
  };
  const { th, sh } = hartSeg(T);
  return { body, base, cell, foot, joint, baseJoint, small, leg: segment(64, th), legBase: segment(64, sh) };
}
/** the grid the T4's and T5's caps and hoof are drawn on: the cell they pack into */
export const hartSmall = (T: HartTier): number => (T.t >= 5 ? 127 : 63);
/** the thigh and shin heights (native px across the leg) a tier's segments
 *  are drawn at — the atlas needs them for the cells before any art exists */
export const hartSeg = (T: HartTier): { th: number; sh: number } => ({
  th: Math.max(8, Math.round(T.R * 0.3)),
  sh: Math.max(6, Math.round(T.R * 0.2)),
});

// ── STOOP ────────────────────────────────────────────────────────────────
export interface StoopTier {
  t: number;
  /** the composed sprite's grid and half wingspan on it */
  n: number; W: number;
  /** the body-only and wing-only cells */
  nb: number; nw: number;
  /** how far the wing folds toward its root (0..1 of its span), the sweep
   *  it adds at the root (rad), and the flap rate (Hz) */
  fold: number; sweep: number; rate: number;
  /** the world-quad overshoot past the cell's nominal size (see HartTier) */
  scale: number;
}
export const STOOP_TIERS: readonly StoopTier[] = [
  { t: 1, n: 63, W: 28, nb: 63, nw: 63, fold: 0.32, sweep: 0.16, rate: 5, scale: 1.4 },
  { t: 2, n: 127, W: 58, nb: 63, nw: 63, fold: 0.32, sweep: 0.15, rate: 4, scale: 1.2 },
  { t: 3, n: 127, W: 60, nb: 127, nw: 127, fold: 0.3, sweep: 0.13, rate: 3, scale: 1.5 },
  { t: 4, n: 255, W: 120, nb: 127, nw: 127, fold: 0.28, sweep: 0.11, rate: 2, scale: 1.4 },
  { t: 5, n: 383, W: 180, nb: 191, nw: 191, fold: 0.25, sweep: 0.09, rate: 1.4, scale: 1.6 },
];
/** the wing's root, in the body frame, in W units: sideways and up */
const WING_ROOT = { x: 0.13, y: -0.1 } as const;
/** the wing polygon in the body frame (right wing), in W units */
const WING: readonly Pt[] = [[0.13, -0.1], [0.48, -0.48], [1.0, -0.22], [0.77, 0.22], [0.48, 0.39], [0.16, 0.35]];

/** one wing (the right one), drawn about an origin (cx, cy) on the grid */
function stoopWing(g: Pen, H: H, T: StoopTier, cx: number, cy: number, s: number): void {
  const { W, t } = T; const X = (v: number) => cx + s * v * W, Y = (v: number) => cy + v * W;
  const bone: Tone = t >= 3 ? STL : [FUR[0], FUR[0], FUR[1]]; const bw = Math.max(2, W * 0.05);
  const P = WING.map(([x, y]) => [X(x), Y(y)] as const);
  H.org(g, { poly: H.P(P) }, [MAG[0], MAG[0], MAG[1]], false);
  if (t >= 4) H.mech(g, { poly: H.P([[X(0.13), Y(-0.1)], [X(0.48), Y(-0.48)], [X(1.0), Y(-0.22)], [X(0.96), Y(-0.16)], [X(0.5), Y(-0.4)], [X(0.18), Y(-0.04)]]) }, false);
  limb(g, H, [P[0], P[1]], bw * 1.3, bone); for (const q of [P[2], P[3], P[4]]) limb(g, H, [P[1], q], bw, bone);
  if (t >= 4) for (const [x, y] of [[0.62, -0.1], [0.5, 0.12]]) glow(g, H, X(x), Y(y), W * 0.05, MAG);
}
/** the body: fur, ears, harness, stacks, the charge */
function stoopBody(g: Pen, H: H, T: StoopTier, cx: number, cy: number): void {
  const { W, t } = T; const o = FUR; const X = (v: number) => cx + v * W, Y = (v: number) => cy + v * W;
  H.org(g, el(H, cx, Y(0.06), W * 0.13, W * 0.26), o); H.org(g, { disc: [cx, Y(-0.26), W * 0.11] }, o, false);
  for (const s of [-1, 1]) g.poly(H.P([[X(s * 0.04), Y(-0.32)], [X(s * 0.13), Y(-0.32)], [X(s * 0.12), Y(-0.55)]]), o[1]);
  if (t >= 2) H.hull(g, { poly: H.R(X(-0.08), Y(-0.08), X(0.08) + 1, Y(0.24)) });
  if (t >= 3) stacks(g, H, [X(-0.06), X(0.06)], Y(0.26), Y(0.42), Math.max(3, Math.round(W * 0.05)));
  if (t >= 4) { H.mech(g, { disc: [cx, Y(-0.26), W * 0.06] }, false); glow(g, H, cx, Y(-0.26), W * 0.035, MAG); }
  // the T5's halo goes down first as a solid disc and the charge over it,
  // so the two edges never leave a hairline of fur between them
  const cr = stoopCharge(T);
  if (t >= 5) g.disc(H.p(cx), H.p(Y(0.08)), H.p(cr + Math.max(3, W * 0.03)), MAG[2]);
  glow(g, H, cx, Y(0.08), cr, MAG);
}
const stoopCharge = (T: StoopTier): number => T.W * [0, 0.05, 0.07, 0.08, 0.09, 0.16][T.t];

export interface StoopArt { full: Art; body: Art; wing: Art; cell: Art }
export interface StoopGeom {
  /** the wing root off the body centre: sideways and forward, native px */
  rootX: number; rootY: number;
  /** the wing cell's centre off its root, in the wing's own frame:
   *  sideways (out along the span) and forward, native px */
  wingX: number; wingY: number;
}
/** where the wing cell sits on its root — pure numbers, no canvas */
export function stoopGeom(T: StoopTier): StoopGeom {
  const { W, nw } = T; const m = (nw - 0.87 * W) / 2;
  // the wing cell's origin puts the wing's extent [0.13W..1.0W] x [-0.48W..0.39W] inside it with margin m
  const rootPx = m, rootPy = m + 0.38 * W;
  return { rootX: WING_ROOT.x * W, rootY: -WING_ROOT.y * W, wingX: nw / 2 - rootPx, wingY: -(nw / 2 - rootPy) };
}
export function stoop(T: StoopTier): StoopArt {
  const { n, nb, nw, W } = T; const c = (n - 1) / 2;
  const full = draw(n, (g, H) => { stoopWing(g, H, T, c, c, -1); stoopWing(g, H, T, c, c, 1); stoopBody(g, H, T, c, c); });
  const cb = (nb - 1) / 2;
  const body = draw(nb, (g, H) => stoopBody(g, H, T, cb, cb));
  // the right wing alone, on a cell of its own, its root where stoopGeom says
  const m = (nw - 0.87 * W) / 2; const ox = m - 0.13 * W, oy = m + 0.48 * W;
  const wing = draw(nw, (g, H) => stoopWing(g, H, T, ox, oy, 1), false);
  const cell = cellOf(n, (g, H) => g.disc(H.p(c), H.p(c + 0.08 * W), H.p(Math.max(2, Math.round(stoopCharge(T)))), WHITE));
  return { full, body, wing, cell };
}

// ── shared by the two ground families that followed ────────────────────
export interface Tier {
  t: number;
  /** the body grid, and the radius unit everything is drawn against */
  n: number; R: number;
  /** the world-quad overshoot past the cell's nominal size (see HartTier) */
  scale: number;
}
export interface Rect { px: Ink[]; w: number; h: number }
export interface MechParts { body: Art; base: Art; leg: Art; cell: Art; stride: number }
export interface LegParts {
  body: Art; base: Art; cell: Art;
  /** on the small grid: foot (drawn pointing up, packed facing +x), knee cap, shoulder cap */
  foot: Art; joint: Art; baseJoint: Art; small: number;
  /** the two stretched segments, mount on the left, as exact rects */
  leg: Rect; legBase: Rect;
}
/** a stretched segment: a flat band of the family's hide, lit along its top */
const segmentArt = (w: number, h: number, t: Tone): Rect => {
  const px: Ink[] = new Array<Ink>(w * h).fill(null);
  const lite = Math.max(2, Math.round(h * 0.3)), dark = Math.max(2, Math.round(h * 0.25));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) px[y * w + x] = y < lite ? t[2] : y >= h - dark ? t[0] : t[1];
  return { px, w, h };
};
/** the caps and segments every legged tier needs, on the small grid; the
 *  foot is the family's own */
const legRig = (
  small: number, tone: Tone, seg: { th: number; sh: number }, kr: number, sr: number,
  foot: (g: Pen, H: H, sc: number) => void,
): Pick<LegParts, "foot" | "joint" | "baseJoint" | "small" | "leg" | "legBase"> => {
  const sc = (small - 1) / 2;
  return {
    foot: draw(small, (g, H) => foot(g, H, sc), false),
    joint: draw(small, (g, H) => H.cap(g, sc, sc, Math.max(2, Math.round(kr)), tone), false),
    baseJoint: draw(small, (g, H) => H.cap(g, sc, sc, Math.max(2, Math.round(sr)), tone), false),
    small,
    leg: segmentArt(64, seg.th, tone),
    legBase: segmentArt(64, seg.sh, tone),
  };
};

// ── IRONHIDE ─────────────────────────────────────────────────────────────
//
// The rhino. A wall of back and a horn that is a gun barrel: the family's
// straight round comes out of the one thing a rhino points at you. The
// plating is a saddle of steel down the spine that grows tier by tier —
// strakes down the flanks at T3, pauldrons and stacks at T4, a crest over
// the head at T5 — and the accent is crimson: the muzzle, the spine, the
// pauldron lights. T1-T3 ride the mech rig (hooves under a body that keeps
// its legs in), T4 and T5 the legged rig on four stout legs.
const CRIM: Tone = ["#8c1c3a", "#ff4d6d", "#ff9ab0"];
const RHINO: Tone = ["#3e3a3c", "#66605f", "#8e8684"];
/** grids fill the ground mechs' cells (64/64/128/256/256) */
export const RHINO_TIERS: readonly Tier[] = [
  { t: 1, n: 63, R: 16, scale: 1.5 },
  { t: 2, n: 63, R: 16, scale: 1.6 },
  { t: 3, n: 127, R: 32, scale: 1.4 },
  { t: 4, n: 255, R: 64, scale: 1.6 },
  { t: 5, n: 255, R: 64, scale: 2.0 },
];
const hornWidth = (t: number): number => (t >= 5 ? 0.16 : t >= 3 ? 0.13 : 0.1);
/** the crimson: drawn last on the body, and alone (in white) for the team cell */
function rhinoAccent(g: Pen, H: H, T: Tier): void {
  const { n, R, t } = T; const c = (n - 1) / 2;
  const X = (v: number) => c + v * R, Y = (v: number) => c + v * R;
  const hw = hornWidth(t);
  g.box(H.p(X(-hw)), H.p(Y(-1.92)), H.p(X(hw)), H.p(Y(-1.8)), CRIM[1]);
  g.box(H.p(X(-0.05)), H.p(Y(-0.45)), H.p(X(0.05)), H.p(Y(0.65)), CRIM[1]);
  if (t >= 4) for (const s of [-1, 1]) g.disc(H.p(X(s * 0.62)), H.p(Y(-0.5)), H.p(R * 0.09), CRIM[1]);
  if (t >= 5) g.disc(H.p(c), H.p(Y(-0.9)), H.p(R * 0.1), CRIM[1]);
}
/** the rhino's body: everything but the legs */
function rhinoBody(g: Pen, H: H, T: Tier): void {
  const { n, R, t } = T; const c = (n - 1) / 2; const o = RHINO;
  const X = (v: number) => c + v * R, Y = (v: number) => c + v * R;
  const px = (v: number) => Math.max(2, Math.round(v * R));
  // the barrel of the body, with the two skin folds a rhino carries behind the shoulder and before the hip
  H.org(g, el(H, c, Y(0.2), R * (t >= 5 ? 0.98 : 0.92), R * 1.0), o, false);
  g.over((q) => { for (const y of [-0.25, 0.45]) q.box(H.p(X(-1)), H.p(Y(y)), H.p(X(1)), H.p(Y(y) + px(0.05)), o[0]); });
  // the head: a wedge off the shoulders, a snout, two ears
  H.org(g, { poly: H.P([[X(-0.6), Y(-0.6)], [X(0.6), Y(-0.6)], [X(0.34), Y(-1.35)], [X(-0.34), Y(-1.35)]]) }, o, false);
  H.org(g, { disc: [c, Y(-1.3), R * 0.3] }, o, false);
  for (const s of [-1, 1]) { H.org(g, { disc: [X(s * 0.42), Y(-0.85), R * 0.14] }, o, false); g.disc(H.p(X(s * 0.42)), H.p(Y(-0.85)), H.p(R * 0.06), o[0]); }
  // the horn is the gun: a barrel off the snout, the second stub behind it from the T3, a muzzle collar at T5
  const hw = hornWidth(t);
  H.pipe(g, X(-hw), Y(-1.9), X(hw), Y(-1.2));
  if (t >= 3) H.pipe(g, X(-hw * 0.7), Y(-1.12), X(hw * 0.7), Y(-0.85));
  if (t >= 5) g.ring(H.p(c), H.p(Y(-1.72)), H.p(R * 0.21), Math.max(2, Math.round(R * 0.05)), ST.lite);
  // steel: the saddle from T2, flank strakes and vents from T3, pauldrons and stacks from T4, the crest at T5
  if (t >= 2) H.hull(g, { poly: H.R(X(-0.4), Y(-0.55), X(0.4), Y(0.8)) });
  if (t >= 3) {
    for (const s of [-1, 1]) H.mech(g, { poly: H.P([[X(s * 0.45), Y(-0.45)], [X(s * 0.88), Y(-0.3)], [X(s * 0.9), Y(0.55)], [X(s * 0.45), Y(0.7)]]) });
    H.vents(g, c - 5, Y(-0.42), 3, px(0.2));
  }
  if (t >= 4) {
    for (const s of [-1, 1]) H.mech(g, { disc: [X(s * 0.62), Y(-0.5), R * 0.24] });
    stacks(g, H, t >= 5 ? [X(-0.22), X(0.22)] : [c], Y(0.85), Y(1.2), px(0.16));
  }
  if (t >= 5) H.mech(g, { poly: H.P([[X(-0.5), Y(-0.65)], [X(0.5), Y(-0.65)], [X(0.28), Y(-1.2)], [X(-0.28), Y(-1.2)]]) }, false);
  if (t >= 2) H.pipe(g, X(-0.06), Y(1.15), X(0.06), Y(1.38));
  rhinoAccent(g, H, T);
}
/** T1-T3: body, base and the near-side hoof pair as the mech rig's leg */
export function rhinoMech(T: Tier): MechParts {
  const { n, R } = T; const c = (n - 1) / 2;
  const body = draw(n, (g, H) => rhinoBody(g, H, T));
  const base = draw(n, (g, H) => H.org(g, el(H, c, c + R * 0.2, R * 0.84, R * 0.92), [RHINO[0], RHINO[0], RHINO[1]], false));
  // the hooves sit at the body's edge, so a sliver of each shows past it and shuffles
  const leg = draw(n, (g, H) => stubs(g, H, [[c + R * 0.92, c - R * 0.55], [c + R * 0.92, c + R * 0.5]], Math.max(4, R * 0.3), Math.max(6, R * 0.45), RHINO), false);
  const cell = cellOf(n, (g, H) => rhinoAccent(g, H, T));
  return { body, base, leg, cell, stride: [0, 3, 3.5, 4.5][T.t] };
}
/** T4-T5: body and base, plus the legged rig's caps, hoof and segments */
export function rhinoLegged(T: Tier): LegParts {
  const { n, R } = T; const c = (n - 1) / 2;
  const body = draw(n, (g, H) => rhinoBody(g, H, T));
  const base = draw(n, (g, H) => H.org(g, el(H, c, c + R * 0.2, R * 0.7, R * 0.8), [RHINO[0], RHINO[0], RHINO[1]], false));
  const cell = cellOf(n, (g, H) => rhinoAccent(g, H, T));
  const hw = Math.round(R * 0.3), hh = Math.round(R * 0.26);
  const rig = legRig(rhinoSmall(T), RHINO, rhinoSeg(T), R * 0.2, R * 0.26, (g, H, sc) => {
    g.box(H.p(sc - hw / 2), H.p(sc - hh / 2), H.p(sc + hw / 2), H.p(sc + hh / 2), RHINO[0]);
    g.box(H.p(sc - hw / 2), H.p(sc - hh / 2), H.p(sc + hw / 2), H.p(sc - hh / 2 + Math.max(2, hh * 0.35)), ST.deep);
  });
  return { body, base, cell, ...rig };
}
/** the grid the T4's and T5's caps and hoof are drawn on: the cell they pack into */
export const rhinoSmall = (T: Tier): number => (T.t >= 5 ? 127 : 63);
/** thigh and shin heights (native px across the leg): stout, a rhino's */
export const rhinoSeg = (T: Tier): { th: number; sh: number } => ({
  th: Math.max(8, Math.round(T.R * 0.36)),
  sh: Math.max(6, Math.round(T.R * 0.28)),
});

// ── WEAVER ───────────────────────────────────────────────────────────────
//
// The spider: a soft body on steel legs. The machine is the legs at every
// tier — thin pistons with steel knee caps and feet, on shoulder caps of
// the body's own hide — the fangs from T3, a waist clamp and a spinneret
// stack from T4. Six legs on the mite, eight from the spider up, all on
// the legged rig, the T1 included. The abdomen wears a steel plate,
// strakes running down, with one seam of acid down its centre line: that
// seam is the whole of the family colour on the body.
const ACID: Tone = ["#5c8a12", "#d4ff3a", "#eeffa0"];
const SPIDER: Tone = ["#3a2a3a", "#5c3f5c", "#8a6488"];
export interface SpiderTier {
  t: number;
  /** the body grid and the design scale drawn on it (the body is drawn in
   *  design units around the centre, so one shape serves every tier) */
  n: number; S: number;
  /** the leg stroke, native px across the segment on this tier's grid */
  stroke: number;
  /** the world-quad overshoot past the cell's nominal size (see HartTier) */
  scale: number;
}
/** grids fill the venom spitters' cells (64/128/128/256/256) */
export const SPIDER_TIERS: readonly SpiderTier[] = [
  { t: 1, n: 63, S: 2.4, stroke: 5, scale: 1.5 },
  { t: 2, n: 127, S: 2.5, stroke: 7, scale: 1.1 },
  { t: 3, n: 127, S: 2.6, stroke: 9, scale: 1.4 },
  { t: 4, n: 255, S: 4.0, stroke: 15, scale: 1.6 },
  { t: 5, n: 255, S: 4.2, stroke: 20, scale: 2.0 },
];
/** the abdomen's centre and radius, design units */
const abdomen = (t: number): { cy: number; R: number } => (t === 1 ? { cy: 4, R: 8 } : { cy: 8, R: 12 + (t - 2) * 1.5 });
/** the plate on the abdomen: a chamfered slab of steel, its strakes
 *  running down, sized to the tier */
function spiderPlate(g: Pen, H: H, T: SpiderTier): void {
  const { n, S, t } = T; const c = (n - 1) / 2;
  const X = (v: number) => c + v * S, Y = (v: number) => c + v * S;
  const { cy, R } = abdomen(t); const k = [0, 0.8, 0.85, 0.9, 1, 1][t] * R;
  H.hull(g, { poly: H.P([
    [X(-0.4 * k), Y(cy - 0.75 * k)], [X(0.4 * k), Y(cy - 0.75 * k)], [X(0.6 * k), Y(cy - 0.3 * k)], [X(0.6 * k), Y(cy + 0.45 * k)],
    [X(0.35 * k), Y(cy + 0.8 * k)], [X(-0.35 * k), Y(cy + 0.8 * k)], [X(-0.6 * k), Y(cy + 0.45 * k)], [X(-0.6 * k), Y(cy - 0.3 * k)],
  ]) });
}
/** the acid seam down the plate — last on the body, alone (in white) for the cell */
function spiderMark(g: Pen, H: H, T: SpiderTier): void {
  const { n, S, t } = T; const c = (n - 1) / 2;
  const X = (v: number) => c + v * S, Y = (v: number) => c + v * S;
  const { cy, R } = abdomen(t); const k = [0, 0.8, 0.85, 0.9, 1, 1][t] * R;
  const hw = Math.max(1, 0.06 * k);
  g.box(H.p(X(-hw)), H.p(Y(cy - 0.6 * k)), H.p(X(hw)), H.p(Y(cy + 0.65 * k)), ACID[1]);
}
/** the spider's body: abdomen, cephalothorax, eyes, pedipalps, fangs, the steel at the waist and the rear */
function spiderBody(g: Pen, H: H, T: SpiderTier): void {
  const { n, S, t } = T; const c = (n - 1) / 2; const o = SPIDER;
  const X = (v: number) => c + v * S, Y = (v: number) => c + v * S, r = (v: number) => Math.max(2, Math.round(v * S));
  const disc = (x: number, y: number, rr: number): Shape => ({ disc: [X(x), Y(y), r(rr)] });
  const eyes = (xs: readonly number[], y: number, s = 2): void => {
    for (const x of xs) for (const sg of [-1, 1]) g.box(H.p(X(sg * x) - r(s) / 2), H.p(Y(y)), H.p(X(sg * x) + r(s) / 2), H.p(Y(y) + r(s)), o[0]);
  };
  const { cy, R } = abdomen(t);
  if (t === 1) { H.org(g, disc(0, cy, R), o); spiderPlate(g, H, T); H.org(g, disc(0, -6, 5), o, false); eyes([2], -9); spiderMark(g, H, T); return; }
  H.org(g, disc(0, cy, R), o);
  spiderPlate(g, H, T);
  H.org(g, disc(0, -8, 8 + (t - 2)), o, false);
  eyes([2, 5], -13 - (t - 2)); eyes([1.5], -11 - (t - 2));
  if (t >= 3) for (const sg of [-1, 1]) H.org(g, { poly: H.rot(X(sg * 4), Y(-15 - (t - 2)), r(2.5), r(7), sg * 40) }, o, false);
  if (t >= 4) H.pipe(g, X(-7), Y(-1), X(7), Y(2));
  if (t >= 4) H.pipe(g, X(-2), Y(17 + (t - 2) * 1.5), X(2), Y(24 + (t - 2) * 1.5));
  if (t >= 3) for (const s of [-1, 1]) {
    const L = 9 + (t - 3) * 2, a = (s * 25 * Math.PI) / 180, x0 = s * 5, y0 = -12 - (t - 2);
    H.seg(g, X(x0), Y(y0), X(x0 + Math.sin(a) * L), Y(y0 - Math.cos(a) * L), r(3 + (t - 3)), STL);
    if (t === 5) H.seg(g, X(s * 8), Y(-16), X(s * 8 + Math.sin(a) * 8), Y(-16 - Math.cos(a) * 8), r(4), STL);
  }
  spiderMark(g, H, T);
}
/** every tier: body and base, plus the legged rig's steel caps, foot and segments */
export function spiderLegged(T: SpiderTier): LegParts {
  const { n, S, stroke } = T; const c = (n - 1) / 2;
  const body = draw(n, (g, H) => spiderBody(g, H, T));
  const base = draw(n, (g, H) => H.org(g, { disc: [c, c, Math.max(4, Math.round(S * (T.t === 1 ? 5 : 6)))] }, [SPIDER[0], SPIDER[0], SPIDER[1]], false));
  const cell = cellOf(n, (g, H) => spiderMark(g, H, T));
  const small = spiderSmall(T); const sc = (small - 1) / 2;
  const rig = legRig(small, STL, { th: stroke, sh: stroke }, stroke * 0.5, stroke * 0.7, (g, H) => H.cap(g, sc, sc, Math.max(2, Math.round(stroke * 0.7)), STL));
  // the shoulder cap is the body's own hide, over the steel it mounts
  const baseJoint = draw(small, (g, H) => H.cap(g, sc, sc, Math.max(2, Math.round(stroke * 0.7)), SPIDER), false);
  return { body, base, cell, ...rig, baseJoint };
}
/** the grid the caps and foot are drawn on: the cell they pack into */
export const spiderSmall = (T: SpiderTier): number => (T.t >= 4 ? 127 : 63);
