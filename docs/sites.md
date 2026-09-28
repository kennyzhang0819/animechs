# Side sites

**Small structures the map generator puts on a rolled board, each a cost
and a reward.** `game/sites.ts` is the table, `game/mapgen.ts` rolls and
places them, `Sim.raiseSites` stands them up, and `Game.offerSites` puts the
reward on the table. They belong to the random board only: the authored
bank never rolls one, and the parked missions know nothing about them.

## The shape

Every site is the same skeleton:

- a **cache**, the 2x2 `chest` prop (`game/propArt.ts`) at the mark's cell,
  with the site's own health pool when the table gives it one;
- a **ring**, `radius` cells round it, the circle the guards hold. It is
  NOT drawn, and neither is the site's name or size: what a site holds is
  learned by breaking a few, and how much is built round the cache is the
  tell — a small site is a few props, a medium one has its kind's
  building beside the cache and a large one the great version of it;
- a **guard**, what the board has to get past to reach the cache;
- a **reward**, three mods rolled at the sites' own odds, the same odds
  for every site (`SITE_MOD_ODDS`: 55% common, 30% uncommon, 12% rare, 3%
  ultra), and a number of copies set by the size alone (`SITE_MOD_COPIES`:
  one for a small, three for a medium, ten for a large). `docs/economy.md`
  says why mods are dealt nowhere else. Break the cache and the three go
  on the table (`components/Relics.tsx ModChoice`) above the deal, keys 5-7,
  while the run goes on, until one is taken (`Game.chooseMod` → `Sim.takeMod`), that many times over.
  Every copy the run owns adds to what a turret born with the mod gets,
  and every turret placed from then on rolls it at its chance (`mods.ts
  rollTurretMods`). Nothing is applied to a standing turret.

A site is a mark on the document (`missionMarks.ts SITE`): the cache's
top-left cell, and `site`, `size`, `radius`, `padX`, `padY` in its opts. The
generator writes the cache prop and the mark together, and a mark with no
cache under it is no site — the sim skips it and `npm run check` says so.

## The kinds

Six kinds, three sizes each. Size is the guard and the copies together:
the harder the site, the more copies of whichever of the three is taken.
What the three are is the same roll at every size.

Sizes read off the build: a small site is a few props round the cache, a
large one a compound. The table is for authors; nothing on the field prints
it.

| kind | what guards the cache | small | medium | large |
|---|---|---|---|---|
| **Cairn** | Wardens leashed to the ring, in a ring of stones | 40k, 1 Lance | 100k, 2 Lances 1 Bulwark | 220k, 3 Lances 3 Bulwarks 2 Halberds |
| **Mirror cache** | nothing. Every hit on the cache comes back at the nearest turret, at the site's share (`reflect`) | 30k, 10% back | 80k, 20% back | 160k, 35% back |
| **Sleeping house** | a dormant Fabricator six tiles off (`docs/mission-marks.md` says what waking one costs); the cache sits inside its blast | 40k, small house | 90k, large house | 180k, two large and two small |
| **Shrine** | a Pylon five tiles off, and Wardens. Every thirty seconds a Goad beams double pace onto the ten bodies nearest it, within thirty tiles (`levels.ts hasteField.targets`, `Sim.hasteNearest`); every ten seconds a Bastion plates everything within twenty-six (`armorField`), waves walking past included, until it falls. Local only: a site's pylon counts for nothing on the board at large (`Sim.goadMul`) | 40k, Goad | 100k, Bastion | 220k, 4 Goads and a Bastion, with Wardens |
| **Beacon** | a Brander five tiles off whose beam burns every turret on its line out to twenty tiles, and Bulwarks | 40k, 1 Brander | 100k, 1 Brander 2 Bulwarks | 220k, 4 Branders, 3 Bulwarks 2 Halberds |
| **Bomber run** | the cache is sealed against the board. The flight sits parked on its launch pad from the first frame with the clock as a bar over it; on the clock it lifts off and flies at the cache, and the first to arrive bombs it and the site is lost. Shoot every one down, on the pad or in the air, and it opens | 1 T3 at 1:31, 60 cells out | T4 + T3 at 3:02, 90 out | 2 T5 + 2 T4 at 5:18, 120 out |

The Wardens are the garrison's (`docs/mission-marks.md`), posted the same
way (`Sim.garrisonUnit`): they fight what the board builds inside the ring
and never leave it. The ring is wider than a cheap turret's reach on
purpose — a gun that can hit the cache from outside it is a tier-3 range or
better — so a site is paid for in turrets built inside the circle, and in
the ones the guards take down.

A site's own bodies carry `usite` (the site index plus one), which is how a
site's Brander hunts turrets instead of a cart, a site's bomber dives at
nothing and holds its line, and the last bomber down opens the cache.

