/**
 * DRESS an authored map: repaint its floors, its rock and its clutter
 * from a palette and a handful of rules, and write the GEOMETRY back
 * exactly as it was read.
 *
 *   node scripts/maps/dress.mjs confluence [preview.png]
 *   node scripts/maps/dress.mjs maelstrom [preview.png]
 *
 * Confluence and Maelstrom were drawn by hand in the editor, and a hand
 * paints one floor down a road and drops the second rock family in
 * whatever blobs it happens to. Quagmire was drawn from geometry and
 * DRESSED from geometry, and that is the whole difference in how it
 * reads: the rock is a pale rim round a dark heart, so every mass is
 * outlined against what it stands in; the roads are one floor with a
 * second wandering across them; and the start screen goes the same way,
 * a base biome with a second family laid over it in noise patches. So
 * the same rules are put on the first two maps here, once, from the
 * masks they already carry:
 *
 *   heart         the rock is ONE family, road or no road: a road is cut
 *                 through the rock, and the rock on both sides of it is
 *                 the same rock. NOTHING OUTLINES A ROAD
 *   outcrops      patches of a second family where a low-frequency noise
 *                 runs high — the menu's second rock
 *   coast         where there is water, the rock near it is the coast
 *                 family, BROAD — Quagmire's rim is forty percent of each
 *                 island — and the line wobbled by noise. It follows the
 *                 SEA; a road through the heart gets no rim of its own
 *   patches       the road's second floor, the same way
 *   foot          scree at the foot of the rock: the road's cells that
 *                 touch it wear a darker floor, broken up by noise
 *   flats         a third floor in the wide open places only, where the
 *                 road has room to be a plain rather than a lane
 *   shore         a beach band along the water (Maelstrom)
 *   boulders      a light scatter along the road's edges, never in its
 *                 middle, never in a drop zone, never round the base
 *
 * WHAT IT NEVER TOUCHES: `blocked`, `exits`, `spawns`, `base`, either
 * water sentinel, any water floor, and any pine. Those are the map;
 * everything here is its paint, and the checks at the end refuse to
 * write if any of them moved.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { clearance, rng, png } from "./geom.mjs";

// The atlas indices this paints with — COPIED from game/atlas.ts, as the
// other generators do: the generator is plain node and the atlas reaches
// for a canvas at load. Keep the names identical and grep both.
const FLOOR_STONE = 3;
const FLOOR_DIRT = 6;
const FLOOR_SAND = 9;
const FLOOR_DARKSAND = 12;
const FLOOR_SHALLOW_WATER = 15;
const FLOOR_DEEP_WATER = 18;
const FLOOR_SHALE = 30;
const FLOOR_SALT = 36;
const FLOOR_BASALT = 42;
const FLOOR_TAINTED_WATER = 45;
const FLOOR_DEEP_TAINTED_WATER = 48;
const WATER_FLOORS = [FLOOR_SHALLOW_WATER, FLOOR_DEEP_WATER, FLOOR_TAINTED_WATER, FLOOR_DEEP_TAINTED_WATER];
const WALL_STONE = 0;
const WALL_DIRT = 2;
const WALL_DARK = 5;
const WALL_PINE = 4;
const WALL_DEEP = 7;
const WALL_SHALE = 10;
const WALL_SAND = 18;
const WALL_DUNE = 20;
// decor kinds (UV_DECOR) and their width in tiles (DECOR_TILES)
const DECOR = {
  boulder: { kinds: [0, 1], tiles: 1.5 },
  shaleBoulder: { kinds: [7, 8], tiles: 1 },
  sandBoulder: { kinds: [12, 13], tiles: 1 },
};
const CELL = 20; // world px per cell (game/constants.ts)

/**
 * THE TWO DRESSINGS. Every number a map's look is made of, in one place.
 * Floors are the first index of a family (the variant is rolled); walls
 * the first of a pair.
 */
