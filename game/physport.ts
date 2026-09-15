/**
 * THE CROWD SHOVE ON ITS OWN THREAD — the sim's side of it.
 *
 * Mindustry runs its PhysicsProcess asynchronously: the world steps, the
 * physics thread resolves overlaps against the positions it last saw, and
 * the step after applies whatever it produced. This is that arrangement
 * over shared memory. The kernel (physkernel.ts) reads the bodies' own
 * arrays — position, velocity, radius, layer, kind — straight out of the
 * sim's shared memory, builds a hash of its own, and writes a
 * DISPLACEMENT per body into one of two result buffers.
 *
 * THE CLOCK. At the end of every tick the sim writes the body count and
 * the tick number into a control word and notifies (`kick`). The worker
 * sleeps on that word (Atomics.wait — allowed on a worker, never on the
 * page, which is why the sim on the page also only ever notifies), runs
 * the kernel over the positions as they stand, and writes the tick number
 * it finished into a second word. At the next tick's physics phase the sim
 * reads that word (`take`): a result for the tick it just finished is
 * exactly what the in-thread kernel would have computed — the positions
 * have not moved between the end of one tick and the start of the next —
 * and one tick older is applied too, a step's staleness on a pile that
 * relaxes over many steps anyway. EACH RESULT IS APPLIED ONCE: a tick
 * with nothing new (the worker still busy, or a catch-up burst of three
 * steps back to back that gives it no gap) runs the kernel in the sim's
 * own thread instead, so a body is shoved every tick whatever the worker
 * is doing. That is the rule that makes a slow sim correct: when steps
 * run back to back the worker's answer is always the one from two ticks
 * ago, and it is applied, once, every tick.
 *
 * (The first cut accepted only the newest tick's result and skipped the
 * tick otherwise. On a fast board that was fine; on a late wave, where
 * the step outruns the frame and the steps run back to back, the answer
 * was always one tick "too old", nothing was ever applied, and the swarm
 * stacked. Never again: a miss is a tick shoved in-thread.)
 *
 * A worker that answers nothing for PHYS_MISS_MAX ticks in a row, or that
 * has thrown (CTRL_DEAD), is dropped: `alive` goes false and the sim lets
 * go of the port and shoves in-thread from then on.
 *
 * TWO BUFFERS, so the buffer being read is never the one being written:
 * the worker writes buffer `tick & 1` and the sim reads whichever `done`
 * names, which is at most one behind — the other one.
 *
 * SLOTS MOVE UNDER THE WORKER: a body removed between the kernel's read
 * and the sim's apply swaps another into its index. So the worker records
 * the uid it computed each slot for, and a slot whose uid has changed
 * takes no shove. The squeeze scratch carries the partner's uid for the
 * same reason (Sim.mergeSqueezed) and needs no more.
 *
 * THE TABLES CROSS BY VALUE. hitbox.ts is built from loaded documents and
 * the admin editor can bend it live, so the per-kind shape tables are
 * copied into shared memory on every kick — forty floats, nothing. The
 * live broad-phase reach per kind (Sim.kindSpanDyn) is shared outright.
 *
 * THE PAGE SPAWNS THE THREAD (fieldspawn.ts, workerhost.ts) and hands the
 * sim a line to it, as with the route solver: a worker spawning a worker
 * of its own does not load under the shell's isolation (fieldport.ts).
 * Where there is no line the sim runs the kernel in its own thread, and
 * the headless tools never see any of this.
 */
import * as shared from "./shared";
import { MAX_UNITS } from "./constants";
import { HB_A, HB_B, HB_OUTER, HB_OVAL } from "./hitbox";
import type { PhysIn, PhysOut, PhysTables } from "./physkernel";

/** control word slots (Int32, shared) */
export const CTRL_GO = 0;
export const CTRL_DONE = 1;
export const CTRL_N = 2;
/** non-zero once the worker has thrown — it will never answer again */
export const CTRL_DEAD = 3;
export const CTRL_LEN = 4;

/** ticks in a row with nothing new from the worker before it is given up on */
export const PHYS_MISS_MAX = 120;

/** one result buffer: the kernel's output plus the uid each slot was computed for */
export interface PhysBuf extends PhysOut {
  readonly uidAt: Int32Array;
}

