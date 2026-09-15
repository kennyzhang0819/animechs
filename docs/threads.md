# The threads

The game runs on four threads. Each one owns one job, and what crosses
between them is written down here so that nobody has to reconstruct it from
the code. Every thread degrades to the one before it: with no shared
memory the sim runs on the page, with no `Worker` at all the route solver
runs in slices on the sim and the crowd shove runs in the sim's own step —
and the game is the same game in every case.

```
 MAIN THREAD (the page)            SIM WORKER                  FIELD WORKER
 ─────────────────────             ──────────                  ────────────
 input, camera, HUD (React)        Sim.update() at 60Hz        FlowField.compute()
 Renderer (WebGL), overlays        on its own SimClock         one solve at a time
 Game, DrawView, World             packSnapshot / reportOf     no game state
 game/game.ts                      game/sim.worker.ts          game/field.worker.ts
 game/workerhost.ts  ──commands──▶ game/sim.ts   ──masks (copy)──▶
                    ◀──frames──── game/simhost.ts ◀──field (transfer)──  game/fieldport.ts
                    ◀═ shared memory (flat arrays, header) ═▶
      │                                 ▲   │                        PHYS WORKER
      │                                 │   └──kick (Atomics)──▶     ───────────
      │                                 │   ◀═ shove (shared) ═      physkernel.ts over
      │                                 │                            the bodies' arrays
      │                                 │                            game/phys.worker.ts
      └──── spawns all three; joins each to the sim with a MessageChannel ────┘
```

## Main thread — the picture and the hand

Owns the canvases, the input, the camera and the React HUD. Never waits on
another thread: `Game.frame` draws whatever world was last published and
sends commands without expecting an answer.

What it holds of the world (`game/simreads.ts`, `World`):

| kind | how it crosses | what |
|---|---|---|
| flat arrays | **by reference, shared memory** — taken once at level start | every per-body typed array the picture reads (`snapshot.ts` `FlatWorld`), the census, the effect pool, the spatial hash the build cursor tests bodies through |
| header | **by reference, shared memory** — one `Float64Array`, a slot a scalar | clock, body count, kills, scrap, wave, lost/won, the marked body (`simreport.ts` `HDR`) |
| snapshot | **a message a tick**, views over shared memory | the object half of the picture: turrets, domes, core, shots, bolt paths (`snapshot.ts`) |
| report | **a message a tick**, plain data | boss bars, turret census, shelf, inspect panel, the live spec table when it changed, the phase clock (`simreport.ts` `WorldReport`) |
| level constants | built here from the same map document | terrain, air routes, the hydrophobic mask |

Commands go the other way through `SimHost` (`game/simhost.ts`): every way
the game changes the world, as a method with plain arguments and **no
return value**. That is the rule that makes the seam crossable — a method
that answers is a method that cannot be sent. A click on the board is one
command (`Sim.click`) rather than the chain of questions it used to be.

The two implementations of `SimHost`:

- `LocalHost` — the sim in this thread. What the headless check and the
  playtest use, and the fallback where the page has no shared memory.
- `WorkerHost` (`game/workerhost.ts`) — the sim on the worker below.

`makeHost` (`workerhost.ts`) picks, once, at level start. The dev readout in
the corner says which you got: `sim · draw · bodies · worker|local`. In a
dev build `localStorage.animechsLocalSim = "1"` forces the local path so
the two can be compared on the same board.

## Sim worker — the world

`game/sim.worker.ts`. Builds the `Sim` from the level spec it is sent
(fetching its own copies of the map, the wave script and the balance
sheet — module state does not cross a thread), steps it on **its own
clock** (`game/simclock.ts`: sixty fixed steps a second, three of catch-up
at most, the rest forfeit — the same rule the frame loop used to apply),
and publishes once a tick.

The main thread tells it only whether the world should be moving (`run`).
A lost game freezes itself. Commands arrive as `{m: name, a: args}` and are
checked against a fixed list before being called.

