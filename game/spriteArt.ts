// The flat sprite set (docs/style-concepts.html): drawn the way the
// references are — one fill, a darker band on the lower part of every
// shape, one dark outline round the silhouette, nothing else. 12 px a
// tile. Turrets are a round body with barrels that turn; enemies are a
// blob with eyes, the same design at every tier; props and the core the
// same rules. Everything here is new art.

export type Ink = string | null;
export interface Pic { w: number; h: number; px: Ink[]; /** the row the thing stands on, for the sheet */ ground: number }

const hex = (c: string): [number, number, number] => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
const toHex = (r: number, g: number, b: number): string =>
  `#${[r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("")}`;
export const mix = (a: string, b: string, t: number): string => {
  const A = hex(a), B = hex(b);
  return toHex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t);
};
export const INK = "#1a1a2e";
/** the lower band's tone off a fill */
export const shade = (c: string): string => mix(c, INK, 0.38);
export const lift = (c: string): string => mix(c, "#ffffff", 0.35);

export const SPRITE_PX = 12;
export const FACINGS = 8;
export const facingOf = (rot: number): number => ((Math.round(rot / (Math.PI / 4)) % FACINGS) + FACINGS) % FACINGS;

/** a pen on a w x h grid; every shape takes a fill and draws its lower
 *  `band` share in the fill's shade */
export class Pen {
  readonly px: Ink[];
  constructor(readonly w: number, readonly h: number) {
    this.px = new Array<Ink>(w * h).fill(null);
  }
  put(x: number, y: number, c: Ink): void {
    x = Math.round(x); y = Math.round(y);
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.px[y * this.w + x] = c;
  }
  at(x: number, y: number): Ink {
    x = Math.round(x); y = Math.round(y);
    return x >= 0 && y >= 0 && x < this.w && y < this.h ? this.px[y * this.w + x] : null;
  }
  rect(x0: number, y0: number, x1: number, y1: number, c: string, band = 0): void {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const by = y1 - Math.round((y1 - y0) * band);
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) this.put(x, y, y >= by ? shade(c) : c);
  }
  /** an ellipse; the lower `band` share shaded */
  ellipse(cx: number, cy: number, rx: number, ry: number, c: string, band = 0): void {
    const y0 = Math.ceil(cy - ry - 0.5), y1 = Math.floor(cy + ry + 0.5);
    const by = cy + ry - 2 * ry * band;
    for (let y = y0; y <= y1; y++) for (let x = Math.ceil(cx - rx - 0.5); x <= Math.floor(cx + rx + 0.5); x++) {
      const u = (x - cx) / (rx + 0.5), v = (y - cy) / (ry + 0.5);
      if (u * u + v * v <= 1) this.put(x, y, y >= by ? shade(c) : c);
    }
  }
  /** a thick line, square-ended */
  line(x0: number, y0: number, x1: number, y1: number, w: number, c: string): void {
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2));
    for (let i = 0; i <= n; i++) {
      const x = x0 + ((x1 - x0) * i) / n, y = y0 + ((y1 - y0) * i) / n;
      this.ellipse(x, y, (w - 1) / 2, (w - 1) / 2, c);
    }
  }
  /** a triangle */
  tri(a: readonly [number, number], b: readonly [number, number], d: readonly [number, number], c: string): void {
    const pts = [a, b, d];
    const lo = Math.floor(Math.min(a[1], b[1], d[1])), hi = Math.ceil(Math.max(a[1], b[1], d[1]));
    for (let y = lo; y <= hi; y++) {
      const xs: number[] = [];
      for (let i = 0; i < 3; i++) {
        const [xi, yi] = pts[i], [xj, yj] = pts[(i + 1) % 3];
        if ((yi <= y && yj > y) || (yj <= y && yi > y)) xs.push(xi + ((y - yi) / (yj - yi)) * (xj - xi));
      }
      if (xs.length === 2) for (let x = Math.round(Math.min(...xs)); x <= Math.round(Math.max(...xs)); x++) this.put(x, y, c);
    }
  }
  /** the dark line round everything drawn so far */
  outline(ink = INK): void {
    const src = this.px.slice();
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (src[y * this.w + x] !== null) continue;
      let near = false;
      for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx >= 0 && yy >= 0 && xx < this.w && yy < this.h && src[yy * this.w + xx] !== null) { near = true; break; }
      }
      if (near) this.px[y * this.w + x] = ink;
    }
  }
  pic(ground: number): Pic { return { w: this.w, h: this.h, px: this.px, ground }; }
  /** the drawing mirrored left to right */
  flipX(): void {
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w >> 1; x++) {
      const a = y * this.w + x, b = y * this.w + (this.w - 1 - x);
      const t = this.px[a]; this.px[a] = this.px[b]; this.px[b] = t;
    }
  }
}

