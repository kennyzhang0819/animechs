# Unit art: the style, and how big a unit is

This is the direction the enemy art settled on after the animal trial
(`game/animalArt.ts`, behind `ANIMAL_ART` in `game/animalFlag.ts`), written
down so the next family is drawn to the same rules without re-running the
trial. The Starhart stags and the Stoop bats are the reference
implementation, and the Ironhide rhinos, Weaver spiders, Skate mantas
and Livewire eels were drawn to this page; the pixel engine and the house rules they obey are in
`game/pixelArt.ts`, and the packing in `game/atlas.ts`.

## 1. The style

**Every family is one animal, drawn the way you would draw that animal
from above.** Not a machine with animal features, and not an insect. The
trial went through plant mechs, "animals with fewer legs" and several
insect-adjacent rounds before the actual finding: the legged rig was
making everything a spider. A frog does not have eight radial legs. Draw
the animal's real top-down silhouette first, then fit the rig to it, never
the other way round.

- **One animal per family, one gimmick per family, unchanged.** The
  families are renamed for the animal, the gimmick stays what it was:
  Ironhides (rhino) are the ground mechs, Weavers (spider) the venom
  spitters, Starhart (stag) the starlight mechs, Stoop (bat) the skyfall
  bombers, Skates (manta) the harpoon fleet, Livewires (electric eel)
  the wraith fleet. The family accent colours in `PAL` (`game/constants.ts`)
  carry across: the stag's glows are star-gold, the bat's charge is
  magenta.
- **A body is its family and how far up it stands. No proper nouns.** The
  family word goes in `FAMILY_NAMES.body` and the five steps are the same
  for every line — **runt, brute, elite, champion, apex** (`UNIT_RANKS`,
  `game/levels.ts`) — so a tier reads `Ironhide (runt)` through
  `Ironhide (apex)`. That is the rule above said out loud: five tiers are
  ONE animal growing up, and a tier with a name of its own says the
  opposite. `UNIT_NAMES` is built off `FAMILIES`, so a family added to
  that table is named the moment it has a `body` word and cannot go in
  half-named.
- **The id says the same thing.** `UnitKind` is `<family><tier>` —
  `ironhide1` to `livewire5`, plus `boss` — in the sim's arrays and in
  every wave of `public/levels/campaign.json`. **No upstream unit name
  survives in the codebase**, and a new family must not reintroduce one:
  the only place Mindustry's vocabulary is still written is the sprite
  paths in `game/atlas.ts`, which are the real filenames under
  `public/mindustry` that the animal art packs OVER. Nothing in the UI
  prints a kind — it prints `unitName(kind)` — and a portrait comes off
  the packed sheet (`components/unitIcons.ts`), never from a sprite file
  a drawn family does not have.
- **Five tiers are one animal growing up, not five animals.** The T1 is
  the same silhouette as the T5, small. What changes up the ladder is
  scale, stance and ornament: the stag's crown gains beams and tines, the
  bat's wingspan outgrows its body. Never introduce a new body plan
  mid-family.
- **Legs stay tucked until T4.** T1 to T3 are small and concise: a compact
  body, tiny feet peeking out, nothing splayed. Only T4 and T5 open their
  stance out, and those two are the only ones that ride the legged rig
  with real planted legs. This is the single most important rule in this
  file. A spread stance at T2 reads as a bug, and the whole family reads
  as bugs after it. The one exception is the family that IS a bug: the
  Weaver spider is legged at every tier, because a spider's legs are its
  silhouette and a spider with them tucked is a bead.
- **Flat plates, no outlines, nothing thinner than two pixels.** The
  Mindustry rules from `game/pixelArt.ts`: four or five butted colours,
  no dark contour, no bevel. The atlas adds the rim itself (`outlined()`,
  `silhouetted()`), so a drawing that bakes one in gets two.