**Tearing is accepted on the flat arrays** and deliberately not prevented:
the picture may read a body's position mid-step and see a step's motion of
discrepancy on some fraction of the swarm. The object half is
double-buffered so a turret or a shot is never half-written under the
reader; the counts cross in the message and are coherent by construction.
See `game/shared.ts` for the argument.

Debug handle: `__sim` in devtools' worker scope (dev builds). From outside
the shell, `scripts/probe.mjs` reaches the page — `__animechs.world` is
what the page can see of the sim, which is everything it publishes.

## Field worker — the routes

`game/field.worker.ts`, driven through `game/fieldport.ts`. A flow-field
solve (`game/flowfield.ts`: chamfer clearance, cost, multi-source Dijkstra,
eikonal sweep, gradient, doors) is ~100ms of work. On the sim thread it was
taken in 3ms slices — and on a late board, where a turret dies every few
tenths of a second and every death dirties the field, the slice was paid
every step.

Now the sim sends the masks — `walk`, `soft`, `isGoal`, the spawn mask —
**as a copy**, so the solve is over exactly one board (and the copy is
transferred, not cloned). The worker runs the whole solve in one bite and
sends back `dist`, `dirX`, `dirY`, `clear` and the spawn points,
**transferred** — four buffers change hands, nothing is copied. The sim
adopts them whole between two steps (`FlowField.adopt`), so no body ever
reads a heading from one solve against a distance from another. Until the
reply lands the swarm steers by the last finished field, exactly as under
the slices.

The sim's settle logic is unchanged (`Sim.solveDirtyFields`): a structure
change raises a flag; the flag becomes a request once the board has held
still for `FIELD_SETTLE` or been dirty for `FIELD_MAX_STALE`; a request in
flight is left to finish rather than thrown away (see `Sim.abortSolves`
for the six-minute stale-field bug that rule fixed). A reset abandons the
requests in flight; their replies are recognised by id and ignored.

**The page spawns it, never the sim.** The sim sees only a `FieldLink` —
postMessage and onmessage — and does not know what is behind it: the
worker itself when the sim is on the page, or one end of a
`MessageChannel` whose other end the page handed to the field worker when
the sim is on its own worker (`WorkerHost.create`). A worker spawning a
worker of its own was tried first and failed to load under the shell's
cross-origin isolation with no message to say why; two workers the page
owns, joined by a channel, have no such question in them. Both are ended
with the level (`WorkerHost.destroy`, `LocalHost.destroy`). In node there
is no `Worker`; the sim is built with no link and the slices remain —
which the headless tools want anyway, since they set the slice to
`Infinity` for reproducibility (`Sim.setFieldBudget`).

If the solver stops answering — a request unanswered for ten seconds —
`FieldPort.alive` goes false; the sim drops the port and the fields it was
waiting on start over in slices. A late route is a route; a route never
solved is a traffic jam.

## Physics worker — the crowd shove

