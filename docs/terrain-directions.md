# Terrain: the game's own tileset

The ground is the last thing on the board still drawn in Mindustry's
clothes. The swarm is animals (`docs/unit-art.md`), the turrets are
Foundry (`docs/turret-factions.md`), and the terrain under them is
Mindustry's floor vocabulary (spore moss, tainted water, dacite,
darksand), Mindustry's wall lighting, Mindustry's darkness buffer and
Mindustry's `water.frag`, repainted flat in `game/tiles.ts`. This page is
the redesign: what the terrain has to do in THIS game, four directions
drawn as concepts, and a recommendation.

The concepts are `docs/terrain-concepts/*.png`, drawn by
`node --experimental-strip-types scripts/terrain-concepts.mjs`: one
scene (a rock mass with a ragged edge, a lump and an island in the lane,
a lake with a shore, two floor families, three Foundry heads on the rock,
the core on the floor) painted five ways. `current.png` is the scene
through the game's own painters with the darkness and the rim shadow the
renderer adds; `families.png` is every direction on every floor family.
Nothing is wired in.

## What the terrain has to do here

Three facts about this game that Mindustry's ground was never drawn for:

1. **Towers stand on rock; the swarm walks the floor.** The rock is the
   PLAYER'S ground, not scenery. Mindustry's darkness buffer paints every
   wall cell more than one step in solid black, so at field zoom the
   surface a player builds on is a void with a lit rim, and a turret
   sits on nothing. The most important change in any direction below is
   that the rock is lit, and reads as a surface.
2. **Rock is most of the board.** 55% to 85% of a campaign map is wall
   (`docs/map-rules.md`), and every edge is a noise contour. The rock's
   look IS the map's look; the floors are the cut.
3. **Two sides in colour.** The animals are dark bodies wearing six
   saturated hues (crimson, acid, star-gold, magenta, teal, violet); the
   heads are gunmetal with a muted ammo accent. The ground has to sit
   under both: mid value, low saturation, and never a family hue. Two
   collisions exist today. The stone floor (`#7c7c84`) is the turrets'
   gunmetal (`#7b7b7b`) at the same value, so a formation on stone loses
   its plates. And the marsh (moss, spore moss, spore water, spore pines)
   is violet, which is the Livewire family's hue and, more than any other
   tile, the thing that says "Mindustry".

Shared by every direction, whichever is picked:

- **The hill-side shading stays as it is.** The rim shadow on the floor
  and the darkness inside the hill are the game's own logic and are
  kept; every direction is drawn under them. (The first draft of this
  page proposed lifting the darkness; that is withdrawn — see the play
  render below for what it does to the ink.)
- One rock is a step lighter and warmer than gunmetal. The concepts use
  `#9a958a` for stone; the stone floor moves with it (`#a19c94`).
- The marsh loses its violet: bog and peat in olive and brown, the spore
  pines mangroves, the tainted water a dark tea. Violet stays the eels'.
- The water leaves the shader for the same hand as the tiles: two flat
  blues, a drawn foam line at the shore, sparse wave marks. The naval
  line is the only thing on it and reads better on flat water.
- Our own names, the indices kept (a floor index is baked into every map
  on disk, `WATER_FLOOR_GROUPS`): meadow, loam, sand, dust, flint, salt,
  snow, ice, shale, basalt, cinder, peat, bog.

## The directions

### 1. Mesa — the plateau you build on (recommended)

`mesa.png`. The rock is a tabletop: a lit, flat top in a slow two-tone
mottle with a rare fissure, and along every south-facing edge a drawn
CLIFF FACE half a tile tall — vertical strata with a pale lip — so the
mass reads as raised. North and east edges get a two-pixel lit lip, west
edges a shaded one (the top-right light the whole game uses), and the
floor takes a soft shadow falling down-left from the cliff. Water is flat
two-tone with a foam line.

