// The pixel style every generator draws in (docs/style-concepts.html).
// "foundry" is the shipped look: flat pairs, one native px a pixel, no rim.
// "block" re-pixels every drawing at two native px a pixel, lights it from
// the top-left, shadows the bottom-right, and bakes a hue-dark rim round it.

export type PixelStyle = "foundry" | "block" | "vox";
// read before any module declares a sheet cell: the page's global, else the
// url (?pixel=vox), else what the last visit remembered; "?pixel=foundry" forgets it
const readPreset = (): string | null => {
  const g = (globalThis as { __pixelStyle?: string }).__pixelStyle;
  if (g) return g;
  if (typeof location === "undefined") return null;
  try {
    const q = new URLSearchParams(location.search).get("pixel");
    if (q) { localStorage.setItem("pixelStyle", q); return q; }
    return localStorage.getItem("pixelStyle");
  } catch { return null; }
};
const preset = readPreset();
export const pixelStyle: { current: PixelStyle } = { current: preset === "block" || preset === "vox" ? preset : "foundry" };
export const setPixelStyle = (s: PixelStyle): void => { pixelStyle.current = s; };
export const isBlock = (): boolean => pixelStyle.current === "block";
/** the 2.5D set (voxelArt.ts, voxelModels.ts): declared at import, so it is read off the page */
export const isVox = (): boolean => pixelStyle.current === "vox";
export const isRestyled = (): boolean => pixelStyle.current !== "foundry";

type Ink = string | null;
export interface Ramp { light: string; mid: string; shadow: string; outline: string }

const hex = (c: string): [number, number, number] => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
const toHex = (r: number, g: number, b: number): string =>
  `#${[r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("")}`;
export const mixHex = (a: string, b: string, t: number): string => {
  const A = hex(a), B = hex(b);
  return toHex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t);
};
/** darken toward a cool ink rather than black, so a rim keeps its hue */
const INK = "#120f1c";
export const rampOf = (dark: string, light: string): Ramp => ({
  light,
  mid: mixHex(dark, light, 0.5),
  shadow: dark,
  outline: mixHex(dark, INK, 0.6),
});
/** a ramp from one colour: the colour is the mid */
const SOLO = new Map<string, Ramp>();
export const rampFrom = (c: string): Ramp => {
  let r = SOLO.get(c);
  if (!r) {
    r = { light: mixHex(c, "#ffffff", 0.3), mid: c, shadow: mixHex(c, INK, 0.3), outline: mixHex(c, INK, 0.62) };
    SOLO.set(c, r);
  }
  return r;
};

/**
 * The 2x2 majority of a grid: m = n/2 cells, each the key that covers most
 * of its block (ties to the top-left), or null when most of it is empty.
 */
export function chunk<T>(px: readonly (T | null)[], w: number, h: number): (T | null)[] {
  const mw = (w + 1) >> 1, mh = (h + 1) >> 1;
  const out = new Array<T | null>(mw * mh).fill(null);
  const at = (x: number, y: number): T | null => (x < w && y < h ? px[y * w + x] ?? null : null);
  for (let y = 0; y < mh; y++)
    for (let x = 0; x < mw; x++) {
      const cells = [at(x * 2, y * 2), at(x * 2 + 1, y * 2), at(x * 2, y * 2 + 1), at(x * 2 + 1, y * 2 + 1)];
      const empty = cells.filter((v) => v === null).length;
      if (empty >= 3) continue;
      let best: T | null = null, bestN = 0;
      for (const v of cells) {
        if (v === null) continue;
        let n = 0;
        for (const u of cells) if (u === v) n++;
        if (n > bestN) { bestN = n; best = v; }
      }
      out[y * mw + x] = best;
    }
  return out;
}

export interface BlockOpts {
  /** no rim: the drawing already fills its box, or sits on something */
  noOutline?: boolean;
  /** bevel light on the top-left of a material change too, not only the silhouette */
  bevel?: boolean;
}

/**
 * Light a chunked grid and expand it back to native size: the top-left edge
 * of every shape in its light, the bottom-right in its shadow, the rest mid,
 * and the empty cells touching it in its outline. One art px is 2x2 native.
 */
export function blockRender<T>(cells: readonly (T | null)[], mw: number, mh: number, ramp: (k: T) => Ramp, o: BlockOpts = {}, w = mw * 2, h = mh * 2): Ink[] {
  const at = (x: number, y: number): T | null => (x < 0 || y < 0 || x >= mw || y >= mh ? null : cells[y * mw + x] ?? null);
  const art = new Array<Ink>(mw * mh).fill(null);
  const bevel = o.bevel ?? true;
  for (let y = 0; y < mh; y++)
    for (let x = 0; x < mw; x++) {
      const k = at(x, y);
      if (k === null) {
        if (o.noOutline) continue;
        // the rim: the nearest filled neighbour's ink, straight sides first
        const n = at(x, y - 1) ?? at(x - 1, y) ?? at(x + 1, y) ?? at(x, y + 1) ?? at(x - 1, y - 1) ?? at(x + 1, y - 1) ?? at(x - 1, y + 1) ?? at(x + 1, y + 1);
        if (n !== null) art[y * mw + x] = ramp(n).outline;
        continue;
      }
      const r = ramp(k);
      const up = at(x, y - 1), left = at(x - 1, y), down = at(x, y + 1), right = at(x + 1, y);
      const edgeTL = up === null || left === null;
      const edgeBR = down === null || right === null;
      const bevelTL = bevel && ((up !== null && up !== k) || (left !== null && left !== k));
      art[y * mw + x] = edgeTL ? r.light : edgeBR ? r.shadow : bevelTL ? r.light : r.mid;
    }
  const out = new Array<Ink>(w * h).fill(null);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out[y * w + x] = art[(y >> 1) * mw + (x >> 1)];
  return out;
}

/** a finished colour drawing re-pixelled in the block style */
export function blockInk(px: readonly Ink[], w: number, h: number, o: BlockOpts = {}): Ink[] {
  return blockRender(chunk(px, w, h), (w + 1) >> 1, (h + 1) >> 1, rampFrom, o, w, h);
}

/** the same for opaque-or-clear RGBA, in place of the painter's own output */
export function blockRgba(data: Uint8ClampedArray, w: number, h: number, o: BlockOpts = {}): Uint8ClampedArray<ArrayBuffer> {
  const px: Ink[] = new Array<Ink>(w * h);
  for (let i = 0; i < w * h; i++) px[i] = data[i * 4 + 3] < 128 ? null : toHex(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]);
  const art = blockInk(px, w, h, o);
  const out = new Uint8ClampedArray(new ArrayBuffer(w * h * 4));
  for (let i = 0; i < w * h; i++) {
    const c = art[i];
    if (c === null) continue;
    const [r, g, b] = hex(c);
    out[i * 4] = r; out[i * 4 + 1] = g; out[i * 4 + 2] = b; out[i * 4 + 3] = 255;
  }
  return out;
}