// ── the palette ────────────────────────────────────────────────────────
export const COL = {
  wood: "#c98a4b", stone: "#a8a39c", iron: "#5c6478", steel: "#cdd3e0", brass: "#f0c04a", copper: "#e08a3f",
  bullet: "#e08a3f", shell: "#f0c04a", flame: "#ff6a3d", beam: "#5ea8ff", water: "#3d8dff", field: "#5fe2b0", missile: "#ff5f7a", toxin: "#8ee04a",
  flameLit: "#ffd84a", eye: "#ffffff",
  rhino: "#9aa5bd", horn: "#f7efd6", stag: "#d9a05b", antler: "#f7efd6", frog: "#5cc46a", bat: "#a77bc4", hull: "#7fb6c9",
  amber: "#ffb13b", slate: "#5a6080", slateLit: "#8a90ad",
  trunk: "#9a6a3a", leaf: "#58b84c", leafLit: "#9be36a", bush: "#4caa4a", rock: "#b3ab9f", crystal: "#7fd6ff", sand: "#f1dca3",
} as const;
export type Ammo = "bullet" | "shell" | "flame" | "beam" | "water" | "field" | "missile" | "toxin";
export const AMMO_COL: Record<Ammo, string> = { bullet: COL.bullet, shell: COL.shell, flame: COL.flame, beam: COL.beam, water: COL.water, field: COL.field, missile: COL.missile, toxin: COL.toxin };

