# Authoring maps

The checklist is `map-rules.md`; this is the reasoning behind it.

A map is a JSON document in `public/maps/`, listed by id in
`OFFICIAL_MAP_IDS` (`game/maps.ts`). A world claims one by name in
`WORLDS[].map` (`game/levels.ts`); a map no world claims still opens in the
editor and is playable by nothing. `/admin` has both doors — **Edit map**
for terrain, **Edit level** for the wave script.

**Every campaign map is generated, never drawn**, by a spec file in
`scripts/maps/` over the shared generator `scripts/maps/mindustry.mjs`:

```
node scripts/maps/confluence.mjs [public/maps/confluence.json] [preview.png]
```

It prints its numbers, writes a preview if asked, and **refuses to write
the document while a check fails**. RE-RUNNING IT OVERWRITES THE WHOLE
DOCUMENT: a hand edit in the map editor survives exactly until the next
run, so a change to a campaign map is a change to its spec.

## The size

**Every campaign map is 512x512 — twice Mindustry's Ground Zero.**
Mindustry has no single map size — its editor opens a new map at 200x200
and its Serpulo campaign runs from Desolate Rift's 110x400 to the
Planetary Terminal's 512x512 — and the two references this repository
imports whole, Ground Zero and Cratered Battleground, are 256x256, which
is the board every spec in `scripts/maps/` is **authored** on. The game
became a real-time strategy game played by expanding outward over
twenty-odd minutes, and a 256 board ran out of ground to expand into, so
the grid (`COLS`, `ROWS`) and `SIZE` in `mindustry.mjs` are 512 and
`scaleSpec` carries a spec across: positions and radii doubled
(`SCALE`), the ground lanes, links and chokes opened half as wide again
(`WIDEN`) and the clearings a quarter wider (`ROOM_WIDEN`), the noise
scales doubled so a rock lump keeps its proportion, the bias closures
called at authored coordinates. Author at 256; read the checks at 512.
A map is square, as every Mindustry map is.

## What makes a Mindustry map look right

The four references in `public/maps/` (Ground Zero, Frozen Forest,
Cratered Battleground, Biomass Synthesis Facility — imported by
`scripts/maps/import-msav.mjs`, in the editor and playable by nothing) and
a dozen more of Mindustry's own saves were read for this. What they have in
common, and what the generator is built to reproduce:

- **Nothing is geometric.** No arc, no disc, no ellipse, no lane of one
  width. Every edge is a noise contour: ragged, with two-cell notches and
  stray lumps, and no two stretches alike. The previous approach here —
  arcs of chosen radius, cosine-lobed blobs, a 21-cell lane everywhere —
  produced maps that read as drawings of maps. It is retired.
- **Most of the board is rock.** Open ground is 15% to 40% of a land map
  (Ground Zero 14%, Frozen Forest 33%, Stained Mountains 36%, Salt Flats
  49%); the rest is wall, forest and water. A map is rooms and corridors
  cut out of rock, not rock dropped onto a plain.
- **Rooms and corridors, of varying width.** Space is a network of
  clearings twenty to forty cells across joined by corridors that narrow
  and widen as they go — eight cells at a choke, sixteen or twenty in
  between — with bays and alcoves bitten into every edge and small rocks
  left standing in the open. A chokepoint is where a corridor happens to
  be thin, not a wall with a door in it.
- **More than one way through.** Rooms connect to more than one other
  room, and thin walls have holes in them, so part of a wave can take a
  side way. But the core sits in a pocket of rock with one mouth.
- **The wall is the floor's wall.** Two to four floor families in large
  noise patches with fuzzy edges, one of them dominant (55% to 80%), and
  the rock standing on each family is that family's own wall: sand wall
  over sand, dune wall over darksand, snow wall over snow, spore wall over
  moss. The biome reads from the floor; the rock is its floor a shade
  darker, and nothing outlines a road.
