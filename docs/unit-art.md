# Unit art: the style, and how big a unit is

This is the direction the enemy art settled on after the animal trial
(behind `ANIMAL_ART` in `game/animalFlag.ts`), written down so the next
family is drawn to the same rules without re-running the trial. All six
families are on the turrets' grammar now (section 1b): the Ironhide rhino
in `game/ironhideArt.ts`, the Starhart stag, Stoop bat, Dartback poison frog,
Skate manta and Livewire narwhal in `game/familyArt.ts`, on the turret
engine in `game/turretArt.ts`, with what they share in
`game/animalArt.ts` and the packing in `game/atlas.ts`.

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
  Ironhides (rhino) are the ground mechs, Dartbacks (poison frog) the venom
  spitters, Starhart (stag) the starlight mechs, Stoop (bat) the skyfall
  bombers, Skates (manta) the harpoon fleet, Livewires (narwhal) the
  wraith fleet. The family accent colours in `PAL` (`game/constants.ts`)
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
  as bugs after it. The one exception is the frog, legged on four from
  T2 because a frog's folded legs are its outline — and the spider that
  held that exception before, legged on eight at every tier, is exactly
  what this rule exists to prevent: it was retired for being
  uncomfortable to look at.
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
  snout, a jaw plate, horns. The spiders and the eels shipped with eyes
  once and lost them, and the narwhal's T5 briefly had a pair of
  electrodes on its melon that read the same way; do not put a pair of
  anything on a head. Two of something on a head are eyes.
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
  chain of segments the sim drags behind a neck that sways as the head
  moves, so the swim is a real curve travelling down the body, each
  segment drawn as its own plate along the chain (`SegmentSpec`,
  `SEGMENT_ART`, `pushSegments`). Slow and wide: a cycle every eight
  segments of path. Never animate a chain by offsetting sprites in the
  renderer; that vibrates. The eels rode the worm rig and were replaced
  by the narwhal, which is a rigid body on the wing rig; the rig has no
  rider today and stays for the centipede, which is the worm rig with
  legs drawn on. A new family should need a new drawing, not a new
  renderer path.
- **Stock art is never deleted.** `public/mindustry/` is untouched. A
  trial family draws into its own cells and is packed OVER the stock
  family's cells in `packAnimalArt` while the flag is on. Turn the flag
  off and the stock swarm is back, byte for byte.

## 1b. The turrets' grammar: where the art is going next

Foundry's heads (`public/foundry`, `docs/turret-factions.md`) set a
stricter grammar than the trial above, and every family is drawn to it
(`game/ironhideArt.ts`, `game/familyArt.ts`, on the turret engine in
`game/turretArt.ts`). Read off the shipped heads:

- **Every colour is a pair, dark and light.** The dark on the left half
  of the sprite, the light on the right, and that is the whole of the
  lighting: no lit top, no dark underside, no third tone, no dither. A
  part is drawn once in its material and the shade falls on it after
  (`finish`), so the shape is symmetric by construction and the shade is
  never. A part in the REVERSED pair (`rev`) catches light the other way,
  and that is how a fold, a band or a bevel is shown — the duo's light
  wedge in its dark half, the rhino's shoulder fold.
- **Nothing under four pixels.** No line, gap, stud, band or highlight
  narrower than four. The one-pixel checker the trial used for mottled
  hide is gone with the rest. A feature on the midline has to be at
  least four wide, because the shade split cuts it in two.
- **The scale is the turrets'.** 32 native px a tile, so a body is drawn
  at its hitbox: an ironhide1 is a 1x1 (radius `UR` = 10 world px, one
  20 px tile) and draws on a 32 grid, like a duo; an ironhide5 is a
  3.75x3.75 and draws on 120. There is no overshoot on these — the quad
  is the box — which retires rule 3 of "The size" below for a family on
  this grammar. The sheet's 0.625 world px per native px puts 32 px on
  one tile, the same constant the turrets ride.
- **Still no eyes, and now no round pair anywhere.** Two discs side by
  side read as eyes at every size; the rhino's pauldrons had crimson
  centres for one render. Pairs of plates and stacks are fine.
- **Facing up, on its own square grid, through the same packer.** The
  animals' rigs are unchanged: the rhino still rides the mech rig to T3
  and four planted legs from T4, on legs shortened to the smaller body
  (`game/levels.ts`).

