import { UNIT_SPRITE } from "./constants";
import type { UnitKind } from "./levels";

// The sheet is 1024 wide. It began as a 1024 square and grew downward when
// the roster outgrew it: every cell below keeps its original pixel
// coordinates, so only the v axis rescaled, and each fresh 1024-tall band
// is where the next batch of oversized art goes — y=1024 took the legged
// crawlers and the flyers, y=2048 and y=3072 take the T4 line, which needs
// two bands because every one of its parts rides a 256px cell.
const ATLAS_W = 1024;
const ATLAS_H = 4096;
const TAU = Math.PI * 2;

export type UVRect = readonly [number, number, number, number];

const uv = (x: number, y: number, w: number, h: number, inset = 0): UVRect => [
  (x + inset) / ATLAS_W,
  (y + inset) / ATLAS_H,
  (x + w - inset) / ATLAS_W,
  (y + h - inset) / ATLAS_H,
];

// row 0: 64px cells — grass floors, stone walls, unit, fx
// indices into UV_FLOORS: 0-2 grass, 3-5 stone, 6-8 dirt, 9-11 sand,
// 12-14 darksand (the desert pair rides row 0's free tail; x512 stays
// empty to keep clear space beside the ring cell at 448)
export const UV_FLOORS: readonly UVRect[] = [
  uv(0, 0, 64, 64, 2),
  uv(64, 0, 64, 64, 2),
  uv(128, 0, 64, 64, 2),
  uv(64, 64, 64, 64, 2),
  uv(128, 64, 64, 64, 2),
  uv(192, 64, 64, 64, 2),
  uv(256, 64, 64, 64, 2),
  uv(320, 64, 64, 64, 2),
  uv(384, 64, 64, 64, 2),
  uv(576, 0, 64, 64, 2),
  uv(640, 0, 64, 64, 2),
  uv(704, 0, 64, 64, 2),
  uv(768, 0, 64, 64, 2),
  uv(832, 0, 64, 64, 2),
  uv(896, 0, 64, 64, 2),
];
// per-group floor edge fades (Mindustry's generated <floor>-edge sprites):
// three 192px blocks at y=768 for grass/stone/dirt, each a 3x3 of 64px
// sub-cells in image space. A tile bordered by a higher-priority floor gets
// that floor's sub-cell (col 1-dx, row 1-dy) overlaid, so the neighbor's
// texture fades across the tile seam exactly like Floor.drawEdges
const edgeBlock = (bx: number, by: number): ReadonlyArray<readonly UVRect[]> =>
  [0, 1, 2].map((ry) => [0, 1, 2].map((rx) => uv(bx + rx * 64, by + ry * 64, 64, 64)));
export const UV_FLOOR_EDGES: ReadonlyArray<ReadonlyArray<readonly UVRect[]>> = [
  edgeBlock(16, 768), // grass
  edgeBlock(272, 768), // stone (baked but never overlays — lowest priority)
  edgeBlock(528, 768), // dirt
  // sand: no edge art baked — its only inferior floor (stone) shares no
  // map with it yet, so the renderer never overlays it; stone's block
  // stands in to keep the group indices aligned
  edgeBlock(272, 768),
  // darksand: no contiguous 192px block is left in the atlas, so its nine
  // sub-cells ride the y=704 gutter row, row-major from x=416
  [0, 1, 2].map((ry) => [0, 1, 2].map((rx) => uv(416 + (ry * 3 + rx) * 64, 704, 64, 64))),
];
// 0-1 stone-wall, 2-3 dirt-wall, 5-6 carbon-wall (the darker rock).
// Index 4 is the WALL_PINE sentinel — its slot here is a never-drawn
// placeholder, since everything tests wall[i] === WALL_PINE explicitly
export const UV_WALLS: readonly UVRect[] = [
  uv(192, 0, 64, 64, 2),
  uv(256, 0, 64, 64, 2),
  uv(448, 64, 64, 64, 2),
  uv(0, 128, 64, 64, 2),
  uv(192, 0, 64, 64, 2), // WALL_PINE placeholder
  uv(320, 0, 64, 64, 2),
  uv(384, 0, 64, 64, 2),
];
// which wall family each UV_WALLS index belongs to (0 stone, 1 dirt,
// 2 dark rock; -1 the pine sentinel) — StaticWall's large-draw rule works
// per block type, so 2x2 detection must ignore the variant within a family
export const WALL_GROUP: readonly number[] = [0, 0, 1, 1, -1, 2, 2];
// Mindustry's <wall>-large art: one 2x2-tile sprite per family, split into
// per-tile quadrant UVs [row][col] in screen space (y down). Families
// without baked large art (dirt) draw per-tile variants everywhere
const largeQuads = (x: number, y: number): ReadonlyArray<readonly UVRect[]> =>
  [0, 1].map((row) => [0, 1].map((col) => uv(x + col * 64, y + row * 64, 64, 64, 2)));
