#!/usr/bin/env node
/**
 * THE CHECK: everything that would make the game BREAK, and nothing that
 * takes a judgment call — in two sizes.
 *
 *   npm run check          quick: does it compile, does it run, does it crash
 *   npm run check:full     ...and the two clocks: does the board a run can
 *                          afford still fit the frame against the script's
 *                          late waves, and does it still draw
 *   npm run check:full -- --only battle
 *                          one clock (battle, render)
 *
 * QUICK is the one an agent runs after every edit. It is a CRASH GATE, not
 * a balance gate: every check in it has a right answer that needs no
 * knowledge of what the game is supposed to feel like, it never times
 * anything, and it is over in seconds.
 *
 * FULL is the same plus the clocks, which have to run the game at load to
 * learn anything. Run it before a change to the sim is called done, and any
 * time something "feels slow": it reproduces the board that lagged, and it
 * fails with the phase table that says why.
 *
 * What it asks:
 *
 *   types    tsc --noEmit over the whole tree — the broadest net there is,
 *            and the one that catches a renamed key before anything else
 *   art      every Foundry head the code names has a drawing behind it,
 *            which is the trap a turret rename walks into
 *   docs     every level and map document on disk parses and applies
 *   worlds   the PLAYABLE boards are finishable — core, spawn tiles and a
 *            mission the sim can meet — and the shelved ones at least
 *            construct (PLAYABLE_WORLD_IDS in game/levels.ts)
 *   sim      thirty sim-seconds of world 1 with turrets on the spawn —
 *            bodies spawn, walk, get shot and die, and nothing goes NaN
 *
 * ...and with --full:
 *
 *   battle   the board a run's income has bought by the late waves —
 *            each stage's scrap spent on its own tier at the mean price
 *            (ladder.ts stageAudit), the four tiers mixed along the route,
 *            every fielded kind in its share — against the script's own
 *            late waves, T1 to T5 mixed: does one sim step still fit its
 *            share of a 60fps frame. A board of one kind and a board that
 *            fills the map are both boards nobody plays, so neither is
 *            timed any more; the old clocks for them are in git history
 *   render   the other half of the frame, which nothing above can time:
 *            the bench's two mixed boards (scripts/bench.mjs battle and
 *            waves) stood in a real Game in a headless browser and the
 *            DRAW read at a ladder of zooms, against DRAW_GOAL_MS
 *
 * WHAT IT DELIBERATELY DOES NOT DO IS PLAY THE GAME. It never reports a
 * wave reached or a core percentage, because those are numbers somebody
 * has to weigh and an agent cannot. Balance and correctness are checked by
 * hand, by the person who owns the design — see the note in README.md.
 * `npm run playtest` is that person's tool, it takes tens of minutes, and
 * it is not part of this and should not be run to satisfy it.
 *
 * The game modules are transpiled to .playtest/check with tsc, and ONLY
 * WHEN A SOURCE IS NEWER than the last transpile — the common case is a
 * warm one where this costs nothing. The directory is its own rather than
 * the playtest's because the two routinely run at the same time from
 * different sessions, and a half-written dist is a mystery failure.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
/** --full: the clocks as well (see the header) */
const FULL = process.argv.includes("--full");
/** --only battle,render: just those clocks, for iterating on one —
 *  the quick checks always run, they are the crash gate and they are cheap */
const argAfter = (name) => {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null;
};
const ONLY = (() => {
  const v = argAfter("--only");
  return v ? new Set(v.split(",")) : null;
})();
/** --kinds a,b: the isolated clocks (turrets, enemies) over these kinds only */
/** --n <count>: how many of one thing the standard stands — ten thousand is
 *  the goal; smaller is for iterating on a clock, never for passing one */
const N = Number(argAfter("--n") ?? 10000);
const wants = (name) => FULL && (!ONLY || ONLY.has(name));
const DIST = path.join(ROOT, ".playtest", "check");
const require = createRequire(import.meta.url);
const t0 = Date.now();

// ---------- the report ----------

const results = [];
let failed = false;
/** record a check: `detail` prints either way, a non-empty `problems` fails it */
const report = (name, problems, detail = "") => {
  if (problems.length > 0) failed = true;
  results.push({ name, bad: problems.length > 0, detail, problems });
};
/** things worth telling an author that are NOT failures — a map still
 *  being painted is not a broken map */
const notes = [];

// ---------- stage one: the two compiles, side by side ----------

const run = (cmd, args) =>
  new Promise((done) => {
    const p = spawn(cmd, args, { cwd: ROOT, shell: process.platform === "win32" });
    let out = "", err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("close", (code) => done({ code, out, err }));
    p.on("error", (e) => done({ code: 1, out, err: String(e) }));
  });

// npx is a .cmd shim on Windows, which spawn cannot run without a shell
const npx = process.platform === "win32" ? "npx.cmd" : "npx";

/** the newest mtime under game/, against which the last transpile is stale */
const newestSource = () => {
  let newest = 0;
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const f = path.join(dir, e.name);
      if (e.isDirectory()) walk(f);
      else if (e.name.endsWith(".ts")) newest = Math.max(newest, statSync(f).mtimeMs);
    }
  };
  walk(path.join(ROOT, "game"));
  return newest;
};

const built = path.join(DIST, "sim.js");
const stale = !existsSync(built) || newestSource() > statSync(built).mtimeMs;
if (stale) mkdirSync(DIST, { recursive: true });

// THE TWO COMPILES RUN TOGETHER. They are separate tsc processes reading
// the same sources and writing nowhere in common — the typecheck emits
// nothing at all — so the wall cost of both is the cost of the slower one.
const typesJob = run(npx, ["tsc", "--noEmit"]);
const transpileJob = stale
  ? run(npx, [
      "tsc",
      // the entry points; everything else the checks touch is pulled in
      // behind these through their own imports
      "game/sim.ts", "game/ladder.ts", "game/track.ts", "game/foundryArt.ts", "game/atlas.ts", "game/mapgen.ts",
      "--outDir", DIST, "--module", "commonjs", "--target", "es2022",
      "--moduleResolution", "node", "--esModuleInterop", "--skipLibCheck",
      // the transpile is for RUNNING the sim, not for judging it: the
      // typecheck above is what judges it, and emitting through an error
      // means one broken signature does not also cost us the sim check
      "--noEmitOnError", "false", "--resolveJsonModule",
    ])
  : Promise.resolve({ code: 0, out: "", err: "" });

