#!/usr/bin/env node
/**
 * THE HEADLESS PLAYTEST: run a map through the real sim with a builder
 * bot at the keyboard, and report where it gets to.
 *
 *   npm run playtest -- --world 1            # Confluence, rung 1, shipped economy
 *   npm run playtest -- --world 2 --log 5    # Maelstrom, a line every 5 waves
 *   npm run playtest -- --world 1 --scale 0.5 --cap 300 --mix all
 *
 * The bot is deliberately ordinary: it walks the map's routes (ground,
 * water and air), scores every buildable cell by how much route it can
 * reach that nothing else covers yet, and BUYS THE WAY A PLAYER BUYS —
 * paying TURRET_ROLL_PRICE for a draw off the deal and putting down
 * whatever the roll hands it — which is a TURRET (rarity.ts) and a
 * FORMATION (formation.ts), so one fee buys between four and thirty-six
 * of the same gun. It places them at its own best spots rather than in
 * the shape: the bot has never been shape-aware, and what it is here to
 * measure is the ECONOMY — what a fee buys against what the script sends
 * — and not whether a citadel fits on a junction. It cannot choose a
 * turret any more than a player can, so `--mix` no longer names what it
 * buys: it narrows the POOL the draw comes out of. It never sells, never
 * upgrades a placement, and never reads the wave ahead.
 *
 * Options:
 *   --world <id>     WORLDS id (default 1)
 *   --tier <n>       rung, 0-based (default 0 — no rolled mutators)
 *   --mutators a,b   mutators to play under (default none; intrinsic ones always apply)
 *   --families a,b,c the three families to deal into the script's slots, by key
 *                    (ground, crawler, groundSupport, air, naval, navalSupport) —
 *                    default: the script as authored, which is ground, groundSupport, air
 *   --level <n>      player level: which turrets the track has opened (default 15 — the whole roster)
 *   --scale <x>      multiply the roll fee and every turret price (default 1)
 *   --unit-damage <x>  the swarm's damage to structures, as a multiple of Mindustry's (default: the shipped dial, weapons.ts)
 *   --start <n>      opening scrap (default SCRAP_START)
 *   --cap <n>        most turrets the bot may place (default unlimited)
 *   --mix roster|stage|all|duo   the pool it DRAWS from: everything the save
 *                    owns (the default, and the only one the real game has),
 *                    or a narrowed pool for an experiment — the stage's band,
 *                    every open band, duos only. The fee follows the pool
 *                    every open band, duos only. The fee is flat, so a
 *                    narrowed pool is a poorer deal and not a cheaper one
 *   --log <n>        print a line every n waves (default 5)
 *   --seconds <n>    give up after this much sim time (default 2400)
 *   --probe <n>      seconds of turret-less dry run the bot learns the routes from (default 90, a few waves' worth)
 *   --json           print the report as JSON
 *   --no-build       skip the TypeScript transpile (use the last one)
 *
 * The game modules are transpiled to .playtest/dist with tsc on every run
 * (about ten seconds); nothing in the repo depends on that folder.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, ".playtest", "dist");
const require = createRequire(import.meta.url);

// ---------- args ----------

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  if (i < 0) return def;
  const v = args[i + 1];
  return v === undefined || v.startsWith("--") ? true : v;
};
const flag = (name) => args.includes(`--${name}`);
const WORLD_ID = String(opt("world", "1"));
const TIER = +opt("tier", 0);
const MUTATORS = String(opt("mutators", "")).split(",").filter(Boolean);
const FAMILIES = String(opt("families", "")).split(",").filter(Boolean);
const LEVEL = +opt("level", 15);
const SCALE = +opt("scale", 1);
const UNIT_DAMAGE = opt("unit-damage", null);
const START = opt("start", null);
const CAP = +opt("cap", Infinity);
const MIX_MODE = String(opt("mix", "roster"));
const LOG_EVERY = +opt("log", 5);
const MAX_SECONDS = +opt("seconds", 2400);
const PROBE_OPT = opt("probe", null);
const JSON_OUT = flag("json");

// ---------- transpile ----------

if (!flag("no-build") || !existsSync(path.join(DIST, "sim.js"))) {
  mkdirSync(DIST, { recursive: true });
  // npx is a .cmd shim on Windows, which spawnSync cannot run without a shell
  const r = spawnSync(
    process.platform === "win32" ? "npx.cmd" : "npx",
    [
      "tsc",
      "game/sim.ts", "game/ladder.ts", "game/track.ts", "game/mutation.ts",
      // rarity.ts is named on purpose: nothing the sim reaches imports it
      // (the deal is bought through Game, which is a browser module), and
      // the bot draws off it
      "game/rarity.ts", "game/formation.ts",
      "--outDir", DIST, "--module", "commonjs", "--target", "es2022",
      "--moduleResolution", "node", "--esModuleInterop", "--skipLibCheck",
      "--noEmitOnError", "false", "--resolveJsonModule",
    ],
    { cwd: ROOT, stdio: "pipe", encoding: "utf8", shell: process.platform === "win32" },
  );
  if (!existsSync(path.join(DIST, "sim.js"))) {
    console.error(r.stdout, r.stderr);
    process.exit(1);
  }
}

const L = require(path.join(DIST, "levels.js"));
const RA = require(path.join(DIST, "rarity.js"));
const FO = require(path.join(DIST, "formation.js"));
const E = require(path.join(DIST, "economy.js"));
const C = require(path.join(DIST, "constants.js"));
const M = require(path.join(DIST, "maps.js"));
const LA = require(path.join(DIST, "ladder.js"));
const TR = require(path.join(DIST, "track.js"));
const MU = require(path.join(DIST, "mutation.js"));
const WP = require(path.join(DIST, "weapons.js"));
const TY = require(path.join(DIST, "types.js"));
const { Sim } = require(path.join(DIST, "sim.js"));

// ---------- documents ----------

const pub = (...p) => path.join(ROOT, "public", ...p);
const ids = JSON.parse(readFileSync(pub("levels", "index.json"), "utf8"));
for (const id of ids) {
  const doc = JSON.parse(readFileSync(pub("levels", `${id}.json`), "utf8"));
  L.applyLevelDoc({ ...doc, id });
}
for (const id of M.OFFICIAL_MAP_IDS) {
  const f = pub("maps", `${id}.json`);
  if (existsSync(f)) M.OFFICIAL_MAPS.push(JSON.parse(readFileSync(f, "utf8")));
}

const world = L.worldById(WORLD_ID);
if (!world) {
  console.error(`no world "${WORLD_ID}"; have ${L.WORLDS.map((w) => w.id).join(", ")}`);
  process.exit(1);
}
const spec = { ...LA.specForTier(world, TIER), mutation: MUTATORS };
// THE DEAL, forced: the script's slots played as these families, exactly
// as a run's roll deals them (levels.ts transformScript). Unset plays the
// script as authored, so the numbers a playtest reports against the stage
// table are the authored ones unless a sweep asks otherwise
if (FAMILIES.length > 0) {
  for (const f of FAMILIES)
    if (!L.FAMILIES.some((x) => x.key === f)) {
      console.error(`no family "${f}"; have ${L.FAMILIES.map((x) => x.key).join(", ")}`);
      process.exit(1);
    }
  spec.families = FAMILIES;
  spec.script = L.transformScript(spec.script, FAMILIES);
}
// the probe has to see a few waves walk or the bot lays its line off the
// traced gradient alone
const PROBE_SECONDS = PROBE_OPT === null ? 90 : +PROBE_OPT;

// ---------- the bot ----------

const { COLS, ROWS, CELL, TOWERS } = C;
const SUPPORT = new Set(["wave", "tsunami", "parallax", "meltdown"]);
const MIX = {
  1: ["duo", "hail", "scorch", "scatter"],
  2: ["swarmer", "salvo", "ripple", "cyclone"],
  3: ["spectre", "fuse", "foreshadow"],
};
// a water lane is a FILE — hulls come down it one behind another — and the
// beam turrets are the two that pierce, so on a front that is mostly hulls
// the bot brings them the way a person would. Not the arc: its reach is
// short enough that a shoreline placement is a Hydrophobic one
const WET = { 1: [], 2: ["lancer"], 3: ["meltdown"] };
// the stage the clock is in (STAGES in economy.ts) — no longer a gate on
// anything, but still the bot's buying plan: it spends each stage on the
// band that stage is priced for, as a player minding the bank would
const stageTier = (w) => {
  for (const s of E.STAGES) if (w <= s.to) return s.tier;
  return E.STAGES[E.STAGES.length - 1].tier;
};
const tierMix = (t, wet) => (wet ? [...MIX[t], ...WET[t]] : MIX[t]);
const mixFor = (t, wet = false, roster = null) =>
  MIX_MODE === "roster"
    ? roster ?? []
    : MIX_MODE === "duo"
      ? ["duo"]
      : MIX_MODE === "all"
        ? [...tierMix(1, wet), ...(t >= 2 ? tierMix(2, wet) : []), ...(t >= 3 ? tierMix(3, wet) : [])]
        : tierMix(t, wet);

/**
 * WHERE THE SWARM ACTUALLY GOES: a dry run of the script with no turrets,
 * sampled every half second, as visit counts per cell and layer. A traced
 * gradient line misses the way a wide bay fans a fleet out, and a bot
 * that only covers the line loses to what sails past the ends of it. The
 * probe is the first few minutes of the same script under the same rules.
 */