- **Water with a shore.** Lakes and seas from a slow noise, deep in the
  heart, shallow at the edge, and shallow is walkable ground — a road
  across a lake is a ford. A naval map is a coast: the sea along one or
  two edges, up to 60% of the board, with the core within gun reach of
  the water. Water is a shortcut for the naval line rather than the only
  ground it has — a naval tank crosses deep water AND land — so a map with
  no sea in it plays the naval factions perfectly well, at the pace of an
  army that has to drive.
- **Forests, clutter and ruins.** Pines in noise-shaped stands beside the
  floors they grow on (up to 40% of a forest map), boulders of the
  floor's own stone scattered thickest along the rock, bushes and spore
  clusters by family, and derelict buildings — rectangles of dark floor
  with broken walls — in the rooms.
- **One landmark.** A salt basin, a crater, a lake in the middle, a bay
  under the core. Every map has one thing the eye goes to.

## The pipeline

`mindustry.mjs` is Mindustry's `SerpuloPlanetGenerator`, step for step,
on this game's document shape:

1. **Rock from noise.** A domain-warped three-octave value noise, cut at
   a threshold, with the rim pushed up so the border is always rock.
   `rock.threshold` sets how much of the board is wall before anything is
   carved (lower is more rock); `scale` sets the size of the pockets and
   `warp` how far the contour is pushed around.
