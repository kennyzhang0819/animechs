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
  { "kind": "buffTower", "x": 420, "y": 100, "opts": { "unit": "goad", "wave": 2 } },
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
   `terrain.marks` into whatever the mission needs; `Sim.runCrossers` rolls
   the buff tower schedule into the spots as trains go out.
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
| **Goad** | `goad` | the train runs **2x** faster (`GOAD_SPEED_MUL`) |
| **Bastion** | `bastion` | the train takes **50% less** damage (`BASTION_CUT`) |

Neither has a health pool to give away and neither shoots.

**A MARK IS A TOWER.** It names which of the two it is and which train it
rises on, and **nothing about it is rolled** — train 3 comes in under
exactly the towers drawn for train 3, every run. An author who wants two
Bastions up for the last train draws two Bastions for the last train.

This replaces a die roll that shuffled a fixed hand into whichever spots
were free. The roll threw away the one thing the map was for: a tower's
**buff is global** (`Sim.goadMul`, `Sim.bastionCut` read the alive census,
so a Goad anywhere speeds every train), and what its *position* decides is
how far a run has to travel, and past what, to take it down. Two runs of
one map asked for different trips for no reason a player could see.

**They accumulate.** A tower is up from its train until the board kills it,
and the two buffs **stack by multiplying** — so a run that answers none of
them meets the last train under all of them. That is the mission: clearing
the road is not a side errand the intercept offers, it is the bill. An
author sizing a map counts the **standing total at the last train**, not
the towers on any one of them. Coldline's seven, as authored:

| train | rises | standing, if the board kills none |
|---|---|---|
| 2 | Goad | 1 Goad — trains run 2x |
| 3 | Goad | 2 Goads — 4x |
| 4 | Bastion | 2G 1B — 4x, half the damage lands |
| 5 | Goad | 3G 1B — 8x |
| 6 (the spare) | Goad, 2 Bastions | 4G 3B — 16x, an eighth of the damage lands |

The marks are ordered by how far each stands from the nearest road, so the
early trains bring towers a board can answer cheaply and the last one
brings the trip.

**Every tower rising on one wave is the same tower** (`pylonRamp`): health
rides the wave it rose on, so wave 6's are tougher than wave 4's and a
player reads the difficulty off the wave number. It is the one thing about
a buff tower the map does not decide. The curve is 1.28 a wave —
deliberately gentler than the train's own `WORM_RAMP_GROWTH`, because a
Borer is one body shot for four minutes and a tower has to be knocked down
*again* between trains; a curve that steep goes from "kill it each time" to
"never kill it again" inside two waves.

**They rise on a train wave, not on a clock.** Every other schedule in the
game is absolute seconds; this one is the launch index of
`InterceptMission.pattern` — *the second train comes in under a Goad*. The
spare counts as the train after the pattern's last, so a mark drawn for it
names that number. `npm run check` says so if a tower is drawn for a train
the pattern never launches. A jump (`skipToTime`) walks the same loop, so a
rise the jump passed over happens at once, like every launch it passed
over.

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
one; the eraser takes one off. There is nothing to set on a buff tower —
the only decision is where, and how many. A garrison has two dials, its
range and its level, and both are printed on the map.

**Count the standing total, not the hand.** There is no hand any more —
every mark is a tower that comes up and stays up — so what sizes a map is
how many are on the board at the last train and what a run has to do to
thin them. The **Mission marks** layer hides them and puts them out of
reach of every tool, like the beacons.

Each block is drawn in its kind's ink with its fields printed under it, so
"goad, train 2" is readable off the map without clicking every square —
which is the thing being authored.

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

**`garrison`** — a circle of ground the swarm holds, how far it reaches,
and one number saying how hard (**What mans one**, above). Its default
range is 44 cells, and it lays **no decking**: a garrison is a circle, and
the square of prepared ground it used to wear promised that something
would stand on exactly those four by four cells when nothing ever does
(`MarkKind.pad` 0 now means none, which is what the field always said). **It belongs to no mission.** This began as the guard
over a railgun battery and is not that any more — a garrison is a fact
about a PLACE, there is a force dug in here and it will not follow you
home, and every board has places worth denying. So it is offered on every
map whatever the mission is playing, and the emplacements it used to be
bolted to are their own marks.

**Every garrison is standing at mission start, and none of them is ever
manned again** (`Sim.manGarrisons`, called from `Sim.reset`). There is no
schedule on the mark and no wave list to set. A garrison is not something
that arrives — it is ground the swarm already holds when the run opens —
so **clearing one is permanent**, and what a board pays to take a post it
pays once. The mark carried a wave list until this; it made a dug-in
force into a respawn, and a player who had paid for a post watched it come
back on a countdown the board never showed them.

The radius is the leash `Sim.garrisonUnit` holds every body raised there
to, and the circle the board rings while anything is still holding it, so
what an author sets is exactly what a player can see. Once a circle is
cleared the board stops drawing it: an empty ring would be a promise about
something that is never coming.

### What mans one

**One number does** — `Level`, 1 to 5 (`levels.ts GARRISON_LEVELS`). A
rung names a fixed count of ordinary swarm, and it is a table rather than
five fields on the mark because a roster is numbers an author has to
balance against each other every time they place one, and the answer is
the same every time. What placing a garrison is a decision about is
**where** and **how hard**.

