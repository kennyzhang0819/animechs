import { UNIT_SPRITE } from "./constants";
import type { UnitKind } from "./levels";

const ATLAS = 1024;
const TAU = Math.PI * 2;

export type UVRect = readonly [number, number, number, number];

const uv = (x: number, y: number, w: number, h: number, inset = 0): UVRect => [
  (x + inset) / ATLAS,
  (y + inset) / ATLAS,
  (x + w - inset) / ATLAS,
  (y + h - inset) / ATLAS,
];

// row 0: 64px cells — grass floors, stone walls, unit, fx
// indices into UV_FLOORS: 0-2 grass, 3-5 stone, 6-8 dirt
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
];
// per-group floor edge fades (Mindustry's generated <floor>-edge sprites):
// three 192px blocks at y=768 for grass/stone/dirt, each a 3x3 of 64px
// sub-cells in image space. A tile bordered by a higher-priority floor gets
// that floor's sub-cell (col 1-dx, row 1-dy) overlaid, so the neighbor's
// texture fades across the tile seam exactly like Floor.drawEdges
export const UV_FLOOR_EDGES: ReadonlyArray<ReadonlyArray<readonly UVRect[]>> = [16, 272, 528].map(
  (bx) => [0, 1, 2].map((ry) => [0, 1, 2].map((rx) => uv(bx + rx * 64, 768 + ry * 64, 64, 64))),
);
// 0-1 stone-wall, 2-3 dirt-wall (terrain wall index 4 means "pine prop")
export const UV_WALLS: readonly UVRect[] = [
  uv(192, 0, 64, 64, 2),
  uv(256, 0, 64, 64, 2),
  uv(448, 64, 64, 64, 2),
  uv(0, 128, 64, 64, 2),
];
// flare lives on a gutter row (see the mech-part note below) — its old cell
// at (384,0) had dirt within a mip-3 texel below and the ring to its right
export const UV_FLARE = uv(32, 704, 64, 64);
// mechanical spawn-pad tile — drawn only by the map editor's terrain pass
export const UV_SPAWN = uv(0, 192, 64, 64, 2);
export const UV_PROJ = uv(352, 288, 64, 64);
export const UV_RING = uv(448, 0, 64, 64);
export const UV_FLASH = uv(0, 64, 64, 64);
// row 2: 128px cells — turret base, turret top, core
export const UV_TOWER_BASE = uv(64, 128, 128, 128);
export const UV_TURRET = uv(192, 128, 128, 128);
export const UV_CORE = uv(320, 128, 160, 160);
// row 4 (y=384): scatter turret top, flak shell
export const UV_SCATTER = uv(0, 384, 128, 128);
export const UV_SHELL = uv(128, 384, 64, 64);
export const UV_FUSE = uv(192, 384, 128, 128);
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

// per-kind unit art: atlas cell + world quad size. Both ride at true
// Mindustry scale — dagger 48px art = 1.5 tiles, mace 64px art = 2 tiles
export const UNIT_ART: Record<UnitKind, { uv: UVRect; sprite: number }> = {
  dagger: { uv: UV_DAGGER_BODY, sprite: UNIT_SPRITE },
  mace: { uv: UV_MACE_BODY, sprite: UNIT_SPRITE },
  flare: { uv: UV_FLARE, sprite: UNIT_SPRITE }, // 48px art in a 64 cell, dagger scale
};

// Mindustry world units → px (CELL / 8, see constants.ts)
const MU = 2.5;

/** part art + walk-cycle geometry for a ground (mech) unit */
export interface MechArt {
  leg: UVRect;
  base: UVRect;
  body: UVRect;
  gun: UVRect;
  gunX: number; // sideways gun mount offset px, mirrored to both sides
  gunY: number; // forward gun mount offset px
  stride: number; // leg swing amplitude px — the walk cycle is 4 strides
  sprite: number; // world px of every part quad (same 64px cell scale)
  /** solid-color silhouette cells, drawn under all parts as the outer rim */
  sil: { leg: UVRect; base: UVRect; body: UVRect; gun: UVRect };
}

