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
];
export const TONE = {
  pine: 0, mangrove: 1, frost: 2, scrub: 3, ash: 4, bark: 5,
  plain: 6, dust: 7, rime: 8, soot: 9, film: 10, ochre: 11,
} as const;
export const ROCK_TONE0 = 12;
export const rockTone = (k: WallKind): number => ROCK_TONE0 + WALL_KINDS.indexOf(k);
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
  paint: (s: Sheet, rng: () => number, variant: number) => void;
}

const nature = (id: string, label: string, tiles: PropTiles, reach: number, tones: readonly number[], paint: PropDef["paint"], variants = 1): PropDef =>
  ({ id, label, tiles, reach, turns: false, variants, tinted: true, tones, paint });
const made = (id: string, label: string, tiles: PropTiles, mini: string, paint: PropDef["paint"]): PropDef =>
  ({ id, label, tiles, reach: tiles, turns: true, variants: 1, tinted: false, tones: WEATHER_TONES, mini, paint });

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
];
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