/** what the worker is sent once, all of it over shared memory */
export interface PhysInit {
  readonly t: "init";
  readonly P: PhysIn;
  readonly tables: PhysTables;
  readonly ctrl: Int32Array;
  readonly bufs: readonly [PhysBuf, PhysBuf];
}

/** the least the sim needs of whatever is behind the seam: a Worker, or a MessagePort */
export interface PhysLink {
  postMessage(message: unknown): void;
}

const makeBuf = (): PhysBuf => ({
  shx: shared.f32(MAX_UNITS),
  shy: shared.f32(MAX_UNITS),
  sqzJ: shared.i32(MAX_UNITS),
  sqzU: shared.i32(MAX_UNITS),
  sqzD: shared.f32(MAX_UNITS),
  uidAt: shared.i32(MAX_UNITS),
});

export class PhysPort {
  private readonly ctrl = shared.i32(CTRL_LEN);
  private readonly bufs: readonly [PhysBuf, PhysBuf] = [makeBuf(), makeBuf()];
  private readonly tables: PhysTables;

  constructor(
    private readonly link: PhysLink,
    P: PhysIn,
    spanDyn: Int32Array,
    spanSDyn: Int32Array,
  ) {
    this.tables = {
      HB_A: shared.f32(HB_A.length),
      HB_B: shared.f32(HB_B.length),
      HB_OUTER: shared.f32(HB_OUTER.length),
      HB_OVAL: shared.u8(HB_OVAL.length),
      spanDyn,
      spanSDyn,
    };
    this.refreshTables();
    const m: PhysInit = { t: "init", P, tables: this.tables, ctrl: this.ctrl, bufs: this.bufs };
    link.postMessage(m);
  }

  private refreshTables(): void {
    const T = this.tables;
    T.HB_A.set(HB_A);
    T.HB_B.set(HB_B);
    T.HB_OUTER.set(HB_OUTER);
    T.HB_OVAL.set(HB_OVAL);
  }

  /** the tick is over: `n` bodies stand where they stand — resolve them */
  kick(n: number, tick: number): void {
    this.refreshTables();
    Atomics.store(this.ctrl, CTRL_N, n);
    Atomics.store(this.ctrl, CTRL_GO, tick);
    Atomics.notify(this.ctrl, CTRL_GO);
  }

  /** the tick whose result was last applied — never applied twice */
  private applied = 0;
  /** ticks in a row with nothing new */
  private misses = 0;
  private dead = false;

  /** still worth asking? false once it has thrown or gone quiet (PHYS_MISS_MAX) */
  get alive(): boolean {
    return !this.dead && this.misses < PHYS_MISS_MAX;
  }

  /**
   * The newest shove not yet applied — for the tick just ended, or the
   * one before — into `into`; slots computed for a body that has since
   * left get none. Returns false, and writes nothing, when there is
   * nothing new: the caller shoves in-thread for that tick.
   */
  take(tick: number, n: number, uid: Int32Array, into: PhysOut): boolean {
    if (Atomics.load(this.ctrl, CTRL_DEAD) !== 0) {
      this.dead = true;
      return false;
    }
    const done = Atomics.load(this.ctrl, CTRL_DONE);
    if (done === this.applied || done < tick - 2 || done > tick) {
      this.misses++;
      return false;
    }
    this.applied = done;
    this.misses = 0;
    const { shx, shy, sqzJ, sqzU, sqzD } = into;
    const b = this.bufs[done & 1];
    const { uidAt } = b;
    for (let i = 0; i < n; i++) {
      if (uidAt[i] === uid[i]) {
        shx[i] = b.shx[i];
        shy[i] = b.shy[i];
        sqzJ[i] = b.sqzJ[i];
        sqzU[i] = b.sqzU[i];
        sqzD[i] = b.sqzD[i];
      } else {
        shx[i] = 0;
        shy[i] = 0;
        sqzJ[i] = -1;
        sqzU[i] = -1;
        sqzD[i] = 0;
      }
    }
    return true;
  }

  /** the level is over; the page ends the thread itself */
  close(): void {
    (this.link as { close?: () => void }).close?.();
  }
}

/** a port down `link`, or null where there is no thread to talk to (node) */
export function makePhysPort(
  link: PhysLink | null | undefined,
  P: PhysIn,
  spanDyn: Int32Array,
  spanSDyn: Int32Array,
): PhysPort | null {
  if (!link || !shared.SHARED_MEMORY) return null;
  return new PhysPort(link, P, spanDyn, spanSDyn);
}
