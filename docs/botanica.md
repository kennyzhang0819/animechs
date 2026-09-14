# Botanica: the second faction, from scratch

Foundry (`docs/turret-factions.md`) is Mindustry's seventeen turrets
redrawn. Botanica is not a skin over them: it is its own roster of
plants, each one designed from the ground up — what it is, what it
does, how it attacks, how it grows — with the art drawn from above at
32 px a tile by `scripts/botanica-faction.mjs` into `docs/botanica/`.
**There is no plate under a plant. You place a tree, and it is just a
tree.** The footprint is the plant's own spread.

Nothing here is wired in. The sim's pieces it reuses and the pieces it
would need are listed at the end.

## The idea

A Foundry turret is finished the instant it lands. A plant is
**planted**: it comes up as a seedling at a fraction of its stats and
**grows** to full over a fixed time (`GROW_TIME`, 45 s for a 1x1 up to
120 s for a 4x4), which is the faction's whole bargain. Plants are
cheaper per tile of ground than machines, they heal themselves slowly
(sap), and a bed of them is stronger than the sum of its plants because
**roots share**: every plant within two tiles of another gets +1 armour
per neighbour, to a cap of five. In exchange the first minute after a
card lands is the bed's weakest, and the swarm that arrives during it
finds saplings. Placement is still a card off the deal, a formation of
four to thirty-six; the shapes are seed packets and the ground they land
on is a bed.

Bands map onto the same four the deal already uses, with the same
counts (6 / 5 / 3 / 3), so `rollTurret` and the formation table work
unchanged.

## The roster

Sizes are in tiles. "Turns" means the whole plant rotates to face its
target, like a turret head; the rest never turn. Damage is per hit at
full growth, against the stock roster's numbers for scale (a duo round
is 9, a ripple shell 40, a spectre round 104).

### Common

