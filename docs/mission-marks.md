# Mission marks

**The things a mission needs placed on a map, authored in the map editor.**

A mission has two halves. The **schedule** — how many, how often, in what
order — is the mission spec in `game/levels.ts`, written in code and read by
a designer in one block. The **geometry** — where on this particular ground
each thing stands — is a fact about the terrain, and it has always lived
beside it: `ROAD_SPECS` and `POST_SPECS` in `game/missions.ts`, keyed by map
id so a line and the rock it was fitted to cannot drift apart.

Marks are the third thing: geometry an **author places by hand, in the
editor, on the map document**. `game/missionMarks.ts` is the registry, and
it is the only place that knows both what a mark is and which missions care.

## Why the editor and not a table in code

`ROAD_SPECS` is two lines on one map. Buff towers are a handful per map that
an author wants to move, retune and re-place while looking at the ground —
which is what an editor is for and what a source table is not. And the
alternative does not exist: `app/api/levels` accepts one document, the
campaign's wave script, and refuses everything else, so a mission spec is
not writable from the UI at all. The map document is the only thing an
author can save, so that is where a placed thing goes.

## The shape

A mark in `public/maps/<id>.json`:

```jsonc
"marks": [
  { "kind": "buffTower", "x": 420, "y": 100, "opts": {} },
  { "kind": "railgun",   "x": 411, "y":  79, "opts": { "wave": 1 } },
  { "kind": "road",      "x": -59, "y": 488, "pts": [[-59,488],[55,488],[216,327]],
    "opts": { "name": "the south line" } }
]
```

`x`/`y` are the **top-left cell** of the footprint. `opts`
is whatever that kind's fields say, and nothing else.

A **path** kind carries `pts` as well — its corners, in cells, entry first
and exit last — and keeps `x`/`y` on the first of them so every reader that
only wants a place still has one.

A `MarkKind` (`game/missionMarks.ts`) declares:

| | |
|---|---|
| `id` / `label` | what it is called, on disk and in the palette |
| `missions` | which mission kinds understand it |
| `geom` | `point` (one footprint at `x`/`y`) or `path` (a polyline in `pts`) |
| `size` | footprint in cells, square — a path's is the size of the handle on each corner |
| `color` | the ink it is drawn in, in the editor |
| `pad` | cells of metal decking laid round it, so the ground reads as prepared |
| `radiusField` | the int field, if any, that is a radius in cells: the editor rings it, so a region set as a number is one you can see the size of |
| `fields` | the editable numbers and choices — **this is what builds the panel** |

`fields` is the part that matters. The editor renders a control per field
off `kind`/`min`/`max`/`choices`, so **a new mission's furniture is an entry
in this registry and costs no UI**. That is the whole design: the editor
does not know what a buff tower is.

## Adding a kind

1. Add a `MarkKind` to `MARK_KINDS`. It appears in the editor's **Mission**
   palette group and gets a field panel, with no other edit.
2. Read it in the sim where that mission's clock runs. `Sim.reset` copies
   `terrain.marks` into whatever the mission needs; `Sim.runCrossers` rolls
   the buff tower schedule into the spots as trains go out.
3. Add what an author can get wrong to the `worlds` stage of
   `scripts/check.mjs` — the editor cannot see the mission spec, so "this
   pylon table asks for more towers than the map has spots" is caught there.

The loader (`maps.ts marksOf`) drops a mark naming a kind this build does
not have and fills a missing field from its default, so a document from a
branch with an extra kind still loads.

## What is on the board today: the buff towers

Two of them, on the intercept map. Both are **mission assets** — no wave may
send one (`UNIT_TREES`, `objective: true`) — and both are bolted down
(`Sim.plantUnit`), unarmed, and four tiles square.

| | | |
|---|---|---|
| **Goad** | `goad` | the train runs **2x** faster (`GOAD_SPEED_MUL`) |
| **Bastion** | `bastion` | the train takes **50% less** damage (`BASTION_CUT`) |

Neither has a health pool to give away and neither shoots.

**A MARK IS A SPOT.** It carries nothing but a position: which tower rises
on it, and on which train, is **rolled per run** from the mission's own
schedule (`InterceptMission.pylons`, `Sim.raiseMarkTowers`). An author draws
the ground a tower may stand on; the mission's table decides the hand.

