/**
 * THE ARRAYS TWO THREADS CAN BOTH HOLD.
 *
 * Everything the drawing side reads off the world that is already a flat
 * number lives in one of these (see simview.ts — there are fifty-one of
 * them). Backed by a SharedArrayBuffer they are readable from the worker
 * the sim will run on AND from the thread that draws, with nothing copied
 * and nothing sent: the renderer takes its references once when the level
 * loads and reads the same memory for the rest of the run.
 *
 * WHERE SHARING IS NOT ON OFFER these fall back to ordinary arrays and
 * everything works exactly as it does today, single-threaded. That is not a
 * hypothetical: a SharedArrayBuffer needs a page served cross-origin
 * isolated (the COOP and COEP headers), which the Electron shell the game
 * SHIPS in gives for free and a bare `npm run dev:web` tab does not
 * necessarily. The same code has to run either way, so the decision is made
 * here, once, and nothing downstream asks again.
 *
 * ONE BUFFER PER ARRAY, rather than one arena carved into fifty-one. An
 * arena would pack better and save a few dozen object headers, and it would
 * cost a bump allocator, an alignment rule, and a total size that has to be
 * computed before the first array is declared and corrected every time one
 * is added. The arrays are declared as class fields and that is worth
 * keeping: `readonly upx = f32(MAX_UNITS)` says what it is, where it is,
 * without a layout table to hold in your head alongside it.
 *
 * NOTHING HERE MAKES A TEAR IMPOSSIBLE, and nothing is meant to. Once the
 * sim steps on another thread the drawing may read an array halfway through
 * a step and see some bodies moved and others not — a discrepancy of one
 * frame's motion, a few pixels, on some fraction of the swarm. Guarding
 * against it means double-buffering all fifty-one, which costs the memory
 * twice and a copy per frame to save an artefact nobody can see. The counts
 * are the part that has to be coherent, and those cross in the snapshot
 * message rather than through here.
 */

/**
 * Is shared memory available AND usable? The constructor existing is not
 * enough — a page that is not cross-origin isolated has the name in scope
 * and throws on `new`, so the only honest test is to build one.
 */
export const SHARED_MEMORY: boolean = (() => {
  try {
    if (typeof SharedArrayBuffer === "undefined") return false;
    new SharedArrayBuffer(8);
    return true;
  } catch {
    return false;
  }
})();

const buffer = (bytes: number): ArrayBufferLike =>
  SHARED_MEMORY ? new SharedArrayBuffer(bytes) : new ArrayBuffer(bytes);

/** a float array of `len`, on memory the other thread can read */
export const f32 = (len: number): Float32Array => new Float32Array(buffer(len * 4));
/** ...at double precision, for the few that need the bits */
export const f64 = (len: number): Float64Array => new Float64Array(buffer(len * 8));
/** ...and the small integer ones */
export const i32 = (len: number): Int32Array => new Int32Array(buffer(len * 4));
export const u8 = (len: number): Uint8Array => new Uint8Array(buffer(len));

/**
 * EVERY BUFFER BEHIND A WORLD'S SHARED ARRAYS, which is what gets handed to
 * the worker when the level loads. Collected by walking the object rather
 * than by keeping a list beside it, because a list beside it is a list that
 * goes stale the first time somebody adds an array.
 */
export function buffersOf(o: object): ArrayBufferLike[] {
  const out: ArrayBufferLike[] = [];
  const seen = new Set<ArrayBufferLike>();
  for (const v of Object.values(o)) {
    if (!ArrayBuffer.isView(v)) continue;
    const b = v.buffer;
    if (seen.has(b)) continue;
    seen.add(b);
    out.push(b);
  }
  return out;
}