2. **Water** from a second, slower noise plus a per-map `bias`: a sea along
   an edge (Maelstrom's `min(255 - x, y)`), lakes as wells around points
   (Confluence, Quagmire's pool). Below `level` is shallow; below
   `level - shore` is deep.
3. **Rooms.** The drop zones, the core and the spec's `rooms`, each a disc
   whose radius wobbles round its outline by noise. The core's clearing
   is dry.
4. **Routes.** For every ground drop zone, an A* through its `via` rooms
   to the core over a cost that prefers ground already open — Mindustry's
   `solid ? 70 : 0` — with rock dear, deep water dearer and a little noise
   so the path wanders. A brush follows the path whose radius wanders
   between `width[0]` and `width[1]`, so the corridor narrows and widens
   as it goes. `links` between rooms are carved the same way and make the
   loops. Water routes (`layer: "water"`) are carved FIRST and cut deep
   channels; a ground route brushed across one turns that stretch to
   shallow, which is a ford. A channel's cost carries a heavy noise term,
   so a river hunts the noise's low ground and meanders instead of
   running a ruled canal. Named `chokes` pinch the open cells near a
   point to an exact width; the choke at the funnel point is a straight
   strip from the core through the funnel, carved as well as kept, so
   that it and the citadel's gate are the same nine cells.
5. **Distort, bays, cells.** A light domain warp takes the tube out of the
   brushed corridors; rock within a few cells of open ground is opened
   where a fine noise says so (`bays`), which is what puts the alcoves on
   a room; two passes of the 4-5 cellular rule take out the specks. Small
   `lumps` of rock are dropped into the wide rooms.
6. **The citadel.** Where a `funnel` is named, the core's clearing is
   ringed with rock and the ring has one gate, a corridor of the choke's
   width toward the funnel point. A noise map is open in too many places
   for "wall the mouth and nothing reaches the core" to come true by
   luck; the ring makes it true by construction.
7. **The minimum gap.** The biggest walker (a reign) is four cells across
   and the biggest hull (an omura) seven, so every THROUGH gap is at least
   `GAP_GROUND` (5) on land and `GAP_WATER` (11) at sea: a morphological
   opening by that disc silts every thinner gap shut. The notches the
   opening would also have filled — most of what makes an edge ragged —
   are put back afterwards, one ring at a time, each ring labelled by the
   component it grew from, and a cell whose neighbours carry two labels is
   refused: a notch may deepen an edge as far as it likes and may never
   become the bridge the opening just removed. Then open ground the core
   cannot be walked to from is filled (Mindustry's `inverseFloodFill`),
   the rim is sealed, and on a map with water zones any pond nearer the
   core than the sea is drained. That rule was written when the sim sent
   every hull to the water nearest the core, whichever puddle that was; it
   is kept because a pond beside the core is still a place the naval line
   can be dropped into and cannot drive far out of.
8. **Holes.** Thin walls between two open places are punched where the
   hole shortens nobody's walk to the core by more than 15% and the
   funnel still holds. A hole is texture and a second way in, never a
   short cut.
9. **Paint.** Floor families from a slow noise cut at its own quantiles,
   so a `weight` is the fraction of the board that family covers; the
   wall over a rock cell is its family's `wall`. A `beach` floor rings the
   water; a `flats` floor fills the cells of the big rooms furthest from
   any rock. A `forest` turns rock beside the named floors into pines in
   noise-shaped stands within `depth` of open ground — never a cell a
   walker uses, so the routes are unchanged. `ruins` are rectangles of
   basalt with broken dark walls, placed only where a route's width of
   open ground surrounds them. Clutter is each family's own boulder and
   bush, thick along the rock, thin in the open, never in a drop zone and
   never round the core.
10. **Checks**, then the document.

## The campaign maps

Nine specs, nine themes. Every one is `scripts/maps/<id>.mjs`.

| map | world | the place | the layout |
| --- | --- | --- | --- |
| Confluence | 1 | desert: sand, darksand, stone, a salt basin, two lakes | four gates on three edges flow into one antechamber before a core on the east edge |
| Maelstrom | 2 | storm coast: the sea along the north and east | three ground gates walk the coast; the hulls sail down it to a bay under the core |
| Quagmire | 3 | spore swamp: tainted lakes, a spore river, spore pines | three gates on the east, every road fords the river, the core on the west edge behind one causeway |
| Greenwood | 4 | earthy: dirt roads under dirt cliffs, grass, pine stands, two lakes | four gates on three edges, the core in the north-east corner |
| Tundra | 5 | snowy: snow, ice round two frozen lakes, shale, snow pines | four gates on the south corners and the sides, the core on the north edge |
| Crater | 6 | basalt and darksand, the core in a crater in the middle | six gates round the edge, six mouths in the crater's rim, no funnel |
| Shoals | 7 | archipelago: two thirds sea, sand islands, salt flats | roads between islands are bars of shallow; hulls from the north and south seas; the core on the west island |
| Riverlands | 8 | grass, dirt and sand banks; three rivers meet in a pool beside a core in the middle | five ground gates from the north and the corners ford the rivers; hulls sail the rivers in |
| Estuary | 9 | the sea fills the south, a river from the north-east, two lakes | four gates inland, the core on the north shore where the river opens out |

Two of the nine have no funnel. Crater and Riverlands put the core in
the middle of the board and let it be attacked from every side; their
chokes are the mouths round the core's clearing rather than one gate,
and the funnel check is simply not run. The other seven put the core in
a pocket of rock with one mouth.

## The spec

A spec is forty-odd numbers. Confluence's, as a guide:

| field | what |
| --- | --- |
| `seed` | the RNG seed; a re-run is the same map |
| `rock` | `threshold`, `scale`, `warp` — the noise rock |
| `water` | `scale`, `level`, `shore`, `warp`, `bias(x, y)`, and `shallow`/`deep` floors for the spore pair |
| `floors` | `scale`, `warp`, `families: [{ floor, wall, weight }]` — the dominant family first |
| `beach`, `flats` | a floor by the water (`depth`, optional `wall`) and a floor in the open middles (`clear`) |
| `rooms` | `{ x, y, r, wobble?, water?, dry? }` — the clearings, indexed; a `water` room is a bay, a `dry` room an island |
| `core` | `{ x, y, r }` — the core's cell and its clearing |
| `spawns` | `{ x, y, r, zone }` — ground, air, water, boss |
| `routes` | `{ spawn, via: [room…], to?, width: [choke, lane], layer? }` |
| `links` | `{ rooms: [a, b], width, layer? }` — the loops |
| `chokes` | `{ x, y, w, reach }` — pinch to `w` within `reach` |
| `funnel` | `{ x, y, r }` — the one mouth every ground route crosses |
| `holes`, `lumps`, `ruins` | how many of each |
| `forest` | `{ kind, on: [floors], threshold, depth }` |
| `coreWaterReach` | how near the core the hulls' goal must be |

Widths are in cells and are the brush's diameter; the smoothing passes
shave about one, so a route's `width[0]` of 8 is a corridor of 7, which
is the floor (`ROUTE_MIN_GROUND`). A water route's `width[0]` is 16: the
distortion moves each bank by up to three cells on its own, and a river
that dips under `GAP_WATER` anywhere is silted shut there. Room indices are what `via` and
`links` name; `"spawn:3"` names a drop zone and `"core"` the core.

## Check what you drew

A generator that does not verify itself is a generator that quietly ships a
broken map. Every one of these is printed on every run:

- **The core** is 5x5 open dry ground, off every drop zone.
- **Every ground zone reaches the core; every water zone reaches the sea
  it is in and the water nearest the core.** The generator still measures
  the water zones over the water alone, which is stricter than the sim now
  needs — a naval tank drives ashore — and it is what keeps a water door
  in real water rather than in a puddle. `0 pads` means the zone is off the
  open ground.
- **Every way through is wide enough.** Clearance is the distance to the
  nearest cell a unit cannot occupy, so twice it is the corridor's width
  there; the check reports the WIDEST route that still joins each zone to
  its goal and wants 7 on land, 11 at sea, and names the cells it pinches
  at when it does not. A route exists is not the question.
- **No gate is a short cut.** The walks to the core from every ground
  zone are within 50% of each other.
- **The funnel holds.** Wall it and no ground zone reaches the core.
- **Open == reachable.** No orphan pocket; the rim is sealed.
- **Composition.** Open ground between 15% and 45% of the board, the
  floor families' shares, forest, water, holes, lumps, ruins, props.
- **Room to build.** More than 8,000 rock cells and more than 200 4x4
  footprints, because towers stand on rock and the biggest needs sixteen
  contiguous cells of it.

Print the numbers on every run. `widest way through 6.0 cells — pinched at
(70,188)` is a fact you can act on; "looks fine" is not.

## Water

There are two waters, the clear pair and the spore pair, and **which floor
indices are wet is a list, not a range** — `WATER_FLOOR_GROUPS` in
`game/atlas.ts`. A new floor family has to be APPENDED, because its index
is baked into every document already on disk. Add a family, add its group
to that list if it is wet, and `isWaterFloor` keeps meaning what it says.

Shallow water is walkable by ground units and costs nothing to path
through; deep water (`WALL_DEEP`) blocks them. The naval line crosses
both, and dry land besides, at half pace ashore (`NAVAL_LAND_SPEED`). A
shallow fringe round a lake is a corridor for walkers, and on these maps
that is meant: a ford is where a road crosses water, and the route checks
measure what is actually walkable, fringes included.

## Documents

Every layer is a flat array indexed `y * w + x`. `w` is the width the
document was saved at; **height falls out of `floor.length / w`**.

| field | what |
| --- | --- |
| `blocked` | 0/1 — the only thing pathfinding reads |
| `wall` | `UV_WALLS` index; `WALL_PINE` (4) and `WALL_DEEP` (7) are blocked but still show their floor |
| `floor` | `UV_FLOORS` index; `FLOOR_SHALLOW_WATER` 15, `FLOOR_DEEP_WATER` 18, the spore pair 45 and 48 |
| `spawns` | circles `{x, y, r, zone}`, zone one of `ground` / `air` / `water` / `boss` |
| `base` | `{x, y}`, the core's top-left cell |

**THE CORE IS THE DESTINATION, AND THE MAP IS SEALED.** Every border cell
is rock, and every layer walks at the core (`Sim.coreGoal`), presses
against it and shoots — the naval line included, over a mask that is the
walkers' rock with the deep water opened up (`navalWalkMask`). It used to
sail to the water nearest the core and fire from the shore, which is what
`coreWaterReach` in a generator spec is still keeping honest: a core in
gun reach of the sea is a core a naval wave can hurt without leaving the
water it is quick in. Spawns are per layer and independent — a naval tank
uses the ground zones as well as the water ones, and every layer falls
back to whatever zones the map does paint, so no map locks a faction out
(`Sim.padMaskFor`). Boss zones are terrain-blind.

The atlas indices a generator paints with are COPIED into
`mindustry.mjs` rather than imported, because the generator is plain node
and the atlas reaches for a canvas at load. Keep the names identical and
grep both when a family moves. `scripts/maps/seal.mjs` still brings an
older or imported document up to the sealed-rim rule in place.

## Mission buildings

**A mission building is the swarm's, the player can never build one, and
it stands on the board only while the mission that fields it is being
played.** The kinds live in `MISSION_STRUCT_KINDS` (`game/types.ts`) with
their stats in `MISSION_STRUCTS` (`game/constants.ts`), their palette
sprite in `MISSION_STRUCT_ICONS` (`game/towerIcons.ts`), their cell on the
sprite sheet in `game/atlas.ts` and their art wired up in `UV_TURRETS`
(`game/renderer.ts`). Everything else in the sim and the renderer reaches
them through `structStats()`, which answers for both rosters — so a
mission building is placed, blocked around, shot at, splashed, drawn and
health-barred exactly like one of the swarm's walls, with no special case
anywhere.

### Stamping them

**In the map editor: the *Mission structure* palette, under *Enemy*.**
Same tool as *Enemy structure* over the other roster — click to stamp on
open ground, the eraser takes a whole stamp off, and a stamp will not land
on rock, on the base, or on top of another (either roster's). They are
drawn in **amber** rather than the formation's red, and **numbered**,
because the list's order is the order the mission uses them in — a raid's
launch order. Stamping order is therefore authoring: re-stamp to reorder.

They save into the map document as `missionStructs`, alongside `enemies`:

```json
"missionStructs": [{ "kind": "launch-pad", "gx": 323, "gy": 223 }]
```

**Both hand-stamped layers now survive a generator re-run.** `enemies` and
`missionStructs` are read off the document being overwritten and carried
across (`carried()` in `mindustry.mjs`, which prints what it kept), so a
change to a spec no longer costs you every stamp on the map. A stamp the
new terrain has buried is not fixed up — the loader filters what it cannot
use and the sim drops what will not fit, both with a console warning.

### What they mean

**Where a building stands is the map's; what standing there costs is the
mission's.** Positions go in the map document, where you can click them;
the assignment goes in `WORLDS[].mission` (`game/levels.ts`). The sim
stands up only the kinds the mission being played actually consumes, so
one board can carry several assignments' objectives and wear only the
current one's.

Confluence's mission is the first: a **raid** (`RaidMission`).

```ts
mission: {
  kind: "raid",
  target: "launch-pad",
  launchAt: [6 * 60, 11 * 60, 16 * 60, 21 * 60, 25 * 60],
},
```

`target` names the KIND; every one of them on the map is a target, in the
document's order. Two rules make that order matter:

* **`launchAt` pairs off with the targets by index, and is fixed.**
  Target 0 fires at `launchAt[0]`, target 1 at `launchAt[1]`, whatever the
  player has done in between. Nothing moves a moment: wrecking a target
  does not push the next one back, it means that moment arrives with
  nothing left to fire. **The last entry is the map's hard ceiling** —
  Confluence cannot run past 25:00.
* **One launch loses the run.** Not the last of five — the first. Reach a
  moment with that target still standing and it fires, and that is the end
  of it.

So stamp targets nearest-first: the early moments buy the player a target
they can reach, and the late ones ask for the last deep in the swarm's
ground. A target past the end of `launchAt` has no moment at all and can
only be finished, never failed.

The reward for being early is the clock itself — the HUD counts to the
soonest moment still owned by something standing, so clearing a target two
minutes early makes the countdown jump to the next target's moment,
further off by exactly the two minutes that were spare.

A run opens with the ground round every target already **discovered**
(`MISSION_INTEL_CELLS`, `game/fog.ts`) — stamped into the static fog set
and not the dynamic one, so each target and its patch are drawn in the
grey of remembered ground from the first frame, and whatever is guarding
it is not drawn at all. That is the briefing: the player knows where, not
what.

**The pacing dial is the building's `health`** (`MISSION_STRUCTS`), not
the schedule. Turn that when a raid plays long or short; the schedule is
what the mission promises the player and moving it moves the objective
text with it.

A raid's length is bounded by its own schedule: the last entry in
`launchAt` is the latest the run can possibly end, because that target
either dies before its moment (the win) or fires (the loss).

### Adding another one

A name in `MISSION_STRUCT_KINDS`, a stats row in `MISSION_STRUCTS`, a
sprite in `MISSION_STRUCT_ICONS`, a cell in `atlas.ts` and a row in
`UV_TURRETS`. The editor palette, the stamp tool, the eraser, the
overlap rules, the document round-trip and the numbering are written over
the roster rather than over `launch-pad`, so a new kind gets all of them
by existing.

## Defence formations (blueprints)

**An outpost is not one building, and you want fifty of them.** A duo ring
with a wall skirt is a dozen stamps that have to land in exactly the right
relationship; nine maps want a lot of those. Placing that by hand is an
afternoon, and *changing* it — a wall moved a cell, a duo swapped for a
hail — is that afternoon again on every copy, with no way to tell which
copies you missed.

So a formation is a **library entry** (`game/blueprints.ts`,
`public/blueprints.json`) and a map holds **references** to it
(`MapData.formations`). Every instance on every map is resolved from the
one library when the map is read, which is the whole trick: **editing a
blueprint IS editing every instance, everywhere, at once.** Nothing is
copied into a map, so nothing can fall out of step.

### Making one

1. Lay an outpost out with the **Enemy structure** tools as usual.
2. Pick **Select formation** (the marquee, under *Formations*) and drag a
   box round it. The Formations panel says what is in the box.
3. Name it and **Save as new formation**. The loose buildings are lifted
   and one instance drops in their place.

The **box you drag is the footprint**, and it is fixed forever — see
below. Only buildings lying *wholly* inside it are taken; one half in and
half out belongs to neither and is left alone.

### Stamping and turning

The blueprint appears as a swatch in the palette's *Formations* section.
Click the map to stamp an instance; **R turns it** (shift+R turns back),
and the ghost under the cursor shows the turn, so what you see is what
lands. An instance is stamped all-or-nothing: if any building would hit
rock, the base or another building, nothing is placed.

Turning is a **layout** rotation. Turrets have no authored facing in this
game — a placed one aims at the core it was built against — so a turned
blueprint is a turned arrangement and every gun still points wherever it
would have.

### Editing one

Click an instance with **Select formation**, then **Break apart to edit**.
Its buildings become loose stamps where they stood, the panel shows an
*Editing "…"* banner, and the marquee is already set to the box they came
out of. Change what you like and press **Save formation** — every instance
on every map changes with it.

Editing a *turned* instance is safe: the editor remembers the turn and
un-rotates the parts before storing them, so the library keeps one
canonical unturned copy.

### Deleting one

The **×** beside a blueprint deletes it **and every instance of it on every
map**. The API route sweeps the map documents on disk in one pass; the
board you have open is cleared in memory. Even if the sweep misses a file,
an instance whose blueprint is gone resolves to nothing when the map is
read (`formationsOf`), so there is no state where a formation
half-exists.

### The one rule

**A blueprint's footprint never changes after it is created.** Every map
that stamped it was authored around that box, and a resize would move
every instance's far edge on nine maps at once with nothing to check it
against. `putBlueprint` refuses a replacement of a different size and says
so — draw the box the same size, or save it as a new formation. There is
no resize path to get right because there is no resize.

### Load order

A map resolves its formations against **whatever the library holds at
`terrainFromMap` time**, so every entry point awaits `loadBlueprints()`
alongside `loadOfficialMaps()` — the game boot, `Game.create` (every run,
so an outpost edited a minute ago is the one you fight), and the map
editor. A map read before the library has loaded comes up with no
formations at all and warns about it.
