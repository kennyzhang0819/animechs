# Swarmfield

Tower-defense swarm prototype: flow-field pathfinding for up to 20,000 units,
WebGL2 instanced rendering, and 2x2 towers that block movement and reroute the
horde in real time.

## Run

```bash
npm install
npm run dev   # Next.js + Turbopack
```

## Architecture

- `game/constants.ts` — grid, map layout, tower/unit tuning
- `game/flowfield.ts` — grid occupancy + one Dijkstra pass from the core into a
  per-cell direction field; units sample it bilinearly (pathfinding is O(map),
  not O(units))
- `game/sim.ts` — units in struct-of-arrays typed arrays, counting-sort spatial
  hash (separation + projectile hits), towers, projectiles, effects
- `game/atlas.ts` — procedural sprite atlas; **swap any region for custom art**
  (units are white sprites tinted per instance, and already rotate to face
  their heading)
- `game/renderer.ts` — WebGL2 instanced sprites, two draw calls per frame
  (static terrain batch + one dynamic batch in painter's order)
- `game/game.ts` — rAF loop, input, 2d overlay (placement ghost), stats
- `components/Swarmfield.tsx` — React shell: HUD, unit-count switcher, canvases

`prototype/index.html` is the original single-file version this was ported from.

In dev builds the running `Game` instance is exposed as `window.__swarmfield`
for console poking.

## Performance notes

Measured on an M-series MacBook: ~2.4ms sim at 5k units, ~4.6ms at 10k, ~11ms
at 20k in full jam density; rendering stays under 1ms at any count. Next levers
when 20k needs locked 60fps: run separation every other frame per unit, then
move the sim to a Web Worker with SharedArrayBuffer.
