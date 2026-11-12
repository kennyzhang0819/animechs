// A 2.5D pixel-art renderer for the game's assets (docs/style-concepts.html).
// An asset is a voxel model; it is projected at a three-quarter angle so its
// top and its front both show, shaded top-light/front-dark, outlined, and
// turned in the ground plane for each of the eight facings. One voxel is one
// art pixel, drawn at VOX_PX native px.

export type Ink = string | null;
export interface VoxMat { top: string; hi: string; shade: string; front: string; low: string; line: string }

const hex = (c: string): [number, number, number] => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
const toHex = (r: number, g: number, b: number): string =>
  `#${[r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("")}`;
export const mix = (a: string, b: string, t: number): string => {
  const A = hex(a), B = hex(b);
  return toHex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t);
};

/** the look's dials: the camera and the ink */
export interface VoxView {
  /** a voxel's depth on screen, as a share of its width (1 is straight down) */
  ys: number;
  /** a voxel's height on screen, the same way */
  zs: number;
  /** the outline round the silhouette, in art px (0 none) */
  outline: number;
  /** a crease line where a front face meets the top behind it */
  crease: boolean;
  /** the ink the outlines are mixed toward */
  ink: string;
  /** how far the top of a shape is lifted toward white, and the front dropped */
  lift: number;
  drop: number;
}
export const VIEWS: Record<"steep" | "quarter" | "low", VoxView> = {
  steep: { ys: 0.85, zs: 0.5, outline: 1, crease: false, ink: "#1a1a2e", lift: 0.14, drop: 0.3 },
  quarter: { ys: 0.72, zs: 0.72, outline: 1, crease: false, ink: "#1a1a2e", lift: 0.14, drop: 0.34 },
  low: { ys: 0.55, zs: 0.9, outline: 1, crease: false, ink: "#1a1a2e", lift: 0.14, drop: 0.38 },
};

/** a material off one base colour under a view's lighting */
export function mat(base: string, v: VoxView): VoxMat {
  return {
    top: mix(base, "#ffffff", v.lift * 0.5),
    hi: mix(base, "#ffffff", v.lift),
    shade: mix(base, v.ink, 0.12),
    front: mix(base, v.ink, v.drop),
    low: mix(base, v.ink, v.drop + 0.25),
    line: mix(base, v.ink, 0.86),
  };
}