This reverses an earlier design in which a mark named its own tower and
train. That version bought repeatability — train 3 came in under exactly the
towers drawn for train 3 — at the cost of putting the escalation in seven
separate places on the map instead of one table. The roll is back, and the
table is where the difficulty is now read and tuned.

**Draw more spots than the schedule asks for.** The roll takes free spots at
random and simply sends nothing where none is left, so a map with too few
spots is a map whose late trains come in under fewer towers than the table
says. That is not an error — `npm run check` prints it as a `note` and the
mission plays quieter.

**They accumulate.** A tower is up from the train it rose on until the board
kills it, and the two buffs **stack by multiplying** — so a run that answers
none of them meets the last train under all of them. That is the mission:
clearing the road is not a side errand the intercept offers, it is the bill.
The table's rows are **new arrivals, not a standing total**. Coldline's:

| train | rises | standing, if the board kills none |
|---|---|---|
| 1 | — | — |
| 2 | 1 Goad | 1G — trains run 2x |
| 3 | 1 Bastion | 1G 1B — 2x, half the damage lands |
| 4 | 1 Goad, 1 Bastion | 2G 2B — 4x, a quarter lands |
| 5 | 2 Goads, 1 Bastion | 4G 3B — 16x, an eighth lands |
| 6 | 2 Goads, 2 Bastions | 6G 5B |
| 7 | 2 Goads, 3 Bastions | 8G 8B |
| 8 (the spare) | 2 Goads, 4 Bastions | 10G 12B |

The map draws seven spots today, so everything past the seventh tower is
dropped and the run tops out at 7 standing. Paint more spots to reach the
table.

**Every tower rising on one wave is the same tower** (`pylonRamp`): health
rides the wave it rose on, so wave 6's are tougher than wave 4's and a
player reads the difficulty off the wave number. The curve is 1.28 a wave —
deliberately gentler than the train's own `WORM_RAMP_GROWTH`, because a
Borer is one body shot for four minutes and a tower has to be knocked down
*again* between trains; a curve that steep goes from "kill it each time" to
"never kill it again" inside two waves.

**They rise on a train wave, not on a clock.** Every other schedule in the
game is absolute seconds; this one is the launch index of
`InterceptMission.pattern`, and the pylon table is indexed the same way —
row 2 is what the second train comes in under. The spare is the train after
the pattern's last and takes the table's last row. A jump (`skipToTime`)
walks the same loop, so a rise the jump passed over happens at once, like
every launch it passed over.

**They stack by multiplying** (`Sim.goadMul`, `Sim.bastionCut`). Two
Bastions at half off each leave a quarter of the damage getting through, and
ten never reach zero — so ringing a road with towers is a hard mission,
never an unkillable one. Both are read off the alive census every tick
rather than stored, so a tower the board takes down stops counting the same
tick and there is no clock to expire.

**The ground under them is decked** (`MarkKind.pad`, drawn in
`Renderer.rebuildTerrain`). It is not gated on the mark layer: the mark is
an authoring note a match never draws, but the plating is *ground*, and the
point of it is that a player sees the three places the swarm keeps
re-taking before anything has risen on them.

**Nothing walks them clear.** A raze section is rung round a post by the sim
and may land on a boulder, so it searches for open ground; a buff tower was
put on a cell by a person looking at the map, and moving it "for them" would
mean the thing they placed and the thing that rose are in different places.
A spot in rock is an authoring mistake, and `npm run check` says so.

## Authoring them

`/admin` → the map → the **Mission** group in the palette. A click stamps
one; the eraser takes one off. There is nothing to set on a buff tower —
the only decision is where, and how many. A railgun has one dial, the
section it rises in, and it is printed on the map.

**Draw more spots than the table asks for.** What sizes a map is the
mission's own pylon table — how many towers are standing at the last train
and what a run has to do to thin them — and the spots are only the ground
that can hold them. A spot the roll never reaches costs nothing; a table row
the map cannot pay for is silently quieter, and `npm run check` notes it.
The **Mission marks** layer hides them and puts them out of reach of every
tool.

Each block is drawn in its kind's ink with its fields printed under it. A
buff tower spot has no fields, so it is a bare square — what it will hold is
the mission's business, not the map's.

Two marks may not overlap, and the save route refuses a document with an
unknown kind or an off-board mark: the loader would drop it anyway, but a
bad mark written into the repo file looks authored and quietly does nothing.

## The kinds

**`buffTower`** — one Goad or one Bastion on an intercept map: which of
the two, where it stands, and which train it is up for. Nothing rolled.

