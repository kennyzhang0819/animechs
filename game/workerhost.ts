/**
 * THE SIM ON A WORKER, from the game's side of it.
 *
 * The same SimHost the local host implements (simhost.ts), with every
 * command put on a message instead of made as a call, and the world read
 * back the three ways the seam allows: the flat arrays by reference over
 * shared memory, the scalars off a shared header, and the object half as
 * a snapshot that arrives once a tick (sim.worker.ts).
 *
 * WHY. At seven thousand bodies a step costs fifteen milliseconds and the
 * frame has sixteen; on one thread the draw was paying for the sim, and a
 * slow wave read as a stuttering picture rather than a slow world. Off the
 * thread, the picture draws at the display's rate whatever the step costs,
 * and a sim that falls behind reads as motion a little slow — which is the
 * same work, felt completely differently.
 *
 * WHAT IT NEEDS. Shared memory (game/shared.ts SHARED_MEMORY), which the
 * page has only when it is cross-origin isolated — the dev server and the
 * shell both say so in their headers. `makeHost` below makes the choice
 * once, at level start, and falls back to the local host where the memory
 * is not on offer or the worker fails to come up; the game does not know
 * which it got.
 *
 * THE FRAME THAT ARRIVES IS TAKEN AT THE NEXT SYNC, not when it lands: the
 * message handler only keeps the latest, and the frame loop adopts it at
 * the one point it reads the world (Game.publish). Two frames landing
 * between two syncs means the older is dropped, which is right — the
 * picture wants the newest world, not every world.
 *
 * The whole arrangement of threads — this one, the sim's, the route
 * solver's — is written down in docs/threads.md.
 */
import { SHARED_MEMORY } from "./shared";
import { Sim } from "./sim";
import type { LevelSpec } from "./levels";
import type { ModId } from "./mods";
import type { RelicId } from "./relics";
import type { TechState } from "./tech";
import type { TowerKind } from "./types";
import { readPts, type FlatWorld, type Snapshot } from "./snapshot";
import type { WorldReport } from "./simreport";
import { World } from "./simreads";
import { LocalHost, type Cell, type Placement, type SimHost } from "./simhost";
import { spawnFieldWorker, spawnPhysWorker } from "./fieldspawn";

/** what the game sends the worker */
export type ToWorker =
  | {
      t: "init";
      spec: LevelSpec;
      /** the sim's end of the line to the route solver (fieldport.ts), or
       *  null to solve in slices */
      field: MessagePort | null;
      /** ...and to the crowd shove's thread (physport.ts), or null to shove in-thread */
      phys: MessagePort | null;
    }
  | { t: "run"; on: boolean }
  | { t: "cmd"; m: string; a: unknown[] };

/** ...and what comes back */
export type FromWorker =
  | {
      t: "ready";
      flat: FlatWorld;
      header: Float64Array;
      bStart: Int32Array;
      bUnits: Int32Array;
      isGoal: Uint8Array;
      occupied: Uint8Array;
      waterlogged: Uint8Array | null;
      powered: Uint8Array;
      beaconOn: Uint8Array;
      airRoutes: { pts: number[] }[];
    }
  | { t: "frame"; snapshot: Snapshot; report: WorldReport }
  | { t: "error"; message: string };

/** how long the worker gets to come up before the level falls back to one thread */
const READY_MS = 15_000;

export class WorkerHost implements SimHost {
  /** never in this thread — see SimHost.sim */
  readonly sim: Sim | null = null;
  readonly world: World;
  /** the newest frame to land since the last sync, if any */
  private latest: { snapshot: Snapshot; report: WorldReport } | null = null;
  /** what the worker was last told about whether to move; null = never told */
  private told: boolean | null = null;
  /**
   * THE BOLT PATHS, OWNED HERE. The one member of the flat world that is
   * not a typed array and so cannot be shared: it crosses packed in the
   * snapshot — on its own buffer, so the bytes are COPIED by the message
   * rather than re-viewed (snapshot.ts `fitOwn`) — and is unpacked into
   * this at every sync, and the renderer reads it through
   * `world.flat.fxPts` as it reads everything else.
   */
  private readonly pts: (readonly number[] | null)[];

