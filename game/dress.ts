/**
 * DRESSING, in the game, for a grid built at runtime — the title screen's
 * ground (MenuBackground.tsx). These are the rules the campaign maps were
 * painted with before they became Mindustry-style generated maps
 * (scripts/maps/mindustry.mjs, docs/authoring-maps.md); the menu keeps
 * them because its ground is a single meandering lane, which is the shape
 * they were written for.
 *
 * The rules: every shape is derived from the geometry. The rock is ONE
 * family beside every road, with a CORE of a second family where a mass
 * is thick — its own outline shrunk by a set depth. The floor is a base
 * with a FEW LARGE blobs of a second floor, wider than the road and
 * clipped to it, and a third floor only in the plazas, the cells furthest
 * from any rock. Boulders lie along the road's edges, never down its
 * middle.
 */
import { DECOR_TILES } from "./atlas";
import { CELL } from "./constants";
import type { Prop } from "./terrain";

export interface DressStyle {
  road: {
    /** first index of the base floor family */
    base: number;
    /** the second floor, in a few large blobs */
    patches?: { floor: number; count: number; r: readonly [number, number]; squash: number };
    /** the third floor, in the plazas: cells at least `clear` from rock, grown by `grow` */
    flat?: { floor: number; clear: number; grow: number };
  };
  rock: {
    /** first index of the rock's wall pair */
    base: number;
    /** the core: the mass's outline shrunk by `depth` cells */
    core?: { wall: number; depth: number };
  };
  /** decor kinds and their width in tiles, and how many road-edge cells to a boulder */
  props?: { kinds: readonly number[]; per: number };
}

/** the grid a dressing is applied to: flat arrays, `y * w + x` */
export interface DressGrid {
  w: number;
  h: number;
  blocked: Uint8Array;
  floor: Uint8Array;
  wall: Uint8Array;
}

type Rng = () => number;

/**
 * Distance from every cell to the nearest cell that fails `pass`, in
 * cells — the 5-7-11 chamfer, two passes, that scripts/maps/geom.mjs uses. Off the
 * board counts as passable.
 */
export function chamfer(w: number, h: number, pass: (i: number) => boolean): Float32Array {
  const INF = 1e9;
  const d = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) d[i] = pass(i) ? INF : 0;
  const relax = (i: number, j: number, k: number): void => {
    if (d[j] + k < d[i]) d[i] = d[j] + k;
  };
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (d[i] === 0) continue;
      if (x > 0) relax(i, i - 1, 5);
      if (y > 0) relax(i, i - w, 5);
      if (x > 0 && y > 0) relax(i, i - w - 1, 7);
      if (x < w - 1 && y > 0) relax(i, i - w + 1, 7);
    }
  for (let y = h - 1; y >= 0; y--)
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      if (d[i] === 0) continue;
      if (x < w - 1) relax(i, i + 1, 5);
      if (y < h - 1) relax(i, i + w, 5);
      if (x < w - 1 && y < h - 1) relax(i, i + w + 1, 7);
      if (x > 0 && y < h - 1) relax(i, i + w - 1, 7);
    }
  for (let i = 0; i < w * h; i++) d[i] = d[i] >= INF ? 1e6 : d[i] / 5;
  return d;
}

const discOffsets = (r: number): Array<[number, number]> => {
  const out: Array<[number, number]> = [];
  for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy++)
    for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx++)
      if (dx * dx + dy * dy <= r * r) out.push([dx, dy]);
  return out;
};

/** dilate a mask by a disc, onto `ok` cells only */
const grow = (w: number, h: number, mask: Uint8Array, r: number, ok: (i: number) => boolean): Uint8Array => {
  const out = new Uint8Array(w * h);
  const off = discOffsets(r);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (!mask[y * w + x]) continue;
      for (const [dx, dy] of off) {
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < w && ny < h && ok(ny * w + nx)) out[ny * w + nx] = 1;
      }
    }
  return out;
};

/** erode a mask by a disc: cells whose whole disc is in the mask */
const shrink = (w: number, h: number, mask: Uint8Array, r: number): Uint8Array => {
  const out = new Uint8Array(w * h);
  const off = discOffsets(r);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let all = 1;
      for (const [dx, dy] of off) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h || !mask[ny * w + nx]) {
          all = 0;
          break;
        }
      }
      out[y * w + x] = all;
    }
  return out;
};

/**
 * A CONTOUR: the `ok` cells at least `depth` from anything that is not
 * `ok`, then opened by a small disc, which files the slivers off — a
 * contour of a road edge inherits every one-cell notch the road has.
 */