Why: it answers fact 1 directly. A player sees a plateau and knows it is
theirs; the lane is a canyon floor. It is also the most familiar tower
defense reading (Kingdom Rush, Mindustry's own ridges done properly), so
it costs the player nothing to learn.

What it needs: neighbour-aware rock tiles. A rock cell picks its art
from which of its four sides is open (a 4-bit mask, sixteen tiles a
family, plus two convex corners), which is the plumbing the floor edge
fades already have (`UV_FLOOR_EDGES` is a 3x3 of sub-cells chosen by
neighbour) and the large-wall rule already reads (`WALL_GROUP`). The
cliff is the south sub-tile; the lips are strips. The floor shadow is
the existing shadow mask with an offset. Medium work, all in
`tiles.ts`, `atlas.ts` and the wall pass of `renderer.ts`.

Risk: a mass one cell thick shows a cliff with no top; the generator's
minimum gap already keeps rock lumps two wide, and a one-cell spur can
draw as a boulder.

### 2. Chart — a drawn map

`chart.png`. Paper floors in desaturated tints, a two-pixel ink line
round every rock mass, contour lines a tile apart inside it, stipple on
the floor that thickens toward the cliff, water in ruled ripples with a
dotted shoreline. The props take the same ink outline.

Why: it is the most distinct from Mindustry and the most legible at
field zoom, where a contour map is exactly what a 512-map wants to be.
The minimap and the routes overlay would become the same drawing at a
smaller scale. It also flatters the animals: dark bodies with a hue read
like tokens on a chart.

What it needs: the contour rings are the darkness pass's erosion depth
(`DARK_RADIUS`, per cell) drawn as a ring tile per depth instead of a
black ramp, so the data is already there; the ink line is a wall edge
tile; the stipple is a floor fade. Medium work. The paper palette is a
retune of every `FLOOR_STYLE` entry.

Risk: an outline on the terrain next to no outline on the sprites (the
atlas adds a rim to sprites itself); the concept keeps the ink to the
rock and the props and it holds, but it is a rule the sprite art page
would have to name. The kraft rock sits nearer gunmetal than Mesa's does
and wants a warmer tone still.

### 3. Strata — the evolution

`strata.png`. The rock is lit inside, with sedimentary bands wandering
across the mass, continuous across tiles, and a lit lip on its north and
east edges; the floors are slow two-tone blotches instead of one dot a
tile; the rim shadow and the darkness at three cells and deeper are kept,
softened. Closest to what ships.

Why: it keeps everything the renderer does and fixes the two failures
(the black void, the dotted floors) for the least work. The bands read
as rock rather than wood once they are wide, wavy and few.

What it needs: bands and blotches that run across tile seams. Either a
handful more variants with a seam rule, or a tiny fragment program on
the wall batch that samples a band function of world y (the water batch
already has a program of its own). Small work.

Risk: it still looks like a repaint of Mindustry's ground, because it
is. Pick it if the terrain is not the next thing the game needs.

### 4. Linocut — carved

`linocut.png`. Three tones a family, no more. The rock is a carved
mass: a wide light band along its lit edges, a wide dark band along the
shaded, a few gouge marks inside, and the floors carry a rare carved
tick. The water is dark with white crests cut into it.

Why: the boldest and the most readable at any zoom; a poster of a map.

What it needs: the same edge tiles as Mesa, fewer of them.

Risk: the least resolved of the four. The rock tone has to leave the
gunmetal further behind than the concept manages, and the marks have to
stay rare or the board reads as rain. Presented as a direction, not a
finished look.

#### Linocut on a real map, in four inks

`linocut-<ink>.png` is the scene, `linocut-<ink>-crop.png` a 96x56
crop of Greenwood at the game's own zoom (chosen for variety: rock about
half, a lake, a pine stand, two floor families, a few heads set on the
rock beside the lane), and `linocut-<ink>-map.png` the whole 512 board
at four pixels a tile with the samples averaged the way the mipmaps show
it. The carved hand is the same in every one; the ink
(`LINOCUT_PALETTES` in the script) is what changes:

| ink | rock | floors | water |
| --- | --- | --- | --- |
| slate | cool grey-blue | as they are, a touch desaturated | blue |
| ochre | burnt umber | warmed toward ochre | teal |
| night | near-black with bone bands | deep and dark | ink blue |
| bone | dark ink with white bands | pale bone | paper blue |

What the map showed: at the game's zoom a Greenwood room is a big flat
field, and a carved hand has to live with that. The lit and shaded bands
on the rock's edges carry the drawing (they went from four logical
pixels to six for it), and the gouges have to stay rare. Zoomed out, the
bands become the map's own contour. Slate is the safe ink; ochre
separates from gunmetal best; bone is the most linocut and the most
legible zoomed out, and wants a lighter plate under the heads; night is
a mood that would need the swarm's six hues to carry the board.