The pixel budget per tier is the hitbox: 32, 40, 52, 88, 120 for the
rhino, and section 2 has the rest. What fits in 32 is what fits in a duo — a body, a head, a horn
and one accent block — and that is the point: a T1 next to a 1x1 turret
is the same kind of drawing at the same size.

## 2. The size: the hitbox, on 32 px a tile

Every family is on the turrets' grammar now, so a body's grid IS its
hitbox in native px (`UR` = 10 world px = 16 native px, so a 1x1 is 32)
and there is no per-tier scale anywhere: the art sits at native size
inside the stock cell, the quad is the cell's own, and the sheet's 0.625
world px per native px lands the drawing on its box. The trial's
"overshoot" rule is retired; what a tier gets is what a turret of its
footprint gets.

| family | file | rig | grids T1..T5 (native px = hitbox) |
| --- | --- | --- | --- |
| Ironhide, the rhino | `game/ironhideArt.ts` | mech to T3, four legs from T4 | 32, 40, 52, 88, 120 |
| Starhart, the stag | `game/familyArt.ts` | mech to T3, four legs from T4 | 32, 44, 52, 96, 116 |
| Dartback, the poison frog | `game/familyArt.ts` | mech as a runt, four legs from T2 | 32, 52, 60, 92, 104 |
| Stoop, the bat | `game/familyArt.ts` | body and two wings | 36, 44, 80, 184, 232 |
| Skate, the manta | `game/familyArt.ts` | body and two wings | 40, 52, 80, 156, 232 |
| Livewire, the narwhal | `game/familyArt.ts` | body and two flippers | 44, 56, 80, 176, 232 |

The ground tiers (`IronTier`) carry the mech rig's stride, the legged
rig's small grid and the two leg segment heights; a segment is a flat
band of the family's hide, its top half dark and its bottom light, on the
exact rect the atlas declares (`flat()`) off the same table. The winged
tiers (`FlyerTier`) are the composed grid plus the beat, and their cells
are derived, not declared: the body column's width `bw` and the wing
cell `nw` come off the layout (`withCells`), and `partCells` in
`game/atlas.ts` reserves both. The composed sprite goes in the kind's
own stock cell.

### How a width is chosen

The only unit is the scaler's `w()`, which is a 32-grid value scaled to
the tier and never under four. Every concentric feature is stacked in
those units — a seam `±U` on a saddle `±2U` on a body `±3U` — so the
hide or steel left beside a feature is a unit too, on every grid. A
feature placed by eye on the 32 layout and scaled leaves a two-pixel
sliver on some tier; a feature built from units cannot. Where a body is
too narrow for the stack (the bat's two small tiers), the feature takes
the whole width rather than most of it.

### Legs

The frog's four legs run 14, 16, 24 and 30 Mindustry units from T2 on
mounts 6 to 12 out, so every tier crouches on legs a little past its
body and the apex strides. The rhino's are 14 and 19 units on
55 and 75 world px bodies; the stag's 26 and 38 on 60 and 72.5, a
stag's legs being long. The leg spec lives in `game/levels.ts` next to
the kind, behind the same flag.

### Hitboxes

`radius` was not touched: the art moved to the box, not the box to the
art. Turret fire aimed at a silhouette now hits it.

## 3. Adding a family

1. Pick the animal and draw the T5 first on the turret engine, facing
   up, left half only, on its hitbox grid. If it does not read as that
   animal in silhouette, stop there.
2. Scale the same layout to the T1 (a 32 grid for a 1x1) with the legs
   tucked. If it still reads as the animal in four-pixel blocks, the
   family works. Fill in T2 to T4 between.
3. Decide the rig per tier (mech for the small ground tiers, legged for
   T4 and T5 ground, body plus wings for a flyer) and draw the parts the
   rig needs: hoof sprite, or body, base, caps and foot, or body and one
   wing.
4. Declare the cells in `game/atlas.ts` with `sprite()`, `upright()`,
   `flat()` or `partCells`, pack them in `packAnimalArt` through
   `packMech`, `packLegged` or `packWinged`, and wire the rig in the
   `if (ANIMAL_ART)` block. No scale: the grid is the hitbox.
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
