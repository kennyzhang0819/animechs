import { UNIT_SPRITE } from "./constants";
import {
  floorCanvas,
  FLOOR_VARIANTS,
  propCanvas,
  type PropKind,
  wallCanvas,
  WALL_VARIANTS,
  type FloorKind,
  type WallKind,
} from "./tiles";
import type { UnitKind } from "./levels";

// The sheet began as a 1024 square and grew as the roster outgrew it. Every
// cell keeps its original PIXEL coordinates and every UV is derived from
// them by uv() below, so a growth step only rescales an axis — no existing
// cell moves. It grew downward first, one 1024-tall band at a time: y=1024
// took the legged crawlers and the flyers, y=2048 and y=3072 the T4 line,
// which needs two bands because every one of its parts rides a 256px cell.
//
// The T5 line grew it SIDEWAYS instead. Another downward band would have
// made 6144 the sheet's longest side, and a WebGL2 context only has to
// guarantee MAX_TEXTURE_SIZE 2048 — every device that runs the game today
// already clears 4096, so widening keeps the longest side exactly where it
// has been while opening a fresh 1024x4096 column at x=1024 for reign,
// corvus, toxopid and eclipse — and, under them, the bullet regions.
const ATLAS_W = 2048;
const ATLAS_H = 4096;
/** left edge of the T5 column — every cell below x=1024 predates it */
const T5 = 1024;
const TAU = Math.PI * 2;

export type UVRect = readonly [number, number, number, number];

const uv = (x: number, y: number, w: number, h: number, inset = 0): UVRect => [
  (x + inset) / ATLAS_W,
  (y + inset) / ATLAS_H,
  (x + w - inset) / ATLAS_W,
  (y + h - inset) / ATLAS_H,
];

/**
 * THE SECOND ENVIRONMENT BAND — 1024x896 in the atlas's bottom-right
 * corner, and every piece of terrain that arrived after the first two
 * campaign maps lives in it.
 *
 * The first band is row 0 and the gutters around it, and it is FULL: the
 * original five floor families, three wall families and their edge fades
 * took every 64px cell that row had. A sixth family cannot be squeezed in
 * beside them, and scattering one across whatever gutter cells happen to
 * be free (which is how darksand's edge fade ended up on the y=704 row) is
 * how a layout stops being readable.
 *
 * So the new families take a block instead. A floor family is FIVE
 * sprites at once — three tile variants, a 192px generated edge fade, and
 * usually a wall pair with 2x2 "-large" art — and keeping all of them in
 * one rectangle is what lets a family be added by reading one comment
 * rather than five. The block is laid out in rows, dy by dy, below.
 *
 * Everything here is addressed through `e2`, so the whole band can be
 * MOVED by changing one pair of numbers — which matters, because this is
 * the last big empty rectangle a 2048x4096 sheet has.
 */
const ENV2_X = 1024;
const ENV2_Y = 3200;
const e2 = (dx: number, dy: number, w: number, h: number, inset = 0): UVRect =>
  uv(ENV2_X + dx, ENV2_Y + dy, w, h, inset);

/**
 * The two water cells, on the free stretch under the naval band. Named up
 * here because UV_FLOORS repeats each of them three times — see its note.
 *
 * THESE ARE THE ONLY FLOOR CELLS PACKED 3x3 RATHER THAN ONCE, and the ring
 * around each is not padding: water is the one floor drawn through a
 * shader that SAMPLES OFF THE TILE. Mindustry's water.frag displaces its
 * read horizontally by up to a world unit per row (the swell), which on a
 * plain 64px cell would reach into whatever sprite is packed next door and
 * smear it across the sea. Tiling the same 32px source nine times and
 * handing the renderer the CENTRE cell means a displaced read lands on
 * more water — a whole tile's worth of headroom in every direction, eight
 * times the largest displacement the shader can ask for — so the swell is
 * seamless and no neighbour can bleed in.
 *
 * No inset either, for the same reason: an inset crops the tile, and a
 * cropped tile does not line up with the copies around it.
 */
const WATER_TILE = 192;
const WATER_SHALLOW_XY = [T5 + 800, 2304] as const;
const WATER_DEEP_XY = [T5 + 800, 2496] as const;
// the SPORE waters, on the second environment band's bottom row — same 3x3
// packing and the same reason for it
const WATER_TAINTED_XY = [ENV2_X + 576, ENV2_Y + 640] as const;
const WATER_DEEP_TAINTED_XY = [ENV2_X + 768, ENV2_Y + 640] as const;
const waterCentre = (xy: readonly [number, number]): UVRect =>
  uv(xy[0] + 64, xy[1] + 64, 64, 64);
const WATER_SHALLOW_UV = waterCentre(WATER_SHALLOW_XY);
const WATER_DEEP_UV = waterCentre(WATER_DEEP_XY);
const WATER_TAINTED_UV = waterCentre(WATER_TAINTED_XY);
const WATER_DEEP_TAINTED_UV = waterCentre(WATER_DEEP_TAINTED_XY);
/**
 * UV distance of ONE MINDUSTRY WORLD UNIT along x on a water cell — what
 * the water shader multiplies its displacement by. A tile is 64 atlas px
 * and 8 world units across, so this is an eighth of a cell.
 */
export const WATER_UV_UNIT = 64 / 8 / ATLAS_W;
/** px cropped from every side of a 64px land-floor cell — see UV_FLOORS */
const FLOOR_INSET = 8;

// row 0: 64px cells — grass floors, stone walls, fx
// indices into UV_FLOORS: 0-2 grass, 3-5 stone, 6-8 dirt, 9-11 sand,
// 12-14 darksand (the desert pair rides row 0's free tail; x512 stays
// empty to keep clear space beside the ring cell at 448), 15-17 shallow
// water, 18-20 deep water — the two water groups on their own 3x3 cells
// under the naval band (see the WATER_TILE note).
//
// THE WATER GROUPS ARE THREE ENTRIES POINTING AT ONE ATLAS CELL EACH, and
// that is deliberate rather than lazy. The renderer reads a floor's blend
// group as `(index / 3) | 0`, so a group is three wide whether or not the
// floor has three variants — and Mindustry ships water as a single tile,
// not as the numbered triples every land floor has. Sharing the rect keeps
// the group arithmetic honest without packing the same 32px sprite three
// times: the palette only ever paints the first index of each pair, and the
// other two exist so a hand-edited document cannot index past the table.
//
// THE LAND FLOORS ARE INSET BY 8, NOT 2. The cells are packed edge to edge
// and the texture is sampled through mipmaps, so a floor drawn small — the
// whole map in frame — reads texels that straddle the cell's border and
// carry a stripe of whatever is packed next door. Mindustry's speckled
// floors hid that in their own noise; a flat tile shows it as a hairline
// along every row. Eight px keeps the sample inside its own cell down to
// the 8px mip, which is smaller than the map ever draws. The painted tiles
// keep their marks off the outer two logical pixels (tiles.ts) so the crop
// removes plain ground and nothing else
export const UV_FLOORS: readonly UVRect[] = [
  uv(0, 0, 64, 64, FLOOR_INSET),
  uv(64, 0, 64, 64, FLOOR_INSET),
  uv(128, 0, 64, 64, FLOOR_INSET),
  uv(64, 64, 64, 64, FLOOR_INSET),
  uv(128, 64, 64, 64, FLOOR_INSET),
  uv(192, 64, 64, 64, FLOOR_INSET),
  uv(256, 64, 64, 64, FLOOR_INSET),
  uv(320, 64, 64, 64, FLOOR_INSET),
  uv(384, 64, 64, 64, FLOOR_INSET),
  uv(576, 0, 64, 64, FLOOR_INSET),
  uv(640, 0, 64, 64, FLOOR_INSET),
  uv(704, 0, 64, 64, FLOOR_INSET),
  uv(768, 0, 64, 64, FLOOR_INSET),
  uv(832, 0, 64, 64, FLOOR_INSET),
  uv(896, 0, 64, 64, FLOOR_INSET),
  WATER_SHALLOW_UV,
  WATER_SHALLOW_UV,
  WATER_SHALLOW_UV,
  WATER_DEEP_UV,
  WATER_DEEP_UV,
  WATER_DEEP_UV,
  // ---- the second environment band's floors, groups 7-16 ----
  // Appended, never inserted: a floor index is written into every map
  // document on disk, so the only safe place for a new family is past the
  // end. That is also why the water groups are no longer the tail of the
  // table and `isWaterFloor` is no longer "index >= 15" — see
  // WATER_FLOOR_GROUPS below.
  e2(0, 0, 64, 64, FLOOR_INSET), // moss
  e2(64, 0, 64, 64, FLOOR_INSET),
  e2(128, 0, 64, 64, FLOOR_INSET),
  e2(192, 0, 64, 64, FLOOR_INSET), // spore moss
  e2(256, 0, 64, 64, FLOOR_INSET),
  e2(320, 0, 64, 64, FLOOR_INSET),
  e2(384, 0, 64, 64, FLOOR_INSET), // mud
  e2(448, 0, 64, 64, FLOOR_INSET),
  e2(512, 0, 64, 64, FLOOR_INSET),
  e2(576, 0, 64, 64, FLOOR_INSET), // shale
  e2(640, 0, 64, 64, FLOOR_INSET),
  e2(704, 0, 64, 64, FLOOR_INSET),
  e2(768, 0, 64, 64, FLOOR_INSET), // snow
  e2(832, 0, 64, 64, FLOOR_INSET),
  e2(896, 0, 64, 64, FLOOR_INSET),
  // salt shipped as ONE tile, like the waters, and its three entries still
  // share one cell — the painted set has two salts, but the second would
  // need a cell this row does not have, and one salt is what the maps on
  // disk were drawn with
  e2(960, 0, 64, 64, FLOOR_INSET),
  e2(960, 0, 64, 64, FLOOR_INSET),
  e2(960, 0, 64, 64, FLOOR_INSET),
  e2(0, 64, 64, 64, FLOOR_INSET), // ice
  e2(64, 64, 64, 64, FLOOR_INSET),
  e2(128, 64, 64, 64, FLOOR_INSET),
  e2(192, 64, 64, 64, FLOOR_INSET), // basalt
  e2(256, 64, 64, 64, FLOOR_INSET),
  e2(320, 64, 64, 64, FLOOR_INSET),
  // the spore waters, one tile each like the clear pair
  WATER_TAINTED_UV,
  WATER_TAINTED_UV,
  WATER_TAINTED_UV,
  WATER_DEEP_TAINTED_UV,
  WATER_DEEP_TAINTED_UV,
  WATER_DEEP_TAINTED_UV,
];

/** first index of each water group — what the palette and the map
 *  generators paint, and what `(i / 3) | 0` turns into GROUP_WATER_* */