// ── turrets: a round body and the gun on it, turned to each facing ──────
export interface GunSpec {
  size: 1 | 2 | 3 | 4;
  ammo: Ammo;
  /** barrels: how many, how long past the body (share of the body radius), how thick (share of n) */
  barrels: number;
  len: number;
  thick: number;
  /** what sits on the body: a cap disc, a mortar mouth, an orb, a dish, a spike, none */
  top: "cap" | "mouth" | "orb" | "dish" | "spike" | "none";
  /** a square body instead of a round one */
  square?: boolean;
}
export const GUNS: Record<string, GunSpec> = {
  tacker: { size: 1, ammo: "bullet", barrels: 1, len: 1.0, thick: 0.22, top: "cap" },
  lobber: { size: 1, ammo: "shell", barrels: 1, len: 0.5, thick: 0.4, top: "mouth" },
  torch: { size: 1, ammo: "flame", barrels: 1, len: 0.8, thick: 0.26, top: "cap" },
  coil: { size: 1, ammo: "beam", barrels: 0, len: 0, thick: 0, top: "orb" },
  duster: { size: 1, ammo: "toxin", barrels: 1, len: 0.7, thick: 0.3, top: "orb" },
  autocannon: { size: 2, ammo: "bullet", barrels: 3, len: 1.0, thick: 0.12, top: "cap" },
  airburst: { size: 2, ammo: "missile", barrels: 2, len: 0.7, thick: 0.18, top: "cap", square: true },
  piercer: { size: 2, ammo: "beam", barrels: 1, len: 1.1, thick: 0.22, top: "orb" },
  douser: { size: 2, ammo: "water", barrels: 1, len: 0.9, thick: 0.24, top: "cap" },
  tether: { size: 2, ammo: "field", barrels: 0, len: 0, thick: 0, top: "dish" },
  hive: { size: 2, ammo: "missile", barrels: 4, len: 0.3, thick: 0.14, top: "none", square: true },
  blighter: { size: 2, ammo: "toxin", barrels: 2, len: 0.7, thick: 0.16, top: "orb" },
  cleaver: { size: 3, ammo: "flame", barrels: 2, len: 0.9, thick: 0.14, top: "cap" },
  barrage: { size: 3, ammo: "shell", barrels: 1, len: 0.6, thick: 0.34, top: "mouth" },
  deluge: { size: 3, ammo: "water", barrels: 1, len: 1.0, thick: 0.2, top: "cap" },
  whirl: { size: 3, ammo: "missile", barrels: 4, len: 0.5, thick: 0.12, top: "dish", square: true },
  drifter: { size: 3, ammo: "toxin", barrels: 3, len: 0.6, thick: 0.12, top: "orb" },
  repeater: { size: 4, ammo: "bullet", barrels: 2, len: 1.2, thick: 0.12, top: "cap" },
  furnace: { size: 4, ammo: "beam", barrels: 1, len: 1.1, thick: 0.2, top: "orb" },
  railhead: { size: 4, ammo: "shell", barrels: 1, len: 1.5, thick: 0.14, top: "dish" },
  stinger: { size: 4, ammo: "toxin", barrels: 1, len: 1.2, thick: 0.1, top: "spike" },
};
export const GUN_KINDS = Object.keys(GUNS);
/** how much wider than its footprint a gun's picture is, so a barrel pointing out is not cut */
export const GUN_REACH = 1.6;

export function gunSprite(kind: string, facing: number): Pic {
  const g = GUNS[kind] ?? GUNS.tacker;
  const n = g.size * SPRITE_PX, W = Math.round(n * GUN_REACH);
  const P = new Pen(W, W);
  const c = (W - 1) / 2, r = Math.max(3, Math.round(n * 0.36));
  const a = (facing * Math.PI) / 4;
  const dx = Math.cos(a), dy = Math.sin(a), nx = -dy, ny = dx;
  const col = AMMO_COL[g.ammo];
  // the barrels, under the body so their roots are hidden
  const t = Math.max(2, Math.round(n * g.thick));
  const span = (g.barrels - 1) * (t + 1);
  for (let i = 0; i < g.barrels; i++) {
    const o = -span / 2 + i * (t + 1);
    const L = r * (1 + g.len);
    const x0 = c + nx * o, y0 = c + ny * o;
    P.line(x0, y0, x0 + dx * L, y0 + dy * L, t, COL.iron);
    // the muzzle in the ammo's colour
    P.ellipse(x0 + dx * L, y0 + dy * L, (t - 1) / 2, (t - 1) / 2, col);
  }
  // the body
  if (g.square) P.rect(c - r, c - r, c + r + 1, c + r + 1, col, 0.3);
  else P.ellipse(c, c, r, r, col, 0.3);
  // what sits on it
  const rr = Math.max(1, Math.round(r * 0.45));
  switch (g.top) {
    case "cap": P.ellipse(c, c, rr, rr, COL.steel); break;
    case "mouth": P.ellipse(c + dx * r * 0.35, c + dy * r * 0.35, rr + 1, rr + 1, COL.iron); P.ellipse(c + dx * r * 0.35, c + dy * r * 0.35, rr - 1, rr - 1, INK); break;
    case "orb": P.ellipse(c, c, rr + 1, rr + 1, lift(col)); P.put(c - 1, c - 1, COL.eye); break;
    case "dish": P.ellipse(c, c, rr + 2, rr + 2, COL.steel, 0.4); P.ellipse(c, c, 1, 1, col); break;
    case "spike": P.tri([c - r * 0.5, c - r * 0.5], [c + r * 0.5, c - r * 0.5], [c, c - r * 1.3], COL.steel); break;
  }
  P.outline();
  return P.pic(c);
}