// stride is Mindustry's default 4 + (hitSize - 8) / 2.1 world units; gun
// mounts come from each type's Weapon (large-weapon x=4 y=2, flamethrower
// x=5 y=0). Flare's weapon has no sprite, so flyers stay single-quad.
export const MECH_ART: Partial<Record<UnitKind, MechArt>> = {
  dagger: {
    leg: UV_DAGGER_LEG,
    base: UV_DAGGER_BASE,
    body: UV_DAGGER_BODY,
    gun: UV_LARGE_WEAPON,
    gunX: 4 * MU,
    gunY: 2 * MU,
    stride: 4 * MU,
    sprite: UNIT_SPRITE,
    sil: {
      leg: UV_DAGGER_LEG_SIL,
      base: UV_DAGGER_BASE_SIL,
      body: UV_DAGGER_BODY_SIL,
      gun: UV_LARGE_WEAPON_SIL,
    },
  },
  mace: {
    leg: UV_MACE_LEG,
    base: UV_MACE_BASE,
    body: UV_MACE_BODY,
    gun: UV_FLAMETHROWER,
    gunX: 5 * MU,
    gunY: 0,
    stride: (4 + (10 - 8) / 2.1) * MU,
    sprite: UNIT_SPRITE,
    sil: {
      leg: UV_MACE_LEG_SIL,
      base: UV_MACE_BASE_SIL,
      body: UV_MACE_BODY_SIL,
      gun: UV_FLAMETHROWER_SIL,
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
  stoneWall0: `${ENV}/stone-wall1.png`,
  stoneWall1: `${ENV}/stone-wall2.png`,
  dirtWall0: `${ENV}/dirt-wall1.png`,
  dirtWall1: `${ENV}/dirt-wall2.png`,
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
  flare: "/mindustry/sprites/units/flare.png",
  largeWeapon: "/mindustry/sprites/units/weapons/large-weapon.png",
  flamethrower: "/mindustry/sprites/units/weapons/flamethrower.png",
  spawnPad: `${ENV}/dark-panel-2.png`,
  towerBase: "/mindustry/sprites/blocks/turrets/bases/block-2.png",
  towerBase1: "/mindustry/sprites/blocks/turrets/bases/block-1.png",
  towerBase3: "/mindustry/sprites/blocks/turrets/bases/block-3.png",
  duoPreview: "/mindustry/sprites/blocks/turrets/duo/duo-preview.png",
  hail: "/mindustry/sprites/blocks/turrets/hail.png",
  salvoPreview: "/mindustry/sprites/blocks/turrets/salvo/salvo-preview.png",
  scatterPreview: "/mindustry/sprites/blocks/turrets/scatter/scatter-preview.png",
  fuse: "/mindustry/sprites/blocks/turrets/fuse.png",
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
  const cc = cv.getContext("2d");
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
  const cc = cv.getContext("2d");
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
  size: number,
): void {
  c.save();
  c.translate(cx, cy);
  c.rotate(Math.PI / 2);
  c.drawImage(src, -size / 2, -size / 2, size, size);
  c.restore();
}

/**
 * Composites the Mindustry sprites (GPL-3.0, github.com/Anuken/Mindustry)
 * into the game's single texture atlas. Swap any region — or the whole
 * source set — for custom art without touching the render pipeline.
 */
export async function buildAtlas(): Promise<HTMLCanvasElement> {
  const img = await loadImages();
  const a = document.createElement("canvas");
  a.width = a.height = ATLAS;
  const c = a.getContext("2d");
  if (!c) throw new Error("2d context unavailable for atlas build");
  c.imageSmoothingEnabled = false; // integer upscales keep the pixel art crisp

  // ground + wall tiles: 32px sources upscaled 2x into 64px cells
  c.drawImage(img.grass0, 0, 0, 64, 64);
  c.drawImage(img.grass1, 64, 0, 64, 64);
  c.drawImage(img.grass2, 128, 0, 64, 64);
  // walls ride the same antialias pass the game's packer runs over them
  c.drawImage(antialiased(img.stoneWall0), 192, 0, 64, 64);
  c.drawImage(antialiased(img.stoneWall1), 256, 0, 64, 64);
  c.drawImage(img.stone0, 64, 64, 64, 64);
  c.drawImage(img.stone1, 128, 64, 64, 64);
  c.drawImage(img.stone2, 192, 64, 64, 64);
  c.drawImage(img.dirt0, 256, 64, 64, 64);
  c.drawImage(img.dirt1, 320, 64, 64, 64);
  c.drawImage(img.dirt2, 384, 64, 64, 64);
  c.drawImage(antialiased(img.dirtWall0), 448, 64, 64, 64);
  c.drawImage(antialiased(img.dirtWall1), 0, 128, 64, 64);
  c.drawImage(img.spawnPad, 0, 192, 64, 64);

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

  // props: 48px overhanging sources at 2x into 96px cells
  c.drawImage(img.pine, 0, 288, 96, 96);
  c.drawImage(img.boulder0, 96, 288, 96, 96);
  c.drawImage(img.boulder1, 192, 288, 96, 96);
  c.drawImage(img.shrubs, 288, 288, 64, 64);

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

  // flare: a flying unit is one sprite — no legs, no chassis
  const flare = document.createElement("canvas");
  flare.width = flare.height = 64;
  const fc = flare.getContext("2d");
  if (!fc) throw new Error("2d context unavailable");
  fc.imageSmoothingEnabled = false;
  fc.drawImage(antialiased(outlined(img.flare, UNIT_OUTLINE, UNIT_OUTLINE_R)), 8, 8, 48, 48);
  drawFacingRight(c, flare, 64, 736, 64);

  // official basic bullet at (352,288): back layer in Mindustry's bullet
  // orange under a pale-yellow core, pre-rotated to face +x like the unit
  const tinted = (src: HTMLImageElement, color: string): HTMLCanvasElement => {
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
  bc.drawImage(tinted(img.bulletBack, "#f68021"), 0, 0);
  bc.drawImage(tinted(img.bullet, "#fff5cc"), 0, 0);
  drawFacingRight(c, bul, 384, 320, 64);

  // ring (448,0) — procedural
  c.strokeStyle = "#ffffff";
  c.lineWidth = 5;
  c.beginPath();
  c.arc(480, 32, 22, 0, TAU);
  c.stroke();

  // flash (0,64) — procedural
  const g = c.createRadialGradient(32, 96, 0, 32, 96, 18);
  g.addColorStop(0, "#ffffff");
  g.addColorStop(1, "rgba(255,255,255,0)");
  c.fillStyle = g;
  c.fillRect(0, 64, 64, 64);

  // turret base: 64px block-2 upscaled 2x into a 128px cell
  c.drawImage(img.towerBase, 64, 128, 128, 128);

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
  shc.drawImage(tinted(img.shellBack, "#f9c27a"), 0, 0);
  shc.drawImage(tinted(img.shell, "#fff8e8"), 0, 0);
  drawFacingRight(c, shell, 160, 416, 64);

  // hail's artillery shell, same region in graphite ammo colors
  // (Pal.graphiteAmmoBack under Pal.graphiteAmmoFront)
  const gshell = document.createElement("canvas");
  gshell.width = gshell.height = 64;
  const gsc = gshell.getContext("2d");
  if (!gsc) throw new Error("2d context unavailable");
  gsc.drawImage(tinted(img.shellBack, "#7d89d8"), 0, 0);
  gsc.drawImage(tinted(img.shell, "#dae1ee"), 0, 0);
  drawFacingRight(c, gshell, 320, 736, 64);

  // hail top: the bare turret head (no preview exists — the renderer draws
  // the block-1 base underneath anyway), 32px source upscaled 2x
  drawFacingRight(c, antialiased(outlined(img.hail, BLOCK_OUTLINE, BLOCK_OUTLINE_R)), 192, 736, 64);

  // fuse top: size-3 turret art, facing +x like the others
  drawFacingRight(c, antialiased(outlined(img.fuse, BLOCK_OUTLINE, BLOCK_OUTLINE_R)), 256, 448, 128);
  // 3x3 turret base at native 96px
  c.drawImage(img.towerBase3, 384, 384, 96, 96);

  // duo top and 1x1 base: 32px sources upscaled 2x into 64px cells
  drawFacingRight(c, antialiased(outlined(img.duoPreview, BLOCK_OUTLINE, BLOCK_OUTLINE_R)), 160, 480, 64);
  c.drawImage(img.towerBase1, 320, 448, 64, 64);

  // shrapnel triangle (320,384): white, base on the left edge, apex right;
  // the renderer stretches and tints it into Drawf.tri shapes
  c.fillStyle = "#ffffff";
  c.beginPath();
  c.moveTo(322, 387);
  c.lineTo(322, 445);
  c.lineTo(381, 416);
  c.closePath();
  c.fill();

  // core-nucleus at native 160px: base block, then the team overlay tinted
  // sharded-yellow the way Mindustry composites team regions
  c.drawImage(img.core, 320, 128, 160, 160);
  const team = document.createElement("canvas");
  team.width = team.height = 160;
  const tc = team.getContext("2d");
  if (!tc) throw new Error("2d context unavailable");
  tc.drawImage(img.coreTeam, 0, 0, 160, 160);
  tc.globalCompositeOperation = "multiply";
  tc.fillStyle = TEAM_COLOR;
  tc.fillRect(0, 0, 160, 160);
  tc.globalCompositeOperation = "destination-in";
  tc.drawImage(img.coreTeam, 0, 0, 160, 160);
  c.drawImage(team, 320, 128);

  return a;
}
