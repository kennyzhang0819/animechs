# MechSwarm

A tower-defense swarm game in Mindustry's clothes: fifty waves of up to
twenty thousand bodies, flow-field pathfinding for the whole horde, WebGL2
instanced rendering, and seventeen turrets (1×1 up to 4×4) that block
movement and reroute the swarm in real time — while the swarm shoots back
at them with Mindustry's own weapons.

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

- `game/constants.ts` — grid, base placement, tower tuning: every turret's
  stats read out of Mindustry's `Blocks.java` (`TOWERS`), the two dials
  over them (`TOWER_HP_SCALE`, 8; the phase tier's +30% up-gun on
  spectre, meltdown and foreshadow), `MAX_UNITS` (22,000) and the core's
  pool (`CORE_HP`, on a dial of its own). A placement is INSTANT — there
  is no construction shell any more
- `game/levels.ts` — unit stats and wave-script plumbing; the authored
  script itself (50 waves, a 15-second gap — `WAVE_GAP_DEFAULT`) lives in
  `public/levels/campaign.json`, loaded by `loadLevelDocs()`. Six unit
  families: ground, crawlers, ground support, air and the two **naval**
  lines, which travel on the water layer. The **family roll**
  (`rollFamilies`, `transformScript`) is what makes one run's swarm differ
  from the next's; `unitDrop` is what a kill pays
- `game/economy.ts` — **the economy**: scrap (in-run money — a kill drops
  a fifteenth of its own health, `SCRAP_PER_HP`, a boss `BOSS_SCRAP` on
  top; **nothing else pays anything** — no wave bonus, no passive
  trickle), XP (meta progress),
  the fixed mission pot and how it is dealt out per wave cleared
  (`MISSION_XP`, `waveXpShare`), **what one turret card costs**
  (`TURRET_ROLL_PRICE`, 1,000 flat — the run's one outgoing), the three
  price bands and
  what a draw in each is WORTH (`TOWER_PRICE` — no longer what a board
  spends), the sell refund (zero), the level curve and the random-map bonus
- `game/ladder.ts` — the **ten-rung ladder** (`RUNGS`: the count scale,
  the mutator roll and the XP bonus each; the enemy-level dial is wired
  and authored to zero), and the audit/check arithmetic over the authored
  script — the **stage table** (`stageAudit`) that the turret prices are
  tuned against
- `game/track.ts` — the **level track**: the fifteen-level roster phase —
  a fresh save owns three turrets (`STARTING_ROSTER`) and the track hands
  out one more a level (`UNLOCKS`) to a complete card at 15 — then the
  mutator phase, one rule a level; and `techStateFor(level)`, what a save
  at that level may do. The turret upgrade rungs are off the track for now
  (`UPGRADES_ON_TRACK`)
- `game/formation.ts` — **the second roll**: the twelve shapes a card can
  carry (`FORMATIONS`, 4 to 36 turrets), their bands read straight off the
  cell count (`formationRarity`), the deliberately soft odds between those
  bands (`FORMATION_WEIGHTS`), and the one piece of arithmetic the ghost
  and the placement share (`formationCells`). A formation's cells are
  counted in WHOLE TURRETS, so a quad of duos is 2×2 tiles and a quad of
  spectres is 8×8
- `game/rarity.ts` — **the deal**: every turret's rarity and its border
  colour (`TURRET_RARITY`, `RARITY` — greyish white, blue, amber, purple),
  the odds a draw is rolled against (`BASE_WEIGHTS`: 62 / 27 / 10 / **1**)
  and the roll itself (`rollTurret`, a rarity first and then a turret
  inside it, so a new turret never changes how often its rarity comes up)
- `game/tech.ts` — `TechState`, the shape the sim and the build menu read
  a save's allowances in, and the **command card** (`BUILD_SLOTS`, five
  rows of four, a key on every slot) — which is now the FREE board's door
  only: the sandbox and the editors keep it, a charged run deals instead
- `game/upgrades.ts` — the **turret upgrade branches**: a chain of rungs
  under every turret, folded into its live `TowerStats` — two stat steps, a
  one-shot ammunition swap, and an **ultimate** that changes what the
  turret is. **The track does not hand any of them out at the moment**, so
  every turret plays at its stock stats; the branches are intact and
  waiting