/** the pad a gun stands on: a square slab with its front band */
export function padSprite(size: number): Pic {
  const n = size * SPRITE_PX;
  const P = new Pen(n, n);
  P.rect(1, 1, n - 1, n - 1, COL.stone, 0.25);
  P.outline();
  return P.pic(n / 2);
}

// ── enemies: a blob with eyes, the same at every tier ──────────────────
export type Family = "rhino" | "stag" | "frog" | "bat" | "hull";
export const FAMILY_OF: Record<string, Family> = {
  ironhide: "rhino", starhart: "stag", dartback: "frog", stoop: "bat", tusker: "rhino", ratking: "rhino", grapnel: "frog", kettle: "bat", whale: "hull", skate: "hull", livewire: "hull",
};
/** the picture is n wide and taller by this, for ears and antlers */
export const UNIT_ASPECT = 1.4;
/** the body's centre sits this far down the picture */
export const UNIT_ANCHOR = 0.62;

/** facing 0 is east; 2 south (toward the camera); 4 west; 6 north (away).
 *  A chibi: a big head on a small body, big eyes and a mouth, two feet,
 *  and one or two species marks — the same drawing at every tier, the
 *  tier only growing the marks. */
export function unitSprite(fam: Family, n: number, tier: number, facing: number): Pic {
  const W = n, H = Math.round(n * UNIT_ASPECT);
  const P = new Pen(W, H);
  const cx = (W - 1) / 2;
  const south = facing >= 1 && facing <= 3, north = facing >= 5 && facing <= 7;
  const side = facing % 2 === 0 ? facing === 0 || facing === 4 : true;
  const flip = facing >= 3 && facing <= 5 && side;
  // the sizes: head radius, body, feet, eye
  const hr = n * 0.4, hy = H * 0.5, br = n * 0.28, by = H * 0.78, e = n >= 28 ? 3 : n >= 18 ? 2 : 1;
  const base = fam === "rhino" ? COL.rhino : fam === "stag" ? COL.stag : fam === "frog" ? COL.frog : fam === "bat" ? COL.bat : COL.hull;
  const belly = lift(base);
  // the eyes: white with a pupil and a glint, set toward the way it looks
  const eye = (x: number, y: number): void => {
    P.rect(x, y, x + e + 1, y + e + 1, COL.eye);
    P.rect(x + (side ? 1 : 0) + (e > 1 ? 1 : 0), y + (e > 1 ? 1 : 0) + (south ? 0 : 0), x + (side ? 1 : 0) + (e > 1 ? 1 : 0) + Math.max(1, e - 1), y + (e > 1 ? 1 : 0) + Math.max(1, e - 1), INK);
    if (e > 1) P.put(x + 1, y + 1, COL.eye);
  };
  const face = (fx: number, fy: number): void => {
    if (north) return;
    const gap = side ? hr * 0.25 : hr * 0.4;
    if (side) { eye(fx + hr * 0.35, fy - e); eye(fx + hr * 0.35 - gap - e, fy - e); }
    else { eye(fx - gap - e, fy - e); eye(fx + gap - 1, fy - e); }
    // the mouth
    const mw = Math.max(2, Math.round(hr * 0.35));
    const mx = side ? fx + hr * 0.3 : fx - mw / 2;
    P.rect(mx, fy + e + 2, mx + mw, fy + e + 3, shade(base));
    if (n >= 18) { P.put(mx - 1, fy + e + 1, shade(base)); P.put(mx + mw, fy + e + 1, shade(base)); }
  };
  // feet, then body, then head, then the marks, then the face
  const f = Math.max(1, Math.round(n * 0.1));
  P.rect(cx - br * 0.6 - f, by + br * 0.5, cx - br * 0.6 + f, by + br * 0.5 + f + 1, shade(base));
  P.rect(cx + br * 0.6 - f, by + br * 0.5, cx + br * 0.6 + f, by + br * 0.5 + f + 1, shade(base));
  P.ellipse(cx, by, br, br * 0.8, base, 0.35);
  if (!north) P.ellipse(cx, by + br * 0.1, br * 0.55, br * 0.45, belly);
  switch (fam) {
    case "rhino": {
      P.ellipse(cx, hy, hr, hr * 0.9, base, 0.25);
      // ears up, the horn on the snout toward the way it faces
      const es = Math.max(2, Math.round(n * 0.12));
      P.ellipse(cx - hr * 0.6, hy - hr * 0.8, es, es, base); P.ellipse(cx + hr * 0.6, hy - hr * 0.8, es, es, base);
      const hs = Math.max(2, Math.round(n * (0.16 + tier * 0.03)));
      if (south && !side) P.tri([cx - hs * 0.5, hy + hr * 0.45], [cx + hs * 0.5, hy + hr * 0.45], [cx, hy + hr * 0.45 + hs * 1.3], COL.horn);
      else if (!north) P.tri([cx + hr * 0.9, hy + hr * 0.25], [cx + hr * 0.9, hy + hr * 0.25 - hs * 0.8], [cx + hr * 0.9 + hs * 1.1, hy + hr * 0.1], COL.horn);
      if (tier >= 3) P.rect(cx - hr * 0.5, hy - hr * 0.95, cx + hr * 0.5, hy - hr * 0.95 + Math.max(1, Math.round(n * 0.08)), shade(base));
      face(cx, hy);
      break;
    }
    case "stag": {
      P.ellipse(cx, hy, hr * 0.95, hr * 0.85, base, 0.25);
      if (!north) P.ellipse(cx + (side ? hr * 0.4 : 0), hy + hr * 0.35, hr * 0.4, hr * 0.3, belly);
      const ah = Math.round(n * (0.25 + tier * 0.06)), aw = Math.max(1, Math.round(n * 0.08));
      for (const s of [-1, 1]) {
        const ax = cx + s * hr * 0.5;
        P.rect(ax - aw / 2, hy - hr * 0.8 - ah, ax + aw / 2 + 1, hy - hr * 0.6, COL.antler);
        if (tier >= 2) P.rect(s < 0 ? ax - aw * 2 : ax, hy - hr * 0.8 - ah + ah * 0.4, s < 0 ? ax + 1 : ax + aw * 2 + 1, hy - hr * 0.8 - ah + ah * 0.4 + aw, COL.antler);
        if (tier >= 4) P.rect(s < 0 ? ax - aw * 2 : ax, hy - hr * 0.8 - ah + ah * 0.75, s < 0 ? ax + 1 : ax + aw * 2 + 1, hy - hr * 0.8 - ah + ah * 0.75 + aw, COL.antler);
      }
      face(cx, hy);
      break;
    }
    case "frog": {
      P.ellipse(cx, hy + hr * 0.1, hr * 1.05, hr * 0.8, base, 0.3);
      // the eyes are bumps on top of the head, and the mouth is wide
      const er = Math.max(1, Math.round(n * 0.14));
      for (const s of [-1, 1]) {
        const ex = cx + s * hr * 0.55, ey = hy - hr * 0.7;
        P.ellipse(ex, ey, er, er, base);
        P.ellipse(ex, ey, er - (n >= 18 ? 1 : 0), er - (n >= 18 ? 1 : 0), COL.eye);
        if (!north) P.rect(ex + (side ? 1 : 0) - (e > 1 ? 1 : 0), ey + (south ? 1 : 0) - (e > 1 ? 1 : 0), ex + (side ? 1 : 0) + Math.max(1, e - 1), ey + (south ? 1 : 0) + Math.max(1, e - 1), INK);
      }
      if (!north) { const mw = Math.round(hr * 0.9); P.rect(cx - mw / 2 + (side ? hr * 0.3 : 0), hy + hr * 0.45, cx + mw / 2 + (side ? hr * 0.3 : 0), hy + hr * 0.45 + 1, shade(base)); }
      if (tier >= 2) P.rect(cx - hr * 0.6, hy - hr * 0.25, cx + hr * 0.6, hy - hr * 0.25 + Math.max(1, Math.round(n * 0.08)), COL.toxin);
      break;
    }
    case "bat": {
      // wings behind, two triangles out from the body
      const ws = n * 0.45;
      P.tri([cx - br * 0.4, by - br * 0.4], [cx - br - ws, by - br * 1.1], [cx - br - ws * 0.6, by + br * 0.5], shade(base));
      P.tri([cx + br * 0.4, by - br * 0.4], [cx + br + ws, by - br * 1.1], [cx + br + ws * 0.6, by + br * 0.5], shade(base));
      P.ellipse(cx, hy, hr, hr * 0.9, base, 0.25);
      const es = Math.max(2, Math.round(n * 0.18));
      P.tri([cx - hr * 0.7, hy - hr * 0.5], [cx - hr * 0.15, hy - hr * 0.7], [cx - hr * 0.6, hy - hr * 0.8 - es], base);
      P.tri([cx + hr * 0.15, hy - hr * 0.7], [cx + hr * 0.7, hy - hr * 0.5], [cx + hr * 0.6, hy - hr * 0.8 - es], base);
      face(cx, hy);
      if (!north && n >= 18) { P.put(cx - 1, hy + e + 3, COL.eye); P.put(cx + 1, hy + e + 3, COL.eye); }
      break;
    }
    case "hull": {
      P.ellipse(cx, hy, hr, hr * 0.8, base, 0.3);
      P.tri([cx - hr * 0.25, hy - hr * 0.6], [cx + hr * 0.25, hy - hr * 0.6], [cx, hy - hr * 0.8 - n * 0.18], shade(base));
      face(cx, hy);
      break;
    }
  }
  P.outline();
  if (flip) P.flipX();
  return P.pic(by);
}