| plant | size | turns | attack | pattern | notes |
| --- | --- | --- | --- | --- | --- |
| **Sapling** | 1x1 | no | flicks seeds | two 8-damage seeds every 0.5 s at the nearest body, ground and air, 8 tiles | the duo's job. A sapling is what every bed starts as; at full growth its seeds pierce once |
| **Thornbush** | 1x1 | no | thorns | no projectile: every body pressing against it takes 6 a second, ground | the plant you put across a lane. The swarm has to chew through it, and it bites back. High health, no reach |
| **Puffcap** | 1x1 | no | spore cloud | every 3 s, a cloud four tiles across around itself: 4 a second and a 30 % slow for as long as a body stands in it, ground and air | spores float, so it is the cheap answer to flyers. Clouds from two caps stack their slow, not their damage |
| **Dewvine** | 2x2 | no | lashes | a whip that sweeps a 90° cone six tiles out, 22 damage to every body it crosses, every 1.2 s, ground | the flak of the ground: it hits crowds, not columns |
| **Sunflower** | 2x2 | yes | light beam | charges 1 s, then a beam that pierces everything on its line for 110, 9 tiles, ground | the lancer's job. Fires 25 % faster while a Solar Bloom stands within six tiles |
| **Pitcher** | 2x2 | no | lobs sap gourds | a gourd every 2 s, 15 tiles, splash two tiles, and everything splashed **rots** (the swarm's own poison, turned round: 5 a second for 6 s, pierces armour), ground | the hail's job. Rot is the faction's answer to the Ironhide's plating |

### Uncommon

| plant | size | turns | attack | pattern | notes |
| --- | --- | --- | --- | --- | --- |
| **Willow** | 3x3 | no | tendrils | holds up to four bodies within five tiles in place for 2 s each (the parallax's pull, without the pull), and every held body takes 10 a second, ground | a crowd control anchor for a bed: what it holds, the sunflowers behind it hit |
| **Cannon Fig** | 2x2 | yes | fires figs | a fig every 0.9 s, 10 tiles, bursts on impact for 30 in a one-tile splash, ground and air | the scatter's job, with reach |
| **Oak** | 3x3 | no | drops acorns | six acorns every 3 s in a ring around itself, each 40 with a one-tile splash, 4 to 12 tiles, ground | the ripple's job, with no minimum range: an oak is dangerous to stand under. Its canopy gives every plant within three tiles +2 armour on top of roots |
| **Snapdragon** | 2x2 | yes | bites | one bite every 1.5 s for 180 at the first body within three tiles, ground | the fuse's job: the thing that stops what walks up to the bed |
| **Firefly Reed** | 1x1 | no | sparks | every 1.4 s a spark that chains to three bodies within four tiles, 14 each, ground and air | the arc's job. Cheap, and the only common-band plant that reaches the air besides the puffcap |

### Rare

| plant | size | turns | attack | pattern | notes |
| --- | --- | --- | --- | --- | --- |
| **Kudzu** | 3x3 | no | spreads | every 20 s it grows a **runner** onto a free tile touching it or one of its runners, up to eight; a runner is a 1x1 thornbush that costs nothing, and dies with the kudzu | the one plant that changes the map. A kudzu across a chokepoint closes it in three minutes, and the swarm reroutes around a bed it did not walk into |
| **Bombardier** | 3x3 | no | bursts | every 4 s it throws six seeds that land in a two-tile ring around a point up to 14 tiles away, each 45 with a one-tile splash, ground | the ripple as a shotgun: a wide, delayed burst, best on a lane the swarm walks in a column |
| **Corpse Flower** | 3x3 | no | stench | every 8 s a wave six tiles out from itself: every body in it takes 60, rots, and is shoved back a tile, ground and air | the wave's push and the pitcher's rot on one bloom. A bed with one in the middle is a bed the swarm cannot press |

### Ultra Rare

| plant | size | turns | attack | pattern | notes |
| --- | --- | --- | --- | --- | --- |
| **World Ash** | 4x4 | no | roots erupt | three root spikes every 2 s anywhere within 12 tiles, each 150 to what it comes up under and a one-tile splash, ground; every plant within six tiles heals 1 % a second | the spectre's job, and the bed's heart |
| **Venus Colossus** | 4x4 | yes | swallows | every 4 s it swallows the strongest body within four tiles: anything T3 or below dies outright, a T4 or T5 takes 900, ground | the foreshadow's job as a single bite. It turns, slowly |
| **Solar Bloom** | 4x4 | yes | sunbeam | a continuous beam like the meltdown's, 40 a tick, 10 tiles, ground and air; every sunflower within six tiles fires 25 % faster | the meltdown, and the reason to plant sunflowers |

### The core: Heartwood

A stump five cells square, the team's colour at its heart. It has the
core's pool and does nothing else; a bed grows around it.

## The art

Every plant is drawn to the Foundry rules (`game/turretArt.ts`): flat
plates, a material's dark on the left and light on the right, nothing
under two pixels, symmetric by construction, through the same one-pixel
check with none flagged. The materials are bark, leaf, pale, moss and a
few fruits, plus the swarm-safe colours a plant can own: a mushroom cap,
olive sap, hazelnut, fig, dew, a spark, the corpse flower's maroon.

A canopy is drawn to the footprint's edge, not inside a margin, because
there is no plate to show around it. Two things follow for the game: a
static plant's cell packs `upright` like a plate (`flat()`), and a plant
that turns packs like a head (`top()`) with the whole drawing turning,
so those five are drawn round enough to turn.

## What the sim has, and what it would need

Already there: bullets (seeds, figs, gourds, acorns, spikes as artillery
with splash), the lancer's charge-and-pierce beam, the meltdown's
continuous beam, chain lightning (the arc), the parallax's target lock,
the wave's push, rot (`Tower.poison`'s mirror on a body), heal fields
(the mender's `heal.percent`), armour per structure, `targetAir` /
`targetGround`, and the deal, formations, mods and relics keyed by kind.

New work, in the order it earns its keep:

1. **Growth** — a per-structure age and a stat ramp from it; the sap
   heal is the same age tick.
2. **Roots** — a neighbour count over a structure's ring, folded into
   its armour the way `TOWER_ARMOR_BY_SIZE` is.
3. **Contact damage** — the thornbush's aura over bodies pressed against
   it: the sim already knows who is pressing (`STRUCTURE_COST` routing
   puts them there), so it is a tick over that set.
4. **Clouds** — a standing area status (the puffcap, the corpse flower's
   wave is the wave's push plus rot).
5. **Runners** — a structure that places structures (the kudzu); the one
   piece that touches placement rules, and the reason it is Rare.
6. **Swallow** — a single-target execute with a tier threshold.

Faction selection is the one new switch on the deploy screen, and the
save carries it; the roster behind the deal is the faction's table
instead of `TOWERS`.