function heatRoutes(seconds) {
  const probe = new Sim(spec);
  probe.setTech(null);
  const hits = [new Float32Array(COLS * ROWS), new Float32Array(COLS * ROWS)]; // ground, water
  let next = 0;
  while (probe.time < seconds) {
    for (let s = 0; s < 30; s++) probe.update(1 / 60);
    if (probe.time < next) continue;
    next += 0.5;
    for (let i = 0; i < probe.n; i++) {
      if (probe.ufly[i]) continue;
      const gx = (probe.upx[i] / CELL) | 0, gy = (probe.upy[i] / CELL) | 0;
      if (gx < 0 || gy < 0 || gx >= COLS || gy >= ROWS) continue;
      hits[probe.unav[i] ? 1 : 0][gy * COLS + gx] += 1;
    }
  }
  const cellsOf = (h) => {
    const out = [];
    for (let i = 0; i < h.length; i++) if (h[i] > 0) out.push([i % COLS, (i / COLS) | 0, h[i]]);
    return out;
  };
  return { ground: cellsOf(hits[0]), water: cellsOf(hits[1]) };
}

/** follow a flow field's gradient from every spawn to a goal: the cells the swarm walks */
function routeCells(field) {
  const cells = new Set();
  for (const sp of field.spawnPts) {
    let cur = sp;
    for (let n = 0; n < 6000; n++) {
      cells.add(cur);
      if (field.isGoal[cur]) break;
      const x = cur % COLS, y = (cur / COLS) | 0;
      let best = cur, bd = field.dist[cur];
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
          const ni = ny * COLS + nx;
          if (field.walk[ni]) continue;
          if (field.dist[ni] < bd) { bd = field.dist[ni]; best = ni; }
        }
      if (best === cur) break;
      cur = best;
    }
  }
  return [...cells].map((i) => [i % COLS, (i / COLS) | 0]);
}

