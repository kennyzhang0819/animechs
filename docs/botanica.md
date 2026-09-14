# Botanica: the second faction

Foundry is the machine set. Botanica is the plant set: every kind on the
roster drawn as a plant, **with no plate under it — you place a tree, and
it is just a tree**, drawn to its footprint's edge. Only the five plants
that aim turn; the rest stand as drawn. It ships, behind the Settings
screen's "Turret faction" switch (`game/faction.ts`), and it is a skin
over the one roster: the sim, the deal, the formations, the mods, the
relics and the saves are keyed by `TowerKind`, and every plant keeps the
stats of the kind it stands for (`constants.ts` TOWERS), so the balance
is the base game's and every role the base roster covers is covered
here.

## The roster, kind by kind

The plant, the kind it is, and the pattern that kind already fires with.

| plant | kind | size | turns | what it does |
| --- | --- | --- | --- | --- |
| **Sapling** | duo | 1x1 | no | flicks seeds: two short bursts a second, ground and air. The cheap, fast gun every bed starts with |
| **Pitcher** | hail | 1x1 | no | lobs a sap gourd: artillery over the crowd, ground |
| **Thornbush** | scorch | 1x1 | no | a thorn spray at point-blank: the short-reach stream, ground |
| **Firefly Reed** | arc | 1x1 | no | sparks that chain: lightning, ground |
| **Cannon Fig** | salvo | 2x2 | yes | fires figs in bursts, ground and air |
| **Puffcap** | scatter | 2x2 | no | spore bursts, thick and fast: the flak, ground and air — the plant that shoots a lot |
| **Sunflower** | lancer | 2x2 | yes | charges and fires a light beam that pierces its line, ground |
| **Dewvine** | wave | 2x2 | no | sprays dew: the liquid spray, soaks and slows, ground and air |
| **Snapdragon** | parallax | 2x2 | yes | grips and drags: the tractor beam, ground and air |
| **Bombardier** | swarmer | 2x2 | no | seed missiles that home, ground and air |
| **Corpse Flower** | fuse | 3x3 | no | a stench burst at short reach: the shotgun, ground and air |
| **Oak** | ripple | 3x3 | no | drops acorns: four shells a volley, long reach, ground |
| **Willow** | tsunami | 3x3 | no | weeps: the great liquid spray, ground and air |
| **Kudzu** | cyclone | 3x3 | no | thorns as thick as flak, fast, ground and air |
| **World Ash** | spectre | 4x4 | no | root spikes as fast and heavy as the spectre's rounds, ground and air |
| **Solar Bloom** | meltdown | 4x4 | yes | a continuous sunbeam: the continuous damage, ground and air |
| **Venus Colossus** | foreshadow | 4x4 | yes | one bite: the single-target shot, the heaviest hit on the board |

Coverage against what a roster needs: shoots a lot (Puffcap, Kudzu,
World Ash), single-target high damage (Venus Colossus), continuous
damage (Solar Bloom), short reach (Thornbush, Corpse Flower), artillery
(Pitcher, Oak), a piercing beam (Sunflower), liquids (Dewvine, Willow),
missiles (Bombardier), chain lightning (Firefly Reed), a tractor
(Snapdragon), plain bullets (Sapling, Cannon Fig). The retired menders
keep their stock names and sprites under either faction.

The core is the **Heartwood**: a stump five cells square, the team's
colour at its heart, drawn in place of the nucleus.

## The art

`game/botanicaArt.ts` draws every plant to the Foundry rules
(`game/turretArt.ts`): flat plates, a material's dark on the left and
light on the right, nothing under two pixels, symmetric by construction,
authored in pixels on the stock grids. The materials are a plant's —
bark, leaf, pale, moss — and a few fruits that stay off the rarity bands
and the swarm's family hues: a mushroom cap, olive sap, hazelnut, fig,
dew, a spark, the corpse flower's maroon, a pumpkin pod.
`npm run gen:botanica` renders the set into `docs/botanica/` and reports
any one-pixel stroke; the set renders with none.

## How it is wired

- `game/faction.ts` — the switch (`activeFaction`, `setActiveFaction`),
  the names (`PLANT_NAMES`, `structName`, `coreName`).
- `game/atlas.ts` — every plant packed beside its Foundry head
  (`UV_PLANTS`; a plant that turns packs like a head, one that stands
  packs upright) and the heartwood beside the core (`UV_HEARTWOOD`), so
  the faction flips without a rebuild. `towerIcon` carves the HUD's
  picture from whichever set is active.
- `game/renderer.ts` — under Botanica a turret is its plant with no
  plate pushed under it, at rotation 0 unless it aims; the core is the
  heartwood.
- `game/game.ts` — the placement ghost composes a plant with no plate
  (`ghostArt`), and `setFaction` clears the ghosts so they recompose.
- `game/progress.ts` — `faction` is a saved preference, read back at
  boot; `components/Animechs.tsx` puts the switch on the Settings
  screen's Interface tab and re-carves the bar's pictures on a flip.
- Names: the card, the inspector, the unlocks board, the rarities view
  and the mods' odds lines read `structName`.

What a plant does not do yet, and what the doc used to promise: growth,
roots, thorns on contact, spore clouds, kudzu runners, the swallow. Each
is a sim mechanic in its own right; the faction ships on the base
roster's numbers first, so it is balanced from the first wave.