  private constructor(
    private readonly worker: Worker,
    /** the route solver's thread, spawned here and ended here (docs/threads.md) */
    private readonly fieldWorker: Worker | null,
    /** ...and the crowd shove's, on the same terms */
    private readonly physWorker: Worker | null,
    level: LevelSpec,
    ready: Extract<FromWorker, { t: "ready" }>,
  ) {
    this.pts = new Array<readonly number[] | null>(ready.flat.fxPts.length).fill(null);
    (ready.flat as unknown as { fxPts: (readonly number[] | null)[] }).fxPts = this.pts;
    this.world = new World({
      level,
      flat: ready.flat,
      header: ready.header,
      bStart: ready.bStart,
      bUnits: ready.bUnits,
      isGoal: ready.isGoal,
      occupied: ready.occupied,
      waterlogged: ready.waterlogged,
      powered: ready.powered,
      beaconOn: ready.beaconOn,
      airRoutes: ready.airRoutes,
    });
    worker.onmessage = (e: MessageEvent<FromWorker>) => {
      const m = e.data;
      if (m.t === "frame") this.latest = m;
      else if (m.t === "error") console.error("sim worker:", m.message);
    };
  }

  /** stand the workers up and wait for the world; rejects if it cannot */
  static create(level: LevelSpec): Promise<WorkerHost> {
    return new Promise((resolve, reject) => {
      const worker = new Worker(new URL("./sim.worker.ts", import.meta.url), { type: "module" });
      // THE ROUTE SOLVER'S THREAD, spawned HERE and wired to the sim's
      // over a channel: a worker spawning its own worker fails to load
      // under the shell's isolation (see fieldport.ts), and a page that
      // owns every thread is simpler to reason about anyway. The solver
      // is optional — without it the sim solves in slices
      let fieldWorker: Worker | null = null;
      let field: MessagePort | null = null;
      try {
        fieldWorker = spawnFieldWorker();
        const channel = new MessageChannel();
        fieldWorker.postMessage({ port: channel.port1 }, [channel.port1]);
        fieldWorker.onerror = (e) =>
          console.error("field worker failed; the sim will route in-thread:", e.message);
        field = channel.port2;
      } catch (err) {
        console.warn("no field worker; the sim will route in-thread:", err);
      }
      // THE CROWD SHOVE'S THREAD, likewise — and only where there are
      // cores for it (physCores)
      let physWorker: Worker | null = null;
      let phys: MessagePort | null = null;
      if (physCores()) {
        try {
          physWorker = spawnPhysWorker();
          const channel = new MessageChannel();
          physWorker.postMessage({ port: channel.port1 }, [channel.port1]);
          physWorker.onerror = (e) =>
            console.error("physics worker failed; the sim will shove in-thread:", e.message);
          phys = channel.port2;
        } catch (err) {
          console.warn("no physics worker; the sim will shove in-thread:", err);
        }
      }
      const fail = (why: string): void => {
        clearTimeout(clock);
        worker.terminate();
        fieldWorker?.terminate();
        physWorker?.terminate();
        reject(new Error(why));
      };
      const clock = setTimeout(() => fail(`sim worker did not come up in ${READY_MS}ms`), READY_MS);
      worker.onerror = (e) => fail(e.message || "sim worker failed to load");
      worker.onmessage = (e: MessageEvent<FromWorker>) => {
        const m = e.data;
        if (m.t === "error") return fail(m.message);
        if (m.t !== "ready") return;
        clearTimeout(clock);
        worker.onerror = (err) => console.error("sim worker:", err.message);
        resolve(new WorkerHost(worker, fieldWorker, physWorker, level, m));
      };
      const transfer: Transferable[] = [];
      if (field) transfer.push(field);
      if (phys) transfer.push(phys);
      worker.postMessage({ t: "init", spec: level, field, phys } satisfies ToWorker, transfer);
    });
  }

  private send(m: ToWorker): void {
    this.worker.postMessage(m);
  }
  private cmd(m: string, ...a: unknown[]): void {
    this.send({ t: "cmd", m, a });
  }

