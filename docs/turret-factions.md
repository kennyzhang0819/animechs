# Foundry: the player's turret set

The seventeen turrets are Mindustry's, sprite for sprite
(`public/mindustry/README.md`: placeholder art, GPL, to be replaced). The
swarm has already stopped being Mindustry's (`docs/unit-art.md`). Foundry
is the first player faction: machine turrets, one metal, every kind its
own shape, an accent per ammo. The concept heads are in
`docs/turret-concepts/mill-<kind>.png`, drawn by
`node scripts/turret-concepts.mjs`; nothing is wired into the game.

## How a head is drawn, read off the stock art

Read off `duo.png`, `lancer.png`, `ripple.png` and `spectre.png` rather
than assumed:

- **No outline, no rim, no inset border plate.** Four or five flat colours
  butted against each other. The head sits inside a four-pixel margin
  and the stock base plate (`blocks/turrets/bases/block-N.png`, the one
  the renderer already draws) shows around it.
- **Every material is a pair, dark on the left half and light on the
  right.** That is the whole of the lighting: the duo's body is
  `#8f665b` left and `#c9a58f` right, the lancer's `#6974c4` and
  `#8aa3f4`. A part is drawn once in a material and the shade is applied
  after, so the shape is symmetric by construction and the shade never is.
- **Cuts are at 45 degrees or straight, nothing thinner than two pixels,
  and every head is authored in pixels on its own grid.** A clearance of
  two pixels has to be two pixels; rounding a unit fraction is how a
  one-pixel sliver gets in. The script checks every render for a pixel
  whose same-colour neighbours all lie on one line through it (a lone
  pixel or a one-pixel stroke, straight or diagonal) and prints where;
  the roster renders with none. What the check taught: a circle drawn
  near a 45-degree chamfer runs parallel to it and leaves a one-pixel
  diagonal between them (so the arc and the swarmer carry no bevel band);
  two circles with different centres leave a crescent (so a window is
  concentric with its tank); and any feature centred on the sprite's
  midline has to be at least four pixels wide, because the shade split
  cuts it in two.
- **A head is built from parts, not shapes.** A chamfered plate with a
  bevel band along its chamfers, drawn in the reversed shade; barrels
  with a wider muzzle brake, a bore, shroud bands and an accent collar at
  the root; magazines with the rounds showing; vents as stacked bars;
  studs as small diamonds; capacitor banks with charge bands; a raised
  breech between the barrels of the heavies. Where the stock sprites put
  their form is in how many plates butt against each other, never in more
  colours: a 3x3 or 4x4 stock top is five colours.
- **A turret is two sprites**: the base plate that never turns, and the
  head the renderer spins to face its target (`top()` in `game/atlas.ts`),
  32 px a tile: 32, 64, 96, 128 for a 1x1 to a 4x4. A head must have a
  front.

## The two rules of the faction

- **One shape a role.** No head is another head at a different size. Duo
  is two barrels on a copper block; hail one mortar mouth on a turntable;
  scorch a flat wide nozzle with a tank behind; arc a coil and prongs
  with no barrel; salvo three barrels over a magazine; scatter a bell
  that flares forward; lancer a wedge with capacitors on the flanks;
  wave a tank with a window and one nozzle; parallax a dish on a yoke;
  swarmer a box of missile cells; fuse a broadside of three wide short
  tubes; ripple four ringed mouths; tsunami the great tank with twin
  nozzles; cyclone a rotary cluster on a banded drum; spectre long twin
  barrels with radiator rails; meltdown one lens and three capacitor
  banks; foreshadow a single rail with accelerator rings.
- **One metal, one accent per ammo.** The body is gunmetal
  (`#4d4e58 / #7b7b7b`, the ripple's and the spectre's), the barrels steel
  (`#c1c3d4 / #f4f4f4`, the lancer's), a bore `#2c2d38`. The accent is
  the colour of what the turret throws, in Mindustry's own ammo pairs
  where it has one, and never the colour of a rarity band
  (`game/pixelArt.ts` rule 4):

  | accent | pair | kinds |
  | --- | --- | --- |
  | copper, a bullet | `#8f665b / #c9a58f` | duo, salvo, spectre |
  | brass, a shell | `#d99f6b / #f3e979` | hail, ripple |
  | ember, flame | `#ec7458 / #ff9c5a` | scorch, fuse |
  | blue, a beam | `#6974c4 / #8aa3f4` | arc, lancer, meltdown, foreshadow |
  | water | `#3f4c96 / #5c6dbb` | wave, tsunami |
  | mint, a field | `#4fa88a / #8fe0b8` | parallax |
  | salmon, a missile or flak | `#da6b68 / #feb380` | scatter, swarmer, cyclone |

  A player learns seven colours and reads a formation's job across the
  map.

The proposed names in `roster.json` (Pinion, Lobber, Torch, Sparker,
Triplet, Bellow, Kiln, Sluice, Halo, Quiver, Broadside, Bombard,
Floodgate, Grindstone, Crucible, Furnace, Railspike) are captions only;
the stock kind stays the key everywhere in the code.

## Shipping it

A faction is a skin over the one roster, never a second roster: the sim,
the deal, mods and relics are keyed by `TowerKind`, and a faction changes
what a duo looks like, not what it does. `UV_TURRETS` (renderer) and
`TOWER_ICONS` (`towerIcons.ts`) take a faction; the icon pipeline
(`turretIcon`) is unchanged because the heads go through the same pass
as the stock tops. It ships the way the animals shipped: generated at
load with the pixel engine, packed over the stock cells behind a flag
(`packAnimalArt`, `ANIMAL_ART`), judged in the built game on a full wave,
zoomed out. The base plates stay Mindustry's four until the whole set is
original.
