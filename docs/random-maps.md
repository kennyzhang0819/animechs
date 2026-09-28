# Random maps

Every regular run is played on a board drawn at start. `game/mapgen.ts` is
`scripts/maps/mapgen.mjs` ported into the game — the same pipeline
(`authoring-maps.md`), the same checks — with `randomSpec(seed)` rolling
the forty-odd numbers an author would otherwise write, and one departure:
**no rim**. The authoring script biases the rock noise toward wall near
the board's edge and silts the outer rows; here the edge is whatever the
noise makes it, so open floor and sea run off the board wherever they
reach it, and a side is a mountain only when the roll made it one. The authored maps are still in `public/maps/` and still generated
by their spec files; in the game they are **the bank** (`BANK_WORLDS` in
`game/levels.ts`), pickable by name in custom mode and never rolled.

## What a roll decides

On the authored 256 board, scaled onto the 512 grid by `scaleSpec` like
every spec:

- **A biome** — one of ten (`BIOMES`): meadow, salt pan, tundra,
  badlands, ashfall, caldera, shallows, jungle, spore field and crystal
  barrens. Each names its floor families with their rock, its beach and
  flats floors, its forest fringe, its water and its ruin count, and owns
  one prop family (`props.md`, "The roster"). The families are the
  game's own (`docs/terrain-directions.md`); the fourth batch of floors
  and rock was painted for the last five biomes. The shallows hold the
  water high and nearly all of it shallow, so the ground bodies wade.
- **A second biome**, on every board, drawn from the first's `kin` (a
  meadow carries jungle or badlands, a tundra crystal barrens, and so
  on) over a fifth to two fifths of the board. Where it lies is a slow
  warped noise cut at that share; across the band round the cut the two
  biomes interfinger on a fine noise rather than meeting at a line, so a
  meadow runs out into jungle in tongues and patches.
- **A third biome**, one board in three, kin of the first or the second
  and neither of them, over a tenth to a fifth of the board on a noise
  of its own, laid over the other two. A board never carries more than
  three (`FAMILY_SETS`, `props.md`). A cell reads its own biome for its
  floor family, its rock, its beach and flats, its fringe forest and its
  props; the sites, the water and the name are the first biome's.
- **A shape** — one of six archetypes (`ARCHETYPES`), rolled apart from
  the biome: highlands (rooms and lanes through thick rock, the board as
  it was), canyons (rock everywhere, fine and twisting), plains (open
  ground with rock in lumps), isles (the sea everywhere, the land in
  islands), crater (one great bowl round the core) and warren (a fine
  maze of small rooms). The archetype sets the rock threshold and
  feature size, the room count and size, the core room, the links,
  holes and lumps, the water level and the floor patch size. Two boards
  of different shapes are different places; two of one shape still
  differ in their biomes, doors and rooms. The name is a biome word and,
  half the time, the shape's noun.
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
  biome's ruins.
- **The props** (`props.md`): each biome's forest on its rock fringe, its
  thickets, stones, wrecks and litter on the open ground, clear of every
  lane the checks measure.

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

## The seal and the spawn layer

**The rock cap.** No more than `ROCK_CAP` (35%) of the land — every cell
that is not deep water — is rock, whatever the archetype rolled: the
noise threshold is raised until at most `ROCK_CAP_RAW` (36%) of the board
is rock before the water is laid, and a board still over the cap after
the seal fails its check and is rerolled. The archetypes' thresholds are
a shape, not a share: the canyons stay fine and twisting, the highlands
keep their rooms, but each is cut back to a board the walkers can cross.
The floor of it is `rock for towers`, which still wants a hill to build on.

**Rock in the water.** Rock that clears the threshold by `SEA_ROCK` keeps
its head above the water: stacks in the sea, islands in a lake. The water
routes are carved through whatever stands in their way, so a channel is
never shut by one.

**The seal.** No pocket survives. Every water body that is not the sea
is drained (a deep cell to rock, a shallow one to ground), and every
walkable cell the core cannot reach is turned to rock — once before the
paint and once more after the ruins, whose walls can close a pocket the
first pass let through. A dropped body always has somewhere to go.

**The spawn layer** is written as tiles (`spawnTiles`), not circles, and
the terrain is left exactly as the noise drew it. From every cell of the
board's edge the generator looks inward, as deep as it takes, for the
first cell whose ground reaches the core through corridors at least
twelve cells wide (the walk mask opened at `SPAWN_CLEAR`, in the core's
piece of it), and takes it and the nine cells behind it (`SPAWN_DEPTH`);
water tiles the same way over the water mask. So on an open side the
door is the edge itself, behind a mountain it is the mountain's inner
foot. The door circles are NOT in the layer: they carve the routes and
clear or flood their discs, and that is all. The seal above is
what makes every such cell a real door: no pocket and no dead lake
survives it, so the first spawnable floor is always on the way to the
core. The
sim picks among the tiles at random (`Sim.spawnPads`), so a wave comes in
along every open stretch of the rim rather than through three or four
mouths. The `spawns` circles are still carried for the checks and the
outline. A door is never a hill and never a puddle: the ground doors are
cleared dry and the water doors flooded deep before the routes are
carved.