export const FLOOR_SHALLOW_WATER = 15;
export const FLOOR_DEEP_WATER = 18;
// first index of each second-band group, in table order
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
 * WHICH FLOOR GROUPS ARE WATER — the whole definition of where a hull may
 * sail and where a walker drowns, and the reason it is a list rather than
 * a comparison.
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
// per-group floor edge fades (Mindustry's generated <floor>-edge sprites):
// three 192px blocks at y=768 for grass/stone/dirt, each a 3x3 of 64px
// sub-cells in image space. A tile bordered by a higher-priority floor gets
// that floor's sub-cell (col 1-dx, row 1-dy) overlaid, so the neighbor's
// texture fades across the tile seam exactly like Floor.drawEdges
//
// THE FADES ARE INSET ON THE BLOCK'S OUTER EDGES, and this is the hairline
// round every tile that the flat floors made visible. A fade sub-cell is
// drawn over a whole tile, so its outer edge lands on the tile's FAR
// border, and with no inset the sampler there reads whatever the atlas
// packs beside the 192px block. Mindustry's own blocks had empty space
// round them, and empty is transparent, which under premultiplied alpha
// contributes nothing; the second band packs its fades edge to edge with
// each other and, for salt, with the deep spore water, whose dark purple
// then leaked into a one-pixel line down the side of every sand tile that
// touched a flat. The same inset the floors have (FLOOR_INSET) on the
// outer sides only: those crop the transparent tail of the fade, which is
// nothing lost, while the inner seams between sub-cells and the side that
// meets the centre stay as they are, so the fade still reaches the shared
// border at full strength.
const EDGE_INSET = FLOOR_INSET;
const edgeBlock = (bx: number, by: number): ReadonlyArray<readonly UVRect[]> =>
  [0, 1, 2].map((ry) =>
    [0, 1, 2].map((rx): UVRect => [
      (bx + rx * 64 + (rx === 0 ? EDGE_INSET : 0)) / ATLAS_W,
      (by + ry * 64 + (ry === 0 ? EDGE_INSET : 0)) / ATLAS_H,
      (bx + rx * 64 + 64 - (rx === 2 ? EDGE_INSET : 0)) / ATLAS_W,
      (by + ry * 64 + 64 - (ry === 2 ? EDGE_INSET : 0)) / ATLAS_H,
    ]),
  );
export const UV_FLOOR_EDGES: ReadonlyArray<ReadonlyArray<readonly UVRect[]>> = [
  edgeBlock(16, 768), // grass
  edgeBlock(272, 768), // stone (baked but never overlays — lowest priority)
  edgeBlock(528, 768), // dirt
  // sand: no edge art baked — its only inferior floor (stone) shares no
  // map with it yet, so the renderer never overlays it; stone's block
  // stands in to keep the group indices aligned
  edgeBlock(272, 768),
  // darksand: no contiguous 192px block is left in the atlas, so its nine
  // sub-cells ride the y=704 gutter row, row-major from x=416. Each one
  // sits beside a DIFFERENT sub-cell's opaque inner side there, so these
  // are inset on all four sides — the crop on the inner side takes a few
  // px of full-strength fade, which the stretch puts back at the border
  [0, 1, 2].map((ry) => [0, 1, 2].map((rx) => uv(416 + (ry * 3 + rx) * 64, 704, 64, 64, EDGE_INSET))),
  // the water groups never overlay anything — they sit at the BOTTOM of the
  // blend order (GROUP_PRI in renderer.ts), which is what makes the land
  // fade into the shoreline rather than the other way round. No edge art is
  // baked for them; stone's block stands in to keep the indices aligned,
  // exactly as it does for sand
  edgeBlock(272, 768), // shallow water (never drawn)
  edgeBlock(272, 768), // deep water (never drawn)
  // the second band's land families each carry their own baked fade, on
  // the two 192px rows at the bottom of the block
  edgeBlock(ENV2_X + 0, ENV2_Y + 448), // moss
  edgeBlock(ENV2_X + 192, ENV2_Y + 448), // spore moss
  edgeBlock(ENV2_X + 384, ENV2_Y + 448), // mud
  edgeBlock(ENV2_X + 576, ENV2_Y + 448), // shale
  edgeBlock(ENV2_X + 768, ENV2_Y + 448), // snow
  edgeBlock(ENV2_X + 384, ENV2_Y + 640), // salt
  edgeBlock(ENV2_X + 0, ENV2_Y + 640), // ice
  edgeBlock(ENV2_X + 192, ENV2_Y + 640), // basalt
  edgeBlock(272, 768), // shallow spore water (never drawn)
  edgeBlock(272, 768), // deep spore water (never drawn)
];
/**
 * px cropped from every side of a 64px wall cell — the floors' rule
 * (FLOOR_INSET), for the same reason. The sheet is sampled through
 * mipmaps, and a wall drawn small reads texels that straddle the cell's
 * border and carry whatever is packed beside it: another family's tone,
 * or the empty (premultiplied black) space the second band's rows leave
 * under and beside their rock. Two px kept the sample inside the cell at
 * mip 1 and no further, which showed as a dark hairline round every tile
 * the moment the map was zoomed out. Eight keeps it inside down to the
 * 8px mip on a 64-aligned cell. The painted walls keep their one pebble
 * four logical px off the rim (tiles.ts), so the crop takes plain band.
 */
const WALL_INSET = 8;
// 0-1 stone-wall, 2-3 dirt-wall, 5-6 carbon-wall (the darker rock).
// Indices 4 and 7 are the two SENTINELS — WALL_PINE and WALL_DEEP — whose
// slots here are never-drawn placeholders, since everything tests those
// values explicitly and draws the cell's floor (plus, for a pine, its prop)
// instead of a wall sprite
export const UV_WALLS: readonly UVRect[] = [
  uv(192, 0, 64, 64, WALL_INSET),
  uv(256, 0, 64, 64, WALL_INSET),
  uv(448, 64, 64, 64, WALL_INSET),
  uv(0, 128, 64, 64, WALL_INSET),
  uv(192, 0, 64, 64, WALL_INSET), // WALL_PINE placeholder
  uv(320, 0, 64, 64, WALL_INSET),
  uv(384, 0, 64, 64, WALL_INSET),
  uv(192, 0, 64, 64, WALL_INSET), // WALL_DEEP placeholder
  // ---- the second environment band's rock, families 3-10 ----
  // Past the two sentinels, so nothing here needs a special case: every
  // one of these is ordinary buildable rock (isBuildableWall names only
  // the sentinels, and both of them are behind us)
  e2(384, 64, 64, 64, WALL_INSET), // spore wall
  e2(448, 64, 64, 64, WALL_INSET),
  e2(512, 64, 64, 64, WALL_INSET), // shale wall
  e2(576, 64, 64, 64, WALL_INSET),
  e2(640, 64, 64, 64, WALL_INSET), // snow wall
  e2(704, 64, 64, 64, WALL_INSET),
  e2(768, 64, 64, 64, WALL_INSET), // ice wall
  e2(832, 64, 64, 64, WALL_INSET),
  e2(896, 64, 64, 64, WALL_INSET), // salt wall
  e2(960, 64, 64, 64, WALL_INSET),
  e2(0, 128, 64, 64, WALL_INSET), // sand wall
  e2(64, 128, 64, 64, WALL_INSET),
  e2(128, 128, 64, 64, WALL_INSET), // dune wall
  e2(192, 128, 64, 64, WALL_INSET),
  e2(256, 128, 64, 64, WALL_INSET), // dacite wall
  e2(320, 128, 64, 64, WALL_INSET),
];
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
// Mindustry's <wall>-large art: one 2x2-tile sprite per family, split into
// per-tile quadrant UVs [row][col] in screen space (y down). Families
// without baked large art (dirt) draw per-tile variants everywhere.
//
// THE INSET IS ON THE BLOCK'S OUTER EDGES ONLY. The four quadrants are one
// continuous painting, so a texel straddling the seam between two of them
// averages art that belongs on both sides — that is what a seamless block
// looks like through a mipmap. Insetting the inner edges as well would
// skip a strip of the painting at every seam and break the bands that
// run corner to corner across the whole block.
const largeQuads = (x: number, y: number): ReadonlyArray<readonly UVRect[]> =>
  [0, 1].map((row) =>
    [0, 1].map((col): UVRect => [
      (x + col * 64 + (col === 0 ? WALL_INSET : 0)) / ATLAS_W,
      (y + row * 64 + (row === 0 ? WALL_INSET : 0)) / ATLAS_H,
      (x + col * 64 + 64 - (col === 1 ? WALL_INSET : 0)) / ATLAS_W,
      (y + row * 64 + 64 - (row === 1 ? WALL_INSET : 0)) / ATLAS_H,
    ]),
  );