export class Model {
  readonly v: Uint8Array;
  readonly mats: VoxMat[] = [];
  constructor(readonly w: number, readonly d: number, readonly h: number) {
    this.v = new Uint8Array(w * d * h);
  }
  /** register a material; the id to draw with */
  m(mat: VoxMat): number {
    this.mats.push(mat);
    return this.mats.length;
  }
  at(x: number, y: number, z: number): number {
    x = Math.round(x); y = Math.round(y); z = Math.round(z);
    return x < 0 || y < 0 || z < 0 || x >= this.w || y >= this.d || z >= this.h ? 0 : this.v[(z * this.d + y) * this.w + x];
  }
  set(x: number, y: number, z: number, id: number): void {
    x = Math.round(x); y = Math.round(y); z = Math.round(z);
    if (x < 0 || y < 0 || z < 0 || x >= this.w || y >= this.d || z >= this.h) return;
    this.v[(z * this.d + y) * this.w + x] = id;
  }
  /** a box, half-open on every axis */
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, id: number): this {
    x0 = Math.round(x0); y0 = Math.round(y0); z0 = Math.round(z0); x1 = Math.round(x1); y1 = Math.round(y1); z1 = Math.round(z1);
    for (let z = z0; z < z1; z++) for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) this.set(x, y, z, id);
    return this;
  }
  /** a box with its footprint corners cut by c */
  octa(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, c: number, id: number): this {
    x0 = Math.round(x0); y0 = Math.round(y0); z0 = Math.round(z0); x1 = Math.round(x1); y1 = Math.round(y1); z1 = Math.round(z1);
    for (let z = z0; z < z1; z++) for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const dx = Math.min(x - x0, x1 - 1 - x), dy = Math.min(y - y0, y1 - 1 - y);
      if (dx + dy >= c) this.set(x, y, z, id);
    }
    return this;
  }
  /** a round column; r is in voxels, centred on a voxel centre */
  cyl(cx: number, cy: number, r: number, z0: number, z1: number, id: number): this {
    const rr = (r + 0.5) * (r + 0.5);
    for (let z = Math.round(z0); z < Math.round(z1); z++)
      for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
        for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++)
          if ((x - cx) ** 2 + (y - cy) ** 2 <= rr) this.set(x, y, z, id);
    return this;
  }
  /** a dome: a half ball of radius r standing on z0 */
  dome(cx: number, cy: number, r: number, z0: number, id: number, rz = r): this {
    z0 = Math.round(z0); rz = Math.max(1, Math.round(rz));
    for (let z = 0; z < rz; z++) {
      const k = Math.sqrt(Math.max(0, 1 - ((z + 0.5) / rz) ** 2)) * r;
      this.cyl(cx, cy, k, z0 + z, z0 + z + 1, id);
    }
    return this;
  }
  /** a ball centred at z */
  ball(cx: number, cy: number, cz: number, r: number, id: number, rz = r): this {
    cz = Math.round(cz); rz = Math.max(1, Math.round(rz));
    for (let z = -rz; z < rz; z++) {
      const k = Math.sqrt(Math.max(0, 1 - ((z + 0.5) / rz) ** 2)) * r;
      this.cyl(cx, cy, k, cz + z, cz + z + 1, id);
    }
    return this;
  }
  /** a cone from r at z0 to a point at z1 */
  cone(cx: number, cy: number, r: number, z0: number, z1: number, id: number): this {
    z0 = Math.round(z0); z1 = Math.round(z1);
    for (let z = z0; z < z1; z++) this.cyl(cx, cy, r * (1 - (z - z0) / (z1 - z0)), z, z + 1, id);
    return this;
  }
  /** a bar from (x0,y0) to (x1,y1) at height z0..z1, `t` thick */
  bar(x0: number, y0: number, x1: number, y1: number, z0: number, z1: number, t: number, id: number): this {
    z0 = Math.round(z0); z1 = Math.max(Math.round(z1), Math.round(z0) + 1);
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2));
    for (let i = 0; i <= n; i++) {
      const x = x0 + ((x1 - x0) * i) / n, y = y0 + ((y1 - y0) * i) / n;
      this.cyl(x, y, (t - 1) / 2, z0, z1, id);
    }
    return this;
  }
  /** the near half (small y) copied onto the far half, so a body is symmetric about its axis */
  mirrorY(): this {
    for (let z = 0; z < this.h; z++) for (let y = 0; y < this.d >> 1; y++) for (let x = 0; x < this.w; x++)
      this.v[(z * this.d + (this.d - 1 - y)) * this.w + x] = this.v[(z * this.d + y) * this.w + x];
    return this;
  }
  /** the model turned about its footprint centre by `a` radians (nearest voxel) */
  turned(a: number): Model {
    if (a === 0) return this;
    const out = new Model(this.w, this.d, this.h);
    out.mats.push(...this.mats);
    const cx = (this.w - 1) / 2, cy = (this.d - 1) / 2;
    const c = Math.cos(-a), s = Math.sin(-a);
    for (let z = 0; z < this.h; z++) for (let y = 0; y < this.d; y++) for (let x = 0; x < this.w; x++) {
      const dx = x - cx, dy = y - cy;
      const sx = Math.round(cx + dx * c - dy * s), sy = Math.round(cy + dx * s + dy * c);
      out.v[(z * this.d + y) * this.w + x] = this.at(sx, sy, z);
    }
    return out;
  }
}

export interface Rendered { w: number; h: number; px: Ink[]; /** the row the footprint's centre sits on */ ground: number }

/** rows per depth voxel and per height voxel, and the picture's height */
export function frameOf(w: number, d: number, h: number, v: VoxView): { w: number; h: number; ground: number } {
  const rows = Math.ceil(d * v.ys + h * v.zs) + 1;
  return { w, h: rows, ground: h * v.zs + (d / 2) * v.ys };
}

