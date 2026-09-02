# Authoring maps

The checklist is `map-rules.md`; this is the reasoning behind it.

A map is a JSON document in `public/maps/`, listed by id in
`OFFICIAL_MAP_IDS` (`game/maps.ts`). A world claims one by name in
`WORLDS[].map` (`game/levels.ts`); a map no world claims still opens in the
editor and is playable by nothing. `/admin` has both doors — **Edit map**
for terrain, **Edit level** for the wave script.

## The document

Every layer is a flat array indexed `y * w + x`. `w` is the width the
document was saved at; **height falls out of `floor.length / w`**, so
changing the height means resizing the arrays, not setting a field.

| field | what |
| --- | --- |
| `blocked` | 0/1 — the only thing pathfinding reads |
| `wall` | `UV_WALLS` index; `WALL_PINE` (4) and `WALL_DEEP` (7) are blocked but still show their floor |
| `floor` | `UV_FLOORS` index; `FLOOR_SHALLOW_WATER` 15, `FLOOR_DEEP_WATER` 18, the spore pair 45 and 48 |
| `spawns` | circles `{x, y, r, zone}`, zone one of `ground` / `air` / `water` / `boss` |
| `exits` | per-cell **layer mask** — ground 1, air 2, water 4, ORed |
| `base` | `{x, y}`, top-left cell |

**AN EXIT BELONGS ON A BORDER.** The swarm is walking off the edge of the
world, past whatever stands in the road; a goal cell in open field is a
unit marching into the middle of the map and vanishing. confluence's exits
are the `x=255` column and maelstrom's are the bottom band — put the base
near that edge, run the lane through it and out, and mark the rim.

Spawns and exits are per layer and independent: a ground zone only feeds
ground units, and they only path to cells whose exit mask has bit 1. A
layer with no exits of its own falls back to the union, then to the base
(`exitsFor` in `game/sim.ts`), so a missing band degrades rather than
strands. Boss zones are **terrain-blind** — the boss flies, so it needs no
road and no reachable ground under it.

## Drawing paths

Hand-drawing gives you a map that looks hand-drawn. Author from geometry
instead: a script that stamps a handful of primitives, writes the JSON, and
**refuses to write if its own checks fail**. Roughly thirty numbers should
describe a whole map.

The scripts live in `scripts/maps/`, one per map over a shared `geom.mjs`
(the arc-only path builder, the raster helpers, and a PNG writer). Each
takes its output path and an optional preview image:

```
node scripts/maps/quagmire.mjs public/maps/quagmire.json preview.png
```

The primitives that carry a map:

- **A lane of constant width.** Stamp a disc of radius `LANE` along a
  centreline. 21 cells across is the campaign width — wide enough for a
  swarm to spread and for towers to line both sides.
- **Circular arcs**, not corners. A turn's gentleness is its radius: over an
  8-cell chord, `r` cells of radius swings `8/r` radians. r=45 is ~10°, r=20
  is ~23°. Anything that reads as a corner is a radius you did not pick.
  A "steer at this point, then run to it" move has no answer when the point
  sits inside the turning circle — it loops instead, so compare each leg
  against its straight line and refuse the ones that are much longer.
- **No loose rocks in open water.** An islet dropped in a sea lane pinches
  it to something no hull fits down, and the fleet queues up behind it and
  dies there. Give the composition its rock as coast — long masses along
  the edges that close the empty corners — and keep the middle of a lane
  clear.
- **Blobs, not discs.** A disc is the one shape a stamp gets for free and
  the one shape nothing in nature has, so a map of discs reads as a map of
  discs. An ellipse with a long axis pointed somewhere and two cosine lobes
  on its radius is the same handful of numbers and reads as a coastline.
- **S-bends** for changes of height. Two arcs of one radius, the second
  mirroring the first: the road leaves level and arrives level, so it can be
  joined to a straight run with nothing at the join. A *single* quarter arc
  from 90° to 0° ends heading **north** — join that to a level run and you
  have built a right angle.
- **Flared mouths** at the border. A gate is not a circle stamped on the
  edge; it is the lane widening into one. Ease from ~68 cells at the border
  to the lane width over about 40% of the run
  (`LANE + (MOUTH - LANE) * (1 - t/0.42)^1.7`).

Merge tributaries at a **lean, not square**. Turning a side road the full
90° so it arrives parallel is geometrically neater and looks worse: it makes
a T with a square notch where the tributary's outer wall butts the trunk.
Stop the arc short — 65 of the 90 — and merge at ~25°, and the junction
opens into a wishbone.

**Round the hills last.** The rock between two meeting roads is nobody's
drawing — it is the leftover of the angle they cross at, so a shallow merge
leaves a blade. A morphological opening of the rock by a disc (erode by the
disc, dilate back) puts the disc's radius on every convex rock corner at
once and leaves concave ones — the rim, the walls lining a lane —
untouched. r=8 is a light file. It can only remove rock, and only rock a
disc that size cannot fit inside, so nothing thicker than 2r is ever cut
through.

## Dressing

