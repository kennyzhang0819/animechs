# Foundry: the player's turret set

Seventeen of the twenty-one turrets started as Mindustry's, sprite for sprite
(`public/stock/README.md`: placeholder art, GPL, to be replaced). The
swarm stopped being Mindustry's first (`docs/unit-art.md`), then the
heads, and now the names: every kind says what the gun DOES — tacker,
lobber, piercer, repeater — and the stock names survive in one place
only, as the filenames of the vendored art under `public/stock`,
which is upstream's tree and is left spelled upstream's way. Foundry is the first
player faction: machine turrets, one metal, every kind its own shape, an
accent per ammo. The heads are in
`docs/turret-concepts/mill-<kind>.png`, rendered by
`FORCE=1 npm run gen:turrets` from `game/turretArt.ts`; those PNGs are
what the game ships ("How it ships", below).

## How a head is drawn, read off the stock art

Read off the four stock sprites that tacker, piercer, barrage and repeater
replaced (in the vendored tree, under their upstream names) rather than
assumed:

- **No outline, no rim, no inset border plate.** Four or five flat colours
  butted against each other. The head sits inside a four-pixel margin
  and the stock base plate (`blocks/turrets/bases/block-N.png`, the one
  the renderer already draws) shows around it.
- **Every material is a pair, dark on the left half and light on the
  right.** That is the whole of the lighting: the tacker's body is
  `#8f665b` left and `#c9a58f` right, the piercer's `#6974c4` and
  `#8aa3f4`. A part is drawn once in a material and the shade is applied
  after, so the shape is symmetric by construction and the shade never is.
- **Cuts are at 45 degrees or straight, nothing narrower than four
  pixels, and every head is authored in pixels on its own grid.** Four
  native px is 2.5 px on the board at 1x, the least that still reads as
  a stroke, and it is the same floor the animals and the ground are
  drawn to. A clearance of four pixels has to be four pixels; rounding a
  unit fraction is how a sliver gets in. A feature that sits on the
  sprite's midline is eight wide, because the shade split cuts it in
  two (a bore may be four: its two shades are one colour). The script
  measures every render on its material layout, before the shade — a run
  of one material under four along any row or column, or one straddling
  the midline under eight — and prints where; the roster renders with
  none.
- **Boxes and octagons only, and a part goes where the octagon is flat.**
  A circle's edge is a stair of single pixels and a circle cut by a
  straight edge leaves a two-pixel stub at each end of the cut, so there
  are no circles: an octagon with a deep chamfer reads as round at field
  zoom. An octagon is flat between its chamfers, and a box laid on it
  either sits inside that flat or reaches past the octagon's edge
  altogether — a straight edge that ends inside a chamfer leaves a wedge
  that tapers to a pixel. A second octagon inside the first is the
  first moved in by the same amount on every side (`inset()`), which
  keeps the band between them one width along the straights and the
  chamfers; the bevel band that used to run along a plate's chamfers
  alone tapered to a point at both ends, so there are no bevel bands.
- **A head is a few parts.** A body, the thing it fires with, one
  accent: barrels with a gunmetal cap and, where the shaft is wide
  enough, a bore; a magazine or a breech in the accent; a window as an
  inset. Not a dressing of studs, vents, shroud bands and rounds — at 2.5
  px a stroke on the board those are noise, and the hand-edited sheet
  this pass replaced had already scraped most of them off. Where the
  stock sprites put their form is in how many plates butt against each
  other, never in more colours: a 3x3 or 4x4 stock top is five colours.
- **A turret is two sprites**: the base plate that never turns, and the
  head the renderer spins to face its target (`top()` in `game/atlas.ts`),
  32 px a tile: 32, 64, 96, 128 for a 1x1 to a 4x4 — the size each head was
  drawn at. The footprints were promoted one step on 2026-09-25 (2x2 to 6x6,
  docs/economy.md), so every head is upscaled on the board until it is redrawn
  at its new size. A head must have a
  front.

## The two rules of the faction

- **One shape a role.** No head is another head at a different size. Tacker
  is two barrels on a copper block; lobber one mortar mouth on a turntable;
  torch a flat wide nozzle with a tank behind; coil a coil and prongs
  with no barrel; autocannon three barrels over a magazine; airburst a bell
  that flares forward; piercer a wedge with capacitors on the flanks;
  douser a tank with a window and one nozzle; tether a dish on a yoke;
  hive a box of missile cells; cleaver three wide short
  tubes; barrage four ringed mouths; deluge the great tank with twin
  nozzles; whirl a rotary cluster on a banded drum; repeater long twin
  barrels with radiator rails; furnace one lens and three capacitor
  banks; railhead a single rail with accelerator rings. The toxin line
  (`docs/elements.md`) vents rather than fires: duster one tall nozzle on a
  gas tank; blighter a wide canister mouth over a hopper; drifter a vent out
  over the shoulders of a blower drum; stinger a bank of four needles on a
  flat breech.