/** the roads flyers take round the hills, sampled every other cell */
function airCells(sim) {
  const out = [];
  for (const r of sim.airRoutes()) {
    const p = r.pts;
    // a leg at a time: the route is a polyline now, so the sampling that
    // used to run down one segment runs down each of them
    for (let k = 2; k < p.length; k += 2) {
      const x1 = p[k - 2] / CELL, y1 = p[k - 1] / CELL, x2 = p[k] / CELL, y2 = p[k + 1] / CELL;
      const n = Math.max(1, Math.round(Math.hypot(x2 - x1, y2 - y1) / 2));
      for (let i = 0; i <= n; i++) out.push([x1 + ((x2 - x1) * i) / n, y1 + ((y2 - y1) * i) / n]);
    }
  }
  return out;
}

function play() {
  for (const k of TY.TOWER_KINDS)
    E.setScrapPrice(k, Math.max(1, Math.round(E.scrapPriceOf(k) * SCALE)));
  // WHAT A DRAW COSTS is one flat number now (economy.ts
  // TURRET_ROLL_PRICE), read at the buy below
  if (START !== null) E.SCRAP_START = +START;
  if (UNIT_DAMAGE !== null) WP.setUnitDamageScale(+UNIT_DAMAGE);

  const sim = new Sim(spec);
  // what the save at --level owns (the track, track.ts); the default is
  // the whole roster, which is what a map is balanced against
  const tech = TR.techStateFor(LEVEL);
  const owned = tech.unlocked;
  /** what the deal may turn over for this save — Game.drawPool's twin */
  const roster = TY.FIELDED_KINDS.filter((k) => owned.has(k));
  /** ...and the shapes it may turn over, which is the whole table: every
   *  save owns all five squares (formation.ts) */
  const shapes = FO.FORMATION_IDS;
  sim.setTech(tech);

  // THE ROUTES, one per movement layer, and WHAT EACH IS WORTH: the share
  // of the script's health that walks, flies or drives amphibious. A
  // naval wave-1 of rissos is the water route's business, and a bot that
  // spread its opening board along an empty crawler corridor would lose
  // the map before learning that
  // the routes as walked (heatRoutes), falling back to the traced gradient
  // where the probe saw nothing on a layer the script sends later
  const heat = heatRoutes(PROBE_SECONDS);
  const ground = heat.ground.length ? heat.ground : routeCells(sim.field).map(([x, y]) => [x, y, 1]);
  const water = heat.water.length ? heat.water : routeCells(sim.navalField).map(([x, y]) => [x, y, 1]);
  const air = airCells(sim);
  // ...weighed over a WINDOW of the script — this wave and the next few —
  // because what matters to a placement is what is about to arrive, not
  // the boss that flies in on wave 50. Re-weighed every wave
  const LOOK = 8;
  const layerShare = (from) => {
    const share = { 0: 0, 1: 0, 2: 0 };
    const steps = spec.script.slice(Math.max(0, from - 1), from - 1 + LOOK);
    for (const step of steps.length ? steps : spec.script)
      for (const g of L.waveGroups(step.wave))
        g.counts.forEach((n, i) => {
          if (n <= 0) return;
          const st = L.UNIT_STATS[L.UNIT_KINDS[i]];
          share[st.flying ? 1 : st.naval ? 2 : 0] += LA.unitHpAtLevel(L.UNIT_KINDS[i], 0) * n;
        });
    const total = share[0] + share[1] + share[2] || 1;
    return { 0: share[0] / total, 1: share[1] / total, 2: share[2] / total };
  };
  const groundAll = [...ground, ...water];
  // a cell's own weight is how often the probe saw a body on it, scaled so
  // each layer's cells sum to one — the layer share then says how much
  // the layer matters right now
  const norm = (cells) => { let t = 0; for (const c of cells) t += c[2]; return cells.map(([x, y, h]) => [x, y, h / (t || 1)]); };
  const g2 = norm(ground.filter((_, i) => i % 2 === 0)), w2 = norm(water.filter((_, i) => i % 2 === 0));
  const a2 = norm(air.filter((_, i) => i % 2 === 0).map(([x, y]) => [x, y, 1]));
  const route = [
    ...g2.map(([x, y, h]) => ({ x, y, layer: 0, h })),
    ...a2.map(([x, y, h]) => ({ x, y, layer: 1, h })),
    ...w2.map(([x, y, h]) => ({ x, y, layer: 2, h })),
  ];
  const routeWeight = new Float32Array(route.length);
  let wet = false;
  const reweigh = (wave) => {
    const w = layerShare(wave);
    wet = w[2] >= 0.3;
    for (let i = 0; i < route.length; i++) routeWeight[i] = w[route[i].layer] * route[i].h * route.length;
  };
  reweigh(1);

  // every buildable cell within reach of a route, on a checkerboard so the
  // scoring loop stays cheap. Buildable is OPEN GROUND, shallows included —
  // never a hill, never the deep (Sim.canPlace holds the whole rule; the
  // drop zones and the base line it also refuses are struck off when a
  // placement bounces)
  const { blocked } = sim.terrain;
  const cands = [];
  for (let y = 0; y < ROWS; y++)
    for (let x = 0; x < COLS; x++) {
      const i = y * COLS + x;
      if (blocked[i] || (x + y) % 2) continue;
      let dg = 1e9, da = 1e9;
      for (const [rx, ry] of groundAll) { const d = Math.hypot(rx - x, ry - y); if (d < dg) dg = d; }
      for (const [rx, ry] of air) { const d = Math.hypot(rx - x, ry - y); if (d < da) da = d; }
      if (dg > 30 && da > 30) continue;
      cands.push({ x, y, dg, da });
    }

  const cover = new Float32Array(route.length);
  const occ = new Uint8Array(COLS * ROWS);
  const free = (x, y, sz) => {
    if (x + sz > COLS || y + sz > ROWS) return false;
    for (let yy = y; yy < y + sz; yy++)
      for (let xx = x; xx < x + sz; xx++) if (occ[yy * COLS + xx]) return false;
    return true;
  };
  const reachCache = new Map();
  const reach = (kind) => {
    const st = TOWERS[kind];
    const key = `${st.size}:${Math.round(st.range)}:${st.targetAir}${st.targetGround}`;
    if (reachCache.has(key)) return reachCache.get(key);
    const sz = st.size, r = st.range / CELL;
    const lists = cands.map((c) => {
      const okG = st.targetGround && c.dg <= r + 1, okA = st.targetAir && c.da <= r + 1;
      if (!okG && !okA) return null;
      const cx = c.x + sz / 2, cy = c.y + sz / 2;
      const idx = [];
      for (let i = 0; i < route.length; i++) {
        const q = route[i];
        if (q.layer === 1 ? !st.targetAir : !st.targetGround) continue;
        if (Math.hypot(q.x - cx, q.y - cy) <= r) idx.push(i);
      }
      return idx.length ? Int32Array.from(idx) : null;
    });
    reachCache.set(key, lists);
    return lists;
  };
  const place = (kind) => {
    const sz = TOWERS[kind].size;
    const lists = reach(kind);
    for (let guard = 0; guard < 50; guard++) {
      let best = -1, bs = -1;
      for (let ci = 0; ci < cands.length; ci++) {
        const l = lists[ci];
        if (!l) continue;
        const c = cands[ci];
        if (!free(c.x, c.y, sz)) continue;
        let s = 0;
        for (let j = 0; j < l.length; j++) s += routeWeight[l[j]] / (1 + cover[l[j]]);
        if (s <= 1e-6) continue;
        // a spot the Hydrophobic rule would drown fires at a fraction of
        // the rate, and is worth exactly that fraction
        if (sim.isWaterlogged(c.x, c.y, kind)) s *= MU.HYDROPHOBIC_RATE;
        if (s > bs) { bs = s; best = ci; }
      }
      if (best < 0) return false;
      const c = cands[best];
      // a spot the map refuses is struck off for this footprint rather
      // than retried forever
      if (!sim.canPlace(c.x, c.y, kind)) {
        lists[best] = null;
        continue;
      }
      sim.placeTower(c.x, c.y, kind);
      for (let yy = c.y; yy < c.y + sz; yy++)
        for (let xx = c.x; xx < c.x + sz; xx++) occ[yy * COLS + xx] = 1;
      for (const i of lists[best]) cover[i] += 1;
      return true;
    }
    return false;
  };

  const counts = () => {
    const out = {};
    for (const [k, n] of Object.entries(sim.towerCounts())) if (n > 0) out[k] = n;
    return out;
  };

  let rot = 0;
  const log = [];
  let lastWave = 0;
  const t0 = Date.now();
  while (!sim.lost() && !sim.won() && sim.time < MAX_SECONDS) {
    for (let s = 0; s < 30; s++) sim.update(1 / 60);
    const w = sim.currentWave();
    // THE DRAW POOL IS THE SAVE'S ROSTER (the track, track.ts), which is
    // the only pool the real game ever deals from — the narrowing modes
    // are experiments, and they make the deal cheaper as well as narrower
    // because the fee is a fraction of what the pool is worth. A pool with
    // nothing owned in it falls back to the duo every save starts with
    const plan = mixFor(stageTier(sim.stageWave()), wet, roster).filter((k) => owned.has(k));
    const pool = plan.length > 0 ? plan : ["duo"];
    let stuck = 0;
    for (let tries = 0; tries < 40; tries++) {
      if (sim.scrap < E.TURRET_ROLL_PRICE || sim.towers.length >= CAP) break;
      // the two rolls decide, exactly as they do for a player at the
      // button: which gun, and how many of it
      const kind = RA.rollTurret(pool);
      if (!kind) break;
      const shape = FO.rollFormation(shapes);
      if (!shape) break;
      const want = FO.formationCount(shape);
      // the fee is charged once the FIRST of them lands rather than at the
      // draw, which is the one place the bot is kinder to itself than the
      // game is: a player who cannot find ground for a card watches it
      // expire, and a bot that burned its bank failing to place would
      // report a wall that is the bot's and not the map's
      let put = 0;
      for (let i = 0; i < want && sim.towers.length < CAP; i++) if (place(kind)) put++;
      if (put > 0) { sim.spend(E.TURRET_ROLL_PRICE); rot++; }
      else { rot++; if (++stuck > pool.length) break; }
    }
    if (w !== lastWave) {
      lastWave = w;
      reweigh(w);
      if (w % LOG_EVERY === 0 || w === 1)
        log.push({
          wave: w, time: Math.round(sim.time), core: Math.round((100 * sim.core.hp) / sim.core.hpMax),
          scrap: Math.round(sim.scrap), towers: sim.towers.length, counts: counts(),
          cleared: sim.wavesCleared(),
        });
    }
  }
  const won = sim.won();
  return {
    world: `${world.id} ${world.name}`, mission: L.missionText(world).title, tier: TIER,
    mutators: [...(world.intrinsicMutation ?? []), ...MUTATORS], level: LEVEL,
    families: FAMILIES.length ? FAMILIES : null,
    scale: SCALE, start: E.SCRAP_START, unitDamage: WP.unitDamageScale(),
    outcome: won ? "WON" : sim.lost() ? "LOST" : "TIMEOUT",
    wave: sim.currentWave(), time: Math.round(sim.time), core: Math.round((100 * sim.core.hp) / sim.core.hpMax),
    kills: sim.kills, loopLevel: sim.loopLevel,
    // the objectives met and what they bank before the rung bonus: a win
    // is every wave, however the last one ended (grantRunReward)
    cleared: won ? sim.totalWaves : sim.wavesCleared(), waves: sim.totalWaves,
    xp: E.missionXp(won ? sim.totalWaves : sim.wavesCleared(), sim.totalWaves),
    towers: sim.towers.length, counts: counts(),
    scrapEarned: Math.round(sim.scrapEarned), scrapLeft: Math.round(sim.scrap),
    wall: Math.round((Date.now() - t0) / 1000), log,
  };
}

