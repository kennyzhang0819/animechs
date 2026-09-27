// THE PROPS — the things that stand on the ground and stop the swarm:
// 1x1 to 6x6 tiles, painted here in code at 32 px a tile the way the
// floors are (tiles.ts). See docs/props.md for the system: the footprint
// rule, the reach past it, the tones, how a map is decorated.
//
// A NATURE prop is painted in FOUR GREYS and tinted at draw time by its
// tone (PROP_TONES), so one painting is a pine, a mangrove or a snow tree
// and a boulder wears whichever rock family it lies against. A MADE prop
// carries its own paint — steel, rust, concrete — and its tone is a
// weathering tint that nudges it toward the ground it has been lying on.

import { ellipse, hex, INK, mix, mulberry32, WALL_KINDS, WALL_STYLE, type WallKind } from "./tiles";
import { LINOCUT_TERRAIN } from "./terrainFlag";

export type PropTiles = 1 | 2 | 3 | 4 | 6 | 10;
/** px a tile, the floors' own grid */
export const PROP_PX = 32;

// the four greys a tinted prop is painted in: multiplied by the tone
const LIGHT = "#ffffff", MID = "#d2d2d2", DARK = "#9e9e9e", DEEP = "#6c6c6c";

// the made props' paint
const STEEL = { hi: "#9aa3aa", mid: "#6e777e", lo: "#4a5158", deep: "#2c3035" } as const;
const RUST = { hi: "#b86a3f", mid: "#8f4f2e", lo: "#673621" } as const;
const CONCRETE = { hi: "#b3aea3", mid: "#938e84", lo: "#6d6960", deep: "#4a4741" } as const;
const CRATE = { hi: "#8d895f", mid: "#6e6a49", lo: "#4f4c34" } as const;
const GLASS = "#3b4a55", GLINT = "#c7d6df", HAZARD = "#b8983a", EYE = "#8a7030", SCORCH = "#33302d", SPILL = "#2b2d2f";

const leaf = (c: string): string => (LINOCUT_TERRAIN ? mix(c, INK.canopy, 0.3) : c);

export interface PropTone {
  id: string;
  label: string;
  hex: string;
}
/**
 * THE TONES, indexed by a prop's `tone`. APPEND ONLY: the index is written
 * into every map document that carries a prop. The rock tones are one per
 * wall family in WALL_KINDS order, from ROCK_TONE0 on.
 */
export const PROP_TONES: readonly PropTone[] = [
  { id: "pine", label: "Pine", hex: leaf("#7dbd68") },
  { id: "mangrove", label: "Mangrove", hex: leaf("#b3ad62") },
  { id: "frost", label: "Frost", hex: "#f2f5f8" },
  { id: "scrub", label: "Scrub", hex: leaf("#c4b979") },
  { id: "ash", label: "Ash", hex: "#8c7e78" },
  { id: "bark", label: "Bark", hex: "#a8805a" },
  { id: "plain", label: "Plain", hex: "#ffffff" },
  { id: "dust", label: "Dusted", hex: "#f2e6d0" },
  { id: "rime", label: "Rimed", hex: "#e2ebf4" },
  { id: "soot", label: "Sooted", hex: "#b5aeaa" },
  { id: "film", label: "Mossed", hex: "#dbe2c7" },
  { id: "ochre", label: "Ochre dust", hex: "#efd8c2" },
  ...WALL_KINDS.map((k) => ({ id: `rock-${k}`, label: `${k} rock`, hex: mix(WALL_STYLE[k].face, WALL_STYLE[k].light, 0.6) })),
  // the biomes' own tones (BIOME_PROPS), after the rock tones so ROCK_TONE0 holds
  { id: "cactus", label: "Cactus", hex: leaf("#8fae6a") },
  { id: "ice", label: "Ice", hex: "#d6e4f2" },
  { id: "mesa", label: "Mesa", hex: "#c9865a" },
  { id: "basalt", label: "Basalt", hex: "#5a5356" },
  { id: "coral-red", label: "Red coral", hex: "#e05a48" },
  { id: "coral-orange", label: "Orange coral", hex: "#e8903a" },
  { id: "coral-yellow", label: "Yellow coral", hex: "#e6c84a" },
  { id: "coral-purple", label: "Purple coral", hex: "#a86bb8" },
  { id: "jungle", label: "Jungle", hex: leaf("#4f9a4a") },
  { id: "cap", label: "Cap", hex: "#b898c4" },
  { id: "crystal", label: "Crystal", hex: "#b6c3ef" },
  { id: "bleached", label: "Bleached", hex: "#d8c9a4" },
  { id: "shell", label: "Shell", hex: "#e8dcc6" },
  { id: "pod", label: "Pod", hex: "#9fb87a" },
];
export const TONE = {
  pine: 0, mangrove: 1, frost: 2, scrub: 3, ash: 4, bark: 5,
  plain: 6, dust: 7, rime: 8, soot: 9, film: 10, ochre: 11,
} as const;
export const ROCK_TONE0 = 12;
export const rockTone = (k: WallKind): number => ROCK_TONE0 + WALL_KINDS.indexOf(k);
const FTONE0 = ROCK_TONE0 + WALL_KINDS.length;
/** the biomes' tones, by index (see PROP_TONES) */
export const FTONE = {
  cactus: FTONE0, ice: FTONE0 + 1, mesa: FTONE0 + 2, basalt: FTONE0 + 3,
  coralRed: FTONE0 + 4, coralOrange: FTONE0 + 5, coralYellow: FTONE0 + 6, coralPurple: FTONE0 + 7,
  jungle: FTONE0 + 8, cap: FTONE0 + 9, crystal: FTONE0 + 10, bleached: FTONE0 + 11, shell: FTONE0 + 12, pod: FTONE0 + 13,
} as const;
const LEAF_TONES = [TONE.pine, TONE.mangrove, TONE.frost, TONE.scrub, TONE.ash];
const WOOD_TONES = [TONE.bark, TONE.ash];
const WEATHER_TONES = [TONE.plain, TONE.dust, TONE.rime, TONE.soot, TONE.film, TONE.ochre];
const ROCK_TONES = WALL_KINDS.map((_, i) => ROCK_TONE0 + i);

/** a tone as the renderer multiplies it in, 0..1 a channel */
export const PROP_TINT: readonly (readonly [number, number, number])[] = PROP_TONES.map((t) => {
  const [r, g, b] = hex(t.hex);
  return [r / 255, g / 255, b / 255] as const;
});

// ---------- the painter ----------

type Col = string;
type Pt = readonly [number, number];

class Sheet {
  readonly px: (Col | null)[];
  constructor(readonly n: number) {
    this.px = new Array<Col | null>(n * n).fill(null);
  }
  at(x: number, y: number): Col | null {
    return x >= 0 && y >= 0 && x < this.n && y < this.n ? this.px[y * this.n + x] : null;
  }
  put(x: number, y: number, c: Col | null): void {
    if (c !== null && x >= 0 && y >= 0 && x < this.n && y < this.n) this.px[y * this.n + x] = c;
  }
  disc(cx: number, cy: number, rx: number, ry: number, c: Col | ((x: number, y: number, u: number, v: number) => Col | null)): void {
    ellipse(cx, cy, rx, ry, (x, y, u, v) => this.put(x, y, typeof c === "string" ? c : c(x, y, u, v)));
  }
  rect(x0: number, y0: number, w: number, h: number, c: Col): void {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) this.put(x, y, c);
  }
  /** even-odd scanline fill, tested at pixel centres */
  poly(pts: readonly Pt[], c: Col | ((x: number, y: number) => Col | null)): void {
    let y0 = Infinity, y1 = -Infinity;
    for (const [, y] of pts) { y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    for (let y = Math.max(0, Math.floor(y0)); y <= Math.min(this.n - 1, Math.ceil(y1)); y++) {
      const sy = y + 0.5, xs: number[] = [];
      for (let i = 0; i < pts.length; i++) {
        const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length];
        if (ay === by || sy < Math.min(ay, by) || sy >= Math.max(ay, by)) continue;
        xs.push(ax + ((sy - ay) * (bx - ax)) / (by - ay));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2)
        for (let x = Math.ceil(xs[k] - 0.5); x < xs[k + 1] - 0.5; x++)
          this.put(x, y, typeof c === "string" ? c : c(x, y));
    }
  }
  /** a thick segment: the quad `w` wide from a to b */
  bar(a: Pt, b: Pt, w: number, c: Col | ((x: number, y: number) => Col | null)): void {
    const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
    const nx = (-dy / l) * (w / 2), ny = (dx / l) * (w / 2);
    this.poly([[a[0] + nx, a[1] + ny], [b[0] + nx, b[1] + ny], [b[0] - nx, b[1] - ny], [a[0] - nx, a[1] - ny]], c);
  }
  /** a rectangle `w` x `h` centred on (cx, cy), turned by `ang` */
  box(cx: number, cy: number, w: number, h: number, ang: number, c: Col | ((x: number, y: number) => Col | null)): void {
    const ca = Math.cos(ang), sa = Math.sin(ang);
    const p = (u: number, v: number): Pt => [cx + u * ca - v * sa, cy + u * sa + v * ca];
    this.poly([p(-w / 2, -h / 2), p(w / 2, -h / 2), p(w / 2, h / 2), p(-w / 2, h / 2)], c);
  }
  ring(cx: number, cy: number, r: number, t: number, c: Col): void {
    ellipse(cx, cy, r, r, (x, y, u, v) => { if (u * u + v * v >= ((r - t) / r) ** 2) this.put(x, y, c); });
  }
  /** an ellipse turned by `ang`, as a 48-gon */
  oval(cx: number, cy: number, rx: number, ry: number, ang: number, c: Col): void {
    const pts: Pt[] = [];
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2, u = Math.cos(a) * rx, v = Math.sin(a) * ry;
      pts.push([cx + u * Math.cos(ang) - v * Math.sin(ang), cy + u * Math.sin(ang) + v * Math.cos(ang)]);
    }
    this.poly(pts, c);
  }
}

