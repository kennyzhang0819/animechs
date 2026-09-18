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
  { "kind": "buffTower", "x": 420, "y": 100, "opts": { "tower": "goad", "waves": "2-7" } },
  { "kind": "railgun",   "x": 411, "y":  79, "opts": { "wave": 1 } },
  { "kind": "road",      "x": -59, "y": 488, "pts": [[-59,488],[55,488],[216,327]],
    "opts": { "name": "the south line" } }
]
```

`x`/`y` are the **top-left cell** of the footprint, like a beacon's. `opts`
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
   `terrain.marks` into whatever the mission needs; `Sim.runCrossers` spends
   the buff towers' list as trains go out.
3. Add what an author can get wrong to the `worlds` stage of
   `scripts/check.mjs` — the editor cannot see the mission spec, so "this
   tower rises on a train that never comes" is caught there and nowhere else.

The loader (`maps.ts marksOf`) drops a mark naming a kind this build does
not have and fills a missing field from its default, so a document from a
branch with an extra kind still loads.

## What is on the board today: the buff towers

Two of them, on the intercept map. Both are **mission assets** — no wave may
send one (`UNIT_TREES`, `objective: true`) — and both are bolted down
(`Sim.plantUnit`), unarmed, and four tiles square.

| | | |
|---|---|---|
| **Goad** | `goad` | the train runs **1.5x** faster (`GOAD_SPEED_MUL`) |
| **Bastion** | `bastion` | the train takes **50% less** damage (`BASTION_CUT`) |

Neither has a health pool to give away and neither shoots.

**A MARK IS A SPOT, NOT A RISE.** `waves` names every train wave that spot
puts a tower up on — `"2-7"`, `"2,4,6"`, `"2-3,6"`. A spot whose tower is
**still standing does nothing**; a spot whose tower the board knocked down
raises a fresh one on its next wave. So what an author places is a piece of
ground the swarm keeps re-taking, and what the board buys by killing a tower
is the waves until the next one. It is never topped up and never stacked.

**Every tower rising on one wave is the same tower** (`pylonRamp`): health
rides the wave it rose on, so wave 6's are tougher than wave 4's and a
player reads the difficulty off the wave number. The curve is 1.28 a wave —
deliberately gentler than the train's own `WORM_RAMP_GROWTH`, because a
Borer is one body shot for four minutes and a tower has to be knocked down
*again* between trains; a curve that steep goes from "kill it each time" to
"never kill it again" inside two waves.

**They rise on a train wave, not on a clock.** Every other schedule in the
game is absolute seconds; this one is the launch index of
`InterceptMission.pattern`, because that is what an author is actually
thinking about — *the second train comes in under a Goad*. The spare counts
as the wave after the pattern's last, so `"2-7"` covers it without naming
it. A jump (`skipToTime`) walks the same loop, so a rise the jump passed
over happens at once, like every launch it passed over.

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
A tower in rock is an authoring mistake, and `npm run check` says so.

## Authoring them

`/admin` → the map → the **Mission** group in the palette. A click stamps
one; a click on a standing one selects it and its fields appear in the left
panel; the eraser takes one off. `waves` is a text field: type `2-7`.

Coldline ships three spots, which is the whole of its starting config —
one holding from train 2, a second joining at 4, a third at 6 (the spare).
That is one Goad up for trains 2-3, two towers for 4-5, and three from 6 on,
provided the board leaves them standing. The **Mission marks** layer hides them and
puts them out of reach of every tool, like the beacons.

Each block is drawn in its kind's ink with its fields printed under it, so
"goad, train 2" is readable off the map without clicking every square —
which is the thing being authored.

Two marks may not overlap, and the save route refuses a document with an
unknown kind or an off-board mark: the loader would drop it anyway, but a
bad mark written into the repo file looks authored and quietly does nothing.

## The kinds

**`buffTower`** — the Goad and the Bastion the swarm plants on an intercept
map. Which of the two, and every train wave the spot puts one up on.

**`railgun`** — one emplacement on a raze map (`game/levels.ts`
`RazeMission`), on the cell it was placed on, and which of the four
sections it rises in. **Every gun is placed.** The ring the sim used to
spread a count of guns round a post is gone: where a gun stands is a
decision about cover and approach, so it is a mark, and how many rise is
how many you drew.

**`garrison`** — a circle of ground the swarm holds, and what holds it:
the waves it is manned on, how far it reaches, and how many Bulwarks and
Lances stand in it. **It belongs to no mission.** This began as the guard
over a railgun battery and is not that any more — a garrison is a fact
about a PLACE, there is a force dug in here and it will not follow you
home, and every board has places worth denying. So it is offered on every
map whatever the mission is playing, and the emplacements it used to be
bolted to are their own marks.

The radius is the leash `Sim.garrisonUnit` holds every body raised there
to, and the circle the board rings, so what an author sets is exactly what
a player can see. Like a buff tower it is **a spot, not a rise**: a
garrison still standing does nothing on its later waves, and one that has
been cleared is manned again on the next wave it names — so `1` is ground
you take once and `1-40` is ground the swarm keeps coming back for.

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
starts is not a fact about the ground. A garrison is not on that clock at
all: it mans on WAVES, like a buff tower, because the waves are the one
schedule every map has.

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
