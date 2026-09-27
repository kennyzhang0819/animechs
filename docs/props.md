# Props

The things that stand on the ground: the standing kinds below and the ten biomes' roster, painted in code in
`game/propArt.ts`, placed by the map generator (`game/mapgen.ts`) and by
the map editor, drawn by the renderer's terrain pass. This page is the
system; the file headers say only where things are.

## The rule

**A prop blocks.** Every cell under one is `blocked` and wears the
`WALL_PROP` sentinel (value 4, the old pine sentinel — every document on
disk already carries it). So a prop is a wall the swarm walks round, a
cell no tower stands on and no spawn tile is painted on, and — like the
old pines — open sky to a flyer and no wall to sight (`isBuildableWall`
names only rock). Its floor shows under it; the sprite is drawn over.
A prop casts the hills' rim shadow on the floor round it but never
darkens inside: a prop is a thing on the ground, not a mass.

`Terrain.props` is the list that is drawn; the cell layers are what the
sim reads. The loader (`maps.ts propsOf`) keeps them honest both ways: a
listed prop whose footprint is not all sentinel cells is dropped, and a
sentinel cell no prop covers is grown over (`terrain.ts forestOf`) so
nothing blocks the swarm invisibly. A prop casts the rim shadow at less
than half a hill's (`PROP_SHADOW`); a thicket at full strength went to
mud. That second rule is also how a
legacy document's `pines` become trees: a pine cell already wears the
sentinel, and the loader tiles the pine cells into oaks, trees and
shrubs in the tone its forest kind meant. The old non-blocking `decor`
is ignored.

## The kinds

A prop is a square footprint of 1, 2, 3, 4, 6 or 10 tiles, painted at 32 px
a tile and packed at 2x like the floors. Its art may REACH past the
footprint (`reach`, in tiles): a shrub's square is one tile and its
canopy nearly two; a stone reaches the same way, so bushes and stones touch and overlap with no
hitbox under the spill. A made prop reaches exactly its footprint. The
index into `PROP_KINDS` is what a document stores: **append, never
reorder.**

| kind | tiles | what |
| --- | --- | --- |
| shrub, reeds, boulder, stump | 1 | the small growth, a stone, a cut trunk |
| tree, rock, log | 2 | a canopy, a bigger stone, a fallen trunk |
| oak, outcrop | 3 | a broad canopy, the biggest stone |
| grove | 4 | three canopies and their brush |
| brush, thicket | 2, 3 | the bushes a thicket is made of: a canopy with no trunk |
| snag | 2 | a dead tree: a trunk and its bare limbs, for the barren lands |
| lily, driftwood, shingle | 1 | the water's edge: a pad on the shallows, a bleached log, wet stones |
| rushes, lilypad | 2 | a reed bed standing in the shallows, a big pad |
| copse, crag | 6 | a great bush, a great stone: rare |
| brake, tor | 10 | the biggest bush and stone on any board: rarer still |
| crate | 1 | a supply crate |
| barrels, scrap, mast | 2 | drums, a scrap heap, a fallen radio mast |
| hull, silo | 3 | a wrecked mech hull, a fuel tank |
| walker, bunker | 4 | a dead mech, a ruined emplacement |
| wreck, colossus | 6 | a crashed gunship, a fallen giant |
| chest | 2 | a side site's cache (docs/sites.md): the generator stands one at each site |
| menhir | 1 | a standing stone, tinted like the rock: a cairn's ring |
| pillar, brazier | 1 | a column, an iron fire bowl: a shrine's furniture |
| altar | 2 | a stained slab on a plinth |

## The roster