export const UV_WALL_LARGE: ReadonlyArray<ReadonlyArray<readonly UVRect[]> | null> = [
  largeQuads(736, 768), // stone-wall-large
  null, // dirt: fringe slopes, aligned 2x2 blocks are rare — not baked
  largeQuads(864, 768), // carbon-wall-large
  // the second band's eight, all on one 128px row of the block
  largeQuads(ENV2_X + 0, ENV2_Y + 224), // spore
  largeQuads(ENV2_X + 128, ENV2_Y + 224), // shale
  largeQuads(ENV2_X + 256, ENV2_Y + 224), // snow
  largeQuads(ENV2_X + 384, ENV2_Y + 224), // ice
  largeQuads(ENV2_X + 512, ENV2_Y + 224), // salt
  largeQuads(ENV2_X + 640, ENV2_Y + 224), // sand
  largeQuads(ENV2_X + 768, ENV2_Y + 224), // dune
  largeQuads(ENV2_X + 896, ENV2_Y + 224), // dacite
];
// flare lives on a gutter row (see the mech-part note below) — its old cell
// at (384,0) had dirt within a mip-3 texel below and the ring to its right
export const UV_FLARE = uv(32, 704, 64, 64);
// horizon (72px) and zenith (112px) outgrow the 64px flyer cell, so they take
// 128px cells at the head of the new y=1024 band. Both keep well past the 4px
// mip-3 margin even after the 3px outline dilation (zenith, the tighter of
// the two, still clears 5px)
export const UV_HORIZON = uv(0, 1024, 128, 128);
export const UV_ZENITH = uv(128, 1024, 128, 128);
// scorch's turret top rides the same fresh band. The cell must hug the art
// EXACTLY like duo's and hail's do (64px art, 64px cell): the renderer maps
// the whole cell onto a size*CELL quad, so a 64px sprite parked inside a
// 128px cell would draw at half scale beside its size-1 neighbours. The
// mip-3 margin comes from the empty band around it, not from cell padding
export const UV_SCORCH = uv(288, 1056, 64, 64);
// a plain filled white circle: the particle Mindustry's Fill.circle draws
// by the dozen in every flame effect. UV_SOLID cannot stand in for it — a
// square particle reads as a pixel cloud, not a tongue of fire
export const UV_DISC = uv(384, 1024, 64, 64);
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
export const UV_DISC_BIG = uv(1472, 2944, 256, 256);
// mechanical spawn-pad tile — currently unused: drop zones are shown as
// overlay circles, and no terrain pass paints spawn cells any more
export const UV_SPAWN = uv(0, 192, 64, 64, 2);
export const UV_RING = uv(448, 0, 64, 64);
// a plain opaque texel, for geometry the renderer strokes itself: Lines.circle
// draws a constant-width ring, which a scaled ring SPRITE cannot do (its band
// fattens with the radius). It sits in the 64px gutter BETWEEN the grass and
// stone floor-edge blocks — those blocks run x=16..208 and x=272..464 down
// the whole y=768..960 band, and most of their art is transparent, so an
// empty-looking hole in there is still spoken for. Inset well past the mip-3
// footprint so every sampled level stays pure white
export const UV_SOLID = uv(224, 928, 32, 32, 8);
// row 2: 128px cells — turret base, turret top, the player's base
export const UV_TOWER_BASE = uv(64, 128, 128, 128);
export const UV_TURRET = uv(192, 128, 128, 128);
export const UV_BASE = uv(320, 128, 160, 160);
// row 4 (y=384): scatter turret top
export const UV_SCATTER = uv(0, 384, 128, 128);
// fuse rides at native 96px (like block-3): stretching the 96px source to
// a 128 cell was a 1.33x non-integer upscale that shredded its antialiasing
export const UV_FUSE = uv(208, 400, 96, 96);
export const UV_TOWER_BASE3 = uv(384, 384, 96, 96); // block-3 at native 96px
// duo turret top and its 1x1 base, tucked under the tri cell
export const UV_DUO = uv(128, 448, 64, 64);
export const UV_TOWER_BASE1 = uv(320, 448, 64, 64);
// hail turret top, riding the gutter row beside the flare (128px pitch,
// see the mech-part note)
export const UV_HAIL = uv(160, 704, 64, 64);
// row at y=576: mech part cells — leg, chassis, body, gun per ground
// kind, each source centered at native size in a 64px cell, facing +x.
// Unit cells ride a 128px pitch so everything within a mip-3 texel (4px,
// TEXTURE_MAX_LEVEL=3) of each cell border is transparent: flush-packed
// cells bled their neighbors' pixels into the quad edges as a faint line
// under LINEAR_MIPMAP_LINEAR when zoomed out. Keep >=4px of transparent
// margin (or a gutter) around anything drawn as a rotating quad
export const UV_DAGGER_LEG = uv(32, 576, 64, 64);
export const UV_DAGGER_BASE = uv(160, 576, 64, 64);
export const UV_DAGGER_BODY = uv(288, 576, 64, 64);
export const UV_LARGE_WEAPON = uv(416, 576, 64, 64);
export const UV_MACE_LEG = uv(544, 576, 64, 64);
export const UV_MACE_BASE = uv(672, 576, 64, 64);
export const UV_MACE_BODY = uv(800, 576, 64, 64);
export const UV_FLAMETHROWER = uv(928, 576, 64, 64);
// row at y=960: the same eight part cells, but as solid #565666 silhouettes
// dilated by the official 3px outline radius. pushMech lays these under the
// whole walking assembly so one rim traces the unit's outer silhouette —
// per-part baked outlines drew a line at every seam of the animated mech
export const UV_DAGGER_LEG_SIL = uv(32, 960, 64, 64);
export const UV_DAGGER_BASE_SIL = uv(160, 960, 64, 64);
export const UV_DAGGER_BODY_SIL = uv(288, 960, 64, 64);
export const UV_LARGE_WEAPON_SIL = uv(416, 960, 64, 64);
export const UV_MACE_LEG_SIL = uv(544, 960, 64, 64);
export const UV_MACE_BASE_SIL = uv(672, 960, 64, 64);
export const UV_MACE_BODY_SIL = uv(800, 960, 64, 64);
export const UV_FLAMETHROWER_SIL = uv(928, 960, 64, 64);
// fortress parts ride 128px cells — the T3 art outgrows the 64px cells
// above (body 100x80, leg 80x60 at native scale). The art row fills the
// free strip right of block-3 at y=384; the silhouette row sits in the
// free space right of the base at y=128. Cells are 128px wide so even the
// 3px-dilated silhouettes keep >=4px of transparent margin (see the
// mip-bleed note on the mech row)
export const UV_FORTRESS_LEG = uv(512, 384, 128, 128);
export const UV_FORTRESS_BASE = uv(640, 384, 128, 128);
export const UV_FORTRESS_BODY = uv(768, 384, 128, 128);
export const UV_ARTILLERY = uv(896, 384, 128, 128);
export const UV_FORTRESS_LEG_SIL = uv(512, 128, 128, 128);
export const UV_FORTRESS_BASE_SIL = uv(640, 128, 128, 128);
export const UV_FORTRESS_BODY_SIL = uv(768, 128, 128, 128);
export const UV_ARTILLERY_SIL = uv(896, 128, 128, 128);
// crawler parts: 64px cells flush-packed at y=288, a 32px gutter above the
// fortress art strip. The 48px sources keep >=5px transparent margins even
// silhouette-dilated, so unlike the full-bleed mace cells these don't need
// the 128px pitch
// the support line (nova T1, pulsar T2) rides the two free full-width rows
// at y=512 and y=640, same 128px pitch as the mech strip above: art in the
// left four cells, silhouettes in the right four. Every part clears the 4px
// mip-3 margin even after the silhouette's 3px dilation — pulsar's 68x58
// body and 64px leg overhang their cells only with transparent padding
export const UV_NOVA_LEG = uv(32, 512, 64, 64);
export const UV_NOVA_BASE = uv(160, 512, 64, 64);
export const UV_NOVA_BODY = uv(288, 512, 64, 64);
export const UV_HEAL_WEAPON = uv(416, 512, 64, 64);
export const UV_NOVA_LEG_SIL = uv(544, 512, 64, 64);
export const UV_NOVA_BASE_SIL = uv(672, 512, 64, 64);
export const UV_NOVA_BODY_SIL = uv(800, 512, 64, 64);
export const UV_HEAL_WEAPON_SIL = uv(928, 512, 64, 64);
export const UV_PULSAR_LEG = uv(32, 640, 64, 64);
export const UV_PULSAR_BASE = uv(160, 640, 64, 64);
export const UV_PULSAR_BODY = uv(288, 640, 64, 64);
export const UV_HEAL_SHOTGUN = uv(416, 640, 64, 64);
export const UV_PULSAR_LEG_SIL = uv(544, 640, 64, 64);
export const UV_PULSAR_BASE_SIL = uv(672, 640, 64, 64);
export const UV_PULSAR_BODY_SIL = uv(800, 640, 64, 64);
export const UV_HEAL_SHOTGUN_SIL = uv(928, 640, 64, 64);
/**
 * The support line's T3 outgrows those 64px cells: every quasar part ships
 * on an 80x80 source (its leg alone reaches 35px off centre, past the 32px
 * a 64 cell can hold), so the line's last row takes the fortress treatment
 * — 128px cells on the free full-width band at y=1664, art in the left four
 * and silhouettes in the right four. Double the cell with double the sprite
 * box keeps world px per native px identical to the rest of the roster.
 */
export const UV_QUASAR_LEG = uv(0, 1664, 128, 128);
export const UV_QUASAR_BASE = uv(128, 1664, 128, 128);
export const UV_QUASAR_BODY = uv(256, 1664, 128, 128);
export const UV_BEAM_WEAPON = uv(384, 1664, 128, 128);
export const UV_QUASAR_LEG_SIL = uv(512, 1664, 128, 128);
export const UV_QUASAR_BASE_SIL = uv(640, 1664, 128, 128);
export const UV_QUASAR_BODY_SIL = uv(768, 1664, 128, 128);
export const UV_BEAM_WEAPON_SIL = uv(896, 1664, 128, 128);
/**
 * A solid white hexagon filling its cell's width, for the one shape a
 * force field is ever drawn as. It is filled into the shield buffer
 * OPAQUE and the shader reads that buffer's alpha to find the outline, so
 * this has to be one unbroken quad: fanning it out of UV_TRI leaves
 * hairline joins where neighbouring triangles meet, and the edge detect
 * would faithfully draw a rim down every one of them.
 *
 * The cell is 256px for the edge's sake, not the shape's — the atlas
 * magnifies NEAREST, and a coarser cell stairsteps the diagonals the
 * shader then outlines.
 *
 * The hexagon is inscribed in the cell across the flats of its vertex
 * pair, so a quad of 2 x radius on BOTH axes draws it at exactly `radius`
 * — its shorter axis is the sprite's own transparent margin.
 */
export const UV_HEX = uv(0, 1792, 256, 256, 2);
/**
 * The T4 line rides the fresh 1024-tall band at y=2048, on 256px cells:
 * scepter's hull alone is a 170x140 source, half again as wide as the
 * 128px cells the T3s sit in. Every part shares the one cell size because
 * a mech draws all of its quads at MechArt.sprite, and 256px at the
 * roster's usual 0.625 world px per native px is UNIT_SPRITE * 4.
 *
 * Art and silhouette sit side by side, two cells to a part.
 */
export const UV_SCEPTER_BODY = uv(0, 2048, 256, 256);
export const UV_SCEPTER_BODY_SIL = uv(256, 2048, 256, 256);
export const UV_SCEPTER_LEG = uv(512, 2048, 256, 256);
export const UV_SCEPTER_LEG_SIL = uv(768, 2048, 256, 256);
export const UV_SCEPTER_BASE = uv(0, 2304, 256, 256);
export const UV_SCEPTER_BASE_SIL = uv(256, 2304, 256, 256);
export const UV_SCEPTER_WEAPON = uv(512, 2304, 256, 256);
export const UV_SCEPTER_WEAPON_SIL = uv(768, 2304, 256, 256);
export const UV_SCEPTER_MOUNT = uv(0, 2560, 256, 256);
export const UV_SCEPTER_MOUNT_SIL = uv(256, 2560, 256, 256);
/**
 * arkyid's small parts share the free right half of the scepter mount's
 * row: foot and base-joint on 128px cells (their 70px sources keep a wide
 * margin there), and the two leg SEGMENTS below them on the exact rects
 * their art occupies — a stretched segment samples its cell corner to
 * corner, so its UV has to be the art and nothing else.
 */
export const UV_ARKYID_FOOT = uv(512, 2560, 128, 128);
export const UV_ARKYID_FOOT_SIL = uv(640, 2560, 128, 128);
export const UV_ARKYID_JOINT_BASE = uv(768, 2560, 128, 128);
export const UV_ARKYID_JOINT_BASE_SIL = uv(896, 2560, 128, 128);
export const UV_ARKYID_LEG = uv(528, 2704, 56, 56);
export const UV_ARKYID_LEG_BASE = uv(640, 2700, 104, 64);
/**
 * The second T4 band, y=3072: vela and arkyid's big parts, plus antumbra.
 * Same 256px cells and same art-then-silhouette pairing as the scepter's
 * band above it — see that note for why the T4s need cells this size.
 *
 * antumbra takes a whole cell to itself: a flyer is one sprite with no
 * silhouette under-layer (see UNIT_ART), but at 216x240 native only
 * eclipse, in the T5 column, is a bigger single piece of art.
 */
export const UV_VELA_BODY = uv(0, 3072, 256, 256);
export const UV_VELA_BODY_SIL = uv(256, 3072, 256, 256);
export const UV_VELA_LEG = uv(512, 3072, 256, 256);
export const UV_VELA_LEG_SIL = uv(768, 3072, 256, 256);
export const UV_VELA_BASE = uv(0, 3328, 256, 256);
export const UV_VELA_BASE_SIL = uv(256, 3328, 256, 256);
export const UV_REPAIR_BEAM = uv(512, 3328, 256, 256);
export const UV_REPAIR_BEAM_SIL = uv(768, 3328, 256, 256);
export const UV_ARKYID_BODY = uv(0, 3584, 256, 256);
export const UV_ARKYID_BODY_SIL = uv(256, 3584, 256, 256);
export const UV_ARKYID_WEAPON = uv(512, 3584, 256, 256);
export const UV_ARKYID_WEAPON_SIL = uv(768, 3584, 256, 256);
export const UV_ARKYID_MOUNT = uv(0, 3840, 256, 256);
export const UV_ARKYID_MOUNT_SIL = uv(256, 3840, 256, 256);
export const UV_ANTUMBRA = uv(512, 3840, 256, 256);
// disrupt: the boss flyer, 243x243 of Erekir art in the last free 256px
// cell of the pre-T5 sheet, beside antumbra on the bottom band
export const UV_DISRUPT = uv(768, 3840, 256, 256);

/**
 * THE T5 COLUMN (x=1024..2048). Four units, laid out top down: reign's
 * mech parts on two 256px rows, then corvus's and toxopid's hulls, then
 * one 128px row of the small legged parts they share the shape of, the
 * bare leg-segment rects, and eclipse alone in a 384px cell.
 *
 * Cell sizes follow the same rule as every band before it — the cell is
 * what sets the world scale, so a 256px cell draws at UNIT_SPRITE * 4 and
 * keeps the sheet's constant 0.625 world px per native px. Nothing here is
 * scaled to fit; the art sits at native size inside a cell chosen to clear
 * the 4px mip-3 margin even after a silhouette's 3px dilation.
 */
