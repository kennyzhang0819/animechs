/**
 * THE CROWD SHOVE'S THREAD. One kernel (physkernel.ts), one hash of its
 * own, and a loop that sleeps on the control word until the sim kicks it
 * (physport.ts for the whole arrangement, docs/threads.md for the map).
 *
 * The page spawns it and either sends the init itself (the sim on the
 * page) or hands over one end of a MessageChannel first, down which the
 * sim on its own worker sends the init. After the init the thread never
 * returns to its event loop: it is a `for(;;)` on Atomics.wait, and it
 * ends when the page terminates it with the level.
 */
import { HN, MAX_UNITS } from "./constants";
import { buildHash, runPhysics, type PhysIn, type PhysScratch } from "./physkernel";
import { CTRL_DEAD, CTRL_DONE, CTRL_GO, CTRL_N, type PhysInit } from "./physport";

/** the loop, and the flag that says it is over if the loop ever throws */
function run(m: PhysInit): never {
  try {
    loop(m);
  } catch (err) {
    // the sim sees this word and lets go of the port (PhysPort.alive);
    // the page's onerror logs the throw itself
    Atomics.store(m.ctrl, CTRL_DEAD, 1);
    throw err;
  }
}

function loop(m: PhysInit): never {
  const { ctrl, tables, bufs } = m;
  // a hash of this thread's own: the sim rebuilds its every tick under
  // any reader, and a bucket list read mid-sort is a wrong candidate list
  const bStart = new Int32Array(HN + 1);
  const bCount = new Int32Array(HN);
  const bUnits = new Int32Array(MAX_UNITS);
  const P: PhysIn = { ...m.P, bStart, bUnits };
  const S: PhysScratch = {
    phx: new Float32Array(MAX_UNITS),
    phy: new Float32Array(MAX_UNITS),
    uhx: new Float32Array(MAX_UNITS),
    uhy: new Float32Array(MAX_UNITS),
  };
  let seen = Atomics.load(ctrl, CTRL_GO);
  for (;;) {
    Atomics.wait(ctrl, CTRL_GO, seen);
    const go = Atomics.load(ctrl, CTRL_GO);
    if (go === seen) continue;
    seen = go;
    const n = Atomics.load(ctrl, CTRL_N);
    const out = bufs[go & 1];
    // which body each slot is being resolved for, so a slot that changes
    // hands before the sim applies the shove takes none (PhysPort.take)
    out.uidAt.set(P.uid.subarray(0, n));
    buildHash(P.upx, P.upy, n, bStart, bCount, bUnits);
    runPhysics(P, tables, S, out, n);
    Atomics.store(ctrl, CTRL_DONE, go);
  }
}

function handle(e: MessageEvent): void {
  const m = e.data as { port?: MessagePort } | PhysInit;
  if ("port" in m && m.port) {
    m.port.onmessage = handle;
    return;
  }
  if ((m as PhysInit).t === "init") run(m as PhysInit);
}

self.onmessage = handle;