- `game/mutation.ts` — the **mutators**: the catalog of rules a run can be
  played under, what each is worth in points, and the roller that draws
  three or four of them to fit a difficulty's budget
- `game/progress.ts` — the save: lifetime XP, rungs cleared per world,
  game speed, HUD and control preferences. The level, and everything the
  track hands out at it, is derived from XP and never stored
- `game/storage.ts` — **where the save file lives**: one slot behind
  three calls, localStorage in a browser and a file on disk under the
  desktop shell (through the bridge `desktop/src/preload.ts` puts on
  `window`), and the display controls the Video tab of Settings drives
  over the same bridge
- `game/maps.ts` — map documents: terrain layers, spawn circles, the
  core's cell. **Every campaign map is 512x512 — twice Mindustry's Ground
  Zero — and is generated, never drawn**: `scripts/maps/<id>.mjs` is a few
  dozen numbers authored on the 256 board and handed to
  `scripts/maps/mindustry.mjs`, which scales them onto the big one and
  builds the map the way Mindustry's own generator does, refusing to
  write it while a check fails — see
  [docs/authoring-maps.md](docs/authoring-maps.md) and
  [docs/map-rules.md](docs/map-rules.md)
- `game/editor.ts` — the level/map editor model behind the admin views
- `game/terrain.ts` — terrain from a map document when one exists, else
  seeded value-noise worldgen