- **One metal, one accent per ammo.** The body is gunmetal
  (`#4d4e58 / #7b7b7b`, the barrage's and the repeater's), the barrels steel
  (`#c1c3d4 / #f4f4f4`, the piercer's), a bore `#2c2d38`. The accent is
  the colour of what the turret throws, in Mindustry's own ammo pairs
  where it has one, and never the colour of a rarity band
  (`game/pixelArt.ts` rule 4):

  | accent | pair | kinds |
  | --- | --- | --- |
  | copper, a bullet | `#8f665b / #c9a58f` | tacker, autocannon, repeater |
  | brass, a shell | `#d99f6b / #f3e979` | lobber, barrage, railhead |
  | ember, flame | `#ec7458 / #ff9c5a` | torch, cleaver |
  | blue, a beam | `#6974c4 / #8aa3f4` | coil, piercer, furnace |
  | water | `#3f4c96 / #5c6dbb` | douser, deluge |
  | mint, a field | `#4fa88a / #8fe0b8` | tether |
  | salmon, a missile or flak | `#da6b68 / #feb380` | airburst, hive, whirl |
  | green, gas | `#3d7a2e / #7cd64a` | duster, blighter, drifter, stinger |

  Railhead is brass and not the beam blue it used to be: its rail is
  drawn in `Pal.bulletYellowBack / bulletYellow`, the warm slug, and the
  accent is the colour of the SHOT, not of the instant line it travels as.

  A player learns eight colours and reads a formation's job across the
  map. The green is the one accent with a colour of the SWARM's anywhere
  near it — the Venom spitters' acid `#d4ff3a` — and the two are kept apart
  by the yellow: the swarm's rot is a chartreuse, the line's a mid green.

A NAME SAYS THE JOB, AND THE NAME IS THE KEY. `roster.json` used to
carry a caption column of proposed names while the stock kind still ran
through the code; both are gone. What a turret is called now describes
what it does — a tacker tacks small rounds down, a douser soaks, a
railhead fires one rail shot — and that word is the kind itself, in
`TOWER_KINDS`, in every table keyed by it, and on the card. Where a
plain word was already taken by something else here (a volley, the flak
class, a patch, the Aegis arc, a starhart's lance, a flood) the turret
took another one, so no name in this file means two things.

### One silhouette a kind

`mill-<kind>.png` is the roster: the round-leaning set (turntables,
drums, a tank with the nozzle on top, a gatling autocannon, a tesla dome),
every turntable an octagon since the four-pixel pass. The cleaver is the
one head that lost its barrels: it throws shards a few tiles, and three
gun tubes said sniper, so it is a drum with one blast face as wide as
itself and a heat band where the face meets the drum. The hive, which
had four round tubes and a rail, is a steel box of four missile cells.
All twenty-two render through the same run check with none flagged.

### The core

The core is now painted in code at ten cells square (`propArt.ts
coreCanvas`, drawn into `UV_BASE` at 320 px): an octagonal slab of slate,
an iron course inside it and a well of the team's amber, in the props'
three bands. What follows is the foundry drawing it replaced, kept for
the record.

The core (`mill-core.png`, `drawCore`) was drawn to the same rules on the
nucleus's 160 px, five cells square: a hard square slab with four square
courses stepping in — slate, iron, slate — to a well of the team's
sharded yellow, its innermost square in the reversed shade and a bore at
the bottom. Sixteen px a course, so every run clears the four-pixel floor
and the well clears the eight-pixel midline one. It is symmetric on both
axes because a building the swarm walks at from every side has no front,
and it is square to the sprite's edge with no chamfer and no margin: a
core is a slab of ground the player holds, not a turret standing on a
plate. It is also the one drawing with metals of its own — slate
`#343846 / #4e5464` and iron `#5a5f6e / #8b90a0`, a step either side of
gunmetal — which is what keeps it from reading as one more head
among the turrets parked around it; a head is still gunmetal, steel and a
bore. While the flag is on the atlas packs it in place of the nucleus and
its overlay; off, the stock composite comes back.

### The plate

A plate is a face and an edge and nothing else: a chamfered octagon of
`#63646b` inset in its cell, and outside it the cell lit off its own
diagonal — `#72797d` above the line, `#484953` below. The middle course
the stock plates carried (the diamond, the hatched well, the ring of
bars) is gone. A head stands on top of it and covers most of it, so what
showed was pattern round the edges competing with the head for the eye;
what a plate has to say is only "there is prepared ground under this",
and an edge says it.

The greys are Mindustry's block plates with every channel at 0.65 — still
grey, a step darker — and they are baked into `base-N.png`, so nothing
darkens a plate a second time at pack time, at draw, or on
`towerBaseIcon`'s PNGs for the placement ghost.

`basePlate` in `game/turretArt.ts` is the drawing, and its inset/chamfer
table is the whole of it; `scripts/turret-concepts.mjs` writes one
`base-N.png` a footprint. The footprints are **1, 2, 3, 4 and 6**
(`PLATE_SIZES`, which `game/foundryArt.ts` reads) — not `1..n`, so
nothing may take a size off an index. The 6x6 is the siege's: the railgun
stands on it (`game/wardenArt.ts` `RAZE_PLATE_TILES`), drawn on a grid one
stock head's margin inside the plate's so the plate shows round it.

### Against the swarm

The animals (`game/animalArt.ts`) and these heads are the same kind of
drawing: flat plates, four or five colours, no outline, nothing under
four pixels, symmetric by construction. Two things differ, both on
purpose. The heads carry Mindustry's turret lighting, dark left and
light right, and the animals do not: a building is lit like a machine
and a body is not, which is one more cue that separates the two sides
at a glance. And the animals carry a family hue on a dark body (gold,
crux red, acid, magenta) while the heads carry a muted ammo accent on
gunmetal, so nothing on the player's side reads as a family. The one
near-collision is the rhino, whose body grey sits close to the gunmetal
ramp; its crux red keeps it on the right side, and if that ever fails
on the board the fix is to warm the rhino, not the turrets. Scale is
the game's own: a 1x1 turret is one tile of 20 world px and a T1 animal
draws at three, so a tacker next to a dagger-sized body is small by design
(`docs/unit-art.md`, "The size").
## How it ships

THE GAME SHIPS THE PNGs ON THE SHEET, and the sheet is a render of
`game/turretArt.ts`. It was edited by hand for a while — the code drew
it once and the edits scraped detail off — and the four-pixel pass
folded those edits back into the code, so the code is the drawing again
and `docs/turret-concepts/mill-<kind>.png` is what `FORCE=1 npm run
gen:turrets` writes; the generator still refuses to overwrite a drawing
without `FORCE=1`, so a hand edit is a choice and not an accident.
`npm run sync:art` copies the sheet into `public/foundry/`, where the
browser can fetch it, and runs before every dev server and every build;
`game/foundryArt.ts` names the files. While `FOUNDRY_ART`
(`game/turretFlag.ts`) is on, `game/atlas.ts` loads every head with the
rest of the sprites and packs it over the stock turret cell through the
same outline + antialias pass the stock top took (`headArt`), draws the
four stock plates darkened by `BASE_DARK` (`plateArt`), and puts the
HUD's turret pictures through the same pass (`towerIcon`); the placement
ghost composes its stamp from the head's own file (`towerGhostIcon`)
over the plate darkened the same way (`game.ts ghostArt`). A kind with no drawing
(the retired fixers) keeps its stock sprite. The flag off still restores
the stock turrets: `public/stock` has been cut to the files the atlas
names, and a fallback a kind names in source is one of them.

`scripts/turret-concepts.mjs` imports the roster from the game module,
so a re-render starts from the same parts the heads were built out of;
`npm run gen:turrets` fills in any of the twenty-two that is missing from
`docs/turret-concepts/` and reports any run under four pixels, and
`FORCE=1 npm run gen:turrets` redraws the lot from the code, which is
the normal way to put an edit to the heads on the sheet.

## The two factions

`PLAYER_FACTIONS` (`game/types.ts`) files every turret under exactly one
faction, checked at the type level the way `UNIT_TREES` checks the swarm.
**Foundry** is the machine line above, the nineteen guns that fire.
**Gasworks** is the toxin line (`docs/elements.md`) — duster, blighter,
drifter, stinger, one a footprint — a faction of four today because more
are coming to it. The split is a grouping and not yet a mode: the sim, the
deal, mods and relics are still keyed by `TowerKind`, the press still
draws over the whole fielded roster, and the card prints the faction's
name. A per-faction deal, when it comes, filters `FIELDED_KINDS` by
`factionOf` and nothing else has to move.
