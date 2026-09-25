import { CELL, UNIT_SPRITE } from "./constants";
import { LINOCUT_TERRAIN } from "./terrainFlag";
import {
  floorCanvas,
  markPadCanvas,
  propCanvas,
  waterCanvas,
  type PropKind,
  wallCanvas,
  WALL_VARIANTS,
  type FloorKind,
  type WallKind,
} from "./tiles";
import { CONVOY_SIZE, FABRICATOR_KINDS, type UnitKind } from "./levels";
import { ANIMAL_ART } from "./animalFlag";
import { FOUNDRY_ART } from "./turretFlag";
import { FOUNDRY_BASE_URLS, FOUNDRY_CORE_URL, FOUNDRY_HEAD_URLS, foundryHeadUrl } from "./foundryArt";
import { TOWER_ICONS } from "./towerIcons";
import type { TowerKind } from "./types";
import {
  toCanvas,
  toCanvasRect,
  column as bodyColumn,
  type Art,
  type LegParts,
  type MechParts,
  type StoopArt,
  type StoopGeom,
} from "./animalArt";
import {
  HART_TIERS,
  MANTA_TIERS,
  NARWHAL_TIERS,
  FROG_TIERS,
  STOOP_TIERS,
  frogLegged,
  frogMech,
  hartLegged,
  hartMech,
  manta,
  mantaGeom,
  narwhal,
  narwhalGeom,
  stoop,
  stoopGeom,
  type FlyerTier,
} from "./familyArt";
import { IRON_TIERS, ironLegged, ironMech, type IronTier } from "./ironhideArt";
import { TUSK_TIERS, tuskLegged, tuskMech } from "./tuskerArt";
import { WORM_N, wormCar, wormHead, wormTail } from "./wormArt";
import { CONVOY_LEG_N, CONVOY_N, hauler, haulerLeg } from "./convoyArt";
import { RAIL_CELL, RAIL_INSET, RAIL_PIECES, RAIL_STYLES, railCanvas } from "./railArt";
import { GRAPNEL_TIERS, grapnelMech } from "./grapnelArt";
import {
  BULWARK_TIER, HALBERD_TIER, JUGGERNAUT_TIER, LANCE_TIER, RAZE_TIER,
  bulwarkMech, halberdMech, juggernautMech, lanceMech, razeMech,
  type WardenTier,
} from "./wardenArt";
import { KETTLE_TIERS, kettle, kettleGeom } from "./kettleArt";
import { WHALE_TIERS, whale, whaleEngines, whaleGeom } from "./whaleArt";
import { RATKING_TIERS, ratkingMech } from "./ratkingArt";
import { BASTION_TIER, BRANDER_TIER, GOAD_TIER, bastionMech, branderMech, goadMech } from "./pylonArt";
import { FABRICATOR_TIERS, fabricatorMech } from "./fabricatorArt";
import { EMBER, GILT, KING_TIER, PLUME, king, kingGeom } from "./kingArt";

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
 * The sheet is 4096x4096. A WebGL2 context only has to guarantee
 * MAX_TEXTURE_SIZE 2048 and every device that runs the game clears 4096,
 * so 4096 is the longest side allowed. If the roster outgrows it, the
 * packer throws with the name of the cell that did not fit and how full
 * the sheet was when it gave up, and the one thing to change is ATLAS_W:
 * every UV is a fraction of the sheet, so a wider sheet moves nothing
 * anyone can see. It went from 2048 to 2560 when each water kind grew
 * from one painted block to three (see FLOOR_CELLS) and the boxer's cell
 * no longer fit.
 *
 * IT WENT FROM 2560 TO 3584 WHEN THE KETTLES LANDED, and the jump is two
 * steps rather than one on purpose. The roster's cells are 9.2M px and a
 * 2560 sheet is 10.5M, so the packer was being asked for 88% PACKING
 * DENSITY — which MaxRects cannot reach on cells that run from 16px
 * bullets to a 512px eagle, whatever order they arrive in. It did not
 * fail because the sheet was full; it failed because what was left was
 * in the wrong shapes, which is why the last thing packed (a 69x78 team
 * cell) is the one that threw and why nothing before it noticed.
 *
 * 3072 fits today at 73% and leaves four hundred rows spare — one more
 * family and it is back here. 3584 sits at 63%, which is inside what this
 * packer actually achieves, and 4096 is still in hand after it. The cost
 * is VRAM and it is linear: 42MB of texture became 59, 78 with mipmaps.
 *
 * AND FROM 3584 TO 4096 WHEN THE WHALES AND THE RATKINGS LANDED: the
 * static pass alone was at 84% of 3584, past what the packer reaches with
 * the team cells still to come. 4096 is the ceiling; the next family has
 * to find its room by shrinking cells, not by widening the sheet.
 */
const ATLAS_W = 4096;
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
  if (best < 0) {
    // WHAT THE SHEET LOOKED LIKE WHEN IT GAVE UP, because "full" is
    // almost never the reason. This packer fails on SHAPE long before it
    // fails on area — see the note on ATLAS_W — and the two are fixed by
    // the same dial but tell you very different things about how much
    // room the next family has. An error that only names the cell sends
    // the reader to count sprites; one that says "63% used, biggest free
    // rect 40x2100" says it in a line.
    const big = FREE.reduce((a, f) => (f.w * f.h > a.w * a.h ? f : a), { x: 0, y: 0, w: 0, h: 0 });
    throw new Error(
      `atlas is full: no room for ${name} (${w}x${h} with its gutter) — ` +
        `${atlasFill().cells} cells fill ${atlasFill().pct}% of ${ATLAS_W}x${ATLAS_H}, ` +
        `biggest free rect ${big.w}x${big.h}. Raise ATLAS_W in game/atlas.ts (ceiling 4096).`,
    );
  }
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
 * HOW FULL THE SHEET IS RIGHT NOW — the cells handed out, the px they
 * cover and that as a percentage of the whole.
 *
 * It is exported because the ONE THING that can overflow this sheet is
 * invisible to `npm run check`: the team cells are cut to art that has to
 * be drawn first, so they are reserved inside the pack pass, and the pack
 * pass needs a canvas that Node does not have (see the `atlas` stage in
 * scripts/check.mjs). What Node CAN run is everything declared at module
 * scope, which is most of the sheet — so the check reads this after the
 * import and prints the trend. A gate cannot catch the last cell; a
 * number that says 85% on the run before is what would have.
 */
export function atlasFill(): { cells: number; px: number; pct: number } {
  let px = 0;
  for (const cell of CELLS.values()) px += cell.w * cell.h;
  return { cells: CELLS.size, px, pct: +((100 * px) / (ATLAS_W * ATLAS_H)).toFixed(1) };
}

/** the biggest rectangle the packer could still hand out — the number that
 *  actually predicts the next failure, since this one fails on shape */
export function atlasLargestFree(): { w: number; h: number } {
  const big = FREE.reduce((a, f) => (f.w * f.h > a.w * a.h ? f : a), { x: 0, y: 0, w: 0, h: 0 });
  return { w: big.w, h: big.h };
}

/** the sheet, for anything that has to print it */
export const ATLAS_SIZE: readonly [number, number] = [ATLAS_W, ATLAS_H];

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
/** a body much longer than it is wide, drawn facing up `wide` x `long`
 *  and turned to lie along +x like every sprite: a `long` x `wide` cell,
 *  so a manta's or a narwhal's column of a body does not pay for a square */
const column = (name: string, long: number, wide: number): UVRect =>
  reserve(name, long, wide, { art: [long - 1, wide - 1] });
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
  // the third batch: the game's own families (tiles.ts)
  { kind: "loam", slots: 3 },
  { kind: "dust", slots: 3 },
  { kind: "flint", slots: 3 },
  { kind: "clay", slots: 3 },
  { kind: "peat", slots: 3 },
  { kind: "bog", slots: 3 },
  { kind: "cinder", slots: 3 },
  { kind: "chalk", slots: 3 },
];
/** each group's painted cells: one per variant, or the one water block */
const FLOOR_CELLS: readonly (readonly UVRect[])[] = FLOOR_GROUPS.map((g) =>
  "water" in g
    ? // THREE WATER CELLS, not one. A water kind is one 32px tile repeated
      // over every water cell on the board, so a wave painted into it is a
      // wave on EVERY tile — a grid of them, which is what a sea does not
      // look like. The three cells are the same water with the wave on one
      // of them, and the renderer picks a cell per map cell (pushTerrain),
      // so the waves land a third of the time and scattered
      [0, 1, 2].map((v) => reserve(`floor-${g.water}-${v}`, WATER_TILE, WATER_TILE, { inset: 64, upright: true }))
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
// the third batch
export const FLOOR_LOAM = 51;
export const FLOOR_DUST = 54;
export const FLOOR_FLINT = 57;
export const FLOOR_CLAY = 60;
export const FLOOR_PEAT = 63;
export const FLOOR_BOG = 66;
export const FLOOR_CINDER = 69;
export const FLOOR_CHALK = 72;

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
  "loam", "dust", "flint", "clay", "peat", "bog", "cinder", "chalk",
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
  "flint", "clay", "peat", "cinder", "chalk", "loam",
];
const WALL_CELLS: readonly (readonly UVRect[] | null)[] = WALL_KINDS_IN_ORDER.map((k) =>
  k ? Array.from({ length: WALL_VARIANTS }, (_, v) => tile(`wall-${k}-${v}`, 64, WALL_INSET)) : null,
);
export const UV_WALLS: readonly UVRect[] = WALL_CELLS.flatMap((cells) => cells ?? [WALL_CELLS[0]![0]]);
/** the wall family behind each WALL_GROUP index, for whoever needs the
 *  family's own colours (the renderer's carved bands under the ink) */