- `game/flowfield.ts` — grid occupancy + one Dijkstra pass seeded from
  every goal cell, refined by an eikonal sweep into a per-cell direction
  field; units sample it bilinearly (pathfinding is O(map), not O(units)).
  A turret's cells are **soft**: routed through at `STRUCTURE_COST`
  (Mindustry's own 70), so the field goes round a line when the way round
  is cheaper and into it when it is not, and the bodies pressed into it
  shoot it
- `game/sim.ts` — units in struct-of-arrays typed arrays, counting-sort
  spatial hash (separation + projectile hits), towers, projectiles,
  effects, the swarm's own weapons (`updateUnitWeapons`)
- `game/weapons.ts` — the swarm's arsenal: each unit's mounts, reloads,
  bullets and splash after `UnitTypes.java`, and every weapon's LOOK —
  sprite, size, colours, beam palette, what lands where it hits.
  `setUnitDamageScale` is the one dial over the swarm's bite
- `game/tiles.ts` — the ground tiles and the hill blocks, the game's own
  terrain art, painted at load on a 16-pixel grid; `npm run gen:tiles`
  writes the palette's PNGs into `public/tiles/`
- `game/atlas.ts` — the sprite atlas, composited at load time from
  Mindustry sprites in `public/mindustry/` plus procedural regions
- `game/renderer.ts` — WebGL2 instanced sprites: static terrain, shadow
  and wall batches, one dynamic batch in painter's order, and a shield
  pass. Water is a batch and a program of its own — Mindustry's
  `water.frag`, ported
- `game/game.ts` — rAF loop, input, 2d overlay (placement ghost, range
  rings, health bars, the focus mark), stats and the **minimap**
  (`drawMinimap`): the whole map at a cell a dot, never zoomed, the
  player's structures white, the swarm red, the viewport framed; a press
  looks there, a drag keeps steering
- `components/Deal.tsx` — **the field's bottom-right corner on a charged
  run**: the two buttons (Buy turret **T**, Buy upgrade **G** — the second
  not built yet) and the ONE card the first of them throws, drawn already
  in hand. It keeps no state of its own: the card IS what is in hand
  (`Game.buildKind` + `buildForm`), so the corner reads it off the HUD
- `components/MechSwarm.tsx` — React shell: HUD (scrap, XP), difficulty
  picker, the corner (the deal above, or — on a free board — StarCraft's
  command card, a fixed grid the size of the minimap, `BUILD_SLOTS`, one
  turret a slot with its key on it; the keys read row by row, Q E R T,
  F G H J, Z X C V, Y U I O, B N M P, dodging the digits and WASD) —
  game-speed switcher, results screens, canvases
- `components/MenuBackground.tsx` — the title screen's ground
- `app/globals.css` — **the kit**: `.ms-btn` / `.ms-pane` / `.ms-seg` /
  `.ms-bar` and their variants are Mindustry's nine-patch UI sprites
  written as CSS; every screen is built from these
- `components/Progress.tsx` — the **progress screen**: the track top to
  bottom, one row a level with what it hands out
- `components/Unlocks.tsx` — its **second tab**: every turret, shape, map
  and rule the track will ever hand out, on one page with a strip of
  filters over it, locked ones dimmed with the level that opens them. It
  replaced the mutator codex, which answered only the rules half of that
  and did it through a pannable camera left over from the old tech tree —
  the wrong instrument for a list read once and closed
- `components/LevelEditorView.tsx`, `MapEditorView.tsx`, `BalanceView.tsx` —
  the admin authoring surfaces
- `components/SandboxView.tsx` — the admin **Sandbox** tab, and the one
  door in the game where a mutator is CHOSEN rather than rolled: pick a
  world, a difficulty and any combination of rules, and deploy. It hands
  off as a query string onto the game page — `/?sandbox=1&world=…&tier=…&mut=…`
  — so the exact run that reproduced a bug is a URL you can paste into a
  report. The run starts in sandbox mode: whole card unlocked, nothing
  charged, every pace offered

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
| build | **T**, then left press on the ground. The draw comes out already in hand, so the flow is T, click, T, click. One card is one FORMATION, four to thirty-six turrets in a shape. On a free board (sandbox, editors) pick a turret on the command card instead, or its key, and drag to chain; **shift-drag for a straight line** |
| re-roll | **T** again — it throws the card in hand away and draws another, at full price. Spam it until the shape is the one you want |
| discard | right press while holding a card. No refund |
| demolish | right press, drag to chain |
| select a building | left click with no tool picked — its range ring shows; drag a box for a region; shift adds |
| select every like it nearby | ctrl-click or double-click (`SEL_LIKE_STRUCT_R`) |
| sell the selection | delete or backspace |
| focus fire | click an enemy body or a shield tower — every turret in range drops what it was doing for it |
| pan | middle drag, WASD/arrows, two-finger trackpad scroll |
| minimap | click to look there, drag to keep steering — bottom-left, never zoomed |
| zoom | wheel, trackpad pinch |
| pause / menu | space / esc, or the gear in the top-right corner |
| fullscreen | F11 (Ctrl+Cmd+F on macOS), in the desktop shell — or the Video tab of Settings |

The zoom floor is the whole map in frame with a little padding; the
ceiling is 12. **Pan speed** — one knob for the keys, `PAN_RATE` times the
setting, defaulting to 150% — lives on the Controls tab of Settings, saved
with the rest of the preferences. There is no edge panning.

There is **no pace strip on a campaign run**: the multipliers are the
sandbox's, and space pauses.

Settings is five tabs — **Game** (the save), **Video**, **Interface**,
**Controls**, **Info**. **The Interface tab** holds the UI-size slider and
**who wears a health bar on the field**, one knob a side: *always*,
*damaged* (the default), *hover* or *never*. It governs units and
buildings alike, the core included. The player's bars run the HUD's
green-amber-red ramp and the swarm's are red throughout. Both knobs are
saved and reach a run under way the moment they are touched.

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
| XP bonus | ×0.4 | ×0.6 | ×0.8 | ×1.0 | ×1.2 | ×1.4 | ×1.6 | ×1.8 | ×2.0 | ×2.2 |

**A rung scales the count, the mutator roll and the XP, and nothing
else.** Enemy level — Mindustry's ×1.06-a-level health curve — is still a
mechanism (`HP_PER_LEVEL`, `LevelSpec.enemyLevel`, the balance
dashboard's dial) and the ladder no longer turns it: every rung is
authored at level 0. Difficulty is rules, not hit points.

### The clock

**A wave lands every fifteen seconds** (`waveGap`, `WAVE_GAP_DEFAULT`),
from the first second of the run, each stronger than the last: a few
dozen daggers on wave 1, the first fortresses by wave 10, waves in the
thousands by the forties, and the Disrupt as the boss that closes the
script. The gap is shorter than a wave takes to walk the lane, so the
waves overlap and the field is a tide rather than a series of fights —
which is the whole reason the sim is built for 10,000 to 15,000 bodies at
once (`MAX_UNITS`, 22,000). The gap is the document's
(`public/levels/campaign.json`) and the level editor edits it.

### Two currencies that never touch

**Scrap is the run's money, and every bit of it comes off the swarm.**
Every run opens with `SCRAP_START` (7,500), and after that a kill drops
scrap **off its own health pool** — `SCRAP_PER_HP`, a fifteenth, which is
the ten scrap a 150-health dagger has always paid — with `BOSS_SCRAP`
(5,000) on top of a boss. **That is the whole of it.**

Staging a wave used to pay a bonus as well, 250 and 50 more each wave — so
500 by wave 5 and 2,750 by wave 50 — and it was passive income: a board
that killed nothing banked it anyway, for surviving the gap. It is gone.
**The bank moves when bodies fall and at no other time.** The core pays
nothing, nothing is mined, and selling returns nothing (`SELL_REFUND` is
0): a draw is spent. Nothing carries between runs. There is no gate inside
a run: whatever the save owns may come out of the deal from wave 1.

**Drops are fixed per kind.** A dagger always pays the same, on every
difficulty, on every map — it reads the AUTHORED health and never the
difficulty-scaled pool, or a full clear would pay differently on each one.
Scrap income is therefore a fact about the script, which is what lets the
roll fee be authored against it (the stage table below).

**XP is the save's progress, and it is paid for objectives, not kills.**
Every mission is worth the same fixed pot — `MISSION_XP`, 100,000 for a
full clear **at Nemesis** (the rungs below pay a share of it, the rungs
above a bonus) — and the pot is dealt out **one wave at a time as the
waves are cleared**. A wave is cleared when every body it sent is down
(`Sim.wavesCleared`), and it banks its share that moment. The shares ramp
linearly from wave 1 to the last (`WAVE_XP_RAMP`: the last wave pays three
times the first) and sum to exactly the pot, so wave 1 is worth 1% and
wave 50 is worth 3%. A run that dies keeps what it cleared; a win pays
the whole pot however the last wave ended. The rung multiplies it, and a
run on a **random map** — the menu's default — pays `RANDOM_MAP_XP_BONUS`
(a quarter) more on top. XP turns into **player level** through a
power-law curve (`xpToNext`), and **every level is a rung on the track**
(`game/track.ts`) that hands out a map, a turret or a mutator — nothing
is chosen and nothing is bought.

### The deal

**A turret is not bought, it is drawn.** The field's bottom-right corner
is two buttons — **Buy turret** (**T**) and **Buy upgrade** (**G**, not
built yet). Buy turret pays the roll fee, rolls both tables and **puts the
card straight into the hand**: the turret's sprite, its rarity's border,
the shape's diagram in the corner in the shape's own band colour.

**The fee is 1,000 flat** (`TURRET_ROLL_PRICE`), on every pool and at every
level — one number a player can hold in their head, and the one dial a
balance sweep turns. It was briefly derived from what the save's pool was
worth, and that stopped being worth the cleverness the moment a card
started carrying a formation: a draw is four to twenty-five turrets now, so
what it is worth swings by more with one roll than the pool's depth ever
moved it.

**The second roll is the FORMATION** (`game/formation.ts`), shown as a
diagram in the card's top-right corner. There is no single-turret shape:
the smallest thing the deal hands over is a quad of four and the largest a
bastion of twenty-five, and the cells are counted in whole turrets, so the
same quad is 2×2 tiles of duos or 8×8 tiles of spectres. The odds between
the six are flat on purpose — the rarity roll is where the tension is, and
what a player should feel at the button is *which gun* first and *how much
of it* second.

**Shapes have bands too**, the turrets' own four, worn on the same frames
— so one palette says "how good is this card" twice, once for the gun
(the border round the whole card) and once for the shape (the little frame
round the diagram). **The band is read straight off the cell count**
(`formationRarity`), which is the only honest measure of what a shape is
worth, and a shape edited to carry four more turrets changes band by
itself.

| formation | turrets | grid | band |
|---|---|---|---|
| Quad | 4 | 2×2 | Common |
| Cross | 5 | 3×3 plus | Common |
| Saltire | 5 | 3×3 X | Common |
| Block | 9 | 3×3 | Common |
| Wedge | 10 | 4×4 stair | Uncommon |
| Ring | 12 | hollow 4×4 | Uncommon |
| Snowflake | 13 | 5×5 cross with its inner diagonals filled | Uncommon |
| Grid | 16 | 4×4 | Uncommon |
| Octagon | 21 | 5×5 with its corners knocked off | Rare |
| Bastion | 25 | 5×5 | Rare |
| Rampart | 33 | 7×7 plus, three turrets thick | Ultra Rare |
| Citadel | 36 | 6×6 | Ultra Rare |

**Nothing is ever smaller than the quad** and nothing is a line — both are
checked at import. **The track deals shapes out like everything else**: a
save opens with the quad, the block and the grid (`STARTING_SHAPES` — three
solids, because the first thing to learn is that a card puts down a
*patch*, not a turret) and earns the other nine one a level through the
roster phase, smallest first.

Ground that takes **none** of the shape keeps the card in hand — walk it
somewhere it fits. Ground that takes **part** of it spends the card on the
part: the ghost drew every cell it was about to fill and reddened the ones
it could not, so that is a call the player made with the answer in front of
them. Click the card to pick it up, and the next left press on
the ground puts that turret down — **free**, finished, shooting. One card
is one turret; there is no chaining and no ruler on a dealt board.

**There is no hand and no clock.** One card exists at a time, it is drawn
already picked, and it stands until the ground takes it — **T, click, T,
click**. Pressing T again throws it away and draws another; the right
button throws it away for nothing. So a player who wants a bastion and
drew a quad presses T until they get one, at a thousand scrap a look:
**the spam is the mechanic**, and a discarded card is never refunded,
because a free re-roll would make the shape roll decorative. A placement
the ground refuses (red ghost) keeps the card in hand — walk it somewhere
it fits.

| rarity | border | turrets | odds |
|---|---|---|---|
| Common | greyish white | duo, hail, scatter, scorch, arc, wave | 62% |
| Uncommon | blue | salvo, lancer, parallax, ripple, fuse | 27% |
| Rare | amber | swarmer, cyclone, tsunami | 10% |
| Ultra Rare | purple | spectre, meltdown, foreshadow — every 4x4 | **1%** |

The rarities are authored (`TURRET_RARITY`) and fixed for the whole run;
the **weights are not** (`Game.setRarityWeights`), because shifting them
is what the upgrades being built will do. A rarity is rolled first and a
turret picked uniformly inside it, so adding a fourth purple would make
*which* purple less predictable and never make purples more likely. The
draw pool is exactly what the track has handed the save (`turretsAt`),
minus the retired kinds.

**The shape odds are the generous half of the same button**
(`FORMATION_WEIGHTS`: 40 / 30 / 20 / **10**) — an ultra shape about one
draw in ten against an ultra turret's one in a hundred. The turret roll is
where a run's tension lives, and odds as steep on both would invert what a
player feels at the button: *which gun* first, *how much of it* second.

### Three stages, three price bands

The roster is cut into three price bands along Mindustry's build-cost
order (`TOWER_TIER`), and the run into three stages (`STAGES`): waves
1–20, 21–35 and 36–50. Since the deal arrived these prices are no longer
what a board SPENDS — nothing is bought at them — they are **what a draw
in that band is worth**, which is the number the odds and the roll fee are
composed against. No band is held shut inside a run.

| stage | waves | tier | prices |
|---|---|---|---|
| 1 | 1–20 | duo, scorch, hail, arc, scatter, wave | 60–300 |
| 2 | 21–35 | swarmer, lancer, salvo, ripple, parallax, cyclone | 900–1,800 |
| 3 | 36–50 | fuse, tsunami, spectre, meltdown, foreshadow | 4,000–12,000 |

The stage table (`stageAudit`, on the balance dashboard) is where this is
checked against the script's drops; `check()` complains when a stage buys
too few or too many of its band (`STAGE_BOARDS`).

### The level track

**A fresh save owns four turrets** — the duo, the hail, the scatter and
the salvo (`STARTING_ROSTER` in `game/track.ts`) — and **every one of
levels 2 to 14 opens one more** (`UNLOCKS`), commons first, then the
blues, the ambers threaded through them, and the three purples last:
the spectre at 12, the meltdown at 13, the foreshadow at 14, when the
roster is complete. **The roster IS the draw pool** — the deal rolls over
exactly what the track has handed out, which is what makes a level-2 save
draw commons and a level-14 one draw anything. The levels between also
carry the maps. Past 14 there is nothing left to build, so a level hands
out a **rule** instead: one mutator a level, lightest first, into the deck
the deploy roll draws from. The progress screen lists the whole track,
every turret chip bordered in its rarity; the results screen names what a
climb handed out.

**The two menders are retired** (`RETIRED_KINDS` in `game/types.ts`): the
support pair is off the field while the deal is being built, implemented
and priced and dealt to nobody. Putting them back is deleting a name from
that list.

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

### The swarm shoots back

**Turrets stand on open ground, and the swarm attacks them.** Every unit
attack-moves, Mindustry's GroundAI: it walks the field toward the core and
every weapon it carries fires at the nearest structure within reach **and
in sight** on the way — a walker cannot shoot through a hill
(`Sim.hasSight`), so a turret behind a ridge is one the swarm has to come
round before it can answer; a flyer is looking down and sees its whole
radius. Every weapon plays `UnitTypes.java` as written, with the look —
bullets, missiles, shells, beams, bolts, flames, saps, fields and bombs —
read off the bullet classes 1:1; a crawler is its own bomb. The swarm is
Mindustry's crux team: every unit wears its `-cell` region in crux red.

A turret's cells are solid to the body but **passable to the path at a
cost** (`STRUCTURE_COST`): the field routes around a line when the way
round is cheaper and into it when it is not, and the bodies pressed into
it shoot it. So a turret across the lane is not a seal, it is a fight at
the turret. **There are no walls**, and the pool they used to hold is in
the guns: every turret carries **eight** times its Mindustry block health
(`TOWER_HP_SCALE`, doubled for the deal — what goes down is what the roll
handed over, so a structure has to survive its mistake rather than be
replaced out of it), and the phase tier fires 30% over stock; hurt, a
turret greys and smokes like a unit; at zero it is wrecked and gone, its
ground open again. **The swarm's bite against a structure is Mindustry's
own number** (`setUnitDamageScale` in `game/weapons.ts`, at 1), and the
balance is done on the player's side: the turrets' pool, the prices and
the drops. The playtest takes the dial as `--unit-damage` for a sweep. **A placement
is finished the instant it lands** — full pool, gun live, no construction
shell: the card it came off was already paid for, and a timer between the
click and the gun was a second tax on a decision already made. The balance
pass is done on the two dials and never row by row.

**Every map is checked headless.** `npm run playtest -- --world <id>`
runs the real sim with an ordinary builder bot at the keyboard (route
coverage from a dry run, the stage's tier bought round-robin, never a
sale, never a rebuild) and reports where it gets to. Run it after any
wave, price, weapon, mutator or unit edit.

### The core

**The core is the run.** It stands where the map's base does, it carries
`CORE_HP` (Mindustry's nucleus at a dial of its own, `CORE_HP_SCALE`, for
24,000 — it did not move when the turrets' dial doubled, because how long
the core holds is every map's pacing at once),
and the swarm exists to knock it down: every unit paths to it, presses
against it and fires (`Sim.coreGoal`), flyers hover over its edge and
shoot, hulls park on the nearest water and shoot from the shore. **Each of
the three layers has its own field.** The walkers' is over rock and
structures, the hulls' over everything that is not water, and the flyers'
over the hills alone. **When the core falls the run is lost**, whatever
else is standing. **A map is sealed**: there are no exit cells and no open
edge; the rim is rock, the swarm's only way out is through the core.

### Mutators

Every deploy above Nemesis is played under **mutators** — rules that
change what happens to a wave after it lands. **Nobody picks them.** The
**difficulty decides the budget and the count**, and that many rules are
rolled to fit it when you deploy. It is the StarCraft II model, and the
mode it exists for is endgame resource farming: the same fifty waves, a
different set of rules every time. The catalog (`game/mutation.ts`):
Overshields, Shield Towers, Hungry, Speedy, Volatile, Armored Swarms,
Mitosis, Hydrophobic, Amphibious — the Unlocks board on the progress
screen says what each does, and the sandbox is the one place they are
chosen by hand.