const STYLES = {
  // WORLD 1 IS THE DESERT. Sand roads under dark dune cliffs, the pale
  // sandstone showing where the masses are thick, dark sand blown across
  // the road in drifts and lying as scree at the foot of the rock, and
  // salt where the road opens into a flat.
  confluence: {
    seed: 0xd35e,
    road: {
      base: FLOOR_SAND,
      patch: { floor: FLOOR_DIRT, at: 0.6, scale: 14 },
      foot: { floor: FLOOR_DARKSAND, depth: 1.2, scale: 5 },
      flat: { floor: FLOOR_SALT, at: 0.72, scale: 24, clear: 7 },
    },
    rock: {
      // dark dune rock, pale sand road: the road is traceable because the
      // rock is dark, not because anything lines it. The outcrops are the
      // ochre dirt wall — sandstone would be the sand road's own tone, and
      // a pale patch in dark rock would read as a pocket of road
      heart: WALL_DUNE,
      outcrop: { wall: WALL_DIRT, at: 0.62, scale: 22 },
      under: FLOOR_SAND,
    },
    props: { decor: DECOR.sandBoulder, per: 30 },
  },
  // WORLD 2 IS THE STORM COAST. Grey stone roads through dark rock, wet
  // dark sand where a road meets the water, blue-grey shale drifting
  // across the roads and standing as the coast — the shale is the water's
  // own blue, so the sea is outlined in its own colour the way Quagmire's
  // is in dacite, and the roads are cut through the dark heart with the
  // same rock on both sides.
  maelstrom: {
    seed: 0x3a1f,
    road: {
      base: FLOOR_STONE,
      patch: { floor: FLOOR_SHALE, at: 0.6, scale: 15 },
      shore: { floor: FLOOR_DARKSAND, depth: 2.5, scale: 7 },
    },
    rock: {
      heart: WALL_DARK,
      outcrop: { wall: WALL_SHALE, at: 0.66, scale: 22 },
      // BROAD, AS QUAGMIRE'S IS. Its heart is the island at 0.58 of its
      // own outline, so the pale rim is some forty percent of every mass
      // — a coast, not a line round the water. The rock between the arms
      // of the spiral is 40-60 cells thick, so a coast fourteen deep,
      // wandering by eight, leaves a dark heart down the middle of each
      coast: { wall: WALL_SHALE, depth: 14, scale: 14, wobble: 16 },
      under: FLOOR_DARKSAND,
    },
    props: { decor: DECOR.shaleBoulder, per: 40 },
  },
};

