/**
 * THE SIM, ON ITS OWN THREAD.
 *
 * This is the other end of workerhost.ts: it builds a Sim from the spec
 * it is sent, steps it on its own clock, and publishes the world back —
 * the flat half by reference over shared memory (handed across once, at
 * "ready"), the object half as a snapshot and a report once a tick.
 *
 * WHY IT OWNS THE CLOCK. The frame loop on the other side is the
 * display's rate, and nothing here should depend on it: a 144Hz monitor
 * and a 30Hz one both get sixty steps a second because the steps are
 * taken HERE, off this thread's own real time, by the same SimClock the
 * local host uses. The main thread says only whether the world should be
 * moving. A step that runs long delays the next tick and the clock's
 * cap forfeits what cannot be caught up — exactly as the frame loop did —
 * and the drawing side, which never waits on any of this, keeps drawing
 * the last published frame at full rate meanwhile.
 *
 * WHAT IT LOADS ITSELF. The sim reads the map document, the wave script
 * and the balance sheet off module state (maps.ts, levels.ts, balance.ts),
 * and module state does not cross a thread — so this fetches its own
 * copies, the same files the page fetched, before the sim is built. The
 * ONE map the level plays on and nothing else: the rest of the atlas of
 * maps is the deploy screen's business.
 *
 * A COMMAND IS A METHOD NAME AND ITS ARGUMENTS, checked against the list
 * below before it is called: the message channel is same-origin and the
 * only sender is workerhost.ts, but a dispatcher that calls whatever it
 * is told is the wrong shape to leave lying around.
 *
 * The whole arrangement of threads, and what crosses between them, is
 * written down in docs/threads.md.
 */
import { Sim } from "./sim";
import { SimClock } from "./simclock";
import { emptySnapshot, flatOf, packSnapshot, type Snapshot } from "./snapshot";
import { reportOf, writeHeader } from "./simreport";
import { loadBalanceDoc } from "./balance";
import { loadLevelDocs, type LevelSpec } from "./levels";
import { OFFICIAL_MAP_IDS, refreshMap } from "./maps";
import { ADMIN_ENABLED } from "./env";
import type { FromWorker, ToWorker } from "./workerhost";

/** the commands the host may send, by name — SimHost's, and nothing else */
const COMMANDS = new Set<string>([
  "reset",
  "skipToTime",
  "placeFormation",
  "placeTower",
  "placeMany",
  "placeLine",
  "placeRuler",
  "sellTowerAt",
  "sellLine",
  "sellSelected",
  "structsInRect",
  "clearStructSelection",
  "click",
  "spend",
  "takeMod",
  "takeRelic",
  "setTech",
  "setRich",
  "setEffects",
  "profile",
  // the bench's three (Sim.setBench) — the perf suite's, never the game's
  "setBench",
  "spawnMany",
  "scatterTowers",
]);

// `self` here is a DedicatedWorkerGlobalScope; the project's lib is the
// DOM's, whose `self` is a Window, so the two calls this needs are typed
// by hand rather than by pulling the webworker lib in beside it
const port = self as unknown as {
  postMessage(m: FromWorker): void;
  addEventListener(t: "message", h: (e: { data: ToWorker }) => void): void;
};
const post = (m: FromWorker): void => port.postMessage(m);

let sim: Sim | null = null;
const clock = new SimClock();
/** should the world be moving — the main thread's pause and menu */
let running = false;
let last = 0;
let timer: ReturnType<typeof setTimeout> | 0 = 0;
/**
 * TWO SNAPSHOTS, ALTERNATING. The one just published is being read on
 * the other side while the next tick packs into the other. (The flat
 * arrays are read live and may tear by a step's motion — see shared.ts
 * for why that is accepted.)
 *
 * WHAT THIS BUYS IS ONE TICK OF SLACK AND NOT MORE: about 33ms, after
 * which the rotation comes back round and a buffer is repacked whether
 * the other side has finished with it or not — and a frame that draws a
 * full board goes over 33ms. Everything packed here survives that, being
 * fixed-width rows a reader cannot misalign on: the worst a lap costs is
 * a frame's motion on some of the picture, which is what the flat arrays
 * cost anyway. The ONE thing that did not survive it has been taken off
 * shared memory entirely and crosses as a copy — snapshot.ts `fitOwn`,
 * which is worth reading before anything variable-length is added here.
 */
const snaps: [Snapshot, Snapshot] = [emptySnapshot(), emptySnapshot()];
let flip = 0;
/** the spec table version the host last received (simreport.ts) */
let specsSent = -1;

/** one tick of the worker's own clock: step what is owed, then publish */
function tick(): void {
  timer = 0;
  if (!sim) return;
  const s = sim;
  const now = performance.now();
  const dt = (now - last) / 1000;
  last = now;
  // a lost game freezes mid-carnage, until the retry resets it (LocalHost
  // makes the same call, and for the same reason)
  clock.advance(dt, running && !s.lost(), (d) => s.update(d));
  publish();
  schedule();
}

/**
 * The next tick, sixty a second measured from the last one — so a step
 * that ran long is followed sooner, and the accumulator sees real time
 * either way. Ticks run while paused too: a command that changes what is
 * shown (a selection, a purchase) is published by the next one.
 */
function schedule(): void {
  if (timer || !sim) return;
  timer = setTimeout(tick, Math.max(0, 1000 / 60 - (performance.now() - last)));
}

/** the world, as of now, to the other side */
function publish(): void {
  if (!sim) return;
  writeHeader(sim);
  flip ^= 1;
  const snapshot = packSnapshot(sim, snaps[flip], true);
  const report = reportOf(sim, specsSent);
  if (report.specs) specsSent = sim.specsVersion;
  post({ t: "frame", snapshot, report });
}

async function init(spec: LevelSpec, field: MessagePort | null, phys: MessagePort | null): Promise<void> {
  await Promise.all([
    refreshMap(spec.map ?? OFFICIAL_MAP_IDS[0]),
    loadLevelDocs(),
    loadBalanceDoc(),
  ]);
  // ...talking to the route solver down the line the page handed over —
  // the page spawned that thread too (workerhost.ts, docs/threads.md)
  const s = new Sim(spec, field, phys);
  sim = s;
  // the debug handle on THIS side of the seam, for devtools' worker scope
  // (`__sim.n`), the way window.__animechs is on the other. A module's own
  // `sim` is not reachable from an evaluate; a property on the global is.
  // Dev builds only, as the page's handle is
  if (ADMIN_ENABLED) (self as unknown as Record<string, unknown>).__sim = s;
  writeHeader(s);
  post({
    t: "ready",
    flat: flatOf(s),
    header: s.header,
    bStart: s.bStart,
    bUnits: s.bUnits,
    isGoal: s.field.isGoal,
    occupied: s.occupied,
    waterlogged: s.waterloggedMask(),
    airRoutes: s.airRoutes(),
  });
  last = performance.now();
  publish();
  schedule();
}

port.addEventListener("message", (e) => {
  const m = e.data;
  switch (m.t) {
    case "init":
      init(m.spec, m.field, m.phys).catch((err: unknown) => post({ t: "error", message: String(err) }));
      break;
    case "run":
      running = m.on;
      break;
    case "cmd": {
      if (!sim || !COMMANDS.has(m.m)) return;
      const target = sim as unknown as Record<string, (...a: unknown[]) => unknown>;
      target[m.m](...m.a);
      break;
    }
  }
});