`game/phys.worker.ts`, driven through `game/physport.ts`, running the
kernel in `game/physkernel.ts`. The pairwise shove (every same-layer pair
of overlapping circles pushed apart by mass, Mindustry's PhysicsWorld) is
the largest single phase of the step once the routes are off it, and
Mindustry's own answer is the one taken here: the physics runs
**asynchronously, against last tick's positions**, and the next tick
applies what it produced.

The kernel reads the bodies' own arrays — position, velocity, radius,
heading, layer, kind, uid — straight out of shared memory (every one of
them is a `shared.*` array on `Sim`), builds a spatial hash **of its
own** (the sim's is rebuilt every tick under any reader), and writes a
**displacement per body** into one of two shared result buffers, plus the
squeeze scratch (`Sim.mergeSqueezed`). Never a position: a displacement
computed against last tick's positions is still a displacement.

The handshake is two words of an `Int32Array` and `Atomics`:

- **kick** — at the end of every tick the sim writes the body count and
  the tick number and notifies. The worker sleeps on that word
  (`Atomics.wait`, which a worker may do and the page may not — the sim
  on the page therefore only ever notifies) and runs.
- **take** — at the next tick's physics phase the sim reads the tick the
  worker last finished. The tick just ended is exactly what the in-thread
  kernel would have computed (nothing moves between the end of one tick
  and the start of the next); one tick older is applied too. **Each
  result is applied once**, and a tick with nothing new — the worker
  still busy, or a catch-up burst of three steps that leaves no gap to
  run in — **runs the kernel in the sim's own thread**, so every body is
  shoved every tick whatever the worker is doing. On a slow board, where
  the steps run back to back, the steady state is the answer from two
  ticks ago applied once per tick. (The first cut skipped the tick
  instead, and only ever accepted the newest result: fine on a fast
  board, and on a late wave every answer was one tick "too old", nothing
  was applied, and the swarm stacked.) A worker that has thrown, or gone
  quiet for two seconds, is let go of and the sim shoves in-thread from
  then on.

Two buffers, so the one being read is never the one being written: the
worker writes `tick & 1`, the sim reads whichever `done` names. Slots
move under the worker (a removal swaps another body into the index), so
the worker records the uid it computed each slot for and a slot whose uid
has changed takes nothing. The per-kind shape tables (`hitbox.ts`, loaded
from documents and bendable live by the admin editor) cross by value,
copied into shared memory on every kick; the live broad-phase reach per
kind (`Sim.kindSpanDyn`) is shared outright, and the clearance maps the
sideways re-aim reads cross as `FlowField.clearShared`, a shared copy
refreshed whenever a solve is published or adopted (the field's own
`clear` is swapped and transferred and cannot be held across a thread).

**Only where there is a core for it.** With it the game runs four threads
of its own beside the browser's GPU process and compositor; on fewer than
six hardware threads (`navigator.hardwareConcurrency`,
`workerhost.ts physCores`) the thread is not spawned and the sim runs
the same kernel in its own step, as it always did. The page spawns it and
joins it to the sim over a `MessageChannel`, exactly as the solver
(above, and see `fieldport.ts` for why never the sim). In node there is
no thread and no shared memory; the kernel runs in-step.

**The thinking is sliced on the same footing** (`Sim.updateUnits`,
`THINK_STRIDE`): a body's steering decision — the field sample, the wall
probes, the drift, the lane centering, the doorway jitter — is taken once
every four ticks, staggered by index, or the tick it enters a new cell,
whichever comes first, and reused in between. The move is every tick:
velocity, wall slide, the clamp to the board, the turn toward the cached
aim. Not a thread, but the other half of what took the units phase down.

## What needs what

| | needs | without it |
|---|---|---|
| sim worker | cross-origin isolation → `SharedArrayBuffer` | sim on the page, one thread, as before |
| field worker | a `Worker` constructor on the sim's thread | slices on the sim's clock, as before |
| physics worker | shared memory, a `Worker`, and six hardware threads | the shove in the sim's own step, as before |

Cross-origin isolation is two headers (`Cross-Origin-Opener-Policy:
same-origin`, `Cross-Origin-Embedder-Policy: require-corp`). The dev server
sets them in `next.config.ts`; the desktop shell sets them on every
`app://game/` response in `desktop/src/serve.ts`. A page without them runs
— the readout says `local` and the console says why.

## Adding to the seam

- **A new per-body number the picture needs** — allocate it with
  `shared.f32`/`u8`/`i32` in `Sim`, add it to `UnitsView` (`simview.ts`),
  `FlatWorld`/`DrawView`/`FLAT_KEYS` (`snapshot.ts`). The compiler checks
  the key list against the type.
- **A new scalar the game reads** — a slot in `HDR` and a line in
  `writeHeader` (`simreport.ts`), a getter on `World`.
- **A new answer that is not a number** — a field on `WorldReport`,
  filled in `reportOf`. Plain data only.
- **A new way to change the world** — a method on `SimHost`, returning
  nothing; forward it in `LocalHost`, post it in `WorkerHost`, and add its
  name to `COMMANDS` in `sim.worker.ts`.
- **A new read of the sim from `Game`** — there is no such thing. `Game.sim`
  is null on the worker path; read through `Game.world`.
