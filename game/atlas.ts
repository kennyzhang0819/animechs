import { UNIT_SPRITE } from "./constants";
import {
  floorCanvas,
  propCanvas,
  type PropKind,
  wallCanvas,
  WALL_VARIANTS,
  type FloorKind,
  type WallKind,
} from "./tiles";
import type { UnitKind } from "./levels";
import { ANIMAL_ART } from "./animalFlag";
import {
  HART_TIERS,
  STOOP_TIERS,
  hartLegged,
  hartMech,
  hartSeg,
  stoop,
  stoopGeom,
  toCanvas,
  toCanvasRect,
} from "./animalArt";

/**
 * THE SHEET IS PACKED AT LOAD. Nothing in this file names a pixel
 * coordinate: a cell is asked for by size — `reserve(name, w, h)` — and
 * the packer below hands back the UV rect of a rectangle nothing else
 * owns. Where a cell lands is the packer's business and changes whenever
 * the roster does; what a cell holds, how big it is and what it is
 * called are the only things anyone declares.
 *
 * The sheet used to be laid out by hand, every cell a pair of pixel
 * coordinates typed into this file, and the layout's one invariant — no
 * two cells overlap — was a thing you checked by reading comments. It
 * was also the thing that broke: a cell parked on "the free block right
 * of the environment band" was inside the band, on the large walls and
 * the edge fades, and the hills went blotchy. A packer cannot do that:
 * it only ever chooses from space it has not given out. Three things are
 * guaranteed by construction rather than by care —
 *
 *   - no two cells share a texel: a placed rect is cut out of the free
 *     list before the next request is served;
 *   - nothing is painted outside its cell: every draw goes through
 *     drawCell / paintCell, which CLIP to the cell before touching the
 *     canvas, and the raw context is never handed out;
 *   - nothing samples a neighbour: every cell is placed with a gutter
 *     wide enough that a mip-3 texel at its edge reads only its own
 *     transparent margin (MIP_MARGIN), sized from the art it declares.
 *
 * The sheet is 2048x4096. A WebGL2 context only has to guarantee
 * MAX_TEXTURE_SIZE 2048 and every device that runs the game clears 4096,
 * so 4096 is the longest side allowed. If the roster outgrows it, the
 * packer throws at import with the name of the cell that did not fit,
 * and the one thing to change is ATLAS_W: every UV is a fraction of the
 * sheet, so a wider sheet moves nothing anyone can see.
 */
const ATLAS_W = 2048;
const ATLAS_H = 4096;
const TAU = Math.PI * 2;

export type UVRect = readonly [number, number, number, number];

/**
 * Transparent px between a cell's edge and anything painted beside it.
 *
 * The sheet is sampled through mipmaps down to TEXTURE_MAX_LEVEL 3, where
 * a texel is eight sheet pixels wide, and a LINEAR read at a cell's edge
 * blends the texel under it with the next one over: up to twelve pixels
 * past the edge, on a cell that is not eight-aligned. Two cells that both
 * keep their paint eight px inside their own borders are sixteen apart,
 * so neither read reaches the other's art. A cell whose art comes closer
 * to its edge than that — a floor tile painted corner to corner, a bullet
 * whose region has to be exactly its source — is placed with the
 * difference as a gutter, which is what `Fit.art` is for.
 */
const MIP_MARGIN = 8;

/**
 * How a cell will be used, which is what sets its gutter and how the pack
 * pass draws into it.
 *
 *   inset    px cropped from every side of the cell in the UV handed out —
 *            a sampling margin INSIDE the cell for tiles drawn edge to
 *            edge (see UV_FLOORS). The cell still owns the whole rect.
 *   art      the size the source is drawn at, centred in the cell, in
 *            sheet px. Absent, the source is stretched to FILL the cell
 *            (a 32px tile at 2x into a 64px cell). Present, the source is
 *            drawn at that size and must be that size (drawCell checks),
 *            because the gutter was sized from it.
 *   upright  drawn as authored. Absent, the art is turned a quarter turn
 *            clockwise on its way in, so Mindustry's up-facing sprites
 *            face +x, the heading the renderer calls rotation 0.
 */
interface Fit {
  inset?: number;
  art?: number | readonly [number, number];
  upright?: boolean;
}

interface Cell {
  name: string;
  /** the cell's own rect, gutter excluded */
  x: number;
  y: number;
  w: number;
  h: number;
  inset: number;
  art: readonly [number, number] | null;
  upright: boolean;
}

/** every cell on the sheet, keyed by the UV rect handed out for it — the
 *  UV IS the handle, so a draw call names its cell by the same constant
 *  the renderer samples it through */
const CELLS = new Map<UVRect, Cell>();
/** set once the sheet is packed: a cell reserved after that would never
 *  be drawn or uploaded, so asking for one is a bug */
let sealed = false;

/**
 * THE PACKER: MaxRects with best-short-side-fit, the standard for
 * sheets like this one. The free space is kept as a list of maximal
 * empty rectangles; a request takes the top-left corner of whichever
 * free rect leaves the smallest leftover on its tighter side, and every
 * free rect the placement cuts through is split into the pieces around
 * it. Deterministic for a given sequence of requests, which is what a
 * module's top-level declarations are.
 */
interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
const FREE: Rect[] = [{ x: 0, y: 0, w: ATLAS_W, h: ATLAS_H }];
const contains = (a: Rect, b: Rect): boolean =>
  a.x <= b.x && a.y <= b.y && a.x + a.w >= b.x + b.w && a.y + a.h >= b.y + b.h;

function place(name: string, w: number, h: number): Rect {
  let best = -1, bs = Infinity, bl = Infinity;
  for (let i = 0; i < FREE.length; i++) {
    const f = FREE[i];
    if (f.w < w || f.h < h) continue;
    const s = Math.min(f.w - w, f.h - h), l = Math.max(f.w - w, f.h - h);
    if (s < bs || (s === bs && l < bl)) {
      best = i;
      bs = s;
      bl = l;
    }
  }
  if (best < 0)
    throw new Error(`atlas is full: no room for ${name} (${w}x${h} with its gutter) — raise ATLAS_W in game/atlas.ts`);
  const r: Rect = { x: FREE[best].x, y: FREE[best].y, w, h };
  const next: Rect[] = [];
  for (const f of FREE) {
    if (r.x >= f.x + f.w || r.x + r.w <= f.x || r.y >= f.y + f.h || r.y + r.h <= f.y) {
      next.push(f);
      continue;
    }
    if (r.x > f.x) next.push({ x: f.x, y: f.y, w: r.x - f.x, h: f.h });
    if (r.x + r.w < f.x + f.w) next.push({ x: r.x + r.w, y: f.y, w: f.x + f.w - (r.x + r.w), h: f.h });
    if (r.y > f.y) next.push({ x: f.x, y: f.y, w: f.w, h: r.y - f.y });
    if (r.y + r.h < f.y + f.h) next.push({ x: f.x, y: r.y + r.h, w: f.w, h: f.y + f.h - (r.y + r.h) });
  }
  FREE.length = 0;
  for (let i = 0; i < next.length; i++) {
    const a = next[i];
    let kept = true;
    for (let j = 0; j < next.length && kept; j++) {
      if (j === i) continue;
      const b = next[j];
      // a rect inside another is redundant; of two identical ones the
      // first survives
      if (contains(b, a) && !(contains(a, b) && j > i)) kept = false;
    }
    if (kept) FREE.push(a);
  }
  return r;
}

/**
 * A CELL ON THE SHEET, `w` x `h` sheet px, as the UV rect the renderer
 * samples it through. The only way to get room on the sheet.
 */
function reserve(name: string, w: number, h: number, fit: Fit = {}): UVRect {
  if (sealed) throw new Error(`atlas cell ${name} reserved after the sheet was packed`);
  if (!Number.isInteger(w) || !Number.isInteger(h) || w <= 0 || h <= 0)
    throw new Error(`atlas cell ${name}: a cell is a whole number of px, not ${w}x${h}`);
  const inset = fit.inset ?? 0;
  const art: Cell["art"] =
    fit.art === undefined ? null : typeof fit.art === "number" ? [fit.art, fit.art] : [fit.art[0], fit.art[1]];
  // how far the paint keeps from the edge: a fill covers the cell, so
  // nothing; art centred in a bigger cell, half the difference
  const margin = art ? Math.min((w - art[0]) / 2, (h - art[1]) / 2) : 0;
  const pad = Math.max(0, Math.ceil(MIP_MARGIN - margin));
  const at = place(name, w + pad * 2, h + pad * 2);
  const cell: Cell = { name, x: at.x + pad, y: at.y + pad, w, h, inset, art, upright: fit.upright === true };
  const uv: UVRect = [
    (cell.x + inset) / ATLAS_W,
    (cell.y + inset) / ATLAS_H,
    (cell.x + w - inset) / ATLAS_W,
    (cell.y + h - inset) / ATLAS_H,
  ];
  CELLS.set(uv, cell);
  return uv;
}

const cellOf = (uv: UVRect): Cell => {
  const cell = CELLS.get(uv);
  if (!cell) throw new Error("not a cell on this sheet: every UV a draw names must come from reserve()");
  return cell;
};

// The shapes a cell comes in, so a declaration reads as what the cell
// holds rather than as a set of options:
/** a tile drawn edge to edge, as authored, sampled `inset` px in */
const tile = (name: string, size: number, inset: number): UVRect =>
  reserve(name, size, size, { inset, upright: true });
/** a piece of art at native size, centred, turned to face +x */
const sprite = (name: string, cell: number, art: number | readonly [number, number]): UVRect =>
  reserve(name, cell, cell, { art });
/** the same, kept as authored — a knee cap is drawn unrotated */
const upright = (name: string, cell: number, art: number | readonly [number, number]): UVRect =>
  reserve(name, cell, cell, { art, upright: true });
/** a turret top: fills its cell (the renderer maps the whole cell onto a
 *  size*CELL quad, so the cell must hug the art) and faces +x */
const top = (name: string, size: number): UVRect => reserve(name, size, size, {});
/** a block that never turns, filling its cell as authored: a turret
 *  base, a leg segment stretched corner to corner, a beam strip */
const flat = (name: string, w: number, h = w): UVRect => reserve(name, w, h, { upright: true });

// ---------------------------------------------------------------------
// THE FLOORS
// ---------------------------------------------------------------------

/** px cropped from every side of a 64px land-floor cell — see UV_FLOORS */
const FLOOR_INSET = 8;
/**
 * A water block is 3x3 tiles, and the ring round the middle is not
 * padding: water is the one floor drawn through a shader that SAMPLES OFF
 * THE TILE. Mindustry's water.frag displaces its read horizontally by up
 * to a world unit per row (the swell), which on a plain 64px cell would
 * reach into whatever is packed next door and smear it across the sea.
 * Tiling the same 32px source nine times and handing the renderer the
 * CENTRE tile — the block inset by one tile — means a displaced read
 * lands on more water: a whole tile of headroom in every direction, eight
 * times the largest displacement the shader can ask for.
 */
const WATER_TILE = 192;

/**
 * THE FLOOR GROUPS, in table order. A floor index is baked into every
 * map document on disk, so this list is APPENDED to and never reordered:
 * the FLOOR_* constants below are its positions times three.
 *
 * Every group is three wide, because the renderer reads a floor's blend
 * group as `(index / 3) | 0`. A land family paints three variants; the
 * waters ship as one tile and salt as one (the maps on disk were drawn
 * with one), and those groups repeat their single cell three times so
 * the arithmetic holds and a hand-edited document cannot index past the
 * table.
 */
type WaterKey = "shallowWater" | "deepWater" | "taintedWater" | "deepTaintedWater";
const FLOOR_GROUPS: readonly ({ kind: FloorKind; slots: number } | { water: WaterKey })[] = [
  { kind: "grass", slots: 3 },
  { kind: "stone", slots: 3 },
  { kind: "dirt", slots: 3 },
  { kind: "sand", slots: 3 },
  { kind: "darksand", slots: 3 },
  { water: "shallowWater" },
  { water: "deepWater" },
  // the second batch: Mindustry's "moss" IS the purple spore growth, not
  // a green one; the two moss families and the spore waters are one
  // palette, which is what makes them a biome rather than extra tiles
  { kind: "moss", slots: 3 },
  { kind: "sporeMoss", slots: 3 },
  { kind: "mud", slots: 3 },
  { kind: "shale", slots: 3 },
  { kind: "snow", slots: 3 },
  { kind: "salt", slots: 1 },
  { kind: "ice", slots: 3 },
  { kind: "basalt", slots: 3 },
  { water: "taintedWater" },
  { water: "deepTaintedWater" },
];
/** each group's painted cells: one per variant, or the one water block */
const FLOOR_CELLS: readonly (readonly UVRect[])[] = FLOOR_GROUPS.map((g) =>
  "water" in g
    ? [reserve(`floor-${g.water}`, WATER_TILE, WATER_TILE, { inset: 64, upright: true })]
    : Array.from({ length: g.slots }, (_, s) => tile(`floor-${g.kind}-${s}`, 64, FLOOR_INSET)),
);
/**
 * THE LAND FLOORS ARE INSET BY 8. The texture is sampled through mipmaps,
 * so a floor drawn small — the whole map in frame — reads texels that
 * straddle the cell's border; Mindustry's speckled floors hid that in
 * their own noise, a flat tile shows it as a hairline along every row.
 * Eight px keeps the sample inside its own cell down to the 8px mip. The
 * painted tiles keep their marks off the outer two logical pixels
 * (tiles.ts), so the crop removes plain ground and nothing else.
 */
export const UV_FLOORS: readonly UVRect[] = FLOOR_CELLS.flatMap((cells) =>
  [0, 1, 2].map((s) => cells[Math.min(s, cells.length - 1)]),
);
/**
 * UV distance of ONE MINDUSTRY WORLD UNIT along x on a water cell — what
 * the water shader multiplies its displacement by. A tile is 64 atlas px
 * and 8 world units across, so this is an eighth of a cell.
 */
export const WATER_UV_UNIT = 64 / 8 / ATLAS_W;

/** first index of each water group — what the palette and the map
 *  generators paint, and what `(i / 3) | 0` turns into GROUP_WATER_* */
export const FLOOR_SHALLOW_WATER = 15;
export const FLOOR_DEEP_WATER = 18;
// first index of each second-batch group, in table order
export const FLOOR_MOSS = 21;
export const FLOOR_SPORE_MOSS = 24;
export const FLOOR_MUD = 27;
export const FLOOR_SHALE = 30;
export const FLOOR_SNOW = 33;
export const FLOOR_SALT = 36;
export const FLOOR_ICE = 39;
export const FLOOR_BASALT = 42;
export const FLOOR_TAINTED_WATER = 45;
export const FLOOR_DEEP_TAINTED_WATER = 48;

/**
 * WHICH FLOOR GROUPS ARE WATER — the whole definition of where a walker
 * drowns and where a naval tank runs at full pace, and the reason it is a
 * list rather than a comparison.
 *
 * It used to be `floor >= FLOOR_SHALLOW_WATER`, which was exact while the
 * two waters were the last two groups in the table. They cannot stay last:
 * a floor index is baked into every saved map document, so a new family
 * has to be APPENDED, and the first one appended put land above the
 * waterline. Naming the groups is the version of the rule that survives
 * the next family too.
 */
export const WATER_FLOOR_GROUPS: readonly number[] = [
  5, // shallow water
  6, // deep water
  15, // shallow spore water
  16, // deep spore water
];

/**
 * What a DEEP water cell drains to when its block is erased — the same
 * water, no longer deep. Each deep group answers with its own shallow one,
 * so draining a spore lake does not leave a clear puddle in it.
 */
export const SHALLOW_FOR_DEEP: Readonly<Record<number, number>> = {
  [FLOOR_DEEP_WATER]: FLOOR_SHALLOW_WATER,
  [FLOOR_DEEP_TAINTED_WATER]: FLOOR_TAINTED_WATER,
};

// ---------------------------------------------------------------------
// THE FLOOR EDGE FADES
// ---------------------------------------------------------------------

/**
 * Per-group floor edge fades (Mindustry's generated <floor>-edge sprites):
 * a 192px block per land family, a 3x3 of 64px sub-cells in image space.
 * A tile bordered by a higher-priority floor gets that floor's sub-cell
 * (col 1-dx, row 1-dy) overlaid, so the neighbour's texture fades across
 * the tile seam exactly like Floor.drawEdges.
 *
 * THE FADES ARE INSET ON THE BLOCK'S OUTER EDGES ONLY. A fade sub-cell is
 * drawn over a whole tile, so its outer edge lands on the tile's FAR
 * border, where the sampler would otherwise read the gutter. The outer
 * sides take the floors' inset, which crops the transparent tail of the
 * fade and nothing else; the inner seams between sub-cells and the side
 * that meets the centre stay as they are, so the fade still reaches the
 * shared border at full strength.
 */
const EDGE_INSET = FLOOR_INSET;
const edgeQuads = (uv: UVRect): ReadonlyArray<readonly UVRect[]> => {
  const { x: bx, y: by } = cellOf(uv);
  return [0, 1, 2].map((ry) =>
    [0, 1, 2].map((rx): UVRect => [
      (bx + rx * 64 + (rx === 0 ? EDGE_INSET : 0)) / ATLAS_W,
      (by + ry * 64 + (ry === 0 ? EDGE_INSET : 0)) / ATLAS_H,
      (bx + rx * 64 + 64 - (rx === 2 ? EDGE_INSET : 0)) / ATLAS_W,
      (by + ry * 64 + 64 - (ry === 2 ? EDGE_INSET : 0)) / ATLAS_H,
    ]),
  );
};
/**
 * Which land family each group's fade is generated from, in FLOOR_GROUPS
 * order. null is a group with no fade art: the waters, which sit at the
 * BOTTOM of the blend order (GROUP_PRI in renderer.ts) and never overlay
 * anything, and sand, whose only inferior floor (stone) shares no map
 * with it yet. Those take stone's block as a stand-in to keep the group
 * indices aligned — stone is the lowest land priority and its fade is
 * never drawn either.
 */
const EDGE_KINDS: readonly (FloorKind | null)[] = [
  "grass", "stone", "dirt", null, "darksand", null, null,
  "moss", "sporeMoss", "mud", "shale", "snow", "salt", "ice", "basalt", null, null,
];
const EDGE_CELLS: readonly (UVRect | null)[] = EDGE_KINDS.map((k) =>
  k ? reserve(`edge-${k}`, 192, 192, { upright: true }) : null,
);
const STONE_EDGE = EDGE_CELLS[1]!;
export const UV_FLOOR_EDGES: ReadonlyArray<ReadonlyArray<readonly UVRect[]>> = EDGE_CELLS.map((c) =>
  edgeQuads(c ?? STONE_EDGE),
);

// ---------------------------------------------------------------------
// THE WALLS
// ---------------------------------------------------------------------

/**
 * px cropped from every side of a 64px wall cell — the floors' rule
 * (FLOOR_INSET), for the same reason: a wall drawn small reads texels
 * that straddle the cell's border. Eight keeps it inside down to the 8px
 * mip. The painted walls keep their one pebble four logical px off the
 * rim (tiles.ts), so the crop takes plain band.
 */
const WALL_INSET = 8;
/**
 * The wall families in UV_WALLS order, two variants each. The two nulls
 * are the SENTINELS — WALL_PINE at 4 and WALL_DEEP at 7 — whose slots are
 * never-drawn placeholders (stone's first cell), since everything tests
 * those values explicitly and draws the cell's floor (plus, for a pine,
 * its prop) instead of a wall sprite. Past them every family is ordinary
 * buildable rock (isBuildableWall names only the sentinels).
 */
