#!/usr/bin/env node
/**
 * THE QUICK CHECK: everything that would make the game BREAK, and nothing
 * that takes a judgment call.
 *
 *   npm run check
 *
 * This is the one an agent runs, and the only one. It is a CRASH GATE, not
 * a balance gate: every check here has a right answer that needs no
 * knowledge of what the game is supposed to feel like, and the whole thing
 * is over in under twenty seconds, so it can be run after every edit rather
 * than saved up for the end. (`frames` is most of the back half of that: it
 * is the only check that has to run the game at load to learn anything.)
 *
 * What it asks:
 *
 *   types    tsc --noEmit over the whole tree — the broadest net there is,
 *            and the one that catches a renamed key before anything else
 *   art      every Foundry head the code names has a drawing behind it,
 *            which is the trap a turret rename walks into
 *   docs     every level and map document on disk parses and applies
 *   worlds   all nine worlds construct: terrain, script, core
 *   sim      thirty sim-seconds of world 1 with turrets on the spawn —
 *            bodies spawn, walk, get shot and die, and nothing goes NaN
 *   frames   the heaviest three waves the ladder sends, on a board full of
 *            turrets, timed: does one sim step still fit its share of a
 *            60fps frame
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
      "game/sim.ts", "game/ladder.ts", "game/track.ts", "game/foundryArt.ts",
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
  console.log(
    `\n${failed ? "BROKEN" : "clean"} in ${wall}s` +
      `${stale ? "" : " (transpile cached)"} — compile ${(tCompile / 1000).toFixed(1)}s`,
  );
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
 * enemy mix the frames check below is timed against.
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
const TR = R("track.js"), FA = R("foundryArt.js"), T = R("types.js");
/** the most turrets the frames check will stand up. Every world we ship runs
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
  ...FA.FOUNDRY_BASE_URLS.map((url, i) => [`base-${i + 1}`, url]),
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
// starfish1 team cell has no pixels in it" — WHILE A LEVEL IS LOADING,
// which is as late as a failure can be found and the one place none of the
// other stages look: the atlas needs a canvas, so nothing here packs it.
//
// The rule is one line and it belongs on this side of that: a tier that
// wears no accent is a tier that cannot ship. The runt is the one that
// gets caught, every time — it is the tier whose ornament is cut last.
const cellFamilies = (() => {
  const IA = R("ironhideArt.js"), FAM = R("familyArt.js"), TA = R("tuskerArt.js"), SA = R("starfishArt.js");
  const KA = R("kingArt.js");
  // a ground family's tier is a mech tier or a legged one; the Grapnels
  // ride the mech rig at every tier with no stride at all, so the rig is
  // named per family rather than read off the stride
  const ground = (mech, legged) => (T) => (T.stride > 0 ? mech(T) : legged(T));
  return [
    ["ironhide", IA.IRON_TIERS, ground(IA.ironMech, IA.ironLegged)],
    ["starhart", FAM.HART_TIERS, ground(FAM.hartMech, FAM.hartLegged)],
    ["weaver", FAM.FROG_TIERS, ground(FAM.frogMech, FAM.frogLegged)],
    ["tusker", TA.TUSK_TIERS, ground(TA.tuskMech, TA.tuskLegged)],
    ["starfish", SA.STARFISH_TIERS, SA.starfishMech],
    ["stoop", FAM.STOOP_TIERS, FAM.stoop],
    ["skate", FAM.MANTA_TIERS, FAM.manta],
    ["livewire", FAM.NARWHAL_TIERS, FAM.narwhal],
    // the boss is not a family and has exactly one tier, but its cell is
    // packed and refused the same way every other body's is
    ["king", [KA.KING_TIER], () => KA.king()],
  ];
})();
const cellProblems = [];
let bodiesChecked = 0;
for (const [family, tiers, art] of cellFamilies)
  for (const T of tiers) {
    bodiesChecked++;
    const cell = art(T).cell;
    if (!cell.px.some((p) => p !== null))
      cellProblems.push(`${family}${T.t}: its team cell has no pixels — it wears none of its family's accent, and the atlas refuses that at level load`);
  }
report("cells", cellProblems, `${bodiesChecked} team cells`);

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

// ---------- worlds: every one of them boots ----------

const worldProblems = [];
for (const w of L.WORLDS) {
  try {
    const s = new Sim(LA.specForTier(w, 0));
    if (!s.core) worldProblems.push(`${w.id} ${w.name}: no core`);
    else if (!(s.core.hp > 0)) worldProblems.push(`${w.id} ${w.name}: core at ${s.core.hp}`);
  } catch (e) {
    worldProblems.push(`${w.id} ${w.name}: ${e.message}`);
  }
}
report("worlds", worldProblems, `${L.WORLDS.length} construct`);

// ---------- sim: does the loop still run ----------

// World 1, the swarm let out, and a dozen tackers PUT IN ITS WAY: wait for
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
  const sim = new Sim(LA.specForTier(L.WORLDS[0], 0));
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

  // 1. the script sends something
  while (sim.n === 0 && sim.time < 20) { half(); scan(); }
  const spawnedAt = Math.round(sim.time);
  if (sim.n === 0) simProblems.push("the script sent nothing in twenty seconds");

  // 2. the road one of them is on, cell by cell, down the gradient
  let placed = 0;
  if (sim.n > 0) {
    const from = Math.round(sim.upy[0] / CELL) * COLS + Math.round(sim.upx[0] / CELL);
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

  // 4. a round connects — every seed tried landed one inside thirteen
  //    seconds, so twenty-five is margin and not a horizon worth tuning
  let hitAt = null;
  const until = sim.time + 25;
  while (hitAt === null && sim.time < until && !sim.lost() && !sim.won()) {
    half();
    scan();
    if (sim.kills > 0) hitAt = Math.round(sim.time);
    else
      for (let i = 0; i < sim.n; i++)
        if (sim.uhp[i] < sim.uhpmax[i]) { hitAt = Math.round(sim.time); break; }
  }

  if (nan) simProblems.push(nan);
  if (!Number.isFinite(sim.core.hp)) simProblems.push(`core hp is ${sim.core.hp}`);
  if (placed > 0 && hitAt === null)
    simProblems.push(`${placed} turrets on the route hit nothing in twenty-five seconds`);
  simDetail =
    `bodies at ${spawnedAt}s, ${placed} turrets on the route, ` +
    `${hitAt === null ? "no hit" : `first hit ${hitAt}s`}, ${sim.kills} kills, ${Math.round(sim.time)}s simulated`;
} catch (e) {
  simProblems.push(e.stack?.split("\n").slice(0, 3).join(" / ") ?? e.message);
}
report("sim", simProblems, simDetail);

// ---------- frames: does a late wave still fit in a frame ----------

/**
 * THE ONE CHECK THAT ASKS HOW FAST, and the reason the whole thing is
 * twenty seconds rather than ten.
 *
 * WHAT IT BUILDS is the worst honest hour of a campaign: the heaviest
 * stretch of the script (LOAD_WAVES), at the count the TOP OF THE LADDER
 * sends it at, walking into a board that has been built out as far as the
 * map allows. Every body is rolled independently out of the whole T1-4
 * roster rather than copied — twenty-eight kinds across seven families, so
 * the step being timed is running every drive, every weapon and every
 * hitbox the swarm has, which one kind repeated five thousand times would
 * not. T5 and the boss are left out on purpose: they are authored events,
 * not what a wave is made of.
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
/** how far either side of the road the board is built out, in cells */
const BELT_REACH = 30;
/** seconds the swarm walks before the clock starts — long enough that it is
 *  a column in contact with the line rather than a crowd at the doors */
