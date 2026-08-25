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
export const UV_PROJ = uv(384, 0, 64, 64);
export const UV_RING = uv(448, 0, 64, 64);
export const UV_FLASH = uv(0, 64, 64, 64);
// row 2: 128px cells — turret base, turret top, core
export const UV_TOWER_BASE = uv(64, 128, 128, 128);
export const UV_TURRET = uv(192, 128, 128, 128);
export const UV_CORE = uv(320, 128, 160, 160);
// row 3: 96px prop cells — overhanging 48px sources at 2x
export const UV_PINE = uv(0, 288, 96, 96);
export const UV_DECOR: readonly UVRect[] = [
  uv(96, 288, 96, 96), // boulder1
  uv(192, 288, 96, 96), // boulder2
  uv(288, 288, 64, 64), // shrubs
];

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
  towerBase: "/mindustry/sprites/blocks/turrets/bases/block-2.png",
  salvoPreview: "/mindustry/sprites/blocks/turrets/salvo/salvo-preview.png",
  core: "/mindustry/sprites/blocks/storage/core-nucleus.png",
  coreTeam: "/mindustry/sprites/blocks/storage/core-nucleus-team.png",
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

  // projectile glow (384,0) — procedural
  let g = c.createRadialGradient(416, 32, 0, 416, 32, 28);
  g.addColorStop(0, "#ffffff");
  g.addColorStop(0.3, "rgba(255,255,255,0.85)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  c.fillStyle = g;
  c.fillRect(384, 0, 64, 64);

  // ring (448,0) — procedural
  c.strokeStyle = "#ffffff";
  c.lineWidth = 5;
  c.beginPath();
  c.arc(480, 32, 22, 0, TAU);
  c.stroke();

  // flash (0,64) — procedural
  g = c.createRadialGradient(32, 96, 0, 32, 96, 18);
  g.addColorStop(0, "#ffffff");
  g.addColorStop(1, "rgba(255,255,255,0)");
  c.fillStyle = g;
  c.fillRect(0, 64, 64, 64);

  // turret base: 64px block-2 upscaled 2x into a 128px cell
  c.drawImage(img.towerBase, 64, 128, 128, 128);

  // salvo top: the preview sprite is the fully assembled turret — face right
  c.imageSmoothingEnabled = false;
  drawFacingRight(c, img.salvoPreview, 256, 192, 128);

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
