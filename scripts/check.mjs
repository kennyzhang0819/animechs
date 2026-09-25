#!/usr/bin/env node
/**
 * THE CHECK: everything that would make the game BREAK, and nothing that
 * takes a judgment call — in two sizes.
 *
 *   npm run check          quick: does it compile, does it run, does it crash
 *   npm run check:full     ...and does it still fit the frame, at the scale
 *                          the game says it must carry — a minute or two
 *   npm run check:full -- --only siege
 *                          one clock, for iterating on it (frames, siege,
 *                          scale, maps, turrets, enemies, swarmfirst,
 *                          upgrades, render — a comma list)
 *   npm run check:full -- --only turrets --kinds torch,lobber --n 2000
 *                          the isolated clocks narrowed: these kinds, at
 *                          this many of each (the goal is ten thousand)
 *
 * QUICK is the one an agent runs after every edit. It is a CRASH GATE, not
 * a balance gate: every check in it has a right answer that needs no
 * knowledge of what the game is supposed to feel like, it never times
 * anything, and it is over in seconds.
 *
 * FULL is the same plus the clocks — `frames` and the `siege` family below
 * — which are the checks that have to run the game at load to learn
 * anything, and so cost what a late wave costs to simulate, many times
 * over. Run it before a change to the sim is called done, and any time
 * something "feels slow": it reproduces the board that lagged, and it
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
 *   frames   the heaviest three waves the ladder sends, on a board full of
 *            turrets, timed: does one sim step still fit its share of a
 *            60fps frame
 *   siege    the LATE board — nine thousand turrets, a hundred and fifty
 *            modules, the T5s and a boss taking it apart — timed the same
 *            way, with the swarm actually killing turrets while the clock
 *            runs, which `frames` never does (see the check for why that
 *            matters)
 *   scale    the same siege at three, six, nine and twelve thousand
 *            turrets, so the cost of the board is read as a CURVE and not
 *            a point
 *   maps     the siege on every PLAYABLE world, because a choke is a
 *            different fight from an open field and the board that lags is
 *            the one the player happens to be on
 *
 * ...and THE STANDARD, which is what the game is held to at endgame and
 * the reason the rest of these exist: ten thousand turrets on the map,
 * ten thousand bodies, both sides shooting, under a hundred random
 * upgrades — and drawing well at every zoom while it happens. Each clock
 * below asks one part of that in isolation, so a failure names a KIND
 * rather than a fight:
 *
 *   turrets  every fielded turret kind, TEN THOUSAND OF IT ALONE, every
 *            one of them in reach of one body that cannot die — the
 *            heaviest fire a kind can put out, and nothing else on the
 *            step. Timed per kind; a kind over budget is named
 *   enemies  every body kind, ten thousand of it alone, every one in reach
 *            of a core that cannot fall — and once more with the whole
 *            T1-5 roster mixed. Timed per kind
 *   swarmfirst  ten thousand bodies on the field FIRST, then the board
 *            spammed down under them, a card a step — what a late run does
 *            when it panic-builds, with the whole swarm already in reach
 *   upgrades the siege under a hundred random upgrade nodes off the real
 *            trees, on top of its hundred and fifty modules
 *   render   the other half of the frame, which nothing above can time:
 *            the same boards stood in a real Game in a headless browser
 *            (scripts/bench.mjs) and the DRAW read at a ladder of zooms
 *            from the whole map to the closest, against DRAW_GOAL_MS
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
/** --only frames,siege,...: just those clocks, for iterating on one —
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
const KINDS = (() => {
  const v = argAfter("--kinds");
  return v ? new Set(v.split(",")) : null;
})();
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
const TR = R("track.js"), FA = R("foundryArt.js"), T = R("types.js"), MK = R("missionMarks.js");
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
  ...FA.FOUNDRY_BASE_URLS.map((url, i) => [`base-${FA.FOUNDRY_BASE_SIZES[i]}`, url]),
];
const artMissing = artWanted
  .filter(([, url]) => !existsSync(drawingFor(url)))
  .map(([what, url]) => `${what}: ${url} has no ${path.relative(ROOT, drawingFor(url)).replace(/\\/g, "/")}`);
report("art", artMissing, `${artWanted.length} drawings`);

// ---------- atlas: how much room is left on the sheet ----------

// THE SHEET IS THE ONE THING THIS CHECK CANNOT FULLY RUN, and the outage
// that put this stage here is the reason to say so out loud rather than
// leave the gap where somebody has to rediscover it.
//
// Importing game/atlas.ts runs the packer over every cell declared at
// module scope — the floors, the walls, the bullets, every hull and every
// part of one — which is the great majority of the sheet, and it is pure
// arithmetic that Node runs happily. What it does NOT run is the last
// step: a body's TEAM CELL is cut to art that has to be drawn before its
// size is known, so those are reserved inside buildAtlas, which needs a
// canvas. Node has none. The Kettles landed, the sheet went past what
// MaxRects could pack, and the cell that threw was a team cell — the one
// class of cell no gate could see — so `check` was green and the game
// would not boot.
//
// SO THIS IS A TREND LINE, NOT A GATE. It prints how full the static pass
// leaves the sheet and how big the largest free rectangle still is, and
// it fails only on the thing it can actually prove: that the static pass
// itself did not overflow. A packer that fails on SHAPE cannot be
// predicted from an area figure (at 2560 the sheet was 85% spoken for and
// had 1.5M px free — in the wrong shapes), so what this buys is a number
// that climbs in front of you run after run instead of a cliff.
const atlasProblems = [];
let atlasDetail = "";
try {
  const A = R("atlas.js");
  const fill = A.atlasFill();
  const room = A.atlasLargestFree();
  atlasDetail =
    `${fill.cells} static cells, ${fill.pct}% of ${A.ATLAS_SIZE[0]}x${A.ATLAS_SIZE[1]}` +
    `, biggest free rect ${room.w}x${room.h}` +
    ` (team cells are packed at runtime and are NOT counted — see this stage)`;
  if (fill.pct > 80)
    atlasProblems.push(
      `the static pass alone fills ${fill.pct}% of the sheet; the team cells go on top of that at load. ` +
        `Raise ATLAS_W in game/atlas.ts before it throws in the browser (ceiling 4096)`,
    );
} catch (e) {
  atlasProblems.push(`game/atlas.ts did not import: ${e.message}`);
}
report("atlas", atlasProblems, atlasDetail);

// ---------- cells: a body whose TEAM CELL is empty takes the game down ----------

// Every drawn body hands the packer a team cell as well as a drawing: the
// mask of every pixel laid in the family's accent, which the sheet tints
// and lays back over the body (packTeamCells). A body that wears none of
// its family's colour produces an empty mask, and the packer throws — "the
// grapnel1 team cell has no pixels in it" — WHILE A LEVEL IS LOADING,
// which is as late as a failure can be found and the one place none of the
// other stages look: the atlas needs a canvas, so nothing here packs it.
//
// The rule is one line and it belongs on this side of that: a tier that
// wears no accent is a tier that cannot ship. The runt is the one that
// gets caught, every time — it is the tier whose ornament is cut last.
const cellFamilies = (() => {
  const IA = R("ironhideArt.js"), FAM = R("familyArt.js"), TA = R("tuskerArt.js"), SA = R("grapnelArt.js");
  const KA = R("kingArt.js"), KE = R("kettleArt.js"), PY = R("pylonArt.js"), WA = R("wardenArt.js");
  const FB = R("fabricatorArt.js"), ST = R("storkArt.js"), RK = R("ratkingArt.js");
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
    ["stork", ST.STORK_TIERS, ST.stork],
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

/** the stretch of the script to load the field with, 1-based and inclusive —
 *  the heaviest three waves of the fifty-wave script, 5.7k bodies */
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
if (wants("frames")) try {
  reseed(29);
  // the top of the ladder: tierCountScale plateaus at Nemesis, so this is
  // simply the most the script is ever asked to send.
  //
  // THE BOARD IS THE FIRST ONE IN THE GAME and that is now Coldline, not
  // Confluence — which came off PLAYABLE_WORLD_IDS with the other holds.
  // SO THE NUMBER HERE MOVED WHEN THE BOARD DID, and a jump in it is not
  // by itself a sim regression: Coldline stands up about 1,850 turrets
  // where Confluence stood 1,390, and a third again as many guns is a
  // third again as much step. It fits the budget on both — but if this
  // line goes red and nothing in the sim was touched, the board is the
  // first thing to rule out, and it is STILL a real red line when it
  // comes, because Coldline is a board people play (see the note on the
  // FULL clocks at the bottom of this file).
  const spec = LA.specForTier(L.VISIBLE_WORLDS[0], LA.RUNG_COUNT - 1);
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
if (wants("frames")) report("frames", frameProblems, frameDetail);

// ---------- siege: the late board, with the swarm taking it apart ----------

/**
 * THE CHECK `frames` IS NOT, and the reason there are two clocks.
 *
 * `frames` times a board the swarm never breaks: its own scenario test
 * FAILS if the core takes damage or half the turrets are eaten, so a run
 * that passes it is a run where nothing on the board died. That is the
 * right test for "does the loop fit the frame", and it was blind to an
 * entire class of cost — everything the sim does WHEN A TURRET DIES. Two
 * of those got through it and lagged a real wave-50 board to 69% of real
 * time: a death re-composed every standing turret's stats (refreshSpecs,
 * once per death, O(board)), and a death rebuilt the whole aim index the
 * next time anything searched it (structBox). Neither is reachable from a
 * board where nothing dies, and `frames` said 4ms a step while the game
 * said 20.
 *
 * WHAT THIS BUILDS is the run that found them, as the player described it:
 * a board about a third built, a hundred and fifty modules bought off the
 * real M and G tables (so the mix is the game's — mostly commons, a few
 * ultras — and not ten of everything), the late waves' worth of bodies
 * streaming in through the doors at a steady rate — every tier, the T5s
 * and a boss among them — and then, mid-fight, the rest of the board laid
 * down at once, up to the nine thousand turrets a late run stands. A
 * second boss goes in the moment the clock starts, because a boss is the
 * widest thing that flies and the widest live hitbox is what every shot's
 * broad phase pays for (Sim.rmaxAliveFor); one that dies in the march is
 * one the sample never sees.
 *
 * THE SCENARIO IS CHECKED BEFORE THE CLOCK IS BELIEVED, as in `frames` —
 * but the other way round: here the swarm MUST be killing turrets inside
 * the window, the T5s must have reached the field, and a boss must be
 * alive in it, or the sample is timing the board `frames` already times
 * and this check is a duplicate. The clock is read off the sim's own
 * phase profiler rather than a stopwatch, so a failure prints the phase
 * table — which is the only form of the number that says WHY.
 *
 * THE CLOCK IS THE MIN OVER THREE SAMPLES OF THE MEDIAN STEP, against the
 * same budget `frames` uses. This board runs close to that budget on
 * purpose — it is the scale the game says it must carry — and a number
 * that close to its line has to be read carefully: three back-to-back runs
 * of one seed timed 10.4, 12.3 and 11.0ms while `frames` timed 4.1, 6.8
 * and 5.1 on ITS unchanged board, which is the machine and not the game.
 * Machine noise only ever runs one way (something else wanted the core;
 * nothing ever makes a step cheaper than it is), so the least of several
 * medians is the honest reading of what the step costs, and the one that
 * does not flip on a busy laptop.
 *
 * THE SHARE OF STEPS OVER A WHOLE FRAME IS PRINTED, NOT GATED — except at
 * a third, which is unplayable on any machine (the bugs above put it at
 * 30 to 60 per cent). Below that it is what a player feels, and it is also
 * the number most at the mercy of the machine, so it reads beside the
 * step rather than deciding for it.
 *
 * The board is scattered rather than belted: a run this late has built
 * everywhere it could, and a belt along the road would put the whole
 * board in the swarm's teeth at once, which is a different (and easier)
 * scenario than the one that lagged.
 */

/** modules bought before the board goes down — the M and G buttons, pressed */
const SIEGE_BUYS = 150;
/** turrets standing when the swarm arrives (a third of the board), and after
 *  the mid-fight fill — the size a late run stands, and the size the gate is
 *  read at. A run is EXPECTED to reach ten thousand; the ladder below is
 *  gated to there and printed past it */
const SIEGE_PRE = 3000;
const SIEGE_FULL = 9000;
/** bodies through the doors per step, the whole window — a wave streaming
 *  in rather than a crowd dropped at once, so the field holds a steady
 *  population that keeps the line under attack for the length of the sample */
const SIEGE_RATE = 12;
/** seconds the swarm walks before the fill and the clock */
const SIEGE_MARCH = 3;
/** samples timed, and seconds in each: the verdict is the least of their medians */
const SIEGE_SAMPLES = 3;
const SIEGE_SAMPLE = 2;
/** the share of steps over a whole frame (STEP_BUDGET_MS) that fails outright */
const SIEGE_OVER = 1 / 3;
/**
 * THE BAR `scale` AND `maps` ARE HELD TO TODAY, in ms a step — and it is
 * NOT the budget. Measured with every fix to date in, the siege at nine
 * thousand turrets runs 15 to 20ms a step on five of the nine worlds
 * (Maelstrom, Quagmire, Confluence, Sear, Coldline) and at the 9k rung
 * whenever a boss is alive, and in every case it is `projectiles`: 17 to
 * 31 thousand shots in flight, each sweeping the hash for bodies, at 70%
 * of the step. That is known and not yet fixed, so those two checks are
 * held to this looser bar rather than failing on a cost nobody is
 * changing today; `siege` itself, on the one world that fits, is still
 * held to SIM_BUDGET_MS.
 *
 * THE PROJECTILE WORK LANDED (2026-09-16: game/projs.ts, the shot loop in
 * Sim.updateProjectiles, and normalizeBullet in constants.ts — the whirl
 * clock went from 20.7ms to 10.7 at ten thousand turrets), so the bar is
 * the budget again and the over-frame share is the siege's own. The
 * names stay so the two call sites read as what they were: the checks
 * that were once held looser than the rest.
 */
const SIEGE_LENIENT_MS = SIM_BUDGET_MS;
const SIEGE_LENIENT_OVER = SIEGE_OVER;

/** how many cells a world will take a tacker on — the room a board has */
const legalCells = (world) => {
  const s = new Sim(LA.specForTier(world, 0));
  s.setTech(TR.techStateFor(60));
  let n = 0;
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (s.canPlace(x, y, "tacker")) n++;
  return n;
};

/**
 * ONE SIEGE: the scenario above on `world`, filled to `full` turrets, timed.
 * Returns the problems, the step, and a detail line. `gate` false times
 * without judging — the ladder's rungs past what a run is expected to stand.
 */
function siege({
  world,
  full = SIEGE_FULL,
  pre = SIEGE_PRE,
  seed = 43,
  budget = SIM_BUDGET_MS,
  overMax = SIEGE_OVER,
  /** the save the board is built under; the whole catalogue unless a clock
   *  hands one in (upgrades) */
  tech = null,
}) {
  const problems = [];
  let step = NaN, detail = "";
  try {
    reseed(seed);
    const MO = R("mods.js"), RE = R("relics.js"), SR = R("simreport.js");
    const spec = LA.specForTier(world, LA.RUNG_COUNT - 1);
    const sim = new Sim(spec);
    sim.setTech(tech ?? TR.techStateFor(60));
  
    // the purchases, off the game's own tables and odds: every fourth press
    // is the G button, until the relics run out (a relic is held once —
    // relics.ts — so a late run's G presses land on nothing and the player
    // goes back to M, which is what this does too)
    let bought = 0;
    for (let i = 0; i < SIEGE_BUYS; i++) {
      const relic = i % 4 === 3 ? RE.rollRelic(sim.relicsHeld) : null;
      if (relic) { sim.takeRelic(relic); bought++; continue; }
      const id = MO.rollMod();
      if (id) { sim.takeMod(id); bought++; }
    }

    // the board, scattered over every legal cell: kinds round-robin, and a
    // tacker where the kind in hand does not fit
    const kinds = T.FIELDED_KINDS;
    let ki = 0;
    const scatter = (target) => {
      for (let tries = 0; sim.towers.length < target && tries < 4e6; tries++) {
        const x = (Math.random() * COLS) | 0, y = (Math.random() * ROWS) | 0;
        const k = kinds[ki % kinds.length];
        if (sim.canPlace(x, y, k)) { sim.placeTower(x, y, k); ki++; }
        else if (sim.canPlace(x, y, "tacker")) sim.placeTower(x, y, "tacker");
      }
    };
    scatter(Math.min(pre, full));

    // THE SWARM: every kind on the roster, drawn at random — except for
    // the first body of every step, which is spent TOPPING UP COVERAGE.
    //
    // WHAT THE CLOCK IS FOR is the widest hitboxes and the heaviest
    // per-body work, so the assertions below require a boss and every T5
    // kind to have been standing while it ran. A uniform draw over a
    // fifty-kind roster only manages that by luck: the check failed on
    // "no boss was alive during the sample" and "only 3 T5 kinds reached
    // the field" whenever the dice or the pad crowding moved, which is a
    // gate that cries wolf rather than one that catches anything.
    //
    // So slot zero asks for whatever is MISSING FROM THE BOARD RIGHT NOW —
    // a boss when none is standing, otherwise the first T5 with nothing of
    // its kind alive — read off the sim's own census rather than off a
    // tally of what has been asked for. Topping up only what is absent is
    // what keeps the load honest: it puts one body in, not a stream.
    //
    // IT MATTERS MORE SINCE THE BOSS LEFT THE WAVE SCRIPT (levels.ts
    // OBJECTIVE_KINDS). Nothing in a campaign run fields one until a
    // mission does, so this is the only place the Sovereign is ever timed.
    const pool = L.UNIT_KINDS.filter((k) => k !== "boss");
    const T5 = pool.filter((k) => L.UNIT_STATS[k].tier === 5);
    const gone = (kind) => sim.aliveByKind[L.UNIT_ID[kind]] === 0;
    let fed = 0, bosses = 0;
    // THE DOOR WILL NOT ALWAYS TAKE A BOSS, and on a tight board it never
    // will. A spawn needs a clear spot at the body's OUTER radius, and the
    // Sovereign's is the widest on the roster — so on Coldline, whose 875
    // spawn tiles are carrying twelve thousand bodies by the time the clock
    // starts, the ask failed every step of the window and the check said
    // the widest air hitbox went untimed. Which was TRUE and was not a bug:
    // there genuinely was no room, and the scenario wanted one anyway.
    // So it is placed EXACTLY at the map's first air mouth when the door
    // refuses — the same path a Borer's train uses to be laid nose to tail
    // (Sim.launchCrosser) — because this check is about what a step COSTS
    // with that silhouette on the board, not about whether a pad was free.
    const mouth = sim.airRoutes()[0]?.pts;
    const putBoss = () =>
      sim.spawnUnit("boss") ||
      (mouth ? sim.spawnUnit("boss", { x: mouth[0], y: mouth[1], exact: true }) : false);
    const feed = (keepBoss) => {
      for (let j = 0; j < SIEGE_RATE; j++) {
        if (j === 0 && keepBoss && gone("boss")) {
          if (putBoss()) { fed++; bosses++; }
          continue;
        }
        const k = (j === 0 ? T5.find(gone) : null) ?? pool[(Math.random() * pool.length) | 0];
        if (sim.spawnUnit(k)) fed++;
      }
    };
    for (let f = 0; f < SIEGE_MARCH * 60; f++) { feed(true); sim.update(1 / 60); }

    // the rest of the board, all at once, with the fight on
    scatter(full);
    const standing = sim.towers.length;
    const kills0 = sim.kills;

    // ...and the clock, with a boss alive under it: the profiler armed once
    // across every sample for the phases, and each step's own wall time
    // kept beside it for the medians
    sim.profile(true);
    const seenT5 = new Set();
    let bossAlive = false;
    const medians = [];
    for (let n = 0; n < SIEGE_SAMPLES; n++) {
      const ms = [];
      for (let f = 0; f < SIEGE_SAMPLE * 60; f++) {
        feed(true);
        const a = performance.now();
        sim.update(1 / 60);
        ms.push(performance.now() - a);
        if (f % 30 === 0)
          for (let i = 0; i < sim.n; i++) {
            const k = L.UNIT_KINDS[sim.ukind[i]];
            if (k === "boss") bossAlive = true;
            else if (L.UNIT_STATS[k].tier === 5) seenT5.add(k);
          }
      }
      ms.sort((a, b) => a - b);
      medians.push(ms[ms.length >> 1]);
    }
    step = Math.min(...medians);
    const p = sim.profileFull();
    sim.profile(false);
    const lost = standing - sim.towers.length;
    const killed = sim.kills - kills0;
    let air = 0;
    for (let i = 0; i < sim.n; i++) if (sim.ufly[i]) air++;

    // the scenario first
    if (bought < SIEGE_BUYS * 0.9) problems.push(`only ${bought} of ${SIEGE_BUYS} module buys landed`);
    if (sim.towers.length < full * 0.9)
      problems.push(`the board reached only ${sim.towers.length} turrets of the ${full} asked for`);
    if (killed === 0) problems.push("the turrets killed nothing in the window");
    if (lost === 0) problems.push("the swarm killed no turret in the window — the death path went untimed, which is the one thing this check is for");
    if (seenT5.size < 4) problems.push(`only ${seenT5.size} T5 kinds reached the field in the window`);
    if (!bossAlive) problems.push("no boss was alive during the sample — the widest air hitbox went untimed");
    if (sim.lost()) problems.push("the core fell");
    // ...then the clock
    const overShare = p.steps > 0 ? p.over / p.steps : 0;
    const slow = [];
    if (step > budget)
      slow.push(
        `a sim step takes ${step.toFixed(1)}ms of the ${budget.toFixed(1)}ms it is allowed ` +
          `(the least of ${SIEGE_SAMPLES} medians: ${medians.map((m) => m.toFixed(1)).join(", ")})`,
      );
    if (overShare > overMax)
      slow.push(
        `${(overShare * 100).toFixed(0)}% of steps ran over a whole frame (${SR.STEP_BUDGET_MS.toFixed(1)}ms), ` +
          `averaging ${p.slowMs.toFixed(1)}ms — unplayable on any machine`,
      );
    if (slow.length > 0) {
      problems.push(...slow);
      // the phase table, because a number without its phases cannot say why
      for (const line of SR.profileLines(p).slice(5, 11)) problems.push(line);
    }

    detail =
      `${sim.towers.length} turrets, ${sim.n} bodies (${air} air, ${seenT5.size} T5 kinds, ${bosses} bosses), ` +
      `${lost} turrets lost, ${step.toFixed(1)}ms a step (least median of ${SIEGE_SAMPLES}; mean ${p.ms.toFixed(1)}, ` +
      `worst ${p.worst.toFixed(0)}, ${(overShare * 100).toFixed(0)}% over the frame) against ${budget.toFixed(1)}ms`;
  } catch (e) {
    problems.push(e.stack?.split("\n").slice(0, 3).join(" / ") ?? e.message);
  }
  return { problems, step, detail };
}

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
  // the gate: the world with the most ground, at the size a late run stands
  if (wants("siege")) {
    const main = siege({ world: biggest });
    report("siege", main.problems, main.detail);
  }

  // the ladder: the cost of the board as a curve, gated to what a run is
  // expected to stand and printed past it
  const rungs = [3000, 6000, 9000, 12000];
  const scaleProblems = [];
  const curve = [];
  if (wants("scale")) for (const full of rungs) {
    const r = siege({ world: biggest, full, seed: 47, budget: SIEGE_LENIENT_MS, overMax: SIEGE_LENIENT_OVER });
    curve.push(`${full / 1000}k ${Number.isFinite(r.step) ? r.step.toFixed(1) : "?"}ms`);
    for (const p of r.problems) scaleProblems.push(`${full / 1000}k: ${p}`);
  }
  if (wants("scale")) report("scale", scaleProblems, `${curve.join(" · ")} a step of ${SIEGE_LENIENT_MS.toFixed(1)}`);

  // every playable world: a choke is a different fight from an open field.
  // A small map takes fewer buildings, so the target is what its ground
  // will hold
  const mapProblems = [];
  const perWorld = [];
  if (wants("maps")) for (const { w, cells } of worlds) {
    const full = Math.min(SIEGE_FULL, Math.floor(cells / 8));
    const r = siege({ world: w, full, seed: 53, budget: SIEGE_LENIENT_MS, overMax: SIEGE_LENIENT_OVER });
    perWorld.push(`${w.name} ${Number.isFinite(r.step) ? r.step.toFixed(1) : "?"}`);
    for (const p of r.problems) mapProblems.push(`${w.name}: ${p}`);
  }
  if (wants("maps")) report("maps", mapProblems, `ms a step of ${SIEGE_LENIENT_MS.toFixed(1)} — ${perWorld.join(" · ")}`);

  // ---------- the standard: ten thousand of everything ----------

  // ONE ISOLATED CLOCK. `build` stands the board on a fresh sim of `world`
  // with NOTHING TO SEND (the script emptied, so nothing arrives that the
  // clock did not put there), with building free and uncapped (tech null —
  // ten thousand of one kind is a board no save allows, and the cap is not
  // the question). Then ISO_WARM steps pass, ISO_SAMPLE are timed with the
  // phase clock armed, and the verdict is the median against the budget,
  // the p95, the census and the phase table beside it. The sim comes back
  // too, for the scenario tests that read the board after the clock.
  const ISO_WARM = 60;
  const ISO_SAMPLE = 120;
  /** a reach no cell on the board is outside of (the map's diagonal — the
   *  sim clamps a longer one to it, setBench), and a pool no shot empties */
  const EVERYWHERE = Math.hypot(COLS * CELL, ROWS * CELL);
  const IMMORTAL = 1e12;
  const isolated = ({ world, build, seed = 61, budget = SIM_BUDGET_MS }) => {
    reseed(seed);
    const SR = R("simreport.js");
    const spec = { ...LA.specForTier(world, LA.RUNG_COUNT - 1), script: [] };
    const sim = new Sim(spec);
    sim.setTech(null);
      const info = build(sim) ?? {};
    for (let f = 0; f < ISO_WARM; f++) sim.update(1 / 60);
    sim.profile(true);
    const ms = [];
    for (let f = 0; f < ISO_SAMPLE; f++) {
      const a = performance.now();
      sim.update(1 / 60);
      ms.push(performance.now() - a);
    }
    const p = sim.profileFull();
    sim.profile(false);
    ms.sort((a, b) => a - b);
    const step = ms[ms.length >> 1], p95 = ms[Math.floor(ms.length * 0.95)];
    const c = p.census;
    // the heaviest phase, named — the one line of the table a list can carry
    const top = p.phases.filter((q) => q.ms > 0).sort((a, b) => b.ms - a.ms)[0];
    // rounds IN FLIGHT — an instant weapon (a beam, a flame, speed 0) never
    // has one, so a kind can be firing flat out and read as 0 shots here
    // ...and the bodies LIVE at the clock, not the count that landed: a
    // crowd folds into stacks where it squeezes (Sim.mergeSqueezed)
    const why = `${c.bodies.toLocaleString("en-US")} bodies, ` +
      `${Math.round(c.shots + c.hostileShots).toLocaleString("en-US")} shots in flight, ${c.fx} fx` +
      (top ? `; ${top.name} ${top.ms.toFixed(1)}ms` : "");
    const slow = step > budget
      ? `${step.toFixed(1)}ms a step (p95 ${p95.toFixed(1)}) of ${budget.toFixed(1)} — ${why}`
      : null;
    return { sim, info, step, p95, census: c, why, slow, table: SR.profileLines(p).slice(5, 9) };
  };
  /** the open cell nearest the middle of the map — where the dummy stands */
  const middleOf = (sim) => {
    const cx = COLS >> 1, cy = ROWS >> 1;
    for (let r = 0; r < 200; r++)
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const x = cx + dx, y = cy + dy;
          if (x < 0 || y < 0 || x >= COLS || y >= ROWS) continue;
          if (!sim.field.walk[y * COLS + x]) return { x: (x + 0.5) * CELL, y: (y + 0.5) * CELL };
        }
    return { x: cx * CELL, y: cy * CELL };
  };
  /** the T1-5 roster dealt evenly over `n` bodies, plus one boss */
  const spawnMixed = (sim, n, opts) => {
    const pool = L.UNIT_KINDS.filter((k) => k !== "boss");
    const each = Math.floor(n / pool.length);
    let made = 0;
    for (const k of pool) made += sim.spawnMany(k, each, opts);
    made += sim.spawnMany(pool[0], n - each * pool.length, opts);
    made += sim.spawnMany("boss", 1, opts);
    return made;
  };
  const kindOk = (k) => !KINDS || KINDS.has(k);
  const ms1 = (x) => (Number.isFinite(x) ? x.toFixed(1) : "?");
  /** a line per case as it lands, on stderr — the report is the verdict,
   *  this is the clock still ticking through a ten-minute run */
  const tick = (clock, what) => process.stderr.write(`  ${clock.padEnd(10)} ${what}\n`);

  // TURRETS: every fielded kind, ten thousand of it alone, every one of
  // them in reach of one body that cannot die. The board is the whole
  // legal map; the dummy is the lightest ground body there is, standing
  // in the middle, its pool pinned so the step never empties the field.
  if (wants("turrets")) {
    const problems = [], line = [];
    const dummy = L.UNIT_KINDS.find((k) => L.UNIT_STATS[k].tier === 1 && !L.UNIT_STATS[k].flying) ?? L.UNIT_KINDS[0];
    for (const kind of T.FIELDED_KINDS.filter(kindOk)) {
      try {
        const r = isolated({
          world: biggest,
          build: (sim) => {
            // the kind and nothing else: the ground takes what it takes
            // of a wide footprint, and the count is printed, not judged
            const built = sim.scatterTowers([kind], N, false);
            sim.setBench({ towerRange: EVERYWHERE });
            const made = sim.spawnMany(dummy, 1, { at: middleOf(sim), hp: IMMORTAL });
            return { built, made };
          },
        });
        line.push(`${kind} ${ms1(r.step)}${r.info.built < N * 0.9 ? ` (${r.info.built} fit)` : ""}`);
        tick("turrets", `${kind}: ${r.info.built} stood, ${ms1(r.step)}ms a step (p95 ${ms1(r.p95)}) — ${r.why}`);
        if (r.info.made === 0) problems.push(`${kind}: the dummy could not land — nothing was shot at`);
        if (r.info.built < N * 0.1) problems.push(`${kind}: the ground took only ${r.info.built} of ${N}`);
        if (r.sim.n === 0) problems.push(`${kind}: the dummy died — its pool was meant to be bottomless`);
        if (r.slow) { problems.push(`${kind}: ${r.slow}`); for (const l of r.table) problems.push(`    ${l}`); }
      } catch (e) {
        problems.push(`${kind}: ${e.stack?.split("\n").slice(0, 2).join(" / ") ?? e.message}`);
      }
    }
    report("turrets", problems, `${N} of one kind on ${biggest.name}, ms a step of ${SIM_BUDGET_MS.toFixed(1)} — ${line.join(" · ")}`);
  }

  // ENEMIES: every body kind, ten thousand of it alone, scattered over the
  // field and every one of them in reach of a core that cannot fall — so
  // every gun on the field is firing from the first step. The boss is a
  // hundred, not ten thousand: a body that wide could not land ten
  // thousand times on any map, and a hundred is more than a run ever sees.
  // Then the roster mixed, which is the board a wave actually is.
  if (wants("enemies")) {
    const problems = [], line = [];
    const BOSSES = 100;
    const one = (name, spawn) => {
      try {
        const r = isolated({
          world: biggest,
          build: (sim) => {
            sim.setBench({ unitRange: EVERYWHERE, coreHp: IMMORTAL });
            return { want: 0, ...spawn(sim) };
          },
        });
        line.push(`${name} ${ms1(r.step)}${r.info.made < r.info.want * 0.9 ? ` (${r.info.made} fit)` : ""}`);
        tick("enemies", `${name}: ${r.info.made} stood, ${ms1(r.step)}ms a step (p95 ${ms1(r.p95)}) — ${r.why}`);
        if (r.info.made < r.info.want * 0.1) problems.push(`${name}: the field took only ${r.info.made} of ${r.info.want}`);
        if (r.sim.lost()) problems.push(`${name}: the core fell — its pool was meant to be bottomless`);
        if (r.slow) { problems.push(`${name}: ${r.slow}`); for (const l of r.table) problems.push(`    ${l}`); }
      } catch (e) {
        problems.push(`${name}: ${e.stack?.split("\n").slice(0, 2).join(" / ") ?? e.message}`);
      }
    };
    for (const kind of L.UNIT_KINDS.filter(kindOk)) {
      const want = kind === "boss" ? BOSSES : N;
      one(kind, (sim) => ({ want, made: sim.spawnMany(kind, want, { scatter: true }) }));
    }
    if (kindOk("mixed")) one("mixed", (sim) => ({ want: N, made: spawnMixed(sim, N, { scatter: true }) }));
    report("enemies", problems, `${N} of one kind on ${biggest.name}, ms a step of ${SIM_BUDGET_MS.toFixed(1)} — ${line.join(" · ")}`);
  }

  // SWARM FIRST: ten thousand bodies on the field before a single turret,
  // then the board spammed down under them, a card's worth a step for the
  // whole window — the placement path (a batch, the specs re-composed, the
  // aim index, the ground claimed) timed WITH the swarm already in reach
  // of everything it lays down, which is the panic-build a late run does.
  // Under the real save and a bottomless purse, so what goes down is what
  // a player's card puts down: its mods rolled, its rungs composed.
  if (wants("swarmfirst")) {
    const problems = [];
    let detail = "";
    try {
      reseed(67);
      const SR = R("simreport.js");
      const spec = { ...LA.specForTier(biggest, LA.RUNG_COUNT - 1), script: [] };
      const sim = new Sim(spec);
      sim.setTech(TR.techStateFor(60));
      sim.setRich(true);
          sim.setBench({ coreHp: IMMORTAL });
      const made = spawnMixed(sim, N, { scatter: true });
      for (let f = 0; f < ISO_WARM; f++) sim.update(1 / 60);
      const CARD = 300;
      sim.profile(true);
      const ms = [];
      for (let f = 0; f < ISO_SAMPLE; f++) {
        const a = performance.now();
        if (sim.towers.length < N) sim.scatterTowers(T.FIELDED_KINDS, Math.min(N, sim.towers.length + CARD));
        sim.update(1 / 60);
        ms.push(performance.now() - a);
      }
      const p = sim.profileFull();
      sim.profile(false);
      ms.sort((a, b) => a - b);
      const step = ms[ms.length >> 1], p95 = ms[Math.floor(ms.length * 0.95)];
      if (made < N * 0.9) problems.push(`the field took only ${made} of ${N} bodies`);
      if (sim.placed === 0) problems.push("nothing was placed in the window");
      if (step > SIM_BUDGET_MS) {
        problems.push(`a step with a card on it takes ${step.toFixed(1)}ms (p95 ${p95.toFixed(1)}) of ${SIM_BUDGET_MS.toFixed(1)}`);
        for (const l of SR.profileLines(p).slice(5, 9)) problems.push(`    ${l}`);
      }
      detail = `${made} bodies first, then ${sim.placed} turrets down at ${CARD} a step, ${sim.towers.length} standing, ` +
        `${sim.kills} kills — ${step.toFixed(1)}ms a step (p95 ${p95.toFixed(1)}) of ${SIM_BUDGET_MS.toFixed(1)}`;
    } catch (e) {
      problems.push(e.stack?.split("\n").slice(0, 3).join(" / ") ?? e.message);
    }
    tick("swarmfirst", detail);
    report("swarmfirst", problems, detail);
  }

  // UPGRADES: the siege — the board, the modules, the swarm killing turrets
  // — under a hundred random upgrade nodes off the real trees, rather than
  // the save's own rungs. A rung changes what a turret IS (its bullet, its
  // reach, its reload), and a hundred of them at once is a table no save
  // composes, which is the point of rolling it. The trees hold fewer than
  // a hundred today, so today this is every node there is, in a random
  // order; the number is the standard's, and the report says how many lit.
  if (wants("upgrades")) {
    const UP = R("upgrades.js");
    const UPGRADE_NODES = 100;
    reseed(71);
    const tech = TR.techStateFor(60);
    const pool = UP.ALL_UPGRADES.slice(), on = new Set();
    for (let i = 0; i < UPGRADE_NODES && pool.length > 0; i++)
      on.add(pool.splice((Math.random() * pool.length) | 0, 1)[0].id);
    const upgrades = {};
    for (const k of Object.keys(UP.TURRET_UPGRADES))
      upgrades[k] = UP.TURRET_UPGRADES[k].map((u) => (on.has(u.id) ? 1 : 0));
    const r = siege({ world: biggest, seed: 73, tech: { ...tech, upgrades } });
    tick("upgrades", r.detail);
    report("upgrades", r.problems, `${on.size} random upgrade nodes on — ${r.detail}`);
  }

  // RENDER: the other half of the frame. The same boards, stood in a real
  // Game in a headless browser (scripts/bench.mjs, which owns the goal and
  // the scenes), and the draw read at a ladder of zooms from the whole map
  // down to the closest. Its JSON is the gate; its table is printed under
  // the line so the numbers are here without re-running it.
  if (wants("render")) {
    const problems = [];
    let detail = "";
    const r = await run(process.execPath, [
      path.join(ROOT, "scripts", "bench.mjs"), "--json", "--world", biggest.id, "--n", String(N),
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