/**
 * THE SHADING OF A TINTED PIECE — the hills' rule (tiles.ts paintWall): the
 * top-right of a shape is light, the bottom-left dark, a band of mid between,
 * the two boundaries wandering. `r` is the piece's reach, so a small stone
 * and a big canopy split in the same proportions.
 */
const bands = (rng: () => number, cx: number, cy: number, r: number, lit = 0.22, dark = -0.22) => {
  const w1 = rng() * 6.28, w2 = rng() * 6.28;
  return (x: number, y: number): Col => {
    const t = ((x + 0.5 - cx) - (y + 0.5 - cy)) / (2 * r);
    const along = (x + y) / (2 * r);
    const v = t + 0.07 * Math.sin(along * 6.3 + w1) + 0.05 * Math.sin(along * 15.7 + w2);
    return v > lit ? LIGHT : v < dark ? DARK : MID;
  };
};

/** a canopy: a ring of lobes round a crown, shaded as one shape, a lit
 *  cluster on its bright side, a few dark gaps on its shaded side and a
 *  trunk at the heart */
function canopy(s: Sheet, rng: () => number, cx: number, cy: number, R: number, lobes: number, inner = 0, trunk = true): void {
  const shade = bands(rng, cx, cy, R * 0.95, 0.2, -0.2);
  const a0 = rng() * 6.28;
  const lobe = (x: number, y: number, r: number, c: Col | ((x: number, y: number) => Col) = shade): void => s.disc(x, y, r, r, c);
  for (let i = 0; i < lobes; i++) {
    const b = a0 + (i / lobes) * 6.28;
    lobe(cx + Math.cos(b) * R * 0.56, cy + Math.sin(b) * R * 0.56, R * 0.44);
  }
  for (let i = 0; i < inner; i++) {
    const b = a0 + 0.35 + (i / inner) * 6.28;
    lobe(cx + Math.cos(b) * R * 0.3, cy + Math.sin(b) * R * 0.3, R * 0.36);
  }
  lobe(cx, cy, R * 0.58);
  // the lit cluster, up and to the right, and the gaps down and to the left
  for (let i = 0; i < 2; i++) {
    const b = -0.79 + (i - 0.5) * 0.7 + (rng() - 0.5) * 0.3, d = R * (0.3 + rng() * 0.2);
    lobe(cx + Math.cos(b) * d, cy + Math.sin(b) * d, R * (0.2 + rng() * 0.08), LIGHT);
  }
  const gaps = R >= 36 ? 4 : 3;
  for (let i = 0; i < gaps; i++) {
    const b = 2.36 + (i - (gaps - 1) / 2) * 0.75 + (rng() - 0.5) * 0.3, d = R * (0.42 + rng() * 0.2);
    const g = Math.max(2.2, R * 0.085);
    s.disc(cx + Math.cos(b) * d, cy + Math.sin(b) * d, g, g * 0.9, DEEP);
  }
  if (!trunk) return;
  const t = Math.max(2.2, R * 0.1);
  s.disc(cx, cy, t, t, DEEP);
}

// a shade below the body, for marks that are part of the stone rather than on it
const SOFT = "#b8b8b8";
/** a stone's three paintings: plain, one lit facet, hollows on its shaded side */
const STONE_VARIANTS = 3;

/** one stone: a rounded lump, shaded, seamed dark over any stone under it */
function stone(s: Sheet, rng: () => number, cx: number, cy: number, rx: number, ry: number, variant = 0): void {
  s.disc(cx, cy, rx + 3, ry + 3, (x, y) => (s.at(x, y) ? DEEP : null));
  const shade = bands(rng, cx, cy, Math.max(rx, ry), 0.24, -0.26);
  // a big stone is not an ellipse: a few lobes off its rim make it a lump
  const lobes = rx >= 20 ? 4 + ((rng() * 3) | 0) : 0;
  const a0 = rng() * 6.28;
  const inside: [number, number, number, number][] = [[cx, cy, rx, ry]];
  for (let i = 0; i < lobes; i++) {
    const b = a0 + (i / lobes) * 6.28 + (rng() - 0.5) * 0.5, r = rx * (0.3 + rng() * 0.15);
    const lx = cx + Math.cos(b) * (rx - r * 0.9), ly = cy + Math.sin(b) * (ry - r * 0.9);
    inside.push([lx, ly, r, r * 0.9]);
    s.disc(lx, ly, r, r * 0.9, shade);
  }
  s.disc(cx, cy, rx, ry, shade);
  if (rx < 14) return;
  const on = (x: number, y: number): boolean => inside.some(([ex, ey, er, fr]) => ((x + 0.5 - ex) / er) ** 2 + ((y + 0.5 - ey) / fr) ** 2 <= 1);
  const only = (c: Col) => (x: number, y: number): Col | null => (on(x, y) ? c : null);
  const big = rx >= 30;
  if (variant === 1) {
    // one flat face catching the light: a broad lobe a shade up, top-right
    const b = -0.79 + (rng() - 0.5) * 0.6, d = rx * 0.35;
    s.disc(cx + Math.cos(b) * d, cy + Math.sin(b) * d * (ry / rx), rx * 0.42, ry * 0.36, only(LIGHT));
  } else if (variant === 2) {
    // hollows on the shaded side, round and a shade down
    const n = big ? 3 : 2;
    for (let i = 0; i < n; i++) {
      const b = 2.36 + (i - (n - 1) / 2) * 0.8 + (rng() - 0.5) * 0.3, d = rx * (0.35 + rng() * 0.25);
      const r = Math.max(5, rx * (0.13 + rng() * 0.05));
      s.disc(cx + Math.cos(b) * d, cy + Math.sin(b) * d * (ry / rx), r, r * 0.9, only(SOFT));
    }
  }
}

/** a low clump of lobes, one shade split over the lot */
function clump(s: Sheet, rng: () => number, cx: number, cy: number, R: number, n: number): void {
  const shade = bands(rng, cx, cy, R, 0.18, -0.2);
  const a0 = rng() * 6.28;
  for (let i = 0; i < n; i++) {
    const b = a0 + (i / n) * 6.28 + (rng() - 0.5) * 0.4, d = R * (0.36 + rng() * 0.16);
    const r = R * (0.42 + rng() * 0.1);
    s.disc(cx + Math.cos(b) * d, cy + Math.sin(b) * d, r, r * 0.88, shade);
  }
  s.disc(cx, cy, R * 0.5, R * 0.46, shade);
}

/** a lily pad: a flat disc with a wedge cut to the middle, veins out from it */
function lilypad(s: Sheet, rng: () => number, cx: number, cy: number, r: number): void {
  const a = rng() * 6.28;
  const wedge = (x: number, y: number): boolean => {
    const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
    let d = Math.atan2(dy, dx) - a;
    while (d > Math.PI) d -= 6.28;
    while (d < -Math.PI) d += 6.28;
    return Math.abs(d) < 0.28 && Math.hypot(dx, dy) > r * 0.2;
  };
  s.disc(cx, cy, r, r, (x, y) => (wedge(x, y) ? null : MID));
  for (let k = 0; k < 7; k++) {
    const b = a + 0.5 + (k / 7) * (6.28 - 1);
    s.bar([cx, cy], [cx + Math.cos(b) * (r - 2), cy + Math.sin(b) * (r - 2)], r > 20 ? 2 : 1.4, (x, y) => (wedge(x, y) ? null : LIGHT));
  }
  s.disc(cx, cy, r > 20 ? 3 : 2, r > 20 ? 3 : 2, DARK);
}

/** a plated hull: the body, its lit and shaded crescents, its seams */
function plate(s: Sheet, cx: number, cy: number, rx: number, ry: number, hi: Col, mid: Col, lo: Col, lit = 0.45): void {
  s.disc(cx, cy, rx, ry, (_x, _y, u, v) => (u - v > lit ? hi : u - v < -lit - 0.15 ? lo : mid));
}

