# Random maps

Every regular run is played on a board drawn at start. `game/mapgen.ts` is
`scripts/maps/mapgen.mjs` ported into the game — the same pipeline, step
for step (`authoring-maps.md`), the same checks — with one thing added:
`randomSpec(seed)` rolls the forty-odd numbers an author would otherwise
write. The authored maps are still in `public/maps/` and still generated
by their spec files; in the game they are **the bank** (`BANK_WORLDS` in
`game/levels.ts`), pickable by name in custom mode and never rolled.

## What a roll decides

On the authored 256 board, scaled onto the 512 grid by `scaleSpec` like
every spec:

- **A theme** — one of five floor palettes (desert, stone coast, spore
  swamp, snow, grassland), each with its wall pairs, beach and flats
  floors, forest kind and ruin count. The name is two words from the
  theme's lists.
- **The core**, anywhere in the middle band (64 to 192 on either axis).
  It is not walled in and names no funnel: the swarm comes from every
  side the doors are on.
- **Three to five ground doors** on the rim, on rays from the core spread
  at least 50 degrees apart (36, then 28 if the board is too tight), and
  only where the straight walk is at least 95 cells and at least 60% of
  the longest — so no door is a short cut. Each door gets its own route
  to the core through one clearing rolled 40 to 62% of the way along,
  brushed `[10, 17]` wide (30 to 51 cells on the grid).
- **Water**, in one of two shapes. Six times in ten a **sea** fills the
  edge the core is furthest from (and sometimes the next one), and two or
  three water doors stand on its shore. Otherwise two **rivers** come in
  from the rim, with one or two lakes far from the core. Either way every
  water door has a deep channel `[18, 26]` wide to **the bay**, a flooded
  room 28 to 36 cells out from the core, so the hulls share one sea and
  it lies against the base.
- **One or two more clearings**, up to four links between clearings 36
  to 110 apart, five to nine holes, eight to sixteen lumps, and the
  theme's ruins.

## What a roll is held to

The generator's own checks, run on every roll, with two dials turned:

- **Lanes are wider.** A random map wants a widest way through of **16
  on land and 20 at sea** (`routeMin`; authored maps ask 12 and 16),
  because a board nobody drew has no author to notice a lane the brush
  pinched. Nothing here names a choke, and the funnel rule does not
  apply: the approach to the core is as wide as the routes left it.
- **Walks may spread to 80%** (`spreadMax`; authored maps hold 50%),
  since a core rolled off-centre makes some rims further than others.

A roll the checks refuse — or that throws for want of room (a core in a
corner with no three far rims, a sea with no shore for a door) — is
rolled again from the next seed, up to twelve times
(`generateRandomMap`). About three rolls in four pass first time; the
throws cost nothing. The seed that passed is what the run reports, and
the same seed draws the same map, which is what makes a bug in a rolled
board reproducible.

## Where it runs

`Game.create` draws the map on the page thread, in the "map" load step
(one to three seconds on a laptop), registers it under `RANDOM_MAP_ID`
(`maps.ts setGeneratedMap`) and hands the document to the sim worker in
its init message — both threads must play one board, and the worker
cannot fetch a map that exists only in memory. `loadMap` and `refreshMap`
answer for the random id out of that slot. The seed rides the run's
`LevelSpec.mapSeed`, rolled on the deploy screen's Start.

`npm run check` draws one board from a fixed seed (`mapgen` line) and
constructs the swarm world on it, so the generator's rules are exercised
by the gate and a change to the pipeline that breaks a roll is caught
there rather than on the deploy screen.

## The spawn layer

The document the generator hands over carries `spawns` circles, and the
loader burns them down to tiles on load (`spawnTilesOf`): every ground
door is about 1,800 tiles of dry ground, every water door about 1,250 of
deep water, and the layers pick their own out of them as on any map. A
door is never a hill and never a puddle: the ground doors are cleared
dry and the water doors flooded deep before the routes are carved.
