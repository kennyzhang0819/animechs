# Authoring maps

The checklist is `map-rules.md`; this is the reasoning behind it.

A map is a JSON document in `public/maps/`, listed by id in
`OFFICIAL_MAP_IDS` (`game/maps.ts`). A world claims one by name in
`WORLDS[].map` (`game/levels.ts`); a map no world claims still opens in the
editor and is playable by nothing. `/admin` has both doors — **Edit map**
for terrain, **Edit level** for the wave script.

**Every campaign map is generated, never drawn**, by a spec file in
`scripts/maps/` over the shared generator `scripts/maps/mapgen.mjs`:

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
the grid (`COLS`, `ROWS`) and `SIZE` in `mapgen.mjs` are 512 and
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
- **Forests, props and ruins.** Trees in noise-shaped stands on the rock
  beside the floors they grow on (up to 40% of a forest map), stones of
  the floor's own rock thickest along the hills, thickets, wrecks and
  litter on the open ground (`props.md`), and derelict buildings —
  rectangles of dark floor with broken walls — in the rooms.
- **One landmark.** A salt basin, a crater, a lake in the middle, a bay
  under the core. Every map has one thing the eye goes to.

## The pipeline

`mapgen.mjs` is Mindustry's `SerpuloPlanetGenerator`, step for step,
on this game's document shape:

1. **Rock from noise.** A domain-warped three-octave value noise, cut at
   a threshold, with the rim pushed up so the border reads as rock.
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
   the mouth is a lane rather than whatever the brush happened to leave.
5. **Distort, bays, cells.** A light domain warp takes the tube out of the
   brushed corridors; rock within a few cells of open ground is opened
   where a fine noise says so (`bays`), which is what puts the alcoves on
   a room; two passes of the 4-5 cellular rule take out the specks. Small
   `lumps` of rock are dropped into the wide rooms.