export const UV_REIGN_BODY = uv(T5, 0, 256, 256);
export const UV_REIGN_BODY_SIL = uv(T5 + 256, 0, 256, 256);
export const UV_REIGN_BASE = uv(T5 + 512, 0, 256, 256);
export const UV_REIGN_BASE_SIL = uv(T5 + 768, 0, 256, 256);
export const UV_REIGN_LEG = uv(T5, 256, 256, 256);
export const UV_REIGN_LEG_SIL = uv(T5 + 256, 256, 256, 256);
export const UV_REIGN_WEAPON = uv(T5 + 512, 256, 256, 256);
export const UV_REIGN_WEAPON_SIL = uv(T5 + 768, 256, 256, 256);

export const UV_CORVUS_BODY = uv(T5, 512, 256, 256);
export const UV_CORVUS_BODY_SIL = uv(T5 + 256, 512, 256, 256);
export const UV_CORVUS_BASE = uv(T5 + 512, 512, 256, 256);
export const UV_CORVUS_BASE_SIL = uv(T5 + 768, 512, 256, 256);

export const UV_TOXOPID_BODY = uv(T5, 768, 256, 256);
export const UV_TOXOPID_BODY_SIL = uv(T5 + 256, 768, 256, 256);
export const UV_TOXOPID_CANNON = uv(T5 + 512, 768, 256, 256);
export const UV_TOXOPID_CANNON_SIL = uv(T5 + 768, 768, 256, 256);

// the small legged parts on one shared 128px row: corvus brings a knee cap
// (jointRegion) as well as a shoulder plate, toxopid — like the arkyid —
// brings only the plate and leaves its elbow as the bare segment overlap
export const UV_CORVUS_JOINT = uv(T5, 1024, 128, 128);
export const UV_CORVUS_JOINT_SIL = uv(T5 + 128, 1024, 128, 128);
export const UV_CORVUS_JOINT_BASE = uv(T5 + 256, 1024, 128, 128);
export const UV_CORVUS_JOINT_BASE_SIL = uv(T5 + 384, 1024, 128, 128);
export const UV_CORVUS_FOOT = uv(T5 + 512, 1024, 128, 128);
export const UV_CORVUS_FOOT_SIL = uv(T5 + 640, 1024, 128, 128);
export const UV_TOXOPID_JOINT_BASE = uv(T5 + 768, 1024, 128, 128);
export const UV_TOXOPID_JOINT_BASE_SIL = uv(T5 + 896, 1024, 128, 128);
export const UV_TOXOPID_FOOT = uv(T5, 1152, 128, 128);
export const UV_TOXOPID_FOOT_SIL = uv(T5 + 128, 1152, 128, 128);

// leg SEGMENTS: the cell is the art's exact rect, because a segment is
// stretched corner to corner between its endpoints rather than drawn into
// a quad (see pushSeg). Their strokes are the rect's height — Mindustry's
// Lines.stroke(legRegion.height) — so the cell may not carry any padding
export const UV_CORVUS_LEG = uv(T5, 1312, 30, 68);
export const UV_CORVUS_LEG_BASE = uv(T5 + 96, 1312, 30, 64);
export const UV_TOXOPID_LEG = uv(T5 + 192, 1312, 150, 72);
export const UV_TOXOPID_LEG_BASE = uv(T5 + 416, 1312, 270, 64);

// eclipse: 320x321 of art, the largest single piece on the sheet, in the
// only 384px cell there is. A 256 cell would have had to scale it down and
// broken the constant native-px-to-world-px the whole atlas rests on
export const UV_ECLIPSE = uv(T5, 1408, 384, 384);

/**
 * The two bullet regions, and the two shell regions, on the free band under
 * eclipse. Every one is packed WHITE and at its exact source size, which is
 * the only way BasicBulletType.draw comes out right.
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
 * 52 against the inner region's 28, and 32 of shell's 36 against 20. Drawn into the
 * same box it therefore sticks out fore and aft, which is the rim you see
 * on every Mindustry shot. Both face +x, like all the other rotated art.
 */
export const UV_BULLET = uv(T5, 1792, 52, 52);
export const UV_BULLET_BACK = uv(T5 + 64, 1792, 52, 52);
export const UV_SHELL = uv(T5 + 128, 1792, 36, 36);
export const UV_SHELL_BACK = uv(T5 + 176, 1792, 36, 36);
// the third pair: swarmer's warhead. 36x36 like the shell, and the same
// rule — white, source size, facing +x
export const UV_MISSILE = uv(T5 + 224, 1792, 36, 36);
export const UV_MISSILE_BACK = uv(T5 + 272, 1792, 36, 36);

/**
 * THE NAVAL BAND (x=1024, y=1920..2688) — the ten hulls of the two water
 * trees, on the free stretch of the T5 column between the bullet regions
 * and the turret tops.
 *
 * A ship is drawn exactly like a flyer: ONE quad, outlined at pack time,
 * turned to the heading the sim gave it. It has no legs to plant and no
 * chassis to slide, so there is nothing to assemble and nothing to
 * silhouette under — which is why this band is half the size the legged
 * T4 bands are for the same number of units. What a hull does have instead
 * is its wake, and that is geometry the renderer strokes from the solid
 * texel (see WakeSpec) rather than art on this sheet.
 *
 * Three cell sizes, chosen the usual way — the cell sets the world scale,
 * so each is the smallest power-of-two step that clears the art plus the
 * 4px mip-3 margin, and every one keeps the sheet's constant 0.625 world
 * px per native px.
 */
export const UV_RISSO = uv(T5, 1920, 128, 128);
export const UV_MINKE = uv(T5 + 128, 1920, 128, 128);
export const UV_RETUSA = uv(T5 + 256, 1920, 128, 128);
export const UV_OXYNOE = uv(T5 + 384, 1920, 128, 128);
export const UV_BRYDE = uv(T5, 2048, 256, 256);
export const UV_CYERCE = uv(T5 + 256, 2048, 256, 256);
export const UV_SEI = uv(T5 + 512, 2048, 256, 256);
export const UV_AEGIRES = uv(T5 + 768, 2048, 256, 256);
// the two T5 hulls take 384px cells, the size eclipse needed: omura is
// 264x351 of art and navanax 258x366, and a 256 cell would have had to
// scale them down and broken the constant native-px-to-world-px
export const UV_OMURA = uv(T5, 2304, 384, 384);
export const UV_NAVANAX = uv(T5 + 384, 2304, 384, 384);

/**
 * The early and mid turret tops, on the free band at y=2816. Each cell
 * hugs its art exactly, like every other turret top: the renderer maps the
 * whole cell onto a size*CELL quad, so a sprite parked inside a larger cell
 * would draw small. Mindustry block art is 32px a tile, so arc (size 1) is
 * a 32px source at 2x, lancer and parallax (size 2) are 64px at 2x, and
 * ripple takes the fuse treatment — 96px at NATIVE, because 96 into a 128
 * cell is the 1.33x upscale that shredded fuse's antialiasing.
 */
export const UV_ARC = uv(0, 2816, 64, 64);
export const UV_LANCER = uv(128, 2816, 128, 128);
export const UV_PARALLAX = uv(320, 2816, 128, 128);
export const UV_RIPPLE = uv(512, 2816, 96, 96);
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
 * less than half of what it should be.
 */
export const UV_PARALLAX_LASER = uv(772, 2860, 24, 4);
export const UV_PARALLAX_LASER_END = uv(668, 2844, 32, 32);
/**
 * The liquid turrets, on the free stretch of the same band between the
 * parallax beam cells and swarmer. Each is COMPOSITED AT PACK TIME — the
 * outlined turret, its `-liquid` window tinted water and drawn full (these
 * turrets consume nothing here), and the white `-top` gleam over it — so
 * the renderer draws one quad like any other top. Wave's 64px source
 * upscales 2x like lancer's; tsunami's 96 stays native like cyclone's.
 */
export const UV_WAVE = uv(832, 2816, 128, 128);
export const UV_TSUNAMI = uv(992, 2816, 96, 96);

/**
 * The late turret tops, on the free right half of the
 * atlas. Same rule as every other top — the cell hugs the art exactly,
 * because the renderer maps the whole cell onto a size*CELL quad.
 *
 * Mindustry block art is 32px a tile, so swarmer (size 2) is a 64px source
 * upscaled 2x, and cyclone (3) and the three size-4 tops are already 96 and
 * 128 and stay NATIVE — the same reasoning that keeps fuse and ripple
 * native, since anything but an integer upscale shreds their antialiasing.
 *
 * The 4x4 turret base rides with them: spectre, meltdown and foreshadow are
 * the first size-4 blocks in the game, so block-4 had never been packed.
 */
export const UV_SWARMER = uv(1152, 2816, 128, 128);
export const UV_CYCLONE = uv(1312, 2816, 96, 96);
export const UV_SPECTRE = uv(1440, 2816, 128, 128);
export const UV_MELTDOWN = uv(1600, 2816, 128, 128);
export const UV_FORESHADOW = uv(1760, 2816, 128, 128);
export const UV_TOWER_BASE4 = uv(1152, 2976, 128, 128);

/**
 * The shield tower (the Shield Towers mutator, mutation.ts): Mindustry's
 * force projector, 96px of 3x3 block art at native scale, on the free
 * stretch right of block-4. It never rotates — the renderer draws it
 * axis-aligned over its footprint like a tower base — and it is outlined
 * like every other block so it reads as a built thing, not floor decor.
 */
export const UV_SHIELD_TOWER = uv(1312, 2976, 96, 96);

/**
 * THE WALLS: 32px block art upscaled 2x into 64px cells like duo's, on
 * the free row under the vela/arkyid block. They never rotate and have no
 * turret base — the renderer draws the cell flat over the footprint and
 * nothing else — and they are outlined like every block so a wall reads
 * as built rather than as floor.
 */
// THE PLAYER'S WALLS sit in row 0's free tail at y 3008 (the small three)
// and in the gaps left of the vela at y 3072 (the 2x2 large three) — NOT at
// the second environment band's origin (1024, 3200), which is the moss
// floor: drawn there they painted wall art over half the band's floors
export const UV_COPPER_WALL = uv(0, 3008, 64, 64);
export const UV_TITANIUM_WALL = uv(64, 3008, 64, 64);
export const UV_THORIUM_WALL = uv(128, 3008, 64, 64);
/** the large walls: 64px block art upscaled 2x into 128px cells, like lancer's */
export const UV_COPPER_WALL_LARGE = uv(1280, 3072, 128, 128);
export const UV_TITANIUM_WALL_LARGE = uv(1728, 3072, 128, 128);
export const UV_THORIUM_WALL_LARGE = uv(1856, 3072, 128, 128);

export const UV_CRAWLER_LEG = uv(448, 288, 64, 64);
export const UV_CRAWLER_BASE = uv(512, 288, 64, 64);
export const UV_CRAWLER_BODY = uv(576, 288, 64, 64);
export const UV_CRAWLER_LEG_SIL = uv(640, 288, 64, 64);
export const UV_CRAWLER_BASE_SIL = uv(704, 288, 64, 64);
export const UV_CRAWLER_BODY_SIL = uv(768, 288, 64, 64);
// white isosceles triangle, base at -x edge, apex at +x — tinted at draw
// time for shrapnel rays (Drawf.tri)
export const UV_TRI = uv(320, 384, 64, 64, 2);
// row 3: 96px prop cells — overhanging 48px sources at 2x
/**
 * px cropped from every side of a prop cell. A prop is a shape on a
 * transparent ground, and its cell is cut to its art with nothing round
 * it, so the quad's edge sampled the atlas cell packed NEXT to it — the
 * large wall blocks above the second band's boulders, the turret sprites
 * under the first row's — and half a texel of that arrived along one side
 * of every prop as a faint edge. Four px is enough for the mips a prop is
 * drawn at, and every painted prop keeps its shape well clear of the rim
 * (the tightest, a pine's canopy, stops six px short of a 96px cell).
 */