/**
 * Painter's order north to south, low to high: a voxel's top face spans the
 * rows its depth takes, its front face the rows its height takes. Both
 * faces are lit by what is next to them: an open edge to the north or west
 * is a highlight, to the east a shade, and the foot of a front is low.
 */
export function render(model: Model, v: VoxView, opts: { outline?: boolean } = {}): Rendered {
  const { w, d, h } = model;
  const f = frameOf(w, d, h, v);
  const W = w, H = f.h;
  const px: Ink[] = new Array<Ink>(W * H).fill(null);
  const own = new Int16Array(W * H).fill(-1);
  const row = (y: number, z: number): number => Math.round(y * v.ys + (h - z) * v.zs);
  const put = (x: number, r: number, c: string, id: number): void => {
    if (x < 0 || r < 0 || x >= W || r >= H) return;
    px[r * W + x] = c;
    own[r * W + x] = id;
  };
  for (let y = 0; y < d; y++)
    for (let z = 0; z < h; z++)
      for (let x = 0; x < w; x++) {
        const id = model.at(x, y, z);
        if (id === 0) continue;
        const m = model.mats[id - 1];
        if (model.at(x, y, z + 1) === 0) {
          // the top face
          // one tone a top, so a terraced dome reads as a flat disc; the
          // highlight is only the top's north rim where nothing stands behind it
          const rim = v.lift > 0.2 && model.at(x, y - 1, z) === 0 && model.at(x, y - 1, z + 1) === 0;
          const r0 = row(y, z + 1), r1 = row(y + 1, z + 1);
          const c = rim ? m.hi : m.top;
          for (let r = r0; r < Math.max(r1, r0 + 1); r++) put(x, r, c, id);
        }
        if (model.at(x, y + 1, z) === 0) {
          // the front face
          const r0 = row(y + 1, z + 1), r1 = row(y + 1, z);
          const foot = model.at(x, y + 1, z - 1) !== 0 || z === 0;
          for (let r = r0; r < r1; r++) put(x, r, r === r1 - 1 && foot ? m.low : m.front, id);
          if (v.crease && r0 > 0 && own[(r0 - 1) * W + x] >= 0 && own[(r0 - 1) * W + x] !== id) put(x, r0 - 1, m.line, id);
        }
      }
  if ((opts.outline ?? true) && v.outline > 0) {
    const out = px.slice();
    for (let r = 0; r < H; r++)
      for (let x = 0; x < W; x++) {
        if (px[r * W + x] !== null) continue;
        let near = -1;
        for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]]) {
          const xx = x + dx, rr = r + dy;
          if (xx < 0 || rr < 0 || xx >= W || rr >= H) continue;
          const o = own[rr * W + xx];
          if (o >= 0) { near = o; break; }
        }
        if (near > 0) out[r * W + x] = model.mats[near - 1].line;
      }
    return { w: W, h: H, px: out, ground: f.ground };
  }
  return { w: W, h: H, px, ground: f.ground };
}

/** the picture at k native px an art px */
export function scaled(r: Rendered, k: number): Rendered {
  const W = Math.round(r.w * k), H = Math.round(r.h * k);
  const px: Ink[] = new Array<Ink>(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) px[y * W + x] = r.px[Math.floor(y / k) * r.w + Math.floor(x / k)];
  return { w: W, h: H, px, ground: r.ground * k };
}

/**
 * The picture laid into a cell `cw` x `ch` with its footprint centre at
 * `anchor` of the cell's height, centred across — what the sheet stores so
 * the renderer can put a body's feet on its position.
 */
export function framed(r: Rendered, cw: number, ch: number, anchor: number): Ink[] {
  const px: Ink[] = new Array<Ink>(cw * ch).fill(null);
  const ox = Math.round((cw - r.w) / 2), oy = Math.round(ch * anchor - r.ground);
  for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) {
    const X = x + ox, Y = y + oy;
    if (X >= 0 && Y >= 0 && X < cw && Y < ch) px[Y * cw + X] = r.px[y * r.w + x];
  }
  return px;
}

/** the eight facings, east first, turning clockwise on a y-down screen */
export const FACINGS = 8;
export const facingOf = (rot: number): number => ((Math.round(rot / (Math.PI / 4)) % FACINGS) + FACINGS) % FACINGS;