function contour(
  w: number,
  h: number,
  ok: (i: number) => boolean,
  dist: Float32Array,
  depth: number,
): Uint8Array {
  const mask = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) if (ok(i) && dist[i] >= depth) mask[i] = 1;
  return grow(w, h, shrink(w, h, mask, 3), 3, () => true);
}

/**
 * A BLOB: an ellipse with a long axis, bent by two cosine lobes into a
 * headland or two — the shape Quagmire's islands are (scripts/maps/geom.mjs).
 */
function stampBlob(
  w: number,
  h: number,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  rot: number,
  lobes: ReadonlyArray<readonly [number, number, number]>,
  put: (i: number) => void,
): void {
  const peak = 1 + lobes.reduce((a, [amp]) => a + Math.abs(amp), 0);
  const rad = Math.max(rx, ry) * peak;
  const c = Math.cos(-rot), s = Math.sin(-rot);
  for (let y = Math.max(0, Math.floor(cy - rad)); y <= Math.min(h - 1, Math.ceil(cy + rad)); y++)
    for (let x = Math.max(0, Math.floor(cx - rad)); x <= Math.min(w - 1, Math.ceil(cx + rad)); x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      const u = (dx * c - dy * s) / rx, v = (dx * s + dy * c) / ry;
      const rho = Math.hypot(u, v);
      const th = Math.atan2(v, u);
      let f = 1;
      for (const [amp, freq, phase] of lobes) f += amp * Math.cos(freq * th + phase);
      if (rho <= f) put(y * w + x);
    }
}

/**
 * Dress a grid in place: its `floor` and `wall` are rewritten from the
 * style, `blocked` is read and never written, and the boulders are
 * returned as decor props in world px. Deterministic for a given `rng`.
 */
export function dressGrid(g: DressGrid, st: DressStyle, rng: Rng): Prop[] {
  const { w, h, blocked, floor, wall } = g;
  const N = w * h;
  const rock = (i: number): boolean => blocked[i] === 1;
  const open = (i: number): boolean => blocked[i] === 0;
  const dFromRock = chamfer(w, h, (i) => !rock(i));
  const dInRock = chamfer(w, h, rock);
  const variant = (first: number): number => first + ((rng() * 3) | 0);
  const pair = (first: number): number => first + ((rng() * 2) | 0);

  const core = st.rock.core ? contour(w, h, rock, dInRock, st.rock.core.depth) : new Uint8Array(N);

  const patches = new Uint8Array(N);
  if (st.road.patches) {
    const p = st.road.patches;
    for (let n = 0, tries = 0; n < p.count && tries < p.count * 80; tries++) {
      const x = (rng() * w) | 0, y = (rng() * h) | 0;
      if (!open(y * w + x)) continue;
      const rx = p.r[0] + rng() * (p.r[1] - p.r[0]);
      const ry = rx * (p.squash + rng() * 0.25);
      stampBlob(
        w, h, x + 0.5, y + 0.5, rx, ry, rng() * Math.PI,
        [[0.06 + rng() * 0.06, 3, rng() * Math.PI * 2], [0.04 + rng() * 0.04, 2, rng() * Math.PI * 2]],
        (i) => { if (open(i)) patches[i] = 1; },
      );
      n++;
    }
  }
  const flats = st.road.flat
    ? grow(w, h, contour(w, h, open, dFromRock, st.road.flat.clear), st.road.flat.grow, open)
    : new Uint8Array(N);

  for (let i = 0; i < N; i++) {
    if (rock(i)) {
      floor[i] = variant(st.road.base);
      wall[i] = core[i] && st.rock.core ? pair(st.rock.core.wall) : pair(st.rock.base);
    } else {
      wall[i] = 0;
      floor[i] = flats[i] && st.road.flat
        ? variant(st.road.flat.floor)
        : patches[i] && st.road.patches
          ? variant(st.road.patches.floor)
          : variant(st.road.base);
    }
  }

  // boulders along the road's edges, never down its middle
  const decor: Prop[] = [];
  if (st.props)
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (!open(i) || dFromRock[i] < 1 || dFromRock[i] > 3.5) continue;
        if (rng() * st.props.per >= 1) continue;
        const kind = st.props.kinds[(rng() * st.props.kinds.length) | 0];
        decor.push({
          x: (x + 0.5) * CELL,
          y: (y + 0.5) * CELL,
          size: CELL * DECOR_TILES[kind],
          rot: ((rng() * 4) | 0) * (Math.PI / 2),
          kind,
        });
      }
  return decor;
}