const WALL_KINDS_IN_ORDER: readonly (WallKind | null)[] = [
  "stone", "dirt", null, "dark", null,
  "spore", "shale", "snow", "ice", "salt", "sand", "dune", "dacite",
];
const WALL_CELLS: readonly (readonly UVRect[] | null)[] = WALL_KINDS_IN_ORDER.map((k) =>
  k ? Array.from({ length: WALL_VARIANTS }, (_, v) => tile(`wall-${k}-${v}`, 64, WALL_INSET)) : null,
);
export const UV_WALLS: readonly UVRect[] = WALL_CELLS.flatMap((cells) => cells ?? [WALL_CELLS[0]![0]]);
// which wall family each UV_WALLS index belongs to (0 stone, 1 dirt,
// 2 dark rock, then the second band's eight; -1 the pine and deep-water
// sentinels) — StaticWall's large-draw rule works per block type, so 2x2
// detection must ignore the variant within a family
export const WALL_GROUP: readonly number[] = [
  0, 0, 1, 1, -1, 2, 2, -1,
  3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10,
];
/** first index of each second-band wall family */
export const WALL_SPORE = 8;
export const WALL_SHALE = 10;
export const WALL_SNOW = 12;
export const WALL_ICE = 14;
export const WALL_SALT = 16;
export const WALL_SAND = 18;
export const WALL_DUNE = 20;
export const WALL_DACITE = 22;
/**
 * Mindustry's <wall>-large art: one 2x2-tile block per family, split
 * into per-tile quadrant UVs [row][col] in screen space (y down). null
 * is a family without large art (dirt: fringe slopes, aligned 2x2 blocks
 * are rare), which draws per-tile variants everywhere.
 *
 * THE INSET IS ON THE BLOCK'S OUTER EDGES ONLY. The four quadrants are
 * one continuous painting, so a texel straddling the seam between two of
 * them averages art that belongs on both sides — that is what a seamless
 * block looks like through a mipmap. Insetting the inner edges as well
 * would skip a strip of the painting at every seam and break the bands
 * that run corner to corner across the whole block.
 */
const largeQuads = (uv: UVRect): ReadonlyArray<readonly UVRect[]> => {
  const { x, y } = cellOf(uv);
  return [0, 1].map((row) =>
    [0, 1].map((col): UVRect => [
      (x + col * 64 + (col === 0 ? WALL_INSET : 0)) / ATLAS_W,
      (y + row * 64 + (row === 0 ? WALL_INSET : 0)) / ATLAS_H,
      (x + col * 64 + 64 - (col === 1 ? WALL_INSET : 0)) / ATLAS_W,
      (y + row * 64 + 64 - (row === 1 ? WALL_INSET : 0)) / ATLAS_H,
    ]),
  );
};
/** the families with large art, in WALL_GROUP order */
const LARGE_KINDS: readonly (WallKind | null)[] = [
  "stone", null, "dark", "spore", "shale", "snow", "ice", "salt", "sand", "dune", "dacite",
];
const LARGE_CELLS: readonly (UVRect | null)[] = LARGE_KINDS.map((k) =>
  k ? reserve(`wall-${k}-large`, 128, 128, { upright: true }) : null,
);
export const UV_WALL_LARGE: ReadonlyArray<ReadonlyArray<readonly UVRect[]> | null> = LARGE_CELLS.map((c) =>
  c ? largeQuads(c) : null,
);

// ---------------------------------------------------------------------
// THE PROPS
// ---------------------------------------------------------------------

/**
 * px cropped from every side of a prop cell. A prop is a shape on a
 * transparent ground and its cell is cut to its art with nothing round
 * it, so the quad's edge sampled half a texel of whatever was packed
 * beside it. Four px is enough for the mips a prop is drawn at, and every
 * painted prop keeps its shape well clear of the rim (the tightest, a
 * pine's canopy, stops six px short of a 96px cell).
 */
const PROP_INSET = 4;
/** a prop's cell is its 48/40/32px art at 2x, and nothing more: the
 *  renderer maps the whole cell onto a DECOR_TILES-sized quad */
const prop = (kind: PropKind, cell: number): UVRect => tile(`prop-${kind}`, cell, PROP_INSET);
/**
 * THE FOREST KINDS, indexed by a pine prop's `kind`.
 *
 * A pine used to be the one prop with no variation at all — WALL_PINE
 * meant "the pine", and Prop.kind was documented as unused on one. It is
 * the index into this table now, so a map can be forested in the tree that
 * belongs to its biome; kind 0 is the original, so every pine already on
 * disk keeps drawing exactly what it drew.
 */
const PINE_KINDS: readonly PropKind[] = ["pine", "sporePine", "snowPine"];
export const UV_PINES: readonly UVRect[] = PINE_KINDS.map((k) => prop(k, 96));
export const UV_PINE = UV_PINES[0];
/**
 * Ground clutter, indexed by a decor prop's `kind`, with the cell each
 * takes: its source at 2x. DECOR_TILES below is the other half of that:
 * how many TILES across each one is at native scale.
 */
const DECOR_KINDS: readonly (readonly [PropKind, number])[] = [
  ["boulder0", 96],
  ["boulder1", 96],
  ["shrubs", 64],
  ["sporeCluster0", 80],
  ["sporeCluster1", 80],
  ["sporeCluster2", 80],
  ["purBush", 64],
  ["shaleBoulder0", 64],
  ["shaleBoulder1", 64],
  ["snowBoulder0", 96],
  ["snowBoulder1", 96],
  ["shrubs2", 64],
  ["sandBoulder0", 64],
  ["sandBoulder1", 64],
];
export const UV_DECOR: readonly UVRect[] = DECOR_KINDS.map(([k, cell]) => prop(k, cell));
/**
 * How wide each decor sprite is IN TILES at Mindustry's own scale — a
 * 32px prop covers one 32px tile, a 48px boulder overhangs to 1.5, a 40px
 * spore cluster to 1.25. Multiply by CELL for the world size to draw it
 * at. This was a conditional on the shrub's index while there were three
 * props and two sizes between them; a table is what stops the fourth size
 * from having to be another branch.
 */
export const DECOR_TILES: readonly number[] = [
  1.5, 1.5, 1, 1.25, 1.25, 1.25, 1, 1, 1, 1.5, 1.5, 1, 1, 1,
];

// ---------------------------------------------------------------------
// STRUCTURES, EFFECTS AND THE ODD SHAPES
// ---------------------------------------------------------------------

// mechanical spawn-pad tile — currently unused: drop zones are shown as
// overlay circles, and no terrain pass paints spawn cells any more
export const UV_SPAWN = tile("spawn-pad", 64, 2);
// a stroked ring, procedural
export const UV_RING = reserve("ring", 64, 64, { art: 54, upright: true });
// a plain opaque texel, for geometry the renderer strokes itself:
// Lines.circle draws a constant-width ring, which a scaled ring SPRITE
// cannot do (its band fattens with the radius). Inset well past the mip-3
// footprint so every sampled level stays pure white
export const UV_SOLID = reserve("solid", 32, 32, { inset: 8, upright: true });
// a plain filled white circle: the particle Mindustry's Fill.circle draws
// by the dozen in every flame effect. UV_SOLID cannot stand in for it — a
// square particle reads as a pixel cloud, not a tongue of fire
export const UV_DISC = reserve("disc", 64, 64, { art: 54, upright: true });
/**
 * A BIG smooth disc, 256px, for the shield domes (the Shield Towers
 * mutator) — the same shape as UV_DISC and nothing like the same
 * resolution.
 *
 * The atlas magnifies with NEAREST, deliberately: it is pixel art and the
 * whole roster wants crisp texels when zoomed in. A dome is the one thing
 * drawn through it that is NOT pixel art — it is a smooth curve blown up
 * to sixteen tiles across — so the 64px disc reaches it at 5x
 * magnification and its edge arrives as a staircase of eight-pixel steps.
 * At 256px the biggest dome in the game is a 1.25x blow-up and the
 * smallest is a MINIFICATION, which takes the mipmap path and comes out
 * smoother still.
 *
 * Its own edge is drawn antialiased into the atlas canvas, so what the
 * shield shader's edge detect sees is a clean alpha ramp rather than a
 * hard step — which is what the rim is traced around.
 */
export const UV_DISC_BIG = reserve("disc-big", 256, 256, { art: 248, upright: true });
// white isosceles triangle, base at -x edge, apex at +x — tinted at draw
// time for shrapnel rays (Drawf.tri)
export const UV_TRI = reserve("tri", 64, 64, { inset: 2, upright: true });

// THE TURRET TOPS each hug their art exactly: the renderer maps the whole
// cell onto a size*CELL quad, so a sprite parked inside a larger cell
// would draw small. Mindustry block art is 32px a tile, so a size-1 top
// is a 32px source at 2x, a size-2 top 64px at 2x, and the size-3 and
// size-4 tops (96 and 128) stay NATIVE — anything but an integer upscale
// shreds their antialiasing. The bases are the same at each size.
export const UV_TOWER_BASE = flat("tower-base-2", 128);
export const UV_TURRET = top("salvo", 128);
export const UV_SCATTER = top("scatter", 128);
export const UV_FUSE = top("fuse", 96);
export const UV_TOWER_BASE3 = flat("tower-base-3", 96);
export const UV_DUO = top("duo", 64);
export const UV_TOWER_BASE1 = flat("tower-base-1", 64);
export const UV_HAIL = top("hail", 64);
export const UV_SCORCH = top("scorch", 64);
export const UV_ARC = top("arc", 64);
export const UV_LANCER = top("lancer", 128);
export const UV_PARALLAX = top("parallax", 128);
export const UV_RIPPLE = top("ripple", 96);
export const UV_WAVE = top("wave", 128);
export const UV_TSUNAMI = top("tsunami", 96);
export const UV_SWARMER = top("swarmer", 128);
export const UV_CYCLONE = top("cyclone", 96);
export const UV_SPECTRE = top("spectre", 128);
export const UV_MELTDOWN = top("meltdown", 128);
export const UV_FORESHADOW = top("foreshadow", 128);
export const UV_TOWER_BASE4 = flat("tower-base-4", 128);
/**
 * The blocks that never turn keep the heading they were drawn at: the
 * shield tower (the Shield Towers mutator, Mindustry's force projector,
 * 96px of 3x3 block art) and the support pair, the mender a 32px source
 * at 2x, the projector a 64px one at 2x.
 */
export const UV_SHIELD_TOWER = flat("shield-tower", 96);
export const UV_MEND_PROJECTOR = flat("mend-projector", 128);
export const UV_MENDER = flat("mender", 64);
/**
 * Parallax's beam, the two regions Drawf.laser stretches between the
 * turret and its target. The line is packed ROTATED — its 4x48 source runs
 * along the beam, and pushSeg maps a region's WIDTH along the line it is
 * stretched down.
 *
 * Both cells hug the OPAQUE art, not the source rect, and that is not
 * tidiness: Arc's packer trims a sprite's transparent border and Mindustry
 * then draws the trimmed region, so `parallax-laser` is really 4x24 and
 * `parallax-laser-end` really 32x32. Taking the source rects instead put a
 * quarter of transparent film on each end of a STRETCHED beam — the line
 * drew at half length, floating between the turret and its target — and
 * made the end glow, whose size Drawf.laser reads off the region itself,
 * less than half of what it should be. The pack pass draws the full
 * source centred on the cell and the clip takes the film off.
 */
export const UV_PARALLAX_LASER = reserve("parallax-laser", 24, 4, { art: [24, 4] });
export const UV_PARALLAX_LASER_END = sprite("parallax-laser-end", 32, 32);
// the player's base, the core nucleus at native 160px
export const UV_BASE = flat("base", 160);

/**
 * The bullet regions and the shell regions. Every one is packed WHITE and
 * at its exact source size, which is the only way BasicBulletType.draw
 * comes out right.
 *
 * White, because an ammo type is a pair of colours over one pair of shapes:
 * duo's copper pellet, salvo's thorium round and scatter's flak shell are
 * the same two sprites tinted differently. Baking a colour in would need a
 * cell per ammo and would still lose the two separate Draw.color passes.
 *
 * Exact size, because Draw.rect maps the WHOLE region onto the shot's
 * width x height box, and pack.json exempts everything under `effects/`
 * from whitespace stripping (ignoredWhitespaceStrings) — so the region
 * Mindustry scales is the full 52x52 or 36x36 source, transparent border
 * and all. A cell any larger than the source would draw the art small by
 * exactly that ratio.
 *
 * The `-back` sprite is the longer of each pair: 40px of art in bullet's
 * 52 against the inner region's 28, and 32 of shell's 36 against 20. Drawn
 * into the same box it therefore sticks out fore and aft, which is the
 * rim you see on every Mindustry shot. Both face +x, like all the other
 * rotated art.
 */
export const UV_BULLET = sprite("bullet", 52, 52);
export const UV_BULLET_BACK = sprite("bullet-back", 52, 52);
export const UV_SHELL = sprite("shell", 36, 36);
export const UV_SHELL_BACK = sprite("shell-back", 36, 36);
// the third pair: swarmer's warhead. 36x36 like the shell, and the same rule
export const UV_MISSILE = sprite("missile", 36, 36);
export const UV_MISSILE_BACK = sprite("missile-back", 36, 36);
/**
 * THE SWARM'S OWN BULLET SPRITES, on the same rule — white, source size,
 * facing +x, the `-back` beside its front:
 *
 *   - circle-bullet (48): navanax's emp round;
 *   - mine-bullet (64): the retusa's torpedo;
 *   - missile-large (56): cyerce's plasma missile;
 *   - disrupt-missile (39x60): the disrupt's missile UNIT, which is drawn as
 *     itself — coloured art with Pal.darkOutline, so it takes the outline
 *     pass a unit sprite does and is pushed untinted;
 *   - laser (4x48) and laser-end (72): what Drawf.laser draws a sap beam
 *     with — the strip is the beam's cross-section (4 along, 48 across,
 *     so it is packed unrotated and stretched along the line), the cap a
 *     soft disc laid on each end.
 */
export const UV_CIRCLE_BULLET = sprite("circle-bullet", 48, 48);
export const UV_CIRCLE_BULLET_BACK = sprite("circle-bullet-back", 48, 48);
export const UV_MINE_BULLET = sprite("mine-bullet", 64, 64);
export const UV_MINE_BULLET_BACK = sprite("mine-bullet-back", 64, 64);
export const UV_MISSILE_LARGE = sprite("missile-large", 56, 56);
export const UV_MISSILE_LARGE_BACK = sprite("missile-large-back", 56, 56);
export const UV_DISRUPT_MISSILE = sprite("disrupt-missile", 64, [39, 60]);
export const UV_LASER_END = flat("laser-end", 72);
export const UV_LASER = flat("laser", 4, 48);

// ---------------------------------------------------------------------
// THE UNITS
// ---------------------------------------------------------------------
//
// Every part rides at native size in a cell that sets its world scale:
// the renderer draws a mech's quads at MechArt.sprite, which is the cell
// size times the sheet's constant 0.625 world px per native px, so a 64px
// cell draws at UNIT_SPRITE, a 128 at UNIT_SPRITE * 2 and a 256 at
// UNIT_SPRITE * 4. A part takes the smallest cell that holds its art, and
// every part of one unit takes the same size because the unit draws them
// all at one scale. A `-sil` cell is the same part as a solid #565666
// silhouette: pushMech lays these under the whole walking assembly so one
// rim traces the unit's outer silhouette, where per-part baked outlines
// drew a line at every seam of the animated mech.
//
// A leg SEGMENT breaks the rule on purpose: it is stretched corner to
// corner between two moving points (Mindustry Lines.line), so its cell is
// the art's exact rect — any padding would be stretched with it — and its
// stroke is the rect's height (Lines.stroke(legRegion.height)).

// the ground line
export const UV_DAGGER_LEG = sprite("dagger-leg", 64, 48);
export const UV_DAGGER_BASE = sprite("dagger-base", 64, 48);
export const UV_DAGGER_BODY = sprite("dagger", 64, 48);
export const UV_LARGE_WEAPON = sprite("large-weapon", 64, 48);
export const UV_MACE_LEG = sprite("mace-leg", 64, 64);
export const UV_MACE_BASE = sprite("mace-base", 64, 64);
export const UV_MACE_BODY = sprite("mace", 64, 64);
export const UV_FLAMETHROWER = sprite("flamethrower", 64, [48, 56]);
export const UV_DAGGER_LEG_SIL = sprite("dagger-leg-sil", 64, 48);
export const UV_DAGGER_BASE_SIL = sprite("dagger-base-sil", 64, 48);
export const UV_DAGGER_BODY_SIL = sprite("dagger-sil", 64, 48);
export const UV_LARGE_WEAPON_SIL = sprite("large-weapon-sil", 64, 48);
export const UV_MACE_LEG_SIL = sprite("mace-leg-sil", 64, 64);
export const UV_MACE_BASE_SIL = sprite("mace-base-sil", 64, 64);
export const UV_MACE_BODY_SIL = sprite("mace-sil", 64, 64);
export const UV_FLAMETHROWER_SIL = sprite("flamethrower-sil", 64, [48, 56]);
// the T3 outgrows 64px cells (body 100x80, leg 80x60 at native scale)
export const UV_FORTRESS_LEG = sprite("fortress-leg", 128, [80, 60]);
export const UV_FORTRESS_BASE = sprite("fortress-base", 128, 64);
export const UV_FORTRESS_BODY = sprite("fortress", 128, [100, 80]);
export const UV_ARTILLERY = sprite("artillery", 128, [48, 56]);
export const UV_FORTRESS_LEG_SIL = sprite("fortress-leg-sil", 128, [80, 60]);
export const UV_FORTRESS_BASE_SIL = sprite("fortress-base-sil", 128, 64);
export const UV_FORTRESS_BODY_SIL = sprite("fortress-sil", 128, [100, 80]);
export const UV_ARTILLERY_SIL = sprite("artillery-sil", 128, [48, 56]);
/**
 * The T4: scepter's hull alone is a 170x140 source, half again as wide as
 * the 128px cells the T3s sit in, so the whole line rides 256px cells.
 */
export const UV_SCEPTER_BODY = sprite("scepter", 256, [170, 140]);
export const UV_SCEPTER_BODY_SIL = sprite("scepter-sil", 256, [170, 140]);
export const UV_SCEPTER_LEG = sprite("scepter-leg", 256, 128);
export const UV_SCEPTER_LEG_SIL = sprite("scepter-leg-sil", 256, 128);
export const UV_SCEPTER_BASE = sprite("scepter-base", 256, 128);
export const UV_SCEPTER_BASE_SIL = sprite("scepter-base-sil", 256, 128);
export const UV_SCEPTER_WEAPON = sprite("scepter-weapon", 256, [56, 102]);
export const UV_SCEPTER_WEAPON_SIL = sprite("scepter-weapon-sil", 256, [56, 102]);
export const UV_SCEPTER_MOUNT = sprite("scepter-mount", 256, 48);
export const UV_SCEPTER_MOUNT_SIL = sprite("scepter-mount-sil", 256, 48);
// the T5: the same four-part mech, one tier heavier
export const UV_REIGN_BODY = sprite("reign", 256, [214, 140]);
export const UV_REIGN_BODY_SIL = sprite("reign-sil", 256, [214, 140]);
export const UV_REIGN_BASE = sprite("reign-base", 256, [152, 124]);
export const UV_REIGN_BASE_SIL = sprite("reign-base-sil", 256, [152, 124]);
export const UV_REIGN_LEG = sprite("reign-leg", 256, [152, 124]);
export const UV_REIGN_LEG_SIL = sprite("reign-leg-sil", 256, [152, 124]);
export const UV_REIGN_WEAPON = sprite("reign-weapon", 256, [83, 138]);
export const UV_REIGN_WEAPON_SIL = sprite("reign-weapon-sil", 256, [83, 138]);

