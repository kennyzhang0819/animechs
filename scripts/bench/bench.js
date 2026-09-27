/**
 * THE BENCH, PAGE SIDE (scripts/bench.mjs drives it).
 *
 * Stands the perf suite's boards in a real Game and hands frames back:
 *
 *   window.__bench.scene(name)                 build one scene, fresh Game
 *   window.__bench.measure(zoom, frames, warm) the next `frames` frames at
 *                                              that zoom, raw (Game.sampleFrames)
 *   window.__bench.zoomRange()                 the camera's floor and ceiling
 *   window.__bench.census()                    the sim's own head count
 *
 * EVERY SCENE IS A FRESH GAME. Game.reset() would do, but a scene is a
 * question about ONE board, and the cheapest way to be sure nothing of the
 * last one is still standing — a bench override, a wave the script was
 * mid-way through sending — is to tear the level down and build it again.
 * The sheet is packed once for the lines a scene sends (Game.create), so the
 * second and later builds cost the world and not the sprites.
 *
 * THE BOARD IS STOOD THROUGH THE HOST (Game.benchHost), never the sim: on
 * the shipping path the sim is on a worker and this thread cannot touch
 * it, so the three bench commands live on the seam (simhost.ts) and the
 * headless check uses the same three (scripts/check.mjs) — the two halves
 * build the identical board from the identical code.
 */
import { Game } from "/game/game.js";
import { WORLDS, UNIT_KINDS, UNIT_STATS, loadLevelDocs, WAVE_GAP_OPENING, WAVE_RELEASE_SECONDS } from "/game/levels.js";
import { loadOfficialMaps } from "/game/maps.js";
import { specForTier, RUNG_COUNT } from "/game/ladder.js";
import { techStateFor } from "/game/track.js";
import { FIELDED_KINDS } from "/game/types.js";
import { ALL_UPGRADES, TURRET_UPGRADES } from "/game/upgrades.js";
import { rollMod } from "/game/mods.js";
import { rollRelic } from "/game/relics.js";

const q = new URLSearchParams(location.search);
/** bodies and turrets a scene stands — the goal is ten thousand of each */
const N = Number(q.get("n") ?? 10000);
/** the world the boards stand on; the runner passes the roomiest */
const WORLD_ID = q.get("world");
/** random upgrade nodes the `upgrades` scene switches on */
const UPGRADES = Number(q.get("upgrades") ?? 100);
/** modules bought in the same scene — the M and G buttons, pressed */
const BUYS = 150;
/** a pool no shot on the board can empty */
const IMMORTAL = 1e12;
/** a reach no cell on the board is outside of — the sim clamps it to the
 *  map's diagonal (setBench), so any big number is that */
const EVERYWHERE = 1e9;

const log = (s) => {
  document.getElementById("log").textContent = s;
  console.log(`[bench] ${s}`);
};

/** the most a frame may take before the sample is declared dead — a
 *  software GPU takes seconds; a compositor that has stopped takes forever */
const FRAME_DEADLINE_MS = 20_000;
/**
 * `n` frames off the Game, or a failure when they stop coming. A run whose
 * frames stalled used to sit until the runner's timeout — which on a
 * stuck GPU process it never reached — and read as a hang rather than as
 * the fact it is: the page stopped drawing, and the number cannot be had.
 */
