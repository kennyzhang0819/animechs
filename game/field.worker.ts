/**
 * THE ROUTE SOLVER, ON ITS OWN THREAD — the other end of fieldport.ts.
 *
 * One FlowField, reused for every solve: the masks arrive, the whole
 * solve runs in one bite (nothing else lives on this thread to be kept
 * waiting), and the finished arrays go back transferred. The field then
 * gets fresh buffers for the next request, because a transferred buffer
 * is detached on this side.
 *
 * TWO WAYS TO BE SPOKEN TO. When the sim is on the page it holds this
 * worker directly and the requests arrive on `self`. When the sim is on
 * a worker of its own the page hands this one a MessagePort — the first
 * message, `{ port }` — and every request after that arrives on the
 * port and is answered on it. Either way the requests are answered in
 * the order they arrive, one at a time.
 *
 * No game state lives here — only masks in, headings out — so there is
 * nothing to reset and nothing to keep in step with the sim. See
 * docs/threads.md for where this sits among the other threads.
 */
import { FlowField } from "./flowfield";
import type { FieldReply, FieldRequest } from "./fieldport";

/** the first message when the sim is elsewhere: the line to it */
type Handshake = { port: MessagePort };

interface Line {
  postMessage(m: FieldReply, transfer: ArrayBufferLike[]): void;
}

const own = self as unknown as Line & {
  addEventListener(t: "message", h: (e: { data: FieldRequest | Handshake }) => void): void;
};

const field = new FlowField();

/** one solve, answered on the line it came in on */
function solve(m: FieldRequest, line: Line): void {
  field.setMasks(m.walk, m.soft, m.isGoal, m.spawn);
  field.compute();
  const r = field.takeResult();
  line.postMessage({ id: m.id, ...r }, [r.dist.buffer, r.dirX.buffer, r.dirY.buffer, r.clear.buffer]);
}

own.addEventListener("message", (e) => {
  const m = e.data;
  if ("port" in m) {
    const port = m.port;
    port.onmessage = (pe: MessageEvent<FieldRequest>) => solve(pe.data, port);
    return;
  }
  solve(m, own);
});
