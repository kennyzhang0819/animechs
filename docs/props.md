# Props

The things that stand on the ground: twenty-two kinds, painted in code in
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

A prop is a square footprint of 1, 2, 3, 4 or 6 tiles, painted at 32 px
a tile and packed at 2x like the floors. Its art may REACH past the
footprint (`reach`, in tiles): a shrub's square is one tile and its
canopy one and a half, so bushes and trees touch and overlap with no
hitbox under the spill. A made prop reaches exactly its footprint. The
index into `PROP_KINDS` is what a document stores: **append, never
reorder.**

| kind | tiles | what |
| --- | --- | --- |
| shrub, reeds, boulder, stump | 1 | the small growth, a stone, a cut trunk |
| tree, rock, log | 2 | a canopy, a bigger stone, a fallen trunk |
| oak, outcrop | 3 | a broad canopy, a cluster of stones |
| grove | 4 | three canopies and their brush |
| brush, thicket | 2, 3 | the bushes a thicket is made of: a canopy with no trunk |
| crate | 1 | a supply crate |
| barrels, scrap, mast | 2 | drums, a scrap heap, a fallen radio mast |
| hull, silo | 3 | a wrecked mech hull, a fuel tank |
| walker, bunker | 4 | a dead mech, a ruined emplacement |
| wreck, colossus | 6 | a crashed gunship, a fallen giant |

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
turn.

## How a board is decorated

The generator's props stage runs after the ruins and before the spawn
layer, from the theme's `PropSpec` (which kinds, in which tones, how
thick):

1. **The fringe forest.** Rock beside the theme's forest floors, in
   the noise's shape and `depth` cells in, is tiled into props — oaks
   where three cells square are free, trees where two, shrubs on the
   rest. It was rock, so no lane is the narrower for it. Every theme
   has one now; the deserts' are thin scrub.
2. **What is kept clear.** The core's yard, every door's apron, each
   ground door's shortest walk to the core (three cells either side),
   and along the widest way from each door a lane as wide as the checks
   want (`routeMin`). Props go nowhere in that mask, which is why a
   board the checks passed still passes with the props on it.
3. **The sites.** One to three (`siteCount`) of the theme's big made
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

## On the corner map

A prop's cells wear its own colour on the minimap and the map cards
(`propMini`): a nature prop its tone pulled toward black, a made prop a
steel or rust grey — darker than the ground, so they read as things the
swarm cannot walk through, and not as the near-black of the hills.
