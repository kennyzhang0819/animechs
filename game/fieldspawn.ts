/**
 * HOW THE ROUTE SOLVER'S THREAD IS STARTED — on its own line, on purpose.
 *
 * `new Worker(new URL("./field.worker.ts", import.meta.url))` is the one
 * spelling the bundler recognises and turns into a chunk, and `import.meta`
 * is also the one thing the headless tools' CommonJS transpile of the sim
 * cannot carry (scripts/check.mjs). So it lives here, imported only by the
 * page (workerhost.ts), which spawns the thread and hands the sim a line
 * to it; the sim's own module graph never mentions it, and node never
 * sees it.
 */
export const spawnFieldWorker = (): Worker =>
  new Worker(new URL("./field.worker.ts", import.meta.url), { type: "module" });

/** ...and the crowd shove's thread (phys.worker.ts), on the same terms */
export const spawnPhysWorker = (): Worker =>
  new Worker(new URL("./phys.worker.ts", import.meta.url), { type: "module" });