const [types, transpile] = await Promise.all([typesJob, transpileJob]);
const tCompile = Date.now() - t0;

// ---------- out ----------

function print() {
  const wall = ((Date.now() - t0) / 1000).toFixed(1);
  for (const r of results) {
    console.log(`${r.bad ? "FAIL" : "ok  "} ${r.name.padEnd(7)} ${r.detail}`);
    for (const p of r.problems.slice(0, 12)) console.log(`       ${p}`);
    if (r.problems.length > 12) console.log(`       ...and ${r.problems.length - 12} more`);
  }
  for (const n of notes) console.log(`note   ${n}`);
  console.log(
    `\n${failed ? "BROKEN" : "clean"} in ${wall}s` +
      `${stale ? "" : " (transpile cached)"} — compile ${(tCompile / 1000).toFixed(1)}s`,
  );
  if (!FULL)
    console.log("quick: compiles and runs. `npm run check:full` adds the clocks (a minute or two).");
  if (!failed)
    console.log("Balance and play are checked by hand. Do not run npm run playtest to satisfy this.");
}

// tsc prints its diagnostics on stdout
const typeErrors = (types.out + types.err).split("\n").filter((l) => /error TS\d+/.test(l));
report("types", typeErrors, `tsc --noEmit, ${typeErrors.length} error${typeErrors.length === 1 ? "" : "s"}`);

if (!existsSync(built)) {
  report("sim", [(transpile.out + transpile.err).trim() || "tsc emitted no sim.js"], "transpile failed");
  print();
  process.exit(1);
}

// ---------- the modules ----------

// A SEEDED RUN, ALWAYS. The sim rolls its dice off Math.random directly
// (targeting jitter, inaccuracy, spawn spread), so an unseeded check is a
// different thirty seconds every time — and a gate that is a coin flip is
// worse than no gate. mulberry32 over Math.random itself, installed before
// a module loads, exactly as the playtest does it for the same reason. The
// seed is arbitrary and fixed: change it and the numbers below move.
let rand = 7;
/**
 * PUT THE DICE BACK. Every check that rolls any opens with its own call,
 * so a draw taken by one can never move another: without it, adding a
 * single `Math.random()` to the sim check would silently re-roll the whole
 * enemy mix the battle check below is timed against.
 */
const reseed = (seed) => { rand = seed >>> 0; };
Math.random = () => {
  rand = (rand + 0x6d2b79f5) >>> 0;
  let t = rand;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const R = (m) => require(path.join(DIST, m));
const L = R("levels.js"), M = R("maps.js"), LA = R("ladder.js"), C = R("constants.js");
const TR = R("track.js"), FA = R("foundryArt.js"), T = R("types.js"), MK = R("missionMarks.js");
const SR = R("simreport.js"), EC = R("economy.js");
/** the most turrets the battle check will stand up. Every world we ship runs
 *  out of legal ground long before this, so it is a stop against a future
 *  map that does not, never a target. */
const MAX_BOARD = 4000;
const { Sim } = R("sim.js");
const pub = (...p) => path.join(ROOT, "public", ...p);
const { COLS, ROWS, CELL } = C;

/**
 * THE ROAD FROM A CELL TO THE CORE, cell by cell down the flow field's
 * gradient — the line the swarm walks, which is also the line a player
 * builds along. Both checks below want it and neither can guess it: the
 * map decides where the route runs, and `canPlace` decides how much of it
 * will take a turret.
 *
 * It stops at the goal, at a dead end, or on a cell it has already stood
 * on, so a field with a flat patch in it ends the walk instead of looping.
 */
const roadToCore = (sim, from) => {
  const route = [];
  const seen = new Set();
  let cur = from;
  for (let n = 0; n < COLS * ROWS; n++) {
    if (seen.has(cur)) break;
    seen.add(cur);
    route.push(cur);
    if (sim.field.isGoal[cur]) break;
    const x = cur % COLS, y = (cur / COLS) | 0;
    let best = cur, bd = sim.field.dist[cur];
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
        const ni = ny * COLS + nx;
        if (sim.field.walk[ni]) continue;
        if (sim.field.dist[ni] < bd) { bd = sim.field.dist[ni]; best = ni; }
      }
    if (best === cur) break;
    cur = best;
  }
  return route;
};

// ---------- art: a head the code names with no drawing behind it ----------

// docs/turret-concepts/ is the SOURCE (scripts/sync-foundry-art.mjs copies
// it into public/foundry before every dev server and every build), so that
// is what is checked: a public/foundry that is merely stale fixes itself
// on the next run, a missing drawing does not. A URL here is
// `/foundry/<name>.png` and the drawing behind it is `mill-<name>.png` —
// except the plates, which ship under their own name.
const SHEET = path.join(ROOT, "docs", "turret-concepts");
const drawingFor = (url) => {
  const name = path.basename(url);
  return path.join(SHEET, name.startsWith("base-") ? name : `mill-${name}`);
};
const artWanted = [
  ...Object.entries(FA.FOUNDRY_HEAD_URLS),
  ["core", FA.FOUNDRY_CORE_URL],
  ...FA.FOUNDRY_BASE_URLS.map((url, i) => [`base-${FA.FOUNDRY_BASE_SIZES[i]}`, url]),
];
const artMissing = artWanted
  .filter(([, url]) => !existsSync(drawingFor(url)))
  .map(([what, url]) => `${what}: ${url} has no ${path.relative(ROOT, drawingFor(url)).replace(/\\/g, "/")}`);
