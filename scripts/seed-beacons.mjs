/**
 * SEED EVERY OFFICIAL MAP WITH A DRAFT SET OF BEACONS.
 *
 * WHAT THIS IS FOR, AND WHAT IT IS NOT. Where a beacon stands and what it
 * costs is where a map's mission is written (see MapBeacon in
 * game/terrain.ts), and no script can write a mission. This exists so that
 * a freshly generated map is PLAYABLE rather than locked inside the circle
 * its base lights — a first draft to open in the editor and argue with,
 * using the Beacon brush in the Zones section.
 *
 * IT IS DELIBERATELY IRREGULAR. The first cut of this walked candidates
 * nearest-first and took anything a fixed distance from the last, which is
 * a recipe for exactly the thing a map must not look like: three or four
 * beacons pinned at identical range from the base on every board, then even
 * rings marching outward, and the same count everywhere. A ladder a player
 * can predict is a ladder that stops being a decision. So:
 *
 *   - candidates are SHUFFLED, not sorted, and accepted greedily;
 *   - the spacing each one demands VARIES, a wide random band per pick, so
 *     clusters and gaps both happen;
 *   - the ring the ladder starts at varies too, rather than every map
 *     having its cheapest beacon at the same range;
 *   - the COUNT is read off how far the map actually sprawls, so a compact
 *     board gets fewer than a wide one.
 *
 * The randomness is SEEDED off the map id, so re-running reproduces the
 * same draft and a diff is meaningful.
 *
 *   node --experimental-transform-types --import ./scripts/ts-hooks.mjs \
 *     scripts/seed-beacons.mjs [--force] [map-id ...]
 *
 * Without --force it leaves any map that already carries beacons alone —
 * hand placement is the entire point of the feature and must not be
 * flattened by re-running the seeder.
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { defaultBeaconPrice, BEACON_TIER_FROM, beaconTier } from "../game/maps.ts";
import { WALL_PINE } from "../game/terrain.ts";

const MAPS_DIR = "public/maps";
/** a beacon's footprint, in cells — constants.ts BEACON_SIZE */
const BEACON_SIZE = 3;
/** constants.ts CORE_POWER_R, in cells: the ground the base lights for free */
const CORE_R = 90;
/** the two ranges that cut the three price bands (maps.ts) */
const TIER_FROM = BEACON_TIER_FROM;

/**
 * HOW MANY BEACONS IN EACH BAND, AND IT IS THE SAME ON EVERY MAP.
 *
 * The band prices are fixed across the whole game (maps.ts
 * BEACON_TIER_PRICE), so the cost of opening a board has to be fixed too —
 * 4x3,000 + 5x12,000 + 4x40,000 is 232,000 scrap on Crater and 232,000 on
 * Greenwood, which is what lets the campaign's progression be designed
 * against one number instead of nine.
 *
 * What differs between maps is WHERE the ladder runs, not what it costs.
 */
const PER_BAND = [4, 5, 4];

/**
 * HOW FAR OUT THE LADDER STARTS, and it is not zero.
 *
 * The base lights 90 cells for free (CORE_R). A beacon dropped inside that
 * opens a sliver of new ground or none at all — it is a building the game
 * would charge three thousand scrap for and hand back nothing, and the
 * overlay is honest enough to draw it as nothing (Game.drawBeaconGain), which
 * is a confusing thing to put on a board on purpose.
 *
 * Fifteen cells past the edge is where a beacon's own circle clears the
 * base's by enough that buying it is visibly worth something.
 */
const FROM_BASE = CORE_R + 15;

/**
 * PER-MAP OVERRIDES. Anything left out is derived below. Put a number here
 * when a board wants a different shape of ladder from the one the rule
 * gives it — a map meant to be fought in one corner wants few and dear, a
 * sprawling one wants many and cheap.
 *
 *   perBand how many beacons in each of the three price bands, as a triple.
 *           Changing this changes what opening the board COSTS, so it is a
 *           progression decision and not a map one — think twice.
 *   spacing the middle of the random band each pick demands of its
 *           neighbours, in cells
 */
const PER_MAP = {
  // (none yet — every map is on the derived rule. Add entries as the maps
  // get their missions written.)
};

/** the random band a spacing is drawn from, as fractions of `spacing` */
const SPACING_LOW = 0.62, SPACING_HIGH = 1.5;

/** mulberry32, so a map id always drafts the same board */
const rngFor = (id) => {
  let h = 0x811c9dc5;
  for (const ch of id) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193);
  return () => {
    h = (h + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const args = process.argv.slice(2);
const force = args.includes("--force");
const only = args.filter((a) => !a.startsWith("--"));
const ids =
  only.length > 0
    ? only
    : readdirSync(MAPS_DIR).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5));