// the crawler line: the T1 a mech, the rest legged
export const UV_CRAWLER_LEG = sprite("crawler-leg", 64, 48);
export const UV_CRAWLER_BASE = sprite("crawler-base", 64, 48);
export const UV_CRAWLER_BODY = sprite("crawler", 64, 48);
export const UV_CRAWLER_LEG_SIL = sprite("crawler-leg-sil", 64, 48);
export const UV_CRAWLER_BASE_SIL = sprite("crawler-base-sil", 64, 48);
export const UV_CRAWLER_BODY_SIL = sprite("crawler-sil", 64, 48);
/**
 * The legged T2 and T3: body, mount plate and guns face +x on 128px
 * cells, feet the same on 64px ones. A JOINT is drawn with no rotation at
 * all in Mindustry, so its cell is packed upright. The segment sprites
 * fill their source rect edge to edge, so they get no silhouette: the
 * dilation an outline pass would add is clipped away at the rect, exactly
 * as in Mindustry's own packer, and the leg art carries its dark edging
 * hand-drawn anyway.
 */
export const UV_ATRAX_BODY = sprite("atrax", 128, [88, 64]);
export const UV_ATRAX_BASE = sprite("atrax-base", 128, 64);
export const UV_ATRAX_WEAPON = sprite("atrax-weapon", 128, [48, 56]);
export const UV_ATRAX_BODY_SIL = sprite("atrax-sil", 128, [88, 64]);
export const UV_ATRAX_BASE_SIL = sprite("atrax-base-sil", 128, 64);
export const UV_ATRAX_WEAPON_SIL = sprite("atrax-weapon-sil", 128, [48, 56]);
export const UV_ATRAX_JOINT = upright("atrax-joint", 64, 26);
export const UV_ATRAX_FOOT = sprite("atrax-foot", 64, 40);
export const UV_ATRAX_JOINT_SIL = upright("atrax-joint-sil", 64, 26);
export const UV_ATRAX_FOOT_SIL = sprite("atrax-foot-sil", 64, 40);
export const UV_ATRAX_LEG = flat("atrax-leg", 36, 26);
export const UV_ATRAX_LEG_BASE = flat("atrax-leg-base", 36, 26);
export const UV_SPIROCT_BODY = sprite("spiroct", 128, [94, 75]);
export const UV_SPIROCT_WEAPON = sprite("spiroct-weapon", 128, [48, 56]);
export const UV_SPIROCT_MOUNT = sprite("spiroct-mount", 128, 48);
export const UV_SPIROCT_BODY_SIL = sprite("spiroct-sil", 128, [94, 75]);
export const UV_SPIROCT_WEAPON_SIL = sprite("spiroct-weapon-sil", 128, [48, 56]);
export const UV_SPIROCT_MOUNT_SIL = sprite("spiroct-mount-sil", 128, 48);
export const UV_SPIROCT_JOINT = upright("spiroct-joint", 64, 32);
export const UV_SPIROCT_FOOT = sprite("spiroct-foot", 64, 46);
export const UV_SPIROCT_JOINT_SIL = upright("spiroct-joint-sil", 64, 32);
export const UV_SPIROCT_FOOT_SIL = sprite("spiroct-foot-sil", 64, 46);
export const UV_SPIROCT_LEG = flat("spiroct-leg", 48, 34);
export const UV_SPIROCT_LEG_BASE = flat("spiroct-leg-base", 48, 34);
/**
 * The T4: hull and guns on 256px cells — the sap gun is the spiroct's own
 * weapon sprite packed a second time, because a legged unit draws every
 * gun at its own LegArt.sprite and arkyid's is 256. Its feet and shoulder
 * plates ride 128px cells (their 70px sources keep a wide margin there),
 * and its two leg segments the exact rects their art occupies.
 */
export const UV_ARKYID_BODY = sprite("arkyid", 256, 128);
export const UV_ARKYID_BODY_SIL = sprite("arkyid-sil", 256, 128);
export const UV_ARKYID_WEAPON = sprite("arkyid-weapon", 256, [48, 56]);
export const UV_ARKYID_WEAPON_SIL = sprite("arkyid-weapon-sil", 256, [48, 56]);
export const UV_ARKYID_MOUNT = sprite("arkyid-mount", 256, [70, 97]);
export const UV_ARKYID_MOUNT_SIL = sprite("arkyid-mount-sil", 256, [70, 97]);
export const UV_ARKYID_FOOT = sprite("arkyid-foot", 128, 70);
export const UV_ARKYID_FOOT_SIL = sprite("arkyid-foot-sil", 128, 70);
export const UV_ARKYID_JOINT_BASE = sprite("arkyid-joint-base", 128, 70);
export const UV_ARKYID_JOINT_BASE_SIL = sprite("arkyid-joint-base-sil", 128, 70);
export const UV_ARKYID_LEG = flat("arkyid-leg", 56, 56);
export const UV_ARKYID_LEG_BASE = flat("arkyid-leg-base", 104, 64);
// the T5: the arkyid's frame with two more legs, and the one centred
// cannon. toxopid's lower segment is 270px of art for a 150px upper one:
// legExtension 20 runs it back over its own knee
export const UV_TOXOPID_BODY = sprite("toxopid", 256, [160, 190]);
export const UV_TOXOPID_BODY_SIL = sprite("toxopid-sil", 256, [160, 190]);
export const UV_TOXOPID_CANNON = sprite("toxopid-cannon", 256, [206, 220]);
export const UV_TOXOPID_CANNON_SIL = sprite("toxopid-cannon-sil", 256, [206, 220]);
export const UV_TOXOPID_JOINT_BASE = sprite("toxopid-joint-base", 128, 70);
export const UV_TOXOPID_JOINT_BASE_SIL = sprite("toxopid-joint-base-sil", 128, 70);
export const UV_TOXOPID_FOOT = sprite("toxopid-foot", 128, 90);
export const UV_TOXOPID_FOOT_SIL = sprite("toxopid-foot-sil", 128, 90);
export const UV_TOXOPID_LEG = flat("toxopid-leg", 150, 72);
export const UV_TOXOPID_LEG_BASE = flat("toxopid-leg-base", 270, 64);

// the support line: T1 and T2 on 64px cells. pulsar's 68x58 body and
// 64px leg overhang their cells with transparent padding only, which the
// clip takes off
export const UV_NOVA_LEG = sprite("nova-leg", 64, 48);
export const UV_NOVA_BASE = sprite("nova-base", 64, 48);
export const UV_NOVA_BODY = sprite("nova", 64, 56);
export const UV_HEAL_WEAPON = sprite("heal-weapon", 64, 48);
export const UV_NOVA_LEG_SIL = sprite("nova-leg-sil", 64, 48);
export const UV_NOVA_BASE_SIL = sprite("nova-base-sil", 64, 48);
export const UV_NOVA_BODY_SIL = sprite("nova-sil", 64, 56);
export const UV_HEAL_WEAPON_SIL = sprite("heal-weapon-sil", 64, 48);
export const UV_PULSAR_LEG = sprite("pulsar-leg", 64, 64);
export const UV_PULSAR_BASE = sprite("pulsar-base", 64, 48);
export const UV_PULSAR_BODY = sprite("pulsar", 64, [68, 58]);
export const UV_HEAL_SHOTGUN = sprite("heal-shotgun", 64, 50);
export const UV_PULSAR_LEG_SIL = sprite("pulsar-leg-sil", 64, 64);
export const UV_PULSAR_BASE_SIL = sprite("pulsar-base-sil", 64, 48);
export const UV_PULSAR_BODY_SIL = sprite("pulsar-sil", 64, [68, 58]);
export const UV_HEAL_SHOTGUN_SIL = sprite("heal-shotgun-sil", 64, 50);
// the T3 outgrows those: every quasar part ships on an 80x80 source (its
// leg alone reaches 35px off centre, past the 32px a 64 cell can hold)
export const UV_QUASAR_LEG = sprite("quasar-leg", 128, 80);
export const UV_QUASAR_BASE = sprite("quasar-base", 128, 80);
export const UV_QUASAR_BODY = sprite("quasar", 128, 80);
export const UV_BEAM_WEAPON = sprite("beam-weapon", 128, 80);
export const UV_QUASAR_LEG_SIL = sprite("quasar-leg-sil", 128, 80);
export const UV_QUASAR_BASE_SIL = sprite("quasar-base-sil", 128, 80);
export const UV_QUASAR_BODY_SIL = sprite("quasar-sil", 128, 80);
export const UV_BEAM_WEAPON_SIL = sprite("beam-weapon-sil", 128, 80);
// the T4. Its main gun has NO sprite (see the MECH_ART note) — the pair
// of repair-beam pods is all there is to bolt on
export const UV_VELA_BODY = sprite("vela", 256, [170, 140]);
export const UV_VELA_BODY_SIL = sprite("vela-sil", 256, [170, 140]);
export const UV_VELA_LEG = sprite("vela-leg", 256, 128);
export const UV_VELA_LEG_SIL = sprite("vela-leg-sil", 256, 128);
export const UV_VELA_BASE = sprite("vela-base", 256, 128);
export const UV_VELA_BASE_SIL = sprite("vela-base-sil", 256, 128);
export const UV_REPAIR_BEAM = sprite("repair-beam", 256, 48);
export const UV_REPAIR_BEAM_SIL = sprite("repair-beam-sil", 256, 48);
/**
 * The T5, the only legged unit wearing the full set of leg parts: a mount
 * plate like the atrax, a knee cap like the atrax and spiroct, AND a
 * shoulder plate like the arkyid and toxopid. Four legs of 14 world units
 * on mounts 11 out: almost the whole span is the mount offset, so the
 * segments are stubby and very broad — a 68px stroke on a 30px segment.
 */
export const UV_CORVUS_BODY = sprite("corvus", 256, [214, 140]);
export const UV_CORVUS_BODY_SIL = sprite("corvus-sil", 256, [214, 140]);
export const UV_CORVUS_BASE = sprite("corvus-base", 256, [152, 124]);
export const UV_CORVUS_BASE_SIL = sprite("corvus-base-sil", 256, [152, 124]);
export const UV_CORVUS_JOINT = upright("corvus-joint", 128, 60);
export const UV_CORVUS_JOINT_SIL = upright("corvus-joint-sil", 128, 60);
export const UV_CORVUS_JOINT_BASE = sprite("corvus-joint-base", 128, 70);
export const UV_CORVUS_JOINT_BASE_SIL = sprite("corvus-joint-base-sil", 128, 70);
export const UV_CORVUS_FOOT = sprite("corvus-foot", 128, 90);
export const UV_CORVUS_FOOT_SIL = sprite("corvus-foot-sil", 128, 90);
export const UV_CORVUS_LEG = flat("corvus-leg", 30, 68);
export const UV_CORVUS_LEG_BASE = flat("corvus-leg-base", 30, 64);

/**
 * THE FLYERS: a flying unit is one sprite — no legs, no chassis, no
 * silhouette under-layer — outlined at pack time and turned to the
 * heading the sim gave it. flare's 48px art rides a 64 cell at dagger
 * scale; horizon (72) and zenith (112) take 128s; antumbra at 216x240 and
 * the disrupt boss at 243x243 take 256s; eclipse, 320x321, the largest
 * single piece of art on the sheet, the only 384.
 */
export const UV_FLARE = sprite("flare", 64, 48);
export const UV_HORIZON = sprite("horizon", 128, 72);
export const UV_ZENITH = sprite("zenith", 128, 112);
export const UV_ANTUMBRA = sprite("antumbra", 256, [216, 240]);
export const UV_DISRUPT = sprite("disrupt", 256, 243);
export const UV_ECLIPSE = sprite("eclipse", 384, [320, 321]);

/**
 * THE NAVAL HULLS — the ten of the two water trees. A naval tank is drawn
 * exactly like a flyer: ONE quad, outlined at pack time, turned to the
 * heading the sim gave it. What a hull has instead of parts is its wake,
 * and that is geometry the renderer strokes from the solid texel (see
 * WakeSpec) rather than art on this sheet. Three cell sizes, chosen the
 * usual way: the two T5 hulls are 264x351 and 258x366 of art, and a 256
 * cell would have had to scale them down.
 */
export const UV_RISSO = sprite("risso", 128, [70, 78]);
export const UV_MINKE = sprite("minke", 128, [88, 101]);
export const UV_RETUSA = sprite("retusa", 128, [70, 78]);
export const UV_OXYNOE = sprite("oxynoe", 128, [88, 101]);
export const UV_BRYDE = sprite("bryde", 256, 140);
export const UV_CYERCE = sprite("cyerce", 256, 140);
export const UV_SEI = sprite("sei", 256, [198, 228]);
export const UV_AEGIRES = sprite("aegires", 256, [218, 241]);
export const UV_OMURA = sprite("omura", 384, [264, 351]);
export const UV_NAVANAX = sprite("navanax", 384, [258, 366]);

/**
 * WHERE A BODY'S TEAM CELL RIDES ON ITS BODY QUAD, filled in at pack time
 * (packTeamCells) and read by the renderer.
 *
 * Everything is a FRACTION of the body's own quad rather than a pixel
 * count, because the quad is the same rect the body's atlas cell is drawn
 * onto: the renderer multiplies by whatever size it is drawing the body at
 * and gets the cell exactly where the sheet says it sits, at every scale
 * and on the hull's own heading. `dx`/`dy` are the offset from the body's
 * centre in the SPRITE's frame (x along its facing), so they rotate with it.
 */
export interface CellArt {
  uv: UVRect;
  w: number;
  h: number;
  dx: number;
  dy: number;
}

/** every body's team cell, by kind — empty until the sheet is packed */
export const UNIT_CELL: Partial<Record<UnitKind, CellArt>> = {};

// per-kind unit art: atlas cell + world quad size. Both ride at true
// Mindustry scale — dagger 48px art = 1.5 tiles, mace 64px art = 2 tiles
export const UNIT_ART: Record<UnitKind, { uv: UVRect; sprite: number }> = {
  dagger: { uv: UV_DAGGER_BODY, sprite: UNIT_SPRITE },
  mace: { uv: UV_MACE_BODY, sprite: UNIT_SPRITE },
  fortress: { uv: UV_FORTRESS_BODY, sprite: UNIT_SPRITE * 2 }, // 128px cell, same px scale
  scepter: { uv: UV_SCEPTER_BODY, sprite: UNIT_SPRITE * 4 }, // 256px cell, same px scale
  reign: { uv: UV_REIGN_BODY, sprite: UNIT_SPRITE * 4 },
  crawler: { uv: UV_CRAWLER_BODY, sprite: UNIT_SPRITE },
  // 128px cells, like the fortress: the legged pair's bodies outgrow 64
  atrax: { uv: UV_ATRAX_BODY, sprite: UNIT_SPRITE * 2 },
  spiroct: { uv: UV_SPIROCT_BODY, sprite: UNIT_SPRITE * 2 },
  arkyid: { uv: UV_ARKYID_BODY, sprite: UNIT_SPRITE * 4 }, // 256px cell, same px scale
  toxopid: { uv: UV_TOXOPID_BODY, sprite: UNIT_SPRITE * 4 },
  nova: { uv: UV_NOVA_BODY, sprite: UNIT_SPRITE },
  pulsar: { uv: UV_PULSAR_BODY, sprite: UNIT_SPRITE },
  quasar: { uv: UV_QUASAR_BODY, sprite: UNIT_SPRITE * 2 }, // 128px cell, same px scale
  vela: { uv: UV_VELA_BODY, sprite: UNIT_SPRITE * 4 }, // 256px cell, same px scale
  corvus: { uv: UV_CORVUS_BODY, sprite: UNIT_SPRITE * 4 },
  flare: { uv: UV_FLARE, sprite: UNIT_SPRITE }, // 48px art in a 64 cell, dagger scale
  // 128px cells: double the cell means double the sprite box, which keeps
  // world px per native px identical to every other unit
  horizon: { uv: UV_HORIZON, sprite: UNIT_SPRITE * 2 },
  zenith: { uv: UV_ZENITH, sprite: UNIT_SPRITE * 2 },
  antumbra: { uv: UV_ANTUMBRA, sprite: UNIT_SPRITE * 4 },
  // the boss draws HALF AGAIN its native scale ON PURPOSE — the one unit
  // allowed to break the px-per-px convention, because presence is its
  // job. At x6 it fills the same quad as eclipse, the widest thing on the
  // roster. The hitbox grew with it (UNIT_STATS radius, UR * 7), so shots
  // land where the art says they should
  disrupt: { uv: UV_DISRUPT, sprite: UNIT_SPRITE * 6 },
  // 320x321 on a 7.25-block hitbox: the sheet's biggest single piece, and
  // the only 384px cell on it — hence the odd multiplier, which is just
  // 384/64 like every other one here
  eclipse: { uv: UV_ECLIPSE, sprite: UNIT_SPRITE * 6 },
  // the naval tanks: one quad apiece, like the flyers, on the band's three
  // cell sizes (see the UV note there)
  risso: { uv: UV_RISSO, sprite: UNIT_SPRITE * 2 },
  minke: { uv: UV_MINKE, sprite: UNIT_SPRITE * 2 },
  bryde: { uv: UV_BRYDE, sprite: UNIT_SPRITE * 4 },
  sei: { uv: UV_SEI, sprite: UNIT_SPRITE * 4 },
  omura: { uv: UV_OMURA, sprite: UNIT_SPRITE * 6 },
  retusa: { uv: UV_RETUSA, sprite: UNIT_SPRITE * 2 },
  oxynoe: { uv: UV_OXYNOE, sprite: UNIT_SPRITE * 2 },
  cyerce: { uv: UV_CYERCE, sprite: UNIT_SPRITE * 4 },
  aegires: { uv: UV_AEGIRES, sprite: UNIT_SPRITE * 4 },
  navanax: { uv: UV_NAVANAX, sprite: UNIT_SPRITE * 6 },
};

// Mindustry world units → px (CELL / 8, see constants.ts)
const MU = 2.5;

/**
 * UnitType.UnitEngine: where a flyer's engine flame burns, in px off the
 * unit's centre — `x` across its heading, `y` along it (negative is
 * astern) — its radius and the way the inner white disc is thrown
 * (`rotation`, radians, in the unit's frame). UnitEngine.draw paints the
 * outer disc in the OWNING TEAM's colour (engineColor is null on every
 * flyer here), which is the second place the crux red shows on a unit.
 *
 * A type that sets none gets one on its axis at (0, -engineOffset) of
 * engineSize, rotation -90 (UnitType.init); the disrupt sets two mirrored
 * pairs and so gets none on its axis. The disrupt draws half again its
 * native scale (UNIT_ART), so its offsets are scaled with it.
 */
export interface UnitEngine {
  x: number;
  y: number;
  radius: number;
  rotation: number;
}
const engine = (x: number, y: number, radius: number, rotDeg: number, scl = 1): UnitEngine => ({
  x: x * MU * scl,
  y: y * MU * scl,
  radius: radius * MU * scl,
  rotation: (rotDeg * Math.PI) / 180,
});
const axial = (offset: number, size: number): readonly UnitEngine[] => [engine(0, -offset, size, -90)];
const mirrored = (x: number, y: number, radius: number, rotDeg: number, scl: number): readonly UnitEngine[] => [
  engine(x, y, radius, rotDeg, scl),
  engine(-x, y, radius, (180 - rotDeg + 360) % 360, scl),
];
export const UNIT_ENGINES: Partial<Record<UnitKind, readonly UnitEngine[]>> = {
  flare: axial(5.75, 2.5), // engineOffset 5.75, engineSize default 2.5
  horizon: axial(7.8, 2.5),
  zenith: axial(12, 3),
  antumbra: axial(21, 5.3),
  eclipse: axial(38, 7.3),
  disrupt: [
    ...mirrored(95 / 4, -56 / 4, 5, 330, 1.5),
    ...mirrored(89 / 4, -95 / 4, 4, 315, 1.5),
  ],
};