// ── the core: a round keep with a brazier ──────────────────────────────
export function coreSprite(): Pic {
  const n = 10 * SPRITE_PX;
  const P = new Pen(n, n);
  const c = (n - 1) / 2;
  P.rect(4, 4, n - 4, n - 4, COL.slate, 0.2);
  P.ellipse(c, c, n * 0.36, n * 0.36, COL.slateLit, 0.3);
  P.ellipse(c, c, n * 0.2, n * 0.2, COL.slate, 0.3);
  P.ellipse(c, c, n * 0.13, n * 0.13, COL.amber);
  P.ellipse(c, c - 2, n * 0.07, n * 0.09, COL.flame);
  P.ellipse(c, c - 3, n * 0.03, n * 0.05, COL.flameLit);
  for (const [x, y] of [[10, 10], [n - 16, 10], [10, n - 16], [n - 16, n - 16]]) { P.rect(x, y, x + 6, y + 6, COL.wood, 0.4); P.rect(x + 1, y + 1, x + 5, y + 3, COL.amber); }
  P.outline();
  return P.pic(c);
}

// ── props ──────────────────────────────────────────────────────────────
export type PropShape = "tree" | "palm" | "rock" | "bush" | "crate" | "cactus" | "crystal";
export function propSprite(shape: PropShape, n: number): Pic {
  const W = n, H = Math.round(n * 1.5);
  const P = new Pen(W, H);
  const cx = (W - 1) / 2, gy = H * 0.8;
  switch (shape) {
    case "palm": {
      const th = Math.max(2, Math.round(n * 0.12));
      P.line(cx, gy, cx + n * 0.15, gy - n * 0.9, th, COL.trunk);
      const tx = cx + n * 0.15, ty = gy - n * 0.9;
      for (let k = 0; k < 5; k++) { const a = Math.PI + (k / 4) * Math.PI; P.ellipse(tx + Math.cos(a) * n * 0.32, ty + Math.sin(a) * n * 0.12 + n * 0.08, n * 0.22, n * 0.1, k % 2 ? COL.leafLit : COL.leaf, 0.4); }
      break;
    }
    case "tree": {
      P.rect(cx - n * 0.1, gy - n * 0.4, cx + n * 0.1 + 1, gy + 1, COL.trunk, 0.3);
      P.ellipse(cx, gy - n * 0.75, n * 0.46, n * 0.42, COL.leaf, 0.35);
      P.ellipse(cx - n * 0.15, gy - n * 0.95, n * 0.2, n * 0.14, COL.leafLit);
      break;
    }
    case "bush": P.ellipse(cx, gy - n * 0.3, n * 0.44, n * 0.3, COL.bush, 0.4); P.ellipse(cx - n * 0.15, gy - n * 0.42, n * 0.16, n * 0.1, COL.leafLit); break;
    case "rock": P.ellipse(cx, gy - n * 0.3, n * 0.44, n * 0.32, COL.rock, 0.45); break;
    case "cactus": P.rect(cx - n * 0.12, gy - n * 1.0, cx + n * 0.12 + 1, gy + 1, COL.bush, 0.25); P.rect(cx - n * 0.4, gy - n * 0.7, cx - n * 0.12, gy - n * 0.5, COL.bush, 0.3); P.rect(cx - n * 0.4, gy - n * 0.9, cx - n * 0.2, gy - n * 0.7, COL.bush, 0.3); break;
    case "crystal": P.tri([cx - n * 0.3, gy], [cx + n * 0.3, gy], [cx, gy - n * 1.0], COL.crystal); P.tri([cx - n * 0.1, gy], [cx + n * 0.3, gy], [cx + 0.1, gy - n * 0.9], shade(COL.crystal)); break;
    default: P.rect(cx - n * 0.35, gy - n * 0.6, cx + n * 0.35 + 1, gy + 1, COL.wood, 0.35);
  }
  P.outline();
  return P.pic(gy);
}
export function propShapeOf(id: string): PropShape {
  if (/palm|mangrove|jungle/.test(id)) return "palm";
  if (/canopy|tree|pine|fungus|mushroom/.test(id)) return "tree";
  if (/cactus/.test(id)) return "cactus";
  if (/crystal|quartz|shard/.test(id)) return "crystal";
  if (/shrub|reeds|bush|scrub|fern|grass|tuft|moss|coral|kelp|lily|pod|stalk|flow/.test(id)) return "bush";
  if (/boulder|rock|stone|slab|mesa|basalt|ice|shell|bleached|column|stump|log|drift/.test(id)) return "rock";
  return "crate";
}

/** the picture laid into a cell `cw` x `ch`, its ground row at `anchor` of the height, centred across */
export function framed(r: Pic, cw: number, ch: number, anchor: number): Ink[] {
  const px: Ink[] = new Array<Ink>(cw * ch).fill(null);
  const ox = Math.round((cw - r.w) / 2), oy = Math.round(ch * anchor - r.ground);
  for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) {
    const X = x + ox, Y = y + oy;
    if (X >= 0 && Y >= 0 && X < cw && Y < ch) px[Y * cw + X] = r.px[y * r.w + x];
  }
  return px;
}
/** the picture at k px a pixel (k may be fractional) */
export function scaled(r: Pic, k: number): Pic {
  const W = Math.round(r.w * k), H = Math.round(r.h * k);
  const px: Ink[] = new Array<Ink>(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) px[y * W + x] = r.px[Math.min(r.h - 1, Math.floor(y / k)) * r.w + Math.min(r.w - 1, Math.floor(x / k))];
  return { w: W, h: H, px, ground: r.ground * k };
}