const MARCH = 4;
/** ...and seconds of it timed. Every step is recorded and the MIDDLE one is
 *  the verdict: that is the number a frame counter shows, and it does not
 *  move when one step in fifty goes long. */
const SAMPLE = 2;

const frameProblems = [];
let frameDetail = "";
try {
  reseed(29);
  // the top of the ladder: tierCountScale plateaus at Nemesis, so this is
  // simply the most the script is ever asked to send
  const spec = LA.specForTier(L.WORLDS[0], LA.RUNG_COUNT - 1);
  const want = LA.waveGuide(spec)
    .filter((r) => r.wave >= LOAD_WAVES[0] && r.wave <= LOAD_WAVES[1])
    .reduce((a, r) => a + r.units, 0);
  const sim = new Sim(spec);
  // the save that has everything, so the board is built out of the whole
  // catalogue rather than the opening tier
  sim.setTech(TR.techStateFor(60));
  // ...and the SHIPPED field budget, deliberately: setFieldBudget(Infinity)
  // is right for the sim check, which wants one settled field and does not
  // care what it cost, and wrong here, where a re-route solved whole would
  // drop a 200ms spike into the sample that no player ever sees —
  // FIELD_BUDGET_MS spreads that cost over frames instead.

  const route = roadToCore(sim, sim.field.spawnPts[0]);
  if (route.length < 2) frameProblems.push("no road from the spawn to the core");

  // THE BOARD, ring by ring OUT from the road, one pass over the whole road
  // per ring — so the line thickens evenly end to end instead of piling up
  // at the spawn and leaving the core bare, which is what a greedy walk
  // does. The kinds are dealt round-robin so no single turret's targeting
  // or bullet is the whole of what is being timed.
  const kinds = T.FIELDED_KINDS;
  let ki = 0;
  build:
  for (let ring = 1; ring <= BELT_REACH; ring++)
    for (const c of route) {
      const cx = c % COLS, cy = (c / COLS) | 0;
      for (let dy = -ring; dy <= ring; dy++)
        for (let dx = -ring; dx <= ring; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
          const k = kinds[ki % kinds.length];
          if (!sim.canPlace(cx + dx, cy + dy, k)) continue;
          sim.placeTower(cx + dx, cy + dy, k);
          ki++;
          if (sim.towers.length >= MAX_BOARD) break build;
        }
    }
  const built = sim.towers.length;

  // THE SWARM, through the mouths the map paints, as many as they will take
  // each step. `stuck` is the doors saying no — a pad is crowded, or the
  // spot a long body wanted is half in rock (Sim.spawnUnit) — and forty
  // refusals running means let a step pass and come back with room.
  const pool = L.UNIT_KINDS.filter((k) => k !== "boss" && L.UNIT_STATS[k].tier <= 4);
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

  const ms = [];
  for (let f = 0; f < SAMPLE * 60; f++) {
    const a = performance.now();
    sim.update(1 / 60);
    ms.push(performance.now() - a);
  }
  ms.sort((a, b) => a - b);
  const step = ms[ms.length >> 1];
  const worst = ms[Math.floor(ms.length * 0.95)];

  // the scenario first: a clock read off a collapsed board says nothing
  if (fed < want) frameProblems.push(`the doors took only ${fed} of the ${want} bodies`);
  if (onField.size < pool.length)
    frameProblems.push(`only ${onField.size} of the ${pool.length} T1-4 kinds reached the field`);
  if (sim.lost()) frameProblems.push("the core fell — the board was too thin to time anything");
  else if (sim.core.hp < coreBefore)
    frameProblems.push(
      `the core took ${Math.round(coreBefore - sim.core.hp)} damage — the swarm is through the line`,
    );
  if (sim.towers.length * 2 < built)
    frameProblems.push(`${built - sim.towers.length} of ${built} turrets were eaten — half a board is not the board`);
  // ...and then the clock
  if (step > SIM_BUDGET_MS)
    frameProblems.push(
      `a sim step takes ${step.toFixed(1)}ms of the ${SIM_BUDGET_MS.toFixed(1)}ms it has ` +
        `(${(1000 / step).toFixed(0)} fps if the draw were free, and it is not)`,
    );

  frameDetail =
    `${sim.n} bodies of ${onField.size} kinds, ${sim.towers.length} turrets, ` +
    `${step.toFixed(1)}ms a step (p95 ${worst.toFixed(1)}ms) in a ${SIM_BUDGET_MS.toFixed(1)}ms budget`;
} catch (e) {
  frameProblems.push(e.stack?.split("\n").slice(0, 3).join(" / ") ?? e.message);
}
report("frames", frameProblems, frameDetail);

print();
process.exit(failed ? 1 : 0);