/** 3-octave value noise in [0,1] on a fresh lattice — the one terrain.ts uses */
const makeNoise = (rnd) => {
  const seed = (rnd() * 0x7fffffff) | 0;
  const ox = rnd() * 512, oy = rnd() * 512;
  const lattice = (ix, iy) => {
    let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + seed) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
  const val = (x, y) => {
    const ix = Math.floor(x), iy = Math.floor(y);
    const fx = x - ix, fy = y - iy;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = lattice(ix, iy), b = lattice(ix + 1, iy);
    const c = lattice(ix, iy + 1), d = lattice(ix + 1, iy + 1);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
  return (x, y) =>
    val(x + ox, y + oy) * 0.55 +
    val((x + ox) * 2.17, (y + oy) * 2.17) * 0.28 +
    val((x + ox) * 4.31, (y + oy) * 4.31) * 0.17;
};

const isWater = (f) => WATER_FLOORS.includes(f - (f % 3));

const dress = (doc, st) => {
  const W = doc.w;
  const H = doc.floor.length / W;
  const N = W * H;
  const rnd = rng(st.seed);
  const floor = Uint8Array.from(doc.floor);
  const wall = Uint8Array.from(doc.wall);
  const { blocked } = doc;
  const inFamily = (v, first) => v >= first && v < first + 3;
  const variant = (first) => first + ((rnd() * 3) | 0);
  const pair = (first) => first + ((rnd() * 2) | 0);

  // what a cell is, before anything is painted
  const water = (i) => wall[i] === WALL_DEEP || isWater(floor[i]);
  const rock = (i) => blocked[i] === 1 && wall[i] !== WALL_DEEP && wall[i] !== WALL_PINE;
  const open = (i) => blocked[i] === 0 && !isWater(floor[i]);

  // the distances everything hangs off: how far from rock an open cell
  // is, how far from water anything is
  const dFromRock = clearance(W, H, (i) => !rock(i));
  const dFromWater = clearance(W, H, (i) => !water(i));

  const nRim = makeNoise(rnd);
  const nOut = makeNoise(rnd);
  const nPatch = makeNoise(rnd);
  const nFoot = makeNoise(rnd);
  const nFlat = makeNoise(rnd);
  const nShore = makeNoise(rnd);

  const count = { coast: 0, heart: 0, outcrop: 0, base: 0, patch: 0, foot: 0, flat: 0, shore: 0 };

  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (rock(i)) {
        const r = st.rock;
        floor[i] = variant(r.under);
        if (r.coast && dFromWater[i] <= r.coast.depth + (nRim(x / r.coast.scale, y / r.coast.scale) - 0.5) * r.coast.wobble) {
          wall[i] = pair(r.coast.wall);
          count.coast++;
        } else if (nOut(x / r.outcrop.scale, y / r.outcrop.scale) > r.outcrop.at) {
          wall[i] = pair(r.outcrop.wall);
          count.outcrop++;
        } else {
          wall[i] = pair(r.heart);
          count.heart++;
        }
      } else if (open(i)) {
        const r = st.road;
        // the order is the order of precedence: the shore is the shore
        // whatever else the noise says, the scree stands on the drifts,
        // and the drifts on the plain
        if (r.shore && dFromWater[i] <= r.shore.depth + (nShore(x / r.shore.scale, y / r.shore.scale) - 0.5) * 3) {
          floor[i] = variant(r.shore.floor);
          count.shore++;
        } else if (r.foot && dFromRock[i] <= r.foot.depth + (nFoot(x / r.foot.scale, y / r.foot.scale) - 0.5) * 3) {
          floor[i] = variant(r.foot.floor);
          count.foot++;
        } else if (r.flat && dFromRock[i] >= r.flat.clear && nFlat(x / r.flat.scale, y / r.flat.scale) > r.flat.at) {
          floor[i] = variant(r.flat.floor);
          count.flat++;
        } else if (r.patch && nPatch(x / r.patch.scale, y / r.patch.scale) > r.patch.at) {
          floor[i] = variant(r.patch.floor);
          count.patch++;
        } else {
          floor[i] = variant(r.base);
          count.base++;
        }
      }
      // water and the sentinels: left exactly as read
    }

  // THE BOULDERS: along the edges of the road, where a unit walks round
  // them anyway, and never in the middle where the column goes; never in
  // a drop zone, never in the base's clearing, never in a wet cell
  const decor = [];
  const base = doc.base;
  const nearBase = (x, y) =>
    x >= base.x - 6 && x < base.x + 11 && y >= base.y - 6 && y < base.y + 11;
  const inZone = (x, y) =>
    doc.spawns.some((c) => Math.hypot(x + 0.5 - c.x, y + 0.5 - c.y) <= c.r + 2);
  let edgeCells = 0;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (!open(i) || dFromRock[i] < 1 || dFromRock[i] > 3.5) continue;
      if (dFromWater[i] < 3 || nearBase(x, y) || inZone(x, y)) continue;
      edgeCells++;
      if (rnd() * st.props.per >= 1) continue;
      const kind = st.props.decor.kinds[(rnd() * st.props.decor.kinds.length) | 0];
      decor.push({
        x: (x + 0.5) * CELL,
        y: (y + 0.5) * CELL,
        size: CELL * st.props.decor.tiles,
        rot: ((rnd() * 4) | 0) * (Math.PI / 2),
        kind,
      });
    }
  count.boulders = decor.length;
  count.edgeCells = edgeCells;

  return { floor, wall, decor, count, W, H, N };
};