const r = play();
const mmss = (t) => `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
if (JSON_OUT) {
  console.log(JSON.stringify(r, null, 1));
} else {
  console.log(
    `${r.world} — ${r.mission} — rung ${r.tier + 1}${r.mutators.length ? ` [${r.mutators.join(", ")}]` : ""} — level ${r.level}` +
      `${r.scale !== 1 ? ` — prices x${r.scale}` : ""} — unit damage x${r.unitDamage}` +
      `${r.families ? ` — families ${r.families.join(", ")}` : ""}`,
  );
  console.log(
    `${r.outcome} at wave ${r.wave}, ${mmss(r.time)} in — core ${r.core}%, kills ${r.kills}, ${r.cleared}/${r.waves} waves cleared for ${r.xp} xp` +
      `${r.loopLevel ? `, tide +${r.loopLevel} levels` : ""} — ${r.towers} turrets, scrap earned ${r.scrapEarned} (${r.scrapLeft} unspent) — ${r.wall}s wall`,
  );
  console.log(`board: ${Object.entries(r.counts).map(([k, n]) => `${k} ${n}`).join(", ")}`);
  for (const l of r.log)
    console.log(
      `  w${String(l.wave).padStart(2)} ${mmss(l.time).padStart(5)}  core ${String(l.core).padStart(3)}%  cleared ${String(l.cleared).padStart(2)}  scrap ${String(l.scrap).padStart(6)}  turrets ${String(l.towers).padStart(4)}  ${Object.entries(l.counts).map(([k, n]) => `${k} ${n}`).join(", ")}`,
    );
}
process.exit(r.outcome === "WON" ? 0 : 2);
