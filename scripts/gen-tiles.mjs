// Writes the floor tiles, walls and props as PNGs into public/tiles/ — the editor's palette
// picker shows them as <img>, and an <img> wants a file. The game itself
// never reads these: the atlas and the menu paint the same tiles straight
// from game/tiles.ts at load. Re-run after touching FLOOR_STYLE or
// paintFloor:
//
//   npm run gen:tiles
//
// (node --experimental-strip-types lets this import the .ts directly.)
import { mkdirSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import {
  FLOOR_KINDS, FLOOR_VARIANTS, paintFloor, paintProp, paintWall, PROP_KINDS, PROP_STYLE, TILE_PX,
  WALL_KINDS, WALL_VARIANTS,
} from "../game/tiles.ts";

const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};
const png = (rgba, w, h) => {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0; // filter: none
    Buffer.from(rgba.buffer, rgba.byteOffset + y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
};

mkdirSync("public/tiles", { recursive: true });
for (const kind of FLOOR_KINDS)
  for (let v = 0; v < FLOOR_VARIANTS; v++) {
    const file = `public/tiles/${kind}${v + 1}.png`;
    writeFileSync(file, png(paintFloor(kind, v), TILE_PX, TILE_PX));
    console.log("wrote", file);
  }
for (const kind of WALL_KINDS)
  for (let v = 0; v < WALL_VARIANTS; v++) {
    const file = `public/tiles/wall-${kind}${v + 1}.png`;
    writeFileSync(file, png(paintWall(kind, v), TILE_PX, TILE_PX));
    console.log("wrote", file);
  }
for (const kind of PROP_KINDS) {
  const file = `public/tiles/prop-${kind}.png`;
  writeFileSync(file, png(paintProp(kind), PROP_STYLE[kind].size, PROP_STYLE[kind].size));
  console.log("wrote", file);
}