// ---------- checks ----------
const check = (doc, out) => {
  const fails = [];
  const say = (ok, msg) => {
    console.log(`${ok ? "  ok " : "FAIL "}${msg}`);
    if (!ok) fails.push(msg);
  };
  const { floor, wall, N } = out;
  let wet = 0, sentinel = 0, pine = 0, wetMoved = 0;
  for (let i = 0; i < N; i++) {
    if (doc.wall[i] === WALL_DEEP || doc.wall[i] === WALL_PINE) {
      sentinel++;
      if (wall[i] !== doc.wall[i] || floor[i] !== doc.floor[i]) wetMoved++;
      if (doc.wall[i] === WALL_PINE) pine++;
    }
    if (isWater(doc.floor[i])) {
      wet++;
      if (floor[i] !== doc.floor[i]) wetMoved++;
    }
    if (!isWater(doc.floor[i]) && isWater(floor[i])) wetMoved++;
    if (doc.blocked[i] === 1 && doc.wall[i] !== WALL_DEEP && doc.wall[i] !== WALL_PINE && (wall[i] === WALL_DEEP || wall[i] === WALL_PINE))
      wetMoved++;
  }
  say(wetMoved === 0, `water and sentinel cells moved: ${wetMoved} (of ${wet} wet, ${sentinel} sentinel, ${pine} pine)`);
  say(floor.length === doc.floor.length && wall.length === doc.wall.length, `layer sizes kept: ${floor.length}`);
  const c = out.count;
  const pct = (v) => ((100 * v) / N).toFixed(1);
  console.log(`  -- rock: heart ${c.heart} (${pct(c.heart)}%)  outcrop ${c.outcrop} (${pct(c.outcrop)}%)  coast ${c.coast} (${pct(c.coast)}%)`);
  console.log(`  -- road: base ${c.base}  patch ${c.patch}  foot ${c.foot}  flat ${c.flat}  shore ${c.shore}`);
  console.log(`  -- boulders: ${c.boulders} on ${c.edgeCells} edge cells`);
  say(c.outcrop > 0 && c.heart > 0, "both rock families are on the map");
  return fails;
};

// ---------- run ----------
const id = process.argv[2];
const st = STYLES[id];
if (!st) {
  console.error(`no dressing for "${id}" — one of ${Object.keys(STYLES).join(", ")}`);
  process.exit(2);
}
const file = new URL(`../../public/maps/${id}.json`, import.meta.url);
const doc = JSON.parse(readFileSync(file, "utf8"));
if (!doc.w) throw new Error(`${id}: document carries no width`);
const out = dress(doc, st);
const fails = check(doc, out);

// the picture: flat family tones, one cell per SC px
const TONE = {
  floor: {
    [FLOOR_STONE]: [0x7c, 0x7c, 0x84], [FLOOR_DIRT]: [0x8f, 0x6b, 0x4a], [FLOOR_SAND]: [0xcf, 0xb4, 0x88],
    [FLOOR_DARKSAND]: [0x4a, 0x46, 0x44], [FLOOR_SHALLOW_WATER]: [0x5a, 0x86, 0xb8], [FLOOR_DEEP_WATER]: [0x2c, 0x4f, 0x80],
    [FLOOR_SHALE]: [0x5f, 0x5a, 0x80], [FLOOR_SALT]: [0xf0, 0xf1, 0xf5], [FLOOR_BASALT]: [0x41, 0x3e, 0x3e],
  },
  wall: {
    [WALL_STONE]: [0x84, 0x84, 0x8f], [WALL_DARK]: [0x47, 0x4c, 0x53], [WALL_SHALE]: [0x75, 0x73, 0x9a],
    [WALL_SAND]: [0xdc, 0xc3, 0x9e], [WALL_DUNE]: [0x57, 0x53, 0x51],
  },
};
const SC = 3;
const preview = () =>
  png(out.W * SC, out.H * SC, (X, Y) => {
    const x = (X / SC) | 0, y = (Y / SC) | 0, i = y * out.W + x;
    const f = out.floor[i] - (out.floor[i] % 3);
    if (!doc.blocked[i] || out.wall[i] === WALL_DEEP) return TONE.floor[f] ?? [0xff, 0, 0xff];
    return TONE.wall[out.wall[i] - (out.wall[i] % 2)] ?? [0xff, 0, 0xff];
  });
if (process.argv[3]) {
  writeFileSync(process.argv[3], preview());
  console.log(`  preview -> ${process.argv[3]}`);
}
if (fails.length) {
  console.log(`\nREFUSING TO WRITE: ${fails.length} check(s) failed`);
  process.exit(1);
}
// the geometry goes back as it came in — same keys, same order, same values
const next = { ...doc, floor: Array.from(out.floor), wall: Array.from(out.wall), pines: [], decor: out.decor };
writeFileSync(file, JSON.stringify(next));
console.log(`  wrote public/maps/${id}.json`);