let touched = 0;
for (const id of ids) {
  const path = join(MAPS_DIR, `${id}.json`);
  const doc = JSON.parse(readFileSync(path, "utf8"));
  if (doc.beacons?.length && !force) {
    console.log(`${id}: ${doc.beacons.length} beacons already — left alone (--force to redo)`);
    continue;
  }
  const rnd = rngFor(id);
  const short = [];
  const w = doc.w ?? 128;
  const h = Math.floor(doc.floor.length / w);
  const at = doc.base ?? doc.core ?? { x: 120, y: 33 };
  const bx = at.x + 2.5, by = at.y + 2.5;

  // EVERY LEGAL FOOTPRINT: a 3x3 of bare rock, no pine — a tree is a prop
  // the swarm can clear out from under a beacon, a hill is not. Stepped by
  // two cells, which a 3x3 can afford (it overlaps its neighbour by a cell)
  // and which quarters the scan
  const cand = [];
  for (let y = 1; y < h - BEACON_SIZE - 1; y += 2)
    for (let x = 1; x < w - BEACON_SIZE - 1; x += 2) {
      let rock = true;
      for (let dy = 0; dy < BEACON_SIZE && rock; dy++)
        for (let dx = 0; dx < BEACON_SIZE; dx++) {
          const i = (y + dy) * w + (x + dx);
          if (!doc.blocked[i] || doc.wall[i] === WALL_PINE) { rock = false; break; }
        }
      if (!rock) continue;
      const cx = x + BEACON_SIZE / 2, cy = y + BEACON_SIZE / 2;
      cand.push({ x, y, cx, cy, d: Math.hypot(cx - bx, cy - by) });
    }

  const over = PER_MAP[id] ?? {};
  const want = over.perBand ?? PER_BAND;
  const spacing = over.spacing ?? 78;

  // ONE BAND AT A TIME, AND EVERY BAND FILLED.
  //
  // THE LADDER IS THE SAME SHAPE ON EVERY MAP because the band prices are a
  // fixed part of the game's progression (maps.ts BEACON_TIER_PRICE) — the
  // cost of opening a board is a number the campaign is designed around, and
  // it cannot be a number that depends on which board. So the draft takes a
  // FIXED COUNT from each band rather than a total spread over whatever the
  // terrain offered.
  //
  // The earlier pass shuffled the whole map together and stopped at a cap,
  // which starved the outer band on any compact map: Crater came out with
  // nine beacons and NOT ONE in band 3, so that board's progression had two
  // rungs where every other board had three. Every official map has legal
  // rock in all three bands — Crater has 865 sites out to 360 cells — so a
  // band coming up empty was the picker's doing, never the terrain's.
  //
  // WHAT STAYS IRREGULAR is where inside a band they land: candidates are
  // shuffled and the spacing each pick demands is drawn from a wide random
  // band, so the ring is clumps and gaps rather than a circle of dots.
  const taken = [];
  for (let band = 0; band < 3; band++) {
    const lo = band === 0 ? FROM_BASE : TIER_FROM[band - 1];
    const hi = band === 2 ? Infinity : TIER_FROM[band];
    const pool = cand.filter((c) => c.d > lo && c.d <= hi);
    for (let i = pool.length - 1; i > 0; i--) {
      const j = (rnd() * (i + 1)) | 0;
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    // RELAX RATHER THAN GIVE UP. A tight band on a tight map — Crater's
    // band 3 is a thin crescent of rock — may not hold the full count at
    // the spacing the wide bands use, and a band short of its quota is the
    // one outcome this must not produce. So it tries again at three
    // quarters, then a half, then takes what it can reach.
    const before = taken.length;
    for (const relax of [1, 0.75, 0.5, 0]) {
      for (const c of pool) {
        if (taken.length - before >= want[band]) break;
        if (taken.includes(c)) continue;
        const gap = spacing * relax * (SPACING_LOW + rnd() * (SPACING_HIGH - SPACING_LOW));
        if (gap > 0 && taken.some((t) => Math.hypot(t.cx - c.cx, t.cy - c.cy) < gap)) continue;
        taken.push(c);
      }
      if (taken.length - before >= want[band]) break;
    }
    if (taken.length - before < want[band])
      short.push(`band ${band + 1}: ${taken.length - before} of ${want[band]}`);
  }
  // nearest first in the document, so the file reads as the ladder it is
  taken.sort((a, b) => a.d - b.d);
  doc.beacons = taken.map((t) => ({ x: t.x, y: t.y, price: defaultBeaconPrice(t.d) }));
  writeFileSync(path, `${JSON.stringify(doc)}\n`);
  touched++;
  const bands = [0, 0, 0];
  for (const t of taken) bands[beaconTier(t.d) - 1]++;
  const sum = doc.beacons.reduce((a, r) => a + r.price, 0);
  console.log(
    `${id}: band 1/2/3 = ${bands.join("/")}, ` +
      `${sum.toLocaleString("en-US")} scrap to open the whole map, ` +
      `ranges ${taken.map((t) => Math.round(t.d)).join(", ")}`,
  );
  // A BAND SHORT OF ITS QUOTA IS THE ONE THING THIS MUST NOT SHIP QUIETLY:
  // it would give that board a different progression from every other one
  if (short.length > 0)
    console.log(`  ^^ SHORT — ${short.join(", ")}. This map needs more rock out there, or a hand-placed beacon.`);
  if (doc.beacons.length === 0)
    console.log(`  ^ no 3x3 of bare rock past ${from} cells — this map needs hills, or hand placement`);
}
console.log(`${touched} map${touched === 1 ? "" : "s"} written`);
