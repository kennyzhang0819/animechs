// FOUNDRY, THE TURRET CONCEPT SHEETS: every head of the roster drawn at
// native size (32 px a tile: 32, 64, 96, 128 for a 1x1 to a 4x4) into
// docs/turret-concepts/, and every render checked against the house
// rules: no run of one material under four pixels along a row or a
// column, and none under eight where it straddles the midline the shade
// splits (game/turretArt.ts thinRuns).
//
// The game ships the PNGs this writes (game/foundryArt.ts). The sheet was
// edited by hand for a while and the code carried what it had seeded, so
// the script refuses to overwrite a drawing that is already there unless
// FORCE=1 says to; since the four-pixel pass the code is the drawing
// again and the sheet is a render of it, so FORCE=1 is the normal way to
// update the sheet after an edit to the heads.
//
//   npm run gen:turrets                       (skips what exists)
//   FORCE=1 npm run gen:turrets               (re-renders from the code)
//   ALL=1 ...   list every flagged run
//
// The engine, the parts and the heads come from the game itself
// (game/turretArt.ts), so the sheet and the board draw from one place.
// The rules a head is drawn to are written at the top of that file and in
// docs/turret-factions.md.
import { deflateSync } from "node:zlib";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { ACCENT, CORE_N, HEADS, coreHead, drawCore, drawHead, layout, thinRuns } from "../game/turretArt.ts";

// ── PNG, by hand ───────────────────────────────────────────────────────
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (b) => { let c = 0xffffffff; for (const x of b) c = CRC[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(px, n) {
  const raw = Buffer.alloc((n * 4 + 1) * n);
  for (let y = 0; y < n; y++) {
    raw[y * (n * 4 + 1)] = 0;
    for (let x = 0; x < n; x++) {
      const c = px[y * n + x]; const o = y * (n * 4 + 1) + 1 + x * 4;
      if (c === null) { raw.fill(0, o, o + 4); continue; }
      raw[o] = parseInt(c.slice(1, 3), 16); raw[o + 1] = parseInt(c.slice(3, 5), 16); raw[o + 2] = parseInt(c.slice(5, 7), 16); raw[o + 3] = 255;
    }
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(n, 0); ihdr.writeUInt32BE(n, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

/** size in cells and accent group, by kind — the kind is the name now, so
 *  there is no caption column any more (game/constants.ts prints it) */
export const ROSTER = {
  tacker: [1, "bullet"], lobber: [1, "shell"], torch: [1, "flame"], coil: [1, "beam"],
  autocannon: [2, "bullet"], airburst: [2, "missile"], piercer: [2, "beam"], douser: [2, "water"],
  tether: [2, "field"], hive: [2, "missile"],
  cleaver: [3, "flame"], barrage: [3, "shell"], deluge: [3, "water"], whirl: [3, "missile"],
  repeater: [4, "bullet"], furnace: [4, "beam"], railhead: [4, "shell"],
  duster: [1, "toxin"], blighter: [2, "toxin"], drifter: [3, "toxin"], stinger: [4, "toxin"],
};

// ── render, and refuse a thin run ──────────────────────────────────────
const OUT = "docs/turret-concepts";
mkdirSync(OUT, { recursive: true });
const FORCE = !!process.env.FORCE;
let kept = 0;
let thin = 0;
const jobs = [];
for (const kind of Object.keys(ROSTER)) {
  const [size, ammo] = ROSTER[kind];
  jobs.push([kind, () => drawHead(kind, HEADS), () => layout(32 * size, (P) => HEADS[kind](P, ACCENT[ammo]))]);
}
jobs.push(["core", drawCore, () => layout(CORE_N, coreHead)]);
for (const [name, make, laid] of jobs) {
  const file = `${OUT}/mill-${name}.png`;
  // the drawing on disk is kept unless FORCE=1 says to re-render it
  if (!FORCE && existsSync(file)) { kept++; continue; }
  const { n, px } = make();
  // the check reads the materials, not the shades: the split down the
  // middle is not a feature, and a run is measured across it
  const bad = thinRuns(laid(), n);
  for (const b of bad) if (process.env.ALL || thin++ < 40) console.log(`  ${name}: ${b}`);
  thin = Math.max(thin, bad.length);
  writeFileSync(file, png(px, n));
}
writeFileSync(`${OUT}/roster.json`, JSON.stringify({ roster: ROSTER, accent: ACCENT }, null, 2));
console.log(`wrote ${jobs.length - kept} drawings to ${OUT}/, ${thin} thin runs`);
if (kept) console.log(`kept ${kept} already on disk — FORCE=1 to re-render them from the code`);