/** part art + walk-cycle geometry for a ground (mech) unit */
export interface MechArt {
  leg: UVRect;
  base: UVRect;
  body: UVRect;
  /**
   * every Weapon bolted to the chassis, each mirrored to both sides
   * (Weapon.mirror, true on all of them). Empty when the type's weapons
   * have no sprite at all — crawler's explosion IS its weapon — and more
   * than one once a hull carries mounts as well as a main gun.
   */
  guns: readonly LegGun[];
  stride: number; // leg swing amplitude px — the walk cycle is 4 strides
  /** forward body/gun bob px — Mindustry mechFrontSway (default 0.1) x 2.5 */
  frontSway?: number;
  /** sideways body/gun bob px — Mindustry mechSideSway (default 0.54) x 2.5 */
  sideSway?: number;
  sprite: number; // world px of every part quad (same 64px cell scale)
  /** solid-color silhouette cells, drawn under all parts as the outer rim */
  sil: { leg: UVRect; base: UVRect; body: UVRect };
}

// stride is Mindustry's default 4 + (hitSize - 8) / 2.1 world units; gun
// mounts come from each type's Weapon (large-weapon x=4 y=2, flamethrower
// x=5 y=0). Flare's weapon has no sprite, so flyers stay single-quad.
export const MECH_ART: Partial<Record<UnitKind, MechArt>> = {
  dagger: {
    leg: UV_DAGGER_LEG,
    base: UV_DAGGER_BASE,
    body: UV_DAGGER_BODY,
    guns: [{ uv: UV_LARGE_WEAPON, sil: UV_LARGE_WEAPON_SIL, x: 4 * MU, y: 2 * MU, top: false }],
    stride: 4 * MU,
    sprite: UNIT_SPRITE,
    sil: { leg: UV_DAGGER_LEG_SIL, base: UV_DAGGER_BASE_SIL, body: UV_DAGGER_BODY_SIL },
  },
  mace: {
    leg: UV_MACE_LEG,
    base: UV_MACE_BASE,
    body: UV_MACE_BODY,
    guns: [{ uv: UV_FLAMETHROWER, sil: UV_FLAMETHROWER_SIL, x: 5 * MU, y: 0, top: false }],
    stride: (4 + (10 - 8) / 2.1) * MU,
    sprite: UNIT_SPRITE,
    sil: { leg: UV_MACE_LEG_SIL, base: UV_MACE_BASE_SIL, body: UV_MACE_BODY_SIL },
  },
  // artillery weapon x=9 y=1, mirrored; mechFrontSway 0.55 is 5.5x the
  // default — the heavy visibly lumbers nose-first with every stride
  fortress: {
    leg: UV_FORTRESS_LEG,
    base: UV_FORTRESS_BASE,
    body: UV_FORTRESS_BODY,
    guns: [{ uv: UV_ARTILLERY, sil: UV_ARTILLERY_SIL, x: 9 * MU, y: 1 * MU, top: false }],
    stride: (4 + (13 - 8) / 2.1) * MU,
    frontSway: 0.55 * MU,
    sprite: UNIT_SPRITE * 2,
    sil: { leg: UV_FORTRESS_LEG_SIL, base: UV_FORTRESS_BASE_SIL, body: UV_FORTRESS_BODY_SIL },
  },
  /**
   * The T4: the first hull on the roster carrying more than one kind of
   * gun. scepter-weapon x=16 y=1 rides UNDER the body like every mech gun
   * before it; the two scepter-mount turrets (x=8.5, y=6 and y=-7) leave
   * `top` at its default and sit ON it — which is the whole reason
   * MechArt.guns is a list and pushMech sorts by that flag.
   *
   * mechFrontSway 1 is ten times the stock lean: at 0.36 px/tick it plants
   * one foot at a time and the hull pitches forward onto each of them.
   */
  scepter: {
    leg: UV_SCEPTER_LEG,
    base: UV_SCEPTER_BASE,
    body: UV_SCEPTER_BODY,
    guns: [
      { uv: UV_SCEPTER_WEAPON, sil: UV_SCEPTER_WEAPON_SIL, x: 16 * MU, y: 1 * MU, top: false },
      { uv: UV_SCEPTER_MOUNT, sil: UV_SCEPTER_MOUNT_SIL, x: 8.5 * MU, y: 6 * MU, top: true },
      { uv: UV_SCEPTER_MOUNT, sil: UV_SCEPTER_MOUNT_SIL, x: 8.5 * MU, y: -7 * MU, top: true },
    ],
    stride: (4 + (22 - 8) / 2.1) * MU,
    frontSway: 1 * MU,
    sprite: UNIT_SPRITE * 4,
    sil: { leg: UV_SCEPTER_LEG_SIL, base: UV_SCEPTER_BASE_SIL, body: UV_SCEPTER_BODY_SIL },
  },
  // support T1: heal-weapon x=4.5 mirrored, top=false so it rides under the
  // body like the dagger's. hitSize 8 gives it the dagger's 4-unit stride
  nova: {
    leg: UV_NOVA_LEG,
    base: UV_NOVA_BASE,
    body: UV_NOVA_BODY,
    guns: [{ uv: UV_HEAL_WEAPON, sil: UV_HEAL_WEAPON_SIL, x: 4.5 * MU, y: 0, top: false }],
    stride: 4 * MU,
    sprite: UNIT_SPRITE,
    sil: { leg: UV_NOVA_LEG_SIL, base: UV_NOVA_BASE_SIL, body: UV_NOVA_BODY_SIL },
  },
  // support T2: heal-shotgun-weapon x=5 y=0.5, mirrored and under the body
  pulsar: {
    leg: UV_PULSAR_LEG,
    base: UV_PULSAR_BASE,
    body: UV_PULSAR_BODY,
    guns: [{ uv: UV_HEAL_SHOTGUN, sil: UV_HEAL_SHOTGUN_SIL, x: 5 * MU, y: 0.5 * MU, top: false }],
    stride: (4 + (11 - 8) / 2.1) * MU,
    sprite: UNIT_SPRITE,
    sil: { leg: UV_PULSAR_LEG_SIL, base: UV_PULSAR_BASE_SIL, body: UV_PULSAR_BODY_SIL },
  },
  // support T3: beam-weapon x=6.5, top=false, and mechFrontSway 0.55 — the
  // same nose-first lumber the fortress walks with. hitSize 13 gives it the
  // heavy's stride, which reads right under a bubble this wide
  quasar: {
    leg: UV_QUASAR_LEG,
    base: UV_QUASAR_BASE,
    body: UV_QUASAR_BODY,
    guns: [{ uv: UV_BEAM_WEAPON, sil: UV_BEAM_WEAPON_SIL, x: 6.5 * MU, y: 0, top: false }],
    stride: (4 + (13 - 8) / 2.1) * MU,
    frontSway: 0.55 * MU,
    sprite: UNIT_SPRITE * 2,
    sil: { leg: UV_QUASAR_LEG_SIL, base: UV_QUASAR_BASE_SIL, body: UV_QUASAR_BODY_SIL },
  },
  /**
   * The support T4. Its main gun has NO sprite at all: Mindustry's
   * Weapon("vela-weapon") finds no such region and Weapon.draw skips a
   * region it cannot find, so the plasma cannon you see is painted into
   * the hull itself. What is left to bolt on is the pair of repair-beam
   * pods (x=11, y=-7.5), and those ride ON the body like the scepter's
   * mounts rather than under it.
   *
   * mechFrontSway 1 matches the scepter's ten-times-stock lean, on a hull
   * that walks even slower — it plants each foot and rocks over it.
   */
  vela: {
    leg: UV_VELA_LEG,
    base: UV_VELA_BASE,
    body: UV_VELA_BODY,
    guns: [{ uv: UV_REPAIR_BEAM, sil: UV_REPAIR_BEAM_SIL, x: 11 * MU, y: -7.5 * MU, top: true }],
    stride: (4 + (24 - 8) / 2.1) * MU,
    frontSway: 1 * MU,
    sprite: UNIT_SPRITE * 4,
    sil: { leg: UV_VELA_LEG_SIL, base: UV_VELA_BASE_SIL, body: UV_VELA_BODY_SIL },
  },
  /**
   * The ground line's T5 — the same four-part mech as the scepter, one
   * tier heavier. Weapon("reign-weapon") is top=false at x=21.5, y=1: the
   * widest mount on the roster, slung under a chassis 30 world units
   * across, so the pair sits almost clear of the hull's own outline.
   *
   * mechFrontSway 1.9 is nineteen times stock and the largest on any unit
   * (the scepter's 1 was the previous high); mechSideSway 0.6 is barely
   * over the 0.54 default. So it pitches nose-down hard over each step
   * without rolling — a heavy lurch rather than the dagger's swagger.
   */
  reign: {
    leg: UV_REIGN_LEG,
    base: UV_REIGN_BASE,
    body: UV_REIGN_BODY,
    guns: [{ uv: UV_REIGN_WEAPON, sil: UV_REIGN_WEAPON_SIL, x: 21.5 * MU, y: 1 * MU, top: false }],
    stride: (4 + (30 - 8) / 2.1) * MU,
    frontSway: 1.9 * MU,
    sideSway: 0.6 * MU,
    sprite: UNIT_SPRITE * 4,
    sil: { leg: UV_REIGN_LEG_SIL, base: UV_REIGN_BASE_SIL, body: UV_REIGN_BODY_SIL },
  },
  // no gun sprite — its Weapon fires only via shootOnDeath. mechSideSway
  // 0.25 is under half the default: it scuttles rather than swaggers
  crawler: {
    leg: UV_CRAWLER_LEG,
    base: UV_CRAWLER_BASE,
    body: UV_CRAWLER_BODY,
    guns: [],
    stride: 4 * MU,
    sideSway: 0.25 * MU,
    sprite: UNIT_SPRITE,
    sil: { leg: UV_CRAWLER_LEG_SIL, base: UV_CRAWLER_BASE_SIL, body: UV_CRAWLER_BODY_SIL },
  },
};

/** px of world per native sprite px — a 64px cell draws at UNIT_SPRITE */
const PX = UNIT_SPRITE / 64;

/** one gun mount: Mindustry's Weapon, mirrored to both sides of the body */
export interface LegGun {
  uv: UVRect;
  sil: UVRect;
  /** sideways mount offset px, mirrored; forward offset px */
  x: number;
  y: number;
  /** Weapon.top: false tucks the gun UNDER the body, like a mech's */
  top: boolean;
  /**
   * Weapon.mirror, true on nearly every stock weapon: the mount is drawn
   * on BOTH sides of the hull, the far one from the same sprite flipped.
   * false draws it once, and is what a single centered gun wants —
   * toxopid's cannon sits at x=0, so mirroring it would stack two quads in
   * the same place and double-composite the sprite's feathered rim.
   */
  mirror?: boolean;
}

/** part art for a legged (LegsUnit) ground unit — see LegSpec for its gait */
export interface LegArt {
  body: UVRect;
  /** Mindustry baseRegion, the plate the legs mount to; spiroct has none */
  base?: UVRect;
  /** Mindustry jointRegion, the cap over the KNEE — arkyid has none, and
   * its elbow is left as the bare overlap of the two segments */
  joint?: UVRect;
  /**
   * Mindustry baseJointRegion, a cap over the leg's MOUNT rather than its
   * knee. It is drawn after every leg, so it covers all six shoulders at
   * once instead of being buried under the next leg round the ring.
   */
  baseJoint?: UVRect;
  foot: UVRect;
  /** the two segments, mount -> joint -> foot, each stretched between its
   * endpoints; the cell is the art's exact rect (see the UV note) */
  leg: UVRect;
  legBase: UVRect;
  /** each segment's across-the-line width in world px — Mindustry's
   * Lines.stroke(region.height * scl) */
  legStroke: number;
  legBaseStroke: number;
  guns: readonly LegGun[];
  /** world px of the body/base/gun quads — the cell size those parts are
   * packed at, times the sheet's 0.625 world px per native px */
  sprite: number;
  /** the same for the joint and foot quads, which ride a smaller cell */
  small: number;
  sil: { body: UVRect; base?: UVRect; joint?: UVRect; baseJoint?: UVRect; foot: UVRect };
}

export const LEG_ART: Partial<Record<UnitKind, LegArt>> = {
  // atrax-weapon x=7, top=false: a pair of slag guns slung under the shell
  atrax: {
    body: UV_ATRAX_BODY,
    base: UV_ATRAX_BASE,
    joint: UV_ATRAX_JOINT,
    foot: UV_ATRAX_FOOT,
    leg: UV_ATRAX_LEG,
    legBase: UV_ATRAX_LEG_BASE,
    legStroke: 26 * PX,
    legBaseStroke: 26 * PX,
    guns: [{ uv: UV_ATRAX_WEAPON, sil: UV_ATRAX_WEAPON_SIL, x: 7 * MU, y: 0, top: false }],
    sprite: UNIT_SPRITE * 2,
    small: UNIT_SPRITE,
    sil: {
      body: UV_ATRAX_BODY_SIL,
      base: UV_ATRAX_BASE_SIL,
      joint: UV_ATRAX_JOINT_SIL,
      foot: UV_ATRAX_FOOT_SIL,
    },
  },
  // two weapon pairs over the body: the long sap gun (x=8.5, y=-1.5) and
  // the small purple mount (x=4, y=3). Both rotate to track a target in
  // Mindustry; these enemies never shoot, so they ride the body's facing
  spiroct: {
    body: UV_SPIROCT_BODY,
    joint: UV_SPIROCT_JOINT,
    foot: UV_SPIROCT_FOOT,
    leg: UV_SPIROCT_LEG,
    legBase: UV_SPIROCT_LEG_BASE,
    legStroke: 34 * PX,
    legBaseStroke: 34 * PX,
    guns: [
      { uv: UV_SPIROCT_WEAPON, sil: UV_SPIROCT_WEAPON_SIL, x: 8.5 * MU, y: -1.5 * MU, top: true },
      { uv: UV_SPIROCT_MOUNT, sil: UV_SPIROCT_MOUNT_SIL, x: 4 * MU, y: 3 * MU, top: true },
    ],
    sprite: UNIT_SPRITE * 2,
    small: UNIT_SPRITE,
    sil: { body: UV_SPIROCT_BODY_SIL, joint: UV_SPIROCT_JOINT_SIL, foot: UV_SPIROCT_FOOT_SIL },
  },
  /**
   * The crawler line's T4 — the same six-leg frame as the spiroct at more
   * than twice the reach, and the first unit on the roster whose knee has
   * no cap: arkyid ships an arkyid-joint-base instead, a shoulder plate
   * drawn over all six MOUNTS once every leg is down.
   *
   * Its guns are the spiroct's sap weapon three times over (x=4/9/14 down
   * the flank, each mirrored) topped by one large purple artillery mount
   * at x=9, y=-7 — eight gun quads, where the spiroct carries four.
   */
  arkyid: {
    body: UV_ARKYID_BODY,
    baseJoint: UV_ARKYID_JOINT_BASE,
    foot: UV_ARKYID_FOOT,
    leg: UV_ARKYID_LEG,
    legBase: UV_ARKYID_LEG_BASE,
    legStroke: 56 * PX,
    legBaseStroke: 64 * PX,
    guns: [
      { uv: UV_ARKYID_WEAPON, sil: UV_ARKYID_WEAPON_SIL, x: 4 * MU, y: 8 * MU, top: true },
      { uv: UV_ARKYID_WEAPON, sil: UV_ARKYID_WEAPON_SIL, x: 9 * MU, y: 6 * MU, top: true },
      { uv: UV_ARKYID_WEAPON, sil: UV_ARKYID_WEAPON_SIL, x: 14 * MU, y: 0, top: true },
      { uv: UV_ARKYID_MOUNT, sil: UV_ARKYID_MOUNT_SIL, x: 9 * MU, y: -7 * MU, top: true },
    ],
    sprite: UNIT_SPRITE * 4,
    small: UNIT_SPRITE * 2,
    sil: {
      body: UV_ARKYID_BODY_SIL,
      baseJoint: UV_ARKYID_JOINT_BASE_SIL,
      foot: UV_ARKYID_FOOT_SIL,
    },
  },
  /**
   * The crawler line's T5 — the arkyid's frame with two more legs and two
   * and a half times the reach, and the only unit that carries BOTH gun
   * kinds at once: the arkyid's large purple mount, mirrored to x=11,
   * y=-5, and one toxopid-cannon dead on the centreline at y=-14. That
   * cannon is Weapon.mirror=false, the roster's only unmirrored gun with a
   * sprite, so it draws once rather than twice over itself.
   *
   * The mount cell is the arkyid's own UV_ARKYID_MOUNT: same sprite, same
   * 256px cell, same world scale, so there is nothing to gain by packing a
   * second copy. Like the arkyid it has no knee cap, only a shoulder plate.
   */
  toxopid: {
    body: UV_TOXOPID_BODY,
    baseJoint: UV_TOXOPID_JOINT_BASE,
    foot: UV_TOXOPID_FOOT,
    leg: UV_TOXOPID_LEG,
    legBase: UV_TOXOPID_LEG_BASE,
    legStroke: 72 * PX,
    legBaseStroke: 64 * PX,
    guns: [
      { uv: UV_ARKYID_MOUNT, sil: UV_ARKYID_MOUNT_SIL, x: 11 * MU, y: -5 * MU, top: true },
      {
        uv: UV_TOXOPID_CANNON,
        sil: UV_TOXOPID_CANNON_SIL,
        x: 0,
        y: -14 * MU,
        top: true,
        mirror: false,
      },
    ],
    sprite: UNIT_SPRITE * 4,
    small: UNIT_SPRITE * 2,
    sil: {
      body: UV_TOXOPID_BODY_SIL,
      baseJoint: UV_TOXOPID_JOINT_BASE_SIL,
      foot: UV_TOXOPID_FOOT_SIL,
    },
  },
  /**
   * The support line's T5, and the only legged unit on the roster wearing
   * the full set of leg parts: a mount plate (baseRegion) like the atrax,
   * a knee cap (jointRegion) like the atrax and spiroct, AND a shoulder
   * plate (baseJointRegion) like the arkyid and toxopid.
   *
   * It carries no gun at all. Mindustry's Weapon("corvus-weapon") names a
   * region the sprite set does not contain — only a -heat overlay exists —
   * and Weapon.draw skips a region it cannot find, so the charged laser is
   * painted into the hull, exactly as the vela's plasma cannon is.
   *
   * Four legs of 14 world units on mounts 11 out: almost the whole span is
   * the mount offset, so the segments are stubby and very broad — a 68px
   * stroke against a 30px segment, the widest leg-to-length ratio here.
   */
  corvus: {
    body: UV_CORVUS_BODY,
    base: UV_CORVUS_BASE,
    joint: UV_CORVUS_JOINT,
    baseJoint: UV_CORVUS_JOINT_BASE,
    foot: UV_CORVUS_FOOT,
    leg: UV_CORVUS_LEG,
    legBase: UV_CORVUS_LEG_BASE,
    legStroke: 68 * PX,
    legBaseStroke: 64 * PX,
    guns: [],
    sprite: UNIT_SPRITE * 4,
    small: UNIT_SPRITE * 2,
    sil: {
      body: UV_CORVUS_BODY_SIL,
      base: UV_CORVUS_BASE_SIL,
      joint: UV_CORVUS_JOINT_SIL,
      baseJoint: UV_CORVUS_JOINT_BASE_SIL,
      foot: UV_CORVUS_FOOT_SIL,
    },
  },
};