| level | what stands there |
|---|---|
| **1** | 10 T2, 5 T3 |
| **2** | 20 T3 |
| **3** | 20 T3, 10 T4 |
| **4** | 20 T4, 5 T5 |
| **5** | 10 T4, 20 T5 |

Every rung is strictly heavier than the one under it, on both terms —
weight and tier. 1 and 2 are a mass of the family's light bodies, 3 is
where its T4 arrives, 5 is twenty apexes behind a T4 screen.

**It is ordinary swarm and nothing else.** The Wardens used to be the
spine of every rung and they are **enemy turrets** now (see `emplacement`
below) — a thing an author stands on a cell, not a thing that comes with
a circle. An author who wants a gun over that ground puts a gun over it.

**Which family fills the tiers is not authored and cannot be**: the run
rolls **one family per circle** out of the hand this deploy was dealt
(`LevelSpec.families`, `Sim.garrisonFamilies`), at reset, and keeps it for
the whole run. So a level 3 is a Tusker post one run and a Kettle post the
next, and a board with three garrisons on it is three different problems.
One family a circle: a circle never mixes.

A garrison body is spawned **outside the wave count**: it belongs to no
wave, it never walks at the core, and clearing it never clears a wave. It
does carry the run's own enemy level — a T3 dug in on a Nemesis board is
a Nemesis T3.

**Held is read off the leash, not off the kind.** A circle is ringed while
something posted to it is still alive (`Sim.garrisonHeldMask`, across the
seam as one bit per mark). A kind test would be lit by the first wave that
walked through.

**`emplacement`** — one of the swarm's own turrets, standing where you put
it. It belongs to no mission, it is up from mission start, and it never
moves. Pick which of the four:

| | footprint | pool | plating | reach | what it does |
|---|---|---|---|---|---|
| **Lance** | 3x3 | 17,000 | 14 | 25t | One armour-cutting beam, every 0.75s |
| **Bulwark** | 3x3 | 25,000 | 104 | 15t | A ram — 1,500 twice a swing with splash, three times a second |
| **Halberd** | 4x4 | 55,000 | 115 | 29t | **Four beams at once**, every 0.9s, from behind a 9,000-point force field |
| **Juggernaut** | 6x6 | 200,000 | 150 | 41t | **Six homing missiles a volley out of the sponsons down both flanks**, three volleys a second |

**The yardstick is the autocannon** at 24 tiles. Three of the four sit
around it and the Juggernaut reaches half again as far — it is the one
that is supposed to make you come to it rather than the other way round.
They used to reach 60 to 75 tiles, which made every one of them a gun you
fought from off-screen.

**They hit hard and they hit often.** Every cycle is under a second and the
damage is a multiple of what the bodies carried.

**One palette, one muzzle, one hit.** Every gun fires `ShootBig`, lands
`BlastExplosion` and throws `GARRISON_SHOT` — red (255,77,94) over the
bore's near-black (20,9,12). The two that fire a beam use a garrison laser
style in the same pair rather than piercer's blue, which was the one thing
on those machines still wearing somebody else's colour. So a round in the
air over your line is the garrison's before you have worked out which of
them fired it.

**The Halberd carries a force field** — the same one the swarm's bodies
carry, drawn by the same pass (`Renderer.drawForceFields`), and the only
turret in the game with one. It is a hard gate and not a share: while any
shield is left nothing reaches the building, and the hit that breaks it is
spent on the shield rather than carried through. Seven seconds after it
breaks it is back whole.

**The Juggernaut fires out of its flanks.** `barrels` walks the muzzle
across six points down the sponsons, so a volley leaves the sides of the
hull rather than one hole up the middle.

**They wear no accent.** The railgun carries the swarm's crimson because it
is a body a mission plants and you have to pick it out of a crowd; these
four are turrets standing on turret plates, read by silhouette and plate
like every other building. Nothing tints them either — `renderer.ts` skips
the crux multiply for `ENEMY_ONLY_KINDS`, and `status.ts` never flags one
as **Taken**, because nothing was.

These four were the **Wardens** — the bodies a garrison used to be manned
with. They were already turrets in everything but bookkeeping, so they are
turrets: same drawings, same pools, same plating, same weapons, standing
still. Their stats live in `constants.ts TOWERS` with every other turret's
and they are `ENEMY_ONLY_KINDS` (`game/types.ts`), which keeps them out of
`FIELDED_KINDS` — nothing deals one, the build card never offers one, and
no run can buy one.

**It lays no decking.** The plated ground belongs to the two marks that
promise something will rise on a cell *later* — the railgun its section is
due on, the buff tower its train — so a board reads the promise before
anything stands there. A turret is up from the first frame and is its own
announcement.

**It owns its cells but not the path.** Nothing may be built over one and
shots collide with it, but the swarm's routes run straight through the
square it stands on. That is the rule every building of the swarm's is
under (`Sim.conquerTower` says why): its own bodies will not shoot it, so
a wall they cannot pass and will not break is a wall they would stand at
forever — and a map is exactly where that would get authored by accident.

**Your guns shoot it mid-wave.** A turret takes the nearest thing in its
range and does not care what kind of thing it is — a body, a dome, a gun
of the swarm's. So a line standing over an emplacement fights it, and a
line with the wave closer fights the wave (`Sim.updateTowers`).

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
starts is not a fact about the ground. A garrison is on no clock at
all: every one a map carries is standing before the first frame.

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