const frames = (g, n, what) =>
  Promise.race([
    g.sampleFrames(n),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${what}: ${n} frames did not land in ${(n * FRAME_DEADLINE_MS) / 1000}s — the page stopped drawing`)), n * FRAME_DEADLINE_MS),
    ),
  ]);

// A SEEDED PAGE. The board is rolled with Math.random (which cell, which
// kind), and two runs of one scene must roll the same board or the numbers
// cannot be compared — mulberry32 over Math.random itself, as the checks
// do. The sim's own dice are on the worker and stay the worker's.
let rand = 11;
Math.random = () => {
  rand = (rand + 0x6d2b79f5) >>> 0;
  let t = rand;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const reseed = (seed) => { rand = seed >>> 0; };

// the documents first: WORLDS ship with empty scripts and the level docs
// fill them in place (levels.ts), so a spec taken before they land has no
// waves in it — Game.create loads them too, but the `waves` scene builds
// its spec before that
await Promise.all([loadLevelDocs(), loadOfficialMaps()]);
const world = WORLDS.find((w) => w.id === WORLD_ID) ?? WORLDS[0];
/** the top of the ladder: the most the script ever sends, and the deepest health curve */
const late = () => specForTier(world, RUNG_COUNT - 1);
/** when wave n (1-based) of `spec` starts entering — Sim.waveStartTime, on the spec alone */
const waveStartTime = (spec, n) =>
  Math.min(WAVE_GAP_OPENING, Math.max(0, spec.waveGap)) +
  (Math.max(1, n) - 1) * Math.max(1, spec.waveGap + WAVE_RELEASE_SECONDS);
/** ...and the same world with nothing to send: the board alone */
const still = () => ({ ...late(), script: [] });

let game = null;
const gl = document.getElementById("gl"), ui = document.getElementById("ui"), mm = document.getElementById("mm");

/** a fresh Game on `spec`, the last one torn down; the sim's phase clock
 *  armed so census() can read the head count off the worker's report */
async function fresh(spec) {
  if (game) { game.destroy(); game = null; }
  game = await Game.create(gl, ui, spec, (step) => log(`loading: ${step}`));
  game.attachMinimap(mm);
  game.benchHost().profile(true);
  return game;
}

/**
 * `ms` of wall time pass and then one frame lands — the sim on its worker
 * has stepped that long meanwhile (simclock.ts), so the board it built is
 * standing and shooting before anything is read. By the clock and not by
 * frames, because a frame on a software GPU is seconds long and the sim
 * does not wait for it
 */
const settle = async (g, ms) => {
  await new Promise((r) => setTimeout(r, ms));
  await frames(g, 1, "settle");
};

/** the T1-5 roster, evenly — `n` bodies, kinds dealt round-robin, one
 *  spawnMany a kind rather than one a body (each is a message to the worker) */
function spawnMixed(h, n, opts) {
  const pool = UNIT_KINDS.filter((k) => k !== "boss");
  const each = Math.floor(n / pool.length);
  for (const k of pool) h.spawnMany(k, each, opts);
  h.spawnMany(pool[0], n - each * pool.length, opts);
  h.spawnMany("boss", 1, opts);
}

/** a full save with `count` random upgrade nodes switched on — the tree
 *  as a run might have grown it, rather than every rung at once */
function randomUpgrades(count) {
  const tech = techStateFor(60);
  const on = new Set();
  const pool = ALL_UPGRADES.slice();
  for (let i = 0; i < count && pool.length > 0; i++) on.add(pool.splice((Math.random() * pool.length) | 0, 1)[0].id);
  const upgrades = {};
  for (const k of Object.keys(TURRET_UPGRADES)) upgrades[k] = TURRET_UPGRADES[k].map((u) => (on.has(u.id) ? 1 : 0));
  return { ...tech, upgrades };
}

const SCENES = {
  /** the board alone: N turrets of every fielded kind, nothing to shoot */
  turrets: async () => {
    const g = await fresh(still());
    const h = g.benchHost();
    h.setTech(techStateFor(60));
    h.scatterTowers(FIELDED_KINDS, N);
    await settle(g, 500);
  },
  /** the swarm alone: N bodies of every tier, every one of them reaching the
   *  core from wherever it stands, the core never falling */
  enemies: async () => {
    const g = await fresh(still());
    const h = g.benchHost();
    h.setBench({ unitRange: EVERYWHERE, coreHp: IMMORTAL });
    spawnMixed(h, N, { scatter: true, hp: IMMORTAL });
    await settle(g, 1000);
  },
  /** both, at war: most of a late board and the whole swarm, every gun on
   *  both sides in reach of something — the swarm cannot die (so the field
   *  stays full), the turrets can (so the death path is on the frame) */
  battle: async () => {
    const g = await fresh(still());
    const h = g.benchHost();
    h.setTech(techStateFor(60));
    h.scatterTowers(FIELDED_KINDS, Math.round(N * 0.8));
    h.setBench({ towerRange: EVERYWHERE, unitRange: EVERYWHERE, coreHp: IMMORTAL });
    spawnMixed(h, N, { scatter: true, hp: IMMORTAL });
    await settle(g, 1000);
  },
  /** the same war under a hundred random upgrade nodes and a run's worth of modules */
  upgrades: async () => {
    const g = await fresh(still());
    const h = g.benchHost();
    h.setTech(randomUpgrades(UPGRADES));
    h.setRich(true);
    for (let i = 0; i < BUYS; i++) {
      const relic = i % 4 === 3 ? rollRelic(new Set()) : null;
      if (relic) h.takeRelic(relic);
      else { const id = rollMod(); if (id) h.takeMod(id); }
    }
    h.scatterTowers(FIELDED_KINDS, Math.round(N * 0.8));
    h.setBench({ towerRange: EVERYWHERE, unitRange: EVERYWHERE, coreHp: IMMORTAL });
    spawnMixed(h, N, { scatter: true, hp: IMMORTAL });
    await settle(g, 1000);
  },
  /** the game's own late waves on a built board, ranges as shipped —
   *  the picture a player actually looks at, rather than a worst case */
  waves: async () => {
    const g = await fresh(late());
    const h = g.benchHost();
    h.setTech(techStateFor(60));
    h.scatterTowers(FIELDED_KINDS, Math.round(N * 0.6));
    h.setBench({ coreHp: IMMORTAL });
    // the run is a clock, not a wave cursor (Sim.skipToTime), so the wave
    // wanted is turned into its start time the way the sim does
    // (Sim.waveStartTime): the opening gap, then one cadence a wave
    h.skipToTime(waveStartTime(late(), Math.max(1, late().script.length - 4)));
    await settle(g, 3000);
  },
};

/** what each scene must have stood before its frames mean anything */
const SCENE_WANTS = {
  turrets: { towers: true },
  enemies: { bodies: true },
  battle: { bodies: true, towers: true },
  upgrades: { bodies: true, towers: true },
  waves: { bodies: true, towers: true },
};

window.__bench = {
  ready: true,
  scenes: Object.keys(SCENES),
  /** `n` frames of an empty world, to learn how long a frame is here */
  async probe(n) {
    const g = await fresh(still());
    return frames(g, n, "probe");
  },
  async scene(name) {
    reseed(11);
    log(`scene: ${name}`);
    await SCENES[name]();
    const c = this.census();
    log(`${name}: ${JSON.stringify(c)}`);
    // A SCENE THAT DID NOT STAND IS NOT A NUMBER. A board the worker never
    // built (a command that threw on its thread, a sim that never ran)
    // would otherwise read as a fast, empty frame — and pass
    const want = SCENE_WANTS[name];
    if (want.bodies && c.bodies === 0) throw new Error(`${name}: no body stood — the sim never took the spawn`);
    if (want.towers && c.towers === 0) throw new Error(`${name}: no turret stood — the sim never took the board`);
    if (c.simStep < 0) throw new Error(`${name}: the sim reported no clock — it is not stepping`);
    return c;
  },
  async measure(zoom, n, warm) {
    game.setCamera(zoom);
    await frames(game, warm, `warm at zoom ${zoom.toFixed(2)}`);
    const s = await frames(game, n, `sample at zoom ${zoom.toFixed(2)}`);
    return { zoom: game.stats().zoom, ...s, ...this.census() };
  },
  zoomRange: () => game.zoomRange(),
  /** bodies, turrets and what is in flight, off the sim's own clock */
  census() {
    const p = game.profileFull();
    const c = p?.census;
    return {
      bodies: game.stats().units,
      towers: game.layout().length,
      shots: c ? c.shots + c.hostileShots : -1,
      fx: c ? c.fx : -1,
      simStep: p ? p.ms : -1,
      // the last frame's quads by source, so a slow zoom says what filled it
      quads: (() => {
        const q = game.drawTally();
        // the five effect kinds that drew the most quads, as [kind id, quads]
        const top = [...q.fxKinds].map((v, k) => [k, v]).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 5);
        return { ...q, fxKinds: undefined, fxTop: top };
      })(),
    };
  },
};
log(`ready: world ${world.name}, n ${N}`);