// ---- THE ANIMAL ART (game/animalFlag.ts, game/animalArt.ts) ------------
//
// The cells the trial needs beyond the ones the two lines already own.
// Everything else the animals draw into is a cell the stock art owns
// (nova's leg/base/body, corvus's caps and feet, the flyers' single
// cells) and is cleared and redrawn at pack time — see packAnimalArt.
// The animal art is generated, so its size is not declared: these cells
// take the full gutter and the pack pass draws whatever size comes out.
/** vela's legged parts, the ones its mech rig never had */
export const UV_VELA_FOOT = sprite("vela-foot", 128, 128);
export const UV_VELA_FOOT_SIL = sprite("vela-foot-sil", 128, 128);
export const UV_VELA_JOINT = upright("vela-joint", 128, 128);
export const UV_VELA_JOINT_SIL = upright("vela-joint-sil", 128, 128);
export const UV_VELA_JOINT_BASE = sprite("vela-joint-base", 128, 128);
export const UV_VELA_JOINT_BASE_SIL = sprite("vela-joint-base-sil", 128, 128);
/** the stag's leg segments on exact rects: thigh then shin, T4 then T5.
 *  A stretched segment samples its rect corner to corner, mount on the
 *  left, so the height IS the stroke */
const HART_SEG4 = hartSeg(HART_TIERS[3]), HART_SEG5 = hartSeg(HART_TIERS[4]);
export const UV_VELA_LEG_SEG = flat("vela-leg-seg", 64, HART_SEG4.th);
export const UV_VELA_LEG_BASE_SEG = flat("vela-leg-base-seg", 64, HART_SEG4.sh);
export const UV_CORVUS_LEG_SEG = flat("corvus-leg-seg", 64, HART_SEG5.th);
export const UV_CORVUS_LEG_BASE_SEG = flat("corvus-leg-base-seg", 64, HART_SEG5.sh);
/** the bats' bodies and wings, apart; the composed sprite goes in each
 *  flyer's own cell */
export const UV_STOOP5_BODY = sprite("stoop5-body", 128, 128);
export const UV_STOOP5_WING = sprite("stoop5-wing", 128, 128);
export const UV_STOOP4_BODY = sprite("stoop4-body", 64, 64);
export const UV_STOOP4_WING = sprite("stoop4-wing", 64, 64);
export const UV_STOOP3_BODY = sprite("stoop3-body", 64, 64);
export const UV_STOOP3_WING = sprite("stoop3-wing", 64, 64);
export const UV_STOOP1_BODY = sprite("stoop1-body", 64, 64);
export const UV_STOOP1_WING = sprite("stoop1-wing", 64, 64);
export const UV_STOOP2_BODY = sprite("stoop2-body", 64, 64);
export const UV_STOOP2_WING = sprite("stoop2-wing", 64, 64);

/**
 * A flyer drawn in parts: a body quad and one wing quad mirrored to both
 * sides, each pivoting on its root and folding toward it (renderer.ts).
 * Offsets are world px in the unit's frame: `rootX` sideways off the
 * body's centre (mirrored), `rootY` forward; `wingX`/`wingY` the wing
 * cell's centre off its root, sideways along the span and forward.
 */
export interface FlyerParts {
  body: UVRect;
  wing: UVRect;
  sprite: number;
  wingSprite: number;
  rootX: number;
  rootY: number;
  wingX: number;
  wingY: number;
  /** how far the wing folds toward its root at the top of a beat, as a
   *  fraction of its span; the sweep it adds at the root, rad; beats a second */
  fold: number;
  sweep: number;
  rate: number;
}
/** the flyers that draw in parts — empty unless the animal art is on */
export const FLYER_PARTS: Partial<Record<UnitKind, FlyerParts>> = {};
const STOOP_KINDS: readonly UnitKind[] = ["flare", "horizon", "zenith", "antumbra", "eclipse"];
const STOOP_CELLS: readonly (readonly [UVRect, UVRect])[] = [
  [UV_STOOP1_BODY, UV_STOOP1_WING],
  [UV_STOOP2_BODY, UV_STOOP2_WING],
  [UV_STOOP3_BODY, UV_STOOP3_WING],
  [UV_STOOP4_BODY, UV_STOOP4_WING],
  [UV_STOOP5_BODY, UV_STOOP5_WING],
];
/** a cell's edge in atlas px (every animal cell is packed with no inset) */
const cellPx = (u: UVRect): number => Math.round((u[2] - u[0]) * ATLAS_W);

if (ANIMAL_ART) {
  STOOP_TIERS.forEach((T, i) => {
    const g = stoopGeom(T);
    const [body, wing] = STOOP_CELLS[i];
    FLYER_PARTS[STOOP_KINDS[i]] = {
      body,
      wing,
      sprite: cellPx(body) * PX,
      wingSprite: cellPx(wing) * PX,
      rootX: g.rootX * PX,
      rootY: g.rootY * PX,
      wingX: g.wingX * PX,
      wingY: g.wingY * PX,
      fold: T.fold,
      sweep: T.sweep,
      rate: T.rate,
    };
  });
  // the stag's T1-T3 keep the mech rig and its cells; the guns go (the
  // beams are drawn live off the held weapon, never off a sprite) and the
  // hooves shuffle a shorter stride than a dagger's
  const hartStride = (t: number): number => [0, 2.5, 3, 4][t] * MU;
  MECH_ART.nova = { ...MECH_ART.nova!, guns: [], stride: hartStride(1) };
  MECH_ART.pulsar = { ...MECH_ART.pulsar!, guns: [], stride: hartStride(2) };
  MECH_ART.quasar = { ...MECH_ART.quasar!, guns: [], stride: hartStride(3) };
  // the T4 leaves the mech rig for the legged one, on the cells above; the
  // T5 was legged already and keeps its own caps and feet
  delete MECH_ART.vela;
  LEG_ART.vela = {
    body: UV_VELA_BODY,
    base: UV_VELA_BASE,
    joint: UV_VELA_JOINT,
    baseJoint: UV_VELA_JOINT_BASE,
    foot: UV_VELA_FOOT,
    leg: UV_VELA_LEG_SEG,
    legBase: UV_VELA_LEG_BASE_SEG,
    legStroke: HART_SEG4.th * PX,
    legBaseStroke: HART_SEG4.sh * PX,
    guns: [],
    sprite: UNIT_SPRITE * 4,
    small: UNIT_SPRITE * 2,
    sil: {
      body: UV_VELA_BODY_SIL,
      base: UV_VELA_BASE_SIL,
      joint: UV_VELA_JOINT_SIL,
      baseJoint: UV_VELA_JOINT_BASE_SIL,
      foot: UV_VELA_FOOT_SIL,
    },
  };
  LEG_ART.corvus = {
    ...LEG_ART.corvus!,
    leg: UV_CORVUS_LEG_SEG,
    legBase: UV_CORVUS_LEG_BASE_SEG,
    legStroke: HART_SEG5.th * PX,
    legBaseStroke: HART_SEG5.sh * PX,
  };
}

const ENV = "/mindustry/sprites/blocks/environment";
// THE LAND FLOORS ARE NOT IN THIS TABLE. They are the game's own art,
// painted at load from game/tiles.ts (see packAtlas) rather than loaded
// from Mindustry's speckled floor sprites; only the two waters, which the
// water shader was written against, still come from files.
const SPRITES = {
  // Mindustry's two water floors (Blocks.water is the file "shallow-water",
  // Blocks.deepwater is "deep-water"). Unlike every land floor above, these
  // ship as ONE tile each rather than three numbered variants — see the
  // UV_FLOORS note for how the three-wide group slot handles that
  shallowWater: `${ENV}/shallow-water.png`,
  deepWater: `${ENV}/deep-water.png`,
  // (the walls are painted from game/tiles.ts too — see packAtlas)
  edgeStencil: `${ENV}/edge-stencil.png`,
  // ---- the second environment band (see the ENV2 note) ----
  // Mindustry's "moss" IS the purple spore growth, not a green one; the
  // two moss families and the spore waters are one palette, which is what
  // makes them a biome rather than a handful of extra tiles
  // (the band's land floors are painted from game/tiles.ts, like row 0's)
  taintedWater: `${ENV}/tainted-water.png`,
  deepTaintedWater: `${ENV}/deep-tainted-water.png`,
  daggerBase: "/mindustry/sprites/units/dagger-base.png",
  dagger: "/mindustry/sprites/units/dagger.png",
  daggerLeg: "/mindustry/sprites/units/dagger-leg.png",
  maceBase: "/mindustry/sprites/units/mace-base.png",
  mace: "/mindustry/sprites/units/mace.png",
  maceLeg: "/mindustry/sprites/units/mace-leg.png",
  atrax: "/mindustry/sprites/units/atrax.png",
  atraxBase: "/mindustry/sprites/units/atrax-base.png",
  atraxLeg: "/mindustry/sprites/units/atrax-leg.png",
  atraxLegBase: "/mindustry/sprites/units/atrax-leg-base.png",
  atraxJoint: "/mindustry/sprites/units/atrax-joint.png",
  atraxFoot: "/mindustry/sprites/units/atrax-foot.png",
  atraxWeapon: "/mindustry/sprites/units/weapons/atrax-weapon.png",
  spiroct: "/mindustry/sprites/units/spiroct.png",
  spiroctLeg: "/mindustry/sprites/units/spiroct-leg.png",
  spiroctLegBase: "/mindustry/sprites/units/spiroct-leg-base.png",
  spiroctJoint: "/mindustry/sprites/units/spiroct-joint.png",
  spiroctFoot: "/mindustry/sprites/units/spiroct-foot.png",
  spiroctWeapon: "/mindustry/sprites/units/weapons/spiroct-weapon.png",
  spiroctMount: "/mindustry/sprites/units/weapons/mount-purple-weapon.png",
  crawlerBase: "/mindustry/sprites/units/crawler-base.png",
  crawler: "/mindustry/sprites/units/crawler.png",
  crawlerLeg: "/mindustry/sprites/units/crawler-leg.png",
  fortressBase: "/mindustry/sprites/units/fortress-base.png",
  fortress: "/mindustry/sprites/units/fortress.png",
  fortressLeg: "/mindustry/sprites/units/fortress-leg.png",
  flare: "/mindustry/sprites/units/flare.png",
  horizon: "/mindustry/sprites/units/horizon.png",
  zenith: "/mindustry/sprites/units/zenith.png",
  largeWeapon: "/mindustry/sprites/units/weapons/large-weapon.png",
  flamethrower: "/mindustry/sprites/units/weapons/flamethrower.png",
  artillery: "/mindustry/sprites/units/weapons/artillery.png",
  nova: "/mindustry/sprites/units/nova.png",
  novaBase: "/mindustry/sprites/units/nova-base.png",
  novaLeg: "/mindustry/sprites/units/nova-leg.png",
  healWeapon: "/mindustry/sprites/units/weapons/heal-weapon.png",
  pulsar: "/mindustry/sprites/units/pulsar.png",
  pulsarBase: "/mindustry/sprites/units/pulsar-base.png",
  pulsarLeg: "/mindustry/sprites/units/pulsar-leg.png",
  healShotgun: "/mindustry/sprites/units/weapons/heal-shotgun-weapon.png",
  quasar: "/mindustry/sprites/units/quasar.png",
  quasarBase: "/mindustry/sprites/units/quasar-base.png",
  quasarLeg: "/mindustry/sprites/units/quasar-leg.png",
  beamWeapon: "/mindustry/sprites/units/weapons/beam-weapon.png",
  scepter: "/mindustry/sprites/units/scepter.png",
  scepterBase: "/mindustry/sprites/units/scepter-base.png",
  scepterLeg: "/mindustry/sprites/units/scepter-leg.png",
  scepterWeapon: "/mindustry/sprites/units/weapons/scepter-weapon.png",
  scepterMount: "/mindustry/sprites/units/weapons/scepter-mount.png",
  vela: "/mindustry/sprites/units/vela.png",
  velaBase: "/mindustry/sprites/units/vela-base.png",
  velaLeg: "/mindustry/sprites/units/vela-leg.png",
  repairBeam: "/mindustry/sprites/units/weapons/repair-beam-weapon-center-large.png",
  arkyid: "/mindustry/sprites/units/arkyid.png",
  arkyidFoot: "/mindustry/sprites/units/arkyid-foot.png",
  arkyidJointBase: "/mindustry/sprites/units/arkyid-joint-base.png",
  arkyidLeg: "/mindustry/sprites/units/arkyid-leg.png",
  arkyidLegBase: "/mindustry/sprites/units/arkyid-leg-base.png",
  purpleMount: "/mindustry/sprites/units/weapons/large-purple-mount.png",
  antumbra: "/mindustry/sprites/units/antumbra.png",
  disrupt: "/mindustry/sprites/units/disrupt.png",
  reign: "/mindustry/sprites/units/reign.png",
  reignBase: "/mindustry/sprites/units/reign-base.png",
  reignLeg: "/mindustry/sprites/units/reign-leg.png",
  reignWeapon: "/mindustry/sprites/units/weapons/reign-weapon.png",
  corvus: "/mindustry/sprites/units/corvus.png",
  corvusBase: "/mindustry/sprites/units/corvus-base.png",
  corvusLeg: "/mindustry/sprites/units/corvus-leg.png",
  corvusLegBase: "/mindustry/sprites/units/corvus-leg-base.png",
  corvusJoint: "/mindustry/sprites/units/corvus-joint.png",
  corvusJointBase: "/mindustry/sprites/units/corvus-joint-base.png",
  corvusFoot: "/mindustry/sprites/units/corvus-foot.png",
  toxopid: "/mindustry/sprites/units/toxopid.png",
  toxopidLeg: "/mindustry/sprites/units/toxopid-leg.png",
  toxopidLegBase: "/mindustry/sprites/units/toxopid-leg-base.png",
  toxopidJointBase: "/mindustry/sprites/units/toxopid-joint-base.png",
  toxopidFoot: "/mindustry/sprites/units/toxopid-foot.png",
  toxopidCannon: "/mindustry/sprites/units/weapons/toxopid-cannon.png",
  eclipse: "/mindustry/sprites/units/eclipse.png",
  // the naval tanks. Each is a single hull sprite — the naval types' own
  // weapons all sit on turret mounts Mindustry draws from the weapon
  // sheets, and a hull with no assembled parts needs none of them here
  risso: "/mindustry/sprites/units/risso.png",
  minke: "/mindustry/sprites/units/minke.png",
  bryde: "/mindustry/sprites/units/bryde.png",
  sei: "/mindustry/sprites/units/sei.png",
  omura: "/mindustry/sprites/units/omura.png",
  retusa: "/mindustry/sprites/units/retusa.png",
  oxynoe: "/mindustry/sprites/units/oxynoe.png",
  cyerce: "/mindustry/sprites/units/cyerce.png",
  aegires: "/mindustry/sprites/units/aegires.png",
  navanax: "/mindustry/sprites/units/navanax.png",
  spawnPad: `${ENV}/dark-panel-2.png`,
  towerBase: "/mindustry/sprites/blocks/turrets/bases/block-2.png",
  towerBase1: "/mindustry/sprites/blocks/turrets/bases/block-1.png",
  towerBase3: "/mindustry/sprites/blocks/turrets/bases/block-3.png",
  duoPreview: "/mindustry/sprites/blocks/turrets/duo/duo-preview.png",
  hail: "/mindustry/sprites/blocks/turrets/hail.png",
  salvoPreview: "/mindustry/sprites/blocks/turrets/salvo/salvo-preview.png",
  scatterPreview: "/mindustry/sprites/blocks/turrets/scatter/scatter-preview.png",
  fuse: "/mindustry/sprites/blocks/turrets/fuse.png",
  scorch: "/mindustry/sprites/blocks/turrets/scorch.png",
  arc: "/mindustry/sprites/blocks/turrets/arc.png",
  lancer: "/mindustry/sprites/blocks/turrets/lancer.png",
  ripple: "/mindustry/sprites/blocks/turrets/ripple.png",
  // the liquid turrets ship in three layers apiece: the turret art, the
  // liquid window (a white mask, tinted at pack time), and the specular
  // gleam drawn untinted over the water — see liquidTurret()
  wave: "/mindustry/sprites/blocks/turrets/wave.png",
  waveLiquid: "/mindustry/sprites/blocks/turrets/wave-liquid.png",
  waveTop: "/mindustry/sprites/blocks/turrets/wave-top.png",
  tsunami: "/mindustry/sprites/blocks/turrets/tsunami.png",
  tsunamiLiquid: "/mindustry/sprites/blocks/turrets/tsunami-liquid.png",
  tsunamiTop: "/mindustry/sprites/blocks/turrets/tsunami-top.png",
  // parallax is filed under defense, not turrets — upstream it damages
  // almost nothing and Mindustry classes it with the support blocks (ours
  // spools up into a real gun; the sprite still lives where Mindustry
  // packs it)
  parallax: "/mindustry/sprites/blocks/defense/parallax.png",
  // the support pair, each in the two layers DrawDefault + DrawRegion lays
  // down: the block and the `-top` crystal over it (see mendBlock)
  mender: "/mindustry/sprites/blocks/defense/mender.png",
  menderTop: "/mindustry/sprites/blocks/defense/mender-top.png",
  mendProjector: "/mindustry/sprites/blocks/defense/mend-projector.png",
  mendProjectorTop: "/mindustry/sprites/blocks/defense/mend-projector-top.png",
  // the shield tower wears the force projector's art — the one Mindustry
  // block whose whole job is standing a dome, which is this structure's too
  shieldTower: "/mindustry/sprites/blocks/defense/force-projector.png",
  towerBase4: "/mindustry/sprites/blocks/turrets/bases/block-4.png",
  swarmer: "/mindustry/sprites/blocks/turrets/swarmer.png",
  // cyclone's own art is the bare head; its three barrels are separate
  // sprites the preview already has assembled underneath
  cyclonePreview: "/mindustry/sprites/blocks/turrets/cyclone/cyclone-preview.png",
  spectre: "/mindustry/sprites/blocks/turrets/spectre.png",
  meltdown: "/mindustry/sprites/blocks/turrets/meltdown.png",
  foreshadow: "/mindustry/sprites/blocks/turrets/foreshadow.png",
  // the walls, 1x1 block art at Mindustry's 32px
  // ...and the 2x2 large walls, 64px block art
  missile: "/mindustry/sprites/effects/missile.png",
  missileBack: "/mindustry/sprites/effects/missile-back.png",
  parallaxLaser: "/mindustry/sprites/effects/parallax-laser.png",
  parallaxLaserEnd: "/mindustry/sprites/effects/parallax-laser-end.png",
  shell: "/mindustry/sprites/effects/shell.png",
  shellBack: "/mindustry/sprites/effects/shell-back.png",
  base: "/mindustry/sprites/blocks/storage/core-nucleus.png",
  baseTeam: "/mindustry/sprites/blocks/storage/core-nucleus-team.png",
  bullet: "/mindustry/sprites/effects/bullet.png",
  bulletBack: "/mindustry/sprites/effects/bullet-back.png",
  // the swarm's own bullet sprites beyond the turrets' three pairs (see
  // UV_CIRCLE_BULLET): the emp round, the retusa torpedo, cyerce's plasma
  // missile, the disrupt's missile unit, and the sap beam's line and cap
  circleBullet: "/mindustry/sprites/effects/circle-bullet.png",
  circleBulletBack: "/mindustry/sprites/effects/circle-bullet-back.png",
  mineBullet: "/mindustry/sprites/effects/mine-bullet.png",
  mineBulletBack: "/mindustry/sprites/effects/mine-bullet-back.png",
  missileLarge: "/mindustry/sprites/effects/missile-large.png",
  missileLargeBack: "/mindustry/sprites/effects/missile-large-back.png",
  disruptMissile: "/mindustry/sprites/units/weapons/disrupt-missile.png",
  laser: "/mindustry/sprites/effects/laser.png",
  laserEnd: "/mindustry/sprites/effects/laser-end.png",
  // THE TEAM CELLS: every unit's `-cell` region, the part of its hull
  // Mindustry paints in the owning team's colour (UnitType.drawCell). The
  // dagger and the flare have none of their own and fall back to
  // power-cell, exactly as UnitType.load does
  powerCell: "/mindustry/sprites/units/power-cell.png",
  maceCell: "/mindustry/sprites/units/mace-cell.png",
  fortressCell: "/mindustry/sprites/units/fortress-cell.png",
  scepterCell: "/mindustry/sprites/units/scepter-cell.png",
  reignCell: "/mindustry/sprites/units/reign-cell.png",
  crawlerCell: "/mindustry/sprites/units/crawler-cell.png",
  atraxCell: "/mindustry/sprites/units/atrax-cell.png",
  spiroctCell: "/mindustry/sprites/units/spiroct-cell.png",
  arkyidCell: "/mindustry/sprites/units/arkyid-cell.png",
  toxopidCell: "/mindustry/sprites/units/toxopid-cell.png",
  novaCell: "/mindustry/sprites/units/nova-cell.png",
  pulsarCell: "/mindustry/sprites/units/pulsar-cell.png",
  quasarCell: "/mindustry/sprites/units/quasar-cell.png",
  velaCell: "/mindustry/sprites/units/vela-cell.png",
  corvusCell: "/mindustry/sprites/units/corvus-cell.png",
  horizonCell: "/mindustry/sprites/units/horizon-cell.png",
  zenithCell: "/mindustry/sprites/units/zenith-cell.png",
  antumbraCell: "/mindustry/sprites/units/antumbra-cell.png",
  eclipseCell: "/mindustry/sprites/units/eclipse-cell.png",
  disruptCell: "/mindustry/sprites/units/disrupt-cell.png",
  rissoCell: "/mindustry/sprites/units/risso-cell.png",
  minkeCell: "/mindustry/sprites/units/minke-cell.png",
  brydeCell: "/mindustry/sprites/units/bryde-cell.png",
  seiCell: "/mindustry/sprites/units/sei-cell.png",
  omuraCell: "/mindustry/sprites/units/omura-cell.png",
  retusaCell: "/mindustry/sprites/units/retusa-cell.png",
  oxynoeCell: "/mindustry/sprites/units/oxynoe-cell.png",
  cyerceCell: "/mindustry/sprites/units/cyerce-cell.png",
  aegiresCell: "/mindustry/sprites/units/aegires-cell.png",
  navanaxCell: "/mindustry/sprites/units/navanax-cell.png",
} as const;

