/**
 * The home-screen icons, drawn rather than stored — the same rule the rest
 * of the art follows (docs/unit-art.md). A PWA icon has to be a real PNG
 * on disk, so this is the source and public/icon-*.png are the artifact.
 *
 * The mark is laid out on a 32x32 grid and scaled by whole pixels where
 * the target allows, so it stays pixel art at every size.
 */
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const G = 32; // the grid the mark is drawn on
const OUT = new URL("../public/", import.meta.url);

const hex = (s) => [
  parseInt(s.slice(1, 3), 16),
  parseInt(s.slice(3, 5), 16),
  parseInt(s.slice(5, 7), 16),
];

// the kit's own colours (app/globals.css, game/economy.ts)
const BG = hex("#0B0B0D");
const PLATE = hex("#16161C");
const CORE = hex("#7BDFF2"); // XP_COLOR — the core reads as the thing defended
const GUN = hex("#FFD37F"); // POINT_COLOR — the four turrets around it
const EDGE = hex("#2A2A33");

const grid = new Uint8Array(G * G * 4);
const put = (x, y, [r, g, b]) => {
  if (x < 0 || y < 0 || x >= G || y >= G) return;
  const i = (y * G + x) * 4;
  grid[i] = r;
  grid[i + 1] = g;
  grid[i + 2] = b;
  grid[i + 3] = 255;
};
const rect = (x, y, w, h, c) => {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) put(x + i, y + j, c);
};

rect(0, 0, G, G, BG);
rect(2, 2, G - 4, G - 4, PLATE);
// the plate's edge, so the mark still has a silhouette on a dark wallpaper
for (let i = 2; i < G - 2; i++) {
  put(i, 2, EDGE);
  put(i, G - 3, EDGE);
  put(2, i, EDGE);
  put(G - 3, i, EDGE);
}

// the core: a diamond, hollow, because a solid blob at 40px is a dot
const c = (G - 1) / 2;
for (let y = 0; y < G; y++)
  for (let x = 0; x < G; x++) {
    const d = Math.abs(x - c) + Math.abs(y - c);
    if (d <= 8.5 && d >= 5.5) put(x, y, CORE);
  }
rect(14, 14, 4, 4, CORE);

// four guns, one a corner, facing the core
for (const [x, y] of [
  [6, 6],
  [23, 6],
  [6, 23],
  [23, 23],
])
  rect(x, y, 3, 3, GUN);

const crcTable = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let k = n;
    for (let j = 0; j < 8; j++) k = k & 1 ? 0xedb88320 ^ (k >>> 1) : k >>> 1;
    t[n] = k;
  }
  return t;
})();
const crc32 = (buf) => {
  let k = -1;
  for (const b of buf) k = crcTable[(k ^ b) & 0xff] ^ (k >>> 8);
  return (k ^ -1) >>> 0;
};

const chunk = (type, data) => {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
};

/** the 32-grid rasterised at `size`, nearest-neighbour, as a PNG buffer */
function png(size) {
  // one filter byte (0, none) a scanline, then the row's RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  let p = 0;
  for (let y = 0; y < size; y++) {
    raw[p++] = 0;
    const sy = Math.min(G - 1, ((y * G) / size) | 0);
    for (let x = 0; x < size; x++) {
      const sx = Math.min(G - 1, ((x * G) / size) | 0);
      const i = (sy * G + sx) * 4;
      raw[p++] = grid[i];
      raw[p++] = grid[i + 1];
      raw[p++] = grid[i + 2];
      raw[p++] = grid[i + 3];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // 8 bits a channel
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

for (const [name, size] of [
  ["icon-192.png", 192],
  ["icon-512.png", 512],
  ["apple-touch-icon.png", 180],
]) {
  const buf = png(size);
  writeFileSync(join(OUT.pathname.replace(/^\/([A-Za-z]:)/, "$1"), name), buf);
  console.log(`${name}  ${size}x${size}  ${(buf.length / 1024).toFixed(1)} KB`);
}