`linocut-ochre-shade<n>.png` (and `-map.png`) is the SHADE LADDER: ochre
with the hill-side band stepped down from six logical pixels at 0.6
toward black to a two-pixel hairline at 0.2, the lit band stepping down
with it (`LADDER` in the script; `band` on the painter, `dark` and
`light` on the ink are separate dials). Four pixels at 0.45 keeps the
carved edge without framing every room in black; below three the umber
rock and the loam floor lose their boundary, which is the one line the
game cannot do without.

`linocut-ochre-play.png` is the PLAY RENDER: the same window in ochre
with what actually goes on it — the Foundry heads as they ship (the
hand-edited PNGs under `public/foundry/`, on their darkened plates, each
turned toward its nearest walker), the core, and the swarm off the animal
art at its real sizes (Ironhide runts to a champion, two Starhart tiers,
three Stoop bats with drop shadows) — and then the game's own hill-side
shading over it in the renderer's order: the rim shadow on the floor, the
darkness inside the hill over the ground units and the structures, the
flyers above it all. `-unshaded.png` is the same frame without, for the
difference. What it shows: the swarm reads on ochre (crimson and magenta
sit on it without a fight); with the darkness kept, the carved bands
live on the rim cell only and the hill past it is the ramp, so the
linocut is really a treatment of the rim and the floor; and a head two
cells into the rock is drawn under the darkness, as in the game today
(a draw-order fact, not a tile one).

## The recommendation

Mesa, with Chart's stipple at the foot of the cliff if the floor wants
more than a shadow there. It is the direction that says what the game's
terrain means (the plateau is yours, the lane is theirs), it is
neighbour-aware art the atlas already knows how to key, and it leaves
the animals and the Foundry heads exactly where they are.

The first step in any of them is the same and can ship on its own:
warm the stone off gunmetal and drop the violet marsh. The hill-side
shading stays.

## How it ships

`game/terrainFlag.ts` — `LINOCUT_TERRAIN`. On, the board is Linocut in
ochre, the game's own hill-side shading kept over it:

- **The floors and the rock** are painted by `game/tiles.ts` as before,
  under the ink: every floor family's base is warmed toward ochre and
  flat, its one mark a carved tick (variant 0; a third of the cells);
  every rock family's face is burnt umber over its own hue, flat, its
  one mark a gouge. `FLOOR_STYLE` and `WALL_STYLE` are the shifted
  tables while the flag is on, so the dust, the map thumbnails and the
  boulders (which take the wall tones) follow without a second table.
- **The carved bands** are the renderer's: in the wall pass
  (`renderer.ts`, after each wall cell) a rock cell pushes one tinted
  white quad (`UV_SOLID`) per open side — pale on the north and east
  faces, dark on the south and west, `LINOCUT_BAND` logical px deep — and
  a square where only a diagonal neighbour is open. A side is open when
  the cell past it shows its floor (ground, water, a pine); off the map
  is rock. The bands are in the wall family's own ink
  (`wallBandTones`), go into the same static batch (sized up for them)
  and cost nothing per frame. The rim shadow lands on the floor beside
  them and the darkness over the cells behind them, untouched.
- **The water** is painted too (`paintWater`): two teals with a crest or
  two cut into the tile, handed to the same 3x3 block and the same
  swell shader Mindustry's file went through (`atlas.ts`).
- **The trees** pull toward the canopy olive (`leaf` in `PROP_STYLE`).

Off, everything is the flat repaint of Mindustry's set it was, and the
water is Mindustry's, byte for byte. `npm run gen:tiles` writes the
editor's palette icons from whichever painter the flag picks.

### On the turrets' grid

The tiles are painted on the turrets' own 32 px a tile now
(`TILE_LOGICAL` 32, `TILE_SCALE` 1; they were 16 drawn 2x), under the
turrets' rules (`docs/turret-factions.md`, `docs/unit-art.md` 1b):
nothing on a tile narrower than four pixels — the carved tick and the
gouge are five across, the wave crest six, a shade up from the water
rather than a white line — no dither, and every mark
in the family's own light, the pair's other tone and nothing else. The
props take the turrets' shade: the pair's dark on the left half of the
square, its light on the right, and a trunk four px across. The ground,
the heads on it and the animals walking it are one pixel.
