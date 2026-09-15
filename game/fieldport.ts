/**
 * THE ROUTE SOLVER'S OWN THREAD, from the sim's side of it.
 *
 * A flow-field solve is ~100ms of raster passes, a Dijkstra and a sweep
 * (flowfield.ts). It used to be taken in slices on the sim's clock —
 * three milliseconds a step, FIELD_BUDGET_MS — and on a busy board that
 * slice was paid EVERY step: a late wave chews a turret off the line
 * several times a second, each one dirties the field, and the queue never
 * empties. Measured at 2.4ms of a 15ms step, the third-largest phase.
 *
 * So the solve goes to a thread of its own. The sim sends the masks as
 * they stand (a copy, so the solve is over ONE board and not a blend of
 * two — see Sim.abortSolves for why that used to matter), the worker
 * runs the whole solve in one bite because nothing else is waiting on
 * that thread, and the finished field comes back TRANSFERRED — the four
 * arrays change hands, nothing is copied — and is adopted whole between
 * two steps (FlowField.adopt). The swarm steers by the last finished
 * field until then, exactly as it did under the slices.
 *
 * WHO SPAWNS IT: THE PAGE, NEVER THE SIM. The sim only ever sees a
 * `FieldLink` — something with postMessage and onmessage — and does not
 * know whether that is the worker itself (the sim on the page,
 * LocalHost) or one end of a MessageChannel whose other end the page
 * handed to the field worker (the sim on its own worker, WorkerHost). A
 * worker spawning a worker of its own was tried first and failed to
 * load under the shell's cross-origin isolation with no message to say
 * why; a channel between two workers the page owns has no such question
 * in it. The headless tools have no Worker at all and keep the slices —
 * makeFieldPort answers null and nothing else changes. See
 * docs/threads.md for the whole picture.
 *
 * IF THE SOLVER STOPS ANSWERING the sim must not wait forever on a reply
 * that will never come — a route never solved is a traffic jam. A request
 * unanswered for REPLY_MS marks the port dead; the sim drops it and the
 * fields it was waiting on start over in slices (Sim.runSolveQueue). A
 * MessagePort cannot report the other side's death, so the clock is the
 * only detector there is, and it covers a hung solver too.
 */
import type { FlowField } from "./flowfield";

/** one solve, as the sim asks for it: the masks, copied */
export interface FieldRequest {
  id: number;
  walk: Uint8Array;
  soft: Uint8Array;
  isGoal: Uint8Array;
  /** where this layer may enter, or null for a field with no doors */
  spawn: Uint8Array | null;
}

/** ...and the finished field, as the worker hands it back */
export interface FieldReply {
  id: number;
  dist: Float32Array;
  dirX: Float32Array;
  dirY: Float32Array;
  clear: Float32Array;
  spawnPts: number[];
}

/**
 * The sim's end of the line to the solver: a Worker, or one end of a
 * MessageChannel. Both have exactly this shape.
 */
export interface FieldLink {
  postMessage(m: FieldRequest, transfer: Transferable[]): void;
  onmessage: ((e: MessageEvent<FieldReply>) => void) | null;
}

/**
 * How long a solve may go unanswered before the solver is given up on.
 * A solve is ~100ms; a hundred of them queued behind each other would
 * still answer inside this. Past it something is wrong, and slices are
 * better than waiting.
 */
const REPLY_MS = 10_000;

export class FieldPort {
  private next = 1;
  private readonly pending = new Map<number, FlowField>();
  private clock: ReturnType<typeof setTimeout> | null = null;
  /** false once the solver has stopped answering — the sim then solves in-thread again */
  alive = true;

  constructor(
    private readonly link: FieldLink,
    /** a field's solve has landed and been adopted — the sim's queue drops it */
    private readonly onDone: (field: FlowField) => void,
  ) {
    link.onmessage = (e) => {
      const field = this.pending.get(e.data.id);
      if (!field) return; // a reply to a solve that was abandoned (reset)
      this.pending.delete(e.data.id);
      this.rewind();
      field.adopt(e.data);
      this.onDone(field);
    };
  }

  /** ask for `field`'s solve; the reply lands in FlowField.adopt */
  request(field: FlowField): number {
    const id = this.next++;
    this.pending.set(id, field);
    this.rewind();
    const m = field.masks(id);
    // the copies were made for this and are handed over rather than cloned
    const transfer: Transferable[] = [m.walk.buffer, m.soft.buffer, m.isGoal.buffer];
    if (m.spawn) transfer.push(m.spawn.buffer);
    this.link.postMessage(m, transfer);
    return id;
  }

  /** the reply clock: running while anything is pending, reset by every reply */
  private rewind(): void {
    if (this.clock) clearTimeout(this.clock);
    this.clock = null;
    if (this.pending.size === 0) return;
    this.clock = setTimeout(() => {
      console.error(`field worker has not answered in ${REPLY_MS}ms; routing in-thread from here`);
      this.alive = false;
      this.pending.clear();
    }, REPLY_MS);
  }

  /** the level is over: stop listening, and stop waiting */
  close(): void {
    this.link.onmessage = null;
    this.pending.clear();
    this.rewind();
    this.alive = false;
  }
}

/**
 * THE ONE PLACE THE CHOICE IS MADE: a port over the link the caller has
 * (the page spawned the solver — workerhost.ts), null where there is none
 * — node, the headless check and the playtest, which need every solve
 * finished in the tick that queued it anyway; see Sim.setFieldBudget.
 * The sim treats null as "solve in slices, as before".
 */
export function makeFieldPort(
  link: FieldLink | null | undefined,
  onDone: (field: FlowField) => void,
): FieldPort | null {
  return link ? new FieldPort(link, onDone) : null;
}