## What they look like

A site reads as a place before it reads as a mark: a small biome of its
own inside the ring, the way a village is planks and soil paths rather
than one block. Each kind lays its own ground (`tiles.ts`: the built
floors `flagstone`, `sandstone` and `plate` beside the map's own), walls
of its own family (`masonry` and `plating`, which take a tenth of the ink
so they stand apart from every hill, or the ground's rock), and its own
furniture (`docs/props.md`). A bigger site is more of the same — a second
gate, an inner court, more stakes — never a building. Everything is laid
after the cache is down, inside the same reach test, so a build that
walls a room off is taken up with its cache, floors included. **Size is
room**: a medium ring is a third wider than a small one and a large ring
twice as wide (four times the ground), with the guard to match — a large
site is one or two to a board, so it can be a whole courtyard or a
fortress. Its bodies stand out in the courtyard at three tenths of the
radius (`Sim.raiseSites`), not on the cache:

- **Cairn — the henge**: a paved disc under the cache, a paved ring path
  with spokes out to it, standing stones (`menhir`, tinted like the map's
  rock) on the rim and boulders inside; a cut-stone ring with a gap on
  every spoke and a brazier at each from medium up, an altar at large.
- **Mirror cache — the mirror garden**: a quartz disc, four slate paths,
  mirror plates (`lens`) round the cache; pillars at medium, a crystal-rock
  ring at large.
- **Sleeping house — the foundry**: a cinder yard, a steel-decked hall
  walled in hull plating with a gate (two from medium), plated tracks out
  of the gates, chimneys (`stack`), pipes, crates or barrels inside, scrap
  outside, a silo at large.
- **Shrine — the temple precinct**: a sandstone court walled in cut stone,
  a paved avenue in through the gate lined with pillars, braziers at the
  corners; a second gate, obelisks at the gate and an altar from medium
  up, an inner court at large.
- **Beacon — the scorched watch**: burnt ground out to a rampart of the
  map's own rock with more openings as it grows, a pyre by the cache, fire
  pits, braziers at the openings; a ring of cut-stone stakes and bunkers
  from medium up.
- **Bomber run — the airfield**: a plated depot with crates round the
  cache; at the pad, a plated runway pointed at the cache and lit down
  both edges (`strobe`), a hull-plate wall behind, a silo and barrels
  beside it, more of the dump as it grows. The pad wants open ground.

## Rolling them

`build` rolls sites off their own stream (`spec.seed ^ 0x51735`) after every
other prop is down, so the rest of the board is what it was before they
existed.

**How many is a chance roll** (`sites.ts rollSiteCounts`, `SITE_ROLLS`):
each size is a run of coin flips, so the count is binomial and stacks —
an ordinary board gets about the mean, a lucky one runs up toward the
number of flips, an unlucky one down to none.

| size | flips | chance | mean | none | all |
|---|---|---|---|---|---|
| small | 16 | 62% | 9.9 | 1 in 5,000,000 | 1 in 2,000 |
| medium | 8 | 44% | 3.5 | 1 in 100 | 1 in 700 |
| large | 6 | 25% | 1.5 | 1 in 6 | 1 in 4,000 |

The board carries at most `MAX_SITES` (24). The largest are placed first,
each a kind drawn at random, so kinds repeat. The cache stands in a 6x6
yard at least 26 cells in from the rim, 60 past the core, clear of
every door's disc and every other site's ring. **The ring is carved to
the precinct**: the rock inside it, on a hill or beside one, is cut down to
floor out to nine tenths of the radius, all but a few knobs near the rim
the noise leaves buried, so the build keeps its shape and a site in a hill
is a courtyard cut into it, open ground the core never reaches, with the
rock round it where the turrets that take it stand. The generator's
pocket pass and the orphan check both leave a hill site's pocket alone. A
yard less than half open ground after the carve (water is not carved) is
passed over; a site that finds no ground is simply not placed, and one
that walls a room off is taken up again, carve and all, like a junk site.
A bomber run also needs a pad `flight` cells out that is on the board and off
the core.

## What crosses the seam

Three header slots (`simreport.ts`): caches opened, the last opened by
index, and every site's state two bits each (standing, opened, lost). The
overlay (`Game.drawSites`) draws only a bomber run's launch clock, as a
bar over the flight parked on its pad, off the marks and the run clock —
no line, no ring, no name; `Game.offerSites` edge-detects the count and
rolls the three: ONE rarity for all three (a mixed table is a table with
one real choice on it) and the size's one copy count. A site's planted
bodies — its house, pylon or brander — are rock to the swarm's fields
(`Sim.hardenPlanted`), so a wave routes round them instead of piling up
behind one, and the cells come back when the body falls.
