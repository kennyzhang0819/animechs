#!/usr/bin/env node
// THE 2.5D CONCEPT SHEETS (docs/style-concepts.html): the voxel asset set
// (game/voxelModels.ts) rendered under each camera in game/voxelArt.ts
// VIEWS, one PNG a view, so a direction can be picked before it goes into
// the game. node --experimental-transform-types --import ./scripts/ts-hooks.mjs scripts/vox-concepts.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { GUNS, GUN_KINDS, gunSprite, padSprite, coreSprite, unitSprite, propSprite, scaled, SPRITE_PX } from "../game/spriteArt.ts";
import { paintFloorVox, paintRockTopVox, paintCliffFace, paintWaterVox } from "../game/voxelModels.ts";

const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (b) => { let c = 0xffffffff; for (const x of b) c = CRC[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(px, w, h) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const c = px[y * w + x]; const o = y * (w * 4 + 1) + 1 + x * 4;
      if (c == null) { raw.fill(0, o, o + 4); continue; }
      raw[o] = parseInt(c.slice(1, 3), 16); raw[o + 1] = parseInt(c.slice(3, 5), 16); raw[o + 2] = parseInt(c.slice(5, 7), 16); raw[o + 3] = 255;
    }
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

/** a canvas of hex strings */
class Sheet {
  constructor(w, h, bg) { this.w = w; this.h = h; this.px = new Array(w * h).fill(bg); }
  blit(r, x0, y0) { for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) { const c = r.px[y * r.w + x]; if (c != null && x0 + x < this.w && y0 + y < this.h && x0 + x >= 0 && y0 + y >= 0) this.px[(y0 + y) * this.w + x0 + x] = c; } }
  tile(px, n, x0, y0, reps = 1) { for (let ry = 0; ry < reps; ry++) for (let rx = 0; rx < reps; rx++) this.blit({ w: n, h: n, px }, x0 + rx * n, y0 + ry * n); }
}
const K = 32 / SPRITE_PX; // native px an art px: a tile is 32
const ground = (px, n) => scaled({ w: n, h: n, px, ground: 0 }, 1);

/** a gun on its pad, as one picture */
function stack(size, kind, facing) {
  const a = padSprite(size), b = gunSprite(kind, facing);
  const w = Math.max(a.w, b.w), h = Math.max(a.h, b.h);
  const out = { w, h, px: new Array(w * h).fill(null), ground: h / 2 };
  const put = (r) => { const ox = (w - r.w) >> 1, oy = (h - r.h) >> 1; for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) { const c = r.px[y * r.w + x]; if (c != null) out.px[(y + oy) * w + x + ox] = c; } };
  put(a); put(b);
  return out;
}

mkdirSync("docs/style-concepts", { recursive: true });
{
  const name = "flat";
  const S = new Sheet(1100, 640, "#1b1d24");
  const grass = paintFloorVox({ base: "#5fae4a", light: "#8fd45e", dark: "#3f8a3a", kind: "grass" }, 0, 11);
  const grass1 = paintFloorVox({ base: "#5fae4a", light: "#8fd45e", dark: "#3f8a3a", kind: "grass" }, 1, 12);
  const earth = paintFloorVox({ base: "#9a6a3c", light: "#c7935a", dark: "#6b4426", kind: "earth" }, 0, 13);
  const rockTop = paintRockTopVox("#8c8278", 0, 14);
  const cliff = paintCliffFace("#8c8278");
  const water = paintWaterVox(false, false, 1);
  for (let x = 0; x < 35; x++) for (let y = 0; y < 20; y++) S.tile((x + y) % 3 === 0 ? grass : grass1, 32, x * 32, y * 32);
  for (let x = 6; x < 10; x++) for (let y = 7; y < 10; y++) S.tile(earth, 32, x * 32, y * 32);
  for (let x = 24; x < 35; x++) for (let y = 0; y < 4; y++) S.tile(rockTop, 32, x * 32, y * 32);
  for (let x = 24; x < 35; x += 2) S.blit(cliff, x * 32, 4 * 32);
  for (let x = 26; x < 35; x++) for (let y = 16; y < 20; y++) S.tile(water, 32, x * 32, y * 32);
  // the guns: every kind on its pad, pointing east, the small ones twice
  let x = 20;
  for (const kind of GUN_KINDS) {
    const size = GUNS[kind].size;
    const pic = scaled(stack(size, kind, size <= 2 && x > 500 ? 3 : 0), K);
    const row = size <= 2 ? 120 : 290;
    if (size <= 2 && x > 1000) { x = 20; }
    S.blit(pic, x, row - pic.h);
    x += pic.w + 8;
    if (kind === "blighter") x = 20;
  }
  // the enemies: four facings a family, three tiers
  x = 20;
  const units = [["rhino", 12, 1], ["rhino", 18, 3], ["rhino", 30, 5], ["stag", 14, 2], ["stag", 28, 5], ["frog", 14, 2], ["frog", 24, 4], ["bat", 14, 2], ["bat", 24, 4], ["hull", 16, 3]];
  for (const [fam, n, tier] of units) {
    for (const dir of [2, 0, 6]) {
      const pic = scaled(unitSprite(fam, n, tier, dir), K);
      S.blit(pic, x, 440 - pic.h);
      x += pic.w + 4;
    }
    x += 8;
  }
  x = 20;
  for (const [shape, n] of [["palm", 16], ["palm", 24], ["tree", 16], ["tree", 24], ["bush", 12], ["rock", 12], ["rock", 20], ["cactus", 12], ["crystal", 12], ["crate", 12]]) {
    const pic = scaled(propSprite(shape, n), K);
    S.blit(pic, x, 580 - pic.h);
    x += pic.w + 10;
  }
  const c = scaled(coreSprite(), K / 2);
  S.blit(c, 920, 470);
  writeFileSync(`docs/style-concepts/vox-${name}.png`, png(S.px, S.w, S.h));
  console.log(`vox-${name}.png`);
}
