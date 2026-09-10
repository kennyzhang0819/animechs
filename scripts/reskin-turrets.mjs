/**
 * THE TWO TIER-3 HEADS, REPAINTED ONTO THEIR OWN LINE'S PALETTE.
 *
 * Every turret in the roster is a line of its own art, and
 * two of those lines ended on a gun that looked like it came from
 * somewhere else. Mindustry's spectre and meltdown share one palette —
 * dark gunmetal plating with hot-orange channels down the barrels — while
 * the guns below them do not:
 *
 *   ground        duo -> salvo -> spectre     copper plating, pale steel
 *   groundSupport arc -> lancer -> meltdown   titanium blue, white
 *
 * So the tier-3 reads as a stranger next to the two it is meant to be the
 * end of. This script repaints it. Mindustry block art is flat-shaded and
 * these four sprites are FOUR COLOURS EACH — a shadow/lit pair for the
 * plating and another for the channel — so the repaint is an exact
 * one-for-one swap of those four for the four the line below already
 * wears, taken out of duo-preview.png and lancer.png rather than invented.
 * Shape, shading and every edge stay Mindustry's; only the hues move.
 *
 * The output is derived art, so it does NOT go in public/mindustry (that
 * tree is the upstream sprites, unmodified, and stays that way) — it goes
 * in public/sprites, which is this game's own. Both the atlas (atlas.ts
 * SRC) and the build menu's icons (towerIcons.ts) read it from there.
 *
 *   node scripts/reskin-turrets.mjs
 *
 * Re-run it only if the palettes below change; the PNGs are committed.
 */
import sharp from "sharp";
import { mkdir } from "node:fs/promises";

const SRC = "public/mindustry/sprites/blocks/turrets";
const OUT = "public/sprites/turrets";

/** the four colours every one of these heads is drawn in, in the order
 *  plating-shadow, plating-lit, channel-shadow, channel-lit */
const GUNMETAL = ["4d4e58", "7b7b7b", "ec7458", "ff9c5a"];
/** duo-preview.png's four, which salvo's hull plates carry too */
const COPPER = ["8f665b", "c9a58f", "b0bac0", "f4f4f4"];
/** lancer.png's four, which arc wears in the other order */
const TITANIUM = ["6974c4", "8aa3f4", "c1c3d4", "f4f4f4"];

const JOBS = [
  { name: "spectre", to: COPPER },
  { name: "meltdown", to: TITANIUM },
];

const rgb = (hex) => [
  parseInt(hex.slice(0, 2), 16),
  parseInt(hex.slice(2, 4), 16),
  parseInt(hex.slice(4, 6), 16),
];

for (const { name, to } of JOBS) {
  const { data, info } = await sharp(`${SRC}/${name}.png`)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  // key the swap on the packed RGB so a lookup is one integer compare;
  // every pixel in these sprites is either fully opaque or fully clear
  const map = new Map();
  GUNMETAL.forEach((from, i) => {
    const [r, g, b] = rgb(from);
    map.set((r << 16) | (g << 8) | b, rgb(to[i]));
  });
  let missed = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    const hit = map.get((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]);
    if (!hit) {
      missed++;
      continue;
    }
    [data[i], data[i + 1], data[i + 2]] = hit;
  }
  // a miss means upstream's art gained a colour this table does not know,
  // and a half-repainted turret is worse than none — say so rather than
  // shipping it
  if (missed) throw new Error(`${name}.png: ${missed} px outside the palette table`);
  await mkdir(OUT, { recursive: true });
  await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png()
    .toFile(`${OUT}/${name}.png`);
  console.log(`${OUT}/${name}.png  ${info.width}x${info.height}`);
}
