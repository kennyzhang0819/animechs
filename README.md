# MechSwarm

Tower-defense swarm prototype: flow-field pathfinding for up to 22,000 units,
WebGL2 instanced rendering, and towers (1×1 up to 4×4) that block movement and
reroute the horde in real time.

## Run

```bash
npm install
npm run dev       # the desktop app: Next's dev server inside the Electron shell
npm run dev:web   # a bare browser tab: Next.js + Turbopack, nothing around it
```

**The game is a desktop game**, shipped to Steam as an Electron app
around the same bundle, and played with a mouse and a keyboard — there is
no touch input and no phone layout. `npm run dev` is the development
loop, and runs the dev server inside the shell; `npm run desktop`
builds and launches the static export; `npm run desktop:pack:steam`
leaves the Windows and Linux depots under `desktop/release/`. The shell
lives in `desktop/` (its own npm package; `npm run dev` installs it
on first run, or `cd desktop && npm install` by hand); see
[docs/desktop.md](docs/desktop.md).

### Build number

`game/version.ts` holds `BUILD`, shown small and grey at the bottom-right
of every screen. **Increment it by one in every commit that changes what
the game does** — sim, targeting, balance, rendering, UI. A playtest
report only means something against the number that was on screen: a
stale tab or a cached bundle looks exactly like a fix not working.

## Architecture

- `game/constants.ts` — grid, base placement, tower/unit tuning
- `game/levels.ts` — unit stats and wave-script plumbing; the authored
  script itself (50 waves) lives in `public/levels/1.json`, loaded by
  `loadLevelDocs()`. Six upgrade trees: ground, support, crawler, air and
  the two **naval** lines (risso→omura, retusa→navanax), which travel on
  the water layer and cannot leave it
- `game/economy.ts` — **the economy**: scrap (in-run money), XP (meta
  progress), the per-tier scrap table, the fixed mission pot and how it
  is dealt out per wave cleared (`MISSION_XP`, `waveXpShare`), the three
  turret tiers and their scrap prices, the sell refund, the level curve
  and the random-map bonus
- `game/ladder.ts` — the **ten-rung ladder** (`RUNGS`: the mutator roll
  and the XP bonus each; the enemy-level dial is wired and authored to
  zero), and the audit/check arithmetic over the authored script — the
  **stage table** (`stageAudit`) that the turret prices are tuned against
- `game/track.ts` — the **level track**: the fifteen-level unlocking
  phase, every level of it opening a turret or a wall (`UNLOCKS`), plus a
  short hand-placed list (the maps, 2x speed), and `techStateFor(level)`
  — what a save at that level may do. The turret upgrade rungs are off
  the track for now (`UPGRADES_ON_TRACK`)
- `game/tech.ts` — `TechState`, the shape the sim and the bar read a
  save's allowances in, and the roster's canonical order
- `game/upgrades.ts` — the **turret upgrade branches**: a chain of rungs
  under every turret, folded into its live `TowerStats` — two stat
  steps, a one-shot ammunition swap, and an **ultimate** that changes what
  the turret is. **The track does not hand any of them out at the moment**
  (`UPGRADES_ON_TRACK` in `game/track.ts` is false), so every turret plays
  at its stock stats; the branches are intact and waiting. **Only duo and
  arc have an ultimate written so far** — the other fifteen are authored by
  hand as they are designed; adding one is a fourth entry in a branch with
  `tier: ULTIMATE_TIER` and its id in `UPGRADE_KINDS`, and nothing else
- `game/mutation.ts` — the **mutators**: the catalog of rules a run can be
  played under, what each is worth in points, and the roller that draws
  three or four of them to fit a difficulty's budget
- `game/progress.ts` — the save: lifetime XP, rungs cleared per world,
  game speed, build-bar loadout. The level, and everything the track
  hands out at it, is derived from XP and never stored
- `game/storage.ts` — **where the save file lives**: one slot behind
  three calls, localStorage in a browser and a file on disk under the
  desktop shell (through the bridge `desktop/src/preload.ts` puts on
  `window`). The only place the game knows it might be on a desktop
- `game/maps.ts` — map documents: terrain layers, spawn circles, the
  core's cell. **Every campaign map is 256x256 — Mindustry's size — and
  is generated, never drawn**: `scripts/maps/<id>.mjs` is a few dozen
  numbers handed to `scripts/maps/mindustry.mjs`, which builds the map
  the way Mindustry's own generator does (noise rock, rooms, brushed
  routes, chokes, holes, the floor's own wall, forests, ruins, clutter)
  and refuses to write it while a check fails — see
  [docs/authoring-maps.md](docs/authoring-maps.md) for what makes a
  Mindustry map read as one and [docs/map-rules.md](docs/map-rules.md)
  for the checklist