const PROP_INSET = 4;
export const UV_PINE = uv(0, 288, 96, 96, PROP_INSET);
/**
 * THE FOREST KINDS, indexed by a pine prop's `kind`.
 *
 * A pine used to be the one prop with no variation at all — WALL_PINE
 * meant "the pine", and Prop.kind was documented as unused on one. It is
 * the index into this table now, so a map can be forested in the tree that
 * belongs to its biome; kind 0 is the original, so every pine already on
 * disk keeps drawing exactly what it drew.
 */
export const UV_PINES: readonly UVRect[] = [
  UV_PINE,
  e2(384, 128, 96, 96, PROP_INSET), // spore pine
  e2(480, 128, 96, 96, PROP_INSET), // snow pine
];
/**
 * Ground clutter, indexed by a decor prop's `kind`. Each cell is its
 * source at 2x and NOTHING MORE — the renderer maps the whole cell onto a
 * size x size quad, so a 40px sprite parked in a 96px cell would draw at
 * two thirds scale beside its neighbours. DECOR_TILES below is the other
 * half of that: how many TILES across each one is at native scale.
 */
export const UV_DECOR: readonly UVRect[] = [
  uv(96, 288, 96, 96, PROP_INSET), // boulder1
  uv(192, 288, 96, 96, PROP_INSET), // boulder2
  uv(288, 288, 64, 64, PROP_INSET), // shrubs1
  e2(576, 128, 80, 80, PROP_INSET), // spore cluster 1
  e2(656, 128, 80, 80, PROP_INSET), // spore cluster 2
  e2(736, 128, 80, 80, PROP_INSET), // spore cluster 3
  e2(816, 128, 64, 64, PROP_INSET), // purple bush
  e2(880, 128, 64, 64, PROP_INSET), // shale boulder 1
  e2(944, 128, 64, 64, PROP_INSET), // shale boulder 2
  e2(0, 352, 96, 96, PROP_INSET), // snow boulder 1
  e2(96, 352, 96, 96, PROP_INSET), // snow boulder 2
  e2(192, 352, 64, 64, PROP_INSET), // shrubs2
  e2(256, 352, 64, 64, PROP_INSET), // sand boulder 1
  e2(320, 352, 64, 64, PROP_INSET), // sand boulder 2
];
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
 * The crawler line's T2 and T3 are LEG units, not mechs: their parts ride
 * the empty 1024-wide band below y=1152 (the flyer band's tail), art and
 * silhouettes side by side on 128px cells like every other unit strip.
 *
 * Two cells break the 128px-cell rule on purpose. A leg SEGMENT is drawn
 * as a stretched quad between two moving points (Mindustry Lines.line), so
 * the atlas cell has to be the art's exact rect — any padding would be
 * stretched along with it. Both segment sprites fill their source rect
 * edge to edge, so they also get no silhouette: the dilation an outline
 * pass would add is clipped away at the rect, exactly as in Mindustry's
 * own packer, and the leg art carries its dark edging hand-drawn anyway.
 */
export const UV_ATRAX_BODY = uv(0, 1152, 128, 128);
export const UV_ATRAX_BASE = uv(128, 1152, 128, 128);
export const UV_ATRAX_WEAPON = uv(256, 1152, 128, 128);
export const UV_ATRAX_BODY_SIL = uv(384, 1152, 128, 128);
export const UV_ATRAX_BASE_SIL = uv(512, 1152, 128, 128);
export const UV_ATRAX_WEAPON_SIL = uv(640, 1152, 128, 128);
export const UV_ATRAX_JOINT = uv(768, 1152, 64, 64);
export const UV_ATRAX_FOOT = uv(896, 1152, 64, 64);
export const UV_ATRAX_JOINT_SIL = uv(0, 1280, 64, 64);
export const UV_ATRAX_FOOT_SIL = uv(128, 1280, 64, 64);
export const UV_ATRAX_LEG = uv(272, 1296, 36, 26);
export const UV_ATRAX_LEG_BASE = uv(336, 1296, 36, 26);
export const UV_SPIROCT_BODY = uv(0, 1408, 128, 128);
export const UV_SPIROCT_WEAPON = uv(128, 1408, 128, 128);
export const UV_SPIROCT_MOUNT = uv(256, 1408, 128, 128);
export const UV_SPIROCT_BODY_SIL = uv(384, 1408, 128, 128);
export const UV_SPIROCT_WEAPON_SIL = uv(512, 1408, 128, 128);
export const UV_SPIROCT_MOUNT_SIL = uv(640, 1408, 128, 128);
export const UV_SPIROCT_JOINT = uv(768, 1408, 64, 64);
export const UV_SPIROCT_FOOT = uv(896, 1408, 64, 64);
export const UV_SPIROCT_JOINT_SIL = uv(0, 1536, 64, 64);
export const UV_SPIROCT_FOOT_SIL = uv(128, 1536, 64, 64);
export const UV_SPIROCT_LEG = uv(272, 1552, 48, 34);
export const UV_SPIROCT_LEG_BASE = uv(352, 1552, 48, 34);

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
  // the fleet: one quad apiece, like the flyers, on the naval band's three
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
  // the fleet. Each ship is a single hull sprite — the naval types' own
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
  // parallax is filed under defense, not turrets — it damages almost
  // nothing and Mindustry classes it with the support blocks
  parallax: "/mindustry/sprites/blocks/defense/parallax.png",
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
  copperWall: "/mindustry/sprites/blocks/walls/copper-wall.png",
  titaniumWall: "/mindustry/sprites/blocks/walls/titanium-wall.png",
  thoriumWall: "/mindustry/sprites/blocks/walls/thorium-wall.png",
  // ...and the 2x2 large walls, 64px block art
  copperWallLarge: "/mindustry/sprites/blocks/walls/copper-wall-large.png",
  titaniumWallLarge: "/mindustry/sprites/blocks/walls/titanium-wall-large.png",
  thoriumWallLarge: "/mindustry/sprites/blocks/walls/thorium-wall-large.png",
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
function outlined(src: HTMLImageElement, color: string, radius: number): HTMLCanvasElement {
  const w = src.naturalWidth, h = src.naturalHeight;
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
 * A part's alpha shape dilated by the official outline radius and filled
 * solid with the unit outline color. Drawn under the whole walking assembly
 * (see pushMech), the union of these reads as a single rim around the
 * unit's outer silhouette, with no line at any part seam.
 */
function silhouetted(src: HTMLImageElement): HTMLCanvasElement {
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
 * Mindustry sprites face up; our shader treats rotation 0 as facing +x.
 * Pre-rotate 90° clockwise at composite time so runtime rotation stays a
 * single angle.
 */
function drawFacingRight(
  c: CanvasRenderingContext2D,
  src: CanvasImageSource,
  cx: number,
  cy: number,
  w: number,
  h = w,
): void {
  c.save();
  c.translate(cx, cy);
  c.rotate(Math.PI / 2);
  c.drawImage(src, -w / 2, -h / 2, w, h);
  c.restore();
}

/**
 * Composites the Mindustry sprites (GPL-3.0, github.com/Anuken/Mindustry)
 * into the game's single texture atlas. Swap any region — or the whole
 * source set — for custom art without touching the render pipeline.
 */
async function packAtlas(): Promise<HTMLCanvasElement> {
  const img = await loadImages();
  const a = document.createElement("canvas");
  a.width = ATLAS_W;
  a.height = ATLAS_H;
  const c = a.getContext("2d");
  if (!c) throw new Error("2d context unavailable for atlas build");
  c.imageSmoothingEnabled = false; // integer upscales keep the pixel art crisp

  // THE LAND FLOORS: painted, not loaded (game/tiles.ts). Each floor has
  // two paintings — one with a single mark on it, one plain — and three
  // slots, because every table downstream is three wide. The plain one
  // takes TWO of the three, so a mark lands on one cell in three: any
  // denser and the ground reads as a field of dots. They are 32px like
  // the sprites they replaced and ride the same antialias pass into the
  // same 64px cells
  const floor = (kind: FloorKind, slot: number): HTMLCanvasElement =>
    floorCanvas(kind, slot === 0 ? 0 : 1);
  c.drawImage(antialiased(floor("grass", 0)), 0, 0, 64, 64);
  c.drawImage(antialiased(floor("grass", 1)), 64, 0, 64, 64);
  c.drawImage(antialiased(floor("grass", 2)), 128, 0, 64, 64);
  // THE WALLS ARE PAINTED TOO (game/tiles.ts): two blocks a family, and a
  // 2×2 block where the family has a large cell. They ride the same
  // antialias pass the floors do
  const wall = (kind: WallKind, slot: number): HTMLCanvasElement =>
    wallCanvas(kind, slot % WALL_VARIANTS);
  const wallLarge = (kind: WallKind): HTMLCanvasElement => wallCanvas(kind, 0, 2);
  c.drawImage(antialiased(wall("stone", 0)), 192, 0, 64, 64);
  c.drawImage(antialiased(wall("stone", 1)), 256, 0, 64, 64);
  c.drawImage(antialiased(floor("stone", 0)), 64, 64, 64, 64);
  c.drawImage(antialiased(floor("stone", 1)), 128, 64, 64, 64);
  c.drawImage(antialiased(floor("stone", 2)), 192, 64, 64, 64);
  c.drawImage(antialiased(floor("dirt", 0)), 256, 64, 64, 64);
  c.drawImage(antialiased(floor("dirt", 1)), 320, 64, 64, 64);
  c.drawImage(antialiased(floor("dirt", 2)), 384, 64, 64, 64);
  c.drawImage(antialiased(wall("dirt", 0)), 448, 64, 64, 64);
  c.drawImage(antialiased(wall("dirt", 1)), 0, 128, 64, 64);
  c.drawImage(antialiased(wall("dark", 0)), 320, 0, 64, 64);
  c.drawImage(antialiased(wall("dark", 1)), 384, 0, 64, 64);
  // desert floors on row 0's free tail (see the UV_FLOORS note)
  c.drawImage(antialiased(floor("sand", 0)), 576, 0, 64, 64);
  c.drawImage(antialiased(floor("sand", 1)), 640, 0, 64, 64);
  c.drawImage(antialiased(floor("sand", 2)), 704, 0, 64, 64);
  c.drawImage(antialiased(floor("darksand", 0)), 768, 0, 64, 64);
  c.drawImage(antialiased(floor("darksand", 1)), 832, 0, 64, 64);
  c.drawImage(antialiased(floor("darksand", 2)), 896, 0, 64, 64);
  // water: each 32px source antialiased once, then blitted 3x3 at the same
  // 2x tile scale into its own 192px cell. The centre 64 is the tile a
  // floor quad draws; the ring is the headroom the water shader displaces
  // into (see the WATER_TILE note)
  //
  // The tiling happens at NATIVE size and the antialias pass runs ONCE over
  // the whole block, not once per copy. That ordering is the difference
  // between a sea and a chessboard: Pixmaps.antialias clips at its input's
  // edge, so nine separately-AA'd tiles carry nine sets of clipped borders
  // and the 64px grid of them is plainly visible across open water. Tiled
  // first, every interior seam has its true neighbour to average against
  // and disappears
  const waterCell = (src: HTMLImageElement, [wx, wy]: readonly [number, number]): void => {
    const reps = WATER_TILE / 64;
    const block = document.createElement("canvas");
    block.width = block.height = 32 * reps;
    const bc = block.getContext("2d");
    if (!bc) throw new Error("2d context unavailable for water tile");
    bc.imageSmoothingEnabled = false;
    for (let ry = 0; ry < reps; ry++)
      for (let rx = 0; rx < reps; rx++) bc.drawImage(src, rx * 32, ry * 32, 32, 32);
    c.drawImage(antialiased(block), wx, wy, WATER_TILE, WATER_TILE);
  };
  waterCell(img.shallowWater, WATER_SHALLOW_XY);
  waterCell(img.deepWater, WATER_DEEP_XY);
  // 2x2-tile "-large" wall art: 64px sources at the same 2x tile scale,
  // in the free block right of the dirt edge fades
  c.drawImage(antialiased(wallLarge("stone")), 736, 768, 128, 128);
  c.drawImage(antialiased(wallLarge("dark")), 864, 768, 128, 128);
  c.drawImage(antialiased(img.spawnPad), 0, 192, 64, 64);

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
  // the pack task antialiases generated edges like everything else
  c.drawImage(antialiased(makeEdge(floor("grass", 0))), 16, 768, 192, 192);
  c.drawImage(antialiased(makeEdge(floor("stone", 0))), 272, 768, 192, 192);
  c.drawImage(antialiased(makeEdge(floor("dirt", 0))), 528, 768, 192, 192);
  // darksand's edge fade, sliced into its nine scattered cells (see the
  // UV_FLOOR_EDGES note) — AA'd whole first, exactly once, like the blocks
  const dsEdge = antialiased(makeEdge(floor("darksand", 0)));
  for (let ry = 0; ry < 3; ry++)
    for (let rx = 0; rx < 3; rx++)
      c.drawImage(dsEdge, rx * 32, ry * 32, 32, 32, 416 + (ry * 3 + rx) * 64, 704, 64, 64);

  // THE PROPS ARE PAINTED TOO (game/tiles.ts): each at its native size,
  // 2x into a cell cut to it, through the same antialias pass
  const prop = (kind: PropKind, dx: number, dy: number, cell: number): void =>
    c.drawImage(antialiased(propCanvas(kind)), dx, dy, cell, cell);
  prop("pine", 0, 288, 96);
  prop("boulder0", 96, 288, 96);
  prop("boulder1", 192, 288, 96);
  prop("shrubs", 288, 288, 64);

  // ---------- the second environment band ----------
  // Same rules as row 0, one block over: 32px floor and wall sources at 2x
  // into 64px cells, 64px "-large" art at 2x into 128px cells, props at 2x
  // into cells cut to their own art, and a generated edge fade per land
  // family. The only reason it is written as loops rather than as the
  // hand-placed calls above is that there are eight families of each and a
  // list is the honest way to say so
  const at2 = (key: SpriteKey, dx: number, dy: number, cell: number): void =>
    c.drawImage(antialiased(img[key]), ENV2_X + dx, ENV2_Y + dy, cell, cell);
  // the band's land floors, painted like row 0's: three slots a family,
  // the third turned (see `floor` above); salt has the one cell
  const floors2: FloorKind[] = ["moss", "sporeMoss", "mud", "shale", "snow"];
  floors2.forEach((k, i) => {
    for (let slot = 0; slot < 3; slot++)
      c.drawImage(antialiased(floor(k, slot)), ENV2_X + (i * 3 + slot) * 64, ENV2_Y, 64, 64);
  });
  c.drawImage(antialiased(floor("salt", 0)), ENV2_X + 960, ENV2_Y, 64, 64);
  (["ice", "basalt"] as FloorKind[]).forEach((k, i) => {
    for (let slot = 0; slot < 3; slot++)
      c.drawImage(antialiased(floor(k, slot)), ENV2_X + (i * 3 + slot) * 64, ENV2_Y + 64, 64, 64);
  });
  // the band's walls, painted: a pair a family in UV_WALLS order, and the
  // 2×2 blocks on their own row in UV_WALL_LARGE order
  const rowB: WallKind[] = ["spore", "shale", "snow", "ice", "salt"];
  rowB.forEach((k, i) => {
    for (let v = 0; v < 2; v++)
      c.drawImage(antialiased(wall(k, v)), ENV2_X + (6 + i * 2 + v) * 64, ENV2_Y + 64, 64, 64);
  });
  const rowC: WallKind[] = ["sand", "dune", "dacite"];
  rowC.forEach((k, i) => {
    for (let v = 0; v < 2; v++)
      c.drawImage(antialiased(wall(k, v)), ENV2_X + (i * 2 + v) * 64, ENV2_Y + 128, 64, 64);
  });
  const larges: WallKind[] = ["spore", "shale", "snow", "ice", "salt", "sand", "dune", "dacite"];
  larges.forEach((k, i) =>
    c.drawImage(antialiased(wallLarge(k)), ENV2_X + i * 128, ENV2_Y + 224, 128, 128),
  );
  // the band's props, painted, each in a cell cut to its own size at 2x
  const prop2 = (kind: PropKind, dx: number, dy: number, cell: number): void =>
    prop(kind, ENV2_X + dx, ENV2_Y + dy, cell);
  prop2("sporePine", 384, 128, 96);
  prop2("snowPine", 480, 128, 96);
  prop2("sporeCluster0", 576, 128, 80);
  prop2("sporeCluster1", 656, 128, 80);
  prop2("sporeCluster2", 736, 128, 80);
  prop2("purBush", 816, 128, 64);
  prop2("shaleBoulder0", 880, 128, 64);
  prop2("shaleBoulder1", 944, 128, 64);
  prop2("snowBoulder0", 0, 352, 96);
  prop2("snowBoulder1", 96, 352, 96);
  prop2("shrubs2", 192, 352, 64);
  prop2("sandBoulder0", 256, 352, 64);
  prop2("sandBoulder1", 320, 352, 64);
  // one generated edge fade per land family, in UV_FLOOR_EDGES order
  const edges: FloorKind[] = ["moss", "sporeMoss", "mud", "shale", "snow"];
  edges.forEach((k, i) =>
    c.drawImage(antialiased(makeEdge(floor(k, 0))), ENV2_X + i * 192, ENV2_Y + 448, 192, 192),
  );
  const edges2: FloorKind[] = ["ice", "basalt", "salt"];
  edges2.forEach((k, i) =>
    c.drawImage(antialiased(makeEdge(floor(k, 0))), ENV2_X + i * 192, ENV2_Y + 640, 192, 192),
  );
  waterCell(img.taintedWater, WATER_TAINTED_XY);
  waterCell(img.deepTaintedWater, WATER_DEEP_TAINTED_XY);

  // mech parts (row y=576, 128px pitch — see the UV block note): each
  // source centered at native size in its own 64px cell so the renderer can
  // animate legs, chassis, guns and body as separate quads. The leg sprite
  // is pre-offset to one side — the renderer mirrors it for the other leg
  drawFacingRight(c, antialiased(img.daggerLeg), 64, 608, 48);
  drawFacingRight(c, antialiased(img.daggerBase), 192, 608, 48);
  drawFacingRight(c, antialiased(img.dagger), 320, 608, 48);
  drawFacingRight(c, antialiased(img.largeWeapon), 448, 608, 48);
  drawFacingRight(c, antialiased(img.maceLeg), 576, 608, 64);
  drawFacingRight(c, antialiased(img.maceBase), 704, 608, 64);
  drawFacingRight(c, antialiased(img.mace), 832, 608, 64);
  // flamethrower is 48x56 — rotate it to face +x by hand
  c.save();
  c.translate(960, 608);
  c.rotate(Math.PI / 2);
  c.drawImage(antialiased(img.flamethrower), -24, -28, 48, 56);
  c.restore();

  // fortress parts at native size in their 128px cells (see the UV note)
  drawFacingRight(c, antialiased(img.fortressLeg), 576, 448, 80, 60);
  drawFacingRight(c, antialiased(img.fortressBase), 704, 448, 64);
  drawFacingRight(c, antialiased(img.fortress), 832, 448, 100, 80);
  drawFacingRight(c, antialiased(img.artillery), 960, 448, 48, 56);

  // support line: each part at native size in its own cell, art left of the
  // silhouettes on the same row (see the UV note)
  drawFacingRight(c, antialiased(img.novaLeg), 64, 544, 48);
  drawFacingRight(c, antialiased(img.novaBase), 192, 544, 48);
  drawFacingRight(c, antialiased(img.nova), 320, 544, 56);
  drawFacingRight(c, antialiased(img.healWeapon), 448, 544, 48);
  drawFacingRight(c, silhouetted(img.novaLeg), 576, 544, 48);
  drawFacingRight(c, silhouetted(img.novaBase), 704, 544, 48);
  drawFacingRight(c, silhouetted(img.nova), 832, 544, 56);
  drawFacingRight(c, silhouetted(img.healWeapon), 960, 544, 48);
  drawFacingRight(c, antialiased(img.pulsarLeg), 64, 672, 64);
  drawFacingRight(c, antialiased(img.pulsarBase), 192, 672, 48);
  drawFacingRight(c, antialiased(img.pulsar), 320, 672, 68, 58);
  drawFacingRight(c, antialiased(img.healShotgun), 448, 672, 50);
  drawFacingRight(c, silhouetted(img.pulsarLeg), 576, 672, 64);
  drawFacingRight(c, silhouetted(img.pulsarBase), 704, 672, 48);
  drawFacingRight(c, silhouetted(img.pulsar), 832, 672, 68, 58);
  drawFacingRight(c, silhouetted(img.healShotgun), 960, 672, 50);
  // quasar's four parts on the 128px row (see the UV note): each 80x80
  // source at native size, so it keeps the 0.625 world-px-per-native-px
  // every other unit draws at
  drawFacingRight(c, antialiased(img.quasarLeg), 64, 1728, 80);
  drawFacingRight(c, antialiased(img.quasarBase), 192, 1728, 80);
  drawFacingRight(c, antialiased(img.quasar), 320, 1728, 80);
  drawFacingRight(c, antialiased(img.beamWeapon), 448, 1728, 80);
  drawFacingRight(c, silhouetted(img.quasarLeg), 576, 1728, 80);
  drawFacingRight(c, silhouetted(img.quasarBase), 704, 1728, 80);
  drawFacingRight(c, silhouetted(img.quasar), 832, 1728, 80);
  drawFacingRight(c, silhouetted(img.beamWeapon), 960, 1728, 80);

  // scepter parts on the T4 band's 256px cells (see the UV note): each
  // source at native size, so it keeps the 0.625 world px per native px
  // every other unit draws at
  drawFacingRight(c, antialiased(img.scepter), 128, 2176, 170, 140);
  drawFacingRight(c, silhouetted(img.scepter), 384, 2176, 170, 140);
  drawFacingRight(c, antialiased(img.scepterLeg), 640, 2176, 128);
  drawFacingRight(c, silhouetted(img.scepterLeg), 896, 2176, 128);
  drawFacingRight(c, antialiased(img.scepterBase), 128, 2432, 128);
  drawFacingRight(c, silhouetted(img.scepterBase), 384, 2432, 128);
  drawFacingRight(c, antialiased(img.scepterWeapon), 640, 2432, 56, 102);
  drawFacingRight(c, silhouetted(img.scepterWeapon), 896, 2432, 56, 102);
  drawFacingRight(c, antialiased(img.scepterMount), 128, 2688, 48);
  drawFacingRight(c, silhouetted(img.scepterMount), 384, 2688, 48);

  // vela's parts on the second T4 band, same 256px cells and same native
  // scale. Its main gun has no sprite (see the MECH_ART note) — the pair
  // of repair-beam pods is all there is to bolt on
  drawFacingRight(c, antialiased(img.vela), 128, 3200, 170, 140);
  drawFacingRight(c, silhouetted(img.vela), 384, 3200, 170, 140);
  drawFacingRight(c, antialiased(img.velaLeg), 640, 3200, 128);
  drawFacingRight(c, silhouetted(img.velaLeg), 896, 3200, 128);
  drawFacingRight(c, antialiased(img.velaBase), 128, 3456, 128);
  drawFacingRight(c, silhouetted(img.velaBase), 384, 3456, 128);
  drawFacingRight(c, antialiased(img.repairBeam), 640, 3456, 48);
  drawFacingRight(c, silhouetted(img.repairBeam), 896, 3456, 48);

  // arkyid: hull and guns on 256px cells, the sap gun being the spiroct's
  // own weapon sprite again — packed a second time here because a legged
  // unit draws every gun at its own LegArt.sprite, and arkyid's is 256
  drawFacingRight(c, antialiased(img.arkyid), 128, 3712, 128);
  drawFacingRight(c, silhouetted(img.arkyid), 384, 3712, 128);
  drawFacingRight(c, antialiased(img.spiroctWeapon), 640, 3712, 48, 56);
  drawFacingRight(c, silhouetted(img.spiroctWeapon), 896, 3712, 48, 56);
  drawFacingRight(c, antialiased(img.purpleMount), 128, 3968, 70, 97);
  drawFacingRight(c, silhouetted(img.purpleMount), 384, 3968, 70, 97);
  // arkyid's feet and shoulder plates on 128px cells, and the two leg
  // SEGMENTS on the exact rects their UVs name — a stretched segment
  // samples its cell corner to corner (see the UV note). The base joint
  // turns with the unit, unlike a knee cap, so it is packed facing +x
  drawFacingRight(c, antialiased(img.arkyidFoot), 576, 2624, 70);
  drawFacingRight(c, silhouetted(img.arkyidFoot), 704, 2624, 70);
  drawFacingRight(c, antialiased(img.arkyidJointBase), 832, 2624, 70);
  drawFacingRight(c, silhouetted(img.arkyidJointBase), 960, 2624, 70);
  c.drawImage(antialiased(img.arkyidLeg), 528, 2704, 56, 56);
  c.drawImage(antialiased(img.arkyidLegBase), 640, 2700, 104, 64);

  // antumbra: the same single-sprite treatment as every other flyer, at
  // native size in a 256px cell — at 216x240 only eclipse is bigger, and
  // it leaves only an 8px margin across its own cell
  drawFacingRight(
    c, antialiased(outlined(img.antumbra, UNIT_OUTLINE, UNIT_OUTLINE_R)), 640, 3968, 216, 240,
  );

  // disrupt: the boss, same single-quad flyer treatment as antumbra, at
  // native 243x243 in the cell beside it
  drawFacingRight(
    c, antialiased(outlined(img.disrupt, UNIT_OUTLINE, UNIT_OUTLINE_R)), 896, 3968, 243, 243,
  );

  // ---- the T5 column (x=1024) ----
  // reign: a mech like the scepter, so the same four parts on 256px cells.
  // reign-weapon is Weapon(x=21.5, y=1, top=false) — a gun slung under
  // each side of a chassis wide enough to carry it
  drawFacingRight(c, antialiased(img.reign), T5 + 128, 128, 214, 140);
  drawFacingRight(c, silhouetted(img.reign), T5 + 384, 128, 214, 140);
  drawFacingRight(c, antialiased(img.reignBase), T5 + 640, 128, 152, 124);
  drawFacingRight(c, silhouetted(img.reignBase), T5 + 896, 128, 152, 124);
  drawFacingRight(c, antialiased(img.reignLeg), T5 + 128, 384, 152, 124);
  drawFacingRight(c, silhouetted(img.reignLeg), T5 + 384, 384, 152, 124);
  drawFacingRight(c, antialiased(img.reignWeapon), T5 + 640, 384, 83, 138);
  drawFacingRight(c, silhouetted(img.reignWeapon), T5 + 896, 384, 83, 138);

  // corvus: hull and the plate its four legs mount to. It has NO gun cell
  // — Mindustry's Weapon("corvus-weapon") names a region that does not
  // exist in the sprite set (only a -heat overlay does), and Weapon.draw
  // skips a region it cannot find, so the charged laser you see in game is
  // painted into the hull itself. Same as the vela one tier below it
  drawFacingRight(c, antialiased(img.corvus), T5 + 128, 640, 214, 140);
  drawFacingRight(c, silhouetted(img.corvus), T5 + 384, 640, 214, 140);
  drawFacingRight(c, antialiased(img.corvusBase), T5 + 640, 640, 152, 124);
  drawFacingRight(c, silhouetted(img.corvusBase), T5 + 896, 640, 152, 124);

  // toxopid: hull and the one centered cannon (mirror=false, x=0, y=-14).
  // Its other weapon is the large purple mount the arkyid already carries,
  // packed once at UV_ARKYID_MOUNT and shared — both units draw their guns
  // at the same 256px cell scale, so the cell is reusable as it stands
  drawFacingRight(c, antialiased(img.toxopid), T5 + 128, 896, 160, 190);
  drawFacingRight(c, silhouetted(img.toxopid), T5 + 384, 896, 160, 190);
  drawFacingRight(c, antialiased(img.toxopidCannon), T5 + 640, 896, 206, 220);
  drawFacingRight(c, silhouetted(img.toxopidCannon), T5 + 896, 896, 206, 220);

  // the small legged parts. A JOINT is drawn with no rotation at all in
  // Mindustry, so its cell is packed upright; a base joint turns with the
  // unit and a foot turns with its leg, so both are packed facing +x
  c.drawImage(antialiased(img.corvusJoint), T5 + 58, 1058, 60, 60);
  c.drawImage(silhouetted(img.corvusJoint), T5 + 186, 1058, 60, 60);
  drawFacingRight(c, antialiased(img.corvusJointBase), T5 + 320, 1088, 70);
  drawFacingRight(c, silhouetted(img.corvusJointBase), T5 + 448, 1088, 70);
  drawFacingRight(c, antialiased(img.corvusFoot), T5 + 576, 1088, 90);
  drawFacingRight(c, silhouetted(img.corvusFoot), T5 + 704, 1088, 90);
  drawFacingRight(c, antialiased(img.toxopidJointBase), T5 + 832, 1088, 70);
  drawFacingRight(c, silhouetted(img.toxopidJointBase), T5 + 960, 1088, 70);
  drawFacingRight(c, antialiased(img.toxopidFoot), T5 + 64, 1216, 90);
  drawFacingRight(c, silhouetted(img.toxopidFoot), T5 + 192, 1216, 90);

  // the four leg segments on the exact rects their UVs name. toxopid's
  // lower segment is 270px of art for a 150px upper one: legExtension 20
  // runs it back over its own knee, and the length it covers is the
  // segment plus that overhang
  c.drawImage(antialiased(img.corvusLeg), T5, 1312, 30, 68);
  c.drawImage(antialiased(img.corvusLegBase), T5 + 96, 1312, 30, 64);
  c.drawImage(antialiased(img.toxopidLeg), T5 + 192, 1312, 150, 72);
  c.drawImage(antialiased(img.toxopidLegBase), T5 + 416, 1312, 270, 64);

  // eclipse: one outlined quad like every flyer, at native size in the
  // sheet's only 384px cell
  drawFacingRight(
    c, antialiased(outlined(img.eclipse, UNIT_OUTLINE, UNIT_OUTLINE_R)),
    T5 + 192, 1600, 320, 321,
  );

  // the naval band: every hull outlined and antialiased like a flyer, at
  // native size in the cell its UV names (see the UV_RISSO note)
  const hull = (
    src: HTMLImageElement, cx: number, cy: number, w: number, h: number,
  ): void =>
    drawFacingRight(c, antialiased(outlined(src, UNIT_OUTLINE, UNIT_OUTLINE_R)), cx, cy, w, h);
  hull(img.risso, T5 + 64, 1984, 70, 78);
  hull(img.minke, T5 + 192, 1984, 88, 101);
  hull(img.retusa, T5 + 320, 1984, 70, 78);
  hull(img.oxynoe, T5 + 448, 1984, 88, 101);
  hull(img.bryde, T5 + 128, 2176, 140, 140);
  hull(img.cyerce, T5 + 384, 2176, 140, 140);
  hull(img.sei, T5 + 640, 2176, 198, 228);
  hull(img.aegires, T5 + 896, 2176, 218, 241);
  hull(img.omura, T5 + 192, 2496, 264, 351);
  hull(img.navanax, T5 + 576, 2496, 258, 366);

  // crawler parts: art then silhouettes, one flush 64px run (see UV note)
  drawFacingRight(c, antialiased(img.crawlerLeg), 480, 320, 48);
  drawFacingRight(c, antialiased(img.crawlerBase), 544, 320, 48);
  drawFacingRight(c, antialiased(img.crawler), 608, 320, 48);
  drawFacingRight(c, silhouetted(img.crawlerLeg), 672, 320, 48);
  drawFacingRight(c, silhouetted(img.crawlerBase), 736, 320, 48);
  drawFacingRight(c, silhouetted(img.crawler), 800, 320, 48);

  // the legged crawler line (see the UV note): body, mount plate and guns
  // face +x on 128px cells, feet the same on 64px ones. A JOINT is drawn
  // with no rotation at all in Mindustry, so its cell is packed upright.
  drawFacingRight(c, antialiased(img.atrax), 64, 1216, 88, 64);
  drawFacingRight(c, antialiased(img.atraxBase), 192, 1216, 64);
  drawFacingRight(c, antialiased(img.atraxWeapon), 320, 1216, 48, 56);
  drawFacingRight(c, silhouetted(img.atrax), 448, 1216, 88, 64);
  drawFacingRight(c, silhouetted(img.atraxBase), 576, 1216, 64);
  drawFacingRight(c, silhouetted(img.atraxWeapon), 704, 1216, 48, 56);
  c.drawImage(antialiased(img.atraxJoint), 787, 1171, 26, 26);
  drawFacingRight(c, antialiased(img.atraxFoot), 928, 1184, 40);
  c.drawImage(silhouetted(img.atraxJoint), 19, 1299, 26, 26);
  drawFacingRight(c, silhouetted(img.atraxFoot), 160, 1312, 40);
  // segments: the cell IS the art, so these are drawn unrotated, at native
  // size, exactly on the rect their UVs name
  c.drawImage(antialiased(img.atraxLeg), 272, 1296, 36, 26);
  c.drawImage(antialiased(img.atraxLegBase), 336, 1296, 36, 26);

  drawFacingRight(c, antialiased(img.spiroct), 64, 1472, 94, 75);
  drawFacingRight(c, antialiased(img.spiroctWeapon), 192, 1472, 48, 56);
  drawFacingRight(c, antialiased(img.spiroctMount), 320, 1472, 48);
  drawFacingRight(c, silhouetted(img.spiroct), 448, 1472, 94, 75);
  drawFacingRight(c, silhouetted(img.spiroctWeapon), 576, 1472, 48, 56);
  drawFacingRight(c, silhouetted(img.spiroctMount), 704, 1472, 48);
  c.drawImage(antialiased(img.spiroctJoint), 784, 1424, 32, 32);
  drawFacingRight(c, antialiased(img.spiroctFoot), 928, 1440, 46);
  c.drawImage(silhouetted(img.spiroctJoint), 16, 1552, 32, 32);
  drawFacingRight(c, silhouetted(img.spiroctFoot), 160, 1568, 46);
  c.drawImage(antialiased(img.spiroctLeg), 272, 1552, 48, 34);
  c.drawImage(antialiased(img.spiroctLegBase), 352, 1552, 48, 34);

  // silhouette row (y=960): each part again as a solid dilated shape — the
  // under-layer pushMech uses for the unit's single outer rim
  drawFacingRight(c, silhouetted(img.daggerLeg), 64, 992, 48);
  drawFacingRight(c, silhouetted(img.daggerBase), 192, 992, 48);
  drawFacingRight(c, silhouetted(img.dagger), 320, 992, 48);
  drawFacingRight(c, silhouetted(img.largeWeapon), 448, 992, 48);
  drawFacingRight(c, silhouetted(img.maceLeg), 576, 992, 64);
  drawFacingRight(c, silhouetted(img.maceBase), 704, 992, 64);
  drawFacingRight(c, silhouetted(img.mace), 832, 992, 64);
  c.save();
  c.translate(960, 992);
  c.rotate(Math.PI / 2);
  c.drawImage(silhouetted(img.flamethrower), -24, -28, 48, 56);
  c.restore();
  drawFacingRight(c, silhouetted(img.fortressLeg), 576, 192, 80, 60);
  drawFacingRight(c, silhouetted(img.fortressBase), 704, 192, 64);
  drawFacingRight(c, silhouetted(img.fortress), 832, 192, 100, 80);
  drawFacingRight(c, silhouetted(img.artillery), 960, 192, 48, 56);

  // flare: a flying unit is one sprite — no legs, no chassis
  const flare = document.createElement("canvas");
  flare.width = flare.height = 64;
  const fc = flare.getContext("2d");
  if (!fc) throw new Error("2d context unavailable");
  fc.imageSmoothingEnabled = false;
  fc.drawImage(antialiased(outlined(img.flare, UNIT_OUTLINE, UNIT_OUTLINE_R)), 8, 8, 48, 48);
  drawFacingRight(c, flare, 64, 736, 64);

  // horizon and zenith: same single-sprite treatment as flare, at native
  // size in their own 128px cells
  drawFacingRight(c, antialiased(outlined(img.horizon, UNIT_OUTLINE, UNIT_OUTLINE_R)), 64, 1088, 72);
  drawFacingRight(c, antialiased(outlined(img.zenith, UNIT_OUTLINE, UNIT_OUTLINE_R)), 192, 1088, 112);

  // the six bullet regions, white and at source size, facing +x. See the
  // UV_BULLET note: the renderer lays the -back region under the inner one on
  // one rect and tints each with the firing ammo's own colour, exactly as
  // BasicBulletType.draw does
  drawFacingRight(c, antialiased(img.bullet), T5 + 26, 1818, 52);
  drawFacingRight(c, antialiased(img.bulletBack), T5 + 90, 1818, 52);
  drawFacingRight(c, antialiased(img.shell), T5 + 146, 1810, 36);
  drawFacingRight(c, antialiased(img.shellBack), T5 + 194, 1810, 36);
  drawFacingRight(c, antialiased(img.missile), T5 + 242, 1810, 36);
  drawFacingRight(c, antialiased(img.missileBack), T5 + 290, 1810, 36);

  // ring (448,0) — procedural
  c.strokeStyle = "#ffffff";
  c.lineWidth = 5;
  c.beginPath();
  c.arc(480, 32, 22, 0, TAU);
  c.stroke();

  // solid texel (224,928) — the stroke source for procedural lines
  c.fillStyle = "#ffffff";
  c.fillRect(224, 928, 32, 32);

  // flame particle disc (384,1024) — procedural, inset well past the 4px
  // mip-3 footprint so the cell's rim never bleeds into its neighbours
  c.fillStyle = "#ffffff";
  c.beginPath();
  c.arc(416, 1056, 27, 0, TAU);
  c.fill();

  // the shield domes' disc (1472,2944) — the same shape at 256px, with a
  // 4px inset so the antialiased rim keeps clear of the cell edge and no
  // mip level can drag a neighbour into it (see UV_DISC_BIG)
  c.fillStyle = "#ffffff";
  c.beginPath();
  c.arc(1600, 3072, 124, 0, TAU);
  c.fill();

  // turret base: 64px block-2 upscaled 2x into a 128px cell
  c.drawImage(antialiased(img.towerBase), 64, 128, 128, 128);

  // salvo top: the preview sprite is the fully assembled turret — face right
  c.imageSmoothingEnabled = false;
  drawFacingRight(c, antialiased(outlined(img.salvoPreview, BLOCK_OUTLINE, BLOCK_OUTLINE_R)), 256, 192, 128);

  // scatter top, same treatment
  drawFacingRight(c, antialiased(outlined(img.scatterPreview, BLOCK_OUTLINE, BLOCK_OUTLINE_R)), 64, 448, 128);

  // hail top: the bare turret head (no preview exists — the renderer draws
  // the block-1 base underneath anyway), 32px source upscaled 2x
  drawFacingRight(c, antialiased(outlined(img.hail, BLOCK_OUTLINE, BLOCK_OUTLINE_R)), 192, 736, 64);

  // fuse top: size-3 turret art, facing +x like the others
  drawFacingRight(c, antialiased(outlined(img.fuse, BLOCK_OUTLINE, BLOCK_OUTLINE_R)), 256, 448, 96);
  // 3x3 turret base at native 96px
  c.drawImage(antialiased(img.towerBase3), 384, 384, 96, 96);

  // scorch top: 32px source upscaled 2x, filling its 64px cell like duo's
  drawFacingRight(c, antialiased(outlined(img.scorch, BLOCK_OUTLINE, BLOCK_OUTLINE_R)), 320, 1088, 64);

  // the early and mid turret tops (see the UV note): arc, lancer and
  // parallax upscale 2x like duo's, ripple stays native like fuse's
  drawFacingRight(c, antialiased(outlined(img.arc, BLOCK_OUTLINE, BLOCK_OUTLINE_R)), 32, 2848, 64);
  drawFacingRight(c, antialiased(outlined(img.lancer, BLOCK_OUTLINE, BLOCK_OUTLINE_R)), 192, 2880, 128);
  drawFacingRight(c, antialiased(outlined(img.parallax, BLOCK_OUTLINE, BLOCK_OUTLINE_R)), 384, 2880, 128);
  drawFacingRight(c, antialiased(outlined(img.ripple, BLOCK_OUTLINE, BLOCK_OUTLINE_R)), 560, 2864, 96);
  // parallax's beam: the end glow at native size, and the line rotated so
  // its length runs along the +x axis pushSeg stretches
  drawFacingRight(c, antialiased(img.parallaxLaserEnd), 684, 2860, 72);
  drawFacingRight(c, antialiased(img.parallaxLaser), 784, 2862, 4, 48);
  // the liquid turrets, composited flat (see liquidTurret and the UV note):
  // wave's 64px source at 2x like lancer's, tsunami's 96 native like
  // cyclone's
  drawFacingRight(c, antialiased(liquidTurret(img.wave, img.waveLiquid, img.waveTop)), 896, 2880, 128);
  drawFacingRight(c, antialiased(liquidTurret(img.tsunami, img.tsunamiLiquid, img.tsunamiTop)), 1040, 2864, 96);

  // the late tops (see the UV note): swarmer upscales
  // 2x like lancer's, and cyclone and the three size-4 heads stay native
  drawFacingRight(c, antialiased(outlined(img.swarmer, BLOCK_OUTLINE, BLOCK_OUTLINE_R)), 1216, 2880, 128);
  drawFacingRight(c, antialiased(outlined(img.cyclonePreview, BLOCK_OUTLINE, BLOCK_OUTLINE_R)), 1360, 2864, 96);
  drawFacingRight(c, antialiased(outlined(img.spectre, BLOCK_OUTLINE, BLOCK_OUTLINE_R)), 1504, 2880, 128);
  drawFacingRight(c, antialiased(outlined(img.meltdown, BLOCK_OUTLINE, BLOCK_OUTLINE_R)), 1664, 2880, 128);
  drawFacingRight(c, antialiased(outlined(img.foreshadow, BLOCK_OUTLINE, BLOCK_OUTLINE_R)), 1824, 2880, 128);
  // ...and the 4x4 base under the last three, at native 128px like block-3
  c.drawImage(antialiased(img.towerBase4), 1152, 2976, 128, 128);
  // the shield tower beside it, native 96px, outlined like the blocks —
  // NOT drawFacingRight: the structure never rotates, so its art stays
  // exactly as authored
  c.drawImage(antialiased(outlined(img.shieldTower, BLOCK_OUTLINE, BLOCK_OUTLINE_R)), 1312, 2976, 96, 96);
  // the walls, flat like the shield tower (they never rotate), 32px
  // sources upscaled 2x into their 64px cells (see UV_COPPER_WALL)
  c.drawImage(antialiased(outlined(img.copperWall, BLOCK_OUTLINE, BLOCK_OUTLINE_R)), 0, 3008, 64, 64);
  c.drawImage(antialiased(outlined(img.titaniumWall, BLOCK_OUTLINE, BLOCK_OUTLINE_R)), 64, 3008, 64, 64);
  c.drawImage(antialiased(outlined(img.thoriumWall, BLOCK_OUTLINE, BLOCK_OUTLINE_R)), 128, 3008, 64, 64);
  c.drawImage(antialiased(outlined(img.copperWallLarge, BLOCK_OUTLINE, BLOCK_OUTLINE_R)), 1280, 3072, 128, 128);
  c.drawImage(antialiased(outlined(img.titaniumWallLarge, BLOCK_OUTLINE, BLOCK_OUTLINE_R)), 1728, 3072, 128, 128);
  c.drawImage(antialiased(outlined(img.thoriumWallLarge, BLOCK_OUTLINE, BLOCK_OUTLINE_R)), 1856, 3072, 128, 128);

  // duo top and 1x1 base: 32px sources upscaled 2x into 64px cells
  drawFacingRight(c, antialiased(outlined(img.duoPreview, BLOCK_OUTLINE, BLOCK_OUTLINE_R)), 160, 480, 64);
  c.drawImage(antialiased(img.towerBase1), 320, 448, 64, 64);

  // shrapnel triangle (320,384): white, base on the left edge, apex right;
  // the renderer stretches and tints it into Drawf.tri shapes.
  //
  // Drawn to the cell's 2px UV inset EXACTLY, corner to corner, rather than
  // sitting a pixel inside it. Fanning a filled polygon out of these
  // (Renderer.fillPoly) lays neighbouring triangles slope against slope,
  // and a slope even a texel short leaves a radial seam down every one of
  // those joins; a texel proud leaves a doubled-alpha one instead.
  c.fillStyle = "#ffffff";
  c.beginPath();
  c.moveTo(322, 386);
  c.lineTo(322, 446);
  c.lineTo(382, 416);
  c.closePath();
  c.fill();

  // force field hexagon (0,1792): white, vertices on the cell's 2px inset
  // left and right edges, the flats clearing top and bottom (see the UV
  // note). Drawn as a path like the shrapnel triangle — it is geometry,
  // not art, so it takes neither the outline nor the antialias pass
  c.fillStyle = "#ffffff";
  c.beginPath();
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * TAU;
    const hx = 128 + Math.cos(a) * 126, hy = 1792 + 128 + Math.sin(a) * 126;
    if (k === 0) c.moveTo(hx, hy);
    else c.lineTo(hx, hy);
  }
  c.closePath();
  c.fill();

  // the base building at native 160px: the block, then the team overlay tinted
  // sharded-yellow the way Mindustry composites team regions
  c.drawImage(antialiased(img.base), 320, 128, 160, 160);
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
  c.drawImage(team, 320, 128);

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