// ---------- the kinds ----------

export interface PropDef {
  id: string;
  label: string;
  tiles: PropTiles;
  /** how far the art reaches, in tiles: the footprint or a little past
   *  it, so a canopy spills over its square with no hitbox under the spill */
  reach: number;
  /** may it be set down at any quarter turn? A made thing may; a growing
   *  or lying thing keeps the one light every prop shares */
  turns: boolean;
  /** how many paintings it has. A kind that does not turn reads Prop.rot
   *  as which painting instead */
  variants: number;
  /** tinted: painted in greys, multiplied by the tone. Otherwise its own
   *  paint, and the tone is a weathering tint */
  tinted: boolean;
  /** the tones this kind may wear; the first is its default */
  tones: readonly number[];
  /** the corner map's colour for a made prop (a tinted one reads its tone) */
  mini?: string;
  /** a biome's own kind: drawn from that biome's slot on the sheet (atlas.ts FAMILY_SETS), not a cell of its own */
  family?: { biome: string; slot: string };
  paint: (s: Sheet, rng: () => number, variant: number) => void;
}

const nature = (id: string, label: string, tiles: PropTiles, reach: number, tones: readonly number[], paint: PropDef["paint"], variants = 1): PropDef =>
  ({ id, label, tiles, reach, turns: false, variants, tinted: true, tones, paint });
const made = (id: string, label: string, tiles: PropTiles, mini: string, paint: PropDef["paint"]): PropDef =>
  ({ id, label, tiles, reach: tiles, turns: true, variants: 1, tinted: false, tones: WEATHER_TONES, mini, paint });

// ---------- the biomes' families (docs/props.md, "The roster") ----------
// One silhouette under one shading: pieces go into a mask and the mask's
// union gets the bands, so nothing is drawn inside the outline but the one
// mark a painting may carry. No shadow: the renderer casts the prop's.

const SOFT_MARK = "#b8b8b8";
type Draw = (m: Sheet) => void;
function union(s: Sheet, rng: () => number, cx: number, cy: number, R: number, draw: Draw, litAt = 0.2, darkAt = -0.24): Sheet {
  const m = new Sheet(s.n);
  draw(m);
  const shade = bands(rng, cx, cy, R, litAt, darkAt);
  for (let y = 0; y < s.n; y++) for (let x = 0; x < s.n; x++) if (m.at(x, y)) s.put(x, y, shade(x, y));
  return m;
}
/** the one mark, clipped to the shape: 1 a face catching the light up-right, 2 hollows a shade down on the shaded side */
function mark(s: Sheet, m: Sheet, rng: () => number, v: number, cx: number, cy: number, R: number): void {
  const only = (c: Col) => (x: number, y: number): Col | null => (m.at(x, y) ? c : null);
  if (v === 1) {
    const b = -0.79 + (rng() - 0.5) * 0.6, d = R * 0.38;
    s.disc(cx + Math.cos(b) * d, cy + Math.sin(b) * d, R * 0.4, R * 0.34, only(LIGHT));
  } else if (v === 2) {
    const n = R >= 60 ? 3 : 2;
    for (let i = 0; i < n; i++) {
      const b = 2.36 + (i - (n - 1) / 2) * 0.8 + (rng() - 0.5) * 0.3, d = R * (0.35 + rng() * 0.25), r = Math.max(5, R * (0.13 + rng() * 0.05));
      s.disc(cx + Math.cos(b) * d, cy + Math.sin(b) * d, r, r * 0.9, only(SOFT_MARK));
    }
  }
}
const lumpy = (rng: () => number, cx: number, cy: number, r: number, squash: number, n: number, wobble: number): Pt[] => {
  const pts: Pt[] = [], a0 = rng() * 6.28;
  for (let i = 0; i < n; i++) { const a = a0 + (i / n) * 6.28, rr = r * (1 - wobble + rng() * wobble * 2); pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * squash]); }
  return pts;
};
const hexagon = (rng: () => number, cx: number, cy: number, r: number, ang: number): Pt[] => {
  const v: Pt[] = [];
  for (let k = 0; k < 6; k++) { const a = ang + (k / 6) * 6.28, rr = r * (0.88 + rng() * 0.24); v.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]); }
  return v;
};
const shard = (cx: number, cy: number, a: number, L: number, W: number): Pt[] => {
  const ux = Math.cos(a), uy = Math.sin(a), nx = -uy, ny = ux, p = (d: number, w: number): Pt => [cx + ux * d + nx * w, cy + uy * d + ny * w];
  return [p(L * 0.1, -W / 2), p(L * 0.78, -W / 2), p(L, -W * 0.08), p(L, W * 0.08), p(L * 0.78, W / 2), p(L * 0.1, W / 2), p(0, 0)];
};
const slab = (cx: number, cy: number, L: number, W: number, ang: number): Pt[] => {
  const ca = Math.cos(ang), sa = Math.sin(ang), p = (u: number, q: number): Pt => [cx + u * ca - q * sa, cy + u * sa + q * ca];
  return [p(-L / 2, 0), p(-L / 4, -W / 2), p(L / 4, -W / 2), p(L / 2, 0), p(L / 4, W / 2), p(-L / 4, W / 2)];
};
const leafPts = (cx: number, cy: number, len: number, wid: number, ang: number): Pt[] => {
  const pts: Pt[] = [];
  for (let i = 0; i < 28; i++) { const t = (i / 28) * 6.28, u = Math.cos(t) * len, v = Math.sin(t) * wid * (0.75 + 0.25 * Math.cos(t + 0.6)); pts.push([cx + u * Math.cos(ang) - v * Math.sin(ang), cy + u * Math.sin(ang) + v * Math.cos(ang)]); }
  return pts;
};
const teardrop = (c: number, R: number, a: number): Pt[] => {
  const pts: Pt[] = [];
  for (let i = 0; i < 28; i++) { const t = (i / 28) * 6.28, r = R * 0.68 + R * 0.32 * Math.max(0, Math.cos(t - a)) ** 3; pts.push([c + Math.cos(t) * r, c + Math.sin(t) * r]); }
  return pts;
};
function branches(m: Sheet, rng: () => number, cx: number, cy: number, R: number, arms: number, w: number): void {
  m.disc(cx, cy, w * 0.9, w * 0.9, MID);
  const a0 = rng() * 6.28;
  const grow = (x: number, y: number, a: number, l: number, depth: number): void => {
    const x1 = x + Math.cos(a) * l, y1 = y + Math.sin(a) * l;
    m.bar([x, y], [x1, y1], w, MID);
    m.disc(x1, y1, w / 2, w / 2, MID);
    if (depth === 0) return;
    grow(x1, y1, a + 0.55 + rng() * 0.2, l * 0.65, depth - 1);
    if (rng() < 0.8) grow(x1, y1, a - 0.55 - rng() * 0.2, l * 0.6, depth - 1);
  };
  for (let i = 0; i < arms; i++) grow(cx, cy, a0 + (i / arms) * 6.28 + (rng() - 0.5) * 0.4, R * (0.4 + rng() * 0.12), 2);
}
const logShape = (m: Sheet, rng: () => number, c: number, R: number, flare: boolean): void => {
  const a = -0.5 + rng(), w = R * 0.42, l = R * 0.9, p = (t: number, q: number): Pt => [c + Math.cos(a) * t - Math.sin(a) * q, c + Math.sin(a) * t + Math.cos(a) * q];
  m.bar(p(-l, 0), p(l, 0), w, MID);
  const [ax, ay] = p(-l, 0), [bx, by] = p(l, 0);
  m.disc(ax, ay, w / 2, w / 2, MID);
  m.disc(bx, by, w / 2, w / 2, MID);
  if (flare) { m.bar(p(-l, 0), p(-l - w * 0.6, -w * 0.7), w * 0.5, MID); m.bar(p(-l, 0), p(-l - w * 0.5, w * 0.7), w * 0.5, MID); }
};
const stumpShape = (m: Sheet, rng: () => number, c: number, R: number): void => {
  m.disc(c, c, R * 0.6, R * 0.6, MID);
  const a0 = rng() * 6.28;
  for (let i = 0; i < 3; i++) { const b = a0 + (i / 3) * 6.28; m.bar([c, c], [c + Math.cos(b) * R * 0.95, c + Math.sin(b) * R * 0.95], R * 0.3, MID); }
};

/** a family painter: the shape at centre `c` with radius `R`, in painting `v` */
type Fam = (s: Sheet, rng: () => number, c: number, R: number, v: number) => void;
const shaped = (litAt: number, darkAt: number, draw: (m: Sheet, rng: () => number, c: number, R: number) => void): Fam =>
  (s, rng, c, R, v) => { const m = union(s, rng, c, c, R, (mm) => draw(mm, rng, c, R), litAt, darkAt); mark(s, m, rng, v, c, c, R); };