// Mindustry's sharded (player) team color — the team overlay multiplies by it
const TEAM_COLOR = "#ffd37f";

type SpriteKey = keyof typeof SPRITES;

async function loadImages(): Promise<Record<SpriteKey, HTMLImageElement>> {
  const entries = await Promise.all(
    (Object.keys(SPRITES) as SpriteKey[]).map(async (key) => {
      const img = new Image();
      // load event, not img.decode(): decode() is deferred indefinitely in
      // hidden tabs; drawImage decodes synchronously when we composite anyway
      const loaded = new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error(`failed to load sprite: ${SPRITES[key]}`));
      });
      img.src = SPRITES[key];
      await loaded;
      return [key, img] as const;
    }),
  );
  return Object.fromEntries(entries) as Record<SpriteKey, HTMLImageElement>;
}

// Mindustry's generated sprite outlines (Arc Pixmaps.outline, applied at
// sprite-pack time in the real game): every not-fully-opaque pixel within a
// circular radius of any non-transparent pixel becomes the outline color.
// Units get radius 3 in Pal.darkerMetal; turret tops get the Block default,
// radius 4 in #404049. Legs and mech chassis stay raw — the game draws them
// unoutlined (their dark edging is hand-drawn into the source art).
const UNIT_OUTLINE = "#565666"; // Pal.darkerMetal
const BLOCK_OUTLINE = "#404049"; // Block.outlineColor
const UNIT_OUTLINE_R = 0; // UnitType.outlineRadius
const BLOCK_OUTLINE_R = 0; // Block.outlineRadius

/**
 * Faithful port of Arc's Pixmaps.outline(region, color, radius) with the
 * padding ImagePacker uses (0): the scan clips at the sprite rect, so art
 * that touches its own edge gets no outline there — exactly like the base
 * game's packed sprites. Runs at native sprite resolution; upscales after,
 * so outline thickness stays proportional to the art like in Mindustry.
 */
function outlined(src: HTMLImageElement | HTMLCanvasElement, color: string, radius: number): HTMLCanvasElement {
  const w = src instanceof HTMLImageElement ? src.naturalWidth : src.width;
  const h = src instanceof HTMLImageElement ? src.naturalHeight : src.height;
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  if (radius <= 0) {
    const plain = cv.getContext("2d");
    if (!plain) throw new Error("2d context unavailable for outline");
    plain.imageSmoothingEnabled = false;
    plain.drawImage(src, 0, 0);
    return cv;
  }
  // read-back canvas: both this pass and silhouetted() pull the pixels out
  // with getImageData, and a GPU-backed canvas has to stall and copy back
  // every time. Say so up front and the browser keeps it in system memory
  const cc = cv.getContext("2d", { willReadFrequently: true });
  if (!cc) throw new Error("2d context unavailable for outline");
  cc.imageSmoothingEnabled = false;
  cc.drawImage(src, 0, 0);
  const id = cc.getImageData(0, 0, w, h);
  const a = id.data;
  const out = cc.createImageData(w, h);
  out.data.set(a);
  const o = out.data;
  const cr = parseInt(color.slice(1, 3), 16);
  const cg = parseInt(color.slice(3, 5), 16);
  const cb = parseInt(color.slice(5, 7), 16);
  const r2 = radius * radius;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (a[(y * w + x) * 4 + 3] === 255) continue;
      let found = false;
      for (let ry = -radius; ry <= radius && !found; ry++) {
        const yy = y + ry;
        if (yy < 0 || yy >= h) continue;
        for (let rx = -radius; rx <= radius; rx++) {
          const xx = x + rx;
          if (xx < 0 || xx >= w || rx * rx + ry * ry > r2) continue;
          if (a[(yy * w + xx) * 4 + 3] !== 0) {
            found = true;
            break;
          }
        }
      }
      if (found) {
        const i = (y * w + x) * 4;
        o[i] = cr;
        o[i + 1] = cg;
        o[i + 2] = cb;
        o[i + 3] = 255;
      }
    }
  }
  cc.putImageData(out, 0, 0);
  return cv;
}

/**
 * UnitType.drawCell's art, ALONE on a canvas the size of the body it rides:
 * the unit's `-cell` region, untinted, centred on the hull exactly as
 * Mindustry centres it — `Draw.rect(cellRegion, unit.x, unit.y)`, both
 * regions on the same point, whatever their sizes (a risso's cell is
 * packed on a 96px square around a 70x78 hull, and a dagger's is 56px of
 * power-cell over a 48px body, clipped by it).
 *
 * IT USED TO BE BAKED INTO THE HULL in the swarm's red, which was the
 * whole team read and cost nothing — right up until the player got bodies
 * of their own out of the factories. The two sides draw from ONE set of
 * sprites, so a baked cell made every dagger on the field the swarm's.
 * The cell is therefore packed on its own (see the team-cell blocks) and
 * drawn over the hull in the owning team's colour, which is what
 * UnitType.drawCell does in the first place. The source art is white, so
 * the renderer's multiply IS Draw.color; the same tint carries the health
 * greying (HP_TINT) the baked cell used to get from the body under it.
 */
/** a source's pixel size, sprite file or drawn canvas alike */
type Src = HTMLImageElement | HTMLCanvasElement;
const srcW = (s: Src): number => (s instanceof HTMLImageElement ? s.naturalWidth : s.width);
const srcH = (s: Src): number => (s instanceof HTMLImageElement ? s.naturalHeight : s.height);

function cellArt(body: Src, cell: Src): HTMLCanvasElement {
  const w = srcW(body), h = srcH(body);
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  const cc = cv.getContext("2d");
  if (!cc) throw new Error("2d context unavailable for team cell");
  cc.imageSmoothingEnabled = false;
  cc.drawImage(cell, Math.round((w - srcW(cell)) / 2), Math.round((h - srcH(cell)) / 2));
  return cv;
}

/** the smallest rect holding every pixel of `src` that is not transparent,
 *  or null for a canvas with none */
function opaqueBounds(src: HTMLCanvasElement): { x: number; y: number; w: number; h: number } | null {
  const cc = src.getContext("2d", { willReadFrequently: true });
  if (!cc) throw new Error("2d context unavailable for cell bounds");
  const d = cc.getImageData(0, 0, src.width, src.height).data;
  let x0 = src.width, y0 = src.height, x1 = -1, y1 = -1;
  for (let y = 0; y < src.height; y++) {
    for (let x = 0; x < src.width; x++) {
      if (d[(y * src.width + x) * 4 + 3] === 0) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/**
 * A part's alpha shape dilated by the official outline radius and filled
 * solid with the unit outline color. Drawn under the whole walking assembly
 * (see pushMech), the union of these reads as a single rim around the
 * unit's outer silhouette, with no line at any part seam.
 */
function silhouetted(src: Src): HTMLCanvasElement {
  const cv = outlined(src, UNIT_OUTLINE, UNIT_OUTLINE_R);
  const cc = cv.getContext("2d");
  if (!cc) throw new Error("2d context unavailable for silhouette");
  const id = cc.getImageData(0, 0, cv.width, cv.height);
  const d = id.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    d[i] = 0x56;
    d[i + 1] = 0x56;
    d[i + 2] = 0x66;
  }
  cc.putImageData(id, 0, 0);
  return antialiased(cv);
}

/** Liquids.water.color — the tint baked into the liquid turrets' windows */
const WATER_COLOR = "#596ab8";

/**
 * A LiquidTurret's draw stack (Mindustry DrawTurret), baked flat at pack
 * time: the outlined turret art, the `-liquid` window — a white mask,
 * tinted the liquid's colour with the multiply + destination-in recipe the
 * base's team overlay uses — and the untinted `-top` specular gleam over
 * the water. The window is drawn FULL: upstream its alpha is the turret's
 * ammo fraction, and these turrets consume nothing here, so a live liquid
 * layer would only ever be this constant.
 */
function liquidTurret(
  base: HTMLImageElement,
  liquid: HTMLImageElement,
  top: HTMLImageElement,
): HTMLCanvasElement {
  const cv = outlined(base, BLOCK_OUTLINE, BLOCK_OUTLINE_R);
  const cc = cv.getContext("2d");
  if (!cc) throw new Error("2d context unavailable for liquid turret");
  const w = cv.width, h = cv.height;
  const win = document.createElement("canvas");
  win.width = w;
  win.height = h;
  const wc = win.getContext("2d");
  if (!wc) throw new Error("2d context unavailable for liquid window");
  wc.imageSmoothingEnabled = false;
  wc.drawImage(liquid, 0, 0, w, h);
  wc.globalCompositeOperation = "multiply";
  wc.fillStyle = WATER_COLOR;
  wc.fillRect(0, 0, w, h);
  wc.globalCompositeOperation = "destination-in";
  wc.drawImage(liquid, 0, 0, w, h);
  cc.imageSmoothingEnabled = false;
  cc.drawImage(win, 0, 0);
  cc.drawImage(top, 0, 0, w, h);
  return cv;
}

/**
 * A support block's two layers baked flat: the outlined block art with its
 * `-top` crystal laid over it, which is all Mindustry's MendProjector draws
 * beyond the pulse itself. The top is NOT outlined — it sits inside the
 * block's own silhouette, and outlining it would draw a black ring in the
 * middle of the sprite.
 */
function mendBlock(base: HTMLImageElement, top: HTMLImageElement): HTMLCanvasElement {
  const cv = outlined(base, BLOCK_OUTLINE, BLOCK_OUTLINE_R);
  const cc = cv.getContext("2d");
  if (!cc) throw new Error("2d context unavailable for mend block");
  cc.imageSmoothingEnabled = false;
  cc.drawImage(top, 0, 0, cv.width, cv.height);
  return cv;
}

/**
 * Faithful port of Arc's Pixmaps.antialias — the smoothing pass Mindustry's
 * sprite packer runs over every generated sprite after outlining (see
 * tools/build.gradle: "antialias everything except UI elements"). For each
 * pixel it picks Scale2x-style edge candidates from the 3x3 neighborhood,
 * then averages all nine, pulling transparent slots toward the alpha-weighted
 * mean color so edges feather instead of ringing dark. Validated pixel-exact
 * (within 1/255 rounding) against the game's own generated dagger sprite.
 */
function antialiased(src: HTMLImageElement | HTMLCanvasElement): HTMLCanvasElement {
  const w = src instanceof HTMLImageElement ? src.naturalWidth : src.width;
  const h = src instanceof HTMLImageElement ? src.naturalHeight : src.height;
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  const cc = cv.getContext("2d", { willReadFrequently: true });
  if (!cc) throw new Error("2d context unavailable for antialias");
  cc.imageSmoothingEnabled = false;
  cc.drawImage(src, 0, 0);
  const id = cc.getImageData(0, 0, w, h);
  const d = id.data;
  // rgba packed into int32 so the EPX equality tests are single compares
  const px = new Int32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    px[i] = (d[i * 4] << 24) | (d[i * 4 + 1] << 16) | (d[i * 4 + 2] << 8) | d[i * 4 + 3];
  }
  const get = (x: number, y: number): number =>
    px[Math.min(Math.max(y, 0), h - 1) * w + Math.min(Math.max(x, 0), w - 1)];
  const out = cc.createImageData(w, h);
  const q = out.data;
  const p9 = new Int32Array(9);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const A = get(x - 1, y + 1), B = get(x, y + 1), C = get(x + 1, y + 1);
      const D = get(x - 1, y), E = get(x, y), F = get(x + 1, y);
      const G = get(x - 1, y - 1), H = get(x, y - 1), I = get(x + 1, y - 1);
      p9.fill(E);
      if (D === B && D !== H && B !== F) p9[0] = D;
      if ((D === B && D !== H && B !== F && E !== C) || (B === F && B !== D && F !== H && E !== A)) p9[1] = B;
      if (B === F && B !== D && F !== H) p9[2] = F;
      if ((H === D && H !== F && D !== B && E !== A) || (D === B && D !== H && B !== F && E !== G)) p9[3] = D;
      if ((B === F && B !== D && F !== H && E !== I) || (F === H && F !== B && H !== D && E !== C)) p9[5] = F;
      if (H === D && H !== F && D !== B) p9[6] = D;
      if ((F === H && F !== B && H !== D && E !== G) || (H === D && H !== F && D !== B && E !== I)) p9[7] = H;
      if (F === H && F !== B && H !== D) p9[8] = F;
      let sumr = 0, sumg = 0, sumb = 0, suma = 0;
      for (let k = 0; k < 9; k++) {
        const v = p9[k];
        const a = (v & 0xff) / 255;
        sumr += ((v >>> 24) & 0xff) / 255 * a;
        sumg += ((v >>> 16) & 0xff) / 255 * a;
        sumb += ((v >>> 8) & 0xff) / 255 * a;
        suma += a;
      }
      const inv = suma <= 0.001 ? 0 : 1 / suma;
      sumr *= inv;
      sumg *= inv;
      sumb *= inv;
      let tr = 0, tg = 0, tb = 0, ta = 0;
      for (let k = 0; k < 9; k++) {
        const v = p9[k];
        const a = (v & 0xff) / 255;
        const t = 1 - a;
        const r = ((v >>> 24) & 0xff) / 255;
        const g = ((v >>> 16) & 0xff) / 255;
        const b = ((v >>> 8) & 0xff) / 255;
        tr += r + t * (sumr - r);
        tg += g + t * (sumg - g);
        tb += b + t * (sumb - b);
        ta += a;
      }
      const i4 = (y * w + x) * 4;
      q[i4] = (tr / 9) * 255;
      q[i4 + 1] = (tg / 9) * 255;
      q[i4 + 2] = (tb / 9) * 255;
      q[i4 + 3] = (ta / 9) * 255;
    }
  }
  cc.putImageData(out, 0, 0);
  return cv;
}

/**
 * A turret sprite put through the same outline + antialias treatment the
 * atlas gives in-world turret tops, returned as a data URL — for HUD icons,
 * so the tower menu matches what gets built. Loads the sprite itself; safe
 * to call from UI code without touching the atlas.
 */
export async function turretIcon(url: string): Promise<string> {
  const img = new Image();
  const loaded = new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error(`failed to load sprite: ${url}`));
  });
  img.src = url;
  await loaded;
  return antialiased(outlined(img, BLOCK_OUTLINE, BLOCK_OUTLINE_R)).toDataURL();
}

/**
 * A BODY OFF THE PACKED SHEET, as a data URL — for the HUD's unit
 * pictures, so a thumbnail shows the body the game actually puts on the
 * board rather than Mindustry's raw sprite file.
 *
 * The difference is the whole reason this exists. What lands on the map is
 * the packed cell: outlined, run through the antialias pass, and wearing
 * its FAMILY'S colour on its team cell (levels.ts FAMILY_ACCENT, which
 * the renderer multiplies into the cell art the same way this does). A
 * thumbnail loaded straight from /mindustry/sprites/units was none of
 * those things — no outline, no smoothing, and still carrying upstream's
 * crux red where the family hue belongs.
 *
 * `accent` is passed in rather than looked up because this file knows
 * UnitKind as a TYPE only: a value import from levels.ts would close a
 * cycle. The icon comes out FACING UP, undoing drawFacingRight's quarter
 * turn, because that is the way a picture of a unit is read.
 */