report("art", artMissing, `${artWanted.length} drawings`);

// ---------- cells: a body whose TEAM CELL is empty takes the game down ----------

// Every drawn body hands the packer a team cell as well as a drawing: the
// mask of every pixel laid in the family's accent, which the sheet tints
// and lays back over the body (packTeamCells). A body that wears none of
// its family's colour produces an empty mask, and the packer throws — "the
// grapnel1 team cell has no pixels in it" — WHILE A LEVEL IS LOADING,
// which is as late as a failure can be found and the one place none of the
// other stages look. The mask's bounds also size the team cell the atlas
// stage below packs.
//
// The rule is one line and it belongs on this side of that: a tier that
// wears no accent is a tier that cannot ship. The runt is the one that
// gets caught, every time — it is the tier whose ornament is cut last.
const cellFamilies = (() => {
  const IA = R("ironhideArt.js"), FAM = R("familyArt.js"), TA = R("tuskerArt.js"), SA = R("grapnelArt.js");
  const KA = R("kingArt.js"), KE = R("kettleArt.js"), PY = R("pylonArt.js"), WA = R("wardenArt.js");
  const FB = R("fabricatorArt.js"), ST = R("whaleArt.js"), RK = R("ratkingArt.js");
  // a ground family's tier is a mech tier or a legged one; the Grapnels
  // ride the mech rig at every tier with no stride at all, so the rig is
  // named per family rather than read off the stride
  const ground = (mech, legged) => (T) => (T.stride > 0 ? mech(T) : legged(T));
  return [
    ["ironhide", IA.IRON_TIERS, ground(IA.ironMech, IA.ironLegged)],
    ["starhart", FAM.HART_TIERS, ground(FAM.hartMech, FAM.hartLegged)],
    ["dartback", FAM.FROG_TIERS, ground(FAM.frogMech, FAM.frogLegged)],
    ["tusker", TA.TUSK_TIERS, ground(TA.tuskMech, TA.tuskLegged)],
    ["grapnel", SA.GRAPNEL_TIERS, SA.grapnelMech],
    ["stoop", FAM.STOOP_TIERS, FAM.stoop],
    ["skate", FAM.MANTA_TIERS, FAM.manta],
    ["livewire", FAM.NARWHAL_TIERS, FAM.narwhal],
    ["kettle", KE.KETTLE_TIERS, KE.kettle],
    ["whale", ST.WHALE_TIERS, ST.whale],
    ["ratking", RK.RATKING_TIERS, RK.ratkingMech],
    // the boss is not a family and has exactly one tier, but its cell is
    // packed and refused the same way every other body's is
    ["king", [KA.KING_TIER], () => KA.king()],
    // ...and the two buff towers, on the same terms: no family, one tier
    // each, and a cell the atlas refuses at load if it is empty
    ["goad", [PY.GOAD_TIER], PY.goadMech],
    ["bastion", [PY.BASTION_TIER], PY.bastionMech],
    // ...and the two fabricators
    ["fabricator", FB.FABRICATOR_TIERS, FB.fabricatorMech],
    // ...and the siege's five, all on the rig and all refused at load if
    // the crux they wear comes out empty
    ["railgun", [WA.RAZE_TIER], WA.razeMech],
    ["lance", [WA.LANCE_TIER], WA.lanceMech],
    ["bulwark", [WA.BULWARK_TIER], WA.bulwarkMech],
    ["halberd", [WA.HALBERD_TIER], WA.halberdMech],
    ["juggernaut", [WA.JUGGERNAUT_TIER], WA.juggernautMech],
  ];
})();
const cellProblems = [];
let bodiesChecked = 0;
/** each team cell's crop, for the atlas stage: the accent's bounds plus
 *  the pixel the antialias pass can spread it by on every side */