const heap = (n: (R: number) => number, rmin: number, rmax: number, litAt: number, darkAt: number): Fam =>
  shaped(litAt, darkAt, (m, rng, c, R) => {
    m.disc(c, c, R * 0.55, R * 0.55, MID);
    const k = n(R);
    for (let i = 0; i < k; i++) { const a = (i / k) * 6.28 + rng() * 0.5, d = R * (0.35 + rng() * 0.3), r = R * (rmin + rng() * (rmax - rmin)); m.disc(c + Math.cos(a) * d, c + Math.sin(a) * d * 0.9, r, r, MID); }
  });
const dense: Fam = shaped(0.2, -0.22, (m, rng, c, R) => {
  const lobes = R < 40 ? 5 : R < 90 ? 7 : 9, a0 = rng() * 6.28;
  for (let i = 0; i < lobes; i++) { const b = a0 + (i / lobes) * 6.28 + (rng() - 0.5) * 0.2, d = R * 0.5, r = R * (0.46 + rng() * 0.06); m.disc(c + Math.cos(b) * d, c + Math.sin(b) * d, r, r, MID); }
  m.disc(c, c, R * 0.62, R * 0.62, MID);
});
const cactus: Fam = shaped(0.2, -0.24, (m, rng, c, R) => {
  m.disc(c, c, R * 0.42, R * 0.42, MID);
  const n = R < 40 ? 3 : R < 90 ? 6 : 10;
  for (let i = 0; i < n; i++) { const a = (i / n) * 6.28 + rng() * 0.5, d = R * (0.35 + rng() * 0.2); m.oval(c + Math.cos(a) * d, c + Math.sin(a) * d, R * 0.34, R * 0.2, a + (rng() - 0.5) * 0.5, MID); }
});
const iceSlab: Fam = shaped(0.1, -0.4, (m, rng, c, R) => {
  const n = R < 40 ? 1 : R < 90 ? 2 : 3;
  for (let i = 0; i < n; i++) {
    const a = i === 0 ? 0 : rng() * 6.28, d = i === 0 ? 0 : R * (0.3 + rng() * 0.2), w = R * (0.9 - i * 0.2), h = w * (0.5 + rng() * 0.25);
    const cx = c + Math.cos(a) * d, cy = c + Math.sin(a) * d, ang = rng() * 3.14;
    m.oval(cx, cy, w / 1.6, h / 1.6, ang, MID);
    m.box(cx, cy, w, h, ang, MID);
  }
});
const mesa: Fam = shaped(0.0, -0.4, (m, rng, c, R) => m.poly(lumpy(rng, c, c, R, 0.85, R < 40 ? 5 : 7, 0.2), MID));
const burntSnag: Fam = shaped(0.2, -0.24, (m, rng, c, R) => {
  const w = Math.max(5, R * 0.16), a0 = rng() * 6.28, arms = R < 40 ? 4 : R < 90 ? 5 : 7;
  m.disc(c, c, w, w, MID);
  const grow = (x: number, y: number, a: number, l: number, depth: number): void => {
    const x1 = x + Math.cos(a) * l, y1 = y + Math.sin(a) * l;
    m.bar([x, y], [x1, y1], w, MID);
    if (depth === 0) return;
    grow(x1, y1, a + 0.6 + rng() * 0.4, l * (0.5 + rng() * 0.2), depth - 1);
    if (rng() < 0.7) grow(x1, y1, a - 0.6 - rng() * 0.4, l * (0.45 + rng() * 0.2), depth - 1);
  };
  for (let i = 0; i < arms; i++) grow(c, c, a0 + (i / arms) * 6.28 + (rng() - 0.5) * 0.5, R * (0.5 + rng() * 0.15), R < 40 ? 1 : 2);
});
const columns: Fam = shaped(0.05, -0.38, (m, rng, c, R) => {
  const r = Math.max(9, R * 0.3), ang = rng() * 1.05, dx = r * 1.72, dy = r * 1.5;
  for (let j = -4; j <= 4; j++)
    for (let i = -4; i <= 4; i++) {
      const x = c + (i + (j % 2 ? 0.5 : 0)) * dx, y = c + j * dy;
      if (Math.hypot(x - c, (y - c) * 1.1) > R - r * 0.5) continue;
      m.poly(hexagon(() => 0.5, x, y, r * 1.14, ang), MID);
    }
  m.poly(hexagon(rng, c, c, r, ang), MID);
});
const coral: Fam = shaped(0.16, -0.22, (m, rng, c, R) => {
  branches(m, rng, c, c, R, R < 40 ? 3 : R < 90 ? 5 : 7, Math.max(6, R * 0.22));
  if (R >= 60) for (let i = 0; i < 3; i++) { const a = rng() * 6.28, d = R * (0.25 + rng() * 0.3); m.disc(c + Math.cos(a) * d, c + Math.sin(a) * d, R * 0.24, R * 0.24, MID); }
});
/** a leaf, a heap of leaves, then canopies of a few big lobes */
const broadleaf: Fam = (s, rng, c, R, v) => {
  if (R < 30) { const m = union(s, rng, c, c, R, (mm) => mm.poly(leafPts(c, c, R, R * 0.62, rng() * 6.28), MID)); mark(s, m, rng, 0, c, c, R); }
  else if (R < 50) shaped(0.2, -0.24, (m, rr, cc, RR) => { for (let i = 0; i < 6; i++) { const a = rr() * 6.28, d = rr() * RR * 0.35; m.poly(leafPts(cc + Math.cos(a) * d, cc + Math.sin(a) * d, RR * 0.65, RR * 0.4, rr() * 6.28), MID); } })(s, rng, c, R, v);
  else dense(s, rng, c, R, v);
};
const caps: Fam = (s, rng, c, R, v) => {
  if (R < 90) shaped(0.14, -0.3, (m, rr, cc, RR) => m.poly(lumpy(rr, cc, cc, RR, 1, 9, 0.07), MID))(s, rng, c, R, v);
  else heap(() => 8, 0.25, 0.42, 0.14, -0.3)(s, rng, c, R, v);
};
const shards: Fam = (s, rng, c, R, v) => {
  const n = R < 40 ? 3 : R < 90 ? 4 : 6;
  const m = union(s, rng, c, c, R, (mm) => {
    mm.poly(hexagon(rng, c, c, R * 0.42, rng() * 1.05), MID);
    const a0 = rng() * 6.28;
    for (let i = 0; i < n; i++) { const a = a0 + (i / n) * 6.28 + (rng() - 0.5) * 0.4, L = R * (0.6 + rng() * 0.4), W = R * (0.3 + rng() * 0.12); mm.poly(shard(c, c, a, L, W), MID); }
  }, 0.1, -0.3);
  mark(s, m, rng, v === 2 ? 0 : v, c, c, R * 0.8);
};
const LOG = shaped(0.22, -0.24, (m, rng, c, R) => logShape(m, rng, c, R, true));
const BARE_LOG = shaped(0.22, -0.24, (m, rng, c, R) => logShape(m, rng, c, R, false));
const STUMP = shaped(0.22, -0.24, (m, rng, c, R) => stumpShape(m, rng, c, R));

