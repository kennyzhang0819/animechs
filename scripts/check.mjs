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
 * is over in about ten seconds, so it can be run after every edit rather
 * than saved up for the end.
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
Math.random = () => {
  rand = (rand + 0x6d2b79f5) >>> 0;
  let t = rand;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const R = (m) => require(path.join(DIST, m));
const L = R("levels.js"), M = R("maps.js"), LA = R("ladder.js"), C = R("constants.js");
const TR = R("track.js"), FA = R("foundryArt.js");
const { Sim } = R("sim.js");
const pub = (...p) => path.join(ROOT, "public", ...p);

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
  const { COLS, ROWS, CELL } = C;
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
    const route = [];
    const seen = new Set();
    let cur = from;
    for (let n = 0; n < 6000; n++) {
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

print();
process.exit(failed ? 1 : 0);