  advance(_dt: number, run: boolean): void {
    // the clock is the worker's; this side only says whether it should be
    // moving, and only when that changes
    if (run === this.told) return;
    this.told = run;
    this.send({ t: "run", on: run });
  }
  sync(): void {
    const f = this.latest;
    if (!f) return;
    this.latest = null;
    readPts(f.snapshot, this.pts);
    this.world.take(f.snapshot, f.report);
  }
  reset(): void {
    this.cmd("reset");
  }
  skipToTime(seconds: number): void {
    this.cmd("skipToTime", seconds);
  }
  placeFormation(cells: readonly Cell[], kind: TowerKind): void {
    this.cmd("placeFormation", cells, kind);
  }
  placeTower(gx: number, gy: number, kind: TowerKind): void {
    this.cmd("placeTower", gx, gy, kind);
  }
  setBeaconOn(i: number): void {
    this.cmd("setBeaconOn", i);
  }
  placeMany(towers: readonly Placement[]): void {
    this.cmd("placeMany", towers);
  }
  placeLine(x0: number, y0: number, x1: number, y1: number, kind: TowerKind): void {
    this.cmd("placeLine", x0, y0, x1, y1, kind);
  }
  placeRuler(x0: number, y0: number, x1: number, y1: number, kind: TowerKind): void {
    this.cmd("placeRuler", x0, y0, x1, y1, kind);
  }
  sellTowerAt(x: number, y: number): void {
    this.cmd("sellTowerAt", x, y);
  }
  sellLine(x0: number, y0: number, x1: number, y1: number): void {
    this.cmd("sellLine", x0, y0, x1, y1);
  }
  sellSelected(): void {
    this.cmd("sellSelected");
  }
  structsInRect(x0: number, y0: number, x1: number, y1: number, add: boolean): void {
    this.cmd("structsInRect", x0, y0, x1, y1, add);
  }
  clearStructSelection(): void {
    this.cmd("clearStructSelection");
  }
  click(x: number, y: number, add: boolean, like: boolean): void {
    this.cmd("click", x, y, add, like);
  }
  spend(n: number): void {
    this.cmd("spend", n);
  }
  takeMod(id: ModId): void {
    this.cmd("takeMod", id);
  }
  takeRelic(id: RelicId): void {
    this.cmd("takeRelic", id);
  }
  setTech(tech: TechState | null): void {
    this.cmd("setTech", tech);
  }
  setRich(on: boolean): void {
    this.cmd("setRich", on);
  }
  setEffects(on: boolean): void {
    this.cmd("setEffects", on);
  }
  profile(on: boolean): void {
    this.cmd("profile", on);
  }
  destroy(): void {
    this.worker.terminate();
    this.fieldWorker?.terminate();
    this.physWorker?.terminate();
  }
}

/**
 * IS THERE A CORE FOR THE CROWD SHOVE? The game runs four threads of its
 * own with it (page, sim, solver, shove) beside the browser's GPU process
 * and compositor; on fewer than six hardware threads the fourth is
 * preempting the draw rather than helping it, and the sim shoves
 * in-thread as it always did. Unknown counts are taken as enough.
 */
const PHYS_MIN_CORES = 6;
export function physCores(): boolean {
  const c = typeof navigator !== "undefined" ? navigator.hardwareConcurrency : 0;
  return !c || c >= PHYS_MIN_CORES;
}

/**
 * THE ONE PLACE THE CHOICE IS MADE. A worker where the page can share
 * memory and the worker comes up; the sim in this thread otherwise. The
 * fallback is loud in the console and silent in the game, which is the
 * right way round: the game is the same game either way, and the console
 * is where "why is this slower than yesterday" gets answered.
 *
 * `local` forces the fallback — the dev switch behind the perf readout,
 * so the two can be measured against each other on the same board.
 */
export async function makeHost(level: LevelSpec, local = false): Promise<SimHost> {
  if (!local && SHARED_MEMORY && typeof Worker === "function") {
    try {
      return await WorkerHost.create(level);
    } catch (err) {
      console.warn("sim worker unavailable, stepping the sim on this thread:", err);
    }
  } else if (!local) {
    console.warn(
      "no shared memory on this page (not cross-origin isolated); stepping the sim on this thread",
    );
  }
  // the sim on the page holds the solver's worker directly, and lets it
  // go with the level (LocalHost.destroy) — and the shove's, on the same terms
  let field: Worker | null = null;
  try {
    field = spawnFieldWorker();
    field.onerror = (e) => console.error("field worker failed; routing in-thread:", e.message);
  } catch (err) {
    console.warn("no field worker; routing in-thread:", err);
  }
  let phys: Worker | null = null;
  if (SHARED_MEMORY && physCores()) {
    try {
      phys = spawnPhysWorker();
      phys.onerror = (e) => console.error("physics worker failed; shoving in-thread:", e.message);
    } catch (err) {
      console.warn("no physics worker; shoving in-thread:", err);
    }
  }
  return new LocalHost(new Sim(level, field, phys), field, phys);
}