/** the footprints a family comes in, their reach and how many paintings each gets (atlas.ts FAMILY_SETS) */
export const FAMILY_SLOTS: readonly { key: string; tiles: PropTiles; reach: number; variants: number }[] = [
  { key: "f1", tiles: 1, reach: 1.75, variants: 3 },
  { key: "f2", tiles: 2, reach: 3, variants: 3 },
  { key: "f3", tiles: 3, reach: 4.25, variants: 3 },
  { key: "f4", tiles: 4, reach: 5.5, variants: 2 },
  { key: "f6", tiles: 6, reach: 8, variants: 1 },
  { key: "f10", tiles: 10, reach: 11, variants: 1 },
  { key: "a0", tiles: 2, reach: 3, variants: 3 },
  { key: "a1", tiles: 1, reach: 1.75, variants: 3 },
];
export interface BiomeProps {
  /** the family's kind ids are `${family}${tiles}`; the auxiliaries their own */
  family: string;
  label: string;
  aux: readonly [{ id: string; label: string; paint: Fam }, { id: string; label: string; paint: Fam }];
  paint: Fam;
  /** the family's tones, the first the common one, and the auxiliaries' one tone */
  tones: readonly number[];
  auxTone: number;
}
/** one family a biome, two auxiliaries, and the rock shared by all (docs/props.md) */
export const BIOME_PROPS: Readonly<Record<string, BiomeProps>> = {
  meadow: { family: "canopy", label: "Canopy", paint: dense, tones: [TONE.pine], auxTone: TONE.bark,
    aux: [{ id: "mlog", label: "Log", paint: LOG }, { id: "mstump", label: "Stump", paint: STUMP }] },
  saltpan: { family: "cactus", label: "Cactus", paint: cactus, tones: [FTONE.cactus], auxTone: FTONE.bleached,
    aux: [{ id: "bleached", label: "Bleached log", paint: LOG }, { id: "drybush", label: "Dry bush", paint: shaped(0.2, -0.24, (m, rng, c, R) => m.poly(lumpy(rng, c, c, R * 0.9, 0.9, 11, 0.22), MID)) }] },
  tundra: { family: "iceslab", label: "Ice slab", paint: iceSlab, tones: [FTONE.ice], auxTone: FTONE.ice,
    aux: [{ id: "drift", label: "Drift", paint: shaped(0.35, -0.5, (m, rng, c, R) => m.poly(lumpy(rng, c, c, R, 0.55, 9, 0.08), MID)) }, { id: "iceshard", label: "Ice shard", paint: shaped(0.1, -0.4, (m, rng, c, R) => m.poly(slab(c, c, R * 1.8, R * 0.8, rng() * 3.14), MID)) }] },
  badlands: { family: "mesa", label: "Mesa", paint: mesa, tones: [FTONE.mesa], auxTone: FTONE.mesa,
    aux: [{ id: "drylog", label: "Dry log", paint: LOG }, { id: "hoodoo", label: "Hoodoo", paint: shaped(0.0, -0.4, (m, rng, c, R) => m.poly(lumpy(rng, c, c, R * 0.85, 0.85, 5, 0.2), MID)) }] },
  ashfall: { family: "bsnag", label: "Burnt snag", paint: burntSnag, tones: [TONE.ash], auxTone: TONE.ash,
    aux: [{ id: "charred", label: "Charred log", paint: BARE_LOG }, { id: "ashstump", label: "Ash stump", paint: STUMP }] },
  caldera: { family: "columns", label: "Basalt columns", paint: columns, tones: [FTONE.basalt], auxTone: FTONE.basalt,
    aux: [{ id: "flow", label: "Flow tongue", paint: shaped(0.2, -0.3, (m, rng, c, R) => { const a = rng() * 3.14; m.oval(c, c, R, R * 0.5, a, MID); m.disc(c + Math.cos(a) * R * 0.6, c + Math.sin(a) * R * 0.6, R * 0.42, R * 0.42, MID); }) }, { id: "bomb", label: "Lava bomb", paint: shaped(0.2, -0.3, (m, rng, c, R) => m.poly(teardrop(c, R, rng() * 6.28), MID)) }] },
  shallows: { family: "coral", label: "Coral", paint: coral, tones: [FTONE.coralRed, FTONE.coralOrange, FTONE.coralYellow, FTONE.coralPurple], auxTone: FTONE.bleached,
    aux: [{ id: "driftlog", label: "Driftwood", paint: LOG }, { id: "shell", label: "Shell", paint: shaped(0.1, -0.28, (m, rng, c, R) => { const a = rng() * 6.28, hx = c - Math.cos(a) * R * 0.5, hy = c - Math.sin(a) * R * 0.5, pts: Pt[] = [[hx, hy]]; for (let i = 0; i <= 8; i++) { const b = a - 0.95 + (i / 8) * 1.9, r = R * 1.35 - (i % 2) * R * 0.18; pts.push([hx + Math.cos(b) * r, hy + Math.sin(b) * r]); } m.poly(pts, MID); }) }] },
  jungle: { family: "jungle", label: "Broadleaf", paint: broadleaf, tones: [FTONE.jungle], auxTone: TONE.bark,
    aux: [{ id: "mossylog", label: "Mossy trunk", paint: LOG }, { id: "rootknot", label: "Root knot", paint: STUMP }] },
  sporefield: { family: "cap", label: "Cap", paint: caps, tones: [FTONE.cap], auxTone: FTONE.pod,
    aux: [{ id: "stalk", label: "Fallen stalk", paint: BARE_LOG }, { id: "pod", label: "Spore pod", paint: shaped(0.2, -0.24, (m, rng, c, R) => m.poly(teardrop(c, R, rng() * 6.28), MID)) }] },
  crystal: { family: "shard", label: "Shard", paint: shards, tones: [FTONE.crystal], auxTone: FTONE.crystal,
    aux: [{ id: "column", label: "Broken column", paint: shaped(0.1, -0.3, (m, rng, c, R) => m.poly(slab(c, c, R * 1.9, R * 0.9, rng() * 3.14), MID)) }, { id: "sliver", label: "Sliver", paint: shaped(0.1, -0.3, (m, rng, c, R) => m.poly(slab(c, c, R * 1.8, R * 0.6, rng() * 3.14), MID)) }] },
};
export const BIOME_IDS: readonly string[] = Object.keys(BIOME_PROPS);
const biomeKind = (biome: string, slot: (typeof FAMILY_SLOTS)[number], id: string, label: string, tones: readonly number[], fam: Fam): PropDef => {
  const n = Math.round(slot.reach * PROP_PX), c = n / 2, R = c - 6;
  return { id, label, tiles: slot.tiles, reach: slot.reach, turns: false, variants: slot.variants, tinted: true, tones, family: { biome, slot: slot.key }, paint: (s, rng, v) => fam(s, rng, c, R, v) };
};
const BIOME_KINDS: readonly PropDef[] = BIOME_IDS.flatMap((biome) => {
  const tp = BIOME_PROPS[biome];
  return [
    ...FAMILY_SLOTS.slice(0, 6).map((slot) => biomeKind(biome, slot, `${tp.family}${slot.tiles}`, `${tp.label} ${slot.tiles}`, tp.tones, tp.paint)),
    biomeKind(biome, FAMILY_SLOTS[6], tp.aux[0].id, tp.aux[0].label, [tp.auxTone], tp.aux[0].paint),
    biomeKind(biome, FAMILY_SLOTS[7], tp.aux[1].id, tp.aux[1].label, [tp.auxTone], tp.aux[1].paint),
  ];
});

/**
 * THE KINDS. APPEND ONLY — a prop's kind is its index here, in every
 * document on disk. A painting is `reach * PROP_PX` square and stays
 * three px clear of its rim (the atlas crops two, PROP_INSET).
 */