const cellBounds = [];
for (const [family, tiers, art] of cellFamilies)
  for (const T of tiers) {
    bodiesChecked++;
    const cell = art(T).cell;
    const n = cell.n;
    let x0 = n, y0 = n, x1 = -1, y1 = -1;
    for (let i = 0; i < cell.px.length; i++) {
      if (cell.px[i] === null) continue;
      const x = i % n, y = (i / n) | 0;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
    if (x1 < 0)
      cellProblems.push(`${family}${T.t}: its team cell has no pixels — it wears none of its family's accent, and the atlas refuses that at level load`);
    else cellBounds.push({ kind: `${family}${T.t}`, w: x1 - x0 + 3, h: y1 - y0 + 3 });
  }
report("cells", cellProblems, `${bodiesChecked} team cells`);

// ---------- atlas: the whole sheet packs ----------

// Importing game/atlas.ts runs the packer over every cell declared at
// module scope. The team cells are the exception — they are cut to art
// at pack time, in the browser — so the cells stage above measured each
// one's bounds and they are reserved here at that worst case, in the same
// order the pack pass takes. The packer fails on SHAPE, not area, so the
// only gate that means anything is reserving every cell and seeing the
// last one land; the percentage is the trend to watch between runs.
const atlasProblems = [];
let atlasDetail = "";
try {
  const A = R("atlas.js");
  const fixed = A.atlasFill();
  let packed = 0;
  for (const c of cellBounds) {
    try {
      A.reserveTeamCellBound(c.kind, c.w, c.h);
      packed++;
    } catch (e) {
      atlasProblems.push(`the ${c.kind} team cell does not fit: ${e.message.split("\n")[0]}`);
      break;
    }
  }
  const fill = A.atlasFill();
  const room = A.atlasLargestFree();
  atlasDetail =
    `${fixed.cells} static cells at ${fixed.pct}%, ${packed} team cells at their worst case on top: ` +
    `${fill.pct}% of ${A.ATLAS_SIZE[0]}x${A.ATLAS_SIZE[1]}, biggest free rect ${room.w}x${room.h}`;
  if (fill.pct > 85) notes.push(`the sheet is ${fill.pct}% full; the next family may not pack (game/atlas.ts, ATLAS_W is at its 4096 ceiling)`);
} catch (e) {
  atlasProblems.push(`game/atlas.ts did not import: ${e.message}`);
}
report("atlas", atlasProblems, atlasDetail);

// ---------- docs: the JSON on disk, which nothing typechecks ----------

const docProblems = [];
let docCount = 0;
try {
  for (const id of JSON.parse(readFileSync(pub("levels", "index.json"), "utf8"))) {
    const f = pub("levels", `${id}.json`);
    if (!existsSync(f)) { docProblems.push(`levels/index.json names ${id}, which is not on disk`); continue; }
    L.applyLevelDoc({ ...JSON.parse(readFileSync(f, "utf8")), id });
    docCount++;
  }
} catch (e) {
  docProblems.push(`level documents: ${e.message}`);
}
for (const id of M.OFFICIAL_MAP_IDS) {
  const f = pub("maps", `${id}.json`);
  if (!existsSync(f)) { docProblems.push(`OFFICIAL_MAP_IDS names ${id}, which is not on disk`); continue; }
  try {
    M.OFFICIAL_MAPS.push(JSON.parse(readFileSync(f, "utf8")));
    docCount++;
  } catch (e) {
    docProblems.push(`maps/${id}.json: ${e.message}`);
  }
}
report("docs", docProblems, `${docCount} documents`);

// ---------- mapgen: a random board draws, passes its own checks, and is the swarm world's ----------

// The map a run plays is generated at start (game/mapgen.ts); one fixed
// seed here stands in for it, so the worlds check below constructs the
// swarm world on a real board and the generator's own rules are exercised
const MG = R("mapgen.js");
const genProblems = [];
let genDetail = "";
try {
  const t0 = Date.now();
  const gen = MG.generateRandomMap(0x5eed);
  M.setGeneratedMap(gen.doc);
  genDetail = `"${gen.doc.name}" from seed ${gen.seed.toString(16)} in ${Date.now() - t0}ms, ${gen.tries} ${gen.tries === 1 ? "try" : "tries"}`;
} catch (e) {
  genProblems.push(e.message.split("\n")[0]);
}
report("mapgen", genProblems, genDetail);

// ---------- worlds: every PLAYABLE one boots, and can be finished ----------

/**
 * ONLY THE BOARDS THAT ARE IN THE GAME (levels.ts PLAYABLE_WORLD_IDS).
 *
 * It used to be all seventeen, which was the wrong bar in both directions.
 * All but two are SHELVED — terrain that is drawn and has no reason to be
 * played yet — and holding unfinished work to the standard finished
 * work is held to means one of two things happens: either the shelf gets
 * hacked up to pass a gate nobody is playing it against, or the gate gets
 * loosened until it stops catching anything on the boards that ARE
 * shipped. Neither is a check. A shelved board is allowed to be broken;
 * that is what shelving it says.
 *
 * WHAT THE PLAYABLE ONES ARE HELD TO is everything a run needs to reach
 * its own end:
 *
 *   a core        — the stake. No core, no run to lose.
 *   spawn tiles   — a door for the swarm. Sim.reset throws with none at
 *                   all; this also catches the subtler case of tiles that
 *                   exist and reach nothing, which spawns nobody and reads
 *                   as a stalled scheduler.
 *   an objective  — a mission the sim can actually MEET (levels.ts
 *                   Mission). The waves are not the objective any more
 *                   (see the tide, Sim.loadStep): a script that runs
 *                   forever means a map whose mission is unreachable is a
 *                   map that can only ever be lost, and nothing else in
 *                   the game would say so.
 *
 * The shelf is still CONSTRUCTED, because a board that throws on load is a
 * crash whatever it is for — it just is not asked to be finishable.
 */
const worldProblems = [];
const shelfProblems = [];
for (const w of L.WORLDS) {
  const playable = !L.worldHidden(w.id);
  const into = playable ? worldProblems : shelfProblems;
  const say = (msg) => into.push(`${w.id} ${w.name}: ${msg}`);
  let sim;
  try {
    sim = new Sim(LA.specForTier(w, 0));
  } catch (e) {
    say(e.message);
    continue;
  }
  if (!sim.core) say("no core");
  else if (!(sim.core.hp > 0)) say(`core at ${sim.core.hp}`);
  if (!playable) continue;

  // the doors: painted tiles, and tiles that actually reach the core
  let painted = 0;
  for (const c of sim.terrain.spawn) painted += c;
  if (painted === 0) say("no spawn tiles painted — the swarm has no door");
  const reach =
    sim.field.spawnPts.length + sim.navalField.spawnPts.length + sim.airRoutes().length;
  if (painted > 0 && reach === 0)
    say(`${painted} spawn tiles and not one of them reaches an exit`);

  // ...and the objective. Every mission answers "what would winning be",
  // and a mission whose answer is zero is a map with no way out
  const m = w.mission;
  if (m.kind === "hold") {
    const target = L.missionTarget(m, sim.scriptWaves);
    if (!(target > 0))
      say("a hold mission with no waves to hold — the script is empty and it names no count");
    else if (m.waves == null && target !== sim.scriptWaves)
      say(`hold target ${target} does not match the script's ${sim.scriptWaves} waves`);
  } else if (m.kind === "survive") {
    if (!(m.minutes > 0)) say(`a survive mission of ${m.minutes} minutes`);
  } else if (m.kind === "intercept") {
    // the roads are the mission's geometry and live with the terrain
    // (game/missions.ts) — Sim.reset has already thrown if the pattern
    // names one the map does not carry, so what is left is the arithmetic
    if (!(m.kills > 0)) say(`an intercept mission asking for ${m.kills} kills`);
    const sent = m.pattern.reduce((n, launch) => n + launch.length, 0);
    if (sent < m.kills)
      say(`the pattern sends ${sent} crossers and the mission asks for ${m.kills}`);
    if (m.leaks > 0 && m.spare.length === 0)
      say(`${m.leaks} leaks allowed and no spare launch to make them back`);
    // ...and the PYLON SCHEDULE against the ground the map has for it
    // (game/missionMarks.ts BUFF_TOWER). The towers are rolled into free
    // spots now, so the thing to check is supply: a row asking for more
    // than the map can hold puts fewer down and says nothing at runtime
    const lastTrain = m.pattern.length + (m.spare.length > 0 ? 1 : 0);
    const towerKind = MK.markKind("buffTower");
    const spots = sim.terrain.marks.filter((mk) => mk.kind === "buffTower");
    if (m.pylons.length < lastTrain)
      say(`the pylon table has ${m.pylons.length} rows and the pattern launches ${lastTrain}`);
    const wanted = m.pylons
      .slice(0, lastTrain)
      .reduce((n, r) => n + r.goad + r.bastion, 0);
    if (wanted > spots.length)
      notes.push(
        `${w.id} ${w.name}: the pylon table asks for ${wanted} towers and the map draws ` +
          `${spots.length} spots — the late trains come in under fewer than the table says`,
      );
    for (const mk of spots) {
      // a tower dropped in rock is a tower nothing can see to shoot
      // (Sim.canSee) — and unlike a raze section it is never walked clear
      const size = towerKind.size;
      let rock = 0;
      for (let y = mk.y; y < mk.y + size; y++)
        for (let x = mk.x; x < mk.x + size; x++)
          if (sim.terrain.blocked[y * COLS + x]) rock++;
      if (rock > 0) say(`a buff tower spot at ${mk.x},${mk.y} stands on ${rock} cells of rock`);
    }
  } else if (m.kind === "escort") {
    // the same shape of arithmetic pointed the other way: enough carts to
    // meet the count, and a halt has to be a fraction of a road (Sim.reset
    // has already thrown if the pattern names a road the map lacks)
    if (!(m.deliver > 0)) say(`an escort mission asking for ${m.deliver} deliveries`);
    if (m.pattern.length < m.deliver)
      say(`the pattern sends ${m.pattern.length} convoys and the mission asks for ${m.deliver}`);
    if (m.pattern.length - m.losses < m.deliver)
      say(`${m.losses} losses allowed out of ${m.pattern.length} sent, which cannot reach ${m.deliver}`);
    // ...and a halt is a fraction of the road. ZERO IS LEGAL AND IS THE
    // DEPOT (levels.ts EscortMission.halts): an escort that puts its cart
    // down at the start of the run parks it there first, so 0 is the shape
    // a stationary opening takes rather than a coordinate somebody fumbled.
    // ONE IS STILL ILLEGAL — a halt at the post is a delivery the mission
    // would stand next to forever without ever counting.
    for (const h of m.halts)
      if (!(h >= 0 && h < 1)) say(`a halt at ${h} is not a fraction of the road`);
    for (let i = 1; i < m.halts.length; i++)
      if (!(m.halts[i] > m.halts[i - 1]))
        say(`halts out of order: ${m.halts[i - 1]} then ${m.halts[i]}`);
  } else if (m.kind === "raze") {
    // the posts are the mission's geometry and live with the terrain
    // (game/missions.ts) — Sim.reset has already thrown if a section names
    // a post the map does not carry, so what is left is the arithmetic and
    // the one thing the sim cannot check for itself: that the schedule
    // fits inside a run somebody might actually play
    const guns = L.razeGuns(m);
    if (!(guns > 0)) say(`a raze mission asking for ${guns} emplacements`);
    if (m.sections.length === 0) say("a raze mission with no sections");
    if (!(m.every > 0)) say(`sections ${m.every}s apart, which stands them all up at once`);
    if (!(m.first >= 0)) say(`the first section rising at ${m.first}s`);
    // ...and every section has to have something on it. A section with no
    // emplacement is a post the mission draws a ring round, guards, and
    // never counts — which reads to a player as a battery they cannot
    // finish killing
    m.sections.forEach((sec, i) => {
      if (!(sec.guns > 0)) say(`section ${i} raises ${sec.guns} emplacements`);
    });
  } else if (m.kind === "sweep") {
    // the count is the map's (Sim.fabTotal): a sweep with nothing drawn on
    // it is a map with no way out
    const houses = sim.terrain.marks.filter((mk) => mk.kind === "fabricator").length;
    if (houses === 0) say("a sweep mission on a map with no fabricator drawn");
  } else {
    say(`mission kind "${m.kind}" has no objective the sim knows how to meet`);
  }
  // ...and the fabricators and branders (missionMarks.ts FABRICATOR,
  // BRANDER): a body dropped in rock is one nothing can see to shoot
  for (const mk of sim.terrain.marks) {
    if (mk.kind !== "fabricator" && mk.kind !== "brander") continue;
    const size = MK.markSize(mk);
    let rock = 0;
    for (let y = mk.y; y < mk.y + size; y++)
      for (let x = mk.x; x < mk.x + size; x++)
        if (sim.terrain.blocked[y * COLS + x]) rock++;
    if (rock > 0) say(`a ${mk.kind} at ${mk.x},${mk.y} stands on ${rock} cells of rock`);
  }
}
report(
  "worlds",
  worldProblems.concat(shelfProblems),
  `${L.VISIBLE_WORLDS.length} playable, finishable · ${
    L.WORLDS.length - L.VISIBLE_WORLDS.length
  } shelved, construct only`,
);

// ---------- sim: does the loop still run ----------

// A board the game ships and a run could build on (see `fixture` below),
// the swarm let out, and a dozen tackers PUT IN ITS WAY:
// wait for
// the first bodies, follow the flow field from one of them to the core,
// and build on the earliest stretch of that path the game will allow
// (`canPlace` refuses the drop zone and the base line, so the first legal
// cell is some way down the route and there is no guessing where).
//
// THE CHECK IS THAT A ROUND CONNECTS, NOT THAT A BODY DIES. A hit is the
// whole pipeline in one fact — a body was made, it moved, a turret found
// it, a round reached it and the damage landed — and unlike a kill it does
// not move when somebody tunes a price or a hit point. A gate that failed
// every time the balance changed would be a gate nobody left switched on.
const simProblems = [];
let simDetail = "";
try {
  reseed(7);
  const fixture = L.VISIBLE_WORLDS[0];
  const sim = new Sim(LA.specForTier(fixture, 0));
  // the field solves whole, so a re-route cannot depend on how loaded the
  // machine is — see FIELD_BUDGET_MS in sim.ts
  sim.setFieldBudget(Infinity);
  sim.setTech(TR.techStateFor(15));
  const half = () => { for (let s = 0; s < 30; s++) sim.update(1 / 60); };
  let nan = null;
  const scan = () => {
    for (let i = 0; i < sim.n && !nan; i++)
      if (!Number.isFinite(sim.upx[i]) || !Number.isFinite(sim.upy[i]))
        nan = `a body went NaN at ${Math.round(sim.time)}s`;
  };

  // 1. the script sends something.
  //
  //    A WALKER, AND NOT ANY BODY. A mission may have posted something
  //    before the first frame (Sim.garrisonUnit), and a body standing on
  //    a post would pass this stage without the script ever having been
  //    asked for anything. What it wants is a body walking at the core.
  const walker = () => {
    for (let i = 0; i < sim.n; i++) if (sim.ugar[i] === 0) return i;
    return -1;
  };
  const FIRST_WAVE_BY = L.WAVE_GAP_OPENING + L.WAVE_RELEASE_SECONDS + 10;
  while (walker() < 0 && sim.time < FIRST_WAVE_BY) { half(); scan(); }
  const spawnedAt = Math.round(sim.time);
  const first = walker();
  if (first < 0)
    simProblems.push(`the script sent nothing in ${Math.round(FIRST_WAVE_BY)} seconds`);

  // 2. the road one of them is on, cell by cell, down the gradient
  let placed = 0;
  if (first >= 0) {
    const from = Math.round(sim.upy[first] / CELL) * COLS + Math.round(sim.upx[first] / CELL);
    const route = roadToCore(sim, from);
    if (route.length < 2) simProblems.push("no route from a live body to the core");

    // 3. the earliest legal cells beside it
    for (let i = 0; i < route.length && placed < 12; i++) {
      const cx = route[i] % COLS, cy = (route[i] / COLS) | 0;
      for (let dy = -2; dy <= 2 && placed < 12; dy++)
        for (let dx = -2; dx <= 2 && placed < 12; dx++)
          if (sim.canPlace(cx + dx, cy + dy, "tacker")) {
            sim.placeTower(cx + dx, cy + dy, "tacker");
            placed++;
          }
    }
    if (placed === 0) simProblems.push("nowhere on the route the game would take a turret");
  }

  // 4. a round connects.
  //
  //    THE HORIZON IS A HUNDRED AND FIFTY SECONDS, and it is generous
  //    rather than tuned: what it waits for is a body to walk from the
  //    doors to the dozen turrets this check laid on the road, and how far
  //    that is is the fixture map's own geometry.
  let hitAt = null;
  const until = sim.time + 150;
  while (hitAt === null && sim.time < until && !sim.lost() && !sim.won()) {
    half();
    scan();
    if (sim.kills > 0) hitAt = Math.round(sim.time);
    else
      for (let i = 0; i < sim.n; i++)
        if (sim.ugar[i] === 0 && sim.uhp[i] < sim.uhpmax[i]) { hitAt = Math.round(sim.time); break; }
  }

  if (nan) simProblems.push(nan);
  if (!Number.isFinite(sim.core.hp)) simProblems.push(`core hp is ${sim.core.hp}`);
  if (placed > 0 && hitAt === null)
    simProblems.push(`${placed} turrets on the route hit nothing in a hundred and fifty seconds`);
  simDetail =
    `on ${fixture.map}: bodies at ${spawnedAt}s, ${placed} turrets on the route, ` +
    `${hitAt === null ? "no hit" : `first hit ${hitAt}s`}, ${sim.kills} kills, ${Math.round(sim.time)}s simulated`;
} catch (e) {
  simProblems.push(e.stack?.split("\n").slice(0, 3).join(" / ") ?? e.message);
}
report("sim", simProblems, simDetail);

// ---------- battle: does a late wave still fit in a frame ----------

/**
 * THE ONE CHECK THAT ASKS HOW FAST, and the reason the whole thing is
 * twenty seconds rather than ten.
 *
 * WHAT IT BUILDS is the worst honest hour of a campaign: the heaviest
 * stretch of the script (LOAD_WAVES), at the count the TOP OF THE LADDER
 * sends it at, walking into the board a run's income has bought by then
 * (boardBy: the stage audit's own arithmetic), every fielded kind in its
 * tier's share. Every body is rolled independently out of the whole T1-5
 * roster rather than copied, so the step being timed is running every
 * drive, every weapon and every hitbox the swarm has. The objective trees
 * are left out: a mission puts those down, never a wave.
 *
 * THE SWARM COMES IN THROUGH THE DOORS AND WALKS. It is not scattered over
 * the map by hand, because the cost of a step is mostly a question of how
 * closely packed the bodies are, and a hand-laid pile answers that question
 * by fiat — spread them thin and the same five thousand bodies run at 100
 * fps, pack them on the road and they run at 40. Fed through the mouths and
 * given MARCH seconds to walk, the swarm arranges itself the way the game
 * arranges it: a column down the road, folding at the chokes
 * (Sim.mergeSqueezed), meeting the line where the line happens to be.
 *
 * WHAT IT MEASURES IS ONE Sim.update, and NOT a whole frame — this process
 * has no GPU, no canvas and no renderer, so the drawing half of a frame is
 * not here to be timed. The budget is therefore the frame LESS what the
 * drawing was measured to cost (DRAW_MS below), and a pass means the
 * simulation left room for the drawing, NOT that the game ran at sixty.
 *
 * THE SCENARIO IS CHECKED BEFORE THE CLOCK IS BELIEVED. A run whose core
 * fell, or whose board was eaten, was timing a lighter field than the one it
 * claims — so those come back as problems in their own right rather than as
 * a fast step.
 */

/** the whole of a 60fps frame */
const FRAME_MS = 1000 / 60;
/**
 * ...AND WHAT THE OTHER HALF OF IT COSTS. Game.frame does two things with a
 * frame: it steps the sim, and it draws the result — the field
 * (Renderer.render), the overlay, and the corner map (Game.drawMinimap).
 * The pair is what has to fit in FRAME_MS, so the sim's budget is the frame
 * less the draw.
 *
 * THIS NUMBER WAS MEASURED, not assumed. It began life as "half the frame,
 * because neither half may eat the other", which was a guess standing in for
 * a measurement, and the guess was wrong in both directions at once. Driven
 * from the console at this check's own load — 5,200 bodies and 3,200 turrets
 * on a 1298x1215 canvas, at the zoom a run opens at:
 *
 *     Renderer.render   1.7ms
 *     drawOverlay       0.1ms
 *     drawMinimap       2.9ms
 *     ------------------------
 *     the draw          4.7ms      ...against a sim step of 7.9ms
 *
 * So the draw is under a third of the frame and not half of it — most of
 * the field is off screen at a playing zoom and never reaches the GPU. What
 * it is NOT is free: the corner map was 7.1ms of that 4.7 before it was
 * fixed to lay its marks down a row at a time, which is to say the minimap
 * alone used to cost more than everything the renderer did.
 *
 * Five rather than 4.7 because a measurement on one machine at one moment
 * is not a constant, and the number a budget is built on should round the
 * wrong way. Re-measure it the same way if the renderer or the HUD changes
 * shape; a whole-map zoom is the other end of the range (11ms of draw) and
 * is deliberately not what this is set from, because a frame spent looking
 * at the whole board is a frame nobody is playing.
 */
const DRAW_MS = 5;
const SIM_BUDGET_MS = FRAME_MS - DRAW_MS;

/** the stretch of the script to load the field with, 1-based and inclusive */
const LOAD_WAVES = [34, 36];
/** how far from the road the belt of turrets reaches, in cells */
const BELT_REACH = 30;
/** seconds the swarm walks before the clock, and seconds on the clock */
const MARCH = 4;
const SAMPLE = 3;
/** the board the stage audit says a run has bought by `wave`: each stage's
 *  scrap on its own tier at the mean price, the stage under way pro rata */
const boardBy = (spec, wave) => {
  const quota = new Map();
  for (const s of LA.stageAudit(spec)) {
    const played = Math.min(s.to, wave) - s.from + 1;
    if (played <= 0) continue;
    const n = Math.round((s.boards * played) / (s.to - s.from + 1));
    if (n > 0) quota.set(s.tier, n);
  }
  return quota;
};
const battleProblems = [];
let battleDetail = "";
if (wants("battle")) try {
  reseed(29);
  const spec = LA.specForTier(L.VISIBLE_WORLDS[0], LA.RUNG_COUNT - 1);
  const want = LA.waveGuide(spec)
    .filter((r) => r.wave >= LOAD_WAVES[0] && r.wave <= LOAD_WAVES[1])
    .reduce((a, r) => a + r.units, 0);
  // one queue of kinds, the tiers interleaved by share so the belt is mixed
  // from the road outward, kinds round-robin inside a tier
  const tiers = [...boardBy(spec, LOAD_WAVES[0])].map(([tier, n]) => ({
    tier, n, put: 0, ki: 0, kinds: T.FIELDED_KINDS.filter((k) => EC.TOWER_TIER[k] === tier),
  }));
  const plan = [];
  for (let left = tiers.reduce((a, t) => a + t.n, 0); left > 0; left--) {
    let next = null;
    for (const t of tiers) if (t.put < t.n && (!next || t.put / t.n < next.put / next.n)) next = t;
    plan.push(next.kinds[next.ki++ % next.kinds.length]);
    next.put++;
  }
  const asked = plan.length;
  const sim = new Sim(spec);
  sim.setTech(TR.techStateFor(60));
  const route = roadToCore(sim, sim.field.spawnPts[0]);
  if (route.length < 2) battleProblems.push("no road from the spawn to the core");
  build:
  for (let ring = 1; ring <= BELT_REACH; ring++)
    for (const c of route) {
      const cx = c % COLS, cy = (c / COLS) | 0;
      for (let dy = -ring; dy <= ring; dy++)
        for (let dx = -ring; dx <= ring; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
          // the first of the next few in the queue that fits, so a big
          // footprint refused here is not skipped for good
          for (let t = 0; t < 8 && t < plan.length; t++) {
            if (!sim.canPlace(cx + dx, cy + dy, plan[t])) continue;
            sim.placeTower(cx + dx, cy + dy, plan[t]);
            plan.splice(t, 1);
            break;
          }
          if (plan.length === 0 || sim.towers.length >= MAX_BOARD) break build;
        }
    }
  const built = sim.towers.length;
  const byTier = new Map();
  for (const t of sim.towers) byTier.set(EC.TOWER_TIER[t.kind], (byTier.get(EC.TOWER_TIER[t.kind]) ?? 0) + 1);
  const objective = new Set(L.UNIT_TREES.filter((t) => t.objective).flatMap((t) => t.kinds));
  const pool = L.UNIT_KINDS.filter((k) => !objective.has(k) && L.UNIT_STATS[k].tier <= 5);
  let fed = 0;
  for (let f = 0; fed < want && f < 60 * 60; f++) {
    for (let stuck = 0; fed < want && stuck < 40; )
      if (sim.spawnUnit(pool[(Math.random() * pool.length) | 0])) { fed++; stuck = 0; }
      else stuck++;
    sim.update(1 / 60);
  }
  const onField = new Set();
  for (let i = 0; i < sim.n; i++) onField.add(sim.ukind[i]);
  const coreBefore = sim.core.hp;
  for (let f = 0; f < MARCH * 60; f++) sim.update(1 / 60);
  sim.profile(true);
  const ms = [];
  for (let f = 0; f < SAMPLE * 60; f++) {
    const a = performance.now();
    sim.update(1 / 60);
    ms.push(performance.now() - a);
  }
  const p = sim.profileFull();
  sim.profile(false);
  ms.sort((a, b) => a - b);
  const step = ms[ms.length >> 1];
  const worst = ms[Math.floor(ms.length * 0.95)];
  if (built < asked * 0.9) battleProblems.push(`the belt took only ${built} of the ${asked} turrets the economy buys`);
  if (fed < want) battleProblems.push(`the doors took only ${fed} of the ${want} bodies`);
  if (onField.size < pool.length * 0.8)
    battleProblems.push(`only ${onField.size} of the ${pool.length} T1-5 kinds reached the field`);
  if (sim.lost()) battleProblems.push("the core fell — the board was too thin to time anything");
  else if (sim.core.hp < coreBefore)
    battleProblems.push(
      `the core took ${Math.round(coreBefore - sim.core.hp)} damage — the swarm is through the line`,
    );
  if (sim.towers.length * 2 < built)
    battleProblems.push(`${built - sim.towers.length} of ${built} turrets were eaten — half a board is not the board`);
  if (step > SIM_BUDGET_MS) {
    battleProblems.push(
      `a sim step takes ${step.toFixed(1)}ms of the ${SIM_BUDGET_MS.toFixed(1)}ms it has ` +
        `(${(1000 / step).toFixed(0)} fps if the draw were free, and it is not)`,
    );
    for (const line of SR.profileLines(p).slice(5, 11)) battleProblems.push(line);
  }
  const tiersLine = [...byTier].sort((a, b) => a[0] - b[0]).map(([t, n]) => `${n} t${t}`).join(" + ");
  battleDetail =
    `${built} turrets (${tiersLine}), ${built - sim.towers.length} lost, ${sim.n} bodies of ${onField.size} kinds, ` +
    `${Math.round(p.census.shots + p.census.hostileShots).toLocaleString("en-US")} shots in flight, ` +
    `${step.toFixed(1)}ms a step (p95 ${worst.toFixed(1)}ms) in a ${SIM_BUDGET_MS.toFixed(1)}ms budget`;
} catch (e) {
  battleProblems.push(e.stack?.split("\n").slice(0, 3).join(" / ") ?? e.message);
}
if (wants("battle")) report("battle", battleProblems, battleDetail);

/** how many cells a world will take a tier-1 turret on — the room a board has */
const legalCells = (world) => {
  const s = new Sim(LA.specForTier(world, 0));
  s.setTech(TR.techStateFor(60));
  let n = 0;
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (s.canPlace(x, y, "tacker")) n++;
  return n;
};

if (FULL) {
  // THE CLOCKS ARE POINTED AT THE BOARDS PEOPLE PLAY (VISIBLE_WORLDS, and
  // see the worlds check above). A shelved map's frame time is a number
  // about terrain nobody is standing on: timing it costs the same minutes
  // as timing a real one and a red line from it is a red line nobody can
  // act on, because the fix is finishing the board rather than the sim.
  // A world that will not construct was already reported above (`worlds`);
  // the clocks run on the ones that will rather than dying on the first.
  const worlds = L.VISIBLE_WORLDS.flatMap((w) => {
    try { return [{ w, cells: legalCells(w) }]; } catch { return []; }
  }).sort((a, b) => b.cells - a.cells);
  const biggest = worlds[0].w;
  if (wants("render")) {
    const problems = [];
    let detail = "";
    const r = await run(process.execPath, [
      // the two mixed scenes: a board of one kind and a board that fills the
      // map are the bench's to offer, not the gate's (see `battle` above)
      path.join(ROOT, "scripts", "bench.mjs"), "--json", "--world", biggest.id, "--n", String(N), "--scenes", "battle,waves",
    ]);
    let out = null;
    try {
      const last = r.out.trim().split("\n").pop();
      out = last ? JSON.parse(last) : null;
    } catch {}
    if (!out) {
      problems.push(`the bench did not report: ${(r.err || r.out).trim().split("\n").slice(-6).join(" / ")}`);
    } else {
      const rows = out.rows.filter((x) => !x.error);
      for (const x of out.rows.filter((x) => x.error)) problems.push(`the bench failed: ${x.error}`);
      for (const x of rows)
        if (x.drawMed > out.goalMs)
          problems.push(
            `${x.scene} at zoom ${x.zoom.toFixed(2)}: the draw takes ${x.drawMed.toFixed(1)}ms a frame (p95 ${x.drawP95.toFixed(1)}) ` +
              `of ${out.goalMs} — ${x.bodies} bodies, ${x.towers} turrets, ${x.shots} shots, ${x.fx} fx`,
          );
      // per scene, its worst zoom — the one number a line can carry
      const perScene = [];
      for (const scene of [...new Set(rows.map((x) => x.scene))]) {
        const worst = rows.filter((x) => x.scene === scene).sort((a, b) => b.drawMed - a.drawMed)[0];
        perScene.push(`${scene} ${worst.drawMed.toFixed(1)} @${worst.zoom.toFixed(1)}`);
      }
      detail = `ms of draw a frame at its worst zoom, of ${out.goalMs} — ${perScene.join(" · ")}`;
      if (problems.length > 0) for (const l of r.err.split("\n").filter((l) => /^\S/.test(l) && !/^transpiled/.test(l)).slice(0, 40)) problems.push(`    ${l}`);
    }
    report("render", problems, detail);
  }
}


print();
process.exit(failed ? 1 : 0);