export const UV_WALL_LARGE: ReadonlyArray<ReadonlyArray<readonly UVRect[]> | null> = [
  largeQuads(736, 768), // stone-wall-large
  null, // dirt: fringe slopes, aligned 2x2 blocks are rare — not baked
  largeQuads(864, 768), // carbon-wall-large
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
// mechanical spawn-pad tile — drawn only by the map editor's terrain pass
export const UV_SPAWN = uv(0, 192, 64, 64, 2);
export const UV_PROJ = uv(352, 288, 64, 64);
export const UV_RING = uv(448, 0, 64, 64);
// a plain opaque texel, for geometry the renderer strokes itself: Lines.circle
// draws a constant-width ring, which a scaled ring SPRITE cannot do (its band
// fattens with the radius). It sits in the 64px gutter BETWEEN the grass and
// stone floor-edge blocks — those blocks run x=16..208 and x=272..464 down
// the whole y=768..960 band, and most of their art is transparent, so an
// empty-looking hole in there is still spoken for. Inset well past the mip-3
// footprint so every sampled level stays pure white
export const UV_SOLID = uv(224, 928, 32, 32, 8);
export const UV_FLASH = uv(0, 64, 64, 64);
// row 2: 128px cells — turret base, turret top, core
export const UV_TOWER_BASE = uv(64, 128, 128, 128);
export const UV_TURRET = uv(192, 128, 128, 128);
export const UV_CORE = uv(320, 128, 160, 160);
// row 4 (y=384): scatter turret top, flak shell
export const UV_SCATTER = uv(0, 384, 128, 128);
export const UV_SHELL = uv(128, 384, 64, 64);
// fuse rides at native 96px (like block-3): stretching the 96px source to
// a 128 cell was a 1.33x non-integer upscale that shredded its antialiasing
export const UV_FUSE = uv(208, 400, 96, 96);
export const UV_TOWER_BASE3 = uv(384, 384, 96, 96); // block-3 at native 96px
// duo turret top and its 1x1 base, tucked under the shell and tri cells
export const UV_DUO = uv(128, 448, 64, 64);
export const UV_TOWER_BASE1 = uv(320, 448, 64, 64);
// hail turret top and its graphite artillery shell, riding the gutter row
// beside the flare (128px pitch, see the mech-part note)
export const UV_HAIL = uv(160, 704, 64, 64);
export const UV_SHELL_GRAPHITE = uv(288, 704, 64, 64);
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
// free space right of the core at y=128. Cells are 128px wide so even the
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
// crawler parts: 64px cells flush-packed at y=288, right of the bullet
// cell and a 32px gutter above the fortress art strip. The 48px sources
// keep >=5px transparent margins even silhouette-dilated, so unlike the
// full-bleed mace cells these don't need the 128px pitch
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
 * silhouette under-layer (see UNIT_ART), but at 216x240 native it is the
 * largest single piece of art on the sheet.
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
export const UV_PINE = uv(0, 288, 96, 96);
export const UV_DECOR: readonly UVRect[] = [
  uv(96, 288, 96, 96), // boulder1
  uv(192, 288, 96, 96), // boulder2
  uv(288, 288, 64, 64), // shrubs
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
  crawler: { uv: UV_CRAWLER_BODY, sprite: UNIT_SPRITE },
  // 128px cells, like the fortress: the legged pair's bodies outgrow 64
  atrax: { uv: UV_ATRAX_BODY, sprite: UNIT_SPRITE * 2 },
  spiroct: { uv: UV_SPIROCT_BODY, sprite: UNIT_SPRITE * 2 },
  arkyid: { uv: UV_ARKYID_BODY, sprite: UNIT_SPRITE * 4 }, // 256px cell, same px scale
  nova: { uv: UV_NOVA_BODY, sprite: UNIT_SPRITE },
  pulsar: { uv: UV_PULSAR_BODY, sprite: UNIT_SPRITE },
  quasar: { uv: UV_QUASAR_BODY, sprite: UNIT_SPRITE * 2 }, // 128px cell, same px scale
  vela: { uv: UV_VELA_BODY, sprite: UNIT_SPRITE * 4 }, // 256px cell, same px scale
  flare: { uv: UV_FLARE, sprite: UNIT_SPRITE }, // 48px art in a 64 cell, dagger scale
  // 128px cells: double the cell means double the sprite box, which keeps
  // world px per native px identical to every other unit
  horizon: { uv: UV_HORIZON, sprite: UNIT_SPRITE * 2 },
  zenith: { uv: UV_ZENITH, sprite: UNIT_SPRITE * 2 },
  // 216x240 of art on a 5.75-block hitbox: the sheet's biggest single piece
  antumbra: { uv: UV_ANTUMBRA, sprite: UNIT_SPRITE * 4 },
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
};

const ENV = "/mindustry/sprites/blocks/environment";
const SPRITES = {
  grass0: `${ENV}/grass1.png`,
  grass1: `${ENV}/grass2.png`,
  grass2: `${ENV}/grass3.png`,
  stone0: `${ENV}/stone1.png`,
  stone1: `${ENV}/stone2.png`,
  stone2: `${ENV}/stone3.png`,
  dirt0: `${ENV}/dirt1.png`,
  dirt1: `${ENV}/dirt2.png`,
  dirt2: `${ENV}/dirt3.png`,
  sand0: `${ENV}/sand-floor1.png`,
  sand1: `${ENV}/sand-floor2.png`,
  sand2: `${ENV}/sand-floor3.png`,
  darksand0: `${ENV}/darksand1.png`,
  darksand1: `${ENV}/darksand2.png`,
  darksand2: `${ENV}/darksand3.png`,
  stoneWall0: `${ENV}/stone-wall1.png`,
  stoneWall1: `${ENV}/stone-wall2.png`,
  dirtWall0: `${ENV}/dirt-wall1.png`,
  dirtWall1: `${ENV}/dirt-wall2.png`,
  carbonWall0: `${ENV}/carbon-wall1.png`,
  carbonWall1: `${ENV}/carbon-wall2.png`,
  stoneWallLarge: `${ENV}/stone-wall-large.png`,
  carbonWallLarge: `${ENV}/carbon-wall-large.png`,
  edgeStencil: `${ENV}/edge-stencil.png`,
  pine: `${ENV}/pine.png`,
  shrubs: `${ENV}/shrubs1.png`,
  boulder0: "/mindustry/sprites/blocks/props/boulder1.png",
  boulder1: "/mindustry/sprites/blocks/props/boulder2.png",
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
  shell: "/mindustry/sprites/effects/shell.png",
  shellBack: "/mindustry/sprites/effects/shell-back.png",
  core: "/mindustry/sprites/blocks/storage/core-nucleus.png",
  coreTeam: "/mindustry/sprites/blocks/storage/core-nucleus-team.png",
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
const UNIT_OUTLINE_R = 3; // UnitType.outlineRadius
const BLOCK_OUTLINE_R = 4; // Block.outlineRadius

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

  // ground + wall tiles: 32px sources upscaled 2x into 64px cells
  c.drawImage(antialiased(img.grass0), 0, 0, 64, 64);
  c.drawImage(antialiased(img.grass1), 64, 0, 64, 64);
  c.drawImage(antialiased(img.grass2), 128, 0, 64, 64);
  // walls ride the same antialias pass the game's packer runs over them
  c.drawImage(antialiased(img.stoneWall0), 192, 0, 64, 64);
  c.drawImage(antialiased(img.stoneWall1), 256, 0, 64, 64);
  c.drawImage(antialiased(img.stone0), 64, 64, 64, 64);
  c.drawImage(antialiased(img.stone1), 128, 64, 64, 64);
  c.drawImage(antialiased(img.stone2), 192, 64, 64, 64);
  c.drawImage(antialiased(img.dirt0), 256, 64, 64, 64);
  c.drawImage(antialiased(img.dirt1), 320, 64, 64, 64);
  c.drawImage(antialiased(img.dirt2), 384, 64, 64, 64);
  c.drawImage(antialiased(img.dirtWall0), 448, 64, 64, 64);
  c.drawImage(antialiased(img.dirtWall1), 0, 128, 64, 64);
  c.drawImage(antialiased(img.carbonWall0), 320, 0, 64, 64);
  c.drawImage(antialiased(img.carbonWall1), 384, 0, 64, 64);
  // desert floors on row 0's free tail (see the UV_FLOORS note)
  c.drawImage(antialiased(img.sand0), 576, 0, 64, 64);
  c.drawImage(antialiased(img.sand1), 640, 0, 64, 64);
  c.drawImage(antialiased(img.sand2), 704, 0, 64, 64);
  c.drawImage(antialiased(img.darksand0), 768, 0, 64, 64);
  c.drawImage(antialiased(img.darksand1), 832, 0, 64, 64);
  c.drawImage(antialiased(img.darksand2), 896, 0, 64, 64);
  // 2x2-tile "-large" wall art: 64px sources at the same 2x tile scale,
  // in the free block right of the dirt edge fades
  c.drawImage(antialiased(img.stoneWallLarge), 736, 768, 128, 128);
  c.drawImage(antialiased(img.carbonWallLarge), 864, 768, 128, 128);
  c.drawImage(antialiased(img.spawnPad), 0, 192, 64, 64);

  // floor edge fades, generated exactly like the game's sprite packer
  // (tools Generators.java "edge stencils"): the floor texture tiled 3x3 at
  // native 32px, multiplied per-pixel by the 96px edge-stencil alpha ring,
  // then upscaled 2x into the atlas like every other tile
  const makeEdge = (floorImg: HTMLImageElement): HTMLCanvasElement => {
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
  c.drawImage(antialiased(makeEdge(img.grass0)), 16, 768, 192, 192);
  c.drawImage(antialiased(makeEdge(img.stone0)), 272, 768, 192, 192);
  c.drawImage(antialiased(makeEdge(img.dirt0)), 528, 768, 192, 192);
  // darksand's edge fade, sliced into its nine scattered cells (see the
  // UV_FLOOR_EDGES note) — AA'd whole first, exactly once, like the blocks
  const dsEdge = antialiased(makeEdge(img.darksand0));
  for (let ry = 0; ry < 3; ry++)
    for (let rx = 0; rx < 3; rx++)
      c.drawImage(dsEdge, rx * 32, ry * 32, 32, 32, 416 + (ry * 3 + rx) * 64, 704, 64, 64);

  // props: 48px overhanging sources at 2x into 96px cells
  c.drawImage(antialiased(img.pine), 0, 288, 96, 96);
  c.drawImage(antialiased(img.boulder0), 96, 288, 96, 96);
  c.drawImage(antialiased(img.boulder1), 192, 288, 96, 96);
  c.drawImage(antialiased(img.shrubs), 288, 288, 64, 64);

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
  // native size in a 256px cell — 216x240 is the biggest piece of art on
  // the sheet, and it leaves only an 8px margin across its own cell
  drawFacingRight(
    c, antialiased(outlined(img.antumbra, UNIT_OUTLINE, UNIT_OUTLINE_R)), 640, 3968, 216, 240,
  );

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

  // official basic bullet at (352,288): back layer in Mindustry's bullet
  // orange under a pale-yellow core, pre-rotated to face +x like the unit
  const tinted = (src: HTMLImageElement | HTMLCanvasElement, color: string): HTMLCanvasElement => {
    const t = document.createElement("canvas");
    t.width = t.height = 64;
    const tc = t.getContext("2d");
    if (!tc) throw new Error("2d context unavailable");
    tc.imageSmoothingEnabled = false;
    tc.drawImage(src, 6, 6, 52, 52);
    tc.globalCompositeOperation = "multiply";
    tc.fillStyle = color;
    tc.fillRect(0, 0, 64, 64);
    tc.globalCompositeOperation = "destination-in";
    tc.drawImage(src, 6, 6, 52, 52);
    return t;
  };
  const bul = document.createElement("canvas");
  bul.width = bul.height = 64;
  const bc = bul.getContext("2d");
  if (!bc) throw new Error("2d context unavailable");
  bc.drawImage(tinted(antialiased(img.bulletBack), "#f68021"), 0, 0);
  bc.drawImage(tinted(antialiased(img.bullet), "#fff5cc"), 0, 0);
  drawFacingRight(c, bul, 384, 320, 64);

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

  // flash (0,64) — procedural
  const g = c.createRadialGradient(32, 96, 0, 32, 96, 18);
  g.addColorStop(0, "#ffffff");
  g.addColorStop(1, "rgba(255,255,255,0)");
  c.fillStyle = g;
  c.fillRect(0, 64, 64, 64);

  // turret base: 64px block-2 upscaled 2x into a 128px cell
  c.drawImage(antialiased(img.towerBase), 64, 128, 128, 128);

  // salvo top: the preview sprite is the fully assembled turret — face right
  c.imageSmoothingEnabled = false;
  drawFacingRight(c, antialiased(outlined(img.salvoPreview, BLOCK_OUTLINE, BLOCK_OUTLINE_R)), 256, 192, 128);

  // scatter top, same treatment
  drawFacingRight(c, antialiased(outlined(img.scatterPreview, BLOCK_OUTLINE, BLOCK_OUTLINE_R)), 64, 448, 128);

  // flak shell: Mindustry's "shell" region in the default lead-ammo colors
  // (Pal.bulletYellowBack under Pal.bulletYellow), facing +x
  const shell = document.createElement("canvas");
  shell.width = shell.height = 64;
  const shc = shell.getContext("2d");
  if (!shc) throw new Error("2d context unavailable");
  const shellBackAA = antialiased(img.shellBack), shellAA = antialiased(img.shell);
  shc.drawImage(tinted(shellBackAA, "#f9c27a"), 0, 0);
  shc.drawImage(tinted(shellAA, "#fff8e8"), 0, 0);
  drawFacingRight(c, shell, 160, 416, 64);

  // hail's artillery shell, same region in graphite ammo colors
  // (Pal.graphiteAmmoBack under Pal.graphiteAmmoFront)
  const gshell = document.createElement("canvas");
  gshell.width = gshell.height = 64;
  const gsc = gshell.getContext("2d");
  if (!gsc) throw new Error("2d context unavailable");
  gsc.drawImage(tinted(shellBackAA, "#7d89d8"), 0, 0);
  gsc.drawImage(tinted(shellAA, "#dae1ee"), 0, 0);
  drawFacingRight(c, gshell, 320, 736, 64);

  // hail top: the bare turret head (no preview exists — the renderer draws
  // the block-1 base underneath anyway), 32px source upscaled 2x
  drawFacingRight(c, antialiased(outlined(img.hail, BLOCK_OUTLINE, BLOCK_OUTLINE_R)), 192, 736, 64);

  // fuse top: size-3 turret art, facing +x like the others
  drawFacingRight(c, antialiased(outlined(img.fuse, BLOCK_OUTLINE, BLOCK_OUTLINE_R)), 256, 448, 96);
  // 3x3 turret base at native 96px
  c.drawImage(antialiased(img.towerBase3), 384, 384, 96, 96);

  // scorch top: 32px source upscaled 2x, filling its 64px cell like duo's
  drawFacingRight(c, antialiased(outlined(img.scorch, BLOCK_OUTLINE, BLOCK_OUTLINE_R)), 320, 1088, 64);

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

  // core-nucleus at native 160px: base block, then the team overlay tinted
  // sharded-yellow the way Mindustry composites team regions
  c.drawImage(antialiased(img.core), 320, 128, 160, 160);
  const coreTeam = antialiased(img.coreTeam);
  const team = document.createElement("canvas");
  team.width = team.height = 160;
  const tc = team.getContext("2d");
  if (!tc) throw new Error("2d context unavailable");
  tc.drawImage(coreTeam, 0, 0, 160, 160);
  tc.globalCompositeOperation = "multiply";
  tc.fillStyle = TEAM_COLOR;
  tc.fillRect(0, 0, 160, 160);
  tc.globalCompositeOperation = "destination-in";
  tc.drawImage(coreTeam, 0, 0, 160, 160);
  c.drawImage(team, 320, 128);

  return a;
}

/**
 * The packed sheet, built at most once per page.
 *
 * Packing is not cheap — it decodes every sprite, runs the EPX antialias
 * pass over each in JavaScript, outlines the units, and composites the lot
 * into a 1024x4096 canvas — and it depends on nothing but the sprite files,
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