export const PROP_KINDS: readonly PropDef[] = [
  nature("shrub", "Shrub", 1, 1.75, LEAF_TONES, (s, rng) => {
    clump(s, rng, 28, 28.5, 23, 6);
  }),
  nature("reeds", "Reeds", 1, 1.25, LEAF_TONES, (s, rng) => {
    s.disc(20, 25, 12, 7, DARK);
    for (let i = 0; i < 4; i++) {
      const x = 5 + i * 8, top = 5 + ((rng() * 6) | 0), bottom = 25 + ((rng() * 5) | 0);
      s.rect(x, top, 4, bottom - top, i % 2 ? LIGHT : MID);
      s.rect(x, top, 4, 4, LIGHT);
    }
    s.disc(20, 28, 7, 4, DEEP);
  }),
  nature("boulder", "Boulder", 1, 1.75, ROCK_TONES, (s, rng, v) => {
    stone(s, rng, 28 + (rng() - 0.5) * 2, 28.5, 23, 20, v);
  }, STONE_VARIANTS),
  nature("stump", "Stump", 1, 1, WOOD_TONES, (s, rng) => {
    const a0 = rng() * 6.28;
    for (let i = 0; i < 3; i++) {
      const b = a0 + (i / 3) * 6.28;
      s.disc(16 + Math.cos(b) * 9, 16 + Math.sin(b) * 9, 4.5, 4, DARK);
    }
    s.disc(16, 16, 11, 11, DARK);
    s.disc(16, 16, 8, 8, MID);
    s.disc(16, 16, 4.5, 4.5, LIGHT);
    s.bar([16, 16], [16 + Math.cos(a0) * 10, 16 + Math.sin(a0) * 10], 4, DEEP);
  }),
  nature("tree", "Tree", 2, 2.5, LEAF_TONES, (s, rng) => {
    canopy(s, rng, 40, 40, 35, 7);
  }),
  nature("rock", "Rock", 2, 3, ROCK_TONES, (s, rng, v) => {
    stone(s, rng, 48, 49, 42, 36, v);
  }, STONE_VARIANTS),
  nature("log", "Fallen log", 2, 2.25, WOOD_TONES, (s, rng) => {
    const y0 = 28, h = 18;
    s.rect(8, y0, 58, h, MID);
    s.rect(8, y0, 58, 6, LIGHT);
    s.rect(8, y0 + h - 5, 58, 5, DARK);
    s.disc(8, y0 + h / 2, 4, h / 2, DARK);
    // the broken end: splinters
    s.poly([[66, y0], [69, y0 + 6], [65, y0 + 9], [69, y0 + 14], [66, y0 + h]], MID);
    s.bar([44, y0 + 2], [53, 12], 6, MID);
    s.bar([24, y0 + h - 2], [16, 60], 6, DARK);
    s.rect(32, y0 + 6, 5, 5, DEEP);
    s.rect(52 + ((rng() * 4) | 0), y0 + 9, 4, 4, DEEP);
  }),
  nature("oak", "Oak", 3, 3.5, LEAF_TONES, (s, rng) => {
    canopy(s, rng, 56, 56, 49, 9, 5);
  }),
  nature("outcrop", "Outcrop", 3, 4, ROCK_TONES, (s, rng, v) => {
    stone(s, rng, 64, 65, 57, 49, v);
  }, STONE_VARIANTS),
  nature("grove", "Grove", 4, 4.5, LEAF_TONES, (s, rng) => {
    clump(s, rng, 20, 113, 12, 4);
    clump(s, rng, 122, 110, 11, 4);
    clump(s, rng, 119, 22, 10, 4);
    canopy(s, rng, 50, 58, 34, 8);
    canopy(s, rng, 95, 47, 29, 7);
    canopy(s, rng, 79, 99, 31, 8);
  }),
  made("crate", "Crate", 1, "#6e6a49", (s) => {
    s.rect(4, 4, 24, 24, CRATE.mid);
    s.rect(4, 4, 24, 4, CRATE.hi);
    s.rect(24, 4, 4, 24, CRATE.hi);
    s.rect(4, 24, 24, 4, CRATE.lo);
    s.rect(4, 4, 4, 24, CRATE.lo);
    s.rect(14, 4, 4, 24, STEEL.lo);
    s.rect(4, 14, 24, 4, STEEL.lo);
  }),
  made("barrels", "Barrels", 2, "#7a4a30", (s) => {
    s.disc(46, 50, 10, 6, SPILL);
    const drum = (cx: number, cy: number, body: Col, hi: Col): void => {
      s.disc(cx, cy, 13, 13, STEEL.lo);
      s.disc(cx, cy, 10, 10, (_x, _y, u, v) => (u - v > 0.5 ? hi : body));
      s.disc(cx, cy, 3.5, 3.5, STEEL.deep);
    };
    drum(22, 22, RUST.mid, RUST.hi);
    drum(44, 27, STEEL.mid, STEEL.hi);
    drum(29, 46, RUST.mid, RUST.hi);
  }),
  made("scrap", "Scrap pile", 2, "#4a5158", (s) => {
    s.disc(32, 35, 26, 21, STEEL.lo);
    s.disc(20, 44, 8, 5, RUST.lo);
    s.box(26, 30, 24, 12, 0.35, STEEL.mid);
    s.box(41, 37, 18, 10, -0.6, STEEL.hi);
    s.box(31, 44, 16, 9, 1.2, RUST.mid);
    s.bar([13, 22], [50, 15], 6, STEEL.hi);
    s.ring(46, 26, 8, 4, STEEL.hi);
    for (const [dx, dy] of [[0, -9], [9, 0], [0, 9], [-9, 0]] as const) s.rect(46 + dx - 2, 26 + dy - 2, 4, 4, STEEL.hi);
    s.rect(26, 27, 5, 5, STEEL.deep);
  }),
  made("mast", "Fallen mast", 2, "#6e777e", (s) => {
    s.rect(6, 42, 16, 16, CONCRETE.mid);
    s.rect(6, 42, 16, 4, CONCRETE.hi);
    s.rect(18, 42, 4, 16, CONCRETE.hi);
    s.rect(6, 54, 16, 4, CONCRETE.lo);
    const a: Pt = [14, 50], b: Pt = [50, 14];
    s.bar(a, b, 9, STEEL.mid);
    for (const t of [0.25, 0.45, 0.65, 0.85]) {
      const x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t;
      s.bar([x - 4.5, y - 4.5], [x + 4.5, y + 4.5], 4, STEEL.deep);
    }
    s.disc(50, 14, 10, 10, STEEL.lo);
    s.disc(50, 14, 7, 7, STEEL.hi);
    s.rect(48, 12, 4, 4, STEEL.deep);
  }),
  made("hull", "Wrecked hull", 3, "#5a6068", (s) => {
    s.disc(50, 50, 40, 33, SCORCH);
    s.bar([24, 58], [10, 74], 8, STEEL.lo);
    s.bar([72, 56], [86, 70], 8, STEEL.lo);
    s.disc(10, 74, 6, 6, STEEL.deep);
    s.disc(86, 70, 6, 6, STEEL.deep);
    plate(s, 48, 46, 30, 24, STEEL.hi, STEEL.mid, STEEL.lo);
    s.bar([30, 30], [44, 44], 4, STEEL.deep);
    s.bar([44, 44], [40, 60], 4, STEEL.deep);
    s.bar([40, 60], [56, 68], 4, STEEL.deep);
    s.disc(46, 42, 7, 6, RUST.mid);
    s.disc(38, 58, 6, 5, RUST.lo);
    s.disc(48, 30, 9, 9, STEEL.lo);
    s.disc(48, 30, 6, 6, GLASS);
    s.rect(49, 26, 4, 4, GLINT);
  }),
  made("silo", "Silo", 3, "#6e777e", (s) => {
    s.disc(46, 48, 36, 36, STEEL.lo);
    plate(s, 46, 48, 32, 32, STEEL.hi, STEEL.mid, STEEL.lo, 0.5);
    s.ring(46, 48, 22, 4, STEEL.deep);
    s.bar([46, 58], [50, 78], 6, RUST.mid);
    s.rect(38, 40, 16, 16, STEEL.deep);
    s.rect(40, 42, 12, 12, STEEL.hi);
    s.bar([76, 62], [86, 84], 8, STEEL.lo);
    s.disc(86, 84, 6, 6, RUST.hi);
  }),
  made("walker", "Dead walker", 4, "#5a6068", (s) => {
    s.disc(64, 68, 52, 44, SCORCH);
    const leg = (hip: Pt, knee: Pt, foot: Pt): void => {
      s.bar(hip, knee, 10, STEEL.lo);
      s.bar(knee, foot, 10, STEEL.lo);
      s.disc(knee[0], knee[1], 6, 6, STEEL.mid);
      s.disc(foot[0], foot[1], 7, 7, STEEL.deep);
    };
    leg([44, 50], [24, 34], [18, 14]);
    leg([84, 50], [104, 36], [112, 16]);
    leg([44, 86], [26, 100], [16, 112]);
    s.bar([84, 86], [98, 98], 10, STEEL.lo);
    s.disc(98, 98, 6, 6, RUST.lo);
    s.bar([104, 110], [120, 104], 10, STEEL.lo);
    s.disc(104, 110, 6, 6, RUST.mid);
    plate(s, 64, 68, 30, 26, STEEL.hi, STEEL.mid, STEEL.lo);
    s.bar([40, 60], [88, 76], 4, STEEL.deep);
    s.bar([52, 88], [76, 48], 4, STEEL.deep);
    s.disc(46, 54, 7, 6, RUST.mid);
    s.disc(84, 80, 6, 5, RUST.lo);
    s.disc(64, 38, 12, 12, STEEL.lo);
    s.rect(56, 36, 16, 4, STEEL.deep);
    s.rect(62, 36, 4, 4, EYE);
    s.bar([86, 60], [118, 44], 8, STEEL.lo);
    s.ring(118, 44, 6, 3, STEEL.deep);
  }),
  made("bunker", "Ruined bunker", 4, "#8a857c", (s) => {
    s.rect(8, 8, 112, 112, CONCRETE.mid);
    s.rect(8, 8, 112, 4, CONCRETE.hi);
    s.rect(116, 8, 4, 112, CONCRETE.hi);
    s.rect(8, 116, 112, 4, CONCRETE.lo);
    s.rect(8, 8, 4, 112, CONCRETE.lo);
    s.rect(24, 24, 80, 80, CONCRETE.deep);
    s.rect(24, 24, 80, 4, "#3d3a35");
    s.rect(100, 24, 4, 80, "#3d3a35");
    // the breach in the south wall, and what fell out of it
    s.rect(56, 104, 28, 16, CONCRETE.deep);
    for (const [x, y, r, c] of [[60, 110, 6, CONCRETE.hi], [72, 114, 5, CONCRETE.lo], [82, 108, 5, CONCRETE.hi], [66, 100, 4, CONCRETE.lo]] as const)
      s.disc(x, y, r, r * 0.85, c);
    s.rect(40, 12, 16, 4, CONCRETE.deep);
    s.rect(72, 12, 16, 4, CONCRETE.deep);
    s.bar([14, 60], [21, 92], 4, CONCRETE.deep);
    s.ring(52, 64, 12, 4, STEEL.lo);
    s.disc(52, 64, 8, 8, RUST.mid);
    s.rect(86, 82, 10, 10, CRATE.mid);
    s.rect(86, 82, 10, 3, CRATE.hi);
  }),
  made("wreck", "Crashed gunship", 6, "#5a6068", (s) => {
    const ang = -0.49, ca = Math.cos(ang), sa = Math.sin(ang);
    const cx = 96, cy = 98;
    // along the axis (u, from tail to nose) and across it (v, left is -)
    const P = (u: number, v: number): Pt => [cx + u * ca - v * sa, cy + u * sa + v * ca];
    s.oval(cx, cy, 92, 48, ang, SCORCH);
    // debris thrown clear
    for (const [u, v, w, c] of [[-60, -44, 9, STEEL.mid], [20, 44, 8, RUST.mid], [66, -30, 7, STEEL.lo], [-84, 20, 8, STEEL.hi], [50, 40, 6, STEEL.mid]] as const)
      s.box(P(u, v)[0], P(u, v)[1], w, w * 0.6, ang + u * 0.05, c);
    // the snapped wing lying off the right side
    s.poly([P(-14, 26), P(-2, 26), P(-30, 60), P(-46, 60), P(-34, 34)], STEEL.mid);
    s.poly([P(-30, 60), P(-46, 60), P(-40, 48)], RUST.lo);
    // the wing still on, swept back to the left, scorched at the tip
    s.poly([P(6, -18), P(26, -18), P(-4, -66), P(-30, -66), P(-16, -30)], STEEL.mid);
    s.poly([P(-4, -66), P(-30, -66), P(-18, -50)], RUST.lo);
    s.bar(P(-2, -36), P(10, -36), 5, HAZARD);
    s.bar(P(-10, -50), P(2, -50), 5, HAZARD);
    s.disc(P(12, -30)[0], P(12, -30)[1], 11, 11, STEEL.lo);
    s.disc(P(12, -30)[0], P(12, -30)[1], 6, 6, STEEL.deep);
    // the tail fins
    s.poly([P(-70, -8), P(-58, -8), P(-78, -30), P(-84, -28)], STEEL.lo);
    s.poly([P(-70, 8), P(-58, 8), P(-76, 26), P(-82, 24)], STEEL.lo);
    // the fuselage: lit along its top-right side, shaded along the other
    s.poly([P(-76, -19), P(56, -19), P(76, -8), P(76, 8), P(56, 19), P(-76, 19)], STEEL.mid);
    s.poly([P(-76, -19), P(56, -19), P(70, -11), P(-76, -8)], STEEL.hi);
    s.poly([P(-76, 8), P(70, 11), P(56, 19), P(-76, 19)], STEEL.lo);
    s.bar(P(-40, -19), P(-40, 19), 4, STEEL.deep);
    s.bar(P(0, -19), P(0, 19), 4, STEEL.deep);
    s.bar(P(-60, 0), P(-20, 4), 4, STEEL.deep);
    s.disc(P(-26, 4)[0], P(-26, 4)[1], 8, 6, RUST.mid);
    s.disc(P(40, -6)[0], P(40, -6)[1], 6, 5, RUST.lo);
    s.disc(P(58, 0)[0], P(58, 0)[1], 9, 7, GLASS);
    s.rect(P(60, -3)[0] - 2, P(60, -3)[1] - 2, 4, 4, GLINT);
  }),
  made("colossus", "Fallen colossus", 6, "#4a5158", (s) => {
    s.disc(96, 100, 84, 74, SCORCH);
    s.disc(96, 100, 74, 64, "#3d3936");
    const leg = (hip: Pt, knee: Pt, foot: Pt): void => {
      s.bar(hip, knee, 18, STEEL.lo);
      s.bar(knee, foot, 16, STEEL.lo);
      s.disc(knee[0], knee[1], 11, 11, STEEL.mid);
      s.disc(knee[0], knee[1], 5, 5, STEEL.deep);
      s.disc(foot[0], foot[1], 12, 12, STEEL.deep);
      s.disc(foot[0], foot[1], 7, 7, STEEL.lo);
    };
    leg([60, 76], [30, 50], [22, 20]);
    leg([132, 76], [160, 52], [168, 22]);
    leg([60, 126], [28, 146], [24, 172]);
    leg([132, 126], [158, 150], [166, 172]);
    s.bar([138, 90], [176, 62], 14, STEEL.mid);
    s.ring(176, 62, 9, 4, STEEL.lo);
    plate(s, 96, 100, 46, 36, STEEL.mid, STEEL.lo, STEEL.deep, 0.55);
    s.box(84, 92, 30, 18, 0.2, STEEL.mid);
    s.box(112, 106, 26, 16, -0.4, STEEL.mid);
    s.bar([60, 112], [130, 122], 4, STEEL.deep);
    s.bar([70, 80], [126, 84], 4, STEEL.deep);
    s.disc(70, 100, 10, 8, RUST.mid);
    s.disc(118, 92, 8, 7, RUST.lo);
    s.disc(126, 74, 7, 6, RUST.mid);
    s.disc(96, 52, 20, 20, STEEL.mid);
    s.disc(96, 52, 20, 20, (_x, _y, u, v) => (u - v > 0.6 ? STEEL.hi : null));
    s.rect(78, 48, 36, 8, STEEL.deep);
    s.rect(92, 48, 6, 6, EYE);
    s.rect(88, 66, 16, 4, STEEL.deep);
  }),
  // the bushes a thicket is made of: a canopy's lobes with no trunk under them
  nature("brush", "Brush", 2, 3, LEAF_TONES, (s, rng) => {
    canopy(s, rng, 48, 48, 43, 8, 0, false);
  }),
  nature("thicket", "Thicket", 3, 4, LEAF_TONES, (s, rng) => {
    canopy(s, rng, 64, 64, 58, 10, 5, false);
  }),
  // a dead tree from above: a trunk and its bare limbs, each forking once
  nature("snag", "Dead tree", 2, 2.5, WOOD_TONES, (s, rng) => {
    const c = 40, n = 5 + ((rng() * 2) | 0), a0 = rng() * 6.28;
    for (let i = 0; i < n; i++) {
      const a = a0 + (i / n) * 6.28 + (rng() - 0.5) * 0.5, l = 22 + rng() * 10;
      const x1 = c + Math.cos(a) * l, y1 = c + Math.sin(a) * l;
      s.bar([c, c], [x1, y1], 7, MID);
      const b = a + (rng() < 0.5 ? 0.7 : -0.7), l2 = 8 + rng() * 6;
      s.bar([c + Math.cos(a) * l * 0.55, c + Math.sin(a) * l * 0.55], [c + Math.cos(a) * l * 0.55 + Math.cos(b) * l2, c + Math.sin(a) * l * 0.55 + Math.sin(b) * l2], 5, MID);
      s.disc(x1, y1, 3, 3, DARK);
    }
    s.disc(c, c, 9, 9, DARK);
    s.disc(c, c, 5, 5, DEEP);
  }),
  // ---- the water's edge (mapgen.ts, the shore pass) ----
  // one lily pad from straight above: a flat disc with a notch, no shading
  nature("lily", "Lily pad", 1, 1.25, LEAF_TONES, (s, rng) => {
    lilypad(s, rng, 20, 20, 15);
  }),
  // a bleached log lying across the cell: a root flare one end, splinters the other
  nature("driftwood", "Driftwood", 1, 1.5, WOOD_TONES, (s, rng) => {
    const a = -0.5 + rng(), c = 24, l = 18;
    const p = (t: number, w: number): Pt => [c + Math.cos(a) * t - Math.sin(a) * w, c + Math.sin(a) * t + Math.cos(a) * w];
    s.bar(p(-l, 0), p(l, 0), 9, MID);
    s.bar(p(-l, -2.5), p(l, -2.5), 3, LIGHT);
    s.bar(p(-l + 2, 3), p(l - 2, 3), 2.5, DARK);
    const [rx, ry] = p(-l, 0);
    s.disc(rx, ry, 5.5, 5, DARK);
    s.bar(p(-l, 0), p(-l - 5, -5), 3.5, DARK);
    s.bar(p(-l, 0), p(-l - 4, 5), 3.5, DARK);
    s.poly([p(l, -4.5), p(l + 4, -2), p(l + 1, 1), p(l + 4, 3), p(l, 4.5)], MID);
    const [kx, ky] = p(4 + rng() * 6, 0);
    s.disc(kx, ky, 2, 2, DEEP);
  }),
  // a reed bed from straight above: a dark pool, the stems as dots with
  // their blades fanned round them, the cattail heads as darker dots
  nature("rushes", "Rushes", 2, 2.25, LEAF_TONES, (s, rng) => {
    const c = 36;
    s.disc(c, c, 26, 26, DEEP);
    s.disc(c, c, 24, 24, DARK);
    const n = 15, a0 = rng() * 6.28;
    for (let i = 0; i < n; i++) {
      const b = a0 + (i / n) * 6.28 + (rng() - 0.5) * 0.5, d = i % 3 === 0 ? 2 + rng() * 6 : 9 + rng() * 11;
      const x = c + Math.cos(b) * d, y = c + Math.sin(b) * d;
      const blades = 3 + ((rng() * 2) | 0), b0 = rng() * 6.28;
      for (let k = 0; k < blades; k++) {
        const t = b0 + (k / blades) * 6.28 + (rng() - 0.5) * 0.4, l = 6 + rng() * 5;
        s.bar([x, y], [x + Math.cos(t) * l, y + Math.sin(t) * l], 2.2, k % 2 ? MID : LIGHT);
      }
      s.disc(x, y, 2, 2, i % 2 === 0 ? DEEP : LIGHT);
    }
  }),
  // wet stones strewn at the waterline
  nature("shingle", "Shingle", 1, 1.25, ROCK_TONES, (s, rng) => {
    const n = 6 + ((rng() * 3) | 0);
    for (let i = 0; i < n; i++) {
      const x = 9 + rng() * 22, y = 9 + rng() * 22, r = 3 + rng() * 3;
      s.disc(x + 1, y + 1, r, r * 0.8, DEEP);
      s.disc(x, y, r, r * 0.8, (px, py) => (px + 0.5 - x - (py + 0.5 - y) > r * 0.3 ? LIGHT : MID));
    }
  }),
  nature("lilypad", "Big lily pad", 2, 2.25, LEAF_TONES, (s, rng) => {
    lilypad(s, rng, 36, 36, 29);
  }),
  // the big bushes and stones, rare on a board (mapgen.ts, the size rolls)
  nature("copse", "Copse", 6, 7, LEAF_TONES, (s, rng) => {
    canopy(s, rng, 112, 112, 102, 12, 7, false);
  }),
  nature("brake", "Brake", 10, 11, LEAF_TONES, (s, rng) => {
    canopy(s, rng, 176, 176, 162, 14, 9, false);
  }),
  nature("crag", "Crag", 6, 7, ROCK_TONES, (s, rng, v) => {
    stone(s, rng, 112, 113, 104, 92, v);
  }, STONE_VARIANTS),
  // one painting: three of a cell this size is a tenth of the atlas
  nature("tor", "Tor", 10, 11, ROCK_TONES, (s, rng) => {
    stone(s, rng, 176, 177, 166, 148, 1);
  }),
  // the side sites' cache (docs/sites.md): a strongbox, banded and locked
  made("chest", "Cache", 2, "#b8983a", (s) => {
    s.disc(34, 40, 26, 18, SPILL);
    s.rect(10, 12, 44, 40, CRATE.mid);
    s.rect(10, 12, 44, 5, CRATE.hi);
    s.rect(49, 12, 5, 40, CRATE.hi);
    s.rect(10, 47, 44, 5, CRATE.lo);
    s.rect(10, 12, 5, 40, CRATE.lo);
    s.rect(10, 30, 44, 4, STEEL.lo);
    s.rect(18, 12, 5, 40, HAZARD);
    s.rect(41, 12, 5, 40, HAZARD);
    s.rect(18, 30, 5, 4, EYE);
    s.rect(41, 30, 5, 4, EYE);
    s.rect(27, 26, 10, 12, STEEL.deep);
    s.rect(29, 28, 6, 5, GLINT);
  }),
  // ...and what a site is built out of (docs/sites.md): standing stones,
  // pillars, braziers and an altar. A stronghold's walls are rock, not props
  nature("menhir", "Standing stone", 2, 2.25, ROCK_TONES, (s, rng, v) => {
    const a = v ? 0.4 : -0.25;
    s.disc(40, 48, 24, 14, DEEP);
    s.box(37, 36, 22, 54, a, DEEP);
    s.box(36, 35, 18, 50, a, DARK);
    s.box(34, 33, 13, 44, a, MID);
    s.box(30, 30, 6, 36, a, LIGHT);
    if (rng() < 0.6) s.box(42, 44, 5, 12, a, DEEP);
    if (rng() < 0.5) s.box(33, 20, 4, 6, a, DEEP);
  }, 2),
  made("pillar", "Pillar", 1, "#b3aea3", (s) => {
    s.disc(18, 19, 11, 8, SPILL);
    s.disc(16, 16, 12, 12, CONCRETE.deep);
    plate(s, 16, 16, 10, 10, CONCRETE.hi, CONCRETE.mid, CONCRETE.lo, 0.4);
    s.disc(16, 16, 4, 4, CONCRETE.deep);
    s.disc(15, 15, 2, 2, CONCRETE.hi);
  }),
  made("brazier", "Brazier", 1, "#c8501e", (s) => {
    s.disc(17, 19, 12, 9, SPILL);
    for (const [x, y] of [[8, 24], [24, 24], [16, 6]] as const) s.rect(x - 2, y - 2, 4, 4, STEEL.deep);
    s.disc(16, 16, 11, 11, STEEL.deep);
    s.ring(16, 16, 11, 3, STEEL.lo);
    s.disc(16, 16, 7, 7, "#c8501e");
    s.disc(15, 15, 4.5, 4.5, "#f2a13a");
    s.disc(14, 14, 2, 2, "#fff0a0");
  }),
  made("altar", "Altar", 2, "#6d6960", (s) => {
    s.rect(8, 12, 48, 44, SCORCH);
    s.rect(8, 10, 48, 44, CONCRETE.lo);
    s.rect(14, 8, 36, 40, CONCRETE.mid);
    s.rect(14, 8, 36, 4, CONCRETE.hi);
    s.rect(14, 44, 36, 4, CONCRETE.deep);
    s.rect(20, 16, 24, 24, CONCRETE.deep);
    s.rect(22, 18, 20, 20, "#4a2626");
    s.rect(26, 22, 12, 12, "#6a2b2b");
    s.rect(30, 26, 4, 4, HAZARD);
  }),
  // the rock's missing footprint, so the shared rock comes in every size a family does
  nature("knoll", "Knoll", 4, 5.5, ROCK_TONES, (s, rng, v) => {
    stone(s, rng, 88, 89, 80, 70, v);
  }, STONE_VARIANTS),
  ...BIOME_KINDS,
];
/** the kinds a biome owns: its family's six footprints and its two auxiliaries */
export const familyKinds = (biome: string): number[] => {
  const out: number[] = [];
  PROP_KINDS.forEach((k, i) => { if (k.family?.biome === biome) out.push(i); });
  return out;
};
/** the biomes a board's props belong to, the most common first */
export function biomesOf(props: readonly { kind: number }[]): string[] {
  const count = new Map<string, number>();
  for (const p of props) { const th = PROP_KINDS[p.kind]?.family?.biome; if (th) count.set(th, (count.get(th) ?? 0) + 1); }
  return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([th]) => th);
}
/** what a fresh prop's `rot` rolls to: a quarter turn for a kind that turns, a painting otherwise */
export const rollRot = (kind: number, r: number): number => {
  const def = PROP_KINDS[kind];
  return (r * (def.turns ? 4 : def.variants)) | 0;
};
export const PROP_KIND_INDEX: Readonly<Record<string, number>> = Object.fromEntries(PROP_KINDS.map((k, i) => [k.id, i]));
/** a kind by its id; throws on a name the table does not have */
export const propKind = (id: string): number => {
  const k = PROP_KIND_INDEX[id];
  if (k === undefined) throw new Error(`no prop kind "${id}"`);
  return k;
};

