import { UNIT_SPRITE } from "./constants";
import type { UnitKind } from "./levels";

const ATLAS = 512;
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
// 0-1 stone-wall, 2-3 dirt-wall (terrain wall index 4 means "pine prop")
export const UV_WALLS: readonly UVRect[] = [
  uv(192, 0, 64, 64, 2),
  uv(256, 0, 64, 64, 2),
  uv(448, 64, 64, 64, 2),
  uv(0, 128, 64, 64, 2),
];
export const UV_UNIT = uv(320, 0, 64, 64);
export const UV_MACE = uv(416, 288, 96, 96);
export const UV_FLARE = uv(384, 0, 64, 64);
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
  dagger: { uv: UV_UNIT, sprite: UNIT_SPRITE }, // 48px art in a 64 cell on a 40px quad
  mace: { uv: UV_MACE, sprite: 60 }, // 64px art in a 96 cell on a 60px quad
  flare: { uv: UV_FLARE, sprite: UNIT_SPRITE }, // 48px art in a 64 cell, dagger scale
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
  spawnPad: `${ENV}/dark-panel-2.png`,
  towerBase: "/mindustry/sprites/blocks/turrets/bases/block-2.png",
  towerBase3: "/mindustry/sprites/blocks/turrets/bases/block-3.png",
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
  c.drawImage(img.stoneWall0, 192, 0, 64, 64);
  c.drawImage(img.stoneWall1, 256, 0, 64, 64);
  c.drawImage(img.stone0, 64, 64, 64, 64);
  c.drawImage(img.stone1, 128, 64, 64, 64);
  c.drawImage(img.stone2, 192, 64, 64, 64);
  c.drawImage(img.dirt0, 256, 64, 64, 64);
  c.drawImage(img.dirt1, 320, 64, 64, 64);
  c.drawImage(img.dirt2, 384, 64, 64, 64);
  c.drawImage(img.dirtWall0, 448, 64, 64, 64);
  c.drawImage(img.dirtWall1, 0, 128, 64, 64);
  c.drawImage(img.spawnPad, 0, 192, 64, 64);
  // props: 48px overhanging sources at 2x into 96px cells
  c.drawImage(img.pine, 0, 288, 96, 96);
  c.drawImage(img.boulder0, 96, 288, 96, 96);
  c.drawImage(img.boulder1, 192, 288, 96, 96);
  c.drawImage(img.shrubs, 288, 288, 64, 64);

  // dagger: the leg sprite is pre-offset for one side; mirror it for the
  // other, then chassis and body on top — all sharing one 48px origin
  const unit = document.createElement("canvas");
  unit.width = unit.height = 64;
  const uc = unit.getContext("2d");
  if (!uc) throw new Error("2d context unavailable");
  uc.imageSmoothingEnabled = false;
  uc.drawImage(img.daggerLeg, 8, 8, 48, 48);
  uc.save();
  uc.translate(32, 0);
  uc.scale(-1, 1);
  uc.drawImage(img.daggerLeg, -24, 8, 48, 48);
  uc.restore();
  uc.drawImage(img.daggerBase, 8, 8, 48, 48);
  uc.drawImage(img.dagger, 8, 8, 48, 48);
  drawFacingRight(c, unit, 352, 32, 64);

  // mace: same layering from 64px sources, centered in a 96px cell so the
  // art overhangs its quad in the same proportion as the dagger's
  const mace = document.createElement("canvas");
  mace.width = mace.height = 96;
  const mc = mace.getContext("2d");
  if (!mc) throw new Error("2d context unavailable");
  mc.imageSmoothingEnabled = false;
  mc.drawImage(img.maceLeg, 16, 16, 64, 64);
  mc.save();
  mc.translate(48, 0);
  mc.scale(-1, 1);
  mc.drawImage(img.maceLeg, -32, 16, 64, 64);
  mc.restore();
  mc.drawImage(img.maceBase, 16, 16, 64, 64);
  mc.drawImage(img.mace, 16, 16, 64, 64);
  drawFacingRight(c, mace, 464, 336, 96);

  // flare: a flying unit is one sprite — no legs, no chassis
  const flare = document.createElement("canvas");
  flare.width = flare.height = 64;
  const fc = flare.getContext("2d");
  if (!fc) throw new Error("2d context unavailable");
  fc.imageSmoothingEnabled = false;
  fc.drawImage(img.flare, 8, 8, 48, 48);
  drawFacingRight(c, flare, 416, 32, 64);

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
  drawFacingRight(c, img.salvoPreview, 256, 192, 128);

  // scatter top, same treatment
  drawFacingRight(c, img.scatterPreview, 64, 448, 128);

  // flak shell: Mindustry's "shell" region in the default lead-ammo colors
  // (Pal.bulletYellowBack under Pal.bulletYellow), facing +x
  const shell = document.createElement("canvas");
  shell.width = shell.height = 64;
  const shc = shell.getContext("2d");
  if (!shc) throw new Error("2d context unavailable");
  shc.drawImage(tinted(img.shellBack, "#f9c27a"), 0, 0);
  shc.drawImage(tinted(img.shell, "#fff8e8"), 0, 0);
  drawFacingRight(c, shell, 160, 416, 64);

  // fuse top: size-3 turret art, facing +x like the others
  drawFacingRight(c, img.fuse, 256, 448, 128);
  // 3x3 turret base at native 96px
  c.drawImage(img.towerBase3, 384, 384, 96, 96);

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