The geometry is the map; the floors, the rock families and the clutter
are its paint, and the paint comes from rules, not from a brush.
`scripts/maps/dress.mjs` repaints an authored document from a palette and
writes `blocked`, `exits`, `spawns` and `base` back untouched:

```
node scripts/maps/dress.mjs confluence [preview.png]
```

**RE-RUNNING IT OVERWRITES EVERY FLOOR, WALL AND PROP ON THAT MAP.** Paint
in the editor or in the script's `STYLES` table, never both — a hand edit
survives exactly until the next run.

The rules are the ones Quagmire and the start screen already use, and
they are what makes a map read as a place rather than as a colour:

- **One rock, and NOTHING OUTLINES A ROAD.** A road is cut through the
  rock and the rock on both sides of it is the same rock. Lining the
  roads with a second family was tried and it reads as a drawing with an
  ink line round every path. The road is traceable because the rock
  contrasts with the FLOOR: dark dune over pale sand on Confluence.
- **A coast, where there is water, and a BROAD one.** Quagmire's heart is
  the island at 0.58 of its own outline, so its pale dacite rim is about
  forty percent of every mass. The coast follows the SEA and not the
  roads, and the line between it and the heart is wobbled by noise.
- **Outcrops.** Patches of the rim family deep in the heart, where a
  low-frequency noise runs high — the start screen's second rock.
- **A second floor**, in patches the same way. **Scree** at the foot of
  the rock, a darker floor a cell or so deep, broken up by noise. A
  **third floor** only where the road is wide enough to be a plain.
- **Clutter along the road's edges** and never down its middle, never in
  a drop zone, never round the base. A boulder is a thing to walk round;
  the column walks the middle.

## Water

There are two waters, the clear pair and the spore pair, and **which floor
indices are wet is a list, not a range** — `WATER_FLOOR_GROUPS` in
`game/atlas.ts`. A new floor family has to be APPENDED, because its index
is baked into every document already on disk, so the first land family
added after the waters put dry ground above the old `floor >= 15` line.
Add a family, add its group to that list if it is wet, and `isWaterFloor`
keeps meaning what it says.

Shallow water is walkable by ground units and costs nothing to path
through; deep water (`WALL_DEEP`) blocks them. **A river must be deep bank
to bank.** A shallow fringe along the banks is a continuous walkable
corridor the length of the river, and the swarm will find it — units path
through a one-cell gap as happily as a highway. Leave shallow only where
you mean a ford.

## Check what you drew

A generator that does not verify itself is a generator that quietly ships a
broken map. Every one of these has caught a real bug:

- **Every spawn zone reaches an exit.** Count the pads inside each circle
  using the zone's own radius, then flood from them. `0 pads` means the zone
  is off the roads. Exclude boss zones.
- **The choke holds.** Wall the intended choke point and re-flood: if any
  gate still reaches an exit, there is a second route you did not draw.
- **Open == reachable.** Any open cell the flood misses is an orphan pocket.
- **No footholds off a lane.** Walk the river banks and count walkable
  cells that are not on the ground lane. Anything but zero is a shortcut.
- **Bend angles.** Walk each stamped centreline over an 8-cell chord and
  bucket the heading swings. Per-sample angles on a rasterised curve are
  mostly rounding noise; the 8-cell chord is what a unit actually crosses.
- **No leg loops.** A "steer at this point, then run to it" move has no
  answer when the point sits inside the turning circle, and what it does
  instead is turn nearly all the way round. Compare each leg's length
  against its straight line and refuse anything much longer: the result is
  a road that still passes every other check and is a spiral through the
  sea.
- **Every way through is a lane wide.** THIS IS THE RULE, and it is not
  the same as "a route exists": a channel pinched to nine cells by an islet
  is connected, passable, and no use at all to something 21 across. Measure
  it — clearance is the distance to the nearest cell a unit cannot occupy,
  so twice it is the width there — and report the WIDEST corridor that
  still joins each drop zone to an exit. It holds for the fleet as much as
  the swarm: water is a lane too. The cheapest way to make it true rather
  than to keep chasing it is a morphological OPENING of the sea by a
  lane-wide disc, exactly as the rock gets: erode, dilate back, and every
  channel too narrow to sail silts up into coast.
- **Every exit is on the rim.** One line, and it is the difference between
  an exit and a hole in the ground.
- **No gate is a short cut.** Measure each gate's run TO THE EDGE — a
  tributary's own length plus what is left of the trunk from where it
  joins — and compare them. A gate half the length of its neighbours is
  the one every wave will pour down.
- **Islands that touch are one island.** If the terrain is islands linked
  by causeways, count the stretches of each road that lie outside every
  island and check both the count and the length. One blob a few cells too
  fat swallows its neighbour's channel and the archipelago quietly becomes
  a single landmass with roads on it.
- **Room to build.** Towers only stand on BLOCKED cells that are not one of
  the two sentinels, so a map made mostly of water and road has nowhere to
  put a turret. Count the rock, and count the 4x4 footprints in it — the
  biggest turret needs sixteen contiguous cells of it.

Print the numbers on every run. `sharpest turn: 13 degrees` is a fact you
can act on; "looks smooth" is not.