The rolled biomes (`mapgen.ts BIOMES`) draw from a fixed roster rather
than the table above: **one family a biome at every footprint, two
auxiliaries, and the one rock shared by all.** A family is one silhouette
that comes in 1, 2, 3, 4, 6 and 10 tiles — the meadow's canopy, the salt
pan's cactus, the tundra's ice slab, the badlands' mesa, the ashfall's
burnt snag, the caldera's basalt columns, the shallows' coral, the
jungle's broadleaf, the spore field's cap and the crystal barrens' shard
— so a prop's size is its health (`PROP_HP`, by footprint, the same in
every biome) and its family is its map. The auxiliaries are a 2-tile and
a 1-tile kind of the biome's own (a log and a stump, a drift and an ice
shard, a flow tongue and a lava bomb…) that also stand at the shore. The
rock is the boulder, rock, outcrop, knoll, crag and tor, in the rock
tone of the wall family under it. Nothing else crosses a biome; the made
kinds belong to the sites (`sites.md`), and the older kinds above stay
for the authored maps and the editor.

Every roster painting is **one shape under one shading**: its pieces go
into a mask and the union of the mask gets the three bands, so nothing is
drawn inside the outline and no shadow is painted: the renderer casts it. A kind's paintings differ
by one mark, the stones' own three: plain, a face catching the light
up-right, hollows on the shaded side. The 1-, 2- and 3-tile kinds carry
three paintings, the 4-tile two, the 6- and 10-tile one.

**The families live in three slots on the sheet, not in cells of their
own.** Ten families at ten tiles would not fit the atlas, and a board
carries at most three biomes (`random-maps.md`, the blends), so the atlas
reserves three sets of family cells (`FAMILY_SETS`) and the renderer draws
the board's biomes into them when it builds the terrain
(`ensureFamilies`, then the texture is uploaded again). A painting six
tiles or more sits at 1x in its cell, slot or not, the rest at 2x. A
document that stands a fourth biome's kinds draws them from the first
slot.

**Nature kinds are tinted, made kinds carry their paint.** A nature prop
is painted in four greys and multiplied at draw time by its `tone`
(`PROP_TONES`), so one painting is a pine, a mangrove, a frost tree or a
dead ash tree, and a boulder wears whichever rock family it lies against
(one rock tone per wall family, `rockTone`). A made prop — steel, rust,
concrete — has its own colours, and its tone is a *weathering* tint
(plain, dusted, rimed, sooted, mossed, ochre) that nudges it toward the
ground it has been lying on. The tone index is stored with the prop;
that table is append-only too.

Shading follows the hills: light on the top-right, dark on the
bottom-left, a mid band between. Nothing under four px, no outline —
the silhouette is the shading's own edge, as on the tiles. A nature
prop is never turned (`turns`): every one keeps the one light, which is
what lets a thicket read as one thing. A made prop lands at any quarter
turn. A kind may have several PAINTINGS (`variants`): the three stones
have three each — plain, one lit facet, hollows on the shaded side —
and a kind that does not turn reads `Prop.rot` as which painting it
wears (`rollRot`).

## How a board is decorated

The generator's props stage runs after the ruins and before the spawn
layer, from each biome's `PropSpec` (which kinds, in which tones, how
thick):

1. **The fringe forest.** Rock beside a biome's forest floors, in
   the noise's shape and `depth` cells in, is tiled into props — oaks
   where three cells square are free, trees where two, shrubs on the
   rest. It was rock, so no lane is the narrower for it. Every biome
   has one now; the deserts' are thin scrub.
2. **What is kept clear.** The core's yard, every door's apron, each
   ground door's shortest walk to the core (three cells either side),
   and along the widest way from each door a lane as wide as the checks
   want (`routeMin`). Props go nowhere in that mask, which is why a
   board the checks passed still passes with the props on it.
3. **The sites.** One to three (`siteCount`) of the first biome's big made
   kinds, each with three to seven pieces of its `litter` scattered
   round it. A site that would wall off a room — the ground the core
   can reach shrinking by more than what was stood on it — is taken up
   again.