export const WALL_GROUP_KINDS: readonly WallKind[] = WALL_KINDS_IN_ORDER.filter((k): k is WallKind => k !== null);
// which wall family each UV_WALLS index belongs to (0 stone, 1 dirt,
// 2 dark rock, then the second band's eight; -1 the pine and deep-water
// sentinels) — StaticWall's large-draw rule works per block type, so 2x2
// detection must ignore the variant within a family
export const WALL_GROUP: readonly number[] = [
  0, 0, 1, 1, -1, 2, 2, -1,
  3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10,
  11, 11, 12, 12, 13, 13, 14, 14, 15, 15, 16, 16,
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
// the third band
export const WALL_FLINT = 24;
export const WALL_CLAY = 26;
export const WALL_PEAT = 28;
export const WALL_CINDER = 30;
export const WALL_CHALK = 32;
export const WALL_LOAM = 34;
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
  "flint", "clay", "peat", "cinder", "chalk", "loam",
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
/**
 * WHICH GROUND CLUTTER IS STILL DRAWN. The boulders of every family and
 * the spore clusters are OFF: a board strewn with stones and crystals was
 * reading as scatter over the ground rather than as ground, and what is
 * wanted on it is the growing things — the shrubs and the purple bush.
 *
 * It is a mask over DECOR_KINDS rather than a deletion, because a decor
 * kind is an INDEX baked into every saved map document: dropping the
 * boulders out of the table would renumber the shrubs and turn every
 * shrub on disk into something else. The maps keep their stones, the
 * renderer skips them (pushTerrain), the generator stops sowing them
 * (terrain.ts) and the editor stops offering them (maps.ts PALETTE), and
 * turning one back on is one `true` here.
 */
export const DECOR_DRAWN: readonly boolean[] = DECOR_KINDS.map(
  ([k]) => !/^(?:.*[Bb]oulder\d|sporeCluster\d)$/.test(k),
);

// ---------------------------------------------------------------------
// STRUCTURES, EFFECTS AND THE ODD SHAPES
// ---------------------------------------------------------------------

// mechanical spawn-pad tile: one of these is drawn on every painted spawn
// cell, tinted by SPAWN_STYLE (Renderer.rebuildTerrain)
export const UV_SPAWN = tile("spawn-pad", 64, 2);
/** the decking a mission mark lays round itself (missionMarks.ts
 *  MarkKind.pad, Renderer.rebuildTerrain): plated ground, so the three
 *  places the swarm keeps re-taking read as PREPARED rather than as open
 *  snow a tower happens to be standing on */
export const UV_MARK_PAD = tile("mark-pad", 64, 2);
/**
 * THE RAIL BED, one cell a piece per railway (game/railArt.ts, missions.ts
 * railsFor), indexed [style][piece].
 *
 * Each is painted three cells square with a four-px margin and sampled
 * back in to exactly the three: the margin is what the antialias pass
 * averages against, and without it every cut between two pieces would
 * come out as a hairline down the line. Six shapes carry the whole
 * lattice — two straights, two hands of bend and two buffers — because a
 * quarter turn maps everything else onto one of them; the two STYLES are
 * the two road missions' own railways, which look nothing like each other
 * on purpose.
 */
export const UV_RAILS: readonly (readonly UVRect[])[] = RAIL_STYLES.map((st) =>
  RAIL_PIECES.map((p) => tile(`rail-${st.name}-${p.name}`, RAIL_CELL, RAIL_INSET)),
);
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
export const UV_TURRET = top("autocannon", 128);
export const UV_AIRBURST = top("airburst", 128);
export const UV_CLEAVER = top("cleaver", 96);
export const UV_TOWER_BASE3 = flat("tower-base-3", 96);
export const UV_TACKER = top("tacker", 64);
export const UV_TOWER_BASE1 = flat("tower-base-1", 64);
export const UV_LOBBER = top("lobber", 64);
export const UV_TORCH = top("torch", 64);
export const UV_COIL = top("coil", 64);
export const UV_PIERCER = top("piercer", 128);
export const UV_TETHER = top("tether", 128);
export const UV_BARRAGE = top("barrage", 96);
export const UV_DOUSER = top("douser", 128);
export const UV_DELUGE = top("deluge", 96);
export const UV_HIVE = top("hive", 128);
export const UV_WHIRL = top("whirl", 96);
export const UV_REPEATER = top("repeater", 128);
export const UV_FURNACE = top("furnace", 128);
export const UV_RAILHEAD = top("railhead", 128);
export const UV_DUSTER = top("duster", 64);
export const UV_BLIGHTER = top("blighter", 128);
export const UV_DRIFTER = top("drifter", 96);
export const UV_STINGER = top("stinger", 128);
export const UV_TOWER_BASE4 = flat("tower-base-4", 128);
/**
 * The blocks that never turn keep the heading they were drawn at: the
 * shield tower (the Shield Towers mutator, Mindustry's force projector,
 * 96px of 3x3 block art) and the support pair, the fixer a 32px source
 * at 2x, the projector a 64px one at 2x.
 */
export const UV_SHIELD_TOWER = flat("shield-tower", 96);
export const UV_RESTORER = flat("restorer", 128);
export const UV_FIXER = flat("fixer", 64);
/**
 * Tether's beam, the two regions Drawf.laser stretches between the
 * turret and its target. The line is packed ROTATED — its 4x48 source runs
 * along the beam, and pushSeg maps a region's WIDTH along the line it is
 * stretched down.
 *
 * Both cells hug the OPAQUE art, not the source rect, and that is not
 * tidiness: Arc's packer trims a sprite's transparent border and Mindustry
 * then draws the trimmed region, so `tether-laser` is really 4x24 and
 * `tether-laser-end` really 32x32. Taking the source rects instead put a
 * quarter of transparent film on each end of a STRETCHED beam — the line
 * drew at half length, floating between the turret and its target — and
 * made the end glow, whose size Drawf.laser reads off the region itself,
 * less than half of what it should be. The pack pass draws the full
 * source centred on the cell and the clip takes the film off.
 */
export const UV_TETHER_LASER = reserve("tether-laser", 24, 4, { art: [24, 4] });
export const UV_TETHER_LASER_END = sprite("tether-laser-end", 32, 32);
// the player's base, the core nucleus at native 160px
export const UV_BASE = flat("base", 160);

/**
 * The bullet regions and the shell regions. Every one is packed WHITE and
 * at its exact source size, which is the only way BasicBulletType.draw
 * comes out right.
 *
 * White, because an ammo type is a pair of colours over one pair of shapes:
 * tacker's copper pellet, autocannon's thorium round and airburst's flak shell are
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
 * The `-back` sprite is the larger of each pair, so drawn into the same
 * box it sticks out as a rim. All three pairs are drawn here (boltBullet):
 * one capsule with a nose, at 52 and at 36, the missile with fins on its
 * back. All face +x, like the other rotated art.
 */
export const UV_BULLET = sprite("bullet", 52, 52);
export const UV_BULLET_BACK = sprite("bullet-back", 52, 52);
export const UV_SHELL = sprite("shell", 36, 36);
export const UV_SHELL_BACK = sprite("shell-back", 36, 36);
// the third pair: hive's warhead. 36x36 like the shell, and the same rule
export const UV_MISSILE = sprite("missile", 36, 36);
export const UV_MISSILE_BACK = sprite("missile-back", 36, 36);
/**
 * THE FOURTH PAIR, AND THE ONE WITH NO MINDUSTRY FILE BEHIND IT: the
 * toxin line's canister (canisterBullet), drawn here at pack time the way
 * every drawn head is. One pair, three guns — duster's dart, blighter's
 * lobbed drum and the cylinder tumbling in the middle of drifter's field
 * are this shape at three sizes in one colour, exactly as tacker's pellet
 * and repeater's slug are both `bullet`. Same rule as the three above:
 * white, source size, facing +x.
 */
export const UV_CANISTER = sprite("canister", 36, 36);
export const UV_CANISTER_BACK = sprite("canister-back", 36, 36);
/**
 * THE SWARM'S OWN BULLET SPRITES, on the same rule — white, source size,
 * facing +x, the `-back` beside its front:
 *
 *   - circle-bullet (48): livewire5's emp round, a disc (discRound);
 *   - boss-missile (39x60): the boss's missile UNIT, drawn as itself in
 *     the Sovereign's materials (bossMissileArt), so it takes the outline
 *     pass a unit sprite does and is pushed untinted;
 *   - laser (4x48) and laser-end (72): what Drawf.laser draws a sap beam
 *     with — the strip is the beam's cross-section (4 along, 48 across,
 *     so it is packed unrotated and stretched along the line), the cap a
 *     soft disc laid on each end.
 */
export const UV_CIRCLE_BULLET = sprite("circle-bullet", 48, 48);
export const UV_CIRCLE_BULLET_BACK = sprite("circle-bullet-back", 48, 48);
export const UV_BOSS_MISSILE = sprite("boss-missile", 64, [39, 60]);
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
export const UV_IRONHIDE1_LEG = sprite("ironhide1-leg", 64, 48);
export const UV_IRONHIDE1_BASE = sprite("ironhide1-base", 64, 48);
export const UV_IRONHIDE1_BODY = sprite("ironhide1", 64, 48);
export const UV_LARGE_WEAPON = sprite("large-weapon", 64, 48);
export const UV_IRONHIDE2_LEG = sprite("ironhide2-leg", 64, 64);
export const UV_IRONHIDE2_BASE = sprite("ironhide2-base", 64, 64);
export const UV_IRONHIDE2_BODY = sprite("ironhide2", 64, 64);
export const UV_FLAMETHROWER = sprite("flamethrower", 64, [48, 56]);
export const UV_IRONHIDE1_LEG_SIL = sprite("ironhide1-leg-sil", 64, 48);
export const UV_IRONHIDE1_BASE_SIL = sprite("ironhide1-base-sil", 64, 48);
export const UV_IRONHIDE1_BODY_SIL = sprite("ironhide1-sil", 64, 48);
export const UV_LARGE_WEAPON_SIL = sprite("large-weapon-sil", 64, 48);
export const UV_IRONHIDE2_LEG_SIL = sprite("ironhide2-leg-sil", 64, 64);
export const UV_IRONHIDE2_BASE_SIL = sprite("ironhide2-base-sil", 64, 64);
export const UV_IRONHIDE2_BODY_SIL = sprite("ironhide2-sil", 64, 64);
export const UV_FLAMETHROWER_SIL = sprite("flamethrower-sil", 64, [48, 56]);
// the T3 outgrows 64px cells (body 100x80, leg 80x60 at native scale)
export const UV_IRONHIDE3_LEG = sprite("ironhide3-leg", 128, [80, 60]);
export const UV_IRONHIDE3_BASE = sprite("ironhide3-base", 128, 64);
export const UV_IRONHIDE3_BODY = sprite("ironhide3", 128, [100, 80]);
export const UV_ARTILLERY = sprite("artillery", 128, [48, 56]);
export const UV_IRONHIDE3_LEG_SIL = sprite("ironhide3-leg-sil", 128, [80, 60]);
export const UV_IRONHIDE3_BASE_SIL = sprite("ironhide3-base-sil", 128, 64);
export const UV_IRONHIDE3_BODY_SIL = sprite("ironhide3-sil", 128, [100, 80]);
export const UV_ARTILLERY_SIL = sprite("artillery-sil", 128, [48, 56]);
/**
 * The T4: ironhide4's hull alone is a 170x140 source, half again as wide as
 * the 128px cells the T3s sit in, so the whole line rides 256px cells.
 */
export const UV_IRONHIDE4_BODY = sprite("ironhide4", 256, [170, 140]);
export const UV_IRONHIDE4_BODY_SIL = sprite("ironhide4-sil", 256, [170, 140]);
export const UV_IRONHIDE4_LEG = sprite("ironhide4-leg", 256, 128);
export const UV_IRONHIDE4_LEG_SIL = sprite("ironhide4-leg-sil", 256, 128);
export const UV_IRONHIDE4_BASE = sprite("ironhide4-base", 256, 128);
export const UV_IRONHIDE4_BASE_SIL = sprite("ironhide4-base-sil", 256, 128);
export const UV_IRONHIDE4_WEAPON = sprite("ironhide4-weapon", 256, [56, 102]);
export const UV_IRONHIDE4_WEAPON_SIL = sprite("ironhide4-weapon-sil", 256, [56, 102]);
export const UV_IRONHIDE4_MOUNT = sprite("ironhide4-mount", 256, 48);
export const UV_IRONHIDE4_MOUNT_SIL = sprite("ironhide4-mount-sil", 256, 48);
// the T5: the same four-part mech, one tier heavier
export const UV_IRONHIDE5_BODY = sprite("ironhide5", 256, [214, 140]);
export const UV_IRONHIDE5_BODY_SIL = sprite("ironhide5-sil", 256, [214, 140]);
export const UV_IRONHIDE5_BASE = sprite("ironhide5-base", 256, [152, 124]);
export const UV_IRONHIDE5_BASE_SIL = sprite("ironhide5-base-sil", 256, [152, 124]);
export const UV_IRONHIDE5_LEG = sprite("ironhide5-leg", 256, [152, 124]);
export const UV_IRONHIDE5_LEG_SIL = sprite("ironhide5-leg-sil", 256, [152, 124]);
export const UV_IRONHIDE5_WEAPON = sprite("ironhide5-weapon", 256, [83, 138]);
export const UV_IRONHIDE5_WEAPON_SIL = sprite("ironhide5-weapon-sil", 256, [83, 138]);

// the dartback1 line: the T1 a mech, the rest legged
export const UV_DARTBACK1_LEG = sprite("dartback1-leg", 64, 48);
export const UV_DARTBACK1_BASE = sprite("dartback1-base", 64, 48);
export const UV_DARTBACK1_BODY = sprite("dartback1", 64, 48);
export const UV_DARTBACK1_LEG_SIL = sprite("dartback1-leg-sil", 64, 48);
export const UV_DARTBACK1_BASE_SIL = sprite("dartback1-base-sil", 64, 48);
export const UV_DARTBACK1_BODY_SIL = sprite("dartback1-sil", 64, 48);
/**
 * The legged T2 and T3: body, mount plate and guns face +x on 128px
 * cells, feet the same on 64px ones. A JOINT is drawn with no rotation at
 * all in Mindustry, so its cell is packed upright. The segment sprites
 * fill their source rect edge to edge, so they get no silhouette: the
 * dilation an outline pass would add is clipped away at the rect, exactly
 * as in Mindustry's own packer, and the leg art carries its dark edging
 * hand-drawn anyway.
 */
export const UV_DARTBACK2_BODY = sprite("dartback2", 128, [88, 64]);
export const UV_DARTBACK2_BASE = sprite("dartback2-base", 128, 64);
export const UV_DARTBACK2_WEAPON = sprite("dartback2-weapon", 128, [48, 56]);
export const UV_DARTBACK2_BODY_SIL = sprite("dartback2-sil", 128, [88, 64]);
export const UV_DARTBACK2_BASE_SIL = sprite("dartback2-base-sil", 128, 64);
export const UV_DARTBACK2_WEAPON_SIL = sprite("dartback2-weapon-sil", 128, [48, 56]);
export const UV_DARTBACK2_JOINT = upright("dartback2-joint", 64, 26);
export const UV_DARTBACK2_FOOT = sprite("dartback2-foot", 64, 40);
export const UV_DARTBACK2_JOINT_SIL = upright("dartback2-joint-sil", 64, 26);
export const UV_DARTBACK2_FOOT_SIL = sprite("dartback2-foot-sil", 64, 40);
export const UV_DARTBACK2_LEG = flat("dartback2-leg", 36, 26);
export const UV_DARTBACK2_LEG_BASE = flat("dartback2-leg-base", 36, 26);
export const UV_DARTBACK3_BODY = sprite("dartback3", 128, [94, 75]);
export const UV_DARTBACK3_WEAPON = sprite("dartback3-weapon", 128, [48, 56]);
export const UV_DARTBACK3_MOUNT = sprite("dartback3-mount", 128, 48);
export const UV_DARTBACK3_BODY_SIL = sprite("dartback3-sil", 128, [94, 75]);
export const UV_DARTBACK3_WEAPON_SIL = sprite("dartback3-weapon-sil", 128, [48, 56]);
export const UV_DARTBACK3_MOUNT_SIL = sprite("dartback3-mount-sil", 128, 48);
export const UV_DARTBACK3_JOINT = upright("dartback3-joint", 64, 32);
export const UV_DARTBACK3_FOOT = sprite("dartback3-foot", 64, 46);
export const UV_DARTBACK3_JOINT_SIL = upright("dartback3-joint-sil", 64, 32);
export const UV_DARTBACK3_FOOT_SIL = sprite("dartback3-foot-sil", 64, 46);
export const UV_DARTBACK3_LEG = flat("dartback3-leg", 48, 34);
export const UV_DARTBACK3_LEG_BASE = flat("dartback3-leg-base", 48, 34);
/**
 * The T4: hull and guns on 256px cells — the sap gun is the dartback3's own
 * weapon sprite packed a second time, because a legged unit draws every
 * gun at its own LegArt.sprite and dartback4's is 256. Its feet and shoulder
 * plates ride 128px cells (their 70px sources keep a wide margin there),
 * and its two leg segments the exact rects their art occupies.
 */
export const UV_DARTBACK4_BODY = sprite("dartback4", 256, 128);
export const UV_DARTBACK4_BODY_SIL = sprite("dartback4-sil", 256, 128);
export const UV_DARTBACK4_WEAPON = sprite("dartback4-weapon", 256, [48, 56]);
export const UV_DARTBACK4_WEAPON_SIL = sprite("dartback4-weapon-sil", 256, [48, 56]);
export const UV_DARTBACK4_MOUNT = sprite("dartback4-mount", 256, [70, 97]);
export const UV_DARTBACK4_MOUNT_SIL = sprite("dartback4-mount-sil", 256, [70, 97]);
export const UV_DARTBACK4_FOOT = sprite("dartback4-foot", 128, 70);
export const UV_DARTBACK4_FOOT_SIL = sprite("dartback4-foot-sil", 128, 70);
export const UV_DARTBACK4_JOINT_BASE = sprite("dartback4-joint-base", 128, 70);
export const UV_DARTBACK4_JOINT_BASE_SIL = sprite("dartback4-joint-base-sil", 128, 70);
export const UV_DARTBACK4_LEG = flat("dartback4-leg", 56, 56);
export const UV_DARTBACK4_LEG_BASE = flat("dartback4-leg-base", 104, 64);
// the T5: the dartback4's frame with two more legs, and the one centred
// cannon. dartback5's lower segment is 270px of art for a 150px upper one:
// legExtension 20 runs it back over its own knee
export const UV_DARTBACK5_BODY = sprite("dartback5", 256, [160, 190]);
export const UV_DARTBACK5_BODY_SIL = sprite("dartback5-sil", 256, [160, 190]);
export const UV_DARTBACK5_CANNON = sprite("dartback5-cannon", 256, [206, 220]);
export const UV_DARTBACK5_CANNON_SIL = sprite("dartback5-cannon-sil", 256, [206, 220]);
export const UV_DARTBACK5_JOINT_BASE = sprite("dartback5-joint-base", 128, 70);
export const UV_DARTBACK5_JOINT_BASE_SIL = sprite("dartback5-joint-base-sil", 128, 70);
export const UV_DARTBACK5_FOOT = sprite("dartback5-foot", 128, 90);
export const UV_DARTBACK5_FOOT_SIL = sprite("dartback5-foot-sil", 128, 90);
export const UV_DARTBACK5_LEG = flat("dartback5-leg", 150, 72);
export const UV_DARTBACK5_LEG_BASE = flat("dartback5-leg-base", 270, 64);

// the support line: T1 and T2 on 64px cells. starhart2's 68x58 body and
// 64px leg overhang their cells with transparent padding only, which the
// clip takes off
export const UV_STARHART1_LEG = sprite("starhart1-leg", 64, 48);
export const UV_STARHART1_BASE = sprite("starhart1-base", 64, 48);
export const UV_STARHART1_BODY = sprite("starhart1", 64, 56);
export const UV_HEAL_WEAPON = sprite("heal-weapon", 64, 48);
export const UV_STARHART1_LEG_SIL = sprite("starhart1-leg-sil", 64, 48);
export const UV_STARHART1_BASE_SIL = sprite("starhart1-base-sil", 64, 48);
export const UV_STARHART1_BODY_SIL = sprite("starhart1-sil", 64, 56);
export const UV_HEAL_WEAPON_SIL = sprite("heal-weapon-sil", 64, 48);
export const UV_STARHART2_LEG = sprite("starhart2-leg", 64, 64);
export const UV_STARHART2_BASE = sprite("starhart2-base", 64, 48);
export const UV_STARHART2_BODY = sprite("starhart2", 64, [68, 58]);
export const UV_HEAL_SHOTGUN = sprite("heal-shotgun", 64, 50);
export const UV_STARHART2_LEG_SIL = sprite("starhart2-leg-sil", 64, 64);
export const UV_STARHART2_BASE_SIL = sprite("starhart2-base-sil", 64, 48);
export const UV_STARHART2_BODY_SIL = sprite("starhart2-sil", 64, [68, 58]);
export const UV_HEAL_SHOTGUN_SIL = sprite("heal-shotgun-sil", 64, 50);
// the T3 outgrows those: every starhart3 part ships on an 80x80 source (its
// leg alone reaches 35px off centre, past the 32px a 64 cell can hold)
export const UV_STARHART3_LEG = sprite("starhart3-leg", 128, 80);
export const UV_STARHART3_BASE = sprite("starhart3-base", 128, 80);
export const UV_STARHART3_BODY = sprite("starhart3", 128, 80);
export const UV_BEAM_WEAPON = sprite("beam-weapon", 128, 80);
export const UV_STARHART3_LEG_SIL = sprite("starhart3-leg-sil", 128, 80);
export const UV_STARHART3_BASE_SIL = sprite("starhart3-base-sil", 128, 80);
export const UV_STARHART3_BODY_SIL = sprite("starhart3-sil", 128, 80);
export const UV_BEAM_WEAPON_SIL = sprite("beam-weapon-sil", 128, 80);
// the T4. Its main gun has NO sprite (see the MECH_ART note) — the pair
// of repair-beam pods is all there is to bolt on
export const UV_STARHART4_BODY = sprite("starhart4", 256, [170, 140]);
export const UV_STARHART4_BODY_SIL = sprite("starhart4-sil", 256, [170, 140]);
export const UV_STARHART4_LEG = sprite("starhart4-leg", 256, 128);
export const UV_STARHART4_LEG_SIL = sprite("starhart4-leg-sil", 256, 128);
export const UV_STARHART4_BASE = sprite("starhart4-base", 256, 128);
export const UV_STARHART4_BASE_SIL = sprite("starhart4-base-sil", 256, 128);
export const UV_REPAIR_BEAM = sprite("repair-beam", 256, 48);
export const UV_REPAIR_BEAM_SIL = sprite("repair-beam-sil", 256, 48);
/**
 * The T5, the only legged unit wearing the full set of leg parts: a mount
 * plate like the dartback2, a knee cap like the dartback2 and dartback3, AND a
 * shoulder plate like the dartback4 and dartback5. Four legs of 14 world units
 * on mounts 11 out: almost the whole span is the mount offset, so the
 * segments are stubby and very broad — a 68px stroke on a 30px segment.
 */
export const UV_STARHART5_BODY = sprite("starhart5", 256, [214, 140]);
export const UV_STARHART5_BODY_SIL = sprite("starhart5-sil", 256, [214, 140]);
export const UV_STARHART5_BASE = sprite("starhart5-base", 256, [152, 124]);
export const UV_STARHART5_BASE_SIL = sprite("starhart5-base-sil", 256, [152, 124]);
export const UV_STARHART5_JOINT = upright("starhart5-joint", 128, 60);
export const UV_STARHART5_JOINT_SIL = upright("starhart5-joint-sil", 128, 60);
export const UV_STARHART5_JOINT_BASE = sprite("starhart5-joint-base", 128, 70);
export const UV_STARHART5_JOINT_BASE_SIL = sprite("starhart5-joint-base-sil", 128, 70);
export const UV_STARHART5_FOOT = sprite("starhart5-foot", 128, 90);
export const UV_STARHART5_FOOT_SIL = sprite("starhart5-foot-sil", 128, 90);
export const UV_STARHART5_LEG = flat("starhart5-leg", 30, 68);
export const UV_STARHART5_LEG_BASE = flat("starhart5-leg-base", 30, 64);

/**
 * THE FLYERS: a flying unit is one sprite — no legs, no chassis, no
 * silhouette under-layer — outlined at pack time and turned to the
 * heading the sim gave it. stoop1's 48px art rides a 64 cell at ironhide1
 * scale; stoop2 (72) and stoop3 (112) take 128s; stoop4 at 216x240 and
 * the boss boss at 243x243 take 256s; stoop5, 320x321, the largest
 * single piece of art on the sheet, the only 384.
 */
export const UV_STOOP1 = sprite("stoop1", 64, 48);
export const UV_STOOP2 = sprite("stoop2", 128, 72);
export const UV_STOOP3 = sprite("stoop3", 128, 112);
export const UV_STOOP4 = sprite("stoop4", 256, [216, 240]);
export const UV_BOSS = sprite("boss", 256, 243);
export const UV_STOOP5 = sprite("stoop5", 384, [320, 321]);

/**
 * THE NAVAL HULLS — the ten of the two water trees. A naval tank is drawn
 * exactly like a flyer: ONE quad, outlined at pack time, turned to the
 * heading the sim gave it. What a hull has instead of parts is its wake,
 * and that is geometry the renderer strokes from the solid texel (see
 * WakeSpec) rather than art on this sheet. Three cell sizes, chosen the
 * usual way: the two T5 hulls are 264x351 and 258x366 of art, and a 256
 * cell would have had to scale them down.
 */
export const UV_SKATE1 = sprite("skate1", 128, [70, 78]);
export const UV_SKATE2 = sprite("skate2", 128, [88, 101]);
export const UV_LIVEWIRE1 = sprite("livewire1", 128, [70, 78]);
export const UV_LIVEWIRE2 = sprite("livewire2", 128, [88, 101]);
export const UV_SKATE3 = sprite("skate3", 256, 140);
export const UV_LIVEWIRE3 = sprite("livewire3", 256, 140);
export const UV_SKATE4 = sprite("skate4", 256, [198, 228]);
export const UV_LIVEWIRE4 = sprite("livewire4", 256, [218, 241]);
export const UV_SKATE5 = sprite("skate5", 384, [264, 351]);
export const UV_LIVEWIRE5 = sprite("livewire5", 384, [258, 366]);

/**
 * THE TUSKERS' CELLS, and they are the first family on the sheet that is
 * not packed OVER anything. Every other animal draws into a cell the stock
 * art already owned — a rhino goes over Mindustry's dagger, a manta over
 * its risso — because every other family is one of Mindustry's trees
 * wearing a new coat. The elephants are not a tree; there is no upstream
 * hull called `tusker3` and no sprite file anywhere under public/ for one,
 * so the whole line asks the packer for room of its own. Nothing is
 * cleared and nothing is replaced: with ANIMAL_ART off these cells are
 * simply never painted, which is why the family sits on the shelf there
 * (levels.ts SHELVED_FAMILIES).
 *
 * The cell sizes are the usual arithmetic and nothing more: a body is
 * drawn at its hitbox in native px (56, 72, 96, 136, 176 — tuskerArt.ts)
 * and rides the smallest 64-multiple cell that holds it, so the world px
 * per native px is the same 0.625 every other body on the sheet has.
 */
const TUSK1 = TUSK_TIERS[0], TUSK2 = TUSK_TIERS[1], TUSK3 = TUSK_TIERS[2];
const TUSK4 = TUSK_TIERS[3], TUSK5 = TUSK_TIERS[4];
/** one mech tier's three parts and their silhouettes, on one cell size */
const tuskMechCells = (t: number, n: number, cell: number) => ({
  body: sprite(`tusker${t}`, cell, n),
  base: sprite(`tusker${t}-base`, cell, n),
  leg: sprite(`tusker${t}-leg`, cell, n),
  bodySil: sprite(`tusker${t}-sil`, cell, n),
  baseSil: sprite(`tusker${t}-base-sil`, cell, n),
  legSil: sprite(`tusker${t}-leg-sil`, cell, n),
});
export const TUSK1_CELLS = tuskMechCells(1, TUSK1.n, 64);
export const TUSK2_CELLS = tuskMechCells(2, TUSK2.n, 128);
export const TUSK3_CELLS = tuskMechCells(3, TUSK3.n, 128);
/** one legged tier: body and base on the body's cell, the caps and the pad
 *  on the small one, the two pillar segments on their exact rects */
const tuskLegCells = (t: number, T: (typeof TUSK_TIERS)[number], cell: number, small: number) => ({
  body: sprite(`tusker${t}`, cell, T.n),
  base: sprite(`tusker${t}-base`, cell, T.n),
  bodySil: sprite(`tusker${t}-sil`, cell, T.n),
  baseSil: sprite(`tusker${t}-base-sil`, cell, T.n),
  foot: sprite(`tusker${t}-foot`, small, T.small),
  footSil: sprite(`tusker${t}-foot-sil`, small, T.small),
  joint: upright(`tusker${t}-joint`, small, T.small),
  jointSil: upright(`tusker${t}-joint-sil`, small, T.small),
  baseJoint: sprite(`tusker${t}-joint-base`, small, T.small),
  baseJointSil: sprite(`tusker${t}-joint-base-sil`, small, T.small),
  leg: flat(`tusker${t}-leg-seg`, 64, T.th),
  legBase: flat(`tusker${t}-leg-base-seg`, 64, T.sh),
});
export const TUSK4_CELLS = tuskLegCells(4, TUSK4, 256, 64);
export const TUSK5_CELLS = tuskLegCells(5, TUSK5, 256, 128);

/**
 * THE GRAPNELS' CELLS, and the second family to ask the packer for room of
 * its own rather than draw over a Mindustry tree (the Tuskers were the
 * first, above). There is no upstream `grapnel3` and no sprite file for
 * one, so with ANIMAL_ART off these cells are never painted and the family
 * sits on the shelf (levels.ts SHELVED_FAMILIES).
 *
 * Every tier is the mech rig's three parts on one cell: a body drawn at
 * its hitbox in native px (36, 52, 72, 116, 148 — grapnelArt.ts) on the
 * smallest 64-multiple cell that holds it, so the world px per native px
 * is the same 0.625 the rest of the sheet has. The `leg` cell is this
 * family's ROWING ARMS rather than any kind of foot, and it is the same
 * size as the body's because the arms are drawn where they sit on the
 * animal — the rig slides the whole cell, not a sprite cut to the limb.
 */
const sfMechCells = (t: number, n: number, cell: number) => ({
  body: sprite(`grapnel${t}`, cell, n),
  base: sprite(`grapnel${t}-base`, cell, n),
  leg: sprite(`grapnel${t}-leg`, cell, n),
  bodySil: sprite(`grapnel${t}-sil`, cell, n),
  baseSil: sprite(`grapnel${t}-base-sil`, cell, n),
  legSil: sprite(`grapnel${t}-leg-sil`, cell, n),
});
export const SF1_CELLS = sfMechCells(1, GRAPNEL_TIERS[0].n, 64);
export const SF2_CELLS = sfMechCells(2, GRAPNEL_TIERS[1].n, 64);
export const SF3_CELLS = sfMechCells(3, GRAPNEL_TIERS[2].n, 128);
export const SF4_CELLS = sfMechCells(4, GRAPNEL_TIERS[3].n, 128);
export const SF5_CELLS = sfMechCells(5, GRAPNEL_TIERS[4].n, 256);

/**
 * THE SIEGE'S CELLS — the railgun (wardenArt.ts), and the fourth set on
 * the sheet to ask the packer for room of its own rather than draw over a
 * Mindustry tree. The two Pylons below share the rig; the four Wardens are
 * turrets now and are packed as heads instead (packAtlas).
 *
 * Six cells a body, like every other thing on the mech rig: the body, the
 * base plate and one side's legs, each with its silhouette beside it. The
 * cell is the smallest 64-multiple that holds the hitbox in native px
 * (192 for the railgun and 128 for the two Pylons — see WardenTier), so
 * the world px per native px is the same 0.625 the rest of the sheet has.
 * The sprite size stays a parameter down at MECH_ART because a cell that
 * is not 128 carries a different quad.
 *
 * THESE ARE DRAWN WITH ANIMAL_ART OFF TOO, and they are the only
 * bodies on the sheet that are. The flag's promise is that turning it off
 * gives back the six Mindustry trees byte for byte — it says nothing about
 * the things that were never Mindustry's. The Borer is already drawn
 * either way for that reason, and the siege's machines are the same case:
 * there is no upstream hull under them to fall back to, and a mission that
 * silently stopped drawing its objective would be a black square the
 * player is asked to shoot.
 */
const wardenCells = (name: string, n: number, cell: number) => ({
  kind: name as UnitKind,
  body: sprite(name, cell, n),
  base: sprite(`${name}-base`, cell, n),
  leg: sprite(`${name}-leg`, cell, n),
  sil: {
    body: sprite(`${name}-sil`, cell, n),
    base: sprite(`${name}-base-sil`, cell, n),
    leg: sprite(`${name}-leg-sil`, cell, n),
  },
});
/** the railgun on a 192 cell: six tiles of turret plate (wardenArt.ts
 *  RAZE_PLATE_TILES) does not fit a 128 */
const RAZE_CELLS = wardenCells("railgun", RAZE_TIER.n, 192);
/** ...and the four Wardens, on the smallest 64-multiple that holds each
 *  one's grid: 3 and 4 tiles fit a 128, 5 wants a 192 and 7 a 256 */
const LANCE_CELLS = wardenCells("lance", LANCE_TIER.n, 128);
const BULWARK_CELLS = wardenCells("bulwark", BULWARK_TIER.n, 128);
const HALBERD_CELLS = wardenCells("halberd", HALBERD_TIER.n, 192);
const JUGGERNAUT_CELLS = wardenCells("juggernaut", JUGGERNAUT_TIER.n, 256);
/** the two buff towers (pylonArt.ts), on the same six-cell mech rig — 128
 *  native px is four tiles, so a 128 cell holds them at the sheet's scale */
const GOAD_CELLS = wardenCells("goad", GOAD_TIER.n, 128);
const BASTION_CELLS = wardenCells("bastion", BASTION_TIER.n, 128);
const BRANDER_CELLS = wardenCells("brander", BRANDER_TIER.n, 128);
/** the two fabricators (fabricatorArt.ts), 3 and 6 tiles, each on the
 *  smallest 64-multiple cell that holds its grid */
const FABRICATOR_CELL_PX: readonly number[] = [128, 192];
const FABRICATOR_CELLS = FABRICATOR_TIERS.map((T, i) =>
  wardenCells(FABRICATOR_KINDS[i], T.n, FABRICATOR_CELL_PX[i]),
);

/**
 * THE KETTLES' CELLS, and the third family to ask the packer for room of
 * its own rather than draw over a Mindustry tree (the Tuskers were the
 * first, the Grapnels the second). There is no upstream `kettle3` and no
 * sprite file for one, so with ANIMAL_ART off these cells are never
 * painted and the family sits on the shelf (levels.ts SHELVED_FAMILIES).
 *
 * Three cells a tier, like every other body on the wing rig: the composed
 * sprite, the body column and one wing. The composed sprite goes in the
 * smallest 64-multiple cell that holds its hitbox in native px (40, 56,
 * 88, 168, 216 — kettleArt.ts), so the world px per native px is the same
 * 0.625 the rest of the sheet has; the body and wing cells are derived
 * from the tier (FlyerTier bw/nw) the way partCells does it below, which
 * is why they are declared down there with the Stoop's and not here.
 */
const KETTLE_FULL_CELLS: readonly UVRect[] = KETTLE_TIERS.map((T, i) =>
  sprite(`kettle${i + 1}`, [64, 64, 128, 256, 256][i], T.n),
);
const KETTLE_KINDS: readonly UnitKind[] = ["kettle1", "kettle2", "kettle3", "kettle4", "kettle5"];
/** the Whales' cells, on the Kettles' terms: three a tier for the wing
 *  rig (the fins are the wings), the composed sprite in the smallest
 *  64-multiple that holds its 56, 80, 120, 184, 240 px grid (whaleArt.ts) */
const WHALE_FULL_CELLS: readonly UVRect[] = WHALE_TIERS.map((T, i) =>
  sprite(`whale${i + 1}`, [64, 128, 128, 192, 256][i], T.n),
);
const WHALE_KINDS: readonly UnitKind[] = ["whale1", "whale2", "whale3", "whale4", "whale5"];
/** the Ratkings' cells, on the Grapnels' terms: the mech rig's three parts
 *  a tier, on the smallest 64-multiple that holds the 32, 48, 72, 112, 144
 *  px grid (ratkingArt.ts) */
const rkMechCells = (t: number, n: number, cell: number) => ({
  body: sprite(`ratking${t}`, cell, n),
  base: sprite(`ratking${t}-base`, cell, n),
  leg: sprite(`ratking${t}-leg`, cell, n),
  bodySil: sprite(`ratking${t}-sil`, cell, n),
  baseSil: sprite(`ratking${t}-base-sil`, cell, n),
  legSil: sprite(`ratking${t}-leg-sil`, cell, n),
});
const RK_CELLS = [64, 64, 128, 128, 192].map((cell, i) => rkMechCells(i + 1, RATKING_TIERS[i].n, cell));

/**
 * WHAT THE BOSS DRAWS AT: one and a half world px per native px against
 * everything else's one. It is the boss's own multiplier and always has
 * been — it was the disrupt's — and the boss is the only kind on the sheet
 * with one, because presence is that unit's whole job. Every quad and
 * every offset the king's rig hands the renderer is scaled by it (UNIT_ART
 * and wingPart below), so the art, the wing roots and the beat all ride
 * one number and the hitbox is authored to match.
 */
const BOSS_SCALE = 1.5;

/**
 * THE SOVEREIGN'S CELLS — the boss's, and the largest on the sheet by a
 * long way. Three of them, like every other body on the wing rig: the
 * composed sprite in a 512 cell, the body column, and one wing.
 *
 * 512 NATIVE PX IS THE EAGLE'S HITBOX, at BOSS_SCALE rather than at the
 * 32 px a tile everything else on the sheet is drawn to: 512 x 0.625 x 1.5
 * is 480 world px, a twenty-four-block body (kingArt.ts, levels.ts).
 *
 * IT DOES NOT PACK OVER THE STOCK BOSS. Every other animal draws into a
 * cell the stock art already owned, and the boss's own cell (UV_BOSS) is a
 * 256 holding a 243px hull — a quarter of the area the eagle needs. So the
 * king asks the packer for room of its own, the way the Tuskers and the
 * Grapnels do, and UV_BOSS is left exactly as it was: with ANIMAL_ART off
 * these cells are never painted and the stock hull is back, byte for byte.
 */
const KING_CELLS = {
  full: sprite("king", KING_TIER.n, KING_TIER.n),
  body: column("king-body", KING_TIER.n + 1, KING_TIER.bw + 1),
  wing: sprite("king-wing", KING_TIER.nw + 1, KING_TIER.nw + 1),
};

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

/**
 * THE CROSSER'S CELLS, and they are on the sheet for the same reason the
 * Tuskers' are: nothing upstream is called a `wormcar`, so the three
 * pieces ask the packer for room of their own rather than going over
 * anything (see THE TUSKERS' CELLS above).
 *
 * ALL THREE ARE ONE SIZE. A worm is twenty bodies in a line (levels.ts
 * WORM_CHAIN) drawn on one 96 grid — three tiles — in the smallest
 * 64-multiple cell that holds it, so the head, the eighteen cars and the
 * tail share one packing and the whole train rides one quad size. The
 * head fills its grid and the cars are drawn narrower inside it, which is
 * the 90x69 and 84x66 the hitboxes say once the quad's 1.5 is on (see
 * UNIT_ART below — this is the one body on the sheet drawn above its
 * native scale apart from the boss).
 *
 * NO TEAM CELL AND NO SILHOUETTE. A Borer is a machine rather than an
 * animal (game/wormArt.ts): it wears the crimson as paint laid in the
 * drawing itself, not as the tinted accent overlay a family's body
 * carries, and nothing on the roster casts it as a shadow puppet. So the
 * three go down the renderer's plain-quad path — one cell, one quad, the
 * heading the sim turned it to.
 */
/**
 * THE HAULER'S CELL (game/convoyArt.ts) — the escort mission's cart, on
 * the sheet for the reason the Borer's pieces are: nothing upstream is
 * called a hauler, so it asks the packer for room of its own rather than
 * going over anything.
 *
 * A 192px drawing in a 256 cell, which is the smallest 64-multiple that
 * holds it. NO TEAM CELL: the cart is the PLAYER'S, and a team cell is
 * the tinted accent overlay a body of the swarm's wears. What it wears
 * instead is the player's amber, painted into the drawing itself.
 */
export const UV_CONVOY = sprite("convoy", 256, CONVOY_N);
/**
 * THE WORLD QUAD THE CELL IS STRETCHED ONTO, and it is CONVOY_SIZE tiles
 * of it — the box the swarm's guns are aiming at, so the art is the
 * hitbox and the two cannot drift.
 *
 * `CONVOY_SIZE * CELL` is the cart's own twelve tiles (240px) and the
 * ratio 256 : 192 is the cell's padding, which has to be carried or the
 * drawing lands at five sixths of the box it is standing in. The number
 * is DERIVED rather than typed because it was typed once — 160, back when
 * the cart was six tiles — and doubling the footprint left the art at
 * half size with a typecheck that had nothing to say about it.
 *
 * It does mean the sheet is magnifying: 256 native px over 320 world px
 * is 1.25 world px a pixel where every other cell on the sheet is 0.625.
 * That is the price of a twelve-tile body drawn on a six-tile grid, and
 * it is the right price — the cart is drawn in slabs (convoyArt.ts,
 * nothing on it narrower than four px) and it is almost always on screen
 * at a camera zoomed out far enough to see a road, where the quad is
 * downsampled anyway.
 */
export const CONVOY_QUAD = (256 / CONVOY_N) * CONVOY_SIZE * CELL;
export const UV_CONVOY_LEG = sprite("convoyLeg", 64, CONVOY_LEG_N);
/** the leg's quad on the same world-per-native scale as the body's */
export const CONVOY_LEG_QUAD = (64 * CONVOY_QUAD) / 256;

const WORM_CELLS = {
  head: sprite("wormhead", 128, WORM_N),
  car: sprite("wormcar", 128, WORM_N),
  tail: sprite("wormtail", 128, WORM_N),
};

// per-kind unit art: atlas cell + world quad size. Both ride at true
// Mindustry scale — ironhide1 48px art = 1.5 tiles, ironhide2 64px art = 2 tiles
export const UNIT_ART: Record<UnitKind, { uv: UVRect; sprite: number }> = {
  // the siege's three, on cells nobody else owns (see THE SIEGE'S CELLS),
  // at the sheet's own px scale: a railgun is drawn at the six tiles its
  // hitbox says it is, the two pylons at four
  railgun: { uv: RAZE_CELLS.body, sprite: UNIT_SPRITE * 3 },
  goad: { uv: GOAD_CELLS.body, sprite: UNIT_SPRITE * 2 },
  bastion: { uv: BASTION_CELLS.body, sprite: UNIT_SPRITE * 2 },
  brander: { uv: BRANDER_CELLS.body, sprite: UNIT_SPRITE * 2 },
  fabricatorSmall: { uv: FABRICATOR_CELLS[0].body, sprite: UNIT_SPRITE * 2 },
  fabricatorLarge: { uv: FABRICATOR_CELLS[1].body, sprite: UNIT_SPRITE * 3 },
  // the four Wardens, each on its own cell at the sheet's px scale
  lance: { uv: LANCE_CELLS.body, sprite: UNIT_SPRITE * 2 },
  bulwark: { uv: BULWARK_CELLS.body, sprite: UNIT_SPRITE * 2 },
  halberd: { uv: HALBERD_CELLS.body, sprite: UNIT_SPRITE * 3 },
  juggernaut: { uv: JUGGERNAUT_CELLS.body, sprite: UNIT_SPRITE * 4 },
  ironhide1: { uv: UV_IRONHIDE1_BODY, sprite: UNIT_SPRITE },
  ironhide2: { uv: UV_IRONHIDE2_BODY, sprite: UNIT_SPRITE },
  ironhide3: { uv: UV_IRONHIDE3_BODY, sprite: UNIT_SPRITE * 2 }, // 128px cell, same px scale
  ironhide4: { uv: UV_IRONHIDE4_BODY, sprite: UNIT_SPRITE * 4 }, // 256px cell, same px scale
  ironhide5: { uv: UV_IRONHIDE5_BODY, sprite: UNIT_SPRITE * 4 },
  dartback1: { uv: UV_DARTBACK1_BODY, sprite: UNIT_SPRITE },
  // 128px cells, like the ironhide3: the legged pair's bodies outgrow 64
  dartback2: { uv: UV_DARTBACK2_BODY, sprite: UNIT_SPRITE * 2 },
  dartback3: { uv: UV_DARTBACK3_BODY, sprite: UNIT_SPRITE * 2 },
  dartback4: { uv: UV_DARTBACK4_BODY, sprite: UNIT_SPRITE * 4 }, // 256px cell, same px scale
  dartback5: { uv: UV_DARTBACK5_BODY, sprite: UNIT_SPRITE * 4 },
  starhart1: { uv: UV_STARHART1_BODY, sprite: UNIT_SPRITE },
  starhart2: { uv: UV_STARHART2_BODY, sprite: UNIT_SPRITE },
  starhart3: { uv: UV_STARHART3_BODY, sprite: UNIT_SPRITE * 2 }, // 128px cell, same px scale
  starhart4: { uv: UV_STARHART4_BODY, sprite: UNIT_SPRITE * 4 }, // 256px cell, same px scale
  starhart5: { uv: UV_STARHART5_BODY, sprite: UNIT_SPRITE * 4 },
  stoop1: { uv: UV_STOOP1, sprite: UNIT_SPRITE }, // 48px art in a 64 cell, ironhide1 scale
  // 128px cells: double the cell means double the sprite box, which keeps
  // world px per native px identical to every other unit
  stoop2: { uv: UV_STOOP2, sprite: UNIT_SPRITE * 2 },
  stoop3: { uv: UV_STOOP3, sprite: UNIT_SPRITE * 2 },
  stoop4: { uv: UV_STOOP4, sprite: UNIT_SPRITE * 4 },
  // THE BOSS DRAWS HALF AGAIN ITS NATIVE SCALE ON PURPOSE — the one unit
  // allowed to break the px-per-px convention, because presence is its
  // job, and the only thing about it that did not change when the Erekir
  // hull became the Sovereign (kingArt.ts). Off the animal switch that is
  // Mindustry's 243px disrupt on a 256 cell at x6, a 240px quad; on it, a
  // 512px eagle at the same 1.5 px-per-px, a 480px quad — TWENTY-FOUR
  // TILES, three and a third times the widest T5 there is. The hitbox
  // follows the art either way (UNIT_STATS.hitbox), so shots land where
  // the silhouette says they should
  boss: ANIMAL_ART
    ? { uv: KING_CELLS.full, sprite: (KING_TIER.n / 64) * UNIT_SPRITE * BOSS_SCALE }
    : { uv: UV_BOSS, sprite: UNIT_SPRITE * 6 },
  // 320x321 on a 7.25-block hitbox: the sheet's biggest single piece, and
  // the only 384px cell on it — hence the odd multiplier, which is just
  // 384/64 like every other one here
  stoop5: { uv: UV_STOOP5, sprite: UNIT_SPRITE * 6 },
  // the naval tanks: one quad apiece, like the flyers, on the band's three
  // cell sizes (see the UV note there)
  skate1: { uv: UV_SKATE1, sprite: UNIT_SPRITE * 2 },
  skate2: { uv: UV_SKATE2, sprite: UNIT_SPRITE * 2 },
  skate3: { uv: UV_SKATE3, sprite: UNIT_SPRITE * 4 },
  skate4: { uv: UV_SKATE4, sprite: UNIT_SPRITE * 4 },
  skate5: { uv: UV_SKATE5, sprite: UNIT_SPRITE * 6 },
  livewire1: { uv: UV_LIVEWIRE1, sprite: UNIT_SPRITE * 2 },
  livewire2: { uv: UV_LIVEWIRE2, sprite: UNIT_SPRITE * 2 },
  livewire3: { uv: UV_LIVEWIRE3, sprite: UNIT_SPRITE * 4 },
  livewire4: { uv: UV_LIVEWIRE4, sprite: UNIT_SPRITE * 4 },
  livewire5: { uv: UV_LIVEWIRE5, sprite: UNIT_SPRITE * 6 },
  // the elephants, on cells of their own (see the TUSKER note): a 56px
  // runt in a 64 cell, then 72 and 96 in 128s, then 136 and 176 in 256s —
  // the same world px per native px as everything above, on bodies drawn
  // at boxes nobody else on the roster has
  tusker1: { uv: TUSK1_CELLS.body, sprite: UNIT_SPRITE },
  tusker2: { uv: TUSK2_CELLS.body, sprite: UNIT_SPRITE * 2 },
  tusker3: { uv: TUSK3_CELLS.body, sprite: UNIT_SPRITE * 2 },
  tusker4: { uv: TUSK4_CELLS.body, sprite: UNIT_SPRITE * 4 },
  tusker5: { uv: TUSK5_CELLS.body, sprite: UNIT_SPRITE * 4 },
  grapnel1: { uv: SF1_CELLS.body, sprite: UNIT_SPRITE },
  grapnel2: { uv: SF2_CELLS.body, sprite: UNIT_SPRITE },
  grapnel3: { uv: SF3_CELLS.body, sprite: UNIT_SPRITE * 2 },
  grapnel4: { uv: SF4_CELLS.body, sprite: UNIT_SPRITE * 2 },
  grapnel5: { uv: SF5_CELLS.body, sprite: UNIT_SPRITE * 4 },
  // the vultures, on cells of their own (see THE KETTLES' CELLS): a 40px
  // runt and a 56px brute in 64s, an 88 in a 128, then 168 and 216 in
  // 256s — the same world px per native px as everything above it
  kettle1: { uv: KETTLE_FULL_CELLS[0], sprite: UNIT_SPRITE },
  kettle2: { uv: KETTLE_FULL_CELLS[1], sprite: UNIT_SPRITE },
  kettle3: { uv: KETTLE_FULL_CELLS[2], sprite: UNIT_SPRITE * 2 },
  kettle4: { uv: KETTLE_FULL_CELLS[3], sprite: UNIT_SPRITE * 4 },
  kettle5: { uv: KETTLE_FULL_CELLS[4], sprite: UNIT_SPRITE * 4 },
  whale1: { uv: WHALE_FULL_CELLS[0], sprite: UNIT_SPRITE },
  whale2: { uv: WHALE_FULL_CELLS[1], sprite: UNIT_SPRITE * 2 },
  whale3: { uv: WHALE_FULL_CELLS[2], sprite: UNIT_SPRITE * 2 },
  whale4: { uv: WHALE_FULL_CELLS[3], sprite: UNIT_SPRITE * 3 },
  whale5: { uv: WHALE_FULL_CELLS[4], sprite: UNIT_SPRITE * 4 },
  ratking1: { uv: RK_CELLS[0].body, sprite: UNIT_SPRITE },
  ratking2: { uv: RK_CELLS[1].body, sprite: UNIT_SPRITE },
  ratking3: { uv: RK_CELLS[2].body, sprite: UNIT_SPRITE * 2 },
  ratking4: { uv: RK_CELLS[3].body, sprite: UNIT_SPRITE * 2 },
  ratking5: { uv: RK_CELLS[4].body, sprite: UNIT_SPRITE * 3 },
  // the crosser's three pieces, a 96px drawing in a 128 cell apiece —
  // and the SECOND thing on the sheet that breaks the px-per-px rule, at
  // the boss's own 1.5. A 128 cell would be UNIT_SPRITE * 2; it is * 3,
  // so the 96px drawing lands on 90 world px of body instead of 60 and
  // the hitboxes in levels.ts are the same 1.5 times what they were. The
  // art is unchanged and simply drawn larger, which is what a train
  // crossing five hundred tiles of map has to be to read as one
  wormhead: { uv: WORM_CELLS.head, sprite: UNIT_SPRITE * 3 },
  wormcar: { uv: WORM_CELLS.car, sprite: UNIT_SPRITE * 3 },
  wormtail: { uv: WORM_CELLS.tail, sprite: UNIT_SPRITE * 3 },
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
 * engineSize, rotation -90 (UnitType.init); the boss sets two mirrored
 * pairs and so gets none on its axis. The boss draws half again its
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
  stoop1: axial(5.75, 2.5), // engineOffset 5.75, engineSize default 2.5
  stoop2: axial(7.8, 2.5),
  stoop3: axial(12, 3),
  stoop4: axial(21, 5.3),
  stoop5: axial(38, 7.3),
  boss: [
    ...mirrored(95 / 4, -56 / 4, 5, 330, 1.5),
    ...mirrored(89 / 4, -95 / 4, 4, 315, 1.5),
  ],
  // the Whales' rocket pods (whaleArt.ts whaleEngines): native px off the
  // body's centre, so a quarter of that in world units
  ...(Object.fromEntries(WHALE_TIERS.map((T, i) => [
    `whale${i + 1}`,
    whaleEngines(T).map((e) => engine(e.x / 4, e.y / 4, e.r / 4, -90)),
  ])) as Partial<Record<UnitKind, readonly UnitEngine[]>>),
};

/** part art + walk-cycle geometry for a ground (mech) unit */
export interface MechArt {
  leg: UVRect;
  base: UVRect;
  body: UVRect;
  /**
   * every Weapon bolted to the chassis, each mirrored to both sides
   * (Weapon.mirror, true on all of them). Empty when the type's weapons
   * have no sprite at all — dartback1's explosion IS its weapon — and more
   * than one once a hull carries mounts as well as a main gun.
   */
  guns: readonly LegGun[];
  stride: number; // leg swing amplitude px — the walk cycle is 4 strides
  /** the base quad drawn square to the grid instead of on the hull's
   *  heading: a chassis rides the body, a TURRET PLATE never turns */
  flatBase?: boolean;
  /**
   * HOW MUCH THE SWINGING SIDE SHORTENS, as a fraction of the part's own
   * quad (default LEG_LIFT). Mindustry's mech lifts the swinging leg and
   * draws it half length, which is a leg leaving the ground seen from
   * above; a body whose "legs" are ARMS LYING FLAT (grapnelArt.ts) never
   * leaves the ground at all, and half is a squash rather than a step —
   * so that family asks for a tenth and gets a reach instead of a stamp.
   */
  legLift?: number;
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
// x=5 y=0). Stoop1's weapon has no sprite, so flyers stay single-quad.
export const MECH_ART: Partial<Record<UnitKind, MechArt>> = {
  ironhide1: {
    leg: UV_IRONHIDE1_LEG,
    base: UV_IRONHIDE1_BASE,
    body: UV_IRONHIDE1_BODY,
    guns: [{ uv: UV_LARGE_WEAPON, sil: UV_LARGE_WEAPON_SIL, x: 4 * MU, y: 2 * MU, top: false }],
    stride: 4 * MU,
    sprite: UNIT_SPRITE,
    sil: { leg: UV_IRONHIDE1_LEG_SIL, base: UV_IRONHIDE1_BASE_SIL, body: UV_IRONHIDE1_BODY_SIL },
  },
  ironhide2: {
    leg: UV_IRONHIDE2_LEG,
    base: UV_IRONHIDE2_BASE,
    body: UV_IRONHIDE2_BODY,
    guns: [{ uv: UV_FLAMETHROWER, sil: UV_FLAMETHROWER_SIL, x: 5 * MU, y: 0, top: false }],
    stride: (4 + (10 - 8) / 2.1) * MU,
    sprite: UNIT_SPRITE,
    sil: { leg: UV_IRONHIDE2_LEG_SIL, base: UV_IRONHIDE2_BASE_SIL, body: UV_IRONHIDE2_BODY_SIL },
  },
  // artillery weapon x=9 y=1, mirrored; mechFrontSway 0.55 is 5.5x the
  // default — the heavy visibly lumbers nose-first with every stride
  ironhide3: {
    leg: UV_IRONHIDE3_LEG,
    base: UV_IRONHIDE3_BASE,
    body: UV_IRONHIDE3_BODY,
    guns: [{ uv: UV_ARTILLERY, sil: UV_ARTILLERY_SIL, x: 9 * MU, y: 1 * MU, top: false }],
    stride: (4 + (13 - 8) / 2.1) * MU,
    frontSway: 0.55 * MU,
    sprite: UNIT_SPRITE * 2,
    sil: { leg: UV_IRONHIDE3_LEG_SIL, base: UV_IRONHIDE3_BASE_SIL, body: UV_IRONHIDE3_BODY_SIL },
  },
  /**
   * The T4: the first hull on the roster carrying more than one kind of
   * gun. ironhide4-weapon x=16 y=1 rides UNDER the body like every mech gun
   * before it; the two ironhide4-mount turrets (x=8.5, y=6 and y=-7) leave
   * `top` at its default and sit ON it — which is the whole reason
   * MechArt.guns is a list and pushMech sorts by that flag.
   *
   * mechFrontSway 1 is ten times the stock lean: at 0.36 px/tick it plants
   * one foot at a time and the hull pitches forward onto each of them.
   */
  ironhide4: {
    leg: UV_IRONHIDE4_LEG,
    base: UV_IRONHIDE4_BASE,
    body: UV_IRONHIDE4_BODY,
    guns: [
      { uv: UV_IRONHIDE4_WEAPON, sil: UV_IRONHIDE4_WEAPON_SIL, x: 16 * MU, y: 1 * MU, top: false },
      { uv: UV_IRONHIDE4_MOUNT, sil: UV_IRONHIDE4_MOUNT_SIL, x: 8.5 * MU, y: 6 * MU, top: true },
      { uv: UV_IRONHIDE4_MOUNT, sil: UV_IRONHIDE4_MOUNT_SIL, x: 8.5 * MU, y: -7 * MU, top: true },
    ],
    stride: (4 + (22 - 8) / 2.1) * MU,
    frontSway: 1 * MU,
    sprite: UNIT_SPRITE * 4,
    sil: { leg: UV_IRONHIDE4_LEG_SIL, base: UV_IRONHIDE4_BASE_SIL, body: UV_IRONHIDE4_BODY_SIL },
  },
  // support T1: heal-weapon x=4.5 mirrored, top=false so it rides under the
  // body like the ironhide1's. hitSize 8 gives it the ironhide1's 4-unit stride
  starhart1: {
    leg: UV_STARHART1_LEG,
    base: UV_STARHART1_BASE,
    body: UV_STARHART1_BODY,
    guns: [{ uv: UV_HEAL_WEAPON, sil: UV_HEAL_WEAPON_SIL, x: 4.5 * MU, y: 0, top: false }],
    stride: 4 * MU,
    sprite: UNIT_SPRITE,
    sil: { leg: UV_STARHART1_LEG_SIL, base: UV_STARHART1_BASE_SIL, body: UV_STARHART1_BODY_SIL },
  },
  // support T2: heal-shotgun-weapon x=5 y=0.5, mirrored and under the body
  starhart2: {
    leg: UV_STARHART2_LEG,
    base: UV_STARHART2_BASE,
    body: UV_STARHART2_BODY,
    guns: [{ uv: UV_HEAL_SHOTGUN, sil: UV_HEAL_SHOTGUN_SIL, x: 5 * MU, y: 0.5 * MU, top: false }],
    stride: (4 + (11 - 8) / 2.1) * MU,
    sprite: UNIT_SPRITE,
    sil: { leg: UV_STARHART2_LEG_SIL, base: UV_STARHART2_BASE_SIL, body: UV_STARHART2_BODY_SIL },
  },
  // support T3: beam-weapon x=6.5, top=false, and mechFrontSway 0.55 — the
  // same nose-first lumber the ironhide3 walks with. hitSize 13 gives it the
  // heavy's stride, which reads right under a bubble this wide
  starhart3: {
    leg: UV_STARHART3_LEG,
    base: UV_STARHART3_BASE,
    body: UV_STARHART3_BODY,
    guns: [{ uv: UV_BEAM_WEAPON, sil: UV_BEAM_WEAPON_SIL, x: 6.5 * MU, y: 0, top: false }],
    stride: (4 + (13 - 8) / 2.1) * MU,
    frontSway: 0.55 * MU,
    sprite: UNIT_SPRITE * 2,
    sil: { leg: UV_STARHART3_LEG_SIL, base: UV_STARHART3_BASE_SIL, body: UV_STARHART3_BODY_SIL },
  },
  /**
   * The support T4. Its main gun has NO sprite at all: Mindustry's
   * Weapon("starhart4-weapon") finds no such region and Weapon.draw skips a
   * region it cannot find, so the plasma cannon you see is painted into
   * the hull itself. What is left to bolt on is the pair of repair-beam
   * pods (x=11, y=-7.5), and those ride ON the body like the ironhide4's
   * mounts rather than under it.
   *
   * mechFrontSway 1 matches the ironhide4's ten-times-stock lean, on a hull
   * that walks even slower — it plants each foot and rocks over it.
   */
  starhart4: {
    leg: UV_STARHART4_LEG,
    base: UV_STARHART4_BASE,
    body: UV_STARHART4_BODY,
    guns: [{ uv: UV_REPAIR_BEAM, sil: UV_REPAIR_BEAM_SIL, x: 11 * MU, y: -7.5 * MU, top: true }],
    stride: (4 + (24 - 8) / 2.1) * MU,
    frontSway: 1 * MU,
    sprite: UNIT_SPRITE * 4,
    sil: { leg: UV_STARHART4_LEG_SIL, base: UV_STARHART4_BASE_SIL, body: UV_STARHART4_BODY_SIL },
  },
  /**
   * The ground line's T5 — the same four-part mech as the ironhide4, one
   * tier heavier. Weapon("ironhide5-weapon") is top=false at x=21.5, y=1: the
   * widest mount on the roster, slung under a chassis 30 world units
   * across, so the pair sits almost clear of the hull's own outline.
   *
   * mechFrontSway 1.9 is nineteen times stock and the largest on any unit
   * (the ironhide4's 1 was the previous high); mechSideSway 0.6 is barely
   * over the 0.54 default. So it pitches nose-down hard over each step
   * without rolling — a heavy lurch rather than the ironhide1's swagger.
   */
  ironhide5: {
    leg: UV_IRONHIDE5_LEG,
    base: UV_IRONHIDE5_BASE,
    body: UV_IRONHIDE5_BODY,
    guns: [{ uv: UV_IRONHIDE5_WEAPON, sil: UV_IRONHIDE5_WEAPON_SIL, x: 21.5 * MU, y: 1 * MU, top: false }],
    stride: (4 + (30 - 8) / 2.1) * MU,
    frontSway: 1.9 * MU,
    sideSway: 0.6 * MU,
    sprite: UNIT_SPRITE * 4,
    sil: { leg: UV_IRONHIDE5_LEG_SIL, base: UV_IRONHIDE5_BASE_SIL, body: UV_IRONHIDE5_BODY_SIL },
  },
  // no gun sprite — its Weapon fires only via shootOnDeath. mechSideSway
  // 0.25 is under half the default: it scuttles rather than swaggers
  dartback1: {
    leg: UV_DARTBACK1_LEG,
    base: UV_DARTBACK1_BASE,
    body: UV_DARTBACK1_BODY,
    guns: [],
    stride: 4 * MU,
    sideSway: 0.25 * MU,
    sprite: UNIT_SPRITE,
    sil: { leg: UV_DARTBACK1_LEG_SIL, base: UV_DARTBACK1_BASE_SIL, body: UV_DARTBACK1_BODY_SIL },
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
   * dartback5's cannon sits at x=0, so mirroring it would stack two quads in
   * the same place and double-composite the sprite's feathered rim.
   */
  mirror?: boolean;
}

/** part art for a legged (LegsUnit) ground unit — see LegSpec for its gait */
export interface LegArt {
  body: UVRect;
  /** Mindustry baseRegion, the plate the legs mount to; dartback3 has none */
  base?: UVRect;
  /** Mindustry jointRegion, the cap over the KNEE — dartback4 has none, and
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
  // dartback2-weapon x=7, top=false: a pair of slag guns slung under the shell
  dartback2: {
    body: UV_DARTBACK2_BODY,
    base: UV_DARTBACK2_BASE,
    joint: UV_DARTBACK2_JOINT,
    foot: UV_DARTBACK2_FOOT,
    leg: UV_DARTBACK2_LEG,
    legBase: UV_DARTBACK2_LEG_BASE,
    legStroke: 26 * PX,
    legBaseStroke: 26 * PX,
    guns: [{ uv: UV_DARTBACK2_WEAPON, sil: UV_DARTBACK2_WEAPON_SIL, x: 7 * MU, y: 0, top: false }],
    sprite: UNIT_SPRITE * 2,
    small: UNIT_SPRITE,
    sil: {
      body: UV_DARTBACK2_BODY_SIL,
      base: UV_DARTBACK2_BASE_SIL,
      joint: UV_DARTBACK2_JOINT_SIL,
      foot: UV_DARTBACK2_FOOT_SIL,
    },
  },
  // two weapon pairs over the body: the long sap gun (x=8.5, y=-1.5) and
  // the small purple mount (x=4, y=3). Both rotate to track a target in
  // Mindustry; these enemies never shoot, so they ride the body's facing
  dartback3: {
    body: UV_DARTBACK3_BODY,
    joint: UV_DARTBACK3_JOINT,
    foot: UV_DARTBACK3_FOOT,
    leg: UV_DARTBACK3_LEG,
    legBase: UV_DARTBACK3_LEG_BASE,
    legStroke: 34 * PX,
    legBaseStroke: 34 * PX,
    guns: [
      { uv: UV_DARTBACK3_WEAPON, sil: UV_DARTBACK3_WEAPON_SIL, x: 8.5 * MU, y: -1.5 * MU, top: true },
      { uv: UV_DARTBACK3_MOUNT, sil: UV_DARTBACK3_MOUNT_SIL, x: 4 * MU, y: 3 * MU, top: true },
    ],
    sprite: UNIT_SPRITE * 2,
    small: UNIT_SPRITE,
    sil: { body: UV_DARTBACK3_BODY_SIL, joint: UV_DARTBACK3_JOINT_SIL, foot: UV_DARTBACK3_FOOT_SIL },
  },
  /**
   * The dartback1 line's T4 — the same six-leg frame as the dartback3 at more
   * than twice the reach, and the first unit on the roster whose knee has
   * no cap: dartback4 ships a dartback4-joint-base instead, a shoulder plate
   * drawn over all six MOUNTS once every leg is down.
   *
   * Its guns are the dartback3's sap weapon three times over (x=4/9/14 down
   * the flank, each mirrored) topped by one large purple artillery mount
   * at x=9, y=-7 — eight gun quads, where the dartback3 carries four.
   */
  dartback4: {
    body: UV_DARTBACK4_BODY,
    baseJoint: UV_DARTBACK4_JOINT_BASE,
    foot: UV_DARTBACK4_FOOT,
    leg: UV_DARTBACK4_LEG,
    legBase: UV_DARTBACK4_LEG_BASE,
    legStroke: 56 * PX,
    legBaseStroke: 64 * PX,
    guns: [
      { uv: UV_DARTBACK4_WEAPON, sil: UV_DARTBACK4_WEAPON_SIL, x: 4 * MU, y: 8 * MU, top: true },
      { uv: UV_DARTBACK4_WEAPON, sil: UV_DARTBACK4_WEAPON_SIL, x: 9 * MU, y: 6 * MU, top: true },
      { uv: UV_DARTBACK4_WEAPON, sil: UV_DARTBACK4_WEAPON_SIL, x: 14 * MU, y: 0, top: true },
      { uv: UV_DARTBACK4_MOUNT, sil: UV_DARTBACK4_MOUNT_SIL, x: 9 * MU, y: -7 * MU, top: true },
    ],
    sprite: UNIT_SPRITE * 4,
    small: UNIT_SPRITE * 2,
    sil: {
      body: UV_DARTBACK4_BODY_SIL,
      baseJoint: UV_DARTBACK4_JOINT_BASE_SIL,
      foot: UV_DARTBACK4_FOOT_SIL,
    },
  },
  /**
   * The dartback1 line's T5 — the dartback4's frame with two more legs and two
   * and a half times the reach, and the only unit that carries BOTH gun
   * kinds at once: the dartback4's large purple mount, mirrored to x=11,
   * y=-5, and one dartback5-cannon dead on the centreline at y=-14. That
   * cannon is Weapon.mirror=false, the roster's only unmirrored gun with a
   * sprite, so it draws once rather than twice over itself.
   *
   * The mount cell is the dartback4's own UV_DARTBACK4_MOUNT: same sprite, same
   * 256px cell, same world scale, so there is nothing to gain by packing a
   * second copy. Like the dartback4 it has no knee cap, only a shoulder plate.
   */
  dartback5: {
    body: UV_DARTBACK5_BODY,
    baseJoint: UV_DARTBACK5_JOINT_BASE,
    foot: UV_DARTBACK5_FOOT,
    leg: UV_DARTBACK5_LEG,
    legBase: UV_DARTBACK5_LEG_BASE,
    legStroke: 72 * PX,
    legBaseStroke: 64 * PX,
    guns: [
      { uv: UV_DARTBACK4_MOUNT, sil: UV_DARTBACK4_MOUNT_SIL, x: 11 * MU, y: -5 * MU, top: true },
      {
        uv: UV_DARTBACK5_CANNON,
        sil: UV_DARTBACK5_CANNON_SIL,
        x: 0,
        y: -14 * MU,
        top: true,
        mirror: false,
      },
    ],
    sprite: UNIT_SPRITE * 4,
    small: UNIT_SPRITE * 2,
    sil: {
      body: UV_DARTBACK5_BODY_SIL,
      baseJoint: UV_DARTBACK5_JOINT_BASE_SIL,
      foot: UV_DARTBACK5_FOOT_SIL,
    },
  },
  /**
   * The support line's T5, and the only legged unit on the roster wearing
   * the full set of leg parts: a mount plate (baseRegion) like the dartback2,
   * a knee cap (jointRegion) like the dartback2 and dartback3, AND a shoulder
   * plate (baseJointRegion) like the dartback4 and dartback5.
   *
   * It carries no gun at all. Mindustry's Weapon("starhart5-weapon") names a
   * region the sprite set does not contain — only a -heat overlay exists —
   * and Weapon.draw skips a region it cannot find, so the charged laser is
   * painted into the hull, exactly as the starhart4's plasma cannon is.
   *
   * Four legs of 14 world units on mounts 11 out: almost the whole span is
   * the mount offset, so the segments are stubby and very broad — a 68px
   * stroke against a 30px segment, the widest leg-to-length ratio here.
   */
  starhart5: {
    body: UV_STARHART5_BODY,
    base: UV_STARHART5_BASE,
    joint: UV_STARHART5_JOINT,
    baseJoint: UV_STARHART5_JOINT_BASE,
    foot: UV_STARHART5_FOOT,
    leg: UV_STARHART5_LEG,
    legBase: UV_STARHART5_LEG_BASE,
    legStroke: 68 * PX,
    legBaseStroke: 64 * PX,
    guns: [],
    sprite: UNIT_SPRITE * 4,
    small: UNIT_SPRITE * 2,
    sil: {
      body: UV_STARHART5_BODY_SIL,
      base: UV_STARHART5_BASE_SIL,
      joint: UV_STARHART5_JOINT_SIL,
      baseJoint: UV_STARHART5_JOINT_BASE_SIL,
      foot: UV_STARHART5_FOOT_SIL,
    },
  },
};

// ---- THE ANIMAL ART (game/animalFlag.ts, game/animalArt.ts) ------------
//
// The cells the trial needs beyond the ones the two lines already own.
// Everything else the animals draw into is a cell the stock art owns
// (starhart1's leg/base/body, starhart5's caps and feet, the flyers' single
// cells) and is cleared and redrawn at pack time — see packAnimalArt.
// The animal art is generated, so its size is not declared: these cells
// take the full gutter and the pack pass draws whatever size comes out.
/** starhart4's legged parts, the ones its mech rig never had: caps and a hoof
 *  small enough for 64px cells (HART_TIERS small) */
export const UV_STARHART4_FOOT = sprite("starhart4-foot", 64, 64);
export const UV_STARHART4_FOOT_SIL = sprite("starhart4-foot-sil", 64, 64);
export const UV_STARHART4_JOINT = upright("starhart4-joint", 64, 64);
export const UV_STARHART4_JOINT_SIL = upright("starhart4-joint-sil", 64, 64);
export const UV_STARHART4_JOINT_BASE = sprite("starhart4-joint-base", 64, 64);
export const UV_STARHART4_JOINT_BASE_SIL = sprite("starhart4-joint-base-sil", 64, 64);
/** the stag's leg segments on exact rects: thigh then shin, T4 then T5.
 *  A stretched segment samples its rect corner to corner, mount on the
 *  left, so the height IS the stroke */
const HART4 = HART_TIERS[3], HART5 = HART_TIERS[4];
export const UV_STARHART4_LEG_SEG = flat("starhart4-leg-seg", 64, HART4.th);
export const UV_STARHART4_LEG_BASE_SEG = flat("starhart4-leg-base-seg", 64, HART4.sh);
export const UV_STARHART5_LEG_SEG = flat("starhart5-leg-seg", 64, HART5.th);
export const UV_STARHART5_LEG_BASE_SEG = flat("starhart5-leg-base-seg", 64, HART5.sh);
/** the rhino's T4 and T5 leave the mech rig for the legged one: caps, hoof
 *  and segments of their own, on 64 cells for the T4 and 128 for the T5;
 *  the body and base go on in the ironhide4's and ironhide5's own cells */
export const UV_IRONHIDE4_FOOT = sprite("ironhide4-foot", 64, 64);
export const UV_IRONHIDE4_JOINT = upright("ironhide4-joint", 64, 64);
export const UV_IRONHIDE4_JOINT_BASE = sprite("ironhide4-joint-base", 64, 64);
export const UV_IRONHIDE4_FOOT_SIL = sprite("ironhide4-foot-sil", 64, 64);
export const UV_IRONHIDE4_JOINT_SIL = upright("ironhide4-joint-sil", 64, 64);
export const UV_IRONHIDE4_JOINT_BASE_SIL = sprite("ironhide4-joint-base-sil", 64, 64);
export const UV_IRONHIDE5_FOOT = sprite("ironhide5-foot", 128, 128);
export const UV_IRONHIDE5_JOINT = upright("ironhide5-joint", 128, 128);
export const UV_IRONHIDE5_JOINT_BASE = sprite("ironhide5-joint-base", 128, 128);
export const UV_IRONHIDE5_FOOT_SIL = sprite("ironhide5-foot-sil", 128, 128);
export const UV_IRONHIDE5_JOINT_SIL = upright("ironhide5-joint-sil", 128, 128);
export const UV_IRONHIDE5_JOINT_BASE_SIL = sprite("ironhide5-joint-base-sil", 128, 128);
const IRON4 = IRON_TIERS[3], IRON5 = IRON_TIERS[4];
export const UV_IRONHIDE4_LEG_SEG = flat("ironhide4-leg-seg", 64, IRON4.th);
export const UV_IRONHIDE4_LEG_BASE_SEG = flat("ironhide4-leg-base-seg", 64, IRON4.sh);
export const UV_IRONHIDE5_LEG_SEG = flat("ironhide5-leg-seg", 64, IRON5.th);
export const UV_IRONHIDE5_LEG_BASE_SEG = flat("ironhide5-leg-base-seg", 64, IRON5.sh);
/** the frog's parts the venom line's rigs never had — knees for the
 *  dartback4 and dartback5 — and every legged tier's segments of hide; the
 *  rest of its parts go on in the venom line's own cells, the runt's on
 *  the dartback1 mech's */
export const UV_DARTBACK4_JOINT = upright("dartback4-joint", 128, 128);
export const UV_DARTBACK4_JOINT_SIL = upright("dartback4-joint-sil", 128, 128);
export const UV_DARTBACK5_JOINT = upright("dartback5-joint", 128, 128);
export const UV_DARTBACK5_JOINT_SIL = upright("dartback5-joint-sil", 128, 128);
export const UV_DARTBACK2_LEG_SEG = flat("dartback2-leg-seg", 64, FROG_TIERS[1].th);
export const UV_DARTBACK2_LEG_BASE_SEG = flat("dartback2-leg-base-seg", 64, FROG_TIERS[1].sh);
export const UV_DARTBACK3_LEG_SEG = flat("dartback3-leg-seg", 64, FROG_TIERS[2].th);
export const UV_DARTBACK3_LEG_BASE_SEG = flat("dartback3-leg-base-seg", 64, FROG_TIERS[2].sh);
export const UV_DARTBACK4_LEG_SEG = flat("dartback4-leg-seg", 64, FROG_TIERS[3].th);
export const UV_DARTBACK4_LEG_BASE_SEG = flat("dartback4-leg-base-seg", 64, FROG_TIERS[3].sh);
export const UV_DARTBACK5_LEG_SEG = flat("dartback5-leg-seg", 64, FROG_TIERS[4].th);
export const UV_DARTBACK5_LEG_BASE_SEG = flat("dartback5-leg-base-seg", 64, FROG_TIERS[4].sh);
/** the bats', mantas' and narwhals' bodies and wings, apart, each on a
 *  cell one px over its art (FlyerTier n/bw/nw): the body is drawn on the
 *  composed grid, since a hull is longer than a wing is wide, and packed
 *  as a column `bw` wide; the composed sprite goes in each kind's own cell */
const partCells = (name: string, T: FlyerTier) =>
  [column(`${name}${T.t}-body`, T.n + 1, T.bw + 1), sprite(`${name}${T.t}-wing`, T.nw + 1, T.nw + 1)] as const;
export const UV_STOOP_CELLS: readonly (readonly [UVRect, UVRect])[] = STOOP_TIERS.map((T) => partCells("stoop", T));
export const UV_MANTA_CELLS: readonly (readonly [UVRect, UVRect])[] = MANTA_TIERS.map((T) => partCells("manta", T));
export const UV_NARWHAL_CELLS: readonly (readonly [UVRect, UVRect])[] = NARWHAL_TIERS.map((T) => partCells("narwhal", T));
export const UV_KETTLE_CELLS: readonly (readonly [UVRect, UVRect])[] = KETTLE_TIERS.map((T) => partCells("kettle", T));
export const UV_WHALE_CELLS: readonly (readonly [UVRect, UVRect])[] = WHALE_TIERS.map((T) => partCells("whale", T));

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
  /** the body quad, along the heading and across it */
  sprite: number;
  spriteH: number;
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

/**
 * THE WORM RIG'S SPRITES (levels.ts SegmentSpec, Sim.usegX): a head on the
 * hull's own position, one body sprite on every segment of the chain and
 * a tail past the last one, each drawn along the chain's direction there.
 * Sizes are world px. The swim is the sim's (SegmentSpec), not drawn on.
 */
export interface SegmentArt {
  head: UVRect;
  body: UVRect;
  tail: UVRect;
  headSprite: number;
  bodySprite: number;
  tailSprite: number;
}
/** the segmented kinds — empty unless the animal art is on */
export const SEGMENT_ART: Partial<Record<UnitKind, SegmentArt>> = {};
const MANTA_KINDS: readonly UnitKind[] = ["skate1", "skate2", "skate3", "skate4", "skate5"];
const NARWHAL_KINDS: readonly UnitKind[] = ["livewire1", "livewire2", "livewire3", "livewire4", "livewire5"];
const STOOP_KINDS: readonly UnitKind[] = ["stoop1", "stoop2", "stoop3", "stoop4", "stoop5"];
/** a cell's edges in atlas px (every animal cell is packed with no inset) */
const cellPx = (u: UVRect): number => Math.round((u[2] - u[0]) * ATLAS_W);
const cellPxH = (u: UVRect): number => Math.round((u[3] - u[1]) * ATLAS_H);

// Every family is drawn at its hitbox on the turrets' scale (ironhideArt.ts,
// familyArt.ts), so nothing here overshoots: the stock cells and quads
// stand, the art sits at native size inside them.
if (ANIMAL_ART) {
  // ---- Starhart ----
  // the stag's T1-T3 keep the mech rig and its cells; the guns go (the
  // beams are drawn live off the held weapon, never off a sprite), the
  // hooves shuffle a stride sized to the body
  const hartMechArt = (k: UnitKind, i: number): MechArt =>
    ({ ...MECH_ART[k]!, guns: [], stride: HART_TIERS[i].stride * PX });
  MECH_ART.starhart1 = hartMechArt("starhart1", 0);
  MECH_ART.starhart2 = hartMechArt("starhart2", 1);
  MECH_ART.starhart3 = hartMechArt("starhart3", 2);
  // the T4 leaves the mech rig for the legged one, on the cells above; the
  // T5 was legged already and keeps its own caps and feet
  delete MECH_ART.starhart4;
  LEG_ART.starhart4 = {
    body: UV_STARHART4_BODY,
    base: UV_STARHART4_BASE,
    joint: UV_STARHART4_JOINT,
    baseJoint: UV_STARHART4_JOINT_BASE,
    foot: UV_STARHART4_FOOT,
    leg: UV_STARHART4_LEG_SEG,
    legBase: UV_STARHART4_LEG_BASE_SEG,
    legStroke: HART4.th * PX,
    legBaseStroke: HART4.sh * PX,
    guns: [],
    sprite: UNIT_SPRITE * 4,
    small: UNIT_SPRITE,
    sil: {
      body: UV_STARHART4_BODY_SIL,
      base: UV_STARHART4_BASE_SIL,
      joint: UV_STARHART4_JOINT_SIL,
      baseJoint: UV_STARHART4_JOINT_BASE_SIL,
      foot: UV_STARHART4_FOOT_SIL,
    },
  };
  LEG_ART.starhart5 = {
    ...LEG_ART.starhart5!,
    leg: UV_STARHART5_LEG_SEG,
    legBase: UV_STARHART5_LEG_BASE_SEG,
    legStroke: HART5.th * PX,
    legBaseStroke: HART5.sh * PX,
    sprite: UNIT_SPRITE * 4,
    small: UNIT_SPRITE * 2,
  };

  // ---- Ironhide ----
  // the rhino is drawn at its hitbox on the turrets' scale (ironhideArt.ts),
  // so nothing here overshoots: the stock cells and quads stand, the art
  // sits at native size inside them. T1-T3 keep the ground mechs' rig,
  // guns off (the horn is the barrel, drawn into the body), on a shuffle
  // sized to the body; T4 and T5 leave it for four stout planted legs
  const rhinoMechArt = (k: UnitKind, i: number): MechArt =>
    ({ ...MECH_ART[k]!, guns: [], stride: IRON_TIERS[i].stride * PX });
  MECH_ART.ironhide1 = rhinoMechArt("ironhide1", 0);
  MECH_ART.ironhide2 = rhinoMechArt("ironhide2", 1);
  MECH_ART.ironhide3 = rhinoMechArt("ironhide3", 2);
  delete MECH_ART.ironhide4;
  delete MECH_ART.ironhide5;
  LEG_ART.ironhide4 = {
    body: UV_IRONHIDE4_BODY,
    base: UV_IRONHIDE4_BASE,
    joint: UV_IRONHIDE4_JOINT,
    baseJoint: UV_IRONHIDE4_JOINT_BASE,
    foot: UV_IRONHIDE4_FOOT,
    leg: UV_IRONHIDE4_LEG_SEG,
    legBase: UV_IRONHIDE4_LEG_BASE_SEG,
    legStroke: IRON4.th * PX,
    legBaseStroke: IRON4.sh * PX,
    guns: [],
    sprite: UNIT_SPRITE * 4,
    small: UNIT_SPRITE,
    sil: {
      body: UV_IRONHIDE4_BODY_SIL,
      base: UV_IRONHIDE4_BASE_SIL,
      joint: UV_IRONHIDE4_JOINT_SIL,
      baseJoint: UV_IRONHIDE4_JOINT_BASE_SIL,
      foot: UV_IRONHIDE4_FOOT_SIL,
    },
  };
  LEG_ART.ironhide5 = {
    body: UV_IRONHIDE5_BODY,
    base: UV_IRONHIDE5_BASE,
    joint: UV_IRONHIDE5_JOINT,
    baseJoint: UV_IRONHIDE5_JOINT_BASE,
    foot: UV_IRONHIDE5_FOOT,
    leg: UV_IRONHIDE5_LEG_SEG,
    legBase: UV_IRONHIDE5_LEG_BASE_SEG,
    legStroke: IRON5.th * PX,
    legBaseStroke: IRON5.sh * PX,
    guns: [],
    sprite: UNIT_SPRITE * 4,
    small: UNIT_SPRITE * 2,
    sil: {
      body: UV_IRONHIDE5_BODY_SIL,
      base: UV_IRONHIDE5_BASE_SIL,
      joint: UV_IRONHIDE5_JOINT_SIL,
      baseJoint: UV_IRONHIDE5_JOINT_BASE_SIL,
      foot: UV_IRONHIDE5_FOOT_SIL,
    },
  };

  // ---- Dartback ----
  // the frog: the runt keeps the dartback1 mech's rig and cells (feet tucked,
  // guns off — the venom is drawn live, never off a sprite), dartback2 up
  // keep the venom line's legged rig on four short legs, with segments of
  // their own and NO CAPS at any tier — the shank's extension covers every
  // knee and the flank covers every mount, so the two cap passes would be
  // eight quads a body drawing nothing
  MECH_ART.dartback1 = { ...MECH_ART.dartback1!, guns: [], stride: FROG_TIERS[0].stride * PX };
  const frogLegArt = (k: UnitKind, i: number, parts: Omit<LegArt, "legStroke" | "legBaseStroke" | "guns" | "sprite" | "small">, cellScale: 1 | 2 | 4): void => {
    const T = FROG_TIERS[i];
    LEG_ART[k] = {
      ...parts,
      legStroke: T.th * PX,
      legBaseStroke: T.sh * PX,
      guns: [],
      sprite: UNIT_SPRITE * cellScale,
      small: UNIT_SPRITE * Math.max(1, cellScale / 2),
    };
  };
  frogLegArt("dartback2", 1, {
    body: UV_DARTBACK2_BODY, base: UV_DARTBACK2_BASE, foot: UV_DARTBACK2_FOOT, leg: UV_DARTBACK2_LEG_SEG, legBase: UV_DARTBACK2_LEG_BASE_SEG,
    sil: { body: UV_DARTBACK2_BODY_SIL, base: UV_DARTBACK2_BASE_SIL, foot: UV_DARTBACK2_FOOT_SIL },
  }, 2);
  frogLegArt("dartback3", 2, {
    body: UV_DARTBACK3_BODY, foot: UV_DARTBACK3_FOOT, leg: UV_DARTBACK3_LEG_SEG, legBase: UV_DARTBACK3_LEG_BASE_SEG,
    sil: { body: UV_DARTBACK3_BODY_SIL, foot: UV_DARTBACK3_FOOT_SIL },
  }, 2);
  frogLegArt("dartback4", 3, {
    body: UV_DARTBACK4_BODY, foot: UV_DARTBACK4_FOOT, leg: UV_DARTBACK4_LEG_SEG, legBase: UV_DARTBACK4_LEG_BASE_SEG,
    sil: { body: UV_DARTBACK4_BODY_SIL, foot: UV_DARTBACK4_FOOT_SIL },
  }, 4);
  // ---- Stoop, Skate, Livewire ----
  // the bat, the manta and the narwhal on the wing rig — and the boss
  // below them — each on its own kind's cells; the hulls' engines go
  // (neither has jets), the wake stays, and the bat keeps its jet.
  //
  // `scl` is the world px per native px, 1 everywhere but the boss, whose
  // quads AND offsets both ride BOSS_SCALE: a root scaled differently from
  // the wing hanging off it puts the wing through the body
  const wingPart = (k: UnitKind, T: FlyerTier, cells: readonly [UVRect, UVRect], g: StoopGeom, jets: boolean, scl = 1): void => {
    const [body, wing] = cells;
    const px = PX * scl;
    FLYER_PARTS[k] = {
      body,
      wing,
      sprite: cellPx(body) * px,
      spriteH: cellPxH(body) * px,
      wingSprite: cellPx(wing) * px,
      rootX: g.rootX * px,
      rootY: g.rootY * px,
      wingX: g.wingX * px,
      wingY: g.wingY * px,
      fold: T.fold,
      sweep: T.sweep,
      rate: T.rate,
    };
    if (!jets) delete UNIT_ENGINES[k];
  };
  const wingParts = (kinds: readonly UnitKind[], tiers: readonly FlyerTier[], cells: readonly (readonly [UVRect, UVRect])[], geom: (T: FlyerTier) => StoopGeom, jets: boolean): void =>
    tiers.forEach((T, i) => wingPart(kinds[i], T, cells[i], geom(T), jets));
  wingParts(STOOP_KINDS, STOOP_TIERS, UV_STOOP_CELLS, stoopGeom, true);
  wingParts(MANTA_KINDS, MANTA_TIERS, UV_MANTA_CELLS, mantaGeom, false);
  wingParts(NARWHAL_KINDS, NARWHAL_TIERS, UV_NARWHAL_CELLS, narwhalGeom, false);
  // ---- the Kettles ----
  // the vulture on the same rig, on cells of its own. NO JETS: a kettle
  // is a bird and the thing keeping it up is the beat, the same call the
  // Sovereign makes below — and there is nothing to delete either way,
  // since a kind with no upstream hull was never in UNIT_ENGINES
  wingParts(KETTLE_KINDS, KETTLE_TIERS, UV_KETTLE_CELLS, kettleGeom, false);
  // ---- the Whales ----
  // the humpback on the same rig, WITH JETS: the rocket pods are what
  // keep it up, and the flames burn in the family's frost
  wingParts(WHALE_KINDS, WHALE_TIERS, UV_WHALE_CELLS, whaleGeom, true);
  // ---- the Sovereign ----
  // the boss on the same rig, on cells of its own and at the boss's own
  // scale. Its ENGINES GO: the disrupt's two mirrored pairs of jets were
  // an Erekir missile bomber's, and what is there now is a bird — the
  // thing that keeps it in the air is the beat
  wingPart("boss", KING_TIER, [KING_CELLS.body, KING_CELLS.wing], kingGeom(), false, BOSS_SCALE);
  frogLegArt("dartback5", 4, {
    body: UV_DARTBACK5_BODY, foot: UV_DARTBACK5_FOOT, leg: UV_DARTBACK5_LEG_SEG, legBase: UV_DARTBACK5_LEG_BASE_SEG,
    sil: { body: UV_DARTBACK5_BODY_SIL, foot: UV_DARTBACK5_FOOT_SIL },
  }, 4);

  // ---- Tusker ----
  // the elephant, on the two ground rigs and on cells of its own: the
  // runt, the brute and the elite keep their legs tucked under the mech
  // rig (a base plate, a body, one sprite of near-side pads slid by the
  // walk), and the champion and the apex open their stance onto four
  // planted pillars. No gun quads at any tier — the tusks are drawn into
  // the body, the way the rhino's horn is, because they ARE the weapon.
  //
  // THE LUMBER IS THE POINT OF THE SWAY NUMBERS. mechFrontSway climbs to
  // fifteen times stock by the T3 on a body that walks at 2.6 tiles a
  // second: the heaviest walker on the field pitches onto each pad
  // instead of striding over it
  const tuskMechArt = (c: typeof TUSK1_CELLS, T: IronTier, cellScale: 1 | 2, sway: number): MechArt => ({
    leg: c.leg,
    base: c.base,
    body: c.body,
    guns: [],
    stride: T.stride * PX,
    frontSway: sway * MU,
    sprite: UNIT_SPRITE * cellScale,
    sil: { leg: c.legSil, base: c.baseSil, body: c.bodySil },
  });
  MECH_ART.tusker1 = tuskMechArt(TUSK1_CELLS, TUSK1, 1, 0.9);
  MECH_ART.tusker2 = tuskMechArt(TUSK2_CELLS, TUSK2, 2, 1.2);
  MECH_ART.tusker3 = tuskMechArt(TUSK3_CELLS, TUSK3, 2, 1.5);
  const tuskLegArt = (k: UnitKind, c: typeof TUSK4_CELLS, T: IronTier, smallScale: 1 | 2): void => {
    LEG_ART[k] = {
      body: c.body,
      base: c.base,
      joint: c.joint,
      baseJoint: c.baseJoint,
      foot: c.foot,
      leg: c.leg,
      legBase: c.legBase,
      legStroke: T.th * PX,
      legBaseStroke: T.sh * PX,
      guns: [],
      sprite: UNIT_SPRITE * 4,
      small: UNIT_SPRITE * smallScale,
      sil: { body: c.bodySil, base: c.baseSil, joint: c.jointSil, baseJoint: c.baseJointSil, foot: c.footSil },
    };
  };
  tuskLegArt("tusker4", TUSK4_CELLS, TUSK4, 1);
  tuskLegArt("tusker5", TUSK5_CELLS, TUSK5, 2);

  // ---- Grapnels ----
  // the starfish on the mech rig at every tier, and what slides with the
  // walk is THE ARMS: the rig's leg cell holds one side's pair and the
  // renderer rows them fore and aft against their mirror image, which is
  // this family's whole gait (grapnelArt.ts). No guns — the star volley
  // is drawn live as shots in flight, never off a sprite — and the swing
  // shortens an arm a TENTH rather than the mech's half (legLift): an arm
  // lying flat on the ground reaches, it does not step over anything.
  const sfMechArt = (c: typeof SF1_CELLS, T: IronTier, cellScale: 1 | 2 | 4): MechArt => ({
    leg: c.leg,
    base: c.base,
    body: c.body,
    guns: [],
    stride: T.stride * PX,
    legLift: 0.1,
    sprite: UNIT_SPRITE * cellScale,
    sil: { leg: c.legSil, base: c.baseSil, body: c.bodySil },
  });
  MECH_ART.grapnel1 = sfMechArt(SF1_CELLS, GRAPNEL_TIERS[0], 1);
  MECH_ART.grapnel2 = sfMechArt(SF2_CELLS, GRAPNEL_TIERS[1], 1);
  MECH_ART.grapnel3 = sfMechArt(SF3_CELLS, GRAPNEL_TIERS[2], 2);
  MECH_ART.grapnel4 = sfMechArt(SF4_CELLS, GRAPNEL_TIERS[3], 2);
  MECH_ART.grapnel5 = sfMechArt(SF5_CELLS, GRAPNEL_TIERS[4], 4);

  // ---- Ratkings ----
  // the rat king on the mech rig at every tier: the knot's near-side feet
  // slide with the walk, nothing else moves, and no guns — the bite is
  // melee (weapons.ts)
  const rkMechArt = (c: (typeof RK_CELLS)[number], T: IronTier, cellScale: number): MechArt => ({
    leg: c.leg,
    base: c.base,
    body: c.body,
    guns: [],
    stride: T.stride * PX,
    sprite: UNIT_SPRITE * cellScale,
    sil: { leg: c.legSil, base: c.baseSil, body: c.bodySil },
  });
  [1, 1, 2, 2, 3].forEach((scale, i) => {
    MECH_ART[`ratking${i + 1}` as UnitKind] = rkMechArt(RK_CELLS[i], RATKING_TIERS[i], scale);
  });

  // ---- the siege: the railgun, and the two Pylons on its rig ----
  // the mech rig again, and the RAILGUN'S STRIDE IS ZERO (wardenArt.ts
  // WardenTier): the rig draws its anchors where the legs go and the
  // renderer swings them by nothing, which is what a machine bolted to the
  // ground looks like from above. Nothing here carries a gun sprite — the
  // barrel and the emitter are part of the body, because neither of them
  // is on a mount that turns independently of the hull
  const wardenMechArt = (c: typeof RAZE_CELLS, T: WardenTier, cell = 128): MechArt => ({
    leg: c.leg,
    base: c.base,
    body: c.body,
    guns: [],
    stride: T.stride * PX,
    sprite: (UNIT_SPRITE * cell) / 64,
    sil: { leg: c.sil.leg, base: c.sil.base, body: c.sil.body },
  });
  // the plate under it is a turret's and is laid square to the grid, not
  // on the gun's heading (MechArt.flatBase)
  MECH_ART.railgun = { ...wardenMechArt(RAZE_CELLS, RAZE_TIER, 192), flatBase: true };
  MECH_ART.goad = wardenMechArt(GOAD_CELLS, GOAD_TIER);
  MECH_ART.bastion = wardenMechArt(BASTION_CELLS, BASTION_TIER);
  // the plate is laid square and the hull turns onto the cart (Sim.pickConvoyAim)
  MECH_ART.brander = { ...wardenMechArt(BRANDER_CELLS, BRANDER_TIER), flatBase: true };
  FABRICATOR_CELLS.forEach((c, i) => {
    MECH_ART[c.kind] = wardenMechArt(c, FABRICATOR_TIERS[i], FABRICATOR_CELL_PX[i]);
  });
  MECH_ART.lance = wardenMechArt(LANCE_CELLS, LANCE_TIER);
  MECH_ART.bulwark = wardenMechArt(BULWARK_CELLS, BULWARK_TIER);
  MECH_ART.halberd = wardenMechArt(HALBERD_CELLS, HALBERD_TIER, 192);
  MECH_ART.juggernaut = wardenMechArt(JUGGERNAUT_CELLS, JUGGERNAUT_TIER, 256);
}

const ENV = "/stock/sprites/blocks/environment";
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
  ironhide1Base: "/stock/sprites/units/dagger-base.png",
  ironhide1: "/stock/sprites/units/dagger.png",
  ironhide1Leg: "/stock/sprites/units/dagger-leg.png",
  ironhide2Base: "/stock/sprites/units/mace-base.png",
  ironhide2: "/stock/sprites/units/mace.png",
  ironhide2Leg: "/stock/sprites/units/mace-leg.png",
  dartback2: "/stock/sprites/units/atrax.png",
  dartback2Base: "/stock/sprites/units/atrax-base.png",
  dartback2Leg: "/stock/sprites/units/atrax-leg.png",
  dartback2LegBase: "/stock/sprites/units/atrax-leg-base.png",
  dartback2Joint: "/stock/sprites/units/atrax-joint.png",
  dartback2Foot: "/stock/sprites/units/atrax-foot.png",
  dartback2Weapon: "/stock/sprites/units/weapons/atrax-weapon.png",
  dartback3: "/stock/sprites/units/spiroct.png",
  dartback3Leg: "/stock/sprites/units/spiroct-leg.png",
  dartback3LegBase: "/stock/sprites/units/spiroct-leg-base.png",
  dartback3Joint: "/stock/sprites/units/spiroct-joint.png",
  dartback3Foot: "/stock/sprites/units/spiroct-foot.png",
  dartback3Weapon: "/stock/sprites/units/weapons/spiroct-weapon.png",
  dartback3Mount: "/stock/sprites/units/weapons/mount-purple-weapon.png",
  dartback1Base: "/stock/sprites/units/crawler-base.png",
  dartback1: "/stock/sprites/units/crawler.png",
  dartback1Leg: "/stock/sprites/units/crawler-leg.png",
  ironhide3Base: "/stock/sprites/units/fortress-base.png",
  ironhide3: "/stock/sprites/units/fortress.png",
  ironhide3Leg: "/stock/sprites/units/fortress-leg.png",
  stoop1: "/stock/sprites/units/flare.png",
  stoop2: "/stock/sprites/units/horizon.png",
  stoop3: "/stock/sprites/units/zenith.png",
  largeWeapon: "/stock/sprites/units/weapons/large-weapon.png",
  flamethrower: "/stock/sprites/units/weapons/flamethrower.png",
  artillery: "/stock/sprites/units/weapons/artillery.png",
  starhart1: "/stock/sprites/units/nova.png",
  starhart1Base: "/stock/sprites/units/nova-base.png",
  starhart1Leg: "/stock/sprites/units/nova-leg.png",
  healWeapon: "/stock/sprites/units/weapons/heal-weapon.png",
  starhart2: "/stock/sprites/units/pulsar.png",
  starhart2Base: "/stock/sprites/units/pulsar-base.png",
  starhart2Leg: "/stock/sprites/units/pulsar-leg.png",
  healShotgun: "/stock/sprites/units/weapons/heal-shotgun-weapon.png",
  starhart3: "/stock/sprites/units/quasar.png",
  starhart3Base: "/stock/sprites/units/quasar-base.png",
  starhart3Leg: "/stock/sprites/units/quasar-leg.png",
  beamWeapon: "/stock/sprites/units/weapons/beam-weapon.png",
  ironhide4: "/stock/sprites/units/scepter.png",
  ironhide4Base: "/stock/sprites/units/scepter-base.png",
  ironhide4Leg: "/stock/sprites/units/scepter-leg.png",
  ironhide4Weapon: "/stock/sprites/units/weapons/scepter-weapon.png",
  ironhide4Mount: "/stock/sprites/units/weapons/scepter-mount.png",
  starhart4: "/stock/sprites/units/vela.png",
  starhart4Base: "/stock/sprites/units/vela-base.png",
  starhart4Leg: "/stock/sprites/units/vela-leg.png",
  repairBeam: "/stock/sprites/units/weapons/repair-beam-weapon-center-large.png",
  dartback4: "/stock/sprites/units/arkyid.png",
  dartback4Foot: "/stock/sprites/units/arkyid-foot.png",
  dartback4JointBase: "/stock/sprites/units/arkyid-joint-base.png",
  dartback4Leg: "/stock/sprites/units/arkyid-leg.png",
  dartback4LegBase: "/stock/sprites/units/arkyid-leg-base.png",
  purpleMount: "/stock/sprites/units/weapons/large-purple-mount.png",
  stoop4: "/stock/sprites/units/antumbra.png",
  boss: "/stock/sprites/units/disrupt.png",
  ironhide5: "/stock/sprites/units/reign.png",
  ironhide5Base: "/stock/sprites/units/reign-base.png",
  ironhide5Leg: "/stock/sprites/units/reign-leg.png",
  ironhide5Weapon: "/stock/sprites/units/weapons/reign-weapon.png",
  starhart5: "/stock/sprites/units/corvus.png",
  starhart5Base: "/stock/sprites/units/corvus-base.png",
  starhart5Leg: "/stock/sprites/units/corvus-leg.png",
  starhart5LegBase: "/stock/sprites/units/corvus-leg-base.png",
  starhart5Joint: "/stock/sprites/units/corvus-joint.png",
  starhart5JointBase: "/stock/sprites/units/corvus-joint-base.png",
  starhart5Foot: "/stock/sprites/units/corvus-foot.png",
  dartback5: "/stock/sprites/units/toxopid.png",
  dartback5Leg: "/stock/sprites/units/toxopid-leg.png",
  dartback5LegBase: "/stock/sprites/units/toxopid-leg-base.png",
  dartback5JointBase: "/stock/sprites/units/toxopid-joint-base.png",
  dartback5Foot: "/stock/sprites/units/toxopid-foot.png",
  dartback5Cannon: "/stock/sprites/units/weapons/toxopid-cannon.png",
  stoop5: "/stock/sprites/units/eclipse.png",
  // the naval tanks. Each is a single hull sprite — the naval types' own
  // weapons all sit on turret mounts Mindustry draws from the weapon
  // sheets, and a hull with no assembled parts needs none of them here
  skate1: "/stock/sprites/units/risso.png",
  skate2: "/stock/sprites/units/minke.png",
  skate3: "/stock/sprites/units/bryde.png",
  skate4: "/stock/sprites/units/sei.png",
  skate5: "/stock/sprites/units/omura.png",
  livewire1: "/stock/sprites/units/retusa.png",
  livewire2: "/stock/sprites/units/oxynoe.png",
  livewire3: "/stock/sprites/units/cyerce.png",
  livewire4: "/stock/sprites/units/aegires.png",
  livewire5: "/stock/sprites/units/navanax.png",
  // FOUNDRY (foundryArt.ts): the hand-authored heads and core, the art
  // this game actually draws, loaded like any other sprite
  foundryCore: FOUNDRY_CORE_URL,
  foundryBase1: FOUNDRY_BASE_URLS[0],
  foundryBase2: FOUNDRY_BASE_URLS[1],
  foundryBase3: FOUNDRY_BASE_URLS[2],
  foundryBase4: FOUNDRY_BASE_URLS[3],
  foundryTacker: FOUNDRY_HEAD_URLS.tacker!,
  foundryLobber: FOUNDRY_HEAD_URLS.lobber!,
  foundryTorch: FOUNDRY_HEAD_URLS.torch!,
  foundryCoil: FOUNDRY_HEAD_URLS.coil!,
  foundryAutocannon: FOUNDRY_HEAD_URLS.autocannon!,
  foundryAirburst: FOUNDRY_HEAD_URLS.airburst!,
  foundryPiercer: FOUNDRY_HEAD_URLS.piercer!,
  foundryDouser: FOUNDRY_HEAD_URLS.douser!,
  foundryTether: FOUNDRY_HEAD_URLS.tether!,
  foundryHive: FOUNDRY_HEAD_URLS.hive!,
  foundryCleaver: FOUNDRY_HEAD_URLS.cleaver!,
  foundryBarrage: FOUNDRY_HEAD_URLS.barrage!,
  foundryDeluge: FOUNDRY_HEAD_URLS.deluge!,
  foundryWhirl: FOUNDRY_HEAD_URLS.whirl!,
  foundryRepeater: FOUNDRY_HEAD_URLS.repeater!,
  foundryFurnace: FOUNDRY_HEAD_URLS.furnace!,
  foundryRailhead: FOUNDRY_HEAD_URLS.railhead!,
  foundryDuster: FOUNDRY_HEAD_URLS.duster!,
  foundryBlighter: FOUNDRY_HEAD_URLS.blighter!,
  foundryDrifter: FOUNDRY_HEAD_URLS.drifter!,
  foundryStinger: FOUNDRY_HEAD_URLS.stinger!,
  spawnPad: `${ENV}/dark-panel-2.png`,
  towerBase: "/stock/sprites/blocks/turrets/bases/block-2.png",
  towerBase1: "/stock/sprites/blocks/turrets/bases/block-1.png",
  towerBase3: "/stock/sprites/blocks/turrets/bases/block-3.png",
  tackerPreview: "/stock/sprites/blocks/turrets/duo/duo-preview.png",
  lobber: "/stock/sprites/blocks/turrets/hail.png",
  autocannonPreview: "/stock/sprites/blocks/turrets/salvo/salvo-preview.png",
  airburstPreview: "/stock/sprites/blocks/turrets/scatter/scatter-preview.png",
  cleaver: "/stock/sprites/blocks/turrets/fuse.png",
  torch: "/stock/sprites/blocks/turrets/scorch.png",
  coil: "/stock/sprites/blocks/turrets/arc.png",
  piercer: "/stock/sprites/blocks/turrets/lancer.png",
  barrage: "/stock/sprites/blocks/turrets/ripple.png",
  // the liquid turrets ship in three layers apiece: the turret art, the
  // liquid window (a white mask, tinted at pack time), and the specular
  // gleam drawn untinted over the water — see liquidTurret()
  douser: "/stock/sprites/blocks/turrets/wave.png",
  douserLiquid: "/stock/sprites/blocks/turrets/wave-liquid.png",
  douserTop: "/stock/sprites/blocks/turrets/wave-top.png",
  deluge: "/stock/sprites/blocks/turrets/tsunami.png",
  delugeLiquid: "/stock/sprites/blocks/turrets/tsunami-liquid.png",
  delugeTop: "/stock/sprites/blocks/turrets/tsunami-top.png",
  // tether is filed under defense, not turrets — upstream it damages
  // almost nothing and Mindustry classes it with the support blocks (ours
  // spools up into a real gun; the sprite still lives where Mindustry
  // packs it)
  tether: "/stock/sprites/blocks/defense/parallax.png",
  // the support pair, each in the two layers DrawDefault + DrawRegion lays
  // down: the block and the `-top` crystal over it (see mendBlock)
  fixer: "/stock/sprites/blocks/defense/mender.png",
  fixerTop: "/stock/sprites/blocks/defense/mender-top.png",
  restorer: "/stock/sprites/blocks/defense/mend-projector.png",
  restorerTop: "/stock/sprites/blocks/defense/mend-projector-top.png",
  // the shield tower wears the force projector's art — the one Mindustry
  // block whose whole job is standing a dome, which is this structure's too
  shieldTower: "/stock/sprites/blocks/defense/force-projector.png",
  towerBase4: "/stock/sprites/blocks/turrets/bases/block-4.png",
  hive: "/stock/sprites/blocks/turrets/swarmer.png",
  // whirl's own art is the bare head; its three barrels are separate
  // sprites the preview already has assembled underneath
  whirlPreview: "/stock/sprites/blocks/turrets/cyclone/cyclone-preview.png",
  repeater: "/stock/sprites/blocks/turrets/spectre.png",
  furnace: "/stock/sprites/blocks/turrets/meltdown.png",
  railhead: "/stock/sprites/blocks/turrets/foreshadow.png",
  // the walls, 1x1 block art at Mindustry's 32px
  // ...and the 2x2 large walls, 64px block art
  tetherLaser: "/stock/sprites/effects/parallax-laser.png",
  tetherLaserEnd: "/stock/sprites/effects/parallax-laser-end.png",
  base: "/stock/sprites/blocks/storage/core-nucleus.png",
  baseTeam: "/stock/sprites/blocks/storage/core-nucleus-team.png",
  // the sap beam's line and cap (see UV_LASER)
  laser: "/stock/sprites/effects/laser.png",
  laserEnd: "/stock/sprites/effects/laser-end.png",
  // THE TEAM CELLS: every unit's `-cell` region, the part of its hull
  // Mindustry paints in the owning team's colour (UnitType.drawCell). The
  // ironhide1 and the stoop1 have none of their own and fall back to
  // power-cell, exactly as UnitType.load does
  powerCell: "/stock/sprites/units/power-cell.png",
  ironhide2Cell: "/stock/sprites/units/mace-cell.png",
  ironhide3Cell: "/stock/sprites/units/fortress-cell.png",
  ironhide4Cell: "/stock/sprites/units/scepter-cell.png",
  ironhide5Cell: "/stock/sprites/units/reign-cell.png",
  dartback1Cell: "/stock/sprites/units/crawler-cell.png",
  dartback2Cell: "/stock/sprites/units/atrax-cell.png",
  dartback3Cell: "/stock/sprites/units/spiroct-cell.png",
  dartback4Cell: "/stock/sprites/units/arkyid-cell.png",
  dartback5Cell: "/stock/sprites/units/toxopid-cell.png",
  starhart1Cell: "/stock/sprites/units/nova-cell.png",
  starhart2Cell: "/stock/sprites/units/pulsar-cell.png",
  starhart3Cell: "/stock/sprites/units/quasar-cell.png",
  starhart4Cell: "/stock/sprites/units/vela-cell.png",
  starhart5Cell: "/stock/sprites/units/corvus-cell.png",
  stoop2Cell: "/stock/sprites/units/horizon-cell.png",
  stoop3Cell: "/stock/sprites/units/zenith-cell.png",
  stoop4Cell: "/stock/sprites/units/antumbra-cell.png",
  stoop5Cell: "/stock/sprites/units/eclipse-cell.png",
  bossCell: "/stock/sprites/units/disrupt-cell.png",
  harpoon1Cell: "/stock/sprites/units/risso-cell.png",
  harpoon2Cell: "/stock/sprites/units/minke-cell.png",
  harpoon3Cell: "/stock/sprites/units/bryde-cell.png",
  harpoon4Cell: "/stock/sprites/units/sei-cell.png",
  harpoon5Cell: "/stock/sprites/units/omura-cell.png",
  wraith1Cell: "/stock/sprites/units/retusa-cell.png",
  wraith2Cell: "/stock/sprites/units/oxynoe-cell.png",
  wraith3Cell: "/stock/sprites/units/cyerce-cell.png",
  wraith4Cell: "/stock/sprites/units/aegires-cell.png",
  wraith5Cell: "/stock/sprites/units/navanax-cell.png",
} as const;

// Mindustry's sharded (player) team color — the team overlay multiplies by it
const TEAM_COLOR = "#ffd37f";

type SpriteKey = keyof typeof SPRITES;
/** the sprite keys that are Foundry heads (foundryArt.ts) */
type FoundryKey = Extract<SpriteKey, `foundry${string}`>;

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
 * regions on the same point, whatever their sizes (a skate1's cell is
 * packed on a 96px square around a 70x78 hull, and an ironhide1's is 56px of
 * power-cell over a 48px body, clipped by it).
 *
 * IT USED TO BE BAKED INTO THE HULL in the swarm's red, which was the
 * whole team read and cost nothing — right up until the player got bodies
 * of their own out of the factories. The two sides draw from ONE set of
 * sprites, so a baked cell made every ironhide1 on the field the swarm's.
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
 * `-top` crystal laid over it, which is all Mindustry's Restorer draws
 * beyond the pulse itself. The top is NOT outlined — it sits inside the
 * block's own silhouette, and outlining it would draw a black ring in the
 * middle of the sprite.
 */
// the bullet pairs: a capsule, round nose up and flat tail, the back a
// rim wider and longer aft, drawn at 52 for `bullet` and scaled to 36 for
// `shell` and `missile`; the missile's back grows two fins. See
// docs/bullet-concepts.html for the choice
function boltBullet(back: boolean, S = 52, fins = false): HTMLCanvasElement {
  const cv = document.createElement("canvas");
  cv.width = cv.height = S;
  const c = cv.getContext("2d");
  if (!c) throw new Error("2d context unavailable for the bullet round");
  c.scale(S / 52, S / 52);
  const b = back ? 2.5 : 0;
  const x0 = 16 - b, x1 = 36 + b, y0 = 8 - b, y1 = 42 + b + (back ? 3 : 0);
  const rn = 10 + b, rt = 4 + b;
  c.fillStyle = "#ffffff";
  c.beginPath();
  c.moveTo(x0, y0 + rn);
  c.arc(26, y0 + rn, rn, Math.PI, 0);
  c.lineTo(x1, y1 - rt);
  c.arcTo(x1, y1, x1 - rt, y1, rt);
  c.lineTo(x0 + rt, y1);
  c.arcTo(x0, y1, x0, y1 - rt, rt);
  c.closePath();
  c.fill();
  if (fins && back) {
    c.beginPath();
    c.moveTo(x0, y1 - 14); c.lineTo(x0 - 8, y1 + 1); c.lineTo(x0, y1 + 1);
    c.moveTo(x1, y1 - 14); c.lineTo(x1 + 8, y1 + 1); c.lineTo(x1, y1 + 1);
    c.closePath();
    c.fill();
  }
  return cv;
}

// livewire5's emp round: a disc, the back half again as wide
function discRound(back: boolean): HTMLCanvasElement {
  const S = 48;
  const cv = document.createElement("canvas");
  cv.width = cv.height = S;
  const c = cv.getContext("2d");
  if (!c) throw new Error("2d context unavailable for the emp round");
  c.fillStyle = "#ffffff";
  c.beginPath();
  c.arc(24, 24, back ? 22 : 15, 0, Math.PI * 2);
  c.fill();
  return cv;
}

// the boss's missile unit, 39x60 nose up in the Sovereign's materials
// (kingArt.ts): plume body, gilt fins, ember nose. Coloured, not tinted
function bossMissileArt(): HTMLCanvasElement {
  const cv = document.createElement("canvas");
  cv.width = 39;
  cv.height = 60;
  const c = cv.getContext("2d");
  if (!c) throw new Error("2d context unavailable for the boss missile");
  const x0 = 11, x1 = 28, y0 = 4, y1 = 52, rn = 8.5, rt = 3;
  c.fillStyle = GILT[1];
  c.beginPath();
  c.moveTo(x0, 36); c.lineTo(4, 56); c.lineTo(x0, 56);
  c.moveTo(x1, 36); c.lineTo(35, 56); c.lineTo(x1, 56);
  c.closePath();
  c.fill();
  c.beginPath();
  c.moveTo(x0, y0 + rn);
  c.arc(19.5, y0 + rn, rn, Math.PI, 0);
  c.lineTo(x1, y1 - rt);
  c.arcTo(x1, y1, x1 - rt, y1, rt);
  c.lineTo(x0 + rt, y1);
  c.arcTo(x0, y1, x0, y1 - rt, rt);
  c.closePath();
  c.fillStyle = PLUME[1];
  c.fill();
  c.save();
  c.clip();
  c.fillStyle = PLUME[0];
  c.fillRect(17, 18, 5, 34);
  c.fillStyle = EMBER[1];
  c.fillRect(0, 0, 39, 15);
  c.fillStyle = EMBER[0];
  c.fillRect(0, 14, 39, 4);
  c.restore();
  return cv;
}

/**
 * THE TOXIN LINE'S ROUND, drawn rather than loaded: a gas canister, nose
 * up like every bullet source, white for the two tint passes that draw it
 * (BasicBulletType.draw lays `back` under `front` on one rect).
 *
 * WHAT MAKES IT READ AS A CANISTER AND NOT A BULLET is the two things a
 * bullet has not got: a nozzle standing off the nose, and a STRAP cut
 * clean through the front shape at the waist, so the back colour shows
 * through it as a dark band. A hole, not a second sprite — the pair is
 * two regions and the rim between them is the whole of the shading.
 */
function canisterBullet(back: boolean): HTMLCanvasElement {
  const S = 36;
  const cv = document.createElement("canvas");
  cv.width = cv.height = S;
  const c = cv.getContext("2d");
  if (!c) throw new Error("2d context unavailable for the canister round");
  c.imageSmoothingEnabled = false;
  c.fillStyle = "#ffffff";
  // the back silhouette is the longer of the two by three px all round,
  // which is the rim Mindustry's own pairs show fore and aft
  const b = back ? 3 : 0;
  const rr = (x0: number, y0: number, x1: number, y1: number, r: number): void => {
    c.beginPath();
    c.moveTo(x0 + r, y0);
    c.arcTo(x1, y0, x1, y1, r);
    c.arcTo(x1, y1, x0, y1, r);
    c.arcTo(x0, y1, x0, y0, r);
    c.arcTo(x0, y0, x1, y0, r);
    c.closePath();
    c.fill();
  };
  rr(11 - b, 9 - b, 25 + b, 29 + b, 5 + b);   // the drum
  c.fillRect(15 - b, 4 - b, 6 + b * 2, 8);    // the nozzle off its nose
  c.fillRect(13 - b, 27, 10 + b * 2, 3 + b);  // the foot at the tail
  if (!back) {
    // the strap, cut through to the round's dark half
    c.globalCompositeOperation = "destination-out";
    c.fillRect(10, 17, 16, 3);
    c.globalCompositeOperation = "source-over";
  }
  return cv;
}


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
 * (within 1/255 rounding) against the game's own generated ironhide1 sprite.
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
 * THE HUD'S PICTURE OF ONE TURRET KIND: the Foundry head (turretArt.ts)
 * through the same outline + antialias pass the sheet gives it, or the
 * stock sprite by the path turretIcon takes — so the bar, the card, the
 * inspector and the progress screen show the head the board builds.
 */
export async function towerIcon(kind: TowerKind): Promise<string> {
  const head = FOUNDRY_ART ? foundryHeadUrl(kind) : null;
  return turretIcon(head ?? TOWER_ICONS[kind]);
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
 * thumbnail loaded straight from /stock/sprites/units was none of
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
  return (await carveUnit(kind, accent, true)).url;
}

/**
 * THE SAME BODY, AS THE BOARD DRAWS IT: the whole cell, uncropped, still
 * facing +x the way the sheet holds it. `size` is the cell's edge in sheet
 * px, and the renderer stretches exactly that square to UNIT_ART[kind]
 * `sprite` world px — so a caller that knows both can lay a world-px
 * measurement over the picture and have it land where it lands in the
 * game. That is what the admin Hitboxes tab does, and it is why this one
 * keeps the margin that `unitIcon` trims: crop the art and the frame the
 * hitbox is measured in is gone with it.
 */
export async function unitQuad(
  kind: UnitKind,
  accent: readonly [number, number, number],
): Promise<{ url: string; size: number }> {
  return carveUnit(kind, accent, false);
}

/**
 * ANY PACKED CELL AS A DATA URL — a turret's plate, a drawn head,
 * whatever else a panel wants a picture of. Some cells are DRAWN into the
 * sheet at pack time, and for those this is the only honest source.
 */
export async function cellIcon(
  uv: readonly [number, number, number, number],
  upright = false,
): Promise<string> {
  const sheet = await buildAtlas();
  const x = Math.round(uv[0] * ATLAS_W), y = Math.round(uv[1] * ATLAS_H);
  const w = Math.round((uv[2] - uv[0]) * ATLAS_W);
  const h = Math.round((uv[3] - uv[1]) * ATLAS_H);
  const out = document.createElement("canvas");
  out.width = upright ? h : w;
  out.height = upright ? w : h;
  const c = out.getContext("2d");
  if (!c) throw new Error("2d context unavailable for a cell icon");
  c.imageSmoothingEnabled = false;
  // A CELL IS PACKED FACING +X and a PICTURE of one is read facing up, so
  // an upright icon undoes the quarter turn the packer put in (the same
  // undoing unitIcon does for a body)
  if (upright) {
    c.translate(h / 2, w / 2);
    c.rotate(-Math.PI / 2);
    c.drawImage(sheet, x, y, w, h, -w / 2, -h / 2, w, h);
  } else c.drawImage(sheet, x, y, w, h, 0, 0, w, h);
  return out.toDataURL();
}

async function carveUnit(
  kind: UnitKind,
  accent: readonly [number, number, number],
  upright: boolean,
): Promise<{ url: string; size: number }> {
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
  // a mech-rigged body is its whole rig on the board, and every part rides
  // the same quad (Renderer.pushMech): the legs, both sides, the base,
  // then the body over them — a starfish's body cell alone is a disc
  const rig = MECH_ART[kind];
  if (rig) {
    const part = (uv: UVRect, flip: boolean): void => {
      const px = Math.round(uv[0] * ATLAS_W), py = Math.round(uv[1] * ATLAS_H);
      const pw = Math.round((uv[2] - uv[0]) * ATLAS_W), ph = Math.round((uv[3] - uv[1]) * ATLAS_H);
      fc.save();
      if (flip) {
        fc.translate(0, size);
        fc.scale(1, -1);
      }
      fc.drawImage(sheet, px, py, pw, ph, 0, 0, size, size);
      fc.restore();
    };
    part(rig.leg, false);
    part(rig.leg, true);
    part(rig.base, false);
  }
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

  // the board's own frame, for a caller that wants to measure against it
  if (!upright) return { url: flat.toDataURL(), size };

  // and the quarter turn back, so the body points up the way the sprite
  // files it was composited from do — CROPPED TO WHAT IT COVERS on the
  // way, because a sheet cell is bigger than the art in it by a different
  // margin for every kind (a stoop1's 48px body sits in a 64px cell, a
  // skate1's in a 128) and the HUD scales an icon to a fixed square. Left
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
  return { url: out.toDataURL(), size };
}

// ---------------------------------------------------------------------
// DRAWING INTO A CELL — the only way paint reaches the sheet
// ---------------------------------------------------------------------

/**
 * A source into its cell, the way the cell was declared: stretched to
 * fill it, or at its native size centred in it; as authored, or turned
 * a quarter turn clockwise so Mindustry's up-facing sprites face +x.
 * The context is CLIPPED to the cell first, so nothing a draw does can
 * land on a neighbour — an overhang (starhart2's 68px body in a 64 cell,
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
 * THE CROSSER INTO THE SHEET (game/wormArt.ts) — three cells nobody else
 * owns, drawn at native size through the same antialias pass every sprite
 * file goes through, and turned the same quarter turn so an up-facing
 * drawing faces +x like the rest of the sheet.
 *
 * IT IS NOT BEHIND ANIMAL_ART. That switch is the animal trial: with it
 * off, every family it covers falls back to a Mindustry sprite that
 * really is on disk. There is no Mindustry sprite of a boring machine, so
 * a Borer behind the switch would be a mission with three empty quads in
 * it. It packs either way, which is also why it has no silhouette and no
 * team cell to requeue — see THE CROSSER'S CELLS.
 */
function packWormArt(c: CanvasRenderingContext2D): void {
  const pack = (u: UVRect, art: Art): void => {
    const cv = toCanvas(art);
    clearCell(c, u);
    drawCell(c, u, antialiased(cv), [cv.width, cv.height]);
  };
  pack(WORM_CELLS.head, wormHead());
  pack(WORM_CELLS.car, wormCar());
  pack(WORM_CELLS.tail, wormTail());
  // ...and the escort's cart, beside the crosser's train because they are
  // the same kind of thing on the sheet: a mission's own body, packed
  // whichever way the animal switch is thrown
  pack(UV_CONVOY, hauler());
  pack(UV_CONVOY_LEG, haulerLeg());
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

  // ---- the ground families ----
  // two rigs, packed by one pair of helpers: a mech tier is body, base
  // and the near-side legs; a legged tier is body, foot, the caps and
  // segments it has cells for, and a base where the stock rig kept one
  interface MechCells { kind: UnitKind; body: UVRect; base: UVRect; leg: UVRect; sil: { body: UVRect; base: UVRect; leg: UVRect } }
  interface LegCells {
    kind: UnitKind; body: UVRect; base?: UVRect; joint?: UVRect; baseJoint?: UVRect; foot: UVRect; leg: UVRect; legBase: UVRect;
    sil: { body: UVRect; base?: UVRect; joint?: UVRect; baseJoint?: UVRect; foot: UVRect };
  }
  const packMech = (cells: MechCells, a: MechParts, n: number): void => {
    const body = toCanvas(a.body), base = toCanvas(a.base), leg = toCanvas(a.leg);
    part(cells.body, body); part(cells.base, base); part(cells.leg, leg);
    part(cells.sil.body, body, true); part(cells.sil.base, base, true); part(cells.sil.leg, leg, true);
    dropCell(cells.kind);
    teamCell(cells.kind, body, toCanvas(a.cell), cells.body, n);
  };
  const packLegged = (cells: LegCells, a: LegParts, n: number): void => {
    const body = toCanvas(a.body), foot = toCanvas(a.foot);
    part(cells.body, body); part(cells.sil.body, body, true);
    part(cells.foot, foot); part(cells.sil.foot, foot, true);
    if (cells.base && cells.sil.base) { const base = toCanvas(a.base); part(cells.base, base); part(cells.sil.base, base, true); }
    if (a.joint && cells.joint && cells.sil.joint) { const joint = toCanvas(a.joint); part(cells.joint, joint); part(cells.sil.joint, joint, true); }
    if (a.baseJoint && cells.baseJoint && cells.sil.baseJoint) { const bj = toCanvas(a.baseJoint); part(cells.baseJoint, bj); part(cells.sil.baseJoint, bj, true); }
    seg(cells.leg, toCanvasRect(a.leg.px, a.leg.w, a.leg.h));
    seg(cells.legBase, toCanvasRect(a.legBase.px, a.legBase.w, a.legBase.h));
    dropCell(cells.kind);
    teamCell(cells.kind, body, toCanvas(a.cell), cells.body, n);
  };
  const hartMechCells: readonly MechCells[] = [
    { kind: "starhart1", body: UV_STARHART1_BODY, base: UV_STARHART1_BASE, leg: UV_STARHART1_LEG, sil: { body: UV_STARHART1_BODY_SIL, base: UV_STARHART1_BASE_SIL, leg: UV_STARHART1_LEG_SIL } },
    { kind: "starhart2", body: UV_STARHART2_BODY, base: UV_STARHART2_BASE, leg: UV_STARHART2_LEG, sil: { body: UV_STARHART2_BODY_SIL, base: UV_STARHART2_BASE_SIL, leg: UV_STARHART2_LEG_SIL } },
    { kind: "starhart3", body: UV_STARHART3_BODY, base: UV_STARHART3_BASE, leg: UV_STARHART3_LEG, sil: { body: UV_STARHART3_BODY_SIL, base: UV_STARHART3_BASE_SIL, leg: UV_STARHART3_LEG_SIL } },
  ];
  hartMechCells.forEach((cells, i) => packMech(cells, hartMech(HART_TIERS[i]), HART_TIERS[i].n));
  const hartLegCells: readonly LegCells[] = [
    { kind: "starhart4", body: UV_STARHART4_BODY, base: UV_STARHART4_BASE, joint: UV_STARHART4_JOINT, baseJoint: UV_STARHART4_JOINT_BASE, foot: UV_STARHART4_FOOT, leg: UV_STARHART4_LEG_SEG, legBase: UV_STARHART4_LEG_BASE_SEG,
      sil: { body: UV_STARHART4_BODY_SIL, base: UV_STARHART4_BASE_SIL, joint: UV_STARHART4_JOINT_SIL, baseJoint: UV_STARHART4_JOINT_BASE_SIL, foot: UV_STARHART4_FOOT_SIL } },
    { kind: "starhart5", body: UV_STARHART5_BODY, base: UV_STARHART5_BASE, joint: UV_STARHART5_JOINT, baseJoint: UV_STARHART5_JOINT_BASE, foot: UV_STARHART5_FOOT, leg: UV_STARHART5_LEG_SEG, legBase: UV_STARHART5_LEG_BASE_SEG,
      sil: { body: UV_STARHART5_BODY_SIL, base: UV_STARHART5_BASE_SIL, joint: UV_STARHART5_JOINT_SIL, baseJoint: UV_STARHART5_JOINT_BASE_SIL, foot: UV_STARHART5_FOOT_SIL } },
  ];
  hartLegCells.forEach((cells, i) => packLegged(cells, hartLegged(HART_TIERS[3 + i]), HART_TIERS[3 + i].n));
  const rhinoMechCells: readonly MechCells[] = [
    { kind: "ironhide1", body: UV_IRONHIDE1_BODY, base: UV_IRONHIDE1_BASE, leg: UV_IRONHIDE1_LEG, sil: { body: UV_IRONHIDE1_BODY_SIL, base: UV_IRONHIDE1_BASE_SIL, leg: UV_IRONHIDE1_LEG_SIL } },
    { kind: "ironhide2", body: UV_IRONHIDE2_BODY, base: UV_IRONHIDE2_BASE, leg: UV_IRONHIDE2_LEG, sil: { body: UV_IRONHIDE2_BODY_SIL, base: UV_IRONHIDE2_BASE_SIL, leg: UV_IRONHIDE2_LEG_SIL } },
    { kind: "ironhide3", body: UV_IRONHIDE3_BODY, base: UV_IRONHIDE3_BASE, leg: UV_IRONHIDE3_LEG, sil: { body: UV_IRONHIDE3_BODY_SIL, base: UV_IRONHIDE3_BASE_SIL, leg: UV_IRONHIDE3_LEG_SIL } },
  ];
  rhinoMechCells.forEach((cells, i) => packMech(cells, ironMech(IRON_TIERS[i]), IRON_TIERS[i].n));
  const rhinoLegCells: readonly LegCells[] = [
    { kind: "ironhide4", body: UV_IRONHIDE4_BODY, base: UV_IRONHIDE4_BASE, joint: UV_IRONHIDE4_JOINT, baseJoint: UV_IRONHIDE4_JOINT_BASE, foot: UV_IRONHIDE4_FOOT, leg: UV_IRONHIDE4_LEG_SEG, legBase: UV_IRONHIDE4_LEG_BASE_SEG,
      sil: { body: UV_IRONHIDE4_BODY_SIL, base: UV_IRONHIDE4_BASE_SIL, joint: UV_IRONHIDE4_JOINT_SIL, baseJoint: UV_IRONHIDE4_JOINT_BASE_SIL, foot: UV_IRONHIDE4_FOOT_SIL } },
    { kind: "ironhide5", body: UV_IRONHIDE5_BODY, base: UV_IRONHIDE5_BASE, joint: UV_IRONHIDE5_JOINT, baseJoint: UV_IRONHIDE5_JOINT_BASE, foot: UV_IRONHIDE5_FOOT, leg: UV_IRONHIDE5_LEG_SEG, legBase: UV_IRONHIDE5_LEG_BASE_SEG,
      sil: { body: UV_IRONHIDE5_BODY_SIL, base: UV_IRONHIDE5_BASE_SIL, joint: UV_IRONHIDE5_JOINT_SIL, baseJoint: UV_IRONHIDE5_JOINT_BASE_SIL, foot: UV_IRONHIDE5_FOOT_SIL } },
  ];
  rhinoLegCells.forEach((cells, i) => packLegged(cells, ironLegged(IRON_TIERS[3 + i]), IRON_TIERS[3 + i].n));
  packMech(
    { kind: "dartback1", body: UV_DARTBACK1_BODY, base: UV_DARTBACK1_BASE, leg: UV_DARTBACK1_LEG, sil: { body: UV_DARTBACK1_BODY_SIL, base: UV_DARTBACK1_BASE_SIL, leg: UV_DARTBACK1_LEG_SIL } },
    frogMech(FROG_TIERS[0]), FROG_TIERS[0].n,
  );
  const frogLegCells: readonly LegCells[] = [
    { kind: "dartback2", body: UV_DARTBACK2_BODY, base: UV_DARTBACK2_BASE, foot: UV_DARTBACK2_FOOT, leg: UV_DARTBACK2_LEG_SEG, legBase: UV_DARTBACK2_LEG_BASE_SEG,
      sil: { body: UV_DARTBACK2_BODY_SIL, base: UV_DARTBACK2_BASE_SIL, foot: UV_DARTBACK2_FOOT_SIL } },
    { kind: "dartback3", body: UV_DARTBACK3_BODY, foot: UV_DARTBACK3_FOOT, leg: UV_DARTBACK3_LEG_SEG, legBase: UV_DARTBACK3_LEG_BASE_SEG,
      sil: { body: UV_DARTBACK3_BODY_SIL, foot: UV_DARTBACK3_FOOT_SIL } },
    { kind: "dartback4", body: UV_DARTBACK4_BODY, foot: UV_DARTBACK4_FOOT, leg: UV_DARTBACK4_LEG_SEG, legBase: UV_DARTBACK4_LEG_BASE_SEG,
      sil: { body: UV_DARTBACK4_BODY_SIL, foot: UV_DARTBACK4_FOOT_SIL } },
    { kind: "dartback5", body: UV_DARTBACK5_BODY, foot: UV_DARTBACK5_FOOT, leg: UV_DARTBACK5_LEG_SEG, legBase: UV_DARTBACK5_LEG_BASE_SEG,
      sil: { body: UV_DARTBACK5_BODY_SIL, foot: UV_DARTBACK5_FOOT_SIL } },
  ];
  frogLegCells.forEach((cells, i) => packLegged(cells, frogLegged(FROG_TIERS[1 + i]), FROG_TIERS[1 + i].n));
  // the elephants, into cells nobody else owns (see THE TUSKERS' CELLS).
  // `part` clears before it draws like everywhere else — here there is
  // simply nothing under it to clear
  const tuskMechCellSets: readonly MechCells[] = [
    { kind: "tusker1", body: TUSK1_CELLS.body, base: TUSK1_CELLS.base, leg: TUSK1_CELLS.leg,
      sil: { body: TUSK1_CELLS.bodySil, base: TUSK1_CELLS.baseSil, leg: TUSK1_CELLS.legSil } },
    { kind: "tusker2", body: TUSK2_CELLS.body, base: TUSK2_CELLS.base, leg: TUSK2_CELLS.leg,
      sil: { body: TUSK2_CELLS.bodySil, base: TUSK2_CELLS.baseSil, leg: TUSK2_CELLS.legSil } },
    { kind: "tusker3", body: TUSK3_CELLS.body, base: TUSK3_CELLS.base, leg: TUSK3_CELLS.leg,
      sil: { body: TUSK3_CELLS.bodySil, base: TUSK3_CELLS.baseSil, leg: TUSK3_CELLS.legSil } },
  ];
  tuskMechCellSets.forEach((cells, i) => packMech(cells, tuskMech(TUSK_TIERS[i]), TUSK_TIERS[i].n));
  const tuskLegCellSets: readonly LegCells[] = [
    { kind: "tusker4", body: TUSK4_CELLS.body, base: TUSK4_CELLS.base, joint: TUSK4_CELLS.joint, baseJoint: TUSK4_CELLS.baseJoint, foot: TUSK4_CELLS.foot, leg: TUSK4_CELLS.leg, legBase: TUSK4_CELLS.legBase,
      sil: { body: TUSK4_CELLS.bodySil, base: TUSK4_CELLS.baseSil, joint: TUSK4_CELLS.jointSil, baseJoint: TUSK4_CELLS.baseJointSil, foot: TUSK4_CELLS.footSil } },
    { kind: "tusker5", body: TUSK5_CELLS.body, base: TUSK5_CELLS.base, joint: TUSK5_CELLS.joint, baseJoint: TUSK5_CELLS.baseJoint, foot: TUSK5_CELLS.foot, leg: TUSK5_CELLS.leg, legBase: TUSK5_CELLS.legBase,
      sil: { body: TUSK5_CELLS.bodySil, base: TUSK5_CELLS.baseSil, joint: TUSK5_CELLS.jointSil, baseJoint: TUSK5_CELLS.baseJointSil, foot: TUSK5_CELLS.footSil } },
  ];
  tuskLegCellSets.forEach((cells, i) => packLegged(cells, tuskLegged(TUSK_TIERS[3 + i]), TUSK_TIERS[3 + i].n));
  // ---- the Grapnels: five mech tiers, body, base plate and rowing arms ----
  const sfCellSets: readonly MechCells[] = [SF1_CELLS, SF2_CELLS, SF3_CELLS, SF4_CELLS, SF5_CELLS].map((c, i) => ({
    kind: `grapnel${i + 1}` as UnitKind,
    body: c.body, base: c.base, leg: c.leg,
    sil: { body: c.bodySil, base: c.baseSil, leg: c.legSil },
  }));
  sfCellSets.forEach((cells, i) => packMech(cells, grapnelMech(GRAPNEL_TIERS[i]), GRAPNEL_TIERS[i].n));
  // ---- the Ratkings: the same three parts a tier ----
  RK_CELLS.forEach((c, i) => packMech({
    kind: `ratking${i + 1}` as UnitKind,
    body: c.body, base: c.base, leg: c.leg,
    sil: { body: c.bodySil, base: c.baseSil, leg: c.legSil },
  }, ratkingMech(RATKING_TIERS[i]), RATKING_TIERS[i].n));
  // ---- the siege: the railgun on the mech rig, into cells nobody else
  // owns (see THE SIEGE'S CELLS) ----
  packMech(RAZE_CELLS, razeMech(RAZE_TIER), RAZE_TIER.n);
  // ...and the four Wardens, on the same rig
  packMech(LANCE_CELLS, lanceMech(LANCE_TIER), LANCE_TIER.n);
  packMech(BULWARK_CELLS, bulwarkMech(BULWARK_TIER), BULWARK_TIER.n);
  packMech(HALBERD_CELLS, halberdMech(HALBERD_TIER), HALBERD_TIER.n);
  packMech(JUGGERNAUT_CELLS, juggernautMech(JUGGERNAUT_TIER), JUGGERNAUT_TIER.n);
  // ...and the two buff towers, on the same rig (pylonArt.ts)
  packMech(GOAD_CELLS, goadMech(GOAD_TIER), GOAD_TIER.n);
  packMech(BASTION_CELLS, bastionMech(BASTION_TIER), BASTION_TIER.n);
  packMech(BRANDER_CELLS, branderMech(BRANDER_TIER), BRANDER_TIER.n);
  FABRICATOR_CELLS.forEach((c, i) => packMech(c, fabricatorMech(FABRICATOR_TIERS[i]), FABRICATOR_TIERS[i].n));

  // ---- Stoop, Skate, Livewire ----
  // the wing rig: the composed sprite in the kind's own cell, the body
  // column and the wing in the cells above
  const packWinged = (kinds: readonly UnitKind[], tiers: readonly FlyerTier[], fulls: readonly UVRect[], cells: readonly (readonly [UVRect, UVRect])[], art: (T: FlyerTier) => StoopArt): void =>
    tiers.forEach((T, i) => {
      const a = art(T);
      const full = toCanvas(a.full);
      part(fulls[i], full);
      const [bodyUV, wingUV] = cells[i];
      const strip = bodyColumn(a.body, T.bw);
      part(bodyUV, toCanvasRect(strip.px, strip.w, strip.h));
      part(wingUV, toCanvas(a.wing));
      dropCell(kinds[i]);
      teamCell(kinds[i], full, toCanvas(a.cell), fulls[i], T.n);
    });
  packWinged(STOOP_KINDS, STOOP_TIERS, [UV_STOOP1, UV_STOOP2, UV_STOOP3, UV_STOOP4, UV_STOOP5], UV_STOOP_CELLS, stoop);
  packWinged(MANTA_KINDS, MANTA_TIERS, [UV_SKATE1, UV_SKATE2, UV_SKATE3, UV_SKATE4, UV_SKATE5], UV_MANTA_CELLS, manta);
  packWinged(NARWHAL_KINDS, NARWHAL_TIERS, [UV_LIVEWIRE1, UV_LIVEWIRE2, UV_LIVEWIRE3, UV_LIVEWIRE4, UV_LIVEWIRE5], UV_NARWHAL_CELLS, narwhal);
  // the vultures, into cells nobody else owns (see THE KETTLES' CELLS):
  // the same three drawings as any other wing-rig body, with nothing
  // under them to clear
  packWinged(KETTLE_KINDS, KETTLE_TIERS, KETTLE_FULL_CELLS, UV_KETTLE_CELLS, kettle);
  packWinged(WHALE_KINDS, WHALE_TIERS, WHALE_FULL_CELLS, UV_WHALE_CELLS, whale);
  // ---- the Sovereign ----
  // the boss, into cells nobody else owns (see THE SOVEREIGN'S CELLS): the
  // same three drawings as any other wing-rig body, and the stock hull's
  // own cell left untouched under it
  {
    const a = king();
    const full = toCanvas(a.full);
    part(KING_CELLS.full, full);
    const strip = bodyColumn(a.body, KING_TIER.bw);
    part(KING_CELLS.body, toCanvasRect(strip.px, strip.w, strip.h));
    part(KING_CELLS.wing, toCanvas(a.wing));
    dropCell("boss");
    teamCell("boss", full, toCanvas(a.cell), KING_CELLS.full, KING_TIER.n);
  }
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
  const outlinedBlock = (src: Src): HTMLCanvasElement =>
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
  const waterBlock = (src: HTMLImageElement | HTMLCanvasElement): HTMLCanvasElement => {
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
    // under the ink the water is painted too (tiles.ts paintWater); the
    // swell shader displaces the painted tile exactly as it did the file
    if ("water" in g)
      cells.forEach((cell, v) =>
        draw(cell, waterBlock(LINOCUT_TERRAIN ? waterCanvas(g.water, v) : img[g.water])),
      );
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
  draw(UV_MARK_PAD, antialiased(markPadCanvas()));
  // THE RAIL PIECES, painted like the floors and through the same filter
  RAIL_STYLES.forEach((_, st) =>
    RAIL_PIECES.forEach((_p, i) => draw(UV_RAILS[st][i], antialiased(railCanvas(st, i)))),
  );

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
    [UV_IRONHIDE1_LEG, UV_IRONHIDE1_LEG_SIL, img.ironhide1Leg],
    [UV_IRONHIDE1_BASE, UV_IRONHIDE1_BASE_SIL, img.ironhide1Base],
    [UV_IRONHIDE1_BODY, UV_IRONHIDE1_BODY_SIL, img.ironhide1],
    [UV_LARGE_WEAPON, UV_LARGE_WEAPON_SIL, img.largeWeapon],
    [UV_IRONHIDE2_LEG, UV_IRONHIDE2_LEG_SIL, img.ironhide2Leg],
    [UV_IRONHIDE2_BASE, UV_IRONHIDE2_BASE_SIL, img.ironhide2Base],
    [UV_IRONHIDE2_BODY, UV_IRONHIDE2_BODY_SIL, img.ironhide2],
    [UV_FLAMETHROWER, UV_FLAMETHROWER_SIL, img.flamethrower],
    [UV_IRONHIDE3_LEG, UV_IRONHIDE3_LEG_SIL, img.ironhide3Leg],
    [UV_IRONHIDE3_BASE, UV_IRONHIDE3_BASE_SIL, img.ironhide3Base],
    [UV_IRONHIDE3_BODY, UV_IRONHIDE3_BODY_SIL, img.ironhide3],
    [UV_ARTILLERY, UV_ARTILLERY_SIL, img.artillery],
    [UV_IRONHIDE4_BODY, UV_IRONHIDE4_BODY_SIL, img.ironhide4],
    [UV_IRONHIDE4_LEG, UV_IRONHIDE4_LEG_SIL, img.ironhide4Leg],
    [UV_IRONHIDE4_BASE, UV_IRONHIDE4_BASE_SIL, img.ironhide4Base],
    [UV_IRONHIDE4_WEAPON, UV_IRONHIDE4_WEAPON_SIL, img.ironhide4Weapon],
    [UV_IRONHIDE4_MOUNT, UV_IRONHIDE4_MOUNT_SIL, img.ironhide4Mount],
    [UV_IRONHIDE5_BODY, UV_IRONHIDE5_BODY_SIL, img.ironhide5],
    [UV_IRONHIDE5_BASE, UV_IRONHIDE5_BASE_SIL, img.ironhide5Base],
    [UV_IRONHIDE5_LEG, UV_IRONHIDE5_LEG_SIL, img.ironhide5Leg],
    [UV_IRONHIDE5_WEAPON, UV_IRONHIDE5_WEAPON_SIL, img.ironhide5Weapon],
  ]);
  teamCell("ironhide1", img.ironhide1, img.powerCell, UV_IRONHIDE1_BODY, 48);
  teamCell("ironhide2", img.ironhide2, img.ironhide2Cell, UV_IRONHIDE2_BODY, 64);
  teamCell("ironhide3", img.ironhide3, img.ironhide3Cell, UV_IRONHIDE3_BODY, 100, 80);
  teamCell("ironhide4", img.ironhide4, img.ironhide4Cell, UV_IRONHIDE4_BODY, 170, 140);
  teamCell("ironhide5", img.ironhide5, img.ironhide5Cell, UV_IRONHIDE5_BODY, 214, 140);

  // the dartback1 line. The legged units' segments are drawn unrotated at
  // native size onto rects that ARE the art (see the UV note), and a
  // knee cap is packed upright because it is drawn unrotated
  parts([
    [UV_DARTBACK1_LEG, UV_DARTBACK1_LEG_SIL, img.dartback1Leg],
    [UV_DARTBACK1_BASE, UV_DARTBACK1_BASE_SIL, img.dartback1Base],
    [UV_DARTBACK1_BODY, UV_DARTBACK1_BODY_SIL, img.dartback1],
    [UV_DARTBACK2_BODY, UV_DARTBACK2_BODY_SIL, img.dartback2],
    [UV_DARTBACK2_BASE, UV_DARTBACK2_BASE_SIL, img.dartback2Base],
    [UV_DARTBACK2_WEAPON, UV_DARTBACK2_WEAPON_SIL, img.dartback2Weapon],
    [UV_DARTBACK2_JOINT, UV_DARTBACK2_JOINT_SIL, img.dartback2Joint],
    [UV_DARTBACK2_FOOT, UV_DARTBACK2_FOOT_SIL, img.dartback2Foot],
    [UV_DARTBACK3_BODY, UV_DARTBACK3_BODY_SIL, img.dartback3],
    [UV_DARTBACK3_WEAPON, UV_DARTBACK3_WEAPON_SIL, img.dartback3Weapon],
    [UV_DARTBACK3_MOUNT, UV_DARTBACK3_MOUNT_SIL, img.dartback3Mount],
    [UV_DARTBACK3_JOINT, UV_DARTBACK3_JOINT_SIL, img.dartback3Joint],
    [UV_DARTBACK3_FOOT, UV_DARTBACK3_FOOT_SIL, img.dartback3Foot],
    [UV_DARTBACK4_BODY, UV_DARTBACK4_BODY_SIL, img.dartback4],
    [UV_DARTBACK4_WEAPON, UV_DARTBACK4_WEAPON_SIL, img.dartback3Weapon],
    [UV_DARTBACK4_MOUNT, UV_DARTBACK4_MOUNT_SIL, img.purpleMount],
    [UV_DARTBACK4_FOOT, UV_DARTBACK4_FOOT_SIL, img.dartback4Foot],
    [UV_DARTBACK4_JOINT_BASE, UV_DARTBACK4_JOINT_BASE_SIL, img.dartback4JointBase],
    [UV_DARTBACK5_BODY, UV_DARTBACK5_BODY_SIL, img.dartback5],
    [UV_DARTBACK5_CANNON, UV_DARTBACK5_CANNON_SIL, img.dartback5Cannon],
    [UV_DARTBACK5_JOINT_BASE, UV_DARTBACK5_JOINT_BASE_SIL, img.dartback5JointBase],
    [UV_DARTBACK5_FOOT, UV_DARTBACK5_FOOT_SIL, img.dartback5Foot],
  ]);
  draw(UV_DARTBACK2_LEG, antialiased(img.dartback2Leg));
  draw(UV_DARTBACK2_LEG_BASE, antialiased(img.dartback2LegBase));
  draw(UV_DARTBACK3_LEG, antialiased(img.dartback3Leg));
  draw(UV_DARTBACK3_LEG_BASE, antialiased(img.dartback3LegBase));
  draw(UV_DARTBACK4_LEG, antialiased(img.dartback4Leg));
  draw(UV_DARTBACK4_LEG_BASE, antialiased(img.dartback4LegBase));
  draw(UV_DARTBACK5_LEG, antialiased(img.dartback5Leg));
  draw(UV_DARTBACK5_LEG_BASE, antialiased(img.dartback5LegBase));
  teamCell("dartback1", img.dartback1, img.dartback1Cell, UV_DARTBACK1_BODY, 48);
  teamCell("dartback2", img.dartback2, img.dartback2Cell, UV_DARTBACK2_BODY, 88, 64);
  teamCell("dartback3", img.dartback3, img.dartback3Cell, UV_DARTBACK3_BODY, 94, 75);
  teamCell("dartback4", img.dartback4, img.dartback4Cell, UV_DARTBACK4_BODY, 128);
  teamCell("dartback5", img.dartback5, img.dartback5Cell, UV_DARTBACK5_BODY, 160, 190);

  // the support line
  parts([
    [UV_STARHART1_LEG, UV_STARHART1_LEG_SIL, img.starhart1Leg],
    [UV_STARHART1_BASE, UV_STARHART1_BASE_SIL, img.starhart1Base],
    [UV_STARHART1_BODY, UV_STARHART1_BODY_SIL, img.starhart1],
    [UV_HEAL_WEAPON, UV_HEAL_WEAPON_SIL, img.healWeapon],
    [UV_STARHART2_LEG, UV_STARHART2_LEG_SIL, img.starhart2Leg],
    [UV_STARHART2_BASE, UV_STARHART2_BASE_SIL, img.starhart2Base],
    [UV_STARHART2_BODY, UV_STARHART2_BODY_SIL, img.starhart2],
    [UV_HEAL_SHOTGUN, UV_HEAL_SHOTGUN_SIL, img.healShotgun],
    [UV_STARHART3_LEG, UV_STARHART3_LEG_SIL, img.starhart3Leg],
    [UV_STARHART3_BASE, UV_STARHART3_BASE_SIL, img.starhart3Base],
    [UV_STARHART3_BODY, UV_STARHART3_BODY_SIL, img.starhart3],
    [UV_BEAM_WEAPON, UV_BEAM_WEAPON_SIL, img.beamWeapon],
    [UV_STARHART4_BODY, UV_STARHART4_BODY_SIL, img.starhart4],
    [UV_STARHART4_LEG, UV_STARHART4_LEG_SIL, img.starhart4Leg],
    [UV_STARHART4_BASE, UV_STARHART4_BASE_SIL, img.starhart4Base],
    [UV_REPAIR_BEAM, UV_REPAIR_BEAM_SIL, img.repairBeam],
    [UV_STARHART5_BODY, UV_STARHART5_BODY_SIL, img.starhart5],
    [UV_STARHART5_BASE, UV_STARHART5_BASE_SIL, img.starhart5Base],
    [UV_STARHART5_JOINT, UV_STARHART5_JOINT_SIL, img.starhart5Joint],
    [UV_STARHART5_JOINT_BASE, UV_STARHART5_JOINT_BASE_SIL, img.starhart5JointBase],
    [UV_STARHART5_FOOT, UV_STARHART5_FOOT_SIL, img.starhart5Foot],
  ]);
  draw(UV_STARHART5_LEG, antialiased(img.starhart5Leg));
  draw(UV_STARHART5_LEG_BASE, antialiased(img.starhart5LegBase));
  teamCell("starhart1", img.starhart1, img.starhart1Cell, UV_STARHART1_BODY, 56);
  teamCell("starhart2", img.starhart2, img.starhart2Cell, UV_STARHART2_BODY, 68, 58);
  teamCell("starhart3", img.starhart3, img.starhart3Cell, UV_STARHART3_BODY, 80);
  teamCell("starhart4", img.starhart4, img.starhart4Cell, UV_STARHART4_BODY, 170, 140);
  teamCell("starhart5", img.starhart5, img.starhart5Cell, UV_STARHART5_BODY, 214, 140);

  // the flyers and the naval hulls: one outlined quad each. The stoop1
  // and the ironhide1 have no cell art of their own and fall back to
  // power-cell, exactly as UnitType.load does
  const hull = (kind: UnitKind, src: HTMLImageElement, cell: HTMLImageElement, uv: UVRect): void => {
    draw(uv, outlinedUnit(src));
    teamCell(kind, src, cell, uv, srcW(src), srcH(src));
  };
  hull("stoop1", img.stoop1, img.powerCell, UV_STOOP1);
  hull("stoop2", img.stoop2, img.stoop2Cell, UV_STOOP2);
  hull("stoop3", img.stoop3, img.stoop3Cell, UV_STOOP3);
  hull("stoop4", img.stoop4, img.stoop4Cell, UV_STOOP4);
  hull("boss", img.boss, img.bossCell, UV_BOSS);
  hull("stoop5", img.stoop5, img.stoop5Cell, UV_STOOP5);
  hull("skate1", img.skate1, img.harpoon1Cell, UV_SKATE1);
  hull("skate2", img.skate2, img.harpoon2Cell, UV_SKATE2);
  hull("livewire1", img.livewire1, img.wraith1Cell, UV_LIVEWIRE1);
  hull("livewire2", img.livewire2, img.wraith2Cell, UV_LIVEWIRE2);
  hull("skate3", img.skate3, img.harpoon3Cell, UV_SKATE3);
  hull("livewire3", img.livewire3, img.wraith3Cell, UV_LIVEWIRE3);
  hull("skate4", img.skate4, img.harpoon4Cell, UV_SKATE4);
  hull("livewire4", img.livewire4, img.wraith4Cell, UV_LIVEWIRE4);
  hull("skate5", img.skate5, img.harpoon5Cell, UV_SKATE5);
  hull("livewire5", img.livewire5, img.wraith5Cell, UV_LIVEWIRE5);

  // ---------- the bullets ----------
  // white and at source size, facing +x. See the UV_BULLET note: the
  // renderer lays the -back region under the inner one on one rect and
  // tints each with the firing ammo's own colour, as BasicBulletType.draw
  // does
  draw(UV_BULLET, antialiased(boltBullet(false)));
  draw(UV_BULLET_BACK, antialiased(boltBullet(true)));
  draw(UV_SHELL, antialiased(boltBullet(false, 36)));
  draw(UV_SHELL_BACK, antialiased(boltBullet(true, 36)));
  draw(UV_MISSILE, antialiased(boltBullet(false, 36, true)));
  draw(UV_MISSILE_BACK, antialiased(boltBullet(true, 36, true)));
  draw(UV_CANISTER, antialiased(canisterBullet(false)));
  draw(UV_CANISTER_BACK, antialiased(canisterBullet(true)));
  draw(UV_CIRCLE_BULLET, antialiased(discRound(false)));
  draw(UV_CIRCLE_BULLET_BACK, antialiased(discRound(true)));
  // the boss missile is a unit: outlined like one
  draw(UV_BOSS_MISSILE, antialiased(outlined(bossMissileArt(), "#2d2f39", UNIT_OUTLINE_R)));
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
  // FOUNDRY (turretArt.ts, behind turretFlag.ts): every plate darkened
  // and every head that has a drawing generated here and put through
  // the same outline + antialias pass as the stock top it replaces; a
  // kind without one (the fixers) keeps its stock sprite
  // the sheet's plates come DARKENED (foundryArt.ts), so the BASE_DARK
  // multiply that used to happen here is in the file already
  const plateArt = (foundry: HTMLImageElement, stock: HTMLImageElement): HTMLCanvasElement =>
    antialiased(FOUNDRY_ART ? foundry : stock);
  const headArt = (key: FoundryKey, stock: () => HTMLCanvasElement): HTMLCanvasElement =>
    FOUNDRY_ART ? outlinedBlock(img[key]) : stock();
  draw(UV_TOWER_BASE, plateArt(img.foundryBase2, img.towerBase));
  draw(UV_TOWER_BASE1, plateArt(img.foundryBase1, img.towerBase1));
  draw(UV_TOWER_BASE3, plateArt(img.foundryBase3, img.towerBase3));
  draw(UV_TOWER_BASE4, plateArt(img.foundryBase4, img.towerBase4));
  draw(UV_TURRET, headArt("foundryAutocannon", () => outlinedBlock(img.autocannonPreview)));
  draw(UV_AIRBURST, headArt("foundryAirburst", () => outlinedBlock(img.airburstPreview)));
  draw(UV_LOBBER, headArt("foundryLobber", () => outlinedBlock(img.lobber)));
  draw(UV_CLEAVER, headArt("foundryCleaver", () => outlinedBlock(img.cleaver)));
  draw(UV_TORCH, headArt("foundryTorch", () => outlinedBlock(img.torch)));
  draw(UV_TACKER, headArt("foundryTacker", () => outlinedBlock(img.tackerPreview)));
  draw(UV_COIL, headArt("foundryCoil", () => outlinedBlock(img.coil)));
  draw(UV_PIERCER, headArt("foundryPiercer", () => outlinedBlock(img.piercer)));
  draw(UV_TETHER, headArt("foundryTether", () => outlinedBlock(img.tether)));
  draw(UV_BARRAGE, headArt("foundryBarrage", () => outlinedBlock(img.barrage)));
  draw(UV_HIVE, headArt("foundryHive", () => outlinedBlock(img.hive)));
  // whirl's own art is the bare head; its three barrels are separate
  // sprites the preview already has assembled underneath
  draw(UV_WHIRL, headArt("foundryWhirl", () => outlinedBlock(img.whirlPreview)));
  draw(UV_REPEATER, headArt("foundryRepeater", () => outlinedBlock(img.repeater)));
  draw(UV_FURNACE, headArt("foundryFurnace", () => outlinedBlock(img.furnace)));
  draw(UV_RAILHEAD, headArt("foundryRailhead", () => outlinedBlock(img.railhead)));
  // the toxin line has no stock block behind it: with the flag off the four
  // borrow the head their icon does (towerIcons.ts)
  draw(UV_DUSTER, headArt("foundryDuster", () => outlinedBlock(img.torch)));
  draw(UV_BLIGHTER, headArt("foundryBlighter", () => outlinedBlock(img.lobber)));
  draw(UV_DRIFTER, headArt("foundryDrifter", () => outlinedBlock(img.deluge)));
  draw(UV_STINGER, headArt("foundryStinger", () => outlinedBlock(img.autocannonPreview)));
  // the liquid turrets, composited flat (see liquidTurret)
  // (a Foundry tank carries its water window in the drawing)
  draw(UV_DOUSER, headArt("foundryDouser", () => antialiased(liquidTurret(img.douser, img.douserLiquid, img.douserTop))));
  draw(UV_DELUGE, headArt("foundryDeluge", () => antialiased(liquidTurret(img.deluge, img.delugeLiquid, img.delugeTop))));
  // tether's beam: the end glow and the line, each the full source
  // centred on the cell that hugs its opaque part (see the UV note), the
  // line turned so its length runs along the +x axis pushSeg stretches
  draw(UV_TETHER_LASER_END, antialiased(img.tetherLaserEnd), [72, 72]);
  draw(UV_TETHER_LASER, antialiased(img.tetherLaser), [4, 48]);
  // the blocks that never turn, outlined and as authored
  draw(UV_SHIELD_TOWER, outlinedBlock(img.shieldTower));
  draw(UV_RESTORER, antialiased(mendBlock(img.restorer, img.restorerTop)));
  draw(UV_FIXER, antialiased(mendBlock(img.fixer, img.fixerTop)));
  // the base building at native 160px: the block, then the team overlay
  // tinted sharded-yellow the way Mindustry composites team regions
  if (FOUNDRY_ART) {
    // FOUNDRY's core (foundryArt.ts): the same plating as the heads, the
    // team's colour drawn into it, no overlay to composite
    draw(UV_BASE, antialiased(img.foundryCore));
  } else {
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
  }

  // the animal trial goes over the stock cells it replaces, once they are
  // all drawn and before the team cells are packed, since it requeues its own
  if (ANIMAL_ART) {
    packAnimalArt(c, teamCell, (kind) => {
      const i = cellJobs.findIndex((j) => j.kind === kind);
      if (i >= 0) cellJobs.splice(i, 1);
    });
  }

  // ...and the mission's crosser, which is nobody's trial and is packed
  // whichever way the switch is thrown (see packWormArt)
  packWormArt(c);

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
 * into a 3584x4096 canvas — and it depends on nothing but the sprite files,
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
