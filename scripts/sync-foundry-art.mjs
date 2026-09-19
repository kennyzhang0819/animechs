// THE ART THE GAME SHIPS IS THE ART IN docs/turret-concepts/.
//
// The heads and the core are authored as PNGs there — drawn first by
// scripts/turret-concepts.mjs and EDITED BY HAND afterwards, which is why
// the PNG and not the generator is the source of truth. The browser can
// only fetch what sits under public/, so this copies the sheet into
// public/foundry/<kind>.png (game/foundryArt.ts names them, game/atlas.ts
// packs them). It runs before every dev server and every build, so an
// edit to the sheet is on the board the next time the page loads.
//
//   node scripts/sync-foundry-art.mjs
import { copyFileSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";

const SRC = "docs/turret-concepts";
const OUT = "public/foundry";

// mill-<kind>.png is a head and mill-core.png the core, both shipped
// under their bare name; base-N.png is the plate a head stands on, one
// per footprint in cells, shipped as-is — it is ALREADY the darkened
// plate, so nothing darkens it again. roster.json is a caption table and
// does not ship.
const art = readdirSync(SRC).filter((f) => f.endsWith(".png") && (f.startsWith("mill-") || f.startsWith("base-")));
const heads = art.filter((f) => f.startsWith("mill-"));
if (!heads.length) throw new Error(`no mill-*.png in ${SRC}`);
// the footprints there are plates for (game/turretArt.ts PLATE_SIZES) —
// written out rather than imported, because this runs on plain node
for (const n of [1, 2, 3, 4, 6]) {
  if (!art.includes(`base-${n}.png`)) throw new Error(`no base-${n}.png in ${SRC}`);
}

mkdirSync(OUT, { recursive: true });
// wipe first: a head deleted from the sheet must not linger in the bundle
for (const f of readdirSync(OUT)) rmSync(`${OUT}/${f}`);

let bytes = 0;
for (const f of art) {
  const to = `${OUT}/${f.startsWith("mill-") ? f.slice("mill-".length) : f}`;
  copyFileSync(`${SRC}/${f}`, to);
  bytes += statSync(to).size;
}
console.log(`foundry art: ${art.length} sprites, ${bytes} bytes, ${SRC}/ -> ${OUT}/`);