4. **The growth and the stones.** Every open cell in a random order: a
   growth noise says where the thickets are, and along the rock
   (`hug`) both growth and stones lie thicker; the big kinds go in the
   thick of a thicket, the small ones at its edge — inside a thicket
   mostly the brush and thicket patches, with trees rising out of them
   and single shrubs as strays. Stones wear the rock tone of the wall
   the floor family under them wears.
5. **Pockets.** A pocket the props closed is grown over with shrubs and
   trees rather than sealed as rock, so a thicket stays a thicket. A wet
   one, or one no flora fits, is sealed as before.

A roll takes no measurable time longer for it; a board carries six to
sixteen thousand props, five to fifteen percent of its cells.

## In the editor

One brush a kind, in the Props section, its variants the tones the kind
may wear. A click stamps the footprint (the cursor at its middle) on
open ground, and any floor, wall, water or erase stroke on a cell takes
the whole prop off it and opens the cells it stood on. The icons are
written by `npm run gen:tiles` (`public/tiles/prop-<kind>-<tone>.png`).

## At the shore

A biome names its water's-edge kinds (`PropSpec.shore`), and the shore pass
stands them on the shallows within two cells of dry ground and on the dry
ground a cell off the water, off the routes. A bed on the shallows blocks
like any other prop; one that shuts a room is lifted with the rest, and a
lifted shallow cell gets its water back.

## Under fire

Every prop can be shot, and only the player's guns shoot them. A turret
always prefers a body; only with no body, dome or enemy building in range
does it turn on the nearest prop in range (`Sim.nearestProp`, held in
`Tower.aimProp`). To a shot, a prop is a body: a round in flight stops at
the first prop on its path (`firstPropAlong`) unless it pierces, in which
case it goes through every prop on the path and hits each once, on the
same ledger and cap as bodies (`propsAlong`); a laser counts the props on
its line against its pierce cap, a rail spends its budget on them in the
order met, a held beam rakes every prop under it, a cleave takes the props
in its arc, and a blast reaches the props round it at the blast's falloff.
Artillery arcs over them and reaches them only where it lands. The chain
(coil) jumps bodies only and hits just the prop it was aimed at.

**The statuses land on props as on bodies** (`propStatus`, ticked by
`updatePropStatus` on `updateStatus`'s rules): fire stacks and burns for
`FIRE_SECONDS`, poison adds and rots for `POISON_SECONDS`, wet re-times and
doubles an electric hit (`WET_SHOCK_MUL`). Each path lays what it lays on a
body: a direct hit its burn and wet (and its poison if it does not splash),
a blast all three, a held beam its burn and poison, a rail or laser none.
Fire does not spread to or from a prop, and a prop has no soak threshold.

A prop's health is the turret band of its footprint, 2,800 for one tile up
to 130,000 for six (`terrain.ts PROP_HP`), with no armour. One that comes
down pays nothing: its own cells open to the walkers and the hulls, a
hill's rock under one stays and turns buildable, and the fields re-solve
the way they do for a sold turret. The other side of the seam learns of it
by the terrain version (`simreport.ts TERRAIN`), catches its own copy of
the ground up in place, and takes the one prop out of the picture — its quad,
its shadow, its cells on the corner map (`renderer.killProp`,
`maps.ts repaintThumbCells`) — rather than rebuilding the board. A prop
wears a health bar like a building does, under the Interface tab's own
knob for props: always, damaged or never.

## On the hills

The generator also stands props on rock, at a fraction of the ground's
density (`mapgen.ts`, the hill pass after the room pass): the same flora
and stones, the rock kept under them. A hill prop's cells stay rock in the
document — only the prop list carries it — so the loader accepts a prop on
rock as well as on `WALL_PROP`, the wall art draws beneath it and a
turret may not stand on its cells (`terrain.ts hillMask`).

## On the corner map

A prop's cells wear its own colour on the minimap and the map cards
(`propMini`): a nature prop its tone pulled toward black, a made prop a
steel or rust grey — darker than the ground, so they read as things the
swarm cannot walk through, and not as the near-black of the hills.