/** the colour a prop's cells wear on the corner map */
export function propMini(kind: number, tone: number): string {
  const def = PROP_KINDS[kind];
  if (!def) return "#000000";
  if (!def.tinted) return def.mini ?? "#555555";
  return mix(PROP_TONES[tone]?.hex ?? "#ffffff", "#000000", 0.42);
}

/** paint one kind: `reach * PROP_PX` square RGBA, transparent where nothing is */
export function paintProp(kind: number, tint?: number, variant = 0): Uint8ClampedArray<ArrayBuffer> {
  const def = PROP_KINDS[kind];
  const n = Math.round(def.reach * PROP_PX);
  const s = new Sheet(n);
  def.paint(s, mulberry32(7000 + kind * 331 + variant * 17), variant);
  const out = new Uint8ClampedArray(new ArrayBuffer(n * n * 4));
  const t = tint === undefined ? null : PROP_TINT[tint];
  for (let i = 0; i < n * n; i++) {
    const c = s.px[i];
    if (c === null) continue;
    const [r, g, b] = hex(c);
    out[i * 4] = t ? r * t[0] : r;
    out[i * 4 + 1] = t ? g * t[1] : g;
    out[i * 4 + 2] = t ? b * t[2] : b;
    out[i * 4 + 3] = 255;
  }
  return out;
}

/** one painting of a kind as a canvas at its native size, untinted */
export function propCanvas(kind: number, variant = 0): HTMLCanvasElement {
  const n = Math.round(PROP_KINDS[kind].reach * PROP_PX);
  const c = document.createElement("canvas");
  c.width = c.height = n;
  const g = c.getContext("2d");
  if (!g) throw new Error("2d context unavailable for prop");
  g.putImageData(new ImageData(paintProp(kind, undefined, variant), n, n), 0, 0);
  return c;
}

/** where the editor's palette icons are written (scripts/gen-tiles.mjs) */
export const propIcon = (kind: number, tone: number): string =>
  `/tiles/prop-${PROP_KINDS[kind].id}-${PROP_TONES[tone].id}.png`;