export async function unitIcon(
  kind: UnitKind,
  accent: readonly [number, number, number],
): Promise<string> {
  const sheet = await buildAtlas();
  const { uv } = UNIT_ART[kind];
  const x = Math.round(uv[0] * ATLAS_W), y = Math.round(uv[1] * ATLAS_H);
  const size = Math.round((uv[2] - uv[0]) * ATLAS_W);
  const cell = UNIT_CELL[kind];

  // the body's cell onto its own canvas, on the sheet's axes
  const flat = document.createElement("canvas");
  flat.width = size;
  flat.height = size;
  const fc = flat.getContext("2d");
  if (!fc) throw new Error(`2d context unavailable for the ${kind} icon`);
  fc.imageSmoothingEnabled = false;
  fc.drawImage(sheet, x, y, size, size, 0, 0, size, size);

  // ...and the team cell over it, in the family's colour. The renderer
  // MULTIPLIES the colour into the cell texture, so this does too: a flat
  // fill would throw away the shading in the art. Multiply alone paints
  // the transparent margin as well (an opaque source leaves alpha 1
  // everywhere), hence the destination-in pass putting the art's own
  // alpha back
  if (cell) {
    const cw = Math.max(1, Math.round(cell.w * size));
    const ch = Math.max(1, Math.round(cell.h * size));
    const cx = Math.round(cell.uv[0] * ATLAS_W), cy = Math.round(cell.uv[1] * ATLAS_H);
    const tint = document.createElement("canvas");
    tint.width = cw;
    tint.height = ch;
    const tc = tint.getContext("2d");
    if (!tc) throw new Error(`2d context unavailable for the ${kind} icon cell`);
    tc.imageSmoothingEnabled = false;
    const paint = () => {
      tc.drawImage(sheet, cx, cy, cw, ch, 0, 0, cw, ch);
    };
    paint();
    tc.globalCompositeOperation = "multiply";
    tc.fillStyle = `rgb(${accent.map((v) => Math.round(v * 255)).join(",")})`;
    tc.fillRect(0, 0, cw, ch);
    tc.globalCompositeOperation = "destination-in";
    paint();
    // dx/dy are fractions of the body's quad, off its centre, in the
    // sprite's frame — which IS the sheet's frame for art already turned
    fc.drawImage(
      tint,
      Math.round(size / 2 + cell.dx * size - cw / 2),
      Math.round(size / 2 + cell.dy * size - ch / 2),
    );
  }

  // and the quarter turn back, so the body points up the way the sprite
  // files it was composited from do — CROPPED TO WHAT IT COVERS on the
  // way, because a sheet cell is bigger than the art in it by a different
  // margin for every kind (a flare's 48px body sits in a 64px cell, a
  // risso's in a 128) and the HUD scales an icon to a fixed square. Left
  // uncropped, a family's picture came out the size of its own padding
  // and a row of them read as a row of different-sized units
  const crop = opaqueBounds(flat) ?? { x: 0, y: 0, w: size, h: size };
  const out = document.createElement("canvas");
  // the turn swaps the crop's axes
  out.width = crop.h;
  out.height = crop.w;
  const oc = out.getContext("2d");
  if (!oc) throw new Error(`2d context unavailable for the ${kind} icon turn`);
  oc.imageSmoothingEnabled = false;
  oc.translate(crop.h / 2, crop.w / 2);
  oc.rotate(-Math.PI / 2);
  oc.drawImage(flat, crop.x, crop.y, crop.w, crop.h, -crop.w / 2, -crop.h / 2, crop.w, crop.h);
  return out.toDataURL();
}

// ---------------------------------------------------------------------
// DRAWING INTO A CELL — the only way paint reaches the sheet
// ---------------------------------------------------------------------

/**
 * A source into its cell, the way the cell was declared: stretched to
 * fill it, or at its native size centred in it; as authored, or turned
 * a quarter turn clockwise so Mindustry's up-facing sprites face +x.
 * The context is CLIPPED to the cell first, so nothing a draw does can
 * land on a neighbour — an overhang (pulsar's 68px body in a 64 cell,
 * the film round a trimmed beam sprite) is simply cut off.
 *
 * `size` overrides the native size for art whose extent the cell does
 * not declare: the generated animal parts, and the two beam sprites
 * whose cells hug the opaque region of a larger source. Without it, a
 * native-size cell checks that the source IS the size it declared,
 * because the gutter was sized from that declaration.
 */
function drawCell(c: CanvasRenderingContext2D, uv: UVRect, src: Src, size?: readonly [number, number]): void {
  const cell = cellOf(uv);
  let w: number, h: number;
  if (size) [w, h] = size;
  else if (cell.art) {
    w = srcW(src);
    h = srcH(src);
    if (w !== cell.art[0] || h !== cell.art[1])
      throw new Error(`atlas cell ${cell.name} declares ${cell.art[0]}x${cell.art[1]} art and was handed ${w}x${h}`);
  } else {
    w = cell.w;
    h = cell.h;
  }
  c.save();
  c.beginPath();
  c.rect(cell.x, cell.y, cell.w, cell.h);
  c.clip();
  c.translate(cell.x + cell.w / 2, cell.y + cell.h / 2);
  if (!cell.upright) c.rotate(Math.PI / 2);
  c.drawImage(src, -w / 2, -h / 2, w, h);
  c.restore();
}

/**
 * Procedural paint into a cell: the callback gets the context clipped to
 * the cell with the origin at the cell's top-left corner, and the cell's
 * size and inset to draw against.
 */
function paintCell(
  c: CanvasRenderingContext2D,
  uv: UVRect,
  fn: (c: CanvasRenderingContext2D, cell: { w: number; h: number; inset: number }) => void,
): void {
  const cell = cellOf(uv);
  c.save();
  c.beginPath();
  c.rect(cell.x, cell.y, cell.w, cell.h);
  c.clip();
  c.translate(cell.x, cell.y);
  fn(c, { w: cell.w, h: cell.h, inset: cell.inset });
  c.restore();
}

/** a cell back to transparent, for art packed over stock art */
function clearCell(c: CanvasRenderingContext2D, uv: UVRect): void {
  const cell = cellOf(uv);
  c.clearRect(cell.x, cell.y, cell.w, cell.h);
}

/**
 * THE ANIMAL ART INTO THE SHEET, after every stock cell is drawn: each
 * part cleared and redrawn at native size, through the same antialias and
 * silhouette passes as the sprite files, and each body's team cell
 * requeued off the animal's own glow. Nothing under public/ is touched;
 * with the switch off this is never called and the sheet is the stock one.
 */
function packAnimalArt(
  c: CanvasRenderingContext2D,
  teamCell: (kind: UnitKind, body: HTMLCanvasElement, cell: HTMLCanvasElement, bodyUV: UVRect, w: number, h?: number) => void,
  dropCell: (kind: UnitKind) => void,
): void {
  // a part into its cell at native size, the way the cell is declared
  // (a knee cap's cell is upright, because it is drawn unrotated)
  const part = (u: UVRect, art: HTMLCanvasElement, sil = false): void => {
    clearCell(c, u);
    drawCell(c, u, sil ? silhouetted(art) : antialiased(art), [art.width, art.height]);
  };
  // a stretched segment on its exact rect
  const seg = (u: UVRect, art: HTMLCanvasElement): void => {
    clearCell(c, u);
    drawCell(c, u, antialiased(art));
  };

  // ---- Starhart ----
  const mechCells = [
    { kind: "nova" as const, body: UV_NOVA_BODY, base: UV_NOVA_BASE, leg: UV_NOVA_LEG, sil: { body: UV_NOVA_BODY_SIL, base: UV_NOVA_BASE_SIL, leg: UV_NOVA_LEG_SIL } },
    { kind: "pulsar" as const, body: UV_PULSAR_BODY, base: UV_PULSAR_BASE, leg: UV_PULSAR_LEG, sil: { body: UV_PULSAR_BODY_SIL, base: UV_PULSAR_BASE_SIL, leg: UV_PULSAR_LEG_SIL } },
    { kind: "quasar" as const, body: UV_QUASAR_BODY, base: UV_QUASAR_BASE, leg: UV_QUASAR_LEG, sil: { body: UV_QUASAR_BODY_SIL, base: UV_QUASAR_BASE_SIL, leg: UV_QUASAR_LEG_SIL } },
  ];
  mechCells.forEach((cells, i) => {
    const T = HART_TIERS[i];
    const a = hartMech(T);
    const body = toCanvas(a.body), base = toCanvas(a.base), leg = toCanvas(a.leg);
    part(cells.body, body); part(cells.base, base); part(cells.leg, leg);
    part(cells.sil.body, body, true); part(cells.sil.base, base, true); part(cells.sil.leg, leg, true);
    dropCell(cells.kind);
    teamCell(cells.kind, body, toCanvas(a.cell), cells.body, T.n);
  });
  const legCells = [
    { kind: "vela" as const, body: UV_VELA_BODY, base: UV_VELA_BASE, joint: UV_VELA_JOINT, baseJoint: UV_VELA_JOINT_BASE, foot: UV_VELA_FOOT, leg: UV_VELA_LEG_SEG, legBase: UV_VELA_LEG_BASE_SEG,
      sil: { body: UV_VELA_BODY_SIL, base: UV_VELA_BASE_SIL, joint: UV_VELA_JOINT_SIL, baseJoint: UV_VELA_JOINT_BASE_SIL, foot: UV_VELA_FOOT_SIL } },
    { kind: "corvus" as const, body: UV_CORVUS_BODY, base: UV_CORVUS_BASE, joint: UV_CORVUS_JOINT, baseJoint: UV_CORVUS_JOINT_BASE, foot: UV_CORVUS_FOOT, leg: UV_CORVUS_LEG_SEG, legBase: UV_CORVUS_LEG_BASE_SEG,
      sil: { body: UV_CORVUS_BODY_SIL, base: UV_CORVUS_BASE_SIL, joint: UV_CORVUS_JOINT_SIL, baseJoint: UV_CORVUS_JOINT_BASE_SIL, foot: UV_CORVUS_FOOT_SIL } },
  ];
  legCells.forEach((cells, i) => {
    const T = HART_TIERS[3 + i];
    const a = hartLegged(T);
    const body = toCanvas(a.body), base = toCanvas(a.base);
    const foot = toCanvas(a.foot), joint = toCanvas(a.joint), baseJoint = toCanvas(a.baseJoint);
    part(cells.body, body); part(cells.base, base); part(cells.foot, foot); part(cells.joint, joint); part(cells.baseJoint, baseJoint);
    part(cells.sil.body, body, true); part(cells.sil.base, base, true); part(cells.sil.foot, foot, true); part(cells.sil.joint, joint, true); part(cells.sil.baseJoint, baseJoint, true);
    seg(cells.leg, toCanvasRect(a.leg.px, a.leg.w, a.leg.h));
    seg(cells.legBase, toCanvasRect(a.legBase.px, a.legBase.w, a.legBase.h));
    dropCell(cells.kind);
    teamCell(cells.kind, body, toCanvas(a.cell), cells.body, T.n);
  });

  // ---- Stoop ----
  const fullCells: readonly UVRect[] = [UV_FLARE, UV_HORIZON, UV_ZENITH, UV_ANTUMBRA, UV_ECLIPSE];
  STOOP_TIERS.forEach((T, i) => {
    const a = stoop(T);
    const full = toCanvas(a.full);
    part(fullCells[i], full);
    const [bodyUV, wingUV] = STOOP_CELLS[i];
    part(bodyUV, toCanvas(a.body));
    part(wingUV, toCanvas(a.wing));
    dropCell(STOOP_KINDS[i]);
    teamCell(STOOP_KINDS[i], full, toCanvas(a.cell), fullCells[i], T.n);
  });
}

/** transparent margin round every packed team cell — the sheet's mip-3
 *  texel is eight px, so this keeps a shrunken read inside its own cell */
const TEAM_CELL_PAD = 8;

/**
 * Composites the Mindustry sprites (GPL-3.0, github.com/Anuken/Mindustry)
 * into the game's single texture atlas. Swap any region — or the whole
 * source set — for custom art without touching the render pipeline.
 *
 * Every draw names the cell it goes into and nothing else: where that
 * cell is was the packer's decision (see reserve), and drawCell clips to
 * it. There is no coordinate in this function.
 */