- `game/editor.ts` — the level/map editor model behind the admin views
- `game/terrain.ts` — terrain from a map document when one exists, else
  seeded value-noise worldgen: mountain ranges, a carved meandering valley
  with a branch lane, forests, outcrops, floor fringes, decor
- `game/flowfield.ts` — grid occupancy + one Dijkstra pass seeded from every
  goal cell (the base is the fallback), refined by an eikonal sweep into a
  per-cell direction field; units sample it bilinearly (pathfinding is
  O(map), not O(units)). Cells pay for **where** they are as well as how
  far: single-file slots cost extra (`NARROW_COST`) and so does hugging the
  rock (`EDGE_COST` over `EDGE_REACH`), so the cheapest route is not the
  shortest one — it runs down the middle of a lane and will take a longer,
  roomier way round rather than scrape a corner
- `game/sim.ts` — units in struct-of-arrays typed arrays, counting-sort spatial
  hash (separation + projectile hits), towers, projectiles, effects
- `game/tiles.ts` — **the ground tiles and the hill blocks**, the game's
  own terrain art, painted at load on a 16-pixel grid. A floor is a base
  colour with ONE soft rounded mark on it (a light patch, a shaded stone
  on dirt, a wide low dune on sand, a glowing spot on hot rock), its dark
  tone eased toward the base; its second painting is plain ground, and
  that plain one fills two of the three slots, so a mark lands on one
  cell in three. A wall is shaded the way Mindustry shades its walls: the
  top-right corner in the light tone, the bottom-left in the dark, and a
  wide mid band running diagonally between them with wandering edges —
  then one small pale pebble on the mid band, and the second painting is
  the bands alone. A 2×2 cluster is one block shaded corner to corner across
  the whole of it. The props are painted the same way (`PROP_STYLE`,
  `paintProp`): a boulder is two or three discs overlapping, a pine a ring
  of lobes round a crown with the trunk a dark dot, a spore cluster three
  pods, each shaded by one diagonal across the whole silhouette with no
  outline round it, and the shrub squares are patches of
  ground with round tussocks rather than things standing on it. The atlas,
  the menu background, the map thumbnails and the editor palette all read
  from it; `npm run gen:tiles` writes the palette's PNGs into
  `public/tiles/`
- `game/atlas.ts` — the sprite atlas, composited at load time from Mindustry
  sprites in `public/mindustry/` plus procedural regions; **swap any region
  for custom art** (units are white sprites tinted per instance, and already
  rotate to face their heading). The two water floors are the only cells
  packed 3x3, because the water shader samples off the tile
- `game/renderer.ts` — WebGL2 instanced sprites: static terrain, shadow and
  wall batches, one dynamic batch in painter's order, and a shield pass.
  Water is a batch and a program of its own — Mindustry's `water.frag`,
  ported, so the sea swells and its bright bands drift across the map
- `game/game.ts` — rAF loop, input, 2d overlay (placement ghost), stats
- `components/MechSwarm.tsx` — React shell: HUD (scrap, core health, XP), rung
  picker, six-slot build bar with prices and its loadout picker, game-speed
  switcher, results screens, canvases
- `components/MenuBackground.tsx` — the title screen's ground: **the game
  itself, playing behind the menu**. Not a picture of it — a `Sim` on one
  of the campaign's own maps, stepped at the same fixed 1/60 a run is and
  drawn by the same renderer, so the bodies walking the lane are a wave's
  bodies on the real flow field and the turrets shooting them are real
  turrets with the sim's own shells, beams, smoke and deaths. Nobody is
  playing, so it builds its own line, and it builds it the way a person
  does: it traces the walkers' route down the flow field, picks a handful
  of stretches of it, and lays a real formation on each — a wall screen
  along the lane with ranks of guns racked up behind it, one kind to a
  rank, flush, square to the lane. A firing line of duos, a block of
  salvos, a bastion round a pair of heavies. A burst of it goes up before
  the scene is shown and one placement every `BUILD_EVERY` after, which
  is also how the line is repaired as the swarm eats it. The camera
  scores the field by bodies AND by live effects — a muzzle flash, a
  shell burst, a dying unit — so it finds the fight rather than the
  biggest crowd, and eases there. Each campaign map gets its turn: a scene holds for
  `SCENE_HOLD` seconds, goes to black, and the next map is built behind
  the black one piece of work per frame so nothing lands as a freeze. It
  holds still under prefers-reduced-motion and stops when the tab is
  hidden