- **Plating runs down the body, not across.** A horizontal cut on a
  symmetrical body is a face, and the eye finds it instantly. Segment
  along the spine; put the horizontal breaks only where the animal really
  has one (the bat's head against its shoulders).
- **No eyes.** A pair of dark dots on a top-down body reads as dirt at
  field zoom and as a cartoon up close. The head is a shape: a wedge, a
  snout, a jaw plate, horns. The spiders and eels shipped with eyes once
  and lost them; do not put them back on the next animal.
- **Symmetric by construction.** Draw the left half, mirror it
  (`symmetrize`). Hand-mirrored art drifts by a pixel and the drift is
  visible at every scale.
- **Draw facing up on a square grid, like a Mindustry sprite file.** The
  packer rotates to face +x (`sprite()`), team-tints, anti-aliases and
  silhouettes exactly as it does the stock PNGs, so an animal goes through
  the same pipeline as an ironhide1 and sits next to one without looking
  pasted on.
- **Animate with the rigs that exist.** Mech rig for T1 to T3 (one hoof
  sprite mirrored and slid by the walk cycle), legged rig for T4 and T5
  (sim-planted IK legs stroked between mount, knee and foot, with a
  shoulder cap and knee cap), for flyers and hulls a body plus one
  mirrored wing that folds toward its root on a sine (`pushWings`,
  `FLYER_PARTS`), and for anything long and legless the worm rig: a
  chain of segments the sim drags behind the head, each drawn along the
  chain with a swimming wave (`SegmentSpec`, `SEGMENT_ART`,
  `pushSegments`). A new family should need a new drawing, not a new
  renderer path; a centipede is the worm rig with legs drawn on.
- **Stock art is never deleted.** `public/mindustry/` is untouched. A
  trial family draws into its own cells and is packed OVER the stock
  family's cells in `packAnimalArt` while the flag is on. Turn the flag
  off and the stock swarm is back, byte for byte.

## 2. The size

The trial's second finding was that a unit drawn faithfully to its stock
pixel count looks small, and that a T4 or T5 that is merely "bigger" is
not enough. **T1 and T2 must be readable at the default zoom, and T4 and
T5 must be massive, an immediate "oh no" on the screen.** Three things
set a unit's size, and all three have to move together.

### The three numbers

| what | where | what it does |
| --- | --- | --- |
| the cell | `sprite("name", cell, art)` in `game/atlas.ts` | how many native pixels the drawing gets. 64, 128, 192, 256 or 384 |
| the quad | `UNIT_ART[k].sprite`, `MechArt.sprite`, `LegArt.sprite`, `FlyerParts.sprite` | the drawn size in world px. A cell draws at `cell × 0.625` world px (`PX = UNIT_SPRITE / 64`), so 64 is 40 world px, 128 is 80, 256 is 160 |
| the hitbox | `radius` in `UNIT_STATS` (`game/levels.ts`), in units of `UR` = 10 world px | half the square collision box. Left where the stock family put it in the trial |

One tile is 20 world px (`CELL`). A 64-cell quad is two tiles across.

### The rule: fill the cell, then overshoot

1. **Draw to the edge of the cell.** A drawing with a quarter of its grid
   empty is a unit a quarter smaller than the cell already paid for. The
   stag's body ellipse and the bat's wingspan are sized against the grid
   (`R`, `W` in the tier tables), not against the stock sprite.
2. **Pick the smallest cell that holds the art.** 64 for the two small
   tiers, 128 for the middle, 256 (or a 384) for the two big ones. Every
   part of one unit takes the same cell size, because the renderer draws
   them all at one scale; the exception is a leg segment, which is
   stretched between two points and takes its exact rect (`flat()`).
3. **Overshoot the quad by a per-tier `scale`.** This is what the trial
   added: the world quad is the cell's nominal size times the tier's
   scale, so the drawing lands larger than its pixels say. The scale is
   applied to EVERYTHING that positions a part of that unit, together, or
   the parts drift apart from the icon: the icon quad, the mech body,
   base and hoof, the legged body, caps and foot, the leg stroke widths,
   the wing quad and its root and centre offsets. See the `if
   (ANIMAL_ART)` block in `game/atlas.ts`; it is the one place the scale
   is applied.
4. **The ladder should be steep.** What ships lands the small tiers at
   one and a half to two times the stock sprite and the big ground tiers
   at two and a half, and the scale itself climbs the ladder (the stag
   runs 1.5, 1.5, 1.4, 1.6, 2.0). Small tiers are scaled up for
   legibility, big tiers for dread. If a T5 does not look wrong next to
   its T1, it is not big enough.

### What the trial ships

Native cell, per-tier scale and the quad that results, next to the stock
sprite's own world size (stock native px × 0.625).

Starhart, the stag (Starlight mechs' cells):

| tier | kind | cell | scale | quad, world px | stock, world px | hitbox radius |
| --- | --- | --- | --- | --- | --- | --- |
| T1 | starhart1 | 64 | 1.5 | 60 | 35 | 10 |
| T2 | starhart2 | 64 | 1.5 | 60 | 42 | 13.75 |
| T3 | starhart3 | 128 | 1.4 | 112 | 50 | 16.25 |
| T4 | starhart4 | 256 | 1.6 | 256 | 106 | 30 |
| T5 | starhart5 | 256 | 2.0 | 320 | 134 | 36.25 |

Stoop, the bat (Skyfall bombers' cells):

| tier | kind | cell | scale | quad, world px | stock, world px | hitbox radius |
| --- | --- | --- | --- | --- | --- | --- |
| T1 | stoop1 | 64 | 1.4 | 56 | 30 | 11.25 |
| T2 | stoop2 | 128 | 1.2 | 96 | 45 | 13.75 |
| T3 | stoop3 | 128 | 1.5 | 120 | 70 | 25 |
| T4 | stoop4 | 256 | 1.4 | 224 | 150 | 57.5 |
| T5 | stoop5 | 384 | 1.6 | 384 | 200 | 72.5 |

Ironhide, the rhino (ground mechs' cells; mech rig to T3, four legs from T4):

| tier | kind | cell | scale | quad, world px | stock, world px | hitbox radius |
| --- | --- | --- | --- | --- | --- | --- |
| T1 | ironhide1 | 64 | 1.5 | 60 | 30 | 10 |
| T2 | ironhide2 | 64 | 1.6 | 64 | 40 | 12.5 |
| T3 | ironhide3 | 128 | 1.4 | 112 | 62 | 16.25 |
| T4 | ironhide4 | 256 | 1.6 | 256 | 106 | 27.5 |
| T5 | ironhide5 | 256 | 2.0 | 320 | 134 | 37.5 |

Weaver, the spider (venom spitters' cells; legged rig at every tier, six legs on the T1 and eight above):

| tier | kind | cell | scale | quad, world px | stock, world px | hitbox radius |
| --- | --- | --- | --- | --- | --- | --- |
| T1 | weaver1 | 64 | 1.5 | 60 | 30 | 10 |
| T2 | weaver2 | 128 | 1.1 | 88 | 55 | 16.25 |
| T3 | weaver3 | 128 | 1.4 | 112 | 59 | 18.75 |
| T4 | weaver4 | 256 | 1.6 | 256 | 80 | 28.75 |
| T5 | weaver5 | 256 | 2.0 | 320 | 119 | 32.5 |

Skate, the manta (harpoon fleet's cells; body and two beating wings, as the bat):

| tier | kind | cell | scale | quad, world px | stock, world px | hitbox radius |
| --- | --- | --- | --- | --- | --- | --- |
| T1 | skate1 | 128 | 1.2 | 96 | 49 | 12.5 |
| T2 | skate2 | 128 | 1.3 | 104 | 63 | 16.25 |
| T3 | skate3 | 256 | 1.1 | 176 | 88 | 25 |
| T4 | skate4 | 256 | 1.5 | 240 | 143 | 48.75 |
| T5 | skate5 | 384 | 1.7 | 408 | 219 | 72.5 |

Livewire, the eel (wraith fleet; the worm rig, no overshoot). Its size is
the chain's, not a quad's: head, then `count` segments at `spacing`, then
the tail. Head and segment cells are sized to the art, one px over the grid.

| tier | kind | head cell | segment cell | count | spacing, world px | nose to tail, tiles |
| --- | --- | --- | --- | --- | --- | --- |
| T1 | livewire1 | 48 | 36 | 4 | 16 | 5 |
| T2 | livewire2 | 72 | 52 | 5 | 23 | 8 |
| T3 | livewire3 | 96 | 72 | 7 | 32 | 14 |
| T4 | livewire4 | 128 | 100 | 7 | 44 | 19 |
| T5 | livewire5 | 184 | 140 | 7 | 62 | 27 |

The eel's icon is its head cell, so it reads small on a card next to a
manta's; that is the price of the chain and was accepted.

The spider's legs are the size that matters for that family: leg length
runs 12, 18, 26, 50 and 60 Mindustry units up the ladder against the
stock line's 5 to 20, so the apex spans some twenty tiles foot to foot
on a body drawn at sixteen.

The T4 and T5 stags also get longer legs than the stock walkers
(`LegSpec.length` 26 and 38 Mindustry units against the stock T5's
14, with `baseOffset` and `elevation` raised to match), because a big
body on short legs squats. The leg spec lives in `game/levels.ts` next to
the kind, behind the same flag.

### Hitboxes

The trial did not touch `radius`. A T5 stag is drawn at 320 world px and
collides as a 72 px square, which means turret fire aimed at its
silhouette can miss its box. Whether the box grows to match the art is a
balance decision (it changes how the horde packs into a choke and what a
splash catches), not an art one, and is left for whoever tunes the
families next. If it does grow, grow it with the art's body, not its
antlers or wingspan.

## 3. Adding a family

1. Pick the animal and draw the T5 first, facing up, symmetric, filling
   a 256 grid. If it does not read as that animal in silhouette, stop
   there.
2. Shrink it to a T1 on a 64 grid with the legs tucked. If it still reads
   as the animal, the family works. Fill in T2 to T4 between.
3. Decide the rig per tier (mech for the small ground tiers, legged for
   T4 and T5 ground, body plus wings for a flyer) and draw the parts the
   rig needs: hoof sprite, or body, base, caps and foot, or body and one
   wing.
4. Declare the cells in `game/atlas.ts` with `sprite()`, `upright()` or
   `flat()`, pack them in `packAnimalArt`, and set the per-tier scale in
   the `if (ANIMAL_ART)` block, applied to every part together.
5. Name it, which is two words. `FAMILY_NAMES` (`game/levels.ts`) takes
   the family's `name` and the singular `body` its tiers are called
   after, and its five kinds are `<body><1..5>` in lower case. The ranks
   are already there and are the same for every family. Nothing else has
   to change: `UNIT_NAMES` builds itself off `FAMILIES`, every panel
   prints `unitName(kind)`, and the portraits come off the packed sheet.
6. Check in the built game, not in a preview. The preview tooling draws
   the art at scale but cannot show the rig moving, and the walk cycle is
   where a stance goes wrong. Spawn all five tiers side by side with the
   stock family and look at both zoomed out.