async function packAtlas(): Promise<HTMLCanvasElement> {
  const img = await loadImages();
  const a = document.createElement("canvas");
  a.width = ATLAS_W;
  a.height = ATLAS_H;
  const c = a.getContext("2d");
  if (!c) throw new Error("2d context unavailable for atlas build");
  c.imageSmoothingEnabled = false; // integer upscales keep the pixel art crisp

  const draw = (uv: UVRect, src: Src, size?: readonly [number, number]): void => drawCell(c, uv, src, size);
  const outlinedUnit = (src: HTMLImageElement): HTMLCanvasElement =>
    antialiased(outlined(src, UNIT_OUTLINE, UNIT_OUTLINE_R));
  const outlinedBlock = (src: HTMLImageElement): HTMLCanvasElement =>
    antialiased(outlined(src, BLOCK_OUTLINE, BLOCK_OUTLINE_R));

  /**
   * A BODY'S TEAM CELL, taken off the same pair of sprites the hull is
   * drawn from and queued for packing last.
   *
   * `bodyUV` is the cell the hull itself is packed into and `w`/`h` the
   * size it is drawn at inside it, because the cell has to come out on
   * the hull's own scale and be reported as a fraction of the hull's
   * quad. Nothing is drawn here: the art is cropped to what it actually
   * covers and the placement left to packTeamCells, once every body is
   * known — the animal trial requeues the ones it redraws.
   */
  const cellJobs: {
    kind: UnitKind;
    art: HTMLCanvasElement;
    crop: { x: number; y: number; w: number; h: number };
    srcW: number;
    srcH: number;
    sx: number;
    sy: number;
    cellW: number;
    cellH: number;
  }[] = [];
  const teamCell = (
    kind: UnitKind,
    body: Src,
    cell: Src,
    bodyUV: UVRect,
    w: number,
    h = w,
  ): void => {
    const art = antialiased(cellArt(body, cell));
    const crop = opaqueBounds(art);
    if (!crop) throw new Error(`the ${kind} team cell has no pixels in it`);
    cellJobs.push({
      kind,
      art,
      crop,
      srcW: srcW(body),
      srcH: srcH(body),
      sx: w / srcW(body),
      sy: h / srcH(body),
      cellW: cellOf(bodyUV).w,
      cellH: cellOf(bodyUV).h,
    });
  };

  /**
   * The queued cells onto the sheet, and UNIT_CELL filled in.
   *
   * A team cell is the one thing whose size is only known once the art
   * has been cropped, which is why it is reserved HERE rather than with
   * the rest of the sheet — the packer does not mind when it is asked.
   * Every cell is drawn through the same quarter turn as the hull it
   * belongs to, so the two sit in the sheet on the same axes and the
   * renderer can put one over the other with the body's rotation and
   * nothing else. A crop's offset from the hull's centre goes round the
   * same turn (the sprite's +x is the sheet's +x, its +y the sheet's +y),
   * which is what `dx`/`dy` are.
   */
  const packTeamCells = (): void => {
    for (const j of cellJobs) {
      // the crop at the scale the hull is drawn at, in the sprite's frame
      const lw = j.crop.w * j.sx, lh = j.crop.h * j.sy;
      // ...and on the sheet, where the quarter turn swaps the two axes
      const pw = Math.ceil(lh) + TEAM_CELL_PAD * 2, ph = Math.ceil(lw) + TEAM_CELL_PAD * 2;
      const uv = reserve(`${j.kind}-cell`, pw, ph, { art: [pw - TEAM_CELL_PAD * 2, ph - TEAM_CELL_PAD * 2] });
      paintCell(c, uv, (cc, cell) => {
        cc.translate(cell.w / 2, cell.h / 2);
        cc.rotate(Math.PI / 2);
        cc.drawImage(j.art, j.crop.x, j.crop.y, j.crop.w, j.crop.h, -lw / 2, -lh / 2, lw, lh);
      });
      // the crop's centre off the hull's, in the sprite's frame and then
      // on the sheet's axes — the same turn the art just went through
      const ox = (j.crop.x + j.crop.w / 2 - j.srcW / 2) * j.sx;
      const oy = (j.crop.y + j.crop.h / 2 - j.srcH / 2) * j.sy;
      UNIT_CELL[j.kind] = {
        uv,
        w: pw / j.cellW,
        h: ph / j.cellH,
        dx: -oy / j.cellW,
        dy: ox / j.cellH,
      };
    }
  };

  // ---------- the terrain ----------
  // THE LAND FLOORS: painted, not loaded (game/tiles.ts). Each floor has
  // two paintings — one with a single mark on it, one plain — and three
  // slots, because every table downstream is three wide. The plain one
  // takes TWO of the three, so a mark lands on one cell in three: any
  // denser and the ground reads as a field of dots. They are 32px like
  // the sprites they replaced and ride the same antialias pass into the
  // same 64px cells.
  //
  // WATER: each 32px source tiled 3x3 at NATIVE size and antialiased ONCE
  // over the whole block, not once per copy. That ordering is the
  // difference between a sea and a chessboard: Pixmaps.antialias clips at
  // its input's edge, so nine separately-AA'd tiles carry nine sets of
  // clipped borders and the 64px grid of them is plainly visible across
  // open water. Tiled first, every interior seam has its true neighbour to
  // average against and disappears. The centre 64 is the tile a floor
  // quad draws; the ring is the headroom the shader displaces into
  const floor = (kind: FloorKind, slot: number): HTMLCanvasElement =>
    floorCanvas(kind, slot === 0 ? 0 : 1);
  const waterBlock = (src: HTMLImageElement): HTMLCanvasElement => {
    const reps = WATER_TILE / 64;
    const block = document.createElement("canvas");
    block.width = block.height = 32 * reps;
    const bc = block.getContext("2d");
    if (!bc) throw new Error("2d context unavailable for water tile");
    bc.imageSmoothingEnabled = false;
    for (let ry = 0; ry < reps; ry++)
      for (let rx = 0; rx < reps; rx++) bc.drawImage(src, rx * 32, ry * 32, 32, 32);
    return antialiased(block);
  };
  FLOOR_GROUPS.forEach((g, i) => {
    const cells = FLOOR_CELLS[i];
    if ("water" in g) draw(cells[0], waterBlock(img[g.water]));
    else cells.forEach((cell, slot) => draw(cell, antialiased(floor(g.kind, slot))));
  });

  // floor edge fades, generated exactly like the game's sprite packer
  // (tools Generators.java "edge stencils"): the floor texture tiled 3x3 at
  // native 32px, multiplied per-pixel by the 96px edge-stencil alpha ring,
  // then upscaled 2x into the atlas like every other tile
  const makeEdge = (floorImg: HTMLImageElement | HTMLCanvasElement): HTMLCanvasElement => {
    const e = document.createElement("canvas");
    e.width = e.height = 96;
    const ec = e.getContext("2d");
    if (!ec) throw new Error("2d context unavailable for edge build");
    ec.imageSmoothingEnabled = false;
    for (let ty = 0; ty < 3; ty++)
      for (let tx = 0; tx < 3; tx++) ec.drawImage(floorImg, tx * 32, ty * 32, 32, 32);
    ec.globalCompositeOperation = "multiply";
    ec.drawImage(img.edgeStencil, 0, 0);
    ec.globalCompositeOperation = "destination-in";
    ec.drawImage(img.edgeStencil, 0, 0);
    return e;
  };
  EDGE_KINDS.forEach((k, i) => {
    if (k) draw(EDGE_CELLS[i]!, antialiased(makeEdge(floor(k, 0))));
  });

  // THE WALLS ARE PAINTED TOO (game/tiles.ts): two blocks a family, and a
  // 2×2 block where the family has a large cell, through the same
  // antialias pass the floors take
  WALL_KINDS_IN_ORDER.forEach((k, i) => {
    if (k) WALL_CELLS[i]!.forEach((cell, v) => draw(cell, antialiased(wallCanvas(k, v % WALL_VARIANTS))));
  });
  LARGE_KINDS.forEach((k, i) => {
    if (k) draw(LARGE_CELLS[i]!, antialiased(wallCanvas(k, 0, 2)));
  });

  // THE PROPS ARE PAINTED TOO (game/tiles.ts): each at its native size, 2x
  // into a cell cut to it, through the same antialias pass
  PINE_KINDS.forEach((k, i) => draw(UV_PINES[i], antialiased(propCanvas(k))));
  DECOR_KINDS.forEach(([k], i) => draw(UV_DECOR[i], antialiased(propCanvas(k))));
  draw(UV_SPAWN, antialiased(img.spawnPad));

  // ---------- the units ----------
  // Every part is drawn at its native size into the cell declared for
  // it, facing +x; the silhouette cells get the same part through
  // silhouetted() instead of antialiased(). The leg sprite of a mech is
  // pre-offset to one side — the renderer mirrors it for the other leg.
  const parts = (pairs: readonly (readonly [UVRect, UVRect, HTMLImageElement])[]): void => {
    for (const [art, sil, src] of pairs) {
      draw(art, antialiased(src));
      draw(sil, silhouetted(src));
    }
  };

  // the ground line
  parts([
    [UV_DAGGER_LEG, UV_DAGGER_LEG_SIL, img.daggerLeg],
    [UV_DAGGER_BASE, UV_DAGGER_BASE_SIL, img.daggerBase],
    [UV_DAGGER_BODY, UV_DAGGER_BODY_SIL, img.dagger],
    [UV_LARGE_WEAPON, UV_LARGE_WEAPON_SIL, img.largeWeapon],
    [UV_MACE_LEG, UV_MACE_LEG_SIL, img.maceLeg],
    [UV_MACE_BASE, UV_MACE_BASE_SIL, img.maceBase],
    [UV_MACE_BODY, UV_MACE_BODY_SIL, img.mace],
    [UV_FLAMETHROWER, UV_FLAMETHROWER_SIL, img.flamethrower],
    [UV_FORTRESS_LEG, UV_FORTRESS_LEG_SIL, img.fortressLeg],
    [UV_FORTRESS_BASE, UV_FORTRESS_BASE_SIL, img.fortressBase],
    [UV_FORTRESS_BODY, UV_FORTRESS_BODY_SIL, img.fortress],
    [UV_ARTILLERY, UV_ARTILLERY_SIL, img.artillery],
    [UV_SCEPTER_BODY, UV_SCEPTER_BODY_SIL, img.scepter],
    [UV_SCEPTER_LEG, UV_SCEPTER_LEG_SIL, img.scepterLeg],
    [UV_SCEPTER_BASE, UV_SCEPTER_BASE_SIL, img.scepterBase],
    [UV_SCEPTER_WEAPON, UV_SCEPTER_WEAPON_SIL, img.scepterWeapon],
    [UV_SCEPTER_MOUNT, UV_SCEPTER_MOUNT_SIL, img.scepterMount],
    [UV_REIGN_BODY, UV_REIGN_BODY_SIL, img.reign],
    [UV_REIGN_BASE, UV_REIGN_BASE_SIL, img.reignBase],
    [UV_REIGN_LEG, UV_REIGN_LEG_SIL, img.reignLeg],
    [UV_REIGN_WEAPON, UV_REIGN_WEAPON_SIL, img.reignWeapon],
  ]);
  teamCell("dagger", img.dagger, img.powerCell, UV_DAGGER_BODY, 48);
  teamCell("mace", img.mace, img.maceCell, UV_MACE_BODY, 64);
  teamCell("fortress", img.fortress, img.fortressCell, UV_FORTRESS_BODY, 100, 80);
  teamCell("scepter", img.scepter, img.scepterCell, UV_SCEPTER_BODY, 170, 140);
  teamCell("reign", img.reign, img.reignCell, UV_REIGN_BODY, 214, 140);

  // the crawler line. The legged units' segments are drawn unrotated at
  // native size onto rects that ARE the art (see the UV note), and a
  // knee cap is packed upright because it is drawn unrotated
  parts([
    [UV_CRAWLER_LEG, UV_CRAWLER_LEG_SIL, img.crawlerLeg],
    [UV_CRAWLER_BASE, UV_CRAWLER_BASE_SIL, img.crawlerBase],
    [UV_CRAWLER_BODY, UV_CRAWLER_BODY_SIL, img.crawler],
    [UV_ATRAX_BODY, UV_ATRAX_BODY_SIL, img.atrax],
    [UV_ATRAX_BASE, UV_ATRAX_BASE_SIL, img.atraxBase],
    [UV_ATRAX_WEAPON, UV_ATRAX_WEAPON_SIL, img.atraxWeapon],
    [UV_ATRAX_JOINT, UV_ATRAX_JOINT_SIL, img.atraxJoint],
    [UV_ATRAX_FOOT, UV_ATRAX_FOOT_SIL, img.atraxFoot],
    [UV_SPIROCT_BODY, UV_SPIROCT_BODY_SIL, img.spiroct],
    [UV_SPIROCT_WEAPON, UV_SPIROCT_WEAPON_SIL, img.spiroctWeapon],
    [UV_SPIROCT_MOUNT, UV_SPIROCT_MOUNT_SIL, img.spiroctMount],
    [UV_SPIROCT_JOINT, UV_SPIROCT_JOINT_SIL, img.spiroctJoint],
    [UV_SPIROCT_FOOT, UV_SPIROCT_FOOT_SIL, img.spiroctFoot],
    [UV_ARKYID_BODY, UV_ARKYID_BODY_SIL, img.arkyid],
    [UV_ARKYID_WEAPON, UV_ARKYID_WEAPON_SIL, img.spiroctWeapon],
    [UV_ARKYID_MOUNT, UV_ARKYID_MOUNT_SIL, img.purpleMount],
    [UV_ARKYID_FOOT, UV_ARKYID_FOOT_SIL, img.arkyidFoot],
    [UV_ARKYID_JOINT_BASE, UV_ARKYID_JOINT_BASE_SIL, img.arkyidJointBase],
    [UV_TOXOPID_BODY, UV_TOXOPID_BODY_SIL, img.toxopid],
    [UV_TOXOPID_CANNON, UV_TOXOPID_CANNON_SIL, img.toxopidCannon],
    [UV_TOXOPID_JOINT_BASE, UV_TOXOPID_JOINT_BASE_SIL, img.toxopidJointBase],
    [UV_TOXOPID_FOOT, UV_TOXOPID_FOOT_SIL, img.toxopidFoot],
  ]);
  draw(UV_ATRAX_LEG, antialiased(img.atraxLeg));
  draw(UV_ATRAX_LEG_BASE, antialiased(img.atraxLegBase));
  draw(UV_SPIROCT_LEG, antialiased(img.spiroctLeg));
  draw(UV_SPIROCT_LEG_BASE, antialiased(img.spiroctLegBase));
  draw(UV_ARKYID_LEG, antialiased(img.arkyidLeg));
  draw(UV_ARKYID_LEG_BASE, antialiased(img.arkyidLegBase));
  draw(UV_TOXOPID_LEG, antialiased(img.toxopidLeg));
  draw(UV_TOXOPID_LEG_BASE, antialiased(img.toxopidLegBase));
  teamCell("crawler", img.crawler, img.crawlerCell, UV_CRAWLER_BODY, 48);
  teamCell("atrax", img.atrax, img.atraxCell, UV_ATRAX_BODY, 88, 64);
  teamCell("spiroct", img.spiroct, img.spiroctCell, UV_SPIROCT_BODY, 94, 75);
  teamCell("arkyid", img.arkyid, img.arkyidCell, UV_ARKYID_BODY, 128);
  teamCell("toxopid", img.toxopid, img.toxopidCell, UV_TOXOPID_BODY, 160, 190);

  // the support line
  parts([
    [UV_NOVA_LEG, UV_NOVA_LEG_SIL, img.novaLeg],
    [UV_NOVA_BASE, UV_NOVA_BASE_SIL, img.novaBase],
    [UV_NOVA_BODY, UV_NOVA_BODY_SIL, img.nova],
    [UV_HEAL_WEAPON, UV_HEAL_WEAPON_SIL, img.healWeapon],
    [UV_PULSAR_LEG, UV_PULSAR_LEG_SIL, img.pulsarLeg],
    [UV_PULSAR_BASE, UV_PULSAR_BASE_SIL, img.pulsarBase],
    [UV_PULSAR_BODY, UV_PULSAR_BODY_SIL, img.pulsar],
    [UV_HEAL_SHOTGUN, UV_HEAL_SHOTGUN_SIL, img.healShotgun],
    [UV_QUASAR_LEG, UV_QUASAR_LEG_SIL, img.quasarLeg],
    [UV_QUASAR_BASE, UV_QUASAR_BASE_SIL, img.quasarBase],
    [UV_QUASAR_BODY, UV_QUASAR_BODY_SIL, img.quasar],
    [UV_BEAM_WEAPON, UV_BEAM_WEAPON_SIL, img.beamWeapon],
    [UV_VELA_BODY, UV_VELA_BODY_SIL, img.vela],
    [UV_VELA_LEG, UV_VELA_LEG_SIL, img.velaLeg],
    [UV_VELA_BASE, UV_VELA_BASE_SIL, img.velaBase],
    [UV_REPAIR_BEAM, UV_REPAIR_BEAM_SIL, img.repairBeam],
    [UV_CORVUS_BODY, UV_CORVUS_BODY_SIL, img.corvus],
    [UV_CORVUS_BASE, UV_CORVUS_BASE_SIL, img.corvusBase],
    [UV_CORVUS_JOINT, UV_CORVUS_JOINT_SIL, img.corvusJoint],
    [UV_CORVUS_JOINT_BASE, UV_CORVUS_JOINT_BASE_SIL, img.corvusJointBase],
    [UV_CORVUS_FOOT, UV_CORVUS_FOOT_SIL, img.corvusFoot],
  ]);
  draw(UV_CORVUS_LEG, antialiased(img.corvusLeg));
  draw(UV_CORVUS_LEG_BASE, antialiased(img.corvusLegBase));
  teamCell("nova", img.nova, img.novaCell, UV_NOVA_BODY, 56);
  teamCell("pulsar", img.pulsar, img.pulsarCell, UV_PULSAR_BODY, 68, 58);
  teamCell("quasar", img.quasar, img.quasarCell, UV_QUASAR_BODY, 80);
  teamCell("vela", img.vela, img.velaCell, UV_VELA_BODY, 170, 140);
  teamCell("corvus", img.corvus, img.corvusCell, UV_CORVUS_BODY, 214, 140);

  // the flyers and the naval hulls: one outlined quad each. The flare
  // and the dagger have no cell art of their own and fall back to
  // power-cell, exactly as UnitType.load does
  const hull = (kind: UnitKind, src: HTMLImageElement, cell: HTMLImageElement, uv: UVRect): void => {
    draw(uv, outlinedUnit(src));
    teamCell(kind, src, cell, uv, srcW(src), srcH(src));
  };
  hull("flare", img.flare, img.powerCell, UV_FLARE);
  hull("horizon", img.horizon, img.horizonCell, UV_HORIZON);
  hull("zenith", img.zenith, img.zenithCell, UV_ZENITH);
  hull("antumbra", img.antumbra, img.antumbraCell, UV_ANTUMBRA);
  hull("disrupt", img.disrupt, img.disruptCell, UV_DISRUPT);
  hull("eclipse", img.eclipse, img.eclipseCell, UV_ECLIPSE);
  hull("risso", img.risso, img.rissoCell, UV_RISSO);
  hull("minke", img.minke, img.minkeCell, UV_MINKE);
  hull("retusa", img.retusa, img.retusaCell, UV_RETUSA);
  hull("oxynoe", img.oxynoe, img.oxynoeCell, UV_OXYNOE);
  hull("bryde", img.bryde, img.brydeCell, UV_BRYDE);
  hull("cyerce", img.cyerce, img.cyerceCell, UV_CYERCE);
  hull("sei", img.sei, img.seiCell, UV_SEI);
  hull("aegires", img.aegires, img.aegiresCell, UV_AEGIRES);
  hull("omura", img.omura, img.omuraCell, UV_OMURA);
  hull("navanax", img.navanax, img.navanaxCell, UV_NAVANAX);

  // ---------- the bullets ----------
  // white and at source size, facing +x. See the UV_BULLET note: the
  // renderer lays the -back region under the inner one on one rect and
  // tints each with the firing ammo's own colour, as BasicBulletType.draw
  // does
  draw(UV_BULLET, antialiased(img.bullet));
  draw(UV_BULLET_BACK, antialiased(img.bulletBack));
  draw(UV_SHELL, antialiased(img.shell));
  draw(UV_SHELL_BACK, antialiased(img.shellBack));
  draw(UV_MISSILE, antialiased(img.missile));
  draw(UV_MISSILE_BACK, antialiased(img.missileBack));
  draw(UV_CIRCLE_BULLET, antialiased(img.circleBullet));
  draw(UV_CIRCLE_BULLET_BACK, antialiased(img.circleBulletBack));
  draw(UV_MINE_BULLET, antialiased(img.mineBullet));
  draw(UV_MINE_BULLET_BACK, antialiased(img.mineBulletBack));
  draw(UV_MISSILE_LARGE, antialiased(img.missileLarge));
  draw(UV_MISSILE_LARGE_BACK, antialiased(img.missileLargeBack));
  // the disrupt missile is a unit: outlined like one
  draw(UV_DISRUPT_MISSILE, antialiased(outlined(img.disruptMissile, "#2d2f39", UNIT_OUTLINE_R)));
  // the sap beam's cap, unrotated — a disc — and its 4x48 cross-section
  // strip exactly on its rect
  draw(UV_LASER_END, antialiased(img.laserEnd));
  draw(UV_LASER, antialiased(img.laser));

  // ---------- the procedural shapes ----------
  paintCell(c, UV_RING, (cc, cell) => {
    cc.strokeStyle = "#ffffff";
    cc.lineWidth = 5;
    cc.beginPath();
    cc.arc(cell.w / 2, cell.h / 2, 22, 0, TAU);
    cc.stroke();
  });
  // the stroke source for procedural lines: pure white to the cell's edge
  paintCell(c, UV_SOLID, (cc, cell) => {
    cc.fillStyle = "#ffffff";
    cc.fillRect(0, 0, cell.w, cell.h);
  });
  // the flame particle disc, and the shield domes' disc at 256 — each
  // kept a few px inside its cell so the antialiased rim sits clear of
  // the edge (see UV_DISC_BIG)
  paintCell(c, UV_DISC, (cc, cell) => {
    cc.fillStyle = "#ffffff";
    cc.beginPath();
    cc.arc(cell.w / 2, cell.h / 2, 27, 0, TAU);
    cc.fill();
  });
  paintCell(c, UV_DISC_BIG, (cc, cell) => {
    cc.fillStyle = "#ffffff";
    cc.beginPath();
    cc.arc(cell.w / 2, cell.h / 2, 124, 0, TAU);
    cc.fill();
  });
  // the shrapnel triangle: white, base on the left edge, apex right; the
  // renderer stretches and tints it into Drawf.tri shapes. Drawn to the
  // cell's inset EXACTLY, corner to corner, rather than sitting a pixel
  // inside it: laying these edge to edge puts neighbouring triangles
  // slope against slope, and a slope even a texel short leaves a seam
  // down every one of those joins; a texel proud leaves a doubled-alpha
  // one instead
  paintCell(c, UV_TRI, (cc, cell) => {
    const i = cell.inset;
    cc.fillStyle = "#ffffff";
    cc.beginPath();
    cc.moveTo(i, i);
    cc.lineTo(i, cell.h - i);
    cc.lineTo(cell.w - i, cell.h / 2);
    cc.closePath();
    cc.fill();
  });

  // ---------- the structures ----------
  // turret tops: each preview or head outlined like every block, facing
  // +x, filling its cell (see the UV note on the tops); the bases at
  // their own size, as authored
  draw(UV_TOWER_BASE, antialiased(img.towerBase));
  draw(UV_TOWER_BASE1, antialiased(img.towerBase1));
  draw(UV_TOWER_BASE3, antialiased(img.towerBase3));
  draw(UV_TOWER_BASE4, antialiased(img.towerBase4));
  draw(UV_TURRET, outlinedBlock(img.salvoPreview));
  draw(UV_SCATTER, outlinedBlock(img.scatterPreview));
  draw(UV_HAIL, outlinedBlock(img.hail));
  draw(UV_FUSE, outlinedBlock(img.fuse));
  draw(UV_SCORCH, outlinedBlock(img.scorch));
  draw(UV_DUO, outlinedBlock(img.duoPreview));
  draw(UV_ARC, outlinedBlock(img.arc));
  draw(UV_LANCER, outlinedBlock(img.lancer));
  draw(UV_PARALLAX, outlinedBlock(img.parallax));
  draw(UV_RIPPLE, outlinedBlock(img.ripple));
  draw(UV_SWARMER, outlinedBlock(img.swarmer));
  // cyclone's own art is the bare head; its three barrels are separate
  // sprites the preview already has assembled underneath
  draw(UV_CYCLONE, outlinedBlock(img.cyclonePreview));
  draw(UV_SPECTRE, outlinedBlock(img.spectre));
  draw(UV_MELTDOWN, outlinedBlock(img.meltdown));
  draw(UV_FORESHADOW, outlinedBlock(img.foreshadow));
  // the liquid turrets, composited flat (see liquidTurret)
  draw(UV_WAVE, antialiased(liquidTurret(img.wave, img.waveLiquid, img.waveTop)));
  draw(UV_TSUNAMI, antialiased(liquidTurret(img.tsunami, img.tsunamiLiquid, img.tsunamiTop)));
  // parallax's beam: the end glow and the line, each the full source
  // centred on the cell that hugs its opaque part (see the UV note), the
  // line turned so its length runs along the +x axis pushSeg stretches
  draw(UV_PARALLAX_LASER_END, antialiased(img.parallaxLaserEnd), [72, 72]);
  draw(UV_PARALLAX_LASER, antialiased(img.parallaxLaser), [4, 48]);
  // the blocks that never turn, outlined and as authored
  draw(UV_SHIELD_TOWER, outlinedBlock(img.shieldTower));
  draw(UV_MEND_PROJECTOR, antialiased(mendBlock(img.mendProjector, img.mendProjectorTop)));
  draw(UV_MENDER, antialiased(mendBlock(img.mender, img.menderTop)));

  // the base building at native 160px: the block, then the team overlay
  // tinted sharded-yellow the way Mindustry composites team regions
  draw(UV_BASE, antialiased(img.base));
  const baseTeam = antialiased(img.baseTeam);
  const team = document.createElement("canvas");
  team.width = team.height = 160;
  const tc = team.getContext("2d");
  if (!tc) throw new Error("2d context unavailable");
  tc.drawImage(baseTeam, 0, 0, 160, 160);
  tc.globalCompositeOperation = "multiply";
  tc.fillStyle = TEAM_COLOR;
  tc.fillRect(0, 0, 160, 160);
  tc.globalCompositeOperation = "destination-in";
  tc.drawImage(baseTeam, 0, 0, 160, 160);
  draw(UV_BASE, team);

  // the animal trial goes over the stock cells it replaces, once they are
  // all drawn and before the team cells are packed, since it requeues its own
  if (ANIMAL_ART) {
    packAnimalArt(c, teamCell, (kind) => {
      const i = cellJobs.findIndex((j) => j.kind === kind);
      if (i >= 0) cellJobs.splice(i, 1);
    });
  }

  // last, because it is the only thing on the sheet whose cells are cut
  // to art that had to be drawn first: every body's team cell
  packTeamCells();
  sealed = true;

  return a;
}

/**
 * The packed sheet, built at most once per page.
 *
 * Packing is not cheap — it decodes every sprite, runs the EPX antialias
 * pass over each in JavaScript, outlines the units, and composites the lot
 * into a 2048x4096 canvas — and it depends on nothing but the sprite files,
 * so a second call can only produce a byte-identical sheet. It used to run
 * on every Game.create, which meant paying the whole cost again on every
 * level start. Now the first caller pays and everyone after shares.
 *
 * The promise is memoised, not the canvas, so overlapping callers await the
 * same build instead of racing two of them. A failure is not cached: the
 * memo is dropped so a retry can actually retry.
 */
let atlasBuild: Promise<HTMLCanvasElement> | null = null;
let atlasPacked = false;

export function buildAtlas(): Promise<HTMLCanvasElement> {
  atlasBuild ??= packAtlas().then(
    (sheet) => {
      atlasPacked = true;
      return sheet;
    },
    (err: unknown) => {
      atlasBuild = null;
      throw err;
    },
  );
  return atlasBuild;
}

/**
 * True once the sheet is FINISHED — deliberately not "once a build has
 * started". A level opened while an earlier build is still in flight still
 * has to wait for it, so it must still say "Packing sprites"; keying this
 * off the promise merely existing would label that wait as something else.
 */
export function atlasReady(): boolean {
  return atlasPacked;
}