- `app/globals.css` — **the kit**: `.ms-btn` / `.ms-pane` / `.ms-seg` /
  `.ms-bar` and their variants are Mindustry's nine-patch UI sprites
  (`public/mindustry/sprites/ui/button*.9.png`, `pane*.9.png`) written as
  CSS — a 3px `#454545` bevel with square corners on a black fill, gold on
  hover, white on press, sunk to `#252525` when disabled, gold-washed when
  a toggle is on (`aria-pressed` / `aria-selected` drive it, so a button
  never carries its state in its class list). Every screen is built from
  these; Tailwind utilities on top only size and place them
- `components/Board.tsx` — the pan-and-zoom camera the mutator codex is
  drawn on, and the chrome it shares with the progress screen
- `components/Progress.tsx` — the **progress screen**: the track top to
  bottom, one row a level with what it hands out, the current row carrying
  the XP bar; the mutator codex is its second tab
- `components/techIcons.tsx` — what every tech node LOOKS like: block
  sprites, the upgrade glyph vocabulary, the surge icon. Shared, so the
  game's board and the layout editor draw the same faces
- `components/TreeEditorView.tsx` — the layout editor: drag a node, it
  snaps to the grid, Save writes `public/tree.json`. It draws the real
  faces at the real sizes — composing a layout against name labels would
  be composing against the wrong picture
- `components/MutationTree.tsx` — the **mutator codex** as a board of its
  own: one thumbnail per rule, severity in the border, the rule on hover
- `components/LevelEditorView.tsx`, `MapEditorView.tsx`, `BalanceView.tsx` —
  the admin authoring surfaces
- `components/SandboxView.tsx` — the admin **Sandbox** tab, and the one
  door in the game where a mutator is CHOSEN rather than rolled: pick a
  world, a difficulty and any combination of rules (over the tier's budget
  if you like), and deploy. It hands off as a query string onto the game
  page — `/?sandbox=1&world=…&tier=…&mut=…`, consumed and stripped by the
  sandbox effect in `MechSwarm.tsx` — so the exact run that reproduced a
  bug is a URL you can paste into a report. The run starts in sandbox
  mode: whole tree unlocked, caps lifted, every pace offered

In dev builds the running `Game` instance is exposed as `window.__mechswarm`
for console poking, and the ladder's tuning surface as `window.__ladder`
(`.spec(n)` for a rung's playable spec, `.budget(n)` for what the
arithmetic says it costs, `.stages()` for the stage table, `.grind()` to
print it).

## Controls

Mouse and keyboard (`game/game.ts`); the game is a desktop game and there
is no touch input.

| | |
|---|---|
| build | left press, drag to chain |
| demolish | right press, drag to chain |
| inspect a turret's range | left click, with no tool picked |
| pan | middle drag, WASD/arrows, two-finger trackpad scroll |
| zoom | wheel, trackpad pinch |
| pause / menu | space / esc, or the two buttons in the top-right corner |
| fullscreen | F11 (Ctrl+Cmd+F on macOS), in the desktop shell |

The zoom floor is the whole map in frame with a little padding
(`ZOOM_FIT_PAD`); the ceiling is 12.

## Progression

**There is one run in the game and ten difficulties to play it at.** Every
rung sends the whole authored script — all fifty waves, wave 1 to wave 50,
the same fifty every time, **and every body at the same health**. What a
rung changes is **how many** come and **what rules** they come under. The
four named difficulties — **Incursion, Onslaught, Scourge, Nemesis** —
send every wave at a quarter, a half, three quarters and the whole of its
count, with no mutators. The six above them, shown as *Nemesis +1*
through *+6*, send Nemesis's full swarm under a mutator roll that
spends more and returns more with every step. "Level" is never the word
for a difficulty: a level is the player's.

| rung | Incursion | Onslaught | Scourge | Nemesis | +1 | +2 | +3 | +4 | +5 | +6 |
|---|---|---|---|---|---|---|---|---|---|---|
| waves | 50 | 50 | 50 | 50 | 50 | 50 | 50 | 50 | 50 | 50 |
| count | 25% | 50% | 75% | 100% | 100% | 100% | 100% | 100% | 100% | 100% |
| enemy health | ×1 | ×1 | ×1 | ×1 | ×1 | ×1 | ×1 | ×1 | ×1 | ×1 |
| rules rolled | 0 | 0 | 0 | 0 | 3 | 3 | 3 | 3 | 4 | 4 |
| mutator points | 0 | 0 | 0 | 0 | 8 | 10 | 11 | 13 | 15 | 17 |
| XP bonus | ×1.0 | ×1.5 | ×2.0 | ×2.5 | ×3.0 | ×3.5 | ×4.0 | ×4.5 | ×5.0 | ×5.5 |

