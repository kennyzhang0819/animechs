const ATLAS = 512;
const TAU = Math.PI * 2;

export type UVRect = readonly [number, number, number, number];

const uv = (x: number, y: number, w: number, h: number, inset = 0): UVRect => [
  (x + inset) / ATLAS,
  (y + inset) / ATLAS,
  (x + w - inset) / ATLAS,
  (y + h - inset) / ATLAS,
];

export const UV_FLOOR = uv(0, 0, 64, 64, 2);
export const UV_BLOCK = uv(64, 0, 64, 64, 2);
export const UV_UNIT = uv(128, 0, 64, 64);
export const UV_PROJ = uv(192, 0, 64, 64);
export const UV_RING = uv(256, 0, 64, 64);
export const UV_FLASH = uv(320, 0, 64, 64);
export const UV_TOWER = uv(0, 64, 128, 128);
export const UV_BARREL = uv(128, 64, 64, 64);
export const UV_CORE = uv(256, 64, 128, 128);

/**
 * Procedural placeholder art. Every sprite the game draws is a region of this
 * one texture — to ship custom graphics, draw (or blit an image) into the same
 * regions and nothing else changes.
 */
export function buildAtlas(): HTMLCanvasElement {
  const a = document.createElement("canvas");
  a.width = a.height = ATLAS;
  const c = a.getContext("2d");
  if (!c) throw new Error("2d context unavailable for atlas build");

  // floor tile (0,0,64,64)
  c.fillStyle = "#0A101F";
  c.fillRect(0, 0, 64, 64);
  c.fillStyle = "#111A2E";
  c.fillRect(2, 2, 60, 2);
  c.fillRect(2, 2, 2, 60);

  // obstacle tile (64,0,64,64)
  c.fillStyle = "#232E4A";
  c.fillRect(64, 0, 64, 64);
  c.fillStyle = "#2E3B5E";
  c.fillRect(64, 0, 64, 9);
  c.fillStyle = "#1B2438";
  c.fillRect(64, 57, 64, 7);

  // unit (128,0,64,64) — white, tinted per instance
  let g = c.createRadialGradient(160, 32, 0, 160, 32, 26);
  g.addColorStop(0, "#ffffff");
  g.addColorStop(0.72, "#ffffff");
  g.addColorStop(1, "rgba(255,255,255,0)");
  c.fillStyle = g;
  c.fillRect(128, 0, 64, 64);

  // projectile glow (192,0,64,64)
  g = c.createRadialGradient(224, 32, 0, 224, 32, 28);
  g.addColorStop(0, "#ffffff");
  g.addColorStop(0.3, "rgba(255,255,255,0.85)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  c.fillStyle = g;
  c.fillRect(192, 0, 64, 64);

  // ring (256,0,64,64)
  c.strokeStyle = "#ffffff";
  c.lineWidth = 5;
  c.beginPath();
  c.arc(288, 32, 22, 0, TAU);
  c.stroke();

  // flash (320,0,64,64)
  g = c.createRadialGradient(352, 32, 0, 352, 32, 18);
  g.addColorStop(0, "#ffffff");
  g.addColorStop(1, "rgba(255,255,255,0)");
  c.fillStyle = g;
  c.fillRect(320, 0, 64, 64);

  // tower body (0,64,128,128)
  c.fillStyle = "#16303B";
  c.beginPath();
  c.roundRect(8, 72, 112, 112, 14);
  c.fill();
  c.strokeStyle = "#5BD9E8";
  c.lineWidth = 6;
  c.stroke();
  c.fillStyle = "#0A101F";
  c.beginPath();
  c.arc(64, 128, 16, 0, TAU);
  c.fill();

  // tower barrel (128,64,64,64) — white, extends from cell center to the right, tinted cyan
  c.fillStyle = "#ffffff";
  c.beginPath();
  c.roundRect(158, 90, 30, 12, 5);
  c.fill();

  // core (256,64,128,128)
  c.fillStyle = "#0F2B1C";
  c.fillRect(264, 72, 112, 112);
  c.strokeStyle = "#57E389";
  c.lineWidth = 6;
  c.strokeRect(268, 76, 104, 104);
  c.fillStyle = "#57E389";
  c.beginPath();
  c.moveTo(320, 96);
  c.lineTo(352, 128);
  c.lineTo(320, 160);
  c.lineTo(288, 128);
  c.closePath();
  c.fill();

  return a;
}