6. **The minimum gap.** The biggest walker (an ironhide5) is four cells across
   and the biggest hull (a skate5) seven, so every THROUGH gap is at least
   `GAP_GROUND` (5) on land and `GAP_WATER` (11) at sea: a morphological
   opening by that disc silts every thinner gap shut. The notches the
   opening would also have filled — most of what makes an edge ragged —
   are put back afterwards, one ring at a time, each ring labelled by the
   component it grew from, and a cell whose neighbours carry two labels is
   refused: a notch may deepen an edge as far as it likes and may never
   become the bridge the opening just removed. Then open ground the core
   cannot be walked to from is filled (Mindustry's `inverseFloodFill`),
   and on a map with water zones any pond nearer the
   core than the sea is drained. That rule was written when the sim sent
   every hull to the water nearest the core, whichever puddle that was; it
   is kept because a pond beside the core is still a place the naval line
   can be dropped into and cannot drive far out of.
7. **Holes.** Thin walls between two open places are punched where the
   hole shortens nobody's walk to the core by more than 15%. A hole is
   texture and a second way in, never a short cut.
8. **Paint.** Floor families from a slow noise cut at its own quantiles,
   so a `weight` is the fraction of the board that family covers; the
   wall over a rock cell is its family's `wall`. A `beach` floor rings the
   water; a `flats` floor fills the cells of the big rooms furthest from
   any rock. A `forest` turns rock beside the named floors into trees in
   noise-shaped stands within `depth` of open ground — never a cell a
   walker uses, so the routes are unchanged. `ruins` are rectangles of
   basalt with broken dark walls, placed only where a route's width of
   open ground surrounds them. The in-game generator then stands the
   biome's props on the open ground, clear of every lane (`props.md`);
   the authoring script still writes the old clutter, which the loader
   ignores.
9. **Checks**, then the document.

## The campaign maps

Four specs, four biomes. Every one is `scripts/maps/<id>.mjs`. Five more —
Greenwood, Tundra, Crater, Riverlands and Estuary — were deleted: they were
shelved holds on undressed ground and nothing played them.

| map | world | the place | the layout |
| --- | --- | --- | --- |
| Confluence | 1 | desert: sand, darksand, stone, a salt basin, two lakes | four gates on three edges flow into one antechamber before a core on the east edge |
| Maelstrom | 2 | storm coast: the sea along the north and east | three ground gates walk the coast; the hulls sail down it to a bay under the core |
| Quagmire | 3 | spore swamp: tainted lakes, a spore river, spore pines | three gates on the east, every road fords the river, the core on the west edge behind one causeway |
| Shoals | 7 | archipelago: two thirds sea, sand islands, salt flats | roads between islands are bars of shallow; hulls from the north and south seas; the core on the west island |

All four name a funnel: it is the mouth the ground routes cross, and the
choke there is ruled straight from the core through it. A map that puts
its core in the middle and takes the swarm from every side names none,
and its chokes are the mouths round the core's clearing instead.

THE CORE IS NO LONGER WALLED IN. A ring of rock with one gate used to be
stamped round every core that named a funnel — the citadel — which made
"wall the mouth and nothing reaches the core" true by construction and
left a machine-drawn C on eleven maps. It is gone: the ground round a
core is whatever the noise and the rooms left there, the funnel is only
the choke's ruled line now, and the mouth is as tight as the choke an
author sets and no tighter.

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
| `forest` | `{ on: [floors], threshold, depth }` (the authoring script's `kind` is read as a legacy pine kind) |

Widths are in cells and are the brush's diameter; the smoothing passes
shave about one, so a route's `width[0]` of 8 is a corridor of 7, which
is the floor (`ROUTE_MIN_GROUND`). A water route's `width[0]` is 16: the
distortion moves each bank by up to three cells on its own, and a river
that dips under `GAP_WATER` anywhere is silted shut there. Room indices are what `via` and
`links` name; `"spawn:3"` names a drop zone and `"core"` the core.

## Check what you drew

A generator that does not verify itself is a generator that quietly ships a
broken map. Every one of these is printed on every run:

- **The core** is 6x6 open dry ground, off every drop zone; the loader clears its cells on any document.
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
- **Open == reachable.** No orphan pocket.
- **Composition.** Reported, not enforced: open ground (a share outside
  15%-50% is noted as a smell, not a failure), the floor families'
  shares, forest, water, holes, lumps, ruins, props.
- **Room to build.** More than 8,000 rock cells and more than 200 4x4
  footprints — a check from when towers stood on rock, kept as a
  measure of how much of the board is hill.

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
| `wall` | `UV_WALLS` index; `WALL_PROP` (4) and `WALL_DEEP` (7) are blocked but still show their floor |
| `props` | the props standing on the map, `{x, y, kind, tone, rot}` in cells (`props.md`); `pines` is the legacy form, grown into trees on load, and `decor` is ignored |
| `floor` | `UV_FLOORS` index; `FLOOR_SHALLOW_WATER` 15, `FLOOR_DEEP_WATER` 18, the spore pair 45 and 48 |
| `spawnTiles` | the SPAWN LAYER: a sorted list of cell indices, painted in the map editor. Sparse, because it is (a few thousand cells at most) |
| `spawns` | LEGACY: drop zone circles `{x, y, r, zone}`. Still what the generator writes; the loader burns them down to spawn tiles (`spawnTilesOf`) — the union of all of them, clipped to open ground |
| `base` | `{x, y}`, the core's top-left cell |

**THE CORE IS THE DESTINATION, AND THE MAP IS SEALED.** Every border cell
is rock, and every layer walks at the core (`Sim.coreGoal`), presses
against it and shoots — the naval line included, over a mask that is the
walkers' rock with the deep water opened up (`navalWalkMask`). It used to
sail to the water nearest the core and fire from the shore, and a
`coreWaterReach` check made every map put the sea within gun range to
suit it. A hull walks ashore now, so nothing makes that demand of a map:
put the water where the map wants it.

**THE SPAWN LAYER IS ONE LAYER.** There is no such thing as a ground door
or an air door any more: a map paints spawn tiles, and each movement layer
picks its own out of them (`Sim.padMaskFor`) — a walker and a flyer take
the DRY tiles, a hull takes any of them and prefers the WET ones. Each
falls back to the whole layer when its share is empty, so no map locks a
faction out. A spawn tile is open ground, always: nothing enters on a hill,
and the loader clips the layer against `blocked` to make sure of it. A boss
has no door of its own — hold one back by painting tiles only it can use.

The red pads are an AUTHORING mark. They are drawn in the map editor and
nowhere else: a match builds its terrain with `GAME_LAYERS` (spawn off),
and a player reads the mouths from the routes overlay, which outlines the
same cells on demand. Paint as many tiles as the map wants — none of it
lands on the board a player looks at.

The atlas indices a generator paints with are COPIED into
`mapgen.mjs` rather than imported, because the generator is plain node
and the atlas reaches for a canvas at load. Keep the names identical and
grep both when a family moves. `scripts/maps/seal.mjs` still brings an
older or imported document up to the sealed-rim rule in place.