**A rung scales the count, the mutator roll and the XP, and nothing else.** Enemy
level — Mindustry's ×1.06-a-level health curve — is still a mechanism
(`HP_PER_LEVEL`, `LevelSpec.enemyLevel`, the balance dashboard's dial) and
the ladder no longer turns it: every rung is authored at level 0.
Difficulty is rules, not hit points. Every column is arithmetic on the
rung's index, so **an eleventh rung is one constant** (`RUNG_COUNT`).

### Two currencies that never touch

**Scrap is the run's money.** Every run opens with `SCRAP_START` (7,500),
every kill drops its tier's scrap, every wave staged pays a small bonus,
and every turret placed costs scrap. Selling returns nothing
(`SELL_REFUND` is 0): a placed turret is spent. Nothing carries between runs: a run is solved from its
opening board to its last wave on what it earns. There is no gate inside
a run: whatever the save owns it may place from wave 1. The income is
tuned so a sensible board clears all fifty first try.

**XP is the save's progress, and it is paid for objectives, not kills.**
Every mission is worth the same fixed pot — `MISSION_XP`, 100,000 — for
a full clear, and the pot is dealt out **one wave at a time as the waves
are cleared**, the way a StarCraft II co-op mission pays for each
objective met. A wave is cleared when every body it sent is down (killed,
devoured or blown up; `Sim.wavesCleared`), and it banks its share that
moment. The shares ramp linearly from wave 1 to the last (`WAVE_XP_RAMP`:
the last wave pays three times the first) and sum to exactly the pot, so
on the fifty-wave script wave 1 is worth 1% and wave 50 is worth 3%. A
run that dies keeps what it cleared; a win pays the whole pot however
the last wave ended. The rung multiplies it (the XP bonus above), and a
run on a **random map** — the menu's default — pays `RANDOM_MAP_XP_BONUS`
(a quarter) more on top. There is no first-clear bonus: a clear is worth
the pot, first time or fifth, and every level is open from the first run.
XP turns into **player level** through a power-law curve (`xpToNext`),
and **every level is a rung on the track** (`game/track.ts`) that hands
out a map, a pace or a turret upgrade — nothing is chosen and nothing is
bought.

| waves cleared | 1 | 10 | 20 | 30 | 40 | 50 |
|---|---|---|---|---|---|---|
| XP banked (base rung) | 1,000 | 11,837 | 27,756 | 47,756 | 71,837 | 100,000 |

**Why.** XP used to come off the same kills, one point per 110 hp of the
body, and that put the pot where the health was: waves 1–20 paid under a
tenth of a clear and waves 36–50 two thirds of it, so a save that could
hold twenty waves and not thirty was earning at a twentieth of the rate
of one that cleared. Twenty waves now bank 27,756 against the 23,377 they
paid before, and three times the share of the run.

**Scrap comes off the tier, and kills pay nothing else.** A kill pays its
tier's scrap (`SCRAP_BY_TIER`, a boss `BOSS_SCRAP`) and no XP at all.

| tier | scrap |
|---|---|
| T1 | 10 |
| T2 | 30 |
| T3 | 80 |
| T4 | 200 |
| T5 | 500 |
| boss | 5,000 |

**Drops are fixed.** A dagger always pays this, on every rung, on every
map. Scrap income is a fact about the script, which is what lets the
turret prices be authored against it; XP is a fact about how far the run
got, which is what keeps a wave of heavies from being the only thing
worth killing.

### Three stages, three price bands

The roster is cut into three price bands along Mindustry's build-cost
order (`TOWER_TIER`), and the run into three stages (`STAGES`): waves
1–20, 21–35 and 36–50. **A band is priced so its stage is roughly what
buys it.** This is a pricing table and nothing else — no band is held shut
inside a run. Against the shipped script:

| stage | waves | scrap paid | tier | prices | buys about |
|---|---|---|---|---|---|
| 1 | 1–20 | ~24,000 | duo, scorch, hail, arc, scatter, wave | 60–300 | 150 turrets |
| 2 | 21–35 | ~51,000 | swarmer, lancer, salvo, ripple, parallax, cyclone | 900–1,800 | 40 turrets |
| 3 | 36–50 | ~83,000 | fuse, tsunami, spectre, meltdown, foreshadow | 4,000–12,000 | 11 turrets |

The stage table (`stageAudit`, on the balance dashboard and the level
editor) is where this is checked; `check()` complains when a stage buys
too few or too many of its band (`STAGE_BOARDS`). A placed turret is
spent (selling returns nothing), so the next band is bought out of the
next stage's income; what each stage asks is what to stop buying.

### The level track

**The track is the unlocking phase, and nothing else.** A fresh save
opens with five structures — the copper wall, duo, hail, scatter and
salvo (`STARTING_ROSTER` in `game/track.ts`) — and **every one of levels
2 to 15 opens at least one new turret or wall** (`UNLOCKS`), the lancer,
ripple and spectre first, the titanium and thorium walls last. At level
15 the save owns the whole roster of 23 and the track is done: nothing is
handed out above it. Maelstrom rides level 3 and Quagmire level 7, and 2x
speed is the last thing on the track at 15. The turret upgrade rungs are
switched off for now (`UPGRADES_ON_TRACK`), so a turret plays at its stock
stats whatever the save's level. A turret the save has not reached rides
the build bar greyed, with the level that opens it. The progress screen
lists the whole track; the results screen names what a climb handed out. A
first Confluence clear lands around level 5; the top of the track is about
2.3 million XP.

### One script, three families a deploy

**Every map plays the same fifty waves** — `public/levels/campaign.json`,
edited in the admin level editor from any world's card. The script is
authored in three unit families (ground, ground support, air), and those
are its three **slots**. When a run deploys, **the die rolls three
families** from the ones the map's drop zones allow — a map with no water
door cannot send hulls — and deals them into the slots, tier for tier
(`rollFamilies`, `transformScript` in levels.ts). Forty daggers in the
script are forty of whichever family took the first slot. The boss
(Disrupt) is in no family and is never swapped.

| family | bodies | needs a door for |
|---|---|---|
| Ground | dagger, mace, fortress, scepter, reign | ground |
| Crawlers | crawler, atrax, spiroct, arkyid, toxopid | ground |
| Ground support | nova, pulsar, quasar, vela, corvus | ground |
| Air | flare, horizon, zenith, antumbra, eclipse | air |
| Naval | risso, minke, bryde, sei, omura | water |
| Naval support | retusa, oxynoe, cyerce, aegires, navanax | water |

The deal is shown on the field in the bottom-right corner, StarCraft-style:
a column of squares growing upward, the bottom one always the three
families dealt, every square above it one mutator in force.

### Missions

**Every map is its own assignment** (`LevelSpec.mission`): *hold* — clear
every wave the script sends with the core standing — or *survive* —
last the clock out; a spent script sends its last wave again, a few enemy
levels heavier each repeat, until time ends the run. Each map carries
its own wave script (`public/levels/<id>.json`, edited in the admin level
editor) — there is no shared blueprint and no family re-casting any more.
Every shipped map is a hold: Confluence's fifty waves, Maelstrom's fifty
on the naval front at a six-second gap, Quagmire's forty in the swamp
against a lighter, tier-2-capped opening. The survive shape is wired and
waiting for a map that wants it.

**Structures stand anywhere unoccupied, open ground included, and the
swarm attacks them.** Every unit attack-moves, Mindustry's GroundAI: it
walks the field toward the base and every weapon it carries fires at the
nearest structure within reach **and in sight** on the way — a walker or a
hull cannot shoot through a hill (`Sim.hasSight`, a raycast over the same
mask the flyers route by), so a turret behind a ridge is one the swarm has
to come round before it can answer; a flyer is looking down and sees its
whole radius (`game/weapons.ts` is the
arsenal — each unit's mounts, reloads, bullets and splash after
`UnitTypes.java`. Every weapon's LOOK — sprite, size, colours, beam
palette, what lands where it hits — is read off that file and the bullet
classes 1:1; the bite was written from memory before the repository was
reachable and each row notes where upstream now differs, keeping its own
number until a balance pass). The swarm is Mindustry's crux team: every
unit wears its `-cell` region in crux red, its shields and force fields
are that red, and a flyer's engines burn in it. A structure on open
ground is solid to the body but **passable to the path at a cost**
(`STRUCTURE_COST`, Mindustry's own 70): the field routes around a wall
when the way round is cheaper and into it when it is not, and the bodies
pressed into it shoot it. So a wall across the lane is not a seal, it is
a fight at the wall. Structures have Mindustry's block health times
`TOWER_HP_SCALE`; hurt, they grey and smoke like units; at zero they are
wrecked and gone, their ground open again. Bullets, missiles and shells
fly (`Sim.shots`) and hit the structure under them; beams, bolts, flames,
saps, fields and bombs land at once; a crawler is its own bomb.
Structures carry **ten times** Mindustry's block health (`TOWER_HP_SCALE`)
and the swarm's damage is Mindustry's own, unscaled (`setUnitDamageScale`
at 1) — balance is deliberately not done yet, and those two numbers are
where it will be done. The playtest takes the dial as `--unit-damage`.
The headless bot builds on open ground, as the player must — hills take
no turret — and never rebuilds what it loses.

**Every map is checked headless.** `npm run playtest -- --world <id>`
runs the real sim with an ordinary builder bot at the keyboard (route
coverage from a dry run, the stage's tier bought round-robin, never a
sale, never a rebuild) and reports where it gets to. Balance is not
done: with the swarm at Mindustry's damage and the turrets at ten times
Mindustry's health, expect the bot to lose every map early. Run it after
any wave, price, weapon, mutator or unit edit — a map the bot loses is a
map with a wall in it.

### The core

**The core is the run.** It stands where the map's base does, it carries
Mindustry's core nucleus health scaled like every other structure
(`CORE_HP`, 60,000), and the swarm exists to knock it down: every unit
paths to it, presses against it and fires (`Sim.coreGoal`, the same
structure grid the turrets sit in), flyers hover over its edge and shoot,
hulls park on the nearest water and shoot from the shore
(`Sim.waterGoal`). **Each of the three layers has its own field.** The
walkers' is over rock and structures, the hulls' over everything that is
not water, and the flyers' (`Sim.airField`) over the HILLS alone — deep
water and forest are open sky. A flyer routes round a mountain like the
rest of the swarm, but nothing collides it with one: shoved inside a peak
it simply flies the straight line back out. Nothing leaks and nothing is
counted in lives — a
body that reaches the core stays there, chewing on it, until one of them
is gone. **When the core falls the run is lost** (`Sim.lost`), whatever
else is standing.

**A map is sealed.** There are no exit cells and no open edge: the rim is
rock, the swarm's only way out is through the core, and the core stands at
the end of the lane the drop zones feed.

### Mutators

Every deploy above Nemesis is played under **mutators** — rules that
change what happens to a wave after it lands. **Nobody picks them.** The
**difficulty decides the budget and the count**, and that many rules are
rolled to fit it when you deploy. It is the StarCraft II model, and the
mode it exists for is endgame resource farming: the same fifty waves, a
different set of rules every time.

|  | the tech tree | a mutator |
|---|---|---|
| how it is got | paid for out of the bank | **rolled for you** at deploy |
| what it does | more turrets, faster pace | makes the run **harder** |
| how long it lasts | permanent capacity | **that run only** |

This replaces the old *mutation line*, a column of switches on the tech
tree earned one rank per boss felled. Nobody flips an optional handicap
with no reward attached — and the game had to be balanced as though
everybody did. So it became the opposite thing: mandatory, unchosen, and
attached to the maps that want it.

**Where it is mandatory:** **every deploy above Nemesis, on every
map.** The gate is the ladder, not the world — a tier carries how many
rules it rolls and what they may cost (`RungKnobs.mutationCount` and
`.mutationPoints`, both dials on the balance tab), and the four named
difficulties carry zero of each. That is the whole of what "Incursion
through Nemesis are the campaign as authored, at a size" means. The per-world `LevelSpec.mutators` switch is gone; it was never
turned on, and it could only ever say yes or no where the ladder can say
how much.

**No map carries rules of its own.** Every mutator is in every roll on
every map — all maps are equal. Hydrophobic and Amphibious used to be
map-bound "special" rules only Maelstrom and Quagmire could play; they are
ordinary catalog entries now, and a terrain rule simply reads whatever
terrain it lands on.

**Overshields — 3 points.** Every force field on the field comes up **five
times the pool** it was — the bubble a quasar walks in with, and the shield tower
domes if Shield Towers is rolled alongside. Pool, cap and regen all carry
the factor, so a scaled field breaks later, refills proportionally faster,
and is dark for exactly the same cooldown when it pops. This was the
ladder's **shield scale** column until it became a rule nobody chose (see
above); five is the old top-rung value, kept whole. Like Speedy and
Volatile it costs the player **time, not bodies** — it adds no health the
audit arithmetic can see, it delays damage the board was already going to
do. Priced at 3 because one unit kind carries the swarm's force fields, so
a board that can break one is inconvenienced rather than beaten; rolled
beside Shield Towers it is worth considerably more, which is what a big
budget is *for*. **Maelstrom plays under it always** (see intrinsic rules
above).

**Shield Towers — 4 points.** Every so often a 3×3 shield tower rises somewhere
on the map (25 s for the first, one attempt every 45 s after, at most three
standing) and stands a **red force dome** over the ground around it: the
player's projectiles crossing the dome are absorbed into its shield pool,
so enemies under it are safe from projectile fire until the pool breaks —
and the dome **reforms whole** four seconds after the last hit on either
pool — not by degrees, because a dome at 12% is not a weaker obstacle, it is
one more volley. Any hit restarts that clock, so sustained fire holds a
shield tower open and looking away for four seconds means paying for the dome
again.
Only with the dome down can the body be hurt, and a destroyed shield tower is
**gone for good**; the timer raises the next elsewhere. From **wave 35** every new shield tower rises as a **mega shield tower**: five times
both pools and a dome sixteen tiles across, wider than most turrets reach
from one emplacement, so a whole section of the board has to be pointed at
it rather than whatever happened to be idle. Both pools ride the run's
shield multiplier — five times these numbers under Overshields, exactly
these numbers otherwise — and the **body is four times the dome** — a structure that died quickly would
never give the regen a chance to matter, since every hit on either pool
restarts the delay. Sustained fire holds a dome suppressed and grinds the
body down; break off for a wave and you come back to a dome to break twice.
The dome draws as **a carrier's bubble with the diagonals switched off**
(`SHIELD_PLAIN`) — same rim, same flat interior wash, no travelling hatch,
because a dome sits over a lane full of units and Mindustry's diagonals
laid across them read as damage. It is also filled as ONE disc sprite
rather than through `fillPoly`, which fans any non-hexagon into `sides`
textured triangles whose shared slopes double-blend into radial creases.
Instant weapons — lancer, arc, fuse, foreshadow, meltdown's beam — are not
absorbed (exactly as unit force fields never absorb them), which quietly
makes the beam roster the shield tower-breaking roster.

Where it lands is part of the rule. A shield tower's footprint blocks open lane
(the swarm routes around it; the spot roller refuses anything that would
seal the last route, cork a drop zone, or sit on water) — and one that
lands over towers **entombs** them: a buried turret is disabled and
untouchable, never destroyed, and stands back up the moment the shield tower
dies. Turrets chew shieldTowers **only when idle** — a turret with nothing else
in range spends its reload on one, so clearing a shield tower costs time between
waves, never mid-wave DPS. The player can **tap** a shield tower — or any enemy
— to focus it: every turret in range drops what it was doing for the
marked target, which wears a bobbing red arrow. Spending mid-wave DPS on a
dome is a choice with a price, and that choice is the whole game of the
rule.

**Hungry — 4 points.** One spawn in twenty walks in hungry (tinted pink,
and it never spreads: nothing in the game applies the status). Once a
second it reaches four tiles for a random neighbour that is not itself
hungry, not a boss, and on its own movement layer, and swallows it: the
meal is removed, the eater takes **double the meal's full health** onto
both its current and its maximum pool, and it draws 5% bigger. Twenty
meals is the ceiling — forty-one times the health it spawned with, at
double size.

Nothing else crosses over. Not shields, force fields, repair or shield
auras, burning, wet, armour or speed — a dagger that eats a quasar is a
very fat dagger. The **hitbox never moves either**: `urad` is what
physics, splash and every targeting scan read, and the swelling is art
(`Renderer.beginScale`, one pivot applied to every part of a unit's
assembly as it goes into the batch).

And **the eating is a tax on salvage**. A devoured body is removed without
ever being killed, so it never touches `killsByKind` and pays no drop at
all, while the unit that ate it still drops exactly what its own kind
drops. Twenty meals cost twenty bodies' worth of salvage and hand back
one.

**Armored Swarms — 4 points.** Every unit of **tier 3 or below** spawns
with **+10 flat armour**; tier 4 and 5 take none, because a fortress and a
zenith already carry the plating that matters and hardening them further
would only make the run longer. Armour is a flat shave floored at a tenth
of the raw hit, so the rule is **regressive by calibre** on purpose: +10 is
nothing to a lancer's 140 and ×1.55 effective health against a salvo's 28,
but it floors a duo's 9 and a scatter pellet's 3 outright — those guns land
a tenth of what they print and no more. So it does not say "the swarm is
tougher", it says **"the cheap guns stop counting"**, and the answer to it
is calibre: bigger emplacements, and an anti-air line that is not built out
of pellets. It is priced as Heavy rather than Brutal because that answer
exists and is affordable — but rolled early, before the tree has anything
with weight behind it, it is the harshest 4 in the catalog.

This was the ladder's own **swarm armour** column until it became a rule
nobody chose (see above); ten is the old top-rung value, kept whole.

**Speedy — 5 points.** Every enemy walks in at **double speed** and
**cannot be slowed**. Two halves of one rule, because either alone has an
answer: doubled speed is answered by a liquid turret, and slow immunity is
answered by not building one. It adds no health at all — it halves the
time every emplacement on the board has to spend its damage in, which is
why it is the dearest thing in the catalog and why the audit arithmetic,
which counts bodies and health, sees nothing.

The immunity is to the **slow**, not to the status: a soaked unit is still
soaked, still tinted, still puts out a fire it is carrying, still takes
whatever the ammunition does (`Sim.applyWet` holds the soak at a
multiplier of 1). The speed is applied once at spawn, as a stat, so every
reader of `uspd` — the drive, the chassis turn rate, the leg cycle — is
already looking at the speed the unit really travels at.

### Authoring waves

Wave order is no longer a gate of any kind — every rung sends every wave, so
a wave's position only says how deep into the run it lands — but it says
which STAGE it lands in, and a stage is priced (see *Three stages, three
tiers*). Three things to hold in mind:

- **Armour is a permanent multiplier.** `max(dmg - armor, 0.1 * dmg)`, so
  a fortress costs a duo line ten times its printed health on every rung.
  A unit must not debut before the player can afford a turret
  out-damaging its armour. (Two exceptions to keep in mind: burning
  pierces armour entirely, and the lancer counts armour quadruple.)
- **Health per body is difficulty that pays back by tier, not by health.**
  A kill drops its tier's scrap whatever the body's health, so a wave of
  tier-3 bodies pays eight a head however hard they were. Padding a wave
  with tier-1 bodies is nearly free — cost and income rise together —
  which is why swarm waves can be as big as they look good.
- **A stage's income is its tier's budget.** Move heavy bodies earlier
  and stage 1 pays for tier-2 turrets; thin stage 3 and nobody fields a
  spectre. `check()` reports a stage that buys too few or too many of its
  tier (`STAGE_BOARDS`).

Two more the arithmetic can't see: **air** (hail, scorch, arc, lancer and
ripple cannot shoot up at all) and **crawler speed** (twice the line's pace,
so they arrive before the kill zone is done with them).

