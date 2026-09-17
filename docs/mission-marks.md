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
  { "kind": "buffTower", "x": 420, "y": 100, "opts": { "tower": "goad",    "waves": "2-7" } },
  { "kind": "buffTower", "x":  83, "y": 338, "opts": { "tower": "bastion", "waves": "4-7" } }
]
```

`x`/`y` are the **top-left cell** of the footprint, like a beacon's. `opts`
is whatever that kind's fields say, and nothing else.

A `MarkKind` (`game/missionMarks.ts`) declares:

| | |
|---|---|
| `id` / `label` | what it is called, on disk and in the palette |
| `missions` | which mission kinds understand it |
| `size` | footprint in cells, square |
| `color` | the ink it is drawn in, in the editor |
| `pad` | cells of metal decking laid round it, so the ground reads as prepared |
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

## Where this goes next

The two road missions' geometry is still in `game/missions.ts`: Coldline's
Borer lines and Thornway's rail path and halts. They are the obvious next
marks — a `road` kind with a polyline geom and the lattice rule as its
validation, a `halt` kind carrying a fraction of a road — and the registry
is shaped for them (`MarkGeom` is a union with one member today for exactly
that reason). Moving them is a migration of two working missions and is
deliberately not bundled with the towers.