**`railgun`** — one emplacement on a raze map (`game/levels.ts`
`RazeMission`), on the cell it was placed on, and which of the four
sections it rises in. **Every gun is placed.** The ring the sim used to
spread a count of guns round a post is gone: where a gun stands is a
decision about cover and approach, so it is a mark, and how many rise is
how many you drew.

**`fabricator`** — one house that keeps sending one tier of the swarm. It
belongs to **no mission**: any map may carry one, in any number, and the
sim reads them off the map whatever the objective is (`Sim.runFabricators`).
Three dials, all on the mark:

| | |
|---|---|
| **Tier** | T1 to T5 — which body rises (`fabricator1`..`fabricator5`) and so its footprint: 1, 2, 3, 4 and 6 tiles. The face says the tier too (`game/fabricatorArt.ts`): a square, a plaque, a bare skull, a skull with its jaw, a horned skull |
| **Rate** | Slow, Medium, Fast, Extra fast — seconds between batches (`FABRICATOR_RATES`: 45, 30, 20, 12) |
| **Spawns at** | the wave it rises on |

What a house sends is **its tier of the run's own families**: each batch
picks one of the families the script deals and lands that family's body
of the house's tier on open ground round it. The batch shrinks up the
ladder (`FABRICATOR_BATCH`: 6, 4, 3, 2, 1) so a runt house is a trickle and
an apex house is an apex every so often. The bodies are booked under wave
0, like a Borer's pieces, so no wave is held open waiting for one to die
and no wave pays XP for it; the scrap is real. A house is bolted down,
unarmed, and comes back for nothing once the board kills it. The swatch
carries the tier — one per T — so the block on the map is the size the
run will put down. Nothing is placed on any map today.

**Spawns at** is the one field every rising thing shares: the railgun's
section, the fabricator's wave. The number is a count on the kind's own
clock, and the label is the same so the panel reads the same. (The buff
tower has no rise field while it is a rolled spot.)

**`road`** — the line a crosser walks (`game/missions.ts`): the Borers'
lines on an intercept map, the convoy's on an escort one. Its corners are
`pts` on the mark, and the marks' order is the roads' order, because a
mission names a road by index (`InterceptMission.pattern`). See **Drawing a
road** below.

These are the kinds that supply a mission's geometry *and* its counts.
`missions.ts siegeFromMarks` turns the railgun marks into the emplacements
and one section per rising, and `levelWithMarks` puts those sections on
the level — on **both sides of the seam** (`Sim.reset` and
`simreads.ts World`), because everything that counts the siege counts it
off `level.mission` (`levels.ts razeGuns`) and the two halves must agree.
`roadsFor` does the same for the lines. A map that carries none of them
falls back to `POST_SPECS` / `ROAD_SPECS` and the sections written in the
level — both of those tables are empty today.

Several railguns may name the **same section**: everything with that
number rises together, on the same tick of the mission's clock, so "five
guns on the third" is five marks and not a new field. The clock itself —
`first` and `every` — stays in the mission spec, because when a siege
starts is not a fact about the ground.

## Drawing a road

Pick **Road** in the Mission group, then click the map. The first click
starts a line; each one after it adds a corner; clicking the last corner
again, or pressing **Enter**, or picking another brush, finishes it.

- **Every leg is snapped to the eight-heading lattice** as you draw and as
  you drag (`editor.ts snapLattice`): a corner in the middle of a line is
  constrained from both sides, so the places it may stand are the
  intersections of a ray out of the corner before it with one out of the
  corner after — 64 pairs, less the parallel ones and the ones that meet on
  a half cell. Dragging cannot produce a line the loader would refuse.
- **Drag a corner** to move it. **Click a leg** to put a new corner in
  there. The **eraser** takes a corner off, and takes the whole road off
  once it is down to the two a line needs.
- **A road runs off the rim at both ends** (`missions.ts`), so its end
  corners are not clamped to the board — drag one past the edge and it
  stays there. Only the corners in between have to be on the map.
- The selected road prints its index and name at the entry, and anything
  the lattice refuses in red under it.

## Where this goes next

The escort's **halts** are still numbers in `game/levels.ts` — fractions of
the road the cart stops at. They are the obvious next mark: a `halt` kind
carrying a fraction, or a point snapped onto the road it belongs to, so the
place a cart stands and the ground defending it are drawn together. The
clocks stay in the mission spec either way: when a thing happens is not a
fact about the ground.