And one the map decides: **naval waves need water**. The ten hulls travel
the water layer — deep water is a road to them and a wall to everything
else, shallow water is shared with walkers — so a wave asking for rissos
sends nothing at all on a map with no water zones. Ships also carry
Mindustry's automatic naval wet-immunity, which makes wave and tsunami
useless against them; only the bryde (shield field) and the aegires (a
22.5-tile heal field, the widest support field in the game) bring an
ability across.

Check any edit from the console — dev builds also warn on load:

```js
__ladder.check()      // complaints; empty means the script is in line
__ladder.audit()      // per-rung waves, units, health, XP
__ladder.stages()     // the three stages against their tiers
__ladder.grind()      // the stage table and the XP ladder, printed
__ladder.wave(7, 2)   // what one authored wave weighs and pays
```

### Economy

- **Scrap prices are authored per turret** (`TOWER_PRICE` in
  `economy.ts`) against the stage income above, and bent from the balance
  dashboard (`scrapPriceOf` reads an override layer, saved under `prices`
  in `public/balance.json`). Within a tier the order follows Mindustry's
  build costs; the size is what the stage pays.
- **The XP bonus is linear** (`XP_STEP_PER_RUNG`, +50% a rung), because
  the fight no longer compounds: a compounding payout against flat health
  would make the top rung the only one worth playing.
- **Nothing in the run is free.** Sandbox and the editors (`tech` null on
  the sim) build for nothing and show no scrap; every campaign run is
  charged. There is no saved board any more — a board is bought from the
  opening stipend outward, every run.
- **The level curve** is `XP_LEVEL_BASE × level^XP_LEVEL_POWER` to the
  next level (5,000 × n^1.35). A full rung-1 clear pays the 100,000 XP
  pot and lands level 5; a wipe at the end of stage 1 (twenty waves
  cleared, ~27,800 XP) lands level 3.
